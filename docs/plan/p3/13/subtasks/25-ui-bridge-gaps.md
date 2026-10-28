---
type: plan
status: active
phase: P3
task: "13"
subtask: "25"
updated: 2026-10-28
---

# 25 — 基地消息桥接与缺省标注

**契约来源：** [spec](../spec.md#缺省与标注) 的 S-12，AC-11/13/20。
**依赖：** 18, 24。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 将18的同一当前来电/消息快照接入基地项目页，队首变化立即发布，其他保持既有React采样；不创建第二队列。
- 完成G-03摘要映射与注入文案，页5短标注、完整消息正文以及未知映射生产反馈。
- 保留游戏输入区、焦点、暂停/退出控制、结构化错误；往返基地/地图不重播。
- 只移除已完成驾驶舱/HUD/地图在制文案；未完成P3-14的音效说明不得顺手删除。

## 不包含

不重做G-05美术、菜单/结果页，不导入CMOV台词或改变radio规则。

## 关键文件与契约

- [BasePage.tsx](../../../../../src/ui/mission/BasePage.tsx)、[MissionShell.tsx](../../../../../src/ui/mission/MissionShell.tsx)、[slice-gaps-copy.ts](../../../../../src/ui/mission/slice-gaps-copy.ts)。
- [game-store.ts](../../../../../src/ui/game/game-store.ts)、[game-session-bridge.ts](../../../../../src/ui/game/game-session-bridge.ts)。

## 写入范围

- `src/ui/mission/*.ts`：文案/视图模型与相关测试。
- `src/ui/mission/*.tsx`：基地/任务壳呈现与反馈。
- `src/ui/game/game-store.ts`：当前消息只读状态。
- `src/ui/game/game-store.test.ts`：状态与发布测试。
- `src/ui/game/game-session-bridge.ts`：共享模型桥接。
- `src/ui/game/game-session-bridge.test.ts`：身份/生命周期测试。
- `src/app/composition/use-mission-owner.ts`：注入文案与桥接订阅。
- `docs/engineering/slice-gaps.md`：G-03/G-05与在制标注。
- `docs/engineering/modules/ui.md`：新读者/错误说明。
- `src/app/composition/cockpit-copy.ts`：24 留下的临时文案注入点，替换为 25 的正式文案（协调者增补）。
- `src/app/mission/cockpit-content.test.ts`：仅删除临时文案的断言块（25 的范围请求，协调者批准）。
- `src/ui/dev/*.ts`、`src/ui/dev/*.tsx`：仅在开发面板显示驾驶舱诊断计数（`messageDrops`、`radarNoiseDropped`，协调者增补）。

## 验收标准

- [x] 基地能显示完整项目正文，MFD标注不冒充原版台词。
- [x] 共享队列只有一份，跨视角/重挂/恢复无重复，未知映射可见。
- [x] 原有输入与焦点不回归，文案准确保留剩余缺省。

## 验证方法

`pnpm test -- src/ui/game src/ui/mission src/app/mission`、`pnpm check`；[browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md) 的正式像素/DOM回归由27–29完成；[simplify](../../../../../.agents/skills/simplify/SKILL.md) 限桥接和标注。

## 完成证据

2026-10-28，worker 分支 `exec/p3-13-25`（基线 `5d511108`）。未启动 DOSBox-X；Ghidra 只在私有副本上只读运行（副本已删除）。

**G-03 文案定稿（[slice-gaps-copy.ts](../../../../../src/ui/mission/slice-gaps-copy.ts)）。** `MESSAGE_SUMMARIES` 现为 `text`（29 种摘要）、`label`（每种的页 5 标注）与 `uncovered`（未覆盖反馈）；`messageSummaryKind` 未覆盖时返回 null（原 `unidentified` 种类取消），新增 `messageSummary`/`messageLabel` 与 `MAP_COST_UNAVAILABLE`（`N/A`，标为项目提示，DC-09、Δ-06）。全部是描述规则的项目文字，不含原版台词。

- **缩短：** `docking-reply` 106 → 57、`craft-thanks` 71 → 56、`craft-status-threat` 63 → 50、`base-thanks` 61 → 46 字节；`wingman-kill-or-other`（99）取消，序号 5–7 统一为 `wingman-kill`。全部摘要 ≤ 57 字节，未覆盖摘要 50 字节。
- **补齐 DC-13 的 15 个 20985 序号**（按 [WB3–WB5](../../../../original/formats/executable.md#wb5-replies-0x38d54handle-line--confirmed-code) 与 `ai-commands.ts` 的码 → 回复线，已确认（代码））：0–2 不能执行（线 0）、3–4 确认（码 2 与未知码，线 3）、0xB/0xC/0xD 按船体 ≥ 80%、50–79%、< 50% 的状态答复（码 7）、0xE–0xF 编队（活动码 3；停放码 3、4）、0x10–0x11 攻击玩家目标（码 1）、0x12 返航或前往目的地（码 5、6 成功）、0x14 交战（码 4）、0x15 不能前往目的地（码 6 失败）。
- **序号 5–6 作“击毁”（已确认，代码；交 P3-08 的确认由静态分析取得）：** 只读私有副本中 `0x38d54` 的全部引用为 7 个 rel32 直接调用（`0x38c19`、`0x38cb8`、`0x38d2e`、`0x38f09`、`0x38fba`、`0x6155f`、`0x62128`），全映像扫描无 rel8/条件跳转/32 位指针引用；`0x38bf8`（击毁报告）在调用前有 `CMP ECX,ECX; JNZ` 选择线 5，该跳转永不成立，线 5 分支是死代码，实际只传线 7（→ 5 + rand % 3）；其余调用者传 0xA、8、0x13、名称偏移（≥ 0x16）或 WB3/WB4 的回复线。所以切片中 5–6 只来自击毁报告。与 P3-08 的 [B5 记录](../../08/subtasks/10-original-pilot-runs.md)（回复与击毁报告经 `0x38d54`）一致。建议写入 executable.md 的 RX1/RX5（见 worker 报告）。
- **页 5 标注：** 每种两行，第一行 ≤ 16 字节的主题，第二行固定为 `G-03 PROJECT`，表明是项目占位而非原版台词；未覆盖为 `NOT COVERED` / `G-03 PROJECT`。
- **注入与开始前核对：** [cockpit-copy.ts](../../../../../src/app/composition/cockpit-copy.ts) 的 `cockpitCopy()` 改为 `slice-gaps-copy.ts` 的薄适配（`summaries`、`labels` 列出全部文字），`cockpitContentOf` 在开始前用 18 的 `checkSummaryText`/`checkLabelLines` 核对；`MAP_COST_UNAVAILABLE` 由地图画面在 `beginRun` 前核对。

**基地桥接。** [game-store.ts](../../../../../src/ui/game/game-store.ts) 新增冻结的 `messages: UiMessageLine | null`（`{ runId, head, incoming }`，`clearRun` 不清）；[game-session-bridge.ts](../../../../../src/ui/game/game-session-bridge.ts) 的 `bridgeMessageLine(store, runId, line)` 在附着时写一次、之后在消息行模块发布的钩子内同步写入（队首或来电变化才写，长度/丢弃计数不写），不建第二条队列、计时器或重播；清理退订并只清本运行的 `messages`，清理后迟到的通知不写，首次读取失败时退订。[use-mission-owner.ts](../../../../../src/app/composition/use-mission-owner.ts) 在飞行消费者之后加一个 `ui` 阶段的所有者消费者，`attachRun` 取 `flight.consumer.cockpit()` 的 `messageLine` 并把清理交给 `run.ownCleanup`（会话按新到旧清理，所以先于驾驶舱释放）。[BasePage.tsx](../../../../../src/ui/mission/BasePage.tsx) 在 G-05 标注之后加 `base-messages`（G-03 标注；`base-incoming`、`base-message-line` 的 `data-origin`、`data-covered`），全文显示，标为 `from your imported data` 或 `project summary, not the original line`，未覆盖映射显示消息身份（`Not covered: table …, face …, message ….`）。

**开发面板。** `createMissionDiagnostics` 新增可选 `cockpit`，`cockpitCounts()` 在调用时读取当前运行 `CockpitRun.diagnostics()` 的 `messages`、`messageDrops`、`radarNoiseDropped`；[MissionDevPanel.tsx](../../../../../src/ui/dev/MissionDevPanel.tsx) 的 Cockpit 区块（`dev-cockpit-refresh`、`dev-cockpit-<名称>`、`dev-cockpit-none`）。

**在制标注。** 飞行区域覆盖画面底部的驾驶舱/HUD 在制提示已移除（它正压在消息行所在的驾驶舱带上）；`MISSION_SKELETON` 改为画出驾驶舱、HUD 与战略地图、仍没有音效（P3-14）；`FLIGHT_IN_PROGRESS` 只保留 P3-14 音效的在制说明，移到任务壳状态栏（`flight-in-progress`，画面之外）。G-01 与其他 G 项不变。

**验证。**

- `pnpm exec vitest run src/ui/game src/ui/mission src/ui/dev src/app/mission src/app/composition`：41 个文件 615 项通过。`pnpm check`（typecheck 含 e2e、lint、Vitest 428 个文件 11,510 项、生产构建）：退出码 0。
- 关键断言：[slice-gaps-copy.test.ts](../../../../../src/ui/mission/slice-gaps-copy.test.ts) 以生产字符映射（`PRODUCTION_GRAPHICS_DECLARATIONS`）的合成字体用 `checkSummaryText`/`checkLabelLines` 核对全部摘要、标注与未覆盖文字，负对照 `{` 与 59 字节被拒；切片可达的全部 20985 序号（0–0x15 与两段名称偏移）均有种类，0x3D 与 −1 为 null；`cockpitCopy()` 注入的正是这些文字；`MAP_COST_UNAVAILABLE` 由 fonts/1 绘制。[base-page.test.ts](../../../../../src/ui/mission/base-page.test.ts) 的逐序号映射与 `baseMessagesView`（导入/项目来源、未覆盖身份）。[game-session-bridge.test.ts](../../../../../src/ui/game/game-session-bridge.test.ts) 用真实 `createMessageLine` 与合成表现：信标在其 tick 内即写入 store（与模块队首同一对象）、来电摘要写入、只改计数的 tick 不写；未覆盖反馈与身份可见；F1 → 基地 → 地图 → 基地往返后队列仍为 2 项、store 队首始终是同一序号（无重播）；新旧运行交错时旧运行的清理与迟到通知不改新运行；首次读取失败时退订。[game-store.test.ts](../../../../../src/ui/game/game-store.test.ts)：`messages` 须冻结、只在变化时通知、`clearRun` 不清。[mission-diagnostics.test.ts](../../../../../src/ui/dev/mission-diagnostics.test.ts)：计数只在调用时读取。
- **浏览器冒烟（browser-testing，合成内容）：** 临时 Playwright 用例（已删除，副本在私有目录）在 `OSR_E2E_DEV_PORT=5175`/`OSR_E2E_PREVIEW_PORT=5176`（Playwright 自启自停，结束后 5175–5177 无监听）的开发测试入口导入合成 `mission-docking`，经真实按键 `c`、2、2 请求停靠并进入基地页，Chrome 无头：基地页 `base-message-line` 显示 “The base answers your docking request: countdown to dock. (project summary, not the original line)”（`data-origin="project"`），`m` 开图再 `m` 返回后同一文字、开发面板 Cockpit 计数 messages 1 / messageDrops 0 / radarNoiseDropped 0（无重播）；返回后焦点在游戏输入区，`p` 暂停与继续正常；`flight-in-progress` 只在状态栏、不在 `flight-view` 内；审计夹具（控制台/页面错误/网络与金丝雀）通过。截图与观察在 `local/research/p3-13/25-ui-bridge-gaps/browser/`。正式像素/DOM 回归归 27–29。
- **既有 E2E 的影响（归 27–29）：** `e2e/base-interaction.development.spec.ts:160` 断言 `mission-view` 含 `FLIGHT_IN_PROGRESS`，现在提示在状态栏（`mission-view` 之外）且文字改为音效，须改为断言 `flight-view` 可见；`e2e/support/flight-flow.ts` 的 `noteRect` 遮罩现落在画布之外（无害），注释过时；`e2e/flight-render.development.spec.ts:69` 的 `toHaveText(FLIGHT_IN_PROGRESS)` 仍成立。
- **范围外改动：** [cockpit-content.test.ts](../../../../../src/app/mission/cockpit-content.test.ts) 删除了标为“interim, until P3-13/25”的临时文案测试块（断言旧的临时 `cockpitCopy()`，替换后必然失败；其覆盖改由 `slice-gaps-copy.test.ts` 承担），见 worker 报告。
- **Rubber-duck（code-review 代理担任）：** 确认 `WINGMAN_LINES` 与 radio/ai-commands/WB3–WB5 一致、文案限值、消费者次序与清理次序、旧运行防护均正确；唯一发现即上述 `base-interaction` 第 160 行的 E2E 断言，在写入范围之外，交 27–29。
- **Simplify：** 只限本 diff：store 直接保存模块冻结的 head/incoming 对象（不再逐字段复制），`cockpitCounts()` 直接返回诊断对象；未引入新抽象。
- **文档影响：** 更新 [slice-gaps.md](../../../../engineering/slice-gaps.md)（G-03 行、G-05 行、页面清单、在制标注一节改为只剩 P3-14 音效与 `MAP_COST_UNAVAILABLE` 说明）与 [ui 模块说明](../../../../engineering/modules/ui.md)（store `messages`、`bridgeMessageLine`、G-03 文案、基地页消息区块、在制提示、开发面板与诊断）。范围外的建议见 worker 报告：app.md 的“驾驶舱文案（临时）”一条、render.md 交接中的在制提示一条、executable.md RX1/RX5 的 `0x38bf8` 死代码事实。
- **私有输出：** `local/research/p3-13/25-ui-bridge-gaps/`（`check.log`、`browser-run.log`、`browser/`、Ghidra 日志与脚本、调用者/分支扫描结果——反编译输出只在此处）。
