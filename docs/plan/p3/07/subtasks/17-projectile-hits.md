---
type: plan
status: active
phase: P3
task: "07"
subtask: "17"
updated: 2026-10-10
---

# 17 — 弹丸运动与命中

**契约来源：** [spec](../spec.md) 的 S-05（弹丸）、S-06（命中）、AC-07（弹丸部分）、AC-08（规则部分）；[弹丸与导弹](../spec.md#弹丸与导弹)、[命中与碰撞](../spec.md#命中与碰撞)；P3-02 spec 的 [CR-02](../../02/spec.md#cr-02-实体的战斗状态d-01)（`ProjectileCombat` 与碎片耐久）、[CR-03](../../02/spec.md#cr-03-移动块的模式-12d-03)（`linear` 块的运动）、[CR-05](../../02/spec.md#cr-05-命令原因码与内部请求d-01)（弹丸的 `expire`）、[CR-06](../../02/spec.md#cr-06-领域事件与次序d-01)（`hit` 的 `projectile` 结局与移动阶段的事件次序）、[CR-08](../../02/spec.md#cr-08-直接创建与对象生命周期d-01)（碎片击落后的爆炸）。
**依赖：** 03, 14, 15, 18。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **`linear` 运动（CR-03，H1）：** 模式 1（`0x22818`）的运动函数：先把位置存入 `previousPosition`，再按本 tick 步长平移（每轴一次 f32 写回）。弹丸与爆炸共用；接入移动阶段归 22。
- **弹丸的回调与到期（H2，`0x259b0`）：** 首次回调即请求活动，并写计时块（到期 = 首次回调时钟 + 炮 +0x24）；到期时投递 `expire`，在请求处理中经 `0x25f48` 进入待移除并清空 `shooter`；跳弹后的首次状态 8 回调把 `firstHitPending` 清为 false，到期改为时钟 + 0x80。
- **命中检测（H3，`0x28450`）：** 在弹丸（种类 21、状态恰为 7、`hitTest`）自身移动之后立即调用，调用位置由 22 接入：
  - 按 H3 的线段几何（`0x2874c`、`0x28b48`）、前后位姿与遍历次序：第 1 遍机体，第 2 遍碎片，首个命中即结束；
  - 发射者、友方、已被毁源、停放与停靠对象的过滤按 H3；
  - **死目标遮挡**：命中已被毁的机体时 `0x2a40c` 什么都不做，但遍历已经结束，弹丸继续飞行，其后的对象本 tick 不再检测（冲突 40）；不改为跳过死目标继续遍历；
  - 不以模型包围盒、渲染网格或大包围球代替。
- **命中结果（H4）：**
  - 机体：调用 15 的 `0x2a40c`（射击统计、归因与受击表现时钟在其中）。返回值非 0（护盾吸收全部）且受击者不是玩家（或玩家视角模式为 0x11）时跳弹（`0x25dc4`：状态 8，5 次抽取，改写位置、姿态与速度，此后不再检测）；否则移除（`0x25f48`）。`hit` 的 `projectile` 字段与此一致。
  - 碎片（第 2 遍）：扣减碎片耐久；耗尽时调用 18 的击落（`0x24a6c`），碎片在下一 tick 经 18 的到期处理转为爆炸，不直接移除。碎片受击不发 `hit`。
- **高速弹丸：** 一个 tick 两端都在目标外而路径穿过、擦边与完整漏过的情形，按 H3 区分原版行为与固定步长引入的差异。
- **测试：** 运动与到期；线段几何、严格边界与内框；过滤、两遍次序与首个命中即停止；死目标遮挡；跳弹的条件、5 次抽取与之后的到期；移除；碎片耐久与击落后下一 tick 的爆炸；高速情形；期望独立推导。

## 不包含

- 移动阶段的接线与命中检测的调用位置（22）；`0x2a40c` 的统计、归因与受击表现时钟（15）；碎片的击落与到期处理（18）。
- 导弹（20）；机体之间的碰撞（19）；受击闪烁的绘制（P3-12）。

## 关键文件与契约

- `src/core/systems/projectiles.ts`（11 新建）：弹丸的按种类更新与 `expire` 请求。
- 使用 12 的静态规则数据、15 的 `0x2a40c` 与 18 的碎片实体与击落函数。
- 计划新增：`src/core/rules/projectile-motion.ts`、`src/core/rules/hit-tests.ts` 及相邻测试。

## 写入范围

- `src/core/systems/projectiles.ts`：弹丸更新、到期与命中结果。
- `src/core/systems/projectiles.test.ts`：弹丸系统测试（新建）。
- `src/core/rules/projectile-motion.ts`：`linear` 运动与弹丸计时（新建）。
- `src/core/rules/projectile-motion.test.ts`：运动与计时测试（新建）。
- `src/core/rules/hit-tests.ts`：线段几何、遍历与跳弹（新建）。
- `src/core/rules/hit-tests.test.ts`：命中测试（新建）。
- `src/core/systems/pipeline.test.ts`：弹丸 `expire` 已实现，访问点表中的占位故障行改为路由测试。

## 验收标准

- [x] AC-07（弹丸）：`linear` 运动、计时块、到期与跳弹后的到期按 H1、H2。
- [x] AC-08（规则）：H3 的几何与判定次序可独立断言，覆盖严格边界、内框、各类过滤、两遍次序与首个命中即停止；死目标遮挡照原版。
- [x] AC-08（规则）：高速弹丸的穿过、擦边与完整漏过按证据区分原版行为与步长误差；跳弹（5 次抽取）与移除的条件正确；碎片耐久耗尽后在下一 tick 转为爆炸；不从模型或渲染网格推导碰撞体。
- [x] `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts`、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- Node 测试：几何函数以构造的前后位姿断言；系统测试以合成实体断言命中结果、事件与跳弹。
- 流水线中的命中集成测试在 22；原版对照见 27。

## 完成证据

- **实现（基于认领提交 `064897d`）：**
  - [projectile-motion.ts](../../../../../src/core/rules/projectile-motion.ts)：`0x22818`（`moveLinear`）：先把移动前的位置存入块的 `previousPosition`，再每轴 F(v × 步长 + P)，一次 f32 存储，速度不变、不读块的速度；返回新位置与块的副本，供 22 在移动阶段分派（弹丸与爆炸共用）。计时块：首次回调 `projectileTimer`（时钟 + 炮 +0x24，标志为真）、首次状态 8 回调 `lingerTimer`（时钟 + 0x80，标志清除）、`isTimerDue`（到期 ≤ 时钟；没有计时块时不到期，同原版的空指针判断）；时钟不可表示（负或越过安全整数）为故障。
  - [hit-tests.ts](../../../../../src/core/rules/hit-tests.ts)：`0x2874c` 粗测（`segmentMeetsBounds`：世界轴向盒，角点 F(P + 界)，不读目标的行；两端严格越过同一面即拒绝；任一端严格在内即命中；否则按 x 下、x 上、y 下……的次序试各面，d = F(p1 − p0) 为 ±0 的轴跳过；t = F((面 − p0) ÷ d) ∈ [0, 1]，另两坐标 F(d × t + p0) 在面内，均含边界）；`0x28efc` 细测（`refinedImpact`：两端经 `0x56dc0` 变到目标坐标系；两端都严格在内框中即未命中；逐盒 `0x28b48`：同样的严格拒绝、无内部判定，六个面全试，取严格更小的 t，并列保留先到的面与盒；面码 x 下 0、y 下 1、z 下 2、x 上 3、y 上 4、z 上 5；命中点与局部点为 F((p1 − p0) × t + p0)，差不先存为 f32）；`segmentHitsShape`（有盒时粗测与细测都须通过，无盒时只粗测、无命中点）；`0x28450` 的遍历 `findProjectileHit`（第 1 遍种类 `0xfffff`：活动状态为 1、状态 ≥ 7、不是发射者，不看阵营与被毁标志；仅当第 1 遍无命中时第 2 遍碎片：另需有 DEBRIS 参数、耐久 > 0；首个命中即结束，不取最近）；碎片的选择 `deflectsOffFragment`（+0x5C 为 0 时 1 次抽取、(rand & 3) = 0 跳弹，小碎片不抽取并移除）；跳弹 `0x25dc4`（`ricochet`：位置为命中点，无命中点时为受击对象的位置；奇数绕第 2 行（`0x22a50`）、偶数绕第 1 行（`0x228cc`）转 F(rand × C × 1.2217304944… + 2.5307274527…)；再按转后的第 3 行逐轴 F((rand × C × 82.5 + 55) × 分量)；共 5 次抽取，块的速度与 `previousPosition` 不变）。碰撞体只取静态规则数据的形状（craft §3.5.1、DEBRIS），不读模型或渲染网格。
  - [projectiles.ts](../../../../../src/core/systems/projectiles.ts)：`0x259b0`（`updateProjectile`）：首次回调写计时块并立即请求状态 7（不等表现、无 Warp 保持）；状态 7 到期投递 `expire`；首次状态 8 回调改写计时块，其后到期投递 `expire`；待移除时释放计时块并请求离开；状态 0 为 Core 故障。`0x25f48`（`expireProjectile`）：待移除并清空 `shooter`。`0x28450` 的入口 `hitTestProjectile`（由 22 在弹丸自身的模式 1 移动之后调用；只测状态恰为 7 的弹丸）：机体经 15 的 `applyShotHit`（伤害为炮 +0x1C），按其结果跳弹（状态 8、5 次抽取）或移除；结果为 null（已被毁的受击者）时什么都不做，遍历也已结束。碎片按 `deflectsOffFragment` 跳弹或移除，再扣减耐久（i32），≤ 0 时调用 18 的 `shootDown`，下一 tick 经 18 的到期处理爆炸；碎片受击不发事件。
- **测试（期望由文档、原生指令的算术与 f32 网格手算，不调用被测函数推导）：**
  - [projectile-motion.test.ts](../../../../../src/core/rules/projectile-motion.test.ts)：移动前位置、每轴 f32 存储（2²⁴ 处小于半个间距的位移不动、2²⁴ + 3 舍入到 2²⁴ + 4）、步长缩放、参数不变、溢出故障；计时块的到期、0x80 停留、到期的相等边界、无计时块、时钟故障。
  - [hit-tests.test.ts](../../../../../src/core/rules/hit-tests.test.ts)：粗测的世界轴向放置、角点 f32 舍入（2²⁴ + 1 舍入后擦边命中）、严格拒绝与擦边、端点在内（含长度 0）与在面上、远长于目标的线段穿过、绕过角点的漏过、t = 0 与 t = 1、−0 分量跳过（否则除以 −0）；细测的目标坐标系、六个面码、跨盒取最近与同 t 保留先到的面、线段完全在盒内不命中而离开盒时命中出口面、内框（两端在内、一端在外、端点在内框面上）、命中点用未舍入的差（8,388,609 而非 8,388,608）；粗测通过而细测不通过；遍历的种类与分配次序（不取最近）、停放/停靠/未激活/被毁源/发射者的过滤、友方命中、已被毁机体遮挡其后的对象、第 2 遍的逃生舱/耐久 0/未激活/停靠过滤、机体优先于更近的碎片、缺少规则数据的故障；碎片选择的抽取与条件；跳弹的两种转轴、145°/215° 的角度端点、速度分量与 5 次抽取、命中点或受击位置。
  - [projectiles.test.ts](../../../../../src/core/systems/projectiles.test.ts)：经流水线（除移动阶段）的生命周期：首次回调的计时块与状态 7、到期于相等时钟、待移除后下一 tick 离开；跳弹后的 0x80 停留（旧的到期时刻已过也先改写）；各状态的投递与故障；`expire` 请求。命中结果：全吸收时的完整 `hit`（命中点、面码、`projectile: 'ricochet'`）、跳弹位姿与 5 次抽取、发射者保留与射击统计；船体受损时移除与 1 次抽取；击毁时 `hit` → `object-destroyed` 与爆炸、弹丸移除、击杀计数；玩家受击时移除而视角 0x11 时跳弹（无盒时回到玩家位置）；被毁玩家遮挡：无事件、弹丸继续飞行、其后的碎片与机体不受影响、不抽取；只测状态 7、非弹丸故障。碎片：小碎片不抽取移除、耐久扣减、无事件；+0x5C 为 0 时 1 + 5 次抽取跳弹或 1 次抽取移除，无盒时回到碎片位置；耐久耗尽后下一 tick 的 `fragment-expired`（`explodes`）与持有碎片的爆炸。高速：穿过远小于位移的目标、擦边命中而外侧一个 f32 间距未命中；以移动后的位置作为静止目标：横穿弹道的目标在 1/32 s 步长下两步都漏过、在 1/64 s 步长下第 3 步命中——规则相同，差异只来自步长，原版在相同帧步长下同样漏过（原版自身的漏判与固定步长误差由此区分；流水线中的对照归 22、27）。
  - [pipeline.test.ts](../../../../../src/core/systems/pipeline.test.ts)（协调者批准扩大写入范围，`0c8b453`）：访问点表中弹丸 `expire` 的占位故障行删除，改为路由测试（待移除、清空 `shooter`）。
- **检查（变基到 `0c8b453` 后）：** `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts`（79 个文件，2,483 项通过）；`pnpm typecheck`、`pnpm lint` 通过；`pnpm check` 通过（250 个文件，7,866 项）；`pnpm check:compliance` 通过（0 项发现）。本项三个测试文件共 50 项。
- **rubber-duck：** 对照 H1–H4、H7、H8 与 CR-02、CR-03、CR-05、CR-06、CR-08 审阅完整改动（含本地原生指令核对的算术与次序），没有发现问题。
- **simplify：** 采纳：线段测试改为不经生成器与临时冻结对象的逐面扫描（粗测在首个通过的面返回，细测逐盒取严格更小的 t），轴向判定写成显式表达式；碎片的选择提为纯规则 `deflectsOffFragment`；`isTimerDue` 接受空计时块，去掉系统中的包装；`HIT_LINGER` 不导出；测试共用弹道常量。未采纳：不导出返回类型（与 `CraftPointTest`、`MovementItem` 等一致，供 22 使用）；复用 collision-shapes.ts 私有的 `strictlyInside`、firing.ts 私有的 `dueClock` 与其他测试文件中的 `drawNext`、跳过移动阶段的 `tick`（需改范围外文件或新建测试辅助）；`moveLinear` 原地改写块（与 P3-06 积分器的纯函数风格一致，由 22 决定接线）。
- **文档影响：** 无需改动工程文档：[core.md](../../../../engineering/modules/core.md) 与 [source-structure.md](../../../../engineering/source-structure.md) 的模块清单按 goal 归 28；STATUS 与阶段索引无需改动。原版事实建议由协调者补入 [executable.md](../../../../original/formats/executable.md) 的 H3、H2（已确认（代码），本地原生指令，`local/research/p3-07/motion-hit/out/p6.txt`、`p8.txt`、`p2.txt`）：
  - H3 中“The impact record (0x60 bytes) holds the world point p0 + (p1 − p0) × t (f32), the local point, …”改为：“The impact record (0x60 bytes) holds the world point F((p1 − p0) × t + p0) and the local point F((l1 − l0) × t + l0) of the two endpoints in the target's frame (the difference and the product stay in x87, unlike d of the face tests, which is stored as f32; one f32 store per component), the target's rows permuted and negated by the face code, and a face basis.”
  - H2 的 State 7 与 State 8 两项末尾各加：“(nothing when the pool gave the projectile no timer)”。
- **交接：** 22 在移动阶段的 `linear` 分支调用 `moveLinear`（弹丸与爆炸），块的 `hitTest` 为真时随即调用 `hitTestProjectile`（它自行只测状态 7 的弹丸），并以正式 `step` 覆盖弹丸的生命周期与流水线中的命中、漏过（本项的生命周期测试跳过移动阶段）；19 的碎片接触同样在耐久 ≤ 0 时调用 `shootDown`。
- **备注：** 炮 +0x24 为负且首次回调时钟小于其绝对值时，到期时刻为负，Core 记为故障（原版按 u32 回绕为远期）；世界创建尚不拒绝负的 +0x24，建议后续在 12 的语义检查中拒绝（真实内容的取值未见负数，未改动范围外文件）。

