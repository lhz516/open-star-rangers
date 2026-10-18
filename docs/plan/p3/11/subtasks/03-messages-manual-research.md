---
type: plan
status: active
phase: P3
task: "11"
subtask: "03"
updated: 2026-10-17
---

# 03 — 消息常量、手册与视频线索

**契约来源：** [spec](../spec.md) 的 S-11、S-12、AC-14；[原版研究](../spec.md#原版研究) Q-09、Q-12。
**依赖：** 无。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **Q-09：** `0x4e9e8` 中完成消息与信标消息调用点的颜色、显示时长与区域等常量，以及它们与 `data/flight-messages` 字段的对应；结论交 P3-13（消息行绘制）与 15（事件的消息键）。
- **Q-12：** 核实生成 spec 时查阅的印刷手册线索（PDF 第 10、14–15、31 页：救援、结局、勋章与重试），写出可归档的结论草稿，注明 PDF 页码与置信度（只凭手册最高为高概率），不转录原文。只有 01、02 起草时仍留具体问题时，才按[参考视频](../../../../guides/original-evidence.md#参考视频)定向取帧作线索；视频没有相关画面不阻塞。

## 不包含

- 写入 `docs/original/`（04）；消息行的绘制（P3-13）。

## 关键文件与契约

- [RENS 与飞行消息](../../../../original/formats/executable.md#flight-message-strings-and-the-rens-header-p3-0304)、[flight-messages.ts](../../../../../src/content/rule-data/flight-messages.ts)、[印刷手册](../../../../guides/original-evidence.md#印刷手册)。

## 写入范围

- `local/research/p3-11/messages/**`：Ghidra 输出、手册页码对照与视频帧（如有）。

## 验收标准

- [ ] Q-09 的常量达到“已确认（代码）”，或写明缺口。
- [ ] Q-12 的每条手册线索有页码、概述与置信度；视频线索（如取）有视频 ID 与时间点。
- [ ] 不转录手册原文、表格或插图；视频帧只在 `local/`；git 中没有受跟踪文件变化。

## 验证方法

- Ghidra `-noanalysis -readOnly`；手册以 PDF 页面核对 OCR 文本层的数字与键名。
- `git status` 确认只有被忽略的 `local/` 有变化。

## 完成证据
