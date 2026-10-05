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

- [ ] AC-01（按需部分）：共用样本表中的每条，在按需打开时都得到期望的目录或首个错误；条目数 4,097 时读取日志中没有目录读取。
- [ ] AC-02：
  - 读取条目得到与合成数据逐字节相同的独占块字节，能被 `payloadTransferList` 接受，重定位位置按表顺序排列；
  - ID 不存在、类型不符、参数非法，分别返回 `entry-not-found`、`entry-type-mismatch`、`invalid-request`；
  - **读取日志：** 打开只读取文件头与目录范围，读取条目只读取该条目的块与重定位表范围；同一条目读取两次结果相同，并读取两次；
  - **预算与取消：** 打开与读取时，`sourceReadBytes` 恰差 1 字节、操作前已取消、等待最后一次读取期间取消，都以 P2-02 的 code 失败，用量符合 P2-02 计量规则，不发布部分结果。
- [ ] AC-03：内存解析与按需读取对共用样本表的每条，给出相同的目录项、重定位与首个错误（code 与位置相同，只差路径前缀）。
- [ ] AC-10（读取部分）：光盘层错误以同一 `DiscReadError` 实例传递；修改或转移返回的字节不影响后续读取；DTO 不含块字节或宿主名。
- [ ] `pnpm exec vitest run src/original-data`、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- 用新增的合成多文件光盘与记录读取的端口做 Node 测试，按扇区断言读取范围；用可控 Promise 端口复现等待期间取消。
- 不适用 browser-testing；基准盘全量读取由 09 完成。

## 完成证据
