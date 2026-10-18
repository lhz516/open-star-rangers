---
type: plan
status: active
phase: P3
task: "12"
subtask: "28"
updated: 2026-10-17
---

# 28 — 文档同步与交接

**契约来源：** [spec](../spec.md) 的 S-14、AC-22（文档部分）。
**依赖：** 09, 23, 24, 25。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 同步 [render 模块说明](../../../../engineering/modules/render.md)（飞行渲染器、表现模块、呈现约定与已知差异：按 tick 的缓动、星云起点、CR-11 差异）、[app](../../../../engineering/modules/app.md) 与 [core](../../../../engineering/modules/core.md) 模块说明的实现部分、[源码结构指南](../../../../engineering/source-structure.md)（`render/flight/` 目录与边界）、[工程约定](../../../../engineering/README.md#渲染表面与视口)（飞行画面的检查与 E2E）。
- 在制标注：P3-13 接入前的“驾驶舱/HUD 待接入”提示写入相应文档，不新增 G 项。
- 交接：向 P3-13（合成层接口与视角信息）、P3-14（`PresentationTick`、激活流与相机，以及 09 记录的接口差异）、P3-15（被毁视角真实流程、原版对照汇总所需的证据位置）写明。

## 不包含

- 原版事实（08、27）。

## 关键文件与契约

- 上列文档。

## 写入范围

- `docs/engineering/**`：模块说明、源码结构、工程约定与交接。
- `docs/guides/local-import.md`：导入后进入飞行的画面说明（已接入飞行画面，驾驶舱/HUD 待 P3-13）。

## 验收标准

- [x] S-14：文档与实际 API、目录和检查一致；交接三项写明。
- [x] 改动文档的 `updated:`、链接与锚点有效。

## 验证方法

- 文档审阅与链接检查。

## 完成证据

- **收集的提议：** 12（表现模块的导入/宿主能力边界与回归、`createFlightPresentation`/`presentationRandom`/两条接入缝、针对性命令）、13（`createPresentationEffects`、`fragments()`、`flashRequests(tick)` 与 5 tick 保留窗口）、14、15（README 与源码结构中“任务画面尚无画布”的过时处、渲染器公开面、状态与失败分类、`FLIGHT_SURFACE`、`media` 消费者、`presentationSeed`、`dev-flight-*`、测试 ID `flight-view`/`flight-area`/`flight-notice`/`flight-in-progress`）、16（`scene/`、`composition/`、`beginRun(binding, settings, plan)`、`RenderSurface.drawPasses`、游戏图像与屏幕阶段、−0.5 像素偏移、合成生产 RENS 设备值按发行次序）、17（`lighting/` 与限度，更正 16 的绕序写法为 `BackSide`）、18–22、31（各 pass 目录、入口、GPU 计划与 step 契约）、23（`flight-passes.ts`、共享表现随机流、逐 tick 交错、`PreparedFlightContent`、app 的飞行内容解码）、25（本地浏览器 runner 的过时行、隔离入口、飞行用例与 `flight-pictures`/`flight-models`/`flight-flow`、像素比变化的限度）、34（逃生舱部件的开始检查）。逐项对照代码后写入；14、17、18、20、21 交 27 的原版事实不在本项范围，未写入（render 模块说明只链接 executable 已有的规则编号并描述实现）。
- **改动：** [render 模块说明](../../../../engineering/modules/render.md)新增“飞行渲染（P3-12）”：目录与入口、表现模块（创建、推进与校验、查询、相机与视口、两条接入缝、预算与错误种类）、渲染器（状态、失败分类、`beginRun` 与 `FlightRunRender`、GPU 缓存与 `FLIGHT_GPU_LIMITS`、重画、诊断）、运行接线与逐 tick 推进（内容准备与开始前拒绝的各项、`wireFlightRun`、`attachFlightPasses`、推进次序与 AC-17）、场景与相机、画面合成（逻辑画面、`RASTER_OFFSET_X`、游戏图像与 24 位深度纹理、屏幕阶段、`LAYER_ORDER`、`CompositionFrame`/`LayerPass`/`FlightScreen`）、各 pass 表、呈现约定与已知差异（颜色、手性、`BackSide` 剔除并更正 16 的写法、按 tick 的运算、星云起点、FS-10 决定 7/8、Warp 游标、内容范围、显式限制与浏览器未验证项）、针对性检查与交接；查看器的表面选项、多遍绘制与测试替身一并更新，查看器呈现约定表下注明飞行画面依据的原版规则而查看器不改。[app](../../../../engineering/modules/app.md) 新增“飞行画面”（消费者、运行接线、表现种子、飞行内容解码）。[core](../../../../engineering/modules/core.md) 的交接节在 P3-12/13、P3-14、P3-15 下各加一条指向 render 交接的条目。[ui](../../../../engineering/modules/ui.md) 记载 `FlightView`、`FLIGHT_IN_PROGRESS`、`flightNotice` 与开发面板的 Flight render 区块。[源码结构](../../../../engineering/source-structure.md)加入 `render/flight/` 的完整目录树（与实际文件逐一核对一致）、`app/mission/flight-*.ts`、`FlightView.tsx`，职责表两行（`render/flight/` 与 `presentation/`），R2/R7 退役记录的去向，以及浏览器测试分层。[工程约定](../../../../engineering/README.md)：表现模块的 lint 与依赖图边界；生产预览、WebGL 降级、joint-resources 的过时“没有画布”；新的“P3-12 飞行画面回归”（隔离入口、三个用例文件、独立期望的支持模块、观察、限度、聚焦命令）；合成生产飞行内容须留在渲染器接受的范围；渲染表面与视口（`drawPasses`、`FLIGHT_SURFACE`、`GraphicsUnavailableError`）；应用端口加 `presentationSeed`；任务画面的飞行接线；测试 ID 与 `dev-flight-*`。
- **在制标注：** [切片缺省清单](../../../../engineering/slice-gaps.md)新增“在制标注（非 G 项）”：`flight-in-progress` 的文字与位置、`MISSION_SKELETON`，不进入 `SLICE_GAPS`、不是长期豁免，P3-13 接入后移除、最迟 P3-15 之前补齐；没有新增 G 项。
- **交接：** render 模块说明的“交接”：P3-13（以 `addLayer` 登记 `cockpit` 槽的层、`CompositionFrame` 的视角与子模式、Render State 与 projection、世界视口外为黑、`FlightRunRender` 目前只在 `wireFlightRun` 的返回值中、GPU 计划并入、移除在制提示）；P3-14（同一表现模块实例、`subscribe` 的逐 tick `PresentationTick` 与通知时机、激活次序与 `eventIndex`、不重播、`afterStep` 听者、09 对齐表中交其 D-02 的差异）；P3-15（被毁视角真实流程待 P3-11 接入后验证；原版事实、冻结对照方案与 26/27 的输出位置，26/27 尚未完成）。
- **检查：** 自写的 Markdown 链接与锚点检查（GitHub 锚点规则，脚本在会话目录，不提交）对 `docs/engineering/README.md`、`source-structure.md`、`slice-gaps.md` 与 `modules/*.md` 全部通过，反例能检出缺失锚点；改动文档的 `updated:` 都为 2026-10-17；源码结构的 `render/flight/` 目录树与 `src/render/flight` 的非测试文件逐一比对一致。`pnpm check` 通过（382 个测试文件、10,601 项测试、lint、typecheck 与构建，1 分 19 秒）。
- **Rubber-duck：** 四项均采纳：P3-15 交接中 26/27 的输出改为“尚未完成、计划位置”，不写成已有判定；删除两处属于 27 的原版事实（碎片面的法线复制、无玩家对象时空句柄读值），改为描述实现并链接 20、18 的完成证据；浏览器聚焦命令改为 `pnpm test:e2e`（先构建）；“独立期望不调用渲染器模块”改为“不调用生产渲染实现、复用合成夹具”。
- **本地导入指南（协调者 3cddbbe2 扩大写入范围后）：** [local-import.md](../../../../guides/local-import.md) 的概述与“开始任务”第 4 步改为飞行画面已接入（世界、星云、星点、速度尘埃、爆炸与 Warp 效果），驾驶舱与 HUD 待 P3-13，引用界面的在制提示与 WebGL 2 不可用、上下文丢失提示的实际文字（`mission-copy.ts` 的 `FLIGHT_IN_PROGRESS` 与 `flightNotice`），开发诊断加入飞行渲染区块。`docs/STATUS.md` 与阶段 `tasks.md` 不需改动。16 的子任务文档中的绕序旧写法未改（更正记在 render 模块说明）；22 的 simplify 未采纳项（与星云共用的纹理四边形助手、`WorldView` 中给出 tick 的游戏相机）是代码整理，不属本项。

