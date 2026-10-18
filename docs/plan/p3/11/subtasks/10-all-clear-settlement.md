---
type: plan
status: active
phase: P3
task: "11"
subtask: "10"
updated: 2026-10-17
---

# 10 — 全清、结算与成功锁存

**契约来源：** [spec](../spec.md) 的 S-03、AC-03；[全清与成功](../spec.md#全清与成功)、[任务流程状态](../spec.md#任务流程状态)；Q-01、Q-03、Q-10、Q-11 的已归档结论。
**依赖：** 09。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 全清判定（`0x69a70`）的纯规则：存活、被毁、状态 6、待生成项（`pendingSpawns`）与阶段内已投递请求的边界按 Q-03；在 09 的对象事件入口中，满足条件时同一阶段置全清标志并调用 `disableSpawning`。
- 计划新增 `src/core/systems/mission-flow.ts`，接管 `mission-flow` 阶段（保留 [docking.ts](../../../../../src/core/systems/docking.ts) 的停靠分派，按 Q-01 的跳转表次序调用）：子状态 0 先检查任务状态（预结算：重跑全清、固定总结引用、主状态 4），再交给 13 的僚机计时；主状态 4 的推迟（视角 1）与完成消息事件；主状态 5 到期锁存成功（原因、总结、`rescuesUsed`、返航变体按对象状态 +3、可选 G-02/9、击杀合计），然后转入退场（14 实现退场本身）。
- 到期读上一 tick 的取样，比较按 Q-11；非法的状态 5 失败前态报 Core 故障。
- 测试：最后敌机被玩家消灭/其他原因/离开世界；仍有待生成编组、被毁或待移除对象；子状态 1–5 中推迟；Warp 推迟；完成消息恰好一次；预结算后基地受损不改总结；返航变体活动 +2 与状态 +3 的区分；主状态 4/5 不救援不失败的入口（与 12 联合时补全）。

## 不包含

- 被毁、信标与救援（11、12）；僚机计时（13）；退场与完成（14）。

## 关键文件与契约

- [pipeline.ts](../../../../../src/core/systems/pipeline.ts) 的 `PIPELINE` 与 `mission-flow` 阶段；[spawn.ts](../../../../../src/core/systems/spawn.ts) 的 `disableSpawning`、`pendingSpawns`；[view-switch.ts](../../../../../src/core/systems/view-switch.ts) 的 `WARP_VIEW_MODE`；[flight-messages.ts](../../../../../src/content/rule-data/flight-messages.ts)。

## 写入范围

- `src/core/systems/mission-flow.ts`：计划新增的流程阶段。
- `src/core/systems/mission-flow.test.ts`：计划新增的测试。
- `src/core/rules/all-clear.ts`：计划新增的全清规则。
- `src/core/rules/all-clear.test.ts`：计划新增的测试。
- `src/core/systems/mission-events.ts`：全清入口。
- `src/core/systems/docking.ts`：停靠分派改由流程阶段调用。
- `src/core/systems/pipeline.ts`：阶段接线。
- `src/core/systems/*.test.ts`：受影响的既有测试。

## 验收标准

- [ ] 全清判定按 Q-03 的边界独立正确，不硬编码 16 杀或“敌人列表为空即胜”。（AC-03）
- [ ] 主状态 3→4→5 的到期、推迟、完成消息、总结冻结与成功锁存符合 spec；锁存前 `result` 仍为进行中。（AC-03）
- [ ] 停靠子状态的既有测试不回归；阶段次序不变。
- [ ] 正式 step 集成测试、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- 合成任务的正式 step 测试与严格/非严格时钟边界；期望独立推导。
- 按 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 清理本项范围。

## 完成证据
