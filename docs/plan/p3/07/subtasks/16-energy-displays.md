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

- [ ] AC-10：初值、档位、到期比较、更新间隔、原始资源与满刻度按 D13、D14；玩家与非玩家、活动、停放、已停靠、新生、被毁分别测试。
- [ ] AC-10：速度能耗读 P3-06 的指令速度（没有移动块时读机型 +0xB8），阈值上下正确；能量为零、容量为零与非法除数不产生 NaN。
- [ ] AC-10：耗尽事实每次转换一次，恢复后可再次耗尽，`0x21ba0` 在每次耗尽更新都施加；`e`、`s`、`S`、`g`、`G`、`d` 的状态、边界与反馈正确；档位改变后重算最高速度并调用 `0x21d88`，`speedLimitStatus` 为 `'live'`。
- [ ] 帧尾显示步按 CR-10 的视角集合、条件与次序运行，写子系统 1、5、8 并清除 `redraw`。
- [ ] `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts`、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- Node 测试：经正式 `step` 断言阶段次序、命令结果与事件；公式的期望由 D9–D17 独立推导。
- 连续速率的对照见 27。

## 完成证据
