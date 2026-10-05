---
type: plan
status: active
phase: P2
task: "04"
subtask: "13"
updated: 2026-10-05
---

# 13 — 冻结收到的组输入（补救）

**契约来源：** [spec](../spec.md) 的 S-01（“校验结果冻结”）与 AC-01（“校验结果冻结”）；S-12/AC-13 的文档一致性。
**依赖：** 01, 05。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 背景

[12 的第一次最终对齐](./12-final-alignment.md#完成证据)发现：协议读取 `group` 消息时只冻结 `input` 外层，收到的 `manifest`、`payloads`、`sources` 及其内部容器仍可修改，协议测试把它们排除在冻结检查之外。另外，04 与 06 工作范围中的端口签名与 spec、实现不符。

## 工作范围

- **协议：** 在 [import-protocol.ts](../../../../../src/workers/import-protocol.ts) 中，`group` 消息通过外层核对后，就地递归冻结 `input` 内的普通对象与数组。
  - 不复制，也不改变内容；
  - `ArrayBuffer` 视图（payload 字节）、`Blob` 与其他非普通对象保持原样；
  - 只沿数据属性递归，不调用 accessor；
  - 用已访问集合防止循环。

  消息形状、阶段与顺序规则不变，协议版本不变。
- **持有者：** [import-job-owner.ts](../../../../../src/app/import/import-job-owner.ts) 只冻结它自己新建的移交容器，不再自行深度冻结：每个保留的 `{ group, manifest, payloads, sources }` 在验证通过后立即冻结，移交列表在接受 `finished` 时冻结。
- **测试：**
  - 协议测试去掉对 `group` 输入的冻结豁免，证明 `manifest`、内层记录与数组、`payloads` 及其记录、`sources` 及其数组都已冻结；payload 字节仍可读，引用不变。
  - 持有者测试证明：先浅冻结、内层可变的输入，经读取后整体冻结；保留的完整组在验证之后无法被修改。
- **文档：**
  - [源码结构](../../../../engineering/source-structure.md)写明协议读取会就地冻结 `group` 输入的普通容器，以及持有者的移交只冻结自建容器；
  - 把 [04](./04-job-owner-lifecycle.md) 与 [06](./06-browser-worker-adapter.md) 工作范围中的签名改为 `post(message)` 与 `postMessage(message)`，并在各自证据中注明更正。

## 不包含

- 改变消息形状、协议版本或 P2-01 的内容契约。
- 复制 payload 字节。

## 验收标准

- [x] S-01/AC-01：两个方向每种消息的读取结果中，可达的普通对象与数组都已冻结（payload 字节视图、Blob 与其他非普通对象除外），测试不再豁免 `group` 输入；`group.input` 的内部值不被复制。
- [x] 持有者保留与移交的组在读取之后无法被修改；既有的组结果、移交与集成测试仍然通过。
- [x] 文档与实现一致；`pnpm check` 通过；受影响的浏览器 spec（`pnpm test:e2e import-worker.spec.ts --project=development`）通过。

## 验证方法

- 协议与持有者的 Node 测试，对冻结做变异检查。
- 浏览器 spec 只作回归确认，不新增浏览器验收。

## 完成证据

- **实现：**
  - [import-protocol.ts](../../../../../src/workers/import-protocol.ts) 新增 `freezeReceived`，`readGroupInput` 在外层核对通过后就地冻结 `input` 内可达的普通对象与数组：不复制；只沿数据属性递归，不调用 accessor；用已访问集合防止循环；`ArrayBuffer` 视图、`Blob` 与其他非普通对象保持原样。
  - [import-job-owner.ts](../../../../../src/app/import/import-job-owner.ts) 去掉自己的深度冻结：保留的条目在验证通过后立即冻结，移交列表在接受 `finished` 时冻结。
  - 消息形状、阶段与顺序规则都不变，协议版本不变。
- **测试：** `pnpm exec vitest run src/app/import src/workers` 共 306 项通过。
  - **协议：** 冻结检查不再豁免 `group` 输入，7 种消息的读取结果都通过深度冻结检查（只豁免 Blob 与字节视图）。
    - 浅冻结的清单，其内层数组也被冻结；`payloads` 及其记录、`sources`、`states`、`unknowns` 与嵌套数组都已冻结；
    - `payloads` 与字节视图保持原引用，字节未被冻结，仍可读；
    - 带 getter 的清单读取后 getter 从未运行；自引用不会死循环；`Blob` 与 `Map` 不被冻结。
  - **持有者：** 组被接收后，修改清单、弹出 payload、替换字节视图、向来源状态追加，都抛出 `TypeError`；移交结果等于按同一指纹重新生成的组。
- **变异检查：** 以下 5 项变异都至少使 1 项测试失败：
  - 去掉 `freezeReceived`；
  - 遇到已冻结的容器就停止递归；
  - 经 getter 读取属性；
  - 冻结非普通对象；
  - 移交列表不冻结。
- **检查：** `pnpm check`（93 个文件、2671 项测试、构建）、`pnpm check:original`（passed）、`pnpm test:e2e import-worker.spec.ts --project=development`（8 项）与文档链接检查都通过。
- **Rubber-duck：**
  - 无阻塞问题。审查确认：结构化克隆传输中，冻结只影响接收方；冻结的 payload 记录不妨碍之后的转移与缓存移交；持有者没有绕过协议读取的路径。
  - 两条非阻塞的文档精确性建议已采纳：
    - 写明冻结范围是“可达的普通对象与数组”，字节视图、Blob 与非普通对象除外；
    - 写明不复制的只是 `group.input` 的内部值，以及持有者冻结条目与列表的时机。
- **Simplify：** 建议把冻结推迟到持有者验证成功之后，未采纳：S-01/AC-01 要求协议读取的结果本身冻结；多出的元数据遍历相对 `validateGroup` 的 payload 哈希可忽略。
- **文档影响：**
  - [源码结构](../../../../engineering/source-structure.md)的协议与移交条目已更正；
  - [01](./01-import-protocol.md) 的证据追加更正说明；
  - [04](./04-job-owner-lifecycle.md) 与 [06](./06-browser-worker-adapter.md) 工作范围中的签名已改为单参数，并在各自证据中注明。

