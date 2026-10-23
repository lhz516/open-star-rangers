---
type: plan
status: active
phase: P3
task: "11"
subtask: "14"
updated: 2026-10-23
---

# 14 — 退场、流程门禁与完成

**契约来源：** [spec](../spec.md) 的 S-08、AC-07（退场部分）、AC-10（完成后 step）；[任务流程状态](../spec.md#任务流程状态)、技术决定 1–2；D-01 的退场契约。
**依赖：** 12, 13。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 锁存之后进入主状态 0/1：在 [pipeline.ts](../../../../../src/core/systems/pipeline.ts) 原定的 `mission-teardown` 阶段（计划新增 `src/core/systems/mission-teardown.ts`）标记全部对象退场，通过既有生命周期移除；主状态 1 时 `0x339cc` 拒绝生成与发射请求（[launch.ts](../../../../../src/core/systems/launch.ts)、[spawn.ts](../../../../../src/core/systems/spawn.ts)）。
- 锁存 tick 的剩余阶段、命令与请求的结算按 D-01：锁存后的游戏命令以定稿的封闭原因结算；锁存摘要不被晚到事件改写。
- 退场完成：活实体归零、AI 控制器与共享缓存的活引用释放、玩家与地图读模型转为无实体后，发出退场完成事件；之后 [world.ts](../../../../../src/core/world/world.ts) 的 `step` 在改状态前以非锁存的错误拒绝，读取（projection、Render State、snapshot）仍可用；清理不变量失败仍为 Core 故障。
- 测试：成功与失败两种锁存后的退场序列；地图标记、逃生舱、弹体、爆炸与 AI 引用的清理；状态 1 门禁；锁存 tick 的命令结果；完成后 step 拒绝不污染读取；清理故障锁存。

## 不包含

- 分区与录制（15）；Runtime 截断与会话（16）。

## 关键文件与契约

- [errors.ts](../../../../../src/core/errors.ts)、[entity-table.ts](../../../../../src/core/world/entity-table.ts) 的生命周期、[ai.ts](../../../../../src/core/systems/ai.ts) 的控制器与解析缓存、[map.ts](../../../../../src/core/systems/map.ts) 的标记。

## 写入范围

- `src/core/systems/mission-teardown.ts`：计划新增的退场阶段。
- `src/core/systems/mission-teardown.test.ts`：计划新增的测试。
- `src/core/systems/pipeline.ts`：阶段接线。
- `src/core/systems/mission-flow.ts`：锁存后转入退场。
- `src/core/systems/launch.ts`：`0x339cc` 门禁。
- `src/core/systems/spawn.ts`：`0x339cc` 门禁。
- `src/core/systems/destruction.ts`：`shedFragments` 的 `0x339cc` 门禁（ME-11、ME-15：主状态 1 中不构造碎片）。
- `src/core/world/world.ts`：完成后 step 的拒绝。
- `src/core/errors.ts`：非锁存错误（若 D-01 新增类别）。
- `src/core/world/*.test.ts`：完成后读取与拒绝的测试。
- `src/core/systems/*.test.ts`：受影响的既有测试。

## 验收标准

- [x] 锁存→退场→完成经既有生命周期；活实体归零，读模型不解析旧 ID；状态 1 门禁有效。（AC-07）
- [x] 完成后 step 不改世界、不污染读取；清理故障仍锁存。（AC-10）
- [x] 锁存 tick 的命令结果恰好一个且原因封闭；结果不被晚到事件改写。
- [x] 受影响的 Vitest、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- Node 流水线、拆除与故障矩阵测试。
- 按 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 清理本项范围。

## 完成证据

- **2026-10-23（worker 14）：**
  - **实现：** 新增 [mission-teardown.ts](../../../../../src/core/systems/mission-teardown.ts)，接在 [pipeline.ts](../../../../../src/core/systems/pipeline.ts) 原定的 `mission-teardown` 阶段。主状态 0（锁存的 tick，无论锁存在 `mission-flow` 还是 `request-handling`）：视角 := 0x13，上一视角 := 真实旧视角，`switchView(world, 0x13, old)`（离开 Warp 时恢复保存页并发 `left-page-changed`），主状态 := 1，每个实体 := `pending-removal`，发出 `teardown-started { entities }`。主状态 1（下一 tick）：实体经各自的既有更新提出 `leave`，在 `request-handling` 中移除，同时释放玩家引用、AI 控制器与脚本使用；实体表与 `ai.parseCache` 都为空时写 `completedTick`，发出 `mission-completed`，否则报 Core 故障 `invariant-violated`/`mission-teardown`。两个 tick 都断言锁存状态（result 非 null、`ended`、`rescues` 0）且没有 `transition`（`mission-teardown.state`、`.transition`）。具名谓词 `isResultLatched`（主状态 0/1）与 `passesTeardownGate`（`0x339cc`，主状态 ≠ 1）。门禁：[spawn.ts](../../../../../src/core/systems/spawn.ts) 的 `dispatchSpawn` 与 [launch.ts](../../../../../src/core/systems/launch.ts) 的 `applyLaunchRequest` 在主状态 1 丢弃请求、不发事件；[destruction.ts](../../../../../src/core/systems/destruction.ts) 的 `shedFragments` 在主状态 1 不构造、不抽取，仍按有部件返回 true（原版在派发时丢弃消息 0x10；经协调者批准扩大写入范围）。命令：`object-update` 时主状态为 0/1，`updatePlayerControls` 以空命令表运行玩家更新（导弹锁定、速度辅助与轴照常，轴是 tick 输入而不是命令），随后在原判定位置逐条发出 `ignored`/`mission-ended`，不投递请求。[world.ts](../../../../../src/core/world/world.ts)：`completedTick` 非 null 时，`step` 在读取输入之前抛出不锁存的 `CoreInputError('step', 'mission-completed')`。不需要新的错误类别（[errors.ts](../../../../../src/core/errors.ts) 不变）。
  - **测试：** 新增 [mission-teardown.test.ts](../../../../../src/core/systems/mission-teardown.test.ts) 11 项：成功的自然运行在锁存 tick 中先 `result-latched`、后 `teardown-started`（实体数等于表大小，全部待移除，主状态 1，视角 0x13/上一视角 0xC），下一 tick 的最后一个事件为 `mission-completed`，实体表与解析缓存为空，玩家、目标、停靠与控制引用为 null，`mission.phase` 为 `completed`、`result` 为终态、Render State 无实体、观察实体为 null，从全清到完成的事件通过 `compareReplayResults` 的次序检查。完成后，`step`（空输入、带命令、甚至非法输入）都抛出 `CoreInputError('step', 'mission-completed')`，快照文本不变，projection、renderState、snapshot 仍可读取。锁存 tick 与完成 tick 的 10 种命令各得一个 `ignored`/`mission-ended`，没有射击、地图、Warp、目标、应答机或停靠事件，射击计数与地图状态不变。锁存 tick 中稍后的僚机与玩家被毁不改写冻结的 `result`（同一对象），不触发全清、被毁序列、救援或衔接。Warp 视角中锁存时，`left-page-changed` 紧接在 `teardown-started` 之前（页 0 → 保存页，因为锁存时的清空已写页 0）。第三次被毁在 `request-handling` 锁存时，该 tick 的命令保持 `player-unavailable`，退场时视角 0x13/上一视角 0x11，`followedEntity` 为 null。退场时活着的敌机控制器持有脚本（解析缓存非空），存在应答机与碎片；完成后全部清空，结果为 `failure`/G-02/7 `destroyed`，整个运行通过比较器。锁存 tick 注入的地图标记、导弹、弹丸与停放敌机都在下一 tick 移除。生成与发射请求在主状态 1 被丢弃（无事件、实体数与射击计数不变），在主状态 0 照常处理；碎片门禁不构造、不抽取，爆炸不持有源；主状态 3 照常脱落。故障：完成 tick 残留实体、残留脚本使用都报 `mission-teardown` 故障，不写 `completedTick`，世界锁存（之后 projection 与 step 抛出同一故障）；锁存 tick 有 `transition` 时报 `mission-teardown.transition`。受影响的既有测试已按“锁存 tick 起退场、下一 tick 完成”更新：[mission-flow.test.ts](../../../../../src/core/systems/mission-flow.test.ts)（锁存后主状态 1，下一 tick 完成）、[rescue.test.ts](../../../../../src/core/systems/rescue.test.ts)（第三次损失后的 `teardown-started`、待移除与视角 0x13）、[wingman-loss.test.ts](../../../../../src/core/systems/wingman-loss.test.ts)（循环以 `result` 为条件）、[pipeline.test.ts](../../../../../src/core/systems/pipeline.test.ts)（阶段表加入 `mission-teardown`）。
  - **检查：** `pnpm exec vitest run src/core/systems/`：42 文件 1041 项通过；`pnpm typecheck`、`pnpm lint` 通过；`pnpm check`：348 文件 10220 项通过，构建成功。
  - **审阅：** rubber-duck 未发现问题（确认命令门禁与比较器的阶段次序一致，各类待移除实体都能清空，完成后读取不解析旧 ID）。simplify：`0x339cc` 与锁存判断改为具名谓词，`teardown-started` 的实体数直接取表大小，测试复用 `COCKPIT_VIEW_MODE`/`WARP_VIEW_MODE` 并抽出锁存循环与比较器检查。未采纳：把命令门禁移入 [flight-control.ts](../../../../../src/core/systems/flight-control.ts) 的 `judgeCommands`（超出写入范围；当前位置的事件次序已经比较器验证），以及把视角常量集中到 `view-switch.ts`。
  - **文档影响：** `docs/original/` 的事实无变化。[core.md](../../../../engineering/modules/core.md) 第 280 行（`mission-teardown` 为“空”）、第 873、1007、1010 行（`0x339cc` 门禁写作待加入）已过时，应补上退场与完成、`mission-ended` 门禁与完成后 `step` 的 `CoreInputError`，交 22 订正（超出本项写入范围）。录制会话的完成拒绝（ME-12“录制会话同理”）与 `replayRecord` 的 `after-completion` 属于 15。
