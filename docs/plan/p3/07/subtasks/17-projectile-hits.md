---
type: plan
status: active
phase: P3
task: "07"
subtask: "17"
updated: 2026-10-09
---

# 17 — 弹丸运动与命中

**契约来源：** [spec](../spec.md) 的 S-05（弹丸）、S-06（命中）、AC-07（弹丸部分）、AC-08（规则部分）；[弹丸与导弹](../spec.md#弹丸与导弹)、[命中与碰撞](../spec.md#命中与碰撞)。
**依赖：** 03, 14, 15, 18。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **弹丸运动：** 按 03 的 Q-05 结论实现弹丸的单步运动（模式 1）、寿命与射程到期；到期经自身更新提出离开（`projectiles.ts` 的按种类更新）。单步运动与命中检测实现为供移动阶段调用的函数；接入移动阶段归 22。
- **命中检测：** 按 Q-06 的几何、前后位姿、时间段与遍历次序实现：先机体后碎片、首个命中即停止；发射者、友方、已被毁源、停放与已停靠对象的过滤；多个同时相交的目标；使用 12 的碰撞形状与点测试。不以模型包围盒、渲染网格或大包围球代替。
- **命中结果：** 命中机体时调用 15 的伤害入口并发出 `hit`；命中碎片时扣减碎片耐久，耗尽时按 Q-06 移除；弹丸进入状态 8 后的处理；按 08 定稿写入受击效果的开始时钟（Render State 的 `hitShimmerStart`）。
- **高速弹丸：** 一个 tick 两端都在目标外而路径穿过、擦边与完整漏过的情形，按 Q-06 区分原版行为与固定步长引入的差异。
- **测试：** 运动与到期；几何与严格边界、内框；过滤、多目标与停止；高速情形；碎片耐久；归因在发射者移除后保留；期望独立推导。

## 不包含

- 移动阶段的接线（22）；导弹（20）；机体之间的碰撞（19）；受击闪烁的绘制（P3-12）。

## 关键文件与契约

- `src/core/systems/projectiles.ts`（11 新建）：弹丸的按种类更新。
- 使用 12 的 `src/core/rules/collision-shapes.ts`、15 的伤害入口与 18 的碎片实体。
- 计划新增：`src/core/rules/projectile-motion.ts`、`src/core/rules/hit-tests.ts` 及相邻测试。

## 写入范围

- `src/core/systems/projectiles.ts`：弹丸更新与命中结果。
- `src/core/systems/projectiles.test.ts`：弹丸系统测试（新建）。
- `src/core/rules/projectile-motion.ts`：单步运动与到期（新建）。
- `src/core/rules/projectile-motion.test.ts`：运动测试（新建）。
- `src/core/rules/hit-tests.ts`：命中几何与遍历（新建）。
- `src/core/rules/hit-tests.test.ts`：命中测试（新建）。

## 验收标准

- [ ] AC-07（弹丸）：运动、寿命与射程到期按 Q-05。
- [ ] AC-08（规则）：Q-06 的几何与判定次序可独立断言，覆盖严格边界、内框、友方/自身/停放/被毁过滤与多个相交对象。
- [ ] AC-08（规则）：高速弹丸的穿过、擦边与完整漏过按证据区分原版行为与步长误差；碎片耐久与移除正确；不从模型或渲染网格推导碰撞体。
- [ ] `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts`、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- Node 测试：几何函数以构造的前后位姿断言；系统测试以合成实体断言命中结果、事件与归因。
- 流水线中的命中集成测试在 22；原版对照见 27。

## 完成证据
