---
type: plan
status: active
phase: P3
task: "11"
subtask: "08"
updated: 2026-10-22
---

# 08 — 契约基础：状态、事件、分区与版本

**契约来源：** [spec](../spec.md) 的 S-01、AC-01；[数据模型与契约](../spec.md#数据模型与契约)；D-01 写入 [P3-02 spec](../../02/spec.md) 的“P3-11 的契约修订”（05）。
**依赖：** 05。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 按 D-01 定稿的形状扩展共享类型与初值，不实现规则：
  - [world-state.ts](../../../../../src/core/world/world-state.ts) 的 `MissionStatus`、`MissionFlow`（主状态与子状态联合、期限字段）、全清/预结算/锁存/完成的状态、救援计数、段 2 运行状态与僚机损失计时；[spawn-state.ts](../../../../../src/core/world/spawn-state.ts) 的私有来源记录变化所需字段；[create-world.ts](../../../../../src/core/world/create-world.ts) 的初值。
  - [domain-events.ts](../../../../../src/core/contracts/domain-events.ts) 的新事件、`transition` 的 G-02/5、G-02/6 与 `radio-flushed` 的新原因；命令原因码（若 D-01 新增）；[limits.ts](../../../../../src/core/contracts/limits.ts) 的新上限与注释依据。
  - [projection.ts](../../../../../src/core/projections/projection.ts) 的 `ResultReason`、`ResultMessageReference`、`result` 与 `mission` 分区类型（规则未接通前保持 `in-progress`/已有判别，不伪造终态）。
  - [snapshot.ts](../../../../../src/core/replay/snapshot.ts)、[compare.ts](../../../../../src/core/replay/compare.ts) 的新字段与事件字段表；`RULES_VERSION`、快照格式与（D-01 判定需要时）`GAME_REPLAY_VERSION` 相对实际集成基线各递增一次；旧版本在任何 tick 之前拒绝。
- 修复因联合扩展而失效的现有测试与 test-support 替身（例如 UI 桥接中代表 P3-11 状态的替身），不改变其断言的含义。
- 测试：类型穷尽、初值、严格读取、快照/哈希往返、比较器逐字段、版本拒绝、limit 与 limit + 1。

## 不包含

- 任何规则的行为（09 起）；Runtime、会话与 UI 的消费逻辑（16、17）。

## 关键文件与契约

- 上述文件；[rules-version.ts](../../../../../src/core/replay/rules-version.ts)、[recording.ts](../../../../../src/core/replay/recording.ts)；[P3-02 扩展规则](../../02/spec.md#扩展规则)。

## 写入范围

- `src/core/world/**`：状态类型、初值与测试。
- `src/core/contracts/**`：事件、原因码、上限与测试。
- `src/core/projections/**`：分区类型与测试。
- `src/core/replay/**`：快照、比较器、版本与测试。
- `src/ui/game/**`：类型扩展导致失效的桥接测试替身。
- `src/app/**/*.test.ts`：类型扩展导致失效的测试。
- `src/app/**/*.test-support.ts`：类型扩展导致失效的测试辅助。
- `src/core/systems/{base-response,communications,docking,radio}.test.ts`：`flow` 增加字段后改用 `toMatchObject` 比较 CB-02 字段，不改变断言含义。
- `src/app/runtime/game-event-bus.ts`：新事件类型加入穷尽登记（测试已在 `src/app/**/*.test.ts` 内）。
- `src/ui/dev/event-log.ts`、`src/ui/dev/event-log.test.ts`：新事件的字段行。
- `src/app/mission/mission-owner.ts`：运行中衔接的占位守卫收窄为 G-02/3、G-02/4（G-02/5、G-02/6 的衔接与占位归 16、17）。
- `tools/replay-check.ts`、`tools/replay-check.test.ts`：新事件的最长形式进入穷尽的 `LONGEST_EVENTS` 与测试的事件列表。
- `docs/guides/tools.md`：仅当最长事件改变导致 `RECORDING_MAX_BYTES` 变化时，同步其说明。

## 验收标准

- [x] 类型、初值、事件与分区与 P3-02 的定稿逐字段一致；无开放载荷或 `unknown` 字段。（AC-01）
- [x] 快照、比较器与版本：新字段进入快照与哈希，旧规则/格式版本在 step 前拒绝。（AC-01、AC-10 的契约部分）
- [x] 新增上限有依据注释，limit 与 limit + 1 有测试。
- [x] `pnpm exec vitest run src/core src/app src/ui tools/engineering-boundaries.test.ts` 与 `pnpm typecheck` 通过。

## 验证方法

- 与源码相邻的 Vitest；严格读取与往返测试；`pnpm typecheck`、`pnpm lint`。
- 按 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 清理本项范围。

## 完成证据

- **2026-10-22（worker，基线 `65b35e64`）：**
  - **类型与初值（AC-01）：** [world-state.ts](../../../../../src/core/world/world-state.ts) 按 ME-03/04/05 加入 `MainState`、`MissionSubState`（0–5）、`PlayerLoss`、`SummaryReference`、`Settlement`、`ResultReason`、`EndingGap`、`MissionResult`、完整的 `MissionFlow`、`MissionEvents` 与 `missionStatus: 'built' | 'ended'`；新世界为主状态 3、子状态 0、期限与救援计数 0、无挂起/结算/结果/完成，每个段 2 触发一组 0 计数（`create-world.test.ts` 的 P3-11 用例）。[spawn-state.ts](../../../../../src/core/world/spawn-state.ts) 的 `position`、`region`、`anchor` 改为可写（ME-06）。[domain-events.ts](../../../../../src/core/contracts/domain-events.ts) 按 ME-13 加入 11 个事件（`player-loss-started` 按损失类型分两种形状）、`transition` 的 G-02/5、G-02/6、`radio-flushed` 的四个原因与原因码 `mission-ended`（ME-12）；`domain-events.test.ts` 以 `expectTypeOf` 与 `@ts-expect-error` 固定联合与非法组合。[projection.ts](../../../../../src/core/projections/projection.ts)：`mission.phase`（ME-14 的映射）与始终就绪的 `ResultProjection`（`completedTick` 为 null 时 `in-progress`，之后为冻结的 `flow.result` 副本；完成而无结果为 `invariant-violated`）；不公开计数、期限与 `settlement`（`projection.test.ts`）。没有 `unknown` 或开放载荷字段。
  - **快照、比较器与版本（AC-01、AC-10 契约部分）：** [snapshot.ts](../../../../../src/core/replay/snapshot.ts) 按 ME-03 次序写出完整 `flow`、`missionEvents` 与新状态，格式版本 6 → 7；`snapshot.test.ts` 的逐叶测试覆盖新字段（含结果变体与空值）且全部改变规范文本与哈希。`RULES_VERSION` 7 → 8，replay 格式仍为 3（ME-16）；`map-warp-replay.test.ts` 新增“P3-11 之前的规则版本 7 在任何 tick 之前被拒绝”。[compare.ts](../../../../../src/core/replay/compare.ts) 严格读取新事件（`MissionResult` 的原因/结局/救援/锁存 tick 不变量、总结引用的 Asset ID 与触发/区间上界、`all-clear` 的入口集种类、`viewSwitched` 与视角 0x11）并按 ME-11/ME-13 检查次序：全清紧随其对象事件、被毁损失紧随玩家被毁及其换页与清空、信标与能量损失、救援紧跟 G-02/5 或 G-02/6、锁存紧随其原因且同 tick 退场、下一 tick 以锁存结果完成并为最终 tick。`compare.test.ts` 的 P3-11 组（逐字段差异、接受与拒绝表）。
  - **上限（limit 与 limit + 1）：** `CORE_LIMITS` 不变（ME-16）；[limits.ts](../../../../../src/core/contracts/limits.ts) 的注释与 `limits.test.ts` 加入 P3-11 每 tick 事件核算 529（合计 9,593，预算约其 3.4 倍）。比较器测试覆盖：每 tick 两个 `player-loss-started` 接受、第三个拒绝；其余新事件每 tick 一个、第二个拒绝；`endingGaps` 2/3；`rescues` 2/3；`rescuesUsed` 2/3；选择值 −128/−129、13 与 19/12 与 20；触发 1/2、区间 7/8；`candidates` 与 `entities` 为 2,048/2,049；`playerKills` 为 0x7fffffff/0x80000000。`tools/replay-check.ts` 加入新事件的最长形式；`warp-completed` 仍最长，`RECORDING_MAX_BYTES` 不变（不需改 tools.md）。
  - **受影响的既有代码（经协调者批准扩大写入范围）：** 四个 systems 测试的 `flow` 比较改为 `toMatchObject` CB-02 字段；`game-event-bus.ts` 的穷尽登记；`ui/dev/event-log.ts` 的字段行（附测试）；`mission-owner.ts` 的运行中衔接守卫收窄为 G-02/3、G-02/4（G-02/5、G-02/6 归 16、17）；UI 桥接的结果关键事实由 `message` 改为 `completedTick`（结果冻结），其测试替身改用 `ended` 与真实的终态形状。
  - **检查：** `pnpm typecheck`、`pnpm lint`、`pnpm build` 通过。`pnpm check` 的 Vitest 在负载均值约 35–90（其他会话）下 10,105 通过、5 个 5 秒超时（package-check、failure-matrix ×2、compare 的 32,768 事件、replay 的重复录制）；这些文件与先前超时的 mission-owner、game-runtime-recording、mission-diagnostics、engineering-boundaries、map-warp-replay 以 `--no-file-parallelism` 单独重跑：10 个文件 656 项全部通过。
  - **rubber-duck：** 指出比较器缺少锁存的因果检查、被毁损失与僚机计时未关联被毁对象、锁存→退场→完成的跨 tick 生命周期未检查、`viewSwitched` 不可能组合、若干上限缺 limit 测试；全部按建议修复并加测试。**simplify：** 去掉 `ONCE_PER_TICK` 数组、复用 `rules/targeting.ts` 的 `ENEMY_KINDS`、提升选择列表常量、把被毁追踪提为具名方法；未采纳把生命周期移出比较器、投影缓存、桥接改用对象身份等（改变既有设计或无实际收益）。
  - **文档影响：** [Core 模块说明](../../../../engineering/modules/core.md) 的快照格式（6）与 `RULES_VERSION`（7）当前值已过时，不在本项写入范围，已在交接中提出（应为 7 与 8）；其余工程与指南文档无需更改。

