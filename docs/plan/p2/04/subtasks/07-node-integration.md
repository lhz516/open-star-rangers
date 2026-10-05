---
type: plan
status: active
phase: P2
task: "04"
subtask: "07"
updated: 2026-10-05
---

# 07 — Node 跨线程集成

**契约来源：** [spec](../spec.md) 的 S-02、S-06、S-08，S-10 的 Node 部分；技术决定 5、6；AC-07。
**依赖：** 03, 05, 06。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **连接：** 用 Node `MessageChannel` 连接真实的宿主（02）、作业与持有者（04、05）：
  - 宿主端点包装一端的 `MessagePort`；
  - 持有者的端口工厂用 06 的 `createWorkerPort` 包装另一端，`terminate` 映射为关闭端口。
- **合成作业：** 扩展 `src/workers/synthetic-import.test-support.ts`：
  - 使用合成白名单识别（03）的成功作业，在 `identified` 之后发送绑定该合成指纹的四个组；
  - 失败作业：每层各一个，即 `disc`、`source`、`content`（发送一个 payload 互相别名的组）与 `import/internal-error`。
- **测试：** 新增 `src/app/import/import-pipeline.test.ts`，覆盖 AC-07：
  - 四组 payload 以转移交出，发送方视图失效，接收方验证为 `group-complete`，`takeGroups` 返回的字节与原值相等；
  - 每层失败样本经端口往返后，快照中的 DTO 与宿主转换的值相等；
  - 文件名含 `MARKER`：Worker 发出的全部消息、快照、错误与诊断都不含标记，只有 `start` 含文件名。
- **文档：** 在[源码结构](../../../../engineering/source-structure.md)中补充合成导入测试支持与集成测试的位置。

## 不包含

- 浏览器中的真实 Worker（[09](./09-browser-worker-paths.md)、[10](./10-browser-lifecycle-failures.md)）。
- 本地基准（[11](./11-local-base-check.md)）。

## 关键文件与契约

- **新增：** `src/app/import/import-pipeline.test.ts`（尚不存在）。
- **修改：** 03 新增的 `src/workers/synthetic-import.test-support.ts`。
- **复用：** 02 的宿主、03 的作业注入点、04 与 05 的持有者、06 的 `createWorkerPort`，以及 [synthetic-content.test-support.ts](../../../../../src/content/synthetic-content.test-support.ts)。

## 验收标准

- [x] AC-07 集成：四组 payload 以转移交出，发送方失效，接收方验证通过；每层失败样本往返后 DTO 相等。
- [x] AC-07 隐私：文件名只出现在 `start` 中；Worker 发出的消息、快照、错误与诊断都不含标记。
- [x] 测试结束后关闭全部端口，不留下活动句柄；`pnpm exec vitest run src/app/import src/workers`、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- Node 测试：使用真实结构化克隆与转移；记录两个方向的全部消息，在其上做标记检查。
- 不适用 browser-testing 或原版对照。

## 完成证据

- **实现：**
  - [import-pipeline.test.ts](../../../../../src/app/import/import-pipeline.test.ts) 的 `channelFactory` 是持有者的端口工厂，每个作业做三件事：
    - 新建 Node `MessageChannel`，在 `port1` 上运行真实宿主；
    - 把 `port2` 包装为 `WorkerLike`，交给 06 的适配（计划中称 `createWorkerPort`，实际名为 `connectImportWorker`）；
    - 终止时关闭两端，并记录两个方向的全部消息。
  - [synthetic-import.test-support.ts](../../../../../src/workers/synthetic-import.test-support.ts) 新增 `syntheticGroupsJob(open, groups)`、`boundGroups` 与 `SyntheticGroups`。作业先经注入的识别，再发送 `groups(指纹)` 给出的组；它们不依赖 Node API，供 09 的浏览器测试入口复用。
  - [import-host.test-support.ts](../../../../../src/workers/import-host.test-support.ts) 新增 `portEndpoint(port)`，宿主测试改用它。
  - 计划把四层失败作业都放进测试支持，实际只放了可复用的部分：`disc` 与 `source` 失败直接用生产作业（只有 `.ccd`，以及不在生产白名单上的光盘）；`content` 失败用 `syntheticGroupsJob` 加 payload 互相别名的组；`import/internal-error` 是测试中一行抛错的作业。
- **测试：** 共 3 项，`pnpm exec vitest run src/app/import src/workers` 通过。
  - **集成：** 四组经通道送达，持有者全部判为 `group-complete`，版本 ID 为 `pipeline-disc`。发送方每个 payload 视图与其 buffer 的 `byteLength` 都为 0，即已转移，不是复制。`takeGroups` 与按同一指纹重新生成的四组逐字节相等，Worker 发出的组消息恰好 4 条，运行中有 `readBytes` 大于 0 的进度。
  - **四层失败：** 每层先用 `FakeEndpoint` 取得宿主自己转换的 DTO，再经通道运行同一作业，快照的错误与之相等，层分别为 `disc`、`source`、`content`、`import`；Worker 消息与快照都不含标记。
  - **隐私：** 文件名含 `PRIVATE-MARKER-7f3a`，其中一组 payload 被改动，因此带 P2-01 诊断。主线程只发出一条 `start`，且其中有标记；`strings()` 深度遍历字符串与 `File` 名称，Worker 发出的全部消息、全部快照（含诊断）与移交的组都不含标记。移交恰为三个完整的组。
  - **句柄：** 每次运行结束后，`process.getActiveResourcesInfo()` 中的 `MessagePort` 数量回到运行前的值。
- **变异检查：** 经本测试，以下变异都被发现：宿主不转移 payload；适配转交事件对象；宿主去掉 `source` 层转换；持有者保留不完整的组。以下两项未被本测试发现：
  - 适配不调用 `worker.terminate()`：宿主关闭本端会关闭整条通道，由适配的单元测试覆盖；
  - 宿主写死与测试数据相同的版本 ID：由宿主测试覆盖。
- **检查：** `pnpm check`（93 个文件、2665 项测试、构建）、`pnpm check:original`（passed）与文档链接检查都通过。
- **Rubber-duck：** 无问题。审查确认：
  - 测试区分了转移与复制；
  - 以宿主转换值作为四层失败的对照是恰当的；
  - 隐私遍历覆盖了不可枚举的 `File.name`；
  - 新测试支持可在 Chromium 中复用。
- **Simplify：**
  - **已采纳：** 三项测试共用一个合成导入。
  - **未采纳：**
    - 失败用例去掉宿主对照：AC-07 要求与宿主转换的原值比较；
    - 改等 `close` 事件：全局句柄计数本身就是验收依据；
    - 提取通用深度遍历：`strings()` 需读取 `File` 名称，语义不同；
    - 把合成作业移回本测试：09 会复用。
- **文档影响：** [源码结构](../../../../engineering/source-structure.md)的“导入 Worker”一节补充 `syntheticGroupsJob`、`portEndpoint` 与集成测试的位置和覆盖。工程约定与 STATUS 不变。

