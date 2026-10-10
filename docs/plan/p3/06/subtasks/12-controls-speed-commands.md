---
type: plan
status: active
phase: P3
task: "06"
subtask: "12"
updated: 2026-10-09
---

# 12 — 操纵与速度命令

**契约来源：** [spec](../spec.md) 的 S-04、S-05（油门与速度命令）；AC-03、AC-04（命令部分）；[操纵](../spec.md#操纵)、[速度与油门](../spec.md#速度与油门)、[行为与边界](../spec.md#行为与边界)；D-04、D-08；技术决定 8、9、10。
**依赖：** 11。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **轴：** 每个成功 tick 消费本次轴快照，不在 Core 建 DOS 设备轮询计时器或跨 tick 的手动按住缓存；项目轴到原版操纵值的换算与轴、符号对应按 M-02/M-03；响应曲线按 M-03 与检查点 C 的档位（Core 常量，不读本机设置）。手动轴归零在当前 tick 停止旧的手动转向，不清除独立的冲量、自动匹配开关或指令速度。
- **地图与上下文门禁：** 视角模式为地图时，即使输入非零也防御性使用零手动轴并对飞行命令返回 `ignored`/`wrong-context`；基地与 Warp 等上下文按 M-04 的结论处理，尚无专用规则的命令保持 `not-implemented`。地图模式本身由 P3-09 实现，本项测试经内部状态设置视角模式。
- **速度命令：** `speed` 的 `increase`、`decrease`、`zero`、`maximum`，以及普通飞行上下文的 `select-number` 1–9，按 M-04 写入油门；`navigate-selection` 不解释为速度。每个合法命令恰好一个带原 `commandIndex` 的结果；同 tick 多个命令按数组顺序判定，不因 DOS 轮询丢弃。
- **操纵应用（`0x21dd0`）：** 新增封闭的内部请求类型，在请求处理阶段按投递次序应用；请求保存当时的油门与轴值，不引用之后被改写的控制块。扰动分支（若可达）的条件、抽取次数与次序进入世界 RNG。浮点路径（`0x21fd8`）若检查点 A 定为需要，作为规则函数交付并测试。
- **原因码：** 玩家缺失、被毁、尚未活动或正在移除为 `player-unavailable`；上下文不处理为 `wrong-context`。
- **测试：** 轴消费与中立输入、非零→零、地图中非零、退出地图后中立输入不恢复旧轴；每种速度命令与数字档；同 tick 多次增减与置零；各原因码；扰动抽取；请求保存当时的值。

## 不包含

- `match-target`、`toggle-auto-match` 与 `confirm-selection` 的匹配别名（13）。
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

## 验收标准

- [ ] AC-03：每 tick 消费轴；非零→零不等待旧计时；地图中非零不施加手动轴；退出后中立输入不恢复旧轴；已有速度与独立规则不被误清；映射、扰动与浮点路径（若实现）按 M-02/M-03。
- [ ] AC-04（部分）：六种速度操作中的四种与数字 1–9 各有一次、原索引的结果；同 tick 多命令按数组顺序；错误上下文与玩家不可用分别反馈；未实现的命令不误报成功。
- [ ] P3-02 的暂停边界不变；Core 没有跨 tick 的按键或命令队列。
- [ ] `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts` 与 `pnpm check` 通过。

## 验证方法

- Node 单元与阶段测试；期望独立推导。
- 按 execute-goal 的流程完成 rubber-duck 审查后，以本项写入范围调用 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。
- 不涉及浏览器。

## 完成证据
