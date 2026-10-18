---
type: plan
status: active
phase: P3
task: "11"
subtask: "06"
updated: 2026-10-17
---

# 06 — 原版证据复用审计与预实验

**契约来源：** [spec](../spec.md) 的 S-11、AC-15；[对照方法与判据](../spec.md#对照方法与判据)（证据组合、失败链运行、逐分支证据与缺口）；[实施关卡](../spec.md#实施关卡) D-02 的定稿依据。
**依赖：** 01, 02。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **复用审计：** 逐项核对已有证据能覆盖哪些验收量：B-003 的成功观察（任务身份、配置、正常输入、前提→触发→结果链）；B-009 的 p-b-01（被毁至逃生舱到期）；P3-06 至 P3-10 的合格私有运行中可能含有的被毁、救援、信标或全清片段。记录每份证据的身份、配置、配方指纹、字段与适用范围，不把它们推广到未覆盖的部分。
- **逐分支缺口表：** 对 spec [逐分支证据与缺口](../spec.md#逐分支证据与缺口)的八项及 R-20 至 R-22 的主链，列出代码证据、可用的已有运行、是否含必需运行量、尚缺的最小读数与可合并的取证窗口。
- **原版侧预实验（只在必要时）：** 为确定 D-02 的分辨率、窗口与误差预算，或验证配方能否以模拟器内输入进入任务、跳过媒体并接敌，做有界的原版运行；只看原版数据，不运行或查看新版对应结果。
- **工具：** 现有 `tools/baseline/` 能力不足（例如停止点、读数或刺激）时，按既有契约增量扩展并补合成测试与[运行时测量](../../../../guides/runtime-measurement.md)说明；不改变已有配方的语义。

## 不包含

- D-02 的定稿与批准（07）；正式采样（20）；新版结果。

## 关键文件与契约

- [B-003](../../../../original/behavior/B-003-campaign-flow.md)、[B-005](../../../../original/behavior/B-005-campaign-rescue.md)、[B-009 的运行](../../../../original/behavior/B-009-combat-rules.md#运行)、[B-006](../../../../original/behavior/B-006-simulation-timing.md)；[运行时测量](../../../../guides/runtime-measurement.md)、[模拟器内输入](../../../../guides/runtime-measurement.md#模拟器内输入)。
- [measure.py](../../../../../tools/baseline/measure.py)、[recipe.py](../../../../../tools/baseline/recipe.py)、[inputs.py](../../../../../tools/baseline/inputs.py)。

## 写入范围

- `local/research/p3-11/reuse/**`：审计表、缺口表、预实验配方、私有运行目录与报告。
- `tools/baseline/**`：确需扩展时的工具与合成测试。
- `docs/guides/runtime-measurement.md`：工具扩展的用法说明。

## 验收标准

- [ ] 复用审计与逐分支缺口表完成，每项写明证据身份与适用范围、尚缺的最小读数。
- [ ] 预实验（如做）报告为 `complete`，只含原版侧数据，遵守单一会话、文件保护与自有进程清理；未改写任何游戏状态。
- [ ] 工具扩展（如有）通过 `python3 -B -m unittest discover -s tools/baseline -p 'test_*.py'`，用法已写入指南。

## 验证方法

- 对照 spec 的证据组合表检查缺口表的完整性。
- 预实验报告的资格字段（身份、映射、停止、重复读数）全部合格。
- git 审阅只改写入范围内的文件。

## 完成证据
