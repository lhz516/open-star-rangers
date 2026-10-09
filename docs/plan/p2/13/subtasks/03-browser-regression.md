---
type: plan
status: active
phase: P2
task: "13"
subtask: "03"
updated: 2026-10-08
---

# 03 — 完整浏览器回归

**契约来源：** [spec](../spec.md) 的 S-02、S-03、AC-03、AC-06、AC-09、AC-10 与 AC-12；[退出条件覆盖](../spec.md#退出条件覆盖)、技术决定 2、4、5。
**依赖：** 无。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **发现：** 运行 `pnpm exec playwright test --list`，按项目（`development`、`production`、`development-headed`）记录用例数。181 不是固定目标。
- **执行：** 在干净工作树的当前提交上运行一次 `pnpm test:e2e`（全部项目）。记录以下内容：
  - 提交、Chrome/OS 版本、端口（含 `OSR_E2E_DEV_PORT`、`OSR_E2E_PREVIEW_PORT` 覆盖）与耗时；
  - 各项目的通过、失败、跳过、flaky 与未运行数，并与发现数核对。

  必需用例不能被跳过。
- **退出条件证据：** 按测试名称逐项记录以下用例的结果：
  - **联合闭环与资源平衡：** `joint-pipeline.development`、`joint-pipeline.production`、`joint-resources`、`resource-balance-controls`。
  - **失败矩阵（AC-09）：** `failure-input-content`、`failure-worker-cancel`、`failure-storage-lifecycle` 等。按 P2-12/08、09、10 完成证据中的对应关系，逐行列出 F-01 至 F-14 与 I-1 至 I-7 的断言用例及结果。
  - **网络审计（AC-10）：** `network-audit-controls` 的两个版本，以及受审计的产品用例。记录正向对照看到 Worker 请求、产品用例零意外违规。
  - **生产预览 CSP（AC-10）：** `production-preview`。
  - **主页面响应：** `responsiveness-*`。
- **历史证据适用性（S-03）：** 记录 P2-04 的 `import-worker`、P2-10 的 `resource-cache`、P2-11 的 `import-page`、`viewer-page`、`cache-recovery` 与 `fast-refresh` 在本轮的结果，供 01 的适用性表闭合。
- **浏览器纪律：** 按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md) 核验真实观测与清理：只用隔离的合成 context，不使用个人 profile，不复用未知服务器；结束后停止自有的服务器与浏览器。
- **失败处理（技术决定 5）：** 首次失败保留报告与 trace。只有查明的环境原因（例如端口被占用）可在不改代码、配置与断言的前提下重跑整条命令，并同时记录失败与重跑。原因不明的失败不能以重跑抵消。定位的缺陷交协调者新增修复子任务。

## 不包含

- 修改用例、断言、重试次数或项目配置；新增测试。
- Firefox、WebKit、Safari 与目标设备（P5）；真实数据的浏览器导入（P2-11 AC-21 的适用性由 01 判断）。

## 关键文件与契约

- [playwright.config.ts](../../../../../playwright.config.ts)、[e2e/support/environment.ts](../../../../../e2e/support/environment.ts)、[e2e/](../../../../../e2e/)。
- P2-12 的[失败矩阵](../../12/spec.md#失败矩阵)与[失败不变量](../../12/spec.md#失败不变量)；[08](../../12/subtasks/08-failure-input-content.md#完成证据)、[09](../../12/subtasks/09-failure-worker-cancel.md#完成证据)、[10](../../12/subtasks/10-failure-storage-lifecycle.md#完成证据)、[02 网络审计](../../12/subtasks/02-network-audit.md#完成证据)、[06](../../12/subtasks/06-joint-development.md#完成证据)、[07](../../12/subtasks/07-joint-production.md#完成证据)的完成证据。

## 写入范围

- `dist/**`：pnpm test:e2e 先运行的生产构建（被忽略）。
- `test-results/**`：Playwright 输出与失败 trace（被忽略）。
- `playwright-report/**`：HTML 报告（被忽略）。

## 验收标准

- [ ] AC-03：发现数与三个项目的实际执行数相符，必需用例没有被跳过；联合闭环、失败矩阵与网络审计用例都在本轮执行中；任何重跑都符合技术决定 5，并保留首次失败。
- [ ] AC-09（E2E 部分）：F-01 至 F-14 每行与 I-1 至 I-7 的断言都有本轮的用例结果。
- [ ] AC-10（E2E 部分）：网络审计的正向对照与产品用例都通过，零意外违规；生产预览 CSP 用例通过。
- [ ] AC-06（浏览器类别）：P2-04、P2-10、P2-11 的自动用例在本轮的结果已记录。
- [ ] AC-12：失败时写明受影响的退出条件、原责任任务与恢复条件；没有时写明“无”。自有的服务器、浏览器与端口已清理。

## 验证方法

- `pnpm exec playwright test --list`；`pnpm test:e2e`；用报告与 `--list` 输出核对计数。
- 浏览器验证按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md)；只用代码生成的合成数据，不读原版数据。

## 完成证据
