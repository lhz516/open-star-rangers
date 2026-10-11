---
type: plan
status: active
phase: P3
task: "07"
subtask: "18"
updated: 2026-10-10
---

# 18 — 被毁、爆炸与碎片

**契约来源：** [spec](../spec.md) 的 S-10、AC-12；[被毁、爆炸与碎片](../spec.md#被毁爆炸与碎片)、[联合依赖与阶段时序](../spec.md#联合依赖与阶段时序)、技术决定 4、5；P3-02 spec 的 [CR-02](../../02/spec.md#cr-02-实体的战斗状态d-01)（`ExplosionCombat`、`FragmentCombat` 与表现选择器）、[CR-03](../../02/spec.md#cr-03-移动块的模式-12d-03)（`spinning` 块与 `0x218e8` 的模式 1、2）、[CR-04](../../02/spec.md#cr-04-玩家状态d-01)（`followedEntity`、`delayedExplosionClock`）、[CR-05](../../02/spec.md#cr-05-命令原因码与内部请求d-01)（`expire`、`release-held`、`hand-off`）、[CR-06](../../02/spec.md#cr-06-领域事件与次序d-01)（`explosion-started`、`fragment-expired`、`source-released`）、[CR-07](../../02/spec.md#cr-07-实例化扩展与系统流水线d-01d-03)（爆炸的激活与延迟玩家爆炸阶段）、[CR-08](../../02/spec.md#cr-08-直接创建与对象生命周期d-01)（直接创建与生命周期）、[CR-11](../../02/spec.md#cr-11-表现层的归属与已批准的差异d-01)（归表现层的部分）、[CR-13](../../02/spec.md#cr-13-其他任务在-p3-07-规则中的调用点d-03-之外的接口)（P3-11 的调用点）。
**依赖：** 06, 07, 12, 15。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **毁伤入口（X1、X2）：** 15 调用的入口：被毁对象进入 `destroyed-source`（不再更新，仍移动）；玩家只设 `delayedExplosionClock` = 时钟 + 0xC0；其他活动对象构造爆炸。种类 1 的 `0x32d74` 与种类 2 的 `0x32dec`（P3-11）在爆炸构造之前的位置写在模块注释中，不建空函数（CR-13）。
- **爆炸构造（`0x23ac8`，X2）：** 种类 22 实体：
  - `source`、`sourceKindBit`、`variant`（`large`、`other`、`missile`）；来源不是机体，或产生碎片失败时，`heldSource` 持有来源；
  - 经 `0x218e8` 的模式 1 分支（14 新建）得到 `linear` 块（`hitTest` 为 false，速度为来源当时的速度）；来源为 `spinning` 块时，先以其速度方向为第三行并重新正交化（本项加入）；
  - 产生判别值 3 的碎片；
  - 构造可在请求处理、移动阶段、碰撞阶段、延迟玩家爆炸阶段与对象更新（P3-08 的 AI 范围伤害）中直接调用，不经请求（CR-08）。
- **爆炸的生命周期（X4，CR-07）：**
  - 种类 22 的 `set-state` 请求转为激活（`0x2409c`）：写 `activationClock` 与 `removalAfterClock`，发出 `explosion-started`（位置为激活时、尚未移动的位置）；在对象更新中创建的爆炸在同一 tick 激活；
  - 被持有的来源在帧序号首次达到帧数（n₁₂ 或 n₃）时经 `release-held` 进入待移除；
  - 爆炸在激活后第 49 tick 请求移除。
- **判别值 3 碎片（X6、X7）：**
  - 按源模型第 1 列表的原序号产生，种类 1、2 跳过部件 1、2；DEBRIS 参数允许种类 1、2 第 0 部件的空引用（逃生舱）；
  - `spinning` 块（`0x218e8` 的模式 2，本项加入）与 `spinning` 运动（`0x2285c`：平移后按 `spinAxis` 旋转，每次移动转过固定弧度，不乘步长）；接入移动阶段归 22；
  - 耐久按参数的 +0x5C 类别；首次回调设到期，大型来源的碎片不到期（`never`）；
  - 击落 `0x24a6c`：置 `explodeOnExpiry` 并把到期改为 1，作为函数供 17、19 调用；
  - 玩家的第 0 部件碎片构造时写 `followedEntity`；
  - 第 0 部件碎片在首个活动回调中投递 `hand-off`；请求处理中来源进入待移除，并发出 `source-released`（玩家不移除，`removed` 为 false）。
- **碎片的到期（`expire` → `0x256e4`，X7）：** 发出 `fragment-expired`：
  - 被击落的构造爆炸（`explodes`）；
  - 玩家的逃生舱：清除 `followedEntity`，`0x32e14(1)`（P3-11）的位置写在注释中，然后进入待移除（`escape-pod`）；
  - 僚机的第 0 部件按其特例（`wingman-pod`）；
  - 其他进入待移除（`removed`）。
- **延迟玩家爆炸（X2）：** `destruction.ts` 导出 `delayed-player-explosion` 阶段的 `run`：`delayedExplosionClock` 非空、时钟严格大于它且玩家实体存在时构造玩家的爆炸，并把它清为 null。
- **不在 Core（CR-11）：** EXPL 选择、EXIC 子集、额外爆炸（`0x23fdc`）、判别值 1、2 的碎片与事件 `0x10`、闪光都归表现层。Core 不做这些抽取，不建逻辑视点或相机状态。
- **测试：**
  - 被毁分支；创建、首次回调、激活与移除时刻（含对象更新中创建的同 tick 激活）。
  - 来源的交接、释放与移除时刻：被毁后第 3 tick；激活后第 28、14 tick；爆炸在激活后第 49 tick 请求移除。
  - 玩家延迟爆炸与逃生舱到期从各自原点计时。
  - 碎片的部件序号、逃生舱的无参数部件、耐久类别、`never` 到期；击落与之后的爆炸。
  - `0x218e8` 模式 2 与 `spinning` 来源的重新正交化；`spinning` 运动。
  - 事件的内容与次序。

## 不包含

- EXPL 选择、额外爆炸、判别值 1、2 的碎片与闪光（P3-12、P3-14，CR-11）；爆炸与碎片的绘制、缩放与音效（P3-12、P3-14）；被毁视角相机（P3-12）。
- 救援（P3-11）；碎片与机体的碰撞（19）、碎片受击（17）；`linear` 运动（17）与移动阶段的接线（22）。

## 关键文件与契约

- `src/core/systems/destruction.ts`（11 新建）：毁伤入口、延迟爆炸阶段、爆炸与碎片的按种类更新，以及 `set-state`、`expire`、`release-held`、`hand-off` 请求。
- 使用 12 的静态规则数据（第 1 列表部件数、DEBRIS 映射、n₁₂ 与 n₃）与运行时种类缺省；14 的 `src/core/rules/movement-builders.ts`。
- 计划新增：`src/core/rules/explosions.ts`、`src/core/rules/fragments.ts` 及相邻测试。

## 写入范围

- `src/core/systems/destruction.ts`：毁伤、爆炸与碎片。
- `src/core/systems/destruction.test.ts`：毁伤系统测试（新建）。
- `src/core/rules/explosions.ts`：爆炸构造、变体与生命周期（新建）。
- `src/core/rules/explosions.test.ts`：爆炸测试（新建）。
- `src/core/rules/fragments.ts`：碎片产生、初态、`spinning` 运动、耐久、击落与到期（新建）。
- `src/core/rules/fragments.test.ts`：碎片测试（新建）。
- `src/core/rules/movement-builders.ts`：`0x218e8` 的模式 2 与 `spinning` 来源（14 新建）。
- `src/core/rules/movement-builders.test.ts`：构造测试。
- `src/core/world/entity-table.ts`：逃生舱判定按种类位 0、1（玩家、僚机），修正 11 的种类位误用。
- `src/core/world/entity-table.test.ts`：逃生舱测试的种类位。
- `src/core/systems/pipeline.test.ts`：`delayed-player-explosion` 的 `run`、碎片请求的路由与爆炸生命周期对既有断言的影响。
- `src/core/systems/damage.test.ts`：毁伤入口实现后的测试夹具（其他种类的规则数据）与被毁结果的断言。
- `docs/original/formats/executable.md`：X6 的指令级舍入次序与 `0x218e8` 模式 2 的事实（已确认，代码）。

## 验收标准

- [x] AC-12：X9 与 CR-08 确定的创建、首次回调、激活与移除时刻满足阶段契约；来源的交接与释放时刻正确；玩家延迟爆炸与逃生舱到期从各自原点计时。
- [x] AC-12：EXPL 选择归表现层：Core 不抽取，`explosion-started` 给出来源、来源种类、变体、位置与激活时钟；额外爆炸与判别值 1、2 的碎片不在 Core 中。
- [x] AC-12：判别值 3 碎片用原模型部件序号，覆盖允许无 DEBRIS 的逃生舱；寿命、耐久、交接、击落后的爆炸与大型来源不到期正确；`fragment-expired`、`source-released` 的内容正确。
- [x] `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts`、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- Node 测试：经正式 `step` 断言事件次序与实体生命周期；构造的期望由 X1–X11 独立推导。
- 不读取渲染状态；首次运动在 22 验证；原版对照见 27。

## 完成证据

- **实现（基于认领提交 `8b55129`，提交前快进到目标分支 `4e28f33`，其间只有规划文档）：**
  - [rules/explosions.ts](../../../../../src/core/rules/explosions.ts)：`0x23ac8` 为来源分配的爆炸（`explosionInit`：`0x218e8` 模式 1 的项给出位姿，`linear` 块不做命中检测、速度为来源当时的速度；变体按种类位 20 → `missile`、掩码 `0xf9c7c` → `large`、其他 → `other`；不持有、未激活）；玩家延迟 `playerExplosionDue`（时钟 + 0xC0）；`0x2409c` 的激活（t₀、t₀ + 0x60）、帧序号（14 × Δ 的低 32 位逻辑右移 6）、帧数（`missile` 取 n₃，其他取 n₁₂）与更新（`running`/`over`/`remove`，先看帧再看移除时刻）。
  - [rules/fragments.ts](../../../../../src/core/rules/fragments.ts)：`0x25124`（`fragmentInit`）：种类位 0、1 的部件 1、2 不产生对象也不抽取；抽取次序为标志（逃生舱与大型种类不抽）→ 推力速度 → 自旋（逃生舱为固定的 −5°）→ 轴（逃生舱为 2）；有 DEBRIS 参数时偏移 d = F((F(R1·w₂) + F(R2·w₃)) + F(R0·w₁))、位置 F(P + d)、推力方向为 d 经 `0x56aa8` 归一化、耐久按 +0x5C 类别 1200/4000；逃生舱沿第 2 行推出、无偏移、耐久 0；速度 F(基速度 + 推力 × s)，乘积不存储；第 0 部件持有来源。`0x249dc`（`debrisIndex`）；首次回调的到期 `firstExpiry`（玩家舱 0x140、僚机舱 0x780、带标志 0x80 + rand % 0xC0、大型种类 never、其他 0x3C0 + rand % 0x200）；状态 7 的到期判定与触发后清为 never；击落 `shootDown`（`0x24a6c`，首次回调前没有计时块时不起作用并返回 false，供 17、19 调用）；`0x256e4` 的结局 `expiryOutcome`；`spinning` 运动 `spinFragment`（`0x2285c`：位置 F(P + v × 步长)，再按轴字节 0/1/2 → `0x22990`/`0x22a50`/`0x228cc` 转过 `spin`，不乘步长；接入移动阶段归 22）。
  - [rules/movement-builders.ts](../../../../../src/core/rules/movement-builders.ts)：`0x218e8` 模式 2 的项 `spinningItem`（同模式 1 的位姿与 `spinning` 来源的重新正交化，基速度 F(R2 × 来源速度)，速度为来源速度）与 `0x21794` 模式 2 的 `spinningBlock`。
  - [systems/destruction.ts](../../../../../src/core/systems/destruction.ts)：`constructExplosion`（`0x23ac8`，任一阶段直接调用，不经请求；来源已移除或没有移动块时什么都不做；玩家只布设或等待延迟；否则分配爆炸 → 来源进入 `destroyed-source` → 机体经 `0x24d78` 产生碎片（玩家的逃生舱写 `followedEntity`）→ 来源不是机体或没有部件时由爆炸持有）；`destroyEntity`（15 的入口，P3-11 的 `0x32d74`、`0x32dec` 位置写在模块注释中）；爆炸回调（首次与状态 7 请求状态 7；待移除时对仍有效的持有来源投递 `release-held`，然后离开）；碎片回调（首次回调设到期并请求活动；状态 7 先交接第 0 部件的来源再投递到期；待移除时离开）；请求处理中的激活（`explosion-started`，激活时的位置与时钟）与更新（动画结束释放持有来源、过移除时刻进入待移除）、`expire`（先 `fragment-expired`；带标志者成为自己爆炸的持有来源；玩家舱清 `followedEntity`，P3-11 的 `0x32e14(1)` 位置在注释中；其余进入待移除）、`release-held` 与 `hand-off`（玩家不移除，`source-released` 的 `removed` 为 false）；`delayed-player-explosion` 阶段的 `run`。Core 不做 EXPL 选择、额外爆炸、事件 0x10、判别值 1/2 碎片与闪光，也没有相机或视口状态（CR-11）。
  - 获批的范围外改动：[entity-table.ts](../../../../../src/core/world/entity-table.ts) 的逃生舱判定改为种类位 0、1（原为 1、2，会使玩家逃生舱的分配故障），并导出为 `isEscapePod` 供 fragments.ts 共用；entity-table.test.ts 相应改用种类位 0、1，并补“种类位 2 的第 0 部件不是逃生舱”；pipeline.test.ts 中 `delayed-player-explosion` 有 `run`、碎片到期与两种请求不再故障、通用生命周期的用例只保留种类 20、21、种类 22 的移动故障用例改用已激活的爆炸；damage.test.ts 的夹具为其他种类提供没有部件的规则数据（爆炸持有来源、不抽取），被毁结果用例改为断言 `destroyed-source` 与玩家的延迟时钟。
- **原版事实（已确认，代码，P3-07/18）：** [executable 的 X6](../../../../original/formats/executable.md#x6-discriminator-3-fragments-mode-3--confirmed-code) 补充第 5、6、8 步的写回次序：`0x218e8` 模式 2 的基速度逐分量存 f32、项的速度为来源速度、模式 2 来源的重新正交化先于新模式的分支；偏移的九个乘积各存 f32 后按 (R1 项 + R2 项) + R0 项在 x87 中相加、存一次；速度为 F(基速度 + d × s)。来源是 06 的私有只读探针输出（被忽略的 `local/research/p3-07/destruction/out`）中 `0x25124`、`0x218e8` 的原生指令；常量数值只用于实现。没有新的未决项，U 项不变。
- **测试：**
  - [explosions.test.ts](../../../../../src/core/rules/explosions.test.ts)：玩家延迟与预算故障；变体映射；从机体与 `spinning` 来源构造（位姿、`linear` 块、战斗状态、分配器字段）；激活；帧序号 12 在 Δ = 56、6 在 Δ = 28，乘积低 32 位与逻辑右移；帧数与 n₃ 缺失故障；更新的 `running`/`over`/`remove` 与“先看帧”；未激活故障。
  - [fragments.test.ts](../../../../../src/core/rules/fragments.test.ts)：大型种类掩码；部件到 DEBRIS 的映射；部件 1、2 不产生且不抽取；玩家与僚机逃生舱（无参数、1 次抽取、固定自旋与轴、`parts-0-2`）；小型种类的偏移、位置、推力方向、耐久 1200 与 4 次抽取；玩家第 3 部件；大型种类不抽标志、慢推力与自旋、耐久 4000；偏移的求和次序（权重 (1, 2⁶⁰, −2⁶⁰) 区分三种次序）与速度的单次舍入（找到两次舍入不同的值）；缺参数与缺移动块故障；首次到期的五个分支、次序与预算故障；到期判定；击落（有计时块时、首次回调前不起作用）；`0x256e4` 的结局次序；`0x2285c` 的平移、三个轴与“自旋不乘步长”。
  - [movement-builders.test.ts](../../../../../src/core/rules/movement-builders.test.ts)：模式 2 的项、`spinning` 来源的正交化与基速度、模式 2 块。
  - [destruction.test.ts](../../../../../src/core/systems/destruction.test.ts)（经 `PIPELINE` 的各阶段运行，**跳过移动阶段**：模式 1、2 的运动由 22 接入，此前活动的爆炸与碎片会在移动阶段故障；22 接入后把这些生命周期测试改为正式 `step`）：碰撞阶段被毁的机体在 N 发出 `hit`、`object-destroyed`，按次序分配爆炸与两块碎片，N+1 `explosion-started`（内容逐字段）与碎片活动，N+2 `source-released`、来源待移除，N+3 来源离开；爆炸在激活后第 49 tick 请求移除、第 50 tick 离开；构造与首次回调的抽取数（每块小型碎片 4 次、各 1 次到期抽取）与到期值；大型来源 `large` 变体、3 次抽取、碎片不到期；第 0 部件在交接前被区域检查移除时来源停在 `destroyed-source`（冲突 20）；无部件机体被持有、激活后第 28 tick 释放、第 29 tick 离开；导弹来源 `missile` 变体、第 14 tick 释放；爆炸先被移除时经 `release-held` 释放；已移除或没有移动块的来源不构造；对象更新中创建时爆炸与碎片同 tick 激活、交接与移除各早一 tick（CR-11 差异 5）；玩家被毁后第 97 tick 在延迟阶段爆炸、来源保留、`followedEntity` 为逃生舱、交接不移除玩家，逃生舱在其首次回调后第 160 tick 到期（`escape-pod`，清 `followedEntity`），下一 tick 离开；延迟未到时再次被毁不构造也不重设；没有玩家实体时不爆炸；`delayed-player-explosion` 阶段的 `run`；僚机舱 0x780 后 `wingman-pod`；击落后下一 tick `explodes`，碎片成为 `other` 变体（来源种类 24）的持有来源并在激活后第 28 tick 释放；普通碎片到期 `removed` 并清为 never；事件经 `compareReplayResults` 校验；爆炸与碎片停在 `new` 为故障。
  - 期望由 X1–X11 与 CR-08 独立推导；09 的试运行记录尚无帧分辨率的毁伤时序（x-01、x-02 未合格，Y 待运行），没有可交叉核对的数据，原版对照归 27。
- **检查：** `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts`（71 个文件，2,278 项通过）；`pnpm typecheck`、`pnpm lint` 通过；`pnpm check` 通过（242 个文件，7,661 项）；`pnpm check:compliance` 通过（0 项发现）。
- **rubber-duck：** 对照 X1–X11、CR-02–CR-08、CR-11 审阅完整改动，没有发现问题。
- **simplify：** 采纳：玩家延迟由三态结果改为 `playerExplosionDue`，判定写在构造中；逃生舱判定只在 entity-table.ts 一处（fragments.ts 复用）。未采纳：复用 weapons.ts 私有的 `withRand`、firing.ts 私有的 `dueClock`、setup-check.ts 私有的 `inMask` 与 damage.test.ts 的 `drawNext`（需改范围外文件或新建测试辅助）；去掉 `removalAfterClock` 与战斗状态的 `variant`（CR-02 的契约字段）；内联 `spinningBlock`（与 `linearBlock` 对称地记录 `0x21794` 模式 2）；每块碎片各算一次 `0x218e8` 的项与 `spinFragment` 的分配（原版逐块调用；运动尚未接入，且与 P3-06 积分器的纯函数风格一致）；新建公共的种类分类模块（改动面大）；为直接测试导出的 `explosionFrame`、`explosionVariant`、`debrisIndex`（测试针对精确算术）。
- **文档影响：** 原版事实如上写入 X6。[core.md](../../../../engineering/modules/core.md) 与 [source-structure.md](../../../../engineering/source-structure.md) 的模块清单（explosions、fragments）按 goal 归 28 更新，本项不改。STATUS 与阶段索引无需改动。
- **交接：** 22 在移动阶段按模式分派 `spinFragment`（以及 17 的 `linear` 运动），并把 destruction.test.ts 的跳过移动阶段改为正式 `step`；17、19 在碎片耐久耗尽时调用 `shootDown`；20 的导弹起爆调用 `constructExplosion`；P3-08 的范围伤害 `0x6313c` 调用 `constructExplosion`。
