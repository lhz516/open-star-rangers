---
type: guide
status: active
phase: all
updated: 2026-10-14
related: [ADR-0015]
---

# 内容模块说明

本文件是[源码结构指南](../source-structure.md)的模块分册，记录 `src/content/` 中已交付代码的当前 API 与契约要点。目录树、职责边界与 helper 归属以指南为准，行为契约以各任务 spec 为准；修改本模块代码的任务同步更新本文件。

[content/](../../../src/content/) 目前实现候选无关的基础契约、唯一生产切片定义与资源组/全包完整性验证、`logic/` 中的任务与逻辑 payload 与 `sound-payload.ts` 的采样 payload（见下节），以及 `graphics/` 中的图形 payload（见[图形 payload](#图形-payload)）、`models/` 中的模型 payload（见[模型 payload](#模型-payload)）、`effects/` 中的效果 payload（见[效果 payload](#效果-payload)）、`hud/` 中的状态显示屏文字、视角标签与 HUD 文字 payload（见[状态显示屏文字 payload](#状态显示屏文字-payload)与[视角标签与 HUD 文字 payload](#视角标签与-hud-文字-payload)），以及 P3-03 的规范 JSON、`rule-data/` 中 `logic` 组的规则数据 payload（见[规范 JSON 与规则数据 payload](#规范-json-与规则数据-payload)）与 `flight/` 中 `models` 组的飞行数据 payload（见[飞行数据 payload](#飞行数据-payload)）；正式 Core 在世界创建时消费其中的规则输入（见[Core 消费的规则输入](#core-消费的规则输入)）；原版来源映射属于 `original-data`（见[原版来源映射](./original-data.md#原版来源映射)）。

## 内容基础契约与切片定义

[P2-01/08](../../plan/p2/01/subtasks/08-base-content-contract.md) 的当前 API：

- [asset-id.ts](../../../src/content/asset-id.ts)：`readAssetId` 返回品牌化语义 ID，8 段限制包含 kind 首段；`ASSET_KINDS` 封闭为 8 种，`ASSET_ID_LIMITS` 固定每段 32 字符、总长 128 字符。语法验证不能证明命名语义或来源映射正确。
- [asset-contract.ts](../../../src/content/asset-contract.ts)：`readAssetReference`、`readAssetDescriptor` 验证 kind 一致性、4 个封闭资源组、语义 role token、严格 ASCII ID 顺序且无重复的类型化依赖，以及 payload 身份。role 的必需集合/基数留给 02，引用存在/自引用/环与分组/全包完整性留给 04；没有 `complete` 布尔值。 `readRole` 单独读取语义 role token，描述符与图形转换声明共用。
- [content-identity.ts](../../../src/content/content-identity.ts)：`readContentIdentity` 显式分开 schema、切片 ID、切片定义版本、converter、manifest 与 origin；schema 当前只支持 1，数值版本为正安全整数。converter 按 spec 保留受限 ASCII 不透明字符串，不用应用版本代替。converter/manifest token 允许小写 ASCII 字母、数字及单个内部 `-`、`.`、`:` 分隔符。
- 同文件的 `readContentOrigin` 严格区分 `{type: synthetic, fixtureId}` 与 `{type: original-import, sourceFingerprint}`；fixture token 不允许 `:`，source 使用 `source:<不透明 token>` 命名空间，不规定指纹算法。通过只表示形状合法，**不是来源已验证的证据**；P2-03 负责生成经过验证的来源指纹，manifest 身份由 `manifest-identity.ts` 推导（见下）。`readContentIdentityBasis` 用同样的规则读取不含 `manifestIdentity` 的五项身份（`ContentIdentityBasis`），供推导使用。`readFixtureId`、`readSourceFingerprint` 与 `readConverterVersion` 用同样的规则单独读取这些令牌，供 [P2-10 缓存键](../../plan/p2/10/spec.md#缓存键与身份)使用；`contentIdentityKey` 把六项身份合成一个可比较的键，全包验证与缓存读取共用。
- 同文件的 `readPayloadIdentity` 要求正安全整数 schema 版本、非负安全整数字节长度及 `sha256:` 加 64 个小写十六进制字符；只检查声明的格式，不生成或核验实际 payload 哈希。
- [asset-units.ts](../../../src/content/asset-units.ts)：`ASSET_UNITS` 与 `INTERNAL_ASSET_ELEMENTS` 固定规范计量粒度。每模型一个 Asset，几何归模型内部；可复用调色板/逻辑数据才有独立身份。源条目数量不是规范 Asset 数，实际拆分/合并及共享身份必须由后续来源映射显式记录。这些常量不是全战役规范图或 S-02 排序证据。
- [contract-validation.ts](../../../src/content/contract-validation.ts)：严格 plain-data 校验和 `ContentContractError`，按稳定 `code`/`path` 分类；诊断不回显非法值或未知属性名。DTO 不接受类实例、函数、accessor 或未知字段。读入口复制并冻结所有基础容器，结构化克隆后可独立修改；`readArray` 统一读取稠密 plain 数组，`readOrderedArray` 在逐项读取的同时检查唯一与升序（首个问题按索引顺序报告）。两者都建立在 `visitArray`/`visitOrderedArray` 之上：这两个函数按索引逐项读取并访问，访问函数一旦返回非 undefined 的值就停止读取，并把该值返回。`original-data` 的来源映射也复用这些校验（依赖方向为 original-data → content，反向被 lint 禁止）。二进制 payload 不能冻结，所有权规则见下方 `ownership.ts`。
- [slice-definition.ts](../../../src/content/slice-definition.ts)（[P2-01/02](../../plan/p2/01/subtasks/02-slice-content-contract.md)）：`CLASSIC_P2_SLICE` 是唯一的生产切片定义，深度冻结；`SliceDefinition` 带仅类型品牌，唯一构造由[工程边界回归](../README.md#lint-规则eslintconfigjs)保证。定义记录经批准的候选结构选择器（战役 group 0 / slot 1，僚机可选）、四个必需资源组及各组拥有的 kind（`groupKinds`），以及 S-03 角色的组、允许 kind 与 Asset 数量范围。弹丸/导弹/碎片允许 model、image 或 data，`models` 组也允许 data（版本 2，[P2-01 spec](../../plan/p2/01/spec.md) 2026-10-06 修订，承担 P2-06 导入的效果几何数据）；`cockpit-hud-map` 组也允许 data，版本 3（P2-01 spec 2026-10-08 修订，承担 P2-07 导入的[状态显示屏文字](#状态显示屏文字-payload)）。`SLICE_DEFINITION_VERSION` 现为 5（[P3-03 spec 的切片定义版本 4](../../plan/p3/03/spec.md#切片定义版本-4)，含修订 1 与修订 2）。版本 4 在既有 15 个角色要求之外另加 15 个必需角色（初版 14 个，修订 1 加入 `hud-text`）；版本 5（修订 2）再加 `logic` 组恰为 1 的 `comm-messages`，共 31 个角色要求。版本 4 的角色即 `logic` 组的 `craft-info`、`debris-parameters`、`ai-programs`、`comm-menus`、`base-repair-items`、`flight-messages`，`models` 组的 `scene-settings`、`explosion-table`、`nebula-backgrounds`（data）与 `hit-shimmer`（image），`cockpit-hud-map` 组的 `target-display`（image）、`view-labels` 与 `hud-text`（data），各恰为 1，以及 `audio` 组恰为 8 的 `event-sound` 与恰为 3 的 `hud-sound`；爆炸动画、帧与星云图像不是角色，经这些根 Asset 的依赖闭包要求；四类核心音效暂允许多个采样片段，待 P2-08 核实后收窄。版本 4 及更早的包按 `definition-version-mismatch` 为不完整。原版条目 ID 不在此处，由 03 的来源映射记录。更换候选或改变角色、数量范围、分组都须修订 spec 并递增 `SLICE_DEFINITION_VERSION`。
- [completeness.ts](../../../src/content/completeness.ts)（[P2-01/04](../../plan/p2/01/subtasks/04-completeness-validation.md)）：`validateGroup` 用切片定义、组清单（身份、组、按 ID 升序的描述符）、按 ID 升序且唯一的实际 payload 记录和来源状态集推导 `group-complete` 或 `incomplete`。它检查定义版本、组归属、角色的组与 kind、角色数量、组内依赖、自引用与环、payload（[payload.ts](../../../src/content/payload.ts) 重新计算 SHA-256，并比对 schema 版本与长度）以及来源就绪。依赖的 kind 若不属于本组拥有的 kind，作为类型化外部要求返回，不判为本组缺失。`validatePackage` 每次都从四组原始输入重新验证，从不接受已有结果；只有每组恰好一份、六项身份一致、ID 跨组唯一、外部要求全部解析且无跨组环时才返回 `complete`。诊断带稳定 code、结构路径、规范 ID、U 项与原因，不含 payload 字节或 locator。
- [sha256.ts](../../../src/content/sha256.ts)：同步、无依赖的 SHA-256，供纯模块计算和核验 `sha256:` payload 指纹。
  - `Sha256` 可分段输入：`update` 接受任意长度（含零长度）的片段，只保留未满一块的尾部，用完即清零，不复制、不保留、不修改调用者的字节；已 detached 的输入或总长超出安全整数时，在改变状态前抛错。
  - `digestHex` 结束计算并返回 64 位小写十六进制；之后再 `update` 会抛错，再次 `digestHex` 返回同一结果。
  - 一次性的 `sha256Fingerprint` 建立在它之上，签名与输出不变。
- [source-state.ts](../../../src/content/source-state.ts)：不含 locator 的来源状态集 `{ sourceFingerprint, states }`（每个 Asset 为 verified/unverified/unconfirmed/conflict 加 U 项），由 `original-data` 从来源映射推导后交给完整性验证。原版导入的状态集指纹必须等于清单的来源指纹，且每个 Asset 都必须为 verified；合成内容的来源输入必须为 null。
- [manifest.ts](../../../src/content/manifest.ts)：`readGroupManifest` 读取组清单（身份、组，以及按 ID 升序且唯一的描述符），完整性验证使用它；`readAssetDescriptors` 单独读取同样排序的描述符数组。`visitGroupManifest` 做同样的检查，但逐个访问描述符而不收集，访问函数返回值时即停止，供预算计量使用。
- [manifest-identity.ts](../../../src/content/manifest-identity.ts)（[P2-09/03](../../plan/p2/09/subtasks/03-package-identity.md)）：包身份的唯一推导。
  - **推导：** `deriveManifestIdentity(basis, drafts)` 严格读取身份基础与一个作业的全部组草稿（`GroupDraft`：组、按 ID 升序的描述符、payload 记录、来源状态集或 null），按 `RESOURCE_GROUPS` 顺序编码为带版本前缀的 ASCII 文本，结果为 `manifest:sha256:<64 位小写十六进制>`。任一身份基础字段、描述符字段、依赖、payload 身份或来源状态变化，结果都变化；组的传入顺序与 payload 记录不影响结果，推导也不读取 payload。空列表、重复或未知的组与格式错误的草稿以 `ContentContractError` 拒绝。测试中的固定向量锁定版本 1 编码。
  - **写入：** `applyManifestIdentity` 把同一身份写入每个组，返回冻结的 `IdentifiedGroup` 列表（可直接作为 `GroupInput` 交给完整性验证）。描述符、来源状态与 payload 记录都是读取后的副本，只有 payload 字节沿用调用者的视图，所有权仍按 `ownership.ts` 转移；payload 记录的错误路径使用调用者的草稿序号。
  - 生产转换器版本是 [original-data/conversion/converter-version.ts](../../../src/original-data/conversion/converter-version.ts) 的 `PRODUCTION_CONVERTER_VERSION`，全部生产转换器共用这一个定义（P2-09 S-07）。值的格式取自 P2-08：`osr-import.` 后按阶段顺序接作业打包的各转换器组件 `<转换器>-<n>`，目前为 `osr-import.graphics-4.logic-2.audio-2.models-4`（`GRAPHICS_CONVERTER_COMPONENT`、`LOGIC_CONVERTER_COMPONENT`、`AUDIO_CONVERTER_COMPONENT`、`MODEL_CONVERTER_COMPONENT`；P2-06/07 起图形输出随 `models` 组打包，因此加入图形组件 `graphics-1`；[P2-07/13](../../plan/p2/07/subtasks/13-group-assembly.md) 起 `cockpit-hud-map` 组也被打包，图形组件递增为 `graphics-2`；[P2-11/16](../../plan/p2/11/subtasks/16-effect-mapping-display.md) 更新效果 payload 与映射参数，模型组件递增为 `models-2`；[P2-06/21](../../plan/p2/06/subtasks/21-mesh-uv-planar.md) 改正 MESH 贴图坐标的读取，递增为 `models-3`；[P2-07/20](../../plan/p2/07/subtasks/20-snip-diag-conversion.md) 加入左显示屏干扰帧与状态显示屏文字，图形组件递增为 `graphics-3`；[P3-03/19](../../plan/p3/03/subtasks/19-package-integration.md) 的四个转换器输出都改变，组件全部递增：`graphics-4` 加入飞行图像与视角标签，`logic-2` 为 logic payload schema 2 与规则数据，`audio-2` 加入 11 个声音，`models-4` 加入飞行数据。P3-03/26 的 HUD 文字与 27 的 sound payload schema 2 沿用 `graphics-4` 与 `audio-2`，因为递增后的中间输出从未在真实来源上产生过完整的包）。任一转换器对同一来源的输出可能变化时，递增它的组件，从而改变这个值；它是 [P2-10 缓存键](../../plan/p2/10/spec.md#缓存键与身份)的一部分。`productionIdentityBasis(指纹)` 给出生产组的身份基础。P2-08 合入前曾另行实现 `computeManifestIdentity`，合入时统一为本节的 `deriveManifestIdentity`/`applyManifestIdentity`。
- [logic/](../../../src/content/logic/)（[P2-09/04](../../plan/p2/09/subtasks/04-logic-content.md)）：`logic` 组的规范逻辑内容，形状与约束见 [P2-09 spec](../../plan/p2/09/spec.md#规范逻辑数据)。
  - **类型与限值：** [logic-content.ts](../../../src/content/logic/logic-content.ts) 定义 `MissionContent`、`MissionGroup`、`MissionDeclaration`、`CraftTypeTable`、`WingmanRoster`、`StrategicMapFrame`、按角色区分的 `LogicPayload`，以及 `LOGIC_LIMITS` 与 payload schema 版本 `LOGIC_PAYLOAD_SCHEMA_VERSION`（P3-03/07 起为 2）。字段声明顺序就是规范编码顺序；规则输入的字段名不表示语义已确认。
  - **段 2 事件触发（[P3-03/07](../../plan/p3/03/subtasks/07-mission-events.md)）：** `MissionContent` 末尾新增 `eventTriggers`，按段内顺序，每项为 `EventTrigger { ranges }`，区间为 `EventRange { lower, upper, messages, summarySelector }`（i32、i32、字节串数组、i8）；`MissionDeclaration` 在 `aiTarget` 之后新增 `eventTrigger`（触发序号或 null）。结构见 [scenario 的段 2 事件触发](../../original/formats/scenario.md#section-2-event-triggers-p3-03)。`LOGIC_LIMITS` 新增 `eventTriggers` 2、`eventRanges` 8、`eventMessages` 2、`eventMessageBytes` 128，由 SCEN 3019 的观测最大值 1、3、1、57 按“2 倍，向上取整到 2 的幂”推导。读取器要求每条消息为 1–128 个码位、每个 1–255 的字节串；未被任何声明引用的触发、越界的 `eventTrigger` 与僚机选项非 null 的 `eventTrigger` 都为 `logic-reference-mismatch`。
  - **读取器：** [logic-readers.ts](../../../src/content/logic/logic-readers.ts) 的 `readMissionContent`、`readCraftTypeTable`、`readWingmanRoster` 与按角色分派的 `readLogicContent` 读取已解码的纯数据，返回冻结副本，-0 规范化为 0。结构、类型、取值范围与限值错误一律为 `invalid-logic-payload`（共用的基础读取器的错误也改报此码，路径不变）；数组先查长度再逐项读取。单个 payload 内的引用错误为 `logic-reference-mismatch`：声明序号与规范顺序（`object` 声明在前，最多 64 条，其后为编组首次使用的声明）、编组模板与成员的来源标记（双向一致）、成员回指、放置矩形与锚点、AI 目标，以及僚机选项不得引用任务结构。跨 Asset 的一致性不在这里检查。
  - **编码：** [logic-payload.ts](../../../src/content/logic/logic-payload.ts) 的 `encodeLogicPayload(payload, reserve?)` 先严格读取，再输出无空白的可打印 ASCII JSON 字节（独占新 buffer）；可选的 `reserve` 在检查上限与分配字节之前收到字节数，供转换器先计量预算。`decodeLogicPayload(bytes, descriptor)` 依次检查：字节已转移与长度上限（在读取描述符或任何字节之前）、描述符的角色与 kind、payload schema 版本、逐字节可打印 ASCII、JSON 语法、按角色读取，然后要求重新编码与输入逐字节相同（否则 `non-canonical-payload`），最后要求 payload 内的 Asset 引用恰为描述符依赖（否则 `logic-reference-mismatch`）。payload 身份由完整性验证核对，这里不重复。P3-03/06 起编解码经[规范 JSON](#规范-json-与规则数据-payload) 的 `canonical-json.ts` 实现，输出字节、错误码与路径不变。
  - [contract-validation.ts](../../../src/content/contract-validation.ts) 为此追加 `invalid-logic-payload`、`non-canonical-payload` 与 `logic-reference-mismatch`；诊断只含结构路径与固定原因，不回显名称或数值。合成内容由 [logic-content.test-support.ts](../../../src/content/logic/logic-content.test-support.ts) 生成，名称带内容测试自己的标记。
- [budget.ts](../../../src/content/budget.ts)（[P2-01/05](../../plan/p2/01/subtasks/05-budget-ownership-contract.md)）：
  - **维度：** `BUDGET_UNITS`/`BUDGET_DIMENSIONS` 固定 schema 1 的十二个维度及单位，增删维度或改变单位属于 schema 变化。
  - **记录：** `readBudgetRecord` 要求完整记录，不适用的维度写 0。缺失维度、未知维度（例如换了单位的键）以及非“非负安全整数”的值分别以稳定 code 拒绝，不回显未知键名。
  - **计量：** `chargeBudget` 每次都重新读取限值、当前用量和增量，调用者应在读取或分配声明规模之前计量。
  - **相加：** `addBudgets(left, right, path)` 把两个完整记录逐维相加（例如读取限值加某一步骤的份额，或读取用量加转换用量），结果须仍是合法记录，否则在 `path` 下报 `invalid-budget-value`。
    - 用量等于上限时通过；超过上限返回 `budget-exceeded`，带维度、limit 与 observed。
    - 总量超出安全整数范围时返回 `budget-overflow`，observed 为 null。
    - 判断基于剩余额度，不依赖溢出后的和。被拒的计量不会部分生效，结果中仍是之前的用量。
  - **清单计量：** `chargeManifestBudget` 在读取清单的同时逐个 Asset 计量声明的 Asset 数、依赖边数和 payload 字节，遇到第一个超限的 Asset 即拒绝整个清单，不再读取后续描述符，路径指向该 Asset。若传入的现有用量已经超限，即使清单为空也会拒绝。
  - 具体限值由 P2-02 至 P2-09 各自的 spec 批准。
- [ownership.ts](../../../src/content/ownership.ts)：TypedArray 不能冻结，因此二进制 payload 不在消费者之间共享。
  - `exclusiveBytes` 把字节复制到长度恰好的新 ArrayBuffer；不使用 `slice`，因为 Node 的 `Buffer#slice` 共享内存。
  - `payloadTransferList` 返回要转移的 ArrayBuffer：每个视图必须独占整个非共享 buffer，且彼此不共用；否则以 `payload-not-exclusive`/`payload-aliased` 拒绝。
  - 转移后，发送方的视图变为空。`isDetached` 用 ES2023 可用的方式识别已转移的 buffer；`exclusiveBytes`、`payloadTransferList` 和 `readPayloadRecords` 都以 `payload-detached` 拒绝已转移的字节，因此发送方不能再复制、再次发送或拿去验证。实际的 Worker 转移由 P2-04 接入。
- [sound-payload.ts](../../../src/content/sound-payload.ts)（[P2-08/01](../../plan/p2/08/subtasks/01-sound-payload.md)，[P3-03/27](../../plan/p3/03/subtasks/27-sound-repeat.md) 递增）：kind 为 `sound` 的规范采样 payload，schema 2（`SOUND_PAYLOAD_SCHEMA_VERSION`，契约见 [P3-03 spec 的声音 payload schema 2](../../plan/p3/03/spec.md#声音-payload-schema-2)），与来源无关，不含条目编号、`flags` 原值或 locator。
  - **布局：** 16 字节小端头部（`SOUND_PAYLOAD_HEADER_BYTES`）后接交错的 PCM。`SOUND_PAYLOAD_OFFSETS` 依次为：标签 `OSRS`（0）、u32 采样率（4）、u32 帧数（8）、u8 声道数（12）、u8 编码（13）、u8 循环方式（14）、u8 播放次数 `plays`（15，schema 1 中为须为 0 的保留字节）、PCM（16）。采样率范围 `SOUND_SAMPLE_RATE_RANGE` 为 8,000–96,000 Hz；声道 1 或 2；编码 `SOUND_ENCODINGS` 为 1 = `u8`（无符号 8 位）、2 = `s16le`（有符号 16 位小端）；循环方式 `SOUND_LOOP_MODES` 为 0 = `none`（播放一次）、1 = `whole`（循环到被停止）、2 = `repeat`（共播放 `plays` 次）。`repeat` 的次数为 2–255（`SOUND_REPEAT_PLAYS`），`none` 与 `whole` 的偏移 15 须为 0，因此 schema 1 的既有声音字节不变。
  - **类型：** `SoundPlayback` 是 `{ loop: 'none' | 'whole' }` 与 `{ loop: 'repeat', plays }` 的可辨识联合，`SoundFormat`、`SoundPayloadInput` 与 `SoundPayload` 都由它组成，只有 `repeat` 带 `plays`。
  - **写入：** `writeSoundPayload` 按读取器的同一规则核对 `{ sampleRate, channels, encoding, loop, plays?, pcm }`：`repeat` 须有 2–255 的整数 `plays`，`none`、`whole` 不得有自有的 `plays` 属性（值为 `undefined` 也不行）；PCM 须是一个或多个整帧，帧数不超过 u32。PCM 原样复制到长度恰好的新独占 buffer，不修改也不保留输入视图。
  - **读取：** `readSoundPayload` 依次核对长度至少为头部、标签、采样率/声道/编码/循环方式（0–2）、播放次数（`repeat` 小于 2，或 `none`、`whole` 非零，都报在 `payload.plays`）、帧数 ≥ 1、PCM 长度恰为帧数 × 声道数 × 每样本字节数（无尾随字节），失败时以 `invalid-sound-payload` 及字段路径拒绝，已转移的字节为 `payload-detached`；不按声明的帧数分配，诊断不回显值。结果是冻结的头部字段加指向原视图的 PCM 子视图，仅供读取。字节本身不带 schema 版本，只接受 schema 2 由持有描述符的一方核对：[音频控制器](./platform.md#音频播放)拒绝 schema 1 与 3 的记录。
  - **浮点映射：** `soundChannelData` 是唯一的映射，为每个声道返回新的 `Float32Array`（按帧交错拆分，不与 payload 共享内存）：`u8` 的 v 映射为 (v − 128) / 128，`s16le` 的 v 映射为 v / 32768，按小端读取，与宿主字节序无关。转换器、播放适配与本地对照脚本都用它。

合成内容包由 [synthetic-content.test-support.ts](../../../src/content/synthetic-content.test-support.ts) 在代码中生成：四组清单覆盖全部角色，另含实际 payload、原版导入变体的来源状态（`syntheticSourceGroup` 可绑定任意来源指纹），以及按 `code@path` 断言诊断的辅助函数。版本 4 的合成包覆盖全部新角色，含爆炸表依赖的动画与帧、星云列表依赖的图像与跨组的爆炸音效；`VERSION_4_ROLES` 与 `VERSION_5_ROLES` 按定义顺序列出版本 4 与版本 5 新增的角色，`P3_ROLES` 是两者之和，`P2_ROLES_SLICE` 是去掉 `P3_ROLES` 角色要求的 `CLASSIC_P2_SLICE` 副本，只供测试单个步骤的部分组，生产定义仍只有 `CLASSIC_P2_SLICE` 一份。它与生产文件同样位于纯模块程序中。[synthetic-package.test.ts](../../../src/content/synthetic-package.test.ts) 用同一个包串联完整性验证、预算、独占发布、转移与接收方重新验证，并覆盖模型内部几何与共享源网格的字节层用例。针对性检查为 `pnpm exec vitest run src/content tools/engineering-boundaries.test.ts`；不读取原版文件或接线浏览器消费者。

## 图形 payload

[content/graphics/](../../../src/content/graphics/)（[P2-05/01](../../plan/p2/05/subtasks/01-graphics-payloads.md)）定义 `palette`、`image`、`font` 三类 Asset 的规范 payload，[P2-07/01](../../plan/p2/07/subtasks/01-layout-payload.md) 加入 `layout`。它是纯 TypeScript，不导入 `original-data`；原版转换由 `original-data` 产生这些字节。

- **常量：** [graphics-format.ts](../../../src/content/graphics/graphics-format.ts) 的 `GRAPHICS_SCHEMA_VERSION` 为 1，四类共用；改变字节布局或解释须递增。`GRAPHICS_LIMITS` 供读取器与转换器共用，分为两类：
  - **格式规则：** 调色板 1–256 项（8 位索引最多寻址 256 项），字体单元宽 1–8（每行 1 字节），字形 1–256 个（8 位字形索引），字符映射 0–256 条；
  - **安全上限：** 图像宽 1–640、高 1–480（Classic HI 画幅），布局画幅取同样的范围；字体高 1–8（已观察到 6 与 8），每字形行数也不超过 8；布局元素 1–16（`layoutElements`，等于 CCKD 每个分组的元素上限）。原版字段本身更宽，图像与字体两项是 [P2-05 spec](../../plan/p2/05/spec.md#限值与预算) 批准的上限，布局两项见 [P2-07 spec](../../plan/p2/07/spec.md#限值与预算)。
- **字节布局：** 都是小端定长头部加数据，总长恰为两者之和，Asset ID 以 ASCII 存储。

  | 类别 | 头部 | 数据 |
  |---|---|---|
  | 调色板 | `u16` 条目数 | 每项 (R, G, B) 各 8 位，不含透明 |
  | 图像 | `u16` 宽、`u16` 高；`u8` alpha（0 不透明、1 掩码）；`u8` display（0 direct、1 nearest）；`u8` 调色板 ID 长度（1–128）；`u8` 目标 ID 长度（direct 为 0，nearest 为 1–128） | 调色板 ID，nearest 的目标调色板 ID；`宽 × 高` 个行优先索引，行 0 在上；alpha 为 1 时再接掩码：每行 `⌈宽/8⌉` 字节，bit 7 为最左，1 为不透明 |
  | 字体 | `u8` 单元宽、`u8` 单元高、`u8` 每字形行数（单元高–8）、`u16` 字形数（1–256）、`u16` 映射条数 | 字形数 × 每字形行数字节的字形，字形 g 的第 r 行在 `7 + g × 每字形行数 + r`，bit 7 为最左，逐位保留（含单元以外的位与行）；映射按码位严格升序的 (code, glyph) 字节对，glyph 小于字形数 |
  | 布局 | `u16` 画幅宽（1–640）、`u16` 画幅高（1–480）、`u8` 元素数 N（1–16）；N 个 5 字节元素项，按绘制顺序（后者在上）：`u16` x（0 至宽−1）、`u16` y（0 至高−1）、`u8` 图像 ID 长度（1–128） | 按元素顺序依次存放 N 个图像 ID；(x, y) 是图像左上角在画幅中的像素位置，各元素的图像互不相同 |

  图像引用的 ID 必须是 `palette` kind 的 Asset ID，布局元素引用的必须是 `image` kind。布局不含调色板、透明或缩放字段：它们由各图像 payload 表达；图像尺寸只在图像 payload 中，所以读取器只检查坐标，元素矩形是否越出画幅由转换与合成检查。透明像素的索引与掩码行尾填充位一律为 0：编码器写 0，读取器拒绝非零。字形的绘制颜色与字距不在 payload 中，映射之外的码位没有字形。每字形行数可以大于单元高（4×6 表为 8，见 [P2-05/12](../../plan/p2/05/subtasks/12-character-map-research.md)）；单元以外的位与行是否绘制属 [U-030](../../original/unknowns.md#数据与格式)，由消费者按单元裁剪或保留。
- **编码：** `encodePalettePayload`、`encodeImagePayload`、`encodeFontPayload`、`encodeLayoutPayload` 校验字段后写入一个独占整个 `ArrayBuffer` 的新缓冲（可直接交给 `payloadTransferList`），同一输入得到同样的字节与 SHA-256；不改动调用者的数组。`palettePayloadLength`、`imagePayloadLength`、`fontPayloadLength`、`layoutPayloadLength` 按字段给出编码长度，供转换器在分配前扣除 `payloadBytes`。布局的画幅检查 `layoutFrame` 由转换声明复用。
- **读取：** `readPalettePayload`、`readImagePayload`、`readFontPayload`、`readLayoutPayload` 接受 `(bytes, schemaVersion, path)`，返回带 `kind` 的冻结数据，其中的数组是调用者独占的新副本（布局的画幅、元素数组与各元素也都冻结）。schema 不是 1 为 `unsupported-payload-schema`；长度不符（截断或尾随字节）、字段越界、未知的 alpha/display 值、非法或 kind 不符的 ID、非零填充位、透明像素的非零索引、映射乱序或重复、映射的字形不小于字形数，以及布局元素数不在 1–16、坐标越出画幅或两个元素引用同一图像（报在后一个元素的 `elements[<i>].image`），都为 `invalid-graphics-payload`；已转移的字节为 `payload-detached`。`maskStride` 与 `isOpaque` 按上述掩码约定取每行字节数与单个像素的不透明性。
- **绑定：** [graphics-binding.ts](../../../src/content/graphics/graphics-binding.ts) 的 `referencedPalettes` 给出 payload 引用的调色板 ID（去重后升序：direct 为 `{palette}`，nearest 为 `{palette, target}`；调色板、字体与布局没有），`imagePalettes` 对图像的绑定字段给出同样的结果，`layoutImages` 给出布局各元素的图像 ID（升序），供转换器生成依赖。`checkGraphicsBinding(descriptor, payload)` 要求描述符的 kind 与 payload 一致，依赖恰好等于这些 ID：布局为元素图像且 kind 都是 `image`，其余为引用的调色板且 kind 都是 `palette`；否则报 `binding-mismatch`。

- **展开：** [expand-image.ts](../../../src/content/graphics/expand-image.ts) 的 `expandImage(image, palettes)` 是项目中唯一的调色板查找。`palettes` 按 Asset ID 提供，必须恰好是图像引用的调色板，否则报 `binding-mismatch@palettes`。结果为冻结的 `{ width, height, rgba }`，`rgba` 是调用者独占的新缓冲，非预乘：不透明像素为显示颜色、alpha 255，透明像素为 (0, 0, 0, 0)。direct 直接查图像的调色板；nearest 先把源调色板逐项映射到目标调色板再查表，因此不透明像素的颜色都属于目标调色板。不透明像素的索引不小于源调色板条目数时报 `palette-index-out-of-range@<path>.indices`，透明像素的索引不参与。展开结果不进入 payload 或缓存。
- **最近色：** 同文件的 `nearestColourMap(source, target)` 对源调色板的每一项取平方欧氏距离最小的目标条目，距离相等取较小索引。源分量按 8 位比较；目标分量清除低两位，即恢复原版颜色管理器搜索的“6 位 VGA 值 × 4”，因此目标须是由 6 位值按位复制展开的调色板（目前只有 DATA）。这一规则由 [P2-06/12](../../plan/p2/06/subtasks/12-ambiguous-texture-research.md) 的 EXE 证据确认，见 [textures §3](../../original/formats/textures.md#nearest-colour-metric-and-tie-rule-confirmed)；游戏中按光照选取明暗级的部分仍未确认（U-028）。研究工具与后续 Renderer 复用它，不另写颜色逻辑。
- **布局合成：** [compose-layout.ts](../../../src/content/graphics/compose-layout.ts) 的 `composeLayout(layout, images, palettes, path)` 是项目中唯一的布局合成（[P2-07/02](../../plan/p2/07/subtasks/02-layout-composition.md)），供 P2-11 查看器、P2-12 对照与后续 Renderer 使用：
  - **输入：** `images` 按 Asset ID 提供，必须恰为布局各元素的图像，否则报 `binding-mismatch@images`；`palettes` 必须恰为这些图像引用的调色板，否则报 `binding-mismatch@palettes`。
  - **规则：** 输出画幅大小的非预乘 RGBA，初始全部为 (0, 0, 0, 0)。按数组顺序处理每个元素：用 `expandImage` 展开（每个图像只拿到自己引用的调色板）；按实际图像尺寸核对 x + 宽 ≤ 画幅宽、y + 高 ≤ 画幅高，越出时报 `layout-out-of-frame@<path>.elements[<i>]`；只写入 alpha 255 的像素：后者覆盖前者，透明像素不改变下层。错误由第一个失败的元素决定。同一布局可以混用绑定不同调色板的图像。
  - **结果：** 冻结的 `{ width, height, rgba }`，`rgba` 是调用者独占的新缓冲，坐标是 HI 画幅的原始像素，不缩放；窗口缩放与设备像素比属于 `render/`。调色板索引越界沿用 `palette-index-out-of-range`，位置为 `images[<图像 ID>].indices`。结果不进入 payload 或缓存。
- **字符查找：** [glyph-lookup.ts](../../../src/content/graphics/glyph-lookup.ts) 的 `glyphFor(font, code)` 在字符映射中查找文本字节的字形，`glyphsFor(font, text)` 逐个查找字节序列。未映射的码位报 `unmapped-character`（序列中为 `text[<i>]`），即使恰有同号字形也不回退；错误不回显码位。

针对性检查为 `pnpm exec vitest run src/content/graphics`。

## 状态显示屏文字 payload

[content/hud/status-messages-payload.ts](../../../src/content/hud/status-messages-payload.ts)（[P2-07/20](../../plan/p2/07/subtasks/20-snip-diag-conversion.md)，契约见 [P2-07 spec](../../plan/p2/07/spec.md#状态显示屏文字-payload)）定义 `cockpit-hud-map` 组唯一的 `data` Asset 的 payload：状态显示屏两行消息的文字与时序，来源结构见 [hud 的 DIAG 10489](../../original/formats/hud.md#diag-10489-confirmed-structure-p2-07-revision)。它是纯 TypeScript，不导入 `original-data`。

- **常量：** `STATUS_MESSAGES_SCHEMA_VERSION` 为 1；`STATUS_MESSAGES_ROLE` 为 `status-messages`，消费者按它选择读取器；`STATUS_MESSAGES_COUNTS` 固定各列表长度（状态格式 4、评级 5、子系统名称 15、状态词 3，程序按这些数目读取）；`STATUS_MESSAGES_LIMITS` 为每段文字 0–255 字节、启动消息 0–16 条。
- **字节布局：** 小端，37 字节头部加文字，总长恰为二者之和：
  - 0–15：上行与下行各两个 `u32`，依次为每打出一个字符的 tick 数与打完后停留的 tick 数；
  - 16–35：5 个 `i32` 评级上限，按存储顺序；
  - 36：`u8` 启动消息数 S（0–16）；
  - 37 起：28 + S 段文字，每段为 `u8` 长度 L（0–255）加 L 个非零字节，顺序为 4 个状态格式、5 个评级文字、15 个子系统名称、3 个状态词、下行格式、S 条启动消息。
- **文字：** 每段是字节串，读取结果中每个字符的码位等于一个存储字节（1–255），不含结尾 NUL；换行与 printf 风格的转换说明原样保留，本模块不解释它们。
- **编码与读取：** `encodeStatusMessagesPayload` 校验字段（列表长度、整数范围、字节值）后写入独占新缓冲；`statusMessagesPayloadLength` 按字段、`statusMessagesLengthOf` 按各段字节数给出编码长度，供转换器先扣除。`readStatusMessagesPayload(bytes, schemaVersion, path)` 返回冻结数据：schema 不是 1 为 `unsupported-payload-schema`，截断、尾随字节、启动消息数超过 16 或文字含 0 字节为 `invalid-status-messages-payload`（[contract-validation.ts](../../../src/content/contract-validation.ts) 追加），已转移的字节为 `payload-detached`。诊断只含结构路径，不回显文字。
- **绑定：** `checkStatusMessagesBinding(descriptor)` 要求 kind 为 `data`、角色为 `status-messages`、没有依赖，否则为 `binding-mismatch`。

针对性检查为 `pnpm exec vitest run src/content/hud`。查看器只列出效果角色的 `data` Asset，不显示这一 payload。

## 模型 payload

[content/models/](../../../src/content/models/)（[P2-06/01](../../plan/p2/06/subtasks/01-model-payload.md)）定义 `model` Asset 的规范 payload，对应 P2-01 的 `model-with-internal-geometry` 单位：一个模型连同其内部几何，网格不是独立 Asset。它是纯 TypeScript，不导入 `original-data`、DOM、Node 或 Three.js；原版转换由 `original-data` 产生这些字节。

- **常量：** [model-payload.ts](../../../src/content/models/model-payload.ts) 的 `MODEL_PAYLOAD_SCHEMA_VERSION` 为 1，改变布局或解释须递增。`MODEL_LIMITS` 供读取器与转换器共用：
  - **安全上限**（[P2-06 spec](../../plan/p2/06/spec.md#限值与预算)批准，各有限值名）：每个几何顶点 1–4,096（`meshVertices`）、三角形 1–4,096（`meshTriangles`），每个模型三个列表合计部件 1–256（`modelParts`）；
  - **格式规则：** 部件列表恰为 3 个（`partLists`），音效槽恰为 5 个（`soundSlots`）。

  `MODEL_PAYLOAD_LAYOUT` 给出下表各部分的字节数，`modelPayloadLength(shape)` 按几何的顶点与三角形数、部件数和引用 ID 给出编码长度，供转换器在读取与分配之前扣除 `payloadBytes`，并计算份额下的上界。
- **字节布局：** 小端，无填充，总长恰为各部分之和：

  | 部分 | 内容 |
  |---|---|
  | 头部（22 字节） | `u8` 部件列表数（3）、`u8` 音效槽数（5）、`u16` 引用数 N、`u16` 几何数 G（1 至部件总数）、3 个 `u16` 列表 0–2 的部件数（合计 1–256）、5 个 `u16` 音效槽（0 为空，否则为 1 + sound 引用的序号） |
  | 引用表 | N 项，每项 `u8` 长度（1–128）后接 ASCII 的 Asset ID；恰为部件与音效槽用到的不同 ID，严格升序，因此等于描述符依赖 |
  | 部件（每个 11 字节） | 按列表 0、1、2 与存储顺序：`u32` 源标志字（原样）、`u8` R、G、B、`u16` 几何序号、`u16` 贴图（0 为无，否则为 1 + image 引用的序号） |
  | 几何（G 个） | 按部件首次使用的顺序：`u16` 顶点数 V、`u16` 三角形数 T、`u16` 着色槽数 S（1 至 3T）；V × 3 个 `f32` 位置、V × 2 个 `f32` UV、V × 3 个 `f32` 法线；T × 3 个 `u16` 顶点索引（小于 V，绕序按存储）、T × 3 个 `u16` 角点着色槽（小于 S） |

  规范形式唯一：引用表按上述规则排列，每个几何都被部件使用且按首次使用排序，同一模型因此只有一种字节表示。浮点全部有限并逐位保留（含负零与次正规数）；允许未被三角形使用的顶点。
- **编码与读取：** `encodeModelPayload` 按读取器的同一规则校验 `{ geometries, partLists, soundSlots }`，写入独占整个 `ArrayBuffer` 的新缓冲，同一输入得到同样的字节与 SHA-256。`readModelPayload(bytes, schemaVersion, path)` 严格读取：每个计数先检查范围、其字节先确认存在，然后才分配；返回冻结数据，几何数组是调用者独占的新副本。schema 不是 1 为 `unsupported-payload-schema`；截断、尾随字节、计数或字段越界、非有限浮点、索引或着色槽越界、部件的几何序号越界或不按首次使用顺序、贴图或音效槽的引用越界或 kind 不符、引用表不等于实际使用的 ID 为 `invalid-model-payload`；已转移的字节为 `payload-detached`。颜色分量以 `u8` 存储，大于 255 的值只可能出现在编码器输入中，由编码器拒绝。诊断只含结构路径（如 `payload.geometries[0].indices`、`payload.partLists[1][2].texture`），不回显取值。
- **绑定：** `modelReferences(model)` 给出全部非空贴图（`image`）与音效槽（`sound`）引用，去重后按 ID 升序；`checkModelBinding(descriptor, payload)` 要求描述符 kind 为 `model`、依赖恰好等于这些引用（ID 与 kind），否则报 `binding-mismatch`。模型不直接依赖调色板，贴图的调色板是贴图自己的依赖。
- **消费辅助：** [model-parts.ts](../../../src/content/models/model-parts.ts) 的 `modelPartItems(model, list)` 按源列表 0–2 与存储顺序给出部件项：几何的位置、UV、法线、索引、角点着色槽与着色槽数，以及材质 `{ colour }` 或 `{ colour, texture, wrap: 'repeat' }`（UV 在两个方向都按重复寻址）。每次调用返回新的冻结项与数组副本，修改它们不影响 payload 或后续调用；不剔除、不重排三角形，不翻转 UV。列表序号不是 0–2 为 `invalid-model-payload@list`。`expandModelTextures(model, images, palettes)` 对模型引用的每个贴图调用 `expandImage`，`images` 与 `palettes` 必须恰好是引用的贴图及其调色板，否则为 `binding-mismatch@images` 或 `@palettes`；颜色不另行计算。
- **payload 不承载的含义：** 部件列表、源标志字与音效槽都按源序号原样保留，payload 不命名也不解释它们；已知的含义与置信度只记在 [mesh](../../original/formats/mesh.md)，音效槽以 P2-08 的记录为准。光照与明暗不在这里（P3，U-028）。
- **消费者边界：** 坐标是原版模型空间的数值，不换算单位、轴向或手性；正面绕序与 UV 原点（v = 0 对应贴图首行还是末行）都未确认，payload 不作解释。P2-11 的渲染适配选择换算并在本指南记录，P2-12 用原版截图判定；判定有误时只改渲染适配，不必重新导入或递增 schema。贴图是独立的 image Asset，可被多个模型共用：渲染适配按 image Asset ID 共享一个 GPU 纹理，最后一个引用模型释放后释放；几何属于各自的模型，不跨模型共享。查看器的中性光照不得称为原版效果。
- **对照入口：** P2-11 渲染与 P2-12 本地对照都只经 `readModelPayload`、`modelPartItems`/`expandModelTextures` 与 P2-05 的 `expandImage` 取数据，不另建研究用的解码路径。

合成模型由 [models.test-support.ts](../../../src/content/models/models.test-support.ts) 在代码中生成。针对性检查为 `pnpm exec vitest run src/content/models`。

## 效果 payload

[effects/](../../../src/content/effects/) 实现 [P2-06 spec](../../plan/p2/06/spec.md#效果几何数据) 的三个效果 `data` Asset：弹丸、导弹与碎片的程序几何的源数据（P2-06/17）。构建规则与各字段的来源只记在 [executable](../../original/formats/executable.md#effect-geometry-data-p2-0614-research)。

- **常量：** [effect-payload.ts](../../../src/content/effects/effect-payload.ts) 的 `EFFECT_PAYLOAD_SCHEMA_VERSION` 为 2（P2-11/16）。
  - `EFFECT_LIMITS` 是批准的安全上限：弹丸记录 1–64（`effectRecords`）、导弹类型 1–32（`missileTypes`）、机身段数 3–64（`ringSegments`）；部件数 1–4、打包颜色不超过 24 位是格式规则。
  - `EFFECT_SHAPES` 是源结构的固定计数（弹丸模板 4 个顶点、尾翼 9 个、元素 6 个、附加元素 3 个、碎片模板 6 个顶点与 6 个法线，3 个无贴图缩放与 2 个有贴图缩放）。
  - `MISSILE_CONSTANTS` 是导弹常量的源顺序。
  - `effectPayloadLength(payload)` 只按计数给出编码长度，供转换器在分配之前扣除 `payloadBytes`。
- **字节布局：** 小端，无填充。面表为 `u16` 字数 W，后接 W 个 `u32`：每个面为角数与各角，以 0 结束。弹丸与导弹的角是顶点序号；碎片的构建函数传入逐顶点法线，它的角是（顶点序号，法线序号）一对（[P2-11 子任务 24](../../plan/p2/11/subtasks/24-debris-face-pairs.md)，依据见 [executable](../../original/formats/executable.md#effect-geometry-data-p2-0614-research) 的面表一条）。贴图引用为 `u8` 长度（1–128），后接 image Asset ID 的 ASCII 字节。

  | payload | 布局 |
  |---|---|
  | 弹丸 | `u16` 记录数 R（1–64）；两套模板，各为面表、12 个 `f32` 顶点、6 个 `u32` 宽度标记（x、y、z 各两个）、`u32` 长度标记、`f64` 长度常量；R 条 24 字节的记录：`u32` 构建选择、`f32` 宽度、`f32` 长度、3 个 `f32` 颜色 |
  | 导弹 | 贴图引用；`u16` 类型数 T（1–32）；尾翼、元素、带标志元素、附加元素四个面表；按源顺序的 6 个 `f64` 常量（不导入旋转步长）；`f64` 旋转缩放；3 个 `f32` 附加元素颜色；T 个类型：`u32` 部件数 P（1–4），机身 `f32` r0、r1、长度、`i32` 段数（3–64）、`u32` 打包颜色，P − 1 片尾翼（4 个 `f32` 与 `u32` 打包颜色），3 个 `f32` 元素参数，`f32` 标志 |
  | 碎片 | 贴图引用；无贴图与有贴图两个模板，各为面表、18 个 `f32` 顶点、18 个 `u32` 每顶点字（6 个顶点法线）；3 个无贴图缩放、2 个有贴图缩放、两组各 3 个 `f32` 颜色；`f64` 柱面映射倍数 `mappingMultiplier`（K） |

  浮点全部有限并逐位保留；标记与每顶点字是位模式，不按浮点解释。面表最多 65,535 个字（`MAX_FACE_WORDS`），每个面有 3 个至该形状顶点数个角，顶点序号小于该形状的顶点数，法线序号小于该形状的法线数，一对不完整也不合规；至少一个面，0 恰在最后一个字。
- **编码与读取：**
  - `encodeEffectPayload(payload)` 按读取器的同一规则校验，32 位浮点字段须恰为 32 位浮点值，写入独占的新缓冲；同一输入得到同样的字节。
  - `readEffectPayload(bytes, schemaVersion, kind, path)` 严格读取：计数先检查范围、字节先确认存在，再分配；返回冻结数据，数组为调用者独占的副本。
  - schema 不是 2（包括旧版本 1）为 `unsupported-payload-schema`；截断、尾随字节、计数或字段越界、非有限浮点、面表不合规、贴图不是 image Asset ID 为 `invalid-effect-payload`；已转移的字节或数组为 `payload-detached`。诊断只含结构路径（如 `payload.types[1].fins[0].colour`）。
- **绑定：** `effectReferences(payload)` 给出导弹与碎片的贴图引用，弹丸没有引用。`checkEffectBinding(descriptor, payload)` 要求描述符 kind 为 `data`、角色等于 payload 种类（`projectile`、`missile`、`debris`）、依赖恰为这些引用，否则报 `binding-mismatch`。
- **展开：** [expand-effects.ts](../../../src/content/effects/expand-effects.ts) 的 `expandProjectiles`、`expandMissiles` 与 `expandDebris` 是纯函数，按 executable 的构建规则给出冻结的形状。
  - **形状内容：** 位置、面（顶点序号数组）、颜色或 null、贴图 Asset ID 或 null、贴图形状的逐顶点 `uvs`（无贴图时为 null）。碎片形状另带模板每顶点字的副本。
  - **面表：** `faceTriangles(words, vertices, normals, path)` 不分配地校验面表并给出三角形数，`faceList` 给出冻结的面数组，只含顶点序号。`normals` 为 0 时每个角是一个顶点序号（弹丸与导弹），为正数时是一对（碎片传 `EFFECT_SHAPES.debrisNormals`）。一次展开中每个源面表只解析一次，由它生成的形状共用同一组冻结的面；机身的面直接按规则生成。
  - **数值：** 以 64 位浮点计算，结果分量在最后舍入为 32 位。例外是弹丸的宽度乘积：它先舍入为 32 位，再与长度标记比较，因为原版比较的是存回的值。
  - **导弹：** 元素面表按标志的浮点值是否为 0 选择；附加元素在标志的位模式非 0 时生成，所以负零也生成。
  - **贴图坐标：** 对构建后的 32 位位置按 64 位浮点计算，最终舍入为 32 位；导弹只用旋转 0，碎片的包围盒来自缩放后的形状。公式与轴上零的处理见 [executable](../../original/formats/executable.md#effect-texture-mappings-p2-1115-research)。不模拟 x87 扩展精度或额外的中间舍入。
  - **错误：** 任一结果分量不是有限值时报 `invalid-effect-payload`，位置为形状路径后接 `.positions`、`.colour` 或 `.uvs`；零映射缩放、零高度碎片与 UV 溢出不会静默回退。
  - **规模：** `effectExpansionSize(payload)` 不展开，只按计数与面表给出顶点数和三角形数（每个面计角数 − 2），供转换器在分配之前扣除。
- **不做的事：** 不生成法线、明暗或模式字；不导入或显示导弹未应用的旋转映射。

合成效果 payload 由 [effects.test-support.ts](../../../src/content/effects/effects.test-support.ts) 用任意数值在代码中生成。针对性检查为 `pnpm exec vitest run src/content/effects`。

## 规范 JSON 与规则数据 payload

[P3-03](../../plan/p3/03/spec.md#规范-payload) 新增的结构化 `data` payload 都采用 `logic` 组的规范 ASCII JSON。各族是纯 TypeScript，不导入 `original-data`；格式事实见 [craft](../../original/formats/craft.md)、[ai](../../original/formats/ai.md)、[comm](../../original/formats/comm.md)、[hud](../../original/formats/hud.md#tabl-10165-selectors-and-tabl-10399-labels-p3-0304) 与 [executable](../../original/formats/executable.md#flight-message-strings-and-the-rens-header-p3-0304)。

- **规范 JSON（[P3-03/06](../../plan/p3/03/subtasks/06-shared-contract-foundation.md)）：** [canonical-json.ts](../../../src/content/canonical-json.ts) 只导入 `contract-validation.ts` 与 `ownership.ts`。
  - `CanonicalJsonFormat { name, byteLimit, invalid }`：`name` 用于固定的诊断文字，`invalid` 为该族的格式错误码。
  - `requireCanonicalJsonBytes(bytes, format)` 在读取描述符或任何字节之前检查 `Uint8Array`、未被转移（`payload-detached`）与字节上限。
  - `encodeCanonicalJson(value, format, reserve?)` 要求 `value` 是严格读取的结果；先以字节长度调用 `reserve`，再查上限并分配恰好长度的新缓冲。
  - `decodeCanonicalJson(bytes, format, read, encoded?)` 在上述检查之后要求可打印 ASCII 与 JSON 文本、由调用者的 `read` 接受，且 `encoded(result)`（默认即结果）的规范文本与输入逐字节相同，否则为 `non-canonical-payload`。诊断路径为 `payload`，不回显字节。
  - **规范文本：** 无空白，字段顺序由读取器决定，数字为 ECMAScript 最短往返形式，−0 写作 0；字符串按 `JSON.stringify` 转义，其余 0x7F 及以上的码元写成小写 `\uXXXX`，因此码位 1–255 的字节串（字段处理规则 8）也是可打印 ASCII。有限 `f32` 转为 double 是精确的，最短形式往返后逐位不变，次正规数也是。规范文本不能承载 −0，读取器把它读为 0，所以转换器把来源中的 −0.0 `f32` 判为 `unsupported-payload`（基准中没有）。
- **规则数据（[P3-03/08](../../plan/p3/03/subtasks/08-rule-data-payloads.md)）：** [rule-data/](../../../src/content/rule-data/) 提供 `logic` 组 7 个 `data` 角色的 payload（[P3-10/29](../../plan/p3/10/subtasks/29-comm-messages-import.md) 按 P3-03 修订 2 加入 `comm-messages`），它们没有依赖，payload schema 各为 1。
  - **入口：** [rule-data-payload.ts](../../../src/content/rule-data/rule-data-payload.ts) 的 `RuleDataPayload`（`{ role, content }` 的 7 角色联合）、`RuleDataRole`、`RULE_DATA_ROLES`、`RULE_DATA_SCHEMA_VERSIONS`、`readRuleDataContent(role, value, path?)`、`encodeRuleDataPayload(payload, reserve?)`、`checkRuleDataBinding(descriptor, path?)` 与 `decodeRuleDataPayload(bytes, descriptor)`。解码顺序与 logic payload 相同：先查字节（上限沿用 `LOGIC_LIMITS.payloadBytes`），再查描述符（角色须为 7 者之一、kind 为 `data`，否则 `invalid-logic-payload`；有依赖为 `logic-reference-mismatch`）与 schema 版本（`unsupported-payload-schema`），最后按角色严格读取并逐字节比对规范文本。
  - **各族：** `craft-info.ts`（`readCraftInfo`、`CRAFT_INFO_COUNTS`、`CRAFT_INFO_LIMITS`）、`debris-parameters.ts`（`readDebrisParameters`、`DEBRIS_PARAMETERS_LIMITS`）、`ai-programs.ts`（`readAiPrograms`、`AI_PROGRAMS_COUNTS`、`AI_PROGRAMS_LIMITS`、`AI_SCRIPT_END_OPCODE`、`CodeIdentity`）、`comm-menus.ts`（`readCommMenus`、`COMM_MENUS_LIMITS`）、`base-repair-items.ts`（`readBaseRepairItems`、`BASE_REPAIR_ITEM_COUNT`）、`flight-messages.ts`（`readFlightMessages`、`FLIGHT_MESSAGES_LIMITS`）与 `comm-messages.ts`（`readCommMessages`、`COMM_MESSAGES_LIMITS`、`COMM_FACE_TABLES`），以及各记录的类型。共用的严格字段读取在 [rule-data-fields.ts](../../../src/content/rule-data/rule-data-fields.ts)：整数按 i32、u32、int32（0…2³¹−1）与 u8 核对，`f32` 须有限且 `Math.fround` 不变，字节串为码位 1–255，列表先查长度再读元素，`records()` 按形状逐字段读取并冻结（形状的键序即规范字段顺序）。
  - **命名：** 含义未确认的数值字段以 `atXX` 命名，即它在所在结构内的源位置 +0xXX；格式文档确认了用途或结构的字段用结构名（如 `name`、`boxes`、`mounts`、`body`、`weapon`、`installScript`、`stateScripts`、`opcode`、`argument`、`branch`、`handler`、`kindMask`、`command`）；spec 给出的名称照用（`hitDamageScale`、`guns`、`missiles`、`craft`、`missileBodies`、`byCraftType`、`groupTriple`、`programs`、`entries`、`builtInPrograms`、`subsystemSelectors`）。类型注释写明源位置、存储类型与格式文档小节，并链接 U 项（U-001、U-008、U-022、U-026、U-027、U-030）。
  - **不携带：** 载入代码覆盖的位置、只在基准中为零的字节与被改写为序号的首字（由位置表示）；文件偏移、条目 ID、`flags` 与 locator 也不出现。唯一的例外是内置 AI 程序处理程序的不透明代码标识 `{ object, offset }`（LE 对象号与对象内偏移，字段处理规则 4）。
  - **零值与整数：** 只有已确认的“缺省或不存在”记为 null：mount +0x18/+0x1C、DFPG +0x38、脚本 +0x04/+0x14 的 0，以及程序表 +0x08 的 0 与 +0x2C 的 ±0；这时读取器拒绝字面的 0，一种内容只有一种表示。内置程序不做后两个替换。craft 中只以与符号无关的方式使用的整数按 int32 只接受 0…2³¹−1，ai 按其 §6 保留为 u32。机型碰撞形状的 +0x00 与 +0x08–+0x1C 只在 `boxes` 为空时保留，有 box 时为 null。
  - **族内约束：** `craft-info` 的导弹 → 弹体、mount → 炮或导弹（按 `at10` 选择数组）、mount 之间的链与 mount 列表都须在范围内；`ai-programs` 的 `entries` 须恰为程序可达的条目，按表载入器 `0x649c8` 首次到达的顺序排列（每个程序依次为其 +0x1C 条目、安装脚本，再按偏移顺序排列 6 个状态列表），脚本以操作码 10000 恰好结束于最后一项，分支目标为本脚本内的项；`comm-menus` 每张列表的值恰在最后一项为 0；`base-repair-items` 的 11 个值为 0–31、33 或 34；`flight-messages` 的 7 个键按源顺序；`comm-messages` 的 `faceTables` 恰为 3 项（表 20011、20019、20985 的顺序），每项为按头像排列的子表、子表为消息数组，`direct` 为表 20983 的消息数组，每条消息为 `{ present: false }` 或 `{ present: true, frameDurations }`（1 帧以上，时长为 0…2³¹−1 的 i32，单位 1/8 秒，负值在来源层即为 `unsupported-payload`），`names2001`、`names2011` 为非空字节串的名单（[executable RQ4、RQ9 与 RX1](../../original/formats/executable.md#rq4-speaker-faces-and-message-lookup--confirmed-code)）。结构错误为 `invalid-logic-payload`，payload 内引用不符为 `logic-reference-mismatch`，诊断只含结构路径。
  - **限值（AC-14）：** 可调上限为观测值 × 2 再向上取整到 2 的幂，测试以同一公式由观测值重算；恰等于上限时通过，超出 1 时在对应路径报 `invalid-logic-payload`。格式规定的固定数目（20 个种类位、3 张 mount 列表、DEBRIS 的 20 组、三元组 3、元素 4 个 `f32`、11 个选择值、5 张菜单、7 条消息与 3 张头像表）少或多都拒绝，不是可调上限。

    | 族 | 限值 | 观测值（来源） | 上限 |
    |---|---|---:|---:|
    | `craft-info` | `guns` / `missiles` / `missileBodies` | 10 / 9 / 9（[craft §3.9](../../original/formats/craft.md#39-zero-only-positions-and-observed-values)，CINF 4037） | 32 / 32 / 32 |
    | `craft-info` | `mounts`（每机型）/ `boxes`（每机型） | 16 / 32 | 32 / 64 |
    | `craft-info` | `mountListEntries`（每张列表）/ `pairs`（每机型） | 3 / 3 | 8 / 8 |
    | `craft-info` | `nameBytes` | 26 | 64 |
    | `debris-parameters` | `records`（每种类位）/ `boxes`（每记录） | 8 / 1（[craft §4.2](../../original/formats/craft.md#42-layout-confirmed)） | 16 / 2 |
    | `ai-programs` | `programRecords`（TABL 6003 与内置表共用） | 10（内置表；TABL 6003 为 5，[ai §8](../../original/formats/ai.md#8-observed-maxima)） | 32 |
    | `ai-programs` | `programNameBytes` / `globalElements` / `entries` | 20 / 5 / 25 | 64 / 16 / 64 |
    | `ai-programs` | `stateScriptItems`（每张列表）/ `scriptItems`（含终止项）/ `scriptTextBytes` | 6 / 40 / 37 | 16 / 128 / 128 |
    | `comm-menus` | `items`（含末项）/ `textBytes` | 8 / 15（[comm §5](../../original/formats/comm.md#5-observed-sizes-confirmed-data)） | 16 / 32 |
    | `flight-messages` | `textBytes` | 45（[executable](../../original/formats/executable.md#flight-message-strings-and-the-rens-header-p3-0304)） | 128 |
    | `comm-messages` | `faces`（每张头像表）/ `faceMessages`（每张子表）/ `directMessages` | 5 / 61 / 85（[executable RQ4](../../original/formats/executable.md#rq4-speaker-faces-and-message-lookup--confirmed-code)） | 16 / 128 / 256 |
    | `comm-messages` | `frames`（每条消息）/ `names`（每份名单）/ `nameBytes` | 4 / 20 / 11（RQ9、[comm §9](../../original/formats/comm.md#9-name-lists-tabl-2001-and-2011-p3-1029)） | 8 / 64 / 32 |

  - 合成内容由 [rule-data.test-support.ts](../../../src/content/rule-data/rule-data.test-support.ts) 在代码中生成，数值是任意选取的合成值，文字带 `MARKER`。

针对性检查为 `pnpm exec vitest run src/content/rule-data src/content/canonical-json.test.ts`。

## 飞行数据 payload

[content/flight/](../../../src/content/flight/)（[P3-03/09](../../plan/p3/03/subtasks/09-flight-data-payloads.md)）提供 `models` 组 4 个 `data` 角色的规范 JSON payload，payload schema 各为 1。

- **常量与类型：** [flight-data-content.ts](../../../src/content/flight/flight-data-content.ts) 的 `FLIGHT_DATA_ROLES`（`scene-settings`、`explosion-table`、`explosion-animation`、`nebula-backgrounds`）、`FlightDataRole`、`FLIGHT_DATA_SCHEMA_VERSIONS`、`FLIGHT_DATA_LIMITS`（见下）、格式规则 `FLIGHT_DATA_FORMAT`（`explosionLists` 3、`colourComponents` 3、`screenFlashes` 3），以及类型 `SceneSettings`、`SceneColour`、`SceneDeviceValues`、`ScreenFlash`、`ExplosionTable`、`ExplosionEntry`、`ExplosionAnimation`、`NebulaBackgrounds` 与按角色区分的联合 `FlightDataPayload`。
- **形状：**
  - `scene-settings`：RENS 10751 头部 +0x00–+0x57（[executable 的 RENS 头部](../../original/formats/executable.md#flight-message-strings-and-the-rens-header-p3-0304)）。`lightType3Colour`（+0x00–+0x08）与 `lightType0Colour`（+0x0C–+0x14）各为 3 个 `f32`；`deviceByte`（+0x18，u8）；`deviceValues { base, kinds1c7c, kindsF8000 }`（+0x1C、+0x20、+0x24，`f32`）；恰 3 项 `screenFlashes`，按 +0x28、+0x38、+0x48 的顺序，每项 `{ randomMask: u32, duration: f32, drawIntervalTicks: u32, level: i32 }`。名称只取已确认的用途，“方向光/环境光”与“距离阈值”只在类型注释中按高概率标注（U-027、U-028）。+0x19–+0x1B 无人读取，不转换；+0x58 起的记录表属 `data/projectile-visuals`。
  - `explosion-table`：`lists` 恰 3 张，按 EXIC 顺序；每项为 `{ sound, animation }` 两个 `AssetReference`，kind 分别须为 `sound` 与 `data`。列表可以为空，也可以含重复项。EXPL 项的选择归表现层（P3-12、P3-14，见 P3-02 spec 的 [CR-11](../../plan/p3/02/spec.md#cr-11-表现层的归属与已批准的差异d-01)）；Core 只读取动画引用并核对帧数（[Core 消费的规则输入](#core-消费的规则输入)）。
  - `explosion-animation`：`frames` 为按帧序的 `image` 引用，1–32 项。数据中没有逐帧或动画参数（[textures §6](../../original/formats/textures.md#6-anim-explosion-animations-confirmed)），时序与位置是代码规则。
  - `nebula-backgrounds`：`images` 为按 NEBC 顺序的 `image` 引用，0–32 项，可含重复项；起点与方向归 P3-12。
- **读取与编码：** [flight-data-readers.ts](../../../src/content/flight/flight-data-readers.ts) 的 `readSceneSettings`、`readExplosionTable`、`readExplosionAnimation`、`readNebulaBackgrounds` 与 `readFlightDataContent(role, value, path?)` 返回深度冻结、与输入隔离的结果；`f32` 须有限且能被 `f32` 精确表示，整数按 u8、u32、i32 的值域核对，−0 规范化为 0。[flight-data-payload.ts](../../../src/content/flight/flight-data-payload.ts) 的 `encodeFlightDataPayload(payload, reserve?)` 经规范 JSON 编码；`decodeFlightDataPayload(bytes, descriptor)` 依次检查字节（上限、转移）、描述符（角色须为上述 4 个之一、kind 为 `data`，否则 `invalid-flight-data-payload`；schema 不符为 `unsupported-payload-schema`）、规范 JSON 与严格读取，最后核对依赖；`flightDataDependencies(payload)` 给出描述符应有的依赖。
- **依赖绑定：** 描述符依赖须恰为 payload 内的引用去重后按 ID 升序（ID 与 kind 都相同），否则为 `flight-data-reference-mismatch`：爆炸表依赖动画 `data` Asset 与 `sound` Asset（跨组的 `sound/explosion/blast-v1`–`v4`），动画依赖其帧图像，星云列表依赖星云图像，场景设置没有依赖。
- **错误码：** [contract-validation.ts](../../../src/content/contract-validation.ts) 为 `models` 与 `cockpit-hud-map` 组的新 `data` 角色（场景设置、爆炸表、爆炸动画、星云列表、视角标签与 HUD 文字）追加 `invalid-flight-data-payload` 与 `flight-data-reference-mismatch`；`non-canonical-payload` 与 `logic` 组共用。
- **限值（AC-14）：** `FLIGHT_DATA_LIMITS` 为 `explosionListItems` 16（EXIC 每张列表最多 7 项）、`animationFrames` 32（ANIM 每条目最多 12 帧，观测范围是全部 186 帧）与 `nebulaImages` 32（NEBC 10661 的 15 项），都是观测值 × 2 向上取整到 2 的幂。列表在读取元素之前判定长度。`payloadBytes` 16,384 是解析前的字节上限：各结构都在上限时的最大编码实测 15,713 字节（爆炸表），向上取整到 2 的幂。

合成内容由 [flight-data.test-support.ts](../../../src/content/flight/flight-data.test-support.ts) 生成（`syntheticSceneSettings`、`syntheticExplosionTable`、`syntheticExplosionAnimation`、`syntheticNebulaBackgrounds`、`syntheticFlightPayload` 与给出规范字节和 `models` 组描述符的 `syntheticFlightAsset`）。针对性检查为 `pnpm exec vitest run src/content/flight`。

## 视角标签与 HUD 文字 payload

`hud/` 中另有 `cockpit-hud-map` 组的两种规范 JSON payload，诊断与错误码同[飞行数据 payload](#飞行数据-payload)。查看器只列出效果角色的 `data` Asset，不显示它们。

- **视角标签（[P3-03/09](../../plan/p3/03/subtasks/09-flight-data-payloads.md)）：** [view-labels-payload.ts](../../../src/content/hud/view-labels-payload.ts) 的 `VIEW_LABELS_ROLE`（`view-labels`）、`VIEW_LABELS_SCHEMA_VERSION`（1）、`VIEW_LABELS_LIMITS`（`payloadBytes` 256、`textBytes` 32）、格式规则 `VIEW_LABELS_FORMAT`（`labels` 1、`subMode` 8）、类型 `ViewLabels`/`ViewLabel`，以及 `readViewLabels`、`encodeViewLabelsPayload(content, reserve?)` 与 `decodeViewLabelsPayload(bytes, descriptor)`。
  - payload 为 `{ labels: [{ subMode: 8, text }] }`：TABL 10399 第 8 项的标签，`text` 为 0–32 字节的字节串（码位 1–255，不含 NUL），不解释也不改写；依赖须为空，否则为 `flight-data-reference-mismatch`。第 0–7 项属 G-08，第 9–12 项的用途未确认，都不导入（[hud](../../original/formats/hud.md#tabl-10165-selectors-and-tabl-10399-labels-p3-0304)）。
  - `textBytes` 32 为观测值 16 字节的 2 倍；`payloadBytes` 256 是 32 个需转义的字节编码后（约 229 字节）向上取整到 2 的幂。
- **HUD 文字（[P3-03/25](../../plan/p3/03/subtasks/25-hud-text-payload.md)）：** [hud-text-payload.ts](../../../src/content/hud/hud-text-payload.ts) 定义 `data/hud/text` 的 payload：`{ entries }` 的规范 JSON，固定 64 个键，每键一条字节串，对应闭包 #47 的 64 个 EXE 文字区域（[executable 的 HUD、地图与通讯文字](../../original/formats/executable.md#hud-map-and-communications-text-from-the-exe-p3-0324)）。
  - **常量：** `HUD_TEXT_ROLE`（`hud-text`）、`HUD_TEXT_SCHEMA_VERSION`（1）与 `HUD_TEXT_LIMITS`：`textBytes` 32 是观测最大值 15 字节（含 NUL）的 2 倍向上取整到 2 的幂；`payloadBytes` 16,384 是 64 条 32 字节、每字节都需 6 字符转义时的编码 13,903 字节向上取整到 2 的幂。键集是固定的格式规则，不是可调上限。
  - **键集与格式：** `HUD_TEXT_FORMATS` 是键到格式的冻结常量，键序即 schema 顺序与规范字段顺序（`HUD_TEXT_KEYS`、`HudTextKey`）。值为 null 表示代码逐字节绘制，`%` 字节按字形绘制、不核对；否则该文字是交给格式化函数的格式串，值为按出现顺序的转换序列（`HudTextConversion`：`%d`、`%.0f`、`%s`、`%%`），无参数的格式串为空数组。64 个键中 39 条是格式串（25 条带参数转换，14 条没有），25 条逐字节绘制。键名为仪表前缀加用途，不含原版文字：`target`（目标显示屏）、`barGauge`（0–3 型条形仪表）、`overlay`（飞行叠加）、`map`（战略地图；地图与 Warp 标记的名称为 `mapMarkerName`）、`mapInfo`（信息窗；种类词与计数行以十六进制种类位结尾，例如 `mapInfoKindWord0x1`、`mapInfoKindCount0x80`）、`left`（左侧显示屏）与 `indicator`（9 型与 12 型指示），键序沿用 executable 中表格与列表的顺序；每个键的类型注释给出 EXE 地址与绘制条件。
  - **函数：** `scanFormatConversions(text)` 按 C `printf` 的转换语法（`%%`、标志、宽度、精度、长度修饰与转换字符）扫描字节串，返回原样的转换说明序列，某个 `%` 不能构成完整说明时返回 `undefined`；它不展开、不格式化。`matchesHudTextFormat(key, text)` 对逐字节键总为真，对格式串要求恰有常量所列的转换序列，读取器与转换器共用它。另有 `readHudText`、`encodeHudTextPayload(content, reserve?)` 与 `decodeHudTextPayload(bytes, descriptor)`。
  - **错误：** 缺键、多键（不回显键名）、`entries` 不是记录、类型错误、NUL、码位超过 255、超长与转换序列不符都为 `invalid-flight-data-payload`；描述符的角色或 kind 错误同为此码，schema 不是 1 为 `unsupported-payload-schema`，有依赖为 `flight-data-reference-mismatch`；非规范编码为 `non-canonical-payload`。来源与常量不符时，转换器报 `source` 层的 `unsupported-payload`（[图形转换](./original-data.md#图形转换)）。
  - 合成内容由 [hud-text.test-support.ts](../../../src/content/hud/hud-text.test-support.ts) 的 `syntheticHudText(prefix)` 与 `syntheticHudTextEntry(key, prefix)` 生成。

针对性检查为 `pnpm exec vitest run src/content/hud`。

## Core 消费的规则输入

正式 Core 的世界创建（[Core 模块说明](./core.md#世界创建)）在三份逻辑 Asset 之外读取同一个经 `validatePackage` 验证的包中的规则输入：P3-06 的 `craftInfo` 与 P3-07 的六项规则数据输入（[P3-02 spec 的 CR-01](../../plan/p3/02/spec.md#cr-01-世界创建输入与静态规则数据d-01)，Core 侧见[规则数据输入与静态规则数据](./core.md#规则数据输入与静态规则数据)）。调用者（app 的 [mission-input.ts](../../../src/app/resources/mission-input.ts)、[tools/replay-check.ts](../../../tools/replay-check.ts) 与浏览器 replay）用本模块的 payload 解码器取得对象，以 `{ id, content }` 传入；Core 不信任调用者的类型，再用下列对象读取器或字段校验严格读取，结果冻结、与输入脱离。

| Core 输入 | Asset 与角色 | 调用者的解码 | Core 的读取 |
|---|---|---|---|
| `craftInfo` | `logic` 组的 `data/craft-info` | `decodeRuleDataPayload` | `readCraftInfo`，全部内容 |
| `debrisParameters` | `logic` 组的 `data/debris-parameters` | `decodeRuleDataPayload` | `readDebrisParameters`，全部内容 |
| `aiPrograms` | `logic` 组的 `data/ai-programs` | `decodeRuleDataPayload` | `readAiPrograms`，全部内容；规则目前只用内置程序记录 1、2 的 +0x14、+0x24、+0x2C |
| `explosions` | `models` 组的 `data/explosions`（角色 `explosion-table`） | `decodeFlightDataPayload` | `readExplosionTable`，只保留各项的动画引用 |
| `explosionAnimations` | 爆炸表三张列表引用的 `data/explosion-animation/<nn>`，按 ID 升序 | `decodeFlightDataPayload` | `readExplosionAnimation`，只保留帧数 |
| `projectileVisuals` | `models` 组唯一的 `projectile` 类 `data` Asset（`data/projectile-visuals`） | `readEffectPayload` 与 `checkEffectBinding` | 没有对象读取器：只校验 `kind` 与每条记录的 `length`（有限 f32），记录数不超过 `EFFECT_LIMITS.effectRecords` |
| `models` | 运行可实例化机体绑定的模型（Core 的 `instantiableModelIds`），按 ID 升序 | `readModelPayload` 与 `checkModelBinding` | 没有对象读取器：只校验 `kind`、`MODEL_LIMITS.partLists` 个部件列表与第 1 列表的长度（不超过 `MODEL_LIMITS.modelParts`），不读几何、贴图或声音 |

- 读取器的错误在 Core 中保留为 `ContentContractError`（路径以 `input.<字段>.content` 开头）；跨输入的集合与语义检查是 Core 的 `CoreInputError`。Core 的上限取自本模块的结构上限（`CRAFT_INFO_COUNTS`、`EFFECT_LIMITS`、`MODEL_LIMITS`、`FLIGHT_DATA_FORMAT` 与 `FLIGHT_DATA_LIMITS`）。
- Core 的 setupHash 按成员类型写出 `CraftInfo`、`DebrisParameters` 与 `AiPrograms` 的全部内容（[Core 的 setupHash](./core.md#世界创建)）；这些内容类型增删成员时 Core 的写出器类型检查失败，须同步。弹丸记录与模型只写出 Core 读取的长度与部件数，外观字段的变化不改变 setupHash。
- 原版导入（`original-import`）的内容只接受生产 Asset ID；合成内容可用任意 `data/` 类 ID。读取器的形状、限值与原版字段的含义仍以本模块的各节与 `docs/original/` 为准，Core 只在[静态规则数据](./core.md#规则数据输入与静态规则数据)中按原版的存储类型计算载入变换，内容不预先变换。

针对性检查为 `pnpm exec vitest run src/core/world/rule-data.test.ts src/core/world/create-world.test.ts src/app/resources/mission-input.test.ts`。
