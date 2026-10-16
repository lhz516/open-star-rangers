---
type: plan
status: active
phase: P3
task: "12"
subtask: "11"
updated: 2026-10-15
---

# 11 — Runtime 帧后逐 tick 批次

**契约来源：** [spec](../spec.md) 的 S-01、AC-01；[共享契约修订（D-01）](../spec.md#共享契约修订d-01) 的“帧后批次”与“投递与故障”。
**依赖：** 09。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 按 09 定稿，在 Runtime 中为本帧每个成功 tick 缓存 `{ tick, clock, render, events }`，至多 `MAX_TICKS_PER_FRAME` 份；Session 在帧结束、Domain Event Bus 投递之后交付给帧消费者。
- 保留现有顺序“全部模拟 → Domain Event Bus → 帧消费者”；事件不重发到 Event Bus；不添加 tick 中途回调；不保留无界历史。
- 故障语义：Core 或读模型提取失败时本帧批次不交付；录制容量停止只交付已成功的前缀，之后折叠通知为空；监听器异常沿用会话故障。0 tick 帧与折叠帧的批次为空。
- 测试：0、1、5 tick 帧，折叠帧，故障前缀，容量停止，帧内重入拒绝；既有 Runtime 与 Session 测试不变地通过。

## 不包含

- Core 字段（10）。
- 表现模块对批次的消费（12）。

## 关键文件与契约

- 现有：[game-runtime.ts](../../../../../src/app/runtime/game-runtime.ts)、[game-session.ts](../../../../../src/app/session/game-session.ts) 的 `#notifyFrame` 与 `GameSessionFrame`；测试支持 [session-host.test-support.ts](../../../../../src/app/session/session-host.test-support.ts)。

## 写入范围

- `src/app/runtime/**`：逐 tick 缓存与读取（不含 10 改动的 `game-event-bus.ts` 的事件表）。
- `src/app/session/**`：帧后交付与故障语义。

## 验收标准

- [ ] AC-01（Runtime 部分）：0、1、5 tick 帧与折叠帧的批次正确；故障时不交付，容量停止只交付成功前缀；领域事件不重复发布。
- [ ] `pnpm exec vitest run src/app/runtime src/app/session` 通过。

## 验证方法

- 上列 Node 测试，用 `ControlledHost` 驱动帧。

## 完成证据
