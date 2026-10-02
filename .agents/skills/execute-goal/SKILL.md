---
name: execute-goal
description: 'Execute or resume an approved Open Star Rangers goal at docs/plan/<phase>/<task>/goal.md. Work through dependency-tracked subtasks, game-specific tests, browser-testing, rubber-duck review, simplify, documentation alignment, acceptance evidence, and one local commit per verified subtask. Use only when explicitly asked to execute-goal.'
argument-hint: 'p1/01, or docs/plan/p1/01/goal.md'
disable-model-invocation: true
---

# Execute Goal

Continue a selected goal through every safe, eligible subtask and final alignment. Do not stop for routine approval between steps.

Explicit invocation authorizes implementation and focused local commits for that goal. It does not authorize push, deployment, cloud mutation, destructive cleanup, unrelated work, or changing the approved behavior.

Read [AGENTS.md](../../../AGENTS.md), [the task workflow](../../../docs/engineering/agent-workflow.md), and [engineering conventions](../../../docs/engineering/README.md).

## 1. Resolve and preflight

Accept a goal path or selector such as `p1/01`, mapped to `docs/plan/p1/01/goal.md`. If there is no unique target, use the question tool rather than choosing by recency.

Before editing code:

1. Read the complete goal, sibling spec, and prerequisite records.
2. Require an explicitly approved spec with no unresolved contract decisions. Explicit execution can approve the selected complete goal, but not an unapproved spec.
   Compare the goal coverage and every subtask's cited scope/acceptance with that current spec. A stale or contradictory plan must be revalidated through planning before code execution; do not reuse completed evidence for a changed requirement.
3. Validate unique subtask IDs, one-to-one tracker/files, matching dependencies, an acyclic graph, and final alignment as the last row depending on all others.
4. Confirm cross-task/environment prerequisites and read applicable module instructions, code, types, and tests.
5. Record the existing dirty paths and relevant hunks as the baseline. Preserve user-owned work. Approved planning files for this goal may be included in its first appropriate commit; unrelated changes may not.
6. Inspect recent commits and recorded evidence for resumption. Do not repeat completed work without a concrete reason to distrust its alignment with the approved spec.
7. Discover and load relevant skills. Use [browser-testing](../browser-testing/SKILL.md) for browser acceptance and [simplify](../simplify/SKILL.md) for scoped code cleanup. Do not require nonexistent skills, model files, or test commands.
8. Record goal approval truthfully if this invocation supplies it. Keep document approval separate from tracker execution state.

The spec is the task contract within the master plan, active ADRs, and original-game evidence. It cannot override frozen project decisions or turn unresolved original behavior into a fact.

## 2. Select work deterministically

- Resume the lowest-numbered `in-progress` row whose dependencies are completed.
- Otherwise reconsider `blocked` rows in numeric order; resume only when the recorded prerequisite is demonstrably satisfied.
- Otherwise choose the lowest-numbered eligible `pending` row.
- Never start a row with unmet dependencies.
- Implement subtasks sequentially for isolated diffs and commits. Delegate only bounded, independent work when substantial separate context is needed; do not require a fixed set of agents.
- If several rows are already in progress, preserve their state and inspect their ownership before proceeding.

Do not ask about already-settled decisions or routine implementation choices. Resolve those from the contract and repository. A new consequential behavior ambiguity, unsafe overlap, or contradiction is a blocker requiring clarification, not permission to guess.

## 3. Execute a subtask

### Claim and scope

Set the tracker row to `in-progress` and update document dates. Read the whole subtask, its cited spec requirements, and the controlling code.

Identify the smallest complete change and a focused check that can falsify the intended result. Keep an exact current-subtask file/hunk scope, including new files, so reviews and commits exclude unrelated work.

### Implement

- Follow existing helpers, naming, type safety, error reporting, and module ownership.
- Keep Core pure: explicit tick input, seeded randomness, deterministic system order, returned domain events, no browser/host time or side effects.
- Runtime owns scheduling, command queues, controls and Event Bus dispatch; pause/resume/exit must work while Core is stopped.
- Keep render snapshots, UI projections, and authoritative world state distinct. Dispose subscriptions, input, media, and GPU resources with the session.
- Use the real TypeScript model files or introduce only the specific planned contracts approved by the spec.
- For persistence, change browser adapters outside Core. Test version compatibility, malformed data, atomic writes and recovery when required. Never clear the user's actual saves or cache.
- For format work, reuse synthetic builders and shared parsers. Public tests do not read original files.
- Do not add approximate gameplay as a success-shaped substitute for required fidelity. Do not broaden scope to unrelated defects.
- Run the focused check after the first meaningful slice, repair it, and proceed iteratively.

### Verify

Run the checks required by the subtask and repository:

- Focused tests first; TypeScript/app changes require `pnpm check` before completion.
- Python/Ghidra changes use the relevant guide's separate checks.
- Documentation-only work uses structure, metadata, and link checks.
- Browser criteria use browser-testing, including observable rendered results, error paths, persisted synthetic state where relevant, and cleanup.
- Required real-device/original/deployment evidence must actually be obtained or remain unmet. Never relabel an unavailable required check as passed because a mock or screenshot looks plausible.

Do not mark green while a required check is failing, skipped, or running. For a pre-existing failure, establish baseline evidence and report it; do not hide it or silently lower acceptance.

### Rubber-duck review

For every subtask, before `simplify` or completion, launch one `rubber-duck` subagent to review the complete current-subtask diff against its cited spec requirements and acceptance criteria. Give it the exact current-subtask files/hunks, relevant contract references, and validation results. Ask for meaningful bugs, logic errors, and design flaws rather than style feedback or unrelated improvements.

Address every applicable finding within the approved scope and rerun affected validation. Record rejected findings only when the reason matters to acceptance. Do not use the review as a substitute for tests, broaden it to branch history, or launch another agent to repeat the same review.

### Simplify and reverify

For implementation-code changes, invoke `simplify` skill with the explicit current-subtask diff/file scope, not the entire branch history. Include new untracked implementation files in that scope.

Apply relevant cleanup, preserve behavior, and rerun affected validation. Verification-only or documentation-only subtasks with no implementation change do not need a code cleanup pass.

### Check documentation impact

For every subtask, after review and cleanup are stable but before marking it complete, check whether the change affects maintained documentation. Inspect the relevant surfaces rather than updating docs mechanically: engineering conventions, commands and test rules in `docs/engineering/`; operator or contributor procedures in `docs/guides/`; architecture and frozen decisions; original-game facts and unknowns; phase navigation, evidence, priorities, and blockers.

Update directly affected docs in the same subtask, including each changed doc's `updated` date. Use an ADR for frozen-decision changes, keep original-game facts in `docs/original/`, and update STATUS only for project/phase evidence, priority, or blockers. If existing documentation remains accurate, record that the check found no required update and why.

### Record evidence

Compare every acceptance checkbox with the actual result. Check only satisfied items and append concise evidence under `完成证据`: test/command, assertion or observed behavior, rubber-duck disposition, documentation-impact result, and relevant file references.

Keep task execution state only in the goal tracker. Update the phase index only for navigation, and STATUS only when project/phase evidence, priority, or blockers change.

Use goal `执行记录` for material deviation or blockers, not every routine operation. Do not paste original bytes, images, extracted text/audio, decompiled output, secrets, or private paths.

### Commit locally

After every required acceptance/check passes:

1. Mark the row `completed`, update metadata, and prepare its code/tests/directly affected docs/evidence/tracker changes together.
2. Inspect the complete and staged diffs. Stage only current-subtask work and approved goal planning artifacts.
3. If unrelated same-file hunks cannot be separated safely, do not commit them; record a blocker.
4. Create one focused, non-interactive local commit. Follow active commit-trailer requirements. Never push.
5. Verify the commit exists and no current-subtask changes remain uncommitted.

A failed commit does not leave a completed row: restore it to `in-progress`, preserve work, and report the failure. Do not advance until verification and persistence are established. Evidence need not embed its own commit hash; report hashes after commits exist.

Then immediately select the next eligible subtask.

## 4. Handle blockers

Before marking `blocked`, add a goal execution record:

```text
- **YYYY-MM-DD — Subtask NN blocked:** <reason>.
  Evidence: <specific check/result>.
  Affected acceptance: <AC/subtask criteria>.
  Resume when: <exact prerequisite>.
```

Preserve partial work; do not present a partial implementation as a completed commit.

Continue only independent eligible work whose files/hunks do not overlap blocked changes. Stop when no safe work remains. Ask one focused clarification when a new user decision is required; routine confirmations remain unnecessary.

Missing evidence or authorization for an explicitly required external check is a real incomplete criterion. Operations outside the approved task scope may be reported as residual actions instead. Local deployment-tooling checks do not fulfill the master plan's actual SWA deployment exit criterion.

## 5. Final alignment and remediation

The final subtask is verification-only:

- Reconcile all `S-xx` and `AC-xx` requirements with implementation and evidence.
- Check feature-specific invariants, relevant full engineering checks, and required browser/manual results.
- Confirm no original content or unrelated changes entered commits.
- Confirm tracked outcomes remain aligned with the approved spec.

If it finds required implementation gaps, do not implement them inside final alignment:

1. Return its row to `pending` and record the failed checks.
2. Add focused remediation subtasks with new, unused numeric IDs.
3. Insert them before the final tracker row; make final alignment depend on every non-final row.
4. Keep existing IDs and references stable; do not reuse the old final ID.
5. Execute remediation through the normal loop, then rerun final alignment.

Do not invent new behavior during remediation. Contract changes require the user's decision and renewed approval.

## Completion

The goal is complete only when every row is `completed`, final alignment passes, all required evidence exists, and goal-owned changes are committed. Document approval (`accepted`) alone is never completion.

Report completed subtasks, local commit hashes, checks and evidence, unresolved blockers, and residual external actions. Stop only at completion, a user pause, or when no safe eligible work remains. Never push or claim unverified phase exit criteria passed.
