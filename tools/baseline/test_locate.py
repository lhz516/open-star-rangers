import access_guard  # noqa: F401  (installs the no-original-access guard first)

import json
import unittest
from unittest.mock import patch

import locate
from le_image import LeImage
from locate import AddressSpace, WindowRead, check_recipe_image, correlate_code, data_address, prove_mapping
from reasons import BaselineError
from recipe import Window, exe_fingerprint, parse_recipe
from synthetic import BASES, CODE_WINDOW, DATA_WINDOW, HEAP, noise, scenario_image, scenario_process, scenario_recipe

FLAT = AddressSpace(0, 0xFFFFFFFF)
CODE = Window(CODE_WINDOW[0], None, CODE_WINDOW[2])
DATA = Window(*DATA_WINDOW)


class LocateTests(unittest.TestCase):
    def setUp(self):
        self.image = LeImage(scenario_image())
        self.process = scenario_process()
        self.pc = BASES[2] + CODE_WINDOW[1]

    def code_read(self, linear=None, size=CODE.size):
        linear = self.pc if linear is None else linear
        return WindowRead(linear, self.process.window(linear, size))

    def establish(self, space=FLAT, window=CODE):
        match = correlate_code(self.image, window, self.code_read(size=window.size), space)
        linear = data_address(match, DATA)
        return prove_mapping(self.image, DATA, match, WindowRead(linear, self.process.window(linear, DATA.size)),
                             space, "pid:1")

    def assertCode(self, code, call, *args):
        with self.assertRaises(BaselineError) as caught:
            call(*args)
        self.assertEqual(caught.exception.code, code)

    def test_code_window_located_without_known_offset(self):
        match = correlate_code(self.image, CODE, self.code_read(), FLAT)
        self.assertEqual(match.offset, CODE_WINDOW[1])
        self.assertEqual(match.bases, {2: BASES[2], 4: BASES[4]})  # object 3 has only one derivation here
        self.assertEqual(match.proof["anchorChunks"], 3)
        self.assertEqual(match.proof["pointerDerivations"], {"4": 3, "3": 1})
        self.assertEqual(match.proof["maskedBytes"], 22)

    def test_mapping_derives_each_object_base_independently(self):
        mapping = self.establish()
        self.assertEqual(mapping.bases, {2: BASES[2], 3: BASES[3], 4: BASES[4]})
        deltas = {number: BASES[number] - self.image.object(number).preferred_base for number in (2, 3, 4)}
        self.assertEqual(len(set(deltas.values())), 3)
        self.assertFalse(mapping.proof["singleCommonShift"])
        self.assertEqual(mapping.proof["bases"]["4"], hex(BASES[4]))
        self.assertEqual(mapping.linear(4, 0x800, 4), BASES[4] + 0x800)
        self.assertEqual(mapping.linear(4, 4 * 4096 - 4, 4), BASES[4] + 4 * 4096 - 4)  # BSS is mapped memory
        self.assertCode("location-outside-object", mapping.linear, 4, 4 * 4096 - 2, 4)
        self.assertCode("location-outside-object", mapping.linear, 4, -1, 1)
        self.assertCode("object-unmapped", mapping.linear, 1, 0, 1)
        json.dumps(mapping.proof)

    def test_breakpoint_site_offset_must_be_the_match(self):
        at_site = Window(2, CODE_WINDOW[1], CODE.size)
        self.assertEqual(correlate_code(self.image, at_site, self.code_read(), FLAT).offset, CODE_WINDOW[1])
        elsewhere = Window(2, CODE_WINDOW[1] + 0x10, CODE.size)
        self.assertCode("code-unmatched", correlate_code, self.image, elsewhere, self.code_read(), FLAT)

    def test_segment_base_is_applied_to_pointer_values(self):
        self.process = scenario_process(space_base=0x1000)
        mapping = self.establish(AddressSpace(0x1000, 0xFFFFFFFF))
        self.assertEqual(mapping.bases, {2: BASES[2], 3: BASES[3], 4: BASES[4]})
        self.assertCode("data-mismatch", self.establish, FLAT)

    def test_incomplete_code_reads(self):
        self.process.faults.add((self.pc + 40) // 4096)
        self.assertCode("read-fault", correlate_code, self.image, CODE, self.code_read(), FLAT)
        self.process.faults.clear()
        self.process.short[self.pc] = 100
        self.assertCode("read-short", correlate_code, self.image, CODE, self.code_read(), FLAT)
        self.assertCode("read-invalid", correlate_code, self.image, CODE, WindowRead(self.pc, (256,) * 160), FLAT)
        self.assertCode("read-invalid", correlate_code, self.image, CODE, WindowRead(self.pc, (1,) * 161), FLAT)
        self.assertCode("read-invalid", correlate_code, self.image, CODE, WindowRead(-1, (1,) * 160), FLAT)

    def test_unknown_code_is_unmatched(self):
        self.process.poke(HEAP, noise(99, 160))
        self.assertCode("code-unmatched", correlate_code, self.image, CODE, self.code_read(HEAP), FLAT)
        self.assertCode("window-weak", correlate_code, self.image, CODE, self.code_read(HEAP + 0x2000), FLAT)

    def test_duplicated_code_is_ambiguous(self):
        self.image = LeImage(scenario_image(duplicate_code=True))
        self.process = scenario_process(duplicate_code=True)
        self.assertCode("code-ambiguous", correlate_code, self.image, CODE, self.code_read(), FLAT)
        with patch.object(locate, "MAX_CANDIDATES", 0):
            self.assertCode("code-ambiguous", correlate_code, self.image, CODE, self.code_read(), FLAT)

    def test_unsearched_fingerprint_leaves_uniqueness_unproven(self):
        with patch.object(locate, "MAX_CHUNK_HITS", 0):
            self.assertCode("code-unmatched", correlate_code, self.image, CODE, self.code_read(), FLAT)
            at_site = Window(2, CODE_WINDOW[1], CODE.size)
            self.assertCode("code-ambiguous", correlate_code, self.image, at_site, self.code_read(), FLAT)

    def test_contradicting_or_invalid_code_pointers(self):
        self.process.poke_u32(self.pc + 0x20, BASES[4] + 0x234 + 0x1000)
        self.assertCode("mapping-contradiction", correlate_code, self.image, CODE, self.code_read(), FLAT)
        self.process = scenario_process()
        self.process.poke_u32(self.pc + 0x4, 0x10)
        self.assertCode("base-invalid", correlate_code, self.image, CODE, self.code_read(), FLAT)

    def test_weak_or_misplaced_code_windows(self):
        self.assertCode("window-weak", correlate_code, self.image, Window(2, None, 64), self.code_read(size=64), FLAT)
        self.assertCode("object-not-executable", correlate_code, self.image, Window(4, None, 160), self.code_read(),
                        FLAT)
        self.assertCode("window-outside-image", correlate_code, self.image, Window(2, 0x3000, 160), self.code_read(),
                        FLAT)

    def test_data_window_rejections(self):
        match = correlate_code(self.image, CODE, self.code_read(), FLAT)
        linear = data_address(match, DATA)

        def prove(window=DATA, at=linear, owner="pid:1"):
            return prove_mapping(self.image, window, match, WindowRead(at, self.process.window(at, window.size)), FLAT,
                                 owner)

        self.assertCode("read-invalid", prove, DATA, linear + 4)
        self.assertCode("proof-ref-invalid", prove, DATA, linear, "")
        self.assertCode("window-weak", prove, Window(4, 0x440, 64), BASES[4] + 0x440)
        self.assertCode("object-unmapped", data_address, match, Window(3, 0, 64))
        self.process.faults.add(linear // 4096)
        self.assertCode("read-fault", prove)
        self.process.faults.clear()
        self.process.poke(linear + 0x30, bytes([self.process.peek(linear + 0x30, 1)[0] ^ 0xFF]))
        self.assertCode("data-mismatch", prove)
        self.process = scenario_process()
        self.process.poke_u32(linear, BASES[2] + 0x1000 + 0x10)
        self.assertCode("mapping-contradiction", prove)
        self.process = scenario_process()
        self.process.poke_u32(linear + 0x18, BASES[3] + 0x20 + 0x10)  # disagrees with the CODE window's object 3
        self.assertCode("mapping-contradiction", prove)

    def test_objects_must_lie_inside_the_address_space(self):
        for space in (AddressSpace(0, 0x1000), AddressSpace(0, BASES[2] + 0x1000), AddressSpace(BASES[2] + 0x100, 0xFFFF)):
            with self.subTest(space=space):
                self.assertCode("base-invalid", correlate_code, self.image, CODE, self.code_read(), space)
        # The CODE object fits, but object 4 (derived from pointers) lies beyond the limit.
        self.assertCode("base-invalid", correlate_code, self.image, CODE, self.code_read(),
                        AddressSpace(0, BASES[4] - 1))

    def test_address_space_values(self):
        for base, limit in ((-1, 0), (0, 1 << 32), ("0", 0)):
            self.assertCode("base-invalid", AddressSpace, base, limit)

    def test_recipe_locations_against_image(self):
        sha = exe_fingerprint(scenario_image())

        def check(changes=None):
            document = scenario_recipe(sha)
            for path, value in (changes or {}).items():
                target = document
                keys = path.split("/")
                for key in keys[:-1]:
                    target = target[int(key)] if isinstance(target, list) else target[key]
                target[keys[-1]] = value
            check_recipe_image(parse_recipe(json.dumps(document)), self.image)

        check()
        cases = (
            ("object-missing", {"fields/0/address/object": 5}),
            ("location-outside-object", {"fields/0/address/offset": 4 * 4096 - 2}),
            ("location-outside-object", {"fields/6/address/offset": 4 * 4096 - 2}),
            ("object-not-executable", {"pauses/0/stop/object": 4}),
            ("location-outside-object", {"pauses/0/stop/offset": 3 * 4096 + 0x100}),
            ("object-missing", {"pauses/0/stop/object": 9}),
            ("object-not-executable", {"correlation/code/object": 4}),
            ("window-outside-image", {"correlation/code/offset": 3 * 4096 - 64}),
            ("window-outside-image", {"correlation/data/offset": 2 * 4096 + 16}),
            ("window-weak", {"correlation/data/offset": 0x440}),
            ("object-missing", {"correlation/data/object": 6}),
        )
        for code, changes in cases:
            with self.subTest(code=code, changes=changes):
                self.assertCode(code, check, changes)


if __name__ == "__main__":
    unittest.main()
