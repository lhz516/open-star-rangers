---
type: guide
status: active
phase: all
updated: 2026-10-16
related: [ADR-0002, ADR-0006, ADR-0015]
---

# 源码结构与模块边界

本指南维护当前目录、代码归属、后续扩展方向及路径迁移对应关系；各模块已交付代码的 API 与契约要点见[模块分册](#模块说明)。决定见 [ADR-0015](../decisions/ADR-0015-source-module-structure.md)；顶层架构和数据流见[总计划 §4–5](../plan/master-plan.md#4-总体架构)，工具链与检查规则见[工程约定](./README.md)，规划与验收分工见[任务工作流](./agent-workflow.md)。P3-04 删除的 P1 合成演示路径、删除前的提交与替代模块见[合成演示退役记录](#p3-04-合成演示退役记录)。

## 当前目录

以下只列生产文件；`*.test.ts` 与所属源码同目录，测试支持（`*.test-support.ts`，例如 Session 的 `session-host.test-support.ts` 与原版格式合成样本 `original-data/synthetic.test-support.ts`）同样随模块维护。

```text
src/
  main.tsx
  app/
    App.tsx
    ImportScreen.tsx
    MissionScreen.tsx
    ViewerScreen.tsx
    app.css
    app-version.ts
    browser-ports.ts
    ports.ts
    composition/
      mission-slot.ts
      use-mission-owner.ts
      use-resource-holder.ts
      use-viewer-owner.ts
    flow/
      app-flow.ts
    import/
      import-worker-port.ts
      import-job-owner.ts
      use-import-job.ts
    mission/
      dev-frame-timing.ts
      mission-eligibility.ts
      mission-flow.ts
      mission-owner.ts
      mission-ports.ts
    resources/
      mission-diagnostics.ts
      mission-input.ts
      resource-holder.ts
      resource-status.ts
    runtime/
      fixed-step-clock.ts
      game-event-bus.ts
      game-runtime.ts
      runtime-errors.ts
    session/
      game-session.ts
      rollback-error.ts
      session-host.ts
      session-errors.ts
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
      combat.ts
      communications.ts
      projection.ts
      render-state.ts
    replay/
      compare.ts
      recording.ts
      replay.ts
      rules-version.ts
      snapshot.ts
    rules/
      active-area.ts
      base-service.ts
      collision-shapes.ts
      collision.ts
      combat-init.ts
      comm-menus.ts
      comm-reactions.ts
      coordinates.ts
      damage.ts
      displays.ts
      docking.ts
      energy.ts
      explosions.ts
      firing.ts
      flight-control.ts
      flight-motion.ts
      flight-state.ts
      float32.ts
      fragments.ts
      full-repair.ts
      guidance.ts
      hit-tests.ts
      initial-ai.ts
      load-transforms.ts
      mounts.ts
      movement-builders.ts
      name-assignment.ts
      original-random.ts
      parked-engagement.ts
      parked-travel.ts
      placement.ts
      projectile-motion.ts
      radar.ts
      radio.ts
      random-direction.ts
      record-defaults.ts
      spawn-schedule.ts
      speed-match.ts
      steering.ts
      subsystems.ts
      targeting.ts
    systems/
      area.ts
      base-interior.ts
      base-response.ts
      collision.ts
      comm-reactions.ts
      commands.ts
      communications.ts
      damage.ts
      destruction.ts
      displays.ts
      docking.ts
      energy.ts
      flight-control.ts
      launch.ts
      missiles.ts
      movement.ts
      parked-engagement.ts
      pipeline.ts
      projectiles.ts
      radio.ts
      spawn.ts
      targeting.ts
      weapons.ts
    world/
      comm-input.ts
      craft-info-input.ts
      create-world.ts
      entity-table.ts
      player-state.ts
      rule-data.ts
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
      comm-messages.ts
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
      comm-face.ts
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
      browser-seed.ts
      browser-session-host.ts
      browser-timer.ts
      leave-guard.ts
      seed.ts
      timer.ts
    files/
      blob-byte-source.ts
      browser-file-save.ts
      file-save.ts
    input/
      browser-keyboard-source.ts
      browser-pointer-lock.ts
      keyboard-input.ts
      pointer-lock.ts
      keyboard-source.ts
    storage/
      browser-resource-cache.ts
      resource-cache-contract.ts
      resource-cache-records.ts
    workers/
      worker-port.ts
      browser-import-worker.ts
  render/
    map/
      browser-map-cursor.ts
      map-cursor.ts
      map-input-geometry.ts
    scene/
      cleanup.ts
      render-surface.ts
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
      MissionDevPanel.tsx
      command-draft.ts
      entity-inspection.ts
      event-log.ts
      frame-stats.ts
      mission-diagnostics.ts
      recording-export.ts
    game/
      describe-error.ts
      game-command-feedback.ts
      game-session-bridge.ts
      game-store.ts
      use-game.ts
    game-input/
      bindings.ts
      capabilities.ts
      input-action.ts
      input-consumer.ts
      input-state.ts
      input-status.ts
      key-repeat.ts
      map-input.ts
      map-input-policy.ts
      page-intercept.ts
    import/
      FailureNotice.tsx
      ImportPage.tsx
      ResourceStatusList.tsx
      failure-copy.ts
      resource-copy.ts
    mission/
      BasePage.tsx
      GameInputZone.tsx
      InputNotices.tsx
      MissionMenuPage.tsx
      MissionPage.tsx
      MissionParts.tsx
      MissionShell.tsx
      PlaceholderPage.tsx
      StartConfigPage.tsx
      base-page.ts
      input-notices.ts
      mission-copy.ts
      page-keys.ts
      slice-gaps-copy.ts
      use-input-focus.ts
    pages/
      MainMenuPage.tsx
      use-focus-on-mount.ts
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
| [core](./modules/core.md) | 模块边界；Core 任务载入；正式 Core 的创建、规则数据输入与静态规则数据、世界、契约、流水线，飞行控制、运动与停放，战斗规则，通讯、停靠与基地服务，原版规则辅助、读模型、快照与 replay，上限、扩展规则、已知差异与交接 |
| [content](./modules/content.md) | 基础契约与切片定义，图形、状态显示屏文字、模型与效果 payload，规范 JSON 与规则数据、飞行数据、视角标签与 HUD 文字 payload |
| [original-data](./modules/original-data.md) | 光盘、封包、版本识别与来源映射，任务、规则与飞行数据解析，图形、逻辑、规则数据、音频、模型、效果与飞行数据转换 |
| [workers](./modules/workers.md) | 导入 Worker 的协议、宿主、作业与生产包配置 |
| [app](./modules/app.md) | 正式 Runtime 与游戏会话，任务流程、所有者与槽位，资源持有者，查看器音频与所有者 |
| [ui](./modules/ui.md) | 游戏 store、会话桥接与命令反馈，任务页面、基地页面与缺省标注文字，开发诊断，失败文案 |
| [render](./modules/render.md) | 视口、WebGL 表面与资源查看渲染 |
| [platform](./modules/platform.md) | 资源缓存、音频播放、任务端口的浏览器适配与键盘源 |

## 职责与依赖

P1-09 的 [platform/input/](../../src/platform/input/) 提供通用事件、按住轴、源端口与监听管理；它的合成五键消费者已随合成演示退役（[R6](#r6-合成-ui-层)）。P3-05 的 [ui/game-input/](../../src/ui/game-input/) 是正式任务键位消费者，接入平台键盘源、能力生命周期与地图输入；平台层不识别游戏动作。消费者不导入浏览器连接、不调度 tick，经任务所有者以 `input` 阶段登记，经会话的运行句柄设置意图与提交命令。running 状态的失焦/退出 Pointer Lock 清键只能调用 `GameInputConsumer.clear(reason)`，再由它通知 session 的 `clear-input`；消费者外不得绕过它清会话输入。地图输入使用 `render/map/` 的纯 CSS 像素几何与光标，地图规则仍归 Core/后续规则任务。绑定、上下文与证据见独立[键位文档](./keyboard-input.md)，不代表原版操控或系统快捷键拦截。

| 模块 | 拥有的职责 | 不应承担 |
|---|---|---|
| `app/` | 应用装配、页面流转、跨模块导入/启动/保存流程 | 游戏规则、GPU 实现、浏览器解析器 |
| [app/runtime/](../../src/app/runtime/) | 固定步长、连续意图与按住开火、命令队列与每 tick 批次、调用 Core、帧后事件、同 tick 读模型与两帧 Render State、开发录制 | DOM 监听、第二条游戏循环、UI 成功状态 |
| [app/session/](../../src/app/session/) | 控制通道、唯一帧调度许可、运行身份、出发保持与停止、通知边界、运行级消费者与清理 | 重复模拟世界、媒体/Worker 空实现 |
| [app/mission/](../../src/app/mission/) | 开始资格、任务流程、占位计时、运行创建、重开与返回、所有者级资源与离页保护的所有权（DOM-free，宿主能力经端口） | React、DOM、规则判定、运行中的 Core 衔接 |
| [ui/game-input/](../../src/ui/game-input/) | 生产键位表、上下文解析、游戏输入消费者、宿主能力与地图输入；通过 app 所有者 input 阶段使用运行句柄 | 平台事件采集、Core 规则实现、第二条调度循环 |
| [render/map/](../../src/render/map/) | 地图输入与显示共用的纯 CSS 像素几何、地图光标绘制 | 地图规则、DOM 事件采集、游戏调度 |
| [core/](../../src/core/) | 权威状态、规则、step、纯投影、确定性、纯 replay/存档模型 | 宿主时间/随机、异步、UI、渲染、平台 I/O |
| [original-data/](../../src/original-data/) | 原版字节/格式、版本识别、解析与规范化转换 | Three.js 对象、IndexedDB、正式运行世界 |
| `content/` | 内部内容契约、Asset ID、内容版本、任务与逻辑定义 | 原版资源文件、浏览器加载/GPU/存储实现 |
| `render/` | 实体映射、相机、插值、GPU 资源、Classic 驾驶舱/HUD/MFD、效果 | 权威坐标/血量/胜负、直接解析原版封包 |
| `ui/` | React 页面、vanilla stores、projection 桥接、指令反馈、开发诊断面板 | 整个世界副本、逐帧模拟、Classic 飞行 DOM HUD |
| [platform/](../../src/platform/) | 文件、输入、音视频、存储、种子、计时与浏览器生命周期实现 | 权威规则、业务成功判定 |
| `workers/` | 导入/转换入口与消息协议、调用纯解析器 | 主模拟迁移或重复解析实现 |

### 调度与装配

Runtime 只处理宿主提供的时间并推进 Core；Session 持有唯一请求凭证，平台宿主实现真实 rAF/页面事件。任务所有者（[app/mission/](../../src/app/mission/)）持有会话，按阶段连接 UI 桥接、开发诊断等所有者级资源与离页保护，运行级消费者随每个运行登记与释放；应用槽位保证同一时刻至多一个所有者。

消费者使用公开运行句柄或传入的只读数据，不调用内部 frame/step/publish。UI、渲染和输入不建立另一条游戏 rAF。端口由需求方定义，例如 [session-host.ts](../../src/app/session/session-host.ts) 归 Session、[mission-ports.ts](../../src/app/mission/mission-ports.ts) 归任务流程，而 [browser-session-host.ts](../../src/platform/browser/browser-session-host.ts) 与 `platform/browser/`、`platform/files/` 的适配实现它们；平台对端口的类型依赖不意味着可导入应用装配。

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

存档内容、校验和纯迁移属于 Core；IndexedDB 事务、配额与读写错误属于平台；保存时机和恢复编排属于应用；槽位和错误提示属于 UI。

### Core 内部目录

`src/core/` 的模块都属于正式 Core（P1 合成场景已于 P3-04 退役，见 [R1](#r1-合成-core)）；纯度与确定性规则由 lint 与工程边界回归检查（[工程约定](./README.md#lint-规则eslintconfigjs)）。API 与契约见 [Core 模块说明](./modules/core.md)。

| 目录 | 职责 |
|---|---|
| `errors.ts`、`determinism/` | 输入错误与内部故障错误；带种子的 RNG 与 FNV-1a 哈希 |
| `mission/` | 由三份逻辑 Asset 载入冻结的 `MissionSetup`（P2-09） |
| `contracts/` | 跨目录共用的契约：上限、时钟、动作输入、领域事件、规范文本与校验读取器 |
| `world/` | 世界创建与运行配置、机型输入、规则数据输入与静态规则数据（`rule-data.ts`，P3-07；通讯输入的检查与通讯规则数据 `comm-input.ts`，P3-10）、语义校验、setupHash；世界与故障锁存；世界状态、实体表（含飞行状态与战斗状态）、玩家状态（含目标、控制状态与 P3-07 的瞄准、战斗记录与驾驶舱显示状态，P3-10 的停靠对象、通讯与停靠位姿）与生成状态；P3-10 的任务流程子状态、无线电、友伤累计与基地服务在世界状态中 |
| `systems/` | 唯一的有序阶段表与本 tick 的请求处理；各阶段的系统：生成、玩家更新与操纵（`flight-control.ts`）、运动、活动区域与停放（`area.ts`）；P3-07 的命令分派（`commands.ts`）、目标（`targeting.ts`）、武器与发射（`weapons.ts`、`launch.ts`）、弹丸（`projectiles.ts`）、导弹（`missiles.ts`）、伤害（`damage.ts`）、毁伤、爆炸与碎片（`destruction.ts`）、碰撞（`collision.ts`）、能量（`energy.ts`）、驾驶舱显示步（`displays.ts`）与停放交战（`parked-engagement.ts`）；P3-10 的通讯菜单判定与命令投递（`communications.ts`）、基地回应（`base-response.ts`）、无线电与来电（`radio.ts`）、通讯反应与报告（`comm-reactions.ts`）、停靠等待、停靠与离港（`docking.ts`）、基地服务与完全修理（`base-interior.ts`）。规则任务在自己的阶段接入 |
| `rules/` | 按原版代码实现的确定性规则辅助（只经 `RandSource` 抽取，并修改显式传入的世界计数、移动块或战斗状态）：坐标换算与 f32 数值、原版随机映射、放置、缺省值、排程与名称；飞行状态、运动积分、操纵、速度匹配、AI 初态、随机方向、活动区域与停放行进（P3-06）；载入变换与碰撞形状、战斗初值、目标与雷达、挂点与开火、移动块构造与模式 1/2 运动、弹丸命中、伤害与子系统、能量与显示、碰撞、共享转向模块与导弹制导、爆炸与碎片、停放交战（P3-07）；菜单、无线电、通讯反应、停靠、基地服务与完全修理（P3-10）；只在真实复用时提取 |
| `projections/` | 按分区的 projection（含 `flight` 的运动组与战斗组 `combat.ts`、P3-10 的 `communications.ts`）与 Render State，深度冻结、与世界脱离 |
| `replay/` | 正式快照与状态哈希、规则版本、录制、replay 与结果比较 |

## 文件与 helper 归属

- 一个调用者使用的 helper 默认留在同文件；同模块复用时按能力命名并提取到该模块。跨模块先寻找已有 owner 或公共契约，不用全局 utils/shared/types/services 兜底。
- 时钟与总线属于 Runtime，RNG 与状态一致性哈希属于 Core；FNV-1a 不是内容来源指纹、安全哈希或防篡改机制。
- 正式 Core 的结构与数值读取器在 [core/contracts/validation.ts](../../src/core/contracts/validation.ts)（P3-02）；Runtime、Session 读取输入与控制时复用它与公开的 `readTickInput`，不复制校验规则。
- 公共类型跟随 owner；`AssetId` 归内容，`Command` 归 Core，`SessionHost` 归 Session，任务端口（`SeedSource`、`OneShotTimer`、`LeaveGuard`、`FileSave` 等）归任务流程。不建立统一大 schema 或全局 barrel，也不要求一函数一文件。
- 测试用的合成内容（合成光盘、合成内容包、合成任务与 `ControlledHost` 等）只放在 `*.test-support.ts(x)`、测试或 `e2e/` 中，不是生产模块，也不进入生产导入链。合成格式样本不能改名充当正式契约；P1 的合成 Runtime、Session 与场景已退役，不再保留 synthetic 命名的生产模块。
- 新单元测试继续邻接源码；测试支持在所属模块内维护，不进入生产导入链。TSX 单元测试尚未配置；P1-10 的 E2E 已用独立 `.spec.ts` runner/type/lint 接入，不扩大既有 `.test.ts` 的 Vitest 发现。

### 浏览器测试目录与证据分层

仓库根 [e2e/](../../e2e/)属于测试，不是 app/platform 模块，也不进入网站导入链。[配置](../../playwright.config.ts)和[独立tsconfig](../../tsconfig.e2e.json)允许 Node runner 与 evaluate 的 DOM 类型，但 Core/Node 程序仍无 DOM。命令、已有浏览器准备、origin/端口所有权、headed CDP 与输出清理见[工程约定](./README.md#本地浏览器-runner)。

- bootstrap、probe-contract、interaction-render、joint-resources、browser-replay、native-lifecycle、webgl-unavailable 各自承担独立验收面；P3-04 起，页面、生命周期与图形的验收已迁到正式任务流程或查看器，各用例按下列当前路径验证（各旧用例的去向见 [P3-04/11](../plan/p3/04/subtasks/11-e2e-lifecycle-resources.md#完成证据) 与 [P3-04/12](../plan/p3/04/subtasks/12-e2e-shell-production.md#完成证据)）：bootstrap 载入应用菜单，没有资源包时任务入口禁用并说明原因；probe-contract 核对探针（含应用的单次计时器）不干扰页面，并读取任务画面的只读属性，生产中没有诊断元素；interaction-render 为只用键盘的任务流程（原生控件、非绑定键无效）与任务画面、查看器画布的同所有者 resize；browser-replay 在浏览器与 Node 中以正式 Core 的 `replayRecord`/`compareReplayResults` 得到相同结果并同样拒绝不符的记录；webgl-unavailable 在查看器上核对 WebGL 2 不可用时的降级与两次进出的释放，任务流程照常且没有画布；native-lifecycle 为任务飞行与出发保持中的原生隐藏、显式继续与不补跑；joint-resources 为三次任务往返（各含重开）的资源平衡；mission-flow.development/production 为完整任务流程、离页确认、开发诊断与录制下载后的 Node 核对；base-interaction.development（P3-10/23，只在开发构建中运行，因为测试入口只在开发构建中）经真实模块 Worker 导入合成光盘 `mission-docking`（[synthetic-import.test-support.ts](../../src/workers/synthetic-import.test-support.ts)，场景表在 [import-scenarios.test-support.ts](../../src/workers/import-scenarios.test-support.ts)：基地在停靠门禁之内，菜单含状态查询与停靠），以输入区中的可信按键走通讯菜单、停靠请求、G-02/3 与 G-02/4 的保持占位、G-05 基地页面与离港，并把基地页面与 Node 中重放导出录制的 projection 比较；菜单协议只经开发事件日志核对，不验证正式通讯画面（P3-13）。P1-12增加rights DOM和仅production的许可产物可读性用例。[P1-10覆盖/历史适用性](../plan/p1/10/subtasks/07-evidence-docs-alignment.md#完成证据)、[P1-12相关证据](../plan/p1/12/subtasks/08-local-evidence-docs.md#完成证据)及[P1-14当前完整回归](../plan/p1/14/subtasks/03-browser-exit-checks.md#完成证据)分别保留各候选的实际结果，阶段判定见[退出评审](../reviews/P1-exit.md)。
- `e2e/support/`按测试能力放 environment、只读宿主探针、错误fixture、DOM/采样、截图/布局与CDP relay，不建立生产debug/world写入API。输入走可信UI/浏览器协议；任务画面只经只读的 `data-owner`/`data-run`/`data-tick`/`data-position` 属性与开发诊断面板取证（[mission-observations.ts](../../e2e/support/mission-observations.ts)）；replay只导入公开纯模块创建独立世界。
- Node 单元测试继续证明纯规则、通知/旧回调、注册失败/回滚/稀有错误；持久E2E证明真实DOM/图形/宿主生命周期与联合资源。仍适用的人工HMR/window/DPR证据直接复用，不自动改源码，不把本机Chromium结果说成Safari/系统快捷键/目标GPU/原版保真。
- `tools/e2e-configuration.test.ts`是 Node 接入与项目设置回归：读取 Playwright 配置并列出用例，不启动浏览器或需要已安装浏览器；真正浏览器验收独立运行`pnpm test:e2e`，不由`pnpm check`替代。报告与合成截图只有ignored测试目录，不是产品资源。

## 后续扩展方向

本节是职责落点，不是已批准文件/API 清单；P1、P2、P3 的实际任务分别见 [P1 tasks](../plan/p1/tasks.md)、[P2 tasks](../plan/p2/tasks.md)、[P3 tasks](../plan/p3/tasks.md)，已实现目录以上文为准。后续范围由[总计划 §12](../plan/master-plan.md#12-开发阶段与验收条件)定义。仅在实际交付代码时创建目录。

| 阶段 | 推荐的模块内结构 | 边界 |
|---|---|---|
| P1-06/07/08/09/10（已交付） | `ui/game/`、`ui/pages/`、`ui/dev/`；`render/scene/`、`render/viewport/`；`platform/input/`；必要时 `app/composition/`；仓库根 `e2e/`（P1 的 `render/synthetic/` 与其他合成演示模块已于 P3-04 退役，见[退役记录](#p3-04-合成演示退役记录)） | 消费者各自实现订阅与释放，应用装配，不增游戏循环 |
| P2（已交付） | `original-data/io/`、`disc/`、`archive/`、`formats/`、`source/`、`conversion/`；`content/` 按数据类别组织；`platform/files/`、`storage/`、`audio/`；`workers/` | 纯字节读取端口由解析层定义，File/fs 实现分别在平台/工具；转换数据不写入仓库 |
| P3 | `core/contracts/`、`world/`、`systems/`、`rules/`、`projections/`、`replay/`（P3-02 已交付，规则任务在其中扩展）；`app/runtime/`、`app/session/`、`app/mission/`、`ui/game/`、`ui/mission/`、`ui/dev/`（P3-04 已交付，输入、画面与音效经任务所有者接入）；`render/cockpit/` | 真实系统显式按固定顺序执行；不建立第二个会话、帧循环或运行 |
| P4 | `core/save/`；内容模块的战役/任务数据；UI 简报、结果等页面；`platform/video/`、`music/`（音效播放端口 `platform/audio/` 已由 P2-08 交付） | 媒体实现由 spike/ADR 确定，不在目录方案中选解码器；存档模型与持久化分开 |
| P5 | 扩展原版导入、平台存储/PWA、UI 错误反馈、`e2e/`、`tools/` 与 CI/发布配置 | 不建立装满所有业务的 release 模块；缓存管理不静默覆盖玩家存档 |
| P6 | `render/styles/`、`effects/`、内容模块的外观覆盖契约、画质设置 | 同一 Core/逻辑定义/存档；碰撞等逻辑不从 Enhanced 模型重新推导 |

P1-06 可将 projection store、会话桥接、命令反馈分别作为小模块；命令提交、Core 接受/拒绝、会话取消和同步失败是不同结果。反馈按运行身份隔离，游戏 store 随运行重建或重置，偏好设置保持应用级。实现和量化验收仍留到对应 spec/goal。

## P1-06 前迁移记录

### 路径对应关系

| 历史路径/文件组 | 当前位置 |
|---|---|
| `src/app/fixed-step-clock*`、`runtime-errors*`、`synthetic-event-bus*`、`synthetic-runtime*` | [src/app/runtime/](../../src/app/runtime/)（`synthetic-*` 已于 P3-04 删除，见 [R3](#r3-合成-runtime)） |
| `src/app/session-host.ts`、`session-errors*`、`synthetic-session*`（含 test-support） | [src/app/session/](../../src/app/session/)（`synthetic-session*` 已于 P3-04 删除，见 [R4](#r4-合成会话)） |
| `src/core/rng*`、`fnv1a64*` | [src/core/determinism/](../../src/core/determinism/) |
| `src/core/synthetic-scene*`、`synthetic-snapshot*`、`synthetic-replay*` | `src/core/synthetic/`（P3-04 已删除，见 [R1](#r1-合成-core)） |
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

## P3-04 合成演示退役记录

P3-04 以正式 Runtime、游戏会话与任务流程取代 P1 合成演示（[spec：合成演示退役](../plan/p3/04/spec.md#合成演示退役)，S-10、AC-18），由 [P3-04/13](../plan/p3/04/subtasks/13-retire-synthetic-demo.md#完成证据) 删除下列 57 个受跟踪文件（32 个测试文件、2 个测试支持）与 lint 规则 `osr/core-synthetic-boundary`。

- **删除前的提交：** 最后一个包含全部这些路径的提交是 `84a3f454`（`docs(p3-04): claim subtask 13`）；这些路径最后一次内容修改在 `87690599`（`feat(p2-11): add the on-demand viewer renderer and 2D items`）。查看原文用 `git show 84a3f454:<路径>`，列出删除前的目录用 `git ls-tree -r --name-only 84a3f454 -- <目录>`。
- **历史文档：** P1、P2 与 P3-02 的任务文档、评审与 ADR 记录的是交付当时的代码，文字、命令与结论保持原样；其中指向下列路径的链接由 P3-04/16 改指向本节对应的条目，本节只提供稳定的锚点。各条目的契约仍以原任务的 spec 为准。
- **不在删除范围内：** 测试用的合成内容与 fixture（[synthetic-content.test-support.ts](../../src/content/synthetic-content.test-support.ts)、[synthetic.test-support.ts](../../src/original-data/synthetic.test-support.ts)、[synthetic-import.test-support.ts](../../src/workers/synthetic-import.test-support.ts) 等）仍被内容、导入、查看器、任务流程与 E2E 使用；`platform/input/` 的通用键盘源由 P3-05 的 `ui/game-input/` 正式消费；`render/scene/`、`render/viewport/`、`render/webgl/` 的共用渲染设施由查看器使用。测试中仍以字符串出现的 `osr-synthetic-snapshot`、`osr-synthetic-replay` 是被拒绝的格式名，不是模块引用；[production-preview.spec.ts](../../e2e/production-preview.spec.ts) 以否定正则确认这些退役路径不出现在生产 source map 中。

### R1 合成 Core

`src/core/synthetic/`（P1-02、P1-03）：mover/marker 合成场景、合成快照与 replay，格式与正式 Core 互不兼容。

| 删除的文件 | 内容 | 替代 |
|---|---|---|
| `synthetic-scene.ts` | 合成场景：带种子的 mover/marker 步进、合成命令与事件、合成投影 | 正式 Core：[create-world.ts](../../src/core/world/create-world.ts)、[world.ts](../../src/core/world/world.ts)、[pipeline.ts](../../src/core/systems/pipeline.ts)、[projection.ts](../../src/core/projections/projection.ts)，见 [Core 模块说明](./modules/core.md#正式-core) |
| `synthetic-snapshot.ts` | 合成快照与状态哈希（`osr-synthetic-snapshot`） | [snapshot.ts](../../src/core/replay/snapshot.ts)（`osr-game-snapshot`） |
| `synthetic-replay.ts` | 合成录制、replay 与比较（`osr-synthetic-replay`） | [recording.ts](../../src/core/replay/recording.ts)、[replay.ts](../../src/core/replay/replay.ts)、[compare.ts](../../src/core/replay/compare.ts)（`osr-game-replay`） |
| `synthetic-scene{,-input,-restore,-step}.test.ts`、`synthetic-replay{,-compare,-record}.test.ts`、`synthetic-snapshot.test.ts` | 上述模块的测试 | 正式 Core 各目录的邻接测试 |

### R2 合成渲染

`src/render/synthetic/`（P1-07）：合成帧的校验与插值、固定相机、mover/marker 外观与合成渲染器。

| 删除的文件 | 内容 | 替代 |
|---|---|---|
| `synthetic-render-frame.ts`、`synthetic-camera.ts`、`synthetic-appearance.ts`、`synthetic-renderer.ts` | 每个运行一份的帧历史与插值、合成相机、合成外观，以及作为会话运行级消费者的渲染器 | 暂无飞行画面：任务画面的游戏区域留给 P3-12、P3-13。共用的 [render-surface.ts](../../src/render/scene/render-surface.ts)、[cleanup.ts](../../src/render/scene/cleanup.ts)、[viewport-layout.ts](../../src/render/viewport/viewport-layout.ts) 与 [webgl/](../../src/render/webgl/) 保留，见[渲染表面与视口](./README.md#渲染表面与视口) |
| `synthetic-camera.test.ts`、`synthetic-render-frame.test.ts`、`synthetic-renderer{,-fault,-replay}.test.ts` | 上述模块的测试 | — |

### R3 合成 Runtime

`src/app/runtime/` 中的合成部分（P1-04）。

| 删除的文件 | 内容 | 替代 |
|---|---|---|
| `synthetic-runtime.ts` | 合成场景的固定步长 Runtime：合成输入与命令、整帧共用的命令索引、故障后可读的快照与前缀导出 | [game-runtime.ts](../../src/app/runtime/game-runtime.ts)，见[正式 Runtime](./modules/app.md#正式-runtime)；[fixed-step-clock.ts](../../src/app/runtime/fixed-step-clock.ts) 与 [runtime-errors.ts](../../src/app/runtime/runtime-errors.ts) 保留并复用 |
| `synthetic-event-bus.ts` | 合成事件的帧后 Event Bus | [game-event-bus.ts](../../src/app/runtime/game-event-bus.ts) |
| `synthetic-event-bus.test.ts`、`synthetic-runtime{,-events,-fault,-lifecycle,-recording}.test.ts` | 上述模块的测试 | `game-event-bus.test.ts`、`game-runtime{,-fault,-input,-recording}.test.ts` |

### R4 合成会话

`src/app/session/` 中的合成部分（P1-05）。

| 删除的文件 | 内容 | 替代 |
|---|---|---|
| `synthetic-session.ts` | 合成场景的控制器：固定配置的 start/pause/resume/restart/exit/dispose、唯一帧请求、运行身份、通知边界与清理锁存 | [game-session.ts](../../src/app/session/game-session.ts)，见[游戏会话](./modules/app.md#游戏会话)；[session-host.ts](../../src/app/session/session-host.ts)、[session-errors.ts](../../src/app/session/session-errors.ts)、[rollback-error.ts](../../src/app/session/rollback-error.ts) 保留并复用 |
| `synthetic-session.test-support.ts` | `ControlledHost` 等会话测试支持 | `ControlledHost` 移到 [session-host.test-support.ts](../../src/app/session/session-host.test-support.ts)；正式会话的支持在 [game-session.test-support.ts](../../src/app/session/game-session.test-support.ts) |
| `synthetic-session{,-consumers,-fault,-replay}.test.ts` | 上述模块的测试 | `game-session{,-consumers,-fault,-pause-timing,-replay}.test.ts` |

### R5 演示所有者与槽位

`src/app/composition/` 中的合成部分（P1-06、P1-08）。

| 删除的文件 | 内容 | 替代 |
|---|---|---|
| `synthetic-demo-owner.ts` | DOM-free 的演示所有者：store、反馈、渲染器、桥接、会话与键盘消费者的创建、回滚与释放 | [mission-owner.ts](../../src/app/mission/mission-owner.ts)，见[任务流程与所有者](./modules/app.md#任务流程与所有者) |
| `synthetic-demo-lifecycle.ts` | 每个应用实例一个的演示槽位：先释放后创建、一次性 start、清理失败锁存 | [mission-slot.ts](../../src/app/composition/mission-slot.ts) |
| `use-synthetic-demo-owner.ts` | 演示画面的 React hook：键盘源、WebGL 表面与所有者的创建与释放 | [use-mission-owner.ts](../../src/app/composition/use-mission-owner.ts) 与 [MissionScreen.tsx](../../src/app/MissionScreen.tsx) |
| `synthetic-demo-lifecycle.test.ts`、`synthetic-demo-owner.test.ts` | 上述模块的测试 | `mission-slot.test.ts`、`app/mission/` 的 `mission-owner*.test.ts` |

### R6 合成 UI 层

`src/ui/game/` 中的合成部分（P1-06、P1-09）。

| 删除的文件 | 内容 | 替代 |
|---|---|---|
| `synthetic-game-store.ts` | 合成 projection 的 Zustand vanilla store | [game-store.ts](../../src/ui/game/game-store.ts)，见 [UI 模块说明](./modules/ui.md#游戏-store桥接与命令反馈) |
| `synthetic-session-bridge.ts` | 合成会话到 store 的桥接与 10 Hz 采样 | [game-session-bridge.ts](../../src/ui/game/game-session-bridge.ts) |
| `synthetic-command-feedback.ts` | marker 命令的提交与结果反馈 | [game-command-feedback.ts](../../src/ui/game/game-command-feedback.ts) |
| `synthetic-game-controls.ts` | 开发面板与键盘共用的控件可用性 | 任务所有者的意图（[mission-owner.ts](../../src/app/mission/mission-owner.ts)）与任务页面按会话状态推导的控件（[ui/mission/](../../src/ui/mission/)） |
| `synthetic-keyboard-input.ts` | 合成五键（方向键、`N`、`X`、`P`）的键盘消费者 | [P3-05 游戏输入消费者](../../src/ui/game-input/input-consumer.ts)，见[键位文档](./keyboard-input.md) |
| `use-synthetic-game.ts` | React selector hook | [use-game.ts](../../src/ui/game/use-game.ts) |
| `synthetic-ui.test-support.ts` | 真实会话、`ControlledHost` 与可控时钟的测试组合 | [game-ui.test-support.ts](../../src/ui/game/game-ui.test-support.ts) |
| `synthetic-command-feedback.test.ts`、`synthetic-command-outcomes.test.ts`、`synthetic-game-controls.test.ts`、`synthetic-game-replay.test.ts`、`synthetic-game-store.test.ts`、`synthetic-keyboard-input.test.ts`、`synthetic-session-bridge.test.ts` | 上述模块的测试 | `game-store.test.ts`、`game-session-bridge.test.ts`、`game-command-feedback{,-fault}.test.ts` |

### R7 演示页面、开发面板与画面

| 删除的文件 | 内容 | 替代 |
|---|---|---|
| `src/ui/pages/SyntheticDemoPage.tsx` | 合成演示画面（主菜单的 `Start synthetic demo` 入口） | 主菜单的 `Start mission` 与任务页面：[MissionPage.tsx](../../src/ui/mission/MissionPage.tsx) 及 [ui/mission/](../../src/ui/mission/) 的占位、开始配置、任务壳与任务菜单 |
| `src/ui/dev/SyntheticDevPanel.tsx` | 合成开发面板（会话控件、marker 命令、渲染诊断） | 只在开发构建中出现的 [MissionDevPanel.tsx](../../src/ui/dev/MissionDevPanel.tsx)，见[开发诊断与录制导出](./README.md#开发诊断与录制导出) |
| `src/ui/render/SyntheticRenderView.tsx`（`src/ui/render/` 随之删除） | 合成画面容器、合成键位的输入区与渲染状态文字 | 任务壳中的游戏区域（`mission-view`，尚无完整画布，P3-12、P3-13 填充）；正式输入区由 P3-05 建立 |

### R8 E2E 演示观察

| 删除的文件 | 内容 | 替代 |
|---|---|---|
| `e2e/support/demo-observations.ts` | 演示画面的帧窗口、tick 与渲染读取 | [mission-observations.ts](../../e2e/support/mission-observations.ts)（含 `frameWindow`）；各旧用例的去向见 [P3-04/11](../plan/p3/04/subtasks/11-e2e-lifecycle-resources.md#完成证据) 与 [P3-04/12](../plan/p3/04/subtasks/12-e2e-shell-production.md#完成证据) |

### R9 lint 规则 `osr/core-synthetic-boundary`

P3-02 AC-01 的规则：正式 Core 与 `core/synthetic/` 互不导入，`errors.ts` 与 `determinism/` 两侧都不导入。P3-04/13 从 [eslint.config.js](../../eslint.config.js) 删除规则及其注册与配置项，从 [engineering-boundaries.test.ts](../../tools/engineering-boundaries.test.ts) 删除对应的 lint 回归与依赖图回归；“`errors.ts`、`determinism/` 不导入其他 Core 模块”这一附带约束随之不再强制。Core 纯度与确定性、模块边界、原版数据能力、生产禁入测试支持与 Worker 网络等其余规则与回归保留，见[工程约定](./README.md#lint-规则eslintconfigjs)。

### R10 菜单入口、键位与工程文档

- **菜单与页面流转：** 主菜单的 `Start synthetic demo` 与页面流转的 `demo` 画面由 `Start mission` 与 `mission` 画面取代（[app-flow.ts](../../src/app/flow/app-flow.ts)）。
- **键位：** P1-09 的合成五键与其输入区退役；当前构建没有游戏键绑定，见[键位文档](./keyboard-input.md)。
- **工程约定：** 下表的小节改写为正式实现（删除前的原文：`git show 84a3f454:docs/engineering/README.md`）。

| 原小节（锚点） | 现在的位置 |
|---|---|
| 合成 Runtime（`#合成-runtime`） | [正式 Runtime](./README.md#正式-runtime) |
| 合成渲染（`#合成渲染`） | [渲染表面与视口](./README.md#渲染表面与视口) |
| 页面流转与演示生命周期（`#页面流转与演示生命周期`） | [页面流转与任务生命周期](./README.md#页面流转与任务生命周期) |
| 会话端口与错误、浏览器生命周期复现、已验证的 CDP 自动化路线、UI 投影与指令反馈、键盘源与输入区 | 标题与锚点不变，内容改为正式实现：[会话端口与错误](./README.md#会话端口与错误)、[UI 投影与指令反馈](./README.md#ui-投影与指令反馈)、[键盘源与输入区](./README.md#键盘源与输入区) |
