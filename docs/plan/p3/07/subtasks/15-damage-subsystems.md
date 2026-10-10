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

- [ ] AC-09：入口门禁（已被毁、玩家的被毁视角、作弊标志恒为 0）；护盾吸收与子系统失效的支持集；船体扣减。
- [ ] AC-09：子系统选择的支持集、原像计数与特例（5、8、7 的扰动、零船体伤害的强制抽取）；倍率只在原版乘入的路径上；击杀计数只计玩家的击杀；重伤记录与 `statusDisplay.redraw` 的写入。
- [ ] 多次受击只有一次 `object-destroyed`；发射者失效时归因退为 `lost-shooter`、不计击杀（H4）；两个包装的统计、归因与 `hitFeedbackClock` 正确；`hit` 与 `object-destroyed` 的字段与次序符合 CR-06；其他任务的调用点只在注释中记录。
- [ ] `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts`、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- Node 测试：随机部分按代码推导的映射与原像计数，不用卡方；期望由 D2–D11 独立推导。
- 不涉及浏览器；原版对照见 26、27。

## 完成证据
