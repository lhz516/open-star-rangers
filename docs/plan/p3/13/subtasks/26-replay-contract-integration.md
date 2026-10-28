---
type: plan
status: active
phase: P3
task: "13"
subtask: "26"
updated: 2026-10-28
---

# 26 — 真实链、回放与帧分组一致性

**契约来源：** [spec](../spec.md#验收标准) 的 AC-01/03/04/13/14/25。
**依赖：** 25。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 使用实际Core→Runtime→Session→驾驶舱表现（含锁定与类型9视觉，D-02定稿），比较同种子输入在1×5、5、2+0+3帧分组下的模型状态和随机抽取。
- 必须包含切页、损伤、目标离开、来电同tick开始结束及绘制前后事件，不用恒定projection代理。
- 有无GPU层/声音读者时Core事件与周期哈希相同，P3-12表现流不被驾驶舱消耗。
- 验证容量前缀、transition/completed截断、Core/读模型/消费者失败、跨run和版本拒绝。

## 不包含

不更改行为以通过测试；发现缺口交协调者新增修复项，不在验证项暗改功能。

## 关键文件与契约

- [game-runtime-outputs.test.ts](../../../../../src/app/runtime/game-runtime-outputs.test.ts)、[game-session-presentation.test.ts](../../../../../src/app/session/game-session-presentation.test.ts)。
- 计划新增 `src/render/cockpit/cockpit-integration.test.ts`，使用真实驾驶舱表现模块（D-02定稿不建P3-14共享模型）。

## 写入范围

- `src/render/cockpit/cockpit-integration.test.ts`：计划新增组合回归。
- `src/render/cockpit/cockpit-integration.test-support.ts`：计划新增合成夹具。
- `src/app/runtime/game-runtime-outputs.test.ts`：真实TickOutput断言。
- `src/app/session/game-session-presentation.test.ts`：真实消费者排序。
- `src/core/replay/*.test.ts`：规则不变/版本拒绝回归。

## 验收标准

- [ ] 动态输入的分帧一致性、Core/RNG不变性有可重复断言。
- [ ] 一次性事件只消费一次，无中间projection丢失或未来状态倒填。
- [ ] 使用真实Core/Runtime/驾驶舱表现模块而非mock；锁定与警告视觉只依赖同tick projection（D-02修订）。

## 验证方法

`pnpm test -- src/render/cockpit src/app/runtime src/app/session src/core/replay`、`pnpm check`；测试维护的[simplify](../../../../../.agents/skills/simplify/SKILL.md)仅限本组回归。

## 完成证据
