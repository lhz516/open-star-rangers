"""A temporary baseline environment for the session tests: synthetic installation, CD image, manifest, emulator
configuration and research directory, with the fake debugger as the emulator (test support; never original data).

File names deliberately differ from the original game's, so the access guard would reject any test that reached for
an original file.
"""
import json
import os
from pathlib import Path

from fake_debugger import FakeClock, FakeDebugger, FakeTransport
from protect import inventory, parse_manifest, sha256_file
from recipe import exe_fingerprint
from session import Environment, Options, execute
from synthetic import noise, scenario_image, scenario_recipe

EXE = "MAIN/GAME.EXE"
SETTINGS = "MAIN/GAME.CFG"


def manifest_text(rows, images):
    lines = ["# Synthetic manifest", "", "| Path | Size | SHA-256 |", "|---|---:|---|"]
    lines += [f"| `{path}` | {size:,} | `{digest}` |" for path, (size, digest) in rows.items()]
    lines += ["", "| Image | SHA-256 |", "|---|---|"]
    lines += [f"| `{name}`（synthetic） | `{digest}` |" for name, digest in images.items()]
    return "\n".join(lines) + "\n"


class Sandbox:
    def __init__(self, root, scenario=None, reclaim_passes=True, recipe=None, smoke_identity=False):
        self.root = Path(root)
        repo = self.root / "repo"
        self.local = repo / "localroot"  # not "local": the access guard reads relative names against the cwd
        self.starrang = self.local / "StarRang"
        self.install = self.starrang / "GAME"
        self.cd = self.starrang / "cd"
        self.research = self.local / "research"
        self.out = self.research / "p3-01" / "tool-smoke"
        for path in (self.install / "MAIN", self.install / "DRIVERS", self.cd, self.out, repo / "docs"):
            path.mkdir(parents=True, exist_ok=True)
        self.exe = scenario_image()
        files = {EXE: self.exe, SETTINGS: b"SOUND_LEVEL=100\r\nDETAIL=TRUE\r\n", "MAIN/DATA.BIN": noise(9, 3000),
                 "DRIVERS/SOUND.DRV": noise(10, 200)}
        for relative, data in files.items():
            (self.install / relative).write_bytes(data)
        (self.cd / "DISC.img").write_bytes(noise(11, 5000))
        (self.cd / "DISC.cue").write_text('FILE "DISC.img" BINARY\n')
        rows = {relative: (len(data), exe_fingerprint(data)) for relative, data in files.items()
                if relative != SETTINGS and not relative.startswith("DRIVERS")}
        rows["MAIN/ONDISC.BIN"] = (5, exe_fingerprint(b"other"))
        self.manifest = repo / "docs" / "manifest.md"
        self.manifest.write_text(manifest_text(rows, {"DISC.img": sha256_file(self.cd / "DISC.img")}))
        self.version = parse_manifest(self.manifest.read_text(), EXE).version
        self.config = self.starrang / "baseline.conf"
        self.config.write_text("\n".join([
            "[sdl]", "autolock        = true", "", "[dosbox]", "machine         = svga_s3", "memsize         = 16",
            f"captures        = {self.starrang / 'captures'}", "", "[cpu]", "core            = normal",
            "cputype         = pentium", "cycles          = fixed 40000", "", "[autoexec]",
            f"mount c {self.install}", f"imgmount d {self.cd / 'DISC.cue'} -t cdrom", "c:", "game", ""]))
        (self.starrang / "captures").mkdir()
        (self.starrang / "baseline").mkdir()
        (self.starrang / "baseline" / "GAME.CFG").write_bytes(files[SETTINGS])
        self.previous_run = self.out / "earlier"
        self.previous_run.mkdir()
        (self.previous_run / "report.json").write_text('{"status": "failed"}\n')

        self.document = recipe or scenario_recipe(exe_fingerprint(self.exe),
                                                  source={"baselineVersion": self.version,
                                                          "exeSha256": exe_fingerprint(self.exe)})
        if recipe is None:
            self.document["limits"].update(runSeconds=3600, waitSeconds=60, maxReadBytes=1 << 20,
                                           maxLogBytes=64 << 20)
        if smoke_identity:
            self.document["identity"] = {"mission": {"context": "startup"}, "config": {"cycles": 40000}}
        self.recipe_path = self.out / "recipe.json"
        self.write_recipe(self.document)

        self.clock = FakeClock()
        self.debugger = FakeDebugger(scenario)
        self.transport = FakeTransport(self.debugger, self.clock, reclaim_passes=reclaim_passes)
        self.lines = []
        self.launches = []
        self.statuses = []
        self.running = []  # emulator processes the process table shows
        self.answers = None  # per pause ID: list of operator answers; default confirms the recipe identity
        self.env = Environment(
            research_root=self.research, local_root=self.local, install=self.install, cd_dir=self.cd,
            baseline_config=self.config, manifest=self.manifest, protected=(self.starrang,),
            snapshots=(self.install, self.starrang / "baseline", self.config), emulator=("fake-dosbox-x",),
            launch=self.launch, processes=lambda: list(self.running), clock=self.clock, sleep=self.clock.sleep,
            output=self.lines.append, on_status=self.on_status, reclaim_grace=0.1, exe_path=EXE,
            game_config_path=SETTINGS)
        self.before = None

    def write_recipe(self, document):
        self.recipe_path.write_text(json.dumps(document) if not isinstance(document, str) else document)

    def launch(self, argv, cwd):
        self.launches.append((list(argv), cwd))
        return self.transport

    def on_status(self, run_dir, status):
        self.statuses.append(status)
        if status["phase"] != "awaiting-confirmation":
            return
        pause = status["pause"]
        identity = self.document["identity"]
        default = {"action": "confirm", "mission": identity["mission"], "config": identity["config"]}
        queue = (self.answers or {}).get(pause)
        answer = queue.pop(0) if queue else default
        if answer is None:
            return
        name = Path(status["signal"]).name
        payload = answer if isinstance(answer, (bytes, str)) else json.dumps(answer)
        target = Path(run_dir) / "operator" / name
        target.write_bytes(payload if isinstance(payload, bytes) else payload.encode())

    def snapshot(self):
        return inventory([self.local], self.local)

    def run(self, run_id="run-01", smoke=False, out=None, evidence=None):
        self.before = self.snapshot()
        self.run_id = run_id
        return execute(Options(str(self.recipe_path), str(out or self.out), run_id, smoke,
                               None if evidence is None else str(evidence)), self.env)

    @property
    def run_dir(self):
        return Path(os.path.realpath(self.out)) / self.run_id

    def report(self):
        return json.loads((self.run_dir / "report.json").read_text())

    def unchanged_outside_run(self):
        """Whether every file that existed before the run, outside the new run directory, is unchanged."""
        after = self.snapshot()
        prefix = os.path.relpath(self.run_dir, os.path.realpath(self.local)) + os.sep
        return all(after.get(key) == value for key, value in self.before.items() if not key.startswith(prefix))
