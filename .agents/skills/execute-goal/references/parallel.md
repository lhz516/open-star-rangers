# Parallel execution

The default mode. One **coordinator** session runs in the current checkout and claims subtasks there. It dispatches dependency-ready subtasks with disjoint write scopes to at most N **worker** sessions (default 3, `--parallel N`), each in a new worktree. It then integrates their commits one at a time. [ADR-0017](../../../../docs/decisions/ADR-0017-coordinator-current-checkout.md) records the decision, superseding [ADR-0016](../../../../docs/decisions/ADR-0016-parallel-goal-execution.md).

## Names

| Item | Value |
|---|---|
| Primary checkout `<primary>` | First `worktree` entry of `git worktree list --porcelain` |
| Coordinator checkout | The checkout where `/execute-goal` was invoked: the primary worktree or a linked worktree the user created |
| Goal branch | The coordinator checkout's current branch; it may be the base branch (normally `main`) |
| Worker branch | `exec/<phase>-<task>-<NN>`, e.g. `exec/p2-11-12` |
| Worker worktree | `<primary>.worktrees/exec-<phase>-<task>-<NN>` |
| Worker ports, `B = 5100 + 3 × NN` | `OSR_E2E_DEV_PORT=B`, `OSR_E2E_PREVIEW_PORT=B+1`, browser-testing dev server `B+2` |
| Claim commit | `docs(<phase>-<task>): claim subtasks NN, NN and NN` |

A worker branch is the claim marker: a row whose `exec/` branch exists belongs to that worker. `--sequential` must not take it over.

## Ownership

- Only the coordinator edits:
  - `goal.md` (tracker, `执行记录`, `审批`), the phase `tasks.md`, and `docs/STATUS.md`.
  - Every subtask's `**执行方式：**` line and `## 写入范围` section.

  Every claim, scope change, completion and blocker becomes a coordinator commit on the goal branch, where the router reads it.
- A worker edits only paths inside its subtask's `## 写入范围`, plus its own subtask document's acceptance checkboxes and `完成证据`.
- The coordinator itself runs only `schedule.coordinator` rows (rows that need the user, and final alignment) and partial work left in its own checkout by an earlier run.

## Coordinator workspace

The coordinator runs in the coordinator checkout, on whatever branch is checked out there. It never creates, switches to or moves this session into another worktree or branch for itself. Claims, scope records, blocker records and integrations are local commits on the goal branch; only workers get new worktrees ([Dispatch](#dispatch)).

Before the first claim, check:

1. `HEAD` is on a branch, not detached, and that branch is not an `exec/` worker branch.
2. Every dirty path, staged or not, is one of:
   - this goal's uncommitted approved planning documents, committed at the first [dispatch](#dispatch);
   - partial work of one of this goal's `in-progress` rows (see [Reconcile](#reconcile-on-every-start));
   - an unrelated user change that is unstaged and outside this goal's directory, the coordinator-owned documents and every row's `写入范围`. Record these as the baseline. Never stage, restore, stash, reset or commit them.

   Otherwise report the offending paths, leave them alone and ask the user to commit or move them; offer `--sequential` as the alternative.
3. One branch coordinates a goal. List commits on other local branches that touch this goal's `goal.md` but are not in `HEAD`: `git log --branches --not HEAD -- docs/plan/<phase>/<task>/goal.md`. Workers never edit `goal.md`, so a hit means another branch may be coordinating it, such as a `goal/<phase>-<task>` worktree made by an earlier version of this skill. Report those branches and their worktrees and ask the user before claiming anything here. If the user continues here, leave those branches and their workers alone.

Recheck the index and dirty paths before every coordinator commit and integration, since the user may keep working in this checkout. Pause and ask when a new change appears in the index or in a goal path.

Never push the goal branch or merge it into another branch. After completion the user decides whether to push or merge it.

## Reconcile on every start

Starting and resuming use the same path. Compare the router `schedule`, `git worktree list --porcelain`, `git branch --list 'exec/<phase>-<task>-*'`, and any visible worker sessions (`list_sessions` filtered by each worker worktree):

| Tracker row | Worker branch/worktree | Action |
|---|---|---|
| `completed` | Exists | Look for the integration commit: `git log --grep='^Worker-Commit: <tip>$'`. If found and the worktree is clean, remove the worktree and branch. Otherwise (the tip changed after integration, or the worktree is dirty) keep both and report. |
| `in-progress` | Clean worktree, commits ahead of the goal branch, session idle or gone | Integrate. |
| `in-progress` | Session still running | Wait. |
| `in-progress` | Exists, session gone, no finished commit | Start a new worker session in the same worktree; it resumes the partial work. |
| `in-progress` | None, and this checkout has uncommitted work for the row | Left by an earlier sequential run. Finish it here with the subtask procedure before integrating anything. |
| `in-progress` | None, no partial work | Coordinator row: run it yourself. Automatic row: dispatch it to a new worker. The existing claim is enough; no new claim commit is needed. |
| `blocked` | Any | Reconsider the blocker; see below the table. |
| `pending` | Exists | Interrupted dispatch. Remove it if it has no commits and a clean worktree; otherwise keep it and ask. |
| Not in tracker | Exists | Report it; never delete it. |

A blocked row's worktree preserves its partial work; keep it. When the blocker's recorded `Resume when` prerequisite is demonstrably satisfied:

- If the row has a worktree, set the row to `in-progress`, commit only `goal.md`, and start a worker session in that worktree.
- If it has none, set the row to `pending`, commit only `goal.md`, and let normal dispatch pick it up.

Run `git worktree prune` for records whose directories are already gone. Leave unrelated branches and worktrees alone.

## Write scopes

The router treats a row without `## 写入范围` as conflicting with every other row. When `schedule.unscoped` is not empty, record scopes before dispatching:

1. Derive each listed row's scope from its `工作范围`, `关键文件与契约` and the actual code. Include tests, docs, fixtures and `local/` research output it writes. Exclude its own document and the coordinator-owned documents. List a directory glob when unsure; a false overlap only serializes work.
2. Add `**执行方式：** 需用户：…` to rows that need the user's action.
3. Do not change `工作范围`, `验收标准` or dependencies. This is execution metadata and needs no re-approval.
4. Commit only those subtask documents: `docs(<phase>-<task>): record subtask write scopes`. Rerun the router and fix any reported plan problem before continuing. An approved scope request is recorded the same way, as `docs(<phase>-<task>): widen subtask NN write scope`.

## Coordinator loop

Repeat until the router leaves `execute-goal`. Then handle `done`, `resolve-blocker` or `repair-plan` as described in SKILL.md.

1. Route with `node tools/task-state.ts <task> --json` and read `schedule`.
2. Integrate every finished worker, one at a time ([Integrate](#integrate)). If this checkout still holds partial work from an earlier run, finish that work first (step 5).
3. Record scopes for any `unscoped` rows ([Write scopes](#write-scopes)).
4. Claim and dispatch the first `N − running workers` entries of `schedule.wave` ([Dispatch](#dispatch)).
5. Run these rows yourself with the subtask procedure, claiming pending ones in the same claim commit before you start them:
   - Partial work found in this checkout during reconciliation.
   - `schedule.coordinator` rows that need the user. If the row needs evidence about the original game, and the approved spec does not require the user's own judgment or perception, obtain that evidence yourself first ([original evidence](../../../../docs/guides/original-evidence.md)). Record the row's `执行方式` as `自动` in the same way as a write scope ([Write scopes](#write-scopes)), and run it yourself without asking. Otherwise ask when no worker report is waiting; workers keep running meanwhile.
   - Final alignment, only when it is the only ready row and no worker is running.
6. If nothing above applied, wait for worker progress. Use completion notifications when the host provides them; otherwise check worker sessions and branches every few minutes. Then handle each report ([Worker report](#worker-report)).

Re-route after every integration; newly ready rows are dispatched immediately rather than waiting for a whole wave.

## Dispatch

1. If this goal's approved planning documents or its approval record are not committed yet, commit them by themselves first: `docs(<phase>-<task>): record the approved goal plan`.
2. Set the chosen wave rows, and any pending `schedule.coordinator` row you are about to run, to `in-progress`. Update `goal.md`'s `updated:` and commit only `goal.md` as the claim commit.
3. For each wave row, run `git worktree add -b exec/<phase>-<task>-<NN> <worktree> HEAD`. When `<primary>/local` exists and `<worktree>/local` does not, link it: `ln -s <primary>/local <worktree>/local`.
4. Start a session in that folder without another worktree, for example `create_session` with `workspace: <worktree>` and `worktree: false`, titled `<phase>-<task> · <NN> worker`. Prompt:

   ```text
   /execute-goal docs/plan/<phase>/<task>/goal.md --worker <NN>

   Read and follow <absolute worktree>/.agents/skills/execute-goal/SKILL.md in worker mode.
   Authorized by the coordinator's explicit /execute-goal run for <phase>/<task>.
   Worktree: <worktree> on exec/<phase>-<task>-<NN>, base <claim sha>. Goal branch: <goal branch>.
   Ports: OSR_E2E_DEV_PORT=<B>, OSR_E2E_PREVIEW_PORT=<B+1>, dev server <B+2>.
   Do not ask the user; put questions in your report. Do not push.
   ```

If the host cannot start sessions in another folder, ask the user once. The recommended choice is to continue with `--sequential` here. The alternative is to launch the workers themselves: claim and create the worktrees, print one `/execute-goal <goal> --worker <NN>` command per worktree, and stop. Rerunning the coordinator then reconciles and integrates their branches.

## Worker report

A worker ends every turn with:

```text
EXECUTE-GOAL WORKER REPORT
goal: docs/plan/<phase>/<task>/goal.md
subtask: <NN>
result: committed | blocked | question | scope-request
commit: <sha or —>
base: <sha>
files: <changed paths>
checks: <commands and results>
rubber-duck: <disposition>
docs: <proposed STATUS, tasks.md or 执行记录 changes, or none>
detail: <blocker with resume condition, question with options, or requested paths; otherwise none>
```

| Result | Coordinator action |
|---|---|
| `committed` | Integrate. |
| `question` | Answer it yourself when the evidence sources settle it, including a Computer Use run of the original game ([original evidence](../../../../docs/guides/original-evidence.md)), and send the answer with `send_message`. Otherwise ask the user one question with the worker's options and relay the answer the same way. |
| `scope-request` | If the paths overlap no other `in-progress`, `blocked` or claimed row's scope: add them to the row's `写入范围` on the goal branch, commit that document alone ([Write scopes](#write-scopes)), rerun the router, then tell the worker to continue. Otherwise wait until the overlapping row is integrated, then do the same and tell the worker to rebase first. The worker never edits its own `写入范围`. |
| `blocked` | Set the row to `blocked`, add the execution record from SKILL.md, and commit only `goal.md`. Keep the worktree and branch. |

If a worker session fails or stops responding, inspect its worktree, then start a new worker session in the same worktree.

## Integrate

Integrate one worker at a time, in the order reports arrive, in the coordinator checkout. Start with nothing staged and no dirty path other than the recorded baseline.

1. **Check the branch.** `git log <goal branch>..exec/<…>` must contain exactly one commit. The worker worktree must be clean. Changed paths must stay inside the row's scope as recorded on the goal branch, plus its own document, and must not include coordinator-owned documents. Otherwise send the worker back.
2. **Apply.** Run `git cherry-pick --no-commit <sha>`. On conflict, undo it with `git reset --merge`; `cherry-pick --abort` does not work after `--no-commit`. Then ask the worker to rebase onto the goal branch, resolve the conflict inside its scope, rerun its checks and report the new commit. Never resolve a worker's conflict in the coordinator checkout.
3. **Update the tracker.** Set the row to `completed` and update `goal.md`'s `updated:`. Apply that subtask's accepted proposals to the coordinator-owned documents.
4. **Validate the integrated tree.**
   - Run `pnpm check` for TypeScript/app changes; documentation-only changes get link and metadata checks.
   - If another subtask was integrated after the worker's base, also rerun the focused checks recorded in this subtask's evidence.
   - On failure, restore only the paths this integration touched (`git restore --source=HEAD --staged --worktree -- <paths>`). Then send the failure to the worker to rebase, fix and report again. If the failure comes from a baseline path rather than the integrated commit, do not send it to the worker; stop integrating and ask the user.
5. **Commit.** Run `git commit -C <sha> --trailer "Worker-Commit: <sha>"`. This reuses the worker's message and trailer and records which worker commit was integrated, for reconciliation. Verify that the commit exists and that the coordinator checkout has no dirty path other than the baseline.
6. **Clean up.** Run `git worktree remove <worktree>` without `--force`, then `git branch -D exec/<…>`. If removal is refused, keep both and report it. Leave the worker session as history.

## Worker mode

`--worker NN` runs one claimed subtask and nothing else.

Preflight:

- The current branch is `exec/<phase>-<task>-<NN>` in a linked worktree.
- Row NN is `in-progress` in this checkout's `goal.md`, and its dependencies are `completed`.
- Install dependencies with `pnpm install --frozen-lockfile` when `node_modules` is missing. Link `local` as in [Dispatch](#dispatch) if the worktree does not have it yet; every worktree links it ([engineering conventions](../../../../docs/engineering/README.md#环境)).
- Use the assigned ports. Without assigned ports, derive them from the [Names](#names) formula.

Rules:

- Follow the [subtask procedure](./subtask-procedure.md) for NN only, committing as a worker.
- Never edit coordinator-owned documents. Never touch other branches or worktrees. Never push, merge, or remove your own worktree.
- Stay inside the write scope; outside it, send a `scope-request` and wait.
- Do not ask the user. Settle original-game facts yourself ([original evidence](../../../../docs/guides/original-evidence.md)), except Computer Use runs of the baseline environment, which the coordinator performs. Report a `question` for a decision, a needed Computer Use observation, or a fact those sources could not settle, saying what you tried. Then wait for the coordinator's message.
- Stop servers and browsers you started before reporting.
- After reporting, wait for follow-up messages (rebase, fix, scope answer) and handle them in the same worktree.

## Cleanup

- Remove each worker worktree and branch right after its integration commit is verified.
- Keep blocked or questioned workers' worktrees until the row is resumed or the user abandons it.
- Never use `--force`, delete a branch with unintegrated commits, or delete a dirty worktree without the user's explicit confirmation.
- At goal completion, no `exec/<phase>-<task>-*` branch or worktree remains. Run `git worktree prune`. Every server, browser and port opened by the coordinator or by workers is closed.
- Leave the coordinator checkout and the goal branch in place; pushing or merging them is the user's decision.
