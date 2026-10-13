---
type: plan
status: active
phase: P3
task: "07"
subtask: "29"
updated: 2026-10-13
---

# 29 — 最终对齐

**契约来源：** [spec](../spec.md) 的 S-01 至 S-12、AC-01 至 AC-17；P3-02 spec 的 [P3-07 的契约修订](../../02/spec.md#p3-07-的契约修订d-01d-03)（CR-01 至 CR-14）。
**依赖：** 01, 02, 03, 04, 05, 06, 07, 08, 09, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

只做验证，不交付新的功能代码。发现缺口时，由协调者新增修复子任务：新 ID，插入本项之前，并加入本项的依赖。

- **覆盖：** 按 [goal 的验收覆盖](../goal.md#验收覆盖)，逐项核对 S-01 至 S-12、AC-01 至 AC-17 都有完成证据。
- **关卡：** D-01、D-02、D-03 的批准记录都在（按用户在 [goal 审批节](../goal.md#审批)的预先授权，由 agent 批准最推荐的方案）：
  - D-01 与 D-03 在 [P3-02 spec](../../02/spec.md)；
  - D-02 在本任务 spec；
  - 每项批准都早于依赖它的实现或正式采样；D-02 的批准还早于看到新版的连续行为结果。
- **契约不变量：**
  - `src/core` 保持纯净。P3-04 已删除 P1 的合成演示（`src/core/synthetic` 等，经 33 合入本分支，见 [source-structure](../../../../engineering/source-structure.md#p3-04-合成演示退役记录)），“正式模块与合成模块互不导入、合成 Core 的测试未改变”两项不再适用，核对时记录这一点；
  - 共享形状与 CR-01 至 CR-14 一致；战斗组是 `flight.combat`，不是独立分区；规则输入是与 `craftInfo` 并列的六项顶层输入（含 `aiPrograms`）；
  - 没有开放字段、万能事件载荷、可注入处理器的生产入口或空调用点；
  - 有序开火请求，每个命令恰有一个结果；
  - 规则可见性不读渲染；纯表现随机不消耗世界 RNG；EXPL 选择、额外爆炸与判别值 1、2 碎片不在 Core 中，CR-11 的已批准差异已写入 Core 模块说明；
  - 跨 tick 的事实由消费任务拥有：P3-07 只在 CR-13 的固定调用点留下位置说明，没有空函数或待处理标志；未接入 P3-11 的结果没有被宣称已运行。
- **候选一致：** 25、27 与 37 的候选 `src/` 树与当前一致。若不一致，核对其后的改动是否影响所测行为；有影响的，由协调者新增重跑子任务。
- **研究：**
  - Q-01 至 Q-12 各自达到门槛，或按 spec 记为阻塞并有恢复条件；30 的两项事实已写入 executable 与 cockpit；冲突 29 的常量已有运行时读数，生产取值与之一致；
  - 高概率结论有标注；
  - U 项已更新，负责阶段未改。
- **工程检查：**
  - `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts`；
  - `pnpm check`；
  - `pnpm check:compliance`；
  - 若 09、26 或 38 改动了 `tools/baseline/`，运行 `python3 -B -m unittest discover -s tools/baseline -p 'test_*.py'`。
- **文档与原版隔离：**
  - 改动的文档 `updated:`、链接与锚点有效；
  - 仓库中没有原版内容、反编译输出、读数或截图，研究输出只在 `local/research/p3-07/`；
  - `node tools/task-state.ts p3/07` 没有计划问题。

## 不包含

- 新功能、规则或文档内容的补写（交给修复子任务）。
- push、合并或部署。

## 关键文件与契约

- [spec](../spec.md)、[goal](../goal.md)、[P3-02 spec](../../02/spec.md) 与 01 至 28、30 至 38 的完成证据。

## 写入范围

无。

## 验收标准

- [ ] S-01 至 S-12、AC-01 至 AC-17 逐项有证据，没有未披露的缺口。
- [ ] D-01 至 D-03 的批准记录齐全且时序正确；上列契约不变量逐项通过；25、27 与 37 的候选与当前一致，或差异已处理。
- [ ] `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts`、`pnpm check`、`pnpm check:compliance` 通过；适用时 baseline 工具测试通过。
- [ ] 文档链接、元数据与原版隔离核对通过；`node tools/task-state.ts p3/07` 没有计划问题。

## 验证方法

- 运行上列命令并记录结果；审阅 `git status`、`git diff` 与提交的文件列表。
- 对照 spec 与各 subtask 的完成证据逐项核对。

## 完成证据
