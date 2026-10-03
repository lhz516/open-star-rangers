---
type: guide
status: active
phase: P1
updated: 2026-10-02
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
| `pnpm build` | 生产构建，输出到 `dist/` |
| `pnpm typecheck` | 分别用三个 tsconfig 做类型检查（见下） |
| `pnpm lint` | ESLint，包含模块边界与确定性规则 |
| `pnpm test` | Vitest 单元测试 |
| `pnpm check` | 依次运行以上四项检查，提交前使用 |

`tools/` 中的研究脚本直接用 `node tools/<脚本>.ts` 运行，见 [tools](../guides/tools.md)。

## TypeScript 配置

| 文件 | 范围 | 作用 |
|---|---|---|
| `tsconfig.base.json` | — | 共同选项：`strict`、`verbatimModuleSyntax`、`erasableSyntaxOnly`、允许 `.ts` 扩展名导入 |
| `tsconfig.core.json` | `src/core`、`src/original-data`、`src/content` | **不含 DOM 与 Node 类型**：这些纯模块一旦使用浏览器或 Node API，编译即失败 |
| `tsconfig.app.json` | `src/` 全部 | 浏览器应用（DOM、JSX、Vite 客户端类型） |
| `tsconfig.node.json` | `tools/**/*.ts`、Vite 配置、`src/**/*.test.ts` | Node 端 TypeScript；`eslint.config.js` 由 lint 覆盖，未启用 JS 类型检查 |

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
  - 附着是事务性的：运行监听全部注册成功后才写入 running/paused。运行级 consumer 每完成一项注册就用 `binding.own` 交出撤销函数；任一注册失败时，桥接逆序撤销已交出的注册，并在重新订阅状态后再抛出，以便继续观察随之而来的故障。
  - 一个桥接实例只服务一个会话；成功绑定后 unbind 即终止，只有首次绑定失败可以重试。`onError` 只写 sessionError，必须作为创建 Session 时的错误出口传入；新运行开始且会话 error 为空时清空 sessionError。
- [synthetic-command-feedback.ts](../../src/ui/game/synthetic-command-feedback.ts) 是桥接的运行级 consumer：`submit(type)` 经当前运行提交已有 marker 命令，只有拿到 Runtime commandId 后才记为 pending，投影不提前改变。结果只来自 Core 的域事件：按 `delivery.commandId`（不是 commandIndex 或 entityId）匹配当前运行的 pending，生成 accepted/rejected，并与帧末最新投影同次写入，不等采样窗。其他消费者的命令和重复投递不会生成本面板结果；同步失败写入 actionError 并保留原 cause，暂停或已结束运行的错误来自 Session 本身。提交经 `SyntheticRunBinding.submitCommand` 转发：桥接回滚或 unbind 后该 binding 被注销，不再触及仍在运行的会话。成功提交时，清除旧 actionError 与新增 pending 在同一次写入中完成。
  - Session 的取消通知把匹配的 pending 记为 cancelled 并保留原 reason（user-pause/hidden/restart/exit/dispose/failure），不是 Core 拒绝。运行故障时，仍未终结的 pending 与 faulted 状态在同一次写入中标为 unconfirmed/session-failed：这些命令可能已在被丢弃事件的 tick 中执行，因此既不显示成功，也不自动重提。真实 Runtime 中，同一帧首个 tick 失败只会产生取消（命令尚未消耗），后续 tick 失败只会产生 unconfirmed。
- [synthetic-game-controls.ts](../../src/ui/game/synthetic-game-controls.ts) 的 `syntheticControlAvailability(status)` 按 spec“控件可用性”从状态纯函数推导可用性。结果以面板动作 ID（start/pause/resume/restart/exit/add-marker/remove-marker）为键，同一状态组合返回同一个冻结对象，便于 React selector 按引用比较。`createSyntheticGameControls(store, session).control(type)` 先清空 actionError 再调用 Session 控制，同步失败时写入。Session 仍是唯一判定者，UI 不放宽其判断；cleanupFailed 在 error 被替换后仍禁用 start/restart。
- 测试用 [synthetic-ui.test-support.ts](../../src/ui/game/synthetic-ui.test-support.ts) 组合真实 Session、`ControlledHost`、可控时钟，以及记录监听器的会话包装，用来重放旧运行通知。
- [synthetic-demo-owner.ts](../../src/app/composition/synthetic-demo-owner.ts) 是 DOM-free 的应用装配 owner：`createSyntheticDemoOwner(host, clock)` 依次创建 store、反馈、桥接与会话（种子 0、Core 默认 tick 频率，均为合成值），不自动 start，也不登记全局单例。它只向外暴露只读 `store`、`dispatch(action)` 与 `dispose()`。
  - `dispatch` 使用 controls 模块的 `createSyntheticPanelDispatcher`：marker 命令交给命令反馈，其余交给会话控制，动作分类留在 UI 层。
  - 会话创建或绑定失败时，依次尝试销毁已创建的会话与解绑桥接，store 原子重置为 status=null，actionError 为 initialize（多个失败时为 AggregateError）。
  - `dispose` 先销毁会话再解绑桥接，每项清理都会尝试；失败时把同一个 AggregateError 写入 actionError（cleanup）并抛出。重复调用无效果，dispose 或初始化失败后的 dispatch 被忽略。
  - 持有方（React effect）必须先 dispose 旧 owner 再创建新 owner。
- React 接线：[use-synthetic-demo-owner.ts](../../src/app/composition/use-synthetic-demo-owner.ts) 在 effect 中用 `createBrowserSessionHost()` 与 `performance.now` 创建 owner，并在卸载、StrictMode 重跑或 Fast Refresh 时先 dispose 再创建新 owner；清理失败经 `reportError` 报告。[use-synthetic-game.ts](../../src/ui/game/use-synthetic-game.ts) 用 Zustand 的 `useStore(reader, selector)` 订阅单个标量或稳定切片。[SyntheticDevPanel.tsx](../../src/ui/dev/SyntheticDevPanel.tsx) 只接收只读 `store` 与 `dispatch`，按区块分别订阅，使用原生按钮且不注册全局键盘监听。[App](../../src/app/App.tsx) 在开发与生产构建中都显示该面板，不自动 start。
