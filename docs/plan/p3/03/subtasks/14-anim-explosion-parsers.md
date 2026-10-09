---
type: plan
status: active
phase: P3
task: "03"
subtask: "14"
updated: 2026-10-09
---

# 14 — ANIM 解码与爆炸表解析器

**契约来源：** [spec](../spec.md) 的 S-10、S-15、AC-08（解码与拒绝）、AC-14（结构限值）、AC-18；[字段处理规则](../spec.md#字段处理规则) 9、[错误](../spec.md#错误)。
**依赖：** 09。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **ANIM：** 新增解析器，按 05 的结构读取帧表与逐帧参数，并按 05 由代码确认的编码 1 规则解码每帧。若规则是帧间增量，按规则重建每一帧的完整索引图像。
  - 产出：逐帧的完整索引像素、透明掩码与调色板来源（自带调色板或 DATA），以及 09 `explosion-animation` 内容所需的逐帧或动画参数。
  - 拒绝：截断、越界、提前结束与剩余字节为 `invalid-payload`；研究未覆盖的编码分支为 `unsupported-payload`。
- **图像记录头：** [source-graphics.ts](../../../../../src/original-data/conversion/source-graphics.ts) 的读取只在 ANIM 帧中接受编码 1，其他条目中出现时仍为 `unsupported-encoding`。现有编码 0 与 2 的行为不变。
- **EXIC 与 EXPL：** 新增解析器。EXIC 为三张 EXPL ID 列表（格式规则为 3 张）；每个 EXPL 为 {SND ID, ANIM ID}，加上 05 确定的其他字段。
- 在合成支持中实现一个按格式文档编码 ANIM 的编码器，只用于测试。测试覆盖编码规则的每个分支、多帧、帧间依赖（如有）与透明。
- 结构超限用 06 的限值名。

## 不包含

- 帧图像的 payload、Asset 命名与转换：归 16。
- 爆炸表与动画 data Asset 的转换与 ID 链：归 17。
- 全部 186 帧的本地核对与外观对照：归 21。
- 模块分册：由 22 同步。

## 关键文件与契约

- [source-graphics.ts](../../../../../src/original-data/conversion/source-graphics.ts)：`readImageRecordHeader` 与解码入口。
- [payload-block.ts](../../../../../src/original-data/formats/payload-block.ts)、[m2id.ts](../../../../../src/original-data/formats/m2id.ts)（只读）：ID 列表解析的先例。
- 09 新增的 `src/content/flight/` 类型；05 写入 [textures](../../../../original/formats/textures.md) 的 ANIM 与 EXPL 结构。
- 计划新增：`src/original-data/formats/anim.ts`、`explosion.ts` 与它们的测试和合成支持。

## 写入范围

- `src/original-data/formats/anim.ts`：ANIM 帧表与编码 1 解码（新建）。
- `src/original-data/formats/anim.test.ts`：测试（新建）。
- `src/original-data/formats/anim.test-support.ts`：按格式文档编码的合成 ANIM（新建）。
- `src/original-data/formats/explosion.ts`：EXIC 与 EXPL 解析（新建）。
- `src/original-data/formats/explosion.test.ts`：测试（新建）。
- `src/original-data/conversion/source-graphics.ts`：只在 ANIM 中接受编码 1。
- `src/original-data/conversion/source-graphics.test.ts`：回归测试。

## 验收标准

- [x] AC-08（解码）：代码生成的合成 ANIM 按文档化的编码 1 规则编码，解码后的逐帧完整图像与生成时的帧逐像素相等；样本覆盖每个分支、多帧与帧间依赖（如有）。
- [x] AC-08（拒绝）：截断、越界与剩余字节为 `invalid-payload`，未覆盖的分支为 `unsupported-payload`；ANIM 以外的编码 1 仍为 `unsupported-encoding`，编码 0 与 2 的既有测试通过。
- [x] EXIC 恰为 3 张列表，EXPL 字段按研究结构解析；越界与超限按 code 拒绝。
- [x] AC-14 与 AC-18：结构限值恰等于上限时通过，超出 1 时拒绝；诊断不回显像素或数值；测试不读取文件。
- [x] `pnpm exec vitest run src/original-data tools/engineering-boundaries.test.ts` 与 `pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- Node 表驱动测试，使用代码生成的合成 ANIM、EXIC 与 EXPL。不涉及浏览器或原版数据。

## 完成证据

2026-10-09，worker `exec-p3-03-14`，基于认领提交 e058d6f。

- **新增接口（交 16、17、21；交 22 写入 original-data 分册）：**
  - [anim.ts](../../../../../src/original-data/formats/anim.ts)：`ANIM_LIMITS`（`entryBytes` 131,072、`frames` 即 `FLIGHT_DATA_LIMITS.animationFrames` 32、`frameBytes` 16,384）；类型 `AnimationFrame { width, height, recordOffset }`；`readAnimationFrames(archive, read)` 只核对结构（头部、全部帧记录与数据布局）而不解码，返回冻结的帧列表，供 17 取帧数、16 在解码前按宽高扣预算；`decodeAnimationFrame(archive, read, index)` 核对结构后解码 `frames/<index>` 子资源为 `SourceImage`（完整索引像素，透明像素为 0，规范打包掩码），序号越界为 `subresource-not-found`。数据中没有逐帧或动画参数（textures §6），只产出帧图像；帧没有调色板，按协调者决定在 DATA（`palette/flight/models`）下直接显示，绑定由 16 的声明完成。
  - [explosion.ts](../../../../../src/original-data/formats/explosion.ts)：`EXPLOSION_LIMITS`（`listEntryBytes` 256、`listItems` 即 `FLIGHT_DATA_LIMITS.explosionListItems` 16、`recordBytes` 8）；类型 `ExplosionLists`（恰 3 张 EXPL 条目 ID 列表的元组）与 `ExplosionRecord { sound, animation }`（SND 与 ANIM 条目 ID）；`parseExplosionLists(archive, read)` 与 `parseExplosionRecord(archive, read)`。ID 是否为映射的条目，由 17 的 ID 链核对。
  - [source-graphics.ts](../../../../../src/original-data/conversion/source-graphics.ts)：新增类型 `ImageRecordKind`（`'image'` | `'anim-frame'`）；`readImageRecordHeader` 与 `decodeImageRecord` 增加可选的第 4 个参数 `kind`（默认 `'image'`，既有调用不变）；`ImageRecordHeader.encoding` 增加 `'byte-run'`。`'anim-frame'` 只接受编码 1，`'image'` 仍只接受 0 与 2，其余为 `unsupported-encoding`。精灵 RLE 与编码 1 共用一个按编码参数化的解码函数（游程长度 u16 或 u8，越过宽度的规则不同）。`fieldAt` 在以 `archive` 开头的结构路径下以 `/` 连接字段，使图像记录读取器的诊断落在 archive 位置语法内（如 `…#ID/frames[2]/pixels`）；既有调用者都不传 archive 路径，行为不变。
  - 测试支持 [anim.test-support.ts](../../../../../src/original-data/formats/anim.test-support.ts)：`SyntheticFrame`（`pixels`，透明为 null）、`ByteRun`、`byteRunData`、`byteRunRows`、`encodeByteRunFrame`、`expectedFrame`、`patternFrame`、`solidFrame`、`SyntheticAnimFrame`、`animFrame`、`syntheticAnimation`。编码器按 textures §2 的规则独立于解码器实现：游程从透明开始交替，行恰在宽度处结束，超过 255 像素的游程以另一种的零长度游程接续。
- **AC-08（解码）：** [anim.test.ts](../../../../../src/original-data/formats/anim.test.ts) 的 `ANIM frame decoding`：5 帧动画（13×9、48×48、128×128 的伪随机帧，全透明帧，不透明索引 0 的全不透明帧）逐帧解码，与生成时的图像逐像素、逐掩码位相等；规则的每个分支各一行并合成一帧：透明、不透明、透明在宽度处结束，零长度透明游程后不透明游程到宽度，单个透明游程，透明之间的零长度不透明游程，不透明之间的零长度透明游程，越过宽度的透明游程（只结束该行），绘制不透明索引 0；300 像素宽的帧经零长度游程接续解码；帧是完整图像、不是增量（规则没有帧间依赖）：同一帧放在不同动画中解码结果相同；结果为调用者独占的新缓冲区；帧记录字段与重定位按 textures §6 写出。
- **AC-08（拒绝）：**
  - 接受：零长度的透明与不透明游程、不透明索引 0、越过宽度的透明游程（按代码只结束该行，无损）。
  - `invalid-payload`：截断的不透明游程、缺少的行、行内缺少下一游程、越过宽度的不透明游程（原版会画到帧框之外，完整帧无法容纳，按 spec 的“越界”处理）与帧数据的剩余字节，这些在解码时拒绝，结构读取仍可通过；结构上为头部截断、帧数组指针未登记或为空或不紧接头部、负帧数、帧数组越界、重定位不在指针字段（计数、帧记录的其他字段、帧数据内）、像素指针未登记或为空、帧数据不按帧序紧接或有间隔、数据大小越界、条目末尾的剩余字节、位深不为 8、+16 非零，以及调色板指针未登记或已登记却指向块外。
  - `unsupported-payload`：没有帧的动画、带嵌入调色板的帧（数量非零或指针已设）、+36 非零（规则 6）。编码 1 的每个分支都已由代码确认（textures §2），解码器内没有未覆盖的分支；未覆盖的位置只在帧记录中。
  - `unsupported-encoding`：ANIM 帧的编码为 0、2 或 3；ANIM 以外的编码 1（整条目记录、TABL 图像列表、MFDD 与 CCKD 元素记录，[source-graphics.test.ts](../../../../../src/original-data/conversion/source-graphics.test.ts) 的 `byte-run sprite RLE`）。编码 0 与 2 的既有测试不改断言通过。
- **EXIC 与 EXPL：** [explosion.test.ts](../../../../../src/original-data/formats/explosion.test.ts)：恰 3 张列表按存储顺序读取，可含重复项；空列表为空指针与数量 0；多出的第 4 个列表指针（多余重定位）、被重定位的 ID、头部截断、未登记的列表指针、列表落在头部内或越出块、空指针带数量都为 `invalid-payload`，有指针的空列表为 `unsupported-payload`。EXPL 恰 8 字节，读出 `{ sound, animation }`；截断与任一字段被重定位为 `invalid-payload`。
- **AC-14（观测值 → 上限）：**
  - ANIM：条目 58,087 字节 → 131,072；帧数 12 → 32（与 09 共用）；帧数据 7,411 字节 → 16,384；帧图像沿用 640×480。帧数 32 通过、33 在读取数组前拒绝（`payloadItems`，`/frames`；声明 0x7FFFFFFF 同样）；帧数据恰 16,384 字节通过、16,385 拒绝（`animFrameBytes`，`/frames[1]`，在读取该帧记录的其余字段与数据之前；声明 0xFFFFFFFF 同样）；条目恰 131,072 字节通过、131,073 拒绝（`payloadEntryBytes`）；宽 641 与高 0 为 `limit-exceeded`。
  - EXIC：条目 92 字节 → 256；每张列表最多 7 项 → 16（与 09 共用）。每表 16 项与恰 256 字节通过；第 17 项（`payloadItems`，`/lists[1]`；声明 0xFFFFFFFF 同样）与 257 字节拒绝。EXPL 的 8 字节与 3 张列表是格式规则：8 字节通过，9 字节为 `limit-exceeded`（`payloadEntryBytes`）。
- **AC-18：** 诊断只含 code、结构路径与限值；测试经既有的 `sourceFailure` 核对位置在 archive 位置语法内，并以诊断中不应出现的标记值（不透明索引 231、ID 61,043）核对不回显。合成数据全部由代码生成，条目 ID 为合成的 30,011、30,021、30,031，测试不读取文件；新模块只导入 `content/` 与 `original-data/` 内的模块。
- **检查：** `pnpm exec vitest run src/original-data tools/engineering-boundaries.test.ts`：48 个文件、1,663 个测试通过（anim 53、explosion 17，source-graphics 新增 12）；`pnpm typecheck`、`pnpm lint` 通过；`pnpm check`：166 个文件、5,164 个测试与生产构建通过；`pnpm check:original` 退出码 0，`findings` 为空。变异核对：去掉不透明越界、条目剩余字节与 +36 的检查后，相应测试失败。
- **Rubber-duck：** 一项非阻塞发现：已登记的调色板指针在判为 `unsupported-payload` 之前没有核对目标在块内。已采纳：改用 `PayloadBlock.unsupportedPointer`（按数量 × 3 字节），并加入指针越出块为 `invalid-payload` 的回归测试。
- **Simplify：** 采纳：精灵 RLE 与编码 1 合并为一个按编码参数化的解码函数，既有代码的改动最小；ANIM 的重定位核对由逐字节扫描改为对重定位表的一次遍历（错误位置统一为 `/frames`）；合成帧改为单一的 `pixels` 数组；`expectedFrame` 使用 `maskStride`；两个测试文件改用既有的 `sourceFailure`。未采纳：`fieldAt` 按 `archive` 前缀选择分隔符（显式参数会让所有图像读取器多一个参数；统一的位置拼接属于 `source-error.ts`，在写入范围之外）；编码 1 的拒绝在 source-graphics 与 anim 两层都测试（anim 层是 AC-08 的端到端证据）；逐分支测试与合并测试并存（合并测试覆盖每种行尾之后的换行）。
- **文档影响：** 格式事实、U 项、命令与工程约定都未改变，本行不改文档。交 22：original-data 分册图像记录一节（`readImageRecordHeader`/`decodeImageRecord` 两条）补充 `kind`、编码 1 只在 ANIM 帧中受支持、`'byte-run'` 与 `fieldAt` 的 archive 路径规则；新增 `formats/anim.ts`、`formats/explosion.ts` 的接口、上述限值与推导所用观测值；[textures](../../../../original/formats/textures.md) 的 Parser 一行加入 `anim.ts`（`readAnimationFrames`、`decodeAnimationFrame`）与 `explosion.ts`（`parseExplosionLists`、`parseExplosionRecord`）。没有 STATUS 或阶段索引的变化。
