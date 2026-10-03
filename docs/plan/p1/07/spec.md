---
type: plan
status: accepted
phase: P1
task: "07"
updated: 2026-10-02
related: [ADR-0002, ADR-0008, ADR-0009, ADR-0012, ADR-0015]
reviewed: sha256:b7121d14dee8
---

# P1-07：Three.js 合成渲染 — Spec

## 问题与目标

Core 每个 tick 都产出 `SyntheticRenderState`，Runtime 保存上一 tick 与当前 tick 的两份状态及插值系数 `alpha`，Session 在每个 rAF 帧和进入暂停时通过 `onFrame` 交付它们。P1-06 已在页面接入开发面板。但仓库还没有 Three.js、Canvas/WebGL 或任何 Render State 消费者，因此目前缺少以下能力，既无实现也无证据：

- 在实际页面看到由 Core 驱动的场景变化。
- 固定比例画面，以及尺寸和设备像素比（DPR）变化时的处理。
- WebGL 失败时的反馈。
- GPU 资源释放。

本任务在现有应用入口加入一个 Three.js 画面，明确标记为 **P1 合成工程演示，非原版画面**：

- 按实体 ID 把 Render State 映射为自建几何体，按 `alpha` 插值位置。
- 只在 Session 已有的帧通知和少数事件触发时绘制，不建立自己的循环。
- 画面固定为 Classic 默认的 4:3 比例，等比缩放，多余部分留黑边；处理容器尺寸和 DPR 变化。
- WebGL 不可用、绘制失败或上下文丢失时明确反馈，且不影响会话。
- 重启、退出、卸载、StrictMode 和 HMR 之后，不留下多余的画布、WebGL 上下文或观察器，GPU 资源也不持续增长。

阶段范围依据[总计划 §12](../../master-plan.md#12-开发阶段与验收条件)，任务导航见[阶段索引](../tasks.md#p1-07-threejs-合成渲染)。本任务直接支持 P1 的“Three.js 场景”交付和“合成场景在本地浏览器运行”，并为 P1-08（菜单装配）和 P1-10（浏览器联合回归）提供渲染消费者；它不单独完成 P1 退出评审。

依赖关系：

- 直接依赖 [P1-05](../05/spec.md)，其 [goal](../05/goal.md#子任务跟踪) 已全部完成。
- 实现会复用 [P1-06](../06/spec.md) 交付的装配 owner 和运行消费者接线；P1-06 的 [goal](../06/goal.md#子任务跟踪) 已完成，不构成新的阻塞。阶段索引的依赖列不随本 Spec 改动。

## 范围

### 包含

- **S-01 依赖与边界：** 引入 `three` 与 `@types/three`（均为 MIT），只使用 `WebGLRenderer`（WebGL 2）。Core、original-data、content 的纯模块边界不放宽。
- **S-02 实体映射：** 按“运行 + 实体 ID”维护场景对象，按 `kind` 选择自建的几何与材质（同一 kind 共享）。新增、移除、重启和退出后，场景对象与 Render State 保持一致。
- **S-03 插值：** 实体集合以 `current` 为准；`previous` 与 `current` 都有的实体，其位置按 `alpha` 线性插值。不外推，不处理朝向。
- **S-04 绘制时机：** 只在 Session 帧通知，以及接线、运行结束、布局变化、上下文恢复时绘制。不使用 rAF、`setAnimationLoop` 或定时器。
- **S-05 固定 4:3 画面：**
  - Classic 默认比例，等比缩放、居中、留黑边；使用固定的合成相机。
  - 画面容器具有确定的、随视口变化的 CSS 内容盒尺寸、纯黑背景、相对定位与裁剪；画布在其中绝对定位，现有开发面板保持普通文档流并与画面共存。
  - 容器尺寸或 DPR 变化时重新布局，并立即重绘最近一帧。
  - 像素比和绘制尺寸各有上限；零尺寸时不绘制。
- **S-06 失败与上下文：** WebGL 不可用、绘制失败、上下文丢失或恢复，各有明确的状态和反馈；会话不受影响。
- **S-07 资源生命周期：** 渲染器随 owner 创建和销毁，释放几何、材质、`WebGLRenderer`、画布、观察器和监听；设备支持 `WEBGL_lose_context` 时再最佳努力丢弃 WebGL 上下文，不把扩展缺失视为失败。StrictMode、HMR 或重建之后只有一个活动画布。
- **S-08 React 接线与诊断：** React 只负责提供容器、显示渲染状态和按需读取只读诊断；开发面板加入渲染诊断；页面标注这是合成画面。
- **S-09 验证与文档：** 邻接 Node 契约测试、真实 Chromium 证据，并同步工程文档。

### 不包含

- **画面内容扩展：** 驾驶舱/HUD/MFD、原版像素模式（640×480 离屏绘制再放大）、宽屏开关、F1–F9 视角、相机跟随或切换、粒子、后处理与 Enhanced 效果，分属 P3/P4/P6 及其后续任务。
- **原版资源：** 原版模型、贴图、调色板，Asset ID 映射，资源加载与缓存，属于 P2。本任务的合成外观不是原版外观证据。
- **输入：** 键盘、`moveX` 输入与焦点规则属于 P1-09。本任务不加 `moveX` 控件；浏览器中运动实体的插值联合观察归 P1-10。
- **页面流程：** 菜单、页面流转、渲染失败的恢复入口（重建渲染器、失败时是否暂停会话）属于 P1-08。
- **上游契约变化：** Core、Runtime、Session 契约不变，例如不给 Render State 加朝向、尺寸、外观或新实体；也不加新命令。
- **其他渲染技术：** WebGPU、React Three Fiber、`three/examples`（addons）、OffscreenCanvas/Worker 渲染、通用场景图框架或 ECS。
- **发布级要求：** 性能目标（Classic 1080p/60 FPS）、包体拆分或懒加载、多显示器拖动、真实 GPU 和设备矩阵、Firefox/WebKit，属于 P1-10/P5。
- **工程设施：** Playwright 依赖与 E2E runner、CI、云部署。
- **持久化与设置：** 不做持久化，也不提供可调像素比上限等设置项。

### 涉及模块

| 模块 | 责任与影响 |
|---|---|
| [core/synthetic](../../../../src/core/synthetic/)（已有） | 复用 `SyntheticRenderState`、`SyntheticRenderEntity`、`Vec3` 及 marker 坐标范围常量；不修改规则、字段或版本 |
| [app/runtime](../../../../src/app/runtime/)、[app/session](../../../../src/app/session/)（已有） | 复用 `RenderFrame`、`SessionFrame` 及 `SessionRun` 的 `onFrame`/`renderFrame`/`ownCleanup`；不新增接口，不改变调度 |
| `src/render/`（计划新增） | DOM-free 部分：合成实体映射、插值、相机、视口布局、渲染状态与诊断。浏览器部分：WebGL 表面（`WebGLRenderer`、画布、尺寸/DPR 观察、上下文事件）。按[源码结构指南](../../../engineering/source-structure.md#后续扩展方向)的 `render/scene/`、`render/viewport/`、`render/synthetic/` 落点细化；具体文件和函数拆分由实现决定 |
| [app/composition](../../../../src/app/composition/)（已有） | owner 接收 DOM-free 的渲染端口，复用 P1-06 的运行消费者接线，并统一释放。React hook 用容器创建浏览器表面，后续步骤失败时回滚 |
| [src/ui](../../../../src/ui/)（已有） | React 画面容器组件与渲染状态显示；[开发面板](../../../../src/ui/dev/SyntheticDevPanel.tsx)加入只读渲染诊断；不按帧重渲染 |
| [App](../../../../src/app/App.tsx)（已有） | 页面加入合成画面容器，与现有开发面板并存 |
| [package.json](../../../../package.json)、[pnpm-lock.yaml](../../../../pnpm-lock.yaml)（已有） | 实施时加入依赖并同步锁文件；生成本 Spec 时不安装 |
| [工程约定](../../../engineering/README.md)、[源码结构指南](../../../engineering/source-structure.md)（已有） | 实施时补充渲染约定、当前目录与验证方式 |

## 当前实现与依据

- **场景数据：** [synthetic-scene.ts](../../../../src/core/synthetic/synthetic-scene.ts)
  - `SyntheticRenderState` 为 `{tick, entities}`，`entities` 按 ID 升序。
  - `SyntheticRenderEntity` 为 `{id, kind:'mover'|'marker', position:{x,y,z}}`，Render State 不含朝向、尺寸或外观。
  - mover（ID 1）从原点出发，只沿 X 轴移动，速度为 `moveX` × 每秒 1 合成单位。
  - marker 至多一个，各轴坐标位于 `[SYNTHETIC_MARKER_MIN, SYNTHETIC_MARKER_MAX)`，即 [-5, 5)。
  - 实体 ID 在一个场景生命周期内唯一；新场景从相同 ID 重新分配。
  - 以上都是 [P1-02](../02/spec.md) 的合成契约，不是原版规则。
- **Runtime：** [synthetic-runtime.ts](../../../../src/app/runtime/synthetic-runtime.ts)
  - `RenderFrame` 为冻结的 `{previous, current, alpha}`，`alpha` ∈ [0,1)。
  - 一帧补跑多个 tick 时，`previous`/`current` 是最后两个已执行 tick。
  - `foldRenderState` 把状态折叠为 previous=current、alpha=0。
  - Runtime 自身不插值，实体出现或消失时如何渲染由本任务决定（[P1-04 技术决定 8](../04/spec.md#技术决定)）。
- **Session：** [synthetic-session.ts](../../../../src/app/session/synthetic-session.ts)
  - running 时每个 rAF 帧通知一次 `SessionFrame`；进入暂停时发出一次 `report=null` 的静止帧。
  - 运行结束时清除帧监听，并逆序执行 `ownCleanup`。
  - 在状态通知中新增的订阅，从下一批通知起生效。
  - 帧监听器抛错时，Session 记为 consumer 故障并终止运行。
  - 隐藏状态下开始的运行处于 paused，在 resume 之前不会收到帧。
- **P1-06 接线：** [synthetic-session-bridge.ts](../../../../src/ui/game/synthetic-session-bridge.ts) 的 `SyntheticRunConsumer`/`SyntheticRunBinding` 已提供逐运行接线：失败时事务式回滚，并提供 `own(cleanup)` 与 `isCurrent()`。
- **装配：**
  - [synthetic-demo-owner.ts](../../../../src/app/composition/synthetic-demo-owner.ts) 是 DOM-free 的 owner，统一创建和释放 store、桥接与会话，并带测试。
  - [use-synthetic-demo-owner.ts](../../../../src/app/composition/use-synthetic-demo-owner.ts) 在 React effect 中用浏览器宿主创建 owner，并在 cleanup 时释放。
  - [browser-session-host.ts](../../../../src/platform/browser/browser-session-host.ts) 提供唯一的真实 rAF。
- **工程配置：**
  - [eslint.config.js](../../../../eslint.config.js) 已禁止纯模块导入 `three`。
  - [tsconfig.node.json](../../../../tsconfig.node.json)（Node 测试程序）不含 DOM lib；[vite.config.ts](../../../../vite.config.ts) 只发现 `.test.ts` 并在 Node 环境运行。
  - 目前没有 `src/render/`、Three.js 依赖、Canvas 或 WebGL 代码。
- **Three.js 可行性：** 2026-10-02 在仓库外的临时目录做了实验（已确认），实验文件不入库：
  - `three@0.186.1` 与 `@types/three@0.186.0` 是 npm 当前版本，均为 MIT。
  - 按本仓库 Node 程序的编译选项（`lib: ES2023`、`types: node`、`skipLibCheck`），导入 `Scene`、`Mesh`、`BoxGeometry`、`MeshBasicMaterial`、`PerspectiveCamera` 可通过类型检查，且不会引入 DOM 类型（刻意引用 `HTMLCanvasElement` 会报错）。
  - 上述对象可在 Node 中运行；相机投影与几何的 `dispose` 事件正常。`WebGLRenderer` 需要浏览器。
  - `@types/three` 带有若干仅提供类型的传递开发依赖，不进入网站产物，许可复核归 [P1-12](../tasks.md#p1-12-本地原版隔离与许可检查)。
  - 用 esbuild 压缩打包最小的 `WebGLRenderer` 路径，约 532 KB（gzip 约 133 KB），Vite 默认的 500 kB 块体积警告大概率出现。
- **冻结依据：**
  - [总计划 §2](../../master-plan.md#2-冻结的技术选型)：Three.js `WebGLRenderer`/WebGL 2，不用 React Three Fiber。
  - [§4](../../master-plan.md#4-总体架构)：渲染器以实体 ID 维护模型映射，不保存另一套游戏事实。
  - [§5](../../master-plan.md#5-状态管理与通信约定)：渲染读取两份 Render State 并插值；不另起循环；GPU 资源随会话释放。
  - [§7.1](../../master-plan.md#71-classic先保真) 与 [ADR-0009](../../../decisions/ADR-0009-window-scaling-widescreen.md)：4:3 等比缩放留黑边；3D 按窗口实际像素乘以 DPR 渲染并设上限；缩放不设上限，小于 640×480 时继续缩小。
  - 原版画面为 4:3 方形像素（[U-006](../../../original/unknowns.md)，已确认）。
  - 许可见 [ADR-0008](../../../decisions/ADR-0008-mit-and-dependency-licenses.md)，本地验证边界见 [ADR-0012](../../../decisions/ADR-0012-local-p1-defer-ci-deployment.md)，目录见 [ADR-0015](../../../decisions/ADR-0015-source-module-structure.md)。
- **研究结论：** 本任务不产生原版研究结论，不新增 U/B 事实。相机、颜色、几何形状和像素比上限都是合成表现值，不代表原版视野或外观。

## 行为与边界

| 场景或状态转换 | 预期结果 | 拒绝或失败时的反馈 |
|---|---|---|
| 页面加载，会话 idle | 容器内显示 4:3 帧（合成背景色）和黑边，没有实体；渲染状态为 ready；渲染器不发起 rAF；合成标注可见 | WebGL 不可用时，容器内没有画布，显示 unavailable 及原因；开发面板的命令和会话控制照常可用 |
| start，或接入已有的 running/paused 运行 | 立即绘制该运行当前的 Render State（以暂停开始的运行也有画面），之后随帧通知绘制 | 注册失败时按 P1-06 桥接回滚，由 Session 报告；不显示旧运行的实体 |
| 运行中的帧通知（包括 0 tick 帧） | 每次通知恰好绘制一次：实体集合取自 `current`；两边都有的实体，位置为 `previous + (current − previous) × alpha`；只在 `current` 中的实体画在 current 位置；只在 `previous` 中的实体不再显示 | — |
| Core 接受 add-marker / remove-marker | 某次帧通知的 `current` 中出现或消失 marker 时，在同一次绘制中显示或移除；Core 拒绝的命令不改变画面 | 不根据 UI pending 或域事件提前显示 |
| pause（用户操作或页面隐藏） | 绘制 Session 交付的静止帧（previous=current，alpha=0），此后不再按帧绘制，直到 resume 或下文的事件驱动重绘 | — |
| resume | 恢复按帧通知绘制；首帧沿用 Session 重新锚定的结果，不补跑 | — |
| restart | 旧运行的对象在其收尾中全部移除；新运行的 tick 0 立即绘制；即使 ID 相同也不复用旧对象 | 迟到的旧运行帧或回调不改变画面 |
| exit、故障或 owner 释放导致运行结束 | 移除该运行的全部实体对象，绘制空帧（背景加黑边） | 故障由会话和开发面板显示；画面不保留旧运行的实体 |
| 容器尺寸或 DPR 变化（running、paused 或 idle 均适用） | 重新计算布局，并立即用最近一帧重绘；暂停时画面不留空白 | 宽或高不足 1 设备像素时不绘制、不报错，尺寸恢复后重绘 |
| WebGL 2 不可用，或表面创建失败 | 渲染状态为 unavailable，显示原因，没有画布；owner 与会话照常创建和使用 | 不重试，不回退到 WebGL 1 或 2D Canvas |
| 映射或绘制时抛错，或帧数据违反上游契约 | 在改变场景前原子校验整帧；失败时场景保持上一份成功画面，渲染状态进入终止的 failed 并显示错误；此后不再绘制，新运行也不画；会话不因此故障，命令与控制照常 | 违约包括非法 alpha/tick/ID/kind/坐标、ID 未严格递增或重复、两份状态或同一运行历史中的 kind 冲突、tick 倒退；恢复入口（重建渲染器或 owner）归 P1-08，刷新页面也可恢复；本任务不自动重试 |
| WebGL 上下文丢失 | 状态变为 context-lost 并显示；跳过绘制，不抛错；会话照常 | — |
| WebGL 上下文恢复 | Three.js 自身先重建内部资源；应用监听随后把状态改回 ready，并立即用最近一帧重绘（暂停时也一样） | 恢复后绘制失败，按上面的 failed 规则处理 |
| React 卸载、StrictMode 重建、HMR、owner 释放 | 先断开尺寸/DPR 观察和应用上下文监听，再释放共享几何与材质及 `WebGLRenderer`；若 `WEBGL_lose_context` 可用则最佳努力丢弃上下文，最后移除画布；开始释放后不再发出状态通知。旧渲染器的释放尝试完成后才创建新渲染器，同一容器只有一个画布 | 释放失败与其他 owner 清理一起汇总为 AggregateError，抛给 React 或经 `reportError` 报告，不吞掉；扩展缺失本身不是失败 |

### 绘制时机

渲染器只在以下时机绘制，每次只用一份“最近帧”：最近一次收到的 `RenderFrame`，或者没有当前运行时的空帧。

1. 表面创建后，第一次得到有效布局时。
2. 接入运行时，读取 `run.renderFrame()`。
3. 当前绑定运行的每次 `SessionFrame` 通知，包括进入暂停时的静止帧。
4. 运行结束收尾时，绘制空帧。
5. 布局变化：容器尺寸变化或 DPR 变化。
6. WebGL 上下文恢复时。

暂停期间没有帧通知，因此只会因第 4–6 项重绘。渲染器不调用 `requestAnimationFrame`、`setAnimationLoop`、`setTimeout`、`setInterval`，也不建立任何基于 Promise 或微任务的循环。容器尺寸由 `ResizeObserver` 观察；DPR 用匹配当前 `devicePixelRatio` 的 `matchMedia('(resolution: <d>dppx)')` 监听，命中变化后读取新值并重新登记查询。两者都在释放时撤销，同一份实际布局变化只重绘一次。状态为 failed、unavailable 或 disposed 时不绘制；context-lost 或无有效布局时跳过绘制，但保留最近帧，以便恢复后重绘。

### 画面布局

画面容器的 CSS 契约为：内容盒宽度 `100%`、高度 `clamp(240px, 70vh, 720px)`、`position:relative`、`overflow:hidden`、背景 `#000`；画布绝对定位到下述 frame。页面可以滚动，现有开发面板留在容器之外的普通文档流。该尺寸只属于 P1 合成页面，不是 Classic 正式布局。

布局由一个纯计算决定，输入为：

- 容器内容盒的 CSS 尺寸 W×H；
- 浏览器的 DPR `d`；
- 设备允许的最大绘制尺寸 M：浏览器端定义为 `min(MAX_VIEWPORT_DIMS[0], MAX_VIEWPORT_DIMS[1], MAX_RENDERBUFFER_SIZE)`，三项都必须是有限正整数；Node 测试直接传入同样约束的标量。

输出为 null（不绘制），或者有效像素比 `r`、绘制缓冲整数尺寸 `bw×bh`，以及帧在容器内的 CSS 矩形。必须满足：

- M 不是有限正整数时抛出 `RangeError`，不产生部分布局；W 或 H 非有限、≤ 0，或缓冲尺寸不足 1 设备像素时，结果为 null。`d` 非有限或 ≤ 0 时按 1 处理。
- 不受 M 限制时，`r = min(d, 2)`；2 是 P1 的合成性能上限。受 M 限制时降低 `r`，使 `bw`、`bh` 都 ≤ M，且较长边不小于 M − 4，避免降得过多。
- 横向较宽的容器（W/H ≥ 4/3）由高度贴满：`bh = ⌊H·r⌋`，`|bw − 4·bh/3| < 1`，且 `bw ≤ W·r`。较窄的容器由宽度贴满：`bw = ⌊W·r⌋`，`|bh − 3·bw/4| < 1`，且 `bh ≤ H·r`。受 M 限制时，贴满条件改由 M 约束，其余不等式不变。
- 帧的 CSS 尺寸为 `bw/r × bh/r`，居中放置：`left = (W − bw/r)/2`，`top = (H − bh/r)/2`，两者都 ≥ 0。容器的其余区域是纯黑背景，即黑边。
- 缩放没有上下限，小于 640×480 CSS 像素时继续等比缩小。相机投影不随布局变化。

## 数据模型与契约

### 已有权威类型

| 数据/字段 | 类型、单位与约束 | 权威所有者 | 输入/输出边界 |
|---|---|---|---|
| `SyntheticRenderState` / `SyntheticRenderEntity` | `{tick, entities}`，`entities` 按 ID 升序，每项为 `{id, kind:'mover'\|'marker', position:Vec3}`；坐标是有限的合成单位；深冻结 | [Core 场景](../../../../src/core/synthetic/synthetic-scene.ts) | 渲染器只读，不修改、不补字段；`kind` 只用于选择合成外观 |
| `RenderFrame` | 冻结的 `{previous, current, alpha}`，`alpha` ∈ [0,1)；暂停或收尾后 previous=current、alpha=0 | [Runtime](../../../../src/app/runtime/synthetic-runtime.ts) | 插值的唯一输入；渲染器不自行推进时间、不外推 |
| `SessionFrame`、`SessionRun` | `SessionFrame` 含 `runId`、`phase`、`render`、`projection`、`report`。渲染器只使用 `SessionRun` 的 `runId`、`renderFrame()`、`onFrame()`、`ownCleanup()`，外加 P1-06 运行绑定的 `isCurrent()`/`own()` | [Session](../../../../src/app/session/synthetic-session.ts)、[P1-06 桥接](../../../../src/ui/game/synthetic-session-bridge.ts) | 渲染端口的类型上不包含 `submitCommand`、`setInput`、`control`；渲染器不写 UI store |
| marker 坐标范围 | `SYNTHETIC_MARKER_MIN`/`MAX` = −5/5 合成单位 | Core 场景 | 只用于证明合成相机能看到全部可能的 marker 位置；不作为渲染规则 |

### 计划新增的渲染契约

类型跟随 `src/render/` 中实际的 owner 文件，保留 synthetic 语义。下表规定数据形状和约束，不规定函数拆分。

| 数据/字段 | 类型、单位与约束 | 权威所有者 | 输入/输出边界 |
|---|---|---|---|
| 渲染状态 | 冻结的 `{state:'ready'\|'context-lost'\|'failed'\|'unavailable'\|'disposed', error:unknown\|null}`。只有 failed 和 unavailable 带原始错误，其余为 null。ready 与 context-lost 可以互转，也可以进入 failed 或 disposed；failed 与 unavailable 只能转为 disposed；disposed 是终止状态 | 渲染器 | 提供只读句柄（`getSnapshot`/`subscribe`，可直接接 `useSyncExternalStore`），只在状态转换时通知；绘制或布局变化不通知；disposed 之后不再通知 |
| 视口布局 | 输入 `{width, height}`（CSS px）、`devicePixelRatio`、`maxDrawingBufferSize`；最后一项须为有限正整数，否则抛 `RangeError`。输出 `null` 或冻结的 `{pixelRatio, bufferWidth, bufferHeight, frame:{left, top, width, height}}`，缓冲为正整数设备像素，frame 以 CSS px 计 | 渲染 viewport（DOM-free 纯计算） | 浏览器表面依据它设置画布尺寸与位置；Node 测试直接调用；规则见“画面布局” |
| 合成外观表 | `kind` 映射到 `{geometry, material}`，每个 kind 一份、整个渲染器生命周期共享。使用不受光照影响的纯色材质，无贴图，无灯光依赖。帧内背景色与纯黑在至少一个通道上相差 ≥ 32；mover、marker 与背景两两在至少一个通道上相差 ≥ 64；在 320×240、DPR 1 的最小验收画面中，把 mover 放在原点或把 marker 放在允许范围最远的 8 个角时，其几何投影包围框的宽和高都 ≥ 3 设备像素 | 渲染 synthetic | 只由代码生成，不读取任何文件或原版资源；P2 之后由 Asset ID 映射替代，不是正式内容契约 |
| 渲染诊断快照 | 冻结的纯数据：`state`；`runId:number\|null`；`drawnTick:number\|null`（最近绘制的 current.tick，空帧为 null）；`draws`（成功绘制的累计次数）；`entities`（场景中的实体对象数）；`gpu:{geometries, textures, programs}\|null`（每次读取 Three.js 渲染器当前的 `info`，不缓存引用；unavailable 时为 null）；`layout`（最近一次布局，可为 null） | 渲染器 | 按需读取，没有订阅或定时刷新；供开发面板和后续浏览器回归使用，不写入 Core、store 或 replay |
| 绘制端口 | DOM-free 映射层与浏览器 WebGL 表面之间的最小接口：提交场景与相机进行绘制、读取上限与 GPU 统计、通知布局变化（容器尺寸、DPR）、通知上下文丢失与恢复、释放 | 渲染器 | Node 测试用自有替身实现，浏览器用 `WebGLRenderer` 实现；先构造 `WebGLRenderer`，再给 `renderer.domElement` 注册应用上下文监听，使 Three.js 的恢复处理先执行；释放时先移除应用监听。替身不进入生产导入链 |

渲染器在运行期间保存的数据只有三类：最近收到的冻结帧引用、Three.js 场景对象，以及按运行清空的最小校验元数据（最后接受的 tick、`seenKindById`）。它不保存血量、命令结果或任何可判定的游戏事实。每帧在改变场景前完成全部校验：alpha 为有限 `[0,1)`；previous/current tick 为非负安全整数且差为 0 或 1；current tick 相对上一接受帧不倒退；每个实体 ID 为正安全整数并严格递增，kind 已知，坐标有限；同 ID 在两份状态和该运行历史中 kind 一致。全部通过后才原子更新场景，失败不留下部分新增、移除或移动。场景对象按“运行 + 实体 ID”区分，运行结束清空对象与校验元数据；下一运行即使使用相同的 ID 也新建对象。

DOM-free 的渲染模块（映射、插值、相机、布局、状态、诊断）不引用 DOM 全局或 DOM 类型，以便由现有 Node 类型程序和 Vitest 检查。浏览器表面与 React 组件由应用类型程序检查，并在浏览器中验证。渲染模块对 Core 和 app 只有类型依赖，不导入 `ui/` 或应用装配。

### 持久化与兼容

不适用：本任务只使用内存与 GPU 资源，不涉及 IndexedDB/localStorage、内容指纹、存档 schema、迁移、配额或数据清理。布局、诊断、渲染状态与错误都不写入 replay，也不修改 P1-03 的 snapshot/replay 格式或版本。

## 技术决定

用户要求遇到问题时直接采用推荐答案，以下选择据此作出；这不等于用户已批准完整契约。

1. **Three.js 0.186 系列，只用包根和 `WebGLRenderer`。** `three` 进入 dependencies，`@types/three` 进入 devDependencies，两者的次版本保持一致。不用 addons、WebGPU 或 React Three Fiber（[总计划 §2](../../master-plan.md#2-冻结的技术选型)）。不顺带升级其他工具链。
2. **以 Session 帧为驱动，不建自己的循环。** 绘制只发生在“绘制时机”列出的情况；暂停时画面静止，验收时可直接观察。
3. **实体集合以 `current` 为准，只对位置做线性插值。** 渲染器显示的实体集合始终与 Core 最近提交的状态一致，避免多显示一个已移除的实体。新实体直接出现在 current 位置；Render State 没有朝向，因此不插值朝向，也不外推。
4. **按 kind 共享几何与材质。** 实体增删只改变场景对象，不分配新的 GPU 几何或贴图，这样 GPU 统计就能用来判定是否泄漏。
5. **画布只覆盖 4:3 帧，黑边由容器背景提供。** 容器使用“画面布局”规定的确定尺寸与 `#000` 背景；绘制缓冲按 DPR 计算，上限为 2 且不超过设备尺寸上限。`ResizeObserver` 负责尺寸，重建式 resolution media query 负责纯 DPR 变化；黑边不由 GPU 绘制，也不会被场景覆盖。后续的宽屏或原版像素模式只需调整布局计算。像素比上限是 P1 初始值，P5 性能验收可通过修订相应 spec 调整。
6. **固定合成相机。** 透视相机的宽高比恒为 4/3，竖直视野、位置和朝向固定，具体数值是演示值，不代表原版视野。所有可能的 marker 位置与 mover 起点都在视锥内，并满足最小画面的像素覆盖要求；mover 沿 X 轴移出画面是允许的合成行为，相机不跟随。
7. **渲染失败与会话隔离。** 不可用、失败、上下文丢失分别作为渲染状态明确显示；渲染器的帧监听和收尾都不向 Session 抛出绘制错误，因此会话不会因画面问题故障。failed 是终止状态，恢复入口和是否随之暂停会话由 P1-08 决定。注册失败等 Session 接线错误仍按 P1-06 桥接的规则报告。上下文恢复依赖 Three.js 先执行其内部监听，应用随后更新状态并重绘。
8. **装配统一拥有渲染器。**
   - React hook 在同一个 effect 中先用容器创建浏览器表面，再把渲染端口及其幂等 disposer 的所有权转交给 owner；owner 通过适配，把 DOM-free 渲染端口登记为 P1-06 的运行消费者。转交后 hook 不再独立释放同一表面。
   - owner 在创建 Session 之前就持有渲染器；无论初始化是否进入 active，初始化 catch 和正常 release 都会尝试渲染器清理。释放顺序是：会话释放、桥接解绑、渲染器释放；每一步都会尝试执行，失败汇总报告。
   - 运行消费者的 `attach()` 自身是事务式的：部分登记失败时立即逆序执行本地幂等清理，并以 `AggregateError` 保留接线与回滚错误；已交给 `binding.own()` 的 handle 在本地回滚后变成无害 no-op，不能依赖桥接的 `drain()` 报告回滚错。
   - 表面创建失败时仍然创建 owner，并以 unavailable 状态呈现；owner 初始化失败时也清理已经转交的表面。
   - 不使用全局单例。owner 保持 DOM-free，与 P1-06 技术决定 9 一致。
9. **测试分层。** 映射、插值、相机、布局与状态用真实的 Three.js 场景图和绘制端口替身在 Node 中测试，可行性已在上文实验确认；每个 DOM-free 渲染模块都须由 Node 程序中的测试传递导入，避免在现有 `tsconfig.node.json` 下漏检 DOM 类型。`WebGLRenderer`、画布、尺寸/DPR 观察与上下文事件在真实 Chromium 中验证。不引入 jsdom、canvas 模拟库或 Playwright 依赖。
10. **接受块体积警告。** 本任务不调整 Vite 的块配置或体积阈值，也不做懒加载。构建体积和警告记录为证据，包体优化归 P5。不新增 lint 规则；“不建循环”由测试与代码检索证明。

## 验收标准

| ID | 可观察的通过条件 | 验证方法与所需证据 |
|---|---|---|
| AC-01 | `three` 在 dependencies、`@types/three` 在 devDependencies，两者次版本一致，均为 MIT，锁文件同步。生产代码只从 `three` 包根导入，只构造 `WebGLRenderer`，不含 R3F、WebGPU 或 addons 导入。纯模块仍不能导入 `three`（现有 lint 负向规则保持） | package 与锁文件差异、包元数据中的许可字段、源码检索；`pnpm lint` 与[边界回归](../../../../tools/engineering-boundaries.test.ts)通过 |
| AC-02 | 接入真实 Session 后，场景中的实体对象与每次绘制的 `current.entities` 一一对应（ID、kind 相同，数量相等）。Core 接受 add 后，在 `current` 首次含有 marker 的那次绘制中出现对象，其 ID 与位置等于 marker-added 事件和 Render State；接受 remove 后，在 `current` 不再含 marker 的同一次绘制中移除；被拒绝的命令不改变对象集合。50 轮 add/remove 中，实体对象只使用每个 kind 的同一份几何与材质，共享资源不被释放，也没有残留对象。restart 后的对象与旧运行对象不是同一实例，即使 ID 相同 | Node：`ControlledHost` 与真实 Core/Session，配合绘制端口替身，记录每次绘制的对象快照和实例身份 |
| AC-03 | 选用使 alpha 可精确表示的 tick 频率（如 50 Hz），`moveX=1`，用宿主时间构造 alpha 为 0、0.25、0.5、0.75 的帧：mover 对象 x 等于 `previous.x + (current.x − previous.x) × alpha`（alpha 取帧中实际值，误差 ≤ 1e−12），y、z 等于 current。新出现的 marker 不论 alpha 都位于 current 位置；暂停静止帧精确等于 current。分别伪造非法 alpha、tick、ID、顺序/重复、kind、坐标、两份状态冲突、同运行 ID 重用和 tick 倒退：每项都在场景改变前失败，之前的对象身份与位置完全不变，渲染状态进入 failed，监听器不抛错，Session 的 phase 与 error 不变；新 run 清空历史校验元数据 | Node：真实 Session 加 `run.setInput`；违约帧直接交给 DOM-free 映射层，因为 Session 本身无法产生违约帧 |
| AC-04 | 接入与不接入渲染器两种情况下，`ControlledHost` 观察到的 `requestFrame`/`cancelFrame` 调用序列相同。在 ready 且有有效布局时，绘制次数正好是：表面创建后的首次布局 1 次，接线 1 次，绑定运行的每次帧通知各 1 次，运行结束 1 次，每次布局变化 1 次，每次上下文恢复 1 次。暂停期间，Session 状态或 UI store 变化不会引发绘制。渲染模块源码中没有 `requestAnimationFrame`、`setAnimationLoop`、`setTimeout`、`setInterval` 或自调度循环 | Node 计数与源码检索；浏览器中运行时诊断里的 `draws` 递增，暂停后 ≥ 1 s 内不变（用页面内定时器窗口读取两次诊断，不用基于 rAF 的等待） |
| AC-05 | 浏览器中，idle 时只有背景帧；start 后帧内有 mover 颜色像素；Core 接受 add 后，marker 材质色像素数 ≥ 9；pause 后间隔 ≥ 1 s 的两张帧截图逐像素一致（只作为画面未被清空或改写的保护，停止绘制的权威证据是 AC-04 的 `draws` 不变）；restart 前先让旧 run 的 tick ≥ 30，restart 后在 250 ms 内 pause，新 runId 与旧值不同、诊断 `drawnTick` 小于 restart 前值、marker 像素为 0 且 mover 存在；Node 另断言新 run 接线时精确绘制 tick 0。exit 后只剩背景；故障收尾后为空帧 | 本机 Chrome、合成种子 0、截图像素采样，颜色容差 ±3；restart 的 click、pause 与诊断读取在同一工具任务内完成。故障路径在 Node 中沿用现有 Vitest 创建边界注入，生产代码不加故障后门 |
| AC-06 | 相机宽高比恒为 4/3，竖直视野固定；在任意布局变化（包括极端尺寸和 DPR）前后，投影矩阵完全相同。[-5,5]³ 立方体的 8 个角和原点投影后，NDC 的 x、y 都在 (−1,1) 内，深度在近、远裁剪面之间；在 320×240、DPR 1 下，把 marker 几何的包围框依次放在 8 个角、把 mover 几何放在原点，投影后的屏幕包围框宽和高都 ≥ 3 设备像素 | Node：真实 Three.js 相机及几何包围框的投影计算 |
| AC-07 | 布局纯计算满足“画面布局”的全部不等式。参数表至少包含：容器 1280×720、720×1280、640×480、800×600、641×480、300×200、1×1、0×600、600×0、0.4×0.4、NaN、Infinity、负值、10000×8000；DPR 1、1.25、1.5、2、3，以及 0 或 NaN（按 1 处理）；有效 M 为 16384 与 4096，非法 M 为 0、−1、1.5、NaN 与 Infinity。前者覆盖横宽、窄高、精确 4:3、小于 640×480、亚像素、无效输入和受 M 限制等情况；非法 M 均抛 `RangeError` | Node 参数化测试，逐项断言 null、异常、像素比、整数缓冲、贴满边、比例误差、居中与包含关系 |
| AC-08 | Chrome 在 DPR 1 下，视口为 1280×800（左右黑边）、480×900（上下黑边）和 320×240（极小）时：容器内容盒宽度等于其可用父宽度、高度等于 `clamp(240px,70vh,720px)` 的计算值（误差 ≤ 0.5 CSS px），背景计算值为纯黑且随视口变化；以实测容器尺寸代入布局公式，画布元素矩形与公式给出的 frame 相差 ≤ 0.5 CSS px，绘制缓冲尺寸完全相等；黑边内距边缘 2 px 的采样点为 #000000 ±2；帧内四角各内缩 5% 的采样点为背景色 ±3；帧矩形宽高比为 4:3，误差 ≤ 1 CSS px。暂停状态下改变视口后，帧截图仍有实体像素与背景，不是空白或透明。生产构建预览中，start + add 的截图有 marker 像素 | 自有 Vite 开发服务器与 `vite preview`，隔离的 Chrome profile；截图在页面内解码后采样，以文字记录数值，截图不入库 |
| AC-09 | 在 CSS 视口不变的情况下，把 DPR 依次改为 1 → 2 → 1.5 → 3：每次都由当前 resolution media query 触发，撤销旧查询并按新 DPR 登记下一次监听，重新布局；画布 `width`/`height` 等于公式结果（3 被限为 2），且暂停中也至少重绘 1 次（`draws` 增加）；释放后监听登记数与撤销数相等，没有控制台错误 | CDP `Emulation.setDeviceMetricsOverride` 每次重复传入同一 CSS width/height，只改变 deviceScaleFactor；测试侧包装 `matchMedia` 记录登记/撤销。只有 Chrome 证据，真实多显示器拖动归 P5 |
| AC-10 | 表面创建失败时，owner 仍被创建，start、add、remove 能得到 Core 结果，渲染状态为 unavailable 且携带原始错误，容器内没有画布；画面区域显示不可用的说明，开发面板的渲染诊断显示 unavailable，没有未捕获异常 | Node：注入会抛错的表面工厂。浏览器：依次尝试 `--disable-webgl`、`--disable-webgl2`、`--disable-3d-apis` 的自有 Chrome 启动组合，先确认 `getContext('webgl2')` 为 null，再记录 DOM 和面板交互；若本机版本在有界尝试后仍返回上下文，浏览器半项记 blocked，并保留 Node 注入证据，不伪造不可用状态 |
| AC-11 | 绘制端口在第 N 次绘制抛错后，渲染状态为 failed 并保留该错误；之后的帧和新运行都不再绘制；Session 仍为 running，错误出口没有 consumer 故障，命令照常被接受；dispose 仍完整释放 | Node：绘制端口替身注入异常。生产代码没有注入入口，因此浏览器不要求复现 failed；React 中 failed 的显示由同一状态组件覆盖，并经代码审阅确认 |
| AC-12 | 用页面已有画布的 `WEBGL_lose_context` 调用 `loseContext()` 后：DOM 显示 context-lost，会话 tick 继续推进，诊断 `draws` 不变，没有未捕获异常。调用 `restoreContext()` 后：状态回到 ready，立即重绘（暂停时截图也有实体），`draws` 增加；对同一实体集合，恢复并绘制后的 GPU 统计等于丢失前的值 | 浏览器：Chrome 的真实上下文丢失扩展。Node：替身发出丢失/恢复通知，验证状态转换、丢失期间零绘制、恢复后用最近帧重绘一次 |
| AC-13 | 以两种 kind 都已绘制过一次后的 GPU 统计为基线，经过 20 次 restart 和 50 对被接受的 add/remove，诊断中的 geometries、textures、programs 都等于基线，`entities` 等于当前 Render State 的实体数。dispose 时，每份共享几何与材质恰好释放一次，随后释放渲染器；若 `WEBGL_lose_context` 可用则调用一次强制丢弃，否则记录“不支持”并继续；最后移除画布。三类清理都必须尝试 | 浏览器：每次读取当前 renderer.info 的诊断数值并记录扩展可用性。Node：替身分别覆盖扩展存在/缺失，记录释放调用与顺序 |
| AC-14 | Node：渲染端口所有权在 Session 创建前转交 owner；会话释放、桥接解绑、渲染器释放三步都会尝试，失败汇总为 AggregateError；释放是幂等的；开始释放后不再有状态通知（包括不因强制丢弃而发 context-lost），迟到回调不再绘制；表面转交后 owner 初始化失败时也会回滚表面。运行消费者部分接线失败时，接线错误与本地回滚错误都保留，已经交给 bridge 的 handle 后续为 no-op。浏览器（开发模式）：StrictMode 首次挂载后容器内只有 1 个画布；画面组件 Fast Refresh 使 React effect 累计重建 ≥ 20 次后仍只有 1 个已连接的画布，此前记录的每个画布都已断开；支持 `WEBGL_lose_context` 的旧画布还须 `isContextLost()=true`，不支持的记录扩展缺失；没有 “Too many active WebGL contexts” 或 WebGL 错误日志；除当前渲染器持有的一组外，尺寸/DPR 观察和上下文监听的注册数与撤销数一致 | ≥20 次重建必须走重新执行 React effect 的路径：在执行回合由调用方对画面组件文件做临时、可还原的编辑，单次浏览器工具调用把画布引用保存在页面作用域数组；render 模块全页重载或动态 import 创建/释放循环只能补充上下文数量证据，不能替代同容器断言。浏览器测试 skill 本身不改源码；结束后还原临时编辑并证明 `git status` 除基线差异外无残留 |
| AC-15 | 页面中的合成画面容器有可见的合成标注（与现有开发面板一样使用英文界面文字），画布有可读的无障碍名称。ready、context-lost 显示为 status，unavailable、failed 显示为 alert。渲染状态句柄只在状态转换时通知，N 次绘制不会触发通知；运行 ≥ 2 s 内，画面组件在挂载后不再提交 React 更新。开发面板新增的渲染诊断区可用鼠标或键盘刷新，显示诊断快照的各字段，只读 | Node：状态句柄通知计数。浏览器：DOM 观测；React 提交计数所需的临时 Profiler 由执行回合调用方在进入 browser-testing skill 前加上，skill 只观察，完成后调用方还原并证明 `git status` 无新增残留；区分 StrictMode 的首次提交 |
| AC-16 | 初始配置、逐 tick 输入（含 `moveX`）和实际执行的命令都相同时，接入与不接入渲染器，以及渲染器处于 failed、context-lost 或无布局状态时，得到相同的 Core 事件流、replay 结果和状态哈希；渲染读取不改变 tick 或 RNG | Node：真实 recording/replay 与独立基线比对；只承诺同一版本、同一运行时下一致 |
| AC-17 | 新增的 `.test.ts` 进入现有 Vitest 发现范围；每个宣称 DOM-free 的渲染生产模块都由这些测试传递导入，因此进入无 DOM lib 的 Node 类型程序。目标测试与 `pnpm check` 通过（块体积警告只记录，不算失败）。没有新增 Playwright、jsdom、canvas 模拟、二进制资源或原版内容。工程约定和源码结构指南已同步渲染约定、目录与验证方式；阶段索引链接正确 | 目标 Vitest 与完整工程检查的输出、变更文件审阅、构建产物体积记录；证据写入后续 subtask |

## 验证策略

- **单元/契约测试：** 计划在 `src/render/` 新增邻接的 `.test.ts`，覆盖映射、插值、相机、布局、状态、诊断、失败隔离、上下文转换与释放；扩展 [owner 测试](../../../../src/app/composition/synthetic-demo-owner.test.ts)，覆盖渲染端口的装配、回滚与释放顺序。复用 [ControlledHost](../../../../src/app/session/synthetic-session.test-support.ts)、[UI 测试支持](../../../../src/ui/game/synthetic-ui.test-support.ts)以及真实 Core/Session。绘制端口替身只放在测试支持中，不进入生产导入链。
- **目标回归：** 实施后的目标命令为 `pnpm exec vitest run src/render src/app/composition src/ui/game src/app/session src/app/runtime src/core/synthetic`。当前 `src/render/` 还不存在，这条命令是实施要求，不是已通过的证据。
- **Replay/一致性：** 使用已有的 [synthetic-replay.ts](../../../../src/core/synthetic/synthetic-replay.ts) 和录制选项，在相同种子、逐 tick 输入（包括 `moveX` 与连续 add/remove）下，对照接入和不接入渲染器的事件流、检查点与状态哈希。布局、诊断和渲染状态不进入记录。
- **浏览器验证：** 按 [browser-testing](../../../../.agents/skills/browser-testing/SKILL.md) 执行。
  - 环境：在空闲端口启动自有 Vite 开发服务器，用隔离 profile 运行本机 Google Chrome（当前为 154 / macOS）；生产路径另用 `pnpm build` 与 `vite preview` 冒烟。只使用合成种子 0 的演示 owner，不读取或修改用户存储。
  - 截图：保持 Three.js 默认的 `preserveDrawingBuffer:false`，不依赖 `canvas.toDataURL()` 或事后 `readPixels`。浏览器工具取得截图 Buffer 后转 base64，在同一任务的 `page.evaluate` 中解码为 Blob，再用 `createImageBitmap` 做像素采样；只以文字记录坐标、颜色和尺寸，截图不入库。
  - 专项手段：DPR 用保持 CSS width/height 不变的 CDP 设备度量仿真；上下文丢失用 `WEBGL_lose_context`，并记录扩展可用性；不可用路径使用 AC-10 的有界参数尝试；HMR/Profiler 的临时源码编辑由 execute-goal 执行回合调用方准备和还原，browser-testing skill 只观察，不修改应用代码。≥20 次 effect 重建由调用方启动受控的画面组件编辑循环，单次浏览器任务在页面作用域持续收集引用；创建/释放动态 import 循环只作补充。测量时避开会污染 rAF 计数的 Playwright 等待，具体约束见[工程约定](../../../engineering/README.md#已验证的-cdp-自动化路线)。
  - 不在范围：页面实际 hidden 由 Session 转为暂停，渲染器没有独立的可见性逻辑；本任务以用户暂停覆盖静止帧，真实 hidden 的联合证据归 P1-10。
  - 清理：结束时关闭自有 context 和浏览器，停止自有服务器，删除临时文件。
- **实机/原版对照：** 不适用。画面是合成演示，不与原版截图对照。真实 GPU 性能、多显示器 DPR 切换、Safari/Firefox 等归 P5 或 P1-10。
- **工程检查：** 运行目标 Vitest、`pnpm check` 与边界回归；依赖许可以包元数据及锁文件审阅为准，P1-12 再建立可重复的许可检查。文档变更检查链接与 front matter。

## 风险与恢复

风险等级：中。本任务新增一个体积较大的运行时依赖，并引入 GPU 与浏览器资源生命周期；验证需要真实浏览器，而 Node 测试无法覆盖 WebGL。不过它不修改 Core、Runtime 或 Session 契约，也没有持久化数据。

- **WebGL 上下文与 GPU 资源泄漏：** StrictMode 和 HMR 会反复创建渲染器。缓解：先撤观察/监听并正常释放资源、移除画布；`WEBGL_lose_context` 存在时再最佳努力强制丢弃上下文，缺失时记录能力而不拒绝可用设备。按 kind 共享资源；用 ≥20 次 React effect 重建、GPU 统计基线和替身释放记录来验证。
- **DPR 与尺寸事件的浏览器差异：** 只在 Chrome 取证。缓解：布局用纯计算加 Node 参数表覆盖，浏览器部分只做事件接线；其他引擎与真实设备归 P1-10/P5。
- **Node 与浏览器测试分界：** 缓解：保持 DOM-free 边界，浏览器表面只是一层薄适配，其余逻辑都在 Node 中由替身与真实 Three.js 场景图覆盖。
- **渲染失败被静默掩盖：** 隔离会话后，画面失败时游戏仍在运行。缓解：状态与错误必须显示在页面上，并可从诊断读取；暂停策略与恢复入口明确交给 P1-08。
- **与 P1-06 装配耦合：** 缓解：只通过适配复用运行消费者接线，不修改 P1-06 的公开行为；P1-06 现有测试与浏览器证据中的行为保持不变。
- **包体积：** 记录体积与警告，不在 P1 调整构建配置；P5 处理性能与懒加载。
- **合成画面被误认为原版：** 缓解：页面与文档都标注为合成，颜色、几何和相机都写明是演示值。
- **恢复：** 只涉及代码与依赖，回退相应提交并恢复锁文件即可；没有存档、缓存或用户数据需要迁移。

## 未决事项

无。像素比上限、失败隔离策略、装配方式和测试分层，都已按用户“直接使用推荐答案”的授权写入技术决定，仍需用户批准完整契约。

## 审批

用户于 2026-10-02 明确批准当前契约，批准范围为全部 S-01–S-09、AC-01–AC-17 及审阅修订；审阅标记保持有效。
