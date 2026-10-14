---
type: plan
status: active
phase: P3
task: "09"
subtask: "14"
updated: 2026-10-14
---

# 14 — 光标、选择与种类 25 标记

**契约来源：** [spec](../spec.md) 的 S-04、AC-04；[光标、跃迁目标与标记](../spec.md#光标跃迁目标与标记)。
**依赖：** 13, 28, 30。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- `map-point` hover 与 select：按 D-01 的空间约定量化到整数像素（0/1、像素边界与中心、非零原点），按 `0x4c4c0` 换算世界 x、y（无半像素，最大值止于世界最大值前一像素），按 `0x2bc30` 设定并夹取放大范围；比例的存储类型与运算按 02、07。
- select：按 02 确认的阶段读取图标列表（若为上一帧列表，由 Core 拥有并序列化），3 像素内最近图标的边界、并列与未命中，z 门禁两种状态；提交目的地与选择资格；有效 select 坐标不变时的点击事实按 02；多选框按 04；不把选框直接当作玩家目标切换（按 02 的结论）。
- 种类 25 标记：在 [entity-table.ts](../../../../../src/core/world/entity-table.ts) 中加入构造入口、来源、名称引用与表现判别；在 [movement.ts](../../../../../src/core/systems/movement.ts) 加入不读机型记录的模式 4 变体；各阶段的参与与创建/移动/首更新/移除/失效后再次选择按 03 的研究；保持 P3-07 的友方候选与雷达 `marker` 分类有效。
- 事件 `warp-destination-set` 按 D-01 的字段；hover 不发出音效事件。

## 不包含

- 可见性与接触点（15）；`map` 分区输出（19）。

## 关键文件与契约

- `src/core/rules/map-frame.ts`（计划新增，由 13 新建）、[entity-table.ts](../../../../../src/core/world/entity-table.ts)、[movement.ts](../../../../../src/core/systems/movement.ts)、[targeting.ts](../../../../../src/core/rules/targeting.ts)、[radar.ts](../../../../../src/core/rules/radar.ts)、[snapshot.ts](../../../../../src/core/replay/snapshot.ts)。

## 写入范围

- `src/core/systems/map.ts`、`src/core/systems/map.test.ts`
- `src/core/rules/map-frame.ts`、`src/core/rules/map-frame.test.ts`
- `src/core/rules/map-icons.ts`、`src/core/rules/map-icons.test.ts`：计划新增（图标列表与命中）。
- `src/core/world/entity-table.ts`、`src/core/world/entity-table.test.ts`
- `src/core/systems/movement.ts`、`src/core/systems/movement.test.ts`
- `src/core/rules/targeting.test.ts`、`src/core/rules/radar.test.ts`：标记的回归。
- `src/core/replay/snapshot.ts`、`src/core/replay/snapshot.test.ts`：新状态的写入器。
- `src/core/rules/startup-rotations.ts`、`src/core/rules/startup-rotations.test.ts`：计划新增，MW-12 的启动旋转表（按 28/29 的 R-A 判定）。
- `src/core/world/create-world.ts`、`src/core/world/rule-data.ts` 及其测试：`startupRotations` 的世界创建接入。
- `src/core/rules/firing.ts`、`src/core/rules/firing.test.ts`：P3-07 锁定计数对标记不读机型记录（MW-03）。（以上为协调者 2026-10-14 扩大范围）
- `src/core/systems/pipeline.ts`、`src/core/systems/pipeline.test.ts`、`src/core/systems/commands.ts`、`src/core/systems/commands.test.ts`、`src/core/world/world.test.ts`、`src/ui/dev/mission-diagnostics.test.ts`：`map-point` 的内部请求、有效目的地、帧尾地图步的接入与命令路由（协调者 2026-10-14 扩大范围；MW-07 第 1 步的接触谓词由本项在 `map-icons.ts` 实现，15 复用）。

## 验收标准

- [x] AC-04：量化、换算、夹取、3 像素边界、并列/未命中、z 门禁、命中列表的阶段/历史、hover 不改已提交点与多选框都符合独立期望。
- [x] 标记的创建/移动/失效后选择/首更新/移除符合 03，不伪造机型；友方目标与雷达消费有效；名称引用符合 T7；打开初值与 P3-05 起点落在同一整数像素。
- [x] `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts` 与 `pnpm check` 通过。

## 验证方法

- Node 规则、内容边界与流水线测试；起点与比例的本地数据核对（私有，只记判定）。

## 完成证据

2026-10-14，worker（分支 `exec-p3-09-14`，基于目标分支 `3074c320`；认领提交 `379ad395`，其后两次扩大写入范围）。

- **实现：**
  - 启动旋转表（MW-12 R-A）：[startup-rotations.ts](../../../../../src/core/rules/startup-rotations.ts) 按 28 的结论作为代码规则重现：Watcom `rand`（缺省种子 1）丢弃 1000 次后，以 30 修正后的方向表做 64 次 `0x56b8c`（重抽循环照原版保留，实际恰 128 次抽取），R0/R1 按闭式、double 运算加 `Math.fround`；`drawStartupRotation` 为 `0x56cd4`（1 次抽取，rand % 64）。表在世界创建时放入 `WorldRuleData.startupRotations`（[rule-data.ts](../../../../../src/core/world/rule-data.ts)，静态、冻结、不进快照；不依赖输入，因此不进 setupHash）。
  - 换算（[map-frame.ts](../../../../../src/core/rules/map-frame.ts)）：`quantiseMapPoint`（MW-04 的 ⌊比例 × s⌋ 并钳到 s − 1）与 `worldToMapPixel`（`0x4c524`：trunc(D(D(x − minX) × F(ppX)))，`FISTP` 越界/NaN 取 0x80000000，留低 16 位带符号；`inWorld` 含端点、无序在外）。
  - 图标列表与选点（[map-icons.ts](../../../../../src/core/rules/map-icons.ts)）：`isMapContact`（MW-07 第 1 步的 `0x2b8ec` 谓词：敌对种类须 `mapVisible`，Warp 与状态 6 跳过，世界矩形含端点，种类位 0、1 不论位置；协调者批准放在此处，15 复用）、`buildMapIcons`（种类表次序，`0x4c524` 后按 `0x4b3a8` 错开）、`deOverlap`（第 0 项不动、每项自身计数、移动后从 j = 0 重扫、第 9 次重合回到原像素）、`pickMapIcon`（`0x4c310`：每轴 ±3 含端点、整数距离最小、并列取先、排除种类位 0 与世界外）与 `selectDestination`（`0x4c4c0` 的 x、y，z 取命中图标记录的 z，否则 +0.0）。
  - 系统（[map.ts](../../../../../src/core/systems/map.ts)）：`judgeMapPoint`（MW-04：`player-unavailable` → 非地图 `wrong-context` → `accepted`，判定时量化；select 写 `CommandView.destination`），`applyMapPoint`（光标；select 写目的地，应用前目的地为 null 时经 `markerInit` 创建标记并做 1 次世界抽取取姿态、已有标记时故障，否则移动种类 25 的第一个实体并加放置序号，无标记时 `missing`；发出 `warp-destination-set`，hover 不发事件），`runMapStep`（帧尾：已提交视角为 8 时重建 `mapIcons`，否则清空）。[entity-table.ts](../../../../../src/core/world/entity-table.ts) 增加 `markerInit`（分配器缺省、表现就绪、模式 4 块、无机型记录）与导出的 `frozenVec`。
  - 接线（扩大的范围）：[pipeline.ts](../../../../../src/core/systems/pipeline.ts) 的 `CommandView.destination`（批次开始取已提交值）、`MapPointRequest` 的分派、标记的自身更新走通用生命周期（下一 tick 进入状态 7）、`frame-end` 先地图步后显示步；[commands.ts](../../../../../src/core/systems/commands.ts) 把 `map-point` 交给 map.ts。[movement.ts](../../../../../src/core/systems/movement.ts) 与 [firing.ts](../../../../../src/core/rules/firing.ts) 无需改动：12 已加的 `marker` 分支不积分，`0x2ddbc` 对不可锁种类（`0x206c87f` 含位 25）在读任何记录之前置 0。
- **AC-04 与标记（期望由 MW-02/03/04/05/07 与合成几何手算）：** [map.test.ts](../../../../../src/core/systems/map.test.ts)（正式 `World.step`）：量化的 0/1、像素中心与边界、P3-05 `mapStartPosition` 的起点（非零原点 (21, 45)，屏幕列 199 → 本地 178）落回打开时的光标；飞行/Warp/基地为 `wrong-context`、玩家被毁为 `player-unavailable` 且不改状态；hover 只改光标（无事件、无抽取），不改已提交目的地与标记（选择方框由目的地派生，其计算归 19）；首次 select 创建标记（位置 = 目的地、姿态 = `STARTUP_ROTATIONS[rand % 64]`、世界 RNG 恰前进 1、无 `object-instantiated`）；之后的 select（含坐标不变、同 tick 两次）移动并加放置序号、不抽取；关开地图保留目的地与标记；目的地非 null 而无标记时为 `missing` 且不重建；已有种类 25 实体时再创建为故障；标记下一 tick 进入状态 7、不移动、不停放、不进图标列表。图标列表：地图中帧尾建立、关图清空；3 像素内命中取图标 z，未命中 z 为 +0；不选玩家自身图标；读的是上一帧尾的列表（实体移动后仍命中旧像素与旧 z，下一 tick 才更新）；同 tick 先开图再 select 列表为空（差异 1）；错开后的像素决定命中（玩家为第 0 项，两个重合友方中前者移到 (+3, +3)）；同 tick 关图后的 select 为 `wrong-context`；命令视图的目的地取批次中最后一个被接受的 select 并只在请求处理中提交。规则测试：[map-frame.test.ts](../../../../../src/core/rules/map-frame.test.ts)（`0x4c524` 的截断方向、世界最大值落在像素 s、含端点与无序、i16 回绕与不定值、量化）、[map-icons.test.ts](../../../../../src/core/rules/map-icons.test.ts)（接触谓词各分支、错开的步序/重扫/世界外/第 9 次回位、列表次序与冻结脱离、选点边界/最小/并列/排除）、[startup-rotations.test.ts](../../../../../src/core/rules/startup-rotations.test.ts)（ISO C 示例序列的前 5 个值、整表 SHA-256 前缀等于 28 独立模型的 `20ece07b36ca54c4`、恰 128 次抽取且缺 1000 次时不同、前向行与方向规则一致、R1 的 +0、正交性、冻结、1 次抽取取 rand % 64；不提交表值）。
- **消费者回归：** [targeting.test.ts](../../../../../src/core/rules/targeting.test.ts)（真实标记在状态 7 起为友方模式候选，敌方与前向模式不选）、[radar.test.ts](../../../../../src/core/rules/radar.test.ts)（状态 7 起为 `marker` 类接触点）、[firing.test.ts](../../../../../src/core/rules/firing.test.ts)（以标记为目标时锁定为 0，且合成机型信息没有种类 25 的记录）、[movement.test.ts](../../../../../src/core/systems/movement.test.ts)（通过运动筛选但不积分、不读记录）、[entity-table.test.ts](../../../../../src/core/world/entity-table.test.ts)（`markerInit`）、[rule-data.test.ts](../../../../../src/core/world/rule-data.test.ts)（静态表在每个世界相同、冻结、不在快照中）、[snapshot.test.ts](../../../../../src/core/replay/snapshot.test.ts)（select 后的目的地、标记与图标列表进入快照，相同世界相同、不同点不同）。名称引用沿用 12 的 `map-marker`（T7）。既有期望随 `map-point` 接入调整：commands.test.ts、world.test.ts、map.test.ts 与 mission-diagnostics.test.ts（地图中为 `accepted`，飞行中为 `wrong-context`）。
- **检查：** `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts`：87 个文件、2,566 项通过；`pnpm check`（typecheck、lint、290 个文件 8,681 项测试、build）通过。“起点与比例的本地数据核对”：比例与起点的取值规则由 12 实现并已有 executable 记录的 52 个任务的本地判定；本项未另读原版数据（真实内容核对归 23）。
- **rubber-duck：** 无阻塞问题；采纳 1 项：`startupRotations` 按 MW-01 放入 `WorldRuleData` 并由标记从世界规则数据取表（原先直接读模块常量）。
- **simplify：** 采纳：量化与目的地选择移入 rules、`deOverlap` 直接接收投影结果并去掉多余拷贝、复用 `frozenVec` 与 `PLAYER_KIND_BIT`/`WINGMAN_KIND_BIT`、`ViewModes` 类型、内联零值检查、去掉空洞的 pipeline 断言。未采纳：与 combat-init 的 `NO_RULE_INPUTS` 合并、radar 私有的 `MARKER_KIND_BIT`（均在写入范围外）；把 `0xfffff` 换成 targeting 的 `FORWARD_KINDS`（语义不同）；把帧尾拆成两个阶段（阶段表由 P3-02 固定）；把选点结果放进请求（MW-04 已定请求形状）；把启动表移出 `WorldRuleData`（与 MW-01 相反）。
- **文档影响：** `docs/original/` 无新事实（R-A 的事实由 29 写入 executable）。`docs/engineering/**` 归 26，需更新：modules/core.md 的请求处理（`map-point` 请求、标记创建与移动、1 次世界抽取）、命令判定（`map-point` 的门禁与量化、`CommandView.destination`）、对象更新（标记走通用生命周期）、`frame-end`（地图步先于显示步，`mapIcons` 只在视角 8 的帧尾重建）、静态规则数据（`startupRotations`）；source-structure.md 增加 `rules/map-icons.ts`、`rules/startup-rotations.ts`。

