---
type: plan
status: accepted
phase: P2
task: "09"
updated: 2026-10-05
related: [ADR-0003, ADR-0007, ADR-0015, U-003, U-008, U-022, U-023, U-025, U-026, U-028, U-031, B-001, B-003, B-004, B-005]
reviewed: sha256:3590e3a126bc
---

# P2-09：单任务与战略地图/Warp 数据 — Spec

## 问题与目标

[P2-01](../01/spec.md#候选选择记录) 已把切片锁定为 SCCT group 0 / slot 1，并规定 `logic` 资源组承载任务与逻辑数据；[P2-03](../03/spec.md) 提供了已验证来源与按需封包读取；[P2-04](../04/spec.md) 提供了 Worker 导入作业与组结果协议。但目前：

- 没有 SCCT/SCEN 的产品解析器，也没有把任务对象转换为规范内容的入口；仓库中只有研究工具对任务结构的只读统计。
- `content/` 没有规范任务、机型或空间框架的数据形状；Core 只有明确标记的[合成场景](../../../../src/core/synthetic/synthetic-scene.ts)，没有消费正式任务数据的入口。
- 生产导入作业只识别来源，不产生任何组结果；生产 `ConverterVersion` 与 `ManifestIdentity` 的生成方式尚无任务承担，而四个资源组必须共享同一身份才能组成完整包。
- [U-022](../../../original/unknowns.md#数据与格式) 中切片实际依赖的空间字段（段 6、编组布局）和地图框架在本 spec 首次批准时仍未确认，[U-023](../../../original/unknowns.md#数据与格式) 的僚机记录用途为高概率。S-01、S-02 的研究结果见[研究门槛与阻塞](#研究门槛与阻塞)。

本任务交付**所选任务的逻辑数据管线**：先定向研究所选任务实际使用的字段与地图/Warp 空间框架，再从用户本地已验证来源读取 SCCT、SCEN 与 M2ID，转换为 `logic` 组的规范内容，接入 P2-04 导入作业，并在 Core 中提供纯载入边界，把规范任务转换为 Core 自有的初始逻辑数据。

完成后可以观察到：

- Node 合成测试证明，解析、规范内容、组装配、Worker 传输与 Core 载入的正向与失败路径都符合契约；
- 在开发者本机的基准镜像上，生产作业得到 `group-complete` 的 `logic` 组，Core 载入成功，结构计数与原版文档一致。

任务规则（生成时钟推进、AI、迷雾、Warp 公式、停靠与结算）仍归 P3。阶段范围依据[总计划 §12](../../master-plan.md#12-开发阶段与验收条件)（“一个任务及战略地图/Warp 所需数据”“一个任务的数据能载入 Core”），任务导航见[阶段索引](../tasks.md#p2-09-单任务与战略地图warp-数据)。本 spec 的生成或审阅不启动实现，也不改变阶段状态。

## 范围

### 包含

- **S-01 字段清单研究：** 在本地对所选任务做定向研究，覆盖以下来源：
  - 所选 SCEN 的头部与各段；段 1 记录、段 5 模板与成员数组；
  - SCCT 的僚机记录；
  - 实际引用的 M2ID 槽位。

  按[源字段处理](#源字段处理)逐项判定处理方式，每个出现非默认值的字段或段都要有结论。研究必须确定段 6 与段 5 布局指针对规范空间数据的影响，并确认名称文本的字节范围。结论写入 [scenario](../../../original/formats/scenario.md)，只记录结构、计数与置信度；同时更新 U-022/U-023。
- **S-02 空间框架研究：** 确定位置的坐标轴约定，以及主地图显示的世界区域（地图框架）的来源与形状；确认 Warp 是否有任务数据之外的静态空间数据。按[研究结果的四种结论](#空间框架的研究结论)之一记录到 `docs/original/`，必要时新增 U 项。可用本地静态分析或已有截图对照取证。
- **S-03 定向解析：** 在 `src/original-data/` 计划新增的任务转换模块中（目录由 goal 决定），实现以下读取：
  - 经 `VerifiedSource` 读取 SCCT，按 `CLASSIC_P2_SLICE.candidate` 取 SCEN 条目 ID 与僚机记录；
  - 读取所选 SCEN 和 M2ID；SCEN 内按[源字段处理](#源字段处理)解析头部、段 0、段 1、段 3、段 5、段 6 与记录引用的段 2 事件触发头部。

  读取规则如下：
  - 只读取这些条目；
  - 指针只承认重定位表中的位置，目标及其结构必须完整位于数据块内；
  - 执行[限值](#限值与预算)；
  - 对“非默认即不支持”的输入失败关闭。
- **S-04 规范逻辑内容：** 在 `src/content/` 计划新增[规范逻辑数据](#规范逻辑数据)的类型、确定性编码与严格读取器：
  - 包括任务（含按 S-02 结论 2 写入的地图框架、生成矩形与编组布局）、机型表与僚机名单；
  - 读取器校验结构、限值、内部引用，以及 payload 引用与描述符依赖的一致性；
  - 结果冻结，并与输入隔离。
- **S-05 机型与模型绑定：** 在 `original-data` 提供唯一的生产绑定，把切片引用的机型绑定到 model Asset ID，按[命名规则](#机型与模型绑定)固定。[P2-06](../tasks.md#p2-06-切片模型与材质转换) 必须采用同一绑定，不另建第二份。
- **S-06 生产来源映射：** 为 `logic` 组的每个 Asset 建立生产来源映射表，用 P2-03 的 `verifySourceMappings` 核验。带子资源的部件只有在本任务的转换器解析子资源并与其他部件核对一致后，才升为 `verified`；之后才由 `assetSourceStates` 推导来源状态。
- **S-07 包身份与转换器版本：** 交付两项共享机制，供 P2-05 至 P2-08 复用：
  - 唯一的生产 `ConverterVersion` 常量；
  - 由同一作业全部组草稿确定性推导的 `ManifestIdentity`。

  若 P2-05、P2-08 已批准的 spec 先定义了等价机制，实现前须对齐为一份。
- **S-08 逻辑组装配与预算：** 输出符合 P2-01 `GroupInput` 的 `logic` 组：清单、独占 payload 与来源状态。以 `CLASSIC_P2_SLICE` 调用 `validateGroup` 时，结果须为 `group-complete`，跨组外部要求恰为绑定的 model Asset。转换过程中按本 spec 批准的预算计量。
- **S-09 导入作业接入：** 在生产导入作业的识别之后追加 `convert-logic` 阶段，转换完成后发送 `logic` 组。阶段集合变化须递增 `IMPORT_PROTOCOL_VERSION`；两端校验同步更新，其余协议规则不变。
- **S-10 Core 纯载入：** 在 `src/core/` 计划新增的任务模块中提供 `loadMission`，消费已解码的规范逻辑数据，产出冻结的 [`MissionSetup`](#core-载入结果)：
  - 实际解析机型、阵营、模型与编组引用；
  - 确定唯一玩家声明；
  - 不推进时钟，不应用默认值，不消耗随机数。
- **S-11 错误与诊断：** 按[错误](#错误)扩展各层的封闭错误码。任何失败都不产生部分结果；诊断只含结构位置、规范 ID、计数与固定原因。
- **S-12 条件交付：非封包文件参数（研究后不适用）：** 原条件为 S-02 证明必需的空间参数只存在于已覆盖的非封包文件。S-02 的结论为[结论 2](#空间框架的研究结论)：地图框架参数来自所选 SCEN，因此不扩展来源映射，不实现非封包 locator；证据记录该结论。
- **S-13 合成测试与边界：** 用代码生成的合成 SCCT/SCEN/M2ID、合成光盘与合成白名单覆盖正负路径，并保持现有模块边界、Worker 网络禁用与原版隔离。测试不读取 `local/`，仓库不新增二进制样本。
- **S-14 本地基准核对与文档：** 用与 Worker 相同的作业模块，在 Node 中处理本地基准镜像，只输出结构计数与身份哈希。同步 `docs/original/`、[源码结构](../../../engineering/source-structure.md)、[工程约定](../../../engineering/README.md)与[工具指南](../../../guides/tools.md)。

### 不包含

- **玩法规则（P3）：** 不实现以下规则，P2 只提供数据与载入边界：
  - 生成队列与时钟推进、编组成员的生成与模板继承；
  - 生成位置的计算（矩形、锚点、网格、布局偏移与默认放置）、运行时单位换算与段 2 事件触发；
  - 默认值填充（含难度相关值与随机默认值）；
  - AI、名称分配、迷雾（[U-025](../../../original/unknowns.md#玩法与数值)）；
  - Warp 能量、过程与误差（[U-026](../../../original/unknowns.md#玩法与数值)）；
  - 停靠与补给（[B-004](../../../original/behavior/B-004-base-communications.md)）；
  - 救援与失败（[U-031](../../../original/unknowns.md#玩法与数值)）；
  - 任务结果条件。
- **运行时创建的对象与机型参数：** 救援对象、Warp 标记等由固定种类在运行时创建的对象，其参数记录、CINF、舰船性能与武器参数都不在本任务内。这些数据由 P3 在研究对应规则时，另行按 spec 扩展转换器。模型闭包已由 [P2-01](../01/spec.md#候选选择记录) 与 [executable](../../../original/formats/executable.md#two-allocator-paths-native-inputs-and-profile-comparison) 处理。
- **不转换的数据：** SCEN 段 2（消息文字与编组名称）、`MUSC` 与音乐、简报与通讯文字，以及 SCCT 中所选槽位之外的槽位语义。
- **其他任务的工作：**
  - 其他任务与完整战役（P4）；
  - 模型与材质转换（P2-06）；
  - 地图图形与布局（P2-07）；
  - 导入页面、查看器、缓存接线与 Core 载入诊断界面（P2-11）；
  - 联合 E2E 与原版本地对照（P2-12）。
- **不改动的部分：** 不改 Runtime 与 Session，不泛型化合成场景，不新增 Runtime 事件。
- **其他：**
  - 不新增依赖；
  - 不修改 `CLASSIC_P2_SLICE`（切片定义版本保持 1）；
  - 不修改 P2-10 的缓存记录或缓存键。

### 涉及模块

| 模块 | 责任与影响 |
|---|---|
| `src/original-data/` 计划新增的任务转换模块 | SCCT/SCEN/M2ID 定向解析、转换为规范逻辑数据、机型与模型绑定、生产来源映射表、子资源核验与生产 `ConverterVersion`；只经 `VerifiedSource` 取字节 |
| [source-mapping.ts](../../../../src/original-data/source-mapping.ts) | 只读复用；S-12 不适用，locator 的形状与校验不变 |
| [source-error.ts](../../../../src/original-data/source-error.ts) | 追加 payload 转换错误码与限值名称；已有错误码不变 |
| `src/content/` 计划新增的逻辑内容模块 | 规范逻辑数据的类型、编码与读取器；`ManifestIdentity` 推导；追加内容错误码 |
| [workers/import-job.ts](../../../../src/workers/import-job.ts) 与 [import-protocol.ts](../../../../src/workers/import-protocol.ts) | 追加 `convert-logic` 阶段与组发送，递增协议版本；宿主与 app 持有者的处理规则不变 |
| [app/import/](../../../../src/app/import/) | 仅随协议版本与阶段集合同步测试，不改状态机 |
| `src/core/` 计划新增的任务模块 | `loadMission` 与 `MissionSetup`；不触及 [synthetic/](../../../../src/core/synthetic/) |
| `tools/` | 计划新增或扩展本地核对 CLI；随 [engineering-boundaries.test.ts](../../../../tools/engineering-boundaries.test.ts) 更新边界回归 |
| `docs/original/`、`docs/engineering/`、`docs/guides/` | 研究结论、模块与工具说明 |

## 当前实现与依据

- **切片与内容契约（已实现，P2-01）：**
  - [slice-definition.ts](../../../../src/content/slice-definition.ts)：`CLASSIC_P2_SLICE.candidate` 为 `{ campaignGroup: 0, campaignSlot: 1 }`，`logic` 组拥有 `mission` 与 `data` 两类，`mission` 角色恰为 1 个；`configuration.wingman` 为 `optional`。
  - [asset-units.ts](../../../../src/content/asset-units.ts) 规定计数单位：`mission` 为整任务，对象、引用、数值和短标签是任务的内部元素；`data` 为可独立复用的逻辑数据。
  - [completeness.ts](../../../../src/content/completeness.ts) 的 `validateGroup` 由清单、payload 与来源状态推导组结果。依赖本组不拥有的类别时，记为类型化外部要求。
  - [content-identity.ts](../../../../src/content/content-identity.ts) 的 `ContentIdentity` 有六项身份，`contentIdentityKey` 要求各组完全相同。生产 `ConverterVersion` 与 `ManifestIdentity` 尚无产生者，只有合成测试值。
  - [budget.ts](../../../../src/content/budget.ts) 已定义 `missionObjects`、`missionReferences` 等十二个维度，但没有具体限值。
  - [ownership.ts](../../../../src/content/ownership.ts) 规定 payload 的独占与转移。
- **来源与读取（已实现，P2-03）：**
  - [identify-source.ts](../../../../src/original-data/source/identify-source.ts) 的 `VerifiedSource` 提供 `openArchive` 与 `openFile`。[生产白名单](../../../../src/original-data/source/source-catalog.ts)按大小与 SHA-256 覆盖 `MAIN/SCENARIO.NOB`、`MAIN/SR.NOB` 与 `MAIN/SRANGERS.EXE`。
  - [archive-reader.ts](../../../../src/original-data/archive/archive-reader.ts) 读取条目，返回独占块字节与重定位位置。
  - [source-mapping.ts](../../../../src/original-data/source-mapping.ts) 的 `SOURCE_ENTRY_TYPES` 允许 `mission` 来自 SCCT/SCEN，`data` 来自 M2ID/SCCT 等。仓库中还没有生产映射表。
  - [verify-source-mappings.ts](../../../../src/original-data/source/verify-source-mappings.ts) 只把不含子资源的映射升为 `verified`，带子资源的留给理解该 payload 的转换器。
  - [payloads.ts](../../../../src/original-data/payloads.ts) 有通用 `parseIdList`，供 M2ID/NEBC 使用；没有 SCCT/SCEN 解析器。
- **导入作业（已实现，P2-04）：**
  - [import-job.ts](../../../../src/workers/import-job.ts) 只识别来源并返回用量。
  - [import-protocol.ts](../../../../src/workers/import-protocol.ts) 中 `IMPORT_PROTOCOL_VERSION` 为 1，阶段集合只有 `identify-source`；上游错误码只按 token 语法校验。
  - [import-host.ts](../../../../src/workers/import-host.ts) 把 `SourceError`、`DiscReadError`、`ContentContractError` 分别映射到对应错误层，其余异常一律报 `internal-error`。
  - [app 作业持有者](../../../../src/app/import/import-job-owner.ts)以 `validateGroup` 重新验证每个组。组消息格式与验证顺序见 [P2-04 消息协议](../04/spec.md#消息协议)。
- **Core：**
  - 当前只有 [synthetic/](../../../../src/core/synthetic/) 场景、[errors.ts](../../../../src/core/errors.ts) 的 `CoreInputError` 与确定性 helper。
  - [ESLint 配置](../../../../eslint.config.js)允许 Core 导入 `content/`，禁止导入 `original-data/` 与宿主时间、随机数。
  - [tsconfig.core.json](../../../../tsconfig.core.json) 不含 DOM 与 Node 类型，纯模块没有 `TextDecoder`。
- **原版依据（只链接；事实与置信度以链接文档为准）：**
  - [scenario §1–§4](../../../original/formats/scenario.md)：SCEN 头、段表、132 字节记录与 SCCT 的结构和字段置信度；[段 5 成员数组](../../../original/formats/scenario.md#section-5-member-records-confirmed-access)；所选候选的[来源概况](../../../original/formats/scenario.md#campaign-candidate-source-profiles-confirmed-structure)。
  - [executable §4](../../../original/formats/executable.md#4-code-landmarks)：任务构建、重新缩放与默认值填充的代码位置；[玩家目标模式与敌我分类](../../../original/formats/executable.md#player-target-modes-and-enemy-classification)；[基地交互种类判定](../../../original/formats/executable.md#bounded-slot-1-interaction-kind-evidence)；[运行时分配点](../../../original/formats/executable.md#two-allocator-paths-native-inputs-and-profile-comparison)。
  - [hud §3](../../../original/formats/hud.md#3-id-lists-confirmed-structure)：M2ID 的结构。
  - [B-001](../../../original/behavior/B-001-strategic-map.md)：地图与 Warp 的已知行为及其未确认部分；其中没有地图对应的世界区域。
  - [B-003](../../../original/behavior/B-003-campaign-flow.md)、[B-004](../../../original/behavior/B-004-base-communications.md)、[B-005](../../../original/behavior/B-005-campaign-rescue.md)：所选任务的试玩流程、基地交互与救援。
- **相关冻结决定：**
  - [ADR-0007](../../../decisions/ADR-0007-narrow-p2-overlap-p3.md)：P2 只做切片，可与 P3 重叠。
  - [ADR-0015](../../../decisions/ADR-0015-source-module-structure.md)：模块内按职责细分，不建全局 schema。
  - [ADR-0003](../../../decisions/ADR-0003-disc-image-primary-import.md)：P2 只支持开发者的 CCD/IMG。

## 行为与边界

| 场景或状态转换 | 预期结果 | 拒绝或失败时的反馈 |
|---|---|---|
| 已验证的基准来源进入 `convert-logic` 阶段 | 读取 SCCT、所选 SCEN 与 M2ID 后转换并核验来源，得到 `group-complete` 的 `logic` 组，随后 `finished.groups` 为 `['logic']` | 不适用 |
| SCCT 中 group/slot 超出范围，或槽位的 SCEN ID 与映射表的 SCEN 部件不一致 | 不发送任何组 | `failed`，`source` 层的 `subresource-mismatch`，位置为结构路径 |
| 条目或结构越界、指针不在重定位表中、计数超限、种类有多个比特、坐标非有限、名称不是可打印 ASCII | 在分配与遍历之前拒绝，不返回部分声明 | `invalid-payload`；结构限值或预算超限时为 `limit-exceeded`，带限值名、限值与观测值 |
| 所选任务出现“非默认即不支持”的字段或段 | 不忽略，也不补默认值 | `unsupported-payload`，位置指出字段或段 |
| 引用的机型在 M2ID 中为 0、超出表长，或同一 MODL 绑定到不同 model ID | 不产生机型表 | `invalid-payload` |
| 规范 payload 被篡改、不是规范编码，或引用与描述符依赖不一致 | 读取器拒绝；主线程以 `validateGroup` 核对时，payload 身份不符的组为 `incomplete` | `ContentContractError` 对应 code；组诊断沿用 P2-01 |
| 转换中光盘或封包层失败（坏扇区、预算、取消） | 原样传递，不发送组 | P2-02/P2-03 的 code 与位置 |
| 作业被取消 | 沿用 P2-04：终止 Worker，丢弃已收结果 | 不适用 |
| `loadMission` 收到合法逻辑数据 | 返回冻结、与输入隔离的 `MissionSetup`；相同输入得到深度相等的结果 | 不适用 |
| `loadMission` 收到结构非法、引用不一致、没有或有多个玩家声明的数据 | 不返回部分结果 | 内容层错误原样传递；Core 前提不满足时抛出 `CoreInputError(path, reason)` |

### 源字段处理

本表把[scenario §2–§4](../../../original/formats/scenario.md)中的结构位置映射到规范处理；语义与置信度以该文档为准，所选任务的逐项计数见[切片字段清单](../../../original/formats/scenario.md#selected-mission-field-inventory-confirmed-structure)。

“非默认即不支持”指：所选任务中该处若出现非零或非空值，转换以 `unsupported-payload` 失败。指针字段的处理分两步：

- **登记与边界：** 不在重定位表中、目标或其结构不完整位于数据块内，为 `invalid-payload`。
- **目标结构：** 已登记且在块内，但不是本表要求的结构起点（例如 +0x44 不指向段 3 元素的起点），为 `unsupported-payload`。

| 来源位置 | 规范处理 |
|---|---|
| SCEN 头 0x08（坐标参考比例） | 写入 `coordinates.referenceScale`，必须为有限正数 |
| SCEN 头 0x00 与 0x04（世界扇区数） | 写入 `mapFrame`（S-02 [结论 2](#空间框架的研究结论)）：`halfExtent` 为扇区数 × `referenceScale` ÷ 2，中心为原点。两者必须相等，且在 1–32767 之间（原版只取低 16 位）。为 0 时为 `invalid-payload`；不相等或超过 32767 时为 `unsupported-payload` |
| SCEN 头 0x0C | 非默认即不支持 |
| 段 0（名称备用池） | `namePool`：按表序的字符串列表，规则同候选名称；名称分配规则归 P3 |
| 段 1（对象记录） | 每条记录生成一个声明，来源标记为 `object` |
| 段 2 | 不转换（P3/P4 交接）；只读取记录 +0x54 引用的事件触发头部，见该行 |
| 段 3（生成矩形） | `spawnRegions`：按表序，每项为 4 个 i32（x0、y0、x1、y1），参考单位，原样保留 |
| 段 4 | 非空即不支持 |
| 段 5（编组） | 每项生成一个编组：+8 模板与 +12/+16 成员数组中的每条记录都成为声明（来源标记 `group-template`、`group-member`）。模板与成员必须是段 1 记录的别名，否则为 `unsupported-payload`（原版只重新缩放段 1 记录，只经段 5 到达的记录单位不同）；`members` 按数组顺序，允许重复；+0 原样写入 `spawnCount`；+4 引用的段 6 项写入 `layout`。+20、+24 为运行时字段，必须为零，否则为 `unsupported-payload` |
| 段 6（编组布局） | 只作为段 5 的布局读取，每项写入引用它的编组的 `layout`；元素为 f32 x、y、z，运行时单位，原样保留，只复现原版的载入变换：交换第 0 个元素的 y 与 z。原版循环会越过表尾读取下一个计数字：该字（按 i32 读取）不在数据块内为 `invalid-payload`，大于 0 为 `unsupported-payload`；某项不被任何段 5 引用或元素数为 0 也为 `unsupported-payload` |
| 记录 +0x00（种类） | `craftType`：取单比特的位序号；0 记为 null；有多个比特为 `invalid-payload` |
| 记录 +0x04、+0x08（候选名称） | `nameCandidates`：有序字符串列表 |
| 记录 +0x0C、+0x10、+0x60、+0x64、+0x68、+0x70、+0x74、+0x78 | 作为规则输入原样保留：源值 0 记为 null，其余按 scenario 记录的源类型（u32 或 i32）保留原值；不应用默认值或截断 |
| 记录 +0x1C | `spawnTime`：按 u32 读取，使用源单位 |
| 记录 +0x24、+0x28、+0x2C | `position`：有限数值，参考单位；全零时原样保留，放置规则归 P3 |
| 记录 +0x3C（成员回指） | `memberOf`：编组序号。必须指向列出该记录的段 5 项，且该记录只被这一项列出；反之，每个成员记录的 +0x3C 都必须指向列出它的项。不一致为 `unsupported-payload` |
| 记录 +0x40（网格间距） | `gridSpacing`：有符号 32 位整数，参考单位 |
| 记录 +0x44（生成矩形） | `placement.region`：段 3 元素序号 |
| 记录 +0x48（放置锚点） | `placement.anchor`：被引用记录的声明序号；目标须为段 1 记录、模板或成员记录的起点 |
| 记录 +0x54（事件触发） | 不转换：必须指向段 2 表的第一个元素，且该触发头部的生成配对指针与数量（+0x14、+0x18）均为零，即只含消息范围；否则为 `unsupported-payload` |
| 记录 +0x58（AI 目标记录） | `aiTarget`：被引用记录的声明序号；目标要求同 +0x48 |
| 记录 +0x5C | `aiTargetCraftTypes`：掩码中各比特的位序号，升序 |
| 记录 +0x30、+0x38、+0x4C | 不转换；非默认即不支持 |
| 记录中未列出的字节 | 不转换；必须为零，否则为 `unsupported-payload`。所选任务中已全部为零 |
| SCCT 僚机记录 | 与对象记录使用同一套处理，来源标记为 `wingman-option`；+0x3C、+0x44、+0x48、+0x54、+0x58 非默认即不支持（SCCT 没有段表）；位置 +0x24–+0x2C 与 +0x40 非默认即不支持（原版不重新缩放 SCCT 记录） |
| SCCT 所选槽位的 SCEN ID | 只用于核对映射表中的 SCEN 部件；`MUSC` ID 与组名不读取 |

### 研究门槛与阻塞

- S-01、S-02 先于依赖其结论的实现完成。结论写入 `docs/original/`，只含结构、计数、置信度与证据路径，不含原版数值表、文字或反汇编。
- 规范数据使用的每个值，读取方式必须已确认，语义至少为高概率并链接 U 项。未确认语义只能以“不转换”或“非默认即不支持”处理。
- 以下任一情况出现时，先合并修订本 spec 并取得用户重新批准；受影响的验收在此之前保持阻塞，不得以忽略、合成值、近似规则或硬编码补齐：
  - S-01 发现所选任务使用了“非默认即不支持”的位置；
  - 段 6 或编组布局影响规范空间数据；
  - S-02 的结论不属于下文三种可交付结论。
- 研究使用本地基准数据与只读分析，过程产物留在 `local/`。

**2026-10-05 研究结果与修订：** S-01 触发了门槛。所选任务使用了原定为“非空即不支持”的段 3、段 5 布局与段 6，以及原定为“非默认即不支持”的记录 +0x3C、+0x44、+0x48、+0x54、+0x58；所有记录的位置与 +0x40 都为零，放置完全依赖矩形、锚点与布局；头部 0x00/0x04 决定世界范围。依据见[scenario](../../../original/formats/scenario.md)与 [executable](../../../original/formats/executable.md#mission-placement-scheduling-and-world-grid)，置信度以其为准。本 spec 据此合并修订一次：

- [源字段处理](#源字段处理)按上表转换这些位置；
- [规范逻辑数据](#规范逻辑数据)增加名称备用池（段 0 不是只经候选名称访问，而是原版的备用名称来源）、生成矩形、放置引用、成员回指、AI 目标与编组布局；
- 地图框架采用 S-02 的结论 2。

段 6 的载入变换在所选任务中不改变数据，但转换器仍按原版循环复现。段 2 的消息、生成位置的计算规则仍归 P3/P4。

### 空间框架的研究结论

S-02 的结论必须是以下四种之一：

1. **全局静态参数：** 地图框架参数与任务无关，作为独立的 Asset，任务引用它。若参数只存在于主程序等非封包文件，需要非封包 locator（S-12）。
2. **任务内静态参数：** 参数来自所选 SCEN 本身，作为任务的内部元素 `mapFrame`。
3. **没有静态参数：** 投影只由任务数据与运行时状态决定，投影规则交给 P3，并附证据。
4. **未能确定：** 本任务阻塞，向用户报告。

**研究结论为结论 2：** 主地图显示整个世界扇区网格，范围由 SCEN 头 0x00/0x04 与 0x08 决定，以原点为中心，是轴对齐正方形。地图向右为 +x，向上为 −y；竖直方向为 z。未发现 Warp 专用的静态空间数据：Warp 目的地由地图点击按同一框架换算。事实与置信度以 S-02 写入 `docs/original/` 的记录为准；记录与本段不符时按研究门槛处理。因此只交付 `mapFrame`，不存在独立的地图框架 Asset，S-12 不适用。Warp 目的地的竖直坐标、耗能与过程规则归 P3。

## 数据模型与契约

规范数据位于 `content/`，原版定位、绑定与转换位于 `original-data/`，载入结果位于 `core/`。各处类型均为计划新增，文件划分由 goal 决定；不建立统一 schema。

### `logic` 组的 Asset

| Asset ID | kind / role | 内容 | 依赖（规范有序） | 来源部件 | 映射置信度 |
|---|---|---|---|---|---|
| `mission/first-campaign` | `mission` / `mission` | 所选任务，含地图框架（结论 2） | `data/craft-types`、`data/wingman-roster` | SCCT（子资源 `group-0/slot-1`）与对应 SCEN | `likely`，U-022 |
| `data/craft-types` | `data` / `craft-types` | 切片声明引用的机型表 | 绑定的全部 model Asset（跨组外部要求） | `MAIN/SR.NOB` 的 M2ID | `likely`，U-022、U-028 |
| `data/wingman-roster` | `data` / `wingman-roster` | SCCT 中的可选僚机记录 | `data/craft-types` | SCCT（子资源 `wingmen`） | `likely`，U-023 |

- 每个 Asset 的 payload schema 版本为 1；任何不兼容的形状变化都须递增，并递增 `ConverterVersion`。
- 映射置信度为 `likely` 不阻止完整性；只有 `unconfirmed` 阻止完整性（[P2-01](../01/spec.md#清单来源与版本)）。研究若把语义提升为已确认，映射置信度随之更新。

### 机型与模型绑定

转换器按以下规则产生机型条目，绑定由 `original-data` 唯一维护：

- **取哪些机型：** 只取所选任务声明与僚机名单实际引用的机型，种类序号来源见[来源概况](../../../original/formats/scenario.md#campaign-candidate-source-profiles-confirmed-structure)。
- **阵营与基地交互：** 阵营按[玩家目标模式](../../../original/formats/executable.md#player-target-modes-and-enemy-classification)推导为 `player`、`friendly` 或 `enemy`。是否属于基地交互类别，按[交互种类判定](../../../original/formats/executable.md#bounded-slot-1-interaction-kind-evidence)推导为 `baseInteraction`，并在类型文档中注明“基地”含义为高概率。
- **model Asset 命名：** 每个机型经 M2ID 解析到非零 MODL 条目，再按以下规则命名：
  - 玩家机型的 MODL：`model/player-ship`；
  - 敌方机型，按种类序号升序：`model/enemy-ship-1`、`model/enemy-ship-2`；
  - 基地交互机型，按种类序号升序：`model/base-1`；
  - 其余友方机型，按种类序号升序：`model/friendly-craft-1` 等。

  同一 MODL 条目只有一个 ID，使用相同 MODL 的机型（例如僚机种类）共用该 ID。
- **与 P2-06 的关系：** P2-06 用同一绑定命名其 model Asset，并在自己的验收中核对 MODL 一致。若 P2-06 的 spec 需要不同的 ID，必须先修订本 spec，不得两套并存。

### 规范逻辑数据

**`MissionContent`**（`mission/first-campaign` 的 payload）：

| 字段 | 类型与约束 |
|---|---|
| `campaign` | `{ group, slot }`，均为非负安全整数，等于切片候选 |
| `coordinates` | `{ unit: 'scen-reference', referenceScale, layoutUnit: 'scen-runtime' }`；比例为有限正数。位置、生成矩形、`gridSpacing` 与地图框架使用参考单位；编组布局偏移使用原版运行时单位（原版载入时不缩放布局）。本任务不做两种单位之间的换算 |
| `references` | `{ craftTypes, wingmanRoster }`，均为 `AssetId`，必须与描述符依赖完全一致 |
| `mapFrame` | `StrategicMapFrame`，不可为 null |
| `namePool` | 字符串数组，按段 0 的表序；每项为 1–63 个可打印 ASCII 字符（0x20–0x7E） |
| `spawnRegions` | `{ x0, y0, x1, y1 }[]`，按段 3 的表序；每项为有符号 32 位整数 |
| `declarations` | `MissionDeclaration[]`，按 `index` 从 0 起连续；顺序为段 1 的表序，然后段 5 的组序、模板、成员序中首次出现的记录。同一记录被多处引用时，只生成一个声明并合并来源标记 |
| `groups` | `MissionGroup[]`，按段 5 的顺序 |

**`MissionGroup`：**

| 字段 | 类型与约束 |
|---|---|
| `template` | 声明序号，该声明带 `group-template` 来源标记 |
| `members` | 声明序号数组，按成员数组顺序，可以重复或为空；每个声明带 `group-member` 来源标记 |
| `spawnCount` | 0 至 2³²−1 的整数，段 5 +0 原样保留；字段名不表示语义已确认 |
| `layout` | `{ x, y, z }[]`，至少 1 项，有限数值，规范化后不含 -0；运行时单位，已复现原版载入变换 |

**`MissionDeclaration`：**

| 字段 | 类型与约束 |
|---|---|
| `index` | 非负安全整数 |
| `origins` | 来自 `object`、`group-template`、`group-member`、`wingman-option` 的非空集合，按此顺序排列，无重复 |
| `craftType` | 0–31 的整数或 null |
| `nameCandidates` | 字符串数组；每项为 1–63 个可打印 ASCII 字符（0x20–0x7E） |
| `position` | `{ x, y, z }`，有限数值，规范化后不含 -0 |
| `spawnTime` | 0 至 2³²−1 的整数，使用源单位；单位含义见 [scenario §3](../../../original/formats/scenario.md#3-132-byte-object-record-structure-confirmed-fields-partly-likely) 与 U-008 |
| `gridSpacing` | 有符号 32 位整数，参考单位 |
| `placement` | `{ region, anchor }`：`region` 为 `spawnRegions` 序号或 null；`anchor` 为声明序号或 null |
| `memberOf` | 编组序号或 null；非 null 时，该声明必须出现在该编组的 `members` 中，且不出现在其他编组的 `members` 中；反之，每个编组成员的 `memberOf` 都等于该编组 |
| `aiTarget` | 声明序号或 null |
| `ruleInputs` | 8 个字段，依次对应源字段处理表中原样保留的 8 个位置：`percentA`、`craftCount` 为 null 或 0 至 2³²−1 的整数（源类型为 u32）；`percentB`、`percentC`、`percentD`、`aiValueA`、`aiValueB`、`aiValueC` 为 null 或有符号 32 位整数（源类型为 i32）。字段名不表示语义已确认 |
| `aiTargetCraftTypes` | 0–31 的升序唯一整数数组 |

**`CraftTypeTable`**（`data/craft-types`）：`entries` 按 `craftType` 升序，每项为 `{ craftType, side, baseInteraction, model }`。`side` 取 `player`、`friendly` 或 `enemy`；`model` 为 `{ id, kind: 'model' }`。条目集合必须恰为任务与僚机名单引用的机型的并集；`player` 恰有一个机型。

**`WingmanRoster`**（`data/wingman-roster`）：`references.craftTypes` 为 `AssetId`；`options` 为 `MissionDeclaration[]`，`origins` 恰为 `['wingman-option']`，`index` 在名单内从 0 起连续；`placement` 的两项、`memberOf` 与 `aiTarget` 都为 null。僚机的选择与生成门禁归 P3（U-023）。

**`StrategicMapFrame`**（结论 2，任务的 `mapFrame`）：

| 字段 | 类型与约束 |
|---|---|
| `rightAxis`、`upAxis` | 取 `+x`、`-x`、`+y`、`-y`、`+z`、`-z` 之一，两者轴不同 |
| `center` | `{ right, up }`，有限数值 |
| `halfExtent` | 有限正数 |

单位与 `MissionContent.coordinates.unit` 相同。坐标轴、中心与扇区数到半边长的换算属于格式知识，按 S-02 写入的记录实现；扇区数与比例在导入时从所选 SCEN 读取。

**规范编码：**

- 每个 payload 是只含可打印 ASCII 的 JSON 文本，按字节存储；字段顺序按本契约固定，没有空白。数字使用 ECMAScript 最短往返表示，-0 写为 0；不允许非有限数。
- 读取器先检查字节长度限值，再逐字节解码（不依赖 `TextDecoder`）并解析。随后严格校验：缺少字段、未知字段、类型错误、超限与引用错误都失败。
- **校验分工：** 读取器只校验单个 payload 内部的引用，失败为 `logic-reference-mismatch`：
  - 声明序号连续；
  - 编组引用的声明存在，并带对应的来源标记；
  - `placement.region` 指向存在的生成矩形，`placement.anchor` 与 `aiTarget` 指向存在的声明；
  - `memberOf` 与编组成员互相一致（见 `MissionDeclaration`）；
  - 名单序号连续，名单声明的放置引用、成员回指与 AI 目标都为 null；
  - 字节解码入口同时接收该 Asset 的描述符，核对 payload 内的 Asset 引用与描述符依赖一致；Core 使用的纯数据读取器没有描述符，不做这项核对。

  跨 Asset 的一致性由转换器在装配时、Core 在载入时校验，例如机型表恰覆盖任务与名单引用的机型、唯一玩家声明。
- 解码再编码的结果必须与输入逐字节相同，否则为 `non-canonical-payload`。
- 相同内容的编码逐字节相同，因此 payload 指纹确定。

### Core 载入结果

`loadMission(input)` 是 Core 的纯函数：

- **输入：** `{ mission, craftTypes, wingmanRoster }`。每项为 `{ id: AssetId, content: unknown }`。
- **重新读取：** Core 用 `content/` 读取器重新读取每个 `content`，不信任调用者给的类型；单个 payload 内部的引用错误由读取器以内容层错误报告，Core 原样传递。
- **前提检查：** 只检查跨 Asset 的一致性，任一不满足时抛出 `CoreInputError`，路径指向输入位置：
  - 任务引用的 ID 与传入项一致，僚机名单的 `references.craftTypes` 等于传入的机型表 ID；
  - 机型表恰覆盖任务与僚机名单引用的机型；
  - 任务中恰有一个声明解析为阵营 `player`，且没有僚机选项解析为 `player`。

输出的 `MissionSetup` 为冻结的纯数据，与输入隔离：

| 字段 | 内容 |
|---|---|
| `mission` | 任务的 `AssetId` |
| `campaign`、`coordinates`、`mapFrame`、`namePool`、`spawnRegions` | 从任务复制 |
| `declarations` | 按 `index` 排列；每项为 `MissionDeclaration` 加上解析出的 `side`、`model`（`AssetId` 或 null）与 `baseInteraction`。`craftType` 为 null 时，三者分别为 null、null、false |
| `player` | 玩家声明的序号 |
| `groups` | 从任务复制 |
| `wingmanOptions` | 以同样方式解析的僚机声明 |

载入不应用默认值，不推导生成时刻、生成顺序或生成位置，不读取 RNG，不访问宿主时间，不导入 `original-data`、DOM、IndexedDB 或 Runtime。P3 在其上建立运行世界，届时另行定义存档与 replay 的初始状态。

### 包身份与转换器版本

- **`ConverterVersion`：** 计划在 `original-data` 的转换模块中新增唯一的生产常量 `PRODUCTION_CONVERTER_VERSION`，值为符合 P2-01 token 语法的 ASCII 标识，初始值由实现选定。任一生产转换器的输出变化都要递增它，从而产生新的缓存键（[P2-10](../10/spec.md#缓存键与身份)）。
- **`ManifestIdentity`：** 计划在 `content/` 中新增纯推导函数，结果为 `manifest:sha256:<64 位小写十六进制>`：
  - 输入为确定性的 ASCII 编码，依次包含 schema 版本、切片 ID、切片定义版本、`ConverterVersion`、来源，以及作业产生的每个组（按 `RESOURCE_GROUPS` 顺序）的描述符（ID、kind、role、组、依赖、payload 身份）与来源状态；
  - 任一项变化，结果都变化。
- **作业流程：** 同一作业的全部转换完成后，导入作业计算一次身份，写入每个组清单，然后才发送组。本任务时，作业只有 `logic` 组。其他转换任务加入后，所有组共享同一身份，`validatePackage` 的身份一致性因此成立。

### 限值与预算

本表是本任务待批准的限值，spec 批准后生效。结构限值在分配或遍历之前判定；可调上限必须包容 S-14 记录的基准观测值，否则修订本 spec。

| 限值 | 值 | 依据 |
|---|---|---|
| SCCT、SCEN 单个数据块 | ≤ 262,144 字节 | 低于 `SCENARIO.NOB` 的白名单文件大小（[生产白名单](../../../../src/original-data/source/source-catalog.ts)），在读取前按目录判定；实际条目大小由 S-14 记录 |
| M2ID 数据块 | ≤ 4,096 字节 | 结构见 [hud §3](../../../original/formats/hud.md#3-id-lists-confirmed-structure)；实际大小由 S-14 记录 |
| SCCT 组数、每组槽位数、僚机记录数 | ≤ 8、≤ 64、≤ 16 | 高于 [scenario §4](../../../original/formats/scenario.md#4-scct-campaign-table-confirmed-structure-likely-meaning) 记录的结构 |
| SCEN 段 0、段 1、段 3、段 5 的元素数 | 各 ≤ 64 | 高于 [scenario §2](../../../original/formats/scenario.md#2-scen-header-confirmed-on-all-52-entries) 记录的全任务范围 |
| 段 6 的列表数、每个列表的元素数 | ≤ 16、≤ 256 | 同上；S-01 已确认需要遍历 |
| 段 5 每组成员数 | ≤ 64 | 尚无全任务观测值；S-14 记录所选任务的值 |
| 每条记录的候选名称数、单个名称长度 | ≤ 32、1–63 字节（不含 NUL） | 尚无观测值；S-01 记录所选任务的最大值 |
| 去重后每个任务的声明数 | ≤ 256 | 预算 `missionObjects` 另按任务与僚机声明的总数计量 |

预算按 P2-01 的十二个维度计量，以下各项为 `logic` 组的上限：

| 维度 | 上限 |
|---|---|
| `assets` | 8 |
| `dependencyEdges` | 32 |
| `payloadBytes` | 1,048,576 |
| `missionObjects` | 256（任务声明与僚机声明的总数） |
| `missionReferences` | 4,096 |

- **`missionReferences` 的计数：** 以下引用各计一次：声明到机型；声明的 `placement.region`、`placement.anchor`、`memberOf` 与 `aiTarget`（非 null 时）；编组到模板与每个成员位置；机型到 model Asset；payload 到其他 Asset。名称、规则输入、AI 目标机型与编组布局都不计入。
- **其余维度：** 记为 0。
- **`sourceReadBytes`：** 仍由光盘镜像句柄按作业计量，上限沿用 P2-04 的作业设置。本阶段的读取量由上面的条目大小限值约束，S-14 记录实际增量。
- **超限反馈：**
  - 结构超限为 `limit-exceeded`，带新增的限值名。
  - 预算超限：转换器把 `chargeBudget` 返回的 `over-budget` 结果转成 `SourceError('limit-exceeded')`，并在分配对应数据之前判定。`limit` 的 `name` 为超限的预算维度名，`limit` 为上限，`observed` 为本次计入后将达到的总量。经宿主映射后，主线程收到 `source` 层 DTO，带完整的 `limit`。
  - 在本契约的结构限值下，`budget-overflow` 不可达；若出现，报 `invalid-payload`。

### 错误

- **转换层（`SourceError`，`source` 层）：**
  - 追加以下错误码，已有错误码不变：
    - `invalid-payload`：结构损坏或违反格式规则；
    - `unsupported-payload`：格式合法，但用到了本契约不支持的位置；
    - `subresource-mismatch`：子资源解析结果与映射表的其他部件不一致。
  - 追加限值名 `payloadEntryBytes`、`payloadItems` 与 `textBytes`（结构限值），以及 `assets`、`dependencyEdges`、`payloadBytes`、`missionObjects` 与 `missionReferences`（与 P2-01 预算维度同名，用于预算超限）。
  - 位置使用 P2-03 的 `archive:/路径#ID` 形式，后接只含结构名与下标的路径（例如 `/records[3]/craftType`）；映射错误使用 `sources.mappings[i]…` 结构路径。都不回显字节、名称或数值。
  - 这些错误码可供 P2-05、P2-08 复用。
- **内容层（`ContentContractError`）：** 追加 `invalid-logic-payload`、`non-canonical-payload` 与 `logic-reference-mismatch`。
- **Core：** 前提失败抛出 `CoreInputError`；内容层错误原样传递。
- **协议：** 错误层集合不变，宿主映射不变。只有阶段集合变化，因此递增协议版本。

### 持久化与兼容

本任务不读写 IndexedDB 或 localStorage。`logic` 组经 P2-11 交给 P2-10 缓存，兼容性规则如下：

- 缓存键沿用来源类别、来源令牌与 `ConverterVersion`；payload schema 或规范编码变化都须递增 `ConverterVersion`，旧缓存不会被误读。
- 内容 schema 与切片定义版本不变；如需变化，按 P2-10 规则，恢复时报 `cache-incompatible`。
- 恢复时由 `validatePackage` 核对 payload 指纹，再由读取器严格解码；损坏的数据不会进入 Core。
- 不涉及玩家存档。`MissionSetup` 不是存档格式。

## 技术决定

以下选择由用户授权按推荐答案确定，记录在此供批准时确认；冻结决定未改变，无需新 ADR。

1. **保留源单位：** 规范位置、生成矩形与地图框架使用 SCEN 参考单位，比例从头部读取；编组布局保留原版运行时单位并显式标注。不依赖运行时比例；P3 需要换算时，再从已验证来源取得参数。
2. **保留规则输入：** 不在导入或载入时应用默认值、截断或随机数。源值 0 记为 null，由 P3 按规则与 Core 的种子随机数处理，避免用宿主随机数冻结结果。
3. **失败关闭，研究后一次修订：** 对文档已知、但切片未定义处理的位置，非默认即失败，不静默丢弃；研究后若需扩大，合并成一次 spec 修订。
4. **格式知识与参数数值分开：** 两者处理方式不同：
   - **格式知识：** 偏移、编码、单比特种类、已确认的种类分组含义属于转换器代码，与已有解析器一致，并链接权威记录。
   - **数值参数：** 比例、地图范围、速度、能量等不得硬编码进仓库，必须在导入时从已验证来源读取。
5. **按 P2-01 单位拆分 Asset：** 机型表来自全局 M2ID，僚机名单是战役级数据，都是可独立复用的数据，因此作为独立 `data` Asset；`SOURCE_ENTRY_TYPES` 无需修改。
6. **本任务持有模型绑定：** P2-09 可能先于 P2-06 落地；由本任务固定命名规则并提供唯一绑定，可避免两份机型表。
7. **规范编码用 ASCII JSON：** 纯模块没有 `TextDecoder`；ASCII JSON 可审阅、确定，并支持逐字节规范性检查。若名称文本不全是可打印 ASCII，按研究门槛修订。
8. **共享身份机制：** 由第一个落地的转换任务实现 `ConverterVersion` 与 `ManifestIdentity`，后续任务复用。先收齐所有组再统一写入身份，满足 P2-01“任一变化必须改变值”的要求。
9. **错误码追加：** 以追加错误码扩展 `SourceError` 与内容错误，不新增错误层或宿主映射，因此协议只因阶段变化而升级。
10. **Core 消费纯数据：** Core 消费已解码的纯数据并重新读取，不负责字节解码；Runtime 与 Session 不改，符合 P2 阶段索引中“不提前泛型化”的要求。
11. **排除段 2 与音乐：** 段 2 与 `MUSC` 不属于初始逻辑数据或地图框架。记录 +0x54 引用的事件触发只在不含生成配对时不转换；含配对时会改变生成，按失败关闭处理。P3 或 P4 需要时，再修订 spec 扩展转换器。
12. **不另做浏览器验收：** 本任务只改变 Worker 内运行的纯作业函数与协议版本；结构化克隆与转移在 Node 中用真实端口验证。若实现修改了 Worker 宿主、平台适配或构建配置，则须重跑 P2-04 的浏览器用例。
13. **指针转为规范序号（研究后修订）：** 记录与段 5 中已确认访问方式的指针，转换为生成矩形、声明或编组的序号，不在 P2 解释其放置或调度规则；目标不是预期结构起点时失败关闭。段 6 的载入变换按原版循环复现，而不是按“坐标轴转换”的猜测处理。
14. **地图框架随任务交付（研究后修订）：** S-02 为结论 2，因此不设独立的地图框架 Asset，也不实现非封包 locator（S-12 不适用）；`loadMission` 不再接收单独的地图框架输入。

## 验收标准

| ID | 可观察的通过条件 | 验证方法与所需证据 |
|---|---|---|
| AC-01 | S-01 的字段清单写入 [scenario](../../../original/formats/scenario.md)，满足以下条件：<br>- 所选 SCEN 每段、每个记录位置、SCCT 僚机记录与引用的 M2ID 槽位，都有出现非默认值的计数和处理结论；<br>- 段 6、段 5 布局与头部 0x00/0x04 都有结论，并带置信度；<br>- 名称的最大长度与字符范围已记录；<br>- U-022/U-023 已更新；<br>- 没有处理结论不明的位置。若触发研究门槛，已完成 spec 修订与重新批准 | 本地只读研究，产物在 `local/`；文档 diff 只含结构、计数、置信度与证据路径；链接与元数据检查；`pnpm --silent check:original` |
| AC-02 | S-02 的结论（研究结果为结论 2）、坐标轴约定、地图框架来源与 Warp 是否有专用静态数据，连同证据与置信度已写入 `docs/original/`；所选任务的扇区数、比例与框架数值不出现在源码或测试中（合成测试只用合成值），文档只按 `docs/original/` 的约定记录结构与观测范围 | 文档 diff 与置信度标注；若用截图对照，记录方法与判据，不提交截图 |
| AC-03 | 合成样本的正向转换产生预期规范数据。样本覆盖以下情况：<br>- 多组 SCCT 中按候选选择 SCEN；<br>- 非对齐指针、无序重定位；<br>- 段 1 与成员数组互为别名时只生成一个声明、合并来源标记；<br>- 种类为 0 的模板；<br>- 规则输入 0 记为 null；有符号字段的负值保留；无符号字段的最高位为 1 时保留为正数，上界为 2³²−1；<br>- AI 掩码转为升序机型；<br>- 多个候选名称；段 0 名称备用池按表序保留；<br>- 僚机名单；<br>- 生成矩形、放置矩形与锚点、AI 目标、成员回指；<br>- 编组：成员重复、两个编组共用同一布局（各自写入）、`spawnCount` 原样保留、布局第 0 个元素的 y 与 z 被交换而其余元素不变；<br>- 地图框架：不同的头部扇区数与比例得到相应的 `halfExtent`，坐标轴与中心固定；<br>- `gridSpacing` 的负值保留。<br>机型表符合绑定规则：玩家与僚机共用同一 model ID，只含引用的机型 | Node 表驱动测试，逐字段断言 |
| AC-04 | 每类负向输入都返回预期的 code 与结构位置，且不返回部分结果、不按声明规模分配：<br>- **`invalid-payload`：** 越界或未登记的指针（含 +0x3C、+0x44、+0x48、+0x54、+0x58 与段 5、段 6 的指针）、多比特种类、非有限坐标或布局、非 ASCII 或无 NUL 的名称（含段 0）、头部扇区数为 0、段 6 表后计数字不在数据块内、M2ID 槽位为 0 或越界；<br>- **`subresource-mismatch`：** 候选槽位超出范围，或槽位的 SCEN ID 与映射不符；<br>- **`unsupported-payload`：** 每个“非默认即不支持”的位置单独构造一例；另各构造一例：头部扇区数不相等或超过 32767、指针目标不是预期结构的起点、成员回指与编组成员不一致、事件触发含生成配对或不是段 2 的第一个元素、段 6 项未被引用或元素数为 0、表后计数字大于 0、段 5 运行时字段非零、模板或成员不是段 1 记录的别名、僚机记录的指针字段或空间字段非零；<br>- **限值：** 各结构限值恰好等于上限时通过，超出 1 个单位返回 `limit-exceeded`。<br>**读取范围：** 记录识别之后的读取日志。其中只能出现以下读取：<br>- `SCENARIO.NOB` 与 `SR.NOB` 的文件头与目录（来源核验与转换可各读一次）；<br>- 映射表中每个 locator 各一次核验读取（同一条目被多个映射引用时，按引用次数读取）；<br>- 转换对 SCCT、所选 SCEN 与 M2ID 的读取。<br>不读取其他条目，例如 `MUSC`、其他 SCEN 与 CINF | Node 表驱动测试，使用记录读取的合成光盘端口 |
| AC-05 | 规范读取器满足以下要求：<br>- **正向：** 各 payload 往返后逐字节相同；相同内容的编码相同。<br>- **拒绝：** 以下情况都按 code 拒绝：缺少字段、未知字段、类型错误、非 ASCII、空白或字段顺序不同、-0、非有限数、超限；单个 payload 内的引用错误（序号不连续、编组引用的声明不存在或缺少对应来源标记、放置矩形或锚点或 AI 目标越界、成员回指与编组成员不一致、僚机声明带放置引用）；字节解码入口中，payload 内的 Asset 引用与描述符依赖不一致。<br>- **隔离：** 结果冻结；调用者修改输入或先前结果，不影响后续读取 | Node 单元测试 |
| AC-06 | 绑定是唯一的生产来源：<br>- 源码中没有第二份机型到模型的表；<br>- 命名规则产生合法且唯一的 Asset ID；<br>- 同一 MODL 只有一个 ID；<br>- 合成 M2ID 把两个机型指向同一 MODL 时共用 ID，指向不同 MODL 时 ID 不同；<br>- 绑定与 M2ID 解析不一致时失败 | Node 测试与源码搜索证据；P2-06 对齐由其 spec 承接，并在本任务证据中记录交接 |
| AC-07 | 生产映射表能通过 `readSourceMappingTable` 读取，且满足：<br>- 经 `verifySourceMappings` 后，不含子资源的部件为 `verified`；<br>- 带子资源的部件只有在转换器解析一致后才升为 `verified`；<br>- 解析不一致时报 `subresource-mismatch`；<br>- 来源状态绑定已识别指纹；<br>- 映射置信度与 U 项符合 [`logic` 组 Asset](#logic-组的-asset) 表 | Node 测试，使用合成映射表与合成光盘；生产表另以只读方式核对形状 |
| AC-08 | `ManifestIdentity` 满足以下要求：<br>- 对相同输入结果相同；<br>- 任一描述符、依赖、payload 身份、来源状态、`ConverterVersion` 或来源变化，结果都不同；<br>- 结果符合 P2-01 token 语法；<br>- 作业中的每个组都携带同一身份。<br>`ConverterVersion` 在生产代码中只有一个定义 | Node 测试与源码搜索 |
| AC-09 | 合成来源经生产转换器得到的 `logic` 组满足以下要求：<br>- 以 `CLASSIC_P2_SLICE` 调用 `validateGroup` 的结果为 `group-complete`；<br>- 外部要求恰为绑定的 model Asset；<br>- 来源为 `original-import`，带合成指纹；<br>- 每个 payload 独占，可由 `payloadTransferList` 转移；<br>- 转换器计入的预算用量，等于按[计数规则](#限值与预算)独立计算的值。<br>**预算阈值：** 以本 spec 批准的上限调用预算计量函数，五个设限维度各在恰好等于上限时通过，超出 1 时返回 `over-budget`。经转换器可以触发的超限（至少 `missionObjects` 与 `missionReferences`）用合成样本触发，并返回 `limit-exceeded`；其余维度在结构限值下不可达，证据中注明，不为达到阈值而制造契约之外的 Asset。<br>篡改 payload 后，组为 `incomplete` | Node 测试 |
| AC-10 | 生产导入作业以可注入的合成白名单运行，满足以下要求：<br>- 消息依次为 `identify-source` 进度、`identified`、`convert-logic` 进度、`group logic`、`finished`（`groups` 为 `['logic']`）；<br>- 递增后的协议版本在两端一致，旧版本消息被拒绝；<br>- app 持有者接受该组，`takeGroups()` 一次性移交；<br>- 转换失败时报 `failed`（`source` 或 `content` 层），不发送组；预算超限经宿主与持有者到达时，为 `source` 层的 `limit-exceeded`，`limit` 的维度名、上限与观测值完整保留；<br>- P2-04 已有的 Node 与浏览器测试继续通过 | Node 集成测试，使用宿主、真实结构化克隆端口与持有者；`pnpm check` |
| AC-11 | `loadMission` 满足以下要求：<br>- **正向：** 对合法的合成逻辑数据，`MissionSetup` 的声明（含放置引用、成员回指与 AI 目标）、阵营、模型、基地交互、玩家、编组（含布局）、名称备用池、生成矩形、僚机选项与地图框架都符合预期。<br>- **确定性：** 两次载入深度相等；结果冻结，并与输入隔离。<br>- **前提失败：** 以下每项都抛出 `CoreInputError`，路径准确：没有或有两个玩家、僚机选项解析为玩家、引用的机型缺失、机型表多出机型、任务或僚机名单引用的 Asset ID 不一致。<br>- **透传：** 单个 payload 内部的错误（如编组引用的声明不存在）由读取器报告为内容层错误，Core 原样传递，不改为 `CoreInputError`。<br>- **纯净：** Core 中没有 RNG、宿主时间或 `original-data` 依赖 | Node 测试；ESLint 与边界回归 |
| AC-12 | S-12 不适用：证据记录 S-02 的结论 2 及其文档位置；`OriginalAssetLocator` 的形状与校验未改变，已有 locator 测试不变地通过 | 文档核对与源码 diff；既有测试 |
| AC-13 | 边界与隐私满足以下要求：<br>- Core 与 `content/` 不导入 `original-data`；<br>- 转换器只经 `VerifiedSource` 读取；Worker 仍禁用网络 API；<br>- 合成样本只由代码生成；<br>- 错误位置、诊断与 CLI 输出不含名称、坐标、原版字节或私人绝对路径；<br>- 用不同合成框架值和比例值证明它们都来自输入，源码中没有硬编码的地图或比例数值 | 边界回归、ESLint、Node 测试、代码审阅 |
| AC-14 | 在开发者本机的基准镜像上，本地 CLI 用与 Worker 相同的作业模块完成识别与 `logic` 转换，并满足以下要求：<br>- 组为 `group-complete`，`loadMission` 成功；<br>- 输出声明数、名称备用池条目数、编组数、成员位置数与布局元素数、生成矩形数、非 null 的放置引用、成员回指与 AI 目标计数、僚机选项数、机型条目数及各阵营计数、payload 字节、`convert-logic` 的读取增量与身份哈希；<br>- 计数与 scenario 中的[来源概况](../../../original/formats/scenario.md#campaign-candidate-source-profiles-confirmed-structure)、[切片字段清单](../../../original/formats/scenario.md#selected-mission-field-inventory-confirmed-structure)一致；<br>- 结构观测值都在限值之内 | 本地运行记录（命令与计数）写入 subtask 证据；不记录名称、坐标、字段值或私人路径 |
| AC-15 | 文档同步满足以下要求：<br>- [源码结构](../../../engineering/source-structure.md)记录新模块、绑定、包身份、协议版本与错误码；<br>- [工程约定](../../../engineering/README.md)记录测试与边界说明；<br>- [工具指南](../../../guides/tools.md)记录新 CLI；<br>- `docs/original/` 的事实只在原处维护；<br>- 改动文档的 `updated:` 正确，相对链接与锚点有效 | 文档 diff、链接与元数据检查 |

## 验证策略

- **单元与契约测试：** 计划新增的相邻 `*.test.ts`，覆盖以下各层：
  - 解析（AC-03、AC-04）；
  - 规范读取与编码（AC-05）；
  - 绑定、映射与身份（AC-06 至 AC-08）；
  - 组装配（AC-09）；
  - Core 载入（AC-11）。

  合成 SCCT/SCEN/M2ID 由扩展的 [synthetic.ts](../../../../src/original-data/synthetic.ts) 或模块内 test-support 生成，带重定位表。
- **集成测试：** 复用 P2-04 的宿主、合成作业、结构化克隆端口与 app 持有者测试支持（AC-10）。合成光盘与白名单沿用 P2-03 的测试支持。
- **Replay 与一致性：** 本任务不推进 tick，不产生事件，因此不涉及 replay。确定性由两次转换的编码、身份与 `MissionSetup` 深度相等证明；不宣称跨浏览器逐位一致。
- **浏览器验证：** 不新增，理由见技术决定 12。若实现修改了 Worker 宿主、平台适配或构建配置，重跑 P2-04 的浏览器 Worker 用例。
- **原版对照：** 由人或本地脚本完成，均在开发者本机：
  - AC-01、AC-02 的研究；
  - AC-14 的基准核对。

  所选任务字段、引用与 Core 载入结果的独立原版对照，由 P2-12 完成；本任务的合成测试不能替代它。
- **工程检查：**
  - 迭代时运行针对性测试，例如 `pnpm test -- src/content src/original-data src/core src/workers src/app/import tools/engineering-boundaries.test.ts`；
  - 完成前运行 `pnpm check` 与 `pnpm --silent check:original`；
  - 文档改动做链接与元数据检查；
  - 运行 `git diff --check`。

## 风险与恢复

风险等级：**中高**。主要不确定性来自原版研究，可能使任务阻塞或需要修订 spec。本任务还为 P2-01、P2-03 与 P2-04 的已接受契约追加内容，并为并行的转换任务定义共享机制。

- **研究结果超出预设形状：** 已在 S-01 发生：所选任务依赖生成矩形、锚点、编组布局与成员回指。
  - 缓解：已按研究门槛合并修订一次，新增字段只保留源数据与序号，放置与调度规则仍归 P3；不以近似值通过。
- **运行时单位：** 编组布局使用原版运行时单位，P3 需要换算参数才能把它与参考单位的位置相加。
  - 缓解：`coordinates.layoutUnit` 显式标注；换算参数由 P3 从已验证来源取得，本任务不硬编码。
- **并行任务冲突：** P2-05、P2-08 与本任务可能同时修改协议版本、错误码与身份机制。
  - 缓解：先合入者实现，后者复用；协议版本按合入时的值递增，不写死具体数字；共享代码改动后重跑受影响任务的测试。
- **P2-06 不采用模型绑定：** 若 P2-06 使用另一套 ID，完整包无法解析跨组要求。
  - 缓解：绑定是唯一来源，P2-06 的 spec 必须引用它；P2-11 的全包验证会暴露不一致。
- **规则输入不足：** P3 可能需要本任务未转换的数据，例如段 2 或机型参数。
  - 缓解：递增 `ConverterVersion` 后扩展转换器；缓存键随之变化，旧缓存不会被误用。代价是用户需要重新导入。
- **追加的错误码：** 下游可能把未知错误码当作异常处理。
  - 缓解：P2-04 协议只按 token 语法校验；P2-11 的文案按层与码分类，并提供默认文案。
- **恢复：** 本任务没有玩家数据和持久化写入。代码按 subtask 逐项提交，可以回退；回退后，生产作业恢复为只识别来源。

## 未决事项

无。全部选择已按用户授权的推荐答案写入[技术决定](#技术决定)。

S-01、S-02 的研究结论属于验收门槛；2026-10-05 的研究结果已按[研究门槛与阻塞](#研究门槛与阻塞)合并修订入本 spec。

## 审批

用户于 2026-10-05 明确批准本 spec。批准范围包括：

- S-01 至 S-14、AC-01 至 AC-15；
- 行为与边界（含源字段处理、研究门槛与四种空间框架结论）、数据模型与契约、限值与预算、错误与持久化兼容；
- 技术决定，包括生成时按用户授权采用推荐答案作出的选择，以及 rubber-duck 审阅后采纳的六项修正。

**2026-10-05 修订的批准：** 子任务 01 触发研究门槛后，本 spec 按 01 与 02 的合并研究结果修订一次，内容见[研究门槛与阻塞](#研究门槛与阻塞)。

- **授权：** 用户在同日的 execute-goal 调用中明确授权：子任务因需修订 spec 而阻塞时，可直接修订 spec、goal 与 subtasks，并在 goal 的执行记录中说明。
- **审阅：** 修订经 rubber-duck 审阅，适用意见已采纳。
- **生效：** 修订依据该授权生效，S/AC 编号不变。

批准不代表实现完成。之后若再触发研究门槛，同样须取得用户批准或授权。
