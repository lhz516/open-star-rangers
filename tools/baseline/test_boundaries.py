import access_guard  # noqa: F401  (installs the no-original-access guard first)

import ast
import re
import sys
import unittest
from pathlib import Path

from reasons import REASONS, REASON_SET, BaselineError, ordered

HERE = Path(__file__).resolve().parent
SOURCES = sorted(HERE.glob("*.py"))
SIBLINGS = {path.stem for path in SOURCES}
PURE = {"reasons", "recipe", "inputs", "le_image", "locate", "qualify", "report"}
PURE_STDLIB = {"dataclasses", "hashlib", "json", "math", "re", "struct"}


def imports(path):
    names = set()
    for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
        if isinstance(node, ast.Import):
            names.update(alias.name.split(".")[0] for alias in node.names)
        elif isinstance(node, ast.ImportFrom):
            names.add(node.module.split(".")[0])
    return names


class BoundaryTests(unittest.TestCase):
    def test_only_standard_library_and_sibling_imports(self):
        for path in SOURCES:
            with self.subTest(path.name):
                self.assertEqual(imports(path) - set(sys.stdlib_module_names) - SIBLINGS, set())

    def test_pure_modules_have_no_process_file_or_clock_access(self):
        for name in PURE:
            with self.subTest(name):
                self.assertEqual(imports(HERE / f"{name}.py") - PURE_STDLIB - PURE, set())
                tree = ast.parse((HERE / f"{name}.py").read_text(encoding="utf-8"))
                calls = {node.func.id for node in ast.walk(tree)
                         if isinstance(node, ast.Call) and isinstance(node.func, ast.Name)}
                self.assertEqual(calls & {"open", "exec", "eval", "compile", "__import__", "input"}, set())

    def test_sources_hold_no_embedded_byte_runs(self):
        hex_run = re.compile(r"[0-9A-Fa-f]{32,}")
        escapes = re.compile(r"(?:\\x[0-9A-Fa-f]{2}){8,}")
        decoder = re.compile(r"\.from" + r"hex\(|b64" + r"decode|unhex" + r"lify")
        for path in SOURCES:
            with self.subTest(path.name):
                text = path.read_text(encoding="utf-8")
                self.assertIsNone(hex_run.search(text))
                self.assertIsNone(escapes.search(text))
                self.assertIsNone(decoder.search(text))

    def test_access_guard_blocks_local_and_original_files(self):
        local = access_guard.REPOSITORY / "local" / "research" / "missing.txt"
        for target in (local, access_guard.REPOSITORY / "local", HERE / "SRANGERS.EXE", HERE / "missing.nob"):
            with self.subTest(target.name):
                self.assertTrue(access_guard.forbidden(target))
                with self.assertRaises(PermissionError):
                    open(target, "rb")
        with self.assertRaises(PermissionError):
            list((access_guard.REPOSITORY / "local").iterdir())
        self.assertFalse(access_guard.forbidden(HERE / "reasons.py"))
        self.assertFalse(access_guard.forbidden(HERE.parent / "localized.txt"))

    def test_reason_codes_are_closed_and_stable(self):
        self.assertEqual(len(REASONS), len(REASON_SET))
        self.assertTrue(all(re.fullmatch(r"[a-z]+(?:-[a-z0-9]+)*", code) for code in REASONS))
        with self.assertRaises(ValueError):
            BaselineError("made-up-code")
        with self.assertRaises(ValueError):
            ordered(["made-up-code"])
        self.assertEqual(ordered(["run-cancelled", "read-fault", "read-fault"]), ("read-fault", "run-cancelled"))
        error = BaselineError("read-short", "ticks")
        self.assertEqual((error.code, error.where, str(error)), ("read-short", "ticks", "read-short at ticks"))


if __name__ == "__main__":
    unittest.main()
