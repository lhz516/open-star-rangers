---
type: plan
status: active
phase: P3
task: "12"
subtask: "17"
updated: 2026-10-15
---

# 17 — 模型、光照与明暗级

**契约来源：** [spec](../spec.md) 的 S-04、AC-07；[模型、光照与第 2 列表](../spec.md#模型光照与第-2-列表)；Q-02、Q-12。
**依赖：** 02, 16。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 计划新增 `src/render/flight/lighting/`：按 02 的结论，从 `ImagePayload.indices` 与源 `PalettePayload.entries` 生成明暗级，再按 `nearestColourMap` 的规则映射到 DATA；不从 `expandImage` 的已量化 RGBA 推回源色。
- 两盏灯取 `data/scene-settings`；着色、抖动、贴图采样与环绕按 Q-02；部件标志按 Q-12 解释 `sourceFlags`；最终颜色是 DATA 中的一项；不用 tone mapping 或颜色空间转换。
- 以 `src/render/flight/lighting/` 导出供 23 接入的绘制 pass；可复用 `modelPartItems` 的几何，但材质语义按 Q-02、Q-12。
- 测试：每个光照方向、明暗级边界、贴图与无贴图部件、各标志值的独立期望 DATA 索引；能区分“先量化再着色”的错误。

## 不包含

- 受击闪烁（18）。
- 接入渲染器（23）；浏览器读回（25）；原版画面比较（26）。

## 关键文件与契约

- 现有：[model-payload.ts](../../../../../src/content/models/model-payload.ts)、[model-parts.ts](../../../../../src/content/models/model-parts.ts)、[image-payload.ts](../../../../../src/content/graphics/image-payload.ts)、[expand-image.ts](../../../../../src/content/graphics/expand-image.ts)、[flight-data-content.ts](../../../../../src/content/flight/flight-data-content.ts)。
- 计划新增：`src/render/flight/lighting/`。

## 写入范围

- `src/render/flight/lighting/**`：明暗级、光照 pass 与测试。

## 验收标准

- [ ] AC-07（Node 部分）：独立期望的 DATA 索引与颜色全部通过；保留源索引与色表。
- [ ] `pnpm exec vitest run src/render/flight/lighting` 通过。

## 验证方法

- Node 测试；合成内容来自 [models.test-support.ts](../../../../../src/content/models/models.test-support.ts)。

## 完成证据
