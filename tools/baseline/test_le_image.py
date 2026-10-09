import access_guard  # noqa: F401  (installs the no-original-access guard first)

import struct
import unittest

from le_image import PAGE_SIZE, LeImage
from locate import plan_window
from reasons import BaselineError
from synthetic import (DATA, EXECUTABLE, MZ_BYTES, FixupSpec, ObjectSpec, build_le, noise,
                       scenario_image, scenario_objects)


class LeImageTests(unittest.TestCase):
    def setUp(self):
        self.image = LeImage(scenario_image())

    def assertCode(self, code, call, *args):
        with self.assertRaises(BaselineError) as caught:
            call(*args)
        self.assertEqual(caught.exception.code, code)

    def test_object_table_and_stored_bytes(self):
        objects = scenario_objects()
        self.assertEqual([obj.number for obj in self.image.objects], [1, 2, 3, 4])
        self.assertTrue(self.image.object(2).executable)
        self.assertFalse(self.image.object(4).executable)
        self.assertEqual(self.image.object(4).preferred_base, 0x50000)
        self.assertEqual(self.image.stored_size(4), 2 * PAGE_SIZE)
        self.assertEqual(self.image.stored_size(1), 0x10)
        self.assertEqual(self.image.read(2, 0xFF0, 0x20), objects[1].data[0xFF0:0x1010])
        self.assertEqual(self.image.read(4, 0, 16), objects[3].data[:16])

    def test_reads_outside_stored_pages_are_rejected(self):
        self.assertCode("window-outside-image", self.image.read, 4, 2 * PAGE_SIZE - 8, 16)  # BSS
        self.assertCode("window-outside-image", self.image.read, 1, 0x08, 0x10)  # past the virtual size
        self.assertCode("window-outside-image", self.image.read, 2, -1, 4)
        self.assertCode("object-missing", self.image.object, 5)
        self.assertCode("object-missing", self.image.object, 0)

    def test_fixups_are_decoded_and_deduplicated_across_pages(self):
        fixups = self.image.fixups(2, 0x1F80, 160)
        self.assertEqual([fixup.location for fixup in fixups], [0x1F84, 0x1FA0, 0x1FB0, 0x1FC8, 0x1FD8, 0x1FFE])
        crossing = fixups[-1]
        self.assertTrue(crossing.pointer)
        self.assertEqual((crossing.target_object, crossing.target_offset), (4, 0x300))
        selector = fixups[4]
        self.assertFalse(selector.pointer)
        self.assertIsNone(selector.target_offset)
        self.assertFalse(fixups[2].pointer)  # self-relative
        narrow = self.image.fixups(2, 0x40, 4)[0]
        self.assertEqual((narrow.target_object, narrow.target_offset), (4, 0x120))
        self.assertTrue(narrow.pointer)
        imported = self.image.fixups(2, 0x80, 4)[0]
        self.assertFalse(imported.internal)
        self.assertFalse(imported.pointer)
        self.assertEqual(self.image.fixups(2, 0x2000, 1)[0].location, 0x1FFE)

    def test_window_plan_masks_relocations_and_keeps_whole_pointers(self):
        plan = plan_window(self.image, 2, 0x1F80, 160)
        self.assertEqual(len(plan.masked), 4 + 4 + 4 + 4 + 2 + 4)
        self.assertIn(0x1FFE - 0x1F80, plan.masked)
        self.assertEqual([fixup.location for fixup in plan.pointers], [0x1F84, 0x1FA0, 0x1FC8, 0x1FFE])
        edge = plan_window(self.image, 2, 0x1F80, 128)  # the crossing pointer is cut at the window end
        self.assertEqual({126, 127} & edge.masked, {126, 127})
        self.assertEqual([fixup.location for fixup in edge.pointers], [0x1F84, 0x1FA0, 0x1FC8])

    def test_structural_rejections(self):
        good = scenario_image()

        def patched(offset, value, size=4):
            data = bytearray(good)
            data[offset:offset + size] = value.to_bytes(size, "little")
            return bytes(data)

        header = MZ_BYTES
        cases = {
            "not-mz": b"ZM" + good[2:],
            "short": good[:0x20],
            "le-offset": patched(0x3C, len(good)),
            "signature": patched(header, 0x4C4C, 2),
            "byte-order": patched(header + 2, 1, 1),
            "page-size": patched(header + 0x28, 2048),
            "page-count": patched(header + 0x14, 0),
            "too-many-pages": patched(header + 0x14, 100000),
            "object-count": patched(header + 0x44, 0),
            "last-page": patched(header + 0x2C, 0),
            "data-pages": patched(header + 0x80, len(good)),
            "object-table": patched(header + 0x40, len(good)),
        }
        for name, data in cases.items():
            with self.subTest(name):
                self.assertCode("le-invalid", LeImage, data)

    def test_bad_page_references_and_fixup_tables(self):
        objects = [ObjectSpec(noise(9, PAGE_SIZE), PAGE_SIZE, EXECUTABLE, 0x10000),
                   ObjectSpec(noise(10, PAGE_SIZE), PAGE_SIZE, DATA, 0x20000)]
        data = bytearray(build_le(objects, [FixupSpec(1, 0x10, 2, 0x20)]))
        table = struct.unpack_from("<I", data, MZ_BYTES + 0x40)[0] + MZ_BYTES
        struct.pack_into("<I", data, table + 24 + 12, 7)  # object 2's first page beyond the page map
        self.assertCode("le-invalid", LeImage, bytes(data))

        data = bytearray(build_le(objects, [FixupSpec(1, 0x10, 2, 0x20)]))
        fixup_pages = struct.unpack_from("<I", data, MZ_BYTES + 0x68)[0] + MZ_BYTES
        struct.pack_into("<I", data, fixup_pages, 10)  # page 1 starts after page 2
        self.assertCode("le-invalid", LeImage, bytes(data))

        data = bytearray(build_le(objects, [FixupSpec(1, 0x10, 2, 0x20)]))
        records = struct.unpack_from("<I", data, MZ_BYTES + 0x6C)[0] + MZ_BYTES
        data[records] = 0x0F  # unknown source type
        self.assertCode("le-invalid", LeImage(bytes(data)).fixups, 1, 0, 32)

        data = bytearray(build_le(objects, [FixupSpec(1, 0x10, 2, 0x20)]))
        data[records + 4] = 9  # target object outside the object table
        self.assertCode("le-invalid", LeImage(bytes(data)).fixups, 1, 0, 32)

        truncated = build_le(objects, [FixupSpec(1, 0x10, 2, 0x20)])
        data = bytearray(truncated)
        fixup_pages = struct.unpack_from("<I", data, MZ_BYTES + 0x68)[0] + MZ_BYTES
        struct.pack_into("<I", data, fixup_pages + 4, 5)  # page 1 holds only 5 of its record's bytes
        self.assertCode("le-invalid", LeImage(bytes(data)).fixups, 1, 0, 32)

    def test_unstored_page_is_not_readable(self):
        data = bytearray(scenario_image())
        page_map = struct.unpack_from("<I", data, MZ_BYTES + 0x48)[0] + MZ_BYTES
        first = struct.unpack_from("<I", data, struct.unpack_from("<I", data, MZ_BYTES + 0x40)[0] + MZ_BYTES + 3 * 24
                                   + 12)[0]
        data[page_map + (first - 1) * 4 + 3] = 1  # object 4's first page is not stored in the file
        image = LeImage(bytes(data))
        self.assertEqual(image.stored_size(4), 0)
        self.assertCode("window-outside-image", image.read, 4, 0x400, 64)

    def test_fixup_list_and_additive_records_are_decoded(self):
        objects = [ObjectSpec(noise(11, PAGE_SIZE), PAGE_SIZE, EXECUTABLE, 0x10000)]
        # Rebuild with one source-list record (three locations) and one additive record by hand.
        listed = struct.pack("<BBBBI", 0x27, 0x10, 3, 1, 0x40) + struct.pack("<3h", 0x10, 0x20, 0x30)
        additive = struct.pack("<BBhBIH", 0x07, 0x14, 0x50, 1, 0x60, 2)
        records = listed + additive
        layout = build_le(objects, [FixupSpec(1, 0x10, 1, 0x40)])
        fixup_pages = struct.unpack_from("<I", layout, MZ_BYTES + 0x68)[0] + MZ_BYTES
        record_table = struct.unpack_from("<I", layout, MZ_BYTES + 0x6C)[0] + MZ_BYTES
        old = struct.unpack_from("<I", layout, fixup_pages + 4)[0]
        data = bytearray(layout[:record_table]) + records + layout[record_table + old:]
        struct.pack_into("<I", data, fixup_pages + 4, len(records))
        struct.pack_into("<I", data, MZ_BYTES + 0x80, struct.unpack_from("<I", layout, MZ_BYTES + 0x80)[0]
                         + len(records) - old)
        image = LeImage(bytes(data))
        fixups = image.fixups(1, 0, 0x60)
        self.assertEqual([fixup.location for fixup in fixups], [0x10, 0x20, 0x30, 0x50])
        self.assertTrue(all(fixup.pointer for fixup in fixups[:3]))
        self.assertTrue(fixups[3].additive)
        self.assertFalse(fixups[3].pointer)


if __name__ == "__main__":
    unittest.main()
