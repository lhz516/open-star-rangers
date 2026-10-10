---
type: guide
status: active
phase: all
updated: 2026-10-10
related: [ADR-0004, ADR-0006, ADR-0015, B-006, B-007, U-008, U-009, U-011, U-021]
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

[P3-02](../../plan/p3/02/spec.md)（[goal](../../plan/p3/02/goal.md)）交付正式契约、世界、固定流水线、任务实例化、读模型、快照与 replay。[P3-06](../../plan/p3/06/spec.md)（[goal](../../plan/p3/06/goal.md)）在其上加入世界创建的机型输入、实体飞行状态与玩家控制状态、[飞行控制、运动与停放](#飞行控制运动与停放)的规则，以及 `flight` 分区的运动组；它对 P3-02 契约的修订汇集在 P3-02 spec 的 [P3-06 的契约修订](../../plan/p3/02/spec.md#p3-06-的契约修订检查点-a)。契约以这两份 spec 为准，本节只记录交付的 API。Core 之外的使用者（P3-04 的 Runtime、本地核对工具、P3-15 的 Node 重放）只使用以下入口及其返回的世界与只读数据：

| 入口 | 模块 | 作用 |
|---|---|---|
| `createWorld(input)` | [world/create-world.ts](../../../src/core/world/create-world.ts) | 由三份逻辑 Asset、机型数据、内容身份与运行配置创建世界 |
| `World` 的 `step`、`projection`、`renderState`、`snapshot` | [world/world.ts](../../../src/core/world/world.ts) | 推进与读取 |
| `createRecordingSession(input, options)` | [replay/recording.ts](../../../src/core/replay/recording.ts) | 创建同时录制的世界 |
| `replayRecord(record, content)` | [replay/replay.ts](../../../src/core/replay/replay.ts) | 在新世界中重放录制 |
| `compareReplayResults(expected, actual)` | [replay/compare.ts](../../../src/core/replay/compare.ts) | 报告最早可观测的分歧 |
| `snapshotText`、`snapshotHash` | [replay/snapshot.ts](../../../src/core/replay/snapshot.ts) | 快照的规范文本与状态哈希 |

标为“内部”的函数只供 Core 自己与 Core 测试使用，不是生产 API；规则任务按[扩展规则](#扩展规则)改动 Core 内部，不向生产入口注入处理器。

### 世界创建

`createWorld(input)` 的输入 `CreateWorldInput` 为 `{ mission, craftTypes, wingmanRoster, craftInfo, identity, run }`（外层由 `readExactRecord` 校验）：前三项与 `loadMission` 相同；`craftInfo` 是同一资源包的 `data/craft-info` 规则数据 Asset，形状同为 `{ id, content }`，由调用者用该包的 `decodeRuleDataPayload` 解码（[P3-06 的 D-01](../../plan/p3/06/spec.md#对-p3-02-契约的增量)）；`identity` 是四份 Asset 所在资源包的 `ContentIdentity`；`run` 是运行配置。创建对应原版的任务构建，依次：

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
4. 机型输入（[craft-info-input.ts](../../../src/core/world/craft-info-input.ts) 的 `readCraftInfoInput`）：外层恰为 `{ id, content }`，否则为 `CoreInputError`；Asset ID 的语法错误保留 `readAssetId` 的 `ContentContractError`，不是 `data/` 类的 ID 为 `CoreInputError`；来源为 `original-import` 的内容只接受 `PRODUCTION_CRAFT_INFO`（`data/craft-info`）。内容经 `readCraftInfo` 读入冻结、与输入脱离的副本 `WorldCraftInfo { id, content }`（读取器的错误原样传递，非有限的 f32 在此被拒绝），不重复应用内容转换。
5. 按原版次序填写缺省值（只有 +0x78 的缺省抽取随机数）并排好生成队列；坐标换算已在第 3 步的语义校验中完成（[原版规则辅助](#原版规则辅助)）。
6. 机型语义检查（`checkCraftInfo`，在队列建好之后）：可实例化的种类取自会投递请求的队列项（`postsRequests`，与生成阶段的判定相同），即记录项的种类、编组项全部成员的种类与僚机项的种类位 1；未投递请求的记录、编组与未选的僚机不检查。只拒绝会使规则出错的数据，以 `CoreInputError` 报告，路径指向首个引用该种类的声明或 `input.craftInfo.content.craft[k]`，原因固定：
   - 种类没有机型记录（内容只有种类位 0–19 的记录）；
   - 机型 +0x0C 向零截断后不为正（停放行进以它为随机长度的模数）；
   - 停放 Warp 的计时 +0xA8 × 64 或 (+0xA8 + +0xA4) × 64 越出 i32；
   - 玩家机型 +0x88 为 0，或其能量阈值、以及 16 种分配等级组合下的能量运算越出 i32。

   其余零值按原版的分支处理（例如 +0xB8 不为正时速度比为 0），不拒绝。
7. `setupHash`（[setup-hash.ts](../../../src/core/world/setup-hash.ts)）：规范文本为 `{ setup, craftInfo }` 的 fnv1a64，16 位小写十六进制。`setup` 是校验后完整 `MissionSetup` 的规范文本（名称、坐标、成员、全部规则输入、阵营、模型与交互标志，以及事件触发）。事件触发按 `groups` 之后、`wingmanOptions` 之前写出，每个区间依次为 `lower`、`upper`、`messages`（字节串按规范文本的字符串规则）与 `summarySelector`；声明与僚机选项的 `eventTrigger` 写在 `aiTarget` 之后（[P3-03/28](../../plan/p3/03/subtasks/28-setup-hash-event-triggers.md)）。语义校验不读取事件触发，创建只在计算 setupHash 时写出它们；Core 不解释或调度它们。`craftInfo` 是严格读取后的完整机型内容与其 Asset ID，写出器按 `CraftInfo` 的成员类型逐项列出，内容类型增删成员时类型检查失败。setupHash 不随种子、僚机、身份或输入键序变化，把世界、快照与 replay 绑定到实际读取的初始数据；不证明来源。

创建结果为 tick 0、时钟 0、没有实体、视角模式与上一视角模式 0xC、任务状态 `built`（原版状态字节 1）、生成开关已置，并保存冻结的机型内容。创建不返回事件：时刻为 0 的项在第一个 tick 实例化。相同输入得到相同的初始快照；世界不与输入或其他世界共享可变状态。重试就是以同一内容与配置新建世界。`initialWorldState(input)`（内部）返回同样校验后的初始状态，供录制、replay 与测试。

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
  - `commands` 是至多 `commandsPerTick` 个 `Command` 的有序数组，每项在本 tick 按数组顺序处理一次。`Command` 是 16 个变体的封闭判别联合（`COMMAND_TYPES`），每个变体只接受自己的字段，字段与取值按 spec 的[命令形状表](../../plan/p3/02/spec.md#输入与命令)：`fire`、`speed`、`select-number`、`navigate-selection`、`confirm-selection`、`target`、`cycle-main-weapon`、`select-missile`、`toggle-map`、`map-point`、`request-warp`、`communications`、`launch`、`energy`、`damage-report`、`cockpit-front`。
  - `readTickInput(value)`：只接受普通对象与无空位、无额外字段的普通数组；每个值只经属性描述符读取一次，不运行访问器；先查命令数再读元素。结果按规范字段次序新建并深度冻结，−0 变为 0，所以等价的动作得到相同的记录。错误为 `CoreInputError`，路径以 `tickInput` 开头，不回显未知键或值。
- **领域事件**（[domain-events.ts](../../../src/core/contracts/domain-events.ts)）：`step()` 按发出顺序返回可序列化的纯数据，不含对象引用（[ADR-0006](../../decisions/ADR-0006-core-returns-events.md)）。`DomainEvent` 是以下六个变体的联合，基础字段为 `DomainEventBase<Type>` 的 `{ type, tick }`，`tick` 是发出它的 step 的编号：
  - `command-result`：`{ type, tick, commandIndex, commandType, outcome, reason }`。每个结构合法的命令恰有一个。`outcome` 取自 `COMMAND_OUTCOMES`：`accepted` 时 `reason` 为 null，`rejected` 或 `ignored` 时为 `COMMAND_RESULT_REASONS` 中的封闭原因码，其他规则任务可沿用：
    - `not-implemented`：还没有规则处理该命令，是开发阶段的结果，不是原版的无作用；
    - `player-unavailable`：没有可接受命令的玩家实体（不存在、被毁、尚未活动或正在移除）；
    - `wrong-context`：原版在当前交互上下文中不处理该命令；
    - `no-target`：命令需要有效目标而没有。
  - `object-instantiated`：`{ type, tick, entityId, kindBit, source, position }`，每个实例化的对象一个，按实例化次序。`source` 为 `EntitySource { collection: 'mission' | 'wingman', index, group }`，`group` 为 null 或编组成员的 `GroupMembership { index, request, member }`；`position` 为运行时单位的 `Vec3`。
  - `speed-assist-toggled`：`{ type, tick, commandIndex, enabled }`，`toggle-auto-match` 被接受后紧随其结果，`enabled` 为切换后的开关。
  - `speed-matched`：`{ type, tick, targetEntityId, origin, … }`，只在匹配实际写入时发出。`origin: 'command'` 带 `commandIndex`，是请求处理中应用的手动匹配；`origin: 'assist'` 带 `speedDifferenceExceeded`（匹配前双方速度差超过原版的 HUD 闪烁常数），是速度辅助的匹配。
  - `speed-assist-released`：`{ type, tick }`，速度辅助匹配过之后失去目标、恢复满油门。
  - `object-left-world`：`{ type, tick, entityId, kindBit, source }`，停放对象唯一的真正退场，每个对象一生至多一次；`source` 是退场时来源的快照，运行中创建的实体为 null。

  一个 tick 内的次序：玩家更新中先是速度辅助的事件（`speed-matched` assist 或 `speed-assist-released`，至多一个），再按索引发出命令结果，`speed-assist-toggled` 紧随其结果；手动匹配的 `speed-matched` 在请求处理中发出；`object-left-world` 在停放更新阶段发出。`object-instantiated` 不与它们排序。比较按此校验（[快照、录制、replay 与比较](#快照录制replay-与比较)）。
- **规范文本**（[canonical-text.ts](../../../src/core/contracts/canonical-text.ts)）：`canonicalObject(members)` 以显式次序列出对象成员（复制并冻结），`canonicalText(value, path)` 写出紧凑 JSON，`canonicalHash(value, path)` 为其 fnv1a64（16 位小写十六进制）。类型化写出器 `canonicalMembers`（映射类型要求每个成员恰好写一次）、`canonicalList`、`canonicalNullable`、`canonicalScalar` 与类型 `CanonicalWriter`、`CanonicalMembers` 由快照与 setupHash 共用（P3-06 从快照移到这里）。规则：不接受普通对象，键的插入次序因此不会进入文本；−0 写为 0；非 ASCII 码元一律转义为 `\uXXXX`；非有限值、非规范值、重复成员与超过 `canonicalTextLength` 的文本以 `CoreInputError` 拒绝，由调用者决定是否转为故障。字符串在编码前精确计算转义后的长度，超长时不分配。哈希只是同一版本、同一运行时内的一致性诊断，不证明来源、防篡改或无碰撞。
- **校验读取器**（[validation.ts](../../../src/core/contracts/validation.ts)）：`readDataRecord`、`requireExactFields`、`readExactRecord`、`readList`、`readNumber`（−0 变为 0）、`readChoice`，以及数值规则 `NumberRule`、`numberIn`、`integerIn`。只接受纯数据，每个值经描述符读一次，错误不回显未知键或值。
- **上限**（[limits.ts](../../../src/core/contracts/limits.ts)）：见[上限](#上限)。

### 实体与世界状态（world/）

- **`WorldState`**（[world-state.ts](../../../src/core/world/world-state.ts)）：`config`、只读的 `setup` 与 `craftInfo`（冻结的 `WorldCraftInfo`，规则读取机型记录的唯一来源；两者都不进入快照，由 setupHash 绑定）、`tick`、`clock`、`rngState`（世界自有的 Mulberry32 状态，所有规则抽取都来自它）、`missionStatus`、`entities`、`player` 与 `spawn`。只有流水线修改它。`WorldConfig` 为 `{ content, mission, setupHash, group, slot, rawDifficulty, wingman, seed, clockUnitsPerTick }`，`slot` 是缺省值使用的任务号。`MissionStatus` 目前只有 `built`；后续状态由 P3-11 加入。`createWorldState(config, setup, craftInfo, spawn, rngState)` 为内部函数。
- **实体表**（[entity-table.ts](../../../src/core/world/entity-table.ts)）：`EntityTable` 按原版对象表（[Q-08](../../original/formats/executable.md#runtime-object-table-p3-0201)）组织。
  - `allocate(init)`：ID 从 1 起按分配次序分配，同一世界内不复用（`nextId` 只增不减）；新实体追加到其种类位的表尾。种类位越界或位姿非有限为 `invariant-violated`；停放与移动块不一致（`entities.movement`）、飞行状态的 f32 值、时钟或 AI 模式不合法（`entities.flight`）同为 `invariant-violated`；超过 `CORE_LIMITS.entities` 个现存实体或 ID 越过安全整数为 `budget-exhausted`。分配复制并冻结不可变的部分，与 `init` 脱离。
  - `walk(mask)`：按种类位升序、每张表按分配次序遍历，且是实时遍历：遍历中追加到当前或更高种类位的实体在同一遍被访问，追加到更低位的不被访问。依赖遍历次序的规则（目标选择、AI 等）只能用它。`ALL_KINDS` 是全部种类位的掩码。
  - `remove(entity)`：只在请求处理中调用；遍历进行中移除为故障。`get(id)` 对已移除的 ID 返回 undefined，引用随之失效，不遍历引用方。`byId()` 按 ID 升序，`size` 为现存实体数。
- **实体**：`Entity` 的字段为 `id`、`kindBit`（原版运行时种类的位号 0–31，与内容的 `craftType` 一致，分配时固定；掩码另用 uint32 位集合表示）、`source`（`EntitySource`，运行中创建的实体为 null）、`name`（`NameReference`）、`side`、`baseInteraction`、`presentation`（`EntityPresentation`，目前只有 `{ type: 'model', model }`）、`position`（运行时单位）、`orientation`（`Matrix3`，按行存储的三行姿态）、`placementSerial`、`ruleInputs`（`EntityRuleInputs`）、`state`、`activity` 与 `destroyed`，以及 P3-06 的飞行状态（下一条）。`EntityInit` 是实例化提供的部分。
  - `NameReference` 为封闭联合：`none`（原版明确的无名分支）、`candidate`（声明引用与候选索引）、`pool`（名称池索引）、`craft-type`（种类位）。候选与池的文字从 setup 解析；种类名文字在 P3-03 导入的 `data/craft-info` 中（CINF 机型记录 +0x04，见[交接](#交接)），不在 setup 中。
  - `EntityRuleInputs` 是实例化时从记录复制的缺省后 i32 值：`percentB`/`percentC`/`percentD`（+0x60–+0x68）与 `aiValueA`/`aiValueB`/`aiValueC`（+0x70–+0x78，即运行时 +0xDC/+0xE0/+0xE4）。
  - `ObjectState` 为原版对象状态的八个值：`new`、`presentation-ready`、`awaiting-presentation`、`destroyed-source`、`area-switch`、`pending-removal`、`active`、`projectile-hit`；`Activity` 为 `parked`、`active`、`docked`。`initialState(activity)` 给出分配或切换停放时的状态（停放为 `new`，否则 `presentation-ready`）；`isActiveState` 为原版状态 7 及以上（`active`、`projectile-hit`）；`isLive` 排除被毁与待移除，查询据此筛选，不能由“仍在种类表中”推断存活。
- **飞行状态（P3-06，[检查点 A 定稿的形状](../../plan/p3/06/spec.md#检查点-a-定稿的状态与契约)）：** 实体字段 `maximumSpeed`（+0x78，f32 单位/秒，规则算出的当前上限，与机型基准 +0xB8 分开）、`lastParkedUpdateClock`（+0x18，时钟单位）、`warpClock`（+0xC8，时钟单位，0 表示未设）、`inWarp`（+0xCC）、可空的 `movement`、`ai` 与可空的 `formation`。所有 f32 字段都是 `Math.fround` 的不动点。
  - `MovementBlock`（对象 +8）是按 `mode` 区分的联合，目前只有 `SteeredMovementBlock`：`mode` 为 `craft` 或 `warp`（原版模式 0、3，字段相同，P3-09 就地切换模式），`speed`、`commandedSpeed`、`atCommandedSpeed`、`speedRatio`，三轴 `steering`（`SteeringAxis { rate, enabled }`，关闭时速率保留但不施加）与 `timedRotation`（可空的 `TimedRotation { rate, decay, end }`），可空的 `impulse`（`Impulse { direction, magnitude }`）、`locked` 与可空的 `disturbance`（`Disturbance`：等级 1，或带三个整数偏置的等级 2）。参考最高速度（原版块 +0x70）恒等于机型 +0xB8，从机型内容读取，不另存。`ROTATION_AXES` 为 `pitch`、`yaw`、`roll`，分别绕第 1、2、3 行。
  - 不变式：实体停放时恰好没有移动块，活动与停靠时恰好有。`setActivity(entity, activity, movement)` 一起写入活动与移动块并重新开始状态，是实例化活动判定与停放切换共用的唯一入口；`copyMovement` 给出脱离的移动块副本（运动规则也用它）。
  - `AiState` 是 `0x68050` 在实例化时写入的初态：`mode`（`AiMode`：0、1、2、4、5）、`target`（AI 目标 +0x90）、`goal`、`targetOffset` 与 `objectTarget`（非玩家对象的 +0x8C，初值 null，由 P3-08 写入；玩家的 +0x8C 是 `PlayerState.target`，玩家实体的 `objectTarget` 恒为 null）。不能解析的 ID 视为无效。
  - `Formation { leader, offset }`：段 5 编组中每个布局周期的后续成员跟随该周期的首个成员，偏移为 f32(l − layout[0])，在领队的三行上取分量（[生成阶段](#系统流水线)写入）。
  - `allocatorAiState()`、`allocatorFlightState()` 与 `ZERO_VECTOR` 给出原版分配器的缺省（AI 模式 5、无目标、零向量、无 Warp、无编队），供不经 `0x68050` 的运行时种类的构造者使用；`lastParkedUpdateClock` 不在其中，由每个构造者自行定义。
- **生命周期（Core 的通用部分）：** Core 没有渲染器的完成回调，把表现视为在获得时就绪（项目选择）：以活动状态实例化的实体为 `presentation-ready`，停放的为 `new`。实体在自己的下一次更新中请求进入 `active`，由同一 tick 的请求处理写入；处于 Warp 过境中的实体（状态 0–3，玩家种类除外）不提出这一请求，见[飞行控制、运动与停放](#飞行控制运动与停放)。`area-switch` 与 `pending-removal` 的实体在自己的下一次更新中请求离开。离开请求对 `area-switch` 且会停放的种类切换停放并重新开始状态：停放时释放移动块，并只在玩家目标恰为该实体时清除它；恢复时以当前位置与姿态新建满油门的初始移动块；计时字段都不变。其他情形（含种类位 `0x1f00000`）移除实体：从种类表摘除；若是玩家实体，玩家状态的实体 ID、目标与控制状态一起清为 null；生成计数不减少，名称因不再有实体持有而释放。`destroyed-source` 不更新。被毁（`destroyed`）不等于移除，救援复用玩家实体。被毁、`destroyed-source`、`area-switch`、`pending-removal` 与 `projectile-hit` 由负责规则写入。`awaiting-presentation` 只为对应原版的状态空间而保留，按当前契约不可达；要使用它须先修订 spec。
- **玩家状态**（[player-state.ts](../../../src/core/world/player-state.ts)）：`PlayerState` 为 `{ entityId, viewMode, previousViewMode, subMode, target, control }`，`createPlayerState()` 的值为 `{ null, 0xC, 0xC, 0, null, null }`（`COCKPIT_VIEW_MODE` = 0xC）。实例化玩家时写入实体 ID，把视角模式与上一视角模式设为 0xC，目标设为 null，控制状态设为 `initialPlayerControl(group)`；其他写入者归各规则任务。`interactionContext(viewMode)` 按原版的上下文选择给出 `warp`（0–3）、`base`（6）、`map`（8）或 `flight`。
  - `target`（玩家对象 +0x8C）：实例化时为 null（代码证据，`0x68050` 写的是 AI 目标）。P3-06 只把它清为 null：玩家可用时玩家更新开头发现它不能解析、该实体停放、玩家实体移除；选择归 P3-07，Warp 开始的清除归 P3-09。生产代码没有其他写入口。
  - `control`（`PlayerControl`）在有玩家实体时恰好非空，随玩家实体移除清空，救援保留：`lastAxes`（每轴上次读到的整数偏转，原版 `0x1b2470` 的对应物）与 `speedAssist`（`SpeedAssist { enabled, dueClock, engaged }`，控制块 +0x1B4–+0x1BC）。`initialPlayerControl(group)` 为三轴 0、辅助在战役组 0 开启、到期时刻 0、未匹配。不保存油门、宿主按键、DOS 轮询缓存或 HUD 闪烁计数器。
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
| 2 | `mission-flow` | `0x3266c`，读取上一 tick 的时钟 | 空 | P3-11（流程、结果、救援）、P3-10（停靠子状态） |
| 3 | `clock` | `0x25894` | 写入新时钟 | P3-02 |
| 4 | `object-update` | `0x20938`：实时种类遍历，玩家最先 | 先是玩家更新 `updatePlayer`（P3-06：失效目标清除、速度辅助、命令判定与轴的变化检测，未实现的命令得到 `not-implemented`），再对每个实体做通用生命周期转换（Warp 过境中的实体不推进） | P3-06、P3-07、P3-08、P3-09、P3-10（动作效果与各自对象的更新） |
| 5 | `communications-reply` | `0x2cd60` | 空 | P3-10 |
| 6 | `spawn-queue-check` | `0x67018` | 为每个到期项投递生成请求，不实例化 | P3-02 |
| 7 | `request-handling` | `0x20d10` 的消息循环 | 按投递次序处理请求（实例化、状态写入、停放切换或移除、`control` 与 `match-speed`），同一遍处理处理中新投递的请求 | P3-02、P3-06；新请求类型归各规则 |
| 8 | `movement` | `0x221fc` | `moveEntities`：按移动块模式积分（P3-06 的 `craft`、`warp`） | P3-06；P3-07 加入弹丸与导弹模式 |
| 9 | `collision` | `0x29670`、`0x29934` | 空 | P3-07 |
| 10 | `delayed-player-explosion` | `0x23808` | 空 | P3-07 |
| 11 | `energy` | `0x30590` | 空 | P3-07 |
| 12 | `object-sets` | `0x2ede0`：重建友方与敌方机体集合并刷新地图可见标志 | 空（P3-06 的规则不读取） | 建议归 P3-08（停放对象的 AI 处理读取它）；地图读取者为 P3-09、P3-13 |
| 13 | `parked-update` | `0x2f1b0`，含离开世界 | `updateParked`：节奏、过境、停放行进与离开世界（P3-06） | P3-06；P3-07、P3-08 加入停放战斗，P3-10 加入基地报告 |
| 14 | `warp-completion` | `0x2bf08` | 空 | P3-09 |
| 15 | `base-interior` | `0x398ec`，视角模式 6 | 空 | P3-10 |
| 16 | `mission-teardown` | `0x334bc`，主流程状态 0 | 空 | P3-11 |
| 17 | `area-check` | `0x3a468` | `checkActiveArea`：只写对象状态（P3-06） | P3-06；P3-09 加入玩家 Warp 期间的中心 |
| 18 | `frame-end` | 原版在帧渲染中的规则推进，如 `0x50508` | 空；规则移入 Core，不等待实际渲染帧 | P3-09；P3-12 只消费结果 |
| 19 | `commit` | 项目边界 | 冻结本 tick 事件；请求处理之后投递的请求不处理即丢弃 | P3-02 |

原版派发器开头清空表现项（`0x52c3c`）与结尾放置相机（`0x21584`）不是 Core 阶段：渲染器与音效由 Render State 和事件推出（P3-12 至 P3-14）。

- **`TickContext`、`registerTick`、`runTick`：** `registerTick(world, input)` 在第一次改动前完成可拒绝的检查并返回本 tick 的上下文 `{ world, time, input, events, requests }`；`runTick(context)` 依次运行各阶段并返回冻结的事件。两者与 `PIPELINE` 都是内部接口。
- **`emit(context, event)`：** 存入深度冻结的脱离副本；一个 tick 超过 `eventsPerTick` 个事件为 `budget-exhausted`。后续阶段可以读取本 tick 已发出的事件；事件列表与请求列表都不跨 tick 保留。
- **`Request` 与 `RequestQueue`：** 请求是原版派发器消息的对应物，是封闭的内部纯数据，不是 `DomainEvent`。现有类型：`set-state`（消息 0x200）；`leave`（消息 0x20，停放切换或移除，见[生命周期](#实体与世界状态world)）；`spawn`（消息 0x4000）；`control`（消息 0x20000，`ControlRequest { entityId, throttle, axes }`，整数操纵路径）；`match-speed`（消息 0x80000，`MatchSpeedRequest { entityId, targetEntityId, commandIndex }`，玩家的手动匹配）。处理次序为任务流程、对象更新（按遍历次序）、生成队列检查，然后是处理中新投递的请求；主体已被移除的请求被丢弃。投递数也受 `eventsPerTick` 约束（见[上限](#上限)）。
- **命令判定：** 在玩家更新中按数组顺序进行，每个命令恰有一个带原 `commandIndex` 的结果。P3-06 处理的命令见[飞行控制、运动与停放](#飞行控制运动与停放)；其余命令，以及 P3-06 的命令中归其他上下文规则的那些，得到 `rejected`/`not-implemented` 且不改状态。规则任务按命令类型与上下文替换这一判定。
- **请求处理中实例化的实体**在本 tick 不更新，也不参与之后的运动与碰撞；它的第一次更新在下一个 tick。

**生成阶段**（[systems/spawn.ts](../../../src/core/systems/spawn.ts)，Q-01、Q-07）：

- `checkSpawnQueue(world, requests)`（`spawn-queue-check`）：生成开关已置时，按队列次序取出每个到期项（`isDue(clock, due)`），会投递请求的项（`postsRequests`）投递 `requests` 个 `SpawnRequest { type: 'spawn', source, index, request }`。概率为 100 时必然投递，不抽取；未填写缺省的模板的来源值 0 永不投递。
- `dispatchSpawn(world, request, emit)`（请求处理）：段 1 记录与僚机放置并实例化一个对象，记录计数加 1；编组请求按布局周期放置锚点，逐个成员实例化，每个周期的后续成员在实例化之后写入编队（领队为该周期的首个成员），编组计数加 1。实例化按原版次序写入：种类、来源、名称、阵营、模型、交互标志、位置、放置姿态与规则输入副本（以分配器的状态分配：停放、无移动块），再依次写最高速度、AI 初态、`lastParkedUpdateClock`（本次时钟）、`warpClock`，然后判定活动：玩家总是活动；其他对象只在活动区域内（`activeAreaCentre` 与 `isWithinActiveArea`，与区域检查共用的 `0x3a540`）为活动，否则停放。活动实体获得满油门的初始移动块，玩家的姿态改为单位矩阵。玩家实例化后写玩家状态，最后发出 `object-instantiated`。随机抽取写回世界的 RNG 状态。
- **实体初始化扩展点**在 `instantiate` 中、分配与命名之后，是 Core 内部的静态调用位置，不是外部回调。按 Q-07 与 [P3-06 的实例化扩展](../../plan/p3/06/spec.md#实例化扩展)的次序：最高速度（P3-06，不抽取；P3-07 的 `0x3060c` 能量字段与 1 次抽取在同一位置）→ 两位字段（P3-07）→ AI 初态 `0x68050`（P3-06）→ `lastParkedUpdateClock`（P3-06）→ Warp 计时 +0xC8（P3-06，玩家与僚机以外 1 次抽取）→ `0x20990`（P3-08）→ 活动判定与初始移动块（P3-02、P3-06）→ `0x38cd4`（P3-10）→ 玩家状态（P3-02；P3-06 的目标与控制状态）。尚未接入的步骤在代码中以注释标出位置。
- 供其他规则在 Core 内使用的接口（P3-11）：`isSpawningEnabled`；`disableSpawning`（任务结束时清除开关，之后不再处理队列，不会再置）；`pendingSpawns`（待生成项的冻结副本，供全清判定）；`placeWorldRecord(world, record, rand)`（放置服务，供救援放置）。实例化通知就是本 tick 事件列表中的 `object-instantiated`。

### 飞行控制、运动与停放

P3-06 的系统在 [systems/](../../../src/core/systems/) 中，由各自的阶段调用，规则计算在[原版规则辅助](#原版规则辅助)的纯函数中。行为契约见 P3-06 spec 的[行为与边界](../../plan/p3/06/spec.md#行为与边界)，原版事实见 executable 的 [P3-06 一节](../../original/formats/executable.md#flight-motion-controls-speed-parking-and-take-off-p3-06)。

**玩家更新与操纵**（[systems/flight-control.ts](../../../src/core/systems/flight-control.ts)）：`updatePlayer(world, input, tick, output)` 在对象更新阶段开头运行（玩家在遍历中最先）。

- **可用的玩家**（`availablePlayer`）：玩家实体存在、未被毁且状态为 `active`（原版状态 7）。可用玩家缺少控制状态为 `flight-control.player-control` 故障。
- **次序**（D-08）：玩家可用时，先清除不能解析的玩家目标，再运行速度辅助；然后判定命令批次，最后做轴的变化检测。请求在末尾按产生次序投递，辅助的恢复请求在最前。代码注释标出 P3-07 的导弹锁定（`0x2ddbc`，在失效清除与辅助之间）与自动选择目标（`0x2799c`，玩家更新末尾）的位置。
- **命令判定**：P3-06 处理 `speed` 的六种操作、`select-number` 与 `confirm-selection`。依次判定：本上下文中不归 P3-06 的命令（全部其他命令，以及基地与地图上下文中的 `select-number`、`confirm-selection`）为 `rejected`/`not-implemented`；玩家不可用为 `ignored`/`player-unavailable`；不在飞行上下文（Warp、基地、地图中的速度命令，Warp 中的 `select-number`、`confirm-selection`）为 `ignored`/`wrong-context`，因为原版只有飞行上下文的按键处理 `0x264a0` 处理这些键；其余为 `accepted`。
  - `increase`/`decrease`：读回（`throttleReadback`，`0x21ca8`）加或减 `THROTTLE_STEP`，增加不超过满油门，减少不低于 0；`zero` 为 0，`maximum` 为 `FULL_THROTTLE`；`select-number` n 为原版 Shift+n 的档位（`presetThrottle`）。每条这样的命令投递一个携带其油门的 `control` 请求，油门不保存为状态。
  - 读回的基准是批次开始时的指令速度（含本 tick 辅助的直接写入）。每条被接受的油门命令或匹配，按与请求应用相同的纯函数推算其效果（`control` 请求在锁定时不改变指令速度；匹配不受锁定影响），后一条命令从推算值读回。
  - `match-target` 与飞行中的 `confirm-selection`（原版 Enter）：玩家目标为空或没有移动块为 `ignored`/`no-target`，否则 `accepted` 并投递 `match-speed` 请求。
  - `toggle-auto-match`（原版 Ctrl+Enter）：翻转速度辅助开关，开启时到期时刻归 0、清除“已匹配”，关闭时两者不变；紧随其结果发出 `speed-assist-toggled`。
- **轴**：玩家可用时，每个成功 tick 消费本次轴快照。`axisDeflection` 把轴值换为原版数字摇杆的整数偏转（轴值 × 128 向零截断，±1 为满偏）；地图与基地上下文中的有效偏转为 0。只有与 `lastAxes` 不同的轴进入请求并更新上次读数；锁定使请求在应用时被丢弃，上次读数照常更新。轴的变化并入本 tick 由命令投递的最后一个请求（为 `control` 请求时），否则单独投递一个只带轴的 `control` 请求；不并入辅助的恢复请求或 `match-speed` 请求。
- **速度辅助**（`0x27f68`）：开关开启且玩家可用时运行，不论视角模式；自动驾驶恒为关（G-09），总走其关闭的分支。
  - 没有目标：若“已匹配”，清除它，发出 `speed-assist-released`，并投递满油门、三轴不变的 `control` 请求。
  - 有目标：目标属于辅助种类、时钟不早于到期时刻且在辅助距离内时，先记录速度差，再直接写玩家移动块（`applySpeedMatch`），置“已匹配”并从本次时钟重新计时（不追赶）；只在写入成功时发出 `speed-matched`（assist）。
  - 某 tick 的命令改变的开关或目标，辅助在下一 tick 才看到。
- **请求处理**：`applyControlRequest` 按整数路径 `0x21dd0` 应用 `control` 请求，抽取来自世界 RNG；`applyMatchRequest` 按 `0x21adc` 应用 `match-speed` 请求（目标已不能解析或任一方没有移动块时无作用，不查锁定），写入成功时发出 `speed-matched`（command）。

**运动阶段**（[systems/movement.ts](../../../src/core/systems/movement.ts)）：`moveEntities(world)` 以 `motionStep(clockUnitsPerTick, clock)` 实时遍历全部种类（玩家最先）。

- `movesThisTick`：活动不是停放（活动与停靠都参与），且状态为 `destroyed-source` 或 7 及以上；本 tick 新生的实体不运动。
- 通过筛选而没有移动块为 `movement.block` 故障；种类没有机型记录为 `movement.record` 故障（P3-07 在 `motionRecord` 处为导弹给出弹体记录）。
- 按块的 `mode` 穷尽分派：`craft` → `integrateCraft`，`warp` → `integrateWarp`；`MovementBlock` 增加变体而 `moveEntity` 没有相应分支时不能通过编译。结果直接替换实体的位置、姿态与移动块（原版没有副本或写回）。积分从不读取或钳制 `maximumSpeed`。

**活动区域与停放**（[systems/area.ts](../../../src/core/systems/area.ts)）：

- `checkActiveArea(world)`（`area-check`，`0x3a468`）：遍历种类 `0x1fffffe`（玩家以外），只看状态 7 及以上。区外且活动 → `area-switch`，种类位 `0x1f00000` 改为 `pending-removal`，不发事件；区内、停放且不在 Warp 中 → `area-switch`；其余不变。只写状态，不释放、不抽取。没有玩家实体时一律在区外：活动的实体都进入 `area-switch`（种类位 `0x1f00000` 进入 `pending-removal`），在下一 tick 由自身更新提出离开并在请求处理中停放或移除；停放与停靠的实体不变（与原版一致）。
- `switchParking(world, entity)`：消息 0x20 的停放切换，`leave` 先试它，规则见[生命周期](#实体与世界状态world)；返回 false 时由 `leave` 移除实体。
- `checkWarpTransit` 与 `isHeldInWarpTransit`（`0x2f298`）：`inWarp` 且 `warpClock` 非零时，过境持续机型 +0xA8 秒（有有效编队领队时取领队的机型）；未结束时返回 true，结束时清 `inWarp`。通用生命周期在状态 0–3 询问它（玩家种类除外），过境中不推进状态。
- `updateParked(world, emit)`（`parked-update`，`0x2f1b0`）：遍历种类 `0xfffff`，选停放、状态 7 及以上、未被毁的实体，每个每 tick 抽一次世界随机数判定是否到期。到期时先计算经过时间并写 `lastParkedUpdateClock`；过境中到此为止，否则做停放行进（`0x2f314`）：
  - 失效的编队领队清为 null，本次不动；主体为有效领队或实体自身，按主体的 AI 状态求目标点（零偏移先换成随机偏移并存入主体）；AI 模式 1、5，以及目标失效或在 Warp 中时不动；
  - 随后先判定到达（与目标点的距离）；未到达时，有有效领队的编队成员做编队跟随（领队在 Warp 中时同时进入 Warp 并取领队的 `warpClock`），其余实体做停放中的 Warp 跳跃或正常行进（P3-08 的 Warp 离场请求，即 `inWarp` 且 `warpClock` 为 0，也触发跳跃）；每次写位置都使放置序号加 1（原版提交位置时的扇区资源测试在 Core 中总是通过）；
  - 到达时不写位置：有目标时清本实体的偏移，模式 4 且无领队时由来源记录（编组成员取其模板）的放置路线取新目标点，清 `inWarp`；实体不是僚机且主体在内缩 100 的世界矩形之外（严格比较，忽略 z）时，直接写 `pending-removal` 并发出一次 `object-left-world`，实体在下一 tick 由自身更新提出移除。重新放置不是退场；
  - 代码注释标出停放战斗（P3-07、P3-08）、基地报告（P3-10）与玩家 Warp 期间的区域中心（P3-09）的位置。
- 活动对象（含玩家）没有世界边界处理：Core 不夹取、不移动、不移除越出世界矩形的活动对象（M-07，与原版一致），只适用数值故障规则。

### 原版规则辅助

[rules/](../../../src/core/rules/) 中的规则辅助按原版代码实现换算、随机映射、放置、缺省、排程与名称，以及 P3-06 的飞行状态、运动积分、操纵、速度匹配、AI 初态、随机方向、活动区域与停放行进。它们确定、不依赖宿主；受控的状态变化只有经 `RandSource` 消耗世界 RNG、修改调用者显式传入的世界计数（如名称池计数）或移动块（操纵与匹配就地改写所给的块）。原版事实见 executable 的[放置与数值](../../original/formats/executable.md#placement-runtime-scale-and-numbers-p3-0202)、[生成队列与实例化](../../original/formats/executable.md#spawn-queue-defaults-names-and-instantiation-p3-0203)与 [P3-06 一节](../../original/formats/executable.md#flight-motion-controls-speed-parking-and-take-off-p3-06)；测试期望来自 P3-02/02、03 与 P3-06 的独立推导，不由被测实现计算（运动的一帧参照见[针对性检查](#针对性检查)）。

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
  - 最高速度：`playerEnergyOperands`（`0x3060c` 的能量 E 与阈值 T）、`playerMaximumSpeed`（`0x30e0c`：E < T 时由能量与机型 +0x88 的整数运算得出，否则取基准 +0xB8，再乘两位字段 2 的系数）、`initialMaximumSpeed(kindBit, record)`（实例化写入：玩家用代码固定的初始分配等级 `INITIAL_ALLOCATION` 与清零的字段，其他种类取 +0xB8；不抽取）；`ENERGY_SCALE` 与 `ALLOCATION_LEVELS` 也供机型语义检查使用。
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
  - 两条操纵路径共用门禁 `controlApplies`（有移动块、有机型记录、未锁定，否则无作用也不抽取），原地改写所给的移动块，只从所给的 `RandSource` 抽取：整数路径 `applyIntegerControl`（`0x21dd0`，消息 0x20000：扰动时每条消息先抽 3 次；油门写指令速度并清到达；每轴为不变、关闭或经灵敏度表的偏转）与浮点路径 `applyFloatControl`（`0x21fd8`，消息 0x40000：扰动时先抽 5 次，含随机方向；速率与值成线性，不经灵敏度表）。P3-06 只投递整数路径的请求。
- **速度匹配**（[speed-match.ts](../../../src/core/rules/speed-match.ts)，M-05）：`matchedSpeed`、`speedMatch` 与 `applySpeedMatch`（`0x21adc`：目标的当前速度钳到 [0, 主体最高速度]，模式 `craft` 写指令速度并清到达，其他模式写当前速度；双方都要有移动块且主体有机型记录，否则不写入，不查锁定），手动匹配、速度辅助与 P3-08 的 AI 匹配共用。辅助条件：`isAssistKind`（辅助种类掩码）、`squaredDistance`（`0x56b50`，每项一个因子先舍入为 f32）、`withinAssistRange`（等于阈值时也匹配）、`speedDifferenceExceeded`（HUD 闪烁条件，严格大于）、`ASSIST_INTERVAL` 与 `nextAssistDue`（从本次时钟重新计时）。
- **AI 初态**（[initial-ai.ts](../../../src/core/rules/initial-ai.ts)，[初始飞行状态](../../original/formats/executable.md#initial-flight-state-p3-0605)）：`aiCandidates(record, spawn, setup)`（`0x68018`，来源记录的候选种类掩码与声明过滤）与 `initialAiState(entities, subject, candidates, frame, rand)`（`0x68050`）。固定种类只写 AI 模式；其他种类（含玩家）在候选中取最近者（不分状态与活动，自身计入，f32 评分，严格更小才替换），最近者属另一方且远于 `RANDOM_TARGET_DISTANCE_SQUARED` 时以 1 次抽取改选随机候选；有目标时为模式 2（同方）或 0（另一方），没有时取 `worldDefaultPoint`（2 次抽取）并为模式 4。内容契约已拒绝记录 +0x4C 的路径路线，所以 Core 中一次调用抽取 0–2 次：随机候选的 1 次与目标点的 2 次互斥。P3-06 spec 与 P3-02 spec 修订中写的“0–3 次”计入了原版的这条路线（经 `0x688c4`，+0x50 为 2 时多抽 1 次），它在 Core 中不可达（[已知差异](#已知差异)）。
- **随机方向**（[random-direction.ts](../../../src/core/rules/random-direction.ts)）：`DIRECTION_TABLE`（启动时计算的第一卦限方向表）与 `randomDirection(rand)`（`0x56b8c`，2 次抽取：表项与八个符号卦限之一），供浮点操纵路径与停放行进，也供 P3-07、P3-08。
- **活动区域**（[active-area.ts](../../../src/core/rules/active-area.ts)，[世界边界、活动区域、停放与自动驾驶](../../original/formats/executable.md#world-boundary-active-area-parking-and-autopilot-p3-0604)）：`activeAreaCentre(world)`（玩家实体的位置，没有玩家实体时为 null）、`isWithinActiveArea(centre, position)`（`0x3a540`：x/y 距离平方严格小于 `ACTIVE_AREA_RADIUS_SQUARED`，没有中心时一律在区外），实例化与区域检查共用这两者；`isRemovedOnLeaving(kindBit)`（种类位 `0x1f00000`）；`isOutsideExitBounds(frame, position)`（`0x3a41c` 的世界矩形内缩 100，严格比较，边界算在内，忽略 z）。
- **停放行进**（[parked-travel.ts](../../../src/core/rules/parked-travel.ts)，同上）：到期判定 `isParkedUpdateDue`；过境 `isInWarpTransit` 与 Warp 许可 `isWarpAllowed`（`0x2ff98`）；目标距离 `goalDistance` 与到达 `hasArrived`；跳跃距离 `isWarpJumpDistance`；零偏移的随机替换 `randomTargetOffset`（3 次抽取）；`0x56aa8` 的归一化 `normalized`；朝向目标的姿态重建 `headingTowards`；跳跃与行进长度、前进、抖动 `jittered`（6 次抽取）与 `0x56e34` 的编队位置 `formationPosition`。时钟运算是精确整数，负的 Warp 持续时间按[已知差异](#已知差异)中的项目规则处理。

### Projection 与 Render State

- **projection**（[projection.ts](../../../src/core/projections/projection.ts)）：`Projection` 是深度冻结、与世界脱离的纯数据，不提供全体实体列表。
  - 就绪分区：`clock` 为 `{ tick, clock, clockUnitsPerTick }`；`mission` 为 `{ mission, group, slot, rawDifficulty, wingman, status }`；`player` 为 `{ entityId, viewMode, previousViewMode, subMode, interactionContext }`。UI 使用 `interactionContext`，不复制上下文的选择。
  - `flight` 是 `FlightProjection { motion, combat }`，两组各为 `NotImplementedPartition` 或各自的 ready 类型，互不覆盖；需要两组的消费者分别检查（[P3-06 的 D-05](../../plan/p3/06/spec.md#对-p3-02-契约的增量)）。
    - **运动组（就绪，P3-06）：** `MotionReady { readiness: 'ready', player }`。`player` 在没有玩家实体时为 null，不伪造零速度；否则为 `MotionPlayer { entityId, position, orientation, speed, commandedSpeed, maximumSpeed, speedLimitStatus, speedAssist: { enabled, engaged } }`，位姿是冻结的新副本，速度为运行时单位/秒，取自玩家实体的移动块与 `maximumSpeed`，辅助状态取自控制状态，任一次读取都能恢复持续的辅助指示，不需要事件历史；没有“最新匹配时刻”。`speedLimitStatus`（`SpeedLimitStatus`）在 P3-07 接入实时重算之前恒为 `'initial-only'`，表示最高速度只是实例化的初值。玩家 ID 不能解析、玩家实体没有移动块或玩家没有控制状态为 `invariant-violated`/`projection.motion`，由世界锁存。
    - **战斗组（`not-implemented`，P3-07）：** `CombatReady` 保留 P3-02 定义的目标（`FlightTarget`）、资源与武器，其 ready 形状由 P3-07 定稿。
  - `map`、`communications`、`result` 三个分区目前都是 `NotImplementedPartition { readiness: 'not-implemented' }`，不以空列表、0 值、全图可见或胜利冒充缺少的规则。各分区的 ready 类型（`MapReady`、`CommunicationsReady`、`ResultReady`）按 spec 的[分区表](../../plan/p3/02/spec.md#projection-与-render-state)定义。spec 留给负责任务研究的部分是 `never` 占位，负责任务须先按[扩展规则](#扩展规则)修订 spec 定义它们，分区才能就绪：`FlightResourceName`（P3-07）、`WeaponRecordReference`（P3-03 导入，P3-07 定引用）、`MapMarkerClass` 与 `MapVisibility`（P3-09）、`MenuContentReference`（P3-03 导入，P3-10 定引用）、`OptionUnavailableReason`（P3-10）、`ResultReason` 与 `ResultMessageReference`（P3-11）。
- **Render State**（[render-state.ts](../../../src/core/projections/render-state.ts)）：`RenderState` 为 `{ tick, viewMode, observedEntityId, entities }`，`observedEntityId` 为玩家实体 ID 或 null；`entities` 是按 ID 升序的可呈现实体 `RenderEntity { id, kindBit, presentation, position, orientation, placementSerial }`。P3-06 没有改变它的形状。
  - 停放的实体不呈现（原版不为停放对象保留渲染对象）。被毁的实体在移除前仍列出；移除后消失。
  - 新 ID 只用当前位姿；同一 ID 的放置序号变化表示非连续移动（Warp 到达、救援、离港放置，以及停放期间的行进、跳跃与编队跟随），渲染器不跨此插值。
  - 渲染器之外的消费者不得从 Render State 推导规则信息（地图标记、目标列表等）。两帧保留与跨运行折叠归 P3-04。

### 快照、录制、replay 与比较

- **快照**（[snapshot.ts](../../../src/core/replay/snapshot.ts)）：`World.snapshot()` 返回深度冻结、脱离世界的 `GameSnapshot { format: 'osr-game-snapshot', version: 2, rulesVersion, state }`（`GAME_SNAPSHOT_FORMAT`、`GAME_SNAPSHOT_VERSION`；P3-06 由 1 递增为 2）。
  - `SnapshotState` 是除静态 `setup` 与 `craftInfo` 外的全部权威状态：`config`（完整内容身份、任务、setupHash、原始难度、组、槽位、僚机、种子、每 tick 单位）、`tick`、`clock`、`rngState`、`nextEntityId`、`entities`（按 ID，含每个实体的飞行状态：最高速度、两个计时、`inWarp`、移动块、AI 初态与编队）、`kindOrder`（全种类遍历的 ID 次序）、`spawn`（`SnapshotSpawn`：缺省后的记录及其声明引用，即别名关系、僚机记录、编组的布局/计数/首成员、队列、开关、池计数）、`missionStatus` 与 `player`（含目标与控制状态）。名称占用由持有名称的实体表示。
  - `snapshotText(snapshot)` 与 `snapshotHash(snapshot)`：规范文本按每个类型的显式成员写入器输出，实体按 ID 排序，其余列表保持次序；状态哈希是整个快照（含版本）规范文本的 fnv1a64。写入器的映射类型要求 `SnapshotState` 等类型的每个成员恰好写一次，因此给世界状态或实体加字段而不更新写入器时 `pnpm typecheck` 失败。移动块每个变体一个写入器；增加 `MovementBlock` 变体的任务同时按 `mode` 加入分派。
  - 快照是诊断与检查点的来源，不是存档；Core 不提供从快照恢复世界的接口（P4）。`takeSnapshot` 为内部函数。
- **`RULES_VERSION`**（[rules-version.ts](../../../src/core/replay/rules-version.ts)，当前为 2，P3-06 由 1 递增）：由代码持有，快照与录制只声明制作时的版本，replay 只接受当前版本。凡同一配置、内容与 tick 输入可能得到不同结果的修改都必须递增它：流水线的阶段或次序、数值语义、RNG 抽取或其次序、动作的解释、规则发出的事件或保存的状态。快照或 replay 记录的结构变化递增各自的格式版本；两者都变时都递增。旧组合一律拒绝，不做迁移。P3-06 对规则版本与快照格式版本各递增一次，相对其合入基线计，与并行任务合并时相对主线复核（[P3-06 的 D-07](../../plan/p3/06/spec.md#对-p3-02-契约的增量)）。
- **录制**（[recording.ts](../../../src/core/replay/recording.ts)）：`createRecordingSession(input, { producer, checkpointInterval })` 与 `createWorld` 一样创建世界（输入同样包含 `craftInfo`），返回同时是 `World` 的 `RecordingSession`。
  - 会话记录每个成功 tick 实际交给 `step` 的规范输入、全部事件与检查点：tick 0、`checkpointInterval` 的每个正整数倍，以及导出时补上的最后一个 tick（去重）。`producer` 为 1–128（`PRODUCER_MAX_LENGTH`）个 UTF-16 码元的字符串，只作诊断；间隔为正安全整数。
  - `exportRecording()` 返回深度冻结、脱离的 `Recording { record, result }`：`ReplayRecord { format: 'osr-game-replay', version: 1, rulesVersion, producer, content, mission, setupHash, run, checkpointInterval, ticks }`（`ticks[k]` 是 tick k + 1 的输入，稠密数组，`run` 是 `EffectiveRunConfig`）与 `ReplayResult { events, checkpoints, finalTick }`（`ReplayCheckpoint { tick, hash }`）。之后的 tick 不改变已导出的数据。
  - 容量：`requireRecordingCapacity(counts, commands)` 在执行下一个 tick 前检查 tick、命令与事件容量，事件在 tick 执行前未知，所以每个 tick 开始前须至少保留 `eventsPerTick` 的最坏情况容量（最后一个获准执行的 tick 可以用掉这部分并恰好填满上限）；检查点数不另查。超出时以 `CoreInputError`（路径 `recording`）拒绝，世界与录制都不变。
  - 故障：会话锁存世界的 `CoreFaultError`；检查点无法写成规范文本时锁存为 `invariant-violated`/`recording.checkpoint`。此后包括导出在内的每次调用都抛出该故障，不输出貌似完整的前缀。
  - `recordState`、`readProducer`、`readCheckpointInterval`、`readHash` 为内部函数（与 replay 共用）。
- **replay**（[replay.ts](../../../src/core/replay/replay.ts)）：`replayRecord(record, content)`，`content` 为 `ReplayContent`，即 `createWorld` 输入去掉 `run`：`{ mission, craftTypes, wingmanRoster, craftInfo, identity }`。记录形状没有因 P3-06 改变，replay 格式版本仍为 1：机型数据经 setupHash 绑定，不是记录字段。
  - 先校验整份记录：格式、版本、`rulesVersion`（不同版本即使字段不同也报版本），然后精确字段、producer、内容身份、任务、setupHash 格式、run 的四个字段（取值由世界创建校验）、间隔与 ticks（读取元素前检查长度，累计命令不超过 `recordedCommands`）。
  - 再比较 `contentIdentityKey`，用调用者的内容与记录的 run 创建世界，比较任务与 setupHash；同一声明身份下换了 setup 或机型数据（内容或 ID）的内容因此在 `record.setupHash` 被拒绝。最后按记录的间隔录制执行全部 tick，返回 `ReplayResult`。
  - 任何失败都抛出，不返回部分结果：记录的问题为 `record…` 路径的 `CoreInputError`（tick 的错误在 `record.ticks[k]`），内容参数的问题为 `content…` 路径；内容 Asset 或身份结构错误保留 `ContentContractError`，Core 故障保留 `CoreFaultError`。
  - `startReplay(record, content)`（内部，P3-06/15）返回校验后的记录与其世界在第一个 tick 之前的初始状态，抛出的错误与 `replayRecord` 在第一个 tick 之前相同；`replayRecord` 调用它。Core 测试在规则的写入者尚未实现时（P3-07 的目标选择、P3-08 的 AI），用它在录制与 replay 两侧以相同的替身改写世界状态，记录本身仍走完整的校验与内容绑定。它不是生产入口，不接受处理器。
- **比较**（[compare.ts](../../../src/core/replay/compare.ts)）：`compareReplayResults(expected, actual)` 先校验两侧（字段、`finalTick` 与检查点的容量、检查点从 0 严格递增到 `finalTick`、哈希格式、事件按 `DomainEvent` 联合逐字段（`speed-matched` 按 `origin` 区分变体）、事件 tick 不减且在 1–`finalTick`、每 tick 事件数、命令结果与事件总数），坏的一侧以 `expected…` 或 `actual…` 路径的 `CoreInputError` 拒绝。返回 `ReplayComparison`：`{ match: true }` 或 `{ match: false, tick, kind }`，`kind` 为 `events`、`checkpoint` 或 `length`。
  - 一个 tick 内的次序（`TickOrder`，每 tick 复位）：命令结果的 `commandIndex` 从 0 连续；P3-06 事件所在的阶段不倒退（速度辅助 → 命令 → 请求处理 → 停放更新）；速度辅助的事件每 tick 至多一个；`speed-assist-toggled` 紧随同一命令的结果；手动匹配的 `speed-matched` 在其命令结果之后；每条命令至多一个附加事件。`object-instantiated` 不参与排序。
  - 共有的 tick 内先比事件再比检查点；较短运行末帧单独附加的尾检查点，在较长一侧没有对应采样时不算差异；共有部分一致而长度不同时，在较短运行的首个缺失 tick 报告 `length`。
  - 报告的是最早**可观测**的分歧，不是首次内部状态偏离：间隔大于 1 时，两个检查点之间已恢复的差异观察不到；没有可观测影响的输入改动不算分歧。

### 上限

`CORE_LIMITS`（[limits.ts](../../../src/core/contracts/limits.ts)）是冻结的有限常量，保护内存与时间，不是原版玩法上限：原版分配器没有规则层面的上限，内存耗尽即结束程序（[对象表](../../original/formats/executable.md#runtime-object-table-p3-0201)），所以项目的故障预算没有原版对应物。调用者不能提高它们。依据以所选任务的规模（9 条记录、3 个编组，排程数十个实例）与默认 32 tick/s 计：

| 名称 | 值 | 依据 |
|---|---|---|
| `commandsPerTick` | 64 | 大于命令联合的 42 种不同命令（`map-point` 按操作计），一个 tick 可以请求全部 |
| `entities` | 2,048 | 现存实体，含运行中产生的弹丸、爆炸与碎片；超过所选任务实例数的 50 倍，每个按 1 KiB 计为 2 MiB |
| `spawnExpansion` | 1,024 | 一个世界由声明可排程的实例数（请求数 × 成员数之和）；超过所选任务的 25 倍，为 `entities` 的一半 |
| `eventsPerTick` | 4,096 | 不小于各规则推出的每 tick 事件上界，另作每 tick 请求数的上限。事件：命令结果（≤ `commandsPerTick`）+ 附加的速度事件（每条命令至多一个，≤ `commandsPerTick`）+ 速度辅助事件（≤ 1）+ 实例化（≤ `spawnExpansion`）+ 离开世界（≤ `entities`，用掉 P3-02 预留的每实体一个规则事件）= 3,201。请求见下文，3,138（[P3-06 的容量核算](../../plan/p3/06/spec.md#检查点-a-定稿的状态与契约)） |
| `recordedTicks` | 131,072 | 一次录制或 replay 的 tick 数，默认速率下 68 分钟，是切片任务的数倍 |
| `recordedCommands` | 262,144 | 平均每 tick 2 个命令，例如每 tick 按住开火再加一个动作 |
| `recordedEvents` | 524,288 | 平均每 tick 4 个事件；每个约 120 个 JSON 字符，至多 64 MB |
| `recordedCheckpoints` | 131,073 | tick 0 加每 tick 一个，所以间隔为 1 也装得下 |
| `canonicalTextLength` | 16,777,216 | 实体达上限、每个 4 KiB 的快照为 8 MiB，是它的一半；P3-06 的飞行状态在最长写法下约 1.5 KiB，每个实体仍在 4 KiB 之内 |

- `fitsLimit(name, used, added)` 与 `productFitsLimit(name, count, each)` 在不形成和或积的情况下判断是否超限，对非安全整数一律返回 false；容量在分配或执行之前检查。
- 请求不另设上限，每 tick 的投递数也受 `eventsPerTick` 约束（[goal 执行记录](../../plan/p3/02/goal.md#执行记录)）：一个世界一生至多投递 `spawnExpansion` 个生成请求（空编组的请求也计 1），每个现存实体的更新每 tick 至多投递一个生命周期请求（可用的玩家不投递），玩家更新每条速度命令至多投递一个 `control` 或 `match-speed` 请求，另加辅助的恢复请求与单独的轴请求各至多一个：2,048 + 1,024 + 64 + 2 = 3,138，在上限之内。区域检查与离开世界直接写状态，不经请求。规则的请求或事件若会进一步扇出，由其任务推出自己的上界、把 P3-06 的项计入合计并修订 `CORE_LIMITS`（P3-07 的命中类事实可能有二次项）。[budget.test.ts](../../../src/core/replay/budget.test.ts) 以真实流水线在实体上限下核对这些上界与快照文本长度，增加预算项的任务同步其中的上界。

### 扩展规则

规则按 spec 的[扩展规则](../../plan/p3/02/spec.md#扩展规则)接入，不获得自行扩展共享 API 的授权：

- **必须先修订 spec 的情形：** 新增或改变实体字段或种类、`Command`/`TickInput`、`DomainEvent` 或命令原因码、projection 分区的形状、Render State、快照或 replay 记录的形状、阶段或其次序、事件可见的时机，以及其他公开语义。修订须同步受影响的下游 spec 并取得批准；只在下游 spec 或本文件记一笔不够。不得用开放索引签名或 `unknown` 载荷绕开契约。
- **由下游 spec 自行批准的情形：** 把已约定的分区从 `not-implemented` 变为真实数据，实现既定动作的效果，填充自己阶段的 `run`，在实体初始化扩展点按 Q-07 次序加入初值与抽取。内部 helper 的变化不需要重审 P3-02。
- **代码上的落点：**
  - 阶段：在 `PIPELINE` 中给自己的阶段提供 `run`，不新增回调或订阅；改变阶段表本身须修订 spec。已由其他任务接入的阶段在其代码注释标出的位置扩展（例如 `movement` 的模式分派、`parked-update` 的停放战斗与基地报告、`area-check` 的玩家 Warp 中心）。
  - 命令：在玩家更新（[systems/flight-control.ts](../../../src/core/systems/flight-control.ts) 的 `judgeCommands`）中替换对相应命令类型与上下文的 `not-implemented` 判定；新增拒绝或忽略原因须修订 spec 并加入 `COMMAND_RESULT_REASONS`。玩家可用、上下文与读回推算的既有规则见[飞行控制、运动与停放](#飞行控制运动与停放)。
  - 实体字段：加入 `Entity`/`EntityInit` 与快照写入器（类型检查强制）；无模型的运行时种类加入自己的 `EntityPresentation` 变体，未实现的种类没有构造入口。`MovementBlock` 的新变体同时扩展 entity-table 的 `isValidMovement` 与 `copyMovement`、快照写入器按 `mode` 的分派，以及 `moveEntity` 的分支（缺分支不能通过编译）。
  - 事件：加入 `DomainEvent` 联合与 compare.ts 的事件字段表（类型检查强制），并补比较的校验；与 P3-06 事件有 tick 内次序的，同时加入 `TickOrder` 的阶段。
  - 请求：加入 `Request` 联合与 `handleRequest`，形状为封闭纯数据，投递数遵守[上限](#上限)。P3-06 交付了规则函数而未投递的请求（浮点操纵消息 0x40000、Warp 离场消息 0x800000）由其第一个投递者加入。
  - 任务状态：P3-11 扩展 `MissionStatus`。
- **版本：** 每次规则结果可能变化时递增 `RULES_VERSION`，结构变化时递增相应的格式版本（[快照、录制、replay 与比较](#快照录制replay-与比较)）。
- **数值：** 新的 f32 写回用 `Math.fround`，浮点转整数向零截断，非有限的写回为故障；定点或查表须有原版证据（[总计划 §5](../../plan/master-plan.md#5-状态管理与通信约定)）。

### 已知差异

以下差异已公开，不是“与原版一致”的声明。新版与原版的对照结论：P3-02 的 R-01 至 R-03 见 [P3-02/11 的完成证据](../../plan/p3/02/subtasks/11-comparison-docs-handoff.md#完成证据)；P3-06 的 R-04、R-05 由其[子任务 18](../../plan/p3/06/subtasks/18-comparison-verdicts.md) 按检查点 B 的判据给出，在此之前不声明运动与原版一致。

- **时间：** 32 Hz 固定步长是项目选择。原版每帧取 0、2、4 或更多时钟单位，游戏时钟相对模拟器时间偏慢且依赖 cycles（[B-006](../../original/behavior/B-006-simulation-timing.md)，U-021 未冻结）；Core 不模拟零步长帧与这一速率。G-02 占位期间不推进、结束后不补计时间。原版取样从随机值起算，依赖绝对取样值的规则由负责任务显式建模。原版首轮队列检查的原点包含构建与过场用时，Core 在时钟 2 的第一个 tick 实例化时刻 0 的项。依赖帧数或步长的规则由各自任务按 B-006 对照。
- **运动的步长与时刻：** 运动以固定步长 `clockUnitsPerTick` ÷ 64 秒积分，停放更新的到期与行进长度按时钟单位计，原版用每帧可变的步长与取样；持续运动、反复到期与组合机动的累计偏差由 P3-06 的 R-04c 按事先批准的误差预算判定。定时旋转以 f32(任务时钟 ÷ 64) 判定到期，原版以 f32 的绝对取样秒判定，原点不同，到期帧不能逐位重现。运动步长须能表示为 f32：超过 2^25 单位/tick 的合成配置在运动阶段故障，P3-02 的运行配置契约未改。
- **表现就绪：** Core 在实例化时视表现为就绪，从不进入 `awaiting-presentation`；原版等待异步载入的时长未追踪。
- **输入：** Core 逐 tick 处理命令数组；原版每次轮询最多处理一个键，其余丢弃（[输入轮询](../../original/formats/executable.md#input-polling-p3-0201)）。原版没有键盘操纵（俯仰、偏航、横滚只来自摇杆，[飞行操纵与旋转](../../original/formats/executable.md#flight-controls-and-rotation-p3-0602)）；项目轴作为原版整数路径上的数字摇杆进入同一路径（P3-06 检查点 A），每 tick 读取轴快照，不模拟原版设备的轮询到期。地图与基地上下文中有效手动轴为 0（有意差异，原版在这两个上下文不读设备、已施加的转向继续），计入 R-04c；速度命令在地图中已得到 `wrong-context`，开火等其余飞行命令的地图门禁（原版在地图中保持已读到的主炮电平）随 P3-09 的地图模式实现。飞行中切换灵敏度（F11，G-10）与自动驾驶（`a`，G-09）不提供：灵敏度固定为 Medium，速度辅助总走自动驾驶关闭的分支。
- **项目规则（P3-06）：** 以下情形原版没有可复现的行为或与项目边界不兼容，按检查点 A 的项目规则处理：
  - 非整数的轴值按 × 128 向零截断成偏转，绝对值不足一个刻度的非零轴值为 0；
  - 同 tick 多条速度命令按数组顺序全部处理，后一条命令的读回计入前序命令的推算效果，因此“增、增”等于原版相继两帧各按一次；原版 `+`/`−` 与待发送值的比较在实际中从不成立（高概率），Core 不实现；
  - 手动匹配经 `match-speed` 请求在请求处理中写入，原版 Enter 在按键处理中直接写移动块；每 tick 至多一条速度命令时结果相同（对象更新与请求处理之间目前没有读取指令速度的规则，P3-07、P3-08 在此加入读者时须复核）；
  - 油门表索引越出表时钳到表内（原版在上限降低后的 `−` 可读到表外的未定义内存）；
  - 停放 Warp 的计时按精确整数计算：负的 +0xA8 或 +0xA8 + +0xA4 使过境在首次检查时结束、不推迟 Warp；原版对绝对计数器的 u32 样本按无符号比较，只在计数器小于该持续时间的绝对值时回绕而不同。切片的机型记录没有负值；
  - 玩家的控制状态在实例化时建立，原版在下一帧的首次回调中建立；状态 7 之前没有读者，可观察结果相同（项目映射，高概率）；
  - 通讯菜单打开时 `select-number` 归菜单（P3-10 加入优先级），原版的档位键在菜单打开时仍有效（除非菜单占用该码）。
- **分阶段接入（P3-06 交付消费者，写入者尚未接入）：** 以下不是对应规则的替代，也不能写成已与原版对照：
  - 最高速度只有实例化的初值，`speedLimitStatus` 为 `'initial-only'`；能量分配、受损与救援的重算归 P3-07、P3-11；
  - 非玩家飞行器在 P3-08 交付前按实例化时的移动块运动（沿第三行直线前进）；停放对象按实例化时的 AI 状态行进，AI 程序对 AI 状态的改变、对象目标与 Warp 离场请求归 P3-08；
  - 玩家目标在生产中只会是 null：选择（含首次可操纵更新后的自动选择）与导弹锁定归 P3-07，因此手动匹配与速度辅助在 P3-07 接入前没有目标；
  - 冲量、定时旋转、操纵锁定与扰动的写入者归 P3-07，清除者归 P3-10、P3-11；
  - 玩家 Warp（模式 3 的触发、Warp 期间的区域中心、Warp 开始时清除目标）归 P3-09；
  - 停放战斗及其抽取（P3-07、P3-08）与基地报告（P3-10）尚不在停放更新中。
- **随机数：** 不复现原版序列。每次 rand() 取世界 RNG 一次抽取的高 15 位，相邻调用按独立均匀建模（原版 LCG 相邻值的联合分布未分析）。概率为 100 时原版仍掷一次 rand % 100，Core 不抽取。P3-06 已在原版的相对位置加入 `0x68050` 与 +0xC8 的抽取；`0x3060c`（P3-07）、`0x20990`（P3-08）、`0x38cd4`（P3-10）的实例化抽取与停放战斗的抽取加入之前，Core 的抽取次数与原版不同。
- **僚机记录：** 原版每次程序运行只在首次排程时填写 SCCT 僚机记录的缺省值（含随机的 +0x78），其 +0x18 计数跨任务累计；Core 每个世界重新填写、重新计数（重试就是新世界）。
- **未表达或未实现的分支：** +0x80（战役简报前的抛硬币）内容契约不能表达，切片未用；实例化后的扇区资源测试 `0x6a0b8`/`0x6a11c` 何时失败未确认，Core 视为总是通过，停放行进提交位置（`0x6a2f8`）时的扇区资源测试同样总是通过；主流程状态 1 不实例化的门禁（`0x339cc`）随 P3-11 的主流程状态加入；网格路线与固定高度种类在创建时拒绝。P3-06 另有：`0x68050` 经记录 +0x4C 的路径路线取目标点的分支不可达（内容契约拒绝该字段），所以 Core 中一次调用至多抽取 2 次；移动块的模式 1、2、4 在类型上不可构造（P3-07、P3-09 加入）；HUD 闪烁计数器不在 Core 中，速度辅助写入失败（目标没有移动块）时不发 `speed-matched`，原版此时仍可能启动闪烁，只影响表现；驾驶舱读取的第三行角速率（`0x21cf8`）不在运动 projection 中。
- **数值：** Core 的 f32 写回一律就近舍入，与两次合格原版运行中 77 个能区分两种舍入的放置一致（[B-007](../../original/behavior/B-007-mission-instantiation.md)）；原版代码推论的“渲染后向零”与此矛盾，原因未查明，重试与后续任务未观察（[U-009](../../original/unknowns.md)）。运动路径沿用同一决定，飞行中运动写回的实际舍入方向尚无运行读数，由 P3-06 的原版运行判定；若只与向零一致，按 [P3-06 技术决定 12](../../plan/p3/06/spec.md#技术决定) 处理，不在代码中悄悄改变。原版姿态第一行的 z 可以是 −0，Core 写 +0，规范文本不区分。支持的数值域之外（见[原版规则辅助](#原版规则辅助)）由世界创建拒绝；该域只对放置证明，活动对象可以飞出世界矩形，运动中只有非有限的 f32 写回是故障。

### 交接

P3-02 只交付共同契约与接入位置；P3-06 交付飞行运动、操纵与速度、活动区域与停放的规则，以及这些规则对其他任务所写状态的消费者。二者都不声明下游玩法已经完成。下面每个任务的条目先列 P3-02 的交接，再列 P3-06 的交接（依据为 P3-06 spec 的[与相邻任务的接口](../../plan/p3/06/spec.md#与相邻任务的接口)；这些下游任务的 spec 尚未生成时，以本节为交接记录）。

- **P3-03：**
  - 种类名：CINF 机型记录 +4 的文字不在三份逻辑 Asset 中，Core 只给出 `{ type: 'craft-type', kindBit }`。需要导入切片用到的种类位 0、7、8、14，以及僚机名单的种类位 1。
  - 实例化与 Warp 计时读取的机型记录字段：`0x2d400`、`0x3060c`、`0x30e0c` 与 +0xD0；+0xA4、+0xA8。
  - projection 占位需要的武器记录（`WeaponRecordReference`）、通讯菜单（`MenuContentReference`）与结果消息（`ResultMessageReference`）的内容来源。
  - **P3-03 已交付的内容：** `logic` 组的 `data/craft-info`（TABL 4003 所选倍率与 CINF 4037 的全部记录，含机型记录 +0x04 的名称与 +0xA4 等字段）、`data/debris-parameters`、`data/ai-programs`、`data/comm-menus`、`data/base-repair-items` 与 `data/flight-messages`，`models` 组的场景设置、爆炸表与星云列表，`cockpit-hud-map` 组的视角标签与 HUD 文字，以及任务 payload 的段 2 事件触发（`MissionSetup.eventTriggers`）。读取器与形状见[内容模块](./content.md#规范-json-与规则数据-payload)。`data/craft-info` 已由 P3-06 接入世界创建（[世界创建](#世界创建)）；其他数据接入 Core 的输入与规则归使用它们的规则任务。
  - **来自 P3-06：** 原版按有符号比较机型 +0xA4，executable 的 craft 一节已把它的类型改为 i32；[craft-info.ts](../../../src/content/rule-data/craft-info.ts) 仍按 int32 读取、拒绝第 31 位置位的值，与新类型不一致，由 P3-03 对齐（P3-06/21 的交接；基准数据都非负，不受影响）。Core 的停放 Warp 已按有符号值处理 +0xA4。
- **P3-04（已交付）：** 正式 Runtime、游戏会话与任务流程按下列约定接入 Core，接口见 app 模块说明的[正式 Runtime](./app.md#正式-runtime)、[游戏会话](./app.md#游戏会话)与[任务流程与所有者](./app.md#任务流程与所有者)，工程要点见[工程约定](../README.md#正式-runtime)。
  - 创建：任务所有者从同一个经 `validatePackage` 验证的资源包解码三份逻辑 Asset（[mission-input.ts](../../../src/app/resources/mission-input.ts)），连同该包的 `ContentIdentity` 经会话的 start 交给 Runtime；Core 不认证来源。生产只用难度 19 与默认步长，僚机来自开始配置，种子为平台抽取的 uint32。开发构建用 `createRecordingSession`（检查点间隔 32），生产用 `createWorld`。创建失败（`ContentContractError` 或 `CoreInputError`）留在开始配置页显示类别、路径与原因。
  - 调度：按宿主单调时钟以每秒 32 个 tick 调度，每帧至多 5 tick，超出不补跑。暂停、页面隐藏、任务菜单与 G-02 占位期间不调用 `step`，之后不补跑；会话不读取 Core 状态来暂停，战略地图、通讯菜单、基地内部、停靠倒计时、救援前的引擎内过程与结果延时照常模拟。
  - 动作批次：待执行队列上限 256，每 tick 至多 64 个命令（按住主炮每 tick 占一个），余项按 FIFO 顺延；暂停、继续、退出与返回菜单不是游戏命令。反馈按每个 tick 自己批次的 `commandIndex` 关联 commandId。
  - 错误：`step` 以路径 `recording` 的 `CoreInputError` 拒绝时是录制容量停止（运行 `stopped`，录制仍可导出）；其他 `CoreInputError` 与 `CoreFaultError` 使运行故障，之后不再向 Core 读取新的快照或导出。
  - 读模型：每个成功 step 后同 tick 取得 projection 与 Render State，保留两帧，暂停、保持、停止与故障时折叠；重开是新运行（runId 递增、tick 0），不连接两次运行。React 桥接按 10 Hz 采样，任务状态、交互上下文、分区就绪与结果的变化立即发布；开发诊断经按需快照读取，不进入生产界面；`mission` 分区的僚机选择决定出发占位的变体。
  - 录制：开发构建导出 Core `Recording` 的 JSON，`producer` 为应用名、版本与构建模式；[tools/replay-check.ts](../../../tools/replay-check.ts) 在 Node 中以同一 CloneCD 文件组用 `replayRecord` 与 `compareReplayResults` 核对（[工具指南](../../guides/tools.md#录制重放核对)），P3-15 使用同一路径。
  - 运行中衔接（下游）：P3-04 只实现初始出发保持（G-02/2，会话 `transition`）。运行中的停靠、离港与结果衔接（G-02/3 起）所需的 Core 状态、输出、继续条件与 replay 语义，由 P3-10、P3-11 按[扩展规则](#扩展规则)确定，并共同修订 P3-04 spec 的运行中衔接；当前没有每 tick 的外部检测器或写回 Core 的入口。占位的显示、计时与生命周期可以复用（[P3-04 衔接占位](../../plan/p3/04/spec.md#衔接占位)）。
  - **来自 P3-06：**
    - 创建与 replay 还需要同一资源包的 `data/craft-info`：用该包的 `decodeRuleDataPayload` 解码，作为 `CreateWorldInput.craftInfo`（经会话的 start 交给 Runtime）与 `ReplayContent.craftInfo` 传入，`original-import` 只接受这一个 Asset ID（[世界创建](#世界创建)）。任务所有者与诊断、[tools/replay-check.ts](../../../tools/replay-check.ts) 与浏览器 replay 都要传入它；合并 main 之后的接入与回归由 [P3-06/24](../../plan/p3/06/subtasks/24-p3-04-integration.md) 进行。
    - `flight` 分区分为 `motion` 与 `combat` 两组，没有外层的 `readiness`：运动组已就绪，战斗组在 P3-07 之前为 `not-implemented`，消费者分别检查；`speedLimitStatus: 'initial-only'` 表示最高速度只是开发期的初值。
    - 事件总线与开发事件日志须列出 P3-06 的四种事件（[契约](#契约contracts)）；命令反馈多了 `player-unavailable`、`wrong-context` 与 `no-target` 三个原因码。
    - 清键后送入的中立轴快照由 Core 按变化检测在当 tick 应用零偏转；Core 没有可在恢复后重新生效的旧手动轴，已接受的指令速度与速度辅助状态不随清键改变。
- **P3-05：**
  - 动作采样：把设备输入映射为 `TickInput`，不传扫描码或物理键名；轴的正方向按[契约](#契约contracts)。
  - 按住开火：按住期间每个采样的 tick 产生一个 `fire` 命令；两次采样之间的短按也保留一次；不用 OS 自动重复决定射速；Core 不保存永久的按住标志。
  - 清键：暂停、隐藏、失焦、退出 Pointer Lock 与 G-02 衔接时清除外部按住状态与未执行队列，恢复后只采纳新按下。Core 没有按键缓冲，不会重放旧输入。会话已在暂停、隐藏与结束时自行清除意图与队列，失焦与退出 Pointer Lock 由输入适配器调用会话的 `clear-input`（P3-04 已交付）；按住开火的电平经 Runtime 的连续意图 `primaryFire` 设置。
  - Q-10（已确认，代码）的事实见 executable 的[输入轮询](../../original/formats/executable.md#input-polling-p3-0201)与 [B-005](../../original/behavior/B-005-campaign-rescue.md) 的被毁视角：轮询节奏与“每次一键、其余丢弃”、按视角模式选择上下文、Alt 作为电平与空格作为单次请求、缓冲只由过场清空、被毁期间不轮询游戏按键。逐 tick 命令是 spec 有意的差异（[已知差异](#已知差异)）。物理键位研究（U-011）与绑定归 P3-05。
  - **来自 P3-06（[操纵](../../plan/p3/06/spec.md#操纵)）：**
    - 轴的语义已定：`pitch`、`yaw`、`roll` 对应原版第 1、2、3 轴，正方向是原版设备的正偏转（代码链已确认，画面含义高概率，由 P3-06 的原版运行核对）；三个轴是原版整数路径上的数字摇杆，±1 为满偏，非整数轴值 × 128 向零截断，绝对值不足 1/128 的非零值等于 0；偏航与横滚可同时非零。按键产生 ±1 即可，Core 只在偏转变化时应用，按住期间不需要重复。
    - 原版没有键盘操纵，方向键与小键盘是视角键：项目的操纵键由 P3-05 选取，不与原版视角键冲突，并记为项目选择。
    - 普通飞行中的 `select-number` n 是原版 Shift+n 的速度档位（Shift+0 由 `maximum` 表达），未按 Shift 的数字在飞行中无作用。
    - `a`（自动驾驶，G-09）与 F11（飞行中切换灵敏度，G-10）按缺省清单拦截并标注；Core 没有对应命令。
    - 按住 `+`/`−` 如何产生命令由 P3-05 决定：Core 每 tick 处理收到的每条命令，不按 DOS 轮询丢弃；同 tick 多条命令的读回依次累计。
    - 地图与基地中的手动轴归零已在 Core 中实现；P3-05 自己的地图模式清键仍按其范围进行。
- **P3-06（已交付）：** `movement`、`parked-update`（含离开世界）与 `area-check` 阶段；`speed` 命令、普通飞行的 `select-number` 与 `confirm-selection`，以及轴的效果；`flight` 分区的运动组；玩家起飞初始状态；实例化扩展点中的最高速度、AI 初态、两个计时与初始移动块。自动驾驶 `a` 不进入 P3（G-09）。见上文各节与 [P3-06 goal](../../plan/p3/06/goal.md)。

实例化写入的、依赖机型记录或其他规则的初值与抽取，原版事实见 executable 的[实例化](../../original/formats/executable.md#instantiation-p3-0203)，逐任务的清单见 [03 的交接](../../plan/p3/02/subtasks/03-spawn-defaults-names-research.md#完成证据)；输入与流水线方面的交接见 [01 的交接](../../plan/p3/02/subtasks/01-pipeline-entity-input-research.md#完成证据)。下面只列负责的阶段、分区与扩展点上的义务。

- **P3-07：** `collision`、`delayed-player-explosion` 与 `energy` 阶段；`fire`、`target`、`cycle-main-weapon`、`select-missile`、`energy`、`damage-report` 的效果；`flight` 分区的资源与武器。扩展点：`0x3060c`（含 1 次抽取）及武器挂点、+0xD0 等依赖机型记录的字段。写入被毁标志、`destroyed-source` 与 `projectile-hit`；弹丸在发射帧的请求处理中产生，本 tick 不运动。
  - **来自 P3-06：**
    - 运动模式：弹丸与导弹的模式（原版 1、2）作为 `MovementBlock` 的新变体加入，同时扩展 `isValidMovement`、`copyMovement`、快照写入器的分派与 `moveEntity` 的分支；导弹的弹体记录在 `motionRecord` 中给出；模式 1 之后的命中测试是否留在运动循环中由 P3-07 判定，需要改阶段表时修订 P3-02 spec。导弹可直接使用 `craftMovementBlock`、`integrateCraft`、`rotateRows` 与 `motionStep`；导弹回调与种类 `0x4000` 的回调直接调用浮点操纵路径 `applyFloatControl`。
    - 最高速度：用 `playerEnergyOperands` 与 `playerMaximumSpeed` 以实时的能量与子系统状态按原版时序重算（实例化、救援、导弹与种类 `0x4000` 的构造、能量分配改变；受损与基地修理不重算），随后调用 `applyRecomputedMaximum`。`0x3060c` 的能量字段与 1 次抽取在实例化扩展点的最高速度之后，接着是两位字段。接入后把 projection 的 `speedLimitStatus` 改为 `'live'`，此后不得回退到初值；补齐动态最高速度的契约测试与原版对照。
    - 目标：玩家目标的选择、首次可操纵更新后的自动选择（`0x2799c`，玩家更新末尾，排除 Warp 中的对象）与导弹锁定（`0x2ddbc`，失效目标清除与速度辅助之间），位置已在 [flight-control.ts](../../../src/core/systems/flight-control.ts) 中以注释标出；战斗组 projection 的 ready 形状。接入前手动匹配与速度辅助没有目标。目标停放时的清除已由 P3-06 实现。
    - 写入者：冲量、定时旋转（导弹爆炸与两处碰撞响应）、操纵锁定（能量耗尽，`0x21ba0`）与扰动（受损，`0x21bd4`）写入移动块，写入者自身的效果见 executable 的[飞行操纵与旋转](../../original/formats/executable.md#flight-controls-and-rotation-p3-0602)；积分与操纵应用对它们的消费已实现，并经内部状态测试。
    - 停放战斗（`0x2ffec`/`0x30150`，与 P3-08）在 `updateParked` 注释标出的位置加入，带其抽取。
    - 运行时种类的构造者用 `allocatorFlightState()`，并定义自己的 `lastParkedUpdateClock`。
    - 预算：P3-07 的事件与请求项计入 `eventsPerTick` 的合计（P3-06 的项见[上限](#上限)），并同步 [budget.test.ts](../../../src/core/replay/budget.test.ts) 的上界。在对象更新与请求处理之间加入读取指令速度的规则时，复核手动匹配经请求写入的项目规则（[已知差异](#已知差异)）。
    - `0x3060c` 的抽取与自动选择接入后，与 P3-06/18 重跑 P3-06/16 的本地真实内容核对。
- **P3-08：** 扩展点：`0x20990`（AI 程序）。使用实体的 `aiValueA`–`aiValueC`、记录的 `aiTarget`/`aiTargetCraftTypes`、编组的 `leader` 与实体的 `formation`（P3-06 已存储领队与相对布局首项的偏移）。AI 在对象更新中分配对象时受实时遍历影响：更高种类位的新对象在同一遍更新。
  - **来自 P3-06：**
    - `0x68050` 的实例化初态已由 P3-06 实现（检查点 A 移入）；AI 程序此后改变 `ai` 的模式、目标、目标点与偏移，并写入非玩家对象的 `ai.objectTarget`。加入其余 AI 模式时按扩展规则扩展 `AiMode` 与实体表的校验。
    - AI 驾驶调用 `applyFloatControl`，第一个投递者按扩展规则加入浮点操纵请求（消息 0x40000）；AI 的速度匹配复用 `speedMatch`/`applySpeedMatch`（消息 0x80000 的 AI 形状由 P3-08 加入）。
    - Warp 离场请求（消息 0x800000：写 `area-switch`、`inWarp`、`warpClock` = 0，并使下一次停放检查立即到期）；停放行进已把“`inWarp` 且 `warpClock` 为 0”当作离场请求触发跳跃。
    - 停放战斗（与 P3-07）；`object-sets` 阶段建议归 P3-08（停放对象的 AI 处理读取它）。
    - 种类 `0x4000`：用 `rebuiltMovementBlock` 按旧速度比重建移动块，`lastParkedUpdateClock` 取创建时钟（项目规则）。
    - 恢复活动后的 AI；在此之前非玩家飞行器沿实例化时的移动块直线运动，停放对象按实例化时的 AI 状态行进。
- **P3-09：** `warp-completion` 与 `frame-end` 阶段；`toggle-map`、`map-point`、`request-warp` 的效果与 `map` 分区；地图开启时飞行命令的门禁。世界框架已由 `runtimeFrame` 校验。
  - **来自 P3-06：**
    - `warpClock`、`inWarp` 已在实例化中写入（玩家与僚机以外 1 次抽取）并由停放路径读写；玩家 Warp 与 Warp 完成复用同一字段。
    - Warp 开始把玩家移动块就地切换为 `warp` 模式（积分为 `integrateWarp`）并清除玩家目标，Warp 完成切回 `craft`；Warp 期间的区域中心在 `activeAreaCentre` 中加入。
    - 地图上下文中的手动轴归零与速度命令的 `wrong-context` 已在 Core 中；地图中的 `select-number`、`confirm-selection` 仍为 `not-implemented`，由 P3-09 接入。
    - 种类 25 的地图标记没有机型记录：世界创建拒绝投递种类 25 实例的内容（所有原版任务都没有），运行时创建的标记若带移动块并通过运动筛选，会在 `movement.record` 处故障，因此须按扩展规则为其模式 4 加入不需要机型记录的变体（与 P3-13）。
- **P3-10：** `communications-reply` 与 `base-interior` 阶段，以及 `mission-flow` 中的停靠子状态；`communications`、`launch`、`select-number`、`navigate-selection`、`confirm-selection` 在通讯与基地上下文中的解释，僚机命令经菜单转给 P3-08；`communications` 分区。扩展点：`0x38cd4`（敌方类对象实例化时的僚机报告）。
  - **来自 P3-06：**
    - 通讯菜单打开时 `select-number` 归菜单的优先级（原版档位键此时仍有效，是已知差异）；基地上下文中的 `select-number`、`confirm-selection` 仍为 `not-implemented`。
    - 基地修理 `0x398ec` 清除操纵锁定与扰动，完全修理 `0x39820`（停靠与离港等调用）清除扰动。
    - 停放行进中的僚机到达基地报告 `0x39820` 与靠近基地报告 `0x3c3b0`，位置已在 [area.ts](../../../src/core/systems/area.ts) 中以注释标出。
    - 停靠的实体保留移动块并参与运动，离开活动区域时也会停放；基地上下文中的手动轴归零已在 Core 中。
- **P3-11：** `mission-flow` 与 `mission-teardown` 阶段、`MissionStatus` 的后续状态、`result` 分区。使用 `disableSpawning`（成功时清除生成开关）、`pendingSpawns`（全清判定）、`placeWorldRecord`（救援放置，存储位置路线）与事件列表中的 `object-instantiated`（段 2 触发计数，触发与区间来自 `MissionSetup.eventTriggers`）；对象事件的按种类计数与触发标志在扩展点接入。主流程状态 1 的实例化门禁（`0x339cc`）随状态加入。被毁不等于移除，救援复用玩家实体。
  - **来自 P3-06：** `object-left-world`（带来源快照，每个对象一生至多一次）供段 2 的触发计数。救援用 `rebuiltMovementBlock` 按旧速度比重建玩家移动块（新块没有锁定与扰动，与原版每次建块时的清除一致）并重算最高速度（`playerMaximumSpeed` 与 `applyRecomputedMaximum`）；玩家的控制状态在救援中保留。
- **P3-12、P3-13：** 消费 Render State（停放不呈现、放置序号、新 ID 只用当前位姿、被毁在移除前仍列出）与 projection；相机由 Render State 与视角模式推出；`cockpit-front` 的效果与被毁视角的门禁按原版（B-005）。名称文字：候选与池从 setup 解析，种类名来自 P3-03 导入的 `data/craft-info`（CINF 机型记录 +0x04，见上文 P3-03 一条）。
  - **来自 P3-06：**
    - 速度读数与辅助指示来自 `flight.motion`（当前、指令与最高速度，`speedLimitStatus`，`speedAssist`）；持续状态从 projection 读取，不靠累计事件重建。
    - 一次性反馈来自事件：`speed-assist-toggled`（开/关消息；开启时启动 HUD 闪烁）、`speed-matched`（assist 且 `speedDifferenceExceeded` 时闪烁）与 `speed-assist-released`。消息文字从 `data/flight-messages` 与 HUD 内容解析，Core 不含文字；HUD 闪烁计数器归 P3-13。
    - 驾驶舱表现读取的第三行角速率（`0x21cf8`，不含定时分量）不在运动 projection 中；需要时按扩展规则修订分区。
    - 停放期间的位置写入使放置序号加 1；停放实体不呈现，恢复后渲染器不跨停放插值。
- **P3-14：** 音效由领域事件与 projection 触发；原版派发器每遍清空的表现项不是 Core 阶段。P3-06 的速度辅助与匹配事件可作为音效触发源（若原版有对应音效）。
- **Q-11 的数值交接（P3-06、P3-07）：** x87 以双精度运算，位置与姿态以 f32 存储；f32 写回按用户批准的决定就近舍入（取代 P3-02/02 完成证据中“继承向零舍入”的说法），浮点转整数向零截断，长度用 FSQRT。运动中的姿态旋转用 FSIN/FCOS（已确认），映像中没有找到正弦或余弦表（高概率），见 executable 的 [x87 一节](../../original/formats/executable.md#x87-precision-rounding-and-trigonometry-p3-0202)。P3-06 按运动路径的写回点实现了同一策略（[原版规则辅助](#原版规则辅助)）；飞行中运动写回的实际舍入方向仍待 P3-06 的原版运行，舍入方向与代码推论的矛盾仍是 U-009 的开放问题。P3-07 的弹丸与导弹沿用同一策略。

### 针对性检查

- 全部 Core 与边界回归：`pnpm exec vitest run src/core tools/engineering-boundaries.test.ts`。
- 按目录：`pnpm exec vitest run src/core/contracts`、`src/core/world`、`src/core/systems`、`src/core/rules`、`src/core/projections` 或 `src/core/replay`。
- 规范文本、录制与比较中各有一组按上限规模运行的用例，声明 30 s deadline（[工程约定](../README.md#测试)）。
- P3-06 的规则与系统测试与源码相邻（`flight-state`、`flight-motion`、`flight-control`、`speed-match`、`initial-ai`、`random-direction`、`active-area`、`parked-travel`，以及 `systems/` 的 `movement`、`flight-control`、`area`）；[motion-replay.test.ts](../../../src/core/replay/motion-replay.test.ts) 以 `startReplay` 与替身写入者核对带轴、多命令、目标失效与多次辅助匹配的 160 tick 录制经 JSON 往返后的 replay；[budget.test.ts](../../../src/core/replay/budget.test.ts) 在实体上限下以真实流水线核对 P3-06 的事件与请求上界及快照文本长度。
- 测试支持（不进入生产导入链）：[world.test-support.ts](../../../src/core/world/world.test-support.ts) 的 `entityInit`、`stillEntityInit`（油门 0 的移动块：活动实体现在每 tick 运动，需要固定位置时用它）与 `addPlayerEntity`（区域检查在没有玩家实体时把非玩家实体停放）；[rand.test-support.ts](../../../src/core/rules/rand.test-support.ts) 的 `scriptedRand`、`randValues` 与 `rngStateAfter`（由世界 RNG 状态独立预测抽取）；[flight-motion.test-support.ts](../../../src/core/rules/flight-motion.test-support.ts) 是运动一帧的独立参照，在 BigInt 精确有理数上按 executable 的写回点逐步舍入，不用 JS 浮点运算或被测代码；[derivation.test-support.ts](../../../src/core/rules/derivation.test-support.ts) 提供规则测试共用的精确有理数 f32 舍入（P3-02/02 的推导）。
