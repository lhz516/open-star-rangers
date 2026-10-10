---
type: plan
status: active
phase: P3
task: "06"
subtask: "01"
updated: 2026-10-09
---

# 01 — 原版研究：运动阶段、积分与数值

**契约来源：** [spec](../spec.md) 的 S-01、AC-09；[原版研究](../spec.md#原版研究)的 M-01 与 M-10 的静态部分；[运动阶段与积分](../spec.md#运动阶段与积分)。
**依赖：** 无。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

用只读 Ghidra（`-noanalysis -readOnly`，项目私有副本）回答以下问题，结论写入被忽略的 `local/research/p3-06/motion/findings.md`（英文，只记地址、类型、作用与置信度，供 21 写入 `docs/original/`），并在完成证据中摘要：

- **M-01 运动阶段与飞行器积分：**
  - `0x221fc` 的对象筛选（活动值、对象状态）、遍历次序与按移动块模式的分派；各模式的使用者、写入者与切换条件，模式 3 的作用；
  - `0x222f0`、`0x22600` 中位置、速度与姿态更新的公式与次序：沿机头前进、按机型 +0xBC/+0xC0 趋向目标速度、到达标志、速度比字段、角速率旋转、定时旋转及其到期比较、位移冲量及其衰减、机型 +0xC4 的真实作用；
  - 零步长与长步长下的行为；位姿副本与写回 `0x21794`；
  - 冲量、定时旋转、扰动与锁定字段的写入者，以及它们在所选任务中是否可达（写入者若属其他任务，只记交接）。
- **M-10 数值（静态部分）：** 运动路径的存储类型与运算精度，FSIN/FCOS 的位置与参数，浮点转整数的位置；运动代码中常量与表的分类（代码规则还是数据，按 spec 技术决定 11）。飞行中写回的舍入方向由 17 用读数判定。
- **为检查点 A、B 准备：** 在完成证据中列出移动块的候选字段（偏移、类型、单位、初值、读写者）、每个连续量的写回边界与支持域，以及误差分析所需的运算次序；不在本项定稿形状或容差。
- **记录：** findings 中标明每条结论应写入的原版文档与受影响的 U 项（负责阶段不改），由 21 入档；脚本与输出在 `local/research/p3-06/motion/`。
- **冲突处理：** 若结论要求改变 spec 已定的方向（例如需要新阶段或新命令），在完成证据中写明冲突与受影响的 AC，交协调者走 spec 修订。

## 不包含

- 操纵应用与旋转例程的轴与符号（02）；油门、最高速度与匹配（03）；区域与停放（04）。
- 弹丸与导弹的运动模式（P3-07）；运动的实现（11）。
- 运行时读数（07、17）。

## 关键文件与契约

- [executable](../../../../original/formats/executable.md) 的[时基](../../../../original/formats/executable.md#simulation-time-base-p3-0106)、[帧流水线](../../../../original/formats/executable.md#frame-pipeline-p3-0201)、[实例化](../../../../original/formats/executable.md#instantiation-p3-0203)与 [x87](../../../../original/formats/executable.md#x87-precision-rounding-and-trigonometry-p3-0202) 各节。
- [craft §3.5](../../../../original/formats/craft.md#35-craft-record-and-missile-body-record-236-bytes)、[unknowns](../../../../original/unknowns.md)。
- 计划新增：被忽略的 `local/research/p3-06/motion/findings.md`；入档由 21 完成。

## 写入范围

- `local/research/p3-06/motion/**`：Ghidra 脚本、输出、findings 与私有项目副本（被忽略）。

## 验收标准

- [ ] M-01 的规则达到“已确认（代码）”，逐个连续量列出写回边界、支持域与独立计算方法；达不到的部分按 spec 记为阻塞并写明恢复条件。
- [ ] M-10 的存储类型、运算精度、三角函数位置与常量分类达到“已确认（代码）”。
- [ ] 完成证据给出检查点 A 所需的候选字段清单与检查点 B 所需的运算次序。
- [ ] findings 标明每条结论应写入的原版文档与 U 项；仓库中没有新增的跟踪文件，也没有原版载荷、常量值、反编译输出或读数。

## 验证方法

- 逐条核对结论所依据的原生指令与调用者扫描；输出与脚本留在 `local/research/p3-06/motion/`。
- `git status` 确认没有跟踪的研究输出。不涉及浏览器。

## 完成证据
