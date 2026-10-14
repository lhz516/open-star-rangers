---
type: plan
status: active
phase: P3
task: "10"
subtask: "03"
updated: 2026-10-14
---

# 03 — 通讯反应与僚机报告研究

**契约来源：** [spec](../spec.md) 的 S-11、AC-16；[原版研究](../spec.md#原版研究) Q-05，Q-11 中本项路径的数值；[无线电队列与通讯反应](../spec.md#无线电队列与通讯反应)。
**依赖：** 无。
**执行方式：** 自动。原版证据由执行的 agent 按[原版证据获取](../../../../guides/original-evidence.md)自行取得。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **Q-05：** 在 `0x3c208`、`0x3c0f4`、`0x3c91c`、`0x38cd4`/`0x38d54`、`0x3c4bc`、`0x3c3b0` 中核实：
  - 每条分支的触发条件、限频计时及其写入者与清除者、所选消息的身份与说话者；
  - 条件抽取的来源、分支与调用次序：消息查找是否成功、媒体身份与声音分配是否影响抽取次数，`0x3c91c` 的抽取是否可达；
  - 停放行进中僚机到达基地的报告与 `0x39820` 的关系，靠近基地报告 `0x3c3b0` 的条件，世界出口检查对 `0x39820` 的调用；
  - 友伤累计 `0x174dfc`/`0x174e00` 与感谢计数 ps +0x60 的全部读写者；救援对 ps +0x78、+0x7C 的清除。
- **Q-11（本项部分）：** 限频比较的 u32 视图与严格与否；距离平方的 f32/f64。
- 事实写入 `local/research/p3-10/reactions/findings.md`：英文，按目标文档与节写成可直接并入的草稿，带置信度（Confirmed/Likely/Unconfirmed）与证据，只记地址、结构与行为，不含原版内容或反编译输出；受影响 U 项的状态变化一并列出。由 06 统一写入 `docs/original/`；本项不改跟踪的原版文档，使 01 至 05 可以并行。
- 完成证据给出交 07、08 的摘要：决定字段、单位、所有者、写入阶段与重置的结论，以及与 spec 已批准方向一致或冲突之处。冲突不在本项改 spec，交 07、08 按关卡处理。

## 不包含

- 队列与来电通道本身（02）；P3-08 对友伤累计的消费与 P3-11 对感谢计数的统计。
- 修改任何 spec 或实现代码（07、08 起）。

## 关键文件与契约

- [C2](../../../../original/formats/executable.md#c2-communications-reactions-0x3c208-and-0x3c0f4--confirmed-code)、[实例化](../../../../original/formats/executable.md#instantiation-p3-0203) 第 15 步、[停放更新](../../../../original/formats/executable.md#world-boundary-active-area-parking-and-autopilot-p3-0604)是起点；P3-07 在 [damage.ts](../../../../../src/core/systems/damage.ts) 注释中标出的调用位置是实现的接入点。
- 计划新增：`local/research/p3-10/reactions/` 下的 Ghidra 脚本、输出、私有只读项目副本与 `findings.md`（被忽略）。

## 写入范围

- `local/research/p3-10/reactions/**`：研究脚本、输出、私有副本与 findings 草稿（被忽略）。

## 验收标准

- [ ] Q-05 达到门槛（已确认，代码）：每类反应与报告的条件、限频、消息身份与全部条件抽取。
- [ ] 本项路径的数值语义已记录。
- [ ] findings 草稿注明每条事实的目标文档与节，带置信度与证据；本项没有改动跟踪的原版文档，仓库中没有原版内容、反编译输出或读数。
- [ ] 完成证据给出交 07、08 的摘要，并写明与 spec 方向一致或冲突之处。

## 验证方法

- Ghidra 以 `-noanalysis -readOnly` 在 `local/research/p3-10/reactions/` 的私有副本上运行，函数与 `__watcall` 只建在内存中；寄存器相关结论按原生指令读取，调用者以相对调用与 32 位值的原始扫描核对。
- 需要运行读数时按[运行时测量](../../../../guides/runtime-measurement.md)使用 `tools/baseline/measure.py` 与模拟器内输入，输出只在 `local/`；同一时间只有一个会话操作基准环境，由协调者安排。
- git 审阅确认除本 subtask 文档外没有改动跟踪文件，且没有原版内容、反编译输出或读数。

## 完成证据
