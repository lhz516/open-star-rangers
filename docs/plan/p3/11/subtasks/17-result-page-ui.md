---
type: plan
status: active
phase: P3
task: "11"
subtask: "17"
updated: 2026-10-17
---

# 17 — 结果页、占位与文案

**契约来源：** [spec](../spec.md) 的 S-09、S-10、AC-09（桥接与内容解析）、AC-12 的页面部分、AC-16 的文案部分；[结果页、重试与返回](../spec.md#结果页重试与返回)、[勋章、统计与战役进度](../spec.md#勋章统计与战役进度)、[缺省与标注](../spec.md#缺省与标注)。
**依赖：** 16。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **占位：** [PlaceholderPage.tsx](../../../../../src/ui/mission/PlaceholderPage.tsx) 支持 G-02/5 至 G-02/9（`data-gap`），沿用 3,000 ms 与按钮/新的 Enter、Space、Esc；标注救援船只在原版过场中、一个 G 实例代表整组媒体。
- **结果页（G-06，计划新增 `src/ui/mission/ResultPage.tsx`）：** 经 [game-session-bridge.ts](../../../../../src/ui/game/game-session-bridge.ts) 读冻结的 `result`；显示成功/失败、规则原因的项目文字、已用救援次数与击杀合计（标注为项目摘要）、成功时的任务总结（从同一资源包解析区间消息，按文本节点渲染，标注原版显示位置）；无总结、空总结、损坏/错包分别处理；披露代替统计页、提示页、高分榜、晋升，以及 P3 不判定勋章。重试与返回按钮；4:3 区域、进入时焦点到标题、键盘可用、状态不只靠颜色、隐藏时不抢焦点。
- **桥接：** 关键事实（`mission` 阶段、`result` 终态、原因、总结引用）在帧尾即时发布，按具体字段比较。
- **内容装配：** 资源包中的段 2 消息与 `FlightMessages` 在 app 层装配给 UI（计划在 `src/app/resources/` 新增或扩展读取函数），不进入 Core 快照或录制。
- **文案：** [slice-gaps-copy.ts](../../../../../src/ui/mission/slice-gaps-copy.ts) 的 G-02/5 至 G-02/10 与 G-06 文案；复核 `MISSION_OBJECTIVES`（成功条件、结算等待、两次救援、结算等待中的损失不计，标注置信度）。
- 测试：桥接与内容解析的合成测试，页面纯逻辑测试。

## 不包含

- 浏览器端到端（18）；消息行与被毁视角绘制（P3-13、P3-12）。

## 关键文件与契约

- [MissionPage.tsx](../../../../../src/ui/mission/MissionPage.tsx)、[MissionShell.tsx](../../../../../src/ui/mission/MissionShell.tsx)、[mission-copy.ts](../../../../../src/ui/mission/mission-copy.ts)、[game-store.ts](../../../../../src/ui/game/game-store.ts)、[mission-input.ts](../../../../../src/app/resources/mission-input.ts)。

## 写入范围

- `src/ui/mission/**`：占位、结果页、文案与测试。
- `src/ui/game/**`：桥接与 store 及测试。
- `src/app/resources/**`：总结与消息内容的装配及测试。

## 验收标准

- [ ] 占位 G-02/5 至 G-02/9 带标注；结果页显示 spec 规定的全部信息与披露，不硬编码原版文字，不执行 HTML。（AC-12 页面部分、S-10）
- [ ] 桥接即时发布关键事实；内容引用绑定同一包，各错误情形分别处理。（AC-09）
- [ ] `MISSION_OBJECTIVES` 已复核；G 文案集中在 `SLICE_GAPS` 所在文件。（AC-16 文案部分）
- [ ] `pnpm exec vitest run src/ui src/app`、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- 合成内容的桥接与解析测试；页面逻辑测试。
- 按 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 清理本项范围。

## 完成证据
