import contextlib
import importlib.util
import io
import sys
import tempfile
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path
from unittest.mock import patch


SCRIPT = Path(__file__).with_name("patch-watcom-cspec.py")
SPEC = importlib.util.spec_from_file_location("patch_watcom", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class PatchWatcomTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.home = Path(self.temp.name)
        self.cspec = self.home / "Ghidra/Processors/x86/data/languages/x86borland.cspec"
        self.cspec.parent.mkdir(parents=True)

    def run_patch(self):
        output = io.StringIO()
        with patch.object(sys, "argv", [str(SCRIPT), str(self.home)]), contextlib.redirect_stdout(output):
            result = MODULE.main()
        return result, output.getvalue()

    def test_patches_by_structure_and_preserves_other_elements(self):
        original = """<?xml version="1.0"?>
<compiler_spec>
<!-- retained comment -->
<stackpointer space="ram" register="ESP"/>
<default_proto><prototype stackshift="4" name="__fastcall" extrapop="unknown">
<input><pentry maxsize="4" minsize="1"><register name="EAX"/></pentry></input>
</prototype></default_proto>
<prototype name="__cdecl" extrapop="4" stackshift="4"/>
</compiler_spec>
"""
        self.cspec.write_text(original)
        before = ET.fromstring(original)

        self.assertEqual(self.run_patch()[0], 0)
        after = ET.parse(self.cspec).getroot()
        self.assertEqual(after.find("default_proto/prototype").get("name"), "__watcall")
        old = after.find("prototype[@name='__fastcall']")
        self.assertEqual(old.attrib, before.find("default_proto/prototype").attrib)
        self.assertEqual(old.find("input/pentry/register").get("name"), "EAX")
        self.assertEqual(after.find("stackpointer").attrib, before.find("stackpointer").attrib)
        self.assertEqual(after.find("prototype[@name='__cdecl']").attrib, before.find("prototype[@name='__cdecl']").attrib)
        self.assertIn("retained comment", self.cspec.read_text())
        self.assertEqual(self.cspec.with_suffix(".cspec.orig").read_text(), original)

    def test_repeated_patch_leaves_file_and_backup_unchanged(self):
        self.cspec.write_text('<compiler_spec><default_proto><prototype name="__fastcall"/></default_proto></compiler_spec>')
        self.assertEqual(self.run_patch()[0], 0)
        patched = self.cspec.read_bytes()
        backup = self.cspec.with_suffix(".cspec.orig").read_bytes()

        result, output = self.run_patch()
        self.assertEqual(result, 0)
        self.assertIn("already patched", output)
        self.assertEqual(self.cspec.read_bytes(), patched)
        self.assertEqual(self.cspec.with_suffix(".cspec.orig").read_bytes(), backup)

    def test_unsupported_layout_reports_failure_without_rewriting(self):
        original = '<compiler_spec><default_proto><prototype name="__cdecl"/></default_proto></compiler_spec>'
        self.cspec.write_text(original)

        result, output = self.run_patch()
        self.assertEqual(result, 1)
        self.assertIn("not patched", output)
        self.assertEqual(self.cspec.read_text(), original)


if __name__ == "__main__":
    unittest.main()
