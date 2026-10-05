---
type: plan
status: active
phase: P2
task: "03"
subtask: "06"
updated: 2026-10-05
---

# 06 — 来源映射核验

**契约来源：** [spec](../spec.md) 的 S-08、S-10；[来源映射核验](../spec.md#来源映射核验)、[错误码](../spec.md#错误码)；AC-09、AC-10。
**依赖：** 05。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 新增映射核验函数，输入未经校验的映射表与 05 的已验证来源，处理次序如下：
  1. 用 P2-01 的 `readSourceMappingTable` 读取映射表，错误保留 P2-01 的 code/path。
  2. 表级指纹必须为 null 或等于本来源的指纹，否则在 `sources.sourceFingerprint` 返回 `fingerprint-mismatch`。
  3. 按映射、部件、备选的顺序，逐个 locator 核验：
     - 路径在覆盖范围内；
     - 封包能打开；
     - 条目存在（大于 u32 的安全整数 ID 返回 `entry-not-found`）；
     - 类型一致；
     - 读取条目能通过重定位校验。

     本任务产生的错误，统一以 `sources.mappings[i].parts[j].alternatives[k]` 为位置重新发出，code 与 limit 不变；`DiscReadError` 以同一实例传递。
  4. **备选等价：** 第 k 个备选与第 0 个备选的 `flags`、`size`、重定位个数、块字节与重定位位置序列必须相同，否则在第 k 个备选返回 `alternatives-differ`。类型与子资源相同已由 P2-01 读取器保证。
  5. **输出：** 返回新的冻结表，表级指纹为本来源的指纹；无子资源的映射为 `verified`，含子资源 locator 的映射一律为 `declared`。输出能再次通过 `readSourceMappingTable`；输入不被修改；首个错误终止核验，不返回部分表。
- 诊断不回显路径、entry ID 等 locator 的值。

## 不包含

- 子资源解析与核验，以及 payload 引用语义（P2-05 至 P2-09）。
- 生产来源映射表的编写（各转换任务）。

## 关键文件与契约

- **计划新增：** `src/original-data/source/verify-source-mappings.ts` 与相邻测试。
- **复用：**
  - [source-mapping.ts](../../../../../src/original-data/source-mapping.ts) 的 `readSourceMappingTable`、`assetSourceStates`；
  - 05 的已验证来源，03 的条目读取，02 的错误类；
  - 03/04 的合成光盘与白名单 helper。
- **文档：** [源码结构](../../../../engineering/source-structure.md#原版来源映射)中关于来源指纹与 `verified` 产生方式的说明。

## 验收标准

- [ ] AC-09（正向）：`declared`、指纹为 null 的合成表经核验后得到新表：
  - 指纹为本来源的指纹；
  - 条目级映射为 `verified`，含子资源的映射为 `declared`；
  - 新表能通过 `readSourceMappingTable`，`assetSourceStates` 给出相应状态；
  - 精确等价且字节相同的备选通过。
- [ ] AC-09（负向）：下列情况都返回预期 code，位置为 locator 的结构路径或 `sources.sourceFingerprint`：
  - 路径不在覆盖范围内；封包无法打开（保留封包错误的 code）；
  - 条目不存在（含大于 u32 的 ID）；类型不符；重定位无效；
  - 备选的 `flags`、`size`、重定位个数、块字节、重定位位置之一不同；
  - 表已绑定另一指纹。

  另外：类型不同的备选由 P2-01 读取器以 `invalid-source-mapping` 拒绝；光盘层错误以同一实例传递。
- [ ] AC-10（映射部分）：不返回部分表，输入表不变；在 locator 与条目字节中植入的标记不出现在诊断中。
- [ ] `pnpm exec vitest run src/original-data`、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- 用合成多文件光盘、合成白名单与合成映射表做表驱动 Node 测试，按 code 与位置断言。
- 不适用 browser-testing 或原版对照。

## 完成证据
