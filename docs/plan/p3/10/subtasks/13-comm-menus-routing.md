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

- [x] AC-03：菜单层级、空/单项/失效对象、键与首匹配、远近菜单与保存恢复按 Q-01；同 tick 序列逐条按序处理、每条恰一结果。
- [x] 菜单打开时 Enter 仍为手动匹配，`speed-preset`/target/fire 不误路由；玩家、上下文与子系统门禁的结果与原因码按 D-01。
- [x] 测试经正式 step 集成，期望独立推导，不只测 helper 或 `judgeCommand`。
- [x] 本项相邻测试、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- `pnpm exec vitest run` 跑本项相邻测试，再跑 `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts`；`pnpm typecheck` 与 `pnpm lint` 通过。
- 完成前按 execute-goal 做一次 rubber-duck 审查，并以本项写入范围调用 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据

- **实现：**
  - [comm-menus.ts](../../../../../src/core/rules/comm-menus.ts)（纯规则）：类别菜单 `0x2c850`、对象列表 `0x2c9d0`（状态 ≥ 7，不看活动、被毁与距离；种类、名称与 `tone` 在建立时取得）、命令菜单 `0x2cbb4` 与近处门禁 CD5（`0x56b50` 形式的距离平方 ≤ f32 1,000,000，含等号；视角非 0/1、活动为 active、主流程 3 且子状态 0）、首匹配 `0x27e10`（A–Z 折叠）。生成键超过 9 为 `invariant-violated` 故障，不截断。
  - [communications.ts](../../../../../src/core/systems/communications.ts)：CB-07 的逐命令判定（页 2–4 的分派、页 2 单对象跳级、退出即关闭、页 4 投递 `deliver-command` 并恢复保存页、码 9 按 CB-02 第 1 行进入子状态 3 与期限 取样 + 0x780 并发出 `docking-requested`）；页外的 `c`、`x` 与数字；玩家、上下文与子系统 13 的门禁。每条命令恰一个结果，`left-page-changed` 带命令序号紧随其后。
  - [flight-control.ts](../../../../../src/core/systems/flight-control.ts)：`select-number` 不再是飞行动作，在唯一命令循环中按位置交给 `judge`，先于任何飞行动作；飞行 Enter 仍为手动匹配。[commands.ts](../../../../../src/core/systems/commands.ts) 把 `communications`、`select-number`、`navigate-selection`、`launch` 与基地/地图中的 `confirm-selection` 分派到 communications.ts。
  - [displays.ts](../../../../../src/core/systems/displays.ts) / [rules/displays.ts](../../../../../src/core/rules/displays.ts)：帧尾左显示屏按页分派，页 2–4 无菜单且字段 13 ≠ 2 时设为页 0（`0x4da28`，commandIndex 为 null）；共用的 `writeLeftPage`。
- **协调者决定（选项 A）：** 基地上下文的 `navigate-selection`、`confirm-selection`、`launch` 在玩家门禁之后仍为 `rejected`/`not-implemented`，由 17、18 接入（bfc29b9f）；地图中的 `confirm-selection` 归 P3-09。`deliver-command` 已投递，但请求处理在 14 接入之前把它当作故障（`requests.deliver-command`），测试止于投递。
- **与验收措辞的差异：**
  - CB-07 只在成功分支写 `partner`、`menuSavedPage`、`menu`；comm §7.2（已确认，代码 `0x27db6`–`0x27dd0`）在测试菜单之前三者都写，所以没有可显示类别的 `c` 也清除伙伴、保存页并丢弃休眠菜单（页与音效不变，结果仍为 `no-candidate`）。按原版实现，交 28 核对 CB-07 的措辞。
  - CB-07 未规定的两处：菜单页上无匹配的 `communications close` 为 `no-candidate`（与数字相同，“没有满足条件的菜单项”）；菜单页与所存菜单层级不一致为 `invariant-violated`（comm §7.6：页 2–4 的写入总与其菜单一起，其他写页只恢复同一菜单的页），`c` 亦先检查。码 9 的事件次序为结果、`left-page-changed`、`docking-requested`（CB-13 的列举次序）。
  - MW-04 的有效视角不在本分支；本项没有改变批次内视角的命令（`launch` 归 18）。
- **测试（期望按 comm §7、CB-02/03/07/09 与 CD5 手写，不调用被测 builder）：**
  - [comm-menus.test.ts](../../../../../src/core/rules/comm-menus.test.ts)：折叠与首匹配、重复键；对象列表的过滤、遍历次序、`tone` 与第 10 项故障；类别菜单只计非空类别并重编生成键，只剩退出项时为 null；近处门禁的视角/活动/子状态与 1000 等号、下一个 f32 不通过；三张命令表的选择与失效对象。
  - [communications.test.ts](../../../../../src/core/systems/communications.test.ts)（经 `World.step` 或真实 PIPELINE 阶段至请求处理之前）：同 tick `open → 2 → 1 → close → 1`；各层级的 `x` 与保存页 1/5；重复 open/close；无匹配数字；页 3 列出停放基地且其菜单为 TABL 2005；单对象跳级与僚机表；近处门禁的等号与子状态；重复键首匹配与大写退出；投递的请求内容与先于同批 `control` 的次序，以及正式 step 在请求处理中命中 `requests.deliver-command`；码 9 在子状态 5 下仍写 3、对象已移除时不投递仍进入等待（正式 step）；类别清空与列表中对象失效的关闭；菜单打开时 Enter 匹配速度、`speed-preset`/`target`/`fire` 照常；玩家不可用先于上下文；Warp/地图/基地/飞行各命令的门禁（基地中保留菜单，回到飞行可用）；字段 13 为 2 的 `subsystem-disabled`；失败的 `c` 丢弃休眠菜单；层级不一致故障；帧尾页 2–4 处理器的视角与字段 13 条件。
  - 已更新的既有断言：flight-control、commands、world 的结果表；energy.test 的页 2–4 用例给出已建菜单；三处 UI 测试把占位命令由 `launch` 改为仍未实现的 `cockpit-front`，诊断用例按新结果更新（打开菜单后 `e`/`d` 为 `wrong-context`）。
- **检查：** `pnpm exec vitest run src/core src/ui`（107 文件、2804 测试）通过；`pnpm check`（typecheck、lint、285 文件 8602 测试、生产构建）通过。
- **rubber-duck：** 三项发现均已修正：失败的 `c` 照 comm §7.2 丢弃休眠菜单与伙伴；`c` 也先做层级一致检查；基地/地图中的 `confirm-selection` 先过玩家门禁。simplify：去掉重复的路由集合（`flightAction` 对数字返回 undefined）、共用 `writeLeftPage`、删除未用的 `OPEN_KEY`、类别判空提前结束遍历、测试改为字面期望；跳过跨出写入范围的 `ACCEPTED`/`inMask` 共享与仅按键时发生的分配优化。
- **文档影响：** 无需在本项更新。Core 模块分册与输入指南中菜单、原因码与路由的说明按 goal 由 27 更新；`docs/original/` 无新事实。

