---
type: plan
status: active
phase: "P3"
task: "16"
subtask: "09"
updated: "2026-10-30"
---

# 09 — 完整浏览器回归

**契约来源：** [spec](../spec.md) 的 S-03、AC-04、[技术决定](../spec.md#技术决定) 2 与 9。
**依赖：** 04、18、19、20。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 在含修复的候选上先运行 `pnpm exec playwright test --list` 记录发现清单，再运行一次 `pnpm test:e2e`，覆盖 development、production 与 development-headed 三个项目。
- **对账：** 发现数与通过、失败、跳过数相符。跳过的只能是按项目设计不运行的用例。P3-15 的联合闭环、生命周期、警告与网络审计用例都在其中且通过。
- 记录浏览器版本、OS、端口、报告位置与本次构建的 `dist` 指纹。
- **失败处理：** 保留首次失败的报告与 trace，并查因。只有查明的环境原因（例如端口占用、锁屏）可不改代码重跑整条命令。`map-picture.development.spec.ts:211` 的旧归因只是线索，失败时同样查因，交 11 或新增修复项。
- 按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md) 核验真实观测与清理。

## 不包含

- 真实内容运行（06）；渲染风险的聚焦复现（11）。

## 关键文件与契约

- [playwright.config.ts](../../../../../playwright.config.ts)、`e2e/`。

## 写入范围

- `dist/**`：`pnpm test:e2e` 的生产构建（被忽略）。
- `test-results/**`：Playwright 输出与失败 trace（被忽略）。
- `playwright-report/**`：HTML 报告（被忽略）。

## 验收标准

- [ ] AC-04：`--list` 与执行报告逐项对账，三个项目的应路由用例全部执行并通过；必需用例没有被跳过。
- [ ] AC-04：联合闭环、生命周期、警告与网络审计用例在列且通过，网络审计零意外违规。
- [ ] 失败与重跑符合技术决定 9，首次失败已保留。
- [ ] 自有服务器与浏览器已关闭。

## 验证方法

- `pnpm exec playwright test --list`、`pnpm test:e2e`；对账表与报告路径。

## 完成证据
