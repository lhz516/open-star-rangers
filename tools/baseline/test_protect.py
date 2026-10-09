import access_guard  # noqa: F401  (installs the no-original-access guard first)

import os
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from protect import (Protection, emulator_settings, inventory, parse_manifest, private_config, private_copy,
                     verify_install, verify_media)
from reasons import BaselineError
from recipe import exe_fingerprint
from sandbox import EXE, manifest_text

BASE_CONFIG = """[dosbox]
memsize         = 16
captures        = {captures}

[cpu]
core            = normal
cycles          = fixed 40000

[autoexec]
mount c {install}
imgmount d {cd}/DISC.cue -t cdrom
c:
"""


class ProtectTests(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.tmp)
        self.install = self.tmp / "install"
        (self.install / "MAIN").mkdir(parents=True)
        (self.install / EXE).write_bytes(b"executable")
        (self.install / "MAIN/DATA.BIN").write_bytes(b"data")

    def assertCode(self, code, function, *args, **kwargs):
        with self.assertRaises(BaselineError) as caught:
            function(*args, **kwargs)
        self.assertEqual(caught.exception.code, code)

    def manifest(self, **overrides):
        rows = {EXE: (10, exe_fingerprint(b"executable")), "MAIN/DATA.BIN": (4, exe_fingerprint(b"data")),
                "MAIN/ONDISC.BIN": (1, exe_fingerprint(b"x"))}
        rows.update(overrides)
        return parse_manifest(manifest_text(rows, {"DISC.img": exe_fingerprint(b"image")}), EXE)

    def test_manifest_and_installation(self):
        manifest = self.manifest()
        self.assertEqual(manifest.exe_sha256, exe_fingerprint(b"executable"))
        self.assertRegex(manifest.version, r"^manifest-[0-9a-f]{16}$")
        self.assertEqual(manifest.version, self.manifest().version)
        self.assertNotEqual(manifest.version, self.manifest(**{"MAIN/DATA.BIN": (5, "0" * 64)}).version)
        self.assertEqual(verify_install(manifest, self.install), [EXE, "MAIN/DATA.BIN"])  # disc files not installed
        self.assertCode("source-mismatch", parse_manifest, "no rows", EXE)
        self.assertCode("source-mismatch", verify_install, self.manifest(**{"MAIN/DATA.BIN": (4, "0" * 64)}),
                        self.install)
        (self.install / EXE).unlink()
        self.assertCode("source-mismatch", verify_install, manifest, self.install)

    def test_private_copy_is_independent(self):
        copied = private_copy(self.install, self.tmp / "copy")
        self.assertEqual(set(copied), {EXE, "MAIN/DATA.BIN"})
        source, target = os.lstat(self.install / EXE), os.lstat(self.tmp / "copy" / EXE)
        self.assertNotEqual((source.st_dev, source.st_ino), (target.st_dev, target.st_ino))
        self.assertEqual(target.st_nlink, 1)

    def test_private_copy_rejects_links(self):
        (self.install / "MAIN/LINK.BIN").symlink_to(self.install / "MAIN/DATA.BIN")
        self.assertCode("private-copy-invalid", private_copy, self.install, self.tmp / "copy1")
        self.assertFalse((self.tmp / "copy1").exists())
        (self.install / "MAIN/LINK.BIN").unlink()

        def hard_link(source, target, follow_symlinks=True):
            os.link(source, target)
        with mock.patch("protect.shutil.copyfile", side_effect=hard_link):
            self.assertCode("private-copy-invalid", private_copy, self.install, self.tmp / "copy2")
        self.assertEqual((self.install / "MAIN/DATA.BIN").read_bytes(), b"data")

    def config(self, text=None, emulator=None):
        cd = self.tmp / "cd"
        cd.mkdir(exist_ok=True)
        text = text or BASE_CONFIG.format(captures=self.tmp / "captures", install=self.install, cd=cd)
        return private_config(text, self.install, self.tmp / "run/install", self.tmp / "run/captures", cd,
                              emulator or {})

    def test_private_config_redirects_only_paths_and_allowed_settings(self):
        text, record = self.config()
        self.assertIn(f"mount c {self.tmp / 'run/install'}", text)
        self.assertIn(f"captures        = {self.tmp / 'run/captures'}", text)
        self.assertIn("cycles          = fixed 40000", text)
        self.assertEqual(record["changes"], {"captures": 1, "mount-c": 1})
        self.assertEqual(record["settings"], {"memsize": 16, "core": "normal", "cycles": 40000})
        text, record = self.config(emulator={"cycles": 25000})
        self.assertIn("cycles          = fixed 25000", text)
        self.assertEqual(record["changedLines"], 3)
        self.assertEqual(emulator_settings("[cpu]\ncycles=max\n[dosbox]\ncycles=fixed 9\n"), {"cycles": "max"})

    def test_media_binding(self):
        cd = self.tmp / "cd"
        cd.mkdir()
        (cd / "DISC.img").write_bytes(b"image")
        (cd / "DISC.cue").write_text('FILE "DISC.img" BINARY\n  TRACK 01 MODE1/2352\n')
        (cd / "OTHER.cue").write_text('FILE "OTHER.img" BINARY\n')
        (cd / "OTHER.img").write_bytes(b"other")
        (cd / "DISC.sub").write_bytes(b"subchannel")
        (cd / "SUB.cue").write_text('FILE "DISC.sub" BINARY\n')
        manifest = parse_manifest(manifest_text({EXE: (10, exe_fingerprint(b"executable"))},
                                                {"DISC.img": exe_fingerprint(b"image"),
                                                 "DISC.sub": exe_fingerprint(b"subchannel")}), EXE)
        self.assertEqual(verify_media(manifest, cd / "DISC.cue", cd)["images"], ["DISC.img"])
        self.assertEqual(verify_media(manifest, cd / "DISC.img", cd)["images"], ["DISC.img"])
        for target in (cd / "OTHER.cue", cd / "OTHER.img", cd / "DISC.sub", cd / "SUB.cue", self.install / EXE):
            with self.subTest(target=target.name):
                self.assertCode("source-mismatch", verify_media, manifest, target, cd)
        text, record = self.config()
        self.assertEqual(record["media"], Path(os.path.realpath(cd / "DISC.cue")))

    def test_private_config_refusals(self):
        cd = self.tmp / "cd"
        base = BASE_CONFIG.format(captures=self.tmp / "captures", install=self.install, cd=cd)
        for text in (base.replace("captures        =", "# captures ="),
                     base + f"mount c {self.install}\n",
                     base + f"mount e {self.tmp}\n",
                     base.replace(f"mount c {self.install}", f"mount c {self.tmp}"),
                     base.replace(f"imgmount d {cd}", f"imgmount d {self.tmp}/other"),
                     base.replace("[dosbox]", "[dosbox]\nlogfile = /tmp/log"),
                     base.replace("cycles          = fixed 40000\n", ""),
                     base.replace(f"imgmount d {cd}/DISC.cue -t cdrom\n", ""),
                     base.replace("-t cdrom", "-t floppy"),
                     base.replace("-t cdrom", "-t cdrom -o rw"),
                     base + f"imgmount e {cd}/DISC.cue -t cdrom\n"):
            with self.subTest(text=text):
                emulator = {"cycles": 30000} if "cycles" not in text else {}
                self.assertCode("private-copy-invalid", self.config, text, emulator)

    def test_protection_reports_and_never_restores(self):
        protected = self.tmp / "protected"
        evidence = self.tmp / "evidence"
        run = evidence / "run"
        for path in (protected, evidence, run):
            path.mkdir()
        (protected / "user.cfg").write_text("a")
        (protected / "gone.bin").write_text("b")
        (evidence / "old.json").write_text("{}")
        (protected / "large.bin").write_bytes(b"L" * (2 << 20))
        guard = Protection(self.tmp, [protected], [evidence], [protected], run)
        self.assertEqual(guard.record({protected / "gone.bin"}),
                         {"protectedFiles": 3, "evidenceFiles": 1, "snapshotFiles": 2,
                          "manifestVerifiedNotSnapshotted": 1})
        self.assertEqual((run / "protection/before/protected/large.bin").stat().st_size, 2 << 20)
        before, after = guard.inventories()
        self.assertEqual(set(before), {"protected", "evidence"})
        self.assertIsNone(after)
        (run / "own.json").write_text("{}")  # the run's own files are not evidence
        (evidence / "other-run.json").write_text("{}")  # new evidence elsewhere is listed, not a failure
        result = guard.verify()
        self.assertTrue(result["passed"])
        self.assertEqual(result["newEvidenceFiles"], 1)
        self.assertEqual(guard.inventories()[1]["protected"], before["protected"])
        self.assertFalse((run / "protection/before").exists())

        guard = Protection(self.tmp, [protected], [evidence], [protected], run)
        guard.record()
        (protected / "user.cfg").write_text("changed")
        (protected / "gone.bin").unlink()
        (protected / "new.bin").write_text("c")
        (evidence / "old.json").write_text("{ }")
        result = guard.verify()
        self.assertFalse(result["passed"])
        self.assertEqual(result["changed"], ["evidence/old.json", "protected/user.cfg"])
        self.assertEqual(result["removed"], ["protected/gone.bin"])
        self.assertEqual(result["added"], ["protected/new.bin"])
        self.assertEqual((protected / "user.cfg").read_text(), "changed")
        self.assertFalse((protected / "gone.bin").exists())
        self.assertEqual((run / "protection/before/protected/user.cfg").read_text(), "a")
        self.assertEqual((run / "protection/current/protected/user.cfg").read_text(), "changed")

    def test_inventory_records_links_without_following(self):
        (self.install / "MAIN/LINK.BIN").symlink_to("/nonexistent/target")
        found = inventory([self.install], self.tmp)
        self.assertTrue(found["install/MAIN/LINK.BIN"].startswith("link:"))


if __name__ == "__main__":
    unittest.main()
