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
- `src/workers/import-scenarios.test-support.ts`：按需补充由测试释放的开始后错误场景（I-7）。
- `src/app/import/import-job-owner.test.ts`：按需补充的受控端口回放。
- `src/app/resources/resource-holder-cache.test.ts`：按需补充的迟到结果。

## 验收标准

- [x] AC-08（开发）：四种 Worker 故障的 code 正确且 Worker 已终止；五个阶段的取消不交出结果并终止；连续消息与旧作业回调不污染重试；迟到的恢复、提交、列出与释放后结果不覆盖新状态。
- [x] I-7 在一行 F-11 与一行 F-12 中成立；I-5 在 import 与取消两类各有一行。
- [x] AC-10（本用例）：审计零意外违规。
- [x] `pnpm test -- src/app`、`pnpm typecheck`、`pnpm lint` 与 `pnpm exec playwright test e2e/failure-worker-cancel --project=development` 通过。

## 验证方法

- 按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md)：合成数据、隔离 context。
- 不涉及原版对照。

## 完成证据

- **浏览器用例**（[failure-worker-cancel.development.spec.ts](../../../../../e2e/failure-worker-cancel.development.spec.ts)，开发项目 14 例）：全部经 02 的审计（文件名标记为金丝雀）、04 的资源平衡（含音频探针，菜单基线对比）与 I-6 检查（页面文本与标记、console、平衡快照均不含文件名或异常标记）。每例以注解记录前置状态与预期终态。
  - **F-11（5 例）：** `missing`、`top-level-throw` → `import/worker-start-failed@worker`（Worker 未发 `ready`，未收 `start`）；`late-error`、`held-late-error` → `worker-failed@worker`（`ready`、`progress:identify-source` 之后）；`job-throws` → `internal-error@job`（`ready`、`failed`）。页面类别、固定句子与 Layer/Code/Location/Reason 明细事先固定，与 P2-04 的 [import-worker.spec.ts](../../../../../e2e/import-worker.spec.ts) 对应一致。每例新 Worker 恰终止一次，消息均早于终止（I-3）。前置为按生产档案预置并恢复的 `models` 包；之后菜单状态（含恢复耗时文本）与存储记录摘要不变（I-2），菜单基线平衡（I-3、I-4）。I-5（import 类，五例均做）：查看同一身份与像素，再重试同一故障，结果相同。
  - **缺失入口：** 开发服务器的 SPA 回退以 200 `text/html` 应答（[工程约定](../../../../engineering/README.md)已记录），浏览器拒绝将其作为模块 Worker 脚本。审计单独声明这一无数据 GET 并预期 200，不放宽产品规则。
  - **I-7（F-11）：** 新增 `held-late-error` 场景（[import-scenarios.test-support.ts](../../../../../src/workers/import-scenarios.test-support.ts)）：发出进度后，等测试经 `BroadcastChannel` 释放才在作业外抛错，协议不变。`InputOrder` 记录：`running:identify-source` 之后，可信探针点击在一次分派内处理（Worker 2 条消息、未终止），随后只有帧，直到 `status:import:failed`；其后至少 10 帧，无其他条目。
  - **F-12 五阶段（5 例）：** `hold-<阶段>` 的前置为按切片档案预置并恢复的合成包。Worker 消息止于该阶段开始（非识别阶段另有 `identified` 与前序阶段进度）；探针点击与取消点击时的消息数相同，即窗口内没有新消息。可信“Cancel import”的同一分派内先出现 `status:import:cancelled`，处理结束时 Worker 已终止 1 次（I-7、同步终止）；其后只有帧。页面显示“No partial result was kept”，无状态、组或部分包；菜单的包与存储不变。
  - **连续进度：** `progress-stream` 中，探针点击后先等待消息数增长再取消（I-7 同上）。重试为作业 2，在新 Worker 中运行；旧 Worker 取消后消息数不再增长。运行中返回菜单会终止重试的 Worker。I-5（取消类）：同一身份与像素；新导入页没有旧结果，可启动新作业（新所有者的作业 1）。三个 Worker 各终止一次。
  - **迟到恢复：** `hold=restore`：恢复已结算、结果等待期间，导入切片盘并提交保存。释放后，菜单仍显示 `saved in`（而非 `restored`），无恢复失败；查看器身份为导入包的 manifest，存储记录不变。
  - **迟到提交：** `cache=write-failed&hold=commit`：第一包的提交失败结果等待释放。测试自有连接上的只读事务（只用属性回调，不计登记）使第二包提交的 readwrite 事务排队。单独释放旧失败后，第二包仍为 Saving，无保存失败；解除阻塞后，第二包提交完成，释放后显示 saved，存储中恰为该包。
  - **迟到列出与释放后结果：** `hold=list`：StrictMode 释放的旧持有者与当前持有者各有一次空列出等待释放。导入保存后释放：旧持有者的结果被忽略；当前持有者重新列出（又等待 1 次），包仍为 saved，没有 `not-found`。回菜单再次列出后不变。
  - **变异核查（临时修改，已还原，未提交）：** 分别去掉持有者提交、恢复、列出结果的代际检查，迟到提交、恢复、列出三例分别失败；去掉作业所有者的 `this.#job === job` 判断，所有者测试失败。
- **受控端口（Node）：** [import-job-owner.test.ts](../../../../../src/app/import/import-job-owner.test.ts) 新增五阶段取消回放：每阶段取消均同步，订阅者收到通知时 Worker 已终止；convert-models 已收到完整组时也不交出结果；之后回放进度、组、`finished`、`failed`、error、messageError，快照均不变。既有重试用例扩展为旧 Worker 连续进度与新作业消息交错，快照只来自作业 2。迟到恢复、提交、列出及释放后结果沿用 [resource-holder-cache.test.ts](../../../../../src/app/resources/resource-holder-cache.test.ts) `generations` 中的既有用例，核对后无缺口，未修改。
- **检查：**
  - `pnpm exec playwright test e2e/failure-worker-cancel --project=development`：14 例通过（约 1.5 min）；与 import-worker、failure-input-content、responsiveness-busy-worker 一起共 51 例通过（端口 5127/5128）。
  - `pnpm check`：类型检查与 lint 通过；Vitest 首次运行时机器负载约 21，两个无关用例超时（engineering-boundaries、image-payload）。单独重跑与整体重跑均通过（154 个文件、4,594 项），构建通过，`dist/` 中检索不到新增场景标记。
- **rubber-duck：** 无阻塞问题，三条非阻塞意见均已处理：迟到提交改为单独释放旧结果（同时发现并修正了第二次导入时读到上一作业结果的竞态）；连续进度在两次点击之间等待消息增长；迟到恢复与列出在导入页补做隐私检查。
- **simplify：** 去掉 `runFault` 未使用的返回值和五阶段用例中不必要的查看器访问，合并两个重试用例。`cacheKeyOf` 需要完整的 ContentIdentity，因此保留本地 key 构造。共享的探针安全读取辅助属 `e2e/support`，不在本范围内。
- **文档影响：** 工程约定已记录缺失入口的 HTML 回退。`held-late-error` 的释放方式、Playwright 主世界辅助会安装被资源平衡计入的 window 监听，以及用只读事务延后提交的方法，建议由 25 写入工程约定。本子任务范围内无须更新其他文档。
