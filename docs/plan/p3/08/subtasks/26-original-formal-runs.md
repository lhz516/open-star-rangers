---
type: plan
status: active
phase: P3
task: "08"
subtask: "26"
updated: 2026-10-15
---

# 26 — 原版正式运行

**契约来源：** [spec](../spec.md) 的 S-13、AC-15；[对照方法与判据](../spec.md#对照方法与判据)；11 批准的 D-02 与 B-011 的方法。
**依赖：** 07, 11。
**执行方式：** 自动。需要游戏输入时先写成测量配方由 `measure.py` 写入模拟器内输入；只有配方不能表达的操作才按[本机限制](../../../../guides/runtime-measurement.md#角色单一会话与本机限制)请用户在私有副本中做最小操作。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 按 B-011 的方法与 spec 的正式采样计划做正式采样：至少 8 次 `complete` 运行（含带与不带僚机），覆盖 11 定稿的各僚机行为等价类与 spec 的[采样覆盖下限](../spec.md#对照方法与判据)：程序选择与重装、状态转换、每个可达操作码、目标与份额、敌机开火与按住、基地获取与连发（含连续节奏）、规避、僚机伴飞/交战/返航、僚机导弹、命令码 1–7、停放 AI 与集合、离场、Xpon 与 `b`。
- 样本不足时针对性补采；仍取不到的分支记为未完成并写明尝试，不自动改为静态验收。
- 工具能力不足时按既有契约扩展 `tools/baseline/` 并补合成测试。

## 不包含

- 新版对照与结论（27）。

## 关键文件与契约

- `docs/original/behavior/B-011-ai-wingman.md`（11 新建）、[runtime-measurement](../../../../guides/runtime-measurement.md)。
- 计划新增：`local/research/p3-08/runtime/`（被忽略）。

## 写入范围

- `local/research/p3-08/runtime/**`：配方、运行与报告（被忽略）。
- `tools/baseline/**`：必要的能力扩展与合成测试。
- `docs/guides/runtime-measurement.md`：工具改动的用法。

## 验收标准

- [ ] 合格运行满足覆盖与预算要求，报告为 `complete`，原版文件保护与进程清理通过。
- [ ] 改动 baseline 工具时其 unittest 通过。
- [ ] 仓库中没有原版内容、截图或读数。

## 验证方法

- `measure.py` 报告的合格条件；`python3 -B -m unittest discover -s tools/baseline -p 'test_*.py'`（适用时）；git 审阅。

## 完成证据
