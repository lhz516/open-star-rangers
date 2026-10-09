---
type: plan
status: active
phase: P3
task: "02"
subtask: "11"
updated: 2026-10-09
---

# 11 — 对照结论、Core 模块文档与交接

**契约来源：** [spec](../spec.md) 的 S-01（扩展规则的记录）、S-09（R-01 至 R-03 结论）、S-10；AC-15（新版对照结论）、AC-16；[对照方法与判据](../spec.md#对照方法与判据)、[扩展规则](../spec.md#扩展规则)。
**依赖：** 08, 09, 10, 14。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **新版对照结论（写入本 subtask 的完成证据）：** 每项绑定原版版本与配置、证据、候选提交与内容身份，原版事实置信度与新版结论分开记录：
  - R-01：按 spec 标为“单位/调度阈值一致，完整帧行为未在此验证”；披露 32 Hz 固定步长、G-02 占位不计时与原版可变步长、cycles 依赖之间的差异，不写成整帧一致。
  - R-02：综合 05–08 的 Node 测试、09 的真实内容核对与 10 的原版运行，逐项给出一致、不一致或无法判定。
  - R-03：无僚机与带僚机两种配置的结论。
  任何不一致回到相应实现或研究子任务，由协调者新增修复项，不在此放宽判据。
- **Core 模块说明：** 更新 [core.md](../../../../engineering/modules/core.md)：正式 API（创建、step、projection、Render State、快照、录制、replay、比较）、阶段表与各阶段的负责任务、扩展规则与必须修订 spec 的情形、`rulesVersion` 与格式版本的递增规则、`CoreLimits` 的数值与依据、针对性检查命令。
- **交接（写入 core.md 与完成证据）：** P3-03（种类名等新增内容需求，如有）；P3-04（运行配置、种子、动作批次、故障锁存、两帧保留与跨运行折叠、G-02 不计时）；P3-05（动作采样、按住开火、清键、Q-10 结论）；P3-06 至 P3-14（各阶段与未就绪分区、实体初始化与机型记录初值、Q-11 的数值交接）。不声明下游玩法已完成。
- **源码结构与工程约定：** 在[源码结构指南](../../../../engineering/source-structure.md)记录新增目录与职责、正式与合成模块的边界；在[工程约定](../../../../engineering/README.md)补充受影响的检查或约定（如有）。

## 不包含

- 新的功能代码或测试（缺口由协调者新增修复子任务）。
- STATUS、阶段 tasks.md 与 goal（只由协调者修改）。

## 关键文件与契约

- [core.md](../../../../engineering/modules/core.md)、[source-structure.md](../../../../engineering/source-structure.md)、[engineering/README.md](../../../../engineering/README.md)。
- 04–10 的完成证据；[B-006](../../../../original/behavior/B-006-simulation-timing.md)、B-007。

## 写入范围

- `docs/engineering/modules/core.md`：正式 Core 的 API、阶段表、扩展规则、上限与交接。
- `docs/engineering/source-structure.md`：新增目录与边界。
- `docs/engineering/README.md`：受影响的约定或检查。

## 验收标准

- [ ] AC-15（新版部分）：R-01 至 R-03 的结论、候选身份与差异说明完整；R-01 未被写成整帧一致。
- [ ] AC-16：Core 模块说明记录正式 API、阶段表、扩展规则、上限数值及其依据，以及给 P3-03、P3-04/05、P3-06 至 P3-14 的交接；源码结构指南与工程约定已同步。
- [ ] 改动的文档已更新 `updated:`，链接与锚点有效；文档描述与实际导出的 API 一致。

## 验证方法

- 对照 04–08 的实际导出与测试，逐项核对文档；文档链接与锚点检查。
- 结论逐项链接 05–10 的完成证据。

## 完成证据
