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
- `src/core/systems/view-switch.ts`、`src/core/systems/view-switch.test.ts`：计划新增，MW-09 的视角切换函数（协调者 2026-10-14 扩大范围）。
- `src/core/systems/targeting.ts`、`src/core/systems/weapons.ts`、`src/core/systems/energy.ts`：`combatCommandPlayer` 改读 TickContext 的有效视角的调用点（协调者 2026-10-14 扩大范围）。
- `src/core/world/world.test.ts`、`src/ui/dev/mission-diagnostics.test.ts`：`toggle-map` 接入后“每种命令恰一个结果”的期望（同上）。

## 验收标准

- [x] AC-03：上列有序门禁、开关、轴与清键用例全部通过，期望独立推导；未实现命令不伪装已支持。
- [x] 打开资格、复位与初值符合 D-01 与 01 的原版依据；关闭地图不被未经核实的共用门禁截断。
- [x] `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts` 与 `pnpm check` 通过。

## 验证方法

- Node 逐命令、请求与流水线测试；基地用内部合成前态，不新增生产状态注入 API。

## 完成证据

- **实现：** [pipeline.ts](../../../../../src/core/systems/pipeline.ts) 的 `TickContext.commandView`（MW-04 的有效视角与上一视角：`registerTick` 以已提交值建立，玩家更新开始命令批次时重新取已提交值），`Request` 增加 `map-toggle`，请求处理在实体查找之前应用它。[flight-control.ts](../../../../../src/core/systems/flight-control.ts) 的 `judgeCommands` 每条命令按判定时的有效视角推出上下文（不在循环外缓存），`changedAxes` 按循环后的最终有效上下文（map/base 为 0）。[commands.ts](../../../../../src/core/systems/commands.ts) 的 `combatCommandPlayer` 改为接收 TickContext 并读有效视角（targeting/weapons/energy 三处调用点随之改为传 context，协调者已扩大范围）；`toggle-map` 交 [map.ts](../../../../../src/core/systems/map.ts)；地图上下文中 `select-number`、`confirm-selection`、`navigate-selection` 为玩家不可用时 `player-unavailable`、否则 `wrong-context`，其他上下文仍 `not-implemented`（P3-10），`communications`、`launch`、`map-point`（14）、`request-warp`（17）仍 `not-implemented`。map.ts 的 `judgeToggleMap` 按 MW-04 的四步表（地图中关闭不查玩家，MW-12 差异 8；玩家不可用；Warp 为 `wrong-context`；flight/base 打开），接受时立即更新有效视角并投递请求；`applyMapToggle` 按已提交视角开或关、打开时光标 := `startPixel`，经 `switchView` 后发 `map-toggled`，不写页面、重绘与目标。新增 [view-switch.ts](../../../../../src/core/systems/view-switch.ts) 的 `switchView(world, newMode, oldMode)`：地图无规则副作用；进入 1 保存页并设页 6，离开 1 恢复 `savedLeftPage`（5 改 0），返回页面变化供调用者按其契约发 `left-page-changed`；涉及 6 的 `0x4cd68` 明确留给 P3-10（未实现，不声称已实现）。[map-frame.ts](../../../../../src/core/rules/map-frame.ts) 的最小换算：`mapPixelToWorld`（`0x4c4c0`）与 `zoomBounds`（`0x2bc30`），光标世界点与放大范围由光标派生、不存储（MW-02）。
- **AC-03（正式 `World.step`，期望由 MW-04/05/09 与合成几何独立推导）：** [map.test.ts](../../../../../src/core/systems/map.test.ts) 23 项：从飞行打开（视角 8、上一视角 0xC、光标重置为 (178, 154)，世界点 (−4950, −10350, 0)，放大范围 x −12450…2550、y −25350…4650；页面、重绘、目标、目的地不变）；关闭回保存的视角（含 0xD、0x11），保留光标、页面、重绘与目标；基地合成前态（视角 6）打开与关闭，关回后速度命令仍为 `wrong-context`；Warp 上下文 `wrong-context`；玩家不存在/已毁/未激活时不能打开、但能关闭已开的地图，关闭后再开为 `player-unavailable`；开图→速度/开火/选目标/能量页/Enter/数字/菜单导航均 `wrong-context`，开图前已接受的油门保留提交时参数并在开图之后应用；关图→速度与能量页按恢复的飞行上下文接受；同 tick 开又关、关又开（两个请求按次序应用，中间命令按地图判定）；开图前的选目标请求先于 `map-toggled` 应用，自动选敌的请求在其后；自动选敌读已提交视角（从基地打开的 tick 不运行，下一 tick 运行）；同 tick 关图后 Enter 为匹配速度；地图中玩家不可用时选择命令先报 `player-unavailable`；持轴入图的 tick 轴归零、关图后中立输入不恢复，开关同 tick 或关图时轴照常施加；切片世界（记录 2 的生成时间改为 2 s）开图 200 tick 与不开图的孪生世界在时钟、RNG、生成状态、实体位置与能量上完全一致且期间确有生成、能量更新与运动；中立（清键）输入不重置已接受的地图、光标、速度辅助与目的地。每条命令恰一个结果、次序正确。另有 [view-switch.test.ts](../../../../../src/core/systems/view-switch.test.ts)（5 项）、[map-frame.test.ts](../../../../../src/core/rules/map-frame.test.ts)（5 项，含 f32 存储）、[pipeline.test.ts](../../../../../src/core/systems/pipeline.test.ts)（命令批次从对象更新时的已提交视角开始、请求处理时才提交）、[commands.test.ts](../../../../../src/core/systems/commands.test.ts)（前置判定读有效视角而非已提交视角）。既有期望随 `toggle-map` 接入调整：flight-control.test.ts（地图中 `select-number`、`confirm-selection` 改为 `wrong-context`，无玩家时 `player-unavailable`）、world.test.ts（未激活玩家的 `toggle-map` 为 `player-unavailable`）、mission-diagnostics.test.ts（`toggle-map` 打开地图后能量与损伤报告为 `wrong-context`，日志多 `map-toggled`）。
- **打开资格与初值：** 按 executable.md 的 Map mode and its commands（P3-09/01）：打开只要求战役（Core 恒满足，不建原因码）；打开写视角/上一视角并重置鼠标块到起点，关闭交换回去且不过 `0x3104c`（不清目标）；地图切换不置重绘、不改页面。关闭不被玩家可用性门禁截断（MW-04 第 1 步）。
- **检查：** `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts`：85 个文件、2,511 项通过；`pnpm check`（typecheck、lint、8,626 项测试、build）通过；基线为目标分支 `9c71e851`。
- **Rubber-duck：** 审阅完整 diff 对照 MW-04/05/09/13 与 AC-03，未发现阻塞或非阻塞问题。
- **Simplify：** 四个角度审阅后采纳：测试复用导出的 `committedView`、批次开始直接写两字段、`judgeToggleMap` 扁平化、`applyMapToggle` 以 `Object.assign` 写视角、测试去重复调用。未采纳：视角常量迁入 player-state（会改动 targeting 的私有常量，超出本项）、通用门禁表与无主体请求分派表（较大重构，归后续任务）、`switchView` 返回值的不变量断言（保留作为防护）。
- **文档影响：** `docs/original/` 与 unknowns 无新事实。`docs/engineering/**` 归子任务 26，需更新：modules/core.md 的 `object-update` 行（命令按有效视角判定、`toggle-map`）、`request-handling`（`map-toggle` 请求）、命令判定段（`TickContext.commandView`、`combatCommandPlayer(context)`、地图上下文中选择命令为 `wrong-context`、`toggle-map` 的结果表）、轴段（按最终有效上下文）、扩展规则（判定须读 `commandView`，改视角须经 `switchView`）、分阶段接入中 P3-09 的“地图中 select-number/confirm-selection 仍 not-implemented”与“地图 same-tick 门禁归 P3-09”两条（已实现）；source-structure.md 增加 systems/map.ts、systems/view-switch.ts、rules/map-frame.ts。
