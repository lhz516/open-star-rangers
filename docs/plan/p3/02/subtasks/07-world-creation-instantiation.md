---
type: plan
status: active
phase: P3
task: "02"
subtask: "07"
updated: 2026-10-09
---

# 07 — 世界创建、任务实例化与僚机

**契约来源：** [spec](../spec.md) 的 S-03、S-06、S-07；AC-02、AC-03（生成到期）、AC-05、AC-06（别名集成）、AC-07、AC-08、AC-10（来源与放置序号）；[运行配置与世界创建](../spec.md#运行配置与世界创建)、[任务实例化](../spec.md#任务实例化)、[僚机](../spec.md#僚机)、技术决定 7、8。
**依赖：** 03, 05, 06。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **创建入口：** 输入为三份逻辑 Asset、`ContentIdentity` 与运行配置 `{ rawDifficulty, wingman, seed, clockUnitsPerTick? }`：
  1. 用 [load-mission.ts](../../../../../src/core/mission/load-mission.ts) 得到 `MissionSetup`，读取器错误原样传递；用 `readContentIdentity` 校验身份结构。
  2. 配置：原始难度 0–100 的整数，按阈值 34、67 求出的组必须等于 `campaign.group`；`original-import` 只接受难度 19、group 0/slot 1 与生产任务 Asset `mission/first-campaign`，且只用默认 `clockUnitsPerTick`；其他取值只用于 `synthetic` 来源的契约测试。僚机为 null 或 `wingmanOptions` 的索引；种子为 uint32。
  3. 语义校验：玩家为种类位 0、僚机为位 1；模型、阵营与交互类别符合已支持的绑定；比例有限可换算；地图轴与世界矩形符合本切片；`RuleInputs` 中的显式 0 拒绝；切片外路径拒绝（`gridSpacing` 非零、非空且不为 100 的生成概率、掩码 `0x87c` 内的种类、乘 64 后超出 uint32 的生成时刻，以及 03 发现的其他未实现分支）；按安全整数展开“请求数 × 成员数”并对照 `CoreLimits`。
  4. 计算 `setupHash`：校验后完整 setup（名称、坐标、成员与全部规则输入）的规范文本哈希。
  5. 初始状态：tick 0、时钟 0、视角模式 0xC、任务状态“已构建”、没有实体；生成队列按 03 的 Q-01 排好；只完成 Q-04 证实属于构建期的缺省与抽取。创建不返回事件。
  错误只含稳定原因与结构路径，不回显导入的名称、坐标或 payload。
- **缺省值（Q-04）：** 各字段分别实现 null、显式值、负值语义，只对已证实的字段钳为 0；+0x70/+0x74 的缺省为 (组 + 3) × 任务号，任务号小于 1 时为 100；+0x78 的随机映射与抽取时机按 Q-04；任务号取 `campaign.slot`。
- **生成（填入 05 的派发器规则阶段）：** 生成队列检查只为每个到期请求产生生成请求，实例化在 05 的请求处理中按投递次序进行；到期判定“经过时间 > 生成时刻”；每次到期的请求数（段 1 用 +0x10、段 5 用 +0）；段 5 成员按布局偏移 i mod 布局数、余数为 0 时重算锚点、模板字段复制条件按 Q-02；放置调用 06 的服务；同刻多项与多次请求的次序按 Q-01。
- **实例化（Q-07）：** 写入 05 实体表的字段：种类、对象状态（新建）与活动（非玩家实体是否停放按 Q-07）、带命名空间的来源（编组索引、第几次请求、成员位置）、名称引用、阵营、模型、交互标志、位置、姿态、规则输入副本、放置序号；更新源记录与编组的生成计数与当前对象关联；玩家实例化设视角模式 0xC；产生 `object-instantiated` 事件（按实例化顺序）。依赖机型记录的初值不填，交 P3-06、P3-07。
- **名称（Q-05）：** 封闭联合 `none`、`candidate`、`pool`、`craft-type`；占用与释放进入世界状态；种类名文字若不在三份逻辑 Asset 中，只交付结构引用并在完成证据中列出交给 P3-03 的导入需求。
- **僚机（Q-06）：** null 时整个运行都不生成僚机；索引 i 时按门禁排程名单第 i 项（原版选择值 = i + 1），时刻、放置（锚点缺省为玩家记录）、缺省值与名称按 Q-06。僚机选择进入 `mission` projection。
- **供其他规则使用的接口：** 生成开关（清除由 P3-11 调用）与查询；待生成项及其来源的查询（P3-11 全清判定）；实例化通知（P3-11 段 2 计数）；放置服务（P3-11 救援）。这些接口只在 Core 内使用。
- **测试：** 合成任务覆盖[任务实例化](../spec.md#任务实例化)表中每条“实现”路径，期望由测试独立写出，不复用被测 helper；2 与 4 单位/tick 下的生成到期边界；每类拒绝的路径与原因，以及诊断不含 `MARKER` 名称或坐标；同一输入创建两次的初始状态规范文本相同，修改调用者数据不影响世界。

## 不包含

- 正式快照与 replay（08）；真实内容核对（09）；原版运行时核对（10）。
- 运动、武器、AI、地图、通讯与任务流程规则（P3-06 至 P3-11）；种类名文字的导入（P3-03）。

## 关键文件与契约

- [load-mission.ts](../../../../../src/core/mission/load-mission.ts)、[logic-content.ts](../../../../../src/content/logic/logic-content.ts)、[content-identity.ts](../../../../../src/content/content-identity.ts)：只读消费。
- [logic-content.test-support.ts](../../../../../src/content/logic/logic-content.test-support.ts)：合成任务的基础，测试中按需改写。
- 05 的世界与阶段表；06 的放置与换算；04 的契约。
- 计划新增：`src/core/world/create-world.ts`、`run-config.ts`、`setup-hash.ts`；`src/core/systems/spawn.ts`；`src/core/rules/record-defaults.ts`、`spawn-schedule.ts`、`name-assignment.ts` 及相邻测试（文件名可调整，职责不变）。

## 写入范围

- `src/core/world/**`：创建入口、运行配置与 setupHash。
- `src/core/systems/**`：生成阶段。
- `src/core/rules/**`：缺省值、排程与名称分配。
- `src/core/projections/**`：mission 分区中的僚机选择与任务状态。

## 验收标准

- [x] AC-02：初始状态符合契约；每类非法配置、生产切片或难度不符、种类绑定错误、换算异常、别名不符、切片外路径与展开超限都在创建前拒绝，不返回世界；诊断不含名称与坐标；`original-import` 与 `synthetic` 的范围门禁分别有测试；相同输入两次创建的规范文本相同。
- [x] AC-03（生成部分）：在 2 与 4 单位/tick 下，生成时刻为 T 秒的项在时钟首次大于 64T 的 tick 实例化。
- [x] AC-05：每条“实现”路径的实例化 tick、次序、数量、来源、编组成员与布局偏移、`object-instantiated` 事件的内容与次序；生成开关清除后不再实例化；实体 ID 从 1 起连续且不复用。
- [x] AC-06（集成部分）：同时被编组引用的 `object` 来源记录只换算一次；仅段 5 可达记录按 Q-03 处理。
- [x] AC-07：Q-04 逐字段的 null/显式零/负值/正值语义与抽取时机；Q-05 的候选、池、无名、种类名、耗尽与释放；占用与计数进入世界状态。
- [x] AC-08：僚机为 null 时没有种类位 1 的对象；每个索引恰好生成该名单项，时刻、放置、缺省值与名称符合 Q-06；越界索引被拒绝。
- [x] AC-10（本项部分）：事件与 Render State 中的来源命名空间、模型与种类分离、放置序号正确。
- [x] `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts`、`pnpm typecheck`、`pnpm lint` 通过；完成前运行 `pnpm check`。

## 验证方法

- Vitest 单元测试（Node，合成逻辑内容），独立期望表与带 `MARKER` 的隐私断言。
- 真实内容与原版对照分别在 09、10 进行。

## 完成证据

2026-10-09，worker 分支 `exec-p3-02-07`（基于认领提交 `19cff3d`）。

**实现：**

- **创建入口**（`src/core/world/`）：[create-world.ts](../../../../../src/core/world/create-world.ts) 的 `createWorld({ mission, craftTypes, wingmanRoster, identity, run })`（内部 `initialWorldState` 供测试与 08）：`loadMission` 与 `readContentIdentity` 的错误原样传递，再读运行配置、语义校验、换算坐标、按原版次序填缺省并排好队列，返回 tick 0 的世界，不返回事件。
  - [run-config.ts](../../../../../src/core/world/run-config.ts)：`{ rawDifficulty, wingman, seed, clockUnitsPerTick? }`，阈值 34/67 求出的组须等于 `campaign.group`；`original-import` 只接受难度 19、`mission/first-campaign` 与默认步长（group 0/slot 1 已由内容读取器保证）。
  - [setup-check.ts](../../../../../src/core/world/setup-check.ts)：玩家须为种类位 0、恰为一条不在编组中的段 1 记录且只有 1 个请求；阵营与交互类别须符合敌方 `0x93780`、友方 `0x206c87e`、交互 `0x68000` 的绑定；拒绝固定高度种类（`0x87c`）、任务中的种类位 1、无种类的编组成员、任一声明或僚机选项 `RuleInputs` 中的显式 0；被直接排程的记录与模板拒绝 `spawnTime × 64` 超出 u32、非空且不为 100 的概率与非零网格间距，所选僚机拒绝后两者；僚机选项须为种类位 1；坐标经 06 的 `runtimeFrame`/`runtimePosition`/`runtimeRegion`/`runtimeVector` 校验与换算（每个声明换算一次）；展开 Σ max(0, 请求数) × max(1, 成员数)（另加僚机 1）不超过 `CORE_LIMITS.spawnExpansion`（1024）。
  - [setup-hash.ts](../../../../../src/core/world/setup-hash.ts)：按显式字段次序把完整 `MissionSetup`（名称、坐标、成员、规则输入、阵营/模型/交互）写成规范文本，`fnv1a64` 为 16 位小写十六进制。
  - [world-state.ts](../../../../../src/core/world/world-state.ts)：`WorldConfig` 增加 `content`（完整内容身份）与 `setupHash`；`WorldState` 增加只读的 `setup` 与 `spawn`。[spawn-state.ts](../../../../../src/core/world/spawn-state.ts)：缺省后的运行记录（声明引用、运行时位置/矩形、+0x48、网格、规则输入、+0x58/+0x5C、+0x18 计数）、编组状态（布局、+20 计数、+24 首成员）、队列项 `{ due, source, index, requests }`、生成开关与名称池计数。
  - [entity-table.ts](../../../../../src/core/world/entity-table.ts)：实体增加 `side`、`baseInteraction` 与 `ruleInputs`（+0x60–+0x68、+0x70–+0x78 的缺省后副本）。
- **规则**（`src/core/rules/`）：[record-defaults.ts](../../../../../src/core/rules/record-defaults.ts)（Q-04 逐字段：+0x0C/+0x10/+0x74 保留负值，+0x60–+0x68/+0x70/+0x78 钳 0；+0x70/+0x74 缺省为 (组 + 3) × 任务号或 100；+0x78 为 rand % 60 + 20，一次抽取；不填写的记录取源值）；[spawn-schedule.ts](../../../../../src/core/rules/spawn-schedule.ts)（Q-01：段 1 记录按数组次序填缺省并入队，玩家之后紧接所选僚机（时刻 0、锚点为玩家记录），再按次序入队编组；稳定升序）；[name-assignment.ts](../../../../../src/core/rules/name-assignment.ts)（Q-05 各分支，占用按文字比较，池计数在世界状态中）。
- **生成阶段**（`src/core/systems/`）：[spawn.ts](../../../../../src/core/systems/spawn.ts) 的 `checkSpawnQueue` 填入 `spawn-queue-check`，只为每个到期项（时钟 > 到期）投递请求；`dispatchSpawn` 在请求处理中按投递次序放置并实例化（编组按 i mod L 取偏移，每个周期开始时由模板重算锚点并清空 +24，模板 +0x58/+0x5C 非空时复制进成员记录），写回 RNG 状态；实例化写入种类、来源、名称、阵营、模型、交互标志、位置、姿态（玩家为单位矩阵，其他为放置姿态）、活动（玩家必为活动；其他在玩家实体 x/y 半径² < 56,250,000 内为活动，无玩家时停放）、规则输入，玩家另设视角与上一视角为 0xC，并产生 `object-instantiated`。[pipeline.ts](../../../../../src/core/systems/pipeline.ts) 的 `Request` 增加生成请求，`handleRequest` 分派。供 P3-11 的 Core 内部接口：`isSpawningEnabled`、`disableSpawning`、`pendingSpawns`、`placeWorldRecord`（救援放置）；实例化通知为本 tick 事件列表中的 `object-instantiated`，段 2 触发计数等在 `instantiate` 中注明的扩展点按 Q-07 次序接入。

**检查：**

- `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts`：33 个文件、917 项通过。新增 143 项：[create-world.test.ts](../../../../../src/core/world/create-world.test.ts) 71、[spawn.test.ts](../../../../../src/core/systems/spawn.test.ts) 27、[record-defaults.test.ts](../../../../../src/core/rules/record-defaults.test.ts) 29、[name-assignment.test.ts](../../../../../src/core/rules/name-assignment.test.ts) 10、[spawn-schedule.test.ts](../../../../../src/core/rules/spawn-schedule.test.ts) 6；05 的测试只改了实现阶段列表、`projection` 的任务 Asset 与请求联合的类型收窄。
- `pnpm typecheck`、`pnpm lint` 通过；`pnpm check` 通过（177 个测试文件、5,144 项，生产构建成功；大 chunk 提示与 typescript-eslint 弃用警告为既有输出），13 的两个重型测试未超时。
- **AC-02：** 初始状态（tick 0、时钟 0、无实体、视角 0xC/0xC、已构建、队列 7 项、开关已置、配置字段）与 Render State 为空；创建只抽取 +0x78（切片形任务 8 次、带僚机 9 次，以独立迭代 Mulberry32 的状态核对）；同一输入两次创建的状态文本相同，创建后改动调用者的任务、名单与配置不影响世界，两个世界不共享 setup 与记录。拒绝：输入结构、读取器错误（含别名不符的 `logic-reference-mismatch`）与身份错误原样传递；运行配置每个字段；`original-import` 的难度、任务 Asset 与步长门禁，`synthetic` 可用其他取值；地图轴/中心/扇区数、参考比例、玩家种类/编组/请求数、阵营与交互绑定、无支持阵营的种类、固定高度、任务中的僚机种类、无种类成员、8 个字段的显式 0（任务与僚机）、u32 生成时刻（limit/limit + 1）、概率与网格（记录、模板、所选僚机；成员与未选僚机不读取则接受）、坐标/矩形/布局/僚机位置换算；展开上限 1023+1 / 1024+1、僚机计入、编组乘积不溢出与空编组的请求计数。每类诊断都不含 `MARKER` 名称，坐标类不含输入或换算后的数值。setupHash 不随种子、僚机与身份变化，随名称、池、坐标、矩形、布局、成员、请求数、规则输入、AI 目标种类与模型绑定变化，与输入键序无关。
- **AC-03（生成）：** 2 与 4 单位/tick 下，时刻 0、1、3 秒的项分别在 tick 1、33/17、97/49 实例化，即 ⌊64T ÷ 单位⌋ + 1。
- **AC-05：** 切片形任务（结构同 [所选任务实例化清单](../../../../original/formats/scenario.md#selected-mission-instantiation-p3-0203)）按独立写出的表核对：tick 1 依次为玩家、记录 3 ×2、记录 7 ×4、记录 8 ×35、编组 0 与 1 的 2 请求 × 2 成员，ID 1–50 连续；编组 2 在 64 单位/tick 下于首个时钟超过 19,200 的 tick 301 实例化 3 × 2 个，ID 51–56（期间移除的实体 5 不被复用）；按种类数为 0:1、7:12、17:4、14:35、8:4；记录计数、编组计数与 +24 首成员；事件内容与实体一致、深度冻结、位置脱离。请求处理中实例化的实体在 movement 时无一处于活动状态，下一 tick 才成为 active。开关清除后不再实例化，待生成查询返回脱离的冻结副本；请求数 ≤ 0 的项与不填写、概率为源值 0 的模板不实例化。名称：玩家、0x80、0x4000 用种类名，四个 0x20000 依次取候选 0–3。
- **AC-06（集成）：** 同时为段 1 记录与编组模板的记录，直接实例化与作为模板锚点都只换算一次 R_z(p × 1.875)（与换算两次不同），成员 1 为 R_z(A + l)；仅段 5 可达的模板位置不换算。编组周期：3 个成员、2 个偏移时，第 0 与第 2 个成员各自由新锚点放置（矩形期望由 `expectedRectangle` 与独立的 rand 序列给出），姿态取所在周期锚点。锚点取锚定记录种类表中最早的实体（被毁时仍取它），锚定对象未生成或锚定记录为种类 0 时走全世界缺省（`expectedWorld`）。
- **AC-07：** 逐字段 null/正值/负值语义（含 u32 ≥ 2^31 的负值）、+0x78 抽取次数与 547/546 原像计数（对 32,768 个 rand 穷举）、任务缺省与任务号 < 1 的 100、未填写记录；显式 0 在创建时拒绝（AC-02）。同一记录的多个实例共享缺省（期望由种子推出的抽取次序独立写出）。名称：0x6001、候选首个可用、检查掩码 0x68000/0x87c、文字相同的候选或池名占用、任意状态的持有者占用、移除后释放、全部占用时有池则随机重复（rand % 数量）无池则无名、0x93780 与 0x78000 与空池的分支、池的起点、循环、计数与重置；运行中的释放与池计数也在世界中核对。
- **AC-08：** 无僚机时队列耗尽后没有种类位 1 的对象；索引 0–4 各恰好生成该名单项，ID 2 紧随玩家，位置为玩家位置加独立推出的锚点偏移，名称为其候选 0，+0x78 为创建时紧随玩家的第二次抽取，阵营 friendly，projection 记录选择；越界索引 5 被拒绝（AC-02）。
- **AC-10（本项）：** 事件来源为带命名空间的 `{ collection, index, group }`；Render State 只列活动实体，`kindBit` 与 `model/craft-<n>` 表现分开，放置序号 0；观察实体为玩家。

**Rubber-duck：** 三项全部采纳：① 实体未保存阵营与交互标志（工作范围要求写入）：`Entity`/`EntityInit` 增加 `side`、`baseInteraction`，测试按种类核对；② 输入别名测试看不到不进入状态文本的 setup：增加 setup 名称/坐标不变、深度冻结与两个世界不共享的断言；③ 一项规则输入期望取自被测状态：改为由种子推出的抽取表独立写出。

**Simplify：** 采纳：共用 `toInt32`；运行记录去掉可由声明推出的 `kindBit`，生成状态去掉未读的 `regions`，几何只保留所选僚机的位置；`setupValue` 改为模块私有；生成阶段直接把请求队列交给 `checkSpawnQueue`，不再每 tick 建闭包；长时测试改用 64 单位/tick（编组 2 仍按首个超过 19,200 的 tick 核对）。未采纳：删去只写的计数与 +24（spec 要求进入世界状态，供 P3-08 与 08 的快照）；从 setup 推出 `WorldConfig` 的任务、组与槽位（spec 的快照配置要求这些字段）；为 05 的测试另建手写的空世界（由真实创建得到的状态更不易失真）；把 `EntityRuleInputs` 移出实体表（实体是该形状的所有者，记录扩展它）。

**已知差异（由 11 写入 Core 文档与对照结论）：**

- 概率为 100 时原版仍掷一次（rand % 100），Core 不抽取；不填写的模板概率为源值 0 时同样不抽取（spec 随机数一节允许）。
- `SCCT` 僚机记录的缺省值（含随机 +0x78）在原版每次程序运行只填一次，Core 每个世界重新填写；其 +0x18 计数原版跨任务累计，Core 按世界。
- +0x80 非零的记录依赖战役简报前的抛硬币，内容契约不能表达（保留字），切片未用。
- 实例化后的扇区资源测试 `0x6a0b8`/`0x6a11c` 何时失败未确认，Core 视为总是通过。
- 原版姿态与活动半径的双精度中间运算在向零模式下逐步舍入，Core 按 JS 就近舍入后向零写回（Q-11 决定）；原版第一行 z 可为 −0。
- 依赖机型记录或其他规则的实例化初值与抽取（`0x3060c`、`0x68050`、+0xC8、`0x20990`、`0x38cd4`、+0x18 停放时刻、移动块与初速）未填，由 P3-06 至 P3-10 在 `instantiate` 注明的扩展点按 Q-07 次序加入；因此 Core 的 RNG 序列在这些规则接入前与原版的抽取次数不同（spec 不要求复现序列）。

**交接：**

- **P3-03：** 种类名文字为 CINF 机型记录 +4 的字符串，三份逻辑 Asset 均不含；Core 只交付 `{ type: 'craft-type', kindBit }`，需导入切片用到的种类位 0、7、8、14（及僚机 1、名单其余种类）的种类名。
- **P3-11：** `disableSpawning`、`pendingSpawns`、`placeWorldRecord`、事件列表中的 `object-instantiated`；原版主流程状态 1 不实例化（`0x339cc`）的门禁随其状态接入。
- **请求上限：** 一个世界一生最多投递 `spawnExpansion`（1024）个生成请求（空编组的请求也计 1），加上每个实体至多一个生命周期请求（2048）与命令结果（64），不超过 `eventsPerTick`（4096）；无需单独的请求上限。

**文档影响：** 本项写入范围只有 `src/core/**`；`docs/original/` 无新事实，U 项不变。建议 11 在 [Core 模块说明](../../../../engineering/modules/core.md) 写入：`createWorld`/`initialWorldState`（内部）、`RunConfig`/`EffectiveRunConfig`/`difficultyGroup`/`PRODUCTION_MISSION`、`checkSetup` 的拒绝清单、`setupHash`、`SpawnState`/`RuntimeRecord`/`GroupState`/`SpawnEntry`、`buildSpawnState`/`isScheduledRecord`、`fillRecordDefaults`/`unfilledRuleInputs`/`missionDefault`/`toInt32`、`assignName`、`checkSpawnQueue`/`dispatchSpawn` 与上述 P3-11 接口、实体的 `side`/`baseInteraction`/`ruleInputs`，以及上列已知差异；[源码结构指南](../../../../engineering/source-structure.md) 的 `core/world/`、`core/rules/`、`core/systems/` 职责。STATUS 与阶段索引无需修改。
