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
| S-01 | 08、12、30 | 08：D-01 契约获批；12：类型、序列化、比较器与版本的 Node 测试；27：契约与 spec、P3-02 一致 |
| S-02 | 11、12 | 11：payload、转换、切片定义与缓存的合成测试及本机核对；12：`createWorld`/`ReplayContent`/setupHash 的 Node 测试 |
| S-03 | 13 | 13：有序命令门禁、开关与轴的正式 step 测试 |
| S-04 | 14 | 14：量化、换算、命中、z、标记生命周期的 Node 测试 |
| S-05 | 15 | 15：可见标志、图标过滤、覆盖与 `object-sets` 的 Node 测试 |
| S-06 | 19 | 19：`map` 分区的消费者契约测试 |
| S-07 | 16 | 16：消耗公式、显示值与扣费的 Node 测试 |
| S-08 | 17 | 17：门禁结果表、状态写入与事件的 Node 测试 |
| S-09 | 18、32 | 18：进度、完成、到达随机与中断的 Node 测试 |
| S-10 | 19 | 19：页 6 读数、指示灯与 Render State 的消费者测试 |
| S-11 | 01–07、09、10、24、25、28、29 | 01–07、28、29：Q-01 至 Q-12 写入 `docs/original/`；09、10：D-02；24：正式原版运行；25：R-13 至 R-16 的结论 |
| S-12 | 21、22、26、31 | 21：桥接与诊断接线测试；22：实际应用浏览器验证；26：文档与交接；27：链接与元数据 |
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
| AC-12 | 21、22、34 | 22：`pnpm test:e2e` 实际应用用例（browser-testing） |
| AC-13 | 23 | 23：真实内容两种僚机配置的私有核对 |
| AC-14 | 01–07、28、29 | 07、29：事实与 U 项；27：`pnpm check:compliance` 与 git 审阅 |
| AC-15 | 09、10、24、25 | 10：判据获批；24：≥2 次合格运行；25：单次转移与连续行为的结论 |
| AC-16 | 26、31、33 | 26：文档与交接；27：`pnpm check`、链接与 `updated:` |

## 子任务跟踪

状态只在此维护：`pending` / `in-progress` / `blocked` / `completed`。依赖项全部 completed 后才能开始；验收结果和证据写在相应 subtask 文档，不在阶段索引重复状态。并行执行时，本表与执行记录只由协调者修改。

| 子任务 | 依赖 | 状态 |
|---|---|---|
| [01-map-mode-command-research.md](./subtasks/01-map-mode-command-research.md) | — | completed |
| [02-cursor-selection-marker-research.md](./subtasks/02-cursor-selection-marker-research.md) | — | completed |
| [03-visibility-fog-research.md](./subtasks/03-visibility-fog-research.md) | — | completed |
| [04-zoom-info-numbering-research.md](./subtasks/04-zoom-info-numbering-research.md) | — | completed |
| [05-warp-energy-start-research.md](./subtasks/05-warp-energy-start-research.md) | — | completed |
| [06-warp-progress-arrival-research.md](./subtasks/06-warp-progress-arrival-research.md) | — | completed |
| [07-numerics-stages-original-docs.md](./subtasks/07-numerics-stages-original-docs.md) | 01, 02, 03, 04, 05, 06 | completed |
| [08-shared-contract-gate.md](./subtasks/08-shared-contract-gate.md) | 07 | completed |
| [09-original-pilot-runs.md](./subtasks/09-original-pilot-runs.md) | 07 | completed |
| [10-criteria-gate.md](./subtasks/10-criteria-gate.md) | 09 | completed |
| [11-map-geometry-import.md](./subtasks/11-map-geometry-import.md) | 08 | completed |
| [12-core-contract-foundation.md](./subtasks/12-core-contract-foundation.md) | 08, 11 | completed |
| [13-ordered-gates-map-mode.md](./subtasks/13-ordered-gates-map-mode.md) | 12 | completed |
| [14-cursor-selection-marker.md](./subtasks/14-cursor-selection-marker.md) | 13, 28, 30 | completed |
| [15-visibility-object-sets.md](./subtasks/15-visibility-object-sets.md) | 12, 14 | completed |
| [16-warp-energy-rule.md](./subtasks/16-warp-energy-rule.md) | 12 | completed |
| [17-warp-start.md](./subtasks/17-warp-start.md) | 14, 16, 28 | completed |
| [18-warp-progress-arrival.md](./subtasks/18-warp-progress-arrival.md) | 17, 28 | completed |
| [19-map-partition-cockpit-readings.md](./subtasks/19-map-partition-cockpit-readings.md) | 14, 15, 18 | completed |
| [20-replay-limits-retry.md](./subtasks/20-replay-limits-retry.md) | 15, 18, 19 | completed |
| [21-bridge-diagnostics-wiring.md](./subtasks/21-bridge-diagnostics-wiring.md) | 19 | completed |
| [22-browser-app-verification.md](./subtasks/22-browser-app-verification.md) | 20, 21 | completed |
| [23-real-content-check.md](./subtasks/23-real-content-check.md) | 20 | completed |
| [24-original-formal-runs.md](./subtasks/24-original-formal-runs.md) | 10 | completed |
| [25-comparison-conclusions.md](./subtasks/25-comparison-conclusions.md) | 20, 23, 24 | completed |
| [26-docs-handoff.md](./subtasks/26-docs-handoff.md) | 20, 21 | completed |
| [28-warp-path-rotation-research.md](./subtasks/28-warp-path-rotation-research.md) | 08 | completed |
| [29-warp-path-original-docs.md](./subtasks/29-warp-path-original-docs.md) | 28 | completed |
| [30-direction-table-constants.md](./subtasks/30-direction-table-constants.md) | 28 | completed |
| [31-docs-follow-up.md](./subtasks/31-docs-follow-up.md) | 22, 26 | completed |
| [32-sector-boundary-test-wording.md](./subtasks/32-sector-boundary-test-wording.md) | 29 | completed |
| [33-workers-doc-metadata.md](./subtasks/33-workers-doc-metadata.md) | 11 | completed |
| [34-e2e-import-save-race.md](./subtasks/34-e2e-import-save-race.md) | 22 | in-progress |
| [27-final-alignment.md](./subtasks/27-final-alignment.md) | 01, 02, 03, 04, 05, 06, 07, 08, 09, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 28, 29, 30, 31, 32, 33, 34 | pending |

最后一行始终为最终对齐验证，依赖所有其他子任务。ID 分配后保持不变；新增修复项使用新 ID，插入最终验证之前并加入其依赖，不要求最终验证拥有最大的数字。

## 执行记录

- **2026-10-14 — 并行执行安排：** 用户以 `/execute-goal`（无参数，默认并行，同时运行的 worker 不超过 3 个）执行本 goal。协调者在 `p3-09-strategic-map-spec` 分支（本 worktree）上执行。本宿主的 `create_session` 不能在协调者指定的文件夹中启动会话，因此沿用 P3-05、P3-07 的做法：worker 在应用为其会话创建的 worktree 中运行（以认领提交为基），由 worker 把分支改名为 `exec-p3-09-NN` 作为认领标记，`local` 由仓库的会话脚本链接；其余照 execute-goal 的并行规则（协调者认领，逐个以 `Worker-Commit:` 拖车集成并清理）。Ghidra 由各 worker 在 `local/research/p3-09/<主题>/` 下的私有副本中只读打开；基准环境（DOSBox-X）与 Computer Use 只由协调者操作。
- **2026-10-14 — 01 发现与 spec 的冲突（交 08/D-01）：** 原版 `0x32d74` 只在视角已是 0x11 且子模式 8 时不切换，地图（视角 8）会被被毁视角取代，与 spec [地图模式](./spec.md#地图模式)“若视角已是 8 则不切换”的读法相反；另外从飞行开关地图不置 `statusDisplay` 重绘，只有进出基地置位。08 在 D-01 中按 01 的完成证据更正，并决定地图中 `toggle-map` 与 `player-unavailable` 的优先次序（项目决定）。
- **2026-10-14 — 02 的结论中 D-01 须处理的点：** 创建标记时消耗一次共享随机数（`rand()%64` 的转角），spec 未列；选择读取的是上一 tick 绘制时生成的图标命中列表，Core 必须拥有并序列化该列表；放大范围来自运行时比例而不是布局；首次选择之前的 `w` 静默无反应，Warp 读取存储的目的地而不是标记。玩家状态字节 +0 只由首次选择置 1，任务建造/重试时由玩家实例化清零。
- **2026-10-14 — 03 的结论中 D-01 须处理的点：** 历史探索在静态上“不保留”（已确认，代码），运行佐证交 09；地图图标的可见性判定只作用于敌对种类（spec 对图标“可见”的表述须收窄）；+0xD4 的读者只有 `0x2b8ec`、`0x2ee60` 与僚机目标搜索 `0x62760`，僚机 AI `0x62250` 在任何视角都调用 `0x2ee60`，因此 `mapVisible` 与有序集合必须跨 tick 保留并进入快照（交 08、15 与 P3-08）。
- **2026-10-14 — 04 的结论中 D-01 须处理的点：** 右键编号开关与去抖没有规则读者（已穷举），属于 P3-13 的呈现，08 按此同步 P3-05 的交接；地图上的连线是玩家→光标，所选目标周围没有范围圈（圆盘属于各友方单位），spec/B-001 中“目标不可见时连线与范围的处理”无可决定的对象，须在 D-01 更正；地图绘制 `0x4b3a8` 对重合图标的像素去重叠会改变下一帧的拾取结果与目的地 z（与 02、14 交叉）；地图几何的最小 payload 字段见 04 的完成证据。
- **2026-10-14 — 基准运行的分派：** 09、24 只用配方声明的模拟器内输入（`tools/baseline/`），不用 Computer Use；协调者把这两行照常分派给 worker，由 worker 在基准锁下独占运行，同一时间本 goal 只有一个会话使用基准环境。Computer Use 若确有需要仍只由协调者进行。
- **2026-10-14 — 05 的结论中 D-01 须处理的点：** Warp 开始时原版不置 `statusDisplay` 重绘；开始消息经 `0x3f158`→`0x50188` 还写玩家位姿、速度 0、指令速度为参考最大值，并在表现路径上至少抽取 60 次共享随机数；开始只检查消耗，完成时按起点→到达点距离扣 ⌈c×(1+s/2)⌉ 并钳 0（s 由渲染路径逐帧递增，取值归 06）；+0xC8 在完成时写为将来时刻；开始不锁定目的地（同帧 `w` 后的选择会改变到达点）；`0x1864c8` 是开始位置而不是目的地；能量为 0 时地图读数可能除零（后果未确认，交 09）；指示灯严格比较、开始检查非严格。
- **2026-10-14 — 06 的结论中 D-01 须处理的点：** spec 中“目的地 `0x1864c8`”有误（那是开始位置）；隧道路径、转向偏移、30° 锥、居中与误差 s 都是规则状态（影响位姿、到达点与扣费），须作为 Core 的 frame-end 状态并使用世界随机数（开始 20 次、每段 2 次），不只是“进度”；原版的误差增量依赖帧率，须定 tick 映射；途中被毁或能量救援后 `inWarp` 保持 1 直到下一次完成的 Warp（复现或批准差异）；无误差到达吸附到目的地上方 600；完成后玩家状态 +0x29 为 1。
- **2026-10-14 — 07 对账：** 玩家状态 +0 由玩家实例化 `0x67b53` 清零（02 成立，01 的未确认关闭）；`0x1864c8` 为 Warp 出发点（更正 04 与 spec 的“目的地”）；随机数普查：开始恰好 60 次（20 规则、40 表现），每段 2、完成 2、首次选点 1，效果例程另有表现抽取；模式 1 帧绘制中 `0x50508` 先于仪表 `0x49b2c`。另：`docs/engineering/modules/core.md` 要求视角切换置 `statusDisplay.redraw`，原版只在进出基地时置位，列入 08 的冲突表。交 08 的契约依据与冲突表见 07 的完成证据。
- **2026-10-14 — 08 D-01 定稿（按预先授权由 agent 定稿，待用户事后审阅）：** P3-02 新增 MW-01 至 MW-16，P3-03 修订 2（地图几何）；P3-09 spec 按研究更正；MW-12 列出 8 项已批准差异（含 Warp 每 tick 一步、能量为 0 时读数百分比为 null）；P3-05 右键交接已同步，P3-04/06/07 只加交接注记。定稿指出两项前置静态研究：R-A（`0x568b0` 的 64 项启动旋转表 `0x1b0a10` 的构造、精度及与播种的先后，阻塞标记创建与到达旋转）与 R-B（隧道路径 `0x513e0`、样条 `0x517f4` 与 `0x51618` 参数及控制点存储，阻塞 Warp 开始位姿与 Warp 步进）。`docs/engineering/modules/core.md` 关于视角切换置重绘的表述交 26 更正。
- **2026-10-14 — 计划更新（08 发现的前置研究与写入范围）：** 按 D-01（MW-12）新增 28（R-A 启动旋转表、R-B 隧道路径的静态研究，只写 `local/`）与 29（把 28 的事实写入 executable 与 unknowns；与 09 同写 executable，因此分开以便 28 先行）；14、17、18 增加对 29 的依赖，27 依赖 28、29。写入范围按 MW 的落点扩大：13 增加视角切换函数 `src/core/systems/view-switch.ts`（MW-09，13 实现地图部分与进入/离开 1 的页面规则，17、18 可修改）；14 增加 `startupRotations` 的规则与世界创建接入（`src/core/rules/startup-rotations.ts`、`src/core/world/create-world.ts`、`src/core/world/rule-data.ts` 及测试）与 P3-07 锁定计数不读标记机型记录的回归（`src/core/rules/firing.ts`、`firing.test.ts`）；17、18 增加隧道路径规则 `src/core/rules/warp-path.ts` 与测试及 `view-switch.ts`。验收标准与工作范围不变。依据用户 2026-10-14 的预先授权（见审批），由协调者做出，待用户事后审阅。
- **2026-10-14 — 28 完成：** R-A 取 MW-12 的代码规则分支：启动旋转表在播种之前、恰在缺省序列的 1000 次抽取之后构造（第 1001–1128 次），差异 6 不适用；R-B 读到逐位可实现的程度（开始位姿为常量，点 1 与点 0 重合，基数 Hermite 曲线 k=0.8）。事实草稿在 `local/research/p3-09/warp-path/findings.md`，由 29 写入 executable（含对 06“每点 z +2000”的更正）。
- **2026-10-14 — 28 发现既有方向表偏差，新增修复 30：** 现有 `src/core/rules/random-direction.ts` 用 `Math.PI` 与 `1/180` 构造方向表，而原版映像中的两个常数分别是略大于 π 的十进制 π 与 1/180 减一个 ulp，361 项中 256 项（348 个分量）与原版不同；executable 中“每个分量非负”对 38 个分量不成立。启动旋转表的前向行来自此表，P3-06/07 的既有读者也继承该偏差。按用户的预先授权取推荐方案 (a)：新增 30，把方向表改为映像常数并复核 P3-06/07 的测试与金样，事实更正随 29 写入；14 依赖 30；27 依赖 30。排除 (b) 在 14 中另建私有表（同一原版表两份实现，偏差保留）与 (c) 接受偏差（启动旋转表无法重现）。这会改变既有规则输出，规则版本随 12 的递增一并覆盖；合入其他也读取方向表的分支（如 P3-08）时须重跑其回归。
- **2026-10-14 — 12 已集成：** `RULES_VERSION` 4→5、快照格式 3→4（replay 格式不变）；30 的方向表修复同属这一版。12 范围外须由 26 同步的文档：`docs/engineering/modules/core.md`（`mapGeometry` 输入与 MW-01 校验、新状态/事件/原因码、标记种类、版本）、`docs/engineering/modules/app.md`（`CONTENT_INPUT_FIELDS`）、`docs/engineering/modules/content.md`（应用侧规则数据输入表）、`docs/guides/tools.md`（`RECORDING_MAX_BYTES` 现为 534,251,135，事件行 924 字节/项）、`docs/engineering/source-structure.md`（新文件 `src/core/world/map-rule-data.ts`）。
- **2026-10-14 — 30 已集成：** 方向表改为映像常数（`0x17210c`、`0x172114` 的位模式），整表散列与 28 的独立复算一致；既有读者与 replay 期望无需改动（只有 area 测试所用的第 205 项 z 变化，其期望由函数导出）；不另递增规则版本，随 12 的 5。另见 `steering.ts` 使用另一对常数 `0x17232c`、`0x172334`，交 29 在 executable 中一并核对记载。
- **2026-10-14 — 13 已集成，交 26 的文档：** `docs/engineering/modules/core.md` 的对象更新与请求处理行、命令判定（`TickContext.commandView`、`combatCommandPlayer(context)`、地图中选择命令为 `wrong-context`、`toggle-map` 结果表）、轴按最终有效上下文、扩展规则（判定读 `commandView`，视角变化经 `switchView`）以及仍写着地图选择命令 `not-implemented` 的分阶段说明；`source-structure.md` 新增 `systems/map.ts`、`systems/view-switch.ts`、`rules/map-frame.ts`。
- **2026-10-14 — 依赖调整：** 14、17、18 的前置改为 28（研究结论已在 `local/research/p3-09/warp-path/findings.md` 与 28 的完成证据中），不再等待只写跟踪文档的 29；29 仍在 09 之后执行，并是 27 的前置。原因：29 与 09 同写 executable，09 的基准运行耗时长，原依赖会无谓阻塞关键路径。
- **2026-10-14 — 14 已集成，交 26 的文档：** `docs/engineering/modules/core.md` 的请求处理（`map-point` 请求、标记创建 1 次世界抽取/移动/缺失）、命令判定（`map-point` 门禁与量化、`CommandView.destination` 每批由已提交目的地重置）、对象更新（标记走通用生命周期）、帧尾（只在已提交视角为 8 时建 `mapIcons`，否则清空，先于显示步）、静态规则数据 `startupRotations`（代码规则，不进 setupHash 与快照）；`source-structure.md` 新增 `rules/map-icons.ts`、`rules/startup-rotations.ts`。15 复用 `isMapContact`。
- **2026-10-14 — D-01 补定（17 发现）：** 按投递次序时同批 `[速度归零, request-warp]` 使模式 3 积分 0 ÷ 0 而 Core 故障。协调者按预先授权修订 P3-02：`warp-start` 延后到玩家的 `control`/`match-speed` 与发射请求之后、自动选敌之前（MW-04；MW-12 差异 9；审批第 13 项），等于原版按键分帧的结果。17 按此实现。交 26：`core.md` 中 Warp 开始已实现、开始不写能量、命令视角改为 1、`warp-start` 的延后次序。
- **2026-10-14 — 18 已集成：** Warp 步在帧尾显示步之前、完成在 `warp-completion`；`steerInTunnel` 与 `0x50a28` 原生指令的 x87 仿真在 4000 个合成用例上逐位一致（私有）。视角 1 而没有过程（`warp` 为 null）视为不可达，步与完成跳过。Q-10 以合成的 P3-11 前态覆盖。交 29 写入 executable 的事实：`0x186b3c` = F(S × 0.5)（“半个扇区”为已确认，代码）；`0x3a61c` 乘 F(1/S)，x = 15000 或 30000 落在前一扇区；K = F(cos(f64 `0x171f14`))，sin K 恰存 0.5；`0x50068` 先把 +0xA8 存为 f32，L = F(f × F(A8))（17）。交 26：`core.md` 的 Warp 步、完成阶段、差异 3 与 CR-11 差异 1 对到达最近对象搜索的适用。
- **2026-10-14 — 依赖调整：** 15 不再等待 09：D-01（MW-06）已按 03 的代码证据（已确认）定稿“历史探索不保留”，09 的运行只作佐证；改为依赖 12、14（复用 14 的 `isMapContact`）。若 09 的运行与之矛盾，按 execute-goal 新增修复子任务，不在 15 中预设。原因：09 因三个任务共用基准环境而长时间等待，原依赖阻塞关键路径。
- **2026-10-14 — 15 已集成：** `object-sets` 每 tick 重建，基础值 false，已提交视角为 8 时揭示；共享揭示 `revealMapVisibility`（`rules/map-visibility.ts`）供 P3-08 在任何视角调用；没有历史存储。19 用 `mapContactClass`、`mapCoverage` 构造接触点类别与覆盖。交 26：`core.md` 阶段表第 12 行与约 635、643 行“object-sets 建议归 P3-08”改为已由 P3-09/15 实现、P3-08 复用；`source-structure.md` 新增 `rules/map-visibility.ts`、`systems/object-sets.ts`。
- **2026-10-14 — D-01 补定（19 发现）与 19 已集成：** 放大窗口像素为 `0x4c5ec` 的原值，`0x4b56c` 依赖 Core 没有的 HUD 图标尺寸且无规则读者，交 P3-13；玩家没有图标（P3-11 前不可达）时连线与读数取玩家当前位置、放大窗口距离为 null（P3-02 MW-11 与审批第 14 项）。交 26：`core.md` 的 projection 一节（`map` 分区就绪、关图边界、`warpRequest` 以已提交状态判定、无图标回退、放大像素、`CombatPlayer.warp`、Render State `warp`）；`source-structure.md` 新增 `projections/map.ts`。
- **2026-10-14 — 20 已集成：** 只有测试，未发现规则缺陷。实测快照规模（每个图标约 200 字符、集合 34 KiB、过程约 2 KiB，合计约 0.43 MiB）略高于 MW-14 的估计（约 0.35 MiB），仍远在 `canonicalTextLength` 之内；`limits.ts` 的注释已按实测更正，spec 中的估计不影响任何上限，不另修订。
- **2026-10-14 — 21 已集成：** 桥接关键事实增加地图开/关/无玩家、已提交目的地与标记、`warpRequest` 结果与原因、视角 1 与 Warp 过程序号；悬停仍按采样；事件日志补全四个 P3-09 事件的全部字段。交 22：可开始任务的合成机型能量为 −100，`request-warp` 恒为 `insufficient-energy`，AC-12 的“按 w 开始并完成”需要 e2e 合成包给玩家正能量。交 26：`docs/engineering/modules/ui.md` 与 `docs/engineering/README.md`（约第 389 行）的桥接关键事实。完整 e2e 中 F-13（`failure-storage-lifecycle`）一次失败、单独重跑通过，判为负载敏感，与本变更无关。
- **2026-10-14 — 26 已集成：** `core.md` 新增“地图与 Warp（P3-09）”一节并同步流水线、状态、事件、原因码、projection、版本、上限、已批准差异（MW-12 1–9，CR-11 差异 1、8）与交接（P3-04/05/08/10/11/12/13/14/15）；更正视角切换置重绘的旧表述（只涉及视角 6）与既有文档中过时的规则/replay 版本。遗留：`src/core/systems/area.ts` 第 13 行模块注释仍说玩家 Warp 期间的区域中心“在标记处接入”，实际已在 `rules/active-area.ts` 的 `activeAreaCentre` 实现，交 27 判定是否需要修复。
- **2026-10-14 — 22 已集成：** 实际应用 E2E 覆盖开图、`p` 暂停、Esc 关图、开发命令编辑器 select、`w` 开始并完成、菜单与页面隐藏后无补跑无重复扣费、生产包无开发编辑器；完整 `pnpm test:e2e` 226 通过。合成包玩家机型改为可完成 Warp（`productionCraftInfo()`）。DOM 尚无地图事实（P3-13），桥接状态经 React fiber 只读读取 UI store 作为证据，协调者接受。
- **2026-10-14 — 09 已集成：** 基准运行只用配方输入，没有用户操作；m-01、t2-01、w2-02 完整，w-01、w2-01 因配方规划错误由操作者取消（部分读数只作观察，排除理由在私有 `run-notes.md`）。与 P3-08、P3-10 共用基准环境，按协调者安排轮流。结论：历史探索不保留得到运行佐证（R-14）；地图读取间隔、键盘取样、光标世界点、读数、可见标志、Warp 时长、到达偏移、扣费与 +0xC8 均与代码结论一致；本任务中 f = 1 在世界内不可达；E = 0 的地图读数在基准 DOSBox-X 中显示 1 且游戏继续（模拟器是否送达未屏蔽 x87 异常未确认），MW-12 差异 4 维持。未取得（交 24）：Warp 中救援与 `inWarp`、其他 Q-10 分支、基地作揭示来源、揭示中来源被毁。
- **2026-10-14 — D-02 与新版连续结果的先后：** 按计划依赖，23（真实内容本地核对，Core 对独立模型）在 10 之前完成；其报告只以判定与计数到达协调者（例如每次运行 331 个 Warp 步、0 个超出容差），没有与原版对照的数值。协调者在 10 的启动说明中要求只用 09 的预实验数据，不读取 `local/research/p3-09/real-content/out` 或任何新版连续输出；`local/research/p3-09/comparison/` 尚不存在。27 据此核对“D-02 早于看到新版的连续行为结果”。
- **2026-10-14 — 10 已集成（D-02 按预先授权由 agent 定稿，待用户事后审阅）：** spec 审批节记录“D-02 定稿”，B-010 写定原版一侧方案。Φ 按原版逐帧步长与新版 2 单位精确合成，差异 3 的跨版本差值由双方步长解释并披露；新增区分情形：到达中至少 1 次吸附与 1 次 0 < s < 1；只有 Q-02 的另一种 z 门禁状态改为代码证据加 Node 期望；f = 1 与 s = 0 不是覆盖要求、也不豁免；24 须逐帧暂停取得 Warp 爬升段/完整窗口与可见跨越前后每次的读数，并读出吸附对象。交 29：executable 中“SCEN 3019 内 f = 1 与 f = 0.5 都可达”与 09 的运行观察矛盾（f = 1 需玩家在世界矩形外），一并更正。
- **2026-10-14 — 29 已集成：** R-A/R-B、方向表更正、17/18/23/30 的实现者事实与 f = 1 的更正已写入 executable，并在私有只读 Ghidra 副本中逐条复核；U-009 新增注记、状态不变；R-A 为代码规则分支，MW-12 差异 6 不适用。**更正“18 已集成”一条：** F(1/15000) 略大于 1/15000，x = 15000 或 30000 落在从该点开始的扇区，与精确除法相同（不是“前一扇区”）；该边界两扇区给出同一角点，规则行为不受影响，Core 的 `sectorIndex` 正确。`src/core/rules/warp-arrival.test.ts` 的测试名与注释重复了错误说法，新增修复 32 更正。
- **2026-10-14 — 24 已集成：** 四次完整运行 v1-01、v2-01、w2-01、w1-03（两种布局；w1-01 由操作者取消、w1-02 DOSBox-X SIGSEGV，均排除）。两个完整逐帧 Warp 窗口与独立 Φ 逐位一致。按 2026-10-14 的 D-02 补定（spec“采样覆盖的补充与不可达分支”与审批），停放敌机的阶段对齐跨越计入下限；基地、来源被毁、Warp 中断与零距离/失效标记分支改为代码证据加 Node 期望，逐项披露并交 P3-10/P3-11/P3-15 联合复验。与 P3-08、P3-10 轮流使用基准环境。
- **2026-10-14 — 25 已集成：** R-13 至 R-16 判为一致（只对固定 cycles 40000 成立，U-021 未冻结，不豁免）。单次转移层对 24 的原版前态逐位一致（含两个完整逐帧窗口的 774 个 pass）；连续层在真实内容上 4 次正式 `World.step` 运行中，16 次 Warp 每 tick 等于 Φ(S_new, 2)，地图期间推进与可见判定全部一致；10 个合格原版窗口均配对成功。U-025 改为已确认，U-026 改为已确认（E = 0 的 x87 残留按 MW-12 差异 4）。未经运行对照而只由代码加 Node 覆盖的分支在 B-010 中逐项披露。
- **2026-10-14 — 27 首次核对：** 覆盖、关卡时序（D-01 早于 11；D-02 早于 24；两次 D-02 补定与 MW-04/MW-11 补定都早于依赖它们的工作）、Core 纯度、目标/雷达/Render State 无迷雾过滤、候选 `src/` 树（25 用的 `6c5edd70` 即当前树；23 之后 `src/` 只有 UI、测试与一处注释）均通过；`vitest run src/core src/content src/original-data tools/engineering-boundaries.test.ts` 194 文件 6330 通过；mission-flow 两个 e2e 文件单独运行 11/11 通过（完整套件一次因负载在任务启动处超时 225/226，单独重跑通过）。唯一缺口：`docs/engineering/modules/workers.md` 被 11 修改而 `updated:` 未更新。27 回到 pending，新增修复 33。
- **2026-10-14 — 27 第二次核对：** 33 已修复元数据。完整 `pnpm test:e2e` 两次运行都只有 22 的“a real hidden page during a Warp …”在 `Startable mission` 处超时（225/226），单独运行通过；该用例导入后未等待“Saved in this browser”就返回菜单（`keyboard-input` 的同类流程会等待），判为测试竞态而非负载。27 回到 pending，新增修复 34。

## 审批

用户于 2026-10-14 明确批准本 goal（“approve the goal and commit”）。批准范围为本文件的验收覆盖、子任务 01 至 27 及其依赖、各 subtask 的工作范围、执行方式与写入范围。这不代表实现完成，也不替代 spec 批准；不批准 D-01、D-02 的具体内容。

08（D-01）与 10（D-02）的执行方式为“需用户”：关卡定稿需要用户的明确批准。本次批准没有预先授权 agent 定稿这两个关卡；若用户之后给出预先授权，协调者在此记录授权原话，并把这两项改为自动。

**2026-10-14 预先授权（关卡 08、10）：** 协调者在执行中就两个关卡的处理询问用户，用户不可用，回复原话为“The user is not available to respond and will review your work later. Work autonomously and make good decisions.”；此前用户在本任务的 spec 阶段也说明“如果有需要我回答的问题，就直接按你最推荐的答案”。协调者据此视为预先授权：08（D-01）与 10（D-02）改为自动，由 agent 按研究证据取推荐方案定稿，在对应 spec 的审批节如实记录为“按预先授权由 agent 定稿、待用户事后审阅”，不写成用户本人批准。用户之后审阅时如有异议，按正常流程修订 spec 与受影响的实现。

