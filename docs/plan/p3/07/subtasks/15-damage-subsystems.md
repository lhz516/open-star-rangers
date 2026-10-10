---
type: plan
status: active
phase: P3
task: "07"
subtask: "15"
updated: 2026-10-10
---

# 15 — 伤害与子系统

**契约来源：** [spec](../spec.md) 的 S-07、AC-09；[伤害与子系统](../spec.md#伤害与子系统)、[与其他任务的接口](../spec.md#与其他任务的接口)、技术决定 10；P3-02 spec 的 [CR-02](../../02/spec.md#cr-02-实体的战斗状态d-01)（资源、子系统、受击表现与归因字段）、[CR-04](../../02/spec.md#cr-04-玩家状态d-01)（击杀、射击统计、重伤记录与状态显示的重绘）、[CR-06](../../02/spec.md#cr-06-领域事件与次序d-01)（`hit`、`object-destroyed` 与次序）、[CR-09](../../02/spec.md#cr-09-与-p3-06-的接口d-03)（扰动的写入）、[CR-13](../../02/spec.md#cr-13-其他任务在-p3-07-规则中的调用点d-03-之外的接口)（其他任务的调用点）。
**依赖：** 04, 12, 14。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **伤害入口（D2–D5，H4）：** 按 04 的 Q-07 结论实现 `0x2a694` 与它的两个包装：
  - `0x2a40c`（弹丸与导弹的命中，17、20 调用）：受击者无效或已被毁时什么都不做。否则依次：攻击者为命中时仍有效的发射者，否则为 `lost-shooter`（原版以分类掩码 `0x93780` 代替种类，不计击杀）；发射者有效且为玩家时递增 `shots` 的命中计数；发射者有效时写发射者的 `lastVictim` 与受击者的 `lastAttacker`；写受击者的 `hitFeedbackClock`；调用 `0x2a694`，其返回值交 17 决定跳弹或移除。
  - `0x2a5fc`（碰撞与 AI 范围伤害，19 与 P3-08 调用）：受击者已被毁时什么都不做；写 `hitFeedbackClock`；以攻击者 `none` 调用 `0x2a694`。
  - `0x2a694` 的门禁：已被毁；玩家自身的被毁视角门禁，不使其他机体免伤（被挡下的命中仍有受击项，`hit` 的 `gated` 为 true）；作弊标志在 Core 中恒为 0，不提供打开途径。
  - 护盾吸收（`0x30c60`）与子系统 4 受损时的失效（抽取）；船体扣减。
  - `0x2a830` 的子系统选择与损坏（抽取，含只用 rand 低字节的比较）与特例：5、8 调用 14 的挂点函数；7 在等级 2 时经 `0x21bd4` 写移动块的扰动（3 次抽取，CR-09）；零船体伤害的强制抽取；玩家的子系统改变时置 `statusDisplay.redraw`；重伤记录 `heavyDamage` 的阈值写入（D11）。
  - 区分“护盾吸收完”“零船体伤害但仍可损坏子系统”与“被门禁忽略”；倍率只在原版实际乘入的路径上使用，这两个包装不乘 TABL 4003 倍率与难度因子。
- **`hit` 事件（CR-06）：** 每次投递受击表现项（`0x2a40c`、`0x2a5fc`），或停放交战（21）实际施加伤害时，在护盾与船体结算之后、被毁处理之前发出一次。字段：`cause`、`sourceEntityId`、`attacker` 联合、`damage`、`gated`、护盾与船体的前后值、`shieldWasEmpty`（受击前护盾 ≤ 0）、`impact`（弹丸的命中点，其他为 null）、`projectile`（弹丸的结局：跳弹或移除，按 H4 的条件由护盾结算确定；导弹与其他原因为 null）。受击者已被毁时不发；碎片受击不发。
- **被毁（CR-06，X1、D8）：** 船体耗尽时置被毁标志（每个对象只一次）；按 D8 计玩家的击杀（只计玩家对非玩家、非僚机的击杀）；在 `hit` 之后发出一次 `object-destroyed`：`attacker`；`eventClass` 在攻击者种类为 1 时为 0，否则为 1；`outcome` 对停放对象为 `removed`，对玩家为 `delayed`，对其他为 `explodes`。然后按种类分支：停放对象直接待移除；活动对象与玩家调用 `destruction.ts` 的毁伤入口（18 实现；此前被毁对象保持被毁、不爆炸）。
- **其他任务的调用点（CR-13）：** `0x3c208`、`0x3c0f4`（P3-10）与 `0x6977c`（P3-11）在伤害与被毁中的位置写在模块注释中。本项不建空函数或待处理标志；跨 tick 的状态由消费任务拥有。
- **测试：**
  - 门禁（含 `gated`）；护盾与失效的支持集与原像计数；船体扣减。
  - 子系统选择的支持集、原像计数与特例（含扰动的抽取与 `statusDisplay.redraw`）；重伤记录的阈值；倍率路径。
  - 两个包装的射击统计、归因与 `hitFeedbackClock`；发射者已失效时归因为 `lost-shooter`，不计击杀。
  - `hit` 与 `object-destroyed` 的字段与次序；同一对象多次受击只有一次 `object-destroyed`。

## 不包含

- 爆炸与碎片（18）；命中几何、跳弹与碎片受击（17、19）；导弹起爆（20）；停放交战的规则（21）。
- 任务计数、被毁视角与救援（P3-11）；通讯反应与修理（P3-10）；AI 范围伤害的触发（P3-08）。

## 关键文件与契约

- 使用 14 的 `src/core/rules/mounts.ts`（子系统 5、8）、11 新建的 `src/core/systems/destruction.ts` 入口，以及 P3-06 移动块的扰动字段。
- 计划新增：`src/core/systems/damage.ts`、`src/core/rules/damage.ts`、`src/core/rules/subsystems.ts` 及相邻测试。

## 写入范围

- `src/core/systems/damage.ts`：伤害入口与包装、被毁与事件（新建）。
- `src/core/systems/damage.test.ts`：伤害系统测试（新建）。
- `src/core/rules/damage.ts`：护盾与船体规则（新建）。
- `src/core/rules/damage.test.ts`：护盾与船体测试（新建）。
- `src/core/rules/subsystems.ts`：子系统选择与特例（新建）。
- `src/core/rules/subsystems.test.ts`：子系统测试（新建）。
- `src/core/systems/destruction.ts`：只新增 15 调用的毁伤入口 `destroyEntity`（18 实现前不改变状态）。
- `docs/original/formats/executable.md`：`0x21bd4` 的扰动偏置算术与 D2/D4 的 `noAttacker` 记法（已确认，代码）。

## 验收标准

- [x] AC-09：入口门禁（已被毁、玩家的被毁视角、作弊标志恒为 0）；护盾吸收与子系统失效的支持集；船体扣减。
- [x] AC-09：子系统选择的支持集、原像计数与特例（5、8、7 的扰动、零船体伤害的强制抽取）；倍率只在原版乘入的路径上；击杀计数只计玩家的击杀；重伤记录与 `statusDisplay.redraw` 的写入。
- [x] 多次受击只有一次 `object-destroyed`；发射者失效时归因退为 `lost-shooter`、不计击杀（H4）；两个包装的统计、归因与 `hitFeedbackClock` 正确；`hit` 与 `object-destroyed` 的字段与次序符合 CR-06；其他任务的调用点只在注释中记录。
- [x] `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts`、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- Node 测试：随机部分按代码推导的映射与原像计数，不用卡方；期望由 D2–D11 独立推导。
- 不涉及浏览器；原版对照见 26、27。

## 完成证据

- **实现（基于认领提交 `1c1b255`，快进到目标分支 `7328198`，其中含本项获批的写入范围扩展）：**
  - [rules/damage.ts](../../../../../src/core/rules/damage.ts)：护盾 `0x30c60`（`absorbByShield`：子系统 4 为 1 时 1 次抽取、低字节 < 0x54 绕过并保留护盾；状态 0、2、3 不抽取；有符号比较，伤害小于护盾时扣减并余 0，否则清零并余 伤害 − 原护盾）；`0x2a830` 第 1 步的船体扣减（`damageHull`：只扣正值，i32）。
  - [rules/subsystems.ts](../../../../../src/core/rules/subsystems.ts)：`0x2a830` 第 2–10 步（`damageSubsystems`）：强制抽取只在攻击者种类为 0（碰撞、AI 范围伤害）或来源为导弹时进行；零船体伤害且未强制即结束；船体 ≤ 0 时损坏抽取必然成功且不抽取，否则 t = trunc(768 × 船体伤害 ÷ 扣后船体)（i32 乘法）与低字节有符号比较，t = 0 也抽取；玩家 rand % 19、其他（含僚机）rand % 9；只有强制抽取时依次找 s 起、再 0 起的第一个未损字段，全损时再抽一次；状态 < 2 时施加：5、8 调用 14 的 `damageListMount`（列表 1、0）且不改字段，10、13 在状态 1 时仍写 1，7 另调用扰动；玩家在选中字段后（含状态 2）按非零字段数给出 `0x69e5c` 的 0 或 1。扰动 `0x21bd4`（`disturb`）：只对 `craft` 模式的移动块，等级 2 时 3 次抽取，偏置 rand % 193 − 96。
  - [systems/damage.ts](../../../../../src/core/systems/damage.ts)：`0x2a694`（门禁：已被毁；玩家在 `followedEntity` 非空时的被毁视角门禁，只保护玩家，`hit` 的 `gated` 为 true 且不改变任何状态、不抽取；作弊标志在 Core 中不存在）→ 护盾 → 船体与子系统（世界 RNG 依原版次序抽取，在被毁处理之前写回）→ 玩家子系统施加时置 `statusDisplay.redraw`、写 `heavyDamage` → `hit` → 船体 ≤ 0 且护盾未全吸收时被毁。三个入口：`applyShotHit`（`0x2a40c`：受击者已移除或已被毁时返回 null 且什么都不做；攻击者为仍有效的发射者，否则 `lost-shooter`；玩家发射者递增 `projectileHits`/`missileHits`；写发射者的 `lastVictim` 与受击者的 `lastAttacker`；写 `hitFeedbackClock`；返回 `absorbed` 与弹丸结局，跳弹的条件为全吸收且受击者不是玩家或视角模式为 0x11，与 `hit` 的 `projectile` 一致；导弹不得带命中点）、`applyContactDamage`（`0x2a5fc`：攻击者 `none`，原因 `collision`/`area`，写 `hitFeedbackClock`）、`applyEngagementDamage`（21 的 `0x2a694` 调用：攻击者为射击者，原因 `parked`，不写 `hitFeedbackClock`）。三者都不乘 TABL 4003 倍率与难度因子。被毁：置被毁标志 → `object-destroyed`（`eventClass` 在玩家击杀时为 0；`outcome` 玩家 `delayed`、停放 `removed`、其他 `explodes`）→ 只计玩家对非玩家、非僚机且属 D8 八个种类的击杀（停放对象也计）→ 停放对象进入待移除，其他调用 `destroyEntity`。CR-13 的 `0x3c208`、`0x3c0f4`、`0x6977c`、`0x32d74`、`0x32dec` 的位置只写在模块注释中。
  - [destruction.ts](../../../../../src/core/systems/destruction.ts)（获批的范围扩展）：只新增 `destroyEntity`，18 实现前不改变状态，被毁对象保持被毁、不爆炸。
- **原版事实（已确认，代码，P3-07/15）：** [executable](../../../../original/formats/executable.md#flight-controls-and-rotation-p3-0602) 的扰动段补充 `0x21bd4` 的偏置算术（rand % 193 − 96，按抽取次序存入 +0x98/+0x9C/+0xA0）与无移动块或模式字节 ≠ 0 时不写不抽；[D2](../../../../original/formats/executable.md#d2-damage-entry-0x2a694eax-attackerkind-edx-source-ebx-victim-ecx-damage--confirmed-code) 的 `noAttacker` 记法改为“attackerKind = 0 的比较结果”（`SETZ`）；D12 的抽取行同步。来源：只读核对原生指令（P3-06/02 与 P3-07/04 的私有探针输出，被忽略的 `local/research/`）。没有新的未决项，U 项不变。
- **测试：** `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts` 通过（64 个文件，2,090 项）；`pnpm typecheck`、`pnpm lint`、`pnpm check:compliance` 通过；`pnpm check` 通过（235 个文件，7,473 项，生产构建成功）。期望由 D2–D11、H4 独立推导，随机部分对 0–32767 全部 rand 值计数原像，不用卡方：
  - [rules/damage.test.ts](../../../../../src/core/rules/damage.test.ts)：护盾的小于、等于、大于、零伤害、负护盾与 i32 回绕；子系统 4 为 1 时绕过 84 × 128 = 10,752 个 rand 值，状态 0、2、3 不抽取；船体扣减与 i32。
  - [rules/subsystems.test.ts](../../../../../src/core/rules/subsystems.test.ts)：扰动等级 1 不抽取、等级 2 的偏置与次序、偏置 −96…54 各 170 与 55…96 各 169 个原像、无块与 Warp 不写不抽；强制抽取的条件与 50 × 128 = 6,400 个原像；损坏抽取 t = 85 时 10,880 个原像、t ≥ 256 必然、t ≤ 0 不成功、768 × 2²² 的 i32 回绕、船体 ≤ 0 不抽取；字段 rand % 19（0–11 各 1,725、12–18 各 1,724）与 rand % 9（0–7 各 3,641、8 为 3,640，含僚机）；强制搜索的前进、回绕、全损再抽与玩家 19 个字段；状态 0→1→2、2 与 3 不变、10/13、7 的扰动等级与抽取、5/8 的挂点损坏与抽取次数、5 已为 2 与无挂点；重伤记录的 8/9/13/14 阈值、状态 2 时仍记录、非玩家不记录。
  - [systems/damage.test.ts](../../../../../src/core/systems/damage.test.ts)：已被毁与已移除的受击者什么都不做；玩家弹丸的统计、两条记录、`hitFeedbackClock` 与完整 `hit`；全吸收的跳弹、玩家受击时移除而视角 0x11 时跳弹；船体受损时移除与抽取次数；导弹的统计、强制抽取与 `projectile: null`；其他射击者只记录不计数；发射者已移除或为空时 `lost-shooter`、不写记录；已被毁但仍在表中的发射者照常归因并计击杀；故障（来源、受击者、伤害非 i32、导弹带命中点、发射者非机体）；门禁只挡玩家、`gated` 的 `hit` 不改变状态与 RNG、记录与受击时钟仍写；碰撞与范围伤害的字段与强制抽取；停放交战的归因、不写受击时钟、停放受击者被毁后待移除；`hit` 后紧接一次 `object-destroyed`、再受击不再发出；四种 `outcome`；击杀只计玩家对 D8 种类（含停放对象）、`eventClass`；全吸收时船体 ≤ 0 也不被毁；事件经 `compareReplayResults` 校验；子系统经入口的抽取次序、`statusDisplay.redraw` 与 `heavyDamage`；不同难度与 `hitDamageScale` 下伤害不缩放。
- **rubber-duck：** 采纳 3 项：(1) 阻断：受击者已被移除时 `0x2a40c` 仍施加伤害——改为返回 null 且不改变任何状态，另两个入口对未在表中的受击者为 Core 故障；(2) 导弹命中可带非空 `impact`——改为 Core 故障；(3) 补“已被毁但仍在表中的发射者”的归因与击杀测试。
- **simplify：** 采纳：规则常量不导出；子系统规则从实体读取扣后船体，不再另传；偏置改为模块级函数；字段计数用循环；规则测试的穷举改用共同的 `histogram`。未采纳：复用 weapons.ts 的 `withRand`（私有，导出需改范围外文件）；把强制抽取的条件压成一个布尔量（它是 `0x2a830` 自身的规则，留在规则模块）；把停放对象的待移除移到 destruction.ts（spec 与本项工作范围规定停放对象在伤害中直接待移除）；去掉 `SubsystemRoll.field`（测试用它直接断言选中的字段）；每次受击的 `RandStream` 与 10/13 状态 1 时的数组复制（非热点）。
- **文档影响：** 原版事实如上写入 `docs/original/`。[core.md](../../../../engineering/modules/core.md) 与 [source-structure.md](../../../../engineering/source-structure.md) 的模块清单（damage、subsystems 与伤害入口）按 goal 归 28 更新，本项不改。STATUS 与阶段索引无需改动。
