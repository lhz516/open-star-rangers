---
type: plan
status: active
phase: P3
task: "05"
subtask: "26"
updated: 2026-10-10
---

# 26 — 接通 K 地图定稿的生产策略

**契约来源：** [spec](../spec.md) 的[执行检查点](../spec.md#执行检查点)规则 4、[战略地图输入](../spec.md#战略地图输入)“初始位置”“命令顺序”（经 05 定稿）；S-11；AC-02 的地图项、AC-12 的具体输入。
**依赖：** 05、25。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 计划新增 `src/ui/game-input/map-input-policy.ts`：按 05 定稿的初始位置规则（含是否沿用上次）与左键生效时机，给出生产地图策略，并注明来源（spec 定稿记录与事实记录的锚点）。
- 在装配中把该策略交给 22 的地图输入；生产几何仍为 null（P3-13 提供），因此本项不改变生产画面的可见行为，但使 P3-13 接入几何后即按定稿行为工作。
- Node 测试：策略值与定稿一致；地图输入在该策略下的初始位置与左键时机（以合成几何）。
- 若 05 只部分放行，仅接通已放行的项；未放行项保持无默认值并在输入状态中报告。

## 不包含

- 生产几何与原版布局（P3-13）；地图规则（P3-09）。

## 关键文件与契约

- 05 的 spec 定稿记录；22 的 `map-input.ts`；25 的装配（`src/app/composition/`）。
- 计划新增：`map-input-policy.ts`、`map-input-policy.test.ts`。

## 写入范围

- `src/ui/game-input/map-input-policy.ts`、`src/ui/game-input/map-input-policy.test.ts`
- `src/ui/game-input/map-input.ts`、`src/ui/game-input/map-input.test.ts`
- `src/app/composition/**`

## 验收标准

- [ ] 生产策略只来自 05 的定稿，带来源注释；未放行项没有默认值。
- [ ] Node 测试证明定稿的初始位置与左键时机生效。
- [ ] `pnpm exec vitest run src/ui/game-input` 与 `pnpm check` 通过；按 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 检查本项改动。

## 验证方法

- Node 测试；定稿值与 spec 记录逐项对照。

## 完成证据
