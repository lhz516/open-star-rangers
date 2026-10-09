---
type: plan
status: active
phase: P2
task: "05"
subtask: "09"
updated: 2026-10-08
---

# 09 — 加固 nob-check 与本地全量结构校验

**契约来源：** [spec](../spec.md) 的 S-12 的本地校验，S-13 的工具文档；[限值与预算](../spec.md#限值与预算)中安全上限须由全量校验核对的要求；技术决定 7、12；AC-14，AC-18 的观察最大值与工具指南部分。
**依赖：** 03。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **[nob-check.ts](../../../../../tools/nob-check.ts)：** 改用 03 的源结构读取：
  - DATA；
  - TEX 与 BITM 的整条目记录；有嵌入调色板时核对不透明像素索引都小于条目数，没有时只做结构与 256 色上界校验；
  - MFDD 两个列表中的全部记录；
  - CCKD 的字体目录与三个字体表。

  M2ID、NEBC、MESH、MODL 的既有检查保持不变。
- **输出：** 每类的通过数与失败数，失败原因只写 code 与结构位置（条目 ID 属结构信息，可以出现）；另输出观察最大值：图像宽、高，调色板条目数，字体单元宽、高。不输出任何像素、调色板值或字形。
- **本地运行：** `node tools/nob-check.ts local/StarRang/SRANGERS/MAIN/SR.NOB`。期望 59 个 TEX、28 个 BITM、3 个 MFDD 的全部记录，3 个 CCKD 的全部字体表，以及 DATA，都通过。
  - 任何实例被拒绝时，本子任务为 blocked。记录原因与受影响的 AC-14，按证据修订 spec，不放宽为静默接受。
- **原版文档：** 像 [imfat §6](../../../../original/formats/imfat.md#6-observed-maxima-against-the-readers-limits-confirmed) 那样，把观察最大值与本任务限值的对照写入 [textures](../../../../original/formats/textures.md)；字体单元写入 [hud](../../../../original/formats/hud.md)。附置信度与检查命令，更新 `updated:`。
- **工具指南：** 在 [tools](../../../../guides/tools.md) 新增 nob-check 一节：用途、命令、输出字段与隐私约束；[AGENTS.md](../../../../../AGENTS.md) 中的命令说明若不再准确，同步更新。

## 不包含

- CCKD 元素、TABL 记录与 ANIM：容器归 P2-07，编码 1 不支持。
- 生产转换路径与本地基准：归 [10](./10-local-base-check.md)。

## 关键文件与契约

- **修改：** [nob-check.ts](../../../../../tools/nob-check.ts)、[textures](../../../../original/formats/textures.md)、[hud](../../../../original/formats/hud.md)、[tools](../../../../guides/tools.md)，按需 [AGENTS.md](../../../../../AGENTS.md)。
- **复用：** 03 的源结构读取；仓库工具可以使用全部能力。
- **前提：** 本地存在 `local/StarRang/SRANGERS/MAIN/SR.NOB`（2026-10-05 已存在）；缺少时本子任务为 blocked。

## 验收标准

- [x] AC-14：全部 TEX、BITM、MFDD 记录，CCKD 字体表与 DATA 通过结构校验；有嵌入调色板的图像索引都在范围内；输出只有计数、失败原因与观察最大值。
- [x] 观察最大值都在 spec 的结构限值内，并已写入 textures 与 hud，附命令与置信度。
- [x] 工具指南记录 nob-check 的命令与输出；`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- 本地运行工具，证据只记录命令、各类计数与观察最大值，不粘贴原版内容或私人绝对路径。
- 不适用 browser-testing。
- 完成前按 execute-goal 流程以本子任务 diff 为范围做 rubber-duck 审查与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据

- **实现（2026-10-05）：** [nob-check.ts](../../../../../tools/nob-check.ts) 改用 03 的源结构读取。
  - **核对内容：** DATA 用 `readDataPalette`；TEX/BITM 整条目与 MFDD 两个列表中的全部记录用 `decodeImageRecord`；有嵌入调色板时先用 `readEmbeddedPalette` 读出，再用转换器同一个 `checkPaletteIndices` 核对不透明像素索引；CCKD 用 `readCockpitFonts`。M2ID、NEBC、MESH、MODL 的检查不变。
  - **输出：** 每类的通过数与失败数、解码与核对索引的记录数，以及按类型的观察最大值。失败为 `code@结构位置`；研究用解析器与交叉引用失败为固定文本，其他异常为 `internal-error`。文件无法读取或封包不合法时不输出宿主错误文本。
  - `checkPaletteIndices` 是 [source-graphics.ts](../../../../../src/original-data/conversion/source-graphics.ts) 新增的共用校验，[convert-graphics.ts](../../../../../src/original-data/conversion/convert-graphics.ts) 也改用它，并在 [source-graphics.test.ts](../../../../../src/original-data/conversion/source-graphics.test.ts) 中补了正负用例。
- **本地运行（AC-14，2026-10-05）：** `node tools/nob-check.ts local/StarRang/SRANGERS/MAIN/SR.NOB`，退出码 0：
  - TEX 59、BITM 28、MFDD 3、CCKD 3、DATA 1 全部通过，0 失败；其余 MESH 486、MODL 19、NEBC 2、M2ID 1 通过（MESH 共 13,166 个顶点、13,285 个三角形，与改动前相同）；
  - 解码 123 条图像记录（59 TEX、28 BITM、36 条 MFDD 记录）。其中 64 条有嵌入调色板（58 TEX、6 BITM），不透明像素索引全部在范围内；
  - 观察最大值：TEX 图像 256×256、调色板 256 项；BITM 图像 640×316、调色板 256 项；MFDD 图像 96×96；DATA 256 项；CCKD 最大字体单元 8×8，见到的单元为 4×6 与 8×8。全部在 spec 的结构限值内：宽 640（安全上限，BITM 恰好达到）、高 480、调色板 256、字体宽 8、高 8。
  - 没有实例被拒绝，本项不需要修订 spec。
  - 另核对安全失败路径：不存在的文件只输出 `x.NOB: the file cannot be read`；非 IMFAT 文件输出 `invalid-archive@archive`；退出码都为 1。
- **原版文档：**
  - [textures §5](../../../../original/formats/textures.md#5-observed-maxima-against-the-p2-05-limits-confirmed) 新增观察最大值与 P2-05 限值的对照表（格式规则与安全上限分开说明），以及 123/64 条记录的核对结论，标为已确认，附命令；
  - [hud §1](../../../../original/formats/hud.md#1-bitmap-fonts-confirmed) 补充三个 CCKD 的字库目录顺序（表 0、1 为 8×8，表 2 为 4×6），以及观察单元与限值的对照。

  只含 ID、计数与尺寸，没有原版字节。
- **工具文档：** [tools](../../../../guides/tools.md#封包结构核对) 新增“封包结构核对”一节（核对内容、输出、失败文本与退出码），并更新工具表；[AGENTS.md](../../../../../AGENTS.md) 的命令说明改为包含 DATA、失败 code 与观察最大值。
- **测试与工程：** `pnpm exec vitest run src/original-data/conversion` 5 个文件 125 项通过；`pnpm typecheck`、`pnpm lint`、`pnpm check` 与 `pnpm check:original` 通过。
- **Rubber-duck：**
  - **High：** 读取文件、解析封包与未知异常可能输出宿主错误文本。已改为安全的失败文本，并对这两条路径做了本地核对。
  - **Medium：** 原版文档引用的证据当时尚未写入。现已在本节写入。
  - **Low：** 字体输出未明确最大单元。已改为“最大单元加见到的单元”。

  审阅者确认索引核对与转换器共用、RLE 透明像素被忽略、MFDD 两个列表都已遍历。
- **Simplify：** 采纳：
  - 索引范围核对提取为共用的 `checkPaletteIndices`（两位审阅者提出），转换器与工具都调用它；
  - 统计改为按类型对象，含字体单元集合；
  - 计数改用取或建的辅助函数。

  未采纳：
  - 复用 content 的 `expandImage`：它属于 content 层，`original-data` 的诊断须为 `source` 层；
  - 合并重复读取的 36 字节头：这是 03 审查后有意保留的，约 123 条记录的开销可忽略。
- **文档影响：** 除上述原版文档与工具文档外，[源码结构](../../../../engineering/modules/original-data.md#图形转换)补充了 `checkPaletteIndices`。

