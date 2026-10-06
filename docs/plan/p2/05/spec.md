---
type: plan
status: accepted
phase: P2
task: "05"
updated: 2026-10-05
related: [ADR-0007, ADR-0008, ADR-0015, U-001, U-018, U-019, U-028, U-029, U-030]
reviewed: sha256:1c6f9c5f4028
---

# P2-05：调色板、索引图像与字体转换 — Spec

## 问题与目标

[payloads.ts](../../../../src/original-data/payloads.ts) 已能解析 DATA 调色板、36 字节图像记录（raw 与精灵 RLE）、MFDD 图像列表、点阵字体与 CCKD 字体目录，[nob-check](../../../../tools/nob-check.ts) 也在本地基准上逐条解析过这些条目。但它们是研究用解析器，还不是导入边界：

- **无预算：** 宽高只来自不可信字段，RLE 解码在任何检查之前就按 `width × height` 分配；调色板条目数、MFDD 列表与字体目录的计数没有上限，也没有接入 P2-01 的预算维度。
- **校验与所有权缺口：** raw 图像的像素视图与源块共用缓冲；DATA 分量超过 63 时被静默截掉高位；不校验保留字段，也不校验像素索引是否落在调色板内。
- **错误不可分类：** 失败抛出无类型的 `PayloadError`，到 Worker 宿主只会成为 `internal-error`。
- **没有规范结果：** 输出仍是原版结构，没有规范 payload、schema、调色板引用或 Asset 身份。TEX “映射到 DATA 最近色”（已确认）没有统一实现，4×6 字体的字符映射仍未知（U-030）。
- **没有接入导入：** [P2-04](../04/spec.md) 的作业只识别来源。P2-06（模型/材质）与 P2-07（驾驶舱/HUD/地图）都需要同一份图像、调色板与字体转换。

本任务交付：

- **规范 payload：** `palette`、`image`、`font` 三类 Asset 的 payload schema 1 及严格读取器，保留索引像素与调色板等紧凑数据；
- **唯一颜色逻辑：** 一个纯展开函数按声明的调色板绑定把规范图像展开为 RGBA，包括 TEX 的“最近 DATA 色”显示映射；
- **加固转换：** 复用现有解析器，把原版图像记录、调色板与字体转换为规范 payload，在分配前检查结构限值与预算，失败带稳定 code；
- **Worker 接入：** 导入作业在识别后增加图形转换阶段，转换本任务拥有的生产 Asset（两个资源组各一份飞行调色板，以及 HUD 的三个字库），结果按资源组分区，留在作业内供 P2-06/07 装配组结果；
- **定向研究：** 最近色规则（U-028 的颜色部分）与字体字符映射（U-030 的字体部分），结论按证据写入原版文档。

完成后可观察的结果：

- 合成测试证明方向、颜色、透明、字形与映射，而不只是数组长度；
- 真实 Chromium 的模块 Worker 运行图形阶段，并报告预算用量；
- 本地基准镜像在 Node 中经生产图形步骤转换出 5 个 Asset，两次运行逐字节一致；同一镜像经作业路径以 `finished` 结束；
- 加固后的 nob-check 对基准 `SR.NOB` 的全部 TEX、BITM、MFDD 图像与 CCKD 字体通过结构校验。

本任务不发送组结果、不渲染、不缓存。阶段范围依据[总计划 §12](../../master-plan.md#12-开发阶段与验收条件)，紧凑缓存要求见[总计划 §8](../../master-plan.md#8-浏览器运行存档与隐私)，任务导航见[阶段索引](../tasks.md#p2-05-调色板索引图像与字体转换)。

## 范围

### 包含

- **S-01 规范调色板：** payload schema 1 为 1–256 个 8 位 RGB 条目，不含透明信息。
  - DATA 的 6 位分量按位复制展开（已确认）；
  - 图像记录的嵌入调色板按 BGR 读为 RGB。TEX 已确认，其余记录的置信度见各自的来源映射。
- **S-02 规范索引图像：** payload schema 1 包含：宽高；行优先的 8 位索引；透明表示（全不透明，或每像素 1 位的掩码）；调色板绑定，即索引所指的调色板 Asset，以及可选的“最近色”显示目标调色板 Asset。透明像素的索引与掩码填充位一律为 0，同一输入总是得到同样的字节。
- **S-03 规范字体：** payload schema 1 把字形库与字符映射分开存放：
  - 字形库为 1–256 个字形，单元宽 1–8、高 1–8；每个字形存储“每字形行数”行（不少于单元高，最多 8），每行 1 字节，bit 7 为最左像素，逐位保留，包括单元以外的位与行（执行期修订，见[技术决定](#技术决定) 14）；
  - 字符映射是原版文本字节到字形索引的有序条目，只含有证据的条目，没有 ASCII 或系统字体回退。
- **S-04 纯读取与展开：** 在 `content/` 中提供三类 payload 的严格读取器、与描述符依赖的一致性校验、图像到 RGBA 的展开、最近色映射和字符查找。这是项目中唯一的调色板查找与最近色实现，P2-06/07/11 与后续 Renderer 复用它，不另写颜色逻辑。
- **S-05 转换声明与原版转换：** 在 `original-data/` 中定义[图形转换声明](#图形转换声明)，内容包括调色板绑定、显示映射、透明规则（按编码，或有证据的颜色键）、行序（按存储，或有证据的反转），以及字体的预期单元与字符映射区间。转换复用并加固现有解析器：
  - 校验保留字段与指针范围；
  - 输出不与源块共用缓冲；
  - 不按默认值猜测未声明的选择，例如没有调色板的图像不默认使用 DATA；
  - 编码 1（动画）明确不支持。
- **S-06 子资源与来源状态：** 定义本任务所转换的子资源路径：整条目图像记录的嵌入调色板 `palette`，以及 CCKD 字体表 `fonts/<序号>`。映射先经 P2-03 的 `verifySourceMappings` 核验，核验与转换共用一个步骤内的条目读取，见 S-09；含子资源的映射在转换成功后才成为 `verified`。输出只含不带定位的来源状态。
- **S-07 结构限值与预算：** 批准本任务的逐项结构限值和生产份额，见[限值与预算](#限值与预算)。读取或分配声明的规模之前先扣除 P2-01 预算；作业的 `finished.usage` 合并读取与转换的用量。
- **S-08 错误与诊断隐私：**
  - 本任务产生的转换失败以扩展后的 `SourceError`（`source` 层）传输，payload 读取、展开与查找失败以 `content` 层错误报告，code 与位置见[错误码](#错误码)；
  - 本任务产生的诊断只含规范 Asset ID、结构字段名与限值，不含原版字节、条目编号、偏移或宿主路径；
  - 图形阶段中的读取失败保持 P2-02/P2-03 的层、code 与位置，不改写为转换错误。
- **S-09 图形转换步骤与 Worker：** 导入作业在 `identified` 之后运行图形转换步骤：
  - 核验映射，按需读取条目，然后转换。映射核验与转换共用一个步骤内的条目读取，同一条目在一步内只物理读取一次；条目字节在步骤结束时释放，不建立跨步骤或通用的封包缓存；
  - 返回按资源组分区的描述符、payload 与来源状态，形状见[步骤结果](#步骤结果)；
  - 新增阶段 `convert-graphics` 并递增协议版本，见[协议变化](#协议变化)。

  本任务不发送组消息，步骤结果保留到作业结束，由 P2-06/07 在装配组结果时消费。
- **S-10 本任务的生产 Asset：** 共 5 个，见[生产 Asset 与来源](#生产-asset-与来源)：
  - `models` 与 `cockpit-hud-map` 各一份飞行调色板：同一 DATA 来源、相同 payload、不同 Asset ID；
  - HI 驾驶舱组的三个 HUD 字库。

  其余图像（贴图、驾驶舱元素、MFD、地图图标）由 P2-06/07 选定，经本任务的转换器转换。
- **S-11 定向研究：**
  - **最近色规则（U-028 颜色部分）：** 优先以 EXE 证据确定原版的度量与并列规则；未取得时把实现规则记为暂定，并对全部 TEX 嵌入调色板做候选规则核对，歧义条目逐一记录。
  - **字符映射（U-030 字体部分）：** 确定 4×6 字库的码位到字形机制，并按需扩展 8×8 字库已证实的码位；记录各字库在单元宽度以外是否有置位。
  - **记录：** 结论按置信度写入 [textures](../../../original/formats/textures.md)、[hud](../../../original/formats/hud.md) 与 [unknowns](../../../original/unknowns.md)。U-018/U-019 只在有任务选中依赖它们的 BITM 时研究，见[技术决定](#技术决定)。
- **S-12 验证：** 覆盖三条路线，测试只用代码生成的数据，仓库不新增二进制样本：
  - Node 合成测试；
  - 真实 Chromium 的模块 Worker，处理合成光盘；
  - 本地基准核对，并加固 `tools/nob-check.ts`，使它使用同一套转换校验。
- **S-13 文档：** 同步[源码结构](../../../engineering/source-structure.md)、[工程约定](../../../engineering/README.md)与[工具指南](../../../guides/tools.md)；原版事实只写入 `docs/original/`。

### 不包含

- **选型与容器，归 P2-06/07：**
  - 哪些 TEX、CCKD 元素、MFDD 图像、TABL 图标与仪表进入切片；
  - CCKD 分组目录与元素、MFDD 列表、TABL 记录的子资源路径及其语义（它们复用本任务的图像记录转换与声明）；
  - 地图边框的调色板（U-029），以及 MFD 叠加图把颜色 0 视为透明（未确认）。
- **组结果与身份，归 P2-06/07/11：** 组清单、`ContentIdentity`、`ManifestIdentity`、生产 `ConverterVersion` 的定义、组消息的发送与全包判定。
- **渲染与玩法：**
  - Three.js 纹理创建、过滤方式与纹理坐标朝向；
  - 光照与明暗（U-028 的光照部分，归 P3）；
  - HUD 文字的布局、字距、绘制颜色与内容（P2-07/P3）；
  - 资源查看器（P2-11）。
- **其他图像：** ANIM 的编码 1 与 EXPL 效果、NEBC 星云背景与其余 BITM、通讯头像、OPTIONS 菜单字体、LO 驾驶舱组、调色板动画。若后续 spec 证明切片必需其中之一，按[风险与恢复](#风险与恢复)修订。
- **导出与持久化：** PNG 等文件导出、IndexedDB 缓存（P2-10/11）、原版本地截图的最终保真判定（P2-12）。
- **既有契约：** 不修改 P2-01 的 Asset ID 语法、资源组归属、预算维度与完整性规则，不修改 P2-03 已有错误码的含义，不新增依赖。

### 涉及模块

| 模块 | 责任与影响 |
|---|---|
| `src/content/` 中计划新增的图形 payload 模块 | 三类 payload 的格式常量、编码与严格读取器、描述符一致性、RGBA 展开、最近色映射与字符查找；纯 TypeScript，不导入 `original-data` |
| 计划新增 `src/original-data/conversion/`（或按[源码结构指南](../../../engineering/source-structure.md#后续扩展方向)的相应子目录） | 转换声明的读取，图像记录、调色板与字体的转换，子资源解析，生产声明与映射，图形转换步骤；复用 [payloads.ts](../../../../src/original-data/payloads.ts)，并按本 spec 加固或替换其中的生产用途 |
| [source-mapping.ts](../../../../src/original-data/source-mapping.ts)、[verify-source-mappings.ts](../../../../src/original-data/source/verify-source-mappings.ts) | 复用映射契约与核验；本任务的生产映射只新增自己的 Asset，不另建映射契约。允许为核验增加可选的步骤内条目读取参数，等价备选核对、错误位置与缓冲所有权保持不变，现有测试继续通过 |
| [source-error.ts](../../../../src/original-data/source-error.ts) | 追加本任务的 code 与限值名，预算限值的观察值允许为 null；P2-03 已有 code 与限值的含义不变 |
| [import-job.ts](../../../../src/workers/import-job.ts)、[import-protocol.ts](../../../../src/workers/import-protocol.ts)、[import-host.ts](../../../../src/workers/import-host.ts) | 作业追加图形步骤与合并用量；新增阶段并递增协议版本；宿主把转换错误按 `source` 层转换 |
| [import-job-owner.ts](../../../../src/app/import/import-job-owner.ts) | 按新的阶段顺序规则校验进度消息 |
| [nob-check.ts](../../../../tools/nob-check.ts) | 改用同一套转换校验，只输出计数与失败原因 |
| 相邻 `*.test.ts`、[synthetic.ts](../../../../src/original-data/synthetic.ts)、[synthetic-import.test-support.ts](../../../../src/workers/synthetic-import.test-support.ts)、`e2e/` | 合成图像、调色板、字体与封包，Node 与真实 Worker 用例 |
| `docs/original/`、`docs/engineering/`、`docs/guides/` | 研究事实与置信度、模块与命令说明 |

## 当前实现与依据

- **现有解析器：** [payloads.ts](../../../../src/original-data/payloads.ts) 中 `parseVgaPalette` 只要求至少 768 字节，并以 `& 63` 截掉分量高位。`parseImage` 只检查位深与指针范围：raw 像素直接引用源块，嵌入调色板按 BGR 转为 RGB，编码 1 报错。`decodeSpriteRle` 先分配 `width × height` 再解码，拒绝越行、截断与尾随字节。`parseBitmapFont` 要求宽 1–8、表长 `4 + 256 × height`，高度不设上限；`parseCockpitFonts` 与 `parseMfdImages` 的计数不设上限。全部失败都抛出无类型的 `PayloadError`。[payloads.test.ts](../../../../src/original-data/payloads.test.ts) 与 [synthetic.ts](../../../../src/original-data/synthetic.ts) 的 `imageRecord`、`buildImfat` 可继续用于构造合成样本。
- **内容契约（P2-01）：**
  - [asset-contract.ts](../../../../src/content/asset-contract.ts) 的描述符含 `id`、`kind`、`role`、`group`、有序依赖与 `payloadIdentity`；[payload.ts](../../../../src/content/payload.ts) 的 `PayloadRecord` 为 `{ id, schemaVersion, bytes }`。
  - [budget.ts](../../../../src/content/budget.ts) 已有 `imagePixels`、`paletteEntries`、`glyphs` 与 `payloadBytes` 维度；[ownership.ts](../../../../src/content/ownership.ts) 的 `payloadTransferList` 要求每个 payload 独占整个缓冲。
  - [slice-definition.ts](../../../../src/content/slice-definition.ts) 中 `models` 与 `cockpit-hud-map` 都拥有 `image`、`palette`；`font` 角色属于 `cockpit-hud-map`。
  - [completeness.ts](../../../../src/content/completeness.ts) 要求组所拥有 kind 的依赖必须在本组内，并以 `duplicate-asset` 拒绝同一 Asset 出现在两个组中。
  - [asset-units.ts](../../../../src/content/asset-units.ts) 以独立图像、独立复用的调色板和字库为计数单位。
- **来源映射（P2-01/03）：** [source-mapping.ts](../../../../src/original-data/source-mapping.ts) 的 `SOURCE_ENTRY_TYPES` 规定：`image` 可来自 ANIM、BITM、CCKD、MFDD、TABL、TEX；`palette` 可来自这些类型及 DATA；`font` 可来自 CCKD、TABL。它还定义子资源语法，并允许多个 Asset 共用一个定位。[verify-source-mappings.ts](../../../../src/original-data/source/verify-source-mappings.ts) 逐个读取每个定位来核验条目存在与等价备选（只缓存封包目录，不保留条目字节）；含子资源的映射保留为 `declared`，由理解该 payload 的转换任务核验。
- **错误类型（P2-02/03）：** [source-error.ts](../../../../src/original-data/source-error.ts) 的 code 与限值名是封闭联合，`limit.observed` 为数值；P2-02 的 `DiscReadError` 预算限值的观察值可为 null。P2-03 的位置语法包含条目编号（如 `archive:/路径#ID`），光盘层位置可含 LBA，它们是已批准的结构位置。
- **导入 Worker（P2-04）：**
  - [import-job.ts](../../../../src/workers/import-job.ts) 只识别来源，以 `source.usage()` 作为结束用量；
  - [import-protocol.ts](../../../../src/workers/import-protocol.ts) 的 `IMPORT_STAGES` 只有 `identify-source`，协议版本为 1；
  - [import-host.ts](../../../../src/workers/import-host.ts) 只把 `DiscReadError`、`SourceError` 与 `ContentContractError` 转为分层 DTO；
  - [import-job-owner.ts](../../../../src/app/import/import-job-owner.ts) 拒绝识别之后的识别进度；
  - 测试专用的合成作业与 Worker 入口在 [synthetic-import.test-support.ts](../../../../src/workers/synthetic-import.test-support.ts) 与 `e2e/import-worker.spec.ts` 中。协议、错误层与持有者契约见 [P2-04 spec](../04/spec.md#消息协议)。
- **原版事实：**
  - DATA 与位复制、图像记录、各编码、TEX 的 BGR 与最近 DATA 色、BITM 的未知项见 [textures](../../../original/formats/textures.md)。最近色只确认了“映射到最接近的 DATA 颜色”，距离度量与并列规则没有记录。
  - 原生准备路径把嵌入调色板由 BGR 转为 RGB，该循环本身不做最近色映射，见 [executable](../../../original/formats/executable.md#qualified-startup-interval-change-before-manual-activation)。
  - 字体结构、8×8 字库的 ASCII 位置（核对过字母与数字）与 4×6 字库的未知映射见 [hud §1](../../../original/formats/hud.md#1-bitmap-fonts-confirmed)。
  - CCKD 字体目录与 HI 组见 [cockpit §1](../../../original/formats/cockpit.md#1-cckd-cockpit-layouts)。P2-01 的固定图形投影用 HI 完整组计入三个字库，并明确该投影不完整，见[有界投影](../../../original/formats/cockpit.md#bounded-canonical-graphics-projection)。
  - 未知项状态见 [U-018、U-019、U-028、U-029、U-030](../../../original/unknowns.md#数据与格式)。HI 画幅 640×480 已确认（U-006）。
- **研究分工：** [阶段索引](../tasks.md#定向研究与交接入口)把 U-018/019 与 U-030 的字体部分分给本任务，并限定“只解决入选图像，未使用的 BITM 不成为全阶段前置”。

## 行为与边界

| 场景或状态转换 | 预期结果 | 拒绝或失败时的反馈 |
|---|---|---|
| DATA 条目 → 调色板 | 256 个条目，各分量按 `(c << 2) \| (c >> 4)` 展开 | 块长不是 768 字节，或任一分量大于 63：`invalid-payload`，不截断高位 |
| 嵌入调色板（`palette` 子资源） | 条目数 1–256，BGR 读为 RGB | 记录没有嵌入调色板：`subresource-not-found`；条目数超过 256：`limit-exceeded` |
| raw 图像（编码 0） | 索引复制到独占的新缓冲，全不透明 | 数据长度不等于宽 × 高：`invalid-payload` |
| 精灵 RLE（编码 2） | 透明段在掩码中为 0，透明像素索引为 0，每行恰好铺满宽度 | 截断、越行、尾随字节：`invalid-payload` |
| 编码 1 或其他编码 | 不解码 | `unsupported-encoding` |
| 宽或高为 0 或超出结构限值 | 只读完 36 字节头部即拒绝，不按声明的规模分配 | `limit-exceeded`，含限值名、上限与观察值 |
| 扣除后超出作业预算 | 拒绝整个转换，不产生部分结果；被拒绝的扣除不改变转换用量，已发出的读取仍按 P2-02 计入 `sourceReadBytes` | `budget-exceeded`，含维度、上限与观察值 |
| 不透明像素的索引不小于所绑定调色板的条目数 | 拒绝；透明像素的原索引不参与 | `palette-index-out-of-range` |
| 图像没有声明调色板绑定，或绑定的不是本步骤中同组的调色板 | 不默认使用 DATA | `invalid-declaration` |
| raw 图像声明颜色键 k | 索引为 k 的像素变为透明，其他像素不变 | 对 RLE 图像声明颜色键：`invalid-declaration` |
| 声明 `rowOrder: reversed` | 规范行序恰好反转；未声明时保持存储顺序 | 不适用 |
| CCKD 字体目录 | 恰为 3 项，`fonts/<i>` 取第 i 项 | 项数不为 3 或越出块：`invalid-payload`；i ≥ 3：`subresource-not-found` |
| 字体表 | 表头之后的 256 × 高字节按声明的每字形行数切分为 256 × 高 ÷ 每字形行数个字形，字节不变，逐位保留，包括单元以外的位与行 | 表长不符：`invalid-payload`；宽或高超限：`limit-exceeded`；与声明的预期单元不符：`geometry-mismatch`；每字形行数小于单元高、大于 8 或不能整除 256 × 高：`invalid-declaration` |
| 字符映射区间 | 展开为按码位升序、互不重复的条目 | 区间重叠、码位越出 0–255，或字形不小于字形数：`invalid-declaration` |
| 消费者按码位查找字形 | 得到映射中的字形索引 | 未映射的码位：`unmapped-character`，不回退到同码位字形 |
| 消费者读取 payload | 严格读取，引用的调色板与描述符依赖一致 | 长度、字段、填充位或透明像素索引不合：`invalid-graphics-payload`；schema 不是 1：`unsupported-payload-schema`；引用不一致：`binding-mismatch` |
| 展开图像 | 非预乘 RGBA：不透明为调色板颜色、alpha 255，透明为 `(0,0,0,0)`；`nearest` 先把源调色板逐项映射到目标调色板 | 提供的调色板与引用不符：`binding-mismatch`；索引越界：`palette-index-out-of-range` |
| 同一输入与声明再次转换或展开 | 逐字节相同，SHA-256 相同 | 不适用 |
| 映射含子资源 | 转换成功后才为 `verified` | 转换失败时整个步骤失败，不输出任何 Asset 的状态或 payload |
| 图形步骤中任一 Asset 转换失败 | 作业以 `failed` 结束，已转换的 payload 全部丢弃 | `source` 层 DTO，位置为 `graphics[<Asset ID>]…`、`graphics.declarations[<i>]…` 或 `graphics.declarations` |
| 图形阶段中读取失败（坏扇区、预算、条目缺失等） | 作业以 `failed` 结束，已转换的 payload 全部丢弃 | 保持 P2-02 的 `disc` 层或 P2-03 的 `source` 层原 code 与位置 |
| 图形阶段中取消 | 持有者同步变为 `cancelled` 并终止 Worker，之后的消息不改变状态 | 不适用（沿用 P2-04） |
| 识别之前出现 `convert-graphics` 进度，或之后又出现识别进度 | 作业失败 | `protocol-error@message.stage` |

## 数据模型与契约

### payload 契约

三类 payload 的 schema 版本都是 1，由计划新增的 `content/` 模块定义。编码为小端定长头部加数据，总长恰为两者之和；Asset ID 以 ASCII 存储。具体字节布局由实现确定，并写入[源码结构指南](../../../engineering/source-structure.md)。改变布局或解释属于不兼容变化，须递增该类 schema。

| 数据/字段 | 类型、单位与约束 | 权威所有者 | 输入/输出或序列化边界 |
|---|---|---|---|
| 调色板 payload | `entryCount` 为 1–256；`entries` 为 `entryCount` 组 8 位 (R, G, B) | `content/` | 转换器写入，读取器严格校验；消费者只经展开函数取颜色 |
| 图像 payload | `width` 1–640、`height` 1–480，单位为像素。`alpha` ∈ {`opaque`, `mask`}。`palette` 为调色板 Asset ID。`display` 为 `direct`，或 `{ nearest: 目标调色板 Asset ID }`。`indices` 为 `width × height` 字节，行优先，行 0 是规范上方的第一行。`mask` 只在 `alpha` 为 `mask` 时存在：每像素 1 位，bit 7 为最左，每行补齐到整字节，1 表示不透明 | `content/` | 透明像素的索引与填充位为 0。引用的调色板 ID 去重后按升序必须恰好等于描述符依赖：`direct` 为 `{palette}`，`nearest` 为 `{palette, target}` |
| 字体 payload | `cellWidth` 1–8、`height` 1–8；`glyphRows` 为每字形行数，`height`–8；字形数 1–256；`glyphs` 为字形数 × `glyphRows` 字节，每行 1 字节、bit 7 为最左、行 0 在上，逐位保留；`charMap` 为 0–256 个 `{ code: 0–255, glyph }`，`glyph` 小于字形数，按 `code` 升序且唯一 | `content/` | 字形的绘制颜色与字距不在 payload 中；映射之外的码位没有字形；单元以外的位与行的绘制语义不在 payload 中（U-030） |
| 展开结果 | `{ width, height, rgba }`，`rgba` 为 `width × height × 4` 字节的非预乘 RGBA | `content/` 中的纯函数 | 每次返回调用者独占的新缓冲；不进入缓存或 payload |
| 最近色映射 | 项目暂定规则：对源调色板的每一项，取 8 位 RGB 平方欧氏距离最小的目标条目，距离相等时取较小索引。原版的实际度量与并列规则在取得证据前不高于高概率（U-028），见 AC-15；合成测试只验证算法，不是保真证据 | `content/` 中的纯函数 | 只有展开函数与研究工具调用它；不在转换时改写像素 |

### 图形转换声明

转换声明是 `original-data/` 中的纯数据，由读取器严格校验；与来源映射一一对应，但不含定位。生产声明与 P2-06/07 追加的声明使用同一契约。

| 字段 | 约束 | 说明 |
|---|---|---|
| `asset` | `{ id, kind }`，`kind` ∈ {`palette`, `image`, `font`}；同一步骤内 ID 唯一 | 必须在同一份来源映射表中有映射 |
| `role`、`group` | P2-01 的角色 token 与资源组，且该组拥有此 kind | 用于生成描述符 |
| 调色板的来源格式 | 不可声明：DATA 条目按 6 位 VGA 读取，`palette` 子资源按嵌入 BGR 读取 | 由来源推导，避免声明与来源不一致 |
| 图像 `palette` | 必填，为同一步骤中同组的调色板 Asset | 描述符依赖之一 |
| 图像 `display` | `direct`，或 `{ nearest: 同组、同步骤的调色板 Asset }` | `nearest` 只用于有证据的图像族，目前为 TEX |
| 图像 `alpha` | `encoding`，或 `{ colourKey: 0–255 }`（只用于 raw） | 颜色键须有证据 |
| 图像 `rowOrder` | `stored` 或 `reversed` | 反转须有证据 |
| 图像记录位置 | 整条目偏移 0；容器内的记录位置由 P2-07 的容器解析提供 | 本任务只实现整条目 |
| 字体 `cell` | 预期的 `{ width, height }` | 与实际不符即 `geometry-mismatch` |
| 字体 `glyphRows` | 每字形行数，`cell.height`–8，且整除 256 × `cell.height` | 源表的 256 × 高字节按它切分；不等于 `cell.height` 时须有证据 |
| 字体 `charMap` | 互不重叠的 `{ firstCode, firstGlyph, count }` 区间，码位全部落在 0–255，字形小于 256 × `cell.height` ÷ `glyphRows` | 每段在 hud 中有证据；不复制原版的数据表 |

非默认的选择（`nearest`、颜色键、行反转、不等于单元高的每字形行数、字符映射区间）须由该 Asset 映射的 `evidence` 链接相应的 `docs/original/` 条目；置信度与 U 项随映射记录，审阅时核对。在最近色规则确认之前，使用 `nearest` 的映射须带 U-028，置信度不高于高概率；若图像所用的源调色板条目在 AC-15 的歧义清单中，其映射为未确认，按 P2-01 的规则阻塞完整性。

### 生产 Asset 与来源

| Asset ID | kind / role / group | 来源（`MAIN/SR.NOB`） | 置信度与 U 项 |
|---|---|---|---|
| `palette/flight/models` | `palette` / `flight-palette` / `models` | 唯一的 DATA 条目（[imfat §4](../../../original/formats/imfat.md#4-type-distribution-per-file-confirmed)），整条目 | 已确认，[textures §1](../../../original/formats/textures.md#1-data-global-palette-confirmed) |
| `palette/flight/cockpit-hud-map` | `palette` / `flight-palette` / `cockpit-hud-map` | 同上 | 已确认 |
| `font/hud/8x8-1` | `font` / `font` / `cockpit-hud-map` | HI 完整组 CCKD 10103，字体目录中第一个 8×8 表的 `fonts/<i>` | 高概率：HI 飞行是否使用该组的字体属 U-029；字符映射与绘制语义属 U-030，见 AC-16 |
| `font/hud/8x8-2` | 同上 | 同一目录中第二个 8×8 表 | 同上 |
| `font/hud/4x6` | 同上 | 同一目录中的 4×6 表，`glyphRows` 为 8（hud §1.1，高概率） | 同上 |

- 两个飞行调色板的 payload 字节相同，各在自己的组中，由两个 Asset 共用同一个定位表示。
- 序号 `<i>` 由执行时的本地结构核对确定，并由 `cell` 断言防止错配。
- P2-07 若证明 HI 飞行使用其他 CCKD，只修改来源映射，Asset ID 不变。

### 步骤结果

图形转换步骤返回冻结的纯数据，按资源组分区；组装组结果时直接合并，不重新转换：

| 数据/字段 | 类型与约束 | 消费者 |
|---|---|---|
| `groups` | 只含有 Asset 的组，按 `RESOURCE_GROUPS` 顺序排列 | P2-06/07 的组装 |
| 每组的 `descriptors` | P2-01 的 `AssetDescriptor`，按 ID 升序；依赖按 ID 升序；`payloadIdentity` 由实际字节计算 | 组清单 |
| 每组的 `payloads` | P2-01 的 `PayloadRecord`，与描述符一一对应；每个 `bytes` 独占整个 `ArrayBuffer` | 组消息的转移列表 |
| 每组的 `sources` | 不带定位的 `AssetSourceState`，按 ID 升序 | 组的来源状态集 |
| 用量 | 本步骤的转换用量；其中 `sourceReadBytes` 恒为 0，读取由已验证来源计量 | 作业合并为 `finished.usage` |

每个 Asset 的 `assets`、`dependencyEdges` 与 `payloadBytes` 只在产生它的转换步骤中扣除一次，组装组结果时不重复扣除。结果不含定位、条目编号、原版字节或解析中间结构。本任务的作业不发送组消息，`finished.groups` 为空，持有者没有可移交的组；步骤结果只能在作业内或直接调用步骤时观察。

### 限值与预算

**结构限值**对每次转换与每次读取都生效，包括 P2-06/07 经本任务转换器的转换。其中一部分是已确认的格式规则；另一部分是本任务批准的 P2 安全上限，不是格式本身的约束，以基准资源的观察尺寸为依据，并由 AC-14 在全部基准实例上核对：

| 限值名 | 范围 | 类别与依据 |
|---|---|---|
| `imageWidth` / `imageHeight` | 1–640 / 1–480 | 安全上限：宽高字段为 u32，格式本身不限。取 Classic HI 画幅（U-006，已确认），[textures](../../../original/formats/textures.md) 与 [cockpit](../../../original/formats/cockpit.md) 记录的尺寸都在此内 |
| `paletteEntryCount` | 1–256；DATA 恰为 256 | 格式规则：8 位索引至多寻址 256 项；DATA 为 768 字节（已确认） |
| `fontCellWidth` | 1–8 | 格式规则：每行 1 字节 |
| `fontHeight` | 1–8 | 安全上限：高度字段为 u8，已观察的高为 6 和 8 |
| 字体表长 | 恰为 4 + 256 × 高 | 格式规则，hud §1，已确认 |
| 字形数 | 1–256，为 256 × 高 ÷ 每字形行数 | 格式规则：8 位字形索引；每字形行数见技术决定 14 |
| CCKD 字体目录 | 恰为 3 项 | 格式规则，cockpit 与 hud，已确认 |
| 字符映射 | 0–256 条，码位与字形索引都在 0–255 | 格式规则：8 位文本字节与字形索引 |

**生产份额**是本任务 5 个生产 Asset 的预算，以常量导出：

| 维度 | 份额 |
|---|---|
| `assets` | 5 |
| `dependencyEdges` | 0 |
| `paletteEntries` | 512 |
| `glyphs` | 768 |
| `imagePixels` | 0 |
| `payloadBytes` | 16,384（按结构上限与头部计算的上界） |
| `sourceReadBytes` | 不另设，沿用 P2-02 默认值（输入总字节） |
| 其余维度 | 0 |

- 作业的限值记录等于读取限值加上已接入步骤批准的份额；P2-06/07 在各自 spec 中批准图像像素等份额。
- 扣除发生在读取或分配声明的规模之前；总量恰等于限值时通过。被拒绝的转换扣除不改变转换用量，已发出的读取仍计入 `sourceReadBytes`。
- 作业结束时，把已验证来源最终的读取用量与各步骤的转换用量逐维相加一次，作为 `finished.usage`。
- 映射核验与转换共用步骤内的条目读取，被多个 Asset 或多个映射共用的条目只物理读取一次，读取字节计入 `sourceReadBytes`。

### 错误码

**`source` 层（转换）：** 扩展 P2-03 的 `SourceError`：code 联合追加以下封闭集合，限值名追加上表的结构限值名与 P2-01 的预算维度。结构限值的 `observed` 为数值；预算限值的 `observed` 在超出安全整数时为 null，与 P2-02 的 `DiscReadError` 一致。P2-03 已有 code 与限值的含义不变；Worker 宿主已按 `source` 层转换 `SourceError`，P2-04 的 DTO 语法本已允许 null，二者都不变。

| code | 条件 | `limit` |
|---|---|---|
| `invalid-payload` | 源结构不符：位深不为 8，保留字段不为 0，指针或长度越出块，raw 长度不等于宽 × 高，RLE 截断、越行或有尾随字节，DATA 块不是 768 字节或分量大于 63，字体表布局不符，CCKD 字体目录项数不为 3 或越出块 | null |
| `unsupported-encoding` | 图像编码为 1（动画）或其他未知值 | null |
| `limit-exceeded` | 超出结构限值 | `{ name, limit, observed }`，`name` 为上表的限值名 |
| `budget-exceeded` | 扣除后会超出作业预算 | `{ name, limit, observed }`，`name` 为 P2-01 的预算维度；`observed` 超出安全整数时为 null |
| `palette-index-out-of-range` | 不透明像素的索引不小于所绑定调色板的条目数 | null |
| `subresource-not-found` | 子资源不存在：字体序号越界，或记录没有嵌入调色板 | null |
| `invalid-declaration` | 声明不合法或与来源不符：缺少绑定，绑定的不是同步骤、同组的调色板，对 RLE 声明颜色键，字符映射区间重叠或越界，子资源与 kind 不匹配 | null |
| `geometry-mismatch` | 转换得到的尺寸与声明的预期不符 | null |

位置为 `graphics.declarations[<i>]` 加结构字段路径；声明组整体的问题（不是数组，或映射中有未声明的 Asset）为 `graphics.declarations`；或 `graphics[<Asset ID>]` 后接 `.record`、`.palette`、`.pixels`、`.mask`、`.glyphs`、`.charMap`、`.fonts`、`.display`、`.alpha`、`.rowOrder` 之一。本任务产生的位置中不出现条目编号、偏移、字节或宿主路径。映射核验与图形阶段的读取错误不属于上表，保留 P2-02/P2-03 已批准的层、code 与位置（如 `sources.mappings[…]`、带条目编号的封包位置或光盘层的 LBA），不在 Worker 边界改写。

**`content` 层（读取、展开与查找）：** 以下 code 以追加方式加入 P2-01 的内容错误 code 枚举，位置为结构字段路径。

| code | 条件 |
|---|---|
| `invalid-graphics-payload` | payload 字节不符合 schema 1：长度、字段范围、非零填充位或透明像素索引不为 0、尾随字节 |
| `unsupported-payload-schema` | payload 的 schema 版本不是 1 |
| `binding-mismatch` | payload 引用的调色板与描述符依赖不一致，或提供给展开的调色板与引用不符 |
| `palette-index-out-of-range` | 展开时不透明像素的索引不小于调色板条目数 |
| `unmapped-character` | 查找的码位不在字符映射中 |

### 协议变化

- `IMPORT_STAGES` 变为 `identify-source`、`convert-graphics`，`IMPORT_PROTOCOL_VERSION` 递增。双方版本不符时，按 P2-04 的握手规则在发送文件之前失败。
- **阶段顺序：** 阶段只能按 `IMPORT_STAGES` 的顺序前进。`convert-graphics` 的进度只能出现在 `identified` 之后；进入后续阶段后，不能再出现较早阶段的进度。违反时，持有者报 `protocol-error@message.stage`。
- **进度：** `readBytes` 跨阶段累计、不减少。每个阶段开始时发送一次进度，之后每次端口读取完成发送一次。
- **用量：** `finished.usage` 是已验证来源的最终读取用量与转换用量逐维相加的完整预算记录。
- **组：** 本任务的作业不发送 `group` 消息，`finished.groups` 为空。
- 消息形状与 DTO 语法不变；新增 code 只是新的 token。

### 持久化与兼容

- 本任务不读写 IndexedDB 或 localStorage，也不定义缓存键。
- 三类 payload 的 schema 均为 1。读取器拒绝未知 schema，因此旧缓存中不兼容的 payload 会在消费时被拒绝，需要重新导入。P2-10 只核对身份与哈希，不解读 payload。
- schema 不变而转换结果字节变化时（例如增加一段有证据的字符映射），须递增生产 `ConverterVersion`，使缓存键随之变化。该 token 由首个装配组结果的任务（P2-06 或 P2-07）定义；在此之前，本任务的 payload 不进入缓存。
- 展开得到的 RGBA 与 GPU 对象都不缓存。

## 技术决定

用户在请求本 spec 时说明，需要回答的问题直接采用最推荐的答案。以下决定按此记录；整个契约仍须用户明确批准（见[审批](#审批)）。

1. **紧凑索引、独立调色板、消费时展开：** 按总计划 §8，缓存只存索引像素与调色板，RGBA 由消费者按需展开。TEX 的源调色板颜色得以保留；U-028 的光照规则若需要原始颜色，P3 不必重新导入。
2. **调色板绑定必须显式声明，最近色只在展开时计算：** 不按“没有调色板就用 DATA”猜测。TEX 映射到最近 DATA 色已确认，作为显示映射由来源映射证据声明。度量与并列规则尚无原版证据，实现的是暂定的项目规则，只在一个纯函数中实现；研究若修正它也只改一处，在确认前相关映射带 U-028。转换时把像素改写为 DATA 索引会丢失源颜色，因此不采用。
3. **飞行调色板每组一份：** P2-01 规定同一 Asset 只属于一个组，且组所拥有 kind 的依赖必须在本组内；`models` 与 `cockpit-hud-map` 都拥有 `palette`。因此唯一的 DATA 以两个 Asset 交付，payload 相同，每包多约 1 KB，无需修改 P2-01。
4. **透明与行序只依据编码和证据：** RLE 的透明来自编码，已确认；raw 默认不透明；颜色键与行反转必须声明并有证据。U-018/019 只涉及未入选的 BITM，不作为本任务前置。后续任务若选中依赖它们的 BITM，须在其 spec 中纳入相应研究，或修订本 spec。
5. **字形与字符映射分开，映射只含有证据的条目：** 映射以区间声明，取自 hud 中记录的事实，不复制原版数据表；查找失败显式报错。若研究证明映射只能来自 EXE 中的数据表，导入时提取需要扩展 P2-01 的来源定位（目前只表达 IMFAT 条目），须先修订并批准相应 spec。
6. **编码 1 不支持：** 切片定义中没有已知依赖 ANIM 的角色。P2-06 若证明弹丸、导弹或碎片依赖 ANIM，修订本 spec（新增 S/AC）后再实现，图像解码仍只在一处。
7. **结构限值分为格式规则与安全上限，生产份额只覆盖本任务的 Asset：** 切片的图像集合由 P2-06/07 选定，本任务不虚构图像像素总量。256 项调色板、每行 1 字节的字形宽度、字体表长 4 + 256 × 高与 3 个 CCKD 字库是已确认的格式规则（字形数见技术决定 14）；图像 640×480 与字体高 8 是本任务批准的安全上限，依据 HI 画幅与观察尺寸，由 AC-14 在全部基准实例上核对。两类限值都在分配前拒绝异常输入。
8. **新增阶段，但本任务不发送组：** 只含调色板或字库的组必然不完整，持有者对不完整的组只保留诊断，发送没有意义。步骤结果在作业内按组分区，由 P2-06/07 合并进组清单，作业入口与协议都不另建。因此本任务对步骤结果的验收直接调用步骤，作业路径只验收阶段、用量与失败分类。
9. **转换错误扩展 `SourceError`，读取错误保持原样：** 转换失败是原版数据本身的问题，归 `source` 层；扩展 P2-03 的 code 与限值名联合，不新增错误层，P2-04 的 DTO 语法与消费者不变。图形阶段的读取失败仍是 P2-02 的光盘层或 P2-03 的来源层错误，其位置（条目编号、LBA）是已批准的结构位置，不在 Worker 边界改写；本任务新增的诊断才使用不含条目编号的 `graphics[…]` 位置。
10. **核验与转换共用步骤内读取：** 现有 `verifySourceMappings` 对每个定位单独读取，五个生产映射会让 DATA 与 CCKD 被重复读取，转换时还要再读。为核验增加可选的条目读取参数，与转换共用一个步骤内的读取；核验语义不变，条目字节在步骤结束时释放，不建立通用的封包缓存。
11. **生产字体取自 CCKD 10103：** 它是含地图边框 slot 2 的 HI 完整组，也是 P2-01 固定图形投影所用的组。10097 是否才是 HI 飞行实际加载的组仍属 U-029，映射记为高概率；改用时 Asset ID 不变。
12. **本地校验分两类：** 全量结构校验加固仓库已有的 nob-check，只输出计数；一次性研究脚本与输出放在被忽略的 `local/research/p2-05/`。
13. **不新增依赖，不需要 ADR：** 以上决定细化总计划 §3.3、§8、§12 与 [ADR-0015](../../../decisions/ADR-0015-source-module-structure.md) 的模块边界，不改变冻结决定，也不引入依赖（[ADR-0008](../../../decisions/ADR-0008-mit-and-dependency-licenses.md)）。
14. **每字形行数由声明给出（执行期修订）：** P2-05/12 的研究表明，4×6 表头为 4×6、表长为 4 + 256 × 6，但字形数据按每字形 8 字节排列，即 192 个 8 行字形（hud §1.1，高概率）。若按表头读作 256 个 6 行字形，字符映射无法表达。因此字体声明增加必填的 `glyphRows`，payload 记录每字形行数与字形数，转换只改变切分，不改变字节；8×8 表的 `glyphRows` 等于单元高。改为在转换时重排为 6 行字形会丢弃单元以外的行，违背逐位保留，因此不采用。payload 尚未进入缓存（生产 `ConverterVersion` 未定义），因此 schema 1 的布局直接修订，不递增版本。

## 验收标准

| ID | 可观察的通过条件 | 验证方法与所需证据 |
|---|---|---|
| AC-01 | **调色板：** 合成 DATA 块转换得到 256 项，分量 0、1、32、63 分别展开为 0、4、130、255。嵌入条目 (B, G, R) = (1, 2, 3) 得到 (3, 2, 1)；条目数 1 与 256 通过。DATA 块 767 或 769 字节、任一分量大于 63 → `invalid-payload`；嵌入条目数 257 → `limit-exceeded`（`paletteEntryCount`）；`palette` 子资源指向没有嵌入调色板的记录 → `subresource-not-found`。读取器对编码结果往返相等，并拒绝截断、尾随字节、条目数 0 或大于 256 | Node 表驱动测试，断言 code、位置与 `limit` |
| AC-02 | **解码与方向：** 使用非对称合成样本：3×2 raw，每像素索引不同；5×3 RLE，各行透明段的位置与长度不同，含全透明行和长度为 0 的首个透明段。规范索引逐像素等于“行优先、行 0 为首个存储行”的期望；RLE 掩码逐位相符，透明像素索引与行尾填充位为 0；raw 全不透明。声明 `reversed` 时行序恰好反转，未声明时不反转。修改源块不改变已有结果，结果可直接交给 `payloadTransferList` | Node |
| AC-03 | **源结构拒绝与先于分配：** 以下输入以 `invalid-payload` 拒绝：位深不为 8，保留字段不为 0，像素或调色板的指针与长度越出块，raw 长度不符，RLE 截断、越行或有尾随字节。编码 1 与 3 → `unsupported-encoding`。宽或高为 0、宽 641、高 481 → `limit-exceeded`，限值名与 `observed` 正确。声明 65535×65535 的记录只读取头部即被拒绝，不出现宿主 `RangeError`；预算拒绝后调用者的转换用量不变 | Node |
| AC-04 | **调色板绑定与索引：** 记录没有嵌入调色板且声明中没有绑定 → `invalid-declaration`，不使用 DATA；绑定到非调色板、别组或不在本步骤中的 Asset → `invalid-declaration`。16 色调色板下出现不透明索引 16 → `palette-index-out-of-range`，同一索引出现在透明像素上时不报错。payload 引用的调色板与描述符依赖完全一致；构造的不一致输入由读取器报 `binding-mismatch` | Node |
| AC-05 | **展开与最近色：** `direct` 展开中，每个不透明像素的 RGBA 等于所绑定调色板的条目、alpha 为 255，透明像素为 (0, 0, 0, 0)。`nearest` 展开等价于先把源调色板逐项映射到目标调色板再查表；合成用例覆盖颜色完全相同、唯一最近、距离相等（取较小索引）三种情况。不透明像素的颜色都属于显示所用的调色板（不对索引插值）。同一输入重复展开逐字节相同；提供的调色板与引用不符 → `binding-mismatch` | Node |
| AC-06 | **颜色键：** raw 图像声明颜色键 k 时，索引为 k 的像素变为透明（索引为 0，掩码位为 0），其他像素不变；对 RLE 图像声明颜色键 → `invalid-declaration`；未声明时不产生透明 | Node |
| AC-07 | **字体：** 非对称合成字形（各行不同）证明 bit 7 为最左、行 0 在上，字形逐位保留，包括单元宽度以外的位。4×6 与 8×8 通过；4×6 表声明 `glyphRows` 8 时得到 192 个 8 行字形，字节与源表相同，按字形数扣除预算；`glyphRows` 缺失、小于单元高、为 9 或不能整除 256 × 高，以及映射的字形不小于字形数 → `invalid-declaration`；宽 0 或 9、高 0 或 9 → `limit-exceeded`；表长不符 → `invalid-payload`。CCKD 字体目录项数不为 3 → `invalid-payload`；`fonts/3` → `subresource-not-found`；预期单元与实际不符 → `geometry-mismatch`。字符映射按码位升序且无重复：查找已映射的码位得到声明的字形，未映射的码位报 `unmapped-character`，即使同码位存在字形也不回退；区间重叠或越界 → `invalid-declaration` | Node |
| AC-08 | **确定性与读取器：** 同一输入与声明得到逐字节相同、SHA-256 相同的三类 payload。读取器接受编码器的全部输出，拒绝截断、尾随字节、未知 schema、字段越界、非零填充位与透明像素的非零索引。描述符的 `payloadIdentity` 与实际字节一致，交给 P2-01 的 `validateGroup` 时没有 `payload-mismatch` | Node |
| AC-09 | **来源状态与步骤结果：** 在合成映射表上，整条目映射经 P2-03 核验后为 `verified`；含 `palette` 或 `fonts/<i>` 的映射只在转换成功后为 `verified`。任一转换失败，整个步骤失败且不输出结果。步骤结果按资源组分区；描述符、payload 与来源状态都按 Asset ID 升序、一一对应，不含定位、条目编号或原版字节。两个飞行调色板的 payload 字节相同、ID 不同、各在本组。用步骤输出加上满足其余角色的合成 Asset 组成的 `cockpit-hud-map` 组，经 `validateGroup` 得到 `group-complete` | Node |
| AC-10 | **预算与读取：** 结构限值与生产份额以常量导出，并与[限值与预算](#限值与预算)一致。总量恰等于限值时通过；超出任一维度 → `budget-exceeded`，带维度、`limit` 与 `observed`，被拒绝的扣除不改变转换用量、不产生部分结果。读取已发生后转换才被拒绝时，已发出的读取仍计入 `sourceReadBytes`，已转换的结果全部丢弃。映射核验与转换共用步骤内读取：两个映射共用的条目与被多个 Asset 使用的条目都只物理读取一次，可由计量端口的读取次数与字节断言；未传入步骤内读取时，P2-03 现有的核验测试照常通过。转换用量的 `sourceReadBytes` 为 0，`finished.usage` 等于最终读取用量与转换用量逐维之和 | Node，使用计量端口 |
| AC-11 | **协议与作业：** `IMPORT_STAGES` 为 `identify-source`、`convert-graphics`，协议版本已递增，版本不符时在发送 `start` 之前失败。成功作业的消息顺序为：识别进度 → `identified` → 至少一条 `convert-graphics` 进度 → `finished`，`readBytes` 不减少，`finished.groups` 为空。持有者对识别之前的 `convert-graphics` 进度、图形阶段之后的识别进度报 `protocol-error@message.stage`。失败分三类分别验证：识别失败保持 P2-04 的现有结果；图形阶段的读取失败保持 `disc` 或 P2-03 `source` 层的原 code 与位置；转换失败为 `source` 层，code 与位置符合[错误码](#错误码)。三类失败的快照都不含部分结果 | Node，使用结构化克隆端口与真实的宿主和持有者 |
| AC-12 | **真实 Worker：** 在 development 项目中，真实 Chromium 模块 Worker 经测试专用入口运行生产作业与图形步骤，输入为按生产映射结构放置合成条目的合成光盘。成功时 `finished.groups` 为空，`finished.usage` 的 `assets`、`paletteEntries`、`glyphs` 分别为 5、512、704（256 + 256 + 192，执行期修订，见技术决定 14），`payloadBytes` 等于各 payload 字节之和。损坏的合成字体使作业以 `source` 层 `invalid-payload` 失败。在收到首条 `convert-graphics` 进度时取消：状态为 `cancelled`，Worker 终止，之后状态不再改变 | `pnpm test:e2e <用例> --project=development` |
| AC-13 | **本地基准（生产路径）：** 在开发者机器上用本地基准镜像，分两部分验证：<br>- **步骤结果：** 在 Node 中经产品入口打开已验证来源，直接调用生产图形步骤。得到[生产 Asset](#生产-asset-与来源)中的 5 个 Asset，`models` 与 `cockpit-hud-map` 两个分区的数量正确，字库单元与声明一致；两次运行每个 payload 的 SHA-256 相同；读取字节与各维用量不超过份额。<br>- **作业路径：** 经 Worker 的作业、宿主与持有者模块处理同一镜像。阶段顺序正确，作业以 `finished` 结束，`groups` 为空，`usage` 的转换维度与直接调用步骤时相同 | 本地 Node 脚本；脚本与输出留在被忽略的 `local/research/p2-05/`，证据只记录命令、计数、判定与是否一致 |
| AC-14 | **本地全量结构校验：** 加固后的 `tools/nob-check.ts` 经同一套转换校验处理本地基准 `SR.NOB`。59 个 TEX、28 个 BITM、3 个 MFDD 的全部图像记录，3 个 CCKD 的全部字体表，以及 DATA，都通过结构校验；没有嵌入调色板的记录只做结构与 256 色上界校验。有嵌入调色板的图像，不透明像素索引都小于条目数。输出只有计数与失败原因。任何实例被拒绝时本项不通过，须按证据修订本 spec，不放宽为静默接受 | 本地运行该工具，记录命令与计数 |
| AC-15 | **最近色研究（U-028 颜色部分）：** 本地研究先尝试以 EXE 证据确定原版的最近色度量与并列规则；取得时按证据实现，并在 textures 中标为已确认。未取得时，textures 与 U-028 把实现规则记为暂定（不高于高概率），并核对全部 59 个 TEX 的嵌入调色板：在研究记录中固定的候选规则下（至少包括实现规则与 6 位 VGA 空间中的同类规则）分别求最近的 DATA 条目，报告距离并列与候选之间不一致的条目数，并逐一列出这些歧义条目（TEX 条目与调色板序号），标为未确认。经生产展开路径复现 textures §3 记录的玩家座机三张贴图在截图中的颜色出现计数，只作一致性参考，不作为度量证据。不以候选之间一致来宣称原版规则已确认 | 本地研究脚本与已有的本地截图；文档审阅 |
| AC-16 | **字符映射研究（U-030 字体部分）：** hud 记录 4×6 字库码位到字形的机制、置信度（至少高概率）与证据类型：EXE 的文本绘制路径、原版截图中已知文字的逐像素匹配，或仅凭字形辨认（最多高概率）。8×8 字库的映射只扩展到有证据的码位。记录三个字库在单元宽度以外是否有置位；若有，在 U-030 中登记绘制宽度语义为未确认。生产字体 payload 的映射条目与文档逐项一致，没有无证据条目，U-030 状态随之更新。机制未达到高概率，或证明需要从 EXE 提取数据表时，本项保持 blocked，不以空映射冒充完成 | 本地研究；文档与代码常量对照审阅 |
| AC-17 | **边界、隐私与工程：** `content/` 的新模块不导入 `original-data`、DOM、Node 或 Three.js；`original-data` 的转换不使用 DOM。本任务产生的转换诊断、展开与查找错误不含原版字节、条目编号、偏移、文件名或宿主路径；继承的读取与识别错误保持 P2-02/03/04 已批准的形状。nob-check 只输出结构计数与失败原因。`workers/` 仍不使用网络 API。没有新依赖，锁文件不变。`pnpm check`、`pnpm check:original` 与聚焦 E2E 通过 | 命令输出、依赖与锁文件 diff、源码与边界检查 |
| AC-18 | **文档：** textures、hud 与 unknowns 更新 AC-15/16 的事实与置信度，并像 [imfat §6](../../../original/formats/imfat.md#6-observed-maxima-against-the-readers-limits-confirmed) 那样记录本地全量校验的观察最大值。源码结构、工程约定与工具指南记录新模块、payload 字节布局、阶段与协议版本、限值、错误码与命令。`tasks.md` 只更新导航。文档中没有原版内容 | 文档链接与元数据检查、最终 diff 审阅 |

## 验证策略

- **单元/契约测试：** 在新模块旁新增 Node 环境的 `*.test.ts`：
  - 覆盖 AC-01 至 AC-10 的正常路径、边界与每个错误码；
  - 合成样本由代码生成，包括非对称图像、透明、颜色键、字形、映射区间、并列最近色以及 65535×65535 的伪造头部；
  - 继续让 [payloads.test.ts](../../../../src/original-data/payloads.test.ts) 覆盖保留的研究用途，或随加固同步迁移。
- **Replay/一致性：** 不涉及 Core 世界、tick 或 replay。转换与展开的确定性由 AC-08 与 AC-13 的逐字节比较证明。
- **Worker：**
  - Node 中经结构化克隆端口、真实宿主与持有者验证阶段顺序、用量合并，以及识别失败、图形阶段读取失败与转换失败三类分类（AC-11）；
  - 浏览器中扩展现有的测试专用入口，在 development 项目运行真实模块 Worker（AC-12）；合成光盘按生产映射的路径与条目结构放置生成内容；
  - 作业不发送组，步骤结果由直接调用步骤的测试验证（AC-09、AC-13）。
- **实机/原版对照：**
  - AC-13 至 AC-16 在开发者机器上使用本地基准镜像与已有的本地截图；
  - 输出、脚本与截图都留在 `local/`，证据只记录命令、计数、判定与 U 项变化；
  - 最终的视觉保真判定仍归 P2-12，本任务不以合成截图代替原版对照。
- **工程检查：**
  - 迭代时运行 `pnpm exec vitest run src/content src/original-data src/workers src/app/import` 与聚焦 E2E；
  - 完成前运行 `pnpm check`、`pnpm check:original`，以及 `pnpm test:e2e <用例> --project=development`；
  - 不要求 CI 或部署。
- **文档检查：** front matter、相对链接与锚点、S/AC 唯一性；用 `git status` 与 diff 确认没有 `local/` 内容、原版字节或无关的阶段状态变化。

## 风险与恢复

风险等级：**中。** 本任务首次在导入路径上解码不可信图像并按其尺寸分配内存，同时递增 Worker 协议版本；但没有持久化数据，回退只需移除新增模块并恢复协议版本。

- **研究可能得不到结论：**
  - 4×6 映射若无法达到高概率，AC-16 保持 blocked，其余 AC 可以完成。P2-07 仍依赖整项 P2-05，因此该阻塞须在 goal 中显式记录，由用户决定是否调整索引依赖，不以猜测的映射推进。
  - 若映射只能来自 EXE 中的数据表，按技术决定 5，先修订来源定位契约。
- **最近色规则未确认或存在歧义：** 没有 EXE 证据时，实现规则只是暂定的项目规则，使用 `nearest` 的映射带 U-028，置信度不高于高概率，最终由 P2-12 的本地对照检验。歧义条目只影响选中它们的 TEX：P2-06 若选中，其映射为未确认并阻塞完整性，须在其 spec 中处理或取得 EXE 证据后修订规则；本任务只列出，不定案。
- **结构限值过紧：** 图像 640×480 与字体高 8 是安全上限而非格式规则。若后续选中的图像超出这些限值，转换明确失败；修订须附观察证据，不静默放宽。AC-14 先用本地全量校验验证现有实例都在范围内。
- **改动 P2-03 的核验与错误类型：** 为共用读取而扩展 `verifySourceMappings`、为新 code 扩展 `SourceError`，可能影响 P2-03 的既有行为。两者都是追加式扩展；不传入步骤内读取时核验行为不变，P2-03 的现有测试作为回归。
- **后续切片依赖未支持的类型：** ANIM、无调色板的 BITM 或地图边框调色板若被证明是切片必需，按技术决定 4、6 修订对应 spec，期间相关验收保持未完成。
- **协议版本与并行任务：** P2-08/09 也会追加阶段并递增版本。按批次顺序合入，各自同步 `IMPORT_STAGES`、持有者与 E2E；版本握手会拦截不一致的组合。
- **共用的生产映射与作业文件：** 与 P2-08/09 并行时可能冲突。各任务只追加自己的 Asset 与步骤，不另建映射契约或作业入口；不建议多个 agent 同时修改这些文件。
- **字体来源组选错：** CCKD 10103 与 10097 的选择为高概率。P2-07 若证明应改用 10097，只改来源映射，Asset ID 与 payload 契约不变。
- **展开占用内存：** RGBA 是索引的 4 倍，但单张图像的上限为 640×480，且展开只在消费者需要时进行，不缓存。
- **恢复：** 没有存档或缓存数据需要兼容；payload schema 尚未被持久化消费。协议回退由版本握手拦截，下游测试随版本同步修订。

## 未决事项

无。用户要求需要回答的问题直接采用最推荐的答案，相关选择已记录在[技术决定](#技术决定)。AC-15 与 AC-16 的研究结论是执行期的验收条件，不是待定的契约选择；结论不足时按各自条款保持未完成。

## 审批

用户于 2026-10-05 明确批准本 spec。批准范围包括：

- S-01 至 S-13、AC-01 至 AC-18；
- payload 契约、图形转换声明、生产 Asset 与来源、步骤结果、限值与预算、错误码、协议变化、持久化与兼容；
- 技术决定 1 至 13。

生成时按“采用推荐答案”授权作出的选择，以及 review-spec 采纳的八项修正，随本次批准一并生效。

执行期修订（用户在调用 execute-goal 时授权按需修订 spec、goal 与 subtasks，并在 goal 执行记录中说明）：

- 2026-10-05 在[错误码](#错误码)与[行为与边界](#行为与边界)的位置语法中补充声明组整体的位置 `graphics.declarations`，并写明声明位置可带结构字段路径。行为、范围与验收标准不变。
- 2026-10-05（P2-05/12）字体增加每字形行数：S-03、[行为与边界](#行为与边界)、[payload 契约](#payload-契约)、[图形转换声明](#图形转换声明)、[生产 Asset 与来源](#生产-asset-与来源)、[限值与预算](#限值与预算)、技术决定 7 与新增的技术决定 14、AC-07 与 AC-12（实际字形用量 704）相应修订；生产份额不变。范围与其余验收标准不变。

详见 [goal 执行记录](./goal.md#执行记录)。
