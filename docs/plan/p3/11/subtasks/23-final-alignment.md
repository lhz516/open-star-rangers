---
type: plan
status: active
phase: P3
task: "11"
subtask: "23"
updated: 2026-10-17
---

# 23 — 最终对齐

**契约来源：** [spec](../spec.md) 的 S-01 至 S-12、AC-01 至 AC-16。
**依赖：** 01, 02, 03, 04, 05, 06, 07, 08, 09, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 逐项核对 [验收覆盖](../goal.md#验收覆盖)：每个 S 与 AC 都有实现与验证证据，证据指向相应 subtask 的完成证据。
- 核对关键不变量：全清/预结算/锁存/完成四个时点分开；第三次损失才失败；救援恢复顺序；退场后活实体归零；完成后 step 不污染读取；Core 纯度；replay 与占位用时无关；没有未披露的占位或近似规则；没有原版内容进入受跟踪文件。
- 核对 D-01、D-02 的批准记录与实现一致；未运行或 blocked 的分支已如实记录。
- 运行工程检查：`pnpm check`、`pnpm check:compliance`、`pnpm test:e2e`（本任务与受影响的既有 spec）；工具改动时运行 `python3 -B -m unittest discover -s tools/baseline -p 'test_*.py'`；`node tools/task-state.ts p3/11`。
- 不交付新功能代码；缺口交协调者新增修复子任务，插入本行之前。

## 不包含

- 新功能、文档补写（缺口另设子任务）。

## 关键文件与契约

- [goal](../goal.md)、各 subtask 的完成证据、[spec](../spec.md)。

## 写入范围

- 无。

## 验收标准

- [ ] S-01 至 S-12、AC-01 至 AC-16 全部有证据，或有明确记录的 blocked 项与恢复条件。
- [ ] 关键不变量逐项核实。
- [ ] `pnpm check`、`pnpm check:compliance`、相关 `pnpm test:e2e` 与适用的 Python 测试通过。
- [ ] `node tools/task-state.ts p3/11` 不报计划问题。

## 验证方法

- 逐项核对证据与上列命令；git 审阅确认没有越界修改或原版内容。

## 完成证据
