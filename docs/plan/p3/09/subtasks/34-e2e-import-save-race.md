---
type: plan
status: active
phase: P3
task: "09"
subtask: "34"
updated: 2026-10-15
---

# 34 — 隐藏页面 Warp 用例的导入保存竞态（修复）

**契约来源：** [spec](../spec.md) 的 AC-12；27 的工程检查（完整 `pnpm test:e2e`）。
**依赖：** 22。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 27 两次运行完整 `pnpm test:e2e`，都只有 [mission-flow.development.spec.ts](../../../../../e2e/mission-flow.development.spec.ts) 中“a real hidden page during a Warp …”在 `Startable mission` 处超时（最后观察为 undefined）；单独运行通过。该用例导入后只等待状态含 “Mission loads into Core” 就返回菜单，而 [keyboard-input.development.spec.ts](../../../../../e2e/keyboard-input.development.spec.ts) 的同类流程还等待 “Saved in this browser”。在保存完成之前返回菜单时，菜单可能没有可开始的已保存任务。按既有用例的做法同时等待保存完成，并核对本文件中其他同类等待有没有相同问题；不放宽断言、不延长与原因无关的超时。
- 若查明原因不是该竞态，记录证据并按实际原因修复（只在写入范围内），或以 question 报告。

## 不包含

- 应用代码改动。

## 关键文件与契约

- 22 的完成证据；27 的执行记录。

## 写入范围

- `e2e/mission-flow.development.spec.ts`
- `e2e/support/**`：如需共用等待辅助。

## 验收标准

- [x] 原因已查明并修复；完整 `pnpm test:e2e` 通过（若有与本修复无关的既有负载敏感失败，单独重跑并记录），两个 mission-flow 文件单独运行通过；`pnpm check` 通过。

## 验证方法

- 完整 `pnpm test:e2e`（使用分配的端口）；`pnpm check`；git 审阅。

## 完成证据

- **原因（已确认）：** 临时探针在“Mission loads into Core”出现时读取导入页：失败那次状态仍为“Held in memory only / Saving in this browser”，并有禁用的 “Save again”（`ImportPage.tsx` 在保存完成前渲染），“Return to menu” 的 top 为 848 px，保存完成后为 767 px。`NativeTarget.press` 先在页面内取按钮稳定后的中心，再由 CDP 在该坐标点击；保存若在两者之间完成，“Save again” 消失使按钮上移约 81 px，点击落空，主菜单不出现，`button[data-eligibility]` 为 undefined。单独运行 3 次中复现 1 次。
- **修复（`e2e/mission-flow.development.spec.ts`）：** 该用例按 `keyboard-input.development.spec.ts` 的做法同时等待 “Saved in this browser” 再按 “Return to menu”。核对其他等待：其余导入都经 `importScenario` 用 Playwright 点击（有命中目标检查，不受此位移影响）；但“native leave confirmation”用例在 `importScenario` 后重新加载并由 `restoreSaved` 恢复保存，此前从未等待保存完成，属同类潜在竞态，现于导入后等待菜单状态含 “Saved in this browser (saved in ”。断言与超时均未放宽。
- **检查：** 两个受影响用例 `--repeat-each=5` 共 10/10 通过；两个 mission-flow 文件单独运行 11/11 通过；完整 `pnpm test:e2e`（端口 5202/5203）226/226 通过；`pnpm check` 通过（299 文件、8892 测试、构建）。
- **rubber-duck：** 无阻塞问题；已核实 “Saved in this browser” 不会误配 “not saved” 或恢复状态，文件中无其他同类 CDP 坐标竞态。非阻塞建议（保存失败时会以 60 s 超时而非即时报错呈现）未采纳：与既有 keyboard-input 用例一致，超时信息已给出最后的状态文本，超出本修复范围。
- **simplify：** 只改测试中的两处等待，无实现代码，不需要。
- **文档影响：** 无需更新；工程测试约定与命令未变。
