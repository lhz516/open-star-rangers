---
type: plan
status: active
phase: P1
task: "06"
subtask: "07"
updated: 2026-10-02
---

# 07 — React 开发面板与应用接线

**契约来源：** [spec](../spec.md) 的 S-01、S-06、S-07，AC-01（DOM）、AC-11（组件只读）、AC-13，以及“控件可用性”与技术决定 1、7、9。
**依赖：** 06。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 新增 React selector hook：用 Zustand 的 `useStore` 读取 01 的只读句柄。组件只订阅标量或稳定切片，不订阅整个 store。
- 新增合成开发面板，props 只接收只读句柄与 action，不导入 app 装配。面板包含：
  - 醒目的“P1 合成工程演示，非原版玩法”标记。
  - 会话 phase、runId、pauseReason、environmentVisible、cleanupFailed。
  - 投影 scenario、tick、tickRateHz、mover 与 marker（或“无”）。
  - pending 列表与 recentResults（outcome、commandId、类型、reason 或事件的 tick/entity/position）。
  - actionError 与 sessionError；cleanupFailed 时显示“重新加载页面”提示。
  - start/pause/resume/restart/exit 与 add-marker/remove-marker 原生 `<button>`，按 04 的可用性启用，标签可读。
  - 不添加全局键盘监听。
- 新增 owner hook：effect 中用 `createBrowserSessionHost()` 与 `() => performance.now()` 创建 06 的 owner，cleanup 时 dispose。清理错误抛给 React 或经 `reportError` 报告；初始化失败通过 store 显示，不自动刷新。
- 修改 App：保留“无原版内容”说明并渲染面板；开发与生产构建均可见，不按环境隐藏，不自动 start。main 与 StrictMode 不修改。
- 用 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md) 做冒烟：页面加载、面板与合成标记可见、start 后 tick 前进、add 得到 accepted。完整浏览器证据归 08。

## 不包含

- 正式菜单、导入、设置、Canvas/Three.js、飞行 HUD、键位映射。
- 完整的浏览器 AC 证据、提交计数与 StrictMode/HMR 测量（08）。

## 关键文件与契约

- [App.tsx](../../../../../src/app/App.tsx)（已有，本项修改）；[main.tsx](../../../../../src/main.tsx)（已有，不改）。
- [browser-session-host.ts](../../../../../src/platform/browser/browser-session-host.ts)（已有，只在 owner hook 中创建）。
- 计划新增：`src/ui/game/use-synthetic-game.ts`、`src/ui/dev/SyntheticDevPanel.tsx`、`src/app/composition/use-synthetic-demo-owner.ts`。

## 验收标准

- [ ] AC-01（DOM）：初始显示 idle、无投影、无 pending；start 后显示 scenario、tick、实际 tickRateHz、mover 与 marker=无。
- [ ] AC-11：组件只取得只读句柄与 action，经 app 类型检查与代码审阅确认无写入口，且无整 store 订阅。
- [ ] AC-13（基础）：面板包含全部控件与反馈区域，按可用性启用；无全局键绑定，无导入成功、Canvas 或飞行 HUD 文案。
- [ ] 浏览器冒烟通过；ui 不导入 app 装配；`pnpm check`（含 app 类型程序与生产构建）通过。

## 验证方法

- `pnpm check`；hook/组件不被 `.test.ts` 导入，由 app 类型程序检查。
- browser-testing：启动本项自有 Vite，在隔离 Chromium 中记录 DOM 观测，结束后停止服务器并清理自有 context。
- 使用 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 时限定本项文件。更新[源码结构指南](../../../../engineering/source-structure.md)的当前目录与 `ui/dev/` 职责，检查[工程约定](../../../../engineering/README.md)与[阶段索引](../../tasks.md)§2 中“App 仍是占位页面”的现状描述。

## 完成证据
