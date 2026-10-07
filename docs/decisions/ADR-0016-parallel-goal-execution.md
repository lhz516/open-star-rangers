---
id: ADR-0016
type: adr
status: accepted
phase: all
updated: 2026-10-06
related: [ADR-0013, ADR-0014]
---

# ADR-0016：goal 默认由协调者并行执行

## 背景

[execute-goal](../../.agents/skills/execute-goal/SKILL.md) 原本在单个会话中按编号顺序逐个实现 subtask。很多 goal 的依赖图里有同时就绪、彼此独立的子任务，例如 P2-11 中 12、13、14、16 同时就绪，但它们只能排队执行。

P2-11 曾手工把 08、15 放到独立分支上并行，再合并回来。每次合并都要手工解决 `goal.md` tracker 和 `docs/STATUS.md` 的冲突：每个分支都改了同一张状态表和 `updated:` 行。

[ADR-0013](./ADR-0013-task-graph-orchestration.md) 的约束继续有效：图状态只在任务文档中，下一步由 [tools/task-state.ts](../../tools/task-state.ts) 确定性计算，不由模型判断。

## 决定

- **默认并行。** `/execute-goal` 默认作为协调者运行，最多同时有 3 个 worker 会话，可用 `--parallel N` 修改上限。`--sequential`（原单会话行为）和 `--worker NN`（只执行一个已认领的子任务）必须显式指定。
- **专用 goal worktree。** 协调者在非基础分支的链接 worktree 中运行。该分支即 goal 分支，完成后由用户合并，execute-goal 不 push，也不合入基础分支。
- **一个子任务一个 worker。** 每个 worker 使用自己的 worktree（`<主仓库>.worktrees/exec-<phase>-<task>-NN`）、分支（`exec/<phase>-<task>-NN`）和会话。分支存在即表示该行已被认领。
- **状态只由协调者写。** 只有协调者修改以下内容：
  - `goal.md`（tracker、执行记录、审批）、阶段 `tasks.md` 与 `docs/STATUS.md`。
  - 各 subtask 的执行方式和写入范围。

  worker 只改自己写入范围内的文件，以及自己 subtask 文档的验收勾选与完成证据；对其他文档的修改以建议形式交给协调者。
- **认领单独提交。** 协调者把要分派的行和自己即将执行的行改为 `in-progress`，只提交 `goal.md`，再从这个提交创建 worker 分支。认领因此会持久保存，路由器和 worker 都能看到。尚未提交的已批准计划文档在第一次认领前单独提交。
- **按写入范围分波。** subtask 文档新增 `**执行方式：**`（`自动`/`需用户`）和 `## 写入范围`（路径或 glob）。路由器在 `execute-goal` 节点输出 `schedule`，按以下规则确定可以同时运行的子任务：
  - 依赖已完成，写入范围与已选行、`in-progress` 行、`blocked` 行都不重叠，编号小的优先。
  - 缺少写入范围的行与所有行冲突。
  - 需用户的行和最终对齐由协调者自己执行，同样参与重叠检查。
  - 重叠判断有意保守，误判只会让工作串行。
- **串行集成并重新验证。** 每个 worker 在自己的分支上产生一个本地提交。协调者逐个集成：
  1. `cherry-pick --no-commit`，同时把该行标为 `completed`。
  2. 在集成后的代码上运行检查；冲突或失败时退回 worker，由它变基修复。
  3. 用 worker 的提交说明提交，并附 `Worker-Commit` trailer，保持一个子任务一个提交。
  4. 删除该 worker 的 worktree 与分支。
- **从文档与 git 状态恢复。** 每次启动都把 tracker 与 `exec/` 分支、worktree、worker 会话对照，按固定规则处理：集成已完成的、等待运行中的、在原 worktree 重启中断的 worker、重新考虑阻塞、清理残留（以 `Worker-Commit` trailer 判断是否已集成）。这同样适用于执行到一半的旧 goal。旧 goal 没有写入范围时，由协调者从现有计划补写并单独提交，不改变契约。

## 考虑过的其他方案

- **在 worker 分支上直接修改 tracker 再合并：** P2-11 的手工并行已证明 tracker 和 `updated:` 行每次都会冲突。
- **用 subagent 代替独立会话：** subagent 与主会话共用工作目录，并发写文件、`pnpm check` 和 Playwright 端口会互相干扰。
- **另设编排状态文件记录认领：** 会产生第二份需要同步的状态，违反 ADR-0013。
- **由模型临场判断哪些子任务可以并行：** 无法测试，也无法复现；写入范围加上确定性的路由器可以测试。
- **merge 提交集成：** 每个子任务会多出一个合并提交，而且 tracker 更新与实现不在同一提交中。

## 后果

- 依赖图越宽，执行越快。worker 数受本机 CPU 与浏览器资源限制，默认 3。
- 每个子任务的提交在历史中仍是线性且聚焦的；另外多出认领提交和写入范围补写提交。
- 生成 goal 时必须写出写入范围和执行方式。路由器会校验写入范围格式，并拒绝自动执行行写协调者独有的文档。
- 每个 worker 按子任务编号使用独立端口（`5100 + 3 × NN` 起），并链接共享的 `local/`。
- `--sequential` 保留原行为，但不会接手已被 worker 认领的行。
