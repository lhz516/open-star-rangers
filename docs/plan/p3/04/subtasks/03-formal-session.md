---
type: plan
status: active
phase: P3
task: "04"
subtask: "03"
updated: 2026-10-10
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

- [x] AC-04：start 规格、非法与重复 start、各状态与旧句柄的输入/控制拒绝；P1-05 关键边界的正式版：句柄 0、旧/重复回调、帧内 FIFO 控制、非法排队控制、消费者与 onError 失败、清理失败锁存、状态通知非递归、exit/dispose 幂等；至多一个有效帧请求，取消失败明确报告；没有由 Core 状态触发的暂停路径。
- [x] AC-05（会话部分）：`transition` 期间无 rAF、tick 0；完成凭证只对当前 runId 生效一次；保持期间隐藏后返回可见仍要求显式继续；生产接口没有每 tick 外部检测器或 Core 写回入口。
- [x] AC-03（会话部分）：容量停止的反馈顺序、取消一次、可导出；faulted 禁止新快照与导出；故障中结果不明的 ID 不报取消。
- [x] AC-06：从初始出发保持开始，经暂停、隐藏、任务菜单式 user 暂停、按住开火、命令顺延与 `clear-input`，导出录制经 JSON 往返后 replay 事件与全部检查点一致；取消命令与控制不入录制；零 tick、尾检查点、新运行与已导出副本分别验证。
- [x] R-13 控制子集的 Node 证据：暂停、hidden/pagehide、重复通知与不同暂停长度下，tick 与时钟只随实际运行的 tick 变化，继续首帧 0 tick（供 14 引用）。
- [x] `pnpm exec vitest run src/app/session src/app/runtime` 与 `pnpm check` 通过。

## 验证方法

- Node：`ControlledHost` 可控宿主与时间戳，真实 Runtime 与 Core；故障只在测试边界注入。
- 浏览器原生隐藏由 11 验证；本项不适用原版对照。

## 完成证据

- **实现：** [game-session.ts](../../../../../src/app/session/game-session.ts) 的 `createGameSession(host, onError)`。运行规格 `GameRunSpec` 为 `GameRuntimeSpec` 加 `initialTransition`；控制为 start(spec)、pause、resume、exit、dispose、complete-departure(runId)、clear-input(reason)，提交时用 Core 的数据记录读取器校验形状（访问器不执行、额外字段拒绝），并复制规格字段与 run、recording 记录，排队的 start 不受之后的改动影响。通知边界、唯一请求凭证、FIFO 排队控制、非递归状态通知、逆序清理与错误聚合沿用 P1-05 的机制。中性测试支持 [session-host.test-support.ts](../../../../../src/app/session/session-host.test-support.ts)（`ControlledHost` 原样复制，旧文件留到 13）与 [game-session.test-support.ts](../../../../../src/app/session/game-session.test-support.ts)。[session-errors.ts](../../../../../src/app/session/session-errors.ts) 新增 `GameSessionPhase`（增加 transition、stopped）供 invalid-state 使用，合成会话的 `SessionPhase` 不变。02 的 Runtime 未修改。
- **实现时的取舍（spec 未逐字规定）：**
  - 世界创建拒绝（Runtime 形状错误、`CoreInputError`、`ContentContractError`）报 invalid-argument，path 为 `control.spec…`，cause 为原错误；保持 idle，不占用 runId，不写 status.error。`CoreFaultError` 等其余创建失败为 operation-failed（runtime），同样保持 idle。05 从 cause 读取类别、路径与原因。
  - 出发变体与 Core 生效配置（`projection().mission.wingman`）核对，不符时丢弃尚未暴露的世界并报 invalid-argument。
  - `clear-input` 在 running 清除并逐 ID 取消；在 paused、transition 为幂等空操作（进入它们时会话已清输入，P3-05 失焦时不必先查状态）；idle、stopped、faulted、disposed 拒绝。
  - 进入 running 时先取得帧请求再发布状态；请求失败时状态观察者只看到 faulted。
  - 运行级消费者可在 transition、running、paused、stopped 登记。
  - Runtime 的 `command-queue-full`、`recording-capacity`（帧后监听器提交）、`reentrant-call`（投递中读快照）转为 invalid-state，reason 分别为 `command-queue-full`、`recording-capacity`、`unavailable during event delivery`。
  - 帧 phase 与取消原因中的 `transition` 留给运行中进入的保持（P3-10、P3-11）。初始保持开始时还没有运行级消费者，它们接线时从句柄读取折叠的 tick 0 读模型。
  - `cancelFrame` 失败沿用 P1 的分类：scheduler，并锁存 cleanupFailed（见[工程约定](../../../../engineering/README.md#会话端口与错误)）。
- **AC-04：** [game-session.test.ts](../../../../../src/app/session/game-session.test.ts)（64）与 [game-session-consumers.test.ts](../../../../../src/app/session/game-session-consumers.test.ts)（37）。
  - start：控制与规格形状、Core 拒绝、变体不符都保持 idle、无请求、不占用 runId；transition、running、paused、faulted、stopped、disposed 中的 start 拒绝，且没有第二个世界。新运行有新 runId、新世界，commandId 从 1 开始；旧句柄的读写与订阅全部拒绝。
  - 拒绝：idle、transition、paused、stopped、faulted 的输入与控制按状态表拒绝。
  - 调度：句柄 0，取消后迟到、重复与复用的回调无效；cancel 失败锁存，迟到回调仍无效。
  - 通知边界：帧内 FIFO 控制（含排队的 exit 加 start，及被世界拒绝的排队 start 报 control）；非法排队控制只报一次；消费者、取消通知、清理、状态观察者与 onError 失败的顺序与聚合（含 AggregateError）。
  - 清理与状态：清理失败锁存并阻止 start；状态通知中禁止控制，允许为新运行（含保持中的运行）接线；exit、dispose 幂等。
  - 没有由 Core 状态触发的暂停：地图、通讯、起飞等命令期间 tick 持续。
- **AC-05（会话部分）：**
  - 保持：transition 无帧请求、tick 0，输入与 pause/resume 拒绝，可以接线消费者。
  - 完成凭证：complete-departure 只对当前 runId 有效一次；错误 runId、重复完成、exit 之后、新运行使用旧 runId 都拒绝。
  - 隐藏保护：保持中 hidden 或 pagehide/pageshow、隐藏状态下创建、完成时读到隐藏，都锁存 resumeRequired；完成后进入 paused（hidden）并发静止帧，显式 resume 后才清除。完成时的帧请求失败直接报给调用者。
  - 接口面：运行句柄只有契约方法（运行时核对原型方法集合）；类型检查确认没有 frame、world、onTick 或 restart。
- **AC-03（会话部分）：** [game-session-fault.test.ts](../../../../../src/app/session/game-session-fault.test.ts)（11；`vi.mock` 只在世界创建边界注入）。
  - 容量停止的顺序：本帧成功 tick 的事件 → 带 `stop` 的帧报告 → 以 recording-capacity 取消余项一次 → stopped 静止帧 → 状态。帧后监听器的提交被拒。
  - 停止之后：快照与导出可用，导出 replay 一致；只允许 exit/dispose。
  - 故障优先：停止帧中域监听器或帧消费者失败、停止通知本身失败，都使运行 faulted。
  - 故障：Core 在首个或后续 step、快照或导出中发现的故障使运行 faulted。结果不明的 ID 只留在错误的 `unconfirmed` 中；只有确定未执行的队列以 failure 取消。faulted 禁止新快照与导出，读模型仍可读。创建时 Core 故障保持 idle。
- **AC-06：** [game-session-replay.test.ts](../../../../../src/app/session/game-session-replay.test.ts)（4）。
  - 脚本：从初始出发保持（期间页面隐藏）开始，经显式继续、按住与短按开火、150 条顺延命令、零 tick 与触顶帧、user 暂停、隐藏暂停、菜单式 user 暂停（期间隐藏与重复暂停），以及 focus-loss、pointer-lock-exit 清输入。
  - replay：间隔 1 与 4 的导出经 JSON 往返后，`replayRecord` 的结果与原结果全等，`compareReplayResults` 为 match；投递的事件与结果一致。被取消的 24 条命令、控制、runId、commandId 都不在录制中；清输入前后快照相等。
  - 分项：零 tick（保持中导出）；尾检查点（13 tick，间隔 4 时为 0/4/8/12/13）；新运行从 tick 0 录制；已导出副本与中途导出不变。不录制时，投影、渲染、快照、事件、取消与帧报告完全相同。
- **R-13 控制子集（供 14 引用）：** [game-session-pause-timing.test.ts](../../../../../src/app/session/game-session-pause-timing.test.ts)（25）。
  - 用例：user 暂停、任务菜单式暂停、隐藏页面、帧时读到隐藏、pagehide 五种方式，各配 1 ms、31.25 ms、319.5 ms、1 h 四种暂停长度。
  - 结果：暂停期间与迟到回调都不推进 tick 与时钟；继续后首帧 0 tick，暂停前剩下的半个 tick 也不补计，之后只按新锚定推进（tick 3 → 3 → 5，时钟恒为 tick × 2）。重复的 hidden、visible、pagehide、pageshow 不改变结果。
  - 保持与显示上下文：出发保持任意时长都为 tick 0、时钟 0；不发暂停控制时，地图、通讯命令不停钟。
  - 变异核对：去掉继续时的重新锚定，25 项中 20 项失败。原生浏览器隐藏由 11 验证。
- **检查：** `pnpm exec vitest run src/app/session src/app/runtime`：23 个文件 396 个测试通过。`pnpm check` 通过（223 个文件 6,690 个测试与构建；Node v22.22.0）。
- **rubber-duck：** 3 项。
  - 采纳 1：进入 running 的状态先于帧请求发布。改为先请求，请求失败时不发布 running，新增 4 个回归（在修复前的实现上全部失败）。
  - 拒绝 2（建议初始保持在状态之后补发 transition 静止帧）：会颠倒 P1-05 规定的静止帧先于状态的顺序；保持开始时没有运行级消费者，它们接线时从句柄读取读模型（P1-07 先例）。
  - 拒绝 3（建议 `cancelFrame` 失败改报 cleanup）：P1-05 契约与工程约定都是 scheduler 并另置 cleanupFailed。
- **simplify：**
  - 采纳：stopReason 由 phase 推导；统一的活动阶段判定；控制解析改用 Core 的 `readChoice`、`readNumber`；进入 running 时请求帧，状态发布只保留守卫；测试复用 `NEUTRAL_AXES`。
  - 未采纳：每帧数组与对象分配的优化（固定接收者批次与唯一请求凭证需要这些分配，收益可忽略）；把创建错误的归一化移入 Runtime（02 契约要求 Core 创建错误原样传出）。
- **文档影响：** 本项不需要更新文档。[工程约定](../../../../engineering/README.md#会话端口与错误)中描述合成会话的各节在 13 之前仍准确；按 spec 的文档影响，正式会话的工程说明由 15 编写（与 02 的交接相同）。原版事实与 unknowns 没有变化。
