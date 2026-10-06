---
type: plan
status: active
phase: P2
task: "08"
subtask: "08"
updated: 2026-10-05
---

# 08 — 浏览器音频工厂与 Chrome 播放验证

**契约来源：** [spec](../spec.md) 的 S-08（`browser-*` 工厂）、S-09、S-11（浏览器播放部分）、S-12（本子任务部分），AC-10；[播放控制器](../spec.md#播放控制器)、[验证策略](../spec.md#验证策略)中的浏览器验证、[技术决定](../spec.md#技术决定) 9、10、11。
**依赖：** 07。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **浏览器工厂：** 计划新增 `src/platform/audio/browser-audio-controller.ts`，为 07 的控制器提供真实能力：
  - 用 `new AudioContext()` 创建上下文；构造器缺失或抛错时让控制器进入 `unavailable`；
  - 生命周期取自 `document.visibilityState`、`document` 的 `visibilitychange` 与 `window` 的 `pagehide`、`pageshow`；
  - 无导入副作用；只由应用程序类型检查，不被 Node 测试导入。

  测试可以经可替换的上下文构造函数插入观测节点；生产调用不传。
- **E2E：** 计划新增 `e2e/audio-playback.spec.ts`，在开发项目中经开发服务器动态导入 `/src` 模块，只用代码生成的合成采样。
  - **自管浏览器：** 用例用 `chromium.launch({ ...installedBrowser(), args: ['--autoplay-policy=document-user-activation-required'] })` 自行启动。据 goal 记录的实测，`user-gesture-required` 不会阻止 Web Audio，所以不用它。
  - **被阻止：** 在页面载入后，用原始 CDP `Runtime.evaluate`（不带 `userGesture`）调用 `unlock()` 与 `play()`，并断言 `navigator.userActivation.hasBeenActive` 为 false。不用 `page.evaluate`，因为它会给页面用户激活。
  - **解锁：** 用可信点击（CDP `Input.dispatchMouseEvent` 或 Playwright `click`），在点击处理中调用 `unlock()`。
  - **缓冲：** 用只读探针记录 `createBuffer` 返回的缓冲，核对采样率、长度与逐样本数据，等于 `u8` 与 `s16le` 合成采样经 01 映射的预期浮点值。
  - **输出：** 在 destination 之前插入 `AnalyserNode`（经可替换的构造函数，或经只读探针接到生产工厂的 destination 连接上），播放期间峰值非零，自然结束或 `stop` 之后回到零，发声数归零。至少一条用例经生产工厂与真实 `AudioContext` 走完整路径。
  - **页面隐藏：**
    - 按 [native-lifecycle](../../../../../e2e/native-lifecycle.spec.ts) 的路线：`nativeBrowser()` 风格的 headed 自管浏览器，另加同一自动播放开关；CDP 自建 context 与两个标签页，用 `Target.activateTarget` 切换；
    - 断言隐藏后全部发声停止、状态为 `suspended`、`play` 返回 `audio-suspended`；回到可见后恢复 `running`，且不补播。
  - **释放：** 释放后上下文为 `closed`，生命周期监听已全部撤销（探针计数），没有输出。
  - **不可用：** 导入模块之前移除 `AudioContext`，状态为 `unavailable`。
- **项目配置：** 在 [playwright.config.ts](../../../../../playwright.config.ts) 的 production 项目 `testIgnore` 中排除本用例，并同步 [e2e-configuration.test.ts](../../../../../tools/e2e-configuration.test.ts)。
- **测试支持：** 计划新增 `e2e/support/audio-playback.ts`，放只读探针与 CDP 辅助；复用 [native-lifecycle.ts](../../../../../e2e/support/native-lifecycle.ts) 的 `NativeTarget`、`until`。
- **文档：** 在[工程约定](../../../../engineering/README.md#本地浏览器-runner)记录音频用例的命令、自动播放开关的选择理由、被阻止路径必须用原始 CDP evaluate，以及 headed 隐藏路线；同步源码结构指南。

## 不包含

- 页面中的试听控件与真实界面点击（P2-11）；Firefox、Safari 与移动设备（P5）。
- 原版声音（10、12）；浏览器检查只用合成采样。

## 关键文件与契约

- **计划新增：** `src/platform/audio/browser-audio-controller.ts`、`e2e/audio-playback.spec.ts`、`e2e/support/audio-playback.ts`。
- **修改：** [playwright.config.ts](../../../../../playwright.config.ts)、[e2e-configuration.test.ts](../../../../../tools/e2e-configuration.test.ts)、[工程约定](../../../../engineering/README.md)、[源码结构](../../../../engineering/source-structure.md)。
- **复用：** 07 的控制器、01 的读取器与浮点映射；[environment.ts](../../../../../e2e/support/environment.ts) 的 `installedBrowser`；[browser-test.ts](../../../../../e2e/support/browser-test.ts) 的错误收集。

## 验收标准

- [x] AC-10（被阻止）：没有用户激活时，`unlock()` 后状态不是 `running`，`play` 返回 `audio-locked`，分析节点没有输出；证据记录 `hasBeenActive` 为 false。
- [x] AC-10（解锁、缓冲、输出）：
  - 可信点击后状态为 `running`；
  - 缓冲的采样率、长度与逐样本数据等于 `u8` 与 `s16le` 合成采样的预期浮点值；
  - 播放期间观测到非零输出；
  - 自然结束或 `stop` 之后回到静音，发声数归零。
- [x] AC-10（页面隐藏）：真实 hidden 后发声停止、状态为 `suspended`、`play` 返回 `audio-suspended`；回到可见后恢复为 `running` 且不补播。证据记录原生 `visibilitychange` 日志。
- [x] AC-10（释放与不可用）：释放后上下文为 `closed`，生命周期监听为零，没有输出；移除 `AudioContext` 时为 `unavailable`。
- [x] AC-10（生产路径）：至少一条用例经 `browser-*` 生产工厂与真实 `AudioContext` 完成解锁、播放与输出观测。
- [x] 本用例不在 production 项目中运行，配置回归同步；浏览器错误收集没有未预期项。
- [x] `pnpm test:e2e audio-playback.spec.ts --project=development`、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- 按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md) 运行，只用合成采样。不以调用 `start()` 或没有异常作为可听证据；不用合成的 `visibilitychange` 或覆盖 getter 代替真实 hidden。
- headed 桌面不可用、或工具中标签页始终报告 visible 时，本子任务的隐藏部分记为 blocked 并保留原因，不跳过。
- 完成前按 execute-goal 流程，以本子任务 diff 为范围做 rubber-duck 审查与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据

- **实现：** [browser-audio-controller.ts](../../../../../src/platform/audio/browser-audio-controller.ts) 的 `createBrowserAudioController({ reportError })`。
  - **能力：** 上下文为 `new AudioContext()`，构造器缺失时抛出，由控制器判为 `unavailable`；每次发声一个接到 `destination` 的 `AudioBufferSourceNode`；缓冲为 `new AudioBuffer` 加 `getChannelData().set()`；生命周期取自 `document` 与 `window`。
  - **约束：** 无导入副作用，只由应用程序检查。
  - **测试注入口：** 未增加。观测改用只读探针，见下文；子任务原先允许、但不强制注入口。
- **E2E：** [audio-playback.spec.ts](../../../../../e2e/audio-playback.spec.ts) 与[支持模块](../../../../../e2e/support/audio-playback.ts)。
  - **浏览器：** 每个用例自管 Chrome，带 `--autoplay-policy=document-user-activation-required`。复用 [native-lifecycle](../../../../../e2e/support/native-lifecycle.ts) 的 `NativeTarget`：原始 CDP `Runtime.evaluate` 不给用户激活，CDP 鼠标事件为可信点击。`nativeBrowser` 改为可追加启动参数，既有调用不变。
  - **探针（只读）：**
    - Proxy 记录 `AudioContext` 与 `AudioBuffer` 实例；
    - 把接到已记录 `destination` 的连接另外分接到 `AnalyserNode`，该节点经增益为 0 的节点接到 `destination`，不改变输出；
    - 包装 `connect`/`disconnect`，统计仍接到 `destination` 的节点数；
    - 记录原生 `visibilitychange`。
  - **配置：** [playwright.config.ts](../../../../../playwright.config.ts) 的 production 项目排除本用例；[e2e-configuration.test.ts](../../../../../tools/e2e-configuration.test.ts) 以 `it.each` 同时固定 resource-cache 与 audio-playback 只在 development 运行。
- **Chrome 154.0.8037.98 结果**（`pnpm test:e2e audio-playback.spec.ts --project=development`：3 通过；`--repeat-each=3`：9 通过）：
  - **被阻止：** 加载 4 个合成采样后经 CDP 调用 `unlock()`，得到 `locked`，上下文为 `suspended`，`play` 返回 `audio-locked`，分接峰值为 0，`hasBeenActive` 为 false。
  - **解锁：** 可信点击后为 `running`，`hasBeenActive` 为 true。
  - **缓冲：** 两个精确采样的缓冲逐样本等于测试端按公式独立算出的 `Math.fround` 值：`u8` 单声道 8,000 Hz 长 5；`s16le` 双声道 22,050 Hz 长 3（含 −1、32767/32768 与 1/32768）。
  - **输出：** 循环方波峰值 0.500；`stop` 后峰值回到 0，发声数为 0，接入 `destination` 的节点数为 0；0.5 秒单次方波自然结束后同样回到 0。
  - **释放：** 在循环发声时 `dispose()`，快照为 disposed；上下文变为 `closed`，接入节点数由 1 变为 0；控制器添加的 7 个监听（`visibilitychange`、`pagehide`、`pageshow`、`statechange`、3 个 `ended`）全部移除；之后 `play` 返回 `disposed`。
    - 关闭后分析节点保留最后一帧（实测峰值仍为 0.5），所以无输出的证据是上下文已关闭且没有节点接入，不以峰值判断。
  - **不可用：** 删除 `AudioContext` 构造器后可信点击解锁，结果为 `unavailable`，`play` 返回 `audio-unavailable`。
  - **页面隐藏（headed，CDP 自建 context 与两个标签页，`Target.activateTarget`）：** 原生日志为 `hidden -> visible -> hidden -> visible`（第一项是标签页激活前的状态）。
    - **隐藏：** 发声（峰值 0.500）后隐藏，状态与上下文都为 `suspended`，发声数为 0，接入节点数为 0，`play` 返回 `audio-suspended`。
    - **恢复：** 回到可见后为 `running`，发声数与峰值都为 0，即不补播；之后新的发声可闻，释放后上下文关闭且监听为零。
  - **浏览器错误：** 各用例 `NativeTarget.errors` 为空。
- **回归：** `pnpm test:e2e` 全部 3 个项目通过（54 个）。`pnpm exec playwright test --project=development-headed`（native-lifecycle）通过。`pnpm check` 通过（102 个测试文件、2,976 个测试，构建成功）。
- **rubber-duck：** 指出释放后的无输出未被证明。已改为在循环发声时释放；并实测确认关闭后的分析节点保留最后一帧，因此改以“上下文已关闭，且没有节点接到 `destination`”作为证据，挂起时同理。工程约定中记录了这一测量限制。
- **simplify：**
  - **采纳：** 模块内部符号不再导出；精确采样作为参数传入页面，只保留一份；释放等待改用 `until`；`buffers(maxLength)` 先过滤再复制；`peak()` 复用缓冲。
  - **未采纳：** 共享页面模块加载器、共享浏览器生命周期源、通用 `withNativeTargets`，都要改动本子任务之外的既有模块；页面内的 `s16` 编码必须自包含，因为它会被序列化进页面。
- **文档影响：** [工程约定](../../../../engineering/README.md#本地浏览器-runner)新增音频播放一条：命令、自动播放开关的选择、原始 CDP evaluate、只读探针与测量限制、headed 隐藏路线。[源码结构指南](../../../../engineering/source-structure.md)新增 `browser-audio-controller.ts` 的目录项与说明。
