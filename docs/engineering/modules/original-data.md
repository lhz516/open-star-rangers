---
type: guide
status: active
phase: all
updated: 2026-10-08
related: [ADR-0015]
---

# 原版数据模块说明

本文件是[源码结构指南](../source-structure.md)的模块分册，记录 `src/original-data/` 中已交付代码的当前 API 与契约要点。目录树、职责边界与 helper 归属以指南为准，行为契约以各任务 spec 为准；修改本模块代码的任务同步更新本文件。

[original-data/](../../../src/original-data/) 负责原版字节与格式、版本识别、解析与规范化转换；底层能力的导入边界见[工程约定](../README.md#lint-规则eslintconfigjs)。原版格式的合成测试数据由 [synthetic.test-support.ts](../../../src/original-data/synthetic.test-support.ts) 在代码中生成。

## 任务数据的定向解析

[P2-09/05](../../plan/p2/09/subtasks/05-scenario-parser.md) 在 [original-data/formats/](../../../src/original-data/formats/) 解析所选任务需要的 SCCT、SCEN 与 M2ID 条目。规则来自 [P2-09 spec 的源字段处理](../../plan/p2/09/spec.md#源字段处理)与限值表，格式事实见 [scenario](../../original/formats/scenario.md) 与 [hud §3](../../original/formats/hud.md#3-id-lists-confirmed-structure)。解析器只接收 `ArchiveEntryRead` 形状的已读条目与封包的 `DiscPath`，不打开文件或封包；读取由转换编排经已验证来源完成。按能力边界，这里只以类型导入封包与光盘模块。

- **数据块读取：** [payload-block.ts](../../../src/original-data/formats/payload-block.ts) 的 `PayloadBlock`：
  - 先按条目大小检查 `payloadEntryBytes`；`requireEntryBytes` 也可在读取前按目录项调用。
  - 指针只在重定位表登记的位置上有效：未登记的非零值为 `invalid-payload`，目标结构必须完整位于块内。反过来，登记的位置不得与解析器读取的任何数值、名称或保留字重叠，否则同为 `invalid-payload`。
  - 指针字段按两步判定：先校验登记与边界（`invalid-payload`），再判定用途；必须为空的指针字段由 `unsupportedPointer` 判为 `unsupported-payload`。
  - `{指针, 数量}` 数组先按 `payloadItems` 检查数量，再做边界检查，因此不按声明规模分配；空指针要求数量为 0；顶层数组不得与所在条目的头部重叠；非空指针配 0 个元素为 `unsupported-payload`。
  - 名称必须以 NUL 结尾，1–63 字节（超出为 `textBytes`，最多检查 64 字节）的可打印 ASCII；f32 必须有限。
- **记录：** [object-record.ts](../../../src/original-data/formats/object-record.ts) 读取 132 字节记录：
  - 重定位只能位于文档记载的指针字段；
  - +0x30、+0x4C 与保留字必须为默认值（前两者按指针的两步规则），+0x38 必须为 0；
  - 各引用字段的目标须按预期结构大小（编组 28、矩形 16、记录 132、事件触发头部 28 字节）完整位于块内，然后才判定是否为该结构的起点；
  - 种类转为位序号，多比特为 `invalid-payload`；
  - 规则输入原样保留，0 为 null；AI 掩码转为升序位序号；
  - 指针字段作为目标偏移交给所在结构解析。
- **SCEN：** [scen.ts](../../../src/original-data/formats/scen.ts) 的 `parseScenario` 返回 `ParsedScenario`：
  - 内容：扇区数、参考比例、名称备用池、生成矩形、声明与编组，声明与编组使用 `content/logic` 的类型；
  - 声明：段 1 记录按表序；模板与成员必须是段 1 记录的别名；
  - 引用转为序号：+0x3C 成员回指（须与列出它的唯一编组一致）、+0x44 生成矩形、+0x48 锚点与 +0x58 AI 目标；
  - +0x54 只核对它指向段 2 第一个元素且该事件触发没有生成配对；
  - 段 6 布局只交换第 0 个元素的 y/z，并核对原版循环越过表尾读取的计数字。
- **SCCT：** [scct.ts](../../../src/original-data/formats/scct.ts) 的 `parseCampaignTable` 校验每个组的槽位表头与限值，但只读取候选（默认 `CLASSIC_P2_SLICE.candidate`）槽位的 SCEN 条目 ID 与僚机记录；组或槽位超出表为 `subresource-mismatch`；僚机记录的引用与空间字段必须为零。
- **M2ID：** [m2id.ts](../../../src/original-data/formats/m2id.ts) 的 `parseModelIdList` 严格读取 MODL 条目 ID 列表；槽位为 0 的处理归机型绑定。
- **错误：** [source-error.ts](../../../src/original-data/source-error.ts) 为此追加 `invalid-payload`、`unsupported-payload`、`subresource-mismatch` 与限值名 `payloadEntryBytes`、`payloadItems`、`textBytes`。位置为 `archive:/路径#ID` 后接 `/名称[下标]` 形式的结构路径，`inLocationGrammar` 已扩展为接受这种形式；诊断不回显名称、数值或字节。
- **测试数据：** [formats.test-support.ts](../../../src/original-data/formats/formats.test-support.ts) 用 `BlockWriter` 在奇数偏移上布置结构，倒序写出重定位表，由规格生成合成 SCEN、SCCT 与 M2ID 数据块，并用 `buildImfat` 组成合成的 `SCENARIO.NOB` 与 `SR.NOB`。默认任务的形状与切片任务相同，但数值都是合成的；名称带 `MARKER`。

## 逻辑组转换

[original-data/conversion/](../../../src/original-data/conversion/) 把已解析的任务数据转换为 `logic` 组，规则见 [P2-09 spec](../../plan/p2/09/spec.md)：

- **机型与模型绑定：** [craft-binding.ts](../../../src/original-data/conversion/craft-binding.ts) 的 `bindCraftTypes(referenced, modelIds, location)` 是机型到 model Asset ID 的唯一生产绑定（[spec 的命名规则](../../plan/p2/09/spec.md#机型与模型绑定)）。
  - **输入：** 任务与僚机名单引用的机型，以及 M2ID 解析结果。
  - **输出：** `CraftTypeTable` 与按 Asset ID 排序的 `{ id, modelEntryId }`。阵营按玩家目标模式的种类掩码推导，`baseInteraction` 按交互种类掩码推导（“基地”含义为高概率），这两组掩码是写在转换器里的格式知识，注释链接权威记录。
  - **命名：** 按玩家、敌方、基地、其余友方的顺序命名每个 MODL，同类内按机型升序编号；同一 MODL 只有一个 ID，只允许同类机型或友方机型与玩家飞船共用。
  - **失败：** 玩家机型缺失、M2ID 槽位为 0 或越界、模型被不同类别共用为 `invalid-payload`，没有玩家相对阵营的机型为 `unsupported-payload`，位置为 M2ID 的槽位路径。
  - **[P2-06](../../plan/p2/tasks.md#p2-06-切片模型与材质转换) 必须用这一绑定命名模型 Asset，不得另建表。**
- **生产来源映射：** [logic-sources.ts](../../../src/original-data/conversion/logic-sources.ts) 的 `LOGIC_SOURCE_MAPPINGS` 是 `logic` 组的生产映射表。它未绑定来源，三项都为 `likely` 与 `declared`，U 项与证据按 spec 的 Asset 表：
  - `data/craft-types`：`SR.NOB` 的 M2ID；
  - `data/wingman-roster`：SCCT 的 `wingmen` 子资源；
  - `mission/first-campaign`：SCCT 的候选槽位子资源（由 `CLASSIC_P2_SLICE.candidate` 生成）与 SCEN 条目。

  Asset 引用集中在 `LOGIC_ASSETS`，条目 ID 集中在 `LOGIC_SOURCE_ENTRIES`。
  - **步骤读取：** `logicEntryReader(source)` 是[图形转换](#图形转换)共用的步骤内读取 `stepEntryReader`，另带读取前钩子：在读取条目字节之前，按目录项大小检查 SCCT、SCEN 与 M2ID 的 `payloadEntryBytes`。经映射核验读取时，超限位置改写为映射路径。
  - **核验：** `verifyLogicSources(source, readEntry)` 只用同一个已验证来源及其步骤读取完成核验，因此映射只会由该来源的读取证实，每个条目只物理读取一次。步骤如下：
    1. 调用 `verifySourceMappings(table, source, readEntry)` 读取每个 locator，只把不含子资源的映射升为 `verified`；
    2. 从同一读取结果中以切片候选解析映射的 SCCT，核对子资源：候选槽位的 SCEN 条目 ID 必须是同一映射中的 SCEN 部件，僚机记录必须解析成功，所有子资源都在同一张 SCCT 中；
    3. 一致时升为 `verified`，否则在 `sources.mappings[i].parts[j].alternatives[k]` 报 `subresource-mismatch`。

  返回冻结的 `{ table, sources, campaign }`：`sources` 是 `assetSourceStates` 推导、绑定指纹的来源状态，`campaign` 是解析结果，供转换复用。
- **转换步骤：** [convert-logic.ts](../../../src/original-data/conversion/convert-logic.ts) 的 `convertLogic(source, limits, usage)` 产出 `logic` 组草稿：
  1. 以 `logicEntryReader` 与 `verifyLogicSources` 核验映射并解析 SCCT；
  2. 从同一步骤读取取得映射的 SCEN 与 M2ID 并解析；
  3. 以 `bindCraftTypes` 绑定任务与僚机名单引用的机型；
  4. 核对跨 Asset 的一致性：任务恰有一条记录为玩家机型，僚机选项都不是玩家机型，否则为 `unsupported-payload`；
  5. 组装三个 payload。`mapFrame` 按 executable 的世界扇区网格与战略地图投影记录生成：+x 向右，−y 向上，中心为原点，`halfExtent` 为扇区数 × 比例 ÷ 2；
  6. 按 Asset ID 升序编码，并生成描述符与 payload 记录。

  返回冻结的 `{ draft, usage }`，`usage` 为起始用量加上本步骤的转换用量。`draft` 是 `GroupDraft`（描述符、各占独立 buffer 的 payload、来源状态），身份由调用方以 [manifest-identity.ts](../../../src/content/manifest-identity.ts) 写入。生产身份基础是 [converter-version.ts](../../../src/original-data/conversion/converter-version.ts) 的 `productionIdentityBasis(sourceFingerprint)`：来源为 `original-import`，带 P2-01 的 schema、切片常量与 `PRODUCTION_CONVERTER_VERSION`。
- **预算：** 同一模块的 `PRODUCTION_LOGIC_SHARE` 是 logic 步骤的生产份额：`assets` 8、`dependencyEdges` 32、`payloadBytes` 1,048,576、`missionObjects` 256、`missionReferences` 4,096，其余维度为 0。与图形步骤一样，作业把份额加到读取限值上作为 `limits`，本步骤在先前步骤的转换用量 `usage` 之上扣除；起始用量含 `sourceReadBytes` 时为 `invalid-budget-value`。
  - **计量时机：** 每个 Asset 分两次计量：Asset、依赖边与两类任务计数在复制与编码 payload 之前计量；`payloadBytes` 由 `encodeLogicPayload` 的 `reserve` 回调在得到规范字节数之后、检查 payload 上限与分配字节之前计量。
  - **计数规则**（spec 的[限值与预算](../../plan/p2/09/spec.md#限值与预算)）：
    - `missionObjects`：任务声明与僚机声明的总数；
    - `missionReferences`：每个声明的机型、放置矩形、锚点、编组与 AI 目标（非 null 时各计一次），编组的模板与每个成员位置，每个机型到 model 的引用，以及任务的 2 个、僚机名单的 1 个 Asset 引用。
  - **超限：** 与图形步骤相同，报 `budget-exceeded`：`limit` 为维度名、上限与观测值，总量超出安全整数时观测值为 null。位置是该 Asset 的来源条目，僚机名单为 SCCT 的 `/wingmen`。被拒绝的扣除不改变用量。
  - **可达性：** 只用本份额时，结构限值下只有 `missionReferences` 与 `payloadBytes` 可能超限。

## 原版来源映射

[source-mapping.ts](../../../src/original-data/source-mapping.ts)（[P2-01/03](../../plan/p2/01/subtasks/03-source-mapping-boundary.md)）只属于 `original-data`，规范内容消费者不能导入（见[工程约定](../README.md#lint-规则eslintconfigjs)）：

- `readSourceMappingTable` 验证来源映射表：每个规范 Asset 映射到一个或多个部件，部件之间为“全部需要”（例如任务的 SCEN 与 SCCT 记录），同一部件内的多个 locator 为“精确等价，任取其一”（例如字节完全相同的别名条目）。locator 是判别形式：
  - **封包条目**（`ArchiveEntryLocator`）：光盘相对的 8.3 大写路径（与光盘读取共用 [disc-path.ts](../../../src/original-data/disc/disc-path.ts) 的 `DiscPath` 规则）、IMFAT entry ID/type 与可选子资源路径。
  - **可执行文件区域**（`ExecutableRegionLocator`，[P2-06/15](../../plan/p2/06/subtasks/15-slice-definition-region-locator.md)）：`entry` 为 null，`subresource` 为规范的 `le/<对象 1–8>/<小写十六进制偏移>/<字节数 1–65,536>`，只允许 `REGION_FILES` 中的 `MAIN/SRANGERS.EXE`。`data` kind 可映射到区域；`image` kind 只能在封包条目部件之后另加区域部件（P2-01 spec 2026-10-08 修订，用于 SNIP 帧的颜色表），只有区域的图像映射为 `invalid-source-mapping`。
    - 区域部件只能有一个备选，同一映射内条目排在区域之前，区域按对象、偏移与字节数的数值排序；
    - `executableRegion` 解析出数值；
    - 只处理封包条目的转换用 `archiveLocator` 或类型守卫收窄。

  多个 Asset 可以共用同一 locator。每条映射还记录置信度（confirmed/likely/unconfirmed，非 confirmed 必须链接 U 项）、`docs/original/` 证据及 `declared`/`verified` 解析状态。表级 `sourceFingerprint` 在 P2-03 提供前为 null，此时不允许出现 `verified`。
- `diagnoseSourceMappings` 返回稳定排序、深度冻结的安全诊断，只含规范 ID、结构路径和 U 项，不含 locator 值或原版内容。所有映射都检查条目类型与 Asset kind 是否兼容（`SOURCE_ENTRY_TYPES` 依据 [imfat §5](../../original/formats/imfat.md#5-entry-types) 与 [textures §2](../../original/formats/textures.md#2-image-record-36-bytes-confirmed)；P2-07 的 2026-10-08 修订为 image 加入 SNIP、为 data 加入 DIAG）。区域对 data 与 image 都不算类型冲突。必需 Asset 另报缺失、未确认和未验证；likely 不报，但其 U 项保留在映射上。`assetSourceStates` 直接由映射事实为每个已映射 Asset 推导一条不含 locator 的状态（严重度依次为条目类型冲突 conflict、unconfirmed、未验证 unverified，否则 verified），连同表级来源指纹一起交给 content 的完整性验证。

- `verified` 由 P2-03 产生：[source/verify-source-mappings.ts](../../../src/original-data/source/verify-source-mappings.ts) 的 `verifySourceMappings(table, source)` 在已验证来源中逐个核验 locator，返回绑定来源指纹的新表，详见[版本识别与已验证来源](#版本识别与已验证来源)。

针对性检查为 `pnpm exec vitest run src/original-data src/content tools/engineering-boundaries.test.ts`。

## 光盘镜像读取

[P2-02](../../plan/p2/02/spec.md) 的纯读取链按需读取开发者的 CloneCD 文件组，整个镜像从不一次性载入。支持的布局、限值、错误码与报错优先级以 spec 为准，这里只说明模块分工与对外 API：

- **端口：** [io/byte-source.ts](../../../src/original-data/io/byte-source.ts) 只含 `ByteSource` 接口（`byteLength` 与 `read(offset, length)`），不导入任何模块。它是 `src/platform` 唯一能以纯类型方式导入的 `original-data` 模块，见[工程约定](../README.md#lint-规则eslintconfigjs)。
- **入口：** [disc/disc-image.ts](../../../src/original-data/disc/disc-image.ts) 的 `openDiscImage(files, options)` 接受 `{ name, source }` 文件组，以及可选的 P2-01 预算记录 `limits` 与取消探针 `cancellation`（`AbortSignal` 即可）。返回冻结句柄：
  - `volume`：`{ sectorCount, volumeSectors }`；
  - `lookup(path)`：返回冻结、可结构化克隆的 `DiscEntry`；
  - `openFile(path)`：返回绑定镜像的 `DiscFile`，其 `read(offset, length)` 返回新的 `Uint8Array`，底层是独占的 ArrayBuffer；
  - `usage()`：十二维用量快照。
  - 句柄持有端口，不可结构化克隆，也不关闭调用方的源；内部不建立缓存。
  - 公共类型 `DiscInputFile`、`OpenDiscOptions`、`DiscEntry`、`DiscFile`、`DiscImage` 都从该入口导出。
- **错误：** 所有失败都以 [disc-error.ts](../../../src/original-data/disc/disc-error.ts) 的 `DiscReadError` 拒绝，`toData()` 给出 `{ code, location, reason, limit }` 纯数据 DTO，不含字节、宿主名或记录原名。
- **内部模块（消费者只用上面的入口）：**
  - [source-reader.ts](../../../src/original-data/disc/source-reader.ts)：受控端口读取、`sourceReadBytes` 计量、取消，以及端口返回值核对；
  - [clone-cd.ts](../../../src/original-data/disc/clone-cd.ts)：文件组配对、尺寸门禁与 `.ccd` 解析；
  - [raw-sector.ts](../../../src/original-data/disc/raw-sector.ts)：MODE1 原始扇区头部校验；
  - [iso9660-record.ts](../../../src/original-data/disc/iso9660-record.ts)、[iso9660-volume.ts](../../../src/original-data/disc/iso9660-volume.ts)、[iso9660-directory.ts](../../../src/original-data/disc/iso9660-directory.ts)：目录记录、卷描述符与路径解析；
  - [disc-path.ts](../../../src/original-data/disc/disc-path.ts)：与来源映射共用的 `DiscPath` 规则；
  - [file-range.ts](../../../src/original-data/disc/file-range.ts)：分段范围读取。
- **平台适配：** [platform/files/blob-byte-source.ts](../../../src/platform/files/blob-byte-source.ts) 的 `BlobByteSource` 用 `Blob.slice` 与 `arrayBuffer()` 实现端口，页面与 Worker 中的 `File` 都适用。越界请求在切片前拒绝；Blob 读取不可中止，取消由读取方保证不再发出、也不发布结果。Node 侧的端口实现是 [tools/node-byte-source.ts](../../../tools/node-byte-source.ts)，本地核对 CLI 是 [tools/disc-check.ts](../../../tools/disc-check.ts)，用法见[工具指南](../../guides/tools.md#光盘镜像核对)。
- **测试数据：** 合成 CloneCD 描述、原始扇区、卷描述符与目录由 [synthetic.test-support.ts](../../../src/original-data/synthetic.test-support.ts) 生成，按需生成扇区的镜像端口不分配整盘；光盘测试共用的纯辅助在 [disc.test-support.ts](../../../src/original-data/disc/disc.test-support.ts)。

针对性检查为 `pnpm exec vitest run src/original-data src/platform/files tools/engineering-boundaries.test.ts`。

## 封包读取

[P2-03](../../plan/p2/03/spec.md) 校验 IMFAT（`.NOB`）封包。支持的格式、限值、错误码与报错优先级以 spec 为准，格式事实见 [imfat](../../original/formats/imfat.md)：

- **结构规则：** [archive/imfat-rules.ts](../../../src/original-data/archive/imfat-rules.ts) 是内存解析与按需读取共用的纯规则：
  - `readImfatHeader` 校验文件头，条目数超过 `MAX_ARCHIVE_ENTRIES`（4,096）时在读取目录前拒绝；
  - `readImfatDirectory` 校验整个目录：保留字、类型标签、递增 ID、块大小（`MAX_ENTRY_BYTES`，4 MiB）、重定位个数，以及无空隙、无尾随字节的连续布局；
  - `readImfatRelocations` 校验条目的重定位位置与存储的指针，允许非对齐与无序位置，拒绝重叠。
  - 目录项类型 `ImfatEntry` 定义在这里，[imfat.ts](../../../src/original-data/imfat.ts) 原样再导出。
- **按需读取：** [archive/archive-reader.ts](../../../src/original-data/archive/archive-reader.ts) 的 `openImfatArchive(file)` 在 P2-02 的任意 `DiscFile` 上打开封包：
  - 先读 24 字节文件头；条目数超限时，在读取目录前拒绝；再用一次范围读取取得整个目录。
  - 返回冻结句柄：`path`、按 ID 升序的冻结目录项、同步的 `entry(id, type?)`、异步的 `read(id, type?)`。
  - `read` 用一次范围读取取得数据块与重定位表并校验重定位，返回冻结的 `{ entry, bytes, relocations }`；`bytes` 恰为数据块，是独占的新缓冲。
  - 句柄只保留目录，不缓存字节，每次读取都经镜像句柄计量、检查取消；`DiscReadError` 原样传递。
  - 参数非法时返回 `invalid-request`，ID 不存在返回 `entry-not-found`，类型不符返回 `entry-type-mismatch`。
  - 它可以打开未经版本识别的文件，属于底层能力；产品代码经已验证来源打开封包，边界见[工程约定](../README.md#lint-规则eslintconfigjs)。
- **内存解析：** [imfat.ts](../../../src/original-data/imfat.ts) 的 `parseImfat`、`entryData`、`entryRelocations` 供研究工具与测试使用，规则与错误同上；辅助函数只接受从同一字节数组解析出的条目。
- **错误：** 失败都抛出 [source-error.ts](../../../src/original-data/source-error.ts) 的 `SourceError`。它的 `toData()` 与 P2-02 的 DTO 形状相同，位置形如 `archive[:/路径]`，可后接 `[i]`、`#ID` 或 `#ID.relocations[k]`，只回显通过语法规则的类型标签。转换器追加的 code 与限值名见[原版格式转换](#原版格式转换)。P2-03 的全部位置都属于 spec 的封闭语法；[source-error.test-support.ts](../../../src/original-data/source-error.test-support.ts) 的 `inLocationGrammar` 按 spec 定义该语法（光盘路径部分复用 `isDiscPath`），各模块测试的失败辅助逐个核对。
- **测试数据：** [archive.test-support.ts](../../../src/original-data/archive/archive.test-support.ts) 提供共用的正负样本表，内存解析与按需读取用同一张表核对一致性。[disc.test-support.ts](../../../src/original-data/disc/disc.test-support.ts) 的 `syntheticFileDisc` 按光盘路径放置任意文件（字节或按需生成的内容），生成完整的合成 ISO9660 树，并可调整文件位置与 `.ccd` 行尾。

## 版本识别与已验证来源

[P2-03](../../plan/p2/03/spec.md) 按文件白名单识别基准版本，覆盖范围与指纹算法以 spec 为准：

- **白名单：** [source/source-catalog.ts](../../../src/original-data/source/source-catalog.ts) 的 `readSourceCatalog` 严格读取 `{ versionId, files }`：
  - 版本 token 为小写；
  - 文件按 ASCII 路径序严格升序，每项为 `{ path, byteLength, sha256 }`；
  - 非法时在结构路径返回 `invalid-catalog`，不回显值；文件列表缺失、不是数组或为空时，位置为 `catalog`。

  `PRODUCTION_CATALOG` 是唯一的生产白名单（`star-rangers-1995-cd`，8 个文件）。[tools/source-catalog.test.ts](../../../tools/source-catalog.test.ts) 核对它与 [manifest](../../original/manifest.md#游戏文件光盘-main-与-flics) 一致。
- **指纹：** `sourceFingerprint(catalog)` 对规范 ASCII 文本计算 SHA-256，返回 `source:sha256:<hex>`；版本 ID 不参与。生产指纹由测试固定。指纹字符串只表示形状，来源证明来自对实际文件的识别。
- **识别：** [source/identify-source.ts](../../../src/original-data/source/identify-source.ts) 的 `identifySource(disc, catalog)` 在已打开的 P2-02 镜像上识别：
  - 先按路径序核对每个覆盖文件存在且大小一致：P2-02 的 `path-not-found`、`wrong-entry-kind`，目录，以及大小不符，都报 `unsupported-version`，位置为 `file:/路径`；
  - 再按路径序从偏移 0 起分段（每段最多 `HASH_SEGMENT_BYTES`，即 4 MiB）计算 SHA-256，用完即丢；不符时同样报 `unsupported-version`，之后的文件不再读取；
  - 白名单之外的文件从不查找或读取；
  - 光盘层错误（坏扇区、预算、取消）原样传递。
  - 它接受任意白名单，属于底层能力。
- **已验证来源：** 识别成功返回冻结的 `VerifiedSource`：
  - `identity` 为冻结、可结构化克隆的 `{ versionId, fingerprint, files }`；
  - `openFile(path)`、`openArchive(path)` 只接受覆盖路径，其他合法路径报 `path-not-covered`，非法路径报 `invalid-request`，都不发生读取；
  - `usage()` 与镜像句柄共用计量。
- **产品入口：** [source/open-verified-source.ts](../../../src/original-data/source/open-verified-source.ts) 的 `openVerifiedSource(files, options)` 先用 `openDiscImage` 打开文件组，再固定用 `PRODUCTION_CATALOG` 识别，不接受自定义白名单；同时导出产品需要的类型。P2-04 起，产品代码只经它取得原版字节。
  - 默认 `sourceReadBytes` 上限等于输入总量；基准盘约 174 MB，识别约读取 17 MB 原始扇区，余量留给后续转换。
- **映射核验：** `verifySourceMappings(table, source)` 先用 `readSourceMappingTable` 读取映射表（P2-01 错误保留原 code/path）；表已绑定其他指纹时，在 `sources.sourceFingerprint` 报 `fingerprint-mismatch`。之后：
  - 按映射、部件、备选的顺序读取每个 locator 的条目：路径须在覆盖范围内，封包能打开，条目存在且类型一致，重定位有效。大于 u32 的 ID 报 `entry-not-found`。本任务产生的错误都改用 `sources.mappings[i].parts[j].alternatives[k]` 为位置，不回显 locator 值；`DiscReadError` 原样传递。
  - 精确等价的备选须与第一个备选的 `flags`、大小、重定位个数、块字节和重定位位置都相同，否则报 `alternatives-differ`。
  - 区域 locator 只按已验证身份的文件清单核对文件已覆盖，不读取任何字节，未覆盖时报 `path-not-covered`，位置为结构路径。
  - 返回绑定本来源指纹的新冻结表：条目级映射为 `verified`；含子资源或区域 locator 的映射一律为 `declared`，由理解该 payload 的转换任务核验。
  - 每个封包的目录在一次核验中只读一次，条目字节不跨部件保留；首个错误终止核验，不修改输入。
  - 可选的第三个参数 `readEntry`（`EntryReader` 类型）替换模块内部的默认读取，供转换步骤让核验与转换共用条目读取（P2-05）；错误位置的改写、等价备选核对与结果都不变。公开模块只导出这个类型，不导出读取封包的函数。
- **测试数据：** [source.test-support.ts](../../../src/original-data/source/source.test-support.ts) 的 `catalogFor` 按合成文件内容生成白名单，`syntheticVerifiedSource(files)` 用该白名单识别含这些文件与 1 MiB 不读取填充的合成光盘。[source-error.test-support.ts](../../../src/original-data/source-error.test-support.ts) 的 `sourceFailure(action, hidden)` 等待 `SourceError`，核对位置语法与隐私后返回不含原因的诊断。

## 图形转换

[P2-05](../../plan/p2/05/spec.md) 把原版的调色板、图像记录与字体转换为[图形 payload](./content.md#图形-payload)。`original-data/conversion/` 不属于任何能力族，只处理已读取的条目字节，封包经已验证来源取得（见[工程约定](../README.md#lint-规则eslintconfigjs)）。

- **源结构读取：** [source-graphics.ts](../../../src/original-data/conversion/source-graphics.ts)（[P2-05/03](../../plan/p2/05/subtasks/03-source-hardening.md)）是 DATA、36 字节图像记录、MFDD 记录列表与点阵字体表的唯一读取实现，格式见 [textures](../../original/formats/textures.md)、[cockpit](../../original/formats/cockpit.md) 与 [hud](../../original/formats/hud.md)。
  - `readDataPalette` 要求恰为 768 字节且分量不大于 63（不截断高位），按位复制展开为 8 位 RGB。
  - `readImageRecordHeader(block, offset)` 只读 36 字节头，依次校验位深为 8、+16 为 0、编码为 0 或 2（其余为 `unsupported-encoding`）、宽高与嵌入调色板条目数在 `GRAPHICS_LIMITS` 内（`limit-exceeded`，带限值名与观察值），以及调色板与像素范围在块内（不溢出的比较）。不按声明的规模分配，65535×65535 的头部只凭字段即被拒绝。
  - `decodeImageRecord(block, offset)` 与 `readEmbeddedPalette(block, offset)` 自己从块中重新读取并校验记录头，不接受调用者传入的头部，之后才分配：raw 要求数据恰为宽 × 高并复制；精灵 RLE 拒绝截断、越行与尾随字节，输出透明像素为 0 的索引与规范打包掩码。行序保持存储顺序。嵌入调色板按 BGR 读为 RGB，没有时为 `subresource-not-found`。调用者可先用 `readImageRecordHeader` 取得尺寸扣除预算，再解码。
  - `checkPaletteIndices(image, entryCount)` 拒绝索引不小于调色板条目数的不透明像素（`palette-index-out-of-range@…pixels`），透明像素不参与；转换器与 `tools/nob-check.ts` 共用它。
  - `readMfdRecordOffsets` 返回两个列表中记录的块内偏移：每个列表须整体落在块内（`invalid-payload`），再要求不超过 16 个记录（`limit-exceeded`，`mfdRecords`）。`mfdRecordOffset(block, l, i)` 是 `lists/<l>/records/<i>` 子资源的定位，l 只接受 0、1，列表或序号越界都为 `subresource-not-found@…record`。
  - **CCKD 分组（[P2-07/03](../../plan/p2/07/subtasks/03-container-records.md)）：** `readCockpitGroups` 读取头部 +0x08 的目录 {指针, 数量}。依次检查：
    - 目录项 1–8 个（`cockpitSlots`）且整体在块内（`invalid-payload@…groups`）；
    - 每个 slot 的元素数 0–16（`cockpitElements`），非空 slot 的 52 字节元素数组在块内；空 slot 的指针不寻址任何字节，不检查；
    - 每个元素的 +44、+48 只能为 0 或 1，否则为 `invalid-payload@…elements`。

    计数都在读取或遍历它们决定的规模之前检查。结果按目录顺序给出每个 slot 的冻结元素数组，每项为 `{ recordOffset, x, y }`：`recordOffset` 是元素开头图像记录的块内偏移，x、y 取自 +36、+40 的有符号 32 位整数。目录项的其余字段不解释。
  - **CCKD 子资源：** `readCockpitGroup(block, s)` 对应 `groups/<s>`，空 slot 或序号越界为 `subresource-not-found@…groups`；`cockpitElementRecordOffset(block, s, i)` 对应 `groups/<s>/elements/<i>`，元素序号越界为 `subresource-not-found@…elements`。`readCockpitGroupPalette(block, s)`（[P2-07/18](../../plan/p2/07/subtasks/18-cockpit-group-palette.md)）对应 `groups/<s>/palette`：先按上述规则读取目录，slot 越界为 `subresource-not-found@…groups`，目录项 +0x04 为 0 为 `subresource-not-found@…palette`；+0x08 不为 768 或指针越出块为 `invalid-payload@…palette`；768 字节交给 `readDataPalette`，结果与同样字节作为 DATA 整条目相同。
  - **TABL 图像列表（[P2-07/06](../../plan/p2/07/subtasks/06-table-records.md)）：** `readTableRecordOffsets` 只接受 [hud §2](../../original/formats/hud.md#tabl-image-lists-confirmed-structure) 记录为已确认的结构。依次检查：
    - 没有头部，记录从 0 起紧密排列；
    - 记录数为记录 0 的像素偏移除以 36，须为 1–64（`tableRecords`），在读取其余记录之前判定；
    - 每个记录都是不带嵌入调色板的 raw 记录，数据恰为宽 × 高字节（否则为 `invalid-payload@…pixels`，不必解码）；
    - 像素数据按记录顺序、无空隙地恰好占满其余部分。

    其他任何形态都是 `invalid-payload@…record`，记录头自身的问题沿用 P2-05 的位置。`tableRecordOffset(block, i)` 对应 `records/<i>`，越界为 `subresource-not-found@…record`。这些记录没有嵌入调色板，因此 `records/<i>/palette` 总是 `subresource-not-found@…palette`。
  - **容器内记录：** CCKD 元素、MFDD 与 TABL 的记录都用记录偏移交给 `decodeImageRecord`、`readEmbeddedPalette`，结果与把同一记录放在偏移 0 时相同。上述四项计数上限与 SNIP 帧数上限以 `CONTAINER_LIMITS` 导出。
  - `readFontTable` 要求头部首字节为 0、单元宽与高为 1–8（`limit-exceeded`）、表长恰为 `4 + 256 × 高`，字形字节逐位复制、不切分（每字形行数由声明给出）。CCKD 字体目录须恰为 3 项且都在块内：`readCockpitFonts` 按目录顺序读取全部 3 个字库，`readCockpitFont(block, i)` 只读取 `fonts/<i>`，i 不在 0–2 时为 `subresource-not-found`。
  - **SNIP 帧（[P2-07/20](../../plan/p2/07/subtasks/20-snip-diag-conversion.md)）：** `readSnipFrames({ bytes, relocations })` 只接受 [hud 的 SNIP 10487](../../original/formats/hud.md#snip-10487-confirmed-structure-p2-1227) 记录的结构：+0 帧块偏移是条目唯一的重定位且不小于 8、+4 帧块大小恰为条目的其余部分、块头 12 字节；帧数 1–16（`snipFrames`）、高 1–480、宽 1–640（`imageHeight`、`imageWidth`）先于其余检查判定；宽须为 4 的倍数（每行整字节）；12 + 帧数 × 宽 × 高 / 4 恰为帧块大小。其他形态为 `invalid-payload@…frames`。`decodeSnipFrame(entry, i, colours)` 对应 `frames/<i>`，越界为 `subresource-not-found@…frames`；颜色表须恰为 `SNIP_COLOURS`（4）字节，否则为 `invalid-payload@…colours`。每个像素的 2 位值（字节内最左像素在最低两位，行自上而下）换为颜色表中的索引，结果为不透明的存储行序图像。
  - **DIAG（同上）：** [source-messages.ts](../../../src/original-data/conversion/source-messages.ts) 的 `readStatusMessages({ bytes, relocations }, format, path, reserve)` 读取 [hud 的 DIAG 10489](../../original/formats/hud.md#diag-10489-confirmed-structure-p2-07-revision) 的 0x98 字节头部：启动消息数 0–16（`diagStartupMessages`）先判定；列表指针恰在数为 0 时为 0，非 0 时列表须在块内；条目的重定位须恰为全部文字指针字段（含列表指针与列表项），先比较个数再复制排序；每个指针都须指向块内以 NUL 结尾的文字，文字不超过 255 字节（`diagTextBytes`）。其他形态为 `invalid-payload@…messages`。`format` 是下行格式的区域字节，须以唯一的 NUL 结尾，否则为 `invalid-payload@…format`，超长为 `limit-exceeded@…format`。全部核对完成后，先以编码长度（`statusMessagesLengthOf`）调用 `reserve`，再复制文字；结果是 `StatusMessagesPayload`。
  - 结果都在调用者独占的新缓冲中，可直接交给 `payloadTransferList`。失败抛出 `SourceError`，位置是调用者 `path` 下的字段名：`palette`、`record`、`pixels`、`glyphs`、`fonts`、`groups`、`elements`、`frames`、`colours`、`messages` 或 `format`，不含条目编号、偏移或字节。
- **转换声明：** [graphics-declarations.ts](../../../src/original-data/conversion/graphics-declarations.ts)（[P2-05/04](../../plan/p2/05/subtasks/04-graphics-conversion.md)）的 `readGraphicsDeclarations` 严格读取一组声明（字段见 [spec](../../plan/p2/05/spec.md#图形转换声明)）：`asset` 为 palette/image/font 且组内 ID 唯一，`role` 与 `group` 按 P2-01 规则读取且该组拥有此 kind；图像的 `palette` 与 nearest 目标都须是同一组声明中同组的调色板，`alpha` 为 `encoding` 或 `{ colourKey }`，`rowOrder` 为 `stored`/`reversed`；字体有预期 `cell`、每字形行数 `glyphRows`（`cell.height`–8，且整除 256 × `cell.height`，字形数为二者之商，由 `declaredGlyphCount` 给出）与按码位互不重叠、字形小于字形数的 `charMap` 区间。它复用 content 的严格读取原语，任何问题都转为 `invalid-declaration`，位置为 `graphics.declarations[<i>]` 加字段路径。[P2-07/04](../../plan/p2/07/subtasks/04-layout-conversion.md) 加入布局声明（字段见 [P2-07 spec](../../plan/p2/07/spec.md#布局转换声明)）：`frame` 的宽 1–640、高 1–480，`elements` 为 1–16 个互不相同的 image ID，按存储顺序排列，每个都须是同一声明组、同一资源组中的图像声明。[P2-07/20](../../plan/p2/07/subtasks/20-snip-diag-conversion.md) 加入 `data` 声明：只有 `asset`、`role`、`group`，角色须为 `status-messages`，组须拥有 `data`。
- **转换器：** [convert-graphics.ts](../../../src/original-data/conversion/convert-graphics.ts) 的 `convertGraphics(declarations, sources, limits, usage)` 先读取声明，再按 Asset ID 取得已读入的源块：
  - 来源类型为 `data-palette`、`embedded-palette`（记录的嵌入调色板）、`cockpit-group-palette`（`groups/<s>/palette`）、`image-record`、`snip-frame`（`frames/<i>` 与颜色表）、`cockpit-font`（`fonts/<i>`）、`cockpit-group`（`groups/<s>`）或 `status-messages`（DIAG 整条目、其重定位与下行格式）；DATA 整条目与分组调色板都在读取之前按 256 项扣除，嵌入调色板按记录头的条目数扣除；来源与 kind 不符、缺少来源都是 `invalid-declaration`；
  - 记录类来源可带 `RecordSelector`：CCKD 元素 `{ slot, index }`、MFDD 记录 `{ list, index }` 或 TABL 记录 `{ index }`，没有时为偏移 0 的整条目记录。转换时经 `cockpitElementRecordOffset`、`mfdRecordOffset`、`tableRecordOffset` 得到记录偏移，此后的读取、解码与检查与整条目相同；
  - 依次转换调色板、图像、字体、文字与布局，同类按 ID 排序。
  - **SNIP 帧与文字（P2-07/20）：** SNIP 帧按 `readSnipFrames` 的尺寸扣除后再经 `decodeSnipFrame` 解码，透明须为 `encoding`（帧整幅绘制，颜色键为 `invalid-declaration@…alpha`），其余与图像记录相同。文字由 `readStatusMessages` 核对结构与各段长度后，在复制任何文字之前经 `reserve` 按 `assets` 1 与编码长度扣除（拒绝位于 `…messages`），再编码；描述符 schema 为 `STATUS_MESSAGES_SCHEMA_VERSION`，没有依赖。
  - 每个 Asset 在读取或分配之前，用 `chargeBudget` 扣除由记录头或声明推得的 `assets`、`dependencyEdges`、`paletteEntries`、`imagePixels`、`glyphs` 与 `payloadBytes`（`palettePayloadLength`、`imagePayloadLength`、`fontPayloadLength` 与编码器共用同一公式）。被拒绝时报 `budget-exceeded`，限值名为维度，总量超出安全整数时 `observed` 为 null；调用者的用量不变。转换用量不扣 `sourceReadBytes`。
  - 颜色键只用于 raw 图像（否则为 `invalid-declaration@…alpha`），值为 k 的像素变为透明；不透明像素的索引不小于所绑定调色板（同组声明的转换结果）的条目数时为 `palette-index-out-of-range@…pixels`；`reversed` 恰好反转索引与掩码的行序。字体按声明的 `cell` 扣除，实际单元不符为 `geometry-mismatch@…glyphs`，`charMap` 区间展开为按码位升序的条目。
  - **布局（P2-07）：** 用 `readCockpitGroup` 读取分组。元素数与声明不符报 `geometry-mismatch@…elements`；元素坐标为负，或按其记录头的图像尺寸越出声明的画幅，报 `geometry-mismatch@…elements[<i>].x|y`。声明的第 i 个图像与第 i 个存储元素配对。之后扣除 `assets` 1、`dependencyEdges` 为元素数、`payloadBytes` 为 `layoutPayloadLength`，再编码；预算拒绝位于 `…elements`。
  - 结果是按 ID 升序的冻结 `{ descriptor, payload }`：描述符经 `readAssetDescriptor` 生成，依赖为图像引用的调色板（`imagePalettes`），或布局的元素图像（`layoutImages`，kind 为 `image`）；`payloadIdentity` 由实际字节计算；payload 独占缓冲。源结构读取的位置都带上 `graphics[<Asset ID>]` 前缀；任一失败使整组转换失败，不返回部分结果。
- **转换步骤：** [graphics-step.ts](../../../src/original-data/conversion/graphics-step.ts)（[P2-05/05](../../plan/p2/05/subtasks/05-graphics-step.md)）的 `runGraphicsStep(source, mappings, declarations, limits, usage)`：
  - **共用读取：** [step-entry-reader.ts](../../../src/original-data/conversion/step-entry-reader.ts) 的 `stepEntryReader(source, beforeRead?)` 经 `VerifiedSource.openArchive` 读取，以（光盘路径、条目类型、条目 ID）为键缓存一次步骤内的读取结果，大于 u32 的 ID 与核验一样报 `entry-not-found`。映射核验与转换共用它，同一条目只物理读取一次；缓存随步骤结束释放，没有跨步骤或通用的封包缓存。可选的 `beforeRead` 在读取字节之前收到目录项，供步骤按声明大小拒绝条目（逻辑步骤用它检查条目大小）。
  - **配对与子资源：** 先用共用读取核验映射表，再要求每个声明都有映射、每个映射都有声明（否则为 `invalid-declaration`，位置为 `graphics.declarations[<i>]` 或 `graphics.declarations`）。映射的第一个部件须为封包条目，取它的第一个等价备选；除 SNIP 帧与 DIAG 外只能有这一个部件。子资源的序号都是不带前导零的十进制，越界由读取报 `subresource-not-found`：
    - DATA 整条目为调色板；TEX/BITM 整条目为图像，其 `palette` 为嵌入调色板；
    - CCKD 的 `fonts/<i>` 为字库，`groups/<s>` 为布局，`groups/<s>/palette` 为分组调色板，`groups/<s>/elements/<i>` 为图像；
    - MFDD 的 `lists/<l>/records/<i>` 与 TABL 的 `records/<i>` 为图像；
    - 任一容器记录路径后接 `/palette` 为该记录的嵌入调色板；
    - SNIP 的 `frames/<i>` 为图像，DIAG 整条目为 `data`（P2-07/20）。二者另须恰有第二个部件，为长度合用途的 EXE 区域：SNIP 帧为 4 字节颜色表，DIAG 为不超过 256 字节的下行格式；不符时为 `invalid-declaration@…colours|format`。区域经 [step-entry-reader.ts](../../../src/original-data/conversion/step-entry-reader.ts) 的 `stepRegionReader(source)` 读取：每个 EXE 在一步内只打开一次（`openLeExecutable`），每个区域只按 LE 读取器的规则读出一次，共用区域的 Asset（例如 9 帧共用颜色表）共用其字节；失败位置为首次读取它的 Asset 的 `…colours|format`。效果步骤共用同一读取器。

    其他组合为 `invalid-declaration@graphics[<ID>].palette|record|fonts|groups|messages`。之后要求每个布局的第 i 个元素图像恰好映射到同一封包、同一 CCKD 条目、同一 slot 的 `groups/<s>/elements/<i>`，否则为 `invalid-declaration@graphics[<布局 ID>].elements[<i>]`。
  - **结果：** 转换成功后才把全部映射（含子资源）置为 `verified`，再用 `assetSourceStates` 得到不带定位的状态。返回冻结的 `{ groups, usage }`：`groups` 只含有 Asset 的组，按 `RESOURCE_GROUPS` 排列，每组的 `descriptors`、`payloads`、`sources` 按 ID 升序一一对应；`usage` 是转换用量。任一失败都抛出且没有结果；读取错误保持 P2-02/P2-03 的层、code 与位置，已发出的读取仍计入已验证来源的 `sourceReadBytes`。
  - **组草稿（[P2-07/13](../../plan/p2/07/subtasks/13-group-assembly.md)）：** `stepGroupDraft(group, results, sourceFingerprint)` 把若干步骤结果（形状同 `GraphicsStepResult`）中该组的分区按 Asset ID 升序合并为一个冻结的 `GroupDraft`，不重新转换，payload 保持原字节视图；来源状态绑定给定的来源指纹。重复的 Asset ID 以内容层的 `duplicate-asset` 拒绝，路径为 `<组>.assets` 等；没有该组的分区时得到空组。作业用它装配 `cockpit-hud-map` 组，`modelsGroupDraft` 是它在 `models` 组上的包装。
- **生产图形：** [production-graphics.ts](../../../src/original-data/conversion/production-graphics.ts)（[P2-05/06](../../plan/p2/05/subtasks/06-production-graphics.md)）导出生产图形的声明、映射与预算份额（P2-05 的调色板与字库、P2-06 的切片贴图、P2-07 的驾驶舱、HUD 与地图 Asset）：
  - `PRODUCTION_GRAPHICS_DECLARATIONS`：`palette/flight/models` 与 `palette/flight/cockpit-hud-map`（角色 `flight-palette`，各在本组），`font/hud/8x8-1`、`font/hud/8x8-2`、`font/hud/4x6`（角色 `font`，`cockpit-hud-map`，单元 8×8、8×8、4×6，每字形行数都为 8，4×6 因此为 192 个字形）。字符映射是 [hud §1.1](../../original/formats/hud.md#11-glyph-layout-and-character-maps-likely) 记录的同号区间（[P2-05/12](../../plan/p2/05/subtasks/12-character-map-research.md)）：8x8-1 为 0x20–0x7a 与 0x7c–0x7e，8x8-2 为 0x20–0x7e，4x6 为 0x20、0x25、0x27–0x3f 与 0x41–0x5d。
  - `PRODUCTION_GRAPHICS_MAPPINGS`：两个调色板共用 `MAIN/SR.NOB` 唯一 DATA 条目的整条目定位（confirmed，textures §1）；三个字库指向 HI 完整驾驶舱组 CCKD 的 `fonts/0`、`fonts/1`、`fonts/2`（likely，U-029 与 U-030；cockpit §1、hud §1 与 §1.1）。条目 ID 与序号来自本地结构核对，只存在于 `original-data`；表的来源指纹为 null，由作业核验时绑定。
  - **切片贴图（[P2-06/04](../../plan/p2/06/subtasks/04-slice-textures.md)）：** [production-model-textures.ts](../../../src/original-data/conversion/production-model-textures.ts) 的 `PRODUCTION_MODEL_TEXTURES` 是只追加的生产贴图表：16 行，每行为 `MAIN/SR.NOB` 的 TEX 条目号。初始 15 行按“模型 Asset ID 升序、列表 0–2、部件顺序”的首次引用编号，覆盖 5 个切片机型模型全部三个列表引用的 TEX；第 16 行由 [P2-06/11](../../plan/p2/06/subtasks/11-effects-research.md) 追加，是碎片模型部件引用的 TEX。第 i 行的序号 `<nn>` 为 i + 1 的两位数字，同时用于 `image/model-texture/<nn>` 与 `palette/model-texture/<nn>`（`modelTextureImageId`、`modelTexturePaletteId`）；`PRODUCTION_TEXTURE_REFERENCES` 把 TEX 条目号映射到 image ID，是模型转换器解析部件贴图的唯一途径。重排或删除行会改变 Asset ID，须递增转换器版本。
    - **声明：** 每行一个 `palette/model-texture/<nn>`（角色 `texture-palette`）与一个 `image/model-texture/<nn>`（角色 `model-texture`），都在 `models` 组；图像绑定同序号的调色板，显示映射为 `{ nearest: 'palette/flight/models' }`，透明按编码，行序按存储。
    - **映射：** 调色板为该 TEX 的 `palette` 子资源，confirmed；图像为 TEX 整条目，带 U-028（游戏中的明暗），置信度为 likely。最近色规则已由 P2-06/12 确认，不再有因歧义而未确认的贴图。证据指向 [textures §3](../../original/formats/textures.md#3-tex-textures-confirmed) 与最近色一节。
    - **效果图像（[P2-06/11](../../plan/p2/06/subtasks/11-effects-research.md)）：** [production-graphics.ts](../../../src/original-data/conversion/production-graphics.ts) 的 `PRODUCTION_EFFECT_IMAGES` 列出研究确认的整条目 TEX 效果图像，目前只有导弹。每项声明 `palette/<角色>`（角色 `texture-palette`）与 `image/<角色>`（角色即效果角色），显示、透明与行序同切片贴图。图像映射带 U-027 与 U-028，置信度为 likely；调色板映射为 confirmed。证据另指向 [executable 的效果表现来源](../../original/formats/executable.md#effect-presentation-sources)。
    - **份额：** `PRODUCTION_MODEL_TEXTURE_SHARE` 覆盖切片贴图与效果图像，为 `assets` 40、`dependencyEdges` 64、`paletteEntries` 1,024、`imagePixels` 524,288、`payloadBytes` 655,360（份额内全部 Asset 都按最长 ID 的图像、掩码与满额调色板计算的上界不超过它），为研究可能追加的 Asset 留有余量。
  - **驾驶舱、HUD 与地图（[P2-07/12](../../plan/p2/07/subtasks/12-production-cockpit-hud.md)，[P2-07/20](../../plan/p2/07/subtasks/20-snip-diag-conversion.md) 修订）：** 按 [P2-07 spec 的生产 Asset 表](../../plan/p2/07/spec.md#生产-asset-与来源)声明 96 个 `cockpit-hud-map` 组 Asset（2 个布局、92 个图像、1 个调色板、1 个 `data`），条目都在 `MAIN/SR.NOB`。图像都为 `display: 'direct'`、`rowOrder: 'stored'`；`<i>` 是记录在完整来源列表中的序号，不补零。
    - `layout/cockpit/front`（`front-cockpit`，画幅 640×480，元素为 `image/cockpit/front/element-0`–`3`）映射 CCKD 10103 的 `groups/0`，元素图像（`cockpit-element`，飞行调色板 `palette/flight/cockpit-hud-map`，透明按编码）映射 `groups/0/elements/<i>`：likely，U-029，证据为 [cockpit R1](../../original/formats/cockpit.md#front-cockpit-source-r1) 与[分组调色板与绘制](../../original/formats/cockpit.md#group-palette-and-drawing-confirmed)。
    - `layout/map/frame`（`strategic-map`，640×480，元素 `image/map/frame/element-0`–`3`）映射 `groups/2`，元素图像（`map-frame-element`，调色板 `palette/map/screen`，透明按编码）映射 `groups/2/elements/<i>`，`palette/map/screen`（`map-palette`）映射 `groups/2/palette`：都为 confirmed，U-029，证据为分组调色板与绘制一节。
    - `hud-mfd`：`image/hud/status-display/background-0`–`2`（MFDD 10473 `lists/0/records/<i>`，透明按编码）与 `overlay-0`–`8`（`lists/1/records/<i>`，颜色键 0）、`image/hud/display-page/background`（BITM 10467 整条目，透明按编码）、`image/hud/gauge-bar-1/0`–`3`（TABL 10479 `records/<i>`，颜色键 0），都用飞行调色板。`strategic-map`：`image/map/unit-marker/0`–`28`（TABL 10461）与 `image/map/zoom-icon/0`–`28`（TABL 11401），都为 `records/<i>`、地图调色板与颜色键 0。这些映射都为 confirmed，U-030，证据为 hud 的[绘制路径](../../original/formats/hud.md#hud-and-map-drawing-paths-confirmed-exe)与[画面覆盖和图像族](../../original/formats/hud.md#slice-screen-coverage-and-hud-image-families-r3-r4-r6)两节，MFDD 另加 [cockpit §2](../../original/formats/cockpit.md#2-mfdd-multi-function-display-images-confirmed-structure)，TABL 另加[图像列表结构](../../original/formats/hud.md#tabl-image-lists-confirmed-structure)，放大窗口图标再加 [R8](../../original/formats/hud.md#zoom-window-icons-by-craft-type-r8)。
    - **干扰帧与文字（2026-10-08 修订）：** `image/hud/display-interference/frame-0`–`8`（`hud-mfd`，飞行调色板，透明按编码）映射 SNIP 10487 的 `frames/<i>` 与 EXE 区域 `le/4/0x5ed8/4`（颜色表）；`data/hud/status-display/messages`（`status-messages`）映射 DIAG 10489 整条目与 `le/4/0x1e58/6`（下行格式）。都为 confirmed，U-030，证据为 hud 的 SNIP 10487 与 DIAG 10489 两节。区域由 [production-executable.ts](../../../src/original-data/conversion/production-executable.ts) 的 `executableRegionAt(地址, 长度)` 按文档化的对象基址换算（效果的生产输入共用其中的 `objectOffset`）；源码只有地址与长度。
    - 没有 `unconfirmed` 映射，因此在已识别的来源上该组可以完整；元素数（4 与 4）、记录数（3 + 9、4、29、29）与帧数（9）由声明断言，与本地结构核对一致。
    - **份额：** `PRODUCTION_COCKPIT_HUD_MAP_SHARE` 为 `assets` 112、`dependencyEdges` 192、`imagePixels` 655,360、`paletteEntries` 1,024、`glyphs` 0、`payloadBytes` 917,504，其余维度为 0（2026-10-08 修订前为 96、524,288 与 786,432）；它是全部候选 Asset 的上界，不是精确用量。
  - `PRODUCTION_GRAPHICS_SHARE`：P2-05 的份额（`assets` 5、`paletteEntries` 512、`glyphs` 768、`payloadBytes` 16,384；按结构上限与头部算出的上界不超过它，实际字形用量为 256 + 256 + 192）、切片贴图份额与 P2-07 份额之和，即 `assets` 141、`dependencyEdges` 256、`paletteEntries` 2,560、`glyphs` 768、`imagePixels` 1,048,576、`payloadBytes` 1,458,176，其余维度为 0；源读取沿用 P2-02 的默认限值，不另加份额。作业的限值组合不变：读取限值加图形、逻辑与模型份额。
  - [production-graphics.test-support.ts](../../../src/original-data/conversion/production-graphics.test-support.ts) 按生产映射的定位生成合成封包，供 Node、作业与浏览器测试使用：DATA；`productionCockpitBlock(fonts)` 生成的 CCKD（3 个字库，slot 0 为 4 个前视元素、slot 1 为空、slot 2 为 4 个地图边框元素与分组调色板，元素都在 640×480 画幅内，有的贴住右缘与下缘）；每个生产贴图条目处由条目号决定内容的 4×2 raw 贴图 `syntheticTexture`；3 + 9 个记录的 MFDD、一个 BITM 图像，以及 4、29、29 个记录的 TABL 图像列表；9 个 4×2 帧的 SNIP（[synthetic.test-support.ts](../../../src/original-data/synthetic.test-support.ts) 的 `syntheticSnip`）与按 `SYNTHETIC_STATUS_MESSAGES` 生成的 DIAG（`syntheticDiag`，含重定位）。各记录很小，内容随列表与条目不同。`productionGraphicsFiles` 另含 `regionExecutable(PRODUCTION_GRAPHICS_REGION_WRITES)` 生成的 `MAIN/SRANGERS.EXE`：生产颜色表与下行格式区域处为编造的索引与格式，`syntheticEffectExecutable` 也写入同样的区域。`MODEL_TEXTURE_USAGE` 与 `COCKPIT_HUD_MAP_USAGE` 是贴图与 P2-07 Asset 的期望转换用量，`PRODUCTION_LAYOUT_POSITIONS` 是两个合成布局的元素位置，`interferenceIndices(i)` 与 `SYNTHETIC_STATUS_MESSAGES_PAYLOAD` 是干扰帧与文字的期望结果。
- **错误扩展：** [source-error.ts](../../../src/original-data/source-error.ts) 的 code 追加 `invalid-payload`、`unsupported-encoding`、`budget-exceeded`、`palette-index-out-of-range`、`subresource-not-found`、`invalid-declaration`、`geometry-mismatch`；限值名追加 `imageWidth`、`imageHeight`、`paletteEntryCount`、`fontCellWidth`、`fontHeight` 与 P2-01 的预算维度；`observed` 允许为 null，只用于超出安全整数的预算总量。P2-03 已有 code 与限值的含义不变。P2-07 不新增 code，只追加限值名 `cockpitSlots`、`cockpitElements`、`mfdRecords` 与 `tableRecords`，2026-10-08 修订再追加 `snipFrames`、`diagStartupMessages` 与 `diagTextBytes`。
- [payloads.ts](../../../src/original-data/payloads.ts) 只保留 ID 列表的研究用解析器 `parseIdList` 与 `PayloadError`；图像、调色板与字体由上述源读取处理，MESH 与 MODL 由 `formats/mesh.ts`、`formats/modl.ts` 处理（见[原版格式转换](#原版格式转换)）。

合成样本、声明、封包与映射由 [conversion.test-support.ts](../../../src/original-data/conversion/conversion.test-support.ts) 在代码中生成；其中 `inGraphicsLocationGrammar` 按 spec 定义转换错误的位置语法（声明组 `graphics.declarations`、声明字段路径或 `graphics[<ID>].<字段>`，P2-07 加入 `groups`、`elements`、`elements[<i>]` 与 `elements[<i>].x|y`，其 2026-10-08 修订加入 `frames`、`colours`、`messages` 与 `format`）；`cockpitLayoutBlock`、`mfdBlock` 与 `tableBlock` 按 cockpit 与 hud 记录的结构生成带分组、元素、两个记录列表或无头部图像列表的合成容器，记录数据的指针相对条目块；`expectSourceError` 对 `graphics` 开头的位置逐个核对。针对性检查为 `pnpm exec vitest run src/original-data/conversion`。

## 原版格式转换

[P2-08](../../plan/p2/08/spec.md) 的 SND 转换分为两处：`original-data/formats/` 放单一格式的解析与转换，`original-data/conversion/` 放音频组转换流程与共用的转换预算、生产 `ConverterVersion`。它们属于[底层能力边界](../README.md#lint-规则eslintconfigjs)中的“其他使用者”，原版字节只经产品入口与 `verifySourceMappings` 取得。

- **转换错误：** 与 P2-05、P2-09 一致，转换失败扩展 P2-03 的 `SourceError`，经 `source` 层传递，不另设错误层（[P2-08/14](../../plan/p2/08/subtasks/14-shared-mechanism-alignment.md)）。
  - **追加 code：** `invalid-payload`（源条目违反其格式，与 P2-05 共用）与 `unsupported-payload`（格式合法，但取值不在生产规则内）；转换预算超限沿用 P2-05 已落地的 `budget-exceeded`。
  - **限值：** 预算超限的 `limit.name` 为 P2-01 预算维度（P2-05 已把全部维度加入 `SourceLimitName`）；只有预算总量超出安全整数时，`observed` 为 null。P2-03 已有 code 与限值的含义不变。
  - **位置：** 映射路径后接字段名（如 `.size`、`.flags`），属于 `inLocationGrammar` 的扩展语法。`reason` 为固定文本，不含字节、宿主路径或宿主错误文本。
- **SND：** [formats/snd.ts](../../../src/original-data/formats/snd.ts)（[P2-08/03](../../plan/p2/08/subtasks/03-snd-parser.md)，格式见 [audio §1](../../original/formats/audio.md#1-snd-digital-sound-effects-confirmed-on-all-37-entries)）。
  - **结构：** `readSndHeader(block, location)` 只核对结构：块至少 20 字节（`SND_HEADER_BYTES`）、恰有一个位于 0 的重定位且该处指针为 20、声明的样本字节数等于块大小减 20。不符时为 `invalid-payload`，位置为 `location` 加 `.size`、`.relocations`、`.sampleOffset` 或 `.sampleBytes`。结果是未按规则核对的原始头部字段 `{ sampleRate, bitsPerSample, flags, sampleBytes }`。
  - **规则：** `SndFormatRules` 是转换器接受的采样解释：`flags` 列出研究已确认的取值及各自的声道数与循环方式，`s16le` 表示 16 位样本是否已确认为有符号小端。规则之外的取值一律拒绝，不猜测默认值。生产规则由 P2-08 的生产音效模块提供。
  - **转换：** `convertSnd(block, rules, location)` 在结构核对之后依次核对：位宽为 8，或在规则接受时为 16；采样率为 8,000–44,100 Hz（`SND_SAMPLE_RATE_RANGE`）；`flags` 在规则内。这三项不符时为 `unsupported-payload`。最后核对样本字节数为帧大小的正整数倍，不符为 `invalid-payload`；帧大小取决于 `flags` 给出的声道数，所以这一项放在最后。全部通过后，用 `writeSoundPayload` 把样本原样复制为新的独占 payload，同时返回采样点数（帧数 × 声道数）。块视图不被修改，所有检查通过之前不分配缓冲。
- **MESH 与 MODL：** [formats/mesh.ts](../../../src/original-data/formats/mesh.ts) 与 [formats/modl.ts](../../../src/original-data/formats/modl.ts)（[P2-06/02](../../plan/p2/06/subtasks/02-source-mesh-modl.md)，格式见 [mesh](../../original/formats/mesh.md)）是这两种条目唯一的源结构读取，导入转换与 nob-check 共用。它们只接收已读入的块，失败位置恰为调用者给出的 `path`（转换器传入 `models[<Asset ID>].model` 或 `….parts[<l>][<p>].mesh`），不附加条目编号或偏移；`reason` 为固定的可打印 ASCII 文本。
  - **MESH 计数：** `readMeshCounts(block, path)` 依次核对结构指针为 12、结构长度等于块长 − 12、保留字为 0，然后只读取顶点数与三角形数：为 0 或超过 `MODEL_LIMITS`（4,096）时报 `limit-exceeded`（`meshVertices`、`meshTriangles`，带 `observed`），之后才计算其他位置；最后要求块长恰为 28 + 32 × 顶点数 + 28 × 三角形数。转换器据此在分配之前扣除 `vertices` 与 `triangles`。
  - **MESH 读取：** `readMesh(block, path)` 在计数之后核对着色槽数为 1 至 3 × 三角形数、位置/UV/法线全部有限（贴图坐标块按两个连续数组读取，先全部 u、后全部 v，输出为每顶点一对；[P2-06/21](../../plan/p2/06/subtasks/21-mesh-uv-planar.md)）、每个面恰为 3 个角、顶点与着色槽索引在范围内、尾字为 0，返回冻结的 `ModelGeometry`（`content/models` 的类型）：数组都是新缓冲，浮点逐位保留（含负零与次正规数，不像 `PayloadBlock.f32` 那样把 −0 规范化），三角形顺序与绕序按存储，允许未用顶点。
  - **MODL 读取：** `readModel(block, path)` 先核对头部完整、列表按 0、1、2 的顺序紧接头部连续存放（非空列表的指针等于前面列表之后的位置，空列表的指针为 0）且计数不越出块，再核对部件总数为 1–256（否则 `limit-exceeded`，`modelParts`）、块长恰为 44 + 28 × 部件总数，最后逐个部件核对保留字段为 0、颜色分量不大于 255。返回冻结的 `{ partLists, soundEntries }`：部件为 `{ sourceFlags, colour, meshEntry, textureEntry }`（无贴图为 0），音效槽为 5 个 SND 条目号（空槽为 0）；条目号不在这里解析。
  - **错误：** 除计数的 `limit-exceeded` 外，结构不符一律为 `invalid-payload`。[source-error.ts](../../../src/original-data/source-error.ts) 的限值名为此追加 `meshVertices`、`meshTriangles`、`modelParts`。
- **LE 区域：** [formats/le-executable.ts](../../../src/original-data/formats/le-executable.ts)（[P2-06/16](../../plan/p2/06/subtasks/16-executable-region-reader.md)，结构见 [executable §1](../../original/formats/executable.md)）从 `ByteSource` 读取 EXE 的字节区域，供效果步骤使用。
  - **打开：** `openLeExecutable(file, path)` 读 MZ 头取 LE 偏移，核对签名、字节序与字序、页大小为 `LE_PAGE_SIZE`、末页字节数，以及对象表、页映射、修正页表、修正记录表与数据页都在文件内、修正页表递增。对象数与页数先于其余读取按 `EXECUTABLE_LIMITS` 检查，超出为 `limit-exceeded`（`executableObjects`、`executablePages`），此时只读过两个头部。
  - **区域：** `readRegion(region, path)` 先按 `executableRegion` 检查长度，再要求区域在对象的虚拟大小与其文件页之内、经页映射找到的每页都存于文件，且没有任何修正记录（含从前一页跨入的记录）改写区域内的字节；结果是新的独立缓冲。每页的修正记录只解析一次；未知的源类型或保留标志无法证明不触及区域，一律拒绝。
  - **错误：** 除限值外均为 `invalid-payload`，位置恰为调用者给出的 `path`；`reason` 为固定文本，不含偏移或字节。
- **测试数据：** [synthetic.test-support.ts](../../../src/original-data/synthetic.test-support.ts) 由代码生成单个格式的数据块及其重定位，可直接展开为 `buildImfat` 的条目：
  - `syntheticSnd(fields)`：SND 块与位于 0 的重定位，指针与声明长度可单独改写；
  - `syntheticMesh(fields)`：按顶点、着色槽数与各面的角点生成 MESH 块与位于 0 的重定位，结构指针、长度、保留字与尾字可单独改写；`uvs` 与 `ModelGeometry` 一样按顶点成对给出，写入时按原版布局存为先 u 后 v 的两个数组；
  - `syntheticModl(fields)`：按三个部件列表与音效槽生成 MODL 块与非空列表指针的重定位，列表头、部件颜色与保留字段可单独改写。
  - `syntheticLeExecutable(fields)`：按对象内容与各页修正记录生成完整的 LE 文件（MZ 头、LE 头、对象表、页映射、修正表与数据页），签名、字序、页大小、计数、各表偏移、页类型与存储顺序可单独改写；`leInternalFixup(offset)` 生成一条 32 位偏移的内部修正记录。
- **转换预算：** [conversion/conversion-budget.ts](../../../src/original-data/conversion/conversion-budget.ts) 的 `chargeConversionBudget(limits, usage, increment, location)` 用 P2-01 `chargeBudget` 核算转换用量，增量缺省的维度为 0。`readConversionUsage(value)` 读取转换器的起始用量（前序步骤的转换用量）：须为完整的预算记录，且 `sourceReadBytes` 为 0（源读取由已验证来源计量，否则会重复扣除），否则为 `invalid-budget-value@usage.sourceReadBytes`；图形、逻辑与模型转换器都经它读取。
  - **通过：** 总量等于上限时通过。
  - **失败：** 第一个超限或超出安全整数范围的维度，以 `SourceError('budget-exceeded')` 失败；`limit` 为该维度名、上限与观测值（溢出时为 null），增量不部分计入。
- **生产 `ConverterVersion`：** 见[内容基础契约](./content.md#内容基础契约与切片定义)中 `manifest-identity.ts` 一节；音频转换器的组件为 `AUDIO_CONVERTER_COMPONENT`。
- **音频组：** [conversion/audio-conversion.ts](../../../src/original-data/conversion/audio-conversion.ts)（[P2-08/04](../../plan/p2/08/subtasks/04-audio-group-conversion.md)）。
  - **音效表：** `readSoundTable` 读取行 `{ role, mapping }`。先把各行的 `mapping` 投影为 `{ sourceFingerprint: null, mappings }`，交给 P2-01 `readSourceMappingTable` 校验，因此行按 Asset ID 升序且唯一，错误路径为 `sources.mappings[i]…`；带 `role` 的整行不送入该读取器。之后另行核对：`role` 属于 `SOUND_ROLES`（四个核心角色与 `model-sound`）；ID 符合该角色的规则（核心角色为 `sound/<词干>` 或再加一段变体，`model-sound` 为 `sound/model-clip/<两位数字>`）；kind 为 `sound`；恰有一个部件，各别名都是 `MAIN/SR.NOB`（`AUDIO_SOURCE_ARCHIVE`）中不带子资源的 `SND` 条目；同一 SND 条目只能属于一行（`duplicate-mapping`），因为同一源样本只形成一个 Asset。
  - **常量：** `AUDIO_BUDGET_LIMITS` 为 `assets` 37、`audioSamples` 4,194,304、`payloadBytes` 8,388,608，其余维度为 0。转换器版本组件 `AUDIO_CONVERTER_COMPONENT` 为 `audio-1`，由 `converter-version.ts` 组成生产值。
  - **流程：** `convertAudioGroup(source, table, rules, { limits? })` 按以下顺序执行。`limits` 只供测试替换。
    1. **目录预检：** 读取任何 SND 块之前，只经 `openArchive` 的 `entries`/`entry` 核对（打开封包本身的 P2-03 失败报在 `sources.mappings[0].parts[0].alternatives[0]`）。先确认每个 locator（含别名）都存在且为 `SND`，失败时为 P2-03 原 code，位置为 `sources.mappings[i].parts[0].alternatives[k]`；再确认每行第一个 locator 的块不小于 20 字节，否则为 `invalid-payload`，位置为该路径加 `.size`；最后按块大小核算上界（`payloadBytes` 为 16 + 块大小 − 20，`audioSamples` 为块大小 − 20，另计 `assets`），超限时位置为该行首个 locator 加 `.size`。预检不计入用量。
    2. **核验：** `verifySourceMappings` 核验映射，再由 `assetSourceStates` 得到绑定指纹的来源状态集。
    3. **转换：** 逐行读取第一个 locator，以 `convertSnd` 转换，位置为该行映射路径；按实际 payload 字节与采样点数计量。
  - **输出：** 组草稿 `{ assets, payloads, sources, usage }`。描述符为 `sound`/`audio`、无依赖、payload schema 1；每个 payload 独占 buffer；`usage` 只含转换用量，源读取用量在已验证来源的 `usage()` 中。清单身份不在这里填入。
  - **门槛：** `unconfirmed` 的映射或缺少某个核心角色时，照常转换，交给完整性验证判为 `source-not-ready` 或 `role-cardinality`；格式不在规则内时，以 `unsupported-payload` 失败。空表不打开封包。
- **生产音效：** [conversion/production-sounds.ts](../../../src/original-data/conversion/production-sounds.ts)（[P2-08/06](../../plan/p2/08/subtasks/06-import-job-audio-stage.md) 建立，[P2-08/11](../../plan/p2/08/subtasks/11-production-sound-table.md) 填入）导出 `PRODUCTION_SOUND_TABLE`（经 `readSoundTable` 读取）与 `PRODUCTION_SND_RULES`。
  - **唯一绑定：** 这张表是 SND 条目与 sound Asset ID 之间唯一的绑定。P2-06 建立模型到样本的依赖边时经同一模块的 `PRODUCTION_SOUND_REFERENCES`（SND 条目号到 sound ID）查 ID，不另立映射。
  - **行：** 每行 `{ role, mapping }`，映射到 `MAIN/SR.NOB` 的一个整条 `SND` 条目，为 `confirmed`、`declared`，证据指向 [audio](../../original/formats/audio.md#slice-sample-set-and-role-correspondences-p2-08)。共 18 行：
    - 四个核心角色的全部变体：开火 4 个、导弹 1 个、爆炸 6 个（含 4 个效果音）、Warp 1 个，按 spec 的 Asset ID 规则命名；
    - 其余模型可达样本 6 个，为 `sound/model-clip/<两位序号>`，带 U-027。

    变体序号与片段序号一次分配后冻结，不由条目编号或槽位推导。
  - **规则：** 单声道；8 位无符号，16 位按有符号小端（`s16le`）接受；`flags` 只接受切片中出现的 0（循环至停止）与 1（播放一次），其他取值（如 8）以 `unsupported-payload` 失败。
  - **变化：** 表或规则的任何改动都会改变转换输出，须递增 `AUDIO_CONVERTER_COMPONENT`，从而改变生产 `ConverterVersion`。
  - **测试支持：** [production-sounds.test-support.ts](../../../src/original-data/conversion/production-sounds.test-support.ts) 的 `productionSoundEntries()` 在表的各条目编号处生成合成 SND（宽度与 `flags` 都在规则之内），期望的转换用量为 `PRODUCTION_SOUND_USAGE`。

## 模型转换

[original-data/conversion/](../../../src/original-data/conversion/) 把 MODL 及其引用的 MESH 转换为[模型 payload](./content.md#模型-payload)，规则见 [P2-06 spec](../../plan/p2/06/spec.md#模型转换声明)（[P2-06/03](../../plan/p2/06/subtasks/03-model-conversion.md)）。

- **声明：** [model-declarations.ts](../../../src/original-data/conversion/model-declarations.ts) 的 `readModelDeclarations` 严格读取 `{ asset: { id, kind: 'model' }, role, group: 'models' }` 的数组：`role` 为 P2-01 的角色 token（机型模型为 `player-ship`、`enemy-ship`、`base`，非必需的机型为 `friendly-craft`，研究确认的为 `projectile`、`missile`、`debris`），同一组内 ID 唯一。来源、网格、贴图与音效都不可声明：来源是映射的整条 MODL，网格来自 MODL 的部件，贴图与音效只经查找表解析。任何问题都为 `invalid-declaration`，位置为 `models.declarations[<i>]` 加字段路径或 `models.declarations`。
- **输入：** [convert-models.ts](../../../src/original-data/conversion/convert-models.ts) 的 `convertModels(declarations, sources, references, limits, usage)`：
  - `sources` 是步骤已读入的块：每个声明模型的 MODL（按 Asset ID），以及其部件引用的 MESH（按条目号）；读取条目与核验映射归模型步骤；
  - `references` 是两张查找表：TEX 条目号到 image ID（生产贴图表），SND 条目号到 sound ID（P2-08 生产音效表）。表中没有的引用为 `invalid-declaration`，位置为 `models[<ID>].parts[<l>][<p>].texture` 或 `models[<ID>].sounds[<s>]`，不跳过、不默认；
  - `limits` 与起始 `usage` 是完整的预算记录，`usage` 是前序步骤的转换用量，经 `readConversionUsage` 读取，不得含 `sourceReadBytes`。
- **每个模型：** 按 Asset ID 升序：
  1. 用 `readModel` 读取 MODL，位置为 `models[<ID>].model`；
  2. 按列表 0、1、2 与部件顺序，为每个首次出现的 MESH 条目分配下一个几何序号（因此几何按首次使用排列，同一模型内重复的 MESH 只存一份），并用 `readMeshCounts` 只读取其计数，位置为首个引用部件的 `….parts[<l>][<p>].mesh`；
  3. 以 `chargeConversionBudget` 一次扣除 `assets` 1、`dependencyEdges`（去重后的贴图与音效引用数）、`vertices` 与 `triangles`（各几何之和）以及 `payloadBytes`（`modelPayloadLength`，与编码器共用公式），位置为 `models[<ID>].model`；
  4. 扣除通过后才用 `readMesh` 解码几何并编码 payload。跨模型不共享几何：两个模型引用同一 MESH 时各自含有一份。
- **输出：** 冻结的 `{ assets, usage }`：`assets` 按 ID 升序，每项为描述符（`model`、`models` 组、依赖为去重后升序的 image 与 sound 引用、payload schema 1 与实际字节的身份）与独占 buffer 的 payload；`usage` 为起始用量加本步用量。任何失败都不输出部分结果，被拒绝的扣除不改变调用者的用量；超出安全整数时 `observed` 为 null。
- **转换器版本：** `MODEL_CONVERTER_COMPONENT` 为 `models-3`（P2-11/16 效果 schema 2 递增为 `models-2`；P2-06/21 改正 MESH 贴图坐标的读取，递增为 `models-3`），由作业组成生产 `ConverterVersion`，主线程生产包配置同步；旧键的缓存不恢复、不迁移、不清理。
- **位置语法：** 转换失败的位置为 `models.declarations`、`models.declarations[<i>]` 加字段路径，或 `models[<Asset ID>]` 后接 `.model`、`.parts[<l>][<p>]`、`.parts[<l>][<p>].mesh`、`.parts[<l>][<p>].texture`、`.sounds[<s>]`，不含条目编号、偏移或宿主路径。[conversion.test-support.ts](../../../src/original-data/conversion/conversion.test-support.ts) 的 `inModelLocationGrammar` 按 spec 写出这一语法，`expectSourceError` 对 `models` 开头的位置逐个核对（另可断言原因原文），并用 `namesPrivateDetail` 确认原因文本不含文件名、路径、十六进制值、条目编号、偏移或字节值（spec AC-16，判定的正反例见 [conversion.test-support.test.ts](../../../src/original-data/conversion/conversion.test-support.test.ts)）；`meshBlockFor(geometry)` 生成恰好表示一个 `ModelGeometry` 的合成 MESH 块，`triangleMeshBlock()` 生成单个三角形的 MESH 块；`withMeshReads(source, read)` 替换来源的 MESH 读取（如光盘层失败），`UNLIMITED_BUDGET` 是各维度都取最大安全整数的预算记录。

## 模型转换步骤

[model-step.ts](../../../src/original-data/conversion/model-step.ts)（[P2-06/05](../../plan/p2/06/subtasks/05-model-step.md)）在已验证来源上运行模型转换，规则见 [P2-06 spec 的步骤结果与 `models` 组](../../plan/p2/06/spec.md#步骤结果与-models-组)与[失败边界一览](../../plan/p2/06/spec.md#错误码)。

- **流程：** `runModelStep(source, mappings, declarations, references, limits, usage)` 依次执行：
  1. **配对：** 读取声明与映射表，二者一一对应，否则为 `invalid-declaration`（`models.declarations[<i>]` 或 `models.declarations`）；每个映射须恰为 `MAIN/SR.NOB`（`MODEL_ARCHIVE`）中一个 MODL 整条目（单一部件、各别名都不带子资源），否则为 `invalid-declaration@models[<ID>].model`。这些检查在任何读取之前完成。
  2. **核验：** 用步骤内读取（`stepEntryReader`）经 `verifySourceMappings` 核验，失败保持 P2-03 的 code 与 `sources.mappings[…]` 位置。
  3. **读取：** 按 Asset ID 升序，从同一读取取得每个 MODL 块，用 `readModel` 收集部件引用的 MESH 条目号，在同一封包中按 `MESH` 类型读取。每个条目在一步内只物理读取一次，跨部件、跨模型共用。MESH 读取的 P2-03 失败（缺失、类型不符、封包限值）保持 code 与限值，位置改写为首个引用部件的 `models[<ID>].parts[<l>][<p>].mesh`；P2-02 的光盘层失败原样传出。
  4. **转换：** 调用 `convertModels`。
  5. **来源状态：** 由核验后的映射经 `assetSourceStates` 得到不带定位的来源状态。
- **结果：** 冻结的 `ModelStepResult`，形状同图形步骤结果：有模型时只有一个 `models` 分区，描述符、payload 与来源状态按 ID 升序一一对应；`usage` 为起始用量加本步转换用量，`sourceReadBytes` 为 0。结果不含定位、条目编号或原版字节。任一模型失败时整步失败，不输出结果，已发出的读取仍计入来源用量。
- **组草稿：** `modelsGroupDraft(results, sourceFingerprint)` 即 `stepGroupDraft('models', results, sourceFingerprint)`（见[图形转换](#图形转换)的转换步骤）：把各步骤结果（作业中为图形、模型与效果步骤）的 `models` 分区按 Asset ID 合并为一个 `GroupDraft`，不重新转换；来源状态绑定给定的来源指纹。重复的 Asset ID 以内容层的 `duplicate-asset` 拒绝。都没有 Asset 时得到空组。作业把它与其他组草稿一起交给 `applyManifestIdentity`，接收方用 `validateGroup` 验证：`sound` 依赖作为外部要求返回，来源状态不是 `verified` 时为 `source-not-ready`。

## 生产模型

[production-models.ts](../../../src/original-data/conversion/production-models.ts)（[P2-06/06](../../plan/p2/06/subtasks/06-production-models.md)、[P2-06/11](../../plan/p2/06/subtasks/11-effects-research.md)）由 P2-09 的机型绑定与研究确认的效果模型生成生产模型输入，规则见 [P2-06 spec 的生产 Asset 与来源](../../plan/p2/06/spec.md#生产-asset-与来源)。

- **绑定来源：** 机型模型的 ID 只来自 [craft-binding.ts](../../../src/original-data/conversion/craft-binding.ts) 的 `bindCraftTypes`，不另建机型模型 ID 表；研究确认的效果模型是固定的，见下文“效果模型”。`ModelBinding` 为此追加 `category`：模型命名时所用的类别（`player`、`enemy`、`base`、`friendly`；同一模型被多个类别使用时，取命名顺序中最先使用它的类别）。
- **声明与映射：** `productionModelDeclarations(bindings)` 按类别给出角色：玩家 `player-ship`、敌方 `enemy-ship`、基地交互 `base`、其他友方 `friendly-craft`，组为 `models`。`productionModelMappings(bindings)` 把每个模型映射到 `MAIN/SR.NOB` 中绑定给出的 MODL 整条目，置信度 likely，U 项为 U-022、U-027、U-028，证据指向 hud §3、mesh §2 与 §3、玩家目标模式；来源指纹为 null，由作业核验时绑定。
- **效果模型：** 两个函数在机型模型之外，总是加入导出的 `PRODUCTION_EFFECT_MODELS` 中研究确认的效果模型：目前为 `model/debris`（角色 `debris`，MODL 整条目），它不进入机型绑定。映射置信度 likely，U 项为 U-027、U-028，证据指向 [executable 的效果表现来源](../../original/formats/executable.md#effect-presentation-sources)与 mesh §2。映射按 Asset ID 升序与机型模型合排，因此没有绑定时只含效果模型。
- **查找表：** `PRODUCTION_MODEL_REFERENCES` 的贴图表为生产贴图表的 `PRODUCTION_TEXTURE_REFERENCES`，音效表为 [production-sounds.ts](../../../src/original-data/conversion/production-sounds.ts) 的 `PRODUCTION_SOUND_REFERENCES`（由 `PRODUCTION_SOUND_TABLE` 按 SND 条目号查得 sound ID）；模型到样本的依赖边因此不自行命名 sound ID。
- **份额：** `PRODUCTION_MODEL_SHARE` 为 `assets` 16、`dependencyEdges` 96、`vertices` 8,192、`triangles` 8,192、`payloadBytes` 1,048,576，其余维度为 0。在这些计数、每个模型 256 个部件（每个部件一个几何）与实际字节布局下算出的上界为 442,816 字节，不超过 `payloadBytes`。
- **合成生产光盘：** [production-models.test-support.ts](../../../src/original-data/conversion/production-models.test-support.ts) 为默认合成任务绑定的 5 个 MODL 条目与效果模型的条目给出合法内容：用到全部三个列表，碎片模型与原版一样只有列表 1，quad 网格被五个模型共用，部件引用生产贴图表的 TEX 条目，音效槽引用生产音效表的 SND 条目；MESH 条目为 21001–21003。`productionSliceEntries()` 组成合成生产 `SR.NOB` 的全部条目（图形、M2ID 与合法模型、效果模型、MESH、合成 RENS、音效），`sliceCoveredFiles` 与 original-data 的测试共用它；未被绑定的 M2ID 槽位仍为 8 字节占位块，`syntheticModelEntries` 为此接受按条目号替换的块。

## 效果步骤

[effect-step.ts](../../../src/original-data/conversion/effect-step.ts)（[P2-06/18](../../plan/p2/06/subtasks/18-effect-step-integration.md)）把 RENS 的弹丸记录与 EXE 的区域转换为三个效果 `data` Asset，规则见 [P2-06 spec 的效果几何数据](../../plan/p2/06/spec.md#效果几何数据)，字段布局与构建规则见 [executable](../../original/formats/executable.md#effect-geometry-data-p2-0614-research)。

- **声明：** [effect-declarations.ts](../../../src/original-data/conversion/effect-declarations.ts) 的 `readEffectDeclarations` 严格读取 `{ asset: { id, kind: 'data' }, role, group: 'models', texture, regions }`。
  - `role` 为 `projectile`、`missile` 或 `debris`；`texture` 对弹丸为 null，否则为 image Asset ID。
  - `regions` 按映射的区域部件顺序给出每个区域的用途，恰为 `EFFECT_REGION_USES[role]` 的每个用途各一次。每个用途规定可接受的区域长度：固定字节数；面表为 4 的倍数；导弹类型表为 `MISSILE_RECORD_BYTES` 的倍数；立即数为 1 或 4 字节，1 字节按符号扩展。
  - 不合规时报 `invalid-declaration`，位置在 `effects.declarations` 之下。
- **流程：** `runEffectStep(source, mappings, declarations, limits, usage)` 依次执行：
  1. **配对：** 声明与映射一一对应，否则为 `invalid-declaration@effects.declarations[<i>]` 或 `@effects.declarations`。弹丸映射的第一个部件须为 `MAIN/SR.NOB` 中的 RENS 整条目，其余部件都是区域，数量等于声明的用途数；不符时为 `invalid-declaration@effects[<ID>].source`。区域长度不合用途时为 `@effects[<ID>].regions[<k>]`。这些检查都在读取之前。
  2. **核验：** 经步骤内读取用 `verifySourceMappings` 核验：读取 RENS 条目；区域只核对覆盖，未覆盖时为 P2-03 的 `path-not-covered`，位置为 `sources.mappings[…]`。
  3. **读取：** 经与图形步骤共用的 `stepRegionReader`，每个 EXE 经 `openFile` 打开一次，以 `openLeExecutable` 读结构（失败位置为首个读取它的 Asset 的 `.source`），再按 Asset ID 升序读出全部区域（`.regions[<k>]`）。
  4. **校验：** 按格式规则校验，位置如下：
     - RENS 头部问题与 `effectRecords` 在 `.source`；
     - 弹丸记录与导弹类型在 `.records[<i>]`，`ringSegments` 也在这里；
     - 面表与模板顶点在 `.templates[<j>]`（弹丸 0、1；导弹的尾翼、元素、带标志元素、附加元素依次为 0–3；碎片 0、1）；
     - 常量、缩放、颜色与类型数（`missileTypes`）在所在区域的 `.regions[<k>]`。
  5. **扣除与编码：** 每个 Asset 按 `assets` 1、依赖边、`effectPayloadLength`，以及 `effectExpansionSize` 给出的 `vertices` 与 `triangles` 扣除，位置为 `effects[<ID>]`；扣除之后才编码。
  6. **来源状态：** 全部成功后，把核验后的映射标为 `verified`，由置信度给出来源状态。
- **结果：** 形状同图形步骤结果（`EffectStepResult`）。任一失败都使整步失败，不输出结果；P2-02 的光盘层失败原样传出。
- **生产输入：** [production-effects.ts](../../../src/original-data/conversion/production-effects.ts) 按 executable 记录的地址与长度列出每个 Asset 的区域，经文档化的对象基址换算为对象序号与偏移（`PRODUCTION_EFFECT_REGIONS`），并据此生成 `PRODUCTION_EFFECT_DECLARATIONS` 与 `PRODUCTION_EFFECT_MAPPINGS`。
  - 映射置信度 likely，带 U-027；弹丸另映射 RENS 条目 `PRODUCTION_RENS_ENTRY`。
  - 导弹依赖 `image/missile`，碎片依赖生产贴图表第 16 行。
  - 颜色立即数按参数顺序列出，即压栈顺序的逆序。源码只有地址与长度，没有原版字节。
  - `PRODUCTION_EFFECT_PAYLOAD_BOUND` 为 16,384 字节，测试按结构限值下的最大 payload 断言不超过它；展开上界 5,534 个顶点也由测试断言。
- **合成来源：** [production-effects.test-support.ts](../../../src/original-data/conversion/production-effects.test-support.ts) 先用任意数值生成三个期望 payload，面表字数与生产区域一致，再写成合成数据：
  - `syntheticRensEntry` 生成 RENS 条目；
  - `syntheticEffectExecutable` 生成四个对象的合成 LE 文件，生产区域之外为生成的图案，可按用途改写区域或加入修正记录；
  - 期望用量为 `PRODUCTION_EFFECT_USAGE`。
- **位置语法：** [conversion.test-support.ts](../../../src/original-data/conversion/conversion.test-support.ts) 的 `inEffectLocationGrammar` 按 spec 写出 `effects.declarations…`，以及 `effects[<ID>]` 单独或后接 `.source`、`.regions[<k>]`、`.records[<i>]`、`.templates[<j>]`；`expectSourceError` 对 `effects` 开头的位置逐个核对，原因文本同样经 `namesPrivateDetail` 检查。
