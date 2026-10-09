---
type: plan
status: active
phase: P3
task: "01"
subtask: "06"
updated: 2026-10-08
---

# 06 — 时基的代码来源、推进与单位

**契约来源：** [spec](../spec.md) 的 S-04、AC-05（代码部分）、AC-14；[时基研究](../spec.md#时基研究)的 T-1 至 T-3 与核心门槛；技术决定 3、8。
**依赖：** 无。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

用只读 Ghidra 分析，回答 T-1 至 T-3 的代码部分：

- **T-1 时间来源：** 游戏时间来自硬件定时器中断、BIOS 时钟、帧计数还是其他；计数器的位置（LE 对象与偏移）、位宽与写入者。
- **T-2 推进方式：** 模拟按固定步长还是按经过时间的可变步长推进；每步或每帧的时间增量；单帧内推进的上限。
- **T-3 单位：** 模拟时间与任务调度时间各自的计数器、单位与秒的换算。另逐项核对 DIAG 打字与停留、左显示屏刷新与干扰切换、爆炸碎片事件是否用同一时钟；不能从字段名“tick”推断同一时钟。核心关系之外的消费量给出换算，或写明负责任务的待研究项（P3-07、P3-13 等）。
- **交给 07：** 用于运行时交叉核对的计数器定位（对象、偏移、类型、单位）、合适的暂停点，以及代码推出的预期关系（例如每秒的计数增量），作为 07 的配方与误差预算的输入。
- **记录：** 写入 executable 的新节（英文，只记地址与作用，标注置信度）；U-008 的时间部分更新，负责阶段不改。本项结论在 07 的运行时核对之前，置信度不超过代码所能证明的程度。脚本与输出在 `local/research/p3-01/timing/`。

## 不包含

- 运行时读数、cycles 测量与 B-006：归 07。
- Core 的 tick 频率与数值表示：归 P3-02。
- 冻结 U-021（归 P0）。

## 关键文件与契约

- [scenario §3](../../../../original/formats/scenario.md#3-132-byte-object-record-structure-confirmed-fields-partly-likely)（生成时间左移 6 位的线索）；[hud](../../../../original/formats/hud.md#snip-10487-confirmed-structure-p2-1227)、[DIAG](../../../../original/formats/hud.md#diag-10489-confirmed-structure-p2-07-revision)与[效果来源](../../../../original/formats/executable.md#effect-presentation-sources)中的计时消费路径；[executable §4](../../../../original/formats/executable.md#4-code-landmarks)；[unknowns](../../../../original/unknowns.md) 的 U-008、U-021。

## 写入范围

- `docs/original/formats/executable.md`：时基的代码事实（新节）。
- `docs/original/unknowns.md`：U-008 的时间部分（负责阶段不改）。
- `local/research/p3-01/timing/**`：研究脚本、Ghidra 输出与私有项目副本（被忽略）。

## 验收标准

- [ ] AC-05（代码部分）：T-1、T-2 与 T-3 的模拟/任务调度时间的来源、推进方式、单位与换算有代码依据与置信度，写入 executable 的新节。
- [ ] T-3 列出的其他计时消费量逐项有换算，或写明负责任务的待研究项。
- [ ] 交给 07 的计数器定位、暂停点与预期关系已记录在完成证据中（只含地址、类型与单位）。
- [ ] U-008 已更新，负责阶段未改；没有反编译代码；修改的文档 `updated:`、链接与锚点有效。

## 验证方法

- 只读 Ghidra 的引用、中断向量与调用链查询；必要时以本地脚本核对地址。
- 文档链接与锚点检查。不涉及浏览器或基准运行；核心关系的确认在 07 完成，本项不单独宣告 AC-05 通过。

## 完成证据
