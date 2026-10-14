---
type: plan
status: active
phase: P3
task: "09"
subtask: "19"
updated: 2026-10-14
---

# 19 — map 分区与 Warp 驾驶舱读数

**契约来源：** [spec](../spec.md) 的 S-06、S-10、AC-06、AC-10；[地图 projection](../spec.md#地图-projection)、[Warp 的驾驶舱状态](../spec.md#warp-的驾驶舱状态)。
**依赖：** 14, 15, 18。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 计划新增 `src/core/projections/map.ts`，在 [projection.ts](../../../../../src/core/projections/projection.ts) 中使 `map` 就绪：未实现/无玩家/关闭/打开的判别；打开时按 D-01 输出框架与像素几何、接触点、覆盖、光标与放大范围、放大窗口成员与多选框、信息行（顺序、容量与截断）、标签与连线（按 04）、目的地与能量读数、可执行性原因；关闭时不给接触点与覆盖。
- 在 [combat.ts](../../../../../src/core/projections/combat.ts) 的 `flight.combat` 中加入 Warp 读模型：页 6 三条读数、12 型指示灯条件与标记读数（按 06、D-01）。
- [render-state.ts](../../../../../src/core/projections/render-state.ts) 给出 Warp 进度与标记的呈现判别。
- 输出深度冻结、脱离世界；读取不改世界与 RNG；不提供全实体列表。
- 正反回归：地图谓词外的单位不进入接触点、放大窗口、信息行与命中候选；同一单位仍可依 P3-07 成为雷达/目标或 Render State 对象。

## 不包含

- 桥接与诊断（21）；地图画面（P3-13）。

## 关键文件与契约

- [projection.ts](../../../../../src/core/projections/projection.ts)、[combat.ts](../../../../../src/core/projections/combat.ts)、[render-state.ts](../../../../../src/core/projections/render-state.ts)。

## 写入范围

- `src/core/projections/**`：`map.ts`（新增）、`projection.ts`、`combat.ts`、`render-state.ts` 与相邻测试。
- `src/core/world/create-world.test.ts`：Render State 新增 `warp` 字段的整体形状期望（协调者 2026-10-14 扩大范围）。

## 验收标准

- [x] AC-06：分区判别、信息行顺序/容量、多选框与隐藏目标连线策略按 D-01；正反回归通过；冻结与纯读取。
- [x] AC-10：页 6 读数、指示灯与标记读数在 projection 中给出；Render State 给出视角 1 与 Warp 进度；消费者无需从其他状态推导。
- [x] `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts` 与 `pnpm check` 通过。

## 验证方法

- Node 消费者契约测试；既有 radar/targeting/render-state 回归。

## 完成证据

- **实现：** 新增 [map.ts](../../../../../src/core/projections/map.ts) 的 `projectMap`，[projection.ts](../../../../../src/core/projections/projection.ts) 的 `map` 由 `not-implemented` 改为它：无玩家实体为 `{ readiness: 'ready', player: null }`；已提交视角不是 8 时为 `closed`，只给目的地、标记 ID 与 `warpRequest`；视角 8 时为 `open`，读帧尾建立的 `mapIcons`（只含地图谓词内的接触点），其余字段由图标表、玩家状态与静态地图规则数据派生：框架与像素几何、光标像素/世界点/放大范围（`map-frame.ts`）、接触点类别与覆盖（`map-visibility.ts`）、放大窗口成员（严格范围，trunc 后取 i32 低 16 位）与选中方框（三轴 |trunc(差)| < 1000）及编号距离（到玩家图标的 trunc 三维距离，玩家自身为 null）、信息行（`0x4ba80` 的容量、名称行可无数值行、达到容量后不再列出也不计数、计数行按原版次序且只在单位行未满时写出、不受容量限制）、标签（`0x6887f` 且在世界内）、玩家→光标连线、光标与目的地的 Warp 读数（`warp-energy.ts`，E = 0 时 `percent` 为 null）与 `warpRequest`（`systems/warp.ts` 的 `judgeWarpRequest`，以已提交的视角、目的地与 `world.clock` 判定）。[combat.ts](../../../../../src/core/projections/combat.ts) 的 `CombatPlayer.warp` 给出 12 型指示灯（+0xC8 = 0 或 +0xC8 + 64 × +0xA4 < 时钟，严格）与视角 1 时页 6 的 a、s、p、c；[render-state.ts](../../../../../src/core/projections/render-state.ts) 的 `warp` 在视角 1 时给出 serial、进度、n、u、L 与 15 个控制点的冻结副本，其余为 null。标记作为目标沿用 `CombatTarget`（种类 25、`map-marker`、速度 0、护盾 null）。
- **测试：** [map.test.ts](../../../../../src/core/projections/map.test.ts)（23 项）经真实 `World.step` 打开地图、选点（创建标记）、关图与 Warp 开始，逐字段核对 MW-11 的期望（由合成几何与原版公式手算）：接触点次序与去重叠、覆盖圆盘/圆环、放大成员/方框/编号、信息行（容量 25、3、5、2、0 的截断与计数次序）、标签、连线、读数（含 E = 0 与恰够）、门禁的各原因（含从基地打开、间隔边界）、关图的信息边界、没有玩家图标时的连线与读数、失效图标为故障；反向回归：未揭示的敌方、Warp 中与世界外的单位不进入接触点、放大窗口、信息行、标签与选点命中，同一单位仍是 P3-07 的目标、雷达接触点与 Render State 实体；纯读取（快照散列与 RNG 不变）、深度冻结与脱离世界；指示灯严格比较与门禁非严格的区别；页 6 与 Render State 只在视角 1 给出。既有 [projection.test.ts](../../../../../src/core/projections/projection.test.ts)、[combat.test.ts](../../../../../src/core/projections/combat.test.ts)、[render-state.test.ts](../../../../../src/core/projections/render-state.test.ts) 与 `create-world.test.ts`（写入范围已由协调者扩大）只增加新字段的期望。
- **检查：** `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts`（93 个文件、2727 项）通过；`pnpm check`（typecheck、lint、296 个文件 8842 项测试、build）通过。
- **放大窗口像素与无玩家图标（D-01 补定）：** 放大窗口成员的像素是 `0x4c5ec` 的结果，不含 `0x4b56c` 的错开（它按 Core 没有的 HUD 图标尺寸错开，没有规则读者，归 P3-13）；玩家没有图标时连线与两个读数从玩家当前位置计算，放大窗口距离为 null（P3-11 接入前不可达）。两者按 P3-02 spec 的 [MW-11](../../02/spec.md#mw-11-projection-与-render-state) 与审批第 14 项（协调者按预先授权补定），实现与测试即为此。
- **rubber-duck：** 指出 `0x4b56c` 的错开与 MW-11 原注释不符、没有玩家图标时的起点未写明，两者交协调者，已由 MW-11 与审批第 14 项补定；据其建议加强该情形的测试（编号为 null、目的地读数）并新增失效图标故障的测试。其余（信息行、标签掩码、覆盖、方框、成员判定、关图边界、冻结与纯读取、页 6 与 Render State）确认与契约一致。
- **simplify：** 复用 `combat.ts` 的 `craftRecord`、`reading`；合并冻结副本辅助函数；目的地读数改为具名函数；去掉多余的类型断言。未采纳：缓存静态几何与路径副本（每次读取新建副本更简单，开销很小）；把视角常量与 Warp 门禁移出 `systems/`（不在写入范围，现有 `rules/` 亦引用 `systems/`）。
- **文档影响（交 26，`docs/engineering` 不在本行写入范围）：** `docs/engineering/modules/core.md` 的 projection 一节：`map` 分区已就绪（形状、关闭时的信息边界、`warpRequest` 以 `world.clock` 判定、无玩家图标时的起点、放大像素不含 `0x4b56c` 的错开）、`CombatPlayer.warp`、Render State 的 `warp`；测试清单增加 `projections/map.test.ts`；`docs/engineering/source-structure.md` 新增 `projections/map.ts`。`docs/original/` 无新事实。

