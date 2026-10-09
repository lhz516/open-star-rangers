---
type: plan
status: active
phase: P3
task: "03"
subtask: "11"
updated: 2026-10-09
---

# 11 — AI 数据解析器

**契约来源：** [spec](../spec.md) 的 S-05、S-15、AC-05、AC-14（结构限值）、AC-18；[字段处理规则](../spec.md#字段处理规则) 1–7（尤其 4 的代码标识）。
**依赖：** 08。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 在 `original-data/formats/` 中新增 AISTUFF 解析器，只接收已读条目、EXE 区域字节与 `DiscPath`：
  - **AICO 6001：** 读取 {指针, 数量} 并只取组 0 的三元组；组越界时为 `subresource-mismatch`。
  - **TABL 6003：** 读取 0x54 字节的程序记录，直到首字为零。按 03 确定的位置收集 ID 链：+0x1C 所指的条目、该条目 +0x38 所指的条目与 6 个 ID 列表，得到所需条目 ID 的集合。
  - **条目解析：** 给定 ID 集合中每个条目的已读字节，按 03 的结构解析 TABL 与 DFPG，并把条目 ID 转为 `entries` 的序号。
  - **EXE 内置表：** 读取 10 条 0x54 字节的记录，把代码指针转为 LE 对象与对象内偏移的不透明标识。
  - 产出 08 的 `ai-programs` 内容。
- 返回所需条目 ID 的集合，供 15 与映射部件核对（多出或缺少为 `subresource-mismatch`）。解析器本身不打开封包。
- 沿用 payload-block 的指针、数量与边界规则；结构超限用 06 的限值名。
- 用代码生成的合成 AICO、程序表、引用条目与 EXE 区域编写表驱动测试，覆盖：首字为零的终止、ID 链与序号、代码标识、组 0 三元组的选择；越界、未登记指针、超限、只在基准中为零的位置非零、ID 集合与给定条目不一致的拒绝。

## 不包含

- 来源映射与转换：归 15。
- AI 程序的解释：归 P3-08。
- 模块分册：由 22 同步。

## 关键文件与契约

- [payload-block.ts](../../../../../src/original-data/formats/payload-block.ts)、[le-executable.ts](../../../../../src/original-data/formats/le-executable.ts)（只读）。
- 08 新增的 `src/content/rule-data/` 类型；03 的 `docs/original/formats/ai.md`。
- 计划新增：`src/original-data/formats/ai.ts` 与其测试和合成支持。

## 写入范围

- `src/original-data/formats/ai.ts`：AISTUFF 与内置表解析（新建）。
- `src/original-data/formats/ai.test.ts`：测试（新建）。
- `src/original-data/formats/ai.test-support.ts`：合成 AISTUFF 块与 EXE 区域（新建）。
- `src/original-data/formats/le-executable.ts`：读取内置表区域时解码其 LE fixup（派发时扩大，见 goal 执行记录中 03 的交接）。
- `src/original-data/formats/le-executable.test.ts`：对应测试。

## 验收标准

- [x] AC-05（解析部分）：程序表到首字为零为止；+0x1C 所指条目、该条目 +0x38 所指条目与 6 个 ID 列表转为 `entries` 序号；代码指针为不透明标识；只取 AICO 组 0 的三元组。
- [x] 返回的 ID 集合正确；给定的条目多出或缺少时为 `subresource-mismatch`；越界与超限按 code 拒绝。
- [x] AC-14：每个结构限值恰等于上限时通过，超出 1 时为 `limit-exceeded`。
- [x] AC-18：诊断不回显数值；测试不读取文件。
- [x] `pnpm exec vitest run src/original-data/formats tools/engineering-boundaries.test.ts` 与 `pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- Node 表驱动测试，使用代码生成的合成数据。不涉及浏览器或原版数据。

## 完成证据

2026-10-09，worker `exec-p3-03-11`，基于认领提交 58eedf6。

- **文件：**
  - `src/original-data/formats/le-executable.ts`：新增 `readFixedUpRegion`，把 fixup 记录的解析扩展为同时解出内部目标；`readRegion` 的行为不变。
  - `src/original-data/formats/ai.ts`（新建）：AICO 6001、程序表、DFPG、脚本 TABL 与 EXE 内置表的解析。
  - 测试：`ai.test.ts`（新建，88 个）、`le-executable.test.ts`（新增 12 个，共 52 个）；合成支持 `ai.test-support.ts`（新建）。
- **API（交 15、22）：**
  - `le-executable.ts`：`LeExecutable.readFixedUpRegion(region, path): Promise<FixedUpRegion>`，类型 `FixedUpRegion { bytes, fixups }`、`RegionFixup { at, object, offset }`、`ObjectPosition`。`bytes` 为文件中未修补的字节；每个修补区域的 fixup 必须是非累加、指向文件内对象位置的内部 32 位偏移（源类型 7），完整位于区域内且互不重叠，否则为 `invalid-payload`。跨页 fixup 在两页各记一次（或只记一次）时合为一个；同页重复、第三次记录或两次目标不同都拒绝。区域长度限值、对象与存储页的检查同 `readRegion`。
  - `ai.ts`：`parseAiPrograms(archive, sources, group): ParsedAiPrograms`，其中 `AiProgramSources` 为 `{ globals: AICO 6001, table: 所选组的程序表, entries: ID 链所指条目（顺序任意）, builtIn: readFixedUpRegion 的结果加 location, builtInNames: AiRegionRead[] }`，`AiRegionRead` 为 `{ region, bytes, location }`；结果 `ParsedAiPrograms` 为 `{ content: AiPrograms, entryIds }`。另导出 `AI_LAYOUT` 与 `AI_SOURCE_LIMITS`。
  - 合成支持（供 15 复用）：`syntheticAiSources(content?, { triples, group })`、`aiSources()`、`aiContent()`、`syntheticBuiltIn()`、`syntheticBuiltInExecutable()`、`SYNTHETIC_AI_IDS`、`BUILT_IN_LOCATION`、`nameLocation()`。
- **解析规则（字段处理规则 1–8，结构见 ai.md §2–§6）：**
  - **AICO：** 只取 `group` 的三元组（规则 7），其余三元组不读；头部 +0x08…+0x48 与 16 字节元素全部导入。两个数量字没有读取者，因此要求布局恰好成立：三元组紧随 0x4C 字节的头部，元素紧随三元组并恰到块尾，否则为 `unsupported-payload`。组越界为 `subresource-mismatch`，位置为 `/groupTriples[组]`。头部只允许 +0x00、+0x18 有重定位。
  - **程序表：** 以首字为零且未重定位的记录为终止记录（其余 80 字节须为零，否则 `unsupported-payload`）；每条记录只允许 +0x00 有重定位；名称须从终止记录之后按记录顺序首尾相接并恰到块尾（规则 4，起点不符或块尾有余为 `unsupported-payload`）。+0x08 的 0 与 +0x2C 的 ±0 记为 null（规则 3）；+0x18、+0x20 被载入代码覆盖，不读取（规则 5）。
  - **DFPG：** +0x00 非零为 `unsupported-payload`（规则 6）；+0x0C 不读取（规则 5）；+0x38 的 0 为 null；6 个列表按偏移顺序紧随 0x6C 字节的头部并恰到块尾，起点不符（包括指向头部或前一列表）为 `unsupported-payload`。
  - **脚本：** 项读到操作码 10000 为止并保留终止项；+0x08…+0x13 的运行时字须为零（`unsupported-payload`）；只允许 +0x04、+0x14 有重定位；文字按项顺序首尾相接并恰到块尾；分支须指向本脚本某项的起点（可为终止项），块外为 `invalid-payload`，块内其他位置为 `unsupported-payload`。
  - **内置表：** 区域为 n 条 0x54 字节记录加 i32 数量（`0x1762f8`，长 0x34C）；数量超过 `programRecords` 为 `limit-exceeded`，与区域长度不符为 `invalid-payload`。fixup 只能在各记录的 +0x00 与 +0x18，缺少或位于其他位置为 `invalid-payload`；+0x18 转为 `{ object, offset }` 代码标识（规则 4），+0x00 的目标须恰为某个给定名称区域的起点，区域须恰好覆盖文字及其 NUL（NUL 缺失或不在末字节为 `invalid-payload`，超长为 `limit-exceeded`）；名称区域缺少、多出或重复为 `subresource-mismatch`。fixup 处存储的字节不读。+0x1C、+0x20 非零为 `unsupported-payload`。不做载入变换（ai.md §3.3）。
  - **−0.0：** 除程序表 +0x2C 外，任何 `f32` 的 −0.0 为 `unsupported-payload`，非有限值为 `invalid-payload`。
  - **ID 链：** 按 `0x649c8` 的顺序：每条记录的 +0x1C 条目，新到达的 DFPG 再依次为 install script 与按偏移顺序的列表。所指条目未给出、类型不符（DFPG/TABL）为 `subresource-mismatch`，位置为引用它的字段；遍历后给定条目中未被到达的、或重复给出的同样为 `subresource-mismatch`，位置为该条目。`entryIds` 按 `entries` 的顺序返回这些 ID。
- **AC-05：** `ai.test.ts` 由合成内容（08 的 `syntheticAiPrograms`，含共享 DFPG、重复脚本、两层到达顺序）生成来源再解析，结果与内容深度相等、深度冻结，可被 `readAiPrograms` 读取并由 `encodeRuleDataPayload` 编码；给定条目以逆序或打乱顺序给出，`entries` 与 `entryIds` 仍为首次到达顺序；多组三元组中只取所选组；载入覆盖的位置写入任意值不影响结果；内置表经合成 LE 文件、`readFixedUpRegion`（含跨页 fixup）与 `readRegion` 读出后解析，结果与内容相等。
- **拒绝：** AICO、程序表、DFPG 与脚本、ID 链、内置表各有一组表驱动用例，覆盖上述每一类拒绝的 code 与结构路径；LE 读取器另测不支持的 fixup 种类、只有一半在区域内、目标在对象外、重叠与重复记录。
- **AC-14：** 结构限值与推导（观测值来自 ai.md §8 的组 0 闭包）：

  | 结构 | 常量 | 观测值 | 上限 | 限值名 |
  |---|---|---:|---:|---|
  | AICO 6001 条目字节 | `AI_SOURCE_LIMITS.globalsEntryBytes` | 192 | 512 | `payloadEntryBytes` |
  | AICO 三元组 | `AI_SOURCE_LIMITS.groupTriples` | 3 | 8 | `payloadItems` |
  | AICO 元素 | `AI_PROGRAMS_LIMITS.globalElements` | 5 | 16 | `payloadItems` |
  | 程序表条目字节 | `AI_SOURCE_LIMITS.programTableEntryBytes` | 572 | 4,096 | `payloadEntryBytes` |
  | 程序表与内置表的记录 | `AI_PROGRAMS_LIMITS.programRecords` | 5 / 10 | 32 | `aiProgramRecords` |
  | 程序名称（两表） | `AI_PROGRAMS_LIMITS.programNameBytes` | 20 | 64 | `textBytes` |
  | DFPG 条目字节 | `AI_SOURCE_LIMITS.parameterEntryBytes` | 160 | 512 | `payloadEntryBytes` |
  | DFPG 列表 | `AI_PROGRAMS_LIMITS.stateScriptItems` | 6 | 16 | `payloadItems` |
  | ID 链条目 | `AI_PROGRAMS_LIMITS.entries` | 25 | 64 | `aiEntries` |
  | 脚本条目字节 | `AI_SOURCE_LIMITS.scriptEntryBytes` | 1,217 | 4,096 | `payloadEntryBytes` |
  | 脚本项（含终止项） | `AI_PROGRAMS_LIMITS.scriptItems` | 40 | 128 | `aiScriptItems` |
  | 脚本文字 | `AI_PROGRAMS_LIMITS.scriptTextBytes` | 37 | 128 | `textBytes` |

  程序表的 2 × 572 取整为 2,048，低于 32 条记录与终止记录的 2,772 字节，按“不低于既有限值”取 4,096。每个限值都测试恰等于上限时通过、超出 1 时为 `limit-exceeded`（名称、上限与观测值）。程序表与脚本以恰好 4,096 字节的合法块通过。AICO 与 DFPG 的合法布局最大为 428 与 492 字节，不能达到 512：测试以这两个最大布局通过，并在限值检查层面核对（512 字节通过大小检查、在布局检查处为 `unsupported-payload`；513 字节在读取前为 `limit-exceeded`）。另测试限值先于读取：脚本前 128 项没有终止项时不读第 129 项（即使已到块外）；第 33 条记录的首字不是登记的指针时仍报 `aiProgramRecords`；第 65 个条目未给出时先报 `aiEntries`。
- **AC-18：** 合成数据全部由代码生成，条目 ID（7101、7103、7201…）、对象与偏移都与原版不同，文字含 `MARKER`、0x80 与 0xFF；条目诊断经 `sourceFailure` 核对位置语法并确认诊断不含 `MARKER`，区域诊断经同样的隐私检查。原因均为固定文字，不回显数值、名称或文字。测试不读取文件；`tools/engineering-boundaries.test.ts` 通过。
- **变异核对：** 分别去掉以下检查，测试都会失败：`aiEntries` 限值及其先于查找、多出条目、条目类型、脚本运行时字、−0 拒绝、名称区域多出、AICO 布局、名称起点与填满、DFPG 列表起点与填满、脚本文字起点与填满、脚本项限值先于读取、记录内的重定位、内置 +0x1C/+0x20、LE 重复 fixup。
- **本地核对（原版，只记计数）：** 被忽略的 `local/research/p3-03/ai-parser/check.ts` 用产品代码读取本地 `AISTUFF.NOB` 与 EXE：内置表区域经 `readFixedUpRegion` 读出 20 个 fixup，名称区域由 fixup 目标确定长度后经 `readRegion` 读出 10 个；以全部 41 个候选条目调用 `parseAiPrograms`，逐个剔除被报为多出的条目，剔除 16 个后成功：`entryIds` 25 个（DFPG 3、脚本 22）、程序 5 条、元素 5 个、内置程序 10 条、8 个不同的处理程序（都在对象 2）、脚本项共 157 个，全部紧密布局检查通过；内容可被 `readAiPrograms` 读取，规范 payload 为 13,414 字节。与 ai.md §8 一致。
- **检查：**
  - `pnpm exec vitest run src/original-data/formats tools/engineering-boundaries.test.ts`：9 个文件、521 个测试通过；
  - `pnpm typecheck`、`pnpm lint` 通过；
  - `pnpm check`：类型检查、ESLint、167 个文件 5,253 个测试与生产构建通过。
- **Rubber-duck：** 5 项意见，全部采纳：
  1. 名称、DFPG 列表与脚本文字的紧密布局未强制：改为按游标核对起点（规则 4）并要求恰到块尾，补充后缀指针、共享、乱序、间隙与块尾余字节的测试。
  2. 命名限值在读取或分配之后才判定：改为先判定（见 AC-14）。
  3. 同页重复的 fixup 被静默合并：只允许跨页 fixup 在其两页各记一次。
  4. 块内但起点不符的数组指针报为 `invalid-payload`：改为 `unsupported-payload`（块外仍为 `invalid-payload`）。
  5. AICO/DFPG 的 512 字节上限不可达：补充最大合法布局的通过用例，并在上面的 AC-14 记录限值检查层面的核对。
- **Simplify：** 4 个角度。
  - **采纳：** 程序记录共用字段改为一个扁平对象；表记录以数据代替闭包保存；跨页 fixup 的合并状态改为显式的 `joined`；脚本扫描时收集的操作码直接复用；测试支持中未被外部使用的构造函数不再导出。
  - **未采纳（需改动写入范围之外的文件）：** 与 `rens-header.ts` 私有的 −0 `f32` 读取、`view-labels.ts`/`scen.ts` 私有的文字读取共用（宜在 `payload-block.ts` 中提供字节串读取）；复用 `formats.test-support.ts` 私有的 `BlockWriter`；把 `synthetic.test-support.ts` 的 `leInternalFixup` 推广后替代 `le-executable.test.ts` 的 `offsetFixup` 与 `ai.test-support.ts` 的 `fixupRecord`；为 `sourceFailure` 增加跳过位置语法的选项（区域位置不在该语法中，因此 `ai.test.ts` 另有 `regionFailure`）。`f32` 的重复读取在数 KB 的输入上可忽略，未改。
- **交 15 的接线要点：**
  - `step-entry-reader.ts` 的 `stepRegionReader` 只调用 `readRegion`，内置表区域须改用 `readFixedUpRegion`（同一可执行文件只打开一次）。
  - 映射除内置表区域（`executableRegionAt(0x1762f8, 0x34c)`，含数量字）外，还需要 10 个名称区域，每个恰好覆盖名称及其 NUL（spec 来源映射：“每个区域恰好覆盖字串及其 NUL”）；15 的工作范围目前只列出 `0x1762f8`。名称的地址在 ai.md §3.3 的范围内，长度由本地观测确定。
  - 读取条目前用 `AI_SOURCE_LIMITS` 按条目类型检查大小（`stepEntryReader` 的 `beforeRead`）；`group` 取 `CLASSIC_P2_SLICE.candidate` 的组，AICO 的子资源在解析成功后升为 `verified`；`entryIds` 与 25 个条目部件逐一核对。
- **文档影响：** 写入范围内没有文档需要改。交 22：
  - original-data 分册：`ai.ts` 的 API、解析规则与上面的限值表；`le-executable.ts` 的 `readFixedUpRegion`。
  - [executable §1](../../../../original/formats/executable.md#1-format-and-toolchain-confirmed) 的“The reader rejects any region that a fixup patches”与 [ai §3.3](../../../../original/formats/ai.md#33-built-in-program-table-0x1762f8) 的“The product region reader currently rejects regions that a fixup patches”已过时：`readRegion` 仍拒绝，`readFixedUpRegion` 接受并解码内部 32 位偏移 fixup。
  - [源码结构](../../../../engineering/source-structure.md)的目录树加入 `formats/ai.ts`。

