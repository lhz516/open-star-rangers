---
type: plan
status: active
phase: P3
task: "07"
subtask: "19"
updated: 2026-10-09
---

# 19 — 碰撞

**契约来源：** [spec](../spec.md) 的 S-06（碰撞）、AC-08（碰撞部分）；[命中与碰撞](../spec.md#命中与碰撞)。
**依赖：** 03, 15, 18。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 按 03 的 Q-06 结论实现 `collision` 阶段（`collision.ts` 导出 `run`）：先玩家对其他对象（`0x29670`），再其他对象之间（`0x29934`），只对状态 7 及以上的对象。
- 检测几何（使用 12 的碰撞形状）、伤害公式与除以 (3 − 组) 的位置；参数记录 +0x5C 非零的碎片对玩家只在前 组 × 2 + 2 次接触中造成伤害的计数方式与计数状态；伤害经 15 的入口，`hit` 的原因为 `collision` 或 `fragment`。
- **测试：** 两遍的次序与状态筛选；几何边界；难度因子；碎片接触计数的边界（第 组 × 2 + 2 次与下一次）；同 tick 多次碰撞与死亡只发一次；期望独立推导。

## 不包含

- 弹丸命中（17）；运动（P3-06、22）；碰撞可视化（P3-04）。

## 关键文件与契约

- `src/core/systems/collision.ts`（11 新建）：碰撞阶段。
- 使用 12 的 `src/core/rules/collision-shapes.ts`、15 的伤害入口与 18 的碎片实体。
- 计划新增：`src/core/rules/collision.ts` 及相邻测试。

## 写入范围

- `src/core/systems/collision.ts`：碰撞阶段。
- `src/core/systems/collision.test.ts`：碰撞系统测试（新建）。
- `src/core/rules/collision.ts`：碰撞判定与伤害公式（新建）。
- `src/core/rules/collision.test.ts`：碰撞规则测试（新建）。

## 验收标准

- [ ] AC-08（碰撞）：`0x29670`、`0x29934` 的次序、筛选、检测与伤害公式按 Q-06；难度因子在正确位置。
- [ ] AC-08（碰撞）：碎片接触计数的边界正确；不从模型或渲染网格推导碰撞体。
- [ ] `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts`、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- Node 测试：以合成实体放置重叠与相邻位置，经正式 `step` 断言伤害、事件与计数。
- 原版对照见 27。

## 完成证据
