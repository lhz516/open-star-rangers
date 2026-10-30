---
type: plan
status: active
phase: P3
task: "14"
subtask: "22"
updated: 2026-10-28
---

# 22 — 开发与生产浏览器音频输出

**契约来源：** [spec](../spec.md#验证策略) 的 S-03、S-09、S-10、AC-06、AC-11、AC-12、AC-14。
**依赖：** 18, 19, 20。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 用合成任务包扩展现有浏览器探针，测最终输出路径的波形/左右声道、参数变化和源采样进度，而非只读取源缓冲或 start。
- 独立浏览器强制激活策略，CDP 无激活读法验证锁定，可信点击后解锁；p、菜单、Tab/焦点及 audio-unavailable 有明确 UI 结果。
- 覆盖 none/whole/repeat、初始参数先于 start、运行中变速/暂停；期望信号与窗口误差按采样率/粒度预先确定。
- 开发使用测试入口，生产用隔离合成缓存和真实恢复。生产无 DEV 日志/调试入口，无新增网络外传。

## 不包含

- 不使用原版内容作公开 fixture，不设置生产调试开关；原生隐藏/往返平衡集中在 23。

## 关键文件与契约

- 现有 [audio-playback.ts](../../../../../e2e/support/audio-playback.ts)、[browser-probes.ts](../../../../../e2e/support/browser-probes.ts)、[production-cache.ts](../../../../../e2e/support/production-cache.ts)。
- 计划新增 `e2e/flight-audio.spec.ts`（两种构建）、`flight-audio.development.spec.ts`（仅开发能力注入）与 `support/flight-audio.ts`。

## 写入范围

- `e2e/flight-audio.spec.ts`：开发/生产输出。
- `e2e/flight-audio.development.spec.ts`：锁定/故障/DEV 边界。
- `e2e/support/flight-audio.ts`：合成场景操作和只读音频取证。
- `e2e/support/audio-playback.ts`：必要的最终输出/参数探针复用。
- `e2e/support/browser-probes.ts`：只读资源探针的必要扩展。
- `src/app/app-entry.test-support.tsx`：仅开发测试能力注入。
- `src/workers/synthetic-import.test-support.ts`：合成声音/场景资料。
- `tools/e2e-configuration.test.ts`：新用例的 runner 归属回归。

## 验收标准

- [x] 两种构建都有真实非零输出和参数效果证据，控制器暂停后源进度冻结。
- [x] 锁定/启用、p/菜单、焦点和能力失败行为符合 AC-11；生产无日志或测试后门。
- [x] 样本完全自建，网络审计通过，探针不改变被测控制流。

## 验证方法

- 必须使用 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md)；`pnpm test:e2e --project=development --project=production e2e/flight-audio.spec.ts e2e/flight-audio.development.spec.ts`。
- 修改测试支持后 `pnpm check`；挂起/关闭 analyser 缓存不能作为实时静音证据。对本项测试代码调用 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据

- **探针（2026-10-28）：** [audio-playback.ts](../../../../../e2e/support/audio-playback.ts) 的 `installAudioProbe` 为每个上下文另加一路分接：显式 2 声道、`speakers` 上混的增益节点 → 声道分离 → 左右各一个 4096 帧的 `AnalyserNode` → 增益 0 → `destination`，与应用接到 `destination` 的每个连接并联，不改变输出。它记录应用节点的连接，在 `start()` 时取源之后的 GainNode（音量、左、右）与 `playbackRate` 的当时值（`initial`），以 WeakRef 跟踪直到应用 `disconnect()`（`end` 记上下文时间）；`capture()` 一次读出两声道最近窗口、活动声部当前参数与已启动源数。不注册监听、不强持节点，也不包装参数方法。`withAudioTargets` 增加 `path` 与 `audit` 选项（网络审计在导航前接入自建浏览器的标签页）。
- **期望与判据：** [flight-audio.ts](../../../../../e2e/support/flight-audio.ts) 从合成夹具 `productionSoundEntries()` 按 audio.md 的 SND 布局独立解码 `sound/model-clip/01`（引擎）与 `sound/missile` 的采样（不经转换器），先断言探针缓冲与之逐样本相同。期望输出为该循环按 stride = playbackRate × 缓冲采样率 ÷ 上下文采样率做线性插值、乘音量增益与该声道增益；只搜索起始相位。Chrome 的输出与之一致到 float32 舍入：两种构建的每个 4096 帧窗口相对残差约 2–4e−8，阈值取 1e−3；错误 stride 残差 > 0.3。“稳定窗口”要求相隔一个窗口以上两次读取之间上下文运行、无源启停、所有声部参数不变。挂起时不用分析器峰值，用上下文 `state` 与 `currentTime` 停止。
- **[flight-audio.spec.ts](../../../../../e2e/flight-audio.spec.ts)（development 用测试入口导入 `mission-startable`；production 经隔离合成缓存恢复，均有网络审计）：** 可信点击开始后外壳状态 `available`（`role="status"`），无按钮。第一次运行带僚机：`\`（速度 0）使玩家引擎音量为 0，僚机引擎为唯一可闻声部，左右声道分别以各自增益拟合（开发 volume 69/pan 32，生产 66/36；增益与 A-09 的整数音量/声像一致），左右 RMS 比等于增益比。返回主菜单后上下文 `closed`。第二次运行无僚机：玩家引擎 `initial` 为 rate 19000（A-05 满速）、增益 [1,1,1]，即参数在 `start()` 前已入图；两声道相同且拟合；Shift+5 使同一声部变为 10000 Hz，输出周期随之改变（旧 stride 不再拟合）；速度 0 时声部仍在、两声道 RMS 恰为 0；`Backspace` 恢复 19000 Hz。引擎静音时 Space 发射导弹：一次性源 `initial` 为 [1,1,1]、playbackRate 1，捕获窗口中它在两声道逐帧拟合（残差 0，前后静音），自然结束（无 `stop`，`end` 已记）。`p` 暂停：状态 `paused`，上下文 `suspended`，`currentTime` 500 ms 不变，声部与参数、已启动数不变；再按 `p` 后时钟前进，同一引擎源（`end` 仍为 null）继续发声，没有重新启动。Esc 菜单显示 `paused`，Continue 后状态 `available`（开发 54 ms、生产 36 ms），整个运行只有一个循环源。开发日志的 `started` 条数等于探针看到的源启动数，并给出 `sound/model-clip/01 · entity 1 slot 0 · class 5 · started · volume=127 rate=19000` 与导弹的 slot 项；生产没有 `mission-dev-panel` 或任何 `dev-*` 元素。
- **[flight-audio.development.spec.ts](../../../../../e2e/flight-audio.development.spec.ts)：** 自建 Chrome（`--autoplay-policy=document-user-activation-required`，原始 CDP，无激活脚本点击与 `DOM.setFileInputFiles` 导入）。(1) 锁定：`hasBeenActive` 为 false，状态 `needs-activation`、“Enable sound”，tick 前进（无声继续），探针 0 个源启动、0 个路由、上下文仅 `suspended`；Esc（不给激活）打开菜单，状态与按钮相同；菜单中可信点击 “Enable sound” 后 `hasBeenActive` 为 true，但菜单仍开、tick 不变、状态仍 `needs-activation`、按钮与焦点保留、无源启动（只尝试取得能力）；可信点击 Continue 后 `available`、按钮消失、焦点到输入区，引擎两声道 RMS 0.54；`p` 使上下文挂起且时钟停止，再按 `p` 恢复且同一声部继续。(2) 键盘：锁定时从输入区按 Tab 一次即到 “Enable sound”，Enter 后 `available`、焦点回到输入区并有输出。(3) `audio=unavailable`：状态 “Sound: unavailable in this browser; the mission continues without sound.”，无按钮，焦点留在输入区，tick 前进，没有构造任何 AudioContext、没有源；日志只有 `failed (audio-unavailable)` 而无 `started`；`p`、菜单（同一状态、无按钮）与 Continue 照常。
- **协调者交来的三项观察：** (a) 已复现并断言为可见无操作（见上）。(b) 未复现：锁定期间开发日志记录了每次尝试，如 tick 2 起引擎 `failed (audio-locked) · volume=127 rate=19000` 每 12 时钟单位重试一次、tick 3 的 `sound/event/target-select` by-id `failed (audio-locked)` 仅一次（不排队、不重试），测试据此断言。18 的 0 条可能因其冒烟在 tick 2 之前读取或未进入飞行，现有代码无需修改。(c) 所有状态断言都用轮询等待；本次多次运行中 Continue 后状态在 36–64 ms 内变为 `available`，未复现首读 `paused`。
- **未覆盖：** `repeat`（SND 10181，Warp 到达且附近有敌）在 `mission-startable` 中不可达：两次 Warp（第二次回到出发区）的 `warp-completed` 都是 `hostileNear: false`。新增能触发它的合成场景需要改 `import-scenarios.test-support.ts` 的 `IMPORT_SCENARIOS`，不在本项写入范围，已交协调者。控制器的 `repeat` 真实输出与遍数仍由 [version-4-viewer.spec.ts](../../../../../e2e/version-4-viewer.spec.ts) 覆盖，飞行中的触发由 Node 规则集成测试覆盖。原生隐藏与三次往返的资源平衡归 23。
- **检查：** `pnpm check` 通过。`pnpm test:e2e --project=development --project=production e2e/flight-audio.spec.ts e2e/flight-audio.development.spec.ts audio-playback.spec.ts version-4-viewer.spec.ts resource-balance-controls.spec.ts production-preview.spec.ts`：22 项通过（含 headed 隐藏用例）。另跑使用该探针的 fast-refresh、failure-input-content、joint-pipeline 两个构建：仅 `fast-refresh.spec.ts:205`（输入区 keyboard 组监听 12 ≠ 9，多出飞行音频的 pagehide/pageshow）与 `joint-pipeline.development.spec.ts:545`（任务后上下文 2 ≠ 1）失败。恢复原探针、移除新文件后在基线 d43f7923 上同样失败，属 18 集成带来的既有失败，已交协调者。[e2e-configuration.test.ts](../../../../../tools/e2e-configuration.test.ts) 固定新用例的项目归属（`flight-audio.spec.ts` 两个项目，`.development` 只在开发）。
- **审查：** rubber-duck 的四项。(1) 期望取自被测图：已改为从夹具独立解码采样并断言缓冲，固定 19000 Hz、[1,1,1] 与音量 0；僚机增益须符合 A-09 的整数音量/声像。Shift+5 的具体速率与放置律留给 Node 测试，浏览器只断言为整数且在 3000–19000 之间。(2) `none` 未测输出：已加导弹一次性的逐帧输出拟合；`repeat` 不可达，见上。(3) 三次往返的音频资源平衡：属 23 的写入范围（joint-resources），未在此处做。(4) 菜单中 “Enable sound” 无法在浏览器中证明调用了处理器（控制器在暂停门禁下直接返回，无可观察结果）：按钮调用 `enableSound` 由 18 的组件与所有者测试负责，此处证明不继续、不播放。另修正 `audible` 对单侧声像声部的误判。simplify：删去未被读取的参数自动化记录及其 `setValueAtTime` 包装，`steadyCapture` 首读不传采样，连接记录跳过探针自身节点，取消多余导出。未合并各 spec 中重复的原生导入与按键辅助（涉及范围外文件）。
- **文档影响：** [engineering/README.md](../../../../engineering/README.md) 的“只读探针”一节应补上分声道分接、`capture()`、`initial`/`end` 与 WeakRef 跟踪，并修订“不保留节点”的表述。该文件不在本项写入范围，已交协调者。STATUS 与 tasks.md 无需变化。

