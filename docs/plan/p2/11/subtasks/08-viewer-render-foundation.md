---
type: plan
status: active
phase: P2
task: "11"
subtask: "08"
updated: 2026-10-10
---

# 08 — 查看渲染基础与二维项

**契约来源：** [spec](../spec.md) 的 S-07、S-09（颜色空间、过滤与量化）、AC-12（Node）、AC-14（绘制计数），以及[查看项与渲染](../spec.md#查看项与渲染)中的图像、调色板、布局、字库与按需绘制，[呈现约定](../spec.md#呈现约定)。
**依赖：** 无。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 新增 DOM-free 的查看渲染（`src/render/viewer/`），接收 [render-surface.ts](../../../../../src/render/scene/render-surface.ts) 的 `RenderSurface`，或在表面不可用时只报告原因。
  - **状态与诊断：** `ready`、`context-lost`、`failed`、`unavailable`、`disposed`，失败附原始错误；诊断含绘制次数与 GPU 计数（来自 `gpuStats()`）。
  - **按需绘制：** 只在显示项变化、视图参数变化、尺寸或像素比变化与上下文恢复时同步绘制一次；视图参数未变时不绘制；不请求动画帧。
  - **布局：** 用 [viewport-layout.ts](../../../../../src/render/viewport/viewport-layout.ts) 的 4:3 布局。
  - **释放：** 释放全部几何、材质、纹理，再释放表面，按 [cleanup.ts](../../../../../src/render/scene/cleanup.ts) 的方式尝试每一步；释放后迟到的回调不再绘制。
- **二维显示项：**
  - 图像：`expandImage` 的 RGBA 上传为数据纹理，按整数倍放大居中，透明处显示中性棋盘格；
  - 调色板：每行 16 个色块；
  - 布局：`composeLayout` 的结果覆盖整个 4:3 区域；
  - 字库：按字形序号排成网格，白字黑底。
- **呈现约定（二维部分）：** 纹理不做颜色空间转换，最近邻过滤，不生成 mipmap，渲染器不做 tone mapping；读回的字节等于源字节。约定集中在一处，写入[源码结构](../../../../engineering/source-structure.md)并标注置信度。
- [browser-webgl-surface.ts](../../../../../src/render/webgl/browser-webgl-surface.ts) 的画布无障碍名称改由调用方提供；合成演示传原来的文字，行为不变。
- **Node 测试**（用 Three.js 对象与录制用的表面替身 [render-surface.test-support.ts](../../../../../src/render/scene/render-surface.test-support.ts)）：
  - 上传的纹理数据与 `expandImage`、`composeLayout` 的结果逐字节相同；
  - 调色板色块与字形单元的像素正确；
  - 纹理的颜色空间、过滤与 mipmap 设置；
  - 绘制计数：变化时恰好一次，未变时为零；
  - 状态转换与释放后 GPU 计数为零；
  - 上下文丢失后不绘制，恢复后重画。

## 不包含

- 模型与效果（09）；所有者、音频与 React 页面（10、11）；浏览器像素读回（11）。

## 关键文件与契约

- 计划新增 `src/render/viewer/` 的模块与相邻测试；修改 [browser-webgl-surface.ts](../../../../../src/render/webgl/browser-webgl-surface.ts) 及其调用方。
- 复用：[expand-image.ts](../../../../../src/content/graphics/expand-image.ts)、[compose-layout.ts](../../../../../src/content/graphics/compose-layout.ts)、[font-payload.ts](../../../../../src/content/graphics/font-payload.ts)、[glyph-lookup.ts](../../../../../src/content/graphics/glyph-lookup.ts)、[palette-payload.ts](../../../../../src/content/graphics/palette-payload.ts)；参照 [synthetic-renderer.ts](../../../../engineering/source-structure.md#r2-合成渲染) 的状态与释放模式。

## 验收标准

- [x] AC-12（Node）：纹理数据与 `expandImage`、`composeLayout` 逐字节相同；调色板与字形单元的像素正确。
- [x] AC-14（Node）：绘制计数在变化时恰好一次、未变时为零；不请求动画帧；释放后 GPU 计数为零；上下文丢失与恢复的行为如上。
- [x] 呈现约定的二维部分（颜色空间、过滤、量化）实现于一处，并写入源码结构。
- [x] 合成演示的画布无障碍名称不变，现有渲染测试通过。
- [x] `render/` 不导入 `original-data`；`pnpm check` 通过。

## 验证方法

- `pnpm exec vitest run src/render`，完成前 `pnpm check`。
- 浏览器像素读回见 11。按 execute-goal 做 rubber-duck 与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据

- **查看渲染：** [render/viewer/](../../../../../src/render/viewer/)，DOM-free，结构与约定见[源码结构](../../../../engineering/modules/render.md#资源查看渲染)。
  - [viewer-renderer.ts](../../../../../src/render/viewer/viewer-renderer.ts) 的 `createViewerRenderer` 接收 `RenderSurface`，或在表面不可用时只报告原因。状态为五种，失败附原始错误；诊断含绘制次数、`gpuStats()`、布局与画面位置 `placement`。
  - `show(item | null)` 的查看项携带内容消费函数的结果（`expandImage`、`composeLayout` 的结果，调色板与字库 payload）。读取与展开留给 10 的所有者，内容错误因此只标记该项。
  - [viewer-display.ts](../../../../../src/render/viewer/viewer-display.ts) 的每个显示独占自己的几何、材质与纹理。换项时先建新显示再释放旧显示，没有跨项存活的 GPU 资源。
  - [viewer-pictures.ts](../../../../../src/render/viewer/viewer-pictures.ts) 是纯函数：调色板色块表、字形表与整数倍或覆盖的画面位置。
- **呈现约定（二维）：** 集中在 [viewer-presentation.ts](../../../../../src/render/viewer/viewer-presentation.ts)：
  - 纹理为 `NoColorSpace`、最近邻、无 mipmap、不翻转；
  - 材质不做 tone mapping，以 alpha 测试处理二值透明；
  - 8 位字节原样进出，没有浮点量化，浮点颜色的量化归 09。
  - **与计划的差异：** 逐字节读回要求查看器画布的输出颜色空间为线性 sRGB；Three.js 默认为 sRGB，会对着色器输出再做编码。因此浏览器表面工厂除无障碍名称外，还接收输出颜色空间：[render-surface.ts](../../../../../src/render/scene/render-surface.ts) 的 `RenderSurfaceOptions`，与 `AppPorts.createSurface(container, options)`。
  - 合成演示传 [SYNTHETIC_SURFACE](../../../../engineering/source-structure.md#r2-合成渲染)，即原名称与默认的 sRGB 输出，行为不变；查看器传 `VIEWER_SURFACE`。
- **Node 测试：** [viewer-pictures.test.ts](../../../../../src/render/viewer/viewer-pictures.test.ts)、[viewer-renderer.test.ts](../../../../../src/render/viewer/viewer-renderer.test.ts)，合成数据在 [viewer.test-support.ts](../../../../../src/render/viewer/viewer.test-support.ts)。
  - **AC-12：**
    - 上传的纹理数据与 `expandImage`、`composeLayout` 的结果逐字节相同，并共用其缓冲；颜色空间、过滤、mipmap、翻转与材质设置均已断言。
    - 1、3、16、20、256 项调色板的每个色块等于对应条目；4 种字库形状的每个字形单元等于字形位，单元以外的位与行不显示；格线与末行透明单元也已断言。
    - 一个按 Three.js 的相机、网格变换、UV、纹理变换、最近邻、alpha 测试与绘制顺序计算像素的辅助函数，逐像素核对图像（行 0 在上、整数倍、棋盘格透出）与布局（覆盖整个缓冲）。证伪：去掉二维四边形的 v 翻转后，两条方向用例失败。
  - **AC-14：**
    - 换项、布局与像素比变化各绘制恰好一次；相同的项（同一对象或同种类、ID、内容）与相同布局不绘制；首次布局前不绘制。
    - 在 10 个条目之间切换后，GPU 计数等于只显示最后一项时的计数，`show(null)` 后为零。
    - 上下文丢失期间换项与改布局都不绘制，恢复后重画一次。
    - 绘制失败或画面无效时为 `failed`，此后不再绘制；无效画面不改变当前项。
    - 释放顺序为撤销观察 → 显示的 5 个资源 → 表面，此后 GPU 计数为零、迟到的回调不绘制、不通知；释放失败汇总为 AggregateError；连接失败的回滚失败为 `RollbackError`。
    - 不请求动画帧由既有的渲染边界回归覆盖。
  - [RecordingSurface](../../../../../src/render/scene/render-surface.test-support.ts) 现在只记录可见网格，并统计材质上的纹理；合成渲染器的测试不变且通过。
- **浏览器（按 browser-testing，本机 Chrome、开发服务器 127.0.0.1:4283、640×480、DPR 1，只用合成数据）：**
  - [interaction-render.spec.ts](../../../../../e2e/interaction-render.spec.ts) 新增画布无障碍名称断言：仍为原文字。两条用例都通过，合成画面的颜色仍在 ±3 内；[webgl-unavailable.spec.ts](../../../../../e2e/webgl-unavailable.spec.ts) 也通过。
  - 临时的本地读回检查（未提交，已删除）经真实模块绘制一个 16×16、覆盖全部字节值并含透明纹素的画面：
    - 640×480 的 307,200 个像素全部等于期望的纹素或棋盘格灰度，最大误差 0；
    - 以 sRGB 输出对照时 229,500 个像素不同，最大误差 73；
    - `show(null)` 后真实 `renderer.info` 的三项计数都为 0；释放后画布已断开。

    这是 11 的像素读回之前对方案的验证，不代替 11。
- **检查：**
  - `pnpm exec vitest run src/render`：9 个文件 379 条通过；
  - `pnpm check`：147 个文件 4,407 条测试，lint 与构建通过。lint 与[边界回归](../../../../../tools/engineering-boundaries.test.ts)确认 `render/` 不导入 `original-data`，新模块都在 Node 程序中。
- **Rubber-duck：** 三项全部采纳。
  - 换项先释放后构建：改为先建新显示，构建失败时场景不变，也便于 09 共享纹理。
  - 棋盘格与四边形随渲染器存活，加入三维项后 GPU 计数会依赖浏览历史：改为每个显示独占资源，并补 `show(null)` 归零的测试。
  - 源码结构缺少约定记录：已补。
- **Simplify：** 采纳三项：
  - 字形与色块表直接写通道，不逐像素分配数组；
  - `ViewerDisplay.place` 不再为假想的三维显示返回 null；
  - 测试辅助函数直接接收材质。

  未采纳，原因如下：
  - 渲染器间共用的生命周期控制器：需要改动 P1 合成渲染器，超出本子任务；
  - 跨项共享棋盘格与材质：与上面采纳的“GPU 计数只取决于当前项”冲突；
  - 把表面选项移到浏览器工厂：DOM-free 的查看模块须引用它，不能依赖浏览器模块；
  - 删去测试中的像素计算辅助函数：它是 Node 中唯一端到端的方向证据，已证伪有效；
  - 不可用分支的 `reportError`：与合成渲染器的选项形状保持一致。
- **文档影响：**
  - [源码结构](../../../../engineering/source-structure.md)：新增目录与“资源查看渲染”一节，二维约定附置信度；
  - [工程约定](../../../../engineering/README.md)的合成渲染一节：注明表面选项由调用方指定；
  - STATUS、阶段索引与原版文档无需更新：阶段摘要与下一步不变，也没有新的原版事实。
