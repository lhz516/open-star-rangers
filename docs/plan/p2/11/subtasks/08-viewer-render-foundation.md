---
type: plan
status: active
phase: P2
task: "11"
subtask: "08"
updated: 2026-10-06
---

# 08 — 查看渲染基础与二维项

**契约来源：** [spec](../spec.md) 的 S-07、S-09（颜色空间、过滤与量化）、AC-12（Node）、AC-14（绘制计数），以及[查看项与渲染](../spec.md#查看项与渲染)中的图像、调色板、布局、字库与按需绘制，[呈现约定](../spec.md#呈现约定)。
**依赖：** 无。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 新增 DOM-free 的查看渲染（`src/render/viewer/`），接收 [render-surface.ts](../../../../../src/render/scene/render-surface.ts) 的 `RenderSurface`，或在表面不可用时只报告原因。
  - **状态与诊断：** `ready`、`context-lost`、`failed`、`unavailable`、`disposed`，失败附原始错误；诊断含绘制次数与 GPU 计数（来自 `gpuStats()`）。
  - **按需绘制：** 只在显示项变化、视图参数变化、尺寸或像素比变化与上下文恢复时同步绘制一次；视图参数未变时不绘制；不请求动画帧。
  - **布局：** 用 [viewport-layout.ts](../../../../../src/render/viewport/viewport-layout.ts) 的 4:3 布局。
  - **释放：** 释放全部几何、材质、纹理，再释放表面，按 [cleanup.ts](../../../../../src/render/scene/cleanup.ts) 的方式尝试每一步；释放后迟到的回调不再绘制。
- **二维显示项：**
  - 图像：`expandImage` 的 RGBA 上传为数据纹理，按整数倍放大居中，透明处显示中性棋盘格；
  - 调色板：每行 16 个色块；
  - 布局：`composeLayout` 的结果覆盖整个 4:3 区域；
  - 字库：按字形序号排成网格，白字黑底。
- **呈现约定（二维部分）：** 纹理不做颜色空间转换，最近邻过滤，不生成 mipmap，渲染器不做 tone mapping；读回的字节等于源字节。约定集中在一处，写入[源码结构](../../../../engineering/source-structure.md)并标注置信度。
- [browser-webgl-surface.ts](../../../../../src/render/webgl/browser-webgl-surface.ts) 的画布无障碍名称改由调用方提供；合成演示传原来的文字，行为不变。
- **Node 测试**（用 Three.js 对象与录制用的表面替身 [render-surface.test-support.ts](../../../../../src/render/scene/render-surface.test-support.ts)）：
  - 上传的纹理数据与 `expandImage`、`composeLayout` 的结果逐字节相同；
  - 调色板色块与字形单元的像素正确；
  - 纹理的颜色空间、过滤与 mipmap 设置；
  - 绘制计数：变化时恰好一次，未变时为零；
  - 状态转换与释放后 GPU 计数为零；
  - 上下文丢失后不绘制，恢复后重画。

## 不包含

- 模型与效果（09）；所有者、音频与 React 页面（10、11）；浏览器像素读回（11）。

## 关键文件与契约

- 计划新增 `src/render/viewer/` 的模块与相邻测试；修改 [browser-webgl-surface.ts](../../../../../src/render/webgl/browser-webgl-surface.ts) 及其调用方。
- 复用：[expand-image.ts](../../../../../src/content/graphics/expand-image.ts)、[compose-layout.ts](../../../../../src/content/graphics/compose-layout.ts)、[font-payload.ts](../../../../../src/content/graphics/font-payload.ts)、[glyph-lookup.ts](../../../../../src/content/graphics/glyph-lookup.ts)、[palette-payload.ts](../../../../../src/content/graphics/palette-payload.ts)；参照 [synthetic-renderer.ts](../../../../../src/render/synthetic/synthetic-renderer.ts) 的状态与释放模式。

## 验收标准

- [ ] AC-12（Node）：纹理数据与 `expandImage`、`composeLayout` 逐字节相同；调色板与字形单元的像素正确。
- [ ] AC-14（Node）：绘制计数在变化时恰好一次、未变时为零；不请求动画帧；释放后 GPU 计数为零；上下文丢失与恢复的行为如上。
- [ ] 呈现约定的二维部分（颜色空间、过滤、量化）实现于一处，并写入源码结构。
- [ ] 合成演示的画布无障碍名称不变，现有渲染测试通过。
- [ ] `render/` 不导入 `original-data`；`pnpm check` 通过。

## 验证方法

- `pnpm exec vitest run src/render`，完成前 `pnpm check`。
- 浏览器像素读回见 11。按 execute-goal 做 rubber-duck 与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据
