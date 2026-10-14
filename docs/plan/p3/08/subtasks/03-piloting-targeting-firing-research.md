---
type: plan
status: active
phase: P3
task: "08"
subtask: "03"
updated: 2026-10-14
---

# 03 — AI 驾驶、目标与开火研究

**契约来源：** [spec](../spec.md) 的 S-06、S-07、S-08、S-13、AC-05、AC-06、AC-13；[原版研究](../spec.md#原版研究) Q-04、Q-05、Q-06，Q-12 中本项路径；[AI 驾驶](../spec.md#ai-驾驶)、[目标、开火与规避](../spec.md#目标开火与规避)。
**依赖：** 无。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **Q-04：** AI 移动助手对消息 0x40000、0x80000 的投递（约 25 个调用点）；提前量模式、横滚匹配、噪声例程、控制器 +0x118 的点积判定；与 P3-06 浮点路径、P3-07 转向模块（[steering.ts](../../../../../src/core/rules/steering.ts)）的分工；直接写移动块或位姿的调用。
- **Q-05：** `0x528e8` 的全部调用者（`0x5e710`、`0x61740`、`0x61dfc`、`0x61f20`、`0x62578`、`0x62714`）与 +0x8C 的 AI 写入者；`0x632a4` 与 AICO 三元组、`0x38bb0`；`0x5e444` 的候选筛选；AI 对 `proximity`、`lastVictim`、`lastAttacker`、+0xD4 与对象集合的读取时机。
- **Q-06：** 支持范围内的 `0x5df20`/`0x5df84`/`0x5dfa4` 调用点、通道与按住值；基地处理器 `0x62c10` 与自动挂点行为（`0x62c28`、`0x6307c`、`0x64914`、`0x62bce`）的可达性、掩码与保持值；僚机导弹发射与锁定字节（W8）；规避相关的分支。
- 事实写入 `local/research/p3-08/combat/findings.md`（英文草稿，带置信度与证据）。
- 完成证据给出交 07、08、10 的摘要：AI 驾驶请求的字段、目标写入点、开火按住状态、基地自动挂点节奏与可在原版中观察的断点位置。

## 不包含

- 程序选择（01）、解释器（02）、僚机处理器（04）、停放（05）。
- 实现（17、18）。

## 关键文件与契约

- [W9](../../../../original/formats/executable.md#w9-automatic-mounts--confirmed-code)、[W10](../../../../original/formats/executable.md#w10-ai-fire-entry-points-record-only-p3-08--confirmed-code)、[H5](../../../../original/formats/executable.md#h5-missiles--confirmed-code-unless-marked)、[飞行操纵](../../../../original/formats/executable.md#flight-controls-and-rotation-p3-0602)。
- 已有入口：[weapons.ts](../../../../../src/core/systems/weapons.ts) 的 `fireAiChannel`、`fireAutomatic`、`acquireAutomatic`；[firing.ts](../../../../../src/core/rules/firing.ts)。
- 计划新增：`local/research/p3-08/combat/`（被忽略）。

## 写入范围

- `local/research/p3-08/combat/**`：Ghidra 脚本、输出与 findings 草稿（被忽略）。

## 验收标准

- [ ] Q-04、Q-05、Q-06 达到 spec 门槛（已确认，代码；锁定字节可为高概率并标注）。
- [ ] 与 P3-06、P3-07 已交付规则的分工与复用点明确，没有需要另建副本的规则；冲突已列出。
- [ ] findings 草稿注明目标文档与节；没有改动跟踪文件，仓库中没有原版内容。

## 验证方法

- 只读 Ghidra，方法同 01；git 审阅；达不到门槛时按 spec 记为阻塞。

## 完成证据
