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

- [x] AC-17：键盘驱动的开发运行真实导出 JSON，Node 重放的事件流与全部检查点一致；浏览器重放核对通过。
- [x] AC-06 的录制序列与 AC-07 的导出（含 `speed-preset` 与新版本、旧版本拒绝）有断言。
- [x] `pnpm test:e2e e2e/mission-flow.development.spec.ts --project=development` 与 `pnpm test:e2e e2e/browser-replay.spec.ts --project=development --project=production` 通过；`pnpm check` 通过。

## 验证方法

- 记录导出文件的路径（测试临时目录）、tick 数、命令数与比较结果。

## 完成证据

- **AC-17：** `OSR_E2E_DEV_PORT=5271 OSR_E2E_PREVIEW_PORT=5272 pnpm test:e2e e2e/mission-flow.development.spec.ts --project=development --grep 'exports a keyboard-driven recording'` 通过；固定 seed `0x0eed0020` 的真实下载以 Node 重放，完整事件与检查点比较通过。测试附件记录导出文件、tick/命令数量、比较结果及版本拒绝结果。`OSR_E2E_DEV_PORT=5271 OSR_E2E_PREVIEW_PORT=5272 pnpm test:e2e e2e/browser-replay.spec.ts --project=development --project=production` 通过 development 浏览器重放核对；该项目配置未选择 production 用例。
- **AC-06/AC-07：** 导出录制断言新 replay/rules 版本、`speed-preset`、`=` 首次命令在按键后消费、首个重复不早于 32 个时钟单位，以及后续重复不早于 16 个时钟单位；`input-consumer.test.ts` 精确验证观察时钟 +16 与帧后入队只在后续 tick 消费。另验证多个增速命令及旧 replay/rules 版本在载入内容前被拒绝。
- **真实鼠标回归：** 修复前开发流程复现点击 Pause 与第二次 Mission menu 失效；保持提示行布局槽位后，development mission flow 全部 7 项通过；production mission flow 与 `keyboard-input.spec.ts` 通过，`joint-resources.spec.ts` 在 development/production 的三轮释放检查通过。按钮交互恢复鼠标点击，键盘控制另由 `keyboard-input.spec.ts` 覆盖。
- **通用检查：** `pnpm check` 通过（typecheck、lint、243 个测试文件 / 7305 个测试、production build）；`git diff --check` 通过。Build 仍报告既存的大 chunk 警告。
- **审查与文档影响：** rubber-duck 对最终差异未发现行为问题；此前指出的未释放 Backquote 已补 keyup。simplify 将最后 yaw 样本扫描改为 `findLastIndex`，并在最终审查中统一改用 `waitForFrame`、复用已核对的导出 ticks、并行运行互相独立的版本拒绝检查。避免二次读取导出文件的建议未采用，因为所需共享 helper 变更超出本子任务写入范围。焦点提示使用固定布局槽、仅视觉隐藏且在隐藏时 `aria-hidden`。本任务不改变接口或操作流程，除本子任务验收证据外无须更新维护文档。
