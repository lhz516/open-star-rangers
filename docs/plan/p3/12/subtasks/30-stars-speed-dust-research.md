---
type: plan
status: active
phase: P3
task: "12"
subtask: "30"
updated: 2026-10-17
---

# 30 — 星点与速度尘埃研究

**契约来源：** [spec](../spec.md) 的 S-13、S-15、AC-18、AC-23；[原版研究](../spec.md#原版研究) Q-14；[星点与速度尘埃](../spec.md#星点与速度尘埃)。
**依赖：** 08。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **Q-14：** `0x3fbc0` 的星点方向表（已确认为设种子前的确定表：500 项、每项两次抽取、颜色 i % 6 + 1；需要确认方向的构造公式，以便 31 用原版 C 库 `rand` 默认序列的独立确定生成器重现同一张表）；`0x3fd60` 的投影、取整与清除 `0x3fd20`；`0x44f74` 的粒子盒、越界与在后方的判定、重生的随机抽取（每个粒子 4 次）、颜色公式（夹在 2–7）、速度份额 `0x1b0758` 与粒子数的关系、Warp 中线段的端点；`0x44f00` 的清除；两层在 F1、被毁视角与 Warp 中的推进节奏（按 pass 或按时间）。
- 速度份额不能由已批准的 [D-01](../../02/spec.md#p3-12-的契约修订d-01)推导（spec 的[星点与速度尘埃](../spec.md#星点与速度尘埃)）。研究 `0x21c78` 与各相机函数对 `0x1b0758` 的写入，给出补充项 FS-12 的推荐定稿：字段（份额本身或可无歧义推导它的速度量）、类型与单位、各视角与被毁视角各阶段（30、有效跟随、失效保持）的取样点、复位、快照与版本影响。用户已批准方向并授权协调者按推荐方案写入 P3-02，因此本项只把推荐定稿写入完成证据，不改 `docs/plan/`。
- 证据途径：已有记录（[FC2](../../../../original/formats/executable.md#fc2-layers-per-view-mode--confirmed-code) 及相关段落）、本地截图（F1、Warp 066）、参考视频与只读 Ghidra（`-noanalysis -readOnly`，私有副本）。不运行 DOSBox-X；静态无法达到 spec 所需置信度的项写成精确缺口并交协调者。
- 08 已完成，因此本项直接把结论写入 [executable](../../../../original/formats/executable.md)（扩写 FC2 第 12、13 步等相关节，不重复已有事实）与 [unknowns](../../../../original/unknowns.md)，标注置信度与证据。
- 在任何新版画面出现之前，为星点与速度尘埃冻结对照方案附录 `local/research/p3-12/comparison-plan/addendum-q14.md`（格式与判据同 08 的 `plan.md`），在完成证据中给出摘要与 SHA-256。

## 不包含

- 实现（31）；接入与浏览器读回（23、25）；真实内容配对与判定（26、27）。

## 关键文件与契约

- 08 写入的 [executable](../../../../original/formats/executable.md) 渲染节与 `local/research/p3-12/comparison-plan/plan.md`。
- 计划新增：`local/research/p3-12/stars-dust/`（被忽略）。

## 写入范围

- `docs/original/**`：Q-14 的原版事实与 U 项。
- `local/research/p3-12/stars-dust/**`：脚本、输出、私有项目副本与 findings。
- `local/research/p3-12/comparison-plan/addendum-q14.md`：冻结的对照方案附录。

## 验收标准

- [ ] Q-14 达到已确认（代码），外观标注置信度与依据；缺口精确列出并交协调者。
- [ ] FS-12 的推荐定稿（字段、取样点、复位、快照与版本影响）及其原版依据已写入完成证据。
- [ ] 给 31 的计算步骤与独立期望构造方法已写入完成证据。
- [ ] 对照方案附录在任何新版画面之前冻结，摘要与指纹在完成证据中。
- [ ] 改动文档的 `updated:`、链接与锚点有效；仓库中没有原版内容、截图或反编译输出（`pnpm check:compliance`）。

## 验证方法

- 对照 spec 的 Q-14 逐项核对结论与所需置信度；文档链接与合规检查。

## 完成证据
