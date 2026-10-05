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
  - **最小端点接口：** `postMessage(message, transfer)`、`addEventListener`（`message`、`messageerror`、`unhandledrejection`）与 `close()`。生产入口把 `self` 断言为它；Node 测试用假端点或 `MessagePort`。
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
  - 以下情况都报 `internal-error@job`，原因是固定文本，不带异常文本：其他异常、非 Error 值、端点的 `unhandledrejection` 事件（宿主取消其默认报告）。
  - 宿主不监听 `error`：`ready` 之后的未捕获错误照常传到主线程，由持有者报 `worker-failed`（spec 的错误码表与 AC-10）。
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

- [x] AC-02 握手：恰好一次 `ready`；只接受一条有效 `start`；非法 `start` 与 `messageerror` 报 `invalid-request`，位置符合 spec，读不出作业 ID 时 `jobId` 为 null；`start` 之后的消息使作业以 `invalid-request` 失败。
- [x] AC-02 错误转换：两种上游错误转为对应层，其余字段与 `toData()` 相等；`ContentContractError` 转为 `content` 层；同步异常、非 Error 值与异步的未处理拒绝都报固定原因的 `internal-error`，消息中不含异常文本标记。
- [x] AC-02 终态与转移：终态后 `close()` 被调用，之后没有消息，`sequence` 连续；发送组结果后发送方视图失效；非独占、别名与已转移的 payload 报 `content` 层的 code，该组未发送。
- [x] `pnpm exec vitest run src/workers`、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- Node 测试：用假端点断言消息序列与转移列表；用 `MessageChannel` 断言转移后的失效与接收方字节。
- 不适用 browser-testing；真实 Worker 中的宿主由 [09](./09-browser-worker-paths.md)、[10](./10-browser-lifecycle-failures.md) 验证。

## 完成证据

- **实现：** [import-host.ts](../../../../../src/workers/import-host.ts) 的 `runImportHost(endpoint, job)`。
  - **端点：** `ImportHostEndpoint` 只监听 `message`、`messageerror` 与 `unhandledrejection`，不监听 `error`。原计划写宿主也处理 `error`，与 spec 的错误码表和 AC-10 冲突，已按 spec 修订工作范围并记入 [goal 执行记录](../goal.md#执行记录)。
  - **作业：** 收到冻结的报告器（不是宿主本身）。用量经 `readBudgetRecord` 读取后才发送终态消息。
  - **顺序：** 未识别就结束的作业也以 `internal-error` 失败，保证 `finished` 在 `identified` 之后。
  - **协议：** [import-protocol.ts](../../../../../src/workers/import-protocol.ts) 的两个读取结果类型收窄为 `ImportLayerError<'protocol-error'>` 与 `ImportLayerError<'invalid-request'>`，使宿主能把 `start` 的拒绝原样作为 Worker 错误发送。
- **测试：** [import-host.test.ts](../../../../../src/workers/import-host.test.ts) 共 35 项，`pnpm exec vitest run src/workers` 共 218 项通过。假端点记录监听、发送、转移列表与 `close`，并用协议读取函数核对 `ready` 之后的每条消息。
  - **握手：** 监听全部安装后才发送唯一的 `ready`。只运行第一条有效 `start` 的作业，文件快照保留原 Blob 引用。
    - 5 种非法 `start` 报 `invalid-request`，位置分别为 `request`、`request.type`、`request.protocol`、`request.jobId`、`request.files[1].name`；能读出时带作业 ID，否则为 null。作业从未运行，诊断不含 `PRIVATE-MARKER`。
    - `messageerror` 报 `invalid-request@request`，作业 ID 为 null。
    - 运行中再收到 `start`、其他消息或 `messageerror`，作业以 `invalid-request@request` 失败，带当前作业 ID；作业之后的报告与结束都被忽略。
  - **顺序与终态：** 进度、进度、识别、两组、结束的顺序号为 1–6；`finished.groups` 为 `['audio', 'models']`；身份只含版本 ID 与指纹（多余字段与标记被丢弃）；终态消息之后恰好一次 `close`，之后的报告、`start`、`messageerror` 与 `unhandledrejection` 都被忽略。以下情况都报 `internal-error@job`：第二次识别、识别后的识别进度、识别前的组、重复的组、未识别就结束。克隆失败的发送把 `DataCloneError` 交给作业，且不消耗顺序号。
  - **错误转换：** `DiscReadError`（带限值）与 `SourceError` 转为对应层，其余字段等于 `toData()`；`ContentContractError` 转为 `content` 层，`location` 取 `path`。以下情况都报固定原因的 `internal-error@job`，消息不含标记：其他 Error、名为 `DiscReadError` 的普通 Error、字符串、形似错误的 record、同步抛错的作业。`unhandledrejection` 被取消默认报告，并报 `internal-error`；不完整的用量报 `content/missing-budget-dimension@usage.assets`。
  - **转移：** 假端点上，组的转移列表按 payload 顺序等于各 payload 的 buffer。以下情况都报 `content` 层，组未发送，也没有转移：部分视图（`payload-not-exclusive@groups.audio.payloads[0]`）、共享 buffer（`payload-aliased@…[1]`）、已转移视图（`payload-detached@…[0].bytes`）、乱序（`payload-order@…[1]`）。
  - **`MessageChannel`：** 真实端口把 `start` 的 Blob 克隆进宿主，作业读出原内容。`report.group` 返回后，发送方的每个 payload 视图 `byteLength` 为 0。接收方依次收到 `ready`、`identified`、`group`、`finished`，全部通过协议读取，payload 字节与发送前的副本相等。
- **变异检查：** 以下 20 项变异都至少使 1 项测试失败：
  - 去掉 `preventDefault`；
  - 改动任一层的错误转换；
  - 去掉顺序号递增，或在发送前递增；
  - 去掉以下任一检查：第二条请求、重复识别、识别前的组、重复的组、识别后的识别进度、结束前的识别；
  - 去掉 `close`、转移列表、身份复制、用量读取、终态后的守卫，或可读的作业 ID；
  - 清空 `finished.groups`。
- **检查：** `pnpm check`（89 个文件、2576 项测试、构建）、`pnpm check:original`（passed）与文档链接检查都通过。
- **Rubber-duck：**
  - **阻塞问题：** 作业不识别就正常结束时，宿主仍会发送 `finished`，违反“`finished` 在 `identified` 之后”。已修复并加回归测试。
  - **计划修订：** 审查确认把 `error` 留给主线程（`worker-failed`）是正确的，宿主同时处理会形成竞争的失败路径。
- **Simplify：**
  - **已采纳：** 去掉测试中未用的 `reject`，删去 3 个只重复解析器或兜底分支的测试行。
  - **未采纳：**
    - 其余表行：各自验证宿主转发的作业 ID 或位置，或证明分类用 `instanceof` 而不是名称与形状；
    - 文档细节：与同文档粒度一致；
    - 每次进度的闭包与空数组、`[...transfer]` 复制：相对每次异步 Blob 读取可忽略，去掉后还需在端点处做可变数组转换。
- **文档影响：** [源码结构](../../../../engineering/source-structure.md)的目录树加入 `import-host.ts`，“导入 Worker”一节新增宿主条目（端点、握手、作业与顺序、转移、终态、错误转换）。工程约定没有需要更新的规则或命令；STATUS 不变。

