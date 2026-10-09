"""Test guard: fails any attempt to open or list the ignored `local/` directory or an original game file.

Importing this module installs an audit hook for the rest of the process (audit hooks cannot be removed). Each
baseline test module imports it first, so a test that touches original data raises instead of reading it.
"""
import os
import sys
from pathlib import Path

REPOSITORY = Path(__file__).resolve().parents[2]
_LOCAL = os.path.realpath(REPOSITORY / "local")
_LOCAL_ROOTS = tuple({str(REPOSITORY / "local"), _LOCAL})
ORIGINAL_NAMES = frozenset({"srangers.exe", "sranger.cfg", "srhiscor.raw"})
ORIGINAL_SUFFIXES = (".nob", ".smk")
_EVENTS = frozenset({"open", "os.listdir", "os.scandir", "os.chdir", "shutil.copyfile", "shutil.copytree"})


def forbidden(path):
    """Whether a path names the local research directory, anything inside it or an original game file."""
    if isinstance(path, int) or path is None:
        return False
    try:
        text = os.fsdecode(os.fspath(path))
    except TypeError:
        return False
    absolute = os.path.abspath(text)
    for candidate in (Path(absolute), Path(os.path.realpath(text))):
        if any(candidate.is_relative_to(root) for root in _LOCAL_ROOTS):
            return True
    name = os.path.basename(absolute).lower()
    return name in ORIGINAL_NAMES or name.endswith(ORIGINAL_SUFFIXES)


def _hook(event, args):
    if event in _EVENTS and args and forbidden(args[0]):
        raise PermissionError("baseline tests must not access local/ or original game files")


if not getattr(sys, "_osr_baseline_guard", False):
    sys.addaudithook(_hook)
    sys._osr_baseline_guard = True
