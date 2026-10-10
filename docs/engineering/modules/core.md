---
type: guide
status: active
phase: all
updated: 2026-10-10
related: [ADR-0004, ADR-0006, ADR-0015, B-006, B-007, U-009, U-011, U-021]
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

[P3-02](../../plan/p3/02/spec.md)（[goal](../../plan/p3/02/goal.md)）交付正式契约、世界、固定流水线、任务实例化、读模型、快照与 replay；契约以该 spec 为准，本节只记录交付的 API。Core 之外的使用者（P3-04 的 Runtime、本地核对工具、P3-15 的 Node 重放）只使用以下入口及其返回的世界与只读数据：

| 入口 | 模块 | 作用 |
|---|---|---|
| `createWorld(input)` | [world/create-world.ts](../../../src/core/world/create-world.ts) | 由三份逻辑 Asset、内容身份与运行配置创建世界 |
| `World` 的 `step`、`projection`、`renderState`、`snapshot` | [world/world.ts](../../../src/core/world/world.ts) | 推进与读取 |
| `createRecordingSession(input, options)` | [replay/recording.ts](../../../src/core/replay/recording.ts) | 创建同时录制的世界 |
| `replayRecord(record, content)` | [replay/replay.ts](../../../src/core/replay/replay.ts) | 在新世界中重放录制 |
| `compareReplayResults(expected, actual)` | [replay/compare.ts](../../../src/core/replay/compare.ts) | 报告最早可观测的分歧 |
| `snapshotText`、`snapshotHash` | [replay/snapshot.ts](../../../src/core/replay/snapshot.ts) | 快照的规范文本与状态哈希 |

标为“内部”的函数只供 Core 自己与 Core 测试使用，不是生产 API；规则任务按[扩展规则](#扩展规则)改动 Core 内部，不向生产入口注入处理器。

### 世界创建

`createWorld(input)` 的输入 `CreateWorldInput` 为 `{ mission, craftTypes, wingmanRoster, identity, run }`：前三项与 `loadMission` 相同，`identity` 是三份 Asset 所在资源包的 `ContentIdentity`，`run` 是运行配置。创建对应原版的任务构建，依次：

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
4. 坐标换算、按原版次序填写缺省值（只有 +0x78 的缺省抽取随机数）并排好生成队列（[原版规则辅助](#原版规则辅助)）。
5. `setupHash`（[setup-hash.ts](../../../src/core/world/setup-hash.ts)）：校验后完整 `MissionSetup` 的规范文本（名称、坐标、成员、全部规则输入、阵营、模型与交互标志，以及事件触发）的 fnv1a64，16 位小写十六进制。事件触发按 `groups` 之后、`wingmanOptions` 之前写出，每个区间依次为 `lower`、`upper`、`messages`（字节串按规范文本的字符串规则）与 `summarySelector`；声明与僚机选项的 `eventTrigger` 写在 `aiTarget` 之后（[P3-03/28](../../plan/p3/03/subtasks/28-setup-hash-event-triggers.md)）。语义校验不读取事件触发，创建只在计算 setupHash 时写出它们；Core 不解释或调度它们。它不随种子、僚机、身份或输入键序变化，把世界、快照与 replay 绑定到实际读取的初始数据；不证明来源。

创建结果为 tick 0、时钟 0、没有实体、视角模式与上一视角模式 0xC、任务状态 `built`（原版状态字节 1）、生成开关已置。创建不返回事件：时刻为 0 的项在第一个 tick 实例化。相同输入得到相同的初始快照；世界不与输入或其他世界共享可变状态。重试就是以同一内容与配置新建世界。`initialWorldState(input)`（内部）返回同样校验后的初始状态，供录制、replay 与测试。

### 世界与错误

[world.ts](../../../src/core/world/world.ts) 的 `World`：

- **`step(tickInput)`：** 先用 `readTickInput` 读取并复制整份输入，再由 `registerTick` 预检：tick 或时钟会越过安全整数，或本 tick 可能分配的实体 ID 会越过安全整数时，以 `CoreInputError` 拒绝，世界不变、不锁存。然后按[流水线](#系统流水线)推进恰好一个 tick（tick 加 1，时钟加 `clockUnitsPerTick`），返回本 tick 深度冻结的 `DomainEvent[]`。Core 没有在 `step` 之外推进或补计时间的入口。
- **`projection()`、`renderState()`、`snapshot()`：** 任意时刻可读，不改状态；每次返回新的、深度冻结且与世界脱离的副本，以后的 tick 不改变已返回的数据。
- **错误类型**（[errors.ts](../../../src/core/errors.ts)）：调用者违反契约为 `CoreInputError(path, reason)`；Core 自身失败为 `CoreFaultError(code, site)`，两者互不为子类。`code` 是封闭联合 `invariant-violated`（内部不变量被破坏）、`budget-exhausted`（执行中耗尽 `CORE_LIMITS` 预算）、`world-faulted`（为已故障的世界保留，当前代码没有使用）；`site` 是固定的检测位置标识，例如 `pipeline.events`，不含内容、名称或坐标。
- **故障锁存：** `step` 或读取中出现 `CoreInputError` 以外的错误时，世界保存一个 `CoreFaultError`（其他异常包装为 `invariant-violated`，`site` 为 `world.step`、`world.projection` 等，`cause` 保留原错误），本次调用不发布任何部分事件、projection 或快照；之后四个方法都重抛同一个错误实例。P3-04 据此停止该运行。
- `constructWorld(state)`（内部）：围绕已建的状态构造世界，不接受处理器。

### 契约（contracts/）

- **时钟**（[time.ts](../../../src/core/contracts/time.ts)）：任务时钟是非负安全整数，单位为原版的 1/64 秒（`CLOCK_UNITS_PER_SECOND` = 64），创建时为 0。`DEFAULT_CLOCK_UNITS_PER_TICK` 为 2，即名义上每秒 32 个 tick；`CLOCK_UNITS_PER_TICK` 是“正偶数安全整数”的数值规则。纯函数：
  - `stepSeconds(units)`：一个 tick 的秒数（单位 ÷ 64）；
  - `advanceTime(time, units, path)`：下一个 tick 的 `{ tick, clock }`，越过安全整数时抛出 `CoreInputError`；当前时间或步长不合契约为 `CoreFaultError`；
  - `secondsToClockUnits(seconds, path)`：非负安全整数秒 × 64；
  - `isDue(clock, due)`：`clock > due`，即原版“取样超过到期时刻的第一帧”对应“时钟超过到期时刻的第一个 tick”。

  默认之外的步长只用于 Node 校准测试。32 Hz 是项目的固定步长选择，不是原版帧时序（[已知差异](#已知差异)）。
- **动作输入**（[tick-input.ts](../../../src/core/contracts/tick-input.ts)）：`TickInput` 为 `{ axes, commands }`。
  - `axes` 为 `{ pitch, yaw, roll }`，各为 [−1, 1] 内的有限数；正方向分别为抬头、机头右转、从驾驶员向前看顺时针滚转，不支持的直接操纵保持 0。
  - `commands` 是至多 `commandsPerTick` 个 `Command` 的有序数组，每项在本 tick 按数组顺序处理一次。`Command` 是 16 个变体的封闭判别联合（`COMMAND_TYPES`），每个变体只接受自己的字段，字段与取值按 spec 的[命令形状表](../../plan/p3/02/spec.md#输入与命令)：`fire`、`speed`、`select-number`、`navigate-selection`、`confirm-selection`、`target`、`cycle-main-weapon`、`select-missile`、`toggle-map`、`map-point`、`request-warp`、`communications`、`launch`、`energy`、`damage-report`、`cockpit-front`。
  - `readTickInput(value)`：只接受普通对象与无空位、无额外字段的普通数组；每个值只经属性描述符读取一次，不运行访问器；先查命令数再读元素。结果按规范字段次序新建并深度冻结，−0 变为 0，所以等价的动作得到相同的记录。错误为 `CoreInputError`，路径以 `tickInput` 开头，不回显未知键或值。
- **领域事件**（[domain-events.ts](../../../src/core/contracts/domain-events.ts)）：`step()` 按发出顺序返回可序列化的纯数据，不含对象引用（[ADR-0006](../../decisions/ADR-0006-core-returns-events.md)）。`DomainEvent` 当前是两个变体的联合，基础字段为 `DomainEventBase<Type>` 的 `{ type, tick }`，`tick` 是发出它的 step 的编号：
  - `command-result`：`{ type, tick, commandIndex, commandType, outcome, reason }`。每个结构合法的命令恰有一个。`outcome` 取自 `COMMAND_OUTCOMES`：`accepted` 时 `reason` 为 null，`rejected` 或 `ignored` 时为 `COMMAND_RESULT_REASONS` 中的封闭原因码，目前只有 `not-implemented`。
  - `object-instantiated`：`{ type, tick, entityId, kindBit, source, position }`，每个实例化的对象一个，按实例化次序。`source` 为 `EntitySource { collection: 'mission' | 'wingman', index, group }`，`group` 为 null 或编组成员的 `GroupMembership { index, request, member }`；`position` 为运行时单位的 `Vec3`。
- **规范文本**（[canonical-text.ts](../../../src/core/contracts/canonical-text.ts)）：`canonicalObject(members)` 以显式次序列出对象成员（复制并冻结），`canonicalText(value, path)` 写出紧凑 JSON，`canonicalHash(value, path)` 为其 fnv1a64（16 位小写十六进制）。规则：不接受普通对象，键的插入次序因此不会进入文本；−0 写为 0；非 ASCII 码元一律转义为 `\uXXXX`；非有限值、非规范值、重复成员与超过 `canonicalTextLength` 的文本以 `CoreInputError` 拒绝，由调用者决定是否转为故障。字符串在编码前精确计算转义后的长度，超长时不分配。哈希只是同一版本、同一运行时内的一致性诊断，不证明来源、防篡改或无碰撞。
- **校验读取器**（[validation.ts](../../../src/core/contracts/validation.ts)）：`readDataRecord`、`requireExactFields`、`readExactRecord`、`readList`、`readNumber`（−0 变为 0）、`readChoice`，以及数值规则 `NumberRule`、`numberIn`、`integerIn`。只接受纯数据，每个值经描述符读一次，错误不回显未知键或值。
- **上限**（[limits.ts](../../../src/core/contracts/limits.ts)）：见[上限](#上限)。

### 实体与世界状态（world/）

- **`WorldState`**（[world-state.ts](../../../src/core/world/world-state.ts)）：`config`、只读的 `setup`（不进入快照，由 setupHash 绑定）、`tick`、`clock`、`rngState`（世界自有的 Mulberry32 状态，所有规则抽取都来自它）、`missionStatus`、`entities`、`player` 与 `spawn`。只有流水线修改它。`WorldConfig` 为 `{ content, mission, setupHash, group, slot, rawDifficulty, wingman, seed, clockUnitsPerTick }`，`slot` 是缺省值使用的任务号。`MissionStatus` 目前只有 `built`；后续状态由 P3-11 加入。`createWorldState(config, setup, spawn, rngState)` 为内部函数。
- **实体表**（[entity-table.ts](../../../src/core/world/entity-table.ts)）：`EntityTable` 按原版对象表（[Q-08](../../original/formats/executable.md#runtime-object-table-p3-0201)）组织。
  - `allocate(init)`：ID 从 1 起按分配次序分配，同一世界内不复用（`nextId` 只增不减）；新实体追加到其种类位的表尾。种类位越界或位姿非有限为 `invariant-violated`，超过 `CORE_LIMITS.entities` 个现存实体或 ID 越过安全整数为 `budget-exhausted`。
  - `walk(mask)`：按种类位升序、每张表按分配次序遍历，且是实时遍历：遍历中追加到当前或更高种类位的实体在同一遍被访问，追加到更低位的不被访问。依赖遍历次序的规则（目标选择、AI 等）只能用它。`ALL_KINDS` 是全部种类位的掩码。
  - `remove(entity)`：只在请求处理中调用；遍历进行中移除为故障。`get(id)` 对已移除的 ID 返回 undefined，引用随之失效，不遍历引用方。`byId()` 按 ID 升序，`size` 为现存实体数。
- **实体**：`Entity` 的字段为 `id`、`kindBit`（原版运行时种类的位号 0–31，与内容的 `craftType` 一致，分配时固定；掩码另用 uint32 位集合表示）、`source`（`EntitySource`，运行中创建的实体为 null）、`name`（`NameReference`）、`side`、`baseInteraction`、`presentation`（`EntityPresentation`，目前只有 `{ type: 'model', model }`）、`position`（运行时单位）、`orientation`（`Matrix3`，按行存储的三行姿态）、`placementSerial`、`ruleInputs`（`EntityRuleInputs`）、`state`、`activity` 与 `destroyed`。`EntityInit` 是实例化提供的部分。
  - `NameReference` 为封闭联合：`none`（原版明确的无名分支）、`candidate`（声明引用与候选索引）、`pool`（名称池索引）、`craft-type`（种类位）。候选与池的文字从 setup 解析；种类名文字在 P3-03 导入的 `data/craft-info` 中（CINF 机型记录 +0x04，见[交接](#交接)），不在 setup 中。
  - `EntityRuleInputs` 是实例化时从记录复制的缺省后 i32 值：`percentB`/`percentC`/`percentD`（+0x60–+0x68）与 `aiValueA`/`aiValueB`/`aiValueC`（+0x70–+0x78，即运行时 +0xDC/+0xE0/+0xE4）。
  - `ObjectState` 为原版对象状态的八个值：`new`、`presentation-ready`、`awaiting-presentation`、`destroyed-source`、`area-switch`、`pending-removal`、`active`、`projectile-hit`；`Activity` 为 `parked`、`active`、`docked`。`initialState(activity)` 给出分配或切换停放时的状态（停放为 `new`，否则 `presentation-ready`）；`isActiveState` 为原版状态 7 及以上（`active`、`projectile-hit`）；`isLive` 排除被毁与待移除，查询据此筛选，不能由“仍在种类表中”推断存活。
- **生命周期（Core 的通用部分）：** Core 没有渲染器的完成回调，把表现视为在获得时就绪（项目选择）：以活动状态实例化的实体为 `presentation-ready`，停放的为 `new`。实体在自己的下一次更新中请求进入 `active`，由同一 tick 的请求处理写入；`area-switch` 与 `pending-removal` 的实体在自己的下一次更新中请求离开。离开请求对 `area-switch` 切换停放并重新开始状态，否则移除实体：从种类表摘除，玩家状态若引用它则清为 null；生成计数不减少，名称因不再有实体持有而释放。`destroyed-source` 不更新。被毁（`destroyed`）不等于移除，救援复用玩家实体。被毁、`destroyed-source`、`area-switch`、`pending-removal` 与 `projectile-hit` 由负责规则写入。`awaiting-presentation` 只为对应原版的状态空间而保留，按当前契约不可达；要使用它须先修订 spec。
- **玩家状态**（[player-state.ts](../../../src/core/world/player-state.ts)）：`PlayerState` 为 `{ entityId, viewMode, previousViewMode, subMode }`，`createPlayerState()` 的值为 `{ null, 0xC, 0xC, 0 }`（`COCKPIT_VIEW_MODE` = 0xC）。实例化玩家时写入实体 ID，并把视角模式与上一视角模式设为 0xC；其他写入者归各规则任务。`interactionContext(viewMode)` 按原版的上下文选择给出 `warp`（0–3）、`base`（6）、`map`（8）或 `flight`。
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

| # | 阶段 `id` | 原版 | P3-02 的实现 | 负责接入的任务 |
|---|---|---|---|---|
| 1 | `input-registration` | 项目边界 | 写入本 tick 编号（输入已由 `World.step` 校验，预检由 `registerTick` 完成） | P3-02 |
| 2 | `mission-flow` | `0x3266c`，读取上一 tick 的时钟 | 空 | P3-11（流程、结果、救援）、P3-10（停靠子状态） |
| 3 | `clock` | `0x25894` | 写入新时钟 | P3-02 |
| 4 | `object-update` | `0x20938`：实时种类遍历，玩家最先 | 在玩家更新的位置按数组顺序为每个命令发出结果，再做通用生命周期转换 | P3-06、P3-07、P3-08、P3-09、P3-10（动作效果与各自对象的更新） |
| 5 | `communications-reply` | `0x2cd60` | 空 | P3-10 |
| 6 | `spawn-queue-check` | `0x67018` | 为每个到期项投递生成请求，不实例化 | P3-02 |
| 7 | `request-handling` | `0x20d10` 的消息循环 | 按投递次序处理请求（实例化、状态写入、离开与移除），同一遍处理处理中新投递的请求 | P3-02；新请求类型归各规则 |
| 8 | `movement` | `0x221fc` | 空 | P3-06 |
| 9 | `collision` | `0x29670`、`0x29934` | 空 | P3-07 |
| 10 | `delayed-player-explosion` | `0x23808` | 空 | P3-07 |
| 11 | `energy` | `0x30590` | 空 | P3-07 |
| 12 | `object-sets` | `0x2ede0`（未分析） | 空 | 暂无负责任务；需要它的任务先分析并修订 spec |
| 13 | `parked-update` | `0x2f1b0`，含离开世界 | 空 | P3-06 |
| 14 | `warp-completion` | `0x2bf08` | 空 | P3-09 |
| 15 | `base-interior` | `0x398ec`，视角模式 6 | 空 | P3-10 |
| 16 | `mission-teardown` | `0x334bc`，主流程状态 0 | 空 | P3-11 |
| 17 | `area-check` | `0x3a468` | 空 | P3-06 |
| 18 | `frame-end` | 原版在帧渲染中的规则推进，如 `0x50508` | 空；规则移入 Core，不等待实际渲染帧 | P3-09；P3-12 只消费结果 |
| 19 | `commit` | 项目边界 | 冻结本 tick 事件；请求处理之后投递的请求不处理即丢弃 | P3-02 |

原版派发器开头清空表现项（`0x52c3c`）与结尾放置相机（`0x21584`）不是 Core 阶段：渲染器与音效由 Render State 和事件推出（P3-12 至 P3-14）。

- **`TickContext`、`registerTick`、`runTick`：** `registerTick(world, input)` 在第一次改动前完成可拒绝的检查并返回本 tick 的上下文 `{ world, time, input, events, requests }`；`runTick(context)` 依次运行各阶段并返回冻结的事件。两者与 `PIPELINE` 都是内部接口。
- **`emit(context, event)`：** 存入深度冻结的脱离副本；一个 tick 超过 `eventsPerTick` 个事件为 `budget-exhausted`。后续阶段可以读取本 tick 已发出的事件；事件列表与请求列表都不跨 tick 保留。
- **`Request` 与 `RequestQueue`：** 请求是原版派发器消息的对应物，是内部记录，不是 `DomainEvent`。现有类型为 `set-state`（消息 0x200）、`leave`（消息 0x20）与 `spawn`（消息 0x4000）。处理次序为任务流程、对象更新（按遍历次序）、生成队列检查，然后是处理中新投递的请求；主体已被移除的请求被丢弃。投递数也受 `eventsPerTick` 约束（见[上限](#上限)）。
- **命令判定：** 目前没有规则处理命令，每个命令得到一个 `rejected`/`not-implemented` 结果且不改状态；规则任务按命令类型替换这一判定。
- **请求处理中实例化的实体**在本 tick 不更新，也不参与之后的运动与碰撞；它的第一次更新在下一个 tick。

**生成阶段**（[systems/spawn.ts](../../../src/core/systems/spawn.ts)，Q-01、Q-07）：

- `checkSpawnQueue(world, requests)`（`spawn-queue-check`）：生成开关已置时，按队列次序取出每个到期项（`isDue(clock, due)`），投递 `requests` 个 `SpawnRequest { type: 'spawn', source, index, request }`。概率为 100 时必然投递，不抽取；未填写缺省的模板的来源值 0 永不投递。
- `dispatchSpawn(world, request, emit)`（请求处理）：段 1 记录与僚机放置并实例化一个对象，记录计数加 1；编组请求按布局周期放置锚点，逐个成员实例化，编组计数加 1。实例化写入种类、来源、名称、阵营、模型、交互标志、位置、姿态（玩家为单位矩阵，其他为放置姿态）、活动（玩家为活动；其他对象只在有玩家实体且 x/y 距离平方小于 56,250,000 时为活动，否则停放）与规则输入副本，并发出 `object-instantiated`。随机抽取写回世界的 RNG 状态。
- **实体初始化扩展点**在 `instantiate` 中、分配之后，是 Core 内部的静态调用位置，不是外部回调。规则任务按 Q-07 的次序在此加入各自的初值与抽取：`0x3060c`（P3-07）、`0x68050`（P3-08）、Warp 计时 +0xC8（P3-09）、`0x20990`（P3-08）、`0x38cd4`（P3-10）。
- 供其他规则在 Core 内使用的接口（P3-11）：`isSpawningEnabled`；`disableSpawning`（任务结束时清除开关，之后不再处理队列，不会再置）；`pendingSpawns`（待生成项的冻结副本，供全清判定）；`placeWorldRecord(world, record, rand)`（放置服务，供救援放置）。实例化通知就是本 tick 事件列表中的 `object-instantiated`。

### 原版规则辅助

[rules/](../../../src/core/rules/) 中的规则辅助按原版代码实现换算、随机映射、放置、缺省、排程与名称。它们确定、不依赖宿主；受控的状态变化只有经 `RandSource` 消耗世界 RNG，以及修改调用者显式传入的世界计数（如名称池计数）。原版事实见 executable 的[放置与数值](../../original/formats/executable.md#placement-runtime-scale-and-numbers-p3-0202)与[生成队列与实例化](../../original/formats/executable.md#spawn-queue-defaults-names-and-instantiation-p3-0203)；测试期望来自 P3-02/02、03 的独立推导，不由被测实现计算。

- **数值**（[float32.ts](../../../src/core/rules/float32.ts)）：位置与姿态以 f32 存储，中间运算用 JS 双精度。每次 f32 写回都就近舍入、平局取偶（`Math.fround`）；浮点转 i32 一律向零截断。这是用户批准的 Q-11 决定（[goal 执行记录](../../plan/p3/02/goal.md#执行记录)的“Q-11 舍入方向改为就近（用户批准）”），依据见[已知差异](#已知差异)。`FLOAT32_MAX` 与 `isFiniteFloat32` 用于校验。
- **坐标**（[coordinates.ts](../../../src/core/rules/coordinates.ts)，Q-03）：
  - `runtimeFrame({ coordinates, mapFrame }, path)` 返回 `RuntimeFrame { sectors, scaleFactor }`：扇区数 n = 2 × halfExtent ÷ referenceScale，q = f32(15000 ÷ referenceScale)（`RUNTIME_SCALE` = 15000）；只接受本切片的地图框架。世界矩形为 ±7500n，全世界缺省的范围为 15000n。
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
  - 世界边界处理之后的扇区资源测试不抽取，属于实例化（见[已知差异](#已知差异)）。
- **缺省值**（[record-defaults.ts](../../../src/core/rules/record-defaults.ts)，Q-04）：`fillRecordDefaults(inputs, missionDefault, rand)` 按字段填写，只在 +0x78 为空时抽取一次；`unfilledRuleInputs` 给不填写的记录（只从段 5 可达）保留来源值，空为 0；`missionDefault(group, missionNumber)` 为 (组 + 3) × 任务号，任务号小于 1 时为 100；`randomAiValue` 为 rand % 60 + 20；`toInt32` 是原版对 u32 来源值的 i32 视图。各字段的空值、负值与钳位语义见 executable 的[记录缺省](../../original/formats/executable.md#record-defaults-p3-0203)。
- **排程**（[spawn-schedule.ts](../../../src/core/rules/spawn-schedule.ts)，Q-01、Q-06）：`buildSpawnState(setup, geometry, options, rand)` 按数组次序填写段 1 记录的缺省并入队，玩家记录（`PLAYER_KIND_BIT` = 0）之后紧接所选僚机（时刻 0，锚点为玩家记录），再按次序入队编组；队列按到期升序，同刻保持插入次序。`isScheduledRecord` 判断记录是否单独排程（有种类、`object` 来源、不是编组成员）。`RuntimeGeometry` 与 `ScheduleOptions` 是世界创建换算后的几何与 `{ group, wingman }`。
- **名称**（[name-assignment.ts](../../../src/core/rules/name-assignment.ts)，Q-05）：`assignName(setup, entities, poolUses, record, rand)` 按 executable 的[名称](../../original/formats/executable.md#names-p3-0203)规则返回 `NameReference`；占用按文字比较，由现存实体持有，池计数在世界状态中，只在随机候选与名称池分支各抽取一次。

### Projection 与 Render State

- **projection**（[projection.ts](../../../src/core/projections/projection.ts)）：`Projection` 是深度冻结、与世界脱离的纯数据，不提供全体实体列表。
  - 就绪分区：`clock` 为 `{ tick, clock, clockUnitsPerTick }`；`mission` 为 `{ mission, group, slot, rawDifficulty, wingman, status }`；`player` 为 `{ entityId, viewMode, previousViewMode, subMode, interactionContext }`。UI 使用 `interactionContext`，不复制上下文的选择。
  - `flight`、`map`、`communications`、`result` 四个分区目前都是 `NotImplementedPartition { readiness: 'not-implemented' }`，不以空列表、0 值、全图可见或胜利冒充缺少的规则。各分区的 ready 类型（`FlightReady`、`MapReady`、`CommunicationsReady`、`ResultReady`）按 spec 的[分区表](../../plan/p3/02/spec.md#projection-与-render-state)定义。spec 留给负责任务研究的部分是 `never` 占位，负责任务须先按[扩展规则](#扩展规则)修订 spec 定义它们，分区才能就绪：`FlightResourceName`（P3-07）、`WeaponRecordReference`（P3-03 导入，P3-07 定引用）、`MapMarkerClass` 与 `MapVisibility`（P3-09）、`MenuContentReference`（P3-03 导入，P3-10 定引用）、`OptionUnavailableReason`（P3-10）、`ResultReason` 与 `ResultMessageReference`（P3-11）。
- **Render State**（[render-state.ts](../../../src/core/projections/render-state.ts)）：`RenderState` 为 `{ tick, viewMode, observedEntityId, entities }`，`observedEntityId` 为玩家实体 ID 或 null；`entities` 是按 ID 升序的可呈现实体 `RenderEntity { id, kindBit, presentation, position, orientation, placementSerial }`。
  - 停放的实体不呈现（原版不为停放对象保留渲染对象）。被毁的实体在移除前仍列出；移除后消失。
  - 新 ID 只用当前位姿；同一 ID 的放置序号变化表示非连续移动（Warp 到达、救援、离港放置），渲染器不跨此插值。
  - 渲染器之外的消费者不得从 Render State 推导规则信息（地图标记、目标列表等）。两帧保留与跨运行折叠归 P3-04。

### 快照、录制、replay 与比较

- **快照**（[snapshot.ts](../../../src/core/replay/snapshot.ts)）：`World.snapshot()` 返回深度冻结、脱离世界的 `GameSnapshot { format: 'osr-game-snapshot', version: 1, rulesVersion, state }`（`GAME_SNAPSHOT_FORMAT`、`GAME_SNAPSHOT_VERSION`）。
  - `SnapshotState` 是除静态 `setup` 外的全部权威状态：`config`（完整内容身份、任务、setupHash、原始难度、组、槽位、僚机、种子、每 tick 单位）、`tick`、`clock`、`rngState`、`nextEntityId`、`entities`（按 ID）、`kindOrder`（全种类遍历的 ID 次序）、`spawn`（`SnapshotSpawn`：缺省后的记录及其声明引用，即别名关系、僚机记录、编组的布局/计数/首成员、队列、开关、池计数）、`missionStatus` 与 `player`。名称占用由持有名称的实体表示。
  - `snapshotText(snapshot)` 与 `snapshotHash(snapshot)`：规范文本按每个类型的显式成员写入器输出，实体按 ID 排序，其余列表保持次序；状态哈希是整个快照（含版本）规范文本的 fnv1a64。写入器的映射类型要求 `SnapshotState` 等类型的每个成员恰好写一次，因此给世界状态或实体加字段而不更新写入器时 `pnpm typecheck` 失败。
  - 快照是诊断与检查点的来源，不是存档；Core 不提供从快照恢复世界的接口（P4）。`takeSnapshot` 为内部函数。
- **`RULES_VERSION`**（[rules-version.ts](../../../src/core/replay/rules-version.ts)，当前为 1）：由代码持有，快照与录制只声明制作时的版本，replay 只接受当前版本。凡同一配置、内容与 tick 输入可能得到不同结果的修改都必须递增它：流水线的阶段或次序、数值语义、RNG 抽取或其次序、动作的解释、规则发出的事件或保存的状态。快照或 replay 记录的结构变化递增各自的格式版本；两者都变时都递增。旧组合一律拒绝，不做迁移。
- **录制**（[recording.ts](../../../src/core/replay/recording.ts)）：`createRecordingSession(input, { producer, checkpointInterval })` 与 `createWorld` 一样创建世界，返回同时是 `World` 的 `RecordingSession`。
  - 会话记录每个成功 tick 实际交给 `step` 的规范输入、全部事件与检查点：tick 0、`checkpointInterval` 的每个正整数倍，以及导出时补上的最后一个 tick（去重）。`producer` 为 1–128（`PRODUCER_MAX_LENGTH`）个 UTF-16 码元的字符串，只作诊断；间隔为正安全整数。
  - `exportRecording()` 返回深度冻结、脱离的 `Recording { record, result }`：`ReplayRecord { format: 'osr-game-replay', version: 1, rulesVersion, producer, content, mission, setupHash, run, checkpointInterval, ticks }`（`ticks[k]` 是 tick k + 1 的输入，稠密数组，`run` 是 `EffectiveRunConfig`）与 `ReplayResult { events, checkpoints, finalTick }`（`ReplayCheckpoint { tick, hash }`）。之后的 tick 不改变已导出的数据。
  - 容量：`requireRecordingCapacity(counts, commands)` 在执行下一个 tick 前检查 tick、命令与事件容量，事件在 tick 执行前未知，所以每个 tick 开始前须至少保留 `eventsPerTick` 的最坏情况容量（最后一个获准执行的 tick 可以用掉这部分并恰好填满上限）；检查点数不另查。超出时以 `CoreInputError`（路径 `recording`）拒绝，世界与录制都不变。
  - 故障：会话锁存世界的 `CoreFaultError`；检查点无法写成规范文本时锁存为 `invariant-violated`/`recording.checkpoint`。此后包括导出在内的每次调用都抛出该故障，不输出貌似完整的前缀。
  - `recordState`、`readProducer`、`readCheckpointInterval`、`readHash` 为内部函数（与 replay 共用）。
- **replay**（[replay.ts](../../../src/core/replay/replay.ts)）：`replayRecord(record, content)`，`content` 为 `ReplayContent`，即 `createWorld` 输入去掉 `run`。
  - 先校验整份记录：格式、版本、`rulesVersion`（不同版本即使字段不同也报版本），然后精确字段、producer、内容身份、任务、setupHash 格式、run 的四个字段（取值由世界创建校验）、间隔与 ticks（读取元素前检查长度，累计命令不超过 `recordedCommands`）。
  - 再比较 `contentIdentityKey`，用调用者的内容与记录的 run 创建世界，比较任务与 setupHash；同一声明身份下换了 setup 的内容因此被拒绝。最后按记录的间隔录制执行全部 tick，返回 `ReplayResult`。
  - 任何失败都抛出，不返回部分结果：记录的问题为 `record…` 路径的 `CoreInputError`（tick 的错误在 `record.ticks[k]`），内容参数的问题为 `content…` 路径；内容 Asset 或身份结构错误保留 `ContentContractError`，Core 故障保留 `CoreFaultError`。
- **比较**（[compare.ts](../../../src/core/replay/compare.ts)）：`compareReplayResults(expected, actual)` 先校验两侧（字段、`finalTick` 与检查点的容量、检查点从 0 严格递增到 `finalTick`、哈希格式、事件按 `DomainEvent` 联合逐字段、事件 tick 不减且在 1–`finalTick`、每 tick 事件数、每 tick 命令结果的 `commandIndex` 从 0 连续、命令结果与事件总数），坏的一侧以 `expected…` 或 `actual…` 路径的 `CoreInputError` 拒绝。返回 `ReplayComparison`：`{ match: true }` 或 `{ match: false, tick, kind }`，`kind` 为 `events`、`checkpoint` 或 `length`。
  - 共有的 tick 内先比事件再比检查点；较短运行末帧单独附加的尾检查点，在较长一侧没有对应采样时不算差异；共有部分一致而长度不同时，在较短运行的首个缺失 tick 报告 `length`。
  - 报告的是最早**可观测**的分歧，不是首次内部状态偏离：间隔大于 1 时，两个检查点之间已恢复的差异观察不到；没有可观测影响的输入改动不算分歧。

### 上限

`CORE_LIMITS`（[limits.ts](../../../src/core/contracts/limits.ts)）是冻结的有限常量，保护内存与时间，不是原版玩法上限：原版分配器没有规则层面的上限，内存耗尽即结束程序（[对象表](../../original/formats/executable.md#runtime-object-table-p3-0201)），所以项目的故障预算没有原版对应物。调用者不能提高它们。依据以所选任务的规模（9 条记录、3 个编组，排程数十个实例）与默认 32 tick/s 计：

| 名称 | 值 | 依据 |
|---|---|---|
| `commandsPerTick` | 64 | 大于命令联合的 42 种不同命令（`map-point` 按操作计），一个 tick 可以请求全部 |
| `entities` | 2,048 | 现存实体，含运行中产生的弹丸、爆炸与碎片；超过所选任务实例数的 50 倍，每个按 1 KiB 计为 2 MiB |
| `spawnExpansion` | 1,024 | 一个世界由声明可排程的实例数（请求数 × 成员数之和）；超过所选任务的 25 倍，为 `entities` 的一半 |
| `eventsPerTick` | 4,096 | 不小于 `commandsPerTick` + `spawnExpansion` + `entities`（3,136）：每个命令结果、同时到期的全部生成与每个实体一个规则事件都装得下 |
| `recordedTicks` | 131,072 | 一次录制或 replay 的 tick 数，默认速率下 68 分钟，是切片任务的数倍 |
| `recordedCommands` | 262,144 | 平均每 tick 2 个命令，例如每 tick 按住开火再加一个动作 |
| `recordedEvents` | 524,288 | 平均每 tick 4 个事件；每个约 120 个 JSON 字符，至多 64 MB |
| `recordedCheckpoints` | 131,073 | tick 0 加每 tick 一个，所以间隔为 1 也装得下 |
| `canonicalTextLength` | 16,777,216 | 实体达上限、每个 4 KiB 的快照为 8 MiB，是它的一半 |

- `fitsLimit(name, used, added)` 与 `productFitsLimit(name, count, each)` 在不形成和或积的情况下判断是否超限，对非安全整数一律返回 false；容量在分配或执行之前检查。
- 请求不另设上限，每 tick 的投递数也受 `eventsPerTick` 约束（[goal 执行记录](../../plan/p3/02/goal.md#执行记录)）：一个世界一生至多投递 `spawnExpansion` 个生成请求（空编组的请求也计 1），每个现存实体的更新每 tick 至多投递一个生命周期请求，二者之和 3,072 在上限之内。规则的请求若会进一步扇出，由其任务推出自己的上界并修订 `CORE_LIMITS`。

### 扩展规则

规则按 spec 的[扩展规则](../../plan/p3/02/spec.md#扩展规则)接入，不获得自行扩展共享 API 的授权：

- **必须先修订 spec 的情形：** 新增或改变实体字段或种类、`Command`/`TickInput`、`DomainEvent` 或命令原因码、projection 分区的形状、Render State、快照或 replay 记录的形状、阶段或其次序、事件可见的时机，以及其他公开语义。修订须同步受影响的下游 spec 并取得批准；只在下游 spec 或本文件记一笔不够。不得用开放索引签名或 `unknown` 载荷绕开契约。
- **由下游 spec 自行批准的情形：** 把已约定的分区从 `not-implemented` 变为真实数据，实现既定动作的效果，填充自己阶段的 `run`，在实体初始化扩展点按 Q-07 次序加入初值与抽取。内部 helper 的变化不需要重审 P3-02。
- **代码上的落点：**
  - 阶段：在 `PIPELINE` 中给自己的阶段提供 `run`，不新增回调或订阅；改变阶段表本身须修订 spec。
  - 命令：替换 `object-update` 中对相应命令类型的 `not-implemented` 判定；新增拒绝或忽略原因须修订 spec 并加入 `COMMAND_RESULT_REASONS`。
  - 实体字段：加入 `Entity`/`EntityInit` 与快照写入器（类型检查强制）；无模型的运行时种类加入自己的 `EntityPresentation` 变体，未实现的种类没有构造入口。
  - 事件：加入 `DomainEvent` 联合与 compare.ts 的事件字段表（类型检查强制），并补比较的校验。
  - 请求：加入 `Request` 联合与 `handleRequest`，投递数遵守[上限](#上限)。
  - 任务状态：P3-11 扩展 `MissionStatus`。
- **版本：** 每次规则结果可能变化时递增 `RULES_VERSION`，结构变化时递增相应的格式版本（[快照、录制、replay 与比较](#快照录制replay-与比较)）。
- **数值：** 新的 f32 写回用 `Math.fround`，浮点转整数向零截断；定点或查表须有原版证据（[总计划 §5](../../plan/master-plan.md#5-状态管理与通信约定)）。

### 已知差异

以下差异已公开，不是“与原版一致”的声明。新版与原版的对照结论（R-01 至 R-03）见 [P3-02/11 的完成证据](../../plan/p3/02/subtasks/11-comparison-docs-handoff.md#完成证据)。

- **时间：** 32 Hz 固定步长是项目选择。原版每帧取 0、2、4 或更多时钟单位，游戏时钟相对模拟器时间偏慢且依赖 cycles（[B-006](../../original/behavior/B-006-simulation-timing.md)，U-021 未冻结）；Core 不模拟零步长帧与这一速率。G-02 占位期间不推进、结束后不补计时间。原版取样从随机值起算，依赖绝对取样值的规则由负责任务显式建模。原版首轮队列检查的原点包含构建与过场用时，Core 在时钟 2 的第一个 tick 实例化时刻 0 的项。依赖帧数或步长的规则由各自任务按 B-006 对照。
- **表现就绪：** Core 在实例化时视表现为就绪，从不进入 `awaiting-presentation`；原版等待异步载入的时长未追踪。
- **输入：** Core 逐 tick 处理命令数组；原版每次轮询最多处理一个键，其余丢弃（[输入轮询](../../original/formats/executable.md#input-polling-p3-0201)）。spec 规定地图开启时防御性屏蔽飞行操纵，原版保持已读到的主炮电平；该门禁随 P3-09 的地图模式实现。
- **随机数：** 不复现原版序列。每次 rand() 取世界 RNG 一次抽取的高 15 位，相邻调用按独立均匀建模（原版 LCG 相邻值的联合分布未分析）。概率为 100 时原版仍掷一次 rand % 100，Core 不抽取。P3-06 至 P3-10 负责的实例化抽取（`0x3060c`、`0x68050`、+0xC8、`0x20990`、`0x38cd4`）加入之前，Core 的抽取次数与原版不同。
- **僚机记录：** 原版每次程序运行只在首次排程时填写 SCCT 僚机记录的缺省值（含随机的 +0x78），其 +0x18 计数跨任务累计；Core 每个世界重新填写、重新计数（重试就是新世界）。
- **未表达或未实现的分支：** +0x80（战役简报前的抛硬币）内容契约不能表达，切片未用；实例化后的扇区资源测试 `0x6a0b8`/`0x6a11c` 何时失败未确认，Core 视为总是通过；主流程状态 1 不实例化的门禁（`0x339cc`）随 P3-11 的主流程状态加入；网格路线与固定高度种类在创建时拒绝。
- **数值：** Core 的 f32 写回一律就近舍入，与两次合格原版运行中 77 个能区分两种舍入的放置一致（[B-007](../../original/behavior/B-007-mission-instantiation.md)）；原版代码推论的“渲染后向零”与此矛盾，原因未查明，重试与后续任务未观察（[U-009](../../original/unknowns.md)）。原版姿态第一行的 z 可以是 −0，Core 写 +0，规范文本不区分。支持的数值域之外（见[原版规则辅助](#原版规则辅助)）由世界创建拒绝。

### 交接

P3-02 只交付共同契约与接入位置，不声明下游玩法已经完成。

- **P3-03：**
  - 种类名：CINF 机型记录 +4 的文字不在三份逻辑 Asset 中，Core 只给出 `{ type: 'craft-type', kindBit }`。需要导入切片用到的种类位 0、7、8、14，以及僚机名单的种类位 1。
  - 实例化与 Warp 计时读取的机型记录字段：`0x2d400`、`0x3060c`、`0x30e0c` 与 +0xD0；+0xA4、+0xA8。
  - projection 占位需要的武器记录（`WeaponRecordReference`）、通讯菜单（`MenuContentReference`）与结果消息（`ResultMessageReference`）的内容来源。
  - **P3-03 已交付的内容：** `logic` 组的 `data/craft-info`（TABL 4003 所选倍率与 CINF 4037 的全部记录，含机型记录 +0x04 的名称与 +0xA4 等字段）、`data/debris-parameters`、`data/ai-programs`、`data/comm-menus`、`data/base-repair-items` 与 `data/flight-messages`，`models` 组的场景设置、爆炸表与星云列表，`cockpit-hud-map` 组的视角标签与 HUD 文字，以及任务 payload 的段 2 事件触发（`MissionSetup.eventTriggers`）。读取器与形状见[内容模块](./content.md#规范-json-与规则数据-payload)。`createWorld` 仍只接收三份逻辑 Asset；把这些数据接入 Core 的输入与规则归使用它们的规则任务。
- **P3-04（已交付）：** 正式 Runtime、游戏会话与任务流程按下列约定接入 Core，接口见 app 模块说明的[正式 Runtime](./app.md#正式-runtime)、[游戏会话](./app.md#游戏会话)与[任务流程与所有者](./app.md#任务流程与所有者)，工程要点见[工程约定](../README.md#正式-runtime)。
  - 创建：任务所有者从同一个经 `validatePackage` 验证的资源包解码三份逻辑 Asset（[mission-input.ts](../../../src/app/resources/mission-input.ts)），连同该包的 `ContentIdentity` 经会话的 start 交给 Runtime；Core 不认证来源。生产只用难度 19 与默认步长，僚机来自开始配置，种子为平台抽取的 uint32。开发构建用 `createRecordingSession`（检查点间隔 32），生产用 `createWorld`。创建失败（`ContentContractError` 或 `CoreInputError`）留在开始配置页显示类别、路径与原因。
  - 调度：按宿主单调时钟以每秒 32 个 tick 调度，每帧至多 5 tick，超出不补跑。暂停、页面隐藏、任务菜单与 G-02 占位期间不调用 `step`，之后不补跑；会话不读取 Core 状态来暂停，战略地图、通讯菜单、基地内部、停靠倒计时、救援前的引擎内过程与结果延时照常模拟。
  - 动作批次：待执行队列上限 256，每 tick 至多 64 个命令（按住主炮每 tick 占一个），余项按 FIFO 顺延；暂停、继续、退出与返回菜单不是游戏命令。反馈按每个 tick 自己批次的 `commandIndex` 关联 commandId。
  - 错误：`step` 以路径 `recording` 的 `CoreInputError` 拒绝时是录制容量停止（运行 `stopped`，录制仍可导出）；其他 `CoreInputError` 与 `CoreFaultError` 使运行故障，之后不再向 Core 读取新的快照或导出。
  - 读模型：每个成功 step 后同 tick 取得 projection 与 Render State，保留两帧，暂停、保持、停止与故障时折叠；重开是新运行（runId 递增、tick 0），不连接两次运行。React 桥接按 10 Hz 采样，任务状态、交互上下文、分区就绪与结果的变化立即发布；开发诊断经按需快照读取，不进入生产界面；`mission` 分区的僚机选择决定出发占位的变体。
  - 录制：开发构建导出 Core `Recording` 的 JSON，`producer` 为应用名、版本与构建模式；[tools/replay-check.ts](../../../tools/replay-check.ts) 在 Node 中以同一 CloneCD 文件组用 `replayRecord` 与 `compareReplayResults` 核对（[工具指南](../../guides/tools.md#录制重放核对)），P3-15 使用同一路径。
  - 运行中衔接（下游）：P3-04 只实现初始出发保持（G-02/2，会话 `transition`）。运行中的停靠、离港与结果衔接（G-02/3 起）所需的 Core 状态、输出、继续条件与 replay 语义，由 P3-10、P3-11 按[扩展规则](#扩展规则)确定，并共同修订 P3-04 spec 的运行中衔接；当前没有每 tick 的外部检测器或写回 Core 的入口。占位的显示、计时与生命周期可以复用（[P3-04 衔接占位](../../plan/p3/04/spec.md#衔接占位)）。
- **P3-05：**
  - 动作采样：把设备输入映射为 `TickInput`，不传扫描码或物理键名；轴的正方向按[契约](#契约contracts)，到原版数学轴的映射由 P3-06 与 Q-11 核实。
  - 按住开火：按住期间每个采样的 tick 产生一个 `fire` 命令；两次采样之间的短按也保留一次；不用 OS 自动重复决定射速；Core 不保存永久的按住标志。
  - 清键：暂停、隐藏、失焦、退出 Pointer Lock 与 G-02 衔接时清除外部按住状态与未执行队列，恢复后只采纳新按下。Core 没有按键缓冲，不会重放旧输入。会话已在暂停、隐藏与结束时自行清除意图与队列，失焦与退出 Pointer Lock 由输入适配器调用会话的 `clear-input`（P3-04 已交付）；按住开火的电平经 Runtime 的连续意图 `primaryFire` 设置。
  - Q-10（已确认，代码）的事实见 executable 的[输入轮询](../../original/formats/executable.md#input-polling-p3-0201)与 [B-005](../../original/behavior/B-005-campaign-rescue.md) 的被毁视角：轮询节奏与“每次一键、其余丢弃”、按视角模式选择上下文、Alt 作为电平与空格作为单次请求、缓冲只由过场清空、被毁期间不轮询游戏按键。逐 tick 命令是 spec 有意的差异（[已知差异](#已知差异)）。物理键位研究（U-011）与绑定归 P3-05。

实例化写入的、依赖机型记录或其他规则的初值与抽取，原版事实见 executable 的[实例化](../../original/formats/executable.md#instantiation-p3-0203)，逐任务的清单见 [03 的交接](../../plan/p3/02/subtasks/03-spawn-defaults-names-research.md#完成证据)；输入与流水线方面的交接见 [01 的交接](../../plan/p3/02/subtasks/01-pipeline-entity-input-research.md#完成证据)。下面只列负责的阶段、分区与扩展点上的义务。

- **P3-06：** `movement`、`parked-update`（含离开世界）与 `area-check` 阶段；`speed` 命令与轴的效果；`flight` 分区（与 P3-07）；玩家起飞初始状态（R-05）。扩展点：移动块与初速、停放更新时刻 +0x18；实例化时的停放判定与活动区域检查共用同一个测试，Core 目前在 [spawn.ts](../../../src/core/systems/spawn.ts) 的 `startsActive` 中只实现了实例化时的部分。`a` 切换的标志（高概率是自动驾驶）是否进入 P3 由 P3-06 决定，目前不在命令联合中。
- **P3-07：** `collision`、`delayed-player-explosion` 与 `energy` 阶段；`fire`、`target`、`cycle-main-weapon`、`select-missile`、`energy`、`damage-report` 的效果；`flight` 分区的资源与武器。扩展点：`0x3060c`（含 1 次抽取）及武器挂点、+0xD0 等依赖机型记录的字段。写入被毁标志、`destroyed-source` 与 `projectile-hit`；弹丸在发射帧的请求处理中产生，本 tick 不运动；玩家的目标在该对象停放时清除，Core 的离开处理目前不涉及目标。
- **P3-08：** 扩展点：`0x68050`（初始目标，抽取次数取决于当时的对象）与 `0x20990`（AI 程序）。使用实体的 `aiValueA`–`aiValueC`、记录的 `aiTarget`/`aiTargetCraftTypes` 与编组的 `leader`；成员相对布局首项的偏移（原版对象 +0x80）尚未存储，由 P3-08 按需加入。AI 在对象更新中分配对象时受实时遍历影响：更高种类位的新对象在同一遍更新。
- **P3-09：** `warp-completion` 与 `frame-end` 阶段；`toggle-map`、`map-point`、`request-warp` 的效果与 `map` 分区；地图开启时屏蔽飞行操纵与飞行命令的门禁。扩展点：Warp 计时 +0xC8（含 1 次抽取）；Warp 中活动区域的中心另有规则。世界框架已由 `runtimeFrame` 校验。
- **P3-10：** `communications-reply` 与 `base-interior` 阶段，以及 `mission-flow` 中的停靠子状态；`communications`、`launch`、`select-number`、`navigate-selection`、`confirm-selection` 在通讯与基地上下文中的解释，僚机命令经菜单转给 P3-08；`communications` 分区。扩展点：`0x38cd4`（敌方类对象实例化时的僚机报告）。
- **P3-11：** `mission-flow` 与 `mission-teardown` 阶段、`MissionStatus` 的后续状态、`result` 分区。使用 `disableSpawning`（成功时清除生成开关）、`pendingSpawns`（全清判定）、`placeWorldRecord`（救援放置，存储位置路线）与事件列表中的 `object-instantiated`（段 2 触发计数，触发与区间来自 `MissionSetup.eventTriggers`）；对象事件的按种类计数与触发标志在扩展点接入。主流程状态 1 的实例化门禁（`0x339cc`）随状态加入。被毁不等于移除，救援复用玩家实体。
- **P3-12、P3-13：** 消费 Render State（停放不呈现、放置序号、新 ID 只用当前位姿、被毁在移除前仍列出）与 projection；相机由 Render State 与视角模式推出；`cockpit-front` 的效果与被毁视角的门禁按原版（B-005）。名称文字：候选与池从 setup 解析，种类名来自 P3-03 导入的 `data/craft-info`（CINF 机型记录 +0x04，见上文 P3-03 一条）。
- **P3-14：** 音效由领域事件与 projection 触发；原版派发器每遍清空的表现项不是 Core 阶段。
- **Q-11 的数值交接（P3-06、P3-07）：** x87 以双精度运算，位置与姿态以 f32 存储；f32 写回按用户批准的决定就近舍入（取代 P3-02/02 完成证据中“继承向零舍入”的说法），浮点转整数向零截断，长度用 FSQRT。运动中的姿态旋转用 FSIN/FCOS（已确认），映像中没有找到正弦或余弦表（高概率），见 executable 的 [x87 一节](../../original/formats/executable.md#x87-precision-rounding-and-trigonometry-p3-0202)。舍入方向与代码推论的矛盾仍是 U-009 的开放问题。

### 针对性检查

- 全部 Core 与边界回归：`pnpm exec vitest run src/core tools/engineering-boundaries.test.ts`。
- 按目录：`pnpm exec vitest run src/core/contracts`、`src/core/world`、`src/core/systems`、`src/core/rules`、`src/core/projections` 或 `src/core/replay`。
- 规范文本、录制与比较中各有一组按上限规模运行的用例，声明 30 s deadline（[工程约定](../README.md#测试)）。
