---
type: plan
status: active
phase: P3
task: "11"
subtask: "05"
updated: 2026-10-17
---

# 05 — D-01 共享契约、退场与衔接关卡

**契约来源：** [spec](../spec.md) 的 S-01、AC-01；[实施关卡](../spec.md#实施关卡) D-01；[共享契约修订](../spec.md#共享契约修订p3-02p3-04)、[任务流程状态](../spec.md#任务流程状态)、[运行中与终局衔接](../spec.md#运行中与终局衔接)。
**依赖：** 04。
**执行方式：** 需用户：批准 D-01 的定稿。共享契约的批准须来自用户的明确回答（spec 未授予 agent 代为批准），agent 起草推荐方案与被排除方案后提问。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 依 01 至 04 的结论，把共享契约修订的方向定稿为逐字段契约，写入 [P3-02 spec](../../02/spec.md) 新增的“P3-11 的契约修订”节：
  - `flow` 的主状态 0/1/3/4/5 与子状态 0–5、各期限字段；全清标志、预结算、结果锁存与退场完成的状态表示；救援计数与 `rescuesUsed`；段 2 运行状态；僚机损失计时；玩家私有来源记录与放置引用的变化；
  - 每个字段的名称、类型、单位、范围、初值/null、唯一所有者、写入阶段、救援/锁存/退场/新 run 的生命周期与序列化；
  - CR-13 调用点的接入位置与 `0x339cc` 的处置；`mission-teardown` 阶段的职责与退场完成条件；锁存 tick 的剩余阶段、命令与请求结算、未执行命令的封闭原因；
  - 领域事件（全清、结算、完成消息、信标消息、被毁序列、救援、僚机计时、结果锁存、退场完成）及发生阶段与最低快照；`transition` 的 G-02/5、G-02/6；`radio-flushed` 的新原因；`result` 与 `mission` 分区的封闭联合；完成后 `step` 的非锁存拒绝；
  - `CORE_LIMITS` 的新上限与依据（含同 tick 衔接序列）；`RULES_VERSION`、快照格式与 replay 格式的递增依据。
- 在 [P3-04 spec](../../04/spec.md) 新增“P3-11 的修订”：救援的运行中衔接、完成截断与新截断原因、完成屏障、会话结果阶段与终局占位序列及凭证、任务所有者的结果位置、重试与返回、错误优先级、健康录制导出、全部 phase 消费者的同步。
- 研究推翻本任务 spec 的方向时，同步修订本任务 spec，与 D-01 一起请用户批准。若需要新内容元数据，先起草 P3-03 修订，同样请求批准。
- 可以分批定稿；协调者把分出的批次作为新子任务加入，每批在实现之前批准。

## 不包含

- D-02（07）；实现（08 起）。

## 关键文件与契约

- [P3-02 扩展规则](../../02/spec.md#扩展规则)与先例 [P3-10 的契约修订](../../02/spec.md#p3-10-的契约修订d-01)；[P3-04 运行中衔接](../../04/spec.md#运行中衔接p3-10-的修订)。
- 实际消费者：[world-state.ts](../../../../../src/core/world/world-state.ts)、[projection.ts](../../../../../src/core/projections/projection.ts)、[world.ts](../../../../../src/core/world/world.ts)、[recording.ts](../../../../../src/core/replay/recording.ts)、[limits.ts](../../../../../src/core/contracts/limits.ts)、[game-runtime.ts](../../../../../src/app/runtime/game-runtime.ts)、[game-session.ts](../../../../../src/app/session/game-session.ts)、[mission-flow.ts](../../../../../src/app/mission/mission-flow.ts)、[game-session-bridge.ts](../../../../../src/ui/game/game-session-bridge.ts)。

## 写入范围

- `docs/plan/p3/02/spec.md`：P3-11 的契约修订与批准记录。
- `docs/plan/p3/04/spec.md`：P3-11 的修订与批准记录。
- `docs/plan/p3/03/spec.md`：确需新内容元数据时的修订与批准记录。
- `docs/plan/p3/11/spec.md`：研究推翻方向时的修订与批准记录。

## 验收标准

- [ ] P3-02 spec 正文写明 D-01 的全部共享形状与时序，每个字段有名称、类型、单位、范围、所有者、初值、写入阶段、生命周期与序列化；无开放字段或万能载荷。
- [ ] P3-04 spec 写明救援衔接与终局的完整契约，与本任务 spec 一致。
- [ ] 批准记录（日期、范围、所选方案与被排除方案、用户原话）写在受影响 spec 的审批节；没有批准记录时 08 不开始。
- [ ] 没有实现代码；`node tools/task-state.ts p3/11` 不报计划问题。

## 验证方法

- 逐项对照 01 至 04 的结论与 spec 的修订方向。
- 检查与当时 P3-12 至 P3-14 的分支或 spec 是否冲突（只读）。
- 文档链接与元数据检查；git 审阅只改写入范围内的文件。

## 完成证据
