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

- [ ] AC-07 集成：四组 payload 以转移交出，发送方失效，接收方验证通过；每层失败样本往返后 DTO 相等。
- [ ] AC-07 隐私：文件名只出现在 `start` 中；Worker 发出的消息、快照、错误与诊断都不含标记。
- [ ] 测试结束后关闭全部端口，不留下活动句柄；`pnpm exec vitest run src/app/import src/workers`、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- Node 测试：使用真实结构化克隆与转移；记录两个方向的全部消息，在其上做标记检查。
- 不适用 browser-testing 或原版对照。

## 完成证据
