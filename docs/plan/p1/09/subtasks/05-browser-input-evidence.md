---
type: plan
status: active
phase: P1
task: "09"
subtask: "05"
updated: 2026-10-03
---

# 05 — 键盘闭环、输入隔离与生命周期浏览器证据

**契约来源：** [Spec](../spec.md) 的 S-03 至 S-07、AC-08 至 AC-13 及浏览器验证策略。
**依赖：** 04。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md)执行实际页面验证，不写功能/修复或新 E2E runner；发现缺口归回责任项或新增修复项。
- 核对可复用服务器的项目与 origin，否则启动自有服务器；生产预览为当前代码构建。使用已有 Chromium、隔离 profile/context、种子 0 合成演示，不操作用户数据。
- 在开发及生产预览验证 AC-08/09/13：可信按键、焦点、投影、接受/拒绝反馈、defaultPrevented、scrollY、原生按钮/Tab、可读名称与说明。
- 开发环境验证真实 hidden→visible；生产预览至少验证元素失焦。仅窗口 blur/focus 仍 visible 的原生路径有界尝试，受限时保留准确限制及 02/03 的逻辑/接线证据，不能记为浏览器 passed。
- 开发环境至少 3 次菜单往返、StrictMode、一次真实新 owner Fast Refresh；同 owner Restart/Exit→Start 不加监听；生产预览至少往返一次。探针按目标与回调身份区分源、Session、React 委托及自身。
- 执行者在 browser-testing 观察外安排可还原的 HMR 临时编辑，确认真实重建；还原后核对工作树，不把临时变更作为交付。
- 失败 UI 中 unavailable 的数据/文字接线按 04 Node 测试与代码审阅标明证据层次，不伪造浏览器故障或以无控制台错误代替验收。

## 不包含

- 功能修复、永久测试脚本、浏览器下载、Playwright 配置/依赖或新报告文件。
- 跨浏览器/系统快捷键、原版对照、GPU 全量联合回归、云/部署。

## 关键文件与契约

- [Spec 验收表](../spec.md#验收标准)、01–04 交付与证据；本文件“完成证据”承载全部浏览器结果。
- [浏览器入口指南](../../../../engineering/README.md#已验证的-cdp-自动化路线)规定真实可见性路线；普通 connectOverCDP 页签切换不保证 hidden。
- [开发面板](../../../../../src/ui/dev/SyntheticDevPanel.tsx)投影采样为 100 ms；x 文本保留三位小数，Node 精确一致性属于 03。

## 验收标准

- [x] AC-08：左右分别按住 ≥1 s 方向正确；松开先等新 tick 投影，再跨 ≥300 ms 至少三次样本 tick 增加/x 不变；N/X/X 为接受/接受/拒绝；P 暂停继续不恢复旧轴。
- [x] AC-09：普通绑定 keydown/keyup 被拦截且不滚动；放行规则符合 Spec；按钮、菜单/导入页无游戏键效果，Enter/Space、Tab/Shift+Tab 正常。
- [x] AC-10：实际 hidden 时自动暂停，visible 后仍暂停，显式 P 后无新方向按下仍不移动；repeat=true 不恢复，新按下才移动；生产元素失焦停止轴且 Session 仍 running。
- [x] AC-11：唯一 keydown/keyup 对、所有旧源监听撤销平衡，菜单无应用源监听；一次 N 一个新命令结果；Restart/Exit→Start 不增 DOM 监听；StrictMode/HMR 证据完整。
- [x] AC-13：开发/生产可访问性与可见焦点证据完整，状态正确；AC-12 的稀有文字分开记录为 Node/审阅证据。
- [x] 每项标明 passed/failed/blocked，必需证据缺失保持未通过；自建资源、探针、profile 与临时编辑全部清理。

## 验证方法

- 现有 `pnpm dev`；`pnpm build` 后 `pnpm preview`。不指定可能已占用的端口，不停止用户拥有的服务器或浏览器。
- 初始探针只观察登记/撤销、defaultPrevented、原生可见性与焦点，不改世界、事件传播或浏览器 getter；重复按键须确认 repeat=true。
- 每项记录“验收项/设置操作/预期/观察证据/结果”，附版本、OS、视口、origin、隔离方式、错误与清理结果。300 ms 从新投影发布后的稳定样本窗口算，不取松键前旧值。
- 真实 hidden 按已验证 headed CDP 双目标路线执行；合成 visibilitychange、BFCache 或强制生命周期不能替代。
- 此项无实现改动，不调用 simplify；若代码随后因修复改变，受影响浏览器证据需在最终状态重验。

## 完成证据

**环境与边界（2026-10-03）：** 最终源码 `1261ab2`，Chrome 154.0.8037.95 / macOS。开发 `http://127.0.0.1:5180`，当前生产构建 `http://127.0.0.1:5181`（构建产物 index-BWtf9nnJ.js）；普通场景使用自有临时 profile 的 Chrome + connectOverCDP，每种 origin 再创建独立 context，视口 1280×800 / DPR 1。HMR 单独使用该自有 profile 的页面；其焦点截图实际视口 1200×1157。真实 hidden 使用另启的 headed Chrome、移除三个 backgrounding 默认参数、CDP createBrowserContext/createTarget/activateTarget，协议响应检查 exceptionDetails。全部内容为 seed 0 合成演示。

探针只观察 EventTarget 登记/撤销和 window 冒泡阶段 defaultPrevented；按目标、事件类型和回调身份关联撤销。从容器 keydown 开始识别同一同步连接的九项输入源登记，排除 React 根委托、Session 的三项生命周期和探针自身；不改事件传播、资格 getter 或世界。按键均来自 Playwright/CDP，记录 isTrusted=true；隐藏恢复的重复明确记录 repeat=true。

| 验收项 | 设置/操作 | 预期 | 观察证据 | 结果 |
|---|---|---|---|---|
| AC-08 左右移动与松键 | 两种构建各左右 hold 1100 ms，550 ms 中间采样；抬起后等待 tick 新发布，再每 120 ms 取四样本（跨度 360 ms） | 方向单调；松键后 tick 增加、x 完全不变 | 开发右 (tick,x)：(16,0)→(48,.467)→(85,1.083)，稳定 (91,1.100)→(110,1.100)；左 (110,1.100)→(147,.567)→(178,.050)，稳定 (184,-0.000)→(203,-0.000)。生产右 (6,0)→(37,.467)→(75,1.100)，稳定 (81,1.117)→(100,1.117)；左 (100,1.117)→(132,.650)→(170,.017)，稳定 (176,.017)→(194,.017)。每个稳定窗口均四样本 | passed |
| AC-08 N/X/P | N、X、X；按住右键→P 暂停→P 继续→旧右键重复 | 三结果接受/接受/拒绝；继续不恢复旧轴 | 开发 Core ticks 208/218/227，生产 200/209/219：add/remove accepted 后 marker-not-found rejected，各 run 1 commandIds 1/2/3。开发 paused tick245 x.150→running tick268 x.150；生产 tick237 x.183→tick255 x.183；旧 repeat 不改变 x | passed |
| AC-09 放行、页面隔离与原生控件 | 两种构建观察普通箭头 keydown/keyup、Ctrl+X、Escape、按钮/菜单/导入上的 N/X/P/右键；Enter、Space 与 Tab/Shift+Tab | 仅普通有效绑定被拦截；原生控件可操作，无游戏效果 | 两处箭头 down/up trusted/prevented=true；Ctrl+X down/up=false，Escape 放行，非输入区记录没有任何 unexpectedPrevented。运动期间 scrollY 均为0。按钮处游戏键不改 results；Enter 接受 add，Space 接受 remove。标题后 Tab→Return→输入区 active，Tab 离开、Shift+Tab 返回。菜单/导入无 canvas、无输入源监听 | passed |
| AC-10 元素失焦 | 两种构建按住右键后聚焦 Add 按钮，先等新 tick 后四样本跨360 ms | 轴停止、Session 仍 running | 开发 ticks286/292/298/305 均 x.317；生产274/280/286/292 均 x.350，phase均running；状态变inactive | passed |
| AC-10 原生 hidden/visible | 开发 headed CDP 的另一实际标签页激活，再返回；P 继续、autoRepeat，再松开重新按 | hidden 自动暂停；visible仍暂停；旧repeat无轴，新按下移动 | moving tick46 x.317；hidden/paused/hidden tick52 x.417，400 ms 后仍52；visible/focused/active仍paused tick52。P 后 repeat=true trusted=true；新发布后四样本跨360 ms ticks65/71/77/89 均 x.417。新非重复按下后 tick114 x.833。没有派发 visibilitychange 或改 getter | passed |
| AC-10 原生窗口焦点恢复 | 在 headed 浏览器创建另一实际窗口并激活，随后恢复；容器保持 activeElement，无新元素 focusin | 重新核对窗口事实，恢复通道而不恢复旧轴 | blur 时 visible=true/hasFocus=false，running/inactive tick139 x.833；focus 后 visible=true/hasFocus=true，running/active tick158 x.833。原生日志有 visible 状态下 blur/focus；此轮窗口操作前已松键，按住时清轴的完整矩阵由02/03 Node证据覆盖，不冒称此轮测了窗口按住释放 | passed |
| AC-11 StrictMode/往返/同owner换run | 实际 main 的 StrictMode 内开发3次往返，生产1次；每次 N 一次；Restart及Exit→Start | 唯一输入对、旧源平衡撤销，换run不加监听 | 开发总登记9→18→27→36，每次demo活9/keyLive2、menu活0；生产9→18，同样9/2/0。每次新run只有一个accepted结果。两种构建同owner换run登记保持9、活9、轴0；旧重复未恢复。StrictMode初次容器为null不取源，ref提交后仅一组有效源，没有虚构双登记证据 | passed |
| AC-11 新owner Fast Refresh | 开发临时改变 App 的 DemoScreen key 后恢复，检查真实HMR模块请求、run重置和回调身份 | 旧owner先释放、新owner唯一；还原无残留 | 单改hook注释/属性顺序有HMR模块请求但未创建新owner，不计为新owner证据。临时key改变后登记18/活9/旧group活0，results=None、焦点H2；N恰好run1/#1 accepted。还原后27/活9/前两group活0；N仍恰好一次结果；返回后27/活0。App/hook临时差异已全部还原 | passed |
| AC-13 可访问性/可见焦点 | 两种构建Tab、点击canvas与黑边；DOM/ARIA snapshot及合成截图 | 名称、关联说明、状态、可见focus；不抢标题焦点 | 进入焦点H2，键盘inactive。Tab和点击 x2 黑边/画布均聚焦synthetic-view。region名称为Synthetic view and game key input，tabIndex0；aria-describedby引用五键说明与not original controls。ARIA snapshot包含region和命名img；CSS outline rgb(26,95,180) solid3px，开发/生产截图实际可见蓝框与合成形状。状态active/inactive与焦点一致 | passed |
| AC-12 稀有失败 | 04 Node故障测试及UI接线审阅 | unavailable保留原因且面板可用；回滚失败锁存 | 生产Source的登记/多项撤销故障在04测试；owner reader带原始error，React describeError逐项呈现，不显示激活提示；初始化失败显示具体原因。没有在浏览器伪造这些错误或把它们记为浏览器pass | passed（Node/审阅） |

- 两种普通场景 pageerror 均为空，真实浏览器操作均通过。初次 CDP observer 使用 addScript 未安装成功，取日志时显式 ReferenceError；该轮不计证据。改为已加载页面安装只读观察、Page.enable 后重跑，上表原生日志来自完整成功轮次。
- 清理：每个普通context均close；headed context dispose、浏览器close；HMR页面返回菜单、活监听0后关闭。Browser.close 关闭自有shell Chrome；自有入口页后续工具返回not found（已不可访问）。自建Vite/preview停止，5180/5181/9222无监听；仅移除已解析的自有profile及两张合成临时截图。原有5173服务器未触碰；工作树只剩预期goal/本项证据，无临时代码或fixture。
- rubber-duck 无阻断，提出 Return to menu 的具体放行证据及更密集单调采样建议，均补测落实：两种 origin 各在 Return 焦点下发送右/N/X/P，8 个 trusted down/up 全部 prevented=false，x0/results=None/phase running 不变（开发 tick5→25，生产0→22）。左右 hold1200 ms，每120 ms取样，共11点；开发右 tick37→111 x0→1.233，左111→185 x1.233→.033；生产右22→96 x0→1.167，左96→170 x1.167→.100，全部相邻样本方向单调且正增量。补测的独立浏览器/context已关闭，两自有服务器再次停止，入口页同样已不可访问。
- 文档影响核对：新的可靠窗口focus路线只作为本项证据，不修改冻结决定或原版冲突事实；工程/键位/结构指南的输入接线由06定稿。本项只验证，无实现变更，不需要simplify。
