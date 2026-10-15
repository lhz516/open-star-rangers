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
**依赖：** 12, 14。
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
- `src/core/rules/map-icons.ts`、`src/core/rules/map-icons.test.ts`、`src/core/world/world.test.ts`：复用或迁移 14 的接触谓词 `isMapContact` 与整体期望（协调者 2026-10-14 扩大范围）。

## 验收标准

- [x] AC-05：基础值与例外、刷新时机、严格边界、`0x2b8ec` 的全部过滤/例外有独立测试；移动、停放、Warp、来源消失与重新开图后正确。
- [x] 覆盖半径/分类与历史探索有已确认结论并实现；集合、标志、刷新历史与清理只有一份。
- [x] 目标、雷达与 Render State 的既有测试未改且通过（未加全局迷雾过滤）。
- [x] `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts` 与 `pnpm check` 通过。

## 验证方法

- Node 规则与阶段测试，期望独立推导。

## 完成证据

2026-10-14，worker 15（分支 `exec-p3-09-15`，基于认领提交 `9d4096c6`）。

- **实现：** [object-sets.ts](../../../../../src/core/systems/object-sets.ts) 的 `rebuildObjectSets`（`0x2f028`：种类位 0–19 按种类表次序、不看状态/活动/被毁/Warp，`mapVisible` 先取基础值 false——MW-01 不导入 +0x7C，按 `0x93780` 分入敌方/友方，冻结）与 `updateObjectSets`（每 tick 重建，无节流历史；已提交视角为 8 时再揭示），接入 [pipeline.ts](../../../../../src/core/systems/pipeline.ts) 的 `object-sets` 阶段（能量之后、停放更新之前）。[map-visibility.ts](../../../../../src/core/rules/map-visibility.ts) 是唯一的揭示 `revealMapVisibility`（`0x2ee60`，供 P3-08 在任何视角以上次重建的集合调用）：逐友方置可见，r 取其自身机型 +0x0C，严格平面距离 D(dx²)+D(dy²) < D(r²)（无序算在内），失效 ID 遇到即删且保持次序，本次揭示数等于敌方集合当前大小时立即返回；另有接触点分类 `mapContactClass`（0 / `0x6c87f` / 其余）与覆盖 `mapCoverage`（trunc(+0x0C × ppX) 按 i32 存储，≤ 0 或越界为 null；玩家与友方为圆盘、敌方为圆环），供 19 使用。接触谓词复用 14 的 `isMapContact`，未复制。没有历史探索状态（D-01/MW-06，03 的已确认代码结论）。
- **测试：** `map-visibility.test.ts`（14 项：严格边界、z 忽略、无序、各友方自身范围、只读集合不看状态/Warp、已可见敌方不计数、提前返回、无敌方时遍历全部友方、失效 ID 的删除与提前返回后保留、无改动时不换集合、缺机型记录故障、分类与覆盖半径/样式/0/越界）；`object-sets.test.ts`（10 项：重建的次序与成员、基础值、20 个种类按 `0x93780` 的划分；流水线中飞行视角每 tick 重建且不揭示、新机体加入与移除；开图当 tick 揭示并进入同 tick 的图标列表、关图 tick 不揭示、重开再次揭示（无历史）；严格边界；移动后下一 tick 隐藏；来源消失；停放机体揭示与被揭示；Warp 中友方仍揭示但不是接触点；从地图开始 Warp 的 tick 视角为 1 不揭示、图标清空）；`snapshot.test.ts` 新增集合与标志写入快照、JSON 往返与等输入等结果；`pipeline.test.ts` 的已实现阶段清单加入 `object-sets`。期望按 MW-06/MW-07 与 executable 的“接触点”独立写出；变异检查（非严格比较、去掉提前返回、视角 8 以外也揭示、不重置基础值）均使测试失败。
- **负向回归：** 目标、雷达、碰撞与 Render State 的代码与测试未改动且通过；`map-icons` 的 `isMapContact` 测试未改动。
- **命令：** `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts`（92 个文件 2704 项通过）；`pnpm check` 通过（295 个文件 8819 项，构建成功）。
- **rubber-duck：** 未发现问题。**simplify：** 快照测试改用 `ALL_KINDS`；共享 `CRAFT_KINDS`/i32 截断/测试的机型记录覆盖助手与 `isEnemyKind` 需改写入范围外的文件（entity-table、map-frame、world.test-support、targeting），未做；揭示的数组拷贝只在地图 tick、规模受实体上限约束，保留以求清晰。
- **文档影响：** `docs/original/` 无新事实（实现依据已在 executable 的“接触点”与 T9）。`docs/engineering/modules/core.md` 第 227 行阶段表与第 635、643 行仍写 `object-sets` 为空、建议归 P3-08，`source-structure.md` 缺 `rules/map-visibility.ts`、`systems/object-sets.ts`：属 26 的范围，已在 worker 报告中列出。

