---
type: plan
status: accepted
phase: P3
task: "09"
updated: 2026-10-14
related: [ADR-0004, ADR-0006, ADR-0009, ADR-0015, ADR-0017, B-001, B-006, U-007, U-009, U-010, U-021, U-025, U-026, U-029, U-032]
---

# P3-09：战略地图、战争迷雾与 Warp — Goal

## 目标与来源

实现用户于 2026-10-14 批准的 [spec](./spec.md) 中的 S-01 至 S-12 与 AC-01 至 AC-16：

- 原版研究 Q-01 至 Q-12，事实写入 `docs/original/`；
- 两个[实施关卡](./spec.md#实施关卡)：D-01 共享契约与内容输入、D-02 连续行为判据，各在依赖它的工作开始之前定稿并取得批准；
- 地图几何的内容导入；Core 契约基础；有序命令门禁与地图模式；光标、选择与种类 25 标记；可见性与 `object-sets`；Warp 能量、开始、过程、完成与中断；`map` 分区与 Warp 驾驶舱读数；
- 快照、replay 与上限；UI 桥接与开发诊断接线；实际应用的浏览器验证；真实内容本地核对；原版预实验、正式运行与对照结论；文档与交接。

本文件不重新定义行为契约。共享字段与内容输入的最终形状由 D-01 写入 [P3-02 spec](../02/spec.md) 与 [P3-03 spec](../03/spec.md) 后为准；本 goal 只规定由哪个子任务实现。

## 代码现状与前提

- **已有代码（P3-02 至 P3-07 交付，起草时核对）：**
  - 命令：[tick-input.ts](../../../../src/core/contracts/tick-input.ts) 已有 `toggle-map`、`map-point`、`request-warp`；[commands.ts](../../../../src/core/systems/commands.ts) 的 `judgeCommand` 对它们给出 `rejected`/`not-implemented`；[flight-control.ts](../../../../src/core/systems/flight-control.ts) 的 `judgeCommands` 在循环外读一次交互上下文，`changedAxes` 按当时视角把 map/base 的手动轴归零。
  - 状态：[player-state.ts](../../../../src/core/world/player-state.ts) 的 `viewMode`/`previousViewMode`、`leftDisplay.page`（`LeftPage` 已含 0–6）与 `statusDisplay`；[entity-table.ts](../../../../src/core/world/entity-table.ts) 的 `warpClock`、`inWarp`、移动块 `craft`/`warp`；`combatTypeOf` 只认 0–24 位，没有种类 25。
  - 流水线：[pipeline.ts](../../../../src/core/systems/pipeline.ts) 的 `object-sets`、`warp-completion` 为 null，`frame-end` 只有 P3-07 的显示步（[displays.ts](../../../../src/core/systems/displays.ts)）；[movement.ts](../../../../src/core/systems/movement.ts) 已分派 `integrateWarp`；[area.ts](../../../../src/core/systems/area.ts) 与 [active-area.ts](../../../../src/core/rules/active-area.ts) 尚无玩家 Warp 中心；[parked-travel.ts](../../../../src/core/rules/parked-travel.ts) 是停放 Warp。
  - 读模型：[projection.ts](../../../../src/core/projections/projection.ts) 的 `map` 恒为 `not-implemented`，`MapMarkerClass`/`MapVisibility` 为 `never`；[combat.ts](../../../../src/core/projections/combat.ts) 的 `flight.combat`；[render-state.ts](../../../../src/core/projections/render-state.ts)；[radar.ts](../../../../src/core/rules/radar.ts) 与 [targeting.ts](../../../../src/core/rules/targeting.ts) 已把种类 25 分为 `marker`/友方候选。
  - 输入与 replay：[create-world.ts](../../../../src/core/world/create-world.ts)、[rule-data.ts](../../../../src/core/world/rule-data.ts) 的 `RULE_DATA_FIELDS`、[craft-info-input.ts](../../../../src/core/world/craft-info-input.ts)、[setup-hash.ts](../../../../src/core/world/setup-hash.ts)、[replay.ts](../../../../src/core/replay/replay.ts) 的 `ReplayContent`、[snapshot.ts](../../../../src/core/replay/snapshot.ts)、[compare.ts](../../../../src/core/replay/compare.ts)、[rules-version.ts](../../../../src/core/replay/rules-version.ts)（`RULES_VERSION` 4，快照 3，replay 2）、[limits.ts](../../../../src/core/contracts/limits.ts)。
  - 内容与导入：[layout-payload.ts](../../../../src/content/graphics/layout-payload.ts) 不含仪表矩形；CCKD 的读取在 [source-graphics.ts](../../../../src/original-data/conversion/source-graphics.ts) 与 [production-graphics.ts](../../../../src/original-data/conversion/production-graphics.ts)；[slice-definition.ts](../../../../src/content/slice-definition.ts) 为版本 4，[converter-version.ts](../../../../src/original-data/conversion/converter-version.ts)；应用侧解码在 [mission-input.ts](../../../../src/app/resources/mission-input.ts)；[package-check.ts](../../../../tools/package-check.ts)。
  - UI 与诊断：[game-session-bridge.ts](../../../../src/ui/game/game-session-bridge.ts) 的关键状态比较、[MissionDevPanel.tsx](../../../../src/ui/dev/MissionDevPanel.tsx) 与 [command-draft.ts](../../../../src/ui/dev/command-draft.ts)（已能提交 `map-point`）；[use-mission-owner.ts](../../../../src/app/composition/use-mission-owner.ts) 的地图几何端口恒为 null；实际应用 E2E 在 [mission-flow.development.spec.ts](../../../../e2e/mission-flow.development.spec.ts)。
- **计划新增（名称可在实现时调整，职责不变）：** 地图几何的规范 payload 与读取器（`src/content/graphics/` 或 `src/content/hud/` 下）；`src/core/systems/map.ts`、`src/core/systems/object-sets.ts`、`src/core/systems/warp.ts`；`src/core/rules/map-frame.ts`、`map-visibility.ts`、`warp-energy.ts`、`warp-arrival.ts`；`src/core/projections/map.ts`；行为文档 `docs/original/behavior/B-010-map-warp.md`（创建时若编号已被占用，取下一个未用编号）；被忽略的 `local/research/p3-09/<主题>/`。
- **跨任务前提：**
  - P3-02 至 P3-07 已完成（各自 goal 全部 completed，见 [STATUS](../../../STATUS.md)），本 goal 消费其契约。P3-08、P3-10、P3-11 尚无 spec：本 goal 不等待它们；`object-sets` 由 15 交付最小完整实现。执行时若协调者分支已集成其他任务对同一阶段或共享字段的修改，08 先核对并在 D-01 中复用，不重复建设。
  - P3-05 的交接（右键编号需要新的 Core 命令）与本 spec 的推荐方向相反：08 按 D-01 同步 P3-05 spec 的交接说明，不改写其历史完成证据。
- **环境（起草时核对）：**
  - 本 worktree 没有 `node_modules`：执行前运行 `pnpm install --frozen-lockfile`。
  - `local` 已链接到主仓库的 `local/`；Ghidra 项目在 `local/ghidra/srangers`，一律 `-noanalysis -readOnly`，在 `local/research/p3-09/<主题>/` 中使用私有只读副本，不 `-overwrite`。
  - DOSBox-X 基准环境同一时间只有一个会话（工具在 `local/research/` 上加锁），基准运行统一由协调者进行。
- **原版证据：**
  - 01 至 06 由 agent 用只读 Ghidra 与本地数据取得，只把结论写入各自的 `local/research/p3-09/<主题>/findings.md`，由 07 统一写入 `docs/original/`，使 01 至 06 可以并行。
  - 09、24 需要在所选任务中开地图、点击、Warp 与观察可见边界。本机 Computer Use 无法向 DOSBox-X 送达输入；agent 先按[运行时测量](../../../guides/runtime-measurement.md#模拟器内输入)用配方声明的模拟器内输入（键、换档、声明的设备字段）完成，不把被测状态声明成设备，不用宿主层注入。09 先核实地图鼠标与飞行能否这样取得；确实取不到时才在该子任务中记录尝试并请用户在私有副本中做最小操作，执行方式仍为自动。
  - 达不到 spec 门槛的研究项按 spec 阻塞，不按猜测实现。

## 验收覆盖

| Spec 范围项/验收项 | 实现子任务 | 验证子任务及方法 |
|---|---|---|
| S-01 | 08、12 | 08：D-01 契约获批；12：类型、序列化、比较器与版本的 Node 测试；27：契约与 spec、P3-02 一致 |
| S-02 | 11、12 | 11：payload、转换、切片定义与缓存的合成测试及本机核对；12：`createWorld`/`ReplayContent`/setupHash 的 Node 测试 |
| S-03 | 13 | 13：有序命令门禁、开关与轴的正式 step 测试 |
| S-04 | 14 | 14：量化、换算、命中、z、标记生命周期的 Node 测试 |
| S-05 | 15 | 15：可见标志、图标过滤、覆盖与 `object-sets` 的 Node 测试 |
| S-06 | 19 | 19：`map` 分区的消费者契约测试 |
| S-07 | 16 | 16：消耗公式、显示值与扣费的 Node 测试 |
| S-08 | 17 | 17：门禁结果表、状态写入与事件的 Node 测试 |
| S-09 | 18 | 18：进度、完成、到达随机与中断的 Node 测试 |
| S-10 | 19 | 19：页 6 读数、指示灯与 Render State 的消费者测试 |
| S-11 | 01–07、09、10、24、25 | 01–07：Q-01 至 Q-12 写入 `docs/original/`；09、10：D-02；24：正式原版运行；25：R-13 至 R-16 的结论 |
| S-12 | 21、22、26 | 21：桥接与诊断接线测试；22：实际应用浏览器验证；26：文档与交接；27：链接与元数据 |
| AC-01 | 08、12 | 12：边界测试、版本拒绝、旧断言随批准更新；27：`pnpm check` |
| AC-02 | 11、12 | 11：转换、校验、缓存、本机核对；12：Core 输入与 setupHash |
| AC-03 | 13 | 13：开图/关图后的命令、同 tick 开关、select→Warp→select、轴与清键 |
| AC-04 | 14 | 14：量化边界、换算、夹取、命中、多选框、标记时序与名称引用 |
| AC-05 | 15 | 15：基础值与例外、刷新时机、严格边界、过滤、覆盖与历史、唯一实现 |
| AC-06 | 19、21 | 19：分区判别、信息边界与正反回归；21：桥接普通采样与关键变化立即发布 |
| AC-07 | 16、17、18 | 16：公式与数值边界；17、18：各阶段扣费与耗尽通知一次性 |
| AC-08 | 17 | 17：结果表、原子失败、页面保存与事件 |
| AC-09 | 18 | 18：阶段边界、复原、随机映射、CR-11 差异与中断 |
| AC-10 | 19 | 19：驾驶舱读数与 Render State |
| AC-11 | 20 | 20：快照完整、JSON 往返 replay、坏输入拒绝、上限与重试 |
| AC-12 | 21、22 | 22：`pnpm test:e2e` 实际应用用例（browser-testing） |
| AC-13 | 23 | 23：真实内容两种僚机配置的私有核对 |
| AC-14 | 01–07 | 07：事实与 U 项；27：`pnpm check:compliance` 与 git 审阅 |
| AC-15 | 09、10、24、25 | 10：判据获批；24：≥2 次合格运行；25：单次转移与连续行为的结论 |
| AC-16 | 26 | 26：文档与交接；27：`pnpm check`、链接与 `updated:` |

## 子任务跟踪

状态只在此维护：`pending` / `in-progress` / `blocked` / `completed`。依赖项全部 completed 后才能开始；验收结果和证据写在相应 subtask 文档，不在阶段索引重复状态。并行执行时，本表与执行记录只由协调者修改。

| 子任务 | 依赖 | 状态 |
|---|---|---|
| [01-map-mode-command-research.md](./subtasks/01-map-mode-command-research.md) | — | completed |
| [02-cursor-selection-marker-research.md](./subtasks/02-cursor-selection-marker-research.md) | — | completed |
| [03-visibility-fog-research.md](./subtasks/03-visibility-fog-research.md) | — | completed |
| [04-zoom-info-numbering-research.md](./subtasks/04-zoom-info-numbering-research.md) | — | completed |
| [05-warp-energy-start-research.md](./subtasks/05-warp-energy-start-research.md) | — | in-progress |
| [06-warp-progress-arrival-research.md](./subtasks/06-warp-progress-arrival-research.md) | — | in-progress |
| [07-numerics-stages-original-docs.md](./subtasks/07-numerics-stages-original-docs.md) | 01, 02, 03, 04, 05, 06 | pending |
| [08-shared-contract-gate.md](./subtasks/08-shared-contract-gate.md) | 07 | pending |
| [09-original-pilot-runs.md](./subtasks/09-original-pilot-runs.md) | 07 | pending |
| [10-criteria-gate.md](./subtasks/10-criteria-gate.md) | 09 | pending |
| [11-map-geometry-import.md](./subtasks/11-map-geometry-import.md) | 08 | pending |
| [12-core-contract-foundation.md](./subtasks/12-core-contract-foundation.md) | 08, 11 | pending |
| [13-ordered-gates-map-mode.md](./subtasks/13-ordered-gates-map-mode.md) | 12 | pending |
| [14-cursor-selection-marker.md](./subtasks/14-cursor-selection-marker.md) | 13 | pending |
| [15-visibility-object-sets.md](./subtasks/15-visibility-object-sets.md) | 09, 12 | pending |
| [16-warp-energy-rule.md](./subtasks/16-warp-energy-rule.md) | 12 | pending |
| [17-warp-start.md](./subtasks/17-warp-start.md) | 14, 16 | pending |
| [18-warp-progress-arrival.md](./subtasks/18-warp-progress-arrival.md) | 17 | pending |
| [19-map-partition-cockpit-readings.md](./subtasks/19-map-partition-cockpit-readings.md) | 14, 15, 18 | pending |
| [20-replay-limits-retry.md](./subtasks/20-replay-limits-retry.md) | 15, 18, 19 | pending |
| [21-bridge-diagnostics-wiring.md](./subtasks/21-bridge-diagnostics-wiring.md) | 19 | pending |
| [22-browser-app-verification.md](./subtasks/22-browser-app-verification.md) | 20, 21 | pending |
| [23-real-content-check.md](./subtasks/23-real-content-check.md) | 20 | pending |
| [24-original-formal-runs.md](./subtasks/24-original-formal-runs.md) | 10 | pending |
| [25-comparison-conclusions.md](./subtasks/25-comparison-conclusions.md) | 20, 23, 24 | pending |
| [26-docs-handoff.md](./subtasks/26-docs-handoff.md) | 20, 21 | pending |
| [27-final-alignment.md](./subtasks/27-final-alignment.md) | 01, 02, 03, 04, 05, 06, 07, 08, 09, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26 | pending |

最后一行始终为最终对齐验证，依赖所有其他子任务。ID 分配后保持不变；新增修复项使用新 ID，插入最终验证之前并加入其依赖，不要求最终验证拥有最大的数字。

## 执行记录

- **2026-10-14 — 并行执行安排：** 用户以 `/execute-goal`（无参数，默认并行，同时运行的 worker 不超过 3 个）执行本 goal。协调者在 `p3-09-strategic-map-spec` 分支（本 worktree）上执行。本宿主的 `create_session` 不能在协调者指定的文件夹中启动会话，因此沿用 P3-05、P3-07 的做法：worker 在应用为其会话创建的 worktree 中运行（以认领提交为基），由 worker 把分支改名为 `exec-p3-09-NN` 作为认领标记，`local` 由仓库的会话脚本链接；其余照 execute-goal 的并行规则（协调者认领，逐个以 `Worker-Commit:` 拖车集成并清理）。Ghidra 由各 worker 在 `local/research/p3-09/<主题>/` 下的私有副本中只读打开；基准环境（DOSBox-X）与 Computer Use 只由协调者操作。
- **2026-10-14 — 01 发现与 spec 的冲突（交 08/D-01）：** 原版 `0x32d74` 只在视角已是 0x11 且子模式 8 时不切换，地图（视角 8）会被被毁视角取代，与 spec [地图模式](./spec.md#地图模式)“若视角已是 8 则不切换”的读法相反；另外从飞行开关地图不置 `statusDisplay` 重绘，只有进出基地置位。08 在 D-01 中按 01 的完成证据更正，并决定地图中 `toggle-map` 与 `player-unavailable` 的优先次序（项目决定）。
- **2026-10-14 — 02 的结论中 D-01 须处理的点：** 创建标记时消耗一次共享随机数（`rand()%64` 的转角），spec 未列；选择读取的是上一 tick 绘制时生成的图标命中列表，Core 必须拥有并序列化该列表；放大范围来自运行时比例而不是布局；首次选择之前的 `w` 静默无反应，Warp 读取存储的目的地而不是标记。玩家状态字节 +0 只由首次选择置 1，任务建造/重试时由玩家实例化清零。
- **2026-10-14 — 03 的结论中 D-01 须处理的点：** 历史探索在静态上“不保留”（已确认，代码），运行佐证交 09；地图图标的可见性判定只作用于敌对种类（spec 对图标“可见”的表述须收窄）；+0xD4 的读者只有 `0x2b8ec`、`0x2ee60` 与僚机目标搜索 `0x62760`，僚机 AI `0x62250` 在任何视角都调用 `0x2ee60`，因此 `mapVisible` 与有序集合必须跨 tick 保留并进入快照（交 08、15 与 P3-08）。
- **2026-10-14 — 04 的结论中 D-01 须处理的点：** 右键编号开关与去抖没有规则读者（已穷举），属于 P3-13 的呈现，08 按此同步 P3-05 的交接；地图上的连线是玩家→光标，所选目标周围没有范围圈（圆盘属于各友方单位），spec/B-001 中“目标不可见时连线与范围的处理”无可决定的对象，须在 D-01 更正；地图绘制 `0x4b3a8` 对重合图标的像素去重叠会改变下一帧的拾取结果与目的地 z（与 02、14 交叉）；地图几何的最小 payload 字段见 04 的完成证据。
- **2026-10-14 — 基准运行的分派：** 09、24 只用配方声明的模拟器内输入（`tools/baseline/`），不用 Computer Use；协调者把这两行照常分派给 worker，由 worker 在基准锁下独占运行，同一时间本 goal 只有一个会话使用基准环境。Computer Use 若确有需要仍只由协调者进行。

## 审批

用户于 2026-10-14 明确批准本 goal（“approve the goal and commit”）。批准范围为本文件的验收覆盖、子任务 01 至 27 及其依赖、各 subtask 的工作范围、执行方式与写入范围。这不代表实现完成，也不替代 spec 批准；不批准 D-01、D-02 的具体内容。

08（D-01）与 10（D-02）的执行方式为“需用户”：关卡定稿需要用户的明确批准。本次批准没有预先授权 agent 定稿这两个关卡；若用户之后给出预先授权，协调者在此记录授权原话，并把这两项改为自动。

**2026-10-14 预先授权（关卡 08、10）：** 协调者在执行中就两个关卡的处理询问用户，用户不可用，回复原话为“The user is not available to respond and will review your work later. Work autonomously and make good decisions.”；此前用户在本任务的 spec 阶段也说明“如果有需要我回答的问题，就直接按你最推荐的答案”。协调者据此视为预先授权：08（D-01）与 10（D-02）改为自动，由 agent 按研究证据取推荐方案定稿，在对应 spec 的审批节如实记录为“按预先授权由 agent 定稿、待用户事后审阅”，不写成用户本人批准。用户之后审阅时如有异议，按正常流程修订 spec 与受影响的实现。

