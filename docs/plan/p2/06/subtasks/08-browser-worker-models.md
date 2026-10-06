---
type: plan
status: active
phase: P2
task: "06"
subtask: "08"
updated: 2026-10-05
---

# 08 — 真实 Worker 的模型阶段浏览器验证

**契约来源：** [spec](../spec.md) 的 S-12（真实 Chromium 路线）；AC-10。
**依赖：** 07。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md) 的规则，在 Playwright 的 development 项目中扩展 `e2e/import-worker.spec.ts`，使用 07 的测试专用 Worker 场景与代码生成的合成光盘：
  - **成功（`models` 场景）：** 生产作业在合成切片光盘上依次经过识别、`identified`、图形、逻辑、音频与模型阶段后结束。持有者收到并验证 `models` 组；其 Asset 数与用量（`assets`、`vertices`、`triangles`、`imagePixels`、`payloadBytes`）等于页面内由同一测试支持独立计算的 Node 期望，不在用例中写死生产数值。
  - **失败（`models-corrupt` 场景）：** 损坏的合成 MESH 使作业以 `source` 层 `invalid-payload` 失败，没有组被移交。
  - **取消：** 收到首条 `convert-models` 进度时取消：状态为 `cancelled`，Worker 终止，之后状态不再改变。
  - 现有场景（`synthetic`、`graphics`、`graphics-corrupt`、`audio` 等）只随第五个阶段与 `models` 组更新快照序列与期望，断言意图不变。
- 在用例与测试支持中写明期望值的来源；证据记录浏览器版本、项目与通过数。

## 不包含

- 模型渲染与 WebGL 断言（P2-11）；原版数据（测试只用合成数据）。
- 作业与协议实现（07）。

## 关键文件与契约

- 修改 `e2e/import-worker.spec.ts`；必要时调整 [import-worker.test-support.ts](../../../../../src/workers/import-worker.test-support.ts) 的场景，生产代码不新增调试 API。
- 复用 [synthetic-import.test-support.ts](../../../../../src/workers/synthetic-import.test-support.ts) 的光盘与期望用量，以及 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md) 的隔离与清理规则。

## 验收标准

- [ ] AC-10：成功时持有者收到并验证 `models` 组，Asset 数与用量等于 Node 侧期望。
- [ ] AC-10：损坏的合成 MESH 使作业以 `source` 层 `invalid-payload` 失败，且没有组被移交。
- [ ] AC-10：收到首条 `convert-models` 进度时取消，状态为 `cancelled`、Worker 终止，之后状态不变。
- [ ] 现有浏览器用例全部通过；`pnpm test:e2e e2e/import-worker.spec.ts --project=development` 通过，`pnpm test:e2e` 全部项目通过。

## 验证方法

- `pnpm test:e2e e2e/import-worker.spec.ts --project=development`，随后运行全部项目确认没有回归。
- 按 browser-testing 的结果表记录场景、操作、期望、观察与结果；只用合成数据，不使用原版文件。
- 本子任务只改测试；若需要改生产代码，先回到 07 或新增修复子任务。

## 完成证据
