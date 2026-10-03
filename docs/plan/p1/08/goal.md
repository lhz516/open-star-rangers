---
type: plan
status: accepted
phase: P1
task: "08"
updated: 2026-10-02
---

# P1-08：菜单与导入占位 — Goal

## 目标与来源

实现已批准的 [spec](./spec.md) 中的 S-01–S-08 与 AC-01–AC-15：页面加载显示 React 主菜单，从菜单进入/返回合成演示时创建并完整释放 owner，导入入口只做诚实的占位说明；渲染失败可经返回菜单重建，任何清理或回滚失败在当前应用实例内锁存并阻断新 owner；焦点、键盘与鼠标流转正确。本文件不重新定义行为契约。

## 代码现状与前提

- [App](../../../../src/app/App.tsx) 目前一加载就调用 [useSyntheticDemoOwner](../../../../src/app/composition/use-synthetic-demo-owner.ts) 并显示 [SyntheticRenderView](../../../../src/ui/render/SyntheticRenderView.tsx) 与 [SyntheticDevPanel](../../../../src/ui/dev/SyntheticDevPanel.tsx)；没有页面状态、菜单或导入入口，不自动 start。
- [createSyntheticDemoOwner](../../../../src/app/composition/synthetic-demo-owner.ts) 把渲染器创建异常（含回滚失败的 `AggregateError`）一律降级为 unavailable；`dispose()` 幂等、失败时写 `actionError{operation:'cleanup'}` 并抛出；没有可读取的清理失败记录。hook 释放失败只 `reportError`，随后照常重建。
- [createSyntheticRenderer](../../../../src/render/synthetic/synthetic-renderer.ts) 与 [createBrowserWebGLSurface](../../../../src/render/webgl/browser-webgl-surface.ts) 在初始化回滚失败时只抛 `AggregateError`，与“业务异常本身就是 AggregateError”无法区分；渲染器 `attach()` 的回滚失败同样只以 `AggregateError` 抛给桥接。
- [SyntheticSession](../../../../src/app/session/synthetic-session.ts) 的 `status().cleanupFailed` 已在资源清理、取消帧失败时置位并阻断 start/restart；Session 契约不变。
- Node 测试设施：[ControlledHost](../../../../src/app/session/synthetic-session.test-support.ts)、[RecordingSurface](../../../../src/render/scene/render-surface.test-support.ts)、[TestClock](../../../../src/ui/game/synthetic-ui.test-support.ts)，以及 [synthetic-demo-owner.test.ts](../../../../src/app/composition/synthetic-demo-owner.test.ts) 中的 `vi.mock` 桥接注入与 `FailingCancelHost`。
- 计划新增：`src/app/flow/`（页面流转纯逻辑与测试）、`src/app/composition/` 内的 DOM-free 演示生命周期接线及测试、`src/ui/pages/` 下的三个画面组件。具体文件名在子任务中列出。
- 前提：[P1-06](../06/goal.md#子任务跟踪) 与 [P1-07](../07/goal.md#子任务跟踪) 的 goal 均已全部 completed；不依赖 P1-09。不新增依赖；验证命令为现有 `pnpm exec vitest run …`、`pnpm check`，浏览器证据按 [browser-testing](../../../../.agents/skills/browser-testing/SKILL.md) 与[工程约定](../../../engineering/README.md#已验证的-cdp-自动化路线)中已验证的 CDP 路线取得。
- 不产生原版研究结论，不使用原版资源；菜单是 P1 原型，不代表原版界面。

## 验收覆盖

| Spec 范围项/验收项 | 实现子任务 | 验证子任务及方法 |
|---|---|---|
| S-01 | 01、04 | 01：转换表 Node 测试；06：浏览器流转 |
| S-02 | 04 | 06：主菜单 DOM/可访问性 |
| S-03 | 03、04 | 03：一次性 start Node 测试；06：浏览器进入演示 |
| S-04 | 03、04 | 03：先释放后创建 Node 测试；06：往返资源探针 |
| S-05 | 02、03、04 | 02、03：清理失败记录与锁存 Node 测试；06：unavailable 浏览器与审阅 |
| S-06 | 04 | 06：导入占位 DOM、网络与存储 |
| S-07 | 04 | 06：键盘、焦点与监听计数 |
| S-08 | 05 | 05：文档与工程检查；06：最终核对 |
| AC-01 | 04 | 06：开发与生产预览主菜单检查 |
| AC-02 | 01 | 01：Node 参数化转换测试 |
| AC-03 | 03、04 | 06：鼠标/Enter/Space 进入与 mover 像素 |
| AC-04 | 04 | 06：面板控制、重启、Exit 不被自动 start 撤销 |
| AC-05 | 03、04 | 06：三种状态返回菜单的释放探针 |
| AC-06 | 03、04 | 06：20 次演示往返与 20 次导入往返 |
| AC-07 | 04 | 06：导入占位、网络与存储读回 |
| AC-08 | 04 | 05：生产源码检索与调用点审阅 |
| AC-09 | 02、03 | 02、03：Node 清理失败记录与装配接收路径 |
| AC-10 | 02、03、04 | 03：Node 锁存与恢复；05：文案/焦点审阅；06：WebGL 禁用浏览器 |
| AC-11 | 04 | 06：键盘流程、焦点指示与按键负向检查 |
| AC-12 | 03、04 | 06：StrictMode 与 Fast Refresh 替换 |
| AC-13 | 04 | 06：1280×800 与 360×640 溢出测量 |
| AC-14 | 01、02、03、05 | 05：目标 Vitest、`pnpm check`、依赖与文档检查 |
| AC-15 | 03 | 03：生产装配接线 Node 测试；06：浏览器交叉验证 |

## 子任务跟踪

状态只在此维护：`pending` / `in-progress` / `blocked` / `completed`。依赖项全部 completed 后才能开始；验收结果和证据写在相应 subtask 文档，不在阶段索引重复状态。

| 子任务 | 依赖 | 状态 |
|---|---|---|
| [01-app-flow-state.md](./subtasks/01-app-flow-state.md) | — | completed |
| [02-cleanup-failure-signals.md](./subtasks/02-cleanup-failure-signals.md) | — | completed |
| [03-demo-lifecycle-wiring.md](./subtasks/03-demo-lifecycle-wiring.md) | 01, 02 | completed |
| [04-menu-pages-shell.md](./subtasks/04-menu-pages-shell.md) | 01, 03 | completed |
| [05-docs-isolation-checks.md](./subtasks/05-docs-isolation-checks.md) | 01, 02, 03, 04 | pending |
| [06-final-browser-alignment.md](./subtasks/06-final-browser-alignment.md) | 01, 02, 03, 04, 05 | pending |

最后一行始终为最终对齐验证，依赖所有其他子任务。ID 分配后保持不变；新增修复项使用新 ID，插入最终验证之前并加入其依赖。

## 执行记录

## 审批

用户于 2026-10-02 明确批准本 goal（“approve the goal and commit”），批准范围为当前 6 个子任务、依赖关系及 S-01–S-08、AC-01–AC-15 覆盖。此批准不代表实现完成，也不替代 spec 批准。
