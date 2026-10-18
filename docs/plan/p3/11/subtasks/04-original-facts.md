---
type: plan
status: active
phase: P3
task: "11"
subtask: "04"
updated: 2026-10-17
---

# 04 — 原版事实归档

**契约来源：** [spec](../spec.md) 的 S-10、S-11、AC-14；[原版研究](../spec.md#原版研究)的 U 项要求。
**依赖：** 01, 02, 03。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 把 01 至 03 的结论写入原版记录，一个事实只写一处：代码事实写入 [executable](../../../../original/formats/executable.md)（英文，新增 P3-11 小节并更正既有小节）；段 2 规则含义写入 [scenario](../../../../original/formats/scenario.md)；行为写入 [B-003](../../../../original/behavior/B-003-campaign-flow.md) 与 [B-005](../../../../original/behavior/B-005-campaign-rescue.md)（中文）。手册结论注明 PDF 页码。
- 更新 [unknowns](../../../../original/unknowns.md) 中 U-022（段 2 规则含义）、U-010（救援与终局的衔接）、U-014（勋章与统计交 P4）、U-028（救援对象）的状态与证据；U-031 只更新代码层面的新结论，运行结论留给 21。
- 勋章：依 Q-08 写明“影响/不影响本任务规则”的判断。若发现影响本任务规则的读者，在完成证据中列出受影响的 spec 段落，交协调者修订 spec。

## 不包含

- 运行时测量方法与结论（07、21）；共享契约（05）。

## 关键文件与契约

- 01、02、03 的 findings（`local/research/p3-11/`）；[置信度标记](../../../../README.md#置信度标记)；[原版证据指南](../../../../guides/original-evidence.md#记录)。

## 写入范围

- `docs/original/formats/executable.md`：P3-11 的代码事实与更正。
- `docs/original/formats/scenario.md`：段 2 的规则含义。
- `docs/original/behavior/B-003-campaign-flow.md`：成功、结局与手册结论。
- `docs/original/behavior/B-005-campaign-rescue.md`：被毁、救援、失败与手册结论。
- `docs/original/unknowns.md`：U-022、U-010、U-014、U-028 与 U-031（代码部分）。

## 验收标准

- [ ] Q-01 至 Q-12 的结论都已归档，带置信度与证据入口；与既有记录矛盾处写明更正依据。
- [ ] 受影响的 U 项已更新；U-031 未宣称运行确认。
- [ ] 没有原版文字、字节或反编译输出；文档 `updated:` 已更新，链接与锚点有效。

## 验证方法

- 文档链接与元数据检查；逐条对照 findings。
- git 审阅只改写入范围内的文件，`pnpm check:original` 无发现（只读扫描，不构建）。

## 完成证据
