---
name: review-spec
description: 'Review one Open Star Rangers task spec for scope, fidelity evidence, Core/Runtime boundaries, data contracts, browser behavior, and measurable acceptance. Fix unambiguous document defects and ask about consequential choices. Use only when explicitly asked to review-spec.'
argument-hint: 'docs/plan/p1/01/spec.md'
disable-model-invocation: true
---

# Review Spec

Review a task contract, not the implementation diff. Edit only the selected `spec.md`; do not create a review report, goal, subtasks, code, commits, or deployment changes.

## 1. Resolve and read

1. Resolve the supplied spec path or attached spec within `docs/plan/<phase>/<task>/spec.md`. If selection is ambiguous, ask the user; never pick by modification time.
2. Read [AGENTS.md](../../../AGENTS.md) and [the task workflow](../../../docs/engineering/agent-workflow.md), then the entire spec before tracing supporting code.
3. Identify phase, scope, involved modules, fidelity claims, data/persistence contracts, user interaction, risk, and acceptance criteria.
4. Record the target's existing diff. Preserve user edits.
5. Inspect relevant code, tests, [the master plan](../../../docs/plan/master-plan.md), ADRs, and original-game records. Do not equate planned behavior with implementation or inferred behavior with confirmed original rules.

## 2. Review applicable concerns

Use these as a checklist, not a mandatory reviewer count:

### Scope and player/developer outcomes

Check the task's observable goal, phase fit, in/out boundaries, and whether it supports the stated exit criterion without pulling later phases forward.

### Game rules and fidelity

Check state transitions, input semantics, units, pause/map/flight interactions, failure behavior, invariants, and claims about the original. Require authoritative `U-###`, `B-###`, or format references and confidence. Do not invent missing behavior or demand exactness beyond the project's fidelity definition.

### Contracts and browser persistence

Check actual TypeScript model locations, inputs/commands/events, serialization, normalized content IDs, parser validation, and data ownership. When applicable, check save/cache versions, transactions, content fingerprints, compatibility, corrupt data, quota/eviction, and recovery.

### Architecture and runtime

Check Core purity, deterministic inputs and system order, Runtime-only scheduling/Event Bus, control-channel separation, render snapshots/interpolation, projection consumers, bounded catch-up, and disposal under restart/StrictMode/HMR.

### Interaction, rendering, and browser limits

Check applicable React versus in-flight rendering ownership, Classic aspect ratio, optional wide FOV, keyboard/mouse/focus behavior, loading/error states, and accessibility. Canvas existence alone is not a render assertion. Synthetic keyboard events cannot verify OS/browser shortcut interception.

### Privacy, resource handling, and verification

Check local-only resource handling, synthetic public fixtures, parser size/offset limits, diagnostic privacy, dependency policy, and acceptance evidence. Keep real-device, original-game, performance, and deployment requirements visible when they are actually in scope. Flag original-game checks assigned to the user that an agent could perform with [original evidence](../../../docs/guides/original-evidence.md).

For every applicable concern, assess clarity, completeness, and testability. Omit style preferences and unrelated scope expansion.

## 3. Scale review to evidence

Review directly when the complete relevant evidence fits one context. Do not launch reviewers simply to cover the checklist.

If separate, substantial context is genuinely needed or the user requests specialist reviewers, assign a small set of non-overlapping, read-only lanes and launch independent work together. Give each reviewer:

- The absolute spec path and instruction to read it completely.
- Governing project decisions and its exact concern/ownership.
- Explicit exclusions so findings are not duplicated across lanes.
- Permission to inspect relevant evidence, but no edits.
- A bounded objective and actionable findings with spec reference, evidence, impact, correction, and whether a user decision is required.

The parent owns synthesis and edits. Do not retrace delegated scopes. Dedicated exploit/vulnerability requests follow the active security-review workflow rather than turning this skill into a security audit.

## 4. Synthesize and resolve

Deduplicate by underlying requirement. Reject unsupported claims, implementation preferences, and changes outside the selected task.

Use this findings shape:

| Severity | Spec reference | Issue | Evidence and impact | Correction | User decision |
|---|---|---|---|---|---|

- **Blocker:** A missing/conflicting contract prevents safe implementation or truthful verification.
- **High:** Likely wrong gameplay, data loss, invalid fidelity claims, or substantial rework.
- **Medium:** Material ambiguity, missing edge behavior, or unverifiable requirement.
- **Low:** Bounded document defect with no change to intent.

### Fix directly

Fix broken links, stale proven file/type names, duplicate wording, malformed structure, and imprecise wording whose intended meaning is already settled. Keep unaffected sections intact.

### Ask before changing

Settle factual questions about the original game yourself first, following [original evidence](../../../docs/guides/original-evidence.md). Ask about original-rule interpretation only when that evidence cannot settle it, and say what you tried.

Use the question tool, one question at a time, for behavior, scope, numerical targets, original-rule interpretation, compatibility, data retention, architecture choices, or weakening acceptance. Do not guess or change a frozen decision in the spec.

If the user does not resolve a consequential issue, keep it visible under `未决事项` and report it as unresolved. Material changes to an accepted contract reset it to `draft` and require explicit renewed approval; a review finding or your own edit does not constitute approval.

## 5. Final alignment

Re-read the complete spec and check:

- Scope, behavior, data ownership, risks, and acceptance agree.
- Every acceptance criterion has a real, applicable verification method.
- Original claims cite evidence; unresolved research is not disguised as a settled rule.
- No goal sequencing or implementation code leaked into the contract.
- Metadata, approval record, and relative links are correct; `updated:` reflects the change.
- Only the selected spec changed during this review.

When the pass is complete (every finding fixed, answered, or recorded under `未决事项`), make one last edit: run `node tools/task-state.ts <spec-path> --mark-reviewed`. This writes a `reviewed:` hash of the exact spec text, which later edits invalidate. The marker means "reviewed"; it is not approval. Do not write it when you stop part-way through a review.

Report the reviewed path, concerns covered, meaningful corrections, and unresolved decisions. Do not automatically generate a goal or commit.
