---
type: plan
status: accepted
phase: P2
task: "07"
updated: 2026-10-06
related: [ADR-0007, ADR-0008, ADR-0009, ADR-0015, U-006, U-029, U-030, B-001]
reviewed: sha256:86df188dc044
---

# P2-07：驾驶舱、HUD 与战略地图资源 — Spec

## 问题与目标

[P2-05](../05/spec.md) 已交付调色板、索引图像与字体的规范 payload、唯一的颜色展开逻辑，以及导入作业中的 `convert-graphics` 阶段。但驾驶舱、HUD 与战略地图仍不能成为 P3 可消费的规范内容：

- **只支持整条目图像：** 图形步骤只转换偏移 0 处的图像记录（TEX、BITM）与 CCKD 字体表，见 [graphics-step.ts](../../../../src/original-data/conversion/graphics-step.ts)。CCKD 分组中的元素、MFDD 的两个列表与 TABL 中的图像列表都是容器内的记录，P2-05 已把它们的解析交给本任务。
- **没有布局：** P2-01 已有 `layout` 类别、它的来源类型（CCKD、TABL）与 `front-cockpit` 角色（恰 1 个 layout），但没有 payload schema、读取器或转换器，元素的屏幕坐标与层次无处表达。
- **组不完整、未发送：** `cockpit-hud-map` 分区只有一份飞行调色板与三个字库，满足不了 `front-cockpit`、`hud-mfd`、`strategic-map` 三个必需角色。作业现在发送 `logic` 与 `audio` 组，但图形步骤的结果只计入用量，P2-10/11 没有可验证、可缓存的驾驶舱组。
- **研究缺口：**
  - 地图边框在 DATA 下颜色不对，实际使用的调色板未知（[U-029](../../../original/unknowns.md#数据与格式)）；
  - HI 飞行实际载入 CCKD 10103 还是 10097，目前为高概率；
  - MFD 叠加图把颜色 0 当透明，未确认；
  - TABL 图像列表的容器结构没有记录，图标、仪表条与雷达点的用途只是高概率（[hud §2](../../../original/formats/hud.md#2-tabl-entries-in-srnob-contents-likely)）；
  - U-030 的 TABL 部分（10165 等）已交给本任务。

包身份与组装机制已由 [P2-09](../09/spec.md#包身份与转换器版本) 与 [P2-08](../08/spec.md#包身份) 落地，本任务复用，见[当前实现与依据](#当前实现与依据)。

本任务交付：

- **布局 payload 与合成：** `layout` 的 payload schema 1 与严格读取器；唯一的纯合成函数，按布局把图像展开、定位、叠放为 RGBA 画面，供 P2-11 查看器、P2-12 对照与后续 Renderer 复用；
- **容器来源：** CCKD 分组与元素、MFDD 列表记录、TABL 图像列表记录的子资源语法与解析；记录内的图像与嵌入调色板仍经 P2-05 的转换器转换；
- **布局转换：** 从 CCKD 分组转换布局，校验元素数、画幅范围，以及元素到图像 Asset 的对应；
- **定向研究：** 解决切片实际依赖的 U-029/030 部分；建立切片画面覆盖表，确定各候选图像族是否入选、各处文字使用的字库，以及所选任务的机型对应的地图图标；
- **生产内容与组：** 前视驾驶舱、地图边框及其调色板、飞船状态 MFD，以及切片使用的其余 HUD/地图图像族，加上 P2-05 的调色板与字库，组成 `cockpit-hud-map` 组；按 P2-09 的包身份规则装配，并在作业中发送。

完成后可观察的结果：

- 合成测试逐像素证明布局合成的位置、颜色、透明与层次，以及容器解析的正负路径；
- 真实 Chromium 模块 Worker 在合成光盘上发送 `cockpit-hud-map` 组，持有者重新验证为 `group-complete`；
- 本地基准镜像经生产路径得到该组，两次运行逐字节一致，`validateGroup` 为 `group-complete`；前视驾驶舱与地图边框的合成画面、各处文字的字形与本地截图的逐像素比较计数写入研究记录；
- 加固后的 nob-check 对三个 CCKD 的全部分组与元素、MFDD 列表与 TABL 图像列表通过结构校验。

本任务不做 WebGL 消费、查看器页面或缓存，也不实现 HUD 的动态内容。阶段范围依据[总计划 §12](../../master-plan.md#12-开发阶段与验收条件)中的“飞行中的驾驶舱、HUD 位图与字体，战略地图图形”；Classic 画面规则见[总计划 §7.1](../../master-plan.md#71-classic先保真)；任务导航见[阶段索引](../tasks.md#p2-07-驾驶舱hud-与战略地图资源)。

## 范围

### 包含

- **S-01 布局 payload：** `layout` 的 payload schema 1 由画幅（Classic HI 为 640×480）与有序元素组成：
  - 每个元素引用一个 image Asset，并给出图像左上角的整数像素坐标；
  - 数组顺序即绘制顺序，后者在上；
  - 元素的坐标落在画幅内，各元素引用的图像互不相同，引用的图像集合恰等于描述符依赖。

  在 `content/` 中提供编码与严格读取器，字段见[布局 payload](#布局-payload)。
- **S-02 布局合成：** 在 `content/` 中提供唯一的纯合成函数。输入布局 payload、它引用的图像 payload 与所需调色板，输出画幅大小的非预乘 RGBA：
  - 未被任何元素覆盖的像素为 (0, 0, 0, 0)；
  - 各元素经 P2-05 的展开函数取色，只有不透明像素覆盖下层。

  P2-11 的查看器、P2-12 的对照与后续 Renderer 都使用它或它的结果，不另写合成逻辑。
- **S-03 容器子资源：** 在 `original-data/` 中解析三类容器，语法见[容器子资源](#容器子资源)：
  - CCKD 的分组目录与 52 字节元素：`groups/<s>` 提供布局，`groups/<s>/elements/<i>` 提供元素图像，`groups/<s>/palette` 提供分组调色板（2026-10-05 执行期修订，见[审批](#审批)）；
  - MFDD 的两个记录列表：`lists/<l>/records/<i>`；
  - TABL 图像列表：`records/<i>`，只支持 R3 在 hud 中记录的结构；
  - 以上任一记录的嵌入调色板：`<记录路径>/palette`。

  记录内的图像与调色板经 P2-05 的转换器转换，校验、透明、限值与错误语义不变；P2-05 已有的整条目与 `fonts/<i>` 来源不变。
- **S-04 布局转换：** 布局声明给出画幅，以及按存储顺序排列的元素图像 Asset。转换核对：
  - 分组的实际元素数与声明一致；
  - 每个元素的矩形落在画幅内；
  - 元素的 +44、+48 字段只取观察到的 0 或 1（不进入 payload，见[技术决定](#技术决定) 1）；
  - 每个元素图像的映射恰为同一 CCKD 条目的 `groups/<s>/elements/<i>`，并在同一步骤、同一组中声明。
- **S-05 定向研究：** 只解决切片实际依赖的部分，结论按置信度写入 [cockpit](../../../original/formats/cockpit.md)、[hud](../../../original/formats/hud.md) 与 [unknowns](../../../original/unknowns.md)。证据要求与门槛见[研究与入选门槛](#研究与入选门槛)。
  - **R1：** HI 飞行使用的前视驾驶舱来源（CCKD 10103 或 10097 的 slot 0）；
  - **R2：** 地图边框的调色板（U-029）；
  - **R3：** TABL 图像列表的容器结构、切片画面覆盖表，以及各候选图像族是否入选；
  - **R4：** 玩家飞船状态 MFD 的来源（MFDD 10473 或 10475），以及两个列表的透明规则；
  - **R5：** 前视与地图布局中，元素的不透明像素是否重叠，重叠时的绘制顺序；
  - **R6：** TABL 10165 是否出现在切片画面中，只做有界检查（U-030 的 TABL 部分）；
  - **R7：** 参考画面中各处文字使用的生产字库，以及截图中的字形能否经生产字符映射得到（字体引用与字形核对）；
  - **R8：** 所选任务引用的各机型在放大窗口中对应的地图图标，以 M2ID 机型槽位为键，只写入文档。
- **S-06 生产内容：** 按[生产 Asset 与来源](#生产-asset-与来源)声明并映射本任务的 Asset，追加到 P2-05 的同一图形步骤中。
- **S-07 组装与发送：** 作业在全部转换完成后，把 `cockpit-hud-map` 分区装配为组结果，按 P2-09 的规则写入包身份；全部草稿校验通过后才发送。本任务在生产 `ConverterVersion` 中新增（P2-06 已先加入时递增）`graphics` 组件。`models` 组由 P2-06 装配与发送，本任务的组不含 `models` 分区。见[组结果与包身份](#组结果与包身份)。
- **S-08 限值与预算：** 批准本任务的结构限值与生产份额，见[限值与预算](#限值与预算)。
- **S-09 错误与诊断隐私：**
  - `source` 层沿用 P2-05 的转换错误码，只追加限值名；
  - `content` 层追加布局合成越界一项，布局读取复用 P2-05 的 code；
  - 本任务新增的诊断只含规范 Asset ID、结构字段路径与限值，不含原版字节、条目编号、偏移或宿主路径。
- **S-10 验证：** Node 合成测试、真实 Chromium Worker、本地基准与本地截图比较，并加固 `tools/nob-check.ts` 做全量结构校验。测试只用代码生成的数据，仓库不新增二进制样本。
- **S-11 文档：** 同步[源码结构](../../../engineering/source-structure.md)、[工程约定](../../../engineering/README.md)与[工具指南](../../../guides/tools.md)；原版事实只写入 `docs/original/`；`tasks.md` 只更新导航。

### 不包含

- **HUD 动态内容，归 P3：**
  - MFD、仪表条、雷达、目标提示与文字在飞行画面中的位置。它们可能由 CCKD 目录项 +0x18 指向的仪表记录给出（未确认，见 [cockpit](../../../original/formats/cockpit.md#group-directory-confirmed-structure-on-all-three-entries)），本任务不解析；
  - 按状态选择背景、叠加图、仪表帧与图标；
  - HUD 文字的布局、字距、颜色，以及字库单元外像素的绘制语义（U-030 字体部分）。P2-05 把它交给本任务；本任务的布局不放置文字，只由 R7 确定各处文字使用的字库并核对字形，绘制规则转交 P3；
  - 机型或阵营到地图图标、雷达点的规范对应表，以及目标连线、范围圆、战争迷雾与光标的绘制。R8 只把所选任务的机型与图标对应写入文档。

  研究中取得的位置或对应关系写入 `docs/original/`，但不编码进规范内容（技术决定 7）。
- **未入选的画面与资源：**
  - CCKD slot 1、3–7（后视、侧视与窄框）与 LO 组 10101；
  - LO 仪表条 10483、MFDD 10477、BITM 10471，以及只用于另一种玩家机型的 MFDD 10475、BITM 10469 与 TABL 10481；
  - HUD 组的 SNIP 10487 与 DIAG 10489、10491（不是图像记录列表，转交 P3）；
  - OPTIONS 菜单字体、通讯头像、TABL 10171 的整屏场景与其余 BITM（BITM 10467 除外）；
  - TABL 10399、11375；ANIM 与 EXPL 效果。R6 只做有界检查，不转换 10165。
- **宽屏与“原版像素”模式：** 驾驶舱是固定 4:3 画幅，缩放与宽屏规则见 [ADR-0009](../../../decisions/ADR-0009-window-scaling-widescreen.md)，归渲染与后续阶段。
- **其他组与下游：**
  - 模型、材质与 `models` 组归 P2-06；音效与 `audio` 组归 P2-08；任务与 `logic` 组归 P2-09；
  - WebGL 消费、查看器页面与导入 UI 归 P2-11；缓存归 P2-10/11；最终保真判定归 P2-12。
- **既有契约：** 不改 P2-01 的 kind、角色、基数、资源组与预算维度；不改 P2-05 三类 payload 的 schema 与已有错误码的含义；不改消息形状、阶段集合与顺序规则；不新增依赖。

### 涉及模块

| 模块 | 责任与影响 |
|---|---|
| `src/content/graphics/` 中计划新增的布局模块 | 布局 payload 的格式常量、编码、严格读取、与描述符依赖的一致性校验，以及纯合成函数。复用 [expand-image.ts](../../../../src/content/graphics/expand-image.ts) 与 [graphics-format.ts](../../../../src/content/graphics/graphics-format.ts)，不导入 `original-data` |
| [contract-validation.ts](../../../../src/content/contract-validation.ts) | 追加合成越界的 content 层 code |
| [src/original-data/conversion/](../../../../src/original-data/conversion/) | 容器解析扩展 [source-graphics.ts](../../../../src/original-data/conversion/source-graphics.ts)；布局声明扩展 [graphics-declarations.ts](../../../../src/original-data/conversion/graphics-declarations.ts)；布局转换扩展 [convert-graphics.ts](../../../../src/original-data/conversion/convert-graphics.ts)；容器来源扩展 [graphics-step.ts](../../../../src/original-data/conversion/graphics-step.ts)；生产声明、映射与份额扩展 [production-graphics.ts](../../../../src/original-data/conversion/production-graphics.ts) |
| 生产 `ConverterVersion` 与 `ManifestIdentity` | 复用已落地的 [converter-version.ts](../../../../src/original-data/conversion/converter-version.ts) 与 [manifest-identity.ts](../../../../src/content/manifest-identity.ts)，不另建机制；本任务在常量中加入或递增 `graphics` 组件 |
| [source-error.ts](../../../../src/original-data/source-error.ts) | 追加本任务的限值名；code 不变 |
| [import-job.ts](../../../../src/workers/import-job.ts) | 图形步骤的输入扩大；装配 `cockpit-hud-map` 组草稿，与其他组一起写入包身份、校验后发送 |
| [import-protocol.ts](../../../../src/workers/import-protocol.ts)、[import-host.ts](../../../../src/workers/import-host.ts)、[import-job-owner.ts](../../../../src/app/import/import-job-owner.ts) | 行为不变；相关测试按新的组与用量更新 |
| [nob-check.ts](../../../../tools/nob-check.ts) | 用同一套容器解析校验全部 CCKD 分组与元素、MFDD 列表与 TABL 图像列表，只输出计数与失败原因 |
| 相邻 `*.test.ts`、[synthetic.ts](../../../../src/original-data/synthetic.ts)、[synthetic-import.test-support.ts](../../../../src/workers/synthetic-import.test-support.ts)、[import-worker.spec.ts](../../../../e2e/import-worker.spec.ts) | 合成 CCKD、MFDD、TABL 与合成光盘，Node 与真实 Worker 用例 |
| `docs/original/`、`docs/engineering/`、`docs/guides/` | 研究事实与置信度；模块、payload 字节布局、限值、错误码与命令 |

## 当前实现与依据

- **内容契约（P2-01）：**
  - [asset-id.ts](../../../../src/content/asset-id.ts) 已有 `layout` 类别；[asset-units.ts](../../../../src/content/asset-units.ts) 把 layout 计为“消费者布局”，内部元素只有数值与短标签，图像与调色板是独立 Asset。
  - [slice-definition.ts](../../../../src/content/slice-definition.ts) 中 `cockpit-hud-map` 拥有 `image`、`palette`、`font`、`layout`。必需角色为 `front-cockpit`（恰 1 个 layout）、`hud-mfd`（至少 1 个 image 或 layout）、`font`（至少 1 个）与 `strategic-map`（至少 1 个 image 或 layout）。
  - [completeness.ts](../../../../src/content/completeness.ts) 的 `validateGroup` 要求组内依赖闭合，并在任一 Asset 的来源状态不是 `verified` 时报 `source-not-ready`。来源状态由 [source-mapping.ts](../../../../src/original-data/source-mapping.ts) 的 `assetSourceStates` 从置信度与解析状态推导，`unconfirmed` 映射永远不是 `verified`。
  - [budget.ts](../../../../src/content/budget.ts) 的 schema 1 有 12 个预算维度，没有布局元素维度；新增维度属于 schema 变化，本任务不做。
- **来源映射：** `SOURCE_ENTRY_TYPES` 允许 layout 来自 CCKD、TABL，image 与 palette 可来自 CCKD、MFDD、TABL 等；子资源是至多 8 段的受限 ASCII 路径。[source-catalog.ts](../../../../src/original-data/source/source-catalog.ts) 的生产覆盖文件为 `MAIN/` 下的 7 个 NOB 与 `SRANGERS.EXE`；来源定位只能指向 IMFAT 条目。
- **图形转换（P2-05）：**
  - [source-graphics.ts](../../../../src/original-data/conversion/source-graphics.ts) 的 `readImageRecordHeader`、`decodeImageRecord` 与 `readEmbeddedPalette` 已接受块内偏移；`readMfdRecordOffsets` 读出 MFDD 两个列表的记录偏移，计数以块内能容纳的记录数为界；`readCockpitFonts` 读取 CCKD 字体目录。
  - [graphics-declarations.ts](../../../../src/original-data/conversion/graphics-declarations.ts) 的声明只有 `palette`、`image`、`font` 三类。[graphics-step.ts](../../../../src/original-data/conversion/graphics-step.ts) 只接受 DATA 整条目、整条目 TEX/BITM 及其 `palette` 子资源，以及 CCKD 的 `fonts/<i>`；[step-entry-reader.ts](../../../../src/original-data/conversion/step-entry-reader.ts) 保证一个步骤内每个条目只读一次。
  - [production-graphics.ts](../../../../src/original-data/conversion/production-graphics.ts) 的 5 个生产 Asset 中，`palette/flight/cockpit-hud-map` 与三个 `font/hud/*` 属于 `cockpit-hud-map`，字库映射到 CCKD 10103。
  - 结构限值、份额与错误码见 P2-05 spec 的[限值与预算](../05/spec.md#限值与预算)与[错误码](../05/spec.md#错误码)。
- **导入作业（P2-04/05/08/09）：** [import-protocol.ts](../../../../src/workers/import-protocol.ts) 的协议版本为 4，阶段依次为 `identify-source`、`convert-graphics`、`convert-logic`、`convert-audio`。[import-job.ts](../../../../src/workers/import-job.ts) 的流程：
  - 图形与逻辑步骤共用读取限值加两者份额的限值，逻辑步骤在图形用量之上扣除；图形步骤的结果目前只保留用量，注释写明留待 P2-06/07 装配；
  - 全部转换完成后，对 `logic` 与 `audio` 的组草稿调用 [manifest-identity.ts](../../../../src/content/manifest-identity.ts) 的 `applyManifestIdentity` 写入同一包身份，身份基础来自 [converter-version.ts](../../../../src/original-data/conversion/converter-version.ts) 的 `productionIdentityBasis`；
  - `checkPackageTransfers` 与结束用量在发送第一个组之前校验，然后经 [import-host.ts](../../../../src/workers/import-host.ts) 的 `ImportReporter.group` 发送各组。

  持有者按 [P2-04 的验证顺序](../04/spec.md#组结果的验证顺序)用 `validateGroup` 重新验证，并一次性移交。
- **包身份与转换器版本（P2-08/09，已落地）：** [converter-version.ts](../../../../src/original-data/conversion/converter-version.ts) 中唯一的 `PRODUCTION_CONVERTER_VERSION` 为 `osr-import.logic-1.audio-1`：`osr-import.` 后接各被打包转换器的 `<转换器>-<n>` 组件，按阶段顺序排列，任一转换器输出变化都递增它自己的组件。规则见 [P2-09](../09/spec.md#包身份与转换器版本) 与 [P2-08](../08/spec.md#包身份)。
- **并行任务：** [P2-06](../06/spec.md) 已在 `main` 上实现（2026-10-06 前提更新）：它向同一图形步骤追加切片贴图（`models` 分区），新增 `convert-models` 阶段并递增协议版本，发送 `models` 组，并在 `ConverterVersion` 中加入 `graphics-1` 与 `models-1` 组件。
- **原版事实：**
  - CCKD 头部、32 字节分组目录、52 字节元素、HI 组各 slot 的角色，以及分组调色板（目录项 +0x04，P2-07/08 确认）与元素的绘制遍，见 [cockpit §1](../../../original/formats/cockpit.md#1-cckd-cockpit-layouts)。
  - MFDD 的结构与 10473、10475、10477 见 [cockpit §2](../../../original/formats/cockpit.md#2-mfdd-multi-function-display-images-confirmed-structure)：全部为 raw，DATA 下颜色正确；叠加图把颜色 0 当透明为未确认。
  - TABL 各条目的用途（高概率或未确认）见 [hud §2](../../../original/formats/hud.md#2-tabl-entries-in-srnob-contents-likely)；图像记录与各编码见 [textures §2](../../../original/formats/textures.md#2-image-record-36-bytes-confirmed)；字库与字符映射见 [hud §1](../../../original/formats/hud.md#1-bitmap-fonts-confirmed)。
  - 地图画面的布局、整屏 640×480 与装饰按钮见 [B-001](../../../original/behavior/B-001-strategic-map.md)；HI 画幅 640×480、4:3 方形像素已确认（[U-006](../../../original/unknowns.md#画面)）。
  - P2-01 的固定图形有界投影计入 slot 0、2 两个布局单位、8 个图像单位、3 个字库与 MFDD 10473 的 12 个图像单位，并明确它不完整，见 [cockpit](../../../original/formats/cockpit.md#bounded-canonical-graphics-projection)。
- **画面规则：**
  - [总计划 §2](../../master-plan.md#2-冻结的技术选型) 规定 Classic 飞行中的驾驶舱、HUD 与 MFD 不用 DOM 绘制；[§4.1](../../master-plan.md#41-目录与模块划分) 规定它们由 `render/` 在同一画面管线中绘制；
  - [§7.1](../../master-plan.md#71-classic先保真) 与 [ADR-0009](../../../decisions/ADR-0009-window-scaling-widescreen.md) 规定 Classic 以 HI 为基准、按 4:3 整体等比缩放，驾驶舱位图不随宽屏拉伸；
  - 现有 [viewport-layout.ts](../../../../src/render/viewport/viewport-layout.ts) 已实现 4:3 视口。

## 行为与边界

| 场景或状态转换 | 预期结果 | 拒绝或失败时的反馈 |
|---|---|---|
| CCKD `groups/<s>` 转换为布局 | 画幅为声明值；元素按存储顺序排列，坐标取自元素的 +36、+40；元素图像为声明的 Asset | slot 越界或为空：`subresource-not-found`；目录或元素数组越出块：`invalid-payload`；slot 数或元素数超限：`limit-exceeded` |
| 元素的 +44、+48 字段 | 只校验取值为 0 或 1，不进入 payload | 其他取值：`invalid-payload` |
| 声明的元素数与实际不符；元素坐标为负，或矩形越出画幅 | 拒绝 | `geometry-mismatch` |
| 布局声明的元素图像与图像映射不对应，或未在同一步骤、同一组中声明 | 拒绝 | `invalid-declaration` |
| 容器内记录的图像（CCKD 元素、MFDD、TABL） | 与把同一记录放在偏移 0 时 P2-05 的转换结果相同 | 序号越界：`subresource-not-found`；记录头部、编码、尺寸与调色板问题沿用 P2-05 的 code |
| 容器内记录的 `…/palette` | 嵌入调色板，BGR 读为 RGB | 记录没有嵌入调色板：`subresource-not-found` |
| CCKD 的 `groups/<s>/palette` | 目录项 +0x04 指向的 768 字节 6 位 VGA 调色板，与 DATA 同格式、同样展开 | slot 越界或 +0x04 为 0：`subresource-not-found`；指针越出块、+0x08 不为 768 或分量大于 63：`invalid-payload` |
| TABL 不符合 R3 记录的图像列表结构 | 拒绝 | `invalid-payload` |
| 地图边框图像 | 绑定 R2 以证据确定的调色板 | 没有声明绑定：`invalid-declaration`（P2-05 规则），不默认使用 DATA |
| 消费者读取布局 payload | 严格读取；引用的图像与描述符依赖一致 | 字节不合：`invalid-graphics-payload`；schema 不是 1：`unsupported-payload-schema`；引用不一致：`binding-mismatch` |
| 合成布局 | 画幅大小的 RGBA，按数组顺序叠放 | 元素按实际尺寸越出画幅：`layout-out-of-frame`；提供的图像与引用不符：`binding-mismatch`；调色板问题沿用 P2-05 的 code |
| 同一输入与声明再次转换或合成 | 逐字节相同，SHA-256 相同 | 不适用 |
| 图形步骤成功 | `cockpit-hud-map` 分区含 P2-05 与本任务的 Asset，映射都为 `verified` | 不适用 |
| 作业的全部转换成功 | 先校验全部组草稿、包身份、转移列表与结束用量，再发送 `cockpit-hud-map` 组，然后 `finished` | 不适用 |
| 发送第一个组之前的任一转换、读取或校验失败 | 作业以 `failed` 结束，不发送任何组，已转换的结果全部丢弃 | 转换错误为 `source` 层；读取错误保持 P2-02/03 的层、code 与位置 |
| 发送开始之后仍失败（例如组的转移失败） | 作业以 `failed` 结束；持有者丢弃已收到的全部组，`takeGroups()` 返回 null | 沿用 P2-04 |
| 图形阶段或发送组之前取消 | 持有者同步变为 `cancelled` 并终止 Worker，之后的消息不改变状态 | 不适用（沿用 P2-04） |
| 持有者重新验证组 | `group-complete`，没有外部要求 | 映射未就绪或角色不足：`incomplete`，带 P2-01 诊断 |
| 入选族的研究未达交付条件 | 生产声明不含猜测的绑定或替代资源，相应验收项保持 blocked，并记录恢复条件 | 不适用（研究门槛，见[风险与恢复](#风险与恢复)） |

## 数据模型与契约

### 布局 payload

布局 payload 的 schema 版本为 1，由 `content/graphics/` 中计划新增的模块定义。编码与 P2-05 一致：小端定长头部加数据，Asset ID 以 ASCII 存储，总长恰为两者之和。具体字节布局由实现确定，并写入[源码结构指南](../../../engineering/source-structure.md)；改变布局或解释属于不兼容变化，须递增 schema。

| 数据/字段 | 类型、单位与约束 | 权威所有者 | 输入/输出或序列化边界 |
|---|---|---|---|
| `frame` | `{ width: 1–640, height: 1–480 }`，单位为像素；生产布局为 640×480 | `content/` | 坐标系与合成结果的尺寸 |
| `elements` | 1–16 项，数组顺序为绘制顺序，后者在上。每项为 `{ image, x, y }`：`image` 为 image Asset ID；`x`、`y` 为整数像素，0 ≤ x < width、0 ≤ y < height，指图像左上角在画幅中的位置。各元素的图像互不相同 | `content/` | 读取器严格校验；引用的图像按升序恰等于描述符依赖，且全部为 `image` |
| 合成结果 | `{ width, height, rgba }`，尺寸等于画幅，`rgba` 为 width × height × 4 字节的非预乘 RGBA | `content/` 的纯函数 | 每次返回调用者独占的新缓冲；不进入 payload 或缓存 |

元素不含调色板、透明或缩放字段。调色板由每个图像 payload 自己的绑定表达，透明由图像的掩码表达。图像尺寸只在图像 payload 中，因此读取器只能检查坐标，矩形是否越界由转换与合成检查。

### 布局合成

- **输入：** 布局 payload；恰好覆盖其全部引用的图像 payload；按 P2-05 展开函数的要求提供调色板。
- **规则：** 输出先全部为 (0, 0, 0, 0)。按数组顺序处理每个元素：
  - 用 P2-05 的展开函数得到该图像的 RGBA；
  - 要求 x + 宽 ≤ 画幅宽、y + 高 ≤ 画幅高；
  - 把每个不透明像素（alpha 255）写到 (x + 列, y + 行)，透明像素不改变已有结果。
- **性质：** 纯函数，不读写 DOM 或 GPU；同一输入总是得到同样的字节。同一布局可以混用绑定不同调色板的图像，各自按绑定取色。
- **尺寸与缩放：** 结果是 HI 画幅中的原始像素。按窗口缩放与设备像素比属于渲染（[viewport-layout.ts](../../../../src/render/viewport/viewport-layout.ts) 与 ADR-0009），不在本函数中。

### 容器子资源

| 条目类型 | 子资源 | 提供 | 结构依据 |
|---|---|---|---|
| CCKD | `groups/<s>` | layout | 第 s 个 32 字节目录项的元素指针与数量（[cockpit §1](../../../original/formats/cockpit.md#group-directory-confirmed-structure-on-all-three-entries)，已确认） |
| CCKD | `groups/<s>/elements/<i>` | image | 该分组第 i 个 52 字节元素开头的图像记录 |
| CCKD | `groups/<s>/palette` | palette | 第 s 个目录项 +0x04 指向的 768 字节调色板，格式同 DATA 整条目（256 项 6 位 VGA RGB，[cockpit §1](../../../original/formats/cockpit.md#group-palette-and-drawing-confirmed)，已确认）。读取器另要求 +0x08 为 768：全部实例都满足这一观察到的不变量，含义为高概率的字节数；这是有界格式检查，不是已证实的原版行为。执行期修订加入 |
| CCKD | `fonts/<i>` | font | P2-05，不变 |
| MFDD | `lists/<l>/records/<i>` | image | l 为 0 或 1，列表 l 的第 i 个记录（[cockpit §2](../../../original/formats/cockpit.md#2-mfdd-multi-function-display-images-confirmed-structure)） |
| TABL | `records/<i>` | image | R3 在 hud 中记录的图像列表结构中的第 i 个记录 |
| 上述任一图像记录 | `<记录路径>/palette` | palette | 该记录的嵌入调色板（[textures §2](../../../original/formats/textures.md#2-image-record-36-bytes-confirmed)） |

- `<s>`、`<l>`、`<i>` 为不带前导零的十进制序号；序号越界或 slot 为空时报 `subresource-not-found`。
- 子资源只决定记录在条目块中的位置。图像解码、透明、行序、结构限值、调色板检查与错误语义都沿用 P2-05。
- 同一条目可以向多个 Asset 提供子资源，在一个步骤中只物理读取一次。

### 布局转换声明

布局声明加入 P2-05 的图形转换声明联合，与来源映射一一对应，不含定位。图像与调色板声明的字段不变，只是来源可以是容器内的记录。

| 字段 | 约束 | 说明 |
|---|---|---|
| `asset` | `{ id, kind: 'layout' }`，同一步骤内 ID 唯一 | 必须有映射，且映射为 CCKD 的 `groups/<s>` |
| `role`、`group` | P2-01 的角色 token 与资源组，该组拥有 `layout` | 用于生成描述符 |
| `frame` | `{ width, height }`，范围同 payload | 生产布局为 640×480 |
| `elements` | 1–16 个 image Asset ID，按存储顺序 | 第 i 项的映射必须是同一 CCKD 条目、同一 slot 的 `groups/<s>/elements/<i>`，并在同一步骤、同一组中声明 |

描述符依赖为元素图像，按 ID 升序。非默认的转换选择（例如 MFD 叠加图的颜色键、地图边框的调色板）仍按 P2-05 的规则，由映射的 `evidence` 链接到 `docs/original/`。

### 研究与入选门槛

**参考画面与证据来源：**

- 参考画面指切片选定任务（P2-01 的 SCCT group 0 / slot 1）在 HI 模式下的前视飞行画面与战略地图画面。
- 证据来自 `local/StarRang/captures/` 中开发者本地的截图（包括 B-001 列出的地图截图）与只读的 EXE 研究。
- 截图、研究脚本与输出只留在被忽略的 `local/research/p2-07/`；文档只记录截图文件名、计数与判定。

**像素比较：**

- 研究脚本经生产路径（P2-05 的展开函数与本任务的合成函数）得到候选图像或合成画面，与 640×480 截图逐像素比较，不缩放，没有容差。
- 记录写明截图、位置、比较的像素数、一致数，以及不一致像素的来源分类，例如运行时叠画的文字、仪表或高亮按钮；没有分类的不一致不得忽略。
- 只凭外观相似最多为未确认。

**置信度：**

- **已确认：** EXE 中的使用路径；或在至少一张截图中，图像（或合成画面）的全部不透明像素与截图一致。
- **高概率：** 至少一张截图中有唯一定位，不一致像素全部落在研究记录列出的运行时叠画区域内，每个区域都写明依据。
- **未确认：** 其余情况。

**透明规则单独取证：** 只比较不透明像素证明不了透明规则：错误的颜色键会把不一致的像素排除在比较之外，而在黑色背景上，不透明的黑色与透明也无法区分。因此：

- RLE 的透明来自编码（已确认，[textures §2](../../../original/formats/textures.md#2-image-record-36-bytes-confirmed)），不需要另外取证；
- raw 图像“不透明”与“颜色键 k”的区别只涉及索引为 k 的像素。图像中没有该索引的像素时，记录二者等价；
- 其余情况须有以下证据之一：
  - EXE 中的绘制规则；
  - 截图中该图像索引为 k 的像素位于与调色板第 k 色不同的已知背景之上，并同时比较假定为不透明与假定为透明的位置。
- 两种解释在全部证据中都无法区分时，透明规则为未确认，不能凭不透明像素一致提升置信度。

**切片画面覆盖表：**

- R3 在 hud 或 cockpit 中为参考画面建立覆盖表。行包括 [B-001](../../../original/behavior/B-001-strategic-map.md) 与 cockpit 记录的可见元素：驾驶舱面板、状态 MFD、仪表、雷达与目标提示、Warp 指示灯、各处文字、地图边框、地图单位标记、放大窗口图标、选取框与光标、网格、迷雾、范围圆与目标连线。
- 每行按证据归入一类：
  - **封包位图：** 写明图像族；
  - **字库文字：** 写明字库，见 R7；
  - **代码绘制：** 没有位图来源，例如线、填充与迷雾；
  - **未识别。**
- 归类为封包位图之前，先在 `SR.NOB` 全部可解码的图像记录中检索：TEX、BITM、MFDD、CCKD 元素，以及 R3 记录为图像列表的 TABL；ANIM 的编码 1 不可解码。检索不到的元素记为代码绘制（须有 EXE 或形状证据）或未识别，作为交给 P3 的记录，由 P2-12、P2-13 判定影响。
- 归类到候选族之外的封包位图族时，须先修订本 spec 的范围与预算，再转换。

**图像族与入选规则：**

- **图像族：** 来自同一来源列表的一组记录：一个 CCKD 分组的全部元素、一个 MFDD 列表、一个 TABL 列表，或 R3 在 hud 中记录的 TABL 列表内的连续区间；整条目的 BITM 图像自成一族（执行期修订，P2-07/09）。入选按族判定。
- **候选族：**
  - 前视驾驶舱分组（R1 选定的 slot 0）与地图边框分组（CCKD 10103 的 slot 2）；
  - 状态 MFD 的背景与叠加图两个列表（R4 选定的 MFDD）；
  - HI 仪表条 10479 与 10481；雷达点 10461（P2-07/09 确认为战略地图的单位标记）；
  - 左显示屏页面背景 BITM 10467（执行期修订，P2-07/09）；
  - 11401 中 R3 记录的各区间（机型图标、地图点与其他符号）。
- **默认入选：** 每个候选族都视为切片使用并须交付。只有取得不低于高概率的“切片不使用”证据时才不入选，并在 hud 或 cockpit 中记录候选、证据与原因。这类证据包括：只属于 LO 模式或未选视角；参考画面中的同一元素已由另一族提供；EXE 显示切片的绘制路径不使用它。截图中暂未出现不算不使用证据，例如未截到受损状态时的叠加图。
- **交付条件：** 入选族的每项转换选择（调色板绑定、透明规则、行序）都不低于高概率，并由映射的 `evidence` 链接到 `docs/original/`；容器结构为已确认，并通过 AC-14 的全量结构校验。
- **未达条件：** 入选族不满足交付条件时，相应验收项保持 blocked，并记录恢复条件，例如需要哪种状态的截图或哪段 EXE 证据。生产声明不放入猜测的绑定（例如给地图边框套用 DATA），也不用其他资源替代。

**各项研究的结论要求：**

| 研究 | 要回答的问题 | 结论与后果 |
|---|---|---|
| R1 | 10097 与 10103 的 slot 0 元素（坐标与解码后的图像）是否相同；不同时哪一个与飞行截图一致 | 相同时选 10103，与字库、地图边框共用一次条目读取。不同时按截图比较选择；无法区分时 AC-10 blocked。改选只修改映射，Asset ID 不变 |
| R2 | 地图边框使用的调色板存放在哪个条目、什么格式；+44 是否表示切换调色板 | 调色板必须存放在生产覆盖文件的某个 IMFAT 条目中，条目类型是 `palette` 允许的类型。格式须为以下之一：P2-05 的两种（DATA 的 6 位 VGA 整条目，或图像记录的嵌入 BGR）；或 CCKD 分组目录项 +0x04 指向的同格式 6 位 VGA 调色板（`groups/<s>/palette`，执行期修订）。否则 AC-10 blocked，见[风险与恢复](#风险与恢复)。**结论（P2-07/08）：** 地图调色板为 CCKD 10103 的 `groups/2/palette`，已确认；+44 是绘制遍，不切换调色板 |
| R3 | 候选 TABL 的图像列表结构与区间划分；切片画面覆盖表；各候选族的用途、调色板与透明 | 结构写入 hud，置信度为已确认才可转换；各族按入选规则判定。**结论（P2-07/09）：** EXE 绘制路径确认各族的用途、调色板、透明与行序：10461 是地图单位标记，11401 的记录由放大窗口按单位字段选取绘制，二者用地图调色板与颜色键 0；10479 在左显示屏的一个页面上以颜色键 0 绘制；左显示屏的页面背景 BITM 10467 不透明。10481 与 BITM 10469 只用于另一种玩家机型，排除（高概率） |
| R4 | 玩家飞船的状态 MFD 是 10473 还是 10475；叠加图的透明规则 | 两个列表都是候选族；透明规则按上文单独取证，未达高概率时 AC-11 blocked。**结论（P2-07/09）：** 10473（EXE 按玩家机型选择，参考画面显示 10473）；背景不透明，叠加图颜色键 0，均为已确认 |
| R5 | 两个布局中，元素之间是否有重叠的不透明像素 | 没有重叠时记录绘制顺序不影响结果。有重叠时，截图在重叠像素上须与存储顺序一致，否则 AC-12 blocked |
| R6 | TABL 10165 的图像是否出现在参考画面中（按 1 倍与 2 倍检索） | 未出现时记录有界检查的结果，U-030 的 TABL 剩余部分转交 P4。出现时修订本 spec（范围与预算），再转换。**结论（P2-07/09）：** 未出现，转交 P4 |
| R7 | 参考画面中各处文字使用哪个生产字库；截图中出现的字形能否经生产字符映射得到 | 按字形逐像素匹配（只比较像素是否置位，颜色取自截图，不作断言），记录每处文字的字库、字距与置信度，不记录文字内容。需要未映射的码位且有证据时，按证据扩展 P2-05 的字符映射；单元外像素的绘制语义有证据时记入 U-030，否则仍归 P3 |
| R8 | 所选任务引用的各机型在放大窗口中显示哪个机型图标 | 以 M2ID 机型槽位为键，在 hud 中逐个记录对应的图标序号与置信度；未取得的记为未确认并写明方法。只写入文档，不编码进规范内容（技术决定 7） |

### 生产 Asset 与来源

全部来自 `MAIN/SR.NOB`。表中的置信度是本 spec 编写时的状态，执行时按研究结论更新，生产映射只能为 `confirmed` 或 `likely`。

**已知使用的 Asset：**

| Asset ID | kind / role | 来源 | 转换选择 | 置信度与 U 项 |
|---|---|---|---|---|
| `layout/cockpit/front` | `layout` / `front-cockpit` | CCKD 10103 的 `groups/0`（R1 结论） | 画幅 640×480；元素为下一行的图像，按存储顺序 | 高概率（合成与 F1 截图一致，不一致像素都在运行时叠画的仪表区域内，P2-07/08），U-029 |
| `image/cockpit/front/element-<i>` | `image` / `cockpit-element` | 同一 CCKD 的 `groups/0/elements/<i>` | `palette/flight/cockpit-hud-map`、`direct`、按存储行序；透明：RLE 按编码，raw 元素不透明（EXE 已确认） | 同上 |
| `layout/map/frame` | `layout` / `strategic-map` | CCKD 10103 的 `groups/2` | 画幅 640×480；元素为下一行的图像 | 已确认（全部不透明像素与 4 张地图截图一致，P2-07/08），U-029 |
| `image/map/frame/element-<i>` | `image` / `map-frame-element` | CCKD 10103 的 `groups/2/elements/<i>` | 调色板为 `palette/map/screen`；其余同前视（raw 元素不透明） | 已确认，U-029 |
| `palette/map/screen` | `palette` / `map-palette` | CCKD 10103 的 `groups/2/palette` | 6 位 VGA，与 DATA 同格式 | 已确认（EXE 使用路径与截图），U-029 |
| `image/hud/status-display/background-<i>` | `image` / `hud-mfd` | MFDD 10473 的 `lists/0/records/<i>`（R4 结论） | 飞行调色板、`direct`、按存储行序；不透明（raw 按编码） | 已确认（EXE 绘制路径，P2-07/09），U-030 |
| `image/hud/status-display/overlay-<i>` | `image` / `hud-mfd` | MFDD 10473 的 `lists/1/records/<i>` | 飞行调色板、`direct`、按存储行序；颜色键 0 | 已确认（同上），U-030 |
| `image/hud/display-page/background` | `image` / `hud-mfd` | BITM 10467 整条目（偏移 0 的图像记录） | 飞行调色板、`direct`、按存储行序；不透明（没有索引 0 像素） | 已确认（同上；执行期修订加入），U-030 |
| `image/hud/gauge-bar-1/<i>` | `image` / `hud-mfd` | TABL 10479 的 `records/<i>` | 飞行调色板、`direct`、按存储行序；颜色键 0 | 已确认（同上），U-030 |
| `image/map/unit-marker/<i>` | `image` / `strategic-map` | TABL 10461 的 `records/<i>` | `palette/map/screen`、`direct`、按存储行序；颜色键 0 | 已确认（同上；执行期修订，原为雷达点），U-030 |
| `image/map/zoom-icon/<i>` | `image` / `strategic-map` | TABL 11401 的 `records/<i>`（全部 29 个记录） | `palette/map/screen`、`direct`、按存储行序；颜色键 0 | 已确认（同上；执行期修订，原按区间分三个前缀），U-030 |

**排除与转交（P2-07/09）：**

- **排除（高概率）：** MFDD 10475、BITM 10469 与 TABL 10481 只在玩家机型的类型字节为 6 时代替 10473、10467 与 10479（EXE），参考画面显示 10473。因此不产生 `image/hud/gauge-bar-2/<i>`。
- **转交 P3（U-030）：** HUD 组同时载入 SNIP 10487（按时间取帧绘入显示屏的动画，格式未记录）与 DIAG 10489（状态显示屏的消息字符串），二者都不是图像记录列表，本任务不转换。雷达接触点与状态显示屏中两处标记的来源未识别。
- **用量：** 入选族在本地基准上共 86 个 Asset（2 个布局、83 个图像、1 个调色板），约 44.2 万像素，在[份额](#限值与预算)之内。

**命名与映射规则：**

- `<i>` 是记录在完整来源列表中的序号（从 0 开始）：CCKD 分组内的元素序号、MFDD 列表内的记录序号，或 TABL 整个列表内的记录序号，与 R3 划分的区间无关。区间边界改变时，已有记录的 ID 不变，也不会把已有 ID 改绑到另一个记录。ID 中不含条目编号。
- 地图调色板为单一调色板时，ID 为 `palette/map/screen`；为逐记录嵌入的调色板时，ID 由所属图像 ID 把首段 `image` 换成 `palette` 得到，例如 `palette/map/frame/element-0`。其余族的调色板绑定按 R2、R3 的证据，为飞行调色板或地图调色板。
- 声明与映射一一对应；多个 Asset 可以共用一个定位，与 P2-05 相同。
- 各布局的元素数由本地结构核对确定，并由声明断言，不符时报 `geometry-mismatch`。
- R1 若改选 10097，只修改前视布局与其元素的映射。P2-05 的字库映射不变：三个字库在三个 CCKD 中逐字节相同（[hud §1.1](../../../original/formats/hud.md#11-glyph-layout-and-character-maps-likely)）。

### 组结果与包身份

- **装配：** 作业在全部转换步骤成功后，把图形步骤的 `cockpit-hud-map` 分区装配为一个组草稿（`GroupDraft`），与 `logic`、`audio` 等其他组的草稿一起写入包身份：
  - 清单：包身份与按 ID 升序的描述符；
  - payload：每个独占整个缓冲；
  - 来源状态集：已识别的来源指纹与各 Asset 的状态。
- **身份：** 用已落地的 `applyManifestIdentity` 与 `productionIdentityBasis`，不另建机制：
  - `schemaVersion`、`sliceId`、`sliceDefinitionVersion`、`converterVersion` 与 `origin` 来自 `productionIdentityBasis`，`origin` 为带已识别指纹的 `original-import`；
  - `manifestIdentity` 按 [P2-09](../09/spec.md#包身份与转换器版本) 的定义推导：对确定性的 ASCII 编码（schema、切片 ID、切片定义版本、`ConverterVersion`、来源，以及作业发送的各组的描述符与来源状态）计算 SHA-256，形如 `manifest:sha256:<64 位小写十六进制>`；
  - 同一作业发送的各组共用一个身份，因此加入 `cockpit-hud-map` 后，`logic` 与 `audio` 组的身份也随之改变。
- **`ConverterVersion`：** 沿用已落地的表示：`osr-import.` 后接各被打包转换器的 `<转换器>-<正整数>` 组件，按阶段顺序排列。编写本 spec 时为 `osr-import.logic-1.audio-1`；P2-06 首次打包图形输出（`models` 分区）后为 `osr-import.graphics-1.logic-1.audio-1.models-1`（2026-10-06 前提更新）。
  - `graphics` 组件覆盖图形步骤的全部生产输出：P2-05、P2-06 与本任务的转换规则、payload schema、生产声明、映射与置信度，以及图形份额。其中任一变化都递增该组件。
  - `graphics` 来自 `convert-graphics`，排在 `logic` 之前。本任务加入 `cockpit-hud-map` 组并改变图形输出，因此把它递增为 `graphics-2`，即 `osr-import.graphics-2.logic-1.audio-1.models-1`。
  - 其他组件保持不变；新的常量值记录在源码结构指南。
- **发送前校验：** 沿用已落地的流程：作业先完成全部组草稿、包身份、转移列表（`checkPackageTransfers`）与结束用量的校验，再发送第一个组。因此转换、预算、身份与草稿校验的失败都发生在发送之前，不会发出任何组。
- **发送：** 校验通过后，作业经 `ImportReporter.group` 依次发送各组，然后发送 `finished`，其 `groups` 含 `cockpit-hud-map`。
  - 消息发送本身不是原子的。发送开始后若仍失败（例如某个组的转移失败），作业以 `failed` 结束；持有者按 P2-04 丢弃已收到的全部组，`takeGroups()` 返回 null。
  - 第一个 `group` 之后作业不再发送进度消息。本任务不改变协议。
  - `models` 组由 P2-06 的规则装配（图形步骤的 `models` 分区与模型步骤的结果），不由本任务改变；`cockpit-hud-map` 组不含 `models` 分区的 Asset。
  - 各组的发送顺序按 `main` 上当时的规则。
- **持有者：** 按 P2-04 的顺序重新验证，期望 `group-complete`，外部要求为空。

### 限值与预算

**结构限值**对每次转换与每次读取都生效。格式规则已确认；安全上限以基准观察值为依据，由 AC-14 在全部基准实例上核对：

| 限值名 | 范围 | 类别与依据 |
|---|---|---|
| `cockpitSlots` | 每个 CCKD 1–8 个目录项 | 安全上限；已观察 1 与 8（cockpit §1） |
| `cockpitElements` | 每个 slot 0–16 个元素 | 安全上限；已观察最多 4 |
| `mfdRecords` | 每个 MFDD 列表 0–16 个记录 | 安全上限；已观察 3 与 9（cockpit §2） |
| `tableRecords` | 每个图像列表 TABL 1–64 个记录 | 安全上限；hud §2 记录的最多为 33 |
| 目录项、元素与 MFDD 头部 | 目录项 32 字节，元素 52 字节，MFDD 头部为两个 {指针, 数量} | 格式规则，cockpit §1–2，已确认 |
| 元素 +44、+48 | 0 或 1 | 已观察的取值；含义已由 P2-07/08 确认（绘制遍与逐帧重绘），不进入 payload；越出即 `invalid-payload` |
| 布局画幅 | 宽 1–640，高 1–480 | 安全上限，同 P2-05 的图像上限（HI 画幅，U-006） |
| 布局元素数 | 1–16 | 等于 `cockpitElements` 的上限；空 slot 不构成布局 |

图像的宽高、调色板条目数与 RLE 等限值沿用 P2-05。

**生产份额**是本任务全部候选 Asset 的上界，以常量导出。入选族由研究决定，所以份额不是精确用量；本地基准的实际用量记录在 AC-13 的证据中。实际用量超出份额时修订本 spec，不放宽检查。

| 维度 | 份额 | 依据 |
|---|---|---|
| `assets` | 96 | 候选最多 92 个：2 个布局、86 个图像、至多 4 个地图调色板；执行期修订加入 BITM 10467 后为 93 个 |
| `dependencyEdges` | 192 | 布局 8 条；每个图像至多 2 条调色板依赖 |
| `imagePixels` | 524,288 | 按 cockpit 与 hud 记录的尺寸和本地结构计数，候选约 44 万像素，取 2^19 留余量 |
| `paletteEntries` | 1,024 | 至多 4 个 256 色地图调色板 |
| `glyphs` | 0 | 字库由 P2-05 计入 |
| `payloadBytes` | 786,432 | 按像素上界、掩码与 payload 头部估算约 63 万字节，留余量 |
| `sourceReadBytes` | 不另设 | 沿用 P2-02 的默认值（输入总字节） |
| 其余维度 | 0 | |

- 本任务的份额并入图形步骤的份额。图形、逻辑与模型步骤共用的限值随之变为：读取限值加图形份额（P2-05、P2-06 切片贴图与本任务），再加逻辑与模型份额（已落地的组合方式，见[当前实现与依据](#当前实现与依据)）；其他阶段的限值不变。
- 扣除发生在读取或分配声明的规模之前；总量恰等于限值时通过。被拒绝的扣除不改变转换用量，已发出的读取仍计入 `sourceReadBytes`。
- 每个 Asset 只在产生它的步骤中扣除一次，装配组结果时不重复扣除。

### 错误码

**`source` 层（转换）：** 不新增 code，只向 `SourceError` 的限值名联合追加 `cockpitSlots`、`cockpitElements`、`mfdRecords`、`tableRecords`。本任务新增的失败条件对应如下：

| code | 新增条件 | `limit` |
|---|---|---|
| `invalid-payload` | CCKD 目录或元素数组越出块；元素 +44 或 +48 不为 0 或 1；分组调色板指针越出块、+0x08 不为 768 或分量大于 63；MFDD 头部或记录指针越出块；TABL 不符合 R3 记录的图像列表结构，或记录指针越出块 | null |
| `limit-exceeded` | 超出上表的容器结构限值 | `{ name, limit, observed }` |
| `subresource-not-found` | slot、元素、列表或记录的序号越界；slot 为空；记录没有嵌入调色板；分组没有调色板（+0x04 为 0） | null |
| `invalid-declaration` | 布局映射不是 CCKD 的 `groups/<s>`；元素图像的映射与布局不对应；元素图像未在同一步骤、同一组中声明；子资源与 kind 或条目类型不匹配 | null |
| `geometry-mismatch` | 分组的实际元素数与声明不符；元素坐标为负，或矩形越出声明的画幅 | null |
| `budget-exceeded` | 扣除本任务的份额后超出作业预算 | `{ name, limit, observed }`，`name` 为 P2-01 的预算维度 |

位置沿用 P2-05 的 `graphics[<Asset ID>]…` 与 `graphics.declarations[<i>]…`，后接结构字段路径，例如 `graphics[layout/cockpit/front].elements[2].x`。图形阶段中的读取失败保持 P2-02/03 的层、code 与位置。

**`content` 层（读取与合成）：** 布局 payload 的读取复用 P2-05 的 `invalid-graphics-payload`、`unsupported-payload-schema` 与 `binding-mismatch`。只追加一个 code：

| code | 条件 |
|---|---|
| `layout-out-of-frame` | 合成时，元素按实际图像尺寸越出画幅 |

### 持久化与兼容

- 本任务不读写 IndexedDB 或 localStorage。
- 布局 payload 的 schema 为 1；读取器拒绝未知 schema，不兼容的旧 payload 会在消费时被拒绝。P2-10 只核对身份与哈希，不解读 payload。
- `ConverterVersion` 递增后缓存键随之变化。P2-11 接线之前，生产内容还没有进入缓存，所以不需要迁移；旧键下的数据不由本任务清理。
- 合成得到的 RGBA 与 GPU 对象都不缓存。

## 技术决定

用户在请求本 spec 时说明，需要回答的问题直接采用最推荐的答案。以下决定按此记录；整个契约仍须用户明确批准（见[审批](#审批)）。

1. **布局只表达有数据依据的静态定位：** CCKD 元素的坐标与顺序来自数据。按 P2-01 的单位规则，布局是消费者布局，图像与调色板是独立 Asset；分组调色板由图像的调色板绑定表达。P2-07/08 确认 +44 是绘制遍（在仪表之前或之后绘制）、+48 是逐帧重绘，二者描述运行时的绘制时机；本任务仍只做取值校验，不进入 payload。每个已知分组内 +44 的取值都相同，所以存储顺序就是绘制顺序。后续需要它们时，递增布局 schema 与 `graphics` 版本组件。HUD 动态元素的位置可能在目录 +0x18 的仪表记录中（未确认），本任务不解析，也不凭截图测量后写进生产代码。
2. **合成在 `content/` 中只实现一次：** 复用 P2-05 的展开函数，按元素各自的绑定取色。背景透明，使驾驶舱窗口外能露出 3D 场景。它是纯函数，可以在 Node 中逐像素验证；P2-11 把结果或各图像交给 `render/` 显示，React 不绘制飞行 HUD（总计划 §2）。
3. **容器沿用 P2-05 的记录转换：** 子资源只决定记录在块内的位置，项目中仍只有一套图像记录转换。TABL 是通用容器，只支持 R3 记录的图像列表结构，不按“看起来像图像”的数据推断结构。
4. **扩展现有图形步骤，不新增阶段：** 字库、前视驾驶舱与地图边框位于同一 CCKD 条目，同一步骤内只读一次。阶段集合与消息形状不变，因此协议版本不变，也不与 P2-06 新增的 `convert-models` 阶段冲突。图形阶段的进度、取消与失败分类沿用 P2-05。
5. **候选族默认入选，排除须有“不使用”的证据：** 阶段索引把切片使用的仪表、雷达与目标提示、地图与放大窗口图标都交给本任务，地图边框调色板不正确也明确是必需缺口。因此研究未定论时阻塞并记录恢复条件，不把缺口自动转给 P3，也不以 DATA 或其他资源代替。截图中暂未出现不等于不使用。任何未确认的映射都会让整组 `source-not-ready`，所以生产声明也不放入未确认的绑定。透明规则单独取证，避免不透明像素一致掩盖错误的颜色键。
6. **Asset ID 与角色：**
   - ID 按语义路径与来源列表内的序号命名，不含条目编号；
   - 布局元素图像使用切片定义之外的角色 `cockpit-element` 与 `map-frame-element`，使 `front-cockpit` 恰为 1 个布局；
   - 地图边框布局、地图单位标记与放大窗口图标计入 `strategic-map`；状态 MFD、左显示屏页面背景与仪表条计入 `hud-mfd`（P2-07/09 更正：10461 是地图单位标记，不是雷达点）；
   - R1 若改选 10097，只修改映射。
7. **对应关系只做研究，不编码进规范内容：** 规范的机型到图标查找表需要 `logic` 组的机型表跨组引用 `cockpit-hud-map` 的图像，或新增一种查找表形式，P2-01 与 P2-09 都没有定义。它与阵营颜色、迷雾可见性（U-025）等选择规则一起，由 P3 的地图绘制契约定义。本任务的 R8 以 M2ID 机型槽位为键，把所选任务各机型对应的图标写入 hud；该键与 P2-09 的 `craftType` 相同，不另建机型身份。R7 的字体引用同样只写入文档。
8. **组装复用已落地的包身份与版本表示：** P2-09 的身份推导与 P2-08 的版本表示已在 `main` 上实现，本任务不另定义推导规则或版本格式。`graphics` 组件使图形输出的变化单独体现在缓存键中；P2-06 已先加入它（`graphics-1`），本任务递增为 `graphics-2`。发送前完成全部校验，发送后的失败由持有者丢弃已收的组，与 P2-08 相同。本任务只增加 `cockpit-hud-map` 组；`models` 组归 P2-06（已落地）。
9. **限值与份额：** 容器计数是安全上限，以基准观察值为依据，由 AC-14 核对；目录项 32 字节、元素 52 字节与 MFDD 头部是已确认的格式规则。份额覆盖全部候选，是上界而不是精确用量，因为入选族在研究后才确定；读取不可信输入之前，上界已经批准。
10. **错误：** 容器与布局的转换失败都能用 P2-05 的 code 表达，只追加限值名。content 层只新增合成越界一项，布局读取复用 `invalid-graphics-payload`。
11. **本地校验与研究分开：** 全量结构校验加固仓库中已有的 nob-check，只输出计数；截图比较与一次性研究脚本放在被忽略的 `local/research/p2-07/`。
12. **不需要 ADR：** 以上决定细化总计划 §2、§4.1、§7.1、§12 与 [ADR-0009](../../../decisions/ADR-0009-window-scaling-widescreen.md)、[ADR-0015](../../../decisions/ADR-0015-source-module-structure.md)，不改变冻结决定，也不引入依赖（[ADR-0008](../../../decisions/ADR-0008-mit-and-dependency-licenses.md)）。P3 可以先用明确标记的临时资源开工（[ADR-0007](../../../decisions/ADR-0007-narrow-p2-overlap-p3.md)），本任务的缺口不改变这一点。

## 验收标准

| ID | 可观察的通过条件 | 验证方法与所需证据 |
|---|---|---|
| AC-01 | **布局 payload：** 合成布局编码后读取往返相等；同一输入逐字节相同。读取器拒绝以下输入：<br>- 截断与尾随字节；<br>- 画幅宽 0 或 641、高 0 或 481；<br>- 元素数 0 或 17；<br>- 坐标越出画幅；<br>- 两个元素引用同一图像。<br>以上都报 `invalid-graphics-payload`；未知 schema 报 `unsupported-payload-schema`；引用的图像与描述符依赖不一致报 `binding-mismatch`。描述符的 `payloadIdentity` 与实际字节一致，交给 `validateGroup` 时没有 `payload-mismatch` | Node |
| AC-02 | **布局合成：** 使用非对称合成图像：一张 raw，一张含透明段的 RLE，一张绑定第二个调色板的 raw。它们放在不同位置，包括贴住画幅右下边缘（x + 宽 = 画幅宽）与互相重叠。<br>- 输出尺寸等于画幅；<br>- 每个像素都等于“按数组顺序叠放，后者的不透明像素覆盖前者，透明像素不改变下层，未覆盖处为 (0, 0, 0, 0)”的期望；<br>- 颜色等于各图像按其绑定经 P2-05 展开的结果；<br>- 重复调用逐字节相同，每次返回新缓冲，不修改输入。<br>元素按实际尺寸越出画幅报 `layout-out-of-frame`；缺少、多出或与引用不符的图像报 `binding-mismatch`；调色板问题沿用 P2-05 的 code | Node |
| AC-03 | **CCKD 容器：** 合成 CCKD 含 1 个与 8 个目录项、空 slot，以及编码 0 与 2 的元素。<br>- `groups/<s>` 得到按存储顺序的元素坐标；<br>- `groups/<s>/elements/<i>` 的图像与把同一记录放在偏移 0 时 P2-05 的转换结果逐字节相同；<br>- `…/palette` 得到嵌入调色板。<br>拒绝：slot 或元素序号越界、空 slot → `subresource-not-found`；目录或元素数组越出块、元素 +44 或 +48 为 2 → `invalid-payload`；9 个目录项 → `limit-exceeded`（`cockpitSlots`）；17 个元素 → `limit-exceeded`（`cockpitElements`）。元素记录声明 65535×65535 时只读头部即被拒绝，不出现宿主 `RangeError`。P2-05 的 `fonts/<i>` 测试照常通过。<br>`groups/<s>/palette`（执行期修订）：结果与把同样 768 字节作为 DATA 整条目转换的结果相同；+0x04 为 0 → `subresource-not-found`；指针越出块、+0x08 不为 768 或分量为 64 → `invalid-payload` | Node |
| AC-04 | **MFDD 与 TABL：** `lists/<l>/records/<i>` 与 `records/<i>` 得到正确的图像。<br>- `l` 为 2 或 `i` 越界 → `subresource-not-found`；<br>- 列表有 17 个记录 → `limit-exceeded`（`mfdRecords`）；<br>- 记录指针越出块 → `invalid-payload`。<br>TABL 用例按 R3 记录的结构生成：结构不符 → `invalid-payload`；65 个记录 → `limit-exceeded`（`tableRecords`）；对没有嵌入调色板的记录取 `…/palette` → `subresource-not-found` | Node |
| AC-05 | **布局转换与声明：** 从合成 CCKD 转换得到的布局，画幅、元素顺序、坐标与图像引用逐项符合期望，描述符依赖恰为元素图像。<br>拒绝：<br>- 声明的元素数与实际不符、元素坐标为负、元素右边或下边越出画幅 → `geometry-mismatch`；<br>- 某个元素图像的映射不是同一 CCKD 条目的 `groups/<s>/elements/<i>`、在别组或未声明，或布局映射不是 CCKD 的 `groups/<s>` → `invalid-declaration`。<br>布局映射只在转换成功后为 `verified`；任一失败使整个步骤失败，不输出结果 | Node |
| AC-06 | **组装与包身份：** 在合成映射与声明上运行作业（注入合成识别）：<br>- 发送的 `cockpit-hud-map` 组含 P2-05 的飞行调色板与字库以及本任务的 Asset；描述符、payload 与来源状态按 ID 升序一一对应，每个 payload 独占缓冲；<br>- 持有者重新验证为 `group-complete`，外部要求为空；`takeGroups()` 在 `finished` 之后返回该组；<br>- 删去前视布局，或删去全部 `strategic-map` Asset，或删去全部 `hud-mfd` Asset → `role-cardinality`；把一个映射改为 `unconfirmed` → `source-not-ready`；<br>- 生产声明含已知使用的各族：前视布局与元素、地图边框布局与元素、地图调色板、状态 MFD 背景，由针对生产常量的测试断言；<br>- `converterVersion` 是生产常量，含 `graphics` 组件且已有组件不变，能被 P2-01 的读取器读取；`manifestIdentity` 按 P2-09 的定义推导，同一作业发送的各组相同；改变任一描述符、payload 身份或来源状态，身份随之改变；<br>- `cockpit-hud-map` 组不含 `models` 分区的 Asset，`models` 组仍按 P2-06 的规则发送（2026-10-06 前提更新） | Node，使用结构化克隆端口与真实的宿主和持有者 |
| AC-07 | **预算与读取：** 结构限值与份额以常量导出，并与[限值与预算](#限值与预算)一致；作业限值等于[限值与预算](#限值与预算)所述的组合。<br>- 总量恰等于限值时通过；超出任一维度 → `budget-exceeded`，带维度、`limit` 与 `observed`，不产生部分结果，也不发送组；<br>- 字库、前视布局与地图边框共用的 CCKD 条目在一步内只物理读取一次，由计量端口的读取次数与字节断言；<br>- `finished.usage` 等于最终读取用量与转换用量逐维之和 | Node，使用计量端口 |
| AC-08 | **作业消息与失败：** 成功作业的消息依次为识别进度、`identified`、各转换阶段的进度（`convert-graphics`、`convert-logic`、`convert-audio`，以及合入时已有的其他阶段）、各组的 `group`（含 `cockpit-hud-map`）、`finished`。`finished.groups` 含 `cockpit-hud-map`，`readBytes` 不减少，第一个 `group` 之后没有进度消息；本任务不改变协议版本与阶段集合。<br>- 识别、图形阶段中的读取与转换三类失败保持 P2-05 规定的层、code 与位置，都不发送组；<br>- 组草稿或结束用量的校验失败发生在发送之前，不发送组；<br>- 注入的转移失败使已发送组之后的作业以 `failed` 结束，持有者丢弃已收的组，`takeGroups()` 返回 null；<br>- 在图形阶段取消时，状态为 `cancelled`，之后的消息不改变状态 | Node，使用结构化克隆端口与真实的宿主和持有者 |
| AC-09 | **真实 Worker：** 在 development 项目中，真实 Chromium 模块 Worker 经测试入口处理合成光盘，光盘按生产映射的结构放置合成的 DATA、CCKD、MFDD、TABL 与 BITM 条目（BITM 为执行期修订）。<br>- 收到以转移交出的 `cockpit-hud-map` 组，持有者为 `group-complete`；`finished.usage` 的 `assets`、`imagePixels`、`paletteEntries`、`glyphs` 与 `payloadBytes` 等于合成声明的逐维合计；<br>- 损坏的合成 CCKD 元素使作业以 `source` 层 `invalid-payload` 失败，不发送组；<br>- 收到首条 `convert-graphics` 进度时取消：状态为 `cancelled`，Worker 终止，之后状态不再改变 | `pnpm test:e2e <用例> --project=development` |
| AC-10 | **R1、R2（前视来源与地图调色板）：** cockpit 与 U-029 记录：<br>- R1：10097 与 10103 的 slot 0 元素是否相同；不同时以截图比较选定前视来源；<br>- R2：地图边框调色板的来源条目与格式（含 CCKD 分组调色板）、证据类型与置信度（不低于高概率），以及该调色板下地图边框合成与本地地图截图的比较计数（截图、比较像素数、一致数与不一致像素的分类）；<br>- 元素 +44 与调色板的关系，按证据更新。<br>生产映射与文档一致；地图边框不绑定 DATA，除非证据证明它就是地图调色板。调色板不在生产覆盖文件的 IMFAT 条目中，或格式不是 P2-05 的两种之一或 CCKD 分组调色板时，本项 blocked，按[风险与恢复](#风险与恢复)处理 | 本地研究；文档与生产常量对照审阅 |
| AC-11 | **R3、R4、R6（覆盖表与图像族）：** hud 与 cockpit 记录：<br>- 切片画面覆盖表：每个可见元素的归类（封包位图、字库文字、代码绘制或未识别）及证据；归类为封包位图之前已在 `SR.NOB` 全部可解码的图像记录中检索；<br>- 入选 TABL 的图像列表结构（已确认，由 AC-14 覆盖全部同类实例）；<br>- 每个候选族的用途证据与比较计数、调色板与透明选择及其证据、置信度、入选或排除及排除证据；<br>- R4 选定的 MFDD，以及两个列表按[透明规则单独取证](#研究与入选门槛)的结论；<br>- R6 对 10165 的有界检查结果。<br>U-029、U-030 随之更新，未解决部分写明转交 P3 或 P4。生产声明与映射恰好包含入选族，没有 `unconfirmed` 映射。任一入选族不满足交付条件时，本项 blocked 并记录恢复条件 | 本地研究；文档与生产常量对照审阅 |
| AC-12 | **R5 与本地合成比较：** 对前视与地图边框两个布局，报告元素之间重叠的不透明像素数。为 0 时记录绘制顺序不影响结果；不为 0 时，截图在重叠像素上必须与存储顺序一致，否则本项 blocked。经生产合成函数得到两张 640×480 画面，与本地截图逐像素比较，记录截图、比较像素数、一致数与不一致像素的分类。本项是研究证据，最终保真判定归 P2-12 | 本地研究脚本；证据只记文件名、计数与判定 |
| AC-13 | **本地基准（生产路径）：** 在开发者机器上用本地基准镜像，分两部分验证：<br>- **步骤结果：** 在 Node 中经产品入口打开已验证来源，直接调用生产图形步骤。得到 P2-05 的 5 个 Asset 与本任务的全部生产 Asset；`cockpit-hud-map` 分区装配后经 `validateGroup` 为 `group-complete`；两次运行每个 payload 的 SHA-256 相同；各维用量不超过份额，并记录实际用量。<br>- **作业路径：** 经 Worker 的作业、宿主与持有者模块处理同一镜像：阶段顺序正确，发送 `cockpit-hud-map` 组，持有者为 `group-complete`，作业以 `finished` 结束 | 本地 Node 脚本，留在被忽略的 `local/research/p2-07/`；证据只记命令、计数与判定 |
| AC-14 | **本地全量结构校验：** 加固后的 `tools/nob-check.ts` 经同一套容器解析处理本地基准 `SR.NOB`，以下实例都通过结构校验：<br>- 3 个 CCKD 的目录，以及全部非空 slot 的元素与其图像记录，以及全部 +0x04 非零的分组调色板（执行期修订）；<br>- 3 个 MFDD 的两个列表；<br>- R3 记录为图像列表的全部 TABL 条目（至少包括入选族的来源）。<br>输出只有计数、观察最大值与失败原因。任何实例被拒绝时本项不通过，须按证据修订本 spec，不放宽为静默接受 | 本地运行该工具，记录命令与计数 |
| AC-15 | **边界、隐私与工程：**<br>- `content/` 的新模块不导入 `original-data`、DOM、Node 或 Three.js；`original-data` 的转换不使用 DOM；<br>- 本任务新增的诊断不含原版字节、条目编号、偏移、文件名或宿主路径；nob-check 只输出结构计数与失败原因；<br>- `workers/` 仍不使用网络 API；<br>- 没有新依赖，锁文件不变；<br>- `pnpm check`、`pnpm check:original` 与聚焦 E2E 通过 | 命令输出、依赖与锁文件 diff、源码与边界检查 |
| AC-16 | **文档：**<br>- cockpit、hud 与 unknowns 记录 AC-10 至 AC-12、AC-14、AC-17 与 AC-18 的事实、置信度与观察最大值；<br>- 源码结构记录布局 payload 的字节布局、子资源语法、限值名、错误码与新的 `ConverterVersion`；工具指南记录 nob-check 的新输出；<br>- `tasks.md` 只更新导航；<br>- 文档中没有原版内容 | 文档链接与元数据检查、最终 diff 审阅 |
| AC-17 | **R7（字体引用与字形核对）：** hud 为参考画面中的每处文字记录所用的生产字库、字距与置信度，不记录文字内容。核对经生产字体 payload 与字符查找进行：按截图位置逐像素比较字形的置位像素，记录比较像素数与一致数。截图中需要的每个码位都能经生产字符映射得到；不能时，有证据的码位按证据扩展字符映射（递增 `graphics` 组件），没有证据的记为未确认。单元外像素的绘制语义有证据时更新 U-030，否则保持未确认并写明转交 P3 | 本地研究脚本；文档与生产常量对照审阅 |
| AC-18 | **R8（地图图标对应）：** hud 以 M2ID 机型槽位为键，为所选任务引用的每个机型记录放大窗口中对应的机型图标序号、证据与置信度；未取得的记为未确认并写明检查方法。规范内容中没有机型到图标的查找表 | 本地研究；文档审阅与源码搜索 |

## 验证策略

- **单元/契约测试：** 布局 payload 与合成放在 `content/graphics/` 相邻的 `*.test.ts`；容器解析、布局声明与转换、图形步骤与生产常量放在 `original-data/conversion/` 相邻的测试；组装、包身份与作业消息放在 `src/workers/` 与 `src/app/import/` 的既有测试。合成 CCKD、MFDD 与 TABL 由代码生成，扩展 [synthetic.ts](../../../../src/original-data/synthetic.ts) 与转换测试支持；覆盖每个新错误条件、限值边界（恰等于与超出 1）与非对称样本。
- **Replay/一致性：** 不涉及 Core、tick 或 replay。确定性由“同一输入两次转换、合成逐字节相同”与 SHA-256 断言证明（AC-01、02、13）。
- **浏览器验证：** 只验证真实 Worker 路径（AC-09），扩展 [import-worker.spec.ts](../../../../e2e/import-worker.spec.ts) 并只用合成光盘。本任务没有页面或 Canvas/WebGL 输出；4:3 合成的位置、颜色与透明在 Node 中逐像素断言，查看器中的实际显示归 P2-11。
- **原版本地对照：** 开发者机器上的本地基准镜像与 `local/StarRang/captures/` 截图，用于 AC-10 至 AC-14、AC-17 与 AC-18。脚本与输出留在 `local/research/p2-07/`；证据只记命令、文件名、计数与判定，不记像素、颜色值或原版文字。最终保真判定归 P2-12，本任务的比较只决定研究结论与入选。
- **工程检查：** 迭代时运行聚焦的 `pnpm test -- <测试文件>`；完成时运行 `pnpm check`、`pnpm check:original` 与 `pnpm test:e2e <用例> --project=development`；本地运行 `node tools/nob-check.ts local/StarRang/SRANGERS/MAIN/SR.NOB`。

## 风险与恢复

风险等级：中。本任务新增一种 payload 与三类容器解析，首次让生产作业发送组结果，并依赖研究结论；不涉及存档，也没有已持久化的生产内容。

- **地图调色板无法从封包取得（AC-10）：** 调色板若只在 EXE 中、由运行时推导，或格式既不是 P2-05 的两种之一，也不是 CCKD 分组调色板（执行期修订），P2-01 的定位与本任务的来源格式都表达不了。P2-07/08 的结论是 CCKD 分组调色板，这一风险没有发生。
  - 处理：AC-10 及依赖地图边框的验收项保持 blocked，不以 DATA 或截图推出的颜色代替；
  - 恢复：修订本 spec（必要时连同 P2-01/03 的定位与覆盖规则）并经用户批准后再实现。
- **入选族的研究无法定论（R1、R3、R4）：** 相应验收项保持 blocked，记录恢复条件，例如需要受损状态或放大窗口的截图，或某段 EXE 证据；用户可按 P0 的方式补充试玩截图。现有高概率的映射不因此降级为猜测，缺口也不自动转给 P3。
- **HUD 资源仍可能不全：** 覆盖表中归为代码绘制或未识别的元素不在本任务转换，作为交给 P3 的记录。P3 可按 ADR-0007 使用明确标注的临时资源；HUD 资源是否足以满足阶段退出条件，由 P2-12 对照与 P2-13 评审判定。
- **与并行任务冲突：** P2-06 向同一图形步骤追加声明与份额，新增 `convert-models` 阶段并递增协议版本，也会改变 `ConverterVersion`。
  - 规则：两者都复用已落地的包身份与版本表示；图形输出的变化都体现在 `graphics` 组件上，先落地者加入，后者递增；
  - 涉及共享文件的提交之前先并入 `main`；协议版本跟随 `main`。
- **已有测试的期望改变：** 作业多发送一个组，`logic` 与 `audio` 组的包身份随之改变，图形用量增加。断言这些结果的既有测试按本 spec 更新；已完成任务的 spec 是历史记录，不改写。
- **份额不足：** 本地基准的实际用量超出份额时，修订 S-08 并重新批准，不放宽检查。
- **截图证据有限：** 92 张本地截图未必覆盖受损叠加图等状态。缺少证据的入选族保持 blocked 并写明需要的截图；不以外观相似或不透明像素一致提升置信度。
- **恢复：** 改动都可以回退，不写入用户数据。`graphics` 组件变化使旧结果与新结果的缓存键不同，不会混用。

## 未决事项

无。研究结论尚未取得的部分已由[研究与入选门槛](#研究与入选门槛)规定处理方式与阻塞条件，不需要在批准前另行决定。

## 审批

用户于 2026-10-05 明确批准本 spec。批准范围包括：

- S-01 至 S-11、AC-01 至 AC-18；
- 布局 payload、布局合成、容器子资源、布局转换声明、研究与入选门槛、生产 Asset 与来源、组结果与包身份、限值与预算、错误码、持久化与兼容；
- 技术决定 1 至 12。

生成时按“采用推荐答案”授权作出的选择，以及 review-spec 采纳的七项修正，随本次批准一并生效。

2026-10-05 前提更新（rebase 到 `main` 之后）：
- **原因：** P2-08 与 P2-09 已合入 `main`，包身份、`ConverterVersion`（`osr-import.logic-1.audio-1`）、发送前校验与协议版本 4 都已落地；P2-06 的 spec 已获批准。
- **改动：** 问题与目标、当前实现与依据、涉及模块、组结果与包身份、限值与预算的组合说明、技术决定 4 与 8、AC-07 与 AC-08 的措辞，以及风险与恢复，改为引用已落地的代码与 spec。`graphics` 组件写明排在 `logic` 之前；P2-06 先加入该组件时，本任务只递增。
- **审批：** 用户于 2026-10-05 确认作此更新，并确认范围与验收标准不变、原批准继续有效。S-01 至 S-11 与 AC-01 至 AC-18 的意图不变。

2026-10-05 执行期修订（P2-07/08）：
- **原因：** R2 确认地图调色板是 CCKD 分组目录项 +0x04 指向的 768 字节 6 位 VGA 调色板。格式与 DATA 相同，但不是整条目，原 spec 允许的两种来源格式表达不了，AC-10 因此按原文 blocked。研究同时确认了 +44、+48 的含义与 raw 元素的不透明绘制。
- **改动：**
  - S-03、[容器子资源](#容器子资源)、行为与边界、错误码、AC-03、AC-10、AC-14 与风险与恢复加入 CCKD `groups/<s>/palette`；
  - R2 的格式条件加入该来源，并记录结论；
  - 生产 Asset 表写入 R1、R2 的结论与置信度，地图调色板 ID 定为 `palette/map/screen`；
  - 技术决定 1 与“不包含”中关于 +44 与 HUD 位置的表述按研究结论更正。

  没有新增范围项、验收项或依赖，生产份额不变。实现由新增的 goal 子任务 18 承担。
- **审批：** 用户在调用 execute-goal 时授权“子任务因需要修改 spec 而阻塞时，可直接更新 spec、goal 与 subtasks，并在执行记录中说明”。本修订据此进行，记录在 goal 的执行记录中。

2026-10-06 执行期修订（P2-07/09）：
- **原因：** HUD 族研究在 EXE 中找到了运行时才建立的仪表与地图绘制函数，各族的用途、调色板、透明与行序因此都取得 EXE 证据。研究同时发现：
  - 10461 由战略地图绘制在主地图区，是单位标记而不是雷达点，原 Asset ID 与角色不符；
  - 切片载入并绘制左显示屏的页面背景 BITM 10467（仪表条 10479 就画在其中一页上），它不在候选族中。

  按原文，10461 无法交付；加入 10467 也须先修订范围与预算。
- **改动：**
  - 研究与入选门槛：候选族加入 BITM 10467，图像族定义加入整条目 BITM；R3、R4、R6 写入结论；
  - 生产 Asset 表：写入全部入选族的来源、转换选择与置信度。10461 改为 `image/map/unit-marker/<i>`（`strategic-map`，地图调色板），新增 `image/hud/display-page/background`；11401 的三个按区间命名的前缀（机型图标、符号、地图点只是外观推测）合并为中性的 `image/map/zoom-icon/<i>`；
  - 原“其余候选族”表改为排除与转交说明（10475、10469、10481 排除；SNIP 10487、DIAG 10489 转交 P3）；
  - 技术决定 6 的角色、“不包含”的资源清单与 AC-09 合成光盘的条目类型随之更正。

  范围项、验收项与依赖不变，生产份额不变（入选共 86 个 Asset、约 44.2 万像素）。
- **审批：** 依据用户在调用 execute-goal 时的授权（见上一条修订），记录在 goal 的执行记录中。

2026-10-06 前提更新（rebase 到含 P2-06 实现的 `main` 之后）：
- **原因：** P2-06 已在 `main` 上实现：图形步骤的切片贴图、`convert-models` 阶段、`models` 组的装配与发送，以及 `ConverterVersion` 的 `graphics-1` 与 `models-1` 组件。本 spec 中“`models` 分区不发送、留给 P2-06”的表述因此过时。
- **改动：** S-07、当前实现与依据中的并行任务、组结果与包身份的发送一项、技术决定 8 与 AC-06 的最后一项改为：`models` 组按 P2-06 的规则发送，`cockpit-hud-map` 组不含 `models` 分区的 Asset；`graphics` 组件在 P2-06 的值上递增为 `graphics-2`。组结果与包身份中的 `ConverterVersion` 当前值与递增规则、限值与预算中共用限值的组合（加入模型份额）也按落地值更正。范围项、验收项编号与份额不变，本任务的行为没有新增或减少。
- **审批：** 依据用户在调用 execute-goal 时的授权，记录在 goal 的执行记录中。
