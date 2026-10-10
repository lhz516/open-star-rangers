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

- [ ] 只有 `input` 阶段的消费者得到端口；三个动作在各会话/流程状态下的结果符合契约，含 hidden 未解除时继续失败仍暂停。
- [ ] 旧 owner/run 调用以 `invalid-state` 拒绝；通知中不递归；释放后失效。
- [ ] `pnpm exec vitest run src/app/mission` 通过；按 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 检查本项改动；`pnpm typecheck` 与 `pnpm lint` 通过。

## 验证方法

- 真实所有者与会话的 Node 测试；浏览器中的 `p`/Esc 由 28 验证。

## 完成证据
