"""One bounded measurement run (P3-01 subtask 02): preflight, private run, debugger session, readings and report.

Preflight parses the recipe, validates the output location, refuses to run beside an existing DOSBox-X and verifies
the baseline source against the manifest and the recipe, all before any side effect. The run then records the
original-file hashes, makes the private copy and configuration, launches the owned emulator in its debugger,
establishes the CODE/DATA object correlation at a startup pause and takes the recipe's pauses in order. At each
pause the correlation is re-verified, the fields are read and judged, and proof files are written beside the
report. Whatever happens (completion, failure, timeout, cancellation), the owned process is reclaimed, the original
files are re-hashed and the final report is written; only a run whose every check passed is `complete`.

The tool never sends game input. Between pauses the operator (an agent using Computer Use on the game window) plays
to the requested state; the tool asks for each confirmation through `status.json` and reads the operator's answer
from a signal file in the run directory. A smoke run (`smoke=True`) takes its pauses at startup without an operator
and is never measurement evidence.
"""
import functools
import hashlib
import json
import os
import platform
import signal
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from debugger import Debugger, DebuggerPort
from le_image import LeImage
from locate import AddressSpace, WindowRead, check_recipe_image, correlate_code, data_address, prove_mapping
from processes import TERM_GRACE, PtyTransport, emulators, process_names
from protect import (EMULATOR_KEYS, EXE_PATH, GAME_CONFIG, Protection, copy_writes, game_config, parse_manifest,
                     private_config, private_copy, verify_images, verify_install, verify_media)
from qualify import PauseEvidence, ReadBudget, Sample, StopProof, collect_pause, judge_pause
from reasons import BaselineError, ordered
from recipe import MAX_RECIPE_BYTES, Window, exe_fingerprint, parse_recipe, verify_source
from report import build_report, serialize, summary
from runfiles import (Log, ReportWriter, SessionLock, create_run_dir, read_signal, replace_file, resolve_output,
                      write_json, write_new)
from screen import Screen

TOOL_VERSION = "1"
HERE = Path(__file__).resolve().parent
REPOSITORY = HERE.parents[1]
MAPPING_STOPS = 512
POLL_SECONDS = 0.25
LAUNCH_OPTIONS = ("-defaultmapper", "-break-start", "-fastlaunch", "-nogui", "-nomenu")
EXIT_COMPLETE, EXIT_FAILED, EXIT_REJECTED, EXIT_CANCELLED = 0, 1, 2, 3
# Rejections of one mapping attempt that a later startup pause may not have.
MAPPING_RETRY = frozenset({"window-weak", "code-unmatched", "code-ambiguous", "object-unmapped", "read-fault",
                           "read-short", "data-mismatch", "mapping-contradiction", "base-invalid"})
# Rejections that end the run; any other rejection at a pause leaves that pause's samples unqualified.
FATAL = frozenset({"run-timeout", "wait-timeout", "child-exited", "debugger-unparsed", "log-budget-exceeded",
                   "budget-exceeded", "report-write-failed", "operator-invalid", "breakpoint-unconfirmed",
                   "breakpoint-wrong-hit", "tool-error"})
TEST_SUPPORT = frozenset({"access_guard.py", "fake_debugger.py", "sandbox.py", "synthetic.py"})
UNVERIFIED_SOURCE = {"baselineVersion": "unverified", "exeSha256": "unverified"}
SMOKE_MISSION = {"context": "startup"}


class Cancelled(Exception):
    """The operator or a signal cancelled the run."""


@dataclass
class Environment:
    """Host paths and services; tests replace them with temporary directories and fakes."""
    research_root: Path
    local_root: Path
    install: Path
    cd_dir: Path
    baseline_config: Path
    manifest: Path
    protected: tuple
    snapshots: tuple
    emulator: tuple
    emulator_name: str = "dosbox-x"
    launch_options: tuple = LAUNCH_OPTIONS
    launch: object = PtyTransport
    processes: object = process_names
    clock: object = time.monotonic
    sleep: object = time.sleep
    output: object = print
    on_status: object = None  # test hook: called with (run directory, status) after each status write
    reclaim_grace: float = TERM_GRACE
    handle_signals: bool = False
    exe_path: str = EXE_PATH
    game_config_path: str = GAME_CONFIG
    mapping_stops: int = MAPPING_STOPS

    @classmethod
    def default(cls):
        local = REPOSITORY / "local"
        starrang = local / "StarRang"
        return cls(research_root=local / "research", local_root=local,
                   install=starrang / "SRANGERS", cd_dir=starrang / "cd",
                   baseline_config=starrang / "star-rangers-dosbox-x-mac.conf",
                   manifest=REPOSITORY / "docs/original/manifest.md", protected=(starrang,),
                   snapshots=(starrang / "SRANGERS", starrang / "baseline", starrang / "star-rangers-dosbox-x-mac.conf"),
                   emulator=(str(Path.home() / "Tools/bin/dosbox-x"),), handle_signals=True)


@dataclass(frozen=True)
class Options:
    recipe: str
    out: str
    run_id: str
    smoke: bool = False


@dataclass
class Plan:
    recipe: object
    paths: object
    manifest: object
    image: object
    exe_sha256: str


@dataclass
class Context:
    """Qualified protected-mode context at a pause."""
    cpu: object
    cs: object
    ds: object

    @property
    def space(self):
        return AddressSpace(self.ds.base, self.ds.limit)

    def to_json(self):
        return {"cpu": self.cpu.to_json(), "cs": self.cs.to_json(), "ds": self.ds.to_json()}


@dataclass
class Startup:
    context: object
    selector: int
    match: object
    mapping: object


def _read_bounded(path, limit, code):
    try:
        descriptor = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
        with os.fdopen(descriptor, "rb") as stream:
            data = stream.read(limit + 1)
    except OSError:
        raise BaselineError(code, "file") from None
    return data


def preflight(options, env):
    """All checks that need no side effect: recipe, output location, no running emulator, source identity."""
    recipe = parse_recipe(_read_bounded(options.recipe, MAX_RECIPE_BYTES, "recipe-json-invalid"))
    paths = resolve_output(options.out, options.run_id, env.research_root)
    if emulators(env.processes(), env.emulator_name):
        raise BaselineError("emulator-already-running", "preflight")
    manifest = parse_manifest(_read_bounded(env.manifest, 1 << 20, "source-mismatch").decode("utf-8", "replace"),
                              env.exe_path)
    exe = _read_bounded(Path(env.install, env.exe_path), 64 << 20, "source-mismatch")
    exe_sha256 = exe_fingerprint(exe)
    if exe_sha256 != manifest.exe_sha256:
        raise BaselineError("source-mismatch", "exe")
    verify_source(recipe, manifest.version, exe_sha256)
    image = LeImage(exe)
    check_recipe_image(recipe, image)
    return Plan(recipe, paths, manifest, image, exe_sha256)


@functools.lru_cache(maxsize=1)
def tool_identity():
    """Version and source digest of the tool's production modules (tests and test support excluded)."""
    digest = hashlib.sha256()
    for path in sorted(HERE.glob("*.py")):
        if not path.name.startswith("test_") and path.name not in TEST_SUPPORT:
            digest.update(path.name.encode() + b"\0" + path.read_bytes() + b"\0")
    return {"version": TOOL_VERSION, "source": "sha256:" + digest.hexdigest()}


def _utc():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def execute(options, env):
    """Runs the tool; returns the exit code. The terminal gets only reason codes, counts and relative paths."""
    try:
        plan = preflight(options, env)
    except BaselineError as error:
        env.output(f"status=rejected reasons={error.code}")
        return EXIT_REJECTED
    except KeyboardInterrupt:
        env.output("status=rejected reasons=run-cancelled")
        return EXIT_CANCELLED
    except Exception:  # noqa: BLE001 - never a traceback with private paths on the terminal
        env.output("status=rejected reasons=tool-error")
        return EXIT_REJECTED
    return Run(plan, options, env).run()


class Run:
    def __init__(self, plan, options, env):
        self.plan = plan
        self.recipe = plan.recipe
        self.paths = plan.paths
        self.options = options
        self.env = env
        self.writer = ReportWriter(self.paths)
        self.failures = set()
        self.cancelled = False
        self.samples = []
        self.source = dict(UNVERIFIED_SOURCE)
        self.environment = {"mode": "smoke" if options.smoke else "measure",
                            "measurementEvidence": not options.smoke}
        self.game_config = {"file": env.game_config_path, "present": False}
        self.transport = None
        self.log = None
        self.protection = None
        self.copied = None
        self.settings = {}
        self.ended_by = None
        self.started = None
        self.deadline = None
        self.run_start = None

    # -- report ------------------------------------------------------------------------------------------------------
    def report(self, integrity, cleanup, finished):
        run_end = None
        if finished:
            run_end = {"utc": _utc(), "elapsedSeconds": round(self.env.clock() - self.started, 3),
                       "endedBy": self.ended_by or "completed"}
        return build_report(recipe=self.recipe, run_id=self.options.run_id, tool=tool_identity(), source=self.source,
                            environment=self.environment, game_config=self.game_config, run_start=self.run_start,
                            run_end=run_end, samples=self.samples, integrity=integrity, cleanup=cleanup,
                            cancelled=self.cancelled, failures=ordered(self.failures))

    def write_report(self, integrity, cleanup, finished):
        report = self.report(integrity, cleanup, finished)
        self.writer.write(serialize(report))
        return report

    def status(self, phase, **details):
        status = {"phase": phase, "utc": _utc(), **details}
        replace_file(self.paths, "status.json", (json.dumps(status, indent=2, sort_keys=True) + "\n").encode())
        line = " ".join(f"{key}={value}" for key, value in [("phase", phase), *sorted(details.items())]
                        if key in ("phase", "pause", "signal"))
        self.env.output(line)
        if self.env.on_status is not None:
            self.env.on_status(self.paths.run_dir, status)

    # -- run ---------------------------------------------------------------------------------------------------------
    def run(self):
        try:
            lock = SessionLock(self.env.research_root)
        except BaselineError as error:
            self.env.output(f"status=rejected reasons={error.code}")
            return EXIT_REJECTED
        try:
            return self._locked()
        finally:
            lock.release()

    def _locked(self):
        try:
            create_run_dir(self.paths, self.env.research_root)
        except BaselineError as error:
            self.env.output(f"status=rejected reasons={error.code}")
            return EXIT_REJECTED
        self.started = self.env.clock()
        self.deadline = self.started + self.recipe.limits.run_seconds
        self.run_start = {"utc": _utc(), "runId": self.options.run_id, "mode": self.environment["mode"]}
        previous = self._install_signals()
        try:
            self._body()
            self._ignore_signals()
            report = self._finish()
        finally:
            self._restore_signals(previous)
        if report is None:
            codes = ",".join(ordered(self.failures | {"run-unfinished"}))
            self.env.output(f"status=failed reasons={codes} report={self.paths.show('report.json')}")
            return EXIT_FAILED
        self.env.output(f"{summary(report)} report={self.paths.show('report.json')}")
        if report["status"] == "complete":
            return EXIT_COMPLETE
        return EXIT_CANCELLED if report["status"] == "cancelled" else EXIT_FAILED

    def _body(self):
        """The unfinished report, preparation and the emulator session; every outcome is recorded, none raised."""
        try:
            pending = {"passed": False, "state": "pending"}
            self.write_report(pending, pending, False)
            self.prepare()
            self.session()
        except (Cancelled, KeyboardInterrupt):
            self.cancelled = True
            self.ended_by = "cancelled"
        except BaselineError as error:
            self.failures.add(error.code)
            self.ended_by = error.code
        except Exception:  # noqa: BLE001 - any defect still reclaims, verifies and reports
            self.failures.add("tool-error")
            self.ended_by = "tool-error"

    def _finish(self):
        """Reclaim, integrity check and the final report (None when it could not be written)."""
        cleanup = self._guarded(self.reclaim, {"passed": False, "state": "reclaim-raised"})
        integrity = self._guarded(self.verify_integrity, {"passed": False, "state": "verify-raised"})
        if self.log is not None:
            self.log.close()
        try:
            return self.write_report(integrity, cleanup, True)
        except BaselineError as error:
            self.failures.add(error.code)
            return None

    def _guarded(self, step, fallback):
        try:
            return step()
        except Exception:  # noqa: BLE001 - reported as a failed check, never hidden
            self.failures.add("tool-error")
            return fallback

    def _install_signals(self):
        if not self.env.handle_signals:
            return None

        def cancel(number, frame):
            raise Cancelled()

        return {number: signal.signal(number, cancel) for number in (signal.SIGINT, signal.SIGTERM)}

    def _ignore_signals(self):
        if self.env.handle_signals:
            for number in (signal.SIGINT, signal.SIGTERM):
                signal.signal(number, signal.SIG_IGN)

    def _restore_signals(self, previous):
        if previous:
            for number, handler in previous.items():
                signal.signal(number, handler)

    def check_deadline(self):
        if self.env.clock() >= self.deadline:
            raise BaselineError("run-timeout", "run")

    def prepare(self):
        env, run_dir, manifest = self.env, self.paths.run_dir, self.plan.manifest
        for name in ("operator", "pauses", "captures", "protection"):
            (run_dir / name).mkdir(mode=0o700)
        self.environment["host"] = {"platform": sys.platform, "machine": platform.machine(),
                                    "python": platform.python_version()}
        verified = verify_install(manifest, env.install, self.check_deadline)
        self.environment["manifest"] = {"version": manifest.version, "baselineFilesChecked": len(verified),
                                        "imagesChecked": verify_images(manifest, env.cd_dir, self.check_deadline)}
        self.protection = Protection(env.local_root, env.protected, [env.research_root], env.snapshots, run_dir,
                                     self.check_deadline)
        protection = self.protection.record({Path(env.install, relative) for relative in verified})
        write_json(self.paths, "protection/before.json", self.protection.inventories()[0])
        self.copied = private_copy(env.install, run_dir / "install", self.check_deadline)
        self.environment["manifest"]["installFilesChecked"] = len(
            verify_install(manifest, run_dir / "install", self.check_deadline))
        if self.copied.get(env.exe_path) != self.plan.exe_sha256:
            raise BaselineError("source-mismatch", "exe")
        verify_source(self.recipe, manifest.version, self.plan.exe_sha256)
        self.source = {"baselineVersion": manifest.version, "exeSha256": self.plan.exe_sha256}
        baseline = _read_bounded(env.baseline_config, 1 << 20, "private-copy-invalid")
        text, record = private_config(baseline.decode("utf-8", "replace"), env.install, run_dir / "install",
                                      run_dir / "captures", env.cd_dir, self.recipe.emulator)
        media = verify_media(manifest, record["media"], env.cd_dir)
        write_new(self.paths, "dosbox-x.conf", text.encode("utf-8"))
        self.settings = record["settings"]
        self.environment["emulator"] = {
            "name": env.emulator_name, "launchOptions": list(env.launch_options), "config": "dosbox-x.conf",
            "configSha256": hashlib.sha256(text.encode("utf-8")).hexdigest(),
            "baselineConfigSha256": hashlib.sha256(baseline).hexdigest(), "changedLines": record["changedLines"],
            "changes": record["changes"], "settings": record["settings"], "recipeSettings": dict(self.recipe.emulator),
            "media": media,
        }
        self.environment["privateCopy"] = {"directory": "install", "files": len(self.copied), "links": 0}
        self.environment["protection"] = protection
        self.game_config = game_config(run_dir / "install" / env.game_config_path, env.game_config_path)
        self.check_deadline()

    # -- emulator session --------------------------------------------------------------------------------------------
    def session(self):
        env, limits = self.env, self.recipe.limits
        if emulators(env.processes(), env.emulator_name):
            raise BaselineError("emulator-already-running", "launch")
        argv = [*env.emulator, "-conf", str(self.paths.file("dosbox-x.conf")), *env.launch_options]
        self.log = Log(self.paths, limits.max_log_bytes)
        self.status("launching")
        self.transport = env.launch(argv, str(self.paths.run_dir))
        self.environment["process"] = self.transport.verify_owner(env.emulator_name, env.clock, env.sleep)
        if emulators(env.processes(), env.emulator_name, exclude={self.transport.pid}):
            raise BaselineError("emulator-already-running", "launched")
        debugger = Debugger(self.transport, Screen(), env.clock, limits.wait_seconds, self.deadline, self.log)
        debugger.wait_registers()
        debugger.clear_breakpoints()
        budget = ReadBudget(limits.max_read_bytes)
        startup = self.establish(debugger, budget)
        for pause in self.recipe.pauses:
            self.take_pause(debugger, startup, pause, budget)
        self.ended_by = "completed"
        self.status("finished")

    def context(self, debugger):
        cpu = debugger.cpu()
        if not cpu.protected_paged:
            return None
        cs, ds = debugger.selector("CS"), debugger.selector("DS")
        if not cs.flat32_code or not ds.flat32_data:
            return None
        return Context(cpu, cs, ds)

    def owner(self, context):
        return f"pid:{self.transport.pid}/cr3:{context.cpu.cr3:08x}"

    def correlate(self, port, context, window, linear, budget):
        """CODE window at `linear` and the DATA window it locates; both reads count against the run's budget."""
        image, data_window = self.plan.image, self.recipe.data_window
        budget.consume(window.size)
        code = port.read(linear, window.size)
        match = correlate_code(image, window, WindowRead(linear, code.data), context.space)
        at = data_address(match, data_window)
        budget.consume(data_window.size)
        data = port.read(at, data_window.size)
        mapping = prove_mapping(image, data_window, match, WindowRead(at, data.data), context.space,
                                self.owner(context))
        return match, mapping

    def establish(self, debugger, budget):
        """CODE/DATA correlation at a startup VRT pause; other pauses are tried while a retryable rejection holds."""
        self.status("mapping")
        port = DebuggerPort(debugger, self.transport.pid, budget)
        attempts = {}
        for stop in range(1, self.env.mapping_stops + 1):
            debugger.run_until_stop("VRT", self.recipe.limits.wait_seconds)
            try:
                registers = debugger.fresh_registers()
            except BaselineError as error:
                if error.code != "debugger-unparsed":
                    raise
                attempts["registers-unverified"] = attempts.get("registers-unverified", 0) + 1
                continue
            if registers.mode != "Pr32":
                attempts["not-protected-32"] = attempts.get("not-protected-32", 0) + 1
                continue
            context = self.context(debugger)
            if context is None:
                attempts["context-unqualified"] = attempts.get("context-unqualified", 0) + 1
                continue
            try:
                match, mapping = self.correlate(port, context, self.recipe.code_window,
                                                context.cs.base + registers.eip, budget)
            except BaselineError as error:
                if error.code not in MAPPING_RETRY:
                    raise
                attempts[error.code] = attempts.get(error.code, 0) + 1
                continue
            write_json(self.paths, "mapping-startup.json", {
                "vrtStops": stop, "rejectedStops": attempts, "registers": registers.to_json(),
                "context": context.to_json(), "owner": mapping.owner, "proof": mapping.proof,
            })
            self.environment["startupMapping"] = {"file": "mapping-startup.json", "vrtStops": stop,
                                                  "rejectedStops": dict(attempts)}
            return Startup(context, registers.cs, match, mapping)
        retry = [code for code in attempts if code in MAPPING_RETRY]
        raise BaselineError(retry[-1] if retry else "code-unmatched", "mapping")

    def reverify(self, port, context, startup, budget):
        """Re-reads the startup CODE window location and the DATA window in the current pause."""
        window = Window(startup.match.object, startup.match.offset, self.recipe.code_window.size)
        linear = startup.mapping.bases[startup.match.object] + startup.match.offset
        _, mapping = self.correlate(port, context, window, linear, budget)
        if mapping.bases != startup.mapping.bases:
            raise BaselineError("mapping-changed", "mapping")
        return mapping

    # -- pauses ------------------------------------------------------------------------------------------------------
    def poll_abort(self):
        if os.path.lexists(self.paths.file("operator/abort.json")):
            raise Cancelled()

    def confirm(self, pause, attempt):
        """The operator's answer at a pause: ("confirm", mission, config) or ("skip",)."""
        if self.options.smoke:
            return "confirm", dict(SMOKE_MISSION), {}
        name = f"operator/{pause.id}-{attempt}.json"
        self.status("awaiting-confirmation", pause=pause.id, signal=self.paths.show(name),
                    expects={"action": ["confirm", "skip", "abort"], "mission": self.recipe.identity.mission,
                             "config": self.recipe.identity.config})
        end = self.env.clock() + self.recipe.limits.wait_seconds
        while True:
            answer = read_signal(self.paths.file(name))
            if answer is not None:
                break
            self.poll_abort()
            if self.transport.poll() is not None:
                raise BaselineError("child-exited", "emulator")
            now = self.env.clock()
            if now >= self.deadline:
                raise BaselineError("run-timeout", "run")
            if now >= end:
                raise BaselineError("wait-timeout", "operator")
            self.env.sleep(min(POLL_SECONDS, end - now, self.deadline - now))
        action = answer.get("action")
        if action == "abort" and set(answer) == {"action"}:
            raise Cancelled()
        if action == "skip" and set(answer) == {"action"}:
            return ("skip",)
        if action == "confirm" and set(answer) == {"action", "mission", "config"} and all(
                type(answer[key]) is dict for key in ("mission", "config")):
            return "confirm", answer["mission"], answer["config"]
        raise BaselineError("operator-invalid", pause.id)

    def stop_at(self, debugger, startup, pause):
        """Brings the emulator to the pause's stop; returns (registers, stop proof)."""
        limit = self.recipe.limits.wait_seconds
        if pause.stop.kind == "vrt":
            waited = debugger.run_until_stop("VRT", limit, poll=self.poll_abort)
            registers = debugger.fresh_registers()
            return registers, {"kind": "vrt", "credential": "vrt-command-running-to-prompt",
                               "waitedSeconds": round(waited, 3), "registers": registers.to_json()}
        site = pause.stop.site
        linear = startup.mapping.linear(site.object, site.offset, 1)
        cs = startup.context.cs
        offset = linear - cs.base
        if not 0 <= offset <= cs.limit:
            raise BaselineError("location-outside-object", pause.id)
        announce = None if self.options.smoke else lambda: self.status(
            "running", pause=pause.id, signal=self.paths.show("operator/abort.json"))
        registers, proof = debugger.run_to_breakpoint(startup.selector, offset, limit, self.poll_abort, announce)
        return registers, {"kind": "breakpoint", "credential": "registered-listed-and-hit",
                           "site": {"object": site.object, "offset": f"{site.offset:x}"}, **proof,
                           "registers": registers.to_json()}

    def identity(self, mission, config):
        """Observed identity: the operator's declaration, with emulator settings taken from the private config."""
        config = dict(config)
        for key in self.recipe.identity.config:
            if key in EMULATOR_KEYS:
                config[key] = self.settings.get(key)
        for key in list(config):
            if key in EMULATOR_KEYS and key not in self.recipe.identity.config:
                del config[key]
        return mission, config

    def take_pause(self, debugger, startup, pause, budget):
        attempt = 0
        while True:
            registers, stop = self.stop_at(debugger, startup, pause)
            answer = self.confirm(pause, attempt)
            if answer[0] == "confirm":
                break
            attempt += 1
        self.status("reading", pause=pause.id)
        mission, config = self.identity(answer[1], answer[2])
        base = f"pauses/{pause.id}"
        refs = {"mapping": f"{base}/mapping.json", "identity": f"{base}/identity.json", "reads": f"{base}/reads.json"}
        proof = {"stop": f"{base}/stop.json"}
        (self.paths.run_dir / base).mkdir(mode=0o700)
        write_json(self.paths, refs["identity"], {"mission": mission, "config": config,
                                                  "source": "smoke" if self.options.smoke else "operator",
                                                  "emulatorSettings": self.settings})
        port = DebuggerPort(debugger, self.transport.pid, budget)
        try:
            context = self.context(debugger)
            if context is None:
                raise BaselineError("stop-unverified", pause.id)
            mapping = self.reverify(port, context, startup, budget)
            reads = collect_pause(self.recipe, pause.id, mapping, port, budget)
            after = debugger.fresh_registers()
            stop["registersUnchangedAfterReads"] = after.values == registers.values
            stop["context"] = context.to_json()
            verified = stop["registersUnchangedAfterReads"]
            write_json(self.paths, refs["mapping"], {"owner": mapping.owner, "proof": mapping.proof})
            write_json(self.paths, refs["reads"], _reads_json(reads))
            samples = judge_pause(self.recipe, mapping, PauseEvidence(
                reads, StopProof(verified, proof["stop"]), mission, config, refs))
        except BaselineError as error:
            if error.code in FATAL:
                raise
            stop["rejected"] = error.code
            for key in ("mapping", "reads"):
                if not self.paths.file(refs[key]).exists():
                    write_json(self.paths, refs[key], {"unavailable": error.code})
            samples = self.unqualified(pause, error.code, refs, proof["stop"])
        write_json(self.paths, proof["stop"], stop)
        self.samples.extend(samples)

    def unqualified(self, pause, code, refs, stop_ref):
        proof = {"mapping": refs["mapping"], "stop": stop_ref, "identity": refs["identity"],
                 "readability": refs["reads"], "repeat": refs["reads"]}
        fields = self.recipe.fields
        return [Sample(pause.id, name, fields[name].type, fields[name].unit, fields[name].required, None, (code,),
                       dict(proof)) for name in pause.fields]

    # -- end of run --------------------------------------------------------------------------------------------------
    def reclaim(self):
        if self.transport is None:
            return {"passed": True, "launched": False}
        try:
            result = self.transport.reclaim(self.env.reclaim_grace)
        except Exception:  # noqa: BLE001 - a failed reclaim is reported, never hidden
            result = {"passed": False, "error": "reclaim-raised"}
        result = dict(result)
        result["launched"] = True
        if result.get("passed") is not True:
            result["passed"] = False
            self.failures.add("cleanup-failed")
        return result

    def verify_integrity(self):
        if self.protection is None or self.protection.before is None:
            return {"passed": False, "state": "not-recorded"}
        result = self.protection.verify()
        write_json(self.paths, "protection/after.json", self.protection.inventories()[1])
        if self.copied is not None:
            result["privateCopyWrites"] = copy_writes(self.copied, self.paths.run_dir / "install")
        if not result["passed"]:
            self.failures.add("original-changed")
        return result


def _reads_json(reads):
    def pages(state):
        return {"owner": state.owner, "pages": {f"{page:x}": None if physical is None else f"{physical:x}"
                                                 for page, physical in sorted(state.pages.items())}}

    passes = []
    for collected in reads.passes:
        passes.append({name: {"error": walk.error, "hops": [
            {"linear": f"{hop.linear:08x}", "size": hop.size, "data": list(hop.result.data),
             "pages": {f"{page:x}": None if physical is None else f"{physical:x}"
                       for page, physical in sorted(hop.result.pages.items())}} for hop in walk.hops]}
            for name, walk in collected.items()})
    return {"pause": reads.pause, "before": pages(reads.before), "after": pages(reads.after), "passes": passes}
