---
type: plan
status: active
phase: P3
task: "05"
subtask: "27"
updated: 2026-10-10
---

# 27 — 隔离地图输入入口与浏览器验证

**契约来源：** [spec](../spec.md) 的[战略地图输入](../spec.md#战略地图输入)、[执行前提](../spec.md#执行前提)“地图交接”、[验证策略](../spec.md#验证策略)；S-11；AC-12，以及 AC-09（锁指针时的 Esc）、AC-13（主动/被动解锁）、AC-16（Pointer Lock 监听平衡）的浏览器部分。
**依赖：** 22。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 计划新增只由开发服务器提供的隔离入口 `e2e/entries/map-input.html` 与其脚本 `src/ui/game-input/map-input-entry.test-support.tsx`：挂载与生产相同的地图输入（22）、自绘光标与几何（17）、Pointer Lock 端口（13），以显式合成几何、显式初始位置与左键时机和可切换的合成交互上下文驱动；向测试暴露观察钩子（光标位置、已提交的 hover/select 序列、锁定状态与原因）。不另建生产演示地图。
- 按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md) 编写 e2e：真实像素读回光标随移动、四边与四角钳制、移动后旧位置被清除；缩放、黑边、DPR（`deviceScaleFactor`）、零尺寸与无几何的停用；hover 合并、多个 select 的位置与顺序、hover 提交失败不选错点；真实 `pointerLockElement` 的锁定、主动解锁（离开地图、失焦）与被动解锁（浏览器退出），解锁后地图仍开、下一次点击只重锁；权限 pending/拒绝（测试入口模拟）与无锁回退、区域外点击不提交；资源平衡计入新的 Pointer Lock 监听分组。Playwright 的 Escape 不一定经过浏览器原生解锁，以实际 `pointerlockchange` 断言并在证据中标注；原生 Esc 由 30 实机核对。
- 需要原生 headed 能力时按[本地浏览器 runner](../../../../engineering/README.md#本地浏览器-runner) 的项目归属命名并登记；同步开发服务器预热与 e2e 配置测试。

## 不包含

- 真实任务中打开地图的完整路径（P3-15）；原版外观（P3-13）。

## 关键文件与契约

- [e2e/entries/app.html](../../../../../e2e/entries/app.html)（入口写法参照）、[playwright.config.ts](../../../../../playwright.config.ts)、[vite.config.ts](../../../../../vite.config.ts)、[browser-probes.ts](../../../../../e2e/support/browser-probes.ts)（监听分组）、[e2e-configuration.test.ts](../../../../../tools/e2e-configuration.test.ts)。
- 计划新增：`e2e/entries/map-input.html`、`src/ui/game-input/map-input-entry.test-support.tsx`、`e2e/map-input.development.spec.ts`（若须 headed 则为 `e2e/map-input-native.spec.ts`）、`e2e/support/map-input.ts`。

## 写入范围

- `e2e/entries/map-input.html`、`src/ui/game-input/map-input-entry.test-support.tsx`
- `e2e/map-input.development.spec.ts`、`e2e/map-input-native.spec.ts`、`e2e/support/map-input.ts`
- `e2e/support/browser-probes.ts`
- `playwright.config.ts`、`vite.config.ts`、`tools/e2e-configuration.test.ts`

## 验收标准

- [ ] AC-12：合成几何下的像素位置、钳制、清除旧位置，缩放/黑边/DPR/零尺寸/无几何，hover 合并与 select 顺序、hover 失败，真实 Pointer Lock 的锁定与解锁、权限与无锁回退、区域外点击，均有通过的浏览器断言。
- [ ] 入口使用与生产相同的组件；证据中写明本入口不代表真实任务的地图路径。
- [ ] 新监听分组纳入资源平衡且回到基线；`pnpm test:e2e e2e/map-input.development.spec.ts --project=development`（或所属项目）通过，`pnpm check` 通过。

## 验证方法

- 列出运行命令、项目与结果；像素读回与 `pointerLockElement` 的断言摘要。

## 完成证据
