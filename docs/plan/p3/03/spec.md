---
type: plan
status: accepted
phase: P3
task: "03"
updated: 2026-10-15
related: [ADR-0007, ADR-0015, U-001, U-004, U-008, U-018, U-020, U-022, U-026, U-027, U-028, U-030]
reviewed: sha256:dc6bc0cbc39a
---

# P3-03：规则数据与补充内容导入 — Spec

## 问题与目标

[P2 退出评审](../../../reviews/P2-exit.md#4-对后续阶段的影响)交付的生产包有 165 个 Asset，覆盖切片的模型、驾驶舱与 HUD 图形、核心音效和任务的初始数据，内容身份见[候选与证据身份](../../../reviews/P2-exit.md#候选与证据身份)（切片定义版本 3，`ConverterVersion` 为 `osr-import.graphics-3.logic-1.audio-1.models-3`）。[P3-01 的数据闭包](../01/subtasks/10-data-closure.md#决定表)逐项列出了闭环在这个包之外实际载入的原版数据，其中处置为“导入”的有 18 项（#3、#15–#31），P3-03/24 又追加了 1 项（#47）。缺少它们，规则与表现任务就没有原版数据可用：

- 武器、机型、修理计时与 Warp 间隔的参数（P3-06、P3-07、P3-09、P3-10）；碎片参数（P3-07）；AI 程序数据（P3-08）；通讯菜单（P3-10）；任务事件与消息（P3-11）。
- 场景灯光与屏幕闪光、受击闪烁、爆炸动画与飞行背景（P3-12）；右侧目标显示屏背景、被毁视角标签，以及 HUD、地图与信息窗直接绘制的 EXE 文字（P3-13）；按 ID 播放的音效与 HUD 音效（P3-14）。
- 其中 ANIM（图像编码 1）、CINF、COMM、AISTUFF 与 DEBRIS 的内容从未解析过（[U-001](../../../original/unknowns.md#数据与格式)）。

本任务按数据闭包扩展 P2 的导入链与内容契约：

1. 研究各导入项的结构，事实写入 `docs/original/`；
2. 由已验证来源产生按切片定义版本 4 判为 `complete` 的资源包，其中包含这些数据的规范 payload；
3. 只保留来源值，不写规则解释或默认值，遇到不支持的结构即失败；
4. 递增转换器版本，旧缓存不再恢复。

完成后可观察的结果：

- `docs/original/` 记录各导入项的结构、存储类型、计数、引用链与 ANIM 编码 1 的解码规则，受影响的 U 项已更新；
- 生产导入作业在 Worker 与本地 CLI 中，都能由基准镜像产生四组完整、按切片定义版本 4 判为 `complete` 的包；新增角色的 payload 能由内容读取器严格解码，结果与本地独立读取一致；
- 合成数据的 Node 与浏览器测试覆盖正常与损坏输入；旧转换器版本的缓存不提供恢复，须重新导入；
- P3-02 与 P3-06 至 P3-14 经内容读取器取得这些数据。本任务不实现任何规则、渲染或播放。

阶段范围依据[总计划 §12](../../master-plan.md#12-开发阶段与验收条件)，任务导航见[阶段索引](../tasks.md#p3-03-规则数据与补充内容导入)。导入范围以 [P3-01 对下游任务的约束](../01/spec.md#对下游任务的约束)为准。

## 范围

### 包含

- **S-01 结构研究：** 按[原版证据获取](../../../guides/original-evidence.md)，用只读 Ghidra 与本地数据研究[导入项](#导入项)。研究内容如下，满足[研究门槛与阻塞](#研究门槛与阻塞)，并把事实写入相应的格式文档（英文），更新受影响的 U 项：
  - 字段位置与存储类型，以及类型的证据；
  - 计数，块内指针与条目 ID 的引用目标；
  - 原版载入时的变换，文字规则；
  - ANIM 编码 1 的解码规则，以及帧的调色板、透明与显示方式。
- **S-02 任务事件：** 把 SCEN 3019 段 2 的事件触发（区间、消息文字、总结选择字节）与记录 +0x54 的引用并入 `mission/first-campaign`，取代 P2-09 对段 2 的“不转换”处理（[源字段处理](../../p2/09/spec.md#源字段处理)）。生成配对仍按失败关闭处理。`loadMission` 把事件触发原样透传到 `MissionSetup`，不解释、不调度。
- **S-03 机型与武器数据：** 由 `CRAFT.NOB` TABL 4003 中切片所选的一对（槽 1、组 0）与 CINF 4037，生成 `data/craft-info`。
- **S-04 碎片参数：** 由 `DEBRIS.NOB` TABL 4501 生成 `data/debris-parameters`。
- **S-05 AI 数据：** 由 `AISTUFF.NOB` 中组 0 的闭包（AICO 6001 中闭环读取的字段：组 0 三元组、头部字段及其所指数组；TABL 6003 及其引用的 22 个 TABL 与 3 个 DFPG）与 EXE 内置表 `0x1762f8`，生成 `data/ai-programs`。
- **S-06 通讯菜单：** 由 `COMM.NOB` TABL 2003、2005、2007、2009、2013 生成 `data/comm-menus`。
- **S-07 基地修理项目：** 由 TABL 10165 的 11 条记录生成 `data/base-repair-items`，只取 +0x6C 的子系统选择值。
- **S-08 程序文字：** 由 7 条 EXE 字串生成 `data/flight-messages`，由 TABL 10399 第 8 项生成 `data/hud/view-labels`，由闭包 #47 的 64 个 EXE 文字区域生成 `data/hud/text`。
- **S-09 场景设置与受击闪烁：** RENS 10751 的头部 +0x00–+0x57 生成 `data/scene-settings`；TEX 11069 生成受击闪烁贴图。
- **S-10 爆炸：** EXIC 10211 与 17 条 EXPL 生成爆炸表，17 条 ANIM 解码为逐帧图像与动画数据。
- **S-11 星云背景：** NEBC 10661 与其 15 个 BITM。
- **S-12 目标显示屏背景：** TEX 11089。
- **S-13 音效：** 闭包 #27–#29 中尚未交付的 11 个 SND。sound payload 由 schema 1 递增为 2，增加按次数重复的循环方式，以表示 SND 10181 的 `flags` 8（播放 8 次）；音频控制器按该次数试听（见[声音 payload schema 2](#声音-payload-schema-2)）。
- **S-14 切片定义与包装配：** 本节各项都按[数据模型与契约](#数据模型与契约)：
  - 切片定义版本 4，含新增必需角色与数量；
  - 各步骤的生产来源映射与 ID 链核验；新增 Asset 按所属组归入生成该组的既有步骤，具体分派由 goal 决定；
  - 结构限值与预算份额；
  - `ConverterVersion` 组件与[生产包配置](../../../../src/workers/production-package.ts)；
  - 包身份。

  导入阶段或协议消息变化时，递增协议版本。
- **S-15 合成数据与回归：** 用代码生成新增格式的合成样本，含按文档化规则编码的 ANIM；把合成内容包与合成导入白名单扩展到切片定义版本 4。既有的 Node 与浏览器回归随之更新，并须通过。
- **S-16 本地核对：** 本地 CLI 用与 Worker 相同的作业模块转换基准镜像；`tools/nob-check.ts` 扩展到 ANIM 的全部帧，以及 EXIC/EXPL/ANIM/SND 与 TABL 4003→CINF 的引用（其余新增解析器带切片专用的失败关闭规则，只经本地 CLI 在切片条目上运行）；另以本地独立读取核对规范数据，并将 ANIM 帧与本地截图或参考视频做外观核对。
- **S-18 通讯消息元数据（修订 2）：** 由 `COMMFACE.NOB` 的 TABL 20011、20019、20985（各头像的子表）与 20983，以及它们引用的 CMOV 的帧数与各帧时长，加上 `COMM.NOB` TABL 2001、2011 的名单，生成 logic 组的 `data/comm-messages`，供 P3-10 的 D-03 逻辑媒体模型使用（[P3-10 D-03](../10/spec.md#实施关卡)）。只导入规则所需的元数据：CMOV 的图像、声音与文字仍属 G-03，不导入；不读取 `COMMFAC2.NOB`。
- **S-17 文档：** 同步受影响的内容：
  - [内容](../../../engineering/modules/content.md)、[原版数据](../../../engineering/modules/original-data.md)与 [Core](../../../engineering/modules/core.md) 分册；如有改动，也包括 [Worker](../../../engineering/modules/workers.md) 与[应用](../../../engineering/modules/app.md)分册；
  - [源码结构](../../../engineering/source-structure.md)的目录树；
  - [本地导入指南](../../../guides/local-import.md)：重新导入、查看器中的新增项；
  - [工具用法](../../../guides/tools.md)；CLI 变化时还有 `AGENTS.md` 的命令表；新增格式文档时更新[文档地图](../../../README.md)。

### 不包含

- 规则语义与规则实现（R-04 至 R-22）以及 Core 对新数据的使用：归 P3-02、P3-06 至 P3-11。`loadMission` 只透传事件触发，其余行为不变。
- 渲染、HUD 与音效的消费者：归 P3-12 至 P3-14，包括 EXPL 每次爆炸的选择、星云组的起点与方向、音效何时及是否循环播放。不为 data Asset 做专用显示；完整资源查看器归 P4。
- 闭包中处置为 G 的内容（#34–#41），不导入：
  - MUSC 与 SONG（G-01）；CINC 与 Smacker 过场（G-02）；`COMMFACE*.NOB` 中 CMOV 的图像、声音与文字，以及 `COMMFAC2.NOB` 整个文件（G-03；修订 2 起，S-18 所列的表、CMOV 帧数与时长，以及 COMM TABL 2001、2011 的名单改为导入）；
  - OPTIONS 页面（G-04、G-06、G-07）；SCENARIO TABL 3011–3017（G-06）；
  - 基地内部的画面，含 TABL 10165 除 +0x6C 外的字段、图像与文字，以及 TEX 11091、CCKD 10097、MFDD 10475、BITM 10157–10163 等（G-05）；
  - TABL 11375 与 TABL 10399 第 0–7 项（G-08）。

  处置为“不用”的 #42–#46 同样不导入；P3-03/24 追加的 #48–#54（LO 套件、F2 视角、打字作弊、波次、基地内部、菜单页与代码规则中的文字）也不导入。
- 救援对象：[阶段索引](../tasks.md#p3-03-规则数据与补充内容导入)把它列为可能的补充资源，但数据闭包表明无需导入。逃生舱是已交付玩家模型第 1 列表的部件 0（闭包 #5，高概率）；引擎不生成救援船对象（#45，已确认），用户看到的救援船只在 `RESCUE.SMK` 中（G-02）。
- 其他任务、其他难度组或槽位的数据：其他 CINF 条目、AISTUFF 组 1 与组 2 的表、波次模式。
- 新的资源组、Asset kind 或内容 schema 变化（sound payload 的 schema 递增属 S-13，不改变内容 schema）。研究若证明确有必要，按[研究门槛](#研究门槛与阻塞)修订本 spec。
- 缓存迁移、清理与玩家缓存管理（P5）；其他导入格式（P5）。
- 原版基准运行或需要用户操作的取证：本任务的事实来自静态分析与本地数据（见[技术决定](#技术决定) 11）。
- 原版字节、数值、文字、图像、声音、反编译输出或截图进入仓库、文档或公开报告。

### 涉及模块

| 模块 | 责任与影响 |
|---|---|
| [content/logic/](../../../../src/content/logic/) | 任务内容加入事件触发；新增 logic 组角色的类型、读取器与规范编码（计划新增文件）；logic payload schema 递增 |
| `content/` 中按数据类别的模块（现有 [effects/](../../../../src/content/effects/)、[hud/](../../../../src/content/hud/) 或计划新增的子目录） | models 与 cockpit-hud-map 组新增 data 角色（含 `hud-text`）的类型与读取器；图像沿用 [graphics/](../../../../src/content/graphics/) |
| [sound-payload.ts](../../../../src/content/sound-payload.ts) | sound payload schema 1 → 2，增加按次数重复的循环方式 |
| [slice-definition.ts](../../../../src/content/slice-definition.ts) | 定义版本 3 → 4，新增必需角色 |
| [content-identity.ts](../../../../src/content/content-identity.ts)、[completeness.ts](../../../../src/content/completeness.ts) | 预计不改，只消费新定义 |
| [original-data/formats/](../../../../src/original-data/formats/) | 新增 CINF、TABL 4003、DEBRIS、AISTUFF、COMM、ANIM、EXIC/EXPL 等解析器（计划新增）；[scen.ts](../../../../src/original-data/formats/scen.ts) 解析段 2；图像记录读取支持编码 1 |
| [original-data/conversion/](../../../../src/original-data/conversion/) | 各步骤的转换、生产映射表、ID 链核验、份额与转换器组件 |
| [workers/](../../../../src/workers/) | [import-job.ts](../../../../src/workers/import-job.ts) 的步骤输入、[production-package.ts](../../../../src/workers/production-package.ts)；阶段与协议预计不变 |
| [platform/storage/](../../../../src/platform/storage/)、[app/resources/](../../../../src/app/resources/)、[app/viewer/](../../../../src/app/viewer/) | 预计不改代码；以回归测试确认旧缓存不恢复，以及查看器能列出新增的图像与声音 |
| [platform/audio/](../../../../src/platform/audio/) | 音频控制器按 sound payload 的重复次数播放 |
| [core/mission/](../../../../src/core/mission/) | `loadMission` 把事件触发原样透传到 `MissionSetup`；声明因继承 `MissionDeclaration` 而带上触发序号。不解释、不调度，既有测试与确定性保持 |
| [tools/](../../../../tools/) | `nob-check.ts` 扩展；本地包核对 CLI（扩展 [logic-check.ts](../../../../tools/logic-check.ts) 或计划新增的 CLI） |
| 合成测试支持 | [synthetic.test-support.ts](../../../../src/original-data/synthetic.test-support.ts)、[formats.test-support.ts](../../../../src/original-data/formats/formats.test-support.ts)、[synthetic-content.test-support.ts](../../../../src/content/synthetic-content.test-support.ts)、Worker 的合成导入与 [e2e/](../../../../e2e/) 夹具 |
| `docs/original/formats/` 与 [unknowns](../../../original/unknowns.md) | 结构事实（英文）与 U 项线索；负责阶段不改 |
| 工程文档与指南 | 见 S-17 |
| `local/research/p3-03/`（git 忽略） | 研究脚本、Ghidra 输出、独立读取与核对报告 |

## 当前实现与依据

- **包与身份：** [slice-definition.ts](../../../../src/content/slice-definition.ts) 的 `CLASSIC_P2_SLICE` 是唯一生产定义：
  - 版本 3；四个资源组及各组拥有的 kind：logic 为 mission、data；models 为 model、image、palette、data；cockpit-hud-map 为 image、palette、font、layout、data；audio 为 sound；
  - 15 个必需角色。完整性只检查定义中的角色，其他角色（如 `craft-types`、`texture-palette`）随依赖进入包，见[完整性](../../../engineering/modules/content.md#内容基础契约与切片定义)。

  生产转换器版本由 [converter-version.ts](../../../../src/original-data/conversion/converter-version.ts) 按图形、逻辑、音频、模型四个组件拼成。[生产包配置](../../../../src/workers/production-package.ts)是主线程常量，由其测试从 `original-data` 推导核对。导入协议版本为 5，阶段依次为 `identify-source`、`convert-graphics`、`convert-logic`、`convert-audio`、`convert-models`（[import-protocol.ts](../../../../src/workers/import-protocol.ts)）。
- **任务数据：** [scen.ts](../../../../src/original-data/formats/scen.ts) 对记录 +0x54 只核对两点：它指向段 2 的第一个元素，且该事件触发没有生成配对。段 2 不转换（[P2-09 源字段处理](../../p2/09/spec.md#源字段处理)，技术决定 11）。[logic-content.ts](../../../../src/content/logic/logic-content.ts) 的 logic payload schema 为 1，`RuleInputs` 按来源原样保留规则输入，是“语义未确认、源值保留”的先例；logic 组用规范 ASCII JSON 编码（[P2-09 技术决定 7](../../p2/09/spec.md#技术决定)）。[load-mission.ts](../../../../src/core/mission/load-mission.ts) 以展开方式复制声明，`ResolvedDeclaration` 继承 `MissionDeclaration` 的全部字段。
- **来源：** 来源映射与白名单已覆盖本任务需要的来源：
  - [source-mapping.ts](../../../../src/original-data/source-mapping.ts) 的 `SOURCE_ENTRY_TYPES` 中，data 已含 AICO、CINF、DFPG、EXIC、EXPL、NEBC、RENS 与 TABL，image 与 palette 已含 ANIM、BITM 与 TEX。data 原先不含 ANIM，而 `data/explosion-animation/<nn>` 映射整个 ANIM 条目，所以 data 须加入 ANIM（执行中已由 17 加入，与 P2-07 加入 DIAG 相同）；
  - 区域 locator 只允许 `MAIN/SRANGERS.EXE`；
  - [生产白名单](../../../../src/original-data/source/source-catalog.ts)已含 `AISTUFF.NOB`、`COMM.NOB`、`CRAFT.NOB`、`DEBRIS.NOB`、`SR.NOB` 与 EXE。

  所以不需要新的 locator 形式或白名单文件。
- **图形与效果：** image 与 palette payload（schema 1）、`nearestColourMap` 和图像上限 640×480 见[图形 payload](../../../engineering/modules/content.md#图形-payload)。图像记录读取只支持编码 0 与 2，编码 1 尚未解码（[textures §2](../../../original/formats/textures.md#encoding-1-animation-unconfirmed)）。`data/projectile-visuals` 只含 RENS 10751 的记录，不含头部（[效果 payload](../../../engineering/modules/content.md#效果-payload)）。
- **音频：** sound payload 为 schema 1，循环方式只有 `none` 与 `whole`；生产 SND 规则只接受 `flags` 0（`whole`）与 1（`none`），其他值为 `unsupported-payload`。基准中 SND 10181 的 `flags` 为 8（P3-03/19 观测）；`flags` 的低字节原样传给 Miles 的循环次数，*n* 即播放 *n* 次（[audio](../../../original/formats/audio.md#playback-interpretation-p2-08)，代码已确认）。音频阶段限值 `AUDIO_BUDGET_LIMITS` 的 Asset 数按 `SR.NOB` 全部 37 个 SND 设定。EXPL 引用的四个声音（10213–10219）已作为 `sound/explosion/blast-v1`–`v4` 交付（[audio](../../../original/formats/audio.md#slice-sample-set-and-role-correspondences-p2-08)）。
- **缓存：** 缓存键为来源类别、来源令牌与转换器版本。只有与生产配置一致的条目才提供恢复；读到的记录若内容 schema 或切片定义版本未知，为 `cache-incompatible`（[资源缓存](../../../engineering/modules/platform.md#资源缓存)）。
- **查看器：** [viewer-items.ts](../../../../src/app/viewer/viewer-items.ts) 列出全部 image、palette、layout、font 与 model，data 只列出效果角色；声音面板列出 audio 组的全部 sound。新增的图像与声音无需改动即可查看与试听，新增的 data 不列出。
- **本地工具：** [logic-check.ts](../../../../tools/logic-check.ts) 用生产作业核对 logic 组，[nob-check.ts](../../../../tools/nob-check.ts) 用导入共用的读取核对封包结构（[工具用法](../../../guides/tools.md)）。
- **原版证据：**
  - [闭包决定表](../01/subtasks/10-data-closure.md#决定表)与 [executable 的数据闭包一节](../../../original/formats/executable.md#data-loaded-by-the-loop-p3-0110)：载入点、ID 链与覆盖限制；
  - [武器记录](../../../original/formats/executable.md#weapon-records-and-the-first-missions-shooters-p2-1230)：TABL 4003 为 18 行，每行 3 对 {条目 ID, 倍率}；CINF 含 10 条炮、9 条导弹、按种类位的 20 条机型记录以及弹体记录；载入后每条炮与导弹记录的首字被改写为数组序号；
  - [难度读取路径](../../../original/formats/scenario.md#difficulty-readers-p3-01) 1、3、5：倍率、组表与 AICO 三元组按难度组选择；
  - 段 2 的结构见 [scenario §2](../../../original/formats/scenario.md#2-scen-header-confirmed-on-all-52-entries)，区间 +0x10 的总结选择字节见 [executable](../../../original/formats/executable.md#mission-result-success-path-and-campaign-restart-p3-0104)；
  - [hud §2–§3](../../../original/formats/hud.md#2-tabl-entries-in-srnob-contents-likely)：TABL 10165、10399、NEBC、EXIC；[executable 的 HUD、地图与通讯文字](../../../original/formats/executable.md#hud-map-and-communications-text-from-the-exe-p3-0324)：闭包 #47 的区域、绘制处、条件与可达性；[audio](../../../original/formats/audio.md#sounds-played-by-id-and-hud-sounds-p3-0110)：按 ID 播放与 HUD 声音；[imfat §5](../../../original/formats/imfat.md#5-entry-types)：类型状态。

  字段含义多数未确认，ANIM 编码 1 未确认（U-001）。
- **取证限制：** 本机 Computer Use 无法向 DOSBox-X 输入（[STATUS](../../../STATUS.md)、P3-01 goal 执行记录），需要游玩的原版运行只能由用户操作。闭包的覆盖限制写明没有基准运行核对实际请求的 ID。

### 导入项

| 闭包 # | 来源 | 规范 Asset（计划） | 组 | 范围 | 主要消费者 |
|---|---|---|---|---|---|
| 3 | SCEN 3019 段 2 与记录 +0x54 | `mission/first-campaign`（扩展） | logic | S-02 | P3-11、P3-02 |
| 15、16 | `CRAFT.NOB` TABL 4003（槽 1、组 0 的一对）、CINF 4037 | `data/craft-info` | logic | S-03 | P3-06、P3-07、P3-09、P3-10 |
| 18 | `DEBRIS.NOB` TABL 4501 | `data/debris-parameters` | logic | S-04 | P3-07、P3-12 |
| 22、23 | `AISTUFF.NOB` AICO 6001（组 0 三元组）、TABL 6003 与其引用的 25 条；EXE 表 `0x1762f8` | `data/ai-programs` | logic | S-05 | P3-08 |
| 24 | `COMM.NOB` TABL 2003、2005、2007、2009、2013 | `data/comm-menus` | logic | S-06 | P3-10、P3-08、P3-13 |
| 31 | `SR.NOB` TABL 10165 各记录 +0x6C | `data/base-repair-items` | logic | S-07 | P3-10 |
| 30 | EXE 字串 `0x17106c`、`0x171094`、`0x170db8`、`0x170dc8`、`0x170ddc`、`0x170df8`、`0x170e14` | `data/flight-messages` | logic | S-08 | P3-11、P3-06、P3-05、P3-13 |
| 25 | TABL 10399 第 8 项 | `data/hud/view-labels` | cockpit-hud-map | S-08 | P3-12、P3-13 |
| —（修订 2） | `COMMFACE.NOB` TABL 20011、20019、20985 及其各头像子表、TABL 20983、所引用 CMOV 的帧数与帧时长；`COMM.NOB` TABL 2001、2011 | `data/comm-messages` | logic | S-18 | P3-10 |
| 47 | EXE 对象 4 中 HUD、地图与信息窗直接绘制的 64 个文字区域 | `data/hud/text` | cockpit-hud-map | S-08 | P3-13（P3-09、P3-10 提供 Warp、地图与通讯状态） |
| 17 | RENS 10751 头部 | `data/scene-settings` | models | S-09 | P3-12 |
| 19 | TEX 11069 | `image/hit-shimmer` | models | S-09 | P3-12 |
| 20 | EXIC 10211、17 条 EXPL、17 条 ANIM | `data/explosions`、`data/explosion-animation/<nn>`、`image/explosion/<nn>/<mm>` | models | S-10 | P3-07、P3-12、P3-14 |
| 21 | NEBC 10661 与 15 个 BITM | `data/nebula-backgrounds`、`image/nebula/<nn>` | models | S-11 | P3-12 |
| 26 | TEX 11089 | `image/hud/target-display/background`、`palette/hud/target-display/background` | cockpit-hud-map | S-12 | P3-13 |
| 27–29 | SND 11087、11381、10485、10463、10181、10055、10167、10169、10455、10457、10409 | `sound/event/*`（8）、`sound/hud/*`（3） | audio | S-13 | P3-14、P3-13 |

闭包 #14 的 SND 10401 与 10213–10219 已交付，不重复导入；EXPL 引用已交付的爆炸音效 Asset。

## 行为与边界

| 场景或状态转换 | 预期结果 | 拒绝或失败时的反馈 |
|---|---|---|
| 已验证的基准来源完成导入作业 | 按 `RESOURCE_GROUPS` 顺序发送四组，每组 `group-complete`，`validatePackage` 按定义版本 4 返回 `complete`；新增角色的 payload 能由各自的读取器解码；阶段与消息顺序同现状 | 不适用 |
| 按切片配置选择的子资源越界，或数据给出的 ID 链与映射表的部件不一致 | 不发送任何组。ID 链包括：TABL 4003 的槽与组、所选 CINF ID，AISTUFF 组表与 AICO 组三元组，EXIC→EXPL→ANIM、EXPL→SND，NEBC→BITM | `failed`，`source` 层 `subresource-mismatch`，位置为结构路径 |
| 条目或结构越界、指针未登记、计数超限、浮点非有限、文字缺少 NUL 或超长 | 在读取越界内容与分配之前拒绝，不返回部分结果 | `invalid-payload`；结构超限为 `limit-exceeded`，预算超限为 `budget-exceeded`，带限值名、上限与观测值 |
| 来源用到本契约不支持的位置 | 不忽略，也不补默认值。不支持的位置包括：段 2 的生成配对或须为零却非零的运行时计数、未被引用的段 2 元素、只在基准中为零而类型未定的字段出现非零值、研究未覆盖的 ANIM 编码分支 | `unsupported-payload`，位置指出字段或段 |
| ANIM 帧数据按已确认规则解码时越界、提前结束或有剩余字节 | 拒绝该条目，不产生残缺帧 | `invalid-payload` |
| 规范 payload 被篡改、编码不规范，或 payload 内的引用与描述符依赖不一致 | 读取器拒绝；以完整性验证核对时，组为 `incomplete` | 对应的内容层错误码；组诊断沿用 P2-01 |
| 包缺少版本 4 新增的必需角色，或角色数量不符 | 不是 `complete` | `role-cardinality` 等既有诊断 |
| 浏览器中有旧转换器版本或切片定义版本 3 的缓存 | 不提供恢复，须重新导入；旧记录保留，不迁移也不删除 | 菜单不出现可恢复条目；直接读取这种记录时为 `cache-incompatible` |
| 光盘、封包层失败或作业取消 | 沿用 P2-02 至 P2-04：原样传递，不发送组 | 既有 code 与位置 |
| Core 的 `loadMission` 收到新形状的任务内容 | `MissionSetup` 另含原样透传、冻结的 `eventTriggers`，声明带 `eventTrigger`；其余结果不变，相同输入得到深度相等的结果 | 内容层错误原样传递，前提失败为 `CoreInputError` |
| 查看器打开版本 4 的包 | 新增图像可显示（包括逐帧的爆炸图像），新增声音可试听；新增 data 不列出 | 沿用查看器的既有反馈 |

### 字段处理规则

以下规则适用于全部导入项，研究结论逐项写在格式文档中：

1. **存储类型：** 每个转换的字段都有存储类型（整数宽度与符号、`f32`/`f64`、块内指针、条目 ID、代码指针或文字），并须有证据：
   - 原生代码访问为已确认；
   - 基准封包中同类结构的全部实例取值模式一致，为高概率。
2. **语义：** 只按 `docs/original/` 已记录的置信度使用：
   - 未确认的字段用不暗示含义的中性名，类型注释链接源位置与 U 项；
   - 值按来源保留：不应用默认值，不截断、限幅、舍入，也不换算单位。
3. **零值：** 只有原版载入或使用代码把 0 当作“缺省或不存在”处理（已确认）时，源值 0 才记为 null，与 `RuleInputs` 相同；其余的 0 原样保留。
4. **指针与 ID：**
   - 块内指针转为结构内序号或嵌套结构，目标必须是预期结构的起点，否则为 `unsupported-payload`；
   - 跨条目的条目 ID 转为 Asset 引用，并等于描述符依赖；同一 Asset 由多个条目合成时（例如 AISTUFF 闭包），转为该 Asset 内部的序号；
   - 指向 EXE 代码的字段保留为不透明的代码标识（LE 对象与对象内偏移），只能比较是否相等，Core 不得从其数值推导规则；
   - 除上一条的代码标识外，规范数据中不含条目 ID、文件偏移、`flags` 或 locator。
5. **载入变换：**
   - 原版载入时只改变数据位置或结构的变换（重定位、序号回写、交换），按已确认的代码复现；
   - 算术派生（归一化、取反、缩放）不在导入时执行，由消费者按格式文档实现；
   - 被载入代码覆盖的字段，其存储值不转换。

   每处变换都写入格式文档与类型注释。
6. **不使用的位置：** 研究确认在本切片读取的全部来源中都为零、又无法确定类型的位置不转换，出现非零即为 `unsupported-payload`。属于 G 项或闭包之外的部分（例如 TABL 10165 的图像与文字）不转换；只按定位所需字段的要求核对结构，其余不检查。
7. **按切片配置选择：** 由难度组或槽位决定的选择在导入时按 `CLASSIC_P2_SLICE.candidate` 完成，即槽 1，组 0 同时是难度组；只导入所选部分。选择作为来源映射的子资源记录并核验。整条目载入的结构（CINF 4037、DEBRIS TABL 4501、EXIC 列表）按条目完整导入，不按切片会生成的种类裁剪，因为哪些记录会被用到属于规则研究。
8. **文字：**
   - 以字节串保存，每个码位等于一个存储字节（1–255），不含结尾 NUL；
   - 换行与格式说明原样保留，不解释也不翻译；
   - 来源中必须在数据块或区域内以 NUL 结束；
   - 交给格式化的文字（格式串）同样只按字节保存，导入时不展开；消费者只按 C `printf` 的语义处理 schema 列出的转换（`%d`、`%.0f`、`%s`、`%%`），实现与对照归 P3-13；
   - 诊断不回显文字。
9. **图像：**
   - 沿用 P2-05 的 image 与 palette payload；
   - 每个 ANIM 帧都解码为完整、独立的图像：若原版是帧间增量编码，由转换器按已确认的规则重建完整帧；
   - 透明、行序、调色板绑定与显示方式（直接或最近色）都依绘制路径的证据确定，至少高概率，并链接 U 项。
10. **声音：** 沿用 P2-08 的 SND 转换，sound payload 递增为 [schema 2](#声音-payload-schema-2)。生产 SND 规则在 P2-08 的 `flags` 0（`whole`）与 1（`none`）之外只增加 8（`repeat`，播放 8 次），这是切片读取的来源中出现的全部取值；其他值仍为 `unsupported-payload`。何时播放、是否停止属于触发规则，归 P3-14。

### 研究门槛与阻塞

- S-01 的结论须先于依赖它的实现完成。结论写入 `docs/original/`，只含结构、计数、置信度与证据路径。
- 规范数据使用的每个值，存储类型至少为高概率；语义可以未确认，此时按字段处理规则 2 使用中性名，这是 [P3 阶段索引](../tasks.md#p3-03-规则数据与补充内容导入)对 P3-03 的要求。
- 以下任一情况出现时，先修订本 spec 并取得用户重新批准；受影响的验收在此之前保持阻塞，不得以忽略、合成值、临时资源、近似规则或硬编码补齐：
  1. 某个导入项的非零字段无法确定存储类型；
  2. ANIM 编码 1 的解码规则不能由代码确认，或帧的调色板、透明与显示方式达不到高概率；
  3. 研究发现闭包中的某项不被使用、来源不同，或闭环还依赖闭包未列出的数据：先按 P3-01 的约束向闭包追加事实与交接记录，再修订本 spec；
  4. 某项需要新的 Asset kind、资源组、内容 schema 变化或新的区域文件；
  5. 基准观测值超出既有读取器的绝对上限，例如 IMFAT 数据块 4,194,304 字节、图像 640×480、调色板 256 项。
- **恢复条件：** 取得所需证据；或者用户批准本 spec 的修订（例如调整该项的处理，或拆出后续任务），修订记录受影响的 AC。闭包外的新依赖还须先追加交接记录。
- **基准运行：** 静态证据不足而必须运行原版时，因本机 Computer Use 无法向 DOSBox-X 输入，按[运行时测量指南](../../../guides/runtime-measurement.md)由用户操作，并记录为什么无法以静态证据代替。这也属于上述门槛。

## 数据模型与契约

规范数据位于 `content/`，原版定位、解析、核验与转换位于 `original-data/`，作业装配位于 `workers/`，任务载入结果位于 `core/mission/`。新增类型都是计划新增，文件划分由 goal 决定；不建立统一的 schema 文件，也不让 `content/` 或 `core/` 导入 `original-data`。

### Asset 与角色

Asset ID 依据已确认的发送者或用途命名，含义未确认的用中性名。编号 `<nn>`、`<mm>` 为两位、从 01 起：

- 动画按其 EXPL 在 EXIC 三张列表中首次出现的顺序编号；
- 帧按动画中的帧序编号；
- 星云图像按 NEBC 中的顺序编号。

| Asset ID | kind / 角色 | 内容 | 依赖 | 来源部件 | 映射置信度 |
|---|---|---|---|---|---|
| `mission/first-campaign` | mission / `mission` | 现有内容，加上事件触发与声明的 `eventTrigger` | 不变 | 不变 | `likely`，U-022 |
| `data/craft-info` | data / `craft-info` | 所选倍率与 CINF 全部记录 | 无 | TABL 4003（子资源为所选的槽与组）、CINF 4037 | `likely`，U-001、U-008、U-026 |
| `data/debris-parameters` | data / `debris-parameters` | 按种类位的 20 组碎片参数记录 | 无 | `DEBRIS.NOB` TABL 4501 | `likely`，U-001、U-027 |
| `data/ai-programs` | data / `ai-programs` | 组 0 三元组、程序表、所引用的条目、内置程序表 | 无 | AICO 6001（子资源为组 0）、TABL 6003、22 个 TABL、3 个 DFPG、EXE 区域 | `likely`，U-001、U-022 |
| `data/comm-menus` | data / `comm-menus` | 5 张菜单表 | 无 | COMM TABL 2003、2005、2007、2009、2013 | `likely`，U-001 |
| `data/comm-messages` | data / `comm-messages` | 通讯消息表（各头像子表与直接列表）、每条消息的存在与帧时长，以及两份名单（修订 2） | 无 | COMMFACE TABL 20011、20019、20985 与其子表、TABL 20983、所引用的 CMOV（子资源为帧数与帧时长）；COMM TABL 2001、2011 | `confirmed`（executable RQ4、RQ7、RQ9；用途为 P3-10 D-03） |
| `data/base-repair-items` | data / `base-repair-items` | 11 个子系统选择值 | 无 | TABL 10165（子资源为各记录的选择字段） | `likely`，U-030 |
| `data/flight-messages` | data / `flight-messages` | 7 条消息文字 | 无 | 7 个 EXE 区域 | `confirmed` |
| `data/hud/view-labels` | data / `view-labels` | 子模式 8 的标签 | 无 | TABL 10399（子资源为第 8 项） | `confirmed` |
| `data/scene-settings` | data / `scene-settings` | RENS 头部字段 | 无 | RENS 10751（子资源为头部） | `likely`，U-027、U-028 |
| `image/hit-shimmer` | image / `hit-shimmer` | 受击闪烁贴图：TEX 11069 不带调色板，存储值是扫带的阈值，按存储值原样保留 | `palette/flight/models`（直接绑定，只供查看） | TEX 11069 | `likely`，U-027 |
| `data/explosions` | data / `explosion-table` | EXIC 的三张列表，每项为 {声音, 动画} | 全部动画 Asset；`sound/explosion/blast-v1`–`v4`（跨组外部要求） | EXIC 10211、17 条 EXPL | `confirmed` |
| `data/explosion-animation/<nn>` | data / `explosion-animation` | 帧序与研究确定的逐帧或动画参数 | 各帧图像 | 对应的 ANIM | 由 S-01 确定，至少 `likely`，U-001 |
| `image/explosion/<nn>/<mm>` | image / `explosion-frame` | 解码后的完整帧，按 DATA 直接显示 | `palette/flight/models` | 对应的 ANIM（子资源为帧序号） | 同上 |
| `data/nebula-backgrounds` | data / `nebula-backgrounds` | 15 个图像引用，按 NEBC 顺序 | 15 个星云图像 | NEBC 10661 | `confirmed` |
| `image/nebula/<nn>` | image / `nebula-background` | 128×128 BITM，调色板为 DATA（高概率） | `palette/flight/models` | 对应的 BITM | `likely`，U-018 |
| `image/hud/target-display/background` | image / `target-display` | 右侧目标显示屏的 3D 场景背景 | 自带调色板与最近色目标 `palette/flight/cockpit-hud-map` | TEX 11089 | `likely`，U-030 |
| `palette/hud/target-display/background` | palette / `texture-palette` | TEX 11089 的调色板 | 无 | TEX 11089 | 同上 |
| `data/hud/text` | data / `hud-text` | 闭包 #47 的 64 条文字，键为固定集合 | 无 | 64 个 EXE 区域 | `confirmed`（来源与用途由代码确认；逐条的可达性与个别条件链接 U-030、U-026） |
| `sound/event/target-select`、`weapon-select`、`key-command`、`map-destination`、`warp-arrival`、`transponder-created`、`base-select-key`、`base-execute-key` | sound / `event-sound` | 依次为 SND 11087、11381、10485、10463、10181、10055、10167、10169；`warp-arrival` 的循环方式为 `repeat`，播放 8 次 | 无 | 对应的 SND | `confirmed`；10055 在切片中是否可达为 U-004 |
| `sound/hud/overlay-loop`、`overlay-pulse`、`instrument-9-loop` | sound / `hud-sound` | 依次为 SND 10455、10457、10409 | 无 | 对应的 SND | `likely`，U-004 |

- 映射置信度表示来源与用途的结论，不表示字段语义；只有 `unconfirmed` 阻止完整性（[P2-01](../../p2/01/spec.md#清单来源与版本)）。研究若得出 `unconfirmed`，按研究门槛处理。
- 研究若确认 TEX 11069、TEX 11089 或星云图像的显示方式与上表不同，以研究结论为准，并在证据中记录；只有改变 Asset 或角色时才触发研究门槛。受击闪烁贴图与爆炸帧的调色板已按 S-01 的结论写入上表：两者都不带调色板，像素按存储值保留并直接绑定 `palette/flight/models`（[TEX 11069](../../../original/formats/textures.md#tex-11069-hit-shimmer-band-map-confirmed)、[ANIM](../../../original/formats/textures.md#6-anim-explosion-animations-confirmed)），因此不产生 `palette/hit-shimmer` 与 `palette/explosion/<nn>`。

### 切片定义版本 4

`SLICE_DEFINITION_VERSION` 由 3 递增为 4。切片 ID `classic-p2-slice`、候选（group 0 / slot 1）、配置（僚机可选）、`groups` 与 `groupKinds` 都不变，既有的 15 个角色要求也不变。新增的必需角色如下：

| 角色 | 组 | kind | 数量 |
|---|---|---|---|
| `craft-info`、`debris-parameters`、`ai-programs`、`comm-menus`、`base-repair-items`、`flight-messages` | logic | data | 各恰为 1 |
| `scene-settings`、`explosion-table`、`nebula-backgrounds` | models | data | 各恰为 1 |
| `hit-shimmer` | models | image | 恰为 1 |
| `target-display` | cockpit-hud-map | image | 恰为 1 |
| `view-labels` | cockpit-hud-map | data | 恰为 1 |
| `hud-text` | cockpit-hud-map | data | 恰为 1 |
| `event-sound` | audio | sound | 恰为 8 |
| `hud-sound` | audio | sound | 恰为 3 |

**修订 2：** `SLICE_DEFINITION_VERSION` 由 4 递增为 5，新增 logic 组的 data 角色 `comm-messages`，恰为 1；其余角色要求不变。版本 4 的包按 `definition-version-mismatch` 为 `incomplete`，与版本 3 的处理相同。与 P3-09 的修订合并后为版本 6，见[合并说明](#合并说明2026-10-15p3-09-与-p3-10-的修订-2)。

`explosion-animation`、`explosion-frame` 与 `nebula-background` 不是必需角色：它们是上表必需 Asset 的依赖，完整性验证通过依赖闭包要求它们存在。这次修订由本 spec 承担，P2 已批准的 spec 与评审作为历史记录不改写（[P3 阶段索引](../tasks.md#p3-03-规则数据与补充内容导入)）。

### 规范 payload

新增的结构化 data payload 都采用 logic 组的规范 ASCII JSON 规则，读取器须满足以下要求：

- **读取：** 严格读取已解码的纯数据，结果冻结且与输入隔离。
- **编码：** 逐字节规范，相同内容只有一种编码。
- **引用：** payload 内的 Asset 引用恰为描述符依赖。
- **结构限值：** 在读取元素之前检查。
- **版本：** 每个角色族有自己的 payload schema 版本，初始为 1。只有 logic 组共用 `LOGIC_PAYLOAD_SCHEMA_VERSION`，因任务内容形状变化而由 1 递增为 2。

图像与调色板沿用既有的二进制 payload，不新增 schema；声音沿用二进制 payload，schema 由 1 递增为 2，见[声音 payload schema 2](#声音-payload-schema-2)。下表的字段名只是契约示意，实际字段名由 goal 按字段处理规则确定，写入类型注释与模块分册。

| 角色 | 规范形状 | 约束与边界 |
|---|---|---|
| `mission`（扩展） | `eventTriggers`：段 2 事件触发的数组，按段内顺序；每个触发含 `ranges`，每个区间含研究确定的类型化字段、该区间引用的消息（字节串，数量与形状由 S-01 按区间 +8 引用的消息单元确定，可为空）与总结选择值。声明新增 `eventTrigger`（触发序号或 null） | 段 2 的每个元素都必须是被至少一条记录引用的事件触发，否则为 `unsupported-payload`。生成配对的指针与数量必须为零，否则为 `unsupported-payload`。三个运行时计数不转换：研究确认载入或任务开始时会重置它们，则不检查存储值；否则存储值必须为零，非零为 `unsupported-payload`。僚机选项的 `eventTrigger` 必须为 null。`RuleInputs` 与其他既有字段不变 |
| `craft-info` | `hitDamageScale`：TABL 4003 所选一对的倍率，用途已确认，见难度读取路径 1；`guns`、`missiles`：按源序号排列的记录，载入时改写的首字由位置表示；`craft`：恰 20 项，下标为种类位；`missileBodies` | 记录内的字段按字段处理规则类型化；记录之间的引用转为序号。所选 CINF 的 ID 只用于核验映射 |
| `debris-parameters` | `byCraftType`：恰 20 项，每项是该种类位的 96 字节记录数组；嵌套的浮点数组（指针 +0x38、数量 +0x3C）转为数组 | 载入时写入 +0x0C 的归一化取反副本属算术派生，+0x0C 的存储值不转换，由 P3-07 按格式文档实现。载入时对嵌套数组的调整，按 S-01 确定的性质适用字段处理规则 5 |
| `ai-programs` | `groupTriple`：AICO 6001 组 0 的三个值；AICO 6001 中闭环读取的其余字段：头部 +0x08–+0x48 与 +0x18 所指的 5 × 16 字节 `f32` 数组（[ai §2](../../../original/formats/ai.md)）；`programs`：TABL 6003 的 0x54 字节记录，到首字为零为止；`entries`：组 0 闭包的 25 个条目的规范结构；`builtInPrograms`：EXE 中 10 条 0x54 字节的记录。ID 链按 [executable 的 AISTUFF 闭包](../../../original/formats/executable.md#data-loaded-by-the-loop-p3-0110)转为 `entries` 的序号：记录 +0x1C 所指的条目，该条目 +0x38 所指的条目，以及载入器读取的 6 个 ID 列表（+0x3C/+0x40 至 +0x64/+0x68）；各字段所在结构以 S-01 为准 | `entries` 的集合恰为组 0 闭包的 25 条。代码指针（例如内置记录 +0x18 的处理程序）按字段处理规则 4 保留为不透明标识。程序如何解释归 P3-08 |
| `comm-menus` | 5 张菜单，键名按已确认的选择条件命名（目标种类 2、`0x68000` 种类并通过门禁、其余、命令处理程序的两张）；每张菜单的项目含文字与研究确定的类型化字段 | 菜单的选择与状态机归 P3-10；TABL 2001、2011 由 `comm-messages` 导入（修订 2） |
| `comm-messages`（修订 2） | `faceTables`：表 20011、20019、20985 三项，各为按头像排列的子表数组，子表为消息数组；`direct`：表 20983 的消息数组；每条消息为 `{ present: false }`（条目为 0）或 `{ present: true, frameDurations }`（各帧时长，i32，单位 1/8 秒，按帧序）；`names2001`、`names2011`：名单，字节串，按 TABL 顺序 | 头像数、每头像消息数、帧数与名单长度在读取前按限值判定；帧数 ≥ 1，时长按来源保留（不做非负以外的推断，负值为 `unsupported-payload`）。只记录规则需要的元数据，不含 CMOV 的图像、声音与文字。查找、头像分配与时序归 P3-10 |
| `base-repair-items` | `subsystemSelectors`：11 个值，按记录顺序 | 只取 +0x6C；值域按[闭包 #31](../01/subtasks/10-data-closure.md#决定表) 与格式文档记录的值域核对，超出为 `unsupported-payload` |
| `flight-messages` | 7 条字节串，键名按已确认的发送者与触发命名（完成、信标、速度辅助开关两条、摇杆灵敏度三条） | 显示时机与位置归 P3-11 与 P3-13；摇杆键是否接入由 P3-05 决定 |
| `view-labels` | `labels`：`{ subMode: 8, text }` 一项 | 第 0–7 项属 G-08，第 9–12 项的用途未确认，都不导入 |
| `hud-text` | `entries`：固定键集，每键一条字节串。键按仪表与用途用中性名，例如目标显示屏的“无目标”、地图中种类 0x01 的种类词与种类 0x80 的计数行；键集恰为闭包 #47 的 64 个区域 | 键集、每个键是否交给格式化以及预期的转换序列都是 schema 中的固定常量，由转换器与读取器共用。转换器核对来源与常量不符时为 `source` 层的 `unsupported-payload`；读取器核对 payload 不符时报内容层错误。哪些条目在本任务中可达、何时绘制归 P3-13 |
| `scene-settings` | 两组灯光颜色（各 3 个 `f32`）、+0x18 字节、+0x1C–+0x24 的三个 `f32`、三组屏幕闪光参数，以及研究确定的其余头部字段 | 灯光类型与距离阈值等含义只按 executable 的置信度命名 |
| `explosion-table` | `lists`：恰 3 张，按 EXIC 顺序；每项为 `{ sound, animation }` 两个 Asset 引用，以及 EXPL 中研究确定的其他字段 | 由 P3-07 决定的选择不在导入时做 |
| `explosion-animation` | `frames`：图像引用，按帧序；另含研究确定的逐帧或动画参数（例如位置偏移、时长） | 帧数 ≥ 1 |
| `nebula-backgrounds` | `images`：图像引用，按 NEBC 顺序 | 起点（时钟样本 mod 15）与 6 个方向归 P3-12 |

`MissionSetup` 新增 `eventTriggers`，内容与任务 payload 中的相同，原样透传、冻结并与输入隔离；Core 不解释也不调度它们。

### 声音 payload schema 2

`SOUND_PAYLOAD_SCHEMA_VERSION` 由 1 递增为 2。头部仍为 16 字节，其余字段、编码、取值范围与浮点映射都不变，只改两个字节的含义：

| 头部偏移 | schema 1 | schema 2 |
|---|---|---|
| 14：循环方式 | 0 为 `none`（播放一次），1 为 `whole`（循环到被停止） | 另加 2 为 `repeat`（共播放 *n* 次） |
| 15 | 保留，须为 0 | 播放次数 *n*：`repeat` 时为 2–255；`none` 与 `whole` 时须为 0 |

- **既有声音：** 18 个既有声音 Asset 的 payload 字节不变（循环码 0 或 1，偏移 15 为 0），描述符中的 schema 版本随之为 2。
- **读取：** 读取器只接受 schema 2。循环码未知、`repeat` 的次数小于 2、`none` 或 `whole` 的偏移 15 非零，都为 `invalid-sound-payload`。
- **转换：** 按字段处理规则 10，`flags` 8 转为 `repeat`、次数 8；声道数与采样编码沿用 P2-08 的既有规则。
- **播放：** 音频控制器对 `repeat` 共播放 *n* 次后自然结束，可像 `none` 一样被提前停止；`none` 与 `whole` 的行为不变。查看器的声音面板不做专用改动。
- **边界：** 播放次数是来源值，不是触发规则；何时触发、是否提前停止归 P3-14。

### 来源映射与核验

- 每个新增 Asset 在所属步骤的生产映射表中有一条映射，沿用 P2-01 的 locator：
  - 部件为封包条目，按切片配置选择时带子资源；
  - EXE 区域只用于 data，排在条目部件之后，每个区域恰好覆盖字串及其 NUL，或覆盖完整的表。
  - `data/hud/text` 的 64 个区域都是字串区域，归生成 cockpit-hud-map 组的图形步骤；该步骤已读取 EXE 区域 `0x171e58` 与 `0x175ed8`。
- 映射核验与转换共用步骤内读取（P2-05）：每个条目在其步骤内只物理读取一次；读取字节之前按目录项检查条目大小。
- 不带子资源的部件由 `verifySourceMappings` 核验。带子资源的部件（所选的槽与组、AICO 的组、RENS 头部、TABL 10165 的选择字段、TABL 10399 第 8 项、ANIM 帧等）只有在转换器从同一次读取中解析出该子资源后，才升为 `verified`，与 P2-09 的 SCCT 子资源相同；子资源的写法沿用现有转换器的约定。
- 由数据给出的 ID 链在同一次读取中核对，不一致为 `subresource-mismatch`，结果绑定已识别指纹的来源状态：
  - TABL 4003 中所选一对的条目 ID，等于映射的 CINF 部件；
  - AISTUFF 组 0 的表选择与 TABL 6003 记录中的全部 ID，恰为映射的 25 个部件，不多也不少；
  - EXIC 的三张列表恰为映射的 17 个 EXPL；每个 EXPL 的 ANIM 是对应动画 Asset 映射的 ANIM，SND 是音频表中已交付的爆炸音效 Asset 的来源条目；
  - NEBC 的 15 个 ID 恰为映射的 BITM 部件，且顺序一致；
  - （修订 2）表 20011、20019、20985 的各头像子表 ID 与子表中非 0 的 CMOV ID、表 20983 中非 0 的 CMOV ID，恰为映射的 TABL 与 CMOV 部件。
- 新增映射的置信度、U 项与证据按 [Asset 与角色](#asset-与角色)表。

### 限值与预算

- **结构限值：** 每个新增结构都有限值，在读取越界内容或分配之前判定：
  - 条目字节数在读取前按目录判定；
  - 记录数、列表长度、帧数、文字字节数、嵌套数组长度在分配之前判定。

  读取器与转换器共用同一组常量。
- **限值的取值：**
  - 格式规定的固定数目是格式规则，不是可调上限：20 个种类位、TABL 4003 的 18 × 3、EXIC 的 3 张列表、`hud-text` 的固定键集；
  - 其余可调上限取基准观测值的 2 倍，再向上取整到 2 的幂；不得超过既有读取器的绝对上限（见研究门槛 5），也不低于既有限值。观测值来自本切片实际读取的来源；对 ANIM，观测范围是全部 186 帧。
- **预算份额：** 各转换步骤因新增 Asset 增加的份额，按同一规则由新增 Asset 的实际用量推导，维度为 P2-01 的十二个预算维度。`PRODUCTION_PACKAGE.limits` 等于各份额与音频限值之和。新增声音先计入既有的 `AUDIO_BUDGET_LIMITS`，观测值超出时按同一规则提高。
- **计量时机与反馈：** 先计量后分配：用量恰等于上限时通过，超出 1 时为 `budget-exceeded`；被拒绝的扣除不改变用量（沿用 P2-05）。
- **记录：** 观测值记录在格式文档的观测最大值一节；限值与份额记录在模块分册与 subtask 证据中。

### 错误

- **`source` 层：** 复用 `invalid-payload`、`unsupported-payload`、`subresource-mismatch`、`limit-exceeded` 与 `budget-exceeded`，为新结构追加限值名。图像编码 1 只在 ANIM 帧中受支持，其他条目中出现时仍为 `unsupported-encoding`。位置为 `archive:/路径#ID` 或区域 locator，后接只含结构名与下标的路径；不回显字节、数值、名称或文字。
- **内容层：** 新增 data payload（含 `hud-text`）复用 logic payload 的 `invalid-logic-payload`、`non-canonical-payload` 与 `logic-reference-mismatch`，或按数据类别追加同构的错误码，由 goal 决定。sound payload schema 2 沿用 `invalid-sound-payload`。错误码集合封闭，诊断只含稳定 code 与结构路径。
- **Core：** 前提失败仍为 `CoreInputError`，内容层错误原样传递。
- **错误层与宿主映射：** 不变。

### 包身份与转换器版本

- 输出发生变化的转换器，各自递增其组件（例如 `graphics-4`、`logic-2`、`audio-2`、`models-4`，以实际变化为准）。`PRODUCTION_CONVERTER_VERSION` 仍是唯一定义；`PRODUCTION_PACKAGE` 的常量随之更新，并由其测试从 `original-data` 推导核对。
- 修订 2：logic 组的转换器组件随 `comm-messages` 递增；定义版本为 5；`PRODUCTION_CATALOG` 加入 `MAIN/COMMFACE.NOB`，来源指纹随之改变，用户须重新导入。
- 内容身份为：内容 schema 1、切片 ID `classic-p2-slice`、定义版本 4、新的 `ConverterVersion` 与原有来源。`ManifestIdentity` 的推导机制不变。
- 导入协议保持版本 5。只有阶段集合或消息形状改变时才递增，并且旧版本的消息被拒绝。

### 持久化与兼容

- IndexedDB 的数据库版本、记录格式与缓存键结构都不变。
- 旧包中的声音为 sound payload schema 1，随旧转换器版本不再恢复；读取器与音频控制器只接受 schema 2。
- 旧转换器版本的条目与当前生产配置不一致，因此不提供恢复，用户须重新导入。即使读到这样的记录，切片定义版本 3 也会报 `cache-incompatible`；恢复时仍由 `validatePackage` 与读取器重新校验。
- 旧记录保留在浏览器中，不迁移也不清理（P5）。包变大后存储需求增加，建议性的空间预检照常工作；[本地导入指南](../../../guides/local-import.md#缓存与重新导入)补充重新导入的说明。
- 不涉及玩家存档；规范数据与 `MissionSetup` 都不是存档格式。

### P3-09 的修订：地图几何（修订 2）

本节由 P3-09 的子任务 08 加入（2026-10-14），定稿 [P3-09 spec](../09/spec.md#地图几何的内容输入) 的关卡 D-01 中内容输入的部分；Core 一侧的输入、校验与 setupHash 在 [P3-02 的 MW-01](../02/spec.md#mw-01-世界创建输入与静态规则数据)。前文各节与本节不一致时以本节为准；其他导入项、限值与错误不变。原版依据：[cockpit 的 10 型记录](../../../original/formats/cockpit.md#instrument-types-per-slot-confirmed-p3-0730)、[地图鼠标](../../../original/formats/executable.md#map-mouse-input-p3-0503)、[光标与标记中的 `0x49e74`](../../../original/formats/executable.md#cursor-destination-and-marker-p3-0902)、[放大窗口与信息小窗](../../../original/formats/executable.md#zoom-window-information-window-and-labels-p3-0904)与 [hud §1 的字体表](../../../original/formats/hud.md#1-bitmap-fonts-confirmed)。

- **Asset 与角色：**

  | Asset ID | kind / 角色 | 内容 | 依赖 | 来源部件 | 映射置信度 |
  |---|---|---|---|---|---|
  | `data/hud/map-geometry` | data / `map-geometry` | 地图仪表记录的含末像素矩形与重绘间隔，以及字体 1 的字形高度 | 无 | `SR.NOB` CCKD 10103：布局号为 6 的目录槽中类型为 10 的唯一仪表记录（子资源）与头部字体表第 1 项（子资源） | `confirmed` |

  只导入规则需要的这三个字段：Core 用它们得出主地图、信息小窗与放大窗口的像素矩形、两组换算比例、光标起点与信息行容量；P3-13 通过 Core 的 `map` 分区取得同一几何，不重新解释原版记录。CCKD 10101（LO 套件）、10097 与其他仪表记录不导入；记录的 +0x14、+0x24 与运行时的 +0x1C 不导入（地图处理程序不读，[cockpit](../../../original/formats/cockpit.md#instrument-types-per-slot-confirmed-p3-0730)）。
- **切片定义版本 5：** `SLICE_DEFINITION_VERSION` 由 4 递增为 5，新增必需角色 `map-geometry`（组 `cockpit-hud-map`，kind `data`，恰为 1）。切片 ID、候选、配置、组与其他角色不变。与 P3-10 的修订 2 合并后为版本 6，见[合并说明](#合并说明2026-10-15p3-09-与-p3-10-的修订-2)。
- **规范 payload（schema 1，`MAP_GEOMETRY_SCHEMA_VERSION`）：** 沿用 HUD data payload 的规范 ASCII JSON（与 `view-labels`、`hud-text` 相同的规则）：

  ```ts
  interface MapGeometry {
    rectangle: { x0: number; y0: number; x1: number; y1: number }; // 记录 +0x04–+0x10（i32），画面像素，含末像素
    redrawInterval: number;                                          // 记录 +0x18（u32），时钟单位
    informationLineHeight: number;                                   // 字体表第 1 项头部 +3（u8），像素
  }
  ```

  - **读取器 `readMapGeometry`**（`src/content/hud/`）：严格读取，结果冻结并与输入隔离；字段恰为上述三个。约束：0 ≤ x0 ≤ x1 ≤ 639，0 ≤ y0 ≤ y1 ≤ 479；s = y1 − y0 + 1 ≥ 2（信息小窗与放大窗口各高 s >> 1 ≥ 1）；x0 + s < x1（右侧条带宽 x1 − (x0 + s) ≥ 1）；`redrawInterval` 为 u32；`informationLineHeight` 为 1–8 的整数（与字体读取器的高度上限相同）。不满足的为 `invalid-flight-data-payload`（与其他 HUD data payload 相同），诊断只有结构路径与原因。跨输入的检查（起点在主地图内、比例为有限正数、重绘间隔与步长）在 Core（P3-02 MW-01）。
  - **限值：** `payloadBytes` 256（三个字段的规范编码远小于此，2 的幂）。
- **来源与核验：** 生成 `cockpit-hud-map` 组的图形步骤在读取 CCKD 10103 的同一次读取中：先按目录核对头部与目录范围，找到 +0x00 等于 6 的目录槽（恰一个，否则 `unsupported-payload`）；核对其仪表记录数组（+0x18 指针、+0x1C 数量、48 字节步长）完整位于条目之内，数量不超过 32（基准每槽至多 11 个，按 2 倍取整到 2 的幂），然后才读取；类型为 10 的记录恰为一个（否则 `unsupported-payload`）；字体表第 1 项沿用既有字体读取器。子资源在转换器从同一次读取中解析出后升为 `verified`，写法沿用现有转换器的约定。读取越界为 `invalid-payload`，计数超限为 `limit-exceeded`；诊断不回显数值。
- **预算：** 图形步骤的份额增加 1 个 Asset 与该 payload 的字节数（按限值），其余维度不变；`PRODUCTION_PACKAGE.limits` 随之更新。
- **包身份与转换器版本：** 图形转换器的组件由 `graphics-4` 递增为 `graphics-5`（若并行任务合入时已先递增，则相对实际集成基线再递增一次），`PRODUCTION_CONVERTER_VERSION` 随之改变；内容 schema 仍为 1，导入协议版本不变（阶段集合与消息形状不变）。
- **持久化与兼容：** 旧转换器版本与切片定义版本 4 的缓存不再恢复，用户须重新导入（切片定义版本不符报 `cache-incompatible`）；IndexedDB 的数据库版本、记录格式与缓存键结构不变；取消、坏输入、配额不足或事务失败沿用既有事务，不留半包，不覆盖已有有效包；旧记录不迁移也不清理（P5）。
- **应用与 Core：** 应用从同一经 `validatePackage` 验证的包中按角色解码该 Asset，作为 `createWorld`、录制入口与 `ReplayContent` 的 `mapGeometry: { id, content }`（P3-02 MW-01）；setupHash 覆盖其 ID 与完整内容。实际任务不再依赖渲染器存在才取得地图几何。
- **任务记录 +0x7C 不在本修订中：** 对象记录读取器已把它列为保留字并拒绝非零值；切片全为 0，Core 的地图可见基础值恒为 false（P3-02 MW-01）。

## 技术决定

用户指示按推荐答案决定需要澄清的问题（2026-10-09）。以下选择据此确定，批准时一并确认。冻结决定未改变，不需要 ADR。

1. **不扩展基础契约：** 不新增资源组、Asset kind 或导入阶段；内容 schema 保持 1，切片 ID 不变，只递增定义版本。现有组与 kind 已能容纳全部导入项，加组或 kind 会牵动协议、缓存与完整性。若改名切片 ID，就须声明取代旧定义，增加无收益的变动。
2. **只保留来源值：** 字段按[字段处理规则](#字段处理规则)保留来源值，规则语义归消费它的规则任务，这是 P3 阶段索引对本任务的要求。存储类型须有证据，以免规则任务从比特模式自行解释原版数据。
3. **结构性载入变换复现，算术派生不做：** 这与 P2-09 复现段 6 交换的先例一致，也避免在导入时决定浮点运算的语义与精度。
4. **选择在导入时解析，整条目载入的结构完整导入：** 按切片配置只导入所选部分，与 SCCT 槽位的处理一致。整条目载入的结构不按切片会生成的种类裁剪，因为裁剪需要先解释武器挂点等规则。
5. **ANIM 帧为独立图像：** 每帧按 P2-01 的 `independent-image` 单位成为 image Asset；动画、爆炸表与星云列表是引用图像的 data Asset。这样不需要新 kind，消费者也不必理解原版的增量编码。
6. **结构化数据用规范 ASCII JSON：** 与 logic 组相同，可审阅、确定，现有的严格读取设施可以复用；像素与采样仍用二进制。
7. **以必需角色执行数据闭包：** 版本 4 为每个闭包根 Asset 规定确切数量，缺失时完整性验证即判为不完整，而不是推迟到规则任务运行时才发现。
8. **限值由观测值推导：** 可调上限须包容基准观测值，而观测值要到 S-01 研究时才能取得，因此在 spec 中不猜数值，而是批准推导规则：基准观测值的 2 倍，向上取整到 2 的幂，并受既有绝对上限约束。超出绝对上限时触发研究门槛。
9. **查看器与任务诊断不做专用改动：** 新增的图像与声音已经出现在通用列表中；data 的数量、字节与哈希由本地 CLI 报告。专用显示归 P4。重复播放只改音频控制器（技术决定 15），查看器不改。
10. **Core 只透传事件触发：** `MissionSetup` 加入原样透传的 `eventTriggers`，使声明中的触发序号在载入结果内可以解析；Core 不解释也不调度它们，其他新数据经内容读取器提供给 P3-02 与规则任务。这样不与并行的 P3-02 同时设计 Core 契约。
11. **取证方式：** 结构由只读 Ghidra 与本地数据确定。ANIM 的解码规则以代码为准（已确认），再辅以两项证据：
    - 全部 186 帧都按该规则恰好用尽数据；
    - 解码结果与本地截图或参考视频中的爆炸在外观上一致（最高为高概率）。

    本任务不需要基准运行或用户操作；确需运行时按研究门槛处理。
12. **EXPL 声音复用已交付的 Asset：** 四个爆炸音效已作为 `sound/explosion/blast-v1`–`v4` 交付，同一来源采样只形成一个 Asset（P2-08），因此爆炸表跨组引用它们。
13. **本地核对分两层：** 本地 CLI 用同一作业模块，证明 Worker 的产出可用；独立读取不共用项目的格式解析与转换，证明产出与格式文档一致。
14. **HUD 直接绘制的 EXE 文字作为 cockpit-hud-map 组的 data 角色导入（2026-10-09 修订，用户选择）：** P3-03/24 发现 HUD、地图与信息窗的代码直接绘制对象 4 的 64 条文字（闭包 #47），而 P3-13 要求文字来自 Core 与导入内容。用户在三个方案中选择新增角色 `hud-text`，导入全部 64 条，而不是只取本任务可达的 51 条：哪些种类与条件会出现属于规则研究，与字段处理规则 7 的理由相同。另两个方案是并入 logic 组的 `flight-messages`（会改变已计划的 payload 形状），或另立 G 缺省（与 P3-13 及 G 清单的限制冲突）。payload 只存字节串，转换序列作为 schema 常量，不在导入时解释格式。
15. **sound payload 增加按次数重复（2026-10-09 修订，用户选择）：** P3-03/19 在基准上发现 SND 10181（`warp-arrival`）的 `flags` 为 8；按已确认的代码，原版播放 8 次。用户选择递增 sound payload 的 schema 来保真表示，而不是从切片中去掉该声音（推迟到 P3-14），也不是近似为播放一次。次数放在原保留字节中，所以既有声音的 payload 字节不变；音频控制器按次数播放，试听与原版一致。
16. **执行中确认的表示（2026-10-09 修订）：** 下列判断原由协调者在执行中作出，随本次修订写入契约：
    - `ai-programs` 导入 AICO 6001 中闭环读取的全部字段（组 0 三元组、头部 +0x08–+0x48 与其数组），依据是闭包 #22 整条目导入与字段处理规则 7；
    - 受击闪烁贴图与爆炸帧都不带调色板，像素按存储值保留并直接绑定 `palette/flight/models`，不产生 `palette/hit-shimmer` 与 `palette/explosion/<nn>`；
    - `SOURCE_ENTRY_TYPES.data` 加入 ANIM，使 `data/explosion-animation/<nn>` 能映射整个 ANIM 条目。

## 验收标准

| ID | 可观察的通过条件 | 验证方法与所需证据 |
|---|---|---|
| AC-01 | S-01 的研究写入格式文档。[导入项](#导入项)的每一项都有：<br>- 字段位置、存储类型及其证据与置信度；<br>- 计数与观测最大值；<br>- 块内指针与条目 ID 的引用目标；<br>- 载入变换与运行时字段的重置，及其处理（复现、不执行或不转换）；<br>- 文字规则；<br>- 只在基准中为零的位置。<br>此外，ANIM 编码 1 的解码规则由代码确认，帧的调色板、透明与显示方式至少高概率。U-001、U-004、U-018、U-022、U-027、U-028、U-030 等受影响的 U 项已更新，负责阶段不改。若触发研究门槛，修订已获批准 | 本地只读研究，产物在 `local/research/p3-03/`；文档 diff 只含结构、计数、置信度与证据路径，不含数值、文字或反编译代码；链接与元数据检查 |
| AC-02 | 任务事件（S-02）：<br>- **正向：** 合成 SCEN 的段 2 转换正确。样本覆盖多个区间、有无消息、非零与零的总结选择值、非对齐指针、无序重定位，以及多条记录引用同一触发；<br>- **拒绝：** 每种情况都返回预期的 code 与位置。包括生成配对非空、须为零的运行时计数非零、段 2 元素未被引用、+0x54 不指向元素起点、文字缺少 NUL 或超长、区间数超限；<br>- **Core：** `loadMission` 透传事件触发与声明的触发序号，结果冻结、与输入隔离、两次载入深度相等；既有 Core 测试通过 | Node 表驱动测试 |
| AC-03 | 机型与武器（S-03）：<br>- **选择：** 合成 TABL 4003 的多行多列按候选选出一对；所选 CINF ID 与映射不符时为 `subresource-mismatch`，槽或组越界时同样拒绝；<br>- **转换：** CINF 的各记录数组按研究结构转换；序号回写由位置表示；种类位数组恰为 20 项；<br>- **字段：** 有符号负值、无符号最高位与 `f32` 都按来源保留；只在基准中为零的位置出现非零时为 `unsupported-payload` | Node 测试 |
| AC-04 | 碎片参数（S-04）：20 个 {指针, 数量} 与 96 字节记录，以及嵌套浮点数组转换正确；+0x0C 的存储值不转换；越界与超限按 code 拒绝 | Node 测试 |
| AC-05 | AI 数据（S-05）：<br>- **正向：** 程序表到首字为零为止；+0x1C 所指条目、该条目 +0x38 所指条目与 6 个 ID 列表按研究确定的结构转为 `entries` 序号；代码指针为不透明标识；AICO 只取组 0 的三元组，以及闭环读取的头部字段与其数组；<br>- **ID 链：** `entries` 的集合恰为映射部件，多出或缺少都为 `subresource-mismatch`；<br>- **拒绝：** 各结构的越界与超限按 code 拒绝 | Node 测试 |
| AC-06 | 通讯菜单、基地修理项目、程序文字、视角标签与 HUD 文字（S-06 至 S-08）：<br>- **正向：** 5 张菜单、11 个选择值、7 条消息、1 个标签与 64 条 HUD 文字转换正确，文字为字节串，保留 128–255 的字节；HUD 文字的键集恰为 schema 的固定集合；<br>- **拒绝：** 文字缺少 NUL、超长、区域越界，以及选择值超出记录的值域，都按 code 拒绝；HUD 文字的转换序列或是否交给格式化与 schema 常量不符时为 `unsupported-payload`；<br>- **范围：** TABL 10165 与 10399 中不属于本任务的部分不出现在 payload 中 | Node 测试 |
| AC-07 | 场景设置、受击闪烁与目标显示屏背景（S-09、S-12）：RENS 头部各字段按类型转换，`data/projectile-visuals` 不变；TEX 11069 只生成 image，存储值原样保留并绑定 `palette/flight/models`；TEX 11089 生成 image 与 palette；显示方式与依赖符合 Asset 表 | Node 测试 |
| AC-08 | 爆炸（S-10）：<br>- **解码：** 代码生成的合成 ANIM 按文档化的编码 1 规则编码，经转换器解码为逐帧完整图像，与生成时的帧逐像素相等；<br>- **样本覆盖：** 编码规则中的每个分支、多帧，以及帧间依赖（若规则有）；<br>- **拒绝：** 截断、越界与剩余字节为 `invalid-payload`，未覆盖的分支为 `unsupported-payload`；<br>- **引用：** 爆炸表的引用与依赖正确，ID 链不一致时为 `subresource-mismatch` | Node 测试 |
| AC-09 | 星云背景（S-11）：NEBC 的 15 个引用按顺序指向转换后的 BITM 图像，绑定 `palette/flight/models`；列表与映射不一致时为 `subresource-mismatch` | Node 测试 |
| AC-10 | 音效（S-13）：<br>- **转换：** 11 个 SND 经 P2-08 的转换生成 sound Asset，ID 与角色符合 Asset 表；同一 SND 不属于两个 Asset；<br>- **重复：** `flags` 8 转为 `repeat`、次数 8；`flags` 为 0、1、8 以外的值仍为 `unsupported-payload`；<br>- **既有声音：** 18 个既有声音 Asset 的 ID、角色与 payload 字节不变；<br>- **播放：** 音频控制器对 `repeat` 共播放 *n* 次后结束，可被提前停止；`none` 与 `whole` 不变 | Node 测试（转换、payload 与音频控制器） |
| AC-11 | 每个新增 payload 族的读取器都满足以下要求：<br>- **正向：** 往返后逐字节相同；<br>- **拒绝：** 缺少字段、未知字段、类型错误、非规范编码（含空白、字段顺序与 -0）、非有限数、超限，以及引用与依赖不一致，都按 code 拒绝；<br>- **隔离：** 结果冻结，调用者修改输入或先前结果不影响后续读取。<br>sound payload schema 2 的读取器：三种循环方式与 2–255 的次数可往返；循环码未知、`repeat` 的次数小于 2、`none` 或 `whole` 的偏移 15 非零都为 `invalid-sound-payload`；schema 不是 2 时拒绝 | Node 单元测试 |
| AC-12 | 切片定义版本 4：<br>- **正向：** 版本 4 的合成完整包经 `validatePackage` 为 `complete`；<br>- **缺失：** 逐一去掉每个新增必需角色的 Asset，或改变 `event-sound`、`hud-sound` 的数量，结果为 `incomplete` 并报 `role-cardinality` 或依赖缺失；<br>- **旧包：** 定义版本 3 的包为 `incomplete`，报 `definition-version-mismatch`；<br>- **唯一定义：** 生产定义仍只有一份，由工程边界回归保证 | Node 测试；工程边界回归 |
| AC-13 | 来源映射与核验：新增映射能通过 `readSourceMappingTable` 读取；不带子资源的部件经核验为 `verified`，带子资源的部件只在转换器解析出该子资源后才为 `verified`，来源状态绑定指纹；四条 ID 链中的任何一处不一致都报 `subresource-mismatch`；置信度与 U 项符合 Asset 表 | Node 测试，使用合成映射与合成光盘 |
| AC-14 | 限值与预算：<br>- **结构限值：** 每个新增结构限值恰等于上限时通过，超出 1 时为 `limit-exceeded`；<br>- **预算：** 每个新增的份额维度恰等于份额时通过，超出 1 时为 `budget-exceeded`，观测值包含先前步骤的用量；转换器计入的用量等于独立计算的值；<br>- **生产配置：** `PRODUCTION_PACKAGE.limits` 由测试从各份额推导；<br>- **记录：** 限值与份额的取值和推导所用的观测值已记录 | Node 测试；文档核对 |
| AC-15 | 身份与缓存：<br>- **版本：** 输出变化的转换器组件已递增，`ConverterVersion` 只有一个生产定义，`PRODUCTION_PACKAGE` 与推导一致；<br>- **旧缓存：** 旧转换器版本的包记录不提供恢复，定义版本 3 的记录读取时为 `cache-incompatible`；<br>- **新缓存：** 版本 4 的合成包可提交与恢复，恢复时重新校验 | Node 测试（缓存记录与资源持有者）；浏览器回归中的 `resource-cache`、`cache-recovery` |
| AC-16 | 导入作业：合成白名单与合成光盘上的生产作业满足以下要求：<br>- **结果：** 发送四组，都为 `group-complete`，全包按定义版本 4 为 `complete`；<br>- **读取日志：** 只读取映射表引用的条目与区域，以及相关封包的文件头与目录；每个条目在其步骤内只物理读取一次；不读取闭包之外的条目（例如 MUSC、其他 CINF、AISTUFF 组 1 与组 2 独有的条目、COMM TABL 2001 与 2011）；<br>- **失败：** 转换失败时不发送任何组，`source` 层的错误带完整的 `limit`；<br>- **协议与回归：** 协议版本与阶段符合[包身份](#包身份与转换器版本)；P2-04 的 Node 测试与失败矩阵继续通过 | Node 集成测试，使用宿主、真实结构化克隆端口与持有者 |
| AC-17 | 浏览器：版本 4 的合成包在生产预览中完成以下流程，无未预期的网络请求或资源遗留：<br>- 导入后为 `Complete resources, viewable`，并保存、刷新后恢复；<br>- 查看器能打开至少一个爆炸帧、一个星云图像、受击闪烁贴图与目标显示屏背景；<br>- `Sounds` 列出新增的声音，并能播放其中一个合成波形；`repeat` 方式的合成声音按次数播放后结束。<br>既有的 E2E 用例（含网络审计与资源平衡）全部通过 | `pnpm test:e2e`；按 [browser-testing](../../../../.agents/skills/browser-testing/SKILL.md) 核对实际画面，不只看 Canvas 或 HTTP 200 |
| AC-18 | 边界与隐私：<br>- **依赖方向：** `core/` 与 `content/` 不导入 `original-data`；转换器只经 `VerifiedSource` 读取；Worker 仍禁用网络 API；<br>- **合成数据：** 合成样本只由代码生成，源码与测试中没有原版的数值、文字或字节（以不同的合成值证明数据来自输入）；<br>- **诊断：** 诊断与 CLI 输出不含名称、文字、数值、原版字节或私人路径；<br>- **合规：** `pnpm check:original` 通过 | 工程边界回归、ESLint、Node 测试、代码审阅、本地合规 |
| AC-19 | 本地核对（S-16）满足以下要求：<br>- **CLI：** 在开发者本机的基准镜像上，用与 Worker 相同的作业模块得到 `complete` 的版本 4 包，`loadMission` 成功。输出每个新增角色的 Asset 数、记录、帧、文字与声音的计数，payload 字节，各阶段读取增量、manifest 身份与哈希，以及限值与观测值的对照；<br>- **nob-check：** 扩展后能解码全部 186 个 ANIM 帧，每帧恰好用尽其数据，并核对 EXIC/EXPL/ANIM/SND 与 TABL 4003→CINF 的引用；既有的 NEBC/BITM 引用核对继续通过；<br>- **独立读取：** 只共用光盘与 IMFAT 读取，与规范数据逐项一致，只记录结论、计数与哈希；<br>- **外观：** ANIM 帧与至少一处本地截图或参考视频中的爆炸外观一致，记录方法、来源与置信度；比较用的图像只临时存放在 `local/`，不进入仓库或文档；<br>- **存放：** 全部输出只在 `local/` | 本地运行记录（只含结论、计数与哈希）；subtask 证据 |
| AC-20 | 文档：<br>- S-17 列出的分册、目录树与指南已同步，指南写明须重新导入；<br>- 新增 CLI 写入工具用法与 `AGENTS.md`；<br>- 新增格式文档已加入文档地图；<br>- [audio](../../../original/formats/audio.md) 记录 `flags` 8 出现在切片中及其表示；<br>- 修改过的文档都更新了 `updated:`，链接与锚点有效 | 文档核对与链接检查 |
| AC-21 | 工程检查：`pnpm check` 通过；`pnpm test:e2e` 通过 | 命令输出 |
| AC-22 | 通讯消息元数据（S-18，修订 2）：<br>- **正向：** 合成 COMMFACE 的三张头像表、子表与直接列表，以及合成 CMOV 的帧数与时长，转换为 `comm-messages`；条目为 0 的消息为 `present: false`；两份名单为字节串、保留 128–255 的字节；<br>- **ID 链与拒绝：** 子表或 CMOV 与映射不一致为 `subresource-mismatch`；帧数为 0、负时长、超限与截断按 code 拒绝；<br>- **切片：** 定义版本 5 的合成包为 `complete`，缺少 `comm-messages` 为 `incomplete`，版本 4 的包为 `definition-version-mismatch`；<br>- **白名单与读取：** 生产白名单含 `MAIN/COMMFACE.NOB`；读取日志只含映射的 TABL 与 CMOV，不读取 `COMMFAC2.NOB`；<br>- **本地核对：** 本地 CLI 在基准镜像上得到版本 5 的 `complete` 包，计数与 executable RQ4 的数据一致（只输出计数与哈希） | Node 测试；本地 CLI；`pnpm check` 与 `pnpm test:e2e` |

## 验证策略

- **单元与契约测试：**
  - `original-data/formats/` 与 `conversion/` 中新增解析器与转换的正向和拒绝用例，包括非对齐指针、无序重定位与 ID 链；
  - `content/` 中各 payload 读取器、切片定义、完整性与预算；
  - `core/mission/` 中事件触发的透传；
  - Worker 的作业、宿主与持有者集成；缓存记录与资源持有者。

  合成样本由代码生成，ANIM 的合成编码器按格式文档实现。
- **Replay 与一致性：** 不适用。本任务不产生 Core 状态或领域事件；`loadMission` 的确定性由 AC-02 与既有测试覆盖。
- **浏览器验证：** 用版本 4 的合成包运行既有 E2E 与 AC-17 的流程（导入、缓存、恢复、查看器、试听、网络审计、资源平衡）；按 browser-testing skill 核对实际画面与声音调用。不用原版数据。
- **原版对照：**
  - 结构来自只读 Ghidra 与本地数据，事实写入 `docs/original/`；
  - `nob-check` 覆盖全部 ANIM 帧与引用；
  - 本地 CLI 与独立读取核对生产输出；
  - ANIM 的外观与本地截图或参考视频比较，最高为高概率。

  这些都由 agent 完成，不需要用户试玩或基准运行；只有触发研究门槛时，才按运行时测量指南请用户操作，并说明原因。
- **工程检查：**
  - 针对性检查：`pnpm exec vitest run src/original-data src/content src/core/mission src/workers src/platform/storage src/platform/audio src/app tools`，按改动范围收窄；
  - 完成前：`pnpm check`、`pnpm test:e2e` 与 `pnpm check:original`；
  - 文档：链接与元数据检查。

## 风险与恢复

风险等级：中高。改动横跨导入链、内容契约、切片定义与缓存身份；ANIM 编码 1 与 AI、通讯数据的结构尚未研究；同时与并行的 P3-02 共享任务内容的测试数据与 `core/mission/`。

- **ANIM 无法确认解码规则：** S-10 与 AC-08、AC-17、AC-19 的相应部分阻塞，记录恢复条件，不用临时资源或近似图像代替。P3-06 与 P3-07 依赖整项交付，是否拆分交付由用户按研究门槛决定。
- **AI 与通讯数据的结构复杂：** 这些可能是由解释器读取的数据，字段类型难以逐一确定。按字段处理规则，类型未定的非零字段触发门槛，不以原始字节冒充规范数据。
- **与 P3-02 冲突：** 任务内容形状变化会影响 Core 的测试数据。本任务对 `core/` 只做透传与测试适配，不设计正式契约；合并顺序由协调者处理。
- **旧缓存与重新导入：** 用户须重新导入。指南写明这一点，旧记录保留到 P5 处理。
- **包体积与导入耗时增加：** 由本地 CLI 记录实际字节与读取量。没有新的性能门槛；发布级性能归 P5。
- **可逆性：** 全部是代码与文档改动，可以回退。回退后缓存键随转换器版本回到旧值，版本 4 的缓存条目不再提供恢复，不会被误读。

## 未决事项

无。需要澄清的选择已按用户指示采用推荐答案，记录在[技术决定](#技术决定)中。原版结构的未知项是执行中的研究，受[研究门槛与阻塞](#研究门槛与阻塞)约束，不以猜测填补。

## 审批

用户于 2026-10-09 明确批准经 review-spec 修订后的完整契约（“approve the spec and generate goal”），并要求生成 goal。批准范围为 S-01 至 S-17、AC-01 至 AC-21、导入项表、行为与边界、字段处理规则 1 至 10、研究门槛与阻塞、数据模型与契约（Asset 与角色、切片定义版本 4、规范 payload、来源映射与核验、限值与预算、错误、包身份与转换器版本、持久化与兼容），以及技术决定 1 至 13（其中按用户指示由 agent 采用的推荐方案随本次批准一并生效）。

本次只记录批准，不改变范围、行为或验收要求。批准不代表实现完成，不授权以合成值、临时资源或近似规则补齐研究缺口；触发研究门槛时仍须修订本 spec 并重新批准。

### 修订 1（2026-10-09，已批准）

执行中出现两项须由用户决定的契约变化。用户于 2026-10-09 在执行协调中分别选择了推荐方案：

- **HUD 直接绘制的 EXE 文字（P3-03/24，研究门槛 3 与 4）：** 新增 cockpit-hud-map 组的 data 角色 `hud-text`，导入闭包 #47 的全部 64 条（技术决定 14）；
- **SND 10181 的 `flags` 8（P3-03/19）：** sound payload 递增为 schema 2，增加 `repeat` 循环方式（技术决定 15）。

本次修订同时把执行中由协调者作出的表示判断写入契约（技术决定 16），并更正“当前实现与依据”中关于 `SOURCE_ENTRY_TYPES` 的不完整说法。

- **改动的部分：** 问题与目标、S-05、S-08、S-13、不包含、涉及模块、当前实现与依据、导入项表、字段处理规则 8 与 10、Asset 与角色、切片定义版本 4、规范 payload（含新增的“声音 payload schema 2”一节）、来源映射与核验、限值的取值、错误、持久化与兼容、技术决定 9 与 14–16、验证策略的针对性检查，以及 AC-05、AC-06、AC-07、AC-10、AC-11、AC-17、AC-20。其余契约与原批准范围相同。
- **批准：** 修订后的契约经审阅后，用户于 2026-10-09 明确批准（“Approve the revised spec (revision 1); then add the remediation subtasks to the goal”）。批准范围为修订后的完整契约，含技术决定 14 至 16 与改动后的 AC。已完成子任务的证据保留，受影响的验收由 goal 新增的修复子任务承担。

### 修订 2（2026-10-14，P3-09 的 D-01；按用户 2026-10-14 的预先授权由 agent 定稿，待用户事后审阅）

P3-09 的关卡 D-01 要求把地图几何的内容输入作为本 spec 的增量修订定稿（[P3-09 spec 的地图几何的内容输入](../09/spec.md#地图几何的内容输入)）。

- **改动的部分：** 只新增“P3-09 的修订：地图几何（修订 2）”一节与本条记录，并改了 front matter 的日期。没有新增或改动 S/AC 编号；其他导入项、字段处理规则、限值、错误与持久化规则不变；已完成子任务的证据不改写。修订后未重跑 review-spec。
- **授权：** [P3-09 goal 的审批节](../09/goal.md#审批)记录的预先授权：关卡 08（D-01）由 agent 按研究证据取推荐方案定稿，如实记为“按预先授权由 agent 定稿、待用户事后审阅”。这不是用户本人对本修订的批准。授权不涵盖总计划与 ADR 中的冻结决定，本修订不涉及它们。
- **所选方案与理由：** 新增 `cockpit-hud-map` 组的 data 角色 `map-geometry`，只含 10 型记录的矩形、重绘间隔与字体 1 的高度。原版每次进入地图都只从该矩形导出主地图与右侧两块区域（`0x49e74`），信息行容量是区域高度除以字体 1 的高度，调度器读重绘间隔；三者都影响规则（光标起点与量化、换算、命中、信息行），所以作为 setupHash 绑定的规则数据导入。
- **被排除的方案：**
  1. **扩展既有的 `layout` payload：** 改变图像布局的 schema，并让规则数据依赖只供绘制的布局资源。
  2. **只导入矩形，信息行容量由 P3-13 计算：** 计数行的生成取决于容量，Core 就无法给出完整的信息行，P3-13 要重新实现规则。
  3. **导入全部仪表记录或 LO 套件：** 超出 P3-09 spec S-02 的最小范围。
  4. **在 Core 中硬编码矩形：** 违反不硬编码原版数据的规则。
  5. **同时导入记录 +0x7C：** 读取器已拒绝其非零值，切片没有需要（见[地图几何的修订](#p3-09-的修订地图几何修订-2)末条）。

### 修订 2（2026-10-14，已批准）

P3-10 的 D-03（逻辑媒体边界）证明原版没有关闭通讯媒体的受支持设置，档案打不开时停靠请求必定超时（[executable RQ7](../../../original/formats/executable.md#rq7-archive-choice-and-the-absence-of-a-media-off-path--confirmed-code-durations-confirmed-data)）。Core 的逻辑模型因此需要消息时长与头像子表的元数据，以及计算名称序号的两份名单。

- **改动的部分：** S-18（新增）、不包含的 G-03 一条、导入项表、Asset 与角色、切片定义版本（修订 2 段：版本 5）、规范 payload（`comm-menus` 的约束与新增 `comm-messages`）、来源映射与核验（第五条 ID 链）、包身份与转换器版本（白名单与指纹），以及 AC-22（新增）。其余契约不变；已完成子任务的证据保留。
- **实现：** 由 [P3-10 goal](../10/goal.md) 新增的子任务实现，P3-03 goal 不重新打开。
- **批准：** 用户于 2026-10-14 授权 agent 直接批准 P3-10 关卡的推荐方案（“i authorize you to approve the recommended options for gates 07, 08 and 10”）。本修订是 D-03 推荐方案的组成部分，由 P3-10 子任务 07 依据该授权批准。


### 合并说明（2026-10-15，P3-09 与 P3-10 的修订 2）

上面两条修订 2 在各自分支上定稿，都把 `SLICE_DEFINITION_VERSION` 由 4 递增为 5，并分别递增转换器的图形组件（地图几何，`graphics-5`）与逻辑组件（`comm-messages`，`logic-3`）。两者在 P3-08 的分支上合入同一实现（协调者按用户授权执行，见 [P3-08 goal](../08/goal.md#执行记录)），不改变任何一方的范围与决定，只调整版本：

- **切片定义版本 6：** 版本 4 的角色加上 `map-geometry` 与 `comm-messages`，各恰为 1。两个分支的版本 5 内容不同，合并后再递增一次，任一分支单独产生的版本 5 包都按 `definition-version-mismatch` 为不完整，缓存记录报 `cache-incompatible`。
- **转换器版本：** `osr-import.graphics-5.logic-3.audio-2.models-4`。两次递增的是不同组件，各取较大值即可区分两边单独的输出，不再另行递增。
- **来源指纹与白名单：** 采用 P3-10 的（生产白名单加入 `MAIN/COMMFACE.NOB`）；P3-09 没有改变白名单。
- 文中“版本 5”的段落分别描述各自的修订，合并后的要求以本说明为准。
