---
type: plan
status: active
phase: P3
task: "07"
subtask: "22"
updated: 2026-10-10
---

# 22 — 与 P3-06 的联合接线：导弹

**契约来源：** [spec](../spec.md) 的 S-05、S-06、S-09（接线部分）；AC-06（发射帧）、AC-07、AC-08（流水线部分）、AC-11（接线部分）；[联合依赖与阶段时序](../spec.md#联合依赖与阶段时序)、[实施关卡](../spec.md#实施关卡) D-03、技术决定 7、8；P3-02 spec 的 [CR-03](../../02/spec.md#cr-03-移动块的模式-12d-03)（模式的分派）、[CR-07](../../02/spec.md#cr-07-实例化扩展与系统流水线d-01d-03)（派发器阶段的接入）、[CR-08](../../02/spec.md#cr-08-直接创建与对象生命周期d-01)（首次运动）、[CR-09](../../02/spec.md#cr-09-与-p3-06-的接口d-03)（与 P3-06 的接口）。
**依赖：** 08, 20, 35。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 前提

- 08 已定稿 D-03（P3-02 的 CR-03、CR-09）。
- P3-06 的下列交付已集成到当前分支：移动阶段的遍历与筛选、模式 `craft` 的积分、停放更新的遍历、玩家更新（失效目标清除、命令批次与速度辅助），以及 14、20 执行时尚未合并的 `0x21fd8` 或按油门调用的模式 0 构造。
- 不满足时，协调者把本项记为 blocked，恢复条件写明所缺的 P3-06 交付。若只缺其中一部分，协调者可以把已就绪的接线拆为新子任务先做（见 goal 审批节的约定）。

## 工作范围

- **拆分：** 协调者 2026-10-10 把不依赖 20 的接线拆到 35：玩家更新的两处调用、`linear`/`spinning` 的分派与弹丸命中检测、停放交战、把跳过移动阶段的测试改为正式 `step`。本项只做导弹的接线，在 35 之上进行。
- **P3-06 函数的接线：** 无制导导弹阶段 0 对 `0x21fd8` 的直接调用；`steer` 请求在请求处理中经 `0x21fd8` 的应用；若 14 执行时导弹构造未按油门调用模式 0 构造，在这里接上。
- **导弹的移动：** 导弹以机体移动块经 P3-06 的积分运动；20 的导弹对象更新与请求处理在流水线中的位置符合 CR-07。
- **时序：** 导弹的引信在其对象更新中以上一 tick 末的位置运行，起爆在请求处理中，两者都在移动阶段之前（H5）。本项在流水线中验证这一次序，不把引信放到积分之后。
- **集成测试：** 经正式 `step` 断言以下行为，期望独立推导：
  - 导弹经共用积分与 `steer` 请求追踪至命中或失效；
  - 引信与起爆的次序；
  - 导弹发射帧不运动、不碰撞；
  - 起爆写入的冲量与定时旋转被 P3-06 的积分消费。

## 不包含

- P3-06 自身的积分、速度与停放调度规则（P3-06）；单个规则的分支（13 至 21）。
- 速度能耗（16 直接读 P3-06 的指令速度）；35 已完成的非导弹接线。
- 修改 P3-06 的 spec 或 goal。D-03 接口需要变化时，回到 08 的关卡（由协调者新增子任务）。

## 关键文件与契约

- [pipeline.ts](../../../../../src/core/systems/pipeline.ts) 的 `movement` 与 `parked-update` 阶段；P3-06 交付的运动、停放与操纵模块（以合并后的实际路径为准）。
- 17、18、19、20、21 交付的规则函数。

## 写入范围

- `src/core/systems/**`：移动与停放阶段的接线与集成测试。范围宽是因为 P3-06 的模块路径以合并后的实际路径为准；协调者可以拆分。
- `src/core/rules/**`：接线需要的规则函数调整。
- `src/core/world/world.test-support.ts`：集成测试的辅助。
- `src/app/session/game-session-replay.test.ts`：导弹飞行接入后恢复 35 临时改掉的 `fire secondary`。

## 验收标准

- [x] AC-07：导弹经 P3-06 的共用积分与 `steer` 请求追踪到命中或失效；无制导导弹在阶段 0 直接调用 `0x21fd8`；引信与起爆的次序符合 H5；没有替代积分器，也不代入原版每帧前态。
- [x] AC-06（导弹）：经正式流水线，导弹在发射帧不运动、不碰撞。
- [x] 接口与 CR-09 一致；`pnpm check` 通过。

## 验证方法

- Node 集成测试：用合成内容与正式 `step`，不用独立 helper 代替流水线。
- 在完成证据中写明所集成的 P3-06 交付的提交，以及 D-03 的批准出处。

## 完成证据

- **集成的 P3-06 交付与 D-03 的出处：** 移动阶段与模式 0/3 积分 `d5c48db`（P3-06/11）、浮点操纵 `0x21fd8`（`applyFloatControl`）与玩家更新 `c5a9267`、`1496f49`（P3-06/12、13）、停放更新 `5cd098f`（P3-06/14），经 33 的合并 `efbc762` 与 `37c929f` 进入本分支；本项基于认领提交 `15a8dc4`（20、35 已集成）。D-03 由 08 定稿（`9fb66a6`），批准记录在 [P3-02 spec 的审批](../../02/spec.md#审批)“2026-10-10 修订（P3-07 的 D-01、D-03）”，授权出处为 [goal 的审批节](../goal.md#审批)。
- **实现（只增补 P3-06 的文件）：** [movement.ts](../../../../../src/core/systems/movement.ts) 的 `motionRecord` 对导弹返回其弹体记录（导弹记录 +0x14，即对象 +0x1C，W11），其他实体仍取种类的机型记录；任一记录缺失仍为 `movement.record` 故障。导弹保持机体移动块，经 P3-06 的 `integrateCraft` 运动（积分不读最高速度；`0x21fd8` 读实体的最高速度，20 已接上）。查找放在 [combat-init.ts](../../../../../src/core/rules/combat-init.ts) 的 `missileBodyRecord`，[missiles.ts](../../../../../src/core/systems/missiles.ts) 的 `bodyRecord` 也改用它（避免 movement → missiles → pipeline 的导入环）。流水线次序不变：引信在导弹自身更新中（对象更新）读上一 tick 移动留下的位置，起爆与 `steer` 的应用在请求处理中，两者都在移动阶段之前（H5、CR-07），已由下列测试核对，无需改动。
- **集成测试**（新增 [missile-wiring.test.ts](../../../../../src/core/systems/missile-wiring.test.ts)，9 项，全部经正式流水线的每个阶段；期望由测试设置的记录、位置与 H5 的公式手算，或把接线应产生的块交给 P3-06 的精确有理参考 `referenceFrame`，逐 tick 比较位置、姿态与移动块）：
  - AC-06、CR-08：玩家 `fire secondary` 的发射 tick 中，导弹停在发射点 (3, 0, 1.25)（偏移加 40 × 1/32），状态为表现就绪、没有 G；发射点在一个半径覆盖它的有盒机体之内也没有 `hit`。下一 tick 首次回调建 G（阶段 0）并当即请求状态 7，同 tick 以弹体记录积分移动 2 单位。
  - 无制导（H5 阶段 0）：以速度 16 起步的导弹在第 2 tick 的自身更新中经 `0x21fd8` 得到满油门（指令速度 F(64 × 1)，到达标志清除），同 tick 的积分即按弹体 +0xBC 加速：z 依次为 0.5、1、1 + 18/32、1 + 38/32、1 + 60/32；寿命在阶段 0（时钟 4）定为 132，第 67 tick（时钟 134）熄火：`missile-ended`（fizzled）在移动之前处理，导弹停在第 66 tick 留下的位置，下一 tick 离开。
  - H5 次序：已武装的导弹在原点以 64 前进，机体在其后 3.5：tick 1 的引信读移动前的 3.5 < 4 而触发（移动后为 5.5，不会触发），之后导弹移到 z = 2；tick 2 在请求处理中起爆，`missile-ended` 的位置为 (0, 0, 2)，伤害 700 × (1 − 3.5 ÷ 10) = 455（若在移动后起爆为 7.5，伤害 315）；受击者的移动块在移动阶段带有震动的冲量（沿导弹第 3 行，F(64 × 0.0125) = 0.8）与三轴定时旋转，同 tick 的 P3-06 积分消费它们：位置为 F(−3.5 + F(0.025))，冲量衰减到 0 以下而结束，姿态旋转，整体等于 `referenceFrame`；被持有的导弹（被毁源）仍移动。
  - 追踪导弹（CR-05、CR-09）：以 `0x21a3c` 的发射速度 40（= min(64, 发射者 40)、到达、比值 0.625）发射；下一 tick 安装投递的油门块与转向块在请求处理中应用后才进入移动（指令速度 64、未到达；目标在 +x 侧，yaw 速率为负、pitch 为 F(2 × −1 × 0) = −0），同 tick 积分使第 3 行转向 +x。对 (20, 0, 80) 的目标，导弹每 tick 都等于 P3-06 的积分，直到在目标 4 + 2 单位内起爆，`hit` 的伤害等于 H5 公式在起爆距离（f32 的 √Σdᵢ·F(dᵢ)）上的值；同一几何下的无制导导弹沿 x = 0 直飞、熄火，目标不受损。目标移除后程序不再投递，期限不推进，导弹以最后的操纵继续积分直到熄火（失效）。
  - 变异检查：`motionRecord` 改取机型记录 0、去掉阶段 0 的直接调用、`applySteer` 不应用，分别使 4、1、2 项失败。
- **既有测试的更新：** [pipeline.test.ts](../../../../../src/core/systems/pipeline.test.ts) 的 `steer` 路由用例不再期望 `movement.record` 故障，改为断言同 tick 的积分以弹体记录（+0xC8 ≠ 0，转角为步长）把 pitch 转 F(−0.5 ÷ 32)；自身更新的路由用例断言导弹在激活的 tick 沿第 3 行移动 1.5。[movement.test.ts](../../../../../src/core/systems/movement.test.ts) 的“种类 20 无机型记录”故障用例改为：导弹以其弹体记录（记录 1，与记录 0 的转向不同）积分；导弹记录或弹体记录缺失为 `movement.record`。[destruction.test.ts](../../../../../src/core/systems/destruction.test.ts) 去掉跳过移动阶段的参数，被爆炸持有的导弹每 tick 移动 1.5。[combat-init.test.ts](../../../../../src/core/rules/combat-init.test.ts) 增加 `missileBodyRecord` 的用例。[missiles.test.ts](../../../../../src/core/systems/missiles.test.ts) 只改头部说明。
- **恢复 `fire secondary`：** [game-session-replay.test.ts](../../../../../src/app/session/game-session-replay.test.ts) 恢复 35 临时改掉的 `{ type: 'fire', channel: 'secondary' }`。导弹移动接上后，故障改在 20 的首次回调：合成导弹记录的寿命 +0x44 为 −11（`rule-data.test-support.ts` 的 `missile()` 有意取负值），`initialGuidance` 拒绝。测试因此在自己的运行规格中把导弹寿命设为 320（局部辅助 `flyable`，不改共享夹具），并断言第 10、13 tick 各发射一枚导弹，第 10 tick 的导弹飞过第 11 至 13 tick，录制、replay 与检查点一致。
- **浏览器：** e2e 只用主武器（`browser-replay.spec.ts` 的 `fire primary`），没有任何 e2e 投递 `fire secondary`，AI 开火尚未接入（P3-08），所以浏览器中不会出现导弹，未运行 e2e。
- **检查：** `pnpm exec vitest run` 上述 6 个 Core 测试文件 134 项与 game-session-replay 4 项通过；`pnpm check`（typecheck、lint、Vitest 262 个文件 7,846 项、build）通过，build 的大块警告为既有。高负载（load average 约 70）下 `snapshot.test.ts` 的一项曾 5 秒超时一次，单独以长超时运行通过（同一树上两次计时 6.2 秒与 2.6 秒，随负载变化，与 35 记录的现象相同），其后完整的 `pnpm check` 通过；`pnpm check:compliance` 通过（`passed: true`）。
- **rubber-duck：** 对照 CR-03、CR-07、CR-08、CR-09、H5 与 W11 审阅全部改动，无阻塞与非阻塞问题：确认弹体记录查找、导弹不会有 `warp` 块（分配时拒绝）、被毁源导弹仍用弹体记录、H5 次序测试能证伪错误次序、期望独立推导且有无制导的对照，以及 `flyable` 不绕过生产校验。
- **simplify：** 采纳：弹体记录查找提为 `missileBodyRecord`（movement.ts 与 missiles.ts 共用，也去掉 `motionRecord` 中重复的判别）；集成测试的导弹构造合并为 `missileAt`，程序记录共用一个字面量，熄火用例的循环不再逐 tick 克隆。未采纳：把 `flyable` 改为修改共享夹具 `craftInfoContent()`（写入范围外，且会改变 `rule-data.test.ts` 依赖负寿命的期望；交 28 或协调者考虑）；为测试的逐 tick 克隆另设无捕获模式（整个文件约 80 ms）；launch.ts 的同类查找（它还需要导弹记录本身）。
- **文档影响：** `docs/original/` 无新事实，U 项不变。[core.md](../../../../engineering/modules/core.md) 第 224 行已写明“P3-07 在 `motionRecord` 处为导弹给出弹体记录”，与实现一致；其流水线表等其他过时内容按 goal 执行记录由 28 更新。两处测试注释随本项过时，但在写入范围外，交 28：[combat.test.ts](../../../../../src/core/projections/combat.test.ts) 第 369 行“projectiles and missiles do not move before P3-07/22”与 [snapshot.test.ts](../../../../../src/core/replay/snapshot.test.ts) 第 142 行“they cannot move before P3-07 subtask 22”。STATUS、tasks.md 无变化。
