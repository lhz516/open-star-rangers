---
type: plan
status: active
phase: P3
task: "07"
subtask: "12"
updated: 2026-10-09
---

# 12 — 规则数据接入与战斗初值

**契约来源：** [spec](../spec.md) 的 S-02、AC-02、AC-05（实例化与供救援复用的初始化）；[规则数据输入](../spec.md#规则数据输入)、[能量与显示状态](../spec.md#能量与显示状态)的初值、[持久化与兼容](../spec.md#持久化与兼容)；以 08 获批的 P3-02 修订为准。
**依赖：** 02, 04, 06, 11。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **输入：** `createWorld`、`createRecordingSession` 与 `replayRecord` 接收 `ruleData`（`craftInfo`、`debrisParameters`、`projectileVisuals`、`explosions`、`explosionAnimations`、`models`）；`ReplayContent` 同步，录制不嵌入规则 payload。
- **读取与校验：** 用 `readCraftInfo`、`readDebrisParameters`、`readExplosionTable`、`readExplosionAnimation` 读取对象内容；对 `ProjectileVisuals` 与 `ModelPayload` 在 Core 中只校验与提取所需字段（弹丸记录长度、第 1 列表部件数与 06 确认的部件元数据），复制为有界纯数据，不引入 `original-data` 解析器、几何展开或 GPU 对象。核对角色与 ID、动画引用的完整集合、炮索引到弹丸记录、源模型与部件列表及 DEBRIS 的映射（允许原版明确的无参数部件，如玩家部件 0）、除数与定义域、box 顺序、挂点链；先检查上限再复制；错误类型与诊断按 spec。
- **setupHash：** 覆盖 `MissionSetup` 与新增规范输入中影响状态、事件、内容选择器与文字引用的字段（含列表顺序、重复项与 Asset ID）；字段清单写在模块注释中。
- **静态规则数据：** 在创建时按原版存储类型计算 craft §3.8 与 §4.4 的消费者变换（射程平方、锁定角反余弦、带 box 机型的半径与界、挂点 +0x08 的长度加成、DEBRIS 向量取反与归一化、box 外扩与 +0x5C）；实现 [craft §3.5.1](../../../../original/formats/craft.md#351-collision-shape-68-bytes) 已确认的半径、box、严格边界与内框的点测试，供 17、19 共用。
- **建造期抽取：** 若 08 确定 EXPL 选择由 Core 拥有，在创建时按 06 确认的次序抽取 EXIC 子集（原列表索引、顺序与重复），结果与 RNG 后态进入快照，不进入 setupHash；否则不抽取。
- **实例化初值：** 在 [spawn.ts](../../../../../src/core/systems/spawn.ts) 的实例化扩展点按 Q-07 次序写入依赖机型记录的战斗初值：`0x3060c` 的资源、档位与计时（含 1 次抽取）、+0xD0、`0x2d400` 的挂点状态与各列表的初始当前挂点、19 个两位字段的清零；机体与非机体分支分开。救援复用的初始化作为内部函数实现并测试，只重置证据要求的字段（不宣称救援已实现）。
- **测试：** 合法输入；每类拒绝（缺失或重复 ID、错引用、炮/弹丸不符、缺源模型、必需 DEBRIS 缺失、语义坏值、预算 limit/limit+1）且不建世界；调用者事后修改对象或 typed array 不影响世界；载入变换与点测试的独立期望；规范输入的代表字段变化改变规范文本；EXIC 抽取的支持集；实例化初值与抽取次数。更新受输入形状影响的既有测试与测试辅助。

## 不包含

- 目标、开火、伤害、能量更新等规则（13 至 21）；每次爆炸的 EXPL 选择（18）。
- 修改内容契约、导入链或转换器版本。

## 关键文件与契约

- 现有：[create-world.ts](../../../../../src/core/world/create-world.ts)、[setup-hash.ts](../../../../../src/core/world/setup-hash.ts)、[setup-check.ts](../../../../../src/core/world/setup-check.ts)、[spawn.ts](../../../../../src/core/systems/spawn.ts)、[replay.ts](../../../../../src/core/replay/replay.ts)、[recording.ts](../../../../../src/core/replay/recording.ts)；内容的 [craft-info.ts](../../../../../src/content/rule-data/craft-info.ts)、[debris-parameters.ts](../../../../../src/content/rule-data/debris-parameters.ts)、[flight-data-readers.ts](../../../../../src/content/flight/flight-data-readers.ts)、[effect-payload.ts](../../../../../src/content/effects/effect-payload.ts)、[model-payload.ts](../../../../../src/content/models/model-payload.ts)。
- 计划新增：`src/core/world/rule-data.ts`、`src/core/rules/load-transforms.ts`、`src/core/rules/collision-shapes.ts`、`src/core/rules/combat-init.ts`、`src/core/rules/explosion-subsets.ts` 及相邻测试。

## 写入范围

- `src/core/world/create-world.ts`：`ruleData` 输入与创建。
- `src/core/world/create-world.test.ts`：创建与拒绝测试。
- `src/core/world/create-world.test-support.ts`：合成规则数据输入。
- `src/core/world/setup-hash.ts`：setupHash 覆盖规则输入。
- `src/core/world/setup-check.ts`：跨输入语义校验的接线。
- `src/core/world/world-state.ts`：静态规则数据与建造期状态的引用。
- `src/core/world/world.test.ts`：受输入形状影响的测试。
- `src/core/world/world.test-support.ts`：测试辅助。
- `src/core/world/rule-data.ts`：规则数据读取、校验与提取（新建）。
- `src/core/world/rule-data.test.ts`：规则数据测试（新建）。
- `src/core/rules/load-transforms.ts`：载入变换（新建）。
- `src/core/rules/load-transforms.test.ts`：载入变换测试（新建）。
- `src/core/rules/collision-shapes.ts`：碰撞形状与点测试（新建）。
- `src/core/rules/collision-shapes.test.ts`：点测试（新建）。
- `src/core/rules/combat-init.ts`：实例化战斗初值（新建）。
- `src/core/rules/combat-init.test.ts`：初值测试（新建）。
- `src/core/rules/explosion-subsets.ts`：建造期 EXIC 子集（新建）。
- `src/core/rules/explosion-subsets.test.ts`：子集测试（新建）。
- `src/core/systems/spawn.ts`：实例化扩展点。
- `src/core/systems/spawn.test.ts`：实例化测试。
- `src/core/replay/replay.ts`：`ReplayContent` 的规则输入。
- `src/core/replay/replay.test.ts`：replay 测试。
- `src/core/replay/replay.test-support.ts`：测试辅助。
- `src/core/replay/recording.ts`：录制会话的输入。
- `src/core/replay/recording.test.ts`：录制测试。
- `src/core/replay/snapshot.test.ts`：建造期状态进入快照的测试。

## 验收标准

- [ ] AC-02：合格输入创建世界；每类拒绝的错误类型、路径与原因稳定，不建半个世界；原版允许的无参数部件可以表示。
- [ ] AC-02：先查上限再复制；调用者事后修改输入不影响世界；载入变换与点测试符合独立推导；setupHash 的规范文本随代表字段变化，不宣称无碰撞；EXIC 选择进入快照而不进入 setupHash。
- [ ] AC-05（初始化部分）：实例化写入挂点状态与初始当前挂点；救援复用的初始化只重置证据要求的字段。
- [ ] 实例化的抽取次数与次序符合 Q-07；机体与非机体分支分开。
- [ ] `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts`、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- Node 测试使用内容测试辅助生成的合成规则数据；期望由 craft 文档与 Q 结论独立推导，不由被测 helper 生成。
- 不读取原版文件；不涉及浏览器。

## 完成证据
