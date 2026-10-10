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
import session
from fake_debugger import CODE_SITE
from reasons import REASON_SET
from recipe import exe_fingerprint, parse_recipe
from sandbox import SETTINGS, Sandbox
from synthetic import BASES, HEAP, bios_keyboard

DATA = BASES[4]
TICKS = DATA + 0x800
SPEED = DATA + 0x808
CHAIN = DATA + 0x820
SCENARIO = DATA + 0x830
STICK = HEAP + 0x2000  # a register-addressed device field (ESI + 12 at the "start" breakpoint)
LATCH = DATA + 0x840  # an object-addressed device field
GAME_SETTINGS = b"SOUND_LEVEL=100\r\nCURR_LEVEL=100 53\r\nSTARTUP_PRACTICE=TRUE\r\nDETAIL=TRUE\r\n"
OVERRIDDEN = b"SOUND_LEVEL=100\r\nCURR_LEVEL=100 19\r\nSTARTUP_PRACTICE=FALSE\r\nDETAIL=TRUE\r\n"


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
        settings = (box.install / SETTINGS).read_bytes()  # without gameSettings the private copy is left as copied
        self.assertEqual(report["gameConfig"], {"file": SETTINGS, "present": True, "sha256": exe_fingerprint(settings),
                                                "settings": {"SOUND_LEVEL": "100", "DETAIL": "TRUE"}})
        self.assertEqual((box.run_dir / "install" / SETTINGS).read_bytes(), settings)
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

    def settings_box(self, settings=None, data=GAME_SETTINGS):
        box = Sandbox(tempfile.mkdtemp(dir=self.tmp.name))
        (box.install / SETTINGS).write_bytes(data)
        if settings is not None:
            box.document["gameSettings"] = settings
            box.write_recipe(box.document)
        return box

    def test_private_game_settings(self):
        settings = {"STARTUP_PRACTICE": False, "CURR_LEVEL": [100, 19]}
        for game_write, writes in ((None, []), (OVERRIDDEN + b"GAMEHIRES=TRUE\r\n", [SETTINGS])):
            with self.subTest(game_write=game_write):
                box = self.settings_box(settings)
                if game_write is not None:
                    def write(fake, box=box, data=game_write):
                        (box.run_dir / "install" / SETTINGS).write_bytes(data)
                    box.debugger.scenario["on_command"] = after_bp(write)
                self.assertEqual(box.run(), 0)
                report = box.report()
                self.assertEqual((report["status"], report["reasons"]), ("complete", []))
                without = {key: value for key, value in box.document.items() if key != "gameSettings"}
                self.assertEqual(report["recipe"]["fingerprint"], parse_recipe(json.dumps(box.document)).fingerprint)
                self.assertNotEqual(report["recipe"]["fingerprint"], parse_recipe(json.dumps(without)).fingerprint)
                self.assertEqual(report["gameConfig"], {
                    "file": SETTINGS, "present": True, "sha256": exe_fingerprint(OVERRIDDEN),
                    "settings": {"SOUND_LEVEL": "100", "CURR_LEVEL": "100 19", "STARTUP_PRACTICE": "FALSE",
                                 "DETAIL": "TRUE"},
                    "overrides": {"requested": settings,
                                  "before": {"sha256": exe_fingerprint(GAME_SETTINGS), "settings": {
                                      "SOUND_LEVEL": "100", "CURR_LEVEL": "100 53", "STARTUP_PRACTICE": "TRUE",
                                      "DETAIL": "TRUE"}}}})
                self.assertEqual((box.run_dir / "install" / SETTINGS).read_bytes(), game_write or OVERRIDDEN)
                self.assertEqual((box.install / SETTINGS).read_bytes(), GAME_SETTINGS)  # baseline untouched
                self.assertTrue(box.unchanged_outside_run())
                self.assertTrue(report["integrity"]["passed"])
                # The tool's own rewrite is not a run write; the game's later write to the private copy is.
                self.assertEqual(report["integrity"]["privateCopyWrites"], {"changed": writes, "added": []})

    def test_game_settings_rejected_before_side_effects(self):
        cases = (
            ("recipe-key-unknown", {"DETAIL": True}, GAME_SETTINGS),
            ("recipe-type-invalid", {"STARTUP_PRACTICE": "FALSE"}, GAME_SETTINGS),
            ("recipe-value-invalid", {"CURR_LEVEL": [100, 101]}, GAME_SETTINGS),
            ("game-config-invalid", {"CURR_LEVEL": [100, 19]}, b"SOUND_LEVEL=100\r\nDETAIL=TRUE\r\n"),
            ("game-config-invalid", {"STARTUP_PRACTICE": False},
             GAME_SETTINGS + b"STARTUP_PRACTICE=TRUE\r\n"),
        )
        for code, settings, data in cases:
            with self.subTest(code=code, settings=settings):
                box = self.settings_box(settings, data)
                self.assertRejected(box, code)
                self.assertEqual((box.install / SETTINGS).read_bytes(), data)
        box = self.settings_box()
        box.write_recipe(json.dumps(box.document)[:-1]
                         + ', "gameSettings": {"CURR_LEVEL": [100, 19], "CURR_LEVEL": [100, 20]}}')
        self.assertRejected(box, "recipe-json-invalid")
        box = self.settings_box({"STARTUP_PRACTICE": False})
        (box.install / SETTINGS).unlink()
        self.assertRejected(box, "game-config-invalid")

    def test_game_settings_inapplicable_to_the_private_copy(self):
        box = self.settings_box({"CURR_LEVEL": [100, 19]})
        clock = box.env.clock

        def start():  # the run's first clock reading, after preflight: someone rewrites the baseline file
            (box.install / SETTINGS).write_bytes(b"SOUND_LEVEL=100\r\n")
            box.env.clock = clock
            return clock()
        box.env.clock = start
        self.assertEqual(box.run(), 1)
        report = box.report()
        self.assertEqual(report["status"], "failed")
        self.assertIn("game-config-invalid", report["reasons"])
        self.assertEqual(report["gameConfig"], {"file": SETTINGS, "present": False})
        self.assertEqual(box.launches, [])
        self.assertEqual(report["cleanup"], {"passed": True, "launched": False})
        self.assertEqual((box.run_dir / "install" / SETTINGS).read_bytes(), b"SOUND_LEVEL=100\r\n")
        self.assertTerminalSafe(box)

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

    # -- input stimuli -----------------------------------------------------------------------------------------------
    def stimulus_box(self, scenario=None, change=None, **process):
        box = Sandbox(tempfile.mkdtemp(dir=self.tmp.name), scenario=scenario)
        document = box.document
        document["pauses"].insert(0, {"id": "gate", "stop": {"kind": "breakpoint", "object": 2, "offset": 0x1FA0}})
        document["devices"] = [{"id": "stick", "address": {"register": "ESI", "offset": 12}, "type": "i32"},
                               {"id": "latch", "address": {"object": 4, "offset": 0x840}, "type": "u16"}]
        document["stimuli"] = [
            {"id": "enter", "pause": "gate", "kind": "key", "ascii": 13, "scan": 28},
            {"id": "ctrl", "pause": "start", "kind": "shift", "flags": {"ctrl": True, "caps": False}},
            {"id": "deflect", "pause": "start", "kind": "device", "device": "stick", "value": -128},
            {"id": "latch", "pause": "end", "kind": "device", "device": "latch", "value": 513}]
        if change:
            change(document)
        box.write_recipe(document)
        bios_keyboard(box.debugger.process, **process)
        box.debugger.registers["ESI"] = STICK - 12
        return box

    def assertStimulusFailed(self, box, code, detail, failed="enter", applied=(), written=()):
        report = self.assertFailed(box, code)
        self.assertIn("stimuli-missing", report["reasons"])
        records = {record["id"]: record for record in report["stimuli"]}
        self.assertEqual((records[failed]["status"], records[failed]["detail"]), (code, detail))
        for status, expected in (("applied", applied), ("written", written)):
            self.assertEqual([record["id"] for record in report["stimuli"] if record["status"] == status],
                             list(expected))
        self.assertEqual(report["counts"]["stimuliApplied"], len(applied))
        self.assertTrue((box.run_dir / f"pauses/{records[failed]['pause']}/stimuli.json").is_file())
        return report

    def test_stimuli_are_written_read_back_and_recorded(self):
        box = self.stimulus_box()
        process = box.debugger.process
        latch_before = process.peek(LATCH, 2)
        self.assertEqual(box.run(), 0)
        report = box.report()
        self.assertEqual((report["status"], report["reasons"]), ("complete", []))
        self.assertEqual((report["counts"]["planned"], report["counts"]["stimuliPlanned"],
                          report["counts"]["stimuliApplied"]), (10, 4, 4))
        self.assertEqual(process.peek(0x41E, 2), bytes((13, 28)))
        self.assertEqual(process.peek(0x41C, 2), struct.pack("<H", 0x20))
        self.assertEqual(process.peek(0x417, 1), b"\x24")  # ctrl set, caps cleared, num lock kept
        self.assertEqual(process.peek(STICK, 4), struct.pack("<i", -128))
        self.assertEqual(process.peek(LATCH, 2), struct.pack("<H", 513))
        enter, ctrl, deflect, latch = report["stimuli"]
        self.assertEqual([record["status"] for record in report["stimuli"]], ["applied"] * 4)
        self.assertEqual((enter["pause"], enter["key"], enter["buffer"]),
                         ("gate", {"ascii": 13, "scan": 28}, {"pointers": "1e001e00", "bounds": "1e003e00"}))
        self.assertEqual(enter["writes"], [
            {"channel": "key-slot", "linear": "0000041e", "written": "0d1c", "before": "0000", "readback": "0d1c",
             "pages": {"0": "0"}},
            {"channel": "key-tail", "linear": "0000041c", "written": "2000", "before": "1e00", "readback": "2000",
             "pages": {"0": "0"}}])
        self.assertEqual((ctrl["flags"], ctrl["writes"][0]["before"], ctrl["writes"][0]["written"]),
                         ({"ctrl": True, "caps": False}, "20", "24"))
        self.assertEqual((deflect["device"], deflect["value"], deflect["writes"][0]["linear"]),
                         ("stick", -128, f"{STICK:08x}"))
        self.assertEqual((latch["pause"], latch["writes"][0]["before"]), ("end", latch_before.hex()))
        self.assertIsInstance(enter["emulatedMs"], float)
        for pause in ("gate", "start", "end"):
            stop = json.loads((box.run_dir / f"pauses/{pause}/stop.json").read_text())
            self.assertTrue(stop["registersUnchangedAfterStimuli"])
            self.assertEqual(stop["stimuli"], f"pauses/{pause}/stimuli.json")
            recorded = json.loads((box.run_dir / stop["stimuli"]).read_text())
            self.assertEqual([item["id"] for item in recorded["stimuli"]],
                             [item["id"] for item in report["stimuli"] if item["pause"] == pause])
        self.assertFalse((box.run_dir / "pauses/gate/reads.json").exists())  # a stop without readings
        phases = [(status["phase"], status.get("pause")) for status in box.statuses]
        self.assertNotIn(("awaiting-confirmation", "gate"), phases)
        self.assertIn(("awaiting-confirmation", "start"), phases)
        self.assertLess(phases.index(("reading", "start")), phases.index(("input", "start")))
        self.assertIn(b"SMV 00000041E 00D 01C\n", box.transport.writes)
        self.assertTerminalSafe(box)
        self.assertTrue(box.unchanged_outside_run())

    def test_stimulus_rejections_end_the_run(self):
        box = self.stimulus_box(head=0x1E, tail=0x20)
        self.assertStimulusFailed(box, "stimulus-rejected", "key-buffer-busy")
        self.assertFalse(any(write.startswith(b"SMV") for write in box.transport.writes))
        self.assertEqual(box.report()["samples"], [])
        box = self.stimulus_box(start=0x1E, end=0x1E)
        self.assertStimulusFailed(box, "stimulus-rejected", "key-buffer-invalid")
        box = self.stimulus_box()
        box.debugger.process.physical[0] = 5
        self.assertStimulusFailed(box, "stimulus-rejected", "mapping-not-identity")
        box = self.stimulus_box(scenario={"smv_ack": False})
        self.assertStimulusFailed(box, "stimulus-unverified", "write-unacknowledged")
        box = self.stimulus_box(scenario={"smv_drop": True})
        report = self.assertStimulusFailed(box, "stimulus-unverified", "readback-mismatch")
        self.assertEqual(report["stimuli"][0]["writes"][0]["readback"], "0000")
        box = self.stimulus_box(scenario={"ds_limit": 0x3FFFFFFF})
        box.debugger.registers["ESI"] = 0x3FFFFFFD - 12  # the field's last byte would lie beyond the DS limit
        # the shift at the same pause was written and read back, but its pause did not complete: not applied
        self.assertStimulusFailed(box, "stimulus-rejected", "device-out-of-range", "deflect", ("enter",), ("ctrl",))

    def test_stimuli_need_a_qualified_pause_and_unchanged_registers(self):
        box = self.stimulus_box(scenario={"on_command": after_bp(lambda fake: fake.process.poke(
            SCENARIO, struct.pack("<i", 7)))})
        flags = box.debugger.process.peek(0x417, 1)
        report = self.assertStimulusFailed(box, "stimulus-rejected", "pause-identity-mismatch", "ctrl", ("enter",))
        self.assertEqual(box.debugger.process.peek(0x417, 1), flags)  # nothing written at the unqualified pause
        self.assertNotIn("writes", {record["id"]: record for record in report["stimuli"]}["ctrl"])

        def move_registers(fake, text):
            if text.startswith("SMV "):
                fake.registers["EAX"] += 1
        box = self.stimulus_box(scenario={"on_command": move_registers})
        report = self.assertStimulusFailed(box, "stimulus-unverified", "registers-changed")
        stop = json.loads((box.run_dir / "pauses/gate/stop.json").read_text())
        self.assertFalse(stop["registersUnchangedAfterStimuli"])

    def test_stimulus_writes_count_against_the_budget(self):
        used = []

        class Recording(session.ReadBudget):
            def __init__(self, limit):
                super().__init__(limit)
                used.append(self)
        box = self.stimulus_box()
        with mock.patch.object(session, "ReadBudget", Recording):
            self.assertEqual(box.run(), 0)
        total = used[0].used
        box = self.stimulus_box(change=lambda d: d["limits"].update(maxReadBytes=total - 1))
        self.assertStimulusFailed(box, "budget-exceeded", "reads", "latch", ("enter", "ctrl", "deflect"))
        box = self.stimulus_box(change=lambda d: d["stimuli"][2].update(device="missing"))  # an undeclared write
        self.assertRejected(box, "recipe-reference-invalid")

    # -- evidence scope ----------------------------------------------------------------------------------------------
    def test_declared_evidence_scope_protects_only_its_directory(self):
        for target, passed in (("research/p3-02/notes/notes.txt", True),
                               ("research/p3-01/tool-smoke/earlier/report.json", False),
                               ("StarRang/baseline/GAME.CFG", False)):
            with self.subTest(target=target):
                box = Sandbox(tempfile.mkdtemp(dir=self.tmp.name))
                path = box.local / target
                path.parent.mkdir(parents=True, exist_ok=True)
                if not path.exists():
                    path.write_text("another topic's evidence")

                def change(fake, path=path):
                    path.write_bytes(b"changed by another session")
                box.debugger.scenario["on_command"] = after_bp(change)
                self.assertEqual(box.run(evidence=box.out), 0 if passed else 1)
                report = box.report()
                protection = report["environment"]["protection"]
                self.assertEqual((protection["evidenceScope"], protection["evidenceRoots"]),
                                 ("declared", ["local/research/p3-01/tool-smoke"]))
                self.assertEqual(report["integrity"]["passed"], passed)
                self.assertEqual("original-changed" in report["reasons"], not passed)
                inventory = json.loads((box.run_dir / "protection/before.json").read_text())["evidence"]
                self.assertTrue(inventory and all(key.startswith("research/p3-01/tool-smoke/") for key in inventory))
        box = self.box()
        self.assertEqual(box.run(), 0)  # the default scope is the whole research root
        protection = box.report()["environment"]["protection"]
        self.assertEqual((protection["evidenceScope"], protection["evidenceRoots"]),
                         ("research-root", ["local/research"]))

    def test_evidence_scope_rejections(self):
        box = self.box()
        outside = Path(self.tmp.name) / "elsewhere"
        outside.mkdir()
        (box.research / "escape").symlink_to(outside)
        (box.research / "p3-02").mkdir()
        for evidence in (outside, box.research / "escape", box.research / "p3-02", box.out / "run-01",
                         box.out / ".." / "tool-smoke", box.local, "", box.research / "bad name"):
            with self.subTest(evidence=evidence):
                box.lines.clear()
                self.assertRejected(box, "evidence-scope-invalid", evidence=evidence)
        self.assertEqual(box.run(evidence=box.research), 0)  # the research root itself is the default, made explicit
        box = Sandbox(tempfile.mkdtemp(dir=self.tmp.name))
        box.before = box.snapshot()
        box.run_id = "cli"
        self.assertEqual(measure.main(["run", "--recipe", str(box.recipe_path), "--out", str(box.out), "--run-id",
                                       "cli", "--evidence", str(box.out)], env=box.env), 0)
        self.assertEqual(box.report()["environment"]["protection"]["evidenceScope"], "declared")
        self.assertTrue(box.unchanged_outside_run())

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
