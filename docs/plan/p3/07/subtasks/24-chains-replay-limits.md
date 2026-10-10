---
type: plan
status: active
phase: P3
task: "07"
subtask: "24"
updated: 2026-10-09
---

# 24 — 连锁、replay 与容量

**契约来源：** [spec](../spec.md) 的 S-01（快照与 replay）、S-07（归因）、S-10（跨 tick 事实）、AC-13；[与其他任务的接口](../spec.md#与其他任务的接口)、技术决定 8、10；[验证策略](../spec.md#验证策略)中的 Replay/一致性。
**依赖：** 22, 23。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **连锁：**
  - 同 tick 多次命中只产生一次死亡事实；
  - 发射者移除后归因仍然保留；
  - 损失、耗尽与逃生舱到期通过事件与具名待处理状态跨阶段消费，消费恰好一次；
  - 未接入 P3-11 时不伪造任务计数、救援或失败；
  - 多 tick 后才消费事件、即使对象已移除，事件仍有足够的快照。
- **快照：** 快照包含全部影响未来的状态，例如：
  - 建造期随机子集；
  - 制导、冷却与寿命计时；
  - 待处理事实；
  - 逻辑视点的必要历史。
  从任意 tick 的快照恢复后继续运行，结果与不中断的运行一致。
- **replay：** JSON 往返后的 replay，其事件与检查点一致；坏版本、内容不符与坏输入被拒绝；与渲染有无和读取频率无关。
- **容量：**
  - 覆盖效果创建、读取、请求与事件预算的 limit 与 limit+1，以及故障锁存；
  - 不静默丢弃弹丸或事件；
  - 按 08 的处理方式调整 `CORE_LIMITS` 的数值与依据。
- **修复：** 发现缺陷时，修复只针对连锁或 replay 暴露的问题；超出本项的行为缺陷，由协调者新增修复子任务。

## 不包含

- P3-11 的任务计数、救援与失败；完整闭环的 replay（P3-15）。
- 新的规则行为。

## 关键文件与契约

- [limits.ts](../../../../../src/core/contracts/limits.ts)、[snapshot.ts](../../../../../src/core/replay/snapshot.ts)、[compare.ts](../../../../../src/core/replay/compare.ts)、[replay.ts](../../../../../src/core/replay/replay.ts)、[replay.test-support.ts](../../../../../src/core/replay/replay.test-support.ts)。
- 计划新增：`src/core/systems/combat-chains.test.ts`、`src/core/replay/combat-replay.test.ts`。

## 写入范围

- `src/core/contracts/limits.ts`：新上限的数值与依据。
- `src/core/contracts/limits.test.ts`：上限测试。
- `src/core/replay/snapshot.ts`：快照遗漏状态的修复。
- `src/core/replay/compare.ts`：比较器遗漏字段的修复。
- `src/core/replay/combat-replay.test.ts`：战斗 replay 测试（新建）。
- `src/core/replay/replay.test-support.ts`：测试辅助。
- `src/core/systems/**`：连锁测试（`combat-chains.test.ts`，新建）与连锁缺陷的修复。
- `src/core/rules/**`：连锁缺陷的修复。

## 验收标准

- [ ] AC-13：多次命中只有一次死亡事实；发射者移除不丢归因；损失、耗尽与到期经事件与具名状态跨阶段消费；未接入 P3-11 时不伪造成功。
- [ ] AC-13：快照包含全部影响未来的状态；JSON 往返 replay 的事件与检查点一致；坏版本、内容与输入被拒绝。
- [ ] AC-13：效果创建、读取与请求/事件预算的 limit 与 limit+1 及故障锁存有回归测试；延迟消费的事件仍有足够快照。
- [ ] `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts`、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- Node 测试：经正式 `step`、replay 与模拟帧后消费者（把事件留到多个 tick 后才读）断言；不把 Runtime 订阅者当作规则入口。

## 完成证据
