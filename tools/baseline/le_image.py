"""Linear Executable (LE) structure read from caller-supplied bytes (docs/original/formats/executable.md §1).

Only what the CODE/DATA correlation needs: the object table, the page map and the fixup records of the pages a window
touches. The caller reads the bytes from the verified private EXE copy at run time; this module never opens files.
"""
import struct
from dataclasses import dataclass

from reasons import BaselineError

PAGE_SIZE = 4096
MAX_OBJECTS = 16
MAX_PAGES = 4096
FLAG_EXECUTABLE = 0x0004
LE_HEADER_BYTES = 0xB0
OBJECT_BYTES = 24
# Bytes patched by each fixup source type (low nibble of the source byte).
FIXUP_WIDTHS = {0x0: 1, 0x2: 2, 0x3: 4, 0x5: 2, 0x6: 6, 0x7: 4, 0x8: 4}
OFFSET32 = 0x7


@dataclass(frozen=True)
class LeObject:
    number: int
    virtual_size: int
    preferred_base: int
    flags: int
    first_page: int  # 1-based page map index
    page_count: int

    @property
    def executable(self):
        return bool(self.flags & FLAG_EXECUTABLE)


@dataclass(frozen=True)
class Fixup:
    location: int  # object-relative offset of the patched bytes
    source_type: int
    additive: bool
    target_object: object  # int for internal references, else None (import or entry ordinal)
    target_offset: object  # int for internal non-selector references, else None

    @property
    def internal(self):
        return self.target_object is not None

    @property
    def width(self):
        return FIXUP_WIDTHS[self.source_type]

    @property
    def pointer(self):
        """A 32-bit offset to a known object offset: its runtime value derives that object's base."""
        return self.source_type == OFFSET32 and not self.additive and self.target_offset is not None


def _invalid(where):
    raise BaselineError("le-invalid", where)


class LeImage:
    """A validated LE layout over immutable bytes."""

    def __init__(self, data):
        data = bytes(data)
        self._data = data
        if len(data) < 0x40 or data[:2] != b"MZ":
            _invalid("mz")
        header_at = struct.unpack_from("<I", data, 0x3C)[0]
        if header_at + LE_HEADER_BYTES > len(data):
            _invalid("le-header")
        header = data[header_at:header_at + LE_HEADER_BYTES]
        if header[:2] != b"LE" or header[2] != 0 or header[3] != 0:
            _invalid("le-header")

        def u32(offset):
            return struct.unpack_from("<I", header, offset)[0]

        if u32(0x28) != PAGE_SIZE:
            _invalid("page-size")
        self.page_count = u32(0x14)
        object_count = u32(0x44)
        if not 1 <= self.page_count <= MAX_PAGES or not 1 <= object_count <= MAX_OBJECTS:
            _invalid("counts")
        self._last_page_bytes = u32(0x2C)
        if not 1 <= self._last_page_bytes <= PAGE_SIZE:
            _invalid("last-page")
        self._data_pages = u32(0x80)
        if self._data_pages + (self.page_count - 1) * PAGE_SIZE + self._last_page_bytes > len(data):
            _invalid("data-pages")

        table = self._slice(header_at + u32(0x40), object_count * OBJECT_BYTES, "object-table")
        page_map = self._slice(header_at + u32(0x48), self.page_count * 4, "page-map")
        fixup_pages = self._slice(header_at + u32(0x68), (self.page_count + 1) * 4, "fixup-pages")
        self._fixup_page_offsets = struct.unpack("<%dI" % (self.page_count + 1), fixup_pages)
        if any(a > b for a, b in zip(self._fixup_page_offsets, self._fixup_page_offsets[1:])):
            _invalid("fixup-pages")
        self._fixup_records = header_at + u32(0x6C)
        self._slice(self._fixup_records, self._fixup_page_offsets[-1], "fixup-records")

        self._stored = []
        for index in range(self.page_count):
            entry = page_map[index * 4:index * 4 + 4]
            number = int.from_bytes(entry[:3], "big")
            self._stored.append(number if entry[3] == 0 and 1 <= number <= self.page_count else None)

        objects = []
        for index in range(object_count):
            size, base, flags, first, count, _ = struct.unpack_from("<6I", table, index * OBJECT_BYTES)
            if count and (first < 1 or first + count - 1 > self.page_count):
                _invalid(f"object-{index + 1}")
            objects.append(LeObject(index + 1, size, base, flags, first, count))
        self.objects = tuple(objects)
        self._stored_sizes = tuple(self._contiguous(obj) for obj in objects)
        self._page_fixups = {}

    def _slice(self, offset, size, where):
        if offset < 0 or offset + size > len(self._data):
            _invalid(where)
        return self._data[offset:offset + size]

    def object(self, number):
        if type(number) is not int or not 1 <= number <= len(self.objects):
            raise BaselineError("object-missing", f"object-{number}")
        return self.objects[number - 1]

    def _page_bytes(self, obj, page):
        """Stored length of an object's page (0-based within the object); 0 when it is not stored in the file."""
        if page >= obj.page_count:
            return 0
        number = self._stored[obj.first_page - 1 + page]
        if number is None:
            return 0
        return self._last_page_bytes if number == self.page_count else PAGE_SIZE

    def _contiguous(self, obj):
        size = 0
        for page in range(obj.page_count):
            length = self._page_bytes(obj, page)
            size += length
            if length < PAGE_SIZE:
                break
        return min(size, obj.virtual_size)

    def stored_size(self, number):
        """Bytes from the object's start that are file-backed without a gap, bounded by its virtual size."""
        return self._stored_sizes[self.object(number).number - 1]

    def read(self, number, offset, size):
        """Stored bytes of an object window; window-outside-image when any byte is not file-backed."""
        obj = self.object(number)
        if offset < 0 or size < 1 or offset + size > self.stored_size(number):
            raise BaselineError("window-outside-image", f"object-{number}")
        parts = []
        while size:
            page, within = divmod(offset, PAGE_SIZE)
            count = min(size, PAGE_SIZE - within)
            physical = self._stored[obj.first_page - 1 + page]
            start = self._data_pages + (physical - 1) * PAGE_SIZE + within
            parts.append(self._data[start:start + count])
            offset += count
            size -= count
        return b"".join(parts)

    def fixups(self, number, offset, size):
        """Fixups that patch any byte of [offset, offset + size) of an object, by location."""
        obj = self.object(number)
        end = offset + size
        selected = {}
        first = max(offset - max(FIXUP_WIDTHS.values()), 0) // PAGE_SIZE
        for page in range(first, min((end - 1) // PAGE_SIZE + 1, obj.page_count)):
            for fixup in self._fixups_of(obj, page):
                if fixup.location < end and fixup.location + fixup.width > offset:
                    known = selected.get(fixup.location)
                    if known is not None and known != fixup:
                        _invalid(f"fixup-{number}")
                    selected[fixup.location] = fixup
        return tuple(selected[location] for location in sorted(selected))

    def _fixups_of(self, obj, page):
        index = obj.first_page - 1 + page
        if index not in self._page_fixups:
            start = self._fixup_records + self._fixup_page_offsets[index]
            raw = self._data[start:self._fixup_records + self._fixup_page_offsets[index + 1]]
            self._page_fixups[index] = tuple(_parse_records(raw, page * PAGE_SIZE, len(self.objects)))
        return self._page_fixups[index]


def _parse_records(raw, page_start, object_count):
    at = 0

    def take(fmt):
        nonlocal at
        size = struct.calcsize(fmt)
        if at + size > len(raw):
            _invalid("fixup-record")
        value = struct.unpack_from(fmt, raw, at)[0]
        at += size
        return value

    while at < len(raw):
        source = take("<B")
        flags = take("<B")
        source_type = source & 0x0F
        if source_type not in FIXUP_WIDTHS or source & 0xC0 or flags & 0x08:
            _invalid("fixup-record")
        if source & 0x10 and source_type not in (0x2, 0x3, 0x6):
            _invalid("fixup-record")
        listed = bool(source & 0x20)
        count = take("<B") if listed else 0
        offsets = [] if listed else [take("<h")]
        kind = flags & 0x03
        target_object = target_offset = None
        module_or_object = take("<H" if flags & 0x40 else "<B")
        if kind == 0:
            target_object = module_or_object
            if not 1 <= target_object <= object_count:
                _invalid("fixup-target")
            if source_type != 0x2:
                target_offset = take("<I" if flags & 0x10 else "<H")
        elif kind == 1:
            take("<B" if flags & 0x80 else "<I" if flags & 0x10 else "<H")
        elif kind == 2:
            take("<I" if flags & 0x10 else "<H")
        additive = bool(flags & 0x04)
        if additive:
            take("<I" if flags & 0x20 else "<H")
        offsets += [take("<h") for _ in range(count)]
        for offset in offsets:
            yield Fixup(page_start + offset, source_type, additive, target_object, target_offset)
