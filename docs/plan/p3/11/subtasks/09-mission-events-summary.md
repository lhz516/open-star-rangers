---
type: plan
status: active
phase: P3
task: "11"
subtask: "09"
updated: 2026-10-17
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

- [ ] 三类事件按来源与调用点分别计数；击杀不重复，Xpon 与退场移除不误报。（AC-02）
- [ ] 总结选择覆盖全部边界并只在预结算时调用；结果为引用，不含文字。（AC-02）
- [ ] 不支持的语义在创建时拒绝；原始解析的已有拒绝测试仍通过。（AC-02）
- [ ] 期望独立推导；受影响的 Vitest、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- 合成内容的 Core 测试；不读原版文件。
- 按 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 清理本项范围。

## 完成证据
