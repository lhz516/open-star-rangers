---
type: plan
status: active
phase: P2
task: "04"
subtask: "01"
updated: 2026-10-05
---

# 01 — 消息协议与错误 DTO

**契约来源：** [spec](../spec.md) 的 S-01，S-08 的 DTO 部分；[消息协议](../spec.md#消息协议)、[错误层与错误码](../spec.md#错误层与错误码)；AC-01。
**依赖：** 无。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **新增 `src/workers/import-protocol.ts`：**
  - **常量：** `IMPORT_PROTOCOL_VERSION`（1）、阶段集合（本任务只有 `identify-source`）、`import` 层的 6 个 code、4 个错误层。
  - **类型：** 7 种消息、`ImportErrorData`（`{ layer, code, location, reason, limit }`）、来源身份 `{ versionId, sourceFingerprint }`。
- **读取函数：**
  - 一个读取 Worker 发往主线程的消息，位置以 `message` 为根；
  - 一个读取主线程发往 Worker 的 `start`，位置以 `request` 为根。

  规则如下：
  - 复用 [contract-validation.ts](../../../../../src/content/contract-validation.ts) 的严格 plain-data 读取：拒绝未知与缺少的字段、accessor 与类实例；
  - 返回冻结的副本；
  - 失败给出 `{ code, location }` 诊断（`protocol-error@message…` 或 `invalid-request@request…`），不回显值。
- **字段规则，按 spec 的消息表：**
  - `jobId` 与 `sequence` 为正安全整数；`failed.jobId` 可为 null；
  - `files` 为 1–4 项 `{ name, blob }`：`name` 为 1–255 个 UTF-16 码元，`blob` 为 `Blob`；
  - `readBytes` 为非负安全整数，阶段属封闭集合；
  - `versionId` 为至多 64 字符的小写 token；`sourceFingerprint` 匹配 `^source:sha256:[0-9a-f]{64}$`；
  - `group` 属 `RESOURCE_GROUPS`；
  - `finished.groups` 为不重复的资源组列表，`usage` 用 `readBudgetRecord` 读取。
- **`group` 消息只读外层：**
  - `input` 恰好含 `manifest`、`payloads`、`sources` 三个字段；
  - `sources` 是带字符串 `sourceFingerprint` 的 record；
  - 其余由持有者交给 `validateGroup`，见 [05](./05-group-results.md)。读取函数不深拷贝 payload。
- **错误 DTO 规则：**
  - `code` 为至多 64 字符的小写短横线 token；
  - `location` 与 `reason` 各为 1–512 个可打印 ASCII 字符；
  - `limit` 为 null 或 `{ name, limit, observed }`；
  - `import` 层的 code 属封闭集合，且 Worker 报告的 `failed` 只接受其中的 `invalid-request` 与 `internal-error`。
- **依赖：** 本模块只导入 `src/content/`，不导入 `original-data`。
- **测试：** 新增 `src/workers/import-protocol.test.ts`，按 AC-01 表驱动。
  - 已知 code 的语法核对用以 `DiscReadErrorCode | BudgetShapeCode`、`SourceErrorCode`、`ContentContractErrorCode`、`DiscLimitName | SourceLimitName` 为键的 `Record<…, true>` 列出全部值，由类型检查保证无遗漏。
  - 测试文件可以从 `original-data` 与 `content` 导入类型。
- **文档：** 在[源码结构](../../../../engineering/source-structure.md)中把 `workers/` 从计划模块改为已实现，新增“导入 Worker”一节，先记录协议模块。

## 不包含

- 宿主、作业与持有者的行为（[02](./02-worker-host.md)、[03](./03-import-job.md)、[04](./04-job-owner-lifecycle.md)）。
- 组内容的验证与来源绑定（[05](./05-group-results.md)）。
- lint 与依赖图规则（[08](./08-boundaries.md)）。

## 关键文件与契约

- **新增：** `src/workers/import-protocol.ts`、`src/workers/import-protocol.test.ts`（尚不存在）。
- **复用：**
  - [contract-validation.ts](../../../../../src/content/contract-validation.ts)；
  - [asset-contract.ts](../../../../../src/content/asset-contract.ts) 的 `RESOURCE_GROUPS`；
  - [budget.ts](../../../../../src/content/budget.ts) 的 `readBudgetRecord`。
- **测试只读的类型：** [disc-error.ts](../../../../../src/original-data/disc/disc-error.ts)、[source-error.ts](../../../../../src/original-data/source-error.ts)。

## 验收标准

- [x] AC-01 正向：两个方向的每种消息都有合法样本通过，结果冻结；`failed.jobId` 为 null 的样本通过读取（是否接受由持有者判定）。
- [x] AC-01 负向：spec 列出的每一项都以稳定的 code 与路径拒绝，诊断不含被拒绝的值（用标记字符串断言）。
- [x] AC-01 code 语法：P2-01 至 P2-03 已知的全部错误码与限值名都合 DTO 语法；`import` 层 code 集合恰为 spec 的 6 个；Worker 报告的 `failed` 带其他 4 个 `import` code 时被拒绝。
- [x] 协议模块不导入 `original-data`；`pnpm exec vitest run src/workers`、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- 表驱动 Node 测试，按 `code@location` 断言，并用标记字符串检查诊断不含被拒绝的值。
- 不适用 browser-testing 或原版对照。

## 完成证据

- **实现：** [import-protocol.ts](../../../../../src/workers/import-protocol.ts) 只导入 `src/content/` 的 `asset-contract`、`budget`、`completeness`（类型）、`content-identity` 与 `contract-validation`。
  - `readImportWorkerMessage` 与 `readImportStartMessage` 返回冻结的 `valid`/`invalid` 结果。拒绝为 `import` 层 DTO：`protocol-error@message…` 或 `invalid-request@request…`，原因取自固定文本；`start` 的拒绝另附能读出的作业 ID。
  - 内部经 content 的 `fail` 拒绝，由一处 catch 映射为 DTO；其他异常照常抛出。
  - 指纹先经 content 的 `readSourceFingerprint`，再限定为 `source:sha256:` 加 64 位小写十六进制。
- **测试：** [import-protocol.test.ts](../../../../../src/workers/import-protocol.test.ts) 共 183 项，`pnpm exec vitest run src/workers` 通过。
  - **正向：** 7 种消息的合法样本（含 `jobId` 为 null 的 `failed`、4 个文件、255 码元名称与 127 个代理对、`File`）都通过，结果深度冻结。读取复制已核对的字段；`group` 的 `input` 内部值保持原引用，外层冻结。
  - **负向：** 60 个 Worker 方向样本与 18 个 `start` 样本按 `code@location` 断言，覆盖 spec AC-01 的每一项；每条诊断用 `PRIVATE-MARKER` 断言不回显被拒绝的值。
  - **code 语法：** 以 `Record<DiscReadErrorCode | BudgetShapeCode, true>`、`Record<SourceErrorCode, true>`、`Record<ContentContractErrorCode, true>` 与 `Record<DiscLimitName | SourceLimitName | BudgetDimension, true>` 列出的全部 code 与限值名都通过。`IMPORT_ERROR_CODES` 恰为 6 个；Worker 的 `failed` 带另外 4 个 code 时报 `protocol-error@message.error.code`。
  - **类型：** `ImportFailedMessage` 的错误类型为 `WorkerImportErrorData`，两处 `@ts-expect-error` 证明 `worker-failed`、`protocol-error` 无法通过类型检查；把类型改回 `ImportErrorData` 时 `tsc -p tsconfig.node.json` 报未使用的指令。
- **变异检查：** 以下各项都至少使 1 项测试失败：
  - 名称上限改为 256、文件上限改为 5、去掉文件下限；
  - 去掉 Worker code 限制、`sources` 指纹检查、严格指纹检查、token 长度限制或重复组检查；
  - 允许大写指纹、负数计数、协议 2 或非 Blob；
  - 去掉 `start` 类型检查、冻结或可读作业 ID；
  - 放宽位置/原因文本或限值名语法。
- **检查：** `pnpm check`（88 个文件、2541 项测试、构建）、`pnpm typecheck`、`pnpm exec eslint src/workers`、`pnpm check:original`（passed）都通过。
- **Rubber-duck：** 无阻塞问题。唯一建议是 `ImportFailedMessage.error` 在类型上允许主线程专有的 code，已采纳：新增 `WORKER_IMPORT_ERROR_CODES`、`WorkerImportErrorData`，`importError` 保留具体 code 的类型。
- **Simplify：**
  - **已采纳：** 复用 `readSourceFingerprint`；Worker code 只定义一次；文件限值的诊断文本由常量生成；读取元素前先检查文件数；先检查 token 长度。
  - **未采纳：** 合并测试行（各行是 AC-01 的不同边界，如 UTF-16 码元与码点）、缩短文档（与同文档其他节的粒度一致，AC-13 要求记录）、去掉 `readJob` 临时对象（开销可忽略）。
- **文档影响：** [源码结构](../../../../engineering/source-structure.md)的目录树加入 `workers/import-protocol.ts`，说明改为 `workers/` 由 P2-04 逐步交付，并新增“导入 Worker”一节记录协议与错误 DTO；链接检查通过。工程约定的 lint 与测试规则在本子任务没有变化（网络 API 禁用与边界规则归 08）；STATUS 的阶段摘要与下一步不变。

