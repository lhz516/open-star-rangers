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

- [x] AC-01：菜单可以进入导入页面、查看器（持有资源包时）与合成演示，返回菜单时焦点落在对应入口；合成演示在导入前后都可启动，现有演示用例全部通过；全站文字不含禁用词。
- [x] AC-08（菜单）：菜单按列出结果显示状态；只有与预期包配置一致的条目提供“打开已缓存的资源”；每次回到菜单都重新列出。
- [x] AC-09（模块图）：从 `src/main.tsx` 出发的生产模块图不含 `src/original-data/` 与测试支持；Worker 的模块图含 `original-data`。
- [x] 测试入口只经开发服务器提供，生产构建不含它。
- [x] `pnpm check` 与开发项目的相关 E2E 通过。

## 验证方法

- `pnpm exec vitest run src/app src/ui tools/engineering-boundaries.test.ts`。
- 按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md) 用合成数据运行 `pnpm exec playwright test <新用例> --project=development`，以及现有的 `e2e/compliance-text.spec.ts` 与演示用例。
- 完成前 `pnpm check`。按 execute-goal 做 rubber-duck 与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据

- **应用端口：**
  - [ports.ts](../../../../../src/app/ports.ts) 定义 `AppPorts`：作业端口工厂、缓存端口、音频能力与页面生命周期、WebGL 表面工厂、预期包配置与 `reportError`。
  - [browser-ports.ts](../../../../../src/app/browser-ports.ts) 的 `createBrowserPorts()` 给出生产实现与 `PRODUCTION_PACKAGE`；[main.tsx](../../../../../src/main.tsx) 只传它。
  - [browser-audio-controller.ts](../../../../../src/platform/audio/browser-audio-controller.ts) 为此导出 `BROWSER_AUDIO` 与 `BROWSER_PAGE_LIFECYCLE`。
  - 演示生命周期的错误也交给端口的 `reportError`。
- **持有者与流转：**
  - [use-resource-holder.ts](../../../../../src/app/composition/use-resource-holder.ts) 在 effect 中创建持有者，卸载、StrictMode 重跑与 Fast Refresh 时释放；[App](../../../../../src/app/App.tsx) 每次返回菜单都重新列出。
  - [app-flow.ts](../../../../../src/app/flow/app-flow.ts) 增加 `viewer` 画面、`{ open-viewer, holdsPackage }` 输入与 `viewer-entry` 焦点目标；查看器目前是 [ViewerPage](../../../../../src/ui/viewer/ViewerPage.tsx) 占位，由 11 替换。
- **菜单：** [MainMenuPage.tsx](../../../../../src/ui/pages/MainMenuPage.tsx)
  - **状态：** 未持有资源包时，按持有者快照显示正在检查、没有、找到已保存的资源（尚未校验）或存储不可用；持有时列出状态阶梯，文字在 [resource-copy.ts](../../../../../src/ui/import/resource-copy.ts)，保存与恢复附耗时。
  - **失败：** 存储、恢复与保存的失败以 [FailureNotice](../../../../../src/ui/import/FailureNotice.tsx) 显示 05 的文案与技术细节。
  - **入口：** `View resources`、`Open saved resources`（恢复中禁用，成功后焦点移到 `View resources`）与 `Save again`（保存中禁用）。
- **测试入口：** [e2e/entries/app.html](../../../../../e2e/entries/app.html) 与 [app-entry.test-support.tsx](../../../../../src/app/app-entry.test-support.tsx) 挂载生产 `App`，以查询参数选择合成 Worker 场景（默认 `models`）、`cache=unavailable`，预期包配置取场景的配置。
  - [synthetic-import.test-support.ts](../../../../../src/workers/synthetic-import.test-support.ts) 新增 `SCENARIO_SOURCES`、`scenarioOpen` 与 `scenarioProfile`，Worker 测试入口改用它们；[import-job.test.ts](../../../../../src/workers/import-job.test.ts) 证明每个场景的指纹，以及 `models` 与 `synthetic` 场景所发资源包的身份，都与配置一致。
  - 生产构建的 `dist` 只有 `index.html` 一个页面，产物中没有测试支持或 `MARKER` 文字。
- **模块图：** [engineering-boundaries.test.ts](../../../../../tools/engineering-boundaries.test.ts) 新增从 `src/main.tsx` 出发的页面模块图检查：含 `App`、`browser-ports` 与 `production-package`，不含 `original-data`、测试或测试支持，也不含 Worker 入口；Worker 入口的模块图含 `original-data`。
  - 遍历与原有依赖图检查共用 `sourceDependencies`；原依赖图检查同样跳过 `.test-support.tsx` 根。
  - 证伪：在 `App.tsx` 加入一个测试支持导入后，该测试失败。
- **合规构建：** 接入 Worker 工厂后，生产构建首次产出导入 Worker chunk。Vite 把它作为没有原始文件名的资产连同自己的 map 写入页面 bundle，合规插件原本以 `asset-ownership` 失败。
  - [distribution.ts](../../../../../tools/compliance/distribution.ts) 改为：脚本末尾的 `sourceMappingURL` 指向同名 map、map 的 `file` 指回该脚本，且某个 chunk 以文件名引用它，三者都成立时，按该 map 的来源归属。
  - [distribution.test.ts](../../../../../tools/compliance/distribution.test.ts) 新增两条：合成模块 Worker 构建得到归属；没有 chunk 引用的脚本与 map 仍被拒绝。证伪：去掉归属或去掉关联条件时，相应测试失败。
- **浏览器（按 browser-testing 只用合成数据）：**
  - [app-shell.spec.ts](../../../../../e2e/app-shell.spec.ts) 在开发与生产项目中都通过：空存储显示“None in this browser.”；演示与导入各往返两轮，返回时焦点落在对应入口，演示每轮都运行；页面不含禁用词。
  - [app-shell-resources.spec.ts](../../../../../e2e/app-shell-resources.spec.ts) 只在开发项目运行：
    - 预置其他转换器版本与其他指纹的条目，回到菜单后不提供恢复；
    - 预置与配置一致的条目，回到菜单后显示“找到已保存的资源，尚未校验”；
    - 恢复后状态阶梯为完整资源可查看、已保存（附耗时）、任务不可载入（合成包的逻辑 payload 是占位），焦点移到 `View resources`；
    - 进入查看器并返回，焦点回到 `View resources`；
    - `cache=unavailable` 时显示存储不可用的文案，演示与导入照常可用。
  - 应用载入即列出缓存，会创建数据库，因此只测缓存适配的用例改经 [blank.html](../../../../../e2e/entries/blank.html) 运行（[resource-cache.ts](../../../../../e2e/support/resource-cache.ts) 的 `loadCacheModules`）。
- **检查：**
  - `pnpm exec vitest run src/app src/ui src/workers tools`：全部通过；
  - `pnpm check`：145 个文件 4,378 条测试，构建通过；
  - `pnpm test:e2e`：三个项目共 66 条通过。
- **Rubber-duck：** 两项阻塞问题与一项非阻塞问题，全部采纳：
  - Worker 资产的归属只凭同名 map 不够：改为要求上述三项关联，并补反例；
  - 已保存的资源包在列出失败、或同键条目损坏或不兼容时，仍显示已保存：改为只有兼容的同键条目才保持已保存，否则为仅在内存中并附原因；菜单在持有资源包时也显示存储不可用；补 Node 测试；
  - 演示生命周期绕过了端口的 `reportError`：已改用端口。
- **Simplify：** 采纳两项：
  - 禁用词检查移到 [app-entry.ts](../../../../../e2e/support/app-entry.ts) 共用；
  - 页面模块图遍历复用抽出的 `sourceDependencies`。

  未采纳：
  - 合并 `FailureNotice` 与外壳的 `FailureAlert`：前者显示固定文案与技术细节，后者显示开发者错误文本；
  - 合规插件的逐资产扫描：只对没有原始文件名的脚本进行，目前只有一个；
  - 把 Worker 归属泛化：条件已与文件名无关；
  - 测试入口配置与菜单分配的记忆化：开销可忽略。
- **文档影响：**
  - [工程约定](../../../../engineering/README.md)：Worker 资产的合规归属；应用端口与主菜单；测试入口；缓存用例的空白页；流转的新画面与焦点；
  - [源码结构](../../../../engineering/source-structure.md)：新文件、场景配置，并补上 01 漏列的 `production-package.ts`、持有者已保存状态的核对规则。
