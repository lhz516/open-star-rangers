---
type: guide
status: active
phase: all
updated: 2026-10-08
related: [ADR-0015]
---

# 应用装配模块说明

本文件是[源码结构指南](../source-structure.md)的模块分册，记录 `src/app/` 中已交付代码的当前 API 与契约要点。目录树、职责边界与 helper 归属以指南为准，行为契约以各任务 spec 为准；修改本模块代码的任务同步更新本文件。

P1-06 交付 [app/composition/](../../../src/app/composition/) 中 DOM-free 的合成演示 owner 与创建、销毁它的 React effect hook。P1-08 已实现（最终对齐见 [P1-08 goal](../../plan/p1/08/goal.md#子任务跟踪)）：[app/flow/](../../../src/app/flow/) 中 DOM-free 的页面流转（主菜单、导入占位、合成演示，内存状态，不用路由）；`app/composition/` 中每个应用实例一个的演示生命周期（一次性 start、先释放后创建、清理失败锁存）；`app/session/` 的 `RollbackError` 结构化回滚失败信号。P2-11 以导入与查看器页面取代了导入占位，见[工程约定](../README.md#页面流转与演示生命周期)。[App](../../../src/app/App.tsx) 是应用外壳，加载时显示 P1 React 菜单原型。

## 应用资源持有者

[P2-11](../../plan/p2/11/spec.md) 的应用级资源持有者在 [app/resources/](../../../src/app/resources/) 中，DOM-free，由 Node 测试覆盖。回归测试确认它不使用网络 API、`window`、`document` 与 `localStorage`，不导入包、`render` 或 `ui`，且每个模块都在 Node 程序中检查。当前已实现：

- **持有：** [resource-holder.ts](../../../src/app/resources/resource-holder.ts) 的 `createResourceHolder({ cache, profile, now, reportError })` 由应用外壳实例创建，至多持有一份资源包 `HeldPackage`：代际、来源（`import` 或 `cache`）、按切片定义顺序排列的完整组 `{ group, manifest, payloads, sources }`，以及 `validatePackage(CLASSIC_P2_SLICE, groups)` 的全包判定。容器冻结；payload 视图直接取自作业移交，不复制、不转移、不改写，所有权归持有者。
- **接收作业：** `acceptImport(job)` 只在作业快照为 `finished` 时调用 `takeGroups()`；失败、取消、组已被取走或释放之后都返回 false，不改变状态。部分结果同样替换原资源包。各组状态取自作业快照的组摘要：完整、不完整（附诊断）或缺失。
- **替换：** 每次替换代际加 1。替换前先以旧资源包同步通知 `beforeReplace` 监听，使引用它的消费者先释放；之后中止旧包的提交、结束进行中的恢复，再持有新包并通知订阅者。监听期间释放了持有者时，不再持有新包。
- **快照：** `getSnapshot()` 返回冻结的 `{ package, catalog, restore }`，两次变化之间为同一对象，不含 payload。
  - `package` 含代际、来源、四个组的状态、全包判定、缓存状态与任务载入状态。缓存状态为 `not-saved`（附失败或 null，以及失败提交的耗时）、`saving` 或 `saved`（附来源 `commit` 或 `restore` 与耗时）。
  - `catalog` 是最近一次列出的结果：`checking`、`unavailable`（附失败）或 `listed`（附可恢复的条目或 null）；spec 的缓存状态中 `checking` 与 `unavailable` 即此处的列出状态。
  - `restore` 为 `idle`、`restoring` 或 `failed`（附失败与耗时）。
  - `current()` 为应用内的消费者返回带 payload 的资源包。
- **缓存端口：** `ResourceCachePort` 是 P2-10 `ResourceCache` 的结构子集（`checkCapacity`、`commit`、`list`、`restore`），只用 `resource-cache-contract.ts` 的 DOM-free 类型，所以持有者不把浏览器适配带进 Node 程序；真实适配满足它。`profile` 是 01 的预期包配置，`now` 是只用于显示耗时的页面时钟。
- **列出：** 创建时列出一次，`relist()` 供每次回到菜单时调用；列出期间为 `checking`，只采用最近一次发起的结果。`restorableEntry(entries, profile)` 只选元数据兼容、来源为 `original-import`、指纹与转换器版本都等于预期配置的条目；其他条目不提供恢复，也不清理。结果失败（含意外拒绝，报 `read-failed@list`）时为 `unavailable`。
  - 列出发起后资源包被替换时，丢弃该结果并重新列出。
  - 已保存的资源包只在之后的列出中仍有同键且元数据兼容的条目时保持 `saved`。没有同键条目、同键条目为损坏或不兼容，或列出失败时，缓存状态改为 `not-saved`，原因分别为 `not-found@key`、`cache-corrupt@key`、`cache-incompatible@key` 或列出的失败本身；资源仍可使用。只在列出发起后缓存状态没有变化时这样判定，所以与提交交错的旧列出不会误判。
- **提交：** 来自导入且全包 `complete` 的资源包立即以 `profile.limits` 与 `AbortSignal` 提交，状态为 `saving`，成功为 `saved`，失败为 `not-saved` 并附 P2-10 失败；部分结果与来自缓存的资源包不自动提交。`save()` 在完整资源包为 `not-saved` 时再次提交，不论来源（spec 行为表：列表中已没有该键时提供重新保存），保存中返回 false。意外拒绝报 `write-failed@commit`。替换与释放中止进行中的提交，其结果被丢弃。
- **恢复：** `restore()` 只在未持有资源包、列出有可恢复条目且没有恢复进行时，以 `profile.limits` 恢复该键。结果的身份与预期配置不一致时为 `cache-incompatible@identity`，重新校验不完整时为 `cache-corrupt@groups`，都不持有；成功时以来源 `cache`、缓存状态 `saved` 替换资源包。意外拒绝报 `read-failed@restore`。恢复期间资源包被替换时，恢复立即结束，迟到的结果被静默丢弃。
- **空间检查：** `checkSpace()` 以包预算的 `payloadBytes` 调用 `checkCapacity`，结果原样返回，只用于导入前的提示。
- **任务载入诊断：** [mission-diagnostics.ts](../../../src/app/resources/mission-diagnostics.ts) 的 `diagnoseMission(groups)` 在持有 `logic` 组时，取出并解码唯一的任务 Asset，再按任务引用的 Asset ID 取出机型表与僚机名单（切片只约束任务角色，组中可能有同角色的其他 Asset），都以 `decodeLogicPayload` 解码，然后调用 Core 的 `loadMission`。
  - **结果：** 没有 `logic` 组时为 `not-attempted`。成功为 `loaded`，附结构摘要与引用校验；`CoreInputError` 与 `ContentContractError` 分别为 `failed` 的 `core-input` 与 `content`，附路径与原因。缺少某个角色的 Asset 时，由 `loadMission` 在对应的输入位置报 `CoreInputError`；解码错误保留 code 与原因，路径为 `logic[<Asset ID>].<路径>`；其他异常视为缺陷，继续抛出。
  - **摘要：** 只含任务 Asset ID、`campaign`、地图轴向、坐标与编队偏移的单位标注、玩家声明序号，以及声明、编组、生成区域、僚机选项与名称池的条目数和各阵营的声明数；不含名称、消息或其他原版文字。
  - **引用校验：** 解析到模型的声明数与僚机选项数，持有的资源包是否有完整的 `models` 组，以及每个模型 Asset ID 是否在其中。
  - **持有者：** 每次替换资源包时计算一次，结果在缓存状态变化时保持不变；诊断函数抛出的缺陷交给 `reportError`，任务状态保持 `not-attempted`。
- **状态阶梯：** [resource-status.ts](../../../src/app/resources/resource-status.ts) 的 `resourceStatuses(holder, job?)` 按 spec 的成立条件派生状态，依次为：
  - 来源已识别：作业 `running` 或 `finished` 且带身份；
  - 部分转换或完整资源可查看：按全包判定；
  - 完整包的已保存（缓存状态为 `saved`）或仅在内存中，保存中另有 `saving`；
  - 任务可载入 Core 或任务不可载入，只按任务载入诊断的 `loaded` 与 `failed`。

  只凭作业 `finished` 得不到“完整资源可查看”。
- **通知与释放：** 监听与订阅者同步收到通知，抛出的错误交给 `reportError`；`reportError` 本身抛错也被吞下，不影响替换与其他监听。`dispose()` 可重复调用：中止提交，丢弃资源包与全部监听；之后的列出、提交与恢复结果都被忽略，也不通知任何人。持有者不拥有缓存实例，不关闭它。

## 查看器音频

[app/viewer/viewer-audio.ts](../../../src/app/viewer/viewer-audio.ts) 是 P2-11 查看器的试听（[spec S-08、S-12](../../plan/p2/11/spec.md)），DOM-free，由 Node 测试覆盖；与 `app/resources/` 共用 DOM-free 的边界回归。

- **创建：** `createViewerAudio({ capability, lifecycle, reportError }, audioGroup)` 为一份资源包创建 P2-08 控制器，并载入完整 `audio` 组的全部声音。快照列出组内每个 sound Asset 的 ID 与角色（清单顺序）和载入结果；没有 `audio` 组时列表为空、载入结果为 null。
- **试听：** `audition(id)` 在可信点击中调用 `unlock()`。
  - 控制器已在 `running` 时立即播放；否则记下一次待播放意图（后一次点击取代前一次），控制器进入 `running` 时恰好播放一次。
  - 控制器进入 `unavailable`、`failed` 或 `disposed`，或调用 `stop`、`stopAll`、`cancelPending`（离开或替换资源包时由所有者调用）、页面隐藏（`visibilitychange` 为隐藏、`pagehide`）与释放，都丢弃该意图。控制器本身不排队。
  - 未知的声音、不可用或失败的控制器如实拒绝。
- **停止：** `stop(id)` 停止本查看器为该声音启动的发声，`stopAll()` 停止全部。控制器只报告发声数，所以查看器经包装的能力取得每个新发声的端口，并监听它的结束；结束、停止或控制器释放全部发声（如隐藏或失败）时，记录随即删除。播放期间控制器自己的通知不发布，所以订阅者看到新发声时它已有记录，可以立即停止。
- **关闭观察：** 查看器包装传入的音频能力，记录上下文 `close()` 的结果。`dispose()` 释放控制器与页面生命周期监听，并返回同一个 promise，结果为：
  - `no-context`：从未创建上下文；
  - `closed`：`close()` 完成，或宿主已先关闭了上下文；
  - `close-failed`：`close()` 被拒绝或同步抛错，附原因。

  “已关闭”只以此为准，不以控制器的 `disposed` 快照代替；锁存与“关闭确认前不重建”由查看器所有者负责。
- **测试支持：** P2-08 控制器测试的宿主替身移到 [audio-controller.test-support.ts](../../../src/platform/audio/audio-controller.test-support.ts)，`FakeContext.closing` 可设为拒绝（默认）、完成、悬置或同步抛错。

## 查看器所有者

[app/viewer/viewer-owner.ts](../../../src/app/viewer/viewer-owner.ts) 是 P2-11 查看器的所有者与每个应用实例一个的查看器槽位（[spec S-07、S-12](../../plan/p2/11/spec.md)），由 Node 测试以真实的查看渲染、录制用表面替身与音频替身覆盖。`app/viewer/` 可以导入 `render/`（它拥有渲染器），仍不导入 `ui/`。

- **条目：** [viewer-items.ts](../../../src/app/viewer/viewer-items.ts) 的 `viewerCatalog(groups)` 按组顺序与清单顺序列出持有资源包各完整组中的模型、效果（角色为 `projectile`、`missile`、`debris` 的 data Asset）、图像、布局、调色板与字库，并按 Asset ID 索引这些条目的 payload。模型贴图及其调色板本身是二维条目，所以也在索引中。
  - **解析：** `resolveEntry(entry, payloads)` 一次读取并展开一个条目，给出它的全部变体与 `item(variant)`；所有者缓存所选条目的结果，所以切换同一条目的变体不再读取。只经 `content/` 的读取器与消费函数得到渲染器的条目：二维项用 `expandImage`、`composeLayout`；模型用 `readModelPayload`、`modelPartItems`、`expandModelTextures`；效果用 `readEffectPayload` 与 09 的 `effectViews`，并读取所引用的图像与调色板，用 `expandImage` 展开贴图。所需的调色板与图像在资源包中按 Asset ID 查找，缺失时为 `binding-mismatch`；效果贴图读取失败也使整个条目失败，不回退为无贴图显示。
  - **变体：** 模型的变体是部件列表 0–2，附部件数与 `MODEL_PART_LISTS` 的内容与置信度：列表 0 为完整模型（高概率：本地渲染可辨认，见 [mesh](../../original/formats/mesh.md)），列表 1 为碎片部件（已确认），列表 2 未确认（U-027）。效果的变体是它的各个视图，附每个形状的外观（显示字节、原值、`textured` 与 `seamUnconfirmed` 标记，无贴图且原值为 null 时显示诊断灰色）。二维项只有变体 0；不存在的变体，`item` 返回 null。
  - 内容错误成为该条目的失败（code、路径与原因），其他异常视为缺陷。
- **所有者：** 槽位以 `{ holder, render, audio, reportError }` 创建所有者。
  - `render` 是表面或不可用的原因，交给 `createViewerRenderer`；
  - `select(id, variant = 0)` 显示所列条目的变体，或以 null 不显示；读取或展开失败时不显示，只记下该条目的失败；未知的条目或变体什么也不改变；
  - `changeView(action)` 以 `applyViewAction` 改变视图并交给渲染器的 `setView`；视图跨条目与资源包保留，无效的动作抛 RangeError；
  - 快照含所示资源包的代际、条目、所选条目与变体、所选条目的全部变体、视图、失败与 22 的查看器音频。
- **替换：** 资源持有者替换资源包前（`beforeReplace`），所有者先以渲染器的 `releaseItem()` 释放所示条目的全部 GPU 资源（渲染器已失败时也释放，释放失败时锁存），丢弃待播放意图并释放音频。新资源包的音频只在此前每一次音频关闭都确认后才创建：所有者与槽位保持一个只会累加的关闭屏障，连续替换或重开查看器都不会越过仍在进行的关闭；任何一次关闭失败都锁存，且不再创建。
- **创建失败：** 表面连接失败但已干净释放时，所有者改用不可用的渲染器，条目与试听照常；释放也失败（`RollbackError`）或持有者订阅无法撤销时，槽位锁存并抛出。
- **槽位：** `createViewerLifecycle({ onCleanupFailure, reportError })`。
  - `open(create)` 先关闭仍打开的所有者，锁存时返回 null 且不调用 `create`，所以锁存后不会再创建表面；否则以 `create()` 的选项创建所有者。`create` 或所有者抛出的 `RollbackError` 锁存后抛出。新所有者的音频等到上一次音频上下文确认关闭后才创建。
  - `close()` 撤销持有者订阅并释放渲染器与音频，每步都尝试：同步的失败立即锁存，音频 `close-failed` 在观察到时锁存。
  - 锁存只记第一次失败，经 `onCleanupFailure` 交出（出口抛错改经 `reportError`）；锁存后不再创建所有者，导入与演示不受影响。React 接线与页面见[工程约定](../README.md#页面流转与演示生命周期)的“查看器页面”。
