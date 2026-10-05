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

- [ ] AC-09：可信点击与 rAF 都在 `busy` 进度之后、取消之前发生；取消同步生效，恰好一次终止，监听为 0，之后无通知；重试使用新的 Worker 与作业 ID 并成功结束，旧状态未泄入新快照。
- [ ] AC-10：
  - 缺失入口与模块顶层抛错都报 `worker-start-failed`，且从未发送 `start`；
  - 异步未捕获错误报 `worker-failed`；作业抛错报不含宿主文本的 `internal-error`；
  - 作业进行中释放后，Worker 已终止、监听已移除，之后无通知。
- [ ] AC-10 隐私：快照、错误与 console 不含标记；预期诊断逐项记录，其他浏览器错误仍为零。
- [ ] `pnpm test:e2e import-worker.spec.ts --project=development` 通过；完整的 `pnpm test:e2e` 通过；`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- Playwright 开发项目：用页面内事件日志记录进度、点击、rAF、取消与通知的先后顺序；用探针快照观测 Worker 的创建、消息、终止与监听。
- 完成前运行完整的 `pnpm test:e2e`，确认既有浏览器回归不受探针与 fixture 改动影响。

## 完成证据
