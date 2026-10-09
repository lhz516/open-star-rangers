---
type: plan
status: active
phase: P3
task: "01"
subtask: "10"
updated: 2026-10-08
---

# 10 — 数据闭包

**契约来源：** [spec](../spec.md) 的 S-06、AC-10、AC-14；[数据闭包](../spec.md#数据闭包)、[对下游任务的约束](../spec.md#对下游任务的约束)的 P3-03 行。
**依赖：** 02, 08。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **静态追踪：** 从 spec 列出的起点（`0x3266c`、`0x66c00`、`0x3ed0d`/`0x3cfbb`、`0x4ca80`/`0x49e00`、`0x2cbb4`、`0x39f34`、`0x6affc`、`0x1766b4`、`0x6a024`）出发，用只读 Ghidra 追踪所选任务中可达的载入：常量 ID、由数据表给出的 ID（例如 TABL 4003 到 CINF 4037）与闭环读取的 EXE 数据表。
- **运行时核对：** 静态结论不确定或 ID 在运行时计算时，由协调者用 02 的工具在私有基准运行中对载入函数设断点，核对实际请求的 ID；未观察到请求不等于证明不使用。
- **覆盖已知线索：** CINF 4037 的武器与机型记录、RENS 10751 中 P2 未导入的头部字段、SCEN 3019 段 2 的事件触发与消息、COMM.NOB 的通讯菜单表、EXPL/EXIC 与其引用的 ANIM、NEBC 与其 BITM、AISTUFF.NOB、SCCT 槽位的 MUSC，以及救援对象与救援船（B-005、U-028）。本项自行追踪它们的来源；05 若已完成，可参考其身份线索，但不以 05 为前提。
- **决定表：** 每项记录来源（文件、类型与条目，或 EXE 对象与偏移）、载入或消费地址、闭环用途与 L/R/V 关联、置信度、受影响的 U 项、已交付时的 Asset ID 与内容身份（`ContentIdentity`，见 [P2 退出评审](../../../../reviews/P2-exit.md#候选与证据身份)）、处理决定（P3-03 导入／已交付／代码规则或绘制，无新增资源／G 缺省，P4 补齐／有证据证明闭环不使用／待研究）与负责任务。Smacker 的处置以 08 的定类为准。决定表写在本项完成证据中，作为 P3-03 spec 的输入。
- **完成门槛：** 间接调用、运行时计算的 ID 与未追踪路径逐项记录；影响闭环的待研究来源或引用为零，否则本项 blocked。规则语义未明而来源与结构范围已确定的项，可带 U 项交负责任务。
- **记录：** 原版结构事实写入对应的格式文档（英文，如 imfat、hud、audio、scenario、executable）；受影响 U 项（例如 U-001、U-020、U-028）的线索更新，负责阶段不改。脚本与输出在 `local/research/p3-01/closure/`。

## 不包含

- 解析器、内容契约与切片定义的修订：归 P3-03。
- 规则语义的研究与实现：归负责的规则任务。

## 关键文件与契约

- [executable §4](../../../../original/formats/executable.md#4-code-landmarks)、[武器记录](../../../../original/formats/executable.md#weapon-records-and-the-first-missions-shooters-p2-1230)、[效果来源](../../../../original/formats/executable.md#effect-presentation-sources)；[imfat](../../../../original/formats/imfat.md)；[audio](../../../../original/formats/audio.md)；[hud](../../../../original/formats/hud.md)；[scenario](../../../../original/formats/scenario.md)。
- 已交付内容：[slice-definition.ts](../../../../../src/content/slice-definition.ts) 与[生产包配置](../../../../../src/workers/production-package.ts)（只读）。
- 08 的完成证据（Smacker 的定类）；02 的工具；05 的完成证据（如已有）。

## 写入范围

- `docs/original/formats/*.md`：闭环载入数据的结构事实。
- `docs/original/unknowns.md`：受影响 U 项的线索（负责阶段不改）。
- `local/research/p3-01/closure/**`：研究脚本、Ghidra 输出、配方、私有运行目录与报告（被忽略）。

## 验收标准

- [ ] AC-10：决定表覆盖全部起点、已知线索与 L/R/V 必需依赖；每项有来源、用途、引用边界、置信度与处置；已交付项绑定 Asset ID 与内容身份；“不使用”有证据；无新增资源的代码绘制单独归类。
- [ ] 影响闭环的待研究来源或引用为零，否则本项 blocked；覆盖限制已写明。
- [ ] 原版事实已写入格式文档；没有原版字节、文字或反编译代码；修改的文档 `updated:`、链接与锚点有效。

## 验证方法

- 只读 Ghidra 的载入调用分析；必要时用工具在私有基准运行中核对实际请求的 ID（报告只在 `local/`）。
- 以已交付的切片定义核对“已交付”项；文档链接与锚点检查。不涉及浏览器。

## 完成证据
