---
type: plan
status: active
phase: P3
task: "11"
subtask: "02"
updated: 2026-10-17
---

# 02 — 玩家损失、救援与僚机计时研究

**契约来源：** [spec](../spec.md) 的 S-02、S-04、S-05、S-06、S-07、S-11、AC-14；[原版研究](../spec.md#原版研究) Q-02、Q-04、Q-05、Q-06、Q-07 与 Q-11 中救援部分。
**依赖：** 无。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **Q-02：** `0x6977c` 的全部调用点、事件类型与来源记录；分别核实玩家、声明对象、动态 Xpon 与无来源对象，不先假定某类全部跳过；按种类记录（`0x1b45b4`）与基地/民用类标志（`0x176744`、`0x176748`）的全部写入者与读者。
- **Q-04：** `0x32d74` 的完整效果与次序（子状态、视角与上一视角、目标、无线电、左显示屏、停靠对象）；在地图、Warp、停靠子状态 3–5 与基地视角 6 中被毁时的处理；停靠中被毁时玩家与僚机活动是否保持（DK4）。
- **Q-05：** `0x32e14` 与 `0x67b98` 的整条恢复链：字段与次序（被毁标志、机型记录、`0x39820`、`0x2d400`、`0x3060c`、限频、视角、对象状态、移动块、速度与油门、目标、锁定、Warp 状态、耗尽锁存、来源记录位置与放置引用）；区分 `0x67b98` 内部与外层写入；基地计数包含哪些对象状态与遍历次序；放置的偏移、朝向、边界调整与缺省放置；RNG 的取值域、取模与抽取次序；两种救援中 `0x39820` 的选择事件差异。
- **Q-06：** `0x33464` 与子状态 1：信标消息、到期、重复耗尽、恢复后再耗尽的重触发；信标等待中飞行命令的实际效果；停靠请求 `0x333b4` 能否覆盖子状态 1 及其后果；等待中被毁时旧期限的处理。
- **Q-07：** `0x32dec` 与 `0x3c4bc`：标志的设置与清除、到期比较、消息身份，全清、停靠与救援中的处理，新世界的重置。
- **Q-11（救援部分）：** 放置的 f32 写回、到期比较的 u32 视图与严格与否。

## 不包含

- 流程、全清、总结与结局（01）；消息常量与手册（03）。
- 写入 `docs/original/`（04）；原版运行（06、20）。

## 关键文件与契约

- [任务失败与救援](../../../../original/formats/executable.md#mission-failure-player-loss-and-rescue-p3-0105)、[D7](../../../../original/formats/executable.md#d7-rescue-and-repair-resets--confirmed-code)、[Q4](../../../../original/formats/executable.md#q4-rescue-and-ai-state--confirmed-code)、[C3](../../../../original/formats/executable.md#c3-cross-frame-consumption-by-the-main-flow--confirmed-code)、[B-005](../../../../original/behavior/B-005-campaign-rescue.md)。
- 已实现的调用点与复用：[damage.ts](../../../../../src/core/systems/damage.ts)、[destruction.ts](../../../../../src/core/systems/destruction.ts)、[energy.ts](../../../../../src/core/systems/energy.ts)、[base-interior.ts](../../../../../src/core/systems/base-interior.ts)、[spawn.ts](../../../../../src/core/systems/spawn.ts)、[spawn-state.ts](../../../../../src/core/world/spawn-state.ts)。

## 写入范围

- `local/research/p3-11/rescue/**`：Ghidra 脚本、只读输出与 findings。

## 验收标准

- [ ] Q-02、Q-04 至 Q-07 及 Q-11 救援部分各有达到“已确认（代码）”门槛的结论，或明确未达门槛的缺口与恢复条件。
- [ ] 恢复链给出逐字段的“改变/保留”表与写入者（内部或外层），与 D7、Q4 已确认的部分一致或写明更正依据。
- [ ] findings 不含反编译输出或原版内容；git 中没有受跟踪文件变化。

## 验证方法

- Ghidra `-noanalysis -readOnly`；遍历与 RNG 次序、寄存器敏感步骤从原生指令读取。
- `git status` 确认只有被忽略的 `local/` 有变化。

## 完成证据
