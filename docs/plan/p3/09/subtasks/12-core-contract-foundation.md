---
type: plan
status: active
phase: P3
task: "09"
subtask: "12"
updated: 2026-10-14
---

# 12 — Core 契约基础

**契约来源：** [spec](../spec.md) 的 S-01、S-02、AC-01、AC-02（Core 部分）；D-01 写入 P3-02 的修订。
**依赖：** 08, 11。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 按 D-01 落地共享形状：命令原因码、领域事件联合、玩家状态中的地图与 Warp 状态、种类 25 与模式 4 移动块的类型、地图可见标志与集合的状态、`CORE_LIMITS` 的新上限；未被规则使用的原因不预建。
- `createWorld` 接收地图几何输入（与 [rule-data.ts](../../../../../src/core/world/rule-data.ts) 的输入并列），冻结拷贝、跨输入校验（与 `mapFrame` 的比例有限且为正）、纳入 setupHash；`ReplayContent` 与应用侧传入同步。
- 新 Warp 用途对 [craft-info-input.ts](../../../../../src/core/world/craft-info-input.ts) 的创建时校验：按 05 的数值域拒绝本次运行可达的不合法组合，保留原版合法的零值分支。
- 快照写入器、比较器的事件字段表、录制校验与版本：`RULES_VERSION` 与实际不兼容的格式版本递增，旧规则 replay 拒绝且不执行。
- 保持既有纯度、原子拒绝、冻结与生命周期不变量；只按批准变更更新旧 `not-implemented` 与占位断言。本项不实现规则行为，三种命令仍由 13 起接入。

## 不包含

- 规则行为（13 至 18）与 `map` 分区内容（19）。

## 关键文件与契约

- [domain-events.ts](../../../../../src/core/contracts/domain-events.ts)、[limits.ts](../../../../../src/core/contracts/limits.ts)、[player-state.ts](../../../../../src/core/world/player-state.ts)、[entity-table.ts](../../../../../src/core/world/entity-table.ts)、[create-world.ts](../../../../../src/core/world/create-world.ts)、[setup-hash.ts](../../../../../src/core/world/setup-hash.ts)、[snapshot.ts](../../../../../src/core/replay/snapshot.ts)、[compare.ts](../../../../../src/core/replay/compare.ts)、[recording.ts](../../../../../src/core/replay/recording.ts)、[rules-version.ts](../../../../../src/core/replay/rules-version.ts)、[replay.ts](../../../../../src/core/replay/replay.ts)。

## 写入范围

- `src/core/contracts/**`：原因码、事件、上限与测试。
- `src/core/world/**`：状态、实体、输入、校验、setupHash 与测试。
- `src/core/replay/**`：快照、比较器、版本与测试。
- `src/core/projections/projection.ts`、`src/core/projections/projection.test.ts`：只把 `never` 占位改为 D-01 的类型，分区仍未就绪。
- `src/app/resources/**`、`src/app/runtime/**`：把地图几何传入 `createWorld` 与 replay。
- `tools/replay-check.ts`、`tools/replay-check.test.ts`：同步输入（如需）。
- 闭合联合扩展所需的编译性改动（协调者 2026-10-14 扩大范围，不含规则行为）：`src/core/rules/name-assignment.ts`、`src/core/systems/movement.ts`（标记移动块的空分支）、`src/ui/dev/entity-inspection.ts`、`src/ui/dev/event-log.ts`、`src/ui/dev/event-log.test.ts`、`src/core/projections/combat.test.ts`、`src/core/systems/flight-control.test.ts`。
- `src/original-data/conversion/production-rule-data.test-support.ts`：合成机型信息满足 MW-01 的创建时校验（同上）。

## 验收标准

- [x] AC-01：类型、读取器、序列化、事件比较与快照字段表与 D-01 一致；版本已递增，旧规则 replay 拒绝；既有不变量保持。
- [x] AC-02 的 Core 部分：合格输入创建成功，缺失与跨输入不一致拒绝且不建半个世界；代表字段变化改变规范文本且样本 setupHash 改变；调用者后续修改不影响世界；新用途数值域按证据接受或拒绝。
- [x] `pnpm exec vitest run src/core src/app tools/engineering-boundaries.test.ts` 与 `pnpm check` 通过。

## 验证方法

- Node 测试的期望独立推导；limit 与 limit + 1；JSON 往返与旧版本拒绝。

## 完成证据

- **实现（只有形状、读取、校验、序列化与版本，无规则行为）：**
  - MW-01：`CreateWorldInput`/`ReplayContent` 增加 `mapGeometry`（`RULE_DATA_FIELDS` 末项，`CONTENT_INPUT_FIELDS` 随之；原版导入只接受 `data/hud/map-geometry`），由 `readMapGeometry` 严格读取、冻结脱离；[map-rule-data.ts](../../../../../src/core/world/map-rule-data.ts) 按 `0x49e74`/`0x3a41c`/`0x2b814` 算出 `WorldRuleData.map`，依次校验重绘间隔、光标起点与比例；[craft-info-input.ts](../../../../../src/core/world/craft-info-input.ts) 的 `checkPlayerWarp` 为第 4 项（数值对 ≥ 1、+0xA8 > 0、+0xB8 > 0、0 ≤ +0xA4 < 2²⁵，只查玩家记录）；四项在其他机型信息检查之前按此次序运行。setupHash 在 `aiPrograms` 之后写入 `mapGeometry` 的 ID 与全部内容。`startupRotations` 不在本项（归 14）。
  - MW-02/03：`PlayerState.map`（光标初值为 `startPixel`）、`savedLeftPage`、`warp: WarpTransit | null`；`Entity.mapVisible`（分配时 false）；`WorldState.objectSets`、`mapIcons`；种类 25 的 `MarkerCombat`、`map-marker` 表现与名称、`MarkerMovementBlock`，实体表按分配器缺省校验。闭合分支的编译性改动：名称文本（不可达，故障）、运动阶段对 `marker` 的空分支、开发面板的名称与事件摘要。
  - MW-04/05：原因码 `no-destination`、`insufficient-energy`；四个事件的封闭形状；比较器读取它们，前三个在请求处理中作为其命令唯一的附加事件，`warp-completed` 在新的 `warpCompletion` 阶段（停放更新之后、帧尾之前）且每 tick 至多一个；光标像素上界为 `MAP_SIDE_LIMIT − 1`。
  - MW-11：`projection.ts` 的 `map` 分区换成 MW-11 的类型，仍为 `not-implemented`。MW-14：`CORE_LIMITS` 取值不变、注释更新；`RULES_VERSION` 4→5，快照格式 3→4，replay 格式不变。
  - 应用：`ruleDataInputs` 增加 `mapGeometryInput(groups)` 的结果，任务所有者、运行时与 `replay-check` 经 `CONTENT_INPUT_FIELDS` 透传；`RECORDING_MAX_BYTES` 按推导改为 534,251,135（最长事件变为带到达的 `warp-completed`，924 字节含分隔符）。合成包的玩家 +0xA8 改为正值（Core 与 original-data 的测试支持）。
- **测试：** [map-rule-data.test.ts](../../../../../src/core/world/map-rule-data.test.ts)（输入结构、读取器错误、生产 ID 门禁、冻结脱离、手算的几何与比例、`wppX` 取未舍入双精度的倒数（s = 45 时 2000 而非 F(1/F(a)) 的倒数）、重绘间隔与起点的边界及次序、setupHash 随每个字段变化且与键序无关）；create-world（玩家 Warp 字段的拒绝与边界、与地图检查及其他机型检查的次序）；entity-table（标记的分配与 9 种拒绝、`mapVisible`）；snapshot（键表、版本 4/5、新状态逐叶改变规范文本、列表次序）；compare（4 个事件的往返、差异、边界与 limit + 1、次序拒绝 21 例）；replay（旧规则版本 4 拒绝、`mapGeometry` 缺失与伪造拒绝、MW-01 检查在 content 路径）；domain-events、player-state、projection 类型、事件总线、事件日志、mission-input、replay-check 尺寸推导。
- **检查：** `pnpm exec vitest run src/core src/app tools/engineering-boundaries.test.ts tools/replay-check.test.ts src/ui/dev src/original-data src/workers`：188 文件 5,746 项通过；`pnpm check`（typecheck、lint、284 文件 8,536 项测试、build）通过。
- **rubber-duck：** 采纳 2 项——MW-01 的检查移到既有机型信息检查之前（并加次序测试）；`warp-destination-set` 的像素上界由 i16 收紧为地图边长上限。未采纳 1 项：要求 `left-page-changed`（`commandIndex` 为 null）与 `warp-started`/`warp-completed` 成对相邻——无命令的页面事件按 P3-07 起的约定不排序，比较器无法把它归属到 Warp，强制相邻会拒绝合法序列（如页面未变时没有该事件）。simplify：合并像素写入器、抽出 `readIcon`、标记的冻结常量、`MAP_SIDE_LIMIT` 移到 Core 的地图规则数据、`ruleDataInputs` 两个返回共享字段；跳过需改范围外文件（`render/map` 的同名 `PixelRect`）或改变契约形状的建议。
- **文档影响（范围外，交 26）：** `docs/engineering/modules/core.md`（创建输入与 MW-01 检查、新状态/事件/原因码、标记种类、`RULES_VERSION` 5 与快照版本 4）、`docs/engineering/modules/app.md`（`CONTENT_INPUT_FIELDS` 列表）、`docs/engineering/modules/content.md`（应用侧规则数据输入表加 `mapGeometry`）、`docs/guides/tools.md`（`RECORDING_MAX_BYTES` 534,251,135，事件行每项 924 字节，最长事件为 `warp-completed`）、`docs/engineering/source-structure.md`（新文件 `map-rule-data.ts`）。

