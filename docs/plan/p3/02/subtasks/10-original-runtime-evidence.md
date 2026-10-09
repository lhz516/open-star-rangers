---
type: plan
status: active
phase: P3
task: "02"
subtask: "10"
updated: 2026-10-09
---

# 10 — 原版运行时取证（B-007）

**契约来源：** [spec](../spec.md) 的 S-09；AC-14、AC-15（原版部分）；[原版研究](../spec.md#原版研究)中须经运行时核对的 Q-02（支持集）、Q-04（+0xDC/+0xE0/+0xE4）与 Q-06；[对照方法与判据](../spec.md#对照方法与判据)。
**依赖：** 02, 03。
**执行方式：** 需用户：在 DOSBox-X 的私有副本中只用键盘进入所选任务并飞行到延迟来源生成，带与不带僚机各至少一次（每次约 10–20 分钟）。原因：P3-01 实测本机 Computer Use 无法向 DOSBox-X 送达按键或移动游戏内光标；agent 负责方案、配方、启动、读数、应答、判定与记录。执行时若该限制已解除，协调者改为自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **采集前的方案（B-007）：** 按[行为模板](../../../../original/behavior/_template.md)新建 B-007，并在 `local/research/p3-02/runtime/plan.md` 写定后才运行：
  - 场景与配置：战役 group 0 / slot 1，原始难度 19（`gameSettings` 的 `CURR_LEVEL` 与 `STARTUP_PRACTICE`），僚机选择（无与一个名单项），cycles（记录实际值；基准为 40000），过场设置（记录基准值；如另做关闭过场的运行，单独记录，不覆盖基准结论）。
  - 观测量（地址取自 01–03 与既有记录）：生成队列原点 `0x176740`、帧样本 `0x186414` 与步长、生成队列项及计数、源记录与编组的生成计数，实例化对象的种类、位置、+0xDC/+0xE0/+0xE4 与当时的锚点。
  - 暂停点：实例化处与生成队列检查处的断点；说明暂停不改变游戏状态；记录调试暂停对计时的影响。
  - 判据：按 spec 的 R-02/R-03 行。首轮队列检查单独判定 elapsed > due 与全部已到期项；延迟项判定上一轮 elapsed ≤ due 且本轮 elapsed > due 并在本轮全部派发；位置落入由当时操作数推出的支持集（舍入区间按 02 的推导组合）；+0xDC/+0xE0/+0xE4 等于 03 推出的缺省或落在其随机映射内；无僚机时没有僚机，带僚机时恰好所选项。两次运行是离散覆盖下限，不做分布统计。
  - 有效运行与重做规则、误差来源。
- **工具：** 用 [tools/baseline/](../../../../../tools/baseline/) 运行；若读取实例化对象需要现有配方不支持的能力（例如更多暂停点或其他定位方式），按工具既有契约增量扩展，补合成测试并同步[运行时测量指南](../../../../guides/runtime-measurement.md)与[工具用法](../../../../guides/tools.md)。不得用 shell 或 AppleScript 向 DOSBox-X 注入按键。
- **运行：** 写本地操作手册（进入路线、允许与禁止的输入、何时报告）；至少 2 次报告为 `complete` 的合格运行（带与不带僚机各 1 次）。失败或不合格的运行保留证据，用新编号重做，不合并统计。
- **结论：** B-007 写入方法、样本、判定与证据（只记安全身份、计数与判定，不记读数原值）；Q-06 的运行时确认写入 scenario 或 executable；U-022、U-023 更新状态与线索，负责阶段不改。以真实秒表示的结论不在本项范围；实际帧生效时间遵守 [B-006](../../../../original/behavior/B-006-simulation-timing.md) 的 cycles 前提。
- **阻塞：** 无法取得必需的输入操作或合格样本时，本项记为 blocked，写明尝试、缺口与恢复条件，不用合成测试或静态结论代替。

## 不包含

- 新版实现与原版的对照结论（11）；真实内容核对（09）。
- 冻结 U-021（负责阶段 P0）。

## 关键文件与契约

- [运行时测量指南](../../../../guides/runtime-measurement.md)、[原版证据获取](../../../../guides/original-evidence.md#agent-运行原版)、[基准环境](../../../../guides/baseline-environment.md)。
- [B-006](../../../../original/behavior/B-006-simulation-timing.md)（计时与 cycles 前提）；P3-01/07 的配方与操作手册可参考（`local/research/p3-01/timing-runtime/`）。
- 计划新增：`docs/original/behavior/B-007-mission-instantiation.md`；被忽略的 `local/research/p3-02/runtime/`。

## 写入范围

- `docs/original/behavior/B-007-mission-instantiation.md`：测量方案、样本与结论（新建）。
- `docs/original/formats/scenario.md`、`docs/original/formats/executable.md`：Q-06 等运行时确认。
- `docs/original/unknowns.md`：U-022、U-023（负责阶段不改）。
- `tools/baseline/**`：仅在需要时的增量扩展与合成测试。
- `docs/guides/runtime-measurement.md`、`docs/guides/tools.md`：工具扩展后的用法同步。
- `local/research/p3-02/runtime/**`：方案、配方、操作手册、私有运行目录与分析（被忽略）。

## 验收标准

- [ ] B-007 在采集前写明场景、配置、观测量、样本、误差来源、判据与重做规则。
- [ ] 至少 2 次合格运行（带与不带僚机各 1 次，工具报告为 `complete`），原文件保护与进程回收通过。
- [ ] R-02 的生成时刻、放置支持集、缺省值与 R-03 的门禁按判据得出原版侧结论；Q-02、Q-04、Q-06 的运行时部分已记录。
- [ ] U-022、U-023 已更新，负责阶段未改；仓库中没有原版读数、截图或反编译输出；改动的文档 `updated:`、链接与锚点有效。
- [ ] 若改动了 `tools/baseline/`：`python3 -B -m unittest discover -s tools/baseline -p 'test_*.py'` 通过，指南已同步。

## 验证方法

- 工具私有报告、配方指纹与运行笔记；分析脚本在 `local/research/p3-02/runtime/` 中按预先写定的判据输出判定。
- 文档链接与锚点检查；`git diff` 审阅确认没有原版内容。

## 完成证据
