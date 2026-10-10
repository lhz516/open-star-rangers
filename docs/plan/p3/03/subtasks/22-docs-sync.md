---
type: plan
status: active
phase: P3
task: "03"
subtask: "22"
updated: 2026-10-09
---

# 22 — 文档与未知项同步

**契约来源：** [spec](../spec.md) 的 S-01（U 项）、S-17、AC-01（U 项）、AC-14（限值与份额的记录）、AC-20。
**依赖：** 20, 21, 25, 26, 27。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 按 01–21、24–27 的完成证据与 goal 执行记录中“交 22”的接口变化与线索，同步以下文档：
  - **模块分册：** [内容](../../../../engineering/modules/content.md)、[原版数据](../../../../engineering/modules/original-data.md)、[Core](../../../../engineering/modules/core.md)、[Worker](../../../../engineering/modules/workers.md)、[应用](../../../../engineering/modules/app.md)。记录规范 JSON 模块、新 payload 族（含 `hud-text`）、sound payload schema 2、错误码、限值名与限值、解析器、转换步骤、份额、`ConverterVersion`、切片定义版本 4 与 `MissionSetup.eventTriggers`；[平台](../../../../engineering/modules/platform.md)分册记录音频控制器的重复播放。
  - [源码结构](../../../../engineering/source-structure.md)的目录树：`src/content/rule-data/`、`src/content/flight/` 与新增文件。
  - [本地导入指南](../../../../guides/local-import.md)：转换器版本递增后须重新导入；查看器中新增的图像与声音。
  - [文档地图](../../../../README.md)：新增的 `craft.md`、`ai.md`、`comm.md`。
  - [imfat](../../../../original/formats/imfat.md) §5 的类型状态（ANIM、CINF、DFPG/AICO 等），以及 [executable](../../../../original/formats/executable.md) 到新格式文档的链接与执行记录中列出的更正。
  - [textures](../../../../original/formats/textures.md) §6：21 的外观核对（方法、截图与置信度）；[工程约定](../../../../engineering/README.md)：20 交接的音频探针一节与页面回归路线。
  - [audio](../../../../original/formats/audio.md)：11 个新 SND 的 `flags`（10181 为 8，并写明其表示）与 SND 10409 循环条件的更正；[ai](../../../../original/formats/ai.md)：组 0 闭包的条目 ID 与名称区域，以及过时的 fixup 说明。
  - [未知项登记表](../../../../original/unknowns.md)：按 01–05 与 21 的线索更新 U-001、U-004、U-018、U-022、U-027、U-028、U-030 等的状态与线索，负责阶段不改。
- 每个修改的文档都更新 `updated:`；检查链接、锚点与 front matter。只写结构、计数、置信度与证据路径，不含原版内容。

## 不包含

- 工具用法与 `AGENTS.md`：已由 21 更新。
- 01–05 已写入的格式事实：只补链接与类型状态，不改写结论。
- [STATUS](../../../../STATUS.md) 与阶段 [tasks.md](../../tasks.md)：只由协调者修改。

## 关键文件与契约

- 01–21 的完成证据；spec 的 [S-17](../spec.md#包含)。

## 写入范围

- `docs/engineering/modules/content.md`：内容模块的新 API。
- `docs/engineering/modules/original-data.md`：解析器与转换。
- `docs/engineering/modules/core.md`：`MissionSetup.eventTriggers`。
- `docs/engineering/modules/workers.md`：作业接线与生产包配置。
- `docs/engineering/modules/app.md`：受影响的持有者与查看器说明。
- `docs/engineering/source-structure.md`：目录树。
- `docs/guides/local-import.md`：重新导入与新增查看项。
- `docs/README.md`：文档地图。
- `docs/original/formats/imfat.md`：类型状态。
- `docs/original/formats/executable.md`：到新格式文档的链接。
- `docs/original/unknowns.md`：U 项。
- `docs/engineering/modules/platform.md`：音频控制器的重复播放。
- `docs/original/formats/audio.md`：新 SND 的 `flags` 与循环条件的更正。
- `docs/original/formats/ai.md`：闭包条目与名称区域、过时说明。
- `docs/original/formats/textures.md`：ANIM 帧的外观核对结果（21 的交接，2026-10-09 由协调者扩展）。
- `docs/engineering/README.md`：音频探针与页面回归路线（20 的交接，2026-10-09 由协调者扩展）。

## 验收标准

- [x] AC-20：S-17 列出的分册、目录树、指南与文档地图已同步，指南写明须重新导入；audio 记录 `flags` 8 出现在切片中及其表示。
- [x] AC-01（U 项）：受影响的 U 项已按研究结论更新，负责阶段未改。
- [x] AC-14（记录）：限值、份额与推导所用的观测值已记录在模块分册中。
- [x] 修改的文档 `updated:` 已更新，链接与锚点有效；文档中没有原版字节、文字、数值或反编译代码。

## 验证方法

- 文档 diff 审阅；链接、锚点与 front matter 检查。不涉及构建或浏览器。

## 完成证据

2026-10-09，worker 分支 `exec-p3-03-22`（应用管理的 worktree，基于认领提交 `f59c0c0`）。只改写入范围内的 16 篇文档与本文档；没有代码改动。

- **交接核对（按来源）：** 逐条处理 goal 执行记录中的“交 22”与 01–21、24–27 的完成证据，以及合并 main 的记录。
  - **01：** U-022 的线索与 U-002 的“任务内文字”措辞（unknowns）；executable [任务结果](../../../../original/formats/executable.md#mission-result-success-path-and-campaign-restart-p3-0104)第 2 步更正为按 4 字节步长读取配对数组，并链接 scenario 段 2。
  - **02：** executable 数据闭包中 DEBRIS 一段（取反作用于 +0x00–+0x08，+0x0C 为未取反的归一化副本，链接 craft §4.4）与“武器记录”一节（载入时还改写派生字段，链接 craft §3.8）；imfat §5 的 CINF 行与 §7 引用说明；文档地图；U-001、U-008、U-026、U-027。
  - **03：** 文档地图；executable AISTUFF 闭包对 AICO 的描述（补头部字段与数组、ID 链所在的 DFPG）与 Limits 中“未追踪解释器”的说法（注明已被 ai §1、§5 超越）；imfat §5 的 DFPG/AICO 行改为结构已确认并链接 ai；U-001、U-022。
  - **04：** 文档地图；imfat §5 的 TABL 行链接 comm；executable 通讯一行链接 comm；U-001、U-027、U-028、U-030。
  - **05：** imfat §5 的 ANIM 行改为已确认并链接 textures §2、§6、§7；audio 的 “Selection (Likely) … not traced statically” 改为由 textures §7 确认（代码），角色表与 “EXPL choice at mission start” 链接选择规则；U-001、U-018、U-027、U-030。
  - **06：** content 分册的规范 JSON（4 个导出与规范文本规则）、logic payload 改由它实现、2 个新内容错误码；original-data 分册的 5 个新限值名及其对应。
  - **07：** content 分册的 logic schema 2、`EventTrigger`/`EventRange`、事件限值与推导；Core 分册的 `MissionSetup.eventTriggers`；original-data 分册的段 2 解析、+0x30/+0x38 改名、`missionReferences` 计数。logic-check 的工具用法已由 21 完成。
  - **08、09、25、27（content）：** 新增“规范 JSON 与规则数据 payload”“飞行数据 payload”“视角标签与 HUD 文字 payload”三节（API、命名约定、形状、解码顺序、错误码、限值表与推导所用观测值），sound payload 一条改为 schema 2；切片定义版本 4 与 `VERSION_4_ROLES`/`P2_ROLES_SLICE`；转换器版本。
  - **10–14、16、17、26（original-data）：** 新增“规则与飞行数据的定向解析”（craft、debris、ai、comm、base-repair、executable-text、rens-header、view-labels、anim、explosion 的 API、规则与限值表）、“规则数据转换”与“飞行数据步骤”三节；图形一节补 `ImageRecordKind`/编码 1/`fieldAt`、`GRAPHICS_DATA_SOURCES`、`DataDeclaration`、`HudTextDeclaration`、ANIM 帧与视角标签与 HUD 文字来源、读取前的条目限值、`mergeGroupDrafts`、飞行图形与 HUD 文字的生产导出与份额、`executableRegionOf`/`regionLocator`；LE 一节补 `readFixedUpRegion`；来源映射补 `SOURCE_ENTRY_TYPES.data` 的 ANIM。11 的 executable §1 与 ai §3.3 的过时 fixup 说明已改正。14 的 textures 解析器一行加入 `anim.ts`、`explosion.ts`。
  - **15：** ai §1 记录组 0 闭包的 25 个条目 ID（3 个 DFPG、22 个 TABL，与 `local/research/p3-03/ai/out/closure.json` 一致），§3.3 记录 10 个名称区域的地址与长度（按地址顺序；由 19、21 的基准作业确认）。
  - **18、19、27（音频）：** original-data 分册的 `SOUND_ROLES` 新角色与 ID 规则、`PRODUCTION_FLIGHT_SOUND_TABLE` 并入后的 29 行、`SndFlagRule`、生产规则 0/1/8、描述符 schema 2、核验与转换共用读取、`audio-2`；audio.md 的 11 个新 SND 的 `flags`（8 个为 1，10455 与 10409 为 0，10181 为 8）与 `flags` 8 的表示（`repeat` 8 次，解释为高概率，未试听）。
  - **19（其余）：** workers 分册的 logic 与模型阶段接线、`ModelStepInput.flightData`、三个份额、`PRODUCTION_PACKAGE` 的转换器版本与限值及推导所用观测值；[本地导入指南](../../../../guides/local-import.md#缓存与重新导入)写明 P3-03 的递增须重新导入、定义版本 3 的记录为 `cache-incompatible`、新包的空间需求。
  - **20：** [工程约定](../../../../engineering/README.md#本地浏览器-runner)新增“P3-03 版本 4 回归”（`version-4-viewer.spec.ts` 两个项目、`bufferPixels` 的 Chrome 原点规则与 `framePixels` 残余）与音频探针的 `sources()`、轨迹与循环点插值说明。
  - **21：** textures §6 新增外观核对（方法、三张截图、对照与置信度）；executable RENS 头部补屏幕闪光截图的观察（高概率）；workers、original-data、app 分册与导入指南链接 [包核对](../../../../guides/tools.md#包核对)。
  - **24：** U-004（SND 10409）、U-026、U-029、U-030 的线索；audio 中 SND 10409 的循环条件更正为两个通道与两个标志（只写结构，`0x53dbc` 的作用标为高概率）；executable HUD 文字一节补观测值（64 个区域、467 字节、最长 15 字节含 NUL、39 条格式串）。
  - **合并 main：** Core 分册的 `loadMission` 输出加入 `eventTriggers` 与声明的 `eventTrigger`，P3-02 的交接加入 P3-03 已交付的内容与 P3-11 的触发来源，并如实写明 `setupHash` 目前不含事件触发（见下方问题）。
  - **app、platform：** 音频控制器的 `currentTime`、`start`/`stop(when)` 与 `repeat` 排程、schema 2、残余风险；查看器音频只透传 `currentTime`；查看器列表在版本 4 下的新图像与不列出的 data 角色；旧转换器版本的条目不提供恢复。
  - **源码结构：** 目录树加入 31 个新文件（`content/canonical-json.ts`、`rule-data/`、`flight/`、`hud/` 两个文件，`formats/` 10 个解析器，`conversion/` 7 个模块），模块说明表同步；脚本核对 `src/` 的全部生产文件都在目录树中。
- **未处理（不在写入范围或不属文档同步）：** hud §3 的 EXIC 行链接 textures §7 与 NEBC 10661 列表顺序（05、16，hud.md 不在范围）；comm 的对象列表项构成（24，comm.md 不在范围）；`source-error.ts` 中 `textBytes` 注释补 EXE HUD 文字（26，代码）；spec `debris-parameters` 一行“归一化取反副本”的措辞（02，spec 归协调者）；内置表读取前判定移入 `formats/ai.ts`、NEBC 解析器移入 `formats/`、字节串读取共用等后续整理（12、13、15、17，代码）。17 交接的 spec “当前实现与依据”白名单说法已由 spec 修订 1 更正。
- **AC-14（记录）：** 规则数据与飞行数据的内容限值表（content）、解析器的条目与结构限值表（original-data，含观测值与“不低于既有限值”的两处例外）、`PRODUCTION_FLIGHT_GRAPHICS_SHARE`、`PRODUCTION_HUD_TEXT_SHARE`、`PRODUCTION_RULE_DATA_SHARE`、`PRODUCTION_FLIGHT_DATA_SHARE` 的取值与基准观测值、`PRODUCTION_GRAPHICS_SHARE` 的新总和（671 / 768 / 3,072 / 768 / 5,373,952 / 5,787,648，按源码逐项相加核对）与 `PRODUCTION_PACKAGE.limits`（workers，含 logic 与音频观测在既有限值之内）。
- **AC-01（U 项）：** U-001、U-002、U-004、U-008、U-018、U-022、U-026、U-027、U-028、U-029、U-030 只追加或修订“结论 / 线索”与“证据”两列；脚本核对这 11 行的“状态”与“负责阶段”两列与改动前相同。
- **检查：**
  - 链接与锚点：本地脚本（复制自 `local/research/p3-03/images/check-links.ts`，支持 `<a id>`）检查 16 篇改动的文档与本文档，1,452 个链接 0 个失败。
  - front matter：16 篇的 `updated:` 均为 2026-10-09；`git diff --check` 通过。
  - `pnpm check:original`：在 `pnpm install --frozen-lockfile` 与 `pnpm build` 之后运行，`passed: true`，index 与 worktree 各 1,121 个文件、build 9 个文件，`findings` 为空。
  - 文档只含结构、地址、条目 ID、计数、长度、哈希与代码常量；SND 的 `flags` 值按 audio 既有做法记录（播放方式元数据）。
- **Rubber-duck：** 审阅全部 diff，并对照源码核对转换器版本、包限值、图形份额总和、声音 API、解码顺序、导入接线与 `setupHash`，确认一致、无原版内容、U 项状态与负责阶段未改、改动都在写入范围内。5 项意见全部采纳：
  1. 版本 4 新增的必需角色是 15 个（初版 14 个加修订 1 的 `hud-text`，`slice-definition.ts` 与 `VERSION_4_ROLES` 都是 15），content 分册改为 15，共 30 个角色要求；
  2. imfat §5 的 CINF 行改为“结构已确认，类型除少数依据数据为高概率外已确认”；
  3. textures §6 的外观核对按 spec（截图或视频对照最高为高概率）标为高概率，代码确认的解码、行序、透明与显示另行说明；
  4. audio 的 Selection 小标题改为已确认（代码），试听作为先前的证据；
  5. workers 分册的空组说明补上飞行数据。

  另据审阅意见把 U-027 中“两张截图与解码帧逐像素一致”改为未遮挡处精确同色、外观一致为高概率。
- **文档影响：** 本行即文档同步；STATUS、阶段索引与 goal 由协调者维护，本行不改。
