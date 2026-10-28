---
type: plan
status: active
phase: P3
task: "13"
subtask: "15"
updated: 2026-10-28
---

# 15 — 索引色图元、字形与格式化

**契约来源：** [spec](../spec.md#二维绘制语义与调色板) 的 S-03，AC-05/06。
**依赖：** 10。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 按 Q 结论实现不透明/颜色键/覆盖掩码、图元像素集合、安全屏幕边界与无单元裁剪，保留索引 0 的不透明用途。
- 字体读取规范 glyphRows/8 列、独立 advance、高度、大写与 charMap；DIAG 换行先分行。
- 实现已用格式的封闭转换和数值/长度边界；项目文字与原版字节字符串分开，不吞未知字符或引用。
- 直接使用已经扩展的 8 位 palette；不再解析原始 RLE。

## 不包含

不建 DOM/Canvas 2D 文字渲染，不决定游戏数值或修改现有 parser。

## 关键文件与契约

- [font-payload.ts](../../../../../src/content/graphics/font-payload.ts)、[glyph-lookup.ts](../../../../../src/content/graphics/glyph-lookup.ts)、[hud-text-payload.ts](../../../../../src/content/hud/hud-text-payload.ts)。
- 计划新增 `src/render/cockpit/raster/`，纯像素/字体/格式化及合成测试。

## 写入范围

- `src/render/cockpit/raster/**`：计划新增 helper 与测试。

## 验收标准

- [x] 字形跨 advance、含端点图元、四色边界和 palette0/1 颜色都精确。
- [x] 负数、舍入、阈值、%%、换行、未知转换明确处理。
- [x] 输入不被修改，无重复 VGA 扩展，无原版文本硬编码。

## 验证方法

`pnpm test -- src/render/cockpit/raster`、`pnpm check`；负对照断言像素差而非只检查调用；[simplify](../../../../../.agents/skills/simplify/SKILL.md) 限已有绘制需求。

## 完成证据

- **实现（`src/render/cockpit/raster/`，纯 TypeScript，无 DOM/GPU）：**
  - [indexed-surface.ts](../../../../../src/render/cockpit/raster/indexed-surface.ts)：`createIndexedSurface(w, h, coverage?)`（≤ 640 × 480；覆盖掩码 1 位/像素，与图像掩码同布局，DC-05/DC-08）、`isCovered`、`plot`（`0x5afe0`）、`fillRect`（`0x5aad0`，含端点；覆盖）、`clearRect`（填 0 并取消覆盖，即世界层之前的清除/擦除）、`outlineRect(x, y, w, h)`（`0x5a170`，两尺寸都 > 1 才画）、`drawLine`（`0x5ad00`，两端都画，2|dx| > 2|dy| 才 x 为主轴，误差 ≥ 0 步进）、`drawCircle(…, steps?)`（`0x5a390`/`0x5a4d4`）、`fillDisc(…, clip?)`（`0x5a930`/`0x5bca0`）、`blit(surface, source, x, y, 'opaque' | 'key' | 'mask', from?)`（`0x59608`/`0x59cbc`、`0x59774`/`0x59d38` 与图像掩码；源矩形含端点、按线性字节读取，越过行尾读下一行首像素，覆盖状态页 97 列复制与能量页列 0..w）、`resolveRows`（直接用已扩展的 8 位 palette，未覆盖像素为透明）与 `toInt16`。
  - [glyph-text.ts](../../../../../src/render/cockpit/raster/glyph-text.ts)：`hudFont(payload, advance, upperCase)`（advance 与 `cellWidth` 分开）、`drawText`（前 `height` 行、8 列，不按单元裁剪；起点先截为 16 位；fonts/1 只把 0x61–0x7A 大写后经 `glyphsFor` 查映射，映射外为 `unmapped-character` 且不画任何像素）、`splitLines`（DIAG 先按 0x0A 分行）、`wholeGlyphRange`（hud §4.7 第 6 步，左侧无半字、末字单元止于 x1 − 3）。
  - [text-format.ts](../../../../../src/render/cockpit/raster/text-format.ts)：`textFormatConversions`、`formatText(format, args, maxBytes)`：只接受 `%d`（i32）、`%.0f`（有限且 |x| < 10¹⁶，平分取偶，符号按符号位）、`%s`（字节 1–255）、`%%`；其他 `%` 序列（含宽度、精度）为 `TextFormatError('unknown-conversion')`，实参个数/类型/范围与结果长度（DIAG 用 79）均有明确错误码，由调用方转为内容契约错误。
- **范围政策：** 屏幕外像素一律安全舍弃，不抛错；只有原版以 16 位传入且决定循环长度的参数（线段端点、半径）限于 i16，越界为调用方 `RangeError`（原版调用方自行截为 `short`，可用 `toInt16`）。|dx| 或 |dy| ≥ 16384 时原版 16 位误差项会溢出，此处按精确算术画线，属未复现且屏幕内调用不可达。反向角点的填充不画（原版无符号计数越界，不复现）。
- **测试（合成字体、图像与调色板）：** `pnpm exec vitest run src/render/cockpit/raster` → 3 个文件 35 项通过。关键断言：
  - 线段 (0,0)→(4,2) 与反向得到不同像素集，并对“> 0 步进”变体断言 (1,0)/(3,1) 未写；屏幕四边裁剪不跨行回绕。
  - 半径 3 圆的 16 点、1 步的部分圆 12 点、0 步只剩轴点；半径 20、每八分圆 10 步的准星环 84 像素、整圆 112 像素，与 hud §4.6 的截图计数一致；圆盘逐行跨度与裁剪框差异。
  - opaque/key/mask 三种复制在索引 0 与掩码透明像素上的像素差与覆盖差；颜色 0 的填充覆盖而 `clearRect` 不覆盖（索引相同、解析结果不同）。
  - 字形：步进 6 时第二字从 x+6 开始、第一字第 7 列落在下一格内，步进 8 的负对照像素不同；高度 6 不画第 6–7 行；大写只改 a–z（0x7B、0xE1 仍为映射外）；换行先分行；16 位截断。
  - palette：索引 0/1 解析为导入的 8 位值（(1,2,3)、(255,127,65)），负对照断言不是 ×4 扩展的 (4,8,12)；越界索引为 `palette-index-out-of-range`。
  - 格式化：0.5/1.5/2.5/3.5/4.5 → 0/2/2/4/4（负对照：`Math.round` 与 `toFixed`），−0.4 → `-0`，i32 边界与越界，`%%`、`%s` 字节，`%x`/`%5d`/`%15s`/`%.1f`/结尾 `%` 报位置，79 字节通过、78 上限报 `result-too-long`；输入（图像、字体、调色板、实参）断言未改变。
- **`pnpm check`：** 通过（typecheck、lint、401 个测试文件 11,017 项、生产构建；只有既有的 >500 kB 块体积警告）。
- **性能抽查（本地一次性脚本，已删除）：** 640 × 480 的 `resolveRows` 约 1.2 ms，整屏不透明 `blit` 约 0.06 ms，整屏颜色键 `blit` 约 1.6 ms。
- **Rubber-duck：** 只读 code-review 代理按验收、spec 与 hud §4.1 核对。两条意见均采纳：① `resolveRows` 与 `blit` 的逐像素开销过高 → 改为逐行内联、不透明复制整行拷贝，测得结果见上；② 超出 ±8191 一律抛错违反“屏幕外写入安全舍弃” → 改为上述范围政策，文字按原版截为 16 位，并补测远处坐标被舍弃。其余（线段、圆、圆盘、外框、线性读取、索引 0、平分取偶、输入不变、无原版文字）确认无误。
- **Simplify：** 按 simplify 的四个角度自查本子任务 diff：字形查找改为复用 `glyphsFor`，`blit` 逐行裁剪、不透明路径整行复制；未发现其他可复用的现有 helper（`scanFormatConversions` 是通用 printf 语法扫描，不是白名单）。复查后重跑上述测试与 `pnpm check`。
- **文档影响：** 不涉及原版事实，`docs/original/` 与 unknowns 不变。`docs/engineering/modules/render.md` 尚无驾驶舱章节，建议由协调者在其驾驶舱说明中链接本目录的 API（写入范围外，已在 worker 报告中提出）。STATUS 与 phase `tasks.md` 不需变化。
- **私有输出：** 无；只读参考了 `local/research/p3-13/` 下 02、03、04、06 的研究记录。
