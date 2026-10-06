---
type: plan
status: active
phase: P2
task: "05"
subtask: "12"
updated: 2026-10-05
---

# 12 — 字符映射研究（U-030 字体部分）

**契约来源：** [spec](../spec.md) 的 S-11 的字符映射部分，S-03 的映射规则；[图形转换声明](../spec.md#图形转换声明)中的字体 `charMap`；技术决定 5；AC-16，AC-18 的 hud 与 unknowns 部分。
**依赖：** 06。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **研究：** 只读分析本地 Ghidra 项目中的 HUD 文字绘制路径，确定三个字库从文本字节到字形索引的机制，重点是 4×6 字库。证据分三类：
  - EXE 文本绘制路径；
  - 原版截图中已知文字的逐像素匹配（`local/StarRang/captures/`）；
  - 仅凭字形辨认，最多为高概率。

  只把地址、机制与置信度写入文档，不粘贴反编译输出或字形位图。
- **8×8 字库：** hud §1 已核对字母与数字位于 ASCII 位置；本子任务先确认核对过的确切码位范围（大小写、数字），再只扩展到有证据的码位。
- **单元外置位：** 本地统计三个字库在单元宽度以外是否有置位。若有，在 U-030 中登记绘制宽度语义为未确认；转换仍逐位保留。
- **生产映射：** 在 06 的生产声明中填入 `charMap` 区间，逐段对应 hud 中有证据的条目。更新测试，断言生产区间与本子任务记录的范围一致。区间只表达研究得出的规则，不复制原版数据表。
- **阻塞条件：** 出现以下任一情况，本子任务为 blocked，记录原因、受影响的 AC-16 与恢复条件，不以空映射冒充完成：
  - 4×6 字库的机制未达到高概率。恢复条件：取得新证据。
  - 证明映射只能来自 EXE 中的数据表。恢复条件：扩展 P2-01 来源定位的 spec 获批准。
- **文档：** 更新 [hud](../../../../original/formats/hud.md) §1 与 [unknowns](../../../../original/unknowns.md) 的 U-030（及其 `updated:`）。
- **执行期修订（2026-10-05）：** 研究表明 4×6 表实为 192 个 8 行字形，原字体 payload 无法表达其映射。按用户授权修订 spec（技术决定 14），本子任务因此增加：字体 payload 与声明的每字形行数（`glyphRows`）及字形数、转换器按声明切分并按字形数扣除预算、相应测试与[源码结构指南](../../../../engineering/source-structure.md)。见 [goal 执行记录](../goal.md#执行记录)。

## 不包含

- TABL 10165 叠加图与 TABL 10399、11375 的用途（U-030 其余部分）：归 P2-07。
- HUD 文字布局、字距与绘制颜色：归 P2-07/P3。
- 缓存与转换器版本：生产 `ConverterVersion` 尚未定义，本子任务的映射变化不影响缓存。

## 关键文件与契约

- **修改：** 06 的生产声明模块及其测试（`src/original-data/conversion/`，06 新增）；执行期修订另改 `src/content/graphics/font-payload.ts`、`src/original-data/conversion/{graphics-declarations,convert-graphics,source-graphics}.ts` 及其测试与测试支持，以及 `src/workers/` 中的合成用量常量。
- **原版文档：** [hud](../../../../original/formats/hud.md)、[unknowns](../../../../original/unknowns.md)，按需 [executable](../../../../original/formats/executable.md)。
- **本地新增：** `local/research/p2-05/` 下的分析脚本、输出与截图比对（被忽略）。
- **前提：** `local/ghidra/srangers.gpr`、`local/StarRang/SRANGERS/MAIN/SR.NOB` 与 `local/StarRang/captures/`（2026-10-05 均已存在）；缺少时本子任务为 blocked。

## 验收标准

- [x] AC-16：hud 记录 4×6 字库的机制、置信度（至少高概率）与证据类型；8×8 字库的映射只覆盖有证据的码位。
- [x] 三个字库的单元外置位已统计；若有，U-030 已登记绘制宽度语义为未确认。
- [x] 生产 `charMap` 与 hud 逐项一致，没有无证据条目；U-030 状态已更新。
- [x] `pnpm exec vitest run src/original-data`、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- 本地只读研究与截图比对；证据只记录命令、地址、码位范围、计数与判定。
- 文档与代码常量逐项对照审阅。
- 不适用 browser-testing。
- 完成前按 execute-goal 流程以本子任务 diff 为范围做 rubber-duck 审查与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据

2026-10-05 完成。研究脚本与输出都在被忽略的 `local/research/p2-05/`，下面只记录命令、码位范围、计数与判定。

- **4×6 字库的布局（高概率）：**
  - **计数：** `node local/research/p2-05/font-cells.ts local/StarRang/SRANGERS/MAIN/SR.NOB` 按每字形 8 字节读取第三个表，三个 CCKD 都得到 192 个单元：
    - 136 个与 fonts/1 同码位字形逐字节相同；
    - 56 个不同，码位为 0x25、0x27–0x3f、0x41–0x5d、0x6b。
  - **尺寸：** `font-small-boxes.ts` 显示这 56 个中有 55 个不超过 3×5 且位于单元左上，只有 1 个是整格字形。
  - **头部读法：** 按头部的每字形 6 字节读取时，177 个字形超出 4 列，也不与任一 8×8 表对齐（较早的 `font-structure.ts` 等脚本）。
  - **字形辨认：** `font-sheet-ascii.ts` 渲染本地图表，经目视辨认：
    - 两个 8×8 表的 0x20–0x7e 都是该 ASCII 字符，例外是 fonts/0 的 0x7b（箭头）；
    - 4×6 表的 55 个小字形是各自码位的 ASCII 字符。
  - **三个 CCKD 的一致性：** 字库表逐表 SHA-256 相同。
- **截图逐像素匹配：** `node local/research/p2-05/font-capture-match.ts …`，覆盖 92 张截图，倍率 1 与 2：
  - fonts/0 在 47 张截图中有 231 段 3 个以上字母数字的连续匹配（8 像素步进），按同号映射读出的形状像文字；
  - fonts/1 与 4×6 小字形（3–6 像素步进）都没有字母数字连续匹配；
  - 要求单元背景同色的严格匹配下，没有字母数字连续匹配。
- **EXE：** 在本地 Ghidra 反编译输出中按字形寻址与位测试模式有限搜索，没有找到文字绘制路径。命中的候选是无关函数，例如 C 运行库的缓冲读取。
- **结论：** 机制为“文本字节 c → 字形 c，每字形 8 字节”，高概率，满足 AC-16 的下限，没有 blocked。证据类型为结构比对与字形辨认，截图逐像素匹配支持 fonts/0。记录在 [hud §1.1](../../../../original/formats/hud.md#11-glyph-layout-and-character-maps-likely)。
- **单元外置位（`font-outside.ts`）：**
  - 两个 8×8 表都没有；
  - 4×6 表按 8 行字形有 135 个字形在 4×6 单元外有像素，其中 115 个在第 6–7 行，即 134 个 fonts/1 副本与 0x6b；
  - 按头部的 6 行读法为 177 个。

  [U-030](../../../../original/unknowns.md#数据与格式) 改为“进行中”：字库部分为高概率；单元外像素的绘制语义与头部 +1 字节未确认；TABL 部分仍归 P2-07。
- **执行期修订：** 原字体 payload 无法表达 192 个 8 行字形的映射，按授权修订 spec（技术决定 14、AC-07、AC-12 等），并记录在 [goal 执行记录](../goal.md#执行记录)。
  - [font-payload.ts](../../../../../src/content/graphics/font-payload.ts)：7 字节头部，含每字形行数与字形数；
  - [graphics-declarations.ts](../../../../../src/original-data/conversion/graphics-declarations.ts)：必填 `glyphRows`、`declaredGlyphCount`，`charMap` 的字形须小于字形数；
  - [convert-graphics.ts](../../../../../src/original-data/conversion/convert-graphics.ts)：按字形数扣除预算，字节不变地切分。
- **生产映射：** [production-graphics.ts](../../../../../src/original-data/conversion/production-graphics.ts) 中三个字库的 `glyphRows` 都为 8，映射都带 U-029 与 U-030，证据增加 hud §1.1。区间与 hud §1.1 逐项一致：
  - 8x8-1：0x20–0x7a、0x7c–0x7e（94 条）；
  - 8x8-2：0x20–0x7e（95 条）；
  - 4x6：0x20、0x25、0x27–0x3f、0x41–0x5d（56 条）。

  `node local/research/p2-05/font-charmap-check.ts …` 在真实表上核对：映射的空格都为空白，其余映射字形都非空；4×6 的 55 个非空格映射恰为落在 4×6 单元内的小字形集合，唯一落在单元外的不同单元 0x6b 未映射。
- **测试：** 新增或更新以下断言：
  - font-payload：头部布局、192 个 8 行字形与单字形往返；拒绝每字形行数低于高或为 9、字形数为 0 或 257、字节不是整行、映射字形越过字形数；
  - 声明：缺少 `glyphRows`、低于单元高、为 9、留下不完整字形，以及首字形或区间越过字形数，都是 `invalid-declaration`；
  - 转换器：按声明切分时字节不变，按 192 个字形扣除；
  - 生产：区间、U 项与证据逐项断言；在合成光盘上解码 4×6 payload，确认字节等于源表、查找 ` %0A]` 得到同号字形、`a` 未映射；fonts/0 的 `{` 未映射，fonts/1 的 `{~` 已映射。
  - 用量期望：步骤、作业、管道与 E2E 的字形用量改为 704（256 + 256 + 192），`GRAPHICS_PAYLOAD_BYTES` 为 7,683。
- **附带修正：** 用 Worker 管道测试复跑损坏字库时发现，`SourceError` 的原因文字若含 `×`，会被 Worker DTO 拒绝（只允许可打印 ASCII）。新写的字库表原因和 03 已有的 raw 图像原因都改为 ASCII。`expectSourceError` 新增该规则的断言；恢复旧原因后，raw 尺寸用例随即失败，说明断言有效。
- **命令：**
  - `pnpm exec vitest run src/original-data`：805 项通过；
  - `pnpm typecheck`、`pnpm lint` 通过；
  - `pnpm check`：106 个文件，3,083 项通过，构建成功；
  - `pnpm test:e2e import-worker.spec.ts --project=development`：11 项通过；
  - `pnpm check:original` 通过；
  - 本地基准 `node local/research/p2-05/base-check.ts local/StarRang/cd/STAR_RANGERS.{ccd,img,sub,cue}`：`passed: true`，步骤用量为 glyphs 704、payloadBytes 7,683。
- **rubber-duck：** 没有 High。
  - Medium：AC-12 仍写 glyphs 768，已改为 704，份额 768 不变；
  - Low：06/07/08/10 的证据仍是修订前的数值，已在各自的完成证据末尾加注执行期修订，原记录保留；
  - Low：hud 的截图证据措辞可能显得过强，已改为“逐个搜索，只有 fonts/0 有合格的连续匹配”。
- **simplify：** 4 个并行审查（复用、简化、效率、层次）。
  - **已修：** 生产测试不再复制 `same()`，改用字面量区间作为独立期望；4×6 payload 只解码一次。
  - **跳过：**
    - payload 头部的字形数可由长度推出：保留显式计数，与调色板 payload 的条目数一致，读取器无需除法即可定位映射；
    - 模块载入时严格读取生产声明：这是 06 有意的快速失败设计；
    - 转换器每次展开并排序字符映射：04 的既有代码，规模约 245 条，不在热路径；
    - 可打印 ASCII 规则下沉到 `SourceError`：需要改动 diff 以外的 P2-03/04 代码，且测试分层不允许 `original-data` 测试导入 `workers`；保留测试层断言。
- **文档：**
  - 原版文档：[hud](../../../../original/formats/hud.md) §1（表头 +3/+4 的含义、解析器名）与新增 §1.1；[unknowns](../../../../original/unknowns.md) 的 U-030；
  - 计划文档：[spec](../spec.md) 修订、[goal](../goal.md) 执行记录、01/04 加注修订；
  - [源码结构指南](../../../../engineering/source-structure.md)：字体 payload 布局、格式规则、声明、生产映射与份额说明。
  - 链接检查 642 个链接无问题；跟踪文件中没有原版字节、字形位图、解码文字或反编译代码。
