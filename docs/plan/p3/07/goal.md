---
type: plan
status: accepted
phase: P3
task: "07"
updated: 2026-10-10
related: [ADR-0004, ADR-0006, ADR-0015, ADR-0017, B-005, B-006, U-008, U-009, U-011, U-021, U-022, U-027, U-031]
---

# P3-07：目标、武器、伤害与毁伤 — Goal

## 目标与来源

实现用户于 2026-10-09 批准的 [spec](./spec.md) 中的 S-01 至 S-12 与 AC-01 至 AC-17：

- 原版研究 Q-01 至 Q-12，事实写入 `docs/original/`；
- 三个[实施关卡](./spec.md#实施关卡)：D-01 共享字段与时序、D-02 连续行为容差、D-03 与 P3-06 的接口，各在依赖它的工作开始之前定稿并取得用户批准；
- 规则数据接入与战斗初值；目标与雷达；挂点、开火与发射；弹丸与导弹；命中与碰撞；伤害与子系统；能量与显示状态；停放对象的抽象交战；被毁、爆炸与碎片；
- `combat` 分区、领域事件、快照与 replay；真实内容本地核对；原版预实验、正式运行与对照结论；文档与交接。

本文件不重新定义行为契约。共享字段的最终形状由 D-01 写入 [P3-02 spec](../02/spec.md) 后为准；本 goal 只规定由哪个子任务实现。

## 代码现状与前提

- **已有代码（P3-02、P3-03 交付）：**
  - 正式 Core：[pipeline.ts](../../../../src/core/systems/pipeline.ts) 的 19 阶段表中 `collision`、`delayed-player-explosion`、`energy`、`movement`、`parked-update` 的 `run` 为 null；`judgeCommands` 对所有命令给出 `rejected`/`not-implemented`；`leave()` 尚不处理玩家目标。
  - [entity-table.ts](../../../../src/core/world/entity-table.ts) 的 `Entity` 只有位姿、来源、名称、规则输入、状态、活动与被毁；`EntityPresentation` 只有 `model` 变体。[player-state.ts](../../../../src/core/world/player-state.ts)、[world-state.ts](../../../../src/core/world/world-state.ts)、[spawn.ts](../../../../src/core/systems/spawn.ts) 的实例化扩展点。
  - [projection.ts](../../../../src/core/projections/projection.ts) 的 `flight` 分区为 `not-implemented`，`FlightResourceName` 与 `WeaponRecordReference` 为 `never`；[render-state.ts](../../../../src/core/projections/render-state.ts)。
  - [domain-events.ts](../../../../src/core/contracts/domain-events.ts) 只有 `command-result` 与 `object-instantiated`；[limits.ts](../../../../src/core/contracts/limits.ts) 的 `CORE_LIMITS`。
  - [snapshot.ts](../../../../src/core/replay/snapshot.ts) 的写入器由类型检查强制覆盖每个成员；[compare.ts](../../../../src/core/replay/compare.ts) 的事件字段表；[rules-version.ts](../../../../src/core/replay/rules-version.ts) 为 1；[replay.ts](../../../../src/core/replay/replay.ts) 的 `ReplayContent` 为 `createWorld` 输入去掉 `run`；[create-world.ts](../../../../src/core/world/create-world.ts) 只接收三份逻辑 Asset。
  - 规则辅助：[float32.ts](../../../../src/core/rules/float32.ts)、[original-random.ts](../../../../src/core/rules/original-random.ts) 的 `RandSource`、[placement.ts](../../../../src/core/rules/placement.ts)。
  - 内容读取器：[craft-info.ts](../../../../src/content/rule-data/craft-info.ts)、[debris-parameters.ts](../../../../src/content/rule-data/debris-parameters.ts)、[flight-data-readers.ts](../../../../src/content/flight/flight-data-readers.ts) 的 `readExplosionTable`/`readExplosionAnimation`（读对象）；[effect-payload.ts](../../../../src/content/effects/effect-payload.ts) 的 `readEffectPayload` 与 [model-payload.ts](../../../../src/content/models/model-payload.ts) 的 `readModelPayload`（读规范字节）。
  - 测试辅助：Core 的 [create-world.test-support.ts](../../../../src/core/world/create-world.test-support.ts)、[world.test-support.ts](../../../../src/core/world/world.test-support.ts)、[replay.test-support.ts](../../../../src/core/replay/replay.test-support.ts)；内容的 [rule-data.test-support.ts](../../../../src/content/rule-data/rule-data.test-support.ts)、[flight-data.test-support.ts](../../../../src/content/flight/flight-data.test-support.ts)、[effects.test-support.ts](../../../../src/content/effects/effects.test-support.ts)、[models.test-support.ts](../../../../src/content/models/models.test-support.ts)。
  - 工具：[tools/baseline/](../../../../tools/baseline/) 的运行时测量（[指南](../../../guides/runtime-measurement.md)）；[logic-check.ts](../../../../tools/logic-check.ts) 与 [package-check.ts](../../../../tools/package-check.ts) 是本地真实内容核对的先例。
- **计划新增：** `src/core/systems/` 与 `src/core/rules/` 下按规则族命名的模块及相邻测试（文件名见各 subtask，可在实现时调整，职责不变）；`src/core/projections/combat.ts`；`src/core/world/rule-data.ts`；战斗行为文档 `docs/original/behavior/B-008-combat-rules.md`（创建时若编号已被占用，取下一个未用编号）；被忽略的 `local/research/p3-07/<主题>/`。
- **跨任务前提：**
  - P3-02、P3-03 已完成（各自 goal 全部 completed），本 goal 消费其契约与导入内容。
  - **P3-06（spec 与 goal 已获批，正在分支 `p3-06-flight-motion-spec` 上并行执行）：** 两任务修改同一共享契约与 Core 文件。为避免两套并行的类型与 P3-02 修订：
    - 08 开始前，P3-06 的检查点 A（其子任务 06）须已提交；协调者把 P3-06 分支合并到本 goal 分支，08 在其修订上增补（见 08）。
    - 11、12 开始前，协调者再次合并 P3-06 分支，至少包含其子任务 09（世界创建输入）与 10（飞行状态与实例化）；11、12 在这些类型上扩展，不另建 `craftInfo`、目标引用或版本号。
    - 合并由协调者以普通合并提交完成，冲突只在协调者 checkout 中解决；不把本分支合并到 P3-06 分支。
  - 22 需要移动阶段的遍历、模式 0/3 积分、速度状态与停放更新调度。08 按 D-03 决定接口与归属：若 D-03 确定某部分由 P3-07 先建，22 的该部分不等待 P3-06；其余部分须等 P3-06 的相应交付集成到当前分支。前提未满足时 22 按 execute-goal 记为 blocked，恢复条件写明所缺的 P3-06 交付。24、25、27、28 与最终对齐依赖 22。
  - P3-11 尚未实现：本 goal 只交付领域事实与具名待处理状态，不宣称任务计数、救援或失败已运行。
- **环境（起草时核对）：**
  - 本 worktree 没有 `node_modules`：执行前运行 `pnpm install --frozen-lockfile`。
  - `local` 已链接到主仓库的 `local/`；Ghidra 项目在 `local/ghidra/srangers`，一律 `-noanalysis -readOnly`，在 `local/research/p3-07/<主题>/` 中使用私有只读副本，不 `-overwrite`。
  - DOSBox-X 基准环境同一时间只有一个会话操作（工具在 `local/research/` 上加锁）。
- **原版证据：**
  - 01 至 07 由 agent 用只读 Ghidra 与本地数据取得。01 至 06 只把结论写入各自的 `local/research/p3-07/<主题>/findings.md`，由 07 统一写入 `docs/original/`。这样它们不共享跟踪文件，可以并行。spec 起草时从本地反编译导出读到的线索未核对原生指令，研究须按原生指令核实，不把线索当作事实。
  - 09 与 26 需要在所选任务中射击、被击中与被毁。P3-01、P3-02 实测本机 Computer Use 无法向 DOSBox-X 送达按键或移动游戏内光标，因此标为需用户：用户只做键盘操作，agent 负责方案、配方、运行、读数、判定与记录。执行时若该限制已解除，协调者改为自动。
  - 达不到 spec 门槛的研究项按 spec 阻塞，不按猜测实现。

## 验收覆盖

| Spec 范围项/验收项 | 实现子任务 | 验证子任务及方法 |
| --- | --- | --- |
| S-01 | 08、11 | 08：P3-02 修订获批；11：类型、序列化、比较器与版本的 Node 测试；29：契约与 spec、P3-02 一致 |
| S-02 | 12 | 12：规则数据输入、语义校验、载入变换与战斗初值的 Node 测试；25：真实内容 |
| S-03 | 13、23 | 13：目标与雷达的 Node 测试；23：`combat` 分区的消费者契约测试 |
| S-04 | 14 | 14：挂点、选择、开火与发射的 Node 测试 |
| S-05 | 17、20、22 | 17、20：弹丸运动与导弹制导的规则测试；22：经正式流水线与共用积分的集成测试 |
| S-06 | 17、19、22 | 17、19：命中与碰撞几何的规则测试；22：移动阶段中的命中集成测试 |
| S-07 | 15 | 15：伤害门禁、护盾、船体、子系统与击杀计数的 Node 测试 |
| S-08 | 16、22、23 | 16：能量、档位、页面与命令的 Node 测试；22：速度消耗接线；23：分区资源读数 |
| S-09 | 21、22 | 21：`0x30150` 规则的 Node 测试；22：停放更新接线 |
| S-10 | 18 | 18：爆炸、EXPL 选择、碎片与到期的 Node 测试 |
| S-11 | 01–07、09、10、26、27 | 01–07：Q-01 至 Q-12 写入 `docs/original/`；09、10：D-02；26：正式原版运行；27：R-06 至 R-10 的结论 |
| S-12 | 28 | 28：Core 模块说明、源码结构与交接；29：链接与元数据 |
| AC-01 | 08、11 | 11：边界测试、合成测试不改、版本拒绝；29：`pnpm check` |
| AC-02 | 12 | 12：创建与每类拒绝、limit/limit+1、setupHash 规范文本 |
| AC-03 | 13 | 13：每个候选筛选、并列、模式切换、前方判定与失效的独立期望测试 |
| AC-04 | 13、23 | 23：分区各判别、雷达、资源与武器读数、冻结与纯度 |
| AC-05 | 12、14 | 12：实例化与供救援复用的初始化；14：列表循环、单项与不可用挂点 |
| AC-06 | 14 | 14：逐命令判定、冷却边界、原因码、发射时机与 `shot-fired` |
| AC-07 | 17、20、22 | 17、20：规则分支；22：正式流水线与共用积分的集成 |
| AC-08 | 17、19、22 | 17、19：几何与过滤的独立期望；22：高速弹丸在流水线中的命中与漏过 |
| AC-09 | 15 | 15：门禁、支持集与原像计数、倍率路径、击杀归因 |
| AC-10 | 16、22 | 16：初值、间隔、档位与耗尽；22：速度阈值经 P3-06 接线 |
| AC-11 | 21、22 | 21：规则与抽取次序；22：调度接线、停放/活动切换不重复结算 |
| AC-12 | 18 | 18：创建与移除时刻、EXPL 选择、碎片与逃生舱 |
| AC-13 | 24 | 24：连锁、单次死亡、归因、待处理状态、快照完整、replay 与上限 |
| AC-14 | 25 | 25：本地真实内容两种僚机配置的私有核对 |
| AC-15 | 01–07、26 | 01–07：事实与 U 项；26：运行时确认；29：`pnpm check:compliance`、git 审阅 |
| AC-16 | 09、10、26、27 | 10：判据获批；26：≥2 次合格运行；27：单次转移与连续行为的结论 |
| AC-17 | 28 | 28：模块说明与交接；29：`pnpm check`、链接与 `updated:` |

## 子任务跟踪

状态只在此维护：`pending` / `in-progress` / `blocked` / `completed`。依赖项全部 completed 后才能开始；验收结果和证据写在相应 subtask 文档，不在阶段索引重复状态。并行执行时，本表与执行记录只由协调者修改。

| 子任务 | 依赖 | 状态 |
| --- | --- | --- |
| [01-targeting-radar-research.md](./subtasks/01-targeting-radar-research.md) | — | in-progress |
| [02-weapons-firing-research.md](./subtasks/02-weapons-firing-research.md) | — | completed |
| [03-motion-hit-collision-research.md](./subtasks/03-motion-hit-collision-research.md) | — | in-progress |
| [04-damage-energy-research.md](./subtasks/04-damage-energy-research.md) | — | pending |
| [05-parked-engagement-research.md](./subtasks/05-parked-engagement-research.md) | — | pending |
| [06-destruction-fragments-research.md](./subtasks/06-destruction-fragments-research.md) | — | pending |
| [07-interfaces-camera-numerics-research.md](./subtasks/07-interfaces-camera-numerics-research.md) | 01, 02, 03, 04, 05, 06 | pending |
| [08-shared-contract-gate.md](./subtasks/08-shared-contract-gate.md) | 01, 02, 03, 04, 05, 06, 07 | pending |
| [09-original-pilot-runs.md](./subtasks/09-original-pilot-runs.md) | 02, 03, 04, 06 | pending |
| [10-tolerance-gate.md](./subtasks/10-tolerance-gate.md) | 09 | pending |
| [11-contract-foundation.md](./subtasks/11-contract-foundation.md) | 08 | pending |
| [12-rule-data-combat-init.md](./subtasks/12-rule-data-combat-init.md) | 02, 04, 06, 11 | pending |
| [13-targeting-sensing.md](./subtasks/13-targeting-sensing.md) | 01, 12 | pending |
| [14-weapons-firing.md](./subtasks/14-weapons-firing.md) | 02, 12 | pending |
| [15-damage-subsystems.md](./subtasks/15-damage-subsystems.md) | 04, 12, 14 | pending |
| [16-energy-displays.md](./subtasks/16-energy-displays.md) | 04, 12 | pending |
| [17-projectile-hits.md](./subtasks/17-projectile-hits.md) | 03, 14, 15, 18 | pending |
| [18-destruction-fragments.md](./subtasks/18-destruction-fragments.md) | 06, 07, 12, 15 | pending |
| [19-collisions.md](./subtasks/19-collisions.md) | 03, 15, 18 | pending |
| [20-missile-guidance.md](./subtasks/20-missile-guidance.md) | 03, 14, 15 | pending |
| [21-parked-engagement-rule.md](./subtasks/21-parked-engagement-rule.md) | 05, 14, 15 | pending |
| [22-p3-06-joint-integration.md](./subtasks/22-p3-06-joint-integration.md) | 08, 16, 17, 18, 19, 20, 21 | pending |
| [23-combat-partition.md](./subtasks/23-combat-partition.md) | 13, 14, 15, 16 | pending |
| [24-chains-replay-limits.md](./subtasks/24-chains-replay-limits.md) | 22, 23 | pending |
| [25-real-content-check.md](./subtasks/25-real-content-check.md) | 24 | pending |
| [26-original-formal-runs.md](./subtasks/26-original-formal-runs.md) | 07, 10 | pending |
| [27-comparison-conclusions.md](./subtasks/27-comparison-conclusions.md) | 24, 26 | pending |
| [28-docs-handoff.md](./subtasks/28-docs-handoff.md) | 25, 27 | pending |
| [29-final-alignment.md](./subtasks/29-final-alignment.md) | 01, 02, 03, 04, 05, 06, 07, 08, 09, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28 | pending |

最后一行始终为最终对齐验证，依赖所有其他子任务。ID 分配后保持不变；新增修复项使用新 ID，插入最终验证之前并加入其依赖，不要求最终验证拥有最大的数字。

## 执行记录

- **2026-10-10 — 并行执行的 worker 分支：** 本宿主的 `create_session` 不能在协调者指定的文件夹中启动会话，因此 worker 不使用 `exec/p3-07-NN` 分支与 `<primary>.worktrees/exec-p3-07-NN` 目录，而是使用应用为每个 worker 会话创建的 worktree 与分支（基于认领提交，`local` 由仓库的会话脚本链接）。其余照 execute-goal 的并行规则：协调者认领、逐个以 `Worker-Commit:` 拖车集成并清理。协调者在本会话中记录子任务与 worker 会话、分支的对应关系。
- **2026-10-10 — 以 P3-06 为共享契约的基础：** P3-06 的 spec 与 goal 已获批并在并行执行，其检查点 A 修订 P3-02，其子任务 09、10 实现 `craftInfo` 输入、实体飞行状态与玩家目标引用。按用户授权取推荐方案：08 等待并合并 P3-06 的检查点 A，11、12 等待并合并 P3-06 的 09、10，本任务在其上增补（见跨任务前提）。依赖不变；等待期间按 execute-goal 记为 blocked，写明恢复条件。

## 审批

用户于 2026-10-09 修改本 goal 的审批节后明确批准（“i made some change. approve and commit”）。批准范围：上述 29 个子任务及其依赖、写入范围与执行方式，以及下文的执行约定。这不代表实现完成，也不替代 spec 批准。

按用户本次修改的约定，08、10 的执行方式由“需用户”改为“自动”：D-01 至 D-03 由 agent 按预先授权批准最推荐的方案，并记录授权出处。09、26 仍为“需用户”，因为它们需要在 DOSBox-X 中做键盘操作，与批准无关。

**执行中新增的子任务（用户 2026-10-09 决定）：** 用户在批准 spec 与生成本 goal 时决定（“我们可能会在 execute goal 的过程中增加新的 subtasks，新增的 subtasks 不需要 review，直接 unblock”）：执行中由协调者新增的子任务（拆分、补充研究、修复或分批的关卡）无需另行审阅或批准，按新 ID 加入跟踪表，状态为 `pending`，依赖全部 completed 后即可执行，不设为 `blocked` 等待批准。新增子任务仍须在已批准 spec 的范围内，并按 execute-goal 的规则写明写入范围与执行方式；需要改变 spec 契约，或定稿 D-01 至 D-03 的具体内容时，也不需要用户批准，直接批准最推荐的方案。
