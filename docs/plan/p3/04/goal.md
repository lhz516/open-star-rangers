---
type: plan
status: accepted
phase: P3
task: "04"
updated: 2026-10-10
related: [ADR-0004, ADR-0006, ADR-0015, ADR-0017, B-001, B-003, B-005, U-010, U-021, U-031]
---

# P3-04：正式 Runtime、游戏会话与应用流程 — Goal

## 目标与来源

实现用户于 2026-10-09 批准的 [spec](./spec.md) 中的 S-01 至 S-12 与 AC-01 至 AC-22：

- 正式 Runtime（固定步长、意图与按住开火、有界命令队列与每 tick 批次、帧后事件、同 tick 读模型、失败帧与录制容量）与正式 Session（运行规格、初始出发保持、停止、清输入、P1-05 的通知边界与清理语义）；
- DOM-free 的任务流程与任务所有者（开始资格、开始配置、G-02/1 与 G-02/2 占位计时、内容代际、重开与返回、两级所有权、离页保护、清理锁存），及其平台端口；
- 正式 projection → Zustand 桥接与命令反馈；开发诊断与录制导出；Node 重放核对工具；
- React 页面与应用接线、缺省标注；合成任务包；
- P1 合成演示退役（源码、lint 规则、E2E 迁移、文档与历史链接）；
- 真实内容的本地核对，R-13 控制子集与 L 流程部分的对照记录，工程文档与 `slice-gaps.md`。

本文件不重新定义行为契约。原版键位（P3-05）、规则系统（P3-06 至 P3-11）、运行中衔接（P3-10、P3-11）、飞行画面与 HUD（P3-12、P3-13）、音效（P3-14）不在本 goal 中实现。

## 代码现状与前提

- **正式 Core（只消费、不改契约）：** [create-world.ts](../../../../src/core/world/create-world.ts) 的 `CreateWorldInput`/`createWorld`，[world.ts](../../../../src/core/world/world.ts) 的 `World`（故障锁存到所有后续读取），[recording.ts](../../../../src/core/replay/recording.ts) 的 `createRecordingSession`/`RecordingOptions`/`Recording`（容量不足时以路径 `recording` 的 `CoreInputError` 原子拒绝；故障后导出也抛出），[replay.ts](../../../../src/core/replay/replay.ts)、[compare.ts](../../../../src/core/replay/compare.ts)，[tick-input.ts](../../../../src/core/contracts/tick-input.ts) 的 `readTickInput`（公开；单命令校验经它完成），[limits.ts](../../../../src/core/contracts/limits.ts) 的 `CORE_LIMITS`（`commandsPerTick` 64，`recorded*`），[projection.ts](../../../../src/core/projections/projection.ts)（`mission.wingman`、`player.interactionContext`、四个未就绪分区）与 [render-state.ts](../../../../src/core/projections/render-state.ts)。交接要点见 [Core 模块说明](../../../engineering/modules/core.md#交接)。
- **可复用的 P1 骨架：** [fixed-step-clock.ts](../../../../src/app/runtime/fixed-step-clock.ts)（锚定、补跑上限、alpha）、[runtime-errors.ts](../../../../src/app/runtime/runtime-errors.ts)、[session-host.ts](../../../../src/app/session/session-host.ts)、[session-errors.ts](../../../../src/app/session/session-errors.ts)、[rollback-error.ts](../../../../src/app/session/rollback-error.ts)、[browser-session-host.ts](../../../../src/platform/browser/browser-session-host.ts)。[synthetic-runtime.ts](../../../../src/app/runtime/synthetic-runtime.ts) 与 [synthetic-session.ts](../../../../src/app/session/synthetic-session.ts) 的实现与测试是改写的参照，但其合成语义（整帧共用命令索引、故障后可读快照与前缀导出、`restart`）不沿用。`ControlledHost` 目前在 [synthetic-session.test-support.ts](../../../../src/app/session/synthetic-session.test-support.ts)。
- **应用与资源：** [resource-holder.ts](../../../../src/app/resources/resource-holder.ts)（`current()`、`generation`、`beforeReplace` 只在替换时通知，`dispose()` 不通知监听者）；[mission-diagnostics.ts](../../../../src/app/resources/mission-diagnostics.ts)（解码三份逻辑 Asset 并 `loadMission`，状态 `not-attempted`/`loaded`/`failed`）；[app-flow.ts](../../../../src/app/flow/app-flow.ts)（菜单、导入、演示、查看器）；[App.tsx](../../../../src/app/App.tsx)、[ports.ts](../../../../src/app/ports.ts)、[browser-ports.ts](../../../../src/app/browser-ports.ts)、[app-entry.test-support.tsx](../../../../src/app/app-entry.test-support.tsx)（开发测试入口，新增查询键须同步 [e2e-network-policy.ts](../../../../tools/e2e-network-policy.ts) 的 `TEST_ENTRY_QUERY`）；[viewer-owner.ts](../../../../src/app/viewer/viewer-owner.ts) 的关闭屏障作为异步关闭的参照。当前没有 `import.meta.env` 的开发/生产分支。
- **合成内容：** [create-world.test-support.ts](../../../../src/core/world/create-world.test-support.ts)（`worldInput`、`sliceMission`、`originalImportIdentity`）可直接用于 Node 测试；[synthetic-import.test-support.ts](../../../../src/workers/synthetic-import.test-support.ts) 与 [import-scenarios.test-support.ts](../../../../src/workers/import-scenarios.test-support.ts) 的合成光盘场景经测试入口导入。现有场景的任务能否以生产配置通过 `createWorld` 尚未核实，由 01 确定。
- **待退役：** `src/core/synthetic/`、`src/app/runtime/synthetic-*`、`src/app/session/synthetic-session*`、`src/app/composition/synthetic-demo-*` 与 `use-synthetic-demo-owner.ts`、`src/ui/game/synthetic-*` 与 `use-synthetic-game.ts`、`src/ui/dev/SyntheticDevPanel.tsx`、`src/ui/pages/SyntheticDemoPage.tsx`、`src/ui/render/SyntheticRenderView.tsx`、`src/render/synthetic/`；lint 规则 `osr/core-synthetic-boundary`（[eslint.config.js](../../../../eslint.config.js)、[engineering-boundaries.test.ts](../../../../tools/engineering-boundaries.test.ts)）。依赖演示的 E2E：app-shell、app-shell-resources、bootstrap、browser-replay、compliance-text、fast-refresh、interaction-render、joint-pipeline.development、joint-resources、native-lifecycle、probe-contract、production-preview、resource-balance-controls、viewer-page（只取 `frameWindow`）、webgl-unavailable，以及 `e2e/support/` 的 demo-observations、image-observations、browser-probes、resource-balance。另有约 84 份文档链接到待删源码，其中 [P3 tasks](../tasks.md) 归协调者。
- **计划新增：** `src/app/runtime/game-*`、`src/app/session/game-session*` 与 `session-host.test-support.ts`、`src/app/mission/`、`src/app/composition/mission-*` 与 `use-mission-owner.ts`、`src/app/MissionScreen.tsx`、`src/ui/game/game-*`、`src/ui/mission/`、`src/ui/dev/` 的正式诊断、平台适配器、`tools/replay-check.ts`、新的 E2E 用例与支持、`docs/engineering/slice-gaps.md`（文件名可在实现时调整，职责不变）。
- **跨任务前提：** P3-02 已完成（`node tools/task-state.ts p3/02` 为 done）。本 goal 须在**包含 P3-03 的基线**上执行，该前提已满足：本分支于 2026-10-09 快进到 main 的 `bb639ef`，其中 P3-03 已合并且完成（`node tools/task-state.ts p3/03` 为 done）。
  - **原因：** 两者的写入范围重叠（`src/workers/synthetic-import.test-support.ts`、`import-scenarios.test-support.ts`、`src/original-data/formats/formats.test-support.ts`、`src/content/logic/logic-content.test-support.ts`、`docs/engineering/`、`e2e/viewer-page.spec.ts`），且 P3-03 改变了本 goal 消费的包身份：切片定义版本 4（logic、models、cockpit-hud-map、audio 组新增 15 个必需角色）、转换器版本 `osr-import.graphics-4.logic-2.audio-2.models-4` 与新的 `PRODUCTION_PACKAGE` 限值、logic payload schema 2、`MissionSetup.eventTriggers` 与声明的 `eventTrigger`；旧转换器版本的缓存不再恢复。01、05、08、10、14 的合成场景、生产缓存预置与真实内容证据都以此为准。
  - **P3-02/P3-03 的集成：** 已在 main 中完成（P3-03 的修复子任务 28，提交 `d893f6b`）：[setup-hash.ts](../../../../src/core/world/setup-hash.ts) 的规范文本覆盖 `eventTriggers` 与声明的 `eventTrigger`，[create-world.test-support.ts](../../../../src/core/world/create-world.test-support.ts) 的合成任务含事件触发。
  - **执行开始时的核对：** 安装依赖后在本基线上运行一次 `pnpm check`，作为 01–04 的起点；失败时先记录阻塞，不在本 goal 中修复基线。
  - P3-03 的 21 新增了 [package-check.ts](../../../../tools/package-check.ts)（以 `createImportJob` 转换整个文件组并核对完整包），08 复用其整包导入路径。
- **环境（起草时核对）：** 本 worktree 没有 `node_modules`，执行前运行 `pnpm install --frozen-lockfile`；`local/` 已以符号链接接入主仓库的 `local/`（含 `local/StarRang/cd/STAR_RANGERS.{ccd,img,sub,cue}`），worker worktree 按[并行执行](../../../engineering/agent-workflow.md#并行执行)的约定同样链接；E2E 使用本机 `/Applications/Google Chrome.app`（channel `chrome`），原生隐藏走 development-headed 项目。
- **原版证据：** 本任务不需要新的 DOS 原版运行（spec 的证据边界）；R-13 控制子集与流程顺序依据已有记录（B-001、B-003、executable 的时基、过场、结果与失败各节）。AC-17 是新实现使用本地真实内容的私有参考实验，由 agent 在开发浏览器中完成，输出只在 `local/research/p3-04/`；不需要用户操作。

## 验收覆盖

| Spec 范围项/验收项 | 实现子任务 | 验证子任务及方法 |
|---|---|---|
| S-01 | 02 | 02：时间、意图、批次、读模型、失败帧的 Node 测试；17：契约复核 |
| S-02 | 03 | 03：状态表、保持、停止、清输入、通知边界的 Node 测试；17 |
| S-03 | 05、09 | 05：流程、资格、配置、重开与返回的 Node 测试；10：开发与生产浏览器流程 |
| S-04 | 03、05、09 | 03：`transition` 与完成凭证；05：占位计时与隐藏保护；10：占位跳过与自然结束 |
| S-05 | 04、05、09 | 05：两级所有权、释放顺序与锁存；10：离页确认；11：资源平衡与 Fast Refresh |
| S-06 | 06 | 06：采样、即时发布与命令反馈的 Node 测试 |
| S-07 | 07、09 | 07：诊断模型与导出的 Node 测试；10：开发下载；12：生产产物与 DOM 中不存在 |
| S-08 | 08 | 08：工具 Node 测试；10：浏览器导出后的核对；14：生产 CLI 与真实内容 |
| S-09 | 01 | 01：合成场景的 Node 核对；10：经测试入口与生产缓存使用 |
| S-10 | 09、10、11、12、13、16 | 13：删除与引用检查；16：历史链接；17：`git grep`、`pnpm check`、`pnpm test:e2e` |
| S-11 | 09、15 | 10：界面标注文字；15：`slice-gaps.md`；17：代码 G ID 与文档一致 |
| S-12 | 14、15、16 | 14：对照结论；15、16：文档同步；17：链接与元数据 |
| AC-01 | 02 | 02：时间序列与读模型测试 |
| AC-02 | 02 | 02：真实 Core 下的批次、队列与交付元数据测试 |
| AC-03 | 02、03 | 02：Runtime 失败帧与容量；03：会话层反馈与导出规则 |
| AC-04 | 03 | 03：P1-05 关键用例的正式版与差异项 |
| AC-05 | 03、05 | 03：`transition` 与凭证；05：占位与运行交错的迟到回调矩阵 |
| AC-06 | 02、03 | 03：经过生命周期操作的录制 JSON 往返 replay |
| AC-07 | 05 | 05：可控时钟、种子与代际的流程测试 |
| AC-08 | 01、05、09 | 05：资格与代际测试；10：浏览器中的四种不能开始与可开始 |
| AC-09 | 05、09 | 05：所有权与 holder 替换/销毁顺序；11：Fast Refresh 与往返后的资源平衡 |
| AC-10 | 04、05 | 05：phase 矩阵；10：Chrome 原生 `beforeunload` 对话框 |
| AC-11 | 06 | 06：可控时钟的桥接与反馈测试 |
| AC-12 | 09 | 10：开发与生产的完整应用流程 E2E |
| AC-13 | 03 | 11：development-headed 原生隐藏 |
| AC-14 | 09 | 11：往返、Fast Refresh、计时器探针与控制样本 |
| AC-15 | 09 | 12：生产 CSP、网络审计与产物检查 |
| AC-16 | 07、08 | 08：Node limit/limit+1、失败码与退出码；10：浏览器下载后核对 |
| AC-17 | — | 14：本地真实内容运行、导出与生产 CLI 核对 |
| AC-18 | 09、10、11、12、13、16 | 13：删除与引用；16：历史链接；17：复核 |
| AC-19 | 09、15 | 10：界面标注；15：`slice-gaps.md`；17：代码与文档一致 |
| AC-20 | — | 14：R-13 控制子集与 L 流程部分的对照记录（引用 03、11 的证据） |
| AC-21 | 15、16 | 17：`pnpm check`、`pnpm check:compliance`、链接与 `updated:` |
| AC-22 | 07 | 07：保留窗口、帧计时、导出与释放；10：开发下载；12：生产中不存在 |

## 子任务跟踪

状态只在此维护：`pending` / `in-progress` / `blocked` / `completed`。依赖项全部 completed 后才能开始；验收结果和证据写在相应 subtask 文档，不在阶段索引重复状态。并行执行时，本表与执行记录只由协调者修改。

| 子任务 | 依赖 | 状态 |
|---|---|---|
| [01-synthetic-mission-package.md](./subtasks/01-synthetic-mission-package.md) | — | completed |
| [02-formal-runtime.md](./subtasks/02-formal-runtime.md) | — | in-progress |
| [03-formal-session.md](./subtasks/03-formal-session.md) | 02 | pending |
| [04-ports-platform-adapters.md](./subtasks/04-ports-platform-adapters.md) | — | completed |
| [05-mission-flow-owner.md](./subtasks/05-mission-flow-owner.md) | 01, 03, 04 | pending |
| [06-ui-bridge-feedback.md](./subtasks/06-ui-bridge-feedback.md) | 03 | pending |
| [07-dev-diagnostics.md](./subtasks/07-dev-diagnostics.md) | 04, 05, 06 | pending |
| [08-replay-check-tool.md](./subtasks/08-replay-check-tool.md) | 01 | pending |
| [09-pages-app-wiring.md](./subtasks/09-pages-app-wiring.md) | 05, 06, 07 | pending |
| [10-e2e-mission-flow.md](./subtasks/10-e2e-mission-flow.md) | 08, 09 | pending |
| [11-e2e-lifecycle-resources.md](./subtasks/11-e2e-lifecycle-resources.md) | 10 | pending |
| [12-e2e-shell-production.md](./subtasks/12-e2e-shell-production.md) | 10 | pending |
| [13-retire-synthetic-demo.md](./subtasks/13-retire-synthetic-demo.md) | 09, 11, 12 | pending |
| [14-real-content-comparison.md](./subtasks/14-real-content-comparison.md) | 08, 09, 11 | pending |
| [15-engineering-docs-gaps.md](./subtasks/15-engineering-docs-gaps.md) | 13 | pending |
| [16-history-links.md](./subtasks/16-history-links.md) | 15 | pending |
| [17-final-alignment.md](./subtasks/17-final-alignment.md) | 01, 02, 03, 04, 05, 06, 07, 08, 09, 10, 11, 12, 13, 14, 15, 16 | pending |

最后一行始终为最终对齐验证，依赖所有其他子任务。ID 分配后保持不变；新增修复项使用新 ID，插入最终验证之前并加入其依赖，不要求最终验证拥有最大的数字。

## 执行记录

- **2026-10-10 — 并行执行安排：** 用户以 `/orchestrate` 调用 execute-goal（默认并行，同时运行的 worker 不超过 3 个），并说明“从现在开始，我接下来几个小时都不能接手或回答你的问题。如果有任何问题，你都按你最推荐的回答来做。如果需要修改spec或goal，我都同意。如果要增加新的subtasks来unblock一个subtasks，我也同意。”协调者据此自行决定执行中出现的问题，必要的 spec/goal 修订与新增解除阻塞的子任务记录在本节。协调者在 `p3-04-runtime-session-spec` 分支上执行（本 worktree，`local` 以符号链接接入主仓库的 `local/`）。沿用 P3-01 至 P3-03 的宿主做法：worker 在应用管理的 worktree 中运行（以认领提交为基），分支改名为 `exec-p3-04-NN` 作为认领标记，并同样链接 `local`。执行开始时的基线核对：`pnpm install --frozen-lockfile` 后 `pnpm check` 通过（208 个文件、6,438 个测试与构建）。P3-06、P3-07 的 spec 同时在其他 worktree 中起草，不影响本 goal 的写入范围。
- **2026-10-10 — 04 完成（交 05、07、09、15）：** 边界规则不允许 browser- 前缀的文件进入 Node 程序，因此按 keyboard-source 的先例拆为 DOM-free 核心（`seed.ts`、`timer.ts`、`leave-guard.ts`、`file-save.ts`，Node 测试）与薄的浏览器连接（`browser-seed.ts`、`browser-timer.ts`、`browser-file-save.ts`），写入范围已相应扩大。端口形状（`mission-ports.ts`）：`SeedSource` 为 `() => number`；`MonotonicClock` 为 `() => number`（非有限或倒退时抛出）；`OneShotTimer` 为 `{ schedule(callback, delayMs): number; cancel(handle): undefined }`（句柄从 0 起，延迟 0–2,147,483,647 ms，迟到回调不执行）；`LeaveGuard` 为 `() => Revoke`；`FileSave` 为 `{ save(name, text): FileSaveResult; dispose(): undefined }`（结果 requested/failed/cleanup-failed/disposed）。交 09：`AppPorts` 以 `createBrowserSeedSource()`、`createBrowserClock()`、`createBrowserTimer()`、`createLeaveGuard(window)` 接线，`createBrowserFileSave` 作为工厂传入，每个所有者释放自己的实例。交 15：platform 与 app 分册记录这些端口与核心/连接的划分。
- **2026-10-10 — 01 完成（交 05、08、10）：** 基线核对：现有 `models` 场景得到完整包，任务载入且僚机 null、0、1 都能创建世界，但僚机名单只有 2 项（索引 2–4 在 `input.run.wingman` 被拒绝），不满足生产配置；因此 01 不改 `models`，在 5 项名单的切片光盘上新增 `mission-startable`、`mission-partial`、`mission-load-failed`、`mission-create-rejected`（测试入口沿用 `worker` 查询选择）。下游导出（除注明外在 `src/workers/import-scenarios.test-support.ts`）：`MISSION_SCENARIOS`（场景名 → 失败阶段与稳定失败，供 05、10 断言）；`scenarioFiles(name)` 与 `scenarioEntryProfile(name)`（CloneCD 文件组与预期包配置，供 08）；`scenarioGroups(name)`（作业发出的全部组，可直接传给 `seedProductionCache`，供 10）；`formats.test-support.ts` 的 `FIVE_WINGMAN_NAMES`、`fiveWingmanCampaignSpec()` 与 `twoPlayerRequestsScenarioSpec()`（配置页名单含 1、2、0、1、3 个候选，其中一项为类似标记的文字，供纯文本检查）。僚机显示名不含 MARKER，避免与“页面不含 MARKER”的隐私断言冲突。

## 审批

用户于 2026-10-09 明确批准本 goal（“approve the goal and commit”）。批准范围为当前的 17 个子任务、依赖、执行方式、写入范围、验收覆盖与跨任务前提（基线为包含 P3-03 的 main `bb639ef`）。这不代表实现完成，不替代 spec 批准，也不授权执行之外的 push、部署或阶段切换。
