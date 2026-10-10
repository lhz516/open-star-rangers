---
type: plan
status: active
phase: P3
task: "04"
subtask: "02"
updated: 2026-10-10
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

- [x] AC-01：时间戳 0 锚定、31.25 ms 为 1 tick、相同时间戳 0 tick、156.25 ms 增量恰 5 tick、187.5 ms 增量触顶为 5 且 alpha=0、一般 alpha ∈ [0,1)；非法时间戳拒绝；读模型同 tick 原子缓存，读取失败不混合，旧冻结输出不变。
- [x] AC-02：按住、短按、多次短按、普通 `fire` 与自动 `fire` 并存；队列 256/257、每 tick 64/65 与自动开火占额；FIFO 跨 tick 不丢；每 tick 独立映射，自动结果与实例化事件交付 null；非法提交不改变状态；外部对象变更不影响副本。断言 `Recording.record.ticks` 与收到的交付元数据。
- [x] AC-03（Runtime 部分）：首 tick 失败、多 tick 中后续 step 失败、step 后读取失败、检查点故障、监听器失败与容量停止，状态、缓存、已分发/未分发事件以及确定未执行/结果不明的 ID 符合失败表；容量停止前成功 tick 的事件送达，失败 tick 无变化，可导出；故障后不可导出。真实录制容量边界验证 limit 与下一次拒绝。
- [x] AC-06（Runtime 部分）：按住开火与命令顺延下的录制经 JSON 往返，`replayRecord` 的事件与全部检查点一致。
- [x] 故障只在测试创建边界注入，生产 API 没有后门；`pnpm exec vitest run src/app/runtime` 与 `pnpm check` 通过。

## 验证方法

- Node：`pnpm exec vitest run src/app/runtime`，可控时间戳、真实 Core、合成任务；录制容量用例用 `CORE_LIMITS.recorded*` 推出的输入规模（按 Core 测试的先例声明较长 deadline）。
- 不适用浏览器与原版对照。

## 完成证据

2026-10-10，worker 分支 `exec-p3-04-02`（基于认领提交 `c0ea748`）。

**实现：**

- [game-runtime.ts](../../../../../src/app/runtime/game-runtime.ts)：`createGameRuntime(spec)`，`spec` 为 `{ mission, craftTypes, wingmanRoster, identity, run: { rawDifficulty, wingman, seed }, recording: RecordingOptions | null }`。顶层与意图用 Core 的 `readExactRecord` 读取（只接受纯数据字段，访问器不运行，符号与不可枚举字段拒绝），`run` 含 `clockUnitsPerTick` 时拒绝；其余校验与创建错误（`ContentContractError`、`CoreInputError`、`CoreFaultError`）原样抛出，不创建 Runtime。频率由初始 projection 的 `clockUnitsPerTick` 推出（64 ÷ 2 = 32 Hz），`FixedStepClock` 原样复用，`MAX_TICKS_PER_FRAME` 为 5。
  - 句柄：`frame(nowMs)` 返回冻结的 `{ ticks, capped, stop }`；`setIntent`、`submitCommand`（`COMMAND_QUEUE_LIMIT` 256，ID 签发至 `MAX_SAFE_INTEGER − 1`）；`on`/`onAny`；`projection()`、`renderFrame()`、`snapshot()`、`exportRecording()`；生命周期操作 `resetClock`、`clearIntent`（返回冻结 FIFO 未执行 ID）、`foldRenderState`、`clearSubscriptions`，帧内（含投递）调用抛 `reentrant-call`。
  - 失败帧：故障抛 `faulted`，`unconfirmed` 为本帧已取入批次但结果未送达的 FIFO ID（此前成功 tick 的批次，以及可能已执行的失败 step 批次，后者同时移出队列）；队列中余下的 ID 确定未执行，由 `clearIntent()` 交给会话以 failure 取消。step 的非录制 `CoreInputError`（世界不变）不把该批次计入 `unconfirmed`，批次留在队列。录制容量拒绝（路径 `recording`）在投递前锁存停止，此前成功 tick 的事件照常投递，帧报告带 `stop: 'recording-capacity'`；之后 `frame`/`setIntent`/`submitCommand`（含投递中的提交）抛 `recording-capacity`（cause 为 Core 的拒绝），`snapshot`/`exportRecording` 仍可用。故障与停止都把读模型折叠为最后一组完整缓存（previous=current、alpha=0）；故障后不再调用 Core，`snapshot`/`exportRecording` 抛同一故障。
  - 实现中的选择（spec 允许名称调整，以下不扩大形状）：`snapshot()`/`exportRecording()` 在帧内拒绝，使 Core 故障不会插入部分投递的批次；监听器失败不使 Runtime 故障（由会话转为 consumer 故障），队列保留；投递中耗尽 commandId 时故障优先于由它引起的 `listener-failed`。
- [game-event-bus.ts](../../../../../src/app/runtime/game-event-bus.ts)：每帧一次按 tick 与发出次序投递，接收者批次固定、新订阅下一批生效、取消立即生效；投递元数据 `{ commandId }` 由总线冻结（null 共用一个冻结对象）；监听器抛错或返回非 undefined（如 Promise，其拒绝被吸收以免未处理）都计为失败，本批其余接收者照常调用，最后抛 `listener-failed`。
- [runtime-errors.ts](../../../../../src/app/runtime/runtime-errors.ts)：新增 `command-queue-full`、`recording-capacity`（带 cause），`faulted` 增加可选的冻结 `unconfirmed`；合成 Runtime 构造的错误不带它，原有种类行为不变（合成 Runtime 与会话测试全部通过）。

**验收：**

- AC-01：[game-runtime.test.ts](../../../../../src/app/runtime/game-runtime.test.ts) 的 `GameRuntime time` 断言 0 锚定、31.25 ms 为 1 tick、同时间戳 0 tick、+156.25 ms 恰 5 tick 不触顶、+187.5 ms 触顶为 5 且 alpha=0、余量不补跑、alpha 0.5/0.25 与一般 alpha ∈ [0,1)；NaN、Infinity、字符串、倒退与换算溢出拒绝且 projection/renderFrame 身份与录制不变。`GameRuntime read model` 断言两次提交间 projection 同一对象、previous/current 为最近两 tick、旧冻结输出 JSON 不变、投递时已是本帧新 tick 与 alpha、折叠与重新锚定后不回退。读取失败不混合见 AC-03。
- AC-02：[game-runtime-input.test.ts](../../../../../src/app/runtime/game-runtime-input.test.ts) 直接断言 `Recording.record.ticks` 与投递元数据：轴的 −0 规范化与保持、非法意图（含访问器）不改已接受意图；按住每 tick 一个、多次短按只一个、0 tick 帧不消耗、按住中再按不增加；自动 fire 与提交的 fire 并存（`[null, id]`）；队列 256 接受、第 257 个 `command-queue-full` 且不耗 ID；每 tick 64/65 与自动开火占额；256 条跨 5 tick FIFO 不丢、每 tick 的 commandIndex 从 0 起且独立映射、实例化事件与自动结果为 null、投递中提交的命令在下一帧；非法命令不改队列与下一个 ID；外部对象变更不影响副本；`clearIntent` 一次性返回 FIFO ID。
- AC-03（Runtime 部分）：[game-runtime-fault.test.ts](../../../../../src/app/runtime/game-runtime-fault.test.ts) 以 `vi.mock` 包装 `createWorld`/`createRecordingSession` 的返回值注入：首 tick 故障、多 tick 中第 3 个 step 故障与录制检查点故障（均为真实 step 后抛出）、step 后 projection/renderState 读取故障、snapshot 与导出故障、非录制 `CoreInputError`（含无录制时路径为 `recording`）、step 后 Runtime 内部异常、监听器失败、注入的录制拒绝与停止帧中的监听器失败。逐项断言 `unconfirmed`、`clearIntent` 返回的确定未执行 ID（第二次为空）、已投递/未投递事件、缓存折叠到最后完整 tick、故障后输入/帧/快照/导出抛同一故障且不再调用 Core；停止后可快照与导出。[game-runtime-recording.test.ts](../../../../../src/app/runtime/game-runtime-recording.test.ts) 的真实容量用例：262,144 条命令时帧中停止（报告 4 tick 与 stop，投递 252 个 ID，投递中的提交被拒，余 4 个 ID 由 `clearIntent` 返回，导出恰好录满并经 JSON 往返 replay 一致），以及 131,072 tick 时拒绝下一 tick。两例声明 30 s deadline，load 76–100 时实测 2–7 s。
- AC-06（Runtime 部分）：同文件以间隔 1 与 4 运行按住开火、150 条命令顺延、短按、0 tick 帧、触顶帧与折叠/重新锚定/清意图，导出 JSON 往返后 `replayRecord` 的事件、全部检查点与 finalTick 一致；单个 onAny 收到的事件与 `result.events` 相同；记录不含 commandId 或时间；有无录制的同一序列帧报告、投递、读模型与快照相同；早先导出不随后续 tick 改变。
- 故障只在测试的创建边界注入，生产 API 没有注入入口。commandId 耗尽与投递中耗尽的故障优先按 P1-04 AC-14 的先例由代码审阅确认（`submitCommand` 在签发前检查 `LAST_COMMAND_ID`，`frame` 在投递后先抛已锁存的故障），不执行 2^53 次提交。
- 检查：`pnpm exec vitest run src/app/runtime src/app/session`（18 个文件 254 个测试；其中 src/app/runtime 13 个文件 176 个测试）通过；`pnpm check` 通过（213 个文件、6,514 个测试与生产构建，load 约 100）。

**审阅与清理：** rubber-duck 提出 4 项，均已采纳：投递中的 Runtime 故障优先于 `listener-failed`；停止与故障时折叠读模型；规格与意图改用 Core 的严格数据记录读取；返回非 undefined 的监听器计为失败。开发中另发现并修复：可能已执行的失败批次曾同时留在队列。simplify 采纳复用 `thrownBy`/`contentOf`、由 `stepSeconds` 推出 `TICK_MS`、共用中性轴、`LAST_COMMAND_ID` 不导出、总线负责冻结投递元数据；未采纳每 tick 的微小分配优化（至多 5 tick × 64 项，收益可忽略）与以注入替代真实容量用例（验收要求真实边界）。

**文档影响：** 工程约定的“合成 Runtime”一节仍准确描述保留到 13 的合成 Runtime；正式 Runtime 的工程文档、模块分册与 Core 交接的更新按 goal 归 15，本子任务不改。模块注释与接口注释记录了正式 Runtime 的契约，供 03 使用。没有原版事实或未知项变化。
