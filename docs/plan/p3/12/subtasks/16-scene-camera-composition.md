---
type: plan
status: active
phase: P3
task: "12"
subtask: "16"
updated: 2026-10-17
---

# 16 — Render State 消费、相机投影与画面合成

**契约来源：** [spec](../spec.md) 的 S-02、S-03、S-12、AC-04、AC-05、AC-16；[Render State 的消费](../spec.md#render-state-的消费)、[相机、投影与视口](../spec.md#相机投影与视口)、[画面合成与 P3-13 接口](../spec.md#画面合成与-p3-13-接口)。
**依赖：** 01, 03, 10, 14, 15。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 计划新增 `src/render/flight/scene/` 与 `src/render/flight/composition/`：
  - 插值：同 ID、同放置序号时位置线性、姿态在正确手性的渲染坐标中做旋转插值；新 ID、放置序号变化、视角或子模式切换、观察或跟随对象切换、Warp 序号变化与 run 变化都不跨界插值；暂停与 0 tick 帧只重画。
  - 可见集合：按 Render State 与 Q-10；`map-marker` 不画；观察实体在 F1 与 Warp 中不画；被毁源与源释放的显隐按 10 的字段。
  - 相机与投影：F1 与 Warp 的显示相机；被毁视角取 14 的相机；视口、视场、投影中心、取整与近远裁剪按 Q-01，在 640×480 逻辑画面中表示；坐标转换按 Q-13。
  - 合成：逻辑画面到绘制缓冲的等比变换；按 Q-03 定稿的层次；供 P3-13 登记层的接口（逻辑变换、视角与子模式、当前 Render State、最新 projection）。
- 把场景与合成接入 15 的渲染器。
- 测试：插值与折叠边界、可见集合、合成点的逻辑屏幕坐标与原版公式一致、窗口与像素比变化不改变逻辑投影、测试层在指定逻辑位置绘制。

## 不包含

- 光照、受击闪烁、星云、效果、精灵、闪光与隧道（17 至 22）。

## 关键文件与契约

- 计划新增：`src/render/flight/scene/`、`src/render/flight/composition/`。
- 输入：15 的渲染器、14 的被毁视角相机、10 的 Render State 字段。

## 写入范围

- `src/render/flight/scene/**`：插值、可见集合、相机与投影。
- `src/render/flight/composition/**`：逻辑画面、层次与 P3-13 接口。
- `src/render/flight/renderer/**`：接入场景与合成。
- `src/render/scene/render-surface.ts`、`src/render/scene/render-surface.test-support.ts`、`src/render/webgl/webgl-surface.ts`、`src/render/webgl/webgl-surface.test.ts`：多遍绘制的增量端口（渲染目标、清除与裁剪），查看器行为不变。
- `src/app/mission/flight-content.ts`、`src/app/mission/flight-consumer.ts` 及其测试：解码 `data/scene-settings` 并传入飞行运行。
- `src/original-data/conversion/flight-data.test-support.ts`：合成生产 RENS 的设备值按原版顺序（+0x1C < +0x20 < +0x24），使运行开始的远平面校验可通过。

## 验收标准

- [x] AC-04：插值、折叠与可见集合的每项断言通过；0 tick 帧不推进。
- [x] AC-05：视口、视场、投影中心、取整与近远裁剪等于 Q-01；合成点坐标与原版公式一致；窗口与像素比变化不改变逻辑投影与可见对象。
- [x] AC-16：等比变换（最多一设备像素的取整差）、层次与测试层通过。
- [x] `pnpm exec vitest run src/render/flight` 通过。

## 验证方法

- Node 测试（记录表面）；浏览器部分由 25 验证。

## 完成证据

2026-10-17，worker `exec-p3-12-16`（基于 f24b5275；协调者在 f251f58b 与 f24b5275 按 scope-request 扩大了写入范围）。本子任务没有运行基准环境（DOSBox-X），不新增原版事实。

- **端口增量（多遍绘制）：** [render-surface.ts](../../../../../src/render/scene/render-surface.ts) 增加 `drawPasses(passes)`：每遍给出场景、相机、渲染目标（null 为画布）、整目标清除颜色/深度与左上原点的设备像素裁剪；[webgl-surface.ts](../../../../../src/render/webgl/webgl-surface.ts) 以 `autoClear = false`、黑色清除、渲染目标自带的 scissor 与画布的 `setScissor`（y 翻转）实现，结束时恢复画布与 `autoClear`，丢失上下文上的失败为 `GraphicsDeviceError`；[RecordingSurface](../../../../../src/render/scene/render-surface.test-support.ts) 记录每帧各遍并按首次使用计入渲染目标纹理。`draw` 与查看器不变。
- **场景（`src/render/flight/scene/`）：**
  - [drawn-pose.ts](../../../../../src/render/flight/scene/drawn-pose.ts)：PV5 的库朝向（dir = R2、up = R1，拒绝时保持该帧上次接受的朝向，新帧为单位矩阵），行 (X, U, D) 满足 U × D = X，在游戏世界坐标中为正常旋转；位置线性插值，姿态用四元数沿短弧插值，alpha 0 精确为前一位姿。
  - [projection.ts](../../../../../src/render/flight/scene/projection.ts)：相机空间 (R0·d, R1·d, R2·d)；PV3 的 sx = F(cx + 2x·half/z)、sy = F(cy − 2y·half/z)（F1/Warp 的 (320, 158)，0x11 的 (320, 240)）；视体为视口矩形与 f ≤ z < B（kx、ky 为 f32）；RS1/RS2 的像素（行就近偶数、列为 16.16 取整后下取整）；PV4 的远裁剪 B = max(+0x1C, 有 0x1C7C 类视觉时 +0x20, 有 0xF8000 类时 +0x24)，判别值 3 碎片按来源种类、`released` 不计。只有按发行数据的次序（+0x1C < +0x20 < +0x24 且 +0x1C 大于前平面）时原版的升高/恢复计数器才等于该最大值，其他次序依赖 pass 内的项目次序与设备重建，读模型给不出，因此按 spec [内容输入与校验](../spec.md#内容输入与校验)在运行开始时以 `invalid-input`（`scene.deviceValues`）拒绝（协调者同意）。
  - [flight-scene.ts](../../../../../src/render/flight/scene/flight-scene.ts)：视角种类（0xC、1、0x11/8 画世界；6、8、0x13 不画；其余 `unsupported-view`）；显示相机在表现模块相邻两 tick 的 `afterStep` 间插值；视角、子模式、观察/跟随对象、Warp 序号变化与两份 Render State 不相邻（暂停/占位/静止帧）时折叠，0xC/1 中观察实体放置序号变化时相机折叠；实体只从上一状态中已绘制、同 ID 同放置序号的条目插值（`pending` → `shown` 从当前位姿开始，PV6）；可见集合为 `shown` 的实体，不含地图标记与 F1/Warp 中的观察实体；库朝向按每份 Render State 与相机只解析一次，重画结果相同，视觉在隐藏或无世界视角中保留、`released` 或离表时丢弃。
- **合成（`src/render/flight/composition/`）：**
  - [logical-screen.ts](../../../../../src/render/flight/composition/logical-screen.ts)：640×480 逻辑画面，缩放为缓冲宽 ÷ 640（两轴相同），逻辑矩形取整为设备像素；逻辑相机（y 向下，z 直通为规范化深度）；世界相机与投影矩阵把相机空间映射到游戏图像，深度为库的 z_p = B(z − 1)/((B − 1)z)。三维几何左移半个逻辑像素（`RASTER_OFFSET_X`）：原版光栅化覆盖 ⌊xl⌋ ≤ x < ⌊xr⌋ 与 round(y_top) ≤ y < round(y_bottom)（RS1、RS2），WebGL 的像素中心采样在每逻辑像素一个设备像素时只有 x 左移 0.5 才相同（恰在边界上除外）；更高像素比下为同一连续映射（ADR-0009，三维按设备像素绘制）。
  - [flight-layers.ts](../../../../../src/render/flight/composition/flight-layers.ts)：层位 `nebula`、`stars`、`dust`、`world`、`sprites`、`warp-effect`、`cockpit` 与 FC2 的次序（0xC 与 0x11/8：星云、星点、速度尘埃、世界、精灵、驾驶舱；Warp：星点、世界、速度尘埃、Warp 效果、驾驶舱；6/8/0x13：只有驾驶舱）；P3-13 接口 `CompositionFrame`（逻辑变换、视角与子模式、当前 Render State、最新 projection、世界视图、逻辑相机）；`FlightScreen` 供 21 替换屏幕阶段。
  - [flight-composition.ts](../../../../../src/render/flight/composition/flight-composition.ts)：每运行一份；游戏图像为本运行 GPU 缓存中缓冲大小的渲染目标（布局变化时换新并释放旧的），每帧先清黑，再按次序画各层（`world` 层默认裁剪到世界视口），然后清画布并由屏幕阶段把游戏图像画到画布（默认 `texelFetch` 逐像素复制），因此 21 的调色板变换与整画面平移作用于完整 4:3 游戏图像（含驾驶舱层），不涉及黑边与 React 控件。深度只在 0xC 与 0x11 清除（RS6/FC2），Warp、地图与基地保留上次清除后的深度；新图像或上下文恢复后重新清除。层与屏幕阶段的登记各返回幂等的移除。
- **接入：** [flight-renderer.ts](../../../../../src/render/flight/renderer/flight-renderer.ts) 的 `beginRun(binding, settings, plan)` 建立本运行的场景与合成（合成自身的 1 个渲染目标与 3 个顶点计入计划核对），`draw` 以帧的 Render State、projection 与相机组合各遍并经 `drawPasses` 提交，上下文恢复时标记图像内容丢失；运行句柄增加 `addLayer`、`setScreen`。[flight-run.ts](../../../../../src/render/flight/renderer/flight-run.ts) 为表现模块接入 13 的效果与 14 的被毁相机，订阅表现 tick 取得 `{ beforeStep, afterStep }` 相机对。[flight-content.ts](../../../../../src/app/mission/flight-content.ts) 同时解码唯一的 `scene-settings` Asset，[flight-consumer.ts](../../../../../src/app/mission/flight-consumer.ts) 传入 `wireFlightRun`（17、21 可用同一输入）。合成测试包的 `PRODUCTION_SCENE` 改为按发行次序的设备值（600、1200、4000；[flight-data.test-support.ts](../../../../../src/original-data/conversion/flight-data.test-support.ts)），转换器测试的 `SYNTHETIC_SCENE` 边界值不变。
- **Node 测试：** [flight-scene.test.ts](../../../../../src/render/flight/scene/flight-scene.test.ts)（同 ID 同序号插值与短弧、alpha 0、新 ID 与序号变化、五类折叠与 Warp 序号、不相邻 tick 与重画相同、可见集合、无世界视角与不支持视角、相机插值与观察实体移动折叠、相机 tick 不符、被毁视角相机与全屏视口、`pending` → `shown`、朝向解析一次且跨隐藏/地图保留并随 `released` 丢弃、库朝向的拒绝分支）；[projection.test.ts](../../../../../src/render/flight/scene/projection.test.ts)（各视角中心与缩放、f32、相机空间、视体四边与前后平面（ky 的 f32 略大于 0.49375）、栅格像素、五种窗口/像素比下投影矩阵给出公式位置减半像素与库深度、世界相机、B 的各类计数与拒绝的设备值）；[flight-composition.test.ts](../../../../../src/render/flight/composition/flight-composition.test.ts)（等比缩放与一设备像素内的高度、逻辑相机的设备位置、矩形取整、四类视角的层次与清除、帧内容与世界裁剪、深度清除规则含地图/基地 → Warp、图像随布局更换与缓存计数、测试层逻辑矩形落在设备矩形 (200,100)–(240,120)、移除后不再调用、屏幕阶段替换、非法层与视角）；[flight-renderer.test.ts](../../../../../src/render/flight/renderer/flight-renderer.test.ts)、[flight-run.test.ts](../../../../../src/render/flight/renderer/flight-run.test.ts)（合成资源计入暖态计数、计划含合成、设置拒绝、层与屏幕阶段、上下文恢复后 Warp 深度清除、不支持视角使渲染器失败、被毁相机接入）；[webgl-surface.test.ts](../../../../../src/render/webgl/webgl-surface.test.ts)（遍的次序、清除与 y 翻转裁剪、失败后恢复与设备错误）；[flight-consumer.test.ts](../../../../../src/app/mission/flight-consumer.test.ts)（`scene-settings` 不可解码时拒绝开始并回滚）。`pnpm exec vitest run src/render/flight`：12 个文件 162 项通过。
- **工程检查：** `pnpm check` 通过（typecheck、lint、354 个文件 10306 项测试、构建；块体积警告为既有）。
- **浏览器（冒烟，验收归 25）：** 分配端口 5148/5149 运行既有 Playwright：mission-flow（开发与生产）、webgl-unavailable、base-interaction、interaction-render、viewer-page、fast-refresh 共 37 项通过。一次临时冒烟（已删除）用合成任务包进入飞行：渲染器 `ready`、绘制数随 tick 增长、表面 GPU 计数为 1 个几何、1 个纹理（游戏图像）、1 个程序（屏幕复制）、运行资源 1 个渲染目标；画布在在制提示带以外全为黑色，窗口变化后仍正常，没有 WebGL/着色器错误。浏览器服务器由 runner 停止。
- **rubber-duck：** 采纳三项：首次显示的实体不从 `pending` 位姿插值；库朝向改为每份 Render State/相机只解析一次（重画相同），隐藏与无世界视角中保留；地图与基地帧不清除深度（Warp 保留上次 0xC/0x11 清除后的深度）。未采纳“按 (ID, 放置序号) 区分朝向帧”：放置序号变化不替换原版的视觉（PV6），视觉在 `released` 或离表时才丢弃。
- **simplify：** 恒等矩阵改用 `INITIAL_CAMERA_POSE.rows`，插值复用模块级暂存对象，`viewportRect` 复用 `viewportProjection` 的尺寸，层位类型由常量推出，抽出 `fromObserved`，逻辑相机只在变换改变时重算，删去未用的 `logicalToDevice`，屏幕复制只存材质。未采纳：把 `draw` 并入 `drawPasses`（查看器路径不变是本增量的条件）、为表现模块增加相机拉取接口（`presentation/` 不在写入范围）、移除 `CompositionFrame` 的视角与子模式（spec 的 P3-13 接口明确列出）、以层位描述符替代 `world` 层的默认裁剪（当前只有一个特例）。
- **文档影响：** 写入范围内无文档需改。交 28：[render 模块说明](../../../../engineering/modules/render.md)增加 `scene/`（可见集合、折叠、投影与 B）、`composition/`（层位与次序、`CompositionFrame`、`FlightScreen`、`addLayer`/`setScreen`、游戏图像与屏幕阶段、半像素偏移）与 `beginRun(binding, settings, plan)`；[工程约定](../../../../engineering/README.md#渲染表面与视口)记载 `RenderSurface.drawPasses`（整目标清除、左上原点裁剪、`autoClear` 关闭）；[源码结构](../../../../engineering/source-structure.md)增加两个目录；app 模块说明记载飞行内容同时解码 `scene-settings`；测试约定可注明合成生产包的 RENS 设备值按发行次序。STATUS 与 tasks.md 无需修改。原版文档与 unknowns 无需修改。
- **交接（供 17–23、31、P3-13）：** 各 pass 实现 `FlightLayer`（`slot` + `passes(frame)`），由 23 经 `FlightRunRender.addLayer` 登记；世界层用 `frame.world.camera`（Three.js 世界坐标即游戏世界，网格顶点 (x, y, z) 放在 P + x·X + y·U + z·D，矩阵为 `makeBasis(X, U, D)`；正面为逆时针（屏幕顺时针），与 RS4 一致）与 `frame.world.scene` 的实体位姿与 B；星云、星点、速度尘埃（世界之前）的材质不得写深度（FC5）；2D 层用 `frame.logicalCamera` 按逻辑像素绘制；21 以 `setScreen` 实现闪光的调色板变换与平移（屏幕阶段的输入是完整游戏图像纹理），露出行颜色由 21 决定。

