---
type: plan
status: active
phase: P3
task: "07"
subtask: "24"
updated: 2026-10-10
---

# 24 — 连锁、replay 与容量

**契约来源：** [spec](../spec.md) 的 S-01（快照与 replay）、S-07（归因）、S-10、AC-13；[与其他任务的接口](../spec.md#与其他任务的接口)、技术决定 8、10；[验证策略](../spec.md#验证策略)中的 Replay/一致性；P3-02 spec 的 [CR-06](../../02/spec.md#cr-06-领域事件与次序d-01)（事件与次序）、[CR-13](../../02/spec.md#cr-13-其他任务在-p3-07-规则中的调用点d-03-之外的接口)（其他任务的调用点）、[CR-14](../../02/spec.md#cr-14-容量快照与版本d-01)（容量、快照与版本）。
**依赖：** 22, 23。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **连锁：**
  - 同 tick 多次命中只产生一次 `object-destroyed`，且在对应的 `hit` 之后；
  - 发射者在命中前已移除时，归因退为 `lost-shooter`、不计击杀；玩家对象不会被移除，玩家的击杀不受影响（H4）；
  - 损失、耗尽与逃生舱到期在 CR-13 的固定调用点交给 P3-11。P3-11 未接入时这些位置没有代码（不建空函数或待处理标志），也不伪造任务计数、救援或失败；
  - 一个 tick 内的事件次序符合 CR-06（玩家更新、请求处理中的导弹起爆、移动、碰撞、能量、停放交战与帧尾）；
  - 多 tick 后才消费事件，即使对象已移除，事件仍有足够的快照。
- **快照：** 快照覆盖 CR-14 列出的全部新状态：实体的 `combat`（含制导、冷却、寿命与计时）、移动块的新变体、表现选择器、玩家状态的新字段（含 `depleted` 锁存与驾驶舱显示步的闪烁状态）；静态规则数据不进快照。快照写入器由类型检查强制覆盖每个成员（11）。P3-02 没有快照恢复 API，本项不新增；以 replay 在每个检查点的快照文本一致来核对。
- **replay：** JSON 往返后的 replay，其事件与检查点一致；坏版本、内容不符（任一规则输入改变 setupHash）与坏输入被拒绝；与渲染有无和读取频率无关。
- **容量：**
  - `eventsPerTick` = 32,768 与 `requestsPerTick` = 16,384（11 按 CR-14 设定）的 limit 与 limit + 1，以及故障锁存；
  - 效果创建（弹丸、导弹、爆炸、碎片）的预算与二次项（起爆、碰撞、停放多目标）的超限故障；
  - 不静默丢弃弹丸、请求或事件；
  - 依据注释与 CR-14 不一致时修正注释并报告协调者；数值的改变须回到 08 的关卡。
- **修复：** 发现缺陷时，修复只针对连锁或 replay 暴露的问题；超出本项的行为缺陷，由协调者新增修复子任务。

- **导弹计时字段的语义检查（20、22 的建议）：** 在 CR-01 的世界创建检查中，拒绝 32 的 `initialGuidance` 会在首次回调时故障的可实例化导弹记录：+0x44、+0x48、+0x54（寿命与计时）不是非负整数，或 +0x58 不在 i32 内。检查与 `initialGuidance` 的记录守卫共用一个判定，使可到达的导弹不在首次回调时故障。内容层把 +0x54 读作 u32，+0x44、+0x48 读作 i32，实际可能为负的是后两者。原版按 u32 回绕（负寿命立即熄火），项目不复现。在 P3-02 spec 的 CR-01 中补一句并加拒绝测试。
  - 合成夹具：`rule-data.test-support.ts` 的 `missile()` 默认 +0x44 为 −11，约 30 个测试文件经它创建世界。把默认值改为有效值（内容解码测试需要的负值或边界值改为显式覆盖），或在世界层夹具中覆盖，二者由执行者选；改动只针对因此失败的测试。拒绝生效后去掉 22 在 `game-session-replay.test.ts` 中把寿命设为 320 的局部覆盖。

## 不包含

- P3-11 的任务计数、救援与失败；完整闭环的 replay（P3-15）。
- 新的规则行为；快照恢复 API。

## 关键文件与契约

- [limits.ts](../../../../../src/core/contracts/limits.ts)、[snapshot.ts](../../../../../src/core/replay/snapshot.ts)、[compare.ts](../../../../../src/core/replay/compare.ts)、[replay.ts](../../../../../src/core/replay/replay.ts)、[replay.test-support.ts](../../../../../src/core/replay/replay.test-support.ts)。
- 计划新增：`src/core/systems/combat-chains.test.ts`、`src/core/replay/combat-replay.test.ts`。

## 写入范围

- `src/core/contracts/limits.ts`：上界依据注释的修正（数值由 11 按 CR-14 设定）。
- `src/core/contracts/limits.test.ts`：上限测试。
- `src/core/replay/snapshot.ts`：快照遗漏状态的修复。
- `src/core/replay/compare.ts`：比较器遗漏字段的修复。
- `src/core/replay/combat-replay.test.ts`：战斗 replay 测试（新建）。
- `src/core/replay/replay.test-support.ts`：测试辅助。
- `src/core/systems/**`：连锁测试（`combat-chains.test.ts`，新建）与连锁缺陷的修复。
- `src/core/rules/**`：连锁缺陷的修复。
- `src/core/world/rule-data.ts`、`src/core/world/rule-data.test.ts`：导弹计时字段的拒绝。
- `docs/plan/p3/02/spec.md`：CR-01 中的对应一句。
- `src/content/rule-data/rule-data.test-support.ts`、`src/content/rule-data/*.test.ts`：合成导弹记录的默认计时字段，与依赖旧默认值的内容解码测试。
- `src/core/world/*.test-support.ts`、`src/core/**/*.test.ts`、`src/app/**/*.test.ts`、`src/app/**/*.test-support.ts`：只用于适配导弹计时字段拒绝后失败的测试与夹具（含去掉 `game-session-replay.test.ts` 的局部覆盖）。

## 验收标准

- [ ] AC-13：多次命中只有一次死亡事实；发射者失效时归因退为 `lost-shooter`、不计击杀，玩家的击杀不受影响；损失、耗尽与到期经事件与 CR-13 的固定调用点交给消费任务，没有空函数，未接入 P3-11 时不伪造成功。
- [ ] AC-13：快照覆盖 CR-14 列出的全部新状态，静态规则数据不进快照；JSON 往返 replay 的事件与检查点一致；坏版本、内容与输入被拒绝。
- [ ] AC-13：新上限与效果创建预算的 limit 与 limit + 1 及故障锁存有回归测试；一个 tick 内的事件次序符合 CR-06；延迟消费的事件仍有足够快照。
- [ ] `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts`、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- Node 测试：经正式 `step`、replay 与模拟的帧后消费者（把事件留到多个 tick 后才读）断言；不把 Runtime 订阅者当作规则入口。

## 完成证据
