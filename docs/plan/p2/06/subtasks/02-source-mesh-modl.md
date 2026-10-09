---
type: plan
status: active
phase: P2
task: "06"
subtask: "02"
updated: 2026-10-08
---

# 02 — MESH/MODL 源结构读取加固

**契约来源：** [spec](../spec.md) 的 S-03、S-08（源结构部分），[行为与边界](../spec.md#行为与边界)的 MESH/MODL 行，[限值与预算](../spec.md#限值与预算)的结构限值与格式规则，[错误码](../spec.md#错误码)的 `source` 层；AC-03、AC-04，AC-12 的工具部分。
**依赖：** 01。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **MESH 读取（计划新增 `src/original-data/formats/mesh.ts`）：** `readMesh(block, path)` 返回位置、UV、法线、着色槽数、三角形索引与角点着色槽，全部为调用者独占的新缓冲。检查顺序：
  1. 头部：结构指针为 12，结构长度等于块长 − 12，保留字为 0；
  2. 只读取顶点数与三角形数，即按 `MODEL_LIMITS` 检查：为 0 或超过 4,096 时报 `limit-exceeded`（`meshVertices`、`meshTriangles`），之后才分配；
  3. 着色槽数为 1 至 3 × 三角形数，否则为 `invalid-payload`；
  4. 每个三角形角数恰为 3，顶点与着色槽索引在范围内；位置、UV 与法线全部有限；
  5. 尾字为 0，没有截断或尾随字节。

  另提供只读取计数的头部函数，供 03 在分配之前扣除 `vertices` 与 `triangles`。
- **MODL 读取（计划新增 `src/original-data/formats/modl.ts`）：** `readModel(block, path)` 返回三个部件列表（标志字、颜色、MESH 条目号、TEX 条目号或 0）与五个 SND 条目号（0 为空）。检查顺序：
  1. 列表指针与计数在块内；
  2. 部件总数为 1–256，否则报 `limit-exceeded`（`modelParts`）；
  3. 块长等于 44 + 28 × 部件总数；
  4. 部件保留字段为 0，颜色分量不大于 255。

  这几项不符时为 `invalid-payload`（第 2 项除外）。
- **位置：** 两个读取函数都以调用者给出的 `path` 为失败位置，不附加条目编号或偏移；03 传入 `models[<Asset ID>].model` 或 `….parts[<l>][<p>].mesh`。
- **错误：** [source-error.ts](../../../../../src/original-data/source-error.ts) 的 `SourceLimitName` 追加 `meshVertices`、`meshTriangles`、`modelParts`，已有 code 与限值的含义不变。同步 [import-protocol.test.ts](../../../../../src/workers/import-protocol.test.ts) 中类型完整的限值名记录。
- **移除旧解析器：** [payloads.ts](../../../../../src/original-data/payloads.ts) 删除 `parseMesh`、`parseModel` 及其类型与测试，只保留 ID 列表与 `PayloadError`。合成构造器移入 [synthetic.ts](../../../../../src/original-data/synthetic.test-support.ts)，计划新增 `syntheticMesh`、`syntheticModel`。
- **nob-check：** [nob-check.ts](../../../../../tools/nob-check.ts) 改用这两个读取函数，以条目为单位的位置只用于本地输出；计数与交叉引用核对不变，输出仍只有计数与失败原因。
- **测试：** 计划新增 `formats/mesh.test.ts`、`formats/modl.test.ts`，覆盖 AC-03、AC-04 的全部输入；nob-check 的现有测试继续通过。
- **文档：** [源码结构](../../../../engineering/source-structure.md)的原版格式读取一节与目录树；[mesh](../../../../original/formats/mesh.md) 开头的解析器链接改为新的读取函数（只改指针，不改格式事实）；nob-check 的输出若有变化，同步[工具指南](../../../../guides/tools.md#封包结构核对)。

## 不包含

- 转换、扣除与 `models[…]` 位置的组装（03）；按 MODL 读取 MESH 条目（05）。
- 全量本地核对与观察最大值的记录（10）。

## 关键文件与契约

- 计划新增 `src/original-data/formats/mesh.ts`、`modl.ts` 及测试。
- 修改 [payloads.ts](../../../../../src/original-data/payloads.ts)、[payloads.test.ts](../../../../../src/original-data/payloads.test.ts)、[synthetic.ts](../../../../../src/original-data/synthetic.test-support.ts)、[source-error.ts](../../../../../src/original-data/source-error.ts)、[nob-check.ts](../../../../../tools/nob-check.ts)、[import-protocol.test.ts](../../../../../src/workers/import-protocol.test.ts)。
- 复用 01 的 `MODEL_LIMITS` 与 [payload-block.ts](../../../../../src/original-data/formats/payload-block.ts) 的块读取（适用处）。`formats/` 只处理已读入的块，不打开封包。

## 验收标准

- [x] AC-03：合成网格（顶点数 3、三角形数 1，以及含有未用顶点的样本）读出的位置、UV、法线、索引与着色槽与输入逐位相等，输出不与源块共用缓冲。以下输入报 `invalid-payload`：结构指针不为 12、长度字段不符、保留字或尾字不为 0、角数为 4、顶点或着色槽索引越界、着色槽数大于角点数、截断、尾随字节、任一浮点为 NaN 或无穷。
- [x] AC-03：顶点数或三角形数为 0 或 4,097 报 `limit-exceeded`，限值名与 `observed` 正确；声明 0xFFFFFFFF 个顶点的网格只读取计数即被拒绝，不出现宿主 `RangeError`。
- [x] AC-04：合成 MODL 读出的三个列表、部件字段与五个音效槽与输入相等。列表指针或计数越出块、块长不等于 44 + 28 × 部件总数、部件保留字段不为 0、颜色分量为 256 报 `invalid-payload`；部件总数为 0 或 257 报 `limit-exceeded`（`modelParts`）。`payloads.ts` 不再导出 `parseMesh` 与 `parseModel`。
- [x] 失败位置恰为调用者给出的 `path`，不含条目编号；原因文字为可打印 ASCII。
- [x] `pnpm exec vitest run src/original-data tools`、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- Node 表驱动测试，用 `expectSourceError` 断言 code、位置与限值；用源码搜索确认旧解析器已删除。
- 不适用 browser-testing；本地全量核对见 10。
- 完成前按 execute-goal 流程，以本子任务 diff 为范围做 rubber-duck 审查与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据

- **实现：** [mesh.ts](../../../../../src/original-data/formats/mesh.ts) 的 `readMeshCounts` 与 `readMesh`，以及 [modl.ts](../../../../../src/original-data/formats/modl.ts) 的 `readModel`，都只接收已读入的块，失败位置恰为调用者给出的 `path`。沿用 P2-05 源读取的做法，不经 `PayloadBlock`：后者的位置带 `archive:/…#ID`，且会把 −0 规范化。`readMesh` 返回 01 的 `ModelGeometry`（新缓冲，浮点按位保留）；`readModel` 返回 `{ partLists, soundEntries }`，条目号不在这里解析。[source-error.ts](../../../../../src/original-data/source-error.ts) 追加限值名 `meshVertices`、`meshTriangles`、`modelParts`，[import-protocol.test.ts](../../../../../src/workers/import-protocol.test.ts) 的类型完整记录同步。[payloads.ts](../../../../../src/original-data/payloads.ts) 删除 `parseMesh`、`parseModel` 及其类型，只剩 `parseIdList` 与 `PayloadError`。[synthetic.ts](../../../../../src/original-data/synthetic.test-support.ts) 新增 `syntheticMesh` 与 `syntheticModl`，按类型标签命名，同 `syntheticSnd`，避免与 01 的 `syntheticModel` 同名。[nob-check.ts](../../../../../tools/nob-check.ts) 改用新的读取函数，位置为 `mesh`、`model`。
- **格式规则的补充：** 本地探查（`local/research/p2-06/modl-pointers.ts`，只输出计数）显示，19 个 MODL 的三个列表都按列表顺序紧接头部连续存放，6 个空列表的指针都为 0；全部部件的 +16 字段与 486 个 MESH 的 0x08 字段都为 0。`readModel` 据此要求列表连续、空列表指针为 0，从而每个部件恰好读取一次。这一事实已以“已确认”记入 [mesh §2](../../../../original/formats/mesh.md#2-modl-structure-confirmed-on-all-19-entries)。这比 spec 逐条列出的拒绝项更严格，但不改变契约：它仍属于 S-03 的“指针与长度”校验，AC-12 的全量核对也覆盖它。
- **AC-03：** [mesh.test.ts](../../../../../src/original-data/formats/mesh.test.ts) 覆盖以下读取结果：
  - 3 个顶点、1 个三角形的网格：位置含 −0、最小与最大次正规数、最大有限值，读出后按位相等；
  - 4 个顶点（1 个未用）、2 个三角形的网格：顶点、索引与角点着色槽按存储顺序读出；
  - 4,096 个顶点与 4,096 个三角形的网格可以读取；
  - 输出的 5 个数组各占新缓冲，不与块共用。

  以下 16 种输入都报 `invalid-payload`，每个用例都断言预期的原因文字：头部截断、结构指针 16、长度字段不符、保留字非 0、块截在顶点中间、缺少最后一个面、尾随 4 字节、着色槽数为 0 或超过角点数、NaN 位置、无穷 UV、负无穷法线、角数 4、顶点索引等于顶点数、着色槽等于槽数、尾字非 0。

  顶点数与三角形数为 0 或 4,097，以及顶点数为 0xFFFFFFFF，都由 `readMeshCounts` 与 `readMesh` 只读取计数即报 `limit-exceeded`，限值名、`limit` 与 `observed` 都正确，没有宿主 `RangeError`。
- **AC-04：** [modl.test.ts](../../../../../src/original-data/formats/modl.test.ts) 读出三个列表、全部部件字段（含 0xFFFFFFFF 的标志字与颜色 255、252）与五个音效槽，结果冻结；只有列表 1 的模型与 256 个部件的模型都可以读取。以下 10 种输入都报 `invalid-payload`：头部截断、列表指针越过前面的部件、指向头部或与前一列表重叠、空列表带指针、计数越出块（含 0xFFFFFFFF）、块长不等于 44 + 28 × 部件数、保留字段非 0、颜色分量 256。部件总数为 0 或 257 时报 `limit-exceeded`，限值名为 `modelParts`，`observed` 正确。[payloads.test.ts](../../../../../src/original-data/payloads.test.ts) 断言该模块只导出 `PayloadError` 与 `parseIdList`；源码搜索中 `src` 与 `tools` 已没有 `parseMesh` 与 `parseModel`。
- **位置与原因：** 两个读取函数的全部失败都以调用者给出的 `path` 为位置；测试经共享的 `expectSourceError` 断言原因为 1–512 个可打印 ASCII 字符，并逐个核对原因原文（该辅助函数新增可选的 `reason` 参数）。
- **工具：** 用本地 SR.NOB 运行 `node tools/nob-check.ts local/StarRang/SRANGERS/MAIN/SR.NOB`：MESH 486 通过、0 失败，MODL 19 通过、0 失败，总计 13,166 个顶点、13,285 个三角形，与改用新读取之前相同；输出只有计数与失败原因。全量核对与观察最大值的记录归 10。
- **检查：** `pnpm exec vitest run src/original-data tools` 通过（51 个文件、1,311 项）；`pnpm typecheck`、`pnpm lint` 通过；`pnpm check` 通过（126 个文件、3,766 项，生产构建成功）。
- **rubber-duck：** 没有发现问题。审查确认：拒绝用例都命中预期条件；计数先于分配；检查顺序与本文一致；输出满足 `ModelGeometry` 的规则；nob-check 只输出计数与 code；文档准确；连续列表的规则有依据且已入档。
- **simplify：** 采纳：
  - `syntheticMesh` 改为直接写入预先确定大小的缓冲，不再把最多 12,288 个值展开为函数参数；
  - `readModel` 只保留各列表的计数，用一个游标读取全部部件；
  - `meshBlockLength` 改为私有；
  - 两份测试改用共享的 `set32` 与 `expectSourceError`，后者新增可选的 `reason` 参数。

  未采纳：
  - 让 `readMesh` 复用已经读出的计数：重复的头部检查开销固定且很小，保留它可以让 `readMesh` 单独调用时仍自我校验；
  - 改写 `ByteWriter.f32` 的逐字节写入：属于本子任务以外的既有代码。
- **文档影响：** 已更新：
  - [源码结构](../../../../engineering/modules/original-data.md#原版格式转换)：目录树与“MESH 与 MODL”说明，`payloads.ts` 的职责，测试数据构造器；
  - [mesh](../../../../original/formats/mesh.md)：读取函数的链接，以及列表连续存放与保留字段为 0 的已确认事实；
  - [工具指南](../../../../guides/tools.md#封包结构核对)：nob-check 的模型核对与失败文字。

  工程约定无需改动：没有新命令或新规则。
