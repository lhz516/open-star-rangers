---
type: plan
status: accepted
phase: P3
task: "02"
updated: 2026-10-10
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
  - **实体初始化扩展点的顺序**（在分配与命名之后）：最高速度（P3-06；P3-07 的 `0x3060c` 能量字段与 1 次抽取在同一位置）→ 两位字段（P3-07）→ AI 初态 `0x68050`（P3-06，0–3 次抽取；此前的交接归 P3-08）→ `lastParkedUpdateClock`（P3-06）→ `warpClock`（P3-06，玩家与僚机以外 1 次抽取；此前的交接归 P3-09）→ `0x20990`（P3-08）→ 活动判定（P3-02）→ 初始移动块（P3-06）→ `0x38cd4`（P3-10）→ 玩家状态（P3-02；P3-06 的目标与控制状态）。
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
  5. **除数与定义域：** 玩家机型的 c9C、c5C 为正（状态显示步的除数，CR-10）；有护盾（c5C > 0）的机型 c60 ≠ 0；瞄准炮（+0x28 = 1）的 +0x08 ≠ 0；导弹记录 +0x60 ≠ +0x64（爆炸衰减的分母）；可达炮记录的 +0x14 在 [0, 32] 内（E5：停放交战射击次数的 FISTP 不溢出）；可达炮记录的 +0x24（弹丸寿命，H2 的到期时刻 = 首次回调时钟 + +0x24）非负，原版对负值按 u32 回绕为遥远的到期，项目不复现；实例化与能量的 i32 运算按记录百分比不溢出。导弹 +0x2C 的反余弦只供 P3-08，本修订不计算也不校验。
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
| `craft` | 0–19（`0xfffff`） | 实例化扩展点（CR-07）。P3-10 的种类 `0x4000` 由其修订另行接入 |
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
  lock: MissileLock;            // +0x118–+0x128。锁定机只为玩家运行（W8），其他对象保持初值
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
  retargetClock: number;        // +0x4C。P3-08 原样写入的保持值（W9），初值 0
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
| `weapon-selected` | 玩家的选择命令被接受时紧随其结果发出，`changed` 表示当前挂点是否改变（冲突 32，P3-14 的音效 11381）。P3-10 的基地补弹若循环选择，由其修订以 `commandIndex: null` 复用 |
| `shot-fired` | 请求处理中构造弹丸或导弹之后发出；主通道也可发射导弹，消费者按 `family` 选择音效 |
| `hit` | 每次原版投递受击表现项（`0x2a40c`、`0x2a5fc`），或停放交战实际施加伤害时，在护盾与船体结算之后、被毁处理之前发出一次。`gated` 为玩家被毁视角门禁挡下的命中（原版仍投递受击项）。受击者已被毁时原版不投递，也不发事件。碎片受击不发事件（原版没有受击项）。`projectile` 为弹丸的结局：跳弹或移除；导弹与其他原因为 null。`shieldWasEmpty` 是原版受击项 +0x0C（受击前护盾 ≤ 0，选择音效槽 3 或 4） |
| `object-destroyed` | 每个对象从存活到被毁只发一次（被毁标志门禁），在 `hit` 之后。`eventClass` 是原版对象事件的类别：攻击者种类为 1 时为 0，否则为 1。`outcome`：停放对象为 `removed`，玩家为 `delayed`，其他为 `explodes`。AI 范围伤害的自爆（`0x6313c`）不置被毁标志，不发此事件 |
| `explosion-started` | 爆炸在请求处理中激活时发出：通常在创建后的下一 tick；在对象更新中创建的（AI 路径）在创建的同一 tick（X9、CR-08）。它是表现层选择 EXPL 并只选一次的依据（CR-11）。位置是激活时、尚未移动的位置，等于构造位置 |
| `missile-ended` | 导弹的到期请求被处理时发出：起爆在爆炸构造与范围伤害之前，熄火在进入待移除时。供 P3-12 的导弹相机（原版 `0x3119c` 只服务玩家的导弹） |
| `fragment-expired` | 碎片的到期请求被处理时发出（X7）。被击落的碎片为 `explodes` |
| `source-released` | 第 0 部件碎片的交接请求被处理时发出。`removed: false` 只出现于玩家：原版不移除玩家对象，只投递隐藏项（高概率，交 P3-12） |
| `energy-depleted` | 能量更新进入耗尽分支且 `depleted` 锁存为 false 时发出并置锁存；之后以能量 > 0 结束的更新清除锁存。原版每次耗尽更新都重复施加锁定与钳 0（D14），事件只在转换时 |
| `energy-allocation-changed`、`left-page-changed` | 紧随被接受的命令的结果发出，对应原版消息 0x100000 的音效 10485 |

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

- **对象集合（`0x2ede0`）：** P3-07 的规则不读（C4），维持 P3-06 修订的说明。

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
- **未定的原版常量：** 无制导导弹的引信检查间隔取决于线性地址 0x2C 处的 f32（冲突 29，未确认）。实现与测试按该值的两种结果（减半或不减半）参数化；生产取值在原版运行时读数确认后定，确认前相应验收不通过，不择一写死。

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
| `0x3c208` | 伤害入口：护盾结算后，攻击者种类 ≠ 0 时；`0x2a5fc` 结算后船体 ≥ 0 时 | P3-10（含其抽取） |
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
