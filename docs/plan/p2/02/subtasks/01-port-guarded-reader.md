---
type: plan
status: active
phase: P2
task: "02"
subtask: "01"
updated: 2026-10-04
---

# 01 — 字节端口、受控读取、预算与错误

**契约来源：** [spec](../spec.md) 的 S-07（端口部分）、S-10、S-11、S-12；[数据模型与契约](../spec.md#数据模型与契约)、[读取、所有权与生命周期](../spec.md#读取所有权与生命周期)、[限值与预算](../spec.md#限值与预算)、[错误码](../spec.md#错误码)；AC-07、AC-08。
**依赖：** 无。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **端口模块：** 新增只含类型的 `ByteSource` 端口，不导入任何模块。
  - `readonly byteLength`；
  - `read(offset, length): Promise<Uint8Array>`。
- **错误类型：** 新增光盘读取的封闭错误码集合与纯数据错误 DTO `{ code, location, reason, limit }`，以及可从中提取 DTO 的错误类。
  - `limit` 为 `{ name, limit, observed: number | null }` 或 null。
  - `reason` 只用固定的安全文本；宿主异常不被序列化。
  - P2-01 的预算形状错误保留原 code，并把 path 放入 location。
- **受控读取层**（disc 内部使用）：
  - 校验每次请求的参数为安全整数，且用减法式边界检查证明范围在源内；单次端口请求不超过 4,816,896 字节。
  - 发出前先检查取消，再用 P2-01 `chargeBudget` 原子地把请求长度计入 `sourceReadBytes`。计量失败返回 `budget-exceeded`，不调用端口；多个重叠调用在等待前更新共享用量，不会丢失累计值。
  - 等待结束后先检查取消，再核对返回值：必须是精确长度的 `Uint8Array`，不能已 detached，不能由 SharedArrayBuffer 支持。否则返回 `read-failed`；已发出的请求用量不回滚。
  - 提供整次操作的预算预检，不改变用量；`usage()` 返回完整十二维、冻结且脱离内部状态的快照。
  - 取消探针形如 `{ readonly aborted: boolean }`，保留实时引用；第一次观察到取消后，该读取上下文保持取消。
- **合成测试端口**（扩展 [synthetic.ts](../../../../../src/original-data/synthetic.ts)）：
  - 基于内存字节、记录每次请求 `(offset, length)` 的端口；
  - 可控 Promise 的端口，用于复现重叠与等待期间取消；
  - 可返回错误类型、长度或缓冲状态的故障端口。

## 不包含

- 文件组配对与默认上限的确定（02）、扇区与卷（03）、目录（04）、文件范围分段（05）。
- lint 与依赖图对端口的放行（06）、浏览器与 Node 适配（07、08）。

## 关键文件与契约

- **计划新增：**
  - `src/original-data/io/byte-source.ts`：只含类型的端口；
  - `src/original-data/disc/disc-error.ts`：错误码、DTO 与错误类；
  - `src/original-data/disc/source-reader.ts`：受控读取、计量与取消；
  - 相邻 `*.test.ts`。
- **复用：** [budget.ts](../../../../../src/content/budget.ts)（`readBudgetRecord`、`chargeBudget`、`EMPTY_BUDGET_USAGE`）、[ownership.ts](../../../../../src/content/ownership.ts)（`isDetached`）、[contract-validation.ts](../../../../../src/content/contract-validation.ts)（`ContentContractError`）。
- **修改：** [synthetic.ts](../../../../../src/original-data/synthetic.ts) 增加合成端口。

## 验收标准

- [x] 端口模块只含类型、不导入任何模块，并在纯模块程序（无 DOM 与 Node 类型）中编译。
- [x] AC-08（端口部分）：端口拒绝、返回长度不足或过长、非 `Uint8Array`、已 detached 或 SharedArrayBuffer 视图，都返回 `read-failed`，且不泄漏已读字节。宿主异常文本与输入中植入的标记不出现在错误 DTO 中；DTO 可结构化克隆。
- [x] AC-07（计量部分）：
  - 恰好用尽预算可以读取，再多 1 字节在调用端口前返回 `budget-exceeded`，并带维度、限值与观测值；
  - 坏的预算记录按 P2-01 的 code/path 拒绝；
  - 失败请求同样计量，未发出的请求不计量；
  - 两个重叠调用的用量都被计入；
  - 等待期间取消时返回 `cancelled` 且不发布结果；观察到取消后不能再恢复读取。
- [x] `usage()` 是冻结的十二维快照，之后的读取或调用者修改快照都不改变它。
- [x] `pnpm exec vitest run src/original-data`、`pnpm typecheck`、`pnpm lint` 通过，既有 `source-mapping`、`imfat`、`payloads` 测试保持通过。

## 验证方法

- 用表驱动 Node 测试配合记录请求日志与可控 Promise 的合成端口，按 code、location 与 limit 断言，不比较错误信息文本。
- 测试只导入 `vitest`、`node:crypto` 及 `content`/`original-data` 的模块，符合[测试数据守卫](../../../../engineering/README.md#测试)。
- 不适用 browser-testing 或原版对照。

## 完成证据

- **实现：**
  - [byte-source.ts](../../../../../src/original-data/io/byte-source.ts)：只含 `ByteSource` 接口，没有任何 import/export from。`pnpm typecheck` 中的 `tsc -p tsconfig.core.json`（lib ES2023，`types: []`）编译通过；自动化的“只含类型、不导入”检查由 06 加入依赖图。
  - [disc-error.ts](../../../../../src/original-data/disc/disc-error.ts)：16 个错误码、沿用 P2-01 的 4 个预算形状 code（由单一元组推导）、完整的 `DiscLimitName`，以及 `DiscReadError#toData()` 冻结 DTO（limit 在构造时冻结复制）。
  - [source-reader.ts](../../../../../src/original-data/disc/source-reader.ts)：
    - `snapshotSource` 只读一次源长度，非法长度为 `invalid-range`，getter 抛错为 `read-failed`；返回带品牌的冻结快照，调用方不能绕过校验伪造。
    - `readSourceLimits` 把 P2-01 预算形状错误转成同 code、location 为 P2-01 path 的 `DiscReadError`。
    - `SourceReader.read` 依次检查：参数 → 减法式源内边界 → 单次端口上限 → 取消 → `chargeBudget` 计量（等待前写入共享用量）→ 等待 → 取消 → 宿主失败或返回值校验。
    - 返回值经 `%TypedArray%.prototype` 与 `ArrayBuffer.prototype` 的内在 getter 校验，子类、Proxy、改写的访问器或原型都无法伪装；结果统一为普通 `Uint8Array` 视图。
    - `precheck` 不改变用量；`usage()` 返回冻结的十二维记录；观察到取消后保持取消。
  - [synthetic.ts](../../../../../src/original-data/synthetic.ts)：`SyntheticByteSource`（记录请求，`respond` 可返回任意值、Promise 或抛错，因此同时承担生成端口与故障端口），以及 `memoryByteSource`、`deferredByteSource`（可控 Promise）。
- **测试：** [source-reader.test.ts](../../../../../src/original-data/disc/source-reader.test.ts) 与 [disc-error.test.ts](../../../../../src/original-data/disc/disc-error.test.ts) 均按 code/location/limit 断言，并检查诊断中不含植入标记、错误对象上不挂字节、DTO 可结构化克隆。覆盖内容：
  - 端口契约失败：拒绝、同步抛错、短/长数据、普通数组、DataView、Int8Array、detached、SharedArrayBuffer、标记文本、undefined、Proxy、伪装普通缓冲的共享视图、原型改为 ArrayBuffer 的共享缓冲、谎报 byteLength 的短视图，全部返回 `read-failed` 且仍计量；
  - 正向：带偏移的池化视图、子类结果被规范为普通视图、被改写的访问器不执行、恰好 4,816,896 字节的请求；
  - 参数与边界：参数非法与越界（含和溢出、长度超过源）不计量也不读取；超出单次上限 1 字节返回 `limit-exceeded`（portReadBytes，4,816,896/4,816,897）；同时越界且超限时先报 `invalid-range`；
  - 计量：预算恰好用尽可读，再多 1 字节在调用端口前返回 `budget-exceeded`（sourceReadBytes，10/11）；未发出的请求不计量；失败请求计量且不回滚；两个重叠请求在等待前都已计量，第三个立即被拒；重复读取重复计量；预检不改用量；溢出时 observed 为 null；
  - 预算记录：非记录、缺维度、未知维度（不回显其名称）、非法值各保留 P2-01 code/path；
  - 取消：发出前取消不读取也不计量；等待期间取消时，合法字节、短数据或拒绝一律返回 `cancelled` 且保留计量；重叠读取全部取消；取消后探针复位仍保持取消；`AbortSignal` 可直接作为探针。
- **变异检查：** 删去等待后的取消检查，4 个取消用例失败；把用量更新推迟到 await 之后，重叠计量用例失败。检查后已恢复原代码。
- **检查：**
  - `pnpm exec vitest run src/original-data` 120 项通过；`source-mapping`、`imfat`、`payloads` 既有测试保持通过。
  - `pnpm check`：typecheck、lint、69 个测试文件共 1706 项测试、build 均通过。
  - `pnpm check:original` 通过，0 findings。
- **Rubber-duck：** 3 项发现均已修复：
  - 结果校验可被子类或 Proxy 伪造：改用内在 getter 并规范为普通视图，补充对应回归；
  - 越界与超限同时出现时的报错优先级：改为先报越界；
  - `DiscLimitName` 不完整：补齐 spec 限值表中的全部名称。
- **Simplify：**
  - 已应用：合成端口 `read` 改为 async；预算形状 code 由单一元组推导；去掉多余的 detached 分配（精确长度 ≥ 1 的检查已经排除 detached 视图）；`SourceSnapshot` 加品牌。
  - 未采纳：测试中 DTO 冻结/克隆检查保留为 AC-08 的实际失败证据；每次端口读取一个视图与增量对象的分配相对 I/O 可忽略；不修改 P2-01 `budget.ts` 的导出（spec 规定只读复用）。
- **文档影响：**
  - 已更新[源码结构](../../../../engineering/source-structure.md)的目录树，加入 `io/` 与 `disc/` 的新文件；职责说明按计划在 07 补充，端口放行规则在 06 写入工程约定。
  - 本子任务不产生原版事实，也不改变命令或 U 项。
