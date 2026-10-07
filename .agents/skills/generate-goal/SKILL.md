---
name: generate-goal
description: 'Decompose an approved Open Star Rangers spec into goal.md and dependency-tracked subtasks at docs/plan/<phase>/<task>/. Use when explicitly asked to generate-goal, map acceptance criteria to focused work, or prepare an execute-goal run.'
argument-hint: 'p1/01, or docs/plan/p1/01/spec.md'
disable-model-invocation: true
---

# Generate Goal

Turn an approved task spec into a grounded execution plan. The spec defines the contract; [execute-goal](../execute-goal/SKILL.md) owns execution, validation, commits, and resumption. Do not duplicate that orchestration policy in the goal.

Read [AGENTS.md](../../../AGENTS.md), [the task workflow](../../../docs/engineering/agent-workflow.md), and [engineering conventions](../../../docs/engineering/README.md).

## Output boundary

- Write `goal.md` next to the selected `spec.md`.
- Write one file per subtask under that task's `subtasks/`, named `NN-<kebab-task>.md`.
- You may update the phase `tasks.md` with navigation links; never duplicate execution status there.
- Do not change the spec contract, implement code, install packages, commit, or start execution. If the user explicitly approves the current spec during selection, you may record only its approval metadata and statement.
- Preserve existing work when regenerating. Never overwrite completed evidence, reset tracker state, or renumber existing subtask IDs silently.

## 1. Select and verify the spec

Accept a spec path or selector such as `p1/01`, mapped to `docs/plan/p1/01/spec.md`.

If no unique target is supplied, ask the user to select one. Read the complete spec.

Confirm:

- The spec is explicitly approved (`status: accepted` with a truthful approval record).
- Required behavior and acceptance decisions are resolved.
- The task fits the current project decisions and phase scope.

If approval is missing, ask whether to approve the current contract; do not manufacture approval. If a necessary contract decision is missing, ask the user and route the resulting spec change through generate-spec/review-spec before producing an execution-ready plan.

## 2. Ground in actual code

Inspect the affected paths, types, shared helpers, tests, and related tasks directly. Delegate only a bounded, independent investigation requiring substantial separate context.

Record:

- What already exists and how it behaves.
- Exact files/types each subtask will touch; mark new ones as planned.
- Prerequisites from other tasks and the evidence required before execution.
- Appropriate existing validation commands and any missing runner or environment.
- Relevant original-game records and remaining uncertainty.

Resolve data models in the actual `src/core/`, `src/content/`, `src/original-data/`, and `src/platform/` TypeScript contracts, according to ownership. These paths may be planned rather than implemented. Do not invent a unified schema file.

## 3. Decompose by verifiable outcomes

1. Keep one focused concern per subtask, sized for an isolated, validated commit.
2. Encode real prerequisites, not ordering preferences. Contracts/types precede dependent systems; Core outcomes precede their Runtime/render/UI consumers when actually required.
3. Name exact data shapes, units, commands/events, and files where the spec already settles them. Do not re-decide gameplay.
4. Put relevant invariants and failure paths in the work that owns them.
5. Map every `S-xx` scope item and `AC-xx` criterion to implementation and verification subtasks.
6. Include tests with their behavior rather than deferring all testing to the end.
7. For local persistence changes, include old-version synthetic saves/caches, atomicity, validation, error feedback, and recovery when required by the spec.
8. For browser criteria, explicitly reference [browser-testing](../browser-testing/SKILL.md); for implementation cleanup, reference [simplify](../simplify/SKILL.md) with the current subtask scope.
9. Distinguish Node/Core tests, synthetic browser checks, and human real-device/original comparisons. Never replace a required measurement with a cheaper proxy.
10. Cloud mutations, push, deployment, and destructive actions are not authorized by goal execution. If the approved contract requires such an external outcome, preserve it as an explicit unmet prerequisite/check; do not weaken the spec or promise full completion from local checks.
11. Give every subtask a conservative `## 写入范围` listing each path or glob it may create or modify. execute-goal runs dependency-ready subtasks in parallel only when their scopes do not overlap. Rows that write the same files are therefore serialized without a dependency; do not add dependencies just to order them. Split a shared hot file's edits into one owning subtask when that keeps the others independent. Mark subtasks that need the user's own action with `**执行方式：** 需用户`.

Assign stable numeric subtask IDs, padded to at least two digits. Dependencies reference IDs within this goal; cross-task prerequisites belong in the goal's prerequisite section with concrete completion evidence.

### Final alignment

The final tracker row is a verification-only subtask, depending on every other row. It checks all scope/acceptance coverage, feature-specific invariants, required engineering checks, and any specified browser/manual evidence.

It ships no new feature code. Gaps become remediation subtasks. IDs are stable: later remediation receives new IDs, is inserted before final alignment, and becomes its dependency; final alignment stays the last tracker row without reusing or renumbering IDs.

## 4. Write the artifacts

Use [the goal template](./references/goal-template.md) and [the subtask template](./references/subtask-template.md).

- Generated documents are Chinese with the repository's front matter.
- Set goal document status to `draft`; user approval is separate from implementation progress.
- All newly generated tracker rows start `pending`.
- Tracker status vocabulary is exactly `pending`, `in-progress`, `blocked`, `completed`.
- Subtasks contain acceptance checkboxes and an initially empty evidence section, not another execution-status field.
- Dependencies in each subtask exactly match the tracker.
- Write scopes never include `goal.md`, the phase `tasks.md` or `docs/STATUS.md`; only the execution coordinator edits them. The final alignment may write `无`.
- Goal execution notes start empty; they are not a routine work log.
- Keep the goal concise: context, prerequisites, coverage, dependency tracker, approval, and material execution notes.
- Fill contract and scope content completely. Only execution evidence/notes and pending approval remain intentionally unfilled.

If an existing goal has execution history, first compare the old plan with the approved spec. Preserve applicable completed evidence, identify changed acceptance as work needing revalidation, and ask before replacing any existing work. Do not silently present stale evidence as satisfying new criteria.

## 5. Validate and hand off

Check:

- Unique IDs; one tracker row per existing subtask file, with no orphan files.
- Every dependency names a real, different subtask; the graph is acyclic.
- The final row depends on every other subtask.
- Every non-final subtask has a write scope and an execution mode, and `node tools/task-state.ts <task>` reports no plan problem.
- Every scope item and acceptance criterion is covered.
- All proposed files are accurately marked existing/new.
- Required checks exist or their setup is explicitly scoped; no invented commands.
- No unresolved behavioral choices or accidental scope changes.
- Relative links, metadata, and phase navigation resolve.

Report the goal path, number of subtasks, meaningful dependency structure, the parallel waves the write scopes allow, and any external prerequisites. Ask for goal approval if not already given, and provide `/execute-goal docs/plan/<phase>/<task>/goal.md`.

Do not execute or commit.
