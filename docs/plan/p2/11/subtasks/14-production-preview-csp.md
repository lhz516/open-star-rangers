---
type: plan
status: active
phase: P2
task: "11"
subtask: "14"
updated: 2026-10-06
---

# 14 — 生产预览中的完整查看路径

**契约来源：** [spec](../spec.md) 的 S-11、AC-19（预置缓存的完整查看路径），以及技术决定 7、11。CSP、Worker 入口与回退、构建产物与 AC-01 的生产部分已拆到 [21](./21-production-preview-csp.md)（见 goal 执行记录）。
**依赖：** 07, 11, 21。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- `production` 项目 E2E，在 21 的策略下运行：
  - **预置缓存的完整查看路径：** 测试在自己的 context 中按 P2-10 记录格式预置一份身份取生产配置的合成包，经菜单恢复后，查看器显示模型、图像与布局，并能试听。
  - **策略合规：** 该路径没有 `securitypolicyviolation` 事件，也没有控制台错误。
- 策略不能满足时修正应用代码，不放宽策略；确需放宽，记录理由并经用户确认。

## 不包含

- `public/staticwebapp.config.json`、真实响应头与 SWA 部署（P5）；网络审计（P2-12）。

## 关键文件与契约

- 修改 21 的生产项目用例或新增用例；[工程约定](../../../../engineering/README.md)（若需要）。
- 计划新增生产项目 E2E 用例；复用 [browser-probes.ts](../../../../../e2e/support/browser-probes.ts) 的 Worker 记录与 [resource-cache.ts](../../../../../e2e/support/resource-cache.ts)。
- 预置的合成包由测试在页面中用合成内容生成，不读取 `local/`。

## 验收标准

- [ ] AC-19（查看器路径）：预置缓存经菜单恢复后，查看器显示模型、图像与布局并能试听，没有 CSP 违规与控制台错误。
- [ ] 策略未放宽。
- [ ] `pnpm check` 与 `pnpm test:e2e` 的生产项目通过。

## 验证方法

- 按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md) 运行 `pnpm test:e2e`（会先构建）或 `pnpm build` 后 `pnpm exec playwright test <新用例> --project=production`。
- 完成前 `pnpm check`。修改实现代码时，按 execute-goal 做 rubber-duck 与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据
