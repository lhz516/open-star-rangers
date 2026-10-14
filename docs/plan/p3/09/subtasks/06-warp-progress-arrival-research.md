---
type: plan
status: active
phase: P3
task: "09"
subtask: "06"
updated: 2026-10-14
---

# 06 — Warp 进度、完成与中断研究

**契约来源：** [spec](../spec.md) 的 S-11、AC-14；Q-08、Q-09、Q-10；[Warp 过程与到达](../spec.md#warp-过程与到达)、[Warp 的驾驶舱状态](../spec.md#warp-的驾驶舱状态)。
**依赖：** 无。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **Q-08：** `0x50508`、`0x50188`、`0x505cc` 与 `0x50a28` 中写游戏状态的部分：进度的存储类型、速率与 +0xB8、+0xA8 的作用，Warp 途中玩家位置与朝向的算术与输入（`0x50a28` 已确认写位姿，见 [C1](../../../../original/formats/executable.md#c1-the-3d-camera-and-its-readers--confirmed-code)）；左显示屏页 6 三条读数与 12 型指示灯的取值与单位。
- **Q-09：** `0x2bf08` 的完成判定（终点比较的严格性）、目的地 `0x1864c8`、到达偏移的常数、抽取次数、分布与次序，最近对象调整的候选集合、度量、并列与调整方式；写回的字段（模式、速度、指令速度、+0x78、+0xC8、`inWarp`、能量）；`area-check` 在玩家 Warp 期间的中心；派发器子命令 2 的发送者与在切片中的可达性。
- **Q-10：** Warp 中被毁、能量耗尽、任务结算、停靠子状态与暂停的影响：是否取消、部分能量与位置、标志与页面复原、一次性事实；僚机与 AI 对玩家 Warp 的反应（只定位，交 P3-08）。
- 事实写入 `local/research/p3-09/warp-arrival/findings.md`：英文，按目标文档与节写成可直接并入的草稿，带置信度（Confirmed/Likely/Unconfirmed）与证据，只记地址、结构与行为，不含原版内容或反编译输出；受影响 U 项的状态变化一并列出。由 07 统一写入 `docs/original/`；本项不改跟踪的原版文档，使 01 至 06 可以并行。
- 完成证据给出交 07/08 的摘要：所需状态字段、原因码与结果候选、阶段位置，以及与 spec 已批准方向一致或冲突之处。

## 不包含

- Warp 效果与隧道的绘制、相机（P3-12）。
- 实现（12 起）与修改任何 spec（08、10）。
- 把 findings 写入跟踪的原版文档（07）。

## 关键文件与契约

- [过场与循环衔接](../../../../original/formats/executable.md#cut-scenes-and-loop-transitions-p3-0108)、[任务结果](../../../../original/formats/executable.md#mission-result-success-path-and-campaign-restart-p3-0104)、[难度读取](../../../../original/formats/scenario.md#difficulty-readers-p3-01)路径 7、[T8](../../../../original/formats/executable.md#t8-left-display-no-target-reads-confirmed-code)。
- 计划新增：`local/research/p3-09/warp-arrival/**`（被忽略）。

## 写入范围

- `local/research/p3-09/warp-arrival/**`：脚本、输出、私有项目副本与 findings 草稿（被忽略）。

## 验收标准

- [ ] Q-08 达到门槛（已确认，代码）：进度、规则位姿写入与驾驶舱读数都有依据；时长的运行读数方案交 09。
- [ ] Q-09 达到门槛（已确认，代码）：完成判定、到达偏移与调整、写回字段、区域中心与子命令 2 都有依据；分布的运行样本方案交 09。
- [ ] Q-10 达到门槛（已确认，代码）：每个可达中断的效果已判定，或按 spec 阻塞并写明恢复条件；AI 反应已交接 P3-08。
- [ ] findings 注明目标文档与节、置信度与证据；仓库中没有原版内容、反编译输出或读数。

## 验证方法

- Ghidra 以 `-noanalysis -readOnly` 在私有副本上运行；寄存器相关的步骤按原生指令读取；调用者与读写者以相对调用、32 位值与原始位移扫描核对。
- git 审阅确认除自己的 subtask 文档外没有改动跟踪文件，且无原版内容。

## 完成证据
