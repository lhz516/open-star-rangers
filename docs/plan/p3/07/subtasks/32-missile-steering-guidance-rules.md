---
type: plan
status: active
phase: P3
task: "07"
subtask: "32"
updated: 2026-10-10
---

# 32 — 导弹的转向模块与制导规则

**契约来源：** [spec](../spec.md) 的 S-05（导弹）、AC-07（规则部分）；P3-02 spec 的 [CR-02](../../02/spec.md#cr-02-实体的战斗状态d-01)（`MissileCombat`）、[CR-09](../../02/spec.md#cr-09-与-p3-06-的接口d-03)（共享的转向模块）、[CR-11](../../02/spec.md#cr-11-表现层的归属与已批准的差异d-01)（未定的原版常量）；[executable 的 H5](../../../../original/formats/executable.md#h5-missiles--confirmed-code-unless-marked)。
**依赖：** 03, 12, 14。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 背景

协调者在执行中从 20 拆出本项（2026-10-10）。依据是用户对新增解除阻塞子任务的预先授权，以及用户临时把并行 worker 上限改为 5 的指示。20 原本要等 18（爆炸构造）与 31（引信间隔的读数）。其中纯规则部分既不需要 18，也不需要 31，因此先行，20 改为依赖本项。

## 工作范围

- **共享转向模块（H5，CR-09）：** 新建 `src/core/rules/steering.ts`，作为共享的 Core 规则模块，实现 AI 转向库中导弹使用的子集：
  - 目标点与提前量模式 3（`0x5c8b0`）；
  - 两个限幅 atan2 的比例（`0x5cd1c`）；
  - 控制块输出（`0x5d014`）；
  - 期限算术（`0x5dcd4`）；
  - 热寻的放弃（`0x60aa0`，1 次抽取）。
  P3-08 在其上扩展 AI 机体所需的部分，不另建。输出的 `ControlBlock` 形状按 CR-05。
- **制导规则（H5）：** 新建 `src/core/rules/guidance.ts`，作为纯函数：
  - 首次回调写入的制导块（相对值）与 `homing` 的初值；
  - `0x2ac10` 的阶段转移（时钟化、解除保险、寿命到期与熄火、起爆）与引信检查的时刻；
  - 引信 `0x2adac` 的几何：接触（有 box 的机体，严格的点测试，复用 12 的点测试）与近炸（种类掩码判断阵营、跳过目标以外的同阵营对象），不过滤活动、状态、被毁与 Warp；
  - 起爆的衰减伤害（`contact` 对象的距离按 0）与 `0x2b628` 的冲量与定时旋转（种类不在 `0xf9c7c` 时，6 次抽取）。
- **检查间隔的常量（冲突 29）：** 实现为参数，两种取值（减半或不减半）都有测试。生产取值由 20 按 31 的读数设定。
- **测试：** 用独立推导的期望覆盖转向模块的目标点、提前量、限幅比例、控制块与期限，以及热寻的放弃的抽取；阶段转移与寿命；引信的接触与近炸边界、阵营与不过滤的状态；起爆的衰减与 `0x2b628` 的抽取与写入。

## 不包含

- 导弹的对象更新、`steer` 与 `expire` 请求、起爆时调用 18 的爆炸构造与 15 的伤害入口、事件发出（20）。
- 模式 0 的积分与 `0x21fd8`（P3-06），以及经积分的飞行（22）；AI 机体的转向（P3-08）。

## 关键文件与契约

- [executable 的 H5](../../../../original/formats/executable.md#h5-missiles--confirmed-code-unless-marked) 与 [W11](../../../../original/formats/executable.md#w11-launch-message-8-and-the-two-constructors--confirmed-code)；12 的 `src/core/rules/collision-shapes.ts` 点测试；14 的导弹构造与 `MissileCombat` 初值。
- 计划新增：`src/core/rules/steering.ts`、`src/core/rules/guidance.ts` 及相邻测试。

## 写入范围

- `src/core/rules/steering.ts`：共享的转向模块（新建，P3-08 扩展）。
- `src/core/rules/steering.test.ts`：转向模块测试（新建）。
- `src/core/rules/guidance.ts`：制导块、阶段、引信几何与起爆衰减（新建）。
- `src/core/rules/guidance.test.ts`：制导规则测试（新建）。

## 验收标准

- [x] 共享转向模块按 CR-09 实现导弹使用的子集，有独立期望的测试；没有替代积分器或近似追踪。
- [x] H5 的阶段、寿命、引信（接触与近炸）与起爆衰减的规则函数全部覆盖，`0x2b628` 的抽取与写入正确。
- [x] 冲突 29 的常量是参数，两种取值都有测试，不择一写死。
- [x] `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts`、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- Node 测试：以给定的导弹、目标与场景状态断言规则函数的结果；期望由 H5 独立推导，不调用被测实现。

## 完成证据

- **实现（基于 `3fd9c46`）：**
  - [steering.ts](../../../../../src/core/rules/steering.ts)（共享转向模块，CR-09）：`steeringLimits`（`0x5dc0c` 的 ∓a 与 ∓s）、`installHoming`（`0x5dc0c`、`0x5c530`、`0x5c768`(1, 1, 0)）、`leadTargetPoint`（`0x5c8b0`，提前量模式 3、常量 0）、`steeringFractions` 与 `steeringControl`（`0x5cd1c`，经 `0x5d014` 原样投递）、`throttleControl`（`0x5d41c`）、`rateControl`（`0x5d0ec`）、`isHomingUpdateDue`（`0x5dcd4`）、`homingDeadline`（`0x60b84` 的期限）、`runHomingProgram`（处理程序 `0x60b84` 与热寻的 `0x60aa0`，模式 0/1/2，按次序返回要投递的 `ControlBlock`，1 次抽取只在热寻的放弃）、`vectorDistance`（`0x56b14`，复用 speed-match.ts 的 `0x56b50`）与 `programRecord`。输出类型是 CR-05 的 `ControlBlock`（自 `systems/pipeline.ts` 只作类型导入）。不含积分器，也不以直线追踪代替：控制块交给 P3-06 的 `0x21fd8`。
  - [guidance.ts](../../../../../src/core/rules/guidance.ts)：`initialGuidance`（首次回调的 G，相对值）、`initialHoming`（安装与模式 0）、`advanceGuidance`（`0x2ac10` 五个阶段，返回 `none`/`control`/`expire`）、`checkFuse`（`0x2adac`：接触复用 12 的 `craftContainsPoint` 及其 f32 d²，严格 `<` r²；近炸的阵营掩码 `isOwnerSide`；不过滤活动、状态、被毁与 Warp）、`isBlastVictim`、`blastDamage`、惰性的 `blastHits`（`0x2b408`，`contact` 距离按 0）与 `blastShake`（`0x2b628`）。冲突 29 是参数 `UnguidedCheckInterval = 'full' | 'halved'`，生产取值由 20 按 31 设定。
- **测试（期望按 H5 与下文原生事实手算或由有理/位级推理给出，不调用被测函数）：**
  - [steering.test.ts](../../../../../src/core/rules/steering.test.ts)（35 项）：程序记录 1/2；安装初值与负周期故障；5° 时映像常量与 π/180 的 f32 结果不同；`0x56b14`（13、√2 的 f32）；静止与移动目标的目标点、提前量 (d ÷ v) × w、v 为 ±0 或无块时无提前量、偏移先存 f32（3 + (1 + 2^−22) 的平局取偶得 4，不存则为 4 + 2^−21）、局部坐标；ahead 标志含无序；两个分数（正前 0、π/4 ÷ 2a、超限饱和、身后按 ±0 的符号取 ±π、L.z 为 ±0 时 [+s, −s]、下限以双精度比较而上限以 f32 比较的不对称、0 ÷ 0 故障）；三种控制块的字；严格的更新调度；期限的三个区间、移位作用于和、NaN；处理程序无目标时不投递不抽取不动期限；模式 0 的油门块加转向块与期限；发射字节 4/3/2/1/0 的转向比例与周期倍数；模式 1/2 只转向；安装失败后的更新故障；热寻的放弃（偶数投递并设 时钟 + 4 周期，奇数不投递）、点积 < 0 即使在前方也抽取、模式 1 也抽取；距离 ≤ 120、前方且同向、模式 2、追踪程序都不抽取。
  - [guidance.test.ts](../../../../../src/core/rules/guidance.test.ts)（52 项）：G 的初值与三种故障；`initialHoming` 无目标与有目标；阶段 0 的时钟化与无制导满油门块、追踪导弹无控制；解除保险严格且该次不检查引信；寿命严格到期熄火、阶段留在 2、不检查引信；检查严格到期并按间隔排下次；冲突 29 两种取值（含奇数与负间隔的 SAR）；追踪导弹按 150 选择（含 NaN），与冲突 29 参数无关；起爆严格到期进入 4；缺 G 或缺控制器故障；接触（盒内、r² 严格、需有盒、盒面严格、内框转近炸、不排除发射者）；近炸（半径严格、按 f32 d² 比较、阵营掩码与目标例外、0x6c87f/0x6c07f/0x93f80 的全表与种类 11 不跳过自身、发射者或目标失效、五种不过滤的状态、按遍历次序取第一个、非阶段 2 故障）；爆炸受害者筛选（含停靠者）；衰减的八个距离、向零截断、0 ÷ 0 故障；遍历次序、发射者在内、`contact` 距离为 0、停放者跳过、逐个惰性筛选；`0x2b628` 的冲量、三轴速率与符号、终止时刻（6 次抽取）、小伤害时 6 次抽取且三轴不激活（并替换原有的定时旋转）、`0xf9c7c` 的 13 个种类不抽取不写入。
- **检查：** `pnpm exec vitest run src/core/rules/steering.test.ts src/core/rules/guidance.test.ts` 87 项通过；`pnpm exec vitest run src/core tools/engineering-boundaries.test.ts` 70 个文件 2313 项通过；`pnpm check`（typecheck、lint、241 个文件 7696 项测试、build）通过，build 的大块警告为既有。
- **rubber-duck：** 对照 H5、CR-02/05/09/11 与下文原生事实审阅全部四个文件，无阻塞、无非阻塞问题。
- **simplify：** 采纳：`vectorDistance` 改用 speed-match.ts 已导出的 `squaredDistance`（同为 `0x56b50`，加法次序只差交换律）；发射字节的两张表合为 `launchProfile`；去掉模式 0 中随即被更新覆盖的距离写入；`advanceGuidance` 共用冻结的 `NONE`；删去一项因速率太小、定时旋转必不激活而无法区分的测试。未采纳：缓存转向限值、避免分数元组、在引信中先判阵营（收益可忽略，降低可读性）；把 `ControlBlock`/`AxisControl` 移到规则或 contracts 层（需改 `systems/pipeline.ts`，超出写入范围，见交接）。
- **文档影响：** 原版事实属于 executable 的 H5，按协调者 2026-10-10 的答复不在本项写入范围，由协调者在整合后写入下列文本（英文，executable.md 的语言）；`docs/engineering/modules/core.md` 不逐个列出 P3-07 的规则模块，无需更新；U-008 状态不变；STATUS 与 tasks.md 无变化。
- **建议写入 H5 的文本**（均为 Confirmed (code)，证据：被忽略的 `local/research/p3-07/motion-hit/out/p10.txt`、`p11.txt`、`p14.txt`、`p23.txt`、`p29.txt` 的原生指令，常量按数值从映像读出，不写文件；P3-07/32）：

  ```text
  - Phase 0 (append): the block `0x2ac10` passes straight to `0x21fd8` for an unguided missile is scale 1.0, the
    three axes with clear, set and value 0, speed flag 1 and factor 1.0 (P3-07/32).
  - Install (replace the limit formula): C+0x104 := F(D(D(record +0x24 × f64 `0x17232c`) × f64 `0x172334`)) and
    C+0x100 its negation; the constants are 3.1415927 and 0.005555555555555555, not the nearest doubles of π and
    1/180, so for some whole degrees (5° the first) a differs from F(+0x24 × π ÷ 180). C+0x114 is a bit copy of
    record +0x2C and C+0x110 its negation. The same for +0x28 into C+0x108/+0x10C.
  - Handler mode 0: the turn fractions are the f32 values 1.0, F(0.65) and F(0.2); `0x5d41c`(S, 1.0) posts
    {scale 0, all three axes 0, speed flag 1, factor F(1.0 × S+0xC8)}. `0x5c584` stores the same distance the
    update stores again.
  - Target point: lead := F(D(D(d ÷ v) + S+0x64) × w), with d the f32 distance and v, w the f32 speeds; each offset
    F(D(R3_i × lead)) is stored before the sum, point_i := F(D(P_i + offset_i)).
  - Steering: the angles are stored as f32 (S+0x88, S+0x8C), but the lower test compares the unrounded angle with
    −a (an unordered compare gives −sat) and the upper test the f32 store with +a; the fraction is
    F(D(F(angle) ÷ D(a − (−a)))). The control block is {S+0xCC, 1, 1, fA, 1, 1, fB, 1, 0, 0, 0, 0}: rows 1 and 2
    cleared and set, row 3 cleared only, speed flag 0; on the missile path the unwritten words are 0.
  - Deadline: the shift applies to the sum (sample + period); an unordered distance takes the quarter branch.
  - Heat seeker: the distance test is > 120.0 (f32, ordered); the dot product is (y·y′ + z·z′) + x·x′ in double,
    and an unordered result goes on to the flag test.
  - Fuse: the squared distance is `0x56b50`(missile P, craft P) stored as f32, the value `0x29bf4` also computes (H7).
  - Blast shake `0x2b628`(missile, missile block, victim, damage): nothing, and no draw, when the victim's kind is
    in `0xf9c7c`. Otherwise u = D(damage × f64 `0x170f20` (0.0014285714285714286, 1/700)); A = F(u);
    B = F(D(u × f64 `0x170f28` (0.7142857142857143, 5/7))), replaced by f32 `0x3db2b8c3` = F(f64 `0x170f30`
    (0.0872664638888889), about 5°) when the unrounded u × 5/7 is below that f64 (an unordered compare too). The
    victim's block gets +0x1C–+0x24 := the missile's row 3 (bit copies), +0x18 := 1 and +0x28 := F(D(missile
    speed × f64 `0x170f18` (0.0125))). Per row k = 1, 2, 3, two draws: rate F(D(D(rand × f32 `0x170f38` (1/32767))
    × D(A − B)) + B)) at +0x38/+0x3C/+0x40 with decay f32 `0x3ec90fdb` (π/8) at +0x44/+0x48/+0x4C; when the second
    draw has bit 1 set, the sign bits of both flip. Then end_k := F(D(D(rate_k ÷ decay_k) + t) + f64 `0x170f3c`
    (−0.5)) at +0x50/+0x54/+0x58 and the active flag +0x2C/+0x30/+0x34 := end_k > t (ordered), with t the f32
    mission time `0x18641c`. Derived: a row turns only when |rate| > π/16, i.e. for damage above about 137;
    weaker blasts set only the impulse (and still draw 6 times).
  ```

- **交接给 20 与协调者：**
  - **AI 程序数据缺口（需协调者处理）：** 追踪程序读内置程序记录 1、2 的 +0x14、+0x24、+0x2C（`SteeringProgram`）。它们是导入内容 `data/ai-programs` 的 `builtInPrograms`，但 CR-01 的世界创建输入与 `WorldRuleData` 都没有 AI 程序，Core 目前拿不到。20 的写入范围只有 `missiles.ts`，无法接入；建议在 20 之前新增解除阻塞的子任务（或扩大 20 的范围）：修订 P3-02 CR-01（及 CR-14 若影响快照或规则版本），把记录 1、2 的这三项加入静态规则数据，并在世界创建时校验 +0x14 为非负 i32。原版数值不能写进代码。
  - **调用次序：** 首次回调：`combat.guidance = initialGuidance(record, ruleData.missiles[i].fuseRadiusSquared)`；无制导置 `contact = null`；追踪程序 `initialHoming(program, call, rand)`，按返回次序投递 `steer`，再投递状态 7。状态 7：追踪程序在 `isHomingUpdateDue` 时以模式 1 调用 `runHomingProgram`，然后 `advanceGuidance`（`control` 直接经 `0x21fd8` 应用，`expire` 投递到期请求，`detonate` 已写好）。状态 6：原版 `0x5ddd4` 以模式 2 调用处理程序（会投递转向块，不抽取），由 20 决定是否复现。起爆：先构造爆炸，再遍历 `blastHits`，每项先 `blastShake(victim, block, missile, damage, MotionStep.time, rand)` 再调用 15 的 `0x2a40c`。
  - **分层：** `steering.ts`、`guidance.ts` 自 `systems/pipeline.ts` 只作类型导入 `ControlBlock`/`AxisControl`（CR-05 的形状）。若要避免规则层依赖 systems，可在之后把这两个类型移到 `src/core/contracts/` 或规则层，由 `pipeline.ts` 重新导出。
  - 未建模：`0x5c8b0` 每个取样只算一次的缓存（Core 的回调时钟都大于 0 且两次调用不同时钟，不可观察）；安装失败后目标重新有效的分支（实体 ID 不复用，不可达，作故障）。
