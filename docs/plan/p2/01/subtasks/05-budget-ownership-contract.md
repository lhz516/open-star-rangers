---
type: plan
status: active
phase: P2
task: "01"
subtask: "05"
updated: 2026-10-08
---

# 05 — 预算与数据所有权契约

**契约来源：** [spec](../spec.md) 的 S-09、S-10；AC-08、AC-09。
**依赖：** 02。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 固定 schema 1 的十二个预算维度，定义 limits/usage 的非负安全整数形状；缺失、未知、负数、非整数、超限和安全整数加法溢出均拒绝。
- 定义 plain data、TypedArray/ArrayBuffer payload 的复制、冻结、结构化克隆与转移边界；发送方转移后不得继续使用，共享消费者不得互相修改。
- 保持预算与 payload identity、资源组和完整性结果的可诊断关联。

## 不包含

- 不决定各解析器的具体资源预算数值；P2-02 至 P2-09 在各自不可信输入边界批准限值。
- 不实现 Worker transfer、IndexedDB 事务、Web Audio 或 GPU 生命周期。

## 关键文件与契约

- 计划新增 `src/content/` 预算/所有权类型与纯校验模块；邻接测试随本子任务维护。
- [工程 TypeScript 配置](../../../../../tsconfig.core.json)禁止宿主 API。

## 验收标准

- [x] 十二个预算维度固定且每次结果都显式给出，不适用维度为 0。
- [x] 等于上限通过，超过、缺失、未知和溢出失败，并返回稳定 code/limit/observed。
- [x] 深层输入和输出容器修改不会改变定义、验证结果或后续调用。

## 验证方法

- Node/Vitest 覆盖边界数值、MAX_SAFE_INTEGER 加法、嵌套数组/对象、ArrayBuffer/TypedArray 所有权。
- 不适用 browser-testing；Worker 实际转移由 P2-04 验证。

## 完成证据

- **预算实现：** [budget.ts](../../../../../src/content/budget.ts)
  - **维度：** `BUDGET_UNITS` 固定 schema 1 的十二个维度及其单位。换了单位的量使用不同的键，因此按缺失或未知维度失败，不需要逐值写单位字段。
  - **记录：** `readBudgetRecord` 要求完整的十二维记录，不适用的维度写 0，`EMPTY_BUDGET_USAGE` 为全 0 用量。缺失、未知和非“非负安全整数”的值分别以 `missing-budget-dimension`、`unknown-budget-dimension`、`invalid-budget-value` 拒绝，不回显未知键名。
  - **计量：** `chargeBudget` 每次都重新读取限值、当前用量和增量三份原始输入，结果总是完整的十二维用量。
    - 判断基于剩余额度，不依赖溢出后的和：用量等于上限时通过；超过上限为 `budget-exceeded`，observed 是会达到的总量；超出安全整数范围为 `budget-overflow`，observed 为 null。
    - 所有违规维度按固定顺序报告；被拒的计量不会部分生效，结果保留之前的用量。
  - **清单计量：** `chargeManifestBudget` 把预算与清单、资源组和 payload 身份关联起来，在读取描述符的同时逐个 Asset 计量声明的 Asset 数、依赖边数和 payload 字节，此时尚未读取或分配任何 payload。
    - 第一个超限的 Asset 拒绝整个清单，不再读取后续描述符，路径指向该 Asset。
    - 若传入的现有用量已经超限，空清单也会被拒绝。
  - 具体限值仍由 P2-02 至 P2-09 批准，本项不猜测数值。
- **所有权实现：** [ownership.ts](../../../../../src/content/ownership.ts)。TypedArray 不能冻结，因此二进制 payload 不在消费者之间共享。
  - `exclusiveBytes` 把字节复制到长度恰好的新 ArrayBuffer；不使用 `slice`，因为 Node 的 `Buffer#slice` 共享内存。
  - `payloadTransferList` 要求每个视图独占整个非共享的 buffer、彼此不共用且尚未转移，否则分别以 `payload-not-exclusive`、`payload-aliased`、`payload-detached` 拒绝。
  - `isDetached` 用 ES2023 可用的方式识别已转移的 buffer（项目的 lib、构建与 lint 目标均为 ES2023，`ArrayBuffer#detached` 属于 ES2024）。
  - [payload.ts](../../../../../src/content/payload.ts) 的 `readPayloadRecords` 同样拒绝已转移的字节。这一检查也防止哈希已转移的空 payload 时在完整性验证中抛出宿主 `TypeError`。
- **复用：**
  - 组清单读取从 `completeness.ts` 移到 [manifest.ts](../../../../../src/content/manifest.ts)，完整性验证与预算计量共用。
  - `contract-validation.ts` 新增 `visitArray`/`visitOrderedArray`：按索引逐项读取并访问，访问函数返回值即停止读取。`readArray`/`readOrderedArray` 改为在其上收集，行为与错误优先级不变，既有测试全部通过。
- **测试：**
  - [budget.test.ts](../../../../../src/content/budget.test.ts) 共 51 项：
    - 维度与单位固定；
    - 逐维度覆盖缺失、等于上限通过、超过 1 失败（code/limit/observed）；
    - 未知维度及换单位的键；13 种非法值；非 plain 数据；
    - `MAX_SAFE_INTEGER` 恰好到达与三种溢出；
    - 不适用维度为 0，多维违规按固定顺序报告；
    - 每次调用都校验三份输入；
    - 结果冻结、可结构化克隆，调用后修改输入不影响结果，重复调用互不影响；
    - 清单计量：通过、首个超限 Asset、payload 字节溢出、乱序清单；
    - 超限 Asset 之后的畸形描述符不会被读取，更早的结构错误优先，同一索引上结构错误优先；
    - 已超限用量配空清单被拒，未超限的空清单通过。
  - [ownership.test.ts](../../../../../src/content/ownership.test.ts) 共 11 项：
    - 独占副本双向隔离；
    - 同一源网格生成的两个模型 payload 互不影响；
    - Node Buffer 副本；
    - `isDetached` 区分正常、空、共享和已转移的 buffer；
    - 非空与合法的空 payload 转移后，接收方通过 payload 验证；发送方视图变空，三个入口均以 `payload-detached` 拒绝，再次发送也失败；
    - 部分视图、偏移视图、共享内存、重复和同一 buffer 别名均以稳定 code 拒绝。
  - 生产代码经纯模块 `tsc` 程序（ES2023，无 DOM/Node 类型）检查。
  - [06](./06-synthetic-contract-tests.md) 仍负责委托的字节层验证（共享源网格的视图隔离），本项提供规则与单元测试。
- **审查：** rubber-duck 提出 1 个阻塞问题和 2 个其他问题，均已修复，并经同一审查者只读复核确认：
  - ①（阻塞）清单计量先读完整个清单才计量，不能“立即拒绝”，且超限之后的畸形描述符会覆盖预算诊断。已改为逐个描述符计量、首个超限即停止，并新增三项优先级回归。
  - ② 空清单不会检查已超限的现有用量。已先计量零增量，并新增回归。
  - ③ 已转移的 buffer 能通过转移列表校验，宿主再报 `DataCloneError`。已新增 `payload-detached`，覆盖三个入口，并新增非空与空 payload 的回归。
- **simplify：** 复用角度无发现。采纳：
  - 抽象层次：以显式返回停止值的访问原语代替“回调抛出私有哨兵”的提前停止方式。这同时解决了简化角度指出的哨兵冗余状态，以及效率角度指出的“构建整个清单再丢弃”。
  - 效率：转移列表改为单次遍历。

  跳过一项：把每个 Asset 的十二维计量改为只累计三个维度的专用累加器。收益只是常数级、不在热路径上，而且需要复制剩余额度规则。
- **验证：**
  - `pnpm exec vitest run src/content src/original-data tools/engineering-boundaries.test.ts` 为 13 个文件 414 项通过；
  - `pnpm check` 为 66 个文件 1633 项通过，四个 TypeScript 程序、lint 与生产构建均通过；
  - 依赖与锁文件未变；
  - 不适用 browser-testing，实际 Worker 转移归 P2-04。
- **文档影响：** [源码结构](../../../../engineering/modules/content.md#内容基础契约与切片定义)更新了以下内容：
  - 目录树新增 `manifest.ts`、`budget.ts`、`ownership.ts`；
  - 新增 `visitArray`/`visitOrderedArray`、`readGroupManifest`/`visitGroupManifest`、预算与所有权的说明；
  - 删除“二进制所有权仍由 05 实现”的过时说明。

  工程约定、guides、架构决策与 STATUS 不受影响：本项没有新增命令、lint 规则、依赖或模块边界，P2-01 仍在执行。原版事实与 U 项状态不变。
