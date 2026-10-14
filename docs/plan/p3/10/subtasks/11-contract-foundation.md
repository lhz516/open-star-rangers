---
type: plan
status: active
phase: P3
task: "10"
subtask: "11"
updated: 2026-10-14
---

# 11 — 共享契约实现

**契约来源：** [spec](../spec.md) 的 S-01、AC-01；D-01 定稿后的 [P3-02 spec](../../02/spec.md) “P3-10 的契约修订”节。
**依赖：** 08。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 按 D-01 定稿实现共享类型与读写：任务内子状态、玩家/实体/世界的新字段及初值、新请求类型、领域事件与命令原因码、`communications` 分区的判别与就绪形状（就绪内容由 19 填）、`CORE_LIMITS` 的新上限。
- 快照写入器、比较器的逐字段读取与事件字段表、`RULES_VERSION` 与按实际兼容性决定的快照/replay 格式版本（相对实际集成基线各递增一次；本任务后续子任务不再递增，除非与其他任务合并时另行处理）；旧规则版本在任何 tick 之前拒绝。
- 更新因已批准变化而改变的既有断言（`not-implemented` 的分区与命令断言），保持纯度、原子拒绝、生命周期与冻结不变量；合成 Core 行为不变。

## 不包含

- 规则输入的接线（12）与各规则（13 起）；分区就绪内容（19）。

## 关键文件与契约

- [domain-events.ts](../../../../../src/core/contracts/domain-events.ts)、[limits.ts](../../../../../src/core/contracts/limits.ts)、[player-state.ts](../../../../../src/core/world/player-state.ts)、[world-state.ts](../../../../../src/core/world/world-state.ts)、[entity-table.ts](../../../../../src/core/world/entity-table.ts)、[projection.ts](../../../../../src/core/projections/projection.ts)、[snapshot.ts](../../../../../src/core/replay/snapshot.ts)、[compare.ts](../../../../../src/core/replay/compare.ts)、[rules-version.ts](../../../../../src/core/replay/rules-version.ts)。
- 请求联合在 [pipeline.ts](../../../../../src/core/systems/pipeline.ts) 的 `Request`；本项只加类型与校验，处理由 14、16、18 接入。

## 写入范围

- `src/core/contracts/**`：事件、原因码、上限与测试。
- `src/core/world/player-state.ts`、`src/core/world/world-state.ts`、`src/core/world/entity-table.ts` 及其测试：新字段与初值。
- `src/core/world/world.test-support.ts`、`src/core/world/world.test.ts`：辅助与已批准变化的断言。
- `src/core/projections/**`：分区判别与测试。
- `src/core/replay/**`：快照、比较器、版本与测试。
- `src/core/systems/pipeline.ts`、`src/core/systems/pipeline.test.ts`：请求类型的联合与校验。
- `src/core/systems/commands.test.ts`：已批准变化的断言。

## 验收标准

- [ ] 类型、读取器、序列化与比较器与 P3-02 定稿一致；无开放字段或 `unknown` 载荷。
- [ ] `RULES_VERSION` 与实际不兼容的格式版本已递增；旧规则 replay 在 step 前拒绝。
- [ ] 既有不变量的测试保持通过，已批准变化的旧断言随之更新；合成 Core 行为不变。
- [ ] 本项相邻测试、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- `pnpm exec vitest run` 跑本项相邻测试，再跑 `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts`；`pnpm typecheck` 与 `pnpm lint` 通过。
- 对照 P3-02 定稿逐字段核对快照与比较器；构造坏版本录制断言 step 前拒绝。
- 完成前按 execute-goal 做一次 rubber-duck 审查，并以本项写入范围调用 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据
