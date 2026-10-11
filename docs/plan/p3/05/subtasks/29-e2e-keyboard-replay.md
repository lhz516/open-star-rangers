---
type: plan
status: active
phase: P3
task: "05"
subtask: "29"
updated: 2026-10-10
---

# 29 — 键盘驱动的录制导出与 replay

**契约来源：** [spec](../spec.md) 的[验证策略](../spec.md#验证策略)“Replay/一致性”、[离散命令与重复](../spec.md#离散命令与重复)、[持久化与兼容](../spec.md#持久化与兼容)；S-05、S-06 的浏览器部分；AC-17，以及 AC-06（按住 `=` 的录制序列）与 AC-07（浏览器导出）的浏览器部分。
**依赖：** 25。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md) 扩展 [mission-flow.development.spec.ts](../../../../../e2e/mission-flow.development.spec.ts)：用真实键盘事件驱动一次开发运行——操纵、Alt 短按与按住、Space、速度键与 Shift+数字档位、按住 `=` 的重复、暂停/失焦/上下文边界——再经开发诊断真实下载导出 JSON。
- 在 Node 中以同一合成内容与版本对导出文件执行 `replayRecord`/`compareReplayResults`，事件流与每个检查点相同；录制中的版本为 16 递增后的值。
- 按住 `=` 的录制序列满足 AC-06：首次立即、起点 +32 前无重复、之后按观察值 +16，帧后入队只在后续 tick 消费。
- 扩展 [browser-replay.spec.ts](../../../../../e2e/browser-replay.spec.ts)：键盘产生的录制在浏览器中重放核对；旧版本录制在执行前被拒绝。
- 不宣称跨引擎逐位保证；确定性只针对已记录的逐 tick 输入。

## 不包含

- 其他浏览器行为（28）；实机（30、31）。

## 关键文件与契约

- [mission-flow.development.spec.ts](../../../../../e2e/mission-flow.development.spec.ts)、[browser-replay.spec.ts](../../../../../e2e/browser-replay.spec.ts)、[mission-observations.ts](../../../../../e2e/support/mission-observations.ts)；[replay.ts](../../../../../src/core/replay/replay.ts)、[compare.ts](../../../../../src/core/replay/compare.ts)、[recording-export.ts](../../../../../src/ui/dev/recording-export.ts)。

## 写入范围

- `e2e/mission-flow.development.spec.ts`、`e2e/browser-replay.spec.ts`
- `e2e/support/mission-observations.ts`
- 协调者扩展（2026-10-10）：`src/ui/mission/InputNotices.tsx`、`src/ui/mission/input-notices.test.ts`、`src/app/app.css`、`e2e/keyboard-input.spec.ts`、`e2e/mission-flow.production.spec.ts`、`e2e/joint-resources.spec.ts`。原因：开发流程的鼠标点击 Pause/Mission menu 失效，诊断为按下按钮时输入区失焦、焦点提示插入按钮上方使布局下移、松开落在别处；须修复提示的布局占位（不改变 spec 的提示文案与条件），并把 28 为绕开此问题改用键盘的生产与资源用例恢复鼠标点击覆盖（保留键盘覆盖处可并存）。与运行中的 34 不重叠。

## 验收标准

- [ ] AC-17：键盘驱动的开发运行真实导出 JSON，Node 重放的事件流与全部检查点一致；浏览器重放核对通过。
- [ ] AC-06 的录制序列与 AC-07 的导出（含 `speed-preset` 与新版本、旧版本拒绝）有断言。
- [ ] `pnpm test:e2e e2e/mission-flow.development.spec.ts --project=development` 与 `pnpm test:e2e e2e/browser-replay.spec.ts --project=development --project=production` 通过；`pnpm check` 通过。

## 验证方法

- 记录导出文件的路径（测试临时目录）、tick 数、命令数与比较结果。

## 完成证据
