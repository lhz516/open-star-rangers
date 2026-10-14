---
type: plan
status: active
phase: P3
task: "09"
subtask: "16"
updated: 2026-10-14
---

# 16 — Warp 能量规则

**契约来源：** [spec](../spec.md) 的 S-07、AC-07；[Warp 能量](../spec.md#warp-能量)。
**依赖：** 12。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 计划新增 `src/core/rules/warp-energy.ts`：按 05 实现 `0x30d2c` 及其调用者的参数、单位与取整、数值对分段（首个首值 ≥ 参数 ÷ 1000 的对，否则最后一对）、显示百分比的基准、显示最小值与颜色阈值所需的值；光标点与提交点的用途分开。
- 检查量、预计消耗与实际扣费分别具名；整数计算精确核对，i32 与除法语义按 07。
- 测试覆盖每个分段边界、取最后一对、恰够、零值、数值域边界与切片机型的合成数值对。本项只交付纯规则；各阶段的实际扣费在 17、18 中接线。

## 不包含

- 扣费的阶段接线（17、18）与 `map` 分区读数（19）。

## 关键文件与契约

- [craft-info.ts](../../../../../src/content/rule-data/craft-info.ts) 的 `pairs`；[energy.ts](../../../../../src/core/rules/energy.ts) 的能量单位。

## 写入范围

- `src/core/rules/warp-energy.ts`、`src/core/rules/warp-energy.test.ts`

## 验收标准

- [ ] AC-07 的规则部分：参数、单位、分段边界/最后一对、显示最小值/阈值与两种点的用途符合 05 的独立期望。
- [ ] `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts` 与 `pnpm check` 通过。

## 验证方法

- Node 独立期望与数值边界测试（不调用被测实现生成期望）。

## 完成证据
