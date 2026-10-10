---
type: plan
status: active
phase: P3
task: "04"
subtask: "03"
updated: 2026-10-09
---

# 03 — 正式 Session

**契约来源：** [spec](../spec.md) 的 S-02，[会话](../spec.md#会话)、[任务菜单、暂停与退出](../spec.md#任务菜单暂停与退出)的控制部分、[衔接占位](../spec.md#衔接占位)的保持接口；AC-03（会话部分）、AC-04、AC-05（会话部分）、AC-06。
**依赖：** 02。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 计划新增 `src/app/session/game-session.ts`：以 [P1-05](../../../p1/05/spec.md) 的唯一请求凭证、runId、通知边界、幂等清理与错误聚合为基础，实现 spec 列出的差异：
  - idle 时 `start` 带运行规格（含 `initialTransition: DepartureTransition | null`、录制选项），校验并复制后创建唯一运行；非 idle 的 start 拒绝；不提供 `restart`。
  - 状态 `idle/transition/running/paused/stopped/faulted/disposed`；状态快照 `{ phase, runId, environmentVisible, pauseReason, transition, resumeRequired, stopReason, cleanupFailed, error }`，字段随 phase 一致。
  - `transition`：无帧请求、tick 0、意图为空、读模型折叠；允许接线运行消费者；pause/resume 拒绝；`complete-departure` 须匹配当前 runId，一次有效；可见且 `resumeRequired` 为 false 进入 running（首帧只锚定），否则 paused（hidden）；保持期间的隐藏锁存 `resumeRequired`，显式 resume 或运行结束才清除。
  - `stopped`（`recording-capacity`）：先完成本帧成功 tick 的反馈与带 stop 的帧报告，再清意图、取消余项（原因 `recording-capacity`）、折叠、发静止帧与状态，停止调度；容量判定后禁止新输入（含帧后监听器提交）；之后只允许 exit/dispose；投递中再出现消费者错误时故障优先。
  - 输入：`setIntent` 与 Core 命令只在 running 可用；`clear-input`（原因 focus-loss 或 pointer-lock-exit）清轴、电平、短按与未执行命令并逐 ID 取消，不暂停、不重锚。
  - 取消原因：user-pause、hidden、transition、focus-loss、pointer-lock-exit、recording-capacity、exit、dispose、failure；只对确定未执行的 ID 取消，结果不明者交给反馈层标为 unconfirmed。
  - 帧：每个有效回调先核对可见性与 pagehide 阻断；0 tick 帧也通知；静止帧 `report=null`；帧报告 `{ ticks, capped, stop }`；故障不发成功形状的帧。
  - 句柄：`currentRun()` 在 transition/running/paused/stopped/faulted 有值；旧句柄退役后拒绝读写与新订阅；faulted 下禁止新快照与录制导出；exit 与 dispose 幂等；`cleanupFailed` 一经置位不清除；无世界的 start 失败保持 idle，已有世界但接线或调度失败进入 faulted。
- 计划新增中性测试支持 `src/app/session/session-host.test-support.ts`（从 [synthetic-session.test-support.ts](../../../../../src/app/session/synthetic-session.test-support.ts) 复制 `ControlledHost`）；旧文件保留到 13 删除。
- 按需扩展 [session-errors.ts](../../../../../src/app/session/session-errors.ts) 的 phase 与原因，不改变合成会话的行为。
- 必要时对 02 的 Runtime 做与会话接口相关的增量修改，并同步其测试。

## 不包含

- 任务流程、占位计时、离页保护与所有权（05）；UI 桥接（06）；浏览器原生证据（11）。
- 运行中衔接检测器（spec 明确不提供）；合成会话的删除（13）。

## 关键文件与契约

- 计划新增：`src/app/session/game-session.ts`、`src/app/session/session-host.test-support.ts` 及相邻测试。
- [session-host.ts](../../../../../src/app/session/session-host.ts)：复用端口，不改。
- [session-errors.ts](../../../../../src/app/session/session-errors.ts)、[rollback-error.ts](../../../../../src/app/session/rollback-error.ts)：复用与增量扩展。
- 02 的 `src/app/runtime/game-runtime.ts`。

## 写入范围

- `src/app/session/game-session*.ts`：计划新增的会话与测试。
- `src/app/session/session-host.test-support.ts`：计划新增的中性宿主替身。
- `src/app/session/session-errors.ts`：phase 与原因扩展。
- `src/app/session/session-errors.test.ts`：对应测试。
- `src/app/runtime/game-*.ts`：与会话接口相关的增量修改。

## 验收标准

- [ ] AC-04：start 规格、非法与重复 start、各状态与旧句柄的输入/控制拒绝；P1-05 关键边界的正式版：句柄 0、旧/重复回调、帧内 FIFO 控制、非法排队控制、消费者与 onError 失败、清理失败锁存、状态通知非递归、exit/dispose 幂等；至多一个有效帧请求，取消失败明确报告；没有由 Core 状态触发的暂停路径。
- [ ] AC-05（会话部分）：`transition` 期间无 rAF、tick 0；完成凭证只对当前 runId 生效一次；保持期间隐藏后返回可见仍要求显式继续；生产接口没有每 tick 外部检测器或 Core 写回入口。
- [ ] AC-03（会话部分）：容量停止的反馈顺序、取消一次、可导出；faulted 禁止新快照与导出；故障中结果不明的 ID 不报取消。
- [ ] AC-06：从初始出发保持开始，经暂停、隐藏、任务菜单式 user 暂停、按住开火、命令顺延与 `clear-input`，导出录制经 JSON 往返后 replay 事件与全部检查点一致；取消命令与控制不入录制；零 tick、尾检查点、新运行与已导出副本分别验证。
- [ ] R-13 控制子集的 Node 证据：暂停、hidden/pagehide、重复通知与不同暂停长度下，tick 与时钟只随实际运行的 tick 变化，继续首帧 0 tick（供 14 引用）。
- [ ] `pnpm exec vitest run src/app/session src/app/runtime` 与 `pnpm check` 通过。

## 验证方法

- Node：`ControlledHost` 可控宿主与时间戳，真实 Runtime 与 Core；故障只在测试边界注入。
- 浏览器原生隐藏由 11 验证；本项不适用原版对照。

## 完成证据
