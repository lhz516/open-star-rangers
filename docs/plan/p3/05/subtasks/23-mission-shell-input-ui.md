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

- [x] 任务画面只有一个输入区；焦点只在两个状态变化时、且满足条件时移入；挂载时仍在标题。
- [x] 未聚焦提示、G 项标注区与 Alt+F4 提示的行为与无障碍属性符合契约；Alt+F4 决定覆盖全部平台与路径。
- [x] 开始按钮在同一手势中先发起全屏回调；全屏按钮存在且目标为文档级。
- [x] `pnpm exec vitest run src/ui/mission` 通过；按 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 检查本项改动；`pnpm typecheck` 与 `pnpm lint` 通过。

## 验证方法

- Node 测试；真实浏览器的焦点、StrictMode、提示与全屏由 28 验证。

## 完成证据

- **实现（2026-10-10）：** 决定集中在 DOM-free 的 [input-notices.ts](../../../../../src/ui/mission/input-notices.ts)；React 部分为 [GameInputZone.tsx](../../../../../src/ui/mission/GameInputZone.tsx)、[InputNotices.tsx](../../../../../src/ui/mission/InputNotices.tsx)、[use-input-focus.ts](../../../../../src/ui/mission/use-input-focus.ts)，接入 [MissionShell.tsx](../../../../../src/ui/mission/MissionShell.tsx)、[MissionPage.tsx](../../../../../src/ui/mission/MissionPage.tsx)、[StartConfigPage.tsx](../../../../../src/ui/mission/StartConfigPage.tsx)；文案在 [mission-copy.ts](../../../../../src/ui/mission/mission-copy.ts)，样式在 [app.css](../../../../../src/app/app.css)。不导入 `ui/game-input`。
  - **装配接口：** `MissionPage`/`MissionShell` 的可选 `input: MissionInputView`（`bindZone`、`gap`、`status`、`error`、`platformFamily`、`altF4Tip` 闩、`fullscreen { status, request, requestOnStart }`）。未传入时页面与 P3-04 完全相同（无输入区、焦点在标题），由 25 接线后转为必有。
  - **输入区：** `mission-view` 内唯一的 `game-input-zone`：`tabIndex=0`、`role="application"`、`aria-label="Game controls"`，元素经回调 ref 交给 `bindZone`（键盘源的 `bind` 可直接使用；函数身份变化即重新绑定，接口注释写明须保持身份）。点击只聚焦，组件自身不产生任何动作；以自身 focus/blur 报告焦点供提示使用。
  - **焦点：** `inputFocusEntry` 只把 departure→flight 与 menu→flight 识别为入口；`useInputFocusEntry` 在 OwnerPages 以“渲染期调整 state”记录上一位置（不用 ref，StrictMode 双渲染仍正确）。`shellFocusTarget` 在壳挂载时一次决定：无入口或无输入区→标题（P3-04）；入口且用户已把焦点放在其他控件→不动焦点；入口且 running、可见、窗口有焦点→输入区；否则（隐藏、窗口失焦、hidden 造成的暂停）→标题，聚焦标题不取走系统焦点，用户回来时落点在标题。之后不因可见/聚焦再移动。
  - **提示：** `focusHintShown`：running/paused 且输入区未聚焦时显示，无焦点陷阱。G 项标注区为常驻 `role="status"`、`aria-live="polite"`，按 `{ id, serial, title, text }` 通用呈现（不依赖 24 的 G-08–G-10 条目，标注文字与 `GapNote` 共用 `GapText`），每次按下（新 serial）计 `GAP_NOTICE_MS`=3000 ms，较早按下的计时不会隐藏后来的按下；计时放在 OwnerPages，菜单往返后不会重显已过期的标注。能力降级为常驻 `role="status"` 文本行，输入错误为 `role="alert"`（新 key 重新播报）。
  - **Alt+F4：** `altF4TipDue`：平台族非 `mac`、running 飞行、全屏状态不是 `active`（含 pending、failed、退出后的 idle）、本页面加载未显示过；`createNoticeLatch` 为页面级闩，不持久化，由装配为整个页面加载提供一个。提示为可关闭的 `role="note"`，不暂停、不移动焦点。
  - **全屏：** 壳的“Full screen”按钮调用注入的文档级 `request`（无元素参数）；`fullscreenButtonState`：unsupported/active 隐藏，pending 禁用。开始按钮经 `startWithGesture` 在同一 click 中先同步调用 `requestOnStart` 再 `owner.start()`；回调抛出时仍开始并传播错误。
- **检查：** `pnpm exec vitest run src/ui/mission`：3 个文件 24 个用例通过（[input-notices.test.ts](../../../../../src/ui/mission/input-notices.test.ts) 覆盖入口识别全矩阵、焦点三种去向与各条件、提示各相位、G 项计时的刷新/替换/过期、Alt+F4 的 4 平台×5 全屏状态矩阵与先全屏后退出、pending、非 running、闩只显示一次、按钮状态、开始手势顺序与抛出、文案）；`pnpm typecheck`、`pnpm lint` 通过；`pnpm check` 通过（231 个测试文件、6996 个用例、生产构建）。测试按 `tsconfig.node.json` 不含 DOM/JSX 类型检查，组件不能在 Node 中渲染，组件结构由上述决定函数与代码审阅覆盖。回归：`OSR_E2E_DEV_PORT=5169 OSR_E2E_PREVIEW_PORT=5170 pnpm exec playwright test e2e/interaction-render.spec.ts e2e/mission-flow.development.spec.ts --project=development` 8 项通过（未接线时标题焦点、`mission-view`、开始与菜单流程不变），服务器随 Playwright 退出，端口已空闲。真实浏览器的焦点、StrictMode、提示与全屏由 28 验证。
- **Rubber-duck：** 采纳 3 项：入口后用户另行聚焦的控件不再被标题夺走（三种去向）；pending 全屏不再无限期压住 Alt+F4 提示；G 项计时上移到 OwnerPages，避免菜单往返后重显。
- **Simplify：** 采纳：标注文字与 `GapNote` 共用 `GapText`；游戏画面段落只写一次。未采纳：以 ref 记录上一位置（StrictMode 双渲染会丢失入口）、合并 props 与 memo（快照不是逐 tick 更新，收益可忽略）、稳定化 ref 跳板（换绑定者时应重新绑定）。
- **文档影响：** 本项不改文档（写入范围外）。待 32 更新：[键位文档 §4](../../../../engineering/keyboard-input.md#4-活动界面与焦点)“不自动移入输入区”改为两个入口的例外与条件、输入区的可访问名称与提示/标注/Alt+F4/全屏按钮的位置；[工程约定“键盘源与输入区”](../../../../engineering/README.md#键盘源与输入区)“当前构建没有游戏输入区”；[ui 模块说明](../../../../engineering/modules/ui.md)列出新增文件。
