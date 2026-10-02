---
name: generate-spec
description: 'Interactively create or revise an Open Star Rangers task spec at docs/plan/<phase>/<task>/spec.md. Use when explicitly asked to generate a spec, clarify game or engineering behavior, define measurable acceptance criteria, or prepare a task for review-spec and generate-goal.'
argument-hint: 'p1/01 <task description>, or docs/plan/p1/01/spec.md'
disable-model-invocation: true
---

# Generate Spec

Build one task contract with the user. Capture what must change, why, the relevant game/data contracts, and how the result will be verified. Do not begin goal decomposition or implementation.

Read [AGENTS.md](../../../AGENTS.md), [the task workflow](../../../docs/engineering/agent-workflow.md), [STATUS](../../../docs/STATUS.md), and the relevant sections of [the master plan](../../../docs/plan/master-plan.md). Use [the spec template](./references/spec-template.md); generated documents are Chinese.

## Output boundary

- Create or revise only `docs/plan/<phase>/<task>/spec.md`.
- You may add or repair that task's navigation link in its phase `tasks.md`; do not put execution status there.
- Do not create a goal, subtasks, application code, test code, new dependencies, commits, or deployment artifacts.
- Do not automatically invoke the next planning skill.
- Existing goal/subtask artifacts are not rewritten here. If the revised contract affects them, report that they need revalidation or regeneration.

## 1. Resolve the task

Accept an existing spec path, a task selector such as `p1/01`, or a description.

1. Resolve paths inside this repository. Phases are `p1` through `p6`; task numbers are positive, zero-padded numeric identifiers.
2. Reuse the supplied task directory. Never invent a feature-name directory elsewhere.
3. If the phase or task number is missing, use the question tool to confirm it. Inspect the phase index to avoid collisions; do not silently pick a recent spec or overwrite another task.
4. If the user supplied an existing spec, read it completely and preserve unrelated edits.
5. Confirm the problem and intended outcome only where the user's input leaves uncertainty. Do not interview them about decisions already settled by the request or project documents.

Examples:

```text
/generate-spec p1/01 最小 Core 与事件返回契约
/generate-spec docs/plan/p1/01/spec.md
```

## 2. Ground the contract

Inspect the controlling code paths, adjacent helpers, tests, and related task artifacts before drafting. Prefer direct, bounded searches; delegate only a genuinely broad, independent investigation needing separate context.

Distinguish:

- Existing implementation, with real file/symbol references.
- Planned directories or types that do not exist yet.
- Frozen project decisions.
- Original-game evidence and unresolved research.

For data models, locate the actual TypeScript definitions in the owning modules:

- `src/core/`: world, entities, input, commands, domain events, projections, save model.
- `src/content/`: normalized content, Asset IDs, resource versions.
- `src/original-data/`: archive and payload structures and parser output.
- `src/platform/`: browser storage, input, audio, and video adapters.

These are responsibility locations, not a claim that every directory or type exists. Identify concrete files or label proposed files as new. Do not invent a central schema file or put browser adapters in Core.

For fidelity work, link the relevant `U-###`, `B-###`, format documents, and evidence confidence in `docs/original/`. Do not copy original content or treat inferred rules as confirmed. A prototype using synthetic or approximate behavior must be explicitly scoped as such.

## 3. Ask only consequential questions

Use the question tool, one question at a time, with concrete choices where useful.

Resolve applicable topics:

- **Behavior:** observable outcomes, failure feedback, state transitions, and invariants.
- **Scope:** deliverables, explicit non-goals, and the phase exit criterion this task supports.
- **Core/Runtime:** input and command shapes, event results, tick units, pause/control ownership, deterministic replay boundaries.
- **Rendering/UI/input:** React versus in-flight rendering responsibilities, aspect ratio, views, keyboard/mouse behavior, focus loss, and lifecycle cleanup.
- **Data:** fields, types, units, ownership, validation boundaries, serialization, and content identifiers.
- **Persistence, only when needed:** IndexedDB/localStorage ownership, schema/save version, content fingerprint, atomic writes, old saves, corrupt input, quota/eviction, export/import, and recovery.
- **Verification:** exact assertions, measurable thresholds, Node versus browser checks, and any required real-device or original-game comparison.
- **Risk:** reversible changes, save/cache compatibility, and recovery for medium/high-risk work.

Do not add unrelated systems, speculative general-purpose engine work, or later-phase features. No Gamepad implementation in the first release.

If a proposal changes a frozen decision, record the unresolved dependency on an approved ADR/master-plan update. This skill does not change those records or approve the conflicting spec.

## 4. Write and validate the spec

Use [the template](./references/spec-template.md). Keep all applicable sections, writing an explicit reason where a section does not apply.

- Use stable `S-01` scope-item and `AC-01` acceptance identifiers. Do not renumber existing identifiers just for appearance.
- Make each acceptance criterion independently observable, including relevant error paths and output shapes.
- Name verification methods and evidence requirements; do not invent arbitrary numeric targets.
- Specify contracts and constraints, not function implementations or subtask order.
- Avoid repeating original facts or the master plan; link their authoritative records.
- Mark the spec `draft` until the user explicitly approves the complete contract.
- A material change to an accepted contract requires renewed approval. Update `updated:` and the approval record accordingly.
- A review pass is not user approval. Never fabricate an approval date or statement.
- Required unanswered questions prevent acceptance. External verification required by the contract remains required; a synthetic test cannot waive it.

Read the completed spec back. Check internal consistency, relative links, metadata, scope, data ownership, measurable acceptance, validation coverage, and absence of unresolved placeholders.

## 5. Handoff

Report the spec path, the important settled choices, and any remaining questions. Suggest `/review-spec <spec-path>` before `/generate-goal <spec-path>`.

Do not create downstream artifacts or commit. If the user explicitly approved the spec, record that approval; otherwise leave it draft.
