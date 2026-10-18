---
type: plan
status: active
phase: P3
task: "12"
subtask: "29"
updated: 2026-10-17
---

# 29 — 最终对齐

**契约来源：** [spec](../spec.md) 的 S-01 至 S-15、AC-01 至 AC-23；P3-02 spec 中 D-01 定稿的 P3-12 契约修订。
**依赖：** 01, 02, 03, 04, 05, 06, 07, 08, 09, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 30, 31, 32, 33, 34, 35, 36。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

只做验证，不交付新的功能代码。发现缺口时，由协调者新增修复子任务：新 ID，插入本项之前，并加入本项的依赖。

- **覆盖：** 按 [goal 的验收覆盖](../goal.md#验收覆盖)逐项核对 S-01 至 S-14、AC-01 至 AC-22 都有完成证据。
- **关卡与批准：** D-01 的批准记录在 [P3-02 spec](../../02/spec.md)，早于 10、11、12 的实现提交；冻结的对照方案早于 25、26 的新版画面。
- **契约不变量：**
  - `src/core` 保持纯净；表现模块不导入 DOM、Three.js 或 WebGL；表现代码不提交命令、不设置意图、不消耗世界 RNG；
  - 没有开放字段、万能载荷、生产状态注入或静默降级；
  - CR-11 的已批准差异、按 tick 的缓动与星云起点的项目选择已写入 render 模块说明；没有新增 G 项；
  - P3-13 接入前的在制提示可见；被毁视角的真实流程明确交 P3-15。
- **候选一致：** 25、26 的候选 `src/` 树与当前一致；不一致时核对差异是否影响所测行为，有影响则新增重跑子任务。
- **研究与证据：** Q-01 至 Q-13 达到所需结论或已按 spec 阻塞；AC-21 的运行记录齐全；仓库中没有原版内容、截图、读数或反编译输出，研究输出只在 `local/research/p3-12/`。
- **工程检查：** `pnpm exec vitest run src/core src/app src/render tools/engineering-boundaries.test.ts`、`pnpm check`、`pnpm check:compliance`；25 的浏览器回归在当前候选上通过；若改动了 `tools/baseline/`，运行其单元测试。
- **文档：** 改动文档的 `updated:`、链接与锚点有效；`node tools/task-state.ts p3/12` 没有计划问题。

## 不包含

- 新功能、规则或文档内容的补写（交给修复子任务）。
- push、合并或部署。

## 关键文件与契约

- [spec](../spec.md)、[goal](../goal.md)、[P3-02 spec](../../02/spec.md) 与 01 至 28 的完成证据。

## 写入范围

无。

## 验收标准

- [ ] S-01 至 S-15、AC-01 至 AC-23 逐项有证据，没有未披露的缺口。
- [ ] D-01 与对照方案的时序正确；上列契约不变量逐项通过；25、26 的候选与当前一致或差异已处理。
- [ ] `pnpm exec vitest run src/core src/app src/render tools/engineering-boundaries.test.ts`、`pnpm check`、`pnpm check:compliance` 与浏览器回归通过；适用时 baseline 工具测试通过。
- [ ] 文档链接、元数据与原版隔离核对通过；`node tools/task-state.ts p3/12` 没有计划问题。

## 验证方法

- 运行上列命令并记录结果；审阅 `git status`、`git diff` 与提交的文件列表。
- 对照 spec 与各 subtask 的完成证据逐项核对。

## 完成证据
