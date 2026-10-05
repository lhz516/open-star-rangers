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

- [ ] AC-01 源读取部分：DATA 与嵌入调色板的正负用例全部通过，code、位置与 `limit` 正确。
- [ ] AC-02 解码部分：非对称 raw/RLE 逐像素正确，透明索引为 0，结果不与源块共用缓冲。
- [ ] AC-03：全部源结构拒绝用例通过；超限在分配前拒绝，不出现宿主 `RangeError`。
- [ ] AC-07 源读取部分：字体表与 CCKD 字体目录的正负用例通过。
- [ ] `SourceError` 扩展保持 P2-03 行为：`pnpm exec vitest run src/original-data` 全部通过；nob-check 仍能编译运行。
- [ ] `pnpm typecheck`、`pnpm lint` 通过；新模块不使用 DOM 或 Node API。

## 验证方法

- Node 表驱动测试，样本由代码生成，不读取 `local/`。
- 不适用 browser-testing；本地全量校验见 09。
- 完成前按 execute-goal 流程以本子任务 diff 为范围做 rubber-duck 审查与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据
