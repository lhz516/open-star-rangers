---
type: plan
status: active
phase: P2
task: "11"
subtask: "15"
updated: 2026-10-06
---

# 15 — 效果贴图坐标研究

**契约来源：** [spec](../spec.md) 的 S-10（研究）、AC-17，以及[效果贴图坐标](../spec.md#效果贴图坐标)的研究范围与技术决定 9。
**依赖：** 无。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 有界的只读 EXE 研究（Ghidra headless，`-readOnly`，不重新导入）：
  - `0x82ae8` 的参数含义；
  - 它在导弹旋转映射（`0x44cd8`）与带贴图碎片（`0x3eab4`）处的调用，以及调用的全部输入：包围盒、`0x1718ea` 处的双精度数、立即数与旋转步长；
  - 映射应用到顶点的代码：贴图坐标的计算公式与计算时机（创建时还是每帧）。
- 结论写入 [executable](../../../../original/formats/executable.md) 的效果表现来源一节：只记地址、结构、公式与置信度，不提交反编译输出；更新 [U-027](../../../../original/unknowns.md)。
- 判定：
  - 结论达到高概率或已确认时，本子任务通过，16 可以开始；
  - 结论依赖运行时状态时（例如随相机变化），记录结论，并说明查看器只显示静止姿态下的坐标；
  - 达不到高概率时，本子任务为 blocked，在 goal 执行记录写明证据与恢复条件，16 同时为 blocked，由用户决定后续安排。
- Ghidra 脚本与输出只放在被忽略的 `local/research/p2-11/`。

## 不包含

- payload、转换器与查看器的修改（16）。
- 光照、明暗级与模式字（P3，U-028）。

## 关键文件与契约

- 修改 [executable.md](../../../../original/formats/executable.md)、[unknowns.md](../../../../original/unknowns.md)。
- 工具：`~/Tools/bin/ghidra-headless local/ghidra srangers -process SRANGERS.EXE -noanalysis -readOnly`，用法见[基准环境指南](../../../../guides/baseline-environment.md)与[工具指南](../../../../guides/tools.md)。

## 验收标准

- [ ] AC-17：executable 记录参数含义、坐标公式、计算时机、导弹旋转映射与带贴图碎片平面映射的全部输入，附置信度与证据（地址、结构、计数）；U-027 已更新。
- [ ] 结论达到高概率或已确认；否则本子任务为 blocked，执行记录写明恢复条件。
- [ ] 文档中没有原版内容或反编译输出；链接与元数据检查通过。

## 验证方法

- 只读 Ghidra 分析；脚本与输出留在 `local/`。
- 文档审阅、链接与元数据检查。只改文档时不需要 simplify；按 execute-goal 做 rubber-duck 审阅结论与证据。

## 完成证据
