---
type: plan
status: active
phase: P2
task: "12"
subtask: "09"
updated: 2026-10-07
---

# 09 — 失败矩阵：Worker 故障、取消与迟到结果（F-11、F-12）

**契约来源：** [spec](../spec.md) 的 S-04、S-05（I-7）、[失败矩阵](../spec.md#失败矩阵) F-11、F-12 与[失败不变量](../spec.md#失败不变量)；AC-08 的开发部分、AC-10。
**依赖：** 01, 02, 03, 04, 05。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **计划新增 `e2e/failure-worker-cancel.development.spec.ts`：**
  - **F-11：** 入口缺失、顶层抛错、启动后出错、作业抛错，分别显示 `worker-start-failed`、`worker-failed`、`internal-error`，与 P2-04 的对应一致；Worker 都已终止。精确诊断沿用 [browser-test.ts](../../../../../e2e/support/browser-test.ts) 的 `expectDiagnostic`。
  - **F-12：** 用 05 的时序场景在五个阶段各取消一次，取消同步终止且不交出部分结果；连续进度时取消并重试，新作业不受旧作业影响；运行中返回菜单；新导入先于挂起的恢复完成，迟到的恢复结果被丢弃；迟到的提交与列出结果、所有者释放后才到达的结果都不覆盖新包的代际与缓存状态。
  - **I-7：** 至少一行 F-11（启动后出错）与一行 F-12 用 03 的探针证明活动窗口内的可信输入与帧顺序；立即失败的路径不要求失败前插入点击。
  - **I-5：** import 与取消两类各至少一行。
  - 全部用例启用 02 的审计并以零意外违规结束。
- **受控端口与回调（Node，按需补充）：** 已终止 Worker 的旧回调隔离以受控端口回放证明，真实 Worker 只证明终止。先引用既有测试（[import-job-owner.test.ts](../../../../../src/app/import/import-job-owner.test.ts) 的重试与迟到消息、[resource-holder-cache.test.ts](../../../../../src/app/resources/resource-holder-cache.test.ts) 的迟到恢复、提交、列出与释放），发现缺口时在这两个文件中补充。

## 不包含

- 生产项目的 404 与 HTML 回退（07）；输入与内容失败（08）；存储与生命周期（10）。
- 修改生产代码；发现缺陷时按 spec 技术决定 15 回到责任任务。

## 关键文件与契约

- [import-job-owner.ts](../../../../../src/app/import/import-job-owner.ts) 的取消与迟到消息规则；[resource-holder.ts](../../../../../src/app/resources/resource-holder.ts) 的代际与操作结果丢弃。
- 参照 [import-worker.spec.ts](../../../../../e2e/import-worker.spec.ts) 的故障与取消用例、[import-page.spec.ts](../../../../../e2e/import-page.spec.ts) 的 3 轮取消与重入。

## 写入范围

- `e2e/failure-worker-cancel.development.spec.ts`：F-11、F-12 的浏览器用例。
- `src/app/import/import-job-owner.test.ts`：按需补充的受控端口回放。
- `src/app/resources/resource-holder-cache.test.ts`：按需补充的迟到结果。

## 验收标准

- [ ] AC-08（开发）：四种 Worker 故障的 code 正确且 Worker 已终止；五个阶段的取消不交出结果并终止；连续消息与旧作业回调不污染重试；迟到的恢复、提交、列出与释放后结果不覆盖新状态。
- [ ] I-7 在一行 F-11 与一行 F-12 中成立；I-5 在 import 与取消两类各有一行。
- [ ] AC-10（本用例）：审计零意外违规。
- [ ] `pnpm test -- src/app`、`pnpm typecheck`、`pnpm lint` 与 `pnpm exec playwright test e2e/failure-worker-cancel --project=development` 通过。

## 验证方法

- 按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md)：合成数据、隔离 context。
- 不涉及原版对照。

## 完成证据
