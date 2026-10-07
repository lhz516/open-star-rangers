---
type: plan
status: active
phase: P2
task: "11"
subtask: "14"
updated: 2026-10-07
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

## 写入范围

- `e2e/production-viewer.spec.ts`：计划新增的生产项目查看路径用例。
- `e2e/production-preview.spec.ts`：21 的生产项目用例，必要时调整或共用。
- `e2e/support/production-cache.ts`：计划新增的生产预览缓存预置支持（生产构建没有开发服务器的模块载入）。
- `e2e/support/resource-cache.ts`、`e2e/support/app-entry.ts`、`e2e/support/browser-probes.ts`：复用并按需扩展的测试支持。
- `docs/engineering/README.md`：生产预览与 E2E 路线的说明（若需要）。

## 验收标准

- [x] AC-19（查看器路径）：预置缓存经菜单恢复后，查看器显示模型、图像与布局并能试听，没有 CSP 违规与控制台错误。
- [x] 策略未放宽。
- [x] `pnpm check` 与 `pnpm test:e2e` 的生产项目通过。

## 验证方法

- 按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md) 运行 `pnpm test:e2e`（会先构建）或 `pnpm build` 后 `pnpm exec playwright test <新用例> --project=production`。
- 完成前 `pnpm check`。修改实现代码时，按 execute-goal 做 rubber-duck 与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据

- **实现与隔离：** 扩展已有的 [production-preview.spec.ts](../../../../../e2e/production-preview.spec.ts)，沿用它的 production-only 配置与 CSP 事件记录，不新增页面或生产入口。
  - [production-cache.ts](../../../../../e2e/support/production-cache.ts) 复用 `modelsPackage` 的合成转换结果，把来源指纹与转换器版本换成 `PRODUCTION_PACKAGE`，用 `applyManifestIdentity` 重新派生 manifest 身份。
  - 使用 P2-10 的记录与键构造函数，在 Node 侧核对声明预算和完整性；页面只重建合成 payload 的 `ArrayBuffer`，以单个 IndexedDB 事务写入。没有读取 `local/`，没有往生产页面载入开发模块，也没有切换应用端口。
  - Chrome 155.0.8059.39 / macOS，headless、1280×800、DPR 1；每条用例独立 context；预览同源地址为 `http://127.0.0.1:5143`。

| 验收项 | 操作与预期 | 实测证据 | 结果 |
|---|---|---|---|
| AC-19 缓存恢复 | 空菜单预置合成包后同源刷新，经菜单打开保存的资源 | 刷新后先显示尚未校验；打开后显示完整可查看、已恢复并校验、任务可载入 Core | passed |
| AC-19 实际画面 | 选择合成敌机模型、导弹图像、前视驾驶舱布局 | 截图解码读回像素与规范内容的预期字节相等，误差 0，包含中间亮度；二维项另取一个确实不透明且不同于棋盘格的纹素，不能只凭背景通过 | passed |
| AC-19 试听与释放 | 可信点击播放，然后停止并返回菜单 | 点击前没有音频上下文；点击后状态为 running，声音源恰好启动一次；停止后发声与目的地连接均为 0；返回后上下文为 closed。合成声短于 1 ms，以启动计数而非瞬时发声数证明播放，不冒充真人听感 | passed |
| CSP 与错误 | 全路径沿用 21 的策略，记录违规与浏览器错误 | 页面响应头等于严格策略；两次导航的违规记录均为空；错误收集器无未声明错误；无需 Worker 的恢复路径没有创建 Worker | passed |
| 生产边界 | 运行既有产物与其他生产用例 | 产物仍只有一个入口，不含测试入口/支持模块；策略、应用、依赖、构建配置均未修改 | passed |

- **检查：**
  - `VITEST_MAX_WORKERS=1 pnpm check`：152 个文件、4,508 条测试通过；TypeScript、ESLint 与构建通过。
  - 未设置环境变量的 `pnpm check` 曾在现有图像大数组、模块边界等测试上超时（5 s；合规 CLI 为 45 s），不是断言差异；单独复跑相关测试通过。最终只用 Vitest 已支持的环境变量减少并发，保留所有用例、断言、超时与仓库配置；没有把失败隐藏成通过。
  - `OSR_E2E_DEV_PORT=5142 OSR_E2E_PREVIEW_PORT=5143 pnpm test:e2e --project=production`：重新构建后 19 条全部通过，包括新的查看器路径；未运行本子任务范围外的开发项目。
  - `pnpm check:original`：工作树、索引、未跟踪文件与 9 个构建文件全部完成，零发现。
  - 文档 front matter、本地链接与 `git diff --check` 通过。
- **Rubber-duck：** 无阻塞问题；采纳三项加强：换生产来源后重新派生 manifest 身份、等待音频准备完成、必须取到非透明内容像素。最后一项实际发现前视布局的均匀采样全落在透明背景，已增加不透明纹素断言并复跑通过。未采用 base64 传输建议：当前合成包规模无需另加编码路径。
- **Simplify：** 当前项范围内检查复用、复杂度、效率与抽象层；删除 `applyManifestIdentity` 已完成的重复排序；复用现有像素、音频、CSP 与缓存记录辅助，没有新增通用测试框架。
- **文档影响：** [工程约定](../../../../engineering/README.md) 增加生产缓存预置、同源恢复、真实像素与试听验证路线。无生产行为、冻结架构或原版研究事实变化；无需修改指南、ADR、STATUS 或阶段索引。
- **清理与边界：** Playwright 已关闭自有 context、Chrome 与两个测试服务器，预置数据仅在这些 context 内；未操作用户浏览器或缓存。真实 SWA 的响应头/回退仍归 P5，用户真实界面与听感仍归 19，本项不替代它们。
