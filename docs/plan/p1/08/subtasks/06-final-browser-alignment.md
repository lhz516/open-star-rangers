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

- [ ] AC-01、AC-03–AC-07、AC-10（浏览器部分）、AC-11、AC-12、AC-13 的真实浏览器证据完整，或逐项记录 blocked 及准确原因。
- [ ] AC-15 的浏览器交叉验证（一次性 start、先释放后创建、Exit 不被撤销）与 03 的 Node 证据一致。
- [ ] 验收覆盖表的每个 S/AC 都有实现与证据；`pnpm check` 在最终代码上通过；`node tools/task-state.ts p1/08` 在 tracker 全部 completed 后路由为 `done`。
- [ ] 自建浏览器、服务器、临时 profile 与临时编辑全部清理；`git status` 除预期改动外无残留；无原版内容或截图入库。

## 验证方法

- 每项按 spec 的验证方法列出：设置/操作、预期、观察证据、结论（passed/failed/blocked）。
- 环境记录：浏览器版本、操作系统、视口、源、启动参数、隔离方式与清理结果。

## 完成证据

**环境：**
- 浏览器与平台：Chrome 154.0.8037.95 / macOS，由 shell 启动，每个场景使用独立的临时 `--user-data-dir`，经 `connectOverCDP` 由 VS Code `runPlaywrightCode` 驱动。
- 开发服务器：自建 `pnpm dev`，源为 `http://127.0.0.1:5180`。生产构建：`pnpm build` 后的 `vite preview`，源为 `http://127.0.0.1:5181`，使用全新 profile。WebGL 不可用场景使用另一个带 `--disable-webgl --disable-webgl2 --disable-3d-apis` 的全新 profile。
- 视口默认 1280×800，DPR 1。另有一个非本轮启动的 5173 开发服务器，未触碰。
- 计数方式：init script 探针（临时文件，未入库）包装 rAF/cancel、window/document 的 `addEventListener`/`removeEventListener`、ResizeObserver、resolution `matchMedia` 的 change 登记、WebGL `getContext` 与 `reportError`。只统计调用栈含 `/src/`（开发）或 `/assets/`（生产）的调用，排除 Vite 客户端与测试工具的轮询。
- 判读规则：诊断值每次断言前都先点击“Refresh diagnostics”刷新。截图在页面内经 `createImageBitmap` 解码，以 ±3 容差统计 mover #ffd040、marker #40ff80、背景 #102040 的像素，截图不入库。

| 验收项 | 设置/操作 | 预期 | 观察证据 | 结论 |
|---|---|---|---|---|
| AC-01 | 开发服务器与生产预览各加载一次主菜单 | 标题、声明、画面标题与数据状态正确；Tab 序列恰为两个按钮且各有说明；无画布、rAF、监听；焦点在 body；除 favicon 外无错误 | 两处：h1 `Open Star Rangers`、声明、h2 `Main menu`（tabIndex −1）、数据状态“none verified… cannot import or verify”。Tab 序列恰为启用的 `Start synthetic demo` 与 `Import original game data`，两者 `aria-describedby` 文本符合契约。正文无原版玩法入口或成功标记（关键词检索为 false）。0 个画布；1.1 s 定时器窗口内应用 rAF 调用 0，生命周期监听 0，键盘监听 0；`activeElement` 为 BODY。生产预览唯一控制台错误为 `/favicon.ico` 404 | passed |
| AC-03 | 分别用鼠标、Enter、Space 激活 Start；生产预览再进入一次 | 进入演示、焦点在标题；1 个画布；≤1 s 内 running/run 1 且 tick 递增；诊断 ready 且 draws 递增；mover 像素存在；Return 是标题后第一个 Tab 控件；rAF 待执行 ≤1，生命周期净登记 3 | 三种方式进入后焦点均在 H2 `Synthetic demo`，容器内 1 个画布。running/run 1 分别出现在点击后 97 ms（开发）与 421 ms（生产）。tick 0→26。两次刷新诊断均为 ready，draws 7→59、41→69。mover 像素 814（生产也是 814）。两处合成标注可见。从标题按 Tab 到达 `Return to menu`。1.1 s 窗口内 rAF 最大待执行 1，生命周期净登记 3，ResizeObserver 1，resolution 查询 1。重复自动启动见 AC-15 | passed |
| AC-04 | 由菜单进入后依次 Pause、Resume、Restart+Pause、Resume、Add、Exit、面板 Start | 暂停时 draws 不变；Restart 后 run 2、tick 与 drawnTick 为 0；marker ≥9 px；Exit 后 idle 且不被撤销；面板 Start 后 run 3 | Pause 后 paused，间隔 1.1 s 两次刷新 draws 都是 42。Resume 后 running。旧 tick 33 ≥ 30 时，同一任务内 Restart 后立即 Pause：run 2、projection tick 0、drawnTick 0。Resume 后 Add marker 在 tick 2 得到 Core accepted，marker 像素 212。Exit 后 idle、投影为“No current world.”、只剩背景像素，1.1 s 后仍 idle。面板 Start 后 run 3 running。全程未切换画面 | passed |
| AC-05 | 从 running（鼠标）、user 暂停（键盘 Space）、Exit 后 idle（鼠标）三种状态返回菜单 | 焦点在 Start；无画布；旧画布断开且上下文丢失；rAF 与待执行 0；各类登记等于撤销；无异常或 reportError；生产预览返回无网络请求 | 三次返回后焦点都在 `Start synthetic demo`，DOM 中 0 个画布，记录到的画布全部断开，`isContextLost()` 全部为 true（扩展均可用）。1.1 s 窗口内应用 rAF 调用 0、待执行 0。生命周期 3/3、6/6、9/9，ResizeObserver 与 resolution 查询登记等于撤销。reportError 0，无未捕获异常。生产预览返回时 CDP Network 记录 0 个请求 | passed |
| AC-06 | 单次调用内连续 20 次“进入 → tick ≥30 → Add accepted → 返回”，再做 20 次导入往返、一次同任务双击入口、一次“返回后立即再进入” | 每次进入 1 个画布、run 1、实体 2；返回后无画布与待执行 rAF；全程 rAF 待执行 ≤1；结束后全部画布断开且上下文丢失，各类登记等于撤销；无 WebGL 警告；导入往返无资源；双击与立即重进仍先释放后创建 | 20 次均为：进入时 1 个已连接画布，runId 1，刷新后实体 2；返回后 0 个画布、待执行 0。循环期间 rAF 最大待执行 1。结束时累计 25 个画布全部断开、上下文全部丢失；生命周期 75/75，ResizeObserver 25/25，resolution 查询 25/25。导入往返 20 次：每次画布与待执行合计 0，rAF、生命周期与画布增量均为 0。双击后为演示画面，1 个画布。返回后立即再进入：1 个已连接画布、run 1、待执行 1。控制台与 Chrome `Log` 中没有 “Too many active WebGL contexts” 或 WebGL 错误（记录为空） | passed |
| AC-07 | 开发：键盘进入导入并返回。生产预览全新 profile：3 次导入往返（鼠标、键盘、鼠标），之后读回存储 | 焦点在标题；说明符合契约；唯一控件为 Return；无文件输入、画布、rAF、监听；返回焦点在 Import；页面转换无请求；存储全空 | 焦点在 H2 `Import original game data`。文本说明未实现，不读取、存储或上传原版文件，以后版本在浏览器本地处理用户自有数据，未声称支持任何格式。唯一可交互控件为 `Return to menu`；0 个 file input、0 个画布、0 个待执行 rAF、生命周期 0（生产）。每次返回焦点都在 Import 入口。生产预览加载请求只有 `/`、JS、CSS 与 favicon，3 次往返期间 0 个请求。`localStorage`/`sessionStorage` 长度 0，`indexedDB.databases()` 为 []，`caches.keys()` 为 []，cookie 为空 | passed |
| AC-10（浏览器部分） | WebGL 禁用的 Chrome 先确认 `getContext('webgl2')` 为 null，再进入、Add、返回，重复两次 | unavailable alert 且会话不受影响；running；Add accepted；返回不锁存；再进入仍 unavailable；无未捕获异常 | 两次进入都显示 `role=alert` 的“WebGL 2 is unavailable… The session is not affected.”，0 个画布，running/run 1，Add marker accepted。返回后焦点在 Start，Start 未禁用，无清理失败 alert，生命周期净 0、待执行 0、reportError 0、无未捕获异常。控制台只有预期的 Three.js 上下文创建错误与 favicon 404，单独记录，不算意外错误 | passed |
| AC-11 | 第一轮新加载后按 Tab 两次；第二轮按 spec 的键盘序列走完；再在三个画面聚焦标题后按 Esc、`p`、Alt | Tab 顺序与焦点落点正确；焦点指示可见；应用无全局键盘监听；按键不切换画面、不改变会话 | 第一轮：Start → Import。第二轮：Tab 到 Start → Enter 进入演示，焦点在标题 → Tab 到 Return → Space 返回，焦点在 Start → Tab 到 Import → Enter 进入占位，焦点在标题 → Tab 到 Return → Enter 返回，焦点在 Import。按钮键盘焦点均匹配 `:focus-visible`，outline 为 `solid 3px`。应用在 window/document 上的 keydown/keyup/keypress 登记为 0。导入、菜单、演示三画面按键后画面不变；演示保持 running/run 1，tick 19→43 照常推进 | passed |
| AC-12 | 开发模式。StrictMode 首次进入同 AC-03。保留应用外壳，后台脚本在 `DemoScreen` 中 6 次切换一行临时 `useState(0)`（迫使 effect 重跑），页面内观察者记录每次画布替换。之后在同一 owner 上 Exit 并对 `SyntheticDemoPage` 做 2 次注释编辑、点刷新诊断。最后在菜单上做 6 次 HMR 编辑（含 4 次 `useState` 切换） | 每次替换后旧画布断开、上下文丢失，1 个画布，新 owner running/run 1 且 tick 递增，rAF ≤1，生命周期净 3；同一 owner 上的重渲染不重复 start，Exit 后仍 idle；菜单编辑不创建 owner；编辑全部还原 | 6 次 HMR 各自触发一次 owner 替换（开发服务器日志 6 条 App.tsx 更新）。每次替换后旧画布 `isConnected` 为 false、`isContextLost()` 为 true，DOM 中 1 个画布，running/run 1，tick 67→92 等递增，区间内 rAF 最大待执行 1，生命周期净 3，无错误或 reportError。Exit 后的同一 owner 在 2 次页面编辑与刷新诊断后仍是同一画布、idle、run none。菜单在 6 次 HMR 更新后：0 个画布，生命周期 0，rAF 0，无错误。注：首次菜单尝试因测试脚本先插入 `useState` 调用、后补导入，引发由测试编辑本身造成的 ReferenceError；该次作废，重载后按正确顺序复做，结果如上。所有临时编辑已还原，`git diff -- src` 为空 | passed |
| AC-13 | CDP `Emulation.setDeviceMetricsOverride` 设 1280×800 与 360×640（DPR 1），三个画面分别测量 | 无横向溢出；按钮完整位于视口内、文字不裁切；入口说明可见 | 6 种组合下 `scrollWidth − clientWidth` 均为 0；越界或 `scrollWidth > clientWidth` 的按钮为空集；主菜单两条入口说明 `checkVisibility()` 均为 true | passed |
| AC-15（浏览器交叉验证） | AC-03/04/06/12 的观察 | 每个新 owner 只 start 一次；先释放后创建；Exit 不被自动 start 撤销 | 每次进入或替换都是 run 1（没有重复 start 造成的 run 2）；同时存在的画布与 rAF 链至多 1 个；Exit 后 1.1 s 以上，以及 HMR 重渲染后都保持 idle。与 [03](./03-demo-lifecycle-wiring.md) 的 Node 证据一致 | passed |

**覆盖核对：**
- **S-01：** 01 的转换表测试，加本文 AC-01/03/05/07。
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
- **AC-02、AC-09、AC-14：** 01、02、05 的 Node 测试与工程检查。
- **AC-08：** 05 的源码检索。

第一轮核对发现 `demoVisit` 耗尽时应用未显式显示错误（见 goal 执行记录），已新增修复子任务 [08](./08-demo-visit-exhaustion-feedback.md)。

**不变量与工程检查：**
- 最终代码上 `pnpm check`：43 个文件 1094 passed，构建成功（仅既有块体积警告）。
- Core、Runtime、Session 契约未改；没有新依赖，没有原版内容、截图或研究输出入库。
- 稀有失败（failed、faulted、清理失败锁存）未在浏览器中伪造，证据为 02/03 的 Node 测试与 05/07 的审阅。
- 既有 P1-07 的 context-restore 警告路径未在本轮执行，仍按交接留给 P1-10。

**清理：**
- 已按 PID 停止本轮启动的 3 个 Chrome，删除 3 个临时 profile、临时探针、切换脚本与日志。
- 已停止自建的 5180 开发服务器与 5181 预览服务器；工具入口页已不存在。
- 5173 服务器保持原状。`git status` 只有本任务的文档改动。


