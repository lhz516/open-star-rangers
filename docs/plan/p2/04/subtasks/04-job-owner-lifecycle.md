---
type: plan
status: active
phase: P2
task: "04"
subtask: "04"
updated: 2026-10-10
---

# 04 — 作业持有者：状态机、取消、释放与隔离

**契约来源：** [spec](../spec.md) 的 S-05、S-07，S-08 的主线程分类部分；[行为与边界](../spec.md#行为与边界)、[作业持有者](../spec.md#作业持有者)、[错误层与错误码](../spec.md#错误层与错误码)；AC-04、AC-05。
**依赖：** 01。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **新增 `src/app/import/import-worker-port.ts`（app 定义的端口）：**
  - 工厂接收三个回调（收到消息、`messageerror`、`error`）并返回端口；
  - `post(message)` 可能同步抛错（持有者只发送 `start`，不带转移列表）；
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
- **复用：** 01 的协议模块。先例：P1 的 owner 释放模式见 [use-synthetic-demo-owner.ts](../../../../engineering/source-structure.md#r5-演示所有者与槽位)，Session 端口与平台实现的分工见 [session-host.ts](../../../../../src/app/session/session-host.ts)。

## 验收标准

- [x] AC-04：持有者实现行为表中的全部状态转换（组结果除外）。`busy`、`invalid-files` 与 `disposed` 不改变状态，也不创建端口。取消同步完成，每个作业恰好终止一次端口，终止后没有回调。释放可重复，之后无通知。快照冻结，两次变化之间保持同一对象，订阅者抛错相互隔离。工厂抛错报 `worker-start-failed`；`post(start)` 抛错报 `worker-failed`，端口恰好终止一次。在 `ready` 前修改、清空或替换传入数组的元素，发送的 `start` 仍等于开始时的快照。
- [x] AC-05：作业 A 取消后立即开始作业 B，A 的迟到消息（包括带 payload 的组）不改变 B 的状态，也不通知。以下都报 `protocol-error`，且不会被当成空的 `finished`：作业 ID 不符、顺序号跳号或重复、第二次 `ready`、`jobId` 为 null 的 `failed`、`ready` 之后的 `messageerror`。版本不符时报 `protocol-error` 且从未发送 `start`；`ready` 前的 `error` 或 `messageerror` 报 `worker-start-failed`。
- [x] 快照与错误都不含文件名标记；`failed` 与 `cancelled` 不含来源身份；`pnpm exec vitest run src/app/import`、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- Node 测试：假端口工厂记录创建、`post` 与 `terminate`，并能在终止后尝试回调，以证明回调被丢弃；用标记文件名检查隐私。
- 不适用 browser-testing；浏览器中的取消、重试与释放见 [10](./10-browser-lifecycle-failures.md)。

## 完成证据

- **实现：**
  - [import-worker-port.ts](../../../../../src/app/import/import-worker-port.ts) 定义 `ImportWorkerEvents`（`message(data)`、`messageError()`、`error()`）、`ImportWorkerPort`（`post(start)` 可能同步抛错，`terminate()` 先移除监听再终止，可重复）与 `ImportWorkerPortFactory`。
  - [import-job-owner.ts](../../../../../src/app/import/import-job-owner.ts) 的 `createImportJobOwner({ createPort, reportError })`：
    - 活动作业以 `#job` 表示，作业结束或释放时清空；每个作业的回调只在它仍是 `#job` 时生效。
    - 工厂返回前送达的回调排队，发布 `starting` 后按序处理。
    - 文件按协议的 `readImportStartMessage` 核对：持有者用文件构造 `start` 请求，读取结果就是冻结的私有 `{ name, blob }` 快照，发送后释放。
    - 订阅者抛错交给 `reportError`（输出口自身抛错也被隔离）；通知中被移除的订阅者跳过。
- **测试：** [import-job-owner.test.ts](../../../../../src/app/import/import-job-owner.test.ts) 共 55 项，`pnpm exec vitest run src/app/import` 通过。假端口记录 `post` 与 `terminate`，并能在终止后继续触发回调。
  - **正常导入（AC-04）：** 依次经过 `idle`、`starting`、`running`（进度、识别）与 `finished`，端口恰好终止一次。
    - `start` 消息等于开始时的文件，Blob 为原引用。
    - 快照深度冻结，两次变化之间为同一对象，序列化后不含 `PRIVATE-MARKER`。
    - 终态后的消息、`error` 与 `messageError` 都不再通知。
    - Worker 报告的 `failed` 原样成为错误，带最后的阶段。
  - **拒绝（AC-04）：** 以下 8 种输入都返回 `invalid-files`：0 个、5 个、非数组、无名称的 Blob、字节、形似文件的 record、空名称、256 码元名称。`starting` 与 `running` 时返回 `busy`；释放后返回 `disposed`。拒绝都不改变快照、不创建端口、不通知。4 个文件与 255 码元名称被接受。
  - **取消与重试（AC-04、AC-05）：**
    - `starting` 与 `running` 中取消同步变为 `cancelled`，端口终止一次；之后的回调与再次取消都无效；`idle`、`finished`、`failed` 时 `cancel()` 返回 false。
    - 作业 A 取消后立即开始作业 B（作业 ID 2、新端口）。A 端口上迟到的识别、带 payload 的组、结束、失败、`error` 与 `messageError` 都不改变 B，也不通知；B 正常结束。
  - **启动失败：**
    - 工厂抛错时，`start` 返回 `started`，作业为 `worker-start-failed@worker`，之后可以重试；
    - `ready` 之前的 `error` 与 `messageError` 报 `worker-start-failed`，从未发送 `start`；
    - `ready` 的版本为 2 时报 `protocol-error@message.protocol`，从未发送 `start`；
    - `post(start)` 抛 `DataCloneError` 时报 `worker-failed@worker`，端口终止一次；
    - 工厂在返回前送达的 `ready` 与进度在 `starting` 之后按序处理；送达的 `error` 报 `worker-start-failed`；若订阅者在 `starting` 时取消，排队的事件被丢弃，从未发送 `start`。
  - **运行失败（AC-05）：** `ready` 之后的 `error` 报 `worker-failed`。以下 14 种情况都报 `protocol-error`，之后的 `finished` 不会被当成成功：
    - 不可反序列化（`message`）、非法消息（`message.type`）、第二次 `ready`（`message.type`）；
    - 他人作业 ID、`jobId` 为 null 的 `failed`（都在 `message.jobId`）；
    - 跳号与重复顺序号（`message.sequence`）；
    - 字节数减少与超过输入总量（`message.readBytes`）；
    - 识别后的识别进度（`message.stage`）、第二次识别（`message.type`）；
    - 识别前的组（`message.type`）、重复的组（`message.group`）、识别前的结束（`message.type`）。

    `ready` 之前的非 `ready` 消息报 `protocol-error@message.type`。
  - **订阅与释放：**
    - 订阅者抛错不影响其他订阅者与状态，错误交给 `reportError`；输出口抛错时持有者仍正常工作。
    - 通知中被前一个订阅者移除的订阅者不被调用；订阅者在通知中释放持有者后，其余订阅者不再收到通知。
    - 在 `idle`、`starting`、`running`、`finished` 四种状态下，释放都可重复调用，活动端口恰好终止一次；之后的命令返回 `disposed` 或 false，快照不变，新订阅不会收到通知。
  - **快照：** `cancelled` 与 `failed` 的字段分别只有 `status, jobId, stage` 与 `status, jobId, stage, error`；收到带 payload 的组后，快照中没有 `Uint8Array`。
- **变异检查：** 重构后的 28 项变异都至少使 1 项测试失败，涵盖：
  - 存活检查、排队重放及其存活检查；
  - `busy` 与 `disposed`；
  - 文件请求的构造、名称来源与快照复制，作业 ID 递增，输入总字节；
  - 结束与释放时清空活动作业，以及终止；
  - 通知中的移除检查与订阅者隔离；
  - 取消返回值；
  - 两种事件在 `ready` 前后的分类；
  - 第二次 `ready`、作业 ID、顺序号、字节数的两个方向、识别后进度、重复组；
  - `post` 与工厂失败，以及 `reportError`。

  初版的 `this.#job === job` 存活检查因 `ended` 而冗余，已在重构中由“结束时清空 `#job`”取代。释放后 `subscribe` 的守卫只避免保留监听，没有可观察的行为差异，属于等价变异。
- **检查：** `pnpm check`（91 个文件、2635 项测试、构建）、`pnpm check:original`（passed）与文档链接检查都通过。
- **Rubber-duck：** 无阻塞问题。非阻塞问题：工厂若在返回前同步触发回调，事件会被丢弃，导致作业停在 `starting`，或丢失 `worker-start-failed`。已改为排队后按序重放，并补了 3 项测试。
- **Simplify：**
  - **已采纳：**
    - 文件接受改由协议的 `start` 读取函数核对，规则只有一处；
    - 以“结束时清空 `#job`”取代 `Job.ended`，同时让结束的作业与端口可被回收；
    - 通知时跳过已移除的订阅者（同 `synthetic-session.ts` 的 `Subscribers`），释放无需单独判断；
    - 删去测试中未用的返回值。
  - **未采纳：**
    - 复用 `Subscribers`：它是 session 模块的私有类，带 session 专有语义，提取会改动本子任务以外的代码；
    - 合并或节流进度通知：spec 要求每次变化后同步通知；
    - 直接遍历 Set：拷贝能在通知中增删订阅时保持语义稳定；
    - 每条消息的闭包：相对消息反序列化可忽略；
    - 精简文档：与同文档粒度一致。
- **文档影响：** [源码结构](../../../../engineering/source-structure.md)的目录树加入 `app/import/`，“导入 Worker”一节新增 Worker 端口与作业持有者。工程约定没有需要更新的规则或命令；STATUS 不变。
- **计划更正（2026-10-05，[13](./13-freeze-group-input.md)）：** 工作范围中的 `post(message, transfer?)` 改为与 spec 和实现一致的 `post(message)`。
