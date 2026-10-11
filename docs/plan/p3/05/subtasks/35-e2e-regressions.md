---
type: plan
status: active
phase: P3
task: "05"
subtask: "35"
updated: 2026-10-10
---

# 35 — 输入接线后的端到端回归修复

**契约来源：** [spec](../spec.md) 的[验证策略](../spec.md#验证策略)；AC-19（`pnpm check` 与既有浏览器套件保持通过）。本项为协调者在 33 之前跑完整 e2e 套件时发现的修复项，不引入新行为。
**依赖：** 25、26、27、28、29。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 背景

协调者在 `ac86ed5c` 上以 `pnpm exec playwright test`（单 worker）运行完整套件：214 通过、7 失败，且在 29 集成前的提交上可复现，来自 25–27 的接线（这些子任务当时只跑了聚焦用例）：

- `e2e/probe-contract.spec.ts:160`（development、production）：所有者资源期望无监听器，实得约 110 条 `group: "keyboard"` 监听器（25 的输入消费者）。
- `e2e/webgl-unavailable.spec.ts:53`（development、production）与 `e2e/production-preview.spec.ts:129`（production）：飞行视图期望 0 个 `canvas`，实得 1 个——17/26 的自绘 2D 地图光标画布（`src/render/map/browser-map-cursor.ts`，`aria-hidden`、默认隐藏）。用例本意是“任务流程不创建 WebGL 表面”。
- `e2e/native-lifecycle.spec.ts:80`（development-headed）：`Application load timed out; last observation: ""`，原因待诊断。
- `e2e/joint-pipeline.development.spec.ts:597`（development，AC-04 的 GPU 计数）：仅在本次完整运行出现，先判断是否为负载噪声。

## 工作范围

- 逐项诊断。用例期望过时（如把 2D 地图光标画布或已登记的键盘监听器当作违规）时，按 spec 已批准的行为更新断言，保留原意：无 WebGL 上下文、退出后监听器与资源全部释放、监听器归属于输入消费者。
- 若诊断为应用缺陷，不在本项修改应用代码，先向协调者申请扩大写入范围并附证据。
- 非确定性失败须以重复运行区分噪声与缺陷，并在证据中记录次数与结果。

## 不包含

- 新行为、文案或 spec 变更；31、34 的阻塞项。

## 写入范围

- `e2e/probe-contract.spec.ts`、`e2e/webgl-unavailable.spec.ts`、`e2e/production-preview.spec.ts`、`e2e/native-lifecycle.spec.ts`、`e2e/joint-pipeline.development.spec.ts`
- `e2e/support/**`

## 验收标准

- [ ] 上列 7 个失败均已修复或以证据判定为噪声（附重复运行结果）。
- [ ] `pnpm build` 后，完整 `pnpm exec playwright test`（单 worker）全部通过；`pnpm check` 通过。

## 验证方法

- 记录每项的诊断、改动与完整套件的通过数。

## 完成证据
