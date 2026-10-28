---
type: guide
status: active
phase: all
updated: 2026-10-28
related: [ADR-0009, ADR-0015]
---

# 渲染模块说明

本文件是[源码结构指南](../source-structure.md)的模块分册，记录 `src/render/` 中已交付代码的当前 API 与契约要点。目录树、职责边界与 helper 归属以指南为准，行为契约以各任务 spec 为准；修改本模块代码的任务同步更新本文件。

`render/` 目前有 P1-07 的共用设施（契约见 [P1-07 spec](../../plan/p1/07/spec.md)）：DOM-free 的 4:3 视口布局、绘制端口与释放 helper，以及 WebGL 表面（DOM-free 生命周期加 `browser-*` 浏览器工厂），工程要点见[渲染表面与视口](../README.md#渲染表面与视口)；P2-11 的 `render/viewer/` 资源查看渲染（见[资源查看渲染](#资源查看渲染)）；P3-05 地图输入所需的纯 CSS 像素几何（[map-input-geometry.ts](../../../src/render/map/map-input-geometry.ts)，P3-13/23 加入生产几何端口）、自绘地图十字光标（[map-cursor.ts](../../../src/render/map/map-cursor.ts)）与 P3-13/23 的地图就绪凭证端口（[map-presentation-port.ts](../../../src/render/map/map-presentation-port.ts)）；以及 P3-12 的 `render/flight/` 飞行渲染（见[飞行渲染](#飞行渲染p3-12)）。任务画面的飞行画布已接入，绘制世界视口内的三维世界、星云、星点、速度尘埃、爆炸精灵与 Warp 隧道，屏幕闪光作用于整幅 4:3 画面；P3-13 的驾驶舱、HUD、视角标签与地图画面在 `render/cockpit/` 中（见[驾驶舱、HUD 与地图](#驾驶舱hud-与地图p3-13)），由同一运行接线加入同一画面；任务壳的在制提示由 P3-13/25 移除（[在制标注](../slice-gaps.md#在制标注非-g-项)）。地图几何、光标与就绪凭证供输入层使用，不实现玩法；生产几何来自同一地图几何内容，项目十字光标只留给隔离的测试入口。

## 资源查看渲染

[P2-11](../../plan/p2/11/spec.md) 的查看渲染在 [render/viewer/](../../../src/render/viewer/) 中，DOM-free，由 Node 测试覆盖（二维项见 [08](../../plan/p2/11/subtasks/08-viewer-render-foundation.md)，模型与效果见 [09](../../plan/p2/11/subtasks/09-viewer-models-effects.md)）。所有者见[查看器所有者](./app.md#查看器所有者)，页面与浏览器读回归 11。

- **入口：** [viewer-renderer.ts](../../../src/render/viewer/viewer-renderer.ts) 的 `createViewerRenderer({ surface, reportError })`；表面无法创建时传 `{ unavailable, reportError }`，渲染器只报告原因。连接失败时先释放表面再抛出原因，释放也失败时抛 `RollbackError`。
  - **状态：** `ready`、`context-lost`、`failed`、`unavailable`、`disposed`，`failed` 与 `unavailable` 附原始错误。只在状态变化时通知，开始释放后不再通知。
  - **显示：** `show(item | null)` 每次显示一项。查看项携带内容消费函数的结果：图像为 `expandImage` 的结果，布局为 `composeLayout` 的结果，调色板与字库为 payload；模型为一个部件列表的 `modelPartItems` 结果与 `expandModelTextures` 的贴图；效果为 `effectViews` 的一个视图。读取与展开由调用方完成，所以内容错误只标记该项，不使渲染失败。种类、ID 与内容对象都相同的项视为未变。
  - **视图：** `setView(view)` 设置三维项的视图，之后显示的项沿用它。
  - **诊断：** 状态、当前项的 kind 与 ID、成功绘制次数、`gpuStats()` 的三项计数（释放后为 null）、布局、当前画面在绘制缓冲中的位置 `placement`（设备像素，自左上角起；三维项为整个缓冲），以及视图。
- **按需绘制：** 只在显示项变化、布局（尺寸或像素比）变化、上下文恢复，以及视图改变了画面时同步绘制一次；相同的项、布局或视图不绘制，也不请求动画帧。改变画面的视图变化是三维项的旋转与缩放，以及模型的光照；效果的光照与二维项的视图变化都不绘制。上下文丢失期间仍可换项但不绘制，恢复后重画一次。构建、布局或绘制的任何失败都使渲染器进入终止的 `failed`。
- **显示与资源：** [viewer-display.ts](../../../src/render/viewer/viewer-display.ts) 的每个显示独占它创建的几何、材质与纹理。
  - **换项：** 先建成新的显示，再释放旧的；新显示构建失败时场景不变，已取得的贴图租用全部归还。GPU 计数只取决于当前项，`show(null)` 后为零。
  - **模型与效果贴图：** 唯一跨显示存在的资源。[viewer-textures.ts](../../../src/render/viewer/viewer-textures.ts) 的 `ViewerTextures` 按 image Asset ID 引用计数：第一次使用时创建，最后一个使用它的显示释放时销毁。共用贴图的项之间切换时只有一个纹理；所有者在替换资源包前释放所示条目，所以持有期间同一 ID 总是同一内容。
  - **释放：** 撤销表面观察 → 当前显示的全部资源 → 表面；每步都尝试，失败汇总为 AggregateError。释放后迟到的表面回调不再绘制。
  - **只释放当前项（P2-11 子任务 10）：** `releaseItem()` 在除 `disposed` 以外的任何状态（包括 `failed`）下释放当前显示，就绪时画一次空画面；释放失败时抛出 AggregateError，并使渲染器进入 `failed`。查看器所有者在资源包被替换前调用它，`show(null)` 在 `failed` 状态下不做任何事。
- **二维项：** 在绘制缓冲像素中绘制（正交相机，y 向上），由 [viewer-pictures.ts](../../../src/render/viewer/viewer-pictures.ts) 的纯函数给出画面与位置。
  - **位置：** `placePicture` 把图像、调色板与字库按能放下的最大整数倍放大并居中（比缓冲大时缩小到能放下）；布局拉伸覆盖整个 4:3 缓冲。
  - **透明：** 画面矩形下是中性棋盘格（灰度 102 与 153，每格 8 个缓冲像素），从透明像素中透出。
  - **调色板与字库：** `paletteSheet` 为每行 16 个 7×7 色块；`glyphSheet` 按字形序号每行 16 个单元，单元为单元宽 × 单元高，置位为白、否则为黑，单元以外的位与行不显示。格线为 1 像素的灰度 64，末行多余的单元透明。
- **三维项：** [viewer-solids.ts](../../../src/render/viewer/viewer-solids.ts) 为每个模型部件或效果形状建一个网格，几何按显示分别创建。
  - **模型：** 位置与法线的 z 取反，索引与 UV 原样；未贴图的部件显示部件颜色，贴图部件显示纹素。
  - **效果：** [viewer-effects.ts](../../../src/render/viewer/viewer-effects.ts) 的 `effectViews(payload)` 按弹丸记录、导弹类型（机身、尾翼、元素，有附加元素时加上它）与碎片形状（先无贴图、后有贴图）列出视图。多边形面以第一个角为中心扇形三角化（`fanTriangles`），每个形状的三角形数为各面“角数 − 2”之和，一个 payload 全部视图的顶点与三角形总数等于 `effectExpansionSize`。调用方经 `expandImage` 提供贴图，几何携带展开的 UV。外观由 [viewer-presentation.ts](../../../src/render/viewer/viewer-presentation.ts) 的 `effectAppearance(shape)` 给出：显示字节、原颜色、是否贴图与接缝未确认标记；贴图直接显示纹素，不乘源颜色。
  - **取景：** 相机为 `VIEWER_FOV`（40°）竖直视场的透视相机，按全部顶点的包围球（包围盒中心、最远顶点距离）取景，使球恰在竖直视场内。相机停在球外的这个距离上，近、远平面包住整个球；缩放只改变相机的 `zoom`，所以放大到 8 倍时也不会进入模型。包围盒只用于取景，不产生任何规则。
  - **视图：** [viewer-view.ts](../../../src/render/viewer/viewer-view.ts) 的 `applyViewAction` 是纯函数：绕竖直轴与水平轴每步 15°（取模 360），缩放每步 1.25 倍并限制在初始取景的 1/8 至 8 倍，复位只恢复旋转与缩放，另有光照开关。导弹只显示旋转 0 的映射，不再提供贴图旋转参数或控件。内容绕包围球中心按先竖直轴、后水平轴旋转。
- **呈现约定：** 集中在 [viewer-presentation.ts](../../../src/render/viewer/viewer-presentation.ts)。呈现约定的修正只改这一处，不重新导入，也不改 payload schema。P2-12 已逐行判定，没有需要修正的约定（[22 的完成证据](../../plan/p2/12/subtasks/22-presentation-verdicts.md#完成证据)）。模型贴图曾与原版不同，原因在转换读取的贴图坐标，不在呈现约定；P2-06 修复读取（模型转换器组件 `models-3`）后，P2-12/29 在新候选上复核了带贴图的模型项，没有发现贴图方向的差异（[29 的完成证据](../../plan/p2/12/subtasks/29-mesh-uv-recheck.md#完成证据)）。

  | 项 | 选择 | 依据与置信度 |
  |---|---|---|
  | 颜色空间 | 纹理为 `NoColorSpace`，不解码；查看器画布的输出颜色空间为线性 sRGB（`VIEWER_SURFACE`），着色器输出不再编码；材质不做 tone mapping。读回的字节等于源字节 | 项目选择（spec 呈现约定）：原版是 8 位调色板画面，查看器不引入颜色变换。本机 Chrome 的读回误差为 0，见 [08 的完成证据](../../plan/p2/11/subtasks/08-viewer-render-foundation.md#完成证据)。P2-12：二维显示已验证（16、17 逐像素一致，21 的浏览器显示 123 项正确）；三维颜色按来源与可比区域判断，原版明暗归 U-028 |
  | 过滤与 mipmap | 放大与缩小都用最近邻，不生成 mipmap | 原版软件渲染的采样方式未确认；最近邻不引入原版没有的颜色。P2-12：二维按整数倍显示，已验证；原版截图中的三维纹素未见平滑，与最近邻相符，缩小与 mip 的算法仍未确认（不要求定论） |
  | 方向 | 画面的第 0 行（`expandImage` 输出的首行）在 v = 0，纹理不翻转；二维四边形的上边为 v = 0 | 二维：已验证（P2-12/16、17 逐像素一致，21 的浏览器显示无颠倒、镜像）。三维模型：高概率。P2-06 修正 MESH 贴图坐标的读取后，P2-12/29 在新候选的查看器中复核：有可比截图的模型项与原版一致；上下翻转或 u、v 互换都与截图不一致（P2-12/22），u 向镜像不能区分。逐项结论、等价链与仍缺截图的项见 [mesh §3](../../original/formats/mesh.md#p2-12-viewer-comparison-v-1)。效果：`srangers_099` 中的导弹是类型 1，侧面一致（高概率，P2-12/30；21 对类型 5 的判定作废）。依据见 [22](../../plan/p2/12/subtasks/22-presentation-verdicts.md#完成证据)与 [30](../../plan/p2/12/subtasks/30-deferred-recaptures.md#完成证据) 与 [29](../../plan/p2/12/subtasks/29-mesh-uv-recheck.md#完成证据) |
  | 透明 | alpha 只有 0 与 255，以 alpha 测试丢弃透明纹素，不混合 | 项目选择：与 payload 的二值掩码一致。P2-12：二维已验证（V-3 的透明掩码取自绘制路径，16；全透明项显示为棋盘格，21）。三维第 2 列表在原版中的显示时机与半透明方式属于运行时表现（P3，见 [22](../../plan/p2/12/subtasks/22-presentation-verdicts.md#完成证据) 与 U-027），查看器不透明显示该静态资源，不修正 |
  | 坐标轴与手性（三维） | 源数据按左手系、y 向上解释，位置与法线的 z 取反后交给 Three.js | 未确认：可逆的初始约定。P2-12/21 可对照的机型左右对称，不能确认手性，仍未确认 |
  | 正面绕序（三维） | 双面渲染，不剔除 | 绕序未确认（mesh）；双面渲染不依赖它。P2-12/21 未见原版中不可见的面；不要求定论 |
  | 模型贴图（三维） | 与二维相同的颜色空间、过滤与方向；按材质在两个轴上重复（`RepeatWrapping`） | 项目选择：贴图坐标超出 [0, 1]，需要某种平铺，原版的环绕规则（重复或镜像重复等）与采样方式未确认。贴图坐标的读取与复核见“方向”行 |
  | 效果贴图（三维） | 同样以最近邻、无颜色变换、双轴重复显示，alpha 小于 0.5 的纹素丢弃；逐角 UV 线性插值，不修正接缝。一个面各角 u 的最大值减最小值大于 1/2 时，所选项显示 “Seam interpolation unconfirmed” | 原版接缝插值未确认；2026-10-07 用户批准的可逆初始选择；AC-18 像素断言排除整个跨接缝面。跨接缝面的实际外观缺少原版基准（P2-12/30），算法与外观都未验证，标注保留；导弹类型 0–3 与有贴图碎片形状 0、1 的跨接缝面是用户批准的范围例外（[spec 判定分类](../../plan/p2/12/spec.md#判定分类)），不作为 P2-12 的必需项 |
  | 相机（三维） | 40° 竖直视场的透视相机，按包围球取景，缩放不移动相机 | 项目选择：查看器的诊断视图，不是原版相机 |
  | 光照（三维） | 默认不受光照，直接显示部件颜色或纹素；可切换为中性光：白色环境光与来自右上前方的白色方向光，强度为 π × 0.4 与 π × 0.6，正对光的面恰为原色。效果没有法线，始终不受光照 | 不是原版光照：原版光照与明暗级归 P3（U-028）。P2-12/21 中原版整体更暗，按 U-028 记录 |
  | 效果颜色（三维） | 无贴图时三个浮点按 RGB 解释，各截断到 [0, 1] 后按 round(v × 255) 量化；无贴图且没有颜色的形状用固定的诊断灰色 128。有贴图时直接显示纹素，源颜色仍以数字列出 | 取值范围与通道含义未确认（P2-06）；诊断灰色不是原版颜色。P2-12/21、30：第一关用到的弹丸记录 0、1、2、6 与原版一致（记录 6 以 `srangers_128` 直接对照）；记录 3、4、5、7、8、9 在切片之外（已确认不使用，见 [executable](../../original/formats/executable.md#weapon-records-and-the-first-missions-shooters-p2-1230)）；没有映射到调色板最近色的证据，不修改 |

  P3-12 的原版研究已确定飞行画面的手性与相机帧（[PV5](../../original/formats/executable.md#pv5-camera-and-object-frames-handedness--confirmed-code)）、背面剔除（[RS4](../../original/formats/executable.md#rs4-back-face-culling--confirmed-code)）与光照（[3D lighting](../../original/formats/executable.md#3d-lighting-and-shade-levels-p3-1202)），飞行渲染按它们绘制（[飞行的呈现约定与已知差异](#飞行的呈现约定与已知差异)）。查看器是诊断视图，按 P3-12 [技术决定](../../plan/p3/12/spec.md#技术决定) 15 不随之修改，上表保留 P2 的判定。
- **表面选项：** [render-surface.ts](../../../src/render/scene/render-surface.ts) 的 `RenderSurfaceOptions` 由画在表面上的渲染逻辑选择，含画布的无障碍名称与渲染器的输出颜色空间。浏览器工厂 `createBrowserWebGLSurface(container, options)` 按它设置画布与渲染器；应用端口 `createSurface(container, options)` 同样接收它。查看器传 `VIEWER_SURFACE`，飞行渲染传 `FLIGHT_SURFACE`（名称 “Flight view”，同为线性 sRGB 输出，不编码）。
- **多遍绘制：** 查看器只用 `draw(scene, camera)`；飞行渲染用 P3-12 新增的 `drawPasses(passes)`，见[工程约定](../README.md#渲染表面与视口)。
- **测试替身：** `RecordingSurface` 只记录可见的网格，并按材质上的纹理模拟纹理计数；`drawPasses` 的每一帧按次序记录各遍的目标、清除、裁剪与可见网格（`frames`）。

## 驾驶舱、HUD 与地图（P3-13）

[P3-13](../../plan/p3/13/spec.md) 的驾驶舱表现在 [render/cockpit/](../../../src/render/cockpit/) 中：纯模块（无 DOM、GPU、app 与宿主时间，lint 规则 `osr/cockpit-imports`，见[工程约定](../README.md#lint-规则eslintconfigjs)）按 [D-01 定稿](../../plan/p3/13/spec.md#d-01-定稿08)的 DC-04/DC-05 逐 tick 推进并画入两张 640 × 480 索引面；只有 `composition/` 用 Three.js，把它们合成为同一运行合成中的驾驶舱层。地图输入的生产几何与就绪凭证在 [render/map/](../../../src/render/map/)（[地图就绪与输入几何](#地图就绪与输入几何p3-1323)）。各项的行为与原版依据以 spec、[hud §4](../../original/formats/hud.md#4-instrument-overlay-and-map-drawing-p3-13) 与各子任务的完成证据为准，本节只记录 API 与装配。

### 驾驶舱目录

| 目录 | 内容（子任务） | 主要入口 |
|---|---|---|
| [presentation/](../../../src/render/cockpit/presentation/) | 表现基础：契约、每 tick 次序、两张索引面、调度、驾驶舱随机流与限值（14） | `createCockpitPresentation`、`CockpitModule`、`cockpitRandom`、`COCKPIT_LIMITS`、`clockExceeds` |
| [raster/](../../../src/render/cockpit/raster/) | 索引面与原版图元、HUD 字体与文字、格式化（15） | `createIndexedSurface`、`blit`、`resolveRows`、`hudFont`、`drawText`、`formatText` |
| [messages/](../../../src/render/cockpit/messages/) | 类型 8 消息行与 G-03 文案核对（18） | `createMessageLine` |
| [communications/](../../../src/render/cockpit/communications/) | 左显示屏页 2–4 的菜单与页 5 的 G-03 标注（18） | `createCommunicationPages` |
| [left-display/](../../../src/render/cockpit/left-display/) | 类型 6 左显示屏：页表、状态页（DIAG）、能量页与内容核对（17） | `createLeftDisplay`、`communicationPageDrawers`、`prepareLeftDisplayContent` |
| [interference/](../../../src/render/cockpit/interference/) | 左右显示屏共用的 SNIP 干扰画面（17） | `createDisplayInterference` |
| [warp-display/](../../../src/render/cockpit/warp-display/) | 页 6 的 Warp 读数与轨迹、类型 12 Warp 灯（19） | `createWarpPage`、`createWarpLamp` |
| [gauges/](../../../src/render/cockpit/gauges/) | 类型 0–3 角落仪表（16） | `createCornerGauges` |
| [radar/](../../../src/render/cockpit/radar/) | 类型 5 雷达（16） | `createRadar` |
| [frame/](../../../src/render/cockpit/frame/) | 布局元素（框架）的唯一绘制者（16） | `createCockpitFrame` |
| [target-display/](../../../src/render/cockpit/target-display/) | 类型 7 右显示屏：CPU 上 100 × 100 的私有设备与剪影光栅（20） | `createTargetDisplay` |
| [overlay/](../../../src/render/cockpit/overlay/) | F1 叠加、被毁视角标签与类型 9 指示条（21） | `createFlightOverlay`、`createIndicatorStrip` |
| [map-picture/](../../../src/render/cockpit/map-picture/) | 类型 10 战略地图画面、放大窗图标错开与地图画面几何（22） | `createMapPicture`、`mapPictureGeometry` |
| [composition/](../../../src/render/cockpit/composition/) | 每运行的模块登记与驾驶舱层（GPU 适配，24） | `createCockpitRun`、`createCockpitLayer`、`COCKPIT_GPU_PLAN` |

纯模块只以相对路径引用自身、`src/core`、`src/content` 与 `src/render/flight/presentation`；GPU 适配目录（`composition/` 与任一 `<模块>/gpu/`，目前只有前者）可以用 Three.js 与 render 层。没有模块读 Render State 之外的世界、提交命令或写 store。

### 表现基础

[presentation/](../../../src/render/cockpit/presentation/) 实现 DC-04、DC-05 与 DC-08 的框架；类型在 [cockpit-contract.ts](../../../src/render/cockpit/presentation/cockpit-contract.ts)。

- **输入：** `CockpitTick { output, camera, mapRightButton }`：`output` 与 P3-04 的 `TickOutput` 结构兼容（含同 tick 的 `projection`，不导入 app），`camera` 是 P3-12 表现模块在该 tick 的步末相机，`mapRightButton` 是该批读到的右键电平；`CockpitAdvance { ownerId, runId, ticks }`；`CockpitInitial { render, projection, camera }` 为 tick 0。
- **创建：** `createCockpitPresentation({ ownerId, runId, content, modules, initial, seed })`：`content` 为 `data/hud/instruments`，`modules` 为 `CockpitModule` 列表，`seed` 为运行的宿主表现种子。创建时核对 owner/run、tick 0、四个读取分区已就绪、类型覆盖与元素绘制者，分配 B（带覆盖位）与 S，做飞行初始化的选组与激活；不推进、不绘制、不抽取。
- **模块接口：** `CockpitModule` 的钩子都可选：`instruments`（按类型的 `InstrumentHandler { activate?, prePass?, draw }`，各槽每个类型在全部模块中恰有一个处理器）、`beforeDraw`（①，每个事件）、`prepare`（②）、`eraseOverlay`、`drawOverlay`、`global`（每帧全局回调）、`paintElement`（至多一个模块提供）、`afterDraw`（④，每个事件）与 `dispose`。**登记次序即全局回调次序。** 只有 ③ 的上下文 `CockpitDrawContext` 带 `random`、后备面 `back` 与送屏 `publish(rect)`/`publishRow(y, x0, x1)`；其他阶段抽取或送屏为 `invariant-violated`。
- **每 tick 次序：** ① 按事件次序，`view-switched` 先选组（B、S 填 0、全量重绘，槽改变时按记录次序 `activate`），再交各模块；② 各模块 `prepare`；③ 一次逻辑显示（Warp 与地图先把 B 填 0 → F1 与被毁视角擦叠加 → 各记录预遍 → 画叠加 → 全部 `global` → 遍 0 元素 → 按源次序到期的记录 → 遍 1 元素 → 帧末 B→S）；④ 各模块 `afterDraw`。基地视角只运行到 `global`，`none`（如 0x13）不调用 ③。到期按 u32 `clock − last > interval` 严格比较，模块的自有时钟复用 `clockExceeds`。
- **查询：** `status()`（不抛错）、`layout()`（`CockpitLayout { viewMode, view, slot, palette, screenRows, worldRows }`，视角为 `flight`、`warp`、`map`、`external`、`base`、`none`）、`surfaces()`（`{ back, screen }` 实时只读）、`schedule()`（tick、时钟、视角、全量重绘、各记录上次绘制时刻、`randomDraws`）。
- **推进与失败：** `advance(batch)` 先整批核对（owner/run、≤ 5 项、tick 连续、各项 tick/时钟/视角一致、事件属本 tick、视角只经 `view-switched` 改变），失败为 `invalid-input`，模型不变、不抽取；之后逐 tick 处理，处理中的错误锁存 `failed`，之后除 `status`/`dispose` 外都为 `invalid-state`。空批次不改变任何东西。`dispose()` 幂等，逐个释放模块并汇总错误。
- **随机与限值：** [cockpit-random.ts](../../../src/render/cockpit/presentation/cockpit-random.ts) 的 `cockpitRandom(seed)` 由宿主种子以 FNV-1a 派生驾驶舱流（`cockpitPresentationSeed`），不碰 Core 与 P3-12 的流。[cockpit-limits.ts](../../../src/render/cockpit/presentation/cockpit-limits.ts) 的 `COCKPIT_LIMITS` 为 DC-08 全表（消息行 64 项、雷达 120 项、Warp 轨迹 94、索引像素 2²⁰、GPU 纹素 2¹⁹、渲染目标 0 等），`checkImagePixels` 在解码前核对，错误类型复用 P3-12 的 `PresentationError`。[cockpit-layout.ts](../../../src/render/cockpit/presentation/cockpit-layout.ts) 给出 `layoutOf`、`frameEndRows`、`copyRect` 与 `COCKPIT_BAND_TOP`（316）。

### 光栅与文字

[raster/](../../../src/render/cockpit/raster/) 是纯 TypeScript 的二维图元，语义按 [hud §4.1](../../original/formats/hud.md#4-instrument-overlay-and-map-drawing-p3-13)：

- [indexed-surface.ts](../../../src/render/cockpit/raster/indexed-surface.ts)：`createIndexedSurface(w, h, coverage?)`（≤ 640 × 480，可选 1 位覆盖掩码）、`plot`、`fillRect`、`clearRect`（填 0 并取消覆盖）、`outlineRect`、`drawLine`、`drawCircle`、`fillDisc`、`blit(surface, source, x, y, 'opaque' | 'key' | 'mask', from?)`、`resolveRows`（按导入的 8 位调色板原样解析，未覆盖像素透明）与 `toInt16`。屏幕外像素安全舍弃；只有原版以 16 位传入且决定循环长度的参数越界才是调用方 `RangeError`。
- [glyph-text.ts](../../../src/render/cockpit/raster/glyph-text.ts)：`hudFont(payload, advance, upperCase)`（步进与 `cellWidth` 分开）、`drawText`（字形前 `height` 行、8 列，映射外为 `unmapped-character` 且不画）、`splitLines` 与 `wholeGlyphRange`。
- [text-format.ts](../../../src/render/cockpit/raster/text-format.ts)：`formatText(format, args, maxBytes)` 只接受 `%d`、`%.0f`（平分取偶）、`%s` 与 `%%`，其他转换、实参与长度错误为 `TextFormatError`，由调用方转为内容契约错误；`textFormatConversions` 供开始前核对。

### 仪表模块与登记次序

[cockpit-run.ts](../../../src/render/cockpit/composition/cockpit-run.ts) 的 `createCockpitRun` 每运行按下列次序登记全部模块，前四项即原版全局回调 8、6、9、12 的次序：

1. **消息行（类型 8）**：`createMessageLine({ font, flightMessages, copy })`；另有 `snapshot()`（队首、当前来电、队列长度与 `messageDrops`）与 `subscribe()`，供基地页的桥接（[UI 模块说明](./ui.md#游戏-store桥接与命令反馈)）。
2. **左显示屏（类型 6）**：`createLeftDisplay({ content, interference, pages, initial })`，页 0、1 自有，页 2–5 由 `communicationPageDrawers(createCommunicationPages({ font, background, hudText, commMenus, names, copy }))`、页 6 由 `createWarpPage({ font, background, hudText }).drawWarpPage` 注入；`state()`。
3. **类型 9 指示条**：`createIndicatorStrip({ font, hudText })`，读同 tick 的两项警告标志（FA-01 的分区级 `communications.warnings`，见[交接](#交接p3-13)），自有 0x15 闪烁、不抽随机；`state()`。
4. **Warp 灯（类型 12）**：`createWarpLamp({ font, hudText })`；`state()`。
5. **角落仪表（类型 0–3）**：`createCornerGauges({ font, labels })`；`timers()`。
6. **雷达（类型 5）**：`createRadar()`；`state()`（含 DC-08 的 `noiseDropped`）与 `cachedDirection(entityId)`（DC-12，供叠加的偏心指针）。
7. **框架**：`createCockpitFrame({ content, layouts, images })`，唯一的 `paintElement` 提供者，覆盖 slot 0 与 slot 2 的布局元素。
8. **右显示屏（类型 7）**：`createTargetDisplay({ font, background, palettes, hudText, interference, models, names })`，在 CPU 上的 100 × 100 私有设备中渲染剪影（D-01 修订，没有 GPU 资源）；`budget`、`state()`、`device()`。
9. **F1 叠加与被毁视角标签**：`createFlightOverlay({ font, hudText, viewLabels, craftInfo, names, radar, backPlane })`，`backPlane` 为 P3-12 的 PV4；`state()`。
10. **地图（类型 10）**：`createMapPicture({ font, unitMarkers, zoomIcons, hudText, names, costUnavailable, pointer })`，每运行一个（救援保留）；`drawn()` 为就绪凭证，`labels()` 为距离标签开关；自身 GPU 计划为零（`MAP_PICTURE_GPU_PLAN`）。

左右显示屏共用一个 `createDisplayInterference(frames)`（DC-10 的共用“上次帧”）。

### 运行装配（P3-13/24）

- **内容与文案：** `CockpitContent`（[cockpit-run.ts](../../../src/render/cockpit/composition/cockpit-run.ts)）是一个资源包已核对的 HUD 内容，带包的代际与内容身份，由应用的 `cockpitContentOf` 给出（[app 说明](./app.md#飞行画面)）；`CockpitCopy { incoming, costUnavailable }` 是应用注入的项目文案（G-03 摘要与标注、`MAP_COST_UNAVAILABLE`），render 不导入 UI。
- **`createCockpitRun({ ownerId, runId, content, copy, initial, seed, models, backPlane, pointer })`：** 按[上节](#仪表模块与登记次序)的次序登记模块并建驾驶舱表现；不分配 GPU。返回 `{ presentation, messageLine, mapPicture, mapGeometry, diagnostics() }`；`diagnostics()` 为开发摘要 `CockpitDiagnostics`（tick、视角、左显示屏页、消息队列长度与 `messageDrops`、`radarNoiseDropped`、各记录上次绘制时刻、抽取数），开发面板经 `MissionDiagnostics.cockpitCounts()` 读取其中三项（[UI 模块说明](./ui.md#开发诊断)）。
- **驾驶舱层：** [cockpit-layer.ts](../../../src/render/cockpit/composition/cockpit-layer.ts) 的 `createCockpitLayer({ cache, presentation, palettes })` 是 `cockpit` 槽的层：按当前布局把 S 的不透明行与 B 世界行中的被覆盖像素以该布局的调色板解析成一张 640 × 480 RGBA 纹理，每个逻辑像素按逻辑缩放最近邻放大；不测试也不写深度，所以世界深度（含 Warp 保留的深度）不变，屏幕闪光仍只由 P3-12 的屏幕阶段对整幅游戏图像作用一次。`changed()` 标记表面已推进，下次绘制才重新解析上传；没有 tick 的帧、重画与恢复的上下文显示同一画面。基地、0x13 与已释放的表现不画。`COCKPIT_GPU_PLAN` 为纹素 307,200、顶点/索引 0（三角形由顶点序号生成）、渲染目标 0。
- **接线（`wireFlightRun` 的 `cockpit`）：** `FlightRunCockpit { content, copy, projection, map }`，`projection` 为运行的 tick 0 projection，`map` 为 `FlightRunMap { geometry, rightButton, pointer, revoked }`。内容须是运行的包代际与内容身份；驾驶舱在 `beginRun` 之前以 tick 0 的 Render State、projection、P3-12 相机与同一宿主种子创建，任何模块拒绝的内容或文案、未就绪的分区与另一包的内容都在 GPU 分配之前拒绝开始；`beginRun` 核对 `addGpuPlans(content.plan, COCKPIT_GPU_PLAN)`；层随 pass 之后加入。每帧先让 P3-12 的表现模块与各 pass 逐 tick 走完本帧全部 tick，再以同样的 tick（各带自己的 `TickOutput` 与步末相机，右键电平每批读一次）推进驾驶舱（DC-04；不建共享提示模型，D-02 DD-05），然后绘制一次；没有 tick 的帧不推进、不读右键。返回 `cockpit: { run, layer, mapPort }`（`FlightRunCockpitWiring`）；每项取得都交给 `run.ownCleanup`，随运行释放。

### 地图就绪与输入几何（P3-13/23）

- **就绪凭证：** [map-presentation-port.ts](../../../src/render/map/map-presentation-port.ts) 的 `createMapPresentationPort({ geometry, revoked? })` 每运行一个。`cursor` 是地图输入的生产 `MapInputOptions.cursor()`：`draw()` 不绘制、不提交、不推进，只核对最近一次 `submitted(drawn())` 的凭证与当前几何的屏幕/主地图相同；`revoke()` 立即撤销并在确有凭证时调用 `revoked`（接 `GameInputConsumer.syncMap`）；`dispose()` 后迟到的提交被忽略。运行接线在渲染器实际提交了本帧（成功绘制数增加）后以 `mapPicture.drawn()` 调 `submitted`；未提交（无布局、上下文丢失、设备不可用或失败）或绘制抛错时 `revoke`；渲染器离开 `ready` 时立即 `revoke`。所以输入只在画面实际显示后才就绪，而地图首帧从不等待输入（无死锁）。
- **生产几何：** [map-input-geometry.ts](../../../src/render/map/map-input-geometry.ts) 的 `createZoneGeometryPort({ logical, zone, shown })` 每次读取测量输入区（Pointer Lock 目标）与显示画面元素的盒，以 `zoneMapGeometry` 与 `mapPictureGeometry`（同一 `data/hud/map-geometry`，含端点记录的右/下边界为末列/末行 + 1）给出 `MapInputGeometry`；另有 `sameMapInputGeometry`、`sameLogicalGeometry`。项目十字光标（[map-cursor.ts](../../../src/render/map/map-cursor.ts)）只留给隔离入口。输入侧的契约见[键位文档](../keyboard-input.md#地图鼠标与光标)。

### 驾驶舱的测试支持与检查

- **表现基础：** [cockpit.test-support.ts](../../../src/render/cockpit/presentation/cockpit.test-support.ts) 的 `cockpitContent`、`syntheticProjection`、`syntheticRender`、`syntheticCamera`、`syntheticInitial`、`cockpitTick(s)`、`cockpitBatch`、`viewSwitched`、`syntheticEvent`、`supportModule`（补齐未测类型并记录钩子调用）、`createTestPresentation` 与 `isolatedDrawContext`（单独调用一个处理器）。
- **各模块：** [messages.test-support.ts](../../../src/render/cockpit/messages/messages.test-support.ts)（合成字体、读字形、G-03 文案）、[left-display.test-support.ts](../../../src/render/cockpit/left-display/left-display.test-support.ts)、[target-display.test-support.ts](../../../src/render/cockpit/target-display/target-display.test-support.ts)、[overlay.test-support.ts](../../../src/render/cockpit/overlay/overlay.test-support.ts)、[map-picture.test-support.ts](../../../src/render/cockpit/map-picture/map-picture.test-support.ts) 各自给出合成内容与输入。
- **运行装配：** [cockpit-run.test-support.ts](../../../src/render/cockpit/composition/cockpit-run.test-support.ts) 的 `syntheticCockpitContent()`、`syntheticCockpitCopy()`、`syntheticModels()` 给出每个真实模块都接受的合成内容。
- **真实链（26）：** [cockpit-integration.test-support.ts](../../../src/render/cockpit/cockpit-integration.test-support.ts) 的合成场景经正式 Core→Runtime→Session 运行 200 tick，`play(frameSizes)` 按给定的帧分组交付，`wire()` 照 `wireFlightRun` 的次序（无渲染器）先逐 tick 推进 P3-12 的真实表现模块、再推进 `createCockpitRun` 的全部真实模块，`oneTickAtATime()` 为逐 tick 参照；[cockpit-integration.test.ts](../../../src/render/cockpit/cockpit-integration.test.ts) 以它核对 1×5、5、2+0+3 分组一致（AC-03）、有无驾驶舱时 Core 事件与世界 RNG 相同（AC-04）、DC-04 的拒绝批次与截断。该文件以顶层 `vi.mock` 包装 Core 的创建入口，在 Vitest 的 isolated 项目中运行。资源回滚与暖态计数见 [cockpit-lifecycle.test.ts](../../../src/render/cockpit/composition/cockpit-lifecycle.test.ts)。
- **检查：** Node：`pnpm exec vitest run src/render/cockpit src/render/map src/render/flight/renderer src/app/mission`；边界：`pnpm exec vitest run tools/engineering-boundaries.test.ts -t cockpit`。浏览器回归（`cockpit.*`、`map-picture.*`、`cockpit-lifecycle`）见[工程约定](../README.md#本地浏览器-runner)。

### 交接（P3-13）

P3-13 的实现、对照与判定记录在各子任务的完成证据中，判定汇总见 [32 的完成证据](../../plan/p3/13/subtasks/32-presentation-verdicts.md#完成证据)。

- **P3-14（飞行音效）：**
  - **没有共享提示模型（[D-02 定稿](../../plan/p3/13/spec.md#d-02-定稿09)）：** 锁定音、9 型警告音与相应绘制之间没有共同状态。驾驶舱与音效消费者各自按 tick 升序消费同一批 `outputs`，只读每项同 tick 的 `projection`：`flight.combat.player.lock.progress`（含 −1/0 哨兵）、玩家目标、视角与子模式、两项已采样的警告标志；双方互不导入、不代为推进、不读对方状态，之间没有次序依赖，由应用分别登记（DD-05）。本任务不导出“叠加已调用”之类的派生事实，也不保留脉冲流（DD-04）；声音侧的状态与文件位置由 P3-14 决定。驾驶舱的锁定与警告只读同 tick projection 已由 26 以真实模块核对（[26 的完成证据](../../plan/p3/13/subtasks/26-replay-contract-integration.md#完成证据)）。
  - **警告位置的切换：** P3-14 分支合入 main 时已在同一次合并中改读 FA-01 的分区级 `communications.warnings { attackerOnTail, missileIncoming }`（[indicator-strip.ts](../../../src/render/cockpit/overlay/indicator-strip.ts)），删除了旧的 `communications.player.warnings` 读取，不留别名、不双读；没有玩家时仍不绘制类型 9、保持自身状态，警告保留 Core 的已采样值，不由消费者填 false。
  - **可达性冲突：** 07/32 依 hud §4.8 的绘制规则与截图中两段指示条的擦除态推断，两项 9 型警告在所选任务第一关中都出现过（高概率，代码与截图推断；[32 的完成证据](../../plan/p3/13/subtasks/32-presentation-verdicts.md#完成证据)的 I9 与 Q-13）。这与 P3-14 分支上 A-07 的“所选任务中不可达（高概率）”及其 D1-11 的前提冲突，须由 P3-14 复核；本任务不据 D1-11 豁免类型 9 的对照。
  - **尾随警告的攻击者遍历：** main 的 Core `checkTail` 不遍历攻击者，`attackerOnTail` 恒为假（[Core 交接](./core.md#交接)中 P3-08 一条的“来自 P3-10”），所以类型 9 的机体标签与僚机的尾随来电目前不会出现。该规则更正属 P3-14 已批准的 D1-03（FA-01，P3-14/08），已在其分支提交 `3cd624f8` 中实现，本任务不重复实现。合入后须端到端复验 AC-14 的机体标签与 AC-21 的“规则副作用已交还且解决”（spec [与 P3-14 的关系](../../plan/p3/13/spec.md#与-p3-14-的关系)，依用户 2026-10-28 的授权列为跨任务剩余动作）。
  - **同名字段与版本：** P3-02 CK-03 的 `MotionPlayer.recordMaximumSpeed` 与 FA-03 同名同义，合并时只保留一份定义。P3-13/12 已相对其集成基线把 `RULES_VERSION` 递增为 10、快照格式递增为 9（replay 格式仍为 3，[Core 的快照与 replay](./core.md#快照录制replay-与比较)）；P3-14 合入时按“相对实际集成基线各递增一次”重新核对（CK-05）。
  - **装配位置：** 驾驶舱在 `wireFlightRun` 中登记；音效消费者另行登记、读同一 `outputs`，不经驾驶舱或其层。P3-12 一侧的表现模块接口见下文 P3-12 的[交接](#交接)。
- **P3-15（联合验收）：**
  - **已验证（本任务范围内）：** 合成内容的 Node 与浏览器回归——各仪表与地图元素的像素（16–22）、真实链的分帧一致与 Core 不变（26）、合成包的驾驶舱与地图画面（27、28，含生产输入、Pointer Lock、右键与 Δ-09）、单画布与资源平衡、深度、上下文丢失与恢复、预算与故障（29）；31 以真实内容走通 F1、选目标、通讯、地图选点、Warp、停靠与离港，32 对有可比原版样本的元素判为一致（静态区域 0 差异与元素对照）。逐元素的分列判定只在 32 的完成证据中。
  - **外部前提：** P3-14 合入（警告位置切换、尾随攻击者遍历、音效与 `FLIGHT_IN_PROGRESS` 的移除，见[在制标注](../slice-gaps.md#在制标注非-g-项)）；用户补采会话（下一条）。
  - **经批准的证据缺口：** 依 spec 的[执行期决定及其补充](../../plan/p3/13/spec.md#原版证据途径与-dosbox-x-的使用)，M-1、M-2、M-3、M-4、M-7、M-8 的原版外观，以及非 M 的地图友方圆盘之并与主图单位标记、类型 9 在截图 `114`–`117` 的 1 像素残差、右显示屏设备重建后的首批像素（U-034）与真实内容中被毁视角的槽 7 消息行与标签，都记为经批准的证据缺口：不是通过、不是豁免，AC-12/14/15/16 中“须为一致”的子句在外观一栏仍未满足；M-5、M-6 按缺证表的“否则”列（保留外观等价高概率、节奏为运算级）。恢复方式为用户按私有 `local/research/p3-13/comparison-plan/missing-evidence.md` 的配方在一次基准会话中补采，再由新的验证项按冻结判据复核，不改写 32 的记录。
  - **联合复验范围：** 真实内容中的被毁视角（槽 7 消息行与视角标签，AC-23）；P3-14 合入后类型 9 机体标签与僚机尾随来电的端到端（AC-14、AC-21）；真实任务中从基地打开地图、停靠中与地图中被毁等跨任务路径的驾驶舱与地图画面；包含驾驶舱的完整闭环 replay（有无驾驶舱的事件流与周期哈希相同，26 的做法）与浏览器复验。节奏只到运算级（2 单位/tick，U-021），真实秒/帧结论须在 U-021 冻结后另测。

## 飞行渲染（P3-12）

[P3-12](../../plan/p3/12/spec.md) 的飞行渲染在 [render/flight/](../../../src/render/flight/) 中：每个任务所有者一个渲染器，绑定所有者唯一的飞行表面，每个运行一份表现模块与一组绘制 pass，作为会话的运行级消费者逐帧绘制，不另建循环（[工程约定](../README.md#渲染表面与视口)）。行为契约以 P3-12 spec 为准；共享契约是 P3-02 的 [D-01 修订](../../plan/p3/02/spec.md#p3-12-的契约修订d-01)（FS-01 至 FS-12）与 P3-04 的[帧后逐 tick 输出](../../plan/p3/04/spec.md#帧后逐-tick-输出p3-12-的修订)；所依据的原版事实只在 executable 的 [Flight scene rendering (P3-12)](../../original/formats/executable.md#flight-scene-rendering-p3-12)，本节以其中的规则编号引用。全部模块 DOM-free，经 `RenderSurface` 绘制，由 Node 测试以记录表面覆盖；浏览器读回见[工程约定](../README.md#本地浏览器-runner)。

### 目录

| 目录 | 内容 | 主要入口 |
|---|---|---|
| [presentation/](../../../src/render/flight/presentation/) | 表现模块：每个运行一份，GPU-free 的相机、EXPL 子集与单次选择、激活流与当前爆炸；两条接入缝上的表现效果（`effects/`，P3-12/13）与被毁视角相机（`destruction-camera/`，14） | `createFlightPresentation`、`presentationRandom`、`createPresentationEffects`、`createDestructionCamera` |
| [renderer/](../../../src/render/flight/renderer/) | 渲染器的生命周期、状态与失败分类，运行的 GPU 缓存与预算，运行接线，各 pass 的内容准备与接入 | `createFlightRenderer`、`FLIGHT_SURFACE`、`wireFlightRun`、`prepareFlightContent`、`attachFlightPasses` |
| [scene/](../../../src/render/flight/scene/) | 每帧的视角、可见集合、折叠与插值，投影与远平面，库的姿态 | `FlightScene`、`flightViewKind`、`projection.ts`、`drawn-pose.ts` |
| [composition/](../../../src/render/flight/composition/) | 逻辑画面、层位与次序、游戏图像与屏幕阶段，P3-13 的接入层 | `FlightComposition`、`FLIGHT_LAYER_SLOTS`、`LAYER_ORDER`、`CompositionFrame`、`FlightLayer`、`FlightScreen`、`logical-screen.ts` |
| [lighting/](../../../src/render/flight/lighting/) | 模型的光照、明暗级与色阶（17） | `prepareModelSurfaces`、`ModelLightingLayer`、`LitPartBuilder` |
| [shimmer/](../../../src/render/flight/shimmer/) | 第 2 列表的受击闪烁（18） | `prepareShimmerSurfaces`、`HitShimmer`、`HitShimmerLayer` |
| [objects/](../../../src/render/flight/objects/) | 弹丸、导弹与碎片（20） | `prepareObjectSurfaces`、`EffectObjectsLayer` |
| [nebula/](../../../src/render/flight/nebula/) | 星云背景（19） | `selectNebulaImages`、`createNebulaLayer` |
| [starfield/](../../../src/render/flight/starfield/) | 星点与速度尘埃（31） | `createStarFieldLayer`、`createSpeedDustLayer` |
| [sprites/](../../../src/render/flight/sprites/) | 爆炸精灵（21） | `ExplosionSprites`、`explosionSpritesGpuPlan` |
| [flash/](../../../src/render/flight/flash/) | 屏幕闪光（21） | `createScreenFlashes`、`checkFlashRecords`、`FlashScreenStage` |
| [warp/](../../../src/render/flight/warp/) | Warp 隧道效果（22） | `createWarpTunnelLayer` |

`presentation/` 不导入 DOM、Three.js、WebGL 或应用层，只以相对路径引用自身、Core 与 content，不读宿主时间、随机或调度，全部同步；由 lint 与依赖图回归共同检查（[Lint 规则](../README.md#lint-规则eslintconfigjs)）。

### 表现模块

[flight-presentation.ts](../../../src/render/flight/presentation/flight-presentation.ts) 实现 [FS-07](../../plan/p3/02/spec.md#fs-07-表现层的只读接口renderflight不在-core) 的只读接口，类型在 [presentation-contract.ts](../../../src/render/flight/presentation/presentation-contract.ts)。渲染器与 P3-14 读同一实例；它不进入 Core、快照或 replay。

- **创建：** `createFlightPresentation({ ownerId, runId, content, initial, random, effects?, destructionCamera? })` 在 tick 0、首帧之前创建：先核对内容（`checkPresentationContent`：列表 1、2 非空，所列动画存在且有帧，帧数一致，星云列表非空；`ContentContractError`），再按 X8 为每个非空列表抽一次 EXPL 子集，最后由原点与单位行给出 tick 0 的相机（运行隔离的选择，不是原版的程序启动值）。`content` 为 `PresentationContent { explosions, animations, nebula }`。
- **随机源：** `presentationRandom(seed)` 由宿主的 uint32 种子创建独立的 `RandStream`，从不触及世界 RNG；支持集与映射按原版，抽取次序不要求一致（spec 技术决定 5）。一个运行只有这一个表现流，飞行 pass 共用它（见[运行接线](#运行接线与逐-tick-推进)）。
- **推进：** `advance({ ownerId, runId, outputs })` 接收帧报告的逐 tick 输出（结构上即 `TickOutput`）。先整体核对：同一 owner 与运行、tick 从上一 tick 起连续、`render` 的 tick 与时钟一致、时钟不倒退，否则 `invalid-input` 且状态不变。逐 tick：步末相机 → 按 `explosion-started` 的次序以步首相机为 Core 爆炸各选择一次（X4：`large` 取列表 1、`missile` 取列表 3、`other` 在平方距离 ≥ 160000 时取列表 2 否则列表 1；`selection.item` 是原列表的序号）→ 表现效果缝 → 丢弃已离开 Render State 的 Core 爆炸选择。整帧处理完后才通知订阅者，每个订阅者每个 tick 一次、按 tick 升序。处理中的任何错误使模块失败，此后的使用为 `invalid-state`。
- **查询与订阅：** `camera()` 为最后处理的 tick 的步末相机；`explosions()` 无副作用地列出已激活且尚未结束的爆炸（`PresentationExplosion`，按激活次序）；`subscribe(listener)` 只通知此后的 tick，迟订阅者从两项查询恢复，不重播；撤销幂等。`dispose()` 幂等，之后拒绝一切使用。重试与新运行都是新实例。
- **相机：** [presentation-camera.ts](../../../src/render/flight/presentation/presentation-camera.ts)。0xC（F1）、1（Warp）以及没有自己相机函数的 6、8、0x13 取观察实体的位姿，没有观察实体时保留上一位姿；0x11 子模式 8 取被毁相机缝的位姿；其他视角为 `unsupported-view`。视口（逻辑像素、含端点）在 0xC、1、6 为 (0, 0)–(639, 315)，在 8、0x11、0x13 为 (0, 0)–(639, 479)。
- **表现效果（13）：** [presentation-effects.ts](../../../src/render/flight/presentation/effects/presentation-effects.ts) 的 `createPresentationEffects({ content })` 经 `effects` 缝每 tick 在 Core 激活之后按原版的遍次序推进一次：机体爆炸的额外爆炸（X2、X3）、事件 0x10 与判别值 1、2 的碎片（X5）、带标志碎片到期的再爆炸（X7）与闪光检查（`0x24314`）；区域检查用 Render State 的 `activeAreaCentre`，从不用相机。缝的上下文 `PresentationEffectsStep` 只在本 tick 的 `step` 内有效：`reserveObject` 在分配前计入预算，`activate`、`move`、`end`、`releaseObject` 与 `nextFragmentKey`；`step` 必须同步。渲染器另读 `fragments()`（尚未离开的判别值 1、2 碎片，按创建次序，20 绘制）与 `flashRequests(tick)`（最近 `FLASH_REQUEST_TICKS` = 5 个已处理 tick 的闪光请求，21 推进屏幕闪光）。
- **被毁视角相机（14）：** [destruction-camera.ts](../../../src/render/flight/presentation/destruction-camera/destruction-camera.ts) 的 `createDestructionCamera()` 经 `destructionCamera` 缝每 tick（含 tick 0）在相机形成之前推进，只在 0x11/8 返回位姿：每次切换到 0x11/8 的 `view-switched` 以切换时的玩家位姿与 f32 32° 的预转进入；未跟随时按 −30 × 经过秒数沿 R2 后退，跟随实体离表时冻结，跟随时距离每 tick 向 30 缓动四分之一（PV8）；离开视角即丢弃状态。
- **预算与错误：** [presentation-budget.ts](../../../src/render/flight/presentation/presentation-budget.ts) 的 `PRESENTATION_LIMITS`：表现对象 `objects` 4,096（额外爆炸、判别值 1、2 碎片与碎片再爆炸，含等待者），选择缓存 `selections` 为 `CORE_LIMITS.entities` + 4,096 = 6,144，都在分配前核对。`PresentationError` 的 `kind` 为 `presentation-capacity`、`invalid-input`、`unsupported-view`、`invariant-violated`（Core 事实或缝的请求与契约矛盾）与 `invalid-state`（已释放或已终止）；都使运行的消费者故障。

### 渲染器

[flight-renderer.ts](../../../src/render/flight/renderer/flight-renderer.ts) 的 `createFlightRenderer({ ownerId, surface, reportError })`；表面无法创建时传 `{ ownerId, unavailable, reportError }`，渲染器只报告原因。它没有循环、不请求帧：运行的帧消费者调用 `draw`。

- **状态：** `getSnapshot()` 给出 `{ state, error }`（两次变化之间为同一对象，可用于 `useSyncExternalStore`），`subscribe` 只在状态变化时通知、开始释放后不再通知。状态为 `ready`、`context-lost`（丢失到恢复之间不提交任何绘制，恢复后只重建 GPU 映射并从当前状态重画）、`unavailable`（没有表面）、`failed` 与 `disposed`，`failed` 与 `unavailable` 附原始错误。
- **失败分类：** 只有图形设备自己的失败不中止会话：表面无法创建（`GraphicsUnavailableError` → `unavailable`），以及表面认定为设备失败的绘制（`GraphicsDeviceError`，先释放运行的资源再进入 `failed`）。其他任何失败都立即使渲染器 `failed` 并从 `draw` 抛出，在帧外发生时（布局变化或重画）从下一次 `draw` 或 `beginRun` 抛出，使会话 `consumer` 故障或阻止开始，不静默回退。`FlightRenderError`（[flight-render-error.ts](../../../src/render/flight/renderer/flight-render-error.ts)）的 `kind` 为 `render-capacity`、`invalid-state`、`invalid-input` 与 `unsupported-view`（F2–F10 与 0x11 的其他子模式归 P4）。
- **运行：** `beginRun(binding, settings, plan?)` 先按 `FLIGHT_GPU_LIMITS`（纹素 2²⁵、顶点 2¹⁸、索引 2¹⁸、渲染目标 4 个，FS-07）核对整个运行的 GPU 计划（超出为 `render-capacity`，什么也不分配），以 `settings`（`data/scene-settings`）的设备值建场景（不按 +0x1C < +0x20 < +0x24 排列、或 +0x1C 不大于前平面时为 `invalid-input`），再把运行绑定到 owner、run、资源包代际与完整内容身份（`FlightRunBinding`），一次只绑定一个运行。返回的 `FlightRunRender` 有：
  - `resources`：运行自己的 [FlightGpuCache](../../../src/render/flight/renderer/flight-gpu-cache.ts)，按键共享几何、材质、纹理与渲染目标并计入预算，每次取得先声明大小、分配前再核对、创建结果须为所声明的大小；渲染目标随绘制缓冲大小，布局变化后由 pass 重新取得；不跨运行共享，绑定不符或释放后到达的结果只释放、不接管；
  - `draw(frame)`：`FlightFrame` 为 `{ runId, render, projection, cameras }`，`cameras` 为表现模块的上一与当前步末相机；就绪且有布局时由场景与合成绘制一帧，否则不提交；
  - `addLayer(layer)` 与 `setScreen(screen)`：在运行的合成中加入一层或替换屏幕阶段，各返回幂等的撤销；
  - `release()`：释放运行的全部 GPU 资源，幂等；失败抛 AggregateError，之后不再开始运行。
- **重画：** 上下文恢复与布局变化都会清空绘制缓冲，渲染器随即重画绑定运行的最后一帧而不推进任何东西，所以暂停或保持中的运行（没有帧）保留画面。
- **诊断：** `diagnostics()` 为 `{ state, runId, draws, lastTick, gpu, resources, layout }`：成功绘制次数、最后绘制的 Render State tick、表面的 GPU 计数（无表面为 null）、运行缓存的计数（`FlightGpuCounts`，无运行为 null）与布局。开发面板的 Flight render 区块按需读取（[UI 模块说明](./ui.md#开发诊断)）。
- **释放：** `dispose()` 先释放绑定的运行，再释放表面；每步都尝试，失败汇总为 AggregateError，幂等。
- **应用接线：** 任务所有者的 `media` 阶段消费者（[app 模块说明](./app.md#飞行画面)）。

### 运行接线与逐 tick 推进

- **内容准备：** [flight-passes.ts](../../../src/render/flight/renderer/flight-passes.ts) 的 `prepareFlightContent(content)` 每个资源包一次、不用 GPU，把 `FlightRunContent { presentation, settings, passes }`（由 [app 的飞行内容](./app.md#飞行画面)解码）变为 `PreparedFlightContent`：光照模型表面、受击闪烁外壳、对象外观、DATA 调色板、每个爆炸动画按显示次序的帧，以及各 pass 计划之和 `plan`（不含合成自身）。任何 pass 不能绘制的内容都在分配之前拒绝开始（`ContentContractError` 或 `FlightRenderError`），例如：缺少所引用的图像或调色板；爆炸帧不是直接显示于 DATA 或同一动画内尺寸不一；星云图像不是 128 × 128、不透明、直接显示；部件品质为 0 或 4；方向光强度不在 (0, 1]（LS2 的单光路径）或环境光为负；闪光记录的级别不在 0–63 或持续时间不是有限非零（SF4、SF5）；种类 1、2 的机体模型少于 3 个第 1 列表部件（逃生舱，34，`binding-mismatch`）；计划超出预算（`render-capacity`）。
- **接线：** [flight-run.ts](../../../src/render/flight/renderer/flight-run.ts) 的 `wireFlightRun(run, { renderer, binding, content, seed, cockpit? })` 在运行于出发保持中停在 tick 0、首帧之前调用：建 `presentationRandom(seed)`，以 tick 0 的 Render State 建表现效果、被毁相机与表现模块，`beginRun(binding, content.settings, content.plan)`，再 `attachFlightPasses` 把各 pass 加入运行的合成。每项取得随即交给 `run.ownCleanup`，运行结束（含开始失败的回滚）时逆序释放；交不出去的立即释放再抛出。返回 `{ presentation, effects, render, cockpit }`；`cockpit` 的接线见[运行装配](#运行装配p3-1324)，没有它（P3-12 的隔离入口）时为 null。
- **各 pass：** `attachFlightPasses({ content, render, presentation, effects, random, initial })` 按 FC2 的槽位加入：星云（运行开始时以表现流抽一次起点）、星点、速度尘埃、世界（光照模型 → 受击闪烁外壳 → 弹丸、导弹与碎片）、爆炸精灵、Warp 效果，并以 `setScreen` 安装屏幕闪光的屏幕阶段。`dispose()` 移除各层与屏幕阶段并停止精灵的 tick 跟踪；资源都来自运行缓存，随运行释放。
- **逐 tick 推进：** 帧消费者按次序取帧报告的每个 `outputs` 项，先以该一项推进表现模块，再 `passes.step(output, presentation.camera())` 依次推进受击闪烁、屏幕闪光（读该 tick 的 `flashRequests`）、速度尘埃（用该 tick 的步末相机）与 Warp 效果，然后才是下一 tick；全部 tick 之后以上一与当前步末相机绘制一次。这样共享的表现流在 tick 如何分组成帧（1 × 5、5、2 + 0 + 3）时都把同样的抽取交给同一消费者（AC-17）。没有 tick 的帧（含 report 为 null 的静止帧）不推进、不抽取，只重画。因为逐 tick 推进，批次中不连续的 tick 在它之前的 tick 处理完之后才使消费者故障（会话同样故障）。
- **测试支持：** [flight-run.test-support.ts](../../../src/render/flight/renderer/flight-run.test-support.ts) 的 `fakeRun` 是可控的运行句柄，`flightRunContent()`/`preparedContent()` 给出合成内容；场景、表现与各 pass 另有各自目录中的 `*.test-support.ts`。

### 场景与相机

[flight-scene.ts](../../../src/render/flight/scene/flight-scene.ts) 的 `FlightScene` 每个运行一个，`frame({ render, cameras })` 只读 Runtime 的两份 Render State、alpha 与表现模块的相机，不推进任何东西；重画同一帧得到同样的结果。

- **视角：** `flightViewKind(viewMode, subMode)`：0xC 为 `flight`，1 为 `warp`，0x11/8 为 `destruction`，6、8、0x13 为 `no-world`（不画世界，只有驾驶舱槽）；其他视角为 `unsupported-view`。
- **折叠：** 视角或子模式、观察或跟随实体、Warp 过程改变，或两份 Render State 不是相邻 tick（保持、暂停时显示当前状态）时不插值；实体只从上一状态中同 ID、同放置序号且已绘制的条目插值，否则画在当前位姿（PV6）；0xC 与 1 的相机不跨观察实体的放置序号变化插值。
- **可见集合（PV6）：** `display` 为 `shown` 的实体（`pending`、`hidden`、`released` 都不画），地图标记除外；F1 与 Warp 中不画观察实体本身。爆炸为精灵列出，各 pass 只画自己的表现。
- **姿态：** [drawn-pose.ts](../../../src/render/flight/scene/drawn-pose.ts) 按库的规则由 R2、R1 正交化（拒绝时沿用上一姿态），规则读取者仍用存储的行；插值为位置线性、姿态沿较短弧旋转（四元数 slerp），alpha 0 恰为上一位姿。
- **投影（PV3–PV5）：** [projection.ts](../../../src/render/flight/scene/projection.ts) 为纯运算：相机空间 x 右、y 上、z 远离观察者；F1 与 Warp 中 sx = 320 + 640·x/z，sy = 158 − 640·y/z；前平面 1，远平面 B 按列出且未 `released` 的实体（判别值 3 碎片按来源种类）取 +0x1C、+0x20 或 +0x24（PV4）。

### 画面合成

[flight-layers.ts](../../../src/render/flight/composition/flight-layers.ts) 定义层与帧，[flight-composition.ts](../../../src/render/flight/composition/flight-composition.ts) 按运行组合它们（[spec：画面合成与 P3-13 接口](../../plan/p3/12/spec.md#画面合成与-p3-13-接口)）。

- **逻辑画面：** [logical-screen.ts](../../../src/render/flight/composition/logical-screen.ts)：640 × 480，原点左上，y 向下；以一个缩放比（缓冲宽度 ÷ 640）映射到绘制缓冲，窗口、宽高比与像素比只改变缩放比，不改变逻辑位置、视野或可见内容；4:3 布局使逻辑画面底边与缓冲至多差一个设备像素。世界相机以原版投影把相机空间映射到游戏图像，并向左偏移半个逻辑像素（`RASTER_OFFSET_X` = −0.5）：WebGL 按像素中心采样，在每逻辑像素一个设备像素时由此复现原版的列 ⌊xl⌋ ≤ x < ⌊xr⌋ 与行 round(y)（RS1、RS2，恰好相等的情形除外）；y 不偏移。
- **游戏图像与屏幕阶段：** 每帧各层先画入一张绘制缓冲大小的游戏图像（运行缓存中的渲染目标，布局变化后重新取得），从黑色开始，代表原版持久帧缓冲与逐层擦除的结果（FC3，高概率）；深度是 24 位 `DepthTexture`，经 `CompositionFrame.depth` 交给精灵。然后屏幕阶段把它画到已清为黑的画布上：缺省原样复制，屏幕闪光以 `setScreen` 替换为调色板变换与平移，因此闪光作用于整幅 4:3 画面（含将来的驾驶舱与 HUD），不作用于画面外的黑边与 React 控件。
- **层位与次序（FC2）：** `FLIGHT_LAYER_SLOTS` 为 `nebula`、`stars`、`dust`、`world`、`sprites`、`warp-effect`、`cockpit`。`LAYER_ORDER`：F1 与被毁视角为星云、星点、速度尘埃（单点）、世界、精灵、驾驶舱，只有这两类视角清除世界深度；Warp 为星点、世界、速度尘埃（线段，在世界之后）、Warp 效果、驾驶舱，不清深度（RS6：保留最后一次清除的深度，跨越其间的地图或基地帧）；6、8、0x13 只有驾驶舱槽。同一槽可有多层，按加入次序绘制；层只在其槽所在的视角被调用。二维层中只有精灵读深度，都不写深度，所以世界之前的层不得写深度（FC5）。
- **层的接口：** `FlightLayer { slot, passes(frame) }` 每帧返回若干 `LayerPass { scene, camera, target?, clearColor?, clearDepth?, scissor? }`：目标缺省为游戏图像（屏幕阶段缺省为画布），层只清除自己的目标，世界槽的 pass 缺省裁剪到世界视口。`CompositionFrame` 只读：`logical`（逻辑变换）、`viewMode`、`subMode`、`view`、`render`（Runtime 的两份 Render State 与 alpha）、`projection`（会话帧给出的最新 projection）、`world`（`{ scene, camera, viewport }`，无世界视角为 null）、`logicalCamera`（按逻辑像素 (x, y) 画入游戏图像）与 `depth`（只能在画入自己的目标时采样）。`FlightScreen.passes(frame, image)` 把游戏图像纹理画到画布。合成在一次 `RenderSurface.drawPasses` 中提交整帧。

### 各 pass

运行开始时由 `attachFlightPasses` 接入；GPU 计划都并入 `PreparedFlightContent.plan`。每个 tick 推进的 pass 在[逐 tick 推进](#运行接线与逐-tick-推进)中按次序调用，绘制只读最近一个 tick 的状态与本帧的绘制相机。

| 槽 | 模块 | 要点 |
|---|---|---|
| `nebula` | [nebula-layer.ts](../../../src/render/flight/nebula/nebula-layer.ts) | `selectNebulaImages` 在运行开始时以表现流均匀抽取起点（技术决定 8 的项目选择），六个槽依次取列表的下一项；每帧按绘制相机的行放置，至多一个可见，逐逻辑像素按原版旋转 blit（NB1–NB4），裁到视口底边；不受 BACKGROUND DETAIL 设置影响，总是绘制（用户 2026-10-17 的决定）。`NEBULA_GPU_PLAN` |
| `stars` | [starfield-layers.ts](../../../src/render/flight/starfield/starfield-layers.ts) | 500 个固定方向（`WatcomRand` 复现原版默认 `rand` 序列的第 1–1000 次抽取，不用表现流，SD2）只随相机行投影（SD3）；无状态。`STAR_FIELD_GPU_PLAN` |
| `dust` | [speed-dust.ts](../../../src/render/flight/starfield/speed-dust.ts) | 50 个粒子，每 tick `step({ render, events, camera })` 一次（SD4–SD7）：份额（`RenderState.speedShare`，FS-12）不超过 1 时初始化之后不再推进、不画；重生与初始化从表现流抽取；F1 与被毁视角为单点，Warp 中为自上一遍位置起的线段。`SPEED_DUST_GPU_PLAN` |
| `world` | [model-lighting-layer.ts](../../../src/render/flight/lighting/model-lighting-layer.ts) | 机体模型的第 0 列表部件：每实体每帧在 CPU 上算光向，GPU 按逐角或逐面亮值取明暗级（LS5–LS7），色阶由源颜色与环境光生成、再取 DATA 最近色（`nearestColourMap`，不做色调映射）；贴图按屏幕空间仿射插值、最近纹素、无 mip、无抖动 |
| `world` | [hit-shimmer-layer.ts](../../../src/render/flight/shimmer/hit-shimmer-layer.ts) | 在光照模型之后。`HitShimmer` 每 tick `advance([output])` 一次（HS1–HS5；有自有外壳的视觉在建块时以一次表现流抽取选择环绕序号）；外壳按带位置与阈值纹理取不透明度，0x7F 时按逻辑像素 (x & 3, y & 3) 的屏幕门图案（HS6） |
| `world` | [effect-objects-layer.ts](../../../src/render/flight/objects/effect-objects-layer.ts) | 弹丸（不受光）、导弹、判别值 3 碎片（Render State）与判别值 1、2 碎片（`effects.fragments()`），复用光照模型的规则（HS7–HS9）；多边形面按扇形三角化，同一面的三角形共用一个面法线（实现取舍与依据见 [20 的完成证据](../../plan/p3/12/subtasks/20-projectile-missile-fragment-render.md#完成证据)，原版文档由 27 更新） |
| `sprites` | [explosion-sprites.ts](../../../src/render/flight/sprites/explosion-sprites.ts) | 在第一个 tick 之前创建，逐 tick 记录前一位置；按 FC6–FC8 排队、排序、分块裁剪，每块以其左上逻辑像素处的世界深度整块显示或隐藏，不写深度；先画入自身目标再复制进游戏图像。`explosionSpritesGpuPlan` |
| `warp-effect` | [warp-tunnel-layer.ts](../../../src/render/flight/warp/warp-tunnel-layer.ts) | 每 tick `step(render)` 一次（WT3、WT4、WT9）：新序号时 40 次模板抽取，每 tick 60 次环边抽取，只在视角 1 且有 `warp` 时绘制，与世界同用插值后的绘制相机。`WARP_TUNNEL_GPU_PLAN` |
| 屏幕阶段 | [screen-flash.ts](../../../src/render/flight/flash/screen-flash.ts)、[flash-screen-stage.ts](../../../src/render/flight/flash/flash-screen-stage.ts) | `createScreenFlashes({ records, random })` 每 tick `step` 一次（SF1–SF4、WT3、WT4、WT7、HS1）：视角切换使表回到 0，更新抽取平移，开始由 Warp、撞墙、闪光请求与玩家受击触发；`FlashScreenStage` 对整幅图像做 e(min((c >> 2) + 2k, 63)) 的调色板变换并上移 (r AND 0xFFFE)/2 行（取整到设备像素），露出的行为黑。`FLASH_SCREEN_GPU_PLAN` |
| `cockpit` | — | P3-13 的驾驶舱层（[运行装配](#运行装配p3-1324)） |

### 飞行的呈现约定与已知差异

| 项 | 选择 | 依据 |
|---|---|---|
| 颜色 | 最终颜色都是 DATA 调色板的颜色：纹理不解码颜色空间、不做色调映射，画布输出不编码（`FLIGHT_SURFACE`）；屏幕闪光是作用于整幅画面的调色板空间变换 | spec 技术决定 4 |
| 手性与姿态 | 网格顶点 (x, y, z) 位于 P + x·X + y·U + z·D，(X, U, D) 为库由 R2、R1 正交化的行，作为真旋转直接使用，不换轴 | PV5 |
| 剔除 | 原版保留屏幕顺时针、(b − a) × (c − a) 朝向相机的三角形（RS4）；相机空间相对 WebGL 是镜像的，这些是 WebGL 的背面，所以模型、外壳与对象都用 `BackSide`。16 的交接说明中“正面为逆时针（屏幕顺时针）”的写法以此为准更正 | RS4；17 以实际投影矩阵测试 |
| 深度 | 新值 ≤ 存储值时绘制并写入（RS5）；精灵按 FC8 读深度 | RS5、FC8 |
| 逻辑像素图案 | 屏幕门、星云、星点、速度尘埃与 Warp 线段都在 640 × 480 逻辑像素网格中生成再放大；绘制缓冲窄于 640 时屏幕门改用设备像素网格（保留覆盖率，不保留相位） | spec 技术决定 3、4 |
| 按 tick 的运算 | 原版按渲染遍推进的被毁相机缓动、判别值 1、2 的自转、速度尘埃与 Warp 隧道，这里每个成功 tick 推进一次；位姿插值与合成仍逐显示帧。原版有零步长与可变步长的帧，节奏不同；只声明运算级一致 | spec 技术决定 1、7 |
| 星云起点 | 以表现流在规范列表上均匀抽取，替代原版的绝对时钟取样 | spec 技术决定 8（项目选择，不标为等价） |
| 激活次序 | 同一 tick 中表现层爆炸的激活排在 Core 爆炸之后；视觉载入在构造所在的 tick 同步完成 | FS-10 决定 8、7（已批准的差异）；CR-11 的差异 1–3 |
| Warp 开始 | 新序号时模板游标归 0、投影暂存清空（原版沿用上一次 Warp 的值，统计上不可区分） | 06 的推荐，22 实现 |
| 内容范围 | 导弹类型越界、部件品质 0（高概率为线框）与 4、未研究的光照路径、超出研究域的闪光记录、未按发行次序排列的 RENS 设备值，以及少于 3 个第 1 列表部件的逃生舱模型，都在开始前拒绝，不复现原版的夹取或未定义行为 | spec 内容输入与校验 |
| 无玩家对象时的受击 | 当前实现开始受击闪烁 | 协调者按 [18 的完成证据](../../plan/p3/12/subtasks/18-hit-shimmer.md#完成证据)决定的取舍；置信度与恢复途径由 27 记入 U-027 |

- **显式限制：** 三维世界按设备像素由 WebGL 的连续光栅化绘制（ADR-0009），不是原版的定点光栅化；按取整行的剔除、无预步进的 16.16 步进与 16 位深度可能在三角形边、纹素或明暗级边界与近共面处使个别像素不同（RS2–RS5、LS7）。光照的 round-half-even(256·d) 在 GPU 单精度中计算，只在 256·d 距半整数几个 f32 步长之内可能与原版不同。外壳的接缝规则在 WebGL 裁剪之前按存储的三角形应用。
- **浏览器未自动验证：** 运行中改变设备像素比的通知（CDP 的模拟像素比不触发 `resolution` 媒体查询，像素比 2 在独立 context 中验证）；速度尘埃的逐粒子位置与 Warp 线段端点（31 的 Node 测试覆盖）；导弹的逐像素外观（20 的 Node 测试覆盖）。见 [25 的完成证据](../../plan/p3/12/subtasks/25-browser-regression.md#完成证据)。
- **暂停中的故障：** 暂停的会话没有帧，渲染器在帧外的失败由 UI 立即提示，会话的故障在恢复后的下一帧发生（[15 的完成证据](../../plan/p3/12/subtasks/15-renderer-lifecycle.md#完成证据)）。

### 针对性检查

- Node：`pnpm exec vitest run src/render/flight`（表现模块单独：`pnpm exec vitest run src/render/flight/presentation`）；规则独立与分组不变的会话集成：`pnpm exec vitest run src/app/session/game-session-presentation.test.ts`；应用接线：`pnpm exec vitest run src/app/mission/flight-consumer.test.ts`；边界：`pnpm exec vitest run tools/engineering-boundaries.test.ts`。
- 浏览器：`pnpm test:e2e e2e/flight-scenes.development.spec.ts e2e/flight-render.development.spec.ts e2e/flight-render.production.spec.ts`（先生产构建，再运行 Playwright）（[本地浏览器 runner](../README.md#本地浏览器-runner) 的飞行用例）。

### 交接

- **P3-13（驾驶舱、HUD 与地图画面）：** 已由 P3-13/24 接入（[运行装配](#运行装配p3-1324)）；以下为当时的接口约定。
  - **接入层：** 在同一画面、同一 WebGL 上下文中以 `FlightRunRender.addLayer` 登记 `slot: 'cockpit'` 的层（可以多个，按加入次序），只按逻辑坐标绘制（`frame.logicalCamera`、`frame.logical`），不自建画布或循环；层画入游戏图像，所以屏幕闪光同样作用于它。运行的 `FlightRunRender` 现在只在 `wireFlightRun` 的返回值中（[flight-consumer.ts](../../../src/app/mission/flight-consumer.ts) 的 `attachRun` 没有保留它）；P3-13 在同一接线中取得它，并把自己的 GPU 计划并入运行开始时由 `beginRun` 核对的计划（`addGpuPlans`），使预算在任何分配之前核对；资源从 `render.resources` 取得，随运行释放。
  - **视角信息：** 每帧的 `CompositionFrame` 给出 `viewMode`、`subMode`、`view`、当前 Render State（`render.current`）与最新 projection（总计划 §5：HUD 逐帧读取，不经 store）；世界视口（`world.viewport`，F1 与 Warp 为行 0–315）以外的区域目前为黑。驾驶舱槽在每个视角都被调用，6、8、0x13 只有它；视角标签、地图与基地画面由 P3-13 按视角决定。一次性提示可用 `view-switched`（FS-11）。
  - **在制提示（已由 P3-13/25 完成）：** 驾驶舱与 HUD 接入后，覆盖飞行区域的驾驶舱在制提示已移除，[mission-copy.ts](../../../src/ui/mission/mission-copy.ts) 的 `MISSION_SKELETON` 不再说没有驾驶舱与 HUD，`FLIGHT_IN_PROGRESS` 只剩 P3-14 的音效，显示在画面之外的状态栏（[在制标注](../slice-gaps.md#在制标注非-g-项)）。
- **P3-14（飞行音效）：**
  - **`PresentationTick` 与激活流：** 读同一运行的同一表现模块实例（`wireFlightRun` 返回的 `presentation`，目前同样未经 flight consumer 暴露，P3-14 在该接线中取得）。`subscribe` 每个 tick 通知一次 `PresentationTick { ownerId, runId, tick, clock, beforeStep, afterStep, activations }`；`wireFlightRun` 逐 tick 推进，所以通知在该 tick 的 pass 推进之前、本帧绘制之前到达。`activations` 先列 Core 爆炸（`origin.eventIndex` 为其 `explosion-started` 在该 tick 事件中的下标），再列表现层爆炸；每次激活只通知一次，迟订阅者从 `explosions()` 恢复、不重播；静止帧没有通知；重试是新实例。爆炸音效取所选 EXPL 项（`selection`）的声音，不另行抽取。
  - **相机：** 听者用 `afterStep`（未插值、tick 结束时，所有支持的视角都有；6、8、0x13 为座机位姿）；`viewport` 是含端点的逻辑像素矩形，不输出投影坐标；退化的被毁相机可给出零行。
  - **与驾驶舱的关系：** P3-13 的 D-02 定稿不建共享提示模型，锁定与警告的声音另读同 tick projection，见 P3-13 的[交接](#交接p3-13)。
  - **09 记录的接口差异（交其 D-02）：** 见 [09 的完成证据](../../plan/p3/12/subtasks/09-d01-contract-gate.md#完成证据)的对齐表：同 tick 的表现层激活排在 Core 之后（FS-10 决定 8，已批准）；运动块速度、`shot-fired` 与 `hit` 的行与速度不在 D-01 中，须 P3-14 按 P3-02 扩展规则另加；“移除”以 `display: 'released'` 还是离表为准、`explosion-created`、`view-switched` 与 `warp-wall-contact` 的处理分类、爆炸存活期内是否重放，由 P3-14 决定。
- **P3-15（联合验收）：**
  - **被毁视角的真实流程：** P3-12 交付时 P3-11 尚未接入被毁进入，所以被毁相机只以合成状态验证（14 的 Node 测试，25 的隔离入口 `flight-scenes` 的 destruction view 用例），不计为 P3-12 已走通。P3-11 现已接入；真实的死亡、被毁视角、救援转换与 F1 门禁仍由 P3-15 在真实规则输出下验证（P3-13 的真实内容运行也未到达被毁视角，见 P3-13 的[交接](#交接p3-13)）。
  - **对照证据的位置：** 原版事实与置信度在 executable 的 [Flight scene rendering (P3-12)](../../original/formats/executable.md#flight-scene-rendering-p3-12) 与 [unknowns](../../original/unknowns.md)；冻结的对照方案在被忽略的 `local/research/p3-12/comparison-plan/`（`plan.md` 与星点、速度尘埃附录 `addendum-q14.md`，指纹见 [08](../../plan/p3/12/subtasks/08-original-records-comparison-plan.md#完成证据)、[30](../../plan/p3/12/subtasks/30-stars-speed-dust-research.md#完成证据) 的完成证据）；真实内容配对（[26](../../plan/p3/12/subtasks/26-real-content-comparison.md)）与表现判定（[27](../../plan/p3/12/subtasks/27-presentation-verdicts.md)）在本文写成时尚未完成，按计划分别输出到被忽略的 `local/research/p3-12/real-content/` 与 `local/research/p3-12/verdicts/`，完成后由各自的完成证据记录结构、计数与判定，P3-15 以那里为准；浏览器的合成读回与上述未自动验证的项见 [25 的完成证据](../../plan/p3/12/subtasks/25-browser-regression.md#完成证据)。
