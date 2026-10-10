import access_guard  # noqa: F401  (installs the no-original-access guard first)

import struct
import unittest

from inputs import KEY_TAIL, SHIFT_FLAGS, Write, key_writes, shift_writes
from reasons import BaselineError


def pointers(head, tail):
    return struct.pack("<HH", head, tail)


def bounds(start, end):
    return struct.pack("<HH", start, end)


class InputTests(unittest.TestCase):
    def assertRejected(self, detail, call, *args):
        with self.assertRaises(BaselineError) as caught:
            call(*args)
        self.assertEqual((caught.exception.code, caught.exception.where), ("stimulus-rejected", detail))

    def test_key_goes_to_the_tail_of_an_empty_buffer(self):
        self.assertEqual(key_writes(pointers(0x1E, 0x1E), bounds(0x1E, 0x3E), 0x2D, 0x0C), (
            Write("key-slot", 0x41E, bytes((0x2D, 0x0C))), Write("key-tail", KEY_TAIL, struct.pack("<H", 0x20))))
        slot, tail = key_writes(pointers(0x2A, 0x2A), bounds(0x1E, 0x3E), 13, 28)
        self.assertEqual((slot.linear, tail.data), (0x42A, struct.pack("<H", 0x2C)))
        self.assertTrue(slot.bios and tail.bios)

    def test_tail_wraps_at_the_buffer_end(self):
        _, tail = key_writes(pointers(0x3C, 0x3C), bounds(0x1E, 0x3E), 0x1B, 0x01)
        self.assertEqual(tail.data, struct.pack("<H", 0x1E))
        _, tail = key_writes(pointers(0x60, 0x60), bounds(0x40, 0x62), 0x1B, 0x01)  # a relocated buffer
        self.assertEqual(tail.data, struct.pack("<H", 0x40))

    def test_buffer_must_be_empty_and_valid(self):
        self.assertRejected("key-buffer-busy", key_writes, pointers(0x1E, 0x20), bounds(0x1E, 0x3E), 13, 28)
        for head, tail, start, end in ((0x1E, 0x1E, 0x1E, 0x1E), (0x1E, 0x1E, 0x1E, 0x20), (0x1F, 0x1F, 0x1E, 0x3E),
                                       (0x3E, 0x3E, 0x1E, 0x3E), (0x1C, 0x1C, 0x1C, 0x3E), (0x1E, 0x1E, 0x1E, 0x102),
                                       (0x1E, 0x1E, 0x1F, 0x3F), (0x40, 0x40, 0x3E, 0x1E), (0x1E, 0x10, 0x1E, 0x3E)):
            with self.subTest(head=head, tail=tail, start=start, end=end):
                self.assertRejected("key-buffer-invalid", key_writes, pointers(head, tail), bounds(start, end), 1, 2)

    def test_shift_flags_change_only_the_named_bits(self):
        (write,) = shift_writes(b"\x60", (("ctrl", True), ("caps", False)))
        self.assertEqual((write.channel, write.linear, write.data), ("shift-flags", SHIFT_FLAGS, b"\x24"))
        (write,) = shift_writes(b"\x0f", (("alt", False), ("lshift", False), ("rshift", True)))
        self.assertEqual(write.data, b"\x05")
        self.assertTrue(write.bios)
        self.assertFalse(Write("device", 0x1000, b"\x80").bios)


if __name__ == "__main__":
    unittest.main()
