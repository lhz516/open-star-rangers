---
type: plan
status: active
phase: P3
task: "07"
subtask: "20"
updated: 2026-10-10
---

# 20 — 导弹制导

**契约来源：** [spec](../spec.md) 的 S-05（导弹）、AC-07（规则部分）；[弹丸与导弹](../spec.md#弹丸与导弹)；P3-02 spec 的 [CR-02](../../02/spec.md#cr-02-实体的战斗状态d-01)（`MissileCombat`）、[CR-05](../../02/spec.md#cr-05-命令原因码与内部请求d-01)（`steer` 与导弹的 `expire`）、[CR-06](../../02/spec.md#cr-06-领域事件与次序d-01)（`missile-ended` 与起爆的事件次序）、[CR-09](../../02/spec.md#cr-09-与-p3-06-的接口d-03)（`0x21fd8`、共享的转向模块、导弹写入的移动块字段）、[CR-11](../../02/spec.md#cr-11-表现层的归属与已批准的差异d-01)（接触对象的差异与未定的原版常量）。
**依赖：** 03, 14, 15, 18, 31, 32, 34。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **AI 程序数据在 34：** 追踪程序的程序记录（`SteeringProgram`）由 34 接入世界的静态规则数据，本项从世界读取，不写死原版数值。
- **规则在 32：** 协调者 2026-10-10 把纯规则拆到 32：共享转向模块 `steering.ts`，以及制导块、阶段、引信几何、起爆衰减与 `0x2b628` 的 `guidance.ts`。本项在 `missiles.ts` 中用这些规则实现导弹的对象更新、请求与事件，并按 31 的读数设定冲突 29 常量的生产取值；下列各项中属于规则计算的部分调用 32 的函数，不重新实现。

- **回调与制导块（H5）：** `0x2aa40`（无制导）与 `0x2ab00`（追踪）在首次回调写制导块 `guidance`（相对值）并立即请求活动；`contact` 初始化为空（追踪导弹亦然，CR-11 的差异 6）；追踪导弹在首次回调建立 `homing`（`0x5dc0c`，处理程序的模式 0）。
- **阶段（`0x2ac10`）：** 0：时钟化；无制导导弹直接调用 P3-06 的 `0x21fd8`（满油门、不转向）。1：解除保险的延迟。2：寿命到期时 `detonate` 为 false 并投递 `expire`（熄火）；否则按检查间隔调用引信。3：起爆。4：无。
- **引信（`0x2adac`）：** 在导弹的对象更新中运行，用的是上一 tick 末的位置，不在积分之后：
  - 接触：有 box 的机体，严格的点测试，写 `contact`；
  - 近炸：按种类掩码判断阵营，跳过目标以外的同阵营对象；
  - 不过滤活动、状态、被毁与 Warp。
- **检查间隔的常量（冲突 29，CR-11）：** 无制导导弹的引信检查间隔取决于线性地址 0x2C 处的 f32。实现与测试按两种结果（减半或不减半）参数化，不择一写死。生产取值按 31 写入 executable H5 的原版运行时读数设定（20 依赖 31）。
- **共享转向模块（H5，CR-09）：** 新建 `src/core/rules/steering.ts`，作为共享的 Core 规则模块，实现 AI 转向库中导弹使用的子集：目标点与提前量模式 3（`0x5c8b0`）、两个限幅 atan2 的比例（`0x5cd1c`）、控制块输出（`0x5d014`）、期限算术（`0x5dcd4`）与热寻的放弃（`0x60aa0`，1 次抽取）。P3-08 在其上扩展 AI 机体所需的部分，不另建。
- **追踪：** 处理程序按 `homing.period` 调度（目标失效时不推进期限），输出的 `ControlBlock` 经 `steer` 请求投递，在请求处理中经 P3-06 的 `0x21fd8` 应用。
- **起爆与熄火（`0x2b408`，导弹的 `expire` 请求，在请求处理中）：**
  - `detonate` 为 true：发出 `missile-ended`（`detonated`）；调用 `destruction.ts` 的爆炸构造（18 实现），导弹成为被毁源；再按遍历次序对范围内的机体（含停靠者，不含停放者；状态 ≥ 7、未被毁、不在 Warp；`contact` 对象的距离按 0）按衰减计算伤害；伤害 > 0 时先 `0x2b628`（种类不在 `0xf9c7c` 时写冲量与定时旋转，6 次抽取），再调用 15 的 `0x2a40c`（`hit` 的原因为 `missile`）。不排除发射者、发射者的阵营与玩家。
  - `detonate` 为 false（熄火）：发出 `missile-ended`（`fizzled`），释放发射者、清空目标并进入待移除。
- **P3-06 的 `0x21fd8`：** 由 P3-06 的子任务 12 交付。若本项执行时它尚未合并到本分支，本项先交付不依赖它的部分，两处调用（阶段 0 的直接调用与 `steer` 请求的应用）由 22 接上。
- 不另建积分器，不以“直线追向目标”等近似代替；导弹经 P3-06 积分的飞行在 22 中验证。
- **测试：**
  - 每个阶段、寿命与熄火；引信的接触与近炸的边界、阵营与不过滤的状态。
  - 起爆的筛选（含停靠者）、衰减、`contact` 距离为 0、`0x2b628` 的抽取与写入、事件次序。
  - 转向模块的目标点、提前量、限幅比例、控制块与期限；热寻的放弃的抽取；目标失效时不推进期限。
  - 冲突 29 的常量的两种取值。

## 不包含

- 模式 0 的积分与 `0x21fd8` 本身（P3-06），以及经积分的飞行集成（22）；导弹的发射与构造（14）。
- AI 机体的转向（P3-08）；导弹相机（P3-12，经 `missile-ended`）；外观（P3-12）。

## 关键文件与契约

- `src/core/systems/missiles.ts`（11 新建）：导弹的按种类更新，以及 `steer` 与导弹的 `expire` 请求。
- 使用 12 的静态规则数据（引信半径平方等）、15 的 `0x2a40c`、11 新建的 `destruction.ts` 爆炸构造入口（18 实现），以及 P3-06 的 `0x21fd8` 与移动块字段。
- 32 的 `src/core/rules/guidance.ts` 与 `src/core/rules/steering.ts`。

## 写入范围

- `src/core/systems/missiles.ts`：导弹更新、引信、起爆与熄火。
- `src/core/systems/missiles.test.ts`：导弹系统测试（新建）。
- `src/core/systems/pipeline.test.ts`、`src/core/systems/destruction.test.ts`：导弹回调与 `steer`/`expire` 处理实现后，夹具中的导弹补上制导块，占位故障行改为路由测试。

## 验收标准

- [x] AC-07（规则）：H5 的回调、阶段、寿命、引信（接触与近炸）、起爆与熄火分支全部覆盖；引信在对象更新中以上一 tick 末的位置运行，起爆在请求处理中；起爆包括停靠者，对种类不在 `0xf9c7c` 的受击者施加 `0x2b628`；`missile-ended` 与 `hit` 的次序符合 CR-06。
- [x] 共享转向模块按 CR-09 实现导弹使用的子集，输出 `ControlBlock` 经 `steer` 请求投递；无制导导弹在阶段 0 直接调用 `0x21fd8`；没有替代积分器或近似追踪。
- [x] 冲突 29 的常量按两种取值参数化且都有测试；生产取值按 H5 记录的运行时读数设定，不择一写死。
- [x] `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts`、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- Node 测试：以给定的导弹与目标状态断言控制块、阶段、引信与起爆结果；期望由 H5 独立推导。
- 流水线与共用积分的集成在 22；连续追踪的对照见 27。

## 完成证据

- **实现（基于 `5fb0f75e`，35 集成之后）：** [missiles.ts](../../../../../src/core/systems/missiles.ts) 按 32 交接的调用次序调用 32 的 `guidance.ts` 与 `steering.ts`，不重新实现规则：
  - 首次回调（状态 1）：G 只建一次（相对值，`initialGuidance` 用 12 的 `fuseRadiusSquared`）；两种程序都置 `contact = null`（CR-11 的差异 6）；追踪导弹以 34 的 `world.ruleData.homingPrograms[programRecord(program)]` 安装程序（`initialHoming`，模式 0），其控制块按返回次序投递为 `steer`，然后投递状态 7。重复的首次回调只再投递状态 7（原生指令：G 已存在时跳到投递）。状态 0 为故障（与弹丸相同，运行时种类不会处于新建）。
  - 状态 7：追踪导弹在 `isHomingUpdateDue` 时以模式 1 运行程序并投递 `steer`，然后 `advanceGuidance`：`control` 在对象更新中直接经 P3-06 的 `0x21fd8`（`applyFloatControl`，弹体记录的速率、`maximumSpeed`、世界 RNG）应用，`expire` 投递到期请求。引信因此读上一 tick 移动留下的位置。
  - 状态 6（复现 `0x5ddd4`）：追踪导弹以模式 2 调用处理程序（投递转向块，不抽取），再由通用部分投递离开。原生次序已在本地只读核对：`0x2ab00` 在 G 存在时先调 `0x5ddd4`，再调通用回调 `0x20ae4`。转向请求先于离开被处理，对移动块与控制器的改变随导弹移除；保留它是为了请求与可能的故障与原版一致，代价只是每个导弹一次请求。其他状态走通用部分。
  - `steer` 请求：`ControlBlock` 的行 1、2、3 对应 pitch、yaw、roll；`set ≠ 0` 取值，否则 `clear ≠ 0` 为清除，否则不变（executable 的 `0x21fd8`）；经 `applyFloatControl` 应用。只有导弹投递，其他实体为故障（P3-08 扩展）。
  - `expire`（`0x2b408`）：先发 `missile-ended`（`shooterEntityId` 为仍可解析的发射者，否则 null；位姿为导弹的）。起爆：18 的 `constructExplosion`（导弹成为被持有的被毁源），再按 `blastHits` 的惰性遍历，每个受击者先 `blastShake`（本 tick 的 `MotionStep.time`，世界 RNG），再 15 的 `applyShotHit`（无撞击点）。熄火：待移除、释放发射者、清空目标。
  - **冲突 29：** `UNGUIDED_CHECK_INTERVAL = 'halved'`（31 写入 H5 的运行时读数），作为 `updateMissile` 的可选参数的默认值；流水线不传参，测试传两种取值。
  - P3-06 的 `0x21fd8` 浮点路径已可调用，所以阶段 0 的直接调用与 `steer` 的应用都在 `missiles.ts` 中接上；导弹的移动（`movement.ts` 给导弹弹体记录）与经积分的集成测试仍归 22（目前导弹进入状态 7 后移动阶段为 `movement.record` 故障）。
- **测试：** [missiles.test.ts](../../../../../src/core/systems/missiles.test.ts)（25 项，期望按 H5 与记录手算，不调用被测函数）：首次回调（无制导的 G 与 `contact`、追踪导弹的油门块与转向块先于状态 7、目标失效时只安装、热寻的模式 0 的放弃抽取世界 RNG 一次、G 只建一次、状态 0 故障）；状态 7（阶段 0 的时钟化与经 `0x21fd8` 的满油门、到期的模式 1 更新与期限 `(时钟 + 周期) SHR 1`、未严格到期不更新、目标失效不投递不推进期限、寿命严格到期熄火且不检查引信、近炸在当前位置触发、生产取值减半与 `'full'` 取整个间隔、接触后下一次回调起爆）；状态 6（模式 2 投递转向块且不抽取、再离开；无制导只离开）；`steer`（设与清、行到轴的映射与弹体速率、速度因子、锁定时不变、非导弹故障）；`expire`（熄火的事件与释放、发射者失效时为 null；起爆的事件次序 `missile-ended`、按遍历次序的 `hit` 与 `object-destroyed`，含停靠者、发射者与玩家，跳过停放、被毁、Warp 与状态 < 7、超出半径；导弹与被毁受击者各自被爆炸持有；`0xf9c7c` 之外的冲量；6 次抽取的震动先于伤害的抽取，时间为 F(640 ÷ 64)；豁免种类不震动只为伤害抽取）。变异检查：把生产取值改为 `'full'`、去掉模式 2、把震动移到伤害之后、以时钟代替任务时间、把 `missile-ended` 移到起爆之后、让清除优先于设置、不清 `contact`、不应用阶段 0 的控制块，各自使测试失败。
- **既有测试的适配（协调者 2026-10-10 扩大写入范围）：** [pipeline.test.ts](../../../../../src/core/systems/pipeline.test.ts) 与 [destruction.test.ts](../../../../../src/core/systems/destruction.test.ts) 中处于状态 7 的导弹补上阶段 4 的 G（已起爆，回调不再做事）；占位故障行 `missiles.steer`、`missiles.expire` 改为路由测试：`steer` 经 `0x21fd8` 写入导弹移动块（行 1 设 0.5、行 2 清除），一个导弹的到期熄火并发出 `missile-ended`、下一 tick 离开；原“导弹与弹丸保持通用生命周期”的测试改为两者经各自模块的首次回调进入状态 7、从待移除离开（导弹预置 G，因为合成导弹记录的寿命为负）。
- **检查：** `pnpm exec vitest run src/core/systems/missiles.test.ts src/core/systems/pipeline.test.ts src/core/systems/destruction.test.ts` 84 项通过；`pnpm check`（typecheck、lint、261 个文件 7,834 项测试，含 `src/core` 与 `tools/engineering-boundaries.test.ts`，build）通过，build 的大块警告为既有。
- **rubber-duck：** 对照 H5、`0x21fd8`、CR-05/06/08/09/11 与 32 的交接审阅 `missiles.ts` 与测试，无问题。
- **simplify：** 采纳：合并 `homingProgram` 与 `homingCall` 中重复的 `unguided` 守卫；`missile-ended` 只在一处发出、内联单用的熄火函数；测试复用 `steer` 请求构造。未采纳：复用 `flight-control.ts` 的 `craftMovement`（未导出，超出写入范围）；世界 RNG 的辅助函数（与兄弟系统的内联写法一致）；按 tick 缓存引信场景、任务时间或 RNG（至多 32 个导弹，可忽略）；把 `ControlBlock` 的解码移入 `rules/flight-control.ts`（P3-06 的文件，超出范围，交 22/P3-08 考虑）；去掉 `updateMissile` 的冲突 29 参数（本项验收要求两种取值经导弹系统都有测试）。
- **文档影响：** `docs/engineering/modules/core.md` 不逐个列出 P3-07 的系统模块（28 更新）；STATUS、tasks.md 无变化；U 项不变。原版事实建议由协调者补入 executable 的 H5（见交接报告）：`0x2ab00` 在状态 0/1 中 G 已存在时仍投递状态 7；在状态 6 中先 `0x5ddd4` 后 `0x20ae4`。
