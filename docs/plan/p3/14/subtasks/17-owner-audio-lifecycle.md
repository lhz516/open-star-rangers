---
type: plan
status: active
phase: P3
task: "14"
subtask: "17"
updated: 2026-10-28
---

# 17 — 任务所有者音频与关闭屏障

**契约来源：** [spec](../spec.md#模式与生命周期) 的 S-08、AC-10、AC-11。
**依赖：** 16, 20。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 实现 media 消费者：等待 previousClosed 后创建控制器/加载同包内容，attachRun 连接 16，release 观察真实 close 并加入屏障。
- 按 D-02 的 DW-01、DW-11（D2-01、D2-14）：飞行消费者新增 `presentation()`，保存 `wireFlightRun` 返回的同一表现实例（含没有驾驶舱的分支），随运行结束撤回；媒体消费者的选项接收 `presentation` 取值函数，在 `attachRun` 中取得并核对 owner、run 与 tick 0，取得 20 增补后的实际 `FlightPresentation`；会话进入 `completed` 时与 `stopped`、`faulted` 一样立即失效。
- 暴露 D-01 的声音状态与可信操作入口供 18 使用；运行身份、主动暂停、隐藏、结果页和 stopped 的播放门禁与宿主状态独立。
- 可信操作异步完成仅在当前许可仍有效时恢复；跨 run/owner 的迟到 resume、ended、close 不改变新运行。
- 能力失败且清理成功可无声继续；内容、装配、挂起失败和清理锁存分别处理，部分创建回滚每步都尝试。

## 不包含

- 不让 media 消费者获得输入控制/step，不创建第二个 Session，不画 UI。

## 关键文件与契约

- 现有 [MissionOwnerConsumer/Connection](../../../../../src/app/mission/mission-owner.ts)、[mission-slot.ts](../../../../../src/app/composition/mission-slot.ts)及所有权测试。
- 计划新增 `src/app/flight-audio/owner.ts`、`owner.test.ts`；UI 只读其状态并调用明确操作。

## 写入范围

- `src/app/flight-audio/owner.ts`：所有者级声音连接。
- `src/app/flight-audio/owner.test.ts`：生命周期/身份/异步失败。
- `src/app/mission/mission-owner.ts`：仅 D-01 获批的操作接线。
- `src/app/mission/mission-owner-ownership.test.ts`：media 和屏障回归。
- `src/app/mission/mission-owner-input.test.ts`：p/菜单恢复不旁路。
- `src/app/composition/mission-slot.ts`：仅必要关闭屏障接线。
- `src/app/composition/mission-slot.test.ts`：新旧所有者隔离。
- `docs/engineering/modules/app.md`：所有权与错误说明。
- `src/app/mission/flight-consumer.ts`：新增 `presentation()` 取得同一表现实例（D2-01，协调者 2026-10-28 扩展）。
- `src/app/mission/flight-consumer.test.ts`：同上的测试。

## 验收标准

- [x] 每 owner 至多一个控制器/上下文，等待屏障有状态，先前关闭失败锁存。
- [x] 所有模式、快速暂停恢复、暂停中隐藏和晚回调都保持门禁；结果页和停止后无飞行声音。
- [x] 同步/异步取得和清理错误分级准确，不吞异常、不由再次打开页面绕过锁存。

## 验证方法

- 使用 mission/session 现有假宿主，关闭成功/拒绝/悬置和多 run 组合；`pnpm test -- src/app/flight-audio/owner.test.ts src/app/mission/mission-owner-ownership.test.ts src/app/mission/mission-owner-input.test.ts src/app/composition/mission-slot.test.ts`、`pnpm check`。
- 对本项调用 [simplify](../../../../../.agents/skills/simplify/SKILL.md)；真实激活与 HMR 归 22/23。

## 完成证据

- **实现：** [owner.ts](../../../../../src/app/flight-audio/owner.ts) 的 `createFlightAudioConsumer({ holder, audio, lifecycle, presentation, reportError, record? })` 是 `media` 消费者：连接时绑定同包声音（`bindFlightSounds`），`previousClosed` 兑现为 true 且存活凭证仍有效（未释放、持有者仍是同一份包）才创建控制器并 `load` `audio` 组的全部 sound；之前为 `waiting-close`，兑现为 false 为 `failed`。运行级消费者拿到所有者的延迟控制器（控制器出现前如 idle、失败后如 failed，之后转发真实控制器），所以屏障通过前接线的运行在之后的可信激活后也有声音。`onActivation` 同步 `unlock()`，会话为 running 或 transition 时再 `resume()`；paused 通知中同步 `pause()`，在暂停期间创建的控制器立即 `pause()`；`completed`、`stopped`、`faulted` 通知中当前运行的声音立即失效（D2-14），exit/dispose 经 `ownCleanup`。`release()` 同步 `dispose()` 并总是返回 promise：包装的能力观察 `close()`，确认后兑现，被拒绝、同步抛错或未关闭以 `FlightSoundCloseError` 拒绝（槽位锁存），没有上下文时立即兑现。[mission-owner.ts](../../../../../src/app/mission/mission-owner.ts) 增加 `MissionSoundStatus`、`MissionActivationCause`、连接的 `onActivation?`/`sound?`、上下文的 `soundChanged?`、快照的 `sound` 与意图 `enableSound()`；`start`（世界创建且出发保持接好之后）、`resume`（含 `togglePause` 的继续）、`continueFromMenu`（菜单关闭之后）与 `enableSound` 在会话控制之后同步激活 `media` 连接，钩子抛错经 `reportError` 并显示 `failed`，不改变动作结果；`enableSound` 只在 transition/running/paused/stopped 生效，不清除 `actionError`。[flight-consumer.ts](../../../../../src/app/mission/flight-consumer.ts) 新增 `presentation()`（D2-01），有无驾驶舱都保存 `wireFlightRun` 的同一表现模块，随运行撤回。`mission-slot.ts` 无需改动：既有屏障累加已满足。
- **解释性选择（报告协调者）：** (1) 激活在会话为 `transition` 时也 `resume()`（spec 写“running 时”）：保持不关闭门禁，否则从暂停菜单重开后的新运行门禁一直关闭；(2) 没有报告声音的 `media` 连接时快照 `sound` 为 `unavailable`；(3) `soundChanged` 为可选字段，因写入范围外的 `src/ui/game-input/map-input-entry.test-support.tsx` 手工构造上下文，所有者总是给出；(4) 声音绑定失败时不接运行声音，游戏无声继续。
- **测试：** `pnpm test -- src/app/flight-audio/owner.test.ts src/app/mission/mission-owner-ownership.test.ts src/app/mission/mission-owner-input.test.ts src/app/composition/mission-slot.test.ts src/app/mission/flight-consumer.test.ts` 通过（owner 20 项：屏障前不创建/`load`、屏障后一次载入且只在可信开始中创建上下文、屏障前接线的运行在激活后发声、重开不重复创建；开始处理函数内 `transition` 中创建上下文；无 Web Audio 为 `unavailable` 而游戏继续；暂停通知中挂起、隐藏又可见不恢复、只有可信继续打开门禁；快速暂停恢复保留发声、暂停中隐藏释放发声且显示不恢复；菜单中启用声音不继续游戏、不关菜单、保留错误，Continue 打开门禁；暂停中创建的控制器关闭门禁；`completed`、`faulted`、录制容量 `stopped` 时立即停止全部发声；重开时随运行结束、旧运行迟到的结束不影响新运行；表现模块缺失使开始回滚；绑定失败与 `load` 失败为 `failed` 并报告；屏障兑现前释放所有者或替换资源包后兑现为 true/false 都创建计数为 0、`release()` 不延迟；屏障锁存为 `failed`；关闭 resolve/pending/reject/throw 下下一所有者分别为可激活/等待/失败且锁存、重开页面不绕过、旧上下文迟到的状态不影响；连接的 `release()` 总是 promise。所有权测试：激活在会话控制之后、次序与适用阶段、失败的开始不激活、钩子抛错报告且结果不变、`sound` 的来源与发布。输入测试：`p` 的继续与 Continue 激活，暂停、菜单中与被拒绝的继续不激活。槽位测试：中间所有者也不越过第一个所有者未确认的关闭。飞行消费者测试：有无驾驶舱的 `presentation()` 与撤回）。`pnpm check` 见协调者报告。
- **rubber-duck：** 一项阻断：无上下文时 `release()` 返回 undefined 而非 thenable；已改为总是返回 promise 并加连接级测试。其余（屏障、延迟控制器、激活次序、门禁、失效、错误分类）无问题。
- **simplify：** 采纳：失败状态只存于延迟控制器；`#changed` 经端口单一订阅；`#create` 的三处失败出口合并为 `#loadedController()`；去掉未用参数；屏障等待的测试装配合并为 `waiting()`。未采纳：与 `viewer-audio.ts` 的关闭观察与声音记录读取重复（该文件在写入范围外，可作后续共用）；以挂起运行代替延迟控制器（P3 只在 tick 0 接线）；`clearsError` 标志与可选 `soundChanged`（见上）。
- **文档影响：** [app 分册](../../../../engineering/modules/app.md)更新任务所有者（快照 `sound`、`enableSound`、消费者钩子）、飞行画面（`presentation()`）并新增“飞行音效”一节；其余文档（STATUS、tasks、平台分册）无需变更。
