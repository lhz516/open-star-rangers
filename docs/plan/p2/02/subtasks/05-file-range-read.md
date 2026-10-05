---
type: plan
status: active
phase: P2
task: "02"
subtask: "05"
updated: 2026-10-04
---

# 05 — 文件范围读取与所有权

**契约来源：** [spec](../spec.md) 的 S-06、S-10（单次读取限值与整次预检）、S-11、S-12；[读取、所有权与生命周期](../spec.md#读取所有权与生命周期)；AC-06、AC-07（分段与最后一段取消）、AC-08（结果与句柄隔离）。
**依赖：** 01, 04。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **打开与读取：** 句柄按路径打开文件，得到绑定到所属镜像的已打开文件。调用者伪造的条目不能当作读取权限。已打开文件提供 `read(offset, length)`。
- **读取前检查**（按此顺序）：
  1. 范围：`offset`/`length` 须为非负安全整数且在文件长度内，否则 `invalid-range`；
  2. 限值：`length` ≤ 16,777,216 字节，否则 `limit-exceeded`；
  3. 取消；
  4. 整次预检：所覆盖原始扇区的总字节数须在预算内，在分配输出缓冲前检查。
- **分段读取：** 按扇区升序分段，每段不超过 2,048 个原始扇区。每段发出前检查取消并计量；等待结束后先检查取消；最后一段完成时已取消，也不发布结果。
- **结果所有权：** 跨扇区拼接用户数据，返回恰好 `length` 字节的独占新 ArrayBuffer（`byteOffset` 为 0、覆盖整个缓冲、不与端口缓冲共享），能通过 P2-01 `payloadTransferList`。零长度读取检查取消，但不调用端口。
- **无缓存与隔离：** 不建立内部缓存，重复读取重复计量。读取失败不损坏句柄；修改或转移返回的字节不影响后续读取。

## 不包含

- 浏览器与 Node 适配（07、08），以及本地基准核对（09）。
- Worker 转移与作业编排（P2-04）。

## 关键文件与契约

- **修改：** `src/original-data/disc/disc-image.ts`，增加打开文件与范围读取，及相邻测试。
- **复用：** 01 的受控读取与预检；[ownership.ts](../../../../../src/content/ownership.ts) 的 `payloadTransferList`（测试用于断言）。
- **视需要新增：** `src/original-data/disc/` 内的文件读取模块。

## 验收标准

- [x] AC-06：
  - 单扇区内、跨扇区边界、末尾不满一个扇区、整文件、恰好到文件末尾和零长度的范围，都与合成文件逐字节相同；零长度不调用端口。
  - 返回缓冲独占，能被 `payloadTransferList` 接受。
  - 16,777,216 字节通过，再多 1 字节返回 `limit-exceeded`；超出文件末尾返回 `invalid-range`。
  - 端口读取只覆盖所需扇区，每次不超过 2,048 个扇区；同一输入两次读取结果相同。
- [x] AC-07（读取部分）：
  - 预算恰好容纳一整次请求时通过；比所需原始字节少 1 时，在分配与端口调用前返回 `budget-exceeded`，观测值按原始字节计算。
  - 两段之间取消、或等待最后一段时取消，都返回 `cancelled` 且不发布结果。
  - 重复读取重复计量。
- [x] AC-08（读取部分）：查找或读取失败后，句柄仍可正常读取其他文件；已发出请求的用量不回滚；修改或转移先前结果不影响后续读取；伪造的条目不能读取。
- [x] `pnpm exec vitest run src/original-data`、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- Node 测试，使用记录日志的端口、可控 Promise 的端口和按需生成扇区的超大镜像端口，断言读取日志、用量与所有权。
- 不适用 browser-testing 或原版对照。

## 完成证据

- **实现：**
  - [file-range.ts](../../../../../src/original-data/disc/file-range.ts) 的 `readFileRange` 依次执行：
    1. 用减法式边界检查范围（`invalid-range@file:/PATH`）；
    2. 检查 16,777,216 字节上限（`limit-exceeded`，`rangeReadBytes`）；
    3. 检查取消；零长度读取到此直接返回空缓冲，不调用端口；
    4. 预检所覆盖原始扇区的总字节数；
    5. 分配恰好 `length` 字节的输出，按扇区升序分段，每段最多 2,048 个扇区，经 `readSectors` 读取（每段在等待前计量，并在等待前后检查取消），再把裁剪后的用户数据复制进输出。
  - 结果类型为 `Uint8Array<ArrayBuffer>`，是独占的新缓冲；端口视图只在同步复制时使用，不跨 await。
  - [disc-image.ts](../../../../../src/original-data/disc/disc-image.ts)：
    - 句柄新增 `openFile(path)`，自行解析路径；目标是目录时返回 `wrong-entry-kind`；
    - 返回冻结的 `DiscFile { entry, read() }`，与所属镜像共用预算和取消探针；
    - 没有任何 API 接受调用方构造的条目作为读取权限。
- **测试：** [file-range.test.ts](../../../../../src/original-data/disc/file-range.test.ts) 使用按需生成扇区的镜像（每个文件、偏移与扇区的内容都不同）、可挂起请求的端口，以及计数式取消探针。
  - AC-06：
    - 单扇区内、跨扇区边界、末尾不满一个扇区、整文件、最后 1 字节五种范围逐字节一致，读取日志只含覆盖的扇区；
    - 三种零长度读取（含 `offset = byteLength` 与空文件）不调用端口；
    - 结果 `byteOffset` 为 0、覆盖整个 ArrayBuffer，能被 `payloadTransferList` 接受；修改或转移结果后，再次读取不受影响；
    - 同一读取两次结果相同，并重复读取与计量；
    - 6 种非法范围在读取前返回 `invalid-range`；
    - 16,777,216 字节的非对齐读取哈希一致，分段为 2048×4+1 个扇区，并恰好覆盖所需扇区；多 1 字节返回 `limit-exceeded`；同时越界与超限时先报 `invalid-range`；两者都不读取。
  - AC-07（读取部分）：
    - 预算恰好容纳所覆盖原始扇区时通过；少 1 字节时在读取前返回 `budget-exceeded@file:/SMALL.DAT`，observed 按原始字节计算，用量不变；
    - 两段之间取消时，第二段既不发出也不发布结果；
    - 等待最后一段时取消返回 `cancelled`，两段都已计量；
    - 零长度读取同样检查取消；句柄取消后保持取消。
  - AC-08（读取部分）：
    - 坏扇区导致的读取失败保留已发出请求的用量；之后查找失败、读取同一文件的好扇区、读取其他文件都正常；
    - 目录不能打开；伪造的条目对象作为路径时返回 `invalid-path`；已打开文件与条目均冻结。
- **变异检查：** 依次删除预检、把分段缩小到 1,024 个扇区、删除读取前的取消检查、上限偏差 1，每处都有测试失败。检查后已恢复原代码。
- **检查：**
  - `pnpm exec vitest run src/original-data` 451 项通过；typecheck（core/node/app）与 lint 通过；`pnpm check:original` 通过，0 findings。
  - 完整 `pnpm check` 时 load average 达 21–28：typecheck、lint 与其余 2,034 项测试通过；3 项与本改动无关的 `tools/` 子进程用例超时（`tools/compliance/cli.test.ts` 2 项、`tools/engineering-boundaries.test.ts` 1 项）。本子任务未修改 `tools/`，情况同 goal 执行记录中 04 的登记，由最终对齐重新取得完整通过。
- **Rubber-duck：** 未发现阻塞或非阻塞问题；确认了检查顺序、算术安全、裁剪复制、端口缓冲不进入结果，以及诊断位置。
- **Simplify：**
  - 已应用：复用 `source-reader.ts` 导出的 `isCount`；测试改用 P2-01 的 `sha256Fingerprint` 与合成侧尺寸常量。
  - 未采纳：
    - `MAX_RANGE_READ_BYTES` 保持导出，08 的 CLI 按它分段读取；
    - 已打开文件保留 class，与镜像句柄一致，也避免闭包；
    - 每扇区一个视图的开销相对 16 MiB 复制可忽略；
    - `readFileRange` 是模块内部辅助函数，对外读取只经 `openFile`；
    - 不在测试中硬编码哈希值，保持可读。
- **文档影响：** [源码结构](../../../../engineering/source-structure.md)的目录树已加入 `file-range.ts`；职责与导出说明按计划在 07 补充；不涉及命令、原版事实或 U 项。
