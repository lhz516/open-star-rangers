---
type: plan
status: active
phase: P3
task: "10"
subtask: "15"
updated: 2026-10-14
---

# 15 — 通讯反应与僚机报告接入

**契约来源：** [spec](../spec.md) 的 S-04、AC-06；[无线电队列与通讯反应](../spec.md#无线电队列与通讯反应)的“通讯反应”“僚机报告”。
**依赖：** 03, 14, 29。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 在 P3-07 标出的固定调用点以静态调用接入 `0x3c208`、`0x3c0f4`（[damage.ts](../../../../../src/core/systems/damage.ts) 模块注释所列位置，含碰撞致死低于 0 时的两次调用），在实例化扩展点接入 `0x38cd4`（[spawn.ts](../../../../../src/core/systems/spawn.ts)），在停放行进中接入僚机到达与靠近基地的报告（[area.ts](../../../../../src/core/systems/area.ts)）。
- 友伤累计与窗口、各限频、感谢计数、消息身份与全部条件抽取按 Q-05 与 D-03；只用世界 RNG，次序固定；不凭外发事件延后重放。
- 更新 P3-07 的连锁测试中按批准变化而改变的部分（新增的抽取改变后续序列）；不同渲染频率、音频与 G-03 绘制有无不改变世界 RNG、事件与哈希。

## 不包含

- 队列本身（14）；P3-08 对友伤累计的消费、P3-11 对感谢计数的统计与救援的清除调用。

## 关键文件与契约

- [damage.ts](../../../../../src/core/systems/damage.ts)、[destruction.ts](../../../../../src/core/systems/destruction.ts)、[spawn.ts](../../../../../src/core/systems/spawn.ts)、[area.ts](../../../../../src/core/systems/area.ts)。
- 计划新增：`src/core/rules/comm-reactions.ts`、`src/core/systems/comm-reactions.ts` 及测试。

## 写入范围

- `src/core/rules/comm-reactions*.ts`、`src/core/systems/comm-reactions*.ts`：计划新增。
- `src/core/systems/damage*.ts`、`src/core/systems/destruction*.ts`、`src/core/systems/spawn*.ts`、`src/core/systems/area*.ts`：调用点。
- `src/core/systems/combat-chains.test.ts`、`src/core/systems/combat-wiring.test.ts`、`src/core/replay/combat-replay.test.ts`：已批准变化的断言更新。

## 验收标准

- [ ] AC-06：每个调用点在原定位置接入；碰撞致死的重复调用与其他路径区分；友伤/限频/感谢状态与条件抽取的分布和先后按 Q-05 独立推导。
- [ ] 不同渲染频率与表现有无不改变世界 RNG、规则事件与状态哈希。
- [ ] 本项相邻测试、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- `pnpm exec vitest run` 跑本项相邻测试，再跑 `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts`；`pnpm typecheck` 与 `pnpm lint` 通过。
- 随机部分按代码推导，对 0–32767 的全部 rand 值计数原像。
- 完成前按 execute-goal 做一次 rubber-duck 审查，并以本项写入范围调用 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据
