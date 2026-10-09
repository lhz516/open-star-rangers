#!/usr/bin/env python3
"""Runtime measurement of the original game in a private DOSBox-X debugger run (P3-01).

  python3 tools/baseline/measure.py baseline-version
      Prints the manifest-derived baseline version token and executable fingerprint a recipe's `source` must name.

  python3 tools/baseline/measure.py run --recipe <recipe.json> --out local/research/<task>/<topic> --run-id <id>
                                        [--smoke]
      Runs the recipe in a new private run directory <out>/<id>: verified private copy and configuration, owned
      emulator, CODE/DATA correlation, the recipe's pauses, qualified readings, reclaim and original-file check.
      Between pauses, follow `status.json` in the run directory and answer with the signal file it names:
      {"action": "confirm", "mission": {...}, "config": {...}}, {"action": "skip"} or {"action": "abort"};
      `operator/abort.json` cancels at any time. --smoke takes the pauses at startup without an operator; a smoke
      report is never measurement evidence.

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
    run.add_argument("--smoke", action="store_true", help="startup-only smoke run without operator or game input")
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
    return execute(Options(arguments.recipe, arguments.out, arguments.run_id, arguments.smoke), env)


if __name__ == "__main__":
    sys.exit(main())
