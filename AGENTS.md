# AGENTS.md

Entry point for coding agents and new contributors. Read this first, then follow the reading order below.

## Project in brief

Open Star Rangers is an independent, browser-based re-implementation of the 1995 DOS space combat game *Star Rangers*. Game rules are re-implemented in TypeScript, the world is rendered with Three.js, and the UI is built with React. Players import their own original game data locally in the browser; no original content is ever distributed. Development order: faithful **Classic** remake → Classic 1.0 release → optional **Enhanced** visuals. Deployment target: Azure Static Web Apps.

## Reading order

1. [`docs/STATUS.md`](docs/STATUS.md): current phase summary, phase task-index links, next actions, and project-level blockers. **Start here.**
2. [`docs/README.md`](docs/README.md): documentation map and writing conventions (front matter, IDs, status labels).
3. **Before changing code**, read [`docs/engineering/README.md`](docs/engineering/README.md): toolchain, TypeScript configuration, module boundaries, and testing conventions.
4. [`docs/plan/master-plan.md`](docs/plan/master-plan.md): frozen product and architecture decisions. Read only the sections relevant to your task; planned features are not evidence of implemented behavior.
   For task-based work, read [`docs/engineering/agent-workflow.md`](docs/engineering/agent-workflow.md) and the selected task's spec, goal, and subtask.
5. **For original-game research or compatibility work**, consult [`docs/original/unknowns.md`](docs/original/unknowns.md) and the relevant [format](docs/original/formats/), [behavior](docs/original/behavior/), or [input](docs/original/input/key-map.md) document. Gather missing evidence yourself (local data, reverse engineering, reference gameplay videos, Computer Use on the baseline environment) before asking the user; see [`docs/guides/original-evidence.md`](docs/guides/original-evidence.md).
6. Consult relevant [ADRs](docs/decisions/) and [reviews](docs/reviews/) for decision history. Accepted records are historical: supersede them with a new record rather than rewriting their conclusions.

Keep this entry point short. Detailed rules belong in the engineering guides. `docs/STATUS.md` owns the project/phase summary, each phase `tasks.md` owns planning and navigation, the selected `goal.md` owns subtask execution status, subtask documents own acceptance evidence, and phase reviews own exit decisions. Do not duplicate these trackers.

## Hard rules

- **Never commit or paste original game content.** Original files live only in `local/` (git-ignored). Tracked files must not contain bytes, hex dumps, images, text, audio, or decoded output from the original game. Format docs describe structure only. File names, sizes, hashes, and counts are fine.
- **Never commit or paste disassembly or decompiled code** of the original program. Keep Ghidra projects and script output in `local/`; docs record only function addresses and what they do.
- **One fact, one place.** Facts about the original game go in `docs/original/`; other docs link to them instead of repeating them.
- **Frozen decisions change only through an ADR.** Add `docs/decisions/ADR-NNNN-*.md`, then update the master plan.
- **Mark confidence.** Every research claim is labeled *Confirmed*, *Likely*, or *Unconfirmed* (Chinese docs: 已确认 / 高概率 / 未确认) with its evidence.
- **Dependency licenses:** permissive licenses are allowed; LGPL only as a separately loaded module; no GPL/AGPL in the shipped web build (see master plan §9.2).
- **`src/core` must stay pure:** no React, Zustand, Three.js, DOM, IndexedDB, `Math.random`, `Date.now`, or `performance.now` (master plan §4.1, §5). `pnpm typecheck` and `pnpm lint` enforce this.
- **Keep state and side effects separate:** Core owns game state and returns domain events; Runtime owns scheduling, command queues, and Event Bus dispatch. UI and rendering must not mutate Core state (master plan §4–5).
- **Automated tests and public CI never read original files.** Build format test data with [`src/original-data/synthetic.ts`](src/original-data/synthetic.ts). Local reference experiments may use original files, but their output stays in `local/`.

## Languages

- English: `AGENTS.md`, agent customization instructions, `docs/original/formats/`, code, code comments, identifiers, file names.
- Chinese: the master plan, status, ADRs, guides, reviews, unknowns register, behavior specs, and other docs.

## Commands

Run from the repository root. Use the Node version in [`.nvmrc`](.nvmrc) subject to the minimum in [`package.json`](package.json), and the pnpm version in its `packageManager` field. Keep [`pnpm-lock.yaml`](pnpm-lock.yaml) in sync with dependency changes. Do not upgrade the toolchain just because a newer release exists; compatibility constraints are in the engineering guide.

```sh
# Initial setup when dependencies are missing
pnpm install --frozen-lockfile
pnpm dev          # dev server
pnpm check        # TypeScript + ESLint + Vitest + production build

# Targeted TypeScript tests
pnpm test -- src/original-data/payloads.test.ts

# Python tool tests (not included in pnpm check)
python3 -B -m unittest discover -s tools/ghidra -p 'test_*.py'

# List the directory of IMFAT (.NOB) archives (structure only, never contents)
node tools/nob-list.ts local/StarRang/SRANGERS/MAIN/*.NOB
# Append --entries to include individual directory entries.

# Check every DATA/TEX/BITM/MFDD/CCKD-font/M2ID/NEBC/MESH/MODL entry and cross-references
# (counts, failure codes and observed graphics maxima only)
node tools/nob-check.ts local/StarRang/SRANGERS/MAIN/SR.NOB

# Next spec/review/goal/execute workflow node for a task, plus the parallel
# dispatch schedule during execution (reads planning docs only)
node tools/task-state.ts p1/03 [--json]
```

Node also runs the `.ts` tools directly. DOSBox-X/Ghidra installation and research commands are in [`docs/guides/baseline-environment.md`](docs/guides/baseline-environment.md); script usage is in [`docs/guides/tools.md`](docs/guides/tools.md). Those tools and original data may be absent on other machines. Prefer read-only Ghidra analysis; reimporting with `-overwrite` is an explicit setup operation, not a routine validation step.

## Before you finish a task

1. Validate the changed surface: focused tests while iterating, `pnpm check` for TypeScript/app changes, and the guide's checks for Python/Ghidra changes. Documentation-only work needs link and metadata checks, not a build. Report any checks you could not run.
2. Update the affected goal tracker and subtask evidence. Update `docs/STATUS.md` only when the phase summary, priorities, next actions, or project-level blockers change. Do not track exit criteria there; phase reviews make the final exit decision against the master plan.
3. Record new facts in `docs/original/` and update the status of affected `U-###` items in `docs/original/unknowns.md`.
4. Update the `updated:` date in the front matter of every doc you changed.
5. If you changed a frozen decision, make sure an ADR exists for it.
6. Inspect `git status` and the diff; when committing, also inspect the staged file list. Do not force-add ignored files. Confirm no original content or research output is tracked, and leave unrelated worktree changes intact.
