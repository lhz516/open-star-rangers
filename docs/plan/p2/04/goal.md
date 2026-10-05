---
type: plan
status: accepted
phase: P2
task: "04"
updated: 2026-10-05
---

# P2-04：Worker 导入协议与生命周期 — Goal

## 目标与来源

实现 [P2-04 spec](./spec.md) 中的 S-01 至 S-12 与 AC-01 至 AC-13：

- **协议：** 两个方向都在运行时严格校验的消息协议与错误 DTO，只依赖 `content/`。
- **Worker 侧：** 宿主（握手、单次作业、错误转换、转移发送）与生产导入作业（`BlobByteSource` 加读取计量，经产品入口识别）。
- **主线程侧：** app 定义的 Worker 端口、作业持有者（状态机、隔离、取消、释放、组结果验证与一次性移交），以及 platform 的浏览器模块 Worker 适配。
- **证明：**
  - Node 契约与集成测试；
  - 只在开发项目运行的 Chromium Worker 测试；
  - 本地基准镜像的 Node 核对；
  - 边界规则与文档。

本文件不重新定义行为契约。

## 代码现状与前提

- **上游已完成：** `node tools/task-state.ts p2/01`、`p2/02`、`p2/03` 都输出 `done`。本任务直接复用以下模块。
  - **产品入口：** [open-verified-source.ts](../../../../src/original-data/source/open-verified-source.ts) 的 `openVerifiedSource`。
  - **错误：** [disc-error.ts](../../../../src/original-data/disc/disc-error.ts) 的 `DiscReadError`（含 `BUDGET_SHAPE_CODES`），以及 [source-error.ts](../../../../src/original-data/source-error.ts) 的 `SourceError`。
  - **字节端口：** [blob-byte-source.ts](../../../../src/platform/files/blob-byte-source.ts) 的 `BlobByteSource`。
  - **内容契约：**
    - [completeness.ts](../../../../src/content/completeness.ts) 的 `validateGroup`，格式错误时返回 `incomplete`，不抛出；
    - [ownership.ts](../../../../src/content/ownership.ts) 的 `payloadTransferList`；
    - [payload.ts](../../../../src/content/payload.ts) 的 `readPayloadRecords`；
    - [budget.ts](../../../../src/content/budget.ts) 的 `readBudgetRecord`；
    - [contract-validation.ts](../../../../src/content/contract-validation.ts) 的严格 plain-data 读取与 `ContentContractError`；
    - [slice-definition.ts](../../../../src/content/slice-definition.ts) 的 `CLASSIC_P2_SLICE`。
  - **测试支持：**
    - [disc.test-support.ts](../../../../src/original-data/disc/disc.test-support.ts) 的 `syntheticFileDisc` 与 `MARKER`；
    - [source.test-support.ts](../../../../src/original-data/source/source.test-support.ts) 的 `catalogFor`；
    - [synthetic-content.test-support.ts](../../../../src/content/synthetic-content.test-support.ts) 的 `syntheticGroup`。
- **计划新增（均尚不存在）：**
  - `src/workers/` 的协议、宿主、作业、生产入口，以及测试支持（合成导入与测试 Worker 入口）；
  - `src/app/import/` 的端口与作业持有者；
  - `src/platform/workers/` 的 Worker 端口适配与浏览器工厂；
  - `e2e/import-worker.spec.ts`。
- **类型程序：**
  - [tsconfig.node.json](../../../../tsconfig.node.json) 只有 ES2023 与 Node 类型，编译全部 `*.test.ts` 及其导入的模块。Node 22 有全局的 `Blob`、`File`、`MessageChannel` 与 `structuredClone`，但没有 DOM 的 `Worker`。
  - 因此 Node 测试导入的生产模块只使用最小的结构类型；DOM 专有的全局只出现在 `browser-*.ts` 与 Worker 入口文件中。Worker 入口把 `self` 断言为宿主的最小端点接口，不新增 WebWorker 类型程序（spec 技术决定 11）。
- **Node 克隆行为（2026-10-05 在 Node 22.22 实测）：**
  - `structuredClone(File)` 得到不带名称的 `Blob`，因此协议分开传 `name` 与 `blob`；
  - `MessageChannel` 可以克隆 Blob，包括 `fs.openAsBlob` 返回的文件型 Blob，克隆后的切片读取正确；
  - ArrayBuffer 转移后，发送方失效。
- **合成光盘的读取上限：** P2-02 默认的 `sourceReadBytes` 上限等于 `.ccd` 与 `.img` 的总字节，小合成光盘几乎全读时会超限。沿用 P2-03 的做法，放入一个不读取的 1 MiB 填充文件。
- **边界现状：**
  - [eslint.config.js](../../../../eslint.config.js) 的 `osr/original-data-capabilities` 已覆盖 `src/workers/**`；[engineering-boundaries.test.ts](../../../../tools/engineering-boundaries.test.ts) 的 `originalDataReach` 只允许 `original-data` 与 `workers` 到达 `original-data`，app/platform 经 `workers` 中转也会被拒绝。
  - 当前没有生产模块导入测试或测试支持；`capabilityViolations` 只对 `src/workers` 与 `original-data` 的导入者检查 `support` 类别。
- **浏览器 runner：**
  - [playwright.config.ts](../../../../playwright.config.ts) 有 development、production、development-headed 三个项目，[browser-replay.spec.ts](../../../../e2e/browser-replay.spec.ts) 被生产项目忽略；
  - [browser-test.ts](../../../../e2e/support/browser-test.ts) 对任何 pageerror、console error、失败请求与 4xx/5xx 都判失败，只有固定的放行项；
  - [browser-probes.ts](../../../../e2e/support/browser-probes.ts) 包装 `EventTarget` 监听、ResizeObserver、rAF 与画布，尚不记录 Worker；
  - [probe-contract.spec.ts](../../../../e2e/probe-contract.spec.ts) 证明探针不改变原生行为。
- **本地基准数据（只有 11 需要）：** `local/StarRang/cd/` 下须有开发者的 CloneCD 文件组（2026-10-05 已存在）。缺少时 11 为 blocked，不能用合成数据代替。
- **前提一：** spec 已于 2026-10-05 由用户明确批准。
- **原版证据：** 本任务不涉及原版事实与 U 项；AC-12 只核对产品路径，输出留在 `local/`。

## 验收覆盖

| Spec 范围项/验收项 | 实现子任务 | 验证子任务及方法 |
|---|---|---|
| S-01 | 01 | 01 表驱动协议测试；07 结构化克隆往返 |
| S-02 | 02 | 02 假端点与 `MessageChannel` 测试；07 集成 |
| S-03 | 03 | 03 合成 Blob 作业测试；09 浏览器生产入口；11 本地基准 |
| S-04 | 06 | 06 Node 适配测试；09、10 真实 Chromium Worker |
| S-05 | 04 | 04 假端口状态机测试；10 浏览器取消、重试与释放 |
| S-06 | 05 | 05 组结果测试；07 转移后接收方验证；09 浏览器四组转移 |
| S-07 | 04 | 04 迟到消息与顺序测试；10 浏览器重试隔离 |
| S-08 | 01、02、04、05 | 02 错误转换；07、10 隐私标记；12 复核 |
| S-09 | 06、08 | 08 lint 与依赖图 fixture；12 `pnpm check` |
| S-10 | 02、03、04、05、06、07、09、10 | 各层合成测试；12 核对测试不读取文件、不新增二进制 |
| S-11 | 11 | 11 本地基准 Node 运行 |
| S-12 | 01、02、03、04、05、06、08、09、10 | 各子任务的文档影响检查；12 链接与元数据 |
| AC-01 | 01 | 01 `pnpm exec vitest run src/workers` |
| AC-02 | 02 | 02 假端点与 `MessageChannel` 测试 |
| AC-03 | 03 | 03 合成光盘作业测试；08 证明只经产品入口 |
| AC-04 | 04 | 04 `pnpm exec vitest run src/app/import` |
| AC-05 | 04 | 04 迟到消息、协议错误与启动阶段测试 |
| AC-06 | 05 | 05 组结果、移交与快照测试 |
| AC-07 | 07 | 07 Node `MessageChannel` 集成测试 |
| AC-08 | 09 | 09 Playwright 开发项目 |
| AC-09 | 10 | 10 Playwright 开发项目，事件顺序证据 |
| AC-10 | 10 | 10 Playwright 开发项目，逐项记录预期诊断 |
| AC-11 | 06、08 | 08 边界回归与 `pnpm lint`；06 构建配置；12 `pnpm check`、依赖清单与锁文件无变化 |
| AC-12 | 11 | 11 本地运行，证据只记命令、计数与结论 |
| AC-13 | 01、02、03、04、05、06、08、09、10 | 12 文档链接、锚点与元数据检查 |

## 子任务跟踪

状态只在此维护：`pending` / `in-progress` / `blocked` / `completed`。依赖项全部 completed 后才能开始；验收结果和证据写在相应 subtask 文档，不在阶段索引重复状态。

| 子任务 | 依赖 | 状态 |
|---|---|---|
| [01-import-protocol.md](./subtasks/01-import-protocol.md) | — | completed |
| [02-worker-host.md](./subtasks/02-worker-host.md) | 01 | completed |
| [03-import-job.md](./subtasks/03-import-job.md) | 02 | completed |
| [04-job-owner-lifecycle.md](./subtasks/04-job-owner-lifecycle.md) | 01 | completed |
| [05-group-results.md](./subtasks/05-group-results.md) | 04 | completed |
| [06-browser-worker-adapter.md](./subtasks/06-browser-worker-adapter.md) | 04 | completed |
| [07-node-integration.md](./subtasks/07-node-integration.md) | 03, 05, 06 | completed |
| [08-boundaries.md](./subtasks/08-boundaries.md) | 03, 05, 06 | completed |
| [09-browser-worker-paths.md](./subtasks/09-browser-worker-paths.md) | 06, 07 | completed |
| [10-browser-lifecycle-failures.md](./subtasks/10-browser-lifecycle-failures.md) | 09 | completed |
| [11-local-base-check.md](./subtasks/11-local-base-check.md) | 07 | completed |
| [12-final-alignment.md](./subtasks/12-final-alignment.md) | 01, 02, 03, 04, 05, 06, 07, 08, 09, 10, 11 | pending |

最后一行始终为最终对齐验证，依赖所有其他子任务。ID 分配后保持不变；新增修复项使用新 ID，插入最终验证之前并加入其依赖，不要求最终验证拥有最大的数字。

## 执行记录

- **2026-10-05 — 02 的计划与 spec 对齐：** 02 的工作范围原写宿主把端点的 `error` 事件也报为 `internal-error`。这与 spec 不一致：错误码表把 `internal-error` 限于作业中的异常与未处理拒绝，把 `ready` 之后 Worker 报告的 `error` 归为主线程的 `worker-failed`，AC-10 也要求异步未捕获错误报 `worker-failed`。若宿主同时处理 `error`，两条失败路径会竞争。已按 spec 修订 02 的工作范围：宿主只监听 `unhandledrejection`，不监听 `error`；验收标准本来就与 spec 一致，没有变化。

## 审批

用户于 2026-10-05 明确批准本 goal，批准范围为上述 12 个子任务的拆分、依赖关系和验收覆盖。同日用户明确批准 spec。批准不代表实现完成。
