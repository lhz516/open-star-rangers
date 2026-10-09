---
type: plan
status: active
phase: P3
task: "01"
subtask: "03"
updated: 2026-10-08
---

# 03 — 难度读取路径

**契约来源：** [spec](../spec.md) 的 S-02、AC-01、AC-14；[切片配置](../spec.md#切片配置)；技术决定 1、8。
**依赖：** 无。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **枚举：** 用只读 Ghidra 分析枚举难度全局值的读取路径：从 [scenario §4](../../../../original/formats/scenario.md#4-scct-campaign-table-confirmed-structure-likely-meaning) 已记录的全局、写入者与读取者出发，补查直接引用、经 getter 的间接读取，以及选组结果（难度组）的读取者。分开记录原始难度与难度组。
- **影响：** 对每个读取路径写明它影响什么（选组、统计显示、调试跳关、规则参数或其他），以及若影响闭环规则，由哪个 P3 任务负责；不预设“只影响选组”。
- **覆盖限制：** 写明静态枚举的边界，例如未分析区域、间接调用、运行时计算的地址；未明且影响配置资格时阻塞（AC-01）。
- **配置：** 取值 19 保持不变；只有研究要求改变任务、配置或范围时，才向协调者报告需修订 spec 并重新批准，不由本项自行修改 spec。
- **记录：** 结构与地址写入 scenario §4（英文，不粘贴反编译代码）；脚本与输出在 `local/research/p3-01/difficulty/`。

## 不包含

- 难度对具体规则的实现与数值对照：归负责的规则任务。
- 修改 spec、STATUS 或阶段索引。

## 关键文件与契约

- [scenario §4](../../../../original/formats/scenario.md#4-scct-campaign-table-confirmed-structure-likely-meaning)、[scenario §3](../../../../original/formats/scenario.md#3-132-byte-object-record-structure-confirmed-fields-partly-likely)（+0x70/+0x74 的默认值使用难度组）；[executable §4](../../../../original/formats/executable.md#4-code-landmarks)。
- [Ghidra 脚本](../../../../../tools/ghidra/)与[静态分析方法](../../../../guides/baseline-environment.md#静态分析)。

## 写入范围

- `docs/original/formats/scenario.md`：难度读取路径的结构事实。
- `docs/original/unknowns.md`：U-003、U-013、U-022 的线索（负责阶段不改）。
- `docs/original/formats/executable.md`：难度组 getter `0x694f0` 的描述更正。
- `local/research/p3-01/difficulty/**`：研究脚本、Ghidra 输出与私有项目副本（被忽略）。

## 验收标准

- [ ] AC-01：完成证据列出读取路径、静态覆盖限制、原始难度与难度组的区分、各路径的实际影响与负责任务。
- [ ] 结论写入 scenario §4 并标注置信度与证据；没有反编译代码、原版文字或字节。
- [ ] 若发现影响切片配置资格的未明读取者，本项记为 blocked 并写明恢复条件；没有时写明“无”。
- [ ] 修改的文档 `updated:`、链接与锚点有效。

## 验证方法

- 只读 Ghidra（`-noanalysis -readOnly`）的引用与调用查询；必要时以本地脚本核对地址。
- 文档链接与锚点检查；审阅 diff 只含结构与地址。
- 不涉及浏览器或基准运行。

## 完成证据
