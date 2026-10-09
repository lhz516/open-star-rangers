---
type: plan
status: active
phase: P3
task: "03"
subtask: "01"
updated: 2026-10-09
---

# 01 — 段 2 事件触发的结构研究

**契约来源：** [spec](../spec.md) 的 S-01、S-02、AC-01；[字段处理规则](../spec.md#字段处理规则)、[研究门槛与阻塞](../spec.md#研究门槛与阻塞)、[规范 payload](../spec.md#规范-payload) 的 `mission` 行。
**依赖：** 无。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 用只读 Ghidra 与本地数据研究 SCEN 段 2 的事件触发，起点为闭包 #3 的载入与消费地址：`0x6977c`、`0x695c0`、`0x69c54`、`0x69e1c`，以及载入器 `0x66c00`、`0x68d2c`。研究内容：
  - 28 字节头部的每个字段：区间表指针与数量、三个运行时计数、生成配对指针与数量；
  - 20 字节区间的每个字段：比率边界、+8 的消息引用、+0x10 的总结选择字节，以及其余位置；
  - 消息单元的结构：区间 +8 指向的是单个字串，还是消息指针单元的数组，以及它们的终止规则；
  - 段 2 中是否可能有不是事件触发的元素（例如[scenario §2](../../../../original/formats/scenario.md#2-scen-header-confirmed-on-all-52-entries)所说的编组名称指针），以及原版如何区分它们。
- 对每个字段给出存储类型与证据：原生代码访问为已确认，全部任务实例一致为高概率。确定三个运行时计数在载入或任务开始时是否被重置，结论决定 07 是否检查其存储值。
- 统计观测值：SCEN 3019 与全部 52 个任务中的触发数、区间数、消息数、单条消息的最大字节数与字符范围（只记计数与范围）。记录只在基准中为零的位置。
- 事实写入 [scenario](../../../../original/formats/scenario.md)（英文）；研究脚本、Ghidra 输出与私有副本放在 `local/research/p3-03/scen-events/`。
- 若字段类型无法确定，或段 2 含有本契约不支持的元素，按研究门槛记为 blocked，写明受影响的 AC 与恢复条件。

## 不包含

- 事件的规则语义（计数、区间与消息显示的含义）：归 P3-11。
- 解析器、内容契约与 Core 透传：归 07。
- U 项的更新：本项在完成证据中列出 U-022 的线索，由 22 写入登记表。

## 关键文件与契约

- [scenario §2–§3](../../../../original/formats/scenario.md#2-scen-header-confirmed-on-all-52-entries) 与[切片字段清单](../../../../original/formats/scenario.md#selected-mission-field-inventory-confirmed-structure)：已知结构与 SCEN 3019 的计数。
- [executable：任务结果](../../../../original/formats/executable.md#mission-result-success-path-and-campaign-restart-p3-0104)：`0x69c54` 读取区间 +0x10。
- [scen.ts](../../../../../src/original-data/formats/scen.ts)（只读）：P2-09 对段 2 的现有处理。

## 写入范围

- `docs/original/formats/scenario.md`：段 2 的结构、类型、计数与观测值。
- `local/research/p3-03/scen-events/**`：研究脚本、Ghidra 输出与私有副本（被忽略）。

## 验收标准

- [ ] AC-01（段 2 部分）：头部、区间与消息单元的每个位置都有存储类型、证据与置信度；引用目标、文字规则与只在基准中为零的位置已记录。
- [ ] 运行时计数是否被重置已有结论与依据；非触发元素的存在与区分方式已有结论。
- [ ] 观测值（触发、区间、消息与消息字节）已记录，可供 06 与 07 推导限值。
- [ ] 文档只含结构、计数、置信度与证据路径，没有原版字节、文字或反编译代码；`updated:`、链接与锚点有效。

## 验证方法

- 只读 Ghidra（`-noanalysis -readOnly`，使用私有副本）与本地数据统计，产物只在 `local/`。
- 文档 diff 审阅与链接检查。不涉及浏览器。

## 完成证据
