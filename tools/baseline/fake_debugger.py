"""A synthetic DOSBox-X debugger for the baseline tool's tests (no emulator, no original data).

`FakeDebugger` answers the commands the session sends (VRT, RUN, DV, SMV, CPU, SELINFO, BP, BPDEL, BPLIST) with
full-screen redraws in the installed debugger's layout: register pane, data view with pf fault markers and a PHY
footer, code view, output area and input line. Its memory is a `synthetic.FakeProcess` holding a code-generated LE
image at per-object bases. `FakeTransport` serves it in-process on a virtual clock; running this module as a script
serves it on its own terminal (a real PTY) in real time, so process launch, ownership and reclaim can be tested end to
end. Scenario knobs inject the failures the tests need; `hits` scripts the breakpoint hits in order (each
{"site": index into the armed breakpoints, "registers": {name: value}}; hits past the list stop at the first one).
"""
import json
import os
import select
import signal
import sys
import termios
import time
import tty

from debugger import DV_ROWS
from le_image import PAGE_SIZE
from reasons import BaselineError
from screen import ROWS
from synthetic import BASES, CODE_WINDOW, scenario_process

SEL_CS, SEL_DS = 0x0258, 0x0260
CODE_SITE = BASES[CODE_WINDOW[0]] + CODE_WINDOW[1]
REAL = ("Real", 0xF000, 0xFFF0)


class FakeClock:
    def __init__(self):
        self.now = 1000.0

    def __call__(self):
        return self.now

    def sleep(self, seconds):
        self.now += max(seconds, 0.001)


class FakeDebugger:
    """Debugger state machine; `now` is supplied by the transport (virtual or real time)."""

    def __init__(self, scenario=None, process=None):
        self.scenario = dict(scenario or {})
        self.process = process or scenario_process()
        self.out = bytearray()
        self.pending = b""
        self.log = []
        self.breakpoints = []
        self.running = False
        self.stop_at = None
        self.stop_kind = None
        self.vrt_count = 0
        self.hit_count = 0
        self.mode, self.cs, self.eip = REAL
        self.data_view = 0
        self.commands = 0
        self.cr3 = 0x00100000
        self.exited = False
        self.registers = {"EAX": 0, "EBX": 0x63, "ECX": 2, "EDX": 0x3DA, "ESI": 0xB0, "EDI": 0, "EBP": 0x2000,
                          "ESP": 0x1FF0}
        self.hide_registers = set()  # general registers the register pane leaves unreadable
        self.pfi = 100.0
        self.render()

    # -- input ---------------------------------------------------------------------------------------------------------
    def write(self, data, now):
        self.pending += data
        self.process_input(now)

    def process_input(self, now):
        while not self.running and not self.exited and b"\n" in self.pending:
            line, self.pending = self.pending.split(b"\n", 1)
            self.command(line.decode("ascii").strip(), now)

    def tick(self, now):
        if self.running and self.stop_at is not None and now >= self.stop_at:
            self.stop(now)
            self.process_input(now)

    # -- commands ------------------------------------------------------------------------------------------------------
    def command(self, text, now):
        self.commands += 1
        hook = self.scenario.get("on_command")
        if hook:
            hook(self, text)
        if self.exited:
            return
        words = text.split()
        name = words[0].upper() if words else ""
        if name in ("VRT", "RUN"):
            self.start(name, now)
            return
        if name == "DV":
            self.data_view = int(words[1], 16)
            self.log.append(f"DEBUG: Set data overview to 0000:{self.data_view:04X}")
        elif name == "SMV":
            address, values = int(words[1], 16), [int(word, 16) for word in words[2:]]
            for at, value in enumerate(values):
                linear = address + at
                if linear // PAGE_SIZE not in self.process.faults and not self.scenario.get("smv_drop"):
                    self.process.poke(linear, bytes((value,)))  # a faulting write is lost but still counted
            if self.scenario.get("smv_ack", True):
                self.log.append(f"DEBUG: Memory changed ({len(values)} bytes)")
        elif name == "CPU":
            protected = self.mode != "Real"
            cr0 = 0x80000011 if protected else 0x00000010
            self.log += [f"cr0:{cr0:08X} cr2:00000000 cr3:{self.cr3:08X}  cpl=0",
                         f"eflags:{0x20202 if self.mode == 'VM86' else 0x202:08X} [vm=0 iopl=0 nt=0]",
                         "GDT base=00011000 limit=000007FF", "IDT base=00012000 limit=000007FF"]
        elif name == "SELINFO":
            which = words[1].upper()
            kind = "1A" if which == "CS" else "12"
            flags = self.scenario.get("selector_flags", "10011")
            limit = self.scenario.get("ds_limit", 0xFFFFFFFF) if which == "DS" else 0xFFFFFFFF
            self.log += [f"SelectorInfo {which}:", f"{which}: b:00000000 type:{kind} parbg",
                         f"    l:{limit:08X} dpl : 0 {flags}"]
        elif name == "BP":
            selector, offset = (int(part, 16) for part in words[1].split(":"))
            self.breakpoints.append((selector, offset))
            if self.scenario.get("bp_ack", True):
                shown = self.scenario.get("bp_ack_offset", offset)
                self.log.append(f"DEBUG: Set breakpoint at {selector:04X}:{shown:04X}")
        elif name == "BPDEL":
            if words[1:] == ["*"]:
                self.breakpoints = []
                self.log.append("DEBUG: Breakpoints deleted.")
        elif name == "BPLIST":
            listed = self.breakpoints + list(self.scenario.get("bp_list_extra", ()))
            self.log += ["Breakpoint list:", "-" * 73] + [f"{i:02X}. BP {s:04X}:{o:04X}"
                                                          for i, (s, o) in enumerate(sorted(listed, reverse=True))]
        elif name:
            self.log.append(f"DEBUG: unknown command {name}")
        self.render()

    def start(self, name, now):
        self.running = True
        if name == "VRT":
            self.stop_kind = "vrt"
            limit = self.scenario.get("vrt_limit")
            self.stop_at = None if limit is not None and self.vrt_count >= limit else now + 0.014
        else:
            plan = self.scenario.get("run", "hit")
            self.stop_kind = plan
            self.stop_at = None if plan == "never" else now + self.scenario.get("run_delay", 0.2)
        self.render()

    def stop(self, now):
        kind = self.stop_kind
        self.running = False
        self.stop_at = None
        self.pfi += 14.3
        if kind == "vrt":
            self.vrt_count += 1
            plan = self.scenario.get("vrt", ["real", "real", "site"])
            step = plan[min(self.vrt_count - 1, len(plan) - 1)]
            if step == "real":
                self.mode, self.cs, self.eip = REAL
            elif step == "vm86":
                self.mode, self.cs, self.eip = "VM86", SEL_CS, CODE_SITE
            else:
                self.mode, self.cs = "Pr32", SEL_CS
                self.eip = CODE_SITE if step == "site" else int(step)
        elif kind == "hit":
            armed = [offset for selector, offset in self.breakpoints if selector == SEL_CS]
            hits = self.scenario.get("hits", ())
            hit = hits[self.hit_count] if self.hit_count < len(hits) else {}
            self.hit_count += 1
            self.registers.update(hit.get("registers", {}))
            self.mode, self.cs = "Pr32", SEL_CS
            self.eip = armed[hit.get("site", 0)] if armed else CODE_SITE
        elif kind == "wrong":
            self.mode, self.cs, self.eip = "Pr32", SEL_CS, CODE_SITE + 0x40
        self.pending = b""  # the debugger discards typed-ahead input on re-entry
        self.render()

    # -- screen --------------------------------------------------------------------------------------------------------
    def rows(self):
        rows = [""] * ROWS
        r = self.registers
        rows[0] = "---(Register Overview                   )---"
        rows[1] = (f"EAX={r['EAX']:08X}  ESI={r['ESI']:08X}  DS={SEL_DS:04X}   ES={SEL_DS:04X}   FS=0000   "
                   f"GS={SEL_DS:04X}   SS={SEL_DS:04X} {self.mode}")
        rows[2] = (f"EBX={r['EBX']:08X}  EDI={r['EDI']:08X}  CS={self.cs:04X}   EIP={self.eip:08X}  "
                   "C0 Z1 S0 O0 A0 P1 D0 I1 T0")
        rows[3] = f"ECX={r['ECX']:08X}  EBP={r['EBP']:08X}  ss: b:00000000 type:12 parbg    PAGE  IOPL0  CPL0"
        rows[4] = f"EDX={r['EDX']:08X}  ESP={r['ESP']:08X}      l:FFFFFFFF dpl : 0 10011    cc={self.commands:<8d} RUN"
        rows[5] = f"ST0=00000.00  ST1=00000.00  ST2=00000.00  ST3=00000.00      pfi={self.pfi:.9f}"
        for name in self.hide_registers:
            rows[1:5] = [row.replace(f"{name}={r[name]:08X}", f"{name}=--------") for row in rows[1:5]]
        rows[7] = "---(Data view (virtual)                 )---"
        shown = self.scenario.get("dv_rows", {}).get(self.data_view, DV_ROWS)
        for row in range(shown):
            address = self.data_view + row * 16
            tokens = []
            for i in range(16):
                linear = (address + i) & 0xFFFFFFFF
                if linear // PAGE_SIZE in self.process.faults:
                    tokens.append("pf")
                else:
                    tokens.append(f"{self.process.peek(linear, 1)[0]:02X}")
            rows[8 + row] = f"     {address & 0xFFFFFFFF:08X} " + " ".join(tokens) + "  " + "." * 16
        first = self.data_view & 0xFFFFFFFF
        if first // PAGE_SIZE in self.process.faults:
            rows[15] = "              PHY=XXXXXXXX"
        else:
            physical = self.process.lookup(first // PAGE_SIZE) * PAGE_SIZE + first % PAGE_SIZE
            rows[15] = f"              PHY={physical & 0xFFFFFFFF:08X}"
        rows[16] = "---(Code Overview   Scroll: up/down     )---"
        listed = self.eip if not self.scenario.get("code_view_off") else self.eip + 1
        for i in range(8):
            rows[17 + i] = f"{self.cs:04X}:{listed + i:08X} 90                  nop"
        rows[27] = "---(Output          Scroll: home/end    )---"
        for i, line in enumerate(self.log[-21:]):
            rows[28 + i] = line
        rows[49] = "(Running)" if self.running else "I-> _"
        if self.scenario.get("garbled"):
            rows = ["#" * 40] * ROWS
        return rows

    def render(self):
        rows = self.rows()
        self.out += ("\x1b[2J\x1b[H" + "\r\n".join(row.rstrip() for row in rows)).encode("latin-1")

    def take(self):
        data, self.out = bytes(self.out), bytearray()
        return data


class FakeTransport:
    """In-process transport on a virtual clock, with the PtyTransport interface."""

    def __init__(self, debugger, clock, pid=4242, reclaim_passes=True):
        self.debugger = debugger
        self.clock = clock
        self.pid = pid
        self.reclaim_passes = reclaim_passes
        self.reclaimed = []
        self.writes = []

    def write(self, data):
        if self.debugger.exited:
            raise BaselineError("child-exited", "emulator")
        self.writes.append(bytes(data))
        self.debugger.write(bytes(data), self.clock())

    def read(self, timeout):
        interrupt = self.debugger.scenario.get("interrupt_after")
        if interrupt is not None and self.debugger.commands >= interrupt:
            raise KeyboardInterrupt()
        if self.debugger.exited:
            raise BaselineError("child-exited", "emulator")
        self.debugger.tick(self.clock())
        data = self.debugger.take()
        if data:
            return data
        self.clock.sleep(timeout)
        self.debugger.tick(self.clock())
        return self.debugger.take()

    def poll(self):
        return 1 if self.debugger.exited else None

    def verify_owner(self, name, clock, sleep):
        return {"pid": self.pid, "processGroup": self.pid, "executable": name, "spawnedByThisRun": True}

    def reclaim(self, grace=None):
        self.reclaimed.append(grace)
        return {"pid": self.pid, "signals": ["SIGTERM"], "reaped": self.reclaim_passes,
                "pidGone": self.reclaim_passes, "groupGone": self.reclaim_passes, "passed": self.reclaim_passes}


# -- subprocess entry: serve the fake on this process's terminal ----------------------------------------------------
def serve(arguments):
    import access_guard  # noqa: F401  (the served fake never reads local/ or original files either)
    options = {}
    if "--scenario" in arguments:
        with open(arguments[arguments.index("--scenario") + 1], encoding="utf-8") as stream:
            options = json.load(stream)
    if options.get("ignore_term"):
        signal.signal(signal.SIGTERM, signal.SIG_IGN)
    # Readiness: the first screen (rendered by the constructor) is written only after the scenario's signal
    # handling above is installed, so a reader that has seen any output knows it is in effect.
    exit_after = options.pop("exit_after", None)
    fake = FakeDebugger(options)
    descriptor = sys.stdin.fileno()
    if os.isatty(descriptor):
        tty.setraw(descriptor, termios.TCSANOW)
    out = sys.stdout.buffer
    while True:
        fake.tick(time.monotonic())
        data = fake.take()
        if data:
            out.write(data)
            out.flush()
        ready, _, _ = select.select([descriptor], [], [], 0.01)
        if ready:
            chunk = os.read(descriptor, 4096)
            if not chunk:
                return 0
            fake.write(chunk, time.monotonic())
        if exit_after is not None and fake.commands >= exit_after:
            return 0


if __name__ == "__main__":
    sys.exit(serve(sys.argv[1:]))
