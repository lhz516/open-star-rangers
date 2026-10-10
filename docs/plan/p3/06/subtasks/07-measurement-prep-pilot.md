---
type: plan
status: active
phase: P3
task: "06"
subtask: "07"
updated: 2026-10-09
---

# 07 — 原版测量准备与预实验（B-008）

**契约来源：** [spec](../spec.md) 的 S-09、AC-10（方案部分）；[对照方法与判据](../spec.md#对照方法与判据)的覆盖下限、运行与配置；[执行检查点](../spec.md#执行检查点) B 的预实验。
**依赖：** 21。
**执行方式：** 需用户：在 DOSBox-X 的私有副本中只用键盘进入所选任务，按操作手册飞行与按键（每次约 10–20 分钟，次数视预实验需要）。原因：本机 Computer Use 无法向 DOSBox-X 送达按键；agent 负责方案、配方、启动、读数、应答与记录。执行时若该限制已解除，协调者改为自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **B-008 方案（数值判据除外）：** 按[行为模板](../../../../original/behavior/_template.md)新建 `docs/original/behavior/B-008-flight-motion.md`（创建前确认编号未被占用）：
  - 场景与配置：所选任务（战役 group 0 / slot 1）、原始难度 19、基准 `fixed 40000` cycles、过场设置、操纵驱动、灵敏度档位、僚机选择；
  - 观测量（地址取自 01–05）：运动阶段前后的位置、姿态行、移动块字段、所用机型字段与该帧步长；油门与控制块；匹配与辅助的条件量与结果；停放、活动区域与世界边界的状态；初态的两个时刻；
  - 暂停点与配对：前后态来自同一对象与预期调用；条件化单步测量与不中断窗口分开；说明调试暂停对帧分布的影响；
  - 覆盖下限按 spec；有效运行与重做规则；误差来源清单（数值判据由 08 填入）。
- **工具：** 用 [tools/baseline/](../../../../../tools/baseline/) 运行。工具目前只读配方声明的字段，不读 x87 栈或任意寄存器；若需要新能力（例如更多暂停点、成对读数），按工具既有契约增量扩展，补合成测试并同步[运行时测量指南](../../../../guides/runtime-measurement.md)与[工具用法](../../../../guides/tools.md)。不得用 shell 或 AppleScript 向 DOSBox-X 注入按键。
- **操作手册：** 写本地操作手册（进入路线、按键次序、禁止的输入、何时报告）。02 未能静态确认的飞行键，在运行准备阶段由操作者试键，以控制块读数核实，结论写入键位表与 U-011。
- **预实验：** 运行足以估计步长分布、输入对齐与读数分辨率的预实验，输出供 08 推导误差预算。预实验样本不计入正式样本（17），报告与运行目录单独编号。
- **阻塞：** 无法取得必需的输入操作或合格读数时，本项记为 blocked，写明尝试、缺口与恢复条件。

## 不包含

- 数值判据与样本数的定稿（08）；正式采集（17）；新版对照（18）。
- 冻结 U-021（负责阶段 P0）。

## 关键文件与契约

- [运行时测量指南](../../../../guides/runtime-measurement.md)、[原版证据获取](../../../../guides/original-evidence.md#agent-运行原版)、[基准环境](../../../../guides/baseline-environment.md)。
- [B-006](../../../../original/behavior/B-006-simulation-timing.md)、[B-007](../../../../original/behavior/B-007-mission-instantiation.md)（方案与配方的先例）；01–05 的完成证据。
- 计划新增：`docs/original/behavior/B-008-flight-motion.md`；被忽略的 `local/research/p3-06/runtime/`。

## 写入范围

- `docs/original/behavior/B-008-flight-motion.md`：测量方案（新建）。
- `docs/original/input/key-map.md`、`docs/original/unknowns.md`：试键核实的飞行键与 U-011（需要时）。
- `tools/baseline/**`：仅在需要时的增量扩展与合成测试。
- `docs/guides/runtime-measurement.md`、`docs/guides/tools.md`：工具扩展后的用法同步。
- `local/research/p3-06/runtime/**`：方案、配方、操作手册、预实验运行目录与分析（被忽略）。

## 验收标准

- [ ] B-008 写明场景、配置、观测量、暂停点与配对、覆盖下限、误差来源与重做规则；数值判据留待 08。
- [ ] 预实验运行的报告完整（或其缺口已记录），输出足以让 08 推导误差预算；预实验与正式样本分开编号。
- [ ] 需要试键时，飞行键已以读数核实并写入键位表与 U-011。
- [ ] 若改动了 `tools/baseline/`：`python3 -B -m unittest discover -s tools/baseline -p 'test_*.py'` 通过，指南已同步。
- [ ] 仓库中没有原版读数、截图或反编译输出；改动文档的 `updated:`、链接与锚点有效。

## 验证方法

- 工具的私有报告与配方指纹；运行笔记与预实验分析保存在 `local/research/p3-06/runtime/`。
- 文档链接与 front matter 检查。不涉及浏览器。

## 完成证据
