---
type: plan
status: active
phase: P3
task: "05"
subtask: "27"
updated: 2026-10-10
---

# 27 — 隔离地图输入入口与浏览器验证

**契约来源：** [spec](../spec.md) 的[战略地图输入](../spec.md#战略地图输入)、[执行前提](../spec.md#执行前提)“地图交接”、[验证策略](../spec.md#验证策略)；S-11；AC-12，以及 AC-09（锁指针时的 Esc）、AC-13（主动/被动解锁）、AC-16（Pointer Lock 监听平衡）的浏览器部分。
**依赖：** 22。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 计划新增只由开发服务器提供的隔离入口 `e2e/entries/map-input.html` 与其脚本 `src/ui/game-input/map-input-entry.test-support.tsx`：挂载与生产相同的地图输入（22）、自绘光标与几何（17）、Pointer Lock 端口（13），以显式合成几何、显式初始位置与左键时机和可切换的合成交互上下文驱动；向测试暴露观察钩子（光标位置、已提交的 hover/select 序列、锁定状态与原因）。不另建生产演示地图。
- 按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md) 编写 e2e：真实像素读回光标随移动、四边与四角钳制、移动后旧位置被清除；缩放、黑边、DPR（`deviceScaleFactor`）、零尺寸与无几何的停用；hover 合并、多个 select 的位置与顺序、hover 提交失败不选错点；真实 `pointerLockElement` 的锁定、主动解锁（离开地图、失焦）与被动解锁（浏览器退出），解锁后地图仍开、下一次点击只重锁；权限 pending/拒绝（测试入口模拟）与无锁回退、区域外点击不提交；资源平衡计入新的 Pointer Lock 监听分组。Playwright 的 Escape 不一定经过浏览器原生解锁，以实际 `pointerlockchange` 断言并在证据中标注；原生 Esc 由 30 实机核对。
- 需要原生 headed 能力时按[本地浏览器 runner](../../../../engineering/README.md#本地浏览器-runner) 的项目归属命名并登记；同步开发服务器预热与 e2e 配置测试。

## 不包含

- 真实任务中打开地图的完整路径（P3-15）；原版外观（P3-13）。

## 关键文件与契约

- [e2e/entries/app.html](../../../../../e2e/entries/app.html)（入口写法参照）、[playwright.config.ts](../../../../../playwright.config.ts)、[vite.config.ts](../../../../../vite.config.ts)、[browser-probes.ts](../../../../../e2e/support/browser-probes.ts)（监听分组）、[e2e-configuration.test.ts](../../../../../tools/e2e-configuration.test.ts)。
- 计划新增：`e2e/entries/map-input.html`、`src/ui/game-input/map-input-entry.test-support.tsx`、`e2e/map-input.development.spec.ts`（若须 headed 则为 `e2e/map-input-native.spec.ts`）、`e2e/support/map-input.ts`。

## 写入范围

- `e2e/entries/map-input.html`、`src/ui/game-input/map-input-entry.test-support.tsx`
- `e2e/map-input.development.spec.ts`、`e2e/map-input-native.spec.ts`、`e2e/support/map-input.ts`
- `e2e/support/browser-probes.ts`
- `playwright.config.ts`、`vite.config.ts`、`tools/e2e-configuration.test.ts`

## 验收标准

- [x] AC-12：合成几何下的像素位置、钳制、清除旧位置，缩放/黑边/DPR/零尺寸/无几何，hover 合并与 select 顺序、hover 失败，真实 Pointer Lock 的锁定与解锁、权限与无锁回退、区域外点击，均有通过的浏览器断言。
- [x] 入口使用与生产相同的组件；证据中写明本入口不代表真实任务的地图路径。
- [x] 新监听分组纳入资源平衡且回到基线；`pnpm test:e2e e2e/map-input.development.spec.ts --project=development`（或所属项目）通过，`pnpm check` 通过。

## 验证方法

- 列出运行命令、项目与结果；像素读回与 `pointerLockElement` 的断言摘要。

## 完成证据

- **环境：** macOS 26.6，Google Chrome 155.0.8059.39（Playwright channel `chrome`，headless，独立 context，视口 1280×800），Node 22.22.0；端口 5181（开发）/5182（预览），调试用开发服务器 5183 已停止。只用代码生成的合成内容。
- **入口（`e2e/entries/map-input.html` + `src/ui/game-input/map-input-entry.test-support.tsx`，只由开发服务器提供）：** 生产组件原样运行：`createInputConsumer`（含 `map` 选项、能力生命周期与地图输入 22）、浏览器键盘源、`createBrowserPointerLockHost`/`createPointerLock`（13）、`createBrowserMapCursor` 与几何换算/`mapStartPosition`（17）、`GameInputZone`、正式 Session（浏览器会话宿主、真实 rAF）、游戏 store/bridge/命令反馈。**合成部分**（入口文件头逐项列出）：Core 尚不能报告 `map`，交给消费者的 run 句柄改显入口保存的上下文（初始 flight，每个被接受的 `toggle-map` 切换，测试也可直接设定）；owner 输入上下文为替身（owner 1、前序已关闭；run 端口在 running 时发 `clear-input`、`p` 暂停/继续、`openMenu` 只记录）；TEST 绑定表；320×240 逻辑画面、主地图 (16,8)–(256,200)、`computeViewportLayout` 算出的 4:3 画框；策略为 `mapStartPosition` 与间隔 8；Pointer Lock 宿主可设为 pending（测试决定授予/拒绝）、refuse、unsupported 或 native；可令后续 hover 提交返回 null；系统指针仅在 `systemPointerHidden` 为真时隐藏（装配 25 的职责，此处由入口代行）。**本入口不代表真实任务的地图路径**（P3-09/P3-13/P3-15）。
- **e2e（`e2e/map-input.development.spec.ts`，9 个用例）：** `OSR_E2E_DEV_PORT=5181 OSR_E2E_PREVIEW_PORT=5182 pnpm test:e2e e2e/map-input.development.spec.ts --project=development` 通过（9 passed，27 s，simplify 之后）；审阅修改后、simplify 之前连续 3 次运行也都是 9 passed。与 `e2e/probe-contract.spec.ts`、`e2e/production-preview.spec.ts`（两项目）、`e2e/fast-refresh.spec.ts` 同跑 23 passed。无需 headed：Chrome headless 在 http 源上支持 Pointer Lock（`about:blank`/`setContent` 页面得 `WrongDocumentError`），故未新增 `map-input-native.spec.ts`，`playwright.config.ts` 与 `tools/e2e-configuration.test.ts` 不变（按文件名归入 development，已有的归属检查覆盖）。
- **断言摘要：**
  - 像素读回：Playwright `page.screenshot({ scale: 'device' })` 解码后取光标色像素。与 `mapCursorShape` 推出的屏幕框（±1 设备像素）及像素数（画布整设备像素放置时须完全相等）一致；另以独立换算 `clientPoint × DPR` 核对两条光标线的交点（误差 ≤ 1 + DPR 设备像素）。框外无光标色像素，即旧位置已清除。
  - K 起点：独立按定义计算 ⌊(W−1)/2⌋、⌊(H−1)/2⌋ 像素中心，得 (0.43125, 0.45572916…)，非中心。每次进入地图（含 `m` 键经 run 重进）都回到起点；进入时几何为 null、之后才就绪的，起点只取一次，且不提交 hover/select。
  - 锁定后的 CDP 移动 60、−48 CSS px 得到等量位置变化。四边与四角（右、右上、上、左上、左、左下、下、右下）钳制到 0/1，越界部分丢失，回退量精确。
  - DPR 2（`deviceScaleFactor: 2`）：设备像素绘制正确。锁定中把宿主改为 1000×500 后，画框为 666.5×500、左 166.75，两侧为黑边；锁定与归一化位置保持，光标在新位置重绘。
  - 停用：零尺寸（画框 0×0）、`null` 几何为 `not-ready`，解锁、无光标、不隐藏系统指针，恢复后保留位置；主地图颠倒为 `invalid`，错误为 `MapInputGeometryError: … mainMap.right must not be less than mainMap.left`。
  - 命令：每次 hover 来自不同会话帧，最后一次在最终位置。两次 select 的位置各自冻结且按序，前一条 map-point 为同位置。hover 一直失败时不发 select，失败的 hover 为 null；恢复后新按下先 hover 再 select，均在当前点。按住时重复 select，时钟间隔 ≥ 8，每帧至多一次，目标跟随光标；松开后再过 24 个时钟单位无任何命令。按住期间浏览器解锁、暂停、离开地图，或到期帧的 hover 失败，都结束重复；重新锁定、继续、重进或 hover 恢复都不复活，只有新按下才再选。右键按下、按住、松开都不产生命令。
  - 真实 Pointer Lock：首次点击只锁定，`pointerLockElement` 为输入区，`pointerlockchange` 记录为 `zone`，锁定点击及其松开都不选。主动解锁：离开地图、`blur`（`clear-input focus-loss` 恰一次）、暂停（期间 clock 不变）。被动解锁：页面外调用 `document.exitPointerLock()`，记录 `zone,none`，地图仍开、处于 `click-to-lock`，位置保留，并发出 `clear-input pointer-lock-exit`；无锁移动无效，下一次点击只重锁（`zone,none,zone`）、不选。Playwright 的 Escape 到达页面但不经过 Chrome 原生解锁，锁仍在，也不调用 `open-menu`；原生 Esc 留给 30。
  - 权限与回退：pending 期间状态为 `locking`，会话保持 running、clock 前进，点击与移动都不提交；拒绝后为 `unlocked`，原因 `rejected`；授予后锁定，且不选。refuse 时无锁回退：主地图内的绝对坐标移动光标并隐藏系统指针（`cursor: none`）；黑边与主地图外的画框内点击不提交，并显示系统指针；地图内点击先 hover 再 select；无锁按住时离开主地图结束重复，回来不复活。帧、移动和点击都不再申请（requests 保持 1），只有显式 `retryLock` 才再申请。unsupported 时直接 `unlocked`，requests 为 0。
  - 资源平衡：探针新增 `pointer-lock` 分组，收录应用登记的 `pointerlockchange`、`pointerlockerror`、`mousemove`、`mousedown`、`mouseup`；`game-input-zone` 内元素归入 keyboard 分组。打开期间这些分组恰为 keyboard 9 个、pointer-lock 5 个、session 3 个。三轮关闭（两轮锁定、一轮在申请 pending 时关闭）后，`ResourceBalance.check` 均回到基线：监听、帧、定时器、观察者无差异，光标画布已移除，`pointerLockElement` 为空。
- **movementX 单位（供 25 选择 `movementScale`）：** 本机 Chrome 155 / macOS 26.6 中，锁定后用 CDP 注入的鼠标移动在 DPR 1 与 DPR 2 下报告的 `movementX/Y` 都等于 CSS 像素位移（60、−48 → 60、−48），即 CSS 像素，因此 `movementScale` 取 1 时光标位移与像素位置一致。这是注入输入的结果；物理鼠标的单位与速度仍归 30/31 实机核对。
- **测试工具发现：** Playwright 的 `evaluate`、locator 等待、trace DOM 快照与 `page.screenshot` 都以用户手势执行，会给页面留下瞬时用户激活，从而改变“取得资格时是否自动申请锁定”。因此钩子一律经 CDP `Runtime.evaluate`（`userGesture: false`）调用，本文件的 trace 关闭 DOM 快照。截图之后的重新取得资格，用例同时接受 `click-to-lock` 与 `locked`。经测试自己的 CDP 会话截图只有 CSS 分辨率，带 clip 时还会重置仿真 DPR，故不用。Chrome 对页面第一次鼠标事件不报告位移。
- **观察（不在本项范围，报告协调者）：** 同一帧内快速连按两次 `m`（离开后立即重进）时，申请发生在本 owner 的退出尚未完成之前。capabilities 因 `#held` 仍为已撤销的旧锁而直接返回，既不申请，也不记为 `closing`；退出完成后地图停在 `click-to-lock`，点击即可重锁，没有卡死。用例在两次按键之间等待退出完成。
- **审阅：** rubber-duck 一次，全部采纳：pending 申请未决时 `close()` 会因释放等待它而挂起，改为先以拒绝结束持有的申请，并加入 pending 关闭的平衡轮；像素判据增加独立的交点核对与像素数；补充暂停、离开地图、到期 hover 失败与右键的浏览器用例；固定睡眠改为按 projection 时钟或 select 计数等待。
- **Simplify：** 采纳：起始配置复用 `runSpec()`；删除未用的 `tick`、`runId` 状态字段；辅助模块不再导出 `ENTRY`、`call`、`expectedCursor`；`waitForMap` 直接返回匹配时的状态；开发服务器预热改为 `./e2e/entries/*.html`，新增入口无需再改配置。未采纳：e2e 与入口各声明一份状态类型（e2e 程序不编译 JSX，提出共享 `.ts` 协议文件超出写入范围）；`clientPoint`/`positionAt` 与生产换算重复（有意作为独立判据）；几何按帧读取 DOM 尺寸、`state()` 全量序列化、截图轮询（测试入口，开销可忽略）；探针按事件名归组（生产构建的调用栈没有模块路径，按调用点无法在 production 项目分组）。
- **检查：** `pnpm check` 通过（241 个文件、7,294 个测试与生产构建）。
- **文档影响：** 本项写入范围不含文档，建议由 32 记录：[工程约定](../../../../engineering/README.md)“本地浏览器 runner”中的地图隔离入口、headless 下 Pointer Lock 可用的条件、上述用户激活陷阱与 CDP 无手势调用、探针 `pointer-lock` 分组、预热改为 glob；[键位文档](../../../../engineering/keyboard-input.md)地图部分记录 movementX 实测（CSS 像素，注入输入）。

