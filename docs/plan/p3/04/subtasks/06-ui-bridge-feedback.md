---
type: plan
status: active
phase: P3
task: "04"
subtask: "06"
updated: 2026-10-09
---

# 06 — UI 桥接与命令反馈

**契约来源：** [spec](../spec.md) 的 S-06 与 [UI 桥接与命令反馈](../spec.md#ui-桥接与命令反馈)；AC-11。
**依赖：** 03。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 计划新增 `src/ui/game/game-store.ts`：Zustand vanilla store，React 只拿到只读 reader；状态冻结，每次转换单次原子写入。内容：会话状态、projection 采样、任务流程位置、待确认命令与最近结果（最多 10 个）、操作错误。
- 计划新增 `src/ui/game/game-session-bridge.ts`：按 ownerId 与 runId 绑定当前运行：
  - 会话状态、新运行、暂停/保持/停止的静止边界立即写入；
  - projection 在帧通知中按 100 ms 采样，以 ownerId/runId/tick 去重，不另开定时器；
  - `mission.status`、`result` 分区的就绪与内容、`player.interactionContext`、各分区 readiness 的语义变化在本帧结束立即写入（比较语义字段，不比较每 tick 新建的对象引用）；
  - 注入时钟必须有限且不倒退，读取失败作为 consumer 故障抛出（沿用 P1-06 的附着与延迟报告规则）；
  - 附着事务化：运行级登记全部成功才写入状态，失败逆序撤销，撤销失败为 `RollbackError`。
- 计划新增 `src/ui/game/game-command-feedback.ts`：拿到 commandId 后才记 pending；按 ownerId/runId/commandId 匹配本消费者的 `command-result`，保留 outcome 与 reason；结果与帧末最新 projection 同次写入；取消按会话原因结算；故障中结果不明者记 unconfirmed；未知、重复、他人 ID 或 null 不产生结果；不自动重提；运行结束清空。
- 计划新增 `src/ui/game/use-game.ts`：`useStore(reader, selector)` 的 React 订阅 hook。
- 随实现编写 Node 测试，使用 03 的真实会话与合成任务；Core 尚未实现的 accepted/ignored 分支用类型化的通知替身验证，不修改 Core 规则。

## 不包含

- React 页面与接线（09）；开发诊断（07）；Classic 飞行 HUD（P3-13，不经 store）。
- 合成 `ui/game/synthetic-*` 的删除（13）。

## 关键文件与契约

- 计划新增：`src/ui/game/game-store.ts`、`game-session-bridge.ts`、`game-command-feedback.ts`、`use-game.ts` 及相邻测试。
- 参照：[synthetic-game-store.ts](../../../../../src/ui/game/synthetic-game-store.ts)、[synthetic-session-bridge.ts](../../../../../src/ui/game/synthetic-session-bridge.ts)、[synthetic-command-feedback.ts](../../../../../src/ui/game/synthetic-command-feedback.ts)（P1-06 的附着与反馈语义）。
- 只读消费：[projection.ts](../../../../../src/core/projections/projection.ts)、[domain-events.ts](../../../../../src/core/contracts/domain-events.ts)、03 的会话类型。

## 写入范围

- `src/ui/game/game-*.ts`：计划新增的 store、桥接、反馈与测试。
- `src/ui/game/use-game.ts`：计划新增的 React hook。

## 验收标准

- [ ] AC-11：projection 在 99/100 ms 边界采样且去重；新对象但语义未变不触发即时发布；规定的关键变化、状态与命令结果即时发布。
- [ ] AC-11：pending → accepted/rejected/ignored/cancelled/unconfirmed；重复、未知、null ID 与同 ID 的新 owner/run 正确隔离；最近结果最多 10 个；读时钟失败成为 consumer 故障。
- [ ] 附着回滚、旧运行通知不写入、运行结束清空 pending。
- [ ] `pnpm exec vitest run src/ui/game` 与 `pnpm check` 通过。

## 验证方法

- Node：可控时钟、`ControlledHost`、真实会话与合成任务；通知替身覆盖 Core 尚未产生的结果分支。
- 浏览器中的呈现由 10 验证；不适用原版对照。

## 完成证据
