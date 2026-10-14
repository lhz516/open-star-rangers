---
type: plan
status: active
phase: P3
task: "09"
subtask: "17"
updated: 2026-10-14
---

# 17 — Warp 开始

**契约来源：** [spec](../spec.md) 的 S-08、AC-08，AC-07 的开始部分；[Warp 开始](../spec.md#warp-开始)。
**依赖：** 14, 16。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 计划新增 `src/core/systems/warp.ts`：`request-warp` 在飞行与地图上下文按 D-01 的结果表判定（玩家状态门禁、从基地打开的地图、间隔等号与两侧、能量、未设/零距离/失效目标按 05 的实际语义），在 [commands.ts](../../../../../src/core/systems/commands.ts) 中路由。
- 接受时按 05/D-01 写入：模式 3、`inWarp`、`warpClock`、玩家目标清除（不发 `target-changed`）、Warp 进度复位、视角 1 与上一视角、左显示屏页 6 与保存的页（发 `left-page-changed`，`commandIndex: null`）、`statusDisplay.redraw`、能量在核实的阶段扣除；拒绝时原子不变、不扣费、不抽随机数。
- `warp-started` 只在实际开始时发出，字段按 D-01；同 tick 重复请求不双扣；原版拒绝反馈若存在按 05 交接。
- Warp 中已实现的离散命令按结果表判定；连续轴与宿主控制不被误禁（与 13 的回归一起）。

## 不包含

- 进度、完成与中断（18）。

## 关键文件与契约

- [player-state.ts](../../../../../src/core/world/player-state.ts)、[displays.ts](../../../../../src/core/systems/displays.ts) 的页面规则、[energy.ts](../../../../../src/core/systems/energy.ts)、[flight-motion.ts](../../../../../src/core/rules/flight-motion.ts) 的 `integrateWarp`。

## 写入范围

- `src/core/systems/warp.ts`、`src/core/systems/warp.test.ts`
- `src/core/systems/commands.ts`、`src/core/systems/commands.test.ts`
- `src/core/systems/displays.ts`、`src/core/systems/displays.test.ts`：页 6 的保存与恢复。
- `src/core/systems/flight-control.test.ts`：Warp 中的轴回归。

## 验收标准

- [ ] AC-08：结果表的每个分支、原子失败、目标清除、页面保存、时钟与能量写入阶段正确；`warp-started` 只在实际开始时发出且快照完整。
- [ ] AC-07 的开始部分：拒绝不扣费、恰够、同 tick 重复请求不双扣、耗尽通知一次性。
- [ ] `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts` 与 `pnpm check` 通过。

## 验证方法

- Node 逐命令与流水线测试，期望独立推导。

## 完成证据
