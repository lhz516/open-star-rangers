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

- [ ] AC-07：六种 reason 都按通知 ID、reason 与 FIFO 终结，不变成拒绝。新运行不继承旧 pending/recentResults；迟到旧通知无效；同一 commandId 在新运行中重用、两个 owner 的 runId 都为 1 时互不写入。
- [ ] AC-08：补跑第二 tick 失败、首 tick 已提交时，最后成功投影反映该提交。剩余 pending 为 unconfirmed/session-failed，与同次 failure 取消并存；已收到的终态不被覆盖；无 pending 悬挂或自动重提。
- [ ] AC-03（取消/故障部分）：采样窗内的取消与故障在同一通知边界同步写入，且故障时没有伪造成功帧。
- [ ] AC-09（控制部分）：非法控制的同步失败写入 actionError 并保留原 cause；sessionError 与 actionError 分开；cleanupFailed 在 error 替换后仍阻止 start/restart，exit 仍可执行。
- [ ] AC-10（Node）：可用性逐项与 spec 一致，包括 hidden 时 paused 运行的 resume 禁用；暂停时未执行命令被取消；返回可见仍为 paused。
- [ ] 目标 Vitest 与 `pnpm check` 通过，模块 DOM-free。

## 验证方法

- `pnpm exec vitest run src/ui/game`；`pnpm check`。
- 故障用 `vi.mock` 包装真实 Core 场景，只在指定 step 前抛错，并用录制成功前缀对照；不给生产 API 增加开关。
- 用 ControlledHost 的 visibility、cancel、release 失败注入构造 hidden、cleanupFailed 与 restart；跨 owner 隔离使用两个独立 Session/桥接。
- 使用 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 时限定本项文件；浏览器取消与 hidden 证据归 08。

## 完成证据
