---
type: guide
status: active
phase: all
updated: 2026-10-10
related: [ADR-0015]
---

# 应用装配模块说明

本文件是[源码结构指南](../source-structure.md)的模块分册，记录 `src/app/` 中已交付代码的当前 API 与契约要点。目录树、职责边界与 helper 归属以指南为准，行为契约以各任务 spec 为准；修改本模块代码的任务同步更新本文件。

`src/app/` 中已交付：[P3-04](../../plan/p3/04/spec.md) 的正式 Runtime（[app/runtime/](../../../src/app/runtime/)）、游戏会话（[app/session/](../../../src/app/session/)）、DOM-free 的任务流程与所有者（[app/mission/](../../../src/app/mission/)）及其应用槽位（[app/composition/](../../../src/app/composition/) 的 `mission-slot.ts`）；P2-11 的资源持有者与任务载入诊断（[app/resources/](../../../src/app/resources/)）、查看器音频与所有者（[app/viewer/](../../../src/app/viewer/)）；P1-08 起的 DOM-free 页面流转（[app/flow/](../../../src/app/flow/)，菜单、导入、任务与查看器，内存状态，不用路由）。[App](../../../src/app/App.tsx) 是应用外壳；React hook、画面模块、应用端口与接线见[工程约定](../README.md#页面流转与任务生命周期)。P1 的合成演示所有者、演示槽位与合成 Runtime/Session 已于 P3-04 退役，见[退役记录](../source-structure.md#p3-04-合成演示退役记录)。

## 正式 Runtime

[game-runtime.ts](../../../src/app/runtime/game-runtime.ts) 的 `createGameRuntime(spec)`（[spec：Runtime](../../plan/p3/04/spec.md#runtime)），由 Node 测试以真实正式 Core 与合成任务覆盖。工程上的要点见[工程约定](../README.md#正式-runtime)。

- **规格：** `GameRuntimeSpec` 为 `CreateWorldInput` 除 `run` 外的内容字段（Core 的 `CONTENT_INPUT_FIELDS`：`mission`、`craftTypes`、`wingmanRoster`、`craftInfo`（同包的 `data/craft-info`，[P3-06 D-01](../../plan/p3/06/spec.md#对-p3-02-契约的增量)）、规则数据输入 `debrisParameters`、`projectileVisuals`、`explosions`、`explosionAnimations`、`models` 与 `aiPrograms`（[P3-07 CR-01](../../plan/p3/02/spec.md#cr-01-世界创建输入与静态规则数据d-01)）、`identity`；Runtime 与会话按这份列表读取，Core 新增内容输入时不需改动），`run: { rawDifficulty, wingman, seed }`（`GameRunConfig`，没有步长：只用 Core 默认步长）与 `recording: RecordingOptions | null`。有录制时用 `createRecordingSession`，否则 `createWorld`。Core 的创建错误原样抛出，不创建 Runtime；规格形状错误为 `GameRuntimeError` 的 `invalid-argument`。
- **帧：** `frame(nowMs)` 返回 `{ ticks, capped, stop: 'recording-capacity' | null }`，`ticks` 只计成功的 step。时间非有限、倒退或无法换算时抛 `invalid-argument`（归调度者），什么也不改变；监听器失败在整批投递后抛 `listener-failed`（归消费者，Runtime 本身不故障）；故障抛 `faulted`，带冻结的 `unconfirmed` FIFO ID（结果不明）；容量停止后抛 `recording-capacity`。`MAX_TICKS_PER_FRAME` 为 5。
- **输入：** `setIntent({ axes, primaryFire })` 在下一 tick 起生效（帧后投递中也允许）；`submitCommand(command)` 返回从 1 起的 commandId，越出 Core 契约为 `invalid-argument`，队列中已有 `COMMAND_QUEUE_LIMIT`（256）个时为 `command-queue-full`，都不改变状态；签发到 `Number.MAX_SAFE_INTEGER - 1` 之后的提交使 Runtime 故障。故障或停止后两者都被拒绝。
- **订阅与读取：** `on(type, listener)`、`onAny(listener)` 返回撤销函数；`type` 只接受 Core 的事件类型（[game-event-bus.ts](../../../src/app/runtime/game-event-bus.ts) 的 `EVENT_TYPES`，含 P3-06 的 `speed-assist-toggled`、`speed-matched`、`speed-assist-released` 与 `object-left-world`，以及 P3-07 的 13 种战斗事件（[CR-06](../../plan/p3/02/spec.md#cr-06-领域事件与次序d-01)）；新变体不列入就不能编译），其他为 `invalid-argument`。监听器收到 `(event, { commandId })`（`EventDelivery`）：只有提交的命令自己的 `command-result` 带其 ID，其他事件（包括带 `commandIndex` 的速度事件）为 null。`projection()` 与 `renderFrame()`（`{ previous, current, alpha }`）读最后完整的读模型；`snapshot()` 与 `exportRecording()`（无录制时为 null）是帧外的按需 Core 读取，帧内调用抛 `reentrant-call`，读取时发现 Core 故障也使 Runtime 故障；停止后仍可调用。
- **生命周期操作：** `resetClock()`、`clearIntent()`（返回确定未执行的 FIFO ID，供会话以取消通知）、`foldRenderState()`、`clearSubscriptions()`，帧内调用抛 `reentrant-call`，在任何状态都可调用。
- **测试：** [game-runtime.test-support.ts](../../../src/app/runtime/game-runtime.test-support.ts) 提供轴与意图的样本；故障注入的测试文件以顶层 `vi.mock` 替换创建边界，由 Vitest 的 isolated 项目运行。

## 游戏会话

[game-session.ts](../../../src/app/session/game-session.ts) 的 `createGameSession(host, onError)`（[spec：会话](../../plan/p3/04/spec.md#会话)），由 Node 测试以 `ControlledHost` 与真实 Runtime 覆盖。与 P1-05 的差异与通知边界见[工程约定](../README.md#会话端口与错误)。

- **控制：** `control(c)` 接受 `{ type: 'start', spec: GameRunSpec }`、`pause`、`resume`、`exit`、`dispose`、`{ type: 'complete-departure', runId }` 与 `{ type: 'clear-input', reason: 'focus-loss' | 'pointer-lock-exit' }`；类型封闭，额外字段拒绝。`GameRunSpec` 是 `GameRuntimeSpec` 加 `initialTransition: { gap: 'G-02/2', variant: 'solo' | 'wingman' } | null`，变体须与 Core 实际生效的僚机一致。
- **状态：** `status()` 为冻结的 `{ phase, runId, environmentVisible, pauseReason, transition, resumeRequired, stopReason, cleanupFailed, error }`；phase 为 `idle`、`transition`、`running`、`paused`、`stopped`、`faulted`、`disposed`；`onStatus(listener)` 订阅变化。
- **开始的失败：** 世界创建的拒绝（Runtime 的规格形状错误、`CoreInputError`、`ContentContractError`）抛 `GameSessionError` 的 `invalid-argument`，路径为 `control.spec…`，原错误为 cause，会话保持 idle（任务所有者从 cause 读取类别、路径与原因）；创建时的 `CoreFaultError` 为 `operation-failed`（runtime）。非 idle 的 start 以 `invalid-state` 拒绝。
- **运行句柄：** `currentRun()` 在 transition、running、paused、stopped、faulted 时有值，提供 `runId`、`setIntent`、`submitCommand`、`on`/`onAny`、`onFrame`（`{ runId, phase, render, projection, report }`，静止帧的 report 为 null）、`onCommandsCancelled`（`{ runId, commandIds, reason }`）、`ownCleanup`、`projection`、`renderFrame`、`snapshot` 与 `exportRecording`。faulted 时后两者拒绝；旧句柄退役后读写与新订阅一律拒绝。
- **拒绝的原因：** 队列已满、容量停止与投递中的重入在 `submitCommand` 上为 `invalid-state`，原因分别为 `command-queue-full`、`recording-capacity` 与 `unavailable during event delivery`。`clear-input` 在 paused 与 transition 为空操作，在 idle、stopped、faulted、disposed 拒绝。
- **测试支持：** [session-host.test-support.ts](../../../src/app/session/session-host.test-support.ts) 的 `ControlledHost`（帧回调等 `deliver(now)` 交付，生命周期事件经 `emit` 发出，每个端口操作都可设为失败）；[game-session.test-support.ts](../../../src/app/session/game-session.test-support.ts) 组合正式会话的测试设置。

## 任务流程与所有者

[app/mission/](../../../src/app/mission/) 与 [mission-slot.ts](../../../src/app/composition/mission-slot.ts) 是 DOM-free 的任务流程（[spec：应用流程](../../plan/p3/04/spec.md#应用流程)、[开始资格](../../plan/p3/04/spec.md#开始资格)、[任务开始配置](../../plan/p3/04/spec.md#任务开始配置)、[衔接占位](../../plan/p3/04/spec.md#衔接占位)、[消费者接线与释放](../../plan/p3/04/spec.md#消费者接线与释放)、[离页保护](../../plan/p3/04/spec.md#离页保护)），宿主能力经端口传入，由 Node 测试以真实会话、真实持有者与可控端口覆盖。React 接线与页面见[工程约定](../README.md#页面流转与任务生命周期)。

### 端口

[mission-ports.ts](../../../src/app/mission/mission-ports.ts) 只含类型，导入时不安装任何东西，由 [platform](./platform.md#任务端口的浏览器适配) 实现、`AppPorts.mission` 装配：

- `SeedSource`：`() => number`，每次创建世界的尝试抽取一个 uint32；抛错或其他值报开始失败，不回退为固定种子或宿主时间，允许重复。
- `MonotonicClock`：`() => number`，有限且不倒退的毫秒值，否则抛错。
- `OneShotTimer`：`schedule(callback, delayMs)` 返回非负安全整数句柄（0 合法），延迟 0–2,147,483,647 ms，之后异步回调一次（宿主可能略早，调用者以单调时钟核对）；`cancel(handle)` 幂等，取消后的回调不执行。
- `LeaveGuard`：`() => Revoke`，登记一份原生离页确认（`beforeunload`），不定制文字，也不在处理器中退出、清理或导出；登记失败先回滚再抛错，撤销失败抛错以便锁存。
- `FileSave`：开发诊断的文件保存，`save(name, text)` 返回 `{ status: 'requested' }`、`{ status: 'failed', reason: 'disposed' }` 或 `{ status: 'failed', reason: 'failed' | 'cleanup-failed', error }`，`dispose()` 幂等。`requested` 只表示浏览器接受了下载请求，不表示已写入文件。

### 开始资格

[mission-eligibility.ts](../../../src/app/mission/mission-eligibility.ts) 的 `missionEligibility(holderSnapshot, cleanupFailure)` 按次序给出第一个适用的原因：`cleanup-failed`、`no-package`、`package-incomplete`（不完整或缺失的组与整包诊断）、`mission-not-attempted`、`mission-failed`（任务载入诊断的类别、路径与原因），否则为 `eligible` 并带持有包的代际。只读持有者的全包判定、任务载入诊断与槽位的清理锁存：可恢复的缓存条目、已结束的导入作业或已保存都不能代替它们，未保存或保存失败的完整包仍可开始。资格只允许进入开始配置。

### 任务流程

[mission-flow.ts](../../../src/app/mission/mission-flow.ts) 是纯函数 `nextMissionFlow(state, input)`，不适用的输入返回同一对象。

- **位置：** `intro`（G-02/1）、`config`（开始配置，G-04、G-07）、`departure`（G-02/2，会话 `transition`）、`flight`（running 或 paused）、`menu`（暂停式任务菜单）与 `ended`（运行 faulted、stopped，或重开的收尾失败 `cleanup-failed`）；`FLOW_SESSION_PHASES` 列出各位置对应的会话 phase。
- **状态：** `{ position, selection, startFailure, runId, ended }`。开始失败 `MissionStartFailure` 为 `package-changed`、`cleanup-failed`、`seed`、`rejected`（世界创建的类别、路径与原因，会话保持 idle）或 `assembly`（`session`、`consumer`、`leave-guard` 阶段的装配失败，`rolledBack` 为 false 时已锁存）。
- **僚机预选：** `preselectWingman(confirmed, identityKey, optionCount)`：同一内容身份下预选上次成功确认的选择（含无僚机），否则名单第 1 项，名单为空时无僚机；记住的索引超出名单时回到默认。不能只凭同一索引推断是同一名单。

### 任务所有者

[mission-owner.ts](../../../src/app/mission/mission-owner.ts) 的所有者由槽位以 `MissionOwnerSetup` 创建：`{ holder, host, seed, clock, timer, leaveGuard, recording, consumers?, reportError }`，`recording` 在开发中为 `developmentRecording(producer)`（检查点间隔 `DEVELOPMENT_CHECKPOINT_INTERVAL` 32），在生产中为 null，所有者本身不读构建模式。

- **创建：** 资格不为 `eligible` 时抛 `MissionUnavailableError`（带 `eligibility`），什么也不取得。否则从持有包的 `logic` 组经 [mission-input.ts](../../../src/app/resources/mission-input.ts)（与任务载入诊断共用）解码三份逻辑 Asset 并 `loadMission`，以 `craftInfoInput` 解码同组的 `craft-info` Asset，以 `ruleDataInputs` 解码与运行无关的规则数据输入（`logic` 组的 DEBRIS 表与 AI 程序，`models` 组的爆炸表及其列出的动画、唯一的 `projectile` 类 `data` Asset；诊断不读它们，解码失败留作每次开始的失败），绑定该包的代际与完整内容身份；创建会话，订阅其状态与持有者的 `beforeReplace`，按次序连接各消费者，然后进入 G-02/1。中途失败时释放已取得的部分，释放也失败时抛 `RollbackError`。
- **快照：** `getSnapshot()`（绑定函数，两次变化之间为同一冻结对象）为 `{ ownerId, released, config, flow, placeholder, session, actionError, cleanupFailure }`；`config` 为任务 Asset ID、战役组与槽位、固定难度 19 与按名单次序的僚机选项 `{ index, nameCandidates }`（名字只作纯文本）；`placeholder` 为 `{ id, gap, variant, status: 'timing' | 'waiting' | 'failed', failure }`。`subscribe(listener)` 返回撤销函数。
- **意图：** `skip(placeholderId)`、`select(wingman)`（null 或名单中的索引，其他值抛 RangeError）、`start()`、`pause()`、`resume()`、`openMenu()`（先暂停 running 的运行，已暂停的保留原因）、`continueFromMenu()`（resume 成功才关闭菜单）、`restart()`（exit 并在全部收尾成功后回到 G-02/1，保留选择）。每个意图只在流程提供它的位置生效，其他位置、释放后或另一意图执行中都被忽略；同步失败记为 `actionError`。
- **开始：** 重读持有者的 `current()`，对象、代际或内容身份变化时为 `package-changed`；抽取一个种子（非 uint32 为 `seed` 失败）；craft-info 或规则数据输入解码失败时为 `rejected`（类别 `content`，路径 `<组>[<Asset ID>]…`），与世界创建的拒绝同样留在开始配置页。再从重读的同一份包以 `runModelInputs` 解码本次运行可实例化机体的模型（模型不能解码时同为 `rejected`；Core 拒绝该运行时不解码模型，由世界创建同样拒绝）。以本次选择、难度 19 与绑定包的三份逻辑 Asset、craft-info、规则数据输入、模型和身份组成运行规格（组中缺少某项时由世界创建在其输入位置拒绝），`initialTransition` 的变体按选择为 `solo` 或 `wingman`。会话 start、运行级消费者接线与离页保护登记任一失败都回滚已取得的资源；回滚成功可重试，失败则锁存。成功时记下确认的选择，进入 `departure`。
- **占位：** 一次只有一个单次计时器，以单调时钟核对实际经过的可见时间，累计 `PLACEHOLDER_MS`（3,000 ms）后结束；页面隐藏或 pagehide 时保留剩余时长并撤销计时器，可见后继续。每个占位只结束一次（自然或跳过），迟到或取消的回调不起作用。计时器登记、取消或时钟读取失败使占位永久停止（`failed`），跳过与自然结束都不再生效，只能离开界面；取消失败另锁存。出发占位结束时以当前 runId 发 `complete-departure`，已消费的回调被忽略。
- **消费者：** `MissionOwnerConsumer` 为 `{ stage: 'input' | 'ui' | 'media', connect(context) }`，`context` 为 `{ ownerId, session: { status, currentRun, onStatus }, previousClosed }`（只读视图，不能控制会话）。`connect` 返回 `{ release, attachRun?, onSessionError? }`：`attachRun(run, { ownerId, runId })` 在每个新运行的出发保持期间为它登记运行级消费者，撤销函数交给 `run.ownCleanup`，由会话在运行结束时逆序释放；`release` 返回 thenable 时为异步关闭，确认前同类资源不得重建（`previousClosed`）。
- **离页保护：** 有运行时（transition、running、paused，以及仍保有诊断或录制的 stopped、faulted）登记一份，exit 或释放时撤销；介绍、配置与主菜单不登记。
- **释放：** `release()` 只执行一次，重复调用返回第一次的 `{ failures, closed }`：先失效占位回调并撤销计时器，再依次释放 `input` 阶段、会话、`ui` 阶段、离页保护与 `media` 阶段；每项都尝试，第一个清理失败经槽位锁存。

### 任务槽位与收尾

[mission-slot.ts](../../../src/app/composition/mission-slot.ts) 的 `createMissionSlot({ onCleanupFailure, reportError, onPackageReplaced })` 每个应用实例一个。

- `open(() => MissionOwnerSetup)` 先释放旧所有者；锁存时返回 null 且不调用创建函数；ownerId 从 1 递增、不复用。创建抛出的 `MissionUnavailableError` 原样抛出，`RollbackError` 先锁存再抛出。
- `release()` 释放当前所有者，失败锁存；`current()` 与 `cleanupFailure()` 只读。锁存只记第一次的原因，经 `onCleanupFailure` 交出（出口抛错改经 `reportError`）。槽位还保存本应用实例内上次确认的僚机选择，以及所有所有者异步关闭的屏障。
- 持有者替换绑定的包时，槽位先释放该所有者（先锁存失败），再调用 `onPackageReplaced(ownerId)`。
- `teardownMissionAndHolder(slot, holder)` 是应用外壳的收尾顺序：先释放槽位，再销毁持有者（即使槽位释放抛错也销毁）。`ResourceHolder.dispose()` 不通知任何监听，所以任务的消费者必须在它们读取的包仍被持有时释放。

### 开发帧计时

[dev-frame-timing.ts](../../../src/app/mission/dev-frame-timing.ts) 的 `createFrameTiming(host, clock)` 只在开发构建中装配：返回包装后的 `host`（作为 `MissionOwnerSetup.host`）、一个运行级帧监听的 `consumer` 与 `subscribe(listener)`。它在会话处理一次有效帧回调的前后各读一次时钟，样本为 `{ processingMs, ticks, capped }`；被会话取消或没有报告的回调（隐藏页面上的暂停、Runtime 故障）不产生样本，时钟失败给出失败通知而不是 0 ms。它不自行调度，所有请求、取消与生命周期订阅原样交给被包装的宿主。诊断与面板见 [UI 模块说明](./ui.md#开发诊断)。

### 测试支持

[mission.test-support.ts](../../../src/app/mission/mission.test-support.ts) 提供 `openMission`、`missionHolder`、可控的 `TestClock`、`TestTimer`、`TestSeeds`、`TestLeaveGuard`、记录调用的 `TestConsumer`，以及走到配置、出发与飞行的 `toConfig`、`toDeparture`、`toFlight`。合成任务包来自 01 的任务场景（[workers 模块说明](./workers.md)）。

## 应用资源持有者

[P2-11](../../plan/p2/11/spec.md) 的应用级资源持有者在 [app/resources/](../../../src/app/resources/) 中，DOM-free，由 Node 测试覆盖。回归测试确认它不使用网络 API、`window`、`document` 与 `localStorage`，不导入包、`render` 或 `ui`，且每个模块都在 Node 程序中检查。当前已实现：

- **持有：** [resource-holder.ts](../../../src/app/resources/resource-holder.ts) 的 `createResourceHolder({ cache, profile, now, reportError })` 由应用外壳实例创建，至多持有一份资源包 `HeldPackage`：代际、来源（`import` 或 `cache`）、按切片定义顺序排列的完整组 `{ group, manifest, payloads, sources }`，以及 `validatePackage(CLASSIC_P2_SLICE, groups)` 的全包判定。容器冻结；payload 视图直接取自作业移交，不复制、不转移、不改写，所有权归持有者。
- **接收作业：** `acceptImport(job)` 只在作业快照为 `finished` 时调用 `takeGroups()`；失败、取消、组已被取走或释放之后都返回 false，不改变状态。部分结果同样替换原资源包。各组状态取自作业快照的组摘要：完整、不完整（附诊断）或缺失。
- **替换：** 每次替换代际加 1。替换前先以旧资源包同步通知 `beforeReplace` 监听，使引用它的消费者先释放；之后中止旧包的提交、结束进行中的恢复，再持有新包并通知订阅者。监听期间释放了持有者时，不再持有新包。
- **快照：** `getSnapshot()` 返回冻结的 `{ package, catalog, restore }`，两次变化之间为同一对象，不含 payload。
  - `package` 含代际、来源、四个组的状态、全包判定、缓存状态与任务载入状态。缓存状态为 `not-saved`（附失败或 null，以及失败提交的耗时）、`saving` 或 `saved`（附来源 `commit` 或 `restore` 与耗时）。
  - `catalog` 是最近一次列出的结果：`checking`、`unavailable`（附失败）或 `listed`（附可恢复的条目或 null）；spec 的缓存状态中 `checking` 与 `unavailable` 即此处的列出状态。
  - `restore` 为 `idle`、`restoring` 或 `failed`（附失败与耗时）。
  - `current()` 为应用内的消费者返回带 payload 的资源包。
- **缓存端口：** `ResourceCachePort` 是 P2-10 `ResourceCache` 的结构子集（`checkCapacity`、`commit`、`list`、`restore`），只用 `resource-cache-contract.ts` 的 DOM-free 类型，所以持有者不把浏览器适配带进 Node 程序；真实适配满足它。`profile` 是 01 的预期包配置，`now` 是只用于显示耗时的页面时钟。
- **列出：** 创建时列出一次，`relist()` 供每次回到菜单时调用；列出期间为 `checking`，只采用最近一次发起的结果。`restorableEntry(entries, profile)` 只选元数据兼容、来源为 `original-import`、指纹与转换器版本都等于预期配置的条目；其他条目不提供恢复，也不清理；例如 P3-03 递增转换器版本后，前一生产版本 `osr-import.graphics-3.logic-1.audio-1.models-3` 的条目不再提供恢复（[resource-holder-cache.test.ts](../../../src/app/resources/resource-holder-cache.test.ts)）。结果失败（含意外拒绝，报 `read-failed@list`）时为 `unavailable`。
  - 列出发起后资源包被替换时，丢弃该结果并重新列出。
  - 已保存的资源包只在之后的列出中仍有同键且元数据兼容的条目时保持 `saved`。没有同键条目、同键条目为损坏或不兼容，或列出失败时，缓存状态改为 `not-saved`，原因分别为 `not-found@key`、`cache-corrupt@key`、`cache-incompatible@key` 或列出的失败本身；资源仍可使用。只在列出发起后缓存状态没有变化时这样判定，所以与提交交错的旧列出不会误判。
- **提交：** 来自导入且全包 `complete` 的资源包立即以 `profile.limits` 与 `AbortSignal` 提交，状态为 `saving`，成功为 `saved`，失败为 `not-saved` 并附 P2-10 失败；部分结果与来自缓存的资源包不自动提交。`save()` 在完整资源包为 `not-saved` 时再次提交，不论来源（spec 行为表：列表中已没有该键时提供重新保存），保存中返回 false。意外拒绝报 `write-failed@commit`。替换与释放中止进行中的提交，其结果被丢弃。
- **恢复：** `restore()` 只在未持有资源包、列出有可恢复条目且没有恢复进行时，以 `profile.limits` 恢复该键。结果的身份与预期配置不一致时为 `cache-incompatible@identity`，重新校验不完整时为 `cache-corrupt@groups`，都不持有；成功时以来源 `cache`、缓存状态 `saved` 替换资源包。意外拒绝报 `read-failed@restore`。恢复期间资源包被替换时，恢复立即结束，迟到的结果被静默丢弃。
- **空间检查：** `checkSpace()` 以包预算的 `payloadBytes` 调用 `checkCapacity`，结果原样返回，只用于导入前的提示。
- **任务载入诊断：** [mission-diagnostics.ts](../../../src/app/resources/mission-diagnostics.ts) 的 `diagnoseMission(groups)` 在持有 `logic` 组时，取出并解码唯一的任务 Asset，再按任务引用的 Asset ID 取出机型表与僚机名单（切片只约束任务角色，组中可能有同角色的其他 Asset），都以 `decodeLogicPayload` 解码，然后调用 Core 的 `loadMission`。解码在 [mission-input.ts](../../../src/app/resources/mission-input.ts) 的 `missionInput(logic)` 中，P3-04 的任务所有者用同一函数从同一份包取得开始所需的三份 Asset，并用同文件的 `craftInfoInput(logic)` 以 `decodeRuleDataPayload` 解码同组唯一的 `craft-info` Asset（解码错误同样位于 `logic[<Asset ID>].…`）。同文件的 `ruleDataInputs(groups)` 解码 CR-01 中与运行无关的规则数据输入：`logic` 组的 `debris-parameters` 与 `ai-programs`（`decodeRuleDataPayload`），`models` 组的 `explosion-table` 及其三张列表引用的动画（`decodeFlightDataPayload`，按 ID 升序、恰为所列集合）与唯一的 `projectile` 类 `data` Asset（`readEffectPayload` 与 `checkEffectBinding`；不唯一时留空）；`modelInputs(groups, ids)` 按给定 ID 次序以 `readModelPayload` 与 `checkModelBinding` 解码模型；`runModelInputs(groups, input)` 以 Core 的 `instantiableModelIds` 取得一次运行的模型 ID 再解码，Core 拒绝该运行的逻辑 Asset、身份或运行配置时返回空列表，由世界创建以同一输入在其路径上拒绝。包中缺少的留空或略去，由世界创建拒绝；解码错误位于 `<组>[<Asset ID>].…`。tools/replay-check.ts 与任务场景测试用 `ruleDataInputs` 与 `runModelInputs`；`missionFailureOf(error)` 把 Core 与内容的拒绝转为下文的 `failed` 结构，开始配置页的创建失败也用它。
  - **结果：** 没有 `logic` 组时为 `not-attempted`。成功为 `loaded`，附结构摘要与引用校验；`CoreInputError` 与 `ContentContractError` 分别为 `failed` 的 `core-input` 与 `content`，附路径与原因。缺少某个角色的 Asset 时，由 `loadMission` 在对应的输入位置报 `CoreInputError`；解码错误保留 code 与原因，路径为 `logic[<Asset ID>].<路径>`；其他异常视为缺陷，继续抛出。
  - **摘要：** 只含任务 Asset ID、`campaign`、地图轴向、坐标与编队偏移的单位标注、玩家声明序号，以及声明、编组、生成区域、僚机选项与名称池的条目数和各阵营的声明数；不含名称、消息或其他原版文字。
  - **引用校验：** 解析到模型的声明数与僚机选项数，持有的资源包是否有完整的 `models` 组，以及每个模型 Asset ID 是否在其中。
  - **持有者：** 每次替换资源包时计算一次，结果在缓存状态变化时保持不变；诊断函数抛出的缺陷交给 `reportError`，任务状态保持 `not-attempted`。
- **状态阶梯：** [resource-status.ts](../../../src/app/resources/resource-status.ts) 的 `resourceStatuses(holder, job?)` 按 spec 的成立条件派生状态，依次为：
  - 来源已识别：作业 `running` 或 `finished` 且带身份；
  - 部分转换或完整资源可查看：按全包判定；
  - 完整包的已保存（缓存状态为 `saved`）或仅在内存中，保存中另有 `saving`；
  - 任务可载入 Core 或任务不可载入，只按任务载入诊断的 `loaded` 与 `failed`。

  只凭作业 `finished` 得不到“完整资源可查看”。
- **通知与释放：** 监听与订阅者同步收到通知，抛出的错误交给 `reportError`；`reportError` 本身抛错也被吞下，不影响替换与其他监听。`dispose()` 可重复调用：中止提交，丢弃资源包与全部监听；之后的列出、提交与恢复结果都被忽略，也不通知任何人。持有者不拥有缓存实例，不关闭它。

## 查看器音频

[app/viewer/viewer-audio.ts](../../../src/app/viewer/viewer-audio.ts) 是 P2-11 查看器的试听（[spec S-08、S-12](../../plan/p2/11/spec.md)），DOM-free，由 Node 测试覆盖；与 `app/resources/` 共用 DOM-free 的边界回归。

- **创建：** `createViewerAudio({ capability, lifecycle, reportError }, audioGroup)` 为一份资源包创建 P2-08 控制器，并载入完整 `audio` 组的全部声音。快照列出组内每个 sound Asset 的 ID 与角色（清单顺序）和载入结果；没有 `audio` 组时列表为空、载入结果为 null。
- **试听：** `audition(id)` 在可信点击中调用 `unlock()`。
  - 控制器已在 `running` 时立即播放；否则记下一次待播放意图（后一次点击取代前一次），控制器进入 `running` 时恰好播放一次。
  - 控制器进入 `unavailable`、`failed` 或 `disposed`，或调用 `stop`、`stopAll`、`cancelPending`（离开或替换资源包时由所有者调用）、页面隐藏（`visibilitychange` 为隐藏、`pagehide`）与释放，都丢弃该意图。控制器本身不排队。
  - 未知的声音、不可用或失败的控制器如实拒绝。
- **停止：** `stop(id)` 停止本查看器为该声音启动的发声，`stopAll()` 停止全部。控制器只报告发声数，所以查看器经包装的能力取得每个新发声的端口，并监听它的结束；结束、停止或控制器释放全部发声（如隐藏或失败）时，记录随即删除。播放期间控制器自己的通知不发布，所以订阅者看到新发声时它已有记录，可以立即停止。
- **重复播放：** 查看器不做专用改动；`repeat` 声音（[P3-03/27](../../plan/p3/03/subtasks/27-sound-repeat.md)）按次数播放由控制器完成（[音频播放](./platform.md#音频播放)），查看器的能力包装只透传上下文的 `currentTime`。
- **关闭观察：** 查看器包装传入的音频能力，记录上下文 `close()` 的结果。`dispose()` 释放控制器与页面生命周期监听，并返回同一个 promise，结果为：
  - `no-context`：从未创建上下文；
  - `closed`：`close()` 完成，或宿主已先关闭了上下文；
  - `close-failed`：`close()` 被拒绝或同步抛错，附原因。

  “已关闭”只以此为准，不以控制器的 `disposed` 快照代替；锁存与“关闭确认前不重建”由查看器所有者负责。
- **测试支持：** P2-08 控制器测试的宿主替身移到 [audio-controller.test-support.ts](../../../src/platform/audio/audio-controller.test-support.ts)，`FakeContext.closing` 可设为拒绝（默认）、完成、悬置或同步抛错。

## 查看器所有者

[app/viewer/viewer-owner.ts](../../../src/app/viewer/viewer-owner.ts) 是 P2-11 查看器的所有者与每个应用实例一个的查看器槽位（[spec S-07、S-12](../../plan/p2/11/spec.md)），由 Node 测试以真实的查看渲染、录制用表面替身与音频替身覆盖。`app/viewer/` 可以导入 `render/`（它拥有渲染器），仍不导入 `ui/`。

- **条目：** [viewer-items.ts](../../../src/app/viewer/viewer-items.ts) 的 `viewerCatalog(groups)` 按组顺序与清单顺序列出持有资源包各完整组中的模型、效果（角色为 `projectile`、`missile`、`debris` 的 data Asset）、图像、布局、调色板与字库，并按 Asset ID 索引这些条目的 payload。模型贴图及其调色板本身是二维条目，所以也在索引中。
  - **解析：** `resolveEntry(entry, payloads)` 一次读取并展开一个条目，给出它的全部变体与 `item(variant)`；所有者缓存所选条目的结果，所以切换同一条目的变体不再读取。只经 `content/` 的读取器与消费函数得到渲染器的条目：二维项用 `expandImage`、`composeLayout`；模型用 `readModelPayload`、`modelPartItems`、`expandModelTextures`；效果用 `readEffectPayload` 与 09 的 `effectViews`，并读取所引用的图像与调色板，用 `expandImage` 展开贴图。所需的调色板与图像在资源包中按 Asset ID 查找，缺失时为 `binding-mismatch`；效果贴图读取失败也使整个条目失败，不回退为无贴图显示。
  - **变体：** 模型的变体是部件列表 0–2，附部件数与 `MODEL_PART_LISTS` 的内容与置信度：列表 0 为完整模型（高概率：本地渲染可辨认，见 [mesh](../../original/formats/mesh.md)），列表 1 为碎片部件（已确认），列表 2 未确认（U-027）。效果的变体是它的各个视图，附每个形状的外观（显示字节、原值、`textured` 与 `seamUnconfirmed` 标记，无贴图且原值为 null 时显示诊断灰色）。二维项只有变体 0；不存在的变体，`item` 返回 null。
  - 内容错误成为该条目的失败（code、路径与原因），其他异常视为缺陷。
  - **切片定义版本 4（P3-03）：** 不改代码。新增的图像角色（`explosion-frame` 186 个、`nebula-background` 15 个、`hit-shimmer`、`target-display`）与目标显示屏的调色板随通用列表出现，带掩码的爆炸帧在透明处显示棋盘格；`hit-shimmer` 的存储值是受击条带的阈值，查看器的颜色不是游戏颜色。版本 4 新增的 `data` 角色不是效果角色，不在列表中（spec 技术决定 9）；它们的数量、字节与哈希由[包核对](../../guides/tools.md#包核对)报告。浏览器核对见 [P3-03/20](../../plan/p3/03/subtasks/20-browser-verification.md)。
- **所有者：** 槽位以 `{ holder, render, audio, reportError }` 创建所有者。
  - `render` 是表面或不可用的原因，交给 `createViewerRenderer`；
  - `select(id, variant = 0)` 显示所列条目的变体，或以 null 不显示；读取或展开失败时不显示，只记下该条目的失败；未知的条目或变体什么也不改变；
  - `changeView(action)` 以 `applyViewAction` 改变视图并交给渲染器的 `setView`；视图跨条目与资源包保留，无效的动作抛 RangeError；
  - 快照含所示资源包的代际、条目、所选条目与变体、所选条目的全部变体、视图、失败与 22 的查看器音频。
- **替换：** 资源持有者替换资源包前（`beforeReplace`），所有者先以渲染器的 `releaseItem()` 释放所示条目的全部 GPU 资源（渲染器已失败时也释放，释放失败时锁存），丢弃待播放意图并释放音频。新资源包的音频只在此前每一次音频关闭都确认后才创建：所有者与槽位保持一个只会累加的关闭屏障，连续替换或重开查看器都不会越过仍在进行的关闭；任何一次关闭失败都锁存，且不再创建。
- **创建失败：** 表面连接失败但已干净释放时，所有者改用不可用的渲染器，条目与试听照常；释放也失败（`RollbackError`）或持有者订阅无法撤销时，槽位锁存并抛出。
- **槽位：** `createViewerLifecycle({ onCleanupFailure, reportError })`。
  - `open(create)` 先关闭仍打开的所有者，锁存时返回 null 且不调用 `create`，所以锁存后不会再创建表面；否则以 `create()` 的选项创建所有者。`create` 或所有者抛出的 `RollbackError` 锁存后抛出。新所有者的音频等到上一次音频上下文确认关闭后才创建。
  - `close()` 撤销持有者订阅并释放渲染器与音频，每步都尝试：同步的失败立即锁存，音频 `close-failed` 在观察到时锁存。
  - 锁存只记第一次失败，经 `onCleanupFailure` 交出（出口抛错改经 `reportError`）；锁存后不再创建所有者，导入与任务不受影响。React 接线与页面见[工程约定](../README.md#页面流转与任务生命周期)的“查看器页面”。
