---
type: guide
status: active
phase: all
updated: 2026-10-09
related: [ADR-0015]
---

# 平台模块说明

本文件是[源码结构指南](../source-structure.md)的模块分册，记录 `src/platform/` 中已交付代码的当前 API 与契约要点。目录树、职责边界与 helper 归属以指南为准，行为契约以各任务 spec 为准；修改本模块代码的任务同步更新本文件。

[platform/](../../../src/platform/) 实现文件、输入、音频、存储与浏览器生命周期；键盘输入的当前绑定见[键位文档](../keyboard-input.md)，输入源与消费者的分工见[职责与依赖](../source-structure.md#职责与依赖)。

## 资源缓存

[platform/storage/](../../../src/platform/storage/) 由 [P2-10](../../plan/p2/10/goal.md) 交付资源缓存：

- **DOM-free：** [resource-cache-contract.ts](../../../src/platform/storage/resource-cache-contract.ts) 定义缓存键、13 个封闭错误码、失败结果形状、宿主错误按 `name` 分类，以及由存储估算得出的建议性空间判定 `evaluateCapacity`（`usage`/`quota` 缺失、为负或非有限时为 `unknown`）；[resource-cache-records.ts](../../../src/platform/storage/resource-cache-records.ts) 定义数据库名 `osr-resource-cache`、数据库版本 1、记录格式版本 1 与两个对象仓库名（`RESOURCE_CACHE_DATABASE`），包记录与 payload 记录的构建和读取（先查结构，再按 P2-01 读取；未知格式、内容 schema 或切片定义版本为 `cache-incompatible`，其余为 `cache-corrupt`），按定义顺序核算清单预算，恢复时把 payload 记录与清单配对并重新验证，以及存储需求估算（payload 字节精确求和，元数据按包记录与各 payload 记录键的 JSON 文本每字符 2 字节、每条记录另加 64 字节估算）。两者都在 Node 中测试。
- **IndexedDB 适配：** [browser-resource-cache.ts](../../../src/platform/storage/browser-resource-cache.ts) 的 `createResourceCache({ indexedDB?, storage? })` 只依赖注入或全局的 IndexedDB 与 `navigator.storage` 能力，不用 `window`/`document`，因此也能在 Dedicated Worker 中运行；只由应用程序检查，不进入 Node 程序。提交先取得 payload 独占快照，再读预算限值、按定义顺序核算、`validatePackage`，最后在一个读写事务中删除该键的旧记录（payload 用 `[来源类别, 令牌, 转换器版本]` 到其后追加 `[]` 的键范围）并写入新记录，只有 `complete` 才返回 `committed`；列出只读包记录；恢复在一个只读事务中读包记录、在其回调里核算预算后才读 payload 记录，事务结束后配对并重新验证。连接收到 `versionchange` 即关闭并丢弃，已开始的事务照常结束，之后的操作重新打开；浏览器强制关闭（`close` 事件）后同样丢弃。在已关闭连接上开始事务报 `storage-closed`，这次操作随即丢弃它所用的那个缓存连接（只在缓存的仍是该连接时，不会清掉更新的连接），下一次操作重新打开并报告实际状态；进行中的事务被强制关闭时，中止先于 `close` 事件，所以报 `write-failed`/`read-failed`，之后由 `close` 处理器丢弃连接。更高版本的数据库报 `storage-newer-version`，不升级也不删除。`checkCapacity` 只作建议，不阻止提交；没有 `StorageManager` 或估算失败时为 `unknown`。提交可带 `AbortSignal`：调用时已取消或写事务开始前取消返回 `cancelled`；写事务仍可中止时调用原生 `abort()`，事务确已中止才返回 `cancelled`；已进入提交阶段（`abort()` 抛出 `InvalidStateError`）或已完成时以事务最终事件为准。预期失败都以结果返回。

## 音频播放

[platform/audio/](../../../src/platform/audio/) 由 [P2-08](../../plan/p2/08/goal.md) 交付 Web Audio 播放端口，供 P2-11 试听与后续 Runtime 事件消费者调用：

- **DOM-free 控制器：** [audio-controller.ts](../../../src/platform/audio/audio-controller.ts) 的 `createAudioController({ audio, lifecycle, reportError })`。
  - **注入：**
    - `audio` 能力：`createContext()` 返回上下文端口，含 `state`、`currentTime`（上下文时间，秒；P3-03/27）、`onStateChange`、`resume`/`suspend`/`close`，以及接到输出的 `createVoice(buffer, loop)`；发声端口的 `start(when?)` 与 `stop(when?)` 立即执行，或在上下文时间 `when` 执行，较晚的 `stop` 取代尚未到达的预定停止。`createBuffer(channels, sampleRate)` 不需要上下文。
    - `lifecycle` 宿主：`visible()`，以及可撤销的 `visibilitychange`、`pagehide`、`pageshow` 监听。
    - 必填的 `reportError`。
  - **状态：** `idle`、`locked`、`running`、`suspended`、`unavailable`、`failed`、`disposed`。
    - **上下文：** 每个控制器至多一个，延迟到 `unlock()` 创建；构造失败为 `unavailable`。
    - **状态来源：** 由上下文的状态变化驱动，从不等待 `resume()` 的 Promise。首次运行前未运行时为 `locked`；浏览器自行挂起或中断时停止全部发声，变为 `suspended`；上下文被关闭，或宿主操作同步抛错（创建缓冲、注册状态监听、开始发声、恢复、挂起）时为 `failed`。离开 `running` 时先改变状态再停止发声，所以订阅者在这期间也不能开始新的发声。
  - **可见性门：**
    - **隐藏：** 停止全部发声，只把 `running` 挂起为 `suspended`，并记下“因隐藏而挂起”。
    - **恢复：** 只有这种挂起才在页面恢复可见（`visibilitychange` 为 visible，或可见时的 `pageshow`）时自动 `resume()`。
    - **隐藏期间：** `unlock()` 不创建也不恢复上下文；迟到的 `running` 立即再次挂起。
    - **不补播：** 恢复后不补播任何发声。
  - **命令：**
    - **`load(sounds)`：** 用 `readSoundPayload` 与 `soundChannelData` 把 `{ id, schemaVersion, bytes }` 转为控制器自有的浮点缓冲，整批成功才登记；`idle` 时也可调用。`schemaVersion` 须为 `SOUND_PAYLOAD_SCHEMA_VERSION`（P3-03/27 起为 2），schema 1（字节与 schema 2 相同）与其他版本的记录为 `invalid-sound-payload`。`repeat` 声音只建一份一遍的缓冲，不按次数复制（否则解码内存最多放大 255 倍），并记下 `plays × 帧数 / 采样率` 秒。
    - **`play(id)`：** 只在 `running` 时开始新的发声：`none` 播放一次，`whole` 整段循环到被停止，两者只调用 `start()`，与 P3-03 之前相同。`repeat`（[P3-03/27](../../plan/p3/03/subtasks/27-sound-repeat.md)）整段循环一份缓冲，读取一次 `currentTime`，以同一时间调用 `start(when)` 与 `stop(when + 时长)`，由宿主的结束事件自然结束，并像 `none` 一样释放；不用 `start()` 的 `duration` 参数，因为各引擎对循环源的处理不一致。读取 `currentTime` 失败时控制器为 `failed` 并释放发声。同时发声上限为 `AUDIO_VOICE_LIMIT`（8），只是资源保护。
    - **`stop`、`stopAll`：** 立即停止并断开节点，可重复调用；对 `repeat` 声音不带参数的 `stop()` 取代尚未到达的预定停止，可提前结束。
    - **`dispose()`：** 同步停止全部发声、移除全部监听并释放缓冲；从不为释放而创建上下文；只在上下文存在且未关闭时 `close()` 一次。
  - **结果与快照：**
    - **结果：** 判别联合的纯数据，错误码封闭：`audio-unavailable`、`audio-locked`、`audio-suspended`、`audio-failed`、`unknown-sound`、`duplicate-sound`、`invalid-sound-payload`、`voice-limit`、`disposed`。宿主错误文本不进入结果。
    - **快照：** `{ status, loaded, voices }`，冻结，两次变化之间保持同一对象；`subscribe` 可配合 `useSyncExternalStore`。
    - **错误转交：** 订阅者错误与发声清理错误交给 `reportError`。
    - **所有权：** 不保留、不修改、也不转移调用方的 payload。
  - **测试：** 用假能力与假生命周期宿主在 Node 中测试；假能力记录 `start`/`stop` 的排程时间（[audio-controller.test-support.ts](../../../src/platform/audio/audio-controller.test-support.ts)）。
  - **重复播放的精度（残余风险）：** 排程用主线程读到的 `currentTime`，开始准时时恰为各遍；若宿主晚于该时间才开始，最后一遍可能被截短。Chrome 中 `currentTime` 是下一个未渲染量子的起点，P3-03/27 逐帧计数 24 次 8 遍播放都恰为 8 遍；Firefox 与 WebKit 未实测。
- **浏览器工厂：** [browser-audio-controller.ts](../../../src/platform/audio/browser-audio-controller.ts) 的 `createBrowserAudioController({ reportError })` 提供真实能力：
  - **上下文：** `new AudioContext()`；构造器缺失或抛错时，控制器为 `unavailable`。
  - **发声：** 每次发声一个接到 `destination` 的 `AudioBufferSourceNode`；`currentTime` 与 `start`/`stop` 的 `when` 原样透传。
  - **缓冲：** `new AudioBuffer(...)` 加 `getChannelData().set()`，不需要上下文。
  - **生命周期：** `document.visibilityState` 与 `document` 的 `visibilitychange`、`window` 的 `pagehide`/`pageshow`。
  - **范围：** 无导入副作用，没有测试注入口；只由应用程序检查，不进入 Node 程序。Chrome 中的验证见[工程约定](../README.md#本地浏览器-runner)。
- **边界：** `platform/audio/` 不导入 `original-data`（字节端口也不行）、`render`、`ui`、`app`、`workers`，不使用网络 API 或 `localStorage`，见[工程约定](../README.md#lint-规则eslintconfigjs)。
