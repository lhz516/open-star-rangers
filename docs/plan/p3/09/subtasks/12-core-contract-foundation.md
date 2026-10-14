---
type: plan
status: active
phase: P3
task: "09"
subtask: "12"
updated: 2026-10-14
---

# 12 — Core 契约基础

**契约来源：** [spec](../spec.md) 的 S-01、S-02、AC-01、AC-02（Core 部分）；D-01 写入 P3-02 的修订。
**依赖：** 08, 11。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 按 D-01 落地共享形状：命令原因码、领域事件联合、玩家状态中的地图与 Warp 状态、种类 25 与模式 4 移动块的类型、地图可见标志与集合的状态、`CORE_LIMITS` 的新上限；未被规则使用的原因不预建。
- `createWorld` 接收地图几何输入（与 [rule-data.ts](../../../../../src/core/world/rule-data.ts) 的输入并列），冻结拷贝、跨输入校验（与 `mapFrame` 的比例有限且为正）、纳入 setupHash；`ReplayContent` 与应用侧传入同步。
- 新 Warp 用途对 [craft-info-input.ts](../../../../../src/core/world/craft-info-input.ts) 的创建时校验：按 05 的数值域拒绝本次运行可达的不合法组合，保留原版合法的零值分支。
- 快照写入器、比较器的事件字段表、录制校验与版本：`RULES_VERSION` 与实际不兼容的格式版本递增，旧规则 replay 拒绝且不执行。
- 保持既有纯度、原子拒绝、冻结与生命周期不变量；只按批准变更更新旧 `not-implemented` 与占位断言。本项不实现规则行为，三种命令仍由 13 起接入。

## 不包含

- 规则行为（13 至 18）与 `map` 分区内容（19）。

## 关键文件与契约

- [domain-events.ts](../../../../../src/core/contracts/domain-events.ts)、[limits.ts](../../../../../src/core/contracts/limits.ts)、[player-state.ts](../../../../../src/core/world/player-state.ts)、[entity-table.ts](../../../../../src/core/world/entity-table.ts)、[create-world.ts](../../../../../src/core/world/create-world.ts)、[setup-hash.ts](../../../../../src/core/world/setup-hash.ts)、[snapshot.ts](../../../../../src/core/replay/snapshot.ts)、[compare.ts](../../../../../src/core/replay/compare.ts)、[recording.ts](../../../../../src/core/replay/recording.ts)、[rules-version.ts](../../../../../src/core/replay/rules-version.ts)、[replay.ts](../../../../../src/core/replay/replay.ts)。

## 写入范围

- `src/core/contracts/**`：原因码、事件、上限与测试。
- `src/core/world/**`：状态、实体、输入、校验、setupHash 与测试。
- `src/core/replay/**`：快照、比较器、版本与测试。
- `src/core/projections/projection.ts`、`src/core/projections/projection.test.ts`：只把 `never` 占位改为 D-01 的类型，分区仍未就绪。
- `src/app/resources/**`、`src/app/runtime/**`：把地图几何传入 `createWorld` 与 replay。
- `tools/replay-check.ts`、`tools/replay-check.test.ts`：同步输入（如需）。

## 验收标准

- [ ] AC-01：类型、读取器、序列化、事件比较与快照字段表与 D-01 一致；版本已递增，旧规则 replay 拒绝；既有不变量保持。
- [ ] AC-02 的 Core 部分：合格输入创建成功，缺失与跨输入不一致拒绝且不建半个世界；代表字段变化改变规范文本且样本 setupHash 改变；调用者后续修改不影响世界；新用途数值域按证据接受或拒绝。
- [ ] `pnpm exec vitest run src/core src/app tools/engineering-boundaries.test.ts` 与 `pnpm check` 通过。

## 验证方法

- Node 测试的期望独立推导；limit 与 limit + 1；JSON 往返与旧版本拒绝。

## 完成证据
