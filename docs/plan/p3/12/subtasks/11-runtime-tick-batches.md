---
type: plan
status: active
phase: P3
task: "12"
subtask: "11"
updated: 2026-10-17
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
- `src/app/mission/dev-frame-timing.test.ts`、`src/ui/game/game-ui.test-support.ts`：测试替身补 `FrameReport.outputs`。
- `docs/engineering/modules/app.md`：帧后批次标为已实现。

## 验收标准

- [x] AC-01（Runtime 部分）：0、1、5 tick 帧与折叠帧的批次正确；故障时不交付，容量停止只交付成功前缀；领域事件不重复发布。
- [x] `pnpm exec vitest run src/app/runtime src/app/session` 通过。

## 验证方法

- 上列 Node 测试，用 `ControlledHost` 驱动帧。

## 完成证据

- **实现（2026-10-17，按已批准的 [P3-04 帧后逐 tick 输出](../../04/spec.md#帧后逐-tick-输出p3-12-的修订) 与 P3-02 FS-06）：** [game-runtime.ts](../../../../../src/app/runtime/game-runtime.ts) 的 `FrameReport.outputs: readonly TickOutput[]`（`TickOutput { tick, clock, render, events }`，`TickEvent` 即总线的 `PendingDelivery { event, commandId }`）。`#tick` 在 step、projection 与 Render State 全部成功后才追加该 tick 的冻结输出；帧把 `outputs` 展平后整批交给 Event Bus（不另建派发列表，事件不重发），`ticks` 即 `outputs.length`。Runtime 不在返回的报告之外保留 `outputs`。会话不改逻辑，`GameSessionFrame.report` 原样带出（注释更新）；静止帧仍为 null。
- **测试：** 新增 [game-runtime-outputs.test.ts](../../../../../src/app/runtime/game-runtime-outputs.test.ts)：0、1、5 tick 与 `capped` 帧逐 tick 升序连续、`tick`/`clock` 等于 `render` 的字段、最后两项 `render` 即 `renderFrame()` 的 current/previous、全部冻结、与 Event Bus 派发的同一事件对象与 `commandId`（提交命令带 ID、自动开火与其他事件为 null）且次数相同、前一帧报告不变也不重复。[game-runtime-transition.test.ts](../../../../../src/app/runtime/game-runtime-transition.test.ts)：衔接截断的输出到衔接 tick 为止、末事件为 `transition`、与派发一致，屏障解除后 0 tick 帧为空、下一帧从 tick 4 起。[game-runtime-fault.test.ts](../../../../../src/app/runtime/game-runtime-fault.test.ts)：容量停止只交出 tick 1–2 的前缀且与派发一致；中间 tick 的 `render` 就是该次提取的对象；Core/读模型故障与 `listener-failed` 沿用抛错（无报告），监听器失败后的下一帧只含自身 tick。会话：[game-session-consumers.test.ts](../../../../../src/app/session/game-session-consumers.test.ts) 验证帧消费者在全部领域事件之后收到同一对象的 `outputs`，暂停的静止帧为 null，恢复的 0 tick 帧为空，跨运行 `runId` 1/2 各自从 tick 1 起；[game-session-fault.test.ts](../../../../../src/app/session/game-session-fault.test.ts) 验证第二 tick 的 Render State 提取故障时没有任何帧、第一 tick 的输出也不交付，容量停止帧的报告输出为 `[1, 2]`。帧内重入拒绝沿用 [game-runtime.test.ts](../../../../../src/app/runtime/game-runtime.test.ts) 的既有测试。既有测试只在报告字面量中补 `outputs`。
- **检查：** `pnpm exec vitest run src/app/runtime src/app/session src/app/mission/dev-frame-timing.test.ts src/ui/game` 33 文件 623 项通过；`pnpm check` 通过（340 文件 10087 项，构建成功）。此前一次 `pnpm check` 在机器负载约 108 时有 9 项无关超时（compliance、e2e 配置、mission-eligibility），单独重跑全部通过，随后完整重跑通过。
- **rubber-duck：** 无阻断问题；两项测试缺口（中间 tick 的 Render State 身份、截断与容量停止前缀的逐事件比对）已补测试（`deliveriesOf`/`expectSameDeliveries` 放在 [game-runtime.test-support.ts](../../../../../src/app/runtime/game-runtime.test-support.ts)）。simplify：`TickEvent` 改为总线 `PendingDelivery` 的别名，测试复用该类型；未采纳去掉 `tick`/`clock`/冻结（契约要求）与改写 `flatMap`（每帧至多 5 个小数组，以 `outputs` 为唯一来源更清楚）。
- **文档影响：** [app.md](../../../../engineering/modules/app.md) 的帧返回值、帧后逐 tick 输出与运行句柄条目改为已实现（经协调者批准扩大写入范围）；测试替身 [dev-frame-timing.test.ts](../../../../../src/app/mission/dev-frame-timing.test.ts) 与 [game-ui.test-support.ts](../../../../../src/ui/game/game-ui.test-support.ts) 补 `outputs: []`。其他工程约定、指南、原版事实与 STATUS 无需更新。
