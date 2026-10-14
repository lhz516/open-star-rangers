---
type: plan
status: active
phase: P3
task: "09"
subtask: "20"
updated: 2026-10-14
---

# 20 — 快照、replay、上限与重试

**契约来源：** [spec](../spec.md) 的 AC-11；[共享契约修订](../spec.md#共享契约修订p3-02)的事件最低要求与 `CORE_LIMITS`。
**依赖：** 15, 18, 19。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 快照包含所有影响未来的地图、Warp、标记、可见性状态与图标/探索历史（若存在），不漏阶段计时、保存页与随机状态；不重复序列化纯派生副本。
- 同版本、运行时、内容、配置、种子与有序输入的录制 JSON 往返 replay：事件与检查点一致，与渲染有无和频率无关；坏版本、身份、setupHash 与输入拒绝。
- 新列表、请求/事件扇出、实体与录制预算的 limit 与 limit + 1，以及故障锁存。
- 一个 Runtime 帧内多 tick 后才消费事件、实体已移动或移除时，事件快照仍足够。
- 重试以新世界重建全部地图与 Warp 状态，旧运行事件与 ID 不穿越新运行。
- 端到端合成流程：开图 → select → 关图 → 友方选标记 → `request-warp` → 到达，正式 step 中的事件序列与状态断言。

## 不包含

- 快照恢复 API（不提供）。

## 关键文件与契约

- [replay.ts](../../../../../src/core/replay/replay.ts)、[recording.ts](../../../../../src/core/replay/recording.ts)、[compare.ts](../../../../../src/core/replay/compare.ts)、[snapshot.ts](../../../../../src/core/replay/snapshot.ts)、[limits.ts](../../../../../src/core/contracts/limits.ts)、[replay.test-support.ts](../../../../../src/core/replay/replay.test-support.ts)。

## 写入范围

- `src/core/replay/**`：测试与必要的写入器、比较器修正。
- `src/core/contracts/limits.ts`、`src/core/contracts/limits.test.ts`
- `src/core/systems/map-warp-chains.test.ts`：计划新增的端到端合成测试。

## 验收标准

- [ ] AC-11 的每项（快照完整、JSON 往返 replay、坏输入拒绝、上限与故障锁存、重试隔离）都有通过的测试。
- [ ] 端到端合成流程在正式 step 中通过，事件与状态断言独立推导。
- [ ] `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts` 与 `pnpm check` 通过。

## 验证方法

- Node 正式 step、replay、帧后事件消费者与容量测试；不是快照恢复测试。

## 完成证据
