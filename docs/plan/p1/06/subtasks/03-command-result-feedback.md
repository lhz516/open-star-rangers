---
type: plan
status: active
phase: P1
task: "06"
subtask: "03"
updated: 2026-10-02
---

# 03 — 命令提交与 Core 结果反馈

**契约来源：** [spec](../spec.md) 的 S-02（结果即时发布）、S-03、S-04（同步提交失败），AC-03（命令部分）、AC-04、AC-05、AC-06、AC-09（提交部分），以及技术决定 4、5。
**依赖：** 02。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 新建命令反馈模块，提供 `add-marker` / `remove-marker` 提交 action，通过当前运行的 `submitCommand` 提交已有 Command。
  - 每次尝试开始时清空 `actionError`。
  - 只有正常返回 commandId 后，才按提交顺序加入 `{runId, commandId, commandType}`；投影保持原值。
  - 同步失败（如非 running 的 invalid-state、形状错误）写入 `actionError {operation: commandType, cause}`，保留原 cause，不分配或伪造 ID。
- 接线新运行时注册域事件订阅，按 `delivery.commandId` 匹配当前运行的 pending，不使用 commandIndex 或 entityId。
  - marker-added/removed 产生 accepted，携带原事件。
  - command-rejected 产生 rejected，携带原 reason。
  - 移出 pending，经 01 的保留规则追加到 recentResults。
  - 在同一通知边界，用 02 的入口把尚未发布的最新 tick 投影立即写入。
- 同 tick add→remove 的两个 ID 按 FIFO 各终结一次；marker 只由帧末 projection 决定，不按事件合成中间世界。
- 其他消费者提交的命令、未知 ID 和已终结 ID 不创建 phantom pending，也不产生本面板结果；它们只可促使最新投影刷新。
- 不按 marker 是否存在禁用提交，不在 UI 复制 marker 规则；连续点击不合并、不去重、不自动重试。

## 不包含

- 取消、故障后的 unconfirmed、运行切换清空与会话控制 action（04）。
- React 组件与按钮（07）。

## 关键文件与契约

- [synthetic-event-bus.ts](../../../../../src/app/runtime/synthetic-event-bus.ts) 的 `EventDelivery`、[synthetic-session.ts](../../../../../src/app/session/synthetic-session.ts) 的 `SessionRun.submitCommand/on/onAny`（已有，只读复用）。
- [Runtime 事件测试](../../../../../src/app/runtime/synthetic-runtime-events.test.ts)（已有 FIFO 与帧末读取先例）。
- 01/02 计划新增的 store 写入口与桥接（本项使用）。
- 计划新增：`src/ui/game/synthetic-command-feedback.ts`、`src/ui/game/synthetic-command-feedback.test.ts`。

## 验收标准

- [x] AC-04：running 且无 marker 时提交 add，同步得到 ID 后只有 pending、投影不变。首个执行 tick 后得到 accepted，事件的 tick/entityId/position 与最新投影一致，且 pending 移除。
- [x] AC-05：有 marker 时再次 add 得到 rejected/marker-already-exists；无 marker 时 remove 得到 rejected/marker-not-found；marker 保持权威状态，无 accepted 反馈。
- [x] AC-06：同 tick add→remove 的两个 ID 按 FIFO 各终结一次，最终 projection.marker=null。外部提交的命令不生成本面板结果；对已终结 ID 的再次投递不改变 pending 或 recentResults。
- [x] AC-03（命令部分）：同一毫秒内的多个结果在通知边界同步写入，不等待采样窗；同一 tick 不重复写投影。
- [x] AC-09（提交部分）：非 running 或非法形状的同步失败写入 actionError，保留原 cause，无 ID、pending 或伪造事件。
- [x] 目标 Vitest 与 `pnpm check` 通过，模块 DOM-free。

## 验证方法

- `pnpm exec vitest run src/ui/game/synthetic-command-feedback.test.ts src/ui/game/synthetic-session-bridge.test.ts`；`pnpm check`。
- 使用真实 Session 与 ControlledHost，在 0 tick 帧与执行 tick 帧两侧读取 store；外部命令直接调用 `run.submitCommand`。重复投递经桥接所用的模块内事件处理入口验证，不新增组件可见入口或生产后门。
- 使用 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 时限定本项文件；浏览器接受/拒绝证据归 08。

## 完成证据

- 2026-10-02：实现 [synthetic-command-feedback.ts](../../../../../src/ui/game/synthetic-command-feedback.ts)：`createSyntheticCommandFeedback(store)` 是桥接的运行级 consumer。`attach` 订阅 `onAny`，按 `delivery.commandId` 把真实 marker-added/removed 记为 accepted、command-rejected 记为 rejected，并与帧末最新投影同次写入。`submit(type)` 经 binding 转发，成功后与清除 actionError 同次加入 pending，失败时写入 actionError。桥接新增 `SyntheticRunBinding.submitCommand`：binding 被回滚或 unbind 注销后不再转发。
- 测试：[synthetic-command-feedback.test.ts](../../../../../src/ui/game/synthetic-command-feedback.test.ts) 8 项（UI 目录合计 33 项）通过：
  - AC-04：提交后只有 pending `{runId:1,commandId:1}`，投影对象不变；0 tick 帧后仍 pending、无 marker。执行 tick 后 accepted 的事件 tick=1、commandIndex=0，投影 marker 的 id/position 与事件的 entityId/position 一致，pending 清空。
  - AC-05：重复 add 得到 marker-already-exists，再 remove 被接受，再 remove 得到 marker-not-found；marker 始终与投影一致，结果序列为 accepted/rejected/accepted/rejected。
  - AC-06：同 tick add→remove 的 ID 1、2 按 FIFO 各终结一次，帧内所有 store 快照的 marker 均为 null，投影只发布一次 `[1,0]`。外部直接提交的命令不产生结果但刷新了投影；用记录的旧监听重放已终结事件，store 完全不变。
  - AC-03（命令部分）：时钟 10 ms、采样窗未到期时结果与 tick 1 投影即时写入；同 tick 的帧不重复写入，后续未到期 tick 不发布。
  - AC-09（提交部分）：暂停时提交得到 Session invalid-state（operation=input），非法类型得到 invalid-argument（path=command.type）；两者都没有 pending，也不消耗 Runtime ID（之后提交仍为 1，下一条直接提交为 2）。退出后提交得到“run has ended”；从未开始时得到 Error；成功提交清空 actionError。
- rubber-duck 阻断问题已采纳：附着回滚或 unbind 后，feedback 仍持有旧 binding，可能把命令送进仍在运行的会话，却没有 pending 或错误。现改为经可注销的 binding 提交；回归测试覆盖“后续 consumer 附着失败后的旧提交”与“unbind 后的提交”，两者都不改变 Core marker。其余审查项（ID 关联、FIFO 恰一次、重复与外部投递、结果不会早于 pending）无问题。
- simplify（四角度，各一个代理）：
  - reuse 与 simplification 无发现。
  - 已采纳 efficiency/altitude 的“提交两次写入”：改为单次原子写入。
  - 未采纳“按帧批量合并结果”：每帧命令很少，逐事件写入已是原子的。
  - 未采纳“隐藏 binding 的原始 run”：consumer 都是内部模块，提交路径已在类型注释与工程文档中明确。
  - 重验通过。
- 工程检查：`pnpm check` 通过（30 个文件 / 631 项测试、三个类型程序、ESLint、构建）。
- 文档影响：[工程约定](../../../../engineering/README.md)补充命令反馈的关联规则、Session 错误来源、注销后的 binding 与原子提交；[源码结构指南](../../../../engineering/source-structure.md)补充文件与现状。原版事实与冻结决定无变化。
