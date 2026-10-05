---
type: plan
status: active
phase: P2
task: "04"
subtask: "03"
updated: 2026-10-05
---

# 03 — 生产导入作业与 Worker 入口

**契约来源：** [spec](../spec.md) 的 S-03，S-10 的作业部分；[消息协议](../spec.md#消息协议)中的 `progress` 与 `identified`；技术决定 9、10；AC-03。
**依赖：** 02。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **新增 `src/workers/import-job.ts`：** 生产作业的步骤如下。
  - **包装文件：** 把每个 `{ name, blob }` 包装为 `BlobByteSource`，外加一层计量：每次端口读取成功返回后，把累计字节报告为 `identify-source` 进度。阶段开始时先发送一次 `readBytes` 为 0 的进度。
  - **识别：** 经 `openVerifiedSource(files)` 打开并识别，不传 `limits`，沿用 P2-02 的默认预算。
  - **结果：** 成功时报告 `identified`（`versionId` 与 `identity.fingerprint`），并返回 `source.usage()`。本任务的作业不产生组结果。
  - **注入：** 打开函数可以注入，默认值是 `openVerifiedSource`。生产代码不传其他值；测试传入使用合成白名单的识别。
- **新增生产 Worker 入口 `src/workers/import-worker.ts`：** 只把 `self` 断言为 02 的端点接口，再用生产作业调用宿主入口，不含其他逻辑。
- **新增 `src/workers/synthetic-import.test-support.ts`：**
  - 把 `syntheticFileDisc` 的文件组按块读出，组装成名称含 `MARKER` 的 `File`；
  - 用 `catalogFor` 与底层识别构造注入的打开函数。

  合成光盘含一个不读取的 1 MiB 填充文件，以免默认预算被耗尽。
- **测试：** 新增 `src/workers/import-job.test.ts`，经 02 的宿主与假端点运行作业，覆盖 AC-03 的各条路径。读取失败用 `arrayBuffer()` 会拒绝的 Blob 构造。
- **文档：** 在[源码结构](../../../../engineering/source-structure.md)的“导入 Worker”一节记录作业、计量方式、注入点与生产入口。

## 不包含

- 组结果与转换步骤：归 P2-05 至 P2-09。本任务的合成组结果见 [07](./07-node-integration.md)。
- 浏览器中的入口载入（[09](./09-browser-worker-paths.md)）与本地基准（[11](./11-local-base-check.md)）。
- 边界规则（[08](./08-boundaries.md)）。现有能力规则已覆盖 `src/workers/`，本子任务不得绕过。

## 关键文件与契约

- **新增：** `src/workers/import-job.ts`、`src/workers/import-worker.ts`、`src/workers/synthetic-import.test-support.ts`、`src/workers/import-job.test.ts`（尚不存在）。
- **复用：**
  - [open-verified-source.ts](../../../../../src/original-data/source/open-verified-source.ts) 与 [blob-byte-source.ts](../../../../../src/platform/files/blob-byte-source.ts)；
  - 测试支持：[disc.test-support.ts](../../../../../src/original-data/disc/disc.test-support.ts)、[source.test-support.ts](../../../../../src/original-data/source/source.test-support.ts)；
  - 测试支持中的底层识别：[identify-source.ts](../../../../../src/original-data/source/identify-source.ts) 与 [disc-image.ts](../../../../../src/original-data/disc/disc-image.ts)。

## 验收标准

- [ ] AC-03 产品入口：
  - 不含覆盖文件的合成镜像报 `source/unsupported-version@file:/MAIN/AISTUFF.NOB`，之前有 `identify-source` 进度，`readBytes` 大于 0 且等于端口实际返回的字节；
  - 只有 `.ccd` 的文件组报 `disc/unsupported-file-set@files`，且无读取；
  - 端口读取拒绝时报 `disc/read-failed`。
- [ ] AC-03 注入识别：依次收到 `identified`（合成指纹）与 `finished`；`groups` 为空，`usage` 等于来源用量，最后一次进度的 `readBytes` 等于 `usage.sourceReadBytes`；进度单调不减。
- [ ] 生产作业的默认打开函数就是产品入口；`pnpm lint` 的能力规则对新文件无违规；`pnpm exec vitest run src/workers`、`pnpm typecheck` 通过。

## 验证方法

- Node 测试：在 Node 的 `Blob`/`File` 上构造合成文件组，经宿主与假端点断言消息序列、错误 DTO 与读取量。
- 不适用 browser-testing 或原版对照；浏览器中的生产入口见 [09](./09-browser-worker-paths.md)。

## 完成证据
