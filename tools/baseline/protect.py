"""Original-file protection, source verification and the private run copy (P3-01 subtask 02).

Before a run the protected trees (the baseline installation, user state, configuration and CD image under
`local/StarRang/`) and the existing evidence next to the run are hashed; small installation, user-state and
configuration files are snapshotted into the run directory. After the run the hashes are compared: any change,
removal or (in the protected trees) new file fails the run. Nothing is ever written back or deleted outside the run
directory; on failure the snapshot and copies of the changed files are kept as evidence.

The game runs only in a private copy of the installation inside the run directory, verified against the baseline
manifest (docs/original/manifest.md) and free of links to baseline files, with a private emulator configuration that
differs from the baseline configuration only in the paths it redirects and the recipe-allowed settings. A recipe's
game settings rewrite only their own lines of the private copy's settings file.
"""
import hashlib
import json
import os
import re
import shutil
import stat
from dataclasses import dataclass
from pathlib import Path

from reasons import BaselineError

TEXT_LIMIT = 1 << 20  # bytes read from a settings file or CD descriptor
EXE_PATH = "MAIN/SRANGERS.EXE"
GAME_CONFIG = "MAIN/SRANGER.CFG"
_FILE_ROW = re.compile(r"^\|\s*`([A-Z0-9_./-]+)`\s*\|\s*([0-9,]+)\s*\|\s*`([0-9a-f]{64})`\s*\|\s*$")
_IMAGE_ROW = re.compile(r"^\|\s*`([A-Za-z0-9_.-]+\.(?:img|sub))`[^|]*\|\s*`([0-9a-f]{64})`\s*\|\s*$")
_SECTION = re.compile(r"^\s*\[([A-Za-z0-9_]+)\]\s*$")
_SETTING = re.compile(r"^(\s*)([A-Za-z0-9_]+)(\s*=\s*)(.*?)\s*$")
_MOUNT = re.compile(r"^\s*(mount|imgmount)\s+([A-Za-z])\s+(\"[^\"]*\"|\S+)(.*)$", re.I)
_GAME_SETTING = re.compile(rb"[ \t]*([A-Za-z0-9_]+)[ \t]*=[ \t]*(.*?)[ \t]*")
# Value text of the recipe-allowed game settings, as the game itself writes them.
GAME_SETTING_TEXT = {"STARTUP_PRACTICE": lambda flag: "TRUE" if flag else "FALSE",
                     "CURR_LEVEL": lambda levels: " ".join(map(str, levels))}
EMULATOR_KEYS = {"cycles": "cpu", "core": "cpu", "cputype": "cpu", "machine": "dosbox", "memsize": "dosbox"}
FORBIDDEN_KEYS = ("mapperfile", "logfile")


def sha256_file(path, check=None):
    """Digest of a regular file (never through a link); `check` runs before each 1 MiB block."""
    digest = hashlib.sha256()
    descriptor = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
    with os.fdopen(descriptor, "rb") as stream:
        while True:
            if check is not None:
                check()
            block = stream.read(1 << 20)
            if not block:
                return digest.hexdigest()
            digest.update(block)


def _walk(root):
    """Entries below `root` without following links: (path, lstat)."""
    if not os.path.lexists(root):
        return
    info = os.lstat(root)
    if not stat.S_ISDIR(info.st_mode):
        yield Path(root), info
        return
    for directory, names, files in os.walk(root, followlinks=False):
        for name in sorted(files + [n for n in names if os.path.islink(os.path.join(directory, n))]):
            path = Path(directory, name)
            yield path, os.lstat(path)


def inventory(roots, base, exclude=None, check=None):
    """Relative path -> digest of every entry below the roots (links by target, never followed). `check` is called
    before each entry (the run's deadline)."""
    result = {}
    for root in roots:
        for path, info in _walk(root):
            if exclude is not None and path.is_relative_to(exclude):
                continue
            if check is not None:
                check()
            key = os.path.relpath(path, base)
            if stat.S_ISLNK(info.st_mode):
                result[key] = "link:" + hashlib.sha256(os.fsencode(os.readlink(path))).hexdigest()
            elif stat.S_ISREG(info.st_mode):
                result[key] = sha256_file(path, check)
            else:
                result[key] = f"special:{stat.S_IFMT(info.st_mode)}"
    return result


class Protection:
    """Before/after hash inventories of the protected trees and the existing evidence.

    Protected trees (the baseline installation, user state, configuration and CD image) must not change at all;
    in the evidence trees (the research directory, without this run) no pre-existing file may change or vanish.
    The run keeps the full digest inventories; the snapshot holds every snapshot-root file except the manifest-
    verified originals, whose before state is fixed by the manifest and the CD image."""

    def __init__(self, base, protected, evidence, snapshots, run_dir, check=None):
        def real(path):
            return Path(os.path.realpath(path))

        self.base = real(base)
        self.protected = tuple(map(real, protected))
        self.evidence = tuple(map(real, evidence))
        self.snapshots = tuple(map(real, snapshots))
        self.run_dir = real(run_dir)
        self.check = check
        self.before = None
        self.after = None

    def _inventories(self, check):
        return (inventory(self.protected, self.base, check=check),
                inventory(self.evidence, self.base, exclude=self.run_dir, check=check))

    def record(self, immutable=frozenset()):
        immutable = {Path(os.path.realpath(path)) for path in immutable}
        self.before = self._inventories(self.check)
        snapshot = self.run_dir / "protection" / "before"
        copied = skipped = 0
        for root in self.snapshots:
            for path, info in _walk(root):
                if not stat.S_ISREG(info.st_mode):
                    continue
                if path in immutable:
                    skipped += 1
                    continue
                if self.check is not None:
                    self.check()
                target = snapshot / os.path.relpath(path, self.base)
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(path, target, follow_symlinks=False)
                copied += 1
        return {"protectedFiles": len(self.before[0]), "evidenceFiles": len(self.before[1]), "snapshotFiles": copied,
                "manifestVerifiedNotSnapshotted": skipped}

    def verify(self):
        """The integrity section of the report; `passed` only when nothing protected changed. Never restores."""
        self.after = self._inventories(None)
        protected, evidence = self.after
        old_protected, old_evidence = self.before
        changed = sorted([key for key in old_protected if key in protected and protected[key] != old_protected[key]]
                         + [key for key in old_evidence if key in evidence and evidence[key] != old_evidence[key]])
        removed = sorted([key for key in old_protected if key not in protected]
                         + [key for key in old_evidence if key not in evidence])
        added = sorted(key for key in protected if key not in old_protected)
        passed = not (changed or removed or added)
        result = {"passed": passed, "protectedFiles": len(protected), "evidenceFiles": len(evidence),
                  "changed": changed, "removed": removed, "added": added, "newEvidenceFiles": sum(key not in old_evidence for key in evidence),
                  "restored": False, "inventories": ["protection/before.json", "protection/after.json"]}
        snapshot = self.run_dir / "protection" / "before"
        if passed:
            if snapshot.is_dir() and not snapshot.is_symlink():
                shutil.rmtree(snapshot)
            result["snapshot"] = "removed-after-verified-integrity"
        else:
            current = self.run_dir / "protection" / "current"
            kept = 0
            for key in changed + added:
                path = self.base / key
                if os.path.lexists(path) and stat.S_ISREG(os.lstat(path).st_mode):
                    target = current / key
                    target.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copyfile(path, target, follow_symlinks=False)
                    kept += 1
            result["snapshot"] = "protection/before"
            result["currentCopies"] = kept
        return result

    def inventories(self):
        """The persisted form of both inventories: {"protected": {...}, "evidence": {...}} before and after."""
        def form(pair):
            return None if pair is None else {"protected": pair[0], "evidence": pair[1]}
        return form(self.before), form(self.after)


# -- manifest and source ----------------------------------------------------------------------------------------------
@dataclass(frozen=True)
class Manifest:
    files: dict  # "MAIN/X" -> (size, sha256)
    images: dict  # image file name -> sha256
    version: str
    exe_path: str

    @property
    def exe_sha256(self):
        return self.files[self.exe_path][1]


def parse_manifest(text, exe_path=EXE_PATH):
    """Game-file and image rows of the baseline manifest; the version token is derived from those rows only."""
    files, images = {}, {}
    for line in text.splitlines():
        row = _FILE_ROW.match(line)
        if row:
            files[row[1]] = (int(row[2].replace(",", "")), row[3])
            continue
        row = _IMAGE_ROW.match(line)
        if row:
            images[row[1]] = row[2]
    if exe_path not in files or not images:
        raise BaselineError("source-mismatch", "manifest")
    canonical = json.dumps({"files": files, "images": images}, sort_keys=True, separators=(",", ":"))
    return Manifest(files, images, "manifest-" + hashlib.sha256(canonical.encode("ascii")).hexdigest()[:16],
                    exe_path)


def verify_install(manifest, install, check=None):
    """Every manifest file present in the installation matches; the executable must be present. Returns the
    verified relative paths."""
    checked = []
    for relative, (size, digest) in manifest.files.items():
        path = Path(install, relative)
        if not os.path.lexists(path):
            if relative == manifest.exe_path:
                raise BaselineError("source-mismatch", "exe")
            continue
        info = os.lstat(path)
        if not stat.S_ISREG(info.st_mode) or info.st_size != size or sha256_file(path, check) != digest:
            raise BaselineError("source-mismatch", "install")
        checked.append(relative)
    return checked


def verify_images(manifest, cd_dir, check=None):
    for name, digest in manifest.images.items():
        path = Path(cd_dir, name)
        if not path.is_file() or path.is_symlink() or sha256_file(path, check) != digest:
            raise BaselineError("source-mismatch", "cd")
    return len(manifest.images)


def verify_media(manifest, target, cd_dir):
    """The mounted CD: a descriptor in the CD directory whose every referenced file is a manifest-verified `.img`
    (or that image itself; the subchannel `.sub` is only a verified companion). Returns its identity."""
    if Path(target).is_symlink():
        raise BaselineError("source-mismatch", "media")
    target, cd_dir = Path(os.path.realpath(target)), Path(os.path.realpath(cd_dir))
    if target.parent != cd_dir or not target.is_file():
        raise BaselineError("source-mismatch", "media")
    mountable = {name for name in manifest.images if name.lower().endswith(".img")}
    if target.name in mountable:
        return {"descriptor": target.name, "images": [target.name]}
    with open(target, "rb") as stream:
        data = stream.read(TEXT_LIMIT)
    names = [_unquote(match[1]) for match in re.finditer(r'(?im)^\s*FILE\s+("[^"]+"|\S+)\s', data.decode("latin-1"))]
    if not names or any(name not in mountable for name in names):
        raise BaselineError("source-mismatch", "media")
    return {"descriptor": target.name, "descriptorSha256": hashlib.sha256(data).hexdigest(), "images": names}


def private_copy(install, target, check=None):
    """Copies the installation into the run directory as independent regular files; returns relative -> digest."""
    copied = {}
    sources = list(_walk(install))
    for path, info in sources:
        if not stat.S_ISREG(info.st_mode):
            raise BaselineError("private-copy-invalid", "source")
    target.mkdir(mode=0o700)
    for path, info in sources:
        if check is not None:
            check()
        relative = os.path.relpath(path, install)
        destination = target / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(path, destination, follow_symlinks=False)
        copied_info = os.lstat(destination)
        if (not stat.S_ISREG(copied_info.st_mode) or copied_info.st_nlink != 1
                or (copied_info.st_dev, copied_info.st_ino) == (info.st_dev, info.st_ino)):
            raise BaselineError("private-copy-invalid", "copy")
        digest = sha256_file(destination, check)
        if digest != sha256_file(path, check):
            raise BaselineError("private-copy-invalid", "copy")
        copied[relative] = digest
    return copied


def copy_writes(before, target):
    """Files the run changed or added in its private copy (relative paths only)."""
    after = {os.path.relpath(path, target): sha256_file(path) for path, info in _walk(target)
             if stat.S_ISREG(info.st_mode)}
    return {"changed": sorted(key for key in before if after.get(key) != before[key]),
            "added": sorted(key for key in after if key not in before)}


def game_config(path, relative=GAME_CONFIG):
    """The game's own settings file in the private copy: its digest and KEY=VALUE settings."""
    if not os.path.lexists(path):
        return {"file": relative, "present": False}
    descriptor = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
    with os.fdopen(descriptor, "rb") as stream:
        data = stream.read(TEXT_LIMIT + 1)
    return _config_record(data, relative)


def _config_record(data, relative):
    settings = {}
    for line in data[:TEXT_LIMIT].decode("latin-1").splitlines():
        key, sep, value = line.strip().partition("=")
        if sep and re.fullmatch(r"[A-Z0-9_]{1,32}", key):
            settings[key] = value.strip()[:128]
    return {"file": relative, "present": True, "sha256": hashlib.sha256(data).hexdigest(), "settings": settings}


def override_settings(data, settings):
    """Settings-file bytes with each recipe game setting (key -> typed value) written as the value text of its own
    line; every other byte, the line order and each line ending are kept. A key on no line, on several lines or in
    another letter case (which the recorded settings would not show), or a file beyond the text limit, is refused."""
    if len(data) > TEXT_LIMIT:
        raise BaselineError("game-config-invalid", "size")
    lines = data.splitlines(keepends=True)
    found = {key: [] for key in settings}
    for index, line in enumerate(lines):
        match = _GAME_SETTING.fullmatch(line.rstrip(b"\r\n"))
        if match:
            found.get(match[1].decode("ascii").upper(), []).append((index, match))
    for key, hits in found.items():
        if len(hits) != 1:
            raise BaselineError("game-config-invalid", key)
        index, match = hits[0]
        if match[1] != key.encode("ascii"):
            raise BaselineError("game-config-invalid", key)
        text = GAME_SETTING_TEXT[key](settings[key]).encode("ascii")
        lines[index] = lines[index][:match.start(2)] + text + lines[index][match.end(2):]
    return b"".join(lines)


def _open_below(root, relative, flags):
    """`relative` below the directory `root`, opened one component at a time without following any link."""
    nofollow = getattr(os, "O_NOFOLLOW", 0)
    directory_flags = os.O_RDONLY | getattr(os, "O_DIRECTORY", 0) | nofollow
    *parents, leaf = Path(relative).parts
    directory = os.open(root, directory_flags)
    try:
        for part in parents:
            child = os.open(part, directory_flags, dir_fd=directory)
            os.close(directory)
            directory = child
        return os.open(leaf, flags | nofollow, dir_fd=directory)
    finally:
        os.close(directory)


def override_game_config(install, settings, relative=GAME_CONFIG):
    """Applies a recipe's game settings in place to the settings file of the private installation `install`. The
    file is reached without following any link and only a singly linked regular file is written, so the write
    cannot reach a baseline file. Returns the gameConfig record of the rewritten file with the requested settings
    and the file's prior digest and settings."""
    try:
        descriptor = _open_below(install, relative, os.O_RDWR)
    except OSError:
        raise BaselineError("game-config-invalid", "file") from None
    with os.fdopen(descriptor, "r+b") as stream:
        info = os.fstat(stream.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1:
            raise BaselineError("game-config-invalid", "file")
        data = stream.read(TEXT_LIMIT + 1)
        updated = override_settings(data, settings)
        stream.seek(0)
        stream.write(updated)
        stream.truncate()
        stream.flush()
        os.fsync(stream.fileno())
    before = _config_record(data, relative)
    record = _config_record(updated, relative)
    record["overrides"] = {"requested": dict(settings),
                           "before": {"sha256": before["sha256"], "settings": before["settings"]}}
    return record


# -- private emulator configuration ---------------------------------------------------------------------------------
def _quote(path):
    text = os.fspath(path)
    if '"' in text or "\n" in text:
        raise BaselineError("private-copy-invalid", "config")
    return f'"{text}"' if " " in text else text


def _unquote(text):
    return text[1:-1] if len(text) >= 2 and text[0] == text[-1] == '"' else text


def private_config(text, install, private_install, captures, cd_dir, emulator):
    """The private configuration text and its record. Exactly one captures line and one C: mount of the baseline
    installation are redirected; exactly one read-only CD-ROM mount from the CD directory is kept (its media is
    bound to the manifest by verify_media); `emulator` settings (only cycles) replace their single baseline line.
    Any other mount or output-path setting is refused."""
    lines = text.splitlines()
    section = None
    changes = {"captures": 0, "mount-c": 0, "cycles": 0}
    media = []
    real_install = os.path.realpath(install)
    real_cd = Path(os.path.realpath(cd_dir))
    output = []
    for line in lines:
        header = _SECTION.match(line)
        if header:
            section = header[1].lower()
            output.append(line)
            continue
        setting = _SETTING.match(line) if section != "autoexec" else None
        if setting and not line.lstrip().startswith("#"):
            indent, key, separator, value = setting.groups()
            key_lower = key.lower()
            if key_lower in FORBIDDEN_KEYS and value:
                raise BaselineError("private-copy-invalid", "config")
            if section == "dosbox" and key_lower == "captures":
                changes["captures"] += 1
                line = f"{indent}{key}{separator}{captures}"
            elif section == "cpu" and key_lower == "cycles" and "cycles" in emulator:
                changes["cycles"] += 1
                line = f"{indent}{key}{separator}fixed {emulator['cycles']}"
        elif section == "autoexec":
            mount = _MOUNT.match(line)
            if mount:
                kind, drive, path, rest = mount[1].lower(), mount[2].lower(), _unquote(mount[3]), mount[4]
                if kind == "mount" and drive == "c" and os.path.realpath(path) == real_install:
                    changes["mount-c"] += 1
                    line = f"mount c {_quote(private_install)}{rest}"
                elif kind == "imgmount" and rest.split() in (["-t", "cdrom"], ["-t", "iso"]):
                    media.append(Path(os.path.realpath(path)))  # read-only CD-ROM; bound to the manifest later
                else:
                    raise BaselineError("private-copy-invalid", "config")
        output.append(line)
    if changes["captures"] != 1 or changes["mount-c"] != 1 or len(media) != 1 or media[0].parent != real_cd:
        raise BaselineError("private-copy-invalid", "config")
    if "cycles" in emulator and changes["cycles"] != 1:
        raise BaselineError("private-copy-invalid", "config")
    result = "\n".join(output) + "\n"
    return result, {"changedLines": sum(changes.values()), "changes": {k: v for k, v in changes.items() if v},
                    "settings": emulator_settings(result), "media": media[0]}


def emulator_settings(text):
    """The emulator settings a recipe identity may name, as written in a configuration (later lines win)."""
    found = {}
    section = None
    for line in text.splitlines():
        header = _SECTION.match(line)
        if header:
            section = header[1].lower()
            continue
        setting = _SETTING.match(line)
        if not setting or line.lstrip().startswith("#"):
            continue
        key = setting[2].lower()
        if EMULATOR_KEYS.get(key) == section:
            found[key] = setting[4]
    result = {}
    for key, value in found.items():
        fixed = re.fullmatch(r"fixed\s+([0-9]{1,9})", value)
        if key == "cycles" and fixed:
            result[key] = int(fixed[1])
        elif key == "memsize" and value.isdigit():
            result[key] = int(value)
        elif re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._/:+-]{0,63}", value):
            result[key] = value
    return result
