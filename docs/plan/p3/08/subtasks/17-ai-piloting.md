---
type: plan
status: active
phase: P3
task: "08"
subtask: "17"
updated: 2026-10-15
---

# 17 — AI 驾驶

**契约来源：** [spec](../spec.md) 的 S-06、AC-05；[AI 驾驶](../spec.md#ai-驾驶)；03 的研究与 08 定稿的请求。
**依赖：** 15。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 在 [steering.ts](../../../../../src/core/rules/steering.ts) 上扩展 AI 机体所需的转向（提前量模式、横滚匹配、噪声例程、+0x118 点积判定等支持范围内的部分），不另建模块；计划新增 `src/core/rules/ai-piloting.ts` 放置 AI 移动助手对消息 0x40000、0x80000 的组装。
- [missiles.ts](../../../../../src/core/systems/missiles.ts) 的 `applySteer` 接受 AI 机体，经 P3-06 的 `applyFloatControl` 应用；[flight-control.ts](../../../../../src/core/systems/flight-control.ts) 的速度匹配请求加入 AI 形状，复用 `applySpeedMatch`。
- 原版直接调用的移动块重建等按所属规则与阶段执行。
- 复核 P3-06 已知差异中“对象更新与请求处理之间的指令速度读者”，结论写入完成证据（28 并入 Core 模块说明）。
- 测试：AI 请求经正式流水线产生运动；投递次序、同 tick 多请求、主体或目标失效；导弹的既有行为不变。

## 不包含

- 何时驾驶（解释器 16、处理器 18/19/21）。

## 关键文件与契约

- 已有：[steering.ts](../../../../../src/core/rules/steering.ts)、[missiles.ts](../../../../../src/core/systems/missiles.ts)、[flight-control.ts](../../../../../src/core/systems/flight-control.ts)。
- 计划新增：`src/core/rules/ai-piloting.ts` 及其测试。

## 写入范围

- `src/core/rules/steering.ts`：AI 转向扩展。
- `src/core/rules/steering.test.ts`：测试。
- `src/core/rules/ai-piloting.ts`：AI 驾驶请求（新建）。
- `src/core/rules/ai-piloting.test.ts`：测试（新建）。
- `src/core/systems/missiles.ts`：`applySteer` 的机体应用。
- `src/core/systems/missiles.test.ts`：测试。
- `src/core/systems/flight-control.ts`：AI 速度匹配。
- `src/core/systems/flight-control.test.ts`：测试。
- `src/core/rules/speed-match.ts`：速度匹配一般化为 (a, lo, hi)（修订 ⑧）。
- `src/core/rules/speed-match.test.ts`：一般化与 (0, 0, 1) 位一致的测试。
- `docs/original/formats/executable.md`：A2–A5 实现中核实的代码事实。

## 验收标准

- [ ] AC-05 由流水线测试覆盖；导弹与玩家的既有测试通过。
- [ ] 指令速度读者的复核结论已记录。
- [ ] `pnpm exec vitest run src/core` 通过。

## 验证方法

- Node 流水线测试，期望由 03 与 P3-06 的记录独立推导。
- 按 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 清理本项范围。

## 完成证据
