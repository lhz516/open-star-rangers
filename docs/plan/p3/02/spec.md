---
type: plan
status: accepted
phase: P3
task: "02"
updated: 2026-10-17
related: [ADR-0004, ADR-0006, ADR-0015, B-003, B-004, B-006, U-008, U-009, U-010, U-011, U-021, U-022, U-023]
---

# P3-02：Core 正式契约与任务实例化 — Spec

## 问题与目标

Core 目前只有两部分代码：P1 的合成场景、快照与 replay（[core/synthetic/](../../../engineering/source-structure.md#r1-合成-core)），以及 P2 的 [`loadMission`](../../../../src/core/mission/load-mission.ts)。`loadMission` 产出冻结的 `MissionSetup`，不推进 tick、不应用缺省值，也不推导生成时刻、顺序或位置。P3-04 至 P3-14 都要消费同一个正式 Core，但以下内容都还没有：

- 正式的实体身份与种类、输入与命令、领域事件、projection 与 Render State；
- 以原版时基（[R-01](../01/spec.md#规则对照目录)）为依据的 tick、时间单位与数值表示；
- 固定的系统流水线，以及各规则任务的接入位置；
- 由 `MissionSetup` 按原版调度与放置规则建立的运行世界（R-02），以及僚机门禁（R-03）；
- 带版本的正式快照、状态哈希与 replay。

如果由各规则任务分别补齐，就会出现多套时钟、并行的输入通道和不一致的确定性边界。[阶段索引](../tasks.md#5-实施顺序)因此要求正式契约先稳定并通过测试，规则与表现任务再消费。

完成后可观察到：

- 在 Node 中，由三份逻辑 Asset、内容身份与运行配置可以创建正式世界，逐 tick 调用 `step()` 得到带 tick 的领域事件。所选任务的玩家、敌机、基地、友方对象与所选僚机按原版的调度、放置与缺省规则出现；不选僚机时不生成僚机。这是 [L-02](../01/spec.md#闭环步骤) 的 Core 部分。
- 规则任务有确定的接入点：流水线阶段、实体初始化、游戏动作、领域事件与 projection 分区。改变共享契约时先修订本 spec，不由下游各自扩展。
- 同一内容身份、配置、种子与逐 tick 输入，在同一运行时 replay 后得到相同的事件流与周期性状态哈希。
- 实例化细节的原版研究写入 `docs/original/`；带任务身份的原版运行核对了生成时刻、放置支持集、缺省值与僚机门禁。

阶段范围依据[总计划 §12](../../master-plan.md#12-开发阶段与验收条件)，任务导航见[阶段索引](../tasks.md#p3-02-core-正式契约与任务实例化)。生成、审阅或批准本 spec 都不会自动启动实现。

## 范围

### 包含

- **S-01 正式契约与扩展规则：** 在 `core/` 中建立正式的实体、输入、命令、领域事件、projection 与 Render State 契约（[数据模型与契约](#数据模型与契约)），并规定下游任务在这些契约内增量扩展的规则（[扩展规则](#扩展规则)）。合成契约保留 synthetic 命名，正式模块不依赖它。
- **S-02 时间、数值与随机数：** 按[时间模型](#时间模型)、[数值表示](#数值表示)与[随机数](#随机数)实现 R-01 的 Core 部分，并确定 G-02 占位期间的时间计入。
- **S-03 运行配置与世界创建：** 按[运行配置与世界创建](#运行配置与世界创建)，由逻辑 Asset、内容身份与配置创建世界；切片未用到的路径在创建时明确拒绝。
- **S-04 输入与命令：** 按[输入与命令](#输入与命令)建立与设备无关的动作命令、连续操纵轴、逐 tick 校验与结果反馈。待处理命令队列归 Runtime；Core 不保存 DOS 按键缓冲。
- **S-05 实体与系统流水线：** 按[实体与生命周期](#实体与生命周期)与[系统流水线](#系统流水线)实现实体表、按种类遍历、本 tick 事件的显式传递、固定顺序的阶段与移除。
- **S-06 任务实例化（R-02）：** 按[任务实例化](#任务实例化)实现缺省值、排程、到期处理、编组成员与布局、放置服务与名称分配。
- **S-07 僚机门禁（R-03）：** 按[僚机](#僚机)实现选择、门禁、排程与放置。
- **S-08 正式快照、哈希与 replay：** 按[快照、哈希与 replay](#快照哈希与-replay) 实现带版本的快照、规范文本与哈希、录制、replay 与分歧定位。
- **S-09 原版研究与对照：** 完成[原版研究](#原版研究)的 Q-01 至 Q-11，按[对照方法与判据](#对照方法与判据)取得 R-01 至 R-03 的结论，新建 B-007 并更新受影响的 U 项。
- **S-10 文档：** 同步 [Core 模块说明](../../../engineering/modules/core.md)、[源码结构指南](../../../engineering/source-structure.md)与[工程约定](../../../engineering/README.md)中受影响的部分；若扩展了 `tools/baseline/` 或本地核对工具，同步其指南。

### 不包含

- 正式 Runtime 与 Session、应用流程、开始配置页、G-02 占位画面、暂停与隐藏、开发诊断，以及录制文件的下载或保存：P3-04。Core 的纯录制导出方法属于 S-08。
- 浏览器按键到游戏动作与轴的映射、U-011 的键位研究、按住状态的绑定、G-08 拦截：P3-05。
- 各规则系统：运动、速度操作、世界边界与玩家起飞初始状态（P3-06，R-04、R-05）；目标、武器、伤害、毁伤与爆炸（P3-07）；AI 与僚机行为（P3-08）；地图、迷雾与 Warp（P3-09）；通讯、停靠与补给（P3-10）；任务流程状态机、段 2 事件、结果、救援与重试（P3-11）。本任务交付这些系统的共同契约和接入位置，不用空处理器声称玩法已经实现。
- 规则数据与补充内容的导入（P3-03）；渲染、相机、HUD 与音效（P3-12 至 P3-14）。
- 存档、从快照恢复世界、旧格式迁移：P4。
- 跨引擎逐位一致；复现原版的随机序列。
- 内容契约已经拒绝的路径：+0x14 存活上限、+0x20 重复、+0x30 与 +0x4C 路径、段 4、段 2 生成对、SCEN 头 0x0C 的波次模式等（[scen.ts](../../../../src/original-data/formats/scen.ts)、[object-record.ts](../../../../src/original-data/formats/object-record.ts)）。其他任务与切片外内容归 P4。
- 修改 `loadMission`、内容契约、导入链或转换器版本。

### 涉及模块

| 模块 | 责任与影响 |
|---|---|
| `src/core/contracts/`、`world/`、`systems/`、`rules/`、`projections/`、`replay/`（计划新增，按需创建，不建空目录） | 正式契约；世界与实体表；流水线与生成系统；原版规则辅助（放置、缺省、名称、随机映射、数学）；projection；快照与 replay。落点见[源码结构指南](../../../engineering/source-structure.md#后续扩展方向) |
| [core/determinism/](../../../../src/core/determinism/) | 复用 RNG 与 FNV-1a，不改其契约 |
| [core/mission/load-mission.ts](../../../../src/core/mission/load-mission.ts) | 世界创建先复用它获得 `MissionSetup`，再进行正式世界的语义校验；不改既有 API |
| [core/synthetic/](../../../engineering/source-structure.md#r1-合成-core) | 行为与格式不变。若把通用校验 helper 移到中性的 Core 模块，合成模块改为从那里导入，测试不改 |
| [core/errors.ts](../../../../src/core/errors.ts) | 复用 `CoreInputError`；计划新增一个与之可区分的内部故障错误 |
| [content/](../../../../src/content/) | 只读消费 `ContentIdentity`、`AssetId` 与逻辑内容类型，不改 |
| [tools/engineering-boundaries.test.ts](../../../../tools/engineering-boundaries.test.ts) 或 ESLint 配置 | 计划新增：正式模块与合成模块互不依赖的边界检查 |
| [tools/baseline/](../../../../tools/baseline/) | 原版运行时核对；能力不足时按其既有契约增量扩展，并补合成测试 |
| [executable](../../../original/formats/executable.md)、[scenario](../../../original/formats/scenario.md)、[unknowns](../../../original/unknowns.md)、`docs/original/behavior/B-007-mission-instantiation.md`（计划新增） | Q-01 至 Q-11 的事实；U-009、U-022、U-023 的更新；运行时对照的方法与结论 |
| [engineering/modules/core.md](../../../engineering/modules/core.md)、[source-structure.md](../../../engineering/source-structure.md)、[engineering/README.md](../../../engineering/README.md) | 正式 Core 的 API、目录与约定 |
| `local/research/p3-02/`（git 忽略） | 研究脚本、配方、私有运行目录与真实内容核对的输出 |

## 当前实现与依据

- **任务载入：** `loadMission` 读取 `mission`、`craftTypes` 与 `wingmanRoster` 三份逻辑 Asset，产出 `MissionSetup`：声明、编组、生成矩形、名称池、地图框架、玩家声明的索引与僚机选项（[Core 模块说明](../../../engineering/modules/core.md#core-任务载入)、[P2-09 Core 载入结果](../../p2/09/spec.md#core-载入结果)）。
  - 坐标为参考单位，编组布局为原版运行时单位。
  - `RuleInputs` 按来源原样保留 +0x0C、+0x10、+0x60–+0x68 与 +0x70–+0x78，0 记为 null（[logic-content.ts](../../../../src/content/logic/logic-content.ts)）。
  - 导入层已以 `unsupported` 拒绝多种路径（见[不包含](#不包含)）。
  - `MissionSetup` 不含原始难度、本次的僚机选择，也不含任何运行状态（[P3-01 切片配置](../01/spec.md#切片配置)）。
- **合成骨架：** 以下做法可以借鉴，但不是正式格式（[ADR-0015](../../../decisions/ADR-0015-source-module-structure.md)）：
  - [synthetic-scene.ts](../../../engineering/source-structure.md#r1-合成-core)：先校验整个 tick 输入再改状态，返回冻结的事件；projection 与 Render State 是脱离内部状态的冻结数据。
  - [synthetic-snapshot.ts](../../../engineering/source-structure.md#r1-合成-core) 与 [synthetic-replay.ts](../../../engineering/source-structure.md#r1-合成-core)：规范文本、FNV-1a 哈希、检查点与 replay 比较。
  - [app/runtime/](../../../../src/app/runtime/) 的固定步长与两帧 Render State 将由 P3-04 改为消费正式 Core。
- **原版时基与主循环（R-01）：** [executable 时基](../../../original/formats/executable.md#simulation-time-base-p3-0106)记录已确认的计时来源、单位、每帧可变步长与主循环顺序；[B-006](../../../original/behavior/B-006-simulation-timing.md)记录运行时交叉核对及 cycles 依赖，U-021 未关闭。它们不是“原版按固定 32 Hz 模拟”的证据。
- **调度、放置与别名（R-02）：** [放置与调度](../../../original/formats/executable.md#mission-placement-scheduling-and-world-grid)、[scenario §3](../../../original/formats/scenario.md#3-132-byte-object-record-structure-confirmed-fields-partly-likely)与[段 5 成员](../../../original/formats/scenario.md#section-5-member-records-confirmed-access)是原版事实的权威记录；结构/访问已确认，部分字段含义仍为高概率（U-022）。下方任务表只选择实现范围，不另建事实清单。
- **所选任务的数据：** [切片字段清单](../../../original/formats/scenario.md#selected-mission-field-inventory-confirmed-structure)和[生成总数](../../../original/formats/executable.md#mission-result-success-path-and-campaign-restart-p3-0104)已确认支持的路径、编组别名与对象数，AC-13 用它们独立核对，不从实现结果倒推期望。
- **难度与僚机（R-03）：** [难度读取路径](../../../original/formats/scenario.md#difficulty-readers-p3-01)与 [scenario §4](../../../original/formats/scenario.md#4-scct-campaign-table-confirmed-structure-likely-meaning)区分原始难度、组和僚机选择。选择值/调度访问已确认，完整生成门禁仍为高概率（U-023）；[P3-01 交接](../01/subtasks/12-catalog-handoff.md#完成证据)要求带与不带僚机的运行核对。
- **视角、上下文与延时：** [自动视角](../../../original/formats/executable.md#automatic-views-and-cameras-p3-0109)、[衔接](../../../original/formats/executable.md#cut-scenes-and-loop-transitions-p3-0108)、[任务失败](../../../original/formats/executable.md#mission-failure-player-loss-and-rescue-p3-0105)给出已确认的入口和状态写入者；未核实的动作效果仍归相应规则任务，不由键码或视角值猜测。
- **数值（U-009）：** [时基](../../../original/formats/executable.md#simulation-time-base-p3-0106)、[scenario](../../../original/formats/scenario.md)、[渲染库线索](../../../original/formats/executable.md#2-linked-libraries-confirmed-unless-noted)提供已确认的存储类型与局部浮点/定点证据。整个模拟是否查表并未确认，Q-03/Q-11 必须按实际使用路径核实。
- **过场时间：** 计时与跳过语义见[过场与模拟时间](../../../original/formats/executable.md#cut-scenes-and-loop-transitions-p3-0108)（代码已确认）。关闭过场可消除媒体播放用时；按键跳过只缩短已播放的时间，不保证严格为零。P3-01/08 建议占位期间 Core 不推进，结束后也不补计时间（[08 的完成证据](../01/subtasks/08-transition-media.md#完成证据)）；这仍需与原版构建用时及首帧取样区分。
- **证据途径：** 只读 Ghidra（`-noanalysis -readOnly`）、本地数据与 [tools/baseline/](../../../../tools/baseline/)。本机 Computer Use 无法向 DOSBox-X 送达按键，也无法移动游戏内光标；需要进入任务的原版运行由用户操作游戏、agent 运行工具（[运行时测量指南](../../../guides/runtime-measurement.md)、[原版证据获取](../../../guides/original-evidence.md#agent-运行原版)）。

## 行为与边界

| 场景或状态转换 | 预期结果 | 拒绝或失败时的反馈 |
|---|---|---|
| 以合法输入创建世界 | tick 0，时钟 0，没有实体，生成队列已就绪，视角模式 0xC，任务状态为“已构建” | 不适用 |
| 输入或配置不合法、难度与任务组不符、出现切片外路径 | 不创建世界 | 读取器的 `ContentContractError` 或正式创建的 `CoreInputError`，带结构路径与稳定原因 |
| 以合法 tick 输入调用 `step()` | 按流水线推进一个 tick，返回本 tick 的领域事件 | 不适用 |
| tick 输入不合法 | 世界与状态哈希都不变 | `CoreInputError` |
| 合法动作尚未实现，或被当前游戏状态拒绝 | 该命令不改变状态；其他命令和本 tick 正常处理 | 返回带 `commandIndex` 的 `command-result`，不静默吞掉 |
| 生成时刻为 0 的对象 | 在第一个 tick 实例化 | 不适用 |
| 锚定对象尚不存在 | 按全世界缺省放置（原版行为） | 不适用 |
| 生成开关被清除 | 之后不再处理生成队列 | 不适用 |
| 内部不变量被破坏或执行中耗尽预算 | 世界进入故障状态；不返回部分事件，之后的 step/projection/renderState/snapshot 都拒绝；不把半更新状态发布给消费者 | 与 `CoreInputError` 可区分的内部故障错误，P3-04 锁存并停止该运行 |
| replay 的内容身份不符，或记录不合法、超过上限 | 不执行 | `CoreInputError` |
| replay 结果与期望不同 | 报告第一个分歧的 tick 与类别 | 比较结果 |
| 重试 | 以同一内容与配置新建世界，不继承旧世界的任何状态 | 不适用 |

### 时间模型

- **任务时钟：** 非负安全整数，单位为原版时钟单位 1/64 秒。创建世界相当于原版构建任务：时钟为 0，同时也是生成队列的原点。
- **每 tick 的推进：** `clockUnitsPerTick` 为正的偶数安全整数，默认 2，在世界存续期间不变。每次成功的 `step()` 恰好推进一次：tick 加 1，时钟加 `clockUnitsPerTick`，本 tick 的步长为该值 ÷ 64 秒。加法及有关乘法在改状态前检查安全整数范围；超界以 `CoreInputError` 拒绝且状态不变。不设缺少依据的 8 单位上限；默认值以外的配置用于 Node 校准测试，不自动成为已验证的生产配置。
- **名义速率：** 64 个单位为 1 秒，默认每秒 32 个 tick；Runtime 按宿主单调时钟以此速率调度（P3-04）。原版时钟相对模拟器时间偏慢且依赖 cycles（B-006），Core 不模拟这一点。
- **单位约定：** 持续时间以时钟单位整数或秒存储，速率以“每秒”存储。规则由本 tick 的步长求出每 tick 的量，不硬编码 tick 数或 32 Hz。
- **到期：** 原版的“取样超过到期时刻的第一帧”对应“时钟超过到期时刻的第一个 tick”。生成队列按此规则判定（经过时间 > 生成时刻）。其他延时如何比较、如何重新计时（原版按生效时的取样重新计时，不追赶），由负责任务依证据决定。
- **暂停与占位：** Core 不提供在 `step()` 之外推进或补计时间的接口。Runtime 暂停、页面隐藏、暂停式选项页与 G-02 媒体占位期间不调用 `step()`，结束后也不补计时间（[技术决定](#技术决定) 2）。战略地图、通讯菜单、基地内修理、停靠倒计时、救援前的引擎内过程和结果延时不是这类暂停；即使 P3 用 React 显示基地内部，也继续模拟。G-02 的自然结束与跳过只完成同一条衔接一次，不能跳过这些规则等待或瞬间补满资源。
- **与原版的关系：** 32 Hz 是项目固定步长选择，不是原版的模拟频率或已通过的保真结论。原版每帧可取 0、2、4 或更大的时钟增量；平均帧率超过 32 也不能排除单帧延迟。零步长帧仍执行行为，删去它们不证明规则等价。R-01 在本任务验证单位和固定步长契约；R-02/R-03 验证实例化规则。依赖帧次数或步长的其他规则仍须在各自任务按 B-006 对照，不能用本 spec 批准豁免。
- **绝对取样值：** 原版计数器从随机值起算。依赖绝对取样值的规则（例如星云起点为构建时的取样 mod 15，见[数据闭包](../../../original/formats/executable.md#data-loaded-by-the-loop-p3-0110)）无法由 Core 时钟原点 0 重现，由负责任务显式建模。

### 数值表示

- **连续量：** 对外用有限的 JS number 表示。它是数据容器，不等于已经决定原版计算全部采用双精度。Q-03、Q-11 须在落地实例化数学之前核实存储类型、转换与舍入边界；已确认的 f32 写回、i32 截断或定点操作在对应边界独立重实现，不统一用双精度略过。只有渲染器使用定点数的证据，不能证明其余路径一律没有定点数。
- **离散量：** 时钟、计数、ID、种类位与掩码为整数，掩码运算在 uint32 范围内进行。
- **超越函数：** 本任务实际用到的三角函数或开方由 Q-11 定向核实；确认原版查表或定点时遵循[总计划 §5](../../master-plan.md#5-状态管理与通信约定)，不能延后到已消费错误初值的下游。只用于运动、制导的额外路径仍归 P3-06/P3-07。helper 只在出现真实复用时提取，不预建空数学层。
- **单位：** 世界内部使用原版运行时单位。Q-03 按声明的 `origins` 区分换算对象：有 `object` 来源的记录只换算一次，即使同时被编组引用；仅从段 5 可达的记录保留原版未缩放语义；SCCT 僚机记录的处理也须单独核实。生成矩形与地图框架按各自来源换算，编组布局偏移已由内容层处理，不再缩放或交换轴。世界矩形由已核验的 mapFrame/比例关系获得，不能把通用 `loadMission` 接受的任意旋转地图框架当作本切片的世界坐标。
- **确定性边界：** 在同一代码版本与同一 JS 运行时内可复现，不承诺跨引擎逐位一致（[总计划 §5](../../master-plan.md#5-状态管理与通信约定)）。

### 随机数

- 影响规则的随机数只来自世界自有的带种子生成器，复用 [rng.ts](../../../../src/core/determinism/rng.ts)。生成器状态属于世界状态，进入快照与哈希；各系统在流水线的固定位置按固定顺序抽取。
- 种子为调用者提供的 uint32，Core 不自行产生种子。
- 原版随机映射（C 库 `rand()` 的取值范围，以及取模或缩放方式）按 Q-02、Q-04、Q-05 的代码证据实现为等价的支持集与分布，包括取值上限对支持集的限制。不复现原版序列，也不导入原版运行中的随机输出（[P3-01 对照方式](../01/spec.md#对照方式与判定)）。
- 原版中结果必然相同的抽取（例如概率为 100 时的掷骰），不要求 Core 同样抽取。
- 纯表现的随机（粒子、音效变体等）不消耗世界的随机序列。同一选择若同时影响规则与表现，由负责任务决定在 Core 中只抽取一次。

### 运行配置与世界创建

| 输入 | 约束 | 违反时 |
|---|---|---|
| 逻辑内容 | `loadMission` 所需的三份逻辑 Asset，由它校验 | 原样传递 `ContentContractError` 或 `CoreInputError` |
| 内容身份 | 用 `readContentIdentity` 校验完整结构；实际来源与 payload/manifest 绑定由 Core 外的 `validatePackage` 保证；Core 另计算 `setupHash` 绑定本次读取的初始数据，见 replay | 身份结构错误保留 `ContentContractError`；跨输入不一致为 `CoreInputError` |
| 原始难度 | 0–100 的整数，导出的组须等于 `campaign.group`；`original-import` 进一步限于 P3-01 的难度 19、group 0/slot 1 与唯一生产任务 Asset。其他值只用于明确标为 `synthetic` 的契约测试，不宣称支持其他关卡 | `CoreInputError` |
| 僚机 | `null`，或 `wingmanOptions` 的索引；原版选择值 = 索引 + 1 | `CoreInputError` |
| 种子 | uint32 | `CoreInputError` |
| `clockUnitsPerTick` | 可省略；正偶数安全整数，默认 2；`original-import` 的生产入口只使用默认值 | `CoreInputError` |

- **组与任务号：** 任务号取 `campaign.slot`（原版钳制后的槽位），供缺省值使用。组与原始难度进入世界状态，供依赖组的规则读取。
- **创建结果：** tick 0，时钟 0，视角模式 0xC，任务状态为“已构建”（对应原版状态字节 1），没有实体。生成队列已按 Q-01 排好；只完成 Q-04 证实属于构建期的缺省与随机抽取，实例期工作留在生成阶段，不能把每实例抽取提前成每声明一次。创建不返回事件，时刻为 0 的项在首个 tick 实例化。项目首个 tick 与原版首轮检查的计时差别按 R-02 分开核对。
- **语义校验：** `loadMission` 只证明它自己的内容与跨 Asset 契约；正式创建还须核对玩家是种类位 0、僚机是位 1，模型/阵营/交互类别符合已支持的机型绑定，坐标比例有限且可换算，地图轴与世界矩形符合本切片，所有成员、锚点、名称与计数可在实现预算内处理。不能仅由 `side: 'player'` 推断原版种类 1 的特殊逻辑。
- **切片外路径：** 内容契约能表达、但切片没有使用、本任务也不实现的取值，在创建时以 `CoreInputError` 拒绝，不建世界。包括：网格放置（`gridSpacing` 非零）；非空且不为 100 的生成概率；掩码 `0x87c` 内的固定高度种类；乘以 64 后超出 uint32 的生成时刻；以及 Q-01 至 Q-07 发现的其他未实现分支。拒绝原因稳定、可测试，P3-04 据此提示“任务不能载入”。
- **零值边界：** P2 导入把 `RuleInputs` 的来源零值记为 null，但其通用读取器也接受显式数值 0；正式世界要求这一组来源字段使用规范表示，显式 0 在创建时拒绝而不是猜成“概率为零”或“已关闭”。该要求不适用于时刻/位置等本来允许零的字段，也不适用于段 5 `spawnCount`（其零值不套用记录 +0x10 的缺省）。
- **纯函数：** 相同输入得到深度相等的初始快照。世界之间不共享可变状态；重试就是以同一内容与配置新建世界（L-10），种子由 P3-04 选择。
- **预算与错误：** 创建前以安全整数运算展开请求数 × 成员数，检查实体、排程项、单 tick 工作量和 ID 预算；超出支持范围明确拒绝，不进入巨量循环。`CoreLimits` 是实现公开的有限常量，取值须附支持切片最大规模与内存预算的依据，测试精确覆盖 limit/limit+1；不是原版玩法上限。原版分配失败若可达，由 Q-08 单独定类，不能自动等同项目故障。错误只含稳定原因和结构路径，不回显导入名称、坐标或 payload。

### 输入与命令

每个 tick 的输入为 `{ axes, commands }`。它是与输入设备无关的游戏动作，不含 DOS 扫描码、`KeyboardEvent` 或物理按键名；待处理命令队列只归 Runtime（[ADR-0006](../../../decisions/ADR-0006-core-returns-events.md)）。

| 部分 | 形状 | 语义 |
|---|---|---|
| `axes` | `pitch`、`yaw`、`roll`，各为 [−1, 1] 内的有限数 | 项目动作正方向分别为抬头、机头右转、从驾驶员向前看顺时针滚转；映射到原版数学轴由 Q-11/P3-06 核实，浏览器绑定由 P3-05 核实。不支持的直接操纵保持 0；这里不添加横移或鼠标飞行 |
| `commands` | 无稀疏项的有序 `Command[]`，每项是封闭的判别联合 | 依数组顺序在该 tick 处理一次，不在 Core 排队等 DOS 轮询周期；具体规则仍校验当前模式、冷却与目标 |

动作族的共享契约如下；类型与校验在本任务交付，效果由列出的规则任务接入。参数不是可选字段的大杂烩；每个变体只允许自己的字段。

| 命令形状 | 责任与边界 |
|---|---|
| `{ type: 'fire', channel: 'primary' 或 'secondary' }` | P3-07：一次本 tick 的开火请求；按住时 P3-04/P3-05 依据已采样的按住状态每 tick 产生请求，短按在两次采样间也保留一次。不用 OS 自动重复决定射速，不在 Core 留下永久按住标志 |
| `{ type: 'speed', operation: 'increase'、'decrease'、'zero'、'maximum'、'match-target' 或 'toggle-auto-match' }` | P3-06；具体档位/速率不由本契约猜定 |
| `{ type: 'select-number', value: 1–9 的整数 }`；`{ type: 'navigate-selection', direction: 'previous' 或 'next' }`；`{ type: 'confirm-selection' }` | Core 按通讯、基地或飞行上下文解释，例如菜单项、基地选择、速度档位、匹配速度。UI 不复制菜单状态机，也不改成裸键码 |
| `{ type: 'target', operation: 'enemy'、'friendly'、'next'、'previous' 或 'forward' }` | P3-07；候选与前方判定由 Core 提供 |
| `{ type: 'cycle-main-weapon' }`；`{ type: 'select-missile', direction: 'previous' 或 'next' }` | P3-07 |
| `{ type: 'toggle-map' }`；`{ type: 'map-point', operation: 'hover' 或 'select', right, down }`；`{ type: 'request-warp' }` | P3-09；right/down 为主地图内 [0,1] 的有限归一化位置，左上为 (0,0)。Core 按逻辑地图框架换算，z 与图标命中由 Core 选定；输入不携带未经验证的世界目的地或渲染像素 |
| `{ type: 'communications', operation: 'open' 或 'close' }`；`{ type: 'launch' }` | P3-10；基地请求、僚机攻击/忽略/掩护/交战/返航/移动/状态查询均通过当前菜单的 `select-number`/`confirm-selection` 进入，由 P3-10 向 P3-08 的规则传递，不另开 UI 写入口 |
| `{ type: 'energy', operation: 'open'、'shield-increase'、'shield-decrease'、'gun-increase' 或 'gun-decrease' }`；`{ type: 'damage-report' }` | P3-07；资源分配与显示模式仍为 Core 状态 |
| `{ type: 'cockpit-front' }` | P3-12/P3-13 消费；是否能离开自动被毁视角按原版门禁由负责规则处理，不能以 G-08 禁掉 F1 |

- **校验：** 在任何状态变化之前读取、校验并复制整份输入。字段缺失或多余、NaN/Infinity、类型/范围错误、稀疏命令、未知变体或超出命令预算均抛出 `CoreInputError`；世界和录制不变。−0 规范化为 0。
- **反馈：** 每个结构合法的命令恰有一个 `command-result`：`{ type, tick, commandIndex, commandType, outcome, reason }`；outcome 为 `accepted`、`rejected` 或 `ignored`，accepted 的 reason 为 null，另外两类使用稳定的封闭原因码。尚无规则处理器时必须 rejected/`not-implemented`，不能当作成功或原版的无操作；此开发阶段反馈不表示已实现玩法。原版允许的无操作、冷却或上下文屏蔽在各规则接入后使用对应 ignored/rejected 原因，是否呈现文字/音效另由该规则决定。结果与领域事件同属 `step()` 返回列表，不依赖 UI 先行更新。
- **顺序与控制：** Runtime 在调用 step 前完成待执行批次；订阅者新提交的意图进入下一 tick。暂停、继续、退出、返回菜单与 G-08 拦截不作为游戏命令。上下文切换后的后续命令按新状态判定；地图开启时 Core 防御性屏蔽飞行操纵和飞行命令，不因适配层漏清键而生效。相关门禁效果归 P3-09。
- **清输入：** 暂停、隐藏、失焦、退出 Pointer Lock 与 G-02 衔接时，P3-04/P3-05 清除外部按住状态与未执行队列；恢复后只采纳新按下。Core 没有待执行按键缓存，因而不会在恢复后重放旧输入。已经被规则接受的持续动作（自动匹配、Warp 等）是游戏状态，不随清键错误重置。
- **研究边界：** Q-10 核实动作的读取/重复/门禁语义并交给输入和规则任务，DOS 码空间与缓冲容量不是正式 Core 的公共 API。若研究证明上述动作形状不足，先修订本 spec；不自行换回原版键码队列。自动驾驶是否进入 P3 仍由 P3-06 决定，当前未加入命令联合。

### 实体与生命周期

- **身份：** 实体 ID 是从 1 起按创建顺序分配的正安全整数，在同一世界内不复用。事件、消息与引用都只记 ID。
- **种类：** `kindBit` 用原版运行时种类的位号 0–31 表示，与内容中的 `craftType` 一致；掩码是单独的 uint32 位集合，文档的“种类 2”是掩码 2、位号 1，不能混用。弹丸、导弹、爆炸、碎片与地图标记的种类/表现选择器按[分配来源](../../../original/formats/executable.md#remaining-direct-allocator-input-inventory)登记，尚未实现的种类没有构造入口。不把模型 Asset ID、机型槽位和非模型实体的表现选择器合成一个编号。种类在分配时固定。
- **按种类遍历：** 实体表为每个种类位维护一张有序表。按掩码遍历时，种类之间的次序与同一种类内的次序遵循原版分配器 `0x520d4` 与遍历器 `0x5261c` 的语义（Q-08）。目标选择、AI 等依赖遍历次序的规则只能使用这一接口。
- **P3-02 拥有的字段：**
  - ID 与种类；
  - 来源：带命名空间的声明引用 `{ collection: 'mission' 或 'wingman', index }`；编组实例另记编组索引、该编组第几次请求与成员位置；运行中创建的实体为空。同一成员声明重复出现时不合并成一个实体；
  - 名称引用；
  - 来自已校验声明的阵营、模型 Asset ID 与交互种类标志；无模型的运行时种类使用明确的表现判别联合；
  - 位置（运行时单位）；
  - 姿态：3×3 矩阵，按行存储；Q-07/Q-11 须先确认初始姿态、基向量约定及有限精度误差，不能在手性未定时输出猜测的单位矩阵。连续转动属于 P3-06；
  - 由缺省值得到的运行时规则输入，对应原版 +0xDC/+0xE0/+0xE4 与 +0x60–+0x68 的初值；
  - 放置序号：每次非连续移动时加 1，供渲染器跳过插值；
  - 对象状态与活动（见生命周期）。

  速度、伤害、能量、AI 等字段，由负责任务在实体初始化扩展点加入。
- **初值：** 实例化时写入、且不依赖机型记录的初值，由本任务实现：位置、姿态、规则输入，以及 Q-07 确认的其他字段。依赖机型记录（CINF，由 P3-03 导入）的初值，由 P3-06、P3-07 在实体初始化扩展点补上。玩家的起飞初始状态归 P3-06（R-05）。未经研究的字段不填猜测值。
- **生命周期（按 Q-08，见[对象表](../../../original/formats/executable.md#runtime-object-table-p3-0201)）：** 实体有原版的对象状态与活动两个字段。
  - 状态：新建、表现就绪、等待表现、被毁源（不再更新但仍移动）、活动区域切换、待移除、活动、已命中弹丸。活动：停放（活动区域外）、活动、已停靠。新实体为新建；非玩家实体是否在实例化时停放按 Q-07。
  - 表现：Core 没有渲染器的完成回调。项目选择视为实例化时表现已就绪（原版的就绪路径）：实体在实例化后的下一次自身更新进入活动，此后才参与运动与碰撞。原版等待异步载入（等待表现）的时长未追踪，作为差异披露。
  - 新建经表现就绪到活动的通用转换与移除由本任务实现；被毁、区域切换、命中等状态由负责规则写入。
  - 移除：待移除（或区域切换）的实体在下一次自身更新时提出移除请求，在同一 tick 的请求处理中移除（区域切换则改为停放或恢复活动）。因此在其更新之前标记的于同一 tick 移除，在请求处理中或之后标记的于下一 tick 移除，期间仍在种类表中；查询按状态与被毁标志筛选，不能仅由“仍在表里”推断存活。被毁不等于移除（玩家救援会复用玩家对象，见[任务失败](../../../original/formats/executable.md#mission-failure-player-loss-and-rescue-p3-0105)）。
  - 移除时从种类表摘除并清除玩家实体引用；其他持有者的引用失效（按 ID 查不到），不按引用方遍历。生成计数不减少（计的是生成次数）；名称占用按 Q-05。历史事件或统计可以保留旧 ID，但不能把它解析为新实体。
  - 停放实体的停放更新（含离开世界）与活动区域检查由负责任务实现（见系统流水线）。
- **玩家状态：** 世界记录玩家实体（尚未实例化时为空）、视角模式、上一视角模式与子模式。创建世界与实例化玩家都把视角模式设为 0xC（已确认）；其他写入者归各规则任务。
- **声明与实例分离：** 初始 `MissionSetup` 永远只读。缺省后的记录、名称占用、每个声明/编组的生成计数及其当前对象关联是世界私有状态，统一保留别名关系并进入快照。模板覆盖不能回写输入 Asset；同一成员出现多次、查询尚未生成的锚点、对象移除后的计数，都必须按 Q-01/Q-02/Q-04/Q-07 明确语义。

### 系统流水线

下表按 Q-09 的已确认结论（[帧流水线](../../../original/formats/executable.md#frame-pipeline-p3-0201)）固定主循环与派发器的阶段，并列出规则接入责任；新的原版证据与下表冲突时，先修订本 spec。事件的 tick 号始终是本次 step 的编号；任务流程读取前一采样时间，后续阶段读取新采样时间。

| # | 阶段 | 原版对应 | P3-02 实现 | 接入的负责任务 |
|---|---|---|---|---|
| 1 | 输入登记 | 项目边界，不声称是 DOS 缓冲 | 校验整批命令及预算，确定本次 tick 编号，保存本 tick 输入副本，不留跨 tick 队列 | P3-02 |
| 2 | 任务流程 | `0x3266c`：每帧第一步，读取的是上一帧的取样 | 阶段位置与任务状态字段 | P3-11（流程、结果、救援）、P3-10（停靠子状态） |
| 3 | 时钟 | `0x25894` | 推进时钟，给出本 tick 的步长 | P3-02 |
| 4 | 对象更新与动作意图 | `0x20938`：按种类位升序、同种类按分配次序的实时遍历，玩家（位 0）最先；本遍中在更高种类位新分配的实体在同一遍中更新 | 实时种类遍历与通用状态转换；命令按数组顺序在玩家更新中判定，本任务对未实现动作返回结果 | P3-06、P3-07、P3-08、P3-09、P3-10 |
| 5 | 派发器规则阶段 | `0x20d10`：先把到期的通讯回复转为表现项（`0x2cd60`）；生成队列检查只产生生成请求；随后按投递次序处理任务流程、对象更新与生成的请求以及处理中新产生的请求（实例化与移除都在此）；之后依次各运行一次运动与碰撞、延迟的玩家爆炸、能量、重建两个对象集合（`0x2ede0`，未分析）、停放对象更新（含离开世界）、Warp 完成、基地内部、状态 0 的退场、活动区域检查 | 生成队列检查、请求处理（实例化与移除）与其后系统的固定次序；不复制通用 DOS dispatcher | P3-02（生成、实例化、移除）；P3-06（运动、停放更新与活动区域检查）、P3-07（碰撞、伤害、能量、爆炸）、P3-09（Warp 完成）、P3-10（通讯回复、停靠、基地内部）、P3-11（任务流程与退场）；对象集合重建暂无负责阶段，由需要它的阶段先分析 |
| 6 | 帧尾规则推进 | 原版帧渲染中有规则推进，例如 `0x50508` | 预留有证据的时序位置；规则必须移入 Core，不等待实际渲染帧 | P3-09；P3-12 只消费结果 |
| 7 | 提交输出 | 项目边界；原版没有帧尾移除，请求处理之后提出的请求不被处理 | 丢弃未处理的请求，提交本 tick 事件 | P3-02 |

- 代码中只有这一张有序的阶段表。系统只在自己的阶段运行，Core 内不注册回调，也没有订阅。
- **同一 tick 的连锁：** 碰撞、伤害、毁伤、任务触发通过固定次序的系统与本 tick 类型化事件列表显式传递，不建通用发布/订阅或持久消息总线；与原版每帧开头清空的派发器消息列表一样，本 tick 的请求列表不跨 tick 保留。每个消费者只处理约定阶段已产生的事件，不重复消费。未来确需跨 tick 的延迟时保存该规则的具名计时状态，不将 Runtime 命令搬入 Core。内部中间记录与对外 DomainEvent 分开，后者有完整快照。
- **实体初始化扩展点：** 它是 Core 内部静态调用顺序，不是注入外部回调的 API。请求处理中实例化的实体在本 tick 不更新，也不参与之后的运动与碰撞（状态为新建）；第一次更新在下一 tick（Q-09）。不得为了测试流水线向生产入口注入可任意改世界的处理器。
- **阶段内的顺序：** 本任务须交付 Q-09 支持的子阶段顺序及事件产生/消费关系，不能只留下全是空函数的阶段表。尚无规则的阶段以文档列出责任，不写假系统。后续改变已确定的顺序或事件可见时机，须修订本 spec。

### 任务实例化

| 路径 | 原版依据 | 切片使用 | P3-02 处理 |
|---|---|---|---|
| 直接排程段 1 记录（种类非零、无成员回指） | `0x6721c`，已确认 | 4 条 | 实现 |
| 按模板时刻排程段 5 编组 | `0x6721c`，已确认 | 3 个 | 实现 |
| 僚机排程 | 见[僚机](#僚机) | 5 项或无 | 实现 |
| 到期判定：经过时间 > 生成时刻，生成时刻 = 秒 × 64 | `0x67018`，已确认 | 全部 | 实现 |
| 生成概率：+0x0C；+0x80 为 0 时掷 0–99 | 高概率 | 全为缺省值 100 | 为空或 100 时必然生成；其他取值在创建时拒绝 |
| 每次到期的请求数：段 1 用 +0x10（缺省 1），段 5 用 +0 | 高概率 | 3 条记录、3 个编组非零 | 实现 |
| 段 5 成员与布局：成员 i 用偏移 i mod 布局数，余数为 0 时重算锚点；模板 +0x58/+0x5C 复制到成员 | `0x67678`，访问已确认 | 3 个编组、2 组布局 | 实现；复制条件按 Q-02 |
| 放置：锚点（+0x48）；锚定对象不存在时改用全世界缺省 | `0x68708`，已确认 | 1 条记录与僚机 | 实现 |
| 放置：矩形内均匀分布（+0x44） | `0x6883c`，已确认 | 5 条 | 实现 |
| 放置：全世界缺省 | `0x68c98`，已确认 | 锚点缺失时 | 实现 |
| 放置：存储位置 | `0x68398`，已确认 | 开局不用；救援用它放置玩家（P3-11） | 作为放置服务的一部分实现 |
| 放置：网格（+0x40） | `0x685e0`，已确认 | 无 | 创建时拒绝 |
| 放置：固定高度（掩码 `0x87c`） | 已确认 | 无此类种类 | 创建时拒绝 |
| 放置结果与世界矩形的比较 | 比较本身已确认 | 全部 | 实现；具体处理按 Q-02 |
| 缺省值：+0x0C、+0x10、+0x60–+0x68、+0x70–+0x78 | `0x6744c`，逻辑已确认，含义高概率 | 多条 | 实现；填写时机与随机映射按 Q-04 |
| 名称分配 | `0x67d44`，访问已确认 | 1 张候选列表与段 0 名称池 | 实现；规则按 Q-05 |
| 实例化：种类、规则输入副本、玩家视角模式、生成计数、对象事件“已实例化” | `0x67938`，部分已确认 | 全部 | 实现；范围按 Q-07 |
| 生成开关：任务结束时清除，之后不再处理队列 | 已确认 | 结束时 | 实现开关与查询；清除由 P3-11 调用 |

- **领域事件：** 每个实例化的对象产生一个 `object-instantiated` 事件：`{ type, tick, entityId, kindBit, source, position }`；source 使用带命名空间的声明及可空编组信息，position 是脱离世界的运行时单位快照。事件和整个返回数组深度冻结，按实例化顺序排列，不携带原版名称或对象引用。
- **供其他规则使用的接口：**
  - 查询生成队列中的待生成项及其来源声明：P3-11 的全清判定要求没有待生成的敌方类对象（[任务结果](../../../original/formats/executable.md#mission-result-success-path-and-campaign-restart-p3-0104)）；
  - 实例化通知：用于 P3-11 的段 2 触发计数；
  - 放置服务：用于 P3-11 的救援放置。
- **名称：** 使用封闭联合：`none`、`candidate`（声明引用和候选索引）、`pool`（名称池索引）、`craft-type`（种类位）。无名称是原版明确分支，不是资源缺失的回退。分配规则与占用/释放由 Q-05 确定；本任务产出名称引用，候选/池文字可从 setup 解析。种类文字若不在现有三份逻辑 Asset 中，本任务只交付结构引用并明确未就绪；所需导入必须交 P3-03，不硬编码或默默显示空白，也不声称已经完成全部 HUD 文本。
- **所选任务的期望：** 玩家 1 个；敌方类 16 个，其中开局 10 个、延迟来源 6 个；种类 `0x20000` 4 个；其余对象按数据与 Q-01 至 Q-07 推出。本地真实内容核对按此判定。

### 僚机

- 配置为 `null` 时，整个运行中都不生成僚机对象。原版选择值 0 会跳过僚机排程（已确认）。
- 配置为索引 i 时，按原版门禁排程名单第 i 项。门禁为“任务含种类 1 的玩家记录时生成”（高概率，U-023）；`loadMission` 已保证恰有一个玩家声明。生成时刻、放置（种类 2 的锚点缺省为玩家记录，高概率）、缺省值与名称，按 Q-06 与其他实例化规则。
- 运行配置中的僚机选择进入世界状态与 projection，供 P3-04、P3-11 选择出发与返航占位的变体。
- 僚机的行为、编队与通讯命令归 P3-08、P3-10。

### Projection 与 Render State

- **projection：** 返回深度冻结、与内部状态脱离的纯数据，按分区组织。本任务提供三个分区：
  - `clock`：tick、时钟单位、每 tick 的单位数；
  - `mission`：任务 Asset、组、槽位、原始难度、僚机选择、任务状态；
  - `player`：玩家实体 ID（生成前为 null）、视角模式、上一视角模式、子模式、Core 判定的交互上下文；不返回可变实体引用。

  本任务同时规定 HUD、地图与 React 消费者的分区边界，避免各自读取全世界或自行加字段：`flight`（速度、资源、目标与武器，P3-06/07），`map`（框架、经可见性筛选的接触点、迷雾与目的地，P3-09），`communications`（当前菜单与可用选项，P3-10），`result`（任务阶段与真实结果，P3-11）。各分区使用明确的 `not-implemented` 或 `ready` 判别，不以空列表、0 血量、全地图可见或胜利默认值冒充缺少的规则。ready 的最小共享内容按下表定稿；额外需求按[扩展规则](#扩展规则)修订。

| 分区 | ready 数据契约与所有权 |
|---|---|
| flight | 玩家 ID、当前位置/姿态、当前和指令速度（运行时单位/秒）；目标为 null 或带 ID、种类、名称引用与距离的目标快照；资源读数用具名 `{ current, maximum }`，各量单位随已确认规则注明，不混用百分比与绝对量；武器为内容记录引用与弹药计数。没有对应规则时整分区未就绪，不伪造最大值 |
| map | 换算后的地图框架；稳定 ID 的可见接触点列表（位置、名称引用和标记分类）；探索/当前可见性的纯数据描述及空间单位/索引约定；目的地为 null 或已校验的点、能量需求与可执行性。迷雾算法与具体形状尚待 P3-09 取证并修订本 spec，不预设为网格，也不提前构造全可见 ready 分区 |
| communications | 当前交互对象 ID（可空）、菜单内容引用、当前层级、选项的稳定索引及可用性/禁用原因；不含头像/GPU 对象。具体菜单表未由 P3-03 导入前不能宣称菜单已就绪 |
| result | 进行中或终态的判别；终态只允许 success/failure，附规则原因和内容消息引用；被毁/救援不是默认 failure。统计、勋章等未纳入本契约的字段由 P3-11 研究后按扩展规则修订 |

- **读取频率：** 飞行 HUD 在每个渲染帧读取最新 projection；React 页面经桥接按 10–20 Hz 采样（[总计划 §5](../../master-plan.md#5-状态管理与通信约定)）。读取不改变世界。
- **信息边界：** projection 只给出原版呈现的信息或规则需要的信息，不提供全体实体的列表，以免地图或 HUD 绕过迷雾与可见性规则（R-14）。渲染器之外的消费者不得从 Render State 推导规则信息（例如地图标记、目标列表）。开发诊断经快照读取（P3-04），不进入生产界面。
- **Render State：** 包含 tick、视角模式、观察实体 ID（可空）与实体列表。列表包含当前可呈现的实体，按 ID 升序；每个实体给出 ID、kindBit、表现判别/模型 Asset ID、位置、姿态与放置序号。新生实体只用当前姿态，当前已无的实体不由旧帧继续绘制；同 ID 放置序号变化表示非连续移动（Warp 到达、救援放置、离港放置），不跨此边界插值。被毁但尚未退场与已移除必须分开；停放的实体不呈现（原版停放对象没有渲染对象）。两帧来自同一次运行；跨重试的折叠归 P3-04，不能因 ID 从 1 重用而连接两次运行。
- **读取时机：** Render State 与 projection 都可以在任意时刻读取；由 Runtime 在每个 tick 之后提取，并保留两帧（P3-04）。

### 快照、哈希与 replay

- **快照：** 初版形状为 `{ format: 'osr-game-snapshot', version: 1, rulesVersion: 1, state }`。`state` 包含世界的全部权威状态：
  - 配置：完整内容身份、任务 Asset、`setupHash`、原始难度、组、槽位、僚机、种子、每 tick 的单位数；
  - tick、时钟、RNG 状态、下一个实体 ID；
  - 实体，以及各种类表的次序；
  - 生成队列与开关、缺省后的运行记录及别名关系、声明/编组计数与当前对象关联、名称占用；
  - 任务状态与玩家状态；
  - 已接入规则的状态和具名延时；本 tick 命令不会变成持久的按键队列。

  静态 `MissionSetup` 不复制进导出记录。Core 对校验后完整 setup 做规范化、计算 `setupHash`，包含名称内容、坐标、成员与所有规则输入，不仅哈希 Asset ID。它补足 `ContentIdentity` 只声明身份、`LoadMissionInput` 自身不带来源证明的边界：P3-04/本地核对工具先从同一经 `validatePackage` 验证的包解码三份 Asset，再传入该包的身份；Core 不认证来源、不读原版字节，但同一声明身份下换了 setup 也会被 replay 拒绝。
- **规范文本与哈希：** 字段按规范顺序显式序列化，不依赖对象插入顺序；实体集合按 ID 排序，有语义的列表（种类遍历、生成队列、名称占用、事件）保留顺序。规范文本是紧凑 JSON，−0 记为 0，拒绝非有限值，非 ASCII 字符统一转义。`setupHash` 与状态哈希都使用 `fnv1a64` 输出 16 位小写十六进制；前者覆盖静态输入，后者覆盖版本与完整状态。哈希仅作一致性诊断，不证明来源、防篡改或无碰撞。
- **录制：** 录制从 tick 0 开始，每个成功 tick 保存同一份实际交给 step 的规范输入、全部事件和检查点：tick 0、`checkpointInterval` 的每个正整数倍，以及最后一个 tick（去重）。间隔为正安全整数；零 tick 录制也有 tick 0 检查点。快照、事件与导出录制均深度冻结且脱离世界，后续 tick 不改变既有导出。预计超出录制容量时，在执行下个 tick 前拒绝且不改变世界/录制；内部故障时导出报告失败，不输出貌似完整的成功前缀。
- **replay 记录：** 初版形状为 `{ format: 'osr-game-replay', version: 1, rulesVersion: 1, producer, content, mission, setupHash, run, checkpointInterval, ticks }`。`content` 为完整 `ContentIdentity`，比较用现有 `contentIdentityKey`；`producer` 为非空、有长度上限的应用版本标识，只用于诊断。`run` 为含默认值的有效配置 `{ rawDifficulty, wingman, seed, clockUnitsPerTick }`；`ticks[k]` 是 tick k+1，稀疏数组不是空闲 tick。
- **版本：** `rulesVersion` 由代码持有，不由记录选择兼容实现；规则顺序、数值语义、RNG 抽取次序、动作解释等影响结果的修改必须递增。结构不兼容时递增相应 format version。只有当前支持的组合可执行；不能仅凭未改的格式号重放旧规则，也不能只把 `producer` 留给人工辨认。
- **replay 与比较：** 先校验整份记录和输入边界，再在独立世界执行；未知格式/版本、内容身份或 setupHash 不同、任务/config 不同、坏字段或超限一律拒绝，不返回部分成功结果。结果为 `{ events, checkpoints, finalTick }`，事件按 tick 与发出次序，检查点严格递增且含首尾。比较的 expected/actual 也须校验，返回 `{ match: true }` 或 `{ match: false, tick, kind: 'events' 或 'checkpoint' 或 'length' }`。tick 是最早**可观测**分歧，不声称是首次内部状态偏离；间隔大于 1 会漏掉两检查点间已恢复的差异。共有 tick 内优先比较事件，再比较检查点；较短末帧单独附加的尾检查点若没有另一侧对应采样，不误判。共有部分没有可观测差异但长度不同，在较短运行的首个缺失 tick 报告 length，不把缺失整帧再报告成单个事件差异。
- **上限：** `CoreLimits` 覆盖每 tick 命令、实体与生成展开、单 tick 事件、录制 tick/总命令/事件/检查点与规范文本长度。容量在分配或执行之前检查，乘法不得溢出；不以输入数组巨大为由先复制再检查。不开放无限制的调用者上限覆盖。
- **其他：** 正式格式与合成格式互不兼容。正式快照不是存档；本任务不提供从快照恢复世界的接口。

### 扩展规则

下游按已批准的契约接入自己的系统与初始化实现，不获得自行扩展共享 API 的授权。新增或改变实体字段/种类、Command/Input、DomainEvent、projection、Render State、快照/replay 形状、阶段顺序或公开语义，都须先同步修订本 spec 与受影响的下游 spec，并取得对实质契约变化的批准；仅在下游 spec 或工程说明中记一笔不够。这遵守[阶段索引](../tasks.md#5-实施顺序)的“正式契约先稳定，不各自扩展”。

本任务交付时，类型、校验、序列化与合成生产者/消费者契约测试覆盖已有分区；未实现规则明确标为未就绪。下游只把已约定的分区从未就绪变为真实数据、实现既定动作效果时，由其自身 spec 批准，不为内部 helper 变更反复重审本任务。每次规则结果变化递增 rulesVersion，结构变化递增格式版本；不能用开放索引签名或 `unknown` 载荷规避契约定稿。

### P3-06 的契约修订（检查点 A）

本节由 P3-06 的检查点 A 加入（2026-10-10），汇集 [P3-06 spec](../06/spec.md#对-p3-02-契约的增量) 的 D-01 至 D-08 对本 spec 的修订。前文与本节不一致时以本节为准；形状、初值、写入责任与原版依据的全文在 P3-06 spec 的[检查点 A 定稿的状态与契约](../06/spec.md#检查点-a-定稿的状态与契约)与[实例化扩展](../06/spec.md#实例化扩展)，这里只列契约的变化。P3-02 的既有 goal 与 subtask 是历史记录，不改写。

- **D-01 运行配置与世界创建：**
  - 世界创建、录制入口与 replay 的内容输入增加必需的 `craftInfo`（`{ id, content }`，`data/craft-info`，经 `readCraftInfo` 严格读取、冻结并与输入脱离）。外层字段错误为 `CoreInputError`，Asset ID 或内容错误保留内容读取器的错误，语义不符为 `CoreInputError`；错误不回显导入值。`original-import` 只接受唯一切片的 craft-info Asset。
  - 语义检查：可实例化的种类都有机型记录；P3-06 读取的机型 f32 字段有限，+0x0C 截断后为正（停放行进的模数）；玩家机型的能量分支不除以零、整数运算不溢出；停放 Warp 的计时运算不溢出。零值按原版语义处理，不一律拒绝（清单见 P3-06 spec 的 D-01）。
  - `setupHash` 在 `MissionSetup` 之后按固定字段顺序覆盖完整 craft-info（含 ID）；`WorldState` 显式保存冻结的机型内容。三份逻辑 Asset 与 craft-info 来自同一经 `validatePackage` 验证的包，由调用者保证。
- **D-02 实体与生命周期：**
  - **P3-02 拥有的字段增加 `formation`**（可空的 `{ leader, offset }`）：段 5 请求在每个布局周期中，后续成员实例化后记录该周期首个成员的实体 ID 为编队领队，偏移为 R(l − layout[0])（f32）；周期首个成员与其他实体为 null。原版在派发中写入（[段 5 派发](../../../original/formats/executable.md#section-5-dispatch-p3-0202)，经 P3-06/04 的消费者确认），P3-02 的生成原先只把领队记在编组的生成状态中，没有存到实体上。读取者为 P3-06 的停放行进与 Warp 过境；领队失效时由停放行进清为 null。
  - **P3-06 在实体初始化扩展点加入：** `maximumSpeed`、`lastParkedUpdateClock`、`warpClock`（0 为哨兵）、`inWarp`、可空的移动块 `movement` 与 AI 初态 `ai`（`0x68050` 的模式、AI 目标、目标点与目标偏移，以及初值为空、由 P3-08 写入的非玩家对象目标 +0x8C）。`warpClock`/`inWarp` 由 P3-09 复用，AI 初态此后的改变归 P3-08。
  - **生命周期：** 区域切换的停放分支也适用于停靠的实体；停放时释放移动块，并只在玩家目标恰为该实体时清除它；恢复时按初始移动块规则新建移动块；停放与恢复不改上述计时字段。停放实体在 Warp 过境中不推进自身的生命周期状态（原版通用回调在状态 0–3 调用过境检查），过境结束时清除 `inWarp`。种类位 `0x1f00000` 的实体离开活动区域时直接待移除，不停放。停放更新的真正退场直接写待移除并发事件，移除仍在下一 tick 的请求处理中。
- **D-03 玩家状态：** 增加 `target`（玩家对象 +0x8C：实例化时为 null；失效、目标停放、玩家实体移除时清除；选择归 P3-07，Warp 开始清除归 P3-09）与可空的 `control`（每轴上次读数与速度辅助状态；有玩家实体时非空，随玩家实体移除清空，救援保留）。不保存油门。
- **D-04 输入与命令：**
  - `COMMAND_RESULT_REASONS` 增加 `player-unavailable`、`wrong-context`、`no-target`，其他规则任务可沿用。
  - `speed` 的六种操作、普通飞行的 `select-number`（n 等于原版 Shift+n 的速度档位）与 `confirm-selection`（手动匹配的别名）由 P3-06 接入，命令形状不变。速度命令只在飞行上下文处理，其他上下文为 `wrong-context`；`select-number`、`confirm-selection` 在 Warp 上下文为 `wrong-context`，在基地、地图与通讯上下文仍由其负责任务接入。
  - 轴的语义：项目轴作为原版整数操纵路径上的数字摇杆（`pitch`、`yaw`、`roll` 分别对应原版第 1、2、3 轴，±1 为满偏，非整数轴值向零截断，固定 Medium 灵敏度表），只在某轴的偏转变化时应用；地图与基地上下文中有效手动轴为零（有意差异，原版保持旧转向）。前文“地图开启时 Core 防御性屏蔽飞行操纵”扩展到基地。
  - 自动驾驶不加入命令联合（G-09），飞行中切换灵敏度也不加入（G-10）。
- **D-05 Projection：** `flight` 分区改为 `{ motion, combat }`，两组各为 `not-implemented` 或各自的 `ready`。运动组的 ready 为 `{ player }`：null，或玩家的实体 ID、位置、姿态、当前与指令速度、最高速度、`speedLimitStatus`（`'initial-only'` 或 `'live'`）与 `speedAssist: { enabled, engaged }`。战斗组保留本 spec ready 表中 flight 行的目标、资源与武器，其 ready 形状由 P3-07 定稿。两组互不覆盖。
- **D-06 领域事件：** 增加 `speed-assist-toggled`、`speed-matched`（`origin: 'command'` 带 `commandIndex`，`origin: 'assist'` 带速度差标志）、`speed-assist-released` 与 `object-left-world`（`entityId`、`kindBit`、脱离世界的 `source`）；一个 tick 内的次序见 P3-06 spec。比较校验的事件字段表随之扩展。
- **D-07 快照与版本：** 快照覆盖上述全部新状态；快照格式版本与 `rulesVersion` 相对合入时的基线各递增一次。replay 记录的形状不变（craft-info 经 `setupHash` 绑定），replay 格式版本不变。Render State 的形状不变；停放中的位置写入使放置序号加 1（停放实体不呈现，恢复后渲染器不跨此插值）。
- **D-08 系统流水线：**
  - **第 4 行（对象更新）：** 玩家更新中依次为失效目标清除、速度辅助、命令判定与轴的变化检测（P3-06）；通用自身更新加入 Warp 过境检查。
  - **第 5 行（派发器规则阶段）：** 请求处理加入内部请求 `control`（原版消息 0x20000）与 `match-speed`（消息 0x80000），扩展 `leave` 的停放切换；运动阶段（P3-06：筛选含停靠与被毁源，模式 `craft`、`warp`）、停放更新（P3-06：节奏、过境、行进、编队跟随、停放中的 Warp 跳跃与离开世界；停放战斗归 P3-07/P3-08）与活动区域检查（P3-06）接入规则，阶段次序不变。
  - **对象集合重建（`0x2ede0`）**，原写“未分析，暂无负责阶段”，改为：每帧重建友方与敌方机体两个句柄集合，并刷新地图可见标志，供地图（P3-09/P3-13）与停放对象的 AI 处理（P3-08）使用；P3-06 的规则不读取，阶段在 P3-06 中保持为空，建议负责阶段为 P3-08（[对象集合](../../../original/formats/executable.md#world-boundary-active-area-parking-and-autopilot-p3-0604)）。
  - **实体初始化扩展点的顺序**（在分配与命名之后）：最高速度（P3-06；P3-07 的 `0x3060c` 能量字段与 1 次抽取在同一位置）→ 两位字段（P3-07）→ AI 初态 `0x68050`（P3-06，Core 中 0–2 次抽取，原版 0–3 次；此前的交接归 P3-08）→ `lastParkedUpdateClock`（P3-06）→ `warpClock`（P3-06，玩家与僚机以外 1 次抽取；此前的交接归 P3-09）→ `0x20990`（P3-08）→ 活动判定（P3-02）→ 初始移动块（P3-06）→ `0x38cd4`（P3-10）→ 玩家状态（P3-02；P3-06 的目标与控制状态）。`0x68050` 原版的 3 次只出现在经记录 +0x4C 路径路线取目标点时；内容契约已拒绝 +0x4C 路径，这条路线在 Core 中不可达（见 core 分册的[已知差异](../../../engineering/modules/core.md#已知差异)）。
  - **容量：** P3-06 的项为事件 ≤ 命令数 + 1 + 本 tick 离开世界的机体数（不含每条命令本来就有的结果），请求 ≤ 命令数 + 2；与本 spec 原有的项合计，实体上限下事件至多 3,201、请求至多 3,138，都在 `eventsPerTick` 之内，快照长度在每实体预算之内，`CORE_LIMITS` 不变。P3-07 等加入每实体或二次的项时须重新推导合计（P3-06 spec 的容量核算）。

### P3-07 的契约修订（D-01、D-03）

本节由 P3-07 的子任务 08 加入（2026-10-10），定稿 [P3-07 spec](../07/spec.md#实施关卡) 的关卡 D-01（共享字段与时序）与 D-03（与 P3-06 的接口）。它建立在上一节 P3-06 的修订之上：P3-06 已定的项不变，包括 `craftInfo` 输入、玩家目标引用的字段与生命周期、最高速度纯函数及其重算时机、三个原因码、版本相对当前递增、`movement` 的模式分派、`flight` 的 `{ motion, combat }` 拆分与实例化扩展点的次序；本节只增补 P3-07 的部分。前文与本节不一致时以本节为准。

原版事实只记在 [executable 的 Combat rules](../../../original/formats/executable.md#combat-rules-p3-07) 等 original 文档中，下文用其小节标签（T3、W11、H5 等）引用，不重复。定稿依据是 P3-07 子任务 01 至 07 的完成证据，尤其是 [07 的 D-01/D-03 输入汇总与冲突表](../07/subtasks/07-interfaces-camera-numerics-research.md#完成证据)（下文“冲突 n”指该表的第 n 行）。编号 CR-01 至 CR-14 只供引用本节。

**记法与通则：**

- f32 字段都是 `Math.fround` 的不动点且有限；i32 字段为 [−2³¹, 2³¹) 内的整数，运算按 W13、D17、E5 记录的原版 i32 语义（带符号除法向零截断等）。
- 时钟字段是任务时钟单位（1/64 秒）的非负安全整数，比较的严格性按各小节；原版 u32 回绕不复现（P3-02 的时钟契约）。
- 实体引用都是 `EntityId`；被移除后按 ID 查不到，即原版的无效句柄。原版的“计数引用”不阻止移除，Core 不另建引用计数。
- 违反类型或约束的值为 Core 故障。新状态都由 Core 拥有，进入快照规范文本与状态哈希；标为“不持久”的只在一次调用或一个 tick 内存在，标为“静态”的由 setupHash 绑定的输入决定，不进快照。

#### CR-01 世界创建输入与静态规则数据（D-01）

- **输入：** `CreateWorldInput`、录制入口与 `ReplayContent` 在 `craftInfo` 旁增加六项必需输入（`aiPrograms` 由 P3-07 的子任务 34 增补，见本 spec 审批节的相应修订）。外层规则同 P3-06：缺字段或多字段为 `CoreInputError`；校验 Asset ID 的 kind 与角色；`original-import` 只接受唯一切片的对应 Asset；错误只带结构路径与稳定原因，不回显导入值。

  ```ts
  debrisParameters: { id: AssetId; content: unknown };               // data/debris-parameters，readDebrisParameters 严格读取
  projectileVisuals: { id: AssetId; content: unknown };              // data/projectile-visuals（kind 'projectile'）；Core 只校验并提取 records[i].length
  explosions: { id: AssetId; content: unknown };                     // data/explosions，readExplosionTable
  explosionAnimations: readonly { id: AssetId; content: unknown }[];  // data/explosion-animation/<nn>，readExplosionAnimation；ID 升序、无重复
  models: readonly { id: AssetId; content: unknown }[];              // 模型 Asset；Core 只校验并提取 partLists[1] 的长度（第 1 列表的部件数）；ID 升序、无重复
  aiPrograms: { id: AssetId; content: unknown };                     // data/ai-programs，readAiPrograms 严格读取；Core 提取内置程序记录 1、2 的 +0x14、+0x24、+0x2C
  ```

  - 读取结果冻结并与输入脱离。`projectileVisuals` 与 `models` 没有对象读取器：Core 只校验被读取的字段（类型、不超过内容的结构上限、有限值），不展开几何，不引入 `original-data` 解析器。
  - 七份规则输入（含 `craftInfo`）与三份逻辑 Asset 来自同一经 `validatePackage` 验证的包，由调用者保证。
  - `aiPrograms` 是 `logic` 组中角色 `ai-programs` 的 Asset，与其他规则输入并列，不嵌套在别的输入中。本修订只读取追踪导弹需要的部分；P3-08 在同一输入上扩展 AI 所需的其余读取，不另建输入。
- **集合完整（`CoreInputError`）：** `explosionAnimations` 恰为 `explosions` 三张列表引用的动画集合；`models` 恰为可实例化机体（直接与延迟声明、编组成员、僚机选项）在 `craftTypes` 中绑定的模型集合。多一份或少一份都拒绝。
- **语义检查（`CoreInputError`）：** 只检查可实例化种类实际会读到的记录，未用的记录不读也不拒绝：
  1. **爆炸帧数：** 列表 1、2 都非空，它们的全部项的帧数（`ExplosionAnimation.frames` 的长度）相同，记为 n₁₂。列表 3 非空时其全部项帧数相同，记为 n₃；可实例化机体有导弹挂点而列表 3 为空时拒绝。这项载入核对保证 EXPL 项的选择（归表现层，CR-11）不改变 Core 的来源释放时刻（X4）。
  2. **碎片参数映射：** 每个种类位的第 1 列表部件数 c 与其 DEBRIS 参数表按 [craft §4.1](../../../original/formats/craft.md#41-loading-and-lookup-confirmed-code) 的映射一致：种类 1、2 恰需 max(c − 3, 0) 项，其他种类恰需 c 项，不越界。种类 1、2 要求 c ≥ 1，否则爆炸会持有并移除玩家或僚机对象（X2、X4），属切片外。种类 1、2 的第 0 部件是原版明确的无参数部件，不算缺失。
  3. **炮挂点长度：** 每个非自动炮挂点（挂点类型 0、炮记录 +0x28 ≠ 2）的炮序号都有弹丸记录长度。
  4. **挂点链：** +0x18、+0x1C 链接无环；列表项的同时开火链上只有首个组可以带交替链接，首项不得同时带两种链接。原版对后两种排列会保留跨调用的“已尝试”标志（W5），切片数据中没有，Core 拒绝而不保存该标志。
  5. **除数与定义域：** 玩家机型的 c9C、c5C 为正（状态显示步的除数，CR-10）；有护盾（c5C > 0）的机型 c60 ≠ 0；瞄准炮（+0x28 = 1）的 +0x08 ≠ 0；导弹记录 +0x60 ≠ +0x64（爆炸衰减的分母）；可达炮记录的 +0x14 在 [0, 32] 内（E5：停放交战射击次数的 FISTP 不溢出）；可达炮记录的 +0x24（弹丸寿命，H2 的到期时刻 = 首次回调时钟 + +0x24）非负，原版对负值按 u32 回绕为遥远的到期，项目不复现；可达导弹记录的 +0x44、+0x48、+0x54（制导块的寿命、解除保险与起爆延迟，[H5](../../../original/formats/executable.md#h5-missiles--confirmed-code-unless-marked)）非负、+0x58（检查间隔）在 i32 内，与导弹首次回调写制导块时的守卫共用一个判定，使可到达的导弹不会在首次回调时故障；内容层把 +0x44、+0x58 读作 i32，+0x48 读作非负 int32，+0x54 读作 u32，所以实际会被拒绝的只有负的 +0x44，原版按 u32 回绕（负寿命使导弹立即熄火），项目不复现；实例化与能量的 i32 运算按记录百分比不溢出。导弹 +0x2C 的反余弦只供 P3-08，本修订不计算也不校验。
  6. **追踪导弹的程序：** `aiPrograms` 的内置程序表有记录 1 与 2（[executable 的 H5](../../../original/formats/executable.md#h5-missiles--confirmed-code-unless-marked)：热寻的导弹装记录 1，其他追踪导弹装记录 2；记录号即 `builtInPrograms` 的下标），两者的 +0x14（更新周期）都非负。+0x14 为 i32、+0x24（角度）与 +0x2C（饱和值）为有限 f32 由内容读取器保证，其失败保留 `ContentContractError`。这是上述“只检查可实例化种类实际会读到的记录”的例外：导弹是否追踪取决于发射时的锁定，所以不论运行装备什么都检查这两条记录。
- **静态规则数据（`WorldState`，冻结）：** 创建时按原版存储类型计算一次，之后不变：
  - [craft §3.8](../../../original/formats/craft.md#38-load-transforms-in-0x2cf38-confirmed-code) 与 [§4.4](../../../original/formats/craft.md#44-load-transforms-in-0x246a0-confirmed-code) 的消费者变换：炮与导弹的射程及其平方、导弹引信半径平方、带 box 机型的半径与界、炮挂点 +0x08 加弹丸长度（机型记录 0、1 先乘代码常量）、DEBRIS 向量取反与归一化、box 外扩、半径、+0x5C 类别；
  - n₁₂、n₃ 与按种类位的第 1 列表部件数；
  - 内置程序记录 1、2 的 +0x14、+0x24、+0x2C，按记录号复制为有界的纯数据（`homingPrograms`，即 P3-07 共享转向模块的 `SteeringProgram`），原值不变换。

  它们由 setupHash 绑定的输入决定，不进快照，也不与原内容形成两份可变事实。
- **setupHash：** 在 `MissionSetup` 与 `craftInfo`（P3-06）之后，按以下次序与字段覆盖（外观字段不覆盖）：

  | 输入 | 覆盖 | 不覆盖 |
  |---|---|---|
  | `debrisParameters` | ID 与完整内容 | — |
  | `projectileVisuals` | ID 与按记录次序的长度 | 模板、选择值、宽度、颜色 |
  | `explosions` | ID 与三张列表按次序的动画引用 | 声音引用 |
  | `explosionAnimations` | 按 ID 次序的 ID 与帧数 | 帧图像引用 |
  | `models` | 按 ID 次序的 ID 与第 1 列表部件数 | 几何、贴图、颜色、部件标志、声音 |
  | `aiPrograms` | ID 与完整内容 | — |

  `aiPrograms` 的内容全是规则数据，覆盖完整内容使 P3-08 扩展读取时不必改变绑定。按 CR-14，它是静态输入：不进快照，快照格式版本与 `RULES_VERSION` 沿用 P3-07 已递增的版本，replay 记录形状不变。

- **建造期抽取：** 无。EXIC 子集的 3 次抽取（X8）归表现层（CR-11），不在 Core 中抽取，也不进快照。

#### CR-02 实体的战斗状态（D-01）

`Entity` 与 `EntityInit` 增加 `combat: EntityCombat`，是按运行时种类的封闭联合；`combat.type` 与 `kindBit` 不符为 Core 故障。

| `combat.type` | 种类位 | 构造者 |
|---|---|---|
| `craft` | 0–19（`0xfffff`） | 实例化扩展点（CR-07）。运行时构造的种类 `0x4000`（`0x38780`：`b` 与 AI 投放）由 P3-08 的修订接入（P3-10 D-01 的移交，见 CB-18） |
| `missile` | 20 | 发射请求（CR-05） |
| `projectile` | 21 | 发射请求 |
| `explosion` | 22 | 爆炸构造（CR-08） |
| `fragment` | 24，只有判别值 3 | 碎片构造（CR-08）；判别值 1、2 归表现层（CR-11） |

```ts
type EntityCombat = CraftCombat | MissileCombat | ProjectileCombat | ExplosionCombat | FragmentCombat;
type SubsystemState = 0 | 1 | 2 | 3;     // 两位字段；伤害只产生 0–2，3 只来自其他写入者
type Level = 0 | 1 | 2 | 3;

interface CraftCombat {                   // 原版对象 +0x20–+0x47、+0xD0、+0xE8/+0xEC、+0xF4–+0x158、+0x94–+0xA8
  type: 'craft';
  energy: number;               // +0x28，i32。初值 trunc(c54 ÷ 100) × 记录 +0x68（D13）；能量更新扣减，耗尽时钳为 0；修理与救援由 P3-10、P3-11 写入
  shield: number;               // +0x2C，i32。初值 c5C × 记录 +0x64 ÷ 100；0x30c60 吸收；能量更新恢复
  charge: number;               // +0x30，i32。初值 c74 × 100 ÷ 100（百分比恒为 100）；玩家的炮开火扣减；玩家的能量更新恢复
  shieldLevel: Level;           // +0x34（L1）。玩家初值 1，其他 0；只有 s/S 改变
  chargeLevel: Level;           // +0x38（L2）。玩家初值 2，其他 0；只有 g/G 改变
  sparePower: number;           // +0x3C（E），i32。初始化与档位改变时重算（D10、D13）
  fullSpeedPower: number;       // +0x40（T），i32。初始化时计算
  lastEnergyClock: number;      // +0x20。初始化 = 时钟；每次能量更新 = 时钟
  nextEnergyClock: number;      // +0x24。初始化 = 时钟 + 0x80 + rand % 64（1 次抽取）；能量更新与停放交战改写（D14、E3）
  depleted: boolean;            // 项目锁存，初值 false：上一次能量更新以耗尽分支结束。只用于 energy-depleted 每次转换只发一次（CR-06）
  hull: number;                 // +0xD0，i32。初值 trunc((记录 +0x60 × 0.01) × c9C)（双精度乘积，P3-02/03）；0x2a830 扣减
  subsystems: readonly SubsystemState[]; // +0xE8/+0xEC 的字段 0–18，恰 19 项。实例化清零；0x2a830 写；玩家的 1、5、8 另由状态显示步写（CR-10）
  weapons: WeaponBlock;         // 0x2d400 建立（W1）
  hitFeedbackClock: number | null; // 最近一次受击表现项（0x2a40c、0x2a5fc 投递）的时钟，初值 null；Render State 的 hitShimmerStart
  proximity: { entity: EntityId; distanceSquared: number } | null; // +0x94/+0x98（f32）。碰撞两遍写入（H6），P3-08 读取；初值 null
  lastVictim: { entity: EntityId; clock: number } | null;   // +0x9C/+0xA0。弹体命中且发射者有效时写在发射者上（H4）；P3-08 读取
  lastAttacker: { entity: EntityId; clock: number } | null; // +0xA4/+0xA8。同上，写在受击者上
}

interface WeaponBlock {
  selections: readonly [ListSelection, ListSelection, ListSelection]; // 列表 0、1、2（+0x100–+0x114）
  lock: MissileLock;            // +0x118–+0x128。锁定机只为玩家运行（W8），其他对象保持初值（P3-08 的修订（CR-16）：AI 也写入）
  mounts: readonly MountState[]; // +0x154/+0x158：每个机型挂点一项，按挂点次序；没有挂点的机型为空数组（原版无数组）
}
interface ListSelection {
  index: number;                // i32，可为 −1（空列表时的原版取值，W3）
  mount: number | null;         // 当前挂点序号；列表为空时为 null
}
interface MissileLock {
  level: 0 | 1 | 2 | 3 | 4;
  stageDueClock: number;        // 0 为初值（原版清零，比较照常进行）
  losing: boolean;
  graceDueClock: number;
  nextUpdateClock: number;
}
interface MountState {
  lastShotClock: number | null; // +0x04。null = 从未写入（原版初值 0）：冷却判定视为已到期，交替选择中排在任何时钟之前（CR-11 的差异 9）
  ammunition: number;           // +0x08，i32。初值挂点 +0x0C
  damage: 0 | 1 | 2;            // +0x0C
  burst: number;                // +0x20，i32。自动挂点的连发计数
  aim: Matrix3;                 // +0x24–+0x44，f32 行。自动挂点的瞄准姿态，初值全零
  autoTarget: EntityId | null;  // +0x48。自动挂点的目标（P3-08 选择）
  retargetClock: number;        // +0x4C。P3-08 原样写入的保持值（W9），初值 0；基地的绝对保持值的判定见 CR-24 决定 3（P3-08 的修订）
}
```

- **不持久的原版字段：** 三个通道的扳机值（+0xF4–+0xFC；Core 用有序的开火请求代替，主通道电平的采样归 P3-05，AI 的按住与松开归 P3-08）；单次开火调用内的瞄准缓存（+0x12C–+0x153）与挂点的“本次已尝试”标志（每次调用重置）；两个重绘标志 +0x44 与非玩家的 +0xF0（只有显示读取；玩家的 +0xF0 见 CR-04）。
- **`MountState` 的静态部分**（挂点记录、同时开火与交替链接的目标挂点）取自静态规则数据，不进状态。

```ts
interface MissileCombat {       // 种类位 20，原版 0x2b00c、0x2aa40/0x2ab00、0x2ac10（W11、H5）
  type: 'missile';
  missile: number;              // 导弹记录序号（mb +0xF4）；弹体记录为该记录的 +0x14
  shooter: EntityId | null;     // mb +0xFC。归因与近炸的阵营判断；熄火时清空
  target: EntityId | null;      // 导弹 +0x8C。构造时取发射请求保存的目标（此时可解析才写入）；追踪程序改写；熄火时清空
  launchByte: 0 | 1 | 2 | 3 | 4; // mb +0x100
  program: 'unguided' | 'heat-seeker' | 'homing'; // 构造时确定：无制导或发射字节 < 2 → unguided；否则导弹 +0x18 = 1 → heat-seeker，其他 → homing
  detonate: boolean;            // mb +0xF8：到期请求的类别（true 起爆，false 熄火），初值 false
  contact: EntityId | null;     // mb +0x104：接触引信触发的对象，初值 null（冲突 41 的差异）
  guidance: MissileGuidance | null; // 制导块 G；首次回调前为 null
  homing: HomingState | null;   // 追踪导弹首次回调后非空；无制导导弹恒为 null
}
interface MissileGuidance {
  phase: 0 | 1 | 2 | 3 | 4;     // G+0x14
  lifetimeClock: number;        // G+0：首次回调写入导弹 +0x44（相对值），阶段 0 加上时钟
  armClock: number;             // G+4：同上，+0x48
  fuseRadiusSquared: number;    // G+8，f32（+0x50）
  detonationClock: number;      // G+0x0C：初值 +0x54（相对值）；近炸时加上时钟；接触时置 0
  checkInterval: number;        // G+0x10，i32（+0x58）
  nextCheckClock: number;       // G+0x18，初值 0
}
interface HomingState {         // 追踪程序控制器中导弹路径实际使用的部分（H5）
  period: number;               // C+0xF4：程序记录 +0x14；发射字节 3 时 ×2，其他非 4 的值 ×5
  nextUpdateClock: number;      // C+0xF0
  turnFraction: number;         // S+0xCC，f32：发射字节 4、3、其他分别为 1.0、0.65、0.2
  speedFraction: number;        // S+0xC8，f32：1.0
  targetValid: boolean;         // S+0x0C
  targetDistance: number;       // S+0x28（= C+0x2C），f32：期限与引信间隔按它选择
}

interface ProjectileCombat {    // 种类位 21，原版 0x25b0c、0x259b0、0x25f48（W11、H2）
  type: 'projectile';
  gun: number;                  // 炮记录序号（mb +0xF4）
  shooter: EntityId | null;     // mb +0xFC；移除请求时清空
  expiry: { clock: number; firstHitPending: boolean } | null; // 计时块：首次回调前为 null；到期 = 首次回调时钟 + 炮 +0x24；
                                // 跳弹后的首次状态 8 回调把 firstHitPending 清为 false 并改到期为时钟 + 0x80
}

interface ExplosionCombat {     // 种类位 22，原版 0x23ac8、0x23838、0x2409c（X2、X4）
  type: 'explosion';
  source: EntityId;             // 构造时被毁的来源（不持有，只作历史身份），之后不变；explosion-started 的 sourceEntityId
  sourceKindBit: number;        // mb +0x104：来源的种类位
  variant: 'large' | 'other' | 'missile'; // mb +0xF0 = 0、2、3；1 只由表现层按相机距离切换产生，不在 Core
  heldSource: EntityId | null;  // +0x8C：来源不是机体，或产生碎片失败时持有来源
  activationClock: number | null;   // +0xFC（t₀）；激活前为 null
  removalAfterClock: number | null; // +0x10C = t₀ + 0x60；时钟严格大于它且帧序号已达帧数时请求移除
}

interface FragmentCombat {      // 种类位 24、判别值 3，原版 0x25124、0x24ac4、0x256e4（X6、X7）
  type: 'fragment';
  sourceKindBit: number;        // mb +0xF0
  part: number;                 // mb +0xF5：源模型第 1 列表的原序号
  debris: number | null;        // 源种类 DEBRIS 参数表中的序号（craft §4.1 映射）；种类 1、2 的第 0 部件为 null
  durability: number;           // +0xD0，i32：有参数时按其 +0x5C 类别为 4000（= 0）或 1200（≠ 0），无参数为 0
  explodeOnExpiry: boolean;     // mb +0xF6
  expiry: { type: 'pending' } | { type: 'never' } | { type: 'at'; clock: number }; // 计时块 +8：首次回调前 pending；大型来源与已触发为 never；被击落时改为 at 1
  handOff: EntityId | null;     // +0x8C：只第 0 部件持有来源，交接后清空
}
```

- **字段的范围与生命周期：** 下表补足上面注释未写全的范围、初始化、更新与重置。运行时种类的战斗状态随实体移除而消失，没有重置。序号字段都是非负整数，越界为 Core 故障。

  | 字段 | 范围 | 初始化 | 更新 | 重置 |
  |---|---|---|---|---|
  | 机体 `energy`、`shield`、`charge` | i32；能量更新结束时能量 ≥ 0 | `0x3060c`（D13） | 能量更新（D14）、护盾吸收（D3）、玩家开火扣充能（W6） | 救援（P3-11，经 `0x3060c`）、修理（P3-10） |
  | `shieldLevel`、`chargeLevel` | 0–3 | 玩家 1、2，其他 0 | `0x30b20`、`0x30bc0`（D10） | 救援 |
  | `sparePower`、`fullSpeedPower` | i32 | `0x3060c` | 档位改变时重算 E | 救援 |
  | `lastEnergyClock`、`nextEnergyClock`、`depleted` | 时钟、时钟、布尔 | `0x3060c`；`depleted` 为 false | 能量更新；停放交战改写 `nextEnergyClock`（E3） | 救援 |
  | `hull` | i32，可为负 | 实例化 | `0x2a830` | 修理与救援（c9C，D7） |
  | `subsystems[i]` | 0–3，恰 19 项 | 0 | `0x2a830`；玩家的 1、5、8 由状态显示步 | 修理与救援清零（P3-10 的 `0x39820`） |
  | `selections[c]` | `index`：i32，−1 ≤ index < max(列表长度, 1)；`mount`：null 或机型挂点序号 | 列表首项，空列表为 null | `0x2e4ec`（W3） | `0x2d400`（实例化、救援） |
  | `lock` | `level` 0–4；三个时钟字段为时钟 | 全 0、false | `0x2ddbc`（只玩家）；列表 1 的选择与制导导弹发射清 `level` | `0x2d400` |
  | `MountState.ammunition` | i32 | 挂点 +0x0C | 导弹发射、挂点损坏（W4）、停放交战选中的导弹（E3） | `0x2d400`；补弹（P3-10） |
  | `MountState.damage` | 0–2 | 0 | 挂点损坏（W4） | `0x2d400`；修理（P3-10） |
  | `MountState.burst`、`aim`、`autoTarget`、`retargetClock` | i32、f32 矩阵、ID、非负整数 | 0、全零、null、0 | 自动挂点规则（W9）与 P3-08 的获取 | `0x2d400` |
  | `MountState.lastShotClock` | null 或时钟 | null | 列表开火与哑火、自动挂点（W6、W8、W9） | `0x2d400` |
  | `proximity`、`lastVictim`、`lastAttacker`、`hitFeedbackClock` | 见注释；距离平方为 f32 | null | 碰撞两遍（H6）；弹体命中（H4）；受击表现项 | 无（原版不清；引用对象移除后按 ID 查不到） |
  | 导弹 `missile`、`launchByte`、`program` | `missile` < 导弹记录数；0–4 | 构造 | 不变 | — |
  | 导弹 `guidance` | `phase` 0–4；四个时刻字段在阶段 0 之前为相对值，之后为时钟；`checkInterval` 为 i32 | 首次回调（H5） | `0x2ac10`、引信 `0x2adac` | — |
  | 导弹 `homing` | `period` 与 `nextUpdateClock` 为非负安全整数时钟单位；其余 f32 或布尔 | 首次回调（`0x5dc0c` 与处理程序的模式 0） | 每次处理程序调用 | — |
  | 弹丸 `gun`、`expiry` | `gun` < 炮记录数；时钟 | 构造；首次回调 | 首次状态 8 回调 | — |
  | 爆炸 `source`、`sourceKindBit`、`variant` | 来源种类位为 0–19、20 或 24 | 构造 | 不变 | — |
  | 爆炸 `heldSource`、`activationClock`、`removalAfterClock` | ID 或 null；时钟或 null | 构造；激活时 | 释放来源时清 `heldSource` | — |
  | 碎片 `sourceKindBit`、`part`、`debris` | 0–19；< 来源第 1 列表部件数；null 或 < 参数表项数 | 构造 | 不变 | — |
  | 碎片 `durability`、`explodeOnExpiry`、`expiry`、`handOff` | i32；布尔；见注释；ID 或 null | 构造（`expiry` 为 pending） | 弹丸命中与碰撞扣耐久；击落置标志并改 `expiry`；首次回调设 `expiry`；交接后清 `handOff` | — |

- **运行时种类的 P3-06 字段：** 种类位 20–24 的实体不经 `0x68050`，取分配器缺省：`ai` 为模式 5、两个目标为空、零向量；`formation` 为 null；`lastParkedUpdateClock`、`warpClock` 为 0，`inWarp` 为 false（停放更新只遍历 `0xfffff`，区域检查使这些种类直接待移除，不停放）；`maximumSpeed` 对导弹为弹体记录 +0xB8（`0x3060c` 的非机体分支只调用 `0x30e0c`，D13），对其他三种为 0（无读者）。其 `ruleInputs` 六项为 0，`name` 为 `none`，`source`、`side` 为 null，`baseInteraction` 为 false。
- **`ai.objectTarget` 的含义收窄：** P3-06 把它定为“非玩家对象的 +0x8C”。运行时种类的 +0x8C 另有含义（导弹的目标、爆炸持有的来源、第 0 部件碎片的交接来源），分别存于上面的 `target`、`heldSource`、`handOff`，这些实体的 `ai.objectTarget` 恒为 null。机体的 `ai.objectTarget` 仍是其目标：瞄准炮、制导导弹、停放交战读取，P3-08 的 AI 与停放的多目标交战（E2）写入。
- **表现选择器：** `EntityPresentation` 扩展为封闭联合，分配时确定，之后不变：

  ```ts
  type EntityPresentation =
    | { type: 'model'; model: AssetId }                              // 既有：机体
    | { type: 'missile'; missile: number }                           // 导弹记录序号；外观类型由 P3-12 从内容解析（导弹外观不是 Core 的输入）
    | { type: 'projectile'; visuals: AssetId; record: number }        // projectileVisuals 的 Asset ID 与记录序号（= 炮记录序号）
    | { type: 'explosion'; variant: 'large' | 'other' | 'missile' }  // EXPL 列表与项由表现层选择（CR-11）
    | { type: 'fragment'; model: AssetId; part: number; display: 'part' | 'parts-0-2' }; // 源模型与第 1 列表原序号；种类 1、2 的第 0 部件绘制部件 0–2
  ```

#### CR-03 移动块的模式 1、2（D-03）

P3-06 的 `MovementBlock` 改为封闭联合：P3-06 已定的形状（`mode: 'craft' | 'warp'`，下称机体移动块）不变，P3-07 加入两个变体。三种变体都有 `speed`（原版 mb +8），供瞄准提前量、速度匹配与 `0x218e8` 读取。

```ts
type MovementBlock = CraftMovementBlock | LinearMovementBlock | SpinningMovementBlock;
interface LinearMovementBlock {   // 原版模式 1（0x22818）：弹丸与爆炸
  mode: 'linear';
  speed: number;                  // +8，f32：弹丸为炮 +0x08；爆炸为来源当时的速度
  velocity: Vec3;                 // +0x5C–+0x64，f32：构造后不变，跳弹改写
  previousPosition: Vec3;         // +0x0C–+0x14，f32：本次移动前的位置，构造时为出生位置
  hitTest: boolean;               // +0x68：弹丸 true，爆炸 false
}
interface SpinningMovementBlock { // 原版模式 2（0x2285c）：碎片
  mode: 'spinning';
  speed: number;                  // +8，f32
  velocity: Vec3;                 // +0x5C–+0x64，f32
  spin: number;                   // +0x68，f32：每次移动转过的弧度，不乘步长（H1；固定步长下的差异交 D-02）
  spinAxis: 0 | 1 | 2;            // +0x6C：2 → 0x228cc，1 → 0x22a50，0 → 0x22990
}
```

- **运动（P3-07 的规则函数，在 P3-06 的移动遍历与筛选中按模式分派）：** `linear` 先把位置存入 `previousPosition`，再按本 tick 步长平移（每轴一次 f32 写回）；`spinning` 平移后按 `spinAxis` 旋转姿态。行旋转辅助（`0x228cc`、`0x22a50`、`0x22990`）与 P3-06 共用，不另建。
- **构造：** `0x218e8` 的模式 1、2 分支由 P3-07 实现：由来源的位姿与速度得到项，来源为 `spinning` 块时先以其速度方向为第三行并重新正交化；模式 0 分支（救援、种类 `0x4000`）仍归 P3-06。
- 冲量、定时旋转、锁定与扰动只存在于机体移动块。碰撞响应写到 `spinning` 块（碎片）时没有字段可写，原版也不消费（H6），但响应的 6 次抽取照常发生。

#### CR-04 玩家状态（D-01）

`PlayerState` 增加以下字段，都在创建世界时取初值：

```ts
targeting: { mode: 'enemy' | 'friendly'; autoTargetDueClock: number } | null;
                                    // 控制器 +0x198、+0x1A8。生命周期与 P3-06 的 control 相同：有玩家实体时非空（实例化时 enemy、0），
                                    // 玩家实体移除时清空，救援保留。t/f/u 与自动选敌写 mode；自动选敌写到期时刻
followedEntity: EntityId | null;    // ps +0x90：玩家的第 0 部件碎片（逃生舱）构造时写入，舱到期时清除；伤害门禁读取（D2）
delayedExplosionClock: number | null; // 0x174ae4：玩家被毁时为时钟 + 0xC0；延迟爆炸阶段消费后为 null（X2）
kills: Readonly<Record<7 | 8 | 9 | 10 | 11 | 12 | 16 | 19, number>>;
                                    // ps +0x30…+0x5C 的 8 个按种类击杀计数，键为种类位，初值 0（D8）。只计玩家击杀的非玩家、非僚机；救援不清
shots: { projectilesFired: number; projectileHits: number; missilesFired: number; missileHits: number };
                                    // ps +0x38、+0x3C、+0x40、+0x44，初值 0；救援不清。读者归 P3-11/P4
heavyDamage: -1 | 0 | 1;            // 0x176710：初值 −1；0x2a830 的阈值写入（D4、D11）；救援不清；P3-11 的成功总结读取
leftDisplay: { page: 0 | 1 | 2 | 3 | 4 | 5 | 6 }; // 0x1a9dc8，初值 0（D15）。P3-07 写 0、1 之间的切换；页 2–6 及保存的页由 P3-09、P3-10 的修订加入
statusDisplay: { blink: 0 | 1; blinkDueClock: number; redraw: boolean };
                                    // 0x4d0e0 的闪烁相位与计时，以及玩家对象的 +0xF0。初值 0、0、true；redraw 由玩家的子系统受损、
                                    // 视角模式改变（显示切换 0x4cd68）置位，状态显示步清除（CR-10）
```

不保存：摇杆选敌键的到期（+0x1B0，命令联合中没有对应动作）、导弹相机 `0x174c0c`、通讯与感谢计数（P3-10、P3-11）。

#### CR-05 命令、原因码与内部请求（D-01）

- **原因码：** `COMMAND_RESULT_REASONS` 在 P3-06 的 `player-unavailable`、`wrong-context`、`no-target` 之外增加 `no-candidate`、`no-change`、`no-weapon`、`weapon-disabled`、`no-ammunition`、`insufficient-charge`、`cooldown`、`misfire`、`out-of-arc`。P3-07 的命令沿用 P3-06 的三个原因码，不另建 `no-player`、`player-destroyed` 或 `context-blocked`。未被接受的 P3-07 命令一律为 `ignored`，因为原版对这些键静默无作用。
- **共同前置判定（依次）：** 玩家实体不存在、已被毁、不在活动状态（7）或待移除 → `player-unavailable`（原版此时不轮询按键）；交互上下文不是 `flight` → `wrong-context`（原版只有飞行键上下文 `0x264a0` 处理这些键）。通讯菜单占用按键的优先级由 P3-10 加入。
- **`target`（T2–T4）：**
  - `enemy`、`friendly`：取该模式掩码中最近的候选（`0x2799c`）；`forward`：取前方候选（`0x27a04`/`0x63a4c`），并按所选对象的种类写模式；`next`：更近一项，没有时回绕到最远（`r`）；`previous`：更远一项，没有时回绕到最近（`y`）。
  - 没有候选 → `no-candidate`；结果等于参照目标 → `no-change`；两种情形都不写任何状态。否则 `accepted`：`enemy`、`friendly`、`forward` 在判定时立即写入模式（`next`、`previous` 不写模式），目标经内部请求 `select-target` 在本 tick 的请求处理中写入。
  - **参照目标：** 本 tick 中由先前命令投递而尚未应用的最后一个 `select-target` 的目标，没有时为玩家当前目标（`next`、`previous` 只在它可解析时用作参照）。这样同一 tick 的连续命令与原版相继几帧的按键一致。
- **`fire`（W5–W8）：** `primary` 作用于列表 0，`secondary` 作用于列表 1。当前挂点为空 → `no-weapon`；否则按 W5 的组与交替规则尝试。至少一个挂点投递了发射请求 → `accepted`；否则取**最后一次尝试**的原因。每次尝试的原因次序：
  - 炮：`insufficient-charge`（只对玩家）→ `weapon-disabled`（挂点已毁）→ `cooldown`（相等时可射）→ `misfire`（受损抽取失败，冷却照常重置）→ 瞄准炮无可用解而又不能退回不瞄准时为 `no-target`（目标无效）或 `out-of-arc`。
  - 导弹：`no-ammunition` → `weapon-disabled` → `no-target`（制导导弹） → `cooldown`。
  - 扣费、冷却与弹药都在判定中按 W6、W8 的时机写入，之后的命令读到写入后的值；制导导弹发射后按 W8 清除锁定。
- **`cycle-main-weapon`、`select-missile`（W3）：** 分别为列表 0 的下一项、列表 1 的下一项或上一项。机型没有挂点 → `no-weapon`；否则 `accepted`（原版此时总会更新序号、在列表 1 上清除锁定并请求选择音效，即使所选挂点不变），并发出 `weapon-selected`。
- **`energy` 与 `damage-report`（D10、D15）：**
  - `open`：页 0 → 页 1；已在页 1 → `no-change`；页 2–6 → `wrong-context`。`damage-report`：页 1 → 页 0；已在页 0 → `no-change`；页 2–6 → `wrong-context`。页面在判定时立即写入。原版经消息 0x100000 在同一帧的请求处理中写入，其间没有规则读取页面，所以结果相同。
  - `shield-increase`/`shield-decrease`、`gun-increase`/`gun-decrease`：只在页 1 处理，否则 `wrong-context`；新档位越出 0–3 → `no-change`；否则按 D10 改变档位与 E（含原生的失败分支），调用 P3-06 的最高速度重算与 `0x21d88`（CR-09），`accepted`，发出 `energy-allocation-changed`。
- **AI 的开火入口（P3-08 调用，不产生命令结果）：** 同一扳机规则 `0x2d578` 的通道 0、1、2，自动挂点 `0x2dad0`、瞄准获取 `0x2da58`、瞄准解 `0x2e9d4` 与半球判定 `0x2d894`。自动挂点是独立的开火规则（W9：不检查也不扣充能、受损抽取不同、失败也消耗连发并重置冷却、开火时不检查射界、出生偏移随机），与列表开火只共用挂点状态、发射请求与弹丸构造。
- **内部请求：** P3-02 的 `Request` 联合增加以下封闭变体：

  ```ts
  | { type: 'select-target'; entityId: EntityId; target: EntityId; targetKindBit: number;   // 消息 2：主体为玩家；应用时不再校验
      origin: 'command' | 'automatic'; commandIndex: number | null }
  | { type: 'launch'; family: 'gun'; shooter: EntityId; gun: number; mount: number;        // 消息 8（W11）
      offset: Vec3; orientation: Matrix3 | null; trigger: ShotTrigger }                    // offset：载入变换后的挂点偏移（自动挂点另加抖动）；orientation：炮 +0x28 ≠ 0 时非空
  | { type: 'launch'; family: 'missile'; shooter: EntityId; missile: number; mount: number;
      offset: Vec3; launchByte: 0 | 1 | 2 | 3 | 4; target: EntityId | null; trigger: ShotTrigger }
  | { type: 'steer'; entityId: EntityId; control: ControlBlock }  // 消息 0x40000：在请求处理中经 P3-06 的 0x21fd8 应用
  | { type: 'expire'; entityId: EntityId }                        // 消息 0x10000：弹丸 0x25f48、导弹 0x2b408、碎片 0x256e4
  | { type: 'release-held'; entityId: EntityId }                  // 消息 0x40：0x24424，被持有的来源进入待移除
  | { type: 'hand-off'; entityId: EntityId; fragment: EntityId }  // 消息 0x2000000：0x2574c，entityId 为来源

  type ShotTrigger =
    | { type: 'command'; channel: 'primary' | 'secondary'; commandIndex: number }
    | { type: 'ai'; channel: 0 | 1 | 2 }
    | { type: 'automatic' };
  interface ControlBlock {          // 消息 0x40000 的 12 个字（P3-06 的 0x21fd8 解释）
    scale: number;                  // f32
    axes: readonly [AxisControl, AxisControl, AxisControl]; // 绕第 1、2、3 行
    speedFactor: number | null;     // null = 速度标志清零；否则为速度系数（f32）
  }
  interface AxisControl { clear: boolean; set: boolean; value: number } // value 为 f32；set 为 false 时不读
  ```

  - 发射请求在开火判定处投递，保存当时的挂点、通道与命令身份，弥补消息 8 不带这些身份的缺口（冲突 31）。
  - **开火读取的目标：** 瞄准炮的瞄准、制导导弹的目标要求与导弹请求保存的 `target`，都取该命令处的参照目标。对玩家，与 `target` 命令的参照目标相同（本 tick 先前命令投递而尚未应用的选择优先，否则为玩家目标）；对 AI 机体，为其 `ai.objectTarget`。导弹构造时取请求中的 `target`。原版的扳机读旧目标、构造读消息 2 应用后的新目标（T3、W11），两者只在同一帧既选目标又开火时不同；原版键盘每次轮询至多处理一个键，Core 按命令次序处理，已产生的请求不被后续命令改写（冲突 35 的推荐）。
  - 发射请求与事件 `0x10` 一样受任务流程门禁 `0x339cc` 约束：该门禁的状态由 P3-11 加入，此前总是通过。
  - P3-08 的修订（CR-21）：`steer` 的主体扩展到 AI 机体，并新增 `ai-match-speed`、`warp-departure` 与 `create-transponder`（僚机命令沿用 P3-10 的 `deliver-command`，CB-08）；命令联合新增 `drop-transponder`（CR-20）。

#### CR-06 领域事件与次序（D-01）

新事件都是脱离世界的事实快照，共用 P3-02 的 `{ type, tick }`。不另带 `clock`：时钟恒为 tick × `clockUnitsPerTick`，消费者从 `clock` 分区读取。字段不含名称原文、资源字节或宿主对象，消费者不能依赖按 ID 再查当前实体。比较器的事件字段表随之扩展。

```ts
type Attacker =
  | { type: 'shooter'; entityId: EntityId; kindBit: number } // 命中时仍有效的发射者，或停放交战的射击者
  | { type: 'lost-shooter' }                                 // 发射者已失效：原版以分类掩码 0x93780 代替种类，不计击杀（H4）
  | { type: 'none' };                                        // 碰撞与 AI 范围伤害

| { type: 'target-changed'; tick; playerEntityId: EntityId; previousTarget: EntityId | null; target: EntityId;
    targetKindBit: number; mode: 'enemy' | 'friendly'; origin: 'command' | 'automatic'; commandIndex: number | null }
| { type: 'target-cleared'; tick; playerEntityId: EntityId; previousTarget: EntityId; cause: 'invalid' | 'base-view' | 'warp' }
| { type: 'weapon-selected'; tick; entityId: EntityId; list: 0 | 1; index: number; mount: number | null;
    changed: boolean; commandIndex: number | null }
| { type: 'shot-fired'; tick; shooterEntityId: EntityId; shooterKindBit: number; shooterPosition: Vec3;
    entityId: EntityId; family: 'gun' | 'missile'; weapon: number; mount: number; position: Vec3; trigger: ShotTrigger }
| { type: 'hit'; tick; victimEntityId: EntityId; victimKindBit: number; victimPosition: Vec3;
    cause: 'projectile' | 'missile' | 'collision' | 'area' | 'parked'; sourceEntityId: EntityId | null;
    attacker: Attacker; damage: number; gated: boolean;
    shield: { before: number; after: number }; hull: { before: number; after: number }; shieldWasEmpty: boolean;
    impact: { point: Vec3; local: Vec3; face: 0 | 1 | 2 | 3 | 4 | 5 } | null; projectile: 'ricochet' | 'removed' | null }
| { type: 'object-destroyed'; tick; entityId: EntityId; kindBit: number; source: EntitySource | null; position: Vec3;
    activity: Activity; attacker: Attacker; eventClass: 0 | 1; outcome: 'explodes' | 'delayed' | 'removed' }
| { type: 'explosion-started'; tick; entityId: EntityId; sourceEntityId: EntityId; sourceKindBit: number;
    variant: 'large' | 'other' | 'missile'; position: Vec3; activationClock: number }
| { type: 'missile-ended'; tick; entityId: EntityId; shooterEntityId: EntityId | null; outcome: 'detonated' | 'fizzled';
    position: Vec3; orientation: Matrix3 }
| { type: 'fragment-expired'; tick; entityId: EntityId; sourceKindBit: number; part: number; position: Vec3;
    outcome: 'explodes' | 'escape-pod' | 'wingman-pod' | 'removed' }
| { type: 'source-released'; tick; entityId: EntityId; kindBit: number; fragmentEntityId: EntityId; removed: boolean }
| { type: 'energy-depleted'; tick; entityId: EntityId; kindBit: number; position: Vec3 }
| { type: 'energy-allocation-changed'; tick; entityId: EntityId; shieldLevel: Level; chargeLevel: Level; commandIndex: number }
| { type: 'left-page-changed'; tick; page: 0 | 1 | 2 | 3 | 4 | 5 | 6; previousPage: 0 | 1 | 2 | 3 | 4 | 5 | 6; commandIndex: number | null }
```

| 事件 | 发出时机与语义 |
|---|---|
| `target-changed` | 请求处理中每应用一个 `select-target` 发出一次，对应原版消息 2 的音效项（T1）。目标的清除（失效、停放、Warp 开始、基地视角、被毁视角）原版不给反馈，不发此事件；持续的目标由 projection 给出 |
| `target-cleared` | 只由帧尾的右显示屏清除发出（CR-10）。`warp` 对应原版右显示屏的离开提示 |
| `weapon-selected` | 玩家的选择命令被接受时紧随其结果发出，`changed` 表示当前挂点是否改变（冲突 32，P3-14 的音效 11381）。`commandIndex: null` 是原版在消息循环中处理的无命令选择，即请求处理中对玩家的完全修理（P3-11 的救援）；基地服务步的补弹不发（CB-11）。（措辞由 [FA-06](#fa-06-weapon-selected-的无命令来源) 更正，2026-10-17，P3-14/08） |
| `shot-fired` | 请求处理中构造弹丸或导弹之后发出；主通道也可发射导弹，消费者按 `family` 选择音效 |
| `hit` | 每次原版投递受击表现项（`0x2a40c`、`0x2a5fc`），或停放交战实际施加伤害时，在护盾与船体结算之后、被毁处理之前发出一次。`gated` 为玩家被毁视角门禁挡下的命中（原版仍投递受击项）。受击者已被毁时原版不投递，也不发事件。碎片受击不发事件（原版没有受击项）。`projectile` 为弹丸的结局：跳弹或移除；导弹与其他原因为 null。`shieldWasEmpty` 是原版受击项 +0x0C（受击前护盾 ≤ 0，选择音效槽 3 或 4） |
| `object-destroyed` | 每个对象从存活到被毁只发一次（被毁标志门禁），在 `hit` 之后。`eventClass` 是原版对象事件的类别：攻击者种类为 1 时为 0，否则为 1。`outcome`：停放对象为 `removed`，玩家为 `delayed`，其他为 `explodes`。AI 范围伤害的自爆（`0x6313c`）不置被毁标志，不发此事件 |
| `explosion-started` | 爆炸在请求处理中激活时发出：通常在创建后的下一 tick；在对象更新中创建的（AI 路径）在创建的同一 tick（X9、CR-08）。它是表现层选择 EXPL 并只选一次的依据（CR-11）。位置是激活时、尚未移动的位置，等于构造位置 |
| `missile-ended` | 导弹的到期请求被处理时发出：起爆在爆炸构造与范围伤害之前，熄火在进入待移除时。供 P3-12 的导弹相机（原版 `0x3119c` 只服务玩家的导弹） |
| `fragment-expired` | 碎片的到期请求被处理时发出（X7）。被击落的碎片为 `explodes` |
| `source-released` | 第 0 部件碎片的交接请求被处理时发出。`removed: false` 只出现于玩家：原版不移除玩家对象，只投递隐藏项（高概率，交 P3-12） |
| `energy-depleted` | 能量更新进入耗尽分支且 `depleted` 锁存为 false 时发出并置锁存；之后以能量 > 0 结束的更新清除锁存。原版每次耗尽更新都重复施加锁定与钳 0（D14），事件只在转换时 |
| `energy-allocation-changed`、`left-page-changed` | 紧随被接受的命令的结果发出，对应原版消息 0x100000 的音效 10485 |

P3-08 的修订（CR-22）：新事件 `wingman-command-consumed` 与 `transponder-deployed` 见 CR-22。

**一个 tick 内的次序：** 玩家更新中，命令结果按命令序号发出，`weapon-selected`、`energy-allocation-changed`、`left-page-changed` 紧随所属命令的结果。请求处理中，事件按请求的处理次序发出；一次导弹起爆依次为 `missile-ended`，再按遍历次序为每个受击者发出 `hit`（与可能的 `object-destroyed`）。移动阶段按弹丸的遍历次序发出命中事件。碰撞阶段按两遍的对次序发出，能量阶段按遍历次序。停放交战的事件位于 P3-06 对同一对象的 `object-left-world` 之后。`target-cleared` 在帧尾。同一次伤害中 `hit` 先于 `object-destroyed`。

#### CR-07 实例化扩展与系统流水线（D-01、D-03）

- **实例化扩展点**（P3-06 定稿的次序中，P3-07 的位置）：
  1. 分配与命名之后、最高速度之前：武器块（`0x2d400`）与船体，都不抽取；
  2. 在 `0x3060c` 的位置计算资源、档位与 E、T，再调用 P3-06 的最高速度纯函数（读实时的 E、T 与两位字段 2），然后写 `lastEnergyClock` 与 `nextEnergyClock`（1 次抽取，非机体种类不在此路径）；
  3. 两位字段 0–18 清零；
  4. 玩家状态这一步写 P3-07 的 `targeting`（`enemy`、到期 0）与 `statusDisplay.redraw = true`。
- **对象更新（第 4 行）：**
  - **玩家更新**（活动状态且未被毁）：失效目标清除（P3-06）→ 导弹锁定 `0x2ddbc`（P3-07）→ 速度辅助（P3-06）→ 命令批次（按数组次序，各任务的判定）→ 轴的变化检测（P3-06）→ 自动选敌（P3-07，T3）。原版的开火扳机在 0x20000 投递之后调用，Core 的开火命令在命令批次中按次序判定。玩家更新的请求次序：命令判定中投递的 `select-target` 立即入队；P3-06 的 `control`/`match-speed` 在命令循环之后按命令次序投递（轴并入最后的 `control`）；玩家开火命令的发射请求随后释放（`RequestQueue.defer`/`release`），对应原版扳机在 0x20000 之后（T3）；自动选敌最后；AI 与自动挂点的发射仍立即投递。发射构造只读取发射者的当前速度与位姿，`control` 请求只改指令速度，所以这一次序只影响同一 tick 内的请求与事件次序，不影响状态结果（P3-07/14 定稿，依用户的预先授权）。
  - **自动选敌：** 在时钟严格大于到期时刻时，按原版（[自动选择](../../../original/formats/executable.md#initial-flight-state-p3-0605)、T3）重设到期为时钟 + 0x40；视角不在 0、1、6 与 0x11/8，且玩家目标为空时取最近的敌方并投递 `select-target`（`automatic`），成功时模式写为 `enemy`。这里的“为空”看实际目标，不看同 tick 尚未应用的请求，与原版一致。
  - **按种类的回调：** 导弹（`0x2aa40`/`0x2ab00`）、弹丸（`0x259b0`）、爆炸（`0x23838`）与碎片（`0x24ac4`）由 P3-07 实现。它们取代 P3-02 的通用转换中各自列出的状态；状态 4（被毁源）的实体没有回调，但仍移动（P3-02）。
- **请求处理（第 5 行）：** 处理 CR-05 的新请求；种类 22 的 `set-state` 请求转为爆炸的激活与更新（`0x2409c`，X4）。
- **派发器阶段的接入：**

  | 阶段 | 原版 | P3-07 的部分 |
  |---|---|---|
  | `movement` | `0x221fc` | P3-06 的遍历与筛选中加入 `linear`、`spinning` 两种模式；弹丸（种类 21、状态恰为 7、`hitTest`）在自身移动后立即做命中检测（H3）。导弹以机体移动块经 P3-06 的积分运动 |
  | `collision` | `0x29670`、`0x29934` | 玩家对其他对象、其他对象之间两遍（H6），只对状态 ≥ 7 的对象；伤害除以 (3 − 组)；碎片接触计数是每 tick 的局部量，不持久 |
  | `delayed-player-explosion` | `0x23808` | `delayedExplosionClock` 非空、时钟严格大于它且玩家实体存在时构造玩家的爆炸（X2） |
  | `energy` | `0x30590` | 先玩家（停靠时跳过；不看状态与被毁），后种类 `0xffffe`（停靠跳过；停放者任何状态都更新且无移动块；其他只更新状态 ≥ 7 的），按 D14 |
  | `parked-update` | `0x2f1b0` | P3-06 的停放遍历对每个本次更新的对象，在离开世界（`0x2f314`）之后调用 P3-07 的一个入口（CR-09） |
  | `frame-end` | 帧渲染中的规则推进 | 驾驶舱显示步（CR-10），在 P3-09 以后加入的项之后、按原版仪表的绘制次序 |

- **对象集合（`0x2ede0`）：** P3-07 的规则不读（C4），维持 P3-06 修订的说明。P3-08 的修订（CR-23）：P3-08 接入其重建、实例化扩展点的选择与对象更新中的 AI 控制器，见 CR-23。

#### CR-08 直接创建与对象生命周期（D-01）

- **创建位置：** 弹丸与导弹只在请求处理中由发射请求创建。爆炸与碎片还在以下位置**直接创建**，不经请求：请求处理中（导弹起爆、碎片到期爆炸）、移动阶段（弹丸命中致死）、碰撞阶段（碰撞致死）、延迟玩家爆炸阶段，以及对象更新中（P3-08 的 AI 范围伤害）。这修订了前文“所有创建只在请求处理中”的概括。
- **首次更新、激活、首次移动与移除（X9）：** 新实体按 P3-02 的约定为“表现就绪”，在下一 tick 的自身更新中首次回调。
  - 爆炸在该次请求处理中激活并于同 tick 首次移动；碎片在首次回调时设到期，并在该 tick 进入活动、首次移动；弹丸与导弹首次回调即请求活动，不等表现。
  - 移动阶段的遍历遇到本 tick 新建的更高种类位实体时，因其状态为新建而不移动它。
  - 对象更新中创建的实体（AI 路径）在同一遍历中首次回调。原版碎片在此路径晚一 tick 激活，记为差异（冲突 21）。
- **来源的移除（X4、X7）：**
  - 产生碎片的机体由第 0 部件碎片在其首个活动回调中交接：来源在下一次请求处理中进入待移除，被毁后第 3 tick 离开。玩家是例外，原版不移除玩家对象，玩家停在状态 4 直到救援。
  - 被爆炸持有的来源在帧序号首次达到帧数时进入待移除，再过一 tick 离开：n₁₂ = 12 时为激活后第 28 tick，n₃ = 6 时为第 14 tick。
  - 爆炸自身在激活后第 49 tick 请求移除，第 50 tick 离开。
  - 区域检查若在交接前移除第 0 部件碎片，来源会停在状态 4 直到拆除。照原版实现，不另加处理（冲突 20，高概率罕见）。
- **碎片：** 被击落的碎片不直接移除，在下一 tick 转为爆炸（冲突 13）；大型来源的碎片不到期（冲突 19）。
- 所有移除仍经状态 6 与自身的下一次更新提出离开（P3-02）。

#### CR-09 与 P3-06 的接口（D-03）

| 接口 | P3-06 提供 | P3-07 的部分 |
|---|---|---|
| 移动阶段 | 遍历、筛选、`craft`/`warp` 的分派与积分 | `linear`、`spinning` 的变体、构造与运动函数（CR-03），以及移动后立即调用的弹丸命中检测；碰撞是其后的独立阶段 |
| 浮点操纵 `0x21fd8` | 规则函数（含扰动的抽取） | 导弹：无制导导弹在阶段 0 直接调用（全油门、不转向）；追踪导弹经 `steer` 请求，在请求处理中应用（P3-07 是该请求类型的首个投递者，H5） |
| 导弹的移动块 | `0x21794` 的模式 0 构造（按给定油门） | 构造时以油门 0（制导）或满油门（无制导）调用；制导导弹再按 `0x21a3c` 把速度与指令速度设为 min(导弹最高速度, 发射者速度)，置到达标志，并按参考最高速度重算速度比（P3-07 的写入者，P3-06 的移动块已列出） |
| 共享的转向模块 | — | P3-07 建立 AI 转向库中导弹使用的子集，作为共享的 Core 规则模块：目标点与提前量模式 3、两个限幅 atan2 的比例、控制块输出、期限算术与热寻的放弃。P3-08 在其上扩展 AI 机体所需的部分，不另建 |
| 最高速度 | 纯函数 `0x30e0c` 与 `0x21d88` | 在 `0x3060c`（实例化、导弹）与档位改变时用实时的 E、T 与两位字段 2 调用；档位改变后再调用 `0x21d88`；受损不重算（D6）。P3-07 的能量状态接入后，玩家的 `speedLimitStatus` 为 `'live'` |
| 速度能耗 | 移动块的 `commandedSpeed` | 玩家能量更新读 trunc(指令速度)；没有移动块时读 trunc(机型 +0xB8)（D14） |
| 写入移动块 | 积分与操纵对这些字段的消费 | 锁定 `0x21ba0`（能量耗尽，每次耗尽更新都重设并把指令速度清零）、扰动 `0x21bd4`（子系统 7，等级 2 时 3 次抽取）、碰撞的击退与翻滚 `0x29eb8`/`0x2a12c`（每次接触 6 次抽取，`0x2a12c` 只写第一方）、导弹爆炸的震动 `0x2b628`（6 次抽取，种类不在 `0xf9c7c` 时）。都只作用于机体移动块 |
| 停放更新 | 遍历、资格、节奏抽取、经过时间（含活动期间，停放时不重置）、作弊 ×8（Core 中恒不成立）、Warp 门禁与离开世界 | 每个本次更新的对象在 `0x2f314` 之后调用一次 P3-07 的停放交战入口：`ai.mode` = 1 时为多目标 `0x2ffec`，否则为 `0x30150`（E1–E3）。入口读 `ai.mode`、`ai.target`、`ai.objectTarget`、`formation.leader` 与 `ruleInputs.aiValueB`（+0xE0），写 `ai.objectTarget`（多目标）与双方的 `nextEnergyClock`；经过时间 ≥ 2³² 为 Core 故障（约 777 天，不可达）；炮伤害合计按 i32 回绕 |
| 区域检查 | 种类 `0x1f00000` 离区直接待移除 | 覆盖 P3-07 的四种运行时种类 |
| 玩家目标 | 字段、失效清除、停放清除、移除时清除 | 选择命令、自动选敌与帧尾的右显示屏清除；Warp 开始的清除归 P3-09，进入基地视角的清除归 P3-10，进入被毁视角的清除归 P3-11 |
| 自动驾驶取消 `0x27edc(0)` | 自动驾驶延至 P4（G-09），Core 没有其状态 | 原版在玩家对机体的每次接触处理末尾调用（H6）。P3 中此调用没有可写的状态，不执行；P4 接入自动驾驶时在这一位置加入，由自动驾驶的负责任务定其状态与应用阶段 |
| 模式 3 | Warp 开始写入 | P3-07 不写（H1，P3-06 已确认） |

#### CR-10 帧尾的驾驶舱显示步（D-01）

原版有两处规则状态由驾驶舱仪表的绘制写入（T7、D9）。Core 在 `frame-end` 阶段以固定条件重现它们，不读渲染器、视口或像素。

- **仪表所在的视角：** 只在视角模式为 0xC、0xD、1 或 6 时执行。它们的布局含左右显示屏（仪表类型 6、7）：布局 0、5，以及基地内部的 10097 槽 0。依据是帧渲染 `0x3ee58` 只在视角模式 1、6、8 与 0xC–0x12 时调用 `0x49b2c`，后者按类型升序执行所选槽的仪表记录，而类型 6、7 只出现在布局 0、5（已确认，代码与数据，[cockpit 的槽内仪表类型](../../../original/formats/cockpit.md#instrument-types-per-slot-confirmed-p3-0730)，P3-07/30）。每个槽中类型 7（右显示屏清除）都在类型 6（状态显示）之前，与本节的步序一致。
- **右显示屏的目标清除（T7）：** 玩家实体存在、玩家目标非空时，目标不可解析 → `invalid`；视角模式为 6 → `base-view`；目标的 `inWarp` 为真 → `warp`。三者都把目标清为 null 并发出 `target-cleared`。原版按仪表周期调用，Core 每 tick 判定（差异见 CR-11）。
- **状态显示写字段 1、5、8（D9，冲突 5 的方案 A）：** 条件是玩家实体存在、左页为 0、玩家的子系统 10 ≠ 2。按下列次序执行：
  1. 时钟严格大于 `blinkDueClock` 时翻转 `blink`，令 `blinkDueClock` = 时钟 + 0x20，并记本次已翻转；
  2. 已翻转或 `redraw` 为真时，按 D9 写玩家的子系统字段：1 由船体比例与 `blink` 决定，5 为列表 1 的挂点状态，8 为列表 0 的挂点状态；然后清除 `redraw`。

  子系统 10 为 1 时原版按表现随机闪烁地暂停刷新，Core 忽略这一闪烁，照常刷新（差异）。护盾叠加图只用于显示，不进 Core。

#### CR-11 表现层的归属与已批准的差异（D-01）

下列原版行为与 P3-07 spec 原先的推荐不同，依研究结论（冲突 14、15、5、6）按推荐方案定稿：

- **归表现层（P3-12、P3-14）：**
  - EXPL 选择：建造期 EXIC 子集、每次激活时的项，以及变体 2 按相机距离改用列表 1；
  - 额外爆炸（`0x23fdc`）：数量、相机偏移与激活延迟；
  - 事件 `0x10`：屏幕门禁，与判别值 1、2 的碎片及其到期再爆炸；
  - 闪光（`0x24314`）。

  表现层以 `explosion-started`（来源、来源种类、变体、位置、激活时钟）与 Render State 驱动，用自己的相机与随机源。Core 由此不需要逻辑相机或视口状态：研究证实目标、雷达、开火、AI、能量、区域检查、生成与主流程都不读相机（C1）。
- **表现层的单次选择（交 P3-12、P3-14 的契约，不在 Core）：** P3-12 拥有一个会话级选择者，P3-14 只读它的结果：
  - 世界创建后、首次爆炸激活之前，按 X8 为三张列表各选一次子集（原列表序号的序列，保留次序与重复）；
  - 每个爆炸 ID 在其 `explosion-started` 上只选一次，结果为 `{ list: 1 | 2 | 3; item: number }`，`item` 是原始 `ExplosionTable.lists` 的序号，不是子集下标。变体 `large` 取列表 1，`missile` 取列表 3，`other` 按选择者自己的相机距离取列表 2 或 1（X4）；
  - 动画与音效读同一个结果，缓存到该爆炸离开 Render State；结果随会话丢弃，重试时重新选择；
  - 使用表现层自己的随机源，不取 Core RNG；同一 replay 的两次播放不要求得到相同的选择。
- **已批准的差异（写入 Core 模块说明与对照结论）：**
  1. 上述效果的抽取不在世界 RNG 中，产生的对象不在实体表中。Warp 出口的最近对象搜索（`0x2bf08`，P3-09）因此看不到它们，实体预算与原版不同。在原版，这些效果只经对象表、一次到期再爆炸、该搜索与共用 rand 影响规则（X10）。
  2. 原版的规则与表现共用一个 C 随机数生成器，雷达、显示屏、仪表与 HUD 每个渲染帧都抽取（冲突 6）。Core 只复现规则抽取的支持集与条件概率（P3-02 的随机模型）；表现的随机放在 Core 之外（[总计划 §5](../../master-plan.md#5-状态管理与通信约定)）。
  3. 结果对规则没有影响的抽取不在 Core 中执行，例如爆炸首次回调中非机体来源的模式 0 事件抽取（X4）。
  4. 状态显示步忽略子系统 10 为 1 时的闪烁暂停，只在固定的视角集合中运行；右显示屏的清除每 tick 判定，而原版按仪表周期判定（CR-10）。
  5. AI 路径上创建的碎片早一 tick 激活（冲突 21）。
  6. 追踪导弹的接触对象初始为空，原版可能是旧值（冲突 41）。
  7. 雷达接触点至多 120 项（含目标框），不复现越界写入（冲突 4）。
  8. 开火、选目标、选武器与能量命令只在飞行上下文处理。原版在地图、Warp 与基地中仍按设备读到的最后一个主扳机电平开火（[输入轮询](../../../original/formats/executable.md#input-polling-p3-0201)），Core 与 P3-02、P3-06 的上下文屏蔽一致。
  9. 挂点的 `lastShotClock` 初值为 null：原版为 0，但原版时钟从一个随机的较大取样值起算，首发实际上从不被冷却挡住；Core 的时钟从 0 起，若以 0 为初值，开局几 tick 会被冷却挡住。
  10. 两种保留跨调用“已尝试”标志的挂点链排列在创建时拒绝（CR-01）。
- **原版常量（冲突 29，已由运行时读数确定）：** 无制导导弹的引信检查间隔取决于线性地址 0x2C 处的 f32。P3-07/09 在基准配置的飞行中读得 0xF000CE80（INT 0Bh 向量），按 f32 小于 150.0，取减半的间隔（已确认，运行时，仅限所测配置；[executable 的 H5](../../../original/formats/executable.md#h5-missiles--confirmed-code-unless-marked)，P3-07/31）。实现与测试仍按两种结果参数化，生产取值为减半；26 在正式运行中复核。

#### CR-12 Projection 与 Render State（D-01）

- **`flight.combat`**（P3-06 定的 `flight: { motion, combat }` 中的战斗组）：

  ```ts
  type FlightCombat = { readiness: 'not-implemented' } | { readiness: 'ready'; player: CombatPlayer | null }; // 无玩家实体时 player 为 null
  type FlightResourceName = 'energy' | 'shield' | 'charge' | 'hull' | 'spare-power';
  type WeaponRecordReference = { asset: AssetId; family: 'gun' | 'missile'; index: number }; // asset 为 craftInfo 的 Asset ID
  interface CombatPlayer {
    entityId: EntityId;
    destroyed: boolean;                 // 被毁标志：被毁视角与救援前
    targetMode: 'enemy' | 'friendly';
    target: CombatTarget | null;        // 右显示屏读取的目标信息（T7）
    radar: { status: 0 | 1 | 2; contacts: readonly RadarContact[] }; // status 为子系统 12；为 2 时没有真实接触点
    resources: Readonly<Record<FlightResourceName, ResourceReading>>;
                                        // {current, maximum}：能量 / c54、护盾 / c5C、充能 / c74、船体（原始值，可为负）/ c9C、剩余功率 E / T（D16）
    allocation: { shieldLevel: Level; chargeLevel: Level };
    weapons: readonly [WeaponListReading, WeaponListReading]; // 列表 0（主武器）、1（导弹）
    lock: { level: 0 | 1 | 2 | 3 | 4; losing: boolean; progress: number }; // progress 按 0x2e080（W8）
    subsystems: readonly SubsystemState[]; // 19 项
    leftPage: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  }
  interface CombatTarget {
    entityId: EntityId; kindBit: number; name: NameReference;
    position: Vec3; orientation: Matrix3;
    distance: number;                   // f32：f32 坐标差的欧氏距离（双精度开方，T7）
    speed: number | null;               // 目标移动块的速度；没有移动块时 null
    shield: ResourceReading | null;     // 机体为 {护盾, c5C}，其他 null
  }
  interface RadarContact {
    entityId: EntityId;
    offset: Vec3;                       // f32：接触点位置减玩家位置。屏幕投影由 P3-13 按其相机完成（冲突 3）
    class: 'friendly' | 'hostile' | 'marker'; // 导弹按发射者（可解析时）分类，否则为 hostile；marker 为 P3-09 的种类 0x2000000
    missile: boolean;                   // 闪烁标志
    near: boolean;                      // 曼哈顿距离截断为 i32 后 < 600
    target: boolean;                    // 是玩家目标（其后有目标框）
  }
  interface WeaponListReading {
    index: number; mount: number | null; weapon: WeaponRecordReference | null;
    ammunition: number | null;          // 导弹项：从当前挂点起交替链上的弹药之和（0x2dd04）；炮为 null
    damage: 0 | 1 | 2 | null;           // 当前挂点的损伤
    status: 0 | 1 | 2;                  // 列表的挂点状态（0x2e438、0x2e264）
  }
  ```

  - **雷达（T6）：** 接触点取种类 `0x21fffff` 中不处于停放、状态为 4 或 ≥ 7、有移动块、不是玩家的对象，按遍历次序。每加入一个真实接触点后计数；接触点是玩家目标且计数 < 120 时，再计入一个目标框。计数达到 120 时停止（项目上限）。子系统 12 为 1 时的随机噪点由 P3-13 绘制。
  - 雷达的重建节奏（每 6 单位）与绘制只属于表现层。
  - 读取不改变状态、不抽取随机数。
- **Render State：** 增加 `clock`（任务时钟）；每个实体增加 `hitShimmerStart`（机体的 `hitFeedbackClock`，其他种类为 null）与 `explosionStart`（爆炸的 `activationClock`，其他种类为 null）；表现判别使用 CR-02 的新联合；被毁源在移除前照常列出。受击闪烁与屏幕闪光的条件（玩家、被毁视角、目标 Warp 中）由渲染器按原版判断。

#### CR-13 其他任务在 P3-07 规则中的调用点（D-03 之外的接口）

下列调用位于 P3-07 规则的固定位置，由负责任务在实现时插入静态调用，并递增 `rulesVersion`。P3-07 不建空函数或待处理标志代替它们。跨 tick 的状态由消费任务自己拥有（C3），例如任务内子状态、到期时刻与无线电队列。

| 原版调用 | 位置（P3-07 规则） | 负责任务 |
|---|---|---|
| `0x3c208` | 伤害入口：护盾结算后，攻击者种类 ≠ 0 时；`0x2a5fc` 结算后船体 ≥ 0 时 | P3-10（含其抽取；第 1 步 `0x38f20` 写友伤累计，P3-08 只读，见 [CR-27](#cr-27-友伤累计的分工d-03)） |
| `0x3c0f4` | 被毁：置被毁标志之后、对象事件之前；`0x2a5fc` 结算后船体 < 0 时 | P3-10 |
| `0x6977c` | 被毁：`0x3c0f4` 之后，同一阶段立即处理（计数与触发可安排生成） | P3-11 |
| `0x32d74` | 种类 1 被毁：爆炸构造之前（被毁视角会清除玩家目标） | P3-11 |
| `0x32dec` | 种类 2 被毁：停放判定与爆炸构造之前 | P3-11 |
| `0x33464` | 玩家能量更新的耗尽分支，钳 0 之后 | P3-11 |
| `0x32e14(1)` | 玩家逃生舱到期：清除 `followedEntity` 之后，舱进入待移除之前；同一 tick 其余阶段看到救援后的玩家（C3） | P3-11 |
| `0x339cc` | 发射请求的处理 | P3-11 |
| 救援 `0x67b98` | 调用 P3-07 的 `0x2d400` 与 `0x3060c`（只重置它们写的字段），以及 P3-10 的 `0x39820` | P3-11 |
| `0x39820`、`0x398ec` | 基地修理与补弹，使用 P3-07 的挂点修理与选择函数 | P3-10 |
| AI | 开火入口（CR-05）、转向模块（CR-09）、`ai.objectTarget`、`proximity`、`lastVictim`、`lastAttacker`；范围伤害 `0x6313c` 调用爆炸构造与 `0x2a5fc` | P3-08 |

#### CR-14 容量、快照与版本（D-01）

- **事件与请求的上界：** 07 的完成证据按代码路径给出每 tick 的上界公式，其中 `hit` 有二次项：导弹起爆与范围伤害对范围内每个机体一次、碰撞的 A 组 × 活动机体、停放多目标的候选数。
- **上限的处理（`CORE_LIMITS`）：**
  - `eventsPerTick` 由 4,096 改为 32,768。
  - 新增 `requestsPerTick` = 16,384，请求队列改用它，不再借用事件上限。
  - 超出时仍按 P3-02 锁存故障、不发布部分输出。它们是项目的防失控预算，不是原版上限（原版没有上限）。
  - **取值依据：** 按宽松的切片规模同时取最坏值，代入 07 的上界公式（记号同 07）。规模：机体 Ct = Ca = 32，A 组 24，挂点 M = 256，命令 K = 64，同时开火链 L = 4，存活弹丸 512、导弹 32、碎片 256、爆炸 64；同 tick 被毁、起爆与 AI 范围伤害各 ≤ 32，到期或击落的碎片 ≤ 256，交战的停放对象 32 个且各 ≤ 32 个候选。

    | 项 | 上界 |
    |---|---|
    | `hit` | 512 + (32 + 32) × 32 + 2 × 32 + 256 + 2 × 24 × 32 + 32 × 32 + 32 = 5,472 |
    | `shot-fired` | M + K × L = 512 |
    | `explosion-started` | 32 + 32 + 32 + 256 + 1 = 353 |
    | `fragment-expired`、`source-released` | 各 256 |
    | `object-destroyed`、`energy-depleted`、`missile-ended` | 各 32 |
    | `target-changed`、`target-cleared` | 65、1 |
    | 每条命令至多一个的附加事件（`weapon-selected`、`energy-allocation-changed`、`left-page-changed`） | 64 |
    | P3-07 合计 | 7,075 |
    | P3-02、P3-06 的项（命令结果、P3-06 的附加与辅助事件、`object-instantiated` 按 `spawnExpansion` 计、`object-left-world`） | 64 + 64 + 1 + 1,024 + 32 = 1,185 |
    | 总计 | 8,260，新上限约为其 4 倍 |

    请求：`select-target` 65、发射 512、每个存活对象自身更新的请求至多 2 个（爆炸的状态 6 有释放与离开，第 0 部件碎片可有交接与到期）共 2 × 896 = 1,792、`steer` 64，加上 P3-02、P3-06 的生成请求 1,024 与速度请求 66，合计 3,523，新上限约为其 4.6 倍。
  - 在实体上限下，二次项没有固定的上界，超出预算即故障。原版没有对应的规则上限，这不改变切片的行为。
  - 其他上限不变。快照在实体上限下仍在 `canonicalTextLength` 之内：机体数受 `spawnExpansion` 限制（≤ 1,024），每个机体含 18 个挂点时约 8.5 KiB；其余实体约 2 KiB；合计约 10.5 MiB。
  - 录制上限不变。录制在每个 tick 之前要求还能容纳一个 tick 的 `eventsPerTick` 个事件，所以可用的事件总量由 524,288 − 4,096 变为 524,288 − 32,768 = 491,520，约少 6%。所选任务一次运行远短于 `recordedTicks`（68 分钟），战斗中每 tick 的事件通常为个位数；超出时按 P3-02 在执行下一 tick 之前原子拒绝。
  - 单 tick 的二次工作量（命中检测、起爆、碰撞、停放多目标）受实体上限约束，不另设上限。
- **快照：** 覆盖 CR-02 至 CR-04 的全部新状态（实体的 `combat`、移动块的新变体、表现选择器、玩家状态的新字段）；静态规则数据不进快照。快照格式版本与 `RULES_VERSION` 相对实现时的当前值各递增一次，不硬编码数字；P3-07 的 goal 在其分支上由首个实现共享形状的子任务递增，此后该 goal 内的规则变化沿用这一版本。
- **replay：** 新输入经 setupHash 绑定，`ReplayContent` 是调用输入而不是记录字段，所以 replay 记录形状不变，格式版本不变。旧规则版本的记录一律拒绝。

### P3-05 的契约修订（速度档位命令）

本节由 [P3-05 子任务 10](../05/subtasks/10-speed-preset-spec-sync.md) 加入（2026-10-10，经用户批准，见[审批](#审批)），落实已批准的 [P3-05 速度档位命令](../05/spec.md#速度档位命令)。单一的 `select-number` 不能同时表达原版的两种数字键：未按 Shift 的数字在通讯菜单或基地中选择项目、在普通飞行中无作用；Shift+数字在普通飞行中选择速度档位，在通讯菜单打开时可能仍然有效。前文（含[输入与命令](#输入与命令)的命令表与 [P3-06 的契约修订](#p3-06-的契约修订检查点-a) D-04）与本节不一致时以本节为准；P3-02 与 P3-06 既有的 goal 与 subtask 是历史记录，不改写。

- **命令联合：** 新增 `{ type: 'speed-preset', level: 1–9 的整数 }`，即原版 Shift+n 的第 n 个固定档位（Shift+1 等同归零；原版 Shift+0 仍由 `speed maximum` 表达）。校验与其他变体相同：字段缺失或多余、非整数、NaN/Infinity、越界均为 `CoreInputError`，世界与录制不变。效果由 P3-06 的档位规则给出，门禁与结果同速度命令（飞行上下文处理；Warp、基地、地图为 `ignored`/`wrong-context`；玩家不可用为 `ignored`/`player-unavailable`）。通讯菜单打开时是否生效按 P3-05 Q-04 的原版结论。
- **`select-number`：** D-04 中“普通飞行的 `select-number`（n 等于原版 Shift+n 的速度档位）”由 `speed-preset` 取代。`select-number` 的默认飞行处理不再改变速度，结果为 `ignored`/`wrong-context`；尚未实现的基地、地图等处理仍为 `rejected`/`not-implemented`；它在通讯菜单与基地中的含义不变，菜单优先级由 P3-10 在 Core 中加入。输入层按物理修饰键选择命令，不读取通讯 projection 来决定数字键产生哪个命令；`speed-preset` 与菜单数字保持不同的命令。
- **版本：** 命令解释与录制允许的输入形状都改变，`rulesVersion` 与 replay 格式版本（`GAME_REPLAY_VERSION`）相对实际集成基线各递增一次（P3-05 分支上为 P3-06 集成后的 2 与 1；合入 main 时 P3-07 已把 `rulesVersion` 递增为 3，合入后为 4 与 2，见[审批](#审批)的合入说明）；D-07 的“replay 格式版本不变”只描述 P3-06 的修订。snapshot 形状不变、不递增其格式版本，但绑定新的 `rulesVersion`。旧录制在任何 tick 执行前因版本不符被拒绝，不迁移、不解释成新绑定。

### P3-08 的契约修订（D-01）

**状态：已获用户批准（2026-10-15，D-01）。**

本节由 P3-08 的子任务 08 起草（2026-10-14），定稿 [P3-08 spec](../08/spec.md#实施关卡) 的关卡 D-01（共享 Core 契约）。它建立在 P3-06 检查点 A、P3-07 的 CR-01 至 CR-14 与 P3-05 的修订之上：那些修订已定的项不变，本节只增补 P3-08 的部分；前文与本节不一致时以本节为准。编号 CR-15 至 CR-25 只供引用本节，接续 P3-07 的编号。

原版事实只记在 [ai](../../../original/formats/ai.md) 与 [executable 的 AI (P3-08) 一节](../../../original/formats/executable.md#ai-p3-08)等 original 文档中，下文用其小节标签（ai §1.1、A12、WB2、D5、X2 等）引用，不重复。定稿依据是 P3-08 子任务 01 至 07 的完成证据，尤其是 [07 的“交 08（D-01）的输入”](../08/subtasks/07-research-consolidation.md#完成证据)。

**不在本节（D-03，P3-08 的子任务 09）：** 友伤累计的分工（CR-27）、关键字表等解析数据的导入（P3-03，CR-26）、僚机命令与回复的接口（CR-28）、对象集合与地图可见标志的分工（P3-09，CR-29）、`b` 的物理绑定（P3-05，CR-30）。本节只定稿它们依赖的 Core 形状（CR-19 的解析缓存与累计的读取、CR-18 的命令单槽、CR-20 的命令），并在相应位置写明前向引用。D-03 的定稿见 [P3-08 的跨任务修订（D-03）](#p3-08-的跨任务修订d-03)，它修订本节的若干条目（见该节末尾）。

**与 P3-10 的 D-01 对齐：** P3-10 的“P3-10 的契约修订（D-01）”（CB-01 至 CB-19）已获用户批准，起草时在分支 `p3-10-comms-base-resupply-spec`（提交 55c90ffe）上，2026-10-15 已合入本分支（见[审批](#审批)的合并说明）；下文按名称引用其 CB 条目。重叠处只有一份定义，本节依赖它们：

| 项 | 定义所在 | 本节的部分 |
|---|---|---|
| 命令投递（消息 0x100） | CB-08 的请求 `deliver-command` {receiver, code, sender, commandIndex}（接收者也可能是基地），与 CB-13 的 `command-delivered` | 不另建请求；P3-08 只消费僚机的单槽（CR-18、CR-22） |
| 命令单槽 +0x184 | CB-04 的 `AiState.pendingCommand`（与 CR-18 同名同形）；基地的消费 `0x3bed0` 归 P3-10（CB-12） | 僚机的消费 `0x614a8`、`0x61f20`（CR-18） |
| 友伤累计 | CB-05 的 `WorldState.ai.friendlyFire`（与 CR-19 同名同形）；CB-12 让 P3-10 在 `0x3c208` 第 1 步实现写入 `0x38f20` | 读取 `0x38fd8`（CR-19）；写入归 P3-10（D-03，CR-27） |
| 回复 `0x38d54` | CB-06 的 `queueLine(context, speaker, type)`：抽取、查表、入队并发出 `radio-queued` | 消费者在原版的回复位置调用它（CR-22），不另建回复事件 |
| 完全修理 `0x39820` | CB-10 的 `fullRepair(context, entity, inRequestHandling)` | 僚机行为 3 的到达 `0x61bd0` 以 `inRequestHandling` = false 调用（CR-23） |
| 尾随警告 `0x4ef9c` 的 AI 条件 | CB-09、CB-17 决定 11 | CR-16 的只读查询 `isClosingMissileLock` |
| 种类 `0x4000` 的运行时构造 | CB-18 移交 P3-08，并改写 CR-02 的 `craft` 行 | CR-20 |

**依赖：** P3-08 实现命令消费、回复、友伤读取与 Xpon 构造的子任务直接使用已合入的 CB 定义，不另建，不得各留一份定义（D-03 的 CR-28）。

**与 P3-09 的 D-01（合并说明，2026-10-15）：** P3-09 已合入本分支，其“[P3-09 的契约修订（D-01）](#p3-09-的契约修订d-01)”在本节之后。MW-02、MW-06 定义的 `WorldState.objectSets`、实体的 `mapVisible` 与共享揭示函数（`0x2ee60`）是唯一定义，按 MW-16 由 P3-08 复用；CR-19 中的 `WorldState.ai.objectSets` 与 `mapVisible` 与之同形但位置不同，按上文“重叠处只有一份定义”以 MW-06 为准；CR-19 正文已由 D-03 调整（CR-29）。CR-25 的版本递增相对合并后的当前值，不沿用起草时的数值。

**记法与通则（沿用 P3-07 一节的记法）：**

- f32 字段都是 `Math.fround` 的不动点且有限；i32 字段为 [−2³¹, 2³¹) 内的整数，运算按原版 i32 语义（ai §12、executable 的 [Numbers and draws on the AI paths](../../../original/formats/executable.md#numbers-and-draws-on-the-ai-paths-p3-08-q-12)）。
- **时钟字段**是任务时钟单位（1/64 秒）的安全整数，原版为 u32。原版的期限相加按 32 位回绕，游戏中不可达；Core 不复现回绕（P3-02 的时钟契约），期限与时钟之差超过 2³² − 1 时为 Core 故障（约 777 天，不可达）。比较的有无符号与严格性逐条按 Q-12 的汇总，不统一套用。创建时检查保证切片支持集中的加数非负（CR-15），因此 Core 的期限都 ≥ 0，例外在字段处注明。
- **采样**指本 tick 的 `world.clock`（原版每帧的时钟采样 `0x186414`）。Core 的规则从 tick 1 起执行，此时时钟 ≥ 2，因此以 0 为初值的“每采样一次”缓存不会误命中（原版采样在任务中远大于 0）。
- 实体引用都是 `EntityId`，被移除后按 ID 查不到，即原版的无效句柄；原版的“计数引用”不阻止移除，Core 不另建引用计数。访问器“查不到即清空字段”的原版行为（WA1 的 `0x62144`/`0x62194`、A3 的重读）在读取点照原样执行，快照保存未清空的原值。
- 违反类型或约束的值为 Core 故障。新状态都由 Core 拥有，进入快照规范文本与状态哈希；标为“静态”的由 setupHash 绑定的输入决定，不进快照；标为“不持久”的只在一次调用内存在。
- **f32 任务时间 t：** AI 路径中唯一读取浮点秒的是僚机攻击航线 `0x63c00` 的摆动（第 1 阶段的尾部，[WA7](../../../original/formats/executable.md#wa7-attack-pass-0x63c00-wingman-b-01-opcode-1101--confirmed-code)）：行 1 的值 := F(值 + cos(t × 2.0 × 3.1415927 ÷ P) × M)，钳到 [−1, 1]。原版的 t 是 `0x25894` 每帧写入的 `0x18641c` = F(原始计数 × 1/64)，即**绝对**采样的秒数，不是控制器或攻击航线的相对时钟（[时间基准](../../../original/formats/executable.md#simulation-time-base-p3-0106)）。Core 读 P3-06 已有的同一个值：`MotionStep.time` = `Math.fround(world.clock / 64)`（本 tick 的时钟，在 `clock` 阶段之后、对象更新之前已确定；时钟 ÷ 64 在 2⁵³ 内精确，唯一的舍入点是 f32 写回），单位为秒，不另存状态、不进快照。余弦参数由 f32 的 t、P 与代码常量在 x87 双精度中形成，FCOS 后乘 M、与 f32 的值相加，再 F 写回并钳位；中间舍入点按 WA7 的原生指令逐项实现。原点不同的后果与取舍见 CR-24 决定 15。
- 置信度：形状所依赖的事实为已确认（代码或代码与数据），除非标注“高概率”。

#### CR-15 AI 输入、支持范围与创建时检查（D-01）

- **输入：** 仍是 CR-01 的 `aiPrograms`（`data/ai-programs`，setupHash 已覆盖完整内容），不另建输入。D-03 在同一 Asset 中加入四张关键字表（CR-26）；Core 只按本节的规则读取。另外读取 `MissionSetup`（声明、编组、僚机选项）与 `craftInfo`。原版还读两个当前逻辑内容没有的字段：选择 flag 与份额的波次模式字都是 SCEN 头部 +0x0C（切片为 0），地图可见标志 +0xD4 的基础值是源记录 +0x7C。D-01 的形状按“头部 +0x0C = 0”定稿；D-03 核对：二者的非零值都已由现有导入拒绝，Core 按 0 使用，不补入字段（CR-26；+0xD4 的基础值见 MW-06、CR-29）。
- **定稿的支持范围**（[ai §10](../../../original/formats/ai.md#10-support-closure-of-the-slice-p3-0801)，已确认，代码与数据）：
  - 组表程序记录：TABL 6003 的记录 {0, 1, 2}；记录 3、4 只会部分匹配且任一起点都先遇到完全匹配，对切片的每个对象都不可达。
  - 执行的 DFPG：{6031（记录 0、1），6013（记录 2）}；6025 只被记录 4 引用，载入但从不安装或执行。
  - 执行的脚本：上述两个 DFPG 的 +0x38 与六份列表所引用的 17 个脚本（ai §10.2 的清单），100 个条目。
  - 支持的操作码（25 种）：100、104、106、107、111、200、210、211、222、231、232、240、300、301、400、401、402、1000、1001、1002、1003、1101、9500、9999、10000。
  - 关键字表（3 张）：操作码 231 的 `0x5ea40`、300 的 `0x5ea60`、301 的 `0x5ea98`；403 的 `0x5eac8` 不需要。
  - 内置记录：AI 选择可达 {4, 5}（僚机）与 {6}（基地）；{1, 2} 为追踪导弹，已由 P3-07 实现，行为不变。记录 0（自动驾驶，G-09，P4）不属于 AI 闭包；记录 3、7、8、9 不可达。
  - 处理器：表程序的解释器 `0x64cb8`、僚机 `0x610c8`、基地 `0x62c10`，以及停放处理器 `0x62250`（不是记录的处理器，由停放分派调用）。
- **处理器身份：** 内置记录的处理器是 CR-01 已有的不透明 `CodeIdentity`。Core 持有“支持的身份 → 实现”的代码常量映射：`0x610c8` → `wingman`，`0x62c10` → `base`（以及 P3-07 已有的导弹处理器）；身份按 LE 对象号与偏移相等比较，不从数值推导规则。表记录的处理器在载入时被改写为 `0x64cb8`（ai §6），Core 不读其存储值，一律分派到 `interpreter`。`0x62250` 是代码常量，不出现在内容中。
- **运行可达性（创建时计算，不抽取随机数）：** 只对本次世界配置计算有限的保守闭包：
  1. **对象来源：** 直接与延迟的声明、编组成员和配置所选的僚机选项（不选择的僚机不计入；交付验证仍分别覆盖五个名单项与无僚机，P3-08 的 AC-02）。
  2. **选择：** 对每个来源，用其缺省后的种类、运行时 +0xDC 与 \|+0xE0\| 和 flag（SCEN 头部 +0x0C），按 `0x5dbc8`/`0x5de18` 枚举**全部**起点 s ∈ [0, count) 的结果，取并集。依据：选择对每个对象只发生一次，+0xDC 只由分配器与实例化写，+0xE0 只在选择之后由 `0x5e4d0` 改写，停放/恢复/救援的重装沿用同一 +0x10 而不重选（ai §1 的 *Once per object* 与 *Removal and reinstallation*）。不在选择掩码中的种类（玩家、种类 `0x4000`、运行时种类）没有程序。
  3. **运行时创建：** 种类 `0x4000`（`b` 与僚机投放，CR-20）不安装程序；导弹只经 `0x2ab00` 得到记录 1、2（P3-07）。
  4. **闭包：** 可达表记录的 DFPG，其 +0x38 与全部六份列表的全部脚本（不按状态可达性再筛），以及这些脚本中直到首个 10000 的全部条目的操作码；可达内置记录的处理器身份。
- **创建时的语义检查（`CoreInputError`，路径为结构路径，原因为下列稳定字符串之一，不回显导入值）：** 只检查上述闭包，闭包外的内容仍经 CR-01 与内容读取器的完整结构检查，但不要求可执行语义。

  | 原因 | 条件 | 路径 | 原版后果 |
  |---|---|---|---|
  | `unsupported-handler` | 可达内置记录的处理器身份不在映射中 | `input.aiPrograms.content.builtInPrograms[r].handler` | — |
  | `unsupported-opcode` | 闭包脚本中有支持集外的操作码（含 9000–9002、203–205、305、403、1102、2000–2303） | `…entries[e].items[i].opcode` | — |
  | `missing-argument` | 布尔、关键字或多值类没有文本 | `…items[i].argument` | 读地址 0 或解析失败 |
  | `invalid-boolean` | 首个非空格字符不是 N/F/n/f/Y/T/y/t | 同上 | 解析失败 |
  | `unknown-keyword` | 去掉尾随空格后在 D-03 导入的对应表中查不到（ASCII 不区分大小写，首个匹配） | 同上 | 解析失败 |
  | `unterminated-range` | 区间缺少 `]` | 同上 | 解析失败 |
  | `invalid-number` | 数值文本未被相应语法完全读完（整数：可选符号与十进制数字，结果在 i32 内；浮点：可选符号、数字与至多一个 `.`、可选指数，至多 15 位有效数字且 \|指数\| ≤ 22）；区间的符号记号既不为空也不是以 `+`/`-` 开头的单个记号 | 同上 | 原版忽略尾随文本、截断或回绕；切片数据中没有这些情形，拒绝以免复现 `atoi`/`strtod` 的容错路径与陈旧字节（ai §5.3） |
  | `zero-range` | 整数区间 hi − lo + 1 按 i32 回绕为 0 | 同上 | #DE |
  | `zero-rate` | AI 路径上作除数的转向块值可为 0：速度上限 S+0x4C = F(机型 +0xB8 × 速度比例)、转向速率 S+0x54/+0x58/+0x5C = F(机型 +0xAC/+0xB4/+0xB0 × 转向比例)。按到达该种类的全部比例来源判定：`0x5c530` 的 1.0、`0x5e4d0` 的 v1、v2（下限 0.65、0.5）、记录 +0x34 ≠ 0 时 `0x5c768` 的原值 R+0x40、R+0x3C（在 `0x5e4d0` 之后写入、无下限）、僚机的 AICO 元素 +0x00、+0x04。用到的除数：1001–1003（S+0x54、+0x58、+0x5C）；攻击航线 `0x63c00`、`0x640d8`、`0x64474`（S+0x4C、S+0x58），可达于僚机与脚本含 1101 的表程序 | `input.craftInfo.content.craft[k]`、`…programs[p]`、`…globals.elements[i]` | x87 除零（未屏蔽） |
  | `zero-divisor` | 可达表记录 +0x50 ≠ 0 而 +0x0C = 0；有对象要选择而组表或（组表无匹配时的）内置表的记录数为 0 | `…programs[p]`、`…programs`、`…builtInPrograms` | #DE |
  | `negative-period` | 可达记录的 +0x14 < 0，或 +0x50 ≠ 0 而 +0x14 > 0x2AAAAAAA（`0x5e4d0` 的 3 × 周期按 i32 回绕为负）；可达 DFPG 的 +0x04 < 0（交战计时的重设为采样 + 负周期） | `…programs[p]`、`…builtInPrograms[r]`、`…entries[e].at04` | 期限回绕，处理器或交战计时长期不到期 |
  | `element-out-of-range` | 所选僚机的运行时 +0xDC − 1 不在 AICO 元素数组内 | `setup.wingmanOptions[i]` | 越界读取 |
  | `zero-craft-divisor` | 配置了僚机而种类 2 的机型 +0x9C 为 0（状态回复的商）；攻击航线可达时，摆动周期的区间 [AICO +0x3C, +0x40] 含 0 | `input.craftInfo.content.craft[1]`、`…globals` | #DE 或 x87 除零 |
  | `missing-transponder` | 种类 `0x4000` 没有机型记录、+0xB8 ≤ 0，或其模型不在 `models` 中（CR-20：`b` 恒可达） | `input.craftInfo…`、`input.models` | — |

  其中“可取负值”“为 0”都按可取值的全集判定（区间按端点，随机符号按两种符号），不能因本次种子避开而放行。CR-01 的集合完整规则扩展：`models` 必须包含种类 `0x4000` 绑定的模型，因为 `b` 在任何配置下都可达。`MissionSetup` 没有独立的机型表，`loadMission` 也拒绝未被引用的机型，所以绑定只能来自任务中种类 14（`0x4000`）的声明或选项；没有这样的声明为 `missing-transponder`（路径 `input.craftTypes.content.entries`；2026-10-15 执行中由协调者按用户授权澄清，P3-08/14）。

- **运行时故障（`CoreFaultError`，不伪装成创建时已证明安全）：** 执行预算超限（CR-25）；Xpon 油门的表索引越界（X2 第 9 步，数据核对表明在玩家机型最高速度以内不越界，速度更高时为故障）；操作码 230、231、403 的关键字值低字节 > 2（原版越过武器列表读取 `0x2dd54`；切片的真实内容不触发，2026-10-15 执行中由协调者按用户授权记为运行时故障 `ai-interpreter.channel`，P3-08/16）；AI 锁定 `0x5dfec` 时列表 1 的当前挂点是炮且炮记录 +0x18 字节 ≠ 0（原版把炮记录当作导弹记录读取，各阶段时间越过炮记录读取；切片中开启 AI 锁定的 AI 机体列表 1 没有炮，P3-08/18）为 `ai-firing.lock-gun`；提前量模式 5 而列表 0 没有当前的炮（列表为空时原版 `0x2dd38` 不写结果，读到栈上的陈旧值；切片不可达，P3-08/17）为 `ai-piloting.main-weapon`（这两项 2026-10-16 由协调者按用户授权批准，CR-24 决定 18）；任何违反本节类型约束的写入。ai §12 的其余原版崩溃在创建时都已拒绝：第 9 次压栈与无让出的死循环由“9001/9002 不在支持集”与执行预算覆盖。
- **静态 AI 数据（`WorldRuleData.ai`，冻结，不进快照）：** 支持闭包内的程序记录（表记录的载入变换：+0x08 为 0 取 0x380，+0x2C 为 ±0 取 1.0，ai §6；内置记录不经变换，ai §3.3）与由它派生的控制器配置（CR-16 的 `limits`）；DFPG 的 F(+0x08²)；按脚本条目预先校验过的解析计划（每个条目的类别、无抽取的值、区间端点与符号许可），关键字值在创建时按导入的表解析为 i32；处理器映射。它们由 setupHash 绑定的输入决定，没有抽取，不形成第二份可变事实。实际的随机解析仍在载入时按原次序抽取（CR-19）。

#### CR-16 实体的 AI 程序槽与控制器（D-01）

`AiState` 增加 `program`（对象 +0x10 与 +0x14），为封闭联合；`program.type` 与种类不符为 Core 故障。玩家、种类 `0x4000` 与 P3-07 的运行时种类恒为 `none`（导弹的追踪程序仍是 CR-02 的 `HomingState`，不在此联合中）。

```ts
type AiProgramSlot =                                  // +0x10 所选记录与 +0x14 控制器
  | { type: 'none' }                                  // +0x10 = 0：不选择的种类，或两张表都不匹配
  | { type: 'table'; record: number; controller: TableController | null }        // TABL 6003 的记录序号
  | { type: 'built-in'; record: number; controller: BuiltInController | null };  // 内置表的记录序号
// controller 为 null ⇔ +0x14 = 0：选择后、首次回调安装前，状态 5/6 移除后、下次状态 0–3 回调安装前

type TableController = AiControllerCommon & (
  | { handler: 'interpreter'; interpreter: InterpreterState }  // 活动或停靠时安装（CR-17）
  | { handler: 'parked' });                                    // 停放时安装 0x62250
type BuiltInController = AiControllerCommon & (
  | { handler: 'wingman'; wingman: WingmanState }
  | { handler: 'base'; base: BaseState }
  | { handler: 'parked' });

interface AiControllerCommon {             // 0x16C 字节的控制器 C（ai §1.1），+0x00 即实体本身，不另存
  nextUpdateClock: number;                 // +0xF0，时钟
  period: number;                          // +0xF4，i32
  limits: ControllerLimits;                // +0x100–+0x118（由记录派生；表记录先经载入变换）
  triggers: readonly [ChannelTrigger, ChannelTrigger, ChannelTrigger]; // +0x120–+0x134，通道 0、1、2
  aiLock: boolean;                         // +0x138
  missileReady: boolean;                   // +0x13C
  automaticMounts: boolean;                // +0x140
  engagement: EngagementTimer;             // +0x144–+0x14C
  attackPass: AttackPass;                  // +0x150–+0x15C
  steering: SteeringBlock;                 // +0x04–+0xEF（S）
}
interface ControllerLimits {
  turn: number;               // a = F(D(D(记录 +0x24 × f64 0x17232c) × f64 0x172334))；+0x104 = a，+0x100 = −a（取负精确）
  speed: number;              // b：同上由 +0x28；+0x10C/+0x108，`0x5e4d0` 改写
  saturation: number;         // +0x114 = 记录 +0x2C 的位拷贝，+0x110 = −sat
  rollMatchThreshold: number; // +0x118 = 记录 +0x30 的位拷贝
}
interface ChannelTrigger { pressed: boolean; holdDeadline: number } // 值 +0x120+4k（只取 0、1）；按住期限 +0x12C+4k
interface EngagementTimer {
  dueClock: number;           // +0x144：0 = 未启用，否则为时钟
  period: number;             // +0x148，i32
  mask: number;               // +0x14C，u32 种类掩码（0 被写成 0xfbfff）
}
interface AttackPass {        // 攻击航线 0x63c00（WA7）
  phase: 0 | 1 | 2;           // +0x150
  deadline: number;           // +0x154，时钟
  savedSizeClass: number;     // +0x158，u8
  savedLeadMode: number;      // +0x15C，u8
}
```

**转向块 S（`AiControllerCommon.steering`，A1）：** S+0x00（主体）、S+0x04（指向限值）与 S+0x08（主体机型记录）由实体与静态数据确定，不存。

```ts
interface SteeringBlock {
  targetValid: boolean;        // S+0x0C
  target: EntityId | null;     // S+0x10：点转向（0x5c658）时 targetValid 为 true 而 target 为 null
  targetSample: number;        // S+0x14：上次 0x5c8b0 的采样（每采样一次的缓存）
  relativeSample: number;      // S+0x18：上次 0x5cc6c 的采样
  point: Vec3;                 // S+0x1C–+0x24，f32
  distance: number;            // S+0x28（C+0x2C），f32
  targetSpeed: number;         // S+0x2C，f32
  offset: { enabled: boolean; frame: 0 | 1; vector: Vec3 }; // S+0x30、+0x34、+0x38–+0x40
  sizeClass: number;           // S+0x44，u8
  approachRadius: number;      // S+0x48（C+0x4C），f32
  speedLimit: number;          // S+0x4C（C+0x50），f32
  halfSpeedLimit: number;      // S+0x50，f32
  turnRates: readonly [number, number, number]; // S+0x54、+0x58、+0x5C，f32
  leadMode: number;            // S+0x60，u8
  leadConstant: number;        // S+0x64，f32
  relativeFlags: number;       // S+0x68，0–7（位 0–2）
  relative: Vec3;              // S+0x6C–+0x74，L，f32
  reverseFlags: number;        // S+0x78，0–7
  reverse: Vec3;               // S+0x7C–+0x84，f32
  angles: readonly [number, number]; // S+0x88、+0x8C（C+0x8C、C+0x90），A、B，f32
  control: ControlBlock;       // S+0x90–+0xBC（CB），CR-05 的形状
  coneBits: 0 | 1 | 2 | 3;     // S+0xC0（C+0xC4；与对象 +0xC4 的 AI 模式不同）
  speedFraction: number;       // S+0xC8，f32
  turnFraction: number;        // S+0xCC，f32
  rollMatch: boolean;          // S+0xD0 = 0
  throttleNoise: { enabled: boolean; low: number; high: number };  // S+0xD4–+0xDC
  steeringNoise: { enabled: boolean; low: number; high: number };  // S+0xE0–+0xE8
}
```

- **CB 的持久性：** CB 在两次步之间保留；噪声 `0x5d490`/`0x5d6a8` 在 S 中的 CB 上就地修改后投递，`0x5d014` 投递“CB 如留下的那样”，`0x5d274` 读取 `0x5cd1c` 的结果，所以全部行的 `{clear, set, value}` 都进快照（`set` 为 false 的行也保留 `value`）。速度标志为 0 时 `speedFactor` 为 null：原版留下的旧系数此时没有读者（只有 `0x5d0ec`、`0x5d41c` 置标志，并同时写系数）。
- **每采样一次的缓存：** `targetSample`/`relativeSample` 等于采样时 `0x5c8b0`/`0x5cc6c` 立即返回。规避 `0x5d374` 在栈上复制 S（不持久），复制品保留 `targetSample`，因此同一采样内先运行过 `0x5c8b0` 时，转弯按当前目标而非威胁计算（A7 的怪癖）。Core 照原样复现（CR-24 决定 6）。

**原版偏移与字段（只列代码事实）：**

| 偏移 | 字段 | 偏移 | 字段 |
|---|---|---|---|
| 对象 +0x10 | `program.record`（与 `type`） | C+0x120/+0x124/+0x128 | `triggers[k].pressed` |
| 对象 +0x14 | `program.controller` | C+0x12C/+0x130/+0x134 | `triggers[k].holdDeadline` |
| C+0x00 | 实体本身 | C+0x138、+0x13C | `aiLock`、`missileReady` |
| C+0x04–+0xEF | `steering`（S = C+4，S+k = C+k+4） | C+0x140 | `automaticMounts` |
| C+0xF0、+0xF4 | `nextUpdateClock`、`period` | C+0x144、+0x148、+0x14C | `engagement.dueClock`、`.period`、`.mask` |
| C+0xF8 | `program.record` | C+0x150、+0x154 | `attackPass.phase`、`.deadline` |
| C+0xFC | `handler`（由记录与停放分派决定） | C+0x158、+0x15C | `attackPass.savedSizeClass`、`.savedLeadMode` |
| C+0x100–+0x114 | `limits.turn`、`.speed`、`.saturation` | C+0x160 | 不存：每条路径都写 0，恢复分支是死代码（WA7） |
| C+0x118 | `limits.rollMatchThreshold` | C+0x11C、+0x164 | 不存：只清零，无读者（ai §1.1） |
| C+0x168 | `interpreter`/`wingman`/`base`（CR-17） | — | — |

**字段的范围与生命周期：** 控制器的全部字段由安装（CR-23）的 `0x5dc0c` 清零后写配置、`0x5c530` 初始化 S、处理器的模式 0 写其余；随控制器在状态 5/6 的移除而消失（`controller := null`），没有其他重置；停放与恢复之间不保留任何控制器字段（WA2、ai §1）。

| 字段 | 类型与范围 | 初值（安装） | 更新者 | 读者 |
|---|---|---|---|---|
| `nextUpdateClock` | 时钟 | 处理器入口写（解释器：采样 + `period`；`0x62250`：采样 + 0x40） | 处理器（ai §1 *Scheduling*：`0x64cb8`、`0x60f80`、`0x610c8`、`0x62c10`、`0x63c00`、`0x62250`、`0x62578`、`0x62714`） | AI 步（无符号严格 `>`） |
| `period` | i32，≥ 0（CR-15） | 记录 +0x14 | `0x5e4d0`（×3/2 或 ×2/3，向零取整） | 处理器、`0x5e4d0`、`0x61740`、`0x63c00`、`0x64d58` |
| `limits.turn`、`.saturation`、`.rollMatchThreshold` | f32 | 记录 +0x24、+0x2C、+0x30（载入变换后） | 不变 | `0x5cd1c` |
| `limits.speed` | f32 | 记录 +0x28 | `0x5e4d0` 第 5 步 | `0x5cd1c` |
| `triggers[k]` | 布尔、时钟（0 表示按住 0） | false、0 | 按下 `0x5df20`（只在未按下时：期限 = 0、采样 + 0x7D00 或采样 + 按住）、松开 `0x5df84`、AI 步的释放 | AI 步 |
| `aiLock` | 布尔 | false | `0x5e1b0`、`0x5e4d0`（置 true）、`0x5e1d4`、`0x5dfec`（置 false） | AI 步、`0x640d8` |
| `missileReady` | 布尔 | false | AI 步：通道 1 的任何尝试清除；AI 锁定更新写入 `0x5dfec` 的结果 | `0x5e154` |
| `automaticMounts` | 布尔 | false | 基地安装 `0x5e1f4` | AI 步 |
| `engagement` | 时钟（0 未启用）、i32（≥ 0，CR-15）、u32 | 0、0、0 | `0x63250`、`0x63600`、`0x63744` | `0x63600`、`0x63744`、`0x632a4` |
| `attackPass` | 见类型 | 0、0、0、0 | `0x63c00`、`0x640d8` | `0x63c00` |
| `steering.*` | 见类型；`turnRates`、`speedLimit` 等由 `0x5c768` 以 f32 写回 | `0x5c530`：清零、尺寸类 2、提前量模式 0、`approachRadius` 0、`0x5c768(1.0, 1.0, 0)` | A1、A2 的写入者（`0x5c584`、`0x5c658`、`0x5c8b0`、`0x5cc6c`、`0x5cd1c`、`0x5c768`、`0x5c7e8`、`0x5c878`、`0x5c73c`、`0x5c6d4`/`0x5c6fc`/`0x5c72c`、`0x5dab0`、噪声、`0x63c00`）；`0x5e4d0` 第 5 步重做 `0x5c530` | 同左、执行器、`0x610c8`、`0x61a88`、`0x640d8`、`0x64474`、`0x64d58`、`0x5dfa4`、`0x5dfec` |

- **AI 对实体其他字段的写入（本修订改变既有字段的可变性或写入者）：**
  - **运行时 +0xE0（`ruleInputs.aiValueB`）改为可变。** 唯一的运行时写入者是 `0x5e4d0`（安装第 2 步；操作码 305 在支持集外）：值为负时写回 −值（i32 取负，−2³¹ 保持不变），并关闭本次的 AI 锁定门（ai §11.2 第 1 步）。该写回可被观察：P3-07 的停放交战只在 +0xE0 ≥ 0 时选择导弹，重装时的下一次 `0x5e4d0` 读到写回后的值。其他读者（选择、份额、`0x62760`）不变；切片中没有负的运行时 +0xE0，写回在切片中不发生（ai §11.2 的 *Group 0*）。`EntityRuleInputs` 的其余五项仍不可变。
  - **AI 写入 `combat.weapons.lock`（修订 CR-02 的“锁定机只为玩家运行，其他对象保持初值”，A13）：** `0x5dfec`（AI 锁定更新）：无列表 1 状态 → 只关 `aiLock`；导弹无制导 → 就绪，不写锁定；目标无效、未活动或无弹药 → `level` := 0；采样 < `nextUpdateClock`（无符号）→ 不变；否则几何不合格 → `level` := 0，合格时 0 → 2（`stageDueClock` := 采样 + (导弹 +0x34 SAR 1)）、2 → 3（采样 ≥ `stageDueClock` 时，重设同上）、3 → 4（采样 ≥ `stageDueClock`），1 与 4 不变；最后 `nextUpdateClock` := 采样 + 0x40。`0x5e1b0`（及 `0x5e4d0` 中的同一启用）：`nextUpdateClock` := 0、`level` := 0；`0x5e1d4`：`level` := 0；`0x5c584` 在目标改变为有效句柄时 `level` := 0。AI 不写 `losing` 与 `graceDueClock`，不经过等级 1。玩家的锁定机 `0x2ddbc` 不变；发射时 P3-07 的 `0x2e86c` 对非玩家照旧清零。因此 AI 制导发射的 `launchByte` 通常为 4（受损挂点为 3），P3-07 的 W8 注释由修订 ⑦ 更正。
- **只读查询（供 P3-10 的尾随警告 `0x4ef9c`，CB-09）：**

  ```ts
  function isClosingMissileLock(entity: Entity): boolean; // combat.type 为 craft 且 combat.weapons.lock.level ∈ {3, 4}
  ```

  - **输入：** 一个已解析的实体（P3-10 先按种类 `0x780`、活动、状态 ≥ 7 与 `ai.objectTarget` 为玩家筛选）。**输出：** 布尔。不写状态、不抽取，可在任何阶段调用。
  - **所读的状态：** 原版的字节 (+0xF4)+0x24 是武器块（对象 +0xF4 起，[W1](../../../original/formats/executable.md#w1-per-object-weapon-block-and-mount-states--confirmed-code)）的 +0x24，即对象 +0x118 的导弹锁定等级 `combat.weapons.lock.level`（CR-02），不是控制器 C+0xF4（周期）或攻击航线 C+0x150–C+0x15C（ai §1.1）。对 AI 机体，等级 3、4 只由上一条的 AI 锁定更新 `0x5dfec` 写入（等级 2 → 3 → 4 的阶段），所以该条件的含义是“AI 正在完成对目标的导弹锁定”。
  - **与 CB-09 的一致性：** CB-09 与 CB-17 决定 11 把该字节称为 P3-08 处理器私有状态中的攻击航线字节，并规定没有处理器状态时条件不成立。按上述偏移，它是 P3-07 的锁定等级；不过可达情形下结果相同：P3-08 接入前 AI 机体的等级恒为初值 0，接入后没有控制器的种类 `0x780` 对象（尚未安装、已移除或被毁）不满足“状态 ≥ 7 且活动”或其等级仍为 0（玩家的锁定机不作用于它们，停放、恢复不重置武器块但重装先于状态 7）。该措辞的更正交 P3-10 在合入时处理（不改其行为）。

#### CR-17 处理器的私有状态（D-01）

```ts
interface InterpreterState {      // 表程序：C+0x168 指向的 0x18 字节 I（ai §11.1）
  state: 0 | 1 | 2 | 3 | 4 | 5 | 6;     // I+0x00，u8；0 = 尚无
  execution: ExecutionState | null;     // I+0x04：当前脚本的执行状态；null 只在 state 为 0（首次状态机在规则 1 返回）或状态 3 的列表为空时
  lastRunEnded: boolean;                // I+0x08：上次执行器运行的结果（0 让出，1 结束）；换脚本时不清
  steadyClock: number;                  // I+0x0C，时钟：锥位为 3 的每次更新后 := 采样
  stateDeadline: number;                // I+0x10，时钟：从 {3, 4, 5} 之外进入 3、4、5 时 := 采样 + D+0x1C
  state4Deadline: number;               // I+0x14，时钟，0 = 未设
}
interface ExecutionState {        // 每次载入脚本的 0x60 字节 X（ai §5.1）
  script: number;                       // 脚本条目序号（X+0x24 的首条目）
  item: number;                         // X+0x28：当前条目序号，< 该脚本的条目数
  variables: readonly [number, number, number, number];  // X+0x04–+0x10，i32
  timers: readonly [number, number, number, number];     // X+0x14–+0x20，时钟
  returnStack: readonly number[];       // X+0x2C–+0x48：条目序号，长度即深度 X+0x4C，0–8
  wait: { active: boolean; until: number };  // X+0x50、+0x54
  hold: { active: boolean; until: number };  // X+0x58、+0x5C
}
interface WingmanState {          // 僚机：C+0x168 指向的 0x14 字节 B（WA1）
  behaviour: 0 | 1 | 2 | 3 | 4 | 5;     // B+0x00，b
  doNotAttack: EntityId | null;         // B+0x04
  attackTarget: EntityId | null;        // B+0x08
  nextGunSwitchClock: number;           // B+0x0C，时钟
  nextEngageSearchClock: number;        // B+0x10，时钟
}
interface BaseState {             // 基地：C+0x168 存的种类掩码（A14）
  targetMask: 0x93780 | 0x6c87f;        // 基地（种类 0x20000）得 0x93780
}
// 停放处理器 0x62250 没有私有状态：只用 nextUpdateClock，C+0x168 保持 0。
```

| 字段 | 初值 | 更新 | 重置与释放 |
|---|---|---|---|
| `interpreter.*` | 安装第 6 步分配并清零（ai §11.2），随后同一调用的状态机与执行器写入 | 状态机 `0x64d58` 的 13 条规则（ai §11.3）；`steadyClock` 由 `0x64cb8` 第 5 步 | 处理器模式 2：释放 `execution`（CR-19 的计数减 1）后丢弃 |
| `execution` | 载入（CR-19）后由 `0x5e9d8` 复位：变量、计时、深度、等待与保持清零，`item` 为 0 | 执行器 `0x5f4f4`（ai §5.4）；状态规则 11 的“重置”只调用 `0x5e9d8`，不重解析、不抽取 | 换脚本（规则 12）与移除时释放 |
| `variables`、`timers`、`returnStack` | 0、0、空 | 只由 2000–2003、2200–2203、9001/9002/9500 写入；前两组在定稿的支持集外，因此恒为初值，`returnStack` 只会被 9500 清空 | 同上 |
| `wingman.*` | `0x60f80` 的模式 0 清零后由 `0x61d64` 按 +0xC4/+0x90 写 `behaviour` 与 `attackTarget`（WA2） | `0x614a8`、`0x61a88`、`0x61740`、`0x610c8`（WA1） | 模式 2 释放；停放丢失 b、B+4 与两个计时，恢复时由 `0x61d64` 重建 |
| `base.targetMask` | `0x62b60` 的模式 0 | 不变 | 随控制器 |

- **执行状态与解析缓存的分工：** 解析值在世界级缓存中按脚本共享（CR-19），执行状态（游标、变量、计时、栈、等待与保持）每次载入一份，属于该控制器，不共享。安装脚本的执行状态只在安装调用内存在（不持久），不进快照；它在该调用中使该脚本的计数多 1。
- **退出值** X+0x00 没有读者，不存（ai §5.1）。

#### CR-18 AI 模式与待处理命令（D-01）

- **`AiMode` 不变**（0 | 1 | 2 | 4 | 5）。切片中 +0xC4 的写入者与取值见 [D2 的 *Mode values in the slice*](../../../original/formats/executable.md#d2-target-search-0x62578c-set-mask-p-and-0x62714--confirmed-code)：敌方领队 0/4、跟随者 0、基地 1、僚机 0/2/5 与命令效果、种类 `0x2000`/`0x4000` 为 5。模式 3 只由 `0x5e710(C, 0)` 写入，其唯一调用者是支持集外的操作码 1102，因此不加入；支持集扩展时按扩展规则修订。僚机的“愤怒”是私有行为字节 b = 5（`WingmanState.behaviour`），不是对象的 AI 模式；镜像 `0x61dfc` 此时写 +0xC4 := 0。
- **待处理命令单槽：** `AiState` 增加

  ```ts
  pendingCommand: { code: number; issuedTick: number } | null; // +0x184：null ⇔ 0。code 为 u32，1 ≤ code < 2³²；issuedTick 为写入它的 tick
  ```

  - **写入：** 只由 P3-10 的 `deliver-command` 请求（CB-08）在请求处理中写入，后写覆盖先写（WB2）；本节不另建投递请求。`issuedTick` 是项目字段，供 CR-22 的结果事实关联 P3-10 同一 tick 的菜单 `command-result`；规则不读它。原版同时存发送者 +0x188（计数引用），它没有规则读者，Core 不存。
  - **消费：** 活动或停靠的僚机由 `0x614a8` 消费（处理器的每次到期更新与每次安装），停放的由 `0x61f20` 消费（停放步）；两表语义不同（WB3、WB4）。基地的 +0x184 处理器 `0x3bed0` 归 P3-10（CB-12、CR-28）。
  - **三种结果：** **阻塞待处理**（活动：玩家实体为空或累计值 > AICO +0x28；停放：累计值 > AICO +0x28）——保留，不清除、不回复、不发事件；**已消费**——按码执行效果与回复后清为 null，发出 CR-22 的结果事实（码 7、≥ 8 等无效果的码同样清除）；**被覆盖**——旧码永不执行、永无事实与回复。命令本身只带码：玩家目标、玩家、ps +0/+0x10–+0x18 与船体在**消费时**读取，消费前玩家换目标会改变命令的对象（WB2）。
  - **生命周期：** 实例化与分配器写 null；停放、恢复与重装不清除（重装的安装会消费它）；救援不清除（Q4）；实体移除时随之消失。在请求处理与消费之间被移除：命令随实体消失，无事实。

#### CR-19 世界级 AI 状态与可见性历史（D-01）

`WorldState.ai`（P3-10 的 CB-05 已加入，含 `friendlyFire`）中由本节加入 `parseCache`。对象集合与实体的 `mapVisible` 由 P3-09 定义（MW-02、MW-06），本节不另定义（D-03 修订，CR-29）：

```ts
interface WorldAiState {
  parseCache: readonly ParsedScript[];    // 按脚本条目序号升序；只含计数 > 0 的脚本
  friendlyFire: { accumulated: number; windowEnd: number };  // acc 0x174dfc（i32）、wend 0x174e00（时钟）；定义以 CB-05 为准，此处只为列全
}
interface ParsedScript {
  script: number;                          // 脚本条目序号（ai-programs 的 entries 下标）
  uses: number;                            // 正整数：存活的执行状态数
  items: readonly ParsedArgument[];        // 恰为该脚本直到首个 10000 的条目数，按条目次序
}
type ParsedArgument =                      // 条目的 +0x08/+0x0C 槽，按 ai §5 的类别
  | { type: 'none' }                       // 无参数类（106、107、9500）
  | { type: 'integer'; value: number }     // i32：整数、布尔与关键字类；整数类无文本时为 0
  | { type: 'float'; value: number }       // f32：浮点、度数（×两个常量）与余弦类
  | { type: 'optional-floats'; values: readonly [OptionalFloat, OptionalFloat, OptionalFloat, OptionalFloat] } // 100
  | { type: 'floats'; values: readonly number[] };          // 111 的 3 个 f32（105 的 2 个在支持集外）
interface OptionalFloat { present: boolean; value: number } // 以 x/X 开头的记号为缺省；空记号为存在的 0.0
```

- **解析缓存（ai §5.2）：** 以脚本级计数代替原版的条目级计数，二者在“解析失败已在创建时拒绝、分配与 i32 计数不会失败”下完全等价（ai §5.2 的 *Script-level count equivalence*，已确认）。载入（安装脚本、状态机规则 13）使计数 0 → 1 时按条目次序、条目内按记号次序解析全部条目并在此刻抽取（区间 1 次，符号记号允许时再 1 次；ai §12），计数 > 0 时共享、不抽取；释放（规则 12、模式 2、安装脚本运行后）使计数 1 → 0 时删除该项，下次载入重新解析并重新抽取，同一任务内也是如此。不同 DFPG 引用同一脚本时共享。无抽取的值可取自静态 AI 数据，结果相同。新世界从空缓存开始；两个世界不共享。上界：项数 ≤ 支持闭包的脚本数（内容上限 64），`uses` ≤ 带表程序控制器的实体数 + 1。
- **友伤累计（WB6）：** 字段 `WorldState.ai.friendlyFire` 是 P3-10 的 CB-05，由 Core 拥有、进入快照；`WorldState.ai` 的 `parseCache` 由本节加入。写入归 P3-10：`0x3c208` 第 1 步的 `0x38f20`（CB-12，已实现）；P3-08 只读（D-03，CR-27）。下面的规则描述共享状态的语义，写入者照此实现。规则：伤害入口在有效性校验之后、船体伤害之前以原始伤害调用；W = 走查次序中第一个种类 2 的对象（不筛状态）；受击者为 W 且攻击者种类为 1 时，若采样 > `windowEnd`（无符号严格）则 `accumulated` := 0、`windowEnd` := 采样 + 0x780，然后 `accumulated` += 原始伤害（i32 回绕加法）。读者只有 `0x38fd8`：`accumulated` > AICO +0x28（i32，有符号，等号不阻塞）。初值：`accumulated` = 0（任务构建 `0x38bec`），`windowEnd` = 0（CR-24 决定 4）。任务期间没有任何重置：不衰减、救援与僚机损失都不清，无僚机的世界保持 0。其他攻击者分支的船体低告警期限 `0x174e10` 是 P3-10 拥有的 `communications.limits.wingmanLowHull`（CB-05），不在本节。
- **对象集合与 +0xD4：** 由 P3-09 定义并实现（MW-02、MW-06：成员与次序、每 tick 无条件重建、基础值 false、揭示函数 `0x2ee60`、快照）；P3-08 的读者、僚机停放步的揭示调用、采样时机、初值与失效句柄见 CR-29（D-03 修订：原先在此重复定义的集合与 `mapVisible` 撤回）。
- **快照：** `parseCache` 进入快照；`friendlyFire` 由 CB-05、CB-16 计入，集合与 `mapVisible` 由 MW-14 计入。

#### CR-20 动态 Xpon 与 `b`（D-01）

- **责任：** 运行时构造种类 `0x4000`（`0x38780` 及其两个调用者：`b` 的命令与消息 0x200000，僚机的投放）由 P3-10 已批准的 CB-18 移交 P3-08，与本条一致；CB-18 同时改写 CR-02 的 `craft` 行，本节不另改该行。
- **`b` 的结论：** 高概率为正常玩法（[X5](../../../original/formats/executable.md#x5-is-b-normal-play--likely-code-no-runtime-check)）：纳入，代码注释与对照结论标注“高概率”。物理绑定 `KeyB` 由 D-03 写入 P3-05 的绑定表（CR-30）。
- **命令：** 命令联合增加无字段的 `{ type: 'drop-transponder' }`。判定在玩家更新的命令批次中按次序进行：CR-05 的共同前置判定（玩家不可用 → `ignored`/`player-unavailable`；交互上下文不是 `flight` → `ignored`/`wrong-context`；通讯菜单打开时的优先级由 P3-10 加入，原版的 `b` 此时是菜单第 11 项）；否则 `accepted`，并投递 `create-transponder` 请求（CR-21）。没有次数、能量、冷却或状态门禁（X2），不新增原因码。每条被接受的命令各投递一次；“每次键盘轮询至多一次”由输入层保证（CR-30）。
- **种类 `0x4000` 的状态：** 种类位 14 的实体增加

  ```ts
  transponder: {
    creator: 'declaration' | 'player' | 'wingman';   // 实例化 / b / 僚机投放
    callback: { phase: 'none' } | { phase: 'first-update' } | { phase: 'tumbling'; since: number };
  };                                                  // 其他种类为 null
  ```

  - `callback` 对应对象 +0x14 的复用：`first-update` 是 `b` 创建的首次更新标记（+0x14 = 1，只在来源活动时），`tumbling.since` 是 4 字节块中的 F₀（时钟），`none` 是 +0x14 = 0。初值：实例化与投放为 `none`，`b` 为 `first-update`。回调 `0x3897c`（X3）在状态 0–3 遇到 `first-update` 时翻滚（2 次抽取，先行 3 后行 1）并改为 `tumbling`；状态 7 且采样 > `since` + 0x80（无符号严格）时稳定并改为 `none`；状态 5/6 时（`0x20ae4`）把非 `none` 改为 `none`。
  - **来源变体：** 不新增 `EntitySource` 变体，`source` 仍为 null：`source` 只表示声明（`object-instantiated`、P3-11 的对象事件与生成计数按它计数，而原版对象事件对无源记录的 Xpon 不起作用，X6）。`creator` 是种类 `0x4000` 的创建路径变体，供校验（`combat.type` 为 `craft` 而 `source` 为 null 的实体必须是 `creator` 不为 `declaration` 的种类 `0x4000`）、CR-22 的事件与 P3-09 的显露来源使用；规则不按它分支。
- **构造 `0x38780`（X2，`b` 与投放共用）：** 依次：
  1. 分配种类位 14（实体上限内；原版没有规则上限，只受内存限制）。`source` null，`name` 为 `none`，`side` null，`baseInteraction` false，表现为 `MissionSetup.craftTypes` 中种类 14 绑定的模型，`ruleInputs` 六项为 0，`ai` 为分配器的 AI 状态（模式 5、两个目标为空、零向量）、`program` 为 `none`、`pendingCommand` null，`mapVisible` false，`formation` null，`warpClock` 0，`inWarp` false。
  2. 活动跟随来源：来源 `activity` 为 `active` → `active` 并有移动块；否则（停放或停靠）→ `parked`，无移动块。
  3. 战斗状态：`0x3060c`(新对象, 种类 14 的机型记录, 100, 0, 0)：能量满、护盾 0、充能 0、档位 0、E/T、`lastEnergyClock` 与 `nextEnergyClock`（1 次抽取）；船体不写（0）；子系统 0；武器块为分配器的空块（种类 14 的机型没有挂点）。`maximumSpeed` := 机型 +0xB8。
  4. `lastParkedUpdateClock` := 创建时钟（P3-06 的交接；X4 证明 +0x18 的初值不可观察，CR-24 决定 9）。
  5. 位姿：来源的行；位置按 X2 第 7 步逐轴 f32 写回（沿 −行 2 一个单位、沿 −行 3 十五个单位）。来源有移动块时，`0x218e8` 刷新**来源**移动块的 +0x70 := 机型 +0xB8 与 +0x74 := F(速度 ÷ +0x70)（P3-06 的写入者，X2 第 6 步）。
  6. 活动时的移动块：油门 t := trunc(D(D(D(v × 0.75) ÷ D(F(新 +0x78))) × 128.0))（`0x74518`），v 为来源的当前速度（无块为 0）；`0x21794` 按模式 0 建块，速度 = 指令速度 = F(表[64 + (t SAR 1)] × +0x78)，块 +0x78 := 1。表索引越界为 Core 故障（CR-15）。
  7. `transponder` 按上文写入。
  抽取：构造 1 次（能量期限）；`b` 的首次更新 2 次。
- **创建时刻与首次更新：** `b`：玩家更新中判定命令（第 N 个 tick），同一 tick 的请求处理中构造（状态为“表现就绪”，本 tick 不运动），第 N + 1 个 tick 的走查中首次回调（翻滚，在玩家与僚机之后，种类位 14）。僚机投放：在走查中由僚机的停放步直接创建（不经请求，CR-08 的直接创建扩展到对象更新中的这一路径），因种类位 14 高于 1，在**同一遍**走查中首次回调（状态“新建”→ 请求活动；停放的 Xpon 没有移动块，保持 CB 无效果、无抽取）。
- **生命周期：** 与其他机体相同地停放与恢复；AI 模式 5 使它不离开世界；被毁或拆除时移除。没有对象事件、计数、名称池或 SCEN 访问。被毁时 P3-07 的 `object-destroyed` 照常发出（`source` 为 null）；P3-11 不得把它计入对象事件。

#### CR-21 内部请求（D-01）

`Request` 联合增加下列封闭变体，并放宽 `steer` 的主体：

```ts
| { type: 'steer'; entityId: EntityId; control: ControlBlock }      // 既有变体；主体可为导弹（P3-07）或机体（AI，0x40000 的 AI 形式）
| { type: 'ai-match-speed'; entityId: EntityId; targetEntityId: EntityId;
    a: number; lo: number; hi: number }                              // 消息 0x80000 的 AI 形式（A5 的 0x5d090），三个值为 f32
| { type: 'warp-departure'; entityId: EntityId }                     // 消息 0x800000：目标为投递者自身，无载荷（D6）
| { type: 'create-transponder'; entityId: EntityId }                 // 消息 0x200000：主体为玩家（X1）
```

| 请求 | 投递者与位置 | 处理（请求处理阶段，按投递次序） | 处理时复检 |
|---|---|---|---|
| `steer`（机体） | AI 的移动助手 `0x5d014`、`0x5d0ec`、`0x5d1ac`、`0x5d274`、`0x5d41c`（A5），在对象更新中 | P3-06 的 `0x21fd8` 作用于机体移动块（含其扰动抽取）；导弹仍按 P3-07 | 主体查不到 → 丢弃。`0x21fd8` 自身的门禁（有移动块、机型记录、未锁定）不满足 → 无效果。主体既不是机体也不是导弹为故障 |
| `ai-match-speed` | `0x5d090`、`0x5d080`（S+0x10 为空时不投递） | P3-06 的玩家变体 `match-speed`（带 `commandIndex` 与事件）保留；两者经同一个推广后的 `0x21adc(subject, target, a, lo, hi)`，玩家取 (0, 0, 1)：v = D(D(a + 1) × 目标速度)，下限 F(最高速度 × lo)（v 的双精度与之比较），上限 F(最高速度 × hi)（F(v) 与之比较）；不发事件 | 主体查不到 → 丢弃；目标查不到、任一方没有移动块或主体没有机型记录 → `0x21adc` 失败，不写 |
| `deliver-command`（P3-10 的 CB-08，不由本节定义） | P3-10 的通讯菜单（`0x2c7fc`）；码 0 不投递 | 按 CB-08：`receiver.ai.pendingCommand := { code, issuedTick: tick }`，不校验种类，`sender` 与 `commandIndex` 不存入单槽；P3-08 只消费僚机的单槽（CR-18、CR-28） | `receiver` 查不到 → 无作用 |
| `warp-departure` | `0x5e6cc`：份额 `0x632a4` 第 7 步、僚机 `0x61740` b 3/4 与 `0x61a88` 情形 3/4（D6）；全部在对象更新中 | 成功：状态 := 区域切换、`inWarp` := true、`warpClock` := 0、`lastParkedUpdateClock` := 时钟 − 0x80；其后的移除、停放、立即安装 `0x62250` 与停放 Warp 跳跃按既有生命周期跨 tick 完成（D6），不在同一 tick 强行完成 | 主体查不到 → 丢弃；完整重做 `0x2fef8`（活动 1、不在 Warp、参照点在活动区域外、`0x2ff98`）与活动 = 1，不满足 → 静默丢弃（状态 ≥ 7 只由投递者 `0x5e6cc` 检查）。同一对象的第二个请求因第一个已置 `inWarp` 而失败（幂等） |
| `create-transponder` | 玩家更新中被接受的 `drop-transponder` 命令 | `0x38780`（CR-20）；活动创建发出 `transponder-deployed`（CR-22） | 主体查不到 → 丢弃（玩家实体只在拆除时移除，晚于请求处理，Core 中不可达） |

- `lastParkedUpdateClock` 的范围扩展为 ≥ −0x80 的安全整数：任务开头时钟 < 0x80 时它为负，经过时间 = 时钟 − 该值 = 0x80，与原版的 u32 差值相同。
- **请求生效点与 RNG 交接：** AI 的请求全部在对象更新中投递，在同一 tick 的请求处理中按投递次序生效（P3-02 的消息循环）；原版没有在请求处理之后投递的 AI 请求（D6），晚请求丢弃的语义不变，不以第二次排空或跨 tick 存放补救。`steer` 的扰动抽取在请求处理中、晚于本 tick 全部控制器抽取。
- **计数：** 全部计入 `requestsPerTick`（CR-25；`deliver-command` 计入 P3-10 的 CB-16）。新请求都不进入 `TickInput` 或 replay 记录。P3-10 的菜单接入前，`deliver-command` 只由 Node 内部契约测试经既有 `TickContext`/`RequestQueue` 投递（P3-08 spec 的僚机命令一节），不增加生产注入 API。

#### CR-22 领域事件与次序（D-01）

只加入有消费者的事实；字段为脱离世界的快照，不含名称原文或内容字节，消费者不能依赖按 ID 再查实体。共用 `{ type, tick }`，不另带 `clock`（CR-06）。

```ts
type WingmanCommandOutcome = 'applied' | 'fallback' | 'refused' | 'acknowledged' | 'status' | 'unknown-code';
| { type: 'wingman-command-consumed'; tick; wingmanEntityId: EntityId; code: number; issuedTick: number;
    path: 'active' | 'parked'; outcome: WingmanCommandOutcome; replyLine: number | null }  // replyLine：调用回复时请求的线号，不调用为 null
| { type: 'transponder-deployed'; tick; entityId: EntityId; creatorEntityId: EntityId; position: Vec3; orientation: Matrix3 }
```

| 事件 | 发出时机与语义 | 消费者 |
|---|---|---|
| `wingman-command-consumed` | 僚机消费 `pendingCommand` 时（对象更新中，僚机的走查位置），效果与回复调用之后、清除单槽时发出一次。阻塞待处理与被覆盖的命令永不发出。它与 P3-10 判定菜单操作的 `command-result` 是两个事实：后者在输入 tick 内对每条命令恰一次，前者在消费时，`issuedTick` 关联前者的 tick | P3-10（菜单状态）、P3-13（诊断与呈现） |
| `transponder-deployed` | `create-transponder` 构造出**活动**的 Xpon 时发出（原版只在活动创建时投递创建表现项与 SND 10055）；投放的停放 Xpon 不发出 | P3-12（创建表现）、P3-14（SND 10055） |

- **回复：** 消费者在原版的回复位置调用 P3-10 的 `queueLine(context, 僚机, 线号)`（CB-06，即 `0x38d54`）：声音索引越界或说话者不可解析时不抽取；否则按线号抽取（WB5）、查表，查到时入队并发出 P3-10 的 `radio-queued`。抽取与入队都在 P3-10 的函数中，本节不另建回复事件；`wingman-command-consumed.replyLine` 记录请求的线号，抽取后的线号与消息身份见同一 tick 的 `radio-queued`。

**结果映射（WB3、WB4；“回复”列为 `replyLine`）：**

| 码 | 活动（`0x614a8`） | 停放（`0x61f20`） |
|---|---|---|
| 1 | 玩家目标可解析且无 `0x206c07f` 的位：`applied`（应用返回 1，回复 0x10）或 `fallback`（返回 0，已退回编队，回复 0）；否则 `refused`（0） | 玩家与玩家目标可解析：`applied`（0x10）；否则 `refused`（0） |
| 2 | 玩家目标可解析且不是僚机：`applied`（记录“不攻击”，回复 3）；否则 `refused`（0） | 同左可解析：`acknowledged`（无状态变化，3）；否则 `refused`（0） |
| 3 | `applied`（0xE） | 玩家非空：`applied`（0xE）；否则 `refused`，**不回复**（`replyLine` 为 null） |
| 4 | `applied`（0x14）或 `fallback`（0） | 同码 3 |
| 5 | `applied`（0x12）或 `fallback`（0） | 有种类 `0x68000` 的对象：`applied`（0x12）；否则 `refused`（0） |
| 6 | `applied`（0x12）或 `fallback`（0x15） | 玩家非空且 ps +0 ≠ 0：`applied`（0x12）；否则 `refused`（0x15） |
| 7 | `status`（0xB–0xD，按船体百分比） | 同左 |
| ≥ 8 | `unknown-code`（3） | 同左 |

- **比较器：** 事件字段表随之扩展：`wingman-command-consumed` 比较全部字段；`transponder-deployed` 比较全部字段（`position`、`orientation` 为 f32）。
- **一个 tick 内的次序：** 对象更新中，事件按实体的走查次序；同一僚机消费命令时依次为回复的 `radio-queued`（若入队，P3-10）与 `wingman-command-consumed`。`transponder-deployed` 在请求处理中按请求次序发出。AI 的开火仍是 P3-07 的 `shot-fired`，`trigger` 保持 `{ type: 'ai', channel }`（列表开火）与 `{ type: 'automatic' }`（自动挂点），没有 `commandIndex`。
- **不加事件的事实：** AI 的速度匹配（只有玩家的 HUD 闪烁需要 `speed-matched`）；AI 的 Warp 离场（原版的移除表现项归 P3-12，Core 在离场后下一 tick 停放该实体、不再呈现，见 CR-24 决定 11）；控制器的安装、移除与状态机转换（只用于诊断，经快照读取）。

#### CR-23 阶段与时序（D-01）

本条修订 CR-07 与 P3-06 的 D-08 中 P3-08 的位置；阶段次序不变。

- **实例化扩展点 `0x20990`（第 13 步）：** 只做**选择**：在 Warp 计时 +0xC8 的抽取之后、`0x38cd4` 之前，对选择掩码内的种类按 `0x5dbc8` 抽取 1 次（组表有完全或部分匹配）或 2 次（组表起点，再内置表起点），把结果写入 `program`（`controller` 为 null）；其他种类为 `none`，不抽取。**不安装控制器**（P3-08 的修订 ①；原版在此先设种类回调，Core 的回调分派由种类决定，不存状态）。
- **对象更新（第 4 行），机体的通用回调 `0x20c18`：** 按对象状态（Core 的状态名见“实体与生命周期”）：
  - **状态 0–3（新建、表现就绪、等待表现）：** 先做 Warp 过境检查，过境中直接返回（不安装，也不推进状态）；否则当 `program` 不为 `none` 且 `controller` 为 null 时**安装**：`0x5dc0c` 清零并写配置、`0x5c530`、`aiLock` := false；然后按此刻的活动：停放 → `0x62250(0)`（`nextUpdateClock` := 采样 + 0x40，无抽取），活动或停靠 → 记录处理器的模式 0，它在同一调用中运行一次更新体及其抽取（解释器：安装与首次状态机/执行器运行；僚机：`0x60f80` 后的命令消费与完整更新；基地：`0x62b60` 后的挂点循环）。最后照常执行 `0x20ae4` 的通用部分（请求活动）。已有控制器时不重复安装。
  - **状态 4：** 无回调（控制器既不运行也不移除）。
  - **状态 5、6（区域切换、待移除）：** `controller` 不为 null 时**移除**：停放 → `0x62250(2)`，否则处理器的模式 2（释放私有状态与执行状态；切片的处理器在此不抽取），`controller` := null；然后照常请求离开。
  - **状态 7：** `controller` 不为 null 时运行 **AI 步** `0x5dcd4`：
    - 停放：采样 > `nextUpdateClock`（无符号严格）时 `0x62250(1)`；没有扳机循环与自动挂点。
    - 活动或停靠：通道 0、1、2 依次：已按下 → P3-07 的 `fireAiChannel`（`0x2d578`），通道 1 的尝试使 `missileReady` := false；然后通道 1 总是、通道 0/2 在采样 > `holdDeadline` 时松开。其后 `automaticMounts` 时 `fireAutomatic`（`0x2dad0`）；其后采样 > `nextUpdateClock` 时处理器的模式 1；其后在同一“采样 > `nextUpdateClock`”分支内（处理器到期时才执行；2026-10-15 执行中按原生 `0x5dcd4` 更正，P3-08/18）`aiLock` 时 `missileReady` := `0x5dfec`（A12、ai §1）。因此处理器的按下在**下一次** AI 步开火。
  - **种类 `0x4000`：** 回调 `0x3897c`（CR-20），没有 AI 与过境检查。玩家与 P3-07 的运行时种类不变。
- **P3-10 的固定调用点（CB-12）：** 种类 `0x6807c`（基地等）的自身更新中，P3-10 的 `0x3bed0` 在 AI 步之后读取并清除其单槽；僚机行为 3 的到达 `0x61bd0` 调用 P3-10 的 `fullRepair(context, 僚机, false)`（CB-10，对象更新中，不在消息循环内）；回复经 `queueLine`（CB-06）。
- **停放的 AI 与停放行进是两个调度器：** 停放控制器只在对象更新中运行；第 13 阶段 `parked-update` 保持 P3-06/P3-07 的节奏抽取、行进与交战，读取控制器写下的 AI 模式、AI 目标、对象目标与目标点，不再运行控制器。一遍中全部控制器抽取先于全部停放更新的抽取（D1；阶段次序已保证）。
- **对象集合（第 12 阶段 `object-sets`）：** 由 P3-09 实现（MW-06、MW-13：每 tick 无条件重建，视角 8 时随后调用揭示函数 `0x2ee60`）；P3-08 不在此阶段加入调用。揭示函数的另一个调用点是僚机的停放步（`0x62250` 的种类 2 分支，在对象更新中），由 P3-08 调用 P3-09 的同一个函数，不另建（D-03，CR-29）。
- **新建实体的首次更新：** `b` 的 Xpon 在下一 tick 首次回调；僚机投放的 Xpon 与 AI 范围伤害创建的爆炸一样，在同一遍走查中首次回调（CR-08）。
- **RNG 交接（一 tick 内的抽取次序）：** 实例化的选择抽取随请求处理中的实例化（第 13 步）；对象更新中按走查次序，每个对象的安装或 AI 步内依次为扳机循环的开火抽取（W12）、自动挂点（W9）、处理器的抽取（executable 的 *Draws per call* 表）；请求处理中 `steer` 的扰动抽取与开火构造；停放更新的抽取在 `object-sets` 之后（E4）。

#### CR-24 定稿的决定与已批准的差异（D-01）

依“最忠于原版且与已批准 spec 一致”的原则选择；以下每项列出所选方案与被排除的方案。

1. **安装在首次回调（P3-08 spec 的修订 ①）。** 原版在实例化只选择，安装与首次更新在对象首次回调中（ai §1）。被排除：在 `0x20990` 安装（已批准 spec 的原方向）——会把安装抽取与首次更新的请求提前到请求处理中，改变抽取次序与首次开火时刻，且与 Warp 过境中推迟安装的原版行为矛盾。
2. **对象集合无条件重建（修订 ③）。** 被排除：保留无效果的限速门禁——要把从不再改变的记忆模式 `0x174b7c` 加入快照，却没有任何可观察差别（D5）。
3. **基地自动挂点的绝对保持值。** 原版把 0x140 或 0–0x1C0 原样存入挂点 +0x4C，与绝对采样比较，而任务中的采样恒大于 0x1C0（高概率，A14），所以每次基地更新都对每个空闲挂点重选。Core 照原样写 `MountState.retargetClock`，而在 `0x2dabc` 判定这些保持值时视为已到期；这是已批准的差异（2026-10-15，随 D-01；理由同 CR-11 已批准的差异 9），记入 Core 模块说明与对照结论，D-02 核对。被排除：按 Core 的时钟原点 0 直接比较——开局 5–7 秒内基地不重选，与原版的可观察行为相反；给 Core 时钟加原点偏移——改变所有时钟语义。
4. **`windowEnd` 的初值为 0，原点为 Core 任务时钟。** 原版首个任务的 wend 为载入时的 0，此后跨任务保留；Core 的世界彼此独立，首个 tick 的时钟 ≥ 2 > 0，所以第一次友伤即重置窗口，与原版首个任务相同。被排除：携带上一任务的 wend（Core 没有跨世界状态）；用 null 哨兵（与 0 的严格比较等价，多一个分支）。跨任务的残留窗口（高概率在游戏中不出现）记为差异。
5. **照原样复现阻塞待处理、愤怒持续与累计不衰减（WB2、WA5、WB6）。** 被排除：拒绝时清除命令或回复拒绝、按时间衰减累计——都没有原版依据。
6. **规避 `0x5d374` 的每采样缓存怪癖照原样复现（A7）。** 被排除：“转离威胁”的直观实现。
7. **动态 Xpon 用 `source: null` 加 `transponder.creator`（CR-20）。** 被排除：为 `EntitySource` 增加运行时变体——会让 `object-instantiated`、对象事件与生成计数的消费者把它当作声明；只用 null 而无创建路径——无法校验“无声明的机体只能是构造出的 Xpon”，事件也无从区分。
8. **纳入 `b`（高概率），命令名 `drop-transponder`、无字段，结果与原因码沿用既有集合。** 被排除：不纳入（X5 的依据支持正常玩法，省去它会改变地图的信息可见性）；带参数的命令（原版无参数）。
9. **动态 Xpon 的 `lastParkedUpdateClock` 取创建时钟。** X4 证明 +0x18 的初值对任何可观察量都没有影响，与 P3-06 已批准的交接一致。
10. **脚本级解析计数**（CR-19），按 ai §5.2 的等价条件；被排除：逐条目计数（同样正确，状态更大）。
11. **AI 的 Warp 离场不加事件。** 原版在处理离场时投递移除表现项，Core 的实体在下一 tick 停放后才不再呈现：Render State 多列出一个 tick，记为交 P3-12 的已批准表现差异（随 D-01）。被排除：为此加事件（规则没有消费者，P3-12 尚未提出需要）。
12. **`AiMode` 不加 3、扳机值存为布尔、C+0x11C/+0x160/+0x164 与退出值不存**：这些原版字段或取值在切片中没有写入者或读者（CR-16 至 CR-18）。
13. **数值文本的创建时严格校验（CR-15 的 `invalid-number`）**：切片数据没有尾随文本或超出精度的数，拒绝它们免去复现 `atoi`/`strtod` 的容错路径与陈旧字节怪癖；被排除：完整复现 C 库的容错解析。
14. **执行预算超限为故障，不添加隐式让出或截断**（CR-25）。
15. **攻击航线摆动的 f32 任务时间以 Core 的任务时钟为原点（已批准的差异，随 D-01）。** 原版的 t 来自程序启动时取 `rand() % 30000` 的原始计数，此后经片头、简报与载入持续增加（暂停时扣除），所以任务中的 t 是一个与墙钟和菜单用时相关的、每次运行不同的大值；Core 的 t = F(时钟 ÷ 64) 从世界创建时的 0 起。于是摆动的余弦**相位**相差一个未知常数，f32 量化也不同（原版的 t 更大，分辨率更粗；任务内的量级下差异远小于一个 tick）；周期 P、幅度 M、抽取次数与次序、触发窗口都不受影响。这与 P3-06 已批准的“定时旋转按任务时钟换算的 f32 秒判定”相同（[P3-06 spec](../06/spec.md#运动阶段与积分) 的定时旋转一项），以及本条决定 3、4 的时钟原点取舍一致。D-02 不得逐点比较摆动相位，只比较周期、幅度、窗口与抽取；记入 Core 模块说明与对照结论。被排除：(a) 给 t 加一个固定偏移（例如 30000 ÷ 64 秒或典型菜单用时）——没有依据，仍不能重现原版每次不同的相位；(b) 在世界创建时用世界 RNG 抽一个原点——多一次原版没有的抽取，改变全部后续序列，也不能对上原版；(c) 把摆动改为相对攻击航线开始的时间——改变规则的相位语义，偏离原版。
16. **负的脚本延时等同于 0（已批准的差异，2026-10-15 执行中由协调者按用户授权批准，P3-08/14）。** 真实内容中一个可达脚本（组 0 的条目 4，三个 DFPG 状态 2 的列表都含它）的操作码 1001 带负的角度参数，按真实转向速率得到约 −76 至 −213 时钟单位的延时。原版期限 = 采样 + low32(延时)、在采样 ≥ 期限时结束；采样自程序启动时的 `rand() % 30000` 起经菜单持续累加，实际只在采样 < \|延时\| 时才回绕成长约 777 天的等待，否则在下一次执行器运行时结束。Core 把期限存为 max(时钟 + 延时, 0)（`ScriptDeadline` 保持为非负时钟），负延时在下一次执行器运行时结束，与 0 相同；与原版的差别只在原版采样 < \|延时\|（启动计数很小且立即进入任务）时。CR-15 因此撤销 `negative-delay` 拒绝。被排除：保持拒绝（生产内容无法创建任何世界）；复现 u32 回绕（原点是程序启动时的随机数，不可复现）。
17. **编队停止的速度测试在目标已不存在时取速度 0（已批准的差异，2026-10-15 执行中由协调者按用户授权批准，P3-08/19）。** `0x21c78` 读转向块 S+0x10 的目标而不检查句柄；玩家实体消失后它为空指针，原版读取低地址内存。Core 把不存在的目标的速度视为 0。只在玩家被毁后、僚机距其陈旧编队点 60 以内时可达。被排除：故障（玩家被毁后的正常流程会中止任务）；复现低地址读取（内容不可复现）。
18. **依运行时挂点状态的两处越界读取为运行时故障（2026-10-16 由协调者按用户 2026-10-15 的授权批准，P3-08/33；由 P3-08/17、18 实现）。** AI 锁定 `0x5dfec` 把列表 1 的当前挂点按导弹记录读取（A13）：当前挂点是炮时，炮记录 +0x18 字节为 0 即立即就绪（读取仍在记录之内，Core 照此返回），非 0 则各阶段时间读到炮记录之外（`ai-firing.lock-gun`）。提前量模式 5 读列表 0 当前武器的速度（`0x2dd38`，A3 的提前量）：列表为空时原版不写结果而读到栈上的陈旧值，Core 只从当前的炮的记录取速度，没有当前的炮即故障（`ai-piloting.main-weapon`）。切片的真实内容都不触发：开启 AI 锁定的 AI 机体列表 1 没有炮（P3-08/18），提前量模式 5 的空列表不可达（P3-08/17）。二者抛出 `CoreFaultError`，列入 CR-15 的运行时故障。被排除：(a) 创建时拒绝——条件取决于运行时的挂点状态（当前挂点随选择、弹药与损毁改变），创建时只能按全部可达的挂点组合保守判定，既要新的可达性分析，又会拒绝运行中从不触发的合法内容；(b) 复现越界读取——读到的是记录之外的内存或栈上的陈旧值，内容不可复现。

#### CR-25 容量、快照与版本（D-01）

- **执行预算（`CORE_LIMITS` 新增；项目的防失控预算，原版没有上限）：**
  - `aiDispatchesPerRun` = 1,024：一次执行器运行（`0x5f4f4` 从入口到让出或结束）分派的条目数。依据：支持集中没有 9001/9002，栈深恒为 0；内容的脚本条目上限为 128（`AI_PROGRAMS_LIMITS.scriptItems`），无环脚本的一次运行至多分派 128 个条目；预算允许每个条目在一次运行中被重复分派 8 次，留给经由测试分支退出的环路。组 0 闭包的最大值为 18（ai §12；执行闭包是其子集，不超过此值），约为其 57 倍。
  - `aiDispatchesPerTick` = 131,072：一个 tick 内全部运行的分派总数。依据：每个对象每 tick 至多 2 次运行（安装时的安装脚本运行与首次更新，ai §12），实体上限 2,048 × 2 × 18 = 73,728 在其之内，所以切片内容在任何实体数下都不触发；它防止 2,048 个对象都运行病态脚本时一个 tick 卡住。
  - 都在分派**之前**检查（`fitsLimit`）；第 limit 次分派允许、第 limit + 1 次为 `CoreFaultError('budget-exhausted', …)`，两项的位置分别为 `ai.dispatches-per-run` 与 `ai.dispatches-per-tick`，以合成的环路脚本分别断言。不靠宿主时间，不静默截断、假装结束或额外让出。
- **结构上界（不另设上限，以不变式断言）：** 返回栈 ≤ 8（原版的槽数；支持集中恒为 0）；存活执行状态 ≤ 带表程序控制器的实体数（每个控制器至多一份）加安装调用中的 1 份不持久状态；解析缓存项数 ≤ 支持闭包的脚本数（内容上限 64），每项条目数 ≤ 128，`uses` ≤ 实体上限 + 1。
- **请求：** `requestsPerTick` 由 16,384 改为 32,768。依据（CR-14 的切片规模，32 个 AI 机体都按最坏的表程序计）：每个机体每 tick 至多 2 次执行器运行（安装时的安装脚本运行与首次更新），每次运行每个分派的条目至多投递 3 个请求（操作码 1101 的攻击航线：油门与规避的两个；操作码 100 为 2 个），入口的保持步 2 个，状态机规则 1 的规避 2 个，份额的离场请求 1 个：2 × (3 × 18 + 2 + 2 + 1) = 118（僚机每次更新与基地安装都少于此）；`create-transponder` ≤ `commandsPerTick`（`deliver-command` 计入 P3-10 的 CB-16）。AI 合计 32 × 118 + 64 = 3,840，加 CR-14 的 3,523 为 7,363；再加 P3-10 CB-16 的新增 131 为 7,494，新上限约为其 4.4 倍（不改时只有 2.2 倍）。
- **事件：** `eventsPerTick` 不变（32,768）。新增项：`wingman-command-consumed` ≤ 种类 2 的实体数（切片 ≤ 32），`transponder-deployed` ≤ `commandsPerTick`（64）；合计 96，总计 8,356（回复的 `radio-queued` 计入 P3-10 的 CB-16）；与 P3-10 CB-16 的约 600 及 P3-09 的新增合计仍约在 9,000 以内，上限约为其 3.6 倍以上。
- **快照：** 覆盖 CR-16 至 CR-20 的全部新状态（`ai.program` 含控制器与私有状态、`transponder`，以及 `WorldAiState` 的解析缓存）；`ai.pendingCommand` 与友伤累计按 CB-16，两个集合与 `mapVisible` 按 MW-14 计入（D-03，CR-29）；静态 AI 数据不进快照。规范文本：解析缓存按脚本序号、其他列表按语义次序。长度：每个带控制器的机体约增加 2 KiB，解析缓存按内容上限至多约 2 MiB（真实内容约 0.5 MiB）。2026-10-15 执行中 P3-08/23 按 budget 测试的方法实测：所有数值取最长时，无挂点约 13.3 MiB，每机体每挂点再加 396 字符，18 个挂点约 20.25 MiB，`CRAFT_INFO_LIMITS.mounts` 的 32 个挂点约 25.7 MiB；P3-07 至 P3-10 的状态本身在 32 挂点时已约 21 MiB，CR-14 的 10.5 MiB 是按典型数值与 18 挂点的估算，不是严格上界。协调者依用户授权决定：`canonicalTextLength` 由 16 MiB 提高到 32 MiB（2²⁵），budget 测试断言严格的最坏情形（1,025 个机体、32 挂点、最长控制器、所有数值取最长、P3-08/09/10 各部分取上限，约 25.7 MiB）在其内，超过仍为故障；setupHash 的文本上限随之放宽，每次哈希的临时单字节字符串至多 32 MB。被排除：保持 16 MiB 并把超出改称失控故障（保证变弱且几乎没有余量）；24 MiB（不覆盖 32 挂点的内容上限）。
- **版本：** 相对实现时的实际集成基线各递增一次，不硬编码：`RULES_VERSION`（当前为 4，预计为 5：AI 抽取、行为与 `steer`/速度匹配的接受范围改变既有结果）；快照格式版本（当前为 3，预计为 4：状态形状改变）；**replay 格式版本**（`GAME_REPLAY_VERSION`，当前为 2，预计为 3）也递增：命令联合加入 `drop-transponder` 改变了录制允许的输入形状，依 P3-05 的先例（本 spec 的“P3-05 的契约修订”）。replay 记录的字段与结构不变，内容输入仍经 setupHash 绑定；旧记录在执行前因版本不符被拒绝，不迁移。P3-08 的 goal 在其分支上由首个实现共享形状的子任务递增，此后沿用。**合并后的实际值（2026-10-16 注，P3-08/33）：** P3-09 与 P3-10 合入之后（[审批](#审批)的 2026-10-15 合并说明：规则 6、快照 5、replay 2），本分支实际为 `RULES_VERSION` 7、快照格式版本 6、replay 格式版本 3，转换器版本为 `osr-import.graphics-5.logic-4.audio-2.models-4`（`graphics-5` 来自 P3-09 的地图几何，`logic-4` 来自 D-03 的 CR-26）；上文“当前为 4/3/2、预计为 5/4/3”是起草时的数值，保留为历史。

**对前文各节的修订（只列变化，均随本节获批）：** CR-02 的 `craft` 行由 P3-10 的 CB-18 改写（合入后），与 CR-20 一致，本节不改该行；CR-02 中 `lock` 的“其他对象保持初值”改为 AI 也写入（CR-16），`MountState.retargetClock` 的判定见 CR-24 决定 3；P3-02 的“实体与生命周期”中由缺省得到的运行时规则输入，+0xE0 改为可由 `0x5e4d0` 写回（CR-16）；P3-06 检查点 A（D-02）把 `lastParkedUpdateClock` 定为非负，本节放宽为 ≥ −0x80（CR-21）；CR-05 的 `steer` 主体与新请求见 CR-21；CR-06 的新事件见 CR-22；CR-07 的实例化扩展点与对象更新见 CR-23，“对象集合（`0x2ede0`）”一项见 MW-06 与 CR-29（D-03 修订）；CR-01 的 `models` 集合完整规则与 `aiPrograms` 的扩展读取见 CR-15；CR-14 的请求上限、版本与快照见 CR-25。

### P3-09 的契约修订（D-01）

本节由 P3-09 的子任务 08 加入（2026-10-14），定稿 [P3-09 spec](../09/spec.md#实施关卡) 的关卡 D-01 中属于本 spec 的部分（内容输入的部分在 [P3-03 的修订 2](../03/spec.md#p3-09-的修订地图几何修订-2)）。它建立在 P3-06、P3-07 与 P3-05 的修订之上，那些修订已定的项不变；前文与本节不一致时以本节为准。

原版事实只记在 [executable 的 Strategic map and Warp (P3-09)](../../../original/formats/executable.md#strategic-map-and-warp-p3-09) 各小节，下文以“地图模式”“光标与标记”“接触点”“放大窗口”“Warp 开始”“Warp 过程”“数值与阶段”指代其六个子节与 07 的汇总节，不重复。定稿依据是 P3-09 子任务 01 至 07 的完成证据，尤其是 [07 交 08 的汇总表](../09/subtasks/07-numerics-stages-original-docs.md#完成证据)（下文“07 表”）。编号 MW-01 至 MW-16 只供引用本节。

**记法与通则：** 沿用 [P3-07 的修订](#p3-07-的契约修订d-01d-03)的记法（f32、i32、时钟、`EntityId`、故障、快照与“不持久”“静态”）。新增状态都由 Core 拥有。

**与并行任务：** P3-08、P3-10 若在各自分支上修订本 spec 的同一阶段或字段，合入时 `object-sets` 阶段、地图可见标志与两个集合、地图与 Warp 状态以本节为唯一定义，对方复用，不另建（[P3-09 spec 的可见性与迷雾](../09/spec.md#可见性与迷雾)）；版本号相对实际集成基线各递增一次。

#### MW-01 世界创建输入与静态规则数据

- **输入：** `CreateWorldInput`、录制入口与 `ReplayContent` 增加必需的 `mapGeometry: { id: AssetId; content: unknown }`（与 CR-01 的规则输入相同：`content` 是调用边界上未经信任的解码结果，只经读取器进入世界；读取后的规范形状是 P3-03 修订 2 的 `MapGeometry`，没有其他字段）：同一经 `validatePackage` 验证的包中角色 `map-geometry` 的 Asset（`data/hud/map-geometry`，[P3-03 修订 2](../03/spec.md#p3-09-的修订地图几何修订-2)），由内容读取器 `readMapGeometry` 严格读取，冻结并与输入脱离。外层字段错误为 `CoreInputError`，Asset ID 或内容错误保留读取器的 `ContentContractError`；错误不回显导入值。
- **语义检查（`CoreInputError`，按此次序）：** 记矩形为 {x0, y0, x1, y1}（含末像素），s = y1 − y0 + 1。
  1. **重绘间隔：** `redrawInterval` 为 0 或小于 `clockUnitsPerTick`，使每个 tick 的帧尾都执行地图步（MW-07）。原版发行记录每帧绘制（[cockpit 的 10 型记录](../../../original/formats/cockpit.md#instrument-types-per-slot-confirmed-p3-0730)）；其他取值下仪表调度器的首次绘制时刻未研究，属切片外。
  2. **起点：** h = (s − 1) >> 1（带符号截断，从画面原点量起）满足 x0 ≤ h < x0 + s 且 y0 ≤ h < y0 + s（地图模式；发行数据满足）。
  3. **比例：** 按“光标与标记”的 `0x49e74` 算出的 ppX、ppY、wppX、wppY 与放大窗口的两个比例都是有限正 f32。
  4. **玩家机型的 Warp 字段**（只检查种类位 0 的声明所绑定的机型记录；原版只有玩家记录到达这些路径，其余记录不读也不拒绝，07 表最后一行）：数值对至少一对（原版计数 ≤ 0 时读数组之前的字，未定义）；+0xA8 > 0（为 0 时进度的 1 ÷ L 除零）；+0xB8 > 0（进度的除数）；0 ≤ +0xA4 < 2²⁵（`SHL 6` 不溢出；负值的 u32 回绕不复现，与 CR-01 对负时长的处理相同）。f × +0xA8 ≤ 1 是原版合法分支（Warp 在开始的同一 tick 完成），保留；代价的 `IMUL` 按 i32 回绕实现，不拒绝。
- **静态规则数据（`WorldRuleData.map`，冻结，不进快照）：** 创建时按“光标与标记”的 `0x49e74`、`0x3a41c` 与 `0x2b814` 计算一次：

  ```ts
  interface MapPixel { column: number; row: number }      // 光标像素：主地图内相对其原点的整数，0 ≤ column、row < s
  interface MapPoint { column: number; row: number }      // 投影像素：相对主地图（或放大窗口）原点的整数，[−32768, 32767]（原版 i16）；
                                                          // 可以等于 s 或落在矩形之外（世界最大值上的对象、世界外的玩家与僚机、错开后的像素）
  interface PixelRect { x: number; y: number; width: number; height: number } // 画面像素；x ≤ px < x + width，y 同理
  interface MapRuleData {
    side: number;                                // s
    main: PixelRect;                             // (x0, y0, s, s)
    information: PixelRect;                      // (x0 + s, y0, x1 − (x0 + s), s >> 1)
    zoom: PixelRect;                             // (x0 + s, y0 + (s >> 1), x1 − (x0 + s), s >> 1)
    startPixel: MapPixel;                        // (h − x0, h − y0)：每次打开地图时的光标
    world: { minX: number; minY: number; maxX: number; maxY: number }; // i32 运行时单位：±7500 × 扇区数
    pixelsPerUnit: { x: number; y: number };     // f32 ppX、ppY（0x186464、0x186468）
    unitsPerPixel: { x: number; y: number };     // f32 wppX、wppY（0x18646c、0x186470），取未舍入双精度的倒数
    zoomExtent: { x: number; y: number };        // 整数运行时单位：trunc(运行时比例 15000) 与其两倍（0x18648c、0x186490）
    zoomPixelsPerUnit: { x: number; y: number }; // f32（0x186494、0x186498），由放大窗口尺寸 ÷ zoomExtent
    informationLineHeight: number;               // 导入的字体 1 字形高度
    informationCapacity: number;                 // i32：(s >> 1) ÷ informationLineHeight，带符号整除
  }
  ```

  另有 `startupRotations: readonly Matrix3[]`（恰 64 项，f32 行，原版 `0x1b0a10`）：静态、不进快照，生成方式见 MW-12 的前置研究 R-A。
- **setupHash：** 在 CR-01 的 `aiPrograms` 之后覆盖 `mapGeometry` 的 ID 与完整内容（三个字段都是规则数据）。
- **记录 +0x7C（始终在地图上显示）不进入 `MissionSetup`：** 对象记录读取器已把 +0x7C 列为保留字，非零时以 `unsupported-payload` 拒绝导入（[scenario §3](../../../original/formats/scenario.md#3-132-byte-object-record-structure-confirmed-fields-partly-likely)；切片的 9 条记录与 5 条僚机记录都为 0）。所以由内容实例化的机体的地图可见基础值恒为 false，Core 不需要该字段。运行中创建的机体（`0x4000`，P3-10）原版 +0x190 为 0，读到的值没有读者（接触点），基础值同样取 false。将来支持非零 +0x7C 时，须同时修订 P3-03 的对象记录与本节。

#### MW-02 玩家状态与世界状态

`PlayerState` 增加：

```ts
map: {
  cursor: MapPixel;          // 0x1a98ec 的点减主地图原点，0 ≤ column、row < s。创建时与每次打开地图时为 startPixel；
                             // hover 与 select 写入。光标世界点（ps +0x04）与放大范围由它派生（0x4c4c0、0x2bc30），不另存
  destination: Vec3 | null;  // ps +0x10–+0x18（f32）；null ⇔ ps +0x00 = 0。创建与玩家实例化时为 null，只由 select 写入
};
savedLeftPage: LeftPage;     // 0x187020：Warp 开始保存当前页，离开视角 1 时恢复（MW-09）。初值 0，首次保存之前没有读者
warp: WarpTransit | null;    // Warp 过程的全局量。本世界首次 Warp 开始之前为 null；每次开始整体重置；完成与放弃都不清除
                             // （原版全局保留旧值，只在视角 1 中被读取）

interface WarpTransit {      // “Warp 过程”的全局表
  serial: number;            // 本世界中第几次 Warp 开始，从 1 起；关联 warp-started 与 warp-completed
  origin: Vec3;              // 0x1864c8，f32：开始时玩家的位置（出发点，不是目的地）；完成时的扣费距离从它量起
  length: number;            // L（0x175fcc），f32 > 0
  segments: number;          // n（0x175fd0），f32，开始时 1.0，每完成一段加 1
  fraction: number;          // u（0x175fc8），f32，[0, 1)
  error: number;             // s（0x175fdc），f32，[0, 1]
  angle: number;             // a（0x175fd8），f32，[0, 1]
  centring: number;          // c（0x175fd4），f32，[0, 1]
  frame: { position: Vec3; orientation: Matrix3 };  // G：上一次路径位姿，f32
  path: readonly Vec3[];     // 隧道路径（0x1a9f70），恰 15 个控制点，私有坐标系；分量为 f32（与 Warp 过程的其他全局一致，高概率；由 R-B 核实）
}
```

- **ps +0x00（选择资格）：** 由 `destination !== null` 派生，不另存布尔值（光标与标记：只由首次选点置 1，只由玩家实例化清 0）。原版未选择时的存储点 (0, 0, 0) 从不被当作目的地，Core 以 null 表示。
- **光标：** 打开地图时重置；关图保留但没有读者。光标世界点与放大范围在地图步与 projection 中按 MW-07 由 `cursor` 计算，与原版每帧由鼠标块的点重算一致（地图模式的状态表）。
- **字段的生命周期：**

  | 字段 | 写入者（阶段） | 关闭地图 | 再次打开 | 玩家实体移除 | 救援 | 重试 |
  |---|---|---|---|---|---|---|
  | `map.cursor` | 打开、hover、select（请求处理） | 保留 | 重置为起点 | 保留（无读者） | 保留 | 新世界 |
  | `map.destination` | 玩家实例化（null）、select（请求处理） | 保留 | 保留 | 保留 | 保留 | 新世界 |
  | `savedLeftPage` | Warp 开始（请求处理） | — | — | 保留 | 保留（视角切换按 MW-09 恢复页面） | 新世界 |
  | `warp` | Warp 开始；帧尾的 Warp 步 | — | — | 保留 | 保留 | 新世界 |

`Entity` 增加 `mapVisible: boolean`（+0xD4）：只对机体种类（位 0–19）由 `object-sets` 与揭示写入（MW-06），其他种类恒为 false；分配时为 false（原版分配器不初始化它，但在下一次重建之前没有读者）。

`WorldState` 增加：

```ts
objectSets: { friendly: readonly EntityId[]; hostile: readonly EntityId[] }; // 0x174b74、0x174b78；创建时都为空
mapIcons: readonly MapIcon[];   // 0x1a34e0 的图标列表：视角 8 的帧尾建立；其他视角的帧尾清空

interface MapIcon {             // 一项 100 字节记录中规则读取的部分
  entityId: EntityId;
  kindBit: number;              // 记录 +0x24；选点只排除位 0（玩家）
  position: Vec3;               // 记录 +0x00–+0x08，f32：建立列表时的位置；选点的 z 读它
  pixel: MapPoint;              // 记录 +0x0C/+0x0E：0x4c524 的主地图像素（i32 的低 16 位按带符号 i16），再经 0x4b3a8 错开
  inWorld: boolean;             // 记录 +0x28：0x4c524 的结果（含端点）
}
```

- **两个集合**每个 tick 重建，并在揭示中移除失效的 ID（保持次序）；僚机 AI 在下一 tick 的对象更新中读取上一次重建的集合（P3-08），所以两者与每个实体的 `mapVisible` 都跨 tick 保留并进快照（接触点；07 表）。
- **图标列表**只由帧尾的地图步写入，选点在下一 tick 的请求处理中读取（数值与阶段）。原版关图后保留最后一次地图帧的列表；Core 在视角不是 8 的帧尾把它清空。两者只在同一 tick 先打开再选点时可区分（原版不可达，MW-12 的差异 1）。放大窗口坐标、覆盖半径、友方标志等其他记录字段在 projection 中由列表、状态与静态数据派生，不另存。

#### MW-03 种类 25 的地图标记

- **战斗状态：** `combatTypeOf(25)` 为 `'marker'`，`EntityCombat` 增加 `MarkerCombat = { type: 'marker' }`（无战斗字段）。
- **表现：** `EntityPresentation` 增加 `{ type: 'map-marker' }`。原版场景步跳过标记（没有 3D 表现），渲染器不为它绘制 3D 对象；它仍在 Render State 中列出。
- **名称：** `NameReference` 增加 `{ type: 'map-marker' }`，消费者解析为 `hud-text` 的 `mapMarkerName`（EXE `0x171860`，T7 已确认作为目标名称绘制）。不硬编码原版文字，不经名称分配。
- **移动块：** `MovementBlock` 增加 `MarkerMovementBlock = { readonly mode: 'marker'; readonly speed: 0 }`（原版模式 4：`0x21794` 清零移动块 +4–+0xA3，所以 +8 的速度为 0）。运动阶段不积分它（原版 `0x221fc` 对模式 4 没有积分）；读 `speed` 的规则（速度匹配、目标读数）得到 0。原版复制到块 +0x0C 的创建位置没有读者，不存。
- **P3-06 字段与其他：** 取分配器缺省（`ai` 为模式 5、目标为空、零向量；`formation` 为 null；`lastParkedUpdateClock`、`warpClock` 为 0；`inWarp` 为 false）；`maximumSpeed` 为 0；`ruleInputs` 为 0；`source`、`side` 为 null；`baseInteraction` 为 false；`mapVisible` 为 false。
- **创建：** 只由 select 在请求处理中、且应用前 `destination` 为 null 时创建（光标与标记的 `0x3cb80`）。次序：分配（状态“表现就绪”，活动），位置为新的目的地，**1 次世界抽取**：姿态 := `startupRotations[rand % 64]`。不发 `object-instantiated`（它只表示任务实例化），由 `warp-destination-set` 的 `marker.type: 'created'` 报告。本世界至多一个标记：已有标记时再创建为 Core 故障。
- **移动：** `destination` 非 null 时的 select 取种类 25 表的第一个实体，把位置改为新的目的地（不看状态与活动），放置序号加 1。没有标记时（高概率不可达）照常写目的地、z 与事件，`marker.type` 为 `'missing'`，不重新创建（ps +0x00 已为 1）。
- **生命周期：** 沿用 P3-02 的通用转换：创建的下一 tick 在自身更新中请求活动，同 tick 的请求处理中进入状态 7。不参与碰撞、能量、对象集合、地图接触点、停放更新与区域检查（各自的种类掩码不含位 25；区域检查 `0x1fffffe` 也不含，所以从不停放或移除）。雷达在其状态 7 起给出 `marker` 类接触点；友方目标掩码 `0x206c87e` 使它成为友方候选；Warp 完成的最近对象搜索包含它。只在任务拆除时移除（高概率，P3-11）。
- **须同步的封闭分支：** 实体表的种类与字段校验、快照写入器、Render State、运动筛选、目标读数（`CombatTarget` 的 `shield` 为 null、`speed` 为 0）、雷达（已有 `marker` 类）、P3-07 的锁定计数 `0x2ddbc`（友方种类 `0x206c87f` 含位 25，实现须不读机型记录）。P3-08 的 `0x5db12` 对标记目标以 0 代替记录 +0x10。

#### MW-04 命令、原因码与内部请求

- **原因码：** `COMMAND_RESULT_REASONS` 增加 `no-destination` 与 `insufficient-energy`。三种命令未被接受时一律为 `ignored`（原版的拒绝都无提示、无音效，Warp 开始）。
- **有效上下文：** 命令批次开始时，有效视角与有效上一视角取已提交的值；每个被接受的 `toggle-map` 与 `request-warp` 按下文更新它们。有效目的地取本批次中最后一个被接受的 select 的点，没有时取已提交的 `destination`。**每条命令**（含 P3-06、P3-07 的命令）都按判定时的有效视角推出交互上下文；P3-06 的轴在命令循环之后按最终的有效上下文处理（map、base 为 0）。CR-05 的共同前置判定不变。
- **`toggle-map`（地图模式）：**
  1. 有效上下文为 `map` → `accepted`（关闭），**不检查玩家是否可用**（项目决定，07 表：原版玩家被毁时视角已被被毁视角取代，不会在地图中；P3-11 接入前 Core 可能出现被毁仍在地图中，不能因此关不掉地图）；
  2. 玩家不可用（CR-05：实体不存在、已被毁、状态不是 7 或待移除；活动为停靠的玩家可以通过）→ `player-unavailable`；
  3. 有效上下文为 `warp` → `wrong-context`（Warp 的按键上下文没有 `m`）；
  4. `flight` 或 `base` → `accepted`（打开）。原版只在战役中打开（`0x33504`）；Core 只运行战役切片，练习模式在创建时就不存在，所以这一条恒满足，不建对应原因码。

  接受后有效视角按打开（上一视角 := 有效视角，视角 := 8）或关闭（交换）更新，并投递请求 `map-toggle`。通讯菜单对 `m` 的占用（≥ 22 项的对象列表菜单）由 P3-10 加在第 1 步之前。
- **`map-point`：** 玩家不可用 → `player-unavailable`；有效上下文不是 `map` → `wrong-context`；否则 `accepted`，在判定时量化：column = min(⌊right × s⌋, s − 1)，row = min(⌊down × s⌋, s − 1)，投递 `map-point` 请求。
- **`request-warp`（Warp 开始的门禁表，次序如下）：**
  1. 玩家不可用 → `player-unavailable`；
  2. 有效上下文为 `warp` 或 `base` → `wrong-context`；
  3. 有效上下文为 `map` 且有效上一视角为 6（从基地打开的地图）→ `wrong-context`；
  4. 有效目的地为 null → `no-destination`；
  5. `warpClock` ≠ 0 且 `warpClock` + 64 × +0xA4 > 时钟 → `cooldown`（相等时通过）；
  6. c > E → `insufficient-energy`，其中 E 为玩家的 `combat.energy`，c = `0x30d2c`(trunc(`0x56b14`(玩家位置, 有效目的地)))（Warp 开始的第 4、5 步）；c ≤ E 通过（恰够通过）；
  7. 否则 `accepted`：有效上一视角 := 有效视角，有效视角 := 1，投递 `warp-start` 请求。

  零距离（c = 0）照常接受；标记是否有效不影响门禁（原版从不读标记）。同一 tick 的第二个 `request-warp` 在 `warp` 上下文中为 `wrong-context`，不会两次开始或扣费。通讯菜单对 `w` 的占用（≥ 32 项）由 P3-10 加在第 1 步之前。
- **地图上下文中的其他命令：** `select-number`、`confirm-selection`、`navigate-selection` 改为 `ignored`/`wrong-context`；P3-06、P3-07 的命令已是 `wrong-context`；`communications`、`launch` 仍为 `not-implemented`（P3-10）。Warp 上下文中 `toggle-map`、`map-point`、`request-warp` 为 `wrong-context`。
- **内部请求：** P3-02 的 `Request` 联合增加：

  ```ts
  | { type: 'map-toggle'; commandIndex: number }
  | { type: 'map-point'; operation: 'hover' | 'select'; pixel: MapPixel; commandIndex: number }
  | { type: 'warp-start'; commandIndex: number }
  ```

  它们在请求处理中按投递次序应用，应用时不再判定。玩家位于种类遍历之首，它的请求只排在任务流程投递的请求之后；其前没有能改变上述判定输入（时钟、`warpClock`、玩家位置与能量、目的地）的请求，所以判定结果等于原版在消息处理时的结果。早先投递的 `control`、`launch`、`select-target` 请求按投递次序在它们之前或之后应用，不被追溯改写；唯一例外是 `warp-start`：它不在判定时立即投递，而是在玩家更新中排到 P3-06 的 `control`/`match-speed` 与 P3-07 释放的玩家发射请求之后投递（仍在自动选敌之前），使同批中先于 `request-warp` 被接受的命令的效果先于 Warp 设立应用（MW-12 的差异 9）。
- **应用：**
  - **`map-toggle`：** 已提交的视角为 8 时关闭：视角 := 上一视角，上一视角 := 8；否则打开：上一视角 := 视角，视角 := 8，`map.cursor` := `startPixel`。两者都不写左显示屏、`statusDisplay.redraw` 与玩家目标；关回基地不清目标（地图模式）。视角变化经 MW-09 的视角切换函数（地图本身没有规则副作用，6 的副作用归 P3-10）。发出 `map-toggled`。
  - **`map-point`：** `map.cursor` := `pixel`。hover 到此为止，不发事件。select 继续：`destination` := `0x4c4c0`(pixel)（z = +0.0）；按 MW-07 的选点在 `mapIcons` 中找图标，命中时 z := 该图标记录的 `position.z`，否则 +0.0（ps +0x8C 在此路径上恒存在）；随后按 MW-03 创建或移动标记；发出 `warp-destination-set`。坐标不变的 select 照常重写并发事件。
  - **`warp-start`**（Warp 开始的提交、派发器的视角写入、`0x3f158(1, old)` 与 `0x50188`，次序如下）：
    1. `warp.origin` := 玩家位置；`inWarp` := true；玩家目标 := null（不发 `target-changed`，CR-09）；移动块模式 := `'warp'`；L := F(f × +0xA8)（Warp 过程的 `0x50068`，f 由 R(d) 与扇区尺寸得出）；
    2. 上一视角 := 视角，视角 := 1；`savedLeftPage` := 当前页，页 := 6；
    3. 路径设立：15 个控制点，点 5–14 各 **2 次世界抽取**（共 20 次，先 x 后 y）；位姿 := 路径在第 1 段、参数 0 处的值，写入玩家的位置与姿态，放置序号加 1；移动块 `atCommandedSpeed` := false、`speed` := 0、`commandedSpeed` := 机型 +0xB8；G := 同一位姿；s、a、c := 0，n := 1，u := 0；`serial` 加 1；
    4. 发出 `warp-started`，随后在页面改变时发出 `commandIndex` 为 null 的 `left-page-changed`。

    不写能量、`warpClock` 与 `statusDisplay.redraw`（Warp 开始：原版不置重绘；P3-09 spec 原先列入的重绘按此更正）。原版设立中另有 40 次表现抽取，不在 Core 中（MW-12）。
- **自动选敌：** P3-07 的自动选敌在命令批次之后读**已提交**的视角（请求尚未应用），与原版同帧读取开始前的视角一致；它投递的 `select-target` 排在本 tick 的 `map-toggle`、`warp-start` 之后应用。

#### MW-05 领域事件

```ts
| { type: 'map-toggled'; tick; open: boolean; viewMode: number; previousViewMode: number; commandIndex: number }
| { type: 'warp-destination-set'; tick; playerEntityId: EntityId; destination: Vec3; pixel: MapPixel;
    icon: { entityId: EntityId; kindBit: number } | null;
    marker: { type: 'created' | 'moved'; entityId: EntityId } | { type: 'missing' }; commandIndex: number }
| { type: 'warp-started'; tick; playerEntityId: EntityId; serial: number; origin: Vec3; destination: Vec3;
    distance: number;                       // R(d)：f32 的开始距离
    check: { cost: number; energy: number }; // 门禁第 6 步的 c 与 E（i32）；是检查量，不是扣费
    transitLength: number; fromViewMode: number; commandIndex: number }
| { type: 'warp-completed'; tick; serial: number; viewMode: number; previousViewMode: 1;
    arrival: WarpArrival | null }           // 玩家实体不存在时为 null（只恢复视角与页面）

interface WarpArrival {
  playerEntityId: EntityId; origin: Vec3; destination: Vec3; position: Vec3; orientation: Matrix3;
  error: number;                            // 完成时的 s
  snapped: EntityId | null;                 // 最近对象吸附所取的对象（可能是玩家自身或标记）；未吸附为 null
  charge: { distance: number; cost: number; energyBefore: number; energyAfter: number }; // trunc(D)、c、扣费前后的 E（i32）
  warpClock: number;                        // 新的 +0xC8
  hostileNear: boolean;                     // 0x3c040：某个种类在 0x93780 中、未被毁、状态 ≥ 7 或为 4 的对象与到达点的距离严格小于玩家机型 +0x0C；供 P3-14 的到达音 10181
}
```

| 事件 | 发出时机与语义 |
|---|---|
| `map-toggled` | 请求处理中应用 `map-toggle` 时。地图本身没有原版音效 |
| `warp-destination-set` | 请求处理中应用每个 select 时，坐标不变也发出：对应原版每次左键读取的点击音效 10463（P3-14）。hover 不发 |
| `warp-started` | 请求处理中应用 `warp-start` 时，在其 `left-page-changed` 之前。对应开始音效 10401 与音频状态切换（P3-14）。`check` 是开始时的门禁量，实际扣费只在完成时 |
| `warp-completed` | `warp-completion` 阶段完成时，每次 Warp 恰一次，在恢复页面的 `left-page-changed` 之前。耗尽不在此发出：扣费到 0 时由下一次到期的能量更新发出 `energy-depleted`（Warp 过程第 8 步） |

- 字段沿用 CR-06 的通则：脱离世界的快照，不另带 `clock`（时钟恒为 tick × `clockUnitsPerTick`），位置为有限运行时 `Vec3`。同一次 Warp 的开始与完成用 `serial` 关联。
- **没有取消或中断事件：** 原版没有取消；被毁或救援只是放弃 Warp（MW-09），由 P3-11 的被毁与救援事实表达，Warp 一侧不另造事件。
- **一个 tick 内的次序：** 请求处理中按请求次序；`warp-completed` 在 `warp-completion` 阶段；比较器的事件字段表随之扩展。

#### MW-06 对象集合与地图可见标志（`object-sets` 阶段）

- **每个 tick 重建**（接触点的 `0x2ede0`）：原版的节流分支只在程序的第一遍执行，Core 每个 tick 都重建，没有刷新历史状态。按种类表次序遍历种类位 0–19（不看状态、活动、被毁与 Warp）：先令 `mapVisible` := false（MW-01：基础值），再把实体 ID 加入 `hostile`（种类在 `0x93780` 中）或 `friendly`（其余）。玩家是 `friendly` 的第一项。
- **揭示**（`0x2ee60`）是 Core 的一个共享规则函数：`object-sets` 在已提交的视角为 8 时于重建之后调用它；P3-08 的僚机 AI 在任何视角以上一次重建的集合调用同一函数（不另建）。规则按“接触点”：逐个友方 ID（失效的移除，次序不变）置 `mapVisible` := true，r = 其机型 +0x0C；每个 `mapVisible` 为 false 的敌方（失效的移除）在严格的平面距离 D(D(dx²) + D(dy²)) < D(F(r)²) 内（无序比较算在内）时置 true；本次揭示的数目等于敌方集合大小时立即返回。
- **读者：** 地图步（MW-07）、揭示自身与僚机的目标搜索（P3-08）。目标候选、雷达、碰撞、伤害、停放更新、能量与区域检查都不读它们；不给这些系统加全局迷雾门禁。
- **没有探索历史**（接触点，已确认，代码；运行佐证交 P3-09/09）：覆盖只来自当前接触点，不存网格或历史。

#### MW-07 帧尾：地图步与 Warp 步

`frame-end` 阶段内的次序：P3-09 的地图步（已提交的视角为 8）或 Warp 步（视角为 1 且玩家实体存在；两者互斥）→ CR-10 的驾驶舱显示步（视角集合不含 8）。

- **地图步**（原版相机步中的 `0x2b8ec` 与帧渲染中的地图绘制 `0x49f8c`）：
  1. **接触点：** 按种类表次序遍历种类位 0–19：敌方种类（`0x93780`）且 `mapVisible` 为 false 的跳过（友方种类不看可见标志）；`inWarp` 或状态为待移除（6）的跳过；在世界矩形内（含端点，无序算在外）或种类位为 0、1 时保留。
  2. **图标列表：** 每个接触点一项（MW-02 的 `MapIcon`），位置取当前位置，像素与 `inWorld` 按 `0x4c524`；然后按 `0x4b3a8` 错开重合像素（放大窗口），结果替换 `mapIcons`。错开的次序是规则的一部分（它改变下一 tick 选点命中的图标与 z）：每项有自己的计数 k，开始时为 0；第 0 项从不移动；对 i = 1 … 项数 − 1，从 j = 0 起依次检查 j ≠ i 且第 j 项 `inWorld` 为真的项，第 i 项的像素等于第 j 项时，第 i 项按自身计数的下一步移动、k 加 1，并从 j = 0 重新检查；相对原像素的累计偏移在 k = 0…7 时依次为 (+3, +3)、(−3, +3)、(−3, −3)、(+3, −3)、(+3, 0)、(0, +3)、(−3, 0)、(0, −3)（column、row），k = 8 时回到原像素并结束第 i 项的检查；`inWorld` 不重算。放大窗口的同类错开 `0x4b56c` 按 HUD 图标记录（`0x1a98e0`，按种类）的宽高错开，只影响绘制，没有规则读者，由 P3-13 在绘制中实现；projection 给出未错开的像素（2026-10-14 执行中按预先授权更正，审批第 14 项）。
  3. 光标世界点与放大范围由 `map.cursor` 派生，不写状态。
- **其他视角的帧尾：** `mapIcons` := 空。
- **选点**（`0x4c310`，供 MW-04 的 select）：候选为 `inWorld` 且 `kindBit` ≠ 0 的图标，其像素与点击像素在每轴 ±3（含端点）之内；按整数 d = Δcolumn² + Δrow² 取最小，并列取先出现者；没有候选为未命中。
- **Warp 步**（Warp 过程的 `0x50508` 与 `0x50a28`，每个 tick 一次）：δ = 移动块速度 × 本 tick 的步长（与运动阶段的 `motionStep` 相同）；u、n、路径平移（每完成一段 **2 次世界抽取**）、路径求值、横向偏移、30° 锥、居中 c、误差 s（只在 0.05 < (n + u) ÷ L < 0.95 内累加）、撞墙与钳 1，最后写玩家的位置与姿态（不改放置序号：位姿连续）、G 与 `warp` 的各字段。帧率相关的增量按每 tick 一次执行（MW-12 的差异 3）。
- **进度：** p = F((n + u) × F(1 ÷ L))，不小于 1 时为 1.0；不存储，由读者计算（原版 `0x509c0` 亦然）。

#### MW-08 Warp 完成（`warp-completion` 阶段）

- **触发：** 已提交的视角为 1，且以 `warp` 当前值算得的 p 为 1.0。它读的是上一次帧尾留下的进度，或同一 tick 开始时复位的进度（f × +0xA8 ≤ 1 时在开始的 tick 完成）；完成检查自身不推进进度（数值与阶段）。原版的视角 2 分支没有发送者，不实现。
- **写入**（Warp 过程完成的第 2–9 步）：
  1. v := 上一视角（8 改为 0xC）；上一视角 := 1；视角 := v；经 MW-09 恢复 `savedLeftPage`（5 改为 0）；页面改变时的 `left-page-changed`（`commandIndex` 为 null）在 `warp-completed` 之后发出（MW-05）。
  2. 以下只在玩家实体存在时：玩家位置 := 目的地；X 先向扇区角拉近（`0x3a6e8`，扇区角偏移为半个扇区，高概率）再加 ±k（k = F((组 + 1) × 5000)，**第 1 次世界抽取** rand % 2 定号）；按种类表次序在种类位 0–25 的全部实体中（不看状态、活动、被毁与种类）找 F(dx² + dy² + dz²) 最小者，严格小于 360000 时 X := 其位置 + (0, 0, 600)；玩家位置 := X，放置序号加 1；**第 2 次世界抽取**：姿态 := `startupRotations[rand % 64]`。
  3. `warpClock` := 时钟 + t（+0xA4 ≠ 0 时 t = trunc(64 × +0xA4 × min(1, D × (1 ÷ 30000)))，不大于 0x280 时取 0x280；+0xA4 = 0 时 t = 0），D = F(`0x56b14`(X, origin))；移动块模式 := `'craft'`、`atCommandedSpeed` := true、`speed` 与 `commandedSpeed` := `maximumSpeed`。
  4. 扣费：E := max(trunc(E − (c + c × s × 0.5)), 0)，c = `0x30d2c`(trunc(D))。不调用耗尽处理，不改 P3-07 的 `depleted` 锁存。
  5. `inWarp` := false；按 `0x3c040` 求 `hostileNear`（敌方类种类 `0x93780`、未被毁、状态 ≥ 7 或为 4，与 X 的距离严格小于**玩家**机型的 +0x0C；Warp 过程第 9 步）；发出 `warp-completed`。
- **不写：** 目的地、标记、玩家目标与 `warp` 的各字段（下一次开始重置）。区域检查在同一 tick 之后运行，已用到达位置。
- **CR-11 差异 1 的适用：** 最近对象搜索看不到归表现层的效果对象；对照只按该差异的原批准范围披露。

#### MW-09 视角切换与其他写入者

- **视角切换函数：** Core 提供一个内部静态函数 `switchView(world, newMode, oldMode)`，对应 `0x3f158` 中有规则效果的部分：进入 1 时保存页并设页 6（只由 `warp-start` 调用，随后的路径设立在 MW-04 中）；离开 1 时恢复 `savedLeftPage`（5 改为 0）；涉及 6 时的 `0x4cd68`（置 `statusDisplay.redraw` 并重新应用页面）由 P3-10 在同一函数中实现；地图（8）没有规则副作用。改变视角的规则（本任务的开关、开始与完成，P3-10 的停靠与离港，P3-11 的被毁与救援）都调用它，不各自复制页面规则。
- **被毁视角取代地图与 Warp**（地图模式；P3-09 spec 原先“视角已是 8 则不切换”的读法按此更正）：P3-11 的 `0x32d74` 从地图或 Warp 进入 0x11/子模式 8，上一视角为 8 或 1。从 Warp 被毁或救援时 Warp 被**放弃**：不到达、不扣费、`warpClock` 不变，`inWarp` 保持 true 直到下一次完成的 Warp（**照原版复现**：区域中心仍为目的地，P3-08 的 AI 目标选择继续排除玩家；下一次开始不检查 `inWarp`）。
- **能量耗尽：** 模式 3 中能量锁定不起作用，Warp 继续；完成照常扣费并钳 0。
- **停靠与暂停：** 停靠在视角 0 与 1 中被拒（P3-10）；暂停只停 Runtime，继续后接着同一 Warp，不补跑。

#### MW-10 区域检查的中心

`activeAreaCentre`：玩家实体存在且 `inWarp` 为 true 时为 `map.destination`（此时必非 null，否则 Core 故障）；其余按 P3-06。

#### MW-11 Projection 与 Render State

- **`map` 分区**（取代 `MapMarkerClass`、`MapVisibility` 的 `never` 占位与原 `MapReady` 形状）：

  ```ts
  type MapPartition = NotImplementedPartition | { readiness: 'ready'; player: MapPlayer | null }; // 无玩家实体时 null
  type MapPlayer =                                  // 已提交的视角为 8 时 open，否则 closed
    | { state: 'closed'; destination: Vec3 | null; markerEntityId: EntityId | null; warpRequest: WarpRequestReading }
    | MapOpen;
  interface MapOpen {
    state: 'open';
    openedFromBase: boolean;                        // 上一视角为 6
    geometry: { main: PixelRect; information: PixelRect; zoom: PixelRect;
                pixelsPerUnit: { x: number; y: number }; unitsPerPixel: { x: number; y: number };
                zoomPixelsPerUnit: { x: number; y: number }; world: { minX: number; minY: number; maxX: number; maxY: number } };
    cursor: { pixel: MapPixel; world: Vec3; zoomBounds: { left: number; right: number; top: number; bottom: number } }; // f32；z 为 0
    contacts: readonly MapContact[];               // mapIcons 的次序
    zoomMembers: readonly MapZoomMember[];         // 0x4c5ec 为 1 的项，同一次序
    information: { capacity: number; rows: readonly MapInformationRow[] }; // 行号 ≥ capacity 的计数行原版画在区域之外
    labels: readonly MapLabel[];
    line: { from: MapPoint; to: MapPixel };        // 玩家的投影像素（可在主地图外，绘制时裁剪）→ 光标像素（0x4c674）；玩家没有图标时（P3-11 接入前不可达）取玩家当前位置的投影，读数也从当前位置计算，放大窗口距离为 null（项目规则，审批第 14 项）
    destination: { position: Vec3; pixel: MapPoint; inWorld: boolean; cost: MapCostReading } | null;
    cursorCost: MapCostReading;
    markerEntityId: EntityId | null;
    warpRequest: WarpRequestReading;
  }
  interface MapContact {
    entityId: EntityId; kindBit: number; name: NameReference; position: Vec3; pixel: MapPoint; inWorld: boolean;
    class: 'player' | 'friendly' | 'hostile';     // 位 0；种类在 0x6c87f 中；其余（即 0x93780）
    target: boolean;                               // 是玩家目标（原版画在最上层）
    coverage: { radius: number; style: 'disc' | 'ring' } | null; // trunc(D(F(+0x0C) × F(ppX)))；0 时 null；player/friendly 为 disc
  }
  interface MapZoomMember { entityId: EntityId; pixel: MapPoint;  // 相对放大窗口原点的像素，即 0x4c5ec 的结果；0x4b56c 的错开由 P3-13 绘制
    boxed: boolean;                                // 选中方框：目的地非 null 且三轴 |trunc(D(位置 − 目的地))| < 1000
    distance: number | null }                      // 0x4b98c 的距离标签值：到玩家的 trunc(三维距离)；玩家自身为 null
  type MapInformationRow =
    | { type: 'unit-name'; entityId: EntityId; kindBit: number; name: NameReference }
    | { type: 'unit-values'; entityId: EntityId; shield: ResourceReading; hull: ResourceReading; energy: ResourceReading }
    | { type: 'count'; kindBit: 7 | 8 | 9 | 10 | 19 | 13 | 14 | 16 | 12; count: number };  // 原版次序
  interface MapLabel { entityId: EntityId; name: NameReference; pixel: MapPoint; playerOrWingman: boolean }
  interface MapCostReading { cost: number; energy: number; percent: number | null } // c、E（i32）；percent = max(trunc(c ÷ E × 100), 1)，E = 0 时 null
  type WarpRequestReading = { accepted: true }
    | { accepted: false; reason: 'player-unavailable' | 'wrong-context' | 'no-destination' | 'cooldown' | 'insufficient-energy' };
  ```

  - **规则来源：** 接触点、覆盖与类按“接触点”；放大窗口、信息行（单位行：种类在 `0x6c87f` 中且不是 `0x4000`，先名称行，容量允许时再数值行；其余计入 9 个按种类的计数；单位行达到容量后不再列出也不计数；计数行不受容量限制）、距离标签、名称标签（种类在 `0x6887f` 中且 `inWorld`，逐单位，不分组）与连线按“放大窗口”；读数按“Warp 开始”的地图读数，用玩家的图标位置与光标世界点或目的地（含 z）。`warpRequest` 是以已提交的状态判定一个 `request-warp` 的结果（MW-04 的门禁表），读者不会因此改变状态。
  - **信息边界：** 地图关闭时只给出目的地、标记与 `warpRequest`，不给接触点与覆盖。目标、雷达与 Render State 保留 P3-07 的独立规则。没有探索/可见性网格。所选目标没有连线或范围（原版只有覆盖圆盘与敌方圆环）。
  - **数值读数而非百分比：** 信息行给出 `{ current, maximum }`，百分比的 `%.0f` 格式与 `maximum` 为 0 时的处理归 P3-13（原版对容量 0 不设防，会触发 x87 异常，可达性未查）。颜色阈值（≥ 100、67–99）由 P3-13 按 `percent` 判定。
  - **距离标签开关不在 Core：** 右键的距离标签开关与去抖没有规则读者（放大窗口），归 P3-13 的呈现状态；Core 只给出距离标签的数值。
- **`flight.combat`：** `CombatPlayer` 增加

  ```ts
  warp: {
    indicator: boolean;   // 12 型 Warp 指示灯：warpClock = 0，或 warpClock + 64 × +0xA4 < 时钟（严格）；战役门禁恒成立
    page: { angle: number; error: number; completion: number; centring: number } | null; // 视角 1 时的 a、s、p、c（f32，[0, 1]）；其他视角 null
  }
  ```

  页 6 的三条带标签读数与轨迹的数值来源都在 `page` 中，轨迹的历史与刷新周期 0x10 归 P3-13。标记作为目标时沿用 `CombatTarget`（种类 25、名称 `map-marker`、`speed` 0、`shield` null），T7 的标记分支由 P3-13 绘制。
- **Render State：** 增加 `warp: { serial: number; progress: number; segments: number; fraction: number; length: number; path: readonly Vec3[] } | null`：视角为 1 时给出，供 P3-12 的隧道效果；其余为 null。标记以 `map-marker` 表现列出。放置序号在 Warp 开始、到达与标记移动时加 1。

#### MW-12 随机数、前置研究与已批准的差异

- **世界抽取**（数值与阶段；都按原版的 rand 映射 `rand % n`）：首次 select 1 次（标记姿态，请求处理）；每次 Warp 开始 20 次（路径点 5–14，请求处理）；每完成一段 2 次（帧尾）；每次完成 2 次（号与姿态，`warp-completion`）。拒绝的请求不抽取。
- **前置研究（实现依赖它的规则之前须写入 executable 并达到已确认（代码））：**
  - **R-A 启动旋转表：** `0x568b0` 生成 `0x1b0a10` 的 64 个旋转（≥ 128 次抽取，前向行来自 `0x56b8c`，R0/R1 以闭式补全）的完整构造、存储精度，以及它相对 `0x257a0` 播种的先后。形状已定：`startupRotations` 恰 64 个 f32 行矩阵，静态、不进快照。若在播种之前（C 库的缺省序列），表是确定的，Core 作为代码规则重现；若在播种之后，Core 在世界创建时以由 `seed` 派生、与世界 RNG 分开的启动流生成（差异 6）。阻塞标记的创建（MW-03）与到达姿态（MW-08）。
  - **R-B 隧道路径：** `0x51618` 的参数（0.8、2000、300）与控制点的存储类型、`0x513e0` 与样条 `0x517f4` 的求值及由切线得出的行。形状已定（MW-02）。阻塞 Warp 开始的位姿（MW-04）与 Warp 步（MW-07）。

  两项都是原版代码事实，不由运行读数或默认值代替；研究之前相应实现保持阻塞。
- **已批准的差异**（写入 Core 模块说明与对照结论；对照时进入配对条件）：
  1. **有序命令模型（07 表）：** 同一 tick 中首次 select 之后的 `request-warp` 被接受（原版按键时就因 ps +0x00 为 0 拒绝）；`request-warp` 或关闭地图之后的 `map-point` 为 `wrong-context`（原版同帧按住的左键在开始或关闭之后仍改写目的地）；同一 tick 先打开再 select 时图标列表为空（原版不可达）。
  2. **表现随机不进世界 RNG（扩展 CR-11 差异 2）：** 开始时的 40 次表现抽取与效果例程的抽取不在 Core 中；原版规则抽取与表现抽取在同一生成器中的交错次序不复现。
  3. **帧率相关的规则按每 tick 一次（tick 映射）：** 原版的 Warp 步每个渲染帧执行一次，误差 s 的增量、撞墙惩罚与每段丢弃的超出量都按帧计，不按时间缩放。Core 每个 tick 执行一次，等于原版在每帧 `clockUnitsPerTick` 个时钟单位（默认 32 帧/秒）下的结果；与原版实际帧率下的时长与误差的偏离由 D-02 的判据与 P3-09/24 的运行对照判定。
  4. **E = 0 的地图读数：** 原版对 c ÷ E 触发未屏蔽的 x87 异常，后果未确认（交 P3-09/09 的运行核对）；Core 的 `percent` 为 null，不复现异常。若运行证实原版有确定的可见结果，作为本差异披露，改变须另行批准。
  5. **图标列表不设项目截断：** 原版的列表数组无上界检查（256 项触及计数字），切片不可达（高概率）；Core 不复现越界，列表受实体上限约束（MW-14）。
  6. **启动旋转表的来源**（仅当 R-A 证实它在播种之后生成）：每个世界一张，由独立的启动流生成，而原版每次运行程序一张、跨任务共用；单次到达的姿态分布相同。
  7. **能量不足被拒时不写出发点：** 原版拒绝前已写 `0x1864c8`，但下一次被接受的开始会重写它，之前没有读者；Core 原子拒绝。
  8. **地图开关在玩家不可用时仍可关闭**（MW-04），以及重绘间隔不是每 tick 时拒绝创建（MW-01）：两者都是原版不可达或切片外的状态。
  9. **`warp-start` 排在同批的玩家控制与发射之后（MW-04）：** 原版每次轮询只读一键，`w` 之前的速度键、匹配或开火必在更早的帧中生效，Warp 设立随后覆盖速度与位姿；原版同帧内 0x400/0 先于帧尾的 0x20000 投递，但同帧的这一组合原版不可达。Core 的有序批次可在一个 tick 中给出 `[速度归零, request-warp]`，若按投递次序应用，P3-06 的 `control` 会在设立之后把指令速度置 0，使模式 3 的积分 0 ÷ 0 而 Core 故障。故 `warp-start` 在玩家的 `control`/`match-speed` 与玩家发射请求之后应用，结果等于原版按键分帧的结果；`request-warp` 之后的同批命令按有效上下文 1 判定，不受影响。被排除：按投递次序应用并接受故障（合法输入使会话失败）；在控制路径中对模式 `warp` 跳过速度写入（偏离 `0x21dd0`，且发射仍会用设立后的位姿构造）。
- 尚未确认的运行事实（时长、误差取值、到达分布、E = 0 读数的后果、历史探索的运行佐证）由 P3-09/09、24 的运行取得，不在本节以默认值定稿。

#### MW-13 系统流水线

阶段表不变（数值与阶段确认原有位置）。各阶段中 P3-09 的部分：

| 阶段 | P3-09 的部分 |
|---|---|
| `object-update` | 玩家的命令批次按有效上下文判定（MW-04）；轴按最终有效上下文；标记的首次自身更新 |
| `request-handling` | `map-toggle`、`map-point`（含标记的创建与移动）、`warp-start`（含路径设立） |
| `movement` | 玩家在 Warp 中按 P3-06 的模式 3 积分；跳过 `marker` 模式 |
| `object-sets` | MW-06 |
| `warp-completion` | MW-08 |
| `area-check` | MW-10 |
| `frame-end` | 地图步或 Warp 步，在 CR-10 的显示步之前（MW-07） |

#### MW-14 容量、快照与版本

- **容量：** 每 tick 新增的事件至多 64（`map-toggled` 与 `warp-destination-set` 合计不超过命令数）+ 1 + 1 + 2（两次 `left-page-changed`），请求至多 64 + 1；与 CR-14 的合计分别为 8,328 与 3,588，仍在 `eventsPerTick`、`requestsPerTick` 之内。标记至多 1 个；图标列表与两个集合的项数不超过机体数，因而不超过 `entities`。快照新增的图标列表在实体上限下至多 2,048 项、每项约 170 字符（约 0.35 MiB），两个集合合计至多 2,048 个 ID（约 12 KiB），`warp` 约 1 KiB；与 CR-14 的约 10.5 MiB 合计约 10.9 MiB，仍在 `canonicalTextLength` 之内。`CORE_LIMITS` 的取值不变，注释随之更新。
- **快照：** 覆盖 MW-02、MW-03 的全部新状态（`player.map`、`savedLeftPage`、`warp`、实体的 `mapVisible`、`objectSets`、`mapIcons`，以及标记的战斗、移动块、表现与名称变体）。静态的 `WorldRuleData.map` 与 `startupRotations` 不进快照。
- **版本：** `RULES_VERSION` 与快照格式版本相对实现时的当前值各递增一次（由首个实现共享形状的子任务，P3-09/12）；replay 记录的形状不变（`mapGeometry` 是调用输入，经 setupHash 与内容身份绑定），replay 格式版本不变。旧规则版本的记录一律拒绝。

#### MW-15 消费者接线

比较器的事件字段表（四个新事件）、快照显式字段表、录制入口与 replay 的 `mapGeometry` 输入校验、开发事件日志与命令反馈（两个新原因码）、UI 桥接的关键状态（地图开/关与就绪、目的地、`warpRequest` 的结果与原因、视角 1 与 `serial`）随实现同步更新；地图页只消费 `map` 分区。纯读取不回写世界。

#### MW-16 交接

| 任务 | 交接 |
|---|---|
| P3-08 | 复用 MW-06 的集合、`mapVisible` 与揭示函数；僚机 AI 的 `0x62250`/`0x62760`；AI 对 ps +0x00 与目的地的读取（`0x61740` 等）；`inWarp`（含卡住时）对 AI 目标选择的排除；AI 的 Warp 离开消息 |
| P3-10 | 通讯菜单对 `m`、`w` 的占用优先于 MW-04 的判定；地图标签按对象 +0x17C 闪烁（`0x3bed0` 写入）时在 `MapLabel` 中加入该状态；从基地打开的地图期间基地帧例程不运行（视角不是 6）而自动选敌照常；离港把视角设为 max(上一视角, 0xC)；从地图停靠（视角 6、上一视角 8、清目标）；涉及 6 的 `0x4cd68` 在 MW-09 的函数中实现；同帧停靠的边缘情形 |
| P3-11 | 被毁与救援经 MW-09 改变视角；放弃 Warp 时 `inWarp` 保持；视角 1 期间推迟结算；拆除时移除标记 |
| P3-12 | Render State 的 `warp`（路径、进度）与标记的表现；隧道效果用自己的随机源；放置序号 |
| P3-13 | `map` 分区与 `flight.combat.warp` 的绘制；距离标签开关与去抖（P3-05 的右键）；信息行的百分比格式与容量 0；E = 0 读数的显示；页 6 轨迹的历史；指示灯 |
| P3-14 | 10463 对每个 `warp-destination-set`；10401 与音频状态切换对 `warp-started`；10181 只在 `hostileNear` 时；完成时的音频状态恢复 |
| P3-05 | 右键距离标签开关不需要 Core 命令（[P3-05 审批](../05/spec.md#审批)的交接按此同步） |
| 工程文档 | [Core 模块说明](../../../engineering/modules/core.md#交接)中“视角切换（`0x4cd68`）须置 `statusDisplay.redraw`”只适用于进出基地，不适用于飞行与地图之间以及 Warp 开始；由 P3-09/26 更正 |

### P3-10 的契约修订（D-01）

本节由 P3-10 的子任务 08 加入（2026-10-14），定稿 [P3-10 spec](../10/spec.md#实施关卡) 的关卡 D-01 中属于本 spec 的部分；Runtime 与会话的部分在 [P3-04 的运行中衔接](../04/spec.md#运行中衔接p3-10-的修订)。它建立在 P3-06、P3-07 与 P3-05 的修订之上，那些修订已定的项不变；前文与本节不一致时以本节为准。编号 CB-01 至 CB-19 只供引用本节（不与 P3-08 草案的 CR-15 起、P3-09 的 MW 编号重叠）。

原版事实只记在 executable 的 [Communications, docking and base service (P3-10)](../../../original/formats/executable.md#communications-docking-and-base-service-p3-10)（下文以 CD、RQ、RX、DK、BS 标签引用）与 [comm §7–§8](../../../original/formats/comm.md#7-menu-state-machine-p3-1001)，不重复。定稿依据是 P3-10 子任务 01 至 07 与 09 的完成证据，尤其是 [06 交 07、08 的输入](../10/subtasks/06-original-facts.md#完成证据)（下文“冲突 n”指其清单 ①–⑳）与已批准的 [D-03 定稿](../10/spec.md#d-03-定稿已批准)（下文“D-03 第 n 条”）。

**记法与通则：** 沿用 [P3-07 的修订](#p3-07-的契约修订d-01d-03)的记法（f32、i32、时钟、`EntityId`、故障、快照与“不持久”“静态”）。另外：

- 种类照原版文档写作掩码：“种类 2”是种类位 1 的僚机，`0x68000` 是基地类，`0x6807c`、`0x87c`、`0x93780` 等同理；Core 的 `kindBit` 是位序号。
- **取样**指本 tick 的 `world.clock`；`mission-flow` 阶段在时钟阶段之前，读到的是上一 tick 的时钟（C3）。原版的 u32 回绕不复现：到期、期限与时戳都是安全整数时钟，与时钟之差超过 2³² − 1 为 Core 故障（约 777 天，不可达）。原版以 0 表示“未盖戳”的对象与玩家字段在 Core 中为 null：Core 的规则从 tick 1 起执行、时钟 ≥ 2，写入的时戳不会为 0，两者等价（RX7）。
- **玩家可用**：玩家实体存在、未被毁、状态为 `active` 且不待移除（CR-05 的共同前置）；活动为停靠的玩家可用。
- **有效视角**：P3-09 MW-04 的命令批次内的有效视角与有效上一视角，本节沿用并在 CB-07 中扩展。
- 新状态都由 Core 拥有，进入快照规范文本与状态哈希；静态规则数据不进快照。

**与并行任务的对齐：** P3-08（D-01 草案，CR-15 至 CR-25，待用户批准）与 P3-09（MW-01 至 MW-16）在各自分支上修订本 spec。重叠处只有一份定义：

| 项 | 本节的定义 | 对方 |
|---|---|---|
| 对象命令单槽 +0x184 | `AiState.pendingCommand`（CB-04），名称与形状同 P3-08 草案 CR-18 | P3-08 消费僚机的命令；`0x3bed0` 的消费归本任务 |
| 命令投递（消息 0x100） | 请求 `deliver-command`（CB-08）；唯一的投递者是通讯菜单（CD1） | P3-08 草案 CR-21 的 `wingman-command` 即此请求（字段相同，本节另加 `commandIndex` 供事件关联）；接收者也可能是基地，P3-08 定稿时改用本名 |
| 友伤累计 | `WorldState.ai.friendlyFire`（CB-05），名称与形状同 P3-08 草案 CR-19；唯一写入点是 `0x3c208` 第 1 步的 `0x38f20`，按 CR-13 由本任务的调用点实现 | P3-08 经 `0x38fd8` 读取，并在 `WorldState.ai` 中加入其他字段；若其 D-03 要接管写入，须修订本条 |
| 视角切换 | P3-09 MW-09 的 `switchView`，本节在其中实现涉及视角 6 的部分（CB-10） | — |
| 左显示屏的保存页 | 菜单与来电各有自己的保存页（CB-03），与 P3-09 的 `savedLeftPage`（Warp）三者分开（RQ8） | — |
| 种类 `0x4000` | 运行时构造移交 P3-08（CB-18） | P3-08 草案 CR-20 |
| 菜单占用的按键 | 所选内容的菜单只用数字与 `x`（CB-01 检查 1），所以 P3-09 MW-04 的 `m`、`w` 与 P3-08 草案 CR-20 的 `b` 在切片中从不被菜单占用，不实现这些分支 | — |

各方的 `RULES_VERSION` 与格式版本相对实际集成基线各递增一次（CB-16）。

#### CB-01 世界创建输入、语义检查与静态规则数据

- **输入：** `CreateWorldInput`、录制入口与 `ReplayContent` 在现有规则输入之后增加三项必需输入。外层规则同 CR-01：缺字段或多字段为 `CoreInputError`；校验 Asset ID 的 kind 与角色；`original-import` 只接受唯一切片的对应 Asset；错误只带结构路径与稳定原因，不回显导入值。

  ```ts
  commMenus: { id: AssetId; content: unknown };        // data/comm-menus，readCommMenus 严格读取（P3-03 S-06）
  baseRepairItems: { id: AssetId; content: unknown };  // data/base-repair-items，readBaseRepairItems
  commMessages: { id: AssetId; content: unknown };     // data/comm-messages，P3-03 修订 2 的读取器（P3-10/29 实现）
  ```

  读取结果冻结并与输入脱离。三项与其他规则输入来自同一经 `validatePackage` 验证的包，由调用者保证。`CONTENT_INPUT_FIELDS`、Core 与 app 的 `RuleDataInputs`、任务所有者的运行创建、[replay-check.ts](../../../../tools/replay-check.ts) 与 `e2e/support/` 的合成包同步；不为旧调用者补默认数据。
- **语义检查（`CoreInputError`，按此次序，只检查本任务会读到的部分）：** “折叠”只把 A–Z 映射为 a–z；菜单项的数据键是项文字的第 1 字节（comm §7.2）。
  1. **菜单键：** 三张命令表（TABL 2003、2005、2013）的每一项、TABL 2007 的最后一项与 TABL 2009 的文字至少 2 字节。三张命令表与类别表中，最后一项（值 0）的键折叠后为 `x`，且是该表中第一个折叠后为 `x` 的项；三张命令表的其余每一项的键为 `1`–`9`（`select-number` 只能表达这些键）。TABL 2009 的键折叠后为 `x`。重复的键不拒绝，首匹配次序保留。类别与对象列表的其余项按位置生成键，不读数据键。
  2. **生成键上界：** 可显示的类别数与每个类别的对象数（都不含退出项）的保守上界都 ≤ 9。类别的对象数上界是有效僚机配置下，所有可实例化来源（直接与延迟声明、编组每次请求的每个成员、所选僚机）中种类在该类别掩码内的实例数之和；掩码含运行时构造的种类位（14 与 20–25）时上界无限，拒绝。可显示类别数的上界是对象数上界 > 0 的类别数。沿用现有的生成范围检查，不建通用的任务分析器。所选任务为 2 与 4（comm §8），8 项的僚机命令菜单不受此项约束。
  3. **服务选择值：** 11 个选择值都在 {0, …, 18, 33, 34} 内（33 = 0x21 对应字段 15–18，34 = 0x22 对应 10–14，BS3）。19–31 会读写 Core 没有的子系统字段，32 与 > 34 越出原版的 32 项槽表（BS10），都拒绝。
  4. **基地速率：** 玩家机型的 c54 ≥ 0（c9C > 0 已由 CR-01 检查 5 保证）。原版以无符号 `DIV` 求速率，负值的 u32 解释不复现；24 个 CINF 都满足（BS10）。
  5. **消息元数据：** 结构（帧数 ≥ 1、时长非负、限值）由读取器保证，Core 不另拒绝。查找失败（头像超出子表数、序号越界、条目为 0）是原版的合法分支（RQ4），按“没有消息”处理。
- **静态规则数据（`WorldRuleData.communications`，冻结，不进快照）：**

  ```ts
  interface CommunicationsRuleData {
    menus: {                                              // 键为原始字节，判定时再折叠
      categories: readonly { key: number; kindMask: number }[];             // TABL 2007，含最后一项（kindMask 0）
      objectListExitKey: number;                                            // TABL 2009
      commands: Readonly<Record<MenuCommandTable, readonly { key: number; code: number }[]>>;
    };
    serviceSelectors: readonly number[];                  // 恰 11 项：记录 0–10 的选择值 +0x6C
    messages: {                                           // RQ4 的四张表；null 为条目 0，否则为各帧时长（i32，1/8 秒）
      faceTables: Readonly<Record<20011 | 20019 | 20985, readonly (readonly (readonly number[] | null)[])[]>>; // [头像][序号]
      direct: readonly (readonly number[] | null)[];      // 20983
    };
    nameIndexes: NameIndexTable;                          // 见下
  }
  type MenuCommandTable = 'gated' | 'other' | 'kind2';    // TABL 2003、2005、2013（comm §7.3）
  ```

  - **名称序号（RX1，D-03 第 4 条）：** 对每个可能的 `NameReference`（每个声明的每个候选、名称池的每一项、Core 可分配的每个种类名，以及 `none` 即空字节串），按字节相等分别在 `names2001`、`names2011` 中取第一个相等项的位置，得到 `{ in2001: number | null; in2011: number | null }`。规则按实体的 `NameReference` 查表，运行中不比较字符串。
- **setupHash：** 在现有规则输入之后（P3-09 合入后在 `mapGeometry` 之后）依次覆盖三项的 ID 与完整内容：键在菜单文字之内，名单决定名称序号，没有只影响外观而值得排除的字段。
- **建造期抽取：** 无。头像占用标志在创建时都为 false（任务构建的 `0x3bda4`）。

#### CB-02 任务流程与停靠子状态

`WorldState.missionStatus`（`0x1b46fc`）不变。`WorldState` 增加：

```ts
flow: {
  mainState: 3;                 // 0x1863ac：本构建中世界只存在于任务进行中；P3-11 加入它的主流程状态
  subState: MissionSubState;    // 0x186881
  dockingDeadline: number;      // 0x186824，时钟：子状态 3 的期限与 4 的到期共用；初值 0，只在子状态 3、4 中被读
};
type MissionSubState = 0 | 3 | 4 | 5;  // 0 正常；3 停靠请求待回复；4 回复后的倒计时；5 停靠已投递或基地交互中。P3-11 加入 1、2、6
```

`PlayerState` 增加 `dockingObject: EntityId | null`（玩家对象 +0x194），初值 null。

- **扩展方式：** 本任务建立 `mainState` 与 `subState` 的封闭联合，P3-11 在同一字段上加入它的取值并按扩展规则修订本节，不另建竞争的流程状态（[P3-10 技术决定 7](../10/spec.md#技术决定)）。
- **谓词：** `inMission`：`mainState` 为 3。`0x3336c`（无线电取出的门禁）：3 且子状态 ≠ 2。`0x33390`（近处菜单的流程门禁）：3 且子状态为 0。P3-11 接入前子状态 2 不出现，但这些谓词照原条件实现，不写成常真。
- **停靠对象：** 只由 `0x52914` 的各调用点写入：命令码 9 的选择（写通讯对象）；子状态 3、4 的失效取消、停靠门禁失败与离港（写 null）；P3-11 的 `0x32d74`（写 null）。玩家实体移除时清为 null。
- **有效性（DK1）：** 停靠对象可解析且状态为 `active` 或 `projectile-hit`（≥ 7）；不看活动、被毁标志、距离与种类。子状态 3–5 中停靠对象为 null 是 Core 故障（决定 3）。
- **写入：**

  | 写入者 | 阶段 | 效果 |
  |---|---|---|
  | 命令码 9 的选择（`0x333b4`，CB-07） | `object-update` 的命令判定 | 停靠对象 := 通讯对象（即使不可解析、没有投递命令）；子状态 := 3（不看当前子状态，comm §7.5）；期限 := 取样 + 0x780；发出 `docking-requested` |
  | `docking-reply` 回调（`0x333d4`） | `frame-end` 的通讯呈现子步（CB-09） | `inMission` 且子状态为 3 时：子状态 := 4，期限 := 取样 + 0x200；不核对回复者（DK1） |
  | `0x3266c`，子状态 3 | `mission-flow`，c′ 为上一 tick 的时钟 | 失效 → 停靠对象 := null，清空无线电（CB-06，原因 `docking-cancel`），子状态 := 0，`docking-cancelled`（`invalid-object`）；否则 c′ ≥ 期限 → 只把子状态设为 0（不清空、不释放），`docking-cancelled`（`timeout`） |
  | 子状态 4 | `mission-flow` | 失效 → 同上；否则 c′ ≥ 期限 → 投递 `dock`（CB-08），子状态 := 5 |
  | 子状态 5 | `mission-flow` | 失效 → 投递 `depart`（`automatic`），子状态 := 0（不释放、不清空：离港的 `0x3340c` 释放）；有效 → 无 |
  | 门禁失败、离港（`0x3340c`） | `request-handling` | 停靠对象 := null，子状态 := 0 |

  本任务在 `mission-flow` 中的部分只在 `inMission` 时按子状态分派（`0x3266c` 的跳转表）；子状态 0 的部分（任务状态、僚机损失计时）归 P3-11。期限比较为 c′ ≥ 期限（DK5 的无符号非严格）。

#### CB-03 玩家状态

`PlayerState` 增加以下字段，都在创建世界时取初值：

```ts
communications: {
  menu: CommunicationsMenu | null;  // 控制器 +0x19C：唯一的已建菜单，关闭后为 null；初值 null
  partner: EntityId | null;         // 控制器 +0x1A0：其命令菜单正在或最近一次被建立的通讯对象；初值 null
  menuSavedPage: LeftPage;          // 控制器 +0x1A4：`c` 打开菜单时的页（只可能是 0、1、5）；初值 0
  incomingSavedPage: LeftPage;      // 0x175efc：来电可见时保存的页；初值 0
  limits: { friendlyHit: number | null; friendlyKill: number | null }; // ps +0x78、+0x7C：时戳，null 为未盖
  thanks: number;                   // ps +0x60：感谢计数，非负 i32；初值 0
};
docking: { savedPose: Pose | null };  // 0x186af0–0x186b1c：停靠时写入、离港时改写；首次停靠之前为 null
interface Pose { position: Vec3; orientation: Matrix3 }   // f32，逐位复制

type CommunicationsMenu =
  | { level: 2; table: 'categories'; items: readonly MenuItem<CategoryValue>[] }
  | { level: 3; table: 'objects'; items: readonly MenuItem<ObjectValue>[] }
  | { level: 4; table: MenuCommandTable; items: readonly MenuItem<CommandValue>[] };
interface MenuItem<Value> { key: number; value: Value | { type: 'exit' } }  // key：原始字节，生成键为 ASCII 数字；退出项在最后
type CategoryValue = { type: 'category'; source: number; kindMask: number };  // source：TABL 2007 的项序号
type ObjectValue = { type: 'object'; entityId: EntityId; kindBit: number; name: NameReference; tone: 'active' | 'threatened' | 'other' };
type CommandValue = { type: 'command'; source: number; code: number };         // code：非 0 的 u32
```

- **菜单项：** 显示位置（下标）与键分开给出；身份是源项序号或对象 ID，不是会变动的行号。对象项的种类、名称与 `tone` 在建立时取得（原版在建立时复制名称并写颜色字节：活动 → `active`；否则 +0x17C 有戳 → `threatened`；否则 `other`，comm §7.3），只供 P3-13 绘制，规则不读；对象之后被移除，项仍可显示。
- **左显示屏页 2–5 的写入者（D15、RQ8）：** 菜单的打开、层级变化、关闭与投递（CB-07）；来电可见、来电结束与清空（CB-06、CB-09）；左显示屏处理器（CB-09）。页 6 归 P3-09。写页发出 `left-page-changed`：菜单命令的写页对应原版消息 0x100000（伴随 SND 10485，P3-14），总是发出且 `commandIndex` 为命令序号；直接写页（清空、来电、处理器）只在页改变时发出，`commandIndex` 为 null、没有音效。
- **生命周期：**

  | 字段 | 写入者 | 清空 | 救援 | 玩家实体移除 |
  |---|---|---|---|---|
  | `menu`、`partner`、`menuSavedPage` | 命令判定（CB-07） | 关闭与投递只清 `menu`；`partner` 只由下一次 `c` 清 | 保留（菜单休眠，comm §7.6） | 清为 null、null、0 |
  | `incomingSavedPage` | 来电可见（CB-09） | — | 保留 | 保留 |
  | `limits.friendlyHit`、`limits.friendlyKill` | `0x3c208` 第 2 步、`0x3c0f4` 第 4 步 | P3-11 的救援（战役分支、救援次数 < 2）调用本任务的清除入口（CB-12）；新任务是新世界 | 见左 | 保留 |
  | `thanks` | `0x3c4e4`（加 1） | P3-11 的统计重置 `0x3b734` | 保留 | 保留 |
  | `docking.savedPose` | 停靠、离港（CB-10） | — | 保留 | 保留 |

- 菜单在清空、基地、地图与 Warp 之后仍保存（休眠），是否可见只由页决定（comm §7.6）。新的 `c` 直接替换它；原版不释放旧菜单的引用，对规则没有影响。

#### CB-04 实体

`Entity` 增加（分配时取初值；运行时种类也有，但没有写入者）：

```ts
communications: {
  face: number | null;         // +0x180：头像，null 为未分配（分配器写 −1）。只对种类 0x87c、0x68000 由 0x3c894 写入一次（RQ4）
  threatStamp: number | null;  // +0x17C：时钟，null 为未盖（分配器写 0）
};
```

`AiState` 增加（与 P3-08 草案 CR-18 同名同形）：

```ts
pendingCommand: { code: number; issuedTick: number } | null;  // +0x184：null ⇔ 0；code 为 u32，1 ≤ code < 2³²；issuedTick 为写入它的 tick（项目字段，规则不读）
```

- **`pendingCommand`：** 只由 `deliver-command` 在请求处理中写入，后写覆盖先写，不校验接收者的种类、状态或活动（CD2）。消费：种类在 `0x6807c` 中、状态为 `active` 的对象由 `0x3bed0` 在对象更新中读取，任何非 0 的码处理后清为 null（CB-12）；僚机由 P3-08 的 `0x61f20`、`0x614a8` 消费并清除；其他对象保留到被覆盖或移除（CD3）。原版同时存的发送者 +0x188 没有规则读者，不存。实例化与分配器写 null；停放、恢复与救援不清；随实体移除消失。
- **`threatStamp`：** 写入者为 `0x3c208` 第 3 步、`0x3c3b0` 与 `0x3bed0` 的状态查询；清除者为 `0x3c4e4`（感谢）与 `0x3bed0`（威胁消失）；另有对象列表的颜色（CB-03）与 P3-09、P3-13 的绘制读取（RX7）。
- **`face`：** 规则见 CB-12。种类 2（僚机）的头像不存于此，是 `ruleInputs.aiValueA` − 1（RX1）。

#### CB-05 世界状态

`WorldState` 增加：

```ts
communications: {
  queue: readonly RadioItem[];          // 0x174b3c，按次序；项目上限 CORE_LIMITS.radioQueueItems（CB-16）
  channel: IncomingChannel;             // 来电通道（D-03 第 2 条），初值 idle
  facePools: { craft: readonly boolean[]; base: readonly boolean[] };  // 0x186bd4（3 项）、0x186be0（5 项），true 为已占用
  limits: {                             // 时钟，初值 0，比较为“取样 > 值”（RX8）
    wingmanLowHull: number;             // 0x174e10
    enemyAppears: number;               // 0x174e0c
    tailWarning: number;                // 0x174e08
    wingmanArrivalRepair: number;       // 0x174b84
  };
  tailCheck: { dueClock: number; attackerOnTail: boolean; missileIncoming: boolean }; // 0x175f34、0x175f10、0x175f14；初值 0、false、false
};
ai: { friendlyFire: { accumulated: number; windowEnd: number } }; // 0x174dfc（i32）、0x174e00（时钟），初值 0、0；P3-08 加入 WorldState.ai 的其他字段
baseService: BaseService | null;       // CB-11，初值 null

type MessageIdentity =                  // 入队的消息都已查到（CB-12），所以头像 < 该表的子表数、序号 < 子表长度（commMessages 的内容）
  | { table: 20011 | 20019 | 20985; face: number; index: number }  // 头像子表；所选内容为 5 × 5、3 × 22、5 × 61（RQ4）
  | { table: 20983; face: null; index: number };                  // 直接列表，85 项
interface SpeakerSnapshot { entityId: EntityId; kindBit: number; name: NameReference }  // 项目字段：入队时的说话者，规则不读
interface RadioItem {
  message: MessageIdentity;
  due: number;                          // 时钟：入队时的取样（所有入队的延迟都是 0，RQ3）
  callback: RadioCallback;
  speaker: SpeakerSnapshot | null;      // 按 RX10 的说话者列；没有说话者为 null
}
type RadioCallback = 'none' | 'docking-reply' | 'music-step' | 'music-reset';
  // 原版的单一回调槽：无、0x333d4、0x2c6cc（0x561f0(1, 0)）、0x2c6dc（0x561f0(0, 1)）。只有 docking-reply 是规则回调；
  // 两个音乐回调是 D-03 第 2 条的表现标记，只供 P3-14（G-01），规则不读
type IncomingChannel =
  | { phase: 'idle' }
  | { phase: 'loading'; item: RadioItem; readyTick: number }
  | { phase: 'playing'; item: RadioItem; startClock: number; frameDurations: readonly number[] };
```

- **入队（`0x2c740`，入口见 CB-06）：** `docking-reply` 插在队首；其他项插在第一个 `due` 大于它的项之前，相等时先进先出。原版以有符号 i32 比较，Core 按数值比较：两者只在到期 ≥ 2³¹（约 388 天）后不同，记为已批准的差异（CB-17 决定 16）。超出 `radioQueueItems` 为 Core 故障（`budget-exhausted`），不丢弃。
- **说话者快照：** 说话者之后被移除，消息仍可显示（[P3-10 规则输入与读模型边界](../10/spec.md#规则输入与读模型边界)）。
- **头像池：** 由 `0x3c91c` 抽取并占用；同一世界内不清。
- **友伤累计与各限频：** 写入者与读者见 RX7。任务期间不重置：救援与僚机损失都不清。原版的击杀台词戳 `0x174e04` 只写无读者，不存。
- **生命周期：** 都随世界存在；队列与通道只由入队、取出、呈现子步与清空改变；救援经 P3-11 调用清空（CB-06）。

#### CB-06 无线电：入队、取出与清空

- **取出（`communications-reply` 阶段，`0x2cd60`，每 tick 至多一次）：** 只看队首。队首存在、取样 ≥ `due`、通道为 `idle`、`0x3336c` 成立时：移出队首，通道 := `loading`，`readyTick` := 本 tick + 1，发出 `radio-taken`。不执行回调（RQ3）。
- **清空 `flushRadio(context, cause)`（`0x2cd20`）：** 移除全部项；通道为 `playing` 时停止，此时页为 5 则恢复 `incomingSavedPage`；为 `loading` 时取消，不执行回调；然后页 := 0；按写入次序发出 `left-page-changed`，最后发出 `radio-flushed`。调用者：本任务的停靠失效取消（`docking-cancel`）；P3-11 的被毁 `0x32d74`、信标到期、主流程切换与任务开始，其原因取值由 P3-11 的修订加入。停靠超时不清空（RQ3、DK1）。
- **入队入口（本任务实现，其他任务调用，不另建队列）：**
  - `queueRadio(context, message, callback, speaker)`：CB-05 的插入，发出 `radio-queued`。
  - `queueLine(context, speaker, type)`（`0x38d54`，RX1）：说话者不可解析或头像不在 0–4 时不抽取、返回 false；否则按类型抽取、查找表 20985，查到时入队（原类型为 8 时回调为 `music-step`，否则为 `none`）并返回 true。P3-08 的 AI 回复经它入队。
  - P3-11 的僚机损失消息（`0x3c4bc`：表 20983 序号 6，无说话者、无抽取、无限频）经 `queueRadio` 入队。

#### CB-07 命令判定

在 `flight-control.ts` 的唯一命令循环中按数组次序判定，每条恰一个 `command-result`。本条直接写入的菜单、页、通讯对象与停靠状态由后续条目读取（决定 8）。被接受的 `launch` 把有效上一视角设为有效视角、有效视角设为 max(原有效上一视角, 0xC)，与 MW-04 的有效视角一起维护。

1. **共同前置：** 玩家不可用 → `ignored`/`player-unavailable`。
2. **飞行上下文（有效视角的上下文为 `flight`）：** 菜单判定先于 P3-06、P3-07 的飞行动作（`0x27b44` 在 `0x264a0` 的比较树之前）。
   - **页在 2–4：** `select-number n` 的键是 ASCII 数字 n，`communications close` 的键是 `x`；取 `menu.items` 中第一个折叠后相等的项（`0x27e10`）。
     - **页 2：** `menu` := null；选中退出 → 关闭；否则建立该掩码的对象列表：为空 → 关闭；恰 1 个对象 → `partner` := 它并建立命令菜单，成功 → 页 4，失败 → 关闭；多于 1 个 → 页 3。
     - **页 3：** 选中退出 → 关闭；否则 `partner` := 该对象并建立命令菜单，成功 → 页 4，失败 → 关闭。
     - **页 4：** `menu` := null；码不为 0 时，`partner` 可解析则投递 `deliver-command`，否则不投递（`0x2c7fc`）；然后码为 9 时开始停靠等待（CB-02），无论是否投递；最后页 := `menuSavedPage`。
     - **关闭：** `menu` := null，页 := `menuSavedPage`。

     以上都是 `accepted`，每条恰一次 `left-page-changed`（随结果发出）。没有匹配：`select-number` → `ignored`/`no-candidate`；`communications open` → `ignored`/`no-change`（原版的 `c` 在页 2–4 不打开菜单）。
   - **页不在 2–4：** `communications open`：玩家子系统 13 为 2 → `ignored`/`subsystem-disabled`（原版不消费 `c`）；否则建立类别菜单，没有可显示的类别 → `ignored`/`no-candidate`（原版消费 `c`，页与音效不变）；否则 `partner` := null、`menuSavedPage` := 页、`menu` := 类别菜单、页 := 2，`accepted`。`communications close` → `ignored`/`no-change`。`select-number` 保持 P3-05 的 `ignored`/`wrong-context`。
   - 菜单打开时，其他命令按各自规则判定：`confirm-selection` 仍是手动匹配速度，`speed-preset` 不被占用。切片的菜单只有数字与 `x`，P3-07 的按键、P3-09 的 `m`/`w` 与 P3-08 的 `b` 都不被占用。
3. **基地上下文（`0x271e0`）：** `navigate-selection` → `accepted`，投递 `base-navigate`；`confirm-selection` → `accepted`，投递 `base-confirm`；`launch` → `accepted`，投递 `depart`（`command`）并更新有效视角。`communications`、`select-number` → `ignored`/`wrong-context`。
4. **其他：** 飞行上下文中的 `navigate-selection`、`launch`，地图与 Warp 上下文中的 `communications`、`select-number`、`navigate-selection`、`launch` → `ignored`/`wrong-context`（地图中的 `confirm-selection` 按 MW-04）。P3-10 的命令不再有 `not-implemented`。

**建立（只在判定时，之后不刷新，comm §7.5）：**

- **类别菜单（`0x2c850`）：** 按 TABL 2007 的次序，非零掩码的对象列表非空时列出该类别，生成键为它在列出项中的位置（`1` 起），最后为退出项（数据键）；只有退出项时不建立。
- **对象列表（`0x2c9d0`）：** 按种类遍历次序（种类位升序、同种类按分配次序）取掩码内可解析且状态 ≥ 7 的实体（活动、停放与停靠都算），生成键为位置，最后为退出项（TABL 2009 的键）。
- **命令菜单（`0x2cbb4`）：** 对象不可解析 → 失败。种类恰为 2 → `kind2`；种类在 `0x68000` 中且近处门禁 `0x394c4`（CD5：有效视角不为 0、1，对象活动为 `active`，按 CD5 的 f32/x87 形式的距离平方 ≤ f32 1,000,000）与 `0x33390` 都成立 → `gated`；否则 `other`。
- **通讯对象的身份（决定 1）：** 菜单项与 `partner` 保存 `EntityId`，对象被移除后不可解析，判为失效。

**原因码：** `COMMAND_RESULT_REASONS` 增加 `subsystem-disabled`（命令所需的玩家子系统为状态 2）。`no-candidate` 的含义扩展为“没有满足条件的对象或菜单项”。其余沿用。

#### CB-08 内部请求

`Request` 联合增加：

```ts
| { type: 'deliver-command'; receiver: EntityId; code: number; sender: EntityId; commandIndex: number } // 消息 0x100（CD1、CD2）；code 为 u32 且 ≥ 1
| { type: 'dock'; entityId: EntityId }                              // 消息 0x400000 子命令 0；entityId 为玩家
| { type: 'depart'; entityId: EntityId; origin: 'command' | 'automatic'; commandIndex: number | null } // 子命令 4；automatic 时 commandIndex 为 null
| { type: 'base-navigate'; entityId: EntityId; direction: 'previous' | 'next'; commandIndex: number }  // 子命令 1、2
| { type: 'base-confirm'; entityId: EntityId; commandIndex: number }                                 // 子命令 3
```

| 请求 | 投递 | 处理（请求处理阶段，按投递次序） |
|---|---|---|
| `deliver-command` | 命令判定 | 接收者不可解析 → 无作用；否则 `receiver.ai.pendingCommand` := `{ code, issuedTick: tick }`，发出 `command-delivered` |
| `dock` | `mission-flow`（子状态 4 到期） | CB-10 |
| `depart` | 命令判定；`mission-flow`（子状态 5 失效） | CB-10 |
| `base-navigate`、`base-confirm` | 命令判定 | CB-11 |

子命令 0–4 都在玩家实体不存在时无作用（`0x38ff4` 在 ps 或玩家句柄为 0 时返回）。命令判定中投递的请求立即入队（不经 `defer`），所以排在同一玩家更新中 P3-06 的 `control`/`match-speed` 与 P3-07 的玩家发射之前；它们改变的状态互不重叠。

#### CB-09 帧尾：左显示屏处理器、尾随警告与通讯呈现子步

`frame-end` 阶段内的次序依原版帧渲染 `0x3ee58`（仪表按记录次序，`0x4e308` 在末尾）：P3-09 的地图步或 Warp 步 → CR-10 的驾驶舱显示步（类型 7、6，其中左显示屏的部分按下面第 1 条扩展）→ 尾随警告（类型 9）→ 通讯呈现子步。

1. **左显示屏处理器（类型 6，CR-10 的视角集合 0xC、0xD、1、6）：** 玩家实体存在且当前页所属子系统（页 2–5 为字段 13，D15）不为 2 时：页在 2–4 而 `menu` 为 null → 页 := 0（`0x4da28`）；页为 5 而通道不是 `playing` → 页 := 0（D-03 第 3 条第 4 点，省略原版三次绘制失败的中间调用）。都发出 `left-page-changed`（null）。字段 13 为 1 时原版按表现随机切换干扰画面，Core 不复现（决定 12）。
2. **尾随警告（类型 9，`0x4edf4`，同一视角集合）：** 玩家实体存在且取样 > `tailCheck.dueClock` 时依次：
   - `attackerOnTail` := `0x4ef9c`：玩家子系统 12 为 0，且存在种类在 `0x780` 中、活动为 `active`、状态 ≥ 7、`ai.objectTarget` 为玩家、P3-08 的 AI 处理器私有状态中攻击航线字节（原版 (+0xF4)+0x24）为 3 或 4 的对象，取遍历中的第一个。实体没有 P3-08 的处理器状态时最后一个条件不成立（决定 11）。
   - `missileIncoming` := `0x4f000`：玩家子系统 12 为 0 或 1，且存在种类位 20、活动为 `active`、状态 ≥ 7、`combat.target` 为玩家的导弹。
   - `dueClock` := 取样 + （两者任一为真时 0x40，否则 0x80）。
   - `attackerOnTail` 为真时调用 `0x38c30(player, 该对象)`（RX5）：僚机活动、状态 ≥ 7，取样 > `limits.tailWarning`，两者第 3 行的点积按 RX8 的形式 > f64 0.707 时 `queueLine(W, 0xA)`（不抽取），`limits.tailWarning` := 取样 + 0x640。
3. **通讯呈现子步（`0x4e308`/`0x4e5a0`，每个 tick、任何视角，D-03 第 3 条）：**
   - `loading` 且 `readyTick` 为本 tick → `playing`，`startClock` := 取样，`frameDurations` := 该消息的各帧时长；视角不是 1 时 `incomingSavedPage` := 页、页 := 5；发出 `left-page-changed`（若写页）与 `incoming-started`。
   - `playing`（含刚转为 `playing` 的）：e = ((取样 − `startClock`) × 8 mod 2³²) >> 6，单位 1/8 秒；e ≥ 各帧时长之和（i32，有符号比较，即 RQ5 逐帧消耗的累计形式；基准运行的 5 + 8 + 5 在 144 单位处结束）时结束：通道 := `idle`；页为 5 时页 := `incomingSavedPage`；然后执行回调（`docking-reply` 按 CB-02）；发出 `left-page-changed`（若写页）与 `incoming-ended`。
   - 所以取出在 tick N，可见在 N + 1；回调改变的子状态在下一 tick 的 `mission-flow` 才被读取。

#### CB-10 停靠、离港与视角切换

- **视角切换：** 在 P3-09 MW-09 的 `switchView(world, newMode, oldMode)` 中，新旧视角之一为 6 时置 `statusDisplay.redraw`（`0x4cd68`），页不变（comm §7.6）。改变视角的写入（视角 := 新值、上一视角 := 旧值，`0x3104c`）由各调用者按 MW-09 进行。
- **`dock`（DK2，次序如下）：**
  1. 执行搜索 `0x3959c`：已提交的视角不是 0 或 1 时，取种类遍历中第一个种类在 `0x68000`、活动为 `active`、与玩家的距离平方按 DK5 的形式 < f32 1,000,000 的实体；不看状态、被毁与 Warp。
  2. **门禁：** 结果不是停靠对象（含没有结果）→ `0x3340c`（CB-02 的最后一行），发出 `docking-cancelled`（`gate`），结束。
  3. `docking.savedPose` := **停靠对象（基地）**的位置与三行姿态，逐位复制（P3-10/08 以原生指令复核：源是玩家 +0x194 所指的对象，不是玩家）。
  4. 玩家活动 := 停靠（只写活动；状态、移动块与其他字段不变）。
  5. **僚机：** 种类 2 遍历的第一个实体存在、活动为 `active`、与保存的位置（基地的位置）的距离平方 < f32 1,000,000 时：活动 := 停靠，并对它完全修理（`fullRepair`，不在消息循环内，CB-11）。不看状态、被毁、Warp 与命令。
  6. 资源与背景：**1 次世界抽取**（`0x4f480` 的 rand % 3，结果属于表现而丢弃，D-03 第 5 条）。
  7. **视角：** 上一视角 := 视角，视角 := 6，经 `switchView`；玩家目标非 null 时清为 null（`0x3104c`，不发 `target-changed`，CR-06）。
  8. **服务列表：** `0x39664`（CB-11）。
  9. 子状态保持 5，停靠对象保持。发出 `docked`，随后 `transition`（`G-02/3`）。原版的 `LANDING` 过场阻塞在第 5 与第 6 步之间，其用时计入下一帧的步长；Core 按 P3-02 技术决定 2 不计时。
- **`depart`（DK3，次序如下）：**
  1. 玩家活动 := `active`。
  2. **视角：** 新视角 := max(上一视角, 0xC)（无符号字节比较），上一视角 := 视角，经 `switchView`。不写目标。
  3. `baseService` := null。
  4. 种类 2 遍历的第一个实体活动为停靠时改为 `active`，位置与姿态不变。
  5. **玩家位姿：** 记保存的三行为 r1、r2、r3、位置为 p：第 1 行 := −r3，第 2 行 := r2，第 3 行 := r1；位置每轴 := F(pᵢ + F(r1ᵢ × 1000.0))（f64 常量）；`docking.savedPose` := 新位姿；放置序号加 1（项目字段，供渲染器不跨此插值；原版没有对应计数）。移动块不变：速度、指令速度与转动沿用停靠期间的值。
  6. `0x3340c`（CB-02 的最后一行）。
  7. 发出 `departed`，随后 `transition`（`G-02/4`）。原版的 `LAUNCH` 过场阻塞在第 1 步之前，Core 不计时。
  
  同一 tick 可以有两个 `depart`（子状态 5 的自动离港与基地中的 `l`），第二个照原版再应用一次（视角 0xC、位姿再转四分之一周、再一次 `transition`），见决定 6。
- **完全修理 `fullRepair(context, entity, inRequestHandling)`（`0x39820`，BS9）：** 字段 0–18 := 0；列表 0、1 的全部受损挂点恢复为 0 级（P3-07 的挂点修理，“全部”语义）；船体 := c9C，能量 := c54（实体自身的机型记录）；所经各 +0x18 链上弹药 < 挂点 +0x0C 的导弹状态补满；扰动 := 0（P3-06 的扰动函数，0 级不抽取）；两张列表的选择从当前项起逐项前进一整圈（P3-07 的 `0x2d6dc`，不提前停止、列表 1 不多前进），回到起点，每次在列表 1 上前进都清除锁定等级。实体为玩家且 `inRequestHandling` 为真时，每次前进发出 `commandIndex` 为 null 的 `weapon-selected`（原版的消息类型 4 只在消息循环内被处理）。不改：字段 19 以后、列表 2、护盾、充能、档位、剩余功率、最高速度、冷却、控制锁定、指令速度、能量更新时钟、`depleted` 锁存、子状态、击杀与射击计数、目标与被毁标志。调用者：停靠（僚机）、僚机到达基地（CB-12）、P3-11 的救援、P3-08 的 `0x61bd0`。

#### CB-11 基地服务

```ts
interface BaseService {          // 原版全局，入港时由 0x39664 重建，离港时长度置 0（Core 为 null）
  rows: readonly number[];       // 0x186a70：恰为 0–10 的一个排列；既是服务队列也是显示次序（BS5）
  cursor: number;                // 0x186b20：行号，0–10
  dues: { repair: number; hull: number; energy: number };    // 0x174e34、0x174e38、0x174e3c：时钟
  rates: { hull: number; energy: number };                   // 0x174e40、0x174e44：入港时的 trunc(c9C ÷ 60)、trunc(c54 ÷ 240)
  flags: { repairsComplete: boolean; energyAndMissilesFull: boolean; hullFull: boolean }; // 0x174e48、0x174e4c、0x174e50
}
```

周期 0x200、0x40、4 是常量，原版存入的 `0x174e28`–`0x174e30` 不另存；`0x174e20`、`0x174e24` 没有读者，不存。速率与上限取玩家机型记录（BS1：同一记录，高概率）。

- **状态查询 `serviceState(v)`（`0x39cb4`，BS3）：** 读玩家实体已存的子系统字段，不查挂点列表。v = 33：acc := 0，对字段 15–18 依次在字段 > acc 时 acc += 1；v = 34：字段 10–14 同理；其他 v：字段 v。
- **建立（`0x39664`，`dock` 第 8 步，BS2）：** `rows` := [0]，再对记录 i = 1..10 插在第一个 `serviceState` 严格低于记录 i 的行之前，否则追加；`cursor` := 0；`dues` := 取样 + 0x200、+ 0x40、+ 4；`rates`；`flags` 全为 false。不抽取。
- **按键（请求处理，BS4）：** `base-navigate`：`previous` 时 `cursor` := max(`cursor` − 1, 0)，`next` 时 := min(`cursor` + 1, 10)；`base-confirm`：第 `cursor` 行的 `serviceState` ≠ 0 时把该行移到第 0 行、其上各行下移一行，`cursor` 不变；都不改计时。每个请求都发出 `base-navigated` 或 `base-confirmed`（原版每次都有音效 SND 10167/10169，端点与不需服务时也有）。`baseService` 为 null 时（同一 tick 先处理了离港）不改状态，事件照常发出、`row` 为 null。
- **服务步（`base-interior` 阶段，`0x398ec`，BS6）：** 玩家实体存在、已提交的视角为 6 时执行；此时 `baseService` 为 null 是 Core 故障。不看活动、被毁、停靠对象与基地的任何状态（BS8）。三步各自至多一次，依次：
  1. **修理：** 取样 > `dues.repair` 时先令 `dues.repair` := 取样 + 0x200；队首的 `serviceState` 为 0 → `repairsComplete` := true，结束本步；否则按队首的选择值 v：5、8 → P3-07 的挂点修理“修一个”（列表 1、0），然后写回该列表的状态到字段 5、8；7 → 字段 7 := 0，扰动与控制锁定复位（P3-06 的函数）；33、34 → 字段 15–18、10–14 := 0；其他 → 字段 v := 0。随后队首的 `serviceState` 为 0 时轮转（第 1 行起上移，原队首到最后一行）。
  2. **船体：** 取样 > `dues.hull` 时 `dues.hull` := 取样 + 0x40；**1 次世界抽取**（船体已满也抽）；船体 := min(船体 + `rates.hull` + rand % 100, c9C)（有符号）；船体等于 c9C 时 `hullFull` := true。
  3. **能量与导弹：** 取样 > `dues.energy` 时 `dues.energy` := 取样 + 4；能量等于 c54 → `energyAndMissilesFull` := true；否则能量 := min(能量 + `rates.energy`, c54)，`energyAndMissilesFull` := false。然后按 BS6 的导弹遍历补弹并移动两张列表的选择（列表 1 每次完整遍历多前进一位，每次在列表 1 上前进清除锁定等级）。原版遍历中的选择音效消息在消息循环之后投递、从不处理（BS7），Core 不发事件。
- **门禁与中断（BS8）：** 地图打开（视角 8）时整步不执行，计时保持；关闭后每个逾期的步骤在第一次执行时做一次并从该取样重新计时，不补做。入港与离港的 tick 没有服务步。离港后行次序、光标、计时与标志不保留；对实体的改变（修理、船体、能量、弹药、列表选择与清除的锁定等级）保留。护盾与充能不在基地补充，停靠期间也没有能量更新（D14），离港后第一次能量更新的 dt 覆盖整个停靠期。

#### CB-12 通讯反应、报告与回复的调用点

下列调用都是固定位置的静态调用，不经事件回放（CR-13）；抽取都用世界 RNG，条件与次序按 RX9。

| 原版调用 | 位置 | 规则 |
|---|---|---|
| `0x3bed0` | `object-update`：种类在 `0x6807c` 中、状态为 `active`（7）的对象的自身更新中，在 P3-08 的 AI 步之后（P3-08 接入前就在该位置）；活动不限（停放与停靠也执行） | RQ1、RQ2：码 7 的状态回复、码 9 的停靠回复（队首、`docking-reply`）、其他非 0 码只清除；没有命令时的威胁重报 `0x3c208(0x93780, 0, 自身, 0)` |
| `0x3c208` | P3-07 的伤害入口，护盾结算后、攻击者不为 `none` 时；`0x2a5fc` 结算后船体 ≥ 0 时（攻击者种类 0） | RX2。攻击者种类：`shooter` 为 1 << `kindBit`，`lost-shooter` 为 `0x93780`，`none` 为 0；来源为发射者或无。第 1 步 `0x38f20`：W 为种类 2 遍历的第一个实体（不看状态），攻击者种类为 1 时写友伤累计（原始伤害，i32 加法），否则为船体低于三成的报告 |
| `0x3c0f4` | 被毁：置被毁标志之后、对象事件之前；`0x2a5fc` 结算后船体 < 0 时 | RX3（第 3 步的感谢使 `thanks` 加 1） |
| `0x38cd4` | 实例化扩展点中初始移动块之后、玩家状态之前（P3-06 的次序表），种类在 `0x93780` 中的活动对象，用放置的位置 | RX5 |
| `0x3c3b0` | P3-06 的停放行进提交（`0x2fc0a`）：写入了位置、新位置在活动区域内、行进者种类在 `0x93780` 中 | RX6 第 1–2 步；第 3 步的音乐步属于 G-01，不实现 |
| 僚机到达基地 | P3-06 停放行进 `0x2f314` 的到达分支第一步：行进者种类恰为 2、行进目标非空且种类在 `0x68000` 中、取样 > `limits.wingmanArrivalRepair` | `limits.wingmanArrivalRepair` := 取样 + 0x780，`fullRepair(僚机, false)`；没有消息、没有抽取（RX6） |
| `0x38c30` | `frame-end` 的尾随警告（CB-09） | RX5 |

- **头像 `0x3c894(e)`（RQ4）：** e 不可解析 → 无（−1）；种类 2 → `aiValueA` − 1；种类在 `0x87c` 或 `0x68000` 中 → `communications.face`，为 null 时先经 `0x3c91c` 分配（机体池 3 项或基地池 5 项：f := rand % n，f 已占用时取第一个未占用项，全部占用时 f := rand % n 再抽一次；占用 f）；其他种类 → 0。
- **查找 `0x3c618(table, face, index)`：** 头像为无或 < 0、头像不小于该表的子表数、序号越界或条目为 null → 无消息；否则为该条消息的帧时长。模型中档案恒为已打开（D-03 第 1 条）。
- **给其他任务的入口：** `flushRadio`、`queueRadio`、`queueLine`（CB-06）；`fullRepair`（CB-10）；`clearCommunicationLimits`（清 `limits.friendlyHit` 与 `friendlyKill`，P3-11 的救援调用）。感谢计数的重置由 P3-11 的统计重置直接写 `thanks` := 0。

#### CB-13 领域事件与次序

字段沿用 CR-06 的通则：脱离世界的快照，不另带 `clock`，不含名称原文或内容字节。

```ts
| { type: 'command-delivered'; tick; receiverEntityId: EntityId; receiverKindBit: number; code: number;
    senderEntityId: EntityId; commandIndex: number }
| { type: 'radio-queued'; tick; message: MessageIdentity; callback: RadioCallback;
    speaker: SpeakerSnapshot | null; position: 'head' | 'sorted'; length: number }
| { type: 'radio-taken'; tick; message: MessageIdentity; speaker: SpeakerSnapshot | null }
| { type: 'incoming-started'; tick; message: MessageIdentity; speaker: SpeakerSnapshot | null;
    frameDurations: readonly number[]; shown: boolean }        // shown：页 5 已显示（视角不是 1）
| { type: 'incoming-ended'; tick; message: MessageIdentity; speaker: SpeakerSnapshot | null;
    callback: RadioCallback; countdownStarted: boolean } // countdownStarted：回调把子状态 3 改为 4
| { type: 'radio-flushed'; tick; cause: 'docking-cancel'; removed: number; interrupted: 'none' | 'loading' | 'playing' } // P3-11 扩展 cause
| { type: 'docking-requested'; tick; playerEntityId: EntityId; dockingObject: EntityId; previousSubState: MissionSubState;
    deadlineClock: number; commandIndex: number }
| { type: 'docking-cancelled'; tick; playerEntityId: EntityId; dockingObject: EntityId; cause: 'timeout' | 'invalid-object' | 'gate' }
| { type: 'docked'; tick; playerEntityId: EntityId; baseEntityId: EntityId; wingmanEntityId: EntityId | null; previousViewMode: number }
| { type: 'departed'; tick; playerEntityId: EntityId; origin: 'command' | 'automatic'; commandIndex: number | null;
    viewMode: number; previousViewMode: number; position: Vec3; orientation: Matrix3; wingmanEntityId: EntityId | null }
| { type: 'transition'; tick; gap: 'G-02/3' | 'G-02/4' }
| { type: 'base-navigated'; tick; direction: 'previous' | 'next'; row: number | null; moved: boolean; commandIndex: number }
| { type: 'base-confirmed'; tick; row: number | null; record: number | null; moved: boolean; commandIndex: number }
```

| 事件 | 发出时机与语义 |
|---|---|
| `command-delivered` | 请求处理中实际写入 `pendingCommand` 时；接收者已失效则不发。它不表示接收者已执行（僚机的消费事实归 P3-08） |
| `radio-queued` | 每次入队；`length` 为入队后的队列长度 |
| `radio-taken` | `communications-reply` 取出时（通道转为 `loading`） |
| `incoming-started`、`incoming-ended` | 通讯呈现子步：可见与结束（含回调）。G-03 的项目文字与 P3-13、P3-14 以它们与 `communications` 分区为准；没有媒体时也照常发出 |
| `radio-flushed` | 清空时，在其 `left-page-changed` 之后 |
| `docking-requested` | 命令码 9 的选择，随所属命令的结果之后 |
| `docking-cancelled` | 三种取消（DK1、DK2）；原版没有任何反馈，G-03 不为它显示文字（决定 9） |
| `docked`、`departed` | 请求处理中成功的停靠与离港；门禁失败只有 `docking-cancelled` |
| `transition` | 紧随 `docked`（`G-02/3`）或每个 `departed`（`G-02/4`）。每 tick 至多 2 个（CB-16）；Runtime 据此截断帧并进入保持（[P3-04](../04/spec.md#运行中衔接p3-10-的修订)） |
| `base-navigated`、`base-confirmed` | 请求处理中每个基地键请求一次（P3-14 的 SND 10167、10169）；`moved` 为光标或行是否改变 |

**一个 tick 内的次序：** `mission-flow`（`docking-cancelled`、`radio-flushed` 与其页事件）→ 对象更新：命令结果按命令序号，各命令的 `left-page-changed`、`docking-requested` 紧随其结果；`0x3bed0` 与实例化的 `radio-queued` 按遍历次序 → `communications-reply`（`radio-taken`）→ 请求处理按请求次序（`command-delivered`、`docked`/`departed` 与 `transition`、基地键事件、门禁的 `docking-cancelled`）→ 伤害与停放阶段的 `radio-queued` → `frame-end`：左显示屏处理器的页事件、尾随警告的 `radio-queued`、通讯呈现子步的页事件与 `incoming-started`/`incoming-ended`。比较器的事件字段表随之扩展。

#### CB-14 Projection 与 Render State

`communications` 分区就绪，取代原占位的 `MenuContentReference`、`OptionUnavailableReason` 与 `CommunicationsReady`：

```ts
type CommunicationsProjection = { readiness: 'ready'; player: CommunicationsPlayer | null }; // 没有玩家实体时为 null；已被毁的玩家照常给出
interface CommunicationsPlayer {
  entityId: EntityId;
  page: LeftPage;
  subsystem: SubsystemState;            // 字段 13：为 2 时不能打开菜单
  menu: CommunicationsMenuView | null;  // 页在 2–4 且菜单非 null 时；休眠的菜单不公开
  incoming: IncomingView | null;        // 通道为 playing 时
  docking: { subState: MissionSubState; dockingObject: EntityId | null; docked: boolean }; // docked：玩家活动为停靠
  base: BaseServiceView | null;         // 已提交的视角为 6 时
  warnings: { attackerOnTail: boolean; missileIncoming: boolean };  // 类型 9 仪表的两个指示灯（P3-13）
}
type MenuContentReference = { asset: AssetId; table: 'categories' | 'objects' | MenuCommandTable }; // asset 为 commMenus 的 Asset ID
interface CommunicationsMenuView {
  menu: MenuContentReference;
  level: 2 | 3 | 4;
  partnerEntityId: EntityId | null;
  options: readonly CommunicationsOption[];   // 按显示位置
}
interface CommunicationsOption { position: number; key: number; value: CategoryValue | ObjectValue | CommandValue | { type: 'exit' } }
interface IncomingView { message: MessageIdentity; speaker: SpeakerSnapshot | null; frame: number; frameCount: number; shown: boolean }
interface BaseServiceView {
  baseEntityId: EntityId | null;        // 停靠对象
  rows: readonly { record: number; selector: number; state: number }[]; // 按行；state 为 serviceState（字段 0–3，组 0–4）
  cursor: number;
  flags: { repairsComplete: boolean; energyAndMissilesFull: boolean; hullFull: boolean };
}
```

- 原版的菜单没有不可用的项，所以不设 `OptionUnavailableReason`。`frame` 由 e 与各帧时长按 CB-09 的方式算出，是 P3-13 的绘制与 P3-14 的帧音效的依据，规则不读。
- 不公开：无线电队列、停靠期限与倒计时、基地计时与速率（原版不可见；开发诊断经快照读取）。资源与弹药读数沿用 `flight.combat`（基地视角的驾驶舱含这些仪表）。
- 读取不改变状态、不抽取。
- **Render State：** 形状不变。离港的放置使玩家的放置序号加 1；停靠的实体照常列出，视角 6 中不绘制三维世界归 P3-12。

#### CB-15 系统流水线

阶段表不变。各阶段中 P3-10 的部分：

| 阶段 | P3-10 的部分 |
|---|---|
| `mission-flow` | 子状态 3、4、5 的检查（CB-02），在 P3-11 的部分所在的同一跳转之内 |
| `object-update` | 玩家的命令判定（CB-07）；种类 `0x6807c` 的 `0x3bed0`（CB-12）；实例化扩展点的 `0x38cd4` |
| `communications-reply` | 取出（CB-06） |
| `request-handling` | `deliver-command`、`dock`、`depart`、`base-navigate`、`base-confirm` |
| 伤害所在的阶段（`movement`、`collision` 等） | `0x3c208`、`0x3c0f4`（CB-12） |
| `parked-update` | `0x3c3b0` 与僚机到达基地（CB-12） |
| `base-interior` | 服务步（CB-11） |
| `frame-end` | 左显示屏处理器的扩展、尾随警告、通讯呈现子步（CB-09） |

#### CB-16 容量、快照与版本

- **事件：** 按 CR-14 的切片规模（机体 32、命令 64），每 tick 新增至多：`radio-queued` 约 300（`0x3c208` 受三种限频约束为 1 + 1 + 每个受害者 2 共 66；`0x3c0f4` 的击杀台词与“僚机附近的友方被毁”各 32、感谢 32、玩家击毁友方 1、友方被毁每次至多 2 共 64；回复至多 32；`0x3c3b0` 每座基地 1 共 32；敌方出现与尾随各 1，以及 P3-08、P3-11 的少量入队）；`command-delivered`、`docking-requested`、`base-navigated`、`base-confirmed` 与菜单的 `left-page-changed` 各不超过命令数 64；非命令的 `left-page-changed` ≤ 8（两次清空各 2、处理器 1、来电开始与结束各 1）；`radio-taken`、`incoming-started`、`incoming-ended`、`docked` 各 ≤ 1；`departed`、`transition`、`docking-cancelled`、`radio-flushed` 各 ≤ 2。合计约 600，与 CR-14、MW-14 的 8,328 相加约 8,930，仍远在 `eventsPerTick`（32,768）之内。
- **`transition` 的上界：** 每 tick 至多 2 个：`dock` 只由子状态 4 投递，至多 1 个；`depart` 至多 2 个（子状态 5 的自动离港与一个 `launch` 命令；批次中被接受的 `launch` 使有效上下文离开基地，第二个 `launch` 为 `wrong-context`）；`dock` 与自动离港来自互斥的子状态，同一 tick 至多一个 `dock` 加一个命令离港（冲突 ⑰ 的竞态）。
- **请求：** 新增至多 64 + 1 + 2 + 64；与 CR-14、MW-14 的合计约 3,720，在 `requestsPerTick` 之内。
- **`CORE_LIMITS` 新增 `radioQueueItems` = 4,096：** 原版无界，这是项目的防失控预算，超出为 Core 故障（不静默丢弃），测试覆盖 limit 与 limit + 1。依据：
  - 不受限频约束的规则入队都由被毁触发（每次被毁至多约 4 条），被毁对象总数受 `spawnExpansion`（1,024）约束；受限频约束的报告每个周期至多一条。
  - 可以无限重复的是对命令的回复：每次状态查询或停靠请求至少要 3 个菜单键（`c`、对象或类别、命令），每个对象每 tick 至多回复一次。队列每次取出一条，最短的基地回复约 2.3 秒（RQ5）。按原版每次轮询读一键、人以每秒 4 键持续查询，队列净增约每秒 0.9 条，到上限需 1 小时以上；开发录制的 tick 上限为 68 分钟（`recordedTicks`）。
  - 所以 4,096 是有意的失控阈值：合法的人工输入要持续上述时长才会到达，到达时故障而不丢消息。合成测试可以用整批命令更快地到达，这正是 limit + 1 的用例。
  其他上限不变。
- **快照：** 覆盖 CB-02 至 CB-05 与 CB-11 的全部新状态（`flow`、`dockingObject`、玩家的 `communications` 与 `docking`、实体的 `communications` 与 `ai.pendingCommand`、世界的 `communications`、`ai.friendlyFire` 与 `baseService`）；静态的 `WorldRuleData.communications` 不进快照。队列在上限下约 0.8 MiB，每个实体增加约 60 字符；与 MW-14 的约 10.9 MiB 合计约 11.8 MiB，在 `canonicalTextLength` 之内。
- **版本：** `RULES_VERSION` 与快照格式版本相对实现时的当前值各递增一次，由首个实现共享形状的子任务（P3-10/11）递增，此后本 goal 内不再递增。replay 记录的形状不变（三项新输入是调用输入，经 setupHash 与内容身份绑定；命令联合不变），replay 格式版本不变。旧规则版本的记录在任何 tick 之前拒绝。

#### CB-17 定稿的决定与已批准的差异

依据用户的授权（见[审批](#审批)的 P3-10 修订记录）按推荐方案定稿。每条写明所选、理由与被排除的方案；“差异”写入 Core 模块说明的已知差异与 R-17 至 R-19 的对照结论。

1. **通讯对象用稳定身份（差异，冲突 ④）：** 原版的通讯对象不计引用，对象移除后节点可能被下一个新对象复用，命令与停靠因此转向新对象（comm §7.4，运行中出现未确认）。Core 以 `EntityId` 表示，移除即失效。被排除：模拟节点池与复用次序，它属于内存管理而不是规则，且需要把节点分配器带进 Core。
2. **码 9 照原版先进入等待（冲突 ③）：** 对象已失效时不投递命令，但仍进入子状态 3，下一 tick 的检查以清空取消。P3-10 spec 中“目标失效则无作用”只对 `pendingCommand` 成立。被排除：判定时直接拒绝，会少一次清空并改变页与队列。
3. **子状态 3–5 中停靠对象为 null 是故障（差异，冲突 ⑭）：** 原版把 null 当作有效，但正常流程中不可达（DK1）。被排除：照原版把 null 视为有效，它会让玩家在没有基地时停留在等待中且无法测试来源。
4. **菜单不刷新、停靠项在建立时固定（冲突 ②）：** 照原版，`0x333b4` 不看当前子状态。被排除：选择时再检查门禁，原版没有。P3-11 接入子状态 1、2、6 后，这一覆盖照原版发生（交接）。
5. **离港的放置（冲突 ⑮，并经本子任务复核更正）：** 原版保存的是停靠对象（基地）的位姿，离港把玩家放在基地位置沿基地第 1 行 1000 单位处并朝该方向；移动块不重建。放置序号加 1 是项目字段。被排除：沿用 P3-10 spec 原先的“按保存的玩家位姿放置”。
6. **同 tick 两次离港照原版（冲突 ⑯⑰）：** 第二次再应用位姿并再给一次 `G-02/4`；Runtime 以有限序列处理（P3-04）。被排除：每 tick 至多一次离港，那会丢弃原版可达的转移。
7. **停靠中的漂移照原版（冲突 ⑯）：** 停靠的玩家按其移动块继续运动，活动区域中心随之移动，可导致基地停放与自动离港；速度辅助的满油门同理。被排除：停靠时冻结运动，它与 DK4 的代码事实不符。运行观察交 P3-10/25。
8. **同一批次中逐条判定：** 原版每次轮询只读一个键，菜单字段立即改变、页在同一帧的消息循环中改变，下一个键已看到两者。Core 在判定时立即写入菜单、页与停靠等待，后续命令读到写入后的值；离港请求在请求处理中应用，以有效视角使后续命令按飞行判定。被排除：整批开始时的快照，或页的写入延到请求处理（同批的后一个数字会读到旧页）。
9. **取消没有反馈（冲突 ①⑭）：** 三种取消都不入队、不播放；Core 发出 `docking-cancelled` 供诊断与 UI 状态，G-03 不显示文字。被排除：显示项目的“停靠取消”文字，原版没有。
10. **显示次序即服务队列（冲突 ⑲）：** 照原版只有一个数组，Enter 与轮转都改变显示次序，光标是行号。P3-10 spec 中“显示排序与执行队列为不同概念”与 AC-09 的“Enter 不改动显示排序”按研究推翻（P3-10 spec 的 D-01 定稿一节）。
11. **尾随警告的 AI 条件与节奏（差异）：** 攻击航线字节属于 P3-08 的处理器状态；P3-08 接入前没有处理器，该条件不成立，这是没有 AI 时的真实结果，不是空回调。原版只在仪表记录到期时调用类型 9 的处理器（记录的调度字段未研究，U-029），Core 在视角集合中每 tick 判定、由内部计时 `0x175f34` 门控，与 CR-11 差异 4 同类。视角集合按 [cockpit 的槽内仪表类型](../../../original/formats/cockpit.md#instrument-types-per-slot-confirmed-p3-0730)收窄为 0xC、0xD、1、6（类型 9 只在布局 0、5 中），比 D-03 第 3 条按 `0x49b2c` 的外层门禁列出的集合更窄。
12. **页 2–5 的干扰闪烁不复现（差异）：** 字段 13 为 1 时原版以表现随机数切换干扰画面并暂停该页的处理器；玩家的字段 13 至多为 1（D6）。与 CR-11 差异 2、4 同类。
13. **载入延迟固定一 tick、不支持 LO：** D-03 已批准的差异，本节沿用。
14. **基地内部的 RNG 与持久效果：** 每个船体步 1 次抽取、入港 1 次抽取都保留；列表选择与清除的锁定等级在离港后保留（冲突 ⑳）。被排除：省去结果被丢弃的入港抽取，它会改变之后的随机序列。
15. **种类 `0x4000` 移交 P3-08：** 见 CB-18。
16. **队列的到期按数值排序（差异）：** 原版以有符号 i32 比较到期，只在到期 ≥ 2³¹ 时钟单位（约 388 天）后与数值比较不同。被排除：在 Core 中模拟 32 位有符号比较，它只影响不可达的时长，却要求时钟另有一种语义。

#### CB-18 种类 `0x4000` 的责任移交

- **决定（推荐方案，依授权批准）：** 运行时构造种类 `0x4000`（Xpon）的 `0x38780` 及其两个调用者，即玩家 `b` 键的命令与内部请求（消息 0x200000、调度器 `0x2148b`）和 AI 的投放，统一归 P3-08；种类 `0x4000` 的回调 `0x3897c` 本来就归 P3-08。输入接线（命令、物理绑定的交接 P3-05）与验收一并归 P3-08。
- **接收方的契约：** 用户于 2026-10-14 批准的 P3-08 spec（在分支 `p3-08-ai-wingman-spec` 上，尚未合入本分支）的 S-12 与 AC-10 已把 Xpon 的回调、`b` 的命令与构造列入其范围与验收，所以责任在移交时已有获批的接收方。字段级的形状（命令、请求、`transponder` 状态与事件）由 P3-08 自己的 D-01 定稿（其草案 CR-20、CR-21），在 P3-08 实现它们之前另行批准；本节不定义它们，也不留下由 P3-10 实现的部分。依据：两条调用路径共用同一构造（[two allocator paths](../../../original/formats/executable.md#two-allocator-paths-native-inputs-and-profile-comparison)），回调与 AI 都在 P3-08，`b` 与通讯无关的说法不是理由。
- **对 CR-02 的修订：** CR-02 构造者一栏的“P3-10 的种类 `0x4000` 由其修订另行接入”改为由 P3-08 的修订接入（已在 CR-02 中改写）。由内容实例化的种类 `0x4000`（所选任务的记录中有 35 个，comm §8）仍按 CR-07 的实例化扩展点构造。
- **P3-10 的保留部分：** 种类 `0x4000` 不在任何通讯类别中（comm §8），本任务对它没有规则；CB-01 检查 2 拒绝含种类位 14 的类别掩码。
- **被排除的方案：** 留在 P3-10，并补齐其构造、`b` 命令与验收。它把 Xpon 的构造与其回调、AI 投放分到两个任务，需要两边共同维护同一构造。
- **阶段索引：** P3-08 的范围说明由协调者修改（阶段 `tasks.md` 只由协调者修改）。

#### CB-19 交接

| 任务 | 交接 |
|---|---|
| P3-08 | `ai.pendingCommand` 的消费（`0x61f20`、`0x614a8`）与清除；`deliver-command` 即其草案的 `wingman-command`；`queueLine` 入队 AI 回复；友伤累计的读取（`0x38fd8`）；`fullRepair` 供 `0x61bd0` 调用；尾随警告读其处理器状态中的攻击航线字节（请提供只读谓词）；种类 `0x4000` 的构造与 `b`（CB-18）；`0x3bed0` 在 AI 步之后的位置 |
| P3-09 | `switchView` 中涉及 6 的部分由本任务实现；地图标签按 `communications.threatStamp` 闪烁；从基地打开地图时服务步停止（视角 8）；地图打开时自动离港的视角为 0xC；菜单从不占用 `m`、`w` |
| P3-11 | `flow` 的主流程状态与子状态 1、2、6 的扩展；`flushRadio` 的调用与原因；`clearCommunicationLimits` 与 `thanks` 的重置；僚机损失消息经 `queueRadio`；救援复用 `fullRepair`；子状态 3–5 期间任务成功与僚机损失消息延后（DK1）；停靠中被毁后玩家与僚机的活动可能保持停靠（DK4，交 U-031）；`0x333b4` 可覆盖子状态 1（comm §7.5） |
| P3-12 | 离港的放置序号；视角 6 不绘制三维世界 |
| P3-13 | `communications` 分区的菜单、来电页、基地页与两个指示灯；对象项的 `tone` |
| P3-14 | `left-page-changed`（`commandIndex` 非 null 时 SND 10485）、`base-navigated`/`base-confirmed`（10167、10169）、来电的帧音效与两个音乐回调 |
| P3-04 | 运行中衔接（[P3-04 的修订](../04/spec.md#运行中衔接p3-10-的修订)） |

### P3-08 的跨任务修订（D-03）

**状态：已批准（2026-10-15，由 agent 依用户 2026-10-15 的授权批准，见[审批](#审批)）。**

本节由 P3-08 的子任务 09 加入（2026-10-15），定稿 [P3-08 spec](../08/spec.md#跨任务修订d-03) 的关卡 D-03 中属于本 spec 的部分；导入的部分在 [P3-03 的修订 3](../03/spec.md#p3-08-的修订ai-解析数据修订-3)，物理绑定在 [P3-05 的绑定表](../05/spec.md#绑定表)。它建立在 [P3-08 的 D-01](#p3-08-的契约修订d-01)（CR-15 至 CR-25）、[P3-09 的 D-01](#p3-09-的契约修订d-01)（MW-01 至 MW-16）与 [P3-10 的 D-01](#p3-10-的契约修订d-01)（CB-01 至 CB-19）之上，三者都已合入本分支；那些条目已定的项不变，前文与本节不一致时以本节为准。编号 CR-26 至 CR-30 只供引用本节，接续 CR-25，不与 MW、CB 重叠。原版事实只记在 original 文档中（ai §5.3、§10.2，executable 的 WB2–WB6、D5、X5，键位表的“飞行”节），下文只写分工与契约。

#### CR-26 AI 解析数据与 CR-15 的输入核对（D-03）

- **关键字表：** `aiPrograms` 的内容增加四张关键字表（[P3-03 的修订 3](../03/spec.md#p3-08-的修订ai-解析数据修订-3)，`ai-programs` payload schema 2），仍是 CR-01 的同一输入，setupHash 覆盖完整内容，不另建输入。表与操作码的对应（230/231、300、301、403 依次对应地址次序的四张表，[ai §5.3](../../../original/formats/ai.md#53-argument-parser-p3-0802)）是 Core 与内容 schema 共用的代码常量，不进入 payload。关键字类参数的解析：取参数文字，去掉尾随空格，按表项次序比较（只把 A–Z 折叠为小写），第一个相等的项的 i32 值即为解析值（CR-19 的 `integer`）；没有匹配为 CR-15 的 `unknown-keyword`，在创建时拒绝。操作码 403 在支持集外（CR-15 的 `unsupported-opcode`），第四张表只经内容读取器的结构检查。
- **SCEN 头部 +0x0C 与源记录 +0x7C：** 现有任务读取器在头部 +0x0C 非零时以 `unsupported-payload`（`/header/mode`）拒绝；对象记录读取器把 +0x7C 列为保留字，非零即拒绝（SCEN 与 SCCT 共用该读取器）。所以支持的内容中选择 flag 与份额的波次模式字恒为 0，地图可见标志的基础值恒为 false（MW-01、MW-06），Core 不需要这两个字段；CR-15 中“补入之前不得以默认值放行”的条件由此满足。将来支持非零值时，同时修订 P3-03 的任务内容、本条、CR-15 与 MW-01。
- **版本：** payload schema 与转换器版本由 P3-03 的修订 3 递增；它不另外递增 `RULES_VERSION` 或快照格式（CR-25 的递增已覆盖 AI 的加入）。用旧内容录制的 replay 因 setupHash 不符而在执行前拒绝。

#### CR-27 友伤累计的分工（D-03）

- **写入：** 归 P3-10，不变（CR-13、[CB-05](#cb-05-世界状态)、[CB-12](#cb-12-通讯反应报告与回复的调用点)，已实现）：`0x3c208` 第 1 步的 `0x38f20` 在 P3-07 伤害入口的固定位置以原始伤害写 `WorldState.ai.friendlyFire`，规则按 CR-19（WB6）。P3-08 不在伤害路径中写累计，也不另建第二个写入点。
- **读取：** 归 P3-08：`0x38fd8` 在 `0x614a8`、`0x61a88`、`0x61f20` 中读取（`accumulated` > AICO +0x28，i32 有符号，等号不阻塞），用于阻塞待处理命令（CR-18）与私有行为字节 b = 5（CR-17）。
- **形状：** 只有 CB-05 一份定义（CR-19 只列出，不另定义）；初值、不衰减、不重置（救援、僚机损失、无僚机）按 CR-19。
- **测试与联合验收：** P3-10 以独立期望测试写入（窗口重置的严格比较、原始伤害、只对第一个种类 2 的对象、攻击者种类 1、每次伤害恰一次）；P3-08 以合成的 `friendlyFire` 测试读者（阈值上下与等号、阻塞保留、愤怒持续）。完整链（玩家命中僚机 → 累计 → 命令阻塞与愤怒 → 窗口过后再次命中）由后集成的一方验证：P3-10 的写入已在本分支，所以由 P3-08 执行（P3-08 的 AC-08，子任务 19、20）。
- **被排除：** 把写入移入 P3-08（P3-08 spec 的原方向）——要重开 P3-10 已批准且已实现的 CB-05、CB-12、CB-19，并把同一原版函数 `0x38f20` 的两个分支（累计与船体低告警）分给两个任务，有重复累计的风险。

#### CR-28 僚机命令与回复的接口（D-03）

P3-10 的 D-01 已定稿并实现投递与回复（[CB-04](#cb-04-实体)、[CB-06](#cb-06-无线电入队取出与清空)、[CB-08](#cb-08-内部请求)、[CB-13](#cb-13-领域事件与次序)）。本条记录 P3-08 如何消费它们、交出什么，以及联合验收；不另建请求、单槽、队列或事件。

- **P3-10 交入：**
  - 菜单的命令码由 `deliver-command` {receiver, code, sender, commandIndex} 投递（CB-07、CB-08，码 0 不投递）；请求处理把 `receiver.ai.pendingCommand` 写为 `{ code, issuedTick }`（后写覆盖先写，不校验种类），并发出 `command-delivered`。这是单槽唯一的写入者。
  - 回复入口 `queueLine(context, speaker, type)`（`0x38d54`，CB-06）：说话者不可解析或头像不在范围时不抽取、返回 false；否则按类型抽取、查表，查到时入队并发出 `radio-queued`。
  - `fullRepair(context, entity, inRequestHandling)`（CB-10），供僚机行为 3 的到达 `0x61bd0` 以 `inRequestHandling` = false 调用（CR-23）。
- **P3-08 消费（单槽）：** 只消费种类 2（僚机）的 `pendingCommand`：活动或停靠时由 `0x614a8`（每次到期更新与每次安装），停放时由 `0x61f20`（停放步），两表的结果按 CR-22 映射。阻塞待处理（CR-18）时保留、不回复、不发事实；消费时执行效果、按需调用回复、清为 null，各一次。种类在 `0x6807c` 中（友方机体与基地）、状态为 `active` 的对象的单槽由 P3-10 的 `0x3bed0` 消费并清除（CB-04、CB-12），P3-08 不读写；其余种类的单槽保留到被覆盖或随实体移除（CB-04）。请求只带码，玩家目标、玩家、Warp 目的地与船体都在消费时读取（CR-18）。
- **回复：** 在原版的回复位置调用 `queueLine(context, 僚机, 线号)`；抽取、查表、入队与 `radio-queued` 都在 P3-10 的函数中。P3-08 不调用 `queueRadio`、不另建回复事件或队列。停放码 3/4 无玩家时不调用（`replyLine` 为 null）。
- **P3-08 交出：** 每次消费恰一个 `wingman-command-consumed`（CR-22 的字段与消费者）；被覆盖或阻塞中的命令没有事实。它与 P3-10 的 `command-result`（输入 tick 内每条命令恰一次）、`command-delivered`（请求处理中写入单槽时）是三个不同的事实，以接收者与 `issuedTick` 关联，不按 ID 回查已移除的实体。另交出只读查询 `isClosingMissileLock`（CR-16），供 P3-10 帧尾的尾随警告（CB-09）。
- **次序：** 第 N 个 tick：对象更新中玩家命令批次的 `command-result` → 请求处理中的 `command-delivered`。消费最早在第 N + 1 个 tick 的对象更新中（请求处理在对象更新之后），在僚机的走查位置依次为回复的 `radio-queued`（若入队）与 `wingman-command-consumed`。
- **联合验收：** 真实菜单 → `deliver-command` → 消费 → `queueLine` → `radio-queued` 的链由后集成的一方验证（[P3-10 spec 的依赖与交付边界](../10/spec.md#依赖与交付边界)的同一规则）。P3-10 的菜单与回复已在本分支，所以由 P3-08 执行（P3-08 的 AC-08、AC-11，子任务 20、23）：以正常 `TickInput` 的菜单命令录制，并以未修改的 `replayRecord` 重放、事件流相同。场景至少包括：码 1–7 与 ≥ 8 在活动与停放两条路径；同 tick 两条菜单选择（后写覆盖）；消费前玩家换目标；消费前僚机被移除（无事实）；友伤阻塞时的保留与阈值以下时的执行；停放码 3/4 无玩家不回复；无僚机配置；基地接收者不经 P3-08。P3-08 仍可在既有 `TickContext`/`RequestQueue` 上以内部请求替身测试机制，但它不作为标准 replay 证据；浏览器闭环归 P3-15。

#### CR-29 对象集合与地图可见标志的分工（D-03）

- **唯一所有者：** P3-09。`WorldState.objectSets`、`Entity.mapVisible`、`object-sets` 阶段的重建与揭示函数（`0x2ee60`）以 [MW-02](#mw-02-玩家状态与世界状态)、[MW-06](#mw-06-对象集合与地图可见标志object-sets-阶段) 为唯一定义，已实现。P3-08 不另定义、不另建，也不在 `object-sets` 中加入调用。CR-19 中 `objectSets` 与 `mapVisible` 的重复定义由本条撤回。
- **P3-08 的调用点（只有一个）：** 僚机的停放步（`0x62250` 的种类 2 分支，`object-update` 中）在任何视角以上一次重建的集合调用 MW-06 的揭示函数；它写的 `mapVisible` 只影响本次搜索，在下一次重建时被重置。同一 tick 的 `object-sets` 先于 `frame-end` 的地图步重建并（视角 8 时）揭示，所以僚机的揭示从不进入地图的图标列表。
- **P3-08 的读者：** 停放处理器 `0x62250` 的目标搜索按集合次序（并列与随机挑选依赖它）；`0x62760` 只在搜索者为种类 2 时读 `mapVisible`。第 N 个 tick 的走查读取第 N − 1 个 tick 重建的集合与 `mapVisible`，集合不随本 tick 的新建实体更新（僚机在走查中投放的 Xpon 在下次重建前不是成员）；世界创建时集合为空，第一次 AI 决策总在一次重建之后（D5 的 *First build*）。读者在每个读取点检查 ID 的有效性；原版中成员在 AI 读取时总是有效（移除只发生在请求处理，先于 `object-sets`），失效 ID 只作不变式测试。其他读者见 MW-06；目标候选、雷达、碰撞、伤害与停放更新不读它们。
- **基础值与输入：** 重建时为 false（MW-06）。记录 +0x7C 由导入拒绝非零值（CR-26），所以与原版“+0x7C ≠ 0”在支持的内容中相同；运行时 Xpon 同样为 false。CR-24 决定 2（无条件重建）与 MW-06 的重建相同，不另实现。
- **联合测试（Node，在 P3-09 的实现上运行 P3-08 的读者，逐 tick 断言集合、`mapVisible`、搜索结果与 RNG 抽取次数）：**
  1. **地图关闭：** 重建后全部为 false；僚机停放步的揭示只影响本次搜索，在同一 tick 的地图步与下一次重建之后都不可见。
  2. **第 N 个 tick 打开地图：** 请求处理提交视角 8，同一 tick 的 `object-sets` 重建并揭示；第 N + 1 个 tick 的僚机搜索读到该次揭示的结果，并在其上叠加自身的揭示。
  3. **第 M 个 tick 关闭地图：** 同一 tick 的重建不揭示；第 M + 1 个 tick 的搜索只读到基础值与自身的揭示。
  4. **连续地图帧：** 每个 tick 的结果只由当前位置决定，没有历史；快照中的集合与 `mapVisible` 等于独立重算的值。
  5. 走查中投放的 Xpon 在下一次重建前不是成员；被毁源、停放、停靠与 Warp 中的机体照常是成员。
  6. 无僚机配置、无玩家与世界创建后的第一次决策。
  7. 两个世界与重试不共享集合；同内容、种子与输入的 replay 一致。
- **联合验收的责任：** P3-09 负责生产侧：MW-06 的实现、其 AC-05 的测试与 R-14 的原版对照（已交付，作为回归保持通过）。读者侧的联合测试（上列 1–7）由后集成的一方执行：P3-09 已合入本分支，所以由 P3-08 执行（P3-08 的 AC-09，子任务 21）。联合测试若发现生产侧与原版不符，按 P3-09 的契约流程修订 MW-06 并取得批准，不在 P3-08 中改写或另建副本。浏览器中的地图与 AI 联合场景归 P3-15。
- **依据与限度：** MW-06 是“按预先授权由 agent 定稿、待用户事后审阅”的契约；用户审阅若改变它，本条随之修订。
- **被排除：** P3-08 拥有集合并让 P3-09 改为复用（P3-08 spec 技术决定 8 的原方向）——P3-09 已实现并完成 goal，须重开其契约与实现，重复定义会产生两套可见性，没有收益。

#### CR-30 `b` 的输入侧（D-03）

CR-20 的命令不变。物理绑定由 [P3-05 绑定表](../05/spec.md#绑定表)的 `KeyB` 行给出（无 Shift、无 Ctrl，只在飞行，可重复）；原版“每次键盘轮询至多一次”在项目中由输入层的“一次新按下至多一个命令、重复每帧每键至多一次”保证。菜单打开时的优先级仍按 P3-10 的 CB-07：所选内容的菜单只用数字与 `x`（CB-01 检查 1、2：命令表的键为数字与 `x`，按位置生成键的列表至多 9 项），所以切片中 `b` 从不被菜单占用，菜单打开时 `drop-transponder` 仍按 CR-20 判定。

**对前文的修订（只列变化，均随本节获批）：** CR-13 的 `0x3c208` 行（CR-27）；P3-08 的 D-01 一节开头的“不在本节”段、“与 P3-10 的 D-01 对齐”段、对齐表的“友伤累计”行、“依赖”段与“与 P3-09 的 D-01”段（CR-26 至 CR-30）；CR-15 的“输入”一条（CR-26、CR-29）；CR-18 中基地单槽的引用（CR-28）；CR-19 的开头、代码块（删去 `objectSets` 与 `mapVisible`）、“友伤累计”“对象集合与 +0xD4”与“快照”三条（CR-27、CR-29）；CR-20 的绑定与轮询两句（CR-30）；CR-21 的 `deliver-command` 行（CR-28）；CR-23 的对象集合一条（CR-29）；CR-25 的“快照”一条与“对前文各节的修订”中的对象集合一项（CR-29）。

### P3-14 的契约修订（D-01）

**状态：已获用户批准（2026-10-17，D-01）。** 用户的选择：“批准全部推荐方案（含三项差异）”。由 P3-14/06 起草；依赖 P3-11 的部分（拆除时的 `object-retired`、没有玩家实体时警告标志在拆除与重开中的处理、失利处理、救援入口与结果延迟）仍然阻塞，等 P3-11 的契约；05 (c) 的 4、5、8 交 07（D-02）。

本节定稿 [P3-14 spec](../14/spec.md#实施关卡) 的关卡 D-01 中属于本 spec 的部分：音效消费者读取的 Core 只读输出、两种事件的位姿快照、一个新的退场事件，以及 CB-09 尾随警告条件的更正。播放器的公开契约在 [P2-08 的修订](../../p2/08/spec.md#播放控制器的扩展p3-14-的修订)，任务所有者的接线在 [P3-04 的修订](../04/spec.md#任务音频接线p3-14-的修订)，已批准的决定列在 [P3-14 的 D-01 定稿](../14/spec.md#d-01-定稿已批准)（下文“D1-n”）。本节建立在 P3-06、P3-07、P3-05、P3-08、P3-09 与 P3-10 的修订之上，那些修订已定的项不变；批准后，前文与本节不一致时以本节为准。编号 FA-01 至 FA-09 只供引用本节。

原版事实只记在 [audio 的 Flight sound presentation (P3-14)](../../../original/formats/audio.md#flight-sound-presentation-p3-14)，下文以其小节标签 A-01 至 A-10 引用，不重复。定稿依据是 [P3-14/05 的“06/07 输入”](../14/subtasks/05-evidence-contract-baseline.md#完成证据)。

**记法与通则：** 沿用 [P3-07 的修订](#p3-07-的契约修订d-01d-03)的记法（f32、i32、时钟、`EntityId`、故障、快照与“不持久”“静态”）。另外：

- **读取者**指 P3-14 goal 中已列出的子任务：08（Core 读模型）、13（空间与引擎参数）、14（HUD 读模型）、15（事件映射）、16（运行级消费者）。本节只为这些读取者增加字段；原版有而没有读取者的字段不输出。
- 新增的 projection 与 Render State 字段是读取时从世界派生的冻结纯数据，不是新状态，不进入快照规范文本；读取不写状态、不抽取。
- 音效消费者不读快照，不按 ID 回查已移除的实体，事件中不放实体引用（[Projection 与 Render State](#projection-与-render-state)的信息边界）。

**与 P3-08、P3-09、P3-10 的对齐：** 重叠处只有一份定义。

| 项 | 已有定义 | 本节 |
|---|---|---|
| 9 型仪表的两项警告 | CB-09 的 `tailCheck`（到期、雷达门禁与两项结果），CB-14 的 `communications.player.warnings` | 两项移到分区级的 `communications.warnings`，没有玩家实体时也保留；音效与 P3-13 都读它；不新增 P3-14 spec 计划的 `flight.combat.player.warnings`（FA-01） |
| 攻击者条件 `0x4ef9c` | CB-09 写作“攻击航线字节”；CR-16 定义 `isClosingMissileLock`（锁定等级 3 或 4） | 以 CR-16 的谓词为准，更正 CB-09（FA-01） |
| 玩家停靠 | CB-14 的 `communications.player.docking.docked`（玩家活动为停靠） | 直接读取，不新增（FA-07） |
| 无命令的 `weapon-selected` | CR-06；CB-10 的 `fullRepair` 只在请求处理中对玩家发出；基地服务步不发（CB-11） | 更正语义，不加字段（FA-06） |
| 地图、Warp、通讯、基地与 Xpon 的事实 | MW-05 的 `warp-destination-set`、`warp-started`、`warp-completed`；CB-13 的 `left-page-changed`、`base-navigated`、`base-confirmed`；CR-22 的 `transponder-deployed` | 原样消费，形状不变 |
| Render State | 前文、MW-11 的 `warp`；CB-14 说明形状不变 | 每个实体增加 `state` 与 `speed`（FA-04） |
| 对象退场 | P3-06 的 `object-left-world`（只有停放对象真正离开世界）；P3-07 的 `source-released`、`missile-ended`、`fragment-expired`、`object-destroyed`（各自只覆盖一部分） | 新增 `object-retired`，覆盖活动对象进入待移除或区域切换的每条路径（FA-07） |

#### FA-01 威胁警告：来源与 CB-09 的更正

- **来源：** 9 型仪表的警告音（[A-07](../../../original/formats/audio.md#instrument-9-warning-a-07)）与 P3-13 的两个指示灯读同一对 Core 标志 `missileIncoming` 与 `attackerOnTail`，即原版驱动指示灯与声部的同一对标志。它们已经是经过采样到期与子系统 12 门禁的结果，由 CB-09 作为规则状态 `WorldState.communications.tailCheck` 保存并进入快照。音效消费者与 HUD 表现读模型不再另做采样或雷达门禁，也不另存到期时钟，所以不会出现第二个状态机。
- **不新增 `flight.combat.player.warnings`：** P3-14 spec 计划的 `ThreatWarnings` 是未经门禁的对象条件，由表现层自行采样。CB-09 已在 Core 中实现同一采样，而且 `0x38c30` 的入队这一规则副作用依赖它，所以表现层再采样会重复原版的一个状态机；这样的字段也就没有读取者。是否照此修订 P3-14 spec 的 S-06 与“共享契约修订”一节，由 D1-02 决定。
- **形状（分区级，保留到没有玩家实体时）：** A-07 中没有玩家时两项标志保持原值，声部照旧按保留的标志处理。所以两项从 CB-14 的 `communications.player.warnings` 移到分区级，与 `player` 是否为 null 无关：

  ```ts
  type CommunicationsProjection = {
    readiness: 'ready';
    player: CommunicationsPlayer | null;                                  // CB-14，去掉其中的 warnings
    warnings: { attackerOnTail: boolean; missileIncoming: boolean };     // FA-01：tailCheck 中最近一次采样的结果
  };
  ```

  | 项 | 契约 |
  |---|---|
  | 类型与单位 | 两个布尔，无单位；值等于 `WorldState.communications.tailCheck` 的两项，即最近一次采样的结果，在两次采样之间与没有玩家实体时保持不变 |
  | 初值 | 世界创建时两项为 false（`tailCheck` 的初值）；没有“未就绪”状态，因为 CB-09 已实现采样 |
  | 生产者与读取者 | `communications.ts`；读取者为 P3-14/14（HUD 读模型）与 P3-13 的指示灯。CB-14 的 `player.warnings` 删去：它与本项是同一事实，而它的读取者 P3-13 尚未实现，所以“一事一处”不留别名 |
  | 序列化与测试 | 纯投影，不递增版本；08 断言没有玩家实体时两项仍等于 `tailCheck`，并覆盖“标志为真 → 玩家实体消失 → 再出现”时读数不变 |

  消费者不得把 `player` 为 null 解释为两项为 false。玩家实体在救援中复用而不移除，所以任务中 `player` 为 null 只出现在实例化之前与拆除中。**依赖 P3-11 而阻塞的部分：** 拆除时两项与声部的处理，以及原版跨任务不重置标志与到期（A-07 的“never reset”）在重开或重试时是否照原版，都等 P3-11 的结果与重试契约；在此之前，新世界从初值开始只是现状，不作为已批准的行为。
- **CB-09 第 2 条的更正（规则变化，D1-03）：**
  1. **攻击者条件：** 种类位 7–10（原版掩码 `0x780`）的实体按种类位升序、表内次序遍历，取第一个满足 `activity === 'active'`、`isActiveState(state)`、`ai.objectTarget` 为玩家且 `isClosingMissileLock(entity)` 的实体（CR-16：`combat.type` 为 `craft` 且 `combat.weapons.lock.level ∈ {3, 4}`）。A-07 已确认原版读的字节是武器块 +0x24（对象 +0x118）的锁定等级。CB-09 与 CB-17 决定 11 中的“P3-08 处理器私有状态中的攻击航线字节”与“没有处理器状态时不成立”一并撤销。
  2. **次序与雷达门禁：** 玩家实体存在且取样 > `dueClock` 时，先做攻击者遍历。找到攻击者时调用 `0x38c30`，CB-09 原有的条件与限频不变，**与子系统 12 无关**。然后取 s = 玩家的子系统 12：s = 0 时 `attackerOnTail` := 是否找到，并做导弹遍历；s = 1 时 `attackerOnTail` := false，并做导弹遍历；s ≥ 2 时两项都为 false。导弹遍历与 `dueClock` 的规则不变。
  3. **视角集合：** 按 A-07，类型 9 的回调每帧由全局回调列表调用，与驾驶舱槽位无关，所以在视角 1、6、8 与 0xC–0x12 中执行，不在 0x13 中执行。CB-17 决定 11 按槽内仪表类型把集合收窄为 0xC、0xD、1、6 的部分撤销。该决定所列“原版只在仪表记录到期时调用”的差异也随之撤销：原版每帧调用，与 Core 每 tick 判定相同。驾驶舱显示步其余部分（CB-09 第 1 条、CR-10）的视角集合不变，所以尾随警告从显示步中分出。它在 `frame-end` 中的位置不变：显示步之后，通讯呈现子步之前。
- **解决的交接：** 本条解决 [Core 模块说明的交接](../../../engineering/modules/core.md#交接)中“CB-09 尾随警告的攻击者条件”一项，两处定义不再不一致；该说明由实现的子任务更新。
- **可达性：** 所选任务中两项条件都不可达（A-07，高概率），所以切片内容上的结果不变。但规则变了（其他内容与合成输入下结果不同），所以递增 `RULES_VERSION`（FA-08）。快照形状不变：`tailCheck` 已含 `attackerOnTail`。
- **测试（08）：** 合成世界逐项覆盖：种类位 6、7、10、11；活动；状态 6、7、8；`ai.objectTarget`；等级 2、3、4；升序取第一个；s = 0、1、2 下的标志与 `0x38c30` 的副作用；视角 8、0xE、0x11 与 0x13；到期的等号与 0x40/0x80。再以 CR-16 的 AI 锁定更新（等级 2 → 3 → 4）驱动一个合成 AI 攻击者，接到 `attackerOnTail` 与 `warnTail`，并以正式 replay 重放。

#### FA-02 玩家目标的状态读数

```ts
interface CombatTarget {
  // 既有字段不变
  readonly activeState: boolean;   // FA-02：目标的 state 为 'active' 或 'projectile-hit'（原版 state ≥ 7）
}
```

| 项 | 契约 |
|---|---|
| 类型与单位 | 布尔，无单位；与 [entity-table.ts](../../../../src/core/world/entity-table.ts) 的 `isActiveState` 同义 |
| 缺失 | `flight.combat.player.target` 为 null 时没有这项读数；A-06 对 null 目标同样取 −1 |
| 生产者 | `combat.ts` 的目标读数；不读目标的 activity（A-06 不检查） |
| 读取者 | 14：锁定音的值（[A-06](../../../original/formats/audio.md#lock-tone-a-06)）在 `activeState` 为 false 时为 −1，否则为 `lock.progress` |
| 序列化与测试 | 不进快照或录制；08 覆盖每个 `ObjectState`（`destroyed-source`、`pending-removal` 为 false，`projectile-hit` 为 true），读数冻结且与世界脱离 |

- **选择的形状：** 锁定进度 `lock.progress` 是玩家武器块的 W8 值，与目标无关，P3-13 也照原样绘制。所以由 HUD 读模型组合两者，而不改写 `lock`；目标读数只增加一个布尔值，不公开目标的完整生命周期。

#### FA-03 引擎的机型最高速度

```ts
interface MotionPlayer {
  // 既有字段不变
  readonly recordMaximumSpeed: number;   // FA-03：玩家机型记录的 +0xB8
}
```

| 项 | 契约 |
|---|---|
| 类型与单位 | f32，运行时单位/秒：`craftInfo.content.craft[玩家 kindBit].atB8`（[craft §3.5](../../../original/formats/craft.md#35-craft-record-and-missile-body-record-236-bytes) 的 +0xB8） |
| 与既有字段 | 不是 `maximumSpeed`（+0x78，随能量降低）。A-05 的指令速度 c 复用 `commandedSpeed`（块 +0x6C），A-04 的玩家当前速度 sₚ 复用 `speed`（块 +0x08），都不新增 |
| 缺失与边界 | `motion.player` 为 null 时没有；静态值，由 setupHash 绑定的输入决定。内容不拒绝 0；读取者按 D1-06 处理 0 |
| 生产者与读取者 | `projection.ts` 的运动读数；13：引擎变调（[A-05](../../../original/formats/audio.md#player-sources-and-the-engine-a-05)） |
| 序列化与测试 | 无；08 断言它等于该机型记录的值，并且在能量降低最高速度时不变 |

#### FA-04 Render State 的逐实体增补

```ts
interface RenderEntity {
  // 既有字段不变
  readonly state: ObjectState;   // FA-04：对象状态（原版字节 +3），entity-table 的封闭联合
  readonly speed: number;        // FA-04：移动块 +0x08，f32，运行时单位/秒
}
```

| 字段 | 读取者与用途 | 缺失与约束 |
|---|---|---|
| `state` | 16：持续声音的门禁（[A-01](../../../original/formats/audio.md#presentation-item-dispatch-a-01)：只有 `destroyed-source` 或 `isActiveState` 的实体有更新项；退场另由 FA-07 的事件给出）；13：爆炸与其他模型的参数 | 每个列出的实体都有，不缺失 |
| `speed` | 13：非玩家来源的速率输入 sₛ（[A-04](../../../original/formats/audio.md#non-player-sources-a-04)） | 列出的实体都未停放，按实体表的不变式都有移动块；缺少时为 Core 故障 `render-state.movement`，不给 0 |

- **不增加 activity：** Render State 已排除停放的实体，这就是 A-01 更新项的活动门禁（activity ≠ 0）；停靠时的跳过读玩家的停靠事实（FA-07）。
- **不增加姿态：** `orientation` 已含第 3 行（下标 6–8，即对象 +0x60–+0x68）。
- **信息边界：** 这两项是对象自身的呈现状态，原版音效对每个未停放对象都读它们。渲染器之外，只有音效消费者为 A-01、A-02、A-04 的逐对象声音读取它们；仍不得从 Render State 推导目标列表、地图标记或计数。
- **序列化：** Render State 不进快照或 replay，所以没有版本影响。
- **测试（08）：** 每个 `ObjectState` 的映射；`speed` 覆盖各移动块模式（`craft`、`warp`、`linear`、`spinning`、地图标记）；停放实体仍不列出；输出冻结且与世界脱离；缺少移动块的故障。

#### FA-05 发射与受击事件的位姿快照

```ts
interface ShotFiredEvent {
  // 既有字段不变
  readonly shooterForward: Vec3;         // FA-05：发射者姿态第 3 行（+0x60–+0x68），f32 分量，无单位
  readonly shooterSpeed: number | null;  // FA-05：发射者移动块 +0x08，f32，运行时单位/秒；没有移动块时为 null
}
interface HitEvent {
  // 既有字段不变
  readonly victimForward: Vec3;
  readonly victimSpeed: number | null;
}
```

- **取值时刻：** 与同一事件的 `shooterPosition`、`victimPosition` 相同，即发出时（CR-06 的通则）。没有移动块只发生在停放的受害者（停放交战），这条路径原版没有受击声音（A-01）。
- **用途（D1-04）：** 原版在同一帧的渲染中读取来源的当前位姿与速度（A-02：射击与受击只在开始时参数化一次；A-04）。读取者 13、15 的规则是：来源的 ID 在本帧的 Render State 中时用帧末实体；不在时用这些快照。每帧一个 tick 时，帧末实体正是原版在那一帧渲染时读到的值；一帧折叠多个 tick 时与原版不同，作为待批准的差异。仅有现有的位置快照不足以计算速率，所以增加第 3 行与速度，不写近似的静止值。
- **不改 `explosion-started`：** 爆炸声是爆炸对象自己的更新项（A-02），参数取其 Render State 实体；EXPL 的选择属 P3-12（D-02）。
- **生产者：** P3-07 发出这两种事件的位置（射击与导弹的构造、伤害入口，含停放交战）。
- **序列化与比较：** 事件形状改变，递增 `RULES_VERSION`（FA-08）。`compare.ts` 的事件字段表与读取器增加这四个字段：`Forward` 的三个分量与非 null 的 `Speed` 都按既有的 f32 规则（`isFiniteFloat32`，即 `F32`）校验，不用一般的有限数规则；`Speed` 可为 null。事件数不变，预算不变；`recordedEvents` 注释中每个事件约 120 字符的估算由实现的子任务按新形状更新。
- **测试（08）：** 每种 `cause`，含停放的 null 速度；快照冻结且与世界脱离；比较器能检出新字段的差异；合成运行的正式 replay。

#### FA-06 `weapon-selected` 的无命令来源

- **原版（[A-10](../../../original/formats/audio.md#play-by-id-boundaries-and-reachability-a-10)）：** 11381 由每次武器键按下发出；救援的完全修理每前进一步发出一次，可以听到；基地补弹的选择在消息循环之后投递，从不播放。
- **Core 现状：** 命令的选择带 `commandIndex`。`commandIndex: null` 只由 `fullRepair` 在 `inRequestHandling` 为真且实体为玩家时发出（CB-10）；切片中它唯一的此类调用者将是 P3-11 在请求处理中的救援。基地服务步的选择遍历什么也不发（CB-11），僚机的完全修理以 false 调用。所以现有事件已经区分“可听”与“不可听”：后者根本没有事件。
- **决定（D1-01）：** 不加来源判别字段。`commandIndex: null` 的含义更正为“原版在消息循环中处理的无命令选择，即完全修理（P3-11 的救援）”。`domain-events.ts` 中“P3-10 的基地补给”的注释与 CR-06 的措辞由 08 更正；行为不变，不递增版本。P3-14 对每个 `weapon-selected` 都使用 11381。
- **对 P3-11 的约束：** 若 P3-11 需要另一个原版不发声的无命令选择来源，先按[扩展规则](#扩展规则)加入判别字段（例如 `origin`）并递增 `RULES_VERSION`，不能复用 null 而让音效误播。
- **测试（08）：** 基地服务步的补弹遍历不发事件；`fullRepair(玩家, true)` 每次前进发出一个 null 事件，`fullRepair(僚机, false)` 不发。

#### FA-07 停靠事实与退场事件

- **停靠（不新增）：** A-01 的跳过读玩家的活动，所以读 `communications.player.docking.docked`。不能用 `interactionContext` 或视角 6 推断，因为从基地打开地图时视角为 8 而活动仍为停靠。`communications.player` 为 null 时不跳过。
- **为什么需要新事件（D1-05）：** 原版的移除项（代码 3）在对象于活动中退场时投递，然后 `0x55894` 停止该对象表中仍在跟踪的声部（A-01、[A-02](../../../original/formats/audio.md#per-object-sound-table-a-02)；种类 `0x3300000` 例外，由消费者处理）。它与同帧其他表现项一样带有投递次序。Runtime 一帧至多 5 个 tick，帧末 Render State 中的“消失”会丢掉 tick 与次序；P3-14 spec 也禁止依赖帧末缺失。既有事件都不覆盖全部路径：

  | 退场路径（Core 写入处） | 现有事件 |
  |---|---|
  | 爆炸结束（`destruction.ts`，X4 的 `0x2409c`） | 无 |
  | 爆炸放开所持来源（消息 0x40，`releaseHeld`） | 无 |
  | 碎片交出来源（`0x2574c`） | `source-released`（有 `removed`） |
  | 伤害直接移除（`outcome: 'removed'`） | `object-destroyed`（有 `outcome`） |
  | 活动区域检查（`checkActiveArea`，原版 `0x3a4b0`）：区域切换或离开即移除的种类 | 无 |
  | AI 的 Warp 离场（`applyWarpDeparture`，消息 0x800000，原版 `0x214a4`，派发器分支 `0x214cb` 高概率在其中） | 无 |
  | 导弹熄火、碎片到期、弹丸移除 | `missile-ended`、`fragment-expired`；弹丸无。三者都在 `0x55894` 跳过的种类中 |
  | 停放对象真正离开世界 | `object-left-world`（停放对象没有声音） |
  | 拆除（原版对活动对象投递移除项） | 不在 Core 中：属 P3-11，**阻塞** |

- **新增事件：**

  ```ts
  /** An active entity entered pending removal or the area switch: the original's removal item. */
  interface ObjectRetiredEvent extends DomainEventBase<'object-retired'> {
    readonly entityId: EntityId;
    readonly kindBit: number;
    readonly state: 'pending-removal' | 'area-switch';   // 进入的状态
  }
  ```

  | 项 | 契约 |
  |---|---|
  | 发出时机 | 活动为 `active` 的实体由其他状态进入 `pending-removal` 或 `area-switch` 时，在写入状态的同一处立即发出，因此带 tick 与流水线中的发出次序。由一个共享的写入函数统一处理，取代上表中各处的直接赋值。已在两状态之一中的实体不重复发出；停放与停靠的实体不发出（原版 `0x21650` 只处理活动 1，区域检查只把活动对象移出） |
  | 种类 | 所有种类都发出，`0x3300000` 的例外由消费者按 A-02 处理，Core 不复制音效规则 |
  | 对应原版 | A-01 的三个投递者（`0x21650`、区域检查、派发器分支）都表现为活动对象进入这两个状态。08 须逐处核对上表写入处与原版投递者的对应；对 `0x55894` 不跳过的种类发现不对应时，先修订本条，不在消费者中补猜 |
  | 读取者 | P3-14/15、16：按事件次序停止该来源已跟踪的声部，并清空其声音表 |
  | 预算 | 每个实体每 tick 至多 2 个（区域切换后又待移除），即至多 2 × `entities` = 4,096；与 CR-14、MW-14、CB-16 等合计约 13,200，仍在 `eventsPerTick`（32,768）之内，`CORE_LIMITS` 不变 |
  | 序列化与版本 | 新的事件种类：并入 FA-08 的同一次 `RULES_VERSION` 递增；`compare.ts` 的事件字段表与读取器增加 `object-retired`；快照与 replay 格式不变 |
  | 测试（08） | 上表每条 Core 路径各发出恰一个、次序正确；已待移除的再写不发；停放与停靠不发；同一 tick 中区域切换后待移除发两个；预算的 limit 测试；合成运行的正式 replay |

- **备选（未推荐）：** 用 FA-04 的 `state` 与帧末 Render State 中的消失推断退场。它不需要版本，但折叠帧中丢失 tick 与次序，且违反 P3-14 spec 的“不依赖帧末缺失”。Render State 的 `state` 仍用于持续声音的门禁。

#### FA-08 版本、读取器、比较器与测试

- **`RULES_VERSION`：** 相对实际集成基线（当前为 7）递增一次，由首个实现 FA-01、FA-05 或 FA-07 的子任务（P3-14/08）递增，此后本 goal 内不再递增。旧规则版本的记录在任何 tick 之前拒绝。与其他并行分支合入时，按既有的“相对实际集成基线各递增一次”处理。
- **快照格式：** 不变（6）：没有新状态，`tailCheck` 的形状不变。
- **replay 格式：** 不变（3）：命令联合与记录形状不变。
- **纯 projection 与 Render State 增补**（FA-01 的分区级 `warnings`、FA-02、FA-03、FA-04）：不递增任何版本。
- **读取器与比较器：** 更新 `compare.ts` 中 `shot-fired`、`hit` 的字段表与读取器（新字段按 f32 规则），新增 `object-retired`，以及事件的合成生产者；`CORE_LIMITS` 不变；`eventsPerTick` 的推导注释加入 FA-07 的项，budget 测试照旧通过。
- **测试责任：** 08 负责 Core 的投影、Render State、事件与 CB-09 的契约测试；13–16 用合成读模型测试消费者；19 做规则集成；21 用真实 Runtime 与 Session 核对同一输入在音频启用与禁用时的事件与检查点（P3-14 AC-13）。
- **文档：** Core 模块说明的“Projection 与 Render State”“已知差异”（撤销决定 11 中的差异部分）与“交接”，由 08 与 27 更新。

#### FA-09 交接

| 任务 | 交接 |
|---|---|
| P3-08 | `isClosingMissileLock` 由 CB-09 的攻击者遍历使用，由 P3-14/08 接入（FA-01），P3-08 的契约不变 |
| P3-11 | 救援的完全修理须在请求处理中调用 `fullRepair(…, true)`，所选任务中发出 5 个 `weapon-selected`；新的无命令选择来源须先加判别（FA-06）。拆除须为活动对象发出 `object-retired`（FA-07）；没有玩家实体时 `communications.warnings` 的保留与重开时是否重置（FA-01）随结果与重试契约定稿。P3-14 需要的失利处理、结果延迟到期与停靠中被毁后的活动仍无契约（D1-10） |
| P3-12 | Render State 的 `state` 与 `speed` 可供渲染器使用（不是必须）；听者与爆炸效果的接口属 D-02 |
| P3-13 | 指示灯与警告音读同一对分区级标志 `communications.warnings`（不再是 `player.warnings`），闪烁仍归 P3-13 |
| P3-15 | 联合 replay 的事件含 FA-05 的新字段与 `object-retired` |

### 原版研究

执行时以只读静态分析为主，必要时用运行时读数。事实写入 executable 或 scenario（英文），带置信度与证据，不含原版内容或反编译输出。

| ID | 问题 | 门槛 | 交给 |
|---|---|---|---|
| Q-01 | 排程顺序：`0x6721c` 中段 1 记录、段 5 条目与僚机的入队次序；`0x67584` 如何排列同一时刻的项；`0x67018` 在一帧内处理多个到期项与多次请求的次序 | 已确认（代码） | P3-02 |
| Q-02 | 放置：实际支持的锚点偏移、矩形与全世界随机映射，取值范围、每轴抽取与关联；与世界矩形比较后的处理；存储位置路径；段 5 重算锚点与复制模板字段的条件 | 已确认（代码）；切片运行经过的支持集须经运行时核对，合成数据覆盖其边界。被拒绝的网格路径不要求完整研究 | P3-02 |
| Q-03 | 运行时比例：`0x66c00` 传给 `0x68d2c` 的常量；f32 位置与 i32 矩形、间距换算后的取整 | 已确认（代码） | P3-02 |
| Q-04 | 缺省值：`0x6744c` 的调用时机（每条记录一次还是每个对象一次）；+0x78 的随机映射；段 5 成员与僚机记录的缺省 | 已确认（代码）；+0xDC/+0xE0/+0xE4 须经运行时核对 | P3-02 |
| Q-05 | 名称：`0x67d44` 对各掩码的分支；种类名的来源；已用名称的记录方式；名称耗尽时的处理 | 已确认（代码） | P3-02；种类名来源若需导入，交 P3-03 |
| Q-06 | 僚机：`0x6721c` 中的门禁、生成时刻与放置（种类 2 的 +0x48 缺省） | 已确认（代码与运行时，U-023） | P3-02 |
| Q-07 | 实例化：`0x67938` 写入的、与机型记录无关的初值（包括姿态与速度的来源）、计数器与对象事件 | 已确认（代码）；依赖机型记录的部分只记交接 | P3-02；P3-06、P3-07 |
| Q-08 | 实体表：`0x520d4` 的插入位置与分配失败条件；`0x5261c` 的遍历次序；移除时引用、名称占用与源记录计数的处理 | 已确认（代码）；区分原版可达规则上限与项目故障预算，不能预设两者相同 | P3-02 |
| Q-09 | 流水线：`0x20d10` 中生成队列、消息循环、`0x2bf08`、`0x21584`、`0x221fc`、周期系统、`0x23808` 与 `0x334bc` 的次序；消息循环是否在同一遍处理新投递的消息；玩家更新回调所在的位置 | 已确认（代码） | P3-02 |
| Q-10 | `0x26284` 的上下文选择与轮询/重复语义；动作何时成为规则意图、按住开火如何读取、模式变化如何屏蔽旧输入 | 已确认（代码）。只研究正式动作契约需要的范围；不建设 DOS 输入仿真器。物理绑定及浏览器清键归 P3-05，持续射击的节奏归 P3-07 | P3-02；P3-05 |
| Q-11 | 数值（U-009）：本任务使用的位置、初始姿态与相关数学的存储/中间运算类型、轴约定与查表；其他运动/制导路径只记责任 | 本任务数值转换及初值须已确认（代码）；关键语义未确认则不得先按纯双精度实现。额外路径归 P3-06、P3-07 | P3-02 |

- **达不到门槛时：** 相应的实现与验收项记为 blocked，写明已尝试的途径与恢复条件，不按猜测实现。高概率的结论按证据实现，并在代码注释、Core 模块说明与对照结论中标注。
- **发现新路径时：** 研究中若发现切片实际使用、但本 spec 未列出的实例化路径或字段，先修订本 spec 再实现。若只涉及其他任务的规则语义，记入 U 项并交给负责任务。
- **U 项：** U-009、U-022、U-023 的状态与线索随结论更新，负责阶段不变。

### 对照方法与判据

本节为 R-01 至 R-03 预先写定方法、样本与判据，随本 spec 一并批准（[P3-01 对下游任务的约束](../01/spec.md#对下游任务的约束)）。原版测量的方法与样本记入计划新增的 B-007（中文，按[行为模板](../../../original/behavior/_template.md)）；新版的对照结论与候选身份记入 subtask 证据。

| 规则 | 方式 | 方法与样本 | 判为“一致”的条件 |
|---|---|---|---|
| R-01 时基（实现） | 单位与边界精确核对 | Node 在 2 与 4 单位/tick 下覆盖时钟、秒换算、到期等号和跨阈值、溢出拒绝；原版结构证据复用 P3-01/B-006 | 精确满足项目固定步长契约和原版单位换算；报告明确标为“单位/调度阈值一致，完整帧行为未在此验证”。不将缺少零步长帧、cycles 速率偏差或其他系统的积分结果写为已一致；原版/新版整帧等价不是此项结论 |
| R-02 调度与时刻 | 精确、离散 | Node 用独立期望覆盖直接记录、同刻多来源、编组重复成员、零时刻、延迟及全部请求。真实内容带/不带僚机各运行至队列耗尽；原版至少 2 次合格运行，带/不带各 1 次，覆盖开局与延迟来源的全部实例化 | 来源、数量和同刻次序与 Q-01 相符。对已有上一轮队列检查的延迟项，上一轮 elapsed ≤ due 且本轮 elapsed > due，在本轮全部派发。首轮单独检查 elapsed > due 和全部已到期项，不强加 elapsed−due ≤ 本帧步长；原版开局原点包含过场/构建时间，不能用第一帧移动步长代替 |
| R-02 放置 | 代码推导、确定性边界与运行交叉核对 | 对每个已实现随机映射，独立推导有限随机域到输出的映射、支持集、端点包含性、各结果原像计数、轴之间及成员之间的关联；可枚举域穷举，否则用完整的分段/取模计数推导并覆盖每个分段边界。测试不以被测实现计算期望。原版读取实例化时的位置及当时锚点 | 映射与前置概率/关联关系符合代码证据，不以“都在范围内”证明分布相同。原版每个位置落入由当时操作数推导的支持集；确定性的布局加法及转换按 Q-03/Q-11 的存储精度核对。舍入范围由各已确认转换的舍入区间组合推导，不能事后指定百分比。删除没有固定样本/分箱依据的卡方门槛；若代码无法推出映射，先补证据或修订并批准统计方案，不能自行选种子直到通过 |
| R-02 缺省值与名称 | 精确、离散 | Node 覆盖每个字段自己的 null/显式值/负值语义、别名和抽取次数，以及候选名、池、无名称、种类名、耗尽和释放。原版读取 +0xDC/+0xE0/+0xE4 并绑定源声明；名称以 Q-05 代码为依据 | 确定值相等，随机值满足已推导的映射；不能把任一负值统一钳零。共享源记录的多个实例保留原版默认与命名语义 |
| R-03 僚机 | 离散 | Node：无僚机与每个索引。原版：上述两次运行 | 无僚机时没有种类 2 的对象；带僚机时恰好生成所选的名单项，其时刻与放置满足 R-02 的判据 |

- **原版运行：** 在私有副本中按[运行时测量指南](../../../guides/runtime-measurement.md)核对身份、暂停点、映射、重复读数、保护与回收，记录 cycles、过场设置、生成原点、前后队列检查样本及调试暂停的影响。不得把调试器等待时间或过场用时误算成一帧的规则误差。关闭过场配置用于与 G-02 对齐时单独记录，不覆盖基准设置。单位与阈值的代码事实不依赖 cycles；实际帧生效时间及任何以真实秒表示的对照仍遵守 B-006，在 U-021 冻结后核对适用性，必要时重测，不能在这里提前豁免。
- **独立性与覆盖：** 真实内容的期望从原版记录/数据独立推导，不复用被测 Core 的排程与放置 helper。累计实例化计数与最终存活计数分开；运行期间被毁不应减少已生成总数。两次运行是带/不带僚机的离散覆盖下限，不是随机分布统计样本。无僚机须结合调度门禁和完整来源覆盖证明，不以某一帧没看到僚机代替。
- **判定：** 只有原版运行中的观察全部满足判据，才判为“一致”。任一项不满足即判为“不一致”，回到研究或实现，不放宽判据。原版样本太少，不做分布统计；分布由代码推出，在 Node 中检验。
- **记录：** 原版事实的置信度与新版的对照结论分开记录。

## 数据模型与契约

正式类型都是计划新增，按职责落在 `src/core/` 下（见[涉及模块](#涉及模块)）；以下名称可在实现时调整，语义不变。逻辑内容的类型仍由 [logic-content.ts](../../../../src/content/logic/logic-content.ts) 拥有，不在 Core 中复制。

| 数据/字段 | 类型、单位与约束 | 权威所有者 | 输入/输出或序列化边界 |
|---|---|---|---|
| 运行配置 | 完整内容身份、setupHash；原始难度 0–100（生产固定 19）；僚机为 null 或索引；种子 uint32；每 tick 单位为正偶数安全整数（生产默认 2） | Core 定义契约，P3-04 提供包与配置 | 创建时校验；进入快照与 replay 记录 |
| 世界 | `step(tickInput)` 返回 `DomainEvent[]`；`projection()`、`renderState()`、`snapshot()` | Core | Runtime 推进世界的唯一入口 |
| `TickInput` | `axes` 与有序动作 `commands`，见[输入与命令](#输入与命令) | Core 定义契约，P3-04/P3-05 采样并组批 | `step()` 与 replay 记录；不含原版键码缓冲 |
| `DomainEvent` | `{ type, tick, … }`，可序列化的纯数据，按发出顺序排列，不含对象引用（[ADR-0006](../../../decisions/ADR-0006-core-returns-events.md)） | Core；事件类型由负责任务增加 | `step()` 的返回值；Runtime 在帧后分发 |
| 实体 | 字段见[实体与生命周期](#实体与生命周期) | Core | 快照、Render State、projection 分区 |
| 任务时钟 | 非负安全整数，单位 1/64 秒 | Core | 快照、projection |
| 生成队列项 | 到期时刻（时钟单位）、来源（声明或编组）、剩余请求数 | Core | 快照；查询接口 |
| 命令结果 | tick、commandIndex、commandType、outcome、reason | Core | 每个结构合法命令一个结果；Runtime 与 UI 关联反馈 |
| 本 tick 中间事件 | 封闭类型与显式产生/消费阶段，无对象引用 | Core | 只在本 tick 流水线内；跨 tick 延时使用所属规则的具名状态 |
| projection | 分区：`clock`、`mission`、`player`，以及扩展分区 | Core | 渲染器与 UI 桥接只读 |
| Render State | tick、视角模式、观察实体，以及按 ID 排序的实体列表 | Core | Runtime 保留两帧；渲染器插值 |
| 正式快照 | `osr-game-snapshot`、版本与状态 | Core | 规范文本与哈希；不是存档 |
| replay 记录与结果 | `osr-game-replay` 记录；结果为事件与检查点 | Core | P3-04 导出，P3-15 在 Node 中重放 |

### 持久化与兼容

不涉及 IndexedDB、localStorage 或资源缓存，也不改变转换器版本或内容 schema。

快照与 replay 都是带格式和规则版本的纯数据，不兼容的组合一律拒绝，不做迁移。replay 文件的下载/保存位置归 P3-04；自动兼容门禁是 rulesVersion、格式版本、内容身份和 setupHash，不只是人工核对 `producer`。快照、私有记录与诊断可能包含导入内容的派生状态，只在本地使用，不自动上传；公开测试只使用合成内容。合成格式保持不变。

## 技术决定

1. **tick 与时钟（R-01）：** 保留默认每 tick 2 个原版时钟单位（32 Hz），以整数时间避免单位混淆。它是总计划允许校准的初始固定步长选择，不是原版 32 Hz 的证明；60 Hz 也可通过独立整数时钟表示，不以“无法换算”为理由排除。非默认参数只用于明确的校准，生产默认仍需各规则对照；单位测试不能代替 U-021 和帧依赖规则的实测。
2. **G-02 占位不计时：** 采用 P3-01/08 推荐方案：媒体占位等待不推进 Core，结束不补跑；自然结束与跳过的规则效果相同。它对应省去原版媒体播放用时的选择，不声称按键跳过必定零用时，也不省去引擎内倒计时、补给或 Warp。与基准启用过场的差异和原版构建/首帧原点单独披露。P3-04、P3-10、P3-11 在各自 spec 中接纳同一方案；不同方案需共同修订，不由本次审阅代它们批准。
3. **数值：** JS number 是表示容器，真实的转换、存储舍入、定点或查表语义依 Q-03/Q-11；关键证据不足就阻塞，不让下游替已经输出的错误初值兜底。未改总计划对定点/查表证据的要求。
4. **游戏动作而非 DOS 键码：** 采用 ADR-0004 的设备无关动作映射与 ADR-0006 的 Runtime 命令队列。上下文数字选择等仍由 Core 解释，不需要 UI 复制游戏状态。开火通过 Command 请求，按住采样不使用 OS 自动重复。未实现动作显式反馈，不能静默吃掉所有输入后宣称正式命令闭环。
5. **本 tick 事件而非通用消息引擎：** 采用总计划的固定流水线显式传递；不为复刻原版 dispatcher 建另一条持久消息队列或回调注册机制。
6. **流水线以已确认的先后关系为约束：** 大阶段先稳定，Q-09 核实派发器子阶段后才能定稿。研究结果与草案冲突时修订草案，不强迫原版证据服从预排顺序。
7. **在第一个 tick 实例化：** 创建只进行校验、缺省与排程，生成事件统一从 step 输出；这是项目从零时钟开始的明确边界，原版首轮队列检查另按实际原点核对。
8. **拒绝切片外路径：** 依据阶段索引的要求“切片任务未用到的路径不实现，遇到时明确拒绝”。放置服务仍实现救援所需的存储位置路径。
9. **不提供快照恢复：** P3 的 replay 从初始数据重放，已能满足一致性校验。从快照恢复须对全部规则状态做不变量校验，其范围随规则任务不断扩大，留给 P4 的存档设计。
10. **扩展规则：** 共享形状/语义变化回到本 spec 审批；下游只在既定契约内实现，不给“扩展点”无限授权。格式版本、rulesVersion 和原始输入绑定共同约束 replay。
11. **对照判据：** 用代码映射与原像计数验证随机支持集、分布和关联，不用欠缺分箱/样本方案的卡方检验。原版两种配置仍必须取得合格运行，不因宿主限制免除实测；首轮与延迟生成分别使用适用的时钟判据。

上述取舍按用户 2026-10-09 生成与审阅时的指示（“如果有需要我回答的问题，直接按你推荐的答案”），由 agent 采用推荐方案写入草案。审阅纠正了原草案的输入所有权、保真过度声明、无依据的数值预设与开放扩展解释。这项授权不是完整 spec 批准，也不授权降低 P3 退出条件；若未来确需保留违反冻结架构或保真要求的方案，先另行 ADR 与总计划更新，本 spec 不能批准该冲突。

## 验收标准

| ID | 可观察的通过条件 | 验证方法与所需证据 |
|---|---|---|
| AC-01 | 正式契约位于 `core/` 的正式模块中。正式模块不导入 `core/synthetic/`，合成模块也不导入正式模块；Core 的纯度与确定性 lint 通过；合成场景、快照与 replay 的测试不经修改即通过（若移出了通用校验 helper，只改导入路径） | 计划新增的边界测试；`pnpm typecheck`、`pnpm lint`、`pnpm test` |
| AC-02 | 创建的 tick 0 状态符合契约；坏结构保留既有错误类型，生产切片/难度不符、错误种类绑定、坐标换算异常、别名不符、切片外路径和生成展开超限均在创建前拒绝，无世界或部分结果；诊断不含输入名称/坐标。原版与 synthetic 范围门禁分开测试。相同输入创建两次规范文本相同，修改调用者数据不改变世界 | Node 单元测试，合成逻辑内容；验证 CoreLimits 的 limit/limit+1 与乘法溢出 |
| AC-03 | 默认 2 及测试用 4 单位/tick 的时钟、tick、秒换算与 > 到期边界正确；tick/时钟/ID 加法和生成时刻换算超界时在改状态前拒绝。没有外部补计时间入口。R-01 只声明单位/调度验证，不宣称完整原版帧行为一致 | Node 单元测试；接口与证据审阅 |
| AC-04 | 每个合法动作变体通过结构校验；坏字段、未知变体、NaN/Infinity、越界参数、稀疏数组和超限输入拒绝且世界/录制不变。每个合法命令有且仅有一个正确 commandIndex 的结果；P3-02 尚未实现的效果为 not-implemented，不伪造状态变化。不同来源的等价动作得到相同输入记录；不存在 Core 按键/命令持久队列 | Node 单元测试；P3-05 的真实绑定另行验证 |
| AC-05 | 合成任务覆盖[任务实例化](#任务实例化)中每条标为“实现”的路径，断言：实例化的 tick 与次序（Q-01）、数量、来源、编组成员与布局偏移、`object-instantiated` 事件的内容与顺序；生成开关清除后不再实例化；实体 ID 从 1 起连续分配且不复用 | Node 单元测试 |
| AC-06 | 每个支持的放置例程符合 Q-02 的端点、分布与关联推导；锚点缺失、存储位置和世界矩形边界正确；有 object 来源的别名记录只换算一次，仅段 5 可达记录按原版区别处理，布局不再次变换。Q-03/Q-11 的舍入边界可测；零向量与非零存储位置的选择优先级正确 | Node 独立期望与边界测试，不能使用被测 helper 生成期望；分布验证依[判据](#对照方法与判据) |
| AC-07 | Q-04 的每个字段分别覆盖 null、显式零、负值、正值及其合法/拒绝语义，不能把 +0x70 的钳位泛化到 +0x74/+0x78；别名与多个实例的默认/随机抽取时机正确。Q-05 的候选、池、无名、种类名、耗尽与释放逐分支覆盖；所有可影响以后生成的占用与计数进入世界状态 | Node 单元测试，原版规则以 scenario/Q 证据为准 |
| AC-08 | 僚机为 null 时，整个运行中都没有种类 2 的对象。为每个索引时，恰好生成该名单项，其时刻、放置、缺省值与名称符合 Q-06。越界的索引被拒绝 | Node 单元测试 |
| AC-09 | 流水线与 Q-09 的先后与请求处理次序一致：对象更新为实时种类遍历，生成只产生请求，实例化与移除在请求处理中，之后提出的请求被丢弃；请求处理中实例化的实体本 tick 不更新、不参与之后的运动与碰撞。移除时机（同 tick 或下一 tick）、引用失效、计数不减与查询筛选符合 Q-08；被毁与移除分开，不误删待救援玩家。内部故障不发布部分事件/投影/快照，并锁存到后续调用；不开放注入任意处理器的生产 API | Node 单元测试；代码审阅。尚未实现的规则不能用空系统测试冒充 |
| AC-10 | projection、Render State、事件和录制导出深度冻结、脱离输入和世界；读方法不改哈希，旧输出在后续 tick 后不变。分区有明确的未就绪状态而无虚假玩法数据；来源命名空间、模型/种类分离和放置序号正确；停放实体不在 Render State 中。合成消费者覆盖新生、移除和不连续放置的两帧契约；跨运行折叠归 P3-04 | Node 单元/消费者契约测试，不要求浏览器渲染已实现 |
| AC-11 | 快照规范文本包含全部可影响未来结果的状态，包括默认后的记录、名称占用、计数、关联、RNG 与队列；逐字段的代表性变更改变规范文本，测试样本的哈希相应变化，但不宣称哈希无碰撞。字段插入次序不影响文本；语义列表次序保留；ASCII 转义及 16 位小写哈希满足契约 | Node 单元测试 |
| AC-12 | 相同配置/数据/种子的录制经 JSON 往返后 replay，事件与全部检查点相等；覆盖零 tick、末 tick 去重、间隔大于 1、超限前原子拒绝与故障导出。比较正确报告最早可观测的事件/检查点/长度分歧，输入改动但无可观测影响不强求分歧。未知 rulesVersion/格式、坏 expected/actual、伪造相同内容身份但改变 setup、错任务/config 与超限记录均拒绝且不输出成功前缀。固定的一组不同种子证明随机分支被使用，不宣称任意两种子都产生不同位置 | Node 单元测试；内容验证与 Core 绑定的交界测试 |
| AC-13 | 在开发者本地导入的所选任务上，带与不带僚机两种配置各运行到全部排程对象实例化。按种类的计数（玩家 1；敌方类 16，即种类 `0x80` 12 个、`0x100` 4 个；种类 `0x20000` 4 个；其余按数据推出）、来源与生成时刻，等于由数据与原版规则推出的值；无僚机时没有种类 2 的对象。输出只含计数、时刻、判定与身份，存放在 `local/research/p3-02/` | 本地核对，不进入公共测试 |
| AC-14 | Q-01 至 Q-11 各自达到门槛；事实写入 executable 或 scenario（英文），带置信度与证据。U-009、U-022、U-023 已更新，负责阶段未改。仓库中没有原版内容、反编译输出或读数 | 文档检查、`pnpm check:compliance`、git 审阅 |
| AC-15 | B-007 在采集前写明场景、配置、观测量、样本、误差来源与判据。至少有 2 次合格的原版运行（带与不带僚机各 1 次，工具报告为 `complete`）。R-02 的时刻、放置支持集、缺省值与 R-03 的门禁按[判据](#对照方法与判据)得出结论。subtask 证据给出 R-01 至 R-03 的新版对照结论、候选身份与差异说明 | 工具的私有报告、B-007、subtask 证据 |
| AC-16 | Core 模块说明记录正式 API、阶段表、扩展规则、上限数值及其依据；向 P3-03 交接名称/其他新增内容需求，向 P3-04/05 交接动作采样与清键，向 P3-06 至 P3-14 交接阶段和未就绪分区，不声明下游玩法已完成。源码结构指南与工程约定同步；文档更新日期与链接正确；`pnpm check` 通过；改动 baseline 工具时其 unittest 通过 | 文档与消费者契约测试；`pnpm check`；适用时 `python3 -B -m unittest discover -s tools/baseline -p 'test_*.py'` |

## 验证策略

- **单元/契约测试：** 用 Vitest，测试与源码相邻放置。用 [logic-content.test-support.ts](../../../../src/content/logic/logic-content.test-support.ts) 等合成内容构造覆盖各路径的任务，覆盖：创建与拒绝、输入校验、时钟、排程、放置、缺省值、名称、僚机、流水线、projection、快照与 replay。迭代时的针对性检查为 `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts`。
- **Replay/一致性：** 同一配置与种子的录制在 Node 中重放，事件流与检查点哈希一致。只宣称同一代码版本、同一运行时内的一致。完整闭环的 replay 由 P3-04 与 P3-15 验证。
- **浏览器验证：** 不适用。本任务不改动应用、Runtime 或界面；正式 Core 由 P3-04 在浏览器中接入。
- **实机/原版对照：**
  - 静态研究由 agent 用只读 Ghidra 与本地数据自行完成。审阅时本 worktree 没有 `local/`，本轮只核对受跟踪的证据和源码，没有取得新的原版读数；这不是 Q-01 至 Q-11 已解决的声明。执行须先恢复本工作区可合法访问的原版资料。
  - 原版运行时核对（AC-15）需要进入所选任务并取得延迟来源的生成记录。按证据指南先核对当前可用的 agent 方法；P3-01 已记录本机 Computer Use 无法送达游戏输入，因此在该限制仍存在时，由用户仅操作私有副本的任务配置/进入/必要飞行，agent 负责配方、观察、读数、判断与记录，不请用户自行完成原版研究。
  - 无法取得必需输入操作或合格样本时，该项记为 blocked，不用合成测试或静态结论代替；若宿主能力已恢复可由 agent 操作，则不强制要求用户本人在场。
  - 同一时间只能有一个会话操作基准环境。
- **工程检查：** `pnpm check`；改动 `tools/baseline/` 时运行其 unittest；`pnpm check:compliance`；文档的链接与元数据检查。仅生成或审阅本 spec 时，只检查文档与路由。

## 风险与恢复

风险等级：中。本任务只新增 Core 代码与文档，不涉及持久化或已交付的导入链，改动可以整体回退。但它是 P3-04 至 P3-14 的共同基础，契约返工的代价会随下游任务的推进而增加。

- **契约过早固定或不足：** 扩展规则区分了增量扩展与契约修订。下游发现契约不足时修订本 spec，而不是绕开它。
- **研究结论改变顺序或次序：** Q-01、Q-08、Q-09、Q-10 在实现相应部分之前完成。
- **原版运行依赖用户：** 尽早安排。配方与工具在运行前用合成测试与只读核对准备就绪；运行失败时按工具契约保留证据并重试，不以未合格的读数作结论。
- **32 Hz 与原版可变步长的差异：** 相近的平均帧率不保证输入、AI、碰撞或逐帧效果一致，渲染插值只改善画面，不修复规则时序。P3-05 至 P3-15 按各 R/V 判据核对；差异须回到责任任务修复，涉及本时间契约时重新审批，不能以默认值已选定为由免验。
- **性能：** 使用可变世界、固定顺序与按种类表的遍历，不预先引入 ECS、Worker 或 WASM（[总计划 §6](../../master-plan.md#6-补齐-threejs-之外的游戏能力)）。
- **原版内容误入仓库：** 文档只记录结构、地址、计数与判定；读数与报告只存放在 `local/research/p3-02/`。
- **恢复：** 代码与文档在 goal 分支上逐项提交，可以按提交回退；没有存档或缓存需要迁移。

## 未决事项

无待用户选择的方案；本轮按用户授权采用推荐修正。Q-01 至 Q-11、适用的数值舍入边界、流水线子阶段和两次原版运行仍是执行门槛，不能由“未决事项：无”推断已经查明。研究结果若要求改变已定的形状、数值策略或范围，先修订并重新批准相应契约；U-021 与后续帧依赖对照也未被本次审阅关闭。

## 审批

用户于 2026-10-09 明确批准经 review-spec 修订后的完整契约（“approve the spec and generate goal”），并要求生成 goal。批准范围为 S-01 至 S-10、AC-01 至 AC-16，以及时间模型、数值表示、随机数、运行配置与世界创建、输入与命令、实体与生命周期、系统流水线、任务实例化、僚机、Projection 与 Render State、快照/哈希与 replay、扩展规则、原版研究 Q-01 至 Q-11、对照方法与判据，和技术决定 1 至 11（其中按用户指示由 agent 采用的推荐方案随本次批准一并生效）。

本次只记录批准，不改变范围、行为或验收要求。批准不代表实现完成，不授权阶段验收豁免、改写历史记录或改变冻结决定；Q-01 至 Q-11、两次合格原版运行与 U-021 相关对照仍是执行时须取得的证据，达不到门槛时按本 spec 阻塞。front matter 的 `reviewed:` 标记对应批准前最后一次审阅的文本，本次只改了 status 与本节。

**2026-10-09 修订：** 用户于 2026-10-09 批准按 P3-02/01 的 Q-08/Q-09 结论修订本 spec（“批准修订并解除 05 的阻塞”）。修订涉及：系统流水线表第 4、5、7 行及其说明；实体与生命周期（对象状态与活动、表现在实例化时视为就绪的项目选择、移除时机与引用失效）；Render State（停放实体不呈现）；AC-09 与 AC-10。其他范围、行为与验收要求不变。修订后未重跑 review-spec，`reviewed:` 标记仍对应修订前的文本。

**2026-10-09 修订（二）：** 用户于 2026-10-09 批准把 P3-02/01 已确认的两个派发器阶段补入系统流水线表第 5 行：对象更新之后、生成队列检查之前把到期通讯回复转为表现项（`0x2cd60`，P3-10），能量之后重建两个对象集合（`0x2ede0`，未分析，暂无负责阶段）。两者在 Core 中都是空阶段，P3-02 的范围、行为与验收要求不变。`reviewed:` 标记仍对应第一次修订前的文本。

**2026-10-10 修订（P3-06 检查点 A，依用户 2026-10-09/10 的预先授权，协调者裁定）：** 由 P3-06 goal 的子任务 06 起草，按 P3-06 协调者的裁定与推荐答案定稿，不需用户审阅（P3-06 spec 的技术决定 13 与其 goal 执行记录中的授权；不涵盖总计划与 ADR 中的冻结决定）。修订只新增“P3-06 的契约修订（检查点 A）”一节与本条记录，并改了 front matter 的日期：D-01 至 D-08 的实际修订，包括补入原版已有、本任务生成未保存的编队领队与偏移，以及对象集合重建阶段的说明与建议负责阶段。依据、推荐理由与被排除的方案记在 [P3-06 spec 的审批](../06/spec.md#审批)。本 spec 的其他范围、行为与验收要求不变，既有 goal 与 subtask 的历史证据不改写。修订后未重跑 review-spec。

**2026-10-10 修订（P3-07 的 D-01、D-03，依用户的预先授权，由 P3-07 的子任务 08 定稿）：**

- **范围：** 只新增“P3-07 的契约修订（D-01、D-03）”一节与本条记录。P3-06 检查点 A 已定的项不变；本 spec 的其他范围、行为与验收要求不变，既有 goal 与 subtask 的历史证据不改写。修订后未重跑 review-spec。
- **授权出处与用户原话：**
  - [P3-07 goal 的审批节](../07/goal.md#审批)：用户于 2026-10-09 修改该节后批准（“i made some change. approve and commit”），把 08 改为自动，D-01 至 D-03 由 agent 直接批准最推荐的方案；同日的约定（“我们可能会在 execute goal 的过程中增加新的 subtasks，新增的 subtasks 不需要 review，直接 unblock”）也写在那里。
  - 用户 2026-10-10 对 P3-07 协调者的指示，原话由协调者在派发 08 时转引：“从现在开始，我接下来几个小时都不能接手或回答你的问题。如果有任何问题，你都按你最推荐的回答来做。如果需要修改spec或goal，我都同意。如果要增加新的subtasks来unblock一个subtasks，我也同意。”
  - 授权不涵盖总计划与 ADR 中的冻结决定，也不放宽阶段退出条件。本修订没有改变它们：表现层随机放在 Core 之外正是[总计划 §5](../../master-plan.md#5-状态管理与通信约定)的要求；CR-11 的差异都作为已批准差异记录与披露，不冒充美化，也不放宽 P3 的对照要求。
- **所选方案与理由；被排除的方案：**
  1. **爆炸效果归表现层（CR-11）。** 研究证实规则路径上读相机的只有爆炸与碎片效果（C1）。被排除的方案是把这些效果留在 Core，由 Core 按视角模式计算逻辑相机与视口并进入快照；它要把按分辨率变化的视口与尚未完全分析的外部视角相机（0x12 的函数未反汇编）带进 Core。选定方案的规则差异只有 Warp 出口搜索、实体预算与随机序列，都已记录。
  2. **状态显示的字段 1、5、8 由 Core 的固定步骤写入（CR-10）。** 被排除的方案是在伤害读取时由船体比例与挂点状态临时计算；那样会丢掉原版的闪烁与重绘时机，差异更大。
  3. **原因码沿用 P3-06 的三个，新增 `misfire`（CR-05）。** 被排除的方案：另建 `player-destroyed`、`context-blocked`（与 P3-06 的码重复）；把哑火并入 `weapon-disabled`（哑火会重置冷却，挂点并未损毁）。
  4. **跨 tick 的事实用固定调用点，状态由消费任务拥有（CR-13）。** 原版把跨帧状态放在消费方（任务内子状态、到期时刻、无线电队列，C3）。被排除的方案是由 P3-07 另存“待处理”标志：P3-11 接入前它没有消费者，与消费方的状态重复。
  5. **提高每 tick 的事件与请求预算（CR-14）。** 被排除的方案：维持 4,096，切片规模的极端组合下会故障；按规则截断扇出，会丢弃事实，契约禁止。
  6. **目标的清除不发 `target-changed`（CR-06）。** 原版对这些清除没有反馈（T5、T7），持续的目标由 projection 给出。被排除的方案是每次清除都发事件。
  7. **选择命令在所选挂点不变时也为 `accepted`（CR-05）。** 原版此时仍更新序号、清除锁定并请求音效（W3）。被排除的方案是返回 `no-change`，它会掩盖锁定被清除。
  8. **发射者失效后不保留归因（CR-06）。** 原版以分类掩码代替种类，不计击杀（H4）；玩家对象从不被移除，玩家的击杀不受影响。被排除的是 P3-07 spec 原先的“保留归因”。
- 本修订对 P3-07 spec 方向的改动记在 [P3-07 spec 的审批](../07/spec.md#审批)。

**2026-10-10 修订（P3-07 的子任务 34：追踪导弹的 AI 程序输入，依用户 2026-10-09/10 的预先授权）：**

- **范围：** 只改 CR-01：新增 `aiPrograms` 输入、语义检查 6、可达炮记录 +0x24 的非负检查（检查 5）、静态规则数据中的两条程序记录与 setupHash 表中的一行，以及本条记录。CR-14 不需修改：该输入是静态输入，按 CR-14 不进快照，沿用 P3-07 已递增的快照格式版本与 `RULES_VERSION`，replay 记录形状不变。其他范围、行为与验收要求不变，既有 goal 与 subtask 的历史证据不改写。修订后未重跑 review-spec。
- **起因：** P3-07 的子任务 32 实现共享转向模块时发现，追踪导弹的程序读取内置 AI 程序记录 1、2 的 +0x14、+0x24、+0x2C（[H5](../../../original/formats/executable.md#h5-missiles--confirmed-code-unless-marked)），而 CR-01 的输入与静态规则数据都没有 AI 程序，Core 拿不到；原版数值不能写进代码。P3-07 的子任务 17 另建议在世界创建时拒绝负的炮 +0x24：否则 Core 只会在弹丸的首次回调时故障。
- **授权出处与用户原话：**
  - [P3-07 goal 的审批节](../07/goal.md#审批)：用户 2026-10-09 决定执行中新增的子任务不需审阅，需要改变 spec 契约时直接批准最推荐的方案。P3-07 的协调者据此新增子任务 34（见该 goal 的执行记录）。
  - 用户 2026-10-10 对 P3-07 协调者的指示，原话由协调者在派发 34 时转引：“从现在开始，我接下来几个小时都不能接手或回答你的问题。如果有任何问题，你都按你最推荐的回答来做。如果需要修改spec或goal，我都同意。如果要增加新的subtasks来unblock一个subtasks，我也同意。”
  - 授权不涵盖总计划与 ADR 中的冻结决定，也不放宽阶段退出条件；本修订不涉及它们。
- **所选方案与理由：** 34 的推荐方案。`CreateWorldInput`、录制入口与 `ReplayContent` 增加顶层的 `aiPrograms`（同一包中 `data/ai-programs` 的规范内容，按内容读取器严格读取），与其他规则输入并列，Asset ID 按 CR-01 的规则校验。静态规则数据只复制记录 1、2 的三个字段，并在世界创建时校验。setupHash 覆盖该输入的 ID 与完整内容。这样 Core 读到的是导入内容本身，绑定与其他规则输入一致；P3-08 扩展 AI 读取时沿用同一输入与同一绑定。
- **被排除的方案：**
  1. **由调用者先提取三个字段，作为新输入传入。** 把规则所需的提取放到 App，setupHash 只绑定提取结果而不绑定导入内容，P3-08 还要再建输入。
  2. **把字段并入 `craftInfo` 或其他已有输入。** 需要修改内容契约与导入链，超出范围，也会让一个 Asset 的绑定混入另一个 Asset 的内容。
  3. **在代码中写入原版数值。** 违反项目的内容规则（不分发原版内容）。
  4. **只在可实例化机体装有追踪导弹时才要求记录 1、2。** 导弹是否追踪取决于发射时的锁定（W11、H5 的发射字节），要按运行推断“不会追踪”既复杂又易错；生产内容的内置表总有这两条记录，P3-08 也会读整张表。
  5. **setupHash 只覆盖三个提取的字段。** P3-08 扩展读取时要再改绑定；该内容没有只影响外观的字段，全部覆盖与 CR-01 对 `debrisParameters` 的做法一致。
  6. **允许负的炮 +0x24 并在运行中按 u32 回绕。** 原版的回绕造成遥远的到期，项目的时钟契约不复现 u32 回绕；创建时拒绝比运行中故障更早、更清楚。

**2026-10-10 修订（P3-07 的子任务 24：导弹制导时间的拒绝，依用户 2026-10-09/10 的预先授权）：** 只在 CR-01 的检查 5 中补入可达导弹记录 +0x44、+0x48、+0x54 非负与 +0x58 在 i32 内的检查，并记录本条。起因是 P3-07 的子任务 20、22 的建议：否则负寿命的导弹只会在首次回调时使 Core 故障。所选方案与被排除的方案同子任务 34 对炮 +0x24 的处理（不在运行中按 u32 回绕，创建时拒绝）。授权出处同上一条。其他范围、行为与验收要求不变，CR-14 不需修改（静态输入的检查，快照与 replay 记录形状不变），既有 goal 与 subtask 的历史证据不改写。修订后未重跑 review-spec。

**2026-10-10 修订（P3-05 的速度档位命令）：** 用户于 2026-10-10 在 P3-05 goal 执行中明确批准本修订（对 P3-05 协调者“是否批准这两份 spec 修订？”（P3-02 与 P3-06）选择“批准修订”）。修订只新增“P3-05 的契约修订（速度档位命令）”一节与本条记录：命令联合新增 `speed-preset`，普通飞行的档位从 `select-number` 改接到它，`rulesVersion` 与 replay 格式版本各递增一次。没有新增 S/AC 编号，其他范围、行为与验收要求不变，既有 goal 与 subtask 的历史证据不改写。

**2026-10-13 说明（P3-05 合入 main）：** P3-05 与 P3-07 在各自分支上都把 `RULES_VERSION` 从 2 递增为 3。合入时按“相对实际集成基线各递增一次”取 4；replay 格式版本为 2（只由 P3-05 递增），快照格式版本为 3（只由 P3-07 递增）。只改“P3-05 的契约修订（速度档位命令）”的版本一项的措辞，行为、契约与验收要求不变，未重跑 review-spec。

**2026-10-14 修订（P3-09 的 D-01，按用户 2026-10-14 的预先授权由 agent 定稿，待用户事后审阅）：**

- **范围：** 只新增“P3-09 的契约修订（D-01）”一节（MW-01 至 MW-16）与本条记录，并改了 front matter 的日期。前文各节与 P3-05、P3-06、P3-07 的修订已定的项不变；本 spec 的其他范围、行为与验收要求不变，既有 goal 与 subtask 的历史证据不改写。修订后未重跑 review-spec。
- **授权出处：** [P3-09 goal 的审批节](../09/goal.md#审批)记录了用户 2026-10-14 的原话与协调者据此作出的预先授权：关卡 08（D-01）由 agent 按研究证据取推荐方案定稿，如实记为“按预先授权由 agent 定稿、待用户事后审阅”。这不是用户本人对本修订的批准；用户审阅时如有异议，按正常流程修订本 spec 与受影响的实现。授权不涵盖总计划与 ADR 中的冻结决定，本修订不涉及它们：表现随机不进 Core 正是[总计划 §5](../../master-plan.md#5-状态管理与通信约定)的要求，与原版不同之处都作为已批准差异披露（MW-12）。
- **定稿依据：** P3-09 子任务 01 至 07 的完成证据与 [07 交 08 的汇总表](../09/subtasks/07-numerics-stages-original-docs.md#完成证据)；原版事实在 [executable 的 P3-09 节](../../../original/formats/executable.md#strategic-map-and-warp-p3-09)。
- **所选方案与理由；被排除的方案：**
  1. **三种命令经内部请求在请求处理中提交，判定用有效上下文（MW-04）。** 原版在玩家更新中轮询、在消息循环中应用，自动选敌读开始前的视角；按请求提交保留这一次序，有效上下文满足 P3-09 spec 的有序门禁。被排除：判定时立即写视角（自动选敌会看到新视角，与原版不同）；在循环外缓存入口上下文（P3-09 spec 明确禁止）。
  2. **选择资格由 `destination !== null` 派生，标记 ID 由种类表查得（MW-02、MW-03）。** 原版只有首次选点置 ps +0x00、只有实例化清零，与目的地同生共死。被排除：另存布尔值与标记 ID（同一事实两份）。
  3. **Core 拥有并序列化图标列表，含错开（MW-02、MW-07）。** 选点读的是上一帧绘制留下的列表，错开会改变命中与 z。被排除：选点时按当前实体重新查询（与原版的帧次不同）；由渲染器提供（违反 Core 的所有权）。
  4. **集合与可见标志跨 tick 保留并进快照，揭示是共享函数（MW-06）。** 僚机 AI 在下一帧重建之前读取它们。被排除：每次需要时临时派生（读到的不是上一次重建的集合）；等 P3-08 建设（P3-09 spec 要求本任务交付）。
  5. **隧道路径、转向、误差等全部 Warp 过程量为规则状态，用世界 RNG，每 tick 一次（MW-02、MW-07、MW-12 的差异 3）。** 它们决定位姿、到达与扣费。被排除：只把进度移入 Core（P3-09 spec 原方向，研究证明不足）；按时间缩放误差增量（发明原版没有的规则）。
  6. **`inWarp` 在被毁或救援放弃 Warp 后保持（MW-09）。** 这是已确认的原版行为，影响区域中心与 AI。被排除：放弃时清除（无依据的差异）。
  7. **到达不另存锁定的目的地（MW-08）。** 原版开始不锁定目的地；项目中 Warp 期间没有能改写目的地的命令，读实时值与原版等价。被排除：开始时冻结一份目的地（同一事实两份）。
  8. **E = 0 的地图读数给出 null（MW-11、MW-12 的差异 4）。** 原版的后果未确认，交运行核对。被排除：沿用原版异常（会让 Core 故障）；给出任意百分比（发明数值）。
  9. **地图几何以 `{ id, content }` 输入，静态派生量进 `WorldRuleData`（MW-01）。** 与 CR-01 的规则输入一致；三个字段都是规则数据，setupHash 覆盖完整内容。被排除：调用者先提取比例再传入（setupHash 不再绑定导入内容）。
  10. **记录 +0x7C 不导入（MW-01）。** 对象记录读取器已拒绝其非零值，切片全为 0，基础值恒为 false。被排除：本次加入任务内容（没有切片需要，徒增 schema 变化）。
  11. **距离标签开关不进 Core（MW-11）。** 研究穷举后它没有规则读者。被排除：P3-05 原先交接的新 Core 命令。
  12. **地图开关在地图中先于玩家可用性判定（MW-04）。** 原版被毁时被毁视角已取代地图；P3-11 接入前避免地图关不掉。被排除：沿用 CR-05 的次序。
  13. **`warp-start` 排在同批的玩家控制与发射之后（MW-04、MW-12 的差异 9；2026-10-14 执行中由 P3-09 协调者按同一预先授权补定）。** P3-09/17 发现按投递次序时 `[速度归零, request-warp]` 使 Core 故障；所选次序等于原版按键分帧的结果。被排除：保留故障；在控制路径按模式跳过（见差异 9）。
  14. **放大窗口像素不含 `0x4b56c` 的错开；玩家没有图标时的读数（MW-11；2026-10-14 执行中由 P3-09 协调者按同一预先授权补定）。** P3-09/19 发现 `0x4b56c` 依赖 Core 没有的 HUD 图标尺寸且没有规则读者，与距离标签开关同属呈现，交 P3-13；所选方案不改变 P3-03 的输入与版本。被排除：把图标尺寸加入地图规则数据并在 Core 中错开（增加输入与版本，只为绘制）。玩家没有图标只在 P3-11 的被毁/放弃 Warp 状态出现，原版研究表明玩家总有图标；连线与读数改用玩家当前位置，放大窗口距离为 null，P3-11 接入时复核。被排除：把连线与读数改为可空（为不可达状态扩大消费者分支）。
- **前置研究：** MW-12 的 R-A（启动旋转表）与 R-B（隧道路径的求值）是执行 07 后仍未读到的原版代码事实，形状已定，依赖它们的实现须等研究写入 executable 后再开始；这一阻塞交 P3-09 的协调者安排。

**2026-10-14 修订（P3-10 的 D-01，依用户授权，由 P3-10 的子任务 08 定稿）：**

- **范围：** 新增“P3-10 的契约修订（D-01）”一节（CB-01 至 CB-19），改写 CR-02 构造者一栏中种类 `0x4000` 的一句，并记录本条。P3-06、P3-07 与 P3-05 已定的项不变；本 spec 的其他范围、行为与验收要求不变，既有 goal 与 subtask 的历史证据不改写。修订后未重跑 review-spec。
- **授权出处与用户原话：** 用户于 2026-10-14 授权 agent 直接批准 P3-10 关卡 07、08、10 的推荐方案：“i authorize you to approve the recommended options for gates 07, 08 and 10”（记于 [P3-10 goal 的审批](../10/goal.md#审批)）。授权不涵盖总计划与 ADR 中的冻结决定，也不放宽阶段退出条件；本修订没有改变它们。
- **所选方案与理由；被排除的方案：** 见 CB-17 的决定 1 至 16 与 CB-18（每条写明所选、理由与被排除的方案）。要点：通讯对象用稳定身份而不模拟节点复用；码 9 照原版先进入等待；子状态 3–5 中停靠对象为 null 视为故障；菜单不刷新；离港按停靠时保存的基地位姿放置（本子任务以原生指令复核了保存位姿的来源）；同 tick 两次离港照原版；停靠中的漂移照原版；同批命令逐条读写；取消无反馈；显示次序即服务队列；尾随警告的 AI 条件归 P3-08、节奏每 tick 判定；页 2–5 的干扰闪烁不复现；种类 `0x4000` 移交 P3-08（被排除：留在 P3-10 并补齐范围与验收）。与 P3-08、P3-09 重叠的字段按本节开头的对齐表只有一份定义。
- 本修订对 P3-10 spec 方向的改动记在 [P3-10 spec 的 D-01 定稿](../10/spec.md#d-01-定稿已批准)；Runtime 与会话的部分记在 [P3-04 的运行中衔接](../04/spec.md#运行中衔接p3-10-的修订)。

**2026-10-15 修订（P3-08 的 D-01，经用户明确批准）：**

- **批准与用户原话：** 用户于 2026-10-15 明确批准（“approve D-01 and continue working. i authorize you to make decision to approve future decisions.”）。同一原话给 agent 的常设授权记在 [P3-08 spec 的审批](../08/spec.md#审批)；本条是用户本人的批准，不依赖该授权。
- **范围：** 新增“[P3-08 的契约修订（D-01）](#p3-08-的契约修订d-01)”一节（CR-15 至 CR-25）与本条记录，以及前文 CR-02、CR-05、CR-06、CR-07 中指向它的说明和 CR-25 对 CR-14 预算的修订（见该节末尾“对前文各节的修订”）。包括 CR-24 的全部决定，其中决定 3（基地自动挂点的绝对保持值在判定时视为已到期）、决定 11（AI 的 Warp 离场在 Render State 中多列出一个 tick）与决定 15（攻击航线摆动的 f32 任务时间以 Core 的任务时钟为原点）作为已批准的差异；版本按实际集成基线各递增一次：replay 格式版本 2 → 3、`RULES_VERSION` 4 → 5、快照格式版本 3 → 4（CR-25）；放宽其他任务已批准的字段：运行时 +0xE0 可由 `0x5e4d0` 写回、AI 写入导弹锁定字段（CR-02 的 `lock`）、`lastParkedUpdateClock` 的下界放宽为 −0x80（P3-06 的 D-02）。P3-08 spec 中的方向修订 ①–⑧ 随本条重新获批。
- **与 P3-10 的对齐：** 本节按名称引用 P3-10 已获批准的 CB 条目（CB-04、CB-05、CB-06、CB-08、CB-09、CB-10、CB-12、CB-13、CB-16、CB-17、CB-18），重叠处只有一份定义；它们在本分支合入前不另建定义。
- **不在范围：** 友伤累计 `0x38f20` 的写入归属不由本条决定，留给 D-03（P3-08 的子任务 09，见 CR-19 的待决事项）；关键字表的导入、`b` 的绑定与 `0x2ee60` 的实现归属同属 D-03。
- **所选方案与被排除的方案：** 见 [CR-24](#cr-24-定稿的决定与已批准的差异d-01)，此处不重复。
- 本 spec 的其他范围、行为与验收要求不变，既有 goal 与 subtask 的历史证据不改写。修订后未重跑 review-spec。

**2026-10-15 合并说明（P3-09 与 P3-10 合入 P3-08 的分支，协调者按用户授权执行合并，见 [P3-08 goal](../08/goal.md#执行记录)）：** 不新增决定，只记录两节在同一实现中的衔接。

- **节的次序：** P3-08、P3-09、P3-10 的契约修订按任务编号排列；三节各自声明的“重叠处只有一份定义”照旧：对象集合、`mapVisible` 与揭示以 MW-06 为准，命令单槽、`deliver-command`、`queueLine` 与 `WorldState.ai.friendlyFire` 以 CB-04 至 CB-08 为准。
- **版本：** MW-14 与 CB-16 在各自分支上都把 `RULES_VERSION` 由 4 递增为 5、快照格式版本由 3 递增为 4。两者改变的是不同的规则与状态，合并实现再各递增一次：`RULES_VERSION` 为 6、快照格式版本为 5，任一分支单独产生的记录与快照都被拒绝；replay 格式版本两边都未改变，仍为 2。P3-03 的切片定义版本同理为 6（[P3-03 的合并说明](../03/spec.md#合并说明2026-10-15p3-09-与-p3-10-的修订-2)）。CR-25 的递增相对这些合并后的值进行。
- **命令视图：** MW-04 的命令视图就是 CB-07 的批内有效视角，只有一份（`TickContext.commandView`）：`toggle-map`、`request-warp` 与 `launch` 都改写它，P3-07 的命令也按它判定。地图上下文中的 `confirm-selection` 按 MW-04 为 `wrong-context`，CB-07 中“地图的 Enter 归 P3-09、暂不实现”随之落地。
- **视角切换：** CB-10 的 `0x4cd68`（新旧视角之一为 6 时置 `statusDisplay.redraw`，页不变）在 MW-09 的 `switchView` 中实现，停靠与离港经它切换视角；从基地打开或关闭地图因此也置重绘。
- **容量：** CR-14、MW-14 与 CB-16 合计每 tick 事件约 8,968、请求约 3,719，快照约 11.8 MiB，都在既有 `CORE_LIMITS` 之内，取值不变。
- **未决（合并评审发现，须修订 MW-04 或 CB-07 才能定，合并未作决定）：** 两节各自成立，合在一起出现两种原版不可达或未研究的同 tick 交互，现均以 Core 故障结束：
  1. 停靠倒计时在 `mission-flow` 中到期（子状态 4 → 5，投递 `dock`）的同一 tick，`request-warp` 仍按已提交的飞行视角通过 MW-04 的门禁，延后的 `warp-start` 在 `dock` 之后应用：玩家停靠且进入 Warp（视角 1、上一视角 6），基地因区域中心移到目的地而离开活动区域；下一 tick 子状态 5 自动离港，`switchView` 离开视角 1 时恢复页面，停靠的视角切换以 `docking.view-switch` 故障。
  2. 同一批中被接受的 `launch` 把命令视图改为飞行，其后的 `request-warp` 按停靠位置判定能量并通过；请求处理先应用 `depart`（玩家移到约 1000 单位外的离港位姿），`warp-start` 按新位置重算的消耗可能超过能量，以 `warp.start-check` 故障。
  候选方案（待定）：在 `request-warp` 的门禁中加入子状态 5（含同批已接受的 `launch`）时拒绝，或按离港位姿判定；以及离开视角 1 的停靠视角切换是否发出 `left-page-changed`。原版每次轮询只取一键，第 2 种只在 Core 的批量命令中出现。

**2026-10-15 修订（P3-08 的 D-03，CR-26 至 CR-30；由 agent 依用户 2026-10-15 的授权批准）：**

- **批准与授权出处：** 由 agent 依用户 2026-10-15 的授权（原话：“approve D-01 and continue working. i authorize you to make decision to approve future decisions.”）批准，授权记在 [P3-08 spec 的审批](../08/spec.md#审批)。这不是用户本人对本修订的批准；授权不涵盖总计划与 ADR 中的冻结决定，本修订不涉及它们。
- **范围：** 新增“[P3-08 的跨任务修订（D-03）](#p3-08-的跨任务修订d-03)”一节（CR-26 至 CR-30）与本条记录，以及该节末尾“对前文的修订”所列的改动（CR-13、CR-15、CR-18 至 CR-21、CR-23、CR-25 与 P3-08 的 D-01 一节开头）。MW 与 CB 条目不变。
- **所选方案：** CR-26：关键字表经 P3-03 的修订 3 导入，SCEN 头部 +0x0C 与记录 +0x7C 维持由导入拒绝、Core 按 0 使用；CR-27：友伤累计的写入留在 P3-10（CB-05、CB-12 与 CR-13，已实现），P3-08 只读；CR-28：P3-08 消费 P3-10 的 `deliver-command`（CB-08）与 `queueLine`（CB-06），交出 `wingman-command-consumed`；CR-29：对象集合、`mapVisible`、`object-sets` 与揭示函数以 P3-09 的 MW-02、MW-06 为唯一定义，P3-08 只实现读者与僚机停放步的一次揭示调用，CR-19 的重复定义撤回；CR-30：`KeyB` 纳入（高概率正常玩法）。联合验收按“后集成的一方”：P3-09 与 P3-10 已合入本分支，命令与回复、友伤链与地图可见性的联合测试都由 P3-08 执行。
- **被排除的方案：** 把友伤累计的写入移入 P3-08（重开 P3-10 已批准且已实现的 CB-05、CB-12、CB-19，`0x38f20` 的两个分支分属两个任务，有重复累计的风险）；P3-08 拥有对象集合并让 P3-09 复用（P3-09 已实现，重复定义产生两套可见性）；另建僚机命令的请求或回复事件（与 CB-08、CB-06 重复）；不纳入 `b`（X5 支持正常玩法，省去它改变地图的视野来源）。
- 本 spec 的其他范围、行为与验收要求不变，既有 goal 与 subtask 的历史证据不改写。修订后未重跑 review-spec。

**2026-10-15/16 修订（P3-08 执行中的契约修订；由协调者依用户 2026-10-15 的授权批准，P3-08/33 补记）：**

- **批准与授权出处：** 下列修订都在 P3-08 的 goal 执行中由协调者依用户 2026-10-15 的常设授权（原话：“approve D-01 and continue working. i authorize you to make decision to approve future decisions.”，记在 [P3-08 spec 的审批](../08/spec.md#审批)）批准，各自的日期与起因记在 [P3-08 goal 的执行记录](../08/goal.md#执行记录)或相应子任务的完成证据（`ai-interpreter.channel` 见 [16](../08/subtasks/16-interpreter-scripts.md#完成证据)）；正文已随批准写入，本条补记批准记录（P3-08/29 的首次核对发现缺少）。这不是用户本人对这些修订的批准；授权不涵盖总计划与 ADR 中的冻结决定，这些修订不涉及它们。
- **范围：**
  1. **CR-24 决定 16**（2026-10-15，P3-08/14）：负的脚本延时等同于 0，作为已批准的差异；**决定 17**（2026-10-15，P3-08/19）：编队停止的速度测试在目标已不存在时取 0，作为已批准的差异；**决定 18**（2026-10-16，P3-08/33）：`ai-firing.lock-gun` 与 `ai-piloting.main-weapon` 两处依运行时挂点状态的越界读取为运行时故障。
  2. **CR-15：** 随决定 16 撤销 `negative-delay` 拒绝；澄清 `missing-transponder`：种类 `0x4000` 的模型绑定只能来自任务中种类 14 的声明或选项，没有这样的声明即为该原因（2026-10-15，P3-08/14）；运行时故障清单加入 `ai-interpreter.channel`（操作码 230、231、403 的关键字值低字节 > 2；2026-10-15，P3-08/16），以及决定 18 的 `ai-firing.lock-gun` 与 `ai-piloting.main-weapon`。
  3. **CR-23：** 状态 7 的 AI 步中 AI 锁定写入 `missileReady` 的时机按原生 `0x5dcd4` 更正为处理器到期的同一分支之内（2026-10-15，P3-08/18）。
  4. **CR-25：** `canonicalTextLength` 由 16 MiB 提高到 32 MiB（2²⁵），budget 测试断言严格的最坏情形，setupHash 的文本上限随之放宽（2026-10-15，P3-08/23）；版本一项注明 P3-09 与 P3-10 合入后的实际值：`RULES_VERSION` 7、快照格式版本 6、replay 格式版本 3，转换器 `graphics-5.logic-4`（2026-10-16 注）。
- **所选方案与被排除的方案：** 见 [CR-24](#cr-24-定稿的决定与已批准的差异d-01) 的决定 16、17、18 与 CR-25 的 `canonicalTextLength` 一项，此处不重复。CR-15 的澄清与 CR-23 的更正是按原版代码与既有条文的更正，没有可选方案。
- S、AC 的编号与措辞、本 spec 的其他范围、行为与验收要求不变，既有 goal 与 subtask 的历史证据不改写。修订后未重跑 review-spec。

**2026-10-16 说明（P3-08、P3-09、P3-10 合入 main）：** 不新增决定，契约不变。P3-10 在 2026-10-15 合并之后的提交（其 25–28）只改测量工具与文档，主线在三者分出之后没有规则变化，所以版本取 CR-25 注明的值：`RULES_VERSION` 7、快照格式版本 6、replay 格式版本 3。上文“2026-10-15 合并说明”中的两个未决联合故障仍未决。合入时的文档核对另发现两项衔接：两节都把它记为对方的交接，都没有实现，记在 [Core 模块说明的交接](../../../engineering/modules/core.md#交接)：

- CB-09 尾随警告的攻击者条件：CR-16 的只读查询 `isClosingMissileLock` 未实现；其谓词（锁定等级为 3 或 4）与 CB-09 的条件（攻击航线字节为 3 或 4）不一致，须先修订统一，接入时递增 `RULES_VERSION`。在此之前 `attackerOnTail` 恒为假。
- 地图标签的威胁闪烁：MW-16 与 CB-19 都指向对方，`MapLabel` 尚无该状态，须按扩展规则修订 MW-11 后加入，供 P3-13。

**2026-10-17 修订（P3-14 的 D-01，经用户明确批准）：**

- **批准与用户原话：** 用户于 2026-10-17 明确批准，选择“批准全部推荐方案（含三项差异）”：P3-14 spec 的 [D-01 定稿](../14/spec.md#d-01-定稿已批准)中 D1-01 至 D1-17 的全部推荐方案，以及本 spec、P3-04、P2-08 与 P3-14 spec 中起草的契约各节。其中 D1-04（一次性声音在折叠帧中的位置输入）、D1-06（零距离、零最高速度与无玩家时跳过速率更新）与 D1-13（Web Audio 的重采样与浮点输出）作为已批准的差异。
- **范围：** 新增“[P3-14 的契约修订（D-01）](#p3-14-的契约修订d-01)”一节（FA-01 至 FA-09）与本条记录。FA-01 修订 CB-09 第 2 条、撤销 CB-17 决定 11 中的差异部分，并把 CB-14 的 `player.warnings` 移到分区级的 `communications.warnings`；FA-06 更正 CR-06 中 `commandIndex: null` 的语义；FA-07 新增事件 `object-retired`。版本：`RULES_VERSION` 相对实际集成基线递增一次（当前 7 → 8），快照格式（6）与 replay 格式（3）不变（FA-08）。
- **仍阻塞与移交：** 依赖 P3-11 的部分（拆除时的 `object-retired`、没有玩家实体时警告标志在拆除与重开中的处理、失利处理、救援入口与结果延迟）仍然阻塞，等 P3-11 的契约；05 (c) 的 4、5、8 交 07（D-02）。
- **所选方案与被排除的方案：** 见 P3-14 spec 的 D-01 定稿表，此处不重复。
- 本 spec 的其他范围、行为与验收要求不变，既有 goal 与 subtask 的历史证据不改写。修订后未重跑 review-spec。
