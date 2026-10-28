---
type: plan
status: active
phase: P3
task: "13"
subtask: "24"
updated: 2026-10-28
---

# 24 — 运行装配与单画面合成

**契约来源：** [spec](../spec.md#接线与生命周期) 的 S-04/S-10/S-11/S-12，AC-08/14/18/19。
**依赖：** 11, 13, 16, 17, 18, 19, 20, 21, 23。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 本项唯一修改应用/运行装配热文件，绑定完整ContentIdentity、owner/run/代际，开始前验证内容与CPU/GPU预算。
- 组合14–22的实际模块，全部tick/Event Bus之后按D-02定稿（DD-05）逐tick推进驾驶舱表现，再合成一帧；不丢瞬时事实，不为P3-14建共享模型（D-02修订，2026-10-28）。
- 保留唯一画布/上下文，接cockpit槽、地图palette和最终单次闪光；不改世界深度。
- 接23几何与绘制成功凭证，移除生产十字光标，保持设备不可用、回滚、释放锁存及旧run迟到结果处理。

## 不包含

不重复各仪表实现或实现P3-14的声音消费者，不改变Core控制或完整任务流程。

## 关键文件与契约

- [flight-run.ts](../../../../../src/render/flight/renderer/flight-run.ts)、[flight-consumer.ts](../../../../../src/app/mission/flight-consumer.ts)、[use-mission-owner.ts](../../../../../src/app/composition/use-mission-owner.ts)。
- 计划新增 `src/app/mission/cockpit-content.ts` 及 `src/render/cockpit/composition/`。

## 写入范围

- `src/app/mission/flight-content.ts`：内容准备接线。
- `src/app/mission/flight-consumer.ts`：运行消费者接线。
- `src/app/mission/flight-consumer.test.ts`：所有权/失败测试。
- `src/app/mission/cockpit-content.ts`：计划新增HUD内容绑定。
- `src/app/mission/cockpit-content.test.ts`：计划新增绑定测试。
- `src/app/composition/*.ts`：生产装配与相关类型。
- `src/render/flight/renderer/flight-run.ts`：单次tick/帧合成接入。
- `src/render/flight/renderer/flight-run.test.ts`：实际模块集成。
- `src/render/flight/renderer/flight-passes.ts`：计划合并或层接入。
- `src/render/flight/renderer/flight-passes.test.ts`：保留世界pass回归。
- `src/render/cockpit/composition/**`：计划新增合成层与测试。
- `docs/engineering/modules/app.md`：运行/API同步。
- `docs/engineering/modules/render.md`：合成/API同步。
- `src/render/cockpit/presentation/cockpit-limits.ts`：右显示屏改为 CPU 设备后的 GPU 计划（renderTargets 0，协调者增补）。
- `src/render/cockpit/presentation/cockpit-foundation.test.ts`：renderTargets 断言随之更新（24 的范围请求）。
- `src/original-data/conversion/production-graphics.test-support.ts`、`src/original-data/conversion/production-hud-text.test-support.ts`、`src/original-data/conversion/production-flight-graphics.test-support.ts`、`src/content/hud/instruments.test-support.ts`、`src/content/rule-data/rule-data.test-support.ts`：合成包夹具符合驾驶舱内容契约（24 的范围请求）。
- `src/**/*.test.ts`、`src/**/*.test-support.ts`、`tools/*.test.ts`：仅限上述夹具变更引起的断言、计数与摘要字面量更新（24 的范围请求；本项执行时无其他并行子任务）。

## 验收标准

- [x] 真实模块在单一管线，帧分组/0tick/恢复不重复推进或播消息。
- [x] 预算先检查，目标屏不污染深度，闪光只作用游戏像素一次。
- [x] 首画ready无死锁，设备/旧run/局部分配失败和释放路径完整。

## 验证方法

`pnpm test -- src/app/mission src/app/session src/render/flight/renderer src/render/cockpit`、`pnpm check`；[simplify](../../../../../.agents/skills/simplify/SKILL.md) 限装配，不引入新的通用生命周期框架。

## 完成证据

2026-10-28，worker 分支 `exec/p3-13-24`（基线 `52e95819`）。未启动 DOSBox-X，未运行 Ghidra，未新增原版事实。

**交付。**

- [cockpit-run.ts](../../../../../src/render/cockpit/composition/cockpit-run.ts)：`CockpitContent`（一个资源包已核对的 HUD 内容，带包代际与完整内容身份）、`CockpitCopy { incoming, costUnavailable }`、`createCockpitRun({ ownerId, runId, content, copy, initial, seed, models, backPlane, pointer })`：按全局回调次序 8、6、9、12 登记消息行（18）、左显示屏（17，页 2–5 为 `communicationPageDrawers(createCommunicationPages(…))`，页 6 为 `createWarpPage(…).drawWarpPage`）、类型 9（21）、Warp 灯（19），再登记角落仪表与雷达（16）、框架（16，唯一元素绘制者）、右显示屏（20）、F1 叠加（21，`radar.cachedDirection` 取同一运行的雷达，`backPlane` 绑定 P3-12 的 PV4）与地图画面（22，每运行一个，救援保留）；左右显示屏共用一个 `createDisplayInterference`。返回 `{ presentation, messageLine, mapPicture, mapGeometry, diagnostics() }`；`diagnostics()` 含左显示屏页、消息队列长度与 `messageDrops`、`radarNoiseDropped`、各记录上次绘制时刻与抽取数（现有开发面板未读取，接入面板需 `src/ui/dev/**`，见 worker 报告）。
- [cockpit-layer.ts](../../../../../src/render/cockpit/composition/cockpit-layer.ts)：`cockpit` 槽的单一驾驶舱层。按当前布局以 `resolveRows` 把 S 的不透明行（F1/Warp 316–479、地图整屏）与 B 世界行中被覆盖的像素以该布局的调色板（`flight` / `map`）解析为 640 × 480 RGBA 纹理，片元按 `gl_FragCoord` 与逻辑缩放取逻辑像素（最近邻），未覆盖像素丢弃；`depthTest`/`depthWrite` 为假，世界深度（含 Warp 保留深度）不变；闪光仍只由 P3-12 的屏幕阶段对整幅游戏图像作用一次。只在 `changed()` 后重新解析上传；基地、0x13 与已释放的表现不画。`COCKPIT_GPU_PLAN` = 纹素 307,200、顶点/索引 0（三角形由 `gl_VertexID` 生成）、渲染目标 0；`COCKPIT_LIMITS.renderTargets` 改为 0（右显示屏为 CPU 设备）。
- [flight-run.ts](../../../../../src/render/flight/renderer/flight-run.ts)：`wireFlightRun` 新增可选 `cockpit: { content, copy, projection, map }`（应用总是给出；P3-12 的隔离入口不给）。先核对内容的代际与内容身份等于运行绑定，再在 `beginRun` 之前以 tick 0 的 Render State、projection、P3-12 相机与同一宿主种子创建驾驶舱，`beginRun` 核对 `addGpuPlans(content.plan, COCKPIT_GPU_PLAN)`，层在 pass 之后加入；每帧先让 P3-12 模块与各 pass 走完本帧全部 tick，再以同样的 tick（各自的 `TickOutput` 与步末相机，右键电平每批读一次）推进驾驶舱，然后绘制一次（DC-04、DD-05，无共享提示模型）。每运行一个 `createMapPresentationPort`：渲染器成功绘制数增加（实际提交）后 `submitted(mapPicture.drawn())`，未提交或绘制抛错时 `revoke()`，渲染器离开 `ready` 时立即 `revoke()`；端口与订阅随运行释放。
- [cockpit-content.ts](../../../../../src/app/mission/cockpit-content.ts)：`cockpitContentOf({ groups, generation, identity }, copy)` 每包一次按规范 Asset ID/角色（`COCKPIT_ASSET_IDS`）严格解码并核对：仪表与两布局及地图几何交叉核对、元素图像、调色板（图像须直接显示于所在画面的调色板）、fonts/0/1、HUD 文字、视角标签、DIAG、左显示屏（`prepareLeftDisplayContent`）、干扰帧、单位标记与放大图标、TEX 11089；解码前按载荷头部核对 2²⁰ 索引像素（含 TEX 11089 的 9,216，即右显示屏 `budget.imagePixels`）；按 DC-07 核对项目文案（`CockpitCopySource` 列出的全部摘要与标注及未覆盖反馈）；名称解析器取任务设置、机型名与 `mapMarkerName`。
- [flight-consumer.ts](../../../../../src/app/mission/flight-consumer.ts)：可选 `cockpit: { copy, map }`；新增 `mapGeometry()`、`mapCursor()`、`cockpit()`（运行结束撤回）。[use-mission-owner.ts](../../../../../src/app/composition/use-mission-owner.ts)：生产几何 `createZoneGeometryPort({ logical: mapGeometry(), zone: 输入区, shown: 画布 })`，`map.cursor` 改为当前运行的凭证光标，移除生产十字光标；右键、指针与撤销分别接 `mapRightButton.read()`、`mapCursor.read()`、`syncMap()`。[cockpit-copy.ts](../../../../../src/app/composition/cockpit-copy.ts)：临时文案注入点（见下）。

**25 须提供的文案（未发明定稿文字）：** `cockpitCopy()` 目前只把已满足 DC-07（≤ 58 字节、0x20–0x7E、无 0x7B）的 `MESSAGE_SUMMARIES` 摘要算覆盖；`unidentified` 与 5 条超过 58 字节的摘要（`docking-reply` 106、`craft-thanks` 71、`craft-status-threat` 63、`base-thanks` 61、`wingman-kill-or-other` 99 字节，与 DC-13 所说的 5 条一致）显示未覆盖反馈；页 5 标注全部未覆盖。25 须在 `slice-gaps-copy.ts` 提供：缩短后的全部 G-03 摘要（含 DC-13 的 15 个缺口）、每条的页 5 标注（≤ 2 行 × 16 字节）、“项目摘要未覆盖”摘要与标注文字（目前暂用缺省编号 `G-03`）、`MAP_COST_UNAVAILABLE`（目前暂用 `N/A`），并替换 `cockpitCopy()` 的实现。

**验证。**

- `pnpm exec vitest run src/app/mission src/app/session src/render/flight/renderer src/render/cockpit`：通过。`pnpm check`（typecheck、lint、Vitest 427 个文件 11,496 项、生产构建；只有既有的 > 500 kB 块体积警告）：在夹具对齐与全部字面量更新之后退出码 0。
- 关键断言：真实全部模块（无替身）15 tick 跨 F1/Warp/F1/地图/F1、受损子系统抽取随机数，按 1×15、2+0+3+0+5+4+1、5+5+5 分组时 B（含覆盖）、S、诊断与抽取数相同，空批次不变；`wireFlightRun` 中 9 tick 按 1×9、5+0+4、2+3+4 分组时驾驶舱面与 P3-12 相机相同；0 tick 与静止帧不推进、不读右键；驾驶舱层在全部 P3-12 层之后、画入游戏图像、不清不测不写深度，其后只有屏幕闪光一个画面 pass；`beginRun` 收到 `addGpuPlans(content.plan, COCKPIT_GPU_PLAN)`，运行资源恰多 1 纹理（307,200 纹素）、1 材质、1 几何，渲染目标不变；层只在 `changed()` 后上传，S 带不透明、世界行只显被覆盖像素、地图用地图调色板整屏、被毁视角只显覆盖像素、基地/0x13/释放后不画。就绪：首个地图帧实际提交后 `cursor.draw()` 为真（地图不等待输入），几何不符为假、恢复为真；上下文丢失立即撤销并回调 `revoked` 一次、丢失期间的帧不授予、恢复后首帧再授予；离图帧撤销；设备失败撤销且驾驶舱继续推进；无布局的渲染器从不授予；非设备绘制失败撤销后抛出。失败：另一包代际/身份、模块拒绝的文案、未就绪分区都在 `beginRun` 之前拒绝且无残留；层纹理分配失败时全部回滚、渲染器无运行、下一运行可开始；运行结束后驾驶舱释放、端口忽略迟到提交、新运行有新端口与新驾驶舱、旧运行的帧不再到达。内容：解码与绑定、名称解析（缺名为 `invariant-violated`）、缺 Asset、2²⁰ 像素在解码前（头部 640 × 480 而无像素的载荷得到 `presentation-capacity` 而非解码错误）、调色板不符、文案 58/59 字节、16/17 字节、3 行、空未覆盖文字；应用消费者：合成任务包的运行在 tick 0 装配驾驶舱，帧按全部 tick 推进驾驶舱（其 tick 等于运行 tick），末两个画面 pass 为 `cockpit-layer` 与 `flight-screen-flash`，重试时撤回并换新实例；载荷无法读取的 HUD 内容在任何 GPU 分配前拒绝开始；DC-08 不允许的 DIAG 转换（`%u`）拒绝。
- **合成夹具对齐（协调者于 main `7fba8abe` 扩大写入范围）：** 原合成任务包（`mission-startable`，Node 任务测试与浏览器 E2E 共用）带有真实模块按契约拒绝的内容。现按随附数据的形状（hud §4.1：全部文字在字符映射内；DC-08）修正五个夹具：[production-graphics.test-support.ts](../../../../../src/original-data/conversion/production-graphics.test-support.ts) 的 DIAG 格式（0、1 各一个 `%d` 与 `%%`，2 一个 `%s`，3 一个 `%d`）与子系统格式（两个 `%s`）；[production-hud-text.test-support.ts](../../../../../src/original-data/conversion/production-hud-text.test-support.ts) 的填充改为大小写字母；[production-flight-graphics.test-support.ts](../../../../../src/original-data/conversion/production-flight-graphics.test-support.ts) 的 TEX 11089 为 96 × 96、视角标签在 fonts/1 映射内；[instruments.test-support.ts](../../../../../src/content/hud/instruments.test-support.ts) 的右显示屏矩形为 HI 的 (491, 346)–(586, 442)；[rule-data.test-support.ts](../../../../../src/content/rule-data/rule-data.test-support.ts) 的 `text()` 以 `A`/`Z` 代替 0x80/0xFF。受迫的测试更新：四个 replay 的 gameplay 摘要（ai `be030d7711f2e82d`、combat `d520db010af2d2cb`、map-warp `b177a380e4e33cec`、comm `841cc6cd41088357`，规则与抽签不变）；HUD 文字测试改为断言全部字节在字体映射内；ai 关键字折叠用例的碰撞名随 `text()` 改为 `Apriv`；rule-data 载荷、CINF、COMM 菜单与 COMMFACE 名称的 0x80–0xFF 保留断言改由各测试自行注入含 0x80/0xFF 的字节串（覆盖不减）。测试内变换 `drawable-cockpit.test-support.ts` 已删除，驾驶舱测试直接用合成包。
- **浏览器冒烟（browser-testing，合成内容，无临时补丁）：** 临时 Playwright 用例（已删除）在 `OSR_E2E_DEV_PORT=5172`/`OSR_E2E_PREVIEW_PORT=5173`（Playwright 自启自停，结束后 5172–5174 无监听）的开发测试入口导入 `mission-startable`、经真实流程开始任务：Chrome 无头 1280 × 800、DPR 1，F1 画面驾驶舱带 257 种颜色（仪表、雷达、两侧显示屏、F1 准星与目标框叠加在世界之上），按 `m` 开图后整屏地图（网格、面板、指针框、接触点与标签，无项目十字光标）238 种颜色，地图输入取得 Pointer Lock（`game-input-zone`，凭证生效、无死锁），浏览器错误收集（console/pageerror/失败请求/HTTP ≥ 400）为空。截图在 `local/research/p3-13/24-run-composition/smoke/`。
- **启动任务的 E2E（mission-flow、flight-render、map-input、joint-pipeline，开发与生产）：** 30 项中 23 项通过（含 map-input 全部、joint-pipeline 全部、生产完整流程）。7 项失败，均非接线缺陷（日志 `local/research/p3-13/24-run-composition/e2e.log`）：① `e2e/flight-render.development.spec.ts:62` 的 `expectF1Background`（`e2e/support/flight-flow.ts:99`，“pixels are neither background nor dust”，第 68 行调用）、② 同文件 `:157` 经 `fly`（第 166 行调用同一断言）、③ 同文件 `:223` 第 234 行 `expect(map).toMatchObject({ tunnel: 0, palette: 0, other: 0, belowLit: 0 })`（地图不再全黑）——驾驶舱带与地图画面现已绘制，归 27/28；④ `e2e/flight-render.production.spec.ts:27` 第 40 行 `expectFlightCanvas`（`e2e/support/mission-observations.ts:110` `toHaveCount(2)`，生产十字光标画布按 spec 移除，现为 1 个画布）；⑤ `e2e/mission-flow.development.spec.ts:596` 第 616 行 `toContainText(MAP_NOT_READY)` 与 ⑥ `e2e/mission-flow.production.spec.ts:187` 第 212 行 `map: { destination: null, markerEntityId: null }`（第 214 行同样期待“Map input is not ready.”）——两项的前提是“生产没有地图几何”，现在几何与凭证已接入，地图输入就绪并按 P3-05 取得锁定与选点，归 28；⑦ `e2e/mission-flow.development.spec.ts:802`（真实隐藏页面中的 Warp）为 `CDP Runtime.evaluate timed out`（`e2e/support/native-lifecycle.ts:65`），在基线 `52e95819` 的源码上同样失败（`e2e-802-base.log`），是既有的环境问题，不归本项。
- **Rubber-duck（code-review 代理担任）：** 对照 DC-03–DC-09、DD-05 与本项验收审阅完整 diff，未发现问题；确认帧内次序、逐 tick 相机互不覆盖、批次上限与 Runtime 一致、登记次序、解码前预算、层不碰深度、凭证只在实际提交后授予且各失败路径撤销、清理次序与旧运行防护；唯一提醒即当时的合成夹具使 E2E 失败，已由上述扩大范围的夹具对齐解决。
- **Simplify：** 只限本 diff：去掉多余的推进包装函数，驾驶舱分支外的帧不读诊断计数，消费者单次调用 `wireFlightRun`，内容核对复用布局元素列表；未引入通用生命周期框架。97 列背景复制在 17、18、19 中重复：纯模块按 `osr/cockpit-imports` 不能引用 `composition/`，共享函数须放在 `raster/` 或某个纯模块目录，超出本项范围，未改。
- **文档影响：** 更新 [render 模块说明](../../../../engineering/modules/render.md)（驾驶舱模块 API 与运行装配一节、`wireFlightRun` 的 `cockpit`、P3-13 交接已接入）与 [app 模块说明](../../../../engineering/modules/app.md)（飞行消费者的驾驶舱选项与查询、驾驶舱内容、临时文案、生产地图几何与光标）。范围外的建议见 worker 报告：`docs/engineering/keyboard-input.md` 的 P3-13 交接一条（“运行装配……归 24”）应改为已交付；spec 的 DC-08 GPU 计划一行可注明实际计划为纹素 307,200（CPU 解析调色板，无 GPU 调色板纹理）、顶点/索引 0。原版事实与 U 项不变。
- **私有输出：** `local/research/p3-13/24-run-composition/`（`check.log`、`fixture-tests.log`、`e2e.log`、`e2e-802*.log`、冒烟截图、只读的完成证据摘录）。
