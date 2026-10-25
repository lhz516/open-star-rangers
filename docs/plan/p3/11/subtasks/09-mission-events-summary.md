---
type: plan
status: active
phase: P3
task: "11"
subtask: "09"
updated: 2026-10-23
---

# 09 — 段 2 计数、任务总结与创建时检查

**契约来源：** [spec](../spec.md) 的 S-02、AC-02；[段 2 事件触发与任务总结](../spec.md#段-2-事件触发与任务总结)；Q-02、Q-03 的已归档结论（04）。
**依赖：** 08。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 在原定调用点接入对象事件 `0x6977c`（计划新增 `src/core/systems/mission-events.ts`）：被毁在 [damage.ts](../../../../../src/core/systems/damage.ts) 的 `0x3c0f4` 之后、同一阶段立即处理；实例化在 [spawn.ts](../../../../../src/core/systems/spawn.ts)；世界出口在 [area.ts](../../../../../src/core/systems/area.ts)。按来源记录的触发增加实例化、被毁、出口计数；按 Q-02 处理玩家、声明对象、动态 Xpon 与无来源对象；只为本任务有读者的按种类记录与出现标志建状态。
- 任务总结的纯规则（计划新增 `src/core/rules/mission-summary.ts`）：第一个计数非零的触发 → 截断比例 → 第一个包含它的区间 → 转到下一个触发；零分母、空消息、无匹配与 i8 选择值按 Q-03。只返回触发号与区间号的引用，不复制文字。
- 创建时的语义检查（[setup-check.ts](../../../../../src/core/world/setup-check.ts)）：不支持的总结选择值语义等在建世界前以结构化错误拒绝；不新增 Core 原始头字段，原始特殊模式与生成配对的已有解析拒绝保持有效。
- 测试：计数各路径、不重复记击杀、Xpon 与退场移除不误报、区间两端/缺口/零分母/空消息/多消息/无匹配/选择值符号，以及创建拒绝的路径与字段。

## 不包含

- 全清判定与预结算时机（10）；总结文字的解析与显示（17）。

## 关键文件与契约

- [logic-content.ts](../../../../../src/content/logic/logic-content.ts) 的 `EventTrigger`、`EventRange`；[create-world.test-support.ts](../../../../../src/core/world/create-world.test-support.ts) 的 `eventMission`；[scen.ts](../../../../../src/original-data/formats/scen.ts)（只读，确认已有拒绝）。

## 写入范围

- `src/core/systems/mission-events.ts`：计划新增的对象事件处理。
- `src/core/systems/mission-events.test.ts`：计划新增的测试。
- `src/core/rules/mission-summary.ts`：计划新增的总结规则。
- `src/core/rules/mission-summary.test.ts`：计划新增的测试。
- `src/core/systems/damage.ts`：`0x6977c` 的静态调用。
- `src/core/systems/spawn.ts`：实例化的调用。
- `src/core/systems/area.ts`：世界出口的调用。
- `src/core/world/setup-check.ts`：创建时语义检查。
- `src/core/world/*.test.ts`：创建拒绝的测试。
- `src/core/systems/*.test.ts`：受影响的既有测试。
- `src/core/world/create-world.test-support.ts`：`eventMission` 的总结选择值改为创建时检查接受的值（ME-02）。
- `src/original-data/formats/formats.test-support.ts`：合成 SCEN 的总结选择值改为 ME-02 接受的值。
- `src/original-data/formats/formats.test.ts`、`src/original-data/conversion/convert-logic.test.ts`：与之对应的期望值。

## 验收标准

- [x] 三类事件按来源与调用点分别计数；击杀不重复，Xpon 与退场移除不误报。（AC-02）
- [x] 总结选择覆盖全部边界并只在预结算时调用；结果为引用，不含文字。（AC-02）
- [x] 不支持的语义在创建时拒绝；原始解析的已有拒绝测试仍通过。（AC-02）
- [x] 期望独立推导；受影响的 Vitest、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- 合成内容的 Core 测试；不读原版文件。
- 按 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 清理本项范围。

## 完成证据

- **2026-10-23（worker，基线 `4a4ef83d`）：**
  - **对象事件 `0x6977c`（AC-02，ME-04、ME-08）：** 新增 [mission-events.ts](../../../../../src/core/systems/mission-events.ts) 的 `reportObjectEvent(context, entity, type)`：无来源的对象直接返回；来源声明（任务声明或僚机选项）的 `eventTrigger` 非 null 时，类型 3、0/1、2 分别使 `instantiated`、`destroyed`、`left` 加 1；越过 i32 为 `invariant-violated`（`mission-events.count`）。三处调用：[damage.ts](../../../../../src/core/systems/damage.ts) 的 `destroy` 在 `0x3c0f4` 与 `object-destroyed` 之后、击杀计数之前，以同一个 `eventClass`；[area.ts](../../../../../src/core/systems/area.ts) 的 `arrive` 在 `object-left-world` 之后（僚机已在其前排除）；[spawn.ts](../../../../../src/core/systems/spawn.ts) 的 `instantiate` 最后一步。全清判定与 `all-clear` 事件留给 10（同一入口）。不建按种类表、`0x1b46ec`、出现标志与扇区簿记（ME-01）。
  - **测试（期望由合成任务的声明推导）：** [mission-events.test.ts](../../../../../src/core/systems/mission-events.test.ts)：切片形任务的第一次正式 step 中，玩家、记录 3（2 架）与记录 8（35 架）计入触发 0（38），编组成员 4、6 按各自成员记录计入触发 1（2×2 + 2×2 = 8），基地与僚机不计，计数不产生事件；没有触发时计数为空。被毁：玩家击杀（类别 0）、碰撞低于 0（`0x3c0f4` 两次、计数一次）、区域伤害、对已被毁对象的再次命中与接触都不重复；基地、无来源的 7 与无来源的 14（动态 Xpon 的形状）不计；玩家自身被毁计入其触发（Q-02，玩家不预设为不计）。世界出口：有来源的两项各计 1 次、无来源与无触发的不计、僚机与界内对象不离开；下一 tick 的移除不再计数。i32 上界：0x7ffffffe → 0x7fffffff，再加为故障且值不变。
  - **总结规则（AC-02，ME-05、ME-17 决定 6）：** 新增 [mission-summary.ts](../../../../../src/core/rules/mission-summary.ts) 的 `summaryRatio` 与 `selectSummary(mission, triggers, counts)`：跳过 `instantiated`、`destroyed` 皆为 0 的触发（不看 `left`）；比例为 f64 的 (d ÷ i) × 100 向零截断，i = 0 时为 0；取第一个 lower ≤ 比例 ≤ upper 的区间，无匹配试下一个触发；结果只有 `{ mission, trigger, range }` 引用与选择值，皆无匹配为 `null`/−1。[mission-summary.test.ts](../../../../../src/core/rules/mission-summary.test.ts) 覆盖两端、重叠取首、缺口转下一触发、零分母（有被毁无实例化为比例 0）、只有出口的触发被跳过、有符号界与 lower > upper、空消息与多消息只返回引用、负选择值原样、无触发与全无匹配、f64 次序（29/100 → 28、57/100 → 56）与不改参数。本项不调用它：预结算（主状态 3→4）的唯一调用由 10 接入。
  - **创建时检查（AC-02，ME-02、ME-17 决定 5）：** [setup-check.ts](../../../../../src/core/world/setup-check.ts) 的 `checkSetup` 末尾（`buildSpawnState` 之前）拒绝 ≤ 0 与 13–19 之外的 `summarySelector`，路径 `input.mission.content.eventTriggers[i].ranges[k].summarySelector`，原因不回显值。ME-02 写“CB-01 的检查之后、`buildSpawnState` 之前”，而 CB-01 的检查（`communicationsRuleData`）在 `buildSpawnState` 之后，两者不能同时成立；取后者，只影响多个错误同时存在时的报告次序。[create-world.test.ts](../../../../../src/core/world/create-world.test.ts) 的“summary selectors”组：1、11、12、20、35、36、127 在其区间路径被拒绝（`instantiableModelIds` 同样拒绝），−128、−1、0、13、19 与 lower > upper 的区间被接受；setupHash 测试的两个改动值改为受支持的 14、13。`eventMission()` 第二个触发的选择值 9 改为 16；合成原版 SCEN `defaultScenarioSpec()`（[formats.test-support.ts](../../../../../src/original-data/formats/formats.test-support.ts)）第二个触发的选择值 6 改为 16，`formats.test.ts` 与 `convert-logic.test.ts` 的对应期望随之改变，原始值域的解析器测试（−128、127 等）不变（均为协调者批准的范围）。原始解析边界的已有拒绝（特殊模式、生成配对）在 `src/original-data/formats` 的测试中照旧通过。
  - **检查：** 新增两文件 17 项通过；`pnpm check`（TypeScript、ESLint、Vitest、构建）通过：341 个文件 10,135 项，无超时。
  - **rubber-duck：** 未发现问题（认可三处调用的位置与次序、`destroy` 的被毁门禁防止重复、无来源与退场不计、选择规则与 −1、创建检查的取值与路径，以及检查放在 `checkSetup` 末尾的处理）。**simplify：** 采纳 `destroy` 中只算一次 `eventClass`、去掉 `spawn.ts` 重复的行内注释；未采纳把 `0x6977c` 的数字类型改为字符串（ME-08 与 10 的 `all-clear.eventClass` 直接用原版的 0–3）、去掉 i32 越界故障（ME-04 规定越界为故障）、提取跨模块的声明查找与测试辅助（在本项写入范围之外，收益小）、测试表格化（不改变覆盖）。
  - **文档影响：** [Core 模块说明](../../../../engineering/modules/core.md)的世界创建第 3 步列出了 `checkSetup` 的各项拒绝，应增加“段 2 区间的总结选择值不在 ≤ 0 或 13–19 内（ME-02）”，并可在事件触发一条注明 Core 现按 ME-08 计数；该文件不在本项写入范围，已在交接中提出。原版事实与未决项不变（没有新事实）。
