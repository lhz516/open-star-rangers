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

- [x] AC-03：每 tick 消费轴，按定稿的换算与 Medium 表映射；只有变化的轴被应用；非零→零不等待旧计时；地图与基地中非零不施加手动轴；退出后中立输入不恢复旧轴；已有速度与独立规则不被误清；扰动抽取与浮点路径按 M-02。
- [x] AC-04（部分）：四种速度操作与 `select-number` 1–9（原版 Shift+n 档位）各有一次、原索引的结果；油门由请求携带、不保存为状态；读回、步长、钳位与表索引钳制正确；同 tick 多命令按数组顺序；错误上下文与玩家不可用分别反馈；未实现的命令不误报成功。
- [x] P3-02 的暂停边界不变；Core 没有跨 tick 的按键或命令队列。
- [x] `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts` 与 `pnpm check` 通过。

## 验证方法

- Node 单元与阶段测试；期望独立推导。
- 按 execute-goal 的流程完成 rubber-duck 审查后，以本项写入范围调用 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。
- 不涉及浏览器。

## 完成证据

- **实现：**
  - [rules/flight-control.ts](../../../../../src/core/rules/flight-control.ts)（纯函数）：Medium 灵敏度表（二次，中项为 −0：原版先存正值后存负值）、`axisDeflection`（向零截断 ×128，不产生 −0）、读回 `throttleReadback`（`0x21ca8`，超出 i32 为故障）、`increasedThrottle`/`decreasedThrottle`（步长 12，`+` 钳到 128，`−` 只钳到 0）、`presetThrottle`（14 × (n − 1)）、整数路径 `applyIntegerControl`（`0x21dd0`）与浮点路径 `applyFloatControl`（`0x21fd8`，扰动时 5 次抽取，随机方向用 10 的 `randomDirection`；不扰动时 craft 速率 × (−s) 留在双精度，扰动时先存为 f32；`0x22b68` 先存 f32，再以双精度和比较上界、以 f32 值比较下界；清除时俯仰与横滚清标志，偏航清速率）。两条路径共用 `controlApplies` 的门禁，原地改写所给的移动块。交 P3-07：导弹直接调用 `applyFloatControl`；上限降低规则 `0x21d88` 已由 10 交付为 [flight-state.ts](../../../../../src/core/rules/flight-state.ts) 的 `applyRecomputedMaximum`。
  - [systems/flight-control.ts](../../../../../src/core/systems/flight-control.ts)：玩家更新 `updatePlayer`（对象更新阶段开头，玩家在遍历中最先）。玩家可用 = 实体存在、未被毁、状态 7（`availablePlayer`）；可用玩家缺少控制状态为故障。命令判定次序：本上下文中 P3-06 不处理的命令为 `rejected`/`not-implemented`（基地与地图中的 `select-number`、`match-target`、`toggle-auto-match`、`confirm-selection` 等）→ `player-unavailable` → 非飞行上下文 `wrong-context` → `accepted`。读回的基准为批次开始时的指令速度，每条被接受的油门命令按与应用相同的门禁与 `throttleSpeed` 推算（锁定时不变）。请求在玩家更新末尾按产生次序投递，轴的变化并入最后一个命令请求（为 `control` 时）或单独投递。注释标出 13 的失效目标清除与速度辅助、P3-07 的导弹锁定（`0x2ddbc`，在清除与辅助之间）与自动选择目标（玩家更新末尾）的位置。
  - [pipeline.ts](../../../../../src/core/systems/pipeline.ts)：`Request` 增加 `ControlRequest`，请求处理按投递次序调用 `applyControlRequest`（抽取来自世界 RNG）；请求上界的依据注释改为实体 + 生成扩展 + 命令 + 2（实体上限下 3,138）。
- **测试：**
  - [rules/flight-control.test.ts](../../../../../src/core/rules/flight-control.test.ts)（78 例）：灵敏度表 ±k²/4096 与 −0 中项；换算（±1、0、−0、非整数、不足一个刻度）；读回（无块、上限非正、k/64 × 最高速度读回 2k、匹配后的比例、负值向零截断、i32 越界故障）；步长与钳位；9 个档位；整数路径的门禁（无块、无记录、锁定时不抽取）、油门与表索引钳制、各偏转的速率与标志（含 −1 的 −0 速率）、0 关闭、扰动 3 次抽取与 ±128 钳位、等级 2 偏置、只带油门或不改变任何值的消息也抽 3 次、偏转越界故障；浮点路径的门禁、线性速率、双精度与 f32 乘积的区别、清除的偏航特例、速度系数、5 次抽取与 ±s 钳位、方向的象限、等级 2 浮点偏置、载荷与溢出故障。
  - [systems/flight-control.test.ts](../../../../../src/core/systems/flight-control.test.ts)（47 例，经真实的阶段到请求处理为止，另有一例走完整 `World.step`）：四种速度操作与 9 个档位各一个原索引的 `accepted` 结果与指令速度；油门不保存为状态、每个请求携带自己的油门；匹配后的读回；上限降低后读回超过 128 的钳制；同 tick 多命令按数组顺序推算读回；锁定时结果仍为 `accepted`、推算不变；无跨 tick 的命令；无玩家、新建/区域切换/待移除/被毁源状态、被毁标志均为 `player-unavailable` 且不改状态、不抽取、不消费轴；Warp、基地、地图的原因码；`player-unavailable` 先于 `wrong-context`；13 与其他任务的命令保持 `not-implemented`。轴：Medium 映射到第 1、2、3 行、截断、只应用变化的轴、保持不变时不再应用、松开时当 tick 关闭并保留速率、锁定时上次读数仍更新、地图与基地中有效轴为 0 且不清除指令速度/冲量/定时旋转、退出后中立输入不恢复、Warp 中应用、玩家不可用时不消费、缺控制状态故障。请求：合并与单独的轴请求、按投递次序应用并保存投递时的值、扰动只在被接受的消息上每条抽 3 次（合并的请求只抽一次）、无移动块的请求无作用。
  - 既有测试的修正（输入开始生效后）：[world.test.ts](../../../../../src/core/world/world.test.ts) 的手工玩家补上控制状态，全命令用例中飞行上下文的 `select-number` 改为 `player-unavailable`（该 tick 玩家尚未活动）；[render-state.test.ts](../../../../../src/core/projections/render-state.test.ts) 补上控制状态；[replay.test.ts](../../../../../src/core/replay/replay.test.ts) 的“无可观察效果的输入变化”改用不足一个刻度的轴值（协调者按 scope-request 加入写入范围）。
- **检查：** `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts` 通过（44 个文件，1,459 例）；`pnpm check` 通过（typecheck、lint、215 个测试文件 6,842 例、build）。
- **审查：** rubber-duck 审查完整差异，没有发现问题。simplify：去掉判定中只调用一次的闭包、把以 `return` 代替 `continue` 的 `forEach` 改为循环；保留规则函数中为类型收窄而重复的 `record === undefined`、合并时的 `type === 'control'` 判断（13 会在同一列表加入 `match-speed` 请求）与每个请求新建的 `RandStream`（开销可忽略）。
- **文档影响：** [core 分册](../../../../engineering/modules/core.md)的原因码（第 108 行）、请求类型与命令判定（第 168–169 行）及扩展规则中的命令一条（第 265 行）已过时，属于 19 的交接，未在本项修改。新确认的原版数值细节（灵敏度表中项为 −0、`0x22b68` 的比较方式、浮点路径不扰动时乘积留在双精度、扰动偏移的运算次序）尚未写入 executable，建议由 19 补入。STATUS 与阶段索引不需要改动。
