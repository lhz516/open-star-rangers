---
type: plan
status: accepted
phase: P3
task: "11"
updated: 2026-10-23
related: [ADR-0006, ADR-0015, ADR-0017, B-003, B-005, B-006, B-009, U-009, U-010, U-014, U-021, U-022, U-028, U-031]
---

# P3-11：任务事件、结果、救援与重试 — Goal

## 目标与来源

实现用户于 2026-10-17 批准的 [spec](./spec.md) 中的 S-01 至 S-12 与 AC-01 至 AC-16：

- 原版研究 Q-01 至 Q-12，事实写入 `docs/original/`；
- 两个[实施关卡](./spec.md#实施关卡)：D-01 共享契约、退场与衔接；D-02 证据复用、采样与判据。各在依赖它的工作开始之前定稿并取得用户批准；
- 段 2 计数与任务总结；全清、结算与成功；被毁、信标、救援与失败；僚机损失计时；结果锁存、退场与完成；`mission`/`result` 分区、快照与 replay；
- Runtime 与会话的救援保持与终局；G-02/5 至 G-02/9 占位、G-06 结果页、重试与返回；浏览器回归；本地真实内容核对；按“保留门槛、优先复用、最小补采”取得的原版对照；文档与交接。

本文件不重新定义行为契约。共享字段的最终形状由 D-01 写入 [P3-02 spec](../02/spec.md) 与 [P3-04 spec](../04/spec.md) 后为准；本 goal 只规定由哪个子任务实现。

## 代码现状与前提

- **已有代码（P3-02 至 P3-10 交付）：**
  - [world-state.ts](../../../../src/core/world/world-state.ts)：`MissionStatus` 只有 `built`，`MissionFlow` 为 `{ mainState: 3, subState: 0|3|4|5, dockingDeadline }`。[pipeline.ts](../../../../src/core/systems/pipeline.ts) 的 `mission-flow` 只运行 [docking.ts](../../../../src/core/systems/docking.ts) 的 `checkDockingWait`，`mission-teardown` 为 `null`。
  - CR-13 调用点只在模块注释中：[damage.ts](../../../../src/core/systems/damage.ts)（`0x6977c`、`0x32d74`、`0x32dec`）、[destruction.ts](../../../../src/core/systems/destruction.ts) 的 `expireFragment`（`0x32e14(1)`）、[energy.ts](../../../../src/core/systems/energy.ts)（`0x33464`）、[launch.ts](../../../../src/core/systems/launch.ts) 与 [spawn.ts](../../../../src/core/systems/spawn.ts)（`0x339cc`）。
  - 可复用：[spawn.ts](../../../../src/core/systems/spawn.ts) 的 `disableSpawning`、`pendingSpawns`、`placeWorldRecord`；[view-switch.ts](../../../../src/core/systems/view-switch.ts) 的 `switchView`；[radio.ts](../../../../src/core/systems/radio.ts) 的 `flushRadio`、`queueRadio`；[base-interior.ts](../../../../src/core/systems/base-interior.ts) 的 `fullRepair`；[comm-reactions.ts](../../../../src/core/systems/comm-reactions.ts) 的 `clearCommunicationLimits`；[combat-init.ts](../../../../src/core/rules/combat-init.ts) 的 `rebuildWeaponBlock`、`initialiseResources`；[spawn-state.ts](../../../../src/core/world/spawn-state.ts) 的私有 `RuntimeRecord`。
  - [projection.ts](../../../../src/core/projections/projection.ts) 的 `result` 恒为 `not-implemented`，`ResultReason`、`ResultMessageReference` 为 `never`。[world.ts](../../../../src/core/world/world.ts) 的 `CoreFaultError` 锁存所有后续调用。版本：`RULES_VERSION` 7、快照格式 6、[recording.ts](../../../../src/core/replay/recording.ts) 的 `GAME_REPLAY_VERSION` 3。
  - 内容：[logic-content.ts](../../../../src/content/logic/logic-content.ts) 的 `EventTrigger`/`EventRange`；[scen.ts](../../../../src/original-data/formats/scen.ts) 与 [object-record.ts](../../../../src/original-data/formats/object-record.ts) 已在原始解析边界拒绝特殊模式与生成配对；`data/flight-messages` 与 `data/comm-messages` 已导入。
  - 会话：[game-runtime.ts](../../../../src/app/runtime/game-runtime.ts) 的 `FrameReport.cut` 只有 `transition`；[game-session.ts](../../../../src/app/session/game-session.ts) 的运行中保持只接受 G-02/3、G-02/4，`MAX_TRANSITIONS_PER_TICK` 为 2；[mission-flow.ts](../../../../src/app/mission/mission-flow.ts) 没有结果位置；[slice-gaps-copy.ts](../../../../src/ui/mission/slice-gaps-copy.ts) 的 G-06 写明尚无结果页，`MISSION_OBJECTIVES` 待本任务复核。
- **计划新增：** `src/core/systems/mission-flow.ts`、`mission-events.ts`、`rescue.ts`、`mission-teardown.ts`；`src/core/rules/` 下的全清、总结与救援纯规则；`src/ui/mission/ResultPage.tsx`；`e2e/mission-result.development.spec.ts`；被忽略的 `local/research/p3-11/<主题>/`。名称可在实现时调整，职责以各 subtask 为准。
- **跨任务前提：**
  - P3-07、P3-08、P3-10（直接依赖）与 P3-02 至 P3-06、P3-09 均已完成，各自 goal 全部 completed（见 [STATUS](../../../STATUS.md)）。
  - STATUS 列出的未决跨任务项（停靠倒计时到期或 `[launch, request-warp]` 与 `request-warp` 同 tick 的联合故障；`isClosingMissileLock` 未实现；`MapLabel.threatStamp`）仍归原责任任务。若阻碍本任务的联合用例，记录受影响 AC 与恢复条件，不在本任务中修复。
  - P3-12 至 P3-14 未开始：本任务只交付被毁视角时机、消息事件与音效触发点，不宣称画面或音效已呈现。
- **环境：** 本 worktree 已有 `node_modules`；不全时运行 `pnpm install --frozen-lockfile`。`local` 已链接主仓库的 `local/`。Ghidra 一律 `-noanalysis -readOnly`，在 `local/research/p3-11/<主题>/` 的私有只读副本中运行。DOSBox-X 基准环境同一时间只有一个会话，由协调者安排 06、20。
- **原版证据：** 01 至 03 只写各自的 findings，04 统一写入 `docs/original/`。原版运行遵循用户 2026-10-17 的选择：先复用已有证据（06 审计），只为无法闭合的必需缺口按 D-02 集中补采（20），优先用模拟器内输入由 agent 独自完成；确有合规途径无法完成的具体操作才请用户做最小操作。缺必需证据的验收保持 blocked。

## 验收覆盖

| Spec 范围项/验收项 | 实现子任务 | 验证子任务及方法 |
| --- | --- | --- |
| S-01 | 05、08 | 05：P3-02/P3-04 修订获批；08：类型、序列化、比较器与版本的 Node 测试；23：契约一致 |
| S-02 | 09 | 09：计数、总结与创建时检查的 Node 测试 |
| S-03 | 10 | 10：全清与结算的正式 step 测试 |
| S-04 | 11 | 11：被毁与信标的 Node 测试 |
| S-05 | 12 | 12：救援的单次入口与完整 tick 测试 |
| S-06 | 12 | 12：失败的 Node 测试 |
| S-07 | 13 | 13：僚机损失计时的 Node 测试 |
| S-08 | 14、15 | 14：退场与门禁；15：分区与事件；18：浏览器 |
| S-09 | 16、17 | 16：Runtime/Session/owner 竞态矩阵；18：浏览器 |
| S-10 | 01、04、17 | 01/04：Q-08 的有界核实；17：G-06 文案；18：可见 |
| S-11 | 01、02、03、04、06、07、20、21 | 04：事实归档；21：对照结论；23：证据核对 |
| S-12 | 22 | 22：文档链接与元数据；23：交接核对 |
| AC-01 | 05、07、08 | 05/07：关卡批准记录；08：严格读取与版本回归 |
| AC-02 | 09 | 09：parser/content/Core 合成边界测试 |
| AC-03 | 10 | 10：正式 step 集成与时钟边界 |
| AC-04 | 11 | 11：P3-07/09/10 联合 Node 回归 |
| AC-05 | 11 | 11：信标时间边界与混合损失链 |
| AC-06 | 12 | 12：恢复顺序、取模映射、快照与 AI/通讯联合回归 |
| AC-07 | 12、14 | 12：损失计数与失败；14：退场与故障矩阵 |
| AC-08 | 13 | 13：状态与时钟边界 |
| AC-09 | 15、17 | 15：projection 测试；17：bridge 与内容解析测试 |
| AC-10 | 14、15 | 15：录制往返、replay-check 与完成后 step |
| AC-11 | 16 | 16：Runtime/Session/owner 竞态与资源平衡 |
| AC-12 | 17 | 18：本机 Chrome E2E 与 browser-testing |
| AC-13 | 19 | 19：私有真实内容 Node 核对 |
| AC-14 | 01、02、03、04、21 | 04/21：来源与置信度；23：`pnpm check:compliance` 与 git 审阅 |
| AC-15 | 06、07、20、21 | 21：逐分支覆盖矩阵与结论 |
| AC-16 | 17、22 | 22：文档检查；23：`pnpm check` |

## 子任务跟踪

状态只在此维护：`pending` / `in-progress` / `blocked` / `completed`。依赖项全部 completed 后才能开始；验收结果和证据写在相应 subtask 文档，不在阶段索引重复状态。并行执行时，本表与执行记录只由协调者修改。

| 子任务 | 依赖 | 状态 |
|---|---|---|
| [01-flow-result-research.md](./subtasks/01-flow-result-research.md) | — | completed |
| [02-loss-rescue-research.md](./subtasks/02-loss-rescue-research.md) | — | completed |
| [03-messages-manual-research.md](./subtasks/03-messages-manual-research.md) | — | completed |
| [04-original-facts.md](./subtasks/04-original-facts.md) | 01, 02, 03 | completed |
| [05-shared-contract-gate.md](./subtasks/05-shared-contract-gate.md) | 04 | completed |
| [06-evidence-reuse-audit.md](./subtasks/06-evidence-reuse-audit.md) | 01, 02 | completed |
| [07-sampling-criteria-gate.md](./subtasks/07-sampling-criteria-gate.md) | 04, 06 | blocked |
| [08-contract-foundation.md](./subtasks/08-contract-foundation.md) | 05 | completed |
| [09-mission-events-summary.md](./subtasks/09-mission-events-summary.md) | 08 | completed |
| [10-all-clear-settlement.md](./subtasks/10-all-clear-settlement.md) | 09 | completed |
| [11-player-loss.md](./subtasks/11-player-loss.md) | 10 | completed |
| [12-rescue-failure.md](./subtasks/12-rescue-failure.md) | 11 | completed |
| [13-wingman-loss-timer.md](./subtasks/13-wingman-loss-timer.md) | 10 | pending |
| [14-teardown-completion.md](./subtasks/14-teardown-completion.md) | 12, 13 | pending |
| [15-projection-replay.md](./subtasks/15-projection-replay.md) | 14 | pending |
| [16-runtime-session-ending.md](./subtasks/16-runtime-session-ending.md) | 15 | pending |
| [17-result-page-ui.md](./subtasks/17-result-page-ui.md) | 16 | pending |
| [18-browser-verification.md](./subtasks/18-browser-verification.md) | 17 | pending |
| [19-real-content-check.md](./subtasks/19-real-content-check.md) | 07, 15 | pending |
| [20-original-formal-runs.md](./subtasks/20-original-formal-runs.md) | 07 | pending |
| [21-comparison-conclusions.md](./subtasks/21-comparison-conclusions.md) | 19, 20 | pending |
| [22-docs-handoff.md](./subtasks/22-docs-handoff.md) | 17, 18, 21 | pending |
| [23-final-alignment.md](./subtasks/23-final-alignment.md) | 01, 02, 03, 04, 05, 06, 07, 08, 09, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22 | pending |

最后一行始终为最终对齐验证，依赖所有其他子任务。ID 分配后保持不变；新增修复项使用新 ID，插入最终验证之前并加入其依赖，不要求最终验证拥有最大的数字。

## 执行记录

- **2026-10-18 — 01、03 的发现交 D-01（05）：**
  - 01 证明主状态 5 的失败分支在正常游戏中可达（导弹起爆与到期生成请求同帧的巧合，SCEN 3019 有 300 秒到期的编组），推翻 spec“仅调试入口可达、违反即 Core 故障”的前提。按 spec 的规则（“若研究发现正常可达反例，先修订契约与原因联合”），05 须先修订 spec 的失败原因联合与该不变量，经用户决定后再实现 08、10。
  - 01：全清掩码须由 `craftType` 导出 `0x91780`/`0x93780`，不能只靠 `side`；建议创建时拒绝总结选择值 1–12 与 ≥ 36；状态 4、5 的到期为严格比较。
  - 03：完成与信标消息进入消息行（类型 8 仪表），0x3C0 只是未画出时的过期时间，不是显示时长；spec 中“显示 0x3C0 单位”的表述须在 05 订正。
- **2026-10-18 — 06：** 审计 205 份私有运行报告：没有运行到达全清，也没有第二次救援。可复用 P3-07 p-b-01（被毁→逃生舱计时）与 P3-09 w2-01、w1-03、t2-01（各一次首次救援，只有离散的救援后状态）。无需预实验；D-02 的缺口与建议的 F（失败链）、S（成功链）两个配方族见 `local/research/p3-11/reuse/audit.md`。

- **2026-10-18 — Subtask 05 blocked:** D-01 草稿已完成，等待用户批准；用户当时不在，不能代为批准。
  Evidence: 草稿在 worker 会话“P3-11 · 05 d-01 drafting”的工作树 `musical-happiness`（未提交）：P3-02 新增“P3-11 的契约修订（D-01）”ME-01–ME-19，P3-04 新增“终局与救援衔接（P3-11 的修订）”，P3-11 spec 的强制修订与“D-01 定稿（待用户批准）”。需批准的 11 项推荐方案见该小节与 ME-17（状态 5 失败竞态忠实复现并新增原因 `settlement-failed`；锁存 tick 起退场、下一 tick 完成；锁存后命令 `ignored`/`mission-ended`；完成后 step 为非锁存 `CoreInputError`；总结选择值只接受 ≤0 与 13–19；比例按指令顺序 f64；Warp 中能量救援油门越界与扇区放置测试的处置；`RULES_VERSION` 与快照格式各 +1、replay 格式不变；退场写视角 0x13；会话 `completed` 阶段与终局占位）。
  Affected acceptance: AC-01；05 的全部验收；08 至 23 依赖它，07 与它写入范围重叠。
  Resume when: 用户明确批准 D-01（全部推荐或逐项修改）。协调者把决定转给该 worker，由它写审批记录并提交，随后集成。
- **2026-10-22 — Subtask 05 resumed:** 用户原话“批准 D-01 全部推荐”。协调者已把该决定转给 05 worker。
- **2026-10-22 — D-01 定稿：** 05 已写入 P3-02（ME-01–ME-19）、P3-04（终局与救援衔接）和 P3-11 spec 的审批记录；状态 5 的失败竞态按原因 `settlement-failed` 忠实复现；P3-03 不需要修订。
- **2026-10-22 — Subtask 07 blocked:** D-02 草稿已完成，等待用户批准；用户当时不在，不能代为批准。
  Evidence: 草稿在 worker 会话“P3-11 · 07 d-02 drafting”的工作树 `fictional-disco`（未提交）：本 spec 的“D-02 定稿（待用户批准）”，B-003“原版运行时测量：成功链（P3-11）”，B-005“原版运行时测量：失败链与救援（P3-11）”。时间链以游戏写入的到期为锚，分辨率 2 单位，归一化后精确；只开 F（无僚机：被毁→能量→地图打开时第三次损失）与 S（僚机 1：击杀至全清，0x140 等待内 Warp）两族。待批准的推荐：D2-1 启动预算 F 计划 1/最多 2、S 计划 1/最多 3，总计不超过 5 次，各阶段游戏/宿主时间上限；D2-2 F 的损失顺序；D2-3 预实验 t2-01 与 E-2、E-3 同样只作首次救援后的离散状态复用；D2-4 #6、#7（停靠、基地视角、Warp）、#8 仍为必需，在 F/S 中顺带捕获，取不到则 blocked，运行后由用户逐项决定；D2-5 僚机损失计时只在 S 中顺带捕获；D2-6 区分情形未出现时不加跑，只在报告中披露。
  Affected acceptance: AC-01（D-02 部分）、AC-15；07 的全部验收；19、20、21、22、23 依赖它。08 至 18 不依赖它，照常执行。
  Resume when: 用户明确批准 D-02（全部推荐或逐项修改），且仍没有新版对应结果。协调者把决定转给该 worker，由它写审批记录并提交，随后集成。
- **2026-10-22 — 08 的交接：** `compare.ts` 已按 ME-13 强制事件次序，09 至 14 须严格按该次序发出事件（例如 `radio-flushed('player-destroyed')` 紧接在 `player-loss-started` 之前），确需改变时由 15 修改比较器。`result` 分区始终就绪，`flow.completedTick` 设置前读作进行中；桥接的结果关键字段改为 `completedTick`。在 16、17 之前，G-02/5、G-02/6 的运行中衔接没有占位页。`docs/engineering/modules/core.md` 仍写快照格式 6、`RULES_VERSION` 7，应为 7、8（replay 格式 3 不变），交 22 订正。
- **2026-10-22 — 09 的交接：** `reportObjectEvent(context, entity, type)` 是 `0x6977c` 的唯一入口，10 在计数之后接入全清检查并发出 `all-clear`；`selectSummary` 尚无调用者，由 10 在 3→4 接入。偏差：ME-02 要求检查“在 CB-01 之后、`buildSpawnState` 之前”，两者不能同时满足（CB-01 在 `buildSpawnState` 之后），实现放在 `checkSetup` 末尾、`buildSpawnState` 之前，只影响同时出错时的优先次序。`docs/engineering/modules/core.md` 的世界创建第 3 步应补上总结选择值的拒绝，交 22。
- **2026-10-22 — 10 的交接：** 11 在 `mission-flow.ts` 的 `runMission` 中分派子状态 1（目前 case 1 直接返回）；12 在写入状态 ended、关闭生成且救援计数保持 2 之后调用导出的 `latch(context, { type: 'third-loss', loss })`；13 把僚机计时放在子状态 0 分支中 `missionStatus === 'ended'` 检查之后；14 起锁存后世界停在主状态 0，`compare.ts` 要求锁存 tick 内发出 `teardown-started`。“状态 4/5 中的损失既不救援也不失败”的入口测试留给 11/12。交 22：`core.md` 阶段表的 `mission-flow` 行应写明 `runMissionFlow`，并提到 `reportObjectEvent` 中的全清入口；`player-state.ts` 中 `heavyDamage` 的注释应改为只供 P4 勋章（ME-18）。
- **2026-10-23 — 11 的交接：** `destroyPlayer`（0x32d74）接在 `damage.ts` 的 `destroy` 中，在击杀计数之后、`destroyEntity` 之前；`startBeaconWait`（0x33464）接在玩家每次耗尽更新之后；`mission-flow` 子状态 1 在 c′ ≥ 期限时置子状态 2 并 `flushRadio('beacon-expired')`，12 在其后调用 `resolvePlayerLoss('energy')`，并在逃生舱到期处接入 `'destroyed'`。损失停在子状态 2，等待 12。Warp 中被毁时，`switchView` 恢复 `savedLeftPage` 的 `left-page-changed` 在 `player-loss-started` 之后发出（比较器要求 `player-loss-started` 紧接其清空，同 MW-05 先例），15 若修改比较器可再议。“状态 4/5 中的损失不进入”的入口测试已在 `player-loss.test.ts` 覆盖，12 只需覆盖救援与失败一侧（主状态 ≠ 3 时 `resolvePlayerLoss` 直接返回）。测试注意：`radioScene` 在第一个 tick 才初始化玩家资源，耗尽须在其后设置。交 22：`core.md` 第 774 行与约 1010–1027 行的交接段落已过时（0x32d74、0x33464 已接入）。
- **2026-10-23 — 12 的交接：** `resolvePlayerLoss(context, loss)` 在 `systems/rescue.ts`，接在 `destruction.ts` 的 `expireFragment`（`followedEntity := null` 之后、待移除之前）与 `mission-flow` 子状态 1（`flushRadio('beacon-expired')` 之后）；第三次损失写入状态 ended、关闭生成，救援计数保持 2 时调用 `latch`。恢复规则在 `rules/rescue.ts`；救援油门越界在 `'rescue.throttle'` 报 Core 故障（ME-17 决定 7）。13：僚机损失计时仍未接入。14/16：`game-runtime-recording` 的 131072 tick 运行现在经过一次能量救援（G-02/6，测试中释放屏障），到达救援的会话级运行会遇到 16 必须接纳的 G-02/5、G-02/6 保持。交 22：`core.md` 第 770、774 行与约 1010–1027 行已过时；已知差异列表应补上媒体零用时、不建模扇区预算（决定 8）与 G-2 的 Warp 油门故障。

## 审批

**2026-10-18 批准：** 用户明确调用 `/execute-goal docs/plan/p3/11/goal.md`（经 `/orchestrate`），按 execute-goal 的规则视为批准本 goal 的完整计划（23 个子任务、依赖、写入范围与验收覆盖）。批准不代表实现完成，不替代 spec 或关卡 D-01、D-02 的批准。
