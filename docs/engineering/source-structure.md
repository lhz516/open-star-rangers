---
type: guide
status: active
phase: all
updated: 2026-10-06
related: [ADR-0002, ADR-0006, ADR-0015]
---

# 源码结构与模块边界

本指南维护当前目录、代码归属、后续扩展方向及路径迁移对应关系。决定见 [ADR-0015](../decisions/ADR-0015-source-module-structure.md)；顶层架构和数据流见[总计划 §4–5](../plan/master-plan.md#4-总体架构)，工具链与检查规则见[工程约定](./README.md)，规划与验收分工见[任务工作流](./agent-workflow.md)。

## 当前目录

以下只列生产文件；`*.test.ts` 与所属源码同目录，Session 的 `synthetic-session.test-support.ts` 同样随模块维护。

```text
src/
  main.tsx
  app/
    App.tsx
    app.css
    composition/
      synthetic-demo-lifecycle.ts
      synthetic-demo-owner.ts
      use-synthetic-demo-owner.ts
    flow/
      app-flow.ts
    import/
      import-worker-port.ts
      import-job-owner.ts
    runtime/
      fixed-step-clock.ts
      runtime-errors.ts
      synthetic-event-bus.ts
      synthetic-runtime.ts
    session/
      rollback-error.ts
      session-host.ts
      session-errors.ts
      synthetic-session.ts
  core/
    errors.ts
    determinism/
      rng.ts
      fnv1a64.ts
    mission/
      load-mission.ts
    synthetic/
      synthetic-scene.ts
      synthetic-snapshot.ts
      synthetic-replay.ts
  content/
    asset-id.ts
    asset-contract.ts
    content-identity.ts
    asset-units.ts
    contract-validation.ts
    slice-definition.ts
    source-state.ts
    sha256.ts
    payload.ts
    manifest.ts
    manifest-identity.ts
    completeness.ts
    budget.ts
    ownership.ts
    sound-payload.ts
    graphics/
      graphics-format.ts
      palette-payload.ts
      image-payload.ts
      font-payload.ts
      layout-payload.ts
      graphics-binding.ts
      expand-image.ts
      compose-layout.ts
      glyph-lookup.ts
    logic/
      logic-content.ts
      logic-readers.ts
      logic-payload.ts
    models/
      model-payload.ts
      model-parts.ts
  original-data/
    imfat.ts
    payloads.ts
    source-mapping.ts
    source-error.ts
    synthetic.ts
    io/
      byte-source.ts
    disc/
      disc-error.ts
      source-reader.ts
      clone-cd.ts
      raw-sector.ts
      iso9660-record.ts
      iso9660-volume.ts
      disc-path.ts
      iso9660-directory.ts
      file-range.ts
      disc-image.ts
    archive/
      imfat-rules.ts
      archive-reader.ts
    formats/
      payload-block.ts
      object-record.ts
      scct.ts
      scen.ts
      m2id.ts
      snd.ts
      mesh.ts
      modl.ts
    source/
      source-catalog.ts
      identify-source.ts
      open-verified-source.ts
      verify-source-mappings.ts
    conversion/
      conversion-budget.ts
      audio-conversion.ts
      converter-version.ts
      source-graphics.ts
      graphics-declarations.ts
      convert-graphics.ts
      step-entry-reader.ts
      graphics-step.ts
      production-graphics.ts
      production-model-textures.ts
      craft-binding.ts
      logic-sources.ts
      convert-logic.ts
      production-sounds.ts
      model-declarations.ts
      convert-models.ts
      model-step.ts
      production-models.ts
  platform/
    audio/
      audio-controller.ts
      browser-audio-controller.ts
    browser/
      browser-session-host.ts
    files/
      blob-byte-source.ts
    input/
      browser-keyboard-source.ts
      keyboard-input.ts
      keyboard-source.ts
    storage/
      browser-resource-cache.ts
      resource-cache-contract.ts
      resource-cache-records.ts
    workers/
      worker-port.ts
      browser-import-worker.ts
  render/
    scene/
      cleanup.ts
      render-surface.ts
    synthetic/
      synthetic-appearance.ts
      synthetic-camera.ts
      synthetic-render-frame.ts
      synthetic-renderer.ts
    viewport/
      viewport-layout.ts
    webgl/
      browser-webgl-surface.ts
      webgl-surface.ts
  ui/
    dev/
      SyntheticDevPanel.tsx
    game/
      describe-error.ts
      synthetic-command-feedback.ts
      synthetic-game-controls.ts
      synthetic-game-store.ts
      synthetic-keyboard-input.ts
      synthetic-session-bridge.ts
      use-synthetic-game.ts
    pages/
      ImportPlaceholderPage.tsx
      MainMenuPage.tsx
      SyntheticDemoPage.tsx
      use-focus-on-mount.ts
    render/
      SyntheticRenderView.tsx
  workers/
    import-protocol.ts
    import-host.ts
    import-job.ts
    import-worker.ts
```

[workers/](../../src/workers/) 由 [P2-04](../plan/p2/04/spec.md) 逐步交付，见[导入 Worker](#导入-worker)。[content/](../../src/content/) 目前实现候选无关的基础契约、唯一生产切片定义与资源组/全包完整性验证（见下节），以及 `graphics/` 中的图形 payload（见[图形 payload](#图形-payload)）与 `models/` 中的模型 payload（见[模型 payload](#模型-payload)）；原版来源映射属于 `original-data`（见[原版来源映射](#原版来源映射)）。`render/` 由 P1-07 逐步交付（契约见 [P1-07 spec](../plan/p1/07/spec.md)）：目前有 DOM-free 的 4:3 视口布局、合成帧校验与插值、固定合成相机、合成外观、绘制端口与合成渲染器，以及 WebGL 表面（DOM-free 生命周期加 `browser-*` 浏览器工厂）；`ui/render/` 的合成画面组件与开发面板的渲染诊断已接入页面。P1-06 已交付：`ui/game/` 的投影 store（Zustand vanilla，React 只取得只读句柄）、会话桥接（状态即时写入、10 Hz 投影采样）、命令反馈（Core 接受/拒绝、取消、故障未确认）、会话控制与 React selector hook；`ui/dev/` 的合成开发面板；[app/composition/](../../src/app/composition/) 中 DOM-free 的合成演示 owner 与创建、销毁它的 React effect hook。P1-08 已实现（最终对齐见 [P1-08 goal](../plan/p1/08/goal.md#子任务跟踪)）：[app/flow/](../../src/app/flow/) 中 DOM-free 的页面流转（主菜单、导入占位、合成演示，内存状态，不用路由）；`app/composition/` 中每个应用实例一个的演示生命周期（一次性 start、先释放后创建、清理失败锁存）；`app/session/` 的 `RollbackError` 结构化回滚失败信号；`ui/pages/` 的三个画面组件。[App](../../src/app/App.tsx) 是应用外壳，加载时显示 P1 React 菜单原型；菜单、合成画面与开发面板都是工程原型，不是原版界面或飞行 HUD。

[platform/storage/](../../src/platform/storage/) 由 [P2-10](../plan/p2/10/goal.md) 交付资源缓存：

- **DOM-free：** [resource-cache-contract.ts](../../src/platform/storage/resource-cache-contract.ts) 定义缓存键、13 个封闭错误码、失败结果形状、宿主错误按 `name` 分类，以及由存储估算得出的建议性空间判定 `evaluateCapacity`（`usage`/`quota` 缺失、为负或非有限时为 `unknown`）；[resource-cache-records.ts](../../src/platform/storage/resource-cache-records.ts) 定义数据库名 `osr-resource-cache`、数据库版本 1、记录格式版本 1 与两个对象仓库名（`RESOURCE_CACHE_DATABASE`），包记录与 payload 记录的构建和读取（先查结构，再按 P2-01 读取；未知格式、内容 schema 或切片定义版本为 `cache-incompatible`，其余为 `cache-corrupt`），按定义顺序核算清单预算，恢复时把 payload 记录与清单配对并重新验证，以及存储需求估算（payload 字节精确求和，元数据按包记录与各 payload 记录键的 JSON 文本每字符 2 字节、每条记录另加 64 字节估算）。两者都在 Node 中测试。
- **IndexedDB 适配：** [browser-resource-cache.ts](../../src/platform/storage/browser-resource-cache.ts) 的 `createResourceCache({ indexedDB?, storage? })` 只依赖注入或全局的 IndexedDB 与 `navigator.storage` 能力，不用 `window`/`document`，因此也能在 Dedicated Worker 中运行；只由应用程序检查，不进入 Node 程序。提交先取得 payload 独占快照，再读预算限值、按定义顺序核算、`validatePackage`，最后在一个读写事务中删除该键的旧记录（payload 用 `[来源类别, 令牌, 转换器版本]` 到其后追加 `[]` 的键范围）并写入新记录，只有 `complete` 才返回 `committed`；列出只读包记录；恢复在一个只读事务中读包记录、在其回调里核算预算后才读 payload 记录，事务结束后配对并重新验证。连接收到 `versionchange` 即关闭并丢弃，已开始的事务照常结束，之后的操作重新打开；浏览器强制关闭（`close` 事件）后同样丢弃。在已关闭连接上开始事务报 `storage-closed`，这次操作随即丢弃它所用的那个缓存连接（只在缓存的仍是该连接时，不会清掉更新的连接），下一次操作重新打开并报告实际状态；进行中的事务被强制关闭时，中止先于 `close` 事件，所以报 `write-failed`/`read-failed`，之后由 `close` 处理器丢弃连接。更高版本的数据库报 `storage-newer-version`，不升级也不删除。`checkCapacity` 只作建议，不阻止提交；没有 `StorageManager` 或估算失败时为 `unknown`。提交可带 `AbortSignal`：调用时已取消或写事务开始前取消返回 `cancelled`；写事务仍可中止时调用原生 `abort()`，事务确已中止才返回 `cancelled`；已进入提交阶段（`abort()` 抛出 `InvalidStateError`）或已完成时以事务最终事件为准。预期失败都以结果返回。

[platform/audio/](../../src/platform/audio/) 由 [P2-08](../plan/p2/08/goal.md) 交付 Web Audio 播放端口，供 P2-11 试听与后续 Runtime 事件消费者调用：

- **DOM-free 控制器：** [audio-controller.ts](../../src/platform/audio/audio-controller.ts) 的 `createAudioController({ audio, lifecycle, reportError })`。
  - **注入：**
    - `audio` 能力：`createContext()` 返回上下文端口，含 `state`、`onStateChange`、`resume`/`suspend`/`close`，以及接到输出的 `createVoice(buffer, loop)`；`createBuffer(channels, sampleRate)` 不需要上下文。
    - `lifecycle` 宿主：`visible()`，以及可撤销的 `visibilitychange`、`pagehide`、`pageshow` 监听。
    - 必填的 `reportError`。
  - **状态：** `idle`、`locked`、`running`、`suspended`、`unavailable`、`failed`、`disposed`。
    - **上下文：** 每个控制器至多一个，延迟到 `unlock()` 创建；构造失败为 `unavailable`。
    - **状态来源：** 由上下文的状态变化驱动，从不等待 `resume()` 的 Promise。首次运行前未运行时为 `locked`；浏览器自行挂起或中断时停止全部发声，变为 `suspended`；上下文被关闭，或宿主操作同步抛错（创建缓冲、注册状态监听、开始发声、恢复、挂起）时为 `failed`。离开 `running` 时先改变状态再停止发声，所以订阅者在这期间也不能开始新的发声。
  - **可见性门：**
    - **隐藏：** 停止全部发声，只把 `running` 挂起为 `suspended`，并记下“因隐藏而挂起”。
    - **恢复：** 只有这种挂起才在页面恢复可见（`visibilitychange` 为 visible，或可见时的 `pageshow`）时自动 `resume()`。
    - **隐藏期间：** `unlock()` 不创建也不恢复上下文；迟到的 `running` 立即再次挂起。
    - **不补播：** 恢复后不补播任何发声。
  - **命令：**
    - **`load(sounds)`：** 用 `readSoundPayload` 与 `soundChannelData` 把 `{ id, schemaVersion: 1, bytes }` 转为控制器自有的浮点缓冲，整批成功才登记；`idle` 时也可调用。
    - **`play(id)`：** 只在 `running` 时开始新的发声，按 payload 的循环方式整段循环；同时发声上限为 `AUDIO_VOICE_LIMIT`（8），只是资源保护。
    - **`stop`、`stopAll`：** 立即停止并断开节点，可重复调用。
    - **`dispose()`：** 同步停止全部发声、移除全部监听并释放缓冲；从不为释放而创建上下文；只在上下文存在且未关闭时 `close()` 一次。
  - **结果与快照：**
    - **结果：** 判别联合的纯数据，错误码封闭：`audio-unavailable`、`audio-locked`、`audio-suspended`、`audio-failed`、`unknown-sound`、`duplicate-sound`、`invalid-sound-payload`、`voice-limit`、`disposed`。宿主错误文本不进入结果。
    - **快照：** `{ status, loaded, voices }`，冻结，两次变化之间保持同一对象；`subscribe` 可配合 `useSyncExternalStore`。
    - **错误转交：** 订阅者错误与发声清理错误交给 `reportError`。
    - **所有权：** 不保留、不修改、也不转移调用方的 payload。
  - **测试：** 用假能力与假生命周期宿主在 Node 中测试。
- **浏览器工厂：** [browser-audio-controller.ts](../../src/platform/audio/browser-audio-controller.ts) 的 `createBrowserAudioController({ reportError })` 提供真实能力：
  - **上下文：** `new AudioContext()`；构造器缺失或抛错时，控制器为 `unavailable`。
  - **发声：** 每次发声一个接到 `destination` 的 `AudioBufferSourceNode`。
  - **缓冲：** `new AudioBuffer(...)` 加 `getChannelData().set()`，不需要上下文。
  - **生命周期：** `document.visibilityState` 与 `document` 的 `visibilitychange`、`window` 的 `pagehide`/`pageshow`。
  - **范围：** 无导入副作用，没有测试注入口；只由应用程序检查，不进入 Node 程序。Chrome 中的验证见[工程约定](./README.md#本地浏览器-runner)。
- **边界：** `platform/audio/` 不导入 `original-data`（字节端口也不行）、`render`、`ui`、`app`、`workers`，不使用网络 API 或 `localStorage`，见[工程约定](./README.md#lint-规则eslintconfigjs)。

### 内容基础契约与切片定义

[P2-01/08](../plan/p2/01/subtasks/08-base-content-contract.md) 的当前 API：

- [asset-id.ts](../../src/content/asset-id.ts)：`readAssetId` 返回品牌化语义 ID，8 段限制包含 kind 首段；`ASSET_KINDS` 封闭为 8 种，`ASSET_ID_LIMITS` 固定每段 32 字符、总长 128 字符。语法验证不能证明命名语义或来源映射正确。
- [asset-contract.ts](../../src/content/asset-contract.ts)：`readAssetReference`、`readAssetDescriptor` 验证 kind 一致性、4 个封闭资源组、语义 role token、严格 ASCII ID 顺序且无重复的类型化依赖，以及 payload 身份。role 的必需集合/基数留给 02，引用存在/自引用/环与分组/全包完整性留给 04；没有 `complete` 布尔值。 `readRole` 单独读取语义 role token，描述符与图形转换声明共用。
- [content-identity.ts](../../src/content/content-identity.ts)：`readContentIdentity` 显式分开 schema、切片 ID、切片定义版本、converter、manifest 与 origin；schema 当前只支持 1，数值版本为正安全整数。converter 按 spec 保留受限 ASCII 不透明字符串，不用应用版本代替。converter/manifest token 允许小写 ASCII 字母、数字及单个内部 `-`、`.`、`:` 分隔符。
- 同文件的 `readContentOrigin` 严格区分 `{type: synthetic, fixtureId}` 与 `{type: original-import, sourceFingerprint}`；fixture token 不允许 `:`，source 使用 `source:<不透明 token>` 命名空间，不规定指纹算法。通过只表示形状合法，**不是来源已验证的证据**；P2-03 负责生成经过验证的来源指纹，manifest 身份由 `manifest-identity.ts` 推导（见下）。`readContentIdentityBasis` 用同样的规则读取不含 `manifestIdentity` 的五项身份（`ContentIdentityBasis`），供推导使用。`readFixtureId`、`readSourceFingerprint` 与 `readConverterVersion` 用同样的规则单独读取这些令牌，供 [P2-10 缓存键](../plan/p2/10/spec.md#缓存键与身份)使用；`contentIdentityKey` 把六项身份合成一个可比较的键，全包验证与缓存读取共用。
- 同文件的 `readPayloadIdentity` 要求正安全整数 schema 版本、非负安全整数字节长度及 `sha256:` 加 64 个小写十六进制字符；只检查声明的格式，不生成或核验实际 payload 哈希。
- [asset-units.ts](../../src/content/asset-units.ts)：`ASSET_UNITS` 与 `INTERNAL_ASSET_ELEMENTS` 固定规范计量粒度。每模型一个 Asset，几何归模型内部；可复用调色板/逻辑数据才有独立身份。源条目数量不是规范 Asset 数，实际拆分/合并及共享身份必须由后续来源映射显式记录。这些常量不是全战役规范图或 S-02 排序证据。
- [contract-validation.ts](../../src/content/contract-validation.ts)：严格 plain-data 校验和 `ContentContractError`，按稳定 `code`/`path` 分类；诊断不回显非法值或未知属性名。DTO 不接受类实例、函数、accessor 或未知字段。读入口复制并冻结所有基础容器，结构化克隆后可独立修改；`readArray` 统一读取稠密 plain 数组，`readOrderedArray` 在逐项读取的同时检查唯一与升序（首个问题按索引顺序报告）。两者都建立在 `visitArray`/`visitOrderedArray` 之上：这两个函数按索引逐项读取并访问，访问函数一旦返回非 undefined 的值就停止读取，并把该值返回。`original-data` 的来源映射也复用这些校验（依赖方向为 original-data → content，反向被 lint 禁止）。二进制 payload 不能冻结，所有权规则见下方 `ownership.ts`。
- [slice-definition.ts](../../src/content/slice-definition.ts)（[P2-01/02](../plan/p2/01/subtasks/02-slice-content-contract.md)）：`CLASSIC_P2_SLICE` 是唯一的生产切片定义，深度冻结；`SliceDefinition` 带仅类型品牌，唯一构造由[工程边界回归](./README.md#lint-规则eslintconfigjs)保证。定义记录经批准的候选结构选择器（战役 group 0 / slot 1，僚机可选）、四个必需资源组及各组拥有的 kind（`groupKinds`），以及 S-03 角色的组、允许 kind 与 Asset 数量范围。弹丸/导弹/碎片暂允许 model 或 image，四类核心音效暂允许多个采样片段，分别待 P2-06/P2-08 核实后收窄。原版条目 ID 不在此处，由 03 的来源映射记录。更换候选或改变角色、数量范围、分组都须修订 spec 并递增 `SLICE_DEFINITION_VERSION`。
- [completeness.ts](../../src/content/completeness.ts)（[P2-01/04](../plan/p2/01/subtasks/04-completeness-validation.md)）：`validateGroup` 用切片定义、组清单（身份、组、按 ID 升序的描述符）、按 ID 升序且唯一的实际 payload 记录和来源状态集推导 `group-complete` 或 `incomplete`。它检查定义版本、组归属、角色的组与 kind、角色数量、组内依赖、自引用与环、payload（[payload.ts](../../src/content/payload.ts) 重新计算 SHA-256，并比对 schema 版本与长度）以及来源就绪。依赖的 kind 若不属于本组拥有的 kind，作为类型化外部要求返回，不判为本组缺失。`validatePackage` 每次都从四组原始输入重新验证，从不接受已有结果；只有每组恰好一份、六项身份一致、ID 跨组唯一、外部要求全部解析且无跨组环时才返回 `complete`。诊断带稳定 code、结构路径、规范 ID、U 项与原因，不含 payload 字节或 locator。
- [sha256.ts](../../src/content/sha256.ts)：同步、无依赖的 SHA-256，供纯模块计算和核验 `sha256:` payload 指纹。
  - `Sha256` 可分段输入：`update` 接受任意长度（含零长度）的片段，只保留未满一块的尾部，用完即清零，不复制、不保留、不修改调用者的字节；已 detached 的输入或总长超出安全整数时，在改变状态前抛错。
  - `digestHex` 结束计算并返回 64 位小写十六进制；之后再 `update` 会抛错，再次 `digestHex` 返回同一结果。
  - 一次性的 `sha256Fingerprint` 建立在它之上，签名与输出不变。
- [source-state.ts](../../src/content/source-state.ts)：不含 locator 的来源状态集 `{ sourceFingerprint, states }`（每个 Asset 为 verified/unverified/unconfirmed/conflict 加 U 项），由 `original-data` 从来源映射推导后交给完整性验证。原版导入的状态集指纹必须等于清单的来源指纹，且每个 Asset 都必须为 verified；合成内容的来源输入必须为 null。
- [manifest.ts](../../src/content/manifest.ts)：`readGroupManifest` 读取组清单（身份、组，以及按 ID 升序且唯一的描述符），完整性验证使用它；`readAssetDescriptors` 单独读取同样排序的描述符数组。`visitGroupManifest` 做同样的检查，但逐个访问描述符而不收集，访问函数返回值时即停止，供预算计量使用。
- [manifest-identity.ts](../../src/content/manifest-identity.ts)（[P2-09/03](../plan/p2/09/subtasks/03-package-identity.md)）：包身份的唯一推导。
  - **推导：** `deriveManifestIdentity(basis, drafts)` 严格读取身份基础与一个作业的全部组草稿（`GroupDraft`：组、按 ID 升序的描述符、payload 记录、来源状态集或 null），按 `RESOURCE_GROUPS` 顺序编码为带版本前缀的 ASCII 文本，结果为 `manifest:sha256:<64 位小写十六进制>`。任一身份基础字段、描述符字段、依赖、payload 身份或来源状态变化，结果都变化；组的传入顺序与 payload 记录不影响结果，推导也不读取 payload。空列表、重复或未知的组与格式错误的草稿以 `ContentContractError` 拒绝。测试中的固定向量锁定版本 1 编码。
  - **写入：** `applyManifestIdentity` 把同一身份写入每个组，返回冻结的 `IdentifiedGroup` 列表（可直接作为 `GroupInput` 交给完整性验证）。描述符、来源状态与 payload 记录都是读取后的副本，只有 payload 字节沿用调用者的视图，所有权仍按 `ownership.ts` 转移；payload 记录的错误路径使用调用者的草稿序号。
  - 生产转换器版本是 [original-data/conversion/converter-version.ts](../../src/original-data/conversion/converter-version.ts) 的 `PRODUCTION_CONVERTER_VERSION`，全部生产转换器共用这一个定义（P2-09 S-07）。值的格式取自 P2-08：`osr-import.` 后按阶段顺序接作业打包的各转换器组件 `<转换器>-<n>`，目前为 `osr-import.graphics-2.logic-1.audio-1.models-1`（`GRAPHICS_CONVERTER_COMPONENT`、`LOGIC_CONVERTER_COMPONENT`、`AUDIO_CONVERTER_COMPONENT`、`MODEL_CONVERTER_COMPONENT`；P2-06/07 起图形输出随 `models` 组打包，因此加入图形组件 `graphics-1`；[P2-07/13](../plan/p2/07/subtasks/13-group-assembly.md) 起 `cockpit-hud-map` 组也被打包，图形组件递增为 `graphics-2`）。任一转换器对同一来源的输出可能变化时，递增它的组件，从而改变这个值；它是 [P2-10 缓存键](../plan/p2/10/spec.md#缓存键与身份)的一部分。`productionIdentityBasis(指纹)` 给出生产组的身份基础。P2-08 合入前曾另行实现 `computeManifestIdentity`，合入时统一为本节的 `deriveManifestIdentity`/`applyManifestIdentity`。
- [logic/](../../src/content/logic/)（[P2-09/04](../plan/p2/09/subtasks/04-logic-content.md)）：`logic` 组的规范逻辑内容，形状与约束见 [P2-09 spec](../plan/p2/09/spec.md#规范逻辑数据)。
  - **类型与限值：** [logic-content.ts](../../src/content/logic/logic-content.ts) 定义 `MissionContent`、`MissionGroup`、`MissionDeclaration`、`CraftTypeTable`、`WingmanRoster`、`StrategicMapFrame`、按角色区分的 `LogicPayload`，以及 `LOGIC_LIMITS` 与 payload schema 版本 1。字段声明顺序就是规范编码顺序；规则输入的字段名不表示语义已确认。
  - **读取器：** [logic-readers.ts](../../src/content/logic/logic-readers.ts) 的 `readMissionContent`、`readCraftTypeTable`、`readWingmanRoster` 与按角色分派的 `readLogicContent` 读取已解码的纯数据，返回冻结副本，-0 规范化为 0。结构、类型、取值范围与限值错误一律为 `invalid-logic-payload`（共用的基础读取器的错误也改报此码，路径不变）；数组先查长度再逐项读取。单个 payload 内的引用错误为 `logic-reference-mismatch`：声明序号与规范顺序（`object` 声明在前，最多 64 条，其后为编组首次使用的声明）、编组模板与成员的来源标记（双向一致）、成员回指、放置矩形与锚点、AI 目标，以及僚机选项不得引用任务结构。跨 Asset 的一致性不在这里检查。
  - **编码：** [logic-payload.ts](../../src/content/logic/logic-payload.ts) 的 `encodeLogicPayload(payload, reserve?)` 先严格读取，再输出无空白的可打印 ASCII JSON 字节（独占新 buffer）；可选的 `reserve` 在检查上限与分配字节之前收到字节数，供转换器先计量预算。`decodeLogicPayload(bytes, descriptor)` 依次检查：描述符的角色与 kind、payload schema 版本、字节已转移与长度上限（在读取任何字节之前）、逐字节可打印 ASCII、JSON 语法、按角色读取，然后要求重新编码与输入逐字节相同（否则 `non-canonical-payload`），最后要求 payload 内的 Asset 引用恰为描述符依赖（否则 `logic-reference-mismatch`）。payload 身份由完整性验证核对，这里不重复。
  - [contract-validation.ts](../../src/content/contract-validation.ts) 为此追加 `invalid-logic-payload`、`non-canonical-payload` 与 `logic-reference-mismatch`；诊断只含结构路径与固定原因，不回显名称或数值。合成内容由 [logic-content.test-support.ts](../../src/content/logic/logic-content.test-support.ts) 生成，名称带内容测试自己的标记。
- [budget.ts](../../src/content/budget.ts)（[P2-01/05](../plan/p2/01/subtasks/05-budget-ownership-contract.md)）：
  - **维度：** `BUDGET_UNITS`/`BUDGET_DIMENSIONS` 固定 schema 1 的十二个维度及单位，增删维度或改变单位属于 schema 变化。
  - **记录：** `readBudgetRecord` 要求完整记录，不适用的维度写 0。缺失维度、未知维度（例如换了单位的键）以及非“非负安全整数”的值分别以稳定 code 拒绝，不回显未知键名。
  - **计量：** `chargeBudget` 每次都重新读取限值、当前用量和增量，调用者应在读取或分配声明规模之前计量。
  - **相加：** `addBudgets(left, right, path)` 把两个完整记录逐维相加（例如读取限值加某一步骤的份额，或读取用量加转换用量），结果须仍是合法记录，否则在 `path` 下报 `invalid-budget-value`。
    - 用量等于上限时通过；超过上限返回 `budget-exceeded`，带维度、limit 与 observed。
    - 总量超出安全整数范围时返回 `budget-overflow`，observed 为 null。
    - 判断基于剩余额度，不依赖溢出后的和。被拒的计量不会部分生效，结果中仍是之前的用量。
  - **清单计量：** `chargeManifestBudget` 在读取清单的同时逐个 Asset 计量声明的 Asset 数、依赖边数和 payload 字节，遇到第一个超限的 Asset 即拒绝整个清单，不再读取后续描述符，路径指向该 Asset。若传入的现有用量已经超限，即使清单为空也会拒绝。
  - 具体限值由 P2-02 至 P2-09 各自的 spec 批准。
- [ownership.ts](../../src/content/ownership.ts)：TypedArray 不能冻结，因此二进制 payload 不在消费者之间共享。
  - `exclusiveBytes` 把字节复制到长度恰好的新 ArrayBuffer；不使用 `slice`，因为 Node 的 `Buffer#slice` 共享内存。
  - `payloadTransferList` 返回要转移的 ArrayBuffer：每个视图必须独占整个非共享 buffer，且彼此不共用；否则以 `payload-not-exclusive`/`payload-aliased` 拒绝。
  - 转移后，发送方的视图变为空。`isDetached` 用 ES2023 可用的方式识别已转移的 buffer；`exclusiveBytes`、`payloadTransferList` 和 `readPayloadRecords` 都以 `payload-detached` 拒绝已转移的字节，因此发送方不能再复制、再次发送或拿去验证。实际的 Worker 转移由 P2-04 接入。
- [sound-payload.ts](../../src/content/sound-payload.ts)（[P2-08/01](../plan/p2/08/subtasks/01-sound-payload.md)）：kind 为 `sound` 的规范采样 payload，schema 1（`SOUND_PAYLOAD_SCHEMA_VERSION`），与来源无关，不含条目编号、`flags` 原值或 locator。
  - **布局：** 16 字节小端头部（`SOUND_PAYLOAD_HEADER_BYTES`）后接交错的 PCM。`SOUND_PAYLOAD_OFFSETS` 依次为：标签 `OSRS`（0）、u32 采样率（4）、u32 帧数（8）、u8 声道数（12）、u8 编码（13）、u8 循环方式（14）、保留字节 0（15）、PCM（16）。采样率范围 `SOUND_SAMPLE_RATE_RANGE` 为 8,000–96,000 Hz；声道 1 或 2；编码 `SOUND_ENCODINGS` 为 1 = `u8`（无符号 8 位）、2 = `s16le`（有符号 16 位小端）；循环方式 `SOUND_LOOP_MODES` 为 0 = `none`、1 = `whole`。
  - **写入：** `writeSoundPayload` 按读取器的同一规则核对 `{ sampleRate, channels, encoding, loop, pcm }`（PCM 须是一个或多个整帧，帧数不超过 u32），把 PCM 原样复制到长度恰好的新独占 buffer，不修改也不保留输入视图。
  - **读取：** `readSoundPayload` 依次核对长度至少为头部、标签、采样率/声道/编码/循环方式、保留字节、帧数 ≥ 1、PCM 长度恰为帧数 × 声道数 × 每样本字节数（无尾随字节），失败时以 `invalid-sound-payload` 及字段路径拒绝，已转移的字节为 `payload-detached`；不按声明的帧数分配，诊断不回显值。结果是冻结的头部字段加指向原视图的 PCM 子视图，仅供读取。
  - **浮点映射：** `soundChannelData` 是唯一的映射，为每个声道返回新的 `Float32Array`（按帧交错拆分，不与 payload 共享内存）：`u8` 的 v 映射为 (v − 128) / 128，`s16le` 的 v 映射为 v / 32768，按小端读取，与宿主字节序无关。转换器、播放适配与本地对照脚本都用它。

合成内容包由 [synthetic-content.test-support.ts](../../src/content/synthetic-content.test-support.ts) 在代码中生成：四组清单覆盖全部角色，另含实际 payload、原版导入变体的来源状态（`syntheticSourceGroup` 可绑定任意来源指纹），以及按 `code@path` 断言诊断的辅助函数。它与生产文件同样位于纯模块程序中。[synthetic-package.test.ts](../../src/content/synthetic-package.test.ts) 用同一个包串联完整性验证、预算、独占发布、转移与接收方重新验证，并覆盖模型内部几何与共享源网格的字节层用例。针对性检查为 `pnpm exec vitest run src/content tools/engineering-boundaries.test.ts`；不读取原版文件或接线浏览器消费者。

### 图形 payload

[content/graphics/](../../src/content/graphics/)（[P2-05/01](../plan/p2/05/subtasks/01-graphics-payloads.md)）定义 `palette`、`image`、`font` 三类 Asset 的规范 payload，[P2-07/01](../plan/p2/07/subtasks/01-layout-payload.md) 加入 `layout`。它是纯 TypeScript，不导入 `original-data`；原版转换由 `original-data` 产生这些字节。

- **常量：** [graphics-format.ts](../../src/content/graphics/graphics-format.ts) 的 `GRAPHICS_SCHEMA_VERSION` 为 1，四类共用；改变字节布局或解释须递增。`GRAPHICS_LIMITS` 供读取器与转换器共用，分为两类：
  - **格式规则：** 调色板 1–256 项（8 位索引最多寻址 256 项），字体单元宽 1–8（每行 1 字节），字形 1–256 个（8 位字形索引），字符映射 0–256 条；
  - **安全上限：** 图像宽 1–640、高 1–480（Classic HI 画幅），布局画幅取同样的范围；字体高 1–8（已观察到 6 与 8），每字形行数也不超过 8；布局元素 1–16（`layoutElements`，等于 CCKD 每个分组的元素上限）。原版字段本身更宽，图像与字体两项是 [P2-05 spec](../plan/p2/05/spec.md#限值与预算) 批准的上限，布局两项见 [P2-07 spec](../plan/p2/07/spec.md#限值与预算)。
- **字节布局：** 都是小端定长头部加数据，总长恰为两者之和，Asset ID 以 ASCII 存储。

  | 类别 | 头部 | 数据 |
  |---|---|---|
  | 调色板 | `u16` 条目数 | 每项 (R, G, B) 各 8 位，不含透明 |
  | 图像 | `u16` 宽、`u16` 高；`u8` alpha（0 不透明、1 掩码）；`u8` display（0 direct、1 nearest）；`u8` 调色板 ID 长度（1–128）；`u8` 目标 ID 长度（direct 为 0，nearest 为 1–128） | 调色板 ID，nearest 的目标调色板 ID；`宽 × 高` 个行优先索引，行 0 在上；alpha 为 1 时再接掩码：每行 `⌈宽/8⌉` 字节，bit 7 为最左，1 为不透明 |
  | 字体 | `u8` 单元宽、`u8` 单元高、`u8` 每字形行数（单元高–8）、`u16` 字形数（1–256）、`u16` 映射条数 | 字形数 × 每字形行数字节的字形，字形 g 的第 r 行在 `7 + g × 每字形行数 + r`，bit 7 为最左，逐位保留（含单元以外的位与行）；映射按码位严格升序的 (code, glyph) 字节对，glyph 小于字形数 |
  | 布局 | `u16` 画幅宽（1–640）、`u16` 画幅高（1–480）、`u8` 元素数 N（1–16）；N 个 5 字节元素项，按绘制顺序（后者在上）：`u16` x（0 至宽−1）、`u16` y（0 至高−1）、`u8` 图像 ID 长度（1–128） | 按元素顺序依次存放 N 个图像 ID；(x, y) 是图像左上角在画幅中的像素位置，各元素的图像互不相同 |

  图像引用的 ID 必须是 `palette` kind 的 Asset ID，布局元素引用的必须是 `image` kind。布局不含调色板、透明或缩放字段：它们由各图像 payload 表达；图像尺寸只在图像 payload 中，所以读取器只检查坐标，元素矩形是否越出画幅由转换与合成检查。透明像素的索引与掩码行尾填充位一律为 0：编码器写 0，读取器拒绝非零。字形的绘制颜色与字距不在 payload 中，映射之外的码位没有字形。每字形行数可以大于单元高（4×6 表为 8，见 [P2-05/12](../plan/p2/05/subtasks/12-character-map-research.md)）；单元以外的位与行是否绘制属 [U-030](../original/unknowns.md#数据与格式)，由消费者按单元裁剪或保留。
- **编码：** `encodePalettePayload`、`encodeImagePayload`、`encodeFontPayload`、`encodeLayoutPayload` 校验字段后写入一个独占整个 `ArrayBuffer` 的新缓冲（可直接交给 `payloadTransferList`），同一输入得到同样的字节与 SHA-256；不改动调用者的数组。`palettePayloadLength`、`imagePayloadLength`、`fontPayloadLength`、`layoutPayloadLength` 按字段给出编码长度，供转换器在分配前扣除 `payloadBytes`。布局的画幅检查 `layoutFrame` 由转换声明复用。
- **读取：** `readPalettePayload`、`readImagePayload`、`readFontPayload`、`readLayoutPayload` 接受 `(bytes, schemaVersion, path)`，返回带 `kind` 的冻结数据，其中的数组是调用者独占的新副本（布局的画幅、元素数组与各元素也都冻结）。schema 不是 1 为 `unsupported-payload-schema`；长度不符（截断或尾随字节）、字段越界、未知的 alpha/display 值、非法或 kind 不符的 ID、非零填充位、透明像素的非零索引、映射乱序或重复、映射的字形不小于字形数，以及布局元素数不在 1–16、坐标越出画幅或两个元素引用同一图像（报在后一个元素的 `elements[<i>].image`），都为 `invalid-graphics-payload`；已转移的字节为 `payload-detached`。`maskStride` 与 `isOpaque` 按上述掩码约定取每行字节数与单个像素的不透明性。
- **绑定：** [graphics-binding.ts](../../src/content/graphics/graphics-binding.ts) 的 `referencedPalettes` 给出 payload 引用的调色板 ID（去重后升序：direct 为 `{palette}`，nearest 为 `{palette, target}`；调色板、字体与布局没有），`imagePalettes` 对图像的绑定字段给出同样的结果，`layoutImages` 给出布局各元素的图像 ID（升序），供转换器生成依赖。`checkGraphicsBinding(descriptor, payload)` 要求描述符的 kind 与 payload 一致，依赖恰好等于这些 ID：布局为元素图像且 kind 都是 `image`，其余为引用的调色板且 kind 都是 `palette`；否则报 `binding-mismatch`。

- **展开：** [expand-image.ts](../../src/content/graphics/expand-image.ts) 的 `expandImage(image, palettes)` 是项目中唯一的调色板查找。`palettes` 按 Asset ID 提供，必须恰好是图像引用的调色板，否则报 `binding-mismatch@palettes`。结果为冻结的 `{ width, height, rgba }`，`rgba` 是调用者独占的新缓冲，非预乘：不透明像素为显示颜色、alpha 255，透明像素为 (0, 0, 0, 0)。direct 直接查图像的调色板；nearest 先把源调色板逐项映射到目标调色板再查表，因此不透明像素的颜色都属于目标调色板。不透明像素的索引不小于源调色板条目数时报 `palette-index-out-of-range@<path>.indices`，透明像素的索引不参与。展开结果不进入 payload 或缓存。
- **最近色：** 同文件的 `nearestColourMap(source, target)` 对源调色板的每一项取 8 位 RGB 平方欧氏距离最小的目标条目，距离相等取较小索引。这是**暂定的项目规则**：原版的度量与并列规则尚无证据（[U-028](../original/unknowns.md#数据与格式)，研究见 [P2-05/11](../plan/p2/05/subtasks/11-nearest-colour-research.md)），合成测试只验证这个算法，不是保真证据。研究工具与后续 Renderer 复用它，不另写颜色逻辑。
- **布局合成：** [compose-layout.ts](../../src/content/graphics/compose-layout.ts) 的 `composeLayout(layout, images, palettes, path)` 是项目中唯一的布局合成（[P2-07/02](../plan/p2/07/subtasks/02-layout-composition.md)），供 P2-11 查看器、P2-12 对照与后续 Renderer 使用：
  - **输入：** `images` 按 Asset ID 提供，必须恰为布局各元素的图像，否则报 `binding-mismatch@images`；`palettes` 必须恰为这些图像引用的调色板，否则报 `binding-mismatch@palettes`。
  - **规则：** 输出画幅大小的非预乘 RGBA，初始全部为 (0, 0, 0, 0)。按数组顺序处理每个元素：用 `expandImage` 展开（每个图像只拿到自己引用的调色板）；按实际图像尺寸核对 x + 宽 ≤ 画幅宽、y + 高 ≤ 画幅高，越出时报 `layout-out-of-frame@<path>.elements[<i>]`；只写入 alpha 255 的像素：后者覆盖前者，透明像素不改变下层。错误由第一个失败的元素决定。同一布局可以混用绑定不同调色板的图像。
  - **结果：** 冻结的 `{ width, height, rgba }`，`rgba` 是调用者独占的新缓冲，坐标是 HI 画幅的原始像素，不缩放；窗口缩放与设备像素比属于 `render/`。调色板索引越界沿用 `palette-index-out-of-range`，位置为 `images[<图像 ID>].indices`。结果不进入 payload 或缓存。
- **字符查找：** [glyph-lookup.ts](../../src/content/graphics/glyph-lookup.ts) 的 `glyphFor(font, code)` 在字符映射中查找文本字节的字形，`glyphsFor(font, text)` 逐个查找字节序列。未映射的码位报 `unmapped-character`（序列中为 `text[<i>]`），即使恰有同号字形也不回退；错误不回显码位。

针对性检查为 `pnpm exec vitest run src/content/graphics`。

### 模型 payload

[content/models/](../../src/content/models/)（[P2-06/01](../plan/p2/06/subtasks/01-model-payload.md)）定义 `model` Asset 的规范 payload，对应 P2-01 的 `model-with-internal-geometry` 单位：一个模型连同其内部几何，网格不是独立 Asset。它是纯 TypeScript，不导入 `original-data`、DOM、Node 或 Three.js；原版转换由 `original-data` 产生这些字节。

- **常量：** [model-payload.ts](../../src/content/models/model-payload.ts) 的 `MODEL_PAYLOAD_SCHEMA_VERSION` 为 1，改变布局或解释须递增。`MODEL_LIMITS` 供读取器与转换器共用：
  - **安全上限**（[P2-06 spec](../plan/p2/06/spec.md#限值与预算)批准，各有限值名）：每个几何顶点 1–4,096（`meshVertices`）、三角形 1–4,096（`meshTriangles`），每个模型三个列表合计部件 1–256（`modelParts`）；
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
- **消费辅助：** [model-parts.ts](../../src/content/models/model-parts.ts) 的 `modelPartItems(model, list)` 按源列表 0–2 与存储顺序给出部件项：几何的位置、UV、法线、索引、角点着色槽与着色槽数，以及材质 `{ colour }` 或 `{ colour, texture, wrap: 'repeat' }`（UV 在两个方向都按重复寻址）。每次调用返回新的冻结项与数组副本，修改它们不影响 payload 或后续调用；不剔除、不重排三角形，不翻转 UV。列表序号不是 0–2 为 `invalid-model-payload@list`。`expandModelTextures(model, images, palettes)` 对模型引用的每个贴图调用 `expandImage`，`images` 与 `palettes` 必须恰好是引用的贴图及其调色板，否则为 `binding-mismatch@images` 或 `@palettes`；颜色不另行计算。
- **payload 不承载的含义：** 部件列表、源标志字与音效槽都按源序号原样保留，payload 不命名也不解释它们；已知的含义与置信度只记在 [mesh](../original/formats/mesh.md)，音效槽以 P2-08 的记录为准。光照与明暗不在这里（P3，U-028）。
- **消费者边界：** 坐标是原版模型空间的数值，不换算单位、轴向或手性；正面绕序与 UV 原点（v = 0 对应贴图首行还是末行）都未确认，payload 不作解释。P2-11 的渲染适配选择换算并在本指南记录，P2-12 用原版截图判定；判定有误时只改渲染适配，不必重新导入或递增 schema。贴图是独立的 image Asset，可被多个模型共用：渲染适配按 image Asset ID 共享一个 GPU 纹理，最后一个引用模型释放后释放；几何属于各自的模型，不跨模型共享。查看器的中性光照不得称为原版效果。
- **对照入口：** P2-11 渲染与 P2-12 本地对照都只经 `readModelPayload`、`modelPartItems`/`expandModelTextures` 与 P2-05 的 `expandImage` 取数据，不另建研究用的解码路径。

合成模型由 [models.test-support.ts](../../src/content/models/models.test-support.ts) 在代码中生成。针对性检查为 `pnpm exec vitest run src/content/models`。

### 任务数据的定向解析

[P2-09/05](../plan/p2/09/subtasks/05-scenario-parser.md) 在 [original-data/formats/](../../src/original-data/formats/) 解析所选任务需要的 SCCT、SCEN 与 M2ID 条目。规则来自 [P2-09 spec 的源字段处理](../plan/p2/09/spec.md#源字段处理)与限值表，格式事实见 [scenario](../original/formats/scenario.md) 与 [hud §3](../original/formats/hud.md#3-id-lists-confirmed-structure)。解析器只接收 `ArchiveEntryRead` 形状的已读条目与封包的 `DiscPath`，不打开文件或封包；读取由转换编排经已验证来源完成。按能力边界，这里只以类型导入封包与光盘模块。

- **数据块读取：** [payload-block.ts](../../src/original-data/formats/payload-block.ts) 的 `PayloadBlock`：
  - 先按条目大小检查 `payloadEntryBytes`；`requireEntryBytes` 也可在读取前按目录项调用。
  - 指针只在重定位表登记的位置上有效：未登记的非零值为 `invalid-payload`，目标结构必须完整位于块内。反过来，登记的位置不得与解析器读取的任何数值、名称或保留字重叠，否则同为 `invalid-payload`。
  - 指针字段按两步判定：先校验登记与边界（`invalid-payload`），再判定用途；必须为空的指针字段由 `unsupportedPointer` 判为 `unsupported-payload`。
  - `{指针, 数量}` 数组先按 `payloadItems` 检查数量，再做边界检查，因此不按声明规模分配；空指针要求数量为 0；顶层数组不得与所在条目的头部重叠；非空指针配 0 个元素为 `unsupported-payload`。
  - 名称必须以 NUL 结尾，1–63 字节（超出为 `textBytes`，最多检查 64 字节）的可打印 ASCII；f32 必须有限。
- **记录：** [object-record.ts](../../src/original-data/formats/object-record.ts) 读取 132 字节记录：
  - 重定位只能位于文档记载的指针字段；
  - +0x30、+0x4C 与保留字必须为默认值（前两者按指针的两步规则），+0x38 必须为 0；
  - 各引用字段的目标须按预期结构大小（编组 28、矩形 16、记录 132、事件触发头部 28 字节）完整位于块内，然后才判定是否为该结构的起点；
  - 种类转为位序号，多比特为 `invalid-payload`；
  - 规则输入原样保留，0 为 null；AI 掩码转为升序位序号；
  - 指针字段作为目标偏移交给所在结构解析。
- **SCEN：** [scen.ts](../../src/original-data/formats/scen.ts) 的 `parseScenario` 返回 `ParsedScenario`：
  - 内容：扇区数、参考比例、名称备用池、生成矩形、声明与编组，声明与编组使用 `content/logic` 的类型；
  - 声明：段 1 记录按表序；模板与成员必须是段 1 记录的别名；
  - 引用转为序号：+0x3C 成员回指（须与列出它的唯一编组一致）、+0x44 生成矩形、+0x48 锚点与 +0x58 AI 目标；
  - +0x54 只核对它指向段 2 第一个元素且该事件触发没有生成配对；
  - 段 6 布局只交换第 0 个元素的 y/z，并核对原版循环越过表尾读取的计数字。
- **SCCT：** [scct.ts](../../src/original-data/formats/scct.ts) 的 `parseCampaignTable` 校验每个组的槽位表头与限值，但只读取候选（默认 `CLASSIC_P2_SLICE.candidate`）槽位的 SCEN 条目 ID 与僚机记录；组或槽位超出表为 `subresource-mismatch`；僚机记录的引用与空间字段必须为零。
- **M2ID：** [m2id.ts](../../src/original-data/formats/m2id.ts) 的 `parseModelIdList` 严格读取 MODL 条目 ID 列表；槽位为 0 的处理归机型绑定。
- **错误：** [source-error.ts](../../src/original-data/source-error.ts) 为此追加 `invalid-payload`、`unsupported-payload`、`subresource-mismatch` 与限值名 `payloadEntryBytes`、`payloadItems`、`textBytes`。位置为 `archive:/路径#ID` 后接 `/名称[下标]` 形式的结构路径，`inLocationGrammar` 已扩展为接受这种形式；诊断不回显名称、数值或字节。
- **测试数据：** [formats.test-support.ts](../../src/original-data/formats/formats.test-support.ts) 用 `BlockWriter` 在奇数偏移上布置结构，倒序写出重定位表，由规格生成合成 SCEN、SCCT 与 M2ID 数据块，并用 `buildImfat` 组成合成的 `SCENARIO.NOB` 与 `SR.NOB`。默认任务的形状与切片任务相同，但数值都是合成的；名称带 `MARKER`。

### 逻辑组转换

[original-data/conversion/](../../src/original-data/conversion/) 把已解析的任务数据转换为 `logic` 组，规则见 [P2-09 spec](../plan/p2/09/spec.md)：

- **机型与模型绑定：** [craft-binding.ts](../../src/original-data/conversion/craft-binding.ts) 的 `bindCraftTypes(referenced, modelIds, location)` 是机型到 model Asset ID 的唯一生产绑定（[spec 的命名规则](../plan/p2/09/spec.md#机型与模型绑定)）。
  - **输入：** 任务与僚机名单引用的机型，以及 M2ID 解析结果。
  - **输出：** `CraftTypeTable` 与按 Asset ID 排序的 `{ id, modelEntryId }`。阵营按玩家目标模式的种类掩码推导，`baseInteraction` 按交互种类掩码推导（“基地”含义为高概率），这两组掩码是写在转换器里的格式知识，注释链接权威记录。
  - **命名：** 按玩家、敌方、基地、其余友方的顺序命名每个 MODL，同类内按机型升序编号；同一 MODL 只有一个 ID，只允许同类机型或友方机型与玩家飞船共用。
  - **失败：** 玩家机型缺失、M2ID 槽位为 0 或越界、模型被不同类别共用为 `invalid-payload`，没有玩家相对阵营的机型为 `unsupported-payload`，位置为 M2ID 的槽位路径。
  - **[P2-06](../plan/p2/tasks.md#p2-06-切片模型与材质转换) 必须用这一绑定命名模型 Asset，不得另建表。**
- **生产来源映射：** [logic-sources.ts](../../src/original-data/conversion/logic-sources.ts) 的 `LOGIC_SOURCE_MAPPINGS` 是 `logic` 组的生产映射表。它未绑定来源，三项都为 `likely` 与 `declared`，U 项与证据按 spec 的 Asset 表：
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
- **转换步骤：** [convert-logic.ts](../../src/original-data/conversion/convert-logic.ts) 的 `convertLogic(source, limits, usage)` 产出 `logic` 组草稿：
  1. 以 `logicEntryReader` 与 `verifyLogicSources` 核验映射并解析 SCCT；
  2. 从同一步骤读取取得映射的 SCEN 与 M2ID 并解析；
  3. 以 `bindCraftTypes` 绑定任务与僚机名单引用的机型；
  4. 核对跨 Asset 的一致性：任务恰有一条记录为玩家机型，僚机选项都不是玩家机型，否则为 `unsupported-payload`；
  5. 组装三个 payload。`mapFrame` 按 executable 的世界扇区网格与战略地图投影记录生成：+x 向右，−y 向上，中心为原点，`halfExtent` 为扇区数 × 比例 ÷ 2；
  6. 按 Asset ID 升序编码，并生成描述符与 payload 记录。

  返回冻结的 `{ draft, usage }`，`usage` 为起始用量加上本步骤的转换用量。`draft` 是 `GroupDraft`（描述符、各占独立 buffer 的 payload、来源状态），身份由调用方以 [manifest-identity.ts](../../src/content/manifest-identity.ts) 写入。生产身份基础是 [converter-version.ts](../../src/original-data/conversion/converter-version.ts) 的 `productionIdentityBasis(sourceFingerprint)`：来源为 `original-import`，带 P2-01 的 schema、切片常量与 `PRODUCTION_CONVERTER_VERSION`。
- **预算：** 同一模块的 `PRODUCTION_LOGIC_SHARE` 是 logic 步骤的生产份额：`assets` 8、`dependencyEdges` 32、`payloadBytes` 1,048,576、`missionObjects` 256、`missionReferences` 4,096，其余维度为 0。与图形步骤一样，作业把份额加到读取限值上作为 `limits`，本步骤在先前步骤的转换用量 `usage` 之上扣除；起始用量含 `sourceReadBytes` 时为 `invalid-budget-value`。
  - **计量时机：** 每个 Asset 分两次计量：Asset、依赖边与两类任务计数在复制与编码 payload 之前计量；`payloadBytes` 由 `encodeLogicPayload` 的 `reserve` 回调在得到规范字节数之后、检查 payload 上限与分配字节之前计量。
  - **计数规则**（spec 的[限值与预算](../plan/p2/09/spec.md#限值与预算)）：
    - `missionObjects`：任务声明与僚机声明的总数；
    - `missionReferences`：每个声明的机型、放置矩形、锚点、编组与 AI 目标（非 null 时各计一次），编组的模板与每个成员位置，每个机型到 model 的引用，以及任务的 2 个、僚机名单的 1 个 Asset 引用。
  - **超限：** 与图形步骤相同，报 `budget-exceeded`：`limit` 为维度名、上限与观测值，总量超出安全整数时观测值为 null。位置是该 Asset 的来源条目，僚机名单为 SCCT 的 `/wingmen`。被拒绝的扣除不改变用量。
  - **可达性：** 只用本份额时，结构限值下只有 `missionReferences` 与 `payloadBytes` 可能超限。

### Core 任务载入

[core/mission/load-mission.ts](../../src/core/mission/load-mission.ts)（[P2-09/11](../plan/p2/09/subtasks/11-core-load-mission.md)）的 `loadMission(input)` 是 Core 的纯函数，契约见 spec 的 [Core 载入结果](../plan/p2/09/spec.md#core-载入结果)：

- **输入：** `LoadMissionInput` 为 `{ mission, craftTypes, wingmanRoster }`，每项为 `{ id: AssetId, content: unknown }`。Core 仍在运行时核对输入，不信任调用者给的类型：先核对任务 ID，再用 [logic-readers.ts](../../src/content/logic/logic-readers.ts) 读取任务；确认机型表与僚机名单的 ID 是任务引用的 ID 之后，才读取它们的 `content`。读取路径为 `input.<asset>.content`；单个 payload 内部的错误是读取器的 `ContentContractError`，原样传递。
- **前提：** 只检查跨 Asset 的一致性，不满足时抛出 `CoreInputError(path, reason)`，路径指向输入位置：
  - 输入或某项不是对象；
  - 任务 ID 不是 `mission` 类 Asset ID；
  - 机型表与僚机名单的 ID 不是任务引用的 ID，或名单引用了另一张机型表；
  - 声明或僚机选项引用了表中没有的机型；
  - 任务中没有或有两个玩家声明，或有僚机选项是玩家机型；
  - 表中有任务与名单都没引用的机型。这一项最后检查，以免缺少玩家时被误报为多余机型。
- **输出：** 冻结的 `MissionSetup`，字段依次为 `mission`、`campaign`、`coordinates`、`mapFrame`、`namePool`、`spawnRegions`、`declarations`、`player`、`groups`、`wingmanOptions`。声明与僚机选项附加解析出的 `side`、`model`（model 的 Asset ID）与 `baseInteraction`；`craftType` 为 null 时三者为 null、null、false。结果由读取器的新副本组成，与输入隔离；相同输入得到深度相等的结果。
- **纯净：** 不应用默认值，不推导生成时刻、顺序或位置，不使用 RNG 或宿主时间，只导入 `content/` 与 Core 自己的错误类型。

针对性检查为 `pnpm exec vitest run src/core/mission tools/engineering-boundaries.test.ts`。

### 原版来源映射

[source-mapping.ts](../../src/original-data/source-mapping.ts)（[P2-01/03](../plan/p2/01/subtasks/03-source-mapping-boundary.md)）只属于 `original-data`，规范内容消费者不能导入（见[工程约定](./README.md#lint-规则eslintconfigjs)）：

- `readSourceMappingTable` 验证来源映射表：每个规范 Asset 映射到一个或多个部件，部件之间为“全部需要”（例如任务的 SCEN 与 SCCT 记录），同一部件内的多个 locator 为“精确等价，任取其一”（例如字节完全相同的别名条目）。locator 是光盘相对的 8.3 大写路径（与光盘读取共用 [disc-path.ts](../../src/original-data/disc/disc-path.ts) 的 `DiscPath` 规则）、IMFAT entry ID/type 与可选子资源路径；多个 Asset 可以共用同一 locator。每条映射还记录置信度（confirmed/likely/unconfirmed，非 confirmed 必须链接 U 项）、`docs/original/` 证据及 `declared`/`verified` 解析状态。表级 `sourceFingerprint` 在 P2-03 提供前为 null，此时不允许出现 `verified`。
- `diagnoseSourceMappings` 返回稳定排序、深度冻结的安全诊断，只含规范 ID、结构路径和 U 项，不含 locator 值或原版内容。所有映射都检查条目类型与 Asset kind 是否兼容（`SOURCE_ENTRY_TYPES` 依据 [imfat §5](../original/formats/imfat.md#5-entry-types) 与 [textures §2](../original/formats/textures.md#2-image-record-36-bytes-confirmed)）。必需 Asset 另报缺失、未确认和未验证；likely 不报，但其 U 项保留在映射上。`assetSourceStates` 直接由映射事实为每个已映射 Asset 推导一条不含 locator 的状态（严重度依次为条目类型冲突 conflict、unconfirmed、未验证 unverified，否则 verified），连同表级来源指纹一起交给 content 的完整性验证。

- `verified` 由 P2-03 产生：[source/verify-source-mappings.ts](../../src/original-data/source/verify-source-mappings.ts) 的 `verifySourceMappings(table, source)` 在已验证来源中逐个核验 locator，返回绑定来源指纹的新表，详见[版本识别与已验证来源](#版本识别与已验证来源)。

针对性检查为 `pnpm exec vitest run src/original-data src/content tools/engineering-boundaries.test.ts`。

### 光盘镜像读取

[P2-02](../plan/p2/02/spec.md) 的纯读取链按需读取开发者的 CloneCD 文件组，整个镜像从不一次性载入。支持的布局、限值、错误码与报错优先级以 spec 为准，这里只说明模块分工与对外 API：

- **端口：** [io/byte-source.ts](../../src/original-data/io/byte-source.ts) 只含 `ByteSource` 接口（`byteLength` 与 `read(offset, length)`），不导入任何模块。它是 `src/platform` 唯一能以纯类型方式导入的 `original-data` 模块，见[工程约定](./README.md#lint-规则eslintconfigjs)。
- **入口：** [disc/disc-image.ts](../../src/original-data/disc/disc-image.ts) 的 `openDiscImage(files, options)` 接受 `{ name, source }` 文件组，以及可选的 P2-01 预算记录 `limits` 与取消探针 `cancellation`（`AbortSignal` 即可）。返回冻结句柄：
  - `volume`：`{ sectorCount, volumeSectors }`；
  - `lookup(path)`：返回冻结、可结构化克隆的 `DiscEntry`；
  - `openFile(path)`：返回绑定镜像的 `DiscFile`，其 `read(offset, length)` 返回新的 `Uint8Array`，底层是独占的 ArrayBuffer；
  - `usage()`：十二维用量快照。
  - 句柄持有端口，不可结构化克隆，也不关闭调用方的源；内部不建立缓存。
  - 公共类型 `DiscInputFile`、`OpenDiscOptions`、`DiscEntry`、`DiscFile`、`DiscImage` 都从该入口导出。
- **错误：** 所有失败都以 [disc-error.ts](../../src/original-data/disc/disc-error.ts) 的 `DiscReadError` 拒绝，`toData()` 给出 `{ code, location, reason, limit }` 纯数据 DTO，不含字节、宿主名或记录原名。
- **内部模块（消费者只用上面的入口）：**
  - [source-reader.ts](../../src/original-data/disc/source-reader.ts)：受控端口读取、`sourceReadBytes` 计量、取消，以及端口返回值核对；
  - [clone-cd.ts](../../src/original-data/disc/clone-cd.ts)：文件组配对、尺寸门禁与 `.ccd` 解析；
  - [raw-sector.ts](../../src/original-data/disc/raw-sector.ts)：MODE1 原始扇区头部校验；
  - [iso9660-record.ts](../../src/original-data/disc/iso9660-record.ts)、[iso9660-volume.ts](../../src/original-data/disc/iso9660-volume.ts)、[iso9660-directory.ts](../../src/original-data/disc/iso9660-directory.ts)：目录记录、卷描述符与路径解析；
  - [disc-path.ts](../../src/original-data/disc/disc-path.ts)：与来源映射共用的 `DiscPath` 规则；
  - [file-range.ts](../../src/original-data/disc/file-range.ts)：分段范围读取。
- **平台适配：** [platform/files/blob-byte-source.ts](../../src/platform/files/blob-byte-source.ts) 的 `BlobByteSource` 用 `Blob.slice` 与 `arrayBuffer()` 实现端口，页面与 Worker 中的 `File` 都适用。越界请求在切片前拒绝；Blob 读取不可中止，取消由读取方保证不再发出、也不发布结果。Node 侧的端口实现是 [tools/node-byte-source.ts](../../tools/node-byte-source.ts)，本地核对 CLI 是 [tools/disc-check.ts](../../tools/disc-check.ts)，用法见[工具指南](../guides/tools.md#光盘镜像核对)。
- **测试数据：** 合成 CloneCD 描述、原始扇区、卷描述符与目录由 [synthetic.ts](../../src/original-data/synthetic.ts) 生成，按需生成扇区的镜像端口不分配整盘；光盘测试共用的纯辅助在 [disc.test-support.ts](../../src/original-data/disc/disc.test-support.ts)。

针对性检查为 `pnpm exec vitest run src/original-data src/platform/files tools/engineering-boundaries.test.ts`。

### 封包读取

[P2-03](../plan/p2/03/spec.md) 校验 IMFAT（`.NOB`）封包。支持的格式、限值、错误码与报错优先级以 spec 为准，格式事实见 [imfat](../original/formats/imfat.md)：

- **结构规则：** [archive/imfat-rules.ts](../../src/original-data/archive/imfat-rules.ts) 是内存解析与按需读取共用的纯规则：
  - `readImfatHeader` 校验文件头，条目数超过 `MAX_ARCHIVE_ENTRIES`（4,096）时在读取目录前拒绝；
  - `readImfatDirectory` 校验整个目录：保留字、类型标签、递增 ID、块大小（`MAX_ENTRY_BYTES`，4 MiB）、重定位个数，以及无空隙、无尾随字节的连续布局；
  - `readImfatRelocations` 校验条目的重定位位置与存储的指针，允许非对齐与无序位置，拒绝重叠。
  - 目录项类型 `ImfatEntry` 定义在这里，[imfat.ts](../../src/original-data/imfat.ts) 原样再导出。
- **按需读取：** [archive/archive-reader.ts](../../src/original-data/archive/archive-reader.ts) 的 `openImfatArchive(file)` 在 P2-02 的任意 `DiscFile` 上打开封包：
  - 先读 24 字节文件头；条目数超限时，在读取目录前拒绝；再用一次范围读取取得整个目录。
  - 返回冻结句柄：`path`、按 ID 升序的冻结目录项、同步的 `entry(id, type?)`、异步的 `read(id, type?)`。
  - `read` 用一次范围读取取得数据块与重定位表并校验重定位，返回冻结的 `{ entry, bytes, relocations }`；`bytes` 恰为数据块，是独占的新缓冲。
  - 句柄只保留目录，不缓存字节，每次读取都经镜像句柄计量、检查取消；`DiscReadError` 原样传递。
  - 参数非法时返回 `invalid-request`，ID 不存在返回 `entry-not-found`，类型不符返回 `entry-type-mismatch`。
  - 它可以打开未经版本识别的文件，属于底层能力；产品代码经已验证来源打开封包，边界见[工程约定](./README.md#lint-规则eslintconfigjs)。
- **内存解析：** [imfat.ts](../../src/original-data/imfat.ts) 的 `parseImfat`、`entryData`、`entryRelocations` 供研究工具与测试使用，规则与错误同上；辅助函数只接受从同一字节数组解析出的条目。
- **错误：** 失败都抛出 [source-error.ts](../../src/original-data/source-error.ts) 的 `SourceError`。它的 `toData()` 与 P2-02 的 DTO 形状相同，位置形如 `archive[:/路径]`，可后接 `[i]`、`#ID` 或 `#ID.relocations[k]`，只回显通过语法规则的类型标签。转换器追加的 code 与限值名见[原版格式转换](#原版格式转换)。P2-03 的全部位置都属于 spec 的封闭语法；[source-error.test-support.ts](../../src/original-data/source-error.test-support.ts) 的 `inLocationGrammar` 按 spec 定义该语法（光盘路径部分复用 `isDiscPath`），各模块测试的失败辅助逐个核对。
- **测试数据：** [archive.test-support.ts](../../src/original-data/archive/archive.test-support.ts) 提供共用的正负样本表，内存解析与按需读取用同一张表核对一致性。[disc.test-support.ts](../../src/original-data/disc/disc.test-support.ts) 的 `syntheticFileDisc` 按光盘路径放置任意文件（字节或按需生成的内容），生成完整的合成 ISO9660 树，并可调整文件位置与 `.ccd` 行尾。

### 版本识别与已验证来源

[P2-03](../plan/p2/03/spec.md) 按文件白名单识别基准版本，覆盖范围与指纹算法以 spec 为准：

- **白名单：** [source/source-catalog.ts](../../src/original-data/source/source-catalog.ts) 的 `readSourceCatalog` 严格读取 `{ versionId, files }`：
  - 版本 token 为小写；
  - 文件按 ASCII 路径序严格升序，每项为 `{ path, byteLength, sha256 }`；
  - 非法时在结构路径返回 `invalid-catalog`，不回显值；文件列表缺失、不是数组或为空时，位置为 `catalog`。

  `PRODUCTION_CATALOG` 是唯一的生产白名单（`star-rangers-1995-cd`，8 个文件）。[tools/source-catalog.test.ts](../../tools/source-catalog.test.ts) 核对它与 [manifest](../original/manifest.md#游戏文件光盘-main-与-flics) 一致。
- **指纹：** `sourceFingerprint(catalog)` 对规范 ASCII 文本计算 SHA-256，返回 `source:sha256:<hex>`；版本 ID 不参与。生产指纹由测试固定。指纹字符串只表示形状，来源证明来自对实际文件的识别。
- **识别：** [source/identify-source.ts](../../src/original-data/source/identify-source.ts) 的 `identifySource(disc, catalog)` 在已打开的 P2-02 镜像上识别：
  - 先按路径序核对每个覆盖文件存在且大小一致：P2-02 的 `path-not-found`、`wrong-entry-kind`，目录，以及大小不符，都报 `unsupported-version`，位置为 `file:/路径`；
  - 再按路径序从偏移 0 起分段（每段最多 `HASH_SEGMENT_BYTES`，即 4 MiB）计算 SHA-256，用完即丢；不符时同样报 `unsupported-version`，之后的文件不再读取；
  - 白名单之外的文件从不查找或读取；
  - 光盘层错误（坏扇区、预算、取消）原样传递。
  - 它接受任意白名单，属于底层能力。
- **已验证来源：** 识别成功返回冻结的 `VerifiedSource`：
  - `identity` 为冻结、可结构化克隆的 `{ versionId, fingerprint, files }`；
  - `openFile(path)`、`openArchive(path)` 只接受覆盖路径，其他合法路径报 `path-not-covered`，非法路径报 `invalid-request`，都不发生读取；
  - `usage()` 与镜像句柄共用计量。
- **产品入口：** [source/open-verified-source.ts](../../src/original-data/source/open-verified-source.ts) 的 `openVerifiedSource(files, options)` 先用 `openDiscImage` 打开文件组，再固定用 `PRODUCTION_CATALOG` 识别，不接受自定义白名单；同时导出产品需要的类型。P2-04 起，产品代码只经它取得原版字节。
  - 默认 `sourceReadBytes` 上限等于输入总量；基准盘约 174 MB，识别约读取 17 MB 原始扇区，余量留给后续转换。
- **映射核验：** `verifySourceMappings(table, source)` 先用 `readSourceMappingTable` 读取映射表（P2-01 错误保留原 code/path）；表已绑定其他指纹时，在 `sources.sourceFingerprint` 报 `fingerprint-mismatch`。之后：
  - 按映射、部件、备选的顺序读取每个 locator 的条目：路径须在覆盖范围内，封包能打开，条目存在且类型一致，重定位有效。大于 u32 的 ID 报 `entry-not-found`。本任务产生的错误都改用 `sources.mappings[i].parts[j].alternatives[k]` 为位置，不回显 locator 值；`DiscReadError` 原样传递。
  - 精确等价的备选须与第一个备选的 `flags`、大小、重定位个数、块字节和重定位位置都相同，否则报 `alternatives-differ`。
  - 返回绑定本来源指纹的新冻结表：条目级映射为 `verified`；含子资源 locator 的映射一律为 `declared`，由理解该 payload 的转换任务核验。
  - 每个封包的目录在一次核验中只读一次，条目字节不跨部件保留；首个错误终止核验，不修改输入。
  - 可选的第三个参数 `readEntry`（`EntryReader` 类型）替换模块内部的默认读取，供转换步骤让核验与转换共用条目读取（P2-05）；错误位置的改写、等价备选核对与结果都不变。公开模块只导出这个类型，不导出读取封包的函数。
- **测试数据：** [source.test-support.ts](../../src/original-data/source/source.test-support.ts) 的 `catalogFor` 按合成文件内容生成白名单，`syntheticVerifiedSource(files)` 用该白名单识别含这些文件与 1 MiB 不读取填充的合成光盘。[source-error.test-support.ts](../../src/original-data/source-error.test-support.ts) 的 `sourceFailure(action, hidden)` 等待 `SourceError`，核对位置语法与隐私后返回不含原因的诊断。

### 图形转换

[P2-05](../plan/p2/05/spec.md) 把原版的调色板、图像记录与字体转换为[图形 payload](#图形-payload)。`original-data/conversion/` 不属于任何能力族，只处理已读取的条目字节，封包经已验证来源取得（见[工程约定](./README.md#lint-规则eslintconfigjs)）。

- **源结构读取：** [source-graphics.ts](../../src/original-data/conversion/source-graphics.ts)（[P2-05/03](../plan/p2/05/subtasks/03-source-hardening.md)）是 DATA、36 字节图像记录、MFDD 记录列表与点阵字体表的唯一读取实现，格式见 [textures](../original/formats/textures.md)、[cockpit](../original/formats/cockpit.md) 与 [hud](../original/formats/hud.md)。
  - `readDataPalette` 要求恰为 768 字节且分量不大于 63（不截断高位），按位复制展开为 8 位 RGB。
  - `readImageRecordHeader(block, offset)` 只读 36 字节头，依次校验位深为 8、+16 为 0、编码为 0 或 2（其余为 `unsupported-encoding`）、宽高与嵌入调色板条目数在 `GRAPHICS_LIMITS` 内（`limit-exceeded`，带限值名与观察值），以及调色板与像素范围在块内（不溢出的比较）。不按声明的规模分配，65535×65535 的头部只凭字段即被拒绝。
  - `decodeImageRecord(block, offset)` 与 `readEmbeddedPalette(block, offset)` 自己从块中重新读取并校验记录头，不接受调用者传入的头部，之后才分配：raw 要求数据恰为宽 × 高并复制；精灵 RLE 拒绝截断、越行与尾随字节，输出透明像素为 0 的索引与规范打包掩码。行序保持存储顺序。嵌入调色板按 BGR 读为 RGB，没有时为 `subresource-not-found`。调用者可先用 `readImageRecordHeader` 取得尺寸扣除预算，再解码。
  - `checkPaletteIndices(image, entryCount)` 拒绝索引不小于调色板条目数的不透明像素（`palette-index-out-of-range@…pixels`），透明像素不参与；转换器与 `tools/nob-check.ts` 共用它。
  - `readMfdRecordOffsets` 返回两个列表中记录的块内偏移：每个列表须整体落在块内（`invalid-payload`），再要求不超过 16 个记录（`limit-exceeded`，`mfdRecords`）。`mfdRecordOffset(block, l, i)` 是 `lists/<l>/records/<i>` 子资源的定位，l 只接受 0、1，列表或序号越界都为 `subresource-not-found@…record`。
  - **CCKD 分组（[P2-07/03](../plan/p2/07/subtasks/03-container-records.md)）：** `readCockpitGroups` 读取头部 +0x08 的目录 {指针, 数量}。依次检查：
    - 目录项 1–8 个（`cockpitSlots`）且整体在块内（`invalid-payload@…groups`）；
    - 每个 slot 的元素数 0–16（`cockpitElements`），非空 slot 的 52 字节元素数组在块内；空 slot 的指针不寻址任何字节，不检查；
    - 每个元素的 +44、+48 只能为 0 或 1，否则为 `invalid-payload@…elements`。

    计数都在读取或遍历它们决定的规模之前检查。结果按目录顺序给出每个 slot 的冻结元素数组，每项为 `{ recordOffset, x, y }`：`recordOffset` 是元素开头图像记录的块内偏移，x、y 取自 +36、+40 的有符号 32 位整数。目录项的其余字段不解释。
  - **CCKD 子资源：** `readCockpitGroup(block, s)` 对应 `groups/<s>`，空 slot 或序号越界为 `subresource-not-found@…groups`；`cockpitElementRecordOffset(block, s, i)` 对应 `groups/<s>/elements/<i>`，元素序号越界为 `subresource-not-found@…elements`。`readCockpitGroupPalette(block, s)`（[P2-07/18](../plan/p2/07/subtasks/18-cockpit-group-palette.md)）对应 `groups/<s>/palette`：先按上述规则读取目录，slot 越界为 `subresource-not-found@…groups`，目录项 +0x04 为 0 为 `subresource-not-found@…palette`；+0x08 不为 768 或指针越出块为 `invalid-payload@…palette`；768 字节交给 `readDataPalette`，结果与同样字节作为 DATA 整条目相同。
  - **TABL 图像列表（[P2-07/06](../plan/p2/07/subtasks/06-table-records.md)）：** `readTableRecordOffsets` 只接受 [hud §2](../original/formats/hud.md#tabl-image-lists-confirmed-structure) 记录为已确认的结构。依次检查：
    - 没有头部，记录从 0 起紧密排列；
    - 记录数为记录 0 的像素偏移除以 36，须为 1–64（`tableRecords`），在读取其余记录之前判定；
    - 每个记录都是不带嵌入调色板的 raw 记录，数据恰为宽 × 高字节（否则为 `invalid-payload@…pixels`，不必解码）；
    - 像素数据按记录顺序、无空隙地恰好占满其余部分。

    其他任何形态都是 `invalid-payload@…record`，记录头自身的问题沿用 P2-05 的位置。`tableRecordOffset(block, i)` 对应 `records/<i>`，越界为 `subresource-not-found@…record`。这些记录没有嵌入调色板，因此 `records/<i>/palette` 总是 `subresource-not-found@…palette`。
  - **容器内记录：** CCKD 元素、MFDD 与 TABL 的记录都用记录偏移交给 `decodeImageRecord`、`readEmbeddedPalette`，结果与把同一记录放在偏移 0 时相同。上述四项计数上限以 `CONTAINER_LIMITS` 导出。
  - `readFontTable` 要求头部首字节为 0、单元宽与高为 1–8（`limit-exceeded`）、表长恰为 `4 + 256 × 高`，字形字节逐位复制、不切分（每字形行数由声明给出）。CCKD 字体目录须恰为 3 项且都在块内：`readCockpitFonts` 按目录顺序读取全部 3 个字库，`readCockpitFont(block, i)` 只读取 `fonts/<i>`，i 不在 0–2 时为 `subresource-not-found`。
  - 结果都在调用者独占的新缓冲中，可直接交给 `payloadTransferList`。失败抛出 `SourceError`，位置是调用者 `path` 下的字段名：`palette`、`record`、`pixels`、`glyphs`、`fonts`、`groups` 或 `elements`，不含条目编号、偏移或字节。
- **转换声明：** [graphics-declarations.ts](../../src/original-data/conversion/graphics-declarations.ts)（[P2-05/04](../plan/p2/05/subtasks/04-graphics-conversion.md)）的 `readGraphicsDeclarations` 严格读取一组声明（字段见 [spec](../plan/p2/05/spec.md#图形转换声明)）：`asset` 为 palette/image/font 且组内 ID 唯一，`role` 与 `group` 按 P2-01 规则读取且该组拥有此 kind；图像的 `palette` 与 nearest 目标都须是同一组声明中同组的调色板，`alpha` 为 `encoding` 或 `{ colourKey }`，`rowOrder` 为 `stored`/`reversed`；字体有预期 `cell`、每字形行数 `glyphRows`（`cell.height`–8，且整除 256 × `cell.height`，字形数为二者之商，由 `declaredGlyphCount` 给出）与按码位互不重叠、字形小于字形数的 `charMap` 区间。它复用 content 的严格读取原语，任何问题都转为 `invalid-declaration`，位置为 `graphics.declarations[<i>]` 加字段路径。[P2-07/04](../plan/p2/07/subtasks/04-layout-conversion.md) 加入布局声明（字段见 [P2-07 spec](../plan/p2/07/spec.md#布局转换声明)）：`frame` 的宽 1–640、高 1–480，`elements` 为 1–16 个互不相同的 image ID，按存储顺序排列，每个都须是同一声明组、同一资源组中的图像声明。
- **转换器：** [convert-graphics.ts](../../src/original-data/conversion/convert-graphics.ts) 的 `convertGraphics(declarations, sources, limits, usage)` 先读取声明，再按 Asset ID 取得已读入的源块：
  - 来源类型为 `data-palette`、`embedded-palette`（记录的嵌入调色板）、`cockpit-group-palette`（`groups/<s>/palette`）、`image-record`、`cockpit-font`（`fonts/<i>`）或 `cockpit-group`（`groups/<s>`）；DATA 整条目与分组调色板都在读取之前按 256 项扣除，嵌入调色板按记录头的条目数扣除；来源与 kind 不符、缺少来源都是 `invalid-declaration`；
  - 记录类来源可带 `RecordSelector`：CCKD 元素 `{ slot, index }`、MFDD 记录 `{ list, index }` 或 TABL 记录 `{ index }`，没有时为偏移 0 的整条目记录。转换时经 `cockpitElementRecordOffset`、`mfdRecordOffset`、`tableRecordOffset` 得到记录偏移，此后的读取、解码与检查与整条目相同；
  - 依次转换调色板、图像、字体与布局，同类按 ID 排序。
  - 每个 Asset 在读取或分配之前，用 `chargeBudget` 扣除由记录头或声明推得的 `assets`、`dependencyEdges`、`paletteEntries`、`imagePixels`、`glyphs` 与 `payloadBytes`（`palettePayloadLength`、`imagePayloadLength`、`fontPayloadLength` 与编码器共用同一公式）。被拒绝时报 `budget-exceeded`，限值名为维度，总量超出安全整数时 `observed` 为 null；调用者的用量不变。转换用量不扣 `sourceReadBytes`。
  - 颜色键只用于 raw 图像（否则为 `invalid-declaration@…alpha`），值为 k 的像素变为透明；不透明像素的索引不小于所绑定调色板（同组声明的转换结果）的条目数时为 `palette-index-out-of-range@…pixels`；`reversed` 恰好反转索引与掩码的行序。字体按声明的 `cell` 扣除，实际单元不符为 `geometry-mismatch@…glyphs`，`charMap` 区间展开为按码位升序的条目。
  - **布局（P2-07）：** 用 `readCockpitGroup` 读取分组。元素数与声明不符报 `geometry-mismatch@…elements`；元素坐标为负，或按其记录头的图像尺寸越出声明的画幅，报 `geometry-mismatch@…elements[<i>].x|y`。声明的第 i 个图像与第 i 个存储元素配对。之后扣除 `assets` 1、`dependencyEdges` 为元素数、`payloadBytes` 为 `layoutPayloadLength`，再编码；预算拒绝位于 `…elements`。
  - 结果是按 ID 升序的冻结 `{ descriptor, payload }`：描述符经 `readAssetDescriptor` 生成，依赖为图像引用的调色板（`imagePalettes`），或布局的元素图像（`layoutImages`，kind 为 `image`）；`payloadIdentity` 由实际字节计算；payload 独占缓冲。源结构读取的位置都带上 `graphics[<Asset ID>]` 前缀；任一失败使整组转换失败，不返回部分结果。
- **转换步骤：** [graphics-step.ts](../../src/original-data/conversion/graphics-step.ts)（[P2-05/05](../plan/p2/05/subtasks/05-graphics-step.md)）的 `runGraphicsStep(source, mappings, declarations, limits, usage)`：
  - **共用读取：** [step-entry-reader.ts](../../src/original-data/conversion/step-entry-reader.ts) 的 `stepEntryReader(source, beforeRead?)` 经 `VerifiedSource.openArchive` 读取，以（光盘路径、条目类型、条目 ID）为键缓存一次步骤内的读取结果，大于 u32 的 ID 与核验一样报 `entry-not-found`。映射核验与转换共用它，同一条目只物理读取一次；缓存随步骤结束释放，没有跨步骤或通用的封包缓存。可选的 `beforeRead` 在读取字节之前收到目录项，供步骤按声明大小拒绝条目（逻辑步骤用它检查条目大小）。
  - **配对与子资源：** 先用共用读取核验映射表，再要求每个声明都有映射、每个映射都有声明（否则为 `invalid-declaration`，位置为 `graphics.declarations[<i>]` 或 `graphics.declarations`）。每个映射只能有一个部件，取第一个等价备选。子资源的序号都是不带前导零的十进制，越界由读取报 `subresource-not-found`：
    - DATA 整条目为调色板；TEX/BITM 整条目为图像，其 `palette` 为嵌入调色板；
    - CCKD 的 `fonts/<i>` 为字库，`groups/<s>` 为布局，`groups/<s>/palette` 为分组调色板，`groups/<s>/elements/<i>` 为图像；
    - MFDD 的 `lists/<l>/records/<i>` 与 TABL 的 `records/<i>` 为图像；
    - 任一容器记录路径后接 `/palette` 为该记录的嵌入调色板。

    其他组合为 `invalid-declaration@graphics[<ID>].palette|record|fonts|groups`。之后要求每个布局的第 i 个元素图像恰好映射到同一封包、同一 CCKD 条目、同一 slot 的 `groups/<s>/elements/<i>`，否则为 `invalid-declaration@graphics[<布局 ID>].elements[<i>]`。
  - **结果：** 转换成功后才把全部映射（含子资源）置为 `verified`，再用 `assetSourceStates` 得到不带定位的状态。返回冻结的 `{ groups, usage }`：`groups` 只含有 Asset 的组，按 `RESOURCE_GROUPS` 排列，每组的 `descriptors`、`payloads`、`sources` 按 ID 升序一一对应；`usage` 是转换用量。任一失败都抛出且没有结果；读取错误保持 P2-02/P2-03 的层、code 与位置，已发出的读取仍计入已验证来源的 `sourceReadBytes`。
  - **组草稿（[P2-07/13](../plan/p2/07/subtasks/13-group-assembly.md)）：** `stepGroupDraft(group, results, sourceFingerprint)` 把若干步骤结果（形状同 `GraphicsStepResult`）中该组的分区按 Asset ID 升序合并为一个冻结的 `GroupDraft`，不重新转换，payload 保持原字节视图；来源状态绑定给定的来源指纹。重复的 Asset ID 以内容层的 `duplicate-asset` 拒绝，路径为 `<组>.assets` 等；没有该组的分区时得到空组。作业用它装配 `cockpit-hud-map` 组，`modelsGroupDraft` 是它在 `models` 组上的包装。
- **生产图形：** [production-graphics.ts](../../src/original-data/conversion/production-graphics.ts)（[P2-05/06](../plan/p2/05/subtasks/06-production-graphics.md)）导出生产图形的声明、映射与预算份额（P2-05 的调色板与字库、P2-06 的切片贴图、P2-07 的驾驶舱、HUD 与地图 Asset）：
  - `PRODUCTION_GRAPHICS_DECLARATIONS`：`palette/flight/models` 与 `palette/flight/cockpit-hud-map`（角色 `flight-palette`，各在本组），`font/hud/8x8-1`、`font/hud/8x8-2`、`font/hud/4x6`（角色 `font`，`cockpit-hud-map`，单元 8×8、8×8、4×6，每字形行数都为 8，4×6 因此为 192 个字形）。字符映射是 [hud §1.1](../original/formats/hud.md#11-glyph-layout-and-character-maps-likely) 记录的同号区间（[P2-05/12](../plan/p2/05/subtasks/12-character-map-research.md)）：8x8-1 为 0x20–0x7a 与 0x7c–0x7e，8x8-2 为 0x20–0x7e，4x6 为 0x20、0x25、0x27–0x3f 与 0x41–0x5d。
  - `PRODUCTION_GRAPHICS_MAPPINGS`：两个调色板共用 `MAIN/SR.NOB` 唯一 DATA 条目的整条目定位（confirmed，textures §1）；三个字库指向 HI 完整驾驶舱组 CCKD 的 `fonts/0`、`fonts/1`、`fonts/2`（likely，U-029 与 U-030；cockpit §1、hud §1 与 §1.1）。条目 ID 与序号来自本地结构核对，只存在于 `original-data`；表的来源指纹为 null，由作业核验时绑定。
  - **切片贴图（[P2-06/04](../plan/p2/06/subtasks/04-slice-textures.md)）：** [production-model-textures.ts](../../src/original-data/conversion/production-model-textures.ts) 的 `PRODUCTION_MODEL_TEXTURES` 是只追加的生产贴图表：15 行，每行为 `MAIN/SR.NOB` 的 TEX 条目号与是否用到[歧义条目](../original/formats/textures.md#nearest-colour-metric-and-tie-rule-unconfirmed)。初始行按“模型 Asset ID 升序、列表 0–2、部件顺序”的首次引用编号，覆盖 5 个切片机型模型全部三个列表引用的 TEX。第 i 行的序号 `<nn>` 为 i + 1 的两位数字，同时用于 `image/model-texture/<nn>` 与 `palette/model-texture/<nn>`（`modelTextureImageId`、`modelTexturePaletteId`）；`PRODUCTION_TEXTURE_REFERENCES` 把 TEX 条目号映射到 image ID，是模型转换器解析部件贴图的唯一途径。重排或删除行会改变 Asset ID，须递增转换器版本。
    - **声明：** 每行一个 `palette/model-texture/<nn>`（角色 `texture-palette`）与一个 `image/model-texture/<nn>`（角色 `model-texture`），都在 `models` 组；图像绑定同序号的调色板，显示映射为 `{ nearest: 'palette/flight/models' }`，透明按编码，行序按存储。
    - **映射：** 调色板为该 TEX 的 `palette` 子资源，confirmed；图像为 TEX 整条目，带 U-028，置信度为 likely，用到歧义条目的 8 行为 unconfirmed，在研究解除歧义之前使 `models` 组不完整。证据指向 [textures §3](../original/formats/textures.md#3-tex-textures-confirmed) 与最近色一节。
    - **份额：** `PRODUCTION_MODEL_TEXTURE_SHARE` 为 `assets` 40、`dependencyEdges` 64、`paletteEntries` 1,024、`imagePixels` 524,288、`payloadBytes` 655,360（份额内全部 Asset 都按最长 ID 的图像、掩码与满额调色板计算的上界不超过它），为研究可能追加的 Asset 留有余量。
  - **驾驶舱、HUD 与地图（[P2-07/12](../plan/p2/07/subtasks/12-production-cockpit-hud.md)）：** 按 [P2-07 spec 的生产 Asset 表](../plan/p2/07/spec.md#生产-asset-与来源)声明 86 个 `cockpit-hud-map` 组 Asset（2 个布局、83 个图像、1 个调色板），全部来自 `MAIN/SR.NOB`。图像都为 `display: 'direct'`、`rowOrder: 'stored'`；`<i>` 是记录在完整来源列表中的序号，不补零。
    - `layout/cockpit/front`（`front-cockpit`，画幅 640×480，元素为 `image/cockpit/front/element-0`–`3`）映射 CCKD 10103 的 `groups/0`，元素图像（`cockpit-element`，飞行调色板 `palette/flight/cockpit-hud-map`，透明按编码）映射 `groups/0/elements/<i>`：likely，U-029，证据为 [cockpit R1](../original/formats/cockpit.md#front-cockpit-source-r1) 与[分组调色板与绘制](../original/formats/cockpit.md#group-palette-and-drawing-confirmed)。
    - `layout/map/frame`（`strategic-map`，640×480，元素 `image/map/frame/element-0`–`3`）映射 `groups/2`，元素图像（`map-frame-element`，调色板 `palette/map/screen`，透明按编码）映射 `groups/2/elements/<i>`，`palette/map/screen`（`map-palette`）映射 `groups/2/palette`：都为 confirmed，U-029，证据为分组调色板与绘制一节。
    - `hud-mfd`：`image/hud/status-display/background-0`–`2`（MFDD 10473 `lists/0/records/<i>`，透明按编码）与 `overlay-0`–`8`（`lists/1/records/<i>`，颜色键 0）、`image/hud/display-page/background`（BITM 10467 整条目，透明按编码）、`image/hud/gauge-bar-1/0`–`3`（TABL 10479 `records/<i>`，颜色键 0），都用飞行调色板。`strategic-map`：`image/map/unit-marker/0`–`28`（TABL 10461）与 `image/map/zoom-icon/0`–`28`（TABL 11401），都为 `records/<i>`、地图调色板与颜色键 0。这些映射都为 confirmed，U-030，证据为 hud 的[绘制路径](../original/formats/hud.md#hud-and-map-drawing-paths-confirmed-exe)与[画面覆盖和图像族](../original/formats/hud.md#slice-screen-coverage-and-hud-image-families-r3-r4-r6)两节，MFDD 另加 [cockpit §2](../original/formats/cockpit.md#2-mfdd-multi-function-display-images-confirmed-structure)，TABL 另加[图像列表结构](../original/formats/hud.md#tabl-image-lists-confirmed-structure)，放大窗口图标再加 [R8](../original/formats/hud.md#zoom-window-icons-by-craft-type-r8)。
    - 没有 `unconfirmed` 映射，因此在已识别的来源上该组可以完整；元素数（4 与 4）与记录数（3 + 9、4、29、29）由声明断言，与本地结构核对一致。
    - **份额：** `PRODUCTION_COCKPIT_HUD_MAP_SHARE` 为 `assets` 96、`dependencyEdges` 192、`imagePixels` 524,288、`paletteEntries` 1,024、`glyphs` 0、`payloadBytes` 786,432，其余维度为 0；它是全部候选 Asset 的上界，不是精确用量。
  - `PRODUCTION_GRAPHICS_SHARE`：P2-05 的份额（`assets` 5、`paletteEntries` 512、`glyphs` 768、`payloadBytes` 16,384；按结构上限与头部算出的上界不超过它，实际字形用量为 256 + 256 + 192）、切片贴图份额与 P2-07 份额之和，即 `assets` 141、`dependencyEdges` 256、`paletteEntries` 2,560、`glyphs` 768、`imagePixels` 1,048,576、`payloadBytes` 1,458,176，其余维度为 0；源读取沿用 P2-02 的默认限值，不另加份额。作业的限值组合不变：读取限值加图形、逻辑与模型份额。
  - [production-graphics.test-support.ts](../../src/original-data/conversion/production-graphics.test-support.ts) 按生产映射的定位生成合成封包，供 Node、作业与浏览器测试使用：DATA；`productionCockpitBlock(fonts)` 生成的 CCKD（3 个字库，slot 0 为 4 个前视元素、slot 1 为空、slot 2 为 4 个地图边框元素与分组调色板，元素都在 640×480 画幅内，有的贴住右缘与下缘）；每个生产贴图条目处由条目号决定内容的 4×2 raw 贴图 `syntheticTexture`；3 + 9 个记录的 MFDD、一个 BITM 图像，以及 4、29、29 个记录的 TABL 图像列表。各记录很小，内容随列表与条目不同。`MODEL_TEXTURE_USAGE` 与 `COCKPIT_HUD_MAP_USAGE` 是贴图与 P2-07 Asset 的期望转换用量，`PRODUCTION_LAYOUT_POSITIONS` 是两个合成布局的元素位置。
- **错误扩展：** [source-error.ts](../../src/original-data/source-error.ts) 的 code 追加 `invalid-payload`、`unsupported-encoding`、`budget-exceeded`、`palette-index-out-of-range`、`subresource-not-found`、`invalid-declaration`、`geometry-mismatch`；限值名追加 `imageWidth`、`imageHeight`、`paletteEntryCount`、`fontCellWidth`、`fontHeight` 与 P2-01 的预算维度；`observed` 允许为 null，只用于超出安全整数的预算总量。P2-03 已有 code 与限值的含义不变。P2-07 不新增 code，只追加限值名 `cockpitSlots`、`cockpitElements`、`mfdRecords` 与 `tableRecords`。
- [payloads.ts](../../src/original-data/payloads.ts) 只保留 ID 列表的研究用解析器 `parseIdList` 与 `PayloadError`；图像、调色板与字体由上述源读取处理，MESH 与 MODL 由 `formats/mesh.ts`、`formats/modl.ts` 处理（见[原版格式转换](#原版格式转换)）。

合成样本、声明、封包与映射由 [conversion.test-support.ts](../../src/original-data/conversion/conversion.test-support.ts) 在代码中生成；其中 `inGraphicsLocationGrammar` 按 spec 定义转换错误的位置语法（声明组 `graphics.declarations`、声明字段路径或 `graphics[<ID>].<字段>`，P2-07 加入 `groups`、`elements`、`elements[<i>]` 与 `elements[<i>].x|y`）；`cockpitLayoutBlock`、`mfdBlock` 与 `tableBlock` 按 cockpit 与 hud 记录的结构生成带分组、元素、两个记录列表或无头部图像列表的合成容器，记录数据的指针相对条目块；`expectSourceError` 对 `graphics` 开头的位置逐个核对。针对性检查为 `pnpm exec vitest run src/original-data/conversion`。

### 原版格式转换

[P2-08](../plan/p2/08/spec.md) 的 SND 转换分为两处：`original-data/formats/` 放单一格式的解析与转换，`original-data/conversion/` 放音频组转换流程与共用的转换预算、生产 `ConverterVersion`。它们属于[底层能力边界](./README.md#lint-规则eslintconfigjs)中的“其他使用者”，原版字节只经产品入口与 `verifySourceMappings` 取得。

- **转换错误：** 与 P2-05、P2-09 一致，转换失败扩展 P2-03 的 `SourceError`，经 `source` 层传递，不另设错误层（[P2-08/14](../plan/p2/08/subtasks/14-shared-mechanism-alignment.md)）。
  - **追加 code：** `invalid-payload`（源条目违反其格式，与 P2-05 共用）与 `unsupported-payload`（格式合法，但取值不在生产规则内）；转换预算超限沿用 P2-05 已落地的 `budget-exceeded`。
  - **限值：** 预算超限的 `limit.name` 为 P2-01 预算维度（P2-05 已把全部维度加入 `SourceLimitName`）；只有预算总量超出安全整数时，`observed` 为 null。P2-03 已有 code 与限值的含义不变。
  - **位置：** 映射路径后接字段名（如 `.size`、`.flags`），属于 `inLocationGrammar` 的扩展语法。`reason` 为固定文本，不含字节、宿主路径或宿主错误文本。
- **SND：** [formats/snd.ts](../../src/original-data/formats/snd.ts)（[P2-08/03](../plan/p2/08/subtasks/03-snd-parser.md)，格式见 [audio §1](../original/formats/audio.md#1-snd-digital-sound-effects-confirmed-on-all-37-entries)）。
  - **结构：** `readSndHeader(block, location)` 只核对结构：块至少 20 字节（`SND_HEADER_BYTES`）、恰有一个位于 0 的重定位且该处指针为 20、声明的样本字节数等于块大小减 20。不符时为 `invalid-payload`，位置为 `location` 加 `.size`、`.relocations`、`.sampleOffset` 或 `.sampleBytes`。结果是未按规则核对的原始头部字段 `{ sampleRate, bitsPerSample, flags, sampleBytes }`。
  - **规则：** `SndFormatRules` 是转换器接受的采样解释：`flags` 列出研究已确认的取值及各自的声道数与循环方式，`s16le` 表示 16 位样本是否已确认为有符号小端。规则之外的取值一律拒绝，不猜测默认值。生产规则由 P2-08 的生产音效模块提供。
  - **转换：** `convertSnd(block, rules, location)` 在结构核对之后依次核对：位宽为 8，或在规则接受时为 16；采样率为 8,000–44,100 Hz（`SND_SAMPLE_RATE_RANGE`）；`flags` 在规则内。这三项不符时为 `unsupported-payload`。最后核对样本字节数为帧大小的正整数倍，不符为 `invalid-payload`；帧大小取决于 `flags` 给出的声道数，所以这一项放在最后。全部通过后，用 `writeSoundPayload` 把样本原样复制为新的独占 payload，同时返回采样点数（帧数 × 声道数）。块视图不被修改，所有检查通过之前不分配缓冲。
- **MESH 与 MODL：** [formats/mesh.ts](../../src/original-data/formats/mesh.ts) 与 [formats/modl.ts](../../src/original-data/formats/modl.ts)（[P2-06/02](../plan/p2/06/subtasks/02-source-mesh-modl.md)，格式见 [mesh](../original/formats/mesh.md)）是这两种条目唯一的源结构读取，导入转换与 nob-check 共用。它们只接收已读入的块，失败位置恰为调用者给出的 `path`（转换器传入 `models[<Asset ID>].model` 或 `….parts[<l>][<p>].mesh`），不附加条目编号或偏移；`reason` 为固定的可打印 ASCII 文本。
  - **MESH 计数：** `readMeshCounts(block, path)` 依次核对结构指针为 12、结构长度等于块长 − 12、保留字为 0，然后只读取顶点数与三角形数：为 0 或超过 `MODEL_LIMITS`（4,096）时报 `limit-exceeded`（`meshVertices`、`meshTriangles`，带 `observed`），之后才计算其他位置；最后要求块长恰为 28 + 32 × 顶点数 + 28 × 三角形数。转换器据此在分配之前扣除 `vertices` 与 `triangles`。
  - **MESH 读取：** `readMesh(block, path)` 在计数之后核对着色槽数为 1 至 3 × 三角形数、位置/UV/法线全部有限、每个面恰为 3 个角、顶点与着色槽索引在范围内、尾字为 0，返回冻结的 `ModelGeometry`（`content/models` 的类型）：数组都是新缓冲，浮点逐位保留（含负零与次正规数，不像 `PayloadBlock.f32` 那样把 −0 规范化），三角形顺序与绕序按存储，允许未用顶点。
  - **MODL 读取：** `readModel(block, path)` 先核对头部完整、列表按 0、1、2 的顺序紧接头部连续存放（非空列表的指针等于前面列表之后的位置，空列表的指针为 0）且计数不越出块，再核对部件总数为 1–256（否则 `limit-exceeded`，`modelParts`）、块长恰为 44 + 28 × 部件总数，最后逐个部件核对保留字段为 0、颜色分量不大于 255。返回冻结的 `{ partLists, soundEntries }`：部件为 `{ sourceFlags, colour, meshEntry, textureEntry }`（无贴图为 0），音效槽为 5 个 SND 条目号（空槽为 0）；条目号不在这里解析。
  - **错误：** 除计数的 `limit-exceeded` 外，结构不符一律为 `invalid-payload`。[source-error.ts](../../src/original-data/source-error.ts) 的限值名为此追加 `meshVertices`、`meshTriangles`、`modelParts`。
- **测试数据：** [synthetic.ts](../../src/original-data/synthetic.ts) 由代码生成单个格式的数据块及其重定位，可直接展开为 `buildImfat` 的条目：
  - `syntheticSnd(fields)`：SND 块与位于 0 的重定位，指针与声明长度可单独改写；
  - `syntheticMesh(fields)`：按顶点、着色槽数与各面的角点生成 MESH 块与位于 0 的重定位，结构指针、长度、保留字与尾字可单独改写；
  - `syntheticModl(fields)`：按三个部件列表与音效槽生成 MODL 块与非空列表指针的重定位，列表头、部件颜色与保留字段可单独改写。
- **转换预算：** [conversion/conversion-budget.ts](../../src/original-data/conversion/conversion-budget.ts) 的 `chargeConversionBudget(limits, usage, increment, location)` 用 P2-01 `chargeBudget` 核算转换用量，增量缺省的维度为 0。`readConversionUsage(value)` 读取转换器的起始用量（前序步骤的转换用量）：须为完整的预算记录，且 `sourceReadBytes` 为 0（源读取由已验证来源计量，否则会重复扣除），否则为 `invalid-budget-value@usage.sourceReadBytes`；图形、逻辑与模型转换器都经它读取。
  - **通过：** 总量等于上限时通过。
  - **失败：** 第一个超限或超出安全整数范围的维度，以 `SourceError('budget-exceeded')` 失败；`limit` 为该维度名、上限与观测值（溢出时为 null），增量不部分计入。
- **生产 `ConverterVersion`：** 见上文[内容基础契约](#内容基础契约与切片定义)中 `manifest-identity.ts` 一节；音频转换器的组件为 `AUDIO_CONVERTER_COMPONENT`。
- **音频组：** [conversion/audio-conversion.ts](../../src/original-data/conversion/audio-conversion.ts)（[P2-08/04](../plan/p2/08/subtasks/04-audio-group-conversion.md)）。
  - **音效表：** `readSoundTable` 读取行 `{ role, mapping }`。先把各行的 `mapping` 投影为 `{ sourceFingerprint: null, mappings }`，交给 P2-01 `readSourceMappingTable` 校验，因此行按 Asset ID 升序且唯一，错误路径为 `sources.mappings[i]…`；带 `role` 的整行不送入该读取器。之后另行核对：`role` 属于 `SOUND_ROLES`（四个核心角色与 `model-sound`）；ID 符合该角色的规则（核心角色为 `sound/<词干>` 或再加一段变体，`model-sound` 为 `sound/model-clip/<两位数字>`）；kind 为 `sound`；恰有一个部件，各别名都是 `MAIN/SR.NOB`（`AUDIO_SOURCE_ARCHIVE`）中不带子资源的 `SND` 条目；同一 SND 条目只能属于一行（`duplicate-mapping`），因为同一源样本只形成一个 Asset。
  - **常量：** `AUDIO_BUDGET_LIMITS` 为 `assets` 37、`audioSamples` 4,194,304、`payloadBytes` 8,388,608，其余维度为 0。转换器版本组件 `AUDIO_CONVERTER_COMPONENT` 为 `audio-1`，由 `converter-version.ts` 组成生产值。
  - **流程：** `convertAudioGroup(source, table, rules, { limits? })` 按以下顺序执行。`limits` 只供测试替换。
    1. **目录预检：** 读取任何 SND 块之前，只经 `openArchive` 的 `entries`/`entry` 核对（打开封包本身的 P2-03 失败报在 `sources.mappings[0].parts[0].alternatives[0]`）。先确认每个 locator（含别名）都存在且为 `SND`，失败时为 P2-03 原 code，位置为 `sources.mappings[i].parts[0].alternatives[k]`；再确认每行第一个 locator 的块不小于 20 字节，否则为 `invalid-payload`，位置为该路径加 `.size`；最后按块大小核算上界（`payloadBytes` 为 16 + 块大小 − 20，`audioSamples` 为块大小 − 20，另计 `assets`），超限时位置为该行首个 locator 加 `.size`。预检不计入用量。
    2. **核验：** `verifySourceMappings` 核验映射，再由 `assetSourceStates` 得到绑定指纹的来源状态集。
    3. **转换：** 逐行读取第一个 locator，以 `convertSnd` 转换，位置为该行映射路径；按实际 payload 字节与采样点数计量。
  - **输出：** 组草稿 `{ assets, payloads, sources, usage }`。描述符为 `sound`/`audio`、无依赖、payload schema 1；每个 payload 独占 buffer；`usage` 只含转换用量，源读取用量在已验证来源的 `usage()` 中。清单身份不在这里填入。
  - **门槛：** `unconfirmed` 的映射或缺少某个核心角色时，照常转换，交给完整性验证判为 `source-not-ready` 或 `role-cardinality`；格式不在规则内时，以 `unsupported-payload` 失败。空表不打开封包。
- **生产音效：** [conversion/production-sounds.ts](../../src/original-data/conversion/production-sounds.ts)（[P2-08/06](../plan/p2/08/subtasks/06-import-job-audio-stage.md) 建立，[P2-08/11](../plan/p2/08/subtasks/11-production-sound-table.md) 填入）导出 `PRODUCTION_SOUND_TABLE`（经 `readSoundTable` 读取）与 `PRODUCTION_SND_RULES`。
  - **唯一绑定：** 这张表是 SND 条目与 sound Asset ID 之间唯一的绑定。P2-06 建立模型到样本的依赖边时经同一模块的 `PRODUCTION_SOUND_REFERENCES`（SND 条目号到 sound ID）查 ID，不另立映射。
  - **行：** 每行 `{ role, mapping }`，映射到 `MAIN/SR.NOB` 的一个整条 `SND` 条目，为 `confirmed`、`declared`，证据指向 [audio](../original/formats/audio.md#slice-sample-set-and-role-correspondences-p2-08)。共 18 行：
    - 四个核心角色的全部变体：开火 4 个、导弹 1 个、爆炸 6 个（含 4 个效果音）、Warp 1 个，按 spec 的 Asset ID 规则命名；
    - 其余模型可达样本 6 个，为 `sound/model-clip/<两位序号>`，带 U-027。

    变体序号与片段序号一次分配后冻结，不由条目编号或槽位推导。
  - **规则：** 单声道；8 位无符号，16 位按有符号小端（`s16le`）接受；`flags` 只接受切片中出现的 0（循环至停止）与 1（播放一次），其他取值（如 8）以 `unsupported-payload` 失败。
  - **变化：** 表或规则的任何改动都会改变转换输出，须递增 `AUDIO_CONVERTER_COMPONENT`，从而改变生产 `ConverterVersion`。
  - **测试支持：** [production-sounds.test-support.ts](../../src/original-data/conversion/production-sounds.test-support.ts) 的 `productionSoundEntries()` 在表的各条目编号处生成合成 SND（宽度与 `flags` 都在规则之内），期望的转换用量为 `PRODUCTION_SOUND_USAGE`。

### 模型转换

[original-data/conversion/](../../src/original-data/conversion/) 把 MODL 及其引用的 MESH 转换为[模型 payload](#模型-payload)，规则见 [P2-06 spec](../plan/p2/06/spec.md#模型转换声明)（[P2-06/03](../plan/p2/06/subtasks/03-model-conversion.md)）。

- **声明：** [model-declarations.ts](../../src/original-data/conversion/model-declarations.ts) 的 `readModelDeclarations` 严格读取 `{ asset: { id, kind: 'model' }, role, group: 'models' }` 的数组：`role` 为 P2-01 的角色 token（机型模型为 `player-ship`、`enemy-ship`、`base`，非必需的机型为 `friendly-craft`，研究确认的为 `projectile`、`missile`、`debris`），同一组内 ID 唯一。来源、网格、贴图与音效都不可声明：来源是映射的整条 MODL，网格来自 MODL 的部件，贴图与音效只经查找表解析。任何问题都为 `invalid-declaration`，位置为 `models.declarations[<i>]` 加字段路径或 `models.declarations`。
- **输入：** [convert-models.ts](../../src/original-data/conversion/convert-models.ts) 的 `convertModels(declarations, sources, references, limits, usage)`：
  - `sources` 是步骤已读入的块：每个声明模型的 MODL（按 Asset ID），以及其部件引用的 MESH（按条目号）；读取条目与核验映射归模型步骤；
  - `references` 是两张查找表：TEX 条目号到 image ID（生产贴图表），SND 条目号到 sound ID（P2-08 生产音效表）。表中没有的引用为 `invalid-declaration`，位置为 `models[<ID>].parts[<l>][<p>].texture` 或 `models[<ID>].sounds[<s>]`，不跳过、不默认；
  - `limits` 与起始 `usage` 是完整的预算记录，`usage` 是前序步骤的转换用量，经 `readConversionUsage` 读取，不得含 `sourceReadBytes`。
- **每个模型：** 按 Asset ID 升序：
  1. 用 `readModel` 读取 MODL，位置为 `models[<ID>].model`；
  2. 按列表 0、1、2 与部件顺序，为每个首次出现的 MESH 条目分配下一个几何序号（因此几何按首次使用排列，同一模型内重复的 MESH 只存一份），并用 `readMeshCounts` 只读取其计数，位置为首个引用部件的 `….parts[<l>][<p>].mesh`；
  3. 以 `chargeConversionBudget` 一次扣除 `assets` 1、`dependencyEdges`（去重后的贴图与音效引用数）、`vertices` 与 `triangles`（各几何之和）以及 `payloadBytes`（`modelPayloadLength`，与编码器共用公式），位置为 `models[<ID>].model`；
  4. 扣除通过后才用 `readMesh` 解码几何并编码 payload。跨模型不共享几何：两个模型引用同一 MESH 时各自含有一份。
- **输出：** 冻结的 `{ assets, usage }`：`assets` 按 ID 升序，每项为描述符（`model`、`models` 组、依赖为去重后升序的 image 与 sound 引用、payload schema 1 与实际字节的身份）与独占 buffer 的 payload；`usage` 为起始用量加本步用量。任何失败都不输出部分结果，被拒绝的扣除不改变调用者的用量；超出安全整数时 `observed` 为 null。
- **转换器版本：** `MODEL_CONVERTER_COMPONENT` 为 `models-1`，由作业组成生产 `ConverterVersion`；模型输出变化时递增。
- **位置语法：** 转换失败的位置为 `models.declarations`、`models.declarations[<i>]` 加字段路径，或 `models[<Asset ID>]` 后接 `.model`、`.parts[<l>][<p>]`、`.parts[<l>][<p>].mesh`、`.parts[<l>][<p>].texture`、`.sounds[<s>]`，不含条目编号、偏移或宿主路径。[conversion.test-support.ts](../../src/original-data/conversion/conversion.test-support.ts) 的 `inModelLocationGrammar` 按 spec 写出这一语法，`expectSourceError` 对 `models` 开头的位置逐个核对（另可断言原因原文）；`meshBlockFor(geometry)` 生成恰好表示一个 `ModelGeometry` 的合成 MESH 块，`triangleMeshBlock()` 生成单个三角形的 MESH 块；`withMeshReads(source, read)` 替换来源的 MESH 读取（如光盘层失败），`UNLIMITED_BUDGET` 是各维度都取最大安全整数的预算记录。

### 模型转换步骤

[model-step.ts](../../src/original-data/conversion/model-step.ts)（[P2-06/05](../plan/p2/06/subtasks/05-model-step.md)）在已验证来源上运行模型转换，规则见 [P2-06 spec 的步骤结果与 `models` 组](../plan/p2/06/spec.md#步骤结果与-models-组)与[失败边界一览](../plan/p2/06/spec.md#错误码)。

- **流程：** `runModelStep(source, mappings, declarations, references, limits, usage)` 依次执行：
  1. **配对：** 读取声明与映射表，二者一一对应，否则为 `invalid-declaration`（`models.declarations[<i>]` 或 `models.declarations`）；每个映射须恰为 `MAIN/SR.NOB`（`MODEL_ARCHIVE`）中一个 MODL 整条目（单一部件、各别名都不带子资源），否则为 `invalid-declaration@models[<ID>].model`。这些检查在任何读取之前完成。
  2. **核验：** 用步骤内读取（`stepEntryReader`）经 `verifySourceMappings` 核验，失败保持 P2-03 的 code 与 `sources.mappings[…]` 位置。
  3. **读取：** 按 Asset ID 升序，从同一读取取得每个 MODL 块，用 `readModel` 收集部件引用的 MESH 条目号，在同一封包中按 `MESH` 类型读取。每个条目在一步内只物理读取一次，跨部件、跨模型共用。MESH 读取的 P2-03 失败（缺失、类型不符、封包限值）保持 code 与限值，位置改写为首个引用部件的 `models[<ID>].parts[<l>][<p>].mesh`；P2-02 的光盘层失败原样传出。
  4. **转换：** 调用 `convertModels`。
  5. **来源状态：** 由核验后的映射经 `assetSourceStates` 得到不带定位的来源状态。
- **结果：** 冻结的 `ModelStepResult`，形状同图形步骤结果：有模型时只有一个 `models` 分区，描述符、payload 与来源状态按 ID 升序一一对应；`usage` 为起始用量加本步转换用量，`sourceReadBytes` 为 0。结果不含定位、条目编号或原版字节。任一模型失败时整步失败，不输出结果，已发出的读取仍计入来源用量。
- **组草稿：** `modelsGroupDraft(graphics, models, sourceFingerprint)` 即 `stepGroupDraft('models', [graphics, models], sourceFingerprint)`（见[图形转换](#图形转换)的转换步骤）：把图形步骤与模型步骤结果的 `models` 分区按 Asset ID 合并为一个 `GroupDraft`，不重新转换；来源状态绑定给定的来源指纹。重复的 Asset ID 以内容层的 `duplicate-asset` 拒绝。两边都没有 Asset 时得到空组。作业把它与其他组草稿一起交给 `applyManifestIdentity`，接收方用 `validateGroup` 验证：`sound` 依赖作为外部要求返回，来源状态不是 `verified` 时为 `source-not-ready`。

### 生产模型

[production-models.ts](../../src/original-data/conversion/production-models.ts)（[P2-06/06](../plan/p2/06/subtasks/06-production-models.md)）由 P2-09 的机型绑定生成生产模型输入，规则见 [P2-06 spec 的生产 Asset 与来源](../plan/p2/06/spec.md#生产-asset-与来源)。

- **绑定来源：** 模型 ID 只来自 [craft-binding.ts](../../src/original-data/conversion/craft-binding.ts) 的 `bindCraftTypes`，不另建模型 ID 表。`ModelBinding` 为此追加 `category`：模型命名时所用的类别（`player`、`enemy`、`base`、`friendly`；同一模型被多个类别使用时，取命名顺序中最先使用它的类别）。
- **声明与映射：** `productionModelDeclarations(bindings)` 按类别给出角色：玩家 `player-ship`、敌方 `enemy-ship`、基地交互 `base`、其他友方 `friendly-craft`，组为 `models`。`productionModelMappings(bindings)` 把每个模型映射到 `MAIN/SR.NOB` 中绑定给出的 MODL 整条目，置信度 likely，U 项为 U-022、U-027、U-028，证据指向 hud §3、mesh §2 与 §3、玩家目标模式；来源指纹为 null，由作业核验时绑定。
- **查找表：** `PRODUCTION_MODEL_REFERENCES` 的贴图表为生产贴图表的 `PRODUCTION_TEXTURE_REFERENCES`，音效表为 [production-sounds.ts](../../src/original-data/conversion/production-sounds.ts) 的 `PRODUCTION_SOUND_REFERENCES`（由 `PRODUCTION_SOUND_TABLE` 按 SND 条目号查得 sound ID）；模型到样本的依赖边因此不自行命名 sound ID。
- **份额：** `PRODUCTION_MODEL_SHARE` 为 `assets` 16、`dependencyEdges` 96、`vertices` 8,192、`triangles` 8,192、`payloadBytes` 1,048,576，其余维度为 0。在这些计数、每个模型 256 个部件（每个部件一个几何）与实际字节布局下算出的上界为 442,816 字节，不超过 `payloadBytes`。
- **合成生产光盘：** [production-models.test-support.ts](../../src/original-data/conversion/production-models.test-support.ts) 为默认合成任务绑定的 5 个 MODL 条目给出合法内容：用到全部三个列表，quad 网格被四个模型共用，部件引用生产贴图表的 TEX 条目，音效槽引用生产音效表的 SND 条目；MESH 条目为 21001–21003。`productionSliceEntries()` 组成合成生产 `SR.NOB` 的全部条目（图形、M2ID 与合法模型、MESH、音效），`sliceCoveredFiles` 与 original-data 的测试共用它；未被绑定的 M2ID 槽位仍为 8 字节占位块，`syntheticModelEntries` 为此接受按条目号替换的块。

### 导入 Worker

[P2-04](../plan/p2/04/spec.md) 在专用模块 Worker 中运行导入作业，消息与生命周期契约以 spec 为准。当前已实现：

- **消息协议：** [workers/import-protocol.ts](../../src/workers/import-protocol.ts) 只依赖 `content/`，app 与 platform 都可以导入它。
  - `IMPORT_PROTOCOL_VERSION` 为 5：P2-05 增加 `convert-graphics` 时由 1 递增为 2；P2-09 与 P2-08 分别增加 `convert-logic` 与 `convert-audio`，各自递增为 3，合入后阶段集合与二者都不同，因此为 4；P2-06 追加 `convert-models` 并改为相邻阶段规则，递增为 5。`IMPORT_STAGES` 依次为 `identify-source`、`convert-graphics`、`convert-logic`、`convert-audio`、`convert-models`。`canReportStage(latest, stage, identified, grouped)` 是唯一的进度顺序规则，宿主与持有者共用：第一条进度是识别进度，之后每条进度只能重复当前阶段或进入紧随其后的阶段，不能跳过或倒退（作业在每个阶段开始时都报告一次进度）；识别进度只在 `identified` 之前，后续阶段只在它之后；第一个组之后不再有任何进度，因为组只在全部转换阶段完成后发送。`IMPORT_FILE_LIMITS` 规定 1–4 个文件，名称为 1–255 个 UTF-16 码元。
  - `readImportWorkerMessage` 读取 Worker 发往主线程的 6 种消息，`readImportStartMessage` 读取主线程发往 Worker 的 `start`。两者复用 `contract-validation.ts` 的严格 plain-data 读取，对协议记录拒绝未知或缺少的字段、accessor 与类实例。读取的协议字段复制后冻结。`start` 的文件只保留 Blob 引用，不读取内容。
  - 读取只核对单条消息；顺序、作业 ID 与顺序号的连续性由接收方核对。`group` 消息只读外层：`input` 恰好含三个字段，`sources` 是带字符串 `sourceFingerprint` 的 record。`group.input` 的内部值不复制，而是就地冻结其中可达的普通对象与数组，再交给接收方由 `validateGroup` 验证。递归只沿数据属性进行，不调用 accessor，并防止循环；payload 字节视图、Blob 与其他非普通对象不冻结，后者在内容验证中判为不完整。
  - 拒绝时返回 `import` 层 DTO，原因是固定文本，不回显值：
    - 主线程方向为 `protocol-error`，位置以 `message` 为根；
    - Worker 方向为 `invalid-request`，位置以 `request` 为根，并附上能读出的作业 ID，读不出时为 null。
- **错误 DTO：** `ImportErrorData` 为 `{ layer, code, location, reason, limit }`，层为 `disc`、`source`、`content` 或 `import`。
  - 前三层的 code 只按 token 语法核对，所以协议不依赖 `original-data`。
  - `import` 层的 6 个 code 为封闭集合 `IMPORT_ERROR_CODES`，`importError` 构造这一层的 DTO 并保留具体 code 的类型。Worker 报告的 `failed` 只接受其中的 `invalid-request` 与 `internal-error`（`WORKER_IMPORT_ERROR_CODES`），类型 `WorkerImportErrorData` 在编译期同样排除另外四个。
- **宿主：** [workers/import-host.ts](../../src/workers/import-host.ts) 的 `runImportHost(endpoint, job)` 在 Worker 内运行一个作业。
  - **端点：** `ImportHostEndpoint` 只含 `postMessage(message, transfer)`、`addEventListener`（`message`、`messageerror`、`unhandledrejection`）与 `close()`。Worker 入口把 `self` 断言为它，Node 测试用假端点或 `MessagePort`。宿主不监听 `error`：`ready` 之后的未捕获错误传到主线程，由持有者报 `worker-failed`。
  - **握手：** 安装监听后发送一次 `ready`，只接受第一条有效的 `start`。以下情况都以 `invalid-request` 失败：`start` 非法（带能读出的作业 ID）、`messageerror`，以及 `start` 之后的任何消息。
  - **作业：** `ImportJob` 接收冻结的文件快照与冻结的报告器（`progress`、`identified`、`group`），成功时返回预算用量。
    - 宿主维护顺序号，从 1 起逐条加 1。发送抛错（如克隆失败）不消耗顺序号，异常交给作业。
    - 阶段只能按 `canReportStage` 逐个前进：`identified` 至多一次，识别进度只在它之前，后续阶段的进度只在它之后，不能跳过阶段，进入后续阶段后不再有较早阶段的进度；组须在识别之后，且每组一次，第一个组之后不再报告进度；作业须先识别才能正常结束。违反时作业以 `internal-error` 失败，作为作业缺陷的防线。
    - 身份只发送版本 ID 与指纹。
  - **转移：** 发送组前，用 `readPayloadRecords` 与 `payloadTransferList` 计算转移列表，位置以 `groups.<组>.payloads` 为根。非独占、别名、已转移或乱序的 payload 以 `content` 层失败，该组不发送。发送后，作业持有的 payload 视图失效。
  - **终态：** 作业返回的用量经 `readBudgetRecord` 读取，再随 `finished` 与已发送的组一起发送。终态消息之后关闭端点，之后的报告与消息都被忽略。
  - **错误转换：**
    - `DiscReadError`、`SourceError` 按层转换，其余字段取自 `toData()`；
    - `ContentContractError` 转为 `content` 层，`location` 取 `path`；
    - 其他异常、非 Error 值与 `unhandledrejection` 都报 `internal-error@job`，原因是固定文本。宿主取消 `unhandledrejection` 的默认报告。
- **导入作业：** [workers/import-job.ts](../../src/workers/import-job.ts) 的 `createImportJob(open, graphics, logic, audio, models)` 返回生产作业。
  - **计量：** 每个文件包装为 `BlobByteSource`，外加一层计量。每个阶段开始时报告一次进度，之后端口每次读取成功返回，报告当前阶段与跨阶段累计的实际返回字节：识别阶段从 0 开始，之后各阶段从上一阶段结束时的累计值开始。
  - **识别：** 经 `open` 打开并识别，成功时报告 `identified`（版本 ID 与指纹）。
  - **限值与用量：** 图形、逻辑与模型步骤共用一份限值记录：P2-02 的默认读取限值（输入总字节，即 `sourceReadBytes`）加上三个步骤批准的份额；逻辑步骤在图形转换用量之上扣除，模型步骤在逻辑用量之上扣除。音频阶段按 `AUDIO_BUDGET_LIMITS`（或注入的限值）从零核算，与其他步骤互不占用（P2-08 的预算契约）。作业返回已验证来源最终的读取用量、模型步骤的累计转换用量与音频用量逐维之和。
  - **图形转换（P2-05）：** 识别之后运行 [图形转换步骤](#图形转换)。结果的 `models` 分区并入 `models` 组发送（P2-06）；`cockpit-hud-map` 分区由 `stepGroupDraft` 装配为 `cockpit-hud-map` 组草稿（P2-07），不重新转换，没有 Asset 时为空组，照常发送。生产图形的 `cockpit-hud-map` 分区含 P2-05 的调色板与字库和 P2-07 的驾驶舱、HUD 与地图 Asset（P2-06 的切片贴图在 `models` 分区），在已识别的来源上为 `group-complete`，外部要求为空。转换失败为 `source` 层；读取失败保持 P2-02 `disc` 层或 P2-03 `source` 层的原 code 与位置，都原样交给宿主转换。
  - **逻辑转换（P2-09）：** 图形阶段之后进入 `convert-logic`，运行[逻辑组转换步骤](#逻辑组转换)，结果为组草稿、累计用量与机型绑定的模型（`LogicStepGroups.models`，即 `convertLogic` 返回的 `bindCraftTypes` 的 `models`）；测试的 `NO_LOGIC` 返回空草稿与空绑定。
  - **音频转换（P2-08）：** 逻辑阶段之后进入 `convert-audio`，以 [`convertAudioGroup`](#原版格式转换) 转换 `audio` 组草稿；音效表为空时得到没有 Asset 的 `audio` 组，照常发送。
  - **模型转换（P2-06）：** 音频阶段之后进入 `convert-models`，对逻辑步骤绑定的模型运行[模型转换步骤](#模型转换步骤)：映射与声明由 `ModelStepInput.inputs(绑定)` 一并生成，查找表与份额也来自它；只用这份绑定，不重读任务或 M2ID。随后由 `modelsGroupDraft` 把图形步骤的 `models` 分区与模型步骤结果合并为 `models` 组草稿。没有绑定任何模型时，`models` 组只含图形分区，没有 Asset 时为空组，照常发送。
  - **组装与发送：** 全部转换完成后，以 [manifest-identity.ts](../../src/content/manifest-identity.ts) 的 `applyManifestIdentity` 和 `productionIdentityBasis(指纹)`，对作业发送的全部组草稿（`cockpit-hud-map` 组、逻辑步骤的草稿、`audio` 组与 `models` 组）推导同一 `ManifestIdentity`，写入每个组清单；`applyManifestIdentity` 按 `RESOURCE_GROUPS` 排列各组，因此发送顺序为 `logic`、`models`、`cockpit-hud-map`、`audio`（不发送的组跳过），与草稿的传入顺序无关。发送任何组之前，先由 `checkPackageTransfers` 用 `readPayloadRecords` 与 `payloadTransferList` 校验每组的转移列表（位置与宿主相同，为 `groups.<组>.payloads`），并确认没有 buffer 跨组共享，以免发送前一组时使后一组失效；再以 `addBudgets` 算出最终用量。因此转换、预算、身份与最终用量的失败都不会发出组。之后逐组 `report.group`，返回用量。后续任务接入更多组时，身份须对全部已发送组重新推导，`validatePackage` 只比较各组身份是否相同，不会发现沿用的旧值。
  - **注入点：** `open` 默认是产品入口 `openVerifiedSource`，不传 `limits`，沿用 P2-02 的默认预算。`graphics`（`GraphicsStepInput`：映射、声明与份额）默认是[生产图形](#图形转换)的声明、映射与份额。`logic`（`LogicStepInput`：`convert` 与份额）默认是导出的 `PRODUCTION_LOGIC_STEP`，即 `convertLogic` 与 `PRODUCTION_LOGIC_SHARE`；`convert` 返回 `{ drafts, usage, models }`。`audio`（`AudioStageInput`：音效表、SND 规则与可选限值）默认是生产音效表与规则。`models`（`ModelStepInput`：由绑定一并生成映射与声明的 `inputs`、查找表与份额）默认是[生产模型](#生产模型)的 `productionModelMappings` 与 `productionModelDeclarations`、`PRODUCTION_MODEL_REFERENCES` 与 `PRODUCTION_MODEL_SHARE`。限值与用量用 `addBudgets` 逐维相加。只有测试传入其他打开函数或步骤输入，用合成白名单识别。
- **生产入口：** [workers/import-worker.ts](../../src/workers/import-worker.ts) 把 `self` 断言为 `ImportHostEndpoint`，再用 `createImportJob()` 调用 `runImportHost`，不含其他逻辑。页面程序没有 WebWorker 类型，所以不另设类型程序。
- **测试支持：** [synthetic-import.test-support.ts](../../src/workers/synthetic-import.test-support.ts) 的 `syntheticImport(covered, versionId)` 在 Node 与浏览器中都可用。
  - 它用 `syntheticFileDisc` 生成光盘（另含一个不读取的 1 MiB 填充文件，以免默认预算被耗尽），按块读出为名称含 `MARKER` 的 `File`。
  - 同时返回一个打开函数：用底层的 `openDiscImage` 与 `identifySource`，按 `catalogFor(covered)` 识别。
  - 同文件的 `syntheticGroupsJob(open, groups)` 先经注入的打开函数识别，以 `NO_GRAPHICS`、`NO_LOGIC`、`NO_AUDIO` 与 `NO_MODELS`（都不转换任何 Asset）运行转换阶段，丢弃作业自己的空 `models`、`cockpit-hud-map` 与 `audio` 组，再发送 `groups(指纹)` 给出的组，供只关心识别与组转移的测试使用；默认的 `boundGroups` 是绑定已识别指纹的四个合成组。
  - **合成光盘：** 生产图形的合成光盘由 [production-graphics.test-support.ts](../../src/original-data/conversion/production-graphics.test-support.ts) 的 `productionGraphicsFiles(blocks, extra)` 生成，可替换或省略条目，也可加入其他条目；`productionGraphicsEntries` 给出同样的图形条目。
    - `graphicsCoveredFiles(corrupt)`：只有生产图形；
    - `productionCoveredFiles(corrupt)`：生产图形加上 `productionSoundEntries()`，即生产音效表各条目的合成 SND，供图形与音频阶段使用；
    - `audioCoveredFiles(corrupt)`（P2-08）：在生产图形结构的 `MAIN/SR.NOB` 中加入四个合成 SND 条目（其一为 16 位），`SYNTHETIC_AUDIO` 是把它们转换为完整 `audio` 组的合成音效表与规则（`flags` 取值只有测试含义），期望的转换用量为 `AUDIO_CONVERSION_USAGE`；`corrupt` 让开火音效的 `flags` 不被接受；
    - `sliceCoveredFiles({ scenario?, corruptMesh? })`（P2-09、P2-06）：全部生产步骤都能转换的合成光盘。`SR.NOB` 为[生产模型](#生产模型)的 `productionSliceEntries`（图形条目、M2ID 与合法的绑定模型、MESH、生产音效条目），`SCENARIO.NOB` 含战役表与可替换的所选任务；`corruptMesh` 使四个模型共用的网格被模型步骤以 `invalid-payload` 拒绝。模型步骤在其上的期望用量为 `PRODUCTION_MODEL_USAGE`。
    - `cockpitCoveredFiles(corrupt)`（P2-07）：`SR.NOB` 含合成的 DATA、TEX、CCKD（slot 0 为前视布局，slot 1 为空，slot 2 为地图边框）、MFDD 与 TABL 条目。`cockpitGraphics(changes)` 是在其上转换的图形步骤输入（合成映射都为 confirmed，份额高于用量）：`cockpit-hud-map` 分区有飞行调色板、三个字库、前视与地图边框布局及其元素图像、元素的嵌入调色板、MFDD 与 TABL 记录，满足该组全部角色；`models` 分区为一个贴图、其调色板与 `models` 飞行调色板。`changes` 可按 Asset ID 去掉 Asset，或替换声明与映射的字段（如置信度）；`COCKPIT_GRAPHICS_ASSETS` 列出各 Asset 的 ID、角色与组。`corrupt` 使一个前视元素的 +44 为 2，被转换器以 `invalid-payload` 拒绝。
    - 前三者的 4×6 字库表在 `corrupt` 时少一个字节（CCKD 仍为生产结构，只换字库）。期望的图形 payload 字节数由 `GRAPHICS_PAYLOAD_BYTES` 按 payload 长度公式给出，图形步骤的转换用量为 `GRAPHICS_CONVERSION_USAGE`，二者都含 P2-07 的 `COCKPIT_HUD_MAP_USAGE`；图形与音频阶段在 `productionCoveredFiles()` 上的转换用量为 `PRODUCTION_CONVERSION_USAGE`。`NO_MODELS` 是不转换任何模型的模型步骤输入。
  - 同文件的 `syntheticOpen(covered, versionId)` 是单独的合成白名单识别，`syntheticSource(covered, versionId)` 在调用线程中打开与 `syntheticImport` 同一光盘的已验证来源（指纹相同），供 Node 侧推导期望；`productionSizedFiles()` 按生产白名单的路径与大小生成内容（`generatedContent`），形状与基准版本相同，内容从不是原版。
  - 测试 Worker 入口 [import-worker.test-support.ts](../../src/workers/import-worker.test-support.ts) 与生产入口共用宿主，由 Worker 的 `name` 选择场景。`synthetic` 场景识别生产尺寸的合成文件后发送四个组，并在结束前确认发送过的 payload 视图都已失效，否则作业失败，因此正常结束即证明组是转移而非复制。`graphics` 与 `graphics-corrupt` 场景（P2-05）对 `productionCoveredFiles()` 运行带图形与音频阶段、以 `NO_LOGIC` 跳过逻辑转换的生产作业，因此 `graphics` 场景发送完整的生产 `audio` 组；页面与 Worker 用同一函数生成光盘。`audio` 场景（P2-08）对 `audioCoveredFiles()` 以 `NO_LOGIC` 与 `SYNTHETIC_AUDIO` 运行生产作业。`models` 与 `models-corrupt` 场景（P2-06）对 `sliceCoveredFiles()` 运行完整的生产作业，后者的共用网格损坏。其余生命周期与失败场景见[工程约定](./README.md#本地浏览器-runner)。
  - [import-host.test-support.ts](../../src/workers/import-host.test-support.ts) 的 `FakeEndpoint` 记录监听、发送、转移列表与关闭，并用协议读取函数核对宿主发出的每条消息，供宿主与作业的 Node 测试共用；`portEndpoint(port)` 把 Node `MessageChannel` 的一端包装为宿主端点。
- **集成测试：** [app/import/import-pipeline.test.ts](../../src/app/import/import-pipeline.test.ts) 用 Node `MessageChannel` 把真实的持有者、平台适配、宿主与合成作业连在一起：消息经结构化克隆，组的 payload 以转移交出。它核对发送方视图失效、接收方验证与移交、每层失败经往返后与宿主转换的 DTO 相等、文件名只出现在 `start` 中，以及结束后不留下打开的 `MessagePort`。
  - **图形（P2-05）：** 识别进度 → `identified` → 图形进度 → 空的逻辑阶段 → 音频进度 → 没有绑定模型的模型阶段 → 只含图形分区的不完整 `models` 组与完整的生产 `cockpit-hud-map`、`audio` 组 → `finished`（用量含转换维度），以及识别失败、图形阶段读取失败（缺少条目、识别后端口拒绝读取）与转换失败各自保持层、code 与位置，快照停在相应阶段且没有部分结果。
  - **逻辑（P2-09）：** 在 `sliceCoveredFiles()` 上，消息依次经过识别、`identified`、图形、逻辑、音频、模型、`group`、`finished`；持有者验证 `logic`、`cockpit-hud-map` 与 `audio` 组为 `group-complete`、`models` 组为 `incomplete`（贴图未确认、效果角色缺失），其诊断与 Node 对收到的同一组消息的验证结果相同；各组身份相同，`takeGroups()` 只移交一次完整的组。不支持的任务（`source` 层 `unsupported-payload`）、份额不足（`source` 层 `budget-exceeded`，`limit` 完整）与注入的内容错误（`content` 层）都停在 `convert-logic`，不发送组，快照与消息不含文件名标记。
  - **音频（P2-08）：** 完整的 `audio` 组经通道转移、发送方视图失效、持有者移交且清单身份为生产值；SND 转换失败经往返后与宿主转换的 DTO 相等、没有组；组发送之后作业失败时，持有者丢弃已收的组。
  - **模型（P2-06）：** 网格损坏时，`source` 层 `invalid-payload@models[model/base-1].parts[0][1].mesh` 经往返后与宿主转换的 DTO 相等，快照停在 `convert-models`，没有组。作业测试另按失败边界一览覆盖模型映射核验、MESH 缺失与类型不符、光盘层失败，并核对发送的 `models` 组与 Node 由同一来源与绑定推导的组草稿相同。
- **Worker 端口：** [app/import/import-worker-port.ts](../../src/app/import/import-worker-port.ts) 由 app 定义，platform 实现（ADR-0015 第 4 条）。
  - 工厂 `ImportWorkerPortFactory` 接收三个回调（收到消息、`messageError`、`error`），每次调用创建一个新 Worker，可能抛错。回调只传收到的数据或事件发生这一事实，不传事件对象、宿主错误文本或文件名。
  - `post(start)` 可能同步抛错。`terminate()` 先移除全部监听再终止，可重复调用，之后不再有回调。
- **平台适配：** [platform/workers/worker-port.ts](../../src/platform/workers/worker-port.ts) 的 `connectImportWorker(worker, events)` 在最小的 `WorkerLike` 形状上实现端口，不用 DOM 类型，由 Node 测试覆盖。
  - 它注册 `message`、`messageerror`、`error` 三个监听，按上面的端口契约转交与终止；对 `error` 另调用 `preventDefault()`，错误文本不进入页面控制台。
  - [browser-import-worker.ts](../../src/platform/workers/browser-import-worker.ts) 的 `browserImportWorkerFactory(createWorker)` 每次调用创建一个新 Worker。默认用 Vite 可识别的 `new Worker(new URL('../../workers/import-worker.ts', import.meta.url), { type: 'module' })`；浏览器测试传入 `createWorker` 载入测试入口。它是 `browser-*` 文件，只由应用程序检查。
  - [vite.config.ts](../../vite.config.ts) 以 `worker.format: 'es'` 输出 Worker。页面尚未引用工厂，生产构建暂不产生 Worker chunk，接线与生产预览归 P2-11。
- **作业持有者：** [app/import/import-job-owner.ts](../../src/app/import/import-job-owner.ts) 的 `createImportJobOwner({ createPort, reportError })` 同一时刻至多管理一个活动作业。它是 DOM-free 的，Node 测试用假端口。
  - **开始：** `start(files)` 只在空闲或终态时创建新作业，作业 ID 递增，每个作业一个新端口。
    - 有活动作业时返回 `busy`；文件数不在 1–4，或某项不是名称为 1–255 个 UTF-16 码元的 Blob 时返回 `invalid-files`；释放后返回 `disposed`。拒绝都不改变状态，也不创建端口。
    - 持有者用这些文件构造 `start` 请求，交给协议的 `readImportStartMessage` 核对，所以主线程从不发送 Worker 会拒绝的请求。读取结果就是冻结的私有 `{ name, blob }` 列表，只保留 Blob 引用，输入总字节也由它计算；发送 `start` 或作业结束后释放。
  - **握手：** 状态从 `starting` 开始；收到有效的 `ready` 后发送唯一的 `start`，进入 `running`。
    - 工厂抛错，或 `ready` 之前的 `error`、`messageError`，都报 `worker-start-failed@worker`；
    - `ready` 的版本不符时报 `protocol-error`，不发送 `start`；
    - 发送 `start` 抛错时报 `worker-failed@worker`。
  - **消息：** 用协议读取函数校验，再依次核对第二次 `ready`（`message.type`）、作业 ID（`message.jobId`，含 `jobId` 为 null 的 `failed`）与连续的顺序号（`message.sequence`）。
    - 进度的字节数不得减少或超过输入总字节（`message.readBytes`）；阶段只能按 `IMPORT_STAGES` 的顺序前进，识别之前不得有后续阶段的进度，识别之后或进入后续阶段之后不得再有较早阶段的进度（`message.stage`）；收到第一个组之后不得再有进度（同为 `message.stage`）；
    - `identified` 至多一次；组与 `finished` 须在识别之后，每组至多一次（`message.group`）；
    - `ready` 之后的 `messageError` 报 `protocol-error@message`，`error` 报 `worker-failed@worker`；
    - Worker 报告的 `failed` 原样成为快照的错误。
  - **组结果：** 按 spec 的验证顺序处理每个 `group`：
    - 外层由协议读取函数核对；组须在识别之后，每组一次；
    - `sources.sourceFingerprint` 须等于已识别的指纹，否则报 `invalid-result@groups.<组>`；
    - 用 `CLASSIC_P2_SLICE` 与 `validateGroup` 重新验证；可读的组须等于消息的组，否则报 `protocol-error@message.group`；
    - `group-complete` 连同 payload 保留，摘要的 `assets` 为描述符个数；`incomplete`（含清单无法读取、来源状态集格式错误或多余字段）只保留 P2-01 诊断，`assets` 为 null，不再引用其 payload。

    `finished.groups` 须与收到的组完全一致（顺序与集合），否则报 `protocol-error@message.groups`。快照的 `groups` 只含摘要 `{ group, status, assets, diagnostics }`，没有 payload 字节。
  - **移交：** `takeGroups()` 只在 `finished` 之后返回一次完整的组 `{ group, manifest, payloads, sources }`（按收到顺序），容器全部冻结：内部容器在协议读取时已冻结，保留的条目在验证通过后立即冻结，移交列表在接受 `finished` 时冻结。payload 视图从此归调用者独占。再次调用、开始新作业或释放之后，以及其他状态，都返回 null。作业以任何方式结束时都释放它保留的 payload 引用：完成时结果移入一个新的冻结列表，在端口终止之后与 `finished` 快照一起发布；失败、取消与释放丢弃全部已收结果。
  - **终态与隔离：** 结束、失败、取消与释放都先终止端口，每个作业恰好一次。工厂返回之前送达的回调先排队，发布 `starting` 后按序处理；作业结束之后的回调都被丢弃，所以旧作业的迟到消息不会影响新作业。
  - **命令与快照：** `cancel()` 只对 `starting`、`running` 生效，同步变为 `cancelled`。`dispose()` 可重复调用：终止活动端口、丢弃结果、清空订阅，之后的命令返回 `disposed`、false 或 null，快照不再变化。快照冻结，在两次变化之间保持同一对象；`failed` 与 `cancelled` 不含来源身份与组。订阅者同步收到通知，抛出的错误交给 `reportError`，不影响其他订阅者与状态；通知过程中被移除（包括因释放）的订阅者不再收到这次通知。

## 职责与依赖

P1-09 已提供 [platform/input/](../../src/platform/input/) 的通用事件、按住轴、源端口与监听管理，以及 [synthetic-keyboard-input.ts](../../src/ui/game/synthetic-keyboard-input.ts) 的合成五键映射和 Session 消费者。平台层不识别合成动作；消费者不导入浏览器连接、不调度 tick，方向轴经桥接的 guarded setInput，命令与 P 复用既有反馈/controls。工厂与释放契约见[工程约定](./README.md#ui-投影与指令反馈)。owner/页面已接线，每个 owner 一组输入源；释放先失效/撤销输入再销毁 Session。同 owner 换 run 不重建监听。当前绑定、焦点及清键规则见独立[键位文档](./keyboard-input.md)，实际开发/生产证据见 [05](../plan/p1/09/subtasks/05-browser-input-evidence.md#完成证据)，不代表原版操控或系统快捷键拦截。

| 模块 | 拥有的职责 | 不应承担 |
|---|---|---|
| `app/` | 应用装配、页面流转、跨模块导入/启动/保存流程 | 游戏规则、GPU 实现、浏览器解析器 |
| [app/runtime/](../../src/app/runtime/) | 固定步长、连续输入、命令队列、调用 Core、帧后事件、两帧 Render State | DOM 监听、第二条游戏循环、UI 成功状态 |
| [app/session/](../../src/app/session/) | 控制通道、唯一帧调度许可、运行身份、通知边界、资源所有权与清理 | 重复模拟世界、媒体/Worker 空实现 |
| [core/](../../src/core/) | 权威状态、规则、step、纯投影、确定性、纯 replay/存档模型 | 宿主时间/随机、异步、UI、渲染、平台 I/O |
| [original-data/](../../src/original-data/) | 原版字节/格式、版本识别、解析与规范化转换 | Three.js 对象、IndexedDB、正式运行世界 |
| `content/` | 内部内容契约、Asset ID、内容版本、任务与逻辑定义 | 原版资源文件、浏览器加载/GPU/存储实现 |
| `render/` | 实体映射、相机、插值、GPU 资源、Classic 驾驶舱/HUD/MFD、效果 | 权威坐标/血量/胜负、直接解析原版封包 |
| `ui/` | React 页面、vanilla stores、projection 桥接、指令反馈 | 整个世界副本、逐帧模拟、Classic 飞行 DOM HUD |
| [platform/](../../src/platform/) | 文件、输入、音视频、存储与浏览器生命周期实现 | 权威规则、业务成功判定 |
| `workers/` | 导入/转换入口与消息协议、调用纯解析器 | 主模拟迁移或重复解析实现 |

### 调度与装配

Runtime 只处理宿主提供的时间并推进 Core；Session 持有唯一请求凭证，平台宿主实现真实 rAF/页面事件。应用装配连接 Session、输入、UI 桥接与渲染，并登记消费者清理。

消费者使用公开运行句柄或传入的只读数据，不调用内部 frame/step/publish。UI、渲染和输入不建立另一条游戏 rAF。端口由需求方定义，例如 [session-host.ts](../../src/app/session/session-host.ts) 归 Session，而 [browser-session-host.ts](../../src/platform/browser/browser-session-host.ts) 实现它；平台对端口的类型依赖不意味着可导入应用装配。

### 数据与表现

```text
原版字节 → 原版格式解析 → 内部内容契约
                              ↓
                       Core / Renderer / Audio

Input / Command → Runtime → Core.step()
                              ↓
                   State / Projection / Events
                              ↓
               Renderer / UI bridge / Event consumers
```

Core 消费规范化逻辑数据，不认识原版封包。持续事实走投影，一次性反馈走帧后事件；不得靠事件累积重建事实。Classic 飞行 HUD/MFD 直接消费 projection，React 页面的桥接按总计划分层采样。

存档内容、校验和纯迁移属于 Core；IndexedDB 事务、配额与读写错误属于平台；保存时机和恢复编排属于应用；槽位和错误提示属于 UI。合成完整快照不是正式玩家存档格式。

## 文件与 helper 归属

- 一个调用者使用的 helper 默认留在同文件；同模块复用时按能力命名并提取到该模块。跨模块先寻找已有 owner 或公共契约，不用全局 utils/shared/types/services 兜底。
- 时钟与总线属于 Runtime，RNG 与状态一致性哈希属于 Core；FNV-1a 不是内容来源指纹、安全哈希或防篡改机制。
- 数字/结构校验可在真实复用需求下形成 Core 内部校验模块；合成 marker 坐标、ID 和输入规则仍归合成场景。本轮不提取校验。
- 公共类型跟随 owner；`AssetId` 归内容，`Command` 归 Core，`SessionHost` 归 Session。不建立统一大 schema 或全局 barrel，也不要求一函数一文件。
- `core/synthetic/` 是明确标记的合成规则，不是测试支持目录。合成 Command/Event、snapshot/replay 的形状和版本不得通过重命名变成正式玩法契约。Runtime 与 Session 同样保留 synthetic 命名，正式复用在第二个真实场景出现后设计。
- 新单元测试继续邻接源码；测试支持在所属模块内维护，不进入生产导入链。TSX 单元测试尚未配置；P1-10 的 E2E 已用独立 `.spec.ts` runner/type/lint 接入，不扩大既有 `.test.ts` 的 Vitest 发现。

### 浏览器测试目录与证据分层

仓库根 [e2e/](../../e2e/)属于测试，不是 app/platform 模块，也不进入网站导入链。[配置](../../playwright.config.ts)和[独立tsconfig](../../tsconfig.e2e.json)允许 Node runner 与 evaluate 的 DOM 类型，但 Core/Node 程序仍无 DOM。命令、已有浏览器准备、origin/端口所有权、headed CDP 与输出清理见[工程约定](./README.md#本地浏览器-runner)。

- bootstrap、probe-contract、interaction-render、joint-resources、browser-replay、native-lifecycle、webgl-unavailable 各自承担独立验收面；P1-12增加rights DOM和仅production的许可产物可读性用例。[P1-10覆盖/历史适用性](../plan/p1/10/subtasks/07-evidence-docs-alignment.md#完成证据)、[P1-12相关证据](../plan/p1/12/subtasks/08-local-evidence-docs.md#完成证据)及[P1-14当前完整回归](../plan/p1/14/subtasks/03-browser-exit-checks.md#完成证据)分别保留各候选的实际结果，阶段判定见[退出评审](../reviews/P1-exit.md)。
- `e2e/support/`按测试能力放 environment、只读宿主探针、错误fixture、DOM/采样、截图/布局与CDP relay，不建立生产debug/world写入API。输入走可信UI/浏览器协议，replay只导入公开纯模块创建独立scene。
- Node 单元测试继续证明纯规则、通知/旧回调、注册失败/回滚/稀有错误；持久E2E证明真实DOM/图形/宿主生命周期与联合资源。仍适用的人工HMR/window/DPR证据直接复用，不自动改源码，不把本机Chromium结果说成Safari/系统快捷键/目标GPU/原版保真。
- `tools/e2e-configuration.test.ts`是 Node 接入/子进程失败回归，不传递导入浏览器helper或需要已安装浏览器；真正浏览器验收独立运行`pnpm test:e2e`，不由`pnpm check`替代。报告与合成截图只有ignored测试目录，不是产品资源。

## 后续扩展方向

本节是职责落点，不是已批准文件/API 清单。除 [P1 tasks](../plan/p1/tasks.md) 外，P2–P6 尚未完成具体任务拆分；范围由[总计划 §12](../plan/master-plan.md#12-开发阶段与验收条件)定义。仅在实际交付代码时创建目录。

| 阶段 | 推荐的模块内结构 | 边界 |
|---|---|---|
| P1-06/07/08/09/10 | `ui/game/`、`ui/pages/`、`ui/dev/`；`render/scene/`、`render/viewport/`、`render/synthetic/`；`platform/input/`；必要时 `app/composition/`；仓库根 `e2e/` | 消费者各自实现订阅与释放，应用装配，不增游戏循环 |
| P2 | `original-data/io/`、`disc/`、`archives/`、`formats/`、`identification/`、`conversion/`、`validation/`；`content/` 按数据类别组织；`platform/files/`、`storage/`；`workers/` | 纯字节读取端口由解析层定义，File/fs 实现分别在平台/工具；转换数据不写入仓库 |
| P3 | `core/contracts/`、`world/`、`systems/`、`rules/`、`projections/`、`replay/` | 真实系统显式按固定顺序执行；不得把合成 marker 契约改名使用 |
| P4 | `core/save/`；内容模块的战役/任务数据；`render/cockpit/`；UI 简报、结果等页面；`platform/video/`、`music/`（音效播放端口 `platform/audio/` 已由 P2-08 交付） | 媒体实现由 spike/ADR 确定，不在目录方案中选解码器；存档模型与持久化分开 |
| P5 | 扩展原版导入、平台存储/PWA、UI 错误反馈、`e2e/`、`tools/` 与 CI/发布配置 | 不建立装满所有业务的 release 模块；缓存管理不静默覆盖玩家存档 |
| P6 | `render/styles/`、`effects/`、内容模块的外观覆盖契约、画质设置 | 同一 Core/逻辑定义/存档；碰撞等逻辑不从 Enhanced 模型重新推导 |

P1-06 可将 projection store、会话桥接、命令反馈分别作为小模块；命令提交、Core 接受/拒绝、会话取消和同步失败是不同结果。反馈按运行身份隔离，游戏 store 随运行重建或重置，偏好设置保持应用级。实现和量化验收仍留到对应 spec/goal。

## P1-06 前迁移记录

### 路径对应关系

| 历史路径/文件组 | 当前位置 |
|---|---|
| `src/app/fixed-step-clock*`、`runtime-errors*`、`synthetic-event-bus*`、`synthetic-runtime*` | [src/app/runtime/](../../src/app/runtime/) |
| `src/app/session-host.ts`、`session-errors*`、`synthetic-session*`（含 test-support） | [src/app/session/](../../src/app/session/) |
| `src/core/rng*`、`fnv1a64*` | [src/core/determinism/](../../src/core/determinism/) |
| `src/core/synthetic-scene*`、`synthetic-snapshot*`、`synthetic-replay*` | [src/core/synthetic/](../../src/core/synthetic/) |
| `src/platform/browser-session-host.ts` | [src/platform/browser/browser-session-host.ts](../../src/platform/browser/browser-session-host.ts) |

本轮移动 37 个源码/测试文件，仅调整相对模块引用（含 Vitest mock）。`App`、`main`、Core 错误、原版解析器与样本、工具实现、依赖、锁文件及工程配置不变；不保留旧路径 re-export 外壳，不拆内部实现。

历史任务文档中的计划路径、实际执行命令、计数、审批与验收结论保留为当时记录；Markdown 源码链接指向现位置，当前操作指南使用新路径。涉及源码链接修订的已批准 spec 删除失效 reviewed 摘要，不改行为/S/AC 或批准，不伪造新审阅。任务状态以原 goal 为准，本次迁移不将 P1-05 待完成项或 P1-06 消费者视为完成。

### 验证

2026-10-02 的迁移验证：

- 对全部 45 个源码文件逐文件比较：只允许解析到同一目标的相对模块字符串变化；37 个旧路径已移除，其余源码不变，测试断言与实现逻辑未改。
- `pnpm check` 通过：三个 TypeScript 程序、ESLint、27 个测试文件 / 598 项 Vitest 测试、Vite 生产构建全部成功；依赖与检查配置未改。
- 变更文档的本地链接、标题锚点、front matter 日期与 ADR 引用检查通过，无新增失效链接；保留 3 处迁移前已经失效的历史锚点，不顺带修改旧契约。
- P1-01 至 P1-05 的任务路由与迁移前对照一致；P1-05 仍指向子任务 08，不改变 goal tracker 或把此次检查计为原任务最终对齐。
- `git diff --check` 通过，工作树仅含本次源码路径与相关文档变化；无原版内容、研究输出或新依赖。

本轮未运行新的浏览器验收：浏览器宿主实现未改，仅移动文件及类型引用；目录整理不替代真实浏览器生命周期或后续 UI/GPU 验收。原有任务证据及阶段退出判定仍由各自文档维护。
