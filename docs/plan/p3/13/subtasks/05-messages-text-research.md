---
type: plan
status: active
phase: P3
task: "13"
subtask: "05"
updated: 2026-10-25
---

# 05 — 字体、通讯与消息行研究

**契约来源：** [spec](../spec.md#消息行指示条与-warp-灯) 的 S-03/S-06/S-08/S-13，Q-07/Q-09/Q-12，AC-06/11/13/21。
**依赖：** 无。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 核对 fonts/0、fonts/1 的步进、大写、行高与无单元裁剪；格式转换/字节/换行及未映射字形处理。
- 菜单只读 Core 选项 key/tone/引用，不重建；来电用 G-03 项目摘要，不误读 comm-messages 为台词。
- 核对消息入队、绘制前后阶段、首次显示、滚动、过期与丢队首；incoming-started 最早下一次合格显示，零时长消息不丢，LO text-only 不进入 HI 切片。
- 列出当前文案覆盖、基地项目呈现与有界消息预算给 08。

## 不包含

不导入 CMOV 台词或新增媒体解码，不改 radio 回调/队列规则。

## 关键文件与契约

- [radio.ts](../../../../../src/core/systems/radio.ts)、[domain-events.ts](../../../../../src/core/contracts/domain-events.ts)。
- [font-payload.ts](../../../../../src/content/graphics/font-payload.ts)、[comm-messages.ts](../../../../../src/content/rule-data/comm-messages.ts)。
- [executable](../../../../original/formats/executable.md) RQ5/RQ7 与完成/信标消息。

## 写入范围

- `local/research/p3-13/05-messages-text/**`：私有格式化、字符、事件阶段与样本覆盖记录。

## 验收标准

- [ ] 消息来源到实际事件的映射完整，不以 radio-queued 提前显示。
- [ ] 颜色/模式/时钟单位、零时长、两次清队首风险和消息容量有结论。
- [ ] 原版文字与项目摘要的边界、缺失映射及测试输入明确。

## 验证方法

静态代码与既有合成测试、截图字体匹配交叉核对；按[原版证据指南](../../../../guides/original-evidence.md)留存私有输出，不复制原文。

## 完成证据
