"""Synthetic LE images and a fake paused process for the baseline tool's tests (never original data).

`build_le` lays out a little-endian LE file from code-generated object bytes and fixup specs. `FakeProcess` loads
that image at chosen per-object linear bases, applies the fixups the way a loader would and serves reads with fault
markers, short reads and page lookups, so correlation and qualification can be exercised without an emulator.
"""
import random
import struct
from dataclasses import dataclass

from le_image import FIXUP_WIDTHS, LE_HEADER_BYTES, PAGE_SIZE
from locate import AddressSpace, WindowRead, correlate_code, data_address, prove_mapping
from qualify import FORMATS, PageState, ReadResult, page_range

MZ_BYTES = 0x40
EXECUTABLE = 0x2045
DATA = 0x2043


@dataclass(frozen=True)
class ObjectSpec:
    data: bytes  # stored bytes; pages beyond them up to virtual_size are not file-backed
    virtual_size: int
    flags: int
    preferred_base: int


@dataclass(frozen=True)
class FixupSpec:
    object: int
    location: int
    target_object: int = 0
    target_offset: int = 0
    source_type: int = 0x7
    wide_offset: bool = True  # 32-bit target offset (target flag 0x10)
    import_ordinal: bool = False


def noise(seed, size):
    """Deterministic pseudo-random bytes that make every 16-byte chunk distinctive."""
    return random.Random(seed).randbytes(size)


def _record(spec, source_offset):
    if spec.import_ordinal:
        return struct.pack("<BBhBH", spec.source_type, 0x01, source_offset, 1, 7)
    flags = 0x10 if spec.wide_offset else 0x00
    record = struct.pack("<BBhB", spec.source_type, flags, source_offset, spec.target_object)
    if spec.source_type != 0x2:
        record += struct.pack("<I" if spec.wide_offset else "<H", spec.target_offset)
    return record


def build_le(objects, fixups=(), *, header_patch=None):
    """LE file bytes. Objects are numbered from 1 in order; a fixup crossing a page is recorded on both pages."""
    pages = []  # (object index, page within object, bytes)
    first_pages = []
    for index, obj in enumerate(objects):
        first_pages.append(len(pages) + 1)
        for at in range(0, len(obj.data), PAGE_SIZE):
            pages.append((index, at // PAGE_SIZE, obj.data[at:at + PAGE_SIZE]))
    page_count = len(pages)
    records = [b""] * page_count
    for spec in fixups:
        width = FIXUP_WIDTHS[spec.source_type]
        first = spec.location // PAGE_SIZE
        for page in range(first, (spec.location + width - 1) // PAGE_SIZE + 1):
            index = first_pages[spec.object - 1] - 1 + page
            records[index] += _record(spec, spec.location - page * PAGE_SIZE)

    object_table = MZ_BYTES + LE_HEADER_BYTES
    page_map = object_table + 24 * len(objects)
    fixup_pages = page_map + 4 * page_count
    fixup_records = fixup_pages + 4 * (page_count + 1)
    data_pages = fixup_records + sum(len(record) for record in records)

    out = bytearray(MZ_BYTES + LE_HEADER_BYTES)
    out[0:2] = b"MZ"
    struct.pack_into("<I", out, 0x3C, MZ_BYTES)
    header = {0x14: page_count, 0x28: PAGE_SIZE, 0x2C: len(pages[-1][2]), 0x40: object_table - MZ_BYTES,
              0x44: len(objects), 0x48: page_map - MZ_BYTES, 0x68: fixup_pages - MZ_BYTES,
              0x6C: fixup_records - MZ_BYTES, 0x80: data_pages}
    out[MZ_BYTES:MZ_BYTES + 2] = b"LE"
    for offset, value in header.items():
        struct.pack_into("<I", out, MZ_BYTES + offset, value)
    for index, obj in enumerate(objects):
        count = -(-len(obj.data) // PAGE_SIZE)
        out += struct.pack("<6I", obj.virtual_size, obj.preferred_base, obj.flags, first_pages[index], count, 0)
    for number in range(1, page_count + 1):
        out += number.to_bytes(3, "big") + b"\0"
    offset = 0
    for record in records:
        out += struct.pack("<I", offset)
        offset += len(record)
    out += struct.pack("<I", offset)
    for record in records:
        out += record
    for index, (_, _, data) in enumerate(pages):
        out += data if index == page_count - 1 else data.ljust(PAGE_SIZE, b"\0")
    if header_patch:
        for offset, value in header_patch.items():
            struct.pack_into("<I", out, MZ_BYTES + offset, value)
    return bytes(out)


class FakeProcess:
    """A paused process: sparse linear memory, fault pages, short-read addresses and per-page physical lookups."""

    def __init__(self, objects, fixups, bases, space_base=0, owner="pid:1"):
        self.memory = {}
        self.faults = set()
        self.short = {}  # linear address -> bytes returned
        self.physical = {}
        self.owner = owner
        self.reads = []
        self.on_read = None
        self.report_pages = True
        self.hide_pages = []  # linear addresses whose next read reports no page lookup
        for index, obj in enumerate(objects, start=1):
            if index in bases:
                self.poke(bases[index], obj.data.ljust(obj.virtual_size, b"\0")[:obj.virtual_size])
        for spec in fixups:
            if spec.object not in bases:
                continue
            at = bases[spec.object] + spec.location
            if spec.import_ordinal:
                self.poke_u32(at, 0x44332211)
            elif spec.source_type == 0x7:
                self.poke(at, struct.pack("<I", bases[spec.target_object] + spec.target_offset - space_base))
            elif spec.source_type == 0x8:
                self.poke(at, struct.pack("<i", bases[spec.target_object] + spec.target_offset - (at + 4)))
            elif spec.source_type == 0x2:
                self.poke(at, struct.pack("<H", 0x168 + spec.target_object))

    def poke(self, linear, data):
        data = bytes(data)
        at = 0
        while at < len(data):
            page, within = divmod(linear + at, PAGE_SIZE)
            count = min(len(data) - at, PAGE_SIZE - within)
            self.memory.setdefault(page, bytearray(PAGE_SIZE))[within:within + count] = data[at:at + count]
            at += count

    def poke_u32(self, linear, value):
        self.poke(linear, struct.pack("<I", value))

    def peek(self, linear, size):
        return bytes(self.memory.get((linear + i) // PAGE_SIZE, bytes(PAGE_SIZE))[(linear + i) % PAGE_SIZE]
                     for i in range(size))

    def lookup(self, page):
        return self.physical.get(page, (page * 7 + 3) & 0xFFFFF)

    def read(self, linear, size):
        self.reads.append((linear, size))
        if self.on_read:
            self.on_read(self, linear, size)
        count = self.short.get(linear, size)
        data = tuple(None if (linear + i) // PAGE_SIZE in self.faults else self.peek(linear + i, 1)[0]
                     for i in range(count))
        pages = {page: self.lookup(page) for page in page_range(linear, size)}
        if not self.report_pages or linear in self.hide_pages:
            if linear in self.hide_pages:
                self.hide_pages.remove(linear)
            pages = {}
        return ReadResult(data, pages)

    def window(self, linear, size):
        return self.read(linear, size).data

    def state(self, pages):
        return PageState(self.owner, {page: self.lookup(page) for page in pages})


# A shared scenario: CODE object 2, a second CODE object 3 and DATA object 4 with BSS, loaded at bases whose shifts
# from the preferred bases all differ.
BASES = {1: 0x10010000, 2: 0x10031000, 3: 0x10162000, 4: 0x10203000}
HEAP = 0x30000000
CODE_WINDOW = (2, 0x1F80, 160)
DATA_WINDOW = (4, 0x400, 64)
FIELD_VALUES = {"ticks": 123456, "delta": -5, "flag": 0, "speed": 1.5, "neg": -70000, "count": 65535,
                "scenario": 4242, "chained": 99}
FIELD_LAYOUT = (  # id, object-4 offset, type, unit, pointers
    ("ticks", 0x800, "u32", "tick", []),
    ("delta", 0x804, "i16", "tick", []),
    ("flag", 0x806, "u8", "flag", []),
    ("speed", 0x808, "f32", "unit/tick", []),
    ("neg", 0x80C, "i32", "unit", []),
    ("count", 0x810, "u16", "count", []),
    ("chained", 0x820, "u32", "count", [0x10, 0x8]),
    ("scenario", 0x830, "i32", "id", []),
)


def scenario_objects(duplicate_code=False):
    code = bytearray(noise(2, 3 * PAGE_SIZE))
    if duplicate_code:
        code[0x800:0x8A0] = code[0x1F80:0x2020]
    return [
        ObjectSpec(noise(1, 0x10), 0x10, EXECUTABLE, 0x10000),
        ObjectSpec(bytes(code), 3 * PAGE_SIZE + 0x100, EXECUTABLE, 0x20000),
        ObjectSpec(noise(3, PAGE_SIZE), PAGE_SIZE, EXECUTABLE, 0x40000),
        ObjectSpec(noise(4, 2 * PAGE_SIZE), 4 * PAGE_SIZE, DATA, 0x50000),
    ]


def scenario_fixups(duplicate_code=False):
    window = [
        FixupSpec(2, 0x1F84, 4, 0x100),
        FixupSpec(2, 0x1FA0, 4, 0x234),
        FixupSpec(2, 0x1FB0, 2, 0x500, source_type=0x8),
        FixupSpec(2, 0x1FC8, 3, 0x10),
        FixupSpec(2, 0x1FD8, 4, source_type=0x2),
        FixupSpec(2, 0x1FFE, 4, 0x300),  # crosses the page boundary inside the window
    ]
    fixups = window + [
        FixupSpec(2, 0x40, 4, 0x120, wide_offset=False),
        FixupSpec(2, 0x80, import_ordinal=True),
        FixupSpec(4, 0x400, 2, 0x1000),
        FixupSpec(4, 0x408, 2, 0x1100),
        FixupSpec(4, 0x410, 4, 0x800),
        FixupSpec(4, 0x418, 3, 0x20),
    ]
    if duplicate_code:
        fixups += [FixupSpec(2, spec.location - 0x1780, spec.target_object, spec.target_offset, spec.source_type)
                   for spec in window]
    return fixups


def scenario_image(duplicate_code=False):
    return build_le(scenario_objects(duplicate_code), scenario_fixups(duplicate_code))


def scenario_process(bases=None, space_base=0, duplicate_code=False, owner="pid:1"):
    bases = dict(BASES if bases is None else bases)
    process = FakeProcess(scenario_objects(duplicate_code), scenario_fixups(duplicate_code), bases, space_base, owner)
    data = bases[4]
    for name, offset, kind, _, _ in FIELD_LAYOUT:
        if name == "chained":
            process.poke_u32(data + offset, HEAP - space_base)
            process.poke_u32(HEAP + 0x10, HEAP + 0x1000 - space_base)
            process.poke_u32(HEAP + 0x1008, FIELD_VALUES[name])
        else:
            process.poke(data + offset, struct.pack(FORMATS[kind], FIELD_VALUES[name]))
    return process


def scenario_recipe(exe_sha256, **changes):
    """Recipe document (a dict) for the scenario; `changes` replaces top-level keys."""
    fields = [{"id": name, "address": {"object": 4, "offset": offset, **({"pointers": pointers} if pointers else {})},
               "type": kind, "unit": unit} for name, offset, kind, unit, pointers in FIELD_LAYOUT]
    document = {
        "schemaVersion": 1,
        "recipeId": "synthetic-timebase",
        "source": {"baselineVersion": "synthetic-1", "exeSha256": exe_sha256},
        "identity": {"mission": {"group": 0, "slot": 1}, "config": {"difficulty": 19, "wingman": "none"},
                     "checks": [{"field": "scenario", "equals": FIELD_VALUES["scenario"]}]},
        "correlation": {"code": {"object": CODE_WINDOW[0], "size": CODE_WINDOW[2]},
                        "data": {"object": DATA_WINDOW[0], "offset": DATA_WINDOW[1], "size": DATA_WINDOW[2]}},
        "pauses": [
            {"id": "start", "stop": {"kind": "breakpoint", "object": 2, "offset": 0x1F90},
             "fields": [name for name, *_ in FIELD_LAYOUT]},
            {"id": "end", "stop": {"kind": "vrt"}, "fields": ["scenario", "ticks"]},
        ],
        "fields": fields,
        "limits": {"runSeconds": 60, "waitSeconds": 10, "maxPauses": 4, "maxFields": 16, "maxChainDepth": 2,
                   "repeatReads": 2, "maxReadBytes": 4096, "maxLogBytes": 65536},
    }
    document.update(changes)
    return document


def establish(image, recipe, process, space=AddressSpace(0, 0xFFFFFFFF), owner="pid:1"):
    """The process Mapping from the recipe's CODE window read at the scenario's CODE location."""
    linear = BASES[recipe.code_window.object] + CODE_WINDOW[1]
    match = correlate_code(image, recipe.code_window, WindowRead(linear, process.window(linear, CODE_WINDOW[2])),
                           space)
    linear = data_address(match, recipe.data_window)
    read = WindowRead(linear, process.window(linear, recipe.data_window.size))
    return prove_mapping(image, recipe.data_window, match, read, space, owner)
