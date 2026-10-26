---
type: plan
status: active
phase: P3
task: "13"
subtask: "01"
updated: 2026-10-25
---

# 01 — 布局与调度研究

**契约来源：** [spec](../spec.md#原版研究) 的 S-01、S-04、S-13，Q-01/Q-02，AC-07/08/21。
**依赖：** 无。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 核对 CCKD 10103 slot 0/2/7 的仪表类型、次序、含端点矩形、静态参数、绘制遍和重绘标志，区分运行期 last-draw 与应导入字段。
- 追踪预遍、全量重绘、页面/视角切换和持久缓冲擦除；无图像的 slot 7 仍有类型 8，不能制造空 LayoutPayload。
- 列出保留画面等价条件、置信度、缺口和给 08 的有界输入清单，结论交 07 入权威文档。

## 不包含

不改 parser、Core 或渲染代码，不为完整视角/基地美术扩展范围。

## 关键文件与契约

- [cockpit](../../../../original/formats/cockpit.md)、[executable](../../../../original/formats/executable.md) 的 FC2/FC3。
- [layout-payload.ts](../../../../../src/content/graphics/layout-payload.ts)、[source-graphics.ts](../../../../../src/original-data/conversion/source-graphics.ts) 为现有形状，不提前实现新字段。

## 写入范围

- `local/research/p3-13/01-layout/**`：只读研究报告、结构统计与截图掩码依据（私有）。

## 验收标准

- [ ] 每种纳入的仪表和视角有字段来源、调度/擦除边界与置信度。
- [ ] 空图像布局、强制重绘、未到期保留及帧/时钟单位均有证据，不把推断当确认。
- [ ] 给 07/08 的缺口、最小补证与导入候选清单可直接使用。

## 验证方法

按[原版证据指南](../../../../guides/original-evidence.md)优先复用记录与只读静态分析；结构输出只留私有路径。本文只记结论/地址/计数，不含原版字节或反编译文本；无代码不跑构建。

## 完成证据
