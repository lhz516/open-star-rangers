---
type: plan
status: active
phase: P2
task: "05"
subtask: "03"
updated: 2026-10-05
---

# 03 — 源结构加固与 `SourceError` 扩展

**契约来源：** [spec](../spec.md) 的 S-01 的源读取部分，S-05 的解析器加固，S-07 的结构限值（先于分配），S-08 的 `source` 层错误；[行为与边界](../spec.md#行为与边界)前 7 行与字体相关行，[错误码](../spec.md#错误码)；技术决定 6、7、9；AC-01、AC-02、AC-03、AC-07 的源读取部分。
**依赖：** 01。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **扩展 [source-error.ts](../../../../../src/original-data/source-error.ts)：**
  - `SourceErrorCode` 追加 `invalid-payload`、`unsupported-encoding`、`budget-exceeded`、`palette-index-out-of-range`、`subresource-not-found`、`invalid-declaration`、`geometry-mismatch`；`limit-exceeded` 沿用。
  - `SourceLimitName` 追加 `imageWidth`、`imageHeight`、`paletteEntryCount`、`fontCellWidth`、`fontHeight` 与 P2-01 的全部预算维度。
  - `observed` 改为 `number | null`：只有预算限值在超出安全整数时为 null，结构限值总为数值。
  - P2-03 已有 code 与限值的含义不变，现有调用与测试照常通过；如有消费者假定 `observed` 为数值，按新类型调整。
- **计划新增 `src/original-data/conversion/` 中的源结构读取：** 失败都抛出 `SourceError`，位置为相对字段名，如 `record`、`pixels`、`mask`、`palette`、`glyphs`、`fonts`；04 再加上 `graphics[<Asset ID>]` 前缀。
  - **DATA：** 块长恰为 768 字节，任一分量大于 63 报 `invalid-payload`，不截断高位；按 `(c << 2) | (c >> 4)` 展开为 256 组 RGB。
  - **图像记录头：** 先确认 36 字节头在块内，再依次校验：位深为 8；+16 保留字段为 0；编码为 0 或 2，1 与其他值报 `unsupported-encoding`；宽高在 01 的限值内，否则报 `limit-exceeded`；嵌入调色板条目数不超过 256；像素与调色板的偏移加长度在块内，用不溢出的算术校验，否则报 `invalid-payload`。只读头部，不分配像素。
  - **解码：** 在头部校验之后才分配。raw 要求数据长度等于宽 × 高，复制到独占的新缓冲，全不透明。RLE 沿用现有算法（截断、越行、尾随字节报 `invalid-payload`），输出新的索引与掩码，透明像素索引为 0。
  - **嵌入调色板：** 条目数为 0 报 `subresource-not-found`，否则把 BGR 读为 RGB，放入新缓冲。
  - **字体表：** 宽 1–8、高 1–8，否则报 `limit-exceeded`；表长须为 `4 + 256 × height`，否则报 `invalid-payload`。字形字节逐位复制。
  - **CCKD 字体目录：** 恰为 3 项，各项在块内，否则报 `invalid-payload`；`fonts/<i>` 在 i ≥ 3 时报 `subresource-not-found`。
  - **MFDD 列表：** 计数以块内能容纳的记录数为界，每条记录经上述头部校验；供 09 的全量校验使用，容器语义仍归 P2-07。
- **[payloads.ts](../../../../../src/original-data/payloads.ts)：** 图像、调色板与字体函数改为委托上述实现，或删除并更新全部已跟踪的调用者（[nob-check.ts](../../../../../tools/nob-check.ts)、[payloads.test.ts](../../../../../src/original-data/payloads.test.ts)）。不保留第二套解码逻辑；`PayloadError` 只留给 MESH/MODL（归 P2-06）。
- **测试：** 用 [synthetic.ts](../../../../../src/original-data/synthetic.ts) 的 `ByteWriter` 与 `imageRecord` 生成样本：
  - **AC-01：** DATA 分量 0、1、32、63 展开为 0、4、130、255；块长 767 或 769、分量 64 被拒绝；BGR (1, 2, 3) 得到 RGB (3, 2, 1)；条目数 1 与 256 通过、257 被拒绝；没有嵌入调色板时报 `subresource-not-found`。
  - **AC-02：** 3×2 raw 与 5×3 RLE 的非对称样本，含长度为 0 的首个透明段与全透明行；结果逐像素与期望相同；修改源块后结果不变，结果缓冲可交给 `payloadTransferList`。
  - **AC-03：** 位深、保留字段、指针越界、raw 长度、RLE 三类错误、编码 1 与 3、宽高为 0、宽 641、高 481。声明 65535×65535 的记录只读头部即以 `limit-exceeded` 拒绝，不出现 `RangeError`。
  - **AC-07：** 4×6 与 8×8 字体表、宽或高 0 与 9、表长不符；CCKD 目录项数 2 与 4、`fonts/3`。
  - 断言 code、位置与 `limit`，包括 `observed`。
- **文档：** 在[源码结构](../../../../engineering/source-structure.md)记录源结构读取、错误位置与 `SourceError` 扩展；[工程约定](../../../../engineering/README.md)中若列有 `source` 层 code，同步更新。

## 不包含

- 转换声明、调色板绑定、颜色键、行序与预算扣除：归 [04](./04-graphics-conversion.md)。
- 本地 `SR.NOB` 的全量校验与 nob-check 的输出格式：归 [09](./09-local-structure-check.md)。本子任务只保证 nob-check 编译通过、行为不退化。
- CCKD 分组、元素与 TABL 记录的容器解析：归 P2-07。

## 关键文件与契约

- **修改：** [source-error.ts](../../../../../src/original-data/source-error.ts)、[payloads.ts](../../../../../src/original-data/payloads.ts)、[payloads.test.ts](../../../../../src/original-data/payloads.test.ts)，必要时 [nob-check.ts](../../../../../tools/nob-check.ts) 的导入。
- **计划新增：** `src/original-data/conversion/` 下的源结构读取模块与相邻测试（尚不存在）。
- **复用：** 01 的限值常量（`original-data` 可以导入 `content`）。

## 验收标准

- [x] AC-01 源读取部分：DATA 与嵌入调色板的正负用例全部通过，code、位置与 `limit` 正确。
- [x] AC-02 解码部分：非对称 raw/RLE 逐像素正确，透明索引为 0，结果不与源块共用缓冲。
- [x] AC-03：全部源结构拒绝用例通过；超限在分配前拒绝，不出现宿主 `RangeError`。
- [x] AC-07 源读取部分：字体表与 CCKD 字体目录的正负用例通过。
- [x] `SourceError` 扩展保持 P2-03 行为：`pnpm exec vitest run src/original-data` 全部通过；nob-check 仍能编译运行。
- [x] `pnpm typecheck`、`pnpm lint` 通过；新模块不使用 DOM 或 Node API。

## 验证方法

- Node 表驱动测试，样本由代码生成，不读取 `local/`。
- 不适用 browser-testing；本地全量校验见 09。
- 完成前按 execute-goal 流程以本子任务 diff 为范围做 rubber-duck 审查与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据

- **实现（2026-10-05）：**
  - [source-error.ts](../../../../../src/original-data/source-error.ts) 追加 7 个 code、5 个结构限值名与 P2-01 的全部预算维度，`observed` 改为 `number | null`。消费者核对：Worker 宿主按层原样转换，协议的 `readLimit` 本已接受 null，其余生产代码只构造数值的 `observed`。
  - 新增 [source-graphics.ts](../../../../../src/original-data/conversion/source-graphics.ts)：`readDataPalette`、`readImageRecordHeader`、`decodeImageRecord`、`readEmbeddedPalette`、`readMfdRecordOffsets`、`readFontTable`、`readCockpitFonts` 与 `readCockpitFont`。按 spec 的顺序校验，越界比较不做加法，头部之后才按尺寸分配。解码与读取嵌入调色板都从块中重新校验记录头。输出放在独占的新缓冲中（经 `exclusiveBytes`，其返回类型细化为 `Uint8Array<ArrayBuffer>`），失败抛出 `SourceError`，位置为调用者 `path` 下的 `palette`、`record`、`pixels`、`glyphs` 或 `fonts`。
  - [payloads.ts](../../../../../src/original-data/payloads.ts) 删除 `parseVgaPalette`、`parseImage`、`decodeSpriteRle`、`parseMfdImages`、`parseBitmapFont`、`parseCockpitFonts` 及其类型，只留 ID 列表与 MESH/MODL；[payloads.test.ts](../../../../../src/original-data/payloads.test.ts) 相应删减。[nob-check.ts](../../../../../tools/nob-check.ts) 改用新读取，额外读取 TEX/BITM 的嵌入调色板。[synthetic.ts](../../../../../src/original-data/synthetic.ts) 的 `imageRecord` 增加可选的位深与保留字段。
- **测试：** `pnpm exec vitest run src/original-data/conversion`，[source-graphics.test.ts](../../../../../src/original-data/conversion/source-graphics.test.ts) 57 项通过：
  - **AC-01：** DATA 分量 0、1、32、63 展开为 0、4、130、255，结果独占；767、769 字节与分量 64 都报 `invalid-payload@…palette`，不截断。BGR (1, 2, 3) 得到 (3, 2, 1)；1 与 256 项通过；257 项为 `limit-exceeded@palette`，limit `{paletteEntryCount, 256, 257}`。没有嵌入调色板时为 `subresource-not-found`。
  - **AC-02：** 3×2 raw 逐像素相同，修改源块后结果不变，可交给 `payloadTransferList`。5×3 RLE（首个透明段长度为 0、含全透明行）的索引与掩码字节逐位符合期望，并能经 01 的编码器往返。另有长度为 0 的不透明段、对齐 16 像素与不对齐 14 像素的长段（整字节与边缘位），以及块内偏移处的记录。
  - **AC-03：** 截断记录、16 位深、保留字段非零、调色板或像素的范围或指针越界（含 0xffffffff 指针）、raw 长度不符、RLE 行截断、像素截断、越行与尾随字节都报 `invalid-payload`，位置分别为 `record`、`palette`、`pixels`。编码 1 与 3 报 `unsupported-encoding`。宽或高为 0、宽 641、高 481 报 `limit-exceeded`，`{name, limit, observed}` 逐项断言。65535×65535 的记录只凭头部被拒绝，解码与读取嵌入调色板时也一样，不出现 `RangeError`。
  - **AC-07：** 4×6 与 8×8 字体表逐位复制，4×6 保留单元宽度以外的位，修改源块后结果不变。宽 0、9 与高 0、9 报 `limit-exceeded`（`fontCellWidth`、`fontHeight` 带观察值）；表长不符、头部截断、首字节非 0 报 `invalid-payload`。CCKD 目录：3 项按序读入独占缓冲；只读所选字库时不解析其余表；2 项、4 项、目录越界、表越界、头部截断报 `invalid-payload@…fonts`；`fonts/3`、`fonts/-1`、`fonts/0.5` 报 `subresource-not-found`。
  - 调用者 `path` 前缀，如 `graphics[image/a].record`。
  - 变异核对：整字节掩码改写为 `0x7f` 时两项长段用例失败，恢复后通过。
- **回归：** `pnpm exec vitest run src/original-data src/content` 35 个文件 1173 项通过，P2-03 的核验与位置语法测试不变。本地 `node tools/nob-check.ts local/StarRang/SRANGERS/MAIN/SR.NOB` 改动前后计数相同（TEX 59、BITM 28、CCKD 3、MFDD 3 及其余类型），失败均为 0；输出只有计数。`pnpm typecheck`、`pnpm lint` 与 `pnpm check` 通过。
- **Rubber-duck：** 两项 Medium 已修复：解码与读取嵌入调色板原先信任调用者传入的头部，现改为从块中重新校验；CCKD 字体表原先返回源块视图，现在只公开解析后的独占结果。Low（缺少长度为 0 的不透明段用例）已补。
- **Simplify：** 采纳 `exclusiveBytes` 复制、测试改用共享的 `imageRecord`（新增可选字段）、只在本模块使用的常量与 `fieldAt` 改为私有、每个记录头只建一个 `DataView`、RLE 掩码按整字节写入（并补长段用例），以及 RLE 样本只保留一份。未采纳：nob-check 合并 TEX 读取（重读 36 字节头是为不信任头部而有意付出的代价）、MFDD 返回区间（列表长度已以块长为界）、只为所选 CCKD 字库建视图（只有 3 项）。
- **文档影响：** [源码结构](../../../../engineering/source-structure.md#图形转换)新增“图形转换”一节（源结构读取、位置与 `SourceError` 扩展），目录树加入 `conversion/`。[工程约定](../../../../engineering/README.md#测试)的字体目录条目改为新模块。[hud](../../../../original/formats/hud.md) 与 [textures](../../../../original/formats/textures.md) 的解析器指针更新，原版事实不变。工具指南中 nob-check 的描述仍然准确，输出格式由 09 调整。

