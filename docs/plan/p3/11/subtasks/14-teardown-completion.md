---
type: plan
status: active
phase: P3
task: "11"
subtask: "14"
updated: 2026-10-17
---

# 14 — 退场、流程门禁与完成

**契约来源：** [spec](../spec.md) 的 S-08、AC-07（退场部分）、AC-10（完成后 step）；[任务流程状态](../spec.md#任务流程状态)、技术决定 1–2；D-01 的退场契约。
**依赖：** 12, 13。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 锁存之后进入主状态 0/1：在 [pipeline.ts](../../../../../src/core/systems/pipeline.ts) 原定的 `mission-teardown` 阶段（计划新增 `src/core/systems/mission-teardown.ts`）标记全部对象退场，通过既有生命周期移除；主状态 1 时 `0x339cc` 拒绝生成与发射请求（[launch.ts](../../../../../src/core/systems/launch.ts)、[spawn.ts](../../../../../src/core/systems/spawn.ts)）。
- 锁存 tick 的剩余阶段、命令与请求的结算按 D-01：锁存后的游戏命令以定稿的封闭原因结算；锁存摘要不被晚到事件改写。
- 退场完成：活实体归零、AI 控制器与共享缓存的活引用释放、玩家与地图读模型转为无实体后，发出退场完成事件；之后 [world.ts](../../../../../src/core/world/world.ts) 的 `step` 在改状态前以非锁存的错误拒绝，读取（projection、Render State、snapshot）仍可用；清理不变量失败仍为 Core 故障。
- 测试：成功与失败两种锁存后的退场序列；地图标记、逃生舱、弹体、爆炸与 AI 引用的清理；状态 1 门禁；锁存 tick 的命令结果；完成后 step 拒绝不污染读取；清理故障锁存。

## 不包含

- 分区与录制（15）；Runtime 截断与会话（16）。

## 关键文件与契约

- [errors.ts](../../../../../src/core/errors.ts)、[entity-table.ts](../../../../../src/core/world/entity-table.ts) 的生命周期、[ai.ts](../../../../../src/core/systems/ai.ts) 的控制器与解析缓存、[map.ts](../../../../../src/core/systems/map.ts) 的标记。

## 写入范围

- `src/core/systems/mission-teardown.ts`：计划新增的退场阶段。
- `src/core/systems/mission-teardown.test.ts`：计划新增的测试。
- `src/core/systems/pipeline.ts`：阶段接线。
- `src/core/systems/mission-flow.ts`：锁存后转入退场。
- `src/core/systems/launch.ts`：`0x339cc` 门禁。
- `src/core/systems/spawn.ts`：`0x339cc` 门禁。
- `src/core/systems/destruction.ts`：`shedFragments` 的 `0x339cc` 门禁（ME-11、ME-15：主状态 1 中不构造碎片）。
- `src/core/world/world.ts`：完成后 step 的拒绝。
- `src/core/errors.ts`：非锁存错误（若 D-01 新增类别）。
- `src/core/world/*.test.ts`：完成后读取与拒绝的测试。
- `src/core/systems/*.test.ts`：受影响的既有测试。

## 验收标准

- [ ] 锁存→退场→完成经既有生命周期；活实体归零，读模型不解析旧 ID；状态 1 门禁有效。（AC-07）
- [ ] 完成后 step 不改世界、不污染读取；清理故障仍锁存。（AC-10）
- [ ] 锁存 tick 的命令结果恰好一个且原因封闭；结果不被晚到事件改写。
- [ ] 受影响的 Vitest、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- Node 流水线、拆除与故障矩阵测试。
- 按 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 清理本项范围。

## 完成证据
