---
type: plan
status: active
phase: P3
task: "07"
subtask: "12"
updated: 2026-10-10
---

# 12 — 规则数据接入与战斗初值

**契约来源：** [spec](../spec.md) 的 S-02、AC-02、AC-05（实例化与供救援复用的初始化）；[规则数据输入](../spec.md#规则数据输入)、[能量与显示状态](../spec.md#能量与显示状态)的初值、[持久化与兼容](../spec.md#持久化与兼容)；P3-02 spec 的 [CR-01](../../02/spec.md#cr-01-世界创建输入与静态规则数据d-01)、[CR-02](../../02/spec.md#cr-02-实体的战斗状态d-01)（字段初值与运行时种类的缺省）、[CR-07](../../02/spec.md#cr-07-实例化扩展与系统流水线d-01d-03)（实例化扩展点）、[CR-13](../../02/spec.md#cr-13-其他任务在-p3-07-规则中的调用点d-03-之外的接口)（救援复用的初始化）。
**依赖：** 02, 04, 06, 11。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **输入（CR-01）：** `createWorld`、`createRecordingSession` 与 `replayRecord` 在 P3-06 的 `craftInfo` 旁接收五项必需的顶层输入 `debrisParameters`、`projectileVisuals`、`explosions`、`explosionAnimations`、`models`，不另建包装对象。`ReplayContent` 同步；录制不嵌入规则 payload，replay 记录形状不变。
  - 外层缺字段或多字段为 `CoreInputError`；校验 Asset ID 的 kind 与角色；`original-import` 只接受唯一切片的对应 Asset。
  - 错误只带结构路径与稳定原因，不回显导入值。
- **读取与提取：**
  - `readDebrisParameters`、`readExplosionTable`、`readExplosionAnimation` 严格读取对象内容。
  - `projectileVisuals` 只校验并提取 `records[i].length`；`models` 只校验并提取 `partLists[1]` 的长度（第 1 列表的部件数）。只校验被读取的字段（类型、不超过内容的结构上限、有限值），不展开几何，不引入 `original-data` 解析器。
  - 读取结果冻结并与输入脱离；先检查上限再复制。
- **集合完整与语义检查（CR-01，`CoreInputError`）：** 只检查可实例化种类实际会读到的记录，未用的记录不读也不拒绝：
  - `explosionAnimations` 恰为 `explosions` 三张列表引用的动画集合，`models` 恰为可实例化机体（直接与延迟声明、编组成员、僚机选项）绑定的模型集合；ID 升序、无重复；
  - 爆炸帧数：列表 1、2 都非空，全部项帧数相同（n₁₂）；列表 3 非空时全部项帧数相同（n₃）；可实例化机体有导弹挂点而列表 3 为空时拒绝；
  - DEBRIS 映射（[craft §4.1](../../../../original/formats/craft.md#41-loading-and-lookup-confirmed-code)）：种类 1、2 恰需 max(c − 3, 0) 项且要求 c ≥ 1，其他种类恰需 c 项，不越界；种类 1、2 的第 0 部件是无参数部件，不算缺失；
  - 炮挂点长度：每个非自动炮挂点（挂点类型 0、炮记录 +0x28 ≠ 2）的炮序号都有弹丸记录长度；
  - 挂点链：+0x18、+0x1C 链接无环；拒绝两种会保留跨调用“已尝试”标志的排列（W5）；
  - 除数与定义域：玩家机型的 c9C、c5C 为正；有护盾的机型 c60 ≠ 0；瞄准炮的 +0x08 ≠ 0；导弹记录 +0x60 ≠ +0x64；可达炮记录的 +0x14 在 [0, 32] 内；实例化与能量的 i32 运算按记录百分比不溢出。导弹 +0x2C 的反余弦只供 P3-08，不计算也不校验。
- **静态规则数据（CR-01）：** 在创建时按原版存储类型计算一次，冻结，不进快照：
  - craft §3.8 与 §4.4 的消费者变换：炮与导弹的射程及其平方、导弹引信半径平方、带 box 机型的半径与界、炮挂点 +0x08 加弹丸长度（机型记录 0、1 先乘代码常量）、DEBRIS 向量取反与归一化、box 外扩、半径、+0x5C 类别；
  - n₁₂、n₃ 与按种类位的第 1 列表部件数；
  - [craft §3.5.1](../../../../original/formats/craft.md#351-collision-shape-68-bytes) 与 H7 已确认的点测试（`0x29bf4`、`0x29d58`：半径、box、严格边界与内框），供 19 使用；导弹引信的严格测试与弹丸的线段测试分别归 20、17。
- **setupHash（CR-01）：** 在 `MissionSetup` 与 `craftInfo` 之后，按 CR-01 表的次序覆盖：`debrisParameters` 的 ID 与完整内容；`projectileVisuals` 的 ID 与按记录次序的长度；`explosions` 的 ID 与三张列表按次序的动画引用；`explosionAnimations` 按 ID 次序的 ID 与帧数；`models` 按 ID 次序的 ID 与第 1 列表部件数。外观字段不覆盖；字段清单写在模块注释中。
- **建造期抽取：** 无。EXIC 子集与 EXPL 选择归表现层（CR-11），Core 不抽取，也不进快照。
- **实例化（CR-07 的次序，[spawn.ts](../../../../../src/core/systems/spawn.ts)）：**
  1. 分配与命名之后、最高速度之前：武器块（`0x2d400`：挂点状态、三张列表的初始选择，`lastShotClock` 为 null）与船体，不抽取；
  2. 在 `0x3060c` 的位置计算资源、档位与 E、T（D13），再以实时的 E、T 与两位字段 2 调用 P3-06 的最高速度纯函数，然后写 `lastEnergyClock` 与 `nextEnergyClock`（1 次抽取）；
  3. 两位字段 0–18 清零；
  4. 玩家状态这一步写 `targeting`（`enemy`、到期 0）与 `statusDisplay.redraw = true`。
  其余 CR-02 字段取其表中的初值（如 `depleted` 为 false，`hitFeedbackClock`、`proximity`、`lastVictim`、`lastAttacker` 为 null）。
- **供其他子任务的导出：**
  - `0x3060c` 的非机体分支（导弹：最高速度取弹体记录 +0xB8，只调用 `0x30e0c`，D13），供 14 的导弹构造；
  - 运行时种类的 P3-06 字段缺省（CR-02：`ai` 为模式 5、两个目标为空、零向量；`formation` 为 null；计时字段为 0，`inWarp` 为 false；`ruleInputs` 为 0，`name` 为 `none`，`source`、`side` 为 null，`baseInteraction` 为 false），供 14、18 的构造；
  - 救援复用的 `0x2d400` 与 `0x3060c` 作为内部函数，只重置它们写的字段（CR-13），不宣称救援已实现。
- **测试：**
  - 合法输入。
  - 每类拒绝且不建世界：缺字段或多字段、错 kind、缺失或重复 ID、集合多一份或少一份、帧数不一致、有导弹挂点而列表 3 为空、DEBRIS 映射不符与种类 1、2 的 c = 0、炮挂点无长度、挂点链有环或为不支持的排列、除数与定义域、i32 溢出、上限的 limit 与 limit + 1。
  - 调用者事后修改对象或 typed array 不影响世界；载入变换与点测试的独立期望。
  - setupHash 的规范文本随 CR-01 表中每项覆盖字段的代表变化而变，不随外观字段变化。
  - 实例化的次序、初值与抽取次数；导出的非机体分支与运行时种类缺省；救援复用的初始化。
  - 更新受输入形状影响的既有测试与测试辅助。

## 不包含

- 目标、开火、伤害、能量更新等规则（13 至 21）。
- EXIC 子集、EXPL 选择与额外爆炸（表现层，CR-11）。
- 修改内容契约、导入链或转换器版本。

## 关键文件与契约

- 现有：[create-world.ts](../../../../../src/core/world/create-world.ts)、[setup-hash.ts](../../../../../src/core/world/setup-hash.ts)、[setup-check.ts](../../../../../src/core/world/setup-check.ts)、[spawn.ts](../../../../../src/core/systems/spawn.ts)、[replay.ts](../../../../../src/core/replay/replay.ts)、[recording.ts](../../../../../src/core/replay/recording.ts)；内容的 [debris-parameters.ts](../../../../../src/content/rule-data/debris-parameters.ts)、[flight-data-readers.ts](../../../../../src/content/flight/flight-data-readers.ts)、[effect-payload.ts](../../../../../src/content/effects/effect-payload.ts)、[model-payload.ts](../../../../../src/content/models/model-payload.ts)。
- P3-06 合并的 `craftInfo` 输入、实例化扩展点与最高速度纯函数（以合并后的实际路径为准）。
- 计划新增：`src/core/world/rule-data.ts`、`src/core/rules/load-transforms.ts`、`src/core/rules/collision-shapes.ts`、`src/core/rules/combat-init.ts` 及相邻测试。

## 写入范围

- `src/core/world/create-world.ts`：五项规则输入与创建。
- `src/core/world/create-world.test.ts`：创建与拒绝测试。
- `src/core/world/create-world.test-support.ts`：合成规则输入。
- `src/core/world/setup-hash.ts`：setupHash 覆盖规则输入。
- `src/core/world/setup-check.ts`：集合完整与语义检查的接线。
- `src/core/world/world-state.ts`：静态规则数据的引用。
- `src/core/world/world.test.ts`：受输入形状影响的测试。
- `src/core/world/world.test-support.ts`：测试辅助。
- `src/core/world/rule-data.ts`：规则输入的读取、校验与提取（新建）。
- `src/core/world/rule-data.test.ts`：规则输入测试（新建）。
- `src/core/rules/load-transforms.ts`：载入变换（新建）。
- `src/core/rules/load-transforms.test.ts`：载入变换测试（新建）。
- `src/core/rules/collision-shapes.ts`：碰撞形状与点测试（新建）。
- `src/core/rules/collision-shapes.test.ts`：点测试（新建）。
- `src/core/rules/combat-init.ts`：实例化战斗初值、非机体分支与运行时种类缺省（新建）。
- `src/core/rules/combat-init.test.ts`：初值测试（新建）。
- `src/core/systems/spawn.ts`：实例化扩展点。
- `src/core/systems/spawn.test.ts`：实例化测试。
- `src/core/replay/replay.ts`：`ReplayContent` 的规则输入。
- `src/core/replay/replay.test.ts`：replay 测试。
- `src/core/replay/replay.test-support.ts`：测试辅助。
- `src/core/replay/recording.ts`：录制会话的输入。
- `src/core/replay/recording.test.ts`：录制测试。
- `src/core/replay/snapshot.test.ts`：新初值进入快照、静态规则数据不进快照的测试。
- `docs/original/formats/craft.md`：§3.8、§4.4 载入变换的指令级算术（已确认，代码）。
- `docs/original/formats/executable.md`：H7、T10 与实例化中点测试、点积、归一化与船体常量类型的指令级事实（已确认，代码）。

## 验收标准

- [ ] AC-02：合格输入创建世界；每类拒绝的错误类型、路径与原因稳定，不建半个世界，不回显导入值；原版允许的无参数部件可以表示。
- [ ] AC-02：先查上限再复制；调用者事后修改输入不影响世界；载入变换与点测试符合独立推导；setupHash 的规范文本随 CR-01 表中的覆盖字段变化、不随外观字段变化，不宣称无碰撞；爆炸列表帧数不一致时拒绝，Core 不做 EXIC 抽取。
- [ ] AC-05（初始化部分）：实例化按 CR-07 的次序写入挂点状态、初始当前挂点、船体、资源、档位与计时；`lastShotClock` 为 null；救援复用的初始化只重置 `0x2d400` 与 `0x3060c` 写的字段。
- [ ] 实例化的抽取次数与次序符合 CR-07（`0x3060c` 的位置 1 次）；机体与非机体分支分开；导出的非机体分支与运行时种类缺省符合 CR-02。
- [ ] `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts`、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- Node 测试使用内容测试辅助生成的合成规则输入；期望由 craft 文档与 executable 的记录独立推导，不由被测 helper 生成。
- 不读取原版文件；不涉及浏览器。

## 完成证据
