---
type: plan
status: active
phase: P3
task: "03"
subtask: "25"
updated: 2026-10-09
---

# 25 — HUD 文字的 payload 契约

**契约来源：** [spec](../spec.md) 修订 1 的 S-08、AC-06（HUD 文字）、AC-11、AC-14（结构限值）、AC-18；[规范 payload](../spec.md#规范-payload) 的 `hud-text` 行、[字段处理规则](../spec.md#字段处理规则) 8、[限值的取值](../spec.md#限值与预算)、[错误](../spec.md#错误)、技术决定 14。
**依赖：** 06, 09, 24。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 在计划新增的 `src/content/hud/hud-text-payload.ts` 中定义 `data/hud/text`（角色 `hud-text`）的规范内容与 payload，沿用 [view-labels-payload.ts](../../../../../src/content/hud/view-labels-payload.ts) 与 [canonical-json.ts](../../../../../src/content/canonical-json.ts) 的严格读取设施：
  - **键集：** 恰为闭包 #47 的 64 个区域，按 [executable 的 HUD、地图与通讯文字](../../../../original/formats/executable.md#hud-map-and-communications-text-from-the-exe-p3-0324)逐条对应。键名按仪表与用途用中性名（例如目标显示屏的无目标行、地图中种类 0x01 的种类词、种类 0x80 的计数行），不含原版文字。键集与顺序是 schema 常量。
  - **格式常量：** 每个键是否交给格式化，以及预期的转换序列（`%d`、`%.0f`、`%s`、`%%`，按文档逐条），作为与键集并列的 schema 常量导出，供 26 的转换器复用。
  - **payload：** `entries` 为键到字节串的对象，每个字节 1–255，不含结尾 NUL；schema 版本 1。
  - **读取器：** 严格解码、冻结、与输入隔离；缺键、多键、类型错误、非规范编码、字节越界、超长、以及格式化键的转换序列与常量不符，都按 code 拒绝。内容层错误码复用 `invalid-flight-data-payload`（与 `view-labels` 相同）与 `non-canonical-payload`；不新增错误码。
  - **限值：** 单条文字字节数 `textBytes` = 32，即观测最大值 15 字节（含 NUL）的 2 倍向上取整到 2 的幂；payload 字节上限按同一规则由 64 条的上限推导。读取器与转换器共用这组常量，在分配之前判定。
  - **格式核对函数：** 导出纯函数，按 C `printf` 的转换语法扫描字节串，得到转换序列，供读取器与 26 共用；不展开格式，也不实现格式化。
- 测试（`hud-text-payload.test.ts`）：往返逐字节相同；AC-11 的全部拒绝项；`textBytes` 恰为 32 通过、33 拒绝；格式化与非格式化键各自的转换序列核对（含 `%%`、多个转换、无转换却出现 `%`）；结果冻结与隔离。合成文字只由代码生成，不含原版文字。

## 不包含

- EXE 区域的读取、生产映射、图形步骤接线与切片定义：归 26。
- 文字的绘制、格式化与可达性：归 P3-13。
- 文档同步：由 22 完成；本项在完成证据中列出 API、键集的命名规则与限值。

## 关键文件与契约

- [view-labels-payload.ts](../../../../../src/content/hud/view-labels-payload.ts)、[status-messages-payload.ts](../../../../../src/content/hud/status-messages-payload.ts)（只读）：同组 data payload 的先例。
- [canonical-json.ts](../../../../../src/content/canonical-json.ts)、[contract-validation.ts](../../../../../src/content/contract-validation.ts)（只读）：规范 JSON 与错误码。
- [executable 的 HUD、地图与通讯文字](../../../../original/formats/executable.md#hud-map-and-communications-text-from-the-exe-p3-0324)：64 个区域、转换与用途。
- `src/content/hud/hud-text-payload.ts`（新建）。

## 写入范围

- `src/content/hud/hud-text-payload.ts`：键集、格式常量、限值、编码与读取器（新建）。
- `src/content/hud/hud-text-payload.test.ts`：测试（新建）。
- `src/content/hud/hud-text.test-support.ts`：合成内容（新建）。

## 验收标准

- [x] 键集恰为 64 个，与 executable 的 #47 区域一一对应；格式常量与文档逐条一致（证据列出按仪表的计数核对）。
- [x] AC-11：往返逐字节相同；缺键、多键、类型错误、非规范编码、字节越界、超长、转换序列不符都按 code 拒绝；结果冻结并与输入隔离。
- [x] AC-14：`textBytes` 恰等于 32 时通过，超出 1 时被读取器拒绝（错误码与 `view-labels` 的同类拒绝相同）；payload 字节上限在解析前判定。
- [x] AC-18：源码与测试中没有原版文字；`content/` 不导入 `original-data`。
- [x] `pnpm exec vitest run src/content tools/engineering-boundaries.test.ts`、`pnpm typecheck` 与 `pnpm lint` 通过。

## 验证方法

- Node 单元测试，使用代码生成的字节串。
- 键集与格式常量的核对：对照 executable 的表格逐条，证据只记计数与地址，不记文字。

## 完成证据

2026-10-09，worker 分支 `exec-p3-03-25`（基于认领提交 `c496e5f`）。

- **API（[hud-text-payload.ts](../../../../../src/content/hud/hud-text-payload.ts)，供 22 写入 content 分册、供 26 只读使用）：**
  - `HUD_TEXT_ROLE`（`hud-text`）、`HUD_TEXT_SCHEMA_VERSION`（1）。
  - `HUD_TEXT_FORMATS`：键到格式的冻结常量，键序即 schema 顺序。值为 `null` 表示代码逐字节绘制（`%` 字节按字形绘制，不核对）；否则是交给 `0x74a3f` 的格式串，值为按出现顺序的转换序列（`HudTextConversion`：`%d`、`%.0f`、`%s`、`%%`），无参数的格式串为空数组。
  - `HudTextKey`、`HUD_TEXT_KEYS`（64 个键，按 schema 顺序，也是 `entries` 的规范字段顺序）。
  - `HUD_TEXT_LIMITS`：`textBytes` 32、`payloadBytes` 16,384。
  - `scanFormatConversions(text)`：按 C `printf` 的转换语法（`%%` 须完整；标志、宽度、精度、长度修饰与转换字符）扫描字节串，返回冻结的转换说明序列（各为从 `%` 到转换字符的原样子串）；某个 `%` 不能构成完整说明时返回 `undefined`。不展开、不格式化。
  - `matchesHudTextFormat(key, text)`：逐字节键总为真；格式串须恰有常量所列的转换序列。读取器用它报内容层错误；26 的转换器可用它报 `source` 层的 `unsupported-payload`。
  - `readHudText`、`encodeHudTextPayload`、`decodeHudTextPayload`；payload 为 `{ entries }` 的规范 ASCII JSON。合成内容见 [hud-text.test-support.ts](../../../../../src/content/hud/hud-text.test-support.ts) 的 `syntheticHudText(prefix)` 与 `syntheticHudTextEntry(key, prefix)`。
- **键的命名规则：** 仪表前缀加用途，用途取自 [executable 的 HUD、地图与通讯文字](../../../../original/formats/executable.md#hud-map-and-communications-text-from-the-exe-p3-0324)的描述，不含原版文字。前缀为 `target`（目标显示屏）、`barGauge`（0–3 型条形仪表）、`overlay`（飞行叠加）、`map`（战略地图；地图/Warp 标记的名称为 `mapMarkerName`）、`mapInfo`（信息窗；种类词与计数行以十六进制种类位结尾，例如 `mapInfoKindWord0x1`、`mapInfoKindCount0x80`）、`left`（左侧显示屏的能量页、通讯面板与 Warp 页）、`indicator`（9 型与 12 型指示）。键序沿用 executable 中表格与列表的顺序；每个键的类型注释给出 EXE 地址与绘制条件。
- **AC 1（键集与格式常量）：** 按仪表的计数核对（区域数／其中格式串数）：目标显示屏 11/9、条形仪表 4/0、飞行叠加 8/3、地图标记名称 1/0、战略地图 5/4、信息窗 23/23（10 个无参数的种类词、`%s` 名称 1、`%.0f` 位置 3、`%d` 计数行 9）、左侧显示屏 9/0、指示 3/0，合计 64/39。39 条格式串中 25 条带参数转换、14 条无参数（其中 1 条只有 `%%`），含 `%%` 的共 4 条；逐字节 25 条。测试用独立的有序表锁定全部 64 个键与格式，另按前缀核对上述计数。
  - **本地核对（只读，输出在 `local/research/p3-03/hud-text-payload/`，被忽略）：** `verify.ts` 经已验证来源链与共享 LE 读取器读取 64 个区域，用本模块的常量、扫描函数与读取器核对，只输出结论与计数（`out/verify.json`）：64 个键与区域一一对应，区域共 467 字节（含 NUL），64/64 只在末尾有 NUL 且不超过 `textBytes`，39/39 条格式串的转换序列与常量逐条（含顺序）一致；25 条逐字节文字中 1 条含 `%` 字节且不能当作无转换的格式串扫描，因此逐字节键不做核对；严格读取器接受由这 64 条组成的内容，编码为 2,018 字节。
- **AC-11：** `hud-text-payload.test.ts` 覆盖往返逐字节相同（含转义、键按 schema 顺序、输入键序不影响编码）；缺键、多键（键名不回显）、`entries` 不是记录或为 null、未知字段、类型错误、NUL、码位超过 255、超长与转换序列不符都为 `invalid-flight-data-payload` 并带结构路径；空白、键序、可打印字符的转义、大写转义与重复键为 `non-canonical-payload`；描述符的角色与 kind 为 `invalid-flight-data-payload`，schema 不是 1 为 `unsupported-payload-schema`，有依赖为 `flight-data-reference-mismatch`；结果深度冻结，修改输入、字节或先前结果不影响后续读取；诊断不含标记文字。转换核对含 `%%`、多个转换及其顺序、无转换的格式串中出现 `%` 或转换，以及逐字节键接受 `%`。没有新增错误码。
- **AC-14：** `textBytes` = 32：观测最大值 15 字节（含 NUL）的 2 倍为 30，向上取整到 2 的幂；逐字节、带两个转换与无参数的键恰为 32 时通过，33 时被读取器拒绝（`invalid-flight-data-payload`，与 `view-labels` 相同）。`payloadBytes` = 16,384：64 条 32 字节、每字节都需 6 字符转义时的编码为 13,903 字节，向上取整到 2 的幂，测试按同一规则推导并核对它是最小的这种幂；最长内容的编码在上限内并先经 `reserve` 计量。超过上限 1 字节时在解析与描述符之前拒绝，恰为上限时进入 JSON 解析。键集是固定的格式规则，不是可调上限。
- **AC-18：** 合成文字由代码生成（前缀、键序号与常量中的转换），测试的标记文字证明诊断不回显内容；源码只含地址、条件与转换符。`content/` 不导入 `original-data`（ESLint 与工程边界回归通过）。`node tools/compliance/cli.ts original`（新文件以 intent-to-add 纳入）：index 1,036、worktree 1,036、untracked 0、build 9 个文件，`passed: true`，没有发现。
- **检查：** `pnpm exec vitest run src/content tools/engineering-boundaries.test.ts`（36 个文件、1,482 项）、`pnpm typecheck`、`pnpm lint` 与 `pnpm check`（181 个文件、5,767 项，构建通过）都通过。变异检查：让格式核对恒为真、或把文字上限放宽 1 字节，测试分别有 4 项与 2 项失败。
- **Rubber-duck：** 没有阻塞意见。1 条非阻塞意见已采纳：键序由常量派生，原测试只按类别计数与抽查，不能锁定全部键与格式；已加入独立的 64 项有序表。
- **Simplify：** efficiency 无发现。已删除被有序表覆盖的逐键抽查。未采纳：把字节串与记录读取提取为可指定错误码的共享函数（`rule-data-fields.ts`、`contract-validation.ts` 不在写入范围，与 `view-labels` 的先例相同，可由后续清理统一）；把扫描函数改为只比较四种记号（子任务要求按 C `printf` 语法扫描并导出给 26）。
- **文档影响：** 文档同步归 22，本项不改文档；executable 的区域、转换与计数与实现一致，无需更正。建议 22 在 content 分册记录上述 API、命名规则与限值。STATUS 与阶段索引无需改动。
