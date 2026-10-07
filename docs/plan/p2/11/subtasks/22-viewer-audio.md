---
type: plan
status: active
phase: P2
task: "11"
subtask: "22"
updated: 2026-10-06
---

# 22 — 查看器的试听与音频关闭观察

**契约来源：** [spec](../spec.md) 的 S-08（试听）、S-12（音频上下文的 `close()` 观察）、AC-15（Node），以及[行为与边界](../spec.md#行为与边界)中的试听行。查看器所有者与 GPU 归 [10](./10-viewer-owner-audio.md)。
**依赖：** 02。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 新增 DOM-free 的查看器音频（`src/app/viewer/`），由 10 的查看器所有者创建与释放：
  - **观察关闭：** 应用包装的音频能力记录上下文 `close()` 的完成或拒绝。释放以它判断“已关闭”，不以控制器的 `disposed` 快照代替；释放的结果是“没有上下文”“已关闭”或“关闭被拒绝（附原因）”，供 10 锁存。
  - **声音列表：** 从资源包完整的 `audio` 组载入声音（`SoundRecord`），列出的声音与组内 Asset 一一对应；载入失败如实报告。
  - **试听：** 可信点击时调用 `unlock()`，并记下一次待播放意图；控制器进入 `running` 后播放一次。停止、页面隐藏、取消（离开或替换资源包时由所有者调用）与释放都取消该意图，迟到的 `running` 不再播放。控制器本身不排队（P2-08）。
  - **停止：** 停止单个声音与全部声音。
  - **快照与订阅：** 冻结快照含控制器状态、声音列表、发声数与待播放意图；同步通知订阅者，抛错交给 `reportError`。
- Node 测试（伪造的音频能力与页面生命周期）：
  - 延迟解锁只播放一次；已在 `running` 时直接播放；
  - 进入 `running` 之前停止、隐藏、取消或释放后，迟到的 `running` 不播放；
  - `close()` 延迟完成、被拒绝、同步抛错；没有创建上下文时释放；
  - 声音列表与 `audio` 组一一对应；没有 `audio` 组时列表为空；
  - 不可用的音频能力：显示原因，载入与试听如实失败。

## 不包含

- 查看器所有者、GPU、锁存与生命周期（10）；React 页面与 E2E（11）。
- 修改 P2-08 的控制器契约。

## 关键文件与契约

- 计划新增 `src/app/viewer/` 的音频模块与相邻测试。
- 复用：[audio-controller.ts](../../../../../src/platform/audio/audio-controller.ts)（`createAudioController`、`AudioCapability`、`AudioContextPort`、`PageLifecycleHost`、`SoundRecord`）、06 的应用端口 `audio`、02 的资源包形状。

## 验收标准

- [x] AC-15（Node，音频部分）：延迟解锁只播放一次；取消后迟到的 `running` 不播放；`close()` 的完成与拒绝由包装观察；声音列表与 `audio` 组一一对应；不可用的音频能力如实报告。
- [x] `app/viewer/` 不导入 `original-data`、DOM 或 React；`pnpm check` 通过。

## 验证方法

- `pnpm exec vitest run src/app tools/engineering-boundaries.test.ts`，完成前 `pnpm check`。
- 浏览器部分见 11。按 execute-goal 做 rubber-duck 与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据

- **实现：** [viewer-audio.ts](../../../../../src/app/viewer/viewer-audio.ts) 的 `createViewerAudio(options, audioGroup)`：
  - 为一份资源包创建 P2-08 控制器，载入完整 `audio` 组的全部声音，快照列出每个 sound Asset 的 ID 与角色；
  - `audition` 在 `running` 时立即播放，否则记下一次待播放意图，进入 `running` 时恰好播放一次；停止、取消、页面隐藏、`pagehide`、控制器失败与释放都丢弃该意图；
  - 包装音频能力，记录上下文 `close()` 的结果；`dispose()` 返回同一个 promise，结果为 `no-context`、`closed` 或 `close-failed`（附原因）；
  - 经包装取得每个新发声的端口并监听其结束，`stop(id)` 只停止仍在播放的本声音发声。
- **测试支持：** P2-08 控制器测试的宿主替身移到 [audio-controller.test-support.ts](../../../../../src/platform/audio/audio-controller.test-support.ts)，`FakeContext.closing` 可设为拒绝（默认，原有测试不变）、完成、悬置或同步抛错。
- **测试：** [viewer-audio.test.ts](../../../../../src/app/viewer/viewer-audio.test.ts) 共 24 条：
  - **声音列表：** 与合成 `audio` 组的 5 个 Asset 一一对应（ID 与角色），全部载入；没有组时列表为空、载入为 null，试听报 `unknown-sound`；缓冲创建失败时如实报告 `audio-failed`。
  - **试听：**
    - `running` 时立即播放；延迟解锁时只播放一次，后一次点击取代前一次，之后的挂起与恢复不重播；
    - 停止该声音、停止全部、取消、释放、页面隐藏、`pagehide` 之后，迟到的 `running` 都不播放；上下文关闭使控制器失败时丢弃意图；
    - 不可用的音频能力报 `audio-unavailable`，载入不受影响。
  - **停止与发声：** `stop(id)` 只停止该声音的发声，`stopAll` 停止全部；订阅者在发声开始的通知中即可停止它（证伪：去掉播放期间的保护后该测试失败）；结束的发声被删除，正在播放的发声不受影响，其结束监听在停止后撤销。
  - **关闭观察：**
    - 从未解锁时为 `no-context`；
    - `close()` 完成、拒绝、同步抛错分别得到 `closed`、`close-failed`、`close-failed`，`close()` 只调用一次，页面生命周期监听全部撤销；
    - 悬置的关闭不会被当作完成；宿主已关闭的上下文不再调用 `close()`，算作 `closed`；
    - 释放后不再通知订阅者，试听报 `disposed`。
- **边界：** [engineering-boundaries.test.ts](../../../../../tools/engineering-boundaries.test.ts) 的 DOM-free 检查扩展到 `app/viewer/`。
- **检查：**
  - `pnpm exec vitest run src/app/viewer src/platform/audio`：64 条通过；
  - `pnpm check`：149 个文件 4,434 条测试，构建通过。
- **Rubber-duck：** 没有阻塞问题。两项非阻塞问题均已采纳：
  - 控制器在 `play()` 返回之前就通知，订阅者此时停止会找不到发声：播放期间不发布，并补测试；
  - 已结束的发声只在全部结束时清除，有循环声音时会累积：改为监听每个发声的结束，并补测试。
- **Simplify：** 采纳一项：发布前先比较字段，再构建快照。

  未采纳：
  - 抽出通用的订阅与通知工具：需要改动 02 与作业持有者；
  - 复用 `render/scene/cleanup.ts` 的 `attemptAll`：`app/viewer/` 不能导入 `render/`。
- **文档影响：** [源码结构](../../../../engineering/source-structure.md)新增“查看器音频”一节，当前目录加入 `app/viewer/`。工程约定与 STATUS 无需改动。
