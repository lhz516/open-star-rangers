---
type: plan
status: active
phase: P1
task: "06"
subtask: "04"
updated: 2026-10-02
---

# 04 — 取消、故障未确认与会话控制

**契约来源：** [spec](../spec.md) 的 S-02、S-04、S-05、S-07，AC-03（取消/故障部分）、AC-07、AC-08、AC-09（控制、cleanupFailed 与 sessionError）、AC-10（Node 部分），以及“控件可用性”与技术决定 5、6。
**依赖：** 03。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 在运行接线中订阅 `onCommandsCancelled`。
  - 只把与当前 owner、当前运行 pending 匹配的 ID 按通知 FIFO 转为 cancelled，携带 Session 原 reason，并立即写入。
  - 覆盖 user-pause、hidden、restart、exit、dispose、failure 六种 reason。
  - 未出现的 ID 不臆测为取消；取消不是 Core 拒绝。
- 当前运行进入 faulted 时（Session 按取消→清理→状态的顺序通知）：
  - 剩余 pending 标为 `unconfirmed/session-failed`，与同次 failure 取消并存于 recentResults。
  - 已有终态不被覆盖，不自动重提。
  - 保留并在必要时立即发布最后成功投影。
- 运行切换：
  - 新运行开始或 exit 回到 idle 时，清空 pending 与 recentResults。
  - 旧运行的取消结果在清空前写入，可由同步订阅观察。
  - 新运行的相同 commandId、另一个 owner 的相同 runId 都不能写入当前 owner 视图。
- 新建控制模块：
  - 按 spec“控件可用性”从 status 纯函数推导 start/pause/resume/restart/exit 与 add/remove 是否可用。
  - 控制 action 直接调用 `session.control`。每次尝试开始时清空 actionError；同步失败写入 `actionError {operation: control type, cause}`，不在 UI 放宽 Session 判定。
  - cleanupFailed 在 error 被替换后仍禁用 start/restart；exit 仍可用；disposed 时全部禁用。

## 不包含

- replay 对照（05）、owner 装配与卸载清理（06）、按钮渲染与“重新加载页面”提示（07）。
- 修改 Session 的取消顺序、错误类型或状态表。

## 关键文件与契约

- [synthetic-session.ts](../../../../../src/app/session/synthetic-session.ts) 的 `SessionCommandsCancelled`、`SessionControl`、`SyntheticSession.control`（已有，只读复用）。
- [会话故障测试](../../../../../src/app/session/synthetic-session-fault.test.ts)：在 Vitest 创建边界注入 Core step 失败的先例。
- `src/ui/game/synthetic-command-feedback.ts`（03 计划新增，本项扩展）。
- 计划新增：`src/ui/game/synthetic-game-controls.ts`、`src/ui/game/synthetic-game-controls.test.ts`、`src/ui/game/synthetic-command-outcomes.test.ts`。

## 验收标准

- [x] AC-07：六种 reason 都按通知 ID、reason 与 FIFO 终结，不变成拒绝。新运行不继承旧 pending/recentResults；迟到旧通知无效；同一 commandId 在新运行中重用、两个 owner 的 runId 都为 1 时互不写入。
- [x] AC-08：补跑第二 tick 失败、首 tick 已提交时，最后成功投影反映该提交。剩余 pending 为 unconfirmed/session-failed，与同次 failure 取消并存；已收到的终态不被覆盖；无 pending 悬挂或自动重提。
- [x] AC-03（取消/故障部分）：采样窗内的取消与故障在同一通知边界同步写入，且故障时没有伪造成功帧。
- [x] AC-09（控制部分）：非法控制的同步失败写入 actionError 并保留原 cause；sessionError 与 actionError 分开；cleanupFailed 在 error 替换后仍阻止 start/restart，exit 仍可执行。
- [x] AC-10（Node）：可用性逐项与 spec 一致，包括 hidden 时 paused 运行的 resume 禁用；暂停时未执行命令被取消；返回可见仍为 paused。
- [x] 目标 Vitest 与 `pnpm check` 通过，模块 DOM-free。

## 验证方法

- `pnpm exec vitest run src/ui/game`；`pnpm check`。
- 故障用 `vi.mock` 包装真实 Core 场景，只在指定 step 前抛错，并用录制成功前缀对照；不给生产 API 增加开关。
- 用 ControlledHost 的 visibility、cancel、release 失败注入构造 hidden、cleanupFailed 与 restart；跨 owner 隔离使用两个独立 Session/桥接。
- 使用 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 时限定本项文件；浏览器取消与 hidden 证据归 08。

## 完成证据

- 2026-10-02：实现。
  - [synthetic-command-feedback.ts](../../../../../src/ui/game/synthetic-command-feedback.ts) 新增 `onCommandsCancelled`：匹配的 pending 记为 cancelled，保留 Session 原 reason，并与最新投影同次写入。新增 `faulted(binding)`：剩余 pending 标为 unconfirmed/session-failed，由桥接与 faulted 状态在同一次写入中提交。
  - [synthetic-game-controls.ts](../../../../../src/ui/game/synthetic-game-controls.ts) 提供 `syntheticControlAvailability(status)`：以面板动作 ID 为键，同一状态组合返回同一个冻结对象。另提供 `createSyntheticGameControls(store, session).control(type)`。
  - 桥接新增 `SyntheticRunBinding.own(cleanup)`：consumer 每完成一项注册即交出撤销函数，部分附着失败由桥接统一回滚。
- 测试：UI 目录 5 个文件 / 56 项通过。
  - [synthetic-command-outcomes.test.ts](../../../../../src/ui/game/synthetic-command-outcomes.test.ts)：
    - AC-07：user-pause、hidden、restart、exit、dispose、failure 六种 reason 均按 ID 与 FIFO 记为 cancelled，没有一条变成 rejected。pause/hidden 的结果在恢复后保留，旧命令不会执行；restart/exit/dispose 先可观察取消、再清空当前运行反馈。
    - AC-07（隔离）：重启后 commandId 1 被新运行重用，用记录的旧运行取消监听重放通知，store 不变；两个 owner 的 runId 都为 1，彼此不写入。
    - AC-08：用 `vi.mock` 包装真实 Core。同一帧第二个 tick 失败时，第一个 tick 已提交 marker，投影为 tick 1 且含 marker；命令被标为 unconfirmed/session-failed，不显示成功或取消。所有 faulted 快照里 pending 都为空；重启后新运行没有 pending，也不自动重提。第一个 tick 失败时，命令尚未消耗，只产生 failure 取消。已收到的 accepted 在之后的 consumer 故障中保留，不被改成 unconfirmed。
  - [synthetic-game-controls.test.ts](../../../../../src/ui/game/synthetic-game-controls.test.ts)：
    - 九种状态组合下的可用性与 spec 表逐项一致，且同一组合返回同一对象。
    - AC-09：idle 时 pause 得到 Session 的 invalid-state，写入 actionError，sessionError 不受影响。成功 start 时，第一个通知就已清空 actionError，所有 running 快照都不带旧错误。
    - AC-09（cleanupFailed）：release 失败后，帧内排队的 restart 产生 control 错误，经 onError 写入 sessionError；cleanupFailed 仍禁用 start/restart，restart 得到“cleanup previously failed”，exit 回到 idle 后 start 仍被拒绝。
    - AC-10（Node）：隐藏时 resume 禁用且被拒绝，pending 被取消（reason=hidden）；返回可见仍 paused，resume 可用，显式恢复成功。
  - AC-03（取消/故障部分）：取消与故障结果都在当前通知边界同步写入；故障时没有伪造的成功帧。
- AC-08 的“同次故障的取消与 unconfirmed 并存”：rubber-duck 依据 Runtime 代码核实，真实 Runtime 的一次 Core 故障只会产生其中一种。首个 tick 失败时队列未消耗，只有 failure 取消；后续 tick 失败时队列已在首个 tick 消耗、事件被丢弃，只有 unconfirmed。因此并存语义由两部分证明：01 的 store 原子转换测试（先取消、再 unconfirmed，二者都保留），以及桥接“取消通知先于 faulted 状态”的顺序。端到端测试分别覆盖两种真实路径，没有为凑并存而构造虚假的 Runtime 场景。
- rubber-duck 两个阻断问题已采纳：
  - controls 原先在成功后才清空 actionError，订阅者会看到新状态配旧错误：改为尝试开始时先清空。
  - feedback 附着时，第二项注册失败会泄漏第一项监听：改为由桥接的 `binding.own` 统一持有并回滚，并有桥接级回归测试。
- simplify（四角度，各一个代理）：
  - 已采纳：桥接统一负责部分附着的回滚，取代 feedback 内的重复逻辑；新增共享测试夹具 `setupCommandFeedback`；把条件分支过多的取消测试拆成两张表；可用性按状态组合缓存冻结对象；可用性以面板动作 ID 为键。
  - 未采纳“三处 Core 故障注入抽成共享 helper”：会改动 app 层测试，超出本项范围。
  - 未采纳“controls 暂无生产调用”：06/07 会接线。
  - 重验通过。
- 工程检查：`pnpm check` 通过（32 个文件 / 654 项测试、三个类型程序、ESLint、构建）。
- 文档影响：[工程约定](../../../../engineering/README.md)补充取消与 unconfirmed 语义、真实 Runtime 故障的两种路径、控件可用性与清空时机，以及 `binding.own` 的附着回滚；[源码结构指南](../../../../engineering/source-structure.md)补充 controls 文件。原版事实与冻结决定无变化。
