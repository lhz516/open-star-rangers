---
type: plan
status: active
phase: P3
task: "14"
subtask: "29"
updated: 2026-10-28
---

# 29 — 完整 e2e 套件的修复（补救）

**契约来源：** [spec](../spec.md#验证策略) 的 S-10、AC-12、AC-13。
**依赖：** 23。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 23 的完整 `pnpm test:e2e` 有 3 项失败，在 23 的基线 `78b9e4c4` 上同样失败：`browser-replay.spec.ts:47`（期望的事件集合缺 08 新增的 `object-retired`）、`flight-render.development.spec.ts:63`（缩放 0.7578125 时 12 个像素不同）、`mission-flow.development.spec.ts:353`（网络审计中没有匹配开发规则的 `/favicon.ico` 请求）。
- 逐项查明来源：在 main（`0180ada9`）的独立检出上运行同一用例，判断是 P3-14 引入（08 的事件、20 的表现扩展、18 的接线等）还是 main 上既有。
- P3-14 引入的，按原有断言意图修正（期望集合按契约更新；像素差查明根因后修代码或有依据地更新期望），不放宽判据；main 上既有的，记录证据与归属，不在本任务修改其他任务的行为。

## 不包含

- 不改动与上述 3 项无关的用例；不新增浏览器 runner。

## 写入范围

- `e2e/browser-replay.spec.ts`：事件集合期望。
- `e2e/flight-render.development.spec.ts`：仅在查明 P3-14 引入且期望须更新时。
- `e2e/mission-flow.development.spec.ts`：仅在查明 P3-14 引入时。
- `src/render/flight/presentation/**`：仅在像素差源于 20 的表现扩展时的修复与测试。

## 验收标准

- [ ] 3 项各有来源结论与证据（main 上的复现结果）。
- [ ] P3-14 引入的项已修正，开发与生产项目中相关用例通过；完整 `pnpm test:e2e` 中不再有 P3-14 引入的失败。
- [ ] 未放宽任何判据；main 上既有的失败已记录归属。

## 验证方法

- 按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md) 运行相关项目；main 的对照在临时检出中运行，用后删除。
- `pnpm check` 通过。

## 完成证据
