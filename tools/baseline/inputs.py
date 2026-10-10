"""Emulator-internal game input (P3-06 subtask 22): the input channels a stimulus may write and the exact bytes.

A recipe may declare stimuli that the tool applies at its pauses by writing the paused guest's memory through the
debugger, never through host input. There are three channels:

- **key:** one keystroke (ASCII and scan code) appended to the BIOS keyboard buffer in the BIOS data area, where
  DOSBox-X's DOS console and INT 16h take the next key; the buffer must be empty, so the next read gets this key;
- **shift:** bits of the BIOS keyboard shift flags (`0x417`), which programs read directly;
- **device:** a value in an input-device state field the recipe declares (an LE object location, or an offset from
  a register at a breakpoint).

Given the bytes read at the pause, this module computes every write; it performs no I/O. A write outside these
channels cannot be expressed.
"""
import struct
from dataclasses import dataclass

from reasons import BaselineError

BDA = 0x400  # BIOS data area (segment 0x40); the buffer pointers are offsets from it
SHIFT_FLAGS = BDA + 0x17
KEY_POINTERS = BDA + 0x1A  # u16 head, u16 tail
KEY_BOUNDS = BDA + 0x80  # u16 buffer start, u16 buffer end
KEY_TAIL = BDA + 0x1C
KEY_AREA = (0x1E, 0x100)  # where a buffer may lie: after the pointers, inside the data area
SHIFT_BITS = {"rshift": 0x01, "lshift": 0x02, "ctrl": 0x04, "alt": 0x08, "caps": 0x40}
REGISTERS = ("EAX", "EBX", "ECX", "EDX", "ESI", "EDI", "EBP", "ESP")


@dataclass(frozen=True)
class Write:
    channel: str  # key-slot, key-tail, shift-flags or device
    linear: int
    data: bytes

    @property
    def bios(self):
        """Writes into the BIOS data area, which must be identity-mapped to reach the BIOS and DOS readers."""
        return self.channel != "device"


def _key_buffer(pointers, bounds):
    """(head, tail, start, end) of the BIOS keyboard buffer from the 4 bytes at KEY_POINTERS and KEY_BOUNDS."""
    head, tail = struct.unpack("<HH", bytes(pointers))
    start, end = struct.unpack("<HH", bytes(bounds))
    low, high = KEY_AREA
    if not (low <= start and end <= high and end - start >= 4 and start % 2 == 0 and end % 2 == 0
            and all(start <= value < end and (value - start) % 2 == 0 for value in (head, tail))):
        raise BaselineError("stimulus-rejected", "key-buffer-invalid")
    return head, tail, start, end


def key_writes(pointers, bounds, ascii_code, scan):
    """The keystroke word at the tail, then the advanced tail. The buffer must be empty, so the next read is it."""
    head, tail, start, end = _key_buffer(pointers, bounds)
    if head != tail:
        raise BaselineError("stimulus-rejected", "key-buffer-busy")
    following = tail + 2 if tail + 2 < end else start
    return (Write("key-slot", BDA + tail, bytes((ascii_code, scan))),
            Write("key-tail", KEY_TAIL, struct.pack("<H", following)))


def shift_writes(current, flags):
    """The shift-flag byte with each named bit set (True) or cleared (False); other bits unchanged."""
    value = bytes(current)[0]
    for name, on in flags:
        value = value | SHIFT_BITS[name] if on else value & ~SHIFT_BITS[name]
    return (Write("shift-flags", SHIFT_FLAGS, bytes((value,))),)
