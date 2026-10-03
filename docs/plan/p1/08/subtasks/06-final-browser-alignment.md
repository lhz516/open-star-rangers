---
type: plan
status: active
phase: P1
task: "08"
subtask: "06"
updated: 2026-10-02
---

# 06 — 最终浏览器对齐

**契约来源：** [spec](../spec.md) 全部 S-01–S-08 与 AC-01–AC-15 的覆盖核对；浏览器证据对应 AC-01、AC-03–AC-07、AC-10–AC-13，并交叉验证 AC-15。
**依赖：** 01, 02, 03, 04, 05, 07, 08。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 只做验证，不交付新功能代码；发现缺口时由 execute-goal 新增修复子任务，插入本行之前并加入依赖。
- 按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md) 与[工程约定](../../../../engineering/README.md#已验证的-cdp-自动化路线)的 CDP 路线：自有 `pnpm dev` 与 `pnpm build` + `vite preview`，隔离临时 profile 的 Chrome，init script 探针按调用栈归属计数 rAF、生命周期监听、ResizeObserver、resolution 查询、键盘监听与画布。
- 逐项取得 AC-01、AC-03、AC-04、AC-05、AC-06、AC-07、AC-11、AC-13 证据；AC-10 在 WebGL 禁用的隔离 Chrome 中取证；AC-12 由执行回合做可还原的 Fast Refresh 编辑并确认 effect 实际重跑，结束后还原并证明无残留。
- 核对 goal 验收覆盖表每一行都有实现与证据；汇总 01–05 的 Node 与审阅证据；更新 goal 执行记录、阶段索引导航，以及在优先项变化时更新 [STATUS](../../../../STATUS.md)。

## 不包含

- 功能实现或修复（新增修复子任务）。
- Firefox、WebKit、真实设备矩阵与系统快捷键拦截（P1-10/P5）。
- 罕见失败（failed/faulted/清理失败锁存）的浏览器复现：无注入入口，以 02/03 Node 与 05 审阅为证，不伪造。

## 关键文件与契约

- 证据写入本文件“完成证据”；浏览器只用种子 0 的合成演示，截图在页面内解码采样，不入库。
- 既有 P1-07 观察：上下文丢失/恢复后释放产生的 Three.js `INVALID_OPERATION` 警告不属于本任务，测试窗口不主动执行该路径。

## 验收标准

- [x] AC-01、AC-03–AC-07、AC-10（浏览器部分）、AC-11、AC-12、AC-13 的真实浏览器证据完整，或逐项记录 blocked 及准确原因。
- [x] AC-15 的浏览器交叉验证（一次性 start、先释放后创建、Exit 不被撤销）与 03 的 Node 证据一致。
- [x] 验收覆盖表的每个 S/AC 都有实现与证据；`pnpm check` 在最终代码上通过；`node tools/task-state.ts p1/08` 在 tracker 全部 completed 后路由为 `done`。
- [x] 自建浏览器、服务器、临时 profile 与临时编辑全部清理；`git status` 除预期改动外无残留；无原版内容或截图入库。

## 验证方法

- 每项按 spec 的验证方法列出：设置/操作、预期、观察证据、结论（passed/failed/blocked）。
- 环境记录：浏览器版本、操作系统、视口、源、启动参数、隔离方式与清理结果。

## 完成证据

**轮次：**
- 第一轮在修复 [08](./08-demo-visit-exhaustion-feedback.md) 之前的代码上取证，各项浏览器观察均通过。随后的 rubber-duck 核对发现两类问题，导致本行退回 pending（见 goal 执行记录）：
  - 应用缺少 `demoVisit` 耗尽反馈。
  - AC-03/06/12 的部分观察不够完整。
- 第二轮在最终代码（含 07、08）上取得下表全部证据。

**环境：**
- 浏览器与平台：Chrome 154.0.8037.95 / macOS，由 shell 启动，每个场景使用独立的临时 `--user-data-dir`，经 `connectOverCDP` 由 VS Code `runPlaywrightCode` 驱动。
- 开发服务器：自建 `pnpm dev`，源为 `http://127.0.0.1:5180`。生产构建：`pnpm build` 后的 `vite preview`，源为 `http://127.0.0.1:5181`，使用全新 profile。WebGL 不可用场景使用另一个带 `--disable-webgl --disable-webgl2 --disable-3d-apis` 的全新 profile。
- 视口默认 1280×800，DPR 1。另有一个非本轮启动的 5173 开发服务器，未触碰。
- 计数方式：init script 探针（临时文件，未入库）包装 rAF/cancel、window/document 的 `addEventListener`/`removeEventListener`、ResizeObserver、resolution `matchMedia` 的 change 登记、WebGL `getContext`（同时记录 create/lose 顺序）与 `reportError`。只统计调用栈含 `/src/`（开发）或 `/assets/`（生产）的调用。
- 判读规则：诊断值每次断言前都先点击“Refresh diagnostics”刷新。截图在页面内经 `createImageBitmap` 解码，以 ±3 容差统计 mover #ffd040、marker #40ff80、背景 #102040 的像素，截图不入库。

| 验收项 | 设置/操作 | 预期 | 观察证据 | 结论 |
|---|---|---|---|---|
| AC-01 | 开发服务器与生产预览各加载一次 | 标题与声明、`Main menu`、数据状态；Tab 序列恰为两个按钮且各有说明；无画布、rAF、监听；焦点在 body；除 favicon 外无错误 | 两处都显示 h1、声明、h2 `Main menu`（tabIndex −1）与数据状态“none verified… cannot import or verify”。Tab 序列恰为 `Start synthetic demo`、`Import original game data`，`aria-describedby` 说明分别为“A P1 synthetic engineering demo, not original gameplay. It needs no game data.”与“Not implemented in this build.”。无原版玩法入口或成功标记。0 个画布；1.1 s 定时器窗口内应用 rAF 调用 0，生命周期监听 0；`activeElement` 为 BODY。生产预览唯一控制台错误为 `/favicon.ico` 404 | passed |
| AC-03 | 分别用鼠标、Enter、Space 激活 Start，每种方式单独取全部观察；生产预览再用鼠标进入 | 每种方式：焦点在标题；1 个画布；≤1 s 内 running/run 1 且 tick 递增；两次刷新诊断为 ready 且 draws 递增；mover 像素存在；两处标注可见；Return 是标题后第一个 Tab 控件；rAF 待执行 ≤1，生命周期净 3 | **鼠标：** 157 ms 后 running，焦点 H2，1 个画布，run 1；tick 0→40，draws 7→71（ready），mover 814，标注可见，标题后 Tab 到 Return，rAF 最大待执行 1，生命周期净 3。**Enter：** 38 ms，焦点 H2，1 个画布，run 1；tick 0→30，draws 3→67，mover 814，标注可见，Tab 到 Return，最大待执行 1，净 3。**Space：** 41 ms，焦点 H2，1 个画布，run 1；tick 0→31，draws 3→67，mover 814，标注可见，Tab 到 Return，最大待执行 1，净 3。**生产：** 98 ms，run 1，draws 67→107，mover 814 | passed |
| AC-04 | 由菜单进入后依次 Pause、Resume、Restart+Pause、Resume、Add、Exit、面板 Start | 暂停时 draws 不变；旧 tick ≥30 时 Restart 后 run 2、tick 与 drawnTick 为 0；marker ≥9 px；Exit 后 idle、只剩背景并保持 ≥1 s；面板 Start 后 run 3 | 暂停时间隔 1.1 s 两次刷新 draws 都是 45；Resume 后 running。旧 tick 34 时同一任务内 Restart 后立即 Pause：paused，run 2，tick 0，drawnTick 0。Resume 后 Add 得到 Core accepted，marker 像素 212。Exit 后 idle/run none，mover 与 marker 像素均为 0、背景 417760；1.1 s 后仍 idle。面板 Start 后 running/run 3 | passed |
| AC-05 | 从 running 用鼠标返回、从 user 暂停用键盘 Space 返回、从 Exit 后的 idle 用鼠标返回；生产预览再从 running 返回 | 焦点在 Start；无画布；旧画布断开且上下文丢失；1 s 窗口 rAF 为 0；各类登记等于撤销；无异常或 reportError；生产返回无请求 | 三次返回焦点均在 Start，0 个画布，已连接 0。上下文丢失累计 1/1、2/2、3/3（扩展均可用）。1.1 s 窗口 rAF 调用 0、待执行 0。生命周期 3/3、6/6、9/9；ResizeObserver 1/1、2/2、3/3；resolution 查询同为 1/1、2/2、3/3。reportError 0，无未捕获异常。生产返回 CDP Network 记录 0 个请求，各类登记 1:1，上下文丢失 1/1 | passed |
| AC-06 | 单次调用内连续 20 次“进入 → tick ≥30 → Add 得到 Core accepted → 返回”，循环中任一条件超时即失败；再做 20 次导入往返；同任务双击入口；返回后菜单一出现就再进入；Chrome `Log` 与控制台监听 | 每次进入 1 个已连接画布、run 1、实体 2；返回后无画布与待执行 rAF；全程 rAF 待执行 ≤1；结束后全部断开且上下文丢失、登记相等；无 WebGL 警告；导入无资源；双击与重进先释放后创建 | 20/20 次 Core accepted，Add 前最低 tick 30，逐次检查无异常（进入时 1 个已连接画布、run 1；刷新后实体 2；返回后 0 个画布、待执行 0）。循环 rAF 最大待执行 1。导入 20 次往返：rAF、生命周期、画布增量均为 0，每次画布与待执行合计 0。双击：第二次点击落在新画面的 `Return to menu`，日志 `create 21 → lose 21`，最终回到菜单、0 个画布。立即重进：日志 `lose 22 → create 23`，即旧上下文先丢失后才创建新画布，结果 1 个画布、run 1。结束时 24 个画布全部断开且上下文丢失，生命周期 72/72，ResizeObserver 24/24，resolution 查询 24/24，1.1 s 窗口 rAF 0。控制台与 `Log` 记录为空，没有 “Too many active WebGL contexts” | passed |
| AC-07 | 开发：键盘进入导入。生产预览全新 profile：加载完成后 3 次导入往返（鼠标、键盘、鼠标）并读回存储 | 焦点在标题；说明符合契约；唯一控件为 Return；无文件输入、画布、rAF、会话监听；返回焦点在 Import；页面转换无请求；存储为空 | 焦点在 H2 `Import original game data`。文本说明未实现，不读取、存储或上传原版文件，以后版本在浏览器本地处理用户自有数据，未声称支持任何格式。唯一控件 `Return to menu`；0 个 file input、0 个画布、待执行 rAF 0、生命周期净 0。三次返回焦点都在 Import 入口。生产加载请求只有 `/`、JS、CSS、favicon，3 次往返期间 0 个请求。`localStorage`/`sessionStorage` 长度 0，`indexedDB.databases()` 为 []，`caches.keys()` 为 []，cookie 为空 | passed |
| AC-10（浏览器部分） | WebGL 禁用的 Chrome：确认 `getContext('webgl2')` 为 null，进入、Add、返回，重复两次 | unavailable alert 且会话不受影响；running；Add accepted；返回不锁存；再进入仍 unavailable；无未捕获异常 | 两次进入都显示 `role=alert` 的“WebGL 2 is unavailable… The session is not affected.”，0 个画布，running/run 1，Add accepted。返回后焦点在 Start，Start 未禁用，无锁存 alert，生命周期净 0、待执行 0、reportError 0、无未捕获异常。控制台只有预期的 Three.js 上下文创建错误与 favicon 404 | passed |
| AC-11 | 第一轮新加载后按 Tab 两次；第二轮走完 spec 的键盘序列；三个画面聚焦标题后按 Esc、`p`、Alt | Tab 顺序与焦点正确；焦点指示可见；无应用全局键盘监听；按键不改变画面或会话 | 第一轮：Start → Import。第二轮：Tab 到 Start → Enter 进入演示（焦点 H2）→ Tab 到 Return → Space 返回（焦点 Start）→ Tab 到 Import → Enter 进入占位（焦点 H2）→ Tab 到 Return → Enter 返回（焦点 Import）。按钮键盘焦点都匹配 `:focus-visible`，outline 为 `solid 3px`。应用在 window/document 上的键盘监听登记为 0。按键后导入与菜单画面不变；演示保持 running/run 1，tick 19→43 | passed |
| AC-12 | 开发模式。StrictMode 首次进入同 AC-03。保留应用外壳：<br>(a) 后台脚本在 `DemoScreen` 中 6 次切换临时 `useState(0)`，页面内观察者记录每次替换；<br>(b) 面板 Exit 后，只改 `SyntheticDemoPage` 根 `<section>` 的临时属性值，共 2 次（不改结构），再点刷新诊断；<br>(c) 返回菜单，对 `MainMenuPage` 根 `<section>` 做 3 次可观察的属性编辑 | (a) 每次旧画布断开且上下文丢失，1 个画布，新 owner running/run 1、tick 递增，rAF ≤1，生命周期净 3；(b) 同一 owner/画布上的重渲染不重复 start，Exit 后仍 idle；(c) 菜单编辑不创建 owner；全部还原 | (a) 6 次替换均为：旧画布已断开且上下文丢失，DOM 中 1 个画布，running/run 1，tick 74→92、66→91、73→97、74→98、67→92、75→93，rAF 最大待执行 1，生命周期净 3，无错误。(b) 页面属性依次变为 `1`、`2`，证明画面确实重渲染；画布仍是同一个，没有新画布或生命周期登记，保持 idle/run none，无错误。(c) 菜单属性依次更新到 `3`，画布、生命周期与 rAF 增量均为 0，无错误。<br>附带观察：在 section 内插入新子元素，或编辑 `App.tsx`（Fast Refresh 会重跑该模块组件的 effect），都会替换视图容器或重跑 owner effect，从而得到新 owner（running/run 1）。这符合容器替换契约，因此 (b) 改用不改结构的属性编辑来证明同一 owner。所有临时编辑已还原，`git diff -- src` 为空 | passed |
| AC-13 | CDP 设备仿真 1280×800 与 360×640（DPR 1），三个画面分别测量 | 无横向溢出；按钮完整位于视口内、文字不裁切；入口说明可见 | 6 种组合 `scrollWidth − clientWidth` 均为 0；越界或裁切的按钮为空集；主菜单两条说明可见。画面切换轨迹无异常往返 | passed |
| AC-15（浏览器交叉验证） | AC-03/04/06/12 的观察 | 每个新 owner 只 start 一次；先释放后创建；Exit 不被自动 start 撤销 | 每次进入或替换都是 run 1；立即重进日志显示先 lose 后 create；同时存在的画布与 rAF 链至多 1 个；Exit 后 ≥1.1 s 以及页面重渲染后都保持 idle。与 [03](./03-demo-lifecycle-wiring.md) 的 Node 证据一致 | passed |

**取证中的工具异常（不是应用问题）：**
- 第二轮第一次键盘/视口调用中，一次 Start 点击因按钮反复脱离 DOM 而超时，当时没有页面错误。
- 单独复现时导航与点击都正常。在每次返回后显式等待菜单标题再复跑，全部通过，标题变化轨迹也没有异常往返。
- 另一次 AC-06 尝试因测试脚本在同一任务内找不到尚未渲染的 Start 按钮而中止，改为“菜单出现后立即再进入”后通过。

**覆盖核对：**
- **S-01：** 01 的转换表测试，加 AC-01/03/05/07。
- **S-02：** AC-01。
- **S-03：** 03 的一次性 start 测试，加 AC-03/12/15。
- **S-04：** 03 的先释放后创建测试，加 AC-05/06/12。
- **S-05：**
  - 02、03 的记录与锁存 Node 测试。
  - 04、05、07 的文案与恢复入口：代码审阅。
  - AC-10 的 unavailable 浏览器证据。
- **S-06：** AC-07。
- **S-07：** AC-03/05/07/11。
- **S-08：** 05 的文档同步，加本文。
- **AC-02：** 01 的 Node 测试，以及 08 的应用反馈审阅。
- **AC-08：** 05 的源码检索。
- **AC-09：** 02、03。
- **AC-14：** 05。

**不变量与工程检查：**
- 最终代码 `dc20039` 上 `pnpm check`：43 个文件 1094 passed，构建成功（仅既有块体积警告）。
- 自计划提交起 `package.json`/`pnpm-lock.yaml` 无差异。Core、Runtime、Session 契约未改。
- 没有原版内容、截图或研究输出入库。稀有失败未在浏览器中伪造。既有 P1-07 的 context-restore 警告路径未执行，仍归 P1-10。
- tracker 全部 completed 后，`node tools/task-state.ts p1/08` 的结果见下条。

**清理：**
- 两轮自建的 Chrome 都已按 PID 停止（每轮 3 个）。临时 profile、探针、切换脚本与日志已删除。
- 自建的 5180/5181 服务器已停止；工具入口页已不存在。
- 5173 服务器保持原状。`git status` 只有本任务的文档改动。

- **路由：** 全部行 completed 后，`node tools/task-state.ts p1/08` 输出 `p1/08 -> done (terminal)`，原因为 every subtask is completed。
- **Rubber-duck：**
  - 第一轮核对的阻断项已处理：应用缺少耗尽反馈（修复子任务 08）、AC-03 逐方式结果、AC-06 的 20/20 accepted 与释放顺序、AC-12 可观察的同一 owner 重渲染，均在第二轮补齐；勾选的 `done` 路由已实际运行并记录。
  - 关于 STATUS“与 tracker 矛盾”：STATUS 与本行 completed 在同一提交中更新，沿用其列出已完成任务的既有写法。
