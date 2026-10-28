---
type: plan
status: accepted
phase: P3
task: "14"
updated: 2026-10-28
---

# P3-14：飞行音效触发 — Goal

## 目标与来源

实现用户于 2026-10-15 批准的 [spec](./spec.md)：S-01 至 S-10、AC-01 至 AC-16。目标是把切片的事件和持续状态接到有证据的声音选择、混音与生命周期，并取得 V-06 对照。本文件不重定规则、混音公式或容差；A 项研究及 D-01/D-02 关卡仍须在其依赖实现前完成。

## 代码现状与前提

- [AudioController](../../../../src/platform/audio/audio-controller.ts) 已有惰性解锁、批次载入、播放/停止、8 发声资源上限和隐藏释放；尚无参数更新、保留进度的任务暂停与发声查询。`repeat` 目前按原始采样率排定停止。[浏览器能力](../../../../src/platform/audio/browser-audio-controller.ts)直接连接输出；[查看器](../../../../src/app/viewer/viewer-audio.ts)及其关闭屏障须保持兼容。
- [DomainEvent](../../../../src/core/contracts/domain-events.ts)、[Projection](../../../../src/core/projections/projection.ts)、[RenderState](../../../../src/core/projections/render-state.ts) 已有战斗事件、无量纲锁定进度、机型位序号和位置。warnings、必要的活动/运动快照尚未交付；08 只实现 06 获批的最小扩展。[CraftTypeTable](../../../../src/content/logic/logic-content.ts)、模型 soundSlots、爆炸表和 sound payload schema 2 可复用。
- [MissionOwnerConsumer](../../../../src/app/mission/mission-owner.ts) 提供 media 阶段、attachRun、previousClosed 和异步 release；[GameSessionRun](../../../../src/app/session/game-session.ts) 提供帧后事件/帧通知及运行清理。[装配](../../../../src/app/composition/use-mission-owner.ts)尚无音频消费者；[MissionScreen](../../../../src/app/MissionScreen.tsx)、[任务页面](../../../../src/ui/mission/MissionPage.tsx)与[开发诊断](../../../../src/ui/dev/mission-diagnostics.ts)是接线位置。
- 计划新增 `src/app/flight-audio/` 下的 content、voices、parameters、hud-cues、events、consumer、owner 模块及邻接测试（D-02 修订，2026-10-28：不设 presentation 适配模块；表现接口增补 DW-02 由 20 在 `src/render/flight/presentation/` 实现）；锁定音与 9 型警告音的声音侧状态在 `src/app/flight-audio/hud-cues.ts`（D-02 修订，2026-10-28；原计划的 `src/render/cockpit/audio-cues.ts` 共享模型已取消）；UI 声音状态和 E2E 文件见各 subtask。它们目前不存在，命名是本计划的落点，不是已交付 API。若 06/07 或上游交付改变落点，先由协调者更新相应写入范围，不绕过冲突检查。
- Node 假能力、[会话测试宿主](../../../../src/app/session/game-session.test-support.ts)、合成模型/飞行数据及 [E2E 音频探针](../../../../e2e/support/audio-playback.ts)均已存在。浏览器项目见 [playwright.config.ts](../../../../playwright.config.ts)：development、production、development-headed；headed 目前只收 native-lifecycle 用例，23 复用该文件。没有 TSX 单元 runner，不引入新测试框架。

### 跨任务与环境前提

| 前提 | 所需完成证据 | 使用位置 |
|---|---|---|
| P2/P3-03 内容、P3-02/04/05/07 基线 | 已批准契约及现有交付；当前完整包、类型和公开接口与其说明一致，不使用旧合成 Core | 05–23 |
| P3-09：地图/Warp | 正式目的地、开始/到达事件和模式状态；拒绝/重复设置的契约及 Node 证据 | 06/07 定稿，19/22/25 集成 |
| P3-08/10/11：AI/Xpon、通讯/基地、救援/结果 | 已批准的触发/停止语义与正式输出；可达性来自原版证据，不把未实现当成不可达 | 04/06/07 核对，19/25 验收 |
| P3-12：相机与 EXPL | 一次选择的真实实现、原列表索引、激活和持续列表、模式矩阵、预算及测试；无音频自己的变体抽取 | 07 定稿，20/22/25 集成 |
| P3-13：HUD 输入 | 已交付（main）；D-02 定稿 DD-01 不建共享模型，双方读同 tick projection；类型 9 指示条读分区级 `communications.warnings` | 07 定稿，20/22/25 集成 |
| D-01/D-02 的批准 | 06/07 的具体字段、端口、版本和接线契约已写入相应 spec；实质变更有明确批准 | 所有依赖实现；本 goal 批准不代替 |
| 本地工具与私有证据 | 按 .nvmrc/package.json 使用 Node/pnpm；实现验证缺依赖时按工程约定恢复。只读 Ghidra、合法私有数据及必要原版运行权限按证据指南核实 | 01–05、24/25；生成 goal 不安装或运行原版 |
| 本机浏览器与人耳对照 | Chrome、现有独立 E2E runner；26 需要开发者的人耳判断，agent 承担操作与准备 | 22/23、25/26 |

当前树只有 P3-01 至 P3-07 的交付与本任务 spec，不能把 P3-08 至 P3-13 的规划当成完成。外部前提按所需接口逐项汇合，不要求对方整个 goal 先结束。06/07 缺少必要合同或 19/20 缺少真实生产者时，相关项保持受阻；不能由本任务补写其他任务的规则实现或取消基地音效。

01–04 的独立静态调查各写私有目录，05 统一入档原版事实，避免共同修改 audio/unknowns。必要原版运行由协调者统一安排；24 先复用既有证据，只对缺口集中补证，不设任意运行次数，也不免除感知对照。执行规则沿用 [agent workflow](../../../engineering/agent-workflow.md)，不在此复制。

## 验收覆盖

| Spec 范围项/验收项 | 实现子任务 | 验证子任务及方法 |
|---|---|---|
| S-01 | 01, 02, 03, 04, 05 | 05 权威记录；24 原版缺口补证；28 |
| S-02 | 05, 09, 15, 19 | 09/15 关系与坏输入；19 正式规则；25 |
| S-03 | 06, 10, 11 | 10/11 平台边界；22 输出信号；23 |
| S-04 | 12, 15, 16 | 16 多 tick/账本；21 Runtime/replay；23 |
| S-05 | 02, 07, 13, 20 | 13 参数边界；20 同次选择；22/25 |
| S-06 | 03, 06, 08, 14, 20 | 08 纯投影；14 提示节奏；20/26 |
| S-07 | 04, 07, 15, 19 | 19 规则到声音；22/25；不可达须有证据 |
| S-08 | 11, 16, 17, 18 | 17 错误/关闭；23 生命周期与资源平衡 |
| S-09 | 18 | 18 文案/日志；22 激活与焦点；23 |
| S-10 | 21, 22, 23, 24, 25, 26, 27 | 27 文档/工程；28 最终证据覆盖 |
| AC-01 | 01, 02, 03, 04, 05 | 05 研究门槛；24 补证；27 合规 |
| AC-02 | 09, 15, 19 | 09/15 多对一、位序号、坏包；19 基地责任 |
| AC-03 | 08, 15, 16 | 15/16 独立事件与短命来源；21 正式 Runtime |
| AC-04 | 10, 12, 16 | 12 预算/抢占/迟到结束；16 混合来源 |
| AC-05 | 08, 14, 16, 20 | 16 门禁/重建；20 EXPL；23 隐藏恢复 |
| AC-06 | 02, 10, 11, 13 | 10/11 遍数/进度；13 参数；22/25 输出 |
| AC-07 | 03, 14, 20 | 14 声音侧状态（不抽随机）；20 与驾驶舱各自读同一输入的联合测试；26 |
| AC-08 | 06, 08, 14 | 06 批准；08 字段/版本；21 不变性 |
| AC-09 | 04, 07, 15, 19 | 19 真实规则事件；22/25 场景 |
| AC-10 | 11, 16, 17, 18 | 17 异步故障；23 隐藏、结果、HMR/重试 |
| AC-11 | 17, 18 | 22 真实激活、p、Tab/焦点与无声继续 |
| AC-12 | 18, 22, 23 | 22 开发/生产信号；23 原生隐藏和资源平衡 |
| AC-13 | 08, 16, 17, 21 | 21 多音频状态的真实 Runtime 录制/replay与边界 |
| AC-14 | 07, 14, 16, 20 | 20 真实表现模块与消费者联合（同次选择、配对次序、各自读 HUD 输入）；22 浏览器 |
| AC-15 | 05, 24, 25, 26 | 24 参考覆盖；25 候选等价；26 人耳结论 |
| AC-16 | 27 | 27 文档、检查与交接；28 验证无缺口 |

## 子任务跟踪

状态只在此维护：`pending` / `in-progress` / `blocked` / `completed`。依赖项全部 completed 后才能开始；结果与证据写在对应 subtask。并行执行时本表与执行记录只由协调者修改。

| 子任务 | 依赖 | 状态 |
|---|---|---|
| [01-trigger-voice-research.md](./subtasks/01-trigger-voice-research.md) | — | completed |
| [02-spatial-mixer-research.md](./subtasks/02-spatial-mixer-research.md) | — | completed |
| [03-hud-cue-research.md](./subtasks/03-hud-cue-research.md) | — | completed |
| [04-mode-reachability-research.md](./subtasks/04-mode-reachability-research.md) | — | completed |
| [05-evidence-contract-baseline.md](./subtasks/05-evidence-contract-baseline.md) | 01, 02, 03, 04 | completed |
| [06-shared-contract-approval.md](./subtasks/06-shared-contract-approval.md) | 05 | completed |
| [07-presentation-contract-approval.md](./subtasks/07-presentation-contract-approval.md) | 06 | completed |
| [08-core-audio-read-models.md](./subtasks/08-core-audio-read-models.md) | 06 | completed |
| [09-content-bindings.md](./subtasks/09-content-bindings.md) | 06 | completed |
| [10-voice-parameters-progress.md](./subtasks/10-voice-parameters-progress.md) | 06 | completed |
| [11-audio-pause-lifecycle.md](./subtasks/11-audio-pause-lifecycle.md) | 10 | completed |
| [12-voice-allocation-ledger.md](./subtasks/12-voice-allocation-ledger.md) | 10 | completed |
| [13-spatial-engine-parameters.md](./subtasks/13-spatial-engine-parameters.md) | 07, 08, 10 | completed |
| [14-hud-audio-read-model.md](./subtasks/14-hud-audio-read-model.md) | 07, 08 | completed |
| [15-event-sound-mapping.md](./subtasks/15-event-sound-mapping.md) | 07, 08, 09 | completed |
| [16-run-audio-consumer.md](./subtasks/16-run-audio-consumer.md) | 11, 12, 13, 14, 15 | completed |
| [17-owner-audio-lifecycle.md](./subtasks/17-owner-audio-lifecycle.md) | 16, 20 | pending |
| [18-audio-ui-composition.md](./subtasks/18-audio-ui-composition.md) | 17 | pending |
| [19-rule-event-integration.md](./subtasks/19-rule-event-integration.md) | 16 | in-progress |
| [20-presentation-integration.md](./subtasks/20-presentation-integration.md) | 16 | in-progress |
| [21-runtime-replay-boundaries.md](./subtasks/21-runtime-replay-boundaries.md) | 19, 20 | pending |
| [22-browser-audio-output.md](./subtasks/22-browser-audio-output.md) | 18, 19, 20 | pending |
| [23-browser-lifecycle-resources.md](./subtasks/23-browser-lifecycle-resources.md) | 22 | pending |
| [24-original-reference-coverage.md](./subtasks/24-original-reference-coverage.md) | 05 | in-progress |
| [25-private-candidate-comparison.md](./subtasks/25-private-candidate-comparison.md) | 22, 24 | pending |
| [26-listening-verdicts.md](./subtasks/26-listening-verdicts.md) | 25 | pending |
| [27-documentation-handoff.md](./subtasks/27-documentation-handoff.md) | 21, 23, 26 | pending |
| [28-final-alignment.md](./subtasks/28-final-alignment.md) | 01, 02, 03, 04, 05, 06, 07, 08, 09, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27 | pending |

最后一行是仅验证的最终对齐。后续修复分配新 ID，放在该行之前并加入其依赖，不重编号或用最终验证实现新功能。

并行以实际写入范围为准：01–04 可独立静态调查；06 之后 Core、内容、平台可分别推进；平台完成后分配账本与参数/HUD/事件映射可以并行；真实集成后 Node/replay、浏览器及私有参考工作按依赖汇合。06/07 的批准和 26 的人耳判断由协调者处理。共享平台文件及装配文件的重叠由调度器串行，不为写同一文件额外添加伪依赖。

## 执行记录

- **2026-10-16 — Subtask 24 blocked:** 需要启动 DOSBox-X 取得原版运行时参考；按用户本次执行指示（“如果 subtask 需要启动 dosbox 就先改成 blocked，记录，然后跳过”）暂不运行。
  Evidence: 05 的 V-06 基线（[完成证据](./subtasks/05-evidence-contract-baseline.md#完成证据)）列出的 R-01 至 R-18 全部是原版运行时观测，01–05 的静态研究已穷尽可静态闭合的项（Miles 自然结束状态、暂停保留位置、声像到交错声道均已静态确认）。
  Affected acceptance: AC-01、AC-15；24 的三项验收，及依赖它的 25、26、27、28。
  Resume when: 用户同意运行 DOSBox-X（基准配置、所选任务），由协调者按 05 的 R 清单合并成尽量少的会话，并与 P3-11/P3-12 已安排的原版运行合并。
- **2026-10-17 — Subtask 07 blocked:** D-02 须与 P3-12、P3-13 及 P3-11 的已批准输出对齐（spec 实施关卡；07 不得代建其他任务的合同），这些来源尚不可用。
  Evidence: main 上没有 `docs/plan/p3/11/`、`12/`、`13/` 的 spec；P3-12 的 spec 已批准但只在未合入的 `p3-12-flight-scene-spec` 分支，goal 29 项中 8 项完成；P3-11、P3-13 尚无 spec。06 已把 05 (c) 第 4、5、8 项（爆炸重放、管线阶段映射、基地/地图/拆除中的听者）交给 07。
  Affected acceptance: AC-05、AC-07、AC-09、AC-14 及 S-05、S-06 的接线；07 的三项验收；依赖 07 的 13、14、15，以及其后的 16–23、25–28。
  Resume when: P3-12 的相机/效果接口合入 main（或其 spec 的听者与 EXPL 交接节在 main 上可读），且 P3-13 的共享 HUD 与 P3-11 的失利/救援/结果衔接各有已批准 spec；届时协调者起草 D-02 并取得用户批准。
- **2026-10-17 — 集成时交给 27 的文档提议：** 09、12 建议在 [app 分册](../../../engineering/modules/app.md)新增 flight-audio 一节（content.ts 的 `bindFlightSounds` 等 API、12 的声部账本）；12 建议在 audio A-03 的漂移边缘一条补注“从一致的计数出发，分配、回收、句柄停止与全部停止都到不了该边缘（高概率：代码规则推理与模拟）”；11 的三处暂停/恢复解释已写入 platform 分册，16/17 以此为准。11 首次集成因 12 的控制器替身缺 `pause`/`resume` 失败，扩展 11 的写入范围后重做通过。
- **2026-10-24 — 合并含 P3-11 的 main：** 两边各把 `RULES_VERSION` 由 7 递增为 8，合并后为 9；快照格式取 P3-11 的 7，replay 格式仍为 3。P3-11 的退场开始改经 `retire`，活动实体各发 `object-retired`（FA-07 中原先阻塞的拆除一项）；P3-11 测试中的 `hit` 补上 FA-05 字段，若干事件次序断言加入 `object-retired`。记录见 [P3-02 审批的 2026-10-24 说明](../02/spec.md#审批)。P3-11 的 spec 现已在 main，07 仍等 P3-12 与 P3-13 的接口。
- **2026-10-28 — 合并含 P3-12、P3-13 的 main；07、24 解除阻塞：** 合并提交 `a8c9008b`：`RULES_VERSION` 11、快照格式 9、replay 格式 3；`RenderEntity`、`CombatTarget` 并存两边字段，`recordMaximumSpeed` 只留一份；类型 9 指示条改读分区级 `communications.warnings`（FA-01）。07 的恢复条件已满足（P3-11、P3-12、P3-13 的已批准 spec 与实现都在 main 上）。24 的恢复条件已满足：用户本次执行指示“在执行 goal 的过程中，如果需要修改 spec 或其他 Decision，我都批准你修改。用任何方式来 unblock 任何问题，完成这个 goal”，授权运行 DOSBox-X 取证。同一授权覆盖 07 的 D-02 定稿及其引起的 spec/合同修订。
- **2026-10-28 — 13、14 集成时的说明：** 13 对原版会触发 x87 异常、在有效 Core 读数中不可达的超大输入（例如超出 i32 的速率）抛出 `FlightSoundParameterError('out-of-range')`，不扩大 D1-06 的跳过范围；协调者确认此取舍。13 与 14 交给 27 的文档提议：app 分册的 flight-audio 一节列出 parameters.ts 的导出与 5 种错误、hud-cues.ts 的 `createHudCues(ledger)` 两段调用（`beforeDispatch`/`afterDispatch`）。

## 审批

用户于 2026-10-15 明确批准本 goal（“approve goal and commit”）。批准范围为子任务 01 至 28 的拆分、依赖、写入范围、验收覆盖与跨任务前提。

这不代表实现完成，也不开始执行；不代替 06/07 的具体共享契约批准或 26 的感知判断。
