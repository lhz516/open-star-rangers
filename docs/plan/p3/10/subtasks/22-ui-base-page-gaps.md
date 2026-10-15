---
type: plan
status: active
phase: P3
task: "10"
subtask: "22"
updated: 2026-10-14
---

# 22 — G-02/3、G-02/4 占位、G-05 基地页面与 G-03 文字

**契约来源：** [spec](../spec.md) 的 S-10、S-12（slice-gaps）、AC-14 的界面部分；[缺省与标注](../spec.md#缺省与标注)。
**依赖：** 19, 21。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 入港、离港占位复用 [PlaceholderPage.tsx](../../../../../src/ui/mission/PlaceholderPage.tsx) 与既有计时（`data-gap="G-02/3"`、`"G-02/4"`），按 21 的凭证结束一次。
- G-05：任务壳唯一游戏输入区内的 React 基地页面，经 projection → Zustand 桥接按 10–20 Hz 采样、重要变化立即发布；显示服务项身份（项目名称按选择值与 D6 的置信度，未知槽位写编号）、状态（非仅颜色）、当前选择、服务顺序与进度、资源与弹药；写明基地按键并区分已接入与后续门禁；沿用 `GameInputZone` 与 `GameCommandFeedback.submit`，一次按键只提交一次；保持 4:3；焦点、Tab 离区、失焦清键与恢复按 spec；故障与提交失败用现有结构化反馈。
- G-03：消息身份到项目摘要文字的常量（区分不同回复、拒绝与状态），集中在 [slice-gaps-copy.ts](../../../../../src/ui/mission/slice-gaps-copy.ts)；P3-13 经应用装配取得。
- 更新 [切片缺省清单](../../../../engineering/slice-gaps.md)：G-02/3、G-02/4、G-03、G-05 的呈现、位置，以及 G-02 不计时对运行中衔接的适用。

## 不包含

- 驾驶舱中的菜单与来电绘制（P3-13）；浏览器回归（23）。

## 关键文件与契约

- [MissionPage.tsx](../../../../../src/ui/mission/MissionPage.tsx)、[MissionShell.tsx](../../../../../src/ui/mission/MissionShell.tsx)、[GameInputZone.tsx](../../../../../src/ui/mission/GameInputZone.tsx)、[use-input-focus.ts](../../../../../src/ui/mission/use-input-focus.ts)、[slice-gaps-copy.ts](../../../../../src/ui/mission/slice-gaps-copy.ts)、[input-notices.ts](../../../../../src/ui/mission/input-notices.ts)。
- 计划新增：`src/ui/mission/BasePage.tsx` 与其文案/逻辑的相邻测试。

## 写入范围

- `src/ui/mission/**`：占位、基地页面、文案与测试。
- `src/ui/game/**`：桥接（如需要）。
- `src/ui/game-input/**`：焦点与基地上下文的输入区（如需要）。
- `docs/engineering/slice-gaps.md`：G 项记录。
- `src/app/app.css`：基地页面的项目样式（新增 `.base-page*` 规则）。

## 验收标准

- [ ] 占位与 G-05 页面的标注可见，文字各集中一处并以 G ID 标识；`slice-gaps.md` 已更新。
- [ ] 基地页面只读 projection、一次按键一次提交、4:3、焦点与清键行为正确；未知速率不伪造倒计时。
- [ ] 相邻测试、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- `pnpm exec vitest run` 跑本项相邻测试，再跑 `pnpm exec vitest run src/core src/app src/ui tools`；`pnpm typecheck` 与 `pnpm lint` 通过。
- 浏览器行为由 23 验证。
- 完成前按 execute-goal 做一次 rubber-duck 审查，并以本项写入范围调用 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据
