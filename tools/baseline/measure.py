#!/usr/bin/env python3
"""Runtime measurement of the original game in a private DOSBox-X debugger run (P3-01).

  python3 tools/baseline/measure.py baseline-version
      Prints the manifest-derived baseline version token and executable fingerprint a recipe's `source` must name.

  python3 tools/baseline/measure.py run --recipe <recipe.json> --out local/research/<task>/<topic> --run-id <id>
                                        [--smoke] [--evidence local/research/<task>/<topic>]
      Runs the recipe in a new private run directory <out>/<id>: verified private copy and configuration, owned
      emulator, CODE/DATA correlation, the recipe's pauses, qualified readings, reclaim and original-file check.
      Between pauses, follow `status.json` in the run directory and answer with the signal file it names:
      {"action": "confirm", "mission": {...}, "config": {...}}, {"action": "skip"} or {"action": "abort"};
      `operator/abort.json` cancels at any time. --smoke takes the pauses at startup without an operator; a smoke
      report is never measurement evidence.
      A recipe may preset the game's own settings in the private copy's settings file, e.g.
      "gameSettings": {"STARTUP_PRACTICE": false, "CURR_LEVEL": [100, 19]} (CURR_LEVEL: practice and campaign raw
      difficulty, 0-100); only these keys are accepted, and the report's `gameConfig` records the requested settings
      and the file before and after the rewrite.
      A recipe may also declare stimuli, the game input written inside the emulator at its pauses (never host input):
      "stimuli": [{"id": "enter", "pause": "<pause>", "kind": "key", "ascii": 13, "scan": 28}, ...]; kinds are
      "key" (one keystroke into the empty BIOS keyboard buffer), "shift" ({"flags": {"ctrl": true}}) and "device"
      ({"device": "<id>", "value": n}, a field declared in "devices" by LE object or breakpoint register and offset).
      Each write is read back and recorded in the report's `stimuli`; a pause without "fields" only stops (and applies
      its stimuli) and needs no confirmation. A field's address is an LE object location, a linear address in page 0
      ({"low": n}, no pointers), or at a breakpoint pause a register and offset ({"register": "ESI", "offset": 0,
      "pointers": [...]}), e.g. the object a routine is handling at that stop, or from an earlier pause's agreed
      integer reading ({"bound": {"pause": "<earlier>", "field": "<id>"}, "offset": 0, "pointers": [...]}) or an
      earlier breakpoint pause's register value ({"bound": {"pause": "<earlier>", "register": "ESI"}, ...}).
      A breakpoint stop may name alternative sites ("offsets": [n, ...], 2-8, the hit one is stop.json's `hitOffset`)
      and a condition ("when": {"register": "EBX", "in"|"notIn": [n | {"pause": ..., "field"|"register": ...}, ...]});
      hits that fail it are resumed without confirmation and counted as `skippedHits` (stop.json, report counts).
      With alternative sites, "at": [offset, ...] (a strict subset of "offsets") limits the condition to hits at those
      sites; a hit at another alternative is the pause unconditionally. "when" may also be a list of 1-8 such
      conditions: a hit is the pause when every condition that applies at its site passes.
      Reading tests wait and branch on this run's readings: a test is {"all"|"any": [{"field": F, "lt"|"le"|"gt"|"ge"|
      "eq"|"ne": n | {"field": G, "offset": c} | {"pause": P, "field": G, "offset": c}}, ...]}. A breakpoint stop's
      "until": {"every": n, "all"|"any": [...]} probes every n-th hit (that passes "when") by reading the test's fields
      and takes the first hit whose test passes; the others count as skippedHits (stop.json `until`, report `probes`).
      A stimulus's "if" (same test over its pause's readings and earlier pauses') applies it only when true; a false
      test records `condition-false`, an unknown one (unqualified reading) rejects the stimulus.
      Pre-existing files under the whole research root must stay unchanged during a run. --evidence narrows that check
      to one directory that contains the run (for runs while other sessions write elsewhere under local/research/);
      the baseline installation and the private copy stay fully protected.

The terminal shows only stable reason codes, counts and relative paths. Exit status: 0 complete, 1 failed,
2 rejected before the run (nothing written), 3 cancelled.
"""
import argparse
import sys

from protect import parse_manifest
from reasons import BaselineError
from session import EXIT_REJECTED, Environment, Options, execute


def main(argv=None, env=None):
    parser = argparse.ArgumentParser(prog="measure.py", description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("baseline-version", help="print the recipe source identity of the baseline manifest")
    run = commands.add_parser("run", help="run a recipe")
    run.add_argument("--recipe", required=True)
    run.add_argument("--out", required=True, help="parent directory below local/research/")
    run.add_argument("--run-id", required=True)
    run.add_argument("--smoke", action="store_true", help="smoke run without operator; never measurement evidence")
    run.add_argument("--evidence", help="narrower evidence root below local/research/ that contains --out (default: "
                                        "the whole research root)")
    arguments = parser.parse_args(argv)
    env = env or Environment.default()
    if arguments.command == "baseline-version":
        try:
            manifest = parse_manifest(env.manifest.read_text(encoding="utf-8"), env.exe_path)
        except BaselineError as error:
            env.output(f"status=rejected reasons={error.code}")
            return EXIT_REJECTED
        except Exception:  # noqa: BLE001 - never a traceback with private paths on the terminal
            env.output("status=rejected reasons=tool-error")
            return EXIT_REJECTED
        env.output(f"baselineVersion={manifest.version} exeSha256={manifest.exe_sha256}")
        return 0
    return execute(Options(arguments.recipe, arguments.out, arguments.run_id, arguments.smoke, arguments.evidence),
                   env)


if __name__ == "__main__":
    sys.exit(main())
