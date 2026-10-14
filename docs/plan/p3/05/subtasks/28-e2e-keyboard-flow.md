---
type: plan
status: active
phase: P3
task: "05"
subtask: "28"
updated: 2026-10-10
---

# 28 — 键盘输入的浏览器验证

**契约来源：** [spec](../spec.md) 的[验证策略](../spec.md#验证策略)“浏览器验证”；S-02 至 S-05、S-07 至 S-10、S-12 至 S-14 的浏览器部分；AC-03、AC-04、AC-05、AC-08、AC-09、AC-10、AC-11、AC-13、AC-14、AC-15、AC-16 的浏览器部分。
**依赖：** 25。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md)，以合成任务包（[P3-04 合成任务包](../../04/spec.md#合成任务包)）在本机 Chrome 的 development 与 production 项目中验证（只在一个项目中可行的用例按文件名后缀归属）：

- **输入区与焦点（AC-10）：** 只有一个有效输入区；进入飞行与 Continue 后在可见、有焦点且未被另行聚焦时聚焦；隐藏期间衔接不抢焦点；菜单往返与 StrictMode 后不残留旧 DOM 监听；Tab 可离开；未聚焦提示。
- **动作族（AC-03、AC-04、AC-05）：** 读取逐 tick 输入（开发诊断或录制）：操纵键的正负轴、相反键归零、Ctrl 横滚、Shift/Alt 并用；已集成 P3-06 后的有效轴回归；Alt 短按/按住、双 Alt；Space；每个动作族至少一例，区分 `not-implemented` 结果与真实已接入的效果；满队列错误可见。
- **标注与拦截（AC-08、AC-11）：** G-08/G-09/G-10 标注出现、不提交命令、不抢焦点、不暂停；`ArrowUp`/F1 为前视；`defaultPrevented`、滚动与导航断言覆盖有效绑定、G 项、Alt 组合、未绑定 Ctrl 组合、Tab、F12、Meta、Escape（只证明页面层）。
- **会话控制（AC-09）：** `p` 在 running/paused 切换、hidden 未解除时继续失败仍暂停、菜单/占位/停止不旁路；未锁指针的 Esc 打开菜单。
- **清键（AC-13）：** 真实 blur/focusout、hidden 与运行切换后不复活旧意图或重复，需新按下；合成 pagehide 单独标注。
- **全屏与提示（AC-14、AC-15）：** 开始手势发起全屏；锁键只在全屏+running+合格输入区启用，菜单/暂停/失焦解锁；测试入口模拟的权限缺失、pending、全屏失败、仅锁键失败均显示真实状态并可继续；不误退他人的全屏；平台覆盖下 Windows/Linux/未知首次非全屏飞行显示一次提示（含先全屏后退出），macOS 不显示。
- **资源（AC-16）：** 重开、返回主菜单、StrictMode 与 Fast Refresh 后 `keyboard` 与新增的全屏/Pointer Lock 监听分组回到基线，含请求未结时离页；扩展 [joint-resources.spec.ts](../../../../../e2e/joint-resources.spec.ts) 与 [fast-refresh.spec.ts](../../../../../e2e/fast-refresh.spec.ts)。

合成按键只证明页面逻辑，不证明浏览器或系统快捷键被拦截。

## 不包含

- 键盘驱动录制与 replay（29）；地图入口（27）；本机实机（30、31）。

## 关键文件与契约

- [mission-observations.ts](../../../../../e2e/support/mission-observations.ts)、[browser-probes.ts](../../../../../e2e/support/browser-probes.ts)、[resource-balance.ts](../../../../../e2e/support/resource-balance.ts)、[joint-resources.spec.ts](../../../../../e2e/joint-resources.spec.ts)、[fast-refresh.spec.ts](../../../../../e2e/fast-refresh.spec.ts)、[mission-flow.production.spec.ts](../../../../../e2e/mission-flow.production.spec.ts)、[playwright.config.ts](../../../../../playwright.config.ts)。
- 计划新增：`e2e/keyboard-input.spec.ts`（及必要的 `.development`/`.production` 变体）、`e2e/support/keyboard-input.ts`。

## 写入范围

- `e2e/keyboard-input.spec.ts`、`e2e/keyboard-input.development.spec.ts`、`e2e/keyboard-input.production.spec.ts`、`e2e/support/keyboard-input.ts`
- `e2e/support/mission-observations.ts`、`e2e/support/browser-probes.ts`
- `e2e/joint-resources.spec.ts`、`e2e/fast-refresh.spec.ts`、`e2e/mission-flow.production.spec.ts`
- `playwright.config.ts`、`tools/e2e-configuration.test.ts`

## 验收标准

- [x] 上列 AC 的浏览器部分均有通过的断言，命令与项目已记录。
- [x] 资源平衡与 Fast Refresh 回到基线，新监听分组有归属。
- [x] `pnpm test:e2e e2e/keyboard-input.spec.ts --project=development --project=production` 与受影响的既有用例通过；`pnpm check` 通过。

## 验证方法

- 列出每个 AC 对应的用例名与结果；失败时按 browser-testing 的排查方法记录并修复本任务范围内的问题。

## 完成证据

- **AC-03/04/05：** development 用例 `records opposing axes, Ctrl roll, simultaneous Shift and Alt fire, Space fire and the front-view command per tick` 通过；逐 tick 录制断言覆盖俯仰正负/抵消、Ctrl 横滚、Shift+Alt、副炮、短按与双 Alt 主炮、ArrowUp/F1 前视命令及 `not-implemented` 结果。队列满错误由 `the queue-full error is visible, leaves focus in the game zone and does not pause the run` 覆盖。
- **AC-08/11/10：** `the focused input zone owns page-level bindings, slice-gap notices, pause and menu controls` 在 development 与 production 通过；覆盖唯一且聚焦的输入区、Tab 离开与未聚焦提示、Continue/返回后的焦点、G-08/G-09/G-10、Alt/未绑定 Ctrl、Tab/F12/Meta/Escape 的页面层拦截及焦点保持。
- **AC-09/13：** development 用例 `a real focusout clears held input and resume does not revive it without a new press` 与 `a real hidden then visible transition clears held input and stays paused until explicit resume` 通过；native headed Chrome/CDP 确认真实 hidden/visible 事件、自动暂停、恢复后不自动续跑，显式 `p` 才恢复。production `the whole production flow from a restored cache, with and without a wingman: placeholders, departure at tick 0, pause, menu, restart and return` 通过。
- **AC-14/15：** development 的 fullscreen pending/failure、Keyboard Lock failure/pending、`starting while another fullscreen is active does not claim or exit it` 及 Windows/Linux/other/mac Alt+F4 提示用例均通过。
- **AC-16：** `three menu → mission → menu round trips with a restart each release the owner's listeners, timers, leave guard and frames` 在两个项目通过；development 的五个 Fast Refresh 用例通过。新 `keyboard`、`fullscreen`、`pointer-lock` 监听分组在 round-trip、重开、刷新与离页后归属正确并回到基线。
- **验证命令：** `pnpm test:e2e e2e/keyboard-input.spec.ts --project=development --project=production`（2 passed）；`OSR_E2E_DEV_PORT=5241 OSR_E2E_PREVIEW_PORT=5242 pnpm test:e2e e2e/keyboard-input.spec.ts e2e/keyboard-input.development.spec.ts e2e/joint-resources.spec.ts e2e/fast-refresh.spec.ts e2e/mission-flow.production.spec.ts --project=development --project=production`（23 passed）；`pnpm check`（typecheck、lint、242 test files / 7301 tests、build 均通过）。
- **Review 与清理：** rubber-duck 提出的“缺少 production 专用文件”不适用：共享 spec 在 development 与 production 均执行；AltGraph 覆盖疑虑由事件记录的 `getModifierState('AltGraph')` 断言验证并通过。simplify 的 recording parser、能力断言、目标焦点导航与合成输入缓存重复已提取/复用；`interaction-render.spec.ts` 原有局部 `tabTo` 因不在本子任务写入范围内未改。
- **文档影响：** 仅更新本子任务证据；工程约定、运行手册、架构决策、原版事实及项目状态均未改变，无需更新其他文档。
