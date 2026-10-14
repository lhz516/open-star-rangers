"""DOSBox-X debugger session over the owned emulator's PTY (P3-01 subtask 02).

The installed debugger is a curses screen: a register pane, a data view, a code view, an output area and an input
line. `Debugger` feeds the PTY output into a `Screen`, tracks running/prompt transitions of the input line (each
running -> prompt transition is one stop) and sends one command at a time. Every command is followed by a unique
data-view marker whose acknowledgement proves that the command was processed; the command's response is the output
area between the previous and the new marker. Every wait is bounded by the recipe's single-wait limit and the run's
deadline. Debugger output is logged only into the private run directory, within the recipe's log budget.

`DebuggerPort` implements the paused-process port that `qualify.collect_pause` reads through.
"""
import re
from dataclasses import dataclass

from le_image import PAGE_SIZE
from qualify import PageState, ReadResult
from reasons import BaselineError

DV_ROWS = 7
ROW_BYTES = 16
MARKER_BASE = 0xFFFF0000
MARKER_SLOTS = 4096
MAX_WRITE = 16  # bytes per SMV command
SETTLE_QUIET = 0.05
SETTLE_LIMIT = 1.0
STEP = 0.02

_SPLIT = re.compile(rb"(\x1b\[[0-9;?<=>]*[ -/]*[@-~]|\r|\n)")
_PROMPT = re.compile(r"^[IO]->\s*_?\s*$")
_RUNNING = "(Running)"
_PAGER = re.compile(r"Paged content", re.I)
_DATA_HEADER = re.compile(r"^[-o=(~_ ]{3,}\(?Data (?:view|Overview)")
_CODE_HEADER = re.compile(r"^[-o=(~_ ]{3,}\(?Code Overview")
_OUTPUT_HEADER = re.compile(r"^[-o=(~_ ]{3,}\(?Out[Pp]ut")
_REGISTER = re.compile(r"\b(EAX|EBX|ECX|EDX|ESI|EDI|EBP|ESP|EIP)=([0-9A-Fa-f]{8})\b")
_SEGMENT = re.compile(r"\b(CS|DS|ES|FS|GS|SS)=([0-9A-Fa-f]{4})\b")
_MODE = re.compile(r"\b(Pr32|Pr16|VM86|Real)\b")
_PFI = re.compile(r"\bpfi=([0-9]+(?:\.[0-9]+)?)")
_CYCLES = re.compile(r"\bcc=([0-9]+)")
_CODE_LINE = re.compile(r"^([0-9A-Fa-f]{4}):([0-9A-Fa-f]{8}) ")
_DV_ACK = re.compile(r"Set data overview to 0000:([0-9A-Fa-f]{4,8})\b")
_BP_ACK = re.compile(r"Set breakpoint at ([0-9A-Fa-f]{4}):([0-9A-Fa-f]{4,8})\b")
_BP_ROW = re.compile(r"^([0-9A-Fa-f]{2})\. BP ([0-9A-Fa-f]{4}):([0-9A-Fa-f]{4,8})$")
_DV_ROW = re.compile(r"^ {5}([0-9A-Fa-f]{8}) ((?:(?:[0-9A-Fa-f]{2}|pf|na) ){15}(?:[0-9A-Fa-f]{2}|pf|na))(?= |$)")
_PHY = re.compile(r"PHY=([0-9A-Fa-f]{8}|X{8})\b")
_PREFIX = re.compile(r"^\s*(?:(?:LOG|DEBUG):\s*)+")
_CPU = re.compile(r"cr0:([0-9A-Fa-f]{8}) cr2:([0-9A-Fa-f]{8}) cr3:([0-9A-Fa-f]{8})")
_EFLAGS = re.compile(r"eflags:([0-9A-Fa-f]{8})\b")
_MEMORY_ACK = re.compile(r"^Memory changed \(([0-9]+) bytes\)$")


@dataclass(frozen=True)
class Registers:
    values: dict  # register/segment name -> int
    mode: str  # Pr32, Pr16, VM86 or Real
    emulated_ms: object  # the pane's pfi value (emulated time in ms) or None
    cycle_count: object

    @property
    def cs(self):
        return self.values["CS"]

    @property
    def eip(self):
        return self.values["EIP"]

    def to_json(self):
        result = {name: f"{value:08x}" for name, value in sorted(self.values.items())}
        result.update(mode=self.mode, emulatedMs=self.emulated_ms, cycleCount=self.cycle_count)
        return result


@dataclass(frozen=True)
class Descriptor:
    name: str
    base: int
    limit: int
    type: int
    flags: str  # present, avl, readable/writable, big, granular

    @property
    def flat32_code(self):
        return self.flags[0] == "1" and self.flags[3] == "1" and bool(self.type & 0x8)

    @property
    def flat32_data(self):
        return self.flags[0] == "1" and self.flags[3] == "1" and not self.type & 0x8

    def to_json(self):
        return {"base": f"{self.base:08x}", "limit": f"{self.limit:08x}", "type": f"{self.type:02x}",
                "flags": self.flags}


@dataclass(frozen=True)
class CpuState:
    cr0: int
    cr3: int
    eflags: int

    @property
    def protected_paged(self):
        return bool(self.cr0 & 1) and bool(self.cr0 & 0x80000000) and not self.eflags & 0x20000

    def to_json(self):
        return {"cr0": f"{self.cr0:08x}", "cr3": f"{self.cr3:08x}", "eflags": f"{self.eflags:08x}",
                "protectedPaged": self.protected_paged}


# -- screen parsers (pure) --------------------------------------------------------------------------------------------
def _section(lines, header, end_headers):
    """Lines after the first row matching `header` up to the next section header."""
    for index, line in enumerate(lines):
        if header.search(line):
            rest = lines[index + 1:]
            for offset, other in enumerate(rest):
                if any(pattern.search(other) for pattern in end_headers):
                    return rest[:offset]
            return rest
    return None


def register_pane(lines):
    for index, line in enumerate(lines):
        if _DATA_HEADER.search(line):
            return lines[:index]
    return lines[:8]


def parse_registers(lines):
    pane = "\n".join(register_pane(lines))
    values = {name: int(value, 16) for name, value in _REGISTER.findall(pane)}
    values.update({name: int(value, 16) for name, value in _SEGMENT.findall(pane)})
    mode = _MODE.findall(pane)
    if not {"EIP", "CS", "DS"} <= values.keys() or len(set(mode)) != 1:
        raise BaselineError("debugger-unparsed", "registers")
    pfi = _PFI.search(pane)
    cycles = _CYCLES.search(pane)
    return Registers(values, mode[0], float(pfi[1]) if pfi else None, int(cycles[1]) if cycles else None)


def code_locations(lines):
    section = _section(lines, _CODE_HEADER, (_OUTPUT_HEADER,)) or []
    return {(int(m[1], 16), int(m[2], 16)) for m in map(_CODE_LINE.match, section) if m}


def output_lines(lines):
    """The output area: rows after the output header, without the input line."""
    for index, line in enumerate(lines[:-1]):
        if _OUTPUT_HEADER.search(line):
            return lines[index + 1:-1]
    raise BaselineError("debugger-unparsed", "output")


def dv_acks(lines):
    return [(index, int(match[1], 16)) for index, line in enumerate(lines) for match in [_DV_ACK.search(line)]
            if match]


def data_rows(lines):
    """Data-view rows: start address -> 16 tokens (int byte or None for a pf/na fault marker)."""
    section = _section(lines, _DATA_HEADER, (_CODE_HEADER, _OUTPUT_HEADER)) or []
    rows = {}
    for line in section:
        match = _DV_ROW.match(line)
        if match:
            rows[int(match[1], 16)] = tuple(None if token in ("pf", "na") else int(token, 16)
                                            for token in match[2].split())
    return rows


def physical_lookup(lines, linear):
    """Physical address of the data view's first byte; None when unreadable or not unique and consistent."""
    section = _section(lines, _DATA_HEADER, (_CODE_HEADER, _OUTPUT_HEADER)) or []
    found = [match[1] for line in section for match in _PHY.finditer(line)]
    if len(found) != 1 or found[0].upper() == "XXXXXXXX":
        return None
    physical = int(found[0], 16)
    if physical & (PAGE_SIZE - 1) != linear & (PAGE_SIZE - 1):
        return None
    return physical


def parse_cpu(response):
    text = "\n".join(response)
    control = _CPU.findall(text)
    flags = _EFLAGS.findall(text)
    if not control or not flags:
        raise BaselineError("debugger-unparsed", "cpu")
    cr0, _, cr3 = control[-1]
    return CpuState(int(cr0, 16), int(cr3, 16), int(flags[-1], 16))


def _message(line):
    """A response line without the debugger's optional LOG:/DEBUG: prefixes."""
    return _PREFIX.sub("", line).strip()


def parse_selector(response, name):
    pattern = re.compile(name + r":\s*b:([0-9A-Fa-f]{8})\s+type:([0-9A-Fa-f]{2})\s+parbg")
    limit = re.compile(r"l:([0-9A-Fa-f]{8})\s+dpl\s*:\s*([0-9A-Fa-f])\s+([01]{5})")
    lines = [_message(line) for line in response]
    for index in range(len(lines) - 2, -1, -1):
        first = pattern.fullmatch(lines[index])
        second = limit.fullmatch(lines[index + 1]) if first else None
        if second:
            return Descriptor(name, int(first[1], 16), int(second[1], 16), int(first[2], 16), second[3])
    raise BaselineError("debugger-unparsed", "selector")


def parse_breakpoint_list(response):
    """(selector, offset) rows of the last complete BPLIST response; None when it is incomplete or ambiguous."""
    lines = [_message(line) for line in response]
    headings = [index for index, line in enumerate(lines) if line == "Breakpoint list:"]
    if not headings:
        return None
    body = lines[headings[-1] + 1:]
    if not body or not re.fullmatch(r"-{8,}", body[0]):
        return None
    rows = []
    for line in filter(None, body[1:]):
        match = _BP_ROW.match(line)
        if match is None:
            return None
        rows.append((int(match[1], 16), int(match[2], 16), int(match[3], 16)))
    if [row[0] for row in rows] != list(range(len(rows))):
        return None
    return [(selector, offset) for _, selector, offset in rows]


# -- session ----------------------------------------------------------------------------------------------------------
class Debugger:
    """One command at a time over the owned emulator's debugger; every wait is bounded."""

    def __init__(self, transport, screen, clock, wait_seconds, deadline, log):
        self.transport = transport
        self.screen = screen
        self.clock = clock
        self.wait_seconds = wait_seconds
        self.deadline = deadline
        self.log = log
        self.state = "other"
        self.stops = 0
        self.marker = 0
        self.last_marker = None
        self.last_dv = None
        self.received = 0
        self._lines = (None, None)

    # -- I/O -------------------------------------------------------------------------------------------------------
    def _remaining(self, limit):
        now = self.clock()
        if now >= self.deadline:
            raise BaselineError("run-timeout", "run")
        return min(limit, self.deadline - now)

    def pump(self, timeout):
        """Reads once (at most `timeout` seconds) and applies the output; True when output arrived."""
        data = self.transport.read(max(0.0, timeout))
        if not data:
            return False
        self.received += len(data)
        self.log.output(data)
        for piece in _SPLIT.split(data):
            if piece:
                self.screen.feed(piece)
                self._track()
        return True

    def _track(self):
        last = "".join(self.screen.cells[-1][:len(_RUNNING)])
        if last == _RUNNING:
            state = "running"
        elif _PROMPT.match("".join(self.screen.cells[-1]).rstrip()):
            state = "prompt"
        else:
            return
        if state != self.state:
            if self.state == "running":
                self.stops += 1
            self.state = state

    def lines(self):
        """Screen lines, recomputed only after new output."""
        version, lines = self._lines
        if version != self.screen.version:
            lines = self.screen.lines()
            self._lines = (self.screen.version, lines)
        return lines

    def wait(self, predicate, limit=None, code="wait-timeout", where="debugger", poll=None):
        """Pumps output until `predicate()` holds. Raises `code` after the single-wait limit, run-timeout at the run
        deadline; `poll` (operator/cancellation check) is called between reads."""
        end = self.clock() + (self.wait_seconds if limit is None else limit)
        while not predicate():
            if poll is not None:
                poll()
            now = self.clock()
            if now >= self.deadline:
                raise BaselineError("run-timeout", "run")
            if now >= end:
                raise BaselineError(code, where)
            self.pump(min(STEP, end - now, self.deadline - now))
            if self.transport.poll() is not None:
                raise BaselineError("child-exited", "emulator")

    def settle(self):
        """Drains until the screen has been quiet for a short interval (the debugger redraws in bursts)."""
        end = self.clock() + self._remaining(SETTLE_LIMIT)
        quiet_since = self.clock()
        while self.clock() < end:
            if self.pump(min(STEP, end - self.clock())):
                quiet_since = self.clock()
            elif self.clock() - quiet_since >= SETTLE_QUIET:
                return
        if self.transport.poll() is not None:
            raise BaselineError("child-exited", "emulator")

    def _send(self, text):
        self.log.command(text)
        self.transport.write((text + "\n").encode("ascii"))

    def prompt_ready(self):
        return self.state == "prompt" and bool(_PROMPT.match(self.lines()[-1]))

    def wait_ready(self):
        self.wait(self.prompt_ready, where="prompt")
        if _PAGER.search("\n".join(self.lines()[-3:])):
            raise BaselineError("debugger-unparsed", "pager")

    # -- commands --------------------------------------------------------------------------------------------------
    def _next_marker(self):
        self.marker += 1
        return MARKER_BASE + (self.marker % MARKER_SLOTS) * ROW_BYTES

    def _acks(self):
        """DV acknowledgements in the output area; empty while a repaint is still incomplete."""
        try:
            return dv_acks(output_lines(self.lines()))
        except BaselineError:
            return []

    def _acked(self, address):
        acks = self._acks()
        return bool(acks) and acks[-1][1] == address and self.prompt_ready()

    def _wait_parsed(self, predicate, where):
        """wait(), reporting a screen that never becomes parseable as debugger-unparsed rather than a timeout."""
        try:
            self.wait(predicate, where=where)
        except BaselineError as error:
            if error.code == "wait-timeout" and self.received and not self._acks():
                raise BaselineError("debugger-unparsed", where) from None
            raise

    def command(self, text=None):
        """Runs one command (or only a marker) and returns its response: the output lines after the previous marker
        acknowledgement and before this command's marker acknowledgement."""
        self.wait_ready()
        where = text.split()[0] if text else "marker"
        previous = self.last_marker
        marker = self._next_marker()
        if text:
            self._send(text)
        self._send(f"DV {marker:08X}")
        self._wait_parsed(lambda: self._acked(marker), where)
        self.settle()
        self.last_marker = marker
        self.last_dv = marker
        output = output_lines(self.lines())
        acks = dv_acks(output)
        if not acks or acks[-1][1] != marker:
            raise BaselineError("debugger-unparsed", where)
        start = max([index + 1 for index, value in acks[:-1] if value == previous], default=0)
        return output[start:acks[-1][0]]

    def wait_registers(self):
        """Waits until the register pane is drawn (after launch with -break-start)."""
        def drawn():
            try:
                parse_registers(self.lines())
            except BaselineError:
                return False
            return self.prompt_ready()
        self.wait(drawn, where="registers")

    def fresh_registers(self):
        """Registers from a screen fully repainted after the stop, cross-checked with the code view, which lists
        CS:EIP after a stop. Non-curses emulator output can scroll the terminal, so a stale parse is not trusted."""
        clears = self.screen.clears
        self.command()
        if self.screen.clears <= clears:
            raise BaselineError("debugger-unparsed", "repaint")
        registers = parse_registers(self.lines())
        if (registers.cs, registers.eip) not in code_locations(self.lines()):
            raise BaselineError("debugger-unparsed", "code-view")
        return registers

    def run_until_stop(self, command, limit, poll=None):
        """Sends RUN or VRT and waits (at most `limit` seconds) for the next running -> prompt transition."""
        self.wait_ready()
        stops = self.stops
        self._send(command)
        self.last_dv = None
        started = self.clock()
        self.wait(lambda: self.stops > stops, limit=limit, where=command, poll=poll)
        self.settle()
        return self.clock() - started

    def cpu(self):
        return parse_cpu(self.command("CPU"))

    def selector(self, name):
        return parse_selector(self.command(f"SELINFO {name}"), name)

    def breakpoint_list(self):
        rows = parse_breakpoint_list(self.command("BPLIST"))
        if rows is None:
            raise BaselineError("breakpoint-unconfirmed", "list")
        return rows

    def clear_breakpoints(self):
        response = self.command("BPDEL *")
        if not any("Breakpoints deleted." in line for line in response) or self.breakpoint_list():
            raise BaselineError("breakpoint-unconfirmed", "delete")

    def arm(self, selector, offsets):
        """Deletes all breakpoints and registers one code breakpoint at `offsets` (an int), or one at each of the
        alternative offsets (a tuple); every acknowledgement and the native list must match the set exactly.
        Returns the registration proof."""
        wanted = (offsets,) if type(offsets) is int else tuple(offsets)
        self.clear_breakpoints()
        for offset in wanted:
            response = self.command(f"BP {selector:04X}:{offset:08X}")
            acks = [(int(m[1], 16), int(m[2], 16)) for line in response for m in [_BP_ACK.search(line)] if m]
            if acks != [(selector, offset)]:
                raise BaselineError("breakpoint-unconfirmed", "acknowledgement")
        listed = self.breakpoint_list()
        if sorted(listed) != sorted((selector, offset) for offset in wanted):
            raise BaselineError("breakpoint-unconfirmed", "list")
        sites = {"offset": f"{offsets:08x}"} if type(offsets) is int else {"offsets": [f"{o:08x}" for o in wanted]}
        return {"selector": f"{selector:04x}", **sites, "acknowledged": True,
                "listed": [f"{s:04x}:{o:08x}" for s, o in listed]}

    def run_to_breakpoint(self, selector, offsets, limit, poll=None, before_run=None):
        """Registers the breakpoint(s) (see `arm`), runs (at most `limit` seconds) to the next stop, requires that
        stop to be at one of them and deletes them again. Returns (registers at the hit, proof)."""
        registration = self.arm(selector, offsets)
        wanted = (offsets,) if type(offsets) is int else tuple(offsets)
        if before_run is not None:
            before_run()
        waited = self.run_until_stop("RUN", limit, poll=poll)
        registers = self.fresh_registers()
        if registers.cs != selector or registers.eip not in wanted:
            raise BaselineError("breakpoint-wrong-hit", f"{selector:04x}:{wanted[0]:08x}" if len(wanted) == 1
                                else f"{selector:04x}:alternatives")
        self.clear_breakpoints()
        return registers, {"registration": registration, "waitedSeconds": round(waited, 3)}

    def write_memory(self, linear, data):
        """Writes bytes at a linear address of the paused guest (SMV) and requires the debugger's acknowledgement of
        exactly that many bytes. Each value carries a leading 0 so that the debugger's expression parser cannot read
        it as a flag or register name (AF, CF, DF ...). The acknowledgement does not prove the bytes landed (a page
        fault is still counted); the caller reads them back."""
        data = bytes(data)
        if not 0 < len(data) <= MAX_WRITE or not 0 <= linear <= 0xFFFFFFFF - len(data) + 1:
            raise BaselineError("stimulus-rejected", "write-range")
        response = self.command(f"SMV 0{linear:08X} " + " ".join(f"0{value:02X}" for value in data))
        acks = [int(match[1]) for line in response for match in [_MEMORY_ACK.match(_message(line))] if match]
        if acks != [len(data)]:
            raise BaselineError("stimulus-unverified", "write-unacknowledged")

    def view(self, address, rows):
        """Shows `rows` data-view rows from `address`; returns ({row address: tokens}, physical lookup or None)."""
        if self.last_dv == address:
            self.command()
        self.wait_ready()
        self._send(f"DV {address:08X}")
        self.last_dv = address
        wanted = [address + row * ROW_BYTES for row in range(rows)]

        def shown():
            rows = data_rows(self.lines())
            return self._acked(address) and all(start in rows for start in wanted)

        try:
            self._wait_parsed(shown, "DV")
        except BaselineError as error:
            if error.code != "wait-timeout" or not self._acked(address):
                raise  # a view that never showed all rows is read as short below
        self.settle()
        lines = self.lines()
        return data_rows(lines), physical_lookup(lines, address)


class DebuggerPort:
    """The paused-process port for `qualify.collect_pause`: direct linear reads with fault markers and the physical
    lookup of each page read, and page states owned by this process and its current page directory. Field reads
    are charged to the run's read budget by collect_pause; page-state lookups are charged here."""

    PAGE_LOOKUP_BYTES = 16  # one data-view row is shown for each page lookup

    def __init__(self, debugger, pid, budget):
        self.debugger = debugger
        self.pid = pid
        self.budget = budget

    def owner(self):
        cpu = self.debugger.cpu()
        return f"pid:{self.pid}/cr3:{cpu.cr3:08x}"

    def read(self, linear, size):
        data = []
        pages = {}
        position = linear
        end = linear + size
        while position < end:
            chunk = min(end - position, PAGE_SIZE - position % PAGE_SIZE, DV_ROWS * ROW_BYTES)
            rows, physical = self.debugger.view(position, -(-chunk // ROW_BYTES))
            for at in range(position, position + chunk, ROW_BYTES):
                tokens = rows.get(at)
                if tokens is None:
                    return ReadResult(tuple(data), pages)  # short: the view did not show this row
                data.extend(tokens[:min(ROW_BYTES, position + chunk - at)])
            page = position // PAGE_SIZE
            lookup = None if physical is None else physical // PAGE_SIZE
            if page in pages and pages[page] != lookup:
                lookup = None
            if lookup is not None or page in pages:
                pages[page] = lookup
            position += chunk
        return ReadResult(tuple(data), pages)

    def state(self, pages):
        owner = self.owner()
        lookups = {}
        for page in sorted(pages):
            self.budget.consume(self.PAGE_LOOKUP_BYTES)
            _, physical = self.debugger.view(page * PAGE_SIZE, 1)
            lookups[page] = None if physical is None else physical // PAGE_SIZE
        return PageState(owner, lookups)
