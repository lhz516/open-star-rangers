---
type: plan
status: active
phase: P3
task: "03"
subtask: "26"
updated: 2026-10-09
---

# 26 — HUD 文字的转换与装配

**契约来源：** [spec](../spec.md) 修订 1 的 S-08、S-14、S-15、AC-06（HUD 文字）、AC-12、AC-13、AC-14、AC-16、AC-18；[Asset 与角色](../spec.md#asset-与角色)的 `data/hud/text` 行、[切片定义版本 4](../spec.md#切片定义版本-4)、[来源映射与核验](../spec.md#来源映射与核验)、[限值与预算](../spec.md#限值与预算)、技术决定 14。
**依赖：** 25, 27。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **读取与核对：** 用 [executable-text.ts](../../../../../src/original-data/formats/executable-text.ts) 的 `readExecutableText`（必要时推广为按区域表读取）读取闭包 #47 的 64 个区域：每个区域恰好覆盖字串及其 NUL；字节须为 1–255；超长在读取前按区域长度判定。用 25 的格式核对函数与格式常量核对每条：转换序列或是否交给格式化与常量不符时为 `source` 层的 `unsupported-payload`，位置为区域 locator 与键的结构路径，不回显文字。
- **生产映射：** 计划新增的 `production-hud-text.ts` 定义 `data/hud/text` 的映射（64 个 EXE 区域，locator 按 [executable 的 HUD、地图与通讯文字](../../../../original/formats/executable.md#hud-map-and-communications-text-from-the-exe-p3-0324)，顺序与 25 的键集一致）与声明，置信度 `confirmed`，附 U-030、U-026 的说明。
- **图形步骤：** 生成 cockpit-hud-map 组的图形步骤产出 `data/hud/text`（无依赖），与该步骤既有的 EXE 区域读取共用步骤内读取；映射在转换成功后升为 `verified`，来源状态绑定指纹。
- **切片定义：** [slice-definition.ts](../../../../../src/content/slice-definition.ts) 的版本 4 增加必需角色 `hud-text`（cockpit-hud-map，data，恰为 1）。版本号仍为 4。
- **份额与限值：** 在基准上以不设上限的限值运行图形步骤，取得 `data/hud/text` 的实际用量，按“2 倍向上取整到 2 的幂”推导份额（新增常量或并入既有的飞行图形份额，由本项决定并说明），`PRODUCTION_PACKAGE.limits` 由测试从份额推导一致。观测值与结果写入完成证据，只记计数。脚本与输出在 `local/research/p3-03/shares/`，使用新文件名，不覆盖 19 的输出。
- **合成数据：** 合成内容包加入 `data/hud/text`；Worker 的合成光盘的 EXE 加入 64 个代码生成的区域；读取日志断言包含这些区域。
- **测试：**
  - AC-06：64 条正向转换、保留 128–255 的字节；缺少 NUL、超长、区域越界与转换序列不符的拒绝；
  - AC-12：去掉 `data/hud/text` 时为 `incomplete`；
  - AC-13：区域映射核验与 `verified` 时机；
  - AC-14：新增份额维度恰等于份额通过、超出 1 为 `budget-exceeded`；
  - AC-16：合成作业的四组结果与读取日志。
- **本地核对：** 27 已使 `warp-arrival` 可转换；本项在基准上运行生产作业，确认得到 `complete` 的版本 4 包（含 `data/hud/text`），只记结论、计数与哈希，输出只在 `local/research/p3-03/shares/`。正式的本地核对由 21 完成。

## 不包含

- payload 契约、键集与格式常量：归 25（只读使用）。
- sound payload：归 27。
- 浏览器断言：归 20；本地 CLI 与独立读取：归 21；文档：归 22。
- 转换器组件：图形组件已由 19 递增为 `graphics-4`。本项不再递增，因为 19 的中间输出没有在真实来源上产生过完整的包（基准作业在 `flags` 8 处失败关闭），证据中写明。

## 关键文件与契约

- 25 的 `src/content/hud/hud-text-payload.ts`（只读）。
- [executable-text.ts](../../../../../src/original-data/formats/executable-text.ts)、[step-entry-reader.ts](../../../../../src/original-data/conversion/step-entry-reader.ts)、[graphics-step.ts](../../../../../src/original-data/conversion/graphics-step.ts)、[convert-graphics.ts](../../../../../src/original-data/conversion/convert-graphics.ts)、[production-graphics.ts](../../../../../src/original-data/conversion/production-graphics.ts)。
- [slice-definition.ts](../../../../../src/content/slice-definition.ts)、[production-package.ts](../../../../../src/workers/production-package.ts)、[import-job.ts](../../../../../src/workers/import-job.ts)。
- 计划新增：`src/original-data/conversion/production-hud-text.ts` 及其测试。

## 写入范围

- `src/content/slice-definition.ts`：新必需角色。
- `src/content/slice-definition.test.ts`：测试。
- `src/content/synthetic-content.test-support.ts`：合成包。
- `src/content/completeness.test.ts`：受角色影响的断言。
- `src/content/manifest-identity.test.ts`：受包形状影响的断言。
- `src/content/graphics/graphics-binding.test.ts`：受包形状影响的断言。
- `src/original-data/formats/executable-text.ts`：按区域表读取（如需推广）。
- `src/original-data/formats/executable-text.test.ts`：测试。
- `src/original-data/conversion/**`：映射、图形步骤、份额与受影响的测试。
- `src/workers/**`：合成光盘、生产包限值与受影响的测试。
- `src/app/**`：受包形状影响的测试。
- `src/platform/storage/**`：受包形状影响的测试。
- `tools/logic-check.ts`：受包形状影响时。
- `tools/logic-check.test.ts`：对应测试。
- `e2e/**`：受包形状影响的既有断言。
- `local/research/p3-03/shares/**`：份额推导与本地作业核对的新输出（被忽略）。

## 验收标准

- [x] AC-06（HUD 文字）：64 条转换正确，拒绝项按 code 与位置报告，诊断不回显文字。
- [x] AC-12：版本 4 含 `hud-text`；缺少时为 `incomplete`。
- [x] AC-13：64 个区域的映射核验与 `verified` 时机正确，来源状态绑定指纹。
- [x] AC-14：份额由基准观测推导并记录，`PRODUCTION_PACKAGE.limits` 由测试推导一致。
- [x] AC-16：合成作业四组 `group-complete`，读取日志只含映射的条目与区域。
- [x] 本地：基准上的生产作业得到 `complete` 的版本 4 包，结论只在 `local/`。
- [x] AC-18：合成文字只由代码生成；源码、测试与诊断中没有原版文字。
- [x] `pnpm check` 与 `pnpm test:e2e` 通过。

## 验证方法

- Node 测试：转换、映射、图形步骤、切片定义、作业与持有者，使用代码生成的合成光盘。
- 本地基准运行只在 `local/`；`pnpm check`、`pnpm test:e2e`。

## 完成证据

2026-10-09，worker 分支 `exec-p3-03-26`（基于认领提交 `966733b`）。

- **实现与 API（交 22 写入 original-data 分册）：**
  - [executable-text.ts](../../../../../src/original-data/formats/executable-text.ts)：`HudTextRegions` 与 `parseHudText(regions, read)`。按 `HUD_TEXT_KEYS` 的顺序逐个区域调用 `readExecutableText`：`textBytes` 32 按区域长度在读取前判定，区域须恰为字串加 NUL，越界与被 fixup 修补由 LE 读取器拒绝；随后用 25 的 `matchesHudTextFormat` 核对，不符为 `source` 层 `unsupported-payload`。每条的全部失败都在调用者给出的位置报告，不回显文字。
  - [graphics-declarations.ts](../../../../../src/original-data/conversion/graphics-declarations.ts)：`GRAPHICS_DATA_SOURCES` 加入 `hud-text` 角色；新增 `HudTextDeclaration`，其 `regions` 按映射部件顺序列出每个区域部件填写的键，须恰好是 schema 的 64 个键各一次（与效果声明的 `regions` 同一做法），以及 `isHudTextDeclaration`。
  - [graphics-step.ts](../../../../../src/original-data/conversion/graphics-step.ts)：HUD 文字的映射只有 EXE 区域部件，且须恰为每个声明的键一个，否则在 `graphics[data/hud/text].regions` 报 `invalid-declaration`。区域经步骤内的同一个 `stepRegionReader` 读取，与 SNIP 颜色表（`0x175ed8`）、DIAG 格式（`0x171e58`）共用可执行文件的打开与区域缓存。失败位置沿用 15 对 EXE 区域的写法：区域 locator 在映射表中的位置，后接键的结构路径，即 `sources.mappings[m].parts[p].alternatives[0]/entries/<key>`。映射在整个步骤转换成功后才升为 `verified`。
  - [convert-graphics.ts](../../../../../src/original-data/conversion/convert-graphics.ts)：`hud-text` 来源先计量（`assets` 1 与 payload 字节，位置 `graphics[data/hud/text].messages`），再分配 payload，descriptor 无依赖、schema 为 `HUD_TEXT_SCHEMA_VERSION`。
  - 新增 [production-hud-text.ts](../../../../../src/original-data/conversion/production-hud-text.ts)：`HUD_TEXT_ASSET`；`PRODUCTION_HUD_TEXT_REGIONS`，64 个区域按键序，地址与长度取自 [executable](../../../../original/formats/executable.md#hud-map-and-communications-text-from-the-exe-p3-0324)；`hudTextGraphic(regions, discPath)` 生成声明与映射（部件按规范 locator 顺序，声明的 `regions` 给出对应的键）；`PRODUCTION_HUD_TEXT_DECLARATIONS`、`PRODUCTION_HUD_TEXT_MAPPINGS`（`confirmed`，U-026、U-030，证据为上述 executable 一节）与 `PRODUCTION_HUD_TEXT_SHARE`。[production-graphics.ts](../../../../../src/original-data/conversion/production-graphics.ts) 追加这三项，份额并入 `PRODUCTION_GRAPHICS_SHARE`。[production-executable.ts](../../../../../src/original-data/conversion/production-executable.ts) 新增 `executableRegionOf` 与 `regionLocator`，[production-rule-data.ts](../../../../../src/original-data/conversion/production-rule-data.ts) 改用它们（输出不变，基准作业的 manifest 身份与改动前相同）。
  - [slice-definition.ts](../../../../../src/content/slice-definition.ts)：版本 4 增加必需角色 `hud-text`（cockpit-hud-map、data、恰为 1），版本号仍为 4。
- **AC-06：** [executable-text.test.ts](../../../../../src/original-data/formats/executable-text.test.ts) 的“EXE HUD text reading”：64 条按键序读取、深度冻结并被严格读取器接受；区域按与键序相反的顺序排列，结果仍按调用者的配对；字节 0x01、0x7F、0x80、0xA0、0xFE、0xFF 与逐字节文字中的 `%` 原样保留。拒绝项：恰为 32 字节通过、33 字节在读取前 `limit-exceeded`（`textBytes` 32/33，该区域未被读取）；缺少转换、多一个转换、另一种转换、另一种精度、顺序不符、无转换的格式串中出现转换、不完整的 `%`，都为 `unsupported-payload`；逐字节键接受任何字节；区域在 NUL 之前结束或越过 NUL、越出对象、被 fixup 修补，都为 `invalid-payload`；首个失败按键序确定。诊断不含标记文字（`sourceFailure` 核对）。[graphics-step.test.ts](../../../../../src/original-data/conversion/graphics-step.test.ts) 的“graphics step HUD text”在图形步骤中核对同样的 code 与位置，并覆盖映射少一个区域部件、含封包条目部件（`invalid-declaration`）。
- **AC-12：** [slice-definition.test.ts](../../../../../src/content/slice-definition.test.ts) 核对 `hud-text` 的组、kind 与数量；合成内容包（[synthetic-content.test-support.ts](../../../../../src/content/synthetic-content.test-support.ts)）加入 `data/synthetic-hud-text`，`VERSION_4_ROLES` 加入 `hud-text`，[completeness.test.ts](../../../../../src/content/completeness.test.ts) 逐角色去掉一个 Asset 的用例因此覆盖它（`role-cardinality`，incomplete）。`manifest-identity.test.ts` 与 `graphics-binding.test.ts` 无需改动。
- **AC-13：** [production-hud-text.test.ts](../../../../../src/original-data/conversion/production-hud-text.test.ts) 用独立于生产模块的 64 项有序表（executable 的地址与含 NUL 的长度，合计 467 字节）核对每个键的 locator、部件按偏移升序、声明的 `regions` 与部件逐一对应，以及置信度、U 项与证据；`readSourceMappingTable` 读回相同，未核验时诊断为 `source-unverified`。`verifySourceMappings` 之后映射仍为 `declared`，步骤成功后为 `verified` 且带 U-026、U-030；步骤测试另核对转换失败时不返回结果，以及来源状态集的指纹由 `stepGroupDraft` 绑定（既有用例）。声明对部件的配对决定文字归属：交换两个逐字节键的配对后，payload 中两条文字随之交换。变异检查：让映射在步骤后保持 `declared`，2 项测试失败。
- **AC-14：** 本地脚本 `local/research/p3-03/shares/derive-hud-text.ts`（新文件，输出 `out/hud-text-shares.json` 与 `out/hud-text-job.json`，只含计数、结论与哈希；未覆盖 19 的 `derive.ts`、`shares.json`、`job.json`）在基准镜像上以不设上限的限值，分别运行含与不含 `data/hud/text` 的生产图形步骤，两者之差即观测值：assets 1、payloadBytes 2,018（64 个区域共 467 字节、文字 403 字节、最长 14 字节、39 条格式串）。按“2 倍向上取整到 2 的幂”推导为 assets 2、payloadBytes 4,096。份额作为新常量 `PRODUCTION_HUD_TEXT_SHARE`，而不是并入飞行图形份额：后者由 19 的观测推导，并入后数值不变，就无法单独核对 HUD 文字的推导与恰等于、超出 1 的计量。`PRODUCTION_PACKAGE.limits` 改为 assets 812、payloadBytes 16,568,320，其余不变。[production-package.test.ts](../../../../../src/workers/production-package.test.ts) 记录该观测值，由规则推导份额，并核对上限等于全部份额与音频限值之和。[production-hud-text.test.ts](../../../../../src/original-data/conversion/production-hud-text.test.ts) 在先前步骤的用量之上，以恰等于的限值通过，`assets` 或 `payloadBytes` 少 1 时为 `budget-exceeded`（带完整 `limit`）；[graphics-step.test.ts](../../../../../src/original-data/conversion/graphics-step.test.ts) 在混有 DIAG 的步骤中核对同样的计量。文字结构限值沿用 25 的 `HUD_TEXT_LIMITS`，没有新增限值名。
- **AC-16：** Worker 的合成光盘（[production-graphics.test-support.ts](../../../../../src/original-data/conversion/production-graphics.test-support.ts) 的 `PRODUCTION_GRAPHICS_REGION_WRITES`）在 64 个生产地址写入代码生成的文字（[production-hud-text.test-support.ts](../../../../../src/original-data/conversion/production-hud-text.test-support.ts)：每条恰为区域长度减 1，先填充含 0x80–0xFF 的字节，再接该键的转换序列），因此所有使用生产图形或切片光盘的测试都转换 `data/hud/text`。[import-job.test.ts](../../../../../src/workers/import-job.test.ts) 的“production package”：四组都为 `group-complete`、全包为版本 4 的 `complete`，`hud-text` 恰为 1；读取日志新增可执行文件的 `offset+length` 读取，与以同一份 LE 读取器独立读取得到的结果对照：64 个区域的字节各被读取一次且只在 `convert-graphics`，图形阶段对可执行文件的读取恰为一次打开加生产图形表映射的 66 个区域（颜色表、DIAG 格式与 64 条文字），没有其他区域。合成驾驶舱光盘（`cockpitGraphics`/`cockpitCoveredFiles`）加入一个小型 EXE 与 HUD 文字，使该组在版本 4 下仍然完整。随包形状更新的既有断言：F-08 的映射序号 286→287（`data/hud/text` 排在纹理映射之前）；F-04 预算步骤的用量排除 HUD 文字；`convert-graphics` 缺少 CCKD 时首个失败的映射序号 2→3；cockpit-hud-map 的 Asset 数加 1（Node 与 [import-worker.spec.ts](../../../../../e2e/import-worker.spec.ts)）。
- **本地（只在 `local/`）：** 同一脚本加 `--job` 运行完整生产作业（未改组件版本）：`complete`，切片定义版本 4，转换器版本 `osr-import.graphics-4.logic-2.audio-2.models-4`；logic 9、models 266、cockpit-hud-map 104、audio 29 个 Asset；`data/hud/text` 的来源状态为 `verified`，无依赖，2,018 字节，payload `sha256:ccbb42707ba0900f7b48543306cdaae2156432a8af4b267322c74d2005aa77b6`；包用量 assets 408、dependencyEdges 611、payloadBytes 3,783,074，在 `PRODUCTION_PACKAGE.limits` 之内；manifest 身份 `manifest:sha256:ac3bdb9c87c9fe4ea74505397b550619209d8204da9e40b3f065b5e77537b9ba`。简化后的代码重跑，结果与哈希相同。正式的本地核对仍归 21。
- **转换器组件：** 未递增，仍为 `graphics-4`。19 递增后的中间输出没有在真实来源上产生过完整的包（基准作业在 SND 10181 的 `flags` 8 处失败关闭，27 修复），本项完成后第一次得到完整包，因此最终输出沿用该组件版本（goal 执行记录“spec 修订 1 与修复子任务 25–27”）。
- **AC-18：** 合成文字只由代码生成（键序号决定的填充字节加 schema 常量中的转换）；源码只含地址、长度与键名；诊断位置只含映射序号、部件序号与键名，测试用标记文字核对诊断不回显内容。`pnpm check:original` 的 `findings` 为空。
- **检查：** `pnpm check`（typecheck、lint、182 个文件 5,840 项 Vitest、生产构建）通过；`pnpm test:e2e`（端口 5178/5179）181 项通过；`pnpm check:original` 通过。变异检查：关闭格式核对 11 项失败，去掉 `hud-text` 角色 4 项失败。
- **Rubber-duck：** 两项意见。(1) 失败位置未含区域 locator：已改为 15 对 EXE 区域的写法（映射表中的部件位置加 `/entries/<key>`），步骤测试用相应的位置语法核对；没有采用 `MAIN/SRANGERS.EXE#le/…` 形式的字面 locator，因为现有的封闭位置语法与先例中都没有这种形式。(2) 完成证据为空：即本节。
- **Simplify：** 已采纳：区域构造改用 `production-executable.ts` 的共用函数（规则数据一并改用）；`GraphicsDeclaration` 联合中去掉多余的子类型；测试支持不再返回未用的 `regions`；测试中只构建一次声明与映射、合成封包只构建一次；作业测试的三个用例共用一次记录的作业，可执行文件只独立读取一次。未采纳：测试支持的惰性初始化（64 条短文字，开销可忽略）；把有序表改为以键为键的记录（有序表刻意独立于键名）；与效果步骤抽取共用的区域部件绑定、把 HUD 文字的分支并入 `graphicsSource`（两者的部件形状与长度规则不同，属更大的重构）。
- **文档影响：** 文档同步归 22，本项未改文档。交 22：original-data 分册（`parseHudText`、`HudTextDeclaration`/`isHudTextDeclaration`、图形步骤的 HUD 文字来源与位置写法、`production-hud-text.ts` 的导出与份额、`executableRegionOf`/`regionLocator`、`PRODUCTION_PACKAGE.limits` 的新值）；content 分册（版本 4 的 `hud-text` 角色）；executable 的观测最大值一节可补记 HUD 文字区域的计数（64 个、467 字节、最长 15 字节含 NUL）；[source-error.ts](../../../../../src/original-data/source-error.ts) 中 `textBytes` 注释的文字列表可补“EXE HUD 文字”（该文件不在本项写入范围）。STATUS 与阶段索引无需改动。

