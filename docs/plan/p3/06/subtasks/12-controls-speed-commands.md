---
type: plan
status: active
phase: P3
task: "06"
subtask: "12"
updated: 2026-10-10
---

# 12 — 操纵与速度命令

**契约来源：** [spec](../spec.md) 的 S-04、S-05（油门与速度命令）；AC-03、AC-04（命令部分）；[操纵](../spec.md#操纵)、[速度与油门](../spec.md#速度与油门)、[行为与边界](../spec.md#行为与边界)；D-04、D-08；技术决定 8、9、10。
**依赖：** 11。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **轴（检查点 A 定稿的数字摇杆语义）：** 每个成功 tick 消费本次轴快照，不在 Core 建 DOS 设备轮询计时器或跨 tick 的手动按住缓存。`pitch`/`yaw`/`roll` → 原版第 1/2/3 轴；偏转 = 向零截断（轴值 × 满偏刻度），±1 为满偏；灵敏度固定为 Medium 档的表（启动时计算的代码规则，绑定规则版本）。
- **变化检测：** 玩家可用时，每轴的有效偏转与玩家控制状态中的上次读数比较，只有不同的轴进入操纵请求并更新上次读数；锁定使请求在应用时被丢弃，上次读数照常更新。
- **上下文：** 地图与基地上下文中有效偏转为 0（有意差异）；飞行与 Warp 上下文采用本 tick 的轴。速度命令（`increase`、`decrease`、`zero`、`maximum`）与 `select-number` 只在飞行上下文处理；速度命令在其他上下文为 `ignored`/`wrong-context`，`select-number` 在 Warp 上下文为 `wrong-context`、在基地与地图上下文保持 `not-implemented`。地图、基地与 Warp 模式本身由 P3-09/P3-10 实现，本项测试经内部状态设置视角模式。
- **速度命令：** 每条写油门的命令得到一个整数油门（`increase`/`decrease` 由读回 `0x21ca8` 加减固定步长并钳位，`zero`、`maximum`，`select-number` n 为原版 Shift+n 的档位），投递一个 `control` 请求；读回的基准为玩家更新开始时的指令速度，后一条命令计入本 tick 前序速度命令的推算效果。每个合法命令恰好一个带原 `commandIndex` 的结果；同 tick 多个命令按数组顺序判定。
- **请求合并：** 本 tick 由命令投递的最后一个请求是 `control` 请求时，轴的变化并入它；否则另投一个只带轴的 `control` 请求。
- **操纵应用（`0x21dd0`）：** 新增封闭的内部请求 `control`，在请求处理阶段按投递次序应用：门禁（移动块、机型记录、未锁定）、扰动时先抽 3 次随机数、油门写指令速度并清到达（表索引钳到油门表内）、每轴的不变/关闭/偏转。请求保存投递时的值。
- **浮点路径（`0x21fd8`）：** 作为规则函数交付并测试（含扰动时的 5 次抽取，用 10 的随机方向）；不投递浮点请求。
- **原因码：** 玩家缺失、被毁、尚未活动或正在移除为 `player-unavailable`；上下文不处理为 `wrong-context`。
- **预算注释：** 更新 `pipeline.ts` 中请求上界的依据注释（每条速度命令至多一个请求、辅助与轴至多 2 个）。
- **测试：** 换算（±1、0、非整数、不足一个刻度）；变化检测（保持不变不应用、锁定时上次读数更新、扰动只在被接受的消息上抽取）；非零→零、地图与基地中非零、退出后中立输入不恢复旧轴；每种速度命令与 9 个档位；读回在匹配后的比例；同 tick 多次增减、置零与请求合并；表索引越界钳制；各原因码；请求保存当时的值；浮点路径。

## 不包含

- `match-target`、`toggle-auto-match`、`confirm-selection` 的匹配别名、速度辅助与目标引用的生命周期（13）。
- 浏览器绑定、按住节奏与清键（P3-05）；地图模式（P3-09）；通讯菜单的数字键优先级（P3-10）。

## 关键文件与契约

- [pipeline.ts](../../../../../src/core/systems/pipeline.ts) 的 `judgeCommands`、`Request`、`handleRequest`；[tick-input.ts](../../../../../src/core/contracts/tick-input.ts)；[player-state.ts](../../../../../src/core/world/player-state.ts)。
- 计划新增：`src/core/systems/flight-control.ts`（命令判定与操纵应用）、`src/core/rules/flight-control.ts`（换算、响应曲线、油门纯函数）及相邻测试。
- 02、03 的完成证据与检查点 A、C 定稿。

## 写入范围

- `src/core/systems/pipeline*.ts`：命令判定与请求处理的接入及测试。
- `src/core/systems/flight-control*.ts`：命令与操纵应用（新建）及测试。
- `src/core/rules/**`：操纵与油门纯函数（新建）及测试。
- `src/core/world/**`：控制状态读写所需的最小改动。
- `src/core/projections/render-state.test.ts`、`src/core/replay/replay.test.ts`：输入开始生效后，修正假定没有规则处理输入的既有测试（只改测试；2026-10-10 协调者按 scope-request 加入）。

## 验收标准

- [ ] AC-03：每 tick 消费轴，按定稿的换算与 Medium 表映射；只有变化的轴被应用；非零→零不等待旧计时；地图与基地中非零不施加手动轴；退出后中立输入不恢复旧轴；已有速度与独立规则不被误清；扰动抽取与浮点路径按 M-02。
- [ ] AC-04（部分）：四种速度操作与 `select-number` 1–9（原版 Shift+n 档位）各有一次、原索引的结果；油门由请求携带、不保存为状态；读回、步长、钳位与表索引钳制正确；同 tick 多命令按数组顺序；错误上下文与玩家不可用分别反馈；未实现的命令不误报成功。
- [ ] P3-02 的暂停边界不变；Core 没有跨 tick 的按键或命令队列。
- [ ] `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts` 与 `pnpm check` 通过。

## 验证方法

- Node 单元与阶段测试；期望独立推导。
- 按 execute-goal 的流程完成 rubber-duck 审查后，以本项写入范围调用 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。
- 不涉及浏览器。

## 完成证据
