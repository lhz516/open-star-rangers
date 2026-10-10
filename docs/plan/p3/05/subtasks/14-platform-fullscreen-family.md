---
type: plan
status: active
phase: P3
task: "05"
subtask: "14"
updated: 2026-10-10
---

# 14 — 平台全屏、Keyboard Lock 与平台族

**契约来源：** [spec](../spec.md) 的[全屏与 Keyboard Lock](../spec.md#全屏与-keyboard-lock)、[Alt+F4 风险提示](../spec.md#altf4-风险提示)（平台族判定）、[数据模型与契约](../spec.md#数据模型与契约)的“全屏与 Keyboard Lock 端口”“能力申请状态与错误”“平台族”行；S-12、S-13 的平台部分；AC-14、AC-15 的平台部分。
**依赖：** 无。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 计划新增 DOM-free 的 `src/platform/browser/fullscreen.ts`：分别报告 Fullscreen 与 Keyboard Lock 是否支持；在调用方的用户手势中同步发起文档级全屏请求（不等待异步操作后再请求）；锁定给定的非空 `code` 列表（禁止无参数“锁全部键”，拒绝 Escape、Tab、Meta 与 F12）；解除锁定；只退出由本端口进入且仍拥有的 API 全屏，不关闭用户自行切换的浏览器全屏；以 `fullscreenchange`/`fullscreenerror` 与实际全屏元素报告状态。Promise 完成不等于真实全屏，状态以实际元素为准。
- 失败以稳定原因类别报告；注册原子、可撤销，撤销后旧回调不投递。
- 计划新增 `src/platform/browser/platform-family.ts`：由宿主读取的 `userAgentData.platform`（优先）或 `navigator.platform` 判定 `macos`、`windows`、`linux` 或 `unknown`，纯函数可在 Node 测试。
- 计划新增浏览器连接 `browser-fullscreen.ts`、`browser-platform-family.ts`。
- Node 测试：支持判定组合、请求成功/失败/部分成功（全屏成功而锁键失败）、锁键清单校验、只退出自有全屏、撤销后静默、平台字符串判定表。

## 不包含

- 何时请求与锁定、申请代次与关闭屏障（21）；开始按钮与全屏按钮（23、25）；Alt+F4 提示的显示决定（23）。

## 关键文件与契约

- 参照 [leave-guard.ts](../../../../../src/platform/browser/leave-guard.ts) 与 [timer.ts](../../../../../src/platform/browser/timer.ts) 的“DOM-free 核心 + 薄浏览器连接”拆分。
- 计划新增：`fullscreen.ts`、`fullscreen.test.ts`、`browser-fullscreen.ts`、`platform-family.ts`、`platform-family.test.ts`、`browser-platform-family.ts`。

## 写入范围

- `src/platform/browser/fullscreen.ts`、`src/platform/browser/fullscreen.test.ts`、`src/platform/browser/browser-fullscreen.ts`
- `src/platform/browser/platform-family.ts`、`src/platform/browser/platform-family.test.ts`、`src/platform/browser/browser-platform-family.ts`

## 验收标准

- [ ] 全屏与锁键的支持、请求、状态与失败分别报告；锁键清单非空且排除 Escape、Tab、Meta、F12；只退出自有全屏。
- [ ] 平台族判定覆盖 macOS、Windows、Linux 与无法判定。
- [ ] Node 测试通过（`pnpm exec vitest run src/platform/browser`）；按 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 检查本项改动；`pnpm typecheck` 与 `pnpm lint` 通过。

## 验证方法

- Node 假宿主测试；真实 Chrome 的全屏与锁键由 28、30 验证。

## 完成证据
