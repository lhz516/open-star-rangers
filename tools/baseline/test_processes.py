import access_guard  # noqa: F401  (installs the no-original-access guard first)

import contextlib
import json
import os
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path
from unittest import mock

import processes
from debugger import Debugger
from processes import KILL_WAIT, PtyTransport, emulators, process_names
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

    def wait_ready(self, transport, limit=10):
        """Waits for the served fake's first screen, which it writes only after installing its scenario's signal
        handling; until then a signal may still meet the interpreter's default action."""
        end = time.monotonic() + limit
        while not transport.read(0.1):
            self.assertLess(time.monotonic(), end, "the fake debugger wrote no screen")

    def test_reclaim_escalates_when_sigterm_is_ignored(self):
        transport = self.launch(ignore_term=True)
        transport.verify_owner(self.name, time.monotonic, time.sleep)
        self.wait_ready(transport)
        started = time.monotonic()
        report = transport.reclaim(0.3)
        self.assertEqual(report["signals"], ["SIGTERM", "SIGKILL"])
        self.assertEqual(report["returnCode"], -9)
        self.assertTrue(report["passed"] and report["pidGone"] and report["groupGone"])
        self.assertLess(time.monotonic() - started, 5)
        self.assertEqual((report["killWait"]["limit"], report["killWait"]["limitReached"]), (30, False))
        self.assertLess(report["killWait"]["seconds"], 5)

    def slow_exit(self, transport, reap_delay, group_delay):
        """Simulates an emulator that is reaped `reap_delay` seconds after it actually exits and whose process group
        outlives that reap by `group_delay` seconds."""
        real_poll, real_group_alive = transport.child.poll, processes._group_alive
        exited_at = reaped_at = None

        def poll():
            nonlocal exited_at, reaped_at
            code = real_poll()
            if code is None:
                return None
            exited_at = exited_at or time.monotonic()
            if time.monotonic() < exited_at + reap_delay:
                return None
            reaped_at = reaped_at or time.monotonic()
            return code

        def group_alive(pgid):
            if pgid != transport.pid:
                return real_group_alive(pgid)
            return reaped_at is None or time.monotonic() < reaped_at + group_delay or real_group_alive(pgid)

        stack = contextlib.ExitStack()
        stack.enter_context(mock.patch.object(transport.child, "poll", poll))
        stack.enter_context(mock.patch.object(processes, "_group_alive", group_alive))
        return stack

    def test_reclaim_waits_for_a_slow_exit_within_the_bound(self):
        transport = self.launch(ignore_term=True)
        self.wait_ready(transport)
        with self.slow_exit(transport, 0.6, 0.6):
            report = transport.reclaim(0.3)
        self.assertEqual(report["signals"], ["SIGTERM", "SIGKILL"])
        self.assertEqual(report["returnCode"], -9)
        self.assertTrue(report["passed"] and report["reaped"] and report["pidGone"] and report["groupGone"])
        wait = report["killWait"]
        self.assertEqual((wait["limit"], wait["limitReached"]), (KILL_WAIT, False))
        self.assertGreaterEqual(wait["seconds"], 1.2)
        self.assertLess(wait["seconds"], KILL_WAIT)

    def test_reap_and_group_share_one_bound(self):
        # Each stage alone fits in 1.5 s; together they need at least 1.6 s, so one shared 1.5 s bound fails.
        transport = self.launch(ignore_term=True)
        self.wait_ready(transport)
        started = time.monotonic()
        with self.slow_exit(transport, 0.2, 1.4):
            report = transport.reclaim(0.3, kill_wait=1.5)
        self.assertLess(time.monotonic() - started, 6)
        self.assertEqual(report["signals"], ["SIGTERM", "SIGKILL"])
        self.assertFalse(report["groupGone"])
        self.assertFalse(report["passed"])
        self.assertEqual((report["killWait"]["limit"], report["killWait"]["limitReached"]), (1.5, True))
        self.assertGreaterEqual(report["killWait"]["seconds"], 1.5)
        self.assertEqual(transport.child.wait(timeout=10), -9)

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
        self.assertIsNone(report["cleanup"]["killWait"])
        self.assertEqual(report["environment"]["process"]["executable"], self.name)
        self.assertTrue(box.unchanged_outside_run())
        self.assertGreater((box.run_dir / "debugger.raw").stat().st_size, 0)

    def test_escalated_reclaim_is_recorded_in_the_report(self):
        box = self.sandbox(ignore_term=True)
        self.assertEqual(box.run(smoke=True), 0, box.lines)
        cleanup = box.report()["cleanup"]
        self.assertEqual(cleanup["signals"], ["SIGTERM", "SIGKILL"])
        self.assertTrue(cleanup["passed"])
        self.assertEqual((cleanup["killWait"]["limit"], cleanup["killWait"]["limitReached"]), (KILL_WAIT, False))
        self.assertLess(cleanup["killWait"]["seconds"], KILL_WAIT)

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
