import access_guard  # noqa: F401  (installs the no-original-access guard first)

import json
import os
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path

from debugger import Debugger
from processes import PtyTransport, emulators, process_names
from reasons import BaselineError
from sandbox import Sandbox
from screen import Screen

FAKE = str(Path(__file__).resolve().parent / "fake_debugger.py")


def own_executable_name():
    output = subprocess.run(["ps", "-p", str(os.getpid()), "-o", "comm="], capture_output=True, text=True).stdout
    return os.path.basename(output.strip())


class NullLog:
    def output(self, data):
        pass

    def command(self, text):
        pass


class ProcessTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.name = own_executable_name()

    def scenario(self, **options):
        path = Path(self.tmp.name) / f"scenario-{len(os.listdir(self.tmp.name))}.json"
        path.write_text(json.dumps(options))
        return [sys.executable, "-B", FAKE, "--scenario", str(path)]

    def launch(self, **options):
        transport = PtyTransport(self.scenario(**options), self.tmp.name)
        self.addCleanup(lambda: transport.closed or transport.reclaim(0.2))
        return transport

    def test_emulator_detection(self):
        table = [(10, "dosbox-x"), (11, "DOSBox-X"), (12, "bash"), (13, "dosbox"), (14, "xdosbox-x")]
        self.assertEqual(emulators(table, "dosbox-x"), [10, 11, 13])
        self.assertEqual(emulators(table, "dosbox-x", exclude={10}), [11, 13])
        self.assertEqual(emulators([(15, "Python")], "python"), [15])
        with self.assertRaises(BaselineError) as caught:
            emulators(None, "dosbox-x")  # an unreadable process table is a refusal, not an empty one
        self.assertEqual(caught.exception.code, "emulator-already-running")
        names = process_names()
        self.assertIn((os.getpid(), self.name), names)

    def test_ownership_and_debugger_round_trip(self):
        transport = self.launch()
        proof = transport.verify_owner(self.name, time.monotonic, time.sleep)
        self.assertEqual((proof["pid"], proof["processGroup"]), (transport.pid, transport.pid))
        debugger = Debugger(transport, Screen(), time.monotonic, 10, time.monotonic() + 60, NullLog())
        debugger.wait_registers()
        self.assertEqual(debugger.breakpoint_list(), [])
        self.assertEqual(debugger.cpu().cr0 & 1, 0)
        report = transport.reclaim(2.0)
        self.assertEqual(report["signals"], ["SIGTERM"])
        self.assertTrue(report["passed"])
        with self.assertRaises(ProcessLookupError):
            os.kill(transport.pid, 0)

    def test_other_executable_is_not_owned(self):
        transport = self.launch()
        with self.assertRaises(BaselineError) as caught:
            transport.verify_owner("dosbox-x", time.monotonic, time.sleep, limit=0.3)
        self.assertEqual(caught.exception.code, "emulator-unverified")
        self.assertTrue(transport.reclaim(2.0)["passed"])

    def test_reclaim_escalates_when_sigterm_is_ignored(self):
        transport = self.launch(ignore_term=True)
        transport.verify_owner(self.name, time.monotonic, time.sleep)
        started = time.monotonic()
        report = transport.reclaim(0.3)
        self.assertEqual(report["signals"], ["SIGTERM", "SIGKILL"])
        self.assertEqual(report["returnCode"], -9)
        self.assertTrue(report["passed"] and report["pidGone"] and report["groupGone"])
        self.assertLess(time.monotonic() - started, 5)

    def test_child_exit_is_detected_and_reclaimed(self):
        transport = self.launch(exit_after=1)
        debugger = Debugger(transport, Screen(), time.monotonic, 5, time.monotonic() + 30, NullLog())
        debugger.wait_registers()
        with self.assertRaises(BaselineError) as caught:
            debugger.command("CPU")
        self.assertEqual(caught.exception.code, "child-exited")
        report = transport.reclaim(0.5)
        self.assertTrue(report["exitedBeforeReclaim"])
        self.assertTrue(report["passed"])

    def sandbox(self, **scenario):
        box = Sandbox(tempfile.mkdtemp(dir=self.tmp.name), smoke_identity=True)
        document = box.document
        document["pauses"] = [{"id": "only", "stop": {"kind": "vrt"}, "fields": ["scenario", "ticks"]}]
        document["fields"] = [item for item in document["fields"] if item["id"] in ("scenario", "ticks")]
        box.write_recipe(document)
        box.env.emulator = tuple(self.scenario(**scenario))
        box.env.emulator_name = self.name
        box.env.launch = PtyTransport
        box.env.clock = time.monotonic
        box.env.sleep = time.sleep
        box.env.reclaim_grace = 0.5
        return box

    def test_smoke_run_on_a_real_pty(self):
        box = self.sandbox()
        self.assertEqual(box.run(smoke=True), 0, box.lines)
        report = box.report()
        self.assertEqual(report["status"], "complete")
        self.assertEqual(report["cleanup"]["signals"], ["SIGTERM"])
        self.assertTrue(report["cleanup"]["pidGone"])
        self.assertEqual(report["environment"]["process"]["executable"], self.name)
        self.assertTrue(box.unchanged_outside_run())
        self.assertGreater((box.run_dir / "debugger.raw").stat().st_size, 0)

    def test_child_exit_during_a_run(self):
        box = self.sandbox(exit_after=6)
        self.assertEqual(box.run(smoke=True), 1)
        report = box.report()
        self.assertIn("child-exited", report["reasons"])
        self.assertTrue(report["cleanup"]["passed"])
        self.assertTrue(report["cleanup"]["exitedBeforeReclaim"])
        self.assertTrue(box.unchanged_outside_run())


if __name__ == "__main__":
    unittest.main()
