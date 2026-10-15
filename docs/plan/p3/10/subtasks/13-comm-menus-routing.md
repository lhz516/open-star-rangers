---
type: plan
status: active
phase: P3
task: "10"
subtask: "13"
updated: 2026-10-14
---

# 13 — 通讯菜单规则与命令路由

**契约来源：** [spec](../spec.md) 的 S-02、AC-03；[通讯菜单](../spec.md#通讯菜单)、[行为与边界](../spec.md#行为与边界)中的菜单行。
**依赖：** 12。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 按 Q-01 与 D-01 实现菜单状态机：打开、类别与对象列表的生成与次序、命令菜单的选择（已确认的谓词，门禁分别覆盖活动、种类、距离与任务流程）、跳级与刷新（按研究结论）、数据键与生成键、首匹配、`x` 关闭、保存页与恢复、对象失效、通讯子系统 13 的门禁，以及基地/地图/Warp 上下文对菜单状态的处理。
- 在 [flight-control.ts](../../../../../src/core/systems/flight-control.ts) 的唯一 `judgeCommands` 循环中、`flightAction` 消费数字之前接入菜单判定；`communications` 命令经 [commands.ts](../../../../../src/core/systems/commands.ts) 分派。每条命令按当前位置的权威状态判定，恰有一个 `command-result`；飞行 Enter 保留手动匹配速度，`speed-preset`、`target`、`fire` 不误路由。
- 菜单选中命令项时只产生投递请求（处理由 14 接入）；本项的测试以请求被投递为止。
- 测试覆盖同 tick `open → 数字 → 数字 → close → 数字`、重复 open/close、Enter 与 `speed-preset` 交错、空/单项/失效对象、各上下文与玩家不可用。

## 不包含

- 投递的处理、回复与来电页（14）；`communications` 分区的就绪内容（19）；菜单绘制（P3-13）。

## 关键文件与契约

- [flight-control.ts](../../../../../src/core/systems/flight-control.ts)、[commands.ts](../../../../../src/core/systems/commands.ts)、[displays.ts](../../../../../src/core/rules/displays.ts)（左页写入）。
- 计划新增：`src/core/rules/comm-menus.ts`（菜单生成与键匹配的纯规则）、`src/core/systems/communications.ts`（命令判定与状态写入）及测试。

## 写入范围

- `src/core/rules/comm-menus.ts`、`src/core/rules/comm-menus.test.ts`：计划新增。
- `src/core/systems/communications.ts`、`src/core/systems/communications.test.ts`：计划新增。
- `src/core/systems/flight-control*.ts`、`src/core/systems/commands*.ts`：路由与断言。
- `src/core/rules/displays*.ts`、`src/core/systems/displays*.ts`：左页 2–4 的写入。
- `src/core/world/world.test.ts`：命令结果断言的更新。
- `src/core/systems/energy.test.ts`、`src/ui/game/game-command-feedback.test.ts`、`src/ui/game/game-command-feedback-fault.test.ts`、`src/ui/dev/mission-diagnostics.test.ts`：仅测试期望随 CB-07/CB-09 更新。

## 验收标准

- [ ] AC-03：菜单层级、空/单项/失效对象、键与首匹配、远近菜单与保存恢复按 Q-01；同 tick 序列逐条按序处理、每条恰一结果。
- [ ] 菜单打开时 Enter 仍为手动匹配，`speed-preset`/target/fire 不误路由；玩家、上下文与子系统门禁的结果与原因码按 D-01。
- [ ] 测试经正式 step 集成，期望独立推导，不只测 helper 或 `judgeCommand`。
- [ ] 本项相邻测试、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- `pnpm exec vitest run` 跑本项相邻测试，再跑 `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts`；`pnpm typecheck` 与 `pnpm lint` 通过。
- 完成前按 execute-goal 做一次 rubber-duck 审查，并以本项写入范围调用 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据
