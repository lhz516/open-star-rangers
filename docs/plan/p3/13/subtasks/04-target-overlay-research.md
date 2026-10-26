---
type: plan
status: active
phase: P3
task: "13"
subtask: "04"
updated: 2026-10-25
---

# 04 — 目标显示屏与 F1 叠加研究

**契约来源：** [spec](../spec.md#右侧目标显示屏) 的 S-07/S-09/S-13，Q-08/Q-10/Q-13，AC-12/15/21。
**依赖：** 无。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 核对 T7 的目标变体 +0x06、模型引用、观察距离、灯光、背景与文字/零分母分支。
- 完整清点 F1 十字、目标框、提前量标记/连线、读数和门禁；区分逻辑数据缓存与插值投影。
- 核对 Warp 不绘制叠加、被毁标签框、目标离开计数及状态 9 视觉跳过；不把声音门禁等同视觉门禁。

## 不包含

不重做 P3-12 相机/世界灯光，不实现 P3-14 声音状态机。

## 关键文件与契约

- [projection.ts](../../../../../src/core/projections/projection.ts) 的 CombatTarget，[flight-layers.ts](../../../../../src/render/flight/composition/flight-layers.ts)。
- [executable](../../../../original/formats/executable.md) T7、自动视角；[textures](../../../../original/formats/textures.md) TEX 11089。

## 写入范围

- `local/research/p3-13/04-target-overlay/**`：私有目标场景、叠加与输入完整性研究。

## 验收标准

- [ ] 缺失目标变体/姿态事实逐项列出，不依赖世界可见集合猜模型。
- [ ] 目标场景与世界深度隔离，P3-12 helper 复用适用范围明确。
- [ ] 所有可达叠加元素及被毁标签有来源、置信度和验证方法。

## 验证方法

按[原版证据指南](../../../../guides/original-evidence.md)静态追踪并复用截图；模型三维误差界与二维精确像素分开交 07，不能拟合屏幕点冒充投影一致。

## 完成证据
