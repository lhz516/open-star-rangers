---
type: guide
status: active
phase: all
updated: 2026-10-05
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
    completeness.ts
    budget.ts
    ownership.ts
    graphics/
      graphics-format.ts
      palette-payload.ts
      image-payload.ts
      font-payload.ts
      graphics-binding.ts
      expand-image.ts
      glyph-lookup.ts
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
    source/
      source-catalog.ts
      identify-source.ts
      open-verified-source.ts
      verify-source-mappings.ts
    conversion/
      source-graphics.ts
      graphics-declarations.ts
      convert-graphics.ts
      graphics-step.ts
      production-graphics.ts
  platform/
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

[workers/](../../src/workers/) 由 [P2-04](../plan/p2/04/spec.md) 逐步交付，见[导入 Worker](#导入-worker)。[content/](../../src/content/) 目前实现候选无关的基础契约、唯一生产切片定义与资源组/全包完整性验证（见下节），以及 `graphics/` 中的图形 payload（见[图形 payload](#图形-payload)）；原版来源映射属于 `original-data`（见[原版来源映射](#原版来源映射)）。`render/` 由 P1-07 逐步交付（契约见 [P1-07 spec](../plan/p1/07/spec.md)）：目前有 DOM-free 的 4:3 视口布局、合成帧校验与插值、固定合成相机、合成外观、绘制端口与合成渲染器，以及 WebGL 表面（DOM-free 生命周期加 `browser-*` 浏览器工厂）；`ui/render/` 的合成画面组件与开发面板的渲染诊断已接入页面。P1-06 已交付：`ui/game/` 的投影 store（Zustand vanilla，React 只取得只读句柄）、会话桥接（状态即时写入、10 Hz 投影采样）、命令反馈（Core 接受/拒绝、取消、故障未确认）、会话控制与 React selector hook；`ui/dev/` 的合成开发面板；[app/composition/](../../src/app/composition/) 中 DOM-free 的合成演示 owner 与创建、销毁它的 React effect hook。P1-08 已实现（最终对齐见 [P1-08 goal](../plan/p1/08/goal.md#子任务跟踪)）：[app/flow/](../../src/app/flow/) 中 DOM-free 的页面流转（主菜单、导入占位、合成演示，内存状态，不用路由）；`app/composition/` 中每个应用实例一个的演示生命周期（一次性 start、先释放后创建、清理失败锁存）；`app/session/` 的 `RollbackError` 结构化回滚失败信号；`ui/pages/` 的三个画面组件。[App](../../src/app/App.tsx) 是应用外壳，加载时显示 P1 React 菜单原型；菜单、合成画面与开发面板都是工程原型，不是原版界面或飞行 HUD。

[platform/storage/](../../src/platform/storage/) 由 [P2-10](../plan/p2/10/goal.md) 交付资源缓存：

- **DOM-free：** [resource-cache-contract.ts](../../src/platform/storage/resource-cache-contract.ts) 定义缓存键、13 个封闭错误码、失败结果形状、宿主错误按 `name` 分类，以及由存储估算得出的建议性空间判定 `evaluateCapacity`（`usage`/`quota` 缺失、为负或非有限时为 `unknown`）；[resource-cache-records.ts](../../src/platform/storage/resource-cache-records.ts) 定义数据库名 `osr-resource-cache`、数据库版本 1、记录格式版本 1 与两个对象仓库名（`RESOURCE_CACHE_DATABASE`），包记录与 payload 记录的构建和读取（先查结构，再按 P2-01 读取；未知格式、内容 schema 或切片定义版本为 `cache-incompatible`，其余为 `cache-corrupt`），按定义顺序核算清单预算，恢复时把 payload 记录与清单配对并重新验证，以及存储需求估算（payload 字节精确求和，元数据按包记录与各 payload 记录键的 JSON 文本每字符 2 字节、每条记录另加 64 字节估算）。两者都在 Node 中测试。
- **IndexedDB 适配：** [browser-resource-cache.ts](../../src/platform/storage/browser-resource-cache.ts) 的 `createResourceCache({ indexedDB?, storage? })` 只依赖注入或全局的 IndexedDB 与 `navigator.storage` 能力，不用 `window`/`document`，因此也能在 Dedicated Worker 中运行；只由应用程序检查，不进入 Node 程序。提交先取得 payload 独占快照，再读预算限值、按定义顺序核算、`validatePackage`，最后在一个读写事务中删除该键的旧记录（payload 用 `[来源类别, 令牌, 转换器版本]` 到其后追加 `[]` 的键范围）并写入新记录，只有 `complete` 才返回 `committed`；列出只读包记录；恢复在一个只读事务中读包记录、在其回调里核算预算后才读 payload 记录，事务结束后配对并重新验证。连接收到 `versionchange` 即关闭并丢弃，已开始的事务照常结束，之后的操作重新打开；浏览器强制关闭（`close` 事件）后同样丢弃。在已关闭连接上开始事务报 `storage-closed`，这次操作随即丢弃它所用的那个缓存连接（只在缓存的仍是该连接时，不会清掉更新的连接），下一次操作重新打开并报告实际状态；进行中的事务被强制关闭时，中止先于 `close` 事件，所以报 `write-failed`/`read-failed`，之后由 `close` 处理器丢弃连接。更高版本的数据库报 `storage-newer-version`，不升级也不删除。`checkCapacity` 只作建议，不阻止提交；没有 `StorageManager` 或估算失败时为 `unknown`。提交可带 `AbortSignal`：调用时已取消或写事务开始前取消返回 `cancelled`；写事务仍可中止时调用原生 `abort()`，事务确已中止才返回 `cancelled`；已进入提交阶段（`abort()` 抛出 `InvalidStateError`）或已完成时以事务最终事件为准。预期失败都以结果返回。

### 内容基础契约与切片定义

[P2-01/08](../plan/p2/01/subtasks/08-base-content-contract.md) 的当前 API：

- [asset-id.ts](../../src/content/asset-id.ts)：`readAssetId` 返回品牌化语义 ID，8 段限制包含 kind 首段；`ASSET_KINDS` 封闭为 8 种，`ASSET_ID_LIMITS` 固定每段 32 字符、总长 128 字符。语法验证不能证明命名语义或来源映射正确。
- [asset-contract.ts](../../src/content/asset-contract.ts)：`readAssetReference`、`readAssetDescriptor` 验证 kind 一致性、4 个封闭资源组、语义 role token、严格 ASCII ID 顺序且无重复的类型化依赖，以及 payload 身份。role 的必需集合/基数留给 02，引用存在/自引用/环与分组/全包完整性留给 04；没有 `complete` 布尔值。 `readRole` 单独读取语义 role token，描述符与图形转换声明共用。
- [content-identity.ts](../../src/content/content-identity.ts)：`readContentIdentity` 显式分开 schema、切片 ID、切片定义版本、converter、manifest 与 origin；schema 当前只支持 1，数值版本为正安全整数。converter 按 spec 保留受限 ASCII 不透明字符串，不用应用版本代替。converter/manifest token 允许小写 ASCII 字母、数字及单个内部 `-`、`.`、`:` 分隔符。
- 同文件的 `readContentOrigin` 严格区分 `{type: synthetic, fixtureId}` 与 `{type: original-import, sourceFingerprint}`；fixture token 不允许 `:`，source 使用 `source:<不透明 token>` 命名空间，不规定指纹算法。通过只表示形状合法，**不是来源已验证的证据**；P2-03 负责生成经过验证的来源指纹，未来转换器负责产生 manifest 身份。`readFixtureId`、`readSourceFingerprint` 与 `readConverterVersion` 用同样的规则单独读取这些令牌，供 [P2-10 缓存键](../plan/p2/10/spec.md#缓存键与身份)使用；`contentIdentityKey` 把六项身份合成一个可比较的键，全包验证与缓存读取共用。
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
- [manifest.ts](../../src/content/manifest.ts)：`readGroupManifest` 读取组清单（身份、组，以及按 ID 升序且唯一的描述符），完整性验证使用它。`visitGroupManifest` 做同样的检查，但逐个访问描述符而不收集，访问函数返回值时即停止，供预算计量使用。
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

合成内容包由 [synthetic-content.test-support.ts](../../src/content/synthetic-content.test-support.ts) 在代码中生成：四组清单覆盖全部角色，另含实际 payload、原版导入变体的来源状态（`syntheticSourceGroup` 可绑定任意来源指纹），以及按 `code@path` 断言诊断的辅助函数。它与生产文件同样位于纯模块程序中。[synthetic-package.test.ts](../../src/content/synthetic-package.test.ts) 用同一个包串联完整性验证、预算、独占发布、转移与接收方重新验证，并覆盖模型内部几何与共享源网格的字节层用例。针对性检查为 `pnpm exec vitest run src/content tools/engineering-boundaries.test.ts`；不读取原版文件或接线浏览器消费者。

### 图形 payload

[content/graphics/](../../src/content/graphics/)（[P2-05/01](../plan/p2/05/subtasks/01-graphics-payloads.md)）定义 `palette`、`image`、`font` 三类 Asset 的规范 payload。它是纯 TypeScript，不导入 `original-data`；原版转换由 `original-data` 产生这些字节。

- **常量：** [graphics-format.ts](../../src/content/graphics/graphics-format.ts) 的 `GRAPHICS_SCHEMA_VERSION` 为 1，三类共用；改变布局或解释须递增。`GRAPHICS_LIMITS` 供读取器与转换器共用，分为两类：
  - **格式规则：** 调色板 1–256 项（8 位索引最多寻址 256 项），字体单元宽 1–8（每行 1 字节），字形恰为 256 个，字符映射 0–256 条；
  - **安全上限：** 图像宽 1–640、高 1–480（Classic HI 画幅），字体高 1–8（已观察到 6 与 8）。原版字段本身更宽，这两项是 [P2-05 spec](../plan/p2/05/spec.md#限值与预算) 批准的上限。
- **字节布局：** 都是小端定长头部加数据，总长恰为两者之和，Asset ID 以 ASCII 存储。

  | 类别 | 头部 | 数据 |
  |---|---|---|
  | 调色板 | `u16` 条目数 | 每项 (R, G, B) 各 8 位，不含透明 |
  | 图像 | `u16` 宽、`u16` 高；`u8` alpha（0 不透明、1 掩码）；`u8` display（0 direct、1 nearest）；`u8` 调色板 ID 长度（1–128）；`u8` 目标 ID 长度（direct 为 0，nearest 为 1–128） | 调色板 ID，nearest 的目标调色板 ID；`宽 × 高` 个行优先索引，行 0 在上；alpha 为 1 时再接掩码：每行 `⌈宽/8⌉` 字节，bit 7 为最左，1 为不透明 |
  | 字体 | `u8` 单元宽、`u8` 高、`u16` 映射条数 | 256 × 高字节的字形，字形 g 的第 r 行在 `4 + g × 高 + r`，bit 7 为最左，逐位保留（含单元宽度以外的位）；映射按码位严格升序的 (code, glyph) 字节对 |

  图像引用的 ID 必须是 `palette` kind 的 Asset ID。透明像素的索引与掩码行尾填充位一律为 0：编码器写 0，读取器拒绝非零。字形的绘制颜色与字距不在 payload 中，映射之外的码位没有字形。
- **编码：** `encodePalettePayload`、`encodeImagePayload`、`encodeFontPayload` 校验字段后写入一个独占整个 `ArrayBuffer` 的新缓冲（可直接交给 `payloadTransferList`），同一输入得到同样的字节与 SHA-256；不改动调用者的数组。`palettePayloadLength`、`imagePayloadLength`、`fontPayloadLength` 按字段给出编码长度，供转换器在分配前扣除 `payloadBytes`。
- **读取：** `readPalettePayload`、`readImagePayload`、`readFontPayload` 接受 `(bytes, schemaVersion, path)`，返回带 `kind` 的冻结数据，其中的数组是调用者独占的新副本。schema 不是 1 为 `unsupported-payload-schema`；长度不符（截断或尾随字节）、字段越界、未知的 alpha/display 值、非法或非调色板 ID、非零填充位、透明像素的非零索引、映射乱序或重复为 `invalid-graphics-payload`；已转移的字节为 `payload-detached`。`maskStride` 与 `isOpaque` 按上述掩码约定取每行字节数与单个像素的不透明性。
- **绑定：** [graphics-binding.ts](../../src/content/graphics/graphics-binding.ts) 的 `referencedPalettes` 给出 payload 引用的调色板 ID（去重后升序：direct 为 `{palette}`，nearest 为 `{palette, target}`；调色板与字体没有），`imagePalettes` 对图像的绑定字段给出同样的结果，供转换器生成依赖。`checkGraphicsBinding(descriptor, payload)` 要求描述符的 kind 与 payload 一致，依赖恰好等于这些调色板且 kind 都是 `palette`，否则报 `binding-mismatch`。

- **展开：** [expand-image.ts](../../src/content/graphics/expand-image.ts) 的 `expandImage(image, palettes)` 是项目中唯一的调色板查找。`palettes` 按 Asset ID 提供，必须恰好是图像引用的调色板，否则报 `binding-mismatch@palettes`。结果为冻结的 `{ width, height, rgba }`，`rgba` 是调用者独占的新缓冲，非预乘：不透明像素为显示颜色、alpha 255，透明像素为 (0, 0, 0, 0)。direct 直接查图像的调色板；nearest 先把源调色板逐项映射到目标调色板再查表，因此不透明像素的颜色都属于目标调色板。不透明像素的索引不小于源调色板条目数时报 `palette-index-out-of-range@<path>.indices`，透明像素的索引不参与。展开结果不进入 payload 或缓存。
- **最近色：** 同文件的 `nearestColourMap(source, target)` 对源调色板的每一项取 8 位 RGB 平方欧氏距离最小的目标条目，距离相等取较小索引。这是**暂定的项目规则**：原版的度量与并列规则尚无证据（[U-028](../original/unknowns.md#数据与格式)，研究见 [P2-05/11](../plan/p2/05/subtasks/11-nearest-colour-research.md)），合成测试只验证这个算法，不是保真证据。研究工具与后续 Renderer 复用它，不另写颜色逻辑。
- **字符查找：** [glyph-lookup.ts](../../src/content/graphics/glyph-lookup.ts) 的 `glyphFor(font, code)` 在字符映射中查找文本字节的字形，`glyphsFor(font, text)` 逐个查找字节序列。未映射的码位报 `unmapped-character`（序列中为 `text[<i>]`），即使恰有同号字形也不回退；错误不回显码位。

针对性检查为 `pnpm exec vitest run src/content/graphics`。

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
- **错误：** 失败都抛出 [source-error.ts](../../src/original-data/source-error.ts) 的 `SourceError`。它的 `toData()` 与 P2-02 的 DTO 形状相同，位置形如 `archive[:/路径]`，可后接 `[i]`、`#ID` 或 `#ID.relocations[k]`，只回显通过语法规则的类型标签。P2-03 的全部位置都属于 spec 的封闭语法；[source-error.test-support.ts](../../src/original-data/source-error.test-support.ts) 的 `inLocationGrammar` 按 spec 定义该语法（光盘路径部分复用 `isDiscPath`），各模块测试的失败辅助逐个核对。
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
- **测试数据：** [source.test-support.ts](../../src/original-data/source/source.test-support.ts) 的 `catalogFor` 按合成文件内容生成白名单。

### 图形转换

[P2-05](../plan/p2/05/spec.md) 把原版的调色板、图像记录与字体转换为[图形 payload](#图形-payload)。`original-data/conversion/` 不属于任何能力族，只处理已读取的条目字节，封包经已验证来源取得（见[工程约定](./README.md#lint-规则eslintconfigjs)）。

- **源结构读取：** [source-graphics.ts](../../src/original-data/conversion/source-graphics.ts)（[P2-05/03](../plan/p2/05/subtasks/03-source-hardening.md)）是 DATA、36 字节图像记录、MFDD 记录列表与点阵字体表的唯一读取实现，格式见 [textures](../original/formats/textures.md)、[cockpit](../original/formats/cockpit.md) 与 [hud](../original/formats/hud.md)。
  - `readDataPalette` 要求恰为 768 字节且分量不大于 63（不截断高位），按位复制展开为 8 位 RGB。
  - `readImageRecordHeader(block, offset)` 只读 36 字节头，依次校验位深为 8、+16 为 0、编码为 0 或 2（其余为 `unsupported-encoding`）、宽高与嵌入调色板条目数在 `GRAPHICS_LIMITS` 内（`limit-exceeded`，带限值名与观察值），以及调色板与像素范围在块内（不溢出的比较）。不按声明的规模分配，65535×65535 的头部只凭字段即被拒绝。
  - `decodeImageRecord(block, offset)` 与 `readEmbeddedPalette(block, offset)` 自己从块中重新读取并校验记录头，不接受调用者传入的头部，之后才分配：raw 要求数据恰为宽 × 高并复制；精灵 RLE 拒绝截断、越行与尾随字节，输出透明像素为 0 的索引与规范打包掩码。行序保持存储顺序。嵌入调色板按 BGR 读为 RGB，没有时为 `subresource-not-found`。调用者可先用 `readImageRecordHeader` 取得尺寸扣除预算，再解码。
  - `readMfdRecordOffsets` 返回两个列表中记录的块内偏移，每个列表须整体落在块内，计数因此以块长为界；容器语义归 P2-07。
  - `readFontTable` 要求头部首字节为 0、单元宽与高为 1–8（`limit-exceeded`）、表长恰为 `4 + 256 × 高`，字形逐位复制。CCKD 字体目录须恰为 3 项且都在块内：`readCockpitFonts` 按目录顺序读取全部 3 个字库，`readCockpitFont(block, i)` 只读取 `fonts/<i>`，i 不在 0–2 时为 `subresource-not-found`。
  - 结果都在调用者独占的新缓冲中，可直接交给 `payloadTransferList`。失败抛出 `SourceError`，位置是调用者 `path` 下的字段名：`palette`、`record`、`pixels`、`glyphs` 或 `fonts`，不含条目编号、偏移或字节。
- **转换声明：** [graphics-declarations.ts](../../src/original-data/conversion/graphics-declarations.ts)（[P2-05/04](../plan/p2/05/subtasks/04-graphics-conversion.md)）的 `readGraphicsDeclarations` 严格读取一组声明（字段见 [spec](../plan/p2/05/spec.md#图形转换声明)）：`asset` 为 palette/image/font 且组内 ID 唯一，`role` 与 `group` 按 P2-01 规则读取且该组拥有此 kind；图像的 `palette` 与 nearest 目标都须是同一组声明中同组的调色板，`alpha` 为 `encoding` 或 `{ colourKey }`，`rowOrder` 为 `stored`/`reversed`；字体有预期 `cell` 与按码位互不重叠的 `charMap` 区间。它复用 content 的严格读取原语，任何问题都转为 `invalid-declaration`，位置为 `graphics.declarations[<i>]` 加字段路径。
- **转换器：** [convert-graphics.ts](../../src/original-data/conversion/convert-graphics.ts) 的 `convertGraphics(declarations, sources, limits, usage)` 先读取声明，再按 Asset ID 取得已读入的源块：`data-palette`、`embedded-palette`（`palette` 子资源）、`image-record`（整条目记录）或 `cockpit-font`（`fonts/<i>`）；来源与 kind 不符、缺少来源都是 `invalid-declaration`。依次转换调色板，再转换图像与字体，同类按 ID 排序。
  - 每个 Asset 在读取或分配之前，用 `chargeBudget` 扣除由记录头或声明推得的 `assets`、`dependencyEdges`、`paletteEntries`、`imagePixels`、`glyphs` 与 `payloadBytes`（`palettePayloadLength`、`imagePayloadLength`、`fontPayloadLength` 与编码器共用同一公式）。被拒绝时报 `budget-exceeded`，限值名为维度，总量超出安全整数时 `observed` 为 null；调用者的用量不变。转换用量不扣 `sourceReadBytes`。
  - 颜色键只用于 raw 图像（否则为 `invalid-declaration@…alpha`），值为 k 的像素变为透明；不透明像素的索引不小于所绑定调色板（同组声明的转换结果）的条目数时为 `palette-index-out-of-range@…pixels`；`reversed` 恰好反转索引与掩码的行序。字体按声明的 `cell` 扣除，实际单元不符为 `geometry-mismatch@…glyphs`，`charMap` 区间展开为按码位升序的条目。
  - 结果是按 ID 升序的冻结 `{ descriptor, payload }`：描述符经 `readAssetDescriptor` 生成，依赖为图像引用的调色板（`imagePalettes`），`payloadIdentity` 由实际字节计算；payload 独占缓冲。源结构读取的位置都带上 `graphics[<Asset ID>]` 前缀；任一失败使整组转换失败，不返回部分结果。
- **转换步骤：** [graphics-step.ts](../../src/original-data/conversion/graphics-step.ts)（[P2-05/05](../plan/p2/05/subtasks/05-graphics-step.md)）的 `runGraphicsStep(source, mappings, declarations, limits, usage)`：
  - **共用读取：** 模块内部的 `stepEntryReader(source)` 经 `VerifiedSource.openArchive` 读取，以（光盘路径、条目类型、条目 ID）为键缓存一次步骤内的读取结果，大于 u32 的 ID 与核验一样报 `entry-not-found`。映射核验与转换共用它，同一条目只物理读取一次；缓存随步骤结束释放，没有跨步骤或通用的封包缓存。
  - **配对与子资源：** 先用共用读取核验映射表，再要求每个声明都有映射、每个映射都有声明（否则为 `invalid-declaration`，位置为 `graphics.declarations[<i>]` 或 `graphics.declarations`）。每个映射只能有一个部件，取第一个等价备选。子资源只接受整条目（`null`）、整条目 TEX/BITM 图像记录的 `palette` 与 CCKD 的 `fonts/<i>`（i 为不带前导零的十进制，0–2 以外由读取报 `subresource-not-found`）：DATA 整条目为调色板，TEX/BITM 整条目为图像；其他组合为 `invalid-declaration@graphics[<ID>].palette|record|fonts`。CCKD 元素、MFDD 与 TABL 的容器子资源归 P2-07。
  - **结果：** 转换成功后才把全部映射（含子资源）置为 `verified`，再用 `assetSourceStates` 得到不带定位的状态。返回冻结的 `{ groups, usage }`：`groups` 只含有 Asset 的组，按 `RESOURCE_GROUPS` 排列，每组的 `descriptors`、`payloads`、`sources` 按 ID 升序一一对应；`usage` 是转换用量。任一失败都抛出且没有结果；读取错误保持 P2-02/P2-03 的层、code 与位置，已发出的读取仍计入已验证来源的 `sourceReadBytes`。
- **生产图形：** [production-graphics.ts](../../src/original-data/conversion/production-graphics.ts)（[P2-05/06](../plan/p2/05/subtasks/06-production-graphics.md)）导出本任务的生产声明、映射与预算份额：
  - `PRODUCTION_GRAPHICS_DECLARATIONS`：`palette/flight/models` 与 `palette/flight/cockpit-hud-map`（角色 `flight-palette`，各在本组），`font/hud/8x8-1`、`font/hud/8x8-2`、`font/hud/4x6`（角色 `font`，`cockpit-hud-map`，单元 8×8、8×8、4×6）。字符映射初始为空，由 [P2-05/12](../plan/p2/05/subtasks/12-character-map-research.md) 按证据填入。
  - `PRODUCTION_GRAPHICS_MAPPINGS`：两个调色板共用 `MAIN/SR.NOB` 唯一 DATA 条目的整条目定位（confirmed，textures §1）；三个字库指向 HI 完整驾驶舱组 CCKD 的 `fonts/0`、`fonts/1`、`fonts/2`（likely，U-029，4×6 另加 U-030；cockpit §1 与 hud §1）。条目 ID 与序号来自本地结构核对，只存在于 `original-data`；表的来源指纹为 null，由作业核验时绑定。
  - `PRODUCTION_GRAPHICS_SHARE`：`assets` 5、`paletteEntries` 512、`glyphs` 768、`payloadBytes` 16,384（按结构上限与头部算出的上界不超过它），其余维度为 0；源读取沿用 P2-02 的默认限值，不另加份额。
  - [production-graphics.test-support.ts](../../src/original-data/conversion/production-graphics.test-support.ts) 按生产映射的定位生成合成封包（DATA 与带 3 个字库的 CCKD），供 Node、作业与浏览器测试使用。
- **错误扩展：** [source-error.ts](../../src/original-data/source-error.ts) 的 code 追加 `invalid-payload`、`unsupported-encoding`、`budget-exceeded`、`palette-index-out-of-range`、`subresource-not-found`、`invalid-declaration`、`geometry-mismatch`；限值名追加 `imageWidth`、`imageHeight`、`paletteEntryCount`、`fontCellWidth`、`fontHeight` 与 P2-01 的预算维度；`observed` 允许为 null，只用于超出安全整数的预算总量。P2-03 已有 code 与限值的含义不变。
- [payloads.ts](../../src/original-data/payloads.ts) 只保留 ID 列表与 MESH/MODL 的研究用解析器及 `PayloadError`（归 P2-06），不再有第二套图像、调色板或字体解析。

合成样本、声明、封包与映射由 [conversion.test-support.ts](../../src/original-data/conversion/conversion.test-support.ts) 在代码中生成；其中 `inGraphicsLocationGrammar` 按 spec 定义转换错误的位置语法（声明组 `graphics.declarations`、声明字段路径或 `graphics[<ID>].<字段>`），`expectSourceError` 对 `graphics` 开头的位置逐个核对。针对性检查为 `pnpm exec vitest run src/original-data/conversion`。

### 导入 Worker

[P2-04](../plan/p2/04/spec.md) 在专用模块 Worker 中运行导入作业，消息与生命周期契约以 spec 为准。当前已实现：

- **消息协议：** [workers/import-protocol.ts](../../src/workers/import-protocol.ts) 只依赖 `content/`，app 与 platform 都可以导入它。
  - `IMPORT_PROTOCOL_VERSION` 为 2（P2-05 增加阶段时由 1 递增）。`IMPORT_STAGES` 依次为 `identify-source`、`convert-graphics`。`canReportStage(latest, stage, identified)` 是唯一的阶段顺序规则，宿主与持有者共用：阶段只按这个顺序前进，识别进度只在 `identified` 之前，后续阶段只在它之后。`IMPORT_FILE_LIMITS` 规定 1–4 个文件，名称为 1–255 个 UTF-16 码元。
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
    - 阶段只能按 `IMPORT_STAGES` 的顺序前进：`identified` 至多一次，识别进度只在它之前，后续阶段的进度只在它之后，进入后续阶段后不再有较早阶段的进度；组须在识别之后，且每组一次；作业须先识别才能正常结束。违反时作业以 `internal-error` 失败，作为作业缺陷的防线。
    - 身份只发送版本 ID 与指纹。
  - **转移：** 发送组前，用 `readPayloadRecords` 与 `payloadTransferList` 计算转移列表，位置以 `groups.<组>.payloads` 为根。非独占、别名、已转移或乱序的 payload 以 `content` 层失败，该组不发送。发送后，作业持有的 payload 视图失效。
  - **终态：** 作业返回的用量经 `readBudgetRecord` 读取，再随 `finished` 与已发送的组一起发送。终态消息之后关闭端点，之后的报告与消息都被忽略。
  - **错误转换：**
    - `DiscReadError`、`SourceError` 按层转换，其余字段取自 `toData()`；
    - `ContentContractError` 转为 `content` 层，`location` 取 `path`；
    - 其他异常、非 Error 值与 `unhandledrejection` 都报 `internal-error@job`，原因是固定文本。宿主取消 `unhandledrejection` 的默认报告。
- **导入作业：** [workers/import-job.ts](../../src/workers/import-job.ts) 的 `createImportJob(open, graphics)` 返回生产作业。
  - **计量：** 每个文件包装为 `BlobByteSource`，外加一层计量。每个阶段开始时报告一次进度，之后端口每次读取成功返回，报告当前阶段与跨阶段累计的实际返回字节：识别阶段从 0 开始，图形阶段从识别结束时的累计值开始。
  - **识别：** 经 `open` 打开并识别，成功时报告 `identified`（版本 ID 与指纹）。
  - **图形转换（P2-05）：** 识别之后运行 [图形转换步骤](#图形转换)。限值记录为 P2-02 的默认读取限值（输入总字节，即 `sourceReadBytes`）加上步骤批准的份额；作业返回已验证来源最终的读取用量与转换用量逐维之和。步骤结果只留在作业内，供 P2-06/07 装配组结果；本任务不发送组，`finished.groups` 为空。转换失败为 `source` 层，图形阶段的读取失败保持 P2-02 `disc` 层或 P2-03 `source` 层的原 code 与位置，都原样交给宿主转换。
  - **注入点：** `open` 默认是产品入口 `openVerifiedSource`，不传 `limits`，沿用 P2-02 的默认预算。`graphics`（`GraphicsStepInput`：映射、声明与份额）默认是 [生产图形](#图形转换)的声明、映射与份额。限值与用量用 `addBudgets` 逐维相加。只有测试传入其他打开函数或图形输入，用合成白名单识别。
- **生产入口：** [workers/import-worker.ts](../../src/workers/import-worker.ts) 把 `self` 断言为 `ImportHostEndpoint`，再用 `createImportJob()` 调用 `runImportHost`，不含其他逻辑。页面程序没有 WebWorker 类型，所以不另设类型程序。
- **测试支持：** [synthetic-import.test-support.ts](../../src/workers/synthetic-import.test-support.ts) 的 `syntheticImport(covered, versionId)` 在 Node 与浏览器中都可用。
  - 它用 `syntheticFileDisc` 生成光盘（另含一个不读取的 1 MiB 填充文件，以免默认预算被耗尽），按块读出为名称含 `MARKER` 的 `File`。
  - 同时返回一个打开函数：用底层的 `openDiscImage` 与 `identifySource`，按 `catalogFor(covered)` 识别。
  - 同文件的 `syntheticGroupsJob(open, groups)` 先经注入的打开函数识别，以 `NO_GRAPHICS`（不转换任何 Asset）运行图形阶段，再发送 `groups(指纹)` 给出的组，供只关心识别与组转移的测试使用；默认的 `boundGroups` 是绑定已识别指纹的四个合成组。生产图形的合成光盘由 [production-graphics.test-support.ts](../../src/original-data/conversion/production-graphics.test-support.ts) 的 `productionGraphicsFiles` 生成，可替换或省略条目。
  - 同文件的 `syntheticOpen(covered, versionId)` 是单独的合成白名单识别；`productionSizedFiles()` 按生产白名单的路径与大小生成内容（`generatedContent`），形状与基准版本相同，内容从不是原版。
  - 测试 Worker 入口 [import-worker.test-support.ts](../../src/workers/import-worker.test-support.ts) 与生产入口共用宿主，由 Worker 的 `name` 选择场景。`synthetic` 场景识别生产尺寸的合成文件后发送四个组，并在结束前确认发送过的 payload 视图都已失效，否则作业失败，因此正常结束即证明组是转移而非复制。`graphics` 与 `graphics-corrupt` 场景（P2-05）对 `graphicsCoveredFiles()` 给出的生产图形结构合成光盘运行带图形步骤的生产作业，后者的 4×6 字库表少一个字节；页面与 Worker 用同一函数生成光盘，期望的 payload 字节数由 `GRAPHICS_PAYLOAD_BYTES` 按 payload 长度公式给出。其余生命周期与失败场景见[工程约定](./README.md#本地浏览器-runner)。
  - [import-host.test-support.ts](../../src/workers/import-host.test-support.ts) 的 `FakeEndpoint` 记录监听、发送、转移列表与关闭，并用协议读取函数核对宿主发出的每条消息，供宿主与作业的 Node 测试共用；`portEndpoint(port)` 把 Node `MessageChannel` 的一端包装为宿主端点。
- **集成测试：** [app/import/import-pipeline.test.ts](../../src/app/import/import-pipeline.test.ts) 用 Node `MessageChannel` 把真实的持有者、平台适配、宿主与合成作业连在一起：消息经结构化克隆，组的 payload 以转移交出。它核对发送方视图失效、接收方验证与移交、每层失败经往返后与宿主转换的 DTO 相等、文件名只出现在 `start` 中，以及结束后不留下打开的 `MessagePort`。P2-05 另核对图形阶段：识别进度 → `identified` → 图形进度 → `finished`（组为空、用量含转换维度），以及识别失败、图形阶段读取失败（缺少条目、识别后端口拒绝读取）与转换失败各自保持层、code 与位置，快照停在相应阶段且没有部分结果。
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
    - 进度的字节数不得减少或超过输入总字节（`message.readBytes`）；阶段只能按 `IMPORT_STAGES` 的顺序前进，识别之前不得有后续阶段的进度，识别之后或进入后续阶段之后不得再有较早阶段的进度（`message.stage`）；
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
| P4 | `core/save/`；内容模块的战役/任务数据；`render/cockpit/`；UI 简报、结果等页面；`platform/audio/`、`video/`、`music/` | 媒体实现由 spike/ADR 确定，不在目录方案中选解码器；存档模型与持久化分开 |
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
