---
type: plan
status: active
phase: P3
task: "14"
subtask: "11"
updated: 2026-10-17
---

# 11 — 保留进度的暂停与宿主中断

**契约来源：** [spec](../spec.md#模式与生命周期) 的 S-03、S-08、AC-06、AC-10。
**依赖：** 10。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 在 10 的进度/句柄基础上实现任务暂停门禁：主动暂停保留播放位置，resume 只在许可仍有效时恢复。
- 隐藏/pagehide/非预期中断无条件丢弃旧声音，包含主动暂停中和 suspend 尚未完成的情况；可见性或上下文自行恢复不打开任务门禁。
- 处理快速 pause/resume、迟到 promise、挂起失败、关闭和重复清理；平台不读取 owner/run，而以 D-01 的许可/撤销接口接受消费者控制。
- 不启用任务门禁的查看器仍遵循既有隐藏释放/显示后恢复上下文且不重播的行为。

## 不包含

- 不选择哪些循环需要重建（16），不决定任务页面（17/18），不改变 Session 控制语义。

## 关键文件与契约

- 现有 [audio-controller.ts](../../../../../src/platform/audio/audio-controller.ts) 的状态跟随、hide/show 与 release；10 新增的进度/能力契约。
- 现有 [audio-controller.test.ts](../../../../../src/platform/audio/audio-controller.test.ts) 包含隐藏和迟到 resume 回归。

## 写入范围

- `src/platform/audio/**`：暂停/恢复、中断与能力替身测试。
- `src/app/viewer/viewer-audio.test.ts`：未启用新门禁时的兼容。
- `docs/engineering/modules/platform.md`：暂停/中断契约。
- `src/ui/viewer/ViewerAudioPanel.tsx`：仅在穷举状态文案中加入 `paused`（按 P2-08 修订，文案同 `suspended`；协调者 2026-10-17 扩展）。
- `src/app/flight-audio/voices.test.ts`：仅为控制器替身补上 `pause`/`resume`（集成 12 后的类型穷举；协调者 2026-10-17 扩展）。

## 验收标准

- [x] 主动暂停后的三种播放模式从原进度继续；暂停不消耗有限重复剩余量。
- [x] 暂停中隐藏仍释放所有节点；迟到恢复不能让门禁关闭时输出。
- [x] 宿主异常与清理失败明确上报，查看器旧行为不变，所有相关测试通过。

## 验证方法

- 假 promise 完成顺序、context.state 与采样时钟联合断言；`pnpm test -- src/platform/audio src/app/viewer/viewer-audio.test.ts`、`pnpm check`。
- [simplify](../../../../../.agents/skills/simplify/SKILL.md)只处理本项；原生可见性在 23 验证，不能由假事件代替。

## 完成证据

- **实现：** [audio-controller.ts](../../../../../src/platform/audio/audio-controller.ts) 加入 `pause()`/`resume()`、状态 `paused`、错误码 `audio-paused` 与 `AudioPauseError`（只带宿主错误名称）。门禁由控制器自己的 `#gateClosed` 决定，与 `AudioContext.state` 无关；`#pauseRequest` 记下门禁最近一次 `suspend()` 及其是否落地（观察到 `suspended` 或 Promise 兑现）。只有它保留发声：落地前的 `running` 视为暂停前发出的恢复而等待；落地后门禁关闭时的 `running`（迟到或自行恢复）、`interrupted`、非本次请求的挂起都以 `released` 释放，门禁关闭时状态仍为 `paused` 并再次挂起，关闭为 `failed`。`suspend()` 同步抛错或 rejected 时释放、报告、`failed`；已被取代、门禁打开后已运行或已释放后的迟到结果被忽略。`resume()` 只在可见时打开门禁，状态等 `statechange` 回到 `running`（从未运行过的上下文为 `locked`）；门禁关闭时 `unlock()` 只创建上下文（创建即运行的立即再挂起），不恢复。门禁关闭时隐藏释放全部发声、状态不变，显示不恢复；门禁打开时（含继续后等待运行）隐藏、浏览器挂起或中断与修订前相同。查看器状态文案把 `paused` 当作 `suspended`（[ViewerAudioPanel.tsx](../../../../../src/ui/viewer/ViewerAudioPanel.tsx)，写入范围经协调者扩展，提交 79363615）。
- **测试：** [audio-controller.test.ts](../../../../../src/platform/audio/audio-controller.test.ts) 的“task pause gate”一组 18 个用例，假能力（[test-support](../../../../../src/platform/audio/audio-controller.test-support.ts)）可逐次兑现/拒绝 `suspend()` 或令其同步抛错，与 `context.state`、`currentTime` 联合断言：`none`/`whole`/`repeat` 暂停中不 stop、不 disconnect、不重排，继续后同一句柄为 `playing`、无重播；暂停中于冻结的上下文时间更新速率，`repeat` 剩余量按 800/3000 源帧继续（`stop 1.1 + 2200/16000`）；暂停中隐藏释放全部并保持 `paused`，显示、隐藏时的 `resume()`、`unlock()` 都不恢复；暂停后 → `interrupted`、`suspend()` 未兑现时 `interrupted`/`closed`、落地后迟到 `running`（释放并再挂起，`play` 仍为 `audio-paused`）、`locked` 时暂停后迟到的 `running`；快速 pause/resume（落地前的 `running`、Promise 先于 `statechange` 兑现的 Chromium 次序、无状态变化时由兑现解开）；挂起同步抛错与 rejected 只报告 `AudioPauseError { hostError: 'InvalidStateError' }`、不含宿主消息；迟到结果在重新运行与 dispose 后被忽略。[viewer-audio.test.ts](../../../../../src/app/viewer/viewer-audio.test.ts) 新增用例：不用门禁时隐藏、浏览器中断与迟到的挂起 rejected 只出现 `running`/`suspended`，挂起/恢复次数与修订前相同，不报告。关键分支的变异（去掉“落地前等待”或“本次挂起保留”）使新用例失败。
- **命令：** `pnpm exec vitest run src/platform/audio src/app/viewer/viewer-audio.test.ts`（124 通过）；`pnpm check` 通过。
- **Rubber-duck：** 唯一发现是“挂起尚未落地时浏览器自行挂起会被当作本次暂停的挂起”。未采纳：Web Audio 对已挂起的上下文不再派发 `statechange`，事件不带原因，Chromium 在 `suspend()` 内同步改变 `state` 并立即兑现 Promise，两者在事件与 Promise 上都无法区分，推迟到兑现再判定也一样；契约列出的可区分情形（`interrupted`、关闭、落地后的再次挂起/运行）都已覆盖。为此补充了 Promise 先于 `statechange` 的次序用例。
- **Simplify：** 采纳：抽出 `#release()`（释放并发布，状态不变），`#requestPause` 只读一次上下文，迟到恢复时先改状态再释放。未采纳：把 `errorName` 提为跨模块共享 helper（需改写入范围外的 storage/browser 模块）；查看器文案常量（超出批准的单行范围）；把门禁改写为统一的期望状态调和器（较大重构，现有分支与契约表逐行对应）；`play`/`update` 的既有分配与 `#publish` 复制（修订前已有，不在本项）。
- **文档影响：** [platform.md](../../../../engineering/modules/platform.md) 增加“任务暂停门禁”一节并更新状态、结束原因、错误码、快照、错误转交与假能力的说明。`docs/original/`、unknowns、ADR 无需更新（不涉原版事实或冻结决定）；原生可见性与真实浏览器在 23 验证。
