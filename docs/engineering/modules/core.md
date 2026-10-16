---
type: guide
status: active
phase: all
updated: 2026-10-16
related: [ADR-0004, ADR-0006, ADR-0015, B-004, B-006, B-007, B-008, B-009, U-008, U-009, U-010, U-011, U-021, U-022, U-026, U-030]
---

# Core 模块说明

本文件是[源码结构指南](../source-structure.md)的模块分册，记录 `src/core/` 中已交付代码的当前 API 与契约要点。目录树、职责边界与 helper 归属以指南为准，行为契约以各任务 spec 为准；修改本模块代码的任务同步更新本文件。原版事实只在 `docs/original/` 记录，本文件链接到那里。

[core/](../../../src/core/) 是正式 Core：任务载入与 P3-02 起的[正式 Core](#正式-core)，以及错误类型与 `determinism/` 的确定性设施（[模块边界](#模块边界)）。纯度与确定性规则见[工程约定](../README.md)。

## 模块边界

`src/core/` 的模块都属于正式 Core：[errors.ts](../../../src/core/errors.ts) 与 [determinism/](../../../src/core/determinism/)（错误类型、带种子的 RNG 与 FNV-1a 哈希），以及 `mission/`、`contracts/`、`world/`、`systems/`、`rules/`、`projections/`、`replay/`。纯度与确定性（不用 DOM、React、宿主时间与随机、异步）由 lint 与工程边界回归检查（[工程约定](../README.md#lint-规则eslintconfigjs)）。

- 结构与数值读取器在 [contracts/validation.ts](../../../src/core/contracts/validation.ts)；app 的 Runtime 与游戏会话复用它与公开的 `readTickInput`，不复制校验规则。
- 正式格式 `osr-game-snapshot`、`osr-game-replay` 不接受 P1 的合成格式名 `osr-synthetic-snapshot`、`osr-synthetic-replay`（测试以它们作为被拒绝的输入），也不通过改名互相转换。
- P1 的合成场景、快照与 replay（`core/synthetic/`），以及 P3-02 为隔离它而设的 lint 规则 `osr/core-synthetic-boundary`，已于 P3-04 删除，见[退役记录](../source-structure.md#r1-合成-core)。

## Core 任务载入

[core/mission/load-mission.ts](../../../src/core/mission/load-mission.ts)（[P2-09/11](../../plan/p2/09/subtasks/11-core-load-mission.md)）的 `loadMission(input)` 是 Core 的纯函数，契约见 spec 的 [Core 载入结果](../../plan/p2/09/spec.md#core-载入结果)：

- **输入：** `LoadMissionInput` 为 `{ mission, craftTypes, wingmanRoster }`，每项为 `{ id: AssetId, content: unknown }`。Core 仍在运行时核对输入，不信任调用者给的类型：先核对任务 ID，再用 [logic-readers.ts](../../../src/content/logic/logic-readers.ts) 读取任务；确认机型表与僚机名单的 ID 是任务引用的 ID 之后，才读取它们的 `content`。读取路径为 `input.<asset>.content`；单个 payload 内部的错误是读取器的 `ContentContractError`，原样传递。
- **前提：** 只检查跨 Asset 的一致性，不满足时抛出 `CoreInputError(path, reason)`，路径指向输入位置：
  - 输入或某项不是对象；
  - 任务 ID 不是 `mission` 类 Asset ID；
  - 机型表与僚机名单的 ID 不是任务引用的 ID，或名单引用了另一张机型表；
  - 声明或僚机选项引用了表中没有的机型；
  - 任务中没有或有两个玩家声明，或有僚机选项是玩家机型；
  - 表中有任务与名单都没引用的机型。这一项最后检查，以免缺少玩家时被误报为多余机型。
- **输出：** 冻结的 `MissionSetup`，字段依次为 `mission`、`campaign`、`coordinates`、`mapFrame`、`namePool`、`spawnRegions`、`declarations`、`player`、`groups`、`eventTriggers`、`wingmanOptions`。声明与僚机选项附加解析出的 `side`、`model`（model 的 Asset ID）与 `baseInteraction`，并经展开带上任务内容的 `eventTrigger`（触发序号或 null；僚机选项恒为 null）；`craftType` 为 null 时三者为 null、null、false。结果由读取器的新副本组成，与输入隔离；相同输入得到深度相等的结果。
- **事件触发（[P3-03/07](../../plan/p3/03/subtasks/07-mission-events.md)）：** `eventTriggers` 是任务 payload 中段 2 事件触发的原样副本（`EventTrigger`/`EventRange`，见[内容模块](./content.md#内容基础契约与切片定义)的 logic 一条），声明的 `eventTrigger` 是它的下标。`loadMission` 不解释、不调度它们，也不另行校验：引用与形状由内容读取器保证（[P3-03 spec 技术决定 10](../../plan/p3/03/spec.md#技术决定)）。
- **纯净：** 不应用默认值，不推导生成时刻、顺序或位置，不使用 RNG 或宿主时间，只导入 `content/` 与 Core 自己的错误类型。

针对性检查为 `pnpm exec vitest run src/core/mission tools/engineering-boundaries.test.ts`。

## 正式 Core

[P3-02](../../plan/p3/02/spec.md)（[goal](../../plan/p3/02/goal.md)）交付正式契约、世界、固定流水线、任务实例化、读模型、快照与 replay。[P3-06](../../plan/p3/06/spec.md)（[goal](../../plan/p3/06/goal.md)）在其上加入世界创建的机型输入、实体飞行状态与玩家控制状态、[飞行控制、运动与停放](#飞行控制运动与停放)的规则，以及 `flight` 分区的运动组；它对 P3-02 契约的修订汇集在 P3-02 spec 的 [P3-06 的契约修订](../../plan/p3/02/spec.md#p3-06-的契约修订检查点-a)。[P3-07](../../plan/p3/07/spec.md)（[goal](../../plan/p3/07/goal.md)）再加入世界创建的六项规则数据输入与[静态规则数据](#规则数据输入与静态规则数据)、实体的战斗状态、移动块的模式 1 与 2、玩家的瞄准、战斗记录与驾驶舱显示状态、[战斗规则](#战斗规则p3-07)的系统与阶段、13 种领域事件，以及 `flight` 分区的战斗组；它对 P3-02 契约的修订汇集在 P3-02 spec 的 [P3-07 的契约修订](../../plan/p3/02/spec.md#p3-07-的契约修订d-01d-03)，下文以编号 CR-01 至 CR-14 引用。[P3-10](../../plan/p3/10/spec.md)（[goal](../../plan/p3/10/goal.md)）再加入世界创建的三项通讯规则数据输入与[静态的通讯规则数据](#规则数据输入与静态规则数据)、任务流程的停靠子状态、玩家与世界的通讯、停靠与基地服务状态、[通讯、停靠与基地服务](#通讯停靠与基地服务p3-10)的系统与阶段、五种内部请求、13 种领域事件，以及就绪的 `communications` 分区；它对 P3-02 契约的修订汇集在 P3-02 spec 的 [P3-10 的契约修订](../../plan/p3/02/spec.md#p3-10-的契约修订d-01)，下文以编号 CB-01 至 CB-19 引用，Runtime 与会话的部分在 P3-04 spec 的[运行中衔接](../../plan/p3/04/spec.md#运行中衔接p3-10-的修订)（见 [app 模块说明](./app.md#正式-runtime)）。契约以这些 spec 为准，本节只记录交付的 API。Core 之外的使用者（P3-04 的 Runtime、会话与任务所有者、本地核对工具、P3-15 的 Node 重放）只使用以下入口及其返回的世界与只读数据：

| 入口 | 模块 | 作用 |
|---|---|---|
| `createWorld(input)` | [world/create-world.ts](../../../src/core/world/create-world.ts) | 由三份逻辑 Asset、机型数据、规则数据输入、内容身份与运行配置创建世界 |
| `CONTENT_INPUT_FIELDS`、`instantiableModelIds(input)` | 同上 | 创建输入中除 `run` 外的内容字段（按次序）；一次运行须传入的模型 ID（CR-01） |
| `World` 的 `step`、`projection`、`renderState`、`snapshot` | [world/world.ts](../../../src/core/world/world.ts) | 推进与读取 |
| `createRecordingSession(input, options)` | [replay/recording.ts](../../../src/core/replay/recording.ts) | 创建同时录制的世界 |
| `replayRecord(record, content)` | [replay/replay.ts](../../../src/core/replay/replay.ts) | 在新世界中重放录制 |
| `compareReplayResults(expected, actual)` | [replay/compare.ts](../../../src/core/replay/compare.ts) | 报告最早可观测的分歧 |
| `snapshotText`、`snapshotHash` | [replay/snapshot.ts](../../../src/core/replay/snapshot.ts) | 快照的规范文本与状态哈希 |

标为“内部”的函数只供 Core 自己与 Core 测试使用，不是生产 API；规则任务按[扩展规则](#扩展规则)改动 Core 内部，不向生产入口注入处理器。

### 世界创建

`createWorld(input)` 的输入 `CreateWorldInput` 为 `{ mission, craftTypes, wingmanRoster, craftInfo, debrisParameters, projectileVisuals, explosions, explosionAnimations, models, aiPrograms, commMenus, baseRepairItems, commMessages, identity, run }`（外层由 `readExactRecord` 校验；`CONTENT_INPUT_FIELDS` 是除 `run` 外的字段，Runtime、会话与 `ReplayContent` 按它读取）：前三项与 `loadMission` 相同；`craftInfo` 是同一资源包的 `data/craft-info` 规则数据 Asset，形状同为 `{ id, content }`，由调用者用该包的 `decodeRuleDataPayload` 解码（[P3-06 的 D-01](../../plan/p3/06/spec.md#对-p3-02-契约的增量)）；其后九项是规则数据输入：P3-07 的六项（CR-01）与 P3-10 的三项（CB-01），见[规则数据输入与静态规则数据](#规则数据输入与静态规则数据)；`identity` 是这些 Asset 所在资源包的 `ContentIdentity`；`run` 是运行配置。创建对应原版的任务构建，依次：

1. `loadMission`（读取器的 `ContentContractError` 原样传递）、`readContentIdentity`（路径 `input.identity`）。
2. 运行配置（[run-config.ts](../../../src/core/world/run-config.ts) 的 `readRunConfig`）：`RunConfig` 为 `{ rawDifficulty, wingman, seed, clockUnitsPerTick? }`。
   - `rawDifficulty` 为 0–100 的整数，`difficultyGroup`（阈值 34、67）求出的组必须等于任务的 `campaign.group`；
   - `wingman` 为 null 或 `wingmanOptions` 的索引（原版选择值 = 索引 + 1）；
   - `seed` 为 uint32，由调用者提供，Core 不产生种子；
   - `clockUnitsPerTick` 为正偶数安全整数，省略时为 2。
   - 来源为 `original-import` 的内容只接受 `PRODUCTION_MISSION`（`mission/first-campaign`）、`PRODUCTION_RAW_DIFFICULTY`（19）与默认步长；其他取值只用于 `synthetic` 来源的契约测试，不代表支持其他关卡。带默认值的配置 `EffectiveRunConfig` 进入世界、快照与 replay 记录。
3. 语义校验（[setup-check.ts](../../../src/core/world/setup-check.ts) 的 `checkSetup`）。`loadMission` 只证明内容与跨 Asset 契约；以下情形在创建世界之前以 `CoreInputError` 拒绝，路径指向出错的结构，原因固定，不回显名称、坐标或其他导入值：
   - 地图框架与比例不是本切片的：右轴须为 `+x`、上轴须为 `-y`、中心须为原点、扇区数须为 1–559 的整数；参考比例须为正 f32，且换算因子为有限 f32；
   - 玩家声明不是种类位 0，来源不是唯一的 `object`（即不是编组之外的段 1 记录），或请求数不为空或 1；
   - 阵营或交互类别不符合 Core 支持的绑定（敌方掩码 `0x93780`、友方 `0x206c87e`、交互 `0x68000`）；固定高度种类（掩码 `0x87c`）；任务声明中出现僚机的种类位 1；没有种类的编组成员；
   - 任何任务声明或僚机选项的 8 个 `RuleInputs` 来源字段出现显式 0（来源零值的规范表示是 null）；
   - 被直接排程的记录与编组模板的生成时刻 × 64 超出 u32，生成概率非空且不为 100，或网格间距非零；所选僚机只检查后两项；僚机选项不是种类位 1；
   - 位置、矩形、布局偏移或僚机位置超出[支持的数值域](#原版规则辅助)；
   - 生成展开 Σ max(0, 请求数) × max(1, 成员数)（所选僚机另计 1）超过 `CORE_LIMITS.spawnExpansion`。
4. 机型输入（[craft-info-input.ts](../../../src/core/world/craft-info-input.ts) 的 `readCraftInfoInput`）：外层恰为 `{ id, content }`，否则为 `CoreInputError`；Asset ID 的语法错误保留 `readAssetId` 的 `ContentContractError`，不是 `data/` 类的 ID 为 `CoreInputError`；来源为 `original-import` 的内容只接受 `PRODUCTION_CRAFT_INFO`（`data/craft-info`）。内容经 `readCraftInfo` 读入冻结、与输入脱离的副本 `WorldCraftInfo { id, content }`（读取器的错误原样传递，非有限的 f32 在此被拒绝），不重复应用内容转换。随后读取九项规则数据输入（`readRuleDataInputs`，P3-07、P3-10）。
5. 按原版次序填写缺省值（只有 +0x78 的缺省抽取随机数）并排好生成队列；坐标换算已在第 3 步的语义校验中完成（[原版规则辅助](#原版规则辅助)）。
6. 机型语义检查（`checkCraftInfo`，在队列建好之后）：可实例化的种类取自会投递请求的队列项（`postsRequests`，与生成阶段的判定相同），即记录项的种类、编组项全部成员的种类与僚机项的种类位 1；未投递请求的记录、编组与未选的僚机不检查。只拒绝会使规则出错的数据，以 `CoreInputError` 报告，路径指向首个引用该种类的声明或 `input.craftInfo.content.craft[k]`，原因固定：
   - 种类没有机型记录（内容只有种类位 0–19 的记录）；
   - 机型 +0x0C 向零截断后不为正（停放行进以它为随机长度的模数）；
   - 停放 Warp 的计时 +0xA8 × 64 或 (+0xA8 + +0xA4) × 64 越出 i32；
   - 玩家机型 +0x88 为 0，或其能量阈值、以及 16 种分配等级组合下的能量运算越出 i32。

   其余零值按原版的分支处理（例如 +0xB8 不为正时速度比为 0），不拒绝。随后 [comm-input.ts](../../../src/core/world/comm-input.ts) 的 `communicationsRuleData` 按 CB-01 的次序检查三项通讯输入并计算通讯规则数据（P3-10，见下节），再由 `buildRuleData` 以同一可实例化记录（[setup-check.ts](../../../src/core/world/setup-check.ts) 的 `instantiableRecords`：发出请求的记录项、编组成员与所选僚机）做 CR-01 的集合与语义检查，并计算静态规则数据（P3-07，见下节）。
7. `setupHash`（[setup-hash.ts](../../../src/core/world/setup-hash.ts)）：规范文本为 `{ setup, craftInfo, ruleData }` 的 fnv1a64，16 位小写十六进制。`setup` 是校验后完整 `MissionSetup` 的规范文本（名称、坐标、成员、全部规则输入、阵营、模型与交互标志，以及事件触发）。事件触发按 `groups` 之后、`wingmanOptions` 之前写出，每个区间依次为 `lower`、`upper`、`messages`（字节串按规范文本的字符串规则）与 `summarySelector`；声明与僚机选项的 `eventTrigger` 写在 `aiTarget` 之后（[P3-03/28](../../plan/p3/03/subtasks/28-setup-hash-event-triggers.md)）。语义校验不读取事件触发，创建只在计算 setupHash 时写出它们；Core 不解释或调度它们。`craftInfo` 是严格读取后的完整机型内容与其 Asset ID，写出器按 `CraftInfo` 的成员类型逐项列出，内容类型增删成员时类型检查失败。`ruleData` 是 Core 保留的规则数据输入（`RuleDataInputs`），按 CR-01 与 CB-01 的表逐项写出、不含外观字段（见下节）；`aiPrograms` 的写出器同样按成员类型列出全部内容。setupHash 不随种子、僚机、身份或输入键序变化，把世界、快照与 replay 绑定到实际读取的初始数据；不证明来源。

创建结果为 tick 0、时钟 0、没有实体、视角模式与上一视角模式 0xC、任务状态 `built`（原版状态字节 1）、生成开关已置，并保存冻结的机型内容与静态规则数据。创建不返回事件：时刻为 0 的项在第一个 tick 实例化。相同输入得到相同的初始快照；世界不与输入或其他世界共享可变状态。重试就是以同一内容与配置新建世界。`initialWorldState(input)`（内部）返回同样校验后的初始状态，供录制、replay 与测试。

`instantiableModelIds(input)`（P3-07/33）只读 `{ mission, craftTypes, wingmanRoster, identity, run }`，按与创建相同的读取、语义校验与排程（抽取来自它自己的流，不影响世界）求出这次运行的可实例化机体在机型表中绑定的模型，去重后按 ID 升序冻结返回；这些字段的错误与 `createWorld` 相同。调用者只解码这些模型作为 `models`（[mission-input.ts](../../../src/app/resources/mission-input.ts) 的 `runModelInputs`，任务所有者与 [tools/replay-check.ts](../../../tools/replay-check.ts) 共用）；多一份或少一份都由世界创建拒绝。

### 规则数据输入与静态规则数据

[world/rule-data.ts](../../../src/core/world/rule-data.ts)（P3-07/12、24、34，CR-01；P3-10/12 的三项，CB-01）与 [world/comm-input.ts](../../../src/core/world/comm-input.ts)（P3-10/12）。原版事实见 [craft §3.8、§4.1、§4.4](../../original/formats/craft.md#38-load-transforms-in-0x2cf38-confirmed-code)、executable 的 [Combat rules](../../original/formats/executable.md#combat-rules-p3-07) 与 [Communications, docking and base service](../../original/formats/executable.md#communications-docking-and-base-service-p3-10)、[comm §7–§9](../../original/formats/comm.md#7-menu-state-machine-p3-1001)。

- **输入**（`RULE_DATA_FIELDS`，次序即创建输入中的次序）：调用者从三份逻辑 Asset 所在的同一个经 `validatePackage` 验证的包，用该包的 payload 读取器解码（[mission-input.ts](../../../src/app/resources/mission-input.ts) 的 `ruleDataInputs`）；Core 再严格读取，结果冻结、与输入脱离，事后修改调用者的对象不影响世界。

  | 字段 | 形状与 Asset | Core 读取与保留的部分 |
  |---|---|---|
  | `debrisParameters` | `{ id, content }`，`data/debris-parameters` | `readDebrisParameters` 读取全部内容 |
  | `projectileVisuals` | `{ id, content }`，`projectile` 类效果内容（`data/projectile-visuals`） | 只校验 `kind` 与每条记录的 `length`（有限 f32）；炮记录 g 的长度是记录 g 的 |
  | `explosions` | `{ id, content }`，`data/explosions` | `readExplosionTable` 读取，保留三张列表各项的动画引用（不保留声音） |
  | `explosionAnimations` | `{ id, content }` 的列表，ID 严格升序 | `readExplosionAnimation` 读取，保留帧数 |
  | `models` | `{ id, content }` 的列表，`model/` 类 ID 严格升序 | 只校验 `kind` 与第 1 部件列表的长度，不展开几何，不引入 `original-data` 的解析器 |
  | `aiPrograms` | `{ id, content }`，`data/ai-programs`（P3-07/34） | `readAiPrograms` 读取全部内容；规则只读内置程序记录 1、2 的 +0x14、+0x24、+0x2C，P3-08 在同一输入上扩展读取 |
  | `commMenus` | `{ id, content }`，`data/comm-menus`（P3-10） | `readCommMenus` 读取全部内容；规则读类别表 TABL 2007、对象列表的退出项 TABL 2009 与三张命令表 TABL 2003、2005、2013 的键与值 |
  | `baseRepairItems` | `{ id, content }`，`data/base-repair-items`（P3-10） | `readBaseRepairItems` 读取全部内容；规则读记录 0–10 的服务选择值 +0x6C |
  | `commMessages` | `{ id, content }`，`data/comm-messages`（P3-10，P3-03 修订 2） | `readCommMessages` 读取全部内容；规则读四张消息表的条目与各帧时长，名单 TABL 2001、2011 只用于名称序号 |

  单项输入的 Asset ID 须为 `data/` 类；来源为 `original-import` 时只接受 `PRODUCTION_RULE_DATA` 的生产 ID 与两位编号的 `data/explosion-animation/<nn>`。`RULE_DATA_LIMITS`（动画 48、模型 20、弹丸记录 64、部件 256，取自内容的结构上限）在复制之前检查。内容读取器与 Asset ID 语法的错误保留 `ContentContractError`；缺字段、多字段、kind 或次序错误与下列语义检查为 `CoreInputError`，路径指向首个出错的输入位置（如 `input.craftInfo.content.missiles[1].at44`），原因固定，不回显导入值。
- **集合与语义检查**（`buildRuleData`）：`explosionAnimations` 恰为爆炸表三张列表引用的动画集合，`models` 恰为可实例化机体绑定的模型集合，多一份或少一份都拒绝。其余检查按 CR-01 的 1–6，只读可实例化种类实际会读到的记录（未挂载的炮与导弹、不可实例化的种类与其 DEBRIS 表不读也不拒绝）：
  1. 列表 1、2 都非空且全部项帧数相同（n₁₂）；列表 3 非空时全部项帧数相同（n₃），可实例化机体有导弹挂点而列表 3 为空时拒绝。这项核对保证 EXPL 项的选择（归表现层，CR-11）不改变来源的释放时刻。
  2. DEBRIS 映射（craft §4.1）：种类位 0、1 恰需 max(c − 3, 0) 项且 c ≥ 1（第 0 部件是无参数的逃生舱），其他种类恰需 c 项，c 为模型第 1 列表的部件数。
  3. 非自动炮挂点（挂点类型 0、炮 +0x28 ≠ 2）的炮序号有弹丸记录长度。
  4. 挂点链：+0x18、+0x1C 两种链接都无环；列表项的挂点不同时带两种链接，其同时开火链上的后续组不带交替链接（两种会使“已尝试”标志跨调用保留的排列）。
  5. 除数与定义域：玩家的 c9C、c5C 为正；有护盾（c5C > 0）者 c60 ≠ 0 且 c60 × c5C 在 i32 内；瞄准炮（+0x28 = 1）的 +0x08 ≠ 0；可达炮的 +0x14 在 0–32、+0x24（弹丸寿命）非负；可达导弹的 +0x60 ≠ +0x64，制导计时字段经与首次回调共用的 `invalidGuidanceField` 判定（内容读取器已限定 +0x48、+0x54、+0x58，实际会在此被拒绝的只有负的 +0x44）；每个可实例化记录在其百分比下的船体与 `0x3060c` 各步在 i32 内；派生的射程、引信半径、碰撞形状与挂点偏移不越出 f32。
  6. 内置程序记录 1、2 存在且 +0x14（更新周期）非负。导弹是否追踪取决于发射时的锁定，所以不论运行装备什么都检查。
- **通讯输入的检查**（`communicationsRuleData`，CB-01，在 `checkCraftInfo` 之后、`buildRuleData` 之前，按此次序，只检查 P3-10 的规则会读到的部分）：
  1. 菜单键：菜单项的数据键是项文字的第 1 字节（comm §7.2）。三张命令表的每一项、类别表的退出项与 TABL 2009 至少 2 字节；三张命令表与类别表的退出项（值 0）折叠后为 `x`，且是该表中第一个折叠后为 `x` 的项；命令表的其余项的键为 `1`–`9`（`select-number` 只能表达这些键）；TABL 2009 的键折叠后为 `x`。重复的键不拒绝，保留首匹配次序。
  2. 生成键的上界：可显示的类别数与每个类别的对象数（不含退出项）的保守上界都 ≤ 9。对象数的上界是有效僚机配置下所有会投递请求的排程项（直接与延迟的记录、编组每次请求的每个成员、所选僚机）中种类在该类别掩码内的实例数之和；掩码含只由运行时构造的种类位（14、20–25）时上界无限，拒绝。
  3. 服务选择值：11 个都在 0–18、33 或 34 内（BS3、BS10）。
  4. 基地速率：玩家机型的 +0x54 不为负（原版以无符号除法求速率；+0x9C > 0 已由 CR-01 检查 5 保证）。
  5. 消息元数据：结构由读取器保证，Core 不另拒绝；查找失败（头像越出子表数、序号越界、条目为 0）是原版的“没有消息”分支（RQ4）。

  错误为 `CoreInputError`，路径指向 `input.commMenus.content…`、`input.baseRepairItems.content.subsystemSelectors…` 等结构位置，原因固定，不回显导入值。
- **静态规则数据**（`WorldState.ruleData`，`WorldRuleData`）：创建时计算一次并冻结，之后不变：`inputs`（上表保留的部分，即 setupHash 绑定的内容）、`explosionFrames`（`lists12` 为 n₁₂，`list3` 为 n₃，列表 3 为空时为 null）、按炮与导弹记录的载入后数据 `guns`、`missiles`（射程及其平方、导弹引信半径的平方等；未被可实例化机体挂载的为 null）、按种类位的 `craft`（载入后的碰撞形状、挂点偏移、第 1 列表部件数与 DEBRIS 数据；不可实例化的种类为 null），以及 `homingPrograms`（记录 1、2 的三项，按记录号，即共享转向模块的 `SteeringProgram`），和 P3-10 的 `communications`（`CommunicationsRuleData`）：`menus`（按次序的类别项 `{ key, kindMask }`、`objectListExitKey` 与按 `MenuCommandTable`（`gated`、`other`、`kind2`，即 TABL 2003、2005、2013）的命令项 `{ key, code }`，键为原始字节，判定时再按 `foldKey` 折叠）、`serviceSelectors`（恰 11 项）、`messages`（表 20011、20019、20985 按头像与序号、表 20983 按序号的各帧时长，条目为 0 时为 null）与 `nameIndexes`（`NameIndexTable`：每个可能的 `NameReference` 在 TABL 2001、2011 中第一个字节相等项的位置 `{ in2001, in2011 }`，没有时为 null；规则以 `nameIndexOf` 查表，运行中不比较字符串，RX1、D-03 第 4 条）。载入变换在 [load-transforms.ts](../../../src/core/rules/load-transforms.ts) 中按原版的存储类型计算。静态规则数据由 setupHash 绑定的输入决定，不进快照，不与原内容形成两份可变事实。
- **建造期抽取：** 无。EXIC 子集与每次爆炸的 EXPL 项由表现层选择，不消耗 Core 的随机数（CR-11）；头像占用标志在创建时都为 false（CB-01）。
- **setupHash 的覆盖**（CR-01，接在 `craftInfo` 之后）：`debrisParameters` 与 `aiPrograms` 为 ID 与完整内容；`projectileVisuals` 为 ID 与按记录次序的长度（不含模板、选择值、宽度与颜色）；`explosions` 为 ID 与三张列表按次序的动画引用（不含声音）；`explosionAnimations` 为按 ID 次序的 ID 与帧数（不含帧图像）；`models` 为按 ID 次序的 ID 与第 1 列表部件数（不含几何、贴图、颜色、部件标志与声音）；P3-10 的 `commMenus`、`baseRepairItems` 与 `commMessages` 为 ID 与完整内容（键在菜单文字之内，名单决定名称序号，CB-01）。规则数据输入是调用参数而不是 replay 记录字段，由 setupHash 绑定，所以 replay 记录的形状不变。

### 世界与错误

[world.ts](../../../src/core/world/world.ts) 的 `World`：

- **`step(tickInput)`：** 先用 `readTickInput` 读取并复制整份输入，再由 `registerTick` 预检：tick 或时钟会越过安全整数，或本 tick 可能分配的实体 ID 会越过安全整数时，以 `CoreInputError` 拒绝，世界不变、不锁存。然后按[流水线](#系统流水线)推进恰好一个 tick（tick 加 1，时钟加 `clockUnitsPerTick`），返回本 tick 深度冻结的 `DomainEvent[]`。Core 没有在 `step` 之外推进或补计时间的入口。
- **`projection()`、`renderState()`、`snapshot()`：** 任意时刻可读，不改状态；每次返回新的、深度冻结且与世界脱离的副本，以后的 tick 不改变已返回的数据。
- **错误类型**（[errors.ts](../../../src/core/errors.ts)）：调用者违反契约为 `CoreInputError(path, reason)`；Core 自身失败为 `CoreFaultError(code, site)`，两者互不为子类。`code` 是封闭联合 `invariant-violated`（内部不变量被破坏）、`budget-exhausted`（执行中耗尽 `CORE_LIMITS` 预算）、`world-faulted`（为已故障的世界保留，当前代码没有使用）；`site` 是固定的检测位置标识，例如 `pipeline.events`，不含内容、名称或坐标。
- **故障锁存：** 只有 `step` 在改动之前的输入读取与预检（`readTickInput`、`registerTick`）抛出的 `CoreInputError` 不锁存。流水线执行中与读取中抛出的任何错误都使世界保存一个 `CoreFaultError`（`CoreFaultError` 以外的异常，包括 `CoreInputError`，都包装为 `invariant-violated`，`site` 为 `world.step`、`world.projection` 等，`cause` 保留原错误），本次调用不发布任何部分事件、projection 或快照；之后四个方法都重抛同一个错误实例。P3-04 据此停止该运行。
- `constructWorld(state)`（内部）：围绕已建的状态构造世界，不接受处理器。

### 契约（contracts/）

- **时钟**（[time.ts](../../../src/core/contracts/time.ts)）：任务时钟是非负安全整数，单位为原版的 1/64 秒（`CLOCK_UNITS_PER_SECOND` = 64），创建时为 0。`DEFAULT_CLOCK_UNITS_PER_TICK` 为 2，即名义上每秒 32 个 tick；`CLOCK_UNITS_PER_TICK` 是“正偶数安全整数”的数值规则。纯函数：
  - `stepSeconds(units)`：一个 tick 的秒数（单位 ÷ 64）；
  - `advanceTime(time, units, path)`：下一个 tick 的 `{ tick, clock }`，越过安全整数时抛出 `CoreInputError`；当前时间或步长不合契约为 `CoreFaultError`；
  - `secondsToClockUnits(seconds, path)`：非负安全整数秒 × 64；
  - `isDue(clock, due)`：`clock > due`，即原版“取样超过到期时刻的第一帧”对应“时钟超过到期时刻的第一个 tick”。

  默认之外的步长只用于 Node 校准测试。32 Hz 是项目的固定步长选择，不是原版帧时序（[已知差异](#已知差异)）。
- **动作输入**（[tick-input.ts](../../../src/core/contracts/tick-input.ts)）：`TickInput` 为 `{ axes, commands }`。
  - `axes` 为 `{ pitch, yaw, roll }`，各为 [−1, 1] 内的有限数；正方向分别为抬头、机头右转、从驾驶员向前看顺时针滚转，不支持的直接操纵保持 0。P3-06 把三个轴解释为原版整数操纵路径上的数字摇杆（[飞行控制、运动与停放](#飞行控制运动与停放)）。
  - `commands` 是至多 `commandsPerTick` 个 `Command` 的有序数组，每项在本 tick 按数组顺序处理一次。`Command` 是 17 个变体的封闭判别联合（`COMMAND_TYPES`），每个变体只接受自己的字段，字段与取值按 spec 的[命令形状表](../../plan/p3/02/spec.md#输入与命令)及 [P3-05 的契约修订](../../plan/p3/02/spec.md#p3-05-的契约修订速度档位命令)：`fire`、`speed`、`speed-preset`、`select-number`、`navigate-selection`、`confirm-selection`、`target`、`cycle-main-weapon`、`select-missile`、`toggle-map`、`map-point`、`request-warp`、`communications`、`launch`、`energy`、`damage-report`、`cockpit-front`。
  - `readTickInput(value)`：只接受普通对象与无空位、无额外字段的普通数组；每个值只经属性描述符读取一次，不运行访问器；先查命令数再读元素。结果按规范字段次序新建并深度冻结，−0 变为 0，所以等价的动作得到相同的记录。错误为 `CoreInputError`，路径以 `tickInput` 开头，不回显未知键或值。
- **领域事件**（[domain-events.ts](../../../src/core/contracts/domain-events.ts)）：`step()` 按发出顺序返回可序列化的纯数据，不含对象引用（[ADR-0006](../../decisions/ADR-0006-core-returns-events.md)）。`DomainEvent` 是 P3-02、P3-06 的六个变体、P3-07 的 13 个变体与 P3-10 的 13 个变体的封闭联合，基础字段为 `DomainEventBase<Type>` 的 `{ type, tick }`，`tick` 是发出它的 step 的编号：
  - `command-result`：`{ type, tick, commandIndex, commandType, outcome, reason }`。每个结构合法的命令恰有一个。`outcome` 取自 `COMMAND_OUTCOMES`：`accepted` 时 `reason` 为 null，`rejected` 或 `ignored` 时为 `COMMAND_RESULT_REASONS` 中的封闭原因码，其他规则任务可沿用：
    - `not-implemented`：还没有规则处理该命令，是开发阶段的结果，不是原版的无作用；
    - `player-unavailable`：没有可接受命令的玩家实体（不存在、被毁、尚未活动或正在移除）；
    - `wrong-context`：原版在当前交互上下文中不处理该命令；
    - `no-target`：命令需要有效目标而没有；
    - P3-07 的九个（CR-05）：`no-candidate`（目标选择没有合格的对象；P3-10 扩展为“没有满足条件的对象或菜单项”，CB-07）、`no-change`（选择或页面已是所求，或档位会越出 0–3）、`no-weapon`（机型没有挂点，或列表的当前挂点为空）、`weapon-disabled`（挂点已毁）、`no-ammunition`（导弹挂点无弹）、`insufficient-charge`（玩家的炮充能不足）、`cooldown`（挂点的间隔未过）、`misfire`（受损挂点的抽取失败）、`out-of-arc`（瞄准炮对目标没有解）。各命令与原因码的对应见[战斗规则](#战斗规则p3-07)的命令表。
    - P3-10 的一个（CB-07）：`subsystem-disabled`（命令所需的玩家子系统为状态 2，即字段 13 为 2 时的 `communications open`）。P3-10 的命令与原因码见[通讯、停靠与基地服务](#通讯停靠与基地服务p3-10)。
  - `object-instantiated`：`{ type, tick, entityId, kindBit, source, position }`，每个实例化的对象一个，按实例化次序。`source` 为 `EntitySource { collection: 'mission' | 'wingman', index, group }`，`group` 为 null 或编组成员的 `GroupMembership { index, request, member }`；`position` 为运行时单位的 `Vec3`。
  - `speed-assist-toggled`：`{ type, tick, commandIndex, enabled }`，`toggle-auto-match` 被接受后紧随其结果，`enabled` 为切换后的开关。
  - `speed-matched`：`{ type, tick, targetEntityId, origin, … }`，只在匹配实际写入时发出。`origin: 'command'` 带 `commandIndex`，是请求处理中应用的手动匹配；`origin: 'assist'` 带 `speedDifferenceExceeded`（匹配前双方速度差超过原版的 HUD 闪烁常数），是速度辅助的匹配。
  - `speed-assist-released`：`{ type, tick }`，速度辅助匹配过之后失去目标、恢复满油门。
  - `object-left-world`：`{ type, tick, entityId, kindBit, source }`，停放对象唯一的真正退场，每个对象一生至多一次；`source` 是退场时来源的快照，运行中创建的实体为 null。
  - **P3-07 的事件**（CR-06）是发出时的事实快照：不带时钟（时钟恒为 tick × `clockUnitsPerTick`，消费者从 `clock` 分区读取），位置与姿态是发出时实体的值，不含名称原文或资源字节，消费者不需要按 ID 再查实体（被引用的实体可能已经移除）。`Attacker` 为 `{ type: 'shooter', entityId, kindBit }`（命中时仍有效的发射者，或停放交战的射击者）、`{ type: 'lost-shooter' }`（发射者已失效，不计击杀）或 `{ type: 'none' }`（碰撞与 AI 范围伤害）；`ShotTrigger` 为 `{ type: 'command', channel, commandIndex }`、`{ type: 'ai', channel: 0 | 1 | 2 }` 或 `{ type: 'automatic' }`。
    - `target-changed`：`{ playerEntityId, previousTarget, target, targetKindBit, mode, origin, commandIndex }`。请求处理每应用一个 `select-target` 发出一次；`origin` 为 `command`（带命令序号）或 `automatic`（`commandIndex` 为 null）；`mode` 是应用时的目标模式。目标的清除（失效、停放、移除，以及以后 P3-09 至 P3-11 的清除）不发此事件，持续的目标由 projection 给出。
    - `target-cleared`：`{ playerEntityId, previousTarget, cause }`，只由帧尾的右显示屏清除发出，`cause` 为 `invalid`、`base-view` 或 `warp`。
    - `weapon-selected`：`{ entityId, list, index, mount, changed, commandIndex }`，紧随被接受的 `cycle-main-weapon` 或 `select-missile` 的结果；`changed` 表示当前挂点是否改变，`index` 在空列表时为 −1。`commandIndex` 为 null 的形式由没有命令的选择使用：P3-10 的完全修理在请求处理中对玩家前进列表时发出（CB-10）；基地服务步的补弹不发（BS7）。
    - `shot-fired`：`{ shooterEntityId, shooterKindBit, shooterPosition, entityId, family, weapon, mount, position, trigger }`，请求处理构造弹丸或导弹之后；`family` 为 `gun` 或 `missile`（主通道也可发射导弹），`weapon` 是炮或导弹记录序号，`entityId` 是新实体。
    - `hit`：`{ victimEntityId, victimKindBit, victimPosition, cause, sourceEntityId, attacker, damage, gated, shield, hull, shieldWasEmpty, impact, projectile }`。每次原版投递受击表现项（`0x2a40c`、`0x2a5fc`）或停放交战实际施加伤害时一次，在护盾与船体结算之后、被毁处理之前。`cause` 为 `projectile`、`missile`、`collision`、`area`（P3-08）或 `parked`；`sourceEntityId` 是弹丸或导弹，其他原因为 null；`shield`、`hull` 为 `{ before, after }`（i32）；`gated` 是被玩家被毁视角门禁挡下的命中（状态不变）；`shieldWasEmpty` 是原版受击项的 +0x0C（受击前护盾 ≤ 0）；`impact` 为弹丸命中带盒形状时的 `{ point, local, face }`，否则为 null；`projectile` 为弹丸的结局 `ricochet` 或 `removed`，其他为 null。受击者已被毁时不发，碎片受击不发（原版没有受击项）。
    - `object-destroyed`：`{ entityId, kindBit, source, position, activity, attacker, eventClass, outcome }`，每个对象从存活到被毁只发一次，在其 `hit` 之后。`eventClass` 是原版对象事件的类别（攻击者种类为 1，即玩家击杀时为 0，否则为 1）；`outcome` 停放者为 `removed`、玩家为 `delayed`、其他为 `explodes`。P3-08 的 AI 自爆（`0x6313c`）不置被毁标志，不发此事件。
    - `explosion-started`：`{ entityId, sourceEntityId, sourceKindBit, variant, position, activationClock }`，爆炸在请求处理中激活时：通常在构造的下一 tick，在对象更新中构造的在同一 tick；位置是激活时、尚未移动的位置。它是表现层选择 EXPL 项并只选一次的依据（CR-11）。
    - `missile-ended`：`{ entityId, shooterEntityId, outcome, position, orientation }`，导弹的到期请求被处理时：起爆（`detonated`）在爆炸构造与范围伤害之前，熄火（`fizzled`）在进入待移除时；`shooterEntityId` 在发射者已失效时为 null。
    - `fragment-expired`：`{ entityId, sourceKindBit, part, position, outcome }`，碎片的到期请求被处理时；`outcome` 为 `explodes`（带标志或被击落）、`escape-pod`、`wingman-pod` 或 `removed`。
    - `source-released`：`{ entityId, kindBit, fragmentEntityId, removed }`，第 0 部件碎片的交接请求被处理时；`removed: false` 只出现于玩家（原版不移除玩家对象）。
    - `energy-depleted`：`{ entityId, kindBit, position }`，能量更新进入耗尽分支且耗尽锁存为 false 时，每次转换一次；以能量 > 0 结束的更新清除锁存。
    - `energy-allocation-changed`：`{ entityId, shieldLevel, chargeLevel, commandIndex }` 与 `left-page-changed`：`{ page, previousPage, commandIndex }`，紧随被接受的档位或页面命令的结果。`left-page-changed` 的 `commandIndex` 为 null 的形式由没有命令的页面写入者使用：P3-10 的清空、来电与左显示屏处理器只在页改变时发出（CB-03），P3-09 的 Warp 页。P3-10 的菜单命令写页总是发出，带命令序号。

  - **P3-10 的事件**（CB-13，`CommandDeliveredEvent` 至 `BaseConfirmedEvent`）沿用 CR-06 的通则（不带时钟、不含名称原文或内容字节；说话者是入队时的 `SpeakerSnapshot { entityId, kindBit, name }`，说话者移除后仍可显示）。消息以 `MessageIdentity` 表示：`{ table: 20011 | 20019 | 20985, face, index }` 或 `{ table: 20983, face: null, index }`。
    - `command-delivered`：`{ receiverEntityId, receiverKindBit, code, senderEntityId, commandIndex }`，请求处理中实际写入接收者的 `ai.pendingCommand` 时（接收者已失效则不发）；不表示接收者已执行。
    - `radio-queued`：`{ message, callback, speaker, position: 'head' | 'sorted', length }`，每次入队；停靠回复恰为 `head`，`length` 为入队后的队列长度。
    - `radio-taken`：`{ message, speaker }`，`communications-reply` 取出队首、通道转为 `loading` 时。
    - `incoming-started`：`{ message, speaker, frameDurations, shown }`，通讯呈现子步中通道转为 `playing` 时；`shown` 为页 5 已显示（视角不是 1）。`incoming-ended`：`{ message, speaker, callback, countdownStarted }`，播放结束并执行回调后；`countdownStarted` 为停靠回复把子状态 3 改为 4。没有媒体时也照常发出。
    - `radio-flushed`：`{ cause: 'docking-cancel', removed, interrupted: 'none' | 'loading' | 'playing' }`，清空时，在其 `left-page-changed` 之后；P3-11 扩展 `cause`。
    - `docking-requested`：`{ playerEntityId, dockingObject, previousSubState, deadlineClock, commandIndex }`，命令码 9 的选择，紧随该命令的 `left-page-changed`。`docking-cancelled`：`{ playerEntityId, dockingObject, cause: 'timeout' | 'invalid-object' | 'gate' }`，三种取消（原版没有反馈，只供诊断与 UI 状态，G-03 不显示文字）。
    - `docked`：`{ playerEntityId, baseEntityId, wingmanEntityId, previousViewMode }` 与 `departed`：`{ playerEntityId, origin: 'command' | 'automatic', commandIndex, viewMode, previousViewMode, position, orientation, wingmanEntityId }`，请求处理中成功的停靠与每次离港；各自紧随一个 `transition`：`{ gap: 'G-02/3' | 'G-02/4' }`，每 tick 至多 2 个，Runtime 据此截断帧并进入保持（[app 模块说明](./app.md#正式-runtime)）。
    - `base-navigated`：`{ direction, row, moved, commandIndex }` 与 `base-confirmed`：`{ row, record, moved, commandIndex }`，请求处理中每个基地键请求一个（原版每次都有音效）；`moved` 为光标或行是否改变，没有基地服务（同 tick 先离港）时 `row`（与 `record`）为 null。

  一个 tick 内的次序：玩家更新中先是速度辅助的事件（`speed-matched` assist 或 `speed-assist-released`，至多一个），再按索引发出命令结果，`speed-assist-toggled`、`weapon-selected`、`energy-allocation-changed` 与 `left-page-changed` 紧随所属命令的结果；请求处理中按请求的处理次序发出手动匹配的 `speed-matched`、`target-changed`、`shot-fired`、`missile-ended`（起爆时随后按遍历次序为每个受击者发出 `hit` 与可能的 `object-destroyed`）、`explosion-started`、`fragment-expired` 与 `source-released`；移动阶段按弹丸的遍历次序发出弹丸命中的事件，碰撞阶段按两遍的对次序发出；能量阶段按遍历次序发出 `energy-depleted`；`object-left-world` 在停放更新阶段发出，同一对象的停放交战事件在它之后；`target-cleared` 在帧尾，每 tick 至多一个。同一次伤害中 `hit` 先于 `object-destroyed`。`object-instantiated` 不与它们排序。P3-10 的事件（CB-13）：`mission-flow` 的 `docking-cancelled` 与清空的 `radio-flushed`（及其页事件）最先；命令的 `left-page-changed`、`docking-requested` 紧随所属结果；`0x3bed0` 与实例化的 `radio-queued` 按遍历次序；`communications-reply` 的 `radio-taken`；请求处理按请求次序发出 `command-delivered`、`docked`/`departed` 与其 `transition`、基地键事件与门禁的 `docking-cancelled`；伤害与停放阶段的 `radio-queued`；帧尾依次为左显示屏处理器的页事件、尾随警告的 `radio-queued` 与通讯呈现子步的页事件、`incoming-started`/`incoming-ended`。比较按此校验（[快照、录制、replay 与比较](#快照录制replay-与比较)）。
- **规范文本**（[canonical-text.ts](../../../src/core/contracts/canonical-text.ts)）：`canonicalObject(members)` 以显式次序列出对象成员（复制并冻结），`canonicalText(value, path)` 写出紧凑 JSON，`canonicalHash(value, path)` 为其 fnv1a64（16 位小写十六进制）。类型化写出器 `canonicalMembers`（映射类型要求每个成员恰好写一次）、`canonicalList`、`canonicalNullable`、`canonicalScalar` 与类型 `CanonicalWriter`、`CanonicalMembers` 由快照与 setupHash 共用（P3-06 从快照移到这里）。规则：不接受普通对象，键的插入次序因此不会进入文本；−0 写为 0；非 ASCII 码元一律转义为 `\uXXXX`；非有限值、非规范值、重复成员与超过 `canonicalTextLength` 的文本以 `CoreInputError` 拒绝，由调用者决定是否转为故障。字符串在编码前精确计算转义后的长度，超长时不分配。哈希只是同一版本、同一运行时内的一致性诊断，不证明来源、防篡改或无碰撞。
- **校验读取器**（[validation.ts](../../../src/core/contracts/validation.ts)）：`readDataRecord`、`requireExactFields`、`readExactRecord`、`readList`、`readNumber`（−0 变为 0）、`readChoice`，以及数值规则 `NumberRule`、`numberIn`、`integerIn`。只接受纯数据，每个值经描述符读一次，错误不回显未知键或值。
- **上限**（[limits.ts](../../../src/core/contracts/limits.ts)）：见[上限](#上限)。

### 实体与世界状态（world/）

- **`WorldState`**（[world-state.ts](../../../src/core/world/world-state.ts)）：`config`、只读的 `setup`、`craftInfo`（冻结的 `WorldCraftInfo`，规则读取机型记录的唯一来源）与 `ruleData`（冻结的静态规则数据，见[规则数据输入与静态规则数据](#规则数据输入与静态规则数据)；三者都不进入快照，由 setupHash 绑定）、`tick`、`clock`、`rngState`（世界自有的 Mulberry32 状态，所有规则抽取都来自它）、`missionStatus`、`entities`、`player` 与 `spawn`，以及 P3-10 的 `flow`、`communications`、`ai` 与 `baseService`（见下文“通讯、停靠与基地服务的状态”）。只有流水线修改它。`WorldConfig` 为 `{ content, mission, setupHash, group, slot, rawDifficulty, wingman, seed, clockUnitsPerTick }`，`slot` 是缺省值使用的任务号。`MissionStatus` 目前只有 `built`；后续状态由 P3-11 加入（任务内子状态在 P3-10 的 `flow` 中，见下文）。`createWorldState(config, setup, craftInfo, ruleData, spawn, rngState)` 为内部函数。
- **实体表**（[entity-table.ts](../../../src/core/world/entity-table.ts)）：`EntityTable` 按原版对象表（[Q-08](../../original/formats/executable.md#runtime-object-table-p3-0201)）组织。
  - `allocate(init)`：ID 从 1 起按分配次序分配，同一世界内不复用（`nextId` 只增不减）；新实体追加到其种类位的表尾。种类位越界或位姿非有限为 `invariant-violated`；停放与移动块不一致或移动块的变体与种类不符（`entities.movement`）、飞行状态的 f32 值、时钟或 AI 模式不合法（`entities.flight`）、战斗状态与种类不符或越出 CR-02 的范围（`entities.combat`）、表现与战斗状态不一致（`entities.presentation`）、运行时种类不取分配器缺省（`entities.runtime-kind`）同为 `invariant-violated`；超过 `CORE_LIMITS.entities` 个现存实体或 ID 越过安全整数为 `budget-exhausted`。分配复制并冻结不可变的部分，与 `init` 脱离。
  - `walk(mask)`：按种类位升序、每张表按分配次序遍历，且是实时遍历：遍历中追加到当前或更高种类位的实体在同一遍被访问，追加到更低位的不被访问。依赖遍历次序的规则（目标选择、AI 等）只能用它。`ALL_KINDS` 是全部种类位的掩码。
  - `remove(entity)`：只在请求处理中调用；遍历进行中移除为故障。`get(id)` 对已移除的 ID 返回 undefined，引用随之失效，不遍历引用方。`byId()` 按 ID 升序，`size` 为现存实体数。
- **实体**：`Entity` 的字段为 `id`、`kindBit`（原版运行时种类的位号 0–31，与内容的 `craftType` 一致，分配时固定；掩码另用 uint32 位集合表示）、`source`（`EntitySource`，运行中创建的实体为 null）、`name`（`NameReference`）、`side`、`baseInteraction`、`presentation`（`EntityPresentation`，分配时确定、之后不变，见下文的战斗状态）、`position`（运行时单位）、`orientation`（`Matrix3`，按行存储的三行姿态）、`placementSerial`、`ruleInputs`（`EntityRuleInputs`）、`state`、`activity` 与 `destroyed`，以及 P3-06 的飞行状态、P3-07 的 `combat`（下两条）与 P3-10 的 `communications`。`EntityInit` 是实例化提供的部分。
  - `NameReference` 为封闭联合：`none`（原版明确的无名分支）、`candidate`（声明引用与候选索引）、`pool`（名称池索引）、`craft-type`（种类位）。候选与池的文字从 setup 解析；种类名文字在 P3-03 导入的 `data/craft-info` 中（CINF 机型记录 +0x04，见[交接](#交接)），不在 setup 中。
  - `EntityRuleInputs` 是实例化时从记录复制的缺省后 i32 值：`percentB`/`percentC`/`percentD`（+0x60–+0x68）与 `aiValueA`/`aiValueB`/`aiValueC`（+0x70–+0x78，即运行时 +0xDC/+0xE0/+0xE4）。
  - P3-10 的 `communications`（`EntityCommunications`，CB-04）见下文“通讯、停靠与基地服务的状态”。
  - `ObjectState` 为原版对象状态的八个值：`new`、`presentation-ready`、`awaiting-presentation`、`destroyed-source`、`area-switch`、`pending-removal`、`active`、`projectile-hit`；`Activity` 为 `parked`、`active`、`docked`（停靠只由 P3-10 的 `dock` 写入玩家与随行的僚机，离港改回 `active`）。`initialState(activity)` 给出分配或切换停放时的状态（停放为 `new`，否则 `presentation-ready`）；`isActiveState` 为原版状态 7 及以上（`active`、`projectile-hit`）；`isLive` 排除被毁与待移除，查询据此筛选，不能由“仍在种类表中”推断存活。
- **飞行状态（P3-06，[检查点 A 定稿的形状](../../plan/p3/06/spec.md#检查点-a-定稿的状态与契约)）：** 实体字段 `maximumSpeed`（+0x78，f32 单位/秒，规则算出的当前上限，与机型基准 +0xB8 分开）、`lastParkedUpdateClock`（+0x18，时钟单位）、`warpClock`（+0xC8，时钟单位，0 表示未设）、`inWarp`（+0xCC）、可空的 `movement`、`ai` 与可空的 `formation`。所有 f32 字段都是 `Math.fround` 的不动点。
  - `MovementBlock`（对象 +8）是按 `mode` 区分的封闭联合（P3-07 的 CR-03 把它扩为三个变体，三者都有 `speed`，供瞄准提前量、速度匹配与 `0x218e8` 读取）。`SteeredMovementBlock`：`mode` 为 `craft` 或 `warp`（原版模式 0、3，字段相同，P3-09 就地切换模式；机体与导弹使用），`speed`、`commandedSpeed`、`atCommandedSpeed`、`speedRatio`，三轴 `steering`（`SteeringAxis { rate, enabled }`，关闭时速率保留但不施加）与 `timedRotation`（可空的 `TimedRotation { rate, decay, end }`），可空的 `impulse`（`Impulse { direction, magnitude }`）、`locked` 与可空的 `disturbance`（`Disturbance`：等级 1，或带三个整数偏置的等级 2）。参考最高速度（原版块 +0x70）恒等于机型 +0xB8，从机型内容读取，不另存。P3-07 的 `LinearMovementBlock`（`linear`，原版模式 1：弹丸与爆炸）为 `speed`、`velocity`（构造后不变，跳弹改写）、`previousPosition`（本次移动前的位置）与 `hitTest`（弹丸为真，爆炸为假）；`SpinningMovementBlock`（`spinning`，模式 2：碎片）为 `speed`、`velocity`、`spin`（每次移动转过的弧度，不乘步长）与 `spinAxis`（0–2）。冲量、定时旋转、锁定与扰动只在 steered 块中。`ROTATION_AXES` 为 `pitch`、`yaw`、`roll`，分别绕第 1、2、3 行。
  - 不变式：实体停放时恰好没有移动块，活动与停靠时恰好有；块的变体与种类相符（机体为 `craft`/`warp`，导弹只为 `craft`，弹丸为带命中检测的 `linear`，爆炸为不带的 `linear`，碎片为 `spinning`）。`setActivity(entity, activity, movement)` 一起写入活动与移动块并重新开始状态，是实例化活动判定与停放切换共用的唯一入口；`copyMovement` 给出 steered 块的脱离副本（运动规则也用它），分配按变体复制。
  - `AiState` 是 `0x68050` 在实例化时写入的初态：`mode`（`AiMode`：0、1、2、4、5）、`target`（AI 目标 +0x90）、`goal`、`targetOffset` 与 `objectTarget`（机体的 +0x8C，初值 null；玩家的 +0x8C 是 `PlayerState.target`，玩家实体的 `objectTarget` 恒为 null）。CR-02 收窄了 `objectTarget`：运行时种类的 +0x8C 另有含义（导弹的目标、爆炸持有的来源、第 0 部件碎片的交接来源），存于它们的战斗状态，这些实体的 `objectTarget` 恒为 null；机体的 `objectTarget` 由瞄准炮、制导导弹与停放交战读取，由 P3-08 的 AI 与停放的多目标交战写入。不能解析的 ID 视为无效。P3-10 加入 `pendingCommand`（+0x184，CB-04，与 P3-08 草案 CR-18 同名同形）：`{ code, issuedTick } | null`，只由 `deliver-command` 在请求处理中写入（后写覆盖先写，不校验接收者），由 `0x3bed0` 对种类 `0x6807c`、状态 `active` 的对象消费并清除，僚机由 P3-08 消费；实例化与分配器写 null，停放、恢复与救援不清。
  - `Formation { leader, offset }`：段 5 编组中每个布局周期的后续成员跟随该周期的首个成员，偏移为 f32(l − layout[0])，在领队的三行上取分量（[生成阶段](#系统流水线)写入）。
  - `allocatorAiState()`、`allocatorFlightState()` 与 `ZERO_VECTOR` 给出原版分配器的缺省（AI 模式 5、无目标、零向量、无 Warp、无编队），供不经 `0x68050` 的运行时种类的构造者使用；`lastParkedUpdateClock` 不在其中，由每个构造者自行定义。P3-07 的构造者用 [combat-init.ts](../../../src/core/rules/combat-init.ts) 的 `runtimeKindDefaults()`（在其上加活动、无来源、无名称、无阵营与交互、规则输入为 0、`lastParkedUpdateClock` 为 0）。
- **战斗状态（P3-07，CR-02）：** `Entity` 的 `combat`（`EntityCombat`）是按运行时种类的封闭联合，`combatTypeOf(kindBit)` 给出种类应有的类型：种类位 0–19 为 `craft`，20 为 `missile`（`MISSILE_KIND_BIT`），21 为 `projectile`，22 为 `explosion`，24 为 `fragment`（只有判别值 3；判别值 1、2 归表现层，CR-11），其他种类没有战斗类型。字段、范围与生命周期以 CR-02 的定义与字段表为准；原版对象偏移写在类型注释中。
  - `CraftCombat`：资源 `energy`、`shield`、`charge`、档位 `shieldLevel`、`chargeLevel`（`Level` 0–3）、剩余功率 `sparePower`（E）与满速功率 `fullSpeedPower`（T）、两个能量时钟与耗尽锁存 `depleted`（项目字段，只用于 `energy-depleted` 每次转换只发一次）、`hull`（i32，可为负）、19 个两位字段 `subsystems`（`SUBSYSTEM_COUNT`）、武器块 `weapons`（三张列表的 `selections`、玩家的导弹锁定 `lock` 与每个机型挂点一项的 `mounts`：冷却 `lastShotClock`（null 表示从未写入）、弹药、损伤与自动挂点的连发、瞄准、目标与保持值）、最近一次受击表现的时钟 `hitFeedbackClock`，以及供 P3-08 读取的 `proximity`、`lastVictim`、`lastAttacker`。`blankCraftCombat()` 是分配时的空白状态，不是原版值，实例化随即写入初值。
  - `MissileCombat`（导弹记录、发射者、目标、发射字节、程序 `unguided`/`heat-seeker`/`homing`、到期类别 `detonate`、接触对象 `contact`、首次回调后的制导块 `guidance` 与追踪导弹的 `homing`）、`ProjectileCombat`（炮记录、发射者、首次回调后的计时块 `expiry`）、`ExplosionCombat`（来源与其种类、变体 `large`/`other`/`missile`、持有的来源 `heldSource`、激活与移除时刻）、`FragmentCombat`（来源种类、部件原序号、DEBRIS 序号或 null、耐久、`explodeOnExpiry`、到期 `pending`/`never`/`at`、第 0 部件的交接来源 `handOff`）。
  - **表现选择器：** `EntityPresentation` 为 `{ type: 'model', model }`（机体）、`{ type: 'missile', missile }`（导弹记录序号；外观由 P3-12 从内容解析）、`{ type: 'projectile', visuals, record }`（`projectileVisuals` 的 Asset ID 与记录序号，即炮记录序号）、`{ type: 'explosion', variant }`（EXPL 列表与项由表现层选择）与 `{ type: 'fragment', model, part, display }`（源模型与第 1 列表原序号；`display` 为 `parts-0-2` 只用于种类位 0、1 的第 0 部件，即逃生舱，`isEscapePod`）。
  - **运行时种类的 P3-06 字段：** 不经 `0x68050`，取分配器缺省；`maximumSpeed` 对导弹为弹体记录的 +0xB8（`0x3060c` 的非机体分支），对其他三种为 0；`lastParkedUpdateClock`、`warpClock` 为 0。它们不停放：区域检查使种类位 `0x1f00000` 离区时直接待移除。
- **生命周期（Core 的通用部分）：** Core 没有渲染器的完成回调，把表现视为在获得时就绪（项目选择）：以活动状态实例化的实体为 `presentation-ready`，停放的为 `new`。实体在自己的下一次更新中请求进入 `active`，由同一 tick 的请求处理写入；处于 Warp 过境中的实体（状态 0–3，玩家种类除外）不提出这一请求，见[飞行控制、运动与停放](#飞行控制运动与停放)。`area-switch` 与 `pending-removal` 的实体在自己的下一次更新中请求离开。离开请求对 `area-switch` 且会停放的种类切换停放并重新开始状态：停放时释放移动块，并只在玩家目标恰为该实体时清除它；恢复时以当前位置与姿态新建满油门的初始移动块；计时字段都不变。其他情形（含种类位 `0x1f00000`）移除实体：从种类表摘除；若是玩家实体，玩家状态的实体 ID、目标、控制状态与 `targeting` 一起清为 null；生成计数不减少，名称因不再有实体持有而释放。`destroyed-source` 不更新（但仍移动）。被毁（`destroyed`）不等于移除，救援复用玩家实体。被毁标志、`destroyed-source` 与 `projectile-hit`（跳弹后的弹丸）由 P3-07 的规则写入，`area-switch` 与 `pending-removal` 由区域检查、停放更新与各规则写入；P3-07 的运行时种类有自己的回调，取代通用转换（见[战斗规则](#战斗规则p3-07)）。`awaiting-presentation` 只为对应原版的状态空间而保留，按当前契约不可达；要使用它须先修订 spec。
- **玩家状态**（[player-state.ts](../../../src/core/world/player-state.ts)）：`PlayerState` 为 `{ entityId, viewMode, previousViewMode, subMode, target, control }` 加 P3-07 的八个字段（CR-04，见下）与 P3-10 的 `dockingObject`、`communications`、`docking`（见下一条），`createPlayerState()` 的前六项为 `{ null, 0xC, 0xC, 0, null, null }`（`COCKPIT_VIEW_MODE` = 0xC）。实例化玩家时写入实体 ID，把视角模式与上一视角模式设为 0xC，目标设为 null，控制状态设为 `initialPlayerControl(group)`，`targeting` 设为 `initialPlayerTargeting()` 并置 `statusDisplay.redraw`；其他写入者归各规则任务。`interactionContext(viewMode)` 按原版的上下文选择给出 `warp`（0–3）、`base`（6）、`map`（8）或 `flight`。
  - `target`（玩家对象 +0x8C）：实例化时为 null（代码证据，`0x68050` 写的是 AI 目标）。P3-07 的 `select-target` 请求写入它（目标命令与自动选敌），帧尾的右显示屏清除把它清为 null；P3-06 把它清为 null：玩家可用时玩家更新开头发现它不能解析、该实体停放、玩家实体移除。P3-10 的 `dock` 进入基地视角时把它清为 null（不发 `target-changed`，CB-10）。Warp 开始与进入被毁视角的清除分别归 P3-09、P3-11。生产代码没有其他写入口。
  - `control`（`PlayerControl`）在有玩家实体时恰好非空，随玩家实体移除清空，救援保留：`lastAxes`（每轴上次读到的整数偏转，原版 `0x1b2470` 的对应物）与 `speedAssist`（`SpeedAssist { enabled, dueClock, engaged }`，控制块 +0x1B4–+0x1BC）。`initialPlayerControl(group)` 为三轴 0、辅助在战役组 0 开启、到期时刻 0、未匹配。不保存油门、宿主按键、DOS 轮询缓存或 HUD 闪烁计数器。
  - P3-07 的字段（CR-04）：`targeting`（`{ mode: 'enemy' | 'friendly', autoTargetDueClock }`，控制器 +0x198、+0x1A8；生命周期与 `control` 相同：有玩家实体时非空，实例化时为 `enemy` 与 0，随玩家实体移除清空，救援保留；`t`/`f`/`u` 与自动选敌写模式，自动选敌写到期时刻）；`followedEntity`（ps +0x90：玩家的逃生舱，构造时写入、舱到期时清除，伤害门禁读取）；`delayedExplosionClock`（`0x174ae4`：玩家被毁时为时钟 + 0xC0，延迟爆炸阶段消费后为 null）；`kills`（种类位 7、8、9、10、11、12、16、19 的击杀计数，`KILL_KIND_BITS`，只计玩家击杀的非玩家、非僚机）；`shots`（`{ projectilesFired, projectileHits, missilesFired, missileHits }`）；`heavyDamage`（`0x176710`：−1、0 或 1，`0x2a830` 的阈值写入）；`leftDisplay.page`（`0x1a9dc8`，0–6，P3-07 只写 0、1 之间的切换）与 `statusDisplay`（`{ blink, blinkDueClock, redraw }`，状态显示的闪烁相位与计时，以及玩家对象的 +0xF0 重绘标志：玩家的子系统受损与视角切换置位，帧尾的状态显示步清除）。击杀、射击统计与重伤记录救援不清，读者归 P3-11 与 P4。不保存摇杆选目标键的到期（+0x1B0，命令联合中没有对应动作）与导弹相机 `0x174c0c`（归表现层）。
- **通讯、停靠与基地服务的状态（P3-10，CB-02 至 CB-05、CB-11）：** 都由 Core 拥有、进入快照；字段的原版地址与生命周期以 CB-02 至 CB-05 的表为准。
  - `WorldState.flow`（`MissionFlow`，CB-02）：`mainState`（恒为 3：本构建中世界只存在于任务进行中）、`subState`（`MissionSubState`：0 正常、3 停靠请求待回复、4 回复后的倒计时、5 停靠已投递或基地交互中）与 `dockingDeadline`（子状态 3 的期限与 4 的到期共用，初值 0）。两者是封闭联合，P3-11 在同一字段上加入主流程状态与子状态 1、2、6，不另建流程状态。谓词 `0x3336c`（无线电取出的门禁：主流程 3 且子状态 ≠ 2，`takesRadio`）与 `0x33390`（近处菜单：主流程 3 且子状态 0）照原条件实现。
  - `PlayerState.dockingObject`（玩家对象 +0x194）：只由命令码 9 的选择（写通讯对象）、停靠失效取消、门禁失败与离港（写 null）写入，玩家实体移除时清为 null；P3-11 的 `0x32d74` 也写 null。有效性（DK1）为可解析且状态 ≥ 7；子状态 3–5 中为 null 是 Core 故障（`docking.object`，CB-17 决定 3）。
  - `PlayerState.communications`（CB-03）：`menu`（唯一的已建菜单 `CommunicationsMenu`，层级 2 类别、3 对象列表、4 命令表，项为 `MenuItem { key, value }`，退出项在最后；对象项在建立时取得种类、名称与 `tone`，只供绘制）、`partner`（通讯对象）、`menuSavedPage`（`c` 打开菜单时的页）、`incomingSavedPage`（来电保存的页，与菜单及 P3-09 的 Warp 保存页三者分开，RQ8）、`limits.friendlyHit`/`friendlyKill`（玩家友伤与击毁友方的限频时戳，null 为未盖）与 `thanks`（感谢计数）。菜单在清空、基地、地图与 Warp 之后仍保存（休眠），是否可见只由页决定；关闭与投递只清 `menu`，`partner` 只由下一次 `c` 清；玩家实体移除时 `menu`、`partner`、`menuSavedPage` 清为 null、null、0，其余保留。
  - `PlayerState.docking.savedPose`（`Pose { position, orientation }`）：停靠时写入所停靠基地的位姿（逐位复制），离港时改写为新的玩家位姿；首次停靠之前为 null。
  - `Entity.communications`（CB-04）：`face`（+0x180，只对种类 `0x87c` 与 `0x68000` 在第一次说话时由 `0x3c91c` 从各自的池中抽取写入一次；僚机的头像是 `aiValueA` − 1，不存于此）与 `threatStamp`（+0x17C，威胁时戳，null 为未盖）。分配时都为 null；运行时种类没有写入者。
  - `WorldState.communications`（CB-05）：`queue`（`RadioItem { message, due, callback, speaker }` 的有序列表，至多 `CORE_LIMITS.radioQueueItems` 项）、`channel`（`IncomingChannel`：`idle`、`loading { item, readyTick }` 或 `playing { item, startClock, frameDurations }`）、`facePools`（机体 3 项、基地 5 项的占用标志，同一世界内不清）、`limits`（`wingmanLowHull`、`enemyAppears`、`tailWarning`、`wingmanArrivalRepair` 四个限频时钟，初值 0，到期为取样 > 值）与 `tailCheck`（尾随检查的到期与两个指示灯）。`RadioCallback` 为 `none`、`docking-reply` 与两个只供 P3-14 的音乐标记 `music-step`、`music-reset`（规则不读）。
  - `WorldState.ai.friendlyFire`（CB-05，与 P3-08 草案 CR-19 同名同形）：`{ accumulated, windowEnd }`，唯一写入点是 `0x3c208` 第 1 步，P3-08 读取并在 `WorldState.ai` 中加入其他字段。
  - `WorldState.baseService`（`BaseService`，CB-11）：入港时由 `0x39664` 建立、离港时为 null：`rows`（记录 0–10 的一个排列，既是服务队列也是显示次序，BS5）、`cursor`（行号）、`dues`（修理、船体、能量三个到期时钟）、`rates`（入港时的 trunc(c9C ÷ 60) 与 trunc(c54 ÷ 240)）与三个完成标志 `flags`。周期 0x200、0x40、4 是常量，不另存。
- **生成状态**（[spawn-state.ts](../../../src/core/world/spawn-state.ts)）：`SpawnState` 是世界私有的实例化状态，setup 保持只读：
  - `frame`（`RuntimeFrame`）；
  - `records`：每个任务声明一条 `RuntimeRecord`，含声明引用、运行时位置与矩形、+0x48 锚点、网格间距、缺省后的 `RecordRuleInputs`、可被模板覆盖的 +0x58/+0x5C 与 +0x18 计数；
  - `wingman`：所选僚机的记录或 null；
  - `groups`：每个编组一条 `GroupState`，含布局、+20 计数与 +24 的 `leader`；
  - `queue`：按触发次序的 `SpawnEntry { due, source, index, requests }`，`source` 为 `record`、`group` 或 `wingman`；
  - `enabled`：生成开关；
  - `namePoolUses`：名称池的使用计数。

  计数只增不减，计的是生成次数而不是存活数。

### 系统流水线

[systems/pipeline.ts](../../../src/core/systems/pipeline.ts) 的 `PIPELINE` 是唯一的有序阶段表，每次 step 按序运行每个阶段一次。阶段只在自己的位置运行；Core 不注册回调、没有订阅或持久消息总线，生产入口也不能注入处理器。尚无规则的阶段 `run` 为 null，不写假系统。阶段与原版地址按 [Q-09](../../original/formats/executable.md#frame-pipeline-p3-0201)：

| # | 阶段 `id` | 原版 | 实现 | 负责接入的任务 |
|---|---|---|---|---|
| 1 | `input-registration` | 项目边界 | 写入本 tick 编号（输入已由 `World.step` 校验，预检由 `registerTick` 完成） | P3-02 |
| 2 | `mission-flow` | `0x3266c`，读取上一 tick 的时钟 | `checkDockingWait`（[docking.ts](../../../src/core/systems/docking.ts)）：任务进行中、有玩家实体时检查子状态 3–5 的停靠对象（失效取消、期限、投递 `dock`、自动离港，CB-02，P3-10） | P3-10（停靠子状态）；P3-11 在同一跳转中加入流程、结果与救援 |
| 3 | `clock` | `0x25894` | 写入新时钟 | P3-02 |
| 4 | `object-update` | `0x20938`：实时种类遍历，玩家最先 | 先是玩家更新 `updatePlayer`（P3-06：失效目标清除、P3-07 的导弹锁定、速度辅助、命令判定与轴的变化检测；P3-06 自己判定的命令之外经 `judgeCommand` 交给各规则，尚无规则的得到 `not-implemented`），再释放延后的玩家发射请求并做 P3-07 的自动选敌；然后对每个实体（`destroyed-source` 除外）做自身更新：机体为通用生命周期转换（Warp 过境中的实体不推进）后接 P3-10 对投递命令的回应 `answerCommand`（`0x3bed0`，种类 `0x6807c`、状态 7），P3-07 的四种运行时种类为各自的回调；P3-10 的命令判定在玩家更新的命令循环中（CB-07） | P3-06、P3-07、P3-08、P3-09、P3-10（动作效果与各自对象的更新） |
| 5 | `communications-reply` | `0x2cd60` | `takeRadio`（[radio.ts](../../../src/core/systems/radio.ts)）：每 tick 至多取出到期的队首，通道转为 `loading`（CB-06，P3-10） | P3-10 |
| 6 | `spawn-queue-check` | `0x67018` | 为每个到期项投递生成请求，不实例化 | P3-02 |
| 7 | `request-handling` | `0x20d10` 的消息循环 | 按投递次序处理请求（实例化、状态写入、停放切换或移除、`control` 与 `match-speed`；P3-07 的 `select-target`、发射、`steer`、到期、释放与交接，爆炸的状态写入为其激活与更新），同一遍处理处理中新投递的请求；P3-10 的 `deliver-command`、`dock`、`depart`、`base-navigate` 与 `base-confirm`，以及实例化中的 `0x38cd4` | P3-02、P3-06、P3-07、P3-10；新请求类型归各规则 |
| 8 | `movement` | `0x221fc` | `moveEntities`：按移动块模式积分或移动（P3-06 的 `craft`、`warp`，导弹以弹体记录积分；P3-07 的 `linear`、`spinning`），带命中检测标志的弹丸在自身移动后立即做命中检测 | P3-06、P3-07 |
| 9 | `collision` | `0x29670`、`0x29934` | `collisionStage`：玩家对其他对象、其他对象之间两遍（P3-07） | P3-07 |
| 10 | `delayed-player-explosion` | `0x23808` | `delayedPlayerExplosionStage`：时钟严格大于延迟时刻且玩家实体存在时构造玩家的爆炸（P3-07） | P3-07 |
| 11 | `energy` | `0x30590` | `energyStage`：先玩家、后种类 `0xffffe` 按遍历次序的能量更新（P3-07） | P3-07 |
| 12 | `object-sets` | `0x2ede0`：重建友方与敌方机体集合并刷新地图可见标志 | 空（P3-06、P3-07 的规则都不读取） | 建议归 P3-08（停放对象的 AI 处理读取它）；地图读取者为 P3-09、P3-13 |
| 13 | `parked-update` | `0x2f1b0`，含离开世界 | `updateParked`：节奏、过境、停放行进与离开世界（P3-06），行进中 P3-10 的僚机到达基地的完全修理与敌方停放对象的报告 `0x3c3b0`，每个本次更新的对象在行进之后做 P3-07 的停放交战 | P3-06、P3-07、P3-10；P3-08 加入停放 AI |
| 14 | `warp-completion` | `0x2bf08` | 空 | P3-09 |
| 15 | `base-interior` | `0x398ec`，视角模式 6 | `serviceBase`（[base-interior.ts](../../../src/core/systems/base-interior.ts)）：有玩家实体且视角为 6 时依次做修理、船体与能量步（CB-11，P3-10） | P3-10 |
| 16 | `mission-teardown` | `0x334bc`，主流程状态 0 | 空 | P3-11 |
| 17 | `area-check` | `0x3a468` | `checkActiveArea`：只写对象状态（P3-06） | P3-06；P3-09 加入玩家 Warp 期间的中心 |
| 18 | `frame-end` | 原版在帧渲染中的规则推进，如 `0x50508`、`0x4e308` | `frameEndStage`：驾驶舱显示步（只在视角模式 0xC、0xD、1、6：P3-07 的右显示屏目标清除，再左显示屏：状态显示与 P3-10 的页 2–5 处理器，然后 P3-10 的尾随警告 `checkTail`），然后在任何视角中 P3-10 的通讯呈现子步 `presentIncoming`（CB-09）；规则移入 Core，不等待实际渲染帧 | P3-07、P3-09、P3-10；P3-12、P3-13 只消费结果 |
| 19 | `commit` | 项目边界 | 冻结本 tick 事件；请求处理之后投递的请求不处理即丢弃 | P3-02 |

原版派发器开头清空表现项（`0x52c3c`）与结尾放置相机（`0x21584`）不是 Core 阶段：渲染器与音效由 Render State 和事件推出（P3-12 至 P3-14）。`collision`、`delayed-player-explosion`、`energy` 与 `frame-end` 的 `run` 由各自的规则模块导出，阶段表在 tick 运行时读取（`ruleStage`），以免从规则模块进入的导入环在初始化之前读取它们。

- **`TickContext`、`registerTick`、`runTick`：** `registerTick(world, input)` 在第一次改动前完成可拒绝的检查并返回本 tick 的上下文 `{ world, time, input, events, requests }`；`runTick(context)` 依次运行各阶段并返回冻结的事件。两者与 `PIPELINE` 都是内部接口。
- **`emit(context, event)`：** 存入深度冻结的脱离副本；一个 tick 超过 `eventsPerTick` 个事件为 `budget-exhausted`。后续阶段可以读取本 tick 已发出的事件；事件列表与请求列表都不跨 tick 保留。
- **`Request` 与 `RequestQueue`：** 请求是原版派发器消息的对应物，是封闭的内部纯数据，不是 `DomainEvent`。现有类型：`set-state`（消息 0x200）；`leave`（消息 0x20，停放切换或移除，见[生命周期](#实体与世界状态world)）；`spawn`（消息 0x4000）；`control`（消息 0x20000，`ControlRequest { entityId, throttle, axes }`，整数操纵路径）；`match-speed`（消息 0x80000，`MatchSpeedRequest { entityId, targetEntityId, commandIndex }`，玩家的手动匹配）；P3-07 的（CR-05）`select-target`（消息 2：玩家的新目标与其种类、`origin` 与命令序号，应用时不再校验）、`launch`（消息 8：`gun` 族带炮记录、挂点、载入后的偏移与瞄准姿态或 null，`missile` 族带导弹记录、挂点、偏移、发射字节与发射时的目标；两族都带 `ShotTrigger`，弥补消息 8 不带的身份）、`steer`（消息 0x40000：`ControlBlock { scale, axes, speedFactor }`，在请求处理中经 P3-06 的 `0x21fd8` 应用；目前只有导弹投递，其他主体为故障）、`expire`（消息 0x10000：弹丸、导弹或碎片的到期）、`release-held`（消息 0x40：爆炸持有的来源进入待移除）与 `hand-off`（消息 0x2000000：第 0 部件碎片交接其来源）；P3-10 的（CB-08）`deliver-command`（消息 0x100：`{ receiver, code, sender, commandIndex }`，code 为 ≥ 1 的 u32）、`dock`（消息 0x400000 子命令 0）、`depart`（子命令 4：`origin` 为 `command` 带命令序号，或 `automatic` 带 null）、`base-navigate`（子命令 1、2：`direction`）与 `base-confirm`（子命令 3）；子命令 0–4 在玩家实体不存在时无作用。处理次序为任务流程、对象更新（按遍历次序）、生成队列检查，然后是处理中新投递的请求；主体已被移除的请求被丢弃，发射者已不能解析的 `launch` 不创建任何东西。投递数受 `requestsPerTick` 约束（CR-14，见[上限](#上限)），超出为 `budget-exhausted`/`pipeline.requests`。`defer(request)` 把请求留到 `release()` 再按延后的次序追加（立即计数），只用于玩家开火命令的发射：它们在玩家更新返回后释放，排在 P3-06 的 `control`/`match-speed` 之后（CR-07）；P3-10 在命令判定中投递的请求立即入队，所以排在同一玩家更新的这两者之前（CB-08）；请求处理开始时仍有未释放的为 `pipeline.requests-deferred` 故障。`findLastPending(match)` 给出处理尚未取走的最后一个匹配的请求，供参照目标查询。
- **命令判定：** 在玩家更新中按数组顺序进行，每个命令恰有一个带原 `commandIndex` 的结果。P3-06 自己判定的命令见[飞行控制、运动与停放](#飞行控制运动与停放)；其余命令（以及 P3-06 的命令中归其他上下文的那些）在其数组位置交给 [systems/commands.ts](../../../src/core/systems/commands.ts) 的 `judgeCommand`：P3-07 的六种命令类型分派到各自的规则模块（见[战斗规则](#战斗规则p3-07)的命令表），P3-10 的 `communications`、`select-number`、`navigate-selection`、`confirm-selection`（飞行与 Warp 之外）与 `launch` 先经基地键判定 `judgeBaseKey`、再经 [communications.ts](../../../src/core/systems/communications.ts) 的 `judgeCommunicationsCommand`（见[通讯、停靠与基地服务](#通讯停靠与基地服务p3-10)），其余（`toggle-map`、`map-point`、`request-warp`、`cockpit-front` 与地图上下文的 `confirm-selection`）得到 `rejected`/`not-implemented` 且不改状态。规则任务按命令类型与上下文在 `judgeCommand` 中替换这一判定。
- **批内的生效视角**（`EffectiveView { viewMode, previousViewMode }`，[flight-control.ts](../../../src/core/systems/flight-control.ts)，CB-07、CB-17 决定 8）：玩家更新在命令循环开始时取已提交的视角，被接受的 `launch` 把生效的上一视角设为生效视角、生效视角设为 max(原生效上一视角, 0xC)，后续命令按它判定上下文；视角本身由请求处理中的 `depart` 提交。P3-06 的命令与 P3-10 的全部命令按生效视角判定；P3-07 的命令（`combatCommandPlayer`）仍读已提交的视角，等 P3-09 的 MW-04 合并后统一。
- **请求处理中实例化的实体**在本 tick 不更新，也不参与之后的运动与碰撞；它的第一次更新在下一个 tick。P3-07 的爆炸与碎片还在请求处理之外直接创建，不经请求（CR-08）：移动阶段（弹丸致死）、碰撞阶段、延迟玩家爆炸阶段，以及 P3-08 在对象更新中的范围伤害。移动阶段的遍历因新实体的状态而不移动它们；对象更新中创建的在同一遍历中首次回调。

**生成阶段**（[systems/spawn.ts](../../../src/core/systems/spawn.ts)，Q-01、Q-07）：

- `checkSpawnQueue(world, requests)`（`spawn-queue-check`）：生成开关已置时，按队列次序取出每个到期项（`isDue(clock, due)`），会投递请求的项（`postsRequests`）投递 `requests` 个 `SpawnRequest { type: 'spawn', source, index, request }`。概率为 100 时必然投递，不抽取；未填写缺省的模板的来源值 0 永不投递。
- `dispatchSpawn(world, request, emit)`（请求处理）：段 1 记录与僚机放置并实例化一个对象，记录计数加 1；编组请求按布局周期放置锚点，逐个成员实例化，每个周期的后续成员在实例化之后写入编队（领队为该周期的首个成员），编组计数加 1。实例化按原版次序写入：种类、来源、名称、阵营、模型、交互标志、位置、放置姿态与规则输入副本（以分配器的状态分配：停放、无移动块、最高速度 0、空白的机体战斗状态），再依次写武器块与船体、`0x3060c`（资源与最高速度）、两位字段、AI 初态、`lastParkedUpdateClock`（本次时钟）、`warpClock`，然后判定活动：玩家总是活动；其他对象只在活动区域内（`activeAreaCentre` 与 `isWithinActiveArea`，与区域检查共用的 `0x3a540`）为活动，否则停放。活动实体获得满油门的初始移动块，玩家的姿态改为单位矩阵。玩家实例化后写玩家状态，最后发出 `object-instantiated`。随机抽取写回世界的 RNG 状态。
- **实体初始化扩展点**在 `instantiate` 中、分配与命名之后，是 Core 内部的静态调用位置，不是外部回调。按 Q-07、[P3-06 的实例化扩展](../../plan/p3/06/spec.md#实例化扩展)与 CR-07 的次序：武器块 `0x2d400` 与船体（P3-07，不抽取）→ `0x3060c`（P3-07：资源、档位、E 与 T，再以实时的 E、T 与两位字段 2 调用 P3-06 的最高速度纯函数 `playerMaximumSpeed`，然后写两个能量时钟，1 次抽取）→ 两位字段 0–18 清零（P3-07）→ AI 初态 `0x68050`（P3-06）→ `lastParkedUpdateClock`（P3-06）→ Warp 计时 +0xC8（P3-06，玩家与僚机以外 1 次抽取）→ `0x20990`（P3-08）→ 活动判定与初始移动块（P3-02、P3-06）→ `0x38cd4`（P3-10：活动的敌方类对象，`reportEnemyAppears`）→ 玩家状态（P3-02；P3-06 的目标与控制状态；P3-07 的 `targeting` 与 `statusDisplay.redraw`）。P3-07 的前三步是 [combat-init.ts](../../../src/core/rules/combat-init.ts) 的 `initialiseCraftCombat`。放置之后，实例化中的抽取次序为名称 → `0x3060c` → `0x68050` → Warp 计时 → `0x38cd4` 的条件抽取（僚机台词，RX9）。尚未接入的步骤（`0x20990`）在代码中以注释标出位置。
- 供其他规则在 Core 内使用的接口（P3-11）：`isSpawningEnabled`；`disableSpawning`（任务结束时清除开关，之后不再处理队列，不会再置）；`pendingSpawns`（待生成项的冻结副本，供全清判定）；`placeWorldRecord(world, record, rand)`（放置服务，供救援放置）。实例化通知就是本 tick 事件列表中的 `object-instantiated`。

### 飞行控制、运动与停放

P3-06 的系统在 [systems/](../../../src/core/systems/) 中，由各自的阶段调用，规则计算在[原版规则辅助](#原版规则辅助)的纯函数中。行为契约见 P3-06 spec 的[行为与边界](../../plan/p3/06/spec.md#行为与边界)，原版事实见 executable 的 [P3-06 一节](../../original/formats/executable.md#flight-motion-controls-speed-parking-and-take-off-p3-06)。

**玩家更新与操纵**（[systems/flight-control.ts](../../../src/core/systems/flight-control.ts)）：`updatePlayer(world, input, tick, output)` 在对象更新阶段开头运行（玩家在遍历中最先）。

- **可用的玩家**（`availablePlayer`）：玩家实体存在、未被毁且状态为 `active`（原版状态 7）。可用玩家缺少控制状态为 `flight-control.player-control` 故障。
- **次序**（D-08、CR-07）：玩家可用时，先清除不能解析的玩家目标，再经 `PlayerUpdateOutput.lockMissiles` 运行 P3-07 的导弹锁定（`0x2ddbc`），然后运行速度辅助；然后判定命令批次，最后做轴的变化检测。请求在末尾按产生次序投递，辅助的恢复请求在最前。`updatePlayer` 返回它所针对的可用玩家（否则为 null）；流水线随后释放玩家开火命令延后的发射请求，再对该玩家运行 P3-07 的自动选敌（`0x2799c`，见[战斗规则](#战斗规则p3-07)）。
- **命令判定**：P3-06 处理 `speed` 的六种操作、`speed-preset` 与飞行和 Warp 上下文中的 `confirm-selection`。依次判定：不归 P3-06 的命令（全部其他命令、任何上下文中的 `select-number`，以及基地与地图上下文中的 `confirm-selection`）经 `PlayerUpdateOutput.judge` 交给 `judgeCommand`（P3-07 的命令由其规则判定，`select-number` 与基地的 `confirm-selection` 由 P3-10 的通讯与基地规则判定：原版 `0x264a0` 在自己的比较树之前把每个键交给菜单处理 `0x27b44`，没有菜单接收的数字为 `ignored`/`wrong-context`，不改变速度（P3-05、CB-07），其余为 `rejected`/`not-implemented`）；玩家不可用为 `ignored`/`player-unavailable`；不在飞行上下文（Warp、基地、地图中的速度命令与 `speed-preset`，Warp 中的 `confirm-selection`）为 `ignored`/`wrong-context`，因为原版只有飞行上下文的按键处理 `0x264a0` 处理这些键；其余为 `accepted`。
  - `increase`/`decrease`：读回（`throttleReadback`，`0x21ca8`）加或减 `THROTTLE_STEP`，增加不超过满油门，减少不低于 0；`zero` 为 0，`maximum` 为 `FULL_THROTTLE`；`speed-preset` n 为原版 Shift+n 的档位（`presetThrottle`，n = 1 与 `zero` 相同）。每条这样的命令投递一个携带其油门的 `control` 请求，油门不保存为状态。
  - 每次读回都从移动块当前的指令速度出发（含本 tick 辅助的直接写入，以及同一批次中先判定的 P3-07 档位键经 `0x21d88` 的改写），按当前最高速度与请求应用相同的规则折算本 tick 已投递的油门与匹配请求（`pendingCommandedSpeed`：`control` 请求在锁定时不改变指令速度；匹配不受锁定影响），后一条命令从折算值读回（P3-07/16 的修正）。
  - `match-target` 与飞行中的 `confirm-selection`（原版 Enter）：玩家目标为空或没有移动块为 `ignored`/`no-target`，否则 `accepted` 并投递 `match-speed` 请求。
  - `toggle-auto-match`（原版 Ctrl+Enter）：翻转速度辅助开关，开启时到期时刻归 0、清除“已匹配”，关闭时两者不变；紧随其结果发出 `speed-assist-toggled`。
- **轴**：玩家可用时，每个成功 tick 消费本次轴快照。`axisDeflection` 把轴值换为原版数字摇杆的整数偏转（轴值 × 128 向零截断，±1 为满偏）；地图与基地上下文中的有效偏转为 0。只有与 `lastAxes` 不同的轴进入请求并更新上次读数；锁定使请求在应用时被丢弃，上次读数照常更新。轴的变化并入本 tick 由命令投递的最后一个请求（为 `control` 请求时），否则单独投递一个只带轴的 `control` 请求；不并入辅助的恢复请求或 `match-speed` 请求。
- **速度辅助**（`0x27f68`）：开关开启且玩家可用时运行，不论视角模式；自动驾驶恒为关（G-09），总走其关闭的分支。
  - 没有目标：若“已匹配”，清除它，发出 `speed-assist-released`，并投递满油门、三轴不变的 `control` 请求。
  - 有目标：目标属于辅助种类、时钟不早于到期时刻且在辅助距离内时，先记录速度差，再直接写玩家移动块（`applySpeedMatch`），置“已匹配”并从本次时钟重新计时（不追赶）；只在写入成功时发出 `speed-matched`（assist）。
  - 某 tick 的命令改变的开关或目标，辅助在下一 tick 才看到。
- **请求处理**：`applyControlRequest` 按整数路径 `0x21dd0` 应用 `control` 请求，抽取来自世界 RNG；`applyMatchRequest` 按 `0x21adc` 应用 `match-speed` 请求（目标已不能解析或任一方没有移动块时无作用，不查锁定），写入成功时发出 `speed-matched`（command）。

**运动阶段**（[systems/movement.ts](../../../src/core/systems/movement.ts)）：`moveEntities(world, hitTest)` 以 `motionStep(clockUnitsPerTick, clock)` 实时遍历全部种类（玩家最先）。

- `movesThisTick`：活动不是停放（活动与停靠都参与），且状态为 `destroyed-source` 或 7 及以上；本 tick 新生的实体不运动。
- 通过筛选而没有移动块为 `movement.block` 故障；运动记录缺失为 `movement.record` 故障：`motionRecord` 对导弹取其弹体记录（P3-07 的 `missileBodyRecord`，导弹记录 +0x14），对其他实体取种类的机型记录。
- 按块的 `mode` 穷尽分派：`craft` → `integrateCraft`，`warp` → `integrateWarp`；P3-07 的 `linear` → `moveLinear`（`0x22818`），块的 `hitTest` 为真时随即调用流水线注入的弹丸命中检测（`hitTestProjectile`，它只测状态恰为 7 的弹丸），`spinning` → `spinFragment`（`0x2285c`）。`MovementBlock` 增加变体而 `moveEntity` 没有相应分支时不能通过编译。结果直接替换实体的位置、姿态与移动块（原版没有副本或写回）。积分从不读取或钳制 `maximumSpeed`。

**活动区域与停放**（[systems/area.ts](../../../src/core/systems/area.ts)）：

- `checkActiveArea(world)`（`area-check`，`0x3a468`）：遍历种类 `0x1fffffe`（玩家以外），只看状态 7 及以上。区外且活动 → `area-switch`，种类位 `0x1f00000` 改为 `pending-removal`，不发事件；区内、停放且不在 Warp 中 → `area-switch`；其余不变。只写状态，不释放、不抽取。没有玩家实体时一律在区外：活动的实体都进入 `area-switch`（种类位 `0x1f00000` 进入 `pending-removal`），在下一 tick 由自身更新提出离开并在请求处理中停放或移除；停放与停靠的实体不变（与原版一致）。
- `switchParking(world, entity)`：消息 0x20 的停放切换，`leave` 先试它，规则见[生命周期](#实体与世界状态world)；返回 false 时由 `leave` 移除实体。
- `checkWarpTransit` 与 `isHeldInWarpTransit`（`0x2f298`）：`inWarp` 且 `warpClock` 非零时，过境持续机型 +0xA8 秒（有有效编队领队时取领队的机型）；未结束时返回 true，结束时清 `inWarp`。通用生命周期在状态 0–3 询问它（玩家种类除外），过境中不推进状态。
- `updateParked(world, emit)`（`parked-update`，`0x2f1b0`）：遍历种类 `0xfffff`，选停放、状态 7 及以上、未被毁的实体，每个每 tick 抽一次世界随机数判定是否到期。到期时先计算经过时间并写 `lastParkedUpdateClock`；过境中到此为止，否则做停放行进（`0x2f314`）：
  - 失效的编队领队清为 null，本次不动；主体为有效领队或实体自身，按主体的 AI 状态求目标点（零偏移先换成随机偏移并存入主体）；AI 模式 1、5，以及目标失效或在 Warp 中时不动；
  - 随后先判定到达（与目标点的距离）；未到达时，有有效领队的编队成员做编队跟随（领队在 Warp 中时同时进入 Warp 并取领队的 `warpClock`），其余实体做停放中的 Warp 跳跃或正常行进（P3-08 的 Warp 离场请求，即 `inWarp` 且 `warpClock` 为 0，也触发跳跃）；每次写位置都使放置序号加 1（原版提交位置时的扇区资源测试在 Core 中总是通过）；
  - 到达时不写位置：有目标时清本实体的偏移，模式 4 且无领队时由来源记录（编组成员取其模板）的放置路线取新目标点，清 `inWarp`；实体不是僚机且主体在内缩 100 的世界矩形之外（严格比较，忽略 z）时，直接写 `pending-removal` 并发出一次 `object-left-world`，实体在下一 tick 由自身更新提出移除。重新放置不是退场；
  - 每个本次更新且不在过境中的对象，在行进之后（即使行进刚使它离开世界）调用流水线注入的停放交战 `engage(entity, elapsed)`，即 P3-07 的 `engageParked`；调用前把 RNG 状态写回世界、调用后从世界继续，使交战的抽取紧随本对象自己的抽取、先于下一个对象的（E4）。代码注释标出基地报告（P3-10）与玩家 Warp 期间的区域中心（P3-09）的位置；停放对象的 AI 归 P3-08。
- 活动对象（含玩家）没有世界边界处理：Core 不夹取、不移动、不移除越出世界矩形的活动对象（M-07，与原版一致），只适用数值故障规则。

### 战斗规则（P3-07）

P3-07 的系统在 [systems/](../../../src/core/systems/) 中，以静态调用接入玩家更新、各实体的自身更新、请求处理与各自的阶段（CR-07），规则计算在[原版规则辅助](#原版规则辅助)的纯函数中。行为契约见 P3-07 spec 的[行为与边界](../../plan/p3/07/spec.md#行为与边界)与 CR-01 至 CR-14，原版事实见 executable 的 [Combat rules](../../original/formats/executable.md#combat-rules-p3-07)（下文的 T、W、H、D、E、X 小节标签指那里）。

**玩家更新中的接入点**（CR-07）：失效目标清除（P3-06）→ 导弹锁定 `updateMissileLock`（[weapons.ts](../../../src/core/systems/weapons.ts)，W8，读玩家的实际目标）→ 速度辅助（P3-06）→ 命令批次（按数组次序）→ 轴的变化检测（P3-06）→ 释放玩家开火命令延后的发射请求 → 自动选敌 `selectAutomaticTarget`（[targeting.ts](../../../src/core/systems/targeting.ts)，T3）。请求的次序：命令判定中投递的 `select-target` 立即入队；P3-06 的 `control`/`match-speed` 在命令循环之后投递；玩家的发射请求随后释放，对应原版扳机在消息 0x20000 之后；自动选敌最后；AI 与自动挂点的发射立即投递。发射构造只读发射者的当前速度与位姿，`control` 只改指令速度，所以这一次序只影响一个 tick 内的请求与事件次序，不影响状态（P3-07/14 定稿）。

**命令与原因码**（[commands.ts](../../../src/core/systems/commands.ts)，CR-05）：P3-07 的命令先经共同前置判定 `combatCommandPlayer`：玩家实体不存在、已被毁或不在活动状态（7）为 `player-unavailable`；交互上下文不是 `flight` 为 `wrong-context`（原版只有飞行键上下文 `0x264a0` 处理这些键）。未被接受的一律为 `ignored`（原版对这些键静默无作用），不改变任何状态。

| 命令 | 模块 | 被接受时 | 不被接受的原因（前置判定之后） |
|---|---|---|---|
| `target` 的 `enemy`、`friendly` | targeting.ts | 该模式掩码（敌方 `0x93780`，友方 `0x206c87e`）中最近的候选；立即写模式，投递 `select-target` | 没有候选为 `no-candidate`；结果等于参照目标为 `no-change`（两者都不写模式） |
| `target` 的 `next`、`previous` | targeting.ts | 当前模式中比参照目标更近（`next`，原版 `r`，没有时回绕到最远）或更远（`previous`，原版 `y`，没有时回绕到最近）的一项；参照目标不能解析时 `next` 取最远、`previous` 取最近；不写模式 | 同上 |
| `target` 的 `forward` | targeting.ts | 前方候选（`0x63a4c`，全部 20 种机型，原版 `u`），按所选对象的种类写模式 | 同上 |
| `fire` 的 `primary`（列表 0）、`secondary`（列表 1） | weapons.ts | 按 W5 的组与交替规则尝试，至少一个挂点投递了发射请求 | 当前挂点为空为 `no-weapon`；否则取最后一次尝试的原因。炮依次为 `insufficient-charge`（只对玩家）、`weapon-disabled`、`cooldown`（相等时可射）、`misfire`（冷却照常重置）、瞄准炮无解而又不能退回不瞄准时的 `no-target` 或 `out-of-arc`；导弹依次为 `no-ammunition`、`weapon-disabled`、`no-target`（制导导弹）、`cooldown` |
| `cycle-main-weapon`；`select-missile` 的 `next`、`previous` | weapons.ts | 列表 0 的下一项；列表 1 的下一项或上一项（即使挂点不变；列表 1 的选择清除锁定）；紧随结果发出 `weapon-selected` | 机型没有挂点为 `no-weapon` |
| `energy` 的 `open`；`damage-report` | energy.ts | 页 0 → 页 1；页 1 → 页 0。判定时立即写页面，紧随结果发出 `left-page-changed` | 已在所求的页为 `no-change`；页 2–6 为 `wrong-context` |
| `energy` 的 `shield-increase`、`shield-decrease`、`gun-increase`、`gun-decrease` | energy.ts | 按 D10 改变档位与 E（含原版的失败分支：另一档位降到 0 仍不够时恢复本档位），以实时的 E、T 与字段 2 重算最高速度并调用 `0x21d88`；紧随结果发出 `energy-allocation-changed` | 不在页 1 为 `wrong-context`；新档位越出 0–3 为 `no-change` |

开火的扣费、冷却与弹药都在判定中写入（W6、W8），之后的命令读到写入后的值；制导导弹发射后清除锁定。**参照目标**（`referenceTarget`）是本 tick 中由先前的目标命令投递而尚未应用的最后一个 `select-target` 的目标，没有时为玩家当前的目标；同一 tick 的多条目标命令因此与原版相继几帧的按键一致。瞄准炮的瞄准、制导导弹的目标要求与导弹请求保存的目标都取开火命令处的参照目标，已产生的请求不被后续命令改写（冲突 35）；AI 的开火取其 `ai.objectTarget`。

**目标与雷达**（[systems/targeting.ts](../../../src/core/systems/targeting.ts)、[rules/targeting.ts](../../../src/core/rules/targeting.ts)、[rules/radar.ts](../../../src/core/rules/radar.ts)，T1–T7、T10）：

- 候选按种类位、再按分配次序遍历，须为活动（不停放、不停靠）、状态 ≥ 7（含跳弹后的状态 8）且不在 Warp 中。筛选不看被毁标志，但被毁的机体随即进入 `destroyed-source` 或待移除而不再是候选；已选中的被毁目标在移除之前仍可解析，projection 照常给出。距离与比较按 T10 的 f32 规则；判定只读上一次移动留下的位置与姿态，不读相机。
- `applySelectTarget`（请求处理）：不再校验，写目标并发出 `target-changed`（`mode` 为应用时的模式）；同 tick 的多个选择按投递次序应用，末者生效。
- 自动选敌（玩家更新末尾）：时钟严格大于 `autoTargetDueClock` 时，到期改为时钟 + 0x40；视角模式不是 0、1、6，也不是被毁视角 0x11/子模式 8（地图中照常运行），且玩家的实际目标为空（同 tick 尚未应用的命令选择不算）时，投递最近的敌方（`origin: 'automatic'`）并写 `enemy` 模式。
- 右显示屏的清除（`clearRightDisplayTarget`，帧尾的显示步调用）：玩家实体存在且有目标时，目标不能解析为 `invalid`、视角模式为 6 为 `base-view`、目标在 Warp 中为 `warp`（依此优先），清除目标并发出 `target-cleared`。原版对其他清除不给反馈。
- 雷达（`readRadar`，只供 projection）：种类 `0x21fffff` 中不停放、状态为 4 或 ≥ 7、有移动块、不是玩家的对象，按遍历次序，没有距离或可见性测试；每个接触点计 1，是玩家目标且计数 < 120 时目标框再计 1，计数到 120 停止（CR-11 的差异 7）；子系统 12 为 2 时没有真实接触点。读取不改状态、不抽取随机数。

**发射与弹丸**（[systems/launch.ts](../../../src/core/systems/launch.ts)、[systems/projectiles.ts](../../../src/core/systems/projectiles.ts)，W11、H1–H4、H7、H8）：

- 发射请求在请求处理中由 `applyLaunchRequest`（`0x25b0c`、`0x2b00c`）以发射者此刻的位姿与速度构造。新实体以活动分配，在下一 tick 的首次回调即请求状态 7，本 tick 不运动、不做命中检测、不参与碰撞（CR-08）。弹丸为带命中检测的 `linear` 块，速度为炮 +0x08，不加发射者的速度，炮 +0x28 ≠ 0 时取请求的瞄准姿态。导弹的最高速度为弹体 +0xB8（`0x3060c` 的非机体分支），以油门 0（制导）或满油门（无制导）调用 P3-06 的 `craftMovementBlock`，制导导弹再经 `0x21a3c` 把速度与指令速度设为 min(导弹最高速度, 发射者速度)，导弹记录 +0x20 ≠ 0 时散布发射姿态（3 次抽取）；`target` 取请求保存且此刻仍可解析的目标，`program` 按 CR-02 由发射字节与导弹 +0x18 确定。玩家发射的递增射击统计。构造后发出 `shot-fired`。
- 弹丸回调（`0x259b0`）：首次回调写计时块（时钟 + 炮 +0x24）并请求状态 7；状态 7 计时到期（到期时刻 ≤ 时钟）时投递 `expire`，使弹丸待移除并释放发射者；跳弹后的首次状态 8 回调把到期改为时钟 + 0x80，之后到期同样投递 `expire`；待移除时请求离开。
- 命中检测（`hitTestProjectile`，移动阶段在每个弹丸自身移动之后调用，只测状态恰为 7 的弹丸，`0x28450`）：线段从本次移动前的位置到移动后的位置。先遍历种类 `0xfffff` 的机体（活动、状态 ≥ 7、不是发射者；不看阵营与被毁标志），没有命中时再遍历碎片（另需有 DEBRIS 参数且耐久 > 0）；首个命中即止，不取最近。机体经 `applyShotHit`（伤害为炮 +0x1C）结算：护盾全吸收且受击者不是玩家（或视角模式为 0x11）时跳弹（状态 8，5 次抽取），否则移除；受击者已被毁时什么都不做，弹丸继续飞行。碎片按其 DEBRIS +0x5C 类别跳弹或移除，再扣耐久，耐久 ≤ 0 时被击落，在下一 tick 转为爆炸；碎片受击不发事件。碰撞体只来自静态规则数据的形状，不用模型包围盒、渲染网格或包围球代替。

**导弹**（[systems/missiles.ts](../../../src/core/systems/missiles.ts)、[rules/guidance.ts](../../../src/core/rules/guidance.ts)、[rules/steering.ts](../../../src/core/rules/steering.ts)，H5）：

- 回调（`0x2aa40` 无制导，`0x2ab00` 追踪）：首次回调建一次制导块（相对时间），置 `contact` 为 null（CR-11 的差异 6）；追踪导弹以 `ruleData.homingPrograms[programRecord(program)]` 安装程序（模式 0），控制块按返回次序投递为 `steer`；然后请求状态 7。状态 7：追踪导弹在更新到期（`isHomingUpdateDue`）时以模式 1 运行程序并投递 `steer`，然后 `advanceGuidance`：阶段 0 把相对时间换成时钟，无制导导弹在此直接经 P3-06 的 `0x21fd8` 得到满油门；引信读上一 tick 移动留下的位置；到期时投递 `expire`。状态 6：追踪导弹以模式 2 运行处理程序（投递转向块，不抽取），再请求离开。
- `steer`（请求处理）：控制块的行 1、2、3 对应 pitch、yaw、roll，经 P3-06 的 `applyFloatControl`（弹体记录的速率、实体的 `maximumSpeed`、世界 RNG）应用。
- `expire`（`0x2b408`）：先发出 `missile-ended`。起爆时构造爆炸（导弹成为被持有的被毁源），再按遍历次序逐个判定受击者：先施加震动 `0x2b628`（种类不在 `0xf9c7c` 时 6 次抽取，写冲量与定时旋转），再经 `applyShotHit` 结算（没有撞击点）。熄火时导弹待移除，释放发射者并清除目标。
- 无制导导弹的引信检查间隔取决于线性地址 0x2C 处的 f32（冲突 29），生产取减半（`UNGUIDED_CHECK_INTERVAL = 'halved'`，已确认，运行时，仅限所测配置）；`updateMissile` 的可选参数供测试两种取值。
- 导弹保持机体移动块，经 P3-06 的 `integrateCraft` 以弹体记录运动。引信在对象更新，起爆与 `steer` 的应用在请求处理，都在移动之前（H5）。

**伤害与子系统**（[systems/damage.ts](../../../src/core/systems/damage.ts)、[rules/damage.ts](../../../src/core/rules/damage.ts)、[rules/subsystems.ts](../../../src/core/rules/subsystems.ts)，D2–D12、H4）。三个入口都不缩放所给的伤害（TABL 4003 倍率、种类倍率与碰撞的 ÷ (3 − 组) 由调用者先施加；没有难度因子）：

- `applyShotHit(context, source, victim, damage, impact)`（`0x2a40c`，弹丸与导弹）：受击者已移除或已被毁时返回 null 且什么都不做；攻击者为仍有效的发射者（已被毁但仍在表中的照常归因），否则为 `lost-shooter`；玩家发射的递增命中统计；写发射者的 `lastVictim`、受击者的 `lastAttacker` 与 `hitFeedbackClock`；返回是否全吸收与弹丸的结局。
- `applyContactDamage(context, victim, damage, cause)`（`0x2a5fc`，碰撞与 P3-08 的范围伤害）：攻击者为 `none`，写 `hitFeedbackClock`。
- `applyEngagementDamage(context, shooter, victim, damage)`（停放交战）：攻击者为射击者，原因 `parked`，不写受击时钟与两条记录。
- 共同的 `0x2a694`：门禁（受击者已被毁；玩家在 `followedEntity` 非空即被毁视角跟随逃生舱时，只保护玩家：`hit` 的 `gated` 为真，状态与随机数都不变）→ 护盾 `0x30c60`（子系统 4 为 1 时 1 次抽取）→ 船体与 `0x2a830` 的子系统：强制抽取只在没有攻击者（碰撞与范围伤害）或来源为导弹时进行；字段 5、8 改为损坏列表 1、0 的挂点，10、13 不超过状态 1，7 另施加扰动 `0x21bd4`；玩家的子系统受损置 `statusDisplay.redraw` 并写 `heavyDamage`（`0x69e5c`）→ `hit` → 船体 ≤ 0 且护盾未全吸收时被毁一次：置被毁标志，发出 `object-destroyed`（对象事件的位置），计玩家的击杀（D8 的八个种类，停放者也计），然后停放者直接待移除，其他交给 `destroyEntity`。

**被毁、爆炸与碎片**（[systems/destruction.ts](../../../src/core/systems/destruction.ts)、[rules/explosions.ts](../../../src/core/rules/explosions.ts)、[rules/fragments.ts](../../../src/core/rules/fragments.ts)，X1–X11）：

- `constructExplosion(context, source)`（`0x23ac8`）在毁伤所在的阶段直接调用（CR-08）：来源已移除或没有移动块时什么都不做。玩家只布设延迟（`delayedExplosionClock` = 时钟 + 0xC0，未到期时再次被毁不重设），由 `delayed-player-explosion` 阶段在时钟严格大于它且玩家实体存在时再次调用，此时构造。其余来源：分配爆炸（变体：来源种类位 20 为 `missile`，掩码 `0xf9c7c` 为 `large`，其他为 `other`；`linear` 块不做命中检测，速度为来源当时的速度），来源进入 `destroyed-source`，机体按第 1 列表的部件产生判别值 3 的碎片（种类位 0、1 的部件 1、2 不产生；玩家的第 0 部件是逃生舱，写 `followedEntity`），来源不是机体或没有部件时由爆炸持有。
- 爆炸：首次回调请求状态 7，请求处理中激活（`activationClock` = t₀、`removalAfterClock` = t₀ + 0x60，发出 `explosion-started`）；之后每次状态写入按帧序号（14 × Δ 的低 32 位逻辑右移 6）与帧数（`missile` 为 n₃，其他为 n₁₂）更新：动画结束时持有的来源进入待移除，时钟严格大于移除时刻且动画已结束时爆炸进入待移除；待移除时对仍有效的持有来源投递 `release-held`，再请求离开。n₁₂ = 12 时持有的来源在激活后第 28 tick 进入待移除、第 29 tick 离开，爆炸在第 49 tick 请求移除、第 50 tick 离开（CR-08）。
- 碎片：首次回调设到期（玩家舱 0x140、僚机舱 0x780、带标志的 0x80 + rand % 0xC0、大型来源 never、其他 0x3C0 + rand % 0x200）并请求活动；状态 7 中第 0 部件先交接来源（`hand-off`：来源进入待移除，玩家除外，发出 `source-released`），到期时投递 `expire`。`expire` 先发出 `fragment-expired`：带标志或被击落的碎片成为自己爆炸的持有来源；玩家舱清除 `followedEntity`；其余进入待移除。产生碎片的机体在被毁后第 3 tick 离开；玩家停在状态 4 直到救援。
- Core 不做 EXPL 项的选择、额外爆炸、事件 0x10 与判别值 1、2 的碎片和闪光，没有相机或视口状态（CR-11）。

**碰撞**（[systems/collision.ts](../../../src/core/systems/collision.ts)、[rules/collision.ts](../../../src/core/rules/collision.ts)，H6–H8）：在本 tick 移动之后读移动后的位置，不写位置。只有活动且状态 ≥ 7 的对象参与；两遍都不看被毁标志与 Warp。

- `0x29670`（玩家实体存在、不停靠、状态 ≥ 7）：机体按遍历次序，玩家的中心在机体形状中时，大型种类（`0xf9c7c`）反弹（`0x2a12c`）、其他擦碰（`0x29eb8`），伤害 ÷ (3 − 战役组) 先给玩家、再给机体（大型的减半）；每个合格机体（接触与否）的 `proximity` 记为玩家与 f32 的距离平方。碎片（另需有 DEBRIS 参数且耐久 > 0）按其 +0x5C 类别反弹或擦碰；+0x5C ≠ 0 的碎片原始伤害先减半，只在本遍的接触计数 < 组 × 2 + 2 时伤害玩家（计数是每 tick 的局部量，不持久）；碎片的耐久每次接触都扣减，≤ 0 时被击落。
- `0x29934`：A 组（`0x382`）的每个成员对其后的 A 成员与全部 B 组（`0xffc7c`）成员测试，只测 A 成员的中心；伤害先 A 成员、后另一方；A 成员的 `proximity` 在为空或严格更远时替换。本遍中被毁的成员仍在表中（推动但不受伤）。
- 每次响应先从世界 RNG 抽取 6 次并写冲量与定时旋转（只写 steered 块；碎片的块没有字段，抽取照常），由下一 tick 的积分消费；伤害经 `applyContactDamage`，致死时在本阶段直接创建爆炸与碎片，新碎片本 tick 不参与。自动驾驶取消 `0x27edc(0)` 在 P3 中没有可写的状态，不执行（CR-09，P4）。

**能量与驾驶舱显示**（[systems/energy.ts](../../../src/core/systems/energy.ts)、[systems/displays.ts](../../../src/core/systems/displays.ts)，D9、D10、D13–D17，CR-10）：

- `energy` 阶段（`0x30590`）：先玩家（停靠时跳过；不看状态与被毁），再按遍历次序为种类 `0xffffe` 中停放者（任何状态，没有移动块）与活动且状态 ≥ 7 者更新，停靠者跳过。时钟 ≥ 到期时更新，dt 为与上次更新之差的 i32 视图：恢复护盾、玩家的充能，扣玩家的速度能耗（读 trunc(指令速度)，没有移动块时读机型 +0xB8）与字段 0 的损耗；能量 ≤ 0 时钳为 0 并锁定所传的移动块（`0x21ba0`：锁定，指令速度 0），锁存为假时发出 `energy-depleted`。下次到期：玩家为时钟 + 0x40，其他有块 + 0x80、无块 + 0x100。
- 档位改变以 [combat-init.ts](../../../src/core/rules/combat-init.ts) 的 `craftMaximumSpeed`（玩家为 P3-06 的 `playerMaximumSpeed`，读实时的 E、T 与字段 2；其他种类为 +0xB8）重算最高速度，再调用 P3-06 的 `applyRecomputedMaximum`（`0x21d88`）。受损与修理不重算（D6）。
- `frame-end` 的驾驶舱显示步只在视角模式 0xC、0xD、1、6（布局含左右显示屏的视角）中运行，按仪表次序先做右显示屏的目标清除，再做状态显示：玩家实体存在、左页为 0 且子系统 10 ≠ 2 时，时钟严格大于 `blinkDueClock` 则翻转闪烁并令到期为时钟 + 0x20；已翻转或 `redraw` 为真时写玩家的字段 1（船体比例与闪烁相位）、5（列表 1 的挂点状态）与 8（列表 0），然后清除 `redraw`。

**停放交战**（[systems/parked-engagement.ts](../../../src/core/systems/parked-engagement.ts)、[rules/parked-engagement.ts](../../../src/core/rules/parked-engagement.ts)，E1–E7）：停放更新为每个本次更新的对象调用 `engageParked(context, entity, elapsed)`。`ai.mode` 为 1 时走多目标 `0x2ffec`：按遍历次序收集种类 `0xfffff` 中阵营对立且严格在自身机型 +0x0C 半径内的对象（不看活动、状态、被毁与 Warp），对每个候选先写 `ai.objectTarget`，再以候选数为除数交战，最后一个保留为对象目标；否则走单目标 `0x30150`（除数 1）。一次交战依次为：按种类的不交战抽取 → 编队长（不能解析时结束）→ 按编队长的 AI 模式取目标引用 → 门禁（可解析、船体 > 0、不在 Warp、阵营对立）→ 距离减目标半径 → 射程内的炮与导弹、射击次数、选中导弹的弹药减 1 → 伤害合计（i32 回绕）乘 TABL 4003 倍率（`hitDamageScale`，只在这条路径上使用）与种类倍率 → 合计 > 0 且目标未被毁时经 `applyEngagementDamage` 施加 → 双方的 `nextEnergyClock` 改为本次时钟。抽取直接写回世界 RNG，所以伤害入口的抽取紧随其后。经过时间 ≥ 2³² 为 `budget-exhausted`（约 777 天，不可达）。

**其他任务的调用点**（CR-13）：[damage.ts](../../../src/core/systems/damage.ts)、[destruction.ts](../../../src/core/systems/destruction.ts)、[energy.ts](../../../src/core/systems/energy.ts) 与 [launch.ts](../../../src/core/systems/launch.ts) 的模块注释标出 `0x3c208`、`0x3c0f4`、`0x6977c`、`0x32d74`、`0x32dec`、`0x33464`、`0x32e14(1)` 与 `0x339cc` 在 P3-07 规则中的固定位置；Core 不建空函数或待处理标志代替它们，负责任务插入静态调用并递增 `RULES_VERSION`，跨 tick 的状态由它们自己拥有（见[交接](#交接)）。P3-10 已接入 `0x3c208` 与 `0x3c0f4`（[通讯、停靠与基地服务](#通讯停靠与基地服务p3-10)）；其余归 P3-11。

### 通讯、停靠与基地服务（P3-10）

P3-10 的系统在 [systems/](../../../src/core/systems/) 中，以静态调用接入命令判定、各实体的自身更新、请求处理、伤害与停放的调用点和自己的阶段（CB-12、CB-15），规则计算在[原版规则辅助](#原版规则辅助)的纯函数中。行为契约见 P3-10 spec 的[行为与边界](../../plan/p3/10/spec.md#行为与边界)与 CB-01 至 CB-19，原版事实见 executable 的 [Communications, docking and base service](../../original/formats/executable.md#communications-docking-and-base-service-p3-10)（下文的 CD、RQ、RX、DK、BS 小节标签指那里）与 [comm §7–§8](../../original/formats/comm.md#7-menu-state-machine-p3-1001)。状态见[实体与世界状态](#实体与世界状态world)的“通讯、停靠与基地服务的状态”。

**命令与原因码**（[communications.ts](../../../src/core/systems/communications.ts)、[commands.ts](../../../src/core/systems/commands.ts) 的 `judgeBaseKey`，CB-07）：按批内的生效视角判定，每条恰一个结果；判定中写入的菜单、页、通讯对象与停靠等待由同批的后续命令读到（决定 8）。P3-10 的命令不再有 `not-implemented`（只余地图上下文的 `confirm-selection`，归 P3-09）。

| 上下文与条件 | 命令 | 结果与效果 |
|---|---|---|
| 任何 | 全部 | 玩家不可用为 `ignored`/`player-unavailable` |
| 飞行，页 2–4（菜单打开） | `select-number n`（键为数字 n）、`communications close`（键为 `x`） | 取 `menu.items` 中第一个折叠后相等的项：退出项关闭（页回到保存页）；类别建立对象列表（空则关闭，恰 1 个则直接建立其命令菜单，多个则页 3）；对象成为 `partner` 并建立命令菜单（失败则关闭）；命令在 `partner` 仍可解析时投递 `deliver-command`，回到保存页，码 9 无论是否投递都开始停靠等待（子状态 3，期限为取样 + 0x780，发出 `docking-requested`）。都为 `accepted`，随结果发出一次 `left-page-changed`。没有匹配：`select-number` 为 `ignored`/`no-candidate`，`communications open` 为 `ignored`/`no-change` |
| 飞行，页不在 2–4 | `communications open` | 字段 13 为 2 为 `ignored`/`subsystem-disabled`；没有可显示的类别为 `ignored`/`no-candidate`（页不变）；否则清 `partner`、保存页、以类别菜单替换休眠的菜单、页 2，`accepted` |
| 同上 | `communications close`；`select-number` | `ignored`/`no-change`；`ignored`/`wrong-context`（P3-05） |
| 基地 | `navigate-selection`、`confirm-selection`、`launch` | `accepted`，立即投递 `base-navigate`、`base-confirm` 或 `depart`（`command`）；被接受的 `launch` 更新生效视角，同批的后续命令按飞行判定 |
| 基地 | `communications`、`select-number` | `ignored`/`wrong-context` |
| 飞行的 `navigate-selection`、`launch`；地图与 Warp 的 `communications`、`select-number`、`navigate-selection`、`launch` | — | `ignored`/`wrong-context` |

- 菜单判定先于 P3-06、P3-07 的飞行动作；菜单打开时 `confirm-selection` 仍是手动匹配，`speed-preset` 不被占用。所选内容的菜单只用数字与 `x`（CB-01 检查 1），所以 P3-07 的字母键、P3-09 的 `m`/`w` 与 P3-08 的 `b` 从不被菜单占用。
- 建立只在判定时进行，之后不刷新（comm §7.5）：类别菜单按 TABL 2007 的次序列出对象列表非空的类别（`buildCategoryMenu`）；对象列表按种类遍历次序取掩码内可解析且状态 ≥ 7 的实体（`buildObjectList`）；命令菜单（`buildCommandMenu`）对种类 2 用 `kind2`，对种类 `0x68000` 在近处门禁 `0x394c4`（生效视角不为 0、1，对象活动为 `active`，距离平方 ≤ f32 1,000,000，CD5）与 `0x33390` 都成立时用 `gated`，否则用 `other`。菜单项与 `partner` 保存 `EntityId`，对象移除即失效（CB-17 决定 1）。

**投递与回应**（[communications.ts](../../../src/core/systems/communications.ts) 的 `deliverCommand`、[base-response.ts](../../../src/core/systems/base-response.ts)，CD1–CD4、RQ1、RQ2）：`deliver-command` 在请求处理中把 `{ code, issuedTick }` 写入接收者的 `ai.pendingCommand` 并发出 `command-delivered`（接收者不可解析则无作用）。种类 `0x6807c`、状态 `active` 的对象在自身更新中（P3-08 的 AI 步之后的位置，活动不限）以 `answerCommand`（`0x3bed0`）消费：码 7 先由威胁测试 `0x3c040` 更新威胁时戳，再按时戳选择状态回复；码 9 以停靠回复（插在队首、回调 `docking-reply`）回答，没有拒绝条件；任何非 0 的码处理后清除。没有命令时按 RX4 的周期重做威胁测试，并经 `0x3c208` 重报。僚机的命令由 P3-08 消费。

**无线电与来电**（[radio.ts](../../../src/core/systems/radio.ts)，CB-05、CB-06、CB-09，D-03）：

- 入队 `queueRadio`（`0x2c740`）：到期为入队时的取样；停靠回复插在队首，其他项插在第一个到期更大的项之前；超过 `radioQueueItems` 为 `budget-exhausted`，不丢弃。`queueLine`（`0x38d54`）按类型抽取并查表 20985；`speakerFace`（`0x3c894`）给出说话者的头像，机体与基地第一次说话时从各自的池中抽取（`0x3c91c`，RQ4）。查找失败（头像或序号越界、条目为 0）不入队。
- 取出 `takeRadio`（`communications-reply`）：队首到期、通道 `idle`、`0x3336c` 成立时移出队首，通道转为 `loading`（就绪 tick 为下一 tick），发出 `radio-taken`；不执行回调。
- 呈现 `presentIncoming`（`frame-end` 末尾，任何视角）：载入满一 tick 后转为 `playing`，视角不是 1 时保存页并显示页 5，发出 `incoming-started`；按 e = ((取样 − 开始) × 8 mod 2³²) >> 6（1/8 秒）消耗各帧，全部消耗后通道回到 `idle`，页仍为 5 时恢复保存页，执行回调并发出 `incoming-ended`。停靠回复的回调在子状态为 3 时把它改为 4、到期为取样 + 0x200，不核对回复者（DK1）；新的子状态在下一 tick 的 `mission-flow` 才被读取。所以取出在 tick N，可见在 N + 1。
- 清空 `flushRadio`（`0x2cd20`）：移除全部项，停止播放（页为 5 时恢复保存页）或取消载入（不执行回调），页 := 0，最后发出 `radio-flushed`。本任务的调用者只有停靠等待的失效取消；超时不清空。
- 左显示屏处理器（[displays.ts](../../../src/core/systems/displays.ts)，驾驶舱显示步中）：页 2–4 而没有菜单、或页 5 而通道不在播放时，页 := 0（玩家字段 13 不为 2 时）。

**通讯反应与报告**（[comm-reactions.ts](../../../src/core/systems/comm-reactions.ts)，RX2–RX10，CB-12）：`reactToHit`（`0x3c208`）在 [damage.ts](../../../src/core/systems/damage.ts) 中护盾结算之后、攻击者种类非 0 时调用，以及接触伤害后船体 ≥ 0 时；`reactToDestruction`（`0x3c0f4`）在置被毁标志之后、`object-destroyed` 之前调用，以及接触伤害后船体 < 0 时（碰撞致死于 0 以下时调用两次）；`reportEnemyAppears`（`0x38cd4`）在活动的敌方类对象实例化时；`reportParkedEnemy`（`0x3c3b0`）在停放行进于活动区域内写入敌方类对象的位置时；僚机到达基地的限频完全修理在停放行进的到达分支（[area.ts](../../../src/core/systems/area.ts)，`limits.wingmanArrivalRepair`）；`checkTail`（类型 9 仪表 `0x4edf4`）在驾驶舱显示步的视角集合中，由内部计时门控，攻击者在尾随时经 `warnTail`（`0x38c30`）让僚机警告。攻击者种类由 `Attacker` 换算：`shooter` 为 1 << `kindBit`、`lost-shooter` 为 `0x93780`、`none` 为 0。抽取都用世界 RNG，条件与次序按 RX9；限频在报告到期时盖戳，即使没有查到消息。P3-08 接入之前，尾随检查的攻击者条件恒为假（`checkTail` 不遍历攻击者，决定 11）。

**停靠等待、停靠与离港**（[docking.ts](../../../src/core/systems/docking.ts)，CB-02、CB-10，DK1–DK3）：

- `checkDockingWait`（`mission-flow`，读上一 tick 的时钟 c′）：子状态 3、4 中停靠对象失效 → 释放（停靠对象 := null、子状态 0），发出 `docking-cancelled`（`invalid-object`），清空无线电；否则子状态 3 在 c′ ≥ 期限时只回到 0（`timeout`，不清空、不释放），子状态 4 在 c′ ≥ 期限时投递 `dock` 并进入 5；子状态 5 中失效 → 投递自动 `depart` 并回到 0（由离港释放）。三种取消都没有原版反馈。
- `dock`（请求处理，DK2 的次序）：执行搜索 `0x3959c` 找到的第一个基地不是停靠对象时释放并发出 `docking-cancelled`（`gate`）；否则保存基地的位姿、玩家活动 := 停靠、种类 2 遍历的第一个实体活动且与保存位置的距离平方 < f32 1,000,000 时随之停靠并完全修理、1 次世界抽取（入港背景，结果丢弃）、视角 6（上一视角 := 原视角，清除玩家目标，置 `statusDisplay.redraw`）、建立基地服务，发出 `docked` 与 `transition`（`G-02/3`）。子状态保持 5。
- `depart`（请求处理，DK3 的次序）：玩家活动 := `active`；视角 := max(上一视角, 0xC)；基地服务 := null；停靠的僚机恢复 `active`（不改位置）；玩家以保存的基地位姿放置：第 1 行 := −r3、第 2 行 := r2、第 3 行 := r1，位置每轴 := F(pᵢ + F(r1ᵢ × 1000.0))，新位姿存回 `savedPose`，放置序号加 1；移动块不变；释放停靠对象、子状态 0；发出 `departed` 与 `transition`（`G-02/4`）。同一 tick 两次离港（自动离港与 `l`）各自应用（决定 6）。
- 两个请求都不读子状态与玩家活动，玩家实体不存在时无作用。原版的 `LANDING`、`LAUNCH` 过场用时不计（G-02 不计时，见[已知差异](#已知差异)）。

**基地服务与完全修理**（[base-interior.ts](../../../src/core/systems/base-interior.ts)，CB-10、CB-11，BS2–BS9）：

- 按键：`base-navigate` 夹在 0–10 之间移动光标；`base-confirm` 在光标行的 `serviceState` ≠ 0 时把该行移到第 0 行；都不改计时。每个请求都发出 `base-navigated` 或 `base-confirmed`；没有基地服务时不改状态、`row` 为 null。
- 服务步 `serviceBase`（`base-interior`）：有玩家实体且已提交的视角为 6 时（此时没有基地服务为故障 `base-interior.service`）依次做修理（取样 > 到期时按队首的选择值修理一项，队首不需服务时置 `repairsComplete`，修好后轮转）、船体（每步 1 次世界抽取，船体 := min(船体 + 速率 + rand % 100, c9C)）与能量和导弹（能量加速率到 c54，补弹并移动两张列表的选择，不发事件）。不看活动、被毁、停靠对象与基地的状态；地图打开（视角 8）时整步不执行、到期保持，之后每个逾期步骤做一次并从该取样重排，不补做。护盾与充能不在基地补充。
- `fullRepair(context, entity, inRequestHandling)`（`0x39820`，BS9）是共享入口：字段 0–18 清零、列表 0、1 的受损挂点全部恢复、船体 := c9C、能量 := c54、导弹补满、扰动清零，两张列表的选择各前进一整圈（列表 1 上每次前进清除锁定等级）；实体为玩家且 `inRequestHandling` 为真时每次前进发出 `commandIndex` 为 null 的 `weapon-selected`。调用者：停靠时的僚机、僚机到达基地；P3-11 的救援与 P3-08 的 `0x61bd0` 将调用同一函数。

**停靠中的系统**（DK4，[docked-systems.test.ts](../../../src/core/systems/docked-systems.test.ts)）：停靠的玩家与僚机照常按自己的移动块运动，活动区域中心随玩家移动（漂移可使基地停放并引起自动离港，决定 7）；它们不参与能量更新、碰撞与弹丸命中，也不是目标候选；导弹起爆与停放交战照常命中它们。停靠的僚机不被区域检查停放。

**给其他任务的入口**（CB-12）：`flushRadio`、`queueRadio`、`queueLine`（radio.ts）；`fullRepair`（base-interior.ts）；`clearCommunicationLimits`（comm-reactions.ts，清 `limits.friendlyHit` 与 `friendlyKill`，供 P3-11 的救援）；`warnTail`（comm-reactions.ts，供 P3-08 加入尾随检查的攻击者遍历后调用）。感谢计数由 P3-11 的统计重置直接写 0。

### 原版规则辅助

[rules/](../../../src/core/rules/) 中的规则辅助按原版代码实现换算、随机映射、放置、缺省、排程与名称，P3-06 的飞行状态、运动积分、操纵、速度匹配、AI 初态、随机方向、活动区域与停放行进，以及 P3-07 的战斗规则。它们确定、不依赖宿主；受控的状态变化只有经 `RandSource` 消耗世界 RNG、修改调用者显式传入的世界计数（如名称池计数）、移动块（操纵与匹配就地改写所给的块）或战斗状态（P3-07 的规则就地改写所给的武器块、资源与子系统）。原版事实见 executable 的[放置与数值](../../original/formats/executable.md#placement-runtime-scale-and-numbers-p3-0202)、[生成队列与实例化](../../original/formats/executable.md#spawn-queue-defaults-names-and-instantiation-p3-0203)与 [P3-06 一节](../../original/formats/executable.md#flight-motion-controls-speed-parking-and-take-off-p3-06)；测试期望来自 P3-02/02、03 与 P3-06 的独立推导，不由被测实现计算（运动的一帧参照见[针对性检查](#针对性检查)）。

- **数值**（[float32.ts](../../../src/core/rules/float32.ts)）：位置与姿态以 f32 存储，中间运算用 JS 双精度。每次 f32 写回都就近舍入、平局取偶（`Math.fround`）；浮点转 i32 一律向零截断。这是用户批准的 Q-11 决定（[goal 执行记录](../../plan/p3/02/goal.md#执行记录)的“Q-11 舍入方向改为就近（用户批准）”），依据见[已知差异](#已知差异)。`FLOAT32_MAX` 与 `isFiniteFloat32` 用于校验。P3-06 的规则按原版的写回点逐一写回（[运动路径的数值](../../original/formats/executable.md#numbers-on-the-movement-path-p3-0601)）；原版解除了溢出、无效操作与除零异常的屏蔽，所以每个非有限的 f32 写回都是 `invariant-violated` 故障，包括随后被丢弃的值，调用者不会收到部分结果。
- **坐标**（[coordinates.ts](../../../src/core/rules/coordinates.ts)，Q-03）：
  - `runtimeFrame({ coordinates, mapFrame }, path)` 返回 `RuntimeFrame { sectors, scaleFactor }`：扇区数 n = 2 × halfExtent ÷ referenceScale，q = f32(15000 ÷ referenceScale)（`RUNTIME_SCALE` = 15000）；只接受本切片的地图框架。世界矩形为 ±7500n（`worldHalfExtent(frame)`），全世界缺省的范围为 15000n。
  - `runtimePosition`：有 `object` 来源的声明换算一次 f32(p × q)，即使同时被编组引用；只有编组来源或僚机来源的位置已是运行时单位，不换算，只校验。
  - `runtimeRegion`：生成矩形的每个 i32 值为 trunc(v × q)，并要求每轴从起点跨整个支持集都在范围内。
  - `runtimeVector`：布局偏移等运行时单位的向量只校验，不换算、不交换轴。
  - **支持的数值域：** 输入为 f32，运行时坐标绝对值小于 2^22（`COORDINATE_LIMIT`），i32 输入小于 2^29，扇区数 1–559（`MAX_WORLD_SECTORS`）。在此范围内换算与随机放置的中间值在双精度中精确，每个坐标只舍入一次；超出时世界创建拒绝。
- **原版随机映射**（[original-random.ts](../../../src/core/rules/original-random.ts)，Q-02）：`RandSource` 按抽取次序提供 0–32767（`RAND_MAX`）的 rand 值；`RandStream(state)` 每个值取世界 RNG 一次抽取（[rng.ts](../../../src/core/determinism/rng.ts) 的 `nextRandom`）的 uint32 高 15 位（`randOfUint32`），每个值恰有 2^17 个原像，`state` 是最后一次抽取后的状态。三个映射，C = `RAND_SCALE` = 32769 ÷ 2^30：
  - `rectangleCoordinate(from, to, rand)`：f32(from + |to − from| × rand × C)，跨度总从 `from` 起；
  - `worldCoordinate(extent, rand)`：f32(W × rand × C − (W >> 1))，W 为世界宽度 15000n；
  - `anchorOffset(signRand, sizeRand)`：符号抽取为偶数时取正，大小为 400 + (rand mod 200)，即 ±400 至 ±599，从不为 0。

  不复现原版序列；相邻调用按独立均匀的值建模。
- **放置**（[placement.ts](../../../src/core/rules/placement.ts)）：`placeRecord(record, world, rand)` 返回冻结的 `Placement { route, position, attitude }`。
  - `PlacementRecord` 为 `{ gridSpacing, anchor, position, region }`，运行时单位。`anchor` 为 null 或 `{ target }`，`target` 是锚定对象此刻的位置：锚点记录种类表中按分配次序第一个来源为该记录的实体，不论状态；没有时为 null，锚点记录为种类 0 时总是 null。
  - 路线 `PlacementRoute` 按优先级选择：网格（非零即内部故障，先于任何抽取）、锚点（目标为 null 时改走全世界缺省）、存储位置（去掉符号位后不全为零，逐位复制）、矩形、全世界缺省。
  - 抽取次序：锚点依次为 x 符号、x 大小、y 符号、y 大小、z 符号、z 大小；矩形与全世界缺省先 x 后 y；存储位置不抽取。
  - 每条路线之后做一次世界边界处理：内缩 200 的闭矩形之外的点在 x/y 上朝原点移动 300 一次，不夹取、不再检查，z 不变。之后按最终 x、y 的符号（−0 视为正）求初始姿态，对角分量为 `INITIAL_DIAGONAL`。
  - `memberPosition(anchor, offset)`：段 5 成员的位置为逐轴 f32(A + l)，不换算、不做边界处理，姿态取所在布局周期的锚点姿态。
  - `worldDefaultPoint(frame, rand)` 是全世界缺省的点（`0x68c98`，2 次抽取，z 为 +0），也是 AI 初态的世界随机目标点；`areaPoint(region, frame, rand)`（`0x68598`）是矩形或全世界缺省路线，供停放行进到达时取新目标点。两者都不做世界边界处理。
  - 世界边界处理之后的扇区资源测试不抽取，属于实例化（见[已知差异](#已知差异)）。
- **缺省值**（[record-defaults.ts](../../../src/core/rules/record-defaults.ts)，Q-04）：`fillRecordDefaults(inputs, missionDefault, rand)` 按字段填写，只在 +0x78 为空时抽取一次；`unfilledRuleInputs` 给不填写的记录（只从段 5 可达）保留来源值，空为 0；`missionDefault(group, missionNumber)` 为 (组 + 3) × 任务号，任务号小于 1 时为 100；`randomAiValue` 为 rand % 60 + 20；`toInt32` 是原版对 u32 来源值的 i32 视图。各字段的空值、负值与钳位语义见 executable 的[记录缺省](../../original/formats/executable.md#record-defaults-p3-0203)。
- **排程**（[spawn-schedule.ts](../../../src/core/rules/spawn-schedule.ts)，Q-01、Q-06）：`buildSpawnState(setup, geometry, options, rand)` 按数组次序填写段 1 记录的缺省并入队，玩家记录（`PLAYER_KIND_BIT` = 0）之后紧接所选僚机（时刻 0，锚点为玩家记录），再按次序入队编组；队列按到期升序，同刻保持插入次序。`isScheduledRecord` 判断记录是否单独排程（有种类、`object` 来源、不是编组成员）。`RuntimeGeometry` 与 `ScheduleOptions` 是世界创建换算后的几何与 `{ group, wingman }`。`firingRecord`（队列项触发的记录）与 `postsRequests`（队列项是否投递请求）由生成阶段与机型语义检查共用；`WINGMAN_KIND_BIT` = 1。
- **名称**（[name-assignment.ts](../../../src/core/rules/name-assignment.ts)，Q-05）：`assignName(setup, entities, poolUses, record, rand)` 按 executable 的[名称](../../original/formats/executable.md#names-p3-0203)规则返回 `NameReference`；占用按文字比较，由现存实体持有，池计数在世界状态中，只在随机候选与名称池分支各抽取一次。

以下为 P3-06 的规则（[飞行控制、运动与停放](#飞行控制运动与停放)的系统调用它们，P3-07、P3-08、P3-11 可直接复用）。表格与标量常数是代码规则，在 Core 中独立实现，不导入（[P3-06 技术决定 11](../../plan/p3/06/spec.md#技术决定)）。

- **飞行状态**（[flight-state.ts](../../../src/core/rules/flight-state.ts)，[油门、最高速度与速度匹配](../../original/formats/executable.md#throttle-maximum-speed-and-speed-matching-p3-0603)）：
  - 油门：`THROTTLE_TABLE`（启动时计算的线性表）、`throttleIndex`（中点加算术右移的油门；越出表时钳到表内，见[已知差异](#已知差异)）、`throttleSpeed`（f32(表项 × 最高速度)）与 `FULL_THROTTLE`（使指令速度恰等于最高速度）。
  - 最高速度：`playerEnergyOperands`（`0x3060c` 的能量 E 与阈值 T）、`playerMaximumSpeed`（`0x30e0c`：E < T 时由能量与机型 +0x88 的整数运算得出，否则取基准 +0xB8，再乘两位字段 2 的系数）、`initialMaximumSpeed(kindBit, record)`（玩家用代码固定的初始分配等级 `INITIAL_ALLOCATION` 与清零的字段，其他种类取 +0xB8；不抽取。P3-07 接入后实例化改由 `0x3060c` 以实时的 E、T 写最高速度，它已没有生产调用者）；`ENERGY_SCALE` 与 `ALLOCATION_LEVELS` 也供机型语义检查使用。
  - `applyRecomputedMaximum(block, maximum)`（`0x21d88`）：没有移动块时无作用；否则只在速度 ÷ 新上限严格大于 1 时把指令速度设为新上限并清到达标志，当前速度不被钳制，新上限为 0 为故障。
  - 移动块：`craftMovementBlock(throttle, maximum, base)`（`0x21794` 的模式 0 块）、`initialMovementBlock(maximum, base)`（`0x2c3b0`，满油门：速度与指令速度恰为最高速度，到达，速度比 = `speedRatio`，其余为零或空）、`rebuiltMovementBlock(oldBlock, maximum, base)`（`0x218e8`：按旧速度比换算的油门重建，没有旧块时油门为 0）；`speedRatio` 在基准 +0xB8 不为正时为 0。
  - `initialWarpClock(kindBit, clock, rand)`：玩家与僚机为 0（不抽取），其他种类为本次时钟加一次抽取的延迟。
- **运动积分**（[flight-motion.ts](../../../src/core/rules/flight-motion.ts)，[运动阶段与积分](../../original/formats/executable.md#movement-stage-and-integration-p3-0601)）：纯函数，返回新值、不改参数。
  - `motionStep(clockUnits, clock)`：原版的步长 dt 与任务时刻 t，都是 f32 秒；接受 0 与任意非负安全整数单位，步长不能表示为 f32 时为 `flight-motion.step` 故障。
  - `integrateCraft`（模式 0，`0x222f0`）：冲量位移与衰减 → 用更新前的速度沿第三行前进 → 未到达时按机型 +0xBC/+0xC0 趋向指令速度（以未写回的双精度值判定越过，越过时取指令速度并置到达）→ +0xB8 为正时更新速度比 → 转向因子（+0xC8）→ 依次绕第 1、2、3 行旋转（定时旋转与启用的稳定速率叠加、衰减并以 f32 任务秒判定到期；没有定时横滚时的 +0xC4 耦合）。`integrateWarp`（模式 3，`0x22600`）不平移、不读冲量、只有加速分支，旋转相同。`MotionRecord` 是两者读取的机型字段。
  - `rotateRows(orientation, axis, angle)`（`0x228cc`/`0x22a50`/`0x22990`）：sin、cos 用 `Math.sin`/`Math.cos` 后写回 f32，每个分量按旧值做一次双精度和、一次 f32 写回，不重新归一化。
- **操纵**（[flight-control.ts](../../../src/core/rules/flight-control.ts)，[飞行操纵与旋转](../../original/formats/executable.md#flight-controls-and-rotation-p3-0602)）：
  - `axisDeflection`：项目轴到数字摇杆的整数偏转（轴值 × `FULL_DEFLECTION` 向零截断，±1 为满偏，不产生 −0）。`SENSITIVITY_TABLE` 是 Medium 档的灵敏度表（启动时计算的二次表，G-10 固定档位；改变档位须递增规则版本）。
  - 油门键：`throttleReadback`（`0x21ca8`，没有移动块或最高速度不为正时为 0）、`increasedThrottle`、`decreasedThrottle`（步长 `THROTTLE_STEP`）与 `presetThrottle`（Shift+n 的档位）。
  - 两条操纵路径共用门禁 `controlApplies`（有移动块、有机型记录、未锁定，否则无作用也不抽取），原地改写所给的移动块，只从所给的 `RandSource` 抽取：整数路径 `applyIntegerControl`（`0x21dd0`，消息 0x20000：扰动时每条消息先抽 3 次；油门写指令速度并清到达；每轴为不变、关闭或经灵敏度表的偏转）与浮点路径 `applyFloatControl`（`0x21fd8`，消息 0x40000：扰动时先抽 5 次，含随机方向；速率与值成线性，不经灵敏度表）。P3-06 只投递整数路径的请求；浮点路径由 P3-07 的导弹使用（`steer` 请求，以及无制导导弹在阶段 0 的直接调用）。
- **速度匹配**（[speed-match.ts](../../../src/core/rules/speed-match.ts)，M-05）：`matchedSpeed`、`speedMatch` 与 `applySpeedMatch`（`0x21adc`：目标的当前速度钳到 [0, 主体最高速度]，模式 `craft` 写指令速度并清到达，其他模式写当前速度；双方都要有移动块且主体有机型记录，否则不写入，不查锁定），手动匹配、速度辅助与 P3-08 的 AI 匹配共用。辅助条件：`isAssistKind`（辅助种类掩码）、`squaredDistance`（`0x56b50`，每项一个因子先舍入为 f32）、`withinAssistRange`（等于阈值时也匹配）、`speedDifferenceExceeded`（HUD 闪烁条件，严格大于）、`ASSIST_INTERVAL` 与 `nextAssistDue`（从本次时钟重新计时）。
- **AI 初态**（[initial-ai.ts](../../../src/core/rules/initial-ai.ts)，[初始飞行状态](../../original/formats/executable.md#initial-flight-state-p3-0605)）：`aiCandidates(record, spawn, setup)`（`0x68018`，来源记录的候选种类掩码与声明过滤）与 `initialAiState(entities, subject, candidates, frame, rand)`（`0x68050`）。固定种类只写 AI 模式；其他种类（含玩家）在候选中取最近者（不分状态与活动，自身计入，f32 评分，严格更小才替换），最近者属另一方且远于 `RANDOM_TARGET_DISTANCE_SQUARED` 时以 1 次抽取改选随机候选；有目标时为模式 2（同方）或 0（另一方），没有时取 `worldDefaultPoint`（2 次抽取）并为模式 4。内容契约已拒绝记录 +0x4C 的路径路线，所以 Core 中一次调用抽取 0–2 次：随机候选的 1 次与目标点的 2 次互斥。P3-06 spec 与 P3-02 spec 修订中写的“0–3 次”计入了原版的这条路线（经 `0x688c4`，+0x50 为 2 时多抽 1 次），它在 Core 中不可达（[已知差异](#已知差异)）。
- **随机方向**（[random-direction.ts](../../../src/core/rules/random-direction.ts)）：`DIRECTION_TABLE`（启动时计算的第一卦限方向表）与 `randomDirection(rand)`（`0x56b8c`，2 次抽取：表项与八个符号卦限之一），供浮点操纵路径与停放行进，也供 P3-07、P3-08。
- **活动区域**（[active-area.ts](../../../src/core/rules/active-area.ts)，[世界边界、活动区域、停放与自动驾驶](../../original/formats/executable.md#world-boundary-active-area-parking-and-autopilot-p3-0604)）：`activeAreaCentre(world)`（玩家实体的位置，没有玩家实体时为 null）、`isWithinActiveArea(centre, position)`（`0x3a540`：x/y 距离平方严格小于 `ACTIVE_AREA_RADIUS_SQUARED`，没有中心时一律在区外），实例化与区域检查共用这两者；`isRemovedOnLeaving(kindBit)`（种类位 `0x1f00000`）；`isOutsideExitBounds(frame, position)`（`0x3a41c` 的世界矩形内缩 100，严格比较，边界算在内，忽略 z）。
- **停放行进**（[parked-travel.ts](../../../src/core/rules/parked-travel.ts)，同上）：到期判定 `isParkedUpdateDue`；过境 `isInWarpTransit` 与 Warp 许可 `isWarpAllowed`（`0x2ff98`）；目标距离 `goalDistance` 与到达 `hasArrived`；跳跃距离 `isWarpJumpDistance`；零偏移的随机替换 `randomTargetOffset`（3 次抽取）；`0x56aa8` 的归一化 `normalized`；朝向目标的姿态重建 `headingTowards`；跳跃与行进长度、前进、抖动 `jittered`（6 次抽取）与 `0x56e34` 的编队位置 `formationPosition`。时钟运算是精确整数，负的 Warp 持续时间按[已知差异](#已知差异)中的项目规则处理。

以下为 P3-07 的规则（[战斗规则](#战斗规则p3-07)的系统调用它们，P3-08、P3-10、P3-11 可直接复用）。它们只读所给的参数、只改所给的状态（武器块、充能、战斗状态或移动块）、只从所给的 `RandSource` 抽取。整数按原版的 i32 语义（`Math.imul` 与加减回绕，带符号除法向零截断；除数为 0 或商溢出为故障）；每个 f32 写回为 `Math.fround`，非有限即故障；常量数值只在代码中，不写入文档。测试期望由 executable 的 Combat rules 与 CR 独立推导，随机部分对 0–32767 的全部 rand 值计数原像。

- **载入变换与碰撞形状**（[load-transforms.ts](../../../src/core/rules/load-transforms.ts)、[collision-shapes.ts](../../../src/core/rules/collision-shapes.ts)，craft §3.8、§4.4、§3.5.1，H7）：`gunRuleData`、`missileRuleData`（射程及其平方、引信半径平方）、`craftShape`、`mountOffsets`（非自动炮挂点 +0x08 加弹丸长度，种类位 0、1 的长度先乘代码常量）、`debrisRuleData` 与 `normalise`（`0x56aa8`）；`pointInFrame`（`0x56dc0`）、`craftContainsPoint`（`0x29bf4`：d² 先舍入为 f32 再与 r² 非严格比较，并返回它）与 `debrisContainsPoint`（`0x29d58`：不舍入）。
- **战斗初值**（[combat-init.ts](../../../src/core/rules/combat-init.ts)，W1、D13，CR-07）：`initialiseCraftCombat`（实例化的三步）；救援复用的 `rebuildWeaponBlock`（`0x2d400`）与 `initialiseResources`（`0x3060c`：资源、档位、E 与 T、最高速度、两个能量时钟与 1 次抽取，并清除耗尽锁存；各自只写自己的字段）；`initialHull`、`resourceArithmetic`（世界创建的溢出检查共用）、`craftMaximumSpeed`（`0x30e0c` 的实时调用）、`missileMaximumSpeed`、`missileBodyRecord` 与 `runtimeKindDefaults`。
- **目标与雷达**（[targeting.ts](../../../src/core/rules/targeting.ts)、[radar.ts](../../../src/core/rules/radar.ts)，T2、T6、T10）：掩码 `ENEMY_KINDS`、`FRIENDLY_KINDS`、`FORWARD_KINDS` 与 `forwardMode`、`isFriendlyKind`（`0x6c87f`）；`isTargetCandidate`、`targetDistance`（`0x637e4`）、`fartherCandidate`（`0x63858`）、`nearerCandidate`（`0x63954`）与 `forwardCandidate`（`0x63a4c`）；`readRadar` 与 `RADAR_CAPACITY`（120）。
- **挂点与开火**（[mounts.ts](../../../src/core/rules/mounts.ts)、[firing.ts](../../../src/core/rules/firing.ts)，W1–W13）：选择 `selectMount`（`0x2e4ec`）；子系统 8、5 的挂点损坏 `damageListMount`（`0x2e310`、`0x2e150`）、修理 `repairListMounts`（`0x2e3c8`、`0x2e1fc`）与状态 `listStatus`（`0x2e438`、`0x2e264`）；`chainAmmunition`（`0x2dd04`）。扳机 `fireList`（`0x2d578`，含炮 `0x2e5e8`、导弹 `0x2e86c` 与充能 `0x30cc8`、`0x30cec`）、瞄准解 `aimSolution`（`0x2e9d4`）、射界 `inArc` 与半球 `inHemisphere`（`0x2d894`）、玩家锁定 `updateLock`（`0x2ddbc`）、自动挂点 `fireAutomaticMounts`（`0x2dad0`）与获取 `acquireAutomaticTarget`（`0x2da58`）。发射经回调交出，规则不读世界。
- **移动块与运动**（[movement-builders.ts](../../../src/core/rules/movement-builders.ts)、[projectile-motion.ts](../../../src/core/rules/projectile-motion.ts)，H1、H2、W11）：`0x218e8` 的模式 1、2 项 `linearItem`、`spinningItem`（来源为 `spinning` 块时先以其速度方向为第三行并重新正交化）与 `0x21794` 的模式 1、2 分支 `linearBlock`、`spinningBlock`；`orthonormalFrame`（`0x56d18`）、`offsetPosition`、`applyGuidedLaunchSpeed`（`0x21a3c`）、导弹散布 `scatteredRows`（3 次抽取）与 `speedOf`；`moveLinear`（`0x22818`：先存移动前的位置，每轴一次 f32 写回）与弹丸计时块 `projectileTimer`、`lingerTimer`、`isTimerDue`。模式 0 的构造仍是 P3-06 的 `craftMovementBlock` 与 `rebuiltMovementBlock`，行旋转与 P3-06 共用 `rotateRows`。
- **弹丸命中**（[hit-tests.ts](../../../src/core/rules/hit-tests.ts)，H3、H4、H7、H8）：粗测 `segmentMeetsBounds`（`0x2874c`：世界轴向盒，两端严格在同一面外即不中）、细测 `refinedImpact`（`0x28efc` 与逐盒的 `0x28b48`：目标坐标系，取严格更小的 t，面码 0–5）、`segmentHitsShape`、两遍遍历 `findProjectileHit`（`0x28450`）、碎片上的选择 `deflectsOffFragment`（1 次抽取）与跳弹 `ricochet`（`0x25dc4`，5 次抽取）。
- **伤害与子系统**（[damage.ts](../../../src/core/rules/damage.ts)、[subsystems.ts](../../../src/core/rules/subsystems.ts)，D3–D12）：护盾 `absorbByShield`（`0x30c60`）、船体 `damageHull`、`damageSubsystems`（`0x2a830` 第 2–10 步，含玩家的重伤记录 `0x69e5c`）与扰动 `disturb`（`0x21bd4`：只对 `craft` 模式的块，等级 2 时 3 次抽取）。
- **能量与显示**（[energy.ts](../../../src/core/rules/energy.ts)、[displays.ts](../../../src/core/rules/displays.ts)，D9、D10、D14–D17）：`applyEnergyUpdate`、`speedCost`、`lockMovement`（`0x21ba0`）、`changeAllocation`（`0x30b20`、`0x30bc0`）、带符号除法 `quotient` 与三个更新间隔；`pageChange`、`showsStatusPage`、`COCKPIT_DISPLAY_VIEW_MODES`、`advanceBlink`、`hullField` 与 `withStatusFields`。
- **碰撞**（[collision.ts](../../../src/core/rules/collision.ts)，H6）：掩码 `PLAYER_CONTACT_KINDS`（`0xffffe`）、`POINT_GROUP_KINDS`（A 组 `0x382`）、`SHAPE_GROUP_KINDS`（B 组 `0xffc7c`）；擦碰 `glancingContact`（`0x29eb8`）与反弹 `bounceContact`（`0x2a12c`），各 6 次抽取，返回写入两方移动块的冲量与翻滚及原始伤害；`collisionDamage`（÷ (3 − 组)）、`halved` 与 `fragmentContactLimit`。
- **导弹**（[steering.ts](../../../src/core/rules/steering.ts)、[guidance.ts](../../../src/core/rules/guidance.ts)，H5）：共享转向模块（CR-09）：`programRecord`、`steeringLimits` 与 `installHoming`（`0x5dc0c`）、`leadTargetPoint`（`0x5c8b0`，提前量模式 3）、`steeringFractions` 与 `steeringControl`（`0x5cd1c`）、`throttleControl`（`0x5d41c`）、`rateControl`（`0x5d0ec`）、`isHomingUpdateDue`（`0x5dcd4`）、`homingDeadline` 与 `runHomingProgram`（处理程序 `0x60b84` 与热寻的 `0x60aa0`，模式 0、1、2；只在热寻的放弃时 1 次抽取）、`vectorDistance`（`0x56b14`）。输出为 CR-05 的 `ControlBlock`，交给 P3-06 的 `0x21fd8`，不以直线追踪代替。制导：`invalidGuidanceField`（世界创建与首次回调共用）、`initialGuidance`、`initialHoming`、`advanceGuidance`（`0x2ac10` 的五个阶段）、`checkFuse`（`0x2adac`：接触与近炸）、`isBlastVictim`、`blastDamage`、惰性的 `blastHits` 与震动 `blastShake`（`0x2b628`）。
- **爆炸与碎片**（[explosions.ts](../../../src/core/rules/explosions.ts)、[fragments.ts](../../../src/core/rules/fragments.ts)，X2–X7）：`explosionInit`（`0x23ac8`）、`explosionVariant`、`playerExplosionDue`、`activateExplosion`、`explosionFrame`、`explosionFrameCount` 与 `explosionUpdate`（`0x2409c`）；`fragmentInit`（`0x25124`）、`debrisIndex`（`0x249dc`）、`firstExpiry`、`isExpiryDue`、`shootDown`（`0x24a6c`）、`expiryOutcome`（`0x256e4`）与 `spinFragment`（`0x2285c`：平移后按轴字节旋转，自旋不乘步长）。
- **停放交战**（[parked-engagement.ts](../../../src/core/rules/parked-engagement.ts)，E2–E5）：`declinesEngagement`、`isOpposingSide`（`0x6c87f`/`0x6c07f`/`0x93f80` 的阵营掩码）、`targetReference`、`collectionRadiusSquared`、`collectionDistanceSquared`（`0x56b50`）、`isCollected`、`engagementDistance`、`shotCount`、`targetKindFactor` 与 `volley`（导弹选择、炮的合计、种类倍率）。

以下为 P3-10 的规则（[通讯、停靠与基地服务](#通讯停靠与基地服务p3-10)的系统调用它们；P3-08、P3-11 经那里的入口复用）。它们只读所给的参数、只改所给的状态（菜单、基地服务、战斗状态或移动块）、只从所给的 `RandSource` 抽取；测试期望由 executable 的 CD、RQ、RX、DK、BS 小节与 CB 独立推导。

- **菜单**（[comm-menus.ts](../../../src/core/rules/comm-menus.ts)，comm §7）：`foldKey`（[comm-input.ts](../../../src/core/world/comm-input.ts)，`0x754d9` 的 A–Z 折叠）、`matchItem`（`0x27e10` 的首匹配）、`CLOSE_KEY` 与 `digitKey`；`buildCategoryMenu`（`0x2c850`）、`buildObjectList`（`0x2c9d0`）、`buildCommandMenu`（`0x2cbb4`）、`commandTable` 与近处门禁 `nearMenuGate`（`0x394c4`，CD5）。
- **无线电**（[radio.ts](../../../src/core/rules/radio.ts)，RQ3–RQ8）：`takesRadio`（`0x3336c`）、`insertionIndex`（`0x2c740` 的插入位置）、`lookupMessage`（`0x3c618`）与 `messageFrames`、`assignFace`（`0x3c91c`，1 次抽取，池用完时 2 次）、`elapsedEighths` 与 `playbackFrame`（来电的 e 与当前帧）、`DOCKING_COUNTDOWN`（0x200）与 `hasKind`。
- **通讯反应**（[comm-reactions.ts](../../../src/core/rules/comm-reactions.ts)，RX1–RX10）：种类掩码（`HOSTILE_KINDS`、`FRIENDLY_RESPONDER_KINDS` 等）、台词类型、限频周期 `PERIODS` 与尾随检查周期；`attackerKind`、`isEnemyAttacker`、`isSuppressed`（限频）、`isLowHull`、`accumulateFriendlyFire`（`0x38f20`）、按名称序号的消息序号（`underAttackIndex` 等）、`secondUnderAttackIndex`（rand % 4）、`isWithinWingmanRange` 与 `isOnTail`（RX8 的点积）。
- **停靠与基地服务**（[docking.ts](../../../src/core/rules/docking.ts)、[base-service.ts](../../../src/core/rules/base-service.ts)，DK1–DK3、BS2–BS6）：`isValidDockingObject`、`dockingWaitStep`（子状态 3–5 的检查结果）、`withinDockingRange`、`findDockingBase`（`0x3959c`）、`findDockingWingman` 与 `wingmanHead`、`serviceState`（`0x39cb4`）、`serviceRows` 与 `setUpBaseService`（`0x39664`）、`launchViewMode` 与 `launchPose`（DK3 的放置）；`navigateCursor`、`confirmRow`、`rearm`（从执行取样重排的到期）、`repairStep`、`hullStep`（1 次抽取）与 `energyStep`（含 BS6 的导弹遍历）。
- **完全修理**（[full-repair.ts](../../../src/core/rules/full-repair.ts)，BS9）：`repairFully`（`0x39820`，经回调报告每次列表前进）、`refillMissileChain`、`advanceWalk` 与 `resetDisturbance`（`0x21bd4` 的 0 级，不抽取）。

### Projection 与 Render State

- **projection**（[projection.ts](../../../src/core/projections/projection.ts)）：`Projection` 是深度冻结、与世界脱离的纯数据，不提供全体实体列表。
  - 就绪分区：`clock` 为 `{ tick, clock, clockUnitsPerTick }`；`mission` 为 `{ mission, group, slot, rawDifficulty, wingman, status }`；`player` 为 `{ entityId, viewMode, previousViewMode, subMode, interactionContext }`。UI 使用 `interactionContext`，不复制上下文的选择。
  - `flight` 是 `FlightProjection { motion, combat }`，两组各为 `NotImplementedPartition` 或各自的 ready 类型，互不覆盖；需要两组的消费者分别检查（[P3-06 的 D-05](../../plan/p3/06/spec.md#对-p3-02-契约的增量)）。两组现在都总是就绪。
    - **运动组（就绪，P3-06）：** `MotionReady { readiness: 'ready', player }`。`player` 在没有玩家实体时为 null，不伪造零速度；否则为 `MotionPlayer { entityId, position, orientation, speed, commandedSpeed, maximumSpeed, speedLimitStatus, speedAssist: { enabled, engaged } }`，位姿是冻结的新副本，速度为运行时单位/秒，取自玩家实体的移动块与 `maximumSpeed`，辅助状态取自控制状态，任一次读取都能恢复持续的辅助指示，不需要事件历史；没有“最新匹配时刻”。`speedLimitStatus`（`SpeedLimitStatus`）取 `PLAYER_SPEED_LIMIT_STATUS`，现为 `'live'`：P3-07 在实例化与每次档位改变时以实时的 E、T 与字段 2 重算最高速度（CR-09），不得回退到表示只有实例化初值的 `'initial-only'`。玩家 ID 不能解析、玩家实体没有移动块或其块不是 steered 块（P3-07/33 的收窄），或玩家没有控制状态为 `invariant-violated`/`projection.motion`，由世界锁存。
    - **战斗组（就绪，P3-07，CR-12）：** [combat.ts](../../../src/core/projections/combat.ts) 的 `projectCombat` 给出 `CombatReady { readiness: 'ready', player }`，读取不改状态、不抽取随机数。`player` 在没有玩家实体时为 null，不伪造零资源；否则为 `CombatPlayer`，玩家已被毁时（被毁视角直到救援）照常给出全部读数并置 `destroyed`：
      - `targetMode`；`target`（`CombatTarget`，玩家目标能解析时给出，被毁而仍在表中的照常给出）：`entityId`、`kindBit`、`name`（`NameReference`）、位姿、`distance`（右显示屏的距离：f32 坐标的双精度差，每项乘其 f32 副本，(dy² + dz²) + dx² 开方后存为 f32，T7）、`speed`（目标移动块的速度，没有块为 null）与 `shield`（机体为 {护盾, c5C}，其他为 null）；不按子系统 14 或视角屏蔽，右显示屏的噪点与文字归 P3-13；
      - `radar`：`{ status, contacts }`，`status` 为子系统 12 归一到 0–2（值 3 按 0，原版只判 1 与 2），接触点为 `RadarContact { entityId, offset, class, missile, near, target }`（见[战斗规则](#战斗规则p3-07)的雷达；屏幕投影与噪点归 P3-13）；
      - `resources`：按 `FlightResourceName`（`energy`、`shield`、`charge`、`hull`、`spare-power`）的 `ResourceReading { current, maximum }`：能量 / c54、护盾 / c5C、充能 / c74、船体（原始值，可为负）/ c9C、剩余功率 E / T（D16）；钳位与比例归表现层；`allocation` 为两个档位；
      - `weapons`：列表 0、1 的 `WeaponListReading { index, mount, weapon, ammunition, damage, status }`；`weapon` 为 `WeaponRecordReference { asset, family, index }`（`asset` 是 `craftInfo` 的 Asset ID，`index` 为挂点 +0x14 的记录序号），导弹项的 `ammunition` 为从当前挂点起交替链上的弹药之和（`0x2dd04`），炮为 null；空列表的武器、弹药与损伤为 null；
      - `lock`：`{ level, losing, progress }`，`progress` 按 `0x2e080`（W8）以世界时钟计算：没有当前列表 1 挂点、`losing` 或等级 0、1 时为 −1，等级 4 为 0，等级 2、3 按到期时刻差与当前挂点导弹记录的 +0x34 计算（i32 回绕、带符号除法）；
      - `subsystems`（19 项）与 `leftPage`；
      - 冻结与故障：全部输出深度冻结，位置、姿态与子系统数组为副本。玩家 ID 不能解析或不是机体（`combat.player`）、有玩家实体而没有 `targeting`（`combat.targeting`）、距离的 f32 存储溢出（`combat.distance`）、需要读 +0x34 而当前列表 1 挂点是炮（`combat.lock-record`）或该值为 0（`combat.lock-progress`）都是 `invariant-violated` 故障。
  - **通讯分区（就绪，P3-10，CB-14）：** [communications.ts](../../../src/core/projections/communications.ts) 的 `projectCommunications` 给出 `CommunicationsProjection { readiness: 'ready', player }`，读取不改状态、不抽取随机数。`player` 在没有玩家实体时为 null；已被毁的玩家照常给出。否则为 `CommunicationsPlayer`：
    - `entityId`、`page`（左显示屏页）与 `subsystem`（字段 13，为 2 时不能打开菜单）；
    - `menu`：页在 2–4 且菜单非 null 时为 `CommunicationsMenuView { menu: MenuContentReference, level, partnerEntityId, options }`，否则 null（休眠的菜单不公开）。`MenuContentReference` 为 `{ asset, table }`，`asset` 是 `commMenus` 的 Asset ID；`options` 按显示位置（从 1 起）给出 `{ position, key, value }`，`value` 为建立时的类别、对象（ID、种类、名称引用与 `tone`）、命令（源项与码）或退出项。原版的菜单没有不可用的项，不设 `OptionUnavailableReason`；
    - `incoming`：通道在播放时为 `IncomingView { message, speaker, frame, frameCount, shown }`，`frame` 由世界时钟按通讯呈现子步的方式算出，`shown` 为页 5 正显示它（视角不是 1，且没有在其上打开菜单）；
    - `docking`：`{ subState, dockingObject, docked }`，`docked` 为玩家活动是停靠；
    - `base`：已提交的视角为 6 时为 `BaseServiceView { baseEntityId, rows, cursor, flags }`，`rows` 按行给出 `{ record, selector, state }`（`state` 为 `serviceState`），否则 null；视角 6 而没有基地服务为 `invariant-violated`/`communications.base`；
    - `warnings`：类型 9 仪表的两个指示灯 `{ attackerOnTail, missileIncoming }`。

    不公开：无线电队列、载入中的消息、停靠期限与倒计时、基地的到期与速率（开发诊断经快照读取）；资源与弹药读数沿用 `flight.combat`。全部输出深度冻结、与世界脱离。
  - `map`、`result` 两个分区目前是 `NotImplementedPartition { readiness: 'not-implemented' }`，不以空列表、0 值、全图可见或胜利冒充缺少的规则。各分区的 ready 类型（`MapReady`、`ResultReady`）按 spec 的[分区表](../../plan/p3/02/spec.md#projection-与-render-state)定义。spec 留给负责任务研究的部分是 `never` 占位，负责任务须先按[扩展规则](#扩展规则)修订 spec 定义它们，分区才能就绪：`MapMarkerClass` 与 `MapVisibility`（P3-09）、`ResultReason` 与 `ResultMessageReference`（P3-11）。P3-07 的 `FlightResourceName` 与 `WeaponRecordReference` 已由 CR-12 定义，P3-10 的 `MenuContentReference` 由 CB-14 定义（`OptionUnavailableReason` 与旧的 `CommunicationsReady` 占位已撤销）。
- **Render State**（[render-state.ts](../../../src/core/projections/render-state.ts)）：`RenderState` 为 `{ tick, clock, viewMode, observedEntityId, entities }`，`clock` 为任务时钟（P3-07，CR-12），`observedEntityId` 为玩家实体 ID 或 null；`entities` 是按 ID 升序的可呈现实体 `RenderEntity { id, kindBit, presentation, position, orientation, placementSerial, hitShimmerStart, explosionStart }`。`presentation` 是 CR-02 的表现选择器（见[战斗状态](#实体与世界状态world)），分配时冻结、从不替换；`hitShimmerStart` 为机体的 `hitFeedbackClock`（最近一次受击表现项的时钟），`explosionStart` 为爆炸的 `activationClock`，其他种类与发生之前为 null。受击闪烁与屏幕闪光的条件（玩家、被毁视角、目标在 Warp 中等）由渲染器按原版判断。P3-06 没有改变它的形状。
  - 停放的实体不呈现（原版不为停放对象保留渲染对象）。被毁的实体在移除前仍列出；移除后消失。
  - 新 ID 只用当前位姿；同一 ID 的放置序号变化表示非连续移动（Warp 到达、救援、离港放置，以及停放期间的行进、跳跃与编队跟随），渲染器不跨此插值。P3-10 没有改变 Render State 的形状：离港放置使玩家的放置序号加 1，停靠的实体照常列出，视角 6 中不绘制三维世界归 P3-12（CB-14）。
  - 渲染器之外的消费者不得从 Render State 推导规则信息（地图标记、目标列表等）。两帧保留与跨运行折叠归 P3-04。

### 快照、录制、replay 与比较

- **快照**（[snapshot.ts](../../../src/core/replay/snapshot.ts)）：`World.snapshot()` 返回深度冻结、脱离世界的 `GameSnapshot { format: 'osr-game-snapshot', version: 4, rulesVersion, state }`（`GAME_SNAPSHOT_FORMAT`、`GAME_SNAPSHOT_VERSION`；P3-06 由 1 递增为 2，P3-07 由 2 递增为 3，P3-10 由 3 递增为 4）。
  - `SnapshotState` 是除静态 `setup`、`craftInfo` 与 `ruleData` 外的全部权威状态：`config`（完整内容身份、任务、setupHash、原始难度、组、槽位、僚机、种子、每 tick 单位）、`tick`、`clock`、`rngState`、`nextEntityId`、`entities`（按 ID，含每个实体的飞行状态：最高速度、两个计时、`inWarp`、移动块、AI 初态与编队；P3-07 的战斗状态与表现选择器）、`kindOrder`（全种类遍历的 ID 次序）、`spawn`（`SnapshotSpawn`：缺省后的记录及其声明引用，即别名关系、僚机记录、编组的布局/计数/首成员、队列、开关、池计数）、`missionStatus` 与 `player`（含目标与控制状态，以及 P3-07 的 `targeting`、战斗记录与驾驶舱显示状态），以及 P3-10 的 `flow`、玩家的 `dockingObject`、`communications` 与 `docking`、实体的 `communications` 与 `ai.pendingCommand`、世界的 `communications`、`ai.friendlyFire` 与 `baseService`（CB-16；静态的 `WorldRuleData.communications` 不进快照）。名称占用由持有名称的实体表示。
  - `snapshotText(snapshot)` 与 `snapshotHash(snapshot)`：规范文本按每个类型的显式成员写入器输出，实体按 ID 排序，其余列表保持次序；状态哈希是整个快照（含版本）规范文本的 fnv1a64。写入器的映射类型要求 `SnapshotState` 等类型的每个成员恰好写一次，因此给世界状态或实体加字段而不更新写入器时 `pnpm typecheck` 失败。移动块每个变体一个写入器，战斗状态、表现选择器、碎片到期等联合同样按判别字段分派；增加变体的任务同时加入分派。
  - 快照是诊断与检查点的来源，不是存档；Core 不提供从快照恢复世界的接口（P4）。`takeSnapshot` 为内部函数。
- **`RULES_VERSION`**（[rules-version.ts](../../../src/core/replay/rules-version.ts)，当前为 5：P3-06 由 1 递增为 2，P3-07 由 2 递增为 3，P3-05 合入主线时由 3 递增为 4，P3-10 由 4 递增为 5）：由代码持有，快照与录制只声明制作时的版本，replay 只接受当前版本。凡同一配置、内容与 tick 输入可能得到不同结果的修改都必须递增它：流水线的阶段或次序、数值语义、RNG 抽取或其次序、动作的解释、规则发出的事件或保存的状态。快照或 replay 记录的结构变化递增各自的格式版本；两者都变时都递增。旧组合一律拒绝，不做迁移。P3-06 对规则版本与快照格式版本各递增一次，相对其合入基线计，与并行任务合并时相对主线复核（[P3-06 的 D-07](../../plan/p3/06/spec.md#对-p3-02-契约的增量)）。P3-07 按 CR-14 同样各递增一次（P3-07/11 由首个实现共享形状的子任务递增，此后该 goal 内的规则变化沿用这一版本）；P3-07 合入主线时相对主线复核。P3-10 按 CB-16 对规则版本与快照格式版本各递增一次（P3-10/11 递增，此后该 goal 内沿用），replay 格式版本不变；与并行的 P3-08、P3-09 合并时同样相对实际集成基线复核。
- **录制**（[recording.ts](../../../src/core/replay/recording.ts)）：`createRecordingSession(input, { producer, checkpointInterval })` 与 `createWorld` 一样创建世界（输入同样包含 `craftInfo` 与九项规则数据输入，即 `CONTENT_INPUT_FIELDS`），返回同时是 `World` 的 `RecordingSession`。
  - 会话记录每个成功 tick 实际交给 `step` 的规范输入、全部事件与检查点：tick 0、`checkpointInterval` 的每个正整数倍，以及导出时补上的最后一个 tick（去重）。`producer` 为 1–128（`PRODUCER_MAX_LENGTH`）个 UTF-16 码元的字符串，只作诊断；间隔为正安全整数。
  - `exportRecording()` 返回深度冻结、脱离的 `Recording { record, result }`：`ReplayRecord { format: 'osr-game-replay', version: 2, rulesVersion, producer, content, mission, setupHash, run, checkpointInterval, ticks }`（`ticks[k]` 是 tick k + 1 的输入，稠密数组，`run` 是 `EffectiveRunConfig`）与 `ReplayResult { events, checkpoints, finalTick }`（`ReplayCheckpoint { tick, hash }`）。之后的 tick 不改变已导出的数据。
  - 容量：`requireRecordingCapacity(counts, commands)` 在执行下一个 tick 前检查 tick、命令与事件容量，事件在 tick 执行前未知，所以每个 tick 开始前须至少保留 `eventsPerTick` 的最坏情况容量（最后一个获准执行的 tick 可以用掉这部分并恰好填满上限）；检查点数不另查。超出时以 `CoreInputError`（路径 `recording`）拒绝，世界与录制都不变。
  - 故障：会话锁存世界的 `CoreFaultError`；检查点无法写成规范文本时锁存为 `invariant-violated`/`recording.checkpoint`。此后包括导出在内的每次调用都抛出该故障，不输出貌似完整的前缀。
  - `recordState`、`readProducer`、`readCheckpointInterval`、`readHash` 为内部函数（与 replay 共用）。
- **replay**（[replay.ts](../../../src/core/replay/replay.ts)）：`replayRecord(record, content)`，`content` 为 `ReplayContent`，即 `createWorld` 输入去掉 `run`：`{ mission, craftTypes, wingmanRoster, craftInfo, debrisParameters, projectileVisuals, explosions, explosionAnimations, models, aiPrograms, commMenus, baseRepairItems, commMessages, identity }`（`CONTENT_INPUT_FIELDS`）。replay 格式版本（`GAME_REPLAY_VERSION`）为 2：P3-05 的 `speed-preset` 改变了录制允许的输入形状，由 1 递增为 2；记录形状没有因 P3-06、P3-07、P3-10 改变：机型数据与规则数据输入经 setupHash 绑定，不是记录字段。
  - 先校验整份记录：格式、版本、`rulesVersion`（不同版本即使字段不同也报版本），然后精确字段、producer、内容身份、任务、setupHash 格式、run 的四个字段（取值由世界创建校验）、间隔与 ticks（读取元素前检查长度，累计命令不超过 `recordedCommands`）。
  - 再比较 `contentIdentityKey`，用调用者的内容与记录的 run 创建世界，比较任务与 setupHash；同一声明身份下换了 setup、机型数据或规则数据输入（内容或 ID，外观字段除外）的内容因此在 `record.setupHash` 被拒绝。最后按记录的间隔录制执行全部 tick，返回 `ReplayResult`。
  - 任何失败都抛出，不返回部分结果：记录的问题为 `record…` 路径的 `CoreInputError`（tick 的错误在 `record.ticks[k]`），内容参数的问题为 `content…` 路径；内容 Asset 或身份结构错误保留 `ContentContractError`，Core 故障保留 `CoreFaultError`。
  - `startReplay(record, content)`（内部，P3-06/15）返回校验后的记录与其世界在第一个 tick 之前的初始状态，抛出的错误与 `replayRecord` 在第一个 tick 之前相同；`replayRecord` 调用它。Core 测试在规则的写入者尚未实现时（P3-06 时的 P3-07 目标选择，现在的 P3-08 AI），用它在录制与 replay 两侧以相同的替身改写世界状态，记录本身仍走完整的校验与内容绑定。它不是生产入口，不接受处理器。
- **比较**（[compare.ts](../../../src/core/replay/compare.ts)）：`compareReplayResults(expected, actual)` 先校验两侧（字段、`finalTick` 与检查点的容量、检查点从 0 严格递增到 `finalTick`、哈希格式、事件按 `DomainEvent` 联合逐字段（`speed-matched`、`target-changed` 按 `origin`，`Attacker`、`ShotTrigger` 等按 `type` 区分变体）、事件 tick 不减且在 1–`finalTick`、每 tick 事件数、命令结果与事件总数），坏的一侧以 `expected…` 或 `actual…` 路径的 `CoreInputError` 拒绝。返回 `ReplayComparison`：`{ match: true }` 或 `{ match: false, tick, kind }`，`kind` 为 `events`、`checkpoint` 或 `length`。
  - 一个 tick 内的次序（`TickOrder`，每 tick 复位）：命令结果的 `commandIndex` 从 0 连续；固定阶段的事件所在的阶段不倒退（速度辅助 → 命令 → 其他对象的更新 → 请求处理 → 能量 → 停放更新 → 帧尾）：请求处理中的手动匹配、自动选敌的 `target-changed`、非命令的 `shot-fired`、`missile-ended`、`explosion-started`、`fragment-expired` 与 `source-released`，能量阶段的 `energy-depleted`，停放更新的 `object-left-world`，帧尾的 `target-cleared`（每 tick 至多一个）；`hit` 与 `object-destroyed` 从对象更新起可出现在多个阶段，只关闭更早的阶段。速度辅助的事件每 tick 至多一个；`speed-assist-toggled`、`energy-allocation-changed` 与带命令的 `weapon-selected`、`left-page-changed` 紧随同一命令的结果；手动匹配的 `speed-matched`、命令的 `target-changed` 与命令的 `shot-fired` 在其命令结果之后；每条命令至多一个附加事件（发射不计）。导弹造成的 `hit` 须在同 tick 中该导弹的起爆之后；`object-destroyed` 须在同一实体同 tick 的 `hit` 之后，每个实体每 tick 至多一次，此后同 tick 不再有对它的 `hit`（P3-07/24；只在 tick 内检查，留给 P3-11 的救援复用玩家 ID）。`object-instantiated` 与没有命令的选择或页面变化不参与排序。
  - 共有的 tick 内先比事件再比检查点；较短运行末帧单独附加的尾检查点，在较长一侧没有对应采样时不算差异；共有部分一致而长度不同时，在较短运行的首个缺失 tick 报告 `length`。
  - 报告的是最早**可观测**的分歧，不是首次内部状态偏离：间隔大于 1 时，两个检查点之间已恢复的差异观察不到；没有可观测影响的输入改动不算分歧。

### 上限

`CORE_LIMITS`（[limits.ts](../../../src/core/contracts/limits.ts)）是冻结的有限常量，保护内存与时间，不是原版玩法上限：原版分配器没有规则层面的上限，内存耗尽即结束程序（[对象表](../../original/formats/executable.md#runtime-object-table-p3-0201)），所以项目的故障预算没有原版对应物。调用者不能提高它们。依据以所选任务的规模（9 条记录、3 个编组，排程数十个实例）与默认 32 tick/s 计：

| 名称 | 值 | 依据 |
|---|---|---|
| `commandsPerTick` | 64 | 大于命令联合的 42 种不同命令（`map-point` 按操作计），一个 tick 可以请求全部 |
| `entities` | 2,048 | 现存实体，含运行中产生的弹丸、爆炸与碎片；超过所选任务实例数的 50 倍，每个按 1 KiB 计为 2 MiB |
| `spawnExpansion` | 1,024 | 一个世界由声明可排程的实例数（请求数 × 成员数之和）；超过所选任务的 25 倍，为 `entities` 的一半 |
| `eventsPerTick` | 32,768 | 防失控预算（CR-14，P3-07 由 4,096 提高），不是原版上限。P3-07 的 `hit` 有二次项（起爆与范围伤害对范围内的每个机体、碰撞的 A 组 × 活动机体、停放多目标的候选数），所以按宽松的切片规模同时取最坏值：机体 32（A 组 24）、挂点 256、命令 64、同时开火链 4、存活弹丸 512、导弹 32、碎片 256、爆炸 64，同 tick 被毁、起爆与范围伤害各 32，到期或击落的碎片 256，交战的停放对象 32 个各 32 个候选。P3-07 的事件合计 7,075（`hit` 5,472），P3-02 与 P3-06 的项（命令结果 64、附加速度事件 64、辅助事件 1、实例化按 `spawnExpansion` 1,024、离开世界 32）1,185，总计 8,260，上限约为其 4 倍。实体上限下二次项没有固定上界，超出即故障（[P3-06 的容量核算](../../plan/p3/06/spec.md#检查点-a-定稿的状态与契约)） |
| `requestsPerTick` | 16,384 | 每 tick 的请求投递数（CR-14 新增，此前借用事件上限）。上述规模下：`select-target` 65、发射 512、每个存活对象自身更新至多 2 个（爆炸待移除时的释放与离开、第 0 部件碎片的交接与到期）2 × 896、`steer` 64，加 P3-02、P3-06 的生成请求 1,024 与速度请求 66，合计 3,523，上限约为其 4.6 倍 |
| `radioQueueItems` | 4,096 | 无线电队列的项数（P3-10，CB-16）。原版无界，这是防失控预算，超出为 `budget-exhausted`（radio.ts），不静默丢弃。不受限频约束的入队都由被毁触发，被毁对象受 `spawnExpansion` 约束；可无限重复的只有对命令的回复，每次至少 3 个菜单键，按原版每次轮询一键、人以每秒 4 键持续查询，队列净增约每秒 0.9 条，到上限需 1 小时以上（开发录制上限为 68 分钟）。测试覆盖 limit 与 limit + 1 |
| `recordedTicks` | 131,072 | 一次录制或 replay 的 tick 数，默认速率下 68 分钟，是切片任务的数倍 |
| `recordedCommands` | 262,144 | 平均每 tick 2 个命令，例如每 tick 按住开火再加一个动作 |
| `recordedEvents` | 524,288 | 平均每 tick 4 个事件；每个约 120 个 JSON 字符，至多 64 MB。每个 tick 前须保留 `eventsPerTick` 的容量，所以 P3-07 之后可用的事件总量为 524,288 − 32,768 = 491,520（约少 6%）；战斗中每 tick 的事件通常为个位数 |
| `recordedCheckpoints` | 131,073 | tick 0 加每 tick 一个，所以间隔为 1 也装得下 |
| `canonicalTextLength` | 16,777,216 | 实体达上限时的快照：机体数受 `spawnExpansion` 限制（≤ 1,024），带 P3-07 的战斗状态、每个机体 18 个挂点时约 8.5 KiB，其余实体约 2 KiB，合计约 10.5 MiB（CR-14）；P3-06 的飞行状态在最长写法下约 1.5 KiB |

- `fitsLimit(name, used, added)` 与 `productFitsLimit(name, count, each)` 在不形成和或积的情况下判断是否超限，对非安全整数一律返回 false；容量在分配或执行之前检查。
- 请求由 `requestsPerTick` 约束（CR-14；P3-02 时借用 `eventsPerTick`，见 [goal 执行记录](../../plan/p3/02/goal.md#执行记录)）。P3-02、P3-06 的项：一个世界一生至多投递 `spawnExpansion` 个生成请求（空编组的请求也计 1），每个现存实体的更新每 tick 至多投递一个生命周期请求（可用的玩家不投递），玩家更新每条速度命令至多投递一个 `control` 或 `match-speed` 请求，另加辅助的恢复请求与单独的轴请求各至多一个：实体上限下 2,048 + 1,024 + 64 + 2 = 3,138。P3-07 的项见上表；延后的发射请求在 `defer` 时立即计数。区域检查与离开世界直接写状态，不经请求。
- P3-10 的项（CB-16）：每 tick 新增事件约 600（`radio-queued` 约 300，受限频与被毁数约束；命令附带的事件各不超过命令数 64；`docking-requested`、`base-navigated`、`base-confirmed` 同；`radio-taken`、`incoming-started`、`incoming-ended`、`docked` 各 ≤ 1；`departed`、`transition`、`docking-cancelled`、`radio-flushed` 各 ≤ 2），与 P3-07 的合计仍远在 `eventsPerTick` 之内；新增请求至多 64 + 1 + 2 + 64，在 `requestsPerTick` 之内；队列在上限下使快照文本增加约 0.8 MiB，每个实体约 60 字符，在 `canonicalTextLength` 之内。比较器对 `incoming-started.frameDurations` 每条消息至多 32 帧（compare.ts 的 `MESSAGE_FRAMES`），不小于内容读取器的上限 `COMM_MESSAGES_LIMITS.frames`（8，P3-10/29），有测试核对两者的关系。
- 规则的请求或事件若会进一步扇出，由其任务推出自己的上界、计入已有的项并按 spec 修订 `CORE_LIMITS`。单 tick 的二次工作量（命中检测、起爆、碰撞、停放多目标）受实体上限约束，不另设上限。
- [budget.test.ts](../../../src/core/replay/budget.test.ts) 以真实流水线在实体上限下核对 P3-02、P3-06 的事件与请求项及快照文本长度（P3-06 的飞行状态量到战斗状态之前）；[combat-chains.test.ts](../../../src/core/systems/combat-chains.test.ts) 以真实流水线核对 P3-07 的上限：32 个导弹同点起爆各命中 1,023 个机体加 32 个 `missile-ended` 恰为 32,768 个事件，多一个即 `pipeline.events` 故障并锁存；A 组 181 个机体互相接触（32,580 个 `hit`）与停放多目标 181 × 181 通过，182 故障；实体表恰满时各种效果的创建与多一个时的 `entities.count` 故障；请求在 16,384 处的边界。增加预算项的任务同步其中的上界。

### 扩展规则

规则按 spec 的[扩展规则](../../plan/p3/02/spec.md#扩展规则)接入，不获得自行扩展共享 API 的授权：

- **必须先修订 spec 的情形：** 新增或改变实体字段或种类、`Command`/`TickInput`、`DomainEvent` 或命令原因码、projection 分区的形状、Render State、快照或 replay 记录的形状、阶段或其次序、事件可见的时机，以及其他公开语义。修订须同步受影响的下游 spec 并取得批准；只在下游 spec 或本文件记一笔不够。不得用开放索引签名或 `unknown` 载荷绕开契约。
- **由下游 spec 自行批准的情形：** 把已约定的分区从 `not-implemented` 变为真实数据，实现既定动作的效果，填充自己阶段的 `run`，在实体初始化扩展点按 Q-07 次序加入初值与抽取。内部 helper 的变化不需要重审 P3-02。
- **代码上的落点：**
  - 阶段：在 `PIPELINE` 中给自己的阶段提供 `run`，不新增回调或订阅；改变阶段表本身须修订 spec。已由其他任务接入的阶段在其代码注释标出的位置扩展（例如 `movement` 的模式分派、`parked-update` 的停放 AI、`area-check` 的玩家 Warp 中心、`frame-end` 中 P3-07 显示步之前的 P3-09 规则）。P3-07 规则中其他任务的固定调用点（CR-13）见[战斗规则](#战斗规则p3-07)末尾：负责任务在模块注释标出的位置插入静态调用，不建空函数或待处理标志。
  - 命令：在 [systems/commands.ts](../../../src/core/systems/commands.ts) 的 `judgeCommand` 中按命令类型分派到自己的规则模块（P3-06 自己判定的命令在 [systems/flight-control.ts](../../../src/core/systems/flight-control.ts) 的 `judgeCommands` 中），替换对相应命令类型与上下文的 `not-implemented` 判定；命令的附加事件紧随其结果发出；新增拒绝或忽略原因须修订 spec 并加入 `COMMAND_RESULT_REASONS`。玩家可用、上下文与读回推算的既有规则见[飞行控制、运动与停放](#飞行控制运动与停放)。
  - 实体字段：加入 `Entity`/`EntityInit` 与快照写入器（类型检查强制）；无模型的运行时种类加入自己的 `EntityPresentation` 变体，未实现的种类没有构造入口。`MovementBlock` 的新变体同时扩展 entity-table 的 `isValidMovement` 与 `copyMovementBlock`、快照写入器按 `mode` 的分派，以及 `moveEntity` 的分支（缺分支不能通过编译）。新的运行时种类同时加入 `EntityCombat`、`combatTypeOf` 与实体表的校验。
  - 事件：加入 `DomainEvent` 联合与 compare.ts 的事件字段表（类型检查强制），并补比较的校验；有 tick 内次序的，同时加入 `TickOrder` 的阶段；App 的事件总线（`EVENT_TYPES`）与开发事件日志随之列出。
  - 请求：加入 `Request` 联合与 `handleRequest`，形状为封闭纯数据，投递数遵守[上限](#上限)。浮点操纵消息 0x40000 已由 P3-07 以 `steer` 加入（目前只接受导弹为主体，P3-08 为 AI 机体扩展它的应用）；Warp 离场消息 0x800000 由其第一个投递者加入。
  - 任务状态：P3-11 扩展 `MissionStatus`，并在 P3-10 的 `flow` 上加入主流程状态与子状态 1、2、6（CB-02），不另建流程状态。
  - 通讯：其他任务经 P3-10 的入口入队、清空与修理（`queueRadio`、`queueLine`、`flushRadio`、`fullRepair`、`clearCommunicationLimits`），不另建队列或修理实现；`radio-flushed` 的新原因按扩展规则加入。
- **版本：** 每次规则结果可能变化时递增 `RULES_VERSION`，结构变化时递增相应的格式版本（[快照、录制、replay 与比较](#快照录制replay-与比较)）。
- **数值：** 新的 f32 写回用 `Math.fround`，浮点转整数向零截断，非有限的写回为故障；定点或查表须有原版证据（[总计划 §5](../../plan/master-plan.md#5-状态管理与通信约定)）。

### 已知差异

以下差异已公开，不是“与原版一致”的声明。新版与原版的对照结论：P3-02 的 R-01 至 R-03 见 [P3-02/11 的完成证据](../../plan/p3/02/subtasks/11-comparison-docs-handoff.md#完成证据)；P3-06 的 R-04、R-05 由其[子任务 18](../../plan/p3/06/subtasks/18-comparison-verdicts.md) 按检查点 B 的判据给出，在此之前不声明运动与原版一致；P3-07 的 R-06 至 R-10 由其[子任务 27](../../plan/p3/07/subtasks/27-comparison-conclusions.md) 按 [D-02 的判据](../../plan/p3/07/spec.md#d-02-连续行为判据)给出，真实内容的核对归[子任务 25](../../plan/p3/07/subtasks/25-real-content-check.md)，两者的结论见下文“P3-07 的对照结论”；其余 P3-07 条目记录研究与实现中得出的差异。P3-10 的 R-17 至 R-19 由其[子任务 26](../../plan/p3/10/subtasks/26-comparison-conclusions.md) 按 [D-02 的判据](../../plan/p3/10/spec.md#d-02-连续行为判据已批准)给出，真实内容的核对归[子任务 24](../../plan/p3/10/subtasks/24-real-content-check.md)，见下文“P3-10 的对照结论”。

- **时间：** 32 Hz 固定步长是项目选择。原版每帧取 0、2、4 或更多时钟单位，游戏时钟相对模拟器时间偏慢且依赖 cycles（[B-006](../../original/behavior/B-006-simulation-timing.md)，U-021 未冻结）；Core 不模拟零步长帧与这一速率。G-02 占位期间不推进、结束后不补计时间；这也适用于运行中的入港与离港（G-02/3、G-02/4，P3-10 技术决定 1）：原版的 `LANDING`、`LAUNCH` 过场在一帧之内阻塞，其用时计入下一帧的步长，使其他对象一次前进这段时间，Core 不计这段时间，停靠倒计时、无线电与服务只按规则时间推进。原版取样从随机值起算，依赖绝对取样值的规则由负责任务显式建模。原版首轮队列检查的原点包含构建与过场用时，Core 在时钟 2 的第一个 tick 实例化时刻 0 的项。依赖帧数或步长的规则由各自任务按 B-006 对照。
- **运动的步长与时刻：** 运动以固定步长 `clockUnitsPerTick` ÷ 64 秒积分，停放更新的到期与行进长度按时钟单位计，原版用每帧可变的步长与取样；持续运动、反复到期与组合机动的累计偏差由 P3-06 的 R-04c 按事先批准的误差预算判定。定时旋转以 f32(任务时钟 ÷ 64) 判定到期，原版以 f32 的绝对取样秒判定，原点不同，到期帧不能逐位重现。运动步长须能表示为 f32：超过 2^25 单位/tick 的合成配置在运动阶段故障，P3-02 的运行配置契约未改。
- **表现就绪：** Core 在实例化时视表现为就绪，从不进入 `awaiting-presentation`；原版等待异步载入的时长未追踪。
- **输入：** Core 逐 tick 处理命令数组；原版每次轮询最多处理一个键，其余丢弃（[输入轮询](../../original/formats/executable.md#input-polling-p3-0201)）。原版没有键盘操纵（俯仰、偏航、横滚只来自摇杆，[飞行操纵与旋转](../../original/formats/executable.md#flight-controls-and-rotation-p3-0602)）；项目轴作为原版整数路径上的数字摇杆进入同一路径（P3-06 检查点 A），每 tick 读取轴快照，不模拟原版设备的轮询到期。地图与基地上下文中有效手动轴为 0（有意差异，原版在这两个上下文不读设备、已施加的转向继续），计入 R-04c；速度命令与 P3-07 的开火、选目标、选武器与能量命令在地图中都得到 `wrong-context`（P3-07 的部分见下文 CR-11 的差异 8）；地图模式本身随 P3-09 实现。P3-05 的物理键到 `code` 与浏览器拦截在 UI/平台边界处理，不属于 Core 证据；绑定表提交的命令到达 Core 不代表对应规则已交付（尚未接入的见下文“分阶段接入”）。飞行中切换灵敏度（F11，G-10）与自动驾驶（`a`，G-09）不提供：灵敏度固定为 Medium，速度辅助总走自动驾驶关闭的分支。
- **项目规则（P3-06）：** 以下情形原版没有可复现的行为或与项目边界不兼容，按检查点 A 的项目规则处理：
  - 非整数的轴值按 × 128 向零截断成偏转，绝对值不足一个刻度的非零轴值为 0；
  - 同 tick 多条速度命令按数组顺序全部处理，后一条命令的读回计入前序命令的推算效果，因此“增、增”等于原版相继两帧各按一次；原版 `+`/`−` 与待发送值的比较在实际中从不成立（高概率），Core 不实现；
  - 手动匹配经 `match-speed` 请求在请求处理中写入，原版 Enter 在按键处理中直接写移动块；每 tick 至多一条速度命令时结果相同。P3-07 已复核：它在对象更新与请求处理之间的指令速度读者只有同一命令批次中的档位键（`0x21d88`），由逐条读回的折算处理（见下文 P3-07 的项目规则）；发射构造只读发射者的当前速度。P3-08 加入读者时再复核；
  - 油门表索引越出表时钳到表内（原版在上限降低后的 `−` 可读到表外的未定义内存）；
  - 停放 Warp 的计时按精确整数计算：负的 +0xA8 或 +0xA8 + +0xA4 使过境在首次检查时结束、不推迟 Warp；原版对绝对计数器的 u32 样本按无符号比较，只在计数器小于该持续时间的绝对值时回绕而不同。切片的机型记录没有负值；
  - 玩家的控制状态在实例化时建立，原版在下一帧的首次回调中建立；状态 7 之前没有读者，可观察结果相同（项目映射，高概率）；
  - 通讯菜单打开时 `select-number` 归菜单（P3-10 已在命令判定中加入优先级）；档位是独立的 `speed-preset`，菜单打开时照常生效，与原版档位键一致（菜单只占用数字与字母，见键位表的[通讯菜单与能量页](../../original/input/key-map.md#通讯菜单与能量页)）。
- **分阶段接入（消费者已交付，写入者尚未接入；P3-05 已交付游戏输入消费者，Core 规则仍按后续任务接入）：** 以下不是对应规则的替代，也不能写成已与原版对照：
  - 最高速度在实例化与档位改变时按实时的能量状态重算（P3-07，`speedLimitStatus` 为 `'live'`）；救援的重算归 P3-11，受损与修理不重算（D6）；
  - 非玩家飞行器在 P3-08 交付前按实例化时的移动块运动（沿第三行直线前进）；停放对象按实例化时的 AI 状态行进，AI 程序对 AI 状态的改变、对象目标与 Warp 离场请求归 P3-08；
  - AI 不开火、不选目标、不施加范围伤害（P3-08）：只有玩家开火，P3-07 的 AI 开火入口、自动挂点与 `steer` 的机体应用只由测试驱动；机体的 `ai.objectTarget` 目前只由停放多目标交战写入；
  - 冲量、定时旋转、操纵锁定与扰动已由 P3-07 写入（碰撞、导弹震动、能量耗尽、子系统 7）；清除者是修理与救援：P3-10 的基地修理（子系统 7 复位扰动与锁定）与完全修理（复位扰动）已接入，P3-11 的救援尚未接入；其他情形下锁定与扰动保留到移动块重建（例如停放后恢复）；
  - 玩家 Warp（模式 3 的触发、Warp 期间的区域中心、Warp 开始时清除目标）归 P3-09；
  - 地图 same-tick 飞行命令门禁及地图光标点的 Core 效果归 P3-09；基地中打开地图（服务步在视角 8 中停止）的触发归 P3-09；生产地图几何及原版光标外观归 P3-13，输入层/Core 完整地图联合验证归 P3-15。
  - 停放更新中的 P3-08 停放 AI 尚未接入（P3-10 的僚机到达基地与 `0x3c3b0` 已接入）；P3-08 接入之前僚机不消费命令、不回复、不随 AI 返回基地，尾随检查的攻击者条件恒为假；
  - P3-07 规则中 P3-11 的固定调用点（CR-13：对象事件与任务计数、被毁视角、救援、信标、发射门禁）尚未接入（通讯反应已由 P3-10 接入）：玩家被毁后照常延迟爆炸、产生逃生舱并在舱到期时清除跟随，之后玩家停在被毁源状态，任务状态仍为 `built`，Core 不伪造救援、计数或失败。停靠中被毁时 `0x32d74` 对停靠对象、视角与无线电的处理也随 P3-11 接入，在此之前玩家保持停靠。
- **P3-07 的对照结论（[子任务 27](../../plan/p3/07/subtasks/27-comparison-conclusions.md#结论2026-10-14final5取代下文全部较早状态)、[子任务 25](../../plan/p3/07/subtasks/25-real-content-check.md#完成证据)）：**
  - **适用范围：** 只在下列条件下成立，不推广到其他配置、其他内容或其他候选。
    - 原版：36 次 `complete` 运行，DOSBox-X fixed 40000 cycles。U-021 未冻结，冻结配置不同时须重测。
    - 新版：候选 `src/` 树 `13a62b952b037889f6311cd43016b8a2e7c2b5de`，默认步长 2 单位/tick。
    - 内容：`manifest:sha256:ac3bdb9c87c9fe4ea74505397b550619209d8204da9e40b3f065b5e77537b9ba`，来源 `source:sha256:fd97bcea3c3aee835c9058419469786587a4580e96b431bb9ce9c127ff2181be`。
  - **连续行为（D-02）：** 六类都判为一致：主炮射击节奏、导弹锁定、能量护盾与充能、弹丸寿命与射程、毁伤时间链、导弹飞行与制导节奏。依据：原版每个成立窗口都有通过跨版本核对的新版配对，离散结果同时满足。这里的“一致”指在 D-02 的容差与可变帧步长下一致，不是逐帧重现（见下文“P3-07 的步长”）。
  - **单次转移（R-06 至 R-10）：** 812 个样本中没有 `differs` 或 `outside-support`；spec 的逐项最低覆盖都由可判定样本满足。操作数不全的样本列为不可判定，不计为一致，主要是：碎片与基地接触缺姿态、停放交战与船体伤害缺伤害操作数。R-10 只判定 Core 的部分。
  - **真实内容（25）：** 在 25 的候选（`src/` 树 `35f23733…`，四次确定性运行）与同一内容身份上，四次运行全部通过，没有发现差异。
  - **不一致与修复：** 无不一致，没有新增修复子任务。
  - **未测或只有单边证据的分支：**
    - 停放交战领队 +0x8C 的分支：以代码证据核对。
    - 基地自动挂点的连续 AI 节奏与僚机的 AI 发射：随 P3-08。
    - 逃生舱变体、永不到期的大碎片、被击落碎片的完整链、速度匹配目标。
    - CR-11 的表现层部分：不在 Core 中，见下一条。
- **表现层的归属与已批准的差异（P3-07，CR-11）：** EXPL 的选择（建造期的 EXIC 子集、每次激活的项、变体 `other` 按相机距离改用列表 1）、额外爆炸（`0x23fdc`）、事件 `0x10` 与判别值 1、2 的碎片及其到期再爆炸、闪光（`0x24314`）归表现层（P3-12、P3-14），由 `explosion-started` 与 Render State 驱动，用表现层自己的相机与随机源。研究证实目标、雷达、开火、AI、能量、区域检查、生成与主流程都不读相机（C1），所以 Core 没有逻辑相机或视口状态。依研究结论按推荐方案批准的差异：
  1. 上述效果的抽取不在世界 RNG 中，产生的对象不在实体表中：Warp 出口的最近对象搜索（`0x2bf08`，P3-09）看不到它们，实体预算也与原版不同。原版中这些效果只经对象表、一次到期再爆炸、该搜索与共用的随机数影响规则（X10）。
  2. 原版的规则与表现共用一个 C 随机数生成器，雷达、显示屏、仪表与 HUD 每个渲染帧都抽取；Core 只复现规则抽取的支持集与条件概率，表现的随机在 Core 之外。
  3. 结果对规则没有影响的抽取不在 Core 中执行，例如爆炸首次回调中非机体来源的模式 0 事件抽取（X4）。
  4. 状态显示步忽略子系统 10 为 1 时的闪烁暂停，只在固定的视角集合中运行；右显示屏的清除每 tick 判定，原版按仪表周期判定（CR-10）。
  5. 对象更新（AI 路径）中创建的碎片早一 tick 激活（冲突 21）。
  6. 追踪导弹的接触对象初始为空，原版可能是旧值（冲突 41）。
  7. 雷达接触点至多 120 项（含目标框），不复现原版越过缓冲区的写入（冲突 4）。
  8. 开火、选目标、选武器与能量命令只在飞行上下文处理，其他上下文为 `wrong-context`；原版在地图、Warp 与基地中仍按设备读到的最后一个主扳机电平开火（[输入轮询](../../original/formats/executable.md#input-polling-p3-0201)），Core 与 P3-02、P3-06 的上下文屏蔽一致。
  9. 挂点的 `lastShotClock` 初值为 null，冷却视为已到期：原版为 0，但原版时钟从一个随机的较大取样值起算，首发实际上从不被冷却挡住；Core 的时钟从 0 起，以 0 为初值会在开局几 tick 挡住首发。
  10. 两种会使“已尝试”标志跨调用保留的挂点链排列在世界创建时拒绝（CR-01 检查 4），每次扳机调用的标志都从空开始。
- **项目规则（P3-07）：** 以下情形原版没有可复现的行为、与项目边界不兼容或切片数据不可达，按实现时的推荐方案处理（依据见各子任务的完成证据）：
  - 原版把负的计时值按 u32 回绕成遥远的期限，项目在世界创建时拒绝它们：可达炮的负 +0x24（弹丸寿命）、可达导弹的负 +0x44（制导寿命；原版的回绕使导弹立即熄火）与内置程序记录 1、2 的负更新周期（P3-07/24、34）。合成夹具 `missile()` 的寿命默认为 320；真实内容的核对归 25。
  - 运行中仍可能越界的计算是 Core 故障，不复现原版的回绕或未屏蔽的异常之后的行为：锁定期限为负、冷却与各到期时刻越过安全整数、停放交战的经过时间 ≥ 2³²、浮点转 i32 越界（`FISTP`）、f32 存储溢出、带符号除法的除数为 0 或商溢出。
  - 放在列表中的自动炮（+0x28 = 2）沿发射者的行发射（原版读消息池中的残留字节）；只有炮挂点可作自动挂点；列表 1 的首个有弹挂点是炮时不驱动锁定，锁定进度要读该炮的 +0x34 时为故障（原版越过 48 字节的炮记录读取）。切片中没有机型在列表 1 放炮（W2）。
  - 同 tick 的档位键与油门命令：档位键之后的 `+`/`−` 读到 `0x21d88` 改写后的指令速度，与原版相继几帧一致；档位键之前已投递的油门请求在请求处理中按新的最高速度应用（例如同 tick 的 [−, S]），与“已投递的请求不被后来的命令改写”一致，作为同 tick 的残余差异接受（P3-07/16）。
  - 开火读取命令处的参照目标，发射请求保存自己的目标：原版的扳机读旧目标、导弹构造读同一帧应用后的新目标，两者只在同一帧既选目标又开火时不同（冲突 35）。玩家开火命令的发射请求排在 P3-06 的请求之后（P3-07/14），只影响一个 tick 内的请求与事件次序。
  - 发射者已不能解析的发射请求不创建任何东西（原版会读已清除句柄的位姿）。碰撞后的自动驾驶取消 `0x27edc(0)` 不执行（G-09，P4）；摇杆选目标键（+0x1B0）没有对应命令；作弊标志在 Core 中不存在。
- **P3-07 的步长：** 弹丸的命中线段是一个 tick 的位移，快速横穿弹道的目标在 1/32 秒步长下可能两步都漏过、在更小的步长下被命中；规则与原版相同，差异只来自步长，原版在相同的帧步长下同样漏过（P3-07/17）。碎片的自旋每次移动转过固定弧度、不乘步长（H1），所以每秒的转角随帧率变化，固定 32 Hz 与原版的可变帧步长不同。能量更新、锁定、自动选敌、计时块与显示步的到期按时钟单位计，在 tick 边界上判定。这些按 D-02 的判据对照。
- **P3-07 依据的高概率结论：** 实现依据的原版事实大多为已确认（代码）。以下为高概率或适用范围有限，依据见 executable 的相应小节：对玩家的交接只投递一个隐藏玩家模型的表现项，所以 `source-released` 的 `removed` 为 false（X7，交 P3-12）；第 0 部件碎片在交接前被区域检查移除、来源停在状态 4 直到拆除的情形罕见（X7，冲突 20）；AI 转向库的噪声例程对导弹不启用，追踪路径唯一的抽取是热寻的放弃（H5）；`0x27edc(0)` 的作用是取消自动驾驶（H6）；玩家状态 +0x3C、+0x44 是弹丸与导弹的命中统计（H4）；两位字段的子系统含义（D6；规则只按字段号使用）；AI 发射的制导导弹锁定字节为 0（W8，交 P3-08）；EXIC 子集在首次爆炸激活之前载入完成（X8，交 P3-12）。无制导导弹的引信间隔取减半分支只对所测配置确认（运行时读数，H5），P3-07/26 在正式运行中复核。
- **P3-10 的已批准差异与项目规则**（CB-17、[D-03 定稿](../../plan/p3/10/spec.md#d-03-定稿已批准)、[P3-10 技术决定](../../plan/p3/10/spec.md#技术决定)）：
  1. 来电的载入延迟固定为一 tick（原版取决于 IO，基准两次观察都是一趟渲染）；只建模基准设置（GAMEHIRES 为真，`COMMFACE.NOB`），不支持 LO（`COMMFAC2.NOB` 的消息时长不同，并有停靠中、视角 1 时不调用回调的纯文字分支）。媒体本身不播放，但消息选择、通道忙闲、回调时刻与抽取照原版；“导入内容缺少媒体”不等于原版的“档案未打开”（D-03 第 1、3、5 条）。
  2. 通讯对象以 `EntityId` 表示，对象移除即失效；原版不计引用，节点可能被新对象复用（决定 1）。
  3. 子状态 3–5 中停靠对象为 null 是 Core 故障；原版视其为有效，但正常流程不可达（决定 3）。
  4. 尾随警告：攻击航线字节属于 P3-08 的 AI 处理器，P3-08 接入前该条件不成立；Core 在视角 0xC、0xD、1、6 中每 tick 判定、由内部计时门控，原版按仪表记录的周期调用（决定 11，与 CR-11 差异 4 同类）。
  5. 页 2–5 在字段 13 为 1 时的干扰闪烁不复现（决定 12）；页 5 没有条目时直接回到页 0，省略原版三次绘制失败的中间调用（D-03 第 3 条第 4 点）。
  6. 无线电队列的到期按数值排序；原版以有符号 i32 比较，只在约 388 天后不同（决定 16）。原版的 u32 回绕与以 0 表示“未盖戳”也不复现：到期是安全整数时钟，未盖为 null（CB 的记法）。
  7. 菜单只能用数字与 `x`（`select-number`、`communications close`），世界创建拒绝会生成字母键或超过 9 个生成键的任务（CB-01 检查 1、2，技术决定 3）；所选任务满足。
  8. 离港放置的放置序号是项目字段（原版没有对应计数）。

  照原版保留、不算差异的：码 9 在对象失效时仍进入等待（决定 2）；菜单不刷新（决定 4）；同 tick 两次离港（决定 6）；停靠中的漂移与由此引起的自动离港（决定 7）；显示次序即服务队列（决定 10）；入港的背景抽取与船体步的抽取，以及基地内改变的列表选择与锁定等级在离港后保留（决定 14）。
- **P3-10 的对照结论**（[B-004 的对照结论](../../original/behavior/B-004-base-communications.md#对照结论p3-1026)、[子任务 26](../../plan/p3/10/subtasks/26-comparison-conclusions.md#完成证据)、[子任务 24](../../plan/p3/10/subtasks/24-real-content-check.md#完成证据)）：
  - **适用范围：** 原版为 P3-10/25 的 8 次合格运行（`fixed 40000` cycles、基准媒体设置，U-021 未冻结）；新版为候选 `src/` 树 `de703f104060789bf6c59f40e83828edb36f1130`、默认步长 2 单位/tick，本地导入内容（切片定义版本 5）。冻结配置不同时须重测。
  - **一致：** 普通状态查询与停靠回复的来电时间链、停靠时间链、期限取消（限于档案不可用变体）、修理、船体与能量步；菜单、按键与距离门禁、入港写入、距离内的带僚机停靠、离港与自动离港、基地按键、服务步、离港后的首次能量更新与通讯反应的四种分支等单次转移。没有不一致项，没有修复子任务。
  - **未运行对照与限定结论**（spec 修订 2、3，不写为一致）：停靠等待中对象失效的取消、活动僚机在距离外时的停靠、通讯反应与报告的其余分支、受攻击的状态查询的来电时间链，以及 RQ2 威胁判定的原版一侧，只有代码证据与 Node 独立期望。新版基地中没有地图（P3-09）、僚机没有 AI（P3-08），相应转移只在单次转移层判定。
  - **真实内容（24）：** 两种僚机配置的 4 次私有正式 World 运行通过；船体补给、僚机停靠与恢复、1000 门禁边界附近未覆盖，交公共测试与 25、26。
- **随机数：** 不复现原版序列。每次 rand() 取世界 RNG 一次抽取的高 15 位，相邻调用按独立均匀建模（原版 LCG 相邻值的联合分布未分析）。概率为 100 时原版仍掷一次 rand % 100，Core 不抽取。P3-06 与 P3-07 已在原版的相对位置加入 `0x3060c`、`0x68050` 与 +0xC8 的实例化抽取，以及战斗规则与 P3-07 的停放交战的抽取；P3-10 已加入头像分配、通讯反应、入港背景与船体步的抽取（D-03 第 5 条，BS6）；`0x20990`（P3-08）、AI 与停放 AI 的抽取加入之前，以及表现层的抽取（CR-11 的差异 2）始终不在 Core 中，Core 的抽取次数与原版不同。
- **僚机记录：** 原版每次程序运行只在首次排程时填写 SCCT 僚机记录的缺省值（含随机的 +0x78），其 +0x18 计数跨任务累计；Core 每个世界重新填写、重新计数（重试就是新世界）。
- **未表达或未实现的分支：** +0x80（战役简报前的抛硬币）内容契约不能表达，切片未用；实例化后的扇区资源测试 `0x6a0b8`/`0x6a11c` 何时失败未确认，Core 视为总是通过，停放行进提交位置（`0x6a2f8`）时的扇区资源测试同样总是通过；主流程状态 1 不实例化的门禁（`0x339cc`）随 P3-11 的主流程状态加入；网格路线与固定高度种类在创建时拒绝。P3-06 另有：`0x68050` 经记录 +0x4C 的路径路线取目标点的分支不可达（内容契约拒绝该字段），所以 Core 中一次调用至多抽取 2 次；移动块的模式 4 在类型上不可构造（P3-09 加入；模式 1、2 已由 P3-07 加入）；HUD 闪烁计数器不在 Core 中，速度辅助写入失败（目标没有移动块）时不发 `speed-matched`，原版此时仍可能启动闪烁，只影响表现；驾驶舱读取的第三行角速率（`0x21cf8`）不在运动 projection 中。
- **数值：** Core 的 f32 写回一律就近舍入，与两次合格原版运行中 77 个能区分两种舍入的放置一致（[B-007](../../original/behavior/B-007-mission-instantiation.md)）；原版代码推论的“渲染后向零”与此矛盾，原因未查明，重试与后续任务未观察（[U-009](../../original/unknowns.md)）。运动路径与 P3-07 的战斗路径（弹丸、导弹、碰撞响应、碎片与爆炸的构造与运动，各写回点见 executable 的 [Numbers on the combat paths](../../original/formats/executable.md#numbers-on-the-combat-paths-p3-0707)）沿用同一决定，飞行中写回的实际舍入方向尚无运行读数，由 P3-06 的原版运行判定；若只与向零一致，按 [P3-06 技术决定 12](../../plan/p3/06/spec.md#技术决定) 处理，不在代码中悄悄改变。原版姿态第一行的 z 可以是 −0，Core 写 +0，规范文本不区分。支持的数值域之外（见[原版规则辅助](#原版规则辅助)）由世界创建拒绝；该域只对放置证明，活动对象可以飞出世界矩形，运动中只有非有限的 f32 写回是故障。

### 交接

P3-02 只交付共同契约与接入位置；P3-06 交付飞行运动、操纵与速度、活动区域与停放的规则，以及这些规则对其他任务所写状态的消费者；P3-07 交付目标、武器、弹丸与导弹、命中与碰撞、伤害与能量、毁伤与停放交战的规则，`flight` 分区的战斗组，以及其他任务在这些规则中的固定调用点。P3-10 交付通讯菜单与命令投递、基地回应、无线电队列与来电、通讯反应与报告、停靠等待、停靠与离港、基地服务与完全修理，`communications` 分区，以及运行中衔接的 Core 输出。四者都不声明下游玩法已经完成。下面每个任务的条目依次列 P3-02、P3-06、P3-07 与 P3-10 的交接（P3-06 的依据为 P3-06 spec 的[与相邻任务的接口](../../plan/p3/06/spec.md#与相邻任务的接口)，P3-07 的依据为 P3-07 spec 的[与其他任务的接口](../../plan/p3/07/spec.md#与其他任务的接口)与 CR-09、CR-11、CR-13，P3-10 的依据为 P3-10 spec 的[与其他任务的接口](../../plan/p3/10/spec.md#与其他任务的接口)、CB-17 至 CB-19 与 goal 的[执行记录](../../plan/p3/10/goal.md#执行记录)；这些下游任务的 spec 尚未生成时，以本节为交接记录）。

**上游契约修订与重验范围（P3-10 的 D-01）：** P3-10 修订了 P3-02（CB-01 至 CB-19）、P3-03（修订 2：`data/comm-messages`、白名单加入 `MAIN/COMMFACE.NOB`、切片定义版本 5）与 P3-04（运行中衔接）。这些任务已完成的 goal、subtask 与证据是历史记录，不改写；修订之后仍在使用它们的地方须按新契约重验，范围如下：
- 世界创建、replay 与诊断的调用者都须传入三项新输入（`CONTENT_INPUT_FIELDS` 已含它们，[mission-input.ts](../../../src/app/resources/mission-input.ts) 的 `ruleDataInputs` 与 [tools/replay-check.ts](../../../tools/replay-check.ts) 已同步）；`RULES_VERSION` 5 与快照格式 4 之前的录制与快照一律拒绝；生产来源指纹因白名单改变，用户须重新导入。
- 并行规划的 P3-08（其草案 CR-15 起）与 P3-09（MW-01 至 MW-16）在各自分支上修订同一 spec：合并时按 P3-02 spec 中 P3-10 修订开头的对齐表只保留一份定义（`ai.pendingCommand`、`deliver-command`、`ai.friendlyFire`、`switchView`、保存页、种类 `0x4000`），并相对实际集成基线复核 `RULES_VERSION`、快照格式版本与 `CORE_LIMITS` 的事件与请求合计（CB-16）。
- P3-04 的会话 `transition` 不再只用于初始出发：依赖“`transition` 只有 G-02/2”的消费者（任务流程、输入消费者、UI 桥接、诊断）已由 P3-10/21、22 更新；P3-11 复用这些设施时须在自己的契约中核实救援与终态的衔接。
- P3-05 的绑定已把 `c`、`x`、基地上下文的上下键、Enter 与 `l` 送到 Core 的 P3-10 规则；其交接中“通讯菜单捕获由 P3-10 加入”已由 CB-07 完成，原版事实与项目绑定以 [键盘输入指南](../keyboard-input.md) 为准。

- **P3-03：**
  - 种类名：CINF 机型记录 +4 的文字不在三份逻辑 Asset 中，Core 只给出 `{ type: 'craft-type', kindBit }`。需要导入切片用到的种类位 0、7、8、14，以及僚机名单的种类位 1。
  - 实例化与 Warp 计时读取的机型记录字段：`0x2d400`、`0x3060c`、`0x30e0c` 与 +0xD0；+0xA4、+0xA8。
  - projection 占位需要的武器记录（`WeaponRecordReference`）、通讯菜单（`MenuContentReference`）与结果消息（`ResultMessageReference`）的内容来源。P3-07 已把 `WeaponRecordReference` 定为 `craftInfo` 的 Asset ID、族与记录序号，不需要新的导入。
  - **P3-03 已交付的内容：** `logic` 组的 `data/craft-info`（TABL 4003 所选倍率与 CINF 4037 的全部记录，含机型记录 +0x04 的名称与 +0xA4 等字段）、`data/debris-parameters`、`data/ai-programs`、`data/comm-menus`、`data/base-repair-items` 与 `data/flight-messages`，`models` 组的场景设置、爆炸表与星云列表，`cockpit-hud-map` 组的视角标签与 HUD 文字，以及任务 payload 的段 2 事件触发（`MissionSetup.eventTriggers`）。读取器与形状见[内容模块](./content.md#规范-json-与规则数据-payload)。`data/craft-info` 已由 P3-06 接入世界创建（[世界创建](#世界创建)）；`data/debris-parameters`、爆炸表与其动画、`data/projectile-visuals`、可实例化机体的模型与 `data/ai-programs` 已由 P3-07 接入（[规则数据输入与静态规则数据](#规则数据输入与静态规则数据)）；其他数据接入 Core 的输入与规则归使用它们的规则任务。
  - **来自 P3-06：** 原版按有符号比较机型 +0xA4，executable 的 craft 一节已把它的类型改为 i32；[craft-info.ts](../../../src/content/rule-data/craft-info.ts) 仍按 int32 读取、拒绝第 31 位置位的值，与新类型不一致，由 P3-03 对齐（P3-06/21 的交接；基准数据都非负，不受影响）。Core 的停放 Warp 已按有符号值处理 +0xA4。
- **P3-04（已交付）：** 正式 Runtime、游戏会话与任务流程按下列约定接入 Core，接口见 app 模块说明的[正式 Runtime](./app.md#正式-runtime)、[游戏会话](./app.md#游戏会话)与[任务流程与所有者](./app.md#任务流程与所有者)，工程要点见[工程约定](../README.md#正式-runtime)。
  - 创建：任务所有者从同一个经 `validatePackage` 验证的资源包解码三份逻辑 Asset（[mission-input.ts](../../../src/app/resources/mission-input.ts)），连同该包的 `ContentIdentity` 经会话的 start 交给 Runtime；Core 不认证来源。生产只用难度 19 与默认步长，僚机来自开始配置，种子为平台抽取的 uint32。开发构建用 `createRecordingSession`（检查点间隔 32），生产用 `createWorld`。创建失败（`ContentContractError` 或 `CoreInputError`）留在开始配置页显示类别、路径与原因。
  - 调度：按宿主单调时钟以每秒 32 个 tick 调度，每帧至多 5 tick，超出不补跑。暂停、页面隐藏、任务菜单与 G-02 占位期间不调用 `step`，之后不补跑；会话不读取 Core 状态来暂停，战略地图、通讯菜单、基地内部、停靠倒计时、救援前的引擎内过程与结果延时照常模拟。
  - 动作批次：待执行队列上限 256，每 tick 至多 64 个命令（按住主炮每 tick 占一个），余项按 FIFO 顺延；暂停、继续、退出与返回菜单不是游戏命令。反馈按每个 tick 自己批次的 `commandIndex` 关联 commandId。
  - 错误：`step` 以路径 `recording` 的 `CoreInputError` 拒绝时是录制容量停止（运行 `stopped`，录制仍可导出）；其他 `CoreInputError` 与 `CoreFaultError` 使运行故障，之后不再向 Core 读取新的快照或导出。
  - 读模型：每个成功 step 后同 tick 取得 projection 与 Render State，保留两帧，暂停、保持、停止与故障时折叠；重开是新运行（runId 递增、tick 0），不连接两次运行。React 桥接按 10 Hz 采样，任务状态、交互上下文、分区就绪与结果的变化立即发布；开发诊断经按需快照读取，不进入生产界面；`mission` 分区的僚机选择决定出发占位的变体。
  - 录制：开发构建导出 Core `Recording` 的 JSON，`producer` 为应用名、版本与构建模式；[tools/replay-check.ts](../../../tools/replay-check.ts) 在 Node 中以同一 CloneCD 文件组用 `replayRecord` 与 `compareReplayResults` 核对（[工具指南](../../guides/tools.md#录制重放核对)），P3-15 使用同一路径。
  - 运行中衔接（下游）：P3-04 只实现初始出发保持（G-02/2，会话 `transition`）。运行中的停靠、离港与结果衔接（G-02/3 起）所需的 Core 状态、输出、继续条件与 replay 语义，由 P3-10、P3-11 按[扩展规则](#扩展规则)确定，并共同修订 P3-04 spec 的运行中衔接；没有每 tick 的外部检测器或写回 Core 的入口。P3-10 已为入港与离港（G-02/3、G-02/4）定稿并实现（见下文“来自 P3-10”），结果衔接归 P3-11。占位的显示、计时与生命周期可以复用（[P3-04 衔接占位](../../plan/p3/04/spec.md#衔接占位)）。
  - **来自 P3-06：**
    - 创建与 replay 还需要同一资源包的 `data/craft-info`：用该包的 `decodeRuleDataPayload` 解码，作为 `CreateWorldInput.craftInfo`（经会话的 start 交给 Runtime）与 `ReplayContent.craftInfo` 传入，`original-import` 只接受这一个 Asset ID（[世界创建](#世界创建)）。任务所有者与诊断、[tools/replay-check.ts](../../../tools/replay-check.ts) 与浏览器 replay 都要传入它；合并 main 之后的接入与回归由 [P3-06/24](../../plan/p3/06/subtasks/24-p3-04-integration.md) 进行。
    - `flight` 分区分为 `motion` 与 `combat` 两组，没有外层的 `readiness`，消费者分别检查（P3-07 之后两组都就绪，`speedLimitStatus` 为 `'live'`，见下文来自 P3-07 的条目）。
    - 事件总线与开发事件日志须列出 P3-06 的四种事件（[契约](#契约contracts)）；命令反馈多了 `player-unavailable`、`wrong-context` 与 `no-target` 三个原因码。
    - 清键后送入的中立轴快照由 Core 按变化检测在当 tick 应用零偏转；Core 没有可在恢复后重新生效的旧手动轴，已接受的指令速度与速度辅助状态不随清键改变。
  - **来自 P3-07：**
    - 规则数据输入的传入（P3-07/33、34 已接入）：[mission-input.ts](../../../src/app/resources/mission-input.ts) 的 `ruleDataInputs(groups)` 从持有包的 `logic` 组解码 DEBRIS 表与 AI 程序，从 `models` 组解码爆炸表与其列出的动画，以及唯一的 `projectile` 类 `data` Asset；`runModelInputs(groups, input)` 按 `instantiableModelIds` 只解码本次运行的模型（Core 拒绝该运行时返回空列表，由世界创建在同一输入上拒绝）。任务所有者在打开时解码与运行无关的输入，在开始时从重读并核对过代际与身份的同一包解码模型；解码失败与世界创建的拒绝同路（`rejected`，留在开始配置页）。Runtime 与会话的规格字段由 `CONTENT_INPUT_FIELDS` 加 `run`、`recording` 构成，Core 以后新增的内容输入不需改动它们；[tools/replay-check.ts](../../../tools/replay-check.ts) 与浏览器 replay 用同一解码。
    - 事件与读模型：事件总线与开发事件日志已列出 13 种 P3-07 事件；命令反馈多了 9 个原因码；`flight.combat` 就绪，会话桥按采样发布、就绪状态的变化立即发布；`RECORDING_MAX_BYTES` 随最长事件 `hit`（720 字节）变为 427,820,671。开发诊断的实体检查目前不显示战斗状态（P3-07/33），需要时由 P3-04 或其后的开发工具任务决定。
    - 按住主炮经 `primaryFire` 每 tick 产生的 `fire primary` 现在由 P3-07 判定（玩家起始充能为 0 时为 `insufficient-charge`）；射速由挂点的冷却决定，Runtime 不需改动。
    - 碰撞可视化（P3-07 spec 的范围外项，归 P3-04 的开发诊断）：形状只来自 `data/craft-info` 与 `data/debris-parameters` 经载入变换（[load-transforms.ts](../../../src/core/rules/load-transforms.ts) 的 `craftShape`、`debrisRuleData`，craft §3.5.1、§3.8、§4.4），位姿取自快照或 Render State，不得用模型包围盒、渲染网格或包围球代替；参与碰撞与命中的条件见[战斗规则](#战斗规则p3-07)。静态规则数据不进快照，也没有生产读取入口：P3-04 可在开发诊断中以同一内容与这些纯函数独立计算，或按扩展规则提出只读入口。
  - **来自 P3-10**（CB-07 至 CB-10、CB-13，[P3-04 的运行中衔接](../../plan/p3/04/spec.md#运行中衔接p3-10-的修订)）：成功的停靠与每次离港发出 `transition`（`G-02/3`、`G-02/4`，每 tick 至多 2 个），Runtime 以此截断帧、会话进入保持，已在 app 中实现（[app 模块说明](./app.md#正式-runtime)，P3-10/21）。Core 不保存宿主等待状态，也不接受“占位结束”命令；保持期间停靠倒计时、无线电与服务不推进。事件总线与开发事件日志已列出 13 种 P3-10 事件；命令反馈多了 `subsystem-disabled`；`communications` 分区就绪，UI 桥接把基地页的光标与行次序作为立即发布的关键事实（[UI 模块说明](./ui.md#游戏-store桥接与命令反馈)）。创建与 replay 须传入 `commMenus`、`baseRepairItems` 与 `commMessages`（`ruleDataInputs` 已解码）。开发诊断经快照读取无线电队列、停靠期限与基地计时。
- **P3-05：**
  - 动作采样：把设备输入映射为 `TickInput`，不传扫描码或物理键名；轴的正方向按[契约](#契约contracts)。
  - 按住开火：按住期间每个采样的 tick 产生一个 `fire` 命令；两次采样之间的短按也保留一次；不用 OS 自动重复决定射速；Core 不保存永久的按住标志。
  - 清键：暂停、隐藏、失焦、退出 Pointer Lock 与 G-02 衔接时清除外部按住状态与未执行队列，恢复后只采纳新按下。Core 没有按键缓冲，不会重放旧输入。会话已在暂停、隐藏与结束时自行清除意图与队列，失焦与退出 Pointer Lock 由输入适配器调用会话的 `clear-input`（P3-04 已交付）；按住开火的电平经 Runtime 的连续意图 `primaryFire` 设置。
  - Q-10（已确认，代码）的事实见 executable 的[输入轮询](../../original/formats/executable.md#input-polling-p3-0201)与 [B-005](../../original/behavior/B-005-campaign-rescue.md) 的被毁视角：轮询节奏与“每次一键、其余丢弃”、按视角模式选择上下文、Alt 作为电平与空格作为单次请求、缓冲只由过场清空、被毁期间不轮询游戏按键。逐 tick 命令是 spec 有意的差异（[已知差异](#已知差异)）。物理键位研究（U-011）与绑定归 P3-05。
  - **来自 P3-06（[操纵](../../plan/p3/06/spec.md#操纵)）：**
    - 轴的语义已定：`pitch`、`yaw`、`roll` 对应原版第 1、2、3 轴，正方向是原版设备的正偏转（代码链已确认，画面含义高概率，由 P3-06 的原版运行核对）；三个轴是原版整数路径上的数字摇杆，±1 为满偏，非整数轴值 × 128 向零截断，绝对值不足 1/128 的非零值等于 0；偏航与横滚可同时非零。按键产生 ±1 即可，Core 只在偏转变化时应用，按住期间不需要重复。
    - 原版没有键盘操纵，方向键与小键盘是视角键：项目的操纵键由 P3-05 选取，不与原版视角键冲突，并记为项目选择。
    - 普通飞行中的 `speed-preset` n 是原版 Shift+n 的速度档位（Shift+0 由 `maximum` 表达）；未按 Shift 的数字是 `select-number`，在飞行中无作用（`ignored`/`wrong-context`，P3-05 的契约修订）。
    - `a`（自动驾驶，G-09）与 F11（飞行中切换灵敏度，G-10）按缺省清单拦截并标注；Core 没有对应命令。
    - 按住 `+`/`−` 如何产生命令由 P3-05 决定：Core 每 tick 处理收到的每条命令，不按 DOS 轮询丢弃；同 tick 多条命令的读回依次累计。
    - 地图与基地中的手动轴归零已在 Core 中实现；P3-05 自己的地图模式清键仍按其范围进行。
  - **来自 P3-07：**
    - 现在判定的命令与原版键（绑定归 P3-05，物理键研究 U-011）：`target` 的 `enemy`、`friendly`、`next`、`previous`、`forward` 对应 `t`、`f`、`r`、`y`、`u`（T3 的原生比较，`u` 已确认，[键位表](../../original/input/key-map.md#目标模式代码确认)已由 P3-05 对齐）；`cycle-main-weapon` 为 `/`，`select-missile` 的 `next` 为 `.` 与 `>`、`previous` 为 `,` 与 `<`（W3；手册的 `?` 即 Shift+`/`，飞行处理中无作用，P3-05/01 已确认）；`energy` 的 `open` 为 `e`，`shield-increase`、`shield-decrease`、`gun-increase`、`gun-decrease` 为 `S`、`s`、`G`、`g`（只在能量页有效，D10），`damage-report` 为 `d`（D15）；`fire` 的 `primary` 为 Alt 或摇杆按钮的电平（列表 0），`secondary` 为空格或按钮的单次请求（列表 1，W2、Q-10）。大写 `T`（消息 0x800）是仅作弊的击杀事件（P3-05/01），不是 P3-07 的命令。
    - 开火采样：按住主炮期间每个采样的 tick 一个 `fire primary`（Runtime 的 `primaryFire` 意图已送达 Core），两次采样之间的短按也保留一次；`secondary` 每次按下一个命令。Core 不保存跨 tick 的扳机电平，射速由挂点的冷却决定，冷却未到为 `cooldown` 且不累积。
    - 非飞行上下文中的开火屏蔽（CR-11 的差异 8）：Core 在地图、Warp 与基地上下文中把开火、选目标、选武器与能量命令判为 `wrong-context`，原版在这些上下文中仍按最后读到的主扳机电平开火。P3-05 不必在这些上下文中送出开火命令；送出时只得到 `wrong-context`。
    - 通讯菜单与对象列表菜单在飞行键上下文中先于这些键得到按键，并可能占用 `f`、`r`、`t`、`u`、`y` 等字母（T3）；这一优先级已由 P3-10 在命令判定中加入，所选内容的菜单只占用数字与 `x`，不占用这些字母（CB-01 检查 1）。
  - **来自 P3-10**（CB-07）：`c`、`x`、未修饰数字、基地上下文的上下键、Enter 与 `l` 已有 Core 规则（[键盘输入指南](../keyboard-input.md)）。输入层仍按物理修饰键选择命令，不读通讯 projection；菜单的捕获只在 Core 中判定，切片的菜单只占用数字与 `x`。同一批次中被接受的 `launch` 之后的命令按飞行判定。
- **P3-06（已交付）：** `movement`、`parked-update`（含离开世界）与 `area-check` 阶段；`speed` 与 `speed-preset` 命令（`speed-preset` 由 P3-05 从 `select-number` 改接）、普通飞行的 `confirm-selection`，以及轴的效果；`flight` 分区的运动组；玩家起飞初始状态；实例化扩展点中的最高速度、AI 初态、两个计时与初始移动块。自动驾驶 `a` 不进入 P3（G-09）。见上文各节与 [P3-06 goal](../../plan/p3/06/goal.md)。
  - **来自 P3-07**（CR-03、CR-09）：
    - `MovementBlock` 现为三种变体的封闭联合：P3-07 的 `linear`、`spinning` 已加入实体表的校验与复制、快照写入器与 `moveEntity` 的分派（`moveLinear` 后接注入的弹丸命中检测，`spinFragment`）。P3-06 自己的读取者须按 `mode` 收窄到 steered 块（`craftMovement`、`motionPlayer` 已如此，后者遇到非 steered 块为 `projection.motion` 故障）；冲量、定时旋转、锁定与扰动只在 steered 块中，碰撞响应写到碎片的块时不写字段而抽取照常。
    - P3-07 调用的 P3-06 函数：`craftMovementBlock`（`0x21794` 的模式 0，导弹构造按油门 0 或满油门）、`applyFloatControl`（`0x21fd8`，导弹的 `steer` 与无制导导弹阶段 0 的直接调用）、`applyRecomputedMaximum`（`0x21d88`，档位改变之后）、`playerMaximumSpeed`（`0x30e0c`，经 `craftMaximumSpeed` 在 `0x3060c` 与档位改变时以实时的 E、T 与字段 2 调用）、`integrateCraft`（导弹以弹体记录）、`rotateRows`、`motionStep` 与 `squaredDistance`（`0x56b50`）。`initialMaximumSpeed` 已没有生产调用者；受损不重算最高速度（D6）。
    - 玩家更新中的两处接入点（P3-07/35 只增补 [flight-control.ts](../../../src/core/systems/flight-control.ts)）：`PlayerUpdateOutput.lockMissiles` 在失效目标清除之后、速度辅助之前；`updatePlayer` 返回可用玩家，流水线在释放延后的发射请求之后对它运行自动选敌。另有 `PlayerUpdateOutput.judge`（P3-06 自己不判定的命令）与 P3-07/16 的逐条读回折算 `pendingCommandedSpeed`（同批次的档位键之后读回改写后的指令速度）。移动与停放更新的增补：`moveEntities` 的命中检测回调、`motionRecord` 对导弹取弹体记录（`missileBodyRecord`）、`updateParked` 的 `engage` 回调（RNG 在前后经世界交接）。
    - `ai.objectTarget` 的收窄与运行时种类的缺省（CR-02）：运行时种类（20、21、22、24）的 `objectTarget` 恒为 null，构造者用 `runtimeKindDefaults()`（`lastParkedUpdateClock`、`warpClock` 为 0）；它们不停放，区域检查使其离区时直接待移除。
    - `speedLimitStatus` 为 `'live'`（`PLAYER_SPEED_LIMIT_STATUS`，P3-07/33 合并时取代 `'initial-only'`），不得回退。
    - P3-06 的 AC-11（其子任务 18）需要的 P3-07 集成（目标选择、实时的能量与子系统状态）已交付；`0x3060c` 的抽取与自动选敌已接入，P3-06/16 的本地真实内容核对按 P3-06 对 P3-07 的交接与 P3-06/18 重跑。
    - 不阻塞的建议：[craft-info-input.ts](../../../src/core/world/craft-info-input.ts) 的 `instantiableKinds` 可改由 setup-check.ts 的 `instantiableRecords` 派生（P3-07/12）；`ControlBlock`、`AxisControl` 现定义在 systems/pipeline.ts，规则层只作类型导入，可移到 contracts 或规则层（P3-07/20、32）；P3-06 的 `budget.test.ts` 只量到战斗状态之前，P3-07 的容量由 `combat-chains.test.ts` 核对（P3-07/33、24）。

实例化写入的、依赖机型记录或其他规则的初值与抽取，原版事实见 executable 的[实例化](../../original/formats/executable.md#instantiation-p3-0203)，逐任务的清单见 [03 的交接](../../plan/p3/02/subtasks/03-spawn-defaults-names-research.md#完成证据)；输入与流水线方面的交接见 [01 的交接](../../plan/p3/02/subtasks/01-pipeline-entity-input-research.md#完成证据)。下面只列负责的阶段、分区与扩展点上的义务。

- **P3-07（已交付）：** `collision`、`delayed-player-explosion`、`energy` 阶段与 `frame-end` 中的驾驶舱显示步；`fire`、`target`、`cycle-main-weapon`、`select-missile`、`energy`、`damage-report` 的效果；`flight` 分区的战斗组；实例化扩展点中的武器块、船体、`0x3060c`（含 1 次抽取）与两位字段；四种运行时种类的构造、回调与移动块的模式 1、2；玩家更新中的导弹锁定与自动选敌；停放交战；冲量、定时旋转、锁定与扰动的写入者；实时的最高速度。P3-02 与 P3-06 写给 P3-07 的交接由这些交付完成（预算的复核见[上限](#上限)，指令速度读者的复核见[已知差异](#已知差异)）；与原版的对照与真实内容的核对由 P3-07 goal 的 25、26、27 与 36 完成。见上文[战斗规则](#战斗规则p3-07)与 [P3-07 goal](../../plan/p3/07/goal.md)。
- **P3-08：** 扩展点：`0x20990`（AI 程序）。使用实体的 `aiValueA`–`aiValueC`、记录的 `aiTarget`/`aiTargetCraftTypes`、编组的 `leader` 与实体的 `formation`（P3-06 已存储领队与相对布局首项的偏移）。AI 在对象更新中分配对象时受实时遍历影响：更高种类位的新对象在同一遍更新。
  - **来自 P3-06：**
    - `0x68050` 的实例化初态已由 P3-06 实现（检查点 A 移入）；AI 程序此后改变 `ai` 的模式、目标、目标点与偏移，并写入非玩家对象的 `ai.objectTarget`。加入其余 AI 模式时按扩展规则扩展 `AiMode` 与实体表的校验。
    - AI 驾驶调用 `applyFloatControl`，第一个投递者按扩展规则加入浮点操纵请求（消息 0x40000）；AI 的速度匹配复用 `speedMatch`/`applySpeedMatch`（消息 0x80000 的 AI 形状由 P3-08 加入）。
    - Warp 离场请求（消息 0x800000：写 `area-switch`、`inWarp`、`warpClock` = 0，并使下一次停放检查立即到期）；停放行进已把“`inWarp` 且 `warpClock` 为 0”当作离场请求触发跳跃。
    - 停放战斗（与 P3-07）；`object-sets` 阶段建议归 P3-08（停放对象的 AI 处理读取它）。
    - 种类 `0x4000`：用 `rebuiltMovementBlock` 按旧速度比重建移动块，`lastParkedUpdateClock` 取创建时钟（项目规则）。
    - 恢复活动后的 AI；在此之前非玩家飞行器沿实例化时的移动块直线运动，停放对象按实例化时的 AI 状态行进。
  - **来自 P3-07**（CR-05、CR-09、CR-13）：
    - AI 的开火入口（[weapons.ts](../../../src/core/systems/weapons.ts)，不产生命令结果）：`fireAiChannel(context, shooter, channel)`（扳机 `0x2d578` 的通道 0、1、2，目标为 `ai.objectTarget`，返回 `FireOutcome`，列表没有当前挂点时为 null）、`fireAutomatic(context, shooter)`（自动挂点 `0x2dad0`：不检查也不扣充能，受损抽取不同，失败也消耗连发并重置冷却，开火时不检查射界，出生偏移随机）与 `acquireAutomatic(context, shooter, mount)`（瞄准获取 `0x2da58`，不抽取）。它们的发射请求立即投递（原版在发射者自己的更新中投递消息 8），与列表开火共用挂点状态、发射请求与构造。何时扣动、按住与松开以及 `retargetClock` 的保持值（W9）由 P3-08 决定；AI 的选择调用 mounts.ts 的 `selectMount`（原版 AI 代码对 `0x2d6dc`、`0x2d6f0` 的调用）。AI 发射的制导导弹锁定字节为 0（W8，高概率）。
    - 共享转向模块 [steering.ts](../../../src/core/rules/steering.ts)：P3-07 实现了导弹用到的子集（安装、提前量模式 3 的目标点、两个限幅比例、控制块、期限与热寻的放弃）；P3-08 在其上扩展 AI 机体所需的部分（其他提前量模式、横滚匹配、噪声例程、解释器），不另建。AI 驾驶对 `0x21fd8` 的调用投递同一个 `steer` 请求（消息 0x40000）；`applySteer` 目前只接受导弹，其他主体为 `missiles.steer` 故障，由 P3-08 扩展；`ControlBlock` 的解码可移入 rules/flight-control.ts。
    - 读写的状态：机体的 `ai.objectTarget`（瞄准炮、制导导弹与停放交战读取；停放的多目标交战也写入）；`proximity`（碰撞两遍写入，H6）、`lastVictim` 与 `lastAttacker`（弹体命中且发射者有效时写入，H4）；`MountState` 的 `autoTarget`、`retargetClock`、`burst` 与 `aim`。
    - AI 范围伤害 `0x6313c`：经 destruction.ts 的 `constructExplosion`（在对象更新中直接创建，同一遍历中首次回调，`explosion-started` 在同一 tick；碎片因此早一 tick 激活，CR-11 的差异 5）与 damage.ts 的 `applyContactDamage(context, victim, damage, 'area')`（`0x2a5fc`，攻击者 `none`，强制子系统抽取）；自爆不置被毁标志，不发 `object-destroyed`。
    - 停放：P3-07 的停放交战在每次停放更新的行进之后运行，多目标交战（AI 模式 1）已写 `ai.objectTarget`；P3-08 的停放 AI 处理与 `object-sets` 阶段在停放更新与第 12 阶段接入，与交战的抽取次序按 E4。`data/ai-programs` 的完整内容已在世界中（`ruleData.inputs.aiPrograms`，setupHash 绑定完整内容），P3-08 在同一输入上扩展读取，不另建输入（CR-01）。
    - 锁定进度 `0x2e080` 目前在 [combat.ts](../../../src/core/projections/combat.ts)；AI 也调用它时可移入规则模块（P3-07/23）。
  - **来自 P3-10**（CB-12、CB-17、CB-18、CB-19，goal 执行记录的 15、18）：
    - 命令与回复：僚机的 `ai.pendingCommand`（`{ code, issuedTick }`，码为 u32）由 P3-08 的 `0x61f20`、`0x614a8` 消费并清除；请求 `deliver-command` 即其草案的 `wingman-command`（字段相同，另有 `commandIndex`），P3-08 定稿时改用本名。AI 的回复经 radio.ts 的 `queueLine(context, speaker, type)` 入队（不另建队列）；`0x3bed0` 在机体自身更新中位于 P3-08 的 AI 步之后（pipeline.ts 的 `updateObject` 中 `answerCommand` 之前是 AI 步的位置）。
    - 友伤累计 `WorldState.ai.friendlyFire` 由 `0x3c208` 第 1 步写入，P3-08 经 `0x38fd8` 读取，并在 `WorldState.ai` 中加入其他字段；若要接管写入须修订 CB-05。
    - 完全修理 `fullRepair(context, entity, inRequestHandling)`（base-interior.ts）供 `0x61bd0` 调用，不另实现。
    - 尾随警告：`checkTail` 目前不遍历种类 `0x780` 的攻击者（CB-17 决定 11）。P3-08 提供攻击航线字节（处理器状态的 (+0xF4)+0x24 为 3 或 4）的只读谓词，在 `checkTail` 中加入遍历并调用已导出的 `warnTail`（`0x38c30`），递增 `RULES_VERSION`。
    - 种类 `0x4000`（Xpon）的运行时构造 `0x38780`、玩家 `b` 的命令与内部请求和 AI 投放，连同输入接线与验收，归 P3-08（CB-18）；P3-10 对该种类没有规则。
    - AI 的候选搜索须排除停靠的对象（DK4）；P3-10 只测试了停靠状态本身（[docked-systems.test.ts](../../../src/core/systems/docked-systems.test.ts)）。P3-08 接入前僚机不返回基地，连续运行中的僚机随停靠只在单次转移层对照过。
- **P3-09：** `warp-completion` 与 `frame-end` 阶段；`toggle-map`、`map-point`、`request-warp` 的效果与 `map` 分区；地图开启时飞行命令的门禁。世界框架已由 `runtimeFrame` 校验。
  - **来自 P3-06：**
    - `warpClock`、`inWarp` 已在实例化中写入（玩家与僚机以外 1 次抽取）并由停放路径读写；玩家 Warp 与 Warp 完成复用同一字段。
    - Warp 开始把玩家移动块就地切换为 `warp` 模式（积分为 `integrateWarp`）并清除玩家目标，Warp 完成切回 `craft`；Warp 期间的区域中心在 `activeAreaCentre` 中加入。
    - 地图上下文中的手动轴归零与速度命令、`speed-preset` 的 `wrong-context` 已在 Core 中；地图中的 `select-number`、`confirm-selection` 仍为 `not-implemented`，由 P3-09 接入。
    - 种类 25 的地图标记没有机型记录：世界创建拒绝投递种类 25 实例的内容（所有原版任务都没有），运行时创建的标记若带移动块并通过运动筛选，会在 `movement.record` 处故障，因此须按扩展规则为其模式 4 加入不需要机型记录的变体（与 P3-13）。
  - **来自 P3-07：**
    - `inWarp` 由 P3-09 写入（玩家 Warp），P3-07 只读：目标候选、导弹起爆的受击者与停放单目标交战的门禁排除 Warp 中的对象，帧尾的右显示屏以 `warp` 原因清除在 Warp 中的玩家目标；雷达、弹丸命中、碰撞与停放多目标的收集不看 Warp。
    - Warp 开始清除玩家目标（不发 `target-changed`，CR-09）。Warp 的能量检查与扣除（U-026，执行路径未追踪）读写机体的 `combat.energy`（i32）；之后的耗尽仍由能量阶段判定并发出 `energy-depleted`。
    - 左显示屏：页 6（Warp）由视角切换保存当前页、离开 Warp 时恢复（为 5 时恢复为 0），Warp 也使能量页 1 离开（D15）；P3-09 写页面时发出 `commandIndex` 为 null 的 `left-page-changed`。视角切换（`0x4cd68`）须置 `statusDisplay.redraw`；视角模式 1 在驾驶舱显示步的视角集合中。`frame-end` 中 P3-09 的规则推进（`0x50508`）位于 P3-07 的显示步之前（CR-07）。
    - Warp 出口的最近对象搜索（`0x2bf08`）看不到表现层的效果对象，实体预算也与原版不同（CR-11 的差异 1）。
    - 地图上下文中 P3-07 的命令为 `wrong-context`（CR-11 的差异 8）；自动选敌在地图中照常运行（T3）。种类 25 的标记在友方掩码 `0x206c87e` 中，并在雷达中为 `marker` 类；它须有移动块并处于活动状态才会成为候选或接触点（见上一条）。
  - **来自 P3-10**（CB-10、CB-11、CB-19，goal 执行记录的 18）：
    - 视角切换：docking.ts 的 `switchView` 在新旧视角之一为 6 时置 `statusDisplay.redraw`；合并 MW-09 时由 P3-09 的 `switchView` 接管，保留涉及视角 6 的部分。生效视角 `EffectiveView` 已传入 P3-06 与 P3-10 的命令；P3-07 的命令仍读已提交的视角，由 MW-04 统一。
    - 基地中打开地图（视角 8）时服务步停止、到期保持，关闭后每个逾期步骤做一次（BS8，已在 `serviceBase` 中，只测试了状态）；地图打开时自动离港的视角为 0xC（`launchViewMode`）。地图上下文的 `confirm-selection` 仍为 `not-implemented`。
    - 地图标签按实体的 `communications.threatStamp` 闪烁（RX7）；菜单从不占用 `m`、`w`。
    - Warp 的保存页与菜单、来电的保存页三者分开（RQ8）；来电在视角 1 中不显示页 5。
- **P3-10（已交付）：** `mission-flow` 中的停靠子状态、`communications-reply` 与 `base-interior` 阶段、`frame-end` 中的左显示屏页 2–5 处理器、尾随警告与通讯呈现子步；`communications`、`select-number`、`navigate-selection`、`confirm-selection`（基地）与 `launch` 的判定与批内生效视角；五种请求与 13 种事件；`0x3c208`、`0x3c0f4`、`0x38cd4`、`0x3c3b0` 与僚机到达基地的调用；`communications` 分区；实例化扩展点中的 `0x38cd4`。下列 P3-06、P3-07 写给 P3-10 的交接由这些交付完成，实现见上文[通讯、停靠与基地服务](#通讯停靠与基地服务p3-10)；与原版的对照与真实内容的核对由 P3-10 goal 的 24、25、26 完成。
  - **来自 P3-06：**
    - 通讯菜单打开时 `select-number` 归菜单的优先级（档位是独立的 `speed-preset`，不受影响）；基地上下文中的 `confirm-selection` 为基地确认，`select-number` 为 `wrong-context`（CB-07）。
    - 基地修理 `0x398ec` 清除操纵锁定与扰动，完全修理 `0x39820`（停靠的僚机与僚机到达基地调用；离港不调用，P3-10/06 的更正）清除扰动。
    - 停放行进中的僚机到达基地（限频的完全修理，没有消息）与敌方停放对象的报告 `0x3c3b0` 已在 [area.ts](../../../src/core/systems/area.ts) 中接入。
    - 停靠的实体保留移动块并参与运动，离开活动区域时也会停放；基地上下文中的手动轴归零已在 Core 中。
  - **来自 P3-07**（CR-13）：
    - 修理与补给（`0x39820`、`0x398ec`）读写的战斗状态：`hull`（到 c9C）、`energy`、`shield`、`charge`、`subsystems`（`0x39820` 清零）、挂点的 `ammunition`（初值为挂点 +0x0C）与 `damage`；挂点的修理与选择用 mounts.ts 的 `repairListMounts`（`0x2e3c8`、`0x2e1fc`）与 `selectMount`，补弹若循环选择则发出 `commandIndex` 为 null 的 `weapon-selected`（CR-06）：P3-10 中只有完全修理在请求处理中对玩家发出，基地服务步的补弹不发（BS7）。
    - 调用点（[damage.ts](../../../src/core/systems/damage.ts) 的模块注释）：`0x3c208`（含其抽取）在 `0x2a694` 的护盾结算之后、攻击者不为 `none` 时，以及 `0x2a5fc` 结算后船体 ≥ 0 时；`0x3c0f4` 在被毁时置被毁标志之后、对象事件之前，以及 `0x2a5fc` 结算后船体 < 0 时（碰撞致死于 0 以下时调用两次，D5）。插入静态调用时递增 `RULES_VERSION`，跨 tick 的无线电状态由 P3-10 拥有（C3）。
    - 进入基地视角（6）时清除玩家目标；帧尾的右显示屏在视角 6 中以 `base-view` 清除仍在的目标，视角 6 在驾驶舱显示步的视角集合中。视角切换须置 `statusDisplay.redraw`。
    - 左显示屏页 2–4（通讯菜单）与 5（来电消息）：保存与恢复页面，发出 `commandIndex` 为 null 的 `left-page-changed`；通讯打开与来电使能量页 1 离开（D15）。通讯的按键处理先于 P3-07 的键（T3、D10），对象列表菜单可能占用 `f`、`r`、`t`、`u`、`y`；这一优先级由 P3-10 在命令判定中加入（CR-05）。
    - 停靠的实体不参与能量更新、碰撞与弹丸命中，也不是目标候选；导弹起爆照常命中停靠者。
- **P3-11：** `mission-flow` 与 `mission-teardown` 阶段、`MissionStatus` 的后续状态、`result` 分区。使用 `disableSpawning`（成功时清除生成开关）、`pendingSpawns`（全清判定）、`placeWorldRecord`（救援放置，存储位置路线）与事件列表中的 `object-instantiated`（段 2 触发计数，触发与区间来自 `MissionSetup.eventTriggers`）；对象事件的按种类计数与触发标志在扩展点接入。主流程状态 1 的实例化门禁（`0x339cc`）随状态加入。被毁不等于移除，救援复用玩家实体。
  - **来自 P3-06：** `object-left-world`（带来源快照，每个对象一生至多一次）供段 2 的触发计数。救援用 `rebuiltMovementBlock` 按旧速度比重建玩家移动块（新块没有锁定与扰动，与原版每次建块时的清除一致）并重算最高速度（`playerMaximumSpeed` 与 `applyRecomputedMaximum`）；玩家的控制状态在救援中保留。
  - **来自 P3-07**（CR-13）：
    - 调用点（位置在 [damage.ts](../../../src/core/systems/damage.ts)、[destruction.ts](../../../src/core/systems/destruction.ts)、[energy.ts](../../../src/core/systems/energy.ts)、[launch.ts](../../../src/core/systems/launch.ts) 与 spawn.ts 的注释中，Core 没有空函数或待处理标志，插入时递增 `RULES_VERSION`）：`0x6977c`（被毁：`0x3c0f4` 之后，带 `object-destroyed` 的事件类别，同一阶段立即处理，计数与触发可安排生成）；`0x32d74`（种类 1 被毁：爆炸构造之前；被毁视角会清除玩家目标，并经 `0x2cd20` 把左显示屏恢复为页 0）；`0x32dec`（种类 2 被毁：停放判定与爆炸构造之前）；玩家的击杀计数在这两者之前；`0x33464`（玩家能量更新的耗尽分支，钳 0 之后）；`0x32e14(1)`（玩家逃生舱到期：清除 `followedEntity` 之后、舱进入待移除之前，同一 tick 其余阶段看到救援后的玩家）；`0x339cc`（发射请求的处理，与生成的门禁同一状态）。跨 tick 的状态（任务内子状态、到期时刻）由 P3-11 拥有（C3）。
    - 救援 `0x67b98`：复用 [combat-init.ts](../../../src/core/rules/combat-init.ts) 的 `rebuildWeaponBlock`（`0x2d400`）与 `initialiseResources`（`0x3060c`：资源、档位、E、T、最高速度、能量时钟与 1 次抽取，并清除耗尽锁存），只重置它们写的字段，再调用 P3-10 的 `0x39820`（子系统清零）；`targeting`、`kills`、`shots` 与 `heavyDamage` 保留。救援复用玩家 ID：比较器只在 tick 内检查重复的被毁（P3-07/24），救援后再次被毁合法；被毁标志的清除与状态的恢复归 P3-11。
    - 读取：`kills`（D8 的八个种类，只计玩家击杀的非玩家、非僚机）、`shots`、`heavyDamage`（成功总结）、`delayedExplosionClock`、`followedEntity`，以及 `object-destroyed` 的 `eventClass`、`outcome` 与 `energy-depleted`。
    - 现状：P3-11 接入之前，玩家被毁后照常延迟爆炸（被毁后第 97 tick）、产生逃生舱并跟随，舱在其首次回调后 0x140 单位到期时清除跟随并离开，之后玩家停在被毁源状态、任务状态仍为 `built`，Core 不伪造救援、计数或失败（P3-07/24 的连锁测试）。
  - **来自 P3-10**（CB-02、CB-06、CB-10、CB-12、CB-19，goal 执行记录的 18）：
    - 子状态：在 `flow.subState` 上加入 1、2、6 与主流程状态（`flow.mainState`），按扩展规则修订 CB-02；`0x3336c`（`takesRadio`）与 `0x33390` 的门禁随之生效。子状态 3–5 期间任务成功与僚机损失消息延后（冲突 ⑳）；P3-11 接入子状态 1、2、6 后，菜单建立时固定的停靠项照原版可在这些子状态下选择（决定 4）。
    - 清空：被毁 `0x32d74`、信标到期、主流程切换与任务开始调用 radio.ts 的 `flushRadio`，`radio-flushed` 的 `cause` 按扩展规则增加取值。`0x32d74` 还写停靠对象为 null；停靠中被毁时不恢复活动状态（U-031，已确认，代码），P3-10 只测试了“被毁的停靠玩家保持停靠”。
    - 救援：调用 `fullRepair`（子系统清零），战役分支且救援次数 < 2 时调用 `clearCommunicationLimits`；统计重置 `0x3b734` 直接写 `communications.thanks` := 0。感谢计数 `thanks`（ps +0x60）供统计与得分读取。
    - 僚机损失消息（`0x3c4bc`：表 20983 序号 6，无说话者、无抽取、无限频）经 `queueRadio` 入队。
- **P3-12、P3-13：** 消费 Render State（停放不呈现、放置序号、新 ID 只用当前位姿、被毁在移除前仍列出）与 projection；相机由 Render State 与视角模式推出；`cockpit-front` 的效果与被毁视角的门禁按原版（B-005）。名称文字：候选与池从 setup 解析，种类名来自 P3-03 导入的 `data/craft-info`（CINF 机型记录 +0x04，见上文 P3-03 一条）。
  - **来自 P3-06：**
    - 速度读数与辅助指示来自 `flight.motion`（当前、指令与最高速度，`speedLimitStatus`，`speedAssist`）；持续状态从 projection 读取，不靠累计事件重建。
    - 一次性反馈来自事件：`speed-assist-toggled`（开/关消息；开启时启动 HUD 闪烁）、`speed-matched`（assist 且 `speedDifferenceExceeded` 时闪烁）与 `speed-assist-released`。消息文字从 `data/flight-messages` 与 HUD 内容解析，Core 不含文字；HUD 闪烁计数器归 P3-13。
    - 驾驶舱表现读取的第三行角速率（`0x21cf8`，不含定时分量）不在运动 projection 中；需要时按扩展规则修订分区。
    - 停放期间的位置写入使放置序号加 1；停放实体不呈现，恢复后渲染器不跨停放插值。
  - **来自 P3-07，给 P3-12**（CR-11、CR-12）：
    - 会话级的表现选择者：世界创建之后、首次爆炸激活之前按 X8 为三张列表各选一次 EXIC 子集（原列表序号的序列，保留次序与重复）；每个爆炸 ID 在其 `explosion-started` 上只选一次，结果为 `{ list: 1 | 2 | 3; item }`，`item` 是原始 `ExplosionTable.lists` 的序号而不是子集下标；`large` 取列表 1，`missile` 取列表 3，`other` 按选择者自己的相机距离取列表 2 或 1（X4）。动画与音效读同一个结果，缓存到该爆炸离开 Render State；用表现层自己的随机源，不取 Core RNG，同一 replay 的两次播放不要求相同；结果随会话丢弃，重试时重新选择。Core 已在创建时核对列表的帧数一致，所以选择不改变来源的释放与爆炸的移除时刻；动画帧可按 `explosionStart` 与 X4 的帧序号推进。
    - 额外爆炸（`0x23fdc`：数量、相机偏移与激活延迟）、事件 `0x10` 的屏幕门禁与判别值 1、2 的碎片及其到期再爆炸、闪光（`0x24314`）：由 `explosion-started` 与 Render State 驱动，不进入 Core（CR-11 的差异 1–3）。
    - Render State：表现选择器的五个变体（导弹的外观由 P3-12 按导弹记录序号从导弹内容解析；弹丸为 `projectileVisuals` 的 Asset 与记录；爆炸只有变体；碎片为源模型、第 1 列表原序号与 `display`）、`clock`、受击闪烁 `hitShimmerStart`（条件——玩家、被毁视角、目标在 Warp 中——由渲染器按原版判断）与 `explosionStart`；被毁源在移除前照常列出并移动。`source-released` 对玩家的 `removed: false` 对应原版隐藏玩家模型的表现项（高概率）。
    - 导弹相机（原版 `0x3119c`，只服务玩家的导弹；`0x174c0c` 不在 Core）由 `shot-fired`（`family: 'missile'`）与 `missile-ended` 驱动。
    - R-10 中归表现层部分的原版观察见 [B-009 的归表现层的观察](../../original/behavior/B-009-combat-rules.md#归表现层的观察交-p3-12p3-14)，由 P3-12、P3-14 对照，不计入 P3-07 的 R-10 判定。
  - **来自 P3-07，给 P3-13**（CR-10、CR-12）：
    - 驾驶舱与 HUD 读数来自 `flight.combat`：右显示屏的目标信息（名称引用、种类、距离、速度、护盾；子系统 14 的干扰、标记的十字与文字格式归 P3-13）；雷达（`offset` 由 P3-13 按其相机投影到屏幕，子系统 12 为 1 时的随机噪点与每 6 单位的重建节奏归 P3-13）；资源与满刻度（钳位与比例由 P3-13 做）；档位；两张武器列表；锁定进度；19 个子系统（状态显示屏的叠加图）与左页面（各页的处理例程、干扰与刷新周期按 D15 绘制）。持续状态从 projection 读取，不靠事件累积重建。
    - 一次性提示来自事件：`target-cleared`（`warp` 对应原版右显示屏的离开提示）、`weapon-selected`、`energy-allocation-changed`、`left-page-changed` 与 `energy-depleted` 等。状态显示的闪烁相位与字段 1、5、8 由 Core 的显示步写入，P3-13 只绘制；能量页的重绘标志 +0x44 与非玩家的 +0xF0 只供显示，不在 Core（CR-02）。
  - **来自 P3-10，给 P3-12**（CB-14）：离港放置使玩家的放置序号加 1，渲染器不跨此插值；视角 6 中不绘制三维世界；停靠的实体照常在 Render State 中。
  - **来自 P3-10，给 P3-13**（CB-03、CB-09、CB-14，P3-10 spec 的[缺省与标注](../../plan/p3/10/spec.md#缺省与标注)）：通讯菜单（页 2–4）、来电页（页 5）、基地视图与类型 9 仪表的两个指示灯都来自 `communications` 分区：菜单的表与项文字经 `MenuContentReference` 从 `commMenus` 解析，对象项的 `tone` 决定颜色；来电的消息身份、说话者快照与当前 `frame`；基地页的行、光标与标志。G-03 的项目摘要文字由 [slice-gaps-copy.ts](../../../src/ui/mission/slice-gaps-copy.ts) 的 `MESSAGE_SUMMARIES`、`messageSummary` 按消息身份给出，P3-13 经应用装配取得，不从 `render/` 反向导入 React 页面；G-05 的 React 基地页面是过渡，P3-13 的正式画面接通后复核。持续状态从 projection 读取，不靠事件重建。
- **P3-14：** 音效由领域事件与 projection 触发；原版派发器每遍清空的表现项不是 Core 阶段。P3-06 的速度辅助与匹配事件可作为音效触发源（若原版有对应音效）。
  - **来自 P3-07**（CR-06、CR-11）：爆炸音效取自 P3-12 的同一选择（所选 EXPL 项的声音），不另行抽取；`weapon-selected`（SND 11381，`changed` 表示挂点改变，冲突 32）、`shot-fired`（按 `family` 与武器记录选择）、`hit`（`shieldWasEmpty` 即原版受击项 +0x0C，选择受击音槽 3 或 4）、`energy-allocation-changed` 与 `left-page-changed`（消息 0x100000 的 SND 10485）、`target-changed`（消息 2 的表现项，T1，高概率为音效）。R-10 中归表现层的原版观察见 B-009（同上）。
  - **来自 P3-10**（CB-13、CB-19）：`left-page-changed` 在 `commandIndex` 非 null 时对应 SND 10485；`base-navigated`、`base-confirmed` 对应 SND 10167、10169，每个按键都有（端点与不需服务时也有）；来电的帧音效按 `incoming-started` 的 `frameDurations` 与分区的 `frame`；无线电项的 `music-step`、`music-reset` 回调是原版的两个音乐回调的表现标记（G-01）；入港时对象音效静音（BS7）。基地服务步遍历中的选择音效原版从不派发，Core 不发事件。
- **P3-15（来自 P3-10）：** 联合复验项：P3-08 接入后的僚机命令消费、回复与尾随警告；P3-09 接入后基地中的地图、地图打开时的自动离港与 MW-04 统一的生效视角；P3-11 接入后的救援、清空原因与停靠中被毁；P3-13 的正式通讯与基地画面；P3-10 对照中的未运行对照与限定结论（停靠等待中对象失效的取消、活动僚机在距离外时的停靠、其余通讯反应分支、受攻击的状态查询的来电时间链与 RQ2）；以及 U-021 冻结后在冻结配置下重测 R-17 至 R-19。
- **Q-11 的数值交接（P3-06、P3-07）：** x87 以双精度运算，位置与姿态以 f32 存储；f32 写回按用户批准的决定就近舍入（取代 P3-02/02 完成证据中“继承向零舍入”的说法），浮点转整数向零截断，长度用 FSQRT。运动中的姿态旋转用 FSIN/FCOS（已确认），映像中没有找到正弦或余弦表（高概率），见 executable 的 [x87 一节](../../original/formats/executable.md#x87-precision-rounding-and-trigonometry-p3-0202)。P3-06 按运动路径的写回点实现了同一策略（[原版规则辅助](#原版规则辅助)）；飞行中运动写回的实际舍入方向仍待 P3-06 的原版运行，舍入方向与代码推论的矛盾仍是 U-009 的开放问题。P3-07 的战斗路径（弹丸、导弹、碰撞响应、碎片与爆炸）已沿用同一策略，写回点见 executable 的 [Numbers on the combat paths](../../original/formats/executable.md#numbers-on-the-combat-paths-p3-0707)。

### 针对性检查

- 全部 Core 与边界回归：`pnpm exec vitest run src/core tools/engineering-boundaries.test.ts`。
- 按目录：`pnpm exec vitest run src/core/contracts`、`src/core/world`、`src/core/systems`、`src/core/rules`、`src/core/projections` 或 `src/core/replay`。
- 规范文本、录制与比较中各有一组按上限规模运行的用例，声明 30 s deadline（[工程约定](../README.md#测试)）。
- P3-06 的规则与系统测试与源码相邻（`flight-state`、`flight-motion`、`flight-control`、`speed-match`、`initial-ai`、`random-direction`、`active-area`、`parked-travel`，以及 `systems/` 的 `movement`、`flight-control`、`area`）；[motion-replay.test.ts](../../../src/core/replay/motion-replay.test.ts) 以 `startReplay` 与替身写入者核对带轴、多命令、目标失效与多次辅助匹配的 160 tick 录制经 JSON 往返后的 replay；[budget.test.ts](../../../src/core/replay/budget.test.ts) 在实体上限下以真实流水线核对 P3-06 的事件与请求上界及快照文本长度。
- P3-07 的规则测试（`rules/` 的 `load-transforms`、`collision-shapes`、`combat-init`、`targeting`、`radar`、`mounts`、`firing`、`movement-builders`、`projectile-motion`、`hit-tests`、`damage`、`subsystems`、`energy`、`displays`、`collision`、`steering`、`guidance`、`explosions`、`fragments`、`parked-engagement`）与系统测试（`systems/` 的 `commands`、`targeting`、`weapons`、`launch`、`projectiles`、`missiles`、`damage`、`destruction`、`collision`、`energy`、`displays`、`parked-engagement`）与源码相邻，期望由 executable 的 Combat rules 与 CR 独立推导；[rule-data.test.ts](../../../src/core/world/rule-data.test.ts) 覆盖规则数据输入的读取、CR-01 的每项检查与静态规则数据；[combat.test.ts](../../../src/core/projections/combat.test.ts) 覆盖战斗组。接线与连锁：[combat-wiring.test.ts](../../../src/core/systems/combat-wiring.test.ts)（玩家更新的接入点、弹丸的发射 tick 与高速命中、碰撞响应被积分消费、停放交战的抽取交错）、[missile-wiring.test.ts](../../../src/core/systems/missile-wiring.test.ts)（导弹经 P3-06 积分、引信与起爆的次序、追踪，以 `referenceFrame` 逐 tick 比较）与 [combat-chains.test.ts](../../../src/core/systems/combat-chains.test.ts)（一次死亡、`lost-shooter`、CR-13 交接不伪造、跨阶段的事件次序、延迟消费与 P3-07 的上限）；[combat-replay.test.ts](../../../src/core/replay/combat-replay.test.ts) 以创建的世界录制 120 tick 的战斗，核对 JSON 往返后的 replay、检查点、读模型的纯度与 setupHash 对规则数据输入的拒绝。
- P3-10 的规则测试（`rules/` 的 `comm-menus`、`radio`、`comm-reactions`、`docking`、`base-service`、`full-repair`）与系统测试（`systems/` 的 `communications`、`radio`、`base-response`、`comm-reactions`、`docking`、`base-interior`，以及 `commands`、`damage`、`area`、`displays`、`spawn` 中的 P3-10 用例）与源码相邻，期望由 executable 的 CD、RQ、RX、DK、BS 与 CB 独立推导，条件抽取对 0–32767 的全部 rand 值计数原像；[comm-input.test.ts](../../../src/core/world/comm-input.test.ts) 覆盖 CB-01 的检查 1–5 与名称序号；[communications.test.ts](../../../src/core/projections/communications.test.ts) 覆盖分区。联合：[docked-systems.test.ts](../../../src/core/systems/docked-systems.test.ts)（停靠中的运动、能量、碰撞、弹丸、导弹起爆、停放交战、目标与活动区域，以及宿主暂停下的服务）；[comm-replay.test.ts](../../../src/core/replay/comm-replay.test.ts) 在一个世界中录制两次完整的停靠链（等待、回复、倒计时、停靠、基地按键与离港），核对 JSON 往返后的事件与各检查点、检查点覆盖 CB-16 的新状态、首个分歧的 tick、规则版本与内容的拒绝，以及 `radioQueueItems` 的 limit 与 limit + 1。测试支持：[radio.test-support.ts](../../../src/core/systems/radio.test-support.ts) 与 [base-interior.test-support.ts](../../../src/core/systems/base-interior.test-support.ts)。
- 测试支持（不进入生产导入链）：[world.test-support.ts](../../../src/core/world/world.test-support.ts) 的 `entityInit`、`stillEntityInit`（油门 0 的移动块：活动实体现在每 tick 运动，需要固定位置时用它）、`addPlayerEntity`（区域检查在没有玩家实体时把非玩家实体停放）、`busyCombat`（各运行时种类填满可选部分的战斗状态）与 `withEveryKindBound`（为测试世界中任务不能实例化、却被测试分配的种类补上空形状的静态规则数据；碰撞等阶段每 tick 读取活动机体的形状，缺少时为故障）；[create-world.test-support.ts](../../../src/core/world/create-world.test-support.ts) 的 `worldInput` 与各规则数据输入的合成内容（`craftInfoContent`、`debrisContent`、`projectileVisualsContent`、`explosionsContent`、`animationsContent`、`modelsFor`、`aiProgramsContent`）；[rand.test-support.ts](../../../src/core/rules/rand.test-support.ts) 的 `scriptedRand`、`randValues` 与 `rngStateAfter`（由世界 RNG 状态独立预测抽取）；[flight-motion.test-support.ts](../../../src/core/rules/flight-motion.test-support.ts) 是运动一帧的独立参照，在 BigInt 精确有理数上按 executable 的写回点逐步舍入，不用 JS 浮点运算或被测代码；[derivation.test-support.ts](../../../src/core/rules/derivation.test-support.ts) 提供规则测试共用的精确有理数 f32 舍入（P3-02/02 的推导）。
