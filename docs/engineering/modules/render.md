---
type: guide
status: active
phase: all
updated: 2026-10-08
related: [ADR-0015]
---

# 渲染模块说明

本文件是[源码结构指南](../source-structure.md)的模块分册，记录 `src/render/` 中已交付代码的当前 API 与契约要点。目录树、职责边界与 helper 归属以指南为准，行为契约以各任务 spec 为准；修改本模块代码的任务同步更新本文件。

`render/` 由 P1-07 逐步交付（契约见 [P1-07 spec](../../plan/p1/07/spec.md)）：目前有 DOM-free 的 4:3 视口布局、合成帧校验与插值、固定合成相机、合成外观、绘制端口与合成渲染器，以及 WebGL 表面（DOM-free 生命周期加 `browser-*` 浏览器工厂）；P2-11 新增 `render/viewer/` 的资源查看渲染（见[资源查看渲染](#资源查看渲染)）。

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
- **表面选项：** [render-surface.ts](../../../src/render/scene/render-surface.ts) 的 `RenderSurfaceOptions` 由画在表面上的渲染逻辑选择，含画布的无障碍名称与渲染器的输出颜色空间。浏览器工厂 `createBrowserWebGLSurface(container, options)` 按它设置画布与渲染器；应用端口 `createSurface(container, options)` 同样接收它。合成演示传 `SYNTHETIC_SURFACE`，即原来的名称与 Three.js 默认的 sRGB 输出，行为不变；查看器传 `VIEWER_SURFACE`。
- **测试替身：** `RecordingSurface` 只记录可见的网格，并按材质上的纹理模拟纹理计数。
