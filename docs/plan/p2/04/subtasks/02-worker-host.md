---
type: plan
status: active
phase: P2
task: "04"
subtask: "02"
updated: 2026-10-05
---

# 02 — Worker 宿主与错误转换

**契约来源：** [spec](../spec.md) 的 S-02，S-08 的错误转换与隐私部分；[消息协议](../spec.md#消息协议)的共同规则、[错误层与错误码](../spec.md#错误层与错误码)；AC-02。
**依赖：** 01。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **新增 `src/workers/import-host.ts`：**
  - **最小端点接口：** `postMessage(message, transfer)`、`addEventListener`（`message`、`messageerror`、`error`、`unhandledrejection`）与 `close()`。生产入口把 `self` 断言为它；Node 测试用假端点或 `MessagePort`。
  - **作业签名：** 作业接收文件快照与报告器（`progress`、`identified`、`group`），成功时返回 `usage`。
  - **入口函数：** 安装监听后发送一次 `ready`，然后运行一个作业。
- **握手与单次作业：**
  - 只接受第一条有效的 `start`。`start` 非法或出现 `messageerror` 时，发送 `failed` 并带 `invalid-request` 与对应位置；读不出作业 ID 时 `jobId` 为 null。
  - `start` 之后再收到任何消息，作业都以 `invalid-request` 失败。
- **顺序与终态：**
  - `sequence` 从 1 开始，逐条加 1；
  - `identified` 至多一次；`group` 须在 `identified` 之后，每组至多一次；
  - `finished` 带宿主实际发送过的组列表与作业返回的 `usage`；
  - 终态消息之后调用 `close()`，之后报告器的调用全部忽略，不再发送任何消息。
- **错误转换：**
  - `DiscReadError` 转为 `disc` 层，`SourceError` 转为 `source` 层，其余字段取自 `toData()`；
  - `ContentContractError` 转为 `content` 层：`location` 取 `path`，`limit` 为 null；
  - 以下情况都报 `internal-error@job`，原因是固定文本，不带异常文本：其他异常、非 Error 值、端点的 `unhandledrejection` 与 `error` 事件。
- **转移发送：** 发送组结果前，用 `readPayloadRecords` 读出 payload 视图，用 `payloadTransferList` 计算转移列表。非独占、互相别名或已转移的 payload 以 `content` 层对应的 code 使作业失败，该组不发送。
- **测试：** 新增 `src/workers/import-host.test.ts`：
  - 用记录消息与转移列表的假端点覆盖 AC-02；
  - 用 Node `MessageChannel` 证明转移后发送方的视图已失效。
- **文档：** 在[源码结构](../../../../engineering/source-structure.md)的“导入 Worker”一节记录宿主、端点接口与错误转换。

## 不包含

- 生产作业与 Worker 入口文件（[03](./03-import-job.md)）。
- 主线程对消息的接受规则（[04](./04-job-owner-lifecycle.md)、[05](./05-group-results.md)）。

## 关键文件与契约

- **新增：** `src/workers/import-host.ts`、`src/workers/import-host.test.ts`（尚不存在）。
- **复用：**
  - 01 的协议模块；
  - [disc-error.ts](../../../../../src/original-data/disc/disc-error.ts) 的 `DiscReadError`；
  - [source-error.ts](../../../../../src/original-data/source-error.ts) 的 `SourceError`；
  - [contract-validation.ts](../../../../../src/content/contract-validation.ts) 的 `ContentContractError`；
  - [payload.ts](../../../../../src/content/payload.ts) 与 [ownership.ts](../../../../../src/content/ownership.ts)。

## 验收标准

- [ ] AC-02 握手：恰好一次 `ready`；只接受一条有效 `start`；非法 `start` 与 `messageerror` 报 `invalid-request`，位置符合 spec，读不出作业 ID 时 `jobId` 为 null；`start` 之后的消息使作业以 `invalid-request` 失败。
- [ ] AC-02 错误转换：两种上游错误转为对应层，其余字段与 `toData()` 相等；`ContentContractError` 转为 `content` 层；同步异常、非 Error 值与异步的未处理拒绝都报固定原因的 `internal-error`，消息中不含异常文本标记。
- [ ] AC-02 终态与转移：终态后 `close()` 被调用，之后没有消息，`sequence` 连续；发送组结果后发送方视图失效；非独占、别名与已转移的 payload 报 `content` 层的 code，该组未发送。
- [ ] `pnpm exec vitest run src/workers`、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- Node 测试：用假端点断言消息序列与转移列表；用 `MessageChannel` 断言转移后的失效与接收方字节。
- 不适用 browser-testing；真实 Worker 中的宿主由 [09](./09-browser-worker-paths.md)、[10](./10-browser-lifecycle-failures.md) 验证。

## 完成证据
