---
type: plan
status: active
phase: P3
task: "08"
subtask: "04"
updated: 2026-10-14
---

# 04 — 僚机处理器与命令研究

**契约来源：** [spec](../spec.md) 的 S-09、S-10、S-13、AC-07、AC-08、AC-13；[原版研究](../spec.md#原版研究) Q-07、Q-08，Q-12 中本项路径；[僚机](../spec.md#僚机)、[僚机命令](../spec.md#僚机命令)。
**依赖：** 无。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **Q-07：** 僚机处理器 `0x610c8` 及子处理器 `0x60f80`、`0x614a8`、`0x61a88`（含 `0x61cd0` 与 AICO +0x2C/+0x30）、`0x61abd` 的模式变化、`0x63c00` 与 AICO +0x34–+0x48；AICO 元素索引（+0xDC − 1）的范围与五个名单项的取值是否越界；各内置程序记录参数的差别；编队、跟随、交战与返航的条件；导弹发射与否。
- **Q-08：** TABL 2013 各项与命令码的对应（数据，只记计数与码）；`0x61f20` 对码 1–7 的效果、拒绝与查询；+0x184 的写入、覆盖、消费与清除及活动/停放两条调度；命令目标的采样时机；`0x3c208` 僚机分支的友伤累计（原始操作数、窗口 0x780、比较方向）及其在新世界、救援、僚机损失、无僚机时的处理；回复的次数、时间与载荷，媒体状态是否反过来影响 AI。
- 事实写入 `local/research/p3-08/wingman/findings.md`（英文草稿，带置信度与证据，不含菜单原文）。
- 完成证据给出交 07、08、09、10 的摘要：僚机行为等价类（交 26 的覆盖）、命令单槽语义、拒绝与回复的事实形状、友伤累计的字段与调用点。

## 不包含

- 菜单层级与按键（P3-10）；无线电队列与呈现（P3-10、P3-13）。
- 实现（19、20）。

## 关键文件与契约

- [comm §3](../../../../original/formats/comm.md#3-item-values-confirmed-code)、[C2](../../../../original/formats/executable.md#c2-communications-reactions-0x3c208-and-0x3c0f4--confirmed-code)、[ai §2](../../../../original/formats/ai.md#2-aico-6001-global-ai-parameters)、[B-004](../../../../original/behavior/B-004-base-communications.md)、[B-003](../../../../original/behavior/B-003-campaign-flow.md)。
- 已有：[damage.ts](../../../../../src/core/systems/damage.ts) 中 `0x3c208` 的调用位置（CR-13）。
- 计划新增：`local/research/p3-08/wingman/`（被忽略）。

## 写入范围

- `local/research/p3-08/wingman/**`：Ghidra 脚本、本地数据脚本、输出与 findings 草稿（被忽略）。

## 验收标准

- [ ] Q-07、Q-08 达到 spec 门槛（已确认，代码与数据；功能与画面的对应可为高概率）。
- [ ] 命令单槽、覆盖、拒绝与回复的语义，以及友伤累计的写入位置与重置都明确。
- [ ] findings 草稿注明目标文档与节；没有改动跟踪文件，仓库中没有原版内容。

## 验证方法

- 只读 Ghidra 与本地数据脚本，方法同 01；参考视频只作线索（最高为高概率）。git 审阅；达不到门槛时按 spec 记为阻塞。

## 完成证据
