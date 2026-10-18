---
type: plan
status: active
phase: P3
task: "12"
subtask: "34"
updated: 2026-10-17
---

# 34 — 修复：逃生舱碎片的部件数在运行开始时校验

**契约来源：** [spec](../spec.md) 的 AC-03（内容错误阻断开始，不在飞行中故障）、AC-10（逃生舱绘制部件 0–2）、[内容输入与校验](../spec.md#内容输入与校验)。
**依赖：** 20, 23, 24。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 24 发现：在真实 Session 中用合成生产包 `mission-startable` 运行，玩家被毁约 98 tick 后的逃生舱碎片（`parts-0-2`）使渲染器在飞行中抛出 `ContentContractError` 并使消费者故障，因为 Core 的 `checkDebris` 接受第 1 列表部件数 ≥ 1 的本方模型，而 20 的 `fragmentLook` 需要 ≥ 3。原版对种类 1、2 的碎片按第 1 列表序号减 3 取 DEBRIS 记录，逃生舱绘制部件 0–2；原版数据中玩家模型有 7 个部件，少于 3 个时原版行为未定义（[executable](../../../../original/formats/executable.md) 的 DEBRIS 映射）。
- 在 `prepareFlightContent`（运行开始、分配之前）拒绝可能成为 `parts-0-2` 来源（种类 1、2 的本方模型）而第 1 列表部件少于 3 的内容，以内容错误阻断开始；不改 Core 的校验。
- 延长后的集成测试暴露 21 的精灵层从上一个绘制帧取前一位置，使多 tick 帧与单 tick 帧在爆炸移动时画面不同（AC-17）；改为在逐 tick 的表现订阅中记录位置。
- 把合成生产包的玩家机体改为至少 3 个第 1 列表部件；用真实 Session 跑过玩家被毁与逃生舱碎片的绘制（例如延长 24 的集成测试到逃生舱出现之后），确认不再故障。

## 不包含

- 修改 Core 的内容校验或 DEBRIS 规则。

## 写入范围

- `src/render/flight/objects/**`、`src/render/flight/renderer/**`：运行开始时的校验与测试。
- `src/original-data/conversion/production-models.test-support.ts`：合成玩家机体的第 1 列表部件数。
- `src/app/session/game-session-presentation.test.ts`：延长到逃生舱出现之后的集成断言。
- `src/app/mission/flight-content.ts`、`src/app/mission/flight-consumer.test.ts`：从任务的机体类型表得出逃生舱来源模型并测试开始被拒。
- `src/original-data/conversion/production-rule-data.test-support.ts`：`SLICE_MODEL_PARTS` 与玩家机体部件数一致。
- `src/render/flight/sprites/explosion-sprites.ts`、`src/render/flight/sprites/explosion-sprites.test.ts`：精灵的上一位置改为按 tick 记录（与世界相同的插值来源），修复延长测试暴露的分组差异（AC-17）。

## 验收标准

- [ ] 部件少于 3 的种类 1、2 本方模型在运行开始时以内容错误被拒绝，有测试；飞行中不再因此故障。
- [ ] 合成生产包在真实 Session 中跑过玩家被毁与逃生舱绘制，事件、检查点与哈希的分组一致性仍成立。
- [ ] `pnpm check` 通过。

## 验证方法

- Node 测试。

## 完成证据
