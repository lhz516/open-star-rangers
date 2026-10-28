---
type: plan
status: active
phase: P3
task: "12"
subtask: "15"
updated: 2026-10-17
---

# 15 — 飞行渲染器的生命周期、接线与失败分类

**契约来源：** [spec](../spec.md) 的 S-02、AC-02、AC-03；[渲染器生命周期](../spec.md#渲染器生命周期)、[行为与边界](../spec.md#行为与边界)。
**依赖：** 11, 12。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 计划新增 `src/render/flight/renderer/`：飞行渲染器的创建与释放、状态（`ready`、`context-lost`、`failed`、`unavailable`、`disposed`）与诊断（已绘制帧数、最后绘制的 tick、GPU 计数）。
- 经任务所有者登记表现模块与渲染器（阶段按 P3-04 的规则），每个运行经 `attachRun` 连接、经 `run.ownCleanup` 释放；表现模块在 tick 0、首帧前接线。每个 owner 至多一个画布与 WebGL 上下文，挂在 `mission-view`。
- 运行内 GPU 缓存（几何、材质、纹理、渲染目标）按 owner、代际与完整 `ContentIdentity` 绑定；迟到的异步结果经检查后只释放；每个取得步骤都有对应释放，失败按 `RollbackError`/`AggregateError` 与清理锁存报告。
- 失败分类：上下文丢失停止 GPU 提交并提示，恢复时只重建 GPU 映射；已识别的 WebGL 2 不可用以图形状态通知 UI，会话继续；内容、契约、预算与释放错误阻断开始或使会话故障。
- 任务画面的飞行区域显示画面不可用、上下文丢失与“驾驶舱/HUD 待 P3-13”的在制提示；生产构建不暴露诊断元素。
- 需要多遍绘制或后处理时增量扩展 `RenderSurface`，查看器行为与测试不变。
- 测试：记录表面上的接线、释放、回滚、迟到结果、重试的暖态计数、各失败分类与 limit/limit+1。

## 不包含

- 场景、相机与各绘制模块（16 至 23）。
- 浏览器回归（25）。

## 关键文件与契约

- 现有：[render-surface.ts](../../../../../src/render/scene/render-surface.ts)、[cleanup.ts](../../../../../src/render/scene/cleanup.ts)、[viewport-layout.ts](../../../../../src/render/viewport/viewport-layout.ts)、[browser-webgl-surface.ts](../../../../../src/render/webgl/browser-webgl-surface.ts)、[mission-owner.ts](../../../../../src/app/mission/mission-owner.ts)、[mission-slot.ts](../../../../../src/app/composition/mission-slot.ts)、[MissionShell.tsx](../../../../../src/ui/mission/MissionShell.tsx)、[viewer-renderer.ts](../../../../../src/render/viewer/viewer-renderer.ts)（参考）。
- 计划新增：`src/render/flight/renderer/`。

## 写入范围

- `src/render/flight/renderer/**`：渲染器、状态、诊断、缓存与测试。
- `src/render/scene/**`：`RenderSurface` 的增量扩展。
- `src/render/webgl/**`：浏览器表面的增量扩展。
- `src/app/mission/**`：消费者登记。
- `src/app/composition/**`：应用槽位接线。
- `src/app/MissionScreen.tsx`：画面容器。
- `src/app/browser-ports.ts`、`src/app/ports.ts`：表面端口。
- `src/ui/mission/**`：飞行区域与提示。
- `src/ui/dev/**`：开发诊断。
- `src/app/app.css`：飞行区域样式。
- `e2e/base-interaction.development.spec.ts`、`e2e/webgl-unavailable.spec.ts`：随飞行区域文字与 WebGL 表面变化更新既有断言与注释。

## 验收标准

- [x] AC-02：每个 owner 至多一个画布；退出后本运行资源为零；重试暖态计数相等；包代际变化、迟到结果、部分初始化失败与释放失败都有断言。
- [x] AC-03：三类失败按行为表处理，没有生产静默降级；上下文恢复不重抽、不重播。
- [x] 查看器测试不变地通过；`pnpm exec vitest run src/render src/app/mission src/ui` 通过。

## 验证方法

- Node 测试（记录表面）；浏览器部分由 25 验证。

## 完成证据

2026-10-17，worker `exec-p3-12-15`（基于 90c65e38，按协调者要求变基到 ffc2a873，写入范围已加入两个 E2E 文件）。本子任务没有运行基准环境（DOSBox-X），不涉及原版事实。

- **实现：**
  - `src/render/flight/renderer/`：[flight-renderer.ts](../../../../../src/render/flight/renderer/flight-renderer.ts)（每个 owner 一个渲染器，状态 `ready`/`context-lost`/`failed`/`unavailable`/`disposed`，诊断为状态、成功绘制数、最后绘制的 tick、表面 GPU 计数、本运行缓存计数与布局；`FLIGHT_SURFACE` 的可访问名称为 “Flight view”，输出不做颜色空间编码）；[flight-gpu-cache.ts](../../../../../src/render/flight/renderer/flight-gpu-cache.ts)（运行内缓存，按 owner、run、包代际与完整 `contentIdentityKey` 绑定，按键共享并计数；`checkGpuPlan` 在运行开始、分配之前核对整份计划；每次取得先按声明尺寸核对 `FLIGHT_GPU_LIMITS` 再创建，实际尺寸不符即释放并报错；渲染目标不超过当前绘制缓冲，没有布局时不允许；`receive` 只接收本绑定且未释放的迟到结果，其余只释放）；[flight-render-error.ts](../../../../../src/render/flight/renderer/flight-render-error.ts)（`FlightRenderError` 与 FS-07 的 `FLIGHT_GPU_LIMITS`）；[flight-run.ts](../../../../../src/render/flight/renderer/flight-run.ts)（tick 0 接线：表现模块由 tick-0 Render State 与 `presentationRandom(seed)` 创建，渲染器绑定该运行，帧消费者先按 `report.outputs` 推进表现模块再绘制，静止帧只重画；每项取得立即交给 `run.ownCleanup`，被拒时就地释放，失败为 `RollbackError`）。
  - [render-surface.ts](../../../../../src/render/scene/render-surface.ts) 增量增加 `GraphicsDeviceError`（表面识别的、在丢失上下文上失败的绘制）与 `GraphicsUnavailableError`（画布根本给不出 WebGL 2 上下文）；[webgl-surface.ts](../../../../../src/render/webgl/webgl-surface.ts) 的部件增加 `isContextLost`，[browser-webgl-surface.ts](../../../../../src/render/webgl/browser-webgl-surface.ts) 在渲染器构造失败且画布仍无 `webgl2` 上下文时抛 `GraphicsUnavailableError`。查看器仍把任何创建失败当作 `unavailable`，其行为与测试不变。
  - [flight-consumer.ts](../../../../../src/app/mission/flight-consumer.ts)：`media` 阶段的任务所有者消费者；连接时创建本 owner 唯一的表面与渲染器并绑定所有者绑定的包，只有 `GraphicsUnavailableError` 得到 `unavailable` 渲染器，其他创建失败（含 `RollbackError`）使所有者创建失败；`attachRun` 核对包仍为同一对象，按包解码一次 [flight-content.ts](../../../../../src/app/mission/flight-content.ts) 的表现内容，并从独立的 `presentationSeed` 端口取种子（[ports.ts](../../../../../src/app/ports.ts)、[browser-ports.ts](../../../../../src/app/browser-ports.ts)），使测试给定的世界种子次序不变。
  - [use-mission-owner.ts](../../../../../src/app/composition/use-mission-owner.ts) 在 owner 将被创建时创建画布容器与消费者；[FlightView.tsx](../../../../../src/ui/mission/FlightView.tsx) 挂载时把容器放入飞行区域、卸载时移出，因此重新挂载不新建画布或上下文；飞行区域显示上下文丢失、不可用与失败的提示（[mission-copy.ts](../../../../../src/ui/mission/mission-copy.ts) 的 `flightNotice`）以及 `FLIGHT_IN_PROGRESS`（“Flight rendering is connected; the cockpit and HUD are not implemented yet (P3-13).”）。开发面板的 “Flight render” 区（`dev-flight-*`）读诊断，生产构建不含。
- **行为要点：**上下文丢失时不提交 GPU 工作，Core 与表现模块照常推进；恢复（以及布局变化）时立即用本运行最后一帧重画而不推进任何东西，所以暂停中也保留画面，且不重抽 EXPL、不重播激活。表面识别的设备失败先释放本运行资源，成功则进入 `failed`、会话继续；其他绘制失败使渲染器 `failed` 并从帧监听抛出（`consumer` 故障），帧外的布局或重画失败在下一次绘制或开始时抛出；之后的开始被拒绝。运行资源释放失败后拒绝下一运行。场景目前为空（黑色），由 16 至 23 填入。
- **Node 测试：**[flight-gpu-cache.test.ts](../../../../../src/render/flight/renderer/flight-gpu-cache.test.ts)（共享与计数、单键与全部释放、释放失败聚合、计划与每项预算的 limit/limit+1 且超额时不调用 `create`、四个渲染目标与缓冲上限、尺寸不符、迟到结果的四种绑定变化与释放后到达、接管失败）；[flight-renderer.test.ts](../../../../../src/render/flight/renderer/flight-renderer.test.ts)（布局前不绘制、布局变化重画、一次一个运行与 owner 绑定、重试暖态计数相等且退出后为零、上下文丢失与恢复重画、设备失败继续、设备失败释放失败抛 `RollbackError`、其他失败抛出并拒绝后续、帧外重画与布局失败、释放失败锁存、按序释放、不可用、创建回滚）；[flight-run.test.ts](../../../../../src/render/flight/renderer/flight-run.test.ts)（tick 0 起推进 0/1/5 tick 帧与静止帧、激活一次、不连续批次抛错、运行结束按新到旧释放、内容/种子/run 不符时什么都不取得、`ownCleanup` 被拒与回滚失败）；[flight-consumer.test.ts](../../../../../src/app/mission/flight-consumer.test.ts)（真实所有者与会话、`ControlledHost`：每 owner 一个表面且下一 owner 创建前已释放、重试暖态计数相等并在退出后归零、所有者释放表面、星云 payload 不可解码与非法种子使开始回滚且可重试、包不再被持有时拒绝接线、不可用时会话继续、其他表面失败使所有者创建失败、上下文丢失与设备失败时会话继续、其他绘制失败使会话 `consumer` 故障且之后的开始被拒）；[webgl-surface.test.ts](../../../../../src/render/webgl/webgl-surface.test.ts) 与 [mission-copy.test.ts](../../../../../src/ui/mission/mission-copy.test.ts) 的新增用例。`pnpm exec vitest run src/render src/app/mission src/ui`：51 个文件 1089 项通过；查看器测试未改动且通过。
- **工程检查：**`pnpm check` 通过（typecheck、lint、348 个文件 10225 项测试、构建）。
- **浏览器（只作接线冒烟，验收归 25）：**以分配端口（5145/5146）运行既有 Playwright 用例：mission-flow（开发与生产）、webgl-unavailable、fast-refresh、interaction-render、viewer-page 共 35 项通过。一次临时冒烟（已删除）用合成任务包进入飞行：飞行区域内一个 640×480 的 “Flight view” 画布，`data-state=ready`，诊断的绘制数与最后 tick 随 tick 增长、GPU 与运行资源计数为 0，返回主菜单后画布移除。按协调者要求在本提交中更新：[base-interaction.development.spec.ts](../../../../../e2e/base-interaction.development.spec.ts) 的游戏区文字期望改为 `FLIGHT_IN_PROGRESS`；[webgl-unavailable.spec.ts](../../../../../e2e/webgl-unavailable.spec.ts) 的标题与注释改为任务所有者有飞行表面、无 WebGL 2 时渲染器 `unavailable`，并断言飞行区域 `data-state=unavailable`、`role=alert` 的提示且没有画布。变基后 `pnpm check` 通过（351 个文件 10268 项），聚焦命令 54 个文件 1132 项通过；base-interaction、webgl-unavailable（开发与生产）与 mission-flow（开发与生产）共 15 项通过。
- **rubber-duck：**四项均已处理：表面创建失败只把已识别的 `GraphicsUnavailableError` 归为不可用；增加整份 GPU 计划在分配前的核对；没有布局时不允许渲染目标；上下文恢复与布局变化时用最后一帧重画，帧外失败锁存到下一次绘制或开始。帧外失败不能立即使暂停中的会话故障（会话没有供消费者在帧外报故障的入口），渲染器状态立即为 `failed` 并在画面中提示，继续时故障。
- **simplify：**去掉重复的计数检查函数、收窄导出、表现内容每个 owner 只解码一次、热路径上的路径字符串改为常量或延后构造、`isContextLost` 改为必需部件。未采纳：与 `ui/game-input/input-consumer.ts` 的 `own`、`app/resources/mission-input.ts` 的 `groupAssets` 合并（在写入范围之外）；`receive` 与 `plan` 保留（AC-02 的迟到结果与 FS-07 的分配前核对需要，计划由 23 计算）。
- **文档影响：**本子任务不改写其他文档（写入范围之外）。交 28：工程约定 [README](../../../../engineering/README.md) 第 192 行与第 422 行 “任务画面尚无画布”、[源码结构](../../../../engineering/source-structure.md) 第 672 行 “尚无完整画布” 需改为飞行画布已接入；[render 模块说明](../../../../engineering/modules/render.md)与 [app 模块说明](../../../../engineering/modules/app.md)需增加 `render/flight/renderer/` 的公开面、状态与失败分类、`FLIGHT_SURFACE`、`media` 消费者、`presentationSeed` 端口与开发诊断 `dev-flight-*`；工程约定的测试 ID 列表增加 `flight-view`、`flight-area`（`data-state`）、`flight-notice`、`flight-in-progress`。`MISSION_SKELETON` 已改为 “Core runs the mission's world and the flight view is in progress, but there is no cockpit, HUD, implemented mission rules or audio yet.”

