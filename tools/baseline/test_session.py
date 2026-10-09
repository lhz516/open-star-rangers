import access_guard  # noqa: F401  (installs the no-original-access guard first)

import json
import os
import struct
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import measure
import runfiles
from fake_debugger import CODE_SITE
from reasons import REASON_SET
from sandbox import Sandbox
from synthetic import BASES, HEAP

DATA = BASES[4]
TICKS = DATA + 0x800
SPEED = DATA + 0x808
CHAIN = DATA + 0x820
SCENARIO = DATA + 0x830


def after_bp(action):
    """An on_command hook that applies `action(fake)` once, at the first command after the breakpoint is armed."""
    state = {"armed": False, "done": False}

    def hook(fake, text):
        if text.startswith("BP "):
            state["armed"] = True
        elif state["armed"] and not state["done"] and text == "RUN":
            state["done"] = True
            action(fake)
    return hook


def on_dv(address, action):
    def hook(fake, text):
        if text == f"DV {address:08X}":
            action(fake)
    return hook


class SessionTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)

    def box(self, **options):
        return Sandbox(self.tmp.name, **options)

    def assertTerminalSafe(self, box):
        self.assertTrue(box.lines)
        for line in box.lines:
            self.assertNotIn(self.tmp.name, line)
            self.assertNotIn(os.path.realpath(self.tmp.name), line)
            for item in line.split():
                key, _, value = item.partition("=")
                self.assertRegex(key, r"^[a-z]+$")
                if key in ("report", "signal"):
                    self.assertTrue(value.startswith("local/research/") and ".." not in value, line)
                else:
                    self.assertRegex(value, r"^(?:-|[A-Za-z0-9][A-Za-z0-9,._/-]*)$")
                if key == "reasons" and value != "-":
                    self.assertTrue(set(value.split(",")) <= REASON_SET, line)

    def assertRejected(self, box, code, new_dir=True, **run):
        exit_code = box.run(**run)
        self.assertEqual(exit_code, 2)
        self.assertEqual(box.lines[-1], f"status=rejected reasons={code}")
        if new_dir:
            self.assertFalse(os.path.lexists(box.run_dir))
        self.assertEqual(box.launches, [])
        self.assertTrue(box.unchanged_outside_run())
        self.assertTerminalSafe(box)

    def assertFailed(self, box, code, exit_code=1, launched=True, sample=False, **run):
        result = box.run(**run)
        self.assertEqual(result, exit_code)
        report = box.report()
        self.assertNotEqual(report["status"], "complete")
        if sample:
            self.assertIn("samples-unqualified", report["reasons"])
            self.assertTrue(any(code in item["reasons"] and item["value"] is None for item in report["samples"]),
                            [item["reasons"] for item in report["samples"]])
            for item in report["samples"]:
                for ref in item["proof"].values():
                    self.assertTrue((box.run_dir / ref).is_file(), ref)
        else:
            self.assertIn(code, report["reasons"])
        self.assertTrue(box.unchanged_outside_run())
        self.assertEqual(bool(box.transport.reclaimed), launched)
        self.assertTerminalSafe(box)
        return report

    # -- complete runs -------------------------------------------------------------------------------------------
    def test_complete_run(self):
        box = self.box()
        self.assertEqual(box.run(), 0)
        report = box.report()
        self.assertEqual((report["status"], report["reasons"]), ("complete", []))
        self.assertEqual(report["counts"], {"planned": 10, "actual": 10, "qualified": 10, "requiredPlanned": 10,
                                            "requiredQualified": 10})
        values = {(item["pause"], item["field"]): item["value"] for item in report["samples"]}
        self.assertEqual(values[("start", "flag")], 0)  # a zero reading is a qualified reading
        self.assertEqual(values[("start", "chained")], 99)
        self.assertEqual(report["source"]["baselineVersion"], box.version)
        self.assertTrue(report["integrity"]["passed"])
        self.assertTrue(report["cleanup"]["passed"])
        self.assertEqual(report["environment"]["mode"], "measure")
        self.assertEqual(report["environment"]["emulator"]["changes"], {"captures": 1, "mount-c": 1})
        self.assertEqual(report["environment"]["privateCopy"]["files"], 4)
        self.assertEqual(report["run"]["end"]["endedBy"], "completed")
        for item in report["samples"]:
            for ref in item["proof"].values():
                self.assertTrue((box.run_dir / ref).is_file(), ref)
        stop = json.loads((box.run_dir / "pauses/start/stop.json").read_text())
        self.assertEqual(stop["registration"]["listed"], [f"0258:{BASES[2] + 0x1F90:08x}"])
        self.assertTrue(stop["registersUnchangedAfterReads"])
        argv, cwd = box.launches[0]
        self.assertEqual(argv[:2], ["fake-dosbox-x", "-conf"])
        self.assertIn("-break-start", argv)
        self.assertEqual(cwd, str(box.run_dir))
        config = (box.run_dir / "dosbox-x.conf").read_text()
        self.assertIn(f"mount c {box.run_dir / 'install'}", config)
        self.assertNotIn(f"mount c {box.install}\n", config)
        self.assertEqual(box.lines[-1], "status=complete reasons=- samples=10/10 qualified=10 "
                                        "report=local/research/p3-01/tool-smoke/run-01/report.json")
        self.assertTrue(box.unchanged_outside_run())
        self.assertFalse((box.run_dir / "protection" / "before").exists())
        self.assertTerminalSafe(box)

    def test_smoke_run_takes_pauses_without_operator(self):
        box = self.box(smoke_identity=True)
        self.assertEqual(box.run(smoke=True), 0)
        report = box.report()
        self.assertEqual(report["status"], "complete")
        self.assertEqual(report["environment"]["mode"], "smoke")
        self.assertFalse(report["environment"]["measurementEvidence"])
        self.assertNotIn("awaiting-confirmation", [status["phase"] for status in box.statuses])
        identity = json.loads((box.run_dir / "pauses/start/identity.json").read_text())
        self.assertEqual((identity["mission"], identity["config"], identity["source"]),
                         ({"context": "startup"}, {"cycles": 40000}, "smoke"))

    def test_recipe_cycles_setting_and_observed_identity(self):
        box = self.box()
        box.document["emulator"] = {"cycles": 30000}
        box.document["identity"]["config"]["cycles"] = 30000
        box.write_recipe(box.document)
        box.answers = {"start": [{"action": "confirm", "mission": {"group": 0, "slot": 1},
                                  "config": {"difficulty": 19, "wingman": "none", "cycles": 99}}]}
        self.assertEqual(box.run(), 0)
        report = box.report()
        self.assertEqual(report["environment"]["emulator"]["settings"]["cycles"], 30000)
        self.assertEqual(report["environment"]["emulator"]["changes"]["cycles"], 1)
        self.assertIn("cycles          = fixed 30000", (box.run_dir / "dosbox-x.conf").read_text())
        identity = json.loads((box.run_dir / "pauses/start/identity.json").read_text())
        self.assertEqual(identity["config"]["cycles"], 30000)  # observed by the tool, not declared

    def test_operator_skip_resumes_to_the_next_hit(self):
        box = self.box()
        box.answers = {"start": [{"action": "skip"}]}
        self.assertEqual(box.run(), 0)
        self.assertTrue((box.run_dir / "operator/start-0.json").is_file())
        self.assertTrue((box.run_dir / "operator/start-1.json").is_file())
        self.assertEqual(sum(write == b"RUN\n" for write in box.transport.writes), 2)

    def test_command_line_entry(self):
        box = self.box()
        box.before = box.snapshot()
        self.assertEqual(measure.main(["baseline-version"], env=box.env), 0)
        self.assertEqual(box.lines[-1], f"baselineVersion={box.version} exeSha256={box.document['source']['exeSha256']}")
        box.run_id = "cli"
        self.assertEqual(measure.main(["run", "--recipe", str(box.recipe_path), "--out", str(box.out),
                                       "--run-id", "cli"], env=box.env), 0)
        self.assertEqual(box.report()["status"], "complete")
        self.assertTrue(box.unchanged_outside_run())
        with self.assertRaises(SystemExit) as caught:
            measure.main(["run", "--recipe", str(box.recipe_path)], env=box.env)
        self.assertEqual(caught.exception.code, 2)

    # -- rejections before any side effect --------------------------------------------------------------------------
    def test_recipe_rejections_at_the_command_line(self):
        cases = {
            "recipe-version-unsupported": lambda d: d.update(schemaVersion=2),
            "recipe-key-unknown": lambda d: d.update(command="BPDEL *"),
            "recipe-type-invalid": lambda d: d["fields"][0].update(type=7),
            "recipe-value-invalid": lambda d: d["fields"][0].update(type="f64"),
            "recipe-empty": lambda d: d.update(pauses=[]),
            "recipe-address-invalid": lambda d: d["fields"][0]["address"].update(offset=-1),
            "recipe-limit-invalid": lambda d: d["limits"].update(repeatReads=1),
            "recipe-budget-exceeded": lambda d: d["limits"].update(maxReadBytes=64),
            "recipe-reference-invalid": lambda d: d["pauses"][0]["fields"].append("missing"),
            "source-mismatch": lambda d: d["source"].update(baselineVersion="manifest-other"),
            "location-outside-object": lambda d: d["fields"][0]["address"].update(offset=0x10000),
            "window-weak": lambda d: d["correlation"]["data"].update(offset=0x0),
        }
        for code, change in cases.items():
            with self.subTest(code):
                box = Sandbox(tempfile.mkdtemp(dir=self.tmp.name))
                document = json.loads(json.dumps(box.document))
                change(document)
                box.write_recipe(document)
                self.assertRejected(box, code)
        box = Sandbox(tempfile.mkdtemp(dir=self.tmp.name))
        box.write_recipe("{")
        self.assertRejected(box, "recipe-json-invalid")

    def test_source_mismatch_of_the_installation(self):
        box = self.box()
        executable = box.install / "MAIN/GAME.EXE"
        executable.write_bytes(executable.read_bytes()[:-1] + b"\x01")
        self.assertRejected(box, "source-mismatch")

    def test_output_location_rejections(self):
        box = self.box()
        outside = Path(self.tmp.name) / "elsewhere"
        outside.mkdir()
        (box.research / "escape").symlink_to(outside)
        cases = {
            "output-path-invalid": [dict(out=outside), dict(out=box.research), dict(out=box.out / ".." / "x"),
                                    dict(out=box.research / "escape"), dict(run_id="../x"), dict(run_id="a/b")],
            "output-exists": [dict(run_id="earlier")],
        }
        for code, runs in cases.items():
            for run in runs:
                with self.subTest(code=code, run=run):
                    box.lines.clear()
                    self.assertRejected(box, code, new_dir=code != "output-exists", **run)
        self.assertEqual(os.listdir(outside), [])
        self.assertEqual((box.previous_run / "report.json").read_text(), '{"status": "failed"}\n')

    def test_concurrent_session_is_refused(self):
        box = self.box()
        held = runfiles.SessionLock(box.research)
        try:
            self.assertRejected(box, "session-busy")
        finally:
            held.release()
        self.assertEqual(box.run(run_id="after-release"), 0)

    def test_existing_emulator_is_refused_and_untouched(self):
        box = self.box()
        box.running = [(321, "dosbox-x")]
        self.assertRejected(box, "emulator-already-running")
        self.assertEqual(box.transport.reclaimed, [])

    # -- run failures ----------------------------------------------------------------------------------------------
    def test_emulator_appearing_before_launch(self):
        box = self.box()
        calls = []

        def processes():
            calls.append(1)
            return [] if len(calls) == 1 else [(321, "DOSBox-X")]
        box.env.processes = processes
        self.assertFailed(box, "emulator-already-running", launched=False)

    def test_emulator_appearing_beside_the_launched_one(self):
        box = Sandbox(tempfile.mkdtemp(dir=self.tmp.name))
        box.env.processes = lambda: [(box.transport.pid, "dosbox-x")] if box.launches else []
        self.assertEqual(box.run(), 0)  # the owned emulator itself is not another emulator
        box = Sandbox(tempfile.mkdtemp(dir=self.tmp.name))
        box.env.processes = lambda: [(box.transport.pid, "dosbox-x"), (77, "dosbox-x")] if box.launches else []
        self.assertFailed(box, "emulator-already-running")

    def test_missing_samples_after_a_qualified_prefix(self):
        report = self.assertFailed(self.box(scenario={"vrt_limit": 3}), "samples-missing")
        self.assertIn("wait-timeout", report["reasons"])
        self.assertEqual((report["counts"]["actual"], report["counts"]["qualified"]), (8, 8))

    def test_runtime_read_budget(self):
        for scenario in ({}, {"vrt": ["real", str(0x20000000), str(0x20000000), "site"]}):
            with self.subTest(scenario=scenario):
                box = Sandbox(tempfile.mkdtemp(dir=self.tmp.name), scenario=scenario)
                box.document["limits"]["maxReadBytes"] = 306  # the recipe's static minimum
                box.write_recipe(box.document)
                self.assertFailed(box, "budget-exceeded")

    def test_private_copy_rejects_links(self):
        box = self.box()
        (box.install / "MAIN" / "LINKED.BIN").symlink_to(box.install / "MAIN" / "DATA.BIN")
        report = self.assertFailed(box, "private-copy-invalid", launched=False)
        self.assertEqual(report["cleanup"], {"passed": True, "launched": False})

    def test_breakpoint_unconfirmed(self):
        for scenario in ({"bp_ack": False}, {"bp_ack_offset": 0x1234}, {"bp_list_extra": [(0x258, 0x1000)]}):
            with self.subTest(scenario=scenario):
                box = Sandbox(tempfile.mkdtemp(dir=self.tmp.name), scenario=scenario)
                self.assertFailed(box, "breakpoint-unconfirmed")
                self.assertNotIn(b"RUN\n", box.transport.writes)

    def test_breakpoint_wrong_hit(self):
        self.assertFailed(self.box(scenario={"run": "wrong"}), "breakpoint-wrong-hit")

    def test_wait_timeout(self):
        box = self.box(scenario={"run": "never"})
        self.assertFailed(box, "wait-timeout")

    def test_run_timeout(self):
        box = self.box(scenario={"run": "never"})
        box.document["limits"].update(runSeconds=5, waitSeconds=5)
        box.write_recipe(box.document)
        self.assertFailed(box, "run-timeout")

    def test_run_timeout_during_preparation(self):
        box = self.box()
        box.document["limits"].update(runSeconds=5, waitSeconds=5)
        box.write_recipe(box.document)

        def slow_clock():  # every check costs a second: hashing and copying outlast the run limit
            box.clock.now += 1
            return box.clock.now
        box.env.clock = slow_clock
        report = self.assertFailed(box, "run-timeout", launched=False)
        self.assertEqual(report["cleanup"], {"passed": True, "launched": False})

    def test_operator_timeout_and_invalid_answer(self):
        box = Sandbox(tempfile.mkdtemp(dir=self.tmp.name))
        box.answers = {"start": [None]}
        self.assertFailed(box, "wait-timeout")
        for answer in (b"not json", {"action": "confirm"}, {"action": "maybe"}, {"action": "skip", "x": 1}):
            with self.subTest(answer=answer):
                box = Sandbox(tempfile.mkdtemp(dir=self.tmp.name))
                box.answers = {"start": [answer]}
                self.assertFailed(box, "operator-invalid")

    def test_cancellation(self):
        box = Sandbox(tempfile.mkdtemp(dir=self.tmp.name), scenario={"interrupt_after": 12})
        report = self.assertFailed(box, "run-cancelled", exit_code=3)
        self.assertEqual(report["status"], "cancelled")
        box = Sandbox(tempfile.mkdtemp(dir=self.tmp.name))
        box.answers = {"start": [{"action": "abort"}]}
        self.assertEqual(self.assertFailed(box, "run-cancelled", exit_code=3)["status"], "cancelled")

        def abort(fake):
            Path(box.run_dir, "operator", "abort.json").write_text("{}")
        box = Sandbox(tempfile.mkdtemp(dir=self.tmp.name), scenario={"run": "never", "on_command": after_bp(abort)})
        self.assertEqual(self.assertFailed(box, "run-cancelled", exit_code=3)["status"], "cancelled")

    def test_child_exit(self):
        def hook(fake, text):
            if text == "SELINFO DS":
                fake.exited = True
        self.assertFailed(self.box(scenario={"on_command": hook}), "child-exited")

    def test_unparsed_debugger_output(self):
        def hook(fake, text):
            if text == "CPU":
                fake.scenario["garbled"] = True
        self.assertFailed(self.box(scenario={"on_command": hook}), "debugger-unparsed")

    def test_log_budget(self):
        box = self.box()
        box.document["limits"].update(maxLogBytes=20000)
        box.write_recipe(box.document)
        self.assertFailed(box, "log-budget-exceeded")

    def test_mapping_not_established(self):
        box = self.box(scenario={"vrt": ["real", str(0x20000000)]})
        box.env.mapping_stops = 6
        report = self.assertFailed(box, "window-weak")
        self.assertEqual(report["counts"]["actual"], 0)

    def test_reclaim_failure(self):
        report = self.assertFailed(self.box(reclaim_passes=False), "cleanup-failed")
        self.assertFalse(report["cleanup"]["passed"])

    def test_original_and_evidence_changes_are_reported_not_reverted(self):
        for target in ("StarRang/baseline/GAME.CFG", "research/p3-01/tool-smoke/earlier/report.json",
                       "research/p3-02/notes/notes.txt", "StarRang/captures/new.png", "StarRang/GAME/MAIN/DATA.BIN"):
            with self.subTest(target=target):
                box = Sandbox(tempfile.mkdtemp(dir=self.tmp.name))
                path = box.local / target
                if "notes" in target:
                    path.parent.mkdir(parents=True)
                    path.write_text("another topic's evidence")

                def change(fake, path=path):
                    path.write_bytes(b"changed by someone else")
                box.debugger.scenario["on_command"] = after_bp(change)
                result = box.run()
                self.assertEqual(result, 1)
                report = box.report()
                self.assertNotEqual(report["status"], "complete")
                self.assertIn("original-changed", report["reasons"])
                key = os.path.relpath(os.path.realpath(path), os.path.realpath(box.local))
                self.assertEqual(report["integrity"]["changed"] + report["integrity"]["added"], [key])
                after = box.snapshot()
                self.assertTrue(all(after.get(name) == digest for name, digest in box.before.items()
                                    if name != target and not name.startswith("research/p3-01/tool-smoke/run-01/")))
                inventories = json.loads((box.run_dir / "protection/after.json").read_text())
                self.assertIn(key, inventories["protected"] if target.startswith("StarRang") else
                              inventories["evidence"])
                self.assertFalse(report["integrity"]["passed"])
                self.assertEqual(path.read_bytes(), b"changed by someone else")  # never written back
                self.assertTrue(box.transport.reclaimed)
                if target.startswith("StarRang/baseline"):
                    self.assertTrue((box.run_dir / "protection/before" / os.path.relpath(
                        os.path.realpath(path), os.path.realpath(box.local))).is_file())
                self.assertTerminalSafe(box)

    def test_report_write_failures(self):
        original = runfiles._exclusive

        def failing(prefix):
            def write(path, data):
                if Path(path).name.startswith(prefix):
                    raise OSError("disk full")
                return original(path, data)
            return write

        box = Sandbox(tempfile.mkdtemp(dir=self.tmp.name))
        with mock.patch("runfiles._exclusive", side_effect=failing(".report.json.")):
            result = box.run()
        self.assertEqual(result, 1)
        self.assertIn("report-write-failed", box.lines[-1])
        self.assertEqual(box.report()["status"], "failed")  # the unfinished first state remains
        self.assertIn("run-unfinished", box.report()["reasons"])
        self.assertTrue(box.transport.reclaimed)
        self.assertTrue(box.unchanged_outside_run())
        self.assertTerminalSafe(box)

        box = Sandbox(tempfile.mkdtemp(dir=self.tmp.name))
        with mock.patch("runfiles._exclusive", side_effect=failing("report.json")):
            result = box.run()
        self.assertEqual(result, 1)
        self.assertIn("report-write-failed", box.lines[-1])
        self.assertFalse((box.run_dir / "report.json").exists())
        self.assertEqual(box.launches, [])
        self.assertTrue(box.unchanged_outside_run())

    # -- pause-level rejections: unqualified samples, never a complete report -----------------------------------
    def test_sample_rejections(self):
        def poke(address, data):
            return lambda fake: fake.process.poke(address, data)

        def bump_ticks(fake):
            fake.process.poke_u32(TICKS, struct.unpack("<I", fake.process.peek(TICKS, 4))[0] + 1)

        def remap(fake):
            fake.process.physical[TICKS // 4096] = 0x777

        def other_cr3(fake):
            fake.cr3 = 0x00200000

        def move_registers(fake):
            fake.registers["EAX"] += 1

        cases = {
            "read-fault": {"on_command": after_bp(lambda fake: fake.process.faults.add(TICKS // 4096))},
            "read-short": {"dv_rows": {SCENARIO: 0}},
            "pointer-null": {"on_command": after_bp(poke(HEAP + 0x10, b"\0\0\0\0"))},
            "pointer-cycle": {"on_command": after_bp(poke(HEAP + 0x10, struct.pack("<I", CHAIN - 8)))},
            "pointer-overflow": {"on_command": after_bp(poke(HEAP + 0x10, b"\xfc\xff\xff\xff"))},
            "pointer-out-of-range": {"ds_limit": 0x3FFFFFFF,
                                     "on_command": after_bp(poke(HEAP + 0x10, struct.pack("<I", 0x7FFFFFF0)))},
            "repeat-mismatch": {"on_command": on_dv(TICKS, bump_ticks)},
            "mapping-changed": {"on_command": on_dv(SCENARIO, remap)},
            "owner-changed": {"on_command": on_dv(SCENARIO, other_cr3)},
            "stop-unverified": {"on_command": on_dv(SCENARIO, move_registers)},
            "identity-mismatch": {"on_command": after_bp(poke(SCENARIO, struct.pack("<i", 7)))},
            "value-nonfinite": {"on_command": after_bp(poke(SPEED, struct.pack("<f", float("nan"))))},
            "code-unmatched": {"on_command": after_bp(poke(CODE_SITE, b"\x90" * 16))},
            "data-mismatch": {"on_command": after_bp(poke(DATA + 0x404, b"\x00\x11\x22\x33"))},
        }
        for code, scenario in cases.items():
            with self.subTest(code):
                box = Sandbox(tempfile.mkdtemp(dir=self.tmp.name), scenario=scenario)
                self.assertFailed(box, code, sample=True)

    def test_declared_identity_mismatch(self):
        box = self.box()
        box.answers = {"end": [{"action": "confirm", "mission": {"group": 0, "slot": 2},
                                "config": {"difficulty": 19, "wingman": "none"}}]}
        report = self.assertFailed(box, "identity-mismatch", sample=True)
        self.assertTrue(all(item["status"] == "qualified" for item in report["samples"] if item["pause"] == "start"))

    def test_unqualified_context_at_a_pause(self):
        box = self.box(scenario={"vrt": ["real", "real", "site", "real"]})
        self.assertFailed(box, "stop-unverified", sample=True)


if __name__ == "__main__":
    unittest.main()
