---
type: plan
status: active
phase: P3
task: "09"
subtask: "13"
updated: 2026-10-14
---

# 13 — 有序命令门禁与地图模式

**契约来源：** [spec](../spec.md) 的 S-03、AC-03；[地图模式](../spec.md#地图模式)、[行为与边界](../spec.md#行为与边界)。
**依赖：** 12。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 修改 [flight-control.ts](../../../../../src/core/systems/flight-control.ts) 的 `judgeCommands`：每条命令按前面已接受动作产生的有效上下文判定，不在循环外缓存上下文；命令循环结束后按最终有效上下文处理连续轴（map/base 为 0，flight/warp 沿用 P3-06）。
- 计划新增 `src/core/systems/map.ts`：`toggle-map` 的打开与关闭（视角 8 与上一视角的保存/恢复、打开资格、复位与初值按 D-01；关闭地图与基地内打开的玩家门禁例外），在 [commands.ts](../../../../../src/core/systems/commands.ts) 中路由。打开时按原版起点设定光标像素、世界点与放大范围（换算辅助由本项先建最小版本，14 扩展）。
- 地图中 `select-number`、`confirm-selection`、`navigate-selection` 与已实现飞行命令为 `wrong-context`；尚未实现的通讯/离港命令保留 `not-implemented`。
- `request-handling` 的提交位置、早先请求与自动选敌的次序按 D-01；先前已接受的请求保留提交时参数。
- 正式 `World.step` 测试覆盖：开图→速度/开火、关图→速度/开火、同 tick 开关两次、持轴入图、基地合成前态中打开与关闭、玩家不可用；每条命令恰一个结果、次序正确；地图期间时钟、运动、能量与生成继续；已接受的辅助状态不因清键重置。

## 不包含

- `map-point` 的选择与标记（14）；`request-warp`（17）。
- 进入基地（P3-10）；暂停与 Runtime（P3-04）。

## 关键文件与契约

- [flight-control.ts](../../../../../src/core/systems/flight-control.ts)、[commands.ts](../../../../../src/core/systems/commands.ts)、[player-state.ts](../../../../../src/core/world/player-state.ts) 的 `interactionContext`、[pipeline.ts](../../../../../src/core/systems/pipeline.ts)。
- 计划新增：`src/core/systems/map.ts`、`src/core/rules/map-frame.ts` 与相邻测试。

## 写入范围

- `src/core/systems/flight-control.ts`、`src/core/systems/flight-control.test.ts`
- `src/core/systems/commands.ts`、`src/core/systems/commands.test.ts`
- `src/core/systems/map.ts`、`src/core/systems/map.test.ts`
- `src/core/rules/map-frame.ts`、`src/core/rules/map-frame.test.ts`
- `src/core/systems/pipeline.ts`、`src/core/systems/pipeline.test.ts`
- `src/core/world/player-state.ts`：只在 D-01 已定的字段内写入。

## 验收标准

- [ ] AC-03：上列有序门禁、开关、轴与清键用例全部通过，期望独立推导；未实现命令不伪装已支持。
- [ ] 打开资格、复位与初值符合 D-01 与 01 的原版依据；关闭地图不被未经核实的共用门禁截断。
- [ ] `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts` 与 `pnpm check` 通过。

## 验证方法

- Node 逐命令、请求与流水线测试；基地用内部合成前态，不新增生产状态注入 API。

## 完成证据
