---
type: plan
status: accepted
phase: P1
task: "08"
updated: 2026-10-10
related: [ADR-0003, ADR-0004, ADR-0012, ADR-0015]
---

# P1-08：菜单与导入占位 — Spec

## 问题与目标

P1-06 与 P1-07 已把合成开发面板和 Three.js 合成画面接入页面，但页面一加载就直接显示它们，没有菜单，也没有页面流转。因此目前：

- 用户无法从菜单进入或离开合成演示，“离开”只能靠刷新页面。P1-07 只验证了 StrictMode 与 Fast Refresh 重建时的释放；用户返回菜单这条路径上的会话、画布与 WebGL 上下文释放尚未验证。
- 没有导入入口，也没有任何地方说明原版数据导入尚未实现。
- 页面没有区分“这是合成演示”“导入尚未实现”“是否存在已验证的原版资源”这几件事。
- 渲染器进入终止的 failed 后，只能刷新页面恢复（[P1-07 技术决定 7](../07/spec.md#技术决定)把恢复入口留给本任务）。清理失败后的处置也只有面板上的一句提示。

本任务交付一个 **P1 React 菜单原型**（现代网页界面，不是原版菜单）：

- 页面加载时显示主菜单。主菜单只有两个入口：“启动合成演示”和“导入原版游戏数据”。原版数据状态如实显示为“没有已验证的数据”。
- 从菜单启动合成演示时，创建全新的会话与渲染器；演示中可以暂停、继续、重启，也可以随时返回菜单，返回时完整释放会话资源。
- 导入入口只显示“本构建尚未实现”的说明，不读取、保存或上传任何文件。
- 呈现会话故障、初始化失败、渲染失败与清理失败，并给出各自的恢复入口。
- 常规的鼠标、键盘操作和焦点在各画面之间正确流转。

阶段范围依据[总计划 §12](../../master-plan.md#12-开发阶段与验收条件)，任务导航见[阶段索引](../tasks.md#p1-08-菜单与导入占位)。本任务直接对应 P1 交付中的“React 导入/菜单原型”和阶段覆盖要求“占位不伪装成成功”，并为 [P1-10](../tasks.md#p1-10-浏览器集成与回归冒烟) 提供“菜单 → 合成场景”的入口；它不单独完成 P1 退出评审。

依赖关系：

- 直接依赖 [P1-06](../06/spec.md) 和 [P1-07](../07/spec.md)，两者的 goal（[P1-06](../06/goal.md#子任务跟踪)、[P1-07](../07/goal.md#子任务跟踪)）都已完成。
- 不依赖 [P1-09](../tasks.md#p1-09-最小键盘适配与输入隔离)。P1-09 之后把游戏键接入演示画面的会话生命周期，本任务不预建键盘适配或“活动界面”登记。

## 范围

### 包含

- **S-01 页面流转：** 三个画面：主菜单、导入占位、合成演示。页面状态只在内存中，初始为主菜单，刷新页面后回到主菜单。转换规则在 DOM 之外定义，可在 Node 中测试。
- **S-02 主菜单：**
  - 显示应用标题和“不含原版内容”的声明。
  - 显示原版数据状态：当前没有已验证的原版数据，本构建也无法导入或验证。
  - 只有两个入口，各带说明。
  - 不提供任何原版玩法入口，也不显示任何成功标记。
- **S-03 进入合成演示：**
  - 每次从菜单进入，都创建一个新的演示 owner，包括会话、桥接、渲染器和画布。
  - 这次菜单选择本身就是用户的开始操作，只向初始化成功且仍为当前的 owner 发出一次 start；重复 effect 不重复派发，失败不自动重试。
  - 演示画面由三部分组成：“返回菜单”、P1-07 的合成画面、P1-06 的开发面板。
- **S-04 返回菜单与释放：** 在演示画面的任意状态下都可以返回菜单。下一次创建 owner 之前，必须完成旧 owner 的全部清理尝试并处理结果；成功时没有残留的画布、帧请求、会话监听或渲染观察器。提前返回、重复激活、容器替换、StrictMode 与 HMR 都遵守同一边界。
- **S-05 失败呈现与恢复入口：**
  - 以下各种失败都显示具体原因、对会话的影响和可用的恢复操作：会话故障、owner 初始化失败、渲染 unavailable、failed 与 context-lost、清理失败。
  - 渲染失败时不自动暂停会话。
  - 任一资源清理或初始化回滚失败后，本页面不再创建或自动启动新 owner，直到刷新页面；保留错误原因并明确反馈。StrictMode/HMR 没有绕过这项阻断的例外。
- **S-06 导入占位：**
  - 说明导入尚未实现，本构建不会读取、存储或上传用户的原版文件；以后版本的原版数据导入在浏览器本地处理用户自有数据。具体来源与阶段见[总计划 §3.3](../../master-plan.md#33-统一资源流程)，不把光盘镜像说成唯一的长期导入源。
  - 画面上只有“返回菜单”一个控件。
- **S-07 键盘、鼠标与焦点：** 只使用原生按钮。切换画面时移动焦点，返回时把焦点恢复到打开该画面的入口，不注册全局键盘监听。
- **S-08 验证与文档：** Node 契约测试、真实 Chromium 证据（开发服务器与生产预览），并同步工程文档。

### 不包含

- **真实导入（属于 P2/P5）：** 文件选择、拖放、目录选择、光盘镜像/封包解析、Worker、版本识别、IndexedDB 缓存、配额检查，以及面向玩家的导入错误提示（见[总计划 §3.3](../../master-plan.md#33-统一资源流程)与 [ADR-0003](../../../decisions/ADR-0003-disc-image-primary-import.md)）。本任务不放置 `<input type="file">` 或拖放区，也不探测浏览器存储。
- **原版界面（属于 P4）：** 原版风格菜单、`OPTIONS.NOB` 的菜单场景与字体等原版资源。原版菜单的结构和快捷键尚未研究，本任务不作推测。
- **原版玩法相关入口：** 开始游戏、战役、训练、继续、读档等入口，以及存档、设置、音量和键位重映射，分属 P3–P5。
- **输入（属于 P1-09）：** 游戏键、全局快捷键（含 Esc、`p`、Alt）、Pointer Lock、全屏与 Keyboard Lock。
- **离开前确认：** 任务中途离开的确认与 `beforeunload` 属于 P3 及以后；合成演示没有需要保护的进度。
- **路由：** URL 路由、浏览器历史记录、深链接或路由库。
- **对上游玩法/调度契约的修改：** 不原地重建渲染器，不自动重试，渲染失败不自动暂停。Core、Runtime、Session，以及渲染状态机、帧消费和绘制契约不变，不新增暂停原因或控制命令；清理结果信号的窄扩展仅限本任务的阻断与错误反馈。
- **工程设施（属于 P1-10）：** Playwright/E2E runner、jsdom、React Testing Library 和 CI。
- **开发面板：** 不重设计，也不按环境隐藏；面板内按钮被禁用后的焦点恢复不在本任务处理（沿用 P1-06 的行为）。
- **界面语言与持久化：** 不做多语言界面，不持久化页面状态。

### 涉及模块

| 模块 | 责任与影响 |
|---|---|
| `src/app/flow/`（计划新增） | DOM-free 的页面流转状态与转换规则；按[源码结构指南](../../../engineering/source-structure.md#职责与依赖)，页面流转归 `app/`；由邻接 Node 测试覆盖 |
| [app/composition](../../../../src/app/composition/)（已有） | owner 新增一个只读的清理失败记录；装配把失败与原始原因交给页面流转，覆盖创建前回滚、初始化、正常释放与 owner 替换。仅演示画面可以创建 owner；释放顺序不变，创建/一次性启动/释放的接线可在 Node 中验证 |
| `src/ui/pages/`（计划新增） | 主菜单、导入占位和合成演示画面的 React 组件；演示画面组合已有的画面组件、开发面板与“返回菜单” |
| [ui/render](../../../engineering/source-structure.md#r7-演示页面开发面板与画面)、[ui/dev](../../../../src/ui/dev/)（已有） | 复用。只修改恢复说明文字和标题层级，不改变订阅、读取或派发方式 |
| [App](../../../../src/app/App.tsx)（已有） | 改为应用外壳：持有页面流转状态，只渲染当前画面；不再在加载时直接创建合成 owner |
| [app/session](../../../../src/app/session/)、[app/runtime](../../../../src/app/runtime/)、[core](../../../../src/core/)（已有） | 契约与行为不变 |
| [render](../../../../src/render/)（已有） | 状态机、绘制和释放顺序不变；如初始化回滚结果目前无法可靠传到装配，允许只补充必要的结构化失败信号，不增加恢复、绘制或调度接口 |
| [工程约定](../../../engineering/README.md)、[源码结构指南](../../../engineering/source-structure.md)（已有） | 实施时同步页面流转、目录与验证方式 |

## 当前实现与依据

- **页面入口：**
  - [main.tsx](../../../../src/main.tsx) 在 StrictMode 中渲染 [App](../../../../src/app/App.tsx)。
  - App 一加载就调用 `useSyntheticDemoOwner()`，并直接显示标题、声明、`SyntheticRenderView` 与 `SyntheticDevPanel`。
  - 目前没有菜单、页面状态或导入入口，也不会自动 start。
  - [index.html](../../../../index.html) 的语言为 `en`，现有界面文字都是英文。
- **owner 与 hook：**
  - [synthetic-demo-owner.ts](../../../engineering/source-structure.md#r5-演示所有者与槽位) 是 DOM-free 的 owner，用固定的 `SYNTHETIC_DEMO_OPTIONS`（种子 0）创建 store、命令反馈、渲染器、桥接和会话。
  - 初始化失败时，owner 尝试全部回滚，并写入 `actionError{operation:'initialize'}`。此后 `dispatch` 不做任何事，`dispose()` 直接返回。
  - `dispose()` 是幂等的，依次释放会话、解绑桥接、释放渲染器；失败汇总为 `AggregateError`，写入 `actionError{operation:'cleanup'}` 后抛出。
  - [use-synthetic-demo-owner.ts](../../../engineering/source-structure.md#r5-演示所有者与槽位) 返回 `{owner, containerRef}`。容器元素存在时创建 owner；容器被替换、组件卸载、StrictMode 重跑或 Fast Refresh 时，先释放旧 owner 再创建新的。当前实现只经 `reportError` 报告释放失败，没有阻断后续重建；这不是 P1-05 的失败恢复保证，本任务须补齐阻断。
  - owner 当前会把渲染器创建异常转成 unavailable，即使异常还包含回滚清理失败。浏览器表面创建也可能在转交 owner 之前回滚失败；这两条路径不能仅因展示了 unavailable 就视为资源已安全释放，见 [createSyntheticRenderer](../../../engineering/source-structure.md#r2-合成渲染) 与 [createBrowserWebGLSurface](../../../../src/render/webgl/browser-webgl-surface.ts)。
  - owner 的现有测试见 [synthetic-demo-owner.test.ts](../../../engineering/source-structure.md#r5-演示所有者与槽位)。
- **会话语义：** 见 [P1-05](../05/spec.md) 与 [synthetic-session.ts](../../../engineering/source-structure.md#r4-合成会话)。
  - phase 为 idle、running、paused、faulted 或 disposed。exit 结束当前运行并回到 idle，但不负责切换 React 菜单。
  - 页面隐藏时 start 的运行处于 paused（原因 hidden）。
  - `status.cleanupFailed` 一旦为真就阻断 start 和 restart。P1-05 技术决定规定：不能用新实例掩盖清理失败，也不提供“忽略错误继续”；由操作者处理，必要时刷新后重建 owner。
  - 测试宿主见 [ControlledHost](../../../engineering/source-structure.md#r4-合成会话)。
- **会话的浏览器宿主：** 每个会话的 [browser-session-host.ts](../../../../src/platform/browser/browser-session-host.ts) 是唯一的 rAF 来源，并注册 `visibilitychange`、`pagehide`、`pageshow` 三个生命周期监听。
- **开发面板：** [SyntheticDevPanel.tsx](../../../engineering/source-structure.md#r7-演示页面开发面板与画面) 提供会话控制（Start/Pause/Resume/Restart/Exit）、marker 命令、状态、投影、命令反馈、错误区和渲染诊断。
  - 全部使用原生按钮，不注册全局键盘监听。
  - 清理失败时提示“Reload the page to create a new session.”。
  - 可用性规则见 [synthetic-game-controls.ts](../../../engineering/source-structure.md#r6-合成-ui-层)：faulted 时 Restart/Exit 可用；cleanupFailed 时 Start/Restart 不可用。
- **合成画面组件：** [SyntheticRenderView.tsx](../../../engineering/source-structure.md#r7-演示页面开发面板与画面) 按渲染状态显示 status 或 alert。
  - failed 的文字目前写“reloading the page restores the picture”。
  - 画布、上下文、观察器的释放与 GPU 统计见 [P1-07 spec](../07/spec.md) 及其[最终对齐证据](../07/subtasks/08-final-browser-alignment.md#完成证据)。
- **导入与原版数据：**
  - [original-data](../../../../src/original-data/) 目前只有供工具和测试使用的研究解析器与合成样本。没有 File、Worker、IndexedDB 或版本识别接线，`content/`、`workers/` 也尚未创建。
  - 导入流程见[总计划 §3.3](../../master-plan.md#33-统一资源流程)：P2 只支持 CCD/IMG，BIN/CUE、ISO 与 ZIP/文件集在 P5 补齐；资源只在本地处理，默认不上传（[§8](../../master-plan.md#8-浏览器运行存档与隐私)）。
- **原版菜单研究：**
  - [imfat.md](../../../original/formats/imfat.md) 把 `OPTIONS.NOB` 中的 MESC 条目标为“菜单场景”，置信度为未确认；[hud.md](../../../original/formats/hud.md) 记录了一种可能用于菜单的字体（高概率）。
  - [键位表](../../../original/input/key-map.md)中“菜单中的其他快捷键”待试玩补充。
  - 原版菜单分辨率的已确认记录见 [U-006](../../../original/unknowns.md)；不据此约束本任务的现代响应式菜单原型。
  - 本任务不使用这些资源，也不推测原版菜单结构；原版风格界面属于 P4。
- **冻结依据：**
  - [总计划 §4.1](../../master-plan.md#41-目录与模块划分)：React 负责菜单、导入、设置等飞行之外的界面。
  - [§5](../../master-plan.md#5-状态管理与通信约定)：菜单页与对话框使用 React 本地状态或 UI store；返回菜单走 Runtime 控制通道；返回菜单不能产生第二条游戏循环，所有订阅与 GPU 资源随会话销毁。
  - [§7.1](../../master-plan.md#71-classic先保真)：非飞行界面采用响应式布局。
  - [§1.2](../../master-plan.md#12-首版交付范围) 与 [ADR-0004](../../../decisions/ADR-0004-keyboard-mouse-original-keys.md)：首版只支持键鼠，鼠标负责菜单；菜单与设置等非飞行界面不拦截按键。
  - 本地验证边界见 [ADR-0012](../../../decisions/ADR-0012-local-p1-defer-ci-deployment.md)，目录见 [ADR-0015](../../../decisions/ADR-0015-source-module-structure.md)。
- **浏览器取证路线：** 沿用[工程约定](../../../engineering/README.md#已验证的-cdp-自动化路线)中 P1-07 已验证的方法：shell 启动隔离 profile 的 Chrome，通过 `connectOverCDP` 驱动，用 init script 探针计数；WebGL 不可用的场景用 `--disable-webgl --disable-webgl2 --disable-3d-apis` 启动。
- **研究结论：** 本任务不产生原版研究结论，也不新增 U/B 事实。菜单文字、布局和流转都是 P1 原型设计，不代表原版界面。

## 行为与边界

| 场景或状态转换 | 预期结果 | 拒绝或失败时的反馈 |
|---|---|---|
| 页面加载（开发或生产构建） | 显示主菜单：应用标题与声明、原版数据状态、两个入口。不创建 owner、会话、画布、帧请求或会话生命周期监听；不读写任何浏览器存储；不移动焦点 | — |
| 选择“Start synthetic demo”（鼠标点击，或 Enter/Space） | 切换到演示画面，焦点移到演示画面标题；owner 尚未可用时有 preparing 状态，“返回菜单”始终可用。创建新 owner，只向初始化成功且仍为当前的 owner 派发一次 start：页面可见时进入 running（run 1），隐藏时按 P1-05 进入 paused/hidden。合成标注、画面与开发面板都可见 | owner 初始化失败或 start 同步失败时，显示原始错误及返回菜单的处置方式；不重试。回滚失败另锁存并阻断重建 |
| 演示中操作 Pause、Resume、Restart、Exit、Start 与 marker 命令 | 沿用 P1-06/07 的行为与反馈。Exit 后会话回到 idle，但仍停留在演示画面，可再次 Start | 同 P1-06 |
| 选择“Return to menu”（会话处于任意 phase，包括 preparing、初始化失败、渲染失败或 unavailable） | 按 P1-07 的顺序尝试释放 owner（会话 → 桥接 → 渲染器）。成功时画布移除、支持扩展的上下文已丢弃、无应用帧请求且监听与观察器全部撤销；随后显示可交互的主菜单，焦点回到“Start synthetic demo”。owner 尚未创建时撤销此次进入意图，不再创建；重复返回不重复清理。不弹确认对话框 | 释放失败，或此 owner 曾经发生清理失败时：先锁存失败再开放主菜单，错误仍显式报告；不得把资源仅“全部尝试过”说成已释放成功，也不得开放下一次 owner 创建 |
| 清理失败锁存（任意画面、含 owner 创建前的回滚） | 保留原始原因并显示 alert，说明资源释放未能确认成功、需刷新页面；不创建或自动启动新 owner。演示画面仍可返回菜单；主菜单原生禁用“Start synthetic demo”并说明原因，导入入口照常可用。由演示返回菜单时焦点在主菜单标题；由导入返回时仍回到导入入口。锁存归当前应用外壳实例，页面转换和页面/owner 子树的 Fast Refresh 不清除它 | 不提供“忽略并继续”。整页重载或整个应用根重新初始化不属于同一实例内的恢复；本任务的替换验证保留应用外壳，不用重置应用根绕过锁存 |
| 再次进入演示 | 新 owner、新会话（runId 从 1 开始）、新画布，不复用旧 owner 的任何对象；旧 owner 的迟到回调不影响新画面 | — |
| 渲染状态为 failed | 画面区以 alert 说明渲染已停止、会话不受影响；可返回菜单后重新启动演示尝试恢复（清理成功时），这会丢弃本次合成状态并重建会话与渲染器；会话不自动暂停 | 不保证重建一定恢复；仍失败或 unavailable 时继续如实显示。清理失败则提示刷新，不允许重新进入 |
| 渲染状态为 unavailable | 画面区以 alert 说明 WebGL 2 不可用、会话不受影响；演示照常运行，返回菜单照常可用；再次进入仍可能不可用 | 不回退到 WebGL 1 或 2D Canvas（P1-07） |
| 渲染状态为 context-lost | 沿用 P1-07：显示为 status，等待浏览器恢复 | — |
| 会话 faulted | 面板显示会话错误，Restart/Exit 按 P1-06 可用，“返回菜单”可用。只有故障及随后的释放均无清理失败时，返回菜单不锁存 | 故障清理同时失败时不能当作普通 faulted 绕过阻断 |
| 会话 cleanupFailed | 面板说明 Start/Restart 已被阻断；装配在任何替换或返回机会之前交付清理失败记录，锁存阻断新 owner。返回菜单后提示刷新页面 | — |
| 选择“Import original game data” | 切换到导入占位画面，焦点移到其标题。说明本构建尚未实现导入、不会读取/存储/上传用户原版文件、以后版本在浏览器本地处理用户自有数据。不声称当前支持任何格式，也不限定长期来源只有镜像；不创建 owner | 画面上没有文件选择器、拖放区或 Worker；不因页面转换发出网络请求，也不写入存储 |
| 从导入占位返回菜单 | 显示主菜单，焦点回到“Import original game data” | — |
| 快速重复激活同一入口（如双击） | 每次激活最多触发一次画面转换。无论第二次点击落在哪个新控件上，同一时刻至多存在一个 owner，每次离开演示都完整释放 | 不加防抖或延时 |
| 键盘操作 | Tab 顺序与视觉顺序一致；Enter/Space 激活按钮；画面标题可以接收程序焦点，但不在 Tab 顺序中。应用不在 window/document 上注册键盘监听；Esc、`p`、Alt 在任何画面中都不切换画面，也不改变会话 | 游戏键由 P1-09 负责 |
| StrictMode 首次挂载、Fast Refresh、容器替换 | 只有演示画面可以创建 owner；旧 owner 的全部清理尝试完成且未锁存失败后，才允许创建替换 owner。任一时刻至多一个活动 owner、一个画布和一条帧请求链。新 owner 接收一次 start；保留同一 owner 时的重复 effect 不重复 start，面板 Exit 后的 idle 也不触发自动 start。Fast Refresh 若重置为主菜单，则释放 owner | 清理失败立即锁存并阻断替换，不等到返回菜单；已释放或已被替换的 owner 不得因迟到的 effect 收到 start 或提交画面更新 |
| 刷新页面 | 回到主菜单，锁存清除，不恢复任何演示状态 | — |

### 画面与控件契约

以下英文名称是稳定的可访问名称，P1-10 用它们定位元素。说明文字只规定必须表达的含义，具体措辞由实现决定；测试 ID 也由实现决定。

- **应用外壳（所有画面）：** 一个 `main` 区域。标题 `Open Star Rangers`（h1），声明说明这是浏览器重实现、不包含原版游戏内容。
- **主菜单：**
  - 画面标题 `Main menu`。
  - 原版数据状态：没有已验证的原版游戏数据，本构建无法导入或验证。
  - 按顺序排列的两个按钮，各有可见说明，并通过 `aria-describedby` 关联：
    - `Start synthetic demo`：P1 合成工程演示，不是原版玩法，不需要游戏数据。
    - `Import original game data`：本构建尚未实现。
  - 锁存时增加一个 alert，`Start synthetic demo` 被原生禁用，说明中写明原因。
- **导入占位：** 画面标题 `Import original game data`，加上 S-06 的说明文字和一个按钮 `Return to menu`。
- **合成演示：**
  - 画面标题 `Synthetic demo`。
  - 按钮 `Return to menu`，在 Tab 顺序中位于画面和开发面板的所有控件之前。
  - 其后是 P1-07 的合成画面（含其合成标注）和 P1-06 的开发面板（含其合成标注）。
  - 画面标题在整页中唯一；已有组件的区块标题不得重复画面标题，标题层级不跳级。
- **始终禁止出现：** 任何画面都不能出现开始游戏、战役、训练、继续、读档等原版玩法入口，也不能出现“已导入”“已验证”“可以游玩”之类的成功标记。
- **失败可见性：** 即使 owner 未创建或开发面板已卸载，初始化/回滚/释放失败的说明和原始原因也必须可见。清理失败记录属于当前应用实例，不靠已卸载组件的 store 保留；异常值允许为任意 `unknown`，不能只支持 `Error`。

## 数据模型与契约

### 已有权威类型

| 数据/字段 | 类型、单位与约束 | 权威所有者 | 输入/输出边界 |
|---|---|---|---|
| `SyntheticDemoOwner` | `{store, renderer, dispatch(action), dispose()}`；`dispose` 幂等，失败时抛出 `AggregateError` | [app/composition](../../../engineering/source-structure.md#r5-演示所有者与槽位) | 只由演示画面的 hook 创建和释放；页面流转不持有 owner 引用 |
| `SessionStatus.cleanupFailed` | boolean，为真时阻断 start/restart（P1-05） | [Session](../../../engineering/source-structure.md#r4-合成会话) | owner 据此得出“曾发生清理失败”，见下表 |
| `UiActionError` | `{operation, cause:unknown}`，operation 为 `SessionControl['type']`、`Command['type']`、`'initialize'` 或 `'cleanup'` | [UI store](../../../engineering/source-structure.md#r6-合成-ui-层) | 面板照常显示；页面流转接收装配明确交付的清理失败，不猜测错误类别 |
| `SyntheticRendererStatus` | ready、context-lost、failed、unavailable 或 disposed，附原始错误 | [渲染器](../../../engineering/source-structure.md#r2-合成渲染) | 画面组件按状态显示说明与恢复方式；本任务不改变状态机 |
| `SyntheticPanelAction` | start、pause、resume、restart、exit、add-marker、remove-marker | [UI 控制](../../../engineering/source-structure.md#r6-合成-ui-层) | 进入演示时的 start 经同一派发路径执行，同步失败写入 `actionError` |

### 计划新增契约

类型名与文件以实现为准；下表规定形状与约束，不规定函数拆分。

| 数据/字段 | 类型、单位与约束 | 权威所有者 | 输入/输出边界 |
|---|---|---|---|
| 页面流转状态 | 冻结的内存快照：`screen:'menu'\|'import'\|'demo'`；`demoVisit`：非负安全整数，初始 0，每次进入演示严格递增；`focusTarget:'demo-entry'\|'import-entry'\|'menu-heading'\|null`（菜单上的程序焦点目标，非菜单为 null，首次加载为 null）；`cleanupFailure:Readonly<{cause:unknown}>\|null`（清理失败锁存）。初始值为 `{screen:'menu', demoVisit:0, focusTarget:null, cleanupFailure:null}`；失败记录外壳冻结，不冻结原异常 | `src/app/flow/`（DOM-free） | React 外壳持有当前值并据此渲染与聚焦；不包含 owner 或世界引用。`cleanupFailure !== null` 即阻断新 owner；不写入存储、URL 或 history |
| 页面流转输入 | `{type:'open-demo'\|'open-import'\|'return-to-menu'}` 或 `{type:'demo-release-failed', cause:unknown}`。返回演示的 `return-to-menu` 只在全部清理尝试及失败交付完成后提交 | 同上 | 对合法输入输出新状态，或原样返回同一对象（转换不适用时），不执行副作用；`demoVisit` 已到 `Number.MAX_SAFE_INTEGER` 时再进入须抛 `RangeError`，应用显式显示错误且不创建 owner |
| 转换规则 | menu + `open-demo` → demo，`demoVisit+1`、`focusTarget=null`（已锁存时不适用）。menu + `open-import` → import、`focusTarget=null`。demo + `return-to-menu` → menu，焦点目标为 demo-entry；已锁存时改为 menu-heading。import + `return-to-menu` → menu，焦点目标为 import-entry。任何画面首次收到 `demo-release-failed` 都保留 `{cause}`；当前为 menu 时焦点目标改为 menu-heading。重复失败不覆盖首个原因，也不抢夺后来正常导航的焦点；后续独立错误仍须报告。其余组合不适用 | 同上 | 锁存只能从 null 变为失败记录；旧 owner 的真实释放失败也不能因身份过期而被忽略 |
| owner 清理失败记录 | `SyntheticDemoOwner` 新增只读查询，返回 `Readonly<{cause:unknown}>\|null`；初始化回滚失败、该 owner 的会话曾报告 `cleanupFailed`、`dispose()` 失败时保留首个包含清理原因的原始错误，释放后仍可读取。无清理失败的初始化失败、会话 faulted、渲染 failed 或 unavailable 不设置记录 | [app/composition](../../../engineering/source-structure.md#r5-演示所有者与槽位) | 所有独立清理仍尝试；错误照常显示/抛出，不因锁存被吞掉。装配在重建或返回前取得记录，先把失败交给应用外壳再允许后续页面动作 |
| owner 创建前与渲染器创建回滚 | 浏览器表面工厂、渲染器初始化与运行消费者部分接线发生回滚失败时，装配接收明确的清理结果和原始原因；在 owner 尚不存在或 Session 尚未创建时也成立 | 各初始化边界拥有清理结果；装配统一阻断 | 不通过错误消息、`AggregateError` 类型或渲染 unavailable 状态猜测“是否清理失败”。成功回滚的 WebGL 不可用保留 P1-07 的无画面演示行为；回滚失败则锁存，不再创建/启动新资源 |
| 进入时的 start 与 owner 身份 | 每个初始化成功且仍为当前的 owner，在该次进入意图有效时恰好派发一次 `start`；一次尝试失败也消耗这次自动启动意图。重复 effect、父级重渲染、同 owner 的 phase 变化不重复派发；已被替换、已释放或因初始化失败不可用的 owner 不收到 start | [app/composition](../../../../src/app/composition/) 的演示装配 | 不在页面加载时 start；不在纯状态转换/React render 中创建、释放或派发。返回、替换和取消意图会立即使旧 owner 的启动接线失效；React 不发布已失效 owner 为当前值 |

原版数据状态在 P1 中是固定的界面文字，不对应任何类型。本任务不定义 P2 的内容状态或已验证资源模型，也不读取存储来生成这段文字。演示入口只使用 `SYNTHETIC_DEMO_OPTIONS`，不接受内容、导入或存档参数。

### 持久化与兼容

不适用。页面状态、锁存与焦点目标都只在内存中，刷新后重置。本任务不读写 IndexedDB、localStorage、sessionStorage、Cache Storage 或 cookie，不涉及内容指纹、存档 schema、迁移或配额，也不修改 P1-03 的 snapshot/replay 格式或版本。

## 技术决定

用户要求遇到问题时直接采用推荐答案，以下选择据此作出；这不等于用户已批准完整契约。

1. **三个画面、内存中的页面状态、不引入路由。** P1 只有三个画面，转换规则简单；URL 或 history 会带来深链接与“后退”语义，而后者会绕过释放流程，P1 不需要。页面状态的转换规则 DOM-free，以便在 Node 中测试（[ADR-0015](../../../decisions/ADR-0015-source-module-structure.md) 的 `app/` 职责）。
2. **owner 的生命周期等于一次演示访问。** 进入时新建，返回菜单时完整释放；菜单上不保留暂停中的会话，也没有“继续演示”。返回菜单经 owner 释放会话（Session 控制通道的 dispose），不进入游戏命令队列。这样每次往返都检验总计划 §5 的“随会话销毁”，而且失败的渲染器可以通过重新进入来重建。
3. **菜单选择即显式 start，一次性绑定到当前 owner。** 按钮名称写的是 “Start”，owner 初始化成功且仍为当前时经 P1-06 的同一路径派发一次；不能用“phase 是 idle”作为每次 effect 都 start 的条件，否则面板 Exit 会被自动撤销。P1-06 禁止的页面加载自动开始仍不发生。未来音频解锁若需要瞬时用户激活，必须在真实点击处理内另行设计，不能假定后续 effect 仍携带浏览器的用户激活。
4. **返回菜单不需要确认，也不注册 `beforeunload`。** 合成演示没有可丢失的进度；任务中途离开的确认属于 P3 及以后。
5. **渲染失败不自动暂停，恢复方式是返回菜单后重新进入尝试重建。** 这是本任务对合成演示的选择，不是 Session 技术上无法暂停：采用现有 pause 也可以暂停，但会显示 user 原因。本任务保持 P1-07 的会话隔离，不新增暂停原因或原地替换接口。重新进入会丢弃合成状态并重建会话与渲染器，只有释放成功才允许；不承诺下一次初始化必定成功。真实玩法的暂停策略留到 P3。
6. **所有生命周期入口统一阻断清理失败，直到整页重载。** 遵循 P1-05 的“不能用新实例掩盖清理失败”，同时覆盖返回菜单、初始化回滚、容器替换、StrictMode 与 Fast Refresh。装配在创建新 owner 或开放可交互菜单之前先完成旧清理并同步锁存；不能只在卸载后的异步 state 更新中通知。锁存保留原因，不依赖旧面板；只补必要的结构化清理结果，不增加全局单例或通用恢复框架。导入占位仍可用，所有已取得资源的独立清理仍须尝试。
7. **导入只做说明，不放文件控件。** 一个能选文件却什么也不做的控件，本身就是伪装的交互。原版数据状态写成固定文字，不探测存储，也不预建 P2 的内容状态模型。主菜单不提供原版玩法入口，即使是禁用的也不提供：P1 中这样的入口没有可验证的行为，P2/P3 加入真实入口时再定义资源门槛。
8. **焦点规则。** 由菜单打开新画面时，焦点移到该画面标题（`tabIndex=-1`）；返回菜单时，焦点回到打开该画面的入口；入口被禁用时，焦点回到菜单标题。首次加载不抢焦点。这些规则符合常见的单页应用无障碍做法，便于键盘和读屏用户确认画面已切换。
9. **只使用原生按钮，不注册全局键盘监听。** 菜单不拦截任何按键（总计划 §1.2）。P1-09 之后在演示画面的会话生命周期内接入游戏键；本任务不预建活动界面登记或键位表。
10. **复用已有组件，只调整文字与标题层级。** 渲染 failed 的说明改为指向“返回菜单并重新启动演示”；开发面板和画面组件的标题层级随演示画面调整，订阅、诊断读取与派发方式不变。开发面板在开发与生产构建中都保持可见（延续 P1-06 技术决定 7）。
11. **测试分层。**
    - Node：页面流转转换规则、owner 清理失败记录，以及实际供 React 使用的 DOM-free 创建/一次性启动/释放接线（复用 `ControlledHost`、`RecordingSurface` 和已有的故障注入方式；不复制另一套测试控制器）。
    - 真实 Chrome（开发服务器与 `vite preview`）：React 画面、焦点、键盘、释放与重复往返。
    - 不引入 jsdom、React Testing Library 或 Playwright 依赖；`.tsx` 不进入 Node 类型程序（P1-07 的边界规则）。
    - 不增加公开的故障注入入口。罕见失败的状态转换、阻断、原因保留和恢复重建用真实装配的 Node 测试证明；failed/faulted/清理失败的 React 文案与焦点接线另经代码审阅，不把代码审阅描述为浏览器复现。
12. **界面文字使用英文，与现有界面一致。** 菜单是 P1 原型，不是原版界面；原版风格菜单属于 P4。

## 验收标准

| ID | 可观察的通过条件 | 验证方法与所需证据 |
|---|---|---|
| AC-01 | 开发服务器与生产预览中，页面加载后都显示主菜单：h1 `Open Star Rangers` 和声明；画面标题 `Main menu`；原版数据状态说明没有已验证数据、本构建无法导入或验证；按 Tab 顺序恰好两个可交互控件，即启用的按钮 `Start synthetic demo` 和 `Import original game data`，各自的说明经 `aria-describedby` 关联且含义符合“画面与控件契约”。页面中没有原版玩法入口或成功标记。没有画布；在 ≥1 s 的页面内定时器窗口中，应用的 `requestAnimationFrame` 调用为 0；会话生命周期监听登记为 0；`document.activeElement` 为 body；除 `/favicon.ico` 404 外没有控制台错误 | 隔离 profile 的 Chrome，用 DOM 与可访问性快照；init script 包装 rAF 与 `addEventListener`，按调用栈只统计应用代码的调用（排除 Vite 客户端与测试工具自身的登记和轮询），下文的 rAF 与监听计数均按此归属 |
| AC-02 | 页面流转纯逻辑满足“计划新增契约”中的转换规则：初始状态；每个适用的转换及焦点目标；每个不适用组合原样返回同一对象（含锁存后的 `open-demo`、demo 中的 `open-import`、menu 中的 `return-to-menu`）；`demoVisit` 从 0 严格递增，安全整数耗尽时抛 `RangeError` 而不生成非法状态；进入 demo/import 时清空 `focusTarget`。`demo-release-failed` 在三个画面中都锁存首个原始原因，分别覆盖 Error、非 Error 与 null 抛出值；重复失败不清锁存、不覆盖首因、不抢夺后来正常导航的焦点。锁存后的 import 往返照常且返回焦点仍为 import-entry；演示返回则为 menu-heading。快照和失败记录外壳冻结，不冻结原异常 | Node 参数化测试；模块不引用 DOM，并由测试传递导入，进入 `tsconfig.node.json` 程序 |
| AC-03 | 分别用鼠标点击、Tab 到位后按 Enter、按 Space 激活 `Start synthetic demo`，每次结果都是：主菜单卸载，显示演示画面，焦点在 `Synthetic demo` 标题上（不在 Tab 顺序中）；容器内恰好 1 个画布；前台页面 ≤1 s 内 phase 为 running、run 为 1，投影 tick 递增。刷新诊断两次确认 ready 且 `draws` 递增；截图中存在 P1-07 定义的 mover 颜色像素，不只检查画布存在。两处合成标注可见，`Return to menu` 是标题之后的第一个 Tab 控件。应用已登记且尚未执行或取消的 rAF 请求 ≤1；会话生命周期监听净登记为 3。生产预览中也能进入并看到 running 与 mover；重复自动启动另由 AC-15 验证 | 同 AC-01 的 Chrome 与探针；读 DOM、按需刷新诊断、截图像素采样。1 s 为有界冒烟等待窗口，不作为性能承诺 |
| AC-04 | 在由菜单进入的演示中：Pause 后 phase 为 paused，刷新诊断读 `draws`，间隔 ≥1 s 再刷新，数值相同；Resume 后回到 running。旧 tick ≥30 时，在同一页面任务中激活 Restart 后立即 Pause，run 为 2，projection.tick 与 drawnTick 都为 0，再 Resume。Add marker 得到 Core accepted，截图中 marker 材质色像素 ≥9（P1-07 判据）；Exit 后 phase 为 idle，投影为空、画面只有背景，≥1 s 内保持 idle（不能被自动 start 撤销）；面板 Start 后 run 为 3 且 running。全程不切换画面 | Chrome：使用原生按钮的同一派发路径，不直接修改会话；截图在页面内解码采样（颜色容差沿用 P1-07，不入库）。诊断区是按需快照，每次断言前主动刷新，不把陈旧读数当作停止绘制证据 |
| AC-05 | 分别从 running、user 暂停和 Exit 后的 idle 三种状态激活 `Return to menu`（至少一次用鼠标、一次用键盘）：显示主菜单，焦点在 `Start synthetic demo`；文档中没有画布；进入时记录的画布已断开，且在扩展可用时 `isContextLost()` 为 true（不可用时记录扩展缺失）；返回后 ≥1 s 的定时器窗口内，应用 rAF 调用与待执行请求均为 0；会话生命周期监听、ResizeObserver 与 resolution 媒体查询的登记数都等于撤销数；没有未捕获异常或 `reportError` 输出。生产预览中返回菜单不触发网络请求 | Chrome 探针（沿用 P1-07 的观察器与查询计数方式）；生产预览中记录 CDP Network 事件 |
| AC-06 | 开发服务器上连续 20 次“进入 → running 且 tick ≥30 → Add marker 得到 accepted → 返回菜单”：每次进入时恰好 1 个已连接画布，首个运行的 runId 为 1，按需刷新后实体数为 2；每次返回后没有画布，待执行应用 rAF 为 0；全程 rAF 待执行请求 ≤1。结束后：所有旧画布均断开，扩展可用时上下文全部丢失；监听、观察器与查询的登记等于撤销；控制台和 Chrome `Log` 中没有 “Too many active WebGL contexts” 或 WebGL 错误。另做 20 次“主菜单 ↔ 导入占位”往返，无画布、rAF 请求或会话监听。至少补一次重复入口激活和一次“返回后立即再次进入”，仍遵守先释放后创建；提前返回的确定性接线由 AC-15 覆盖 | 单次浏览器工具调用内完成循环，把画布引用保存在页面作用域；以文字记录计数。测试窗口不主动执行 context-lost/restore，既有相关警告仍按 P1-07 的交接记录留给 P1-10，不宣称该路径零警告 |
| AC-07 | 分别用鼠标和键盘激活 `Import original game data`：显示导入占位且焦点在标题；说明本构建未实现导入、不会读取/存储/上传用户原版文件、以后版本在浏览器本地处理用户自有数据。不声称当前支持任何格式，也不把镜像限定为长期唯一来源。唯一可交互控件为 `Return to menu`，无文件输入、画布、rAF 请求或会话监听。返回后焦点在 Import 入口。生产预览的全新 profile 中，在启动请求完成后记录 3 次导入往返，没有由页面转换触发的新请求；localStorage/sessionStorage 均为空、`indexedDB.databases()` 与 `caches.keys()` 为空数组、cookie 为空 | Chrome：DOM、CDP Network、测试侧存储读回。开始网络断言前让正常应用代码/静态资源及 favicon 请求完成；开发 HMR/WebSocket 不计为导入请求，故这项在生产预览验证。应用本身不得读写这些存储 |
| AC-08 | 演示入口与原版资源隔离：页面流转、页面组件和 App 不导入 `original-data`、`content` 或 `workers`，也不使用 `indexedDB`、`localStorage`、`sessionStorage`、`caches`、`FileReader`、`showOpenFilePicker`、`showDirectoryPicker`、`Worker`、`fetch` 或 `<input type="file">`。演示 owner 只用 `SYNTHETIC_DEMO_OPTIONS` 创建，没有任何参数能把内容、导入或存档传入演示 | 生产源码检索（忽略注释）并列出命中结果；代码审阅 owner 与演示画面的调用点 |
| AC-09 | 清理失败记录：(a) 无清理失败的 Core faulted、渲染 failed/unavailable 保持 null；(b) restart/故障收尾时资源清理抛错或取消帧失败后保留清理原因，即使后续操作覆盖 store 的错误也不丢失；(c) `dispose()` 失败留下记录且照常抛出，全部独立清理仍尝试；(d) 初始化失败但回滚成功不锁存，回滚也失败则锁存；(e) 记录在 dispose 后仍可读，后续错误不覆盖首因但仍报告。补充渲染端口 connect 失败且 disconnect/dispose 失败、浏览器表面转交前回滚失败、运行消费者接线回滚失败的装配接收路径：任何一条都不能只降级 unavailable 后继续创建会话或新 owner。一个业务异常本身为 AggregateError、但回滚成功时不得误锁存 | Node：真实 Session 与生产装配接线，复用 ControlledHost、RecordingSurface 和已有 Vitest 注入；浏览器表面失败信号的实际产生点另经代码审阅。不得按错误消息或异常类猜测是否释放失败 |
| AC-10 | 失败呈现与恢复入口：failed 的 alert 保留原始原因，说明会话不受影响，可返回菜单重新启动“尝试恢复”，会丢弃本次合成状态；unavailable 同样说明会话不受影响。初始化失败、faulted、清理失败时 Return 仍可用；无清理失败的 faulted 返回后不锁存；锁存时 alert 保留原因并提示刷新，Start 原生禁用且附原因，导入仍可用；演示返回焦点在 Main menu 标题，导入返回焦点在 Import 入口。即使 owner 不存在或面板卸载，原因仍可见。浏览器禁用 WebGL 后进入：unavailable、running、Add accepted；返回不锁存，再进入仍 unavailable，无未捕获异常 | 浏览器：先确认 WebGL 2 确实不可用，沿用 P1-07 禁用参数组合；预期 Three.js 上下文创建错误单独记录，不能算成功场景的意外错误。failed/faulted/初始化失败/锁存的 React 文案与焦点接线以 AC-02/09/15 的 Node 测试加代码审阅为证，不伪造浏览器复现 |
| AC-11 | 键盘测试第一轮：新加载页面按 Tab 到 Start，再 Tab 到 Import，确认顺序。第二轮重新加载：Tab 到 Start，Enter 进入演示且焦点在标题；Tab 到 Return，Space 返回且焦点在 Start；Tab 到 Import，Enter 进入占位且焦点在标题；Tab 到 Return，Enter 返回且焦点在 Import。按钮的键盘焦点指示可见（outline 的样式非 none、宽度 >0，或可见的等效 box-shadow）。应用在 window/document 上注册的 keydown/keyup/keypress 监听为 0。在三种画面分别按 Escape、`p`、Alt：应用画面不变，演示 phase/run 不变且 tick 正常推进 | Chrome 键盘与 activeElement 检查；探针按 AC-01 归属计数，不把 React 根节点正常事件委托算成全局游戏监听。输入负向检查聚焦画面标题/中性位置，避免按钮原生激活干扰；仅证明应用未处理，不声称拦截浏览器/OS 快捷键 |
| AC-12 | 开发模式下：StrictMode 首次进入符合 AC-03。保留应用外壳，在演示中做 ≥5 次会重跑 owner effect 的可还原 Fast Refresh 编辑，每次稳定后恰好 1 个画布、会话 running/run 1、tick 递增；旧画布断开且扩展可用时上下文丢失，rAF 待执行请求 ≤1，生命周期监听净登记 3。若编辑仅重置画面为菜单，先验证完整释放，再显式进入演示；不能把“已回到菜单、没有画布”代替替换 owner 的启动证据。另在同一 owner/画布上触发普通页面重渲染，包括面板 Exit 后：不得重复 start，Exit 后仍 idle；重复启动通知的确定性测试见 AC-15，不要求为了验证新增消费 effect。菜单上 ≥3 次编辑不创建 owner。无上下文超限或意外错误，编辑结束后还原，无残留。清理失败下的替换阻断由 AC-09/15 验证 | 执行回合用旧/新画布身份、DOM 状态及错误反馈确认编辑确实重跑预期 effect；browser-testing 不改源码。普通 JSX/注释变更不一定重跑 effect，不能只按编辑次数算通过；整页重载不代替 Fast Refresh 证据 |
| AC-13 | 视口为 1280×800 和 360×640（DPR 1）时，主菜单、导入占位和演示画面都没有横向溢出（`document.documentElement.scrollWidth ≤ clientWidth`）；每个按钮完整位于视口宽度内，文字不被裁切（按钮的 `scrollWidth ≤ clientWidth`）；入口说明可见 | Chrome，CDP `Emulation.setDeviceMetricsOverride` 加 DOM 测量 |
| AC-14 | 新增的 `.test.ts` 进入现有 Vitest 发现范围，DOM-free 的页面流转模块与 owner 改动由这些测试传递导入；目标测试与 `pnpm check` 通过（块体积警告只记录，不算失败）。没有新依赖，没有 Playwright、jsdom、React Testing Library、路由库、二进制资源或原版内容。工程约定与源码结构指南已同步页面流转、owner 清理失败事实、目录与验证方式；阶段索引链接正确 | 目标 Vitest、完整工程检查、package/锁文件差异、文档检索 |
| AC-15 | 实际供 React 使用的装配接线满足：同 owner 重复启动通知只派发一次，首次 start 抛错/失败后不自动重试；Exit 后重复通知仍 idle；初始隐藏时只派发一次 start，phase 为 paused/hidden 且无帧请求，转 visible 后仍 paused，显式 Resume 才调度。已释放/替换/初始化失败的 owner 不收到 start，React 不发布失效 owner。进入意图在 owner 创建前被撤销时不创建；创建后立即返回时完整释放；正常替换时先完成旧清理再创建新 owner；清理失败/既有锁存时工厂调用数不再增加，覆盖 StrictMode 式 setup→cleanup→setup、容器替换与 HMR 式重建；失败信号在后续启动机会之前交付，reportError 即使抛错也不丢失阻断；重复返回只清理一次。渲染 failed 或普通 faulted（均无清理失败）成功返回后，再进入创建新 owner/run 1，旧回调无影响 | Node：对生产 DOM-free 接线进行调用计数/顺序和真实 Core/Session 测试，不另建逻辑替身；React effect 参数、当前身份与清理结果的接入点经代码审阅，并由 AC-03/06/12 的真实浏览器证据交叉验证。隐藏场景为 ControlledHost 契约证据，不宣称取得真实浏览器 hidden 观察 |

## 验证策略

- **单元/契约测试：**
  - 页面流转的转换表与冻结性：`src/app/flow/` 的邻接测试（计划新增）。
  - owner 清理失败记录、渲染/表面初始化回滚信号，以及 AC-15 的生产装配接线：扩展 [synthetic-demo-owner.test.ts](../../../engineering/source-structure.md#r5-演示所有者与槽位) 并在实际装配模块邻接测试，复用 [ControlledHost](../../../engineering/source-structure.md#r4-合成会话)、[RecordingSurface](../../../../src/render/scene/render-surface.test-support.ts) 与已有的故障注入；不向生产页面增加测试后门。
  - 已有的 P1-06/07 测试保持通过。
- **Replay/一致性：** 不适用。页面流转不进入 Core，也不改变 tick、命令或 RNG；演示中 Core 的行为与 replay 契约沿用 P1-03/06/07 已有的测试，本任务不改变它们。
- **浏览器验证：**
  - 环境：自有的 `pnpm dev`，以及 `pnpm build` 之后的 `vite preview`；本机 Chrome 使用隔离的临时 profile，通过 `connectOverCDP` 驱动，用 init script 探针计数 rAF、生命周期监听、观察器、媒体查询、键盘监听与画布。
  - 数据：只使用种子 0 的合成演示，不读写用户存储；截图只在页面内解码，以文字记录采样结果，不入库。
  - WebGL 不可用的场景，另起一个同样隔离、带禁用参数的 Chrome。
  - HMR 证据需要执行回合做临时编辑并还原。
  - 诊断值是按需快照，读数前主动刷新；rAF/监听计数覆盖全部执行窗口而非只看循环结束值。持续前台运行，测试工具自身的轮询与 React 根节点事件委托不计为应用游戏监听。
  - 失败路径区分应用未捕获异常、主动 reportError、Three.js 预期上下文创建错误与既有 context-restore 后清理警告；不以“一律无错误”掩盖应当存在的失败反馈。稀有失败的 React 文案/焦点接线只记录为审阅证据，不能写成浏览器 passed。
  - 结束后只关闭自建的浏览器和服务器，并按 [browser-testing](../../../../.agents/skills/browser-testing/SKILL.md) 清理。
- **实机/原版对照：** 不适用。本任务不声称原版界面保真，也不验证系统快捷键拦截；Firefox、WebKit 与真实设备矩阵属于 P1-10/P5。
- **工程检查：** 迭代时运行目标 Vitest；完成前运行 `pnpm check`。不新增 lint 规则；AC-08 的隔离要求以源码检索为证。

## 风险与恢复

风险等级：中。本任务改变应用入口和会话创建/释放的触发方式，每次演示往返都会创建并释放一个 WebGL 上下文；不改变 Core、Runtime、Session 的玩法/调度契约及渲染状态机，只允许清理结果信号的窄扩展，不涉及持久化。

- **往返泄漏 GPU 上下文或监听：** 多次往返可能积累资源或留下第二条帧循环。缓解：AC-05/06 逐次检查旧画布、上下文、rAF 和登记/撤销；20 次沿用 P1-07 的重复生命周期验证规模，不假定所有 Chrome/GPU 有统一的上下文上限。
- **焦点在画面切换中丢失：** 键盘用户找不到当前位置。缓解：技术决定 8 与 AC-03/05/07/10/11。
- **占位被误解为可用的导入：** 缓解：没有文件控件，文字明确说明未实现；AC-07/08 检查网络与存储均无变化。
- **错误被误分类或丢失：** unavailable/faulted 或 AggregateError 本身不代表清理失败；旧面板卸载也不能丢掉回滚/释放原因。缓解：结构化结果与首因锁存；AC-09/10 覆盖创建前、运行中、释放后，所有后续独立错误仍显式报告。
- **effect 重复或清理后继续重建：** 可能自动撤销 Exit，或在失败资源旁创建新 owner。缓解：按当前 owner 一次性启动、先清理后创建，所有替换入口服从锁存；AC-12/15 验证，不以 StrictMode/HMR 作为绕过失败的理由。
- **双击带来意外的连续转换：** 第二次点击可能落在新画面的控件上。缓解：不加防抖，但保证任意时刻至多一个 owner、每次离开都完整释放（AC-06 与行为表）。
- **与 P1-09 的衔接：** 本任务不注册任何键盘监听，P1-09 在演示画面的会话生命周期内接入，避免菜单拦截游戏键。
- **恢复：** 改动涉及应用外壳、页面组件、页面流转、装配生命周期与必要的清理结果信号；可以按提交回退到 P1-07 的单页面形态，没有存档/缓存迁移。运行期只有全部清理成功才可重建；有失败时需整页重载。修订本契约须重新审阅与批准。

## 未决事项

无。用户于 2026-10-02 再次授权需要提问时采用推荐答案。本轮据此统一清理失败阻断（含初始化、StrictMode/HMR）、保留原始原因、补齐一次性启动/提前返回的装配测试，并修正诊断快照、焦点、导入来源与浏览器取证要求；这些选择不等于对完整 Spec 的批准。

## 审批

**2026-10-02 用户批准完整 Spec。** 用户调用 generate-goal 并明确写明“approve the spec and generate goal”，批准当前审阅版本的 S-01 至 S-08、AC-01 至 AC-15 与技术决定 1–12（含审阅修订）。status 为 accepted，仅表示契约获批，不表示实现完成，也不批准尚未生成的 goal 或授权执行/提交。
