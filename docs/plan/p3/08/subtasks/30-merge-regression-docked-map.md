---
type: plan
status: active
phase: P3
task: "08"
subtask: "30"
updated: 2026-10-15
---

# 30 — 合并回归：停靠中的地图开关

**契约来源：** 本 goal 的[执行记录](../goal.md#执行记录)中 2026-10-15 合并 P3-09、P3-10 的决定；[P3-02 spec](../../02/spec.md) 中 P3-09 的 MW-04 与 P3-10 的 CB-* 关于地图开关与停靠的规定，以及合并说明。
**依赖：** —
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 修复合并 P3-09 与 P3-10 后出现的回归：`e2e/base-interaction.development.spec.ts` 的“停靠并两次离港”一项期望停靠时 `toggle-map` 被拒绝，合并后的 Core 接受了它。先按两份已批准契约（MW-04 的地图开关门禁、P3-10 的停靠状态与视角规定）确定正确行为，再修正 Core（或在契约确实允许时修正测试的期望，并写明依据）；不改变其他已批准行为。
- 不处理合并说明中已列为“未决”的两个联合故障（停靠倒计时与 Warp 请求同 tick、同批 `launch` 与 `request-warp`），除非它们与本回归同源；若同源，先报告协调者。
- 测试：在 Core 的命令测试中加入停靠中地图开关的回归用例；e2e 的该项通过。

## 不包含

- P3-08 的 AI 功能；P3-09、P3-10 的其他契约修改。

## 关键文件与契约

- 已有：[commands.ts](../../../../../src/core/systems/commands.ts)、[base-interaction.development.spec.ts](../../../../../e2e/base-interaction.development.spec.ts)。

## 写入范围

- `src/core/systems/commands.ts`：地图开关的门禁。
- `src/core/systems/commands.test.ts`：回归测试。
- `e2e/base-interaction.development.spec.ts`：仅当契约证明测试期望过时。
- `src/ui/mission/slice-gaps-copy.ts`：基地页 `M` 的状态与说明。
- `src/ui/mission/base-page.test.ts`：键状态断言。
- `docs/engineering/slice-gaps.md`：G-05 行。

## 验收标准

- [ ] 正确行为有两份已批准契约的依据，写在完成证据中。
- [ ] 回归用例与 `e2e/base-interaction.development.spec.ts` 通过；`pnpm check` 通过。
- [ ] 没有改变其他已批准行为（相关 Core 与 e2e 测试照常通过）。

## 验证方法

- `pnpm check`；`pnpm exec playwright test e2e/base-interaction.development.spec.ts`（按分配的端口）；git 审阅。

## 完成证据
