---
type: plan
status: active
phase: P2
task: "11"
subtask: "17"
updated: 2026-10-06
---

# 17 — 本地真实数据核对（Node）

**契约来源：** [spec](../spec.md) 的 AC-20（查看渲染的场景构建），以及验证策略的“实机与原版对照”。导入、全包判定、任务载入与耗时已拆到 [23](./23-local-real-data-import.md)（见 goal 执行记录）。
**依赖：** 09, 23。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 被忽略的本地脚本 `local/research/p2-11/`，在开发者机器的 Node 中运行，不打开浏览器：
  - 沿用 23 的脚本取得持有的完整资源包；
  - 用查看渲染与录制用的表面替身，为玩家、敌机、基地模型，三种效果的全部形状，全部图像、调色板、两个布局与全部字库各构建一次场景，都没有错误。
- 证据只记状态、计数与耗时，不含原版画面、文字、声音或字节。
- 脚本可以引用 `src/` 的生产模块与测试支持，但输出只留在 `local/`。

## 不包含

- 浏览器中的真实数据导入（19，由用户完成）；原版保真对照（P2-12）。

## 关键文件与契约

- 计划新增被忽略的 `local/research/p2-11/` 脚本。
- 复用：[import-job.ts](../../../../../src/workers/import-job.ts) 的 `createImportJob`、[import-host.ts](../../../../../src/workers/import-host.ts)、[import-job-owner.ts](../../../../../src/app/import/import-job-owner.ts)；参照 P2-04/06/07 的本地基准脚本做法（`local/research/p2-06/base-check.ts`）；02–04 的持有者与诊断；08、09 的查看渲染与 [render-surface.test-support.ts](../../../../../src/render/scene/render-surface.test-support.ts)。

## 验收标准

- [ ] AC-20（场景构建）：全部所列项的场景构建都没有错误。
- [ ] 证据只含状态、计数与耗时；仓库中没有本地输出。

## 验证方法

- 在本机运行脚本，记录命令、退出码与结果摘要。
- 不修改 `src/` 时不需要 simplify；若为通过核对修改了实现，回到相应子任务修正并记录。按 execute-goal 做 rubber-duck 审阅脚本与证据。

## 完成证据
