import access_guard  # noqa: F401  (installs the no-original-access guard first)

import hashlib
import itertools
import os
import shutil
import struct
import tempfile
import unittest
from pathlib import Path

from disc import private_disc
from protect import parse_manifest
from reasons import BaselineError
from sandbox import EXE, manifest_text
from synthetic import iso_image, noise

FILES = {EXE: noise(21, 3000), "MAIN/SPEECH.ARC": noise(22, 5000), "MAIN/EMPTY.BIN": b"",
         "FLICS/CLIP.FLC": noise(23, 2048 * 600 + 7), "FLICS/C-INT.FLC": b"hyphen"}  # one file spans more than one 1 MiB chunk


def manifest_for(files, image=b"image"):
    rows = {path: (len(data), hashlib.sha256(data).hexdigest()) for path, data in files.items()}
    return parse_manifest(manifest_text(rows, {"DISC.img": hashlib.sha256(image).hexdigest()}), EXE)


class DiscTests(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.tmp)
        self.names = itertools.count()

    def image(self, data, name="DISC.img"):
        path = self.tmp / name
        path.write_bytes(data)
        return path

    def copy(self, manifest, image, omit=frozenset(), target="disc", check=None):
        return private_disc(manifest, image, self.tmp / target, omit, check)

    def assertMismatch(self, manifest, image, omit=frozenset()):
        with self.assertRaises(BaselineError) as caught:
            self.copy(manifest, image, omit, f"bad-{next(self.names)}")
        self.assertEqual(caught.exception.code, "source-mismatch")

    def test_raw_and_cooked_images_without_the_omitted_file(self):
        for raw in (True, False):
            with self.subTest(raw=raw):
                image = self.image(iso_image(FILES, raw=raw), f"DISC-{raw}.img")
                target = f"disc-{raw}"
                copied = self.copy(manifest_for(FILES), image, frozenset({"MAIN/SPEECH.ARC"}), target)
                kept = {path: data for path, data in FILES.items() if path != "MAIN/SPEECH.ARC"}
                self.assertEqual(copied, {path: hashlib.sha256(data).hexdigest() for path, data in kept.items()})
                for path, data in kept.items():
                    copy = self.tmp / target / path
                    self.assertEqual(copy.read_bytes(), data)
                    self.assertFalse(copy.is_symlink())
                    self.assertEqual(os.lstat(copy).st_nlink, 1)
                self.assertFalse((self.tmp / target / "MAIN/SPEECH.ARC").exists())
                self.assertEqual(sorted(p.name for p in (self.tmp / target).iterdir()), ["FLICS", "MAIN"])

    def test_without_omissions_every_manifest_file_is_copied(self):
        copied = self.copy(manifest_for(FILES), self.image(iso_image(FILES)))
        self.assertEqual(set(copied), set(FILES))

    def test_files_beyond_the_manifest_are_not_copied(self):
        extra = dict(FILES, **{"DRIVERS/SETUP.EXE": b"setup", "README.TXT": b"read"})
        self.copy(manifest_for(FILES), self.image(iso_image(extra)))
        self.assertFalse((self.tmp / "disc" / "DRIVERS").exists())
        self.assertFalse((self.tmp / "disc" / "README.TXT").exists())

    def test_contents_must_match_the_manifest(self):
        image = self.image(iso_image(FILES))
        wrong = dict(FILES, **{"MAIN/SPEECH.ARC": noise(99, 5000)})
        self.assertMismatch(manifest_for(wrong), image)
        longer = dict(FILES, **{"MAIN/SPEECH.ARC": noise(22, 5001)})
        self.assertMismatch(manifest_for(longer), image)
        missing = dict(FILES, **{"MAIN/OTHER.ARC": b"absent"})
        self.assertMismatch(manifest_for(missing), image)
        # The same mismatches are ignored only for the omitted file itself.
        self.copy(manifest_for(missing), image, frozenset({"MAIN/OTHER.ARC"}), "ok")

    def test_unsupported_or_damaged_images(self):
        good = iso_image(FILES)
        manifest = manifest_for(FILES)
        self.assertMismatch(manifest, self.image(good[:-5], "short.img"))
        damaged = bytearray(good)
        damaged[2352 * 20 + 3] = 0  # a later sector loses its sync pattern
        self.assertMismatch(manifest, self.image(bytes(damaged), "sync.img"))
        cooked = bytearray(iso_image(FILES, raw=False))
        cooked[16 * 2048 + 1:16 * 2048 + 6] = b"CDXXX"
        self.assertMismatch(manifest, self.image(bytes(cooked), "pvd.img"))
        cooked = bytearray(iso_image(FILES, raw=False))
        cooked[16 * 2048 + 128:16 * 2048 + 130] = struct.pack("<H", 512)
        self.assertMismatch(manifest, self.image(bytes(cooked), "block.img"))
        self.assertMismatch(manifest, self.image(b"", "empty.img"))
        (self.tmp / "dir.img").mkdir()
        self.assertMismatch(manifest, self.tmp / "dir.img")

    def test_ambiguous_names_and_wrong_entry_kinds(self):
        self.assertMismatch(manifest_for(FILES), self.image(iso_image(FILES, extra_names=(b"SPEECH.ARC;2",)), "a.img"))
        nested = {"MAIN/SPEECH.ARC/INNER.BIN": b"x", EXE: FILES[EXE]}
        self.assertMismatch(manifest_for({"MAIN/SPEECH.ARC": b"x", EXE: FILES[EXE]}), self.image(iso_image(nested), "b.img"))
        flat = {"MAIN.BIN": b"x", "OTHER/GAME.EXE": FILES[EXE]}
        self.assertMismatch(manifest_for({"MAIN.BIN/A.B": b"x", EXE: FILES[EXE]}), self.image(iso_image(flat), "c.img"))

    def test_paths_stay_inside_the_target(self):
        outside = self.tmp / "OUT.BIN"
        for path in ("MAIN/../OUT.BIN", "../OUT.BIN", "/OUT.BIN", "MAIN//X.BIN", "MAIN/./X.BIN"):
            with self.subTest(path=path):
                self.assertMismatch(manifest_for({path: b"x", EXE: FILES[EXE]}), self.image(iso_image(FILES), f"p{next(self.names)}.img"))
                self.assertFalse(outside.exists())

    def test_identifiers_outside_the_subset_are_never_matched(self):
        image = bytearray(iso_image(FILES, raw=False))
        at = bytes(image).find(b"SPEECH.ARC;1")
        image[at:at + 12] = b"SPEECH.ARC;X"
        manifest = manifest_for(FILES)
        self.assertMismatch(manifest, self.image(bytes(image), "version.img"))
        self.copy(manifest, self.image(bytes(image), "version2.img"), frozenset({"MAIN/SPEECH.ARC"}), "fine")
        image[at:at + 12] = b"SPEECH.AR.;1"
        self.assertMismatch(manifest, self.image(bytes(image), "dots.img"))

    def test_volume_descriptor_fields_are_checked_in_both_byte_orders(self):
        manifest = manifest_for(FILES)
        good = iso_image(FILES, raw=False)
        cases = ((130, struct.pack(">H", 512)), (84, struct.pack(">I", 99)), (80, struct.pack("<I", 99)),
                 (80, struct.pack("<I", 10 ** 6) + struct.pack(">I", 10 ** 6)))
        for offset, value in cases:
            with self.subTest(offset=offset, value=value):
                image = bytearray(good)
                image[16 * 2048 + offset:16 * 2048 + offset + len(value)] = value
                self.assertMismatch(manifest, self.image(bytes(image), f"v{next(self.names)}.img"))

    def test_extents_must_lie_inside_the_logical_volume(self):
        manifest = manifest_for(FILES)
        image = bytearray(iso_image(FILES, raw=False))
        blocks = len(image) // 2048
        image += bytes(2048 * 4)  # padding after the volume is not part of it
        self.copy(manifest, self.image(bytes(image), "padded.img"), target="padded")
        image[16 * 2048 + 80:16 * 2048 + 88] = struct.pack("<I", blocks - 1) + struct.pack(">I", blocks - 1)
        self.assertMismatch(manifest, self.image(bytes(image), "short-volume.img"))

    def test_directories_spanning_several_blocks(self):
        files = {f"MAIN/F{i:03d}.BIN": bytes([i]) * (i + 1) for i in range(90)}
        files[EXE] = FILES[EXE]
        image = iso_image(files)
        copied = self.copy(manifest_for(files), self.image(image, "many.img"), target="many")
        self.assertEqual(len(copied), 91)
        self.assertEqual((self.tmp / "many/MAIN/F089.BIN").read_bytes(), bytes([89]) * 90)

    def test_deadline_is_checked_while_copying(self):
        calls = []

        def check():
            calls.append(1)
            if len(calls) > 2:
                raise BaselineError("run-timeout", "run")
        with self.assertRaises(BaselineError) as caught:
            self.copy(manifest_for(FILES), self.image(iso_image(FILES)), check=check)
        self.assertEqual(caught.exception.code, "run-timeout")


if __name__ == "__main__":
    unittest.main()
