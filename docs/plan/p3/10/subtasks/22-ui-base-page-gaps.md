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
- `src/app/app.css`：基地页面的项目样式（新增 base-page 前缀的规则）。

## 验收标准

- [x] 占位与 G-05 页面的标注可见，文字各集中一处并以 G ID 标识；`slice-gaps.md` 已更新。
- [x] 基地页面只读 projection、一次按键一次提交、4:3、焦点与清键行为正确；未知速率不伪造倒计时。
- [x] 相邻测试、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- `pnpm exec vitest run` 跑本项相邻测试，再跑 `pnpm exec vitest run src/core src/app src/ui tools`；`pnpm typecheck` 与 `pnpm lint` 通过。
- 浏览器行为由 23 验证。
- 完成前按 execute-goal 做一次 rubber-duck 审查，并以本项写入范围调用 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据

2026-10-14，worker 分支 `exec-p3-10-22`（基于 8f34febd）。

- **占位（G-02/3、G-02/4）：** [MissionPage.tsx](../../../../../src/ui/mission/MissionPage.tsx) 在流程位置 `transition` 用 21 的 `snapshot.transitionPlaceholder` 渲染 [PlaceholderPage.tsx](../../../../../src/ui/mission/PlaceholderPage.tsx)（与 G-02/1、G-02/2 同一页面与计时，按占位 id 重新挂载，`owner.skip(id)` 结束一次；标题 Docking/Launch，`data-gap`、`data-transition`，同一 tick 多项时写明 “Transition i of n”）。保持的占位只在页面可见且原焦点已随飞行页消失时取得焦点（[page-keys.ts](../../../../../src/ui/mission/page-keys.ts) 的 `placeholderTakesFocus`），流程自身的占位行为不变；`inputFocusEntry` 增加 `transition → flight` 的 `transition-ended`，最后一项结束后按 `shellFocusTarget` 回到输入区或标题。
- **截断帧：** [input-consumer.ts](../../../../../src/ui/game-input/input-consumer.ts) 把 `report.cut === 'transition'` 的帧视为不在运行：不向屏障提交重复，清除按住键，保持后只有新的按下生效。[input-consumer-transition.test.ts](../../../../../src/ui/game-input/input-consumer-transition.test.ts) 用 21 的注入在重复到期的 tick 截断：修复前提交了第二条并被拒绝（测试失败），修复后通过。
- **G-05：** [BasePage.tsx](../../../../../src/ui/mission/BasePage.tsx) 位于任务壳唯一输入区内（`MissionShell` 的 `GameView` 只订阅标量 `selectBaseShown`），读模型在 [base-page.ts](../../../../../src/ui/mission/base-page.ts)：按 projection 的同一次序列行（BS5），名称按选择值与 D6 的高概率含义、未知子系统写编号；状态为文字；首行需要服务时为 “Being serviced”，其余行不标（首行无需服务时服务步不越过它，BS6）；光标行文字 “Selected” 与 `aria-current`；三个完成标志；能量、船体与所选导弹弹药；无倒计时。按键说明区分已接入的上下、Enter、`L`，项目控制 `P`、Esc（G-07），与等待 P3-09 的 `M`。页面不绑定按键；最近一条基地命令结果与提交失败只取本页打开之后的（命令类型集取自绑定表的 `base` 上下文），复用 `GameCommandFeedback` 的结构化结果与 `actionError`。桥接 [game-session-bridge.ts](../../../../../src/ui/game/game-session-bridge.ts) 的帧末关键事实加入基地光标与行序（`projectedBase` 在 [game-store.ts](../../../../../src/ui/game/game-store.ts)），其余读数按 10 Hz 采样。[app.css](../../../../../src/app/app.css) 让 `.mission-view` 保持 4:3（`overflow: hidden`、`minmax(0, 1fr)` 网格），输入区内滚动，并加入 `.base-page*` 样式。
- **G-03：** [slice-gaps-copy.ts](../../../../../src/ui/mission/slice-gaps-copy.ts) 的 `MESSAGE_SUMMARIES`、`messageSummaryKind`、`messageSummary` 按（表、序号）区分停靠回复、基地/友机两种状态回复、基地发现敌机、感谢、友方受攻击及后续呼叫、友方被毁、玩家误伤/击毁友方、僚机丢失与僚机报告（RQ1、RX1–RX3 的偏移与名单数 20、19）；没有拒绝或取消的文字（D-01 ⑤）；20985 中 P3-08 的台词为未识别，5–6 注明也可能是另一类台词。页面上不显示（P3-13 绘制）。
- **文案与文档：** `SLICE_GAPS` 新增 G-02/3、G-02/4、G-03、G-05；`BASE_PAGE`（`gap: 'G-05'`）集中基地页面全部文字。[slice-gaps.md](../../../../engineering/slice-gaps.md) 增加四行、页面与代码位置，以及“G-02 不计时”对运行中衔接的适用与基准差异（LANDING、LAUNCH 的用时）。为不改变 P3-04 E2E 的缺省说明集合，任务壳与开始页的 “Missing from this build” 列表未加入新项。
- **测试：** [base-page.test.ts](../../../../../src/ui/mission/base-page.test.ts)（行状态、名称、读数、反馈起点、键说明、消息摘要分类与 G 文字）、[game-session-bridge.test.ts](../../../../../src/ui/game/game-session-bridge.test.ts)（光标/行序立即发布，状态变化仍采样）、`page-keys.test.ts`、`input-notices.test.ts`、`mission-copy.test.ts`。
- **检查：** `pnpm typecheck`、`pnpm lint` 通过；`pnpm exec vitest run --testTimeout=60000` 303 个文件、8943 项通过；`pnpm build` 通过；`pnpm check:compliance` passed；`pnpm test:e2e`（端口 5166/5167）的 `mission-flow.development`、`mission-flow.production`、`keyboard-input.development`、`keyboard-input`、`interaction-render` 共 27 项通过。浏览器中的基地页面、4:3 布局与焦点由 23 验证。
- **rubber-duck：** 无阻塞问题。采纳三项：后续行不再标 “Waiting”（首行无需服务时不会轮到它们）；基地反馈只取页面打开之后的结果与失败（Enter 的速度匹配与飞行中的 M 同类型）；列名、是/否与占位符移入 `BASE_PAGE`。
- **simplify：** 采纳：`projectedBase` 合并三处读取；`serviceItemName` 只返回名称；行状态改为布尔 `inService`；`MissionPage` 合并两个占位分支；`MissionShell` 的 `game` 改为必需；命令类型集由绑定表导出。未采纳：删除 G-03 摘要（本项必需交付）；所有占位统一焦点策略（会改变 P3-04 行为）；在 store 记录交互上下文（反馈起点已足够）；降低 10 Hz 重渲染（总计划的采样频率）。
- **文档影响：** 已更新 `slice-gaps.md`。`docs/engineering/modules/ui.md` 的任务页面、桥接关键事实与基地页面说明归 27 的写入范围，建议 27 补记；STATUS 与阶段索引无需更改。

