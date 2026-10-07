---
type: plan
status: active
phase: P2
task: "11"
subtask: "21"
updated: 2026-10-06
---

# 21 — 生产预览的 CSP 与 Worker 回退

**契约来源：** [spec](../spec.md) 的 S-11、AC-19（Worker 入口、识别失败、404 与 HTML 回退、策略合规、构建产物）、AC-01 的生产部分，以及技术决定 7、11。查看器路径归 [14](./14-production-preview-csp.md)。
**依赖：** 07。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- [vite.config.ts](../../../../../vite.config.ts) 的 `preview.headers` 发送拟定的严格 CSP：
  - 只允许同源的脚本、Worker 与样式；
  - 不含 `unsafe-inline`、`unsafe-eval`、`blob:`、`data:` 或通配来源。

  开发服务器与构建输出不变。
- `production` 项目 E2E，全部在该策略下运行：
  - **策略：** 预览的页面与 Worker 脚本响应都带该策略。
  - **Worker 入口：** 导入合成文件时，探针记录的 Worker 入口位于 `/assets/` 下、由 Vite 的 Worker 转换生成，脚本响应为 200 与 JavaScript 类型；识别失败显示 `source`/`unsupported-version` 的类别文字，Worker 已终止。
  - **Worker 回退：** 测试让 Worker 脚本返回 404，或返回 200 的 HTML（模拟 SPA 回退），导入都以 import 层失败结束，Worker 已终止，没有资源包。
  - **策略合规：** 上述路径、菜单与合成演示都没有 `securitypolicyviolation` 事件，也没有未声明的控制台错误。
  - **AC-01 生产部分：** 已有的 [app-shell.spec.ts](../../../../../e2e/app-shell.spec.ts) 等生产用例在该策略下通过。
- **构建产物检查：** `dist/` 只有 `index.html` 一个页面；产物与 source map 的来源都不含测试入口、测试支持或合成目录。
- 策略不能满足时修正应用代码，不放宽策略；确需放宽，记录理由并经用户确认。
- 把策略文本与“SPA 回退必须排除 `/assets/*`”写入[工程约定](../../../../engineering/README.md)，作为 P5 的输入，并注明真实 SWA 的回退与响应头实测归 P5。

## 不包含

- 预置缓存的完整查看路径（14）；`public/staticwebapp.config.json`、真实响应头与 SWA 部署（P5）；网络审计（P2-12）。

## 关键文件与契约

- 修改 [vite.config.ts](../../../../../vite.config.ts)、[playwright.config.ts](../../../../../playwright.config.ts)、[工程约定](../../../../engineering/README.md)。
- 计划新增生产项目 E2E 用例；复用 [browser-probes.ts](../../../../../e2e/support/browser-probes.ts) 的 Worker 记录与 [browser-test.ts](../../../../../e2e/support/browser-test.ts) 的错误收集。

## 验收标准

- [ ] AC-19（不含查看器路径）：策略响应头、Worker 入口、识别失败、404 与 HTML 回退、无 CSP 违规与未声明的控制台错误、构建产物不含测试入口，都如上。
- [ ] AC-01（生产）：页面往返与禁用词断言在策略下通过。
- [ ] 策略未放宽；策略文本与回退要求已写入工程约定。
- [ ] `pnpm check` 与 `pnpm test:e2e` 通过。

## 验证方法

- 按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md) 运行 `pnpm test:e2e`（会先构建）或 `pnpm build` 后 `pnpm exec playwright test <新用例> --project=production`。
- 完成前 `pnpm check`。按 execute-goal 做 rubber-duck 与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据
