---
type: plan
status: active
phase: P3
task: "02"
subtask: "12"
updated: 2026-10-09
---

# 12 — 最终对齐

**契约来源：** [spec](../spec.md) 的 S-01 至 S-10、AC-01 至 AC-16。
**依赖：** 01, 02, 03, 04, 05, 06, 07, 08, 09, 10, 11, 13, 14, 15。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

只做验证，不交付新的功能代码。发现缺口时，由协调者新增修复子任务（新 ID，插入本项之前并加入依赖）。

- **覆盖：** 按 [goal 的验收覆盖](../goal.md#验收覆盖)，逐项核对 S-01 至 S-10、AC-01 至 AC-16 都有完成证据。
- **契约不变量：**
  - Core 不持有跨 tick 的命令或按键队列；所有合法命令有且仅有一个结果。
  - 没有在 `step()` 之外推进时钟的接口；R-01 没有被写成整帧一致。
  - 正式模块与合成模块互不导入；合成格式与测试未改变（helper 移动除外）。
  - 未就绪分区没有伪造的玩法数据；没有可注入处理器的生产入口。
  - Q-01 至 Q-11 各自达到门槛，或已按 spec 记为阻塞并有恢复条件。
- **工程检查：** `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts`；`pnpm check`；`pnpm check:compliance`；若 10 改动了 `tools/baseline/`，运行 `python3 -B -m unittest discover -s tools/baseline -p 'test_*.py'`。
- **文档与原版隔离：** 改动的文档 `updated:`、链接与锚点有效；U 项的负责阶段未改；仓库中没有原版内容、反编译输出、读数或截图，研究输出只在 `local/research/p3-02/`；`node tools/task-state.ts p3/02` 没有计划问题。

## 不包含

- 新功能、规则或文档内容的补写（交给修复子任务）。
- push、合并或部署。

## 关键文件与契约

- [spec](../spec.md)、[goal](../goal.md) 与 01–11 的完成证据。

## 写入范围

无。

## 验收标准

- [ ] S-01 至 S-10、AC-01 至 AC-16 逐项有证据，没有未披露的缺口。
- [ ] 上列契约不变量逐项核对通过。
- [ ] `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts`、`pnpm check`、`pnpm check:compliance` 通过；适用时 baseline 工具测试通过。
- [ ] 文档链接、元数据与原版隔离核对通过；`node tools/task-state.ts p3/02` 没有计划问题。

## 验证方法

- 运行上列命令并记录结果；`git status`、`git diff` 与提交的文件列表审阅。
- 对照 spec 与各 subtask 的完成证据逐项核对。

## 完成证据
