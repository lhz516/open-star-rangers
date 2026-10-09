---
type: plan
status: active
phase: P3
task: "02"
subtask: "02"
updated: 2026-10-09
---

# 02 — 原版研究：放置、坐标换算与数值

**契约来源：** [spec](../spec.md) 的 S-09、AC-14；[原版研究](../spec.md#原版研究)的 Q-02、Q-03、Q-11；[数值表示](../spec.md#数值表示)、[随机数](../spec.md#随机数)与[对照方法与判据](../spec.md#对照方法与判据)的 R-02 放置行。
**依赖：** 无。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

用只读 Ghidra 回答以下问题，事实写入 executable 与 scenario（英文，逐条标注置信度）：

- **Q-02 放置：**
  - 锚点偏移 `0x68708`、矩形均匀 `0x6883c` 与全世界缺省 `0x68c98` 的随机映射：C 库 `rand()`（`0x7453b`）的取值范围，取模或缩放方式，每轴的抽取次数与次序，轴之间及编组成员之间的关联，端点是否可取到；
  - `0x68398` 中放置结果与世界矩形比较后的处理（钳位、重抽或其他）；存储位置路径与零向量判定（符号被忽略）；
  - 段 5 派发 `0x67678` 中重算锚点的条件，以及模板 +0x58/+0x5C 复制到成员的条件。
  - 网格路径 `0x685e0` 与固定高度掩码 `0x87c` 在切片中被拒绝，只需确认切片不经过，不要求完整研究。
- **Q-03 运行时比例：**
  - 构建器在 `0x66d3e` 传给 `0x68d2c` 的常量；f32 位置与 i32 生成矩形、间距换算后的取整与存储；
  - 哪些记录被换算：带 `object` 来源的段 1 记录（同时被编组引用时只换算一次）、仅从段 5 可达的记录、SCCT 僚机记录；
  - 世界矩形与 `mapFrame` 的关系（已有 P2-12 读数的结论，此处只补换算所需的精度事实）。
- **Q-11 数值（U-009）：** 实例化路径上的位置、初始姿态与相关运算（开方、三角函数）的存储与中间运算类型、轴约定，以及是否查表。运动、制导的其他路径只记交给 P3-06、P3-07 的责任。
- **交给 06：** 每个随机映射的独立推导（有限随机域、到输出的映射、各结果的原像计数、端点与关联）、换算的舍入区间与组合方式，作为 06 测试的独立期望来源；只记代码推出的映射与常量，不记原版数据值。
- **记录：** U-009 更新状态与线索，负责阶段不改；若结论使 spec 的数值或换算规则不可实现，写明冲突交协调者走 spec 修订。脚本与输出在 `local/research/p3-02/placement/`。

## 不包含

- 放置服务与换算的实现（06）；排程与缺省（03）；运行时支持集核对（10）。

## 关键文件与契约

- [放置与调度](../../../../original/formats/executable.md#mission-placement-scheduling-and-world-grid)、[地图投影](../../../../original/formats/executable.md#strategic-map-projection)、[效果几何](../../../../original/formats/executable.md#effect-geometry-data-p2-0614-research)、[executable §2](../../../../original/formats/executable.md#2-linked-libraries-confirmed-unless-noted)。
- [scenario §2–3](../../../../original/formats/scenario.md#3-132-byte-object-record-structure-confirmed-fields-partly-likely)、[段 5 成员](../../../../original/formats/scenario.md#section-5-member-records-confirmed-access)。
- [logic-content.ts](../../../../../src/content/logic/logic-content.ts) 的 `MissionCoordinates`（参考单位与运行时单位）。

## 写入范围

- `docs/original/formats/executable.md`：Q-02、Q-03、Q-11 的代码事实。
- `docs/original/formats/scenario.md`：记录字段的换算与放置补充。
- `docs/original/unknowns.md`：U-009 及受影响 U 项（负责阶段不改）。
- `local/research/p3-02/placement/**`：Ghidra 脚本、输出与私有项目副本（被忽略）。

## 验收标准

- [ ] Q-02 达到门槛（已确认，代码）：每个切片经过的放置例程的随机映射、端点、关联与世界矩形处理，以及段 5 锚点与模板复制条件。
- [ ] Q-03 达到门槛（已确认，代码）：运行时比例常量、各类记录的换算对象与取整。
- [ ] Q-11 达到门槛：实例化路径的数值语义已确认（代码）；三角函数是否查表的整体结论至少高概率，并写明交给 P3-06、P3-07 的部分。
- [ ] 完成证据给出 06 所需的独立推导；U-009 已更新，负责阶段未改；无反编译代码或原版内容；`updated:`、链接与锚点有效。

## 验证方法

- 只读 Ghidra 的原生指令、常量与调用链核对。
- 文档链接与锚点检查；`git diff` 审阅。运行时支持集的核对归 10。

## 完成证据
