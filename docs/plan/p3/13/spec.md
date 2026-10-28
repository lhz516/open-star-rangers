---
type: plan
status: accepted
phase: P3
task: "13"
updated: 2026-10-28
related: [ADR-0004, ADR-0006, ADR-0009, ADR-0015, ADR-0019, B-001, B-004, B-005, B-006, B-010, U-004, U-018, U-021, U-025, U-029, U-030]
reviewed: sha256:01604a904e9d
---

# P3-13：Classic 驾驶舱、HUD/MFD 与地图画面 — Spec

## 问题与目标

P3-09 至 P3-12 已经把驾驶舱与地图所需的规则状态放进 Core 的 projection，飞行渲染器也已接入，但玩家在任务中看不到这些状态：

- **飞行画面只有世界视口。** P3-12 只绘制逻辑行 0–315，驾驶舱槽是空的，行 316–479 为黑；任务画面显示“飞行渲染已接入，驾驶舱/HUD 待 P3-13”的在制标注（[slice-gaps](../../../engineering/slice-gaps.md#在制标注非-g-项)、[render 模块说明的交接](../../../engineering/modules/render.md#交接)）。
- **读数没有消费者。** 雷达接触点、目标信息、资源与满刻度、子系统状态、左显示屏页面、Warp 页与指示灯（`flight.combat`），通讯菜单、来电、基地与威胁警告（`communications`），以及地图的几何、光标、接触点与覆盖、放大窗口、信息行、标签、连线与代价读数（`map`），都已由 Core 给出，但还没有画到屏幕上。
- **一次性提示没有显示位置。** 完成与信标消息（`flight-message`）、速度辅助的开关与匹配、通讯的入队与清空等事件，都要经消息行或驾驶舱提示显示（[P3-11 的接口](../11/spec.md#与其他任务的接口)）。
- **生产中的地图无法使用。** 地图输入几何的端口仍返回 null，P3-05 的地图输入一直停在 `not-ready`；地图画面本身不存在（[P3-05 战略地图输入](../05/spec.md#战略地图输入)、[P3-09 地图 projection](../09/spec.md#地图-projection)）。
- **L-08 的可视闭环没有完成。** P3-10 明确在通讯菜单与 G-03 文字实际画出之前，不宣称基地交互的可视闭环（[P3-10 与其他任务的接口](../10/spec.md#与其他任务的接口)）。

完成后可观察到：

- 用本地导入的原版内容进入飞行，F1 前视画面在世界视口下方显示 CCKD 10103 slot 0 的驾驶舱框架，各仪表（四个角落仪表、雷达、左显示屏、右侧目标显示屏、消息行、指示条与 Warp 指示灯）按原版的绘制规则随 Core 状态更新。世界视口中的 F1 叠加（目标框、读数与提示文字）按原版规则绘制。
- 左显示屏按 Core 的页面序号显示状态页（含 DIAG 文字逐字打出与光标）、能量页、通讯菜单页、来电页与 Warp 页；子系统受损时按原版出现 SNIP 干扰。来电页的头像与动画是明确标注的 G-03 占位，规则信息以项目摘要文字显示。
- Warp 中保留驾驶舱，左显示屏为 Warp 页，不绘制 F1 叠加；被毁视角显示 TABL 10399 第 8 项的视角标签与消息行。
- 打开地图（`m`）时显示原版 640×480 整屏地图：组调色板、框架与侧边按钮（只绘制）、单位标记、放大窗口图标与选中方框、覆盖圆盘与敌方圆环（迷雾即未被覆盖的黑色背景）、标签与连线、信息小窗、代价文字与原版指针外观；地图输入在生产构建中可用。
- 屏幕闪光同样作用于驾驶舱、HUD 与地图像素。画面整体 4:3 等比缩放，窗口大小不改变任何逻辑位置或可见内容（[总计划 §7.1](../../master-plan.md#71-classic先保真)、[ADR-0009](../../../decisions/ADR-0009-window-scaling-widescreen.md)）。
- 画面只读 projection、Render State、领域事件与导入内容，不改变玩法状态，也不消耗 Core 的随机序列。原版文字来自导入内容与名称引用，G-03/G-05 等项目文案单独标注，不硬编码原版文字。
- 原版绘制规则写入 `docs/original/` 并标注置信度；[表现对照目录](../01/spec.md#表现对照目录)的 V-04、V-05 逐元素给出判定。原版证据以静态分析、已有的本地截图与参考视频为主，计划不新增 DOSBox-X 运行（[证据途径](#原版证据途径与-dosbox-x-的使用)）。

阶段范围依据[总计划 §12](../../master-plan.md#12-开发阶段与验收条件)，任务导航见[阶段索引](../tasks.md#p3-13-classic-驾驶舱hudmfd-与地图画面)。

本任务支持 P3 的以下退出条件与覆盖行（[阶段验收覆盖](../tasks.md#6-阶段验收覆盖)）：

- “使用原版内容走通闭环”：[P3-01 闭环步骤](../01/spec.md#闭环步骤)中 L-03 飞行、L-04 选目标、L-06 战略地图、L-07 Warp、L-08 基地交互的驾驶舱与地图画面，以及 L-09 中被毁视角的标签与消息行；
- “不以演示动画冒充 Warp 操作”：Warp 页与指示灯只消费 Core 的 Warp 状态；
- 覆盖行“Classic 驾驶舱与 HUD/MFD 的动态呈现”“战略地图、战争迷雾与 Warp”（地图画面截图对照）与“基地交互：通讯、停靠与补给”（菜单绘制）。

依赖 P3-09、P3-10、P3-11、P3-12，四项都已完成并合入 main；起草所依据的 checkout 为 `004278af`。P3-14（飞行音效触发）在分支 `p3-14-flight-sound-spec` 上执行中，它计划在 `render/cockpit/` 交付与本任务共享的 HUD 提示表现读模型，其 D-02（P3-14/07）正等待本 spec 定义驾驶舱一侧的接口（见[与 P3-14 的关系](#与-p3-14-的关系)）。生成、审阅或批准本 spec 都不会自动启动实现。

本任务沿用 [P3-01 的切片配置](../01/spec.md#切片配置)（战役 group 0 / slot 1、原始难度 19、僚机可选）与 Classic 的 HI（640×480）基准。

## 范围

### 包含

- **S-01 共享契约与内容修订（D-01）：** 按 [P3-02 扩展规则](../02/spec.md#扩展规则)、P3-04 的帧后输出与 P3-03 的内容版本规则，定稿后再实现[共享契约修订](#共享契约修订d-01)。包括保留 Runtime 已提取的逐 tick projection，以及仪表调度内容、Core 已有状态显示闪烁相位、地图标签威胁时间戳、仪表满刻度与目标显示所需事实的完整性核对。研究证明可由已有输入推导的候选附证据撤销，不用帧末值倒填历史 tick。
- **S-02 驾驶舱表现模型：** `render/cockpit/` 中 DOM-free、GPU-free 的每运行表现模型，按 tick 推进原版在帧中维护的显示状态：仪表重绘节奏与按视角的可见保留（D-01 修订，DC-05）、闪烁相位、DIAG 打字、消息行队列、SNIP 切换、雷达噪点与重建、角落仪表的受损读数、F1 叠加的刷新与跳过、地图的距离标签开关，以及独立的驾驶舱表现随机源（[驾驶舱表现模型与时间](#驾驶舱表现模型与时间)）。
- **S-03 Classic 二维绘制与文字：** 以 640×480 逻辑像素、调色板索引语义实现原版的不透明与颜色键复制、行序、线段/矩形/圆/圆盘、位图字体（步进、高度、大写标志、不裁剪）与 HUD 文字的格式化；按视角选择 DATA 或地图组调色板（[二维绘制语义与调色板](#二维绘制语义与调色板)、[文字与格式化](#文字与格式化)）。
- **S-04 前视驾驶舱框架与仪表调度：** CCKD 10103 slot 0 的元素与 10 条仪表记录，按记录次序、重绘间隔与强制条件调度类型 0–3、5–9、12 的处理例程；视角 0xC（F1）与 1（Warp）共用布局 0（[前视驾驶舱与仪表](#前视驾驶舱与仪表)）。
- **S-05 角落仪表与雷达：** 类型 0–3 的速度、指令速度、能量与护盾仪表（D16 的满刻度、子系统受损时的读数），类型 5 的雷达（投影、形状、颜色、闪烁、容量、重建节奏与子系统 12 的噪点）。
- **S-06 左显示屏：** 类型 6 按 Core 的页面序号绘制页 0（MFDD 背景与子系统叠加图、DIAG 两行文字、打字与光标）、页 1（能量页与三条带）、页 2–4（通讯菜单）、页 5（来电页，G-03 占位）、页 6（Warp 页的三条读数、标签与轨迹），以及按页面子系统状态的 SNIP 干扰（[左显示屏](#左显示屏)）。
- **S-07 右侧目标显示屏：** 类型 7 的目标模型视口（TEX 11089 背景与该场景自己的灯光）、名称与读数文字、无目标与 Warp 离开提示、地图标记分支与子系统 14 的干扰（[右侧目标显示屏](#右侧目标显示屏)）。
- **S-08 消息行、指示条与 Warp 灯：** 类型 8 的消息行队列与滚动（所有绘制驾驶舱的布局，含地图与被毁视角），类型 9 的两个威胁指示灯（闪烁用绘制例程自己的时钟，只与 P3-14 共享 Core 采样的两项警告标志；D-01 修订），类型 12 的 Warp 就绪灯（[消息行、指示条与 Warp 灯](#消息行指示条与-warp-灯)）。
- **S-09 F1 叠加与被毁视角标签：** `0x45de0` 在视角 0xC 中绘制的目标框、读数、速度辅助与锁定提示文字，按子系统 9 的状态跳过；Warp 中不绘制；视角 0x11 子模式 8 的视角标签（TABL 10399 第 8 项）与标签框（[F1 叠加与被毁视角标签](#f1-叠加与被毁视角标签)）。
- **S-10 战略地图画面：** 视角 8 中按 CCKD 10103 slot 2 的组调色板与框架，按 `0x49f8c` 的次序绘制主地图、覆盖圆盘与敌方圆环、单位标记、标签与连线、目的地标记与代价文字、信息小窗、放大窗口图标（错开与选中方框）、距离标签、面板外框、原版指针外观与消息行；侧边按钮只绘制、不交互（[战略地图画面](#战略地图画面)）。
- **S-11 地图输入几何与指针：** 以同一 `data/hud/map-geometry` payload 与当前视口提供 P3-05 的生产 `MapInputGeometry`，使生产地图输入就绪；原版指针外观取代生产中的项目十字光标；右键的距离标签开关作为呈现状态接线，并同步 P3-05 的绑定表（[地图输入几何与指针](#地图输入几何与指针)）。
- **S-12 接线、生命周期与标注：** 驾驶舱层经 `FlightRunRender.addLayer` 接入同一画面与 WebGL 上下文；地图同管线方案以 ADR 获批为前提。GPU 计划并入运行计划，资源随运行释放；G-03 文案经应用装配取得，基地页补齐当前通讯摘要与消息行的项目呈现；只移除已完成部分的在制标注（[接线与生命周期](#接线与生命周期)、[缺省与标注](#缺省与标注)）。
- **S-13 原版研究与表现对照：** 完成[原版研究](#原版研究)的 Q-01 至 Q-13，按[表现对照与判定](#表现对照与判定)给出 V-04、V-05 的逐元素判定，更新 U-029、U-030 与相关原版文档。
- **S-14 文档与交接：** 同步 render、app、ui、core 模块说明，源码结构指南，键盘输入指南，slice-gaps 与本地导入指南，并向 P3-14 与 P3-15 交接。

### 不包含

- **其他视角与布局：** F2–F10 与光标/小键盘视角（G-08，P4）、布局 1–5 的驾驶舱、F2 的类型 4 仪表、LO 画面与 4×6 字库（HI 中从不绘制，见 [hud §1.1](../../../original/formats/hud.md#11-glyph-layout-and-character-maps-likely)）。被毁视角只做标签与消息行，相机归 P3-12。
- **基地内部（视角 6）：** CCKD 10097、HUD 组 `0x175eb4`（MFDD 10475、BITM 10469、TABL 10481）与 TABL 10165 的基地画面归 P4（U-029、U-030）；P3 中视角 6 维持 G-05 的 React 项目页面（[技术决定](#技术决定) 9）。
- **通讯媒体：** 头像、通讯动画、语音与原版 CMOV 台词（G-03，P4）；本任务在来电页、消息行及基地项目页用明确标注的项目摘要承接信息，不扩充媒体解码。
- **音效：** 播放、选择与生命周期归 P3-14；本任务与 P3-14 只共用同 tick projection 输入（[D-02 定稿](#d-02-定稿09)），不调用音频平台。
- **玩法规则：** 不改变任何规则判定、RNG 抽取或系统次序。Core 只允许 D-01 定稿的只读事实；雷达的真实接触点、地图的可见接触点与覆盖、通讯菜单状态与页面切换仍由各自的规则任务负责。
- **世界画面：** 相机、三维世界、效果与屏幕闪光的规则归 P3-12；本任务只经其合成层接口接入，不改变已交付层的行为。
- **React 页面重做：** 不重做主菜单、开始配置、基地页面（G-05）、结果页、终局占位（G-06、G-02）或任务菜单；基地页接收同一消息呈现结果与补齐 G-03 反馈属于 S-12，不复刻基地原版美术。
- **显示选项与发布：** 宽屏、“原版像素”模式、减少闪烁等可访问性设置（P5/P6），屏幕闪光开关，发布级性能与设备矩阵（P5），Enhanced 外观（P6）。
- **不可达或作弊路径：** 自动驾驶开启时的文字（G-09，Core 不会置位；`0x45420` 复位引起的“关”提示照原版绘制，D-01 修订，DC-10）、F11 灵敏度消息（G-10，已拦截）、作弊行、波次模式与调试帧率文字（`0x3f474`）。

### 涉及模块

| 模块 | 责任与影响 |
|---|---|
| `src/render/cockpit/`（计划新增） | 纯表现模型与像素算法保持 DOM-free/GPU-free；Three.js 合成层单独适配，只消费模型与 `render/flight` 接口。核心纯模块依赖 core 的只读类型及 content，应用在外部装配，不从本目录反向导入 ui/React（[ADR-0015](../../../decisions/ADR-0015-source-module-structure.md)） |
| [src/render/flight/](../../../../src/render/flight/) | 只读复用合成层接口（`FlightLayer`、`CompositionFrame`、`LOGICAL_WIDTH`/`LOGICAL_HEIGHT`、`logicalTransform`）、运行 GPU 缓存与预算、光照模型规则（右显示屏的目标模型）。需要新的合成能力时增量扩展，已交付各层的行为与测试不变 |
| [src/render/map/](../../../../src/render/map/) | 复用 `MapInputGeometry`、`checkMapInputGeometry` 与换算函数；生产几何由本任务提供。项目十字光标退出生产，只保留给隔离测试入口 |
| [src/core/projections/](../../../../src/core/projections/) 等 | 只在 D-01 定稿后增补只读事实（例如 `MapLabel` 的威胁时间戳），同步类型、校验、快照与版本；不改变规则 |
| [src/content/](../../../../src/content/)、[src/original-data/conversion/](../../../../src/original-data/conversion/) | 若 D-01 确认需要，新增仪表记录（及布局元素的绘制遍与重绘标志）的 payload 与转换，递增切片定义与 `ConverterVersion`；其余 HUD 内容只读复用 |
| [src/app/runtime/](../../../../src/app/runtime/)、[src/app/session/](../../../../src/app/session/) | D-01 为帧后 `TickOutput` 保留同 tick 已冻结的 projection 引用，不新增 Core 回调、第二条循环或无界历史 |
| [src/app/mission/](../../../../src/app/mission/)、[src/app/composition/](../../../../src/app/composition/) | 同一运行接线登记表现模型与绘制层；解码 HUD 内容；注入 G-03 文案与几何提供者；按 D-02 分别登记驾驶舱表现与音效消费者，二者无次序依赖 |
| [src/ui/mission/](../../../../src/ui/mission/)、[src/ui/game-input/](../../../../src/ui/game-input/) | 移除在制标注；右键的地图呈现通道；G-03 文案保持集中在 `slice-gaps-copy.ts`，经应用装配传入 |
| [e2e/](../../../../e2e/) | 驾驶舱、HUD 与地图的浏览器回归，扩展 `e2e/support/flight-pictures.ts` 的逻辑像素读取；生产地图输入就绪的回归 |
| [hud](../../../original/formats/hud.md)、[cockpit](../../../original/formats/cockpit.md)、[executable](../../../original/formats/executable.md)、[comm](../../../original/formats/comm.md)、[B-001](../../../original/behavior/B-001-strategic-map.md)、[unknowns](../../../original/unknowns.md) | Q-01 至 Q-13 的结论；U-029、U-030 的状态 |
| [render](../../../engineering/modules/render.md)、[app](../../../engineering/modules/app.md)、[ui](../../../engineering/modules/ui.md)、[core](../../../engineering/modules/core.md) 模块说明，[源码结构指南](../../../engineering/source-structure.md)，[键盘输入指南](../../../engineering/keyboard-input.md)，[slice-gaps](../../../engineering/slice-gaps.md)，[本地导入指南](../../../guides/local-import.md) | API、目录、接线、绑定表、标注与交接 |
| `local/research/p3-13/`（git 忽略） | 研究脚本、截图元素匹配输出与本项目真实内容画面 |

## 当前实现与依据

### 已有实现

- **合成层接口（P3-12）：** [flight-layers.ts](../../../../src/render/flight/composition/flight-layers.ts) 的 `FLIGHT_LAYER_SLOTS` 以 `cockpit` 为最后一槽，`LAYER_ORDER` 在 F1、Warp 与被毁视角中最后调用它，在 6、8、0x13（`no-world`）中只调用它。层的形状为 `FlightLayer { slot, passes(frame) }`，每帧返回 `LayerPass { scene, camera, target?, clearColor?, clearDepth?, scissor? }`。`CompositionFrame` 给出逻辑变换、`viewMode`、`subMode`、`view`、两份 Render State 与 alpha、最新 projection、世界视图、逻辑相机与深度。各层画入一张从黑色开始的游戏图像，屏幕阶段（屏幕闪光）再把整幅图像画到画布，所以驾驶舱层同样受闪光变换（[render 画面合成](../../../engineering/modules/render.md#画面合成)）。
- **接入点：** [flight-run.ts](../../../../src/render/flight/renderer/flight-run.ts) 的 `wireFlightRun` 返回 `{ presentation, effects, render }`；`render` 提供 `addLayer` 与 `resources`，[flight-consumer.ts](../../../../src/app/mission/flight-consumer.ts) 的 `attachRun` 目前不保留此返回值。`addGpuPlans` 是 [flight-gpu-cache.ts](../../../../src/render/flight/renderer/flight-gpu-cache.ts) 的 helper，不是运行句柄成员。帧消费者逐 tick 推进后绘制一次，静止帧只重画。
- **逐 tick 读模型缺口：** [game-runtime.ts](../../../../src/app/runtime/game-runtime.ts) 的 `#tick` 已在每次成功 step 后取得冻结的 `projection` 与 `render`，但 `TickOutput` 仅保留后者和事件；前者只存入最新值。D-01 要保留这些既有 projection 引用，不必再次提取或复制整个世界。
- **逻辑画面：** [logical-screen.ts](../../../../src/render/flight/composition/logical-screen.ts) 的 640×480、左上原点、单一缩放比；世界视口在 0xC、1、6 为 (0, 0)–(639, 315)，在 8、0x11、0x13 为 (0, 0)–(639, 479)。
- **Projection：** [projection.ts](../../../../src/core/projections/projection.ts) 的 `Projection` 为 `{ clock, mission, player, flight, map, communications, result }`。
  - `flight.combat.player`（[combat.ts](../../../../src/core/projections/combat.ts)）：`target`（名称引用、种类、位姿、距离、速度、护盾）、`radar { status, contacts }`（`RadarContact` 的 `offset` 为相对玩家的位置，注释写明屏幕投影归 P3-13）、`resources` 与满刻度、`allocation`、两张武器列表、`lock { level, losing, progress }`、19 个 `subsystems`、`leftPage`（0–6）与 `warp { indicator, page }`。
  - `flight.motion`：速度、指令速度、最高速度、限速状态与速度辅助。
  - `communications.player`：`page`、`menu`（表引用、层级、选项与键）、`incoming`（消息身份、说话者快照、帧）、`docking`、`base` 与 `warnings { attackerOnTail, missileIncoming }`。
  - `map`：`MapReady` 的 `MapOpen` 给出几何、光标、接触点与覆盖、放大窗口成员（未错开的像素与 `boxed`）、信息行、标签、连线、目的地与代价读数、`warpRequest`（[map.ts](../../../../src/core/projections/map.ts)）。`MapLabel` 尚无威胁闪烁所需的状态。
  - 消息行没有现成的呈现 projection：完成与信标来自 `flight-message`；通讯真正开始来自 `incoming-started`，不能以 `radio-queued` 或 `radio-taken` 提前显示；`radio-flushed` 提供清空事实。速度辅助事件区分开关消息与匹配闪烁。
- **Render State：** [render-state.ts](../../../../src/core/projections/render-state.ts) 给出 `viewMode`、`subMode`、观察与跟随实体、实体位姿与表现、`warp`、`activeAreaCentre` 与 `speedShare`。
- **内容：** 切片定义版本 6 的 `cockpit-hud-map` 组（[slice-definition.ts](../../../../src/content/slice-definition.ts)）。
  - 布局：`layout/cockpit/front`（10103 slot 0）与 `layout/map/frame`（slot 2），元素为 `image/cockpit/front/element-*` 与 `image/map/frame/element-*`；[layout-payload.ts](../../../../src/content/graphics/layout-payload.ts) 的 `LayoutElement` 只有图像与左上角坐标，没有绘制遍（+44）、重绘标志（+48）或仪表记录。
  - 图像：`image/hud/status-display/background-*`、`overlay-*`（MFDD 10473）、`image/hud/display-page/background`（BITM 10467）、`image/hud/gauge-bar-1/*`（TABL 10479）、`image/hud/display-interference/frame-*`（SNIP 10487）、`image/hud/target-display/background`（TEX 11089）、`image/map/unit-marker/*`（TABL 10461）与 `image/map/zoom-icon/*`（TABL 11401）。
  - 调色板：`palette/flight/cockpit-hud-map`（DATA）与 `palette/map/screen`（slot 2 的组调色板）。字体：`font/hud/8x8-1`、`8x8-2`、`4x6`。
  - 数据：`data/hud/text`（64 个 EXE 文字区域，[hud-text-payload.ts](../../../../src/content/hud/hud-text-payload.ts)）、`data/hud/status-display/messages`（DIAG）、`data/hud/view-labels`、`data/hud/map-geometry`（类型 10 记录的矩形、重绘间隔与行高）、`data/comm-menus`、`data/comm-messages`、`data/flight-messages` 与 `data/craft-info`（种类名）。字形查找有 `glyphFor`/`glyphsFor`，颜色映射有 `expandImage` 与 `nearestColourMap`；`render/` 中没有运行时的文字或索引色 blit。
- **地图输入：** [src/render/map/](../../../../src/render/map/) 有 `MapInputGeometry` 与换算、项目十字光标（`createMapCursorDrawer`）。[use-mission-owner.ts](../../../../src/app/composition/use-mission-owner.ts) 以 `{ read: () => null }` 创建地图几何端口，生产中地图输入因此不就绪。
- **UI：** [FlightView.tsx](../../../../src/ui/mission/FlightView.tsx) 承载画布并显示 `flight-in-progress`；`mission-copy.ts` 的 `FLIGHT_IN_PROGRESS` 与 `MISSION_SKELETON` 写明驾驶舱与 HUD 尚未实现。G-03 摘要在 [slice-gaps-copy.ts](../../../../src/ui/mission/slice-gaps-copy.ts) 的 `MESSAGE_SUMMARIES`/`messageSummary`，目前没有画面显示。G-05 基地页面是过渡的 React 页面。
- **测试设施：** [e2e/support/flight-pictures.ts](../../../../e2e/support/flight-pictures.ts) 读取 640×480 逻辑图像并比较像素（注释写明行 316–479 在 P3-13 之前为黑）；合成导入场景 `mission-startable` 是正式流程的起点。
- **版本（起草时）：** `RULES_VERSION` 9，快照格式 8，replay 格式 3，切片定义 6，生产 `ConverterVersion` 为 `osr-import.graphics-5.logic-4.audio-2.models-4`。
- **不能误认为已经具备的输入：** `CombatPlayer` 没有 `statusDisplay.blink`，`MotionPlayer.maximumSpeed` 是动态最高速度，不是速度仪表的 CINF `atB8` 基准；`CombatTarget` 没有 T7 所读的对象 +0x06 变体选择事实。D-01 须逐一核对来源。[comm-messages.ts](../../../../src/content/rule-data/comm-messages.ts) 只有存在性、帧时长与名称列表，没有 CMOV 台词；[BasePage.tsx](../../../../src/ui/mission/BasePage.tsx) 只有服务项、资源与命令反馈，没有来电/消息行呈现。G-03 已规定以项目摘要代替原版画面、语音和台词。

### 已有的原版依据

下表只作结论索引；完整分支、常量与置信度以链接的原版记录为准。

| 主题 | 已有结论 | 记录 |
|---|---|---|
| 驾驶舱布局 | 元素绘制遍、调色板、仪表类型/次序、+0x18/+0x1C 调度字段已确认；07 更新：仪表记录全部字段、矩形与目录 +0x0C（常重绘标志）已由 Q-01 确认（代码与数据），见[研究结论索引](#研究结论索引07) | [cockpit](../../../original/formats/cockpit.md#instrument-types-per-slot-confirmed-p3-0730)、[元素](../../../original/formats/cockpit.md#element-52-bytes-confirmed)、U-029 |
| 静态区域 | 10103 slot 0 在 46 张合格截图中的 91,220 个静态像素与框架一致（0 差异，排除 10 个仪表矩形）；地图框架在 10 张截图中 0 差异 | [cockpit R5](../../../original/formats/cockpit.md#all-qualifying-captures-p2-12) |
| 每帧的层次 | 各视角调用的例程与次序（FC2）：0xC/0xD/0x11 中 `0x456e4` 擦除、`0x49a6c` 预遍、`0x45de0` 叠加、`0x49b2c` 驾驶舱；Warp 先以 0 填充且不调用 `0x45de0`；地图为 `0x599e8`、`0x583fc`、闪光、`0x49b2c`；原版帧缓冲持续保留（FC3，等价性高概率） | [FC2](../../../original/formats/executable.md#fc2-layers-per-view-mode--confirmed-code)、[FC3](../../../original/formats/executable.md#fc3-a-persistent-frame-buffer--confirmed-code-equivalence-likely)、[WT8](../../../original/formats/executable.md#wt8-what-view-mode-1-draws--confirmed-code-unless-marked) |
| 绘制语义 | 四个 blitter（不透明/颜色键 0、屏幕/离屏），行按存储次序；字体的步进（8 或 6）、高度、大写标志、每格 8 列、不裁剪；4×6 在 HI 中从不绘制 | [hud 绘制路径](../../../original/formats/hud.md#hud-and-map-drawing-paths-confirmed-exe)、[hud §1.1](../../../original/formats/hud.md#11-glyph-layout-and-character-maps-likely) |
| 仪表处理例程 | 类型 0–12 的处理例程、雷达接触点的形状与绘制、能量页与 Warp 页的条带、地图圆环与圆盘、选中方框、信息小窗与标签（已确认，代码并经截图核对） | [未识别元素的来源](../../../original/formats/hud.md#sources-of-the-unidentified-elements-p2-1227) |
| 角落仪表 | 各资源的满刻度与钳位（已确认，代码）；07 更新：颜色阈值、闪烁与形状已记录（Q-03） | [D16](../../../original/formats/executable.md#d16-hud-full-scales--confirmed-code-for-operands-drawing-p3-13) |
| 雷达 | 接触点来源与筛选、容量 120、颜色、闪烁、形状、重建节奏、噪点（已确认，代码）；07 更新：相机平面偏移由每帧的逻辑相机写入（Q-04） | [T6](../../../original/formats/executable.md#t6-radar-confirmed-code-unless-noted) |
| 左显示屏 | 页表 `0x175c7c`、各页处理例程与子系统、切换（已确认，代码）；SNIP 的结构与按状态的绘制；DIAG 的布局、打字与光标 | [T8](../../../original/formats/executable.md#t8-left-display-no-target-reads-confirmed-code)、[D15](../../../original/formats/executable.md#d15-left-display-pages--confirmed-code)、[SNIP](../../../original/formats/hud.md#snip-10487-confirmed-structure-p2-1227)、[DIAG](../../../original/formats/hud.md#diag-10489-confirmed-structure-p2-07-revision) |
| 右显示屏 | 状态写入、读取的字段、标记分支、刷新节奏、文字地址（已确认，代码）；07 更新：TEX 11089 的拉伸与不加明暗已确认（Q-08） | [T7](../../../original/formats/executable.md#t7-right-target-display-confirmed-code)、[TEX 11089](../../../original/formats/textures.md#tex-11089-right-display-background-confirmed) |
| 消息行 | 队列、记录字段、滚动模式、移除与未画出时的过期、完成与信标消息的常量（已确认，代码）；07 更新：`ps +0x28 = 8` 分支已追踪，类型 8 没有重绘节流（Q-09） | [完成与信标消息](../../../original/formats/executable.md#completion-and-beacon-messages-p3-1103)、[RENS 头部与飞行消息](../../../original/formats/executable.md#flight-message-strings-and-the-rens-header-p3-0304) |
| HUD 文字 | 64 个文字区域（39 个格式串、25 个原样）、绘制位置与逐条可达性；07 更新：格式化的运行库语义已确认（Q-12），`0x171c84` 是到达时间而不是距离 | [HUD 文字](../../../original/formats/executable.md#hud-map-and-communications-text-from-the-exe-p3-0324) |
| 视角与叠加 | 视角模式与布局对应、F1 叠加只在 0xC/0xD、Warp 中不绘制、被毁视角（0x11/8）没有驾驶舱元素；07 更新：各视角绘制的元素已记录（Q-10） | [自动视角](../../../original/formats/executable.md#automatic-views-and-cameras-p3-0109)、[TABL 10399](../../../original/formats/hud.md#tabl-10165-selectors-and-tabl-10399-labels-p3-0304) |
| 地图 | 画面布局、内容、迷雾（没有历史探索）、交互、代价文字与颜色带、选中方框、目的地标记、信息小窗（已确认）；投影与轴向（U-032 已确认） | [B-001](../../../original/behavior/B-001-strategic-map.md)、[地图投影](../../../original/formats/executable.md#strategic-map-projection)、[地图鼠标](../../../original/formats/executable.md#map-mouse-input-p3-0503)、[接触点与迷雾](../../../original/formats/executable.md#map-contacts-coverage-and-fog-p3-0903)、[放大窗口与标签](../../../original/formats/executable.md#zoom-window-information-window-and-labels-p3-0904) |
| 通讯面板 | 菜单页的两种文字布局、颜色与闪烁、键的生成、分隔与标题（已确认，代码）；07 更新：布局由显示模式选择，HI 菜单页都用第一种（Q-07） | [comm](../../../original/formats/comm.md)、[B-004](../../../original/behavior/B-004-base-communications.md#通讯菜单与回复p3-10) |
| HUD 音效 | SND 10455/10457 由 `0x45de0` 播放，10409 由类型 9 播放（触发与共享状态由 P3-14 研究） | [按 ID 与 HUD 音效](../../../original/formats/audio.md#sounds-played-by-id-and-hud-sounds-p3-0110) |
| 时基 | 原版帧率与时钟速率依赖 cycles（基准约 30 帧/秒，U-021 未关闭）；Core 以每 tick 2 个时钟单位（32 Hz）模拟一次派发器 pass | [B-006](../../../original/behavior/B-006-simulation-timing.md) |

### 可复用的原版证据

以下证据都在 `local/` 中，按[原版证据获取](../../../guides/original-evidence.md)使用，不需要重新运行原版：

- **本地截图：** `local/StarRang/captures/` 的 132 张原始像素截图（DOSBox-X Capture）。其中 46 张为 P2-12 的合格 F1 画面（07 复核：连同 P2-12/30 补拍的 `123`–`135` 共 59 张静态区域 0 差异，见 [cockpit R5 复核](../../../original/formats/cockpit.md#all-qualifying-captures-p2-12)），10 张为地图画面；`srangers_066` 为 Warp 页，`068` 为 SNIP 干扰，`100` 为能量页，`062`–`065` 为远处通讯菜单，`129`–`135` 为受损画面（[cockpit R5](../../../original/formats/cockpit.md#all-qualifying-captures-p2-12)、[B-004](../../../original/behavior/B-004-base-communications.md#远处通讯已确认)）。
- **研究输出：** P2-12 的 U-030 元素匹配与各元素的调色板索引（`local/research/p2-12/`），CCKD 元素图（`local/research/cckd/`），P3-01、P3-03、P3-07、P3-09、P3-10、P3-11、P3-12 的 Ghidra 项目与报告。
- **参考视频：** 战役第 1–8 关的[参考视频](../../../guides/original-evidence.md#参考视频)及其抽样帧（`local/research/video/`），可用于左显示屏头像与雪花、Warp 等动态画面的线索；只凭视频的结论最高为高概率。

### 与 P3-14 的关系

P3-14 在分支 `p3-14-flight-sound-spec` 的 `5a662042` 上已有已批准 spec 与 FA-01，尚未集成本 checkout；其内容不能当作 main 已实现能力。相关文档路径为该分支的 `docs/plan/p3/14/spec.md` 与 `docs/plan/p3/02/spec.md` 的“P3-14 的契约修订（D-01）”：

- 锁定提示音与 9 型仪表警告音的节奏、门禁与闪烁属于表现层。原计划由 P3-14 在 `render/cockpit/` 提供双方共读的纯表现读模型；D-02 定稿（09）证明双方没有共同状态，改为各自从同 tick projection 读取同一输入（[D-02 定稿](#d-02-定稿09)，D-02 修订）；
- FA-01 把 main 的 `communications.player.warnings` 移到分区级 `communications.warnings`，保留没有玩家时的已采样值；采样、雷达门禁及会影响通讯的副作用仍归 Core，表现层不得重复；
- 其 D-02（P3-14/07）须与 P3-13 的已批准接口对齐。本文是待批准的输入，不自动解除该关卡；D1-11 的声音感知参考取舍不自动豁免本任务的图像对照。

P3-14 拥有声音侧的状态与消费者，P3-13 拥有视觉侧的状态与绘制，应用层拥有装配与调度（[D-02 定稿](#d-02-定稿09)，D-02 修订）；不改 P3-14 文档、不合并分支、不代替其批准。

**D-01 的合并说明与交 P3-14 的信息（08，2026-10-28；不改 P3-14 文档）：**

- **警告标志的位置：** FA-01 不在 main 上。main 的 `projection.ts` 仍为 `communications.player.warnings { attackerOnTail, missileIncoming }`（`attackerOnTail` 在 P3-08 的攻击者条件接入前恒为假），D-01 的消费者现在读这一实际位置；P3-14 合入后改读 FA-01 的分区级 `communications.warnings`，同一次合并中删除旧读取，不保留别名、不双读。
- **同名字段：** P3-02 CK-03 的 `MotionPlayer.recordMaximumSpeed` 与 FA-03 同名同义，合并时只保留一份定义；`RULES_VERSION` 与快照格式按“相对实际集成基线各递增一次”重新核对（CK-05）。
- **共享范围（D-01 修订）：** 共享模型只需提供锁定进度、目标有效性与 Core 已采样的两项警告标志的读取；9 型文字的闪烁（0x15 时钟）、锁定环与锁定文字的相位都属 P3-13 的绘制，锁定音的脉冲不驱动视觉（[hud §4.8](../../../original/formats/hud.md#48-indicator-strip-type-9-and-warp-lamp-type-12)、[07 交 09 的需求](./subtasks/07-evidence-contract-baseline.md#完成证据)）。
- **交 P3-14 的信息：** 07 依 hud §4.8 的绘制规则与 17 张截图中两段指示条的擦除状态推断，两项 9 型警告在所选任务的第一关补拍会话中都出现过（高概率，代码与截图推断）。这与 P3-14 A-07 的“所选任务中不可达（高概率）”及其 D1-11 的前提冲突，需 P3-14 复核；本任务不据 D1-11 豁免类型 9 的对照。

## 行为与边界

| 场景或状态转换 | 预期结果 | 拒绝或失败时的反馈 |
|---|---|---|
| 新运行接线（出发保持中，停在 tick 0、首帧之前） | 以 tick 0 读模型与本运行独立种子创建；首幅逻辑画面可以构造，但不伪造一次 tick 推进 | 内容缺失或违反契约在 GPU 分配之前拒绝开始，`ContentContractError` 或带结构路径的消费者错误，沿用 P3-04 的开始回滚 |
| 每个成功 tick | 表现模型按 tick 升序推进一次：消费该 tick 的领域事件，按任务时钟推进重绘节奏、闪烁、打字、消息行与随机切换 | 不连续、倒退或跨运行的 tick 输出为 `invalid-input`，模型状态不变，消费者故障 |
| 每个显示帧 | 驾驶舱与地图层读模型的当前状态与最新 projection，按当前视角绘制；不调用 `step`，不另建循环 | 不适用 |
| 静止帧（暂停、任务菜单、隐藏、衔接保持） | 只重画，不推进；继续后不补算 | 不适用 |
| 视角 0xC（F1） | 驾驶舱 slot 0 的框架与全部仪表；世界视口中的 F1 叠加（受子系统 9 门禁） | 不适用 |
| 视角 1（Warp） | 同一 slot 0 的驾驶舱，左显示屏为页 6；不绘制 F1 叠加 | 不适用 |
| 视角 8（地图） | 整屏地图（slot 2 组调色板）；不绘制前视驾驶舱 | 地图分区未就绪时不绘制地图内容，生产画面显示明确原因（不出现空地图冒充“没有敌机”） |
| 视角 0x11 子模式 8（被毁视角） | 视角标签与 slot 7 的消息行；没有其他驾驶舱元素 | 不适用 |
| 视角 6（基地） | 不绘制驾驶舱；G-05 的项目页面照常显示 | 不适用 |
| 视角 0x13 及 P3 不可达的视角 | 0x13 不绘制驾驶舱元素（`0x49b2c` 只在视角 1、6、8 与 0xC–0x12 中调用，[cockpit](../../../original/formats/cockpit.md#instrument-types-per-slot-confirmed-p3-0730)）；F2–F10 等沿用 P3-12 的 `unsupported-view` | P3-12 的“不支持视角”错误 |
| 子系统受损（状态 1、2） | 各元素按原版：左右显示屏的 SNIP、角落仪表的随机读数或隐藏、雷达噪点、F1 叠加的跳过、状态显示屏的叠加图 | 不适用 |
| 必需 projection 分区为 `not-implemented`、引用缺失或同 tick 数据矛盾 | 开始前拒绝，运行中使消费者故障；不继续显示上一份数据冒充有效读数 | 生产可见的契约错误，不仅写开发诊断 |
| 分区 ready 且玩家为 null、目标为 null | 玩家未实例化/已拆除与有玩家但无目标分别处理；按当前视角隐藏依赖玩家的仪表，仍保留已授权的消息及 FA-01 警告状态 | null 不等于未实现或数值 0；不存在已确认分支时在 D-01 阻塞，不以静默隐藏补契约 |
| 重试、新运行 | 旧运行的表现模型、消息行、随机流与 GPU 资源全部释放；新运行从初始状态开始 | 释放失败按 P3-04 的清理锁存 |
| 上下文丢失与恢复 | 不提交绘制；恢复后只重建 GPU 映射，从当前表现状态重画，不重放提示或消息 | 沿用 P3-12 的 `context-lost` 提示 |
| WebGL 不可用 | 驾驶舱与地图同样不可见；GPU-free 的表现模型与 P3-14 共享的状态照常推进 | 沿用 P3-12 的 `unavailable`/`failed` 提示，可暂停或退出 |
| 窗口缩放、全屏、像素比变化 | 4:3 等比与黑边；逻辑位置、文字与可见内容不变 | 不适用 |

### 视角与绘制内容

按 FC2 与 [cockpit 的布局表](../../../original/formats/cockpit.md#groups-in-the-hi-set)，本任务在各视角中绘制的内容如下；未列出的视角不绘制驾驶舱元素。

| 视角 | 布局/slot | 本任务绘制 | 不在本任务 |
|---|---|---|---|
| 0xC（F1） | 0 / 0 | 框架元素；仪表类型 0、1、2、3、5、7、8、6、9、12（按记录次序）；`0x45de0` 的 F1 叠加 | 三维世界、星云、精灵、闪光（P3-12） |
| 1（Warp） | 0 / 0 | 同 F1 的框架与仪表，左显示屏为页 6；不调用 `0x45de0` | Warp 隧道与世界（P3-12） |
| 8（地图） | 6 / 2 | 框架（slot 2 的四个元素都是绘制遍 1，画在仪表之后；没有遍 0 元素）；类型 10 的地图与类型 8 的消息行 | 无世界 |
| 0x11/8（被毁视角） | 8 / 7 | 类型 8 的消息行；`0x45de0` 的视角标签 | 相机与世界（P3-12） |
| 6（基地） | 0 / 10097 slot 0 | 无（G-05 项目页面） | CCKD 10097 与 HUD 组 `0x175eb4`（P4） |

### 驾驶舱表现模型与时间

- **一个运行一个实例：** 在新运行接线时以 tick 0 的 Render State、projection 与运行种子创建，经 `run.ownCleanup` 释放；重试与新运行都是新实例。它不进入 Core、快照或 replay。
- **按 tick 推进：** 每个成功 tick 对应一次逻辑显示调度，不等于每个仪表都到期重绘。输入为 D-01 保留的同一 tick 的 `tick`、`clock`、Render State、projection 与有序事件；不同 tick 不能使用同一帧末 projection。没有 tick 的帧只重画；窗口重绘、GPU 恢复和查询都不能打字、计数、入队或抽随机数。
- **只用任务时钟：** 重绘间隔（仪表记录 +0x18、地图几何的重绘间隔）、闪烁周期、打字节奏、消息行滚动与过期、F1 读数的刷新都以任务时钟单位计，按原版的比较（例如 `sample − last > interval`，无符号）实现；不读宿主时间，插值 alpha 也不用于这些状态。
- **可见保留（D-01 修订）：** 原版按视角分四种规则：0xC 只经各复制区更新，1 每帧把缓冲填 0、复制区内未画的像素以 0 送出，8 每帧整幅重画，0x11/8 常重绘、整屏送出（[cockpit](../../../original/formats/cockpit.md#instrument-records-scheduling-and-visible-persistence-p3-1301)）。本项目以 640×480 的后备面与送屏面照原版复制规则复现，包括写进第 316–478 行的叠加标记（DC-05），而不是每帧按最新状态重画所有仪表，也不是每个仪表各保留一幅画面。
- **驾驶舱表现随机源：** 从本运行宿主表现种子以固定、具名规则派生独立流，不通过抽取 Core 或 P3-12 流来获取种子。只在满足原版显示门禁的逻辑调度中抽取，GPU 不可用与未显示的重画不改变抽取；种子派生、调用顺序与重置边界在 D-01/D-02 定稿。同一逐 tick 输入和同一地图呈现刺激序列，分成不同宿主帧仍得到相同状态。与原版共享 RNG 的差别须披露，不能宣称整体随机分布已经证明等价。
- **Core 已有显示事实：** `statusDisplay.blink` 与子系统字段 1、5、8 由 Core 的显示步维护，前者连同写入次数 `rebuilds` 经 D-01 的只读 projection 输出，写入次序按原版更正（D-01 修订，P3-02 CK-01）；不能另做一套相位、从墙钟取模或从某个子系统值反推。仅纯外观的相位/缓存由本模型持有。
- **与 P3-14 共享（D-01 修订）：** 共享的只有锁定进度、目标有效性与 Core 已采样的两项警告标志；9 型文字的闪烁是绘制例程自己的 0x15 时钟，锁定环与锁定文字也各有绘制时钟，都属本任务，不与音效的脉冲共用（[hud §4.8](../../../original/formats/hud.md#48-indicator-strip-type-9-and-warp-lamp-type-12)、[与 P3-14 的关系](#与-p3-14-的关系)）。
- **只读：** 模型与各层不提交命令、不设置意图、不写 Core 或 store，不从 Render State 推导 projection 未给出的规则信息。

### 二维绘制语义与调色板

- **逻辑像素与索引色：** 二维位图、字体与图元在 640×480 逻辑网格上确定索引和覆盖，未覆盖处保留世界画面。`PalettePayload.entries` 已是转换后的 8 位 RGB，不能再当作 6 位分量扩展；原版 6 位到 8 位的转换属于既有导入边界。画入游戏图像后由 P3-12 屏幕阶段仅作一次闪光。CPU 或 GPU 实现均须保留索引与覆盖语义，二维放大用最近邻；右显示屏三维模型仍按 ADR-0009 的设备像素渲染，不把整个画面锁成 640×480 离屏像素模式。
- **调色板：** F1、Warp 与被毁视角使用 DATA（`palette/flight/cockpit-hud-map`）；地图整屏使用 slot 2 的组调色板（`palette/map/screen`）。代码中的颜色常量是调色板索引，按所在画面的调色板解释。
- **复制：** 消费规范化 `ImagePayload` 的索引、掩码和 `display` 规则；编码/RLE 的解析继续归 `original-data/`，渲染器不得再读原文件。不透明路径中的索引 0 仍然不透明，只有指定颜色键路径才跳过索引 0；覆盖掩码不得由 RGB 是否为黑推断。布局元素按记录次序与绘制遍合成。
- **图元：** 1 像素水平线、矩形外框、中点圆与填充圆盘（及其在边缘裁剪时的变体）、单像素与 3×3/5×5 的标记形状按原版例程的像素集合实现，不用抗锯齿或浮点光栅化近似。
- **裁剪：** 不增加原版没有的单元/仪表矩形裁剪：字形可超过 advance 覆盖下一格，信息计数行可超出小窗。已确认的面板裁剪照常；逻辑屏幕外写入始终安全舍弃，不复现越界内存写入，也不把它当成未处理异常。缩小画面只验证既定采样与边界，不要求一个设备像素保留多个逻辑像素。

### 文字与格式化

- **来源：** 原版文字来自 `data/hud/text`、DIAG、`view-labels`、`comm-menus`、`flight-messages` 与 `NameReference` 的绑定内容。`comm-messages` 的名称列表可用于名称解析，但没有 CMOV 台词；通讯正文沿用 P3-10 已批准的 G-03 项目摘要，由应用注入并明确标为项目文字，不把它称为原版台词。颜色、坐标偏移与周期等代码常量链接原版记录。
- **字体：** `font/hud/8x8-1`（fonts/0，步进 8）与 `font/hud/8x8-2`（fonts/1，步进 6、大写标志）；按原版画出每个字形的前 `height` 行、8 列，大写标志把 a–z 换成 A–Z；字符映射之外的代码按 Q-12 的结论处理，不静默替换。
- **格式化：** 实现 HUD 格式串实际用到的转换（`%d`、`%.0f`、`%s`、`%%` 等，以 [HUD 文字](../../../original/formats/executable.md#hud-map-and-communications-text-from-the-exe-p3-0324)记录的区域为准），舍入、负数、宽度与截断按原版运行库的语义（Q-12）；距离 ≥ 99999.0 时乘 0.001 等分支按 T7。没有记录的转换不实现，遇到时为内容契约错误。
- **长度：** 名称最多显示的字节数、面板按字符宽度截断等按原版；超出由原版例程决定，不在项目中另行省略。
- **字节与换行：** 原版文字是导入的单字节字符串，不按 UTF-8 字节拆分；项目文案与原版字节来源分开。DIAG 的换行先按已确认的消息布局分行，再查字形，不能把换行当未映射字符；`characterTicks`/`holdTicks` 的名称不表示逻辑 tick 数，其原始时间单位按 Q-05 明确为任务时钟单位后使用。零间隔仍须遵守每次处理器调用最多一个字符，不无限追赶。

### 前视驾驶舱与仪表

- **框架：** `layout/cockpit/front` 的元素按次序绘制在其坐标；仪表矩形内的像素来自各仪表。静态区域（排除 10 个仪表矩形）须与原版截图逐像素一致。
- **调度：** 每个逻辑 tick 按当前 slot 的记录次序检查到期（类型 7 在类型 6 之前），到期或被强制时执行对应处理例程，画进后备面并按原版复制到送屏面；显示帧只合成送屏面（D-01 修订，DC-05）。Core 已迁移的规则写入不随仪表绘制重新执行。
- **角落仪表（类型 0–3）：** 四个角落的异形条 `0x417a4`（不是 TABL 10479 的图像，D-01 修订）；按 [D16](../../../original/formats/executable.md#d16-hud-full-scales--confirmed-code-for-operands-drawing-p3-13) 使用各自值与满刻度，不统一套 `maximumSpeed`：速度仪表用 CINF `atB8`，指令速度按类型 1 的实参选择动态上限或内容基准。状态 1 的随机读数、状态 2 的隐藏、数值钳位与颜色阈值按 Q-03；D-01 核对玩家种类/机型引用及零分母分支。
- **雷达（类型 5）：** 接触点集合与分类只读 `radar.contacts`；投影、形状、颜色、噪点及严格到期比较按 [T6](../../../original/formats/executable.md#t6-radar-confirmed-code-unless-noted)，不能把“due = sample + 0x10，sample > due 才翻转”简写成恰好每 0x10 翻转。重建节奏由仪表记录的间隔决定（在 slot 0 中每次到期调用都重建）；Warp 中不重建、不画接触点，只清圆盘并画背景环；没有十字线，0.5r 环只画轴附近的四段短弧（D-01 修订，[hud §4.3](../../../original/formats/hud.md#43-radar-type-5)）。沿用 CR-11 差异 7 的 120 项上限（真实点、目标框、噪点和假框共同计数），不复现原版越界；噪点超额的保留、随机消费与诊断按 DC-08，不在正常拥挤场景中抛出容量故障。

### 左显示屏

- **页面：** 按 `flight.combat.player.leftPage`（0–6）选择处理例程，页面序号与切换是 Core 状态（D15），本任务不改变页面。左显示屏页面在 (x0, y0+1) 绘制。
- **页 0（状态）：** MFDD 列表 0 的三张背景按原版比例选择、不透明绘制；列表 1 的叠加图按字段 0–8 的状态以颜色键 0 绘制（只有这 9 个字段有叠加图，[hud §4.4](../../../original/formats/hud.md#44-left-display-type-6)），部分按原版闪烁；两行 DIAG 文字按 DIAG 的计时逐字打出、保持与轮换，打字后显示光标框（Q-05）。闪烁相位与字段 1、5、8 由 Core 的显示步写入，本任务只绘制。
- **页 1（能量）：** BITM 10467 不透明，按两项分配档位选择的 TABL 10479 记录以颜色键绘制（不含末行），三条带按原版的半宽表与间隔线绘制，带标签来自 `data/hud/text`。
- **页 2–4（通讯菜单）：** 只绘制 `communications.player.menu` 中已有选项，使用各项 `key`、表/项引用、对象名称快照与 `tone`；不重新生成按键、枚举对象或重新筛选选项。文字来源、两种布局、颜色闪烁、分隔及宽度截断按 Q-07；菜单不存在或被页 5 遮住时不画旧菜单，也不修改 Core 页面。
- **页 5（来电）：** 按当前 `incoming` 与 `shown` 显示 G-03 占位，不从入队事件重建当前来电；其项目摘要在 `incoming-started` 时进入消息行。短标注留在 MFD 内，完整摘要由消息行呈现，不能把英文长句硬塞进 96 像素面板后截掉规则信息。未知摘要映射给出明确的“项目摘要未覆盖”反馈，不伪造答复；切片实际可达的消息映射须在验收前补齐。
- **页 6（Warp）：** 标题与三条读数（角度、误差、完成度）来自 `flight.combat.player.warp.page`，以原版的竖线条与标签绘制；轨迹的历史（定心 c）与 0x10 的刷新周期由表现模型保存（Q-06）。
- **SNIP 干扰：** 页面所属子系统（页 0 为 10，页 1 为 11，页 2–5 为 13，页 6 无）的状态为 2 时总是绘制 SNIP 帧，为 1 时按原版的随机间隔切换（[SNIP](../../../original/formats/hud.md#snip-10487-confirmed-structure-p2-1227)，间隔的单位与范围以该记录为准）；帧号按任务时钟选择，四个颜色来自原版的索引表。

### 右侧目标显示屏

- **目标模型：** 以只读目标选择器与绑定内容确定外观，不能因为目标不在可见世界的 Render State 中就隐藏显示屏模型。Q-08 核对 T7 的种类、对象 +0x06 分支、姿态、观察距离与 `0x42a12` 灯光。可复用 P3-12 的已确认材料/光照计算，但不能假定其世界场景配置就是目标场景配置。目标场景使用独立深度附件；复制进驾驶舱时禁用深度测试/写入，不清除世界深度或破坏 Warp 保留深度。**D-01 修订（20，2026-10-28）：** 目标场景在 CPU 私有 100 × 100 索引设备上光栅化（单色平面剪影，与原版设备同分辨率），只把颜色复制进后备面 B；不分配 GPU 渲染目标或深度附件，世界深度与 Warp 保留深度在构造上无从触及。该设备属驾驶舱索引仪表（护盾色索引与 SNIP 干扰都作用于索引像素），随驾驶舱二维层按最近邻放大；ADR-0009 中“3D 按窗口实际像素渲染”针对世界飞行画面，不受影响。
- **文字：** 名称（至多原版规定的字节数）、距离（≥ 99999.0 时按千单位）、护盾百分比、机型记录读数与速度，按 `data/hud/text` 的格式与 T7 的位置绘制；刷新按原版节流或目标改变时立即刷新。
- **无目标与 Warp 离开：** 无目标时显示无目标文字（按其刷新周期）；Core 的 `target-cleared` 事件以 `warp` 为原因时显示离开提示并按原版的绘制计数倒数。
- **地图标记：** 目标为种类 25 的标记时显示十字与距离，三行信息换成标记分支的文字，名称为 `mapMarkerName`。
- **干扰：** 子系统 14 的状态按与左显示屏相同的规则绘制 SNIP。

### 消息行、指示条与 Warp 灯

- **消息行（类型 8）：** 每运行持有有界队列；每项区分封闭消息身份、导入/项目文字来源、颜色、模式、字形宽度、入队时钟与首次逻辑显示时钟。滚动以首次逻辑显示为起点，不以入队时刻起算；未显示项过期与已显示项滚出按[完成与信标消息](../../../original/formats/executable.md#completion-and-beacon-messages-p3-1103)分开处理。只有调度允许的类型 8 更新才计为逻辑显示；实际 GPU 提交、页面重画或读者个数不决定队列生命周期。入队来源：
  - `flight-message`（完成与信标消息，颜色 0x0C、模式 1、过期 0x280/0x3C0）；
  - 速度辅助的开关消息（`speed-assist-toggled`，文字来自 `data/flight-messages`）；
  - `incoming-started` 的 G-03 项目摘要（包括 `shown: false` 的 Warp 来电），不是 `radio-queued` 或 `radio-taken`；同 tick 开始又结束的零时长消息仍入队一次，不因帧末 `incoming: null` 丢失；
  - 其他在切片中可达的入队点按 Q-09 核实。
  在事件原次序中，每个 `radio-flushed` 只丢弃当时队首；`flight-message: beacon` 先丢队首再入队。完成消息已有前置 `radio-flushed`，不能再额外丢一次。用运行身份、tick 和批次内序号保证单次消费；不同时订阅 Event Bus 和帧批次处理同一消息。G-03 项目摘要采用颜色 8、模式 1、未显示过期 0x200、宽度 8 × 字节数（D-01 修订，DC-07）；正文不是原版台词，不计入台词逐像素一致。
- **绘制前后边界：** Q-09 必须为每个消息来源固定“本次逻辑消息行绘制前/后”的阶段。RQ5 的来电开始在原版帧渲染末尾，不能因 Runtime 帧后批次已给出 `incoming-started` 就让它在该 tick 更早的消息行绘制中出现；最早在下一次合格逻辑绘制显示。早于绘制的完成/信标等按其来源阶段处理，不把全部事件统一提前，也不为此在 Core 中回调渲染器。
- **消息行的位置：** 每个布局的类型 8 记录给出矩形（slot 0、2、7 都有一条）；队列跨视角保持。
- **指示条（类型 9）：** 在 main 上读 `communications.player.warnings`（无玩家时不绘制类型 9，不以 false 填充）；P3-14 合入后改读 FA-01 的 `communications.warnings`，不保留 `player.warnings` 别名（D-01 修订，[与 P3-14 的关系](#与-p3-14-的关系)）。闪烁用绘制例程自己的时钟（到期 + 0x15，严格），导弹文字在相位 0、机体文字在相位 1，“已显示”标记与擦除按 [hud §4.8](../../../original/formats/hud.md#48-indicator-strip-type-9-and-warp-lamp-type-12)；绘制类型 9 的门禁与 Core 警告全局采样门禁分开（D-01 修订）。07 的截图推断两项在所选任务中都出现过（高概率），与 P3-14 的“不可达”结论冲突，必须列明证据适用性；合成边界必须验证，缺少原版画面时仍按本任务对照门槛处理，不能借声音任务的 D1-11 自动豁免。
- **Warp 灯（类型 12）：** 由 `flight.combat.player.warp.indicator` 决定亮灭，文字与位置按原版。

### F1 叠加与被毁视角标签

- **F1 叠加：** 只在视角 0xC 按 Q-10 完整清点 `0x45de0` 及子例程的十字、目标框、提前量标记/连线、文字和门禁，不把当前文字清单当作完整几何清单。目标身份与可见资格来自 projection，屏幕位置由同一显示相机计算；目标位姿若插值，必须与 P3-12 同 tick、同 ID/放置序号，缺少匹配帧时折叠而非猜测。数值缓存与显示几何分别计时。速度辅助持续状态读 projection，事件只启动一次性闪烁；锁定提示与音效的交互须按 D-02，不能用子系统 9 的视觉隐藏去停掉不受该门禁影响的锁定声音。
- **跳过：** 玩家的子系统 9 为状态 2 时不绘制叠加，为状态 1 时按原版随机跳过（驾驶舱表现随机源）。
- **Warp 中：** 不调用叠加（[自动视角](../../../original/formats/executable.md#automatic-views-and-cameras-p3-0109)）。
- **被毁视角标签：** 视角 0x11 子模式 8 时绘制 `data/hud/view-labels` 中子模式 8 的标签，字体为 fonts/1（大写），标签框按 `0x459a0` 的尺寸；其他子模式不在 P3 中出现。

### 战略地图画面

以下同管线方案已由 [ADR-0019](../../../decisions/ADR-0019-strategic-map-render-pipeline.md) 落档，并同步总计划与 P3-09；实现仍须经 goal 及相应实施关卡。地图规则信息只来自 `map` 分区，不从 Render State、整个世界或其他分区扩大可见集合。

- **框架与调色板：** `layout/map/frame` 的元素，绘制遍 0 在地图之前、1 在之后（D-01 导入的标志；随附数据中 slot 2 的元素全为遍 1）；整屏使用 `palette/map/screen`。六对三字母按钮只绘制，没有点击区域。
- **重绘：** 地图内容按 `data/hud/map-geometry` 的重绘间隔与原版的强制条件重绘；视角 8 没有保留，每次逻辑调度从填 0 的背景整幅重画并整屏送出（原版每帧以 0 填充后复制，Q-11；D-01 修订，DC-05）。
- **绘制次序：** 按 `0x49f8c` 的次序（Q-11），其中：
  - **覆盖与迷雾：** 非敌对接触点的 `coverage`（`disc`）画填充圆盘，玩家最后画且用自己的颜色；敌对接触点画 1 像素圆环；半径 0 不画。迷雾就是未被圆盘覆盖的清空背景，没有历史探索。
  - **单位标记：** `contacts` 中 `inWorld` 的接触点以 TABL 10461 的记录画在 `pixel`；目的地标记（记录 27）画在目的地像素，旁边为代价文字；主地图标记从不加选中方框。
  - **标签与连线：** `labels` 的名称（fonts/1）与引线，玩家到光标的连线 `line`；标签的威胁闪烁读 D-01 加入的 `MapLabel.threatened`（只读是否非 0，D-01 修订，DC-09）。
  - **代价文字：** `cursorCost` 与 `destination.cost` 的有限百分比按原版三档颜色与导入格式绘制。`percent: null` 保留 MW-12 的零能量语义：显示集中定义、明确标为项目提示的不可计算短标记，且不落入“低消耗/可跃迁”颜色；不把原版 x87 异常结果 1 当正常百分比。颜色按 c ≥ E 判档，归 Δ-06 并同步 P3-09；玩家没有地图图标时照原版不画代价文字；可执行性始终来自 `warpRequest`。信息行零满刻度在随附数据中不可达，合成输入中为消费者故障，不输出 NaN/Infinity 或任意 0（D-01 修订，DC-09）。
  - **信息小窗：** `information.rows` 按原版位置与 fonts/1 绘制，单位行受区域高度限制，计数行不受限制、可以画出区域。
  - **放大窗口：** `zoomMembers` 以 TABL 11401 中与种类位号相同的记录绘制，按 `0x4b56c` 错开（projection 给出未错开的像素），`boxed` 的图标加选中方框；距离标签（`distance`，开关打开时）的战斗目标用不同颜色。
  - **面板外框与标题：** 三个区域的外框，指针所在区域用第二种颜色；标题与光标读数文字按原版。
  - **消息行：** slot 2 的类型 8 记录。
- **原版指针外观：** 不画额外十字箭头。选取框/记录 26 可跟随 P3-05 本地位置作即时反馈；主地图读数、zoom 成员、信息行、连线终点及代价文字始终使用同一 Core 确认的 `cursor`，不得把旧代价移到尚未确认的新点旁。位置不一致时先保留确认点的读数，待下一 tick 统一；缩放只换算位置，不改变选择。
- **距离标签开关：** 按[地图鼠标](../../../original/formats/executable.md#map-mouse-input-p3-0503)，右键是采样的按住电平，不是每次 `pointerdown` 立即切换：读鼠标与逻辑地图绘制调用分别计入去抖，绘制调用用按钮 0。允许的右键采样才翻转并装入 20；单次调用内先测试后递减、同 tick 先读取后绘制（06 已确认，节奏与计数规则见 DC-09，D-01 修订），测试覆盖计数 1→0 的边界。每次开图清标签开关但不清去抖计数；新运行才重置计数。按 tick 替代帧的差别归 Δ-01，不简化为固定 20 tick。
- **信息边界：** 地图分区未就绪或地图关闭时不绘制任何接触点；不出现“全可见”或空接触点冒充没有敌机的画面。

### 地图输入几何与指针

- **生产几何：** 几何来自同一 `data/hud/map-geometry`；其含端点矩形转换成输入端口连续边界时，右/下边界为末列/末行加 1。`ViewportFrame` 必须相对于 Pointer Lock/input zone 的同一个容器，而非未经转换的 flight-area 偏移；覆盖黑边、边框、全屏、缩放和像素比改变。合法但尚无布局可返回 null；非法几何用既有 `invalid` 状态及原因反馈，不能吞成未就绪。
- **就绪：** 只有当前运行、视角、几何代际的地图及指针已成功提交后，绘制端才报告 ready。地图首帧绘制不能反过来等待输入已获得资格，否则形成死锁。接线须适配当前 `MapInput.cursor().draw()/ready` 握手：输入端读取最近一次实际呈现凭证，不单独再画一遍或推进表现。失去布局/设备/画布绑定时立即撤销凭证、清键并释放本运行锁定，恢复系统指针且显示原因；恢复后先绘制再按 P3-05 资格请求锁定，不自动续选。
- **光标合成：** 生产构建不再显示项目十字光标；按 P3-05 的约定，光标位置逐会话帧读取、在同一地图画面管线中绘制为原版指针外观，不经 React 高频坐标 store、不另建循环。项目十字光标只保留给隔离的测试入口。
- **右键：** 经既有 Pointer Lock 输入链传递按下/释放电平与输入资格；只在地图主区域、运行中且焦点合格时生效。虚拟读取使用任务时钟的严格到期规则（2 单位/tick 下至少 8 单位），每逻辑 tick 至多一次、不回补；同 tick 先采样再执行地图绘制的按钮 0 调用。短于采样间隔的按下/释放可不被读到，按住按去抖重复。暂停、隐藏、失焦、解锁、离开无锁回退区域及离图清按住状态，不复用旧按下；只在合格游戏区域抑制 context menu，侧边装饰按钮不产生动作。`m`、两次 Esc、左键重复与失败回退保留 P3-05 的行为；绑定与采样合同在 D-01 同步 P3-05，不新增 Core 命令或录制字段。

### 接线与生命周期

- **登记：** 在 `wireFlightRun` 的同一次接线中，以运行的 `FlightRunRender.addLayer` 登记驾驶舱层与地图层（`cockpit` 槽，按需多层，按加入次序），以 `addGpuPlans` 把它们的 GPU 计划并入 `beginRun` 核对的运行计划；GPU 资源取自运行缓存，随运行释放。每项取得都交给 `run.ownCleanup`，开始失败时按 P3-04 回滚。
- **绑定与排序：** 全部内容/缓存同时绑定 owner、run、资源包代际与完整 `ContentIdentity`，不能只用 Asset ID 跨包复用；迟到的异步结果只释放不接入新运行。每帧保持“全部 Core tick → 事件分发 → 帧消费者”；帧消费者中先处理逐 tick 表现，再合成一次（D-02 不建共享提示模型）。首次输入资格与 GPU 提交的顺序显式接线，不依靠监听器注册的偶然次序；晚挂 GPU 只从当前模型重画，不重播历史一次性事件。
- **内容准备：** HUD 内容（布局、仪表记录、图像、调色板、字体与文字）在运行开始前由应用解码并核对，任何层不能绘制的内容都在分配之前拒绝开始。
- **只有一个画布与循环：** 不新建画布、WebGL 上下文、帧循环或 React 子树；StrictMode、Fast Refresh、重试与返回菜单不产生第二个实例。
- **故障：** 内容、契约、预算与表现模型的错误使运行的消费者故障（会话的既有政策）；图形设备错误沿用 P3-12 的分类。
- **诊断：** 开发诊断可读驾驶舱表现模型的摘要（当前页、消息行队列长度、各仪表上次重绘时刻）与驾驶舱层的 GPU 计数；生产构建不暴露。

### 缺省与标注

- **G-03：** 来电页的头像与动画位置显示可见的标注与项目摘要文字（[P3-10 缺省与标注](../10/spec.md#缺省与标注)）；文案只在 `slice-gaps-copy.ts`，经应用装配传入 render，不从 render 导入 React 页面。
- **G-05：** 视角 6 继续用项目基地页，但其现有实现没有通讯正文，S-12 必须补齐。应用将同一消息模型的当前队首/当前来电项目摘要桥接到基地页，不创建第二条队列或计时器；队首变化立即发布，其余按现有 React 采样。项目页完整显示正文而不仿制滚动像素，消息逻辑沿用前视类型 8 的宽度/到期策略，这是 G-05 的项目呈现，不宣称原版基地像素一致。开地图后交回地图消息行，返基地不重播。RQ5 的 docked text-only 路径只在视角 6 中 GAMEHIRES 已改为假、HI→LO 切换尚待应用时出现（显示模式 1 即 HI，见 [RQ5](../../../original/formats/executable.md#rq5-incoming-channel-load-visible-end-and-callback--confirmed-code-and-runtime-baseline)），本 HI 切片不实现，也不改变 Core 的回调链。
- **在制标注：** 驾驶舱与地图接入后移除 `FLIGHT_IN_PROGRESS`、`MISSION_SKELETON` 中关于驾驶舱与 HUD 的文字及 slice-gaps 的在制标注条目。
- **不新增缺省：** 本任务不新增 G 项。研究若发现切片画面必需而无法实现的元素，按阻塞处理并交用户决定，不以未披露的省略或近似外观代替（[标注规则](../01/spec.md#标注规则)）。

### 原版研究

研究以所选任务实际经过的绘制路径为界，结论写入 `docs/original/` 并标注置信度，任务文档只链接。证据途径按[下节](#原版证据途径与-dosbox-x-的使用)选用；“影响可见性”的项最终必须为已确认。

| ID | 问题 | 已有起点 | 证据途径 | 所需结论 | 影响可见性 |
|---|---|---|---|---|---|
| Q-01 | 仪表记录与调度：slot 0、2、7 的记录字段（+0x14、+0x24 等）、目录 +0x0C 与 `0x49a6c` 预遍、`0x49b2c` 的重绘间隔与强制条件、元素的 +44/+48；需要导入哪些字段 | 记录结构、类型次序、+0x18/+0x1C（已确认） | 静态；本地数据（只出结构与计数）；截图 | 已确认，并给出 D-01 的导入字段 | 是 |
| Q-02 | 持久帧缓冲的等价：哪些区域何时擦除与重绘（`0x456e4`、Warp 的 0 填充、地图的 `0x599e8`/`0x583fc`、页面或视角切换的全量重绘），使逐帧合成复现原版外观 | FC2、FC3 | 静态 | 已确认（代码）；等价性高概率 | 是（过期信息的保留/擦除） |
| Q-03 | 角落仪表：类型 0–3 的几何、阈值、字母、受损读数与 D16 的不同满刻度；零/负分母的可达性与结果 | D16；现有 `MotionPlayer` 与机型内容 | 静态；截图元素对照 | 读数与门禁已确认，外观另判 | 是（资源与速度信息） |
| Q-04 | 雷达：矩形内的中心与缩放常量、相机平面偏移（玩家状态 +0xA0/+0xA4/+0xA8）的写入者、0.707 相关的选择、背景环与十字（高概率）、矩形裁剪 | T6 | 静态；截图中接触点形状、颜色与位置分布 | 已确认 | 是 |
| Q-05 | 状态显示屏：背景选择、叠加图次序、Core 相位消费、DIAG 评级越界与启动消息计数；需要的显示前态/序号是否已在 projection 中 | DIAG；`systems/displays.ts`、`rules/displays.ts` | 静态；截图 129–135 | 已确认，不能把非法评级读成任意缺省文字 | 是（损伤信息） |
| Q-06 | 能量页与 Warp 页：条带、标签、零满刻度、历史轨迹长度与刷新、页 6 标题；不同 Warp 序号重置 | `0x4d800`、`0x4dcec`，截图 066、100 | 静态；截图元素对照 | 已确认；D-01 固定有界历史 | 是（能量与 Warp 读数） |
| Q-07 | 通讯面板：`0x4da28` 的两种布局分别用于哪些页面、标题、分隔、截断与闪烁；页 5 的区域划分（占位区与文字） | comm §4、B-004；截图 062–065 | 静态；截图元素对照；参考视频（头像位置） | 已确认（代码） | 是（菜单项是否可见） |
| Q-08 | 右显示屏：视口、背景、专用灯光、观察距离表、对象 +0x06 变体、目标模型选择、文字与零分母、提示计数；不能从世界可见集合补目标身份 | T7；`CombatTarget`、绑定机型与模型内容 | 静态；截图元素对照 | 已确认；D-01 闭合输入，三维光栅误差另定判据 | 是（目标信息） |
| Q-09 | 消息行：模式 8 分支、重绘节流、全部可达入队点、容量与过期；对应实际 `incoming-started`/`radio-flushed` 等事件的时点与序号；G-03 摘要长度/缺失映射与基地桥接 | 已有消息规则、RQ5/RQ7、`domain-events.ts`、`comm-messages.ts` | 静态与现有源码 | 原版规则与 G-03 项目取舍分列，不导入未计划的台词 | 是 |
| Q-10 | F1 叠加：`0x45de0` 的元素清单、目标框的投影与裁剪、读数位置与格式、闪烁与刷新、子系统 9 的跳过、是否需要 projection 未给出的运动事实（`0x46fe0` 读的角速率、`0x46260` 读的后裁剪面）、标签框 `0x459a0` | 自动视角、HUD 文字的 F1 区域 | 静态；截图元素对照 | 已确认（代码），并给出 D-01 的候选是否需要 | 是（目标框） |
| Q-11 | 地图：绘制次序、网格、外框、读数、记录 26、指针、图标错开、威胁闪烁、距离标签；将已确认的“读输入调用 + 按钮 0 绘制调用”映射到项目调度，冻结同 tick 次序及开图保留计数；零能量沿 MW-12 项目分支 | B-001、地图鼠标、P3-09 Q-03 至 Q-05 | 静态；合格地图截图 | 已确认代码与项目取舍分列 | 是 |
| Q-12 | 文字：格式化的运行库语义（舍入、宽度、负数）、字符映射之外的代码、fonts/1 大写替换与映射的关系、字体头字节 +1 是否影响绘制 | hud §1、HUD 文字 | 静态；截图中的文字逐字形对照 | 已确认（代码） | 是（读数文字） |
| Q-13 | 全部显示随机抽取、门禁和容量；区分纯表现抽取与 Core 已迁移的状态写入，核对 CR-11 已批准差异 | T6、SNIP、DIAG、Core 显示步 | 静态 | 不因交还上游就把依赖标为完成；切片必需规则缺口阻塞相关验收 | 是（受损信息门禁） |

#### 研究结论索引（07）

2026-10-28 由 07 汇总 01–06 的研究并写入原版文档；本表只给记录位置、置信度与缺口，事实以链接的原版文档为准。未新增 DOSBox-X 运行。缺口的最小补采与恢复条件见 [07 完成证据](./subtasks/07-evidence-contract-baseline.md#完成证据)，D-01 候选交 08。

| ID | 结论记录 | 置信度 | 缺口与交接 |
|---|---|---|---|
| Q-01 | [cockpit 记录与调度](../../../original/formats/cockpit.md#instrument-records-scheduling-and-visible-persistence-p3-1301)（字段表、`0x49b2c` 次序、目录 +0x0C、元素 +44/+48 的送屏）；[01](./subtasks/01-layout-scheduling-research.md#完成证据) | 已确认（代码与数据）；+0x28 的运行时读者未找到（高概率只是表长） | 导入字段交 08；无运行缺口 |
| Q-02 | 同上“每个视角显示什么”与送屏规则；[FC1/FC2/FC3](../../../original/formats/executable.md#frame-composition-depth-and-explosion-sprites-p3-1203) 已更正 | 代码已确认；与逐帧合成的等价为高概率 | 两帧保留序列（07 缺证 M-5）只在要求“保留外观一致”时需要 |
| Q-03 | [hud §4.2](../../../original/formats/hud.md#42-corner-gauges-types-04)、[D16](../../../original/formats/executable.md#d16-hud-full-scales--confirmed-code-for-operands-drawing-p3-13) | 读数、门禁、颜色、形状已确认（代码）；外观 204/204 截图拟合 | 速度 ÷ B8 > 1 的可达性未确认；D-01 需玩家机型 B8 |
| Q-04 | [hud §4.3](../../../original/formats/hud.md#43-radar-type-5)、[T6](../../../original/formats/executable.md#t6-radar-confirmed-code-unless-noted) | 已确认（代码）；平面偏移无其他写入者、越界后果为高概率；背景环经 51 张截图核对，没有十字 | 接触点位置映射无原版画面配对（M-1 共采）；D-01 撤销“相机平面偏移”候选 |
| Q-05 | [hud §4.4](../../../original/formats/hud.md#44-left-display-type-6) 页 0、[DIAG](../../../original/formats/hud.md#diag-10489-confirmed-structure-p2-07-revision)、[D9](../../../original/formats/executable.md#d9-status-display-writes-subsystem-fields-1-5-and-8--confirmed-code) | 已确认（代码；背景/叠加集合与次序经 48 张截图）；评级越界由导入数据唯一决定 | D9 写入在翻转后一次调用、跨任务保留，与 Core CR-10 不同，交 08；真实打字节奏受 U-021 限制（M-6） |
| Q-06 | [hud §4.4](../../../original/formats/hud.md#44-left-display-type-6) 页 1、页 6 | 已确认（代码；页 6 经 `srangers_066`，页 1 经 `srangers_100`） | 能量页 +0x44 重画标记的 D-01 候选与历史 94 项上限交 08 |
| Q-07 | [comm §4](../../../original/formats/comm.md#4-text-rules-confirmed)、[RQ8](../../../original/formats/executable.md#rq8-page-5-and-the-other-saved-pages--confirmed-code) | 已确认（代码）：HI 页 2–4 用第一种布局并画标题；页 5 为 96×96 帧图像、无文字区 | 无运行缺口 |
| Q-08 | [hud §4.5](../../../original/formats/hud.md#45-right-display-type-7)、[T7](../../../original/formats/executable.md#t7-right-target-display-confirmed-code)、[TEX 11089](../../../original/formats/textures.md#tex-11089-right-display-background-confirmed) | 已确认（代码；背景、文字、模型色经 49 张截图）；+0x06 不是独立事实 | 三维剪影无位姿配对（M-1）；D-01 需模型引用与机型 +0x08 |
| Q-09 | [hud §4.7](../../../original/formats/hud.md#47-message-line-type-8)、[完成与信标消息](../../../original/formats/executable.md#completion-and-beacon-messages-p3-1103)、[RQ5](../../../original/formats/executable.md#rq5-incoming-channel-load-visible-end-and-callback--confirmed-code-and-runtime-baseline) | 已确认（代码）；原版规则与 G-03 项目取舍分列（[05](./subtasks/05-messages-text-research.md#完成证据)） | 地图消息行分支无截图（M-3）；15 个未覆盖的 G-03 序号交 25；预算交 08 |
| Q-10 | [hud §4.6](../../../original/formats/hud.md#46-flight-view-overlay-0x45de0-and-view-label)、[HUD 文字](../../../original/formats/executable.md#hud-map-and-communications-text-from-the-exe-p3-0324) | 已确认（代码；准星、读数、武器行经截图）；被毁视角标签经 `srangers_091/092/122` | 目标框、提前量、锁定环无位姿配对（M-1、M-2）；角速率、武器速度/射程等 D-01 候选交 08 |
| Q-11 | [hud §4.9](../../../original/formats/hud.md#49-strategic-map-type-10)、[地图鼠标](../../../original/formats/executable.md#map-mouse-input-p3-0503)、[B-001](../../../original/behavior/B-001-strategic-map.md#地图画面的绘制已确认代码p3-1306) | 已确认（代码；外框、网格、标题、标签经 10 张截图）；右键节奏为运算级推演 | 无截图覆盖的状态见 hud §4.9 末段（M-4）；零能量提示、连线退化与右键模型交 08 |
| Q-12 | [hud §4.1](../../../original/formats/hud.md#41-primitives-text-and-formatting) | 已确认（代码）；`%.0f` 负值输出负零为高概率（切片实参非负） | 无运行缺口 |
| Q-13 | 见下段 | 已确认（代码） | 无运行缺口；表现抽取按 Δ-03 披露 |

**Q-13 汇总（随机抽取与规则/表现边界）。** 原版这些抽取都在渲染路径中，与规则共用 C 库 LCG（[T6](../../../original/formats/executable.md#t6-radar-confirmed-code-unless-noted) 末段）；本项目全部归驾驶舱表现随机源（技术决定 5、Δ-03）：

- 角落仪表 0–3：对应子系统状态 1 时每次实际绘制 1–2 次；能量/护盾在自身到期之前返回且不抽取（[hud §4.2](../../../original/formats/hud.md#42-corner-gauges-types-04)）。
- 雷达：子系统 12 状态 1 每次重建 1 次 + 每个噪点 5 次 + 尚有剩余时的假框 1 次；状态 2 每次重建 300 次；Warp 中不抽（[hud §4.3](../../../original/formats/hud.md#43-radar-type-5)）。
- 左显示屏：页面子系统状态 1 时每次干扰切换 1 次；DIAG 下行在启动消息计数 > 0 时每条消息 1 次（计数从不清零）（[hud §4.4](../../../original/formats/hud.md#44-left-display-type-6)）。
- 右显示屏：子系统 14 状态 1 时每次切换 1 次（[hud §4.5](../../../original/formats/hud.md#45-right-display-type-7)）。
- F1 叠加：子系统 9 状态 1、已显示至少 0x40 单位后每次合格调用 1 次（[hud §4.6](../../../original/formats/hud.md#46-flight-view-overlay-0x45de0-and-view-label)）。
- 其他显示（类型 8、9、12，页 1、2–6，目标文字，地图与被毁视角标签）不抽取。
- **边界：** 字段 1/5/8 与状态显示闪烁由 Core 的显示步写入（CR-10），原版写在翻转后的下一次页 0 调用且相位跨任务保留；D-01 照原版更正 Core 的次序（P3-02 CK-01），跨任务保留归 Δ-04；子系统字段、雷达接触点与 120 上限（CR-11 差异 7）、9 型警告采样及僚机尾随警告（FA-01、P3-14）、主地图错开 `0x4b3a8` 与 T7 的目标清除都是规则状态；放大窗口错开 `0x4b56c`、全部显示计时/相位、SNIP、噪点、DIAG、消息队列、距离标签开关与指针是表现状态。原版的显示计时与相位都是静态初值、跨任务保留，本项目每运行重建（Δ-04）。左显示屏干扰切换在原版中决定页 0 是否运行、从而影响 D9 写入时机，按 CR-10 末段与 CR-11 差异 4 处理。

### 表现对照与判定

对照方式为 [P3-01 的“画面”](../01/spec.md#对照方式与判定)：静态区域逐像素；动态元素按已确认的绘制规则与截图核对。每个元素分别报告：

1. **绘制规则**及其置信度（Q 表与链接的原版记录）；
2. **实现证据**：Node 测试以合成内容断言实际像素与状态序列；浏览器测试以合成任务包断言画面中的逻辑像素；
3. **原版画面对照**，按下列方法之一，不能取得时列为外观证据缺口：
   - **静态区域：** 只比较原版框架实际覆盖的静态像素，不比较裸露世界，也不把元素后绘制遍覆盖的像素一律排除。候选与原版须同原生尺度、同调色板/闪光状态；有闪光的截图须独立识别闪光条件，不能拿未闪光候选直接比。掩码来源是布局、原版绘制路径与 P2 证据，不能由候选差异反推。无闪光、可比的二维静态像素要求 0 差异。
   - **截图反推输入的元素对照：** 可拟合文字、背景/叠加图、SNIP 帧、条带或图标的绘制参数，但这只证明图元/资源外观，不证明资源比例、三维投影、命中、可见性、状态选择或时序正确。固定唯一性判据，并以错误字形/帧/图元等负对照验证可区分；有多个解则降为不足证据。把从截图量出的屏幕点直接交给画线例程，不能验收从 Core 世界坐标到该点的变换。语义映射须另有代码依据、独立期望及真实规则输出接线证据。
   - **参考视频：** 只作动态外观的线索，最高为高概率。

判定类别沿用 [P3-12](../12/spec.md#表现对照与判定)：一致、一致（高概率）、已批准差异、差异待修复、无法判定。另加：

- **外观证据缺口：** 缺少可比原版画面时逐项记录来源、已尝试方法、受影响 AC 与恢复条件，不计为“一致”。必需项仍 blocked；只有用户对本任务的具体项明确批准范围或差异处置后才改变门槛。P3-12、P3-14 的既有豁免不自动继承，“尽量减少 DOSBox”也不是概括豁免。
- **信息与外观分别判定：** 雷达位置/容量、目标框、资源与损伤读数、通讯项、消息时序、地图可见性等必须有已确认规则及独立实现证据；改变玩家可见信息的项不能当纯外观放行。代码一致、外观一致、节奏差异及批准差异分列；没有原版画面只能说代码对照通过，不能据此填外观一致。可比画面显示差异时先修复，不转成“缺口”。

判据在观察候选结果前冻结：原版版本/配置、截图 ID/哈希、候选与内容身份、元素、输入证据、样本资格、掩码、颜色空间、负对照、容差及理由。二维整数像素与色值精确；右显示屏三维模型的光栅/投影差异按 P3-12 已有判据的适用范围或独立推导的误差界，不能以“整块模型逐像素 0 差异”代替分析。先审计已有证据覆盖，再按状态/分支选取能区分规则的样本，不为凑数量重跑原版。记录仍归相应 subtask 与 `docs/original/`。

### 原版证据途径与 DOSBox-X 的使用

用户要求尽量减少 DOSBox-X 的使用（本 spec 的生成请求，并参照 P3-08、P3-11、P3-12 的同类决定）。本任务的原版证据按以下次序取得（[原版证据获取](../../../guides/original-evidence.md)）：

1. 复用 `docs/original/` 与已有研究：绝大多数绘制规则已在 P2-12/27、P3-01、P3-03/24、P3-07、P3-09、P3-10 中以代码确认；
2. 只读 Ghidra 分析补齐 Q 表的剩余分支，本地数据只用于结构与计数；
3. 已有的 132 张本地截图按上节方法作静态与元素对照；参考视频补动态外观线索；
4. 本项目以本地导入的真实内容在自有浏览器中产生画面，与上述证据配对。

**目标是零新增运行，不是零运行的硬上限或验收条件。** 本轮审阅未启动 DOSBox-X。已有代码可确认时钟单位内的分支与公式，但 DIAG 每调用最多一个字符、绘制计数和右键双调用去抖仍受原版帧节奏影响；不能宣称不受 U-021 影响或误差在 10% 内。只比较代码时报告运算级结论；凡声明真实秒/帧节奏一致，必须有适用配置的运行证据。已有参考足够则不重跑。

必须补证时，先形成最小补采方案：

- 某个必需 AC 在静态分析、已有截图与视频之后仍缺要求的证据（包括必需的外观项），写明为何不能复用；
- 能写出缺口的原因、受影响的 AC、最小的操作或测量配方（`tools/baseline/measure.py` 的读数或 Capture）、停止条件与输出清单；
- 能用已有 `measure.py` 配方刺激/读数独立完成的由 agent 执行；需要原始像素时另确认 Capture 取得路径。Computer Use 不能送键不等于测量工具不能完成输入，不默认让用户游玩。只有工具无法表达的必要操作或权限问题才请用户做最小动作；追加范围/容差豁免仍需明确批准。

可共采的缺口集中处理，同一时间只有一个会话操作基准环境；使用私有副本与会话锁，不改写被测游戏状态或绕过输入限制。无法取得的必需证据保持 blocked。完成证据记录新增启动次数、复用的运行/截图身份和限制；原始输出始终留在 `local/`。

**执行期决定（2026-10-28，子任务 31 之前）：** 07 的最小缺证集 M-1、M-2、M-3、M-4、M-7、M-8 都需要原版新截图。本机上截图只能经 DOSBox-X 映射器的捕获快捷键（宿主按键）取得，而 Computer Use 无法向 DOSBox-X 送键（[本机限制](../../../guides/runtime-measurement.md#角色单一会话与本机限制)），`measure.py` 也不能导出画面；M-1、M-2、M-4、M-7、M-8 另需飞行操纵或地图鼠标。因此这些项只能由用户在键盘上游玩取得。依用户“尽量减少 DOSBox 的使用”与 2026-10-28 的明确授权（“在执行goal的过程中，如果需要修改spec或其他Decision，我都批准你修改。用任何方式来unblock任何问题，完成这个goal。”），本 goal 不新开基准会话，改为：

1. 31 用已有截图、30 的真实包候选画面与[参考视频](../../../guides/original-evidence.md#参考视频)抽帧，对 M 项逐项取得能取得的外观线索（视频结论最高为高概率），并照常执行冻结判据中已有证据可判的各项；
2. 32 对每个 M 项分列“已由代码确认的规则 + 合成测试 + 其他样本已核对的图元与颜色 + 视频高概率外观”，判为**经批准的外观证据缺口**（不是通过、不是自动豁免），写明缺什么、影响哪条 AC 及恢复方式；M-5、M-6 按缺证表的“否则”列处理（保留外观等价高概率、节奏为运算级）；
3. 完成报告把“用户按 `comparison-plan/missing-evidence.md` 的会话补采 M 项”列为剩余外部动作；补采后由新的验证项复核，不改写本次判定记录。

这一决定只放宽 M 项的证据形式，不改变任何行为契约、不放宽已有证据可判项的判据，也不豁免其他缺口。

## 数据模型与契约

### 共享契约修订（D-01）

以下为起草时的候选与规则，定稿见 [D-01 定稿](#d-01-定稿08)。只增补有实际消费者的只读事实。每项须在依赖它的实现前定稿封闭类型、单位、写入/复位点、来源、边界与错误，并按 P3-02/P3-03/P3-04 的契约规则同步；不能以本表中“候选”作为任意扩展授权。原版记录指针/运行期地址不能原样传给渲染器执行。

| 候选事实 | 类型、单位与语义 | 权威所有者 | 输入/输出边界与版本 |
|---|---|---|---|
| 仪表及绘制调度内容（slot 0、2、7） | 计划新增有版本的 `content/hud/` data payload：slot/layout 身份、按源次序的 `{ type, rectangle, redrawInterval }` 与 Q-01 确认的有限静态参数；元素按已有 image Asset ID 关联 `pass: 0 \| 1`、`everyFrame: boolean`。不导入 last-draw 等可变计时，也不调用原版指针 | `original-data/conversion` → `content/hud/` | 优先独立补充元数据，不为 slot 7（无图像、有类型 8）制造违反 `LayoutPayload` 最少一个元素要求的空布局。slot 2 几何与既有 `map-geometry` 同源且逐字段一致；不建立两个可独立漂移的主地图定义 |
| 帧后同 tick projection（必需） | `TickOutput` 增加 `readonly projection: Projection`，与同项 `tick`、`clock`、`render` 一致；保留 `#tick` 已取得的对象引用，不在帧后从世界重算 | `app/runtime/game-runtime.ts`；Session 原序转交 | 每帧最多 `MAX_TICKS_PER_FRAME` 项（当前 5），0 tick 空数组，过场截断/结束与容量停止只交成功前缀；Core/读模型失败不交不完整批次。先完成模拟和 Event Bus，再交帧消费者；不增加 tick 中途回调或更改两帧插值契约 |
| 状态显示的 Core 闪烁相位（必需） | 从 `PlayerState.statusDisplay.blink` 输出 `0 \| 1` 的只读字段，精确落点在 D-01 定稿；只有证明确有读者才输出额外 due/序号 | `systems/displays.ts` 仍唯一写入；`projections/combat.ts` 输出 | 只读增补，不保存到第二套呈现相位；覆盖切页、受损、视角切换与救援 |
| 地图标签的威胁闪烁 | `MapLabel` 增加实体的威胁时间戳（`communications.threatStamp`，原版对象 +0x17C，任务时钟单位，无则 null），即 MW-11 的修订（RX7） | Core 的 `map` 分区 | projection 增补，不改变规则或事件；按 P3-02 的规则判断是否递增版本（P3-14 的 FA-08 先例：只增 projection 不递增） |
| 雷达的相机平面偏移 | 玩家状态 +0xA0/+0xA4/+0xA8 的语义与单位；若为常量或可由已有状态推导则撤销 | Core 的玩家状态 → `flight.combat.player.radar` | 同上 |
| F1 叠加所需的运动事实 | 例如第三行角速率（`0x21cf8`，P3-06 留给 P3-12/P3-13 决定）或目标速度向量；只在 Q-10 确认绘制读取它们时加入 | Core 的 `flight.motion`/`flight.combat` | 同上 |
| 速度仪表与目标显示输入（必核对） | 玩家机型/种类或满刻度引用（速度用 `atB8`，指令速度按实参）；T7 的目标 +0x06 变体事实、模型引用、机型读数与目标放置序号等，仅保留 Q-03/Q-08/Q-10 需要的部分 | Core projection + 运行绑定的 craft/model 内容 | 不能以动态最高速度冒充内容基准、从不可见世界集合猜目标模型或遗漏非默认变体。相机/显示计算仍在 render；源引用失效明确失败 |
| 通讯提示与 G-03（复用） | `incoming-started` 的身份、说话者快照与序号驱动单次摘要；当前 `IncomingView` 驱动持续页 5；不从 `radio-queued` 提前展示 | Core 现有事件/读模型；应用注入项目文案 | 不新增 CMOV 台词导入，未知摘要映射按生产反馈处理；若 Q-09 发现现有事件缺少一次性显示必要事实，须先定稿事件快照与版本，不靠帧末猜测 |

- **不新增到 Core 的内容：** 消息队列、纯外观闪烁/打字、重绘缓存、SNIP、噪点、距离标签开关与指针。已经在 Core 的 `statusDisplay.blink`、字段 1/5/8、警告门禁仍归 Core，不迁出或重复。
- **限值与校验：** D-01 在分配前固定内容字节/记录/图像引用上限、总 CPU 图像缓存、消息条数及总文字字节、轨迹长度、逐 tick 提示数与 GPU 计划；沿用已证实的上限或按切片最大值加有依据余量，不留“实现时随便取值”。输入越界、类型未支持、重复/缺失引用、溢出及分配失败给稳定错误；雷达 120 项的已批准截断单独列明，不与一般预算错误混同。原版 DIAG 的越界读取不复现为任意内容访问。
- **导入全链：** 若新增角色/payload，同步唯一切片定义、schema 校验与 `validatePackage`、生产源映射、Worker 分阶段读取/预算、缓存资格、合成包、查看器/本地核对工具；按实际不兼容性递增版本。不升级无关协议，也不只补编码器而遗漏包校验或缓存恢复。
- **同步位置：** P3-02、P3-03、P3-04、P3-05（右键/ready 握手）及 P3-09（MW-11/零能量显示）；P3-14 的 FA-01 与 D-02 按接口汇合。当前审阅只改本 spec，不替上述合同记录批准。

#### D-01 定稿（08）

2026-10-28 由子任务 08 依 01–07 的完成证据（尤其 [07 的 D-01 候选汇总](./subtasks/07-evidence-contract-baseline.md#完成证据)）定稿上表全部候选，按 P3-02 的扩展规则与 P3-03、P3-04 的契约规则同步。**唯一定义的位置：** Core 的状态、projection 形状与版本只在 [P3-02 的 CK-01 至 CK-07](../02/spec.md#p3-13-的契约修订d-01)；Runtime 批次只在 [P3-04 的同 tick projection](../04/spec.md#帧后同-tick-projectionp3-13-的修订)；导入的角色、版本与缓存只在 [P3-03 的修订 4](../03/spec.md#p3-13-的修订仪表调度内容修订-4)；P3-05、P3-09、P3-10 各有一段同步并链接回本节。本节的 DC-01 至 DC-13 是其余各项的唯一定义，编号只供引用本节。起草时的候选表与其后各条保留为批准方向的记录，与本节不一致处以本节为准。

**批准状态：** 见[审批](#审批)的 2026-10-28 条。

##### DC-01 定稿索引

| 候选 | 定稿 | 唯一定义 | 实现 |
|---|---|---|---|
| 仪表及绘制调度内容 | 新 data 角色 `cockpit-instruments`，Asset `data/hud/instruments` | DC-02；导入在 P3-03 修订 4 | 10、11 |
| 帧后同 tick projection | `TickOutput.projection` | P3-04；消费见 DC-03、DC-04 | 13 |
| 状态显示的闪烁相位与写入标记 | `CombatPlayer.statusDisplay { blink, rebuilds }`；Core 的写入次序照原版更正（`RULES_VERSION` 9 → 10） | CK-01、CK-03；消费见 DC-06 | 12 |
| 能量页重画（+0x44） | `CombatPlayer.energyPageRedraws`（新增持久计数） | CK-02、CK-03；DC-06 | 12 |
| 速度仪表满刻度 | `MotionPlayer.recordMaximumSpeed`（与 P3-14 FA-03 同名同义） | CK-03 | 12 |
| 目标显示输入 | `CombatTarget.model`、`craftAt08`；+0x06 变体撤销；观察距离表随 `data/hud/instruments` 导入，其余为具名代码常量 | CK-03、CK-04；DC-02、DC-10 | 12；10、11、20 |
| F1 叠加的运动事实 | `MotionPlayer.indicatorRates`、`WeaponListReading.ballistics`；秒钟、后平面、放置序号撤销 | CK-03、CK-04；DC-10 | 12 |
| 雷达 | `RadarContact.position`；相机平面偏移撤销 | CK-03、CK-04 | 12 |
| 地图标签威胁、网格与指针框 | `MapLabel.threatened`、`MapOpen.geometry.sectors`、`zoomExtent` | CK-03；DC-09 | 12 |
| 通讯提示与 G-03 | 复用现有事件，不新增 Core 事实；参数、阶段与预算 | DC-07 | 18、25 |
| 表现输入、缓冲、随机源与预算 | 封闭输入、两张索引面、具名派生流、上限表 | DC-04、DC-05、DC-08 | 14 起 |
| 右键、ready、零能量、无图标代价文字 | 呈现状态与凭证 | DC-09 | 22、23 |
| 原版不同处 | Δ-04 至 Δ-09 | DC-11 | 各实现项 |

##### DC-02 仪表调度内容 `data/hud/instruments`

```ts
// src/content/hud/instruments-payload.ts：schema 1（COCKPIT_INSTRUMENTS_SCHEMA_VERSION），与 map-geometry 相同的规范 ASCII JSON
type InstrumentType = 0 | 1 | 2 | 3 | 5 | 6 | 7 | 8 | 9 | 10 | 12;
interface InclusiveRectangle { readonly x0: number; readonly y0: number; readonly x1: number; readonly y1: number }
interface InstrumentRecord {
  readonly type: InstrumentType;           // 记录 +0x00
  readonly rectangle: InclusiveRectangle;  // +0x04–+0x10，逻辑像素，含端点
  readonly redrawInterval: number;         // +0x18，u32，时钟单位
  readonly drawParam: number;              // +0x14 原值（类型 0–3 的条色索引）
  readonly params: readonly number[];      // +0x24 参数表，项数为 +0x28，0–4 个 i32
}
interface ElementSchedule {
  readonly image: AssetId;                 // 与同槽布局同下标元素的图像相同
  readonly pass: 0 | 1;                    // 元素 +44
  readonly everyFrame: boolean;            // 元素 +48 ≠ 0；false 时只在全量重绘时绘制
}
interface InstrumentSlot {
  readonly slot: 0 | 2 | 7;                // CCKD 10103 的目录下标
  readonly layoutNumber: 0 | 6 | 8;        // 目录 +0x00
  readonly alwaysRedraw: boolean;          // 目录 +0x0C ≠ 0
  readonly layout: AssetId | null;         // 'layout/cockpit/front'、'layout/map/frame'、null
  readonly elements: readonly ElementSchedule[];
  readonly instruments: readonly InstrumentRecord[]; // 源次序
}
interface CockpitInstruments {
  readonly slots: readonly [InstrumentSlot, InstrumentSlot, InstrumentSlot]; // 依次为 slot 0、2、7
  readonly targetViewDistances: readonly number[]; // 右显示屏的观察距离表（EXE 数据 0x175424，T7），恰 20 个有限 f32，按种类位号
}
// COCKPIT_INSTRUMENTS_ROLE = 'cockpit-instruments'
// COCKPIT_INSTRUMENTS_LIMITS = { payloadBytes: 8_192, recordsPerSlot: 32, params: 4 }
```

**读取器 `readCockpitInstruments`**：严格读取，结果冻结并与输入隔离；字段恰为上述字段，错误为 `invalid-flight-data-payload`，诊断只含结构路径与原因：

1. 三项依次为 (slot 0, 布局号 0, `layout/cockpit/front`, `alwaysRedraw` false)、(2, 6, `layout/map/frame`, false)、(7, 8, null, true)。其他组合不在切片的绘制支持范围内。
2. 每槽的类型集合恰为：slot 0 {0, 1, 2, 3, 5, 6, 7, 8, 9, 12} 各一条；slot 2 {10, 8}；slot 7 {8}（[cockpit 的槽内仪表类型](../../../original/formats/cockpit.md#instrument-types-per-slot-confirmed-p3-0730)）。次序按源保留，不排序；类型 4、11 与其他值拒绝。
3. 矩形为整数，0 ≤ x0 ≤ x1 ≤ 639，0 ≤ y0 ≤ y1 ≤ 479；`redrawInterval` 为 u32。
4. `drawParam`：类型 0–3 为 0–255，其他类型为 0。`params`：类型 0–3 为 0 或 1 项（异形条模式 m，任意 i32，非 0–2 按 3 处理，[hud §4.2](../../../original/formats/hud.md#42-corner-gauges-types-04)）；类型 9 恰为 4 项，构成两个含端点 x 范围 [p0, p1]、[p2, p3]，均在矩形的 [x0, x1] 内且 p0 ≤ p1、p2 ≤ p3；其他类型为空。
5. `targetViewDistances` 恰为 20 个有限 f32（按存储保留，不排序、不钳位；只有可作目标的种类的项被读取）。
6. `layout` 非 null 时 `elements` 为 1–16 项、图像两两不同；`layout` 为 null 时为空。遍 1 且 `everyFrame` 为 false 的元素拒绝：原版在全量重绘以外也会把它未画的区域送屏（[cockpit 元素 +44/+48](../../../original/formats/cockpit.md#instrument-records-scheduling-and-visible-persistence-p3-1301)），随附数据没有这种元素。

**跨 Asset 核对 `checkCockpitInstruments(instruments, { front, mapFrame, mapGeometry })`**（同一模块导出）：每槽 `elements` 与对应 `LayoutPayload.elements` 等长且同下标图像相同；slot 2 的类型 10 记录的 `rectangle` 与 `redrawInterval` 与 `data/hud/map-geometry` 逐字段相同。转换测试与应用的 HUD 内容准备都调用它；后者在任何 GPU 分配之前以内容契约错误拒绝开始。

- **不导入：** 记录 +0x1C、+0x20、+0x2C、任何指针与运行期计时。上次绘制时刻由表现模型按运行持有，全量重绘（视角切换的选组）时置为该次的时钟样本（cockpit 的“Full redraw”）。
- **到期：** 记录在 `alwaysRedraw`、全量重绘、`redrawInterval` = 0 或 (时钟 − 上次) 按 u32 严格大于间隔时调用，调用即记上次 := 时钟。
- **版本与缓存：** 切片定义 6 → 7，图形组件 `graphics-5` → `graphics-6`，旧缓存须重新导入（P3-03 修订 4）。`LayoutPayload` 不变。

##### DC-03 同 tick projection 的消费

逐 tick 推进的驾驶舱与地图表现只读每项 `TickOutput.projection`（P3-04），不以 `projection()` 的帧末值代替中间 tick；显示帧只合成已推进的状态。帧消费者不保存 `outputs`，只保存派生状态。

##### DC-04 驾驶舱表现的输入与推进

```ts
interface CockpitTick {
  readonly output: TickOutput;          // P3-04：tick、clock、render、projection、events
  readonly camera: PresentationCamera;  // P3-12 同 tick 的 afterStep（P3-02 FS-07）
  readonly mapRightButton: boolean;     // 该 tick 适用的主地图右键电平（DC-09）
}
interface CockpitAdvance {
  readonly ownerId: number;
  readonly runId: number;
  readonly ticks: readonly CockpitTick[]; // 0 至 MAX_TICKS_PER_FRAME 项
}
```

- **整批校验（任何状态变化与抽取之前，失败为 `invalid-input`，模型不变、消费者故障）：** owner/run 相符；项数 ≤ 5；首项为上次已处理 tick + 1（新运行为 tick 0 + 1）且连续；每项 `output.tick` = `render.tick` = `projection.clock.tick` = `camera.tick`，`clock` 同理，相邻项时钟差为 `clockUnitsPerTick`；`flight.motion`、`flight.combat`、`map`、`communications` 为 ready（`not-implemented` 是契约错误）。
- **帧内次序：** 先以本帧全部 tick 推进 P3-12 的表现模块，再按 tick 升序推进驾驶舱模型；类型 9 与锁定视觉直接读同 tick projection 中的 Core 字段（锁定进度、目标有效性、两项警告标志），闪烁与相位由本任务的绘制时钟推进；没有共享提示模型（[D-02 定稿](#d-02-定稿09)）。
- **每个 tick 内：** ① 按事件原次序处理“绘制前”阶段的事件（DC-07 的消息来源、速度辅助闪烁的启动、`view-switched` 的选组与全量重绘、`target-cleared` 的离开提示）；② 地图的读取调用（DC-09 第 1、2 步，适用时），必在调度之前；③ 按当前视角所选槽执行一次逻辑调度：全局回调（消息过期、类型 12 的灯状态），遍 0 元素，记录按源次序到期执行（地图记录内先做 DC-09 第 3 步的绘制调用），遍 1 元素，清全量重绘；④ 处理“绘制后”阶段的事件（`incoming-started` 入队）。静止帧、重画、GPU 恢复与查询都不推进、不抽取。
- **随机源：** 驾驶舱表现流的种子由本运行同一宿主种子 s 派生：对 s 的 4 字节小端与 ASCII 标签 `cockpit-presentation` 依次取 FNV-1a 32 位，得到 `RandStream` 的种子；不抽取 Core 或 P3-12 的流。抽取点与次数只按 Q-13 的清单，在实际调度到的处理例程中发生（[Q-13 汇总](#研究结论索引07)）。

##### DC-05 表现缓冲与可见保留

本项目照原版的复制规则维护两张 640×480 索引面（这是原版行为，不是差异）：

- **后备面 B**（原版帧缓冲）：各处理例程、元素与 F1 叠加画在这里；在视角 0xC、1 与 0x11 的世界行（0xC/1 为 0–315，0x11 为 0–479）另带覆盖掩码，只有被二维图元覆盖的像素盖在世界之上，其余显出 P3-12 的世界。
- **送屏面 S**（原版显存）：只经原版的复制改变：各类型的复制区、元素的送屏、全量重绘时的元素，以及每帧末的复制（0xC/1 只复制 B 的 0–315 行，8 与 0x11 复制整屏）。驾驶舱层每个显示帧按当前调色板绘制 S 的驾驶舱带（或整屏）与 B 中被覆盖的世界行像素，再经 P3-12 的屏幕阶段闪光。
- **按视角：** 0xC：B 的驾驶舱带从不清除；1（Warp）：每次逻辑调度前 B 整体填 0，复制区内处理例程未写的像素以 0 送出；8：每次调度前 B 填 0、整屏送出、没有保留；0x11/8：常重绘，整屏送出，标签框每帧先填 0。视角切换（含 F1 → Warp）的选组把 B 与 S 都填 0 并置全量重绘（[cockpit 的每视角规则](../../../original/formats/cockpit.md#instrument-records-scheduling-and-visible-persistence-p3-1301)）。
- **叠加标记：** `0x456e4`/`0x45de0` 以 639 × 479 判界，标记可以写进 B 的第 316–478 行；它们留在 B 中，只有之后某个复制区覆盖时才显现，照原版复现，不裁到视口（[hud §4.6](../../../original/formats/hud.md#46-flight-view-overlay-0x45de0-and-view-label)）。
- 这一模型取代起草时“每个仪表保留自己的画面”的写法；与逐帧合成的外观等价性为高概率，两帧保留序列的证据（07 的 M-5）只在要宣称“保留外观一致”时才需要。

##### DC-06 状态页与能量页的重组

- **页 0：** 表现模型保留 96 × 100 的状态离屏图，只在 `statusDisplay.rebuilds` 与上次消费的值不同时重组：护盾比例与字段 0–8 取同一 tick 的 projection，相位取写入时的相位，即**上一 tick** 的 `statusDisplay.blink`（首个 tick 取 tick 0 的 projection）——CK-01 先写后翻转，同 tick 翻转时帧末的 `blink` 已是新相位；重组、任一行到期或强制时复制到 B（[hud §4.4](../../../original/formats/hud.md#44-left-display-type-6)）。闪烁相位只用 Core 的 `blink`（按上述取值），不另建相位。
- **页 1：** 在 `energyPageRedraws` 与上次绘制页 1 时消费的值不同、强制，或视角与上次绘制时不同（初始为“没有上次”）时重画。
- 两个计数在新运行中由 Core 从 0 开始；表现模型的“上次消费值”初始为“没有”，所以首次进入该页总会绘制，与原版实例化后 +0xF0、+0x44 已置位一致。

##### DC-07 消息行与 G-03 摘要

- **来源与参数**（[hud §4.7](../../../original/formats/hud.md#47-message-line-type-8)，阶段与清队首规则见本 spec 的消息行一节）：完成与信标 0x0C/模式 1/0x280、0x3C0；速度辅助开关 0x0F/模式 2/0x140；`incoming-started` 的 G-03 项目摘要**颜色 8、模式 1、未显示过期 0x200、宽度 8 × 字节数**，在本 tick 绘制之后入队。
- **队列：** 每运行一条，至多 64 项；每项文字 ≤ 128 字节（`FLIGHT_MESSAGES_LIMITS.textBytes`），总文字因此 ≤ 8 KiB。满时丢弃**新**项并把诊断计数 `messageDrops` 加 1，不抛错（Δ-05）。首次显示用显式“未显示”而不是 0；dt 与偏移按 u32 运算。
- **G-03 文案（25）：** 每条摘要与“项目摘要未覆盖”文字至多 58 字节，只用 0x20–0x7E、不含 0x7B，且每个字节都在 fonts/0 的字符映射内；应用装配时在运行开始前核对，违反为项目文案契约错误、拒绝开始。页 5 的短标注占原版 96 × 96 的帧图像区，至多 2 行、每行 ≤ 16 字节（fonts/1 步进 6），完整摘要只在消息行与基地页。
- **基地页（G-05）：** 应用把同一模型的队首与当前来电摘要桥接给基地页，队首变化立即发布；不建第二条队列、计时器或重播（P3-10 的同步）。
- **被毁视角：** 消息队列在视角 0x11/8 中是否可能非空，由 18 以 Core 的事件序列核实；不可达时只做合成测试。

##### DC-08 限值与预算

全部在分配或推进之前核对；一般超限为结构化的 `presentation-capacity` 消费者故障，测试覆盖 limit 与 limit + 1。雷达与消息行的截断按各自政策，不是一般故障。

| 项 | 上限 | 依据 | 超出时 |
|---|---|---|---|
| 消息行队列 | 64 项；每项 ≤ 128 字节；总文字 ≤ 8 KiB | 原版无条数上限（只在分配失败时丢新项）；64 远高于正常积压（来电约 57 tick 一条），只有连按 Ctrl+Enter 才会溢出 | 丢新项，`messageDrops` 加 1（Δ-05） |
| G-03 摘要 | ≤ 58 字节，0x20–0x7E，无 0x7B | 原版来电文字最长 58 字节，消息行节奏落在原版范围内（05） | 开始前拒绝 |
| Warp 轨迹历史 | 94 个 0–50 的整数 | 原版参数块 +0x4C | 原版左移，不是错误 |
| DIAG 格式 | 每条在最大实参下的结果 ≤ 79 字节；转换只允许 `%d`、`%%`、`%s`，且每条格式的转换个数与本地数据相同（格式 0、1 各一个 `%d` 与一个 `%%`，2 一个 `%s`，3 一个 `%d`，下行 EXE 格式两个 `%s`） | 原版 80 字节栈缓冲（03）；读取器不变，驾驶舱内容准备时核对 | 开始前内容契约错误 |
| 雷达条目 | 120 | P3-02 CR-11 差异 7 | 真实点与目标框沿用 Core 的上限；噪点与假框只在总数 < 120 时保留，随机数仍按原版逐项消费（每个噪点 5 次、假框 1 次），超出的条目计入诊断 `radarNoiseDropped`，不抛错 |
| 左显示屏页表 | 7 项 | 格式规则 | — |
| 地图放大窗口错开 | 每项 10,000 次比较 | 原版规则 | 照原版停止 |
| 每批输入 | ≤ `MAX_TICKS_PER_FRAME` 项，每项事件 ≤ `eventsPerTick` | P3-04、P3-02 | `invalid-input` |
| CPU 解码图像缓存 | ≤ 2²⁰ 个索引像素 | 组份额 655,360 像素（P2-07 已批准的上界）加 TEX 11089 的 9,216 像素，余量 ≥ 1.5 倍后取 2 的幂 | 分配前故障 |
| CPU 绘制面 | B、S 各 640 × 480 字节，覆盖掩码 640 × 480 位以内；状态离屏图 96 × 100；右显示屏私有设备 100 × 100（D-01 修订，20） | DC-05 | 固定 |
| GPU 计划 | 纹素 ≤ 2¹⁹；渲染目标 0；顶点与索引 0（D-01 修订，20：右显示屏在 CPU 上光栅化） | 驾驶舱面 307,200 + 两张调色板 512 + TEX 11089 9,216 = 316,928，余量 ≥ 1.25 倍后取 2 的幂仍为 2¹⁹（24 实施：调色板与 TEX 11089 都在 CPU 上解析，实际只上传驾驶舱面 307,200 纹素）；并入运行计划后仍受 `FLIGHT_GPU_LIMITS`（现有两层用 2 个渲染目标） | 分配前 `render-capacity` |

##### DC-09 地图呈现与输入

- **右键双调用（原版 `0x2b9bc`，[地图鼠标](../../../original/formats/executable.md#map-mouse-input-p3-0503)）：** 表现状态为开关 `labelsOn`、有符号计数 `debounce` 与读取到期 `readDue`，都随运行建立（false、0、0），救援保留，新运行与重试重建（原版只在任务建立时清计数）。每个 tick t：
  1. **打开：** t 结束时为视角 8 而 t − 1 不是：`labelsOn` := false，`readDue` := t 的时钟；计数不清。
  2. **读取调用：** t − 1 结束时为视角 8（含关图与从地图开始 Warp 的 tick；后者是否读取未单独核实，按关图规则处理，只影响带入的计数，不可见）且 t 的时钟按 u32 严格大于 `readDue` 时：`readDue` := 时钟 + 6；若 `mapRightButton` 为按下且 `debounce` ≤ 0，`labelsOn` 取反、`debounce` := 20；然后 `debounce` > 0 时减 1。
  3. **绘制调用：** t 结束时为视角 8：按钮为 0 的调用，`debounce` > 0 时减 1；随后绘制地图。

  每 tick 2 单位时读取每 4 tick 一次，按住时每 16 tick 翻转一次；带入计数 c 时首次翻转在第 ⌈(c − 1)/5⌉ + 1 次读取（06）。`mapRightButton` 由 23 按 P3-05 的资格给出：同一批中各 tick 取本批处理时的电平，失去资格即为未按；测试以带 tick 的电平序列驱动，不同帧分组结果相同。
- **ready 凭证：** 地图层在当前 owner、run、地图打开序号与几何代际下实际提交含原版指针外观的画面后，才更新凭证；`MapInput` 的生产 `cursor().draw()` 只读这个凭证（P3-05 的同步）。首帧绘制不等待输入资格；失去布局、设备或画布绑定时立即撤销。
- **几何：** 生产 `MapInputGeometry` 来自同一 `data/hud/map-geometry`，含端点矩形的右/下边界为末列/末行 + 1；`frame` 的原点就是输入区（Pointer Lock 目标）的边框盒左上，与采样原点相同（06 的几何表）。
- **读数与绘制：** 网格用 `geometry.sectors`；指针框用 `zoomExtent` × 每单位像素；标签在 `threatened` 时按当帧时钟第 5 位在 0xA/0xF 间闪烁；放大窗口错开按 [hud §4.9](../../../original/formats/hud.md#49-strategic-map-type-10) 由本任务计算。
- **代价文字：** 只在玩家有地图图标（`contacts` 中有 `class: 'player'` 的项）时画光标与目的地的代价文字（原版）；连线仍按 MW-11 的项目规则。`percent: null` 时在原版同一锚点与翻转规则下画项目短标记 `MAP_COST_UNAVAILABLE`（由 25 定义在 `slice-gaps-copy.ts`，1–5 个 ASCII 字节、在 fonts/1 的映射内，标为项目提示，经应用装配传入），颜色按 c ≥ E 判档：E = 0 时光标与目的地都取 0xA（Δ-06）。
- **零满刻度：** 信息行的 `maximum` 为 0 时为消费者故障（随附数据不可达）；能量页满刻度 0 而值 < 0（D10，不可达）同样处理，不输出 NaN、Infinity 或任意 0。
- **连线退化：** 玩家与光标同列或同行且玩家在主地图外时，以含端点主地图盒的精确线段裁剪代替原版的 x87 除零（Δ-07）。

##### DC-10 F1 叠加与右显示屏

- **位姿：** 目标框、提前量、锁定环与偏心指针用同 tick projection 的目标位姿与 `camera`（`afterStep`）计算，不插值；原版也读当前位姿、不插值，所以不需要目标的放置序号。
- **右显示屏：** 模型取 `CombatTarget.model` 的列表 0 网格，机型读数取 `craftAt08`，观察距离取 DC-02 导入的 `targetViewDistances[kindBit]`；不从 Render State 的可见集合补目标。其余常量（设备 100 × 100、投影中心 (50.0, 50.0)、后平面 900、护盾阈值 0.25 与三种模型色、TEX 11089 的 96/100 拉伸、文字位置）是 [hud §4.5](../../../original/formats/hud.md#45-right-display-type-7) 已记录的代码常量，按技术决定 6 在 render 中以具名常量重实现，不导入。
- **武器与速率：** 武器行与提前量读 `ballistics`；角速率指示读 `indicatorRates`，按秒平滑所用的秒钟由任务时钟导出（取整由 21 核对并写入 hud §4.6 后实现）。
- **速度辅助闪烁：** 由 `speed-assist-toggled`（`enabled` 为真）、`speed-assist-released` 与 `origin: 'assist'` 且 `speedDifferenceExceeded` 的 `speed-matched` 启动，各只在计数为 0 时；匹配写入失败的分支不启动（Δ-08）。
- **自动驾驶“关”提示：** 自动驾驶标志恒为关（G-09），但原版 `0x45420` 复位时把“上一标志”置 1，其后第一次叠加调用显示“关”提示。本任务照原版复现；复位点由 21 写入 [hud §4.6](../../../original/formats/hud.md#46-flight-view-overlay-0x45de0-and-view-label)。**D-01 修订（21，2026-10-28）：** 原版复位只在程序启动与每次切入视角 6 时发生（HI 下离开视角 6 不复位），飞行开始不复位；复位后的“关”提示只显示一次叠加调用。04 引用的 29 张截图中的文字来自 `a` 键路径（`0x27ee4`），不是复位。本项目每个运行开始时复位，归 Δ-04（原版状态跨任务保留）。这不是自动驾驶功能，G-09 不变。
- **SNIP：** 左显示屏与右显示屏共用一个“上次帧”，两屏同时干扰时可能互相跳过更新，照原版复现。

##### DC-11 已批准差异

| 编号 | 原版 | 本项目 | 理由与范围 |
|---|---|---|---|
| Δ-04 | 显示的计时、相位与标记都是静态初值，跨任务保留（角落仪表与雷达的到期/相位、类型 9 的闪烁与“已显示”标记、DIAG 循环索引、SNIP 页表、能量页的上次视角，以及 Core 的状态显示相位、标志与到期，CK-01） | 每个运行从初值开始 | 原版的保留取决于同一程序中先前任务的历史，与所选任务无关、不可复现；影响限于每个运行开头的相位与类型 9 跨任务的黑条（任务内照常出现） |
| Δ-05 | 消息队列没有条数上限，只在分配失败时静默丢新项 | 至多 64 项，满时丢新项并计数 | 有界内存；正常游玩不可达，只有连按速度辅助才会触发；丢的仍是新项，与原版唯一的“满”行为相同方向 |
| Δ-06 | E = 0 时地图代价触发 x87 异常（预实验显示 1） | 同锚点画项目短标记，颜色按 c ≥ E 判档 | 扩展 P3-02 MW-12 差异 4 的显示；不把异常结果当作百分比，也不落入“低消耗”颜色 |
| Δ-07 | 连线退化时 x87 除零，后果未确认 | 精确线段裁剪 | 原版后果未知且不可安全复现；玩家可飞出世界矩形，可达 |
| Δ-08 | 速度辅助在匹配写入失败（目标或玩家没有移动块）时，若速度差 > 10 仍启动 HUD 闪烁 | 不启动 | Core 只在写入成功时发 `speed-matched`；该分支需要种类 0x380 的目标没有移动块，可达性未确认；为纯外观闪烁新增 Core 事件会改动比较器与 P3-14 的事件分类。若 18 或 21 证明可达，另行修订（补事件并递增版本） |
| Δ-09 | 右键是每次地图读取时取样的当前电平（INT 33h 03h），暂停、失焦后仍按住即继续计入 | 暂停、隐藏、失焦、解锁、离开无锁回退区、离图与换运行都把电平清为“未按”，恢复后须新按下 | 浏览器在这些状态下不再可靠地报告按钮释放；沿用本 spec 右键一条与 P3-05 对左键的同类处理，影响限于距离标签开关的翻转时刻 |

照原版复现、不列为差异：状态显示的写入次序（CK-01）、自动驾驶“关”提示、SNIP 共用上次帧、叠加标记写入第 316–478 行、类型 9 的黑条（同一运行内）、无图标时不画代价文字。Δ-01、Δ-03 不变。

##### DC-12 撤销的候选

Core 侧见 [CK-04](../02/spec.md#ck-04-不新增的事实可推导性)（相机平面偏移、+0x06 变体、秒钟、后平面、放置序号、威胁时间戳数值、页 6 序号、速度辅助失败事件）。表现侧：偏心指针的方向缓存属本任务的雷达模型（失败保留、子系统 12 = 2 时冻结，叠加读上一 tick 的值，04）；类型 9 的闪烁时钟属本任务的绘制（07）；仪表记录的上次绘制时刻属表现模型（DC-02）。

##### DC-13 关卡项与交接

- **G-03 缺口（关卡项）：** Core 在切片中可达的 20985 序号里有 15 个返回 `unidentified`：0–2、3–4、0xB–0xD、0xE–0xF、0x10–0x11、0x12、0x14、0x15（僚机命令答复，05）。由 25 补齐摘要并把现有 5 条超过 58 字节的摘要缩短；序号 5–6 只由类型 7（击毁）发出，改作“击毁”须先经 P3-08 确认。补齐前 AC-11 不能通过。
- **核对后再实现：** 12 以只读静态分析补核 CK-02 各写入点的分支与 `indicatorRates.row3` 两个分支都不成立时的返回值，写入原版文档后实现；21 补核 `0x45420` 的复位点与秒钟取整后实现。未核实前不以推测值实现。
- **交接：** 10、11 实现 DC-02（含 EXE 的观察距离表）与 P3-03 修订 4（11 同时把 TEX 11089 的源码证据改为新锚点与已确认）；12 实现 CK-01 至 CK-05；13 实现 P3-04 的同 tick projection；14 实现 DC-04、DC-05 与 DC-08 的框架；16–21 按各自元素消费 CK-03 与 DC-06、DC-07、DC-10；22、23 实现 DC-09；25 实现 DC-07 的文案、基地桥接与 `MAP_COST_UNAVAILABLE`。

### 内容输入与校验

| 实际类型位置 | 消费要求 |
|---|---|
| [layout-payload.ts](../../../../src/content/graphics/layout-payload.ts) | 元素按次序、坐标为逻辑像素；D-01 以补充调度元数据关联绘制遍/重绘标志，不假装当前 LayoutElement 已有这些字段 |
| [image-payload.ts](../../../../src/content/graphics/image-payload.ts)、[palette-payload.ts](../../../../src/content/graphics/palette-payload.ts) | 保留索引与掩码；palette 已是 8 位 RGB，不二次扩展；共享的 typed array 只读，不原地改调色板实施闪光 |
| [font-payload.ts](../../../../src/content/graphics/font-payload.ts) 的 `FontPayload` 与 `glyphFor`/`glyphsFor` | `glyphRows` 为字形存储步长，每行字节的 8 列位都保留；`cellWidth` 不是原版 advance。按 caller 的大写规则查 `charMap`，不借查看器的裁剪单元绘制文字 |
| [hud-text-payload.ts](../../../../src/content/hud/hud-text-payload.ts) | 只用 `HUD_TEXT_KEYS` 列出的键；格式串的转换与参数个数在运行开始前核对 |
| [status-messages-payload.ts](../../../../src/content/hud/status-messages-payload.ts)、[view-labels-payload.ts](../../../../src/content/hud/view-labels-payload.ts)、[map-geometry-payload.ts](../../../../src/content/hud/map-geometry-payload.ts) | 计时、格式与标签按原样使用；地图几何与 Core 同源 |
| `data/comm-menus`、`data/comm-messages`、`data/flight-messages`、`data/craft-info`（[content/rule-data/](../../../../src/content/rule-data/)） | 菜单项、通讯元数据/名称、飞行消息和机型名称；不把无 CMOV 台词的 `comm-messages` 当来电正文来源；引用失败明确报告 |

### 驾驶舱表现层契约（计划新增）

以下为需求形状，不是已存在 API；D-01 定稿的输入、缓冲与预算见 [DC-04、DC-05、DC-08](#d-01-定稿08)，与 P3-14 的关系见 [D-02 定稿](#d-02-定稿09)：

- **创建：** `createCockpitPresentation({ ownerId, runId, content, initial, random })`：`content` 为已核对的 HUD 内容，`initial` 为 tick 0 的 Render State 与 projection，`random` 为运行种子派生的驾驶舱表现流。
- **推进：** 读取 DC-04 的 `CockpitAdvance`（每项含同 tick 的 `TickOutput`、P3-12 相机与右键电平，D-01 修订），每项都有自己的 projection；一次性消息只从该项有序事件消费。批次的身份、连续性、时钟和形状先整体验证，失败不修改模型或抽随机数；通过后逐 tick 处理。运行中发现内容/预算不变量错误锁存失败，不在部分推进后继续。首个 tick 为 initial.tick+1，重复帧/旧运行拒绝；空批次可查询/重画但不推进。
- **查询：** 无副作用的只读视图：各仪表的重绘决定与保留画面所需的状态、左显示屏页的子状态（DIAG 行与光标、轨迹历史、SNIP 帧）、消息行的队首与偏移、F1 叠加的读数缓存与闪烁、地图的距离标签开关、锁定视觉与类型 9 的闪烁状态（D-02 定稿：不与 P3-14 共享）。重复查询不推进。
- **容量：** 消息行队列、轨迹历史与缓冲都有 D-01 固定的上界，在分配前核对；一般超限为明确错误。雷达沿用已批准的 120 项截断，保留顺序、抽取次数与诊断单列，不能把它当一般分配失败。
- **释放：** `dispose()` 幂等，之后拒绝一切使用。

### 共享提示接口要求（D-02）

共享提示模型由 P3-14/14 交付，P3-13 消费，同一运行只有一个实例；应用层负责推进，不由 `FlightLayer.passes()`、声音回调或组件挂载推进。D-02 的冻结接口必须包含：

| 面 | 必需契约 |
|---|---|
| 输入 | owner/run、递增 tick/任务时钟、同 tick projection；`lock.progress`（无量纲整数，非剩余时钟）、目标有效性、视角/子模式、FA-01 分区级警告；以实际批准的 FA-02 等读模型补必要事实，不自己遍历攻击者 |
| 可见输出 | 冻结的当前锁定/双警告指示状态，标明只在何种仪表/视角绘制；无玩家和无威胁分开；不重复 Core 的采样与雷达门禁。D-01 修订：9 型文字的闪烁、锁定环与锁定文字的相位由本任务的绘制时钟推进，不是共享输出 |
| 一次性/持续输出 | 按 tick 与序号识别的有界脉冲流、当前持续提示；同 tick 多消费者读取不重放。正进度保持不凭空重发，−1/0/正值及失效/切视角覆盖 |
| 顺序 | 逐 tick 驾驶舱数据准备 → 共享提示推进一次 → 绘制读取与 P3-14 音效映射；实际声音何时提交/丢弃历史脉冲与 P3-14 D-02 一致，不能由本 spec 单方改变已批准音频门禁 |
| 生命周期 | 隐藏/暂停/过场 0 tick 不推进；GPU 缺失、音频锁定/故障、二者任一消费者缺席不改变共享状态；恢复只读当前持续状态、不补播旧脉冲；新 run 与新开地图的复位语义分别定义 |

这解决接口依赖，不新增“P3-13/P3-14 整项互等”的依赖环。（D-02 修订：定稿见下节，不建共享状态模型，真实集成验收使用驾驶舱表现模块本身。）

#### D-02 定稿（09）

2026-10-28 由子任务 09 依 [07 交 09 的需求](./subtasks/07-evidence-contract-baseline.md#完成证据)、[hud §4.6/§4.8](../../../original/formats/hud.md#48-indicator-strip-type-9-and-warp-lamp-type-12) 与 P3-14 分支 `5a662042` 上已完成的 A-06/A-07 研究（`docs/original/formats/audio.md` 的 lock tone 与 instrument-9 warning 两节，作为证据读取，未改该分支）定稿。本节是 D-02 的唯一定义，上表“必需契约”中与本节不一致处以本节为准（D-02 修订）。

- **DD-01 不建共享状态模型：** 原版里锁定音与 9 型警告音的状态都不驱动绘制，绘制也不驱动声音：9 型警告音由每帧全局回调 `0x4edf4` 采样并管理两个声部，其采样与雷达门禁已作为规则状态归 Core（main 的 `communications.player.warnings`，P3-14 合入后为 FA-01 的 `communications.warnings`）；锁定音 `0x46ecc` 由 `0x45de0` 在一切视觉门禁之前调用、自带到期时钟；9 型文字闪烁（0x15）、锁定环与锁定文字的相位是绘制例程自己的时钟，子系统 9 的跳过与随机抽取只作用于视觉（已确认，代码；见上列来源）。因此两侧唯一共同的是**同 tick 的 Core 输入**，不需要、也不新增一个由双方共读的提示状态机。P3-13 的驾驶舱表现模型拥有全部视觉状态；P3-14 的音效消费者拥有锁定音与警告音的到期、保持与声部状态，文件位置由 P3-14 决定。双方互不导入、不代为推进、不读取对方的状态。
- **DD-02 共同输入：** 每个 `TickOutput` 项（[DC-03](#d-01-定稿08)、[P3-04](../04/spec.md#帧后同-tick-projectionp3-13-的修订)）的 `projection`：`flight.combat.player.lock`（`progress` 为 `0x2e080` 的原始无量纲整数，含 −1/0 哨兵）、玩家目标的存在与有效性（`flight.combat.target`）、当前视角与子模式，以及两项已采样的警告标志（现读 `communications.player.warnings`；合入 FA-01 后同一次合并改读 `communications.warnings`，不留别名、不双读）。没有玩家时警告保留 Core 的已采样值，不由消费者填 false。双方只读同一冻结对象，不另行采样或遍历攻击者。
- **DD-03 视觉侧（P3-13）：** 锁定视觉只在视角 0xC 的 F1 叠加中、通过子系统 9 门禁后绘制，读 DD-02 的同一 `progress`；类型 9 在其所在槽的记录调度中绘制，读两项标志；闪烁与相位按 [hud §4.6/§4.8](../../../original/formats/hud.md#48-indicator-strip-type-9-and-warp-lamp-type-12) 用驾驶舱表现模型的任务时钟推进。子系统 9 的跳过只抽驾驶舱表现随机源（Q-13）；类型 9 不抽随机。
- **DD-04 声音侧（交 P3-14 的信息）：** 锁定音的调用条件可由同一 projection 推出（原版在视角 0xC 每次调用叠加例程时、在视觉门禁之前调用，进入 Warp 时由视角切换以空目标停止），视觉被子系统 9 隐藏不停止锁定音；警告音按每帧全局回调的规则读两项标志。本任务不导出“叠加已调用”之类的派生事实，也不为声音保留脉冲流；P3-14 若需要额外事实，按其契约向 Core 读模型增补。
- **DD-05 次序与生命周期：** 每帧仍为“全部 Core tick → Event Bus → 帧消费者”；驾驶舱表现模型与音效消费者各自按 tick 升序消费同一批 `outputs`，二者之间没有次序依赖，由应用装配分别登记（24）。0 tick 帧双方都不推进；GPU 不可用、音频锁定/故障或任一消费者缺席都不改变另一侧状态；新运行各自复位（Δ-04）；隐藏后恢复只按当前状态继续，不补发旧提示。
- **DD-06 验收落点：** AC-14 用真实驾驶舱表现模块与合成 projection 序列验证锁定 −1/0/正值变化与保持、目标失效、双警告的交替闪烁、无玩家保留值与 0 tick（21、26）；不再要求 P3-14 的共享模块。P3-14 的声音消费与其 AC 由 P3-14 验证；本任务不实现、不替代。

### 持久化与兼容

- 不新增 IndexedDB、localStorage、设置或存档。驾驶舱表现状态、距离标签开关与消息行只在内存中，重试与新运行重新开始。
- D-01 若新增或修改导入 payload：递增切片定义版本、`ConverterVersion` 的 graphics 部分与受影响 payload 的 schema；旧缓存按既有规则不再恢复，须重新导入（同步[本地导入指南](../../../guides/local-import.md)）。不迁移旧缓存。
- D-01 若改变 Core 的状态、事件或比较内容：按 P3-02 相对实际集成基线递增 `RULES_VERSION`，不兼容的快照或 replay 格式同时递增；只增补 projection 时按 P3-02 的规则判断。P3-14 在分支上也会递增版本，合并时相对实际集成基线各递增一次。
- 所有验证使用隔离的合成数据，不清除用户站点数据。

## 技术决定

用户在生成和审阅时授权“其他问题都按最推荐的方案回答”，并于 2026-10-25 明确批准当前 spec。以下取舍属于本次批准范围；决定 1 的冻结变更现已通过 ADR-0019 落档，D-01/D-02 尚未形成的具体内容仍须按实施关卡处理。

1. **地图与飞行同管线（ADR-0019）。** 视角 8 的地图层读取最新 projection，在同一游戏图像中合成框架、消息行、指针与闪光，减少两套呈现接线。React 内嵌画布仍是技术上可行的替代，不宣称闪光只能如此实现。[ADR-0019](../../../decisions/ADR-0019-strategic-map-render-pipeline.md) 已同步[总计划 §5](../../master-plan.md#5-状态管理与通信约定)、P3-09 与阶段索引，仅改变地图消费归属，不改变本 spec 的规则与验收。
2. **逻辑 tick 调度，显示帧合成。** 保留**拟批准差异 Δ-01**：每成功 tick 一次逻辑显示调度，各处理器仍按自己的到期/强制门禁运行；每次处理器调用只推进一次原版计数。DIAG 的单次字符限制、提示计数、右键的输入调用和绘制调用分别验证，不把后者粗化成“每 20 tick”。这是项目固定步长取舍，不证明原版约 30 FPS 等于 32 Hz、不承诺 10% 容差或时序可见性毫无变化。真实秒/帧结论须遵守 U-021。
3. **逐 tick 保留已有 projection；撤销 Δ-02。** Runtime 本来就在每 tick 提取冻结 projection，D-01 将其引用保留到同项 `TickOutput`，不新增世界复制。这样页面、资源、来电/结束、子系统门禁与 RNG 抽取不会在合并帧时提前看到未来状态，AC-03 的不同帧分组一致性才可成立。显示时仍读帧末最新状态，不显示多个中间画面；每帧引用数受既有补跑上限约束。
4. **索引色语义、实现自由。** 二维图像/文字使用逻辑像素、索引与覆盖语义；读取已经完成 VGA 扩展的规范 8 位 palette，不二次扩展。CPU 上传或 GPU 着色器均可，最近邻及图元像素必须一致；三维目标视口按设备像素渲染。Classic HUD 不用 DOM/CSS/Canvas 2D 文字冒充位图字体，G-05 项目页仍用已有 React 组件。
5. **独立驾驶舱表现随机源。** 按 Q-13 确认的纯显示抽取使用具名派生流，遵守总计划的 Core RNG 隔离；不消耗 P3-12 流。保留**拟批准差异 Δ-03**的编号以说明与原版共享 LCG 序列不一致，具体支持集/映射按证据。不能由单次分布推导整体随机相关性不变，不能复用别的任务批准代替本任务差异披露。
6. **文字与常量的来源。** 原版文字只来自导入内容与名称引用；项目摘要与标注集中在文案模块并由应用注入。EXE 的颜色索引、坐标偏移、周期与阈值按权威原版记录独立重实现，数据文件的布局、矩形、图像与文字不硬编码。
7. **需要时补充导入。** 仪表记录（以及布局元素的绘制遍与重绘标志）若经 Q-01、Q-02 证明需要，由本任务按 P3-03 的规则补充导入（D-01），不在代码中硬编码这些来自 CCKD 的值，也不以临时资源代替。
8. **P3-14 拥有共享提示模型。** 按[共享提示接口要求](#共享提示接口要求d-02)由 P3-14 生产、P3-13 绘制、应用调度，FA-01 警告仍由 Core 采样。推荐逻辑 tick 推进，须通过双方 D-02 同步原有每帧表述及声音发放策略；未完成前不以独立假状态机验收。**D-02 修订（2026-10-28）：** 由 [D-02 定稿](#d-02-定稿09)取代：不建共享模型，双方从同 tick projection 读同一 Core 输入，视觉状态归本任务、声音状态归 P3-14。
9. **保留 G-05，不丢通讯信息。** 不复刻基地美术，但补齐基地页的当前来电与消息正文，复用同一队列，按[缺省与标注](#缺省与标注)的项目显示策略同步 P3-10/G-05 说明。删除“现有页面已经覆盖”的错误假设；不新增切片外 LO text-only 行为。
10. **原版指针外观取代项目光标。** 生产地图只显示原版的选取框、跟随标记与代价文字；P3-05 的项目十字光标只留给隔离测试入口。
11. **距离标签是输入驱动的表现状态。** 右键电平经既有输入链进入模型，输入清理、双调用计数与重开保留计数按正文；不新增 Core 命令或游戏录制字段。Core replay 不承诺重现右键 UI 状态；表现测试另给相同的带 tick 刺激序列。
12. **复用目标绘制算法，不复用错误场景假设。** Q-08 确认适用时复用 P3-12 的材料、调色板与几何 helper；目标屏幕用自己的相机、灯光、背景和深度目标，不触碰世界深度。总 GPU 计划须在分配之前计入这部分。
13. **最少 DOSBox，不自动降低验收。** 优先复用、静态分析与已有截图，必要补证集中采集；纯外观缺口也不自动通过。当前没有任何新增 P3-13 验收豁免。具体缺口只能在列明 AC、证据与恢复条件后，经用户明确处置再变更门槛。
14. **可见性按代码规则。** 雷达的投影与容量、信息行的容量、标签的取舍、计数行越界绘制等会改变可见信息的绘制规则，严格按原版实现，不因美观调整。

### 实施关卡

| 关卡 | 随本 spec 批准的方向 | 须在何时之前定稿 | 定稿与批准 |
|---|---|---|---|
| ADR（已满足） | 技术决定 1 | 本 spec 生效之前 | ADR-0019 已落档，总计划 §5、P3-09 与阶段索引已同步；不表示其他实施关卡通过 |
| Q 研究与输入闭合 | Q-01 至 Q-13 的限定问题 | 依赖该结论的实现之前 | 来源、置信度、分支/边界、规则与表现责任、可推导性及容量齐全；未确认的必需字段不得用占位、零值或任意图案实现 |
| D-01 共享契约与内容修订 | [共享契约修订](#共享契约修订d-01)的候选与规则 | 依赖它的实现之前 | 确切类型/单位/来源/消费者/上限/错误/版本闭合；同步 P3-02/03/04/05/09 的实质修订并取得适用批准 |
| D-02 与 P3-14 的共享 HUD 提示状态 | 技术决定 8 | 共享状态的实现或任一消费者接线之前 | 与 P3-14 的 D-02（P3-14/07）对齐同一接口：推进时机、输入、输出、随机源、模式门禁与运行身份；记入双方 spec 并取得明确批准。**已定稿（09，2026-10-28）：** [D-02 定稿](#d-02-定稿09)，不建共享模型；P3-14 一侧由其 D-02 采纳 |
| 对照判据 | [表现对照与判定](#表现对照与判定) | 观察本项目对应画面之前 | 每个元素的反推方法、比较像素集合与排除区域写入相应子任务 |

- 依赖某个关卡的实现与验收在该关卡定稿前不得开始；不依赖未定契约的研究与纯绘制例程可以先行。
- 研究推翻已批准的方向时，不在实现中临时改变方向，先修订并重新批准。

**关卡输入记录（07，2026-10-28）：**

- **Q 研究与输入闭合：** Q-01 至 Q-13 的结论、置信度与缺口见[研究结论索引](#研究结论索引07)；D-01 的候选输入、限值、版本候选、需批准的差异与开放问题交 08，清单在 [07 完成证据](./subtasks/07-evidence-contract-baseline.md#完成证据)。本记录不批准 D-01。
- **对照判据：** V-04/V-05 的逐元素判据已在任何候选画面之前冻结于 `local/research/p3-13/comparison-plan/criteria.md`（第 2 版，SHA-256 `be5df477…`；第 1 版在同日审阅中更正，未用于任何候选），截图身份清单为同目录的 `captures.json`（`a512c407…`），冻结时基线 `4c3c18d2` 尚无 `src/render/cockpit/`。截图的资格复核见 [cockpit R5](../../../original/formats/cockpit.md#all-qualifying-captures-p2-12)；最小缺证集 M-1 至 M-8 见 07 完成证据，均未豁免。
- **D-01 共享契约与内容修订（08，2026-10-28）：** 定稿见 [D-01 定稿](#d-01-定稿08)，上游同步见 P3-02 CK-01 至 CK-07、P3-03 修订 4、P3-04 的同 tick projection、P3-05、P3-09 与 P3-10 的同步段；批准记录见[审批](#审批)。G-03 缺口与两项核对后再实现的项是 DC-13 所列的关卡项。

## 验收标准

| ID | 可观察的通过条件 | 验证方法与所需证据 |
|---|---|---|
| AC-01 | D-01 所有项有封闭合同、来源/单位/预算/错误及批准：同 tick projection、Core 闪烁相位、速度满刻度和标签威胁事实都有生产者与消费者，目标变体等撤销项附可推导性证据（D-01 修订，DC-12）。当前版本同一输入下规则、事件顺序、世界 RNG 不因绘制改变；不支持的旧 replay/快照明确拒绝，不改版本号强行重放 | 实际 Core→Runtime→Session 合成链、快照/replay 与版本拒绝测试；同步合同审阅 |
| AC-02 | 补充导入覆盖截断、越界矩形/计数、重复/缺失引用、未知参数、预算和来源映射错误；slot 7 无图像但有类型 8 可表达，slot 2 与 `map-geometry` 一致；`validatePackage`、Worker、合成包及缓存恢复用同一版本。旧缓存拒绝后重新导入可恢复，查看器原功能不变 | Node 合成测试、隔离浏览器缓存测试；本机 `package-check`/`nob-check` 与独立结构读取核对，不在公共测试读取原版 |
| AC-03 | 同一逐 tick 输入在 1×5、5、2+0+3 帧分组下，表现状态/随机抽取相同；测试序列必须包含页面切换、子系统变化、目标离开、来电开始结束，不能只用静态 projection。0 tick/重画/恢复不推进；批次错序/不连续/跨运行在抽取前拒绝；捕获成功前缀、transition/completed 截断和读模型失败行为符合 Runtime | 扩展实际 runtime/session 的 TickOutput 测试与固定种子表现测试；纯模型无 app/ui/React/DOM/宿主时钟运行时依赖，应用接线另测 |
| AC-04 | 有无驾驶舱与地图层时，同一录制在 Node 中 replay 的事件流与周期哈希完全相同；驾驶舱从不提交命令、不写 Core 或 store，Core 的世界随机流与 P3-12 的表现流不受其影响 | Node replay 对照测试；P3-12 已有表现流测试在加入驾驶舱后仍通过 |
| AC-05 | 图像掩码、颜色键与不透明索引 0 不混同；图元/字体的逻辑索引与覆盖符合规则，字形可跨 advance 但屏幕外不越界；8 位 `PalettePayload` 不二次扩展或原地修改。以两个 palette 映射同一索引的用例区分飞行与地图色表 | Node 合成图像/字体/调色板精确像素测试，屏幕四边与含端点边界测试 |
| AC-06 | 格式转换含负数、舍入、千单位边界、零满刻度、`%%`、名称截断；未知字符/格式/引用明确反馈。原版文字来自绑定内容，G-03/零能量等项目文案有明确来源标注；没有原版台词硬编码 | Node 测试、源码审阅、本地合规检查 |
| AC-07 | 审计 P2 已用的 46 张 F1 与 10 张地图截图及 Warp 066 的适用性，形成具体 ID/哈希/状态清单。对同原生尺度和闪光条件下实际框架覆盖的静态像素，按预定掩码 0 差异；不比较裸露世界、不从失败像素临时扩大掩码 | 独立布局解码、原版像素与真实候选画面配对；缺样按 AC-22 处理，不伪造固定数量已通过 |
| AC-08 | 仪表调度：按 slot 0 的记录次序（类型 7 在 6 之前）、重绘间隔与强制条件重绘，按视角的可见保留规则（D-01 修订，DC-05）显示两次重绘之间的画面；视角 0xC、1、8、0x11/8、6 各自绘制[视角与绘制内容](#视角与绘制内容)所列的内容，F1 叠加在 Warp 中不绘制 | Node 测试（合成布局与时钟序列）；浏览器测试（合成任务包，按视角断言逻辑像素区域） |
| AC-09 | 类型 0 用机型基准、类型 1 用批准的满刻度；0/1/2/3 子系统值按各读取者规则，不全局夹到 2。雷达真实点/目标框不重筛选，噪点后总数不超过批准的 120 项；到期等号/下一 tick、Warp 停建、零方向与容量临界均有确定结果 | 世界坐标/朝向的独立投影期望、真实 Core 输出接线、固定随机边界测试；截图拟合只核对图元外观，不冒充投影证据 |
| AC-10 | 左显示屏：页 0–6 按页面序号绘制；状态页的背景与叠加图、DIAG 的打字、保持、轮换与光标；能量页的记录与三条带；菜单页的项、键、颜色、闪烁、分隔与截断；Warp 页的读数、标签与轨迹；SNIP 按子系统状态绘制与切换 | Node 测试；截图 062–065、066、068、100、129–135 的元素对照 |
| AC-11 | 页 5 以 `IncomingView.shown` 显示 G-03 短标注，完整项目摘要在 `incoming-started` 入消息行；基地页也可读同一当前摘要，不建第二队列；未知映射有生产反馈，切片可达消息无未覆盖映射 | Node 身份映射与队列测试；合成来电在 F1、Warp、基地、基地↔地图间的浏览器验证；不要求未导入的 CMOV 台词 |
| AC-12 | 右显示屏：有目标时的模型、背景与灯光，文字与格式，无目标与 Warp 离开提示的倒数，地图标记分支，子系统 14 的干扰，按 Q-08 与 T7 | Node 测试；浏览器测试（合成目标）；截图元素对照；目标信息判定须为“一致” |
| AC-13 | 入队/首次逻辑显示/过期/滚出独立；RQ5 帧尾开始最早下一次合格消息行绘制，不因合并帧提前。`radio-queued`/`radio-taken` 不入队，零时长开始结束保留一次摘要。清队首与 beacon/完成消息顺序精确，无双通道重复；跨视角/恢复/晚挂不重播；超容量按批准政策报告 | 实际有序事件与边界时钟的 Node 测试，包含绘制前/后事件的 1×5/5 分组；各布局与 G-05 浏览器核对 |
| AC-14 | 用真实驾驶舱表现模块验证锁定 −1/0/正值变化/保持、目标失效与双警告（D-02 修订：不再依赖 P3-14 的共享模型，[DD-06](#d-02-定稿09)）；无玩家时警告保留 Core 的已采样值、不被填 false；声音锁定/故障或 GPU 不可用不改变显示状态，0 tick 不重发；类型 12 读 Core Warp 灯 | 真实模块加合成输入的 Node/浏览器接线；视觉原版证据仍按 AC-22 |
| AC-15 | F1 叠加：目标框、读数（每 16 单位刷新）、武器与弹药、速度辅助闪烁、锁定提示闪烁与标记名称按 Q-10；子系统 9 为 2 时不绘制、为 1 时随机跳过；被毁视角显示子模式 8 的标签与标签框 | Node 测试；浏览器测试；截图元素对照；目标框判定须为“一致” |
| AC-16 | 地图画面：组调色板与框架（绘制遍）；覆盖圆盘与敌方圆环、单位标记、目的地标记与代价文字（三档颜色与 E = 0）、标签与连线、信息小窗（单位行受限、计数行不受限）、放大窗口图标的错开与选中方框、距离标签、面板外框与高亮、标题与读数、消息行，按 Q-11 与 `map` 分区；未就绪时不绘制接触点；按地图几何的重绘间隔重绘 | Node 测试（合成 `map` 分区）；浏览器测试；10 张地图截图的静态区域 0 差异与元素对照；可见性相关元素判定须为“一致” |
| AC-17 | 生产地图首帧先绘制后 ready，无资格死锁；含端点几何、容器偏移、黑边与缩放一致；本地指针和确认代价不错误配对。右键短按/按住、双调用计数、重开保留计数、失焦/暂停/解锁清电平；左键首次锁定不选点、重复、m 与 Esc 的既有语义不变；装饰按钮无动作 | 生产/开发浏览器合成包、真实指针输入与独立序列 Node 测试；实机只证明实际权限/锁定行为，dispatchEvent 不作 OS 拦截证据 |
| AC-18 | 单画布/上下文/循环，计入 CPU/GPU/队列预算；目标屏独立深度，地图/目标屏不清世界 Warp 深度。丢布局/上下文时撤销输入 ready、解锁并恢复系统指针；恢复先画后获资格。重试/卸载/StrictMode、迟到旧 run 回调、部分分配失败、清理失败不泄漏、不重放 | 真实模块 Node 回滚与浏览器资源平衡、上下文丢失/不可用测试；暖态计数相同，结束后本运行资源归零；生产显示结构化错误 |
| AC-19 | 屏幕闪光同样变换驾驶舱、HUD 与地图像素，不变换画面外黑边与 React 控件；窗口缩放与像素比变化不改变任何逻辑位置或文字 | 浏览器测试（合成闪光与不同视口，断言逻辑像素） |
| AC-20 | 仅移除已实现的驾驶舱/HUD/地图在制标注，P3-14 未完成时保留音效缺省；G-03/G-05 正文和占位可见。F1/Warp 有规定框架与仪表，地图有全屏布局，被毁视角只有标签/消息行而不额外画框架；允许原版应为黑的像素 | 逐区域的合成图像/DOM 断言，而非“画布存在”或“下半屏非黑”；文档与 UI 文案同步审阅 |
| AC-21 | 原版研究：Q-01 至 Q-13 都有结论与置信度，写入 `docs/original/`；U-029、U-030 的状态与剩余项更新；任何会改变规则状态的抽取已交还对应规则任务 | 文档审阅与证据来源核对 |
| AC-22 | V-04/V-05 逐元素分列规则、实现、原版外观与节奏结论，拟合图元不冒充语义映射；负对照可区分错误结果，证据/掩码/容差预先固定。必需项缺证据仍 blocked，只有具体获批处置可改变门槛；记录复用身份、新启动次数与 U-021 限制 | 子任务证据及资格清单审阅；不是本次 review 已取得这些结果 |
| AC-23 | 在私有隔离浏览器中导入真实内容，经实际规则输出核对 F1、选目标、通讯、地图选点、Warp、停靠/离港以及已确认可达的被毁标签/消息行。不能以“如果碰巧出现”删去被毁项；无法取得则记录阻塞，不用注入画面冒充真实流程 | 本地画面及输入/状态身份留 `local/`；公共 E2E 仍只用合成数据；完整成功/失败/重试联合退出仍归 P3-15 |
| AC-24 | 文档与交接：render、app、ui、core 模块说明，源码结构指南，键盘输入指南，slice-gaps，本地导入指南已同步；向 P3-14 交接共享状态接口，向 P3-15 交接联合验证项 | 文档审阅与链接、元数据检查 |
| AC-25 | 工程检查：针对性测试、`pnpm check`、浏览器回归（含网络审计）与本地合规检查通过 | 命令输出 |

## 验证策略

- **单元/契约测试：**
  - `src/render/cockpit/` 的测试（计划新增）：表现模型的推进、拒绝与释放；二维图元与字体；格式化；各仪表与地图元素的像素断言；容量与错误。以合成内容与合成 projection 构造输入，不读原版文件。
  - D-01 涉及的 Core 契约、快照与 replay 测试，导入的合成样本测试。
  - `tools/engineering-boundaries.test.ts` 覆盖 `render/cockpit/` 的导入边界。
- **Replay/一致性：** 用同一初始数据、种子与输入记录，对比有无驾驶舱层时的事件流与周期哈希；对表现模型对比不同帧分组下的状态与抽取。只宣称同一运行时内的确定性。
- **浏览器验证：** 按 [browser-testing](../../../../.agents/skills/browser-testing/SKILL.md) 使用合成任务包，扩展 `e2e/support/flight-pictures.ts` 读取 640×480 逻辑图像：
  - F1/Warp 的框架与仪表、地图布局、被毁视角的标签与消息行分别按区域断言；不以“行 316–479 非黑”替代正确性；
  - 页面切换、菜单、来电、消息行滚动、闪烁、SNIP、目标显示与雷达噪点；
  - 生产地图输入就绪、原版指针、右键开关；
  - 屏幕闪光、缩放、上下文丢失、重试与资源平衡；网络审计不变。
- **实机/原版对照：**
  - 原版证据由 agent 按[证据途径](#原版证据途径与-dosbox-x-的使用)取得：只读 Ghidra、已有截图与参考视频；计划不运行 DOSBox-X。
  - 本机真实内容画面由 agent 在自有浏览器中导入本地数据后取得，与截图作静态区域与元素对照。
  - Pointer Lock 与右键的实机核对在本机 Chrome 中由 agent 完成；若需要真实用户手势而 agent 无法提供，再请用户做最小操作，并说明原因。
- **工程检查：** 先跑受影响的测试文件（例如 `pnpm test -- src/render/cockpit`），再跑 `pnpm check` 与 E2E 回归；导入修订时加 `tools/package-check.ts`。文档修改检查链接与元数据。

## 风险与恢复

风险等级：中高。范围覆盖驾驶舱、HUD 与地图的全部画面，依赖多个已完成任务的契约，涉及一项冻结决定的 ADR、可能的导入与 Core 契约修订，并与执行中的 P3-14 共享状态。

- **架构恢复：** ADR-0019 已解除地图消费归属冲突。未来若退回 React 地图页，须另行修订 ADR、总计划和本合同，不能在实施中临时回退而仍宣称满足当前契约。
- **研究推翻假设：** 例如仪表记录需要更多字段，或 F1 叠加需要新的运动事实。按 D-01 修订并重新批准，不在实现中临时读取 Render State 或硬编码值。
- **导入修订使缓存失效：** 递增版本后旧缓存须重新导入；按既有门禁拒绝旧缓存，并在本地导入指南中说明。可通过回退提交恢复，不迁移旧数据。
- **与 P3-14 的并行：** D-02 定稿后不建共享模型，两侧各读同 tick projection（[D-02 定稿](#d-02-定稿09)）；P3-14 合入时只需按 DD-02 切换警告位置。main 未集成其 FA-01 时不能使用旧位置假装已满足新合同；集成后在已交付模块上扩展、不重新采样。版本号相对实际基线递增。
- **证据不足：** 先静态与旧样本复用，再最小补采；工具仍不能取得或必需视觉输入未确认时保持 blocked。只需用户才能完成的操作才转交用户，具体验收豁免不能由普通推荐授权自动作出。
- **性能：** 每帧的二维绘制与上传可能占用较多时间。保留画面只在重绘时更新，资源计入运行预算；发布级性能归 P5，本任务只保证不产生第二条循环且不阻塞模拟。
- **代码恢复：** 驾驶舱与地图是只读消费者，可以通过撤销层的登记回到 P3-12 的画面；Core 或导入的修订按版本门禁回退。

## 未决事项

无。ADR-0019 与总计划/P3-09 同步已完成；Δ-01、Δ-03 随当前 spec 获批，Δ-02 已撤销，没有自动外观豁免。Q 研究、D-01 的完整输入/预算、D-02 的跨任务同步及预注册对照判据仍是明确实施关卡，不是已交付成果；关卡未闭合的依赖项不得实施。

## 审批

**2026-10-25 批准：** 用户明确要求“approve this spec and generate goal”，批准本次审阅后的合同（S-01 至 S-14、AC-01 至 AC-25、技术决定及 Δ-01/Δ-03；Δ-02 已撤销）。首次检查因 ADR 未落档暂保留 draft；用户获知这一阻塞后要求继续自主完成，并再次指定问题采用推荐答案。本次先独立落实 [ADR-0019](../../../decisions/ADR-0019-strategic-map-render-pipeline.md)、总计划 §5、P3-09 和阶段索引同步，复核与已审阅方向一致后将本 spec 置为 `accepted`。本条不批准尚未形成的 D-01/D-02 具体合同、不批准 goal，也不启动代码实现或提交。

2026-10-25 审阅修订：按用户“其他问题都按最推荐的回答”的授权采用保留逐 tick projection、复用 G-03 项目摘要并补基地显示、P3-14 单一共享模型所有者、原版右键双调用去抖与生产绘制 ready 凭证等推荐方案；更正零能量/满刻度、调色板、消息事件和视觉验证边界，撤销 Δ-02 与概括外观豁免，删除 10% 和 U-021 无关的无依据结论。保留 S-01 至 S-14、AC-01 至 AC-25 的稳定编号。此记录只说明审阅取舍，不批准本 spec、任何上游契约或 ADR；本轮未生成 goal、subtask、代码或提交，未运行 DOSBox-X。

**2026-10-28 D-01 定稿（子任务 08 起草）：** 新增 [D-01 定稿](#d-01-定稿08)（DC-01 至 DC-13），并把下列已批准行为的表述按 07 的研究结论最小更正，各处标为“D-01 修订”：雷达在 Warp 中只清圆盘并画背景环、节奏由记录间隔决定、没有十字线、0.5r 环为四段轴向短弧；角落仪表为四个角落的异形条；“持久画面”改为按视角 0xC/1/8/0x11 的四种可见保留规则（S-02、驾驶舱表现模型与时间、AC-08）；类型 9 的闪烁用绘制例程自己的时钟、不与 P3-14 共享，只共享锁定进度与警告标志（S-08、指示条、D-02 表的可见输出一行）；G-03 消息参数为颜色 8、模式 1、未显示过期 0x200；地图标签威胁、零能量与右键节奏（战略地图画面）；Q-13 汇总中交 08 的两处；不包含中自动驾驶一条；与 P3-14 的关系增加合并说明与交 P3-14 的信息。上游同步：P3-02 的 CK-01 至 CK-07（`RULES_VERSION` 9 → 10、快照格式 8 → 9）、P3-03 的修订 4（切片定义 6 → 7、`graphics-5` → `graphics-6`）、P3-04、P3-05、P3-09、P3-10 的同步段。新的已批准差异为 DC-11 的 Δ-04 至 Δ-09（显示计时每运行重建、消息溢出丢新项、零能量标记、连线精确裁剪、速度辅助失败分支不闪烁、失去资格清右键电平）；照原版复现的自动驾驶“关”提示与 SNIP 共用上次帧不是差异。依据为用户 2026-10-28 对本 goal 执行中修改 spec 与其他决定的概括授权（原话由协调者转引：“在执行goal的过程中，如果需要修改spec或其他Decision，我都批准你修改。用任何方式来unblock任何问题，完成这个goal。”）；所选方案均为 07 与协调者列出的推荐方案。S-01 至 S-14、AC-01 至 AC-25 的编号不变，没有新增 G 项；修订后未重跑 review-spec。

**2026-10-28 D-01 批准（08）：** 用户于 2026-10-28 执行本 goal 时明确授权：“在执行goal的过程中，如果需要修改spec或其他Decision，我都批准你修改。用任何方式来unblock任何问题，完成这个goal。”协调者据此在子任务 08 复核并批准 [D-01 定稿](#d-01-定稿08) 的 DC-01 至 DC-13、Δ-04 至 Δ-09，以及其中标注“D-01 修订”的 S/AC 与行为描述更正（含 07 提出的雷达 Warp、重建节奏、按视角可见保留、类型 9 自有闪烁时钟、G-03 摘要参数等），同时批准 P3-02、P3-03、P3-04、P3-05、P3-09、P3-10 中链接到本节的同步修订。D-02 不在此次批准范围内，仍由 09 处理。

**2026-10-28 D-02 定稿与批准（09）：** 子任务 09 新增 [D-02 定稿](#d-02-定稿09)（DD-01 至 DD-06），并把“与 P3-14 的关系”、技术决定 8、实施关卡、AC-14 及相关接线描述按其更正，各处标为“D-02 修订”：原版证据表明锁定音、9 型警告音与相应绘制之间没有共同状态，故不建由 P3-14 交付、双方共读的提示模型，两侧从同 tick projection 读同一 Core 输入；视觉状态归本任务，声音状态归 P3-14。所选方案消除了与 P3-14/07、14 的互等（P3-14/07 正等待本接口）。被排除的方案：等待 P3-14 交付共享模型（形成互等、且没有实际共享状态）；由本任务代写含声音状态的共享模型（越过 P3-14 的所有权，且仍无共同状态）。用户于 2026-10-28 执行本 goal 时明确授权：“在执行goal的过程中，如果需要修改spec或其他Decision，我都批准你修改。用任何方式来unblock任何问题，完成这个goal。”协调者据此批准本次 D-02 定稿与相关更正，并在 P3-04 记录同步；未改 P3-14 的文档或分支，P3-14 一侧须由其 D-02 采纳。S/AC 编号不变；修订后未重跑 review-spec。

**2026-10-28 实施期更正（20、21）：** 按子任务 20、21 的实施证据，把右显示屏改为 CPU 私有 100 × 100 设备（GPU 计划不再保留渲染目标、深度与顶点，CPU 绘制面增加该设备），并更正自动驾驶“关”提示的复位点与截图依据（每运行复位归 Δ-04）；两处标为“D-01 修订”。用户于 2026-10-28 执行本 goal 时明确授权：“在执行goal的过程中，如果需要修改spec或其他Decision，我都批准你修改。用任何方式来unblock任何问题，完成这个goal。”协调者据此批准。S/AC 编号不变；修订后未重跑 review-spec。

**2026-10-28 执行期决定（原版补采）：** 在“原版证据途径与 DOSBox-X 的使用”加入执行期决定：M-1/2/3/4/7/8 需要用户游玩才能截图，本 goal 不新开基准会话，由 31/32 以已有截图、代码、合成测试与参考视频给出经批准的外观证据缺口，用户补采列为剩余外部动作。依用户 2026-10-28 的明确授权由协调者批准；不改变行为契约与其他判据。
