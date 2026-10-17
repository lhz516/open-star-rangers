---
type: plan
status: active
phase: P3
task: "12"
subtask: "21"
updated: 2026-10-17
---

# 21 — 爆炸精灵与屏幕闪光

**契约来源：** [spec](../spec.md) 的 S-09、S-10、AC-13、AC-14；[爆炸精灵与屏幕闪光](../spec.md#爆炸精灵与屏幕闪光)；Q-03、Q-06、Q-09。
**依赖：** 03, 04, 13, 16。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 计划新增 `src/render/flight/sprites/`：帧号与隐藏按 textures §6 与 X4（复用或核对 `explosionFrame`）；以投影位置为中心、按 Q-09 的整数缩放（在逻辑像素中计算）；透明游程不画、DATA 直接显示；深度与遮挡按 Q-03、Q-09；选择来自 12 与 13。
- 计划新增 `src/render/flight/flash/`：三种闪光的触发（由 `hit`、实际爆炸激活与 13 的闪光请求驱动）、持续、抽取节奏、并发与级别按 Q-06 与 `data/scene-settings`；调色板空间变换作用于完整 4:3 游戏画面（含 P3-13 的层），不作用于黑边与 React 控件；第 0、1 类闪光每次抽取 r ≥ 0 时整个游戏画面上移 (r AND 0xFFFE)/2 个逻辑行，r = −1 保持上一次平移，结束时复位为 0，第 2 类不平移，露出的行为基色黑（spec 2026-10-17 修订）；只取任务时钟，暂停时冻结。
- 导出供 23 接入的 pass；测试覆盖帧号边界、缩放边界、遮挡、闪光触发与覆盖规则，以及平移行数、r = −1 保持、结束复位与第 2 类不平移。

## 不包含

- 接入与浏览器读回（23、25）。

## 关键文件与契约

- 现有：[explosions.ts](../../../../../src/core/rules/explosions.ts)、[flight-data-content.ts](../../../../../src/content/flight/flight-data-content.ts)。
- 计划新增：`src/render/flight/sprites/`、`src/render/flight/flash/`。

## 写入范围

- `src/render/flight/sprites/**`：爆炸精灵 pass 与测试。
- `src/render/flight/flash/**`：屏幕闪光与测试。

## 验收标准

- [ ] AC-13（Node 部分）：帧号、隐藏、中心、缩放、透明与遮挡符合规则。
- [ ] AC-14（Node 部分）：三种闪光的触发、持续、节奏、级别与调色板变换符合 Q-06；第 0、1 类的画面平移符合 spec；暂停冻结。
- [ ] `pnpm exec vitest run src/render/flight/sprites src/render/flight/flash` 通过。

## 验证方法

- Node 测试。

## 完成证据
