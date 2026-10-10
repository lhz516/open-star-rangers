---
type: guide
status: active
phase: all
updated: 2026-10-09
related: [ADR-0002, ADR-0006, ADR-0015]
---

# 源码结构与模块边界

本指南维护当前目录、代码归属、后续扩展方向及路径迁移对应关系；各模块已交付代码的 API 与契约要点见[模块分册](#模块说明)。决定见 [ADR-0015](../decisions/ADR-0015-source-module-structure.md)；顶层架构和数据流见[总计划 §4–5](../plan/master-plan.md#4-总体架构)，工具链与检查规则见[工程约定](./README.md)，规划与验收分工见[任务工作流](./agent-workflow.md)。

## 当前目录

以下只列生产文件；`*.test.ts` 与所属源码同目录，测试支持（`*.test-support.ts`，例如 Session 的 `synthetic-session.test-support.ts` 与原版格式合成样本 `original-data/synthetic.test-support.ts`）同样随模块维护。

```text
src/
  main.tsx
  app/
    App.tsx
    ImportScreen.tsx
    ViewerScreen.tsx
    app.css
    browser-ports.ts
    ports.ts
    composition/
      synthetic-demo-lifecycle.ts
      synthetic-demo-owner.ts
      use-resource-holder.ts
      use-synthetic-demo-owner.ts
      use-viewer-owner.ts
    flow/
      app-flow.ts
    import/
      import-worker-port.ts
      import-job-owner.ts
      use-import-job.ts
    resources/
      mission-diagnostics.ts
      resource-holder.ts
      resource-status.ts
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
    viewer/
      viewer-audio.ts
      viewer-items.ts
      viewer-owner.ts
  core/
    errors.ts
    contracts/
      canonical-text.ts
      domain-events.ts
      limits.ts
      tick-input.ts
      time.ts
      validation.ts
    determinism/
      rng.ts
      fnv1a64.ts
    mission/
      load-mission.ts
    projections/
      projection.ts
      render-state.ts
    replay/
      compare.ts
      recording.ts
      replay.ts
      rules-version.ts
      snapshot.ts
    rules/
      coordinates.ts
      float32.ts
      name-assignment.ts
      original-random.ts
      placement.ts
      record-defaults.ts
      spawn-schedule.ts
    synthetic/
      synthetic-scene.ts
      synthetic-snapshot.ts
      synthetic-replay.ts
    systems/
      pipeline.ts
      spawn.ts
    world/
      create-world.ts
      entity-table.ts
      player-state.ts
      run-config.ts
      setup-check.ts
      setup-hash.ts
      spawn-state.ts
      world-state.ts
      world.ts
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
    canonical-json.ts
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
    effects/
      effect-payload.ts
      expand-effects.ts
    hud/
      status-messages-payload.ts
      view-labels-payload.ts
      hud-text-payload.ts
    rule-data/
      rule-data-fields.ts
      craft-info.ts
      debris-parameters.ts
      ai-programs.ts
      comm-menus.ts
      base-repair-items.ts
      flight-messages.ts
      rule-data-payload.ts
    flight/
      flight-data-content.ts
      flight-data-readers.ts
      flight-data-payload.ts
  original-data/
    imfat.ts
    payloads.ts
    source-mapping.ts
    source-error.ts
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
      le-executable.ts
      craft.ts
      debris.ts
      ai.ts
      comm.ts
      base-repair.ts
      executable-text.ts
      rens-header.ts
      view-labels.ts
      anim.ts
      explosion.ts
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
      source-messages.ts
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
      effect-declarations.ts
      effect-step.ts
      production-effects.ts
      production-executable.ts
      convert-rule-data.ts
      production-rule-data.ts
      production-flight-graphics.ts
      production-hud-text.ts
      flight-data-step.ts
      production-flight-data.ts
      production-flight-sounds.ts
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
    viewer/
      viewer-display.ts
      viewer-effects.ts
      viewer-pictures.ts
      viewer-presentation.ts
      viewer-renderer.ts
      viewer-solids.ts
      viewer-textures.ts
      viewer-view.ts
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
    import/
      FailureNotice.tsx
      ImportPage.tsx
      ResourceStatusList.tsx
      failure-copy.ts
      resource-copy.ts
    pages/
      MainMenuPage.tsx
      SyntheticDemoPage.tsx
      use-focus-on-mount.ts
    render/
      SyntheticRenderView.tsx
    viewer/
      ViewerAudioPanel.tsx
      ViewerPage.tsx
      viewer-copy.ts
      viewer-keys.ts
  workers/
    import-protocol.ts
    import-host.ts
    import-job.ts
    import-worker.ts
    production-package.ts
```

### 模块说明

各模块已交付代码的当前 API 与契约要点按模块分册维护；本指南只维护目录树、职责边界、helper 归属、扩展落点与迁移记录。修改模块代码的任务更新对应分册，新增、移动或删除文件时同步上方目录树；不在本指南追加 API 细节。

| 分册 | 内容 |
|---|---|
| [core](./modules/core.md) | 正式、合成与中性模块的边界；Core 任务载入；正式 Core 的创建、世界、契约、流水线、原版规则辅助、读模型、快照与 replay，上限、扩展规则、已知差异与交接 |
| [content](./modules/content.md) | 基础契约与切片定义，图形、状态显示屏文字、模型与效果 payload，规范 JSON 与规则数据、飞行数据、视角标签与 HUD 文字 payload |
| [original-data](./modules/original-data.md) | 光盘、封包、版本识别与来源映射，任务、规则与飞行数据解析，图形、逻辑、规则数据、音频、模型、效果与飞行数据转换 |
| [workers](./modules/workers.md) | 导入 Worker 的协议、宿主、作业与生产包配置 |
| [app](./modules/app.md) | 页面流转与演示生命周期，资源持有者，查看器音频与所有者 |
| [ui](./modules/ui.md) | 投影 store、会话桥接与命令反馈，页面组件，失败文案 |
| [render](./modules/render.md) | 视口、WebGL 表面、合成渲染与资源查看渲染 |
| [platform](./modules/platform.md) | 资源缓存与音频播放端口 |

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

### Core 内部目录

`src/core/` 的模块分为正式、合成与中性三类；正式与合成互不导入，中性模块两侧都不导入，由 lint 与依赖图回归检查（[工程约定](./README.md#lint-规则eslintconfigjs)）。API 与契约见 [Core 模块说明](./modules/core.md)。

| 目录 | 类别 | 职责 |
|---|---|---|
| `errors.ts`、`determinism/` | 中性 | 输入错误与内部故障错误；带种子的 RNG 与 FNV-1a 哈希 |
| `mission/` | 正式 | 由三份逻辑 Asset 载入冻结的 `MissionSetup`（P2-09） |
| `contracts/` | 正式 | 跨目录共用的契约：上限、时钟、动作输入、领域事件、规范文本与校验读取器 |
| `world/` | 正式 | 世界创建与运行配置、语义校验、setupHash；世界与故障锁存；世界状态、实体表、玩家状态与生成状态 |
| `systems/` | 正式 | 唯一的有序阶段表与本 tick 的请求处理；各阶段的系统（目前是生成阶段），规则任务在自己的阶段接入 |
| `rules/` | 正式 | 按原版代码实现的确定性规则辅助（只经 `RandSource` 抽取并修改显式传入的世界计数）：坐标换算与 f32 数值、原版随机映射、放置、缺省值、排程与名称；只在真实复用时提取 |
| `projections/` | 正式 | 按分区的 projection 与 Render State，深度冻结、与世界脱离 |
| `replay/` | 正式 | 正式快照与状态哈希、规则版本、录制、replay 与结果比较 |
| `synthetic/` | 合成 | P1 合成场景、快照与 replay；格式与正式格式互不兼容 |

## 文件与 helper 归属

- 一个调用者使用的 helper 默认留在同文件；同模块复用时按能力命名并提取到该模块。跨模块先寻找已有 owner 或公共契约，不用全局 utils/shared/types/services 兜底。
- 时钟与总线属于 Runtime，RNG 与状态一致性哈希属于 Core；FNV-1a 不是内容来源指纹、安全哈希或防篡改机制。
- 正式 Core 的结构与数值读取器在 [core/contracts/validation.ts](../../src/core/contracts/validation.ts)（P3-02）；合成场景保留自己的读取器与 marker 坐标、ID 和输入规则，因为正式与合成模块互不导入（见下文 [Core 内部目录](#core-内部目录)）。
- 公共类型跟随 owner；`AssetId` 归内容，`Command` 归 Core，`SessionHost` 归 Session。不建立统一大 schema 或全局 barrel，也不要求一函数一文件。
- `core/synthetic/` 是明确标记的合成规则，不是测试支持目录。合成 Command/Event、snapshot/replay 的形状和版本不得通过重命名变成正式玩法契约。Runtime 与 Session 同样保留 synthetic 命名，正式复用在第二个真实场景出现后设计。
- 新单元测试继续邻接源码；测试支持在所属模块内维护，不进入生产导入链。TSX 单元测试尚未配置；P1-10 的 E2E 已用独立 `.spec.ts` runner/type/lint 接入，不扩大既有 `.test.ts` 的 Vitest 发现。

### 浏览器测试目录与证据分层

仓库根 [e2e/](../../e2e/)属于测试，不是 app/platform 模块，也不进入网站导入链。[配置](../../playwright.config.ts)和[独立tsconfig](../../tsconfig.e2e.json)允许 Node runner 与 evaluate 的 DOM 类型，但 Core/Node 程序仍无 DOM。命令、已有浏览器准备、origin/端口所有权、headed CDP 与输出清理见[工程约定](./README.md#本地浏览器-runner)。

- bootstrap、probe-contract、interaction-render、joint-resources、browser-replay、native-lifecycle、webgl-unavailable 各自承担独立验收面；P1-12增加rights DOM和仅production的许可产物可读性用例。[P1-10覆盖/历史适用性](../plan/p1/10/subtasks/07-evidence-docs-alignment.md#完成证据)、[P1-12相关证据](../plan/p1/12/subtasks/08-local-evidence-docs.md#完成证据)及[P1-14当前完整回归](../plan/p1/14/subtasks/03-browser-exit-checks.md#完成证据)分别保留各候选的实际结果，阶段判定见[退出评审](../reviews/P1-exit.md)。
- `e2e/support/`按测试能力放 environment、只读宿主探针、错误fixture、DOM/采样、截图/布局与CDP relay，不建立生产debug/world写入API。输入走可信UI/浏览器协议，replay只导入公开纯模块创建独立scene。
- Node 单元测试继续证明纯规则、通知/旧回调、注册失败/回滚/稀有错误；持久E2E证明真实DOM/图形/宿主生命周期与联合资源。仍适用的人工HMR/window/DPR证据直接复用，不自动改源码，不把本机Chromium结果说成Safari/系统快捷键/目标GPU/原版保真。
- `tools/e2e-configuration.test.ts`是 Node 接入与项目设置回归：读取 Playwright 配置并列出用例，不启动浏览器或需要已安装浏览器；真正浏览器验收独立运行`pnpm test:e2e`，不由`pnpm check`替代。报告与合成截图只有ignored测试目录，不是产品资源。

## 后续扩展方向

本节是职责落点，不是已批准文件/API 清单；P1、P2、P3 的实际任务分别见 [P1 tasks](../plan/p1/tasks.md)、[P2 tasks](../plan/p2/tasks.md)、[P3 tasks](../plan/p3/tasks.md)，已实现目录以上文为准。后续范围由[总计划 §12](../plan/master-plan.md#12-开发阶段与验收条件)定义。仅在实际交付代码时创建目录。

| 阶段 | 推荐的模块内结构 | 边界 |
|---|---|---|
| P1-06/07/08/09/10 | `ui/game/`、`ui/pages/`、`ui/dev/`；`render/scene/`、`render/viewport/`、`render/synthetic/`；`platform/input/`；必要时 `app/composition/`；仓库根 `e2e/` | 消费者各自实现订阅与释放，应用装配，不增游戏循环 |
| P2（已交付） | `original-data/io/`、`disc/`、`archive/`、`formats/`、`source/`、`conversion/`；`content/` 按数据类别组织；`platform/files/`、`storage/`、`audio/`；`workers/` | 纯字节读取端口由解析层定义，File/fs 实现分别在平台/工具；转换数据不写入仓库 |
| P3 | `core/contracts/`、`world/`、`systems/`、`rules/`、`projections/`、`replay/`（P3-02 已交付，规则任务在其中扩展）；`render/cockpit/` | 真实系统显式按固定顺序执行；不得把合成 marker 契约改名使用 |
| P4 | `core/save/`；内容模块的战役/任务数据；UI 简报、结果等页面；`platform/video/`、`music/`（音效播放端口 `platform/audio/` 已由 P2-08 交付） | 媒体实现由 spike/ADR 确定，不在目录方案中选解码器；存档模型与持久化分开 |
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

## P3 前整理记录

2026-10-08 P3 开始前的整理，不改行为：

| 历史位置 | 当前位置 |
|---|---|
| 本指南“当前目录”下的各模块 API 小节与 platform 存储/音频说明 | [modules/](./modules/) 下按模块分册（见[模块说明](#模块说明)）；小节标题与锚点不变，platform 两段新增“资源缓存”“音频播放”标题 |
| `src/original-data/synthetic.ts` | [src/original-data/synthetic.test-support.ts](../../src/original-data/synthetic.test-support.ts) |

- **原因：** P2 期间本指南被 117 次提交修改，P3 的并行任务若继续向同一文件追加 API 说明会相互冲突；分册后各任务只改自己模块的分册与目录树中对应的行。合成格式样本只被测试、测试支持与工具测试导入，改名后归入测试支持，现有[工程边界](./README.md#lint-规则eslintconfigjs)即禁止生产代码导入它。
- **范围：** 文件内容与导出符号不变，只调整 44 处导入路径；文档中指向移动小节与该文件的 Markdown 链接改到现位置，当前指南的文字一并更新，历史任务文档中的文字、命令与验收结论保留原样。已批准 spec 的 `reviewed:` 标记不参与路由，本次不修改。
- **验证：** `pnpm check` 通过（TypeScript、ESLint、156 个测试文件 / 4691 项 Vitest 测试、生产构建）；以 lint 探针确认生产模块导入 `synthetic.test-support.ts` 被拒绝。移动小节的正文去掉链接目标后与原文逐行一致，差异只有新增的分册说明与概览、platform 的两个标题，以及两处跨分册的“见上文”改为直接链接。全仓库 Markdown 本地链接与锚点检查结果与整理前相同，只剩 9 处整理前已失效的历史锚点。P1、P2 已完成任务的路由仍为 done。
