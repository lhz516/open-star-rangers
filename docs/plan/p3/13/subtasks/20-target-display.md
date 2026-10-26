---
type: plan
status: active
phase: P3
task: "13"
subtask: "20"
updated: 2026-10-25
---

# 20 — 目标显示屏与独立深度场景

**契约来源：** [spec](../spec.md#右侧目标显示屏) 的 S-07，AC-12/18。
**依赖：** 14, 15, 17。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 按04/08的目标选择器、变体和内容绘制专用灯光/相机/背景，不以世界Render State缺失隐藏已选目标。
- 实现无目标、Warp离开提示、标记十字、距离/速度/护盾/机型文字与严格刷新。
- 干扰使用17交付的真实模块，集成不以替身验收。
- GPU计划和目标独立深度附件计入预算；合成回游戏图像时不改世界深度。

## 不包含

不改目标清除规则和P3-12世界灯光，不实现SNIP算法副本。

## 关键文件与契约

- [model-lighting-layer.ts](../../../../../src/render/flight/lighting/model-lighting-layer.ts)、[flight-gpu-cache.ts](../../../../../src/render/flight/renderer/flight-gpu-cache.ts) 只读复用。
- 计划新增 `src/render/cockpit/target-display/`；复用17的 interference 模块。

## 写入范围

- `src/render/cockpit/target-display/**`：目标屏场景、数值、缓存及测试。

## 验收标准

- [ ] 目标变体/离场/无目标/标记/零分母与计数正确。
- [ ] 使用真实干扰模块，状态14门禁与节奏不重复推进。
- [ ] 独立深度/资源预算/释放正确，不破坏Warp保留深度。

## 验证方法

`pnpm test -- src/render/cockpit/target-display`、`pnpm check`；[simplify](../../../../../.agents/skills/simplify/SKILL.md) 仅目标屏，像素和真实场景在27/31验证。

## 完成证据
