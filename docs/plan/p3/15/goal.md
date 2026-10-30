---
type: plan
status: accepted
phase: "P3"
task: "15"
updated: "2026-10-29"
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
| S-08 | 09 | 09 的 UI 与文档标注审计 |
| S-09 | 01–09、10 | 11 运行全部工程门槛并核对差异交回记录 |
| AC-01 | 01、02 | 01 development 与 02 production 的成功、失败、重试完整流程断言 |
| AC-02 | 01、02 | 01：两份开发录制经 `runReplayCheck` 得 `{ match: true }`；02：生产无开发录制/诊断入口 |
| AC-03 | 03 | 03：真实标签页隐藏下的 `phase`、tick、输入清除与地图状态 |
| AC-04 | 03 | 03：各生命周期检查点的资源平衡读数，含成功与失败结果路径 |
| AC-05 | 05、06 | 05/06：P3-05 AC-18 逐项的输入路径、原生结果与能力状态记录 |
| AC-06 | 04 | 04：真实攻击者/来弹条件下的 Core 警告、类型 9 像素与 `instrument-9` 声音决定 |
| AC-07 | 07 | 07：内容身份、配置、输入路径与结果，与 P3-11/B-003/B-005 核对 |
| AC-08 | 08 | 08 的汇总表；11 抽查来源与分类未被改写 |
| AC-09 | 09 | 09 的逐项位置/标注/文档链接表 |
| AC-10 | 10、11 | 11：`pnpm check`、`pnpm test:e2e`、`pnpm check:compliance`、git 审阅 |

## 子任务跟踪

状态只在此维护：`pending` / `in-progress` / `blocked` / `completed`。依赖项全部 completed 后才能开始；验收结果和证据写在相应 subtask 文档，不在阶段索引重复状态。并行执行时，本表与执行记录只由协调者修改。

| 子任务 | 依赖 | 状态 |
|---|---|---|
| [01-joint-loop-development.md](./subtasks/01-joint-loop-development.md) | — | completed |
| [02-joint-loop-production.md](./subtasks/02-joint-loop-production.md) | 01 | pending |
| [03-joint-lifecycle-resources.md](./subtasks/03-joint-lifecycle-resources.md) | 01 | pending |
| [04-warning-end-to-end.md](./subtasks/04-warning-end-to-end.md) | 01 | pending |
| [05-real-device-computer-use.md](./subtasks/05-real-device-computer-use.md) | — | completed |
| [06-real-device-physical.md](./subtasks/06-real-device-physical.md) | 05 | blocked |
| [07-real-content-runs.md](./subtasks/07-real-content-runs.md) | — | completed |
| [08-comparison-summary.md](./subtasks/08-comparison-summary.md) | — | blocked |
| [09-annotation-audit.md](./subtasks/09-annotation-audit.md) | — | in-progress |
| [10-e2e-documentation.md](./subtasks/10-e2e-documentation.md) | 01, 02, 03, 04 | pending |
| [11-final-alignment.md](./subtasks/11-final-alignment.md) | 01, 02, 03, 04, 05, 06, 07, 08, 09, 10 | pending |

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

## 审批

用户于 2026-10-29 明确批准本 goal（“approve goal and commit”）。批准范围为本文件的代码现状与前提、验收覆盖，以及子任务 01 至 11 的拆分、依赖、执行方式与写入范围。

这不代表实现完成，也不替代 spec 批准（spec 已于同日单独批准）；P3-14 等跨任务前提与环境前提也没有因此满足。
