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

- [x] AC-02：合格输入创建世界；每类拒绝的错误类型、路径与原因稳定，不建半个世界，不回显导入值；原版允许的无参数部件可以表示。
- [x] AC-02：先查上限再复制；调用者事后修改输入不影响世界；载入变换与点测试符合独立推导；setupHash 的规范文本随 CR-01 表中的覆盖字段变化、不随外观字段变化，不宣称无碰撞；爆炸列表帧数不一致时拒绝，Core 不做 EXIC 抽取。
- [x] AC-05（初始化部分）：实例化按 CR-07 的次序写入挂点状态、初始当前挂点、船体、资源、档位与计时；`lastShotClock` 为 null；救援复用的初始化只重置 `0x2d400` 与 `0x3060c` 写的字段。
- [x] 实例化的抽取次数与次序符合 CR-07（`0x3060c` 的位置 1 次）；机体与非机体分支分开；导出的非机体分支与运行时种类缺省符合 CR-02。
- [x] `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts`、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- Node 测试使用内容测试辅助生成的合成规则输入；期望由 craft 文档与 executable 的记录独立推导，不由被测 helper 生成。
- 不读取原版文件；不涉及浏览器。

## 完成证据

- **实现（基于 `2b27028`，其中含 P3-06 子任务 12 的合并 `510a230`）：**
  - CR-01 输入与提取：[rule-data.ts](../../../../../src/core/world/rule-data.ts) 的 `readRuleDataInputs` 读取五项顶层输入（`RULE_DATA_FIELDS`），`debrisParameters`、`explosions`、`explosionAnimations` 用内容读取器（保留其 `ContentContractError`），`projectileVisuals` 只读 `kind` 与各记录 `length`（有限 f32），`models` 只读 `kind` 与第 1 列表长度；两张列表 ID 严格升序；`original-import` 只接受 `data/debris-parameters`、`data/projectile-visuals`、`data/explosions` 与两位编号的 `data/explosion-animation/<nn>`。上限 `RULE_DATA_LIMITS`（动画 48、模型 20、弹丸记录 64、部件 256，取自内容的结构上限）先于复制检查。[create-world.ts](../../../../../src/core/world/create-world.ts) 的输入字段与 `CONTENT_INPUT_FIELDS`（replay 共用）；[replay.ts](../../../../../src/core/replay/replay.ts) 的 `ReplayContent` 随之包含五项，记录形状不变。`recording.ts` 无需改动（经 `CreateWorldInput` 接收）。
  - CR-01 集合与语义检查：可实例化记录由 [setup-check.ts](../../../../../src/core/world/setup-check.ts) 的 `instantiableRecords` 给出（发出请求的队列项：记录项、编组成员、已选僚机，与 P3-06 的 `checkCraftInfo` 同一判定）；`buildRuleData` 依次检查模型集合、爆炸动画集合与帧数（n₁₂、n₃，有导弹挂点而列表 3 为空时拒绝）、DEBRIS 映射（种类位 0、1 为 max(c − 3, 0) 且 c ≥ 1）、非自动炮挂点的弹丸长度、挂点链（两种链接无环；列表项不得同时带两种链接，同时开火链上后续组不得交替）、除数与定义域（玩家 c9C、c5C > 0；有护盾者 c60 ≠ 0 且 c60 × c5C 为 i32；瞄准炮 +0x08 ≠ 0；可达炮 +0x14 在 0–32；可达导弹 +0x60 ≠ +0x64）、每个可实例化记录在其百分比下的船体与 `0x3060c` 各 i32 步，以及派生值不出 f32 范围。
  - CR-01 静态规则数据：`WorldState.ruleData`（[world-state.ts](../../../../../src/core/world/world-state.ts)）为冻结的 `WorldRuleData`：读取结果 `inputs`、`explosionFrames`、按记录的 `guns`/`missiles`（未被可实例化机体挂载的为 null）与按种类位的 `craft`（形状、挂点偏移、第 1 列表部件数、DEBRIS 变换，不可实例化的为 null）。变换在 [load-transforms.ts](../../../../../src/core/rules/load-transforms.ts)，点测试 `0x29bf4`、`0x29d58` 与 `0x56dc0` 在 [collision-shapes.ts](../../../../../src/core/rules/collision-shapes.ts)，`0x56aa8` 为 `normalise`（供 18 复用）。快照写入器按字段选取，不含 `ruleData`。
  - setupHash：[setup-hash.ts](../../../../../src/core/world/setup-hash.ts) 在 craft-info 之后按 CR-01 表写 `ruleData`，模块注释列出覆盖与不覆盖的字段。
  - CR-07 实例化：[spawn.ts](../../../../../src/core/systems/spawn.ts) 以最高速度 0 与空白战斗状态分配后，调用 [combat-init.ts](../../../../../src/core/rules/combat-init.ts) 的 `initialiseCraftCombat`：`0x2d400`（`buildWeaponBlock`：各列表序号 0、首挂点或 null，挂点弹药取 +0x0C，`lastShotClock` 为 null）与船体（chop((+0x60 × f64 0.01) × c9C)）→ `0x3060c`（`initialiseResources`：资源、玩家档位 1、2、E、T，再以实时 E、T 与字段 2 调用 P3-06 的 `playerMaximumSpeed`，然后写两个能量时钟，1 次抽取）→ 字段 0–18 清零；玩家状态一步写 `targeting`（`initialPlayerTargeting()`）与 `statusDisplay.redraw = true`。抽取次序：名称 → `0x3060c` → `0x68050` → Warp 计时。
  - 导出：`missileMaximumSpeed`（非机体分支：弹体 +0xB8）、`runtimeKindDefaults()`（CR-02 的运行时种类缺省，实体表的校验接受种类位 20、21、22、24）、救援复用的 `rebuildWeaponBlock` 与 `initialiseResources`（只写各自字段）、`craftMaximumSpeed`（供 16 的档位重算）。
  - 代码常量（craft §5）在 load-transforms.ts 中实现：`0x170fa2`、`0x170fa6`、`0x170c27`/`0x170c2f`、`0x170c37`；船体常量 `0x1725c4`（f64 0.01）在 combat-init.ts。数值读自本地可执行文件，只用于实现，不写入文档。
- **原版事实（已确认，代码，P3-07/12）：** 实现所需的指令级算术不在既有记录中，以只读 Ghidra（私有副本，`-noanalysis -readOnly`，被忽略的 `local/research/p3-07/rule-data/`，输出 `out/p1`–`out/p5`）按原生指令读取并写入 [craft §3.8、§4.4](../../../../original/formats/craft.md#38-load-transforms-in-0x2cf38-confirmed-code)（射程、挂点加长、角点长度与最大值、`0x56aa8`、类别比较）与 [executable](../../../../original/formats/executable.md) 的实例化第 6 步（船体常量类型与截断）、T10（`0x56dc0` 的求和次序）、H7（点测试的 d² 形式）。没有新的未决项，U 项不变。
- **测试：** `pnpm check` 通过（220 个文件，7,097 项，生产构建成功）；`pnpm exec vitest run src/core tools/engineering-boundaries.test.ts` 通过（49 个文件，1,714 项）；`pnpm typecheck`、`pnpm lint`、`pnpm check:compliance` 通过。新增或更新的断言：
  - [rule-data.test.ts](../../../../../src/core/world/rule-data.test.ts)：提取结果与冻结；调用者事后修改对象与 typed array 不影响世界；五项字段缺失或多余、ID 格式与 kind、`original-import` 的生产 ID（含动画编号）；内容读取器错误保留；弹丸记录与模型只读所需字段；弹丸记录 64/65、部件 256/257、动画 48/49、模型 20/21 的上限；升序与重复；集合多一份或少一份（含僚机选择与不发请求的记录）；帧数不一致、列表空、有导弹挂点而列表 3 空；DEBRIS 映射与种类 1 的 c = 0、c = 1、c = 3；炮挂点无长度；挂点链两种环与两种排列；各除数与定义域；船体与资源的 i32 溢出（含所选僚机的记录）；派生值越出 f32；静态规则数据的值。
  - [load-transforms.test.ts](../../../../../src/core/rules/load-transforms.test.ts)、[collision-shapes.test.ts](../../../../../src/core/rules/collision-shapes.test.ts)：期望由文档算术与有理数一次舍入或手算值独立给出，例如 f32 存储导致的 √2、两次加宽使 10⁸ 保持不变、r − 3.5 = 20 的类别边界、`0x56dc0` 第 1 行用双精度差而第 2 行用 f32 差的不同结果、`0x29bf4` 先舍入 d² 使单位球外的点命中而 `0x29d58` 不命中、严格盒与内框。
  - [combat-init.test.ts](../../../../../src/core/rules/combat-init.test.ts)：武器块、船体的双精度乘积（29 % × 100 得 28）、`0x3060c` 的除乘次序与各步、玩家与其他种类的档位与最高速度、1 次抽取与时钟、只写本函数字段（救援复用）、清零前读字段 2、预算与 i32 故障、运行时种类缺省。
  - [spawn.test.ts](../../../../../src/core/systems/spawn.test.ts)：玩家与其他机体的完整战斗初值与玩家状态一步；记录百分比；停放机体与较晚生成的时钟；能量时钟预算故障；既有抽取序号测试按每个机体多 1 次抽取更新。
  - [create-world.test.ts](../../../../../src/core/world/create-world.test.ts)：setupHash 随 CR-01 表每项覆盖字段的代表变化而变，不随选择值、宽度、颜色、模板、声音、帧图像、几何、部件标志与第 0、2 列表变化，不依赖键序；只经所选僚机的模型随运行改变。[replay.test.ts](../../../../../src/core/replay/replay.test.ts)、[recording.test.ts](../../../../../src/core/replay/recording.test.ts)、[snapshot.test.ts](../../../../../src/core/replay/snapshot.test.ts)：缺少规则输入、规则输入改动经 setupHash 拒绝、记录不嵌入规则输入、新初值进入快照而静态规则数据不进。
- **rubber-duck：** 采纳 1 项：`original-import` 的动画 ID 由前缀改为两位编号。未采纳 3 项：(1) 事件触发的延迟声明——内容不支持生成对（`EventTrigger` 不携带 +0x30 的生成对），所有可调度记录都按时间进入队列，“延迟声明”即较晚的生成时间，已覆盖；(2) 救援不应清 `depleted`——CR-02 字段表把 `depleted` 与 `0x3060c` 的字段同列，初始化为 false、由救援重置，救援后能量恢复为正，与锁存的语义一致；(3) 在创建时检查依赖经过时间的能量更新乘积——经过时间在停靠期间没有上界（D14 停靠跳过更新），无法静态界定，原版按 i32 回绕（D17），由 16 实现；CR-01 的“按记录百分比”只涉及实例化的运算，另加的 c60 × c5C 是不依赖经过时间的护盾补充上界。
- **simplify：** 采纳：测试复用 `TEST_ORIENTATION`、`TEST_RULE_INPUTS`；`contentOf` 改为显式字段（类型检查）；内容字段表 `CONTENT_INPUT_FIELDS` 由 create-world 与 replay 共用。未采纳：点测试与实例化的微小分配（非热点或归 19 优化）；保留实例化时的 i32 与预算故障检查（不变量）；`missileMaximumSpeed`、`runtimeKindDefaults` 与点测试暂无生产调用者（本项按工作范围导出，供 14、18、19）；`WorldRuleData.inputs` 保留（弹丸表现选择器需要其 Asset ID）；`instantiableRecords` 与 craft-info-input.ts 私有 `instantiableKinds` 的重复遍历（后者属 P3-06，范围外，见交接）。
- **文档影响：** 原版事实如上写入 `docs/original/`。[core.md](../../../../engineering/modules/core.md) 与 [source-structure.md](../../../../engineering/source-structure.md) 中关于 `createWorld` 输入与新模块的说明按 goal 归 28 更新，本项不改。
- **交接：** P3-06 的 `initialMaximumSpeed`（flight-state.ts）已无生产调用者，实例化改用实时 E、T；craft-info-input.ts 的 `instantiableKinds` 可改为由 `instantiableRecords` 派生（P3-06 所有，未改）。调用者（P3-04）须按运行的可实例化机体传入恰好的模型集合。

