---
type: plan
status: active
phase: P2
task: "12"
subtask: "02"
updated: 2026-10-07
---

# 02 — 网络审计：分类、采集与控制样本

**契约来源：** [spec](../spec.md) 的 S-06、AC-11 与[网络审计](../spec.md#网络审计)；为 AC-10 提供审计实现（03、06–10 使用）。
**依赖：** 01。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **纯分类模块（计划新增 `tools/e2e-network-policy.ts`）：** 输入为采集到的事件，输出违规列表（类别、发起者、阶段）。
  - 生产允许集：同源 `GET`、无请求体、无查询串，路径属于 `/` 或本候选 `dist/` 的明确文件清单（复用 [distribution.ts](../../../../../tools/compliance/distribution.ts) 的 `ordinaryFiles`），资源类型与用途对应；`/favicon.ico` 的已知 404 单列，不扩大允许集；无 WebSocket、EventSource、新页面、cookie、`Cookie` 头或 Service Worker 注册。
  - 开发规则：只放行确认为应用/测试入口模块图与 Vite 工具链的同源 `GET`/`HEAD`，记录具体路径、资源类型与允许的 Vite 查询键/值模式；唯一允许的 WebSocket 是已识别的 Vite HMR 连接。不得以“任意同源 GET”或从捕获结果生成的白名单放行。
  - 测试专用请求（F-11 缺失 Worker、控制样本端点）由用例逐条声明方法、路径、无数据约束与预期错误，不放宽产品用例。
  - 金丝雀匹配：对 URL（解码后，含 fragment）、请求头、请求体、cookie、WebSocket 帧检查原文、URL 编码与 Base64 表示。
  - 未知发起者、未覆盖目标作为“证据不完整”，不计为零泄露。
  - 单元测试（计划新增 `tools/e2e-network-policy.test.ts`，在 Vitest 范围内）覆盖每条规则与每种编码的正反样本。
- **采集器（计划新增 `e2e/support/network-audit.ts`）：** 在产品脚本运行前建立 context/目标级观测，覆盖主页面、专用 Worker、导航与刷新、页面关闭；可附加到 Playwright 的 `page`/`BrowserContext`，也可附加到持久 profile 与 [native-lifecycle.ts](../../../../../e2e/support/native-lifecycle.ts) 启动的浏览器（10 使用）。
  - 记录 HTTP(S) 请求的目标 ID、发起者（页面/Worker/浏览器，无法归属须标记）、方法、URL、请求头、请求体长度、标记命中，包括失败、被路由拦截与被 CSP 阻止的尝试；WebSocket 建连与双向帧；EventSource；导航 URL；弹窗；cookie 写入与发送尝试；Service Worker 注册尝试及结束状态；页面与 Worker 的 CSP 违规。
  - 页面级请求事件是否覆盖 Worker 未经本项目验证；需要时用 Chrome DevTools 协议自动附加 Worker 目标。以控制样本证明可见性，不以 API 名称为证。
- **审计夹具（计划新增 `e2e/support/audited-test.ts`）：** 扩展 [browser-test.ts](../../../../../e2e/support/browser-test.ts) 的 `test`，提供 `audit` 夹具：接收金丝雀集合（05 提供）与声明的测试请求；用例结束时断言零意外违规，并附按类别统计的摘要（只含合成数据）。不修改 `browser-test.ts`。
- **控制样本：**
  - 计划新增 `e2e/network-audit-controls.spec.ts`（两个项目）：允许的静态加载通过；页面 `fetch`、`sendBeacon`（含关闭阶段）、专用 Worker `fetch`（生产项目中 Worker 脚本由测试路由在同源的非 `dist/` 路径上供应，不进入 `dist/`），分别在 URL、头部、请求体携带标记；页面被动图像请求、带 fragment 的导航与 cookie 各有可检测样本；全部被分类检出，Worker 那条归为 Worker 发起；被 CSP 阻止与实际传出分别判定。
  - 计划新增 `e2e/network-audit-controls.development.spec.ts`：非 HMR 的 WebSocket 建连与带标记的发送帧被检出；Vite HMR 连接被识别为允许。
  - 控制样本只发往测试自有的拦截路由或本机 loopback 接收端，不访问外部主机；它们的违规是预期结果，不计入产品零违规。

## 不包含

- 联合与失败用例中的使用（03、06–10）；金丝雀的合成数据嵌入与到达证明（05）。
- 持久的网络门禁或 CI（P5）；产物静态出站审阅（11）。

## 关键文件与契约

- [browser-test.ts](../../../../../e2e/support/browser-test.ts)：既有错误收集与 `expectDiagnostic`。
- [resource-cache.ts](../../../../../e2e/support/resource-cache.ts) 的 `requestsDuring` 只看主页面请求，不作为审计实现。
- [preview-csp.ts](../../../../../tools/preview-csp.ts)：生产预览的 `connect-src 'self'`、`worker-src 'self'`。
- 计划新增的四个文件见上。

## 写入范围

- `tools/e2e-network-policy.ts`：纯分类与金丝雀匹配。
- `tools/e2e-network-policy.test.ts`：单元测试。
- `e2e/support/network-audit.ts`：采集器。
- `e2e/support/audited-test.ts`：审计夹具。
- `e2e/network-audit-controls.spec.ts`：两个项目的控制样本。
- `e2e/network-audit-controls.development.spec.ts`：开发项目的 WebSocket 控制样本。

## 验收标准

- [ ] AC-11：两个项目中，页面 `fetch`、`sendBeacon`（含关闭阶段）、专用 Worker `fetch`，以及被动加载、导航、cookie 的标记全部被检出并正确分类；Worker 请求归为 Worker 发起；开发项目的非 HMR WebSocket 与标记帧被检出；允许的静态加载通过；被 CSP 阻止与实际传出分别判定。
- [ ] 单元测试覆盖生产允许集、开发规则、测试声明请求与三种编码的金丝雀匹配，每条规则都有正反样本。
- [ ] 未知发起者或未覆盖目标使审计报告“证据不完整”，有对应测试。
- [ ] 控制样本不访问外部主机；没有新依赖；`browser-test.ts` 未修改。
- [ ] `pnpm test -- tools/e2e-network-policy.test.ts`、`pnpm typecheck`、`pnpm lint` 与两个项目的控制样本 E2E 通过。

## 验证方法

- 按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md) 在隔离 context 中只用合成数据：`pnpm exec playwright test e2e/network-audit-controls --project=development` 与 `--project=production`。
- 控制样本失败时 AC-10 不能通过；须更换采集机制直到通过，不以页面级请求列表代替。
- 不涉及原版对照。

## 完成证据
