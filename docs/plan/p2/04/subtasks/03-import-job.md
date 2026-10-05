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

- [x] AC-03 产品入口：
  - 不含覆盖文件的合成镜像报 `source/unsupported-version@file:/MAIN/AISTUFF.NOB`，之前有 `identify-source` 进度，`readBytes` 大于 0 且等于端口实际返回的字节；
  - 只有 `.ccd` 的文件组报 `disc/unsupported-file-set@files`，且无读取；
  - 端口读取拒绝时报 `disc/read-failed`。
- [x] AC-03 注入识别：依次收到 `identified`（合成指纹）与 `finished`；`groups` 为空，`usage` 等于来源用量，最后一次进度的 `readBytes` 等于 `usage.sourceReadBytes`；进度单调不减。
- [x] 生产作业的默认打开函数就是产品入口；`pnpm lint` 的能力规则对新文件无违规；`pnpm exec vitest run src/workers`、`pnpm typecheck` 通过。

## 验证方法

- Node 测试：在 Node 的 `Blob`/`File` 上构造合成文件组，经宿主与假端点断言消息序列、错误 DTO 与读取量。
- 不适用 browser-testing 或原版对照；浏览器中的生产入口见 [09](./09-browser-worker-paths.md)。

## 完成证据

- **实现：**
  - [import-job.ts](../../../../../src/workers/import-job.ts) 的 `createImportJob(open = openVerifiedSource)`：每个文件包装为 `BlobByteSource` 加计量层，计量层只在读取成功返回后累计实际返回的字节。先报告一次 0，之后每次读取报告一次，识别完成后停止报告识别进度。成功时报告版本 ID 与指纹，返回 `source.usage()`；不传 `limits`。
  - [import-worker.ts](../../../../../src/workers/import-worker.ts) 只有一行：把 `self` 经 `unknown` 断言为 `ImportHostEndpoint`，再用 `createImportJob()` 调用 `runImportHost`。
  - [synthetic-import.test-support.ts](../../../../../src/workers/synthetic-import.test-support.ts) 的 `syntheticImport(covered, versionId)` 生成含 1 MiB 不读取填充文件的合成光盘，按 1 MiB 块读出为名称含 `PRIVATE-MARKER-7f3a` 的 `File`；返回的打开函数用 `openDiscImage`、`identifySource` 与 `catalogFor(covered, versionId)` 识别。
  - 宿主测试中的假端点移到 [import-host.test-support.ts](../../../../../src/workers/import-host.test-support.ts)，供宿主与作业测试共用；它不依赖 vitest，核对失败时抛错。
- **测试：** [import-job.test.ts](../../../../../src/workers/import-job.test.ts) 共 4 项，经宿主与假端点运行作业。每条消息都通过协议读取，且不含文件名标记。用 `Blob.prototype.arrayBuffer` 的包装记录每次读取实际返回的字节；进度的 `readBytes` 依次等于 `[0, 累计和…]`，即每次读取一条、单调不减。
  - **产品入口：**
    - 含两个合成文件的光盘，经生产作业报 `source/unsupported-version@file:/MAIN/AISTUFF.NOB`，之前的最后一次进度大于 0；同一光盘在注入识别下会成功，这也证明默认打开函数用的是生产白名单。
    - 只有 `.ccd` 的文件组报 `disc/unsupported-file-set@files`，没有任何 Blob 读取，进度只有 0。
    - `.img` 换成读取必然拒绝的 Blob 子类时报 `disc/read-failed`；进度只计入 `.ccd` 的成功读取，最后一次等于 `.ccd` 的大小；消息不含拒绝的文本。
  - **注入识别：** 依次收到 `identified`（`job-test-disc` 与 `source:sha256:` 指纹）与 `finished`；`groups` 为空，`usage` 等于来源的 `usage()`，最后一次进度等于 `usage.sourceReadBytes`。
- **变异检查：** 以下 6 项变异都至少使 1 项测试失败：去掉初始的 0 进度；在请求时计量；写死版本 ID；改动用量；默认打开函数换成合成白名单；进度不累计。
- **边界：** `pnpm lint` 的 P2-03 能力规则对新文件无违规。生产作业只导入产品入口、`BlobByteSource` 与宿主类型；底层能力只出现在测试支持中。生产入口不导入任何测试支持。
- **检查：** `pnpm check`（90 个文件、2580 项测试、构建）、`pnpm check:original`（passed）与文档链接检查都通过。
- **Rubber-duck：** 无问题。审查确认以下几点：
  - 成功路径的计量等于 `usage.sourceReadBytes`：读取器按请求长度计费，`BlobByteSource` 恰好返回请求长度，`.sub`/`.cue` 不被读取。
  - 识别完成时没有未完成的读取。
  - Worker 入口与真实 Worker 作用域的接口一致；测试支持只用浏览器可用的 API。
- **Simplify：**
  - **已采纳：** 共用假端点；前缀和改为单次累计；`SyntheticImport` 不再导出；内联只调用一次的 `identify`；去掉逐块的多余复制；去掉未用的 `others` 参数，改为可指定 `versionId`，使写死版本 ID 的变异能被发现。
  - **未采纳：** 直接调用作业而不经宿主（本子任务要求经宿主运行，AC-03 的 `finished` 由宿主发送）、精简文档细节（与同文档粒度一致）。
- **文档影响：** [源码结构](../../../../engineering/source-structure.md)的目录树加入 `import-job.ts` 与 `import-worker.ts`，“导入 Worker”一节新增导入作业、生产入口与测试支持。工程约定没有需要更新的规则或命令；STATUS 不变。

