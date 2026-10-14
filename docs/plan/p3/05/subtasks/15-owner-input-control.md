---
type: plan
status: active
phase: P3
task: "05"
subtask: "15"
updated: 2026-10-10
---

# 15 — 任务所有者的输入控制端口

**契约来源：** [spec](../spec.md) 的[生命周期与资源](../spec.md#生命周期与资源)“输入控制端口”、[会话控制键](../spec.md#会话控制键)、[清键与恢复](../spec.md#清键与恢复)、[数据模型与契约](../spec.md#数据模型与契约)的“输入控制端口”行；S-07、S-10、S-14 的所有者部分；AC-09、AC-13、AC-16 的所有者部分。
**依赖：** 09。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 扩展 [mission-owner.ts](../../../../../src/app/mission/mission-owner.ts)：所有者只向 `input` 阶段的消费者提供输入控制端口，含 `clearInput(reason: 'focus-loss' | 'pointer-lock-exit')`、`togglePause()`、`openMenu()`，运行相关调用绑定当前 runId（形状由实现决定，例如按运行取得的端口）。
- **语义：** `clearInput` 在会话 running 时向会话发送一次 `clear-input`；`togglePause` 在 running 时以原因 user 暂停，在因 user 或 hidden 暂停且任务菜单未打开时继续（hidden 未解除时继续失败仍保持暂停），任务菜单打开、出发占位、停止或故障时无作用；`openMenu` 沿用所有者现有的打开条件与反馈。都经所有者现有动作执行，不旁路菜单状态，不暴露 start/exit/step。
- **边界：** 旧 owner/run 的调用以既有 `GameSessionError` 的 `invalid-state` 拒绝，不迁移到新运行；在会话状态通知中调用时按既有通知边界拒绝或延后，不递归；所有者释放后端口失效。
- Node 测试（真实所有者与会话、受控宿主）：各状态下三个动作的结果、旧身份拒绝、通知中调用、释放顺序（`input` 最先失效）。

## 不包含

- 输入消费者对端口的调用（20）；焦点转移（23、25）。

## 关键文件与契约

- [mission-owner.ts](../../../../../src/app/mission/mission-owner.ts)（`MissionOwnerContext`、`MissionOwnerConsumer`、`pause`/`resume`/`openMenu`/`continueFromMenu`）、[game-session.ts](../../../../../src/app/session/game-session.ts)（`clear-input`、通知边界）、[mission.test-support.ts](../../../../../src/app/mission/mission.test-support.ts)。
- 修订后的 [P3-04 spec](../../04/spec.md)（09）。

## 写入范围

- `src/app/mission/mission-owner.ts`
- `src/app/mission/mission-owner.test.ts`、`src/app/mission/mission-owner-ownership.test.ts`、`src/app/mission/mission-owner-input.test.ts`（计划新增）
- `src/app/mission/mission.test-support.ts`

## 验收标准

- [x] 只有 `input` 阶段的消费者得到端口；三个动作在各会话/流程状态下的结果符合契约，含 hidden 未解除时继续失败仍暂停。
- [x] 旧 owner/run 调用以 `invalid-state` 拒绝；通知中不递归；释放后失效。
- [x] `pnpm exec vitest run src/app/mission` 通过；按 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 检查本项改动；`pnpm typecheck` 与 `pnpm lint` 通过。

## 验证方法

- 真实所有者与会话的 Node 测试；浏览器中的 `p`/Esc 由 28 验证。

## 完成证据

- **实现（[mission-owner.ts](../../../../../src/app/mission/mission-owner.ts)）：** `MissionOwnerConsumer<S>` 按阶段决定 `connect` 的参数：`input` 阶段为 `MissionInputContext`（所有者上下文加 `control`），其他阶段仍为不含端口的 `MissionOwnerContext`；默认类型参数保持现有调用方（含 `dev-frame-timing.test.ts` 的 `connect({} as MissionOwnerContext)`）不变。`control.forRun(runId)` 返回冻结的运行端口 `{ clearInput, togglePause, openMenu }`，不含 start/exit/step。每次调用先经守卫：所有者已开始释放（`#released` 在释放第一步之前设置）或 `runId` 不是会话当前运行时抛既有 `GameSessionError` 的 `invalid-state`，不改变任何状态。`clearInput` 先校验原因（`invalid-argument`，路径 `clearInput.reason`），会话 running 时发一次 `clear-input`，其他阶段不发（会话已自行清除；stopped/faulted 时会话本会拒绝）；它不是所有者动作，会话在状态与取消通知中的拒绝、帧中的排队照原样适用。`togglePause` 在 running 时调用所有者的 `pause`，否则调用 `resume`，两者只在 flight 生效，所以任务菜单、出发占位与结束的运行不受影响，hidden 未解除时的继续失败留在 `actionError`（`resume`）并保持暂停。`openMenu` 直接调用所有者的 `openMenu`。
- **通知边界：** 所有者把交给会话的宿主包一层，帧回调与页面生命周期回调在 `#within` 中运行，端口自己的 `clear-input` 也是；`togglePause`/`openMenu` 作为意图在所有者执行其他意图（`#acting`）或这些回调期间以 `invalid-state`（`unavailable during a session notification or another intent`）拒绝，不改变状态。这样状态通知、帧、取消通知中都不会递归控制，也不会出现帧中 `openMenu` 只排队暂停却不进菜单、或 hidden 静止帧中排队的继续被拒绝后绕过 `actionError` 的情况。`forRun` 在这些回调中仍可用（P3-04 允许在状态观察中为新运行接线）。
- **Node 测试（[mission-owner-input.test.ts](../../../../../src/app/mission/mission-owner-input.test.ts)，14 项，真实所有者、会话与 ControlledHost）：** 只有 `input` 消费者的上下文有 `control`，`ui`/`media` 没有，端口与运行端口冻结且只有所列方法；`togglePause` 在出发占位无作用、running↔user 暂停切换、hidden 与 user 暂停在页面仍隐藏时继续失败（`actionError` 为 `resume`）并保持暂停、可见后继续；出发期间隐藏（`resumeRequired`）以及隐藏后又可见再结束出发时都必须显式继续；`openMenu` 与所有者相同（running 先暂停，hidden 暂停保留原因），菜单中两个动作都不改变快照对象；faulted 与 stopped（与 [mission-owner-stopped.test.ts](../../../../../src/app/mission/mission-owner-stopped.test.ts) 相同的录制拒绝注入）中三个调用都返回且快照不变；`clearInput` 两种原因各发一次（取消通知、不暂停、下一 tick 输入为中性），held/paused 时无动作，非法原因被拒绝；restart 后旧运行端口与 `forRun(1)` 以 `invalid-state`（phase idle、runId null）拒绝，新运行不受影响；清理失败的 restart 留下的结束运行同样拒绝；槽位打开下一所有者后旧端口一律以 released 拒绝，新所有者的 run 1 不受影响；状态通知中意图被拒绝、`clearInput` 在 running 时由会话拒绝、其他阶段无动作；帧回调中的 `clearInput` 在帧通知结束后才取消其提交的命令，帧、`clear-input` 取消、hidden 取消与 hidden 静止帧中的意图都被拒绝，最终无 `actionError`、无会话错误；释放时计时器撤销（释放的第二步，会话仍为 transition）、`input` 释放、运行清理与 `ui` 释放中三个调用都以 released 拒绝。测试支持新增 `inputProbe()`（[mission.test-support.ts](../../../../../src/app/mission/mission.test-support.ts)）。
- **可证伪性：** 分别去掉帧或生命周期回调的标记、去掉 `#acting` 拒绝、去掉 `clear-input` 的标记、把 `clearInput` 当意图拒绝、把 `forRun` 当意图拒绝、把输入上下文交给所有消费者、在任何阶段发送 `clear-input`、去掉 released 判断、以原始会话控制在菜单中切换暂停，相应测试都会失败（每次改动后恢复原文件）。
- **检查：** `pnpm exec vitest run src/app/mission`：8 个文件 107 项通过；另跑 `src/app/mission src/ui/dev src/app/composition` 15 个文件 175 项通过；`pnpm typecheck`、`pnpm lint` 通过；`pnpm check` 通过（228 个文件 6875 项，build 成功，本次没有超时）。
- **Rubber-duck：** 指出帧与取消通知中的意图会绕过所有者语义（帧中 `openMenu` 只排队暂停、hidden 静止帧中排队的继续被拒绝后不进 `actionError`），已改为上面的宿主回调标记并补测试；释放顺序测试改为在计时器撤销这一步观察；补了出发期间隐藏与清理失败的结束运行两项测试。
- **Simplify：** 内联 `togglePause`（用守卫返回的阶段，去掉重复的 `#ready` 与第二次 `status()`），`inputProbe` 不再保存全部运行端口，测试共用一份操作列表。未采纳：改成判别联合类型（会破坏不在写入范围内的 `dev-frame-timing.test.ts`）；共用会话的原因列表或由会话提供“是否在边界内”的读取（都要改 `game-session.ts`，不在写入范围内；当前行为已满足契约）；每帧少一个闭包（影响可忽略）。
- **文档影响：** [app 模块说明](../../../../engineering/modules/app.md)“任务所有者”的“消费者”条目需补充输入控制端口，属于 32 的写入范围，已在交接报告中给出建议文字。其他文档无需改动：键位文档与 spec 描述的行为不变，P3-04 spec 已由 09 修订。
