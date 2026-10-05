---
type: plan
status: active
phase: P2
task: "02"
subtask: "07"
updated: 2026-10-04
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

- [ ] AC-10：
  - 在 Node 的 WHATWG `Blob`/`File` 上，范围内读取与切片内容一致；
  - 负数、非整数、不安全整数与越界的请求被拒绝，且不调用 `slice`；
  - `arrayBuffer()` 被拒绝时，经读取方返回 `read-failed`；
  - 模块在没有 `window`/`document` 的环境中可用；
  - 经读取方完成合成镜像的打开、查找与读取。
- [ ] 证据明确说明：这是 Node 中的 WHATWG Blob 测试，不冒称真实浏览器或 Worker 验收。
- [ ] `pnpm exec vitest run src/platform/files src/original-data`、`pnpm typecheck`（app 与 node 程序）、`pnpm lint` 通过。

## 验证方法

- 用 Node 22 全局 `Blob`/`File` 构造合成镜像，配合可观察 `slice`/`arrayBuffer` 调用的包装 Blob。
- 不适用 browser-testing：真实浏览器链路由 P2-04 用 E2E 证明。

## 完成证据
