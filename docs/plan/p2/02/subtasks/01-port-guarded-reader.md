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

- [ ] 端口模块只含类型、不导入任何模块，并在纯模块程序（无 DOM 与 Node 类型）中编译。
- [ ] AC-08（端口部分）：端口拒绝、返回长度不足或过长、非 `Uint8Array`、已 detached 或 SharedArrayBuffer 视图，都返回 `read-failed`，且不泄漏已读字节。宿主异常文本与输入中植入的标记不出现在错误 DTO 中；DTO 可结构化克隆。
- [ ] AC-07（计量部分）：
  - 恰好用尽预算可以读取，再多 1 字节在调用端口前返回 `budget-exceeded`，并带维度、限值与观测值；
  - 坏的预算记录按 P2-01 的 code/path 拒绝；
  - 失败请求同样计量，未发出的请求不计量；
  - 两个重叠调用的用量都被计入；
  - 等待期间取消时返回 `cancelled` 且不发布结果；观察到取消后不能再恢复读取。
- [ ] `usage()` 是冻结的十二维快照，之后的读取或调用者修改快照都不改变它。
- [ ] `pnpm exec vitest run src/original-data`、`pnpm typecheck`、`pnpm lint` 通过，既有 `source-mapping`、`imfat`、`payloads` 测试保持通过。

## 验证方法

- 用表驱动 Node 测试配合记录请求日志与可控 Promise 的合成端口，按 code、location 与 limit 断言，不比较错误信息文本。
- 测试只导入 `vitest`、`node:crypto` 及 `content`/`original-data` 的模块，符合[测试数据守卫](../../../../engineering/README.md#测试)。
- 不适用 browser-testing 或原版对照。

## 完成证据
