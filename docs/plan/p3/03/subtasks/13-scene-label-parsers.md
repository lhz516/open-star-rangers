---
type: plan
status: active
phase: P3
task: "03"
subtask: "13"
updated: 2026-10-09
---

# 13 — RENS 头部与视角标签解析器

**契约来源：** [spec](../spec.md) 的 S-08（`view-labels`）、S-09（`scene-settings`）、S-15、AC-06（视角标签）、AC-07（RENS 头部）、AC-14（结构限值）、AC-18。
**依赖：** 09。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **RENS 头部：** 新增解析器，按 04 的结构类型化读取 RENS 10751 的 +0x00–+0x57，产出 09 的 `scene-settings` 内容。非有限浮点为 `invalid-payload`；只在基准中为零的位置非零为 `unsupported-payload`。+0x58 起的记录数组不在本项范围内，现有效果步骤对它的读取保持不变。
- **视角标签：** 新增解析器，读取 TABL 10399 的 13 个字串指针，只取第 8 项，文字为字节串，须在块内以 NUL 结束；产出 `view-labels` 内容。第 0–7 项与第 9–12 项不转换，只检查定位所需的结构。
- 沿用 payload-block 的指针与边界规则；结构超限用 06 的限值名。
- 用代码生成的合成 RENS 块与 TABL 10399 块编写测试：各字段类型、负值与 `f32`；非有限值、未登记指针、缺少 NUL、超长与越界的拒绝；其他标签改变时结果不变。

## 不包含

- 来源映射与转换：归 16（视角标签）、17（场景设置）。
- 灯光与闪光的表现规则：归 P3-12。
- 模块分册：由 22 同步。

## 关键文件与契约

- [payload-block.ts](../../../../../src/original-data/formats/payload-block.ts)（只读）；[effect-step.ts](../../../../../src/original-data/conversion/effect-step.ts)（只读）：RENS 记录的现有读取。
- 09 新增的 `src/content/flight/` 与 `src/content/hud/view-labels-payload.ts` 类型；04 写入 [executable](../../../../original/formats/executable.md) 与 [hud](../../../../original/formats/hud.md) 的结构。
- 计划新增：`src/original-data/formats/rens-header.ts`、`view-labels.ts` 与它们的测试和合成支持。

## 写入范围

- `src/original-data/formats/rens-header.ts`：RENS 头部解析（新建）。
- `src/original-data/formats/rens-header.test.ts`：测试（新建）。
- `src/original-data/formats/rens-header.test-support.ts`：合成 RENS 块（新建）。
- `src/original-data/formats/view-labels.ts`：TABL 10399 第 8 项解析（新建）。
- `src/original-data/formats/view-labels.test.ts`：测试（新建）。

## 验收标准

- [x] AC-07（RENS 部分）：头部各字段按类型转换；坏输入按 code 拒绝。
- [x] AC-06（视角标签部分）：第 8 项转换正确，保留 128–255 的字节；缺少 NUL、超长与越界按 code 拒绝；其他项不出现在结果中。
- [x] AC-14：每个结构限值恰等于上限时通过，超出 1 时为 `limit-exceeded`。
- [x] AC-18：诊断不回显数值或文字；测试不读取文件。
- [x] `pnpm exec vitest run src/original-data/formats tools/engineering-boundaries.test.ts` 与 `pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- Node 表驱动测试，使用代码生成的合成块。不涉及浏览器或原版数据。

## 完成证据

- **实现：**
  - [rens-header.ts](../../../../../src/original-data/formats/rens-header.ts)：`parseRensHeader(archive, read): SceneSettings` 按 executable 的 RENS 头部表类型化读取 +0x00–+0x57（`f32` 颜色与设备值、+0x18 槽的低字节、三组闪光的 u32/`f32`/u32/i32，+0x48 作为类型已确认的掩码照常转换）；+0x19–+0x1B 非零为 `unsupported-payload`（`/reserved`）；非有限 `f32` 为 `invalid-payload`，来源中的 −0.0 先按位判定为 `unsupported-payload`（规范 JSON 不能承载 −0）；不读 +0x58 起的记录表，[effect-step.ts](../../../../../src/original-data/conversion/effect-step.ts) 未改。导出 `RENS_HEADER_LAYOUT`（`readBytes` 0x58、`headerBytes` 0x60、`recordBytes` 28）与 `RENS_HEADER_LIMITS`。
  - [view-labels.ts](../../../../../src/original-data/formats/view-labels.ts)：`parseViewLabels(archive, read): ViewLabels` 只核对 13 个指针的表在块内与第 8 项：指针须登记且目标在块内（否则 `invalid-payload`），目标落在指针表内为 `unsupported-payload`（字段处理规则 4）；文字须在 `VIEW_LABELS_LIMITS.textBytes` 内以 NUL 结束，字节 1–255 原样保留，重定位不得覆盖文字或 NUL；空标签按内容契约（0–32 字节）接受。第 0–7 与 9–12 项的指针与文字不检查也不转换。导出 `VIEW_LABEL_TABLE`（`labels` 13、`pointerBytes` 4）与 `VIEW_LABEL_LIMITS`。
  - [rens-header.test-support.ts](../../../../../src/original-data/formats/rens-header.test-support.ts)：`syntheticRensSettings()`（09 的合成场景设置，经严格读取）、`rensHeaderBytes(settings)`（+0x00–+0x57，`ByteWriter`）与 `syntheticRens(settings, records)`（含重定位的 +0x58 指针、+0x5C 计数与样式记录），可供 16、17 组装合成 RENS 条目。TABL 10399 的合成块在 `view-labels.test.ts` 内生成（写入范围不含其测试支持文件）。
- **限值（AC-14）：** 限值名沿用 06 的 `payloadEntryBytes` 与 `textBytes`。TABL 10399 条目 512 字节（观测 242 的 2 倍取 2 的幂）；视角标签文字 32 字节（09 的 `VIEW_LABELS_LIMITS.textBytes`，读取器共用）。RENS 条目 2,048 字节：观测 376 的 2 倍为 1,024，低于效果步骤已接受的 0x60 + `EFFECT_LIMITS.effectRecords` × 28 = 1,888 字节，按“不低于既有限值”取后者向上的 2 的幂；测试核对它是 2 的幂且是覆盖该界的最小者。恰等于上限通过、超出 1 为 `limit-exceeded`（含 `limit`、`observed`）的用例覆盖两个条目限值与文字限值。
- **测试：** [rens-header.test.ts](../../../../../src/original-data/formats/rens-header.test.ts)（57 例）：逐字段按类型转换（最小次正规数、最大 `f32`、负值、u32 最高位、i32 两端、≥128 的设备字节），另一组合成值证明数据来自输入，零值原样保留，结果深度冻结，并经 `readSceneSettings` 与 `encode/decodeFlightDataPayload` 原样往返；记录表内容、计数与 +0x58 的登记不影响结果；12 个 `f32` 位置的 NaN/±∞ 为 `invalid-payload`、−0 为 `unsupported-payload`；+0x19–+0x1B 各字节非零；各字段上的重定位；块短于 0x58。[view-labels.test.ts](../../../../../src/original-data/formats/view-labels.test.ts)（11 例）：第 8 项保留 1、0x7F、0x80、0xFF；不同文字与空标签；经 `readViewLabels` 与 `encode/decodeViewLabelsPayload` 往返；其他项的文字、长度、空指针、未登记、越界与缺 NUL 都不改变结果；缺少 NUL、未登记、空、越界与指向指针表的指针、覆盖文字或 NUL 的重定位、块短于指针表。诊断经 `sourceFailure` 核对位置语法且不含 MARKER 或写入的字节值（AC-18）；测试只用代码生成的块，不读文件。
- **检查：** `pnpm exec vitest run src/original-data/formats tools/engineering-boundaries.test.ts`（8 个文件 418 例通过）、`pnpm typecheck`、`pnpm lint` 通过；`pnpm check` 通过（166 个文件 5,150 例与生产构建）；`pnpm check:original` 为 `passed: true`。
- **Rubber-duck：** 指出指向指针表的已登记指针应按字段处理规则 4 为 `unsupported-payload` 而不是 `invalid-payload`，已改正并补测试；RENS 限值推导、−0 检测、空标签与不检查其他项的处理未发现问题。
- **Simplify：** 测试改用既有的 `sourceFailure`、`deepFrozen` 与 `ByteWriter`，去掉未用的 `reserved` 参数与闪光偏移表。未采纳：`f32` 为检测 −0 先读一次 u32（每次解析多 12 次读取，可忽略；更好的做法是在 `payload-block.ts` 中提供保留 −0 判定的读取，超出写入范围）；`readLabel` 与 `scen.ts` 的 `readMessage` 相似（空文字与限值不同），合并为 `payload-block.ts` 的共用字节串读取同样超出范围，交协调者考虑。
- **文档影响：** 格式事实与 U 项不变（只按 executable 与 hud 已记录的结构实现）。交 22 的原版数据分册条目：`formats/rens-header.ts`（`parseRensHeader`、`RENS_HEADER_LAYOUT`、`RENS_HEADER_LIMITS.entryBytes` 2,048 及其推导）与 `formats/view-labels.ts`（`parseViewLabels`、`VIEW_LABEL_TABLE`、`VIEW_LABEL_LIMITS.entryBytes` 512、文字限值共用 `VIEW_LABELS_LIMITS.textBytes`），以及上述错误码与位置（`/lightType3Colour[i]`、`/deviceByte`、`/reserved`、`/deviceValues/*`、`/screenFlashes[i]/*`、`/header`、`/labels`、`/labels[8]`）。STATUS 与阶段索引无需改动。
