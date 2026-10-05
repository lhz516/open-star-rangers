---
type: plan
status: active
phase: P2
task: "02"
subtask: "07"
updated: 2026-10-05
---

# 07 — 浏览器 Blob 适配

**契约来源：** [spec](../spec.md) 的 S-08、S-13（源码结构文档）；[读取、所有权与生命周期](../spec.md#读取所有权与生命周期)；AC-10。
**依赖：** 05, 06。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **适配器：** 在 `src/platform/files/` 用 `Blob.slice` 与 `arrayBuffer()` 实现 `ByteSource`，只依赖 Blob API（`File` 也是 Blob），在页面与 Worker 中都可用。
  - 负数、非整数、不安全整数或越界的请求在切片前被拒绝，不依赖 `Blob.slice` 的自动截断。
  - `arrayBuffer()` 被拒绝时，适配器随之拒绝，由读取方映射为 `read-failed`。
  - 返回长度不符时同样由读取方核对。
  - 不包含文件选择 UI、Worker 或作业编排。
- **取消语义：** 底层 Blob 读取不可强制中止，取消语义由 01/05 的读取方保证。
- **端口导入：** 仅以纯类型方式导入端口，依赖 06 的放行。
- **文档：** 更新[源码结构](../../../../engineering/source-structure.md)：说明新增的 `platform/files/`、`original-data/io/` 与 `original-data/disc/` 的职责与导出。

## 不包含

- 真实浏览器与 Worker 中的读取验证，以及文件选择流程（P2-04 E2E、P2-11）。
- Node 适配（08）。

## 关键文件与契约

- **计划新增：** `src/platform/files/blob-byte-source.ts` 与相邻 `blob-byte-source.test.ts`。
- **修改：** [源码结构](../../../../engineering/source-structure.md)。
- **前提：** 05 的完整读取链，06 的边界放行。

## 验收标准

- [x] AC-10：
  - 在 Node 的 WHATWG `Blob`/`File` 上，范围内读取与切片内容一致；
  - 负数、非整数、不安全整数与越界的请求被拒绝，且不调用 `slice`；
  - `arrayBuffer()` 被拒绝时，经读取方返回 `read-failed`；
  - 模块在没有 `window`/`document` 的环境中可用；
  - 经读取方完成合成镜像的打开、查找与读取。
- [x] 证据明确说明：这是 Node 中的 WHATWG Blob 测试，不冒称真实浏览器或 Worker 验收。
- [x] `pnpm exec vitest run src/platform/files src/original-data`、`pnpm typecheck`（app 与 node 程序）、`pnpm lint` 通过。

## 验证方法

- 用 Node 22 全局 `Blob`/`File` 构造合成镜像，配合可观察 `slice`/`arrayBuffer` 调用的包装 Blob。
- 不适用 browser-testing：真实浏览器链路由 P2-04 用 E2E 证明。

## 完成证据

- **实现：**
  - [blob-byte-source.ts](../../../../../src/platform/files/blob-byte-source.ts) 的 `BlobByteSource` 用 `Blob.slice` 与 `arrayBuffer()` 实现 `ByteSource`，只依赖 Blob API（`File` 也是 Blob），没有 DOM 文档或 Worker 专属依赖：
    - 先用减法式边界检查拒绝负数、非整数、不安全整数、空长度与越界请求（`RangeError`），之后才切片；
    - 返回新 ArrayBuffer 上的 `Uint8Array`；
    - 只以 `import type` 导入端口，经 06 的 lint 与依赖图放行；真实应用程序的依赖图零违规。
  - Blob 读取不可中止，取消由 01/05 的读取方保证。
  - [disc-image.ts](../../../../../src/original-data/disc/disc-image.ts) 从入口再导出公共类型 `DiscInputFile`、`OpenDiscOptions`、`DiscEntry`。
- **测试：** [blob-byte-source.test.ts](../../../../../src/platform/files/blob-byte-source.test.ts)（AC-10）。
  - 适配器本身：
    - 四种范围读取与切片内容一致，返回 `byteOffset` 为 0 的新缓冲，`slice` 恰好调用 4 次；
    - 8 种非法请求被拒绝，`slice` 调用 0 次；
    - 在 vitest 的 node 环境中运行，`window` 与 `document` 都不存在，模块照常可用。
  - 经读取方：`arrayBuffer()` 被拒绝或返回的字节过少，都返回 `read-failed@image`。
  - 端到端：把合成光盘物化为 `File`，经 `BlobByteSource` 完成打开、按路径打开文件与跨扇区读取，结果与内容一致。
  - **证据边界：** 这些测试运行在 Node 22 的 WHATWG `Blob`/`File` 上，不能代替真实浏览器或 Worker 验收，后者由 P2-04 用 E2E 证明。
- **检查：**
  - `pnpm exec vitest run src/platform/files src/original-data` 通过；typecheck（app 与 node）与 lint 通过；
  - 完整 `pnpm check` 通过：78 个测试文件共 2054 项测试、build；
  - `pnpm check:original` 通过，0 findings。
- **Rubber-duck：** 未发现实现缺陷。4 项文档或 API 问题已修复：
  - `DiscFile.read()` 返回类型的描述有误；
  - 把尚未实现的 Node 适配写成现状，现改为指向 08 的计划；
  - 入口模块未导出公共类型，现已再导出；
  - 撤销一处仅改日期的文档变更。
- **Simplify：**
  - 已应用：端到端测试复用 `volumeSectors`/`syntheticDisc`。
  - 未采纳：`byteLength` 保持构造时快照，符合端口的 readonly 语义；不在端口旁集中范围校验，端口模块必须只含类型，读取方也会独立校验。
- **文档影响：** [源码结构](../../../../engineering/source-structure.md)新增“光盘镜像读取”一节：端口、入口 API、错误 DTO、内部模块分工、平台适配与测试数据；目录树加入 `platform/files/`。限值与错误码只链接 spec，不在此复述。
