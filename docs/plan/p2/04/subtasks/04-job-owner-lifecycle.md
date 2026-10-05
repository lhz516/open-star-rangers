---
type: plan
status: active
phase: P2
task: "04"
subtask: "04"
updated: 2026-10-05
---

# 04 — 作业持有者：状态机、取消、释放与隔离

**契约来源：** [spec](../spec.md) 的 S-05、S-07，S-08 的主线程分类部分；[行为与边界](../spec.md#行为与边界)、[作业持有者](../spec.md#作业持有者)、[错误层与错误码](../spec.md#错误层与错误码)；AC-04、AC-05。
**依赖：** 01。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **新增 `src/app/import/import-worker-port.ts`（app 定义的端口）：**
  - 工厂接收三个回调（收到消息、`messageerror`、`error`）并返回端口；
  - `post(message, transfer?)` 可能同步抛错；
  - `terminate()` 先移除监听再终止，可重复调用；
  - 终止之后，回调不再被调用。
- **新增 `src/app/import/import-job-owner.ts`：** 用端口工厂创建持有者。
  - **命令：** `start`、`cancel`、`dispose`、`subscribe`、`getSnapshot`，返回值按 spec。
  - **状态：** `idle`、`starting`、`running`、`finished`、`failed`、`cancelled`。快照冻结，在两次变化之间保持同一对象；变化后同步通知，一个订阅者抛错不影响其他订阅者与状态。
  - **开始：**
    - 校验 1–4 项、名称为 1–255 个码元的 Blob，并立即复制为私有的 `{ name, blob }` 快照，只保留引用，输入总字节也由它计算；
    - 拒绝时返回 `busy`、`invalid-files` 或 `disposed`，不改变状态，也不创建端口；
    - 每个作业使用新的递增作业 ID 与新的端口。
  - **握手：** 收到有效的 `ready` 后发送 `start`，随即释放快照引用。
    - `ready` 的版本不符时报 `protocol-error`，且不发送 `start`；
    - `post` 抛错时报 `worker-failed`；
    - 工厂抛错，或 `ready` 之前出现 `error`、`messageerror`，都报 `worker-start-failed`。
  - **消息：**
    - 用 01 的读取函数校验，并核对作业 ID、顺序号连续、第二次 `ready`、`jobId` 为 null 的 `failed`、`ready` 之后的 `messageerror`，不合时报 `protocol-error`；
    - 收到 `ready` 之后的 `error` 报 `worker-failed`；
    - Worker 报告的 `failed` 原样成为快照的 `error`。
  - **`group` 消息：** 本子任务只核对外层与顺序（须在 `identified` 之后、每组至多一次）；来源绑定、内容验证与保留由 [05](./05-group-results.md) 实现。
  - **终态与隔离：**
    - 进入终态、取消或释放时，端口恰好终止一次；
    - 每个作业的回调只在该作业仍是当前作业且未终止时生效，旧作业的迟到回调被忽略且不通知。
  - **释放：** 可重复调用；终止活动端口、清空订阅，之后的命令返回 `disposed`、false 或 null，快照不再变化。
- **测试：** 新增 `src/app/import/import-job-owner.test.ts`，用记录调用的假端口工厂覆盖 AC-04、AC-05 与“行为与边界”表的每一行（除组结果外）。
- **文档：** 在[源码结构](../../../../engineering/source-structure.md)中记录 `app/import/` 的端口与持有者。

## 不包含

- 组结果的来源绑定、`validateGroup`、`takeGroups` 与快照中的 `groups` 内容（[05](./05-group-results.md)）。
- 浏览器适配（[06](./06-browser-worker-adapter.md)）、React hook 与页面（P2-11）。

## 关键文件与契约

- **新增：** `src/app/import/import-worker-port.ts`、`src/app/import/import-job-owner.ts`、`src/app/import/import-job-owner.test.ts`（尚不存在）。
- **复用：** 01 的协议模块。先例：P1 的 owner 释放模式见 [use-synthetic-demo-owner.ts](../../../../../src/app/composition/use-synthetic-demo-owner.ts)，Session 端口与平台实现的分工见 [session-host.ts](../../../../../src/app/session/session-host.ts)。

## 验收标准

- [ ] AC-04：持有者实现行为表中的全部状态转换（组结果除外）。`busy`、`invalid-files` 与 `disposed` 不改变状态，也不创建端口。取消同步完成，每个作业恰好终止一次端口，终止后没有回调。释放可重复，之后无通知。快照冻结，两次变化之间保持同一对象，订阅者抛错相互隔离。工厂抛错报 `worker-start-failed`；`post(start)` 抛错报 `worker-failed`，端口恰好终止一次。在 `ready` 前修改、清空或替换传入数组的元素，发送的 `start` 仍等于开始时的快照。
- [ ] AC-05：作业 A 取消后立即开始作业 B，A 的迟到消息（包括带 payload 的组）不改变 B 的状态，也不通知。以下都报 `protocol-error`，且不会被当成空的 `finished`：作业 ID 不符、顺序号跳号或重复、第二次 `ready`、`jobId` 为 null 的 `failed`、`ready` 之后的 `messageerror`。版本不符时报 `protocol-error` 且从未发送 `start`；`ready` 前的 `error` 或 `messageerror` 报 `worker-start-failed`。
- [ ] 快照与错误都不含文件名标记；`failed` 与 `cancelled` 不含来源身份；`pnpm exec vitest run src/app/import`、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- Node 测试：假端口工厂记录创建、`post` 与 `terminate`，并能在终止后尝试回调，以证明回调被丢弃；用标记文件名检查隐私。
- 不适用 browser-testing；浏览器中的取消、重试与释放见 [10](./10-browser-lifecycle-failures.md)。

## 完成证据
