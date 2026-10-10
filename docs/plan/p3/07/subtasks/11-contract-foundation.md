---
type: plan
status: active
phase: P3
task: "07"
subtask: "11"
updated: 2026-10-10
---

# 11 — 共享契约基础与接入点

**契约来源：** [spec](../spec.md) 的 S-01、AC-01；技术决定 1、8、12；P3-02 spec 的 [P3-07 的契约修订](../../02/spec.md#p3-07-的契约修订d-01d-03)：[CR-02](../../02/spec.md#cr-02-实体的战斗状态d-01)、[CR-03](../../02/spec.md#cr-03-移动块的模式-12d-03)、[CR-04](../../02/spec.md#cr-04-玩家状态d-01)、[CR-05](../../02/spec.md#cr-05-命令原因码与内部请求d-01)、[CR-06](../../02/spec.md#cr-06-领域事件与次序d-01)、[CR-07](../../02/spec.md#cr-07-实例化扩展与系统流水线d-01d-03)（接入点）、[CR-12](../../02/spec.md#cr-12-projection-与-render-stated-01)、[CR-14](../../02/spec.md#cr-14-容量快照与版本d-01)；建立在 [P3-06 的契约修订](../../02/spec.md#p3-06-的契约修订检查点-a)之上。
**依赖：** 08。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **前提：** 按 goal 的跨任务前提，P3-06 的子任务 09、10 已合并到本分支。本项在其类型上扩展，不另建 `craftInfo`、玩家目标引用、`MovementBlock` 或版本号。
- **共享形状：** 按 CR 逐项实现类型、校验、冻结与序列化，不实现任何规则：
  - CR-02：`Entity` 与 `EntityInit` 的 `combat` 封闭联合（`craft`、`missile`、`projectile`、`explosion`、`fragment`），`combat.type` 与 `kindBit` 不符为 Core 故障；字段的范围与生命周期表中的约束；运行时种类的 P3-06 字段缺省与 `ai.objectTarget` 的收窄；`EntityPresentation` 的五个变体。
  - CR-03：把 P3-06 的 `MovementBlock` 改为联合，机体移动块不变，加入 `linear` 与 `spinning` 两个变体。已合并的 P3-06 代码中对 `mode` 的穷尽判断须覆盖新变体：在运动接入（22）之前，新变体在这些位置是不可达的 Core 故障。
  - CR-04：`PlayerState` 的 `targeting`、`followedEntity`、`delayedExplosionClock`、`kills`、`shots`、`heavyDamage`、`leftDisplay`、`statusDisplay` 及其初值；`targeting` 随玩家实体移除清空（与 P3-06 的 `control` 在同一位置），实例化时的写入归 12。
  - CR-05：`COMMAND_RESULT_REASONS` 增加九个原因码（`no-candidate`、`no-change`、`no-weapon`、`weapon-disabled`、`no-ammunition`、`insufficient-charge`、`cooldown`、`misfire`、`out-of-arc`）；`Request` 联合增加 `select-target`、两种 `launch`、`steer`、`expire`、`release-held`、`hand-off`，以及 `ShotTrigger`、`ControlBlock`、`AxisControl`。
  - CR-06：14 种领域事件与 `Attacker` 联合；比较器的事件字段表逐字段覆盖。
  - CR-12：战斗组是 P3-06 的 `flight: { motion, combat }` 中的 `flight.combat`，不是独立分区。本项定义 `FlightCombat`、`CombatPlayer`、`CombatTarget`、`RadarContact`、`WeaponListReading`，把 `FlightResourceName` 与 `WeaponRecordReference` 从 `never` 改为定稿形状；战斗组一律为 `{ readiness: 'not-implemented' }`，就绪内容归 23。Render State 增加 `clock`，每个实体增加 `hitShimmerStart` 与 `explosionStart`，并按新的表现联合提取。
  - CR-14：`CORE_LIMITS.eventsPerTick` 改为 32,768；新增 `requestsPerTick` = 16,384，`RequestQueue` 改用它，不再借用事件上限；依据注释按 CR-14 的上界表。快照写入器覆盖每个新成员（类型检查强制）。快照格式版本与 `RULES_VERSION` 相对合入时的当前值各递增一次，不硬编码数字；本 goal 此后的规则变化沿用这一版本。replay 记录形状与格式版本不变，旧规则版本的记录仍被拒绝。录制在每个 tick 之前预留 `eventsPerTick` 个事件的规则不变，可用的事件总量随新上限变化。
- **接入点：** 把 [pipeline.ts](../../../../../src/core/systems/pipeline.ts) 与 P3-06 的玩家更新中本任务需要接入的位置改为静态调用各规则族模块的导出（CR-07），使 13 至 21 只修改各自的模块：
  - 命令判定按命令类型把 P3-07 的六种命令分派到 `targeting.ts`、`weapons.ts`、`energy.ts`；P3-06 的命令不变。
  - 玩家更新中两处静态调用：P3-06 的失效目标清除之后、速度辅助之前，调用 `weapons.ts` 的导弹锁定（14 实现）；命令批次与轴的变化检测之后，调用 `targeting.ts` 的自动选敌（13 实现）。
  - 按种类的对象更新分派到 `missiles.ts`、`projectiles.ts` 与 `destruction.ts`（爆炸与碎片）。
  - 新请求类型的处理分派到对应模块：`select-target` → `targeting.ts`；`launch` → `weapons.ts`；`steer` 与导弹的 `expire` → `missiles.ts`；弹丸的 `expire` → `projectiles.ts`；碎片的 `expire`、`release-held`、`hand-off` → `destruction.ts`。种类 22 的 `set-state` 请求转到 `destruction.ts` 的爆炸激活入口。
  - `collision`、`delayed-player-explosion`、`energy`、`frame-end` 阶段的 `run` 分别由 `collision.ts`、`destruction.ts`、`energy.ts`、`displays.ts` 导出。
  - 参照目标的只读查询（CR-05：本 tick 由先前命令投递而尚未应用的最后一个 `select-target` 的目标，没有时为玩家目标），供 13、14 共用。
  本项创建这些模块并保持现有行为：P3-07 的命令仍为 `rejected`/`not-implemented`，阶段的 `run` 仍为 null，新请求类型没有投递者，玩家更新中的两处调用不改变状态，不写假系统。`leave()` 不调用目标模块：停放与移除时的目标清除归 P3-06，清除不发事件（CR-06）。`movement` 与 `parked-update` 阶段的接入不在本项（22）。
- **测试：**
  - 新形状的校验、冻结与序列化；快照文本与比较器覆盖每个新成员。
  - `eventsPerTick` 与 `requestsPerTick` 的 limit 与 limit + 1；旧规则版本的 replay 被拒绝。
  - 按获批变化更新既有断言（版本号、战斗组的判别、上限值、录制可用的事件总量），保留纯度、原子拒绝、生命周期与输出冻结的不变量；合成 Core 的测试不改。

## 不包含

- 规则数据输入与 setupHash（12）；任何规则行为（13 至 22）；战斗组的就绪内容（23）；`movement` 与 `parked-update` 的接入（22）。
- 修改 P3-02 spec（08）；改变 P3-06 的运动组形状或其规则。

## 关键文件与契约

- 现有：[domain-events.ts](../../../../../src/core/contracts/domain-events.ts)、[limits.ts](../../../../../src/core/contracts/limits.ts)、[entity-table.ts](../../../../../src/core/world/entity-table.ts)、[player-state.ts](../../../../../src/core/world/player-state.ts)、[world-state.ts](../../../../../src/core/world/world-state.ts)、[world.ts](../../../../../src/core/world/world.ts)、[projection.ts](../../../../../src/core/projections/projection.ts)、[render-state.ts](../../../../../src/core/projections/render-state.ts)、[snapshot.ts](../../../../../src/core/replay/snapshot.ts)、[compare.ts](../../../../../src/core/replay/compare.ts)、[rules-version.ts](../../../../../src/core/replay/rules-version.ts)、[recording.ts](../../../../../src/core/replay/recording.ts)、[replay.ts](../../../../../src/core/replay/replay.ts)、[pipeline.ts](../../../../../src/core/systems/pipeline.ts)。
- P3-06 合并的类型与玩家更新（实体飞行状态与 `MovementBlock`、`PlayerState.target` 与 `control`、`flight: { motion, combat }`），以合并后的实际路径为准。
- 计划新增：`src/core/systems/` 下的 `commands.ts` 与规则族模块 `targeting.ts`、`weapons.ts`、`projectiles.ts`、`missiles.ts`、`energy.ts`、`collision.ts`、`destruction.ts`、`displays.ts`。

## 写入范围

- `src/core/contracts/domain-events.ts`：新事件与原因码。
- `src/core/contracts/domain-events.test.ts`：新事件与原因码的测试。
- `src/core/contracts/limits.ts`：`eventsPerTick` 的新值、`requestsPerTick` 与依据。
- `src/core/contracts/limits.test.ts`：上限测试。
- `src/core/world/entity-table.ts`：战斗状态、表现选择器与 `MovementBlock` 联合（P3-06 的类型若在别的文件，只改该类型所在的文件）。
- `src/core/world/entity-table.test.ts`：实体表测试。
- `src/core/world/player-state.ts`：玩家状态的新字段。
- `src/core/world/player-state.test.ts`：玩家状态测试。
- `src/core/world/world-state.ts`：世界状态的新成员。
- `src/core/world/world.ts`：读模型与状态的接线。
- `src/core/world/world.test.ts`：世界测试的既有断言更新。
- `src/core/world/world.test-support.ts`：测试辅助。
- `src/core/projections/projection.ts`：`flight.combat` 的形状（`not-implemented`）。
- `src/core/projections/projection.test.ts`：战斗组判别的测试。
- `src/core/projections/render-state.ts`：Render State 新字段。
- `src/core/projections/render-state.test.ts`：Render State 测试。
- `src/core/replay/snapshot.ts`：快照写入器与快照格式版本。
- `src/core/replay/snapshot.test.ts`：快照测试。
- `src/core/replay/compare.ts`：比较器事件字段表。
- `src/core/replay/compare.test.ts`：比较器测试。
- `src/core/replay/rules-version.ts`：规则版本。
- `src/core/replay/recording.ts`：仅限新上限要求的依据注释（格式版本不变）。
- `src/core/replay/recording.test.ts`：录制可用事件总量的断言。
- `src/core/replay/replay.ts`：仅限旧规则版本拒绝所需的改动（格式版本不变）。
- `src/core/replay/replay.test.ts`：replay 测试。
- `src/core/replay/replay.test-support.ts`：测试辅助。
- `src/core/systems/pipeline.ts`：接入点、新请求类型、`RequestQueue` 的上限与 `targeting` 的移除清空。
- `src/core/systems/pipeline.test.ts`：流水线测试。
- `src/core/systems/flight-control.ts`：P3-06 玩家更新中 CR-07 的两处静态调用（P3-06 的玩家更新尚未合并时，改在 `pipeline.ts` 的玩家更新位置接入）。
- `src/core/systems/commands.ts`：命令分派（新建）。
- `src/core/systems/commands.test.ts`：命令分派测试（新建）。
- `src/core/systems/targeting.ts`：目标模块（新建，保持现有行为）。
- `src/core/systems/weapons.ts`：武器模块（新建，保持现有行为）。
- `src/core/systems/projectiles.ts`：弹丸模块（新建，保持现有行为）。
- `src/core/systems/missiles.ts`：导弹模块（新建，保持现有行为）。
- `src/core/systems/energy.ts`：能量模块（新建，保持现有行为）。
- `src/core/systems/collision.ts`：碰撞模块（新建，保持现有行为）。
- `src/core/systems/destruction.ts`：毁伤模块（新建，保持现有行为）。
- `src/core/systems/displays.ts`：帧尾显示步模块（新建，保持现有行为）。
- `src/core/systems/spawn.ts`：`instantiate` 传入战斗状态的分配初值（`allocatorCraftCombat()`，12 再按 CR-07 写入实例化值）。
- `src/core/systems/spawn.test.ts`：Render State 新成员对应的断言更新。
- `src/core/world/create-world.test.ts`：Render State `clock` 对应的断言更新。
- `src/core/rules/flight-state.test.ts`：P3-06 测试辅助的类型标注随 `MovementBlock` 联合收窄为 `SteeredMovementBlock`（不改行为）。
- `src/core/systems/movement.ts`：P3-06 的模式分派为 `linear`、`spinning` 增加 Core 故障分支（22 之前不可达）。
- `src/core/systems/movement.test.ts`：一个用例改用有战斗类型的种类（种类 20）以到达原断言的故障。

## 验收标准

- [ ] AC-01：共享形状与 CR-02 至 CR-06、CR-12、CR-14 逐项一致；类型、校验、序列化与比较器一致，快照写入器与事件字段表覆盖每个新成员；战斗组位于 `flight` 之内，为 `not-implemented`。
- [ ] AC-01：`eventsPerTick` 为 32,768，`requestsPerTick` 为 16,384 且请求队列使用它，两者的 limit 与 limit + 1 有测试；快照格式版本与 `RULES_VERSION` 相对合入时各递增一次，replay 格式版本不变；旧规则版本的 replay 被拒绝且不执行。
- [ ] AC-01：既有纯度、原子拒绝、生命周期与输出冻结的不变量测试保留；只更新获批变化对应的断言；合成 Core 的测试不改；正式与合成模块互不依赖。
- [ ] 接入点改造后行为不变：P3-07 的每个命令仍有恰好一个 `rejected`/`not-implemented` 结果，P3-06 的命令结果不变；未实现阶段的 `run` 仍为 null；没有假系统、空调用点或生产注入入口；`leave()` 不调用目标模块。
- [ ] `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts`、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- Node 测试：新形状的校验与冻结；快照文本覆盖新成员；比较器对新事件的逐字段校验；上限的边界；旧规则版本拒绝。
- 对比改造前后同一合成任务与输入：事件流不变；快照文本只多出获批的新成员，版本号按 CR-14 变化。
- 不涉及浏览器或原版对照。

## 完成证据
