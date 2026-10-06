---
type: plan
status: active
phase: P2
task: "07"
subtask: "14"
updated: 2026-10-05
---

# 14 — 真实 Worker 中的 cockpit-hud-map 组

**契约来源：** [spec](../spec.md) 的 S-10 的浏览器部分；[验证策略](../spec.md#验证策略)中的浏览器验证；AC-09。
**依赖：** 12、13。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **场景：** 在 [import-worker.test-support.ts](../../../../../src/workers/import-worker.test-support.ts) 中提供（或更新）测试场景：生产作业处理合成光盘，光盘按生产映射的结构放置合成的 DATA、CCKD、MFDD 与 TABL 条目（12 的测试支持），以及满足逻辑与音频阶段的合成内容或测试注入。
- **用例（扩展 [import-worker.spec.ts](../../../../../e2e/import-worker.spec.ts)）：**
  - 成功：持有者收到以转移交出的 `cockpit-hud-map` 组并验证为 `group-complete`；`finished.usage` 的 `assets`、`imagePixels`、`paletteEntries`、`glyphs`、`payloadBytes` 等于合成声明的逐维合计（与 Node 侧期望来自同一常量）；
  - 损坏的合成 CCKD 元素：作业以 `source` 层 `invalid-payload` 失败，没有组被移交；
  - 收到首条 `convert-graphics` 进度时取消：状态为 `cancelled`，Worker 终止，之后状态不再改变；
  - 既有用例按新的组集合与用量更新，Worker 创建与终止、监听移除的探针断言保持。
- 按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md) 的约定只用代码生成的合成数据，证据记录命令、用例名与结果。

## 不包含

- Node 侧的组装与失败分类：归 [13](./13-group-assembly.md)。
- 页面、查看器与 Canvas/WebGL 显示：归 P2-11。

## 关键文件与契约

- **修改：** [import-worker.spec.ts](../../../../../e2e/import-worker.spec.ts)、[import-worker.test-support.ts](../../../../../src/workers/import-worker.test-support.ts)、必要时 [synthetic-import.test-support.ts](../../../../../src/workers/synthetic-import.test-support.ts)。

## 验收标准

- [ ] AC-09：成功、损坏与取消三类用例在 development 项目的真实 Chromium 模块 Worker 中通过。
- [ ] 既有 import-worker 用例全部通过；没有原版数据进入测试或证据。
- [ ] `pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- `pnpm test:e2e e2e/import-worker.spec.ts --project=development`。
- 证据记录命令、通过的用例数与用量断言。
- 完成前按 execute-goal 流程以本子任务 diff 为范围做 rubber-duck 审查与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据
