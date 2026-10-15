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

- [x] 正确行为有两份已批准契约的依据，写在完成证据中。
- [x] 回归用例与 `e2e/base-interaction.development.spec.ts` 通过；`pnpm check` 通过。
- [x] 没有改变其他已批准行为（相关 Core 与 e2e 测试照常通过）。

## 验证方法

- `pnpm check`；`pnpm exec playwright test e2e/base-interaction.development.spec.ts`（按分配的端口）；git 审阅。

## 完成证据

- **结论：两份契约一致，Core 正确，未修改；回归在过时的测试期望与基地页文案。** 停靠中 `toggle-map` 应被接受并打开地图。依据：[P3-02 spec](../../02/spec.md) 的 MW-04 `toggle-map` 第 2 步（活动为停靠的玩家可以通过）与第 4 步（`base` → `accepted`，打开；上一视角 := 6）；`request-warp` 第 3 步（从基地打开的地图 → `wrong-context`）；CB-07 第 4 项（地图中 `launch` → `wrong-context`）；合并说明“从基地打开或关闭地图因此也置重绘”；P3-10 spec（分支 `p3-10-comms-base-resupply-spec`，只读）范围一节：“基地中的 `toggle-map` 由 P3-09 实现；上一视角保持为 6，关闭地图回到基地”，以及 G-05 要求按键说明区分已接入能力与后续门禁。e2e 原期望的 `rejected (not-implemented)` 是 P3-10 在 P3-09 合入前的占位，基地页 `M` 的“later / refuses”文案同理。
- **改动：** [commands.test.ts](../../../../../src/core/systems/commands.test.ts) 新增回归用例：经正式 step 停靠（子状态 4 到期 → `docked`，活动 `docked`、视角 6），同批 `toggle-map`、`request-warp`、`launch` 依次为 accepted、`wrong-context`、`wrong-context`，`map-toggled` 为打开、视角 8、上一视角 6，子状态保持 5；再一次 `toggle-map` 关闭回到视角 6，同批 `navigate-selection` 被接受。[base-interaction.development.spec.ts](../../../../../e2e/base-interaction.development.spec.ts) 改为 M 打开地图（基地页消失、焦点留在输入区），M 再关闭回到基地页（光标不变、无错误）。[slice-gaps-copy.ts](../../../../../src/ui/mission/slice-gaps-copy.ts) 中 `M` 改为 `wired` 并说明关闭回到基地，[base-page.test.ts](../../../../../src/ui/mission/base-page.test.ts) 随之更新；[slice-gaps.md](../../../../engineering/slice-gaps.md) 的 G-05 行同步。`BaseKeyStatus` 的 `later` 保留（通用状态，`BasePage.tsx` 的说明引用它）。
- **验证：** `pnpm check` 通过；`pnpm exec playwright test e2e/base-interaction.development.spec.ts`（`OSR_E2E_DEV_PORT=5148`、`OSR_E2E_PREVIEW_PORT=5149`）通过，`--repeat-each=3` 6/6。改动前该项在 M 处失败（实际 `outcome=accepted`）。一次早期运行在其后 257 键突发之后的 `launch()` → `clearLog` 超时：Clear log 只点一次，仍在排空的队列命令的结果可能重新填充日志；之后 5 次未复现，与本改动无关（去掉地图步骤同样存在该时序）。其余 Core 与 e2e 测试照常通过，Core 行为未改变。
- **rubber-duck：** 无阻塞问题；确认契约解读、回归用例能防住旧行为、e2e 断言非空洞、上述时序假设合理。
- **文档影响：** slice-gaps.md 的 G-05 行已更新；STATUS、tasks.md 与 `docs/original/` 无需改动（不涉及原版事实或阶段状态）。simplify：仅测试与文案改动，无实现代码，不需要。
