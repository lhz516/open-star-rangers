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

- [x] AC-09（正向）：`declared`、指纹为 null 的合成表经核验后得到新表：
  - 指纹为本来源的指纹；
  - 条目级映射为 `verified`，含子资源的映射为 `declared`；
  - 新表能通过 `readSourceMappingTable`，`assetSourceStates` 给出相应状态；
  - 精确等价且字节相同的备选通过。
- [x] AC-09（负向）：下列情况都返回预期 code，位置为 locator 的结构路径或 `sources.sourceFingerprint`：
  - 路径不在覆盖范围内；封包无法打开（保留封包错误的 code）；
  - 条目不存在（含大于 u32 的 ID）；类型不符；重定位无效；
  - 备选的 `flags`、`size`、重定位个数、块字节、重定位位置之一不同；
  - 表已绑定另一指纹。

  另外：类型不同的备选由 P2-01 读取器以 `invalid-source-mapping` 拒绝；光盘层错误以同一实例传递。
- [x] AC-10（映射部分）：不返回部分表，输入表不变；在 locator 与条目字节中植入的标记不出现在诊断中。
- [x] `pnpm exec vitest run src/original-data`、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- 用合成多文件光盘、合成白名单与合成映射表做表驱动 Node 测试，按 code 与位置断言。
- 不适用 browser-testing 或原版对照。

## 完成证据

- **实现：** [verify-source-mappings.ts](../../../../../src/original-data/source/verify-source-mappings.ts) 的 `verifySourceMappings(table, source)`：
  - **读取与指纹：** 先用 `readSourceMappingTable`（P2-01 错误原样传递）；表级指纹不为 null 且不同于本来源时，在打开任何封包之前，于 `sources.sourceFingerprint` 报 `fingerprint-mismatch`。
  - **逐个 locator：** 按映射、部件、备选的顺序处理，依次检查：路径在覆盖范围内、封包能打开（一次核验中每个封包只打开一次）、大于 u32 的 ID 报 `entry-not-found`、`read(id, type)` 核对存在、类型与重定位。
  - **错误位置：** 本任务产生的错误改用 locator 的结构路径重新发出，code、reason 与 limit 不变；`DiscReadError` 原样传递。
  - **备选等价：** 与第 0 个备选逐项比较 `flags`、大小、重定位个数、块字节与重定位位置，否则报 `alternatives-differ`。
  - **输出：** 经 `readSourceMappingTable` 再次读取，得到冻结的新表；含子资源的映射一律为 `declared`。
- **测试：** [verify-source-mappings.test.ts](../../../../../src/original-data/source/verify-source-mappings.test.ts) 的合成光盘包含两个封包（含精确别名与只差一项的近似条目）、一个坏封包、一个重定位无效的封包、一个覆盖范围外的文件，以及用于提高默认预算的未读填充文件。覆盖：
  - **AC-09 正向：** 多备选跨封包的精确别名、多部件的映射与 MESH 模型映射变为 `verified`，含子资源的调色板映射保持 `declared`；输出能通过 `readSourceMappingTable` 且冻结，`assetSourceStates` 依次为 verified、verified、verified、unverified；输入不变；把输出再次核验通过。
  - **AC-09 负向：** 下列情况都在 locator 的结构路径返回预期 code，且输入不变：
    - 覆盖范围外、坏封包、条目不存在、ID 大于 u32、类型不符、重定位无效；
    - 覆盖范围外或坏封包与 ID 大于 u32 同时出现时，先报前者；
    - `flags`、字节、大小、重定位个数、重定位位置各自不同。

    另外：
    - 指纹不符时不打开任何封包；
    - 注入的 `limit-exceeded` 改到 locator 路径后，code、reason 与 limit 完整保留；
    - 类型不同的备选与缺字段的表由 P2-01 分别以 `invalid-source-mapping`、`invalid-record` 拒绝；
    - 注入的 `DiscReadError` 以同一实例传递。
  - **AC-10：** 所有诊断可结构化克隆，不含光盘路径、entry ID、`2^32` 或条目字节中的标记。
- **变异检查：** 不比较 `flags`、把含子资源的映射标为 `verified`，都使测试失败。
- **检查：**
  - `pnpm exec vitest run src/original-data/source`：111 个测试通过；
  - `pnpm check`：85 个测试文件 2,299 个测试与构建通过。
- **Rubber-duck：** 采纳一项阻塞意见：ID 大于 u32 的判定移到封包打开之后，并增加两组同时出错的用例。另采纳两项：保留 limit 的回归，以及指纹不符先于任何读取的回归。
- **Simplify：**
  - 采纳：复用 `block` 构建器；封包缓存直接存句柄；按元素提前退出的比较。
  - 未采纳：
    - 抽取共享的映射与失败测试辅助（不同模块，投影方式不同）；
    - 跨部件缓存条目字节（与“不跨部件保留字节”冲突）；
    - 直接冻结输出（经读取器再次读取可以证明满足 P2-01 契约）。
- **文档影响：** [源码结构](../../../../engineering/source-structure.md#版本识别与已验证来源)补充映射核验，“原版来源映射”一节写明 `verified` 的产生方式，并更新目录树。工程约定与工具指南无受影响内容。

