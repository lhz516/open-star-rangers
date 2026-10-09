---
type: plan
status: active
phase: P3
task: "03"
subtask: "24"
updated: 2026-10-09
---

# 24 — HUD 直接绘制的 EXE 文字研究

**契约来源：** [spec](../spec.md) 的 S-01、AC-01；[研究门槛与阻塞](../spec.md#研究门槛与阻塞) 3 的处理步骤：先向闭包追加事实与交接记录，再修订 spec；[P3-01 对下游任务的约束](../../01/spec.md#对下游任务的约束)的 P3-03 行。
**依赖：** 无。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 04 发现 HUD、通讯与地图代码不经 `0x4e9e8`，直接绘制 EXE 中的文字常量，而闭包 [#30](../../01/subtasks/10-data-closure.md#决定表) 只列出经 `0x4e9e8` 显示的 7 条字串。已知线索，地址见 04 的完成证据与 `local/research/p3-03/comm-hud-text/out/`：
  - 通讯面板标题 `0x171e6c`（`0x4da6e`）；
  - 飞行叠加 `0x171c30`、`0x171c40`、`0x171c60`（`0x46b78`、`0x46d38`、`0x47e50`，由 `0x45de0` 调用）；
  - `0x171d18`（`0x4a507`）与 `0x171ea0`（`0x4ec81`）；
  - 基地内部 `0x4f550` 中的绘制（G-05）。
- 用只读 Ghidra 做有界追踪：从 HUD、地图与通讯的文字绘制函数出发，列出闭环中可达的、直接取自 EXE 文字常量的全部绘制点，并说明覆盖方法与限制。每条记录：
  - EXE 地址、LE 对象与对象内偏移、含 NUL 的长度、字符范围与格式说明符；
  - 绘制点、所在视角模式或画面，以及与 L/V 的关联；
  - 在所选任务中是否可达及其置信度；
  - 建议的处置：P3-03 导入（待 spec 修订）、G 缺省（例如基地内部属 G-05）、代码绘制无文字，或有证据证明闭环不使用。
- 把结构事实（英文，只含地址、长度与计数，不含文字）追加到 [executable 的数据闭包一节](../../../../original/formats/executable.md#data-loaded-by-the-loop-p3-0110)。
- 在 [P3-01/10 的完成证据](../../01/subtasks/10-data-closure.md#完成证据)末尾追加一段带日期的交接记录（“P3-03/24 追加”），列出新增行与建议的处置，不改写原有的决定表与结论。
- 在完成证据中写明：需要导入的字串清单、建议的 spec 修订（例如在 `flight-messages` 中加入这些字串，或新增一个 HUD 文字角色），以及受影响的子任务（08、09、12、15、16、19）。是否修订 spec 由用户决定。

## 不包含

- spec 修订与批准：由用户决定，协调者据此新增修复子任务。
- 解析器、payload 与转换：在 spec 修订获批之前不做。
- U 项：由 22 写入；本项在完成证据中列出 U-030 等线索。

## 关键文件与契约

- 04 的完成证据、[comm](../../../../original/formats/comm.md)、[hud](../../../../original/formats/hud.md)、[executable](../../../../original/formats/executable.md)。
- [production-executable.ts](../../../../../src/original-data/conversion/production-executable.ts)（只读）：地址到 LE 对象与偏移的换算。

## 写入范围

- `docs/original/formats/executable.md`：直接绘制的 EXE 文字的结构事实。
- `docs/plan/p3/01/subtasks/10-data-closure.md`：追加交接记录（不改写原有内容）。
- `local/research/p3-03/hud-text/**`：研究脚本、Ghidra 输出与私有副本（被忽略）。

## 验收标准

- [ ] 闭环中直接绘制的 EXE 文字常量已逐项列出，每项有地址、长度、字符范围、格式说明符、绘制点、可达性与置信度；覆盖方法与限制已写明。
- [ ] 结构事实已追加到 executable；交接记录已追加到 P3-01/10，原有内容未改写。
- [ ] 完成证据给出需要导入的字串清单、建议的 spec 修订与受影响的子任务。
- [ ] 文档只含地址、长度、计数与证据路径，没有原版文字或反编译代码；`updated:`、链接与锚点有效。

## 验证方法

- 只读 Ghidra（私有副本）与本地数据统计，产物只在 `local/`。
- 文档 diff 审阅与链接检查。不涉及浏览器。

## 完成证据
