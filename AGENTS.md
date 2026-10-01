# AGENTS.md

Entry point for coding agents and new contributors. Read this first, then follow the reading order below.

## Project in brief

Open Star Rangers is an independent, browser-based re-implementation of the 1995 DOS space combat game *Star Rangers*. Game rules are re-implemented in TypeScript, the world is rendered with Three.js, and the UI is built with React. Players import their own original game data locally in the browser; no original content is ever distributed. Development order: faithful **Classic** remake → Classic 1.0 release → optional **Enhanced** visuals. Deployment target: Azure Static Web Apps.

## Reading order

1. [`docs/STATUS.md`](docs/STATUS.md): current phase, exit-criteria checklist, next actions. **Start here.**
2. [`docs/README.md`](docs/README.md): documentation map and writing conventions (front matter, IDs, status labels).
3. [`docs/plan/master-plan.md`](docs/plan/master-plan.md): frozen product and architecture decisions (Chinese). Read only the sections relevant to your task.
4. [`docs/original/`](docs/original/): everything known about the original game (file formats, unknowns register, behavior specs, key map).
5. [`docs/decisions/`](docs/decisions/): ADRs explaining why decisions were made or changed.

## Hard rules

- **Never commit or paste original game content.** Original files live only in `local/` (git-ignored). Tracked files must not contain bytes, hex dumps, images, text, audio, or decoded output from the original game. Format docs describe structure only. File names, sizes, hashes, and counts are fine.
- **One fact, one place.** Facts about the original game go in `docs/original/`; other docs link to them instead of repeating them.
- **Frozen decisions change only through an ADR.** Add `docs/decisions/ADR-NNNN-*.md`, then update the master plan.
- **Mark confidence.** Every research claim is labeled *Confirmed*, *Likely*, or *Unconfirmed* (Chinese docs: 已确认 / 高概率 / 未确认) with its evidence.
- **Dependency licenses:** permissive licenses are allowed; LGPL only as a separately loaded module; no GPL/AGPL in the shipped web build (see master plan §9.2).
- **`src/core` must stay pure:** no React, Zustand, Three.js, DOM, IndexedDB, `Math.random`, `Date.now`, or `performance.now` (master plan §4.1, §5).

## Languages

- English: `AGENTS.md`, `docs/original/formats/`, code, code comments, identifiers, file names.
- Chinese: the master plan, status, ADRs, guides, reviews, unknowns register, behavior specs, and other docs.

## Commands

```sh
# List the directory of IMFAT (.NOB) archives (structure only, never contents)
node tools/nob-list.ts local/StarRang/SRANGERS/MAIN/*.NOB [--entries]

# Run the original game in the baseline emulator (from the repo root)
~/Tools/bin/dosbox-x -conf local/StarRang/star-rangers-dosbox-x-mac.conf

# Headless Ghidra (LE loader installed)
~/Tools/bin/ghidra-headless <project-dir> <project-name> -import <file> -noanalysis
```

Node 22 runs `.ts` files directly; there is no build step yet (the Vite project arrives in P1). Environment setup: [`docs/guides/baseline-environment.md`](docs/guides/baseline-environment.md).

## Before you finish a task

1. Tick or update items in `docs/STATUS.md`, linking to the evidence (doc, test, or commit).
2. Record new facts in `docs/original/` and update the status of affected `U-###` items in `docs/original/unknowns.md`.
3. Update the `updated:` date in the front matter of every doc you changed.
4. If you changed a frozen decision, make sure an ADR exists for it.
5. Confirm that `git status` shows nothing under `local/` and that no original content was added to tracked files.
