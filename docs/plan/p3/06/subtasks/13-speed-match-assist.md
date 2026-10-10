---
type: plan
status: active
phase: P3
task: "06"
subtask: "13"
updated: 2026-10-10
---

# 13 — 匹配速度与速度辅助

**契约来源：** [spec](../spec.md) 的 S-05（匹配与辅助、目标引用）；AC-04（`match-target`、`toggle-auto-match` 与确认键别名的命令结果）、AC-05；[匹配速度与速度辅助](../spec.md#匹配速度与速度辅助)；D-03、D-06；检查点 A 定稿的开关关系与事件形状。
**依赖：** 12。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **目标引用：** 玩家更新开始时，不能解析的目标 ID 清为 null（原版丢弃失效句柄）；玩家实体移除时随玩家引用清除。停放时清除归 14，Warp 开始清除归 P3-09。选择与切换目标归 P3-07，测试经内部状态设置目标，不开放生产写入口。
- **手动匹配：** `speed/match-target` 与普通飞行中的 `confirm-selection`（别名，保留原命令类型与索引，只发一个结果）在飞行上下文判定：目标为空或没有移动块为 `ignored`/`no-target`；否则 `accepted` 并投递内部 `match-speed` 请求。请求处理中按 `0x21adc` 应用：目标当前速度钳到 [0, 玩家最高速度]，模式 `craft` 时写指令速度并清到达，否则写当前速度；不检查锁定；成功时发 `speed-matched`（`origin: 'command'`）。`0x21adc` 作为规则函数交付（P3-08 的 AI 匹配复用）。12 的同 tick 读回推算计入匹配请求的效果。
- **开关：** 飞行上下文中 `toggle-auto-match` 翻转唯一的速度辅助开关（与难度辅助是同一开关），紧随其结果发 `speed-assist-toggled`；开启时到期时刻归 0、清除“已匹配”，关闭时两者不变。
- **速度辅助：** 玩家可用时，在玩家更新中、失效目标清除之后、命令判定与轴的变化检测之前运行，不论视角模式：
  - 无有效目标且“已匹配”：投递满油门、三轴不变的 `control` 请求（先于本 tick 命令的请求），清除“已匹配”，发 `speed-assist-released`；
  - 有效目标：种类在辅助种类掩码内、时钟不早于到期时刻（含等号）、三维距离平方（各分量差乘以其 f32 舍入值后求和）不大于阈值平方（含等号）时，记录速度差是否超过常数，直接按 `0x21adc` 写玩家移动块，置“已匹配”，到期时刻 = 本次时钟 + 固定间隔（不追赶）；写入成功时发 `speed-matched`（`origin: 'assist'`，带速度差标志）；目标没有移动块时写入失败，但“已匹配”与到期时刻照样更新；
  - 范围外、种类不符或未到期时无作用，计时不推进。
- **持续状态：** 开关与“已匹配”是世界状态，供 15 的 projection 读取；HUD 闪烁、开/关消息的呈现归 P3-13。
- **测试：** 组初值；开启时的复位与关闭时不变；目标有效、变更（不复位计时）、失效、移除、被毁（仍可匹配）与无移动块；种类掩码；距离等号与两侧；计时等号与跨阈值、多次重新计时；匹配后失去目标的满油门请求、事件与只发一次；速度差标志两侧；同 tick 辅助、命令与操纵应用的先后；事件内容与次序；锁定时手动匹配仍生效。

## 不包含

- 目标选择（P3-07）；停放时清除目标（14）；projection（15）。

## 关键文件与契约

- 12 的 `src/core/systems/flight-control.ts` 与 `src/core/rules/flight-control.ts`；[pipeline.ts](../../../../../src/core/systems/pipeline.ts)；[player-state.ts](../../../../../src/core/world/player-state.ts)。
- 03 的完成证据与检查点 A 定稿；[scenario 的难度读取路径 8](../../../../original/formats/scenario.md#difficulty-readers-p3-01)。

## 写入范围

- `src/core/systems/pipeline*.ts`：辅助在玩家更新中的位置及测试。
- `src/core/systems/flight-control*.ts`：匹配与辅助及测试。
- `src/core/rules/**`：匹配条件与计时纯函数及测试。
- `src/core/world/**`：辅助状态与目标引用读写所需的最小改动。

## 验收标准

- [x] AC-05：手动匹配与速度辅助按 M-05 区分；条件矩阵、等号与跨阈值、多次重新计时（不追赶）、失去目标的恢复与 `speed-assist-released`、速度差标志、先后次序与事件内容通过；失败无成功事件。
- [x] AC-04（部分）：`match-target`、`toggle-auto-match` 与确认键别名各有一次、原索引的结果；无目标或目标无移动块为 `no-target`。
- [x] 失效目标在玩家更新开始时清除；没有在生产入口注入目标的途径。
- [x] `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts` 与 `pnpm check` 通过。

## 验证方法

- Node 条件矩阵与事件序列测试；期望独立推导。
- 按 execute-goal 的流程完成 rubber-duck 审查后，以本项写入范围调用 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。
- 不涉及浏览器。

## 完成证据

- **实现：**
  - [rules/speed-match.ts](../../../../../src/core/rules/speed-match.ts)（新建，纯函数）：`0x21adc` 的 `matchedSpeed`（所有调用者的参数 a = 0、lo = 0、hi = 1：目标当前速度在双精度中与 f32(最高速度 × 0) 比较下界，f32 值与 f32(最高速度) 比较上界）、`speedMatch`（门禁：双方都有移动块且主体有机型记录；不查锁定；返回将写入的值或 null）与 `applySpeedMatch`（模式 `craft` 写指令速度并清到达，其他模式写当前速度）；交 P3-08 的 AI 匹配复用。辅助条件：种类掩码 `0x380`（种类位 7、8、9）、`squaredDistance`（Σ dᵢ × f32(dᵢ)，双精度）、`withinAssistRange`（只在大于 90000 时跳过，等号匹配）、`speedDifferenceExceeded`（|f32(玩家速度) − 目标速度| > 10，严格）、`ASSIST_INTERVAL` = 32 时钟单位与 `nextAssistDue`（本次时钟 + 32，不追赶；超出安全整数为 `budget-exhausted` 故障）。
  - [systems/flight-control.ts](../../../../../src/core/systems/flight-control.ts)：玩家可用时，玩家更新依次为失效目标清除（不能解析的 ID 清为 null；之后标出 P3-07 导弹锁定 `0x2ddbc` 的位置）→ 速度辅助（开关开启时运行，不论视角模式）→ 命令判定 → 轴的变化检测。辅助的恢复请求（满油门、三轴不变）在命令的请求之前单独投递；轴只并入命令投递的最后一个 `control` 请求，不并入辅助请求或 `match-speed` 请求。辅助在有效目标分支中先记录速度差，再直接写玩家移动块，置“已匹配”并从本次时钟重新计时（写入失败也如此），只在写入成功时发 `speed-matched`（assist）。命令判定沿用 12 的次序（not-implemented → player-unavailable → wrong-context → accepted）：`match-target` 与飞行中的 `confirm-selection`（基地、地图中仍为 not-implemented，Warp 中为 wrong-context）在目标为空或无移动块时为 `ignored`/`no-target`，否则 `accepted` 并投递 `match-speed` 请求，读回推算按 `speedMatch` 计入匹配值（锁定不影响）；`toggle-auto-match` 翻转开关（开启时到期时刻归 0、清除“已匹配”，关闭时两者不变），紧随其结果发 `speed-assist-toggled`。新增 `applyMatchRequest`：请求处理中目标已不能解析或任一方没有移动块时无作用；写入成功时发 `speed-matched`（command，带原命令索引）。
  - [pipeline.ts](../../../../../src/core/systems/pipeline.ts)：`Request` 增加 `MatchSpeedRequest`（消息 0x80000），请求处理调用 `applyMatchRequest`；`leave` 移除玩家实体时与 `entityId` 一起清除 `player.target` 与 `player.control`（10 的交接）。
  - 失效目标清除只在玩家可用时进行（原版在状态 7 且未被毁的回调分支中丢弃句柄）；玩家不可用期间的过期 ID 留到下一次可用的更新或玩家移除时清除。生产代码对 `player.target` 只写 null（实例化、失效清除、玩家移除）；`TickInput` 中的 `target` 命令仍为 not-implemented，没有注入目标的入口。
- **测试：**
  - [rules/speed-match.test.ts](../../../../../src/core/rules/speed-match.test.ts)（19 例）：钳制（范围内、0、最高速度、上方、负值、恰高于最高速度的 f32、−0 保持）；`craft` 模式写指令速度并清到达、其他模式写当前速度；锁定不阻止；三种失败（主体无块、无机型记录、目标无块）不写入；种类掩码恰为 7、8、9；平方距离的单因子 f32 舍入（d = 1 + 2⁻³⁰ 得 1 + 2⁻³⁰，而 d² 为 1 + 2⁻²⁹）；距离等号（沿轴 300 与三维 (100, −200, 200)）与两侧；速度差在 10 处严格；重新计时与安全整数故障。
  - [systems/flight-control.test.ts](../../../../../src/core/systems/flight-control.test.ts)（87 例，新增 40 例，经真实阶段到请求处理为止，另有一例走完整 `World.step`）：失效目标在更新开始时清除、被毁与待移除的目标保留；两种匹配命令各一个原索引的 `accepted` 结果、`match-speed` 请求与请求处理中的 `speed-matched`（command）；无目标、目标已移除、目标无移动块为 `no-target` 且不改状态；钳制；被毁目标、任意距离与种类、辅助关闭时手动匹配仍生效；锁定时匹配生效、之后的增减从匹配值读回且被锁定丢弃；同 tick `[zero, match, increase]` 与 `[increase, match]` 的读回推算；轴不并入 `match-speed` 请求；目标在匹配请求之后离开时仍匹配，在请求处理前被移除时不写入、不发事件。开关：结果之后紧随 `speed-assist-toggled`、同 tick 两次切换；开启复位、关闭不变；辅助下一 tick 才看到切换；关闭时不运行（不释放）；关再开后失去目标不恢复。辅助：直接匹配并从本次时钟 + 32 计时；地图视角中照常运行；只匹配种类 7、8、9（其他种类计时不变）；距离等号与两侧、以玩家位置为原点；到期等号与之前不推进计时；6 单位步长下匹配时钟为 6、42、78、114（不追赶）；更换目标不复位计时；被毁目标仍匹配；目标无移动块时不写、不发事件但置“已匹配”并计时；速度差两侧（38/37.5，58/58.5）；目标移除或清空后只释放一次：满油门请求先于命令请求、`increase` 从匹配值读回、`speed-assist-released` 先于命令结果；无命令时恢复请求与只带轴的请求分开；辅助先于命令（读回自辅助的写入、事件先于结果）；锁定时辅助与手动匹配同 tick 共存；玩家不可用时不运行；group 0 的世界无按键自动匹配。
  - 既有测试的修正：flight-control 的“命令结果”用例把 `match-target`、`toggle-auto-match`、`confirm-selection` 计入 P3-06 的命令（玩家不可用、Warp/基地/地图上下文的原因码，待移除玩家被移除后控制状态为 null）；[world.test.ts](../../../../../src/core/world/world.test.ts) 的全命令用例中飞行上下文的 `speed` 与 `confirm-selection` 改为 `player-unavailable`；[pipeline.test.ts](../../../../../src/core/systems/pipeline.test.ts) 的玩家移除用例同时断言目标与控制状态被清除。
- **检查：** `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts` 通过（45 个文件，1,518 例）；`pnpm check` 通过（typecheck、lint、216 个测试文件 6,901 例、build）。
- **审查：** rubber-duck 审查完整差异，没有发现问题。simplify（复用、简化、效率、层次四个角度）：去掉单次使用的 `ControlledPlayer` 包装（玩家与控制状态回到局部变量）、`accepted` 结果改为构造函数而不预先分配、内联只有一个调用者的到期判断 `assistDue`、把一个含两个场景的测试拆成两例。未采纳：把 `match-speed` 请求改为不带命令索引的通用形状（形状由检查点 A 定稿，AI 的请求由 P3-08 按扩展规则加入）；合并三处一行的种类掩码判断（另两处在本项之外的模块）；每 tick 只为一个玩家多做的几次 Map 查找与 `entries()` 迭代（开销可忽略）；精简与规则测试重叠的系统层条件矩阵（AC-05 要求在阶段中验证每个条件的接入）。
- **文档影响：** [core 分册](../../../../engineering/modules/core.md)的请求类型、命令判定与扩展规则段（12 已记为过时）现在还缺 `match-speed` 请求、辅助与匹配事件的发出位置以及玩家移除时清除目标与控制状态，属于 19 的交接，未在本项修改。原版事实没有新增（实现全部依据 executable 的 P3-06/03 一节）；STATUS 与阶段索引不需要改动。

