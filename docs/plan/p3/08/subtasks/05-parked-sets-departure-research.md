---
type: plan
status: active
phase: P3
task: "08"
subtask: "05"
updated: 2026-10-14
---

# 05 — 停放 AI、对象集合与离场研究

**契约来源：** [spec](../spec.md) 的 S-11、S-13、AC-09、AC-13；[原版研究](../spec.md#原版研究) Q-09，Q-12 中本项路径；[停放、对象集合与离场](../spec.md#停放对象集合与离场)。
**依赖：** 无。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **Q-09：** 停放控制器与停放行进两个调度器的关系：`0x62250` 及其子处理器（`0x62578`、`0x62714`，`0x623c6`、`0x624ff`、`0x626f5` 写入的模式值）的调用阶段、状态写入与请求；它与 `0x2f1b0` 的随机到期、行进与交战的 RNG 次序（[E4](../../../../original/formats/executable.md#e4-draws-per-parked-object-and-pass--confirmed-code)）。
- `0x2ede0`/`0x2f028`/`0x2ee60` 的集合成员与次序、记忆视角与期限、首次构建、失效句柄、+0xD4 的全部写入位置与跨 tick 消费；没有来源声明的运行时 Xpon 的 +0xD4。
- `0x5e710`、`0x5e6cc` 与消息 0x800000 的全部调用者、投递与处理时的门禁复检，在切片中的可达性（与 01 交叉核对）。
- 事实写入 `local/research/p3-08/parked/findings.md`（英文草稿，带置信度与证据）。
- 完成证据给出交 07、08、09 的摘要：停放控制器的阶段与门禁、集合/可见性历史字段与采样时机、P3-09 需要接入的地图分支位置、离场请求的形状。

## 不包含

- 迷雾与地图可见性分支本身（P3-09）；基地报告（P3-10）。
- 实现（21）。

## 关键文件与契约

- [世界边界、活动区域与停放](../../../../original/formats/executable.md#world-boundary-active-area-parking-and-autopilot-p3-0604)、[T9](../../../../original/formats/executable.md#t9-object-sets-0x2ede00x2f028-confirmed-code)、[C4](../../../../original/formats/executable.md#c4-object-sets--confirmed-code)、[ai §1](../../../../original/formats/ai.md#1-loading-the-id-chain-and-the-group-0-closure-confirmed)。
- 已有：[area.ts](../../../../../src/core/systems/area.ts) 的停放行进与交战，[pipeline.ts](../../../../../src/core/systems/pipeline.ts) 的空 `object-sets` 阶段。
- 计划新增：`local/research/p3-08/parked/`（被忽略）。

## 写入范围

- `local/research/p3-08/parked/**`：Ghidra 脚本、输出与 findings 草稿（被忽略）。

## 验收标准

- [ ] Q-09 达到门槛（已确认，代码；完整运行可达性与 01 交叉核实）。
- [ ] 两个调度器、集合与可见性历史的状态、采样时机与快照需求明确。
- [ ] findings 草稿注明目标文档与节；没有改动跟踪文件，仓库中没有原版内容。

## 验证方法

- 只读 Ghidra，方法同 01；git 审阅；达不到门槛时按 spec 记为阻塞。

## 完成证据
