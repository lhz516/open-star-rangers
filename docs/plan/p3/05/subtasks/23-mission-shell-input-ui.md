---
type: plan
status: active
phase: P3
task: "05"
subtask: "23"
updated: 2026-10-10
---

# 23 — 任务壳：输入区、焦点、提示与全屏控件

**契约来源：** [spec](../spec.md) 的[输入区与焦点](../spec.md#输入区与焦点)、[暂缺标注](../spec.md#暂缺标注)（呈现方式）、[全屏与 Keyboard Lock](../spec.md#全屏与-keyboard-lock)（开始手势与全屏按钮）、[Alt+F4 风险提示](../spec.md#altf4-风险提示)、[涉及模块](../spec.md#涉及模块)的 ui/mission，技术决定 6、8；S-07、S-09、S-12、S-13 的界面部分；AC-10、AC-15 的组件部分。
**依赖：** 无。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **输入区：** 在 [MissionShell.tsx](../../../../../src/ui/mission/MissionShell.tsx) 的 `mission-view` 内建立唯一的游戏输入区组件（`tabIndex` 0、可访问名称），以回调交出元素供键盘源绑定；点击使其获得焦点，仅用于聚焦的点击不产生游戏动作（由装配与 22 的规则配合）。
- **焦点转移：** 出发占位结束进入飞行时与任务菜单 Continue 成功恢复后，焦点移到输入区；页面挂载时仍落在标题；只在页面可见、窗口有焦点且用户未主动把焦点移到另一控件时执行；隐藏期间不抢焦点。实现为可测试的决定函数与组件钩子。
- **提示：** 会话 running 或 paused 而输入区未聚焦时显示“点击游戏画面以操控”一类的项目提示，不设焦点陷阱；G 项标注区为非模态、`aria-live="polite"` 的状态文字，不移动焦点、不暂停，同项再按刷新、约 3 秒消失（文字来自 `SLICE_GAPS`，由 24 提供 G-08–G-10）；能力降级与输入错误的显示位置。
- **Alt+F4 提示：** 纯函数决定是否显示：平台族为 Windows、Linux 或无法判定，running 飞行首次处于非 API 全屏（含先全屏后退出、请求失败的路径），每个页面加载至多一次、不持久化；macOS 不显示；非模态、可关闭、不暂停、不移动焦点。文案说明 Alt+F4 可能关闭窗口、全屏与锁键不是系统拦截保证、离页确认受浏览器限制。
- **全屏控件：** 任务壳的显式全屏按钮；开始配置页的开始按钮在同一用户手势处理中同步调用注入的全屏回调后再开始；全屏目标为文档级，不只覆盖游戏子元素。
- 组件以 props/回调接收状态与动作，不直接依赖 `ui/game-input` 的实现，由 25 适配。文案集中在 [mission-copy.ts](../../../../../src/ui/mission/mission-copy.ts)。
- Node 测试：焦点转移决定、Alt+F4 显示决定（平台、全屏状态、先全屏后退出、已显示）、G 项标注计时；组件结构可在现有测试方式下覆盖的部分。

## 不包含

- G-08–G-10 的文字与 slice-gaps 文档（24）；装配、端口与真实焦点/全屏行为（25、28）。

## 关键文件与契约

- [MissionShell.tsx](../../../../../src/ui/mission/MissionShell.tsx)、[MissionPage.tsx](../../../../../src/ui/mission/MissionPage.tsx)、[StartConfigPage.tsx](../../../../../src/ui/mission/StartConfigPage.tsx)、[MissionParts.tsx](../../../../../src/ui/mission/MissionParts.tsx)、[mission-copy.ts](../../../../../src/ui/mission/mission-copy.ts)、[use-focus-on-mount.ts](../../../../../src/ui/pages/use-focus-on-mount.ts)、[app.css](../../../../../src/app/app.css)。
- 计划新增：`GameInputZone.tsx`、`InputNotices.tsx`、`input-notices.ts`、`input-notices.test.ts`、`use-input-focus.ts`（`src/ui/mission/`）。

## 写入范围

- `src/ui/mission/MissionShell.tsx`、`src/ui/mission/MissionPage.tsx`、`src/ui/mission/StartConfigPage.tsx`、`src/ui/mission/MissionParts.tsx`
- `src/ui/mission/mission-copy.ts`、`src/ui/mission/mission-copy.test.ts`
- `src/ui/mission/GameInputZone.tsx`、`src/ui/mission/InputNotices.tsx`、`src/ui/mission/input-notices.ts`、`src/ui/mission/input-notices.test.ts`、`src/ui/mission/use-input-focus.ts`
- `src/app/app.css`

## 验收标准

- [ ] 任务画面只有一个输入区；焦点只在两个状态变化时、且满足条件时移入；挂载时仍在标题。
- [ ] 未聚焦提示、G 项标注区与 Alt+F4 提示的行为与无障碍属性符合契约；Alt+F4 决定覆盖全部平台与路径。
- [ ] 开始按钮在同一手势中先发起全屏回调；全屏按钮存在且目标为文档级。
- [ ] `pnpm exec vitest run src/ui/mission` 通过；按 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 检查本项改动；`pnpm typecheck` 与 `pnpm lint` 通过。

## 验证方法

- Node 测试；真实浏览器的焦点、StrictMode、提示与全屏由 28 验证。

## 完成证据
