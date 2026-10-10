---
type: plan
status: active
phase: P3
task: "07"
subtask: "16"
updated: 2026-10-10
---

# 16 — 能量与显示状态

**契约来源：** [spec](../spec.md) 的 S-08、AC-10；[能量与显示状态](../spec.md#能量与显示状态)；P3-02 spec 的 [CR-02](../../02/spec.md#cr-02-实体的战斗状态d-01)（资源与能量字段）、[CR-04](../../02/spec.md#cr-04-玩家状态d-01)（左页面与状态显示）、[CR-05](../../02/spec.md#cr-05-命令原因码与内部请求d-01)（`energy` 与 `damage-report`）、[CR-06](../../02/spec.md#cr-06-领域事件与次序d-01)（`energy-depleted`、`energy-allocation-changed`、`left-page-changed`）、[CR-07](../../02/spec.md#cr-07-实例化扩展与系统流水线d-01d-03)（`energy` 与 `frame-end` 阶段）、[CR-09](../../02/spec.md#cr-09-与-p3-06-的接口d-03)（速度能耗、锁定的写入与最高速度的重算）、[CR-10](../../02/spec.md#cr-10-帧尾的驾驶舱显示步d-01)（帧尾的驾驶舱显示步）。
**依赖：** 04, 12, 13, 30。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **能量阶段（CR-07，D14）：** 经 11 的 `energy.ts` 导出 `run`。先玩家（停靠时跳过；不看状态与被毁），后种类 `0xffffe`（停靠时跳过；停放者任何状态都更新；其他只更新状态 ≥ 7 的）。到期比较、更新间隔、护盾与充能按档位恢复并消耗能量、子系统 0 受损时的额外消耗；整数运算按 D17 的 i32 语义。
- **速度能耗（CR-09，D14）：** 玩家的能量更新读 trunc(`movement.commandedSpeed`)，没有移动块时读 trunc(机型 +0xB8)。P3-06 的子任务 10 在 11、12 之前已合并（goal 的跨任务前提），所以本项直接读其字段，不再把这部分接线交给 22。
- **耗尽（D14）：**
  - 能量钳为 0；每次耗尽更新都经 `0x21ba0` 锁定移动块并把指令速度清零（CR-09）。
  - `depleted` 为 false 时发出 `energy-depleted` 并置锁存；以能量 > 0 结束的更新清除锁存。
  - 玩家耗尽分支中 `0x33464`（P3-11）的位置写在模块注释中，不建空函数（CR-13）。
- **档位命令（CR-05，D10）：** `shield-increase`/`shield-decrease`、`gun-increase`/`gun-decrease` 只在页 1 处理，否则为 `wrong-context`；新档位越出 0–3 → `no-change`；否则按 D10 改变档位与 E（含原生的失败分支：恢复被改的档位，另一档位置 0），以实时的 E、T 与两位字段 2 调用 P3-06 的最高速度重算（`0x30e0c`），再调用 `0x21d88`；`accepted`，紧随结果发出 `energy-allocation-changed`。能量状态接入后，P3-06 运动组中玩家的 `speedLimitStatus` 改为 `'live'`。
- **页面（CR-05，D15）：** `energy` 的 `open`：页 0 → 页 1；已在页 1 → `no-change`；页 2–6 → `wrong-context`。`damage-report`：页 1 → 页 0；已在页 0 → `no-change`；页 2–6 → `wrong-context`。页面在判定时写入，紧随结果发出 `left-page-changed`。页 2–6 的进入与返回归 P3-09、P3-10。
- **帧尾显示步（CR-10）：** 实现 11 新建的 `src/core/systems/displays.ts`，作为 `frame-end` 中 P3-07 的入口：
  - 只在视角模式为 0xC、0xD、1 或 6 时执行（依据 30 写入 cockpit 的仪表类型）；
  - 按 30 记录的仪表记录次序，调用 13 的右显示屏目标清除与状态显示步；
  - 状态显示步：条件为玩家实体存在、左页为 0、玩家的子系统 10 ≠ 2。时钟严格大于 `blinkDueClock` 时翻转 `blink`，令到期为时钟 + 0x20，并记本次已翻转；已翻转或 `redraw` 为真时按 D9 写玩家的子系统 1、5、8，然后清除 `redraw`；
  - 子系统 10 为 1 时的闪烁暂停不复现（CR-11 的差异 4）。
- **测试：**
  - 初值读取；各类对象的间隔与筛选；恢复与消耗；子系统 0；能量与容量为零时不产生 NaN。
  - 速度能耗按指令速度与没有移动块的情形，阈值上下。
  - 耗尽每次转换只发一次事件、恢复后可再次耗尽；锁定在每次耗尽更新都重设。
  - 档位命令的状态、边界、失败分支、最高速度重算与 `speedLimitStatus`；页面命令；事件紧随所属命令的结果。
  - 显示步的视角门禁、闪烁的严格比较、`redraw` 与子系统 1、5、8 的写入、与右显示屏清除的次序。

## 不包含

- 实例化初值（12）；最高速度与 `0x21d88` 本身（P3-06）；右显示屏清除的规则（13）。
- Warp 能量（P3-09）；修理与补给（P3-10）；页面与仪表绘制（P3-13）；信标流程（P3-11）。

## 关键文件与契约

- `src/core/systems/energy.ts`（11 新建）：能量阶段与命令。
- `src/core/systems/displays.ts`（11 新建）：帧尾显示步。
- P3-06 的移动块（`commandedSpeed`、`locked`）、最高速度纯函数、`0x21d88` 与运动组的 `speedLimitStatus`（以合并后的实际路径为准）；13 的右显示屏清除；30 写入 [cockpit](../../../../original/formats/cockpit.md) 的仪表类型与次序。
- 计划新增：`src/core/rules/energy.ts`、`src/core/rules/displays.ts` 及相邻测试。

## 写入范围

- `src/core/systems/energy.ts`：能量阶段、档位命令与页面命令。
- `src/core/systems/energy.test.ts`：能量系统测试（新建）。
- `src/core/rules/energy.ts`：恢复、消耗、耗尽与档位规则（新建）。
- `src/core/rules/energy.test.ts`：能量规则测试（新建）。
- `src/core/rules/displays.ts`：左页面与状态显示步的规则（新建）。
- `src/core/rules/displays.test.ts`：显示规则测试（新建）。
- `src/core/systems/displays.ts`：帧尾显示步。
- `src/core/systems/displays.test.ts`：显示步测试（新建）。
- `src/core/projections/projection.ts`：运动组的 `speedLimitStatus` 改为 `'live'`（P3-06 的运动组若在别的文件，只改该处）。
- `src/core/projections/projection.test.ts`：`speedLimitStatus` 的断言。
- `src/core/world/world.test-support.ts`：机体测试夹具的挂点块按其种类的合成记录构建（帧尾状态显示读取挂点状态）。
- `src/core/systems/commands.test.ts`、`src/core/world/world.test.ts`：`energy`、`damage-report` 不再是未实现命令。
- `src/core/systems/pipeline.test.ts`：阶段表加入 `energy`、`frame-end` 的 `run`，以及帧尾右显示屏清除对既有测试的影响。
- `src/core/systems/targeting.test.ts`：被移除目标的静默丢弃改在无显示屏的视角下测试。
- `src/core/systems/spawn.test.ts`、`src/core/replay/snapshot.test.ts`：实例化当帧的 `statusDisplay.redraw` 被帧尾状态步消费（CR-10）。
- `src/core/systems/flight-control.ts`：等级键改变最高速度后，同一 tick 中其后的 `+`/`−` 按已投递的请求重新读回指令速度（P3-06 的读回规则）。

## 验收标准

- [x] AC-10：初值、档位、到期比较、更新间隔、原始资源与满刻度按 D13、D14；玩家与非玩家、活动、停放、已停靠、新生、被毁分别测试。
- [x] AC-10：速度能耗读 P3-06 的指令速度（没有移动块时读机型 +0xB8），阈值上下正确；能量为零、容量为零与非法除数不产生 NaN。
- [x] AC-10：耗尽事实每次转换一次，恢复后可再次耗尽，`0x21ba0` 在每次耗尽更新都施加；`e`、`s`、`S`、`g`、`G`、`d` 的状态、边界与反馈正确；档位改变后重算最高速度并调用 `0x21d88`，`speedLimitStatus` 为 `'live'`。
- [x] 帧尾显示步按 CR-10 的视角集合、条件与次序运行，写子系统 1、5、8 并清除 `redraw`。
- [x] `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts`、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- Node 测试：经正式 `step` 断言阶段次序、命令结果与事件；公式的期望由 D9–D17 独立推导。
- 连续速率的对照见 27。

## 完成证据

- **实现（基于认领提交 `1741de4`，先后变基到 `324a087`、`1c1b255`（含 14）与 `7328198`（扩大写入范围））：**
  - [rules/energy.ts](../../../../../src/core/rules/energy.ts)：一次能量更新的 D14 第 2–6 步。护盾恢复（护盾 < c5C 且字段 4 ≠ 2：r = min(trunc(c64[L1] × dt ÷ 64), 能量)，need = min(c60 × 缺额, 1000 r)，增益 need ÷ c60 > 0 时加护盾、扣 need ÷ 1000）；只对玩家的充能恢复（无正值检查）与速度能耗（v = chop(指令速度)，没有移动块时 chop(c B8)；c8C ≠ 0 且 v ≥ c8C 时 ×2，否则 c90 同理 ×3；trunc((v × c88 ÷ 1000) × dt ÷ 64)）；字段 0 在状态 1 时扣 trunc(10 dt ÷ 64)，在状态 2、3 时扣 trunc(100 dt ÷ 64)；能量 ≤ 0 钳为 0。`lockMovement` 即 `0x21ba0`(h, 1)，只作用于模式 0 的块：锁定、指令速度 0、清到达标志。`changeAllocation` 即 D10 第 1–3 步，含失败分支（恢复被改的档位，另一档位置 0，E 重算后可能仍为负）。i32 语义（D17）：乘积用 `Math.imul`，加减按 i32 回绕；`quotient` 为带符号 IDIV，除数为 0 或 INT_MIN ÷ −1 时为 Core 故障（不产生 NaN）；速度超出 i32 为故障。
  - [rules/displays.ts](../../../../../src/core/rules/displays.ts)：页面转换（D15）；仪表视角集合 {0xC, 0xD, 1, 6}（cockpit.md，30）；状态页的显示条件（页 0 且字段 10 ≠ 2）；`advanceBlink`（严格大于时翻转，到期为时钟 + 0x20）；字段 1 由 (hull << 8) ÷ c9C 决定（≥ 0xC0 为 0，≥ 0x4C 为闪烁相位，否则为 2）；`withStatusFields` 写字段 1、5、8，没有变化时保留原数组。
  - [systems/energy.ts](../../../../../src/core/systems/energy.ts)：`energy` 阶段（`0x30590`）。先更新玩家：停靠时跳过，不看状态与被毁，传其移动块。再按遍历次序更新种类 `0xffffe`：停靠跳过；停放者任何状态都更新，不传块；活动者只更新状态 ≥ 7 的，传块。时钟 ≥ 到期时更新，dt = toInt32(时钟 − 上次)。下次到期：玩家 +0x40，其他有块 +0x80、无块 +0x100。耗尽时锁定所传的块；锁存为 false 时发出 `energy-depleted`；锁存等于本次是否耗尽，所以以能量 > 0 结束的更新会清除它。模块注释写明 `0x33464`（P3-11）在钳 0 之后的位置（CR-13），不建空函数。`judgeEnergyCommand`：先做共同前置判定，再按 D15 改变页面（判定时写入）。档位键只在页 1 处理，否则为 `wrong-context`；越界为 `no-change`。档位改变后用 `craftMaximumSpeed`（实时 E、T 与字段 2）重算最高速度，再调用 P3-06 的 `applyRecomputedMaximum`（`0x21d88`）。被接受的命令紧随结果发出 `left-page-changed` 或 `energy-allocation-changed`。
  - [systems/displays.ts](../../../../../src/core/systems/displays.ts)：帧尾步只在上述视角运行，先调用 13 的 `clearRightDisplayTarget`，再运行状态显示：玩家实体存在且显示状态页时推进闪烁；翻转或 `redraw` 为真时，写字段 1、5（14 的 `listStatus`，列表 1）与 8（列表 0），并清除 `redraw`。
  - [projection.ts](../../../../../src/core/projections/projection.ts)：`PLAYER_SPEED_LIMIT_STATUS = 'live'`。本分支尚无 P3-06 的运动组（其子任务 15）。合并该子任务时，运动组的玩家必须报告此常量，不得回退到 `'initial-only'`；协调者已把这一点记为合并时的检查。
  - 获批的范围外改动（`7328198`）：
    - [flight-control.ts](../../../../../src/core/systems/flight-control.ts)：`+`/`−` 每次读回时，从块的指令速度出发，按应用规则在当前最高速度下折算本 tick 已投递的油门与匹配请求（`pendingCommandedSpeed`），取代原先只在判定前读一次的增量跟踪。这样，等级键之后的读回与原版相继几帧一致（[S, −]：72.5，原先为 80）。[−, S] 的 63.75 是接受的残余差异（goal 执行记录）。
    - world.test-support.ts：机体夹具的挂点块按其种类的合成记录构建。
    - 期望更新：commands.test.ts（去掉已空的未实现 P3-07 命令列表；`damage-report` 在页 0 为 `no-change`；夹具玩家有挂点、充能为 0，`fire` 为 `insufficient-charge`）；world.test.ts（`energy`、`damage-report` 为 `player-unavailable`）；pipeline.test.ts（阶段表加入 `energy`、`frame-end`；清除目标的测试改在外部视角 0x13）；targeting.test.ts（静默丢弃改在 0x13）；spawn.test.ts 与 snapshot.test.ts（实例化当帧的 `redraw` 被帧尾消费）。
- **速度读回的结论（协调者要求核对）：** 原版每帧至多处理一个键，等级键在玩家更新回调中立即生效，0x20000 在本帧消息循环中应用。所以 Core 同一 tick 中等级键之后的 `+`/`−` 应读到 `0x21d88` 留下的指令速度，修正前读到判定前的旧值。若油门请求在等级键之前投递，则按 P3-06 的请求时机在请求处理中、以新的最高速度应用，与 CR-05 冲突 35 的“已投递的请求不被后来的命令改写”一致，作为同 tick 的差异接受。
- **测试：**
  - `pnpm check` 通过（236 个文件、7,550 项，生产构建成功）。
  - `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts` 通过（65 个文件、2,167 项）。
  - `pnpm typecheck`、`pnpm lint` 通过。
  - 期望按 D9、D10、D13–D17 由测试记录手算：
  - [rules/energy.test.ts](../../../../../src/core/rules/energy.test.ts)：
    - 护盾恢复：补满、受速率限制、受能量限制、零速率、dt 0、已满、字段 4 为 1 仍恢复、为 2 不恢复；负 c60 时的 IDIV 符号；c60 = 0 时故障。
    - 充能：只对玩家；不检查能量为正。
    - 速度能耗：指令速度、短间隔截断、没有移动块时用 c B8、负速度；c8C、c90 阈值的上下与 ×2 优先；超出 i32 时故障。
    - 字段 0 的各状态与 dt；耗尽于 0 与负值、> 0 不耗尽；能量与容量为零时全为整数；IMUL 回绕。
    - 锁定只作用于模式 0；IDIV 的截断与两种故障。
    - 档位：四种改变、降低另一档位、失败分支（另一档位置 0 而非恢复原值）、E 仍为负、四种越界。
  - [rules/displays.test.ts](../../../../../src/core/rules/displays.test.ts)：页 0–6 的两种命令；状态页条件；视角集合；闪烁的严格比较、重设与溢出故障；字段 1 的 0xC0、0x4C 边界、负船体、`<<` 回绕与零容量故障；字段写入（新冻结数组与不变时保留原数组）。
  - [systems/energy.test.ts](../../../../../src/core/systems/energy.test.ts)，经正式 `step` 或单独运行阶段：
    - 实例化抽取的到期之前不更新，到期时以 dt = 到期 − 2 扣速度能耗，之后每 0x40。
    - 玩家活动、被毁源、无块时都更新，停靠时不更新。其他机体按活动与状态筛选（9 种组合），被毁仍在状态 7 时更新，到期严格按时钟 ≥。
    - 耗尽：钳 0 并锁定；锁定后油门命令被丢弃；其间抬高的指令速度在下次耗尽时再清零而不再发事件；以能量 > 0 结束后清除锁存；再次耗尽再发事件。其他机体按遍历次序发事件，停放者没有块可锁。
    - 事件次序：命令结果与 `left-page-changed`，然后 `energy-depleted`，最后帧尾的 `target-cleared`。
    - 命令：页面往返与 `no-change`；页 2–6 全为 `wrong-context` 且状态与空闲世界相同；档位键在页 0 为 `wrong-context`；最高速度重算（E ≥ T 取 c B8、E < T 为 80、字段 2 为 1 时减半为 50.375）与 `0x21d88`（90 ÷ 80 > 1 时指令速度为 80）；降低另一档位与失败分支（c58 = 150）；四种越界；同 tick 多命令的事件紧随所属结果；四种前置判定。
    - 读回：[S, −] 为 72.5，[−, S] 为 63.75。
  - [systems/displays.test.ts](../../../../../src/core/systems/displays.test.ts)：
    - 视角 0xC、0xD、1、6 中运行，0、2、3、8、0x11、0x13 中不运行；用 `vi.mock` 包装的右显示屏清除观察到 `redraw` 仍为真，证明清除在状态显示之前。
    - 能量页、页 5、字段 10 为 2 时既不闪烁也不写；字段 10 为 1 照常运行（CR-11 差异 4）；没有玩家实体时不运行。
    - 实例化当帧置位的 `redraw` 被同帧消费。
    - 闪烁的严格比较与每次翻转时的写入；只有 `redraw` 时写入，写入后把字段留给其他写入者。
    - 字段 5、8 由列表 1、0 的挂点损伤得出（5 种组合）。
  - projection.test.ts 断言 `PLAYER_SPEED_LIMIT_STATUS` 为 `'live'`。
- **rubber-duck：** 未发现问题；对两个范围外补丁（夹具、读回）的判断为合理，[−, S] 的残余差异可接受。
- **simplify：**
  - 采纳：
    - 能量更新先判定到期，再查机型记录，并且不分配元组。
    - `STATUS_PAGE`、`BLINK_INTERVAL` 改为模块私有。
    - 读回改为单一的折算函数，取代增量跟踪与判定后再折算两份逻辑；每 tick 至多 64 条命令，开销可忽略。
    - 测试改用 `addPlayerEntity`，以设定时钟代替逐 tick 推进。
  - 未采纳：
    - 与 combat-init.ts 的私有 `divide`、flight-control.ts 的私有 `craftMovement`、area.ts 的私有 `craftRecord` 共用：都是他项文件中的私有函数，前两者的故障语义也不同。
    - 把测试的子系统数组构造移入 world.test-support.ts：超出该文件获批的用途。
    - 把视角集合与闪烁推进移入 systems、规则改为纯返回值：与本仓库 combat-init、flight-state 中修改状态的规则函数的惯例一致。
    - 去掉 `PLAYER_SPEED_LIMIT_STATUS`：它是 P3-06 运动组合并时的单一来源。
    - `pageChange` 与 `changeAllocation` 的小分配：可忽略。
- **文档影响：** 无需更新。
  - 原版事实已在 executable.md 的 D9、D10、D13–D17 与 cockpit.md 中，本项没有新事实，U 项不变。
  - Core 模块说明与源码结构按 goal 归 28。
  - 读回结论已由协调者写入 goal 执行记录。

