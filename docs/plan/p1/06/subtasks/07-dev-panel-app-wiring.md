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

- [x] AC-01（DOM）：初始显示 idle、无投影、无 pending；start 后显示 scenario、tick、实际 tickRateHz、mover 与 marker=无。
- [x] AC-11：组件只取得只读句柄与 action，经 app 类型检查与代码审阅确认无写入口，且无整 store 订阅。
- [x] AC-13（基础）：面板包含全部控件与反馈区域，按可用性启用；无全局键绑定，无导入成功、Canvas 或飞行 HUD 文案。
- [x] 浏览器冒烟通过；ui 不导入 app 装配；`pnpm check`（含 app 类型程序与生产构建）通过。

## 验证方法

- `pnpm check`；hook/组件不被 `.test.ts` 导入，由 app 类型程序检查。
- browser-testing：启动本项自有 Vite，在隔离 Chromium 中记录 DOM 观测，结束后停止服务器并清理自有 context。
- 使用 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 时限定本项文件。更新[源码结构指南](../../../../engineering/source-structure.md)的当前目录与 `ui/dev/` 职责，检查[工程约定](../../../../engineering/README.md)与[阶段索引](../../tasks.md)§2 中“App 仍是占位页面”的现状描述。

## 完成证据

- 2026-10-02：实现。
  - [use-synthetic-game.ts](../../../../../src/ui/game/use-synthetic-game.ts) 把 Zustand 的 `useStore(reader, selector)` 封装为只读 hook，不导出写入口。
  - [SyntheticDevPanel.tsx](../../../../../src/ui/dev/SyntheticDevPanel.tsx) 只接收只读 `store` 与 `dispatch`，不导入 app 装配。各区块分别订阅：控件区只订阅缓存的可用性对象，状态区订阅 status，投影区订阅 projection，反馈区订阅 pending 与结果列表，错误区订阅两种错误与 cleanupFailed。面板醒目标明“P1 synthetic engineering demo — not original gameplay”；cleanupFailed 时提示重新加载页面。所有动作都是原生 button，无全局键盘监听。
  - [use-synthetic-demo-owner.ts](../../../../../src/app/composition/use-synthetic-demo-owner.ts) 在 effect 中用 `createBrowserSessionHost()` 与 `performance.now` 创建 owner，cleanup 时 dispose，失败经 `reportError` 报告。
  - [App.tsx](../../../../../src/app/App.tsx) 保留“无原版内容”说明并渲染面板，不按环境隐藏、不自动 start；main 与 StrictMode 未改。
- 浏览器冒烟（[browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md)）：
  - 环境：自有 Vite `pnpm dev --host 127.0.0.1 --port 5173 --strictPort`；macOS 上本机 Chrome 154.0.8037.95，headed 运行，使用全新临时 profile（`/tmp/osr-p106-chrome`）并开 `--remote-debugging-port=9339`；VS Code `runPlaywrightCode` 经 `connectOverCDP` 驱动，窗口约 1000×900。
  - 结果（AC-01 DOM、AC-13 基础）：初始 phase=idle、“No current world.”、pending 与 results 均为 None，只有 Start 可用。点击 Start 后投影 scenario=synthetic、tick 从 0 推进，tickRate 为 60 Hz，marker 为 none；running 时可用 Pause/Restart/Exit/Add marker/Remove marker。点击 Add marker 后得到“accepted by Core at tick 15: marker-added entity 2 at (−2.336, −4.997, −2.767)”，marker 显示与事件位置一致。没有控制台错误或失败请求，`window`/`document` 上没有 onkeydown。
  - 工具记录：首次在 `runPlaywrightCode` 内用 `browserType().launch()` 启动的浏览器，在调用结束后失去句柄（调用之间不保留全局状态）。经核对它是本轮自建的进程（临时 Playwright profile、启动于 18:04:29），已按 PID 停止。之后改为在 bash 中自管 Chrome 进程并经 CDP 连接；该浏览器与 Vite 保留给 08 使用，由 08 负责清理。
- AC-11：组件 props 类型只有 `SyntheticGameStoreReader`（无 setState）与 `dispatch`，经 app 类型程序检查，代码审阅确认没有整 store 订阅。提交计数的浏览器证据由 08 取得。
- rubber-duck 阻断问题已采纳：可用性原先按 phase/cleanupFailed/environmentVisible 原值缓存，可见性变化（如 idle 时隐藏）会产生内容相同的新对象，使按钮区多余提交。现改为按启用动作集合（位掩码）缓存，新增测试确认 idle 可见/隐藏、faulted 可见/隐藏、disposed 与 null 等内容相同的组合返回同一对象。其余审查项（StrictMode 与 Fast Refresh 下不会操作已销毁的 owner、selector 稳定、ui 不导入 app 装配、原生按钮语义、resume/exit 规则、无 HUD/导入文案）无问题。
- simplify（四角度，分两个代理）：
  - 已采纳：控件区只计算一次可用性，再传给两个按钮组；复用 Core 的 `Vec3` 与会话的 `SessionFailure` 类型。
  - 未采纳“去掉薄封装 `useSyntheticGame`”：它是计划中的只读 hook 入口，只接受 reader，并说明 selector 约定。
  - altitude 无发现。
  - 采纳后重新冒烟通过。
- 工程检查：`pnpm check` 通过（34 个文件 / 668 项测试、三个类型程序、ESLint、生产构建）。hook 与组件不被 `.test.ts` 导入。
- 文档影响：[源码结构指南](../../../../engineering/source-structure.md)更新当前目录与 P1-06 交付范围；[工程约定](../../../../engineering/README.md)补充 React 接线说明；[阶段索引](../../tasks.md)§2 改为 App 已承载合成开发面板。原版事实与冻结决定无变化。
