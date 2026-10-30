---
type: plan
status: accepted
phase: "P3"
task: "15"
updated: "2026-10-30"
---

# P3-15：玩法闭环联合验证与原版对照 — Goal

## 目标与来源

实现已批准的 [spec](./spec.md) 中 S-01 至 S-09、AC-01 至 AC-10：在同一集成基线上以合成任务包完成浏览器全闭环与 replay、生命周期与资源平衡、类型 9 警告端到端复验，以本机真实浏览器核对输入与能力，以本地原版内容走通成功/失败与重试，并汇总原版对照与缺省标注。本文件不重新定义行为契约；本任务只写验证代码、合成测试支持与验证文档，产品差异交回责任任务。

## 代码现状与前提

- **已有分散覆盖：** [mission-flow.development.spec.ts](../../../../e2e/mission-flow.development.spec.ts) 覆盖开始资格、完整占位流程、暂停/菜单/重开、录制下载与 Node replay、地图/Warp 和真实隐藏的 Warp；[mission-flow.production.spec.ts](../../../../e2e/mission-flow.production.spec.ts) 以预置缓存走生产流程与生产地图，并确认生产 DOM 无开发面板；[mission-result.development.spec.ts](../../../../e2e/mission-result.development.spec.ts) 以短的合成变体由规则自然到达失败（两次救援后第三次损失）与成功（全清结算），并对导出录制做 Node replay；[base-interaction.development.spec.ts](../../../../e2e/base-interaction.development.spec.ts) 覆盖停靠/离港；[joint-resources.spec.ts](../../../../e2e/joint-resources.spec.ts) 覆盖三次往返与结果页的资源平衡；[native-lifecycle.spec.ts](../../../../e2e/native-lifecycle.spec.ts) 与 [native-lifecycle.ts](../../../../e2e/support/native-lifecycle.ts) 的 `nativeBrowser` 提供真实标签页隐藏。没有一条运行把选目标、射击、地图/Warp、基地与结果串在同一闭环中，也没有生产构建的成功/失败结果用例。
- **合成包构造：** [mission-result.ts](../../../../e2e/support/mission-result.ts) 的 `endingPackage` 在 Node 中替换 `mission-startable` 包的任务与机型 payload，生成可由规则结束的变体；其注释说明原 `mission-startable` 无法经输入结束。[production-cache.ts](../../../../e2e/support/production-cache.ts) 的 `seedRecords`/`storeSeed`/`seedProductionCache` 以生产身份预置合成包。[map-warp.ts](../../../../e2e/support/map-warp.ts)、[base-interaction.ts](../../../../e2e/support/base-interaction.ts)、[mission-observations.ts](../../../../e2e/support/mission-observations.ts)、[keyboard-input.ts](../../../../e2e/support/keyboard-input.ts)、[resource-balance.ts](../../../../e2e/support/resource-balance.ts)、[audited-test.ts](../../../../e2e/support/audited-test.ts) 提供观察、输入、资源与网络审计。
- **Replay：** 正式实现在 [recording.ts](../../../../src/core/replay/recording.ts)、[replay.ts](../../../../src/core/replay/replay.ts)、[compare.ts](../../../../src/core/replay/compare.ts)；[replay-check.ts](../../../../tools/replay-check.ts) 的 `runReplayCheck` 已被 E2E 用于核对下载录制。生产构建按[工程约定](../../../engineering/README.md)不含开发诊断与录制导出。
- **类型 9 警告：** Core 在 [communications.ts](../../../../src/core/projections/communications.ts) 输出分区级 `communications.warnings`；驾驶舱绘制在 [indicator-strip.ts](../../../../src/render/cockpit/overlay/indicator-strip.ts)，声音侧状态在 [hud-cues.ts](../../../../src/app/flight-audio/hud-cues.ts)（`sound/hud/instrument-9-loop`）。现有只有 Node 级测试（如 [tail-warning-replay.test.ts](../../../../src/core/replay/tail-warning-replay.test.ts)、[cockpit-integration.test.ts](../../../../src/render/cockpit/cockpit-integration.test.ts)、[hud-cues.test.ts](../../../../src/app/flight-audio/hud-cues.test.ts)）；E2E 尚无警告用例。像素与声音观察可用 [cockpit.ts](../../../../e2e/support/cockpit.ts) 的 `instrument` 与 [flight-audio.ts](../../../../e2e/support/flight-audio.ts) 的 `captureOutput`/`soundView`。
- **计划新增（尚不存在）：** `e2e/support/joint-loop.ts`、`e2e/joint-loop.development.spec.ts`、`e2e/joint-loop.production.spec.ts`、`e2e/support/joint-lifecycle.ts`、`e2e/joint-lifecycle.development.spec.ts`、`e2e/support/joint-warning.ts`、`e2e/joint-warning.development.spec.ts`、`docs/plan/p3/15/comparison-summary.md`（P3-15 的对照汇总表）；私有证据目录 `local/research/p3-15/`。
- **上游任务前提：** P3-05、P3-13 的 `node tools/task-state.ts p3/05`、`p3/13` 为 `done`，已满足。P3-14 代码已合入 main（`8bebe9ad`），但其 tracker 的 26（人耳判定）与 27（屏幕解锁后重跑有头真实隐藏用例）为 blocked、28 为 pending；`node tools/task-state.ts p3/14` 报告 `done` 之前，08 的 V-06 一行与 11 不能完成，本 goal 不代替或豁免这些证据。P3-03 的 goal 覆盖表落后于其 spec 的 S-18/S-19、AC-22/AC-23（实现已在 main，切片定义版本 7）；它不是本任务的依赖，不拥有 R/V 对照项，08 不把它记为已完成。
- **环境前提：** 03、05、07 需要本机未锁屏的桌面会话以运行有头 Chrome（P3-14/27 曾因 `CGSSessionScreenIsLocked` 无法运行）；05 需要 Computer Use 的辅助功能与屏幕录制权限；06 需要用户在物理键盘上操作；07 需要 `local/StarRang/cd/` 中的本地合法原版光盘镜像。缺少时相应子任务按恢复条件 blocked，不以合成结果替代。
- **原版证据：** 复用 [B-001](../../../original/behavior/B-001-strategic-map.md)、[B-003](../../../original/behavior/B-003-campaign-flow.md)、[B-005](../../../original/behavior/B-005-campaign-rescue.md)、[B-006](../../../original/behavior/B-006-simulation-timing.md)、[键位表](../../../original/input/key-map.md) 与各责任任务的对照证据；P3-11 的原版样本在 `fixed 40000 cycles` 下取得（[U-021](../../../original/unknowns.md)）。本任务不新增原版规则字段；仅当补采发现新事实时按[证据指南](../../../guides/original-evidence.md)更新 `docs/original/`，由执行时追加的修复项负责。

## 验收覆盖

| Spec 范围项/验收项 | 实现子任务 | 验证子任务及方法 |
|---|---|---|
| S-01 | 01、02 | 01、02 的 development/production 闭环用例；11 复核 |
| S-02 | 01 | 01 的开发录制导出与 Node replay；02 核对生产无录制/诊断 |
| S-03 | 03 | 03 的真实隐藏、生命周期与资源平衡用例 |
| S-04 | 05、06 | 05 Computer Use 本机核对；06 用户物理残余项 |
| S-05 | 07 | 07 本地真实内容的成功/失败与重试运行 |
| S-06 | 04 | 04 的真实规则警告、驾驶舱像素与音效消费者状态 |
| S-07 | 08 | 08 的对照汇总表逐行核对来源 |
| S-08 | 09、12 | 09 的 UI 与文档标注审计；12 的 F1 披露 |
| S-09 | 01–09、10 | 11 运行全部工程门槛并核对差异交回记录 |
| AC-01 | 01、02 | 01 development 与 02 production 的成功、失败、重试完整流程断言 |
| AC-02 | 01、02 | 01：两份开发录制经 `runReplayCheck` 得 `{ match: true }`；02：生产无开发录制/诊断入口 |
| AC-03 | 03 | 03：真实标签页隐藏下的 `phase`、tick、输入清除与地图状态 |
| AC-04 | 03 | 03：各生命周期检查点的资源平衡读数，含成功与失败结果路径 |
| AC-05 | 05、06 | 05/06：P3-05 AC-18 逐项的输入路径、原生结果与能力状态记录 |
| AC-06 | 04 | 04：真实攻击者/来弹条件下的 Core 警告、类型 9 像素与 `instrument-9` 声音决定 |
| AC-07 | 07 | 07：内容身份、配置、输入路径与结果，与 P3-11/B-003/B-005 核对 |
| AC-08 | 08 | 08 的汇总表；11 抽查来源与分类未被改写 |
| AC-09 | 09、12 | 09 的逐项位置/标注/文档链接表；12 披露 F1 前视的处置后由 09 复审该行 |
| AC-10 | 10、11、13 | 11：`pnpm check`、`pnpm test:e2e`、`pnpm check:compliance`、git 审阅 |

## 子任务跟踪

状态只在此维护：`pending` / `in-progress` / `blocked` / `completed`。依赖项全部 completed 后才能开始；验收结果和证据写在相应 subtask 文档，不在阶段索引重复状态。并行执行时，本表与执行记录只由协调者修改。

| 子任务 | 依赖 | 状态 |
|---|---|---|
| [01-joint-loop-development.md](./subtasks/01-joint-loop-development.md) | — | completed |
| [02-joint-loop-production.md](./subtasks/02-joint-loop-production.md) | 01 | completed |
| [03-joint-lifecycle-resources.md](./subtasks/03-joint-lifecycle-resources.md) | 01 | completed |
| [04-warning-end-to-end.md](./subtasks/04-warning-end-to-end.md) | 01 | completed |
| [05-real-device-computer-use.md](./subtasks/05-real-device-computer-use.md) | — | completed |
| [06-real-device-physical.md](./subtasks/06-real-device-physical.md) | 05 | completed |
| [07-real-content-runs.md](./subtasks/07-real-content-runs.md) | — | completed |
| [08-comparison-summary.md](./subtasks/08-comparison-summary.md) | — | completed |
| [09-annotation-audit.md](./subtasks/09-annotation-audit.md) | — | completed |
| [10-e2e-documentation.md](./subtasks/10-e2e-documentation.md) | 01, 02, 03, 04 | completed |
| [12-f1-disclosure.md](./subtasks/12-f1-disclosure.md) | — | completed |
| [13-flight-render-resize.md](./subtasks/13-flight-render-resize.md) | — | in-progress |
| [11-final-alignment.md](./subtasks/11-final-alignment.md) | 01, 02, 03, 04, 05, 06, 07, 08, 09, 10, 12, 13 | pending |

最后一行始终为最终对齐验证，依赖所有其他子任务。ID 分配后保持不变；新增修复项使用新 ID，插入最终验证之前并加入其依赖，不要求最终验证拥有最大的数字。

## 执行记录

- **2026-10-29 — 并行派发方式：** 宿主的 `create_session` 只能在项目现有检出或新 worktree 中建会话，不能在指定的 `exec/` worktree 中启动 worker；用户不在且授权“用任何方式来unblock”。因此 worker 改由协调者的后台子 agent 在各自 `exec/p3-15-NN` worktree 中按 worker 模式执行，集成规则不变。05 需在本机桌面用 Computer Use，由协调者在本检出中执行（其写入范围只有 `local/` 与本 subtask 文档），已删除其空 worktree 与分支。
- **2026-10-29 — Subtask 05 blocked:** 本机桌面正被用户持续使用（两分钟内 HIDIdleTime 0–8 s）；Computer Use 只能在每次重新读取窗口后断续送达按键，页面内点击不送达；开始手势使隔离的 Chrome 全屏覆盖用户显示器并抢到前台，随即失焦。为不干扰用户，停止操作，未测得任何 AC-05 项。
  Evidence: 私有记录 `local/research/p3-15/real-device/attempt-2026-10-29.md`；合成任务已在隔离 Chrome 中进入 running、焦点在游戏输入区，证明准备路径可用。
  Affected acceptance: AC-05（05 全部验收项）；06 依赖 05。
  Resume when: 用户不在使用本机桌面（或用户在场并同意让出桌面），再按私有记录的准备步骤重跑；也可与 06 合并为一次有用户在场的实机会话。
- **2026-10-29 — Subtask 08 blocked:** 汇总表已写完并在 worker 分支提交（`fed33ecb`，`exec/p3-15-08` worktree 保留），R-01 至 R-23 与 V-01 至 V-06 各行有来源与原分类；V-06 的感知一栏须等 P3-14/26 的开发者人耳判定，10177 与爆炸的时间差仍待试听判定或明确批准。
  Evidence: `node tools/task-state.ts p3/14` 为 `resolve-blocker`（26、27 blocked，28 pending）；worker 的链接检查 249 个 0 失败，抽查 10 行的 4 个发现已修正。
  Affected acceptance: 08 的“V-06 一行反映 P3-14 最终结论”；AC-08；11。
  Resume when: `node tools/task-state.ts p3/14` 报告 `done`；然后在同一 worktree 按 26 的判定更新 V-06 一行并勾选剩余验收项。
- **2026-10-29 — Subtask 05 恢复：** 用户告知桌面已空闲（“desktop is free now”），满足恢复条件；协调者在本检出继续 05。
- **2026-10-29 — Subtask 06 blocked:** 05 已完成并列出只能由用户在物理键盘上完成、或需人在场观察画面的残余（物理 Fn、持续按住操纵键、Option 主炮电平及并行、锁定地图按住清除、其余 Keyboard Lock 码与排除项、菜单/失焦解锁、地图自绘光标）；询问用户能否现在进行实机会话时，用户不在。
  Evidence: [05 的完成证据](./subtasks/05-real-device-computer-use.md#完成证据)；ask_user 回复“The user is not available to respond”。
  Affected acceptance: AC-05 的残余部分；06 的全部验收；11。
  Resume when: 用户在本机、同意进行约 15 分钟的物理键盘会话；协调者按 05 的准备步骤（`local/research/p3-15/real-device/`）打开隔离 Chrome 与合成任务后逐项引导。
- **2026-10-29 — Subtask 09 blocked；F1 处置与修复项 12：** 09 的审计（worker 提交 `07644c1b`，`exec/p3-15-09` worktree 保留）发现 F1 `cockpit-front` 在 Core 仍为 `not-implemented`，没有界面标注、清单条目或批准的处置，AC-09 未满足；其余 G-01 至 G-10 在开发与生产构建中均有标注且与文档一致，未发现其他未披露的占位或近似。协调者依据用户在本次执行中的授权（“在执行goal的过程中，如果需要修改spec或其他Decision，我都批准你修改。用任何方式来unblock任何问题，完成这个goal。”）选择披露而非在 P3 实现：原版 F1 只在飞行按键上下文把视角设为 0xC（已确认，代码），P3 只有前视且被毁中不轮询按键，所以在 P3 可达状态中没有可见或规则差异；`cockpit-front` 是 Core 唯一仍为 `not-implemented` 的命令，现有多处测试以它覆盖该结果路径，实现它的价值只在 P4 加入 G-08 视角时出现。因此新增修复项 12：把 F1 与前视别名并入 G-08 的披露（UI 文案、slice-gaps、P3-01 清单与工程文档），不改变代码行为；最终对齐加入对 12 的依赖。
  Evidence: [09 的完成证据](./subtasks/09-annotation-audit.md#完成证据)（worker 分支）；[executable 的按视角分派按键](../../../original/formats/executable.md)；`src/core/systems/commands.ts` 的默认分支。
  Affected acceptance: AC-09；09 的第 1、2 项验收；11。
  Resume when: 12 完成并集成后，在 `exec/p3-15-09` worktree 复审 F1 一行与受影响页面（开发与生产，合成内容），更新证据并勾选验收。
- **2026-10-30 — F1 处置前提更正（12）：** 12 核对代码后更正 2026-10-29 记录中的前提：原版在前视（0xC）按 F1 仍重选驾驶舱布局，清黑画面并全量重绘驾驶舱（已确认，代码；玩家能否察觉这一帧未经运行观察，未确认），被毁序列中不读取该键；本构建按下不改变任何状态。视角与规则仍无差异，处置不变（披露、不改代码、规则归 P4）；G-08 文案、slice-gaps、P3-01 清单、键位文档与 core 分册均已写明这一呈现差异。
- **2026-10-30 — Subtask 09 恢复：** 12 已集成（`0458ada4`），满足恢复条件；在原 `exec/p3-15-09` worktree 中变基到 main 后复审 F1 一行与受影响页面。
- **2026-10-30 — Subtask 06 恢复：** 用户要求“开始06”，满足恢复条件；协调者在本检出中准备隔离 Chrome 并引导用户逐项物理操作。
- **2026-10-30 — Subtask 06 完成，保留一项物理途径：** 用户完成物理键盘会话，05 的残余均已取得结果，未发现与 P3-05 契约不一致；唯一未取得结果的是物理 Fn+F11（页面无事件、屏幕无可见变化、原因未归因），F11 → G-10 的页面路径由 05 证实。该项记为 AC-05 的保留项。
  Resume when（仅此保留项）: 在 macOS 键盘设置中把 F 键改为标准功能键，或确认 Fn+F11 未被系统快捷键占用后，用户在同一准备步骤下重按 Fn+F11 并观察 G-10 提示。
- **2026-10-30 — Fn+F11 复测：** 用户在新的运行中单独复测 Fn+F11，仍没有任何 F11 事件到达页面，同一会话中 Fn+F9、F10、F12 均送达；本机“显示桌面”为系统默认的 F11。结论改为宿主在浏览器之前拦截了 F11（高概率），应用无法处理；保留项与恢复条件不变，键位指南已记录。
- **2026-10-30 — Subtask 08 恢复：** P3-14 已完成（`4138e15b`，`node tools/task-state.ts p3/14` 为 done），满足恢复条件；在原 `exec/p3-15-08` worktree 中变基到 main 后按 P3-14/26 的判定更新 V-06 一行。
- **2026-10-30 — 修复项 13（飞行画面缩放取样）：** P3-14/28 的完整 `pnpm test:e2e` 中 `flight-render.development.spec.ts:63` 失败（`12 pixels at scale 0.7578125`），当前 main 上单独 8 次 7 次失败，P3-14 合入提交 `8bebe9ad` 上 6/6 失败；它会使本任务 AC-10 无法通过。协调者的临时探针显示失配像素取了相邻一格逻辑像素的颜色，位于驾驶舱叠加旁。依用户在本次执行中的授权（修改决定以解阻），新增 13 定位根因并按根因修复：产品违反 P3-12 AC-05/AC-16 时修复渲染代码，测试假设错误时修正判据；最终对齐依赖 13。`map-picture.development.spec.ts:211` 只在完整套件高负载下失败一次，由 13 一并复核并在 11 重跑。

## 审批

用户于 2026-10-29 明确批准本 goal（“approve goal and commit”）。批准范围为本文件的代码现状与前提、验收覆盖，以及子任务 01 至 11 的拆分、依赖、执行方式与写入范围。

这不代表实现完成，也不替代 spec 批准（spec 已于同日单独批准）；P3-14 等跨任务前提与环境前提也没有因此满足。
