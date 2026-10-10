---
type: plan
status: active
phase: P3
task: "07"
subtask: "21"
updated: 2026-10-09
---

# 21 — 停放交战规则

**契约来源：** [spec](../spec.md) 的 S-09、AC-11（规则部分）；[停放对象的抽象交战](../spec.md#停放对象的抽象交战)。
**依赖：** 05, 14, 15。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 按 05 的 Q-09 结论实现 `0x30150` 的规则（以及 05 判定归本任务的 `0x2ffec` 部分）：按种类的不交战概率、目标引用的选择、目标状态与阵营门禁、距离与挂点射程、射击次数、导弹的选择与概率、伤害求和、TABL 4003 倍率与按种类的倍率、写回双方的计时；抽取次数与次序全部来自世界 RNG。
- 伤害经 15 的入口；停放对象被毁时直接待移除且不爆炸；事件按 08 定稿（例如 `hit` 的原因 `abstract`，不触发活动区的命中特效）。
- 实现为供停放更新调用的函数；接入 `parked-update` 阶段归 22。
- **测试：** 每个门禁与分支；倍率只用在本路径；抽取次数与次序；随机部分按代码推导的映射与原像计数。

## 不包含

- 停放更新的调度与离开世界（P3-06）及接线（22）；AI 目标策略（P3-08）。

## 关键文件与契约

- 使用 14 的挂点规则与 15 的伤害入口；12 的 TABL 4003 倍率（`hitDamageScale`）。
- 计划新增：`src/core/systems/parked-engagement.ts`、`src/core/rules/parked-engagement.ts` 及相邻测试。

## 写入范围

- `src/core/systems/parked-engagement.ts`：停放交战入口（新建）。
- `src/core/systems/parked-engagement.test.ts`：系统测试（新建）。
- `src/core/rules/parked-engagement.ts`：交战规则（新建）。
- `src/core/rules/parked-engagement.test.ts`：规则测试（新建）。

## 验收标准

- [ ] AC-11（规则）：调用条件、概率、目标与阵营门禁、距离、挂点、抽取与倍率按 Q-09；倍率不用于其他伤害路径。
- [ ] 停放对象被毁时直接待移除且不爆炸；抽取次数与次序正确。
- [ ] `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts`、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- Node 测试：以合成停放对象调用入口函数，断言伤害、事件与 RNG 后态；期望独立推导。
- 接线与停放/活动切换的测试在 22；原版对照见 27。

## 完成证据
