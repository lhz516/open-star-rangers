---
type: guide
status: active
phase: all
updated: 2026-10-04
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
  original-data/
    imfat.ts
    payloads.ts
    source-mapping.ts
    synthetic.ts
  platform/
    browser/
      browser-session-host.ts
    input/
      browser-keyboard-source.ts
      keyboard-input.ts
      keyboard-source.ts
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
```

`workers/` 仍是顶层架构中的计划模块，不是已实现目录。[content/](../../src/content/) 目前实现候选无关的基础契约和唯一生产切片定义（见下节），尚无完整性验证；原版来源映射属于 `original-data`（见[原版来源映射](#原版来源映射)）。`render/` 由 P1-07 逐步交付（契约见 [P1-07 spec](../plan/p1/07/spec.md)）：目前有 DOM-free 的 4:3 视口布局、合成帧校验与插值、固定合成相机、合成外观、绘制端口与合成渲染器，以及 WebGL 表面（DOM-free 生命周期加 `browser-*` 浏览器工厂）；`ui/render/` 的合成画面组件与开发面板的渲染诊断已接入页面。P1-06 已交付：`ui/game/` 的投影 store（Zustand vanilla，React 只取得只读句柄）、会话桥接（状态即时写入、10 Hz 投影采样）、命令反馈（Core 接受/拒绝、取消、故障未确认）、会话控制与 React selector hook；`ui/dev/` 的合成开发面板；[app/composition/](../../src/app/composition/) 中 DOM-free 的合成演示 owner 与创建、销毁它的 React effect hook。P1-08 已实现（最终对齐见 [P1-08 goal](../plan/p1/08/goal.md#子任务跟踪)）：[app/flow/](../../src/app/flow/) 中 DOM-free 的页面流转（主菜单、导入占位、合成演示，内存状态，不用路由）；`app/composition/` 中每个应用实例一个的演示生命周期（一次性 start、先释放后创建、清理失败锁存）；`app/session/` 的 `RollbackError` 结构化回滚失败信号；`ui/pages/` 的三个画面组件。[App](../../src/app/App.tsx) 是应用外壳，加载时显示 P1 React 菜单原型；菜单、合成画面与开发面板都是工程原型，不是原版界面或飞行 HUD。

### 内容基础契约与切片定义

[P2-01/08](../plan/p2/01/subtasks/08-base-content-contract.md) 的当前 API：

- [asset-id.ts](../../src/content/asset-id.ts)：`readAssetId` 返回品牌化语义 ID，8 段限制包含 kind 首段；`ASSET_KINDS` 封闭为 8 种，`ASSET_ID_LIMITS` 固定每段 32 字符、总长 128 字符。语法验证不能证明命名语义或来源映射正确。
- [asset-contract.ts](../../src/content/asset-contract.ts)：`readAssetReference`、`readAssetDescriptor` 验证 kind 一致性、4 个封闭资源组、语义 role token、严格 ASCII ID 顺序且无重复的类型化依赖，以及 payload 身份。role 的必需集合/基数留给 02，引用存在/自引用/环与分组/全包完整性留给 04；没有 `complete` 布尔值。
- [content-identity.ts](../../src/content/content-identity.ts)：`readContentIdentity` 显式分开 schema、切片 ID、切片定义版本、converter、manifest 与 origin；schema 当前只支持 1，数值版本为正安全整数。converter 按 spec 保留受限 ASCII 不透明字符串，不用应用版本代替。converter/manifest token 允许小写 ASCII 字母、数字及单个内部 `-`、`.`、`:` 分隔符。
- 同文件的 `readContentOrigin` 严格区分 `{type: synthetic, fixtureId}` 与 `{type: original-import, sourceFingerprint}`；fixture token 不允许 `:`，source 使用 `source:<不透明 token>` 命名空间，不规定指纹算法。通过只表示形状合法，**不是来源已验证的证据**；P2-03 负责生成经过验证的来源指纹，未来转换器负责产生 manifest 身份。
- 同文件的 `readPayloadIdentity` 要求正安全整数 schema 版本、非负安全整数字节长度及 `sha256:` 加 64 个小写十六进制字符；只检查声明的格式，不生成或核验实际 payload 哈希。
- [asset-units.ts](../../src/content/asset-units.ts)：`ASSET_UNITS` 与 `INTERNAL_ASSET_ELEMENTS` 固定规范计量粒度。每模型一个 Asset，几何归模型内部；可复用调色板/逻辑数据才有独立身份。源条目数量不是规范 Asset 数，实际拆分/合并及共享身份必须由后续来源映射显式记录。这些常量不是全战役规范图或 S-02 排序证据。
- [contract-validation.ts](../../src/content/contract-validation.ts)：严格 plain-data 校验和 `ContentContractError`，按稳定 `code`/`path` 分类；诊断不回显非法值或未知属性名。DTO 不接受类实例、函数、accessor 或未知字段。读入口复制并冻结所有基础容器，结构化克隆后可独立修改；`readArray` 统一读取稠密 plain 数组。`original-data` 的来源映射也复用这些校验（依赖方向为 original-data → content，反向被 lint 禁止）。**二进制 payload 的独占副本、别名隔离和 transfer 后失效仍由 05 实现**，当前 API 不接收二进制 payload。
- [slice-definition.ts](../../src/content/slice-definition.ts)（[P2-01/02](../plan/p2/01/subtasks/02-slice-content-contract.md)）：`CLASSIC_P2_SLICE` 是唯一的生产切片定义，深度冻结；`SliceDefinition` 带仅类型品牌，唯一构造由[工程边界回归](./README.md#lint-规则eslintconfigjs)保证。定义记录经批准的候选结构选择器（战役 group 0 / slot 1，僚机可选）、四个必需资源组，以及 S-03 角色的组、允许 kind 与 Asset 数量范围。弹丸/导弹/碎片暂允许 model 或 image，四类核心音效暂允许多个采样片段，分别待 P2-06/P2-08 核实后收窄。原版条目 ID 不在此处，由 03 的来源映射记录；按定义判定清单完整性由 04 实现。更换候选或改变角色、数量范围、分组都须修订 spec 并递增 `SLICE_DEFINITION_VERSION`。

针对性检查为 `pnpm exec vitest run src/content tools/engineering-boundaries.test.ts`；不读取原版文件或接线浏览器消费者。

### 原版来源映射

[source-mapping.ts](../../src/original-data/source-mapping.ts)（[P2-01/03](../plan/p2/01/subtasks/03-source-mapping-boundary.md)）只属于 `original-data`，规范内容消费者不能导入（见[工程约定](./README.md#lint-规则eslintconfigjs)）：

- `readSourceMappingTable` 验证来源映射表：每个规范 Asset 映射到一个或多个部件，部件之间为“全部需要”（例如任务的 SCEN 与 SCCT 记录），同一部件内的多个 locator 为“精确等价，任取其一”（例如字节完全相同的别名条目）。locator 是光盘相对的 8.3 大写路径、IMFAT entry ID/type 与可选子资源路径；多个 Asset 可以共用同一 locator。每条映射还记录置信度（confirmed/likely/unconfirmed，非 confirmed 必须链接 U 项）、`docs/original/` 证据及 `declared`/`verified` 解析状态。表级 `sourceFingerprint` 在 P2-03 提供前为 null，此时不允许出现 `verified`。
- `diagnoseSourceMappings` 返回稳定排序、深度冻结的安全诊断，只含规范 ID、结构路径和 U 项，不含 locator 值或原版内容。所有映射都检查条目类型与 Asset kind 是否兼容（`SOURCE_ENTRY_TYPES` 依据 [imfat §5](../original/formats/imfat.md#5-entry-types) 与 [textures §2](../original/formats/textures.md#2-image-record-36-bytes-confirmed)）。必需 Asset 另报缺失、未确认和未验证；likely 不报，但其 U 项保留在映射上。按切片定义把这些诊断计入组和全包完整性由 04 实现。

针对性检查为 `pnpm exec vitest run src/original-data src/content tools/engineering-boundaries.test.ts`。

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
