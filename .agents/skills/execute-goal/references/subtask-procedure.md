# Subtask procedure

Every execute-goal mode runs a subtask with this procedure: sequential runs, `--worker` sessions, and rows the parallel coordinator runs itself.

The **tracker owner** edits `goal.md`, the phase `tasks.md` and `docs/STATUS.md`. In `--sequential` mode that is this session. In parallel mode it is the coordinator. A worker never edits those files. It reports proposed changes in its handoff ([parallel execution](./parallel.md#worker-report)).

## Claim and scope

- **Sequential:** set the tracker row to `in-progress` and update document dates.
- **Parallel:** the coordinator's claim commit has already set the row to `in-progress`. A worker confirms that at its base commit and does not touch the tracker.

Read the whole subtask, its cited spec requirements, and the controlling code.

Identify the smallest complete change and a focused check that can falsify the intended result. Keep an exact current-subtask file/hunk scope, including new files, so reviews and commits exclude unrelated work. The scope must stay inside the subtask's `## 写入范围` plus its own document. If the work really needs another path, a worker stops and sends a scope request instead of editing it; the coordinator records any widened scope. A sequential run updates the subtask's `写入范围` along with the change.

## Implement

- Follow existing helpers, naming, type safety, error reporting, and module ownership.
- Keep Core pure: explicit tick input, seeded randomness, deterministic system order, returned domain events, no browser/host time or side effects.
- Runtime owns scheduling, command queues, controls and Event Bus dispatch; pause/resume/exit must work while Core is stopped.
- Keep render snapshots, UI projections, and authoritative world state distinct. Dispose subscriptions, input, media, and GPU resources with the session.
- Use the real TypeScript model files or introduce only the specific planned contracts approved by the spec.
- For persistence, change browser adapters outside Core. Test version compatibility, malformed data, atomic writes and recovery when required. Never clear the user's actual saves or cache.
- For format work, reuse synthetic builders and shared parsers. Public tests do not read original files.
- Do not add approximate gameplay as a success-shaped substitute for required fidelity. Do not broaden scope to unrelated defects.
- Run the focused check after the first meaningful slice, repair it, and proceed iteratively.

## Verify

Run the checks required by the subtask and repository:

- Focused tests first; TypeScript/app changes require `pnpm check` before completion.
- Python/Ghidra changes use the relevant guide's separate checks.
- Documentation-only work uses structure, metadata, and link checks.
- Browser criteria use browser-testing, including observable rendered results, error paths, persisted synthetic state where relevant, and cleanup. A worker uses its assigned ports.
- Required real-device/original/deployment evidence must actually be obtained or remain unmet. Never relabel an unavailable required check as passed because a mock or screenshot looks plausible.

Do not mark green while a required check is failing, skipped, or running. For a pre-existing failure, establish baseline evidence and report it; do not hide it or silently lower acceptance.

## Rubber-duck review

For every subtask, before `simplify` or completion, launch one `rubber-duck` subagent to review the complete current-subtask diff against its cited spec requirements and acceptance criteria. Give it the exact current-subtask files/hunks, relevant contract references, and validation results. Ask for meaningful bugs, logic errors, and design flaws rather than style feedback or unrelated improvements.

Address every applicable finding within the approved scope and rerun affected validation. Record rejected findings only when the reason matters to acceptance. Do not use the review as a substitute for tests, broaden it to branch history, or launch another agent to repeat the same review.

## Simplify and reverify

For implementation-code changes, invoke `simplify` skill with the explicit current-subtask diff/file scope, not the entire branch history. Include new untracked implementation files in that scope.

Apply relevant cleanup, preserve behavior, and rerun affected validation. Verification-only or documentation-only subtasks with no implementation change do not need a code cleanup pass.

## Check documentation impact

For every subtask, after review and cleanup are stable but before marking it complete, check whether the change affects maintained documentation. Inspect the relevant surfaces rather than updating docs mechanically: engineering conventions, commands and test rules in `docs/engineering/`; operator or contributor procedures in `docs/guides/`; architecture and frozen decisions; original-game facts and unknowns; phase navigation, summary, priorities, next actions, and blockers.

Update directly affected docs in the same subtask, including each changed doc's `updated` date. Use an ADR for frozen-decision changes, keep original-game facts in `docs/original/`, and update STATUS only for the phase summary, task-index links, priority, next actions, or project-level blockers. Never add exit-condition tracking or evidence checklists to STATUS. A worker proposes STATUS and phase `tasks.md` changes in its report instead of editing them. If existing documentation remains accurate, record that the check found no required update and why.

## Record evidence

Compare every acceptance checkbox with the actual result. Check only satisfied items and append concise evidence under `完成证据`: test/command, assertion or observed behavior, rubber-duck disposition, documentation-impact result, and relevant file references.

Keep task execution state only in the goal tracker. The tracker owner updates the phase index for planning and navigation, and STATUS only when its phase summary, task-index links, priority, next actions, or project-level blockers change.

The tracker owner uses goal `执行记录` for material deviations or blockers, not every routine operation. Do not paste original bytes, images, extracted text/audio, decompiled output, secrets, or private paths.

## Commit locally

After every required acceptance/check passes:

### Sequential, and rows the coordinator runs itself

1. Mark the row `completed`, update metadata, and prepare its code/tests/directly affected docs/evidence/tracker changes together.
2. Inspect the complete and staged diffs. Stage only current-subtask work and approved goal planning artifacts.
3. If unrelated same-file hunks cannot be separated safely, do not commit them; record a blocker.
4. Create one focused, non-interactive local commit. Follow active commit-trailer requirements. Never push.
5. Verify the commit exists and no current-subtask changes remain uncommitted.

A failed commit does not leave a completed row: restore it to `in-progress`, preserve work, and report the failure. Do not advance until verification and persistence are established. Evidence need not embed its own commit hash; report hashes after commits exist.

### Worker

1. Leave the tracker untouched; the coordinator marks the row `completed` when it integrates the commit.
2. Inspect the complete and staged diffs. Stage only paths inside the write scope and the subtask's own document.
3. Create exactly one focused, non-interactive commit on the worker branch, using the repository's message style and active trailer requirements. Never push, merge, or rebase other branches.
4. Verify the commit exists and `git status --porcelain` is empty; ignored files may remain.
5. Return the worker report and stop. For a follow-up fix or rebase, amend that same commit, rerun affected checks, and report again.
