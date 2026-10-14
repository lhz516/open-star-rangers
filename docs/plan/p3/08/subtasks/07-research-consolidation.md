---
type: plan
status: active
phase: P3
task: "08"
subtask: "07"
updated: 2026-10-14
---

# 07 — 研究汇总与原版文档写入

**契约来源：** [spec](../spec.md) 的 S-13、AC-13；[原版研究](../spec.md#原版研究) Q-01 至 Q-13（Q-12 在此汇总）；[数值、随机数与时间](../spec.md#数值随机数与时间)。
**依赖：** 01, 02, 03, 04, 05, 06。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 核对 01 至 06 的 findings 之间的一致性（支持范围、控制器字段、抽取次序、阶段），冲突回到相应研究补查。
- **Q-12 汇总：** AI 路径的存储类型、f32 写回、整数转换、开方与三角函数来源、时钟比较的有无符号与严格性，以及每次安装、AI 步、解析与状态转换的抽取次数与次序。
- 把事实并入跟踪文档（英文，带置信度与证据）：[ai](../../../../original/formats/ai.md) 新增 P3-08 节（支持范围、解释器、脚本与操作码、内置处理器）；[executable](../../../../original/formats/executable.md) 新增 AI 节（驾驶、目标、开火、停放、集合、离场、Xpon、`b`）；[comm](../../../../original/formats/comm.md) 的命令码效果；[scenario](../../../../original/formats/scenario.md) 中 +0x70–+0x78 读者的更正。起草探针的结论经核实或更正后写入，不照抄。
- 更新 [unknowns](../../../../original/unknowns.md) 中的 U-001、U-022（需要时新增 U 项），U-025 的发现记为交 P3-09；`b` 的结论写入[键位表](../../../../original/input/key-map.md)。
- 汇总交 08（D-01 字段与阶段）、09（D-03 导入、友伤、命令接口、`b`、地图可见性）与 10（原版断点与可观察量）的输入，写在完成证据中。

## 不包含

- 契约定稿（08、09）与实现；比较结论（27）。

## 关键文件与契约

- 01 至 06 的 findings（被忽略）；跟踪的原版文档见上。
- 计划新增：`local/research/p3-08/consolidation/`（汇总脚本与核对输出，被忽略）。

## 写入范围

- `docs/original/formats/ai.md`：AI 规则事实。
- `docs/original/formats/executable.md`：AI 相关代码事实。
- `docs/original/formats/comm.md`：命令码效果。
- `docs/original/formats/scenario.md`：记录字段读者的更正。
- `docs/original/unknowns.md`：U 项状态。
- `docs/original/input/key-map.md`：`b` 的结论。
- `docs/original/behavior/B-009-combat-rules.md`：研究推翻或细化的 P3-07 结论的更正（如 W8/W10 的锁定字节、停放领队模式）。
- `docs/original/formats/audio.md`：SND 10055 可达性的更正。
- `docs/original/formats/craft.md`：涉及 AI 字段或 W 项的交叉引用更正。
- `local/research/p3-08/consolidation/**`：汇总与核对输出（被忽略）。

## 验收标准

- [ ] Q-01 至 Q-13 全部达到门槛，或未达门槛的项按 spec 记为阻塞并写明恢复条件。
- [ ] 跟踪文档中的每条新事实带置信度与证据，不含原版内容、反编译输出或读数；更新日期正确。
- [ ] U-001、U-022 已更新；交 P3-05、P3-09、P3-10、P3-11 的发现已记录。
- [ ] 完成证据给出交 08、09、10 的输入汇总。

## 验证方法

- 文档的链接与元数据检查；`pnpm check:compliance`；git 审阅确认只改写入范围内的文件。

## 完成证据
