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

- [x] AC-19（不含查看器路径）：策略响应头、Worker 入口、识别失败、404 与 HTML 回退、无 CSP 违规与未声明的控制台错误、构建产物不含测试入口，都如上。
- [x] AC-01（生产）：页面往返与禁用词断言在策略下通过。
- [x] 策略未放宽；策略文本与回退要求已写入工程约定。
- [x] `pnpm check` 与 `pnpm test:e2e` 通过。

## 验证方法

- 按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md) 运行 `pnpm test:e2e`（会先构建）或 `pnpm build` 后 `pnpm exec playwright test <新用例> --project=production`。
- 完成前 `pnpm check`。按 execute-goal 做 rubber-duck 与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据

- **策略：** [preview-csp.ts](../../../../../tools/preview-csp.ts) 定义 `default-src 'none'; script-src 'self'; worker-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`。
  - [vite.config.ts](../../../../../vite.config.ts) 只在 `preview.headers` 发送它，开发服务器不变。
  - [preview-csp.test.ts](../../../../../tools/preview-csp.test.ts) 核对：同源与 `'none'` 之外没有任何来源，不含 `unsafe`、`blob:`、`data:`、通配符或 URL；预览发送策略，开发服务器不发送。
  - 策略没有放宽，也不需要改应用代码：React 的 `style` 属性经 CSSOM 设置，Three.js、Web Audio 与 IndexedDB 都不受影响。
- **生产项目 E2E：** [production-preview.spec.ts](../../../../../e2e/production-preview.spec.ts)，只在 production 项目运行，共 5 条：
  - **Worker 入口：** 页面与 Worker 脚本的响应都带策略。生产尺寸的合成文件经真实 Worker 识别失败，显示 `source/version` 的类别与 `unsupported-version`。
    - Worker 入口为 `/assets/import-worker-<hash>.js`，响应 200 且为 JavaScript 类型，恰好构造一次并终止一次。
    - 页面 chunk 含 Vite Worker 转换生成的 `new Worker(new URL(…, import.meta.url), { type: 'module' })`。开发服务器的 `worker_file` 标记在构建中不存在，所以探针的 `viteWorker` 为 false。
  - **Worker 回退：** 路由让 Worker 脚本返回 404，或返回 200 的 HTML 时，都以 `import/worker-start-failed` 结束，Worker 已终止，没有资源状态，返回菜单后仍没有原版数据。
    - 404 时声明 `HTTP 404`；Chrome 自己的加载失败报告（控制台与 `net::ERR_FAILED`）不总是出现，出现时只能是这两种，并逐条声明。
    - 连续运行 3 次通过。
  - **策略合规：** 菜单、导入页面与合成演示在策略下没有 `securitypolicyviolation`，也没有未声明的控制台错误。
  - **构建产物：** `dist/` 只有 `index.html` 一个页面；source map 的来源超过 100 个，都不含测试、测试支持、`e2e/` 或测试入口；JS 与 HTML 都不含 `MARKER`、`osrTestEntry` 与合成场景名。
- **探针契约：** [probe-contract.spec.ts](../../../../../e2e/probe-contract.spec.ts) 的两个 Worker 用例原用 Blob URL，策略禁止它，改由 Playwright 路由在同源 `/__probe/*.js` 提供脚本。模块载入、消息、原型、监听与终止的断言不变，开发与生产项目都通过。
- **AC-01 生产部分：** [app-shell.spec.ts](../../../../../e2e/app-shell.spec.ts)、[compliance-text.spec.ts](../../../../../e2e/compliance-text.spec.ts) 等全部生产用例在策略下通过。
- **检查：**
  - `pnpm check`：146 个文件 4,381 条测试，构建通过；
  - `pnpm test:e2e`：三个项目共 84 条通过；
  - simplify 后，生产项目的预览与探针用例 10 条、开发项目的导入与探针用例 17 条再次通过，`pnpm lint` 与 `pnpm typecheck` 通过。
- **Rubber-duck：** 没有阻塞或非阻塞问题。
- **Simplify：** 采纳四项：
  - 只核对响应头的用例并入 Worker 入口用例；
  - 生产尺寸的合成文件只生成一次；
  - 文件 payload 的构造移到 [app-entry.ts](../../../../../e2e/support/app-entry.ts)，与导入页面用例共用；
  - `dist/` 枚举复用合规工具的 `ordinaryFiles`。

  未采纳：
  - fixture 级的可选诊断机制：只有一个用例需要；
  - 把产物检查移到 Vitest：`pnpm check` 在构建之前运行测试，`dist/` 未必存在。
- **文档影响：** [工程约定](../../../../engineering/README.md)新增“生产预览的 CSP”：策略文本，生产用例与探针的做法，以及作为 P5 输入的“SPA 回退必须排除 `/assets/*`”和生产响应头；并注明真实 SWA 实测归 P5。
