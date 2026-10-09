import access_guard  # noqa: F401  (installs the no-original-access guard first)

import json
import os
import shutil
import tempfile
import unittest
from pathlib import Path

from reasons import BaselineError
import itertools

import runfiles
from runfiles import (Log, ReportWriter, SessionLock, create_run_dir, read_signal, replace_file, resolve_output,
                      write_new)


class RunFileTests(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(os.path.realpath(tempfile.mkdtemp()))
        self.addCleanup(shutil.rmtree, self.tmp)
        self.research = self.tmp / "localroot" / "research"
        self.research.mkdir(parents=True)

    def assertCode(self, code, function, *args):
        with self.assertRaises(BaselineError) as caught:
            function(*args)
        self.assertEqual(caught.exception.code, code)

    def test_output_resolution(self):
        paths = resolve_output(self.research / "p3-01" / "topic", "run-1", self.research)
        self.assertEqual(paths.display, "local/research/p3-01/topic/run-1")
        self.assertEqual(paths.show("report.json"), "local/research/p3-01/topic/run-1/report.json")
        create_run_dir(paths, self.research)
        self.assertTrue(paths.run_dir.is_dir())
        self.assertCode("output-exists", resolve_output, self.research / "p3-01" / "topic", "run-1", self.research)
        self.assertCode("output-exists", create_run_dir, paths, self.research)
        outside = self.tmp / "outside"
        outside.mkdir()
        (self.research / "link").symlink_to(outside)
        for out, run_id in ((self.research, "x"), (self.tmp, "x"), (self.research / "link", "x"),
                            (self.research / "a" / ".." / "b", "x"), (self.research / "a b", "x"),
                            (self.research / "a", "x/y"), (self.research / "a", "."), (self.research / "a", ""),
                            (self.research / "a", "-x"), ("", "x")):
            with self.subTest(out=out, run_id=run_id):
                self.assertCode("output-path-invalid", resolve_output, out, run_id, self.research)
        self.assertEqual(os.listdir(outside), [])

    def test_run_directory_is_created_without_following_links(self):
        paths = resolve_output(self.research / "a" / "b", "r", self.research)
        outside = self.tmp / "outside"
        outside.mkdir()
        (self.research / "a").symlink_to(outside)  # swapped in after validation
        self.assertCode("output-path-invalid", create_run_dir, paths, self.research)
        self.assertEqual(os.listdir(outside), [])

    def test_writes_stop_when_the_run_directory_moves(self):
        paths = self.run_paths()
        moved = self.tmp / "moved"
        os.rename(self.research / "t", moved)
        (self.research / "t").symlink_to(moved)  # the run directory now resolves outside the research root
        self.assertCode("output-path-invalid", write_new, paths, "late.json", b"{}")
        self.assertCode("output-path-invalid", replace_file, paths, "status.json", b"{}")
        self.assertEqual(os.listdir(moved / "r"), [])

    def test_owned_files_are_replaced_without_following_links(self):
        paths = self.run_paths()
        target = self.tmp / "victim.txt"
        target.write_text("untouched")
        replace_file(paths, "status.json", b"{}")
        runfiles._TEMPORARY = iter([99])
        (paths.run_dir / ".status.json.99.tmp").symlink_to(target)
        self.addCleanup(setattr, runfiles, "_TEMPORARY", itertools.count(100))
        self.assertCode("report-write-failed", replace_file, paths, "status.json", b'{"x": 1}')
        self.assertEqual(target.read_text(), "untouched")
        self.assertEqual((paths.run_dir / "status.json").read_bytes(), b"{}")

    def test_session_lock_is_exclusive(self):
        first = SessionLock(self.research)
        self.assertCode("session-busy", SessionLock, self.research)
        first.release()
        SessionLock(self.research).release()

    def run_paths(self):
        paths = resolve_output(self.research / "t", "r", self.research)
        create_run_dir(paths, self.research)
        return paths

    def test_report_writer_is_exclusive_then_atomic(self):
        paths = self.run_paths()
        writer = ReportWriter(paths)
        writer.write('{"status": "failed"}')
        writer.write('{"status": "complete"}')
        self.assertEqual(json.loads((paths.run_dir / "report.json").read_text()), {"status": "complete"})
        self.assertEqual(sorted(os.listdir(paths.run_dir)), ["report.json"])
        other = ReportWriter(paths)
        self.assertCode("report-write-failed", other.write, "{}")  # never replaces an existing first report
        self.assertCode("output-exists", write_new, paths, "report.json", b"{}")

    def test_log_budget(self):
        paths = self.run_paths()
        log = Log(paths, 10)
        log.output(b"12345")
        log.command("abcd")
        self.assertCode("log-budget-exceeded", log.output, b"x")
        log.close()
        self.assertEqual((paths.run_dir / "debugger.raw").read_bytes(), b"12345")

    def test_operator_signals(self):
        paths = self.run_paths()
        path = paths.run_dir / "signal.json"
        self.assertIsNone(read_signal(path))
        path.write_text('{"action": "skip"}')
        self.assertEqual(read_signal(path), {"action": "skip"})
        for text in ("", "[]", "{", '{"a": 1, "a": 2}', '{"a": NaN}', " " * 5000 + "{}"):
            with self.subTest(text=text[:20]):
                path.write_text(text)
                self.assertCode("operator-invalid", read_signal, path)
        path.unlink()
        (self.tmp / "target.json").write_text("{}")
        path.symlink_to(self.tmp / "target.json")
        self.assertCode("operator-invalid", read_signal, path)


if __name__ == "__main__":
    unittest.main()
