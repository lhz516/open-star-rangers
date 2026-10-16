"""Private disc copy for a recipe's `disc.omit` (P3-10 subtask 25).

A recipe may declare manifest files that its private CD must not contain (for example the speech archive, to measure
the original's behaviour when that archive cannot be opened). The tool then reads the manifest-verified disc image
read-only, copies every manifest game file except the omitted ones into the run directory as independent regular
files, checks each copy's size and SHA-256 against the manifest, and mounts that directory as a read-only CD-ROM
drive instead of the image. Nothing else of the disc is copied and nothing is decoded: the files are byte copies.

Supported image layouts: raw MODE1 sectors of 2,352 bytes (each with the sync pattern and mode byte 1) or plain
2,048-byte ISO9660 blocks; one primary volume descriptor at block 16 with a logical block size of 2,048. Directory
walks are bounded; anything outside this subset is a `source-mismatch`.
"""
import os
import re
import stat

from protect import sha256_file
from reasons import BaselineError

RAW_SECTOR = 2352
BLOCK = 2048
SYNC = b"\x00" + b"\xff" * 10 + b"\x00"
PVD_BLOCK = 16
MAX_DIRECTORY_BYTES = 1 << 16
MAX_DEPTH = 8
CHUNK = 1 << 20
_DIRECTORY_NAME = re.compile(r"[A-Z0-9_-]{1,8}")
_FILE_IDENTIFIER = re.compile(r"([A-Z0-9_-]{1,8})(?:\.([A-Z0-9_-]{0,3}))?;[0-9]{1,5}")
_PATH_PART = re.compile(r"[A-Z0-9_-]{1,8}(?:\.[A-Z0-9_-]{1,3})?")


def _fail(where="disc"):
    raise BaselineError("source-mismatch", where)


class DiscImage:
    """Read-only ISO9660 block access to one disc image file (raw MODE1/2352 or plain 2048)."""

    def __init__(self, path):
        info = os.lstat(path)
        if not stat.S_ISREG(info.st_mode):
            _fail()
        self.stream = os.fdopen(os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0)), "rb")
        size = info.st_size
        first = self.stream.read(16)
        if size % RAW_SECTOR == 0 and first[:12] == SYNC and first[15:16] == b"\x01":
            self.raw, self.blocks = True, size // RAW_SECTOR
        elif size % BLOCK == 0:
            self.raw, self.blocks = False, size // BLOCK
        else:
            self.close()
            _fail()

    def close(self):
        self.stream.close()

    def block(self, lba):
        if not 0 <= lba < self.blocks:
            _fail()
        if self.raw:
            self.stream.seek(lba * RAW_SECTOR)
            sector = self.stream.read(RAW_SECTOR)
            if len(sector) != RAW_SECTOR or sector[:12] != SYNC or sector[15] != 1:
                _fail()
            return sector[16:16 + BLOCK]
        self.stream.seek(lba * BLOCK)
        data = self.stream.read(BLOCK)
        if len(data) != BLOCK:
            _fail()
        return data

    def extent(self, lba, size):
        """The extent's bytes in chunks of at most CHUNK."""
        if lba + (size + BLOCK - 1) // BLOCK > self.blocks:
            _fail()
        remaining, current = size, lba
        while remaining > 0:
            count = min(CHUNK // BLOCK, (remaining + BLOCK - 1) // BLOCK)
            data = b"".join(self.block(current + index) for index in range(count))
            take = min(remaining, len(data))
            yield data[:take]
            remaining -= take
            current += count


def _both(data, offset, size):
    """A both-endian field: the little-endian half, which must equal the big-endian half."""
    value = int.from_bytes(data[offset:offset + size], "little")
    if value != int.from_bytes(data[offset + size:offset + 2 * size], "big"):
        _fail()
    return value


def _record(data, offset):
    """(name, extent, size, is_directory, record length) of the directory record at `offset`, or None at a zero
    length byte."""
    length = data[offset]
    if length == 0:
        return None
    if length < 34 or offset + length > len(data):
        _fail()
    extent, size = _both(data, offset + 2, 4), _both(data, offset + 10, 4)
    name_length = data[offset + 32]
    if 33 + name_length > length:
        _fail()
    raw_name = data[offset + 33:offset + 33 + name_length]
    directory = bool(data[offset + 25] & 2)
    return _name(raw_name, directory), extent, size, directory, length


def _name(raw, directory):
    """The 8.3 name of a directory record, or None for `.`/`..` and for identifiers outside the supported subset
    (upper-case 8.3, files with a numeric version), which are never matched."""
    text = raw.decode("latin-1")
    if directory:
        return text if _DIRECTORY_NAME.fullmatch(text) else None
    match = _FILE_IDENTIFIER.fullmatch(text)
    if match is None:
        return None
    return match[1] + (f".{match[2]}" if match[2] else "")


def _directory(image, extent, size):
    """name -> (extent, size, is_directory) of one directory; records never cross a block."""
    if not 0 < size <= MAX_DIRECTORY_BYTES:
        _fail()
    entries = {}
    data = b"".join(image.extent(extent, size))
    for start in range(0, len(data), BLOCK):
        block = data[start:start + BLOCK]
        offset = 0
        while offset < len(block):
            record = _record(block, offset)
            if record is None:
                break
            name, child, child_size, directory, record_length = record
            if name is not None:
                if name in entries:
                    _fail()
                entries[name] = (child, child_size, directory)
            offset += record_length
    return entries


def _root(image):
    pvd = image.block(PVD_BLOCK)
    if pvd[0] != 1 or pvd[1:6] != b"CD001" or pvd[6] != 1:
        _fail()
    if _both(pvd, 128, 2) != BLOCK:
        _fail()
    volume = _both(pvd, 80, 4)
    if not PVD_BLOCK < volume <= image.blocks:
        _fail()
    image.blocks = volume  # every extent must lie inside the logical volume
    record = _record(pvd, 156)
    if record is None or not record[3]:
        _fail()
    return record[1], record[2]


def _parts(relative):
    """The components of a manifest path: 1-8 upper-case 8.3 names (no empty, `.` or `..` component)."""
    parts = relative.split("/")
    if not 1 <= len(parts) <= MAX_DEPTH or not all(_PATH_PART.fullmatch(part) for part in parts):
        _fail()
    return parts


def _locate(image, root, parts, directories):
    """Extent and size of the file at `parts`; `directories` caches each directory read (extent -> entries)."""
    extent, size = root
    for depth, part in enumerate(parts):
        if extent not in directories:
            directories[extent] = _directory(image, extent, size)
        entry = directories[extent].get(part)
        if entry is None:
            _fail()
        extent, size, directory = entry
        if directory != (depth < len(parts) - 1):
            _fail()
    return extent, size


def _verify_copy(path, size, check):
    """A written copy must be a singly linked regular file of the expected size; returns its SHA-256, re-read."""
    info = os.lstat(path)
    if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or info.st_size != size:
        _fail()
    return sha256_file(path, check)


def private_disc(manifest, image_path, target, omit, check=None):
    """Copies every manifest game file of the disc image at `image_path`, except the relative paths in `omit`, into
    the new directory `target`; each copy is a singly linked regular file whose size and SHA-256 match the manifest.
    Returns relative path -> digest of the copies."""
    copied = {}
    target.mkdir(mode=0o700)
    image = DiscImage(image_path)
    try:
        root, directories = _root(image), {}
        for relative, (size, digest) in sorted(manifest.files.items()):
            if relative in omit:
                continue
            parts = _parts(relative)
            extent, length = _locate(image, root, parts, directories)
            if length != size:
                _fail()
            destination = target.joinpath(*parts)
            destination.parent.mkdir(mode=0o700, parents=True, exist_ok=True)  # parts hold no `.`, `..` or links
            flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0)
            with os.fdopen(os.open(destination, flags, 0o600), "wb") as stream:
                for chunk in image.extent(extent, length):
                    if check is not None:
                        check()
                    stream.write(chunk)
            if _verify_copy(destination, size, check) != digest:
                _fail()
            copied[relative] = digest
    finally:
        image.close()
    return copied

