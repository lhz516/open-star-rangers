import access_guard  # noqa: F401  (installs the no-original-access guard first)

import dataclasses
import json
import math
import struct
import unittest

from le_image import LeImage
from locate import AddressSpace
from qualify import (PauseEvidence, ReadBudget, ReadResult, StopProof, collect_pause, judge_pause, read_error)
from reasons import REASON_SET, BaselineError
from recipe import exe_fingerprint, parse_recipe
from synthetic import BASES, FIELD_VALUES, HEAP, establish, scenario_image, scenario_process, scenario_recipe

REFS = {"mapping": "mapping.json", "identity": "pauses/start/identity.json", "reads": "pauses/start/reads.json"}
MISSION = {"group": 0, "slot": 1}
CONFIG = {"difficulty": 19, "wingman": "none"}
DATA = BASES[4]


class QualifyTests(unittest.TestCase):
    def setUp(self):
        data = scenario_image()
        self.image = LeImage(data)
        self.recipe = parse_recipe(json.dumps(scenario_recipe(exe_fingerprint(data))))
        self.process = scenario_process()
        self.mapping = establish(self.image, self.recipe, self.process)
        self.process.reads.clear()

    def judge(self, pause="start", mapping=None, budget=4096, stop=True, mission=MISSION, config=CONFIG, refs=REFS,
              reads=None):
        mapping = mapping or self.mapping
        if reads is None:
            reads = collect_pause(self.recipe, pause, mapping, self.process, ReadBudget(budget))
        evidence = PauseEvidence(reads, StopProof(stop, "pauses/start/stop.json"), mission, config, refs)
        samples = judge_pause(self.recipe, mapping, evidence)
        for sample in samples:
            self.assertTrue(set(sample.reasons) <= REASON_SET)
            self.assertEqual(sample.qualified, sample.value is not None)
        return {sample.field: sample for sample in samples}

    def assertOnly(self, samples, field, code):
        self.assertIn(code, samples[field].reasons)
        self.assertIsNone(samples[field].value)
        for name, sample in samples.items():
            if name != field:
                self.assertTrue(sample.qualified, name)

    def test_qualified_readings(self):
        samples = self.judge()
        self.assertEqual(list(samples), ["ticks", "delta", "flag", "speed", "neg", "count", "chained", "scenario"])
        self.assertEqual({name: sample.value for name, sample in samples.items()}, FIELD_VALUES)
        self.assertTrue(all(sample.qualified for sample in samples.values()))
        self.assertIsInstance(samples["speed"].value, float)
        self.assertEqual(samples["flag"].value, 0)  # a zero reading is a valid reading
        record = samples["ticks"].to_json()
        self.assertEqual(record["status"], "qualified")
        self.assertEqual(record["unit"], "tick")
        self.assertEqual(record["reasons"], [])
        self.assertEqual(record["proof"], {"mapping": "mapping.json", "stop": "pauses/start/stop.json",
                                           "identity": REFS["identity"], "readability": REFS["reads"],
                                           "repeat": REFS["reads"]})
        reads = [read for read in self.process.reads if read == (DATA + 0x800, 4)]
        self.assertEqual(len(reads), 2)  # repeated within the pause
        self.assertEqual(len(self.judge("end")), 2)

    def test_low_page_field_reads_its_linear_address(self):
        document = scenario_recipe(exe_fingerprint(scenario_image()))
        document["fields"].append({"id": "vector", "address": {"low": 0x2C}, "type": "f32", "unit": "raw"})
        document["pauses"][0]["fields"].append("vector")
        self.recipe = parse_recipe(json.dumps(document))
        self.process.poke(0x2C, struct.pack("<f", 12.5))
        samples = self.judge()
        self.assertTrue(samples["vector"].qualified)
        self.assertEqual(samples["vector"].value, 12.5)
        self.assertEqual([read for read in self.process.reads if read == (0x2C, 4)], [(0x2C, 4), (0x2C, 4)])

    def test_zero_ticks_is_qualified(self):
        self.process.poke_u32(DATA + 0x800, 0)
        samples = self.judge()
        self.assertTrue(samples["ticks"].qualified)
        self.assertEqual(samples["ticks"].value, 0)

    def test_pointer_chain_rejections(self):
        cases = (
            ("pointer-null", DATA + 0x820, 0),
            ("pointer-null", HEAP + 0x10, 0),
            ("pointer-cycle", DATA + 0x820, DATA + 0x820 - 0x10),
            ("pointer-overflow", DATA + 0x820, 0xFFFFFFF8),
            ("pointer-overflow", HEAP + 0x10, 0xFFFFFFFA),
        )
        for code, at, value in cases:
            with self.subTest(code=code, at=hex(at)):
                self.process = scenario_process()
                self.process.poke_u32(at, value)
                self.assertOnly(self.judge(), "chained", code)

    def test_pointer_outside_the_address_space_limit(self):
        narrow = dataclasses.replace(self.mapping, space=AddressSpace(0, HEAP + 0x100))
        self.assertOnly(self.judge(mapping=narrow), "chained", "pointer-out-of-range")

    def test_fault_markers_and_short_reads(self):
        self.process.faults.add((HEAP + 0x1008) // 4096)
        self.assertOnly(self.judge(), "chained", "read-fault")
        self.process.faults = {HEAP // 4096}
        self.assertOnly(self.judge(), "chained", "read-fault")
        self.process.faults = set()
        self.process.short[DATA + 0x800] = 2
        self.assertOnly(self.judge(), "ticks", "read-short")

    def test_malformed_read_results(self):
        self.assertEqual(read_error(ReadResult((1, 2, 300, 4)), 4), "read-invalid")
        self.assertEqual(read_error(ReadResult((1, 2, 3, 4, 5)), 4), "read-invalid")
        self.assertEqual(read_error(ReadResult((1, 2, 3, 4), {"page": 1}), 4), "read-invalid")
        self.assertEqual(read_error(ReadResult((1, None, 3)), 4), "read-fault")
        self.assertEqual(read_error(ReadResult((0, 0, 0, 0)), 4), None)

    def test_repeated_reads_must_agree(self):
        seen = []

        def advance(process, linear, size):
            if linear == DATA + 0x800:
                seen.append(linear)
                if len(seen) == 2:
                    process.poke_u32(DATA + 0x800, FIELD_VALUES["ticks"] + 1)

        self.process.on_read = advance
        self.assertOnly(self.judge(), "ticks", "repeat-mismatch")

    def test_fewer_passes_than_required(self):
        reads = collect_pause(self.recipe, "start", self.mapping, self.process, ReadBudget(4096))
        samples = self.judge(reads=dataclasses.replace(reads, passes=reads.passes[:1]))
        self.assertTrue(all("repeat-insufficient" in sample.reasons for sample in samples.values()))
        partial = ({name: walk for name, walk in reads.passes[0].items() if name != "count"}, reads.passes[1])
        self.assertOnly(self.judge(reads=dataclasses.replace(reads, passes=partial)), "count", "repeat-insufficient")

    def test_page_mapping_must_be_unchanged_and_verified(self):
        page = (DATA + 0x800) // 4096

        def remap(process, linear, size):
            if linear == DATA + 0x800:
                process.physical[page] = 0x77777

        self.process.on_read = remap
        samples = self.judge()
        self.assertIn("mapping-changed", samples["ticks"].reasons)
        self.assertIn("mapping-changed", samples["scenario"].reasons)  # same page

        self.process = scenario_process()
        self.process.report_pages = False  # chain pages then have no lookup before the reads
        self.assertOnly(self.judge(), "chained", "mapping-unverified")

        self.process = scenario_process()
        self.process.physical[HEAP // 4096] = None
        self.assertOnly(self.judge(), "chained", "mapping-unverified")

        self.process = scenario_process()
        self.process.hide_pages.append(HEAP + 0x1008)  # only the first of two reads of a pointer-reached page
        self.assertOnly(self.judge(), "chained", "mapping-unverified")
        self.process = scenario_process()
        self.process.hide_pages.append(DATA + 0x800)  # a static page is covered by the state before the reads
        self.assertTrue(self.judge()["ticks"].qualified)

    def test_owner_must_be_the_mapped_process(self):
        def switch(process, linear, size):
            process.owner = "pid:2"

        self.process.on_read = switch
        self.assertTrue(all("owner-changed" in s.reasons for s in self.judge().values()))
        self.process = scenario_process(owner="pid:3")
        self.assertTrue(all("owner-changed" in s.reasons for s in self.judge().values()))

    def test_identity_must_match(self):
        for mission, config in (({"group": 0, "slot": 2}, CONFIG), (MISSION, {"difficulty": 19.0, "wingman": "none"}),
                                (MISSION, {"difficulty": 19}), ({"group": False, "slot": 1}, CONFIG)):
            samples = self.judge(mission=mission, config=config)
            self.assertTrue(all(s.reasons == ("identity-mismatch",) and s.value is None for s in samples.values()))
        self.process.poke(DATA + 0x830, struct.pack("<i", 1))
        samples = self.judge()
        self.assertTrue(all("identity-mismatch" in s.reasons and s.value is None for s in samples.values()))
        self.process = scenario_process()
        self.process.short[DATA + 0x830] = 1
        samples = self.judge()
        self.assertTrue(all("identity-mismatch" in s.reasons for s in samples.values()))

    def test_stop_must_be_verified(self):
        for stop in (False, None, 1):
            self.assertTrue(all("stop-unverified" in s.reasons for s in self.judge(stop=stop).values()))

    def test_non_finite_floats(self):
        for bits in (0x7FC00000, 0x7F800000, 0xFF800000):
            self.process.poke_u32(DATA + 0x808, bits)
            self.assertOnly(self.judge(), "speed", "value-nonfinite")
        self.process.poke_u32(DATA + 0x808, 0x80000000)
        value = self.judge()["speed"].value
        self.assertEqual(value, 0.0)
        self.assertTrue(math.copysign(1, value) < 0)

    def test_read_budget(self):
        with self.assertRaises(BaselineError) as caught:
            self.judge(budget=10)
        self.assertEqual(caught.exception.code, "budget-exceeded")

    def test_unmapped_object_or_location_outside_it(self):
        unmapped = dataclasses.replace(self.mapping, bases={2: BASES[2]})
        samples = self.judge(mapping=unmapped)
        self.assertTrue(all("object-unmapped" in s.reasons and s.value is None for s in samples.values()))
        small = dataclasses.replace(self.mapping, extents={**self.mapping.extents, 4: 0x810})
        samples = self.judge(mapping=small)
        self.assertEqual(samples["neg"].reasons, ("identity-mismatch",))  # the identity field is out of range
        for name in ("count", "chained", "scenario"):
            self.assertIn("location-outside-object", samples[name].reasons)

    def test_proof_references(self):
        for refs in ({**REFS, "mapping": "/Users/someone/run/mapping.json"}, {**REFS, "reads": "../reads.json"},
                     {**REFS, "reads": "a/../../b"}, {**REFS, "identity": "C:\\x"}, {"mapping": "m"},
                     {**REFS, "extra": "x"}):
            with self.assertRaises(BaselineError) as caught:
                self.judge(refs=refs)
            self.assertEqual(caught.exception.code, "proof-ref-invalid")


if __name__ == "__main__":
    unittest.main()
