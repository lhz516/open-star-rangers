---
type: plan
status: active
phase: P1
task: "08"
subtask: "05"
updated: 2026-10-02
---

# 05 — 工程文档与隔离检查

**契约来源：** [spec](../spec.md) 的 S-08、AC-08、AC-10（文案与焦点接线的审阅部分）、AC-14，验证策略中的“工程检查”。
**依赖：** 01, 02, 03, 04, 07。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 同步[工程约定](../../../../engineering/README.md)：页面流转、演示生命周期接线（一次性 start、先释放后创建、清理失败锁存）、owner 清理失败记录与渲染回滚信号、菜单的验证方式；更新 P1-07 中“恢复入口归 P1-08”的表述为现状。
- 同步[源码结构指南](../../../../engineering/source-structure.md)：新增 `app/flow/`、`ui/pages/` 与新的 composition 文件，更新 App 描述。
- 执行 AC-08 生产源码检索（忽略注释），列出命中；审阅 owner 与演示画面调用点只使用 `SYNTHETIC_DEMO_OPTIONS`。
- 审阅 failed/faulted/初始化失败/锁存的 React 文案与焦点接线，以及 02 的浏览器表面回滚信号产生点，记录为审阅证据（不写成浏览器 passed）。
- 运行 AC-14 的工程检查与依赖差异检查；确认阶段索引链接正确。

## 不包含

- 任何功能代码改动；发现缺陷时由 execute-goal 新增修复子任务。
- 浏览器证据（06）。

## 关键文件与契约

- [docs/engineering/README.md](../../../../engineering/README.md)、[docs/engineering/source-structure.md](../../../../engineering/source-structure.md)、[docs/plan/p1/tasks.md](../../tasks.md)。
- [package.json](../../../../../package.json)、[pnpm-lock.yaml](../../../../../pnpm-lock.yaml) 应无差异。

## 验收标准

- [x] AC-08：检索结果列出，页面流转、页面组件与 App 无禁止导入或 API；演示 owner 只用 `SYNTHETIC_DEMO_OPTIONS`。
- [x] AC-10 审阅部分：文案、恢复入口与焦点接线与 spec 一致，并标注为审阅证据。
- [x] AC-14：新增 `.test.ts` 在 Vitest 发现范围内，DOM-free 模块进入 Node 类型程序；`pnpm check` 通过（块体积警告只记录）；无新依赖、Playwright、jsdom、React Testing Library、路由库、二进制资源或原版内容。
- [x] 工程约定与源码结构指南已同步，`updated:` 已更新；文档链接可解析。

## 验证方法

- `pnpm check`；`git diff -- package.json pnpm-lock.yaml` 为空；源码检索命令与结果写入证据。
- 不适用浏览器测试。

## 完成证据

- **AC-08 源码检索：** 范围为页面流转、页面组件、App/样式/入口、三个 composition 文件与 `describe-error.ts`。检索项：`original-data`、`/content/`、`workers`、`indexedDB`、`localStorage`、`sessionStorage`、`caches`、`FileReader`、`showOpenFilePicker`、`showDirectoryPicker`、`Worker`、`fetch(`、`type="file"`、`<input`、`addEventListener`、`keydown`/`keyup`/`keypress`、`history.`、`location.`。
  - 命中只有两处：[MainMenuPage.tsx](../../../../../src/ui/pages/MainMenuPage.tsx) 第 2 行的文档注释，以及第 29 行的 `data-testid="original-data-status"` 字符串。都不是导入或 API 调用，其余为零。
  - 调用点审阅：`SYNTHETIC_DEMO_OPTIONS` 只在 [synthetic-demo-owner.ts](../../../../../src/app/composition/synthetic-demo-owner.ts) 中传给 `createSyntheticSession`。`createSyntheticDemoOwner(host, clock, render)` 没有内容、导入或存档参数；唯一生产调用点是 [use-synthetic-demo-owner.ts](../../../../../src/app/composition/use-synthetic-demo-owner.ts)。
- **AC-10 审阅证据（代码审阅，不是浏览器复现）：**
  - **failed：** [SyntheticRenderView](../../../../../src/ui/render/SyntheticRenderView.tsx) 以 alert 显示原始错误、说明会话不受影响、返回菜单并重新启动可尝试恢复且会丢弃本次合成状态。
  - **unavailable：** alert 说明 WebGL 2 不可用、会话不受影响。
  - **Return 始终可用：** [SyntheticDemoPage](../../../../../src/ui/pages/SyntheticDemoPage.tsx) 无条件渲染 `Return to menu`，初始化失败、faulted、清理失败时都可用。初始化/启动失败的恢复说明由修复子任务 [07](./07-start-failure-recovery-text.md) 补齐。
  - **faulted 返回不锁存：** 无清理失败的 faulted 返回后不锁存，由 [03](./03-demo-lifecycle-wiring.md) 的“session fault 后重进得到 run 1”Node 测试证明。
  - **锁存时：** [App](../../../../../src/app/App.tsx) 在所有画面显示含 `describeError(cause)` 与刷新提示的 alert，原因来自页面流转状态，不依赖 owner 或面板。[MainMenuPage](../../../../../src/ui/pages/MainMenuPage.tsx) 原生禁用 Start 并在说明中写明原因，Import 照常可用。
  - **焦点：** 演示返回焦点为 menu-heading、导入返回为 import-entry，由 [01](./01-app-flow-state.md) 的 Node 测试证明；菜单按 `focusTarget` 聚焦。
  - **浏览器表面回滚信号：** 产生点为 [browser-webgl-surface.ts](../../../../../src/render/webgl/browser-webgl-surface.ts) 的 catch 分支：`attemptAll` 有失败时抛 `RollbackError`，否则原样抛出；hook 把它作为 `unavailable` 交给 owner，owner 按初始化失败处理（[02](./02-cleanup-failure-signals.md)、[03](./03-demo-lifecycle-wiring.md) 有 Node 测试）。
- **AC-14：**
  - 新增 `app-flow.test.ts`、`synthetic-demo-lifecycle.test.ts` 由 Vitest 发现。
  - `tsc -p tsconfig.node.json --listFilesOnly` 列出 `app/flow/app-flow.ts`、`synthetic-demo-lifecycle.ts`、`synthetic-demo-owner.ts`、`rollback-error.ts`，不含任何 `.tsx`。
  - `pnpm check`：43 个文件 1094 passed，构建成功（块体积 >500 kB 警告仅记录）。
  - 自计划提交 `6e59eb9` 起 `package.json`/`pnpm-lock.yaml` 无差异，没有新增二进制文件；新增文件均为源码/文档，无 Playwright、jsdom、React Testing Library、路由库或原版内容。
- **文档同步：**
  - [工程约定](../../../../engineering/README.md)：桥接回滚、owner `cleanupFailure()` 与表面回滚、hook 与面板/画面标题、渲染恢复方式（替换“恢复入口归 P1-08”）、`RollbackError`，以及新增“页面流转与演示生命周期”一节（含验证分层）。
  - [源码结构指南](../../../../engineering/source-structure.md)：目录树新增 `app.css`、`flow/`、`synthetic-demo-lifecycle.ts`、`rollback-error.ts`、`describe-error.ts`、`ui/pages/`，并更新 App 描述。
  - 两份文档的 `updated:` 均为 2026-10-02；[阶段索引](../../tasks.md#p1-08-菜单与导入占位)链接正确。相关文档中的相对链接经脚本核对，0 个失效。
- **Rubber-duck：**
  - 已修正：源码结构把“已交付”改为“已实现（最终对齐见 goal）”；`onCleanupFailure` 抛错时改为如实说明“经 `reportError` 报告，后者自身抛错才丢弃”。
  - 不成立：`cleanup.ts` 已在目录树中（第 57 行）。
- **Simplify：** 本子任务只改文档，不需要代码清理。

