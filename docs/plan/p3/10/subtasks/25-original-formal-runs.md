---
type: plan
status: active
phase: P3
task: "10"
subtask: "25"
updated: 2026-10-14
---

# 25 — 原版正式运行

**契约来源：** [spec](../spec.md) 的 S-11、AC-17；[对照方法与判据](../spec.md#对照方法与判据)的采样覆盖与运行要求。
**依赖：** 06, 10。
**执行方式：** 自动。原版证据由执行的 agent 按[原版证据获取](../../../../guides/original-evidence.md)自行取得。飞行与停靠先尝试配方输入；只有当前合规途径无法满足某个具体操作时，记录已尝试的途径与准确障碍，再请用户做最小操作。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 按 10 批准的判据，在私有副本中取得至少 2 次 `complete` 的合格运行，满足采样覆盖表的主链与分支数量及误差预算所需样本；记录配置、媒体设置、cycles、模拟器参考钟与 U-021 前提。
- 对 10 单独批准的静态例外分支，不做运行；其余分支预算耗尽仍不足时记为 blocked，写明尝试与恢复条件。
- 能力不足时按既有契约增量扩展 `tools/baseline/` 并补合成测试。

## 不包含

- 对照结论（26）；看新版结果。

## 关键文件与契约

- 09 的方案与预实验记录；[运行时测量](../../../../guides/runtime-measurement.md)。

## 写入范围

- `local/research/p3-10/runtime/**`：正式方案、配方与运行目录（被忽略）。
- `tools/baseline/**`：增量扩展与合成测试。
- `docs/guides/runtime-measurement.md`：工具能力变化时同步。

## 验收标准

- [ ] 至少 2 次 complete 运行满足采样覆盖与预算；刺激全部合格，完整性与自有进程清理通过。
- [ ] 每份报告绑定配置、媒体设置与参考钟；未取得的分支有阻塞记录或获批的静态例外。
- [ ] 改动工具时 `python3 -B -m unittest discover -s tools/baseline -p 'test_*.py'` 通过。

## 验证方法

- 报告按[报告与原因码](../../../../guides/runtime-measurement.md#报告退出码与原因码)核对；git 审阅只改写入范围内的文件。

## 完成证据
