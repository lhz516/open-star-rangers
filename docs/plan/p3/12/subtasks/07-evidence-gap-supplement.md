---
type: plan
status: active
phase: P3
task: "12"
subtask: "07"
updated: 2026-10-16
---

# 07 — 证据缺口评估与最小补证

**契约来源：** [spec](../spec.md) 的 S-13、AC-21；[原版证据途径与 DOSBox-X 的使用](../spec.md#原版证据途径与-dosbox-x-的使用)、[表现对照与判定](../spec.md#表现对照与判定)。
**依赖：** 01, 02, 03, 04, 05, 06。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 汇总 01 至 06 列出的缺口，逐项判断：已有记录、截图、P3-07 的运行读数或参考视频是否已足够；不足时最小的补证是什么。
- 需要新的原版运行时，先在完成证据中写明复用失败的原因、受影响的 AC、最小配方或操作、输出与停止条件，再合并为尽量少的运行；用 `tools/baseline/measure.py` 的已声明输入刺激与读数能力，由 agent 独立完成。需要原始像素时先确认 Capture 输出可得，不以宿主截图冒充。
- 同一时间只有一个会话操作基准环境；与 P3-11、P3-14 已安排的采集能合并的合并。
- 现有路线都无法取得的必需证据：记录尝试、能力缺口与恢复条件，交协调者把受影响的验收记为 blocked；不安排用户试玩，也不把缺口记为通过。
- 结论写入 `local/research/p3-12/supplementary/findings.md`（格式同 01），由 08 并入；零次新增运行也要给出覆盖全部必需项的证据清单。

## 不包含

- 写入 `docs/original/`（08）。
- 对照判定（27）。

## 关键文件与契约

- [运行时测量指南](../../../../guides/runtime-measurement.md)、[tools/baseline/](../../../../../tools/baseline/)。
- 计划新增：`local/research/p3-12/supplementary/`（被忽略）。

## 写入范围

- `local/research/p3-12/supplementary/**`：缺口清单、配方、运行目录与 findings 草稿。
- `tools/baseline/**`：仅当既有测量能力不足、需要按既有契约增量扩展时。

## 验收标准

- [ ] AC-21：每项新运行都有理由、受影响 AC、最小配方、停止条件与输出清单，并记录配置、配方指纹与运行 ID；可复用的项没有重跑。
- [ ] 零次新增运行时，必需项的证据来源清单完整；无法取得的项列为 blocked 并有恢复条件。
- [ ] 01 至 06 按 goal 执行记录“研究缺口交 07”移交的缺口（如 01 的 G-01 像素行取整）逐项闭合到 spec 所需置信度，或按 spec 记为 blocked 并有恢复条件。
- [ ] 改动 `tools/baseline/` 时，`python3 -B -m unittest discover -s tools/baseline -p 'test_*.py'` 通过。

## 验证方法

- 审阅缺口清单与运行记录；适用时运行 baseline 单元测试。
- `git status` 确认没有原版内容、截图或读数进入跟踪文件。

## 完成证据
