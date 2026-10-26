---
type: plan
status: active
phase: P3
task: "13"
subtask: "15"
updated: 2026-10-25
---

# 15 — 索引色图元、字形与格式化

**契约来源：** [spec](../spec.md#二维绘制语义与调色板) 的 S-03，AC-05/06。
**依赖：** 10。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 按 Q 结论实现不透明/颜色键/覆盖掩码、图元像素集合、安全屏幕边界与无单元裁剪，保留索引 0 的不透明用途。
- 字体读取规范 glyphRows/8 列、独立 advance、高度、大写与 charMap；DIAG 换行先分行。
- 实现已用格式的封闭转换和数值/长度边界；项目文字与原版字节字符串分开，不吞未知字符或引用。
- 直接使用已经扩展的 8 位 palette；不再解析原始 RLE。

## 不包含

不建 DOM/Canvas 2D 文字渲染，不决定游戏数值或修改现有 parser。

## 关键文件与契约

- [font-payload.ts](../../../../../src/content/graphics/font-payload.ts)、[glyph-lookup.ts](../../../../../src/content/graphics/glyph-lookup.ts)、[hud-text-payload.ts](../../../../../src/content/hud/hud-text-payload.ts)。
- 计划新增 `src/render/cockpit/raster/`，纯像素/字体/格式化及合成测试。

## 写入范围

- `src/render/cockpit/raster/**`：计划新增 helper 与测试。

## 验收标准

- [ ] 字形跨 advance、含端点图元、四色边界和 palette0/1 颜色都精确。
- [ ] 负数、舍入、阈值、%%、换行、未知转换明确处理。
- [ ] 输入不被修改，无重复 VGA 扩展，无原版文本硬编码。

## 验证方法

`pnpm test -- src/render/cockpit/raster`、`pnpm check`；负对照断言像素差而非只检查调用；[simplify](../../../../../.agents/skills/simplify/SKILL.md) 限已有绘制需求。

## 完成证据
