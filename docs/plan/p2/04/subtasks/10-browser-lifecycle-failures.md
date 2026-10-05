---
type: plan
status: active
phase: P2
task: "04"
subtask: "10"
updated: 2026-10-05
---

# 10 — 浏览器：响应、取消、重试、失败与释放

**契约来源：** [spec](../spec.md) 的 S-05、S-07、S-08，S-10 的浏览器部分；[行为与边界](../spec.md#行为与边界)；技术决定 1、2；AC-09、AC-10。
**依赖：** 09。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **场景：** 在 `src/workers/import-worker.test-support.ts` 中增加以下场景：
  - `busy`：先发送一条进度，宣告进入同步忙循环；该循环只能被终止结束；
  - `job-throws`：作业抛出带 `MARKER` 文本的异常；
  - `late-error`：`ready` 之后在异步回调中抛出未捕获错误；
  - `top-level-throw`：模块求值时抛错。
- **AC-09：**
  - 收到 `busy` 的进度之后、取消之前，页面上的可信点击得到处理，且至少交付一次 rAF 回调；证据为页面内记录的事件顺序；
  - 随后取消：快照同步变为 `cancelled`，探针显示恰好一次终止、Worker 监听为 0，之后没有通知；
  - 再用 `synthetic` 场景开始新作业：新的 Worker 与作业 ID，成功结束；旧作业的状态从未出现在新快照中。
- **AC-10：**
  - 入口 URL 不存在，或 `top-level-throw`，都报 `worker-start-failed`，且探针显示从未向该 Worker 发送消息；
  - `late-error` 报 `worker-failed`；`job-throws` 报 `internal-error`，不含异常文本；
  - 作业进行中（`busy`）释放持有者：Worker 被终止、监听被移除，之后没有通知。
- **预期诊断：**
  - 扩展 [browser-test.ts](../../../../../e2e/support/browser-test.ts)，让单个用例声明必须出现的预期诊断（例如缺失入口的 HTTP 404、Worker 报告的错误），逐项记录到 annotation；
  - 只有完全匹配的项被放行；其他错误仍使用例失败；预期但未出现的诊断也使用例失败。
- **隐私：** 快照、错误 DTO 与页面 console 都不含文件名标记与异常文本标记。
- **方法与文档：**
  - 按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md) 准备合成数据与清理；
  - 在[工程约定](../../../../engineering/README.md#本地浏览器-runner)中记录预期诊断的声明方式。

## 不包含

- 生产预览、真实 StrictMode 与 Fast Refresh（P2-11）；网络请求审计（P2-12）。
- 用耗时阈值判断响应性：spec 规定以事件顺序为证据。

## 关键文件与契约

- **修改：** 09 新增的 `src/workers/import-worker.test-support.ts` 与 `e2e/import-worker.spec.ts`，以及 [browser-test.ts](../../../../../e2e/support/browser-test.ts) 和[工程约定](../../../../engineering/README.md)。
- **复用：** 09 的 Worker 探针、06 的浏览器工厂、04 与 05 的持有者。

## 验收标准

- [x] AC-09：可信点击与 rAF 都在 `busy` 进度之后、取消之前发生；取消同步生效，恰好一次终止，监听为 0，之后无通知；重试使用新的 Worker 与作业 ID 并成功结束，旧状态未泄入新快照。
- [x] AC-10：
  - 缺失入口与模块顶层抛错都报 `worker-start-failed`，且从未发送 `start`；
  - 异步未捕获错误报 `worker-failed`；作业抛错报不含宿主文本的 `internal-error`；
  - 作业进行中释放后，Worker 已终止、监听已移除，之后无通知。
- [x] AC-10 隐私：快照、错误与 console 不含标记；预期诊断逐项记录，其他浏览器错误仍为零。
- [x] `pnpm test:e2e import-worker.spec.ts --project=development` 通过；完整的 `pnpm test:e2e` 通过；`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- Playwright 开发项目：用页面内事件日志记录进度、点击、rAF、取消与通知的先后顺序；用探针快照观测 Worker 的创建、消息、终止与监听。
- 完成前运行完整的 `pnpm test:e2e`，确认既有浏览器回归不受探针与 fixture 改动影响。

## 完成证据

浏览器环境：已安装的 Chrome（Playwright 1.63，channel `chrome`，headless）、macOS、视口 1280×800、开发服务器 `http://127.0.0.1:4173`。每个用例使用隔离 context，文件由页面内代码生成，文件名含 `PRIVATE-MARKER-7f3a`；失败场景抛出的文本也含该标记。

| 验收项 | 设置与操作 | 预期 | 观察到的证据 | 结果 |
|---|---|---|---|---|
| AC-09 响应与取消 | 页面内放一个按钮并启动 rAF 记录；用 `busy` 场景开始作业；收到它的进度后，Playwright 点击按钮，等待之后的一帧，再在页面内调用 `cancel()` | 进度之后、取消之前，有可信点击与 rAF；取消同步生效，恰好一次终止，监听为 0，之后无通知 | 事件日志的顺序：`running:identify-source` 快照，然后 `click`（`isTrusted` 为 true），至少一帧，然后取消。`cancel()` 返回 true，返回时快照已是 `cancelled`；`cancelled` 快照紧挨在取消记录之前，之后只有帧。探针：`busy` Worker 发送 1 次，终止 1 次，3 个监听都已移除 | passed |
| AC-09 重试 | 同一持有者换用 `synthetic` 场景与生产尺寸文件再次开始 | 新的 Worker 与作业 ID，成功结束，旧状态不泄入 | 重试后第一个快照为 `{ status: 'starting', jobId: 2 }`，之后全部为作业 2，并以 `finished` 结束。探针依次记录 `busy` 与 `synthetic` 两个 Worker，各发送 1 次、终止 1 次 | passed |
| AC-10 启动失败 | 入口 URL 不存在（`/src/workers/missing-import-worker.ts`）；`top-level-throw` 场景 | 都报 `worker-start-failed`，且从未发送 `start` | 两者的快照都为 `failed`，带 `import/worker-start-failed@worker` 与固定原因。探针的入口分别为缺失路径（名称为空）与测试入口（名称 `top-level-throw`），发送 0 次，终止 1 次，监听都已移除。开发服务器对缺失的 `.ts` 返回 SPA 回退的 HTML（200），所以没有 404 与 console 错误 | passed |
| AC-10 运行失败 | `late-error`；`job-throws` | 前者报 `worker-failed`；后者报 `internal-error`，不含异常文本 | `late-error`：`failed`，阶段 `identify-source`，`import/worker-failed@worker`。`job-throws`：`failed`，`import/internal-error@job`，原因为固定文本。两者都发送 1 次、终止 1 次 | passed |
| AC-10 释放 | `busy` 作业进行中调用 `dispose()` | Worker 被终止、监听被移除，之后无通知 | 释放记录之后只有帧，没有快照。探针：终止 1 次，监听都已移除。之后 `start` 返回 `disposed` | passed |
| AC-10 隐私与诊断 | 每个用例记录页面与 Worker 的全部级别 console，以及全部快照 | 快照、错误与 console 不含标记；预期诊断逐项记录，其他浏览器错误为零 | 所有用例的快照 JSON 与 console 都不含标记。这些场景在本环境中都不产生浏览器诊断，所以本 spec 未声明任何诊断；声明机制在 probe-contract 中验证（见下）。浏览器错误收集对全部用例为零 | passed |

- **实现：**
  - [import-worker.test-support.ts](../../../../../src/workers/import-worker.test-support.ts) 新增 `busy`、`job-throws`、`late-error`、`top-level-throw` 场景，抛出的文本使用私有常量 `EXCEPTION_MARKER`（含文件名标记）。
  - [browser-test.ts](../../../../../e2e/support/browser-test.ts)：
    - 也收集页面所建 Worker 的 console error（Playwright 把它报告在 Worker 上）；
    - 新增 `settleDiagnostics` 与 `expectDiagnostic`：声明的诊断按完全相同的文本、按条数匹配，记录为 `expected-diagnostic` annotation；未声明的错误与声明了却未出现的诊断都使用例失败。
  - [import-worker.spec.ts](../../../../../e2e/import-worker.spec.ts) 改为页面内 harness（`window.osrImport`），覆盖 09 的两项与本子任务的 6 项。
  - [probe-contract.spec.ts](../../../../../e2e/probe-contract.spec.ts) 新增 Worker console 收集与诊断判定的契约用例；一条声明的 console 诊断被放行并记录为 annotation。
- **浏览器变异：** 以下 5 项变异都使本 spec 失败：
  - 持有者把 `ready` 之后的错误也报为 `worker-start-failed`；
  - 取消时不终止 Worker；
  - 释放时不终止 Worker；
  - 宿主把异常文本放进原因；
  - 去掉缺失入口分支，此时缺失用例实际载入了测试入口。

  去掉适配对 Worker `error` 事件的 `preventDefault()` 在本环境中没有可观察的差异（Playwright 看不到相应的页面或 Worker 诊断），由 06 的 Node 单元测试覆盖。
- **检查：**
  - `pnpm test:e2e import-worker.spec.ts --project=development` 通过，共 8 项。
  - 完整的 `pnpm test:e2e` 通过，3 个项目共 33 项。它确认新的 Worker console 收集与诊断判定没有破坏既有 spec。
  - `pnpm check`（93 个文件、2669 项测试、构建，含 typecheck 与 lint）与 `pnpm check:original`（passed）都通过。
- **Rubber-duck：**
  - **阻塞问题 1：** 两种启动失败可能落到同一机制上而不被发现，例如去掉缺失入口分支后，缺失用例也会因未知场景在顶层抛错。已改为逐项断言完整的探针记录（入口、名称、类型、发送与终止次数），变异检查确认能发现。
  - **阻塞问题 2：** 完整的 e2e、typecheck 与 lint 尚未记录。现已运行并记录在上方。
  - **审查确认：**
    - AC-09 的顺序证据成立，“之后无通知”的证据结合了终止与监听移除；
    - 重试与释放的证据充分；
    - Worker console 在 Worker 创建之初就被收集；
    - `settleDiagnostics` 的按条数精确匹配正确。
- **Simplify：**
  - **已采纳：** `busy` 用小光盘；`EXCEPTION_MARKER` 改为测试入口的私有常量；源码结构中重复的场景列表改为链接到工程约定。
  - **未采纳：**
    - 用更小的合成作业做重试：完整的 `synthetic` 流程是更强的重试证明，只多约 1 s；
    - 改用现有的帧观测辅助：事件日志中的帧正是 AC-09 要求的顺序证据；
    - 把 console 记录并入错误收集器：隐私检查需要全部级别，不只是错误。
- **清理：** 服务器与浏览器都由 Playwright runner 自行启动和关闭；两个临时诊断探针 spec 运行后已删除；报告留在被忽略的目录。
- **文档影响：**
  - [工程约定](../../../../engineering/README.md#本地浏览器-runner)新增失败与生命周期场景、开发服务器的 SPA 回退，以及“浏览器错误收集”一条（Worker console 与预期诊断的声明方式）。
  - [源码结构](../../../../engineering/source-structure.md)的测试入口条目链接到工程约定。
  - STATUS 不变。

