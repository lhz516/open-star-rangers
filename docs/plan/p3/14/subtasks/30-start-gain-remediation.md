---
type: plan
status: active
phase: P3
task: "14"
subtask: "30"
updated: 2026-10-29
---

# 30 — 发声开始时音量偶发未生效的排查（补救）

**契约来源：** [spec](../spec.md#控制器扩展边界) 的 S-03、AC-06；[D-01 定稿](../spec.md#d-01-定稿已批准)的播放器契约（初始参数在 `start()` 之前生效）。
**依赖：** 22。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 25 在私有真实内容运行 `nowing-3` 中观察到：3,373 个带参数的发声中有 1 个（10179，与前一次射击同 tick、同参数，晚 256 帧开始）在 `start()` 时音量增益读为 1 而不是 108/127；声像与速率正确，之后没有更新。53,040 次合成 Chrome 试验未复现，后续带 setter 记录的运行（108 个发声）也正常。
- 查明 [browser-audio-controller.ts](../../../../../src/platform/audio/browser-audio-controller.ts) 与 [audio-controller.ts](../../../../../src/platform/audio/audio-controller.ts) 中初始增益的设置方式（`.value`、自动化事件、节点连接与 `start()` 的先后）是否在某种时序下让初始值失效；若有此路径，改为与时序无关的设置并加回归测试。
- 若查明不可能出现（例如 25 的探针读法有误），给出证据并说明，不修改代码。

## 不包含

- 不改变 D-01 的参数契约与其他节点结构；不处理声像与速率。

## 写入范围

- `src/platform/audio/browser-audio-controller.ts`、`src/platform/audio/audio-controller.ts`：仅初始参数的设置时序。
- `src/platform/audio/*.test.ts`、`src/platform/audio/*.test-support.ts`：回归测试。
- `e2e/flight-audio.spec.ts`、`e2e/support/flight-audio.ts`、`e2e/support/audio-playback.ts`：仅在需要浏览器回归时。

## 验收标准

- [x] 给出原因结论（代码路径或探针误读）及证据。
- [x] 若为代码问题：已修复，初始增益在任何时序下于 `start()` 之前生效，有单元与浏览器回归；22 的输出探针仍通过。
- [x] 查看器既有行为不变。

## 验证方法

- `pnpm check`；开发与生产项目中 `e2e/flight-audio.spec.ts` 与 `audio-playback.spec.ts`，按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md)。

## 完成证据

- **结论（已确认，Chromium 源码 + 25 的录音拟合）：** 读数为 1 是 `value` getter 的读数，不是可闻增益。旧代码先把整张参数图接到 `destination`，再写四个 `.value`。Chromium 的 `AudioParam::setValue` 先存内在值，再插入 `setValueAtTime(v, currentTime)`。节点一旦接到输出，渲染线程每个量子都会拉取它；源还没启动时走 `ProcessOnlyAudioParams` → `CalculateTimelineValues`，做法是读内在值、算时间线、再写回内在值（`SetValue(ValuesForFrameRange(…, IntrinsicValue(), …))`），这一步不是原子的。如果主线程的写入恰好落在这次读和写回之间（此时时间线还没有事件，或 try-lock 失败），写回的就是旧的默认值 1。主线程的 getter 返回内在值，所以 `start()` 时读到 1。插入的 `SetValue` 事件仍在时间线上，从下一个量子起生效，也就是在源的第一个可闻量子之前（`start()` 在同一任务里、在写入之后调用）。佐证：25 的 `nowing-3` 中，该发声与它的同参数前一发声的 `start()` 墙钟只差 0.3 ms，上下文时间却前进了 256 帧，说明写入期间渲染线程正在连续出量子。对该窗口录音做最小二乘拟合，异常发声的左右增益为 [0.744, 0.486]，读数正常的同参数前一发声为 [0.731, 0.487]，比值约 1.0；如果可闻增益真是 1，比值应为 127/108 ≈ 1.18。53,040 次合成试验没有复现，与竞态窗口极窄一致。
- **加固（只改初始参数的设置时序）：** [browser-audio-controller.ts](../../../../../src/platform/audio/browser-audio-controller.ts) 的 `parameterGraph` 改为先写四个初值，再做任何 `connect()`。未连接的节点不会被渲染线程拉取，所以初值和 getter 读数都与时序无关。节点结构、固定发声、`setParameters`（`setValueAtTime`）和构造失败时的断开都不变。
- **回归：** [audio-playback.ts](../../../../../e2e/support/audio-playback.ts) 的探针记录应用每次 `AudioParam.value` 写入与每个节点第一次向后连接的先后，每个启动的源报告 `setAfterConnection`，即连接之后才写入的初始参数。[flight-audio.spec.ts](../../../../../e2e/flight-audio.spec.ts) 断言整个用例里所有源的该列表为空，并且至少有一个源的初始增益不为 1（偏离中央的僚机引擎）。
  - 先用旧顺序验证：开发和生产两个项目都失败，每个带参数的发声都列出 `playbackRate` 与 `gain 0..2`。修复后两个项目都通过，22 的输出拟合断言也照常通过。
  - 没有加 Node 单元测试：`browser-*` 模块按 [engineering-boundaries.test.ts](../../../../../tools/engineering-boundaries.test.ts) 不得进入 Node 测试程序。控制器层“参数先于 `start()`”已由既有单元测试覆盖（`FakeParameterVoice.initial`）。
- **检查：**
  - `pnpm check` 通过：445 个测试文件、11,900 个测试，构建成功。
  - `e2e/flight-audio.spec.ts` 在开发和生产项目中都通过。
  - `e2e/audio-playback.spec.ts`（只在开发项目中运行）3 个用例通过 2 个。有头的“真实隐藏”用例在未改动的基线上同样失败：有头窗口一开始就是 `hidden`，本机当时约 37 分钟无输入，属于环境问题。该用例只播放固定发声，不经过参数图。
- **查看器：** 固定发声的路径没有改动；`audio-playback` 中的解锁、精确缓冲和释放用例都通过。
- **Rubber-duck：** 没有阻塞或非阻塞问题。确认了诊断与旧顺序一致、重排不影响固定发声、`setParameters` 和失败清理，以及探针包装器与判据是确定性的。
- **Simplify：** 采纳两项：重新折行文档注释；`setAfterConnection` 改为对带标签的参数列表做一次 filter/map。未采纳三项：改用 `GainNode` 构造选项（覆盖不到源的 `playbackRate`，需要改调用方）；把探针包装器改为按需安装；复用较早取到的 `sources`。理由都是收益可以忽略。
- **文档影响：** [platform.md](../../../../engineering/modules/platform.md) 写的是“初值在 `start()` 前写入 `.value`”，仍然正确。更精确的“在连接之前”超出本子任务的写入范围，交协调者决定是否补充。`docs/original/` 与未知项不受影响。
