---
name: run-task
description: 'Drive one Open Star Rangers task through the spec -> review -> goal -> execute graph, routing each step with tools/task-state.ts and stopping at every human approval gate. Use only when explicitly asked to run-task.'
argument-hint: 'p1/03 [task description] [--plan-only]'
disable-model-invocation: true
---

# Run Task

Orchestrate one task as a state graph. The planning documents are the only graph state; [tools/task-state.ts](../../../tools/task-state.ts) is the only router. Each node is an existing skill, unchanged: [generate-spec](../generate-spec/SKILL.md), [review-spec](../review-spec/SKILL.md), [generate-goal](../generate-goal/SKILL.md), [execute-goal](../execute-goal/SKILL.md).

Read [AGENTS.md](../../../AGENTS.md) and [the task workflow](../../../docs/engineering/agent-workflow.md).

## Authorization

Explicitly invoking this skill authorizes running those four node skills for the selected task only, each under its own SKILL.md boundaries. It does not authorize:

- Approving a spec or goal. Only an explicit user answer at a gate does that.
- Answering a node's consequential question on the user's behalf.
- Push, deployment, cloud mutation, destructive cleanup, or work on another task.

With `--plan-only`, stop when the router reaches `execute-goal`.

## Graph

| Router node | Kind | Action |
|---|---|---|
| `generate-spec` | agent | Run generate-spec. |
| `review-spec` | agent | Run review-spec; it ends by writing the review marker. |
| `approve-spec` | human | Spec approval gate. |
| `generate-goal` | agent | Run generate-goal, including stale-goal revalidation. |
| `approve-goal` | human | Goal approval gate. |
| `execute-goal` | agent | Run execute-goal. |
| `resolve-blocker` | human | Blocker gate. |
| `repair-plan` | human | Report the structural problem and stop. |
| `done` | terminal | Report and stop. |

## Loop

1. Run `node tools/task-state.ts <task> --json` (Node ≥ 22.18). Record `node`, `fingerprint`, `details`.
2. Dispatch the node as described below.
3. Rerun the router and repeat.

Never pick the next node yourself or skip a gate because a node reported success; only the router's answer counts.

Stop and report when:

- The router reaches a terminal node, `repair-plan`, or a gate the user declines.
- An agent node returns with the same `node` and `fingerprint` it started with (no progress).
- `review-spec` would run a third time in this invocation; ask the user how to proceed instead of looping.
- More than 12 nodes have run in this invocation.

## Agent nodes

Run each node in a fresh subagent when available, so planning context does not accumulate. The node skills are not model-invocable, so give the subagent:

- The absolute path of the node's SKILL.md and the instruction to read and follow it completely.
- The router's `command` target and `details`, plus any user answers already collected for this node.
- That this run was authorized by an explicit `/run-task` invocation for this task.
- That consequential questions go to the user. If it cannot ask the user directly, it must stop and return its pending questions instead of guessing.

Relay returned questions to the user one at a time with the question tool, then resume the same subagent with the answers. Without subagent support, follow the node's SKILL.md inline.

Node-specific inputs:

- **generate-spec:** the task description comes from the invocation argument or from the task's row in the phase `tasks.md`. If neither settles it, ask.
- **review-spec:** confirm the router no longer returns `review-spec` for the same fingerprint. If the marker is missing, the review pass did not complete.
- **execute-goal:** one run continues until the goal completes or no safe work remains. Its local commits are the only commits this workflow makes.

## Human gates

Ask with the question tool, one question at a time. Put the recommended option first.

### approve-spec

Summarize the scope items, acceptance criteria, review corrections and every open decision from `details`. If decisions are open, resolve them first, one question per decision; choices are the spec's recommended option and its alternatives.

Then ask:

- **Approve:** record the approval directly in the spec:
  - `status: accepted`.
  - `未决事项` set to `无。` plus which decisions the user confirmed.
  - `审批` holding the date, the user's choice, and the approved S/AC range.
  - `updated:` refreshed.
- **Revise:** run generate-spec with the requested change. The edit invalidates the review marker, so the router returns to `review-spec`.
- **Stop.**

Confirmed decision answers alone, with no approval, are a revision; route them through generate-spec.

### approve-goal

Summarize the subtasks, the dependency structure, and any external prerequisites. Then ask:

- **Approve and execute:** not offered with `--plan-only`.
- **Approve only.**
- **Revise:** run generate-goal with the change.
- **Stop.**

Approval sets the goal to `accepted` and records the date, the user's choice and its scope in `审批`, as execute-goal would.

### resolve-blocker

Show each blocked row and its `执行记录` entry, including the `Resume when` condition. Ask whether the prerequisite is now satisfied:

- **Satisfied:** run execute-goal; it reconsiders blocked rows itself.
- **Stop.**

Do not edit tracker rows here.

### repair-plan

Report `details`. The tracker or approval record is inconsistent, so do not guess a fix. Suggest the owning skill (generate-goal for tracker problems; generate-spec for spec metadata) and stop.

## Boundaries

- The orchestrator writes only approval records at a gate. All other edits belong to node skills.
- Approval needs an explicit answer in this session to that gate's question. A review pass, a successful node, or an earlier general instruction is not approval.
- No orchestrator state file. Rerunning `/run-task <task>` resumes from the documents.
- Leave unrelated dirty files alone. Planning documents are committed only by execute-goal under its own rules.

## Report

When the run ends, report:

- The nodes traversed and the router's final node and reason.
- Changed planning documents.
- Commit hashes from execute-goal.
- Open decisions or blockers.
- The command that resumes the run.
