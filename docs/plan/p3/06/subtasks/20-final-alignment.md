---
type: plan
status: active
phase: P3
task: "06"
subtask: "20"
updated: 2026-10-09
---

# 20 — 最终对齐

**契约来源：** [spec](../spec.md) 的 S-01 至 S-10、AC-01 至 AC-12。
**依赖：** 01, 02, 03, 04, 05, 06, 07, 08, 09, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 21。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

只做验证，不交付新的功能代码。发现缺口时，由协调者新增修复子任务（新 ID，插入本项之前并加入依赖）。

- **覆盖：** 按 [goal 的验收覆盖](../goal.md#验收覆盖)，逐项核对 S-01 至 S-10、AC-01 至 AC-12 都有完成证据。
- **检查点：** 检查点 A、B、C 的定稿记录（依用户 2026-10-09 的预先授权）存在于各 spec 的审批节，且提交早于依赖它们的代码提交或正式采集（AC-12、AC-10）；没有修订越过授权的边界（冻结决定）。
- **契约不变量：**
  - Core 不持有跨 tick 的按键或命令队列，不按 DOS 轮询丢弃命令；每个合法命令恰好一个结果；
  - 手动轴归零或地图中不施加旧的手动转向；中立输入不恢复旧轴；
  - 没有在 `step()` 之外推进时钟或接受任意步长的生产入口；没有可注入处理器的生产入口；
  - 未就绪的分区与开发期初值有明确标识，没有伪造的玩法数据；
  - 版本相对主线各递增一次；预算与上限一致；
  - M-01 至 M-10 各自达到门槛，或已按 spec 记为阻塞并有恢复条件。
- **工程检查：** `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts`；`pnpm check`；`pnpm check:compliance`；若 07 改动了 `tools/baseline/`，运行 `python3 -B -m unittest discover -s tools/baseline -p 'test_*.py'`；P3-04 已接入时运行其浏览器回归。
- **文档与原版隔离：** 改动文档的 `updated:`、链接与锚点有效；U 项的负责阶段未改；仓库中没有原版内容、反编译输出、读数或截图，研究输出只在 `local/research/p3-06/`；`node tools/task-state.ts p3/06` 没有计划问题。

## 不包含

- 新功能、规则或文档内容的补写（交给修复子任务）。
- push、合并或部署。

## 关键文件与契约

- [spec](../spec.md)、[goal](../goal.md) 与 01–19、21 的完成证据。

## 写入范围

无。

## 验收标准

- [ ] S-01 至 S-10、AC-01 至 AC-12 逐项有证据，没有未披露的缺口。
- [ ] 检查点批准的时序与上列契约不变量逐项核对通过。
- [ ] `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts`、`pnpm check`、`pnpm check:compliance` 通过；适用时 baseline 工具测试与浏览器回归通过。
- [ ] 文档链接、元数据与原版隔离核对通过；`node tools/task-state.ts p3/06` 没有计划问题。

## 验证方法

- 运行上列命令并记录结果；`git status`、`git log` 与提交的文件列表审阅。
- 对照 spec 与各 subtask 的完成证据逐项核对。

## 完成证据
