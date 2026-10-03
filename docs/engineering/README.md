---
type: guide
status: active
phase: P1
updated: 2026-10-03
related: [ADR-0002, ADR-0006, ADR-0015]
---

# 工程约定

本项目代码的结构、命令与检查规则。架构决定见[总计划](../plan/master-plan.md) §4–5；本文只记录落地方式。

当前源码目录、Runtime/Session 的分工、helper 归属与后续阶段扩展落点见[源码结构指南](./source-structure.md)，决定见 [ADR-0015](../decisions/ADR-0015-source-module-structure.md)。历史源码路径的对应关系与本轮验证只在[迁移记录](./source-structure.md#p1-06-前迁移记录)维护。

按 spec、goal 与 subtasks 开发的路径、审批、进度维护和 skills 入口见[Agent 任务工作流](./agent-workflow.md)。

## 环境

- Node 22（`.nvmrc`；`package.json` 要求 ≥ 22.18，以便直接运行 `.ts`），pnpm 12（`packageManager` 字段，由 corepack 提供）。
- 依赖用 `pnpm-lock.yaml` 锁定，升级经测试后合入。

## 命令

| 命令 | 作用 |
|---|---|
| `pnpm dev` | 启动 Vite 开发服务器 |
| `pnpm build` | 生产构建及严格分发许可声明，输出到 `dist/` |
| `pnpm typecheck` | 分别用四个 tsconfig 做类型检查（见下） |
| `pnpm lint` | ESLint，包含模块边界与确定性规则 |
| `pnpm test` | Vitest 单元测试 |
| `pnpm check` | 依次运行以上四项检查，提交前使用 |
| `pnpm test:e2e` | 先构建当前代码，再运行独立的本地 Chromium 浏览器回归；不属于 `pnpm check` |

`tools/` 中的研究脚本直接用 `node tools/<脚本>.ts` 运行，见 [tools](../guides/tools.md)。

### 构建许可声明

[构建插件](../../tools/compliance/build-plugin.ts)仅用于build，不进入应用。正常构建同时生成 `dist/LICENSE.txt`、`dist/THIRD-PARTY-NOTICES.txt`、`dist/compliance-inventory.json`；inventory是分发/指纹元数据，不是已通过合规报告。

- 当前锁与实际安装集合由pnpm自身frozen校验及只读查询核对；frozen在自有离线临时副本中运行lockfile-only/ignore-scripts，不修改用户树。缺依赖/文本/归属、未知或不支持的网站许可使build非零；普通命令不下载许可或安装依赖。
- 分发依据真实chunk/module、map附带来源及静态文件，不看dev标签。Vite/Rolldown实际注入的helper也属于分发；当前lightningcss仅本地工具，不自动获得网站许可。public复制文件必须显式归属，当前无public资源系统。
- [声明生成器](../../tools/compliance/notices.ts)保留当前shipped包的完整本地LICENSE/COPYRIGHT/NOTICE（含多文本/目录及显式声明的义务），校验许可正文/版权基础完整性；未知义务仍需人工审阅，不是法律鉴定。项目MIT与原版权利范围见[根说明](../../README.md#许可证与原版权利)。
- 构建先移除旧声明/inventory及自有temporary文件；正常输入在load前记录并于写出前核对，输入变化或生成/IO失败不能留有效旧inventory。只管理3个明确输出，不清用户/local/或依赖目录；输入/产物SHA256有变化须重建。

## TypeScript 配置

| 文件 | 范围 | 作用 |
|---|---|---|
| `tsconfig.base.json` | — | 共同选项：`strict`、`verbatimModuleSyntax`、`erasableSyntaxOnly`、允许 `.ts` 扩展名导入 |
| `tsconfig.core.json` | `src/core`、`src/original-data`、`src/content` | **不含 DOM 与 Node 类型**：这些纯模块一旦使用浏览器或 Node API，编译即失败 |
| `tsconfig.app.json` | `src/` 全部 | 浏览器应用（DOM、JSX、Vite 客户端类型） |
| `tsconfig.node.json` | `tools/**/*.ts`、Vite 配置、`src/**/*.test.ts` | Node 端 TypeScript；`eslint.config.js` 由 lint 覆盖，未启用 JS 类型检查 |
| `tsconfig.e2e.json` | `playwright.config.ts`、`e2e/**/*.ts` | 独立 Node runner 与浏览器 evaluate 的 DOM 类型，不扩大 Core/Node 环境 |

- `erasableSyntaxOnly` 禁止 `enum`、`namespace` 等需要转换的语法，使同一份代码既能被 Vite 打包，也能被 Node 直接运行。常量集合用 `as const` 对象代替 `enum`。
- 导入本项目模块时写出 `.ts`/`.tsx` 扩展名，Node 直接运行时需要。
- **TypeScript 固定为 6.0.x。** TypeScript 7 是原生实现，不再提供 typescript-eslint 依赖的 JavaScript API；typescript-eslint 支持 7 之后再升级。

## Lint 规则（`eslint.config.js`）

- **纯模块**（`src/core`、`src/original-data`、`src/content`）的非测试 `.ts`/`.tsx` 不得导入或 re-export React、React DOM、Zustand、Three.js、IndexedDB 封装库的包根/子路径，也不得导入 `app`、`render`、`ui`、`platform`、`workers` 的目录入口或子模块。
- **`src/core`** 不得使用 `Math.random`、`Date`、`performance.now`、定时器、`requestAnimationFrame`、`await` 或任何 `async` 函数形式。随机数来自 Core 自己的带种子生成器，时间来自 tick 计数（总计划 §5）。其他消费层仍允许宿主调度和异步。
- 类型导入必须写成 `import type`。
- 持久正/负回归在 [engineering-boundaries.test.ts](../../tools/engineering-boundaries.test.ts)，进入现有 `pnpm test`/`pnpm check`。TypeScript 样本在自有临时项目中使用仓库原配置和真实 include/exclude，ESLint 使用虚拟源与真实逻辑路径，不在生产目录留违规文件。负向必须命中目标诊断，正向须通过；空项目、ignored/parser 错误及误配预期均会失败。
- 覆盖限定为明确的静态导入、路径、宿主 API 和 async/await 语法；不承诺识别动态绕过、别名间接调用或不经 async/await 的 Promise 链。测试例外是 `.test.ts`，不扩展未来 `.test.tsx`/E2E 发现能力。
- 同一回归文件的 render layer 部分（P1-07 AC-01/04/17）用 TypeScript 解析应用程序中的生产源码（忽略注释与普通字符串）：只允许从 `three` 包根导入且只在 `render/`，无 `three/*`、React Three Fiber 或 WebGPURenderer；`render/` 生产代码不出现 rAF、`setAnimationLoop`、定时器或 `queueMicrotask` 等调度标识符。`render/` 中浏览器适配命名为 `browser-*.ts`，与 `.tsx` 一样只由应用程序检查；其余 DOM-free 渲染模块必须出现在真实 `tsconfig.node.json` 程序中（即被某个 `.test.ts` 传递导入），且该程序不得包含任何 `browser-*` 或 `.tsx`。它同样不识别动态拼接的绕过。

## 测试

- 单元测试与源码放在同一目录，命名为 `*.test.ts`，用 Vitest 在 Node 环境运行。
- **测试不得读取原版文件。** 原版格式的测试数据由 `src/original-data/synthetic.ts` 在代码中生成；用原版文件做的完整性检查放在 `tools/nob-check.ts`，只在本地运行。
- 驾驶舱字体目录的读取属于 `src/original-data/payloads.ts`，CLI 只负责调度与报告；合成样本覆盖目录顺序与空目录。
- Ghidra 编译器规范补丁另有标准库 `unittest` 测试：`python3 -B -m unittest discover -s tools/ghidra -p 'test_*.py'`，验证 XML 结构变换、备份与幂等性。
- 工程边界回归还启动隔离的预期失败 Vitest 进程，断言其命中真正的失败检查并非零退出；该失败是测试输入，正常测试命令仍须成功。临时项目复制实际配置、链接已安装依赖，结束由 finally 清理，不读取 `local/` 或真实 Ghidra。
- 快速只跑边界回归：`pnpm exec vitest run tools/engineering-boundaries.test.ts`。不要用测试数量代替覆盖证明；当前证据见 [P1-01 subtasks](../plan/p1/01/goal.md#子任务跟踪)。

### 本地浏览器 runner

[Playwright 配置](../../playwright.config.ts)使用已有兼容 Chrome（channel `chrome`），不自动下载浏览器。需要使用其他已安装 Chromium 时设置 `OSR_E2E_EXECUTABLE` 为其可执行文件。缺浏览器是明确失败，不 skip。运行需要普通 WebGL 2 和原生 headed 桌面能力；完整验收见 [P1-10 goal](../plan/p1/10/goal.md)，bootstrap 通过不代表后续生命周期/渲染验收通过。

- 项目为 development、production、development-headed；单 worker、零 retry、禁止 `.only`，前台/后台顺序运行。
- 自建开发/生产服务器默认为 `http://127.0.0.1:4173`、`http://127.0.0.1:4174`，strictPort 且不复用已有服务器。用 `OSR_E2E_DEV_PORT`/`OSR_E2E_PREVIEW_PORT` 指定不同的空闲端口；不关闭其他进程。
- 每个用例使用隔离 context，runner 收尾自有服务器与浏览器；报告、失败 trace/截图在 ignored 的 `playwright-report/`、`test-results/`，不进入网站或提交。
- 聚焦运行：`pnpm test:e2e bootstrap.spec.ts --project=development --project=production`。Vitest 仍只发现 src/tools 的 `.test.ts`，不发现 E2E `.spec.ts`；[配置回归](../../tools/e2e-configuration.test.ts)验证类型/lint发现、真实失败传播和占用端口隔离。
- 原生后台已固化在 [native-lifecycle](../../e2e/native-lifecycle.spec.ts)，可用 `pnpm test:e2e --project=development-headed` 独立运行：自管 headed 浏览器、CDP自建context/两tab、移除下文3项disable-background默认参数，取得真实hidden；不可用时保留原始原因并非零，不能合成事件或skip。受管page的hasFocus仍不是原生窗口证据。
- [WebGL降级](../../e2e/webgl-unavailable.spec.ts)用独立浏览器进程的disable-WebGL flags跑开发/生产；只有该场景允许当前Three.js具体创建失败诊断（逐项记录），其他异常/请求/控件错误仍失败。正常项目必须有实际WebGL2画面。
- 联合资源测试逐轮打印context扩展能力；缺可选`WEBGL_lose_context`的context以annotation明确“context-loss未验证”，不冒称lost。可用时逐个断言实际lost；完整必需测量及本机结果见[04证据](../plan/p1/10/subtasks/04-joint-resource-regression.md#完成证据)。
- 完整执行用`pnpm test:e2e`（当前build＋全部3项目）；失败不能靠重试变绿。正常用例采集pageerror/console/失败HTTP与请求以及UI错误，probe自检的受控异常与WebGL-off诊断只在各自场景逐项记录。自动覆盖、历史HMR/window/DPR/故障证据及其相关差异判断见[07证据](../plan/p1/10/subtasks/07-evidence-docs-alignment.md#完成证据)；源码/构建行为变化后只补失效项，不自动跑源码编辑。

## 合成 Runtime

- [synthetic-runtime.ts](../../src/app/runtime/synthetic-runtime.ts) 是 P1 合成运行入口，契约见 [P1-04 spec](../plan/p1/04/spec.md)。它不是原版玩法，也尚未接入页面或浏览器帧循环。
- 调用者向 `frame(nowMs)` 提供单调不减的毫秒时间戳；首帧只锚定。只在 Runtime 内推进 Core；时钟和 Event Bus 的内部发布入口不能交给消费者。
- `setInput` 保存连续轴，`submitCommand` 返回 Runtime commandId；它不同于 Core entityId。命令结果在整帧模拟结束后通知，持续事实从 `uiProjection`/`renderFrame` 读取。
- `on`/`onAny` 仅接收同步、返回 undefined 的回调。监听器抛错前的副作用不会回滚；帧末 `listener-failed` 不意味着 tick 未提交，不可重试已完成 tick。Core `faulted` 后禁止模拟和输入，读取与订阅清理仍可用；恢复会话属于 P1-05。
- 录制默认关闭；创建时传 `recording: {checkpointInterval}` 开启，`exportRecording()` 返回 P1-03 格式的冻结记录/结果，关闭时为 null。较大间隔仅减少检查点，不减少逐 tick 输入和事件；没有有界内存或自动持久化。
- 故障帧已经成功的 tick 和事件保留在录制中，但该帧通知不投递。因此故障导出仍可 replay 一致，却不是 Event Bus 投递日志。测试用真实合成 Core；故障测试只在 Vitest 创建边界注入 step 前异常，不向生产接口加入测试后门。
- owner 可在 frame/事件批次之外显式调用 `resetClock`（丢弃全部宿主时间进度）、`clearIntent`（清轴/队列并返回冻结 FIFO ID）、`foldRenderState`（previous=current、alpha=0）和 `clearSubscriptions`。faulted 也可收尾，但不解除故障；批次内调用抛 reentrant-call。它们不改 Core、RNG、ID 分配或录制；没有调用时裸 Runtime 行为不变。
- Runtime 与会话的针对性检查使用 `pnpm exec vitest run src/app/runtime src/app/session`；完整检查仍为 `pnpm check`。Core 回归可用 `pnpm exec vitest run src/core/determinism src/core/synthetic`。

## 会话端口与错误

- [session-host.ts](../../src/app/session/session-host.ts) 是 app 的 DOM-free 调度/生命周期端口。回调在请求返回非负安全整数句柄之后异步交付（0 合法）；注册失败由宿主回收未交给 owner 的部分资源。取消和所有通知均同步返回 undefined。
- [session-errors.ts](../../src/app/session/session-errors.ts) 定义会话参数、状态及执行失败，不替代 Runtime 错误。执行失败保存有序 runtime/scheduler/consumer/cleanup/control 原因，冻结副本与条目但不冻结原异常；onError 不接受 Promise。
- [browser-session-host.ts](../../src/platform/browser/browser-session-host.ts) 在 platform 提供真实 rAF 与 visibilitychange/pagehide/pageshow，无导入副作用或独立循环。每份订阅拥有三个监听，撤销逐项尝试且幂等，部分注册失败先回滚再抛错。只用 app 的 DOM 类型检查；不要导入当前 Node 测试程序或给 Core 加 DOM。
- [synthetic-session.ts](../../src/app/session/synthetic-session.ts) 的 `createSyntheticSession(options,host,onError)` 创建 idle controller，配置复制/验证后只订阅一次宿主。`control` 独立处理 start/pause/resume/restart/exit/dispose；唯一请求凭证按运行与请求身份隔离，0 句柄合法。SessionRun 没有 frame/step/world/publish；结束后读写/注册拒绝，faulted 最后状态仍可读。
- 暂停/隐藏时清瞬时意图、折叠呈现并停止循环；pagehide 独立阻断，返回可见不自动继续。显式 resume 首回调重新锚定，保留最新呈现，不补跑后台时长。`onFrame` 包含真实 projection/render/report，暂停静止通知 report=null。owner 必须 dispose 后再创建，不靠全局单例；当前不接生产页面或 React/HMR。
- rAF、同步控制及宿主通知各构成一个通知边界。域/帧消费者的控制、宿主通知与故障按 FIFO 在当前批次后处理；静止帧也不递归控制。状态通知允许为新运行接线，禁止控制；取消/错误/清理仅允许读取或取消订阅。新增订阅下一批生效，取消立即生效。
- `onCommandsCancelled` 的冻结 FIFO ID 及 reason 是会话反馈，不是 Core 拒绝或 replay 数据。转换通知按取消→暂停静止帧→适用收尾→状态→错误出口排序。`ownCleanup` 同步逆序收尾、至多尝试一次，release 即时移除/执行；释放后的 token 不再保有 owner/run/cleanup。release 失败只置 `cleanupFailed` 并同步抛错，不主动停止运行；后续 start/restart 均被阻断，exit/dispose 仍可执行。error 只保留最近错误，不是历史日志。
- 调用者自身同步操作失败直接抛出；同一同步边界内排队控制的失败单独在末尾交 onError，不合并或重报，排队 resume/start 的请求错误也保留其排队来源。异步边界汇总错误一次，剩余消费者/独立清理仍继续。Runtime listener-failed 提升为 consumer 故障，nowMs/read/request/cancel 为 scheduler；cancel 另置 cleanupFailed，实际迟到回调仍无效。Core faulted 为 runtime，资源/订阅释放为 cleanup。
- 故障保留最后成功 Core/recording 与折叠视图，停止调度并释放运行消费者/资源；无清理失败可 restart，清理失败只能结束并重建 owner。Runtime.frame 抛错不发成功形状帧。onError 抛错时也停止原本健康的循环，以 AggregateError 保留会话错、出口错及后续独立清理错，不重复调用出口。
- recording 使用 P1-03 原格式；wall-clock、runId、暂停/取消都不入记录。间隔 1/4 跨 pause/hidden/resume 的成功 tick 输入、事件与 checkpoint 用真实 replay/独立裸 Runtime 对照；故障前缀仍可导出，restart 记录从 tick 0 重建，旧冻结导出不变。Node 仅证明同版本同运行时一致，真实 Chromium 生命周期证据另见 P1-05 的 03/07。

### 浏览器生命周期复现

1. 端口空闲时启动自有 `pnpm dev --host 127.0.0.1 --port 5173 --strictPort`，在独立 Chromium profile/context 打开 `http://127.0.0.1:5173/`；没有正式游戏页面或 E2E runner，不改 App/main、不操作用户存储。
2. 在该 origin 的 DevTools 用动态 import 导入 `/src/app/session/synthetic-session.ts` 的 `createSyntheticSession` 和 `/src/platform/browser/browser-session-host.ts` 的 `createBrowserSessionHost`。以 `{scene:{seed:0,tickRateHz:50}}`、实际 host、必填同步错误出口创建 controller。用公共 onStatus/onFrame 与一个自有临时 `<pre>` 显示 phase/runId/tick/error，监听器返回 undefined；只读 projection/render，不写 Core。
3. 通过 `control({type:'start'})` 开始，正常 rAF 驱动 tick。pause 后跨实际 rAF 观察 tick 不变、静止 pair 相同/alpha=0；resume 首通知为 0 tick，pair 仍为最新 tick。restart 得到新 runId/tick0；exit→start 与 dispose→新 controller 分别观察请求/旧句柄隔离。
4. 切到另一实际标签页/窗口，再返回。记录实际 `document.visibilityState` 的变化、hidden 时与返回时的 status/tick；应为 hidden→visible、自动 paused/hidden、返回仍 paused 且 tick 不变，只有显式 resume 才继续。可以单独注册 visibilitychange 观察监听存入自有数组，以便返回后检查；记录时与 host 的三个监听分开计数。
5. 浏览器事件探针可派发 pagehide/pageshow 验证适配绑定/离页阻断，但这不是实际 hidden 或 BFCache 证据。工具若所有标签页持续 visible，该判据保持 blocked；不能覆盖 getter 或使用合成事件代替。
6. 正常 dispose 后 host 的 document visibilitychange、window pagehide/pageshow 各撤销一次，晚到旧回调不产生通知。移除自有探针/额外观察监听，关闭自有 context，停止自有服务器；不清站点全部数据。当前实测结果/工具限制见 [P1-05 浏览器证据](../plan/p1/05/subtasks/07-browser-lifecycle-evidence.md#完成证据)。

#### 已验证的 CDP 自动化路线

普通 Playwright 页面切换持续报告 visible 时，可使用已有工具的 Playwright/CDP 能力创建独立 context，而不是伪造 visibility。2026-10-02 已通过 VS Code 的 `runPlaywrightCode` 在外部 headed Chromium 154.0.8037.95 / macOS 验证该路线；VS Code 是执行入口，不是浏览器引擎或必需的唯一工具。普通页面路线失败的具体原因尚未确认。

1. 选择本机已有兼容 Chromium 二进制，以 `browserType().launch()` 启动自有浏览器；本轮使用 `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`，`headless:false`、`args:['--enable-automation']`，并用 `ignoreDefaultArgs` 移除 `--disable-backgrounding-occluded-windows`、`--disable-renderer-backgrounding`、`--disable-background-timer-throttling`。不下载浏览器或新增项目 runner。
2. 用 `browser.newBrowserCDPSession()`，通过 `Target.createBrowserContext` 取得自有 `browserContextId`；在此 context 用 `Target.createTarget` 创建探针页和另一标签页。不要用普通 `browser.newContext()` 页面未触发 hidden 的结果冒充该路线通过。
3. 用 `Target.attachToTarget({targetId,flatten:false})` 取得探针页 session，通过 `Target.sendMessageToTarget` 发送 `Runtime.evaluate`，按 sessionId/消息 ID 接收 `Target.receivedMessageFromTarget` 的结果；明确检查协议错误和 exceptionDetails。探针页先导航到固定 Vite origin，再导入前述公共模块和安装临时 DOM/只读观测，不能在 data URL 的能力预检上宣称 Runtime 已通过。
4. 用 `Target.activateTarget` 激活探针页，确认原生 visible 且 tick 前进；激活另一标签页，确认原生 hidden、自动 paused 与稳定 tick；再次激活探针页，确认 visible 后跨真实 rAF 仍 paused/tick 不变，再显式 resume 验证首帧重锚与后续推进。记录原生 visibilitychange 日志；不使用合成事件、visibility getter 替换或强制生命周期命令。
5. 先 dispose 会话、撤销自有探针和包装，再用 `Target.disposeBrowserContext` 关闭自有 context、关闭自有浏览器/入口页并停止自有 Vite。只清理本轮拥有的资源，不关闭用户 profile 或其他项目的浏览器/服务器。

2026-10-02 P1-06 浏览器验收补充的工具约束（同一机器与工具）：

- `runPlaywrightCode` 的各次调用之间不保留全局变量。在一次调用中 `launch()` 的浏览器，调用结束后会失去句柄。因此真实 hidden 场景要在同一次调用内完成启动、驱动和 `finally` 关闭；若句柄已丢失，按自建的临时 profile 核对进程后，按 PID 停止。
- 跨多次调用的非 hidden 检查，可在 shell 中以临时 `--user-data-dir` 和 `--remote-debugging-port` 启动自管 Chrome，每次调用用 `connectOverCDP` 重连。但在本环境中，这样启动的 Chrome 无论切换标签页还是最小化窗口，都始终报告 visible（`hasFocus()` 也始终为 true），原因未确认，不能用来取得 hidden 证据。
- Playwright 的 `waitForFunction` 与 locator 等待默认用 rAF 轮询，会计入包装 `requestAnimationFrame` 的探针。测量待交付帧请求时，应只在页面内基于定时器的窗口里读取，并先重置最大值。
- `context.addInitScript` 随本次连接注册；重新连接后若要重载页面并保留探针，需要在同一次连接中再次注册。
- 2026-10-02 P1-07 补充（Chrome 154.0.8037.95 / macOS，shell 启动的临时 profile + `connectOverCDP`）：只改变 `Emulation.setDeviceMetricsOverride` 的 `deviceScaleFactor`（CSS 宽高不变）后，`devicePixelRatio` 与 `matchMedia(...).matches` 会变，但 `MediaQueryList` 的 `change` 事件要等媒体查询重新求值才派发。每次改 DPR 后交替发送 `Emulation.setEmulatedMedia({media:'screen'})` 与 `{media:''}`（对普通页面同义）即可触发 Chrome 自己派发真实的 `change`；连续发送相同值不会再次求值。这不是合成事件或 getter 替换，但只证明仿真路径，真实多显示器 DPR 切换仍归 P5。

## UI 投影与指令反馈

P1-06 的合成 UI 层位于 `src/ui/game/`，契约见 [P1-06 spec](../plan/p1/06/spec.md)。它不创建会话、宿主、rAF 或定时器，只消费 Session 的公开通知。

- [synthetic-game-store.ts](../../src/ui/game/synthetic-game-store.ts) 是 Zustand vanilla store。React 只拿到只读 `reader`（getState/getInitialState/subscribe）；UI 模块内部通过单次 `commit(change)` 原子写入一次转换（状态、投影、pending 增减与结果、清空当前运行反馈），无变化时不通知。状态与数组冻结；Core 投影与事件本已深冻结，错误保持原引用。
- [synthetic-session-bridge.ts](../../src/ui/game/synthetic-session-bridge.ts) 按 owner 绑定一个控制器：
  - 状态通知即时写入。新的 running/paused 运行立即发布投影并重建采样基准；idle/disposed 清空投影与运行反馈；faulted 保留最后成功投影。
  - 常规投影在现有 onFrame 中按 10 Hz（100 ms）采样，以“运行 + tick”去重；暂停静止帧立即发布未发布的 tick；恢复后不补发历史快照。
  - 采样时钟由装配层注入（浏览器为 `performance.now`），必须是有限且不倒退的毫秒值；只在需要锚定基准或判断新 tick 是否到期时读取。读取失败或非法值在帧监听器中抛出，由 Session 记为 consumer 故障：
    - 附着发生在状态通知内时，失败延到下一帧报告，避免状态监听因抛错被 Session 移除。
    - 已暂停的运行（如隐藏时 start）附着时不读时钟，在恢复后的首帧锚定基准，因此失败不会被无限期延迟。
    - 立即发布结果时时钟失败，已收到的结果与最新投影先写入，再抛出。
  - 附着是事务性的：运行监听全部注册成功后才写入 running/paused。运行级 consumer 每完成一项注册就用 `binding.own` 交出撤销函数；任一注册失败时，桥接逆序撤销已交出的注册，并在重新订阅状态后再抛出，以便继续观察随之而来的故障。撤销本身也失败时抛 `RollbackError`（P1-08，见下文“页面流转与演示生命周期”），绑定回滚失败同样如此。
  - 一个桥接实例只服务一个会话；成功绑定后 unbind 即终止，只有首次绑定失败可以重试。`onError` 只写 sessionError，必须作为创建 Session 时的错误出口传入；新运行开始且会话 error 为空时清空 sessionError。
- [synthetic-command-feedback.ts](../../src/ui/game/synthetic-command-feedback.ts) 是桥接的运行级 consumer：`submit(type)` 经当前运行提交已有 marker 命令，只有拿到 Runtime commandId 后才记为 pending，投影不提前改变。结果只来自 Core 的域事件：按 `delivery.commandId`（不是 commandIndex 或 entityId）匹配当前运行的 pending，生成 accepted/rejected，并与帧末最新投影同次写入，不等采样窗。其他消费者的命令和重复投递不会生成本面板结果；同步失败写入 actionError 并保留原 cause，暂停或已结束运行的错误来自 Session 本身。提交经 `SyntheticRunBinding.submitCommand` 转发：桥接回滚或 unbind 后该 binding 被注销，不再触及仍在运行的会话。成功提交时，清除旧 actionError 与新增 pending 在同一次写入中完成。
  - Session 的取消通知把匹配的 pending 记为 cancelled 并保留原 reason（user-pause/hidden/restart/exit/dispose/failure），不是 Core 拒绝。运行故障时，仍未终结的 pending 与 faulted 状态在同一次写入中标为 unconfirmed/session-failed：这些命令可能已在被丢弃事件的 tick 中执行，因此既不显示成功，也不自动重提。真实 Runtime 中，同一帧首个 tick 失败只会产生取消（命令尚未消耗），后续 tick 失败只会产生 unconfirmed。
- [synthetic-game-controls.ts](../../src/ui/game/synthetic-game-controls.ts) 的 `syntheticControlAvailability(status)` 按 spec“控件可用性”从状态纯函数推导可用性。结果以面板动作 ID（start/pause/resume/restart/exit/add-marker/remove-marker）为键，同一状态组合返回同一个冻结对象，便于 React selector 按引用比较。`createSyntheticGameControls(store, session).control(type)` 先清空 actionError 再调用 Session 控制，同步失败时写入。Session 仍是唯一判定者，UI 不放宽其判断；cleanupFailed 在 error 被替换后仍禁用 start/restart。
- [synthetic-keyboard-input.ts](../../src/ui/game/synthetic-keyboard-input.ts)（P1-09）提供已接入 owner/页面的 DOM-free 五键消费者，当前绑定及规则见独立[键位文档](./keyboard-input.md)。桥接绑定后调用 `createSyntheticKeyboardInput({store, session, bridge, feedback, controls}, {source})`，也可传 `{unavailable: cause}`。`session` 必须与桥接绑定的是同一控制器；反馈和 controls 复用该 owner 的实例。返回 `{reader, dispose}`：`reader.getSnapshot()/subscribe()` 只读、句柄与快照冻结，active/inactive 只随输入源资格变化，unavailable 保存原始 error，不随 tick 或暂停刷新。释放后读到 inactive，不再通知或接受旧回调。
  - 方向轴只从合法输入回调经 `SyntheticRunBinding.setInput` 转发；与 submitCommand 相同，retired/unbind 时先拒绝，当前运行身份、phase 与通知模式由 Session 校验。每个动作读取实时 Session 状态，不用 store 的旧缓存；命令走现有反馈，P 走现有可用性与 controls。
  - Session 状态订阅仅清本地按住表（所有暂停、结束和运行替换），不提交输入、命令或控制。start/resume 不补发；repeat 不能重建已清状态。源失焦/hidden/pagehide 在仍合法 running 时立即发送变化后的零轴，其余状态依赖 Session 清意图。setInput 同步失败写 actionError=input 并保留 cause；成功的实际轴变更只清旧 input 错误，忽略/no-op 不清错，也不覆盖独立错误。
  - 创建时先取得状态订阅再连接 source；connect 的同步初始信号只更新资格，不接受同步按键或提交输入。普通登记失败（包括回滚成功的 AggregateError）降为 unavailable；`RollbackError`（包括传入的 unavailable 原因）保持初始化失败，撤销已取得的订阅；若消费层回滚也失败，以新的 RollbackError 保留全部原因。dispose 先失效并清本地状态，再逐项释放 source、取消状态订阅，继续独立清理，以 AggregateError 报告全部失败；  owner 已先调用它再销毁 Session，并把失败纳入清理锁存。
- 测试用 [synthetic-ui.test-support.ts](../../src/ui/game/synthetic-ui.test-support.ts) 组合真实 Session、`ControlledHost`、可控时钟，以及记录监听器的会话包装，用来重放旧运行通知。
- [synthetic-demo-owner.ts](../../src/app/composition/synthetic-demo-owner.ts) 是 DOM-free 的应用装配 owner：`createSyntheticDemoOwner(host, clock, render, input)` 依次创建 store、反馈、渲染器（P1-07）、桥接、会话（种子0、Core默认频率，均为合成值）与键盘消费者，不自动 start、无全局单例。input 为 `{source}` 或 `{unavailable: cause}`；兼容未传入时显式报告未连接的 unavailable。对外只读 `store`、`renderer`、`keyboard`（getSnapshot/subscribe），以及 `dispatch(action)`、`dispose()`、`cleanupFailure()`。渲染器仍是桥接第二个运行级consumer，键盘源属于owner而非run。
  - `dispatch` 使用 controls 模块的 `createSyntheticPanelDispatcher`：marker 命令交给命令反馈，其余交给会话控制，动作分类留在 UI 层。
  - 传入的渲染表面在会话创建前即归 owner 所有；表面连接失败且释放成功时改为 unavailable，演示照常运行。表面释放也失败（渲染器抛 `RollbackError`，或表面工厂交来的 `unavailable` 本身是 `RollbackError`）时按初始化失败处理，不创建会话。  会话、桥接或键盘初始化失败时，依次尝试释放已连接输入、销毁已创建会话、解绑桥接与释放渲染器（含表面），store原子重置为status=null，actionError为initialize。回滚失败保持RollbackError及全部独立原因；普通输入登记失败且回滚成功仅键盘unavailable，演示继续可用。
  - `dispose` 先失效/释放键盘，再销毁会话、解绑桥接、释放渲染器，每项清理都会尝试；失败时把同一个 AggregateError 写入 actionError（cleanup）并抛出。重复调用无效果，dispose 或初始化失败后的 dispatch 被忽略。
  - `cleanupFailure()` 返回首个包含清理失败的错误记录 `{cause}`，外壳冻结、此后不再替换或清除，dispose 后仍可读。以下情况会设置记录：
    - 初始化回滚失败（`RollbackError`）。
    - 会话状态首次报告 `cleanupFailed`，或会话错误的失败项中出现 `RollbackError`（运行消费者自有撤销失败）。
    - `dispose` 失败：dispose 先停止 owner 的状态订阅，因此记录的就是抛出的错误。

    Core/调度故障、渲染 failed/unavailable，以及回滚成功的业务 AggregateError 都不设置。
  - 持有方必须先 dispose 旧 owner 再创建新 owner；应用中由下文的演示生命周期保证。
- React 接线：[use-synthetic-demo-owner.ts](../../src/app/composition/use-synthetic-demo-owner.ts) 的 `useSyntheticDemoOwner(lifecycle)` 返回 `{owner, containerRef}`。
  - 容器回调 ref 把元素本身存入 state，作为 effect 依赖：容器为空时不建 owner；画面子树重挂载或换了容器元素时，effect 关闭旧 visit 再打开新 visit。
  - 每次 effect 打开一个visit：先创建 `createBrowserKeyboardSource(container)`（此时未登记监听），再创建WebGL表面，与browser Session host及performance.now交给owner，最后start一次。owner负责所有获取/回滚/释放；hook不单独释放表面或输入源。源在Session与bridge成功后才connect，先前初始化失败不会漏掉输入监听；源登记回滚失败则连同已取得的表面完整收尾，不启动。
  - 卸载、StrictMode 重跑或 Fast Refresh 时，cleanup 先发布 null 再关闭 visit。清理失败锁存后不再创建表面或 owner。
  - 渲染状态监听错误与 dispose 抛出的错误经 `reportError` 报告。[use-synthetic-game.ts](../../src/ui/game/use-synthetic-game.ts) 用 Zustand 的 `useStore(reader, selector)` 订阅单个标量或稳定切片。[SyntheticDevPanel.tsx](../../src/ui/dev/SyntheticDevPanel.tsx) 只接收只读 `store`、`dispatch` 与只读渲染器，按区块分别订阅，使用原生按钮且不注册全局键盘监听；渲染诊断区只在挂载、点击刷新或渲染器更换时读取一次快照。[SyntheticRenderView.tsx](../../src/ui/render/SyntheticRenderView.tsx)（P1-07）提供画面容器（内容盒宽 100%、高 `clamp(240px, 70vh, 720px)`、相对定位、裁剪、黑底；React 不向其中渲染子节点，画布由 WebGL 表面管理）、合成标注，以及用 `useSyncExternalStore` 只在渲染状态转换时更新的状态文字（ready/context-lost 为 status，unavailable/failed 为 alert）。开发面板标题为 h3 `Development panel`、各区块为 h4，画面标题为 h3，以便演示画面的 h2 唯一。它们只在 P1-08 的合成演示画面中出现（开发与生产构建相同），见下文。

## 键盘源与输入区

[keyboard-input.ts](../../src/platform/input/keyboard-input.ts)定义冻结事件/信号/端口和纯按住轴；[keyboard-source.ts](../../src/platform/input/keyboard-source.ts)实现实际生产资格与监听管理，最小DOM-free Host驱动故障测试；[browser-keyboard-source.ts](../../src/platform/input/browser-keyboard-source.ts)只连接DOM，不被Node测试导入。容器拥有keydown/keyup/focusin/focusout，window只有focus/blur/pagehide/pageshow，document只有visibilitychange。释放先逻辑失效，再逐项撤销，撤销失败保留原因，不能声称物理清理成功。

[SyntheticRenderView](../../src/ui/render/SyntheticRenderView.tsx)的现有容器可Tab聚焦，点击canvas或黑边也聚焦，有名称、aria-describedby绑定说明和可见焦点；useSyncExternalStore只订阅键盘状态转换，不按tick刷新。进入演示仍聚焦标题，原生按钮和Tab不受干扰。规则与支持范围只在独立[键位文档](./keyboard-input.md)维护；目标检查为 `pnpm exec vitest run src/platform/input src/ui/game src/app/composition`，完整工程检查仍为 `pnpm check`。实际开发/生产、原生hidden、窗口focus与新owner HMR证据见 [P1-09/05](../plan/p1/09/subtasks/05-browser-input-evidence.md#完成证据)。

## 合成渲染

P1-07 的合成画面位于 `src/render/`，契约见 [P1-07 spec](../plan/p1/07/spec.md)。它是渲染消费者，不是第二条游戏循环；几何、颜色、相机与像素比上限都是合成演示值，不代表原版画面。

- 依赖：`three`（dependencies）与 `@types/three`（devDependencies）同为 0.186 次版本，只从包根导入、只构造 `WebGLRenderer`（WebGL 2，不回退）；不用 React Three Fiber、addons、WebGPU、Worker 或 OffscreenCanvas。生产构建主块因此约 798 kB（gzip 约 216 kB），Vite 的 500 kB 块体积警告按 spec 只记录，包体优化归 P5。
- DOM-free 模块由 Node 测试覆盖：[viewport-layout.ts](../../src/render/viewport/viewport-layout.ts)（固定 4:3、等比居中、DPR 上限 2 与设备尺寸上限 M）、[synthetic-render-frame.ts](../../src/render/synthetic/synthetic-render-frame.ts)（整帧校验与位置插值，每个运行一份历史）、[synthetic-camera.ts](../../src/render/synthetic/synthetic-camera.ts)、[synthetic-appearance.ts](../../src/render/synthetic/synthetic-appearance.ts)、[render-surface.ts](../../src/render/scene/render-surface.ts)（绘制端口）、[synthetic-renderer.ts](../../src/render/synthetic/synthetic-renderer.ts) 与 [webgl-surface.ts](../../src/render/webgl/webgl-surface.ts)。浏览器专用的 [browser-webgl-surface.ts](../../src/render/webgl/browser-webgl-surface.ts) 只创建画布、`WebGLRenderer`、`ResizeObserver` 与 resolution 媒体查询。边界回归要求非 `browser-*` 的渲染模块位于 Node 类型程序中（见上文 Lint 规则）。
- 绘制只发生在：表面首次得到有效布局、接线（读 `run.renderFrame()`）、绑定运行的每次 `SessionFrame`（含暂停静止帧）、运行结束（空帧）、布局变化（相同布局不重绘）与上下文恢复。渲染代码不调用 rAF、`setAnimationLoop`、定时器或微任务；暂停时只有后三类事件会重绘。
- 每帧先完整校验（alpha、tick、ID 顺序、kind、坐标、两份状态与运行历史一致、tick 不倒退）再原子更新场景；表面绘制失败时把场景退回上一份成功画面。任何映射或绘制错误使渲染器进入终止的 failed，帧监听与运行收尾从不向 Session 抛错；状态监听抛错经 `reportError` 报告，报告本身失败时丢弃，以保持会话健康。恢复方式（P1-08）：返回菜单后重新进入，会重建会话与渲染器并丢弃本次合成状态；会话不自动暂停，只有释放成功才允许重新进入。
- 初始化回滚失败用 [rollback-error.ts](../../src/app/session/rollback-error.ts) 的 `RollbackError`（`AggregateError` 子类，`cause` 为原始失败，`errors` 依次为原始失败与回滚失败）表示。以下几处在回滚失败时抛出它：`createSyntheticRenderer` 的连接回滚、渲染器 `attach()` 的本地回滚、`createBrowserWebGLSurface` 转交前的回滚。回滚成功时原样抛出原始原因，因此不必按消息或 AggregateError 类型猜测是否释放失败。
- 状态为 ready/context-lost/failed/unavailable/disposed，只在转换时通知；开始释放后不再通知。诊断快照（state、runId、drawnTick、draws、entities、当前 `renderer.info` 的 GPU 三项、layout）只按需读取。
- 释放顺序：撤销上下文监听、DPR 查询与尺寸观察 → 每种 kind 的共享几何与材质各释放一次 → `WebGLRenderer.dispose()` → 若有 `WEBGL_lose_context` 则强制丢弃（缺失只是能力限制）→ 移除画布；每步都尝试，失败汇总为 AggregateError。owner 释放顺序为输入 → 会话 → 桥接 → 渲染器。
- 测试替身 [render-surface.test-support.ts](../../src/render/scene/render-surface.test-support.ts) 记录每次绘制的对象、位置与相机，并按绘制/释放模拟 GPU 统计；它不进入生产导入链。目标回归：`pnpm exec vitest run src/render src/app/composition src/ui/game src/app/session src/app/runtime src/core/synthetic`。[synthetic-renderer-replay.test.ts](../../src/render/synthetic/synthetic-renderer-replay.test.ts) 证明不接、绘制中、failed、context-lost 与无布局时 Core 事件、录制与状态哈希一致。
- 浏览器取证：截图保持 `preserveDrawingBuffer:false`，用元素截图的 Buffer 在页面内 `createImageBitmap` 解码采样；DPR 变化用上文“已验证的 CDP 自动化路线”中的仿真加媒体重新求值；WebGL 不可用用 `--disable-webgl --disable-webgl2 --disable-3d-apis` 启动的隔离 Chrome；上下文丢失用页面画布的 `WEBGL_lose_context`。

## 页面流转与演示生命周期

P1-08 的 React 菜单原型，契约见 [P1-08 spec](../plan/p1/08/spec.md)。它是现代网页界面，不是原版菜单，也不提供任何原版玩法入口或导入能力。

- [app-flow.ts](../../src/app/flow/app-flow.ts) 是 DOM-free 的页面流转，由邻接 Node 测试覆盖。
  - 冻结快照为 `{screen:'menu'|'import'|'demo', demoVisit, focusTarget, cleanupFailure}`。
  - 输入为 open-demo、open-import、return-to-menu 与 `{demo-release-failed, cause}`。不适用的输入原样返回同一对象；`demoVisit` 耗尽时抛 `RangeError`。
  - 页面状态只在内存中，不用路由或 history；刷新后回到主菜单。
- [synthetic-demo-lifecycle.ts](../../src/app/composition/synthetic-demo-lifecycle.ts) 是每个应用实例一个的演示槽位，持有同步锁存，由真实 owner/Session 的 Node 测试覆盖。
  - `visit()` 表示一次进入意图。`open(create)` 先关闭仍持有 owner 的其他 visit；锁存时不调用工厂；否则创建 owner，交付其初始化回滚记录，未锁存时只派发一次 start。同一 visit 不会再次 start，失败的 start 也不重试。
  - `close()` 幂等，释放 owner、交付其清理失败记录，再报告 dispose 抛出的错误。`release()` 供“返回菜单”在切换画面前同步释放。
  - 失败经 `onCleanupFailure` 交给页面流转。该出口抛错时改经 `reportError` 报告；`reportError` 自身抛错被丢弃。无论出口是否失败，锁存都已生效。
- [App](../../src/app/App.tsx) 是应用外壳，持有页面流转状态与生命周期，只渲染当前画面；演示画面以 `demoVisit` 为 key，由外壳内的 `DemoScreen` 调用上述 hook。锁存后在所有画面显示含原始原因的 alert，并提示刷新页面；主菜单原生禁用 `Start synthetic demo`，导入入口照常可用。进入演示前，外壳先用当前状态同步校验转换：`demoVisit` 耗尽时以 alert 显示 `RangeError` 并停留在主菜单，不创建 owner；实际提交仍走函数式更新，双击时每次激活至多一次转换。
- [ui/pages/](../../src/ui/pages/) 是三个只用原生按钮的画面，不在 window/document 注册键盘监听。
  - 画面标题为 h2，`tabIndex=-1`：进入画面时聚焦标题；返回菜单时按 `focusTarget` 聚焦打开该画面的入口，锁存时聚焦菜单标题；首次加载不移动焦点。
  - 演示画面中，`Return to menu` 是标题之后的第一个控件。
  - 导入占位只有说明与 `Return to menu`，不放文件输入或拖放区，不读写存储或发请求。
  - 样式在 [app.css](../../src/app/app.css)：响应式、按钮 `:focus-visible` 有可见 outline。
- 验证分层：页面流转、owner 记录与生命周期接线用 Node 测试。React 画面、焦点、键盘与往返释放用上文“已验证的 CDP 自动化路线”在开发服务器与 `vite preview` 中取证。稀有失败（failed、faulted、锁存）的 React 文案与焦点接线以 Node 测试加代码审阅为证，不伪造浏览器复现。不引入 jsdom、React Testing Library 或 Playwright 依赖。
