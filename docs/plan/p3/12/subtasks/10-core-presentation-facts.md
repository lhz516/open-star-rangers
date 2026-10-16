---
type: plan
status: active
phase: P3
task: "12"
subtask: "10"
updated: 2026-10-15
---

# 10 — Core 表现事实与版本

**契约来源：** [spec](../spec.md) 的 S-01、AC-01、AC-17（Core 部分）；D-01 定稿（09）。
**依赖：** 09。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **前提：** 开始前确认当前分支已包含 P3-09 的交付（`RenderState.warp`、`map-marker` 表现、`view-switch.ts`）；未包含时由协调者记为 blocked，恢复条件为 P3-09 集成进本分支。
- 按 09 定稿实现：Render State 的观察状态字段（`subMode`、`followedEntityId`、`inWarp`、Q-10 确认的显示阶段）；`explosion-created`（或 09 定稿的名称）领域事件在 `constructExplosion` 的实际构造点发出，带构造时的位姿、速度与首次回调判别；视角转换事实与源模型释放的持久状态；活动区域的只读投影。
- 同步写入与复位（新运行、新销毁序列、救援）、校验器、快照写入器、事件比较器、Event Bus 的事件类型表与合成生产者；按 09 递增 `RULES_VERSION` 与格式版本，不支持的旧版本明确拒绝。
- 测试：新字段的冻结、取样时刻（对象更新阶段与较晚阶段的构造、玩家延迟爆炸、碎片到期再爆炸、来源已移除）、复位、limit/limit+1；玩法字段与 RNG 抽取不变的回归。

## 不包含

- Runtime 的帧后批次（11）。
- 被毁视角的进入与结束（P3-11）；本项只在已有的视角写入点输出事实。

## 关键文件与契约

- 现有：[render-state.ts](../../../../../src/core/projections/render-state.ts)、[domain-events.ts](../../../../../src/core/contracts/domain-events.ts)、[destruction.ts](../../../../../src/core/systems/destruction.ts)、[player-state.ts](../../../../../src/core/world/player-state.ts)、[entity-table.ts](../../../../../src/core/world/entity-table.ts)、[snapshot.ts](../../../../../src/core/replay/snapshot.ts)、[compare.ts](../../../../../src/core/replay/compare.ts)、[rules-version.ts](../../../../../src/core/replay/rules-version.ts)、[game-event-bus.ts](../../../../../src/app/runtime/game-event-bus.ts)。

## 写入范围

- `src/core/**`：表现事实、事件、复位、快照、比较与版本。
- `src/app/runtime/game-event-bus.ts`：新事件类型进入 `EVENT_TYPES`。

## 验收标准

- [ ] AC-01（Core 部分）：构造、激活与视角进入的事实快照正确；持久观察字段正确复位；新字段深度冻结。
- [ ] 版本、校验、快照与比较器同步，不支持的旧版本被拒绝；玩法字段与 RNG 抽取的回归通过。
- [ ] `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts` 通过。

## 验证方法

- 上列 Node 测试；对照 09 的定稿逐字段核对。

## 完成证据
