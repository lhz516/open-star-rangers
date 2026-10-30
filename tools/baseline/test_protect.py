import access_guard  # noqa: F401  (installs the no-original-access guard first)

import os
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from protect import (Protection, emulator_settings, game_config, inventory, override_game_config, override_settings,
                     parse_manifest, private_config, private_copy, sha256_file, verify_install, verify_media)
from reasons import BaselineError
from recipe import exe_fingerprint
from sandbox import EXE, manifest_text

SETTINGS = b"SOUND_LEVEL=100\r\nCURR_LEVEL=100 53\r\nSTARTUP_PRACTICE=TRUE\r\nDETAIL=TRUE\r\n"
REQUESTED = {"STARTUP_PRACTICE": False, "CURR_LEVEL": (100, 19)}

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

    def test_private_config_wraps_the_game_launch_for_an_audio_capture(self):
        base = BASE_CONFIG.format(captures=self.tmp / "captures", install=self.install, cd=self.tmp / "cd") + "srangers\n"
        text, record = self.config(base)
        self.assertTrue(text.endswith("c:\nsrangers\n"))  # unchanged without the setting
        self.assertEqual(record["changes"], {"captures": 1, "mount-c": 1})
        text, record = self.config(base, emulator={"audioCapture": "multitrack"})
        self.assertTrue(text.endswith("c:\ncd main\ndx-capture /M srangers.exe\ncd ..\n"))
        self.assertEqual(record["changes"], {"captures": 1, "mount-c": 1, "audio-capture": 1})
        self.assertEqual(record["changedLines"], 3)
        for refused in (base[:-len("srangers\n")], base + "SRANGERS.BAT\n"):  # no launch, or two
            with self.subTest(refused=refused[-30:]):
                self.assertCode("private-copy-invalid", self.config, refused, {"audioCapture": "multitrack"})

    def test_private_config_mounts_a_private_disc_on_the_same_drive(self):
        cd = self.tmp / "cd"
        cd.mkdir()
        base = BASE_CONFIG.format(captures=self.tmp / "captures", install=self.install, cd=cd)
        disc = self.tmp / "run dir" / "disc"
        text, record = private_config(base.replace("imgmount d", "imgmount E"), self.install,
                                      self.tmp / "run/install", self.tmp / "run/captures", cd, {}, disc)
        self.assertIn(f'mount E "{disc}" -t cdrom\n', text)
        self.assertNotIn("imgmount", text)
        self.assertEqual(record["changes"], {"captures": 1, "mount-c": 1, "disc": 1})
        self.assertEqual(record["media"], Path(os.path.realpath(cd / "DISC.cue")))  # still bound to the manifest
        for refused in (base + f"imgmount e {cd}/DISC.cue -t cdrom\n", base.replace(f"imgmount d {cd}", "imgmount d /x")):
            with self.subTest(refused=refused[-40:]):
                self.assertCode("private-copy-invalid", private_config, refused, self.install,
                                self.tmp / "run/install", self.tmp / "run/captures", cd, {}, disc)

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

    def test_game_settings_rewrite_only_their_lines(self):
        cases = (
            (SETTINGS, REQUESTED, b"SOUND_LEVEL=100\r\nCURR_LEVEL=100 19\r\nSTARTUP_PRACTICE=FALSE\r\nDETAIL=TRUE\r\n"),
            (SETTINGS, {}, SETTINGS),
            (SETTINGS, {"STARTUP_PRACTICE": True}, SETTINGS),
            (b"A=1\n  CURR_LEVEL = 1 2 \t\rB=2\r\nSTARTUP_PRACTICE=\r\nC=CURR_LEVEL=9", REQUESTED,
             b"A=1\n  CURR_LEVEL = 100 19 \t\rB=2\r\nSTARTUP_PRACTICE=FALSE\r\nC=CURR_LEVEL=9"),
            (b"X=1\r\nCURR_LEVEL=0 0", {"CURR_LEVEL": (0, 100)}, b"X=1\r\nCURR_LEVEL=0 100"),
        )
        for data, settings, expected in cases:
            with self.subTest(data=data, settings=settings):
                self.assertEqual(override_settings(data, settings), expected)

    def test_game_settings_refusals(self):
        for data in (b"SOUND_LEVEL=100\r\nSTARTUP_PRACTICE=TRUE\r\n",  # CURR_LEVEL missing
                     SETTINGS + b"CURR_LEVEL=0 0\r\n",
                     SETTINGS + b"curr_level=0 0\r\n",
                     SETTINGS.replace(b"CURR_LEVEL", b"Curr_Level"),
                     b"CURR_LEVEL 100 53\r\nSTARTUP_PRACTICE=TRUE\r\n",
                     b"",
                     SETTINGS + b"#" * (1 << 20)):
            with self.subTest(data=data[:48]):
                self.assertCode("game-config-invalid", override_settings, data, REQUESTED)

    def private_settings(self, name, data=SETTINGS):
        install = self.tmp / name
        (install / "MAIN").mkdir(parents=True)
        (install / "MAIN/GAME.CFG").write_bytes(data)
        return install

    def test_private_game_config_is_written_in_place_and_recorded(self):
        install = self.private_settings("private")
        path = install / "MAIN/GAME.CFG"
        inode = os.lstat(path).st_ino
        record = override_game_config(install, REQUESTED, "MAIN/GAME.CFG")
        self.assertEqual(path.read_bytes(), override_settings(SETTINGS, REQUESTED))
        self.assertEqual(os.lstat(path).st_ino, inode)
        self.assertEqual(record, {**game_config(path, "MAIN/GAME.CFG"), "overrides": {
            "requested": REQUESTED, "before": {"sha256": exe_fingerprint(SETTINGS), "settings": {
                "SOUND_LEVEL": "100", "CURR_LEVEL": "100 53", "STARTUP_PRACTICE": "TRUE", "DETAIL": "TRUE"}}}})
        self.assertEqual(record["sha256"], sha256_file(path))
        self.assertEqual((record["settings"]["CURR_LEVEL"], record["settings"]["STARTUP_PRACTICE"]),
                         ("100 19", "FALSE"))

    def test_private_game_config_refuses_links_and_missing_files(self):
        baseline = self.private_settings("baseline")
        target = baseline / "MAIN/GAME.CFG"
        leaf_link = self.private_settings("leaf-link")
        (leaf_link / "MAIN/GAME.CFG").unlink()
        (leaf_link / "MAIN/GAME.CFG").symlink_to(target)
        hard = self.private_settings("hard")
        (hard / "MAIN/GAME.CFG").unlink()
        os.link(self.private_settings("hard-source") / "MAIN/GAME.CFG", hard / "MAIN/GAME.CFG")
        ancestor = self.tmp / "ancestor"  # a single-link baseline file reached through a linked directory
        ancestor.mkdir()
        (ancestor / "MAIN").symlink_to(baseline / "MAIN")
        root = self.tmp / "root-link"
        root.symlink_to(baseline)
        missing = self.private_settings("missing")
        (missing / "MAIN/GAME.CFG").unlink()
        directory = self.private_settings("directory")
        (directory / "MAIN/GAME.CFG").unlink()
        (directory / "MAIN/GAME.CFG").mkdir()
        broken = self.private_settings("broken", b"SOUND_LEVEL=100\r\n")
        for install in (leaf_link, hard, ancestor, root, missing, directory, broken, self.tmp / "absent"):
            with self.subTest(install=install.name):
                self.assertCode("game-config-invalid", override_game_config, install, REQUESTED, "MAIN/GAME.CFG")
        self.assertEqual(target.read_bytes(), SETTINGS)
        self.assertEqual((broken / "MAIN/GAME.CFG").read_bytes(), b"SOUND_LEVEL=100\r\n")


if __name__ == "__main__":
    unittest.main()
