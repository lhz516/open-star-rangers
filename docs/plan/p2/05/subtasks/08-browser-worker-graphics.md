---
type: plan
status: active
phase: P2
task: "05"
subtask: "08"
updated: 2026-10-05
---

# 08 — 真实 Chromium Worker 中的图形阶段

**契约来源：** [spec](../spec.md) 的 S-12 的浏览器部分；[验证策略](../spec.md#验证策略)中的 Worker 部分；AC-12。
**依赖：** 07。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **[import-worker.test-support.ts](../../../../../src/workers/import-worker.test-support.ts)：** 按 Worker `name` 增加两个场景：
  - `graphics`：用 07 的注入方式，对 06 生产结构的合成光盘运行生产作业与图形步骤；
  - `graphics-corrupt`：同一光盘，但一个合成字库的表长损坏。

  不新增生产入口或调试 API；合成光盘按块读出组装为 `File`，沿用现有的 `MARKER` 隐私标记。
- **`e2e/import-worker.spec.ts`：** 在 development 项目中新增用例：
  - **成功：** 真实模块 Worker 依次发出识别进度、`identified`、`convert-graphics` 进度与 `finished`。`finished.groups` 为空；`usage` 的 `assets`、`paletteEntries`、`glyphs` 分别为 5、512、768，`payloadBytes` 等于各 payload 字节之和（由同一合成输入在页面中独立计算，或由测试支持导出的期望值核对）。
  - **转换失败：** 作业以 `source` 层 `invalid-payload` 失败，快照不含部分结果，console 与快照中没有 `MARKER`。
  - **取消：** 在收到首条 `convert-graphics` 进度时调用 `cancel()`。状态为 `cancelled`，Worker 终止，监听已移除，之后状态与通知不再变化。
- **文档：** 在[源码结构](../../../../engineering/source-structure.md)的浏览器验证说明中记录新场景；用例只在 development 项目运行，配置回归按需同步。

## 不包含

- 生产构建中的 Worker chunk、CSP 与页面接线：归 P2-11。
- 原版数据：agent 浏览器检查只用合成资源。

## 关键文件与契约

- **修改：** [import-worker.test-support.ts](../../../../../src/workers/import-worker.test-support.ts)、`e2e/import-worker.spec.ts`，必要时 [e2e-configuration.test.ts](../../../../../tools/e2e-configuration.test.ts)。
- **复用：** 07 的作业注入与合成光盘；P2-04 的浏览器探针与 Worker 适配。

## 验收标准

- [ ] AC-12 成功、转换失败与取消三个用例都在真实 Chromium 模块 Worker 中通过。
- [ ] P2-04 的既有 Worker 用例在协议版本 2 下照常通过。
- [ ] `pnpm test:e2e e2e/import-worker.spec.ts --project=development` 通过；`pnpm exec vitest run tools/e2e-configuration.test.ts` 通过。

## 验证方法

- 按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md) 的合成数据与隔离规则运行，不读取 `local/`。证据记录命令、用例名与关键观测值（阶段序列、用量、终态）。
- 不适用原版对照。
- 完成前按 execute-goal 流程以本子任务 diff 为范围做 rubber-duck 审查与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据
