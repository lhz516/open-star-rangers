---
type: plan
status: accepted
phase: P2
task: "01"
updated: 2026-10-04
related: [ADR-0003, ADR-0007, ADR-0014, ADR-0015, U-001, U-003, U-020, U-022, U-023, U-027, U-028, U-029, U-030]
reviewed: sha256:b8e48c05b46d
---

# P2-01：切片资源边界与内容契约 — Spec

## 问题与目标

P1 已证明合成 Core、Runtime、渲染和 UI 可以端到端运行，但当前没有正式的规范内容模块，也没有一份可供 P2 各转换任务和 P3 共同使用的切片资源边界。现有解析结果仍以原版封包条目和 payload 结构表示；若各任务分别选择任务、机型、资源 ID、版本字段或“完整”判据，会产生不一致的 Asset ID、重复转换逻辑和无法验证的部分成功。

本任务建立 P2 的**最小内容契约和唯一切片定义**：优先选择三组共用的开场任务作为任务候选，以中间难度组为基准配置，并定义支持 P3 起飞至任务结果闭环所需的逻辑资源角色、表现资源角色、来源定位、依赖闭包、版本/来源身份、预算维度和完整性判定。后续解析、转换、缓存、查看器与 Core 载入任务实现这些契约，不得各自维护另一份切片清单。

本任务不声称资源已转换、任务已能载入 Core或玩法已可运行。完成后的可观察结果是：纯 TypeScript 内容契约能在 Node 中验证合成清单，仓库中存在一份不含原版内容的切片定义，且本地研究可以按确定性规则把它绑定到基准版原始资源或明确报告候选不合格。

阶段范围依据[总计划 §12](../../master-plan.md#12-开发阶段与验收条件)，任务导航见[阶段索引](../tasks.md#p2-01-切片资源边界与内容契约)。P1 本地退出已经通过，但 [STATUS](../../../STATUS.md) 尚未授权阶段切换；本 spec 的生成、审阅或批准均不自动启动实现或改变阶段状态。

## 范围

### 包含

- **S-01 切片选择规则：** 定义唯一的 `classic-p2-slice`。首选任务为 [SCCT 三组共用的 slot 0](../../../original/formats/scenario.md#4-scct-campaign-table-confirmed-structure-likely-meaning)，基准配置使用中间难度组；只有本地证据确认该任务能覆盖 P3 闭环、一个玩家机型、一至两个敌方机型、一个基地及必需空间数据时，才能把其结构选择器写入生产切片定义并锁定。资格证据取得前，本任务保持未完成。
- **S-02 确定性回退：** 首选任务不合格时，不静默放宽资源范围。按 SCCT 任务槽顺序评估候选，选择满足同一资格条件且规范资源依赖闭包最小的候选；先比较必需 Asset 数量，再比较依赖边数，仍相同时取难度组索引和任务槽索引字典序最小者。更换候选属于本契约的实质变化，须记录证据并重新取得用户批准；若没有候选满足资格，本任务阻塞且不得通过验收。
- **S-03 资源角色清单：** 定义任务、玩家飞船、1–2 种敌机、基地、普通弹药/弹丸、导弹、碎片、前视 HI 驾驶舱、切片所需 HUD/MFD/字体、战略地图图形，以及开火/导弹/爆炸/Warp 音效的必需角色；任务直接或间接引用的额外资源不能为满足数量目标而删除。
- **S-04 稳定 Asset ID：** 为规范内容定义与原版条目编号分离的稳定语义 ID。ID 在同一内容 schema 内不因原版文件路径、NOB entry ID、缓存位置或转换实现改变；所有跨资源引用只使用 Asset ID。
- **S-05 内容清单与版本：** 定义内容 schema 版本、切片定义版本、转换器版本、切片 ID、来源类别、来源身份、manifest 身份和 Asset 描述符。合成 fixture 与原版导入采用可判别来源，合成清单不得被判为已导入原版内容。
- **S-06 来源选择与研究状态：** 在 `original-data/` 的计划新增契约中记录光盘相对路径、封包条目定位、子资源定位、证据置信度和受影响的 U 项；原版定位不进入 Core 或表现消费者的规范内容类型。
- **S-07 依赖闭包与完整性：** 定义纯验证入口，检查必需角色基数、唯一 ID、类型匹配、引用存在、无自引用/依赖环、来源身份、payload 身份和可用状态。组级验证解析组内闭包并输出尚待其他组满足的类型化外部要求；全包验证解析全部跨组要求。完整性由数据推导，不接受调用者传入的 `complete: true`。
- **S-08 独立交付单元：** 明确模型/材质、驾驶舱/HUD/地图、音效和任务逻辑数据可以分别形成已验证的资源组；整个 `classic-p2-slice` 只有在全部必需组及跨组引用通过后才完整。部分组不得冒充完整包。
- **S-09 预算契约：** schema 1 的预算维度封闭为 Asset 数、依赖边数、源读取字节、规范 payload 字节、顶点数、三角形数、图像像素数、调色板条目数、字形数、音频采样数、任务对象数和任务引用数。上限与用量均为完整维度记录及非负安全整数，不适用维度写 0；具体安全限值由读取/转换任务在消费不可信输入前批准，不在本任务猜测数值。增删或改变维度单位属于内容 schema 不兼容变化。
- **S-10 数据所有权：** 内容契约是无 DOM/Node/Three.js/Web Audio/IndexedDB 依赖的可结构化克隆纯数据；数组和二进制 payload 的所有权规则对 Worker、缓存和消费者一致，不暴露可由消费者修改的共享内部状态。
- **S-11 研究交接：** 选定候选所依赖但尚未确认的机型、阵营、部件、布局、字符或音效含义，必须链接 U-022/023/027/028/029/030 等权威登记项及明确的下游责任；不得以语义命名把“高概率/未确认”提升为已确认。
- **S-12 契约验证与文档对齐：** 使用代码生成的合成清单覆盖正常和失败路径，保持纯模块边界、现有工程检查和原版隔离；若本地选择研究产生新事实，只更新 `docs/original/` 的权威记录并从本任务证据链接，不把原版内容写入 spec 或 fixture。

### 不包含

- 不实现 CCD/IMG、ISO9660、随机访问字节端口、NOB 增量读取、版本哈希或来源指纹算法；P2-02/03 负责。`SourceFingerprint` 在本任务中是由 P2-03 生产的非空不透明身份。
- 不实现导入 Worker、消息协议、取消或浏览器 File 适配；P2-04 负责。
- 不解析或转换图像、字体、模型、材质、驾驶舱、HUD、地图、音效、SCEN/SCCT payload；P2-05 至 P2-09 负责。为选择候选进行的只读本地研究不成为产品解析器。
- 不实现 IndexedDB、缓存键、事务、迁移或清理；P2-10 负责。本任务只提供后续缓存必须携带的版本和身份字段。
- 不实现 React 导入流程、资源查看器、Three.js/Web Audio 消费、Core 正式任务载入、飞行、AI、武器、Warp、地图交互、基地交互或任务结算。
- 不确定碰撞体、光照、AI、生成时钟、Warp 能量、战争迷雾或胜负规则；这些仍由 P3 的原版行为研究与玩法契约决定。
- 不覆盖完整战役、其余舰船/视角/资源、通讯、视频、音乐、存档、BIN/CUE、独立 ISO、ZIP/文件集、缓存迁移/清理、CI 或部署。
- 不创建通用资源插件系统、全局 schema、全局 `shared/types/utils`、glTF/PNG/WAV 文件导出格式或新的依赖。

### 涉及模块

| 模块 | 责任与影响 |
|---|---|
| 计划新增 `src/content/` | 拥有 Asset ID、切片定义、内容清单、资源角色/分组、版本、预算维度和完整性验证；当前目录不存在 |
| 计划新增 `src/original-data/` 内来源选择契约 | 拥有原版光盘/NOB/子资源定位、研究状态及到规范 Asset ID 的映射；不把来源结构放入 `content/` |
| 计划新增的相邻 `*.test.ts` 与 `synthetic` helper | 代码生成合成内容清单，验证 ID、依赖闭包、版本、来源区分、预算和失败原子性；不读取 `local/` |
| [现有 original-data](../../../../src/original-data/) | 当前只有 IMFAT、部分 payload 解析器和合成格式构造器；本任务复用错误与纯数据模式，不修改其格式事实 |
| [Core](../../../../src/core/)、`render/`、`platform/`、`workers/`、`app/`、`ui/` | 本任务不接线；未来只消费各自所需的规范内容视图，不获得原版来源定位或可修改清单 |
| [工程配置](../../../../tsconfig.core.json)与[边界回归](../../../../tools/engineering-boundaries.test.ts) | 已将 `src/content` 纳入无 DOM/Node 的纯类型程序；实现不得放宽现有边界 |

## 当前实现与依据

- `src/content/` 和 `src/workers/` 当前不存在；[源码结构指南](../../../engineering/source-structure.md#职责与依赖)只规定其计划职责，不是已有 API。
- [imfat.ts](../../../../src/original-data/imfat.ts)定义 `ImfatEntry`/`ImfatArchive`，所有条目仍以原版 ID、type、offset、size 表示；[payloads.ts](../../../../src/original-data/payloads.ts)返回图像、字体、网格和模型的解析结构。两者均没有稳定 Asset ID、内容版本、切片角色或完整包判定。
- [synthetic.ts](../../../../src/original-data/synthetic.ts)只构造原版格式测试字节；它不是规范内容 fixture，也不能作为原版来源身份。
- [core 类型配置](../../../../tsconfig.core.json)已经把 `src/content` 与 `src/core`、`src/original-data` 放在同一个无 DOM/Node 的纯模块程序；[工程约定](../../../engineering/README.md#typescript-配置)和 [ADR-0015](../../../decisions/ADR-0015-source-module-structure.md)禁止建立全局 schema 或空目录。
- [P0 可行性评审](../../../reviews/P0-feasibility.md#3-p2-所需资源类型的现状)确认主要资源类型可解析，但浏览器导入、规范内容、Worker 和缓存均未实现；不能把研究工具输出当作本任务已经存在的清单。
- 任务内容位于 `SCENARIO.NOB` 已确认；SCCT 三组 slot 0 指向同一个 SCEN 的结构已确认，但“三组是三个难度版本”为**高概率**，见 [scenario §4](../../../original/formats/scenario.md#4-scct-campaign-table-confirmed-structure-likely-meaning)和 U-003。采用中间组是首选 slot 0 的代表性基准选择，不宣称为原版默认难度；首选不合格后的实际基准组见[候选选择记录](#候选选择记录)。
- 玩家相对的敌我分类已按种类确认，见 [executable](../../../original/formats/executable.md#player-target-modes-and-enemy-classification)；任务对象的其余字段仍未完全确认（U-022），僚机记录用途为高概率（U-023）。因此候选资格必须保留研究状态，不能仅凭当前字段猜测未确认的语义。
- 玩家机型与部分 M2ID 槽位、纹理颜色已有证据；其余机型、MODL 部件/音效槽、驾驶舱地图调色板和字体映射仍分别受 U-027/028/029/030 约束，见[未知项登记表](../../../original/unknowns.md#数据与格式)。
- P2 只覆盖玩法切片且可与 P3 重叠是 [ADR-0007](../../../decisions/ADR-0007-narrow-p2-overlap-p3.md) 的冻结决定；本任务不把 P2 扩成全量内容转换。

## 行为与边界

### 切片候选选择

候选选择是受证据约束的项目配置，不是运行时随机选择：

1. 首先解析/研究 SCCT 三组共同引用的 slot 0 SCEN；以组索引 1 作为后续难度相关默认值的基准，任务内容仍使用共同 SCEN。
2. 候选必须有足够证据支持：一个玩家机型、至少一种且至多两种敌方机型、一个基地或承担基地交互的对象、任务结果所需数据，以及战略地图/Warp 所需空间对象。未知字段可以登记研究依赖，但不能用猜测填成已确认资源映射。
3. 切片清单同时要求阶段固定的表现/反馈角色（前视 HI 驾驶舱、HUD/MFD/字体、战略地图图形、四类核心音效，以及弹丸/导弹/碎片表现）。它们可以是任务外的固定运行资源，但仍属于同一闭包。
4. 若首选任务不满足第 2 项，任务实现停止把它标为已选；输出安全的“不合格 + 缺失角色/证据”结果。随后按 S-02 规则评估候选，不根据外观或个人偏好选择。
5. 回退候选一旦改变任务、敌机集合或必需资源闭包，先修订本 spec 的选择记录并重新审批；不得让 P2-05 至 P2-09 各自换成更方便的资源。

本任务完成时必须记录结构选择器、难度组、所需配置、逻辑角色和资源角色；原版 entry ID/子资源索引可以由来源映射记录，但原版名称、任务文字、图片、音频和字节不进入本文或公开 fixture。

### 候选选择记录

2026-10-04 的本地资格核对结果如下。本记录按上方第 4、5 步给出回退结果，不改变 S-01/S-02 规则、资格条件或其他契约；它已经审阅，并于 2026-10-04 经用户重新批准生效。同日按 AC-13 把记录中复述的原版事实改为链接权威记录，选择结论不变；该修订经另一模型审阅，并于 2026-10-04 经用户重新批准。

- **首选不合格：** 按 [scenario 候选证据](../../../original/formats/scenario.md#p2-slice-candidate-evidence)，共用 slot 0 未通过资格核对。练习模式的排除及其与 slot 0 的**高概率**关联见 [B-002](../../../original/behavior/B-002-practice-mode.md)；不据此断言 slot 0 没有基地、通讯或 Warp。
- **资格结论：** group 0 / slot 1 的本任务资格已有证据，见 [01 资格覆盖表](./subtasks/01-candidate-qualification.md#当前资格证据覆盖)及其链接的原版记录；其他通过[结构门槛](../../../original/formats/scenario.md#p2-slice-candidate-evidence)的候选未逐个核实完整资格。结构门槛不等于完整资格，候选资格也不等于精确玩法公式或资源包完整性已确认。
- **S-02 比较：** 按已批准的[规范单位](../../../../src/content/asset-units.ts)及 S-02 全战役规则，比较结论为 group 0 / slot 1。包含关系论证及其他候选资格未知不影响排序的依据见 [01 选择证据](./subtasks/01-candidate-qualification.md#完成证据)；部分投影的计数限制见[资格覆盖表](./subtasks/01-candidate-qualification.md#当前资格证据覆盖)。绝对规范总数与来源映射仍由 [02](./subtasks/02-slice-content-contract.md) / [03](./subtasks/03-source-mapping-boundary.md) 完成，不把部分投影当作完整规范总数。
- **选定候选：** 结构选择器为 SCCT group 0 / slot 1，基准难度组为 group 0。该槽位对应的 SCEN 条目见 [scenario 候选来源概况](../../../original/formats/scenario.md#campaign-candidate-source-profiles-confirmed-structure)；选组规则及用户试玩的同一 group/slot 绑定见 [scenario §4](../../../original/formats/scenario.md#4-scct-campaign-table-confirmed-structure-likely-meaning)和 [B-003](../../../original/behavior/B-003-campaign-flow.md)。上方第 1 步的中间组只适用于首选 slot 0；用户已于 2026-10-03 接受 S-02 字典序兜底不保证保留中间组，见 [goal 执行记录](./goal.md#执行记录)，该决定不构成对本回退候选的批准。
- **所需配置：** 僚机可选；该配置的模型闭包影响及研究边界见 [01 资格覆盖表](./subtasks/01-candidate-qualification.md#当前资格证据覆盖)与 [U-023](../../../original/unknowns.md#数据与格式)。具体选择语义与生成门禁仍由 P3 处理。
- **逻辑角色：** 任务使用该 SCEN 的整任务 Asset；任务结果所需数据及战略地图/Warp 所需空间对象按同一资格条件纳入切片。资格证据与未确认字段/规则的边界见 [01 资格覆盖表](./subtasks/01-candidate-qualification.md#当前资格证据覆盖)，不把可观察流程外推为精确规则已确认。
- **资源角色：** 玩家飞船为 1 个模型 Asset；敌机恰为 2 个模型 Asset；基地/基地交互对象为 1 个模型 Asset。任务另引用 1 个友方模型，它不是 S-03 的必需角色，但作为额外引用资源保留在闭包中。各角色对应的 M2ID 槽位见以下权威记录：
  - [scenario 候选来源概况](../../../original/formats/scenario.md#campaign-candidate-source-profiles-confirmed-structure)；
  - [executable 敌我分类](../../../original/formats/executable.md#player-target-modes-and-enemy-classification)；
  - [slot-1 交互种类证据](../../../original/formats/executable.md#bounded-slot-1-interaction-kind-evidence)。

  角色证据见 [01 资格覆盖表](./subtasks/01-candidate-qualification.md#当前资格证据覆盖)。S-03 的固定表现与音效角色不变，其来源映射由 [02](./subtasks/02-slice-content-contract.md) / [03](./subtasks/03-source-mapping-boundary.md) 记录；未确认的部件、布局、字体和音效含义仍分别受 [U-027/028/029/030](../../../original/unknowns.md#数据与格式)约束。

### Asset ID 与角色

- Asset ID 是规范内容身份，格式为 `<kind>/<semantic-path>`：仅允许小写 ASCII 字母、数字和单个连字符组成的非空段，段以 `/` 分隔；schema 1 最多 8 段、每段最多 32 个字符、总长最多 128 个字符。不得接受空段、连续/首尾连字符、`.`/`..`、反斜杠、查询/片段符号、前后斜杠或 Unicode 同形字符。
- `kind` 是本 schema 的封闭集合，至少覆盖 `mission`、`model`、`image`、`palette`、`font`、`layout`、`sound` 和 `data`。Asset 描述符的 `kind` 必须与 ID 首段一致。
- 语义路径表达消费者角色，不复制原版文件名或 entry ID。例如玩家主模型、主要敌机、Warp 音效是稳定角色；来源映射可从一个原版条目换到另一个经批准条目，而消费者 ID 不变。
- `role` 与 `id` 分开：角色用于切片必需基数验证，ID 用于引用。每个单值必需角色恰有一个 Asset；敌机角色允许一个或两个不同 Asset，且选定任务直接依赖的敌机类型必须全部包含。
- 非必需依赖仍须有 ID、kind 和来源/合成身份，不能以匿名内嵌对象绕过闭包；纯数值/短标签只有在其 owner payload 内没有独立复用或版本身份时才可内嵌。
- 同一 manifest 中 ID 唯一。依赖数组保持规范顺序且不能重复；验证结果不得依赖对象属性枚举顺序或 `Map` 插入副作用。

## 数据模型与契约

### 清单、来源与版本

内容清单至少表达以下纯数据；具体文件拆分由 goal 决定，不建立统一大 schema：

| 数据/字段 | 类型、单位与约束 | 权威所有者 | 输入/输出或序列化边界 |
|---|---|---|---|
| `AssetId` | 品牌化字符串；符合上述语法和固定上限 | `content/` | 所有规范内容引用；不接受原版 entry ID 直接代入 |
| `SliceId` | 当前唯一值 `classic-p2-slice` | `content/` | 切片定义、清单、缓存和 P3 配置的共同身份 |
| `ContentSchemaVersion` | 正安全整数；初始版本为 `1` | `content/` | 不兼容的清单/Asset 语义变化必须递增 |
| `SliceDefinitionVersion` | 正安全整数；初始版本为 `1` | `content/` | 候选、必需角色/基数、资源分组或来源映射语义变化时递增；防止不同定义的组被混装 |
| `ConverterVersion` | 非空、受限 ASCII 不透明值；不得从应用版本静默推导 | 转换管线，契约归 `content/` | 每次转换写入；P2-10 后续组成缓存身份 |
| `ContentOrigin` | 判别联合：`synthetic` 携带 fixture ID；`original-import` 携带 `SourceFingerprint` | `content/`；指纹由 P2-03 产生 | 完整性和 UI 事实来源；两种来源不能互相伪装 |
| `SourceFingerprint` | 非空、不透明、格式受限；本任务不决定哈希算法 | P2-03，类型边界由 `content/` 消费 | 仅标识已验证来源；文件名/卷标/FNV 状态哈希不合法 |
| `ManifestIdentity` | 非空、受限 ASCII 不透明值；相同的切片定义、描述符、依赖、payload 身份和来源映射状态产生相同值，其中任一变化必须改变值 | 转换管线，格式与一致性契约归 `content/` | 每个组结果和全包共同携带；具体生成算法由 P2-03 与转换任务批准 |
| `PayloadIdentity` | 每个 Asset 的正安全整数 payload schema 版本、非负安全整数字节长度和 `sha256:<64 个小写十六进制字符>` 的规范 payload 指纹 | 各转换任务，格式与验证契约归 `content/` | 绑定描述符、转换结果和缓存 payload；不能只检查“存在”或长度 |
| `AssetDescriptor` | `id`、`kind`、角色、资源组、规范有序依赖及 `PayloadIdentity` | `content/` | manifest 与各转换结果的公共元数据 |
| `ResourceGroup` | `logic`、`models`、`cockpit-hud-map`、`audio` | `content/` | 支持独立交付状态；全包完整性要求所有必需组 |
| `SliceDefinition` | 候选结构选择器、基准配置、必需角色及允许基数、组要求 | `content/` | 后续任务只读；更换候选需修订契约 |
| `OriginalAssetLocator` | 光盘相对路径、archive entry ID/type、可选子资源路径；全为有限纯数据 | `original-data/` | 解析/转换和安全诊断；不交给 Core/Renderer/Audio |
| `SourceMapping` | `AssetId` → 一个或多个 locator、置信度、证据/U 项、解析状态 | `original-data/` | 本地研究和转换入口；未确认状态不得显示为已验证 |
| `ResourceBudgetLimits/Usage` | schema 1 的十二个 S-09 维度均存在且为非负安全整数；未知、缺失或单位不符失败 | `content/` 定义维度，各解析/转换任务给出限值和用量 | 读取/转换前及累计过程中检查，不以溢出后的值判定 |
| `GroupCompletenessResult` | 判别联合 `group-complete` 或 `incomplete`；成功含规范有序的跨组外部要求和完整包身份，失败含稳定 code、Asset/role 路径和安全原因 | `content/` | 独立转换任务、Worker 和查看器诊断共同消费；不得冒充全包结果 |
| `PackageCompletenessResult` | 判别联合 `complete` 或 `incomplete`；只有四组身份一致且跨组要求全部解析时成功，失败形状与组结果共用稳定诊断契约 | `content/` | Node、缓存、P2-11 和后续 Core 载入门禁共同消费；不得含原版 payload/私人绝对路径 |

- `ContentOrigin`、manifest、描述符、依赖和验证结果必须是结构化克隆可表达的 plain data；生产契约不含函数、类实例、DOM 节点、Three.js/Web Audio/IDB 对象。
- 描述符不存放可漂移的 `complete` 布尔值。验证入口从 `SliceDefinition`、manifest、实际 payload 的版本/长度/指纹和来源状态推导结果；payload 被交换、截断、损坏或来自另一版本时不得通过。
- 原版来源定位与规范 ID 是多对一/一对多均可表达的映射：一个模型可能依赖多个原版 MESH/TEX，一个原版调色板也可能供多个规范 Asset 使用。消费者只见规范依赖。
- 置信度使用项目已有 `confirmed` / `likely` / `unconfirmed` 语义；它描述研究证据，不等于 payload 校验通过。必需 Asset 若仍为 `unconfirmed`，完整性结果必须指出研究阻塞，不能自动降级为 optional。
- 所有清单和结果对调用者表现为只读值。实现若缓存内部对象，须冻结/复制容器；二进制 payload 后续采用显式转移或独占副本，发送方转移后不得继续使用，消费者不得修改共享给其他消费者的视图。

### 完整性与失败

| 场景或状态转换 | 预期结果 | 拒绝或失败时的反馈 |
|---|---|---|
| 合法合成清单覆盖全部角色、组和依赖 | 返回 `complete`，保留 `origin: synthetic`；只能证明契约完整 | 不得把结果改写为原版导入成功 |
| 合法原版导入清单且来源映射已验证 | 返回 `complete`，保留 `SourceFingerprint`、schema 和 converter 版本 | 指纹缺失/格式错误时为 manifest 错误 |
| 缺失必需角色、资源组、payload 或组内依赖 | 不产生部分成功或补默认资源 | `incomplete`，稳定 code 指明 role/Asset/依赖路径 |
| 组级验证遇到合法的跨组引用 | 组结果保留类型化外部要求，不把其他组缺失误报为本组不完整 | 全包验证时外部要求必须全部解析，否则全包 `incomplete` |
| payload 身份与实际版本、长度或 SHA-256 不符 | 整个所属组无效，不接受同长度替换或旧版本 payload | payload 身份错误，指明规范 Asset ID，不输出 payload |
| 组结果的切片定义版本、manifest 身份、schema、converter 或 origin 不一致 | 不混装为全包 | 包身份错误，要求同一导入/转换结果 |
| 敌机为 0 或超过 2，或遗漏任务引用敌机 | 保持输入不变，不裁剪列表 | 角色基数或任务闭包错误 |
| 重复 ID、kind 与 ID 不符、重复依赖、自引用或依赖环 | 整个清单无效 | 结构错误，给出安全的规范 ID 路径 |
| 必需来源映射为未确认、定位缺失或类型冲突 | 资源组和全包均不完整 | 研究/来源错误，链接相应 U 项身份，不输出原版内容 |
| 用量超过任一预算或整数溢出 | 立即拒绝当前清单/累计操作 | 稳定预算 code、维度、limit/observed；不分配声明规模的 payload |
| 未知 schema、切片 ID、资源组、kind 或必需角色 | 不宽松读取、不忽略未知必需值 | 版本/枚举错误，要求升级或重新导入 |
| 调用者修改输入数组/对象或先前返回值 | 已验证内部结果和后续调用不受影响 | 若契约无法隔离修改，实现不通过 |

错误 code 的完整枚举由实现契约固定，至少能区分：语法/版本、角色基数、缺失引用、类型不匹配、重复/环、payload 身份、包身份、来源/研究未就绪和预算。面向用户的本地化文案不属于本任务；不得依赖 Error message 文本分类。

### 资源组与消费者边界

- `logic`：任务、战略地图/Warp 所需规范数据及其逻辑引用；最终由 P2-09 和 Core 载入边界消费。
- `models`：玩家、敌机、基地、弹丸/导弹/碎片及纹理/调色板依赖；最终由 P2-05/06 与 Renderer 消费。
- `cockpit-hud-map`：前视驾驶舱、HUD/MFD、字体、地图边框/图标及依赖；最终由 P2-05/07 与 Renderer 消费。
- `audio`：四类核心音效及必要来源对应；最终由 P2-08 与平台音频适配消费。
- 一个组可以在其他组未完成时独立得到 `group-complete`：其组内闭包必须完整，跨组引用以规范有序、无重复的外部要求返回；结果必须携带切片、切片定义版本、schema、converter、manifest 和 origin 身份。P2-11 只有在四组身份完全相同、所有外部要求解析且跨组引用共同通过时才可显示整个切片可用。
- Core 只接收 `logic` 中的规范数据和 Asset ID；Renderer/Audio 通过 ID 解析自己的 payload。任何消费者都不能读取 `OriginalAssetLocator`、NOB type/entry ID、缓存记录或 Worker 消息。

### 持久化与兼容

本任务不读写 IndexedDB/localStorage，也不定义数据库 schema、事务或清理策略。它只冻结 P2-10 建立缓存键和兼容判定所需的逻辑身份：

- `SliceId`、`SliceDefinitionVersion`、`ContentSchemaVersion`、`ConverterVersion`、`ManifestIdentity` 与 `SourceFingerprint` 必须独立存在，不能用单个应用版本替代。
- schema `1` 尚无兼容历史；实现前可以在本 spec 重新批准后修改。任何消费者或持久化数据开始依赖后，不兼容变化须递增 schema，并由缓存层明确拒绝/重新导入，不能静默解释旧数据。
- fixture ID 不能作为原版来源指纹；原版 source fingerprint 算法、缓存 key 编码、原子提交、损坏/配额/驱逐恢复分别由 P2-03/10 规定。

## 技术决定

- 采用“规范内容定义 + 原版来源映射”双层契约，而不是把 NOB entry ID 作为 Asset ID。这样 P3/Renderer/Audio 不依赖原版封包结构，后续支持其他基准来源时可替换映射而不改消费者。
- Asset ID 使用严格的 ASCII 语义路径和封闭 kind；不采用数字 ID、文件路径、UUID 或自由 URL。数字来源 ID 不稳定，UUID 不可审阅，自由路径/URL 会泄漏来源布局并扩大安全表面。
- schema 1 固定 Asset ID 的 8 段、每段 32 字符、总长 128 字符上限，并固定十二个预算维度；这些值足以表达本切片的可审阅语义路径和主要资源规模，同时给验证器明确边界。改变上限、维度或单位属于 schema 变化。
- 首选三组共用开场任务，中间难度组只作为代表性配置；这利用已确认的共同 SCEN 结构并减少初始分支，不声称中间组是原版默认。若资格验证失败，按 S-02 回退并重新审批。
- 完整性由纯验证函数推导，部分组和全包使用不同结果；不保存调用者可伪造的完成标志，不用空数组/占位 Asset 形成成功形状。
- schema 与切片定义初始版本均为 1；转换器版本、manifest 身份、payload 指纹和来源指纹保持独立。Core 的 FNV 状态哈希不是任何内容指纹。
- 契约与验证位于纯 `content/`；来源定位位于 `original-data/`。不建立中央 schema 文件、全局 barrel、浏览器适配或空 Worker 接口，遵守 [ADR-0015](../../../decisions/ADR-0015-source-module-structure.md)。
- 本任务无需新 ADR：以上决定细化现有总计划、ADR-0007 和模块边界，没有改变冻结阶段范围。若用户要取消 CCD/IMG 主来源、扩成全量内容或改变顶层模块，必须先更新 ADR/总计划。

## 验收标准

| ID | 可观察的通过条件 | 验证方法与所需证据 |
|---|---|---|
| AC-01 | 仓库只有一份 `classic-p2-slice` 定义，且其中恰有一个经本地资格证据确认的候选；首选 SCCT 共用 slot 0、中间组配置、资格条件和回退规则与 S-01/02 一致；没有合格候选时任务阻塞，后续测试/消费者不复制另一份必需角色清单 | Node 契约测试读取真实生产定义并断言单一已选候选；源码搜索与边界测试证明无第二份生产切片常量；本地研究记录结构选择和资格结果，不记录原版内容；首选不合格时保留回退选择、spec 修订和重新审批证据 |
| AC-02 | 切片定义包含 S-03 的全部角色、四个资源组及允许基数；敌机恰为 1–2，任务直接/间接引用不能被角色上限裁剪 | 表驱动 Node 测试逐项断言角色/组/基数，负向清单覆盖 0、3 个敌机、缺基地、缺每个固定角色及遗漏任务引用 |
| AC-03 | Asset ID 语法、kind 一致性、稳定角色 ID 及 8 段/32 字符单段/128 字符总长上限均由单一生产入口验证；原版文件名/entry ID/缓存位置不能作为规范 ID | 合法边界和空段、连续或首尾连字符、遍历、Unicode、分隔符、过长、kind 不符等负向测试；测试证明只更换等价 `OriginalAssetLocator` 不改变 Asset ID/依赖 |
| AC-04 | 内容 schema=1、切片定义版本=1、converter version、slice ID、manifest 身份、payload 身份和判别来源均显式存在；synthetic 与 original-import 无法用相同字段形状互相冒充 | 类型检查加运行时读取/验证测试；缺字段、未知版本、非法 SHA-256、fixture 冒充指纹、原版来源缺指纹均失败 |
| AC-05 | 原版定位只存在于 `original-data/` 来源映射；Core、render、platform/audio 和 `content/` 的消费者契约不包含 disc path、NOB type/entry ID 或子资源定位 | TypeScript/ESLint 边界回归与源码依赖检查；合成映射验证一对多、多对一和类型冲突 |
| AC-06 | 完整性验证从定义、manifest、实际 payload 身份和来源状态推导 `group-complete`/`complete`/`incomplete`，组结果与全包结果是不同判别联合，不接受或保存可伪造完成布尔值 | Node 正向组和全包清单通过；逐项缺角色/组/payload/组内依赖、交换或截断 payload、同长度错误指纹、重复 ID/依赖、自引用、环、kind 错误和未确认来源均返回预期稳定 code |
| AC-07 | 四个资源组按组内闭包独立判定并输出类型化跨组要求；只有四组包身份完全一致且全部跨组要求有效时全包完整，部分结果不能被 P2-11 当全包 | 组合测试覆盖每个单组及其外部要求、3/4 组、跨组缺失、全组成功，以及不同切片定义版本/manifest/schema/converter/origin 的组混装拒绝；断言结果判别值不同且无成功形回退 |
| AC-08 | 预算 limits/usage 均完整包含 S-09 的十二个已知维度、单位一致且为非负安全整数；超过、缺失、未知维度或加法溢出在声明规模分配前失败 | 表驱动纯预算契约测试逐个维度覆盖等于上限和超过 1，并覆盖负数、非整数、`MAX_SAFE_INTEGER` 累加溢出、缺失/未知维度及不适用维度为 0，断言稳定 code/limit/observed |
| AC-09 | manifest、定义、映射和结果是可结构化克隆的纯数据；调用者修改输入、先前返回的容器或二进制视图不能改变内部定义、缓存验证结果、其他消费者或后续调用 | Node 所有权测试覆盖嵌套数组/对象、共享 `ArrayBuffer`/TypedArray 别名、独占副本及 transfer 后发送方失效；生产类型程序无 DOM/Node/Three.js/Web Audio/IndexedDB 导入 |
| AC-10 | 本地候选研究最终安全输出首选任务“合格”，或输出“不合格及缺失角色/证据”后按 S-02 选出并重新批准一个合格回退候选；无合格候选时任务保持阻塞；未知机型/阵营等保持对应 U 项状态，不因语义 ID 命名而升级置信度 | 使用开发者本地合法数据和只读工具核对；证据只记录结构选择器、ID/类型/计数、U 项和判定，原版字符串/字节/图像/音频/反编译输出留在 `local/`；生产定义与最终资格结论一致 |
| AC-11 | 合成 fixture 明确标记 synthetic，自动测试不读取原版文件；仓库、构建和测试输出不新增原版内容或转换产物 | 检查 fixture 生成入口、测试文件访问和 git diff；运行受影响的原版隔离检查，零新增 finding |
| AC-12 | `src/content` 被现有纯模块类型/lint边界覆盖，现有 IMFAT/payload API 和 P1 synthetic 契约未被重命名或泛型化，本任务不引入依赖 | `pnpm typecheck`、`pnpm lint`、针对性 Vitest 和最终 `pnpm check`；检查依赖清单/锁文件无变化及现有测试保持通过 |
| AC-13 | 新研究事实只落在 `docs/original/` 权威位置，`tasks.md`/spec 只链接；源码结构和契约说明与实际导出一致 | 文档链接/元数据检查、事实归属审阅与最终 diff 审阅；没有复制原版内容或创建 goal/subtask |

## 验证策略

- **单元/契约测试：** 在计划新增的 `src/content/` 和 `src/original-data/` 契约旁放置 `*.test.ts`；使用代码生成的 manifest、来源映射和预算数据。测试稳定 ID、角色基数、依赖图、版本/来源判别、分组/全包完整性、错误 code、预算算术和所有权隔离。
- **Replay/一致性：** 不适用。本任务不创建或推进 Core 世界，不改变 P1 replay 格式。确定性要求体现在同一输入清单和定义必须得到结构相同、规范顺序一致的验证结果。
- **浏览器验证：** 不需要 E2E 作为完成条件；本任务无 UI、Worker、File、IndexedDB、Canvas/WebGL 或音频行为。结构化克隆边界由纯数据类型和 Node 契约测试验证，真实 Worker 在 P2-04 验收。
- **实机/原版对照：** 需要一次开发者本地只读候选资格核对，但不是视觉/音效保真对照。核对共用 slot 0、任务/难度选择、玩家/敌机/基地与空间数据的结构证据，并记录安全统计和 U 项；若不合格，执行 S-02 回退并重新审批。视觉、布局和听感对照归 P2-06/07/08/12。
- **工程检查：** 迭代时运行 `pnpm exec vitest run src/content src/original-data`（按实际新增测试路径收窄）和 `pnpm exec vitest run tools/engineering-boundaries.test.ts`；完成前运行 `pnpm check`、受影响的 Python/Ghidra 检查（只有工具变化时）及 `pnpm check:original`。本任务不要求浏览器 runner、CI 或部署。
- **文档检查：** 验证 front matter、相对链接、S/AC 唯一性和 U/格式引用；检查 `git status`/diff，确保没有 `local/`、研究输出、原版 payload 或无关阶段状态变化。

## 风险与恢复

风险等级：**中。** 这是所有 P2 转换和 P3 内容消费的基础身份/完整性契约；过早选错任务或 ID 语义会造成多任务返工，但当前尚无已发布缓存或正式存档需要迁移。

- **候选任务实际不适合闭环：** 首选只在本地资格核对通过后锁定；失败按确定性规则给出回退候选并重新审批，不让下游静默分叉；没有候选合格则本任务阻塞。恢复方式是取得缺失证据或修订经批准的切片范围；消费者开始依赖后须提升切片定义版本，必要时同时提升 schema/转换器版本并使旧缓存失效。
- **U-022 等未知字段造成错误映射：** 来源映射保留置信度和研究依赖；必需 unconfirmed 映射阻止完整结果。恢复依赖对应原版研究更新和重新转换，不用 fallback 模型或默认阵营伪装成功。
- **Asset ID 过度绑定来源或过度抽象：** 语义角色与 locator 分层，kind 封闭，只覆盖本切片真实消费者。新增资源按所属任务扩展，不提前建设通用插件/编辑器。
- **版本或完成状态漂移：** schema、切片定义、converter、manifest、payload 与 source 身份分离，组级和全包完整性始终重算。尚无旧数据；一旦 P2-10 持久化，任何不兼容变化必须显式递增相应版本并要求重新导入。
- **预算维度有契约但无安全限值：** 本任务只统一维度；P2-02 至 P2-09 的 spec 必须在读取/分配不可信数据前给出依据明确的上限。若下游未批准限值，该读取/转换任务不能完成。
- **原版内容泄漏：** 自动化只用代码生成数据，本地证据只记录结构 ID、类型、计数与判定；现有合规扫描和人工 diff 作为收尾门禁。发现泄漏时删除具体受影响的未提交文件/输出，更新安全 fixture 后重跑检查；不重写无关工作树。

## 未决事项

无。候选资格的本地事实核对是已批准契约的执行前置验收条件，而不是待用户决定的行为选择；若核对不能证明首选或确定性回退合格，任务按已批准的阻塞规则停止。2026-10-04 用户已确认采用 S-02 选出的回退候选 group 0 / slot 1。

## 审批

用户于 2026-10-03 明确批准本 spec 的 2026-10-03 版本契约及范围，批准范围包括 S-01 至 S-12、AC-01 至 AC-13、首选共用 slot 0 / 中间组策略、确定性回退规则、规范内容与来源映射分层、四组资源完整性及预算/所有权约束。候选资格的本地事实证据仍是执行期前置验收条件；它不改变已批准的选择策略，未取得合格候选时任务必须保持 blocked。

2026-10-04 修订：按 S-02 加入[候选选择记录](#候选选择记录)，记录首选不合格及回退候选 group 0 / slot 1。S/AC、选择规则和其他契约均未改变。该修订经另一模型审阅后，用户于 2026-10-04 明确选择“批准修订”，采用候选选择记录中的回退候选 group 0 / slot 1 及其基准难度组、所需配置和角色。批准范围为修订后的 S-01 至 S-12 与 AC-01 至 AC-13；本 spec 恢复为 accepted。

2026-10-04 修订（事实归属）：最终对齐按 AC-13 发现候选选择记录复述了原版事实，用户选择修订 spec。候选记录与上一条审批记录中的 SCEN 条目，以及 M2ID 槽位与角色的对应，都改为链接 `docs/original/` 中的权威记录。候选、角色构成、配置、S/AC 与其他契约均不变。修订稿经另一模型审阅，未发现问题；用户于 2026-10-04 明确选择“批准修订”，本 spec 恢复为 accepted。
