import access_guard  # noqa: F401  (installs the no-original-access guard first)

import unittest

from debugger import (Debugger, DebuggerPort, code_locations, data_rows, output_lines, parse_breakpoint_list,
                      parse_cpu, parse_registers, parse_selector, physical_lookup)
from fake_debugger import CODE_SITE, FakeClock, FakeDebugger, FakeTransport
from qualify import ReadBudget
from reasons import BaselineError
from screen import Screen
from synthetic import BASES


class NullLog:
    def output(self, data):
        pass

    def command(self, text):
        pass


def screen_lines(fake):
    screen = Screen()
    screen.feed(fake.take())
    return screen.lines()


class ScreenTests(unittest.TestCase):
    def test_cursor_erase_and_split_sequences(self):
        screen = Screen(5, 20)
        screen.feed(b"\x1b[2J\x1b[2;3Hab")
        screen.feed(b"c\x1b[")  # split CSI
        screen.feed(b"1;1Hxyz\x1b[3;1H123456\x1b[3;3H\x1b[K")
        self.assertEqual(screen.lines()[:3], ["xyz", "  abc", "12"])
        self.assertEqual(screen.clears, 1)
        screen.feed(b"\x1b]0;title\x07\x1b(B\xe9\x1b[5;1Hend")
        self.assertEqual(screen.lines()[2], "12?")  # OSC and charset designation consumed; Latin-1 shown as ?
        self.assertEqual(screen.lines()[4], "end")
        self.assertTrue(screen.lines()[0].startswith("xyz"))

    def test_scroll_region_and_line_editing(self):
        screen = Screen(5, 10)
        screen.feed(b"\x1b[1;1Ha\r\nb\r\nc\r\nd\r\ne")
        screen.feed(b"\x1b[2;4r\x1b[4;1H\nX")  # LF at the bottom margin scrolls only the region
        self.assertEqual(screen.lines(), ["a", "c", "d", "X", "e"])
        screen.feed(b"\x1b[2;1H\x1b[L")
        self.assertEqual(screen.lines(), ["a", "", "c", "d", "e"])
        screen.feed(b"\x1b[1;1H\x1b[1Pz\x1b[2@")
        self.assertEqual(screen.lines()[0], "z")


class ParserTests(unittest.TestCase):
    def setUp(self):
        self.fake = FakeDebugger()
        self.fake.take()

    def lines(self):
        self.fake.render()
        return screen_lines(self.fake)

    def test_registers_from_the_register_pane_only(self):
        self.fake.mode, self.fake.cs, self.fake.eip = "Pr32", 0x258, CODE_SITE
        lines = self.lines()
        registers = parse_registers(lines)
        self.assertEqual((registers.cs, registers.eip, registers.mode), (0x258, CODE_SITE, "Pr32"))
        self.assertEqual(registers.values["DS"], 0x260)
        self.assertIsInstance(registers.emulated_ms, float)
        self.assertIn((0x258, CODE_SITE), code_locations(lines))
        injected = lines[:1] + ["junk"] * 6 + lines[7:]  # the pane is gone; register-like text elsewhere is ignored
        injected[9] = "     00001000 45 49 50 3D 00 00 00 00 00 00 00 00 00 00 00 00  EIP=12345678 CS=0001"
        with self.assertRaises(BaselineError) as caught:
            parse_registers(injected)
        self.assertEqual(caught.exception.code, "debugger-unparsed")

    def test_data_rows_faults_and_physical_lookup(self):
        address = BASES[4] + 0xFF8
        self.fake.process.faults.add((address + 0x10) // 4096)
        self.fake.data_view = address
        lines = self.lines()
        rows = data_rows(lines)
        self.assertEqual(sorted(rows), [address + 16 * row for row in range(7)])
        self.assertIsNotNone(rows[address][0])
        self.assertIsNone(rows[address + 16][15])  # fault marker: unknown, never zero
        self.assertEqual(physical_lookup(lines, address) % 4096, address % 4096)
        self.assertIsNone(physical_lookup(lines, address + 1))  # page offset must be preserved
        unreadable = [line.replace(line.split("PHY=")[1][:8], "XXXXXXXX") if "PHY=" in line else line
                      for line in lines]
        self.assertIsNone(physical_lookup(unreadable, address))
        doubled = [line + "  PHY=00001000" if "PHY=" in line else line for line in lines]
        self.assertIsNone(physical_lookup(doubled, address))

    def test_output_area_and_responses(self):
        self.fake.log += ["Output from a log line", "SelectorInfo CS:", "CS: b:00001000 type:1A parbg",
                          "    l:0000FFFF dpl : 0 10011", "cr0:80000011 cr2:00000000 cr3:00123000  cpl=0",
                          "eflags:00020202 [vm=1 iopl=0 nt=0]"]
        output = [line for line in output_lines(self.lines()) if line]
        self.assertEqual(output[-1], "eflags:00020202 [vm=1 iopl=0 nt=0]")
        selector = parse_selector(output, "CS")
        self.assertEqual((selector.base, selector.limit, selector.flat32_code), (0x1000, 0xFFFF, True))
        cpu = parse_cpu(output)
        self.assertEqual(cpu.cr3, 0x123000)
        self.assertFalse(cpu.protected_paged)  # VM86
        for parser, args in ((parse_selector, ("DS",)), (parse_cpu, ())):
            with self.assertRaises(BaselineError):
                parser(output[:1], *args)
        with self.assertRaises(BaselineError):
            output_lines(["no headers"] * 5)

    def test_breakpoint_list(self):
        rule = "-" * 73
        self.assertEqual(parse_breakpoint_list(["Breakpoint list:", rule]), [])
        self.assertEqual(parse_breakpoint_list(["old", "Breakpoint list:", rule, "00. BP 0258:10032F90",
                                                "01. BP 0258:1000"]), [(0x258, 0x10032F90), (0x258, 0x1000)])
        for broken in (["00. BP 0258:1000"], ["Breakpoint list:", "00. BP 0258:1000"],
                       ["Breakpoint list:", rule, "01. BP 0258:1000"],
                       ["Breakpoint list:", rule, "00. BPMEM 0258:1000 (00)"]):
            self.assertIsNone(parse_breakpoint_list(broken))


class PortTests(unittest.TestCase):
    def setUp(self):
        self.clock = FakeClock()
        self.fake = FakeDebugger({"vrt": ["site"]})
        self.transport = FakeTransport(self.fake, self.clock)
        self.debugger = Debugger(self.transport, Screen(), self.clock, 30, self.clock() + 600, NullLog())
        self.debugger.wait_registers()
        self.budget = ReadBudget(1 << 20)
        self.port = DebuggerPort(self.debugger, 4242, self.budget)

    def test_reads_across_pages_with_lookups(self):
        linear = BASES[4] + 0xFF0
        result = self.port.read(linear, 40)
        self.assertEqual(bytes(result.data), self.fake.process.peek(linear, 40))
        self.assertEqual(set(result.pages), {linear // 4096, linear // 4096 + 1})
        self.assertEqual(result.pages[linear // 4096], self.fake.process.lookup(linear // 4096))
        used = self.budget.used
        state = self.port.state({linear // 4096})
        self.assertEqual(state.owner, "pid:4242/cr3:00100000")
        self.assertEqual(self.budget.used, used + DebuggerPort.PAGE_LOOKUP_BYTES)

    def test_faults_and_short_views(self):
        linear = BASES[4] + 0x2000
        self.fake.process.faults.add(linear // 4096)
        result = self.port.read(linear, 4)
        self.assertEqual(result.data, (None,) * 4)
        self.assertEqual(result.pages, {})
        self.fake.scenario["dv_rows"] = {linear + 0x100: 0}
        self.assertEqual(self.port.read(linear + 0x100, 4).data, ())

    def test_memory_writes_are_acknowledged(self):
        linear = BASES[4] + 0x900
        self.debugger.write_memory(linear, b"\xaf\xcf\xdf")  # bytes that read like flag names unprefixed
        self.assertEqual(self.fake.process.peek(linear, 3), b"\xaf\xcf\xdf")
        self.assertIn(f"SMV 0{linear:08X} 0AF 0CF 0DF\n".encode(), self.transport.writes)
        self.fake.scenario["smv_ack"] = False
        with self.assertRaises(BaselineError) as caught:
            self.debugger.write_memory(linear, b"\x01")
        self.assertEqual((caught.exception.code, caught.exception.where),
                         ("stimulus-unverified", "write-unacknowledged"))
        for linear, data in ((linear, b""), (linear, bytes(17)), (0xFFFFFFFF, b"\x01\x02")):
            with self.assertRaises(BaselineError) as caught:
                self.debugger.write_memory(linear, data)
            self.assertEqual(caught.exception.code, "stimulus-rejected")

    def test_breakpoint_registration_and_stop(self):
        self.debugger.run_until_stop("VRT", 5)
        registration = self.debugger.arm(0x258, CODE_SITE + 0x10)
        self.assertEqual(registration["listed"], [f"0258:{CODE_SITE + 0x10:08x}"])
        stops = self.debugger.stops
        self.debugger.run_until_stop("RUN", 5)
        self.assertEqual(self.debugger.stops, stops + 1)
        registers = self.debugger.fresh_registers()
        self.assertEqual(registers.eip, CODE_SITE + 0x10)
        self.debugger.clear_breakpoints()
        self.assertEqual(self.debugger.breakpoint_list(), [])


    def test_alternative_breakpoints(self):
        self.debugger.run_until_stop("VRT", 5)
        self.fake.scenario["hits"] = [{"site": 1, "registers": {"EBX": 0x1234}}]
        offsets = (CODE_SITE + 0x10, CODE_SITE + 0x20)
        registers, proof = self.debugger.run_to_breakpoint(0x258, offsets, 5)
        self.assertEqual((registers.eip, registers.values["EBX"]), (CODE_SITE + 0x20, 0x1234))
        registration = proof["registration"]
        self.assertEqual(registration["offsets"], [f"{offset:08x}" for offset in offsets])
        self.assertNotIn("offset", registration)
        self.assertEqual(sorted(registration["listed"]), [f"0258:{offset:08x}" for offset in offsets])
        self.assertEqual(self.debugger.breakpoint_list(), [])
        self.assertEqual(sum(write.startswith(b"BP ") for write in self.transport.writes), 2)
        self.fake.scenario["bp_list_extra"] = [(0x258, CODE_SITE)]  # the native list must hold exactly the set
        with self.assertRaises(BaselineError) as caught:
            self.debugger.arm(0x258, offsets)
        self.assertEqual(caught.exception.code, "breakpoint-unconfirmed")
        self.fake.scenario.pop("bp_list_extra")
        self.fake.scenario["run"] = "wrong"
        with self.assertRaises(BaselineError) as caught:
            self.debugger.run_to_breakpoint(0x258, offsets, 5)
        self.assertEqual(caught.exception.code, "breakpoint-wrong-hit")

if __name__ == "__main__":
    unittest.main()
