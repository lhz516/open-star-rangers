---
name: execute-goal
description: 'Execute or resume an approved Open Star Rangers goal at docs/plan/<phase>/<task>/goal.md, from its first subtask or from a partly executed state. By default coordinates up to three worker sessions in separate worktrees on dependency-ready subtasks with disjoint write scopes, then integrates one verified local commit per subtask; --parallel N changes the limit, --sequential runs in this session, --worker NN runs one claimed subtask. Includes game-specific tests, browser-testing, rubber-duck review, simplify, documentation alignment and acceptance evidence. Use only when explicitly asked to execute-goal.'
argument-hint: 'p1/01 [--parallel N | --sequential | --worker NN]'
disable-model-invocation: true
---

# Execute Goal

Continue a selected goal through every safe, eligible subtask and final alignment. Do not stop for routine approval between steps.

Explicit invocation authorizes implementation and focused local commits for that goal. It also authorizes creating, using and removing that goal's own worker worktrees, `exec/` branches and worker sessions. It does not authorize push, merging into the base branch, deployment, cloud mutation, deleting work it does not own, unrelated work, or changing the approved behavior.

Read [AGENTS.md](../../../AGENTS.md), [the task workflow](../../../docs/engineering/agent-workflow.md), [engineering conventions](../../../docs/engineering/README.md), and [the subtask procedure](./references/subtask-procedure.md). In parallel and worker modes, also read [parallel execution](./references/parallel.md).

## Modes

| Invocation | Mode | Runs in |
|---|---|---|
| `/execute-goal p2/11` | Parallel coordinator, at most 3 workers | The goal worktree |
| `/execute-goal p2/11 --parallel N` | Parallel coordinator, at most N workers (integer N ≥ 1) | The goal worktree |
| `/execute-goal p2/11 --sequential` | One subtask at a time in this session | The current checkout |
| `/execute-goal p2/11 --worker NN` | Only claimed subtask NN, for a coordinator | That subtask's worker worktree |

The flags are mutually exclusive. If a flag is unknown, malformed or conflicting, report the usage instead of guessing. `--sequential` and `--worker` are only used when given explicitly. If the host cannot start worker sessions, the coordinator asks the user how to continue ([parallel execution](./references/parallel.md#dispatch)).

Every mode can start a goal at its first subtask or resume one that is partly done. That includes goals left by earlier sequential runs, by manual branches, or by an interrupted coordinator. The planning documents and git state are the only execution state; rerunning the same command resumes.

## 1. Resolve and preflight

Accept a goal path or selector such as `p1/01`, mapped to `docs/plan/p1/01/goal.md`. If there is no unique target, use the question tool rather than choosing by recency.

Before editing code:

1. Read the complete goal, sibling spec, and prerequisite records.
2. Require an explicitly approved spec with no unresolved contract decisions. Explicit execution can approve the selected complete goal, but not an unapproved spec.
   Compare the goal coverage and every subtask's cited scope/acceptance with that current spec. A stale or contradictory plan must be revalidated through planning before code execution; do not reuse completed evidence for a changed requirement.
3. Run `node tools/task-state.ts <task> --json`. It validates subtask IDs, one-to-one tracker rows and files, matching dependencies, an acyclic graph, final alignment as the last row depending on all others, execution modes and write scopes. Then act on the node:
   - `execute-goal`: proceed.
   - `approve-goal`: this explicit invocation approves the complete goal. Record that approval (item 8), then rerun the router.
   - `resolve-blocker`: reconsider the blocked rows (§4). If a recorded `Resume when` prerequisite is demonstrably satisfied, move that row out of `blocked` (in parallel mode, as described in [parallel execution](./references/parallel.md#reconcile-on-every-start)), then rerun the router. Otherwise report the blockers and stop.
   - `repair-plan`: report its details and stop.
   - Any other node: the goal is not ready to execute. Report it and stop.
4. Confirm cross-task/environment prerequisites and read applicable module instructions, code, types, and tests.
5. Record the existing dirty paths and relevant hunks as the baseline. Preserve user-owned work. Approved planning files for this goal may be included in its first appropriate commit; unrelated changes may not.
6. Inspect recent commits, recorded evidence, and this goal's `exec/<phase>-<task>-*` branches and worktrees for resumption. Do not repeat completed work without a concrete reason to distrust its alignment with the approved spec.
7. Discover and load relevant skills. Use [browser-testing](../browser-testing/SKILL.md) for browser acceptance and [simplify](../simplify/SKILL.md) for scoped code cleanup. Do not require nonexistent skills, model files, or test commands.
8. Record goal approval truthfully if this invocation supplies it. Keep document approval separate from tracker execution state. In parallel mode, the approval is part of the approved-plan commit made before the first claim.
9. Mode checks:
   - Parallel: establish the coordinator workspace and reconcile the tracker with worker branches, worktrees and sessions ([parallel execution](./references/parallel.md)).
   - Worker: run the worker preflight in the same reference.

The spec is the task contract within the master plan, active ADRs, and original-game evidence. It cannot override frozen project decisions or turn unresolved original behavior into a fact.

## 2. Select work deterministically

The router's `subtask` and `schedule` fields are the selection. Do not choose rows by judgment.

- **Parallel:** follow the coordinator loop. Dispatch a prefix of `schedule.wave`, run `schedule.coordinator` rows yourself, and integrate finished workers one at a time.
- **Sequential:**
  - Resume the lowest-numbered `in-progress` row whose dependencies are completed. Otherwise reconsider `blocked` rows in numeric order; resume only when the recorded prerequisite is demonstrably satisfied. Otherwise choose the lowest-numbered eligible `pending` row.
  - Skip rows owned by a worker, meaning rows with an `exec/<phase>-<task>-NN` branch.
  - Delegate only bounded, independent work when substantial separate context is needed.
- **Worker:** only the assigned row.

In every mode:

- Never start a row with unmet dependencies.
- Never run two rows whose write scopes overlap at the same time.

Do not ask about already-settled decisions or routine implementation choices. Resolve those from the contract and repository. A new consequential behavior ambiguity, unsafe overlap, or contradiction is a blocker requiring clarification, not permission to guess. A worker reports it to the coordinator, and the coordinator asks the user.

## 3. Execute a subtask

Every subtask follows [the subtask procedure](./references/subtask-procedure.md), whichever session runs it: claim and scope, implement, verify, rubber-duck review, simplify, documentation impact, evidence, and one focused local commit. In parallel mode, workers commit on their branches and the coordinator integrates each commit, together with the row's `completed` state, into the goal branch.

## 4. Handle blockers

The tracker owner marks a row `blocked`; a worker reports the blocker instead. Before marking `blocked`, add a goal execution record:

```text
- **YYYY-MM-DD — Subtask NN blocked:** <reason>.
  Evidence: <specific check/result>.
  Affected acceptance: <AC/subtask criteria>.
  Resume when: <exact prerequisite>.
```

Preserve partial work in the current checkout or the worker worktree. Do not present partial work as a completed commit. A blocked row keeps its write scope, so overlapping rows wait.

Continue only independent eligible work whose write scopes do not overlap blocked changes. Stop when no safe work remains. Ask one focused clarification when a new user decision is required; routine confirmations remain unnecessary.

Missing evidence or authorization for an explicitly required external check is a real incomplete criterion. Operations outside the approved task scope may be reported as residual actions instead. Local deployment-tooling checks do not fulfill the master plan's actual SWA deployment exit criterion.

## 5. Final alignment and remediation

The final subtask is verification-only. In parallel mode the coordinator runs it in the goal worktree after every other row is integrated.

- Reconcile all `S-xx` and `AC-xx` requirements with implementation and evidence.
- Check feature-specific invariants, relevant full engineering checks, and required browser/manual results.
- Confirm no original content or unrelated changes entered commits.
- Confirm tracked outcomes remain aligned with the approved spec.

If it finds required implementation gaps, do not implement them inside final alignment:

1. Return its row to `pending` and record the failed checks.
2. Add focused remediation subtasks with new, unused numeric IDs, each with a write scope.
3. Insert them before the final tracker row; make final alignment depend on every non-final row.
4. Keep existing IDs and references stable; do not reuse the old final ID.
5. Execute remediation through the normal loop, then rerun final alignment.

Do not invent new behavior during remediation. Contract changes require the user's decision and renewed approval.

## Completion

The goal is complete only when every row is `completed`, final alignment passes, all required evidence exists, and goal-owned changes are committed. Document approval (`accepted`) alone is never completion. In parallel mode, completion also requires that no `exec/<phase>-<task>-*` branch or worktree remains ([cleanup](./references/parallel.md#cleanup)).

Report:

- Completed subtasks and local commit hashes.
- Checks and evidence.
- Unresolved blockers and any retained worktrees with their reasons.
- Residual external actions.
- The goal branch awaiting the user's merge.

Stop only at completion, a user pause, or when no safe eligible work remains. Never push, merge into the base branch, or claim unverified phase exit criteria passed.
