---
type: plan
status: active
phase: P3
task: "08"
subtask: "15"
updated: 2026-10-14
---

# 15 — 程序选择、安装与控制器调度

**契约来源：** [spec](../spec.md) 的 S-04、AC-03；[程序选择与安装](../spec.md#程序选择与安装)；01 的研究与 08 定稿的阶段与抽取。
**依赖：** 14。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 计划新增 `src/core/rules/ai-selection.ts`：`0x5de18`/`0x5dbc8` 的选择（随机起点、完全/部分匹配、内置回退）与 `0x5dc0c` 的控制器初值与限值换算。
- [spawn.ts](../../../../../src/core/systems/spawn.ts) 中 `0x20990` 的位置：安装种类回调与 AI 程序，抽取在实例化扩展中的原版相对位置。
- 计划新增 `src/core/systems/ai.ts`：对象更新中的控制器步 `0x5dcd4` 骨架（期限 +0xF0 与周期、按 08 定稿以活动或停放处理器分派、模式 0/1/2 的调用），由 [pipeline.ts](../../../../../src/core/systems/pipeline.ts) 的 `updateObject` 静态调用；尚未实现的处理器身份已被 14 在创建时拒绝，不建空处理器。
- [area.ts](../../../../../src/core/systems/area.ts) 的停放切换：在原版的状态 5/0 位置移除与重装控制器（停放对象用停放处理器），重装的抽取按原版。
- 测试：选择的支持集与原像计数、优先次序、载入变换、抽取位置与次数、期限比较的等号与跨阈值、停放/恢复/被毁/移除时不漏抽或额外抽取。

## 不包含

- 表程序解释器（16）；具体内置处理器（18 的基地、19 的僚机、21 的停放）；驾驶（17）。

## 关键文件与契约

- 已有：[spawn.ts](../../../../../src/core/systems/spawn.ts)、[area.ts](../../../../../src/core/systems/area.ts)、[pipeline.ts](../../../../../src/core/systems/pipeline.ts)。
- 计划新增：`src/core/rules/ai-selection.ts`、`src/core/systems/ai.ts` 及其测试。

## 写入范围

- `src/core/rules/ai-selection.ts`：选择与控制器初值（新建）。
- `src/core/rules/ai-selection.test.ts`：测试（新建）。
- `src/core/systems/ai.ts`：控制器步（新建）。
- `src/core/systems/ai.test.ts`：测试（新建）。
- `src/core/systems/spawn.ts`：`0x20990`。
- `src/core/systems/spawn.test.ts`：实例化测试。
- `src/core/systems/area.ts`：停放切换时的重装。
- `src/core/systems/area.test.ts`：停放测试。
- `src/core/systems/pipeline.ts`：对象更新中的静态调用。

## 验收标准

- [ ] AC-03 的各项由独立期望的测试覆盖。
- [ ] 控制器状态全部在 12 定义的形状中，进入快照；没有空处理器或注入回调。
- [ ] `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts` 通过。

## 验证方法

- Node 规则与实例化测试，期望由 01 的记录独立推导。
- 按 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 清理本项范围。

## 完成证据
