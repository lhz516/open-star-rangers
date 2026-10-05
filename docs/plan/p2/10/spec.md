---
type: plan
status: accepted
phase: P2
task: "10"
updated: 2026-10-05
related: [ADR-0007, ADR-0008, ADR-0015]
reviewed: sha256:05231094a3dd
---

# P2-10：IndexedDB 最小资源缓存 — Spec

## 问题与目标

[P2-01](../01/spec.md) 已定义规范内容契约，包括 `ContentIdentity`、四个资源组、payload 身份和由 `validatePackage` 推导的完整性。[P2-03](../03/spec.md) 已能产生带来源证明的 `SourceFingerprint`。但目前没有任何持久化：

- 仓库中没有 IndexedDB 代码，`src/platform/storage/` 不存在；每次刷新都必须重新读取光盘镜像并重新转换。
- 没有缓存键、记录格式和版本兼容规则，也没有“转换结果已持久化且仍可用”的判据。P2-01 只冻结了缓存必须携带的身份字段，见其[持久化与兼容](../01/spec.md#持久化与兼容)。
- 存储不可用、配额不足、写入中断、数据被浏览器清除等失败没有对应的结果形状，P2-11 无法如实区分“已缓存”和“仅在内存中”。

本任务在计划新增的 `src/platform/storage/` 建立**最小资源缓存适配器**：

- 只接受 `validatePackage` 判定为 `complete` 的四组完整规范包，以“来源身份 + 转换器版本”为键，在单个 IndexedDB 读写事务中原子提交。
- 同源刷新后可以列出和恢复。恢复时重新校验记录格式、版本以及全部 payload 的长度与 SHA-256，只有重新得到 `complete` 才返回可用包。
- 空间检查、真实配额错误、取消与中断、存储不可用、数据库被删除或被更高版本占用，都有稳定的失败形状；失败不留下可用记录，也不破坏已有的有效包。

完成后可观察的结果是：在 Chrome 的隔离环境中，合成规范包经适配器提交后，刷新页面仍能逐字节恢复；各类失败都返回预期 code，已有有效包保持可恢复。本任务不接入导入页面、Worker 或真实转换结果，这些由 P2-11 装配。

阶段范围依据[总计划 §12](../../master-plan.md#12-开发阶段与验收条件)（“缓存按光盘指纹 + 转换器版本存入 IndexedDB，暂不做迁移与清理策略”）与 [§8](../../master-plan.md#8-浏览器运行存档与隐私)，任务导航见[阶段索引](../tasks.md#p2-10-indexeddb-最小资源缓存)。

## 范围

### 包含

- **S-01 专用数据库与记录格式：** 资源缓存使用独立数据库，不与将来的设置、存档或高分榜共用。数据库版本与记录格式版本都从 1 开始，按[记录布局](#记录布局)保存每键一条的包记录和逐 Asset 的 payload 记录。
- **S-02 缓存键：** 键由来源类别、来源令牌（原版导入为 `SourceFingerprint`，合成内容为 fixture ID）和 `ConverterVersion` 组成。内容 schema 与切片定义版本不入键，在恢复时作兼容校验。
- **S-03 校验后原子提交：** 提交前用生产切片定义 `CLASSIC_P2_SLICE` 调用 `validatePackage`，并按调用方给出的预算限值核算；只有 `complete` 且未超预算的包才写入。同键旧包的删除与新包的写入在同一个读写事务中完成。
- **S-04 存储需求与空间检查：** 计算包的存储需求（payload 字节精确值加元数据估算）；基于 `navigator.storage.estimate()` 提供建议性的空间检查，结果为 `sufficient`、`insufficient` 或 `unknown`。
- **S-05 列出：** 只读取包记录、不读取 payload，返回每个键的元数据状态。列出结果不代表包可用。
- **S-06 恢复与重新校验：** 在单个只读事务中读取一个键的包记录与全部 payload 记录；事务结束后校验格式、版本、键一致性、预算与 `validatePackage`，只有 `complete` 才返回已恢复的包。
- **S-07 失败、取消与中断：** 覆盖存储不可用、更高版本占用、连接被关闭、配额不足、写入失败、读取失败、取消和页面中断。失败不留下可用记录，不破坏已有有效包，也不以内存回退冒充已持久化。
- **S-08 连接生命周期：** 适配器收到 `versionchange` 立即关闭自己的连接并停止创建新事务，已有事务按其最终事件结束；其他连接的删除或升级至多在这些事务结束前暂时 `blocked`，不会被无限期阻塞。事务内不等待非 IndexedDB 的异步工作。
- **S-09 所有权与结果形状：** 持久化的字节与通过校验的字节逐字节相同，调用方的缓冲不被转移或保留。恢复得到的每个 payload 独占一个完整的 `ArrayBuffer`。全部结果都是可结构化克隆的纯数据。
- **S-10 错误码与诊断：** 使用[封闭错误码](#错误码)。诊断只含 code、结构位置、固定原因文本、规范 Asset ID 与 P2-01 诊断，不含 payload 字节、宿主错误消息或原版定位。
- **S-11 验证：** Node 单元测试覆盖纯逻辑（键、记录读取、需求估算、错误分类）。真实 IndexedDB 行为用合成包在 Chrome 中以 E2E 验证：普通用例用隔离 context，刷新与中断用例用测试自有的临时持久 profile。不新增依赖。
- **S-12 文档对齐：** 同步[源码结构指南](../../../engineering/source-structure.md)与[工程约定](../../../engineering/README.md)中的模块职责、数据库与格式版本、测试命令和浏览器验证路线。

### 不包含

- **装配与界面：** 导入页面、进度与结果展示、面向玩家的文案、“已缓存/仅内存”的界面状态，以及何时提交、何时恢复的编排：归 [P2-11](../tasks.md#p2-11-真实导入流程与最小资源查看器)。
- **Worker：** 在导入 Worker 中调用缓存或跨线程传递 payload：归 P2-04/P2-11。本任务只要求适配器不依赖 DOM，可以在 Window 与 Dedicated Worker 中使用；在 Worker 中的实际运行由选择该方式的任务验证。
- **真实内容：** 真实转换结果及其大小：归 P2-05 至 P2-09；真实包的存储量、刷新恢复与联合回归：归 P2-11/P2-12。本任务只用合成包。
- **来源证明：** 缓存只校验表示与内部一致性，不证明 `SourceFingerprint` 来自 P2-03 的产品入口。只提交已验证管线的输出，是装配方（P2-11）的责任。
- **迁移与清理：** 记录格式或数据库版本的升级、旧转换器版本或旧来源条目的清理、缓存管理界面、按键删除接口：归 [P5](../../p5/tasks.md)。本任务只有同键替换。
- **部分缓存：** 单个资源组的缓存、导入断点续传、原始光盘或无关媒体的缓存。
- **其他持久化：** 设置（localStorage）、自有存档与高分榜：归 P4 等；Service Worker/PWA 缓存：归 P5。
- **持久存储与跨浏览器：** `navigator.storage.persist()` 请求、Safari 驱逐提示、Firefox/Safari 实测：归 P5。本任务只在 Chrome 上验证，数据消失按“未找到”处理。
- **压缩、Blob 存储、加密或签名。**

### 涉及模块

| 模块 | 责任与影响 |
|---|---|
| `src/platform/storage/`（计划新增） | 缓存适配器：数据库与记录格式、键、提交/列出/恢复、空间检查与错误分类。文件划分由实现决定，不建空目录或通用存储框架 |
| [src/content/](../../../../src/content/) | 只读复用 `validatePackage`、`readGroupManifest`、`readPayloadRecords`、`readSourceStateSet`、`readContentIdentity`、`chargeManifestBudget`、`readBudgetRecord`、`exclusiveBytes`、`payloadTransferList` 与 `CLASSIC_P2_SLICE`，不修改它们的契约。若确需新的纯 helper，放在拥有该数据的 content 模块，并保持既有导出不变 |
| `e2e/`（计划新增用例） | 在 development 项目中经 Vite 开发服务器导入 `/src` 模块，用合成包验证真实 IndexedDB；测试侧可在 `e2e/support/` 增加只读探针与 CDP 辅助 |
| [playwright.config.ts](../../../../playwright.config.ts) 与[配置回归](../../../../tools/e2e-configuration.test.ts) | 新用例依赖 `/src` 模块，只属于 development 项目；与 browser-replay 一样排除出 production 项目，并同步配置回归 |
| `src/app/`、`src/ui/`、`src/workers/`、`src/original-data/`、`src/core/`、`src/render/` | 不修改。现有 lint 已禁止 platform 导入字节端口以外的 `original-data`，也禁止纯模块导入 platform |

## 当前实现与依据

- **没有持久化实现：** `src/` 中没有 IndexedDB 或 `navigator.storage` 代码；[platform/](../../../../src/platform/) 只有 `browser/`、`files/`、`input/`。[源码结构指南](../../../engineering/source-structure.md#后续扩展方向)把 `platform/storage/` 列为 P2 的落点；IndexedDB 事务、配额与读写错误属于平台，见同文件[数据与表现](../../../engineering/source-structure.md#数据与表现)。
- **规范内容契约（P2-01，已实现）：**
  - [content-identity.ts](../../../../src/content/content-identity.ts)：`ContentIdentity` 含 schema、切片 ID、切片定义版本、`ConverterVersion`、`ManifestIdentity` 与 `ContentOrigin`；`CONTENT_SCHEMA_VERSION` 为 1。`ConverterVersion`、`FixtureId` 与 `SourceFingerprint` 都是受限 ASCII 令牌。
  - [manifest.ts](../../../../src/content/manifest.ts) 的 `GroupManifest`，[payload.ts](../../../../src/content/payload.ts) 的 `PayloadRecord` 与 `payloadMismatch`，[source-state.ts](../../../../src/content/source-state.ts) 的 `SourceStateSet`。
  - [completeness.ts](../../../../src/content/completeness.ts) 的 `GroupInput` 与 `validatePackage`：从原始输入重新推导全包完整性，包括 payload 的版本、长度与 SHA-256、来源状态和跨组引用，不信任调用者的完成标记。
  - [budget.ts](../../../../src/content/budget.ts) 的 `chargeManifestBudget`：在读取 payload 之前按描述符核算 Asset 数、依赖边数与 payload 字节。
  - [ownership.ts](../../../../src/content/ownership.ts) 的 `exclusiveBytes` 与 `payloadTransferList`：独占副本与可转移判据。
  - [slice-definition.ts](../../../../src/content/slice-definition.ts) 的唯一生产定义 `CLASSIC_P2_SLICE`，版本为 1。
- **来源指纹（P2-03，已实现）：** 格式为 `source:sha256:<64 位十六进制>`，按覆盖内容寻址，不含版本名称，见 [P2-03 来源指纹](../03/spec.md#来源指纹)。P2-03 已约定：指纹算法或覆盖范围变化只会使旧缓存失配，不会误用旧缓存，见 [P2-03 持久化与兼容](../03/spec.md#持久化与兼容)。
- **合成内容：** [synthetic-content.test-support.ts](../../../../src/content/synthetic-content.test-support.ts) 的 `syntheticPackage` 与 `syntheticOriginalGroup` 生成覆盖全部切片角色的合成包；它不导入 Node 模块，可以在浏览器页面中加载。
- **浏览器测试先例：**
  - [browser-replay.spec.ts](../../../../e2e/browser-replay.spec.ts) 在 development 项目中经开发服务器动态导入 `/src` 模块并在页面内调用，不需要生产调试 API。
  - [本地浏览器 runner](../../../engineering/README.md#本地浏览器-runner) 使用已安装的 Chrome，每个用例一个隔离 context，只清理自有资源。
  - [浏览器测试数据约定](../../../../.agents/skills/browser-testing/references/test-data.md#browser-storage) 要求存储测试使用隔离 profile、按真实记录形状读回验证；通用异常不能证明事务原子性或配额处理。
- **工具链：** Vitest 只在 Node 环境运行，仓库没有 IndexedDB 模拟依赖。[lint](../../../../eslint.config.js) 允许 platform 导入 content，禁止其导入原版定位模块。依赖许可遵循 [ADR-0008](../../../decisions/ADR-0008-mit-and-dependency-licenses.md)，模块边界遵循 [ADR-0015](../../../decisions/ADR-0015-source-module-structure.md)，P2 只覆盖切片见 [ADR-0007](../../../decisions/ADR-0007-narrow-p2-overlap-p3.md)。
- **原版研究：** 不适用。本任务不解释原版格式或行为，不涉及 U/B 项。

## 行为与边界

| 场景或状态转换 | 预期结果 | 拒绝或失败时的反馈 |
|---|---|---|
| 提交 `validatePackage` 为 `complete` 且未超预算的四组包 | 读写事务 `complete` 后返回 `committed`，带键、身份、payload 数与字节数；同键旧包被整体替换 | — |
| 提交的包不完整（缺组、payload 不符、来源未验证、身份不一致等） | 不开启写事务，库中无变化 | `package-incomplete`，附 P2-01 诊断 |
| 提交或恢复时超出调用方预算 | 提交时不写入；恢复时不读取 payload | `over-budget`，附 P2-01 预算违规 |
| 写事务遇到真实配额错误 | 事务中止，同键旧包与其他键都不变 | `quota-exceeded` |
| 写事务因其他原因中止或出错 | 同上 | `write-failed` |
| 写事务开始前取消，或在事务仍可中止时取消 | 开始前取消则不写；仍可中止时调用原生 `abort()`，事务以 `abort` 结束后库中无变化 | `cancelled`，只在事务从未开始或确已中止时返回 |
| 事务已进入提交阶段（原生 `abort()` 不再可用）或已 `complete` 后才取消 | 等待事务的最终事件 | 以 `complete` 结束则返回 `committed`；仍以 `abort` 结束则按其原因返回 |
| 写入期间页面刷新、关闭或 context 结束 | 浏览器回滚尚未提交的事务；中断与提交竞争时，任一方都可能胜出。重开后状态恰为完整旧包（新包没有任何记录）或完整新包之一 | 无；之后的列出与恢复反映实际状态，不出现混合或部分记录 |
| 同源刷新后恢复已提交的键 | 返回 `restored`：身份、清单、来源状态与提交时一致，payload 逐字节相同 | — |
| 恢复的键不存在（从未提交、数据库被删除或被浏览器清除） | 不创建任何记录 | `not-found` |
| 包记录的格式标识或版本未知，或内容 schema、切片定义版本与当前构建不符 | 不返回包，不删除记录 | `cache-incompatible` |
| 记录形状损坏、键与身份不一致、payload 记录缺失或多余、payload 被改写（含同长度改写）、来源状态不符 | 不返回部分包，不删除记录 | `cache-corrupt`，有 P2-01 诊断时附上 |
| 环境没有 `indexedDB`，或打开数据库失败（如 `SecurityError`、`InvalidStateError`） | 不提供内存回退 | `storage-unavailable` |
| 现有数据库版本高于本构建支持的版本 | 不升级、不删除、不写入 | `storage-newer-version` |
| 其他连接请求删除或升级数据库 | 适配器立即关闭连接、不再创建新事务；已有事务结束前，对方可能暂时收到 `blocked`，之后删除或升级继续 | 已开始的事务按其最终事件报告；之后的操作按实际状态报告 |
| 操作进行中连接被浏览器强制关闭（如站点数据被清除） | 不报告成功，不出现部分包；本次提交的新数据可能整体存在或整体不存在 | `storage-closed`，实际状态以之后的列出与恢复为准；未收到关闭事件、只有事务中止时为 `write-failed` 或 `read-failed` |
| 读事务出错 | 不返回部分结果 | `read-failed` |
| 空间检查：估算可用且剩余空间不小于需求 | `sufficient`，附需求、剩余、用量与配额 | — |
| 空间检查：估算可用但剩余空间不足 | `insufficient`，同样附数值；不阻止调用方继续提交 | 由调用方决定提示或继续 |
| 空间检查：没有 `navigator.storage`，或 `estimate()` 失败、返回非有限数 | `unknown`，附需求 | 提交照常进行，真实配额错误照常处理 |
| 同键两个提交并发 | 最终状态完整等于其中一次提交，不混合 | 各自按自己事务的结果返回 |
| 恢复与同键提交并发 | 此前已有有效包时，恢复得到完整旧包或完整新包；此前不存在该键时，恢复得到 `not-found` 或完整新包；都不混合 | — |
| 调用参数非法（键、需求字节数或限值的形状错误） | 不访问数据库 | `invalid-request`；限值形状错误保留 P2-01 的预算形状 code |

**不变量：**

- 只有读写事务的 `complete` 事件才算提交成功。除 `storage-closed` 外，返回 `committed` 以外结果的提交不会留下可被恢复的新数据；`storage-closed` 时本次提交的结果对调用方不可知，但同样不会留下部分包。
- 包记录与其全部 payload 记录总在同一事务中写入或删除，所以已提交状态中不存在“包记录在而 payload 不全”；万一因存储损坏出现，恢复按 `cache-corrupt` 拒绝。
- 列出结果只说明元数据可读；只有恢复返回的 `restored` 表示包可用。缓存存在不等于可用。
- 恢复失败不删除、不修改任何记录；重新导入后的同键提交会整体替换。
- 适配器没有内存回退：存储不可用时，提交不会返回 `committed`。

## 数据模型与契约

计划新增的类型都归 `src/platform/storage/`；内容类型沿用 `src/content/` 的现有定义，不复制。

### 缓存键与身份

| 数据/字段 | 类型、单位与约束 | 权威所有者 | 输入/输出或序列化边界 |
|---|---|---|---|
| `ResourceCacheKey`（计划新增） | `{ originType: 'synthetic' \| 'original-import'; originToken: string; converterVersion: ConverterVersion }`。原版导入的 `originToken` 是 `SourceFingerprint`，合成内容的是 `FixtureId`，都须通过 P2-01 的读取器 | platform/storage | 由 `ContentIdentity` 确定性推导；IndexedDB 中存为数组键 `[originType, originToken, converterVersion]`，不做字符串拼接 |
| 兼容身份 | `ContentIdentity.schemaVersion` 与 `sliceDefinitionVersion` | content | 不入键；恢复时须分别等于 `CONTENT_SCHEMA_VERSION` 与 `CLASSIC_P2_SLICE.version`，否则为 `cache-incompatible` |
| `ManifestIdentity` | P2-01 令牌 | 转换管线 | 不入键；同键重新提交时随新包替换 |

- P2-01 的两种令牌命名空间互斥：`SourceFingerprint` 必须以 `source:` 开头，fixture ID 不含冒号，跨来源误用的令牌被读取器拒绝。键仍显式保留来源类别，不依赖令牌文本区分来源。恢复结果保留原 `ContentOrigin`，合成包不会被恢复成原版导入。
- 不同指纹或不同转换器版本的包互不覆盖，可以共存；本任务不清理旧键。

### 记录布局

数据库名、数据库版本与记录格式版本属于兼容契约。对象仓库的名称与索引由实现决定，作为导出常量写入工程文档；测试按实际常量访问，不猜测。

| 记录 | 形状与约束 | 写入/读取边界 |
|---|---|---|
| 数据库 | 名称 `osr-resource-cache`，版本 1，只含本任务的对象仓库 | 只在不存在时创建；本任务不实现升级路径 |
| 包记录（每键一条） | `{ format: 'osr-resource-cache', formatVersion: 1, key, groups, payloadCount, payloadBytes }`。`groups` 按 `CLASSIC_P2_SLICE.groups` 的顺序列出四组，每组只含经读取器规范化的 `manifest`（`GroupManifest`）与 `sources`（`SourceStateSet \| null`）；`payloadCount` 与 `payloadBytes` 是四组清单声明之和 | 与该键的全部 payload 记录在同一事务中写入或删除。不保存调用方输入中的多余字段，也不保存完成布尔值、时间戳、宿主路径或原版定位 |
| payload 记录（每 Asset 一条） | 键为 `[originType, originToken, converterVersion, assetId]`；值为 `{ schemaVersion, bytes }`，`bytes` 是长度恰为 payload 字节数的 `ArrayBuffer` | 写入的就是通过校验的那份字节；输入视图若位于更大缓冲中的某个偏移，多余字节不得进入记录 |

### 操作与结果

下表是契约层的操作与结果；函数名、参数对象与文件划分由实现决定。所有结果都是可结构化克隆的判别联合。预期失败一律以结果返回，不以 rejected Promise 或泛型 `Error` 表达。

| 操作 | 输入 | 成功结果 | 可能的失败 code |
|---|---|---|---|
| 创建适配器 | 可选的 `IDBFactory` 与 `StorageManager`，默认取全局；注入只用于测试表示“环境缺少该能力”或宿主打开失败，生产装配不传入 | 适配器句柄，连接按需建立 | 无；能力缺失在首个操作中报告 |
| 存储需求 | 四组 `GroupInput` | `{ payloadBytes, metadataBytes, requiredBytes }`：payload 字节精确求和，元数据按实现固定的确定性规则估算，`requiredBytes` 为两者之和 | `invalid-request` |
| 空间检查 | `requiredBytes`，非负安全整数。导入前尚无转换结果时，P2-11 可以用已批准的 `payloadBytes` 预算上限作估计 | `sufficient` 或 `insufficient`：`{ requiredBytes, availableBytes, usage, quota }`，其中 `availableBytes = max(0, quota − usage)`；`unknown`：`{ requiredBytes }` | `invalid-request` |
| 提交 | 四组 `GroupInput`、预算限值（P2-01 `BudgetRecord`）、可选 `AbortSignal` | `committed`：`{ key, identity, payloadCount, payloadBytes }` | `invalid-request`、`package-incomplete`、`over-budget`、`storage-unavailable`、`storage-newer-version`、`storage-closed`、`quota-exceeded`、`write-failed`、`cancelled` |
| 列出 | — | `listed`：按 IndexedDB 键序排列的条目 `{ key, status, identity, payloadBytes }`。`status` 为 `compatible`（元数据可读且版本兼容）、`incompatible` 或 `corrupt`；后两者在元数据不可读时 `identity` 与 `payloadBytes` 为 null | `storage-unavailable`、`storage-newer-version`、`storage-closed`、`read-failed` |
| 恢复 | 键、预算限值 | `restored`：`{ key, identity, groups }`，`groups` 按定义顺序给出 `{ manifest: GroupManifest, payloads: readonly PayloadRecord[], sources: SourceStateSet \| null }` | `invalid-request`、`not-found`、`cache-incompatible`、`cache-corrupt`、`over-budget`、`storage-unavailable`、`storage-newer-version`、`storage-closed`、`read-failed` |

- **提交顺序：** 先完成参数读取、预算核算与 `validatePackage`（含哈希），再开启写事务。预算从零用量起，按四组清单累计核算。事务内只发出 IndexedDB 请求，不等待其他异步工作，以免事务提前自动提交。
- **恢复顺序：** 包记录与全部 payload 记录在同一个只读事务中读取，得到同一时刻的一致快照。读到包记录后、读取 payload 前，先按清单核算预算；事务结束后再做哈希与 `validatePackage`。包记录中的 `payloadCount`、`payloadBytes` 与清单不符，同样是 `cache-corrupt`。
- **恢复结果的所有权：** 清单、来源状态与结果容器都冻结。每个 payload 的 `bytes` 独占一个完整的 `ArrayBuffer`（偏移 0，长度等于 payload），能被 `payloadTransferList` 接受；两次恢复的结果不共享缓冲。把恢复得到的 `groups` 原样交给 `validatePackage`，结果仍为 `complete`。
- **提交输入的所有权：** 不转移、不修改、不保留调用方的缓冲；调用返回后，调用方修改自己的缓冲不影响已写入的数据。
- **列出不读取 payload；** 条目数不设上限，只随来源与转换器版本的组合增长，清理归 P5。

### 错误码

| code | 适用场景 |
|---|---|
| `invalid-request` | 键或需求字节数的形状不合法；预算限值的形状不合法（诊断保留 P2-01 的 `invalid-record`、`missing-budget-dimension`、`unknown-budget-dimension`、`invalid-budget-value`） |
| `package-incomplete` | 提交的包经 `validatePackage` 得到 `incomplete`，或读取四组输入时出现 P2-01 读取错误 |
| `over-budget` | 提交或恢复时，按清单核算超出限值或超出安全整数范围 |
| `storage-unavailable` | 没有 `indexedDB`，或打开数据库失败（版本过高除外） |
| `storage-newer-version` | 现有数据库的版本高于本构建支持的版本 |
| `storage-closed` | 操作期间连接被浏览器关闭，例如站点数据被清除 |
| `quota-exceeded` | 写事务因配额错误中止 |
| `write-failed` | 写事务因其他原因中止或出错 |
| `read-failed` | 读事务出错 |
| `cancelled` | 提交在写事务开始前被取消，或因取消调用原生 `abort()` 后事务确已中止 |
| `not-found` | 恢复的键没有包记录 |
| `cache-incompatible` | 包记录的格式标识或格式版本未知，或内容 schema、切片定义版本与当前构建不符 |
| `cache-corrupt` | 包记录或 payload 记录形状损坏，键与身份不一致，payload 记录缺失或多余，计数与清单不符，或重新校验的结果不是 `complete` |

- **失败结果形状：** `{ status: 'failed', code, location, reason, diagnostics, budget }`。`location` 是结构位置，如 `groups[1].manifest.assets[3]`、`payloads[<assetId>]` 或 `database`；`reason` 是固定文本；`diagnostics` 是 P2-01 的 `CompletenessDiagnostic` 列表，`budget` 是 P2-01 的 `BudgetViolation` 列表，没有时为空数组。
- 宿主异常只按其 `name` 分类，消息文本不进入结果。结果不含 payload 字节、私人路径或原版定位；分类不依赖 `reason` 文本。

### 持久化与兼容

- **版本：** 数据库版本 1，记录格式版本 1。此前没有任何缓存数据，不需要迁移。今后改变记录格式或数据库结构须递增相应版本，由引入变化的任务规定迁移或“不兼容、重新导入”。本任务的读取对未知格式一律报 `cache-incompatible`，对更高的数据库版本报 `storage-newer-version`，都不删除数据。
- **内容指纹：** 原版导入的键含 P2-03 的 `SourceFingerprint`；指纹算法或覆盖范围的变化只会产生新键，不会误用旧包。转换器版本变化同样产生新键。内容 schema 或切片定义版本变化，使旧包在恢复时报 `cache-incompatible`。
- **原子写入：** 同键旧包的删除与新包的写入在一个读写事务中完成。事务的持久性提示使用浏览器默认值，不把 `complete` 解释为已经落盘：断电等极端情况下可能丢失最近一次提交，但不会产生半个包，恢复会如实报告。
- **旧数据：** 旧转换器版本或旧来源的键保留到 P5 的清理策略，占用的空间计入浏览器用量。开发期间可由开发者手动清除站点数据。
- **损坏与配额：** 见[行为与边界](#行为与边界)。损坏与不兼容都不自动删除；恢复方式是重新导入后同键提交。
- **驱逐：** 浏览器可能因存储压力、用户清除或策略删除整个数据库，表现为列出为空或恢复返回 `not-found`。总计划 §8 要求的“资源重新导入”提示由 P2-11 呈现。
- **隔离：** 测试只在隔离 context 或测试自有的临时 profile 中读写，不删除、不清空用户 profile 的站点数据，也不访问其他数据库或 localStorage。

## 技术决定

用户在请求本 spec 时说明，需要回答的问题直接采用最推荐的答案。以下决定按此记录；整个契约仍须用户明确批准（见[审批](#审批)）。

1. **只缓存完整包，不缓存单组：** P2-01 允许单组独立交付，但阶段要求只有完整包才能原子提交为可用。按组缓存会引入部分可用状态与跨组一致性问题，而 P2 的导入在一次作业内完成，没有断点续传需求。
2. **用单个读写事务完成提交：** IndexedDB 事务本身是原子的。同键替换、payload 与包记录放在同一事务里，就能保证完整标记与数据同时出现或同时不存在，不需要临时记录、两阶段标记或中断后的清理。代价是事务发出请求后不能等待其他异步工作，所以校验与哈希都放在事务之前。
3. **键为来源类别、来源令牌与转换器版本：** 直接实现总计划“光盘指纹 + 转换器版本”。加入来源类别，合成测试包就能使用同一适配器，又永远不会被当成原版导入；使用 IndexedDB 数组键，避免分隔符编码问题。schema 与切片定义版本另作兼容校验，与 P2-01 的约定一致。
4. **恢复时完整重新校验，包括全部 payload 的 SHA-256：** 缓存存在不等于可用。同长度改写、存储损坏或旧构建写入的数据，只能靠内容哈希发现；`validatePackage` 已实现全部判据，直接复用。主线程开销由调用方选择运行位置解决，P2-11 可以在 Worker 中恢复。
5. **提交与恢复都按调用方的预算限值核算：** 缓存数据也是输入，阶段退出条件要求越界或损坏的输入被安全拒绝。复用 P2-01 的 `chargeManifestBudget`，在读取 payload 前按清单拒绝超限的包。限值来自各转换任务批准的预算，本任务不设新数值。
6. **空间检查只作建议，不阻止提交：** `estimate()` 是近似值，既不保证写入成功，也不证明写入必然失败；真实配额错误在事务中处理。导入前是否提示、是否继续由 P2-11 决定。
7. **payload 逐 Asset 存为定长 `ArrayBuffer`：** 与 P2-01 的 `PayloadRecord` 一一对应，恢复得到可直接转移的独占缓冲。不使用 Blob，各浏览器在 IndexedDB 中存储 Blob 的行为差异更大；也不压缩。
8. **使用原生 IndexedDB API，不新增依赖：** 所需操作很少，直接控制事务边界更清楚。不引入 `idb` 等封装库，也不引入 `fake-indexeddb`。
9. **在真实浏览器中验证 IndexedDB 行为：** Node 中没有 IndexedDB，模拟实现也不能证明事务原子性、配额与中断行为。纯逻辑在 Node 中测试；事务、配额、中断与刷新恢复在已安装的 Chrome 中以 E2E 验证：
   - 沿用 browser-replay 的方式，在 development 项目中经开发服务器导入 `/src` 模块，不建生产调试 API；
   - 用 CDP `Storage.overrideQuotaForOrigin` 降低本 origin 的配额，取得真实的配额错误；
   - 刷新恢复与中断用测试自有的临时持久 profile，使数据落在磁盘后端，而不只在内存中；
   - 存储不可用通过注入“缺失的工厂”或“打开时抛出宿主异常的工厂”表示。这正是该失败的形态，但不用于证明事务或配额行为。
10. **只在 Chrome 上验证：** 与 P1 以来的本地浏览器 runner 一致。Firefox/Safari 的实测与 Safari 驱逐提示属于 P5 的浏览器兼容范围。
11. **不需要新 ADR：** 以上决定细化总计划 §3.3、§8 与 §12 的 P2 行以及 ADR-0015 的模块边界，不改变冻结决定，也不引入依赖（ADR-0008）。

## 验收标准

| ID | 可观察的通过条件 | 验证方法与所需证据 |
|---|---|---|
| AC-01 | **键：** 由 `ContentIdentity` 推导的键对两种来源都是确定的；来源类别、令牌、转换器版本任一不同，键就不同；schema、切片定义版本与 manifest 身份不影响键。把 `SourceFingerprint` 当作 fixture ID 或反之，以及其他非法键形状，都返回 `invalid-request`，不访问数据库 | Node 单元测试；浏览器中不同键的包共存并各自恢复，见 AC-03 与 AC-04 |
| AC-02 | **提交前校验：** 下列每种输入都返回 `package-incomplete`（附 P2-01 诊断 code）或 `over-budget`（附违规维度），且数据库记录与调用前逐条相同：缺一组；重复一组；payload 同长度改写；payload 长度不符；原版导入形状的包来源状态未验证或指纹不符；四组身份不一致；超出 `assets`、`dependencyEdges`、`payloadBytes` 任一预算。预算限值形状错误返回 `invalid-request` 并保留 P2-01 code | 浏览器用例逐项提交；提交前后按实现导出的仓库常量，以只读事务枚举全部记录并比较。测试侧只读探针记录拒绝路径没有开启写事务 |
| AC-03 | **提交与刷新恢复：** 分别提交一个合成包与一个带合成指纹的原版导入形状包（仅测试数据）。在同一临时持久 profile 中刷新页面后，列出得到两个 `compatible` 条目，恢复都得到 `restored`：身份、清单、来源状态与提交时相等，每个 payload 与原字节逐字节相同；恢复的 `groups` 交给 `validatePackage` 为 `complete`；合成包的 origin 仍为 `synthetic` | 浏览器用例；临时 profile 由测试创建，结束时关闭并删除。证据记录键、payload 数与字节总数 |
| AC-04 | **同键替换、幂等与键隔离：** 用 payload 可区分的原版导入形状合成包，提交 `[F1, V1]`、`[F1, V2]`、`[F2, V1]` 三个键（F 为合成指纹，V 为转换器版本），三者都能恢复。再向 `[F1, V1]` 提交 Asset 集合不同的包 B：该键恢复只得到 B，原包独有的 payload 记录不复存在；另两个键的包记录、payload 记录与恢复结果不变。再次提交 B，记录与恢复结果不变 | 浏览器用例；按实际仓库常量只读枚举各键的记录 |
| AC-05 | **取消：** 调用时已取消，返回 `cancelled` 且库中无变化。写请求已发出、事务仍可中止时取消，原生事务以 `abort` 结束，返回 `cancelled`，同键旧包仍能恢复，库中没有新包的记录。事务已进入提交阶段或 `complete` 后才取消，返回 `committed`，新包可恢复 | 浏览器用例；测试侧包装原生方法的只读探针记录写请求的发出、`abort()` 调用与事务最终事件，不改变写入行为。证据至少包含一次写请求发出后的原生 `abort` |
| AC-06 | **真实配额错误：** 先在默认配额下提交旧包；再经 CDP 把本 origin 的配额设为高于当前用量、低于新包需求的值，空间检查返回 `insufficient`，数值与 `estimate()` 一致；继续提交新包返回 `quota-exceeded`，旧包仍能恢复，库中没有新包的记录；恢复默认配额后同一提交成功。若当前 Chrome 不支持该 CDP 方法或不产生真实配额错误，本项保持未通过，不能用抛出的通用异常代替 | 浏览器用例；证据记录 CDP 方法可用性、配额、用量、需求与宿主错误名 |
| AC-07 | **中断：** 写请求已发出（探针确认）后、调用方得到结果前关闭页面或 context；用同一临时 profile 重开后，状态恰为“完整旧包、新包没有任何记录”或“完整新包”之一，不出现混合或部分记录。证据中至少有一次写请求已发出、重开后为完整旧包且没有新包记录的观测，证明回滚确实发生 | 浏览器用例；使用足以让写事务跨越可观察时间窗口的合成 payload；证据记录每次运行的中断时机与重开后的状态 |
| AC-08 | **损坏与不兼容：** 在隔离 context 中直接改写记录后，恢复依次返回：包记录缺字段、键与身份不一致、计数与清单不符、payload 记录缺失或多余、payload 同长度改写、payload 长度改变、来源状态改为未验证，都为 `cache-corrupt`；格式标识未知、`formatVersion` 为 2、内容 schema 为 2、切片定义版本为 2，都为 `cache-incompatible`；清单声明的 payload 字节超出恢复限值为 `over-budget`，且在读取 payload 前判定。任何情况都不返回部分包，记录不被删除或修改。列出把元数据层面的损坏与不兼容条目标为 `corrupt` 或 `incompatible`（payload 层面的损坏不在列出范围内） | 浏览器用例；改写是对存储损坏的故障注入，按实现导出的常量定位记录，证据中注明 |
| AC-09 | **删除、驱逐与更高版本：** 适配器的连接空闲时，另一连接 `deleteDatabase` 不触发 `blocked` 且成功；适配器有事务进行中时，删除可以暂时 `blocked`，在该事务结束后成功。两种情况之后都列出为空、恢复返回 `not-found`。经 CDP 清除本 origin 的 IndexedDB 数据后结果相同；若清除时写请求已发出，该提交返回 `committed`（提交先胜出）、`storage-closed` 或 `write-failed`，之后同样列出为空、恢复返回 `not-found`。测试以版本 2 打开同名数据库后，适配器的各操作返回 `storage-newer-version`，该数据库仍为版本 2、内容不变 | 浏览器用例；证据记录 `blocked` 与 `versionchange` 事件、强制关闭时的 `close` 事件（适配器主动关闭不产生该事件）、清除与事务事件的先后，以及数据库版本 |
| AC-10 | **存储不可用：** 工厂缺失，或打开时抛出 `SecurityError`、`InvalidStateError` 的工厂，使提交、列出、恢复都返回 `storage-unavailable`，提交从不返回 `committed`。`StorageManager` 缺失，或 `estimate()` 失败、返回非有限数时，空间检查返回 `unknown` | Node 单元测试覆盖分类；浏览器用例以注入方式各验证一次 |
| AC-11 | **并发：** 同键两个不同的包并发提交后，恢复结果完整等于其中之一。已有有效包时，提交进行中并发恢复得到完整旧包或完整新包；该键此前不存在时，并发恢复得到 `not-found` 或完整新包；都不混合 | 浏览器用例；同一页面中两个各自持有连接的适配器句柄，分别覆盖已有旧包与首次导入两种情况 |
| AC-12 | **所有权：** 提交一个 payload 为大缓冲中带偏移视图的包后，存储记录的长度等于 payload 长度；提交返回后修改调用方缓冲不影响恢复结果；调用方缓冲没有被转移。恢复得到的每个 payload 都被 `payloadTransferList` 接受，两次恢复不共享缓冲，结果容器冻结且能被 `structuredClone` 复制 | 浏览器用例 |
| AC-13 | **存储需求：** `payloadBytes` 是各 payload 字节的精确和；对同一输入，元数据估算确定且非负；`requiredBytes = payloadBytes + metadataBytes` 且为安全整数；非法输入返回 `invalid-request` | Node 单元测试 |
| AC-14 | **诊断与隐私：** 所有失败结果只含规定字段，不含 payload 字节、宿主错误消息、宿主路径或原版定位。缓存操作期间，页面除开发服务器的模块请求外没有其他网络请求；`src/platform/storage/` 不使用 `fetch`、XHR、WebSocket、`sendBeacon` 等网络 API | Node 测试断言结果字段；浏览器用例记录请求；源码检查 |
| AC-15 | **边界与工程：** `src/platform/storage/` 不导入 `original-data`、React 或 Three.js，不使用 `window`、`document` 等 DOM 专有对象，只依赖可注入的 `indexedDB` 与 `navigator.storage` 能力；纯模块不导入它。不新增依赖，锁文件不变。新 E2E 用例只在 development 项目运行，配置回归同步 | `pnpm check`（类型、lint、Vitest 与构建）、依赖清单与锁文件 diff、`tools/e2e-configuration.test.ts`、聚焦 E2E 运行与源码检查 |
| AC-16 | **文档：** 源码结构指南与工程约定记录模块职责、数据库名与版本、记录格式版本、仓库常量所在位置、浏览器验证路线（CDP 配额、临时 profile、注入）与命令；不复制原版内容 | 文档链接与元数据检查、最终 diff 审阅 |

## 验证策略

- **单元/契约测试：** 在 `src/platform/storage/` 旁新增 Node 环境的 `*.test.ts`，覆盖键推导、包记录与 payload 记录的读取（正常、缺字段、未知格式或版本、键不一致）、存储需求估算、宿主错误名到 code 的分类，以及失败结果的字段。不在 Node 中模拟 IndexedDB 来证明事务行为。
- **Replay/一致性：** 不适用。本任务不涉及 Core 世界、tick 或 replay。
- **浏览器验证：** 在计划新增的 development 项目 E2E 用例中，页面内导入 `/src/platform/storage/` 的适配器与 `/src/content/` 的合成内容 helper，按 AC-02 至 AC-12 与 AC-14 验证真实 IndexedDB：
  - 普通用例使用 Playwright 的隔离 context；AC-03 与 AC-07 使用测试自有的临时持久 profile，结束时关闭并删除；AC-06 与 AC-09 使用 CDP 的 Storage 域。
  - 测试侧可以在 `e2e/support/` 增加只读写入探针与 CDP 辅助，它们不进入生产导入链。
  - 聚焦运行：`pnpm test:e2e <新用例文件> --project=development`。
- **实机/原版对照：** 不适用。本任务不处理原版内容；真实转换结果的缓存与刷新恢复由 P2-11/P2-12 验证，Firefox/Safari 归 P5。
- **工程检查：** 迭代时运行 `pnpm exec vitest run src/platform/storage` 与聚焦 E2E；完成前运行 `pnpm check`、`pnpm check:original`、聚焦 E2E 与 `pnpm exec vitest run tools/e2e-configuration.test.ts`。不要求 CI 或部署。
- **文档检查：** front matter、相对链接与 S/AC 唯一性；用 `git status` 与 diff 确认没有 `local/`、原版内容或无关的阶段状态变化。

## 风险与恢复

风险等级：**中。** 这是第一个持久化浏览器数据的模块，记录格式一经写入就成为兼容负担；但目前没有已发布的缓存或存档，失败最多导致重新导入，不会丢失玩家数据。

- **事务提前自动提交，留下半个包：** 事务内等待非 IndexedDB 的异步工作会让事务提前提交。校验与哈希都放在事务之前，事务内只发请求；AC-05 与 AC-07 用真实浏览器的取消与中断验证。
- **配额与中断难以真实复现：** 配额依赖 CDP `Storage.overrideQuotaForOrigin`；若不可用，AC-06 保持未通过并记录原因，由用户决定替代的真实验证方式，不以通用异常代替。中断依赖测试侧探针确认时机；结果不确定时重复运行，如实记录每次结果。
- **只在 Chrome 上验证：** Firefox/Safari 的事务、配额与驱逐行为可能不同，由 P5 的浏览器矩阵覆盖。本任务的契约不依赖 Chromium 专有行为，持久性提示与 `indexedDB.databases()` 都不是功能前提。
- **损坏记录造成大内存占用：** IndexedDB 读取单条记录时整体载入；声明大小只能在读取前按清单核算，实际字节在读取后核对。一条被篡改成超大值的 payload 仍会先载入再被拒绝。这只在本地存储损坏时发生，记为已知限制。
- **旧键累积占用空间：** 本任务不清理旧转换器版本或旧来源的键，开发期间可能累积。P5 实现清理策略；在此之前，空间检查与配额错误如实反馈。
- **记录格式需要变化：** 递增格式或数据库版本，由引入变化的任务决定迁移或重新导入；本任务的读取对未知版本只报不兼容、不删除。
- **恢复耗时：** 大包的完整哈希可能明显耗时。P2-11 决定是否在 Worker 中恢复，P2-12 记录真实包的恢复耗时。

## 未决事项

无。用户要求需要回答的问题直接采用最推荐的答案，相关选择已记录在[技术决定](#技术决定)。

## 审批

用户于 2026-10-05 明确批准本 spec。批准范围包括：

- S-01 至 S-12、AC-01 至 AC-16；
- 缓存键、记录布局、操作与结果、错误码、持久化与兼容；
- 行为与边界中的取消、中断、并发与连接生命周期语义，以及技术决定。

生成与审阅时按“采用推荐答案”授权作出的选择，以及 review-spec 采纳的五项修正，随本次批准一并生效。
