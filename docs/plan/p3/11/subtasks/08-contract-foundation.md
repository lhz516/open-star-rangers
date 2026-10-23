---
type: plan
status: active
phase: P3
task: "11"
subtask: "08"
updated: 2026-10-17
---

# 08 — 契约基础：状态、事件、分区与版本

**契约来源：** [spec](../spec.md) 的 S-01、AC-01；[数据模型与契约](../spec.md#数据模型与契约)；D-01 写入 [P3-02 spec](../../02/spec.md) 的“P3-11 的契约修订”（05）。
**依赖：** 05。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 按 D-01 定稿的形状扩展共享类型与初值，不实现规则：
  - [world-state.ts](../../../../../src/core/world/world-state.ts) 的 `MissionStatus`、`MissionFlow`（主状态与子状态联合、期限字段）、全清/预结算/锁存/完成的状态、救援计数、段 2 运行状态与僚机损失计时；[spawn-state.ts](../../../../../src/core/world/spawn-state.ts) 的私有来源记录变化所需字段；[create-world.ts](../../../../../src/core/world/create-world.ts) 的初值。
  - [domain-events.ts](../../../../../src/core/contracts/domain-events.ts) 的新事件、`transition` 的 G-02/5、G-02/6 与 `radio-flushed` 的新原因；命令原因码（若 D-01 新增）；[limits.ts](../../../../../src/core/contracts/limits.ts) 的新上限与注释依据。
  - [projection.ts](../../../../../src/core/projections/projection.ts) 的 `ResultReason`、`ResultMessageReference`、`result` 与 `mission` 分区类型（规则未接通前保持 `in-progress`/已有判别，不伪造终态）。
  - [snapshot.ts](../../../../../src/core/replay/snapshot.ts)、[compare.ts](../../../../../src/core/replay/compare.ts) 的新字段与事件字段表；`RULES_VERSION`、快照格式与（D-01 判定需要时）`GAME_REPLAY_VERSION` 相对实际集成基线各递增一次；旧版本在任何 tick 之前拒绝。
- 修复因联合扩展而失效的现有测试与 test-support 替身（例如 UI 桥接中代表 P3-11 状态的替身），不改变其断言的含义。
- 测试：类型穷尽、初值、严格读取、快照/哈希往返、比较器逐字段、版本拒绝、limit 与 limit + 1。

## 不包含

- 任何规则的行为（09 起）；Runtime、会话与 UI 的消费逻辑（16、17）。

## 关键文件与契约

- 上述文件；[rules-version.ts](../../../../../src/core/replay/rules-version.ts)、[recording.ts](../../../../../src/core/replay/recording.ts)；[P3-02 扩展规则](../../02/spec.md#扩展规则)。

## 写入范围

- `src/core/world/**`：状态类型、初值与测试。
- `src/core/contracts/**`：事件、原因码、上限与测试。
- `src/core/projections/**`：分区类型与测试。
- `src/core/replay/**`：快照、比较器、版本与测试。
- `src/ui/game/**`：类型扩展导致失效的桥接测试替身。
- `src/app/**/*.test.ts`：类型扩展导致失效的测试。
- `src/app/**/*.test-support.ts`：类型扩展导致失效的测试辅助。
- `src/core/systems/{base-response,communications,docking,radio}.test.ts`：`flow` 增加字段后改用 `toMatchObject` 比较 CB-02 字段，不改变断言含义。
- `src/app/runtime/game-event-bus.ts`：新事件类型加入穷尽登记（测试已在 `src/app/**/*.test.ts` 内）。
- `src/ui/dev/event-log.ts`、`src/ui/dev/event-log.test.ts`：新事件的字段行。
- `src/app/mission/mission-owner.ts`：运行中衔接的占位守卫收窄为 G-02/3、G-02/4（G-02/5、G-02/6 的衔接与占位归 16、17）。
- `tools/replay-check.ts`、`tools/replay-check.test.ts`：新事件的最长形式进入穷尽的 `LONGEST_EVENTS` 与测试的事件列表。
- `docs/guides/tools.md`：仅当最长事件改变导致 `RECORDING_MAX_BYTES` 变化时，同步其说明。

## 验收标准

- [ ] 类型、初值、事件与分区与 P3-02 的定稿逐字段一致；无开放载荷或 `unknown` 字段。（AC-01）
- [ ] 快照、比较器与版本：新字段进入快照与哈希，旧规则/格式版本在 step 前拒绝。（AC-01、AC-10 的契约部分）
- [ ] 新增上限有依据注释，limit 与 limit + 1 有测试。
- [ ] `pnpm exec vitest run src/core src/app src/ui tools/engineering-boundaries.test.ts` 与 `pnpm typecheck` 通过。

## 验证方法

- 与源码相邻的 Vitest；严格读取与往返测试；`pnpm typecheck`、`pnpm lint`。
- 按 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 清理本项范围。

## 完成证据
