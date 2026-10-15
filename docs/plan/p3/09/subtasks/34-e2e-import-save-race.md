---
type: plan
status: active
phase: P3
task: "09"
subtask: "34"
updated: 2026-10-14
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

- [ ] 原因已查明并修复；完整 `pnpm test:e2e` 通过（若有与本修复无关的既有负载敏感失败，单独重跑并记录），两个 mission-flow 文件单独运行通过；`pnpm check` 通过。

## 验证方法

- 完整 `pnpm test:e2e`（使用分配的端口）；`pnpm check`；git 审阅。

## 完成证据
