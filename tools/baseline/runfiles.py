"""Run directory, report and log files of one measurement run (P3-01 subtask 02).

A run writes only inside a new, uniquely named directory below `local/research/`: the directory must not exist,
its resolved path must stay inside the resolved research root (no traversal, no symlink escape) and every file is
created exclusively. The report is first written in its unfinished state and later replaced atomically by its final
state; nothing outside the run directory is ever rewritten. Terminal output names files only by safe relative paths.
"""
import fcntl
import itertools
import json
import os
from dataclasses import dataclass
from pathlib import Path

from reasons import BaselineError
from report import RUN_ID

REPORT = "report.json"
MAX_SIGNAL_BYTES = 4096


@dataclass(frozen=True)
class RunPaths:
    run_dir: Path  # resolved
    display: str  # "local/research/<relative>", safe for terminal output

    def file(self, name):
        return self.run_dir / name

    def contained(self):
        """Re-checks before a write that the run directory still resolves to itself (no ancestor swapped for a
        link since creation)."""
        if Path(os.path.realpath(self.run_dir)) != self.run_dir:
            raise BaselineError("output-path-invalid", "run")

    def show(self, name):
        return f"{self.display}/{name}"


def _inside(path, root):
    return path != root and path.is_relative_to(root)


def _below_root(path, research_root, code, where, allow_root=False):
    """A directory below the resolved research root, named without traversal and with restricted components after
    symbolic links are resolved. Returns (resolved directory, its parts relative to the root)."""
    root = Path(os.path.realpath(research_root))
    text = os.fspath(path)
    if not text or "\0" in text or ".." in Path(text).parts:
        raise BaselineError(code, where)
    resolved = Path(os.path.realpath(text))
    if not (_inside(resolved, root) or (allow_root and resolved == root)):
        raise BaselineError(code, where)
    relative = resolved.relative_to(root).parts
    if not all(RUN_ID.fullmatch(part) for part in relative):
        raise BaselineError(code, where)
    return resolved, relative


def resolve_output(out, run_id, research_root):
    """Validates the output parent and run ID before any side effect; returns the run paths."""
    if type(run_id) is not str or not RUN_ID.fullmatch(run_id):
        raise BaselineError("output-path-invalid", "run-id")
    parent, relative = _below_root(out, research_root, "output-path-invalid", "out")
    run_dir = parent / run_id
    if os.path.lexists(run_dir):
        raise BaselineError("output-exists", "run")
    return RunPaths(run_dir, "/".join(("local", "research", *relative, run_id)))


def resolve_evidence(evidence, paths, research_root):
    """The evidence root whose pre-existing files a run protects: the research root by default, or an opt-in
    narrower directory inside it that contains the run directory (other sessions may then write elsewhere under
    the research root). Returns (resolved directory, "local/research/..." display path)."""
    if evidence is None:
        return Path(os.path.realpath(research_root)), "local/research"
    scope, relative = _below_root(evidence, research_root, "evidence-scope-invalid", "evidence", allow_root=True)
    if not _inside(paths.run_dir, scope):
        raise BaselineError("evidence-scope-invalid", "evidence")
    return scope, "/".join(("local", "research", *relative))


def create_run_dir(paths, research_root):
    """Creates the output parents and the new run directory below the research root, component by component
    through directory descriptors that never follow a symbolic link, then re-checks containment."""
    root = Path(os.path.realpath(research_root))
    parts = paths.run_dir.relative_to(root).parts
    flags = os.O_RDONLY | getattr(os, "O_DIRECTORY", 0) | getattr(os, "O_NOFOLLOW", 0)
    descriptor = None
    try:
        descriptor = os.open(root, flags)
        for part in parts[:-1]:
            try:
                os.mkdir(part, 0o700, dir_fd=descriptor)
            except FileExistsError:
                pass
            child = os.open(part, flags, dir_fd=descriptor)
            os.close(descriptor)
            descriptor = child
        os.mkdir(parts[-1], 0o700, dir_fd=descriptor)
    except FileExistsError:
        raise BaselineError("output-exists", "run") from None
    except OSError:
        raise BaselineError("output-path-invalid", "run") from None
    finally:
        if descriptor is not None:
            os.close(descriptor)
    if Path(os.path.realpath(paths.run_dir)) != paths.run_dir or not _inside(paths.run_dir, root):
        raise BaselineError("output-path-invalid", "run")


class SessionLock:
    """One measurement session per research root: an exclusive, non-blocking lock on the root directory itself
    (no lock file is created), held from before the first hash until the final report."""

    def __init__(self, research_root):
        self.descriptor = os.open(os.path.realpath(research_root), os.O_RDONLY | getattr(os, "O_DIRECTORY", 0))
        try:
            fcntl.flock(self.descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            os.close(self.descriptor)
            raise BaselineError("session-busy", "lock") from None

    def release(self):
        if self.descriptor is not None:
            fcntl.flock(self.descriptor, fcntl.LOCK_UN)
            os.close(self.descriptor)
            self.descriptor = None


def _exclusive(path, data):
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0)
    descriptor = os.open(path, flags, 0o600)
    with os.fdopen(descriptor, "wb") as stream:
        stream.write(data)
        stream.flush()
        os.fsync(stream.fileno())


def write_new(paths, name, data):
    """Writes a new file in the run directory; never replaces an existing one."""
    paths.contained()
    try:
        _exclusive(paths.file(name), data)
    except FileExistsError:
        raise BaselineError("output-exists", name) from None
    except OSError:
        raise BaselineError("report-write-failed", name) from None


def write_json(paths, name, value):
    write_new(paths, name, (json.dumps(value, indent=2, sort_keys=True, allow_nan=False) + "\n").encode("utf-8"))


_TEMPORARY = itertools.count(1)


def replace_file(paths, name, data):
    """Creates or atomically replaces a file the run owns, through an exclusive, non-following temporary."""
    paths.contained()
    temporary = paths.file(f".{Path(name).name}.{next(_TEMPORARY)}.tmp")
    try:
        _exclusive(temporary, data)
        os.replace(temporary, paths.file(name))
    except OSError:
        raise BaselineError("report-write-failed", name) from None


class ReportWriter:
    """report.json: created exclusively in its unfinished state, then replaced atomically by later states."""

    def __init__(self, paths):
        self.paths = paths
        self.written = False

    def write(self, text):
        data = text.encode("utf-8")
        if self.written:
            replace_file(self.paths, REPORT, data)
            return
        self.paths.contained()
        try:
            _exclusive(self.paths.file(REPORT), data)
        except OSError:
            raise BaselineError("report-write-failed", REPORT) from None
        self.written = True


class Log:
    """Raw debugger output and the command transcript, within the recipe's cumulative log byte budget."""

    def __init__(self, paths, budget):
        self.budget = budget
        self.used = 0
        flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_APPEND | getattr(os, "O_NOFOLLOW", 0)
        paths.contained()
        try:
            self.raw = os.fdopen(os.open(paths.file("debugger.raw"), flags, 0o600), "wb")
            self.commands = os.fdopen(os.open(paths.file("commands.log"), flags, 0o600), "wb")
        except OSError:
            raise BaselineError("report-write-failed", "log") from None

    def _write(self, stream, data):
        if self.used + len(data) > self.budget:
            raise BaselineError("log-budget-exceeded", "log")
        self.used += len(data)
        try:
            stream.write(data)
            stream.flush()
        except OSError:
            raise BaselineError("report-write-failed", "log") from None

    def output(self, data):
        self._write(self.raw, bytes(data))

    def command(self, text):
        self._write(self.commands, (text + "\n").encode("ascii"))

    def close(self):
        for stream in (self.raw, self.commands):
            try:
                stream.close()
            except OSError:
                pass


def _reject(name):
    raise ValueError("non-finite constant")


def read_signal(path):
    """An operator signal file: a small JSON object with unique keys; None when absent, operator-invalid otherwise."""
    try:
        descriptor = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
    except FileNotFoundError:
        return None
    except OSError:
        raise BaselineError("operator-invalid", "signal") from None
    with os.fdopen(descriptor, "rb") as stream:
        data = stream.read(MAX_SIGNAL_BYTES + 1)

    def unique(pairs):
        keys = [key for key, _ in pairs]
        if len(keys) != len(set(keys)):
            raise ValueError("duplicate key")
        return dict(pairs)

    try:
        if len(data) > MAX_SIGNAL_BYTES:
            raise ValueError("too large")
        value = json.loads(data.decode("utf-8"), object_pairs_hook=unique, parse_constant=_reject)
    except (UnicodeDecodeError, ValueError, TypeError, RecursionError):
        raise BaselineError("operator-invalid", "signal") from None
    if type(value) is not dict:
        raise BaselineError("operator-invalid", "signal")
    return value
