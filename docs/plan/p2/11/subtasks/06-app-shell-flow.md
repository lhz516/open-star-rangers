---
type: plan
status: active
phase: P2
task: "11"
subtask: "06"
updated: 2026-10-06
---

# 06 — 应用端口、页面流转、菜单状态与测试入口

**契约来源：** [spec](../spec.md) 的 S-01、S-04（菜单中的列出、恢复与重新保存入口）、AC-01、AC-08（菜单部分）、AC-09（主线程模块图），以及[行为与边界](../spec.md#行为与边界)中的首次载入、打开缓存、已持有资源包与合成演示各行，技术决定 1、6、7。
**依赖：** 03, 05。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **应用端口：** `App` 接收端口对象：作业端口工厂、资源缓存、音频能力、WebGL 表面工厂、预期包配置与 `reportError`。
  - [main.tsx](../../../../../src/main.tsx) 传入生产实现：`browserImportWorkerFactory()`、`createResourceCache()`、浏览器音频能力、`createBrowserWebGLSurface` 与 01 的生产包配置。
  - 生产代码不读取 URL 参数或全局开关切换实现。
- **资源持有者：** 由应用外壳实例创建，外壳卸载时释放，与合成演示的生命周期互不影响。
- **页面流转：** [app-flow.ts](../../../../../src/app/flow/app-flow.ts) 增加 `viewer` 画面与相应的焦点目标。只有持有资源包时才能进入查看器。返回菜单时焦点落在对应入口。合成演示的锁存规则不变。
- **菜单状态与入口：** [MainMenuPage.tsx](../../../../../src/ui/pages/MainMenuPage.tsx) 的“原版数据”状态按持有者快照显示：
  - 正在检查存储、没有原版数据、有缓存（尚未校验）、存储不可用（附 05 的文案）；
  - 持有资源包时的状态阶梯文字。

  入口：
  - 未持有资源包且有可恢复条目时，提供“打开已缓存的资源”，恢复中禁用；
  - 持有资源包时，提供“查看资源”；
  - 保存失败时，提供“重新保存”，保存中禁用。

  每次回到菜单时触发重新列出。全站文字不含 “playable”“Play mission”“Start mission” 或同义标记。
- **测试入口（开发服务器专用）：** 新增一个 HTML 页面与一个测试支持模块。它们挂载生产 `App`，注入合成作业入口（[import-worker.test-support.ts](../../../../../src/workers/import-worker.test-support.ts) 的场景）、与合成目录一致的预期包配置，以及按用例替换的缓存或音频能力。
  - 遵守 lint 规则：`app/` 的模块不导入 `original-data`，合成配置经 `workers/` 的测试支持取得。
  - 生产构建只以 `index.html` 为入口，不包含测试入口（14 核对产物）。
- **模块图边界：** 在 [engineering-boundaries.test.ts](../../../../../tools/engineering-boundaries.test.ts) 中新增检查：从 `src/main.tsx` 出发的生产模块图不含 `src/original-data/` 与测试支持；Worker 入口的模块图含 `original-data`。
- **测试：**
  - 流转的表驱动 Node 测试：新画面、焦点目标、未持有资源包时不能进入查看器、演示锁存不受影响；
  - 开发项目 E2E：菜单的状态与入口；导入页面与演示之间往返；全站禁用词；现有演示与权利文案用例回归。

## 不包含

- 导入页面的内容（07）；查看器页面（11）；缓存恢复的完整浏览器验证（12）；生产预览与 CSP（14）。

## 关键文件与契约

- 修改 [App.tsx](../../../../../src/app/App.tsx)、[app-flow.ts](../../../../../src/app/flow/app-flow.ts) 与 [app-flow.test.ts](../../../../../src/app/flow/app-flow.test.ts)、[main.tsx](../../../../../src/main.tsx)、[MainMenuPage.tsx](../../../../../src/ui/pages/MainMenuPage.tsx)、[engineering-boundaries.test.ts](../../../../../tools/engineering-boundaries.test.ts)。
- 计划新增：测试入口的 HTML 页面与挂载模块（文件名执行时确定，测试支持模块以 `.test-support.tsx` 结尾）；新的或扩展的 E2E 用例。
- 浏览器探针：[browser-probes.ts](../../../../../e2e/support/browser-probes.ts)。

## 验收标准

- [ ] AC-01：菜单可以进入导入页面、查看器（持有资源包时）与合成演示，返回菜单时焦点落在对应入口；合成演示在导入前后都可启动，现有演示用例全部通过；全站文字不含禁用词。
- [ ] AC-08（菜单）：菜单按列出结果显示状态；只有与预期包配置一致的条目提供“打开已缓存的资源”；每次回到菜单都重新列出。
- [ ] AC-09（模块图）：从 `src/main.tsx` 出发的生产模块图不含 `src/original-data/` 与测试支持；Worker 的模块图含 `original-data`。
- [ ] 测试入口只经开发服务器提供，生产构建不含它。
- [ ] `pnpm check` 与开发项目的相关 E2E 通过。

## 验证方法

- `pnpm exec vitest run src/app src/ui tools/engineering-boundaries.test.ts`。
- 按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md) 用合成数据运行 `pnpm exec playwright test <新用例> --project=development`，以及现有的 `e2e/compliance-text.spec.ts` 与演示用例。
- 完成前 `pnpm check`。按 execute-goal 做 rubber-duck 与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据
