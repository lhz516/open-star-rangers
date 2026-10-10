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

- [ ] CR-07：玩家更新在规定位置调用导弹锁定与自动选敌，经正式 `step` 的测试覆盖两者的时序与结果。
- [ ] AC-06（发射帧）：经正式流水线，发射帧的新对象不运动、不碰撞。
- [ ] AC-08（流水线）：高速弹丸在流水线中的穿过、擦边与完整漏过符合证据；弹丸在自身移动后立即做命中检测。
- [ ] AC-11（接线）：停放交战通过固定阶段接线，抽取与 P3-06 的停放更新正确交错；停放/活动切换不重复结算、不丢失目标；死亡与移除遵循原版门禁。
- [ ] `linear`、`spinning` 的分派与首次运动符合 CR-03、CR-08；原先跳过移动阶段的测试已改为正式 `step`；`pnpm check` 通过。

## 验证方法

- Node 集成测试：用合成内容与正式 `step`，不用独立 helper 代替流水线。
- 在完成证据中写明所依赖的 P3-06 交付的提交。

## 完成证据
