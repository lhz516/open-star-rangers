---
type: plan
status: active
phase: P3
task: "09"
subtask: "15"
updated: 2026-10-14
---

# 15 — 可见性与 object-sets

**契约来源：** [spec](../spec.md) 的 S-05、AC-05；[可见性与迷雾](../spec.md#可见性与迷雾)。
**依赖：** 09, 12。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 计划新增 `src/core/systems/object-sets.ts`，接入 [pipeline.ts](../../../../../src/core/systems/pipeline.ts) 的 `object-sets` 阶段：按 03 重建友方与敌方机体集合（次序、清理与重置）、每架机体的地图可见标志基础值（含来源记录例外）、刷新时机与节流历史；视角 8 时按严格平面距离与机型 +0x0C 置位。
- 计划新增 `src/core/rules/map-visibility.ts`：`0x2b8ec` 的全部过滤与例外（种类、Warp、状态 6、可见、世界矩形、种类 1 与 2）；覆盖的来源、半径与圆盘/圆环分类；历史探索按 03 与 09 的已确认结论（无证据则本项阻塞，不默认）。
- 只有一份集合与标志实现，供 P3-08 复用；若执行基线已集成其他任务的同一阶段实现，复用并补足。
- 不给目标、雷达、碰撞或 Render State 追加地图迷雾门禁；保留其既有测试为负向回归。
- 测试覆盖移动、停放、Warp、来源消失与重新开图后的状态。

## 不包含

- `map` 分区输出（19）；AI 对集合的消费（P3-08）。

## 关键文件与契约

- [pipeline.ts](../../../../../src/core/systems/pipeline.ts)、[entity-table.ts](../../../../../src/core/world/entity-table.ts)、[world-state.ts](../../../../../src/core/world/world-state.ts)、[radar.ts](../../../../../src/core/rules/radar.ts)、[targeting.ts](../../../../../src/core/rules/targeting.ts)。

## 写入范围

- `src/core/systems/object-sets.ts`、`src/core/systems/object-sets.test.ts`
- `src/core/rules/map-visibility.ts`、`src/core/rules/map-visibility.test.ts`
- `src/core/systems/pipeline.ts`、`src/core/systems/pipeline.test.ts`
- `src/core/world/world-state.ts`：只在 D-01 已定的字段内写入。
- `src/core/replay/snapshot.ts`、`src/core/replay/snapshot.test.ts`：集合与历史的写入器。

## 验收标准

- [ ] AC-05：基础值与例外、刷新时机、严格边界、`0x2b8ec` 的全部过滤/例外有独立测试；移动、停放、Warp、来源消失与重新开图后正确。
- [ ] 覆盖半径/分类与历史探索有已确认结论并实现；集合、标志、刷新历史与清理只有一份。
- [ ] 目标、雷达与 Render State 的既有测试未改且通过（未加全局迷雾过滤）。
- [ ] `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts` 与 `pnpm check` 通过。

## 验证方法

- Node 规则与阶段测试，期望独立推导。

## 完成证据
