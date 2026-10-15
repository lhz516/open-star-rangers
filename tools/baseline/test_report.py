import access_guard  # noqa: F401  (installs the no-original-access guard first)

import dataclasses
import json
import unittest

from le_image import LeImage
from qualify import PauseEvidence, ReadBudget, StopProof, collect_pause, judge_pause
from reasons import BaselineError
from recipe import exe_fingerprint, parse_recipe
from report import build_report, serialize, summary
from synthetic import FIELD_VALUES, establish, scenario_image, scenario_process, scenario_recipe

REFS = {"mapping": "mapping.json", "identity": "identity.json", "reads": "reads.json"}
MISSION = {"group": 0, "slot": 1}
CONFIG = {"difficulty": 19, "wingman": "none"}


class ReportTests(unittest.TestCase):
    def setUp(self):
        data = scenario_image()
        self.sha = exe_fingerprint(data)
        self.image = LeImage(data)
        self.recipe = self.parse()
        self.process = scenario_process()
        self.mapping = establish(self.image, self.recipe, self.process)

    def parse(self, change=None):
        document = scenario_recipe(self.sha)
        if change:
            change(document)
        return parse_recipe(json.dumps(document))

    def samples(self, recipe=None, pauses=("start", "end")):
        recipe = recipe or self.recipe
        result = []
        for pause in pauses:
            reads = collect_pause(recipe, pause, self.mapping, self.process, ReadBudget(4096))
            evidence = PauseEvidence(reads, StopProof(True, "stop.json"), MISSION, CONFIG, REFS)
            result += judge_pause(recipe, self.mapping, evidence)
        return result

    def build(self, **changes):
        arguments = dict(
            recipe=self.recipe, run_id="run-0001", tool={"version": "1", "source": "git:abc1234"},
            source={"baselineVersion": "synthetic-1", "exeSha256": self.sha},
            environment={"emulator": "synthetic", "host": "test"}, game_config={"cycles": 1000, "sound": False},
            run_start={"monotonic": 1.0}, run_end={"monotonic": 2.5}, samples=self.samples(),
            integrity={"passed": True, "files": 3}, cleanup={"passed": True, "processes": 1})
        arguments.update(changes)
        return build_report(**arguments)

    def assertFailed(self, report, code, status="failed"):
        self.assertEqual(report["status"], status)
        self.assertIn(code, report["reasons"])

    def test_complete_report(self):
        report = self.build()
        self.assertEqual(report["status"], "complete")
        self.assertEqual(report["reasons"], [])
        self.assertEqual(report["schemaVersion"], 1)
        self.assertEqual(report["recipe"], {"id": "synthetic-timebase", "fingerprint": self.recipe.fingerprint})
        self.assertEqual(report["counts"], {"planned": 10, "actual": 10, "qualified": 10, "requiredPlanned": 10,
                                            "requiredQualified": 10})
        self.assertEqual([(s["pause"], s["field"]) for s in report["samples"]], list(self.recipe.planned()))
        text = serialize(report)
        self.assertEqual(json.loads(text)["samples"][0]["value"], FIELD_VALUES["ticks"])
        line = summary(report)
        self.assertEqual(line, "status=complete reasons=- samples=10/10 qualified=10")

    def test_unfinished_run_is_the_initial_state(self):
        self.assertFailed(self.build(run_end=None, samples=[]), "run-unfinished")
        self.assertFailed(self.build(run_end=None), "run-unfinished")

    def test_zero_missing_and_prefix_samples(self):
        empty = self.build(samples=[])
        self.assertFailed(empty, "samples-empty")
        self.assertEqual(empty["counts"]["actual"], 0)
        prefix = self.build(samples=self.samples(pauses=("start",)))
        self.assertFailed(prefix, "samples-missing")
        self.assertEqual(prefix["counts"]["qualified"], 8)
        self.assertFailed(self.build(samples=self.samples()[:-1]), "samples-missing")

    def test_unplanned_duplicate_and_reordered_samples(self):
        samples = self.samples()
        self.assertFailed(self.build(samples=samples + samples[-1:]), "samples-order")
        self.assertFailed(self.build(samples=samples[1:] + samples[:1]), "samples-order")
        stray = dataclasses.replace(samples[0], pause="middle")
        self.assertFailed(self.build(samples=[stray] + samples[1:]), "samples-unplanned")

    def test_unqualified_samples(self):
        self.process.poke_u32(self.mapping.bases[4] + 0x820, 0)
        report = self.build()
        self.assertFailed(report, "samples-unqualified")
        chained = [s for s in json.loads(serialize(report))["samples"] if s["field"] == "chained"][0]
        self.assertIsNone(chained["value"])
        self.assertEqual(chained["status"], "unqualified")
        self.assertEqual(chained["reasons"], ["pointer-null"])

    def test_unqualified_optional_sample_does_not_fail(self):
        recipe = self.parse(lambda d: d["fields"][6].update(required=False))
        self.process.poke_u32(self.mapping.bases[4] + 0x820, 0)
        report = self.build(recipe=recipe, samples=self.samples(recipe))
        self.assertEqual(report["status"], "complete")
        self.assertEqual(report["counts"]["requiredPlanned"], 9)
        self.assertEqual(report["counts"]["qualified"], 9)

    def test_integrity_cleanup_cancel_and_session_failures(self):
        self.assertFailed(self.build(integrity={"passed": False, "changed": 1}), "integrity-failed")
        self.assertFailed(self.build(integrity={"files": 3}), "integrity-failed")
        self.assertFailed(self.build(integrity={"passed": "yes"}), "integrity-failed")
        self.assertFailed(self.build(cleanup={"passed": False}), "cleanup-failed")
        self.assertFailed(self.build(cancelled=True), "run-cancelled", "cancelled")
        self.assertFailed(self.build(cancelled=True, cleanup={"passed": False}), "cleanup-failed", "cancelled")
        self.assertFailed(self.build(failures=("budget-exceeded",)), "budget-exceeded")
        self.assertFailed(self.build(source={"baselineVersion": "synthetic-2", "exeSha256": self.sha}),
                          "source-mismatch")

    def test_every_reading_rejection_prevents_completion(self):
        data = self.mapping.bases[4]
        injections = {
            "read-fault": lambda p: p.faults.add(data // 4096),
            "read-short": lambda p: p.short.update({data + 0x804: 1}),
            "pointer-null": lambda p: p.poke_u32(data + 0x820, 0),
            "identity-mismatch": lambda p: p.poke_u32(data + 0x830, 1),
            "mapping-changed": lambda p: setattr(p, "on_read", lambda q, linear, size: q.physical.update(
                {data // 4096: len(q.reads)})),
            "repeat-mismatch": lambda p: setattr(p, "on_read", lambda q, linear, size: q.poke_u32(
                data + 0x800, len(q.reads))),
        }
        for code, inject in injections.items():
            with self.subTest(code):
                self.process = scenario_process()
                inject(self.process)
                report = self.build()
                self.assertFailed(report, "samples-unqualified")
                self.assertTrue(any(code in sample["reasons"] and sample["value"] is None
                                    for sample in report["samples"]))
        for code in ("source-mismatch", "code-unmatched", "code-ambiguous", "data-mismatch", "mapping-contradiction",
                     "object-unmapped", "recipe-version-unsupported", "budget-exceeded"):
            with self.subTest(code):
                self.assertFailed(self.build(samples=[], failures=(code,)), code)

    def test_invalid_report_inputs(self):
        samples = self.samples()
        broken = dataclasses.replace(samples[0], value=None)
        cases = (
            {"run_id": "../escape"},
            {"run_id": ""},
            {"tool": {"version": "1"}},
            {"tool": {"version": "1", "source": "/Users/someone/tool"}},
            {"environment": {}},
            {"game_config": {"cycles": float("nan")}},
            {"run_start": None},
            {"integrity": None},
            {"failures": ("not-a-code",)},
            {"cancelled": "no"},
            {"samples": [broken] + samples[1:]},
            {"samples": [samples[0].to_json()]},
        )
        for changes in cases:
            with self.subTest(changes=list(changes)):
                with self.assertRaises(BaselineError) as caught:
                    self.build(**changes)
                self.assertEqual(caught.exception.code, "report-invalid")

    def test_one_shot_iterables_are_read_once(self):
        report = self.build(samples=(sample for sample in self.samples()))
        self.assertEqual(report["status"], "complete")
        self.assertEqual(len(report["samples"]), 10)
        self.assertFailed(self.build(failures=(code for code in ("budget-exceeded",))), "budget-exceeded")

    def test_samples_must_match_the_recipe_contract(self):
        samples = self.samples()
        first = samples[0]
        cases = (
            dataclasses.replace(first, type="f32"),
            dataclasses.replace(first, unit="wrong"),
            dataclasses.replace(first, required=False),
            dataclasses.replace(first, field="unknown"),
            dataclasses.replace(first, value="not-a-number"),
            dataclasses.replace(first, value=-1),
            dataclasses.replace(first, value=1 << 32),
            dataclasses.replace(first, value=True),
            dataclasses.replace(first, value=None),
            dataclasses.replace(first, reasons=("made-up",)),
            dataclasses.replace(first, reasons=["read-fault"], value=None),
            dataclasses.replace(first, reasons=("run-cancelled", "read-fault"), value=None),
            dataclasses.replace(first, reasons=("read-fault",)),
            dataclasses.replace(first, proof={**first.proof, "stop": "/Users/someone/stop.json"}),
            dataclasses.replace(first, proof={"mapping": "m"}),
            dataclasses.replace(samples[3], value=float("nan")),
            dataclasses.replace(samples[3], value=2),
        )
        for index, broken in enumerate(cases):
            with self.subTest(index):
                position = 3 if broken.field == "speed" else 0
                with self.assertRaises(BaselineError) as caught:
                    self.build(samples=samples[:position] + [broken] + samples[position + 1:])
                self.assertEqual(caught.exception.code, "report-invalid")

    def test_stimuli_must_all_be_applied_in_order(self):
        def declare(d):
            d["stimuli"] = [{"id": "enter", "pause": "start", "kind": "key", "ascii": 13, "scan": 28},
                            {"id": "ctrl", "pause": "end", "kind": "shift", "flags": {"ctrl": True}}]
        recipe = self.parse(declare)
        applied = [{"id": "enter", "pause": "start", "kind": "key", "status": "applied", "writes": [
                       {"channel": "key-slot", "linear": "0000041e", "before": "0000", "written": "0d1c",
                        "readback": "0d1c", "pages": {"0": "0"}}]},
                   {"id": "ctrl", "pause": "end", "kind": "shift", "status": "applied"}]
        report = self.build(recipe=recipe, samples=self.samples(recipe), stimuli=applied)
        self.assertEqual(report["status"], "complete")
        self.assertEqual(report["stimuli"], applied)
        self.assertEqual((report["counts"]["stimuliPlanned"], report["counts"]["stimuliApplied"]), (2, 2))
        failed = [applied[0], {**applied[1], "status": "stimulus-unverified", "detail": "readback-mismatch"}]
        for records in ([], applied[:1], applied[::-1], failed, None):
            with self.subTest(records=records):
                report = self.build(recipe=recipe, samples=self.samples(recipe), stimuli=records)
                self.assertFailed(report, "stimuli-missing")
        self.assertEqual(report["counts"]["stimuliApplied"], 0)
        for records in ([1], [{"id": float("nan")}]):
            with self.assertRaises(BaselineError) as caught:
                self.build(recipe=recipe, samples=self.samples(recipe), stimuli=records)
            self.assertEqual(caught.exception.code, "report-invalid")
        conditional = self.parse(lambda d: (declare(d), d["stimuli"][1].update(
            {"if": {"pause": "start", "field": "scenario", "equals": 1}})))
        evidence = {"pause": "start", "field": "scenario", "equals": "1", "reading": "1092"}
        unselected = [applied[0], {**applied[1], "status": "not-selected", "condition": evidence}]
        report = self.build(recipe=conditional, samples=self.samples(conditional), stimuli=unselected)
        self.assertEqual((report["status"], report["counts"]["stimuliApplied"], report["counts"]["stimuliNotSelected"]),
                         ("complete", 1, 1))
        broken = (
            (recipe, unselected),  # an unconditional stimulus is never left unselected
            (conditional, [applied[0], {**applied[1], "status": "not-selected"}]),  # no condition evidence
            (conditional, [applied[0], {**unselected[1], "condition": {**evidence, "field": "ticks"}}]),
            (conditional, [applied[0], {**unselected[1], "condition": {**evidence, "reading": "1"}}]),  # contradicts
            (conditional, [applied[0], {**unselected[1], "condition": {**evidence, "reading": "x"}}]),
            (conditional, [applied[0], {**applied[1], "condition": evidence}]),  # applied although the reading differs
        )
        for index, (which, records) in enumerate(broken):
            with self.subTest(index=index), self.assertRaises(BaselineError) as caught:
                self.build(recipe=which, samples=self.samples(which), stimuli=records)
            self.assertEqual(caught.exception.code, "report-invalid")
        plain = self.build(stimuli=applied)  # a recipe without stimuli reports none
        self.assertNotIn("stimuli", plain)
        self.assertNotIn("stimuliPlanned", plain["counts"])

    def test_serialization_rejects_non_finite_numbers(self):
        report = self.build()
        report["environment"]["drift"] = float("inf")
        with self.assertRaises(BaselineError) as caught:
            serialize(report)
        self.assertEqual(caught.exception.code, "report-invalid")

    def test_summary_carries_no_values(self):
        line = summary(self.build(cleanup={"passed": False}))
        self.assertEqual(line, "status=failed reasons=cleanup-failed samples=10/10 qualified=10")


if __name__ == "__main__":
    unittest.main()
