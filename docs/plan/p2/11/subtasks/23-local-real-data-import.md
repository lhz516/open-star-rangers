---
type: plan
status: active
phase: P2
task: "11"
subtask: "23"
updated: 2026-10-06
---

# 23 — 本地真实数据的导入与持有核对（Node）

**契约来源：** [spec](../spec.md) 的 AC-20（识别、四组完整、全包 `complete`、任务可载入 Core、全包校验耗时），以及验证策略的“实机与原版对照”。场景构建归 [17](./17-local-real-data-check.md)。
**依赖：** 03, 04。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 被忽略的本地脚本 `local/research/p2-11/`，在开发者机器的 Node 中运行，不打开浏览器：
  - 用与 Worker 相同的作业模块（生产 `createImportJob` 与宿主），经作业持有者处理 `local/StarRang/cd/` 的基准镜像；
  - 把结果交给应用的资源持有者，缓存用伪造实现，预期包配置为生产配置；
  - 断言：识别出版本，四组都完整，全包 `complete`，伪造缓存收到一次以包预算的提交，任务可载入 Core；
  - 记录作业与全包校验的耗时。
- 证据只记状态、计数与耗时，不含原版画面、文字、声音或字节。
- 脚本可以引用 `src/` 的生产模块与测试支持，但输出只留在 `local/`。

## 不包含

- 查看渲染的场景构建（17）；浏览器中的真实数据导入（19，由用户完成）；原版保真对照（P2-12）。

## 关键文件与契约

- 计划新增被忽略的 `local/research/p2-11/` 脚本。
- 复用：[import-job.ts](../../../../../src/workers/import-job.ts) 的 `createImportJob`、[import-host.ts](../../../../../src/workers/import-host.ts)、[import-job-owner.ts](../../../../../src/app/import/import-job-owner.ts)、02–04 的持有者与诊断、01 的生产包配置；参照 P2-06 的本地基准脚本做法。

## 验收标准

- [ ] AC-20（导入部分）：识别出版本，四组完整，全包 `complete`，以包预算提交，任务可载入 Core；记录了作业与全包校验的耗时。
- [ ] 证据只含状态、计数与耗时；仓库中没有本地输出。

## 验证方法

- 在本机运行脚本，记录命令、退出码与结果摘要。
- 不修改 `src/` 时不需要 simplify；若为通过核对修改了实现，记录并修正。按 execute-goal 做 rubber-duck 审阅脚本与证据。

## 完成证据
