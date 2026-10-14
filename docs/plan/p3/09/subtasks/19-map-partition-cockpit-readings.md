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

## 验收标准

- [ ] AC-06：分区判别、信息行顺序/容量、多选框与隐藏目标连线策略按 D-01；正反回归通过；冻结与纯读取。
- [ ] AC-10：页 6 读数、指示灯与标记读数在 projection 中给出；Render State 给出视角 1 与 Warp 进度；消费者无需从其他状态推导。
- [ ] `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts` 与 `pnpm check` 通过。

## 验证方法

- Node 消费者契约测试；既有 radar/targeting/render-state 回归。

## 完成证据
