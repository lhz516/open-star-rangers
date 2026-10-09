---
type: plan
status: active
phase: P3
task: "03"
subtask: "10"
updated: 2026-10-09
---

# 10 — CRAFT 与 DEBRIS 解析器

**契约来源：** [spec](../spec.md) 的 S-03、S-04、S-15、AC-03、AC-04、AC-14（结构限值）、AC-18；[字段处理规则](../spec.md#字段处理规则) 1–7。
**依赖：** 08。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 在 `original-data/formats/` 中新增解析器，只接收 `ArchiveEntryRead` 形状的已读条目与封包 `DiscPath`，不自行打开文件或封包（沿用 [P2-09 的解析器边界](../../../../engineering/modules/original-data.md#任务数据的定向解析)）：
  - **TABL 4003：** 先检查 18 × 3 的格式规则，再按候选（槽、组）取出一对 {CINF 条目 ID, 倍率}；槽或组越界时为 `subresource-mismatch`。
  - **CINF：** 按 02 的结构，产出 08 的 `craft-info` 内容（`hitDamageScale` 由调用者从 TABL 4003 传入）。首字被改写为序号的规则由记录在数组中的位置表示；记录之间的块内指针转为序号；只在基准中为零的位置出现非零时为 `unsupported-payload`。
  - **DEBRIS TABL 4501：** 20 组 {指针, 数量}，每组为 96 字节记录的数组，嵌套浮点数组转为数组。+0x0C 的存储值不转换；对嵌套数组的载入调整按 02 的结论复现或不执行。
- 沿用 [payload-block.ts](../../../../../src/original-data/formats/payload-block.ts) 的读取规则：指针须在重定位表中登记；先查数量再查边界，不按声明规模分配；浮点须有限。结构超限用 06 的限值名，报 `limit-exceeded`。
- 用代码生成的合成 TABL 4003、CINF 与 DEBRIS 块编写表驱动测试：多行多列的选择、有符号负值、无符号最高位、`f32`、非对齐指针、无序重定位；越界、未登记指针、超限与只在基准中为零的位置非零，都按 code 拒绝。

## 不包含

- 来源映射、CINF ID 与映射的核对，以及转换：归 15。
- payload 类型与读取器：由 08 提供。
- 模块分册：由 22 同步。

## 关键文件与契约

- [payload-block.ts](../../../../../src/original-data/formats/payload-block.ts)、[source-error.ts](../../../../../src/original-data/source-error.ts)（只读）。
- 08 新增的 `src/content/rule-data/` 类型；02 的 `docs/original/formats/craft.md`。
- 计划新增：`src/original-data/formats/craft.ts`、`debris.ts` 与它们的测试和合成支持。

## 写入范围

- `src/original-data/formats/craft.ts`：TABL 4003 与 CINF 解析（新建）。
- `src/original-data/formats/craft.test.ts`：测试（新建）。
- `src/original-data/formats/craft.test-support.ts`：合成 TABL 4003 与 CINF（新建）。
- `src/original-data/formats/debris.ts`：DEBRIS TABL 4501 解析（新建）。
- `src/original-data/formats/debris.test.ts`：测试（新建）。
- `src/original-data/formats/debris.test-support.ts`：合成 DEBRIS 块（新建）。

## 验收标准

- [x] AC-03（解析部分）：多行多列的 TABL 4003 按候选选出一对，槽或组越界时为 `subresource-mismatch`；CINF 的各记录数组按研究结构转换，种类位数组恰为 20 项；负值、无符号最高位与 `f32` 按来源保留；只在基准中为零的位置非零时为 `unsupported-payload`。
- [x] AC-04（解析部分）：20 组记录与嵌套浮点数组转换正确，+0x0C 的存储值不转换；越界与超限按 code 拒绝。
- [x] AC-14：每个结构限值恰等于上限时通过，超出 1 时为 `limit-exceeded`。
- [x] AC-18：诊断只含结构路径，不回显数值；测试不读取文件。
- [x] `pnpm exec vitest run src/original-data/formats tools/engineering-boundaries.test.ts` 与 `pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- Node 表驱动测试，使用代码生成的合成块。不涉及浏览器或原版数据。

## 完成证据

2026-10-09，worker `exec-p3-03-10`，基于认领提交 e058d6f。

- **新增文件（`src/original-data/formats/`）：** `craft.ts`、`debris.ts`，测试 `craft.test.ts`（73 个）、`debris.test.ts`（22 个），合成支持 `craft.test-support.ts`、`debris.test-support.ts`。解析器只接收 `DiscPath` 与已读的 `ArchiveEntryRead`，经 `PayloadBlock` 读取，不打开文件或封包。
- **API（交 15；交 22 写入 original-data 分册）：**
  - `craft.ts`：`parseCraftTable(archive, read, candidate = CLASSIC_P2_SLICE.candidate): CraftTablePair`（`{ craftInfoEntryId, hitDamageScale }`，行 = `campaignSlot`、列 = `campaignGroup`）；`parseCraftInfo(archive, read, hitDamageScale): CraftInfo`（08 的内容类型，倍率由调用者传入）；`CRAFT_TABLE_FORMAT`（`{ rows: 18, pairs: 3, entryBytes: 432 }`）、`CRAFT_INFO_ENTRY_BYTES`（65,536）。共用读取：`Fields`（按偏移读 `atXX` 字段）、`OwnedBytes`（结构字节归属与 `{指针, 有符号数量}` 数组）、`readBoxes`、`readF32`、`readInt32`、`Span`。
  - `debris.ts`：`parseDebrisParameters(archive, read): DebrisParameters`；`DEBRIS_ENTRY_BYTES`（32,768）。
  - 合成支持：`syntheticCraftTable(cell?, rows?, pairs?)`、`craftTableCell`、`syntheticCraftInfoBlock(content)`、`defaultCraftInfo()`、`syntheticDebrisBlock(content)`、`defaultDebrisParameters()`，以及 `BlockWriter`、`expectSourceError`、`resized`。合成块由 08 的规范内容（`rule-data.test-support.ts`）按 craft.md 布局生成，因此“解析结果等于输入内容”即证明数据来自输入；15 可用它们与 `buildImfat` 组成合成封包。
- **字段处理（字段处理规则 1–7）：**
  - **TABL 4003：** 先检查 18 × 3 的格式规则：块恰为 432 字节（更大为 `limit-exceeded`，见 AC-14；更小为 `invalid-payload` `/rows`），没有任何重定位；再取候选的一对。槽 ≥ 18 为 `subresource-mismatch` `/rows[18]`，组 ≥ 3 为 `/rows[1]/pairs[3]`。只读取所选的一对（规则 7）：+0x00 原样返回供 15 核对映射，+0x04 按 `f32` 转换。
  - **CINF：** 头部 4 个数组；机型数不为 20 为 `unsupported-payload` `/craft`（在读数组之前）。数量按有符号比较，最高位为 1 为 `unsupported-payload`（弹体数 int32 同样）。炮、导弹、机型、弹体记录与挂点、box、pair、挂点列表逐字段按 craft.md 的类型转换；首字被改写为序号的规则由位置表示。载入代码覆盖的位置（炮 +0x00/+0x0C/+0x10，导弹 +0x00/+0x08–+0x10/+0x2C/+0x50，机型形状 +0x04，有 box 时形状 +0x00/+0x08–+0x1C）不转换也不检查数值，但其上的重定位仍为 `invalid-payload`；测试在这些位置写入 `0xFFFFFFFF`（`f32` NaN）证明未读取。有 box 的形状 `at00`/`at08` 为 null。
  - **指针：** 导弹 +0x14 → 弹体、挂点 +0x14 → 按 +0x10 选择炮或导弹、挂点 +0x18/+0x1C 与列表项 → 本机型的挂点，目标必须是对应数组元素的起点，否则为 `unsupported-payload`；必填指针为空为 `invalid-payload`；+0x18/+0x1C 为 0 时记为 null。挂点 +0x10 ∉ {0, 1} 为 `unsupported-payload`。
  - **文字：** 字节串（1–255）原样保留，最长 `CRAFT_INFO_LIMITS.nameBytes`（64）字节；块内无 NUL 为 `invalid-payload`，重定位与文字或 NUL 重叠为 `invalid-payload`。空文字可被内容读取器表示，予以接受。
  - **弹体记录：** 不被载入代码改写，除指针与数量外的每个位置都按机型类型转换（含形状 +0x00/+0x04/+0x08–+0x1C）；文字、box、pair、3 张列表与挂点的指针与数量必须为零，否则为 `unsupported-payload`（登记的指针）或 `invalid-payload`（未登记的非零值，指针两步规则）。
  - **数值：** `f32` 须有限（否则 `invalid-payload`），源 −0.0 为 `unsupported-payload`（规范 JSON 无 −0）；int32 只转换 0…2³¹−1；只在基准中为零的字节（炮 +0x29–+0x2B，导弹 +0x19–+0x1B、+0x25–+0x27，挂点 +0x11–+0x13）非零为 `unsupported-payload`，路径为 `/at29` 等。
  - **DEBRIS：** 160 字节头部的 20 组 {指针, 有符号数量}；96 字节记录转换 +0x00–+0x08、+0x38/+0x3C 的 box、+0x40、+0x44–+0x58；+0x0C–+0x34 与 +0x5C 不转换（测试同样写入 NaN 模式）。+0x00–+0x08 的取反与 box 的加宽是消费者变换，不执行，存储值原样保留。
  - **结构不共享字节（审阅后新增）：** 头部、各数组与文字（含 NUL）各自占有其字节，两个结构重叠为 `unsupported-payload`，位置为后读到的结构。原因：载入代码就地改写记录（序号、派生字段、DEBRIS 取反与 box 加宽、炮挂点 +0x08），共享的字节不会保持转换所读的值；craft §3.1、§4.2 记录基准的图恰好覆盖每个字节一次，基准不受影响。只命名数组元素的指针（弹体、武器、挂点链与列表）不占有字节。
- **AC-03 / AC-04：** `craft.test.ts` 用 18 × 3 的合成表核对 7 组（槽, 组）各选出对应的一对，默认候选为（槽 1, 组 0）；条目 ID 最高位、次正规数倍率、负倍率与 +0 原样保留，未选中的格写入 NaN 也不影响。CINF 默认内容含交叉的弹体引用、两种武器的挂点、挂点链、3 张列表、有无 box 的形状、非零弹体形状、0x80–0xFF 字节与 64 字节名称，解析结果与输入内容深度相等、深度冻结，并能被 `readCraftInfo` 原样读取；第二份不同的合成内容得到相应的不同结果。`debris.test.ts` 核对 20 组（含空的种类 13、14）、两个 box 的记录、未取反的向量与未加宽的 box。拒绝用例各自核对 code 与位置，CINF 51 个、TABL 4003 8 个（含槽与组越界）、DEBRIS 17 个，限值用例另计：头部过短、机型数 19/21、负数量、数组越界、空指针带数量、指针带 0 个元素、数组与头部重叠、未登记指针、值字段或被覆盖位置上的重定位、文字内重定位、文字无 NUL、指针不在元素起点（弹体、武器的两种方向、跨机型挂点链与列表项）、+0x10 为 2、负 box 与列表数量、各零字节、int32 最高位、−0、NaN、无穷大、弹体的数量与指针、结构重叠（文字内的文字、导弹数组覆盖炮数组、两机型共用 box 数组、pair 数组位于炮记录内、挂点数组覆盖头部、两种类共用记录数组、两记录共用 box 数组、box 数组位于记录内）。
- **AC-14（结构限值）：** 每项恰等于上限时解析通过且结果等于输入，多 1 时为 `limit-exceeded`，带限值名、上限与观测值，并在读取元素之前判定（声明 0x7FFFFFFF 个元素的小块同样报 `limit-exceeded`，不按声明规模分配）。

  | 结构 | 上限 | 来源 | 限值名 |
  |---|---:|---|---|
  | TABL 4003 条目 | 432 | 格式规则 18 × 3 × 8（固定大小，不是可调上限） | `payloadEntryBytes` |
  | CINF 条目 | 65,536 | CINF 4037 的 18,619 字节 × 2，向上取 2 的幂（craft §3.9；24 个 CINF 的最大值 19,491 得出同一值） | `payloadEntryBytes` |
  | DEBRIS TABL 4501 条目 | 32,768 | 8,200 字节 × 2，向上取 2 的幂（craft §1） | `payloadEntryBytes` |
  | 炮 / 导弹 / 弹体 / 每机型挂点 / box / 每张列表 / pair | 32 / 32 / 32 / 32 / 64 / 8 / 8 | 08 的 `CRAFT_INFO_LIMITS` | `payloadItems` |
  | 文字字节 | 64 | 08 的 `CRAFT_INFO_LIMITS.nameBytes` | `textBytes` |
  | 每种类位的 DEBRIS 记录 / 每记录 box | 16 / 2 | 08 的 `DEBRIS_PARAMETERS_LIMITS` | `payloadItems` |

  20 个种类位与 TABL 4003 的 18 × 3 是格式规则，少或多都拒绝。测试以公式由观测值重算两个条目上限。
- **AC-18：** 诊断位置为 `archive:/MAIN/<文件>#<ID>` 后接结构路径（`/craft[5]/mountLists[1]/entries[2]` 等），原因是固定文字；`expectSourceError` 对每个拒绝用例核对位置属于 `inLocationGrammar` 的闭合语法，且诊断与消息不含合成文字中的 `MARKER`。合成块全部由代码生成，数值为任意合成值；新文件中没有 `node:fs`、`readFile` 或 `local/` 的引用。`tools/engineering-boundaries.test.ts` 通过。
- **变异核对：** 分别去掉以下检查，测试都会失败：−0（7 个失败）、零字节（5）、int32 最高位（6）、元素起点（7）、弹体数量（2）与指针（1）、文字内重定位（1）、炮记录的重定位范围（1）、有 box 时形状为 null（31）、有符号数量（6）、+0x10 值域（1）、TABL 大小（2）与重定位（1）、挂点链解析（12）、结构重叠（8）。
- **检查：**
  - `pnpm exec vitest run src/original-data/formats tools/engineering-boundaries.test.ts`：8 个文件、445 个测试通过；
  - `pnpm typecheck`、`pnpm lint` 通过；
  - `pnpm check`：类型检查、ESLint、166 个文件 5,177 个测试与生产构建通过。
- **Rubber-duck：** 一项发现：解析器没有核对图的完整性，可能接受共享或重叠的结构、指向另一文字中间的指针、末尾的多余字节或孤立的重定位。处置：
  - **采纳（重叠）：** 新增 `OwnedBytes`，结构共享字节为 `unsupported-payload`（见上），加 8 个拒绝用例。
  - **未采纳（覆盖完整性）：** 不要求每个字节与每个重定位都属于某个结构。契约沿用 P2-09 的读取规则（登记、边界、先查数量；重定位只能位于所读结构的指针字段），P2-09 的 SCEN 解析同样不检查覆盖；不可达的字节原版也从不读取，忽略它们与原版一致。craft §3.1、§4.2 的“恰好覆盖”是研究观测，不是契约要求。
- **Simplify：** 4 个角度。
  - **采纳：** 挂点列表直接构造为三元组，去掉 `as unknown as`；`BOX_BYTES`、`DEBRIS_RECORD_BYTES` 不再导出；测试的 `resized` 移入 `craft.test-support.ts` 共用；`syntheticCraftTable` 的默认行列取 `CRAFT_TABLE_FORMAT`；测试中的格表改为 `Map<string, CraftTableCell>`，去掉断言。
  - **未采纳：** −0 检查的二次读取（短路求值，只在值为 0 时读取）；数组数量的二次读取（每个数组一次，可忽略）；把 `Fields`、`OwnedBytes`、`readBoxes` 与 `BlockWriter` 移到中立模块，或在 `payload-block.ts` 中提供保留 −0 的读取（都在写入范围之外；box 与碰撞形状本是 craft.md §3.5.1、§3.6 中两种条目共用的结构）；测试用 `entryLocation` 生成位置（测试保持独立的预期）；`Source` 中 `block` 与 `owned.block` 的重复（只是参数打包）。
- **文档影响：** 写入范围只有上述 6 个文件与本文件。格式文档已记录全部结构事实与观测值（craft §1、§3.9、§4.2），U 项不变；命令与工程约定不变；STATUS 与阶段索引无须改动。交 22：original-data 分册新增“CRAFT 与 DEBRIS 的定向解析”一节，内容为上面的 API、字段处理、结构不共享字节的规则与限值表；`source-error.ts` 的限值名注释已涵盖这些结构，不需改动。
