---
type: plan
status: active
phase: P3
task: "07"
subtask: "21"
updated: 2026-10-10
---

# 21 — 停放交战规则

**契约来源：** [spec](../spec.md) 的 S-09、AC-11（规则部分）；[停放对象的抽象交战](../spec.md#停放对象的抽象交战)；P3-02 spec 的 [CR-09](../../02/spec.md#cr-09-与-p3-06-的接口d-03)（停放更新的入口、读写的字段与数值）、[CR-06](../../02/spec.md#cr-06-领域事件与次序d-01)（`hit` 的 `parked` 原因与事件次序）、[CR-14](../../02/spec.md#cr-14-容量快照与版本d-01)（停放多目标的事件上界）。
**依赖：** 05, 14, 15。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **入口（E1，CR-09）：** P3-06 的停放遍历对每个本次更新的对象，在离开世界（`0x2f314`）之后调用一次：`ai.mode` = 1 时为多目标 `0x2ffec`（E2），否则为 `0x30150`（E3）。实现为供停放更新调用的函数；接入 `parked-update` 阶段归 22。
- **读写字段（CR-09）：** 读 `ai.mode`、`ai.target`、`ai.objectTarget`、`formation.leader` 与 `ruleInputs.aiValueB`（+0xE0）；写 `ai.objectTarget`（多目标）与双方的 `nextEnergyClock`。
- **规则（E3）：** 按种类的不交战概率、目标引用的选择、目标状态与阵营门禁、距离（含目标半径）与挂点射程、射击次数、导弹的选择与概率、伤害求和、TABL 4003 倍率与按目标种类的倍率；抽取全部来自世界 RNG，并与 P3-06 的停放更新逐对象交错（E4）。
- **数值（E5）：** 经过时间含活动期间，≥ 2³² 为 Core 故障（约 777 天，不可达）；射击次数 q = floor(经过时间 × 炮 +0x14 ÷ 64)，炮 +0x14 的范围由 12 的载入检查保证；炮伤害的合计按 i32 回绕。
- **伤害与事件：** 伤害以射击者自身的种类、来源为空调用 15 的 `0x2a694`（不经 `0x2a40c`、`0x2a5fc`，不写 `hitFeedbackClock`）；`hit` 的原因为 `parked`，攻击者为射击者（`shooter`），击杀与事件类别按射击者种类（E6）。停放对象被毁时直接待移除且不爆炸（`object-destroyed` 的 `outcome` 为 `removed`）。事件位于 P3-06 对同一对象的 `object-left-world` 之后；同一遍历中先被毁的对象之后被跳过（E1）。
- **测试：** 每个门禁与分支；多目标与单目标；倍率只用在本路径；射击次数与 i32 回绕；经过时间的故障边界；抽取次数与次序；随机部分按代码推导的映射与原像计数；事件的字段与次序。

## 不包含

- 停放更新的调度、经过时间与离开世界（P3-06）及其接线（22）；AI 目标策略（P3-08）。

## 关键文件与契约

- 使用 14 的挂点规则、15 的 `0x2a694` 与 12 的 TABL 4003 倍率（`hitDamageScale`）。
- 计划新增：`src/core/systems/parked-engagement.ts`、`src/core/rules/parked-engagement.ts` 及相邻测试。

## 写入范围

- `src/core/systems/parked-engagement.ts`：停放交战入口（新建）。
- `src/core/systems/parked-engagement.test.ts`：系统测试（新建）。
- `src/core/rules/parked-engagement.ts`：交战规则（新建）。
- `src/core/rules/parked-engagement.test.ts`：规则测试（新建）。

## 验收标准

- [ ] AC-11（规则）：调用条件、概率、目标与阵营门禁、距离、挂点、抽取与倍率按 E1–E7；倍率不用于其他伤害路径；读写的字段与 CR-09 一致。
- [ ] 经过时间 ≥ 2³² 为故障；炮伤害合计按 i32 回绕；`hit` 的原因为 `parked`；停放对象被毁时直接待移除且不爆炸；抽取次数与次序正确。
- [ ] `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts`、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- Node 测试：以合成停放对象调用入口函数，断言伤害、事件与 RNG 后态；期望独立推导。
- 接线与停放/活动切换的测试在 22；原版对照见 27。

## 完成证据
