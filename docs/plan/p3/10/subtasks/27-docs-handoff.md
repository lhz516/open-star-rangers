---
type: plan
status: active
phase: P3
task: "10"
subtask: "27"
updated: 2026-10-14
---

# 27 — 文档与交接

**契约来源：** [spec](../spec.md) 的 S-12、AC-18。
**依赖：** 20, 22, 23, 26。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 更新 [Core 模块说明](../../../../engineering/modules/core.md)（API、阶段与状态所有权、事件、分区、原因码、上限依据、已知差异，包括 G-02 不计时与 D-03 的差异）、[app](../../../../engineering/modules/app.md) 与 [ui](../../../../engineering/modules/ui.md) 分册、[键盘输入指南](../../../../engineering/keyboard-input.md)（通讯与基地按键已接入的部分）、[源码结构指南](../../../../engineering/source-structure.md)（新增模块）。
- 写明向 P3-08（命令码、友伤累计、回复入队、`0x4000` 的结论）、P3-09（基地视角与地图）、P3-11（子状态、队列清空、完全修理、感谢计数）、P3-13（菜单、来电、G-03 文字与基地视图）、P3-14（事件与音效阶段）、P3-15（联合复验项）的交接；上游契约修订使既有 goal/subtask 受影响时记录需重验的范围，不改写历史结论。

## 不包含

- STATUS 与阶段索引（协调者）。

## 关键文件与契约

- 现有分册的写法与 P3-07 的[文档交接](../../07/subtasks/28-docs-handoff.md)。

## 写入范围

- `docs/engineering/modules/core.md`、`docs/engineering/modules/app.md`、`docs/engineering/modules/ui.md`：API 与交接。
- `docs/engineering/keyboard-input.md`、`docs/engineering/source-structure.md`：接入与模块。
- `docs/original/formats/executable.md`：BS11 改为运行已确认，以及 25、26 交来的原版事实（简报按钮丢键、长时间受攻击后停靠中的自动离港、基地只在远处失效）。
- `docs/original/behavior/B-004-base-communications.md`：残留的“运行核对待 09”措辞。
- `docs/original/formats/imfat.md`、`docs/original/formats/scenario.md`、`docs/original/formats/audio.md`、`docs/original/formats/craft.md`：06 列出的交叉引用（CMOV、SCCT +0x70、基地音效、基地速率）。

## 验收标准

- [ ] AC-18：分册与指南说明 API、所有权、反馈、上限、缺省与已知差异；各下游任务的接线与重验责任明确。
- [ ] 链接与 `updated:` 正确。

## 验证方法

- 文档链接与元数据检查；git 审阅只改写入范围内的文件。

## 完成证据
