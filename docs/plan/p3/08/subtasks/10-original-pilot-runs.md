---
type: plan
status: active
phase: P3
task: "08"
subtask: "10"
updated: 2026-10-14
---

# 10 — 原版预实验

**契约来源：** [spec](../spec.md) 的 S-13、AC-15；[对照方法与判据](../spec.md#对照方法与判据)、[实施关卡](../spec.md#实施关卡) D-02 的定稿依据。
**依赖：** 01, 03, 04, 05。
**执行方式：** 自动。需要游戏输入时，agent 先把刺激写成测量配方，由 `measure.py` 在暂停点写入模拟器内输入；只有配方不能表达的操作才按[本机限制](../../../../guides/runtime-measurement.md#角色单一会话与本机限制)请用户在私有副本中做最小操作。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 只用原版数据做预实验，为 D-02 提供依据，不查看或计算新版的任何连续行为输出：
  - AI 控制器更新、敌机与基地开火、按住与松开、状态机计时的步长分布与时钟原点；
  - 僚机编队与跟随的相对位置与朝向、距离门禁与行为转换的可观察量、采样分辨率；
  - 输入取样边界、暂停对步长的影响、运行间的离散；
  - 01 至 05 给出的断点位置能否取得完整操作数。
- 运行配置记录 DOSBox-X cycles、游戏设置、任务、难度与僚机选择（按 [B-006](../../../../original/behavior/B-006-simulation-timing.md) 与[计时指南](../../../../guides/runtime-measurement.md#计时游戏时钟与参考钟)）。
- `tools/baseline/` 能力不足时按既有契约增量扩展，并补合成测试；工具改动同步[运行时测量指南](../../../../guides/runtime-measurement.md)与[工具用法](../../../../guides/tools.md)。
- 完成证据给出交 11 的误差预算草案：每类观测量的单位、窗口、配对条件与必要样本数的依据。预实验运行不计入 AC-15 的合格运行。

## 不包含

- 判据定稿（11）与正式采样（26）。

## 关键文件与契约

- [runtime-measurement](../../../../guides/runtime-measurement.md)、[tools/baseline/](../../../../../tools/baseline/)、[B-009](../../../../original/behavior/B-009-combat-rules.md) 的方法作参考。
- 计划新增：`local/research/p3-08/pilot/` 下的配方、私有运行目录与报告（被忽略）。

## 写入范围

- `local/research/p3-08/pilot/**`：配方、运行与报告（被忽略）。
- `tools/baseline/**`：必要的测量能力扩展与其合成测试。
- `docs/guides/runtime-measurement.md`：工具改动的用法。
- `docs/guides/tools.md`：工具改动的用法。

## 验收标准

- [ ] 预实验覆盖上列各类观测量，报告为 `complete`，原版文件保护与进程清理通过。
- [ ] 误差预算草案只依据原版数据；没有查看或计算新版的连续行为输出。
- [ ] 改动 baseline 工具时 `python3 -B -m unittest discover -s tools/baseline -p 'test_*.py'` 通过，指南同步。
- [ ] 仓库中没有原版内容、截图或读数。

## 验证方法

- `measure.py` 的报告合格条件与[原版证据指南](../../../../guides/original-evidence.md)；git 审阅。

## 完成证据
