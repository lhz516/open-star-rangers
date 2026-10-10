---
type: plan
status: active
phase: P3
task: "07"
subtask: "11"
updated: 2026-10-09
---

# 11 — 共享契约基础与接入点

**契约来源：** [spec](../spec.md) 的 S-01、AC-01；[共享契约修订](../spec.md#共享契约修订p3-02)（以 08 获批写入 [P3-02 spec](../../02/spec.md) 的形状为准）、技术决定 1、8、12。
**依赖：** 08。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **共享形状：** 按 08 获批的 P3-02 修订实现：
  - 实体的战斗状态封闭联合、玩家与任务交接状态、运行时种类与表现选择器联合；
  - 新领域事件与命令原因码；`Request` 联合中的新请求类型；
  - `flight`/`combat` 分区的形状与判别（本项一律为 `no-player` 或 `not-implemented`，不构造任何战斗数据）；Render State 的 `clock`、`hitShimmerStart` 与新表现选择器的提取；
  - 快照写入器与比较器事件字段表覆盖每个新成员（类型检查强制）；按修订递增 `RULES_VERSION` 与快照/replay 的格式版本，旧版本一律拒绝。本 goal 的规则变化统一使用本项设定的新 `RULES_VERSION`；若 08 的修订对中间版本另有规定，按其执行。
- **接入点：** 把 [pipeline.ts](../../../../../src/core/systems/pipeline.ts) 中本任务需要接入的位置改为静态调用各规则族模块的导出，使 13 至 21 只修改各自的模块：
  - 命令判定按命令类型分派到 `targeting.ts`、`weapons.ts`、`energy.ts`；
  - 按种类的对象更新分派到 `projectiles.ts`、`missiles.ts`、`destruction.ts`；
  - 新请求类型的处理分派到对应模块；`leave()` 在对象停放或移除时调用 `targeting.ts` 的目标处理；
  - `collision`、`delayed-player-explosion`、`energy` 阶段的 `run` 由 `collision.ts`、`destruction.ts`、`energy.ts` 导出。
  本项创建这些模块并保持现有行为：命令仍为 `rejected`/`not-implemented`，阶段 `run` 仍为 null，新请求类型没有投递者，不写假系统。`movement` 与 `parked-update` 阶段不在本项接入（22）。
- **测试：** 新形状的校验、冻结与序列化；快照与比较覆盖每个新成员；旧版本的快照与 replay 被拒绝；按获批变化更新既有断言（`not-implemented` 分区、版本号），保留纯度、原子拒绝、生命周期与输出冻结的不变量；合成 Core 的测试不改。

## 不包含

- 规则数据输入与 setupHash（12）；任何规则行为（13 至 22）；`combat` 分区的就绪内容（23）。
- 修改 P3-02 spec（08）。

## 关键文件与契约

- 现有：[domain-events.ts](../../../../../src/core/contracts/domain-events.ts)、[limits.ts](../../../../../src/core/contracts/limits.ts)、[entity-table.ts](../../../../../src/core/world/entity-table.ts)、[player-state.ts](../../../../../src/core/world/player-state.ts)、[world-state.ts](../../../../../src/core/world/world-state.ts)、[world.ts](../../../../../src/core/world/world.ts)、[projection.ts](../../../../../src/core/projections/projection.ts)、[render-state.ts](../../../../../src/core/projections/render-state.ts)、[snapshot.ts](../../../../../src/core/replay/snapshot.ts)、[compare.ts](../../../../../src/core/replay/compare.ts)、[rules-version.ts](../../../../../src/core/replay/rules-version.ts)、[recording.ts](../../../../../src/core/replay/recording.ts)、[replay.ts](../../../../../src/core/replay/replay.ts)、[pipeline.ts](../../../../../src/core/systems/pipeline.ts)。
- 计划新增：`src/core/systems/` 下的 `commands.ts` 与规则族模块 `targeting.ts`、`weapons.ts`、`projectiles.ts`、`missiles.ts`、`energy.ts`、`collision.ts`、`destruction.ts`。

## 写入范围

- `src/core/contracts/domain-events.ts`：新事件与原因码。
- `src/core/contracts/domain-events.test.ts`：新事件与原因码的测试。
- `src/core/contracts/limits.ts`：修订要求的新上限名。
- `src/core/contracts/limits.test.ts`：上限测试。
- `src/core/world/entity-table.ts`：战斗状态与表现选择器联合。
- `src/core/world/entity-table.test.ts`：实体表测试。
- `src/core/world/player-state.ts`：玩家与任务交接状态。
- `src/core/world/player-state.test.ts`：玩家状态测试。
- `src/core/world/world-state.ts`：世界状态的新成员。
- `src/core/world/world.ts`：读模型与状态的接线。
- `src/core/world/world.test.ts`：世界测试的既有断言更新。
- `src/core/world/world.test-support.ts`：测试辅助。
- `src/core/projections/projection.ts`：`flight`/`combat` 分区形状。
- `src/core/projections/projection.test.ts`：分区测试。
- `src/core/projections/render-state.ts`：Render State 新字段。
- `src/core/projections/render-state.test.ts`：Render State 测试。
- `src/core/replay/snapshot.ts`：快照写入器。
- `src/core/replay/snapshot.test.ts`：快照测试。
- `src/core/replay/compare.ts`：比较器事件字段表。
- `src/core/replay/compare.test.ts`：比较器测试。
- `src/core/replay/rules-version.ts`：规则版本。
- `src/core/replay/recording.ts`：录制格式版本。
- `src/core/replay/recording.test.ts`：录制测试。
- `src/core/replay/replay.ts`：replay 格式版本。
- `src/core/replay/replay.test.ts`：replay 测试。
- `src/core/replay/replay.test-support.ts`：测试辅助。
- `src/core/systems/pipeline.ts`：接入点与新请求类型。
- `src/core/systems/pipeline.test.ts`：流水线测试。
- `src/core/systems/commands.ts`：命令分派（新建）。
- `src/core/systems/commands.test.ts`：命令分派测试（新建）。
- `src/core/systems/targeting.ts`：目标模块（新建，保持现有行为）。
- `src/core/systems/weapons.ts`：武器模块（新建，保持现有行为）。
- `src/core/systems/projectiles.ts`：弹丸模块（新建，保持现有行为）。
- `src/core/systems/missiles.ts`：导弹模块（新建，保持现有行为）。
- `src/core/systems/energy.ts`：能量模块（新建，保持现有行为）。
- `src/core/systems/collision.ts`：碰撞模块（新建，保持现有行为）。
- `src/core/systems/destruction.ts`：毁伤模块（新建，保持现有行为）。

## 验收标准

- [ ] AC-01：共享形状与 08 获批的 P3-02 修订逐项一致；类型、读取器、序列化与比较器一致，快照写入器与事件字段表覆盖每个新成员。
- [ ] AC-01：规则与格式版本按修订变化；旧规则版本的 replay 被拒绝且不执行。
- [ ] AC-01：既有纯度、原子拒绝、生命周期与输出冻结的不变量测试保留；只更新获批变化对应的断言；合成 Core 的测试不改；正式与合成模块互不依赖。
- [ ] 接入点改造后行为不变：每个命令仍有恰好一个 `rejected`/`not-implemented` 结果，未实现阶段的 `run` 仍为 null，没有假系统或生产注入入口。
- [ ] `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts`、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- Node 测试：新形状的校验与冻结；快照文本覆盖新成员；比较器对新事件的逐字段校验；旧版本拒绝。
- 对比改造前后同一合成任务与输入的事件流与检查点哈希：除获批的版本号与分区判别外不变。
- 不涉及浏览器或原版对照。

## 完成证据
