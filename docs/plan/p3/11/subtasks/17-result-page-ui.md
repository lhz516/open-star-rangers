---
type: plan
status: active
phase: P3
task: "11"
subtask: "17"
updated: 2026-10-23
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
- `src/app/composition/use-mission-owner.ts`、`src/app/MissionScreen.tsx`：从任务所有者绑定的同一资源包取得结果页文字（AC-09）。
- `src/app/app.css`：结果页在 4:3 视图中的样式。

## 验收标准

- [x] 占位 G-02/5 至 G-02/9 带标注；结果页显示 spec 规定的全部信息与披露，不硬编码原版文字，不执行 HTML。（AC-12 页面部分、S-10）
- [x] 桥接即时发布关键事实；内容引用绑定同一包，各错误情形分别处理。（AC-09）
- [x] `MISSION_OBJECTIVES` 已复核；G 文案集中在 `SLICE_GAPS` 所在文件。（AC-16 文案部分）
- [x] `pnpm exec vitest run src/ui src/app`、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- 合成内容的桥接与解析测试；页面逻辑测试。
- 按 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 清理本项范围。

## 完成证据

2026-10-23（worker 17，基于 58207396）：

- **占位（G-02/5 至 G-02/9）：** [PlaceholderPage.tsx](../../../../../src/ui/mission/PlaceholderPage.tsx) 接受所有者的 `endingPlaceholder`（`data-gap` 为 G-02/7、G-02/8、G-02/9），标题与变体文字移入 [slice-gaps-copy.ts](../../../../../src/ui/mission/slice-gaps-copy.ts) 的 `PLACEHOLDER_PAGES`/`endingVariant`（G-02/7 的被毁/能量变体，结算失败取被毁过场变体并注明“没有损失”；G-02/8 solo/wingman；G-02/9 行号），终局项显示“第 i 项，共 n 项，之后是结果页”。沿用 3,000 ms 与按钮/新的 Enter、Space、Esc；焦点按 [page-keys.ts](../../../../../src/ui/mission/page-keys.ts) 的 `placement`：终局占位在可见页面总是聚焦跳过按钮、隐藏页面不移焦点，运行中保持维持原规则。G-02/5、G-02/6 的文案写明一个占位代表整组媒体、跳过一次结束整组、救援船只在原版过场中、爆炸/逃生舱/信标等待仍是引擎流程。
- **结果页（G-06）：** 新增 [ResultPage.tsx](../../../../../src/ui/mission/ResultPage.tsx) 与 DOM-free 的 [result-page.ts](../../../../../src/ui/mission/result-page.ts)。[MissionPage.tsx](../../../../../src/ui/mission/MissionPage.tsx) 在 `ending` 显示终局占位，在 `result` 显示结果页；结果页经桥接写入 store 的会话冻结 `status.result` 读取，不读 Core。显示成功/失败（文字加 ✓/✗，不只靠颜色）、规则原因（全清、两种第三次损失、结算失败）、已用救援次数与击杀合计（标注为本次尝试的项目摘要）、总结（文本节点；空总结、无匹配、失败无总结、各解析错误分别显示；有总结或空总结时注明原版在下一关出发前显示）；披露 G-06 与 G-02/10。重试为 `owner.restart()`（清理失败后禁用），返回经 `onReturn`。结果、原因与总结位于 `.mission-view` 4:3 区域内（[app.css](../../../../../src/app/app.css) 的 `.result-page` 在框内滚动、总结 `pre-wrap`）；挂载时可见页面焦点移到结果标题，隐藏页面不移焦点。项目文字全部在 `RESULT_PAGE`（`SLICE_GAPS` 所在文件），无原版文字；总结文字只在运行时从导入内容解析。
- **桥接（AC-09）：** [game-session-bridge.ts](../../../../../src/ui/game/game-session-bridge.ts) 的 `#sync` 加入 `completed`：完成的运行保持附着，投影不再被清空，退出时才分离。`KeyFacts` 增加 `missionPhase`、结果的 `reason`/`loss` 与总结引用的 `summaryMission`/`summaryTrigger`/`summaryRange`（按标量字段比较），`outcome` 改为 `ResultProjection` 的类型。测试（[game-session-bridge.test.ts](../../../../../src/ui/game/game-session-bridge.test.ts)）：`mission.phase` 变化即时发布；只改原因或总结引用即时发布、副本不发布；真实合成成功运行在 tick 647 完成后 store 保持完成 tick 的投影（`mission.phase` 为 `completed`、`result` 为冻结结果），终局项结束后仍保持，exit 后清空。去掉 `completed` 分支时该测试失败（已核验）。
- **内容装配（AC-09）：** 新增 [mission-texts.ts](../../../../../src/app/resources/mission-texts.ts)：从所有者绑定的那一代资源包的 logic 组延迟、只解码一次任务 Asset 与 `data/flight-messages`（[mission-input.ts](../../../../../src/app/resources/mission-input.ts) 新增 `flightMessagesInput`，供 P3-13 的消息行）；总结引用须与包内任务 Asset ID 相同（否则 `mission-mismatch`），`trigger`/`range` 须为表内整数（否则 `out-of-range`），解码失败为 `content`，空消息列表为合法空总结，`null` 为无总结；拼接按数组次序、无分隔符。[use-mission-owner.ts](../../../../../src/app/composition/use-mission-owner.ts) 在 `ui` 消费者的 `connect` 中（所有者构造期间同步调用，即它刚核对过的持有包）取得 logic 组，[MissionScreen.tsx](../../../../../src/app/MissionScreen.tsx) 传给页面；不进入 Core、快照或录制。测试：[mission-texts.test.ts](../../../../../src/app/resources/mission-texts.test.ts)（合成 logic 组：多消息无分隔拼接含 0xE9/0x01 码位、空总结与无总结、错包、trigger/range 越界与非整数、损坏 payload 的路径与只解码一次、缺 Asset、flight messages 及其缺失）。
- **文案（AC-16 部分）：** `MISSION_OBJECTIVES` 已按 spec 复核：成功条件（全部敌机消灭或离开，含后续到达的编组）、5 秒结算等待（Warp 中推迟）与完成消息后 15 秒、罕见的同帧编组导致结算失败、每次尝试两次救援、等待开始后的损失既不救援也不失败、基地/僚机损失与时长不导致失败；来源标注 Confirmed（executable.md 三节，含 State-5 failure）与 Likely（B-003、B-005）。G-02/5 至 G-02/10、G-06 文案在 `SLICE_GAPS`；`MISSION_SKELETON` 不再声称“没有已实现的任务规则”。测试：[result-page.test.ts](../../../../../src/ui/mission/result-page.test.ts)、[mission-copy.test.ts](../../../../../src/ui/mission/mission-copy.test.ts)、[page-keys.test.ts](../../../../../src/ui/mission/page-keys.test.ts)。
- **检查：** `pnpm exec vitest run src/ui src/app` 68 个文件 1248 项通过；`pnpm typecheck`、`pnpm lint` 通过；`pnpm check` 354 个文件 10302 项通过并完成生产构建。回归：`OSR_E2E_DEV_PORT=5151 OSR_E2E_PREVIEW_PORT=5152 pnpm exec playwright test e2e/mission-flow.development.spec.ts e2e/mission-flow.production.spec.ts e2e/base-interaction.development.spec.ts` 13 项通过（简化前后各一次）。结果页与终局占位的浏览器端验收归 18（合成光盘的任务不能靠输入到达结束，需 18 构造短程初始数据）。
- **Rubber-duck：** 4 项全部采纳：终局占位在可见页面总是聚焦（不沿用运行中保持的“焦点已丢失”条件）；桥接按原因与总结引用的字段比较；G-02/7 结算失败的变体文字不再称“飞船被毁”；空总结也显示原版显示位置的说明。
- **Simplify：** 采纳：文字只绑定 logic 组并去掉未用的 `generation`；索引检查合并为 `at`；`texts` 改为必需并去掉不可达的“无文字”分支；焦点改为单一的 `placement`；桥接结果事实改为标量字段；总结区改为 `switch`；测试去掉类型断言链。未采纳：结果页聚焦复用 `useFocusOnMount`（它不检查可见性，修改共享 hook 超出写入范围）；所有者直接暴露绑定包（`mission-owner.ts` 超出写入范围，当前在构造期间同步取得，持有者替换前会先释放所有者）；`flightMessages` 暂无消费者（子任务要求装配，供 P3-13）。
- **文档影响：** 本项写入范围不含文档。建议 22 更新：`docs/engineering/modules/ui.md` 第 13 行（任务页面含终局占位与 G-06 结果页）与第 20 行（桥接加入 `mission.phase`、结果原因/总结字段，完成的运行保持附着）；`docs/engineering/modules/app.md`（`app/resources/` 的 `mission-texts.ts`、`flightMessagesInput`，`MissionScreenParts.texts`）；`docs/engineering/slice-gaps.md` 的 G-02/5 至 G-02/10 与 G-06 呈现。

