---
type: plan
status: active
phase: P3
task: "07"
subtask: "35"
updated: 2026-10-10
---

# 35 — 与 P3-06 的联合接线（导弹除外）

**契约来源：** [spec](../spec.md) 的 S-05、S-06、S-09（接线部分）；AC-06（发射帧）、AC-08（流水线部分）、AC-11（接线部分）；P3-02 spec 的 [CR-03](../../02/spec.md#cr-03-移动块的模式-12d-03)、[CR-07](../../02/spec.md#cr-07-实例化扩展与系统流水线d-01d-03)、[CR-08](../../02/spec.md#cr-08-直接创建与对象生命周期d-01)、[CR-09](../../02/spec.md#cr-09-与-p3-06-的接口d-03)。
**依赖：** 13, 14, 15, 16, 17, 18, 19, 21。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 背景

协调者在执行中从 22 拆出本项（2026-10-10，依用户对新增解除阻塞子任务的预先授权与临时提高的并行上限）。22 原本要等 20（导弹），但其中大部分接线只依赖已完成的 13 至 19 与 21，因此先行。22 只保留导弹的接线，并改为依赖本项。

## 工作范围

- **玩家更新的两处静态调用（CR-07）：** 在 P3-06 的玩家更新（`flight-control.ts`）中：
  - 失效目标清除之后、速度辅助之前，调用 14 的 `updateMissileLock`；
  - 命令批次与轴的变化检测之后，调用 13 的 `selectAutomaticTarget`，且在 14 的玩家命令发射请求 `release` 之后（原版 T3；见 goal 执行记录）。13 的入口需要 `TickContext`。
- **移动阶段的模式分派（CR-03、CR-08、CR-09）：** 在 P3-06 的移动阶段（`movement.ts`）中，按 `movement.mode` 分派：
  - `linear`（弹丸与爆炸）：调用 17 的 `moveLinear(position, block, step)`；弹丸在 `block.hitTest` 时随即调用 17 的 `hitTestProjectile(context, entity)`，后者自己按状态 7 筛选；
  - `spinning`（判别值 3 碎片）：调用 18 的 `spinFragment`；
  - 本 tick 新建的实体不运动（CR-08）；
  - 导弹仍以机体移动块经 P3-06 的积分运动，其接线（`0x21fd8`、`steer`）在 22。去掉 11 为 `linear`/`spinning` 留的 Core 故障分支。
- **停放交战（CR-09）：** 在 P3-06 的停放更新（`area.ts` 的 `updateParked`）中，对每个本次更新的对象于 `0x2f314` 之后调用 21 的 `engageParked(context, entity, elapsed)`。要点：
  - `updateParked` 目前只取 `(world, emit)`，接线须提供 `TickContext`；
  - `updateParked` 在遍历中持有自己的 `RandStream`，每次调用前须写回 `world.rngState = rand.state`，调用后从 `world.rngState` 继续（E4 的交错抽取）；
  - 停放/活动切换不重复结算，也不丢失目标。
- **改用正式 `step` 的测试：** 18 的 `destruction.test.ts`、19 的 `collision.test.ts` 与 17 的测试中，因模式 1/2 尚不能运动而跳过移动阶段的用例，改为经正式 `step`。
- **集成测试：** 经正式 `step` 断言以下行为，期望独立推导：
  - 弹丸的飞行、到期与命中；一个 tick 两端都在目标外的高速弹丸的穿过、擦边与完整漏过；
  - 发射帧的新对象不运动、不碰撞；
  - 爆炸与碎片的首次运动；
  - 碰撞写入的冲量与定时旋转被 P3-06 的积分消费；
  - 停放交战的调度与停放/活动切换；
  - 两处玩家更新调用的时序与结果。

## 不包含

- 导弹的接线：`0x21fd8` 的直接调用、`steer` 请求的应用、导弹经积分的飞行、引信与起爆的流水线次序（22）。
- P3-06 自身的积分、速度与停放调度规则；单个规则的分支（13 至 21）。

## 关键文件与契约

- P3-06 已合并的 `src/core/systems/movement.ts`、`area.ts`、`flight-control.ts`；[pipeline.ts](../../../../../src/core/systems/pipeline.ts)。
- 13、14、17、18、19、21 的完成证据中给 22 的交接（模式分派、测试改用正式 `step`、停放交战的 RNG 交错）。

## 写入范围

协调者 2026-10-10 把原来的 `src/core/systems/**`、`src/core/rules/**` 收窄为下列文件，以便 20（`missiles.ts`）并行；需要其他路径时发 scope-request。

- `src/core/rules/projectile-motion.ts`
- `src/core/systems/area.ts`
- `src/core/systems/area.test.ts`
- `src/core/systems/collision.test.ts`
- `src/core/systems/destruction.test.ts`
- `src/core/systems/flight-control.ts`
- `src/core/systems/flight-control.test.ts`
- `src/core/systems/movement.ts`
- `src/core/systems/movement.test.ts`
- `src/core/systems/parked-engagement.test.ts`
- `src/core/systems/pipeline.ts`
- `src/core/systems/pipeline.test.ts`
- `src/core/systems/projectiles.ts`
- `src/core/systems/projectiles.test.ts`
- `src/core/systems/targeting.test.ts`
- `src/core/systems/weapons.ts`
- `src/core/systems/weapons.test.ts`
- `src/core/systems/combat-wiring.test.ts`
- `src/core/world/world.test-support.ts`
- `src/app/runtime/game-runtime-input.test.ts`、`src/ui/dev/mission-diagnostics.test.ts`、`tools/replay-check.test.ts`：自动选敌产生的 `target-changed` 对应的断言。
- `src/core/projections/render-state.test.ts`：夹具中的玩家补上 CR-04 的 `targeting`。
- `src/app/session/game-session-replay.test.ts`：追踪导弹在 22 接入飞行之前的执行命令改为 `select-missile`（22 恢复 `fire secondary`）。

## 验收标准

- [x] CR-07：玩家更新在规定位置调用导弹锁定与自动选敌，经正式 `step` 的测试覆盖两者的时序与结果。
- [x] AC-06（发射帧）：经正式流水线，发射帧的新对象不运动、不碰撞。
- [x] AC-08（流水线）：高速弹丸在流水线中的穿过、擦边与完整漏过符合证据；弹丸在自身移动后立即做命中检测。
- [x] AC-11（接线）：停放交战通过固定阶段接线，抽取与 P3-06 的停放更新正确交错；停放/活动切换不重复结算、不丢失目标；死亡与移除遵循原版门禁。
- [x] `linear`、`spinning` 的分派与首次运动符合 CR-03、CR-08；原先跳过移动阶段的测试已改为正式 `step`；`pnpm check` 通过。

## 验证方法

- Node 集成测试：用合成内容与正式 `step`，不用独立 helper 代替流水线。
- 在完成证据中写明所依赖的 P3-06 交付的提交。

## 完成证据

- **依赖的 P3-06 交付：** 移动阶段 `d5c48db`（P3-06/11）、飞行控制与玩家更新 `c5a9267`、`1496f49`（P3-06/12、13）、停放更新 `5cd098f`（P3-06/14），经 33 的合并 `efbc762` 与 `37c929f` 进入本分支；本项基于 `3913a30`。
- **实现：**
  - 玩家更新（[flight-control.ts](../../../../../src/core/systems/flight-control.ts)，P3-06 的文件，只增补）：`PlayerUpdateOutput` 增加 `lockMissiles(player)`，在失效目标清除之后、速度辅助之前调用；`updatePlayer` 返回其运行所针对的可用玩家（否则 null）。[pipeline.ts](../../../../../src/core/systems/pipeline.ts) 的 `updatePlayerControls` 以 14 的 `updateMissileLock` 接入锁定，在 `requests.release()`（玩家开火命令的发射）之后、对可用玩家调用 13 的 `selectAutomaticTarget`（T3）。
  - 移动阶段（[movement.ts](../../../../../src/core/systems/movement.ts)）：去掉 11 为 `linear`/`spinning` 留的 `movement.mode` 故障；`linear` 调用 17 的 `moveLinear`，块的 `hitTest` 为真时随即调用注入的命中检测（流水线传入 `hitTestProjectile(context, …)`，它自己只测状态 7）；`spinning` 调用 18 的 `spinFragment`。本 tick 新建的实体仍由 P3-06 的 `movesThisTick` 跳过（CR-08）。导弹仍以机体移动块经 `motionRecord` 得到 `movement.record` 故障，归 22。
  - 停放更新（[area.ts](../../../../../src/core/systems/area.ts)）：`updateParked` 增加 `engage(entity, elapsed)`，对每个本次更新且不在 Warp 过境中的对象在 `travelParked` 之后调用；调用前写回 `world.rngState = rand.state`，调用后从 `world.rngState` 重建 `RandStream`（E4）。流水线传入 21 的 `engageParked(context, …)`，其 2³² 经过时间故障留在入口。
  - 注释：[weapons.ts](../../../../../src/core/systems/weapons.ts)、[projectiles.ts](../../../../../src/core/systems/projectiles.ts)、[projectile-motion.ts](../../../../../src/core/rules/projectile-motion.ts) 中“由 22 接入”的说明改为现状。
- **测试改用正式 `step`：** [destruction.test.ts](../../../../../src/core/systems/destruction.test.ts) 的 tick 跑全部阶段（只有导弹来源的用例在 22 之前仍跳过移动阶段：被毁的导弹仍移动，需要弹体记录），击落碎片的 `fragment-expired` 位置取本 tick 移动前，并断言被毁源仍移动（X9）；[collision.test.ts](../../../../../src/core/systems/collision.test.ts) 的碎片用例与 [projectiles.test.ts](../../../../../src/core/systems/projectiles.test.ts) 的生命周期与击落用例经正式 `step`（击落改为弹丸以 512/s 一步从 z −6 移到 10）；[pipeline.test.ts](../../../../../src/core/systems/pipeline.test.ts) 的三个 `movement.mode` 故障用例改为三种块经流水线移动 v × 步长。自动选敌在正式 `step` 中运行后：P3-06 与 13 的测试夹具补上 CR-04 要求的 `targeting`，并把自动选敌设为不到期（flight-control、targeting 的命令用例、destruction、area 的一个用例），13 的自动选敌用例显式设为到期；[weapons.test.ts](../../../../../src/core/systems/weapons.test.ts) 的“参照目标”用例按 CR-07 增加自动选敌在同 tick 最后投递最近敌方的结果。
- **集成测试**（新增 [combat-wiring.test.ts](../../../../../src/core/systems/combat-wiring.test.ts)，19 项，全部经正式 `step`，期望由各测试设置的记录与位置独立推导）：
  - CR-07：锁定在命令之前运行（等级 3、阶段到期时开火的导弹 `launchByte` 为 4，锁定若在命令之后则为 3；下次更新 2 + 0x15）；已移除的目标先被清除，锁定降为 0，自动选敌同一更新中看到空目标并选中另一敌方；发射在 P3-06 请求之后释放（`speed-matched` 先于 `shot-fired`），自动选敌在发射之后（`shot-fired` 先于自动 `target-changed`）；玩家不可用时不运行、到期不变，到期严格比较（时钟 68 不选，70 选，下次到期 70 + 0x40），其间右显示屏在 tick 3 末清除离开的目标（CR-10）。
  - AC-06、CR-08：开火 tick 的弹丸停在发射点 (1, 0, 1.25)、`presentation-ready`、不做命中检测（发射点在敌机包围盒内也不命中），下一 tick 移动 3.125 并命中、移除；弹丸按 v × 步长匀速飞行，首次回调后 40 单位到期、下一 tick 离开；弹丸命中致死时爆炸与两块碎片停在构造位置、不运动，下一 tick 爆炸在构造处 `explosion-started` 后按 F(row 3 × 48) 移动，碎片激活并按各自速度移动（有自旋者转向），被毁源继续移动；致死 tick 新碎片与玩家重叠而不碰撞，下一 tick 玩家与两块碎片各接触一次。
  - AC-08、H3：一 tick 2,000 单位的高速弹丸两端都在 4 单位宽的包围盒外而穿过、沿面 x = 2 擦边均命中，x = F(2 + 2⁻²²) 完整漏过；机体按其本 tick 移动后的位置受测（自 x −3.5 移到 −2 后才覆盖弹道），碎片按移动前的位置受测（自 2.5 移到 4.5 前覆盖弹道）；状态 8 的弹丸照常移动、不再命中。
  - 碰撞写入的冲量与定时旋转被下一 tick 的 P3-06 积分消费：玩家与迎面机体在 tick 1 接触，tick 2 两者的位姿等于 P3-06 精确有理参考 `referenceFrame` 对 tick 1 写下的块的结果。
  - AC-11：两个会掷类别的停放对象（种类 10、12）与受害者（14）的抽取按“10 的到期 → 10 的类别 → 12 的到期 → 12 的类别 → 14 的到期”交错，选定的 RNG 使 10 交战、12 放弃，共 5 次抽取，`hit` 字段逐项（经过时间 1002：125 发 × 27 = 3375，护盾全吸收）、双方能量时钟；停放行进使对象离开世界后同一更新仍交战（`object-left-world` 先于 `hit`）；停放受害者被击毁时 `object-destroyed` 为 `removed`、无爆炸，后面的射手门禁不通过、受害者自身不再更新，下一 tick 离开，击杀者的能量更新随之运行；停放 → 活动 → 停放的整个过程只在两次到期的停放更新中交战（tick 501 经过时间 640，tick 603 经过时间 204，含活动期间），活动期间与切换 tick 不交战，`ai.target` 保持。
  - P3-06 文件的单元测试：[movement.test.ts](../../../../../src/core/systems/movement.test.ts) 的 `linear` 移动与只对有标志的块、在其自身移动后做命中检测，`spinning` 的旋转不乘步长；[area.test.ts](../../../../../src/core/systems/area.test.ts) 的交战回调时机、经过时间与 RNG 交错，Warp 过境对象不交战；[flight-control.test.ts](../../../../../src/core/systems/flight-control.test.ts) 的锁定在清除之后、辅助之前，不可用玩家不调用。
- **检查：** `pnpm check`（typecheck、lint、Vitest 260 个文件 7,809 项、build）在 `ebd17a4` 上通过。自动选敌与 CR-04 夹具使写入范围后来加入的 5 个测试文件需要调整（协调者批准，见写入范围）：[game-runtime-input.test.ts](../../../../../src/app/runtime/game-runtime-input.test.ts)、[mission-diagnostics.test.ts](../../../../../src/ui/dev/mission-diagnostics.test.ts) 与 [replay-check.test.ts](../../../../../tools/replay-check.test.ts) 增加自动选敌的 `target-changed`（不指向命令）；[render-state.test.ts](../../../../../src/core/projections/render-state.test.ts) 的玩家补上 `targeting`；[game-session-replay.test.ts](../../../../../src/app/session/game-session-replay.test.ts) 的 `fire secondary` 暂改为 `select-missile`，因为自动选敌后引导导弹会发射，而其移动在 22 之前为 `movement.record` 故障（22 恢复）。高负载（load average 约 140）下 image-payload、budget、snapshot 测试曾偶发 5 秒超时，单独运行通过，耗时与基础提交相同；最终一次 `pnpm check` 全部通过。
- **Rubber-duck：** 无阻塞问题。采纳两项：增加对次序敏感的用例（手动匹配的 `speed-matched` 先于发射的 `shot-fired`）与状态 8 弹丸移动而不再命中的用例。确认玩家更新次序、停放更新的 RNG 交接、移动分派（含 `moveLinear` 返回新块后再做命中检测）与集成测试的独立性，以及对 game-session-replay 测试的处理。
- **Simplify：** 采纳：area 单元测试用 `rngStateAfter` 代替手写抽取；集成测试的玩家改用 `addPlayerEntity`；`parkedAt` 改为只取选项。未采纳：把其他测试文件的私有夹具提升为共享辅助（范围外）；锁定入口每 tick 的分配（14 的代码，不在本项改动内）；停放更新每次交战重建 `RandStream`（为保持 P3-06 模块不依赖 `TickContext` 的最小增补）；切换与自动选敌用例中的多次正式 `step`（跨越活动期间正是要验证的内容）。
- **文档影响：** `docs/original/` 无新事实，U 项不变。[core.md](../../../../engineering/modules/core.md) 中流水线表的 `object-update`、`movement`、`parked-update` 行与“代码注释标出 P3-07 的导弹锁定、自动选择目标、停放战斗的位置”两处随本项过时；按 goal 执行记录“11 的后续并入 22”，core.md 与 source-structure.md 的过时内容由 28 更新，已在交接中提请。
