---
type: plan
status: active
phase: P3
task: "12"
subtask: "19"
updated: 2026-10-15
---

# 19 — 星云背景

**契约来源：** [spec](../spec.md) 的 S-06、AC-09；[星云背景](../spec.md#星云背景)；Q-04。
**依赖：** 04, 16。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 计划新增 `src/render/flight/nebula/`：每个运行在经校验的 `NebulaBackgrounds.images` 原列表中用表现随机源均匀选起点，取连续 6 项回绕并保留重复；空列表拒绝，短列表按同一规则。
- 六个方向、屏幕位置、镜像与转置读法、取整、可见判定与清除按 Q-04 在逻辑画面中实现；DATA 直接显示、不透明、最近邻放大。
- 导出供 23 接入的 pass；测试用方向不对称的合成图案断言读法与位置，覆盖首尾、短列表、重复与空列表。

## 不包含

- 接入与浏览器读回（23、25）；截图对照（26）。

## 关键文件与契约

- 现有：[flight-data-content.ts](../../../../../src/content/flight/flight-data-content.ts) 的 `NebulaBackgrounds`。
- 计划新增：`src/render/flight/nebula/`。

## 写入范围

- `src/render/flight/nebula/**`：星云 pass 与测试。

## 验收标准

- [ ] AC-09（Node 部分）：选取、回绕、读法、位置与清除的断言通过；生产 15 项不硬编码。
- [ ] `pnpm exec vitest run src/render/flight/nebula` 通过。

## 验证方法

- Node 测试。

## 完成证据
