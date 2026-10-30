---
type: guide
status: active
phase: all
updated: 2026-10-29
related: [ADR-0015]
---

# 平台模块说明

本文件是[源码结构指南](../source-structure.md)的模块分册，记录 `src/platform/` 中已交付代码的当前 API 与契约要点。目录树、职责边界与 helper 归属以指南为准，行为契约以各任务 spec 为准；修改本模块代码的任务同步更新本文件。

[platform/](../../../src/platform/) 实现文件、输入、音频、存储、种子、计时与浏览器生命周期；键盘输入的当前绑定见[键位文档](../keyboard-input.md)，输入源与消费者的分工见[职责与依赖](../source-structure.md#职责与依赖)。

## 资源缓存

[platform/storage/](../../../src/platform/storage/) 由 [P2-10](../../plan/p2/10/goal.md) 交付资源缓存：

- **DOM-free：** [resource-cache-contract.ts](../../../src/platform/storage/resource-cache-contract.ts) 定义缓存键、13 个封闭错误码、失败结果形状、宿主错误按 `name` 分类，以及由存储估算得出的建议性空间判定 `evaluateCapacity`（`usage`/`quota` 缺失、为负或非有限时为 `unknown`）；[resource-cache-records.ts](../../../src/platform/storage/resource-cache-records.ts) 定义数据库名 `osr-resource-cache`、数据库版本 1、记录格式版本 1 与两个对象仓库名（`RESOURCE_CACHE_DATABASE`），包记录与 payload 记录的构建和读取（先查结构，再按 P2-01 读取；未知格式、内容 schema 或切片定义版本为 `cache-incompatible`，其余为 `cache-corrupt`），按定义顺序核算清单预算，恢复时把 payload 记录与清单配对并重新验证，以及存储需求估算（payload 字节精确求和，元数据按包记录与各 payload 记录键的 JSON 文本每字符 2 字节、每条记录另加 64 字节估算）。两者都在 Node 中测试。
- **IndexedDB 适配：** [browser-resource-cache.ts](../../../src/platform/storage/browser-resource-cache.ts) 的 `createResourceCache({ indexedDB?, storage? })` 只依赖注入或全局的 IndexedDB 与 `navigator.storage` 能力，不用 `window`/`document`，因此也能在 Dedicated Worker 中运行；只由应用程序检查，不进入 Node 程序。提交先取得 payload 独占快照，再读预算限值、按定义顺序核算、`validatePackage`，最后在一个读写事务中删除该键的旧记录（payload 用 `[来源类别, 令牌, 转换器版本]` 到其后追加 `[]` 的键范围）并写入新记录，只有 `complete` 才返回 `committed`；列出只读包记录；恢复在一个只读事务中读包记录、在其回调里核算预算后才读 payload 记录，事务结束后配对并重新验证。连接收到 `versionchange` 即关闭并丢弃，已开始的事务照常结束，之后的操作重新打开；浏览器强制关闭（`close` 事件）后同样丢弃。在已关闭连接上开始事务报 `storage-closed`，这次操作随即丢弃它所用的那个缓存连接（只在缓存的仍是该连接时，不会清掉更新的连接），下一次操作重新打开并报告实际状态；进行中的事务被强制关闭时，中止先于 `close` 事件，所以报 `write-failed`/`read-failed`，之后由 `close` 处理器丢弃连接。更高版本的数据库报 `storage-newer-version`，不升级也不删除。`checkCapacity` 只作建议，不阻止提交；没有 `StorageManager` 或估算失败时为 `unknown`。提交可带 `AbortSignal`：调用时已取消或写事务开始前取消返回 `cancelled`；写事务仍可中止时调用原生 `abort()`，事务确已中止才返回 `cancelled`；已进入提交阶段（`abort()` 抛出 `InvalidStateError`）或已完成时以事务最终事件为准。预期失败都以结果返回。

## 音频播放

[platform/audio/](../../../src/platform/audio/) 由 [P2-08](../../plan/p2/08/goal.md) 交付 Web Audio 播放端口，供 P2-11 试听与 P3-14 的飞行音效消费者（[app 模块说明的飞行音效](./app.md#飞行音效)）调用：

- **DOM-free 控制器：** [audio-controller.ts](../../../src/platform/audio/audio-controller.ts) 的 `createAudioController({ audio, lifecycle, reportError })`。
  - **注入：**
    - `audio` 能力：`createContext()` 返回上下文端口，含 `state`、`currentTime`（上下文时间，秒；P3-03/27）、`onStateChange`、`resume`/`suspend`/`close`，以及接到输出的 `createVoice(buffer, loop, parameters?)`；发声端口的 `start(when?)` 与 `stop(when?)` 立即执行，或在上下文时间 `when` 执行，较晚的 `stop` 取代尚未到达的预定停止。只有给出初始参数 `{ gain, left, right, playbackRate }`（有限数）时才创建参数节点并在返回前设好，返回的端口另有 `setParameters(parameters, when)`；不给参数的“固定”发声没有该方法（P3-14/10）。`createBuffer(channels, sampleRate)` 不需要上下文。
    - `lifecycle` 宿主：`visible()`，以及可撤销的 `visibilitychange`、`pagehide`、`pageshow` 监听。
    - 必填的 `reportError`。
  - **状态：** `idle`、`locked`、`running`、`paused`、`suspended`、`unavailable`、`failed`、`disposed`。`paused` 只在使用任务暂停门禁时出现（P3-14/11）；查看器的状态文案把它当作 `suspended`，但查看器从不暂停。
    - **上下文：** 每个控制器至多一个，延迟到 `unlock()` 创建；构造失败为 `unavailable`。
    - **状态来源：** 由上下文的状态变化驱动，从不等待 `resume()` 的 Promise。首次运行前未运行时为 `locked`；浏览器自行挂起或中断时停止全部发声，变为 `suspended`；上下文被关闭，或宿主操作同步抛错（创建缓冲、注册状态监听、开始发声、恢复、挂起）时为 `failed`。离开 `running` 时先改变状态再停止发声，所以订阅者在这期间也不能开始新的发声。
  - **可见性门：**
    - **隐藏：** 停止全部发声，只把 `running` 挂起为 `suspended`，并记下“因隐藏而挂起”。
    - **恢复：** 只有这种挂起才在页面恢复可见（`visibilitychange` 为 visible，或可见时的 `pageshow`）时自动 `resume()`。
    - **隐藏期间：** `unlock()` 不创建也不恢复上下文；迟到的 `running` 立即再次挂起。
    - **不补播：** 恢复后不补播任何发声。
  - **任务暂停门禁（[P2-08 的 P3-14 修订](../../plan/p2/08/spec.md#播放控制器的扩展p3-14-的修订)，P3-14/11）：** 只有调用 `pause()`/`resume()` 的消费者（任务所有者）使用；不调用的查看器行为不变。
    - **`pause()`：** 关闭门禁，之后 `play` 为 `audio-paused`（`unavailable`、`failed`、`disposed` 时仍为各自的码）。有上下文且可用时请求 `suspend()`，状态为 `paused`，已有发声不停止、不断开，`none`、`whole`、`repeat` 的源进度随上下文时间停止；`idle`、`locked` 时只记下门禁，状态不变。重复调用幂等。暂停中 `update` 照常应用于保留的发声（上下文时间不前进，`repeat` 不消耗遍数），`stop`/`stopAll` 照常结束它们。
    - **暂停失败：** 这次 `suspend()` 同步抛错或兑现为 rejected 时，以 `released` 释放全部发声，向 `reportError` 报告只带宿主错误名称的 `AudioPauseError`（`hostError`），状态为 `failed`。这是控制器唯一观察结果的宿主 Promise；已被新的挂起取代、门禁打开后已运行或已释放时的迟到结果被忽略。
    - **`resume()`：** 须在可信用户激活中调用。页面可见时打开门禁并调用上下文的 `resume()`；状态等 `statechange` 报告运行才回到 `running`，保留的发声从原位置继续，不重播。期间状态保持 `paused`（发声为 `paused`）；上下文从未运行过时为 `locked`。页面隐藏时什么也不做，门禁仍关闭。
    - **门禁关闭时 `unlock()`：** 没有上下文时在手势中创建；创建即运行的上下文立即再挂起。状态为 `paused`，不播放，也不恢复已有上下文或打开门禁。
    - **只有暂停自己的挂起保留发声：** 门禁的 `suspend()` 落地（观察到 `suspended`、或 Promise 兑现）之前出现的 `running` 视为暂停之前发出的恢复，等待挂起；落地后门禁关闭时出现的 `running`（迟到或自行恢复）以 `released` 释放全部发声并再次挂起，状态仍为 `paused`。`interrupted`、不是这次暂停造成的挂起（包括挂起尚未落地时的中断）都以 `released` 释放全部发声；门禁关闭时状态保持 `paused`，门禁已打开时为 `suspended`；上下文关闭为 `failed`。同一次宿主往返内的暂停、继续、再暂停可能因此释放发声（保守处理）。
    - **门禁关闭时隐藏：** 以 `released` 释放全部发声，状态不变；页面恢复可见不恢复上下文。门禁打开时隐藏（包括继续后仍等待上下文运行）与修订前相同：释放全部发声，状态为 `suspended`，显示后自动恢复。
  - **命令：**
    - **`load(sounds)`：** 用 `readSoundPayload` 与 `soundChannelData` 把 `{ id, schemaVersion, bytes }` 转为控制器自有的浮点缓冲，整批成功才登记；`idle` 时也可调用。`schemaVersion` 须为 `SOUND_PAYLOAD_SCHEMA_VERSION`（P3-03/27 起为 2），schema 1（字节与 schema 2 相同）与其他版本的记录为 `invalid-sound-payload`。`repeat` 声音只建一份一遍的缓冲，不按次数复制（否则解码内存最多放大 255 倍），并记下全部遍数的源帧数 `plays × 帧数`（P3-14/10 起按源帧计进度）。
    - **`play(id)`：** 只在 `running` 时开始新的发声：`none` 播放一次，`whole` 整段循环到被停止，两者只调用 `start()`，与 P3-03 之前相同。`repeat`（[P3-03/27](../../plan/p3/03/subtasks/27-sound-repeat.md)）整段循环一份缓冲，读取一次 `currentTime`，以同一时间调用 `start(when)` 与 `stop(when + 时长)`，由宿主的结束事件自然结束，并像 `none` 一样释放；不用 `start()` 的 `duration` 参数，因为各引擎对循环源的处理不一致。读取 `currentTime` 失败时控制器为 `failed` 并释放发声。同时发声上限为 `AUDIO_VOICE_LIMIT`（8），只是资源保护。
    - **逐发声参数（[P2-08 的 P3-14 修订](../../plan/p2/08/spec.md#播放控制器的扩展p3-14-的修订)，P3-14/10）：** `play(id, parameters?)` 的 `{ volume, pan, rate }` 都是整数：音量、声像 0–127，速率 1–`AUDIO_RATE_LIMIT`（44,100 Hz，游戏的钳位）。整个对象先校验，缺省项（缺失或 `undefined`）取 127、64 与存储速率；任一项非整数、非有限或越界为 `invalid-parameters`，不分配句柄、不创建节点。范围只检查给出的值：缺省的存储速率即使高于上限（payload 允许到 96,000 Hz）也照用，`playbackRate` 为 1。宿主在创建发声或注册结束监听时抛错，已取得的节点全部断开，控制器为 `failed`。映射与校验在 [voice-progress.ts](../../../src/platform/audio/voice-progress.ts)：增益 = 音量 ÷ 127，两声道增益为 A-09 线性平衡表的 T[127 − 声像] ÷ 128 与 T[声像] ÷ 128（第一声道为左，D1-07），`playbackRate` = 速率 ÷ 存储速率。不传参数的 `play(id)` 与修订前完全相同（查看器即如此）。
    - **`update(voice, parameters)`：** 只对带参数的存活发声，整个对象校验后在当前 `currentTime` 一次应用（全有或全无）；合并后与当前值相同则不调用宿主，避免逐帧调用者堆积自动化事件；结果为 `updated`，或 `unknown-voice`（未知或已结束）、`fixed-parameters`、`invalid-parameters`、`audio-failed`（宿主抛错，控制器 `failed` 并释放全部发声）、`disposed`。
    - **`repeat` 的遍数：** 按源帧计，与速率和墙钟无关。开始时与每次改变速率时，`RepeatProgress` 把上次以来按旧速率播放的源帧扣除，再以“剩余源帧 ÷（存储速率 × `playbackRate`）”在当前上下文时间之后重新 `stop(when)`；速率不变的更新不重排。上下文时间不前进就不消耗进度。速率不变时遍数精确；`playbackRate` 在渲染量子边界生效，每次变速的误差至多 128 个输出帧乘以速率之差（以源帧计）。
    - **`voiceState(voice)`：** 纯读取，不调用宿主：存活且 `running` 为 `playing`，存活而上下文未运行为 `paused`，已结束为 `ended` 及第一个原因，否则 `unknown`。原因：`natural`（自然结束，含 `repeat` 的预定停止）、`stopped`（`stop` 缺省或 `stopAll`）、`preempted`（`stop(voice, 'preempted')`）、`released`（隐藏、浏览器挂起或中断、宿主关闭或失败、暂停失败、`dispose`）。句柄单调递增不复用，保留最近 `AUDIO_ENDED_HISTORY`（256）个终态，更早的为 `unknown`。
    - **`stop`、`stopAll`：** 立即停止并断开节点（含参数节点），可重复调用；对 `repeat` 声音不带参数的 `stop()` 取代尚未到达的预定停止，可提前结束，之后不再续播。
    - **`dispose()`：** 同步停止全部发声、移除全部监听并释放缓冲；从不为释放而创建上下文；只在上下文存在且未关闭时 `close()` 一次。
  - **结果与快照：**
    - **结果：** 判别联合的纯数据，错误码封闭：`audio-unavailable`、`audio-locked`、`audio-suspended`、`audio-failed`、`unknown-sound`、`duplicate-sound`、`invalid-sound-payload`、`voice-limit`、`disposed`，以及只在使用新能力时出现的 `audio-paused`（暂停门禁）与 `invalid-parameters`、`unknown-voice`、`fixed-parameters`（参数）。宿主错误文本不进入结果。
    - **快照：** `{ status, loaded, voices }`（`voices` 计入播放中与暂停中的发声），冻结，两次变化之间保持同一对象；`subscribe` 可配合 `useSyncExternalStore`。
    - **错误转交：** 订阅者错误、发声清理错误与暂停失败（`AudioPauseError`）交给 `reportError`。
    - **所有权：** 不保留、不修改、也不转移调用方的 payload。
  - **测试：** 用假能力与假生命周期宿主在 Node 中测试；假能力记录 `start`/`stop` 的排程时间、初始参数（固定发声为 `null`）与每次 `setParameters` 的参数和时间，并可逐次兑现或拒绝 `suspend()` 的 Promise、令其同步抛错（[audio-controller.test-support.ts](../../../src/platform/audio/audio-controller.test-support.ts)）。
  - **重复播放的精度（残余风险）：** 排程用主线程读到的 `currentTime`，开始准时时恰为各遍；若宿主晚于该时间才开始，最后一遍可能被截短。Chrome 中 `currentTime` 是下一个未渲染量子的起点，P3-03/27 逐帧计数 24 次 8 遍播放都恰为 8 遍；Firefox 与 WebKit 未实测。
- **浏览器工厂：** [browser-audio-controller.ts](../../../src/platform/audio/browser-audio-controller.ts) 的 `createBrowserAudioController({ reportError })` 提供真实能力：
  - **上下文：** `new AudioContext()`；构造器缺失或抛错时，控制器为 `unavailable`。
  - **发声：** 每次发声一个 `AudioBufferSourceNode`；`currentTime` 与 `start`/`stop` 的 `when` 原样透传。固定发声直接接到 `destination`；带参数的发声为“源 → 音量增益 → 两个声道增益 → `ChannelMerger(2)` → 输出”（立体声源先经 `ChannelSplitter`，使其第一声道只进第一个声道增益），初值在任何 `connect()` 与 `start()` 之前写入 `.value`（P3-14/30：节点接到输出后，Chrome 渲染线程对内在值的读改写可能与主线程的写入竞争，使 getter 读到旧值；未连接的节点不被拉取，所以初值与读数都与时序无关），更新用 `setValueAtTime(…, when)`，`disconnect()` 断开全部参数节点；不用 `StereoPannerNode`（等功率曲线与 A-09 不同）。
  - **缓冲：** `new AudioBuffer(...)` 加 `getChannelData().set()`，不需要上下文。
  - **生命周期：** `document.visibilityState` 与 `document` 的 `visibilitychange`、`window` 的 `pagehide`/`pageshow`。
  - **范围：** 无导入副作用，没有测试注入口；只由应用程序检查，不进入 Node 程序。Chrome 中的验证见[工程约定](../README.md#本地浏览器-runner)。
- **边界：** `platform/audio/` 不导入 `original-data`（字节端口也不行）、`render`、`ui`、`app`、`workers`，不使用网络 API 或 `localStorage`，见[工程约定](../README.md#lint-规则eslintconfigjs)。

## 任务端口的浏览器适配

[P3-04](../../plan/p3/04/spec.md) 的任务流程端口（类型在 [mission-ports.ts](../../../src/app/mission/mission-ports.ts)，见 [app 模块说明](./app.md#端口)）由 `platform/browser/` 与 `platform/files/` 实现。边界规则不允许 `browser-*` 文件进入 Node 程序，所以每个适配都拆为 DOM-free 的核心（注入宿主，Node 测试）与薄的浏览器连接（只由应用程序检查）。都没有导入副作用。[browser-ports.ts](../../../src/app/browser-ports.ts) 装配它们：种子来源、时钟、计时器与离页保护在应用端口中各有一份，由先后的任务所有者共用（计时器的每个句柄与离页保护的每次登记由取得它的所有者撤销）；文件保存以工厂传入，每个开发诊断实例创建并释放自己的 `FileSave`。

- **种子：** [seed.ts](../../../src/platform/browser/seed.ts) 的 `createSeedSource(random)` 每次抽取时向新的单元素 `Uint32Array` 调用 `getRandomValues`，所以值总是 uint32；宿主异常原样抛出，不回退为固定种子或宿主时间。[browser-seed.ts](../../../src/platform/browser/browser-seed.ts) 的 `createBrowserSeedSource()` 传入 `crypto`。
- **时钟与计时器：** [timer.ts](../../../src/platform/browser/timer.ts) 的 `createMonotonicClock(now)` 对非有限或倒退的读数抛 RangeError；`createOneShotTimer(host)` 的句柄是适配器自己从 0 起的计数（与宿主返回什么无关），延迟限于 0–2,147,483,647 ms（浏览器超过有符号 32 位毫秒会立即触发），回调以登记项为准，所以取消后或宿主取消后迟到的回调都不会执行。[browser-timer.ts](../../../src/platform/browser/browser-timer.ts) 的 `createBrowserClock()` 读 `performance.now()`，`createBrowserTimer()` 用 `setTimeout`/`clearTimeout`。
- **离页保护：** [leave-guard.ts](../../../src/platform/browser/leave-guard.ts) 的 `createLeaveGuard(target)` 每次登记安装一个 `beforeunload` 监听，处理器只调用 `preventDefault()`（请求浏览器自己的确认，不定制文字）；登记时宿主抛错则先尝试移除再抛出，移除也失败时为 `RollbackError`。撤销先使监听失效（即使移除抛错也不再请求确认），再移除，可重复调用。浏览器传 `window`；只有本机 Chrome 的刷新与关闭路径有证据（[工程约定](../README.md#本地浏览器-runner)）。
- **文件保存（只在开发构建）：** [file-save.ts](../../../src/platform/files/file-save.ts) 的 `createFileSave(host)` 每次保存创建 Blob、对象 URL 与临时下载链接，点击后按逆序释放，各尝试一次：点击开始下载时 blob URL 已被解析，所以随即撤销是安全的。结果为 `{ status: 'requested' }`，或 `status: 'failed'` 加原因：`failed`（宿主失败，已释放，带 `error`）、`cleanup-failed`（释放抛错，带 `error`）或 `disposed`（所有者已释放，之后不再取得任何资源）。[browser-file-save.ts](../../../src/platform/files/browser-file-save.ts) 的 `createBrowserFileSave()` 用 `URL.createObjectURL` 与加入 `body` 的隐藏 `<a download>`；它只在开发构建中经动态导入载入，生产构建中没有。
- **会话宿主：** [browser-session-host.ts](../../../src/platform/browser/browser-session-host.ts) 的 `createBrowserSessionHost()`（P1-05）提供真实 rAF 与 visibilitychange/pagehide/pageshow，见[工程约定](../README.md#会话端口与错误)。

## 键盘源

[platform/input/](../../../src/platform/input/)（P1-09）提供冻结的键盘事件与信号、纯按住轴、`KeyboardSource` 端口、DOM-free 的资格与监听管理（[keyboard-source.ts](../../../src/platform/input/keyboard-source.ts)）与浏览器连接 [browser-keyboard-source.ts](../../../src/platform/input/browser-keyboard-source.ts)。P3-05 的 `ui/game-input/` 消费者在任务所有者 `input` 阶段持有此源：平台层只报告事件与资格，不解释游戏动作、不调度 tick。焦点/页面资格变化清本地按住状态；仍 running 时消费者经 `GameInputConsumer.clear(reason)` 清理会话输入。绑定、上下文、拦截与清键约定见[键位文档](../keyboard-input.md)与[工程约定](../README.md#键盘源与输入区)。
