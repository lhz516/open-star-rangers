---
type: plan
status: active
phase: P3
task: "07"
subtask: "19"
updated: 2026-10-10
---

# 19 — 碰撞

**契约来源：** [spec](../spec.md) 的 S-06（碰撞）、AC-08（碰撞部分）；[命中与碰撞](../spec.md#命中与碰撞)；P3-02 spec 的 [CR-02](../../02/spec.md#cr-02-实体的战斗状态d-01)（`proximity` 与碎片耐久）、[CR-03](../../02/spec.md#cr-03-移动块的模式-12d-03)（写到 `spinning` 块时的抽取）、[CR-06](../../02/spec.md#cr-06-领域事件与次序d-01)（碰撞阶段的事件次序）、[CR-07](../../02/spec.md#cr-07-实例化扩展与系统流水线d-01d-03)（`collision` 阶段）、[CR-09](../../02/spec.md#cr-09-与-p3-06-的接口d-03)（冲量与定时旋转的写入、自动驾驶取消）。
**依赖：** 03, 15, 18。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 按 H6 实现 `collision` 阶段（`collision.ts` 导出 `run`），只对状态 ≥ 7 的对象，两遍都用本 tick 移动后的位置：
  - **玩家对其他对象（`0x29670`）：** 门禁与玩家条件（不停靠、状态 ≥ 7；不检查被毁、Warp 与被毁视角）；对象为机体（`0xffffe`）与碎片（有 DEBRIS 记录、耐久 > 0）；检测为玩家中心在对方形状中（12 的 `0x29bf4`、`0x29d58`），每个重叠对象都处理。
  - **其他对象之间（`0x29934`）：** A 组（种类 `0x382`）与 B 组（`0xffc7c`）按数组次序；A×A（i < j）与 A×B，B×B 从不检测；只测 A 成员的中心在对方形状中。
  - **响应（`0x29eb8`、`0x2a12c`）：** 伤害公式、除以 (3 − 组) 的位置与大型种类的减半；冲量与定时旋转写入机体移动块（CR-09）：`0x29eb8` 写双方，`0x2a12c` 只写第一方（冲突 42）；每次响应 6 次抽取。写到 `spinning` 块（碎片）时没有字段可写，但抽取照常发生（CR-03）。
  - **碎片接触计数：** 每 tick 的局部量（所有碎片共用，不持久，不进状态与快照）：+0x5C 非零的碎片对玩家只在计数 < 组 × 2 + 2 时造成伤害，超限的接触也计数。碎片的耐久在每次接触都扣减，≤ 0 时调用 18 的击落（`0x24a6c`）。
  - **伤害：** 经 15 的 `0x2a5fc`，攻击者为 `none`，`hit` 的原因为 `collision`（碎片接触也是）。
  - **`proximity`：** 两遍写入（H6），供 P3-08 读取。
  - **自动驾驶取消：** 原版在玩家对机体的每次接触末尾调用 `0x27edc(0)`。P3 中没有可写的状态，不执行；P4 接入自动驾驶时在这一位置加入（CR-09）。
- **测试：**
  - 两遍的次序与筛选；A、B 组与 B×B 不检测；几何边界。
  - 伤害、组因子与大型减半；冲量与定时旋转的写入与第一方限定；6 次抽取（含碎片）。
  - 碎片接触计数的边界（第 组 × 2 + 2 次与下一次）与每 tick 重置；碎片的耐久与击落。
  - `proximity`；同 tick 多次碰撞与死亡只发一次 `object-destroyed`。
  - 期望独立推导。

## 不包含

- 弹丸命中（17）；运动与冲量的消费（P3-06、22）；自动驾驶（P4）；碰撞可视化（P3-04）。

## 关键文件与契约

- `src/core/systems/collision.ts`（11 新建）：碰撞阶段。
- 使用 12 的 `src/core/rules/collision-shapes.ts`、15 的 `0x2a5fc`、18 的碎片实体与击落函数，以及 P3-06 移动块的冲量与定时旋转字段。
- 计划新增：`src/core/rules/collision.ts` 及相邻测试。

## 写入范围

- `src/core/systems/collision.ts`：碰撞阶段。
- `src/core/systems/collision.test.ts`：碰撞系统测试（新建）。
- `src/core/rules/collision.ts`：碰撞判定、响应与伤害公式（新建）。
- `src/core/rules/collision.test.ts`：碰撞规则测试（新建）。
- `src/core/world/world.test-support.ts`：导出 `withEveryKindBound`（为测试世界中没有静态规则数据的种类补上不含任何点的形状），`testState()` 使用它。
- `src/core/systems/energy.test.ts`、`src/core/systems/area.test.ts`、`src/core/replay/snapshot.test.ts`：测试世界经 `withEveryKindBound`。
- `src/core/systems/pipeline.test.ts`：阶段表加入 `collision` 的 `run`。

## 验收标准

- [x] AC-08（碰撞）：`0x29670`、`0x29934` 的次序、分组、筛选、检测与伤害公式按 H6；组因子与大型减半在正确位置；响应按 H6 写第一方或双方，每次 6 次抽取。
- [x] AC-08（碰撞）：碎片接触计数是每 tick 的局部量，边界正确；`hit` 的原因为 `collision`；`proximity` 正确；不从模型或渲染网格推导碰撞体；自动驾驶取消不执行。
- [x] `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts`、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- Node 测试：以合成实体放置重叠与相邻位置，经正式 `step` 断言伤害、事件、移动块字段与抽取次数。
- 冲量与定时旋转被 P3-06 积分消费的集成在 22；原版对照见 27。

## 完成证据

- **实现（基于认领提交 `064897d`，提交前快进到目标分支 `6d451f1`，其中含 17 的集成与本项获批的写入范围扩展）：**
  - [rules/collision.ts](../../../../../src/core/rules/collision.ts)：三个种类掩码（玩家对 `0xffffe`、A 组 `0x382`、B 组 `0xffc7c`）；擦碰 `0x29eb8`（`glancingContact`：第一方沿第二方第 3 行、以第二方速度击退，第二方沿第一方第 3 行、以 F(第一方速度 × 2.0) 击退；X = |行积 − 1| × (速度和)，点积按 (y + z) + x；第二方取取反的翻滚）与反弹 `0x2a12c`（`bounceContact`：P₁ − P₂ 逐分量存 f32 后经 `0x56aa8` 归一化；对 −R2₁ 逐分量原地覆盖求反射项 w，后一分量的点积用已覆盖的分量，不是精确投影；只写第一方，方向 F(R2₂ + w)、速度 F(速度₁ × 1.2)；Y = (速度和) × 2.0）。翻滚：hi、lo 取未舍入的 X（Y），lo 的因子为 f64 `0x3F7D41D41D41D41E`（比 1/140 大一个 ulp），未舍入积低于 0.0872664638888889 时取 f32 下限；每轴 rate = F(rand × C × (hi − lo) + lo)、decay = f32 π/4，下一次抽取的位 1 同时翻转两者的符号（每次响应 6 次抽取）；end = F((rate ÷ decay + t) − 0.5)，只在 end > t 时启用该轴（否则为 null）。原始伤害 2 × trunc(F(X)) + 150：截断超出 i32 为 Core 故障（`FISTP` 的无效操作异常未屏蔽），两次整数加法回绕。`collisionDamage` 经 energy.ts 的 `quotient`（`IDIV`，向零截断）除以 (3 − 组)；`halved` 为 `SAR 1`；`fragmentContactLimit` = 组 × 2 + 2。
  - [systems/collision.ts](../../../../../src/core/systems/collision.ts)：`collision` 阶段的 `run`，在本 tick 的 f32 时间 t（`motionStep` 的 `time`）先后运行两遍，读移动后的位置，不写位置：
    - `0x29670`：玩家实体存在、不停靠、状态 ≥ 7（不看被毁标志与 Warp）。机体按遍历次序（种类位升序、分配次序）、活动且状态 ≥ 7；玩家中心在机体形状中（12 的 `craftContainsPoint`）时，大型种类（`0xf9c7c`）反弹、其他擦碰，伤害 ÷ (3 − 组) 先给玩家、再给机体（大型种类减半）；每个合格机体（接触与否）的 `proximity` 为玩家与 f32 的 d²。`0x27edc(0)`（自动驾驶取消）不执行，位置写在模块注释中（CR-09）。碎片：活动、状态 ≥ 7、有 DEBRIS 参数、耐久 > 0，玩家中心在 DEBRIS 形状中（`debrisContainsPoint`）时，+0x5C = 0 的反弹、全额伤害；+0x5C ≠ 0 的擦碰、原始伤害 `SAR 1` 后再除，只在本遍的局部计数 < 组 × 2 + 2 时伤害玩家，计数包括超限的接触；碎片耐久每次接触都减去该伤害（i32），≤ 0 时调用 18 的 `shootDown`。
    - `0x29934`：A 组再 B 组各遍历一次建表（活动且状态 ≥ 7）；每个 A 成员对其后的每个成员测试，A×A 每对一次、A×B 全部、B×B 从不；只测 A 成员的中心；伤害先 A 成员、后另一方（大型减半）；A 成员的 `proximity` 在为空或严格更远时改为该成员。表中成员在本遍中被毁后仍参与（推动但不受伤）。
    - 响应写入机体移动块（`craft` 与 `warp` 模式，CR-09）；碎片的 `spinning` 块没有字段，不写，但 6 次抽取照常（CR-03）。每次响应先从世界 RNG 抽取并写回，再经 15 的 `applyContactDamage`（攻击者 `none`、`hit` 原因 `collision`、受击者已被毁时不处理），所以事件按两遍的对次序发出；致死时 18 的 `constructExplosion` 在本阶段直接创建爆炸与碎片（CR-08）。没有规则数据的种类的活动机体为 Core 故障（`collision.craft-shape`，同 targeting）。
  - 获批的范围外改动（测试夹具）：[world.test-support.ts](../../../../../src/core/world/world.test-support.ts) 导出 `withEveryKindBound`，为测试世界中任务不能实例化、却被测试分配的种类补上静态规则数据（形状只有原点处的一个空盒、不含任何点，没有挂点偏移、部件与 DEBRIS），`testState()` 使用它；energy.test.ts、area.test.ts、snapshot.test.ts 的自建世界经它；pipeline.test.ts 的阶段表加入 `collision`，`collisionStage` 为函数。原因：碰撞阶段每 tick 读取每个活动机体的形状，没有规则数据的种类为故障（创建的世界绑定每个可实例化种类），这些测试此前分配了这样的机体。
- **测试：** 期望由 H6–H8 独立推导：
  - [rules/collision.test.ts](../../../../../src/core/rules/collision.test.ts)：掩码；擦碰的正面情形（X = 80，逐轴 rate/decay/end 与符号位）、行的按位复制与 F(2 × 速度)、hi 与 lo 取未舍入的 X（搜索使 F(X) 分别改变 hi、lo 结果的速度）、lo 下限区间无轴启用、end = t 时不启用（严格）、原始伤害的 i32 回绕与超出 i32 的故障；反弹的正面情形、原地覆盖的反射项（与精确投影不同，按 H6 的逐分量参照）、偏移先存 f32（搜索出与不存不同的位置）、重合中心、Y 与负速度和；除以 3/2/1 的向零截断、`SAR 1` 向 −∞、限额 2/4/6、组 3 除零故障。每次响应恰 6 次抽取。
  - [systems/collision.test.ts](../../../../../src/core/systems/collision.test.ts)（机体经正式 `step`；碎片因移动阶段在 22 之前对 `spinning` 块故障，与 destruction.test.ts 一样跑除移动外的各阶段，22 接入后改为正式 `step`）：组 0/1/2 的擦碰伤害 114/171/342 与事件字段、击退与相反翻滚、本 tick 移入接触；反弹只推玩家、机体半伤（含奇数伤害向下取整）、大型机体自有的击退与翻滚保持移动后的值、玩家 `warp` 块照写；被毁标志置位的玩家与机体照常推动、无伤害、每次接触恰 6 次抽取；第二次响应在第一次接触的伤害抽取之后（孪生世界对照）；多个接触按遍历次序；只测玩家中心、用机体的行（盒形状随姿态命中与否）；d² = r² 的边界；停放、停靠、状态 < 7 的机体不参与也不写 `proximity`；无玩家实体、玩家停靠或状态 < 7 时第一遍什么都不做；玩家在同 tick 被毁只发一次 `object-destroyed`，之后的接触只伤机体；碰撞致死在本阶段创建爆炸与碎片，新碎片本 tick 不参与；无规则数据的种类为故障；碎片的半伤、组 1 限额 4、计数每 tick 重置、大型记录碎片不受限额、耐久与击落、筛选（无参数、耐久 ≤ 0、待移除）、玩家被毁时每次接触 6 次抽取且耐久照减；A×A 与 A×B 的对次序、B×B 不测、A×A 只测前者的中心、A 对大型 B 反弹、`proximity` 的严格替换（等距保留、B 成员保留玩家）、本遍中被毁的成员仍在表中、第一遍被毁的机体不入第二遍的表。
  - 关键差异经变异检查：限额 `<=`、`proximity` 的 `>=`、去掉减半、hi/lo 取 F(X)、end `>=`、反射项不覆盖、偏移不存 f32、符号位改位 0、玩家停靠门禁，都使测试失败。
- **检查：** `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts`（81 个文件，2,526 项通过）；`pnpm check` 通过（252 个文件，7,909 项，`pnpm typecheck`、`pnpm lint` 与生产构建成功）；`pnpm check:compliance` 通过（0 项发现）。
- **rubber-duck：** 无阻断问题；采纳 3 项覆盖缺口：碰撞阶段内的爆炸与碎片创建（CR-08）、`warp` 块的写入与大型第二方保持不变、响应在前一次接触的伤害抽取之后。认同以测试夹具为未绑定种类提供规则数据，而不在规则中跳过。
- **simplify：** 采纳：除法复用 energy.ts 的 `quotient`；第二遍内层改为索引循环（不再每个成员切片）；`opposite` 按 `ROTATION_AXES`；响应的物体读取改为模块级函数。未采纳：阶段导出的间接层（与其他阶段模块一致）；类型改为私有（测试与 `ContactRule` 使用）；内联组 × 2 + 2（属规则模块）；每次接触的 `RandStream`、`proximity` 与形状查找的缓存（对象数小，与 damage.ts 一致）；`push` 中去掉复制（冻结的响应对象不应成为可变的世界状态）。
- **文档影响：** 响应算术的原版事实（hi/lo 取未舍入的 X、lo 的因子与下限、逐轴次序与符号位、end 与严格启用、偏移存 f32 与原地反射项、原始伤害的截断）提议补入 [executable 的 H6](../../../../original/formats/executable.md#h6-collision-passes--confirmed-code-collision-helper-spot-checked)（接在 Responses 一条的 “Mode 0 consumes knock and tumble, mode 3 the tumble, mode 2 (fragments) neither.” 之后），由协调者写入；来源是 03 的私有只读探针输出（被忽略的 `local/research/p3-07/motion-hit/collision/out`）中 `0x29eb8`、`0x2a12c` 的原生指令；U 项不变。提议文字：
  > Arithmetic (Confirmed, code; the native listing of P3-07/03, read for P3-07/19): X and Y stay unrounded in the x87 register for hi and lo; only the raw damage reads their f32 store. hi = F(X × 0.01) (`0x2a12c`: F(Y × 0.0125)); lo = F(X × c) with c the f64 `0x3F7D41D41D41D41E` (one ulp above 1/140), replaced by the f32 `0x3DB2B8C3` when the unrounded X × c is below the f64 0.0872664638888889 or unordered. For the axes about rows 1, 2 and 3 in turn (block +0x38/+0x44, +0x3C/+0x48, +0x40/+0x4C): rate = F(rand × C × (hi − lo) + lo) with C the f32 1/32767, decay = the f32 `0x3F490FDB` (π/4); the next rand with bit 1 set flips both signs. Then each end = F((rate ÷ decay + t) + (−0.5)) (+0x50/+0x54/+0x58) and each flag = end > t (`SETA`: strict, false when unordered); `0x29eb8` copies the negated rates and decays, the ends and the flags to object 2. While lo is at its floor, hi < 0.123, so rate ÷ decay < 0.5 and no axis turns. In `0x2a12c` the offset P₁ − P₂ is stored f32 per component before `0x56aa8`; with v = −R2₁, w_x = F((d × 2.0) × n_x) is stored over v_x, then w_y and w_z likewise, each d = (n_y v_y + n_z v_z) + n_x v_x over v as already overwritten; the knock direction is F(R2₂ + w) per component and its speed F(speed₁ × 1.2). raw = 2 × trunc(F(X)) + 150 through `0x74518` and `FISTP` (a truncation beyond i32 raises the unmasked invalid-operation exception), then two wrapping integer additions.[core.md](../../../../engineering/modules/core.md) 与 [source-structure.md](../../../../engineering/source-structure.md) 的模块清单按 goal 归 28。STATUS 与阶段索引无需改动。
