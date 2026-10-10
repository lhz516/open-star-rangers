---
type: plan
status: active
phase: P3
task: "04"
subtask: "02"
updated: 2026-10-09
---

# 02 — 正式 Runtime

**契约来源：** [spec](../spec.md) 的 S-01，[Runtime](../spec.md#runtime) 与[失败帧与录制容量](../spec.md#失败帧与录制容量)；AC-01、AC-02、AC-03（Runtime 部分）、AC-06（Runtime 部分）。
**依赖：** 无。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 计划新增 `src/app/runtime/game-runtime.ts` 与 `game-event-bus.ts`：每个运行一份，由运行规格中的三份逻辑 Asset、`ContentIdentity`、`{ rawDifficulty, wingman, seed }` 与可选 `RecordingOptions` 创建（有录制用 `createRecordingSession`，否则 `createWorld`）；Core 创建错误原样抛出，不创建 Runtime。不接受既有 `World` 或任何处理器。
- 时间：只接受 Core 默认步长，频率由有效单位数推出（32 Hz），复用 [fixed-step-clock.ts](../../../../../src/app/runtime/fixed-step-clock.ts)；首帧锚定，每帧至多 5 tick，触顶 alpha 为 0，余量丢弃；非有限、倒退、换算溢出拒绝。
- 意图 `{ axes: { pitch, yaw, roll }, primaryFire }`：轴值经公开 `readTickInput` 的规则校验与规范化；按住开火每 tick 一个 `{ type: 'fire', channel: 'primary' }`，短按标记在成功 step 后清除，0 tick 帧不消耗。
- 命令队列：经 `readTickInput` 的单命令校验存入规范副本；上限 256，满时以 `command-queue-full` 同步拒绝；commandId 从 1 递增至 `Number.MAX_SAFE_INTEGER - 1`，耗尽为不可恢复故障；非法提交不改队列、意图或 ID。
- 每 tick 批次：自动开火在前，再 FIFO 取队列，合计不超过 `CORE_LIMITS.commandsPerTick`，余项顺延；成功 step 才确认消耗；每个 tick 独立的 `commandIndex → commandId` 映射。
- 帧后事件：本帧模拟结束后按 tick 与发出次序分发冻结事件与 `{ commandId: number | null }`；接收者批次固定、新订阅下一批生效、取消立即生效；监听器同步；抛错继续其余接收者并报告 `listener-failed`，不回滚。
- 读模型：创建时与每个成功 step 后同 tick 原子取得 projection 与 Render State；`renderFrame()` 返回 `{ previous, current, alpha }`，`projection()` 两次提交之间对象身份不变；任一读取失败不混合两组；`snapshot()` 按需读取。
- 生命周期操作：重新锚定、清意图（返回 FIFO 未执行 ID）、折叠两帧、清订阅；批次内调用拒绝；不改 Core、RNG、实体 ID 或录制。
- 失败帧：按 spec 的失败表实现 Core 故障、Runtime 内部异常与非录制 `CoreInputError`、录制容量停止（只拒绝该 tick，此前成功 tick 的事件仍分发，帧报告带 `stop: 'recording-capacity'`）与监听器失败；向会话报告哪些 commandId 确定未执行、哪些执行结果不明。故障后不提供新的快照或导出；容量停止可导出。
- 按需扩展 [runtime-errors.ts](../../../../../src/app/runtime/runtime-errors.ts) 的错误种类（如队列已满、录制容量停止），不改变合成 Runtime 对现有种类的行为。
- 随实现编写 Node 测试，使用真实正式 Core 与 [create-world.test-support.ts](../../../../../src/core/world/create-world.test-support.ts) 的合成任务。

## 不包含

- 会话、帧调度、可见性与控制通道（03）；平台端口（04）；任务流程（05）。
- 合成 Runtime 的删除（13）。

## 关键文件与契约

- 计划新增：`src/app/runtime/game-runtime.ts`、`src/app/runtime/game-event-bus.ts` 及相邻测试。
- [fixed-step-clock.ts](../../../../../src/app/runtime/fixed-step-clock.ts)：复用；如需按单位数构造，增量扩展并保持合成 Runtime 的用法。
- [runtime-errors.ts](../../../../../src/app/runtime/runtime-errors.ts)：增量扩展。
- 只读消费：[tick-input.ts](../../../../../src/core/contracts/tick-input.ts)、[limits.ts](../../../../../src/core/contracts/limits.ts)、[recording.ts](../../../../../src/core/replay/recording.ts)、[world.ts](../../../../../src/core/world/world.ts)、[domain-events.ts](../../../../../src/core/contracts/domain-events.ts)。

## 写入范围

- `src/app/runtime/game-*.ts`：计划新增的 Runtime、事件总线与测试。
- `src/app/runtime/runtime-errors.ts`：错误种类扩展。
- `src/app/runtime/runtime-errors.test.ts`：对应测试。
- `src/app/runtime/fixed-step-clock.ts`：必要的增量扩展。
- `src/app/runtime/fixed-step-clock.test.ts`：对应测试。

## 验收标准

- [ ] AC-01：时间戳 0 锚定、31.25 ms 为 1 tick、相同时间戳 0 tick、156.25 ms 增量恰 5 tick、187.5 ms 增量触顶为 5 且 alpha=0、一般 alpha ∈ [0,1)；非法时间戳拒绝；读模型同 tick 原子缓存，读取失败不混合，旧冻结输出不变。
- [ ] AC-02：按住、短按、多次短按、普通 `fire` 与自动 `fire` 并存；队列 256/257、每 tick 64/65 与自动开火占额；FIFO 跨 tick 不丢；每 tick 独立映射，自动结果与实例化事件交付 null；非法提交不改变状态；外部对象变更不影响副本。断言 `Recording.record.ticks` 与收到的交付元数据。
- [ ] AC-03（Runtime 部分）：首 tick 失败、多 tick 中后续 step 失败、step 后读取失败、检查点故障、监听器失败与容量停止，状态、缓存、已分发/未分发事件以及确定未执行/结果不明的 ID 符合失败表；容量停止前成功 tick 的事件送达，失败 tick 无变化，可导出；故障后不可导出。真实录制容量边界验证 limit 与下一次拒绝。
- [ ] AC-06（Runtime 部分）：按住开火与命令顺延下的录制经 JSON 往返，`replayRecord` 的事件与全部检查点一致。
- [ ] 故障只在测试创建边界注入，生产 API 没有后门；`pnpm exec vitest run src/app/runtime` 与 `pnpm check` 通过。

## 验证方法

- Node：`pnpm exec vitest run src/app/runtime`，可控时间戳、真实 Core、合成任务；录制容量用例用 `CORE_LIMITS.recorded*` 推出的输入规模（按 Core 测试的先例声明较长 deadline）。
- 不适用浏览器与原版对照。

## 完成证据
