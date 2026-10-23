---
type: plan
status: active
phase: P3
task: "11"
subtask: "10"
updated: 2026-10-23
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

- [x] 全清判定按 Q-03 的边界独立正确，不硬编码 16 杀或“敌人列表为空即胜”。（AC-03）
- [x] 主状态 3→4→5 的到期、推迟、完成消息、总结冻结与成功锁存符合 spec；锁存前 `result` 仍为进行中。（AC-03）
- [x] 停靠子状态的既有测试不回归；阶段次序不变。
- [x] 正式 step 集成测试、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- 合成任务的正式 step 测试与严格/非严格时钟边界；期望独立推导。
- 按 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 清理本项范围。

## 完成证据

- **实现：**
  - [all-clear.ts](../../../../../src/core/rules/all-clear.ts)：`ENEMY_ENTRY_KINDS`（`0x93780`）、`ALL_CLEAR_KINDS`（`0x91780`）与纯规则 `hasRemainingEnemies`，按 `kindBit` 判定：排除项、被毁标志、`pending-removal` 之外的任何活动与状态都算；队列中的记录或任一编组成员属于全清集即算，不看到期；僚机项与已移出队列的请求不算（ME-08、ME-17 决定 1）。
  - [mission-events.ts](../../../../../src/core/systems/mission-events.ts)：`reportObjectEvent` 计数之后，类型 0–2、任务状态 `built`、种类在入口集中时以该实体为排除项判定；无剩余则 `ended`、`disableSpawning`、发出 `all-clear`。无来源对象与实例化（类型 3）不判定；无触发的来源照常判定。
  - [mission-flow.ts](../../../../../src/core/systems/mission-flow.ts)：`runMissionFlow` 接管 `mission-flow` 阶段（[pipeline.ts](../../../../../src/core/systems/pipeline.ts)），每 tick 至多一个分支；主状态 3 的子状态 0 在 `ended` 时预结算（重跑全清、`selectSummary`、`settlementDeadline` := c′ + 0x140、主状态 4、`settlement-started`），子状态 3–5 交 [docking.ts](../../../../../src/core/systems/docking.ts) 的 `checkDockingWait`（仅改模块注释），1、2 不轮询；主状态 4、5 以 `isDue`（严格 >）比较 c′；Warp 视角（恰为 1）推迟；完成消息前清空无线电；主状态 5 清空后按预结算锁存 `all-clear` 或 `settlement-failed`。导出 `latch(context, reason)` 供 12：按 ME-05 计算 `endingGaps`（G-02/8 读僚机列表首项的对象状态 7/8；选择值 > 0 加 G-02/9；失败为 G-02/7，结算失败取 `destroyed`）、`rescuesUsed`、`playerKills`、`latchTick`，然后 `rescues` := 0、主状态 0、`result-latched`。原因与状态不符（第三次损失须主状态 3、救援 2、`ended`；结算原因须主状态 5 且与预结算一致）、重复锁存或主状态 4、5 缺预结算为 `invariant-violated`。
- **测试：**
  - [all-clear.test.ts](../../../../../src/core/rules/all-clear.test.ts)（5 项）：两个掩码按位写出；每个种类、活动、状态、Warp、排除项、被毁标志与待移除；队列的记录、编组、僚机、远期到期与种类 13、17、无种类模板。
  - [mission-flow.test.ts](../../../../../src/core/systems/mission-flow.test.ts)（23 项，正式 step 与钩子 step）：玩家消灭（类 0）、其他原因（类 1）、离开世界（类 2）各触发 `all-clear` 且紧随其对象事件；仍有排队编组、停放/停靠的存活敌机时不触发；待移除不再算；无来源敌机算剩余但自身被毁不判定；基地不进入；实例化不判定；种类 13 进入但不算剩余；只触发一次。3→4 在下一 tick；c′ = 期限时不到期，完成消息在其后第 161 tick，锁存在再后第 481 tick；以步长 0x140 复验严格比较；子状态 1–5 不轮询、回到 0 后进入主状态 4；Warp 推迟三次（视角 8 不推迟）；完成消息与锁存各一次、锁存后不再有流程事件；锁存前与退场中 `result` 为进行中；预结算后基地全毁不改总结；选择值 16 加 G-02/9；无匹配区间与零计数触发；返航变体读对象状态而非活动或被毁标志、无僚机为 solo；`rescuesUsed`、`playerKills` 与清零；第三次损失的前提与原因/状态的故障；主状态 4 缺预结算的故障。状态 5 失败竞态：最后一个敌机在请求处理中（导弹起爆的位置）、编组请求已移出队列时被毁 → `all-clear` 后仍实例化 6 个 → 预结算 failure、完成消息照发、锁存 `settlement-failed` 与 G-02/7 `destroyed`；同一击杀在队列检查之前则不全清。事件序列（全清 tick 至锁存前一 tick）通过 `compareReplayResults` 的 ME-13 次序校验；锁存 tick 内 `result-latched` 紧随 `result-due` 清空（含锁存 tick 的完整校验须待 14 的退场）。
- **检查：** `pnpm exec vitest run src/core/systems/mission-flow.test.ts src/core/rules/all-clear.test.ts src/core/systems/mission-events.test.ts src/core/systems/docking.test.ts src/core/systems/pipeline.test.ts src/core/replay` 通过（678 项）；`pnpm check`（typecheck、lint、Vitest 343 个文件 10,163 项、构建）通过；停靠与流水线的既有测试未改动、全部通过，阶段次序不变。
- **rubber-duck：** 无阻断问题。采纳 3 项：`latch` 按原因核对前提（第三次损失的测试改为救援 2 且 `ended`）；次序测试改名为“至锁存前”，并单独核对锁存紧随清空；补“实例化不判定”的回归测试。
- **simplify：** 结局变体只派生一次结果；类型 3 的跳过加注释；拆分类 1 与类 2 的测试；队列改经 `pendingSpawns`（与关键契约一致）。未采纳：把 `stepWith`/`contextOf` 与 `dueAfter` 提为共享工具（超出写入范围，沿用既有惯例）；把 `latch` 移到新文件（`mission-flow.ts` 是 12–14 的共同写入点）；去掉 `checkDockingWait` 的守卫（它收窄子状态类型，停靠测试直接调用）。
- **文档影响：** 写入范围内无文档需改。范围外的建议交协调者/22：[core.md](../../../../engineering/modules/core.md) 阶段表 `mission-flow` 一行应改为 `runMissionFlow`（mission-flow.ts：预结算、主状态 4/5、锁存；子状态 3–5 交 `checkDockingWait`）并补全清入口；[player-state.ts](../../../../../src/core/world/player-state.ts) 的 `heavyDamage` 注释仍写“P3-11's success summary reads it”，按 ME-18 应为只供 P4。
- **留待后续：** 主状态 4/5 中的损失“不救援不失败”的入口（11、12）；子状态 0 的僚机计时（13）；锁存后的退场、命令门禁与完成（14）。
