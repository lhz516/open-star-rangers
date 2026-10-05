---
type: plan
status: active
phase: P2
task: "03"
subtask: "03"
updated: 2026-10-05
---

# 03 — 按需封包读取

**契约来源：** [spec](../spec.md) 的 S-01、S-02、S-03、S-09、S-10、S-12；[数据模型与契约](../spec.md#数据模型与契约)、[读取、所有权与生命周期](../spec.md#读取所有权与生命周期)、[限值与预算](../spec.md#限值与预算)；AC-01（按需部分）、AC-02、AC-03、AC-10。
**依赖：** 02。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **底层打开函数：** 在任意 P2-02 `DiscFile` 上打开封包，读取次序如下：
  - 先读取 24 字节文件头并按 02 的规则校验；条目数超限时，在读取目录前返回 `limit-exceeded`；
  - 再用一次范围读取取得整个目录并校验；
  - 返回冻结的句柄：`path`、按 ID 升序的冻结目录项、`entry(id, type?)`、`read(id, type?)`。
- **查找：**
  - ID 不是 u32、期望类型不符合标签语法时，返回 `invalid-request`（位置为 `request.id`/`request.type`）；
  - ID 不存在返回 `entry-not-found`，类型不符返回 `entry-type-mismatch`，位置为 `archive:/路径#ID`。
- **读取条目：**
  - 用一次范围读取取得“数据块加重定位表”，再按 02 的规则校验重定位；
  - 返回 `{ entry, bytes, relocations }`：`bytes` 恰为数据块，是独占的新缓冲；`relocations` 为按表顺序的冻结数组；
  - 不缓存字节，重复读取会重新读取并重新计量。
- **错误与资源：**
  - P2-02 的 `DiscReadError`（坏扇区、预算、取消、端口失败）以同一实例传递；
  - 任何失败都不发布部分目录或字节；
  - 预算与取消完全沿用所属镜像句柄，本模块不另设计量或取消探针。
- **合成光盘：** 在 [disc.test-support.ts](../../../../../src/original-data/disc/disc.test-support.ts) 中新增 helper，可按光盘路径放置多个文件（自动生成 ISO9660 目录、记录与 extent），文件内容既可以是字节，也可以按需生成，以便表示生产大小的文件；05、06、08 复用该 helper。

## 不包含

- 只允许覆盖路径的已验证来源句柄与产品入口（05）；限制底层打开函数使用者的边界规则（07）。
- 格式规则本身（02）。

## 关键文件与契约

- **计划新增：** `src/original-data/archive/archive-reader.ts` 与 `archive-reader.test.ts`。
- **复用：**
  - 02 的规则模块、错误类与共用样本表；
  - [disc-image.ts](../../../../../src/original-data/disc/disc-image.ts) 的 `DiscFile`（纯类型）；
  - [ownership.ts](../../../../../src/content/ownership.ts) 的 `exclusiveBytes`、`payloadTransferList`。
- **修改：** [disc.test-support.ts](../../../../../src/original-data/disc/disc.test-support.ts)，以及必要时修改 [synthetic.ts](../../../../../src/original-data/synthetic.ts)。
- **文档：** [源码结构](../../../../engineering/source-structure.md)中的封包读取说明（API、读取次序、不缓存）。

## 验收标准

- [x] AC-01（按需部分）：共用样本表中的每条，在按需打开时都得到期望的目录或首个错误；条目数 4,097 时读取日志中没有目录读取。
- [x] AC-02：
  - 读取条目得到与合成数据逐字节相同的独占块字节，能被 `payloadTransferList` 接受，重定位位置按表顺序排列；
  - ID 不存在、类型不符、参数非法，分别返回 `entry-not-found`、`entry-type-mismatch`、`invalid-request`；
  - **读取日志：** 打开只读取文件头与目录范围，读取条目只读取该条目的块与重定位表范围；同一条目读取两次结果相同，并读取两次；
  - **预算与取消：** 打开与读取时，`sourceReadBytes` 恰差 1 字节、操作前已取消、等待最后一次读取期间取消，都以 P2-02 的 code 失败，用量符合 P2-02 计量规则，不发布部分结果。
- [x] AC-03：内存解析与按需读取对共用样本表的每条，给出相同的目录项、重定位与首个错误（code 与位置相同，只差路径前缀）。
- [x] AC-10（读取部分）：光盘层错误以同一 `DiscReadError` 实例传递；修改或转移返回的字节不影响后续读取；DTO 不含块字节或宿主名。
- [x] `pnpm exec vitest run src/original-data`、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- 用新增的合成多文件光盘与记录读取的端口做 Node 测试，按扇区断言读取范围；用可控 Promise 端口复现等待期间取消。
- 不适用 browser-testing；基准盘全量读取由 09 完成。

## 完成证据

- **实现：** [archive-reader.ts](../../../../../src/original-data/archive/archive-reader.ts) 的 `openImfatArchive(file)`：
  - **打开：** 先读 24 字节文件头（文件不足 24 字节时不读取）；条目数超限时，在读取目录前拒绝；再用一次范围读取取得目录。
  - **句柄：** 冻结，提供同步的 `entry(id, type?)` 与异步的 `read(id, type?)`。参数非法返回 `invalid-request`（`request.id`/`request.type`），不存在返回 `entry-not-found`，类型不符返回 `entry-type-mismatch`。
  - **读取：** 一次范围读取取得块与重定位表，校验后返回冻结的 `{ entry, bytes, relocations }`。没有重定位时直接返回光盘层的独占缓冲，有重定位时用 `exclusiveBytes` 复制数据块。
  - 不缓存字节，`DiscReadError` 不经包装直接传递。
- **测试辅助：** [disc.test-support.ts](../../../../../src/original-data/disc/disc.test-support.ts) 新增：
  - `syntheticFileDisc`：按路径放置文件，内容可以是字节或按范围生成；可插入间隔扇区、倒序放置、指定 `.ccd` 行尾或修改原始扇区。它与 `syntheticDisc` 共用文件组装配；
  - `rangeLbas`：空范围返回空数组。
- **测试：** [archive-reader.test.ts](../../../../../src/original-data/archive/archive-reader.test.ts) 覆盖：
  - **一致性：** 共用样本表的每一条在按需读取时与内存解析给出相同的目录、重定位、数据块（以摘要比较）与首个错误（code 与位置相同，只差路径前缀）；
  - **读取日志：** 包装 `DiscFile` 记录精确的 `(offset, length)`，打开只有 `[0,24]` 与目录范围，读取条目只有该条目的块加重定位表，读两次就请求两次；同时核对扇区；
  - **条目数上限：** 只读取文件头；
  - **查找：** 不发生任何读取；
  - **所有权：** 结果冻结，字节独占，可交给 `payloadTransferList` 并转移；修改或转移后再读，结果不变；
  - **错误传递：** 坏扇区返回 `invalid-sector`；注入的 `DiscReadError` 在打开与读取时都以同一实例传递；
  - **预算：** 恰好用尽时通过，少 1 字节时在打开与读取中返回 `budget-exceeded`，用量不变；
  - **取消：** 操作前取消时不发出请求；打开与读取的最后一次端口请求挂起期间取消，返回 `cancelled`，已发出的请求全部计量，后续调用保持取消且不再发出请求。
- **变异检查：** 返回非独占的子视图、跳过类型核对，都会使测试失败。
- **检查：**
  - `pnpm exec vitest run src/original-data`：14 个文件、578 个测试通过；
  - `pnpm check`：81 个测试文件 2,222 个测试与构建通过。
- **Rubber-duck：** 采纳四项：用精确的读取调用代替只看扇区（基准样本都在同一扇区内）；用真正挂起的端口请求测试取消，并核对计量；断言同一个 `DiscReadError` 实例；`rangeLbas` 处理空范围。
- **Simplify：**
  - 采纳：复用 `requestedLbas` 与 `rejection`；改用一次性的 `reached` 承诺取代轮询；`syntheticDisc` 与 `syntheticFileDisc` 共用文件组装配；生成内容改为按范围读取，避免逐字节回调。
  - 未采纳：用线性查找替代 ID 映射（转换任务会多次查找）；把块与重定位表分两次读取（会增加端口请求）。
- **文档影响：** 更新[源码结构](../../../../engineering/source-structure.md#封包读取)：目录树、按需读取 API、底层能力说明与 `syntheticFileDisc`。工程约定与工具指南无受影响内容。

