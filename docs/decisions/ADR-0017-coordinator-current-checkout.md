---
id: ADR-0017
type: adr
status: accepted
phase: all
updated: 2026-10-07
related: [ADR-0013, ADR-0016]
---

# ADR-0017：goal 协调者在当前 checkout 中运行

## 背景

[ADR-0016](./ADR-0016-parallel-goal-execution.md) 要求并行执行的协调者在非基础分支的专用 goal worktree 中运行。当前 checkout 不满足时，协调者先把会话移入新 worktree，或新建 `goal/<phase>-<task>` worktree 并请用户在那里重新调用。

用户希望直接在调用 execute-goal 的 checkout 中协调：主 worktree，或用户自己创建的 worktree。认领在当前 checkout 中进行，只有执行 subtask 的 worker 才新建 worktree。专用 goal worktree 让启动多出一步，完成后还留下一个需要另行合并和清理的分支。

本记录取代 ADR-0016；除下述协调者工作区的变化外，ADR-0016 的其余决定继续有效。

## 决定

- **协调者使用当前 checkout。** 协调者在调用所在的 checkout 中运行，分支可以是基础分支，不再为自己创建、切换或移入其他 worktree。当前分支即 goal 分支；认领、写入范围、阻塞记录和集成都作为本地提交落在该分支上。
- **worker 仍使用新 worktree。** 每个 subtask 仍由 worker 在新建的 worktree 和 `exec/<phase>-<task>-NN` 分支中执行，从认领提交创建；集成与清理规则不变。
- **当前 checkout 的前提。** 首次认领前检查：
  - HEAD 在分支上，不是 detached，也不是 `exec/` worker 分支。
  - 未提交的修改只能是本 goal 尚未提交的已批准计划文档、某个 `in-progress` 行留下的部分工作，或与本 goal 无关的用户修改。
  - 无关的用户修改必须未暂存，且位于本 goal 目录、协调者独有文档和各行写入范围之外。它们作为基线保留，协调者不暂存、还原、stash、reset 或提交。

  不满足时报告相关路径并询问用户，可改用 `--sequential`。每次协调者提交和集成前重新检查。
- **一个 goal 只由一个分支协调。** 其他本地分支上有触及该 goal `goal.md`、但不在 HEAD 中的提交时（例如旧流程留下的 goal worktree），先报告并询问用户，再在当前 checkout 认领。
- **不 push、不合并。** execute-goal 不 push 当前分支，也不把它合入其他分支；完成后由用户决定 push 或合并。

## 考虑过的其他方案

- **保留专用 goal worktree：** 启动需要多一步，还要另行合并和清理 goal 分支；用户明确要求使用当前 checkout。
- **只允许在用户创建的 worktree 中协调，拒绝主 worktree：** 用户明确要求主 worktree 也可以作为协调者工作区。
- **要求当前 checkout 完全干净：** 与 `--sequential` 记录基线、保留用户修改的做法不一致，会因无关草稿而无法启动。限制无关修改必须未暂存且不在本 goal 的路径中，已足以让认领提交、cherry-pick 和恢复操作不触及它们。

## 后果

- 在基础分支上调用时，认领与集成提交直接进入基础分支的本地历史，push 仍由用户决定。
- 无关修改留在协调者 checkout 中时，集成后的检查会包含它们。检查失败若来自这些基线路径，不退回 worker，而是询问用户。
- 用户在同一 checkout 中继续编辑会与协调者的提交交错；协调者在每次提交前复查暂存区和基线，出现新冲突时暂停询问。
- 按旧流程创建、仍在执行的 goal worktree 属于用户已有的 worktree，可以在其中继续调用；在其他分支调用同一 goal 会先被询问。
