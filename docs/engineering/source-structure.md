---
type: guide
status: active
phase: all
updated: 2026-10-02
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
    composition/
      synthetic-demo-owner.ts
      use-synthetic-demo-owner.ts
    runtime/
      fixed-step-clock.ts
      runtime-errors.ts
      synthetic-event-bus.ts
      synthetic-runtime.ts
    session/
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
  original-data/
    imfat.ts
    payloads.ts
    synthetic.ts
  platform/
    browser/
      browser-session-host.ts
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
      synthetic-command-feedback.ts
      synthetic-game-controls.ts
      synthetic-game-store.ts
      synthetic-session-bridge.ts
      use-synthetic-game.ts
```

`content/`、`workers/` 仍是顶层架构中的计划模块，不是已实现目录。`render/` 由 P1-07 逐步交付（契约见 [P1-07 spec](../plan/p1/07/spec.md)）：目前有 DOM-free 的 4:3 视口布局、合成帧校验与插值、固定合成相机、合成外观、绘制端口与合成渲染器，以及 WebGL 表面（DOM-free 生命周期加 `browser-*` 浏览器工厂）；页面接线尚在实施。P1-06 已交付：`ui/game/` 的投影 store（Zustand vanilla，React 只取得只读句柄）、会话桥接（状态即时写入、10 Hz 投影采样）、命令反馈（Core 接受/拒绝、取消、故障未确认）、会话控制与 React selector hook；`ui/dev/` 的合成开发面板；[app/composition/](../../src/app/composition/) 中 DOM-free 的合成演示 owner 与创建、销毁它的 React effect hook。[App](../../src/app/App.tsx) 现在承载合成开发面板，它是工程演示，不是正式菜单、飞行 HUD 或原版界面。

## 职责与依赖

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
- 新单元测试继续邻接源码；测试支持在所属模块内维护，不进入生产导入链。未来 TSX 或 E2E 测试需由负责接入的任务明确配置类型/lint/发现范围，不能假定当前 `.test.ts` 配置已经覆盖。

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
