---
type: plan
status: accepted
phase: P1
task: "05"
updated: 2026-10-02
related: [ADR-0006, ADR-0012]
reviewed: sha256:292f3e8533a4
---

# P1-05：会话与浏览器生命周期 — Spec

## 问题与目标

P1-04 已交付宿主无关的合成 Runtime，但调用者仍须手动推进 `frame(nowMs)`。现有 Runtime 没有暂停/继续/退出通道、时间基准重置、待执行命令取消、会话资源释放或浏览器生命周期适配，不能安全地交给后续 UI、渲染和键盘消费者长期使用。

本任务建立一层**合成会话控制器**：独占当前 Runtime 和唯一浏览器帧循环，通过独立的控制通道开始、暂停、继续、重启、退出和销毁；隐藏页面时停止模拟并清除瞬时意图；旧实例、旧帧回调和旧输入句柄不能影响新运行。错误与清理失败必须可观察。

范围依据[总计划 §4–5](../../master-plan.md#4-总体架构)、[§8](../../master-plan.md#8-浏览器运行存档与隐私)和[阶段索引](../tasks.md#p1-05-会话与浏览器生命周期)。直接前提是 [P1-04 最终证据](../04/subtasks/06-final-alignment.md#完成证据)。全部验收通过后，本任务最终对齐勾选 [STATUS 运行骨架](../../../STATUS.md#运行骨架)中的“GameRuntime”项，并链接 P1-04 与本任务证据（技术决定 13）。“重启、暂停、返回菜单不产生重复游戏循环（含 React StrictMode 与热更新）”是联合项，需要 P1-06 至 P1-10 的真实消费者、StrictMode/HMR 证据，不能由本任务勾选。

本任务不新增原版玩法事实；所有状态、移动和标记仍是自建合成行为。

## 范围

### 包含

- **S-01 会话与运行身份：** 一个控制器同时最多拥有一个 Runtime；每次开始/重启取得新的 `runId` 和运行句柄。创建不自动开始，配置取值与调用者隔离。
- **S-02 独立控制通道：** `start`、`pause`、`resume`、`restart`、`exit`、`dispose` 不进入 Core 命令队列；暂停没有帧循环时仍立即可处理。
- **S-03 唯一调度与时钟恢复：** 浏览器 rAF 经平台端口驱动现有固定步长，运行时最多一个待执行帧请求。继续时重新锚定，完全丢弃暂停/后台时长和不足一个 tick 的余量。
- **S-04 页面生命周期：** 适配真实 visibilitychange、pagehide、pageshow；隐藏/离开页面自动暂停，恢复可见不自动继续。重复通知和已取消但仍到达的回调不会再推进。
- **S-05 输入、命令与通知边界：** 暂停清零轴、取消未执行命令并明确通知；暂停时拒绝新的游戏输入/命令。帧内产生的生命周期控制在当前模拟与事件批次结束后生效，不能把世界重置在分发中途。
- **S-06 消费者与资源所有权：** 提供当前 projection/Render State、唯一循环的帧通知、状态通知和运行级同步清理注册。重启/退出/销毁释放旧运行订阅和资源；销毁还移除控制器的浏览器监听与状态订阅。
- **S-07 失败与恢复：** rAF、Runtime、消费者或清理失败后停止失效运行，不静默开启另一条循环；异步失败进入明确错误出口。保留可检查的最后成功状态/录制，允许安全的退出或重启，清理失败另有阻断规则。
- **S-08 验证与交接：** 用真实合成 Core、受控调度端口、合成消费者以及实际 Chromium 浏览器分别验证；相关工程/使用文档同步更新，P1-04 既有行为与检查保留。

### 不包含

- 不实现菜单、暂停面板、React/Zustand 桥接、Three.js/GPU、音频/视频或键盘监听。仅注册合成资源证明生命周期契约；真实消费者由 P1-06/07/09 接入，菜单由 P1-08 装配。
- 不修改 App/main 以提前装配游戏，不创建正式开发演示页面；浏览器验收用隔离的临时合成探针，不把页面占位壳或 Canvas 存在当证据。
- 不完成实际 React StrictMode 双挂载、Vite HMR 和联合 UI/渲染回归；本任务验证其必需的“创建→清理→再创建”基础，真实接线后的验证归 P1-10。
- 不实现 Keyboard Lock、Pointer Lock、快捷键拦截、重映射、手柄或鼠标飞行；窗口 blur/原始键状态清理归 P1-09。隐藏页面的 Runtime 输入清理在本任务范围内。
- 不引入资源加载器、异步初始化/清理框架、插件系统或通用游戏引擎。未来异步消费者须另行设计自己的取消与错误处理，不增加音视频/Worker 空实现。
- 不实现玩家存档、IndexedDB/localStorage、录制管理界面、自动保存或刷新后恢复；不改变 P1-03 记录格式、P1-02 世界规则或 P1-04 正常帧语义。
- 无发布级浏览器/设备矩阵、真实性能阈值、实际 BFCache 命中率保证、原版对照、CI/部署或云操作，遵循 [ADR-0012](../../../decisions/ADR-0012-local-p1-defer-ci-deployment.md)。

### 涉及模块

| 模块 | 责任与影响 |
|---|---|
| 计划新增 `src/app/synthetic-session.ts` 及同目录测试 | 控制器、运行身份、控制通道、消费者边界与资源释放；目前不存在 |
| 计划新增 `src/app/session-host.ts`、`src/app/session-errors.ts` | DOM-free 宿主端口和会话错误契约；目前不存在，具体拆分由 goal 核实 |
| 计划新增 `src/platform/browser-session-host.ts` | rAF/可见性/页面事件适配；platform 目录目前不存在，不是把浏览器逻辑放入 Core |
| [synthetic-runtime.ts](../../../../src/app/synthetic-runtime.ts)、[fixed-step-clock.ts](../../../../src/app/fixed-step-clock.ts)、[synthetic-event-bus.ts](../../../../src/app/synthetic-event-bus.ts)（已有） | 增加会话内部所需的最小重置/清理操作；不改变没有调用这些操作时的 P1-04 行为 |
| [Core 场景](../../../../src/core/synthetic-scene.ts)、[replay](../../../../src/core/synthetic-replay.ts)（已有） | 只读复用输入、事件、projection、录制与重放，不增加生命周期字段 |
| [App](../../../../src/app/App.tsx)、[main](../../../../src/main.tsx)（已有） | 不接线，不更改生产页面 |

## 当前实现与依据

- [SyntheticRuntime](../../../../src/app/synthetic-runtime.ts) 已提供 `frame`、`submitCommand`、`setInput`、`on/onAny`、`renderFrame`、`uiProjection`、`exportRecording`。内部私有持有场景、时钟、命令队列和总线；消费者没有 Core step 或发布事件入口。
- [FixedStepClock](../../../../src/app/fixed-step-clock.ts) 只允许时间单调不减，没有 reset；继续运行若直接传新宿主时间，会把间隔当成长帧。因此本任务须提供保持世界不变的时钟重新锚定能力，不能靠 5 tick 上限假装“没有后台补跑”。
- [SyntheticEventBus](../../../../src/app/synthetic-event-bus.ts) 有幂等取消、帧内增删订阅和同步错误汇总，但没有清空全部订阅的生命周期入口。[GameRuntimeError](../../../../src/app/runtime-errors.ts) 的四种 kind 不表达会话失效状态或资源清理批次，保持其既有语义，新增会话边界错误。
- [P1-04 spec](../04/spec.md) 明确把浏览器调度、暂停/继续、清键与恢复交给本任务；其正常帧、commandId、帧末事件及故障成功前缀仍有效。会话控制器不是第二个模拟器。
- [事件测试](../../../../src/app/synthetic-runtime-events.test.ts)已有监听器产生后续命令、同步失败不回滚和重入证据；[故障测试](../../../../src/app/synthetic-runtime-fault.test.ts)已有 step 前注入及可 replay 的成功前缀，复用这类方法而非提供可编辑世界的测试入口。
- [ADR-0006](../../../decisions/ADR-0006-core-returns-events.md)冻结 Core 返回事件/Runtime 分发；[总计划 §5](../../master-plan.md#5-状态管理与通信约定)冻结控制与游戏命令分离；[§8](../../master-plan.md#8-浏览器运行存档与隐私)要求后台自动暂停、清瞬时输入与校准时钟。回前台是否自动继续、暂停是否持续渲染尚未规定，本草案在技术决定中选择。
- [工程约定](../../../engineering/README.md)与[package.json](../../../../package.json)已有 Node Vitest 和 `pnpm check`。目前没有 Playwright 项目依赖/脚本、DOM 测试 runner 或平台适配器；不能把计划新增的浏览器验证说成已可通过 `pnpm test:e2e` 运行。

## 行为与边界

### 控制器、运行和状态

- `createSyntheticSession(runtimeOptions, host, onError)` 返回控制器。Runtime 配置沿用 `SyntheticRuntimeOptions`，创建时校验并保有值副本，包括生效频率与可选录制；非法配置在建立宿主监听之前失败，不分配运行或 rAF。不得把配置校验用的临时世界变成另一条活跃模拟。
- `host` 是显式端口，`onError` 为必填同步函数；函数缺失或非法配置抛 `GameSessionError`，`kind='invalid-argument'`，path 指向 `runtimeOptions`、`host` 或 `onError`。来自 Core/Runtime 的原错误在 cause 中保留。
- 宿主端口按浏览器语义工作：requestFrame 返回非负安全整数句柄（含 0）后才异步送帧；生命周期注册返回幂等撤销函数。request/注册若抛错，端口自身必须撤销尚未交出句柄的部分资源；不得一边抛错一边留下调用者无法撤销的请求。readVisibility 只返回 visible/hidden，端口返回非法值属于可观察的 scheduler 失败，不默认成 visible。
- 创建后的 phase 为 `idle`，runId 为 null，无 Runtime、运行消费者或帧请求；只建立一份控制器级宿主生命周期订阅。读取初始可见性，创建本身不推进 tick。
- 控制器状态：`idle | running | paused | faulted | disposed`。运行身份在本控制器内从 1 单调增加、不复用，只签发至 `Number.MAX_SAFE_INTEGER − 1`；restart 与 exit 后重新 start 都创建新身份。下一身份达到 `MAX_SAFE_INTEGER` 时，start/restart 在替换旧运行前抛 invalid-state（reason 为身份耗尽），保留原状态，不回绕；不新增修改身份的测试后门。
- 一个运行含一份 Runtime 和一组运行级资源。`currentRun()` 在 running/paused/faulted 返回当前绑定身份的句柄，idle/disposed 返回 null。
- 配置不在同一控制器内改变；需要不同 seed/频率/录制参数时，先 dispose 再创建控制器。restart 使用创建时的相同配置：tick 0、相同初始 RNG、无标记、commandId 从 1 起。
- `(runId, commandId)` 才是本控制器内跨重启的关联身份；不能把旧 commandId=1 的反馈归到新运行的 commandId=1。

| 当前状态/控制 | 成功结果 | 拒绝或失败反馈 |
|---|---|---|
| idle + start | 创建新运行；可见时 running，隐藏/离页时 paused（hidden）；首个回调只锚定 | 创建/调度失败按失败规则处理，不能残留第二实例；`cleanupFailed` 为 true 时 invalid-state，不创建运行 |
| running/paused + start | 幂等，无新运行、订阅或帧请求 | — |
| running + pause | paused（user）；停止循环并取消瞬时意图 | 不回滚已经成功的 tick |
| paused + pause | 幂等；原暂停原因不覆盖 | — |
| paused + resume，且环境可见且未离页 | running；下一 rAF 重新锚定，不补跑暂停时长 | 环境仍隐藏/离页时 invalid-state，仍 paused |
| running + resume | 幂等，无第二条循环 | — |
| running/paused/faulted + restart | 清理旧运行；仅清理成功后创建新身份，可见则 running，否则 paused（hidden） | 本次清理失败则不创建新运行；`cleanupFailed` 已为 true 时直接 invalid-state |
| running/paused/faulted + exit | 清理并释放当前运行，进入 idle；不负责切换 React 菜单 | 清理失败仍关闭旧运行，但不能报告正常退出，见失败规则 |
| idle + exit | 幂等，无额外清理 | — |
| 任意未销毁状态 + dispose | 关闭运行、移除宿主监听与控制器订阅，最终 disposed | 所有清理都尝试后显式报告失败 |
| disposed + dispose | 幂等，无重复清理或报错重发 | — |
| 其他组合（含 idle 的 pause/resume/restart、faulted 的 start/pause/resume、disposed 的非 dispose 控制） | 不改变状态 | invalid-state，带当前 phase/控制名 |

控制形状为只含 `type` 的判别联合，未知值、额外字段、非对象均拒绝。`status()` 返回冻结快照：phase、runId、environmentVisible、pauseReason（user/hidden 或 null）、cleanupFailed、error（最近的会话错误或 null）。

- environmentVisible 为 true 当且仅当宿主报告 visible 且不处于 pagehide 阻断，因此它为 false 时 resume 必然被拒绝。
- cleanupFailed 表示本控制器任一运行资源、运行订阅撤销或帧取消曾清理失败；一经为 true 不再复位，start/restart 恒拒绝，直至 owner dispose 后重建控制器。它独立于 error，后续错误覆盖 error 也不会丢失这一阻断事实。
- 成功的新运行清除旧 error；退出/销毁后的 error 保留便于呈现，不缓存错误历史。

### 唯一 rAF 与时间恢复

- 生产 rAF 和浏览器事件只由 `src/platform/` 适配器取得；app 会话代码通过端口调度，不使用 DOM、Date、宿主随机、setInterval 或模拟 Worker。
- running、环境可见、没有故障时，控制器拥有**至多一个**待执行帧请求；回调进入时本次请求已消费。Runtime 的模拟、域事件分发和帧消费者完成后，才决定是否申请下一帧。
- 每个被接受的浏览器回调最多调用一次 Runtime.frame；消费者收到其完整结果，不能取得手动 frame/step 能力，渲染器不另开循环。0 tick 回调仍产生一份渲染通知。
- Runtime.frame 抛错时没有成功帧报告，本次不发 onFrame，转交错误/状态通知；不得拼凑 `{ticks:0,capped:false}` 伪装成功。已请求的边界控制仍收尾处理；onFrame 自身抛错则继续当前其余帧消费者，再处理故障。
- pause、hidden、exit、restart、dispose 都使旧请求失效并尝试 cancel。身份与调度代次共同隔离回调：取消后迟到、重复到达、恢复前旧回调或 ID 被复用时，均不得 step、通知消费者或申请新帧。有效 rAF handle=0 不能误当“没有请求”。
- “停止循环”包含失效所有推进凭证。正常 cancel 成功后物理待执行请求为 0；cancel 抛错时可能仍有一次底层回调，但其必须无效且不能续排，错误仍须报告，不宣称底层取消成功。
- pause/hidden 时不保留 rAF 渲染循环，读取仍可用。进入 paused 时，显式生命周期操作把 Runtime 的前后 Render State 折叠为最新成功状态：`previous=current`、alpha=0，并通知仍有效的帧消费者一次。
  - 这只改变 Runtime 持有的呈现状态对，不修改 Core 或已返回的冻结对象；未调用生命周期操作的裸 Runtime 语义不变。
  - 不会因 alpha 置零画回上一 tick。故障时同样折叠，见“错误与恢复”。
- resume 丢弃旧时间基准、最后接受的时间戳、余量与未运行时间，保留世界/RNG/ID/recording 以及折叠后的状态对。
  - 首个新回调只锚定，运行 0 tick，alpha 为 0，呈现仍为暂停时的最新 tick，不回退。
  - 之后第一个新 tick 才形成新的前后状态对。正常固定步长与补跑上限完全沿用 P1-04，禁止通过改写世界时间跳过 tick。
- 重新锚定后，首个新时间戳可以小于暂停前的值。宿主交来非有限/非 number 时间戳，或时间换算溢出，使 Runtime.frame 抛 invalid-argument（path=nowMs）时，归类为 scheduler 失败而非调用者参数错误。

### 可见性与页面离开

- 每个控制器只订阅一次宿主生命周期，不随 start/restart 增加监听；真实适配器每份订阅对应 document 的 visibilitychange、window 的 pagehide/pageshow，返回撤销全部监听的函数。
- 读到 hidden 或收到 pagehide，running 自动变 paused（hidden）、清输入/队列并停止 rAF。user-paused 仍保持 user 原因；idle/faulted 只更新环境事实，不启动运行。
- visible/pageshow 只更新环境事实，仍 paused。必须显式 resume；pageshow 不创建新运行或自动消耗命令。pagehide 建立离页阻断，即使当时 document 仍报 visible，也不能继续；pageshow 才解除阻断并重新读取可见性。
- 每次有效帧在调用 Runtime 前再核对环境，防止浏览器通知延迟时隐藏页面仍推进。重复 hidden/pageshow 不重复取消命令、清理资源或发起帧请求。
- pagehide 是挂起，不等于 dispose，保留世界、录制及当前资源以允许页面返回；真正离开时 JS 环境可能被浏览器销毁，不依赖 unload 保证逐项清理。不安装 beforeunload 确认或承诺刷新恢复存档。
- 实际 BFCache 是否保留页面由浏览器决定；本任务验证事件适配与恢复状态，不宣称命中 BFCache 或跨导航保存资源。

### 输入、取消反馈与帧内控制

- 运行句柄的 `setInput`/`submitCommand` 仅在当前身份的 running 状态可用；暂停/故障/结束或旧身份明确抛 invalid-state，不静默吞输入、不分配 commandId。合法结构仍由真实 Runtime 校验；结构错误包装为会话 invalid-argument 并保留 path/原 cause，不转故障。Runtime 不可恢复错误（例如 commandId 耗尽）使控制器 faulted：在边界外立即转换并按同步失败规则抛出；在通知边界内则记录下来，在边界末尾按顺序转换。
- 每次暂停（user/hidden）、旧运行结束或故障，都清零连续输入并取出未执行命令；它们不进入未来 step、replay 或 Core 事件，也不消耗 RNG/实体 ID。
- 运行级 `onCommandsCancelled` 收到冻结的 `{runId, commandIds, reason}`；reason 为 user-pause/hidden/restart/exit/dispose/failure。ID 按提交顺序，每个未执行 ID 恰好取消一次；空集合不通知，已执行（含 Core 业务拒绝）的 ID 不再取消。这是 Runtime 控制反馈，**不是** Core `command-rejected`。
- 已发出的输入资源（例如键盘适配器的按住表）未来须按状态通知自行清零；本任务仅清 Runtime 快照/队列，不假称已移除尚不存在的键盘监听。resume 后需新的 setInput 才移动。
- 控制器在空闲/暂停时同步执行控制；`control` 不等待下一 tick，方法正常返回只表示已执行或已排入当前通知边界，不是 Core 成功事件。
- **通知边界：** 以下三类各为一个边界：一次 rAF 回调处理、一次同步控制的执行（含 pause 的静止帧通知）、一次宿主生命周期通知的处理。
  - 边界内由域事件或 onFrame 回调提交的控制、边界内到达的宿主通知，以及同步发生的故障，都先记录。待本边界的模拟、域事件分发与全部通知结束后，按发生顺序 FIFO 应用。
  - 应用时产生的新通知同样遵守此规则，直到队列为空。当前多 tick 帧不回滚、不半途 reset；后面尚未执行的 tick 不是订阅者可直接访问的世界。
- 例：首个域事件监听器请求 restart，其余监听器仍收到旧批次并读取旧运行；批次完毕才清理旧实例。新运行仅在自己的新 rAF 上推进，旧回调不能替它排下一帧。
- **控制校验：** 提交时同步校验形状，非法形状直接向调用者抛 invalid-argument。状态转换在应用时按状态表校验：
  - 边界外的同步控制若转换非法，直接抛 invalid-state，不改状态。
  - 排队控制若转换非法，不改变状态，也不让健康运行进入故障。它以 operation-failed 的 `{phase:'control', cause: invalid-state}` 计入本边界错误，后续排队控制继续逐条应用；非法顺序不能被跳过后报告成功。
  - 同步控制边界里排队控制产生的 control 失败，同样在该边界末尾经 onError 报告，不抛给发起同步控制的调用者；调用者自身操作的执行失败仍按同步规则抛出，两者不合并。
- 当前帧失败时，先记录故障，再处理先前已排队的退出/销毁/重启等控制，不因捕获异常而漏掉之前请求的退出。
- 状态、取消、错误通知以及清理回调不可递归提交控制（invalid-state），避免通知→通知或清理→重启的无限重入。状态通知允许读取、取消订阅，以及在有效 running/paused 句柄上注册新消费者/资源，以便 owner 接线新运行；清理中不能新增资源。取消/错误/清理回调仅可读取或取消已有订阅。游戏输入仍须遵守当前身份与 phase 校验，不借通知绕开暂停。

### 订阅、帧视图与资源清理

- 控制器 `onStatus` 是生命周期范围的同步通知：状态变化时发布冻结快照；不逐 tick 发布世界，不接 Zustand。重复幂等控制不发多余状态通知，晚订阅者先自行 status()，不回放历史。
- 运行句柄提供 Runtime 的按类型/全部域事件订阅、onFrame、onCommandsCancelled，以及 `ownCleanup(cleanup)`。所有回调同步返回 undefined，不接受 async/Promise 作为清理或监听器。
- onFrame 收到 `{runId, phase:'running'|'paused', render, projection, report}`；正常 rAF 的 report 沿用 `{ticks,capped}`，暂停边界 report=null。先域事件、再帧视图、再处理排队控制，正常无额外状态采样/插值实现。
- 故障后的 run 仍可读取最后成功 projection、静止渲染视图、recording；不能增加资源、提交输入或运行。结束后的旧句柄读写/注册均拒绝，已取出的冻结输出与导出仍有效，取消/释放句柄仍幂等。
- `ownCleanup` 只能在当前 running/paused 运行上注册同步 disposer，返回幂等的 release。
  - release 立即执行 disposer 并把它移出集合，后续 teardown 不再调用它。
  - release 中 disposer 抛错时：记为已尝试，置 `cleanupFailed`，并向调用者抛 operation-failed（phase=cleanup）；当前运行不因此进入故障。
  - 清理失败也算已尝试，不会悄悄重复调用非幂等资源。
- pause 不销毁资源；restart/exit/dispose/failure 按注册的逆序调用剩余资源。先禁用运行和旧回调并清空队列，再发取消反馈，然后撤销运行订阅，最后尝试全部资源清理；某个清理抛错时，其余独立清理仍执行。
- **同一转换内的通知顺序固定：**
  1. onCommandsCancelled；
  2. 仅 pause/hidden：onFrame 静止视图；
  3. restart/exit/dispose/failure：撤销运行订阅并清理资源，restart 随后创建新运行；
  4. onStatus 一次；
  5. 异步边界最后调用 onError。
- 无运行级订阅转移到新 run；控制器级状态观察者可以跨 restart/exit 观察，但 dispose 时全部取消。调用方负责在新 run 上建立消费者，而非借旧句柄重新接线。
- 非域事件通知同样固定接收者批次：回调内新增订阅从下一批开始，取消立即影响尚未调用者；互不相关的通知消费者按注册顺序执行。dispose 的最终状态通知先送达，再清空控制器观察者；之后注册 onStatus 明确拒绝，旧取消函数仍幂等。
- owner（将来的 React effect/HMR 装配层）必须在卸载/替换时 dispose，再创建新控制器；不用全局单例掩盖缺失清理。本任务提供该基础，不声称尚未接线的 React/HMR 已通过。

### 错误与恢复

- 新增 `GameSessionError`，kind 为 invalid-argument、invalid-state 或 operation-failed。
  - invalid-argument 带 path、reason 和可选 cause。
  - invalid-state 带 operation、当前 phase、runId 和 reason。
  - operation-failed 带有序的 `{phase, cause}` 列表，phase 为 runtime/scheduler/consumer/cleanup/control；保留原 `GameRuntimeError` 或任意抛出值，冻结列表但不冻结异常对象。
- **Runtime.frame 错误到 phase 的对应：**
  - `faulted`（Core 抛错或 ID 耗尽）→ runtime；
  - `listener-failed` → consumer；
  - `invalid-argument`（nowMs）→ scheduler；
  - request/cancel/readVisibility 失败 → scheduler；cancelFrame 失败另按 cleanup 处理；
  - onFrame、取消反馈或状态观察者抛错 → consumer；
  - 排队控制转换非法 → control。
- 同步公开操作的参数/状态错误直接抛出，不再调用 onError。同步 start/exit/dispose 等操作实际执行失败时，先尝试必要清理，再抛 operation-failed，状态不能伪装成功。
- rAF 和宿主通知中的失败无法通过方法返回值交给用户。每个异步边界中，本边界所有失败按发生顺序汇入同一个 operation-failed，存入 status.error，并在本边界全部通知之后最后调用一次必填的 `onError`。
  - 除 control 外的失败都会结束当前运行的调度。
  - 仅含 control 失败的边界不改变健康运行。
  - consumer 失败时先继续其余当前通知，再处理故障；Core 失败时域事件的处理仍遵循 P1-04，不补发被丢弃的批次。
- Runtime.frame 抛 listener-failed 时，已完成 tick/时间/recording 不回滚，但控制器把消费者失败提升为 faulted 并停止自动循环。这里是会话安全策略，不改变裸 Runtime 在该异常后可继续的契约。
- status 观察者抛错时取消该失败观察者，继续其余观察者；有运行则转 faulted，避免再次通知同一失败观察者产生循环。idle/disposed 时保持其终止/空闲状态但保存错误。故障处理中的额外取消/清理失败一并汇总，不覆盖首个原因。
- onError 抛错时，将会话错误与出口本身异常组成 AggregateError 明确抛向宿主；不得吞掉或只打印“成功”。控制器已停止调度，不为尝试报告错误再开启循环。
- 无清理失败的 runtime/scheduler/consumer 故障可以 restart 得到新运行；旧输入、资源、订阅和回调都不继承，故障世界只保留到重启或退出之前。故障时同样把前后状态对折叠为最后成功状态、alpha=0。
- 故障 teardown 中的清理失败置 `cleanupFailed`。
- **清理失败阻断自动恢复与 restart/start。** 逻辑运行已关闭不等于底层资源释放成功；不能启动新实例掩盖失败。仍可 exit/dispose 尝试未完成的独立清理并保持错误可见，已尝试 disposer 不重试。操作者处理底层问题/必要时刷新后重建 owner，不提供“忽略错误继续”。
- 清理失败时的状态不含糊：restart 失败保持旧身份的 faulted、无新运行；exit 完成所有尝试后为 idle/runId=null 但保存错误并抛出失败，且该控制器仍禁止 start；dispose 最终为 disposed 并保留错误。cancelFrame 失败按 cleanup 失败处理；首次 requestFrame 失败为 scheduler 失败，回收当前运行资源后可安全重试 restart。
- 创建新 Runtime 本身失败、尚没有可读取世界时保持 idle/runId=null 并保存/报告错误；restart 已清理的旧运行不会“恢复成功”。新运行已创建而首 requestFrame 失败时为 faulted，可读取该运行；控制器级宿主订阅仍归其所有，dispose 时撤销。
- 初始化建立宿主监听或首次 rAF 请求失败时也清理已取得的资源，不残留可推进循环或无主资源。没有异步重试或成功形状兜底。

## 数据模型与契约

下列名称为计划新增接口；函数/文件内部组织由 goal 基于实际代码确定，不新建统一 schema。

| 数据/接口 | 形状、单位与约束 | 权威所有者与边界 |
|---|---|---|
| 会话创建 | `createSyntheticSession(runtimeOptions, host, onError)`；runtimeOptions 沿用现有 `SyntheticRuntimeOptions`，值副本 | app；只拥有当前一个 Runtime，不接受外部可 step 的场景 |
| 控制器 | `control({type})`、`status()`、`currentRun()`、`onStatus(listener)`；type 为 start/pause/resume/restart/exit/dispose | app；控制不进入 Core，onStatus 返回幂等取消函数 |
| 会话状态 | `{phase,runId:number|null,environmentVisible:boolean,pauseReason:'user'|'hidden'|null,cleanupFailed:boolean,error:GameSessionError|null}`；冻结，非历史 | app；idle/disposed 无当前世界，不冒充 Core projection |
| `SessionRun` | 绑定只读 runId 的输入、命令、域事件/帧/取消订阅、清理注册、projection/render/export 读取 | app；无 frame/step/发布事件/世界引用；跨 run 用身份检查拒绝 |
| `SessionFrame` | `{runId,phase,render:RenderFrame,projection:SyntheticUiProjection,report:{ticks,capped}|null}`；冻结 | app 聚合真实 Core 输出；呈现静止视图时不修改 Core |
| 取消反馈 | `{runId,commandIds:readonly number[],reason}`，固定原因集合见上文 | app；不是 DomainEvent，不序列化进 replay |
| `SessionHost` | requestFrame(callback)→number、cancelFrame(handle)、readVisibility()→visible/hidden、subscribeLifecycle(listener)→取消函数 | 类型归 app 的 DOM-free 端口；实际浏览器实现归 platform，handle=0 合法 |
| 浏览器宿主创建 | 计划新增 `createBrowserSessionHost()`，返回 SessionHost；不在模块导入时安装监听或启动 rAF | platform；实际监听在 subscribeLifecycle 时安装并撤销，宿主策略仍归 app |
| 宿主通知 | `{type:'visibility',visibility}`、`{type:'pagehide'}`、`{type:'pageshow',visibility}`；浏览器适配器发出 | platform 只报告环境，不持有 Core、策略或单独游戏循环 |
| `GameSessionError` | 三种 kind 与字段见错误节；onError 签名 `(error:GameSessionError)=>undefined` | app；公开错误可观察，不在 Core 插入宿主通知 |
| Core/Runtime 既有数据 | `MoveInput`、`Command`、`DomainEvent`、`SyntheticUiProjection`、`SyntheticRenderState`、`RenderFrame`、`SyntheticRecording` | 分别复用 [Core](../../../../src/core/synthetic-scene.ts)、[Runtime](../../../../src/app/synthetic-runtime.ts)、[replay](../../../../src/core/synthetic-replay.ts)，不重新定义 |

生命周期实现可以在 app 内为 Runtime 增加以下显式生命周期操作：重新锚定时钟、折叠状态对、清空队列与轴、关闭订阅，并返回被取消的 ID 供控制器通知。
- 这些操作在 Runtime faulted 后仍可调用。
- 它们不得暗中改变裸 frame/setInput/submitCommand 的正常行为。
- 清理操作不重置 Core 的 tick/RNG/实体；只有创建新 Runtime 才开始新世界。

### 持久化与兼容

无浏览器持久化、存档 schema 或迁移。暂停保留同一录制，暂停期间没有 tick；取消的未执行命令不入记录。restart 清空旧运行内存录制并从创建配置开始新记录，旧导出冻结副本仍有效；exit/dispose 不替用户自动导出或保存。诊断读取必须在旧 run 结束前完成。

P1-03 格式/版本不变，replay 不记录 wall-clock、pause/resume、runId 或生命周期通知；只比较实际成功执行的逐 tick 输入与事件/哈希，不承诺跨浏览器/版本一致。没有原版资源字节、私有路径或遥测进入状态/错误通知。

## 技术决定

用户于 2026-10-02 在生成和审阅时均要求：需要回答时直接采用推荐答案。以下方案据此选择，其中 10–13 是审阅时新增的。它们**不是完整 spec 的用户批准**，也不改变冻结架构。

1. **保留裸 Runtime，新增会话控制器与 platform 端口。** 复用 P1-04，不把浏览器时间、暂停或资源清理塞入纯 Core；低层新增生命周期能力只服务明确控制。
2. **暂停完全停 rAF，恢复需显式操作。** 不在后台/暂停页浪费循环，也不在用户回到标签页时突然重新移动；静止视图与状态通知让后续 renderer/UI 可在暂停时读取/响应布局，不要求另起持续渲染循环。
3. **暂停丢弃瞬时意图并通知取消。** 防止 resume 后旧按住状态或离散请求“延迟开火”；明确取消区别于 Core 拒绝，未来 UI 的 pending 请求有结论。
4. **运行身份和句柄隔离旧回调。** cancelAnimationFrame 不能代替身份守卫；restart 使用相同 seed 配置且不复用 runId。生产不暴露手动 frame，自动模拟入口只有 controller。
5. **控制在帧末串行化。** 域事件/帧消费者请求退出或重启不会销毁正被遍历的世界；先完成已有批次，再按 FIFO 转换，不用 async 微任务偷偷改变时机。
6. **消费者/调度失败先停，清理失败不允许重启遮盖。** 用独立且必填的错误出口报告异步故障；保留真实成功前缀，无假成功、自动循环恢复或无界失败重试。
7. **资源使用同步、运行级所有权。** 逆序清理、每项至多尝试一次、独立失败继续；只做实际消费者需要的注册接口，不建未来媒体/Worker 框架。
8. **pagehide 挂起，pageshow 不自动继续。** 不依赖 unload，不承诺 BFCache；controller dispose 仍是 owner 卸载/热替换的必需责任。
9. **Node 精确证明与真实浏览器适配分开。** Node 使用可控端口及合成资源；Chromium 检查真实 rAF/可见性。实际 React/HMR、GPU 和多引擎联合验证留给 P1-10，不扩大本任务接线范围。
10. **暂停与故障时折叠前后状态对，继续后不回退。**
    - 问题：原草案只让会话呈现静止视图，而 P1-04 的重新锚定帧保留旧的前后状态对且 alpha=0，渲染器会画出上一 tick。对真实 Runtime 的探测证实：暂停视图 x=0.04，继续后首帧会回到 x=0.02。
    - 决定：由显式生命周期操作折叠 Runtime 的状态对；继续后第一个新 tick 才形成新的状态对。
    - 不选的方案：冻结最后一次插值画面。它在继续时仍会跳动，而且需要 Runtime 保存渲染器自己的插值结果。
11. **统一的通知边界，排队控制非法不致故障。**
    - rAF 回调、同步控制、宿主通知各是一个边界。边界内产生的控制、通知和故障一律在边界末尾按 FIFO 应用。
    - 每个异步边界最多调用一次 onError，并在最后调用。
    - 排队控制的转换非法属于调用方顺序错误，以 control 失败报告，不终止健康运行。
12. **清理失败阻断可在 status 中持续观察。** 增加单调的 `cleanupFailed`，避免 error 被后续错误覆盖后，UI 无法判断 start/restart 会被拒绝。release 失败同样置位并抛给调用者，但不终止当前运行。
13. **本任务通过后勾选 STATUS 的 GameRuntime 项。** 该项要求的固定步长、命令队列、Event Bus 与控制通道由 P1-04 加本任务交付。含 StrictMode/HMR 的“无重复循环”联合项仍归 P1-10 验证。

## 验收标准

| ID | 可观察的通过条件 | 验证方法与所需证据 |
|---|---|---|
| AC-01 | 创建为 idle/runId=null、0 帧请求、1 份生命周期订阅；配置/host/onError 非法则明确失败，无残留订阅。省略录制关闭；修改配置或变化 getter 不影响后续 start/restart 的生效值；不同控制器无共享可变世界；runId 的安全分配守卫在关闭旧运行前拒绝溢出 | Node 创建、字段 path/cause、单次取值和两实例对照；不存在能力用负向类型检查证明。runId 上限无公开恢复入口，分配前守卫用代码审阅，不靠运行至上限或测试后门 |
| AC-02 | 完整状态表与幂等控制成立：start 不重复创建；paused 可直接 resume/exit；faulted 只能安全 restart/exit/dispose；dispose 后重复 dispose 无再次清理，其他控制拒绝。restart 为新 runId、tick 0、同初始随机条件；结束后旧句柄不能读写或订阅新世界。`cleanupFailed` 一经置位即持续可见，start/restart 拒绝 | Node 表驱动转换、读写旧句柄、commandId 重置与 `(runId,commandId)` 关联对照；覆盖 cleanupFailed 后 error 被覆盖仍保持阻断 |
| AC-03 | 宿主操作成功时，每个稳定 running 可见状态恰有 1 个待执行请求，其余稳定 phase 为 0；每个有效回调只推进一次且最多依现有上限跑 tick。取消句柄为 0、重复/迟到旧回调、ID 复用、exit→start 和 restart 都不能制造新循环或第二次 step | 可控 host 记录 request/cancel/回调代次，不以总回调次数猜测并发；重复生命周期序列逐次检查。cancel 失败时仍可能有物理请求，其失效证据和明确错误按 AC-10 验证 |
| AC-04 | 50 Hz，有效 rAF 时间依次为 1000/1020/1040/1050，此时世界 tick=2，状态对为 1/2，alpha=0.5。pause 后静止视图 previous=current=tick 2，alpha=0。宿主跳到 100000 期间不推进。resume 后：100000 首帧为 0 tick，状态对仍为 2/2，alpha 为 0；100020 恰推进 1 tick，状态对为 2/3。暂停前的余量 0.5 不保留；同一记录只含三个成功 tick，不含后台时间；首帧时间戳小于暂停前也接受 | Node 精确时钟、Render State 与 recording 对照，使用真实 Core；不得用 maxTicksPerFrame=5 的补跑冒充通过，也不得出现继续后画回 tick 1 的状态对 |
| AC-05 | 有排队命令和 moveX=1 时 pause：输入归零、未执行 ID 按序通知 user-pause 一次，无 DomainEvent/RNG/实体改动；暂停期间 setInput/submit 拒绝，不耗新 ID。resume 后中性 tick，不执行旧命令；再次提交才执行。无待执行命令时不发空取消通知 | Node 取消/域事件分别计数，录制中逐 tick commands 精确检查；hidden、restart、exit、dispose、failure 的原因和已执行 ID 不重复取消分别覆盖 |
| AC-06 | 首域事件监听器请求 restart/exit：其余当前事件及帧通知仍来自旧 run，处理后才转换；旧 frame 不替新 run 排下一请求。FIFO pause→resume 不产生双循环。pause 静止帧通知中提交的控制排到该次 pause 之后。边界内到达的宿主通知在边界末尾应用。非法排队控制不改状态、不终止健康运行，以 control 失败计入该边界唯一一次 onError | Node 多监听器日志、旧 runId/tick、资源/状态通知顺序；含域监听器先请求 exit 再抛错的收尾路径，以及 exit 后排队 pause 的 control 报告 |
| AC-07 | 宿主 hidden/pagehide 从 running 自动暂停并清意图；可见/pageshow 不自动继续，hidden 或离页期间 resume 拒绝。user-paused 遇到 hidden 保持原原因；在帧前读到 hidden、即使缺失通知也不 step。pagehide 发生时读 visibility=visible 仍挂起且 environmentVisible=false，只有 pageshow 解除离页阻断 | Node 生命周期端口，重复/乱序通知与当前环境读取；真实 visibility 另见 AC-13，不混同模拟通知证据 |
| AC-08 | onFrame 在每个正常 rAF 回调（含 0 tick）恰通知一次，读到最新 projection 和两份状态。pause、hidden 各另发一次静止通知：`previous=current=当前 tick，alpha=0，report=null`，之后不再持续通知。同一转换内按“取消反馈→静止帧→资源清理→状态→onError”的顺序通知。静止视图不修改 Core 或已返回的冻结对象。状态通知只在有变化时触发，晚订阅者收不到历史，所有视图只读且旧输出不变 | Node 消费者断言精确输出、通知顺序、类型检查与冻结/隔离；不要求 Canvas/WebGL |
| AC-09 | A/B/C 三个资源按 C/B/A 逆序清理；提前 release 的 B 不再运行。C 抛错时仍会尝试 A，所有资源最多调用一次。release 抛错会置 cleanupFailed 并抛给调用者，但不终止运行。restart 清理失败时不创建新 Runtime 或 rAF。正常 exit/dispose 后运行订阅为 0；正常 dispose 后生命周期监听和状态订阅为 0。迟到的清理或取消句柄不作用于新运行 | Node 合成资源及计数、同步失败路径、身份守卫；实际监听释放以浏览器适配器证据补充。清理抛错只证明全部尝试过且有失败反馈，不冒称底层资源已回收 |
| AC-10 | Runtime listener-failed、step 前注入的 Core 故障、onFrame/状态消费者失败、request/cancel 失败，以及非法宿主时间戳，都显式进入错误处理，并按规定映射 phase（consumer/runtime/scheduler/cleanup）。当前剩余允许的通知和清理不中断，自动循环停止；原原因与清理原因有序保留。每个异步边界在全部通知后最后调用 onError 恰一次。onError 自身抛错时，宿主得到含双方原因的 AggregateError，不静默。取消失败后，实际迟到的帧仍不得 step | Node 精确故障注入与错误出口日志；沿用 P1-04 创建边界，只在 step 前抛错，不改 Core 生产代码，也不用假世界验收 |
| AC-11 | 无清理失败的 faulted 可 restart，得到干净新 run；故障最后 projection/recording 可读且 replay 成功前缀一致。清理失败则 restart/start 拒绝，无新循环，dispose 仍尝试剩余独立撤销；初始化订阅失败不残留监听，首 request 失败为有可读运行的 faulted、无活跃循环，尚未创建世界就失败则为 idle/error | Node 初始化/运行故障、后续恢复与拒绝对照；明确剩余控制器订阅仍有 owner，不把它误认成无主资源，也不以回滚或忽略错误冒充恢复 |
| AC-12 | 开启录制（显式间隔 1 和 4 各一），跨 pause/hidden/resume 的导出在同一版本/运行时 replay 与原结果一致；pause 未执行取消命令不入记录；restart 新记录从 tick 0，旧导出不变；关闭录制与开启模式的相同有效 tick 状态一致 | 真实 P1-03 replay/比对器和独立输入预期，不从生命周期通知重建世界 |
| AC-13 | 在隔离 Chromium 和真实 Vite origin 中加载新会话及浏览器适配器，用实际 rAF 观察：tick 前进、暂停后稳定、显式恢复不回退、重启、exit→start、dispose→新建。切到另一个标签页或窗口，实际触发 hidden，再回前台验证不自动继续，并记录真实 visibilityState。dispose 后，适配器安装的三个监听逐项移除，旧回调不再通知。pagehide/pageshow 的真实绑定另用浏览器事件探针核验，不把派发的事件当作 BFCache 命中 | 必须调用 [browser-testing](../../../../.agents/skills/browser-testing/SKILL.md)。临时 DOM 探针显示 phase/runId/tick/error，并在创建适配器前记录 add/removeEventListener 与 request/cancel 调用；不改生产 App。自动化工具无法产生真实 hidden 时，可由用户在真实浏览器中手动切换标签页并记录观测；两者都无法取得时保持 blocked，不能用伪造的 visibility getter 或 Node 代理通过 |
| AC-14 | 完整 `pnpm check` 通过；P1-04 既有的正常帧、录制、错误断言不放宽；未调用生命周期操作的裸 Runtime 行为不变；Core 不引入浏览器或生命周期。app 可控会话测试在无 DOM 的 Node 类型环境中通过；platform 的 DOM 适配由 app 类型检查与真实浏览器检查，不放宽纯 Core tsconfig。engineering/guides 按实际新入口更新。全部验收通过后勾选 STATUS 的 GameRuntime 项，不勾 StrictMode/HMR/真实消费者等联合退出项 | 目标 Vitest、typecheck/lint/test/build、范围与文档链接检查；无新依赖、E2E runner、生产页面接线、存储或原版文件读取、远端操作 |

## 验证策略

- **单元/契约：** 计划新增 app 同目录 `*.test.ts`，现有 Node Vitest；受控 host 手动送 timestamp/生命周期通知，记录恰一个待执行请求、身份、资源与通知日志。模拟 host 是调度能力边界，不是 mock 第二套 Core。
- **帧与失败：** 常规路径用真实 Runtime/Core/录制。沿用既有 test-only 创建边界测试故障；以对照实例及预期成功 tick 序列检验无后台补跑、取消无影响和失败前缀。暂停/重启不是 Core rollback，域分发未完成时不得 reset。
- **类型/工程：** 复用 `pnpm exec vitest run src/app` 和 `pnpm check`。app 会话与端口保持不依赖 DOM；浏览器适配器不在模块导入时自动安装监听。禁止通过给纯 Core 加 DOM lib 来解决 Node 测试的编译问题。适配器若以结构化参数接收事件目标，可另在 Node 中用 EventTarget 补充验证注册与撤销，但不能替代真实浏览器检查。
- **Replay：** 同初始 seed/生效频率及逐 tick 输入下，用 `replaySyntheticRecord` 和 `compareSyntheticReplayResults` 验证；生命周期与 rAF 分组不是一致性输入，也不序列化进既有记录。
- **浏览器：** 必需 Chromium 的实际适配检查，按 browser-testing 做隔离/启动/观察/清理；复用现有 `pnpm dev`，不引入 Playwright 项目依赖或不存在的命令。临时探针通过公共控制器/运行句柄驱动并显示只读状态，不修改世界、原版数据或生产入口，完成后清除自有探针/页面/服务器。
- **所有权与重挂载：** Node 和浏览器各重复完整生命周期，并验证旧 controller dispose→新建后只有新运行有帧。它证明清理契约，不能标为真实 React StrictMode/HMR；后者属于 P1-10。
- **实机/原版：** 不适用；不做键位拦截、GPU/媒体或原版时间保真。真实标签页的 visibility 是本任务的浏览器环境条件，不等于发布设备矩阵。自动化和用户手动观测都无法取得时，仍是验收阻塞。

## 风险与恢复

风险等级：**中**。调度与资源所有权将被多个下游消费者依赖，但没有存储迁移或原版内容变化。

- **旧意图/旧回调穿越重启：** 身份句柄、代次 guard、排队取消与清理计数共同验证，不只调用 cancel 就假定安全。
- **暂停插值倒退/后台快进：** 暂停与故障时折叠状态对，静止呈现最新 tick；继续时只锚定首帧（0 tick），保留折叠对不回退；不混入 Core tick，也不更改已有速度单位。
- **失败遮掩资源增长：** 所有独立清理都尝试并聚合，已失败资源不算释放成功，清理失败阻断重启；只读记录供诊断，不自动重试。
- **录制内存：** 默认关闭，显式开启者控制时长；重启/退出释放旧会话内存引用，已导出的副本由调用者拥有，不引入容量策略。
- **接线范围扩张：** App/main 不接线，实际 GPU、键盘、React/HMR 由责任任务验证，不以合成资源计数声称它们已清理。
- **恢复：** 运行故障由安全 restart/exit 处理，清理失败需操作者处置；代码可按本任务范围回退，P1-04 手动 Runtime 契约继续成立。契约变化需重新审阅/批准，并通知下游，不改冻结决定。

## 未决事项

无。生成与审阅中需要选择之处，均按用户 2026-10-02 的指示采用推荐答案（技术决定 1–13）。完整 spec 仍需用户明确批准。真实浏览器的 hidden 与 rAF 是执行阶段必须取得的证据，不是已通过的结果，也不能免除。

## 审批

**2026-10-02 用户批准完整 Spec。** 用户调用 generate-goal 并明确写明“批准 spec 并生成 goal”，批准当前审阅版本的 S-01 至 S-08、AC-01 至 AC-14 与技术决定 1–13（含审阅修订）。status 为 accepted，仅表示契约获批，不表示实现完成，也不批准尚未生成的 goal 或授权执行/提交。
