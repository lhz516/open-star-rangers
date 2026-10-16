---
id: B-011
type: behavior
status: draft
phase: P3
updated: 2026-10-16
related: [U-001, U-009, U-021, U-022, B-004, B-006, B-008, B-009, B-010]
---

# B-011 AI 与僚机：运行时测量

## 敌机、基地、僚机与停放 AI 的时间链、编队与单次转移（R-11、R-12）

- **状态**：
  - **证据等级：** AI 与僚机的规则已确认（代码与数据，P3-08/01–07）；10 的预实验观察已确认（运行时），只适用于所测配置；2026-10-15 的重新规划把其中的 w-01、w2-01、e-04、b-09 按资格复用为正式样本（spec 的[正式采样计划](../../plan/p3/08/spec.md#正式采样计划交-26)）。正式运行（P3-08/26 的 e-02、wii-01 与 wii2-01）之后，P3-08/27 按 D-02 判定了原版一侧与新版对照，见[测量结果](#测量结果)。
  - **测量方案与判据已在采集前写定（P3-08/11，2026-10-15）。** 本页的[测量方法](#测量方法)是方案；判据是 P3-08 spec 的 [D-02 连续行为判据](../../plan/p3/08/spec.md#d-02-连续行为判据)，本页只写它在原版一侧的读法。正式采集由 P3-08/26 进行，新版的对照结论由 P3-08/27 记录在[测量结果](#测量结果)。
  - 规则的代码事实见 [ai](../formats/ai.md) 与 executable 的 AI、僚机、命令、停放与 Xpon 各节（下文以 A、WA、WB、D、X 的编号指代），此处不重复。
- **适用范围**：新战役第一关 group 0 / slot 1（SCEN 3019），原始战役难度 19（难度组 0），僚机选择值 0（无僚机）与 1（名单项 0；2026-10-15 起不再运行其他名单项），基准 `fixed 40000` cycles，基准过场设置。结论不外推到其他任务、难度、僚机配置或 cycles。
- **原版描述**：敌机按导入的程序与脚本选择目标、追击、开火与规避；基地的自动挂点获取射程内的目标并成段连发；僚机在玩家后方编队飞行，按距离调整速度，玩家减速时靠近并停住，遇敌时交战，收到通讯菜单的命令后执行并回复；按 `b` 投下的应答器先翻滚、约两秒后停住并原地自转。本页规定在原版运行中测量这些规则的时间链、编队几何与单次转移的方法（[P3-08 spec](../../plan/p3/08/spec.md#对照方法与判据) 的 R-11、R-12）。

### 原版版本与配置

- **基准版本：** [manifest](../manifest.md) 版本 `manifest-b9bfecb3bf772fbf`，EXE SHA-256 `c1e0f4565988b6773ba1515e0b4f59f92ee22c118aea678d21817000cf924ffa`。基准配置文件的哈希、实际 cycles 与改动的行由每次运行报告的 `environment.emulator` 记录，由 27 汇总在[测量结果](#测量结果)。
- **模拟器：** DOSBox-X（[基准环境](../../guides/baseline-environment.md)），在私有副本中运行。配方不声明 `emulator`，私有配置保留基准的 `fixed 40000`（10 的运行中私有配置与基准只差 `captures` 与 C 盘挂载）。另测其他 cycles 时只经配方的 `emulator.cycles`，分别报告，不混合样本。
- **游戏设置：** 配方在私有副本的 `SRANGER.CFG` 中预设 `STARTUP_PRACTICE=FALSE` 与 `CURR_LEVEL=100 19`，与 [B-006](./B-006-simulation-timing.md#场景与输入)、[B-009](./B-009-combat-rules.md#原版版本与配置)、[B-010](./B-010-map-warp.md#原版版本与配置) 相同；过场与摇杆行保持基准值，报告的 `gameConfig` 记录实际取值。
- **任务与配置身份：** 每个读字段的暂停点检查战役标志、任务序号 0、难度 19、救援计数、作弊总开关 0 与僚机选择值（同 P3-08/10），飞行中另查主流程状态 3。僚机名单项与内置记录在安装时读取并核对。

### 测量方法

方案在采集前写定（P3-08/11，2026-10-15）：即本页与 spec 的 [D-02 连续行为判据](../../plan/p3/08/spec.md#d-02-连续行为判据)。配方、操作者脚本与分析脚本由 P3-08/26 写在被忽略的 `local/research/p3-08/runtime/`。其中的 `plan.md` 在第一次正式运行之前写定，只能细化本页：暂停点的指令地址、读数字段的完整列表与刺激时刻。它不改变观测量、样本与判据；需要改变时，先回到 P3-08/11 的关卡，且只能在看到新版结果之前。2026-10-15 的重新规划（spec 的[审批](../../plan/p3/08/spec.md#审批)）经此途径修订了运行与覆盖，`plan.md` 在 W-ii 之前随之修订。

#### 场景与输入

- **操作者：** agent 独自运行（[agent 独自运行](../../guides/runtime-measurement.md#agent-独自运行)）。全部游戏输入都是配方声明、由工具写入并逐条记录的[模拟器内输入](../../guides/runtime-measurement.md#模拟器内输入)：按键在键盘轮询写入 BIOS 键盘缓冲（页面上 Enter、Esc、`d`；飞行中 Ctrl+Enter、速度预设、油门归零、`t`、`a`、`c`、`f`、`y`、数字键、`x`、`b`）；开炮用 P3-07/41 已核实的 Alt 标志；地图点击用地图鼠标状态设备。按运行时才知道的启动布局选择的输入用[条件刺激](../../guides/runtime-measurement.md#条件刺激)。没有宿主层输入，也不用 Computer Use。
- **进入路线**（同 P3-08/10）：标题页 Enter、战役选项页 Enter、简报页 Esc（保留僚机选择值 1）；无僚机的路线在简报的页面 0xF 上经三次 Enter 与 `d` 把选择值改为 0，每次 Enter 之后先停在读键成功点、再停在回调调用点，`d` 之后等待足够的轮次（10 的 e-04）。2026-10-15 起不再运行名单项 1、3、4，不需要它们的选择路线。过场完整播放。
- **正式样本集**（2026-10-15 重新规划；运行、复用的资格、每次运行预期计入的类别、重做与预算以 spec 的[正式采样计划](../../plan/p3/08/spec.md#正式采样计划交-26)为准；新的原版运行只有 W-ii 一次，W-i、W-iii、第二次 E 与两次 B 不再运行）：

  | 运行 | 选择 | 主要刺激与段 |
  |---|---|---|
  | W-ii（26，新） | 名单项 0（选择值 1，内置记录 5；类 (ii)） | 一次运行组合原先两次的刺激。速度辅助关闭；满速段（≥ 120 带与追击）；降速预设后的匀速段，以停止条件持续到 d < 32 的连续 ≥ 10 次更新或至多 200 次更新（时间允许时再加一个不同速度预设的匀速段）；油门归零后 ≥ 40 次更新（≥ 20 次双方静止）；编队段每次更新读齐 Φ_F 所需的字段；`t` 后码 7、3、2、4、1（锁定序列、攻击航线与导弹发射尝试）；自动交战比较；近距与友伤规避；友伤累计；`b` 与 Xpon；最后码 6、5 |
  | e-02（26） | 无僚机（选择值 0，10 的 e-04 路线） | 安装时读每个 AI 对象选中的记录（含停放对象与 300 秒增援）；两架活动 0x80 敌机的解释器调用与状态切换的抽取；交战份额；敌机射击、按下与松开；规避入口；停放步与对象集合 |
  | w-01、w2-01、e-04、b-09（10，复用） | 见 [10 的完成证据](../../plan/p3/08/subtasks/10-original-pilot-runs.md#完成证据) | 不再运行；按 10 的配方与暂停点已记录的字段计入（b-09 为启动布局 C（2026-10-16 更正），基地在开火点等待第一发后读处理调用与每一发） |

- **预实验留下的项的路线：**

  | 项 | 26 的路线 | 依据 |
  |---|---|---|
  | 僚机导弹发射 | W-ii 中码 1 指定在射程内的目标，延长攻击窗口直到就绪且平稳时的通道 1 按下；在发射点与弹药数核对；锁定字节在发射时读取。只尝试这一次，未取得时为 spec 已知限制第 1 项 | WA6、WA7、[WA9](../formats/executable.md#wa9-repair-docking-missiles--confirmed-code)、A13；w-01 已到等级 4 且就绪，但窗口内未发射 |
  | 状态 4 | 玩家命中目标敌机（攻击者规则），在攻击者窗口内读解释器调用；e-02 与复用的 e-04 中出现时计入，不再为它追加运行，没有合格样本时按 spec 的“取不到时的处理” | ai §11.3 规则 4；需所用 DFPG 的状态 4 条件成立 |
  | 状态 6 | 只有记录 2（DFPG 6013）的敌机在状态 3/4/5 中目标不变且停滞时出现；DFPG 6031 的状态 6 按规则 10 改为 3，不可作为当前状态。e-02 未抽到记录 2，不再追加 E 运行：spec 已知限制第 3 项 | ai §11.3 规则 7、10 与组 0 列表计数 |
  | 规避 | 近距（飞近敌机与僚机，使接近记录生效）；友伤规避（僚机受玩家命中后的窗口内）；攻击航线尾部的近距规避 | A7、A15、WA3 第 5、7 步 |
  | 码 2、4、5、6 | W-ii 中码 2、4 在码 1 之前（需要玩家目标）；码 6 先在无目的地时取回退回复，再以地图点击（沿用 10 的 b-09 路线的条件刺激）设定 Warp 目的地后发一次；码 5、6 放在运行末尾（可能触发离场）。未取得的码为 spec 已知限制第 8 项 | WB3 |
  | 友伤累计 | W-ii 中选中僚机为目标后以 Alt 开炮，读命中前后的 acc 与 wend；超过阈值（需一个窗口内多次命中）后的愤怒与阻塞命令在可达时，未取得时为 spec 已知限制第 2 项 | WB6、WA5 |
  | Xpon 与 `b` | W-ii 中 `b` 一次，读创建、首次回调与稳定；僚机停放投放在可达时 | X3、X4、D4 |

- **刺激的时机：** 编队窗口的刺激在僚机行为为编队、玩家状态 7 时施加；匀速段的速度预设之后不再有转向输入，等到玩家的速度达到指令速度再开始计窗口。命令按上表的次序发出。
- **独立性：** 启动状态与刺激时机都相同的两次运行逐值相同（P3-07/09），所以正式样本集中同一类的运行须在其中一项上不同才算独立重复（W-ii 的刺激时机与 10 的 w-01、w2-01 不同）：启动状态由工具在首个飞行轮询记录，刺激时机以帧或暂停的计数错开。
- **禁止：** 配方以外的任何输入；连续比较窗口内不出现游戏暂停、地图、Warp、被毁、救援或停靠（命令链窗口允许通讯菜单打开）。

#### 观测量与暂停点

字段的含义与位置见 ai 与 executable 的相应各节；单位为原版的存储类型（时钟单位 u = 1/64 秒，f32 按位读取）。

- **时钟**（每个暂停都读）：帧样本 `0x186414`、帧计数 `0x186418`、步长 `0x186420`（[时基](../formats/executable.md#simulation-time-base-p3-0106)）。
- **RNG：** 单次转移的入口与出口读生成器状态 `0x1789e4`，两状态之间的步数即抽取次数（[AI 路径的数值与抽取](../formats/executable.md#numbers-and-draws-on-the-ai-paths-p3-08-q-12)）。
- **控制器：** 期限 C+0xF0、周期 C+0xF4、记录指针、按住期限 C+0x12C+4k、锁定 +0x118/+0x11C/+0x128、就绪 C+0x13C、重定目标计时 C+0x144、C+0x154；解释器执行状态的状态、期限、条目与项、等待/保持；僚机私有块（行为字节 b、B+4、B+8、B+0x0C、B+0x10）；基地每个挂点的时间戳、等级、连发计数、目标与保持，以及开火处的武器冷却与连发数（后两项 b-09 未读，2026-10-15 起 B 不再运行，不再取得，见 spec 已知限制第 7 项）。
- **编队（K-07）：** 每次僚机更新读僚机与玩家的移动块全部字段（位置、三行、速度、指令速度、角速率与启用标志、控制块）、转向块 S 与处理器出口（或同帧请求处理）的投递值；这是 P3-06 R-04c 注入所需的全部前态。10 只读了位置、两行与速度，26 补齐。
- **暂停：** “逐更新”在绑定控制器的每次处理调用命中；“逐帧”在每帧命中，只用于 L3 链节、松开帧与编队链接的帧数；“稀疏”只用于进入场景与等待。计划量按逐更新暂停的密度给出。

| 类别 | 暂停（10 已核实操作数完整） | 读数 |
|---|---|---|
| 僚机调度 | 僚机处理入口 `0x610c8`（EAX 为模式，EDX 为控制器） | 时钟；控制器与私有块；对象字段；编队所需的移动块 |
| 敌机调度与状态机 | 解释器入口 `0x64cb8`（EAX 为模式，EDX 为控制器） | 时钟；状态、执行状态的条目与项、等待/保持、按下值与期限、目标、距离、视锥位 |
| 停放步 | 停放步调用 `0x5dcfb`（ESI 为控制器） | 时钟；期限与种类 |
| 自动交战 | 比较点 `0x61cf9`（EDX 半径、ECX 截断距离、[ESP+0xC] 候选） | 操作数与比较结果 |
| 命令 | 存储 `0x21353`（EAX 僚机对象、EBX 码、EDX 句柄）；活动消费 `0x614f2`（EDI 码、ECX 控制器）；回复 `0x38d54`（EDX 回复行） | 时钟；码；消费前后的私有块与效果字段；回复行 |
| 列表炮 | 射击 `0x2e6b6`（EAX 射手，EBP 挂点状态，EDX+0x14 冷却） | 时钟；旧时间戳、等级、冷却 |
| 基地 | 处理入口 `0x62c10`（EDX 控制器）；自动开火 `0x2db8b`（EDX 射手、EBX 挂点状态） | 时钟；周期、掩码、四个挂点的全部字段；每一发 |

  **26 首次使用的位置**（地址由 26 以只读 Ghidra 确定）：`0x5dcd4` 中通道 0 到期松开的分支；导弹发射点 `0x2e8bd`；锁定转换点 `0x5e0f4`/`0x5e109`/`0x5e123`；`0x2dad0` 中写挂点时间戳的尝试点（掷骰之后）；各处理器的出口（RNG 与投递值）；规避 `0x5d374` 入口；状态机切换（`0x64d58` 写 I+0 处）；停放命令消费 `0x61f20`；友伤 `0x38f20`；`b` 的构造 `0x38780` 与 Xpon 回调 `0x3897c` 的翻滚与稳定分支；离场 `0x5e6cc`；离开指令 `0x5e710`；交战份额 `0x632a4`。每个位置在第一次使用它的运行中核实操作数完整（寄存器与记录的操作数一致、必需字段合格），结论写入 26 的完成证据，之后其样本才计入；所有备选位置都取不到完整操作数的项没有合格样本，不降级，按 spec 的“取不到时的处理”逐项决定。2026-10-15 起 B 不再运行：`0x2dad0` 的尝试点与基地开火处的冷却、连发数读数不再取得（spec 已知限制第 7 项）。

#### 参考钟与时间隔离

- **只用游戏时钟：** 判据只用样本、步长与游戏写入的时间字段，不用真实秒。调试器停住时，游戏计数与模拟器时间都不前进（[B-006](./B-006-simulation-timing.md#观测量)）；10 中停止处的模拟器时间与样本之比为 15.62–15.68 毫秒/单位，只用于诊断。
- **暂停的影响：** 暂停拉长被停的帧，改变步长序列（[计时](../../guides/runtime-measurement.md#计时游戏时钟与参考钟)）；判据只用每个链接记录的步长或一段的帧数与单位数，不使用步长分布、速率或单位时间内的调用次数（10 未能估计暂停效应）。
- **隔离：** 连续比较窗口两端读主流程状态 3、玩家状态 7、视角模式与 Warp 标志，窗口内有游戏暂停、地图、Warp、被毁、救援或停靠的作废；命令链窗口允许通讯菜单打开，两端核对菜单状态。
- **锚：** 以事件为锚（安装、按下、装填、存储、状态进入、`b` 的创建、进入编队窗口的第一次更新），不按任务原点或绝对样本（原版的原点含标题、简报、过场与构建用时）。读取绝对样本的两条规则（基地挂点保持值、织动的 t）按 spec 的已批准差异 1、2 处理。

#### 比较链的读法

spec 的判据要求窗口的 S、每个链接的步长与每次调用都取自同一次运行的记录：

- **L1 帧截止：** A 为写下期限的那次调用的样本，C = 写下的期限 − A；δ = (s − A) − P₂，P₂ 按比较的严格性取 2⌊C/2⌋ + 2 或 2⌈C/2⌉，须为偶数且 0 ≤ δ ≤ st − 2（st 为生效帧读到的步长）。
- **L2 调用截止：** 由记录的调用链逐次判定：事件须落在第一个满足比较的处理调用上；窗口内绑定控制器在该位置的每次命中都须被读到（跳过命中为 0，帧计数连续），否则窗口作废。
- **L3 帧链节：** δ = Σ(stⱼ − 2)，用逐帧暂停读到的各帧步长；缺一帧的链节作废。
- **L4 随机截止：** 以写下的期限读出抽取 r，C = D′ − A 按 L1 计算；r 的支持集在单次转移层核对。
- **抽取次数：** 入口与出口的生成器状态之间按已确认的线性同余递推求步数。
- **编队链接：** 以更新 k 的读数注入独立求值器 Φ_F，更新 k 投递的值须与读到的投递值相同；更新 k 到 k + 1 的帧数 F 与单位数 U 取自帧计数与样本之差，按 P3-06 R-04c 的步长预算判定僚机与玩家；F × 3 < U/2 的链接无效。
- **S 中的随机结果：** 程序选择、状态列表、解析值、计时器、油门噪声、停放的 rand % 64 与 Xpon 翻滚的抽取结果都取自本次运行的读数，不要求与新版相同。

#### 覆盖与样本

- 正式样本集（2026-10-15 重新规划）以 spec 的[正式采样计划](../../plan/p3/08/spec.md#正式采样计划交-26)为准：26 的 e-02 与一次 W-ii，加上按资格复用的 10 的 w-01、w2-01、e-04、b-09，不再为补足数量追加运行。spec 的[采样覆盖下限](../../plan/p3/08/spec.md#对照方法与判据)与 [D-02](../../plan/p3/08/spec.md#d-02-连续行为判据) 逐类表的最少样本、计划量与区分情形是正式样本集的目标；有合格样本的类别照常判定，不足的数量与未出现的区分情形按 spec 的[运行时覆盖的已知限制](../../plan/p3/08/spec.md#运行时覆盖的已知限制)逐项列出。计划量只是方案的计划，不是统计置信度。
- **僚机类：** 只有类 (ii) 有原版运行（10 的 w-01、w2-01 与 26 的 W-ii）；类 (i)、(iii) 不再运行，是 spec 已知限制第 5 项；未运行的组合按 spec 的“僚机行为类与覆盖”覆盖。读齐 Φ_F 字段的编队窗口只来自 W-ii，类 (ii) 编队的独立重复是已知限制第 9 项。
- **独立重复：** 需要两个以上窗口的类别，窗口至少来自两次在启动状态或输入时机上不同的合格运行；同一运行内的多个窗口用于覆盖，不算独立重复。

#### 误差来源

| 来源 | 预实验的观测（P3-08/10） | 判据中的处理 |
|---|---|---|
| 时间分辨率 | 样本每次加偶数；步长为 0、2、4…18 | 相对时刻都是偶数，精确比较 |
| 截止超出量 | 轻场景 δ ∈ {0, 2}，δ = 2 只在步长 4 的帧；交战中 δ 达 4–12 | L1 的 0 ≤ δ ≤ st − 2，按每个链接的步长 |
| 嵌套滞后 | 锁定、状态与命令都在处理调用上判定 | L2 两边都不归一化，落在第一个满足比较的调用上 |
| 帧链节 | 安装与按下后的帧数随步长变化 | L3 用逐帧读到的步长合成 |
| 输入取样 | 键盘轮询相隔至少 18 u；命令在第三个按键的轮询帧存储 | 以存储为锚；取样节奏归 P3-05 的 R-23 与 P3-10 的菜单判据 |
| 暂停 | 逐更新、逐帧与稀疏暂停分布在不同场景，效应未能估计 | 只用每个链接记录的步长，不做分布统计 |
| 运行间离散 | 两种启动状态给出不同过程；超出 2 以上的链接 12/130 与 11/130 | 独立性规则；每个窗口按自己的 S 判定 |
| 随机数 | 原版的规则抽取与表现抽取共用一个生成器 | 抽取结果作为 S 代入；分布按支持集核对；次数由生成器状态求出 |
| 场景负荷 | 空场景基地 δ 全为 0；基地附近交战帧步长 14–18 | 区分情形须在相应场景中取得 |
| 浮点与超越函数 | f32 写回；转向角的 FPATAN、织动与解析的 FCOS | spec 单次转移层：只含正确舍入运算的路径逐位，超越函数后的第一个写回至多 1 ulp；边界样本单列 |
| 运动的步长划分 | 编队链接跨不同帧数 | P3-06 R-04c 的步长预算，同一公式与参数 |
| 时钟原点 | 任务开始时的样本远大于挂点保持值上限 | 只比较以事件为锚的量；保持值与织动相位按已批准差异 1、2 |
| cycles | 步长随 cycles 与场景负荷变化 | 判据与 cycles 无关；结论只适用于 fixed 40000（U-021） |

#### 判据

判据以 spec 的 [D-02 连续行为判据](../../plan/p3/08/spec.md#d-02-连续行为判据)为准，本页不另立。要点：

- 新版的值等于按已确认规则在 2 单位步长下合成的值，原版的值等于同一规则按原版记录的步长合成的值，两者都精确成立，没有残余容差；分支由规则从原始输入推出，不取自被测运行。
- 编队以独立的规则模型核对两边：新版整窗逐位，原版逐链接注入并满足 P3-06 R-04c 的步长预算；跨版本只直接比较距离带的切换与静止后的保持。
- 已批准的差异（基地保持值、织动相位、Xpon 首次回调的表现依赖、离场的表现 tick）按 spec 单列，不判为不一致。
- 窗口按事先写定的规则机械选取，并列出每个排除的原因；每类须出现区分情形；边界样本不计入。
- 只有全部样本都满足才判为“一致”；任一样本不满足即为“不一致”，不放宽判据，也不为求通过而重做。
- **判据批准：** 2026-10-15，由 agent 依用户 2026-10-15 的常设授权批准（用户原话：“approve D-01 and continue working. i authorize you to make decision to approve future decisions.”），记录在 [P3-08 spec 的审批](../../plan/p3/08/spec.md#审批)。批准早于正式采样，也早于任何新版的连续行为结果。

#### 有效运行与重做规则

- 工具报告 `complete`：必需样本全部合格，身份检查通过，原文件保护与进程回收通过。模式为测量，cycles 为 40000，配方指纹与 26 的本地方案相同，没有 `skip` 应答。复用的 10 的运行按 10 的完成证据所记的合格条件（配方指纹、工具源码、证据范围 `local/research/p3-08/pilot/runs`）核对，只按其记录的字段计入。
- 证据范围限于 `local/research/p3-08/runtime/runs`（`--evidence`），因为其他会话同时写 `local/research/`。基准会话锁被占用时只等待重试，从不绕过；与 P3-09、P3-10 等共用基准环境时按协调者的轮换与间隔。
- 失败、取消（含启动布局守卫）或无效的运行保留目录，在[测量结果](#测量结果)中列为“排除”并写明原因，下一次运行用下一个编号（26 的 e-01 已取消，排除）。W-ii 至多重做一次，只限偶发失败（崩溃、守卫取消）；`complete` 而某项刺激未取得结果不重做，也不为其他运行补跑。不合并不同运行的样本；一个运行只按自己的窗口计数。
- 正式样本集中仍取不到的项：属于 spec [已知限制](../../plan/p3/08/spec.md#运行时覆盖的已知限制)第 1–10 项的按该清单记录；其余记为未完成并写明尝试与恢复条件，按 spec 的“取不到时的处理”逐项决定，不自动改为静态验收。

#### 预实验

P3-08/10 的 `complete` 运行（w-01、w2-01、e-04、b-06、b-08、b-09）与只读侦察用于误差预算与方案，没有计算或查看新版的任何连续行为输出。原方案不把它们计入正式样本；2026-10-15 的重新规划把 w-01、w2-01、e-04、b-09 按资格复用为正式样本（只按其记录的字段判定），b-06、b-08 与只读侦察仍不计入。统计量见 [10 的完成证据](../../plan/p3/08/subtasks/10-original-pilot-runs.md#完成证据)。本方案沿用的结论：

- 全部输入都可由配方取得，包括无僚机的页面 0xF 路线与按启动布局选择的基地路线；
- 玩家满速时编队不可观测，正式采样须控制玩家速度并包含静止段；
- 调度的超出量由步长决定，交战场景中才出现大的超出量；
- 10 的断点表中的位置操作数完整，其余位置在 26 首次使用时核实。

### 测量结果

**已确认（运行时，P3-08/10 与 P3-08/26 的正式样本集，P3-08/27 判定，2026-10-16）**，只适用于基准 `fixed 40000` cycles 与上文的任务、设置和进入路线（U-021）。判据为 spec 的 [D-02](../../plan/p3/08/spec.md#d-02-连续行为判据)（2026-10-15 批准，早于正式采样与任何新版对照结果）；本节写原版一侧（Q原 = Φ(S原, δ原)）与新版对照的结论。配方、读数、分析与对照脚本在被忽略的 `local/research/p3-08/`（`runtime/`、`pilot/`、`comparison/`）；本节只写计数、单位、判定与身份，不写读数原值。

#### 运行与资格

共同配置：模式 `measure`，cycles 40000（每次运行报告的 `environment.emulator`），基准 `manifest-b9bfecb3bf772fbf`，EXE `c1e0f456…`，`STARTUP_PRACTICE=FALSE`、`CURR_LEVEL=100 19`（SCEN 3019，任务序号 0，难度 19）。全部输入为配方刺激。

| 运行 | 来源 | 配方（指纹前缀） | 报告 | 计入（资格） |
|---|---|---|---|---|
| e-02 | 26 | `p3-08-formal-e`（`2ca8473d`） | `failed`（模拟器在停放步链 ep-22 处退出） | 已完整走完的窗口：K-02 的选择与开局安装、对象集合、敌机主窗口 e-1–e-280。停放步链不计入；300 秒增援未到达 |
| wii-01 | 26 | `p3-08-formal-wii`（`b719cccd`） | `cancelled`（配方缺陷，见 26） | S1、S2、S3、码 7/3/2/4/1/6、攻击窗口；`b` 之后未走 |
| wii2-01 | 26 | `p3-08-formal-wii2`（`acb4d44f`） | `failed`（`samples-unqualified`） | 全部窗口，排除僚机离场后 60 个 `pointer-null` 的必需样本 |
| w-01、w2-01、e-04、b-09 | 10（复用） | `df94a954`、`6da95d92`、`599736d8`、`4a7be4eb` | `complete` | 按 10 的完成证据核对配方与工具指纹（工具 `6297f0bb…`；b-09 为 `d9c4ae25…`），只按其记录的字段判定；b-09 为启动布局 C |

- **排除的运行：** e-01（26，操作者中止，重新规划之前）；10 的 b-06、b-08 与只读侦察（spec 不计入）。
- **独立性：** 启动状态（首个飞行轮询的读数）e-02 与 e-04 不同；wii-01、wii2-01、w-01、w2-01 两两不同（w-01 与 b-09 相同，但两者属于不同类别）。
- **读数规则（对照脚本，失败即排除）：** 窗口是覆盖该位置与绑定控制器的连续暂停（`until` 探测与条件不接纳的暂停使窗口断开；同一调用紧随入口的出口暂停不断开，因为入口与其出口之间不可能有该控制器的另一次入口命中）。L1 以截止形式判定（严格 s − st ≤ D < s，非严格 s − st < D ≤ s），等价于 0 ≤ δ ≤ st − 2；L2 在调用链上判定“事件当且仅当第一个满足比较的调用”；L3 用 Δ样本 − 2Δ帧。
- **窗口两端的游戏状态：** 每个读数暂停都读主流程状态（全部为 3）与救援计数（身份核对，不变）。玩家状态 7、视角模式与 Warp 标志在这七次运行中都没有逐暂停读取；本页按间接依据认定窗口内没有被禁止的状态：配方中没有暂停键、Warp 请求与基地操作，地图只在 wii2-01 的 poll-m1 与 poll-m2 之间打开（那里的轮询暂停使窗口断开），救援计数不变说明玩家未被毁。协调者 2026-10-16 依用户授权接受这一间接证据（spec [审批](../../plan/p3/08/spec.md#审批)的第二批决定）。

#### 原版一侧与新版对照

原版一侧：下列各类的每个合格样本都满足 D-02 的第 2 式，没有发现与 `docs/original/` 已确认规则不符之处。新版一侧（第 1 式，不做归一化）：候选为 P3-08 的集成 Core，提交 `b8f35072`、`src` 树 `aab6ee47`（工作区干净），真实导入内容（manifest `sha256:648bc29a…`、source `sha256:67391efb…`，转换器 `graphics-5.logic-4.audio-2.models-4`），正式录制会话的 `World.step`（2 单位/tick），只经正常 `TickInput` 驱动：无僚机场景 3 个种子（各 12,000 tick）、名单项 0 场景 3 个种子（各 8,400 tick，满速、速度预设、油门归零、`t`、码 7、3、2、4、1、6、`b`、7、5），另有基地交战 4 个种子（各 36,000 tick）与编队场景 8 个种子（满速、预设 5、油门归零）。新版的处理器调用、安装与规避调用由一个只记录调用、不改变行为的源码加载钩子逐 tick 记下；每个 tick 都核对“调用 ⇔ 到期（严格）⇔ 写下期限”，写下的期限须属于规则的某个分支。每个原版类别（处理器 × 常数来源 × 分支）都有配对的新版链接；新版的全部链接与事件都满足第 1 式。对照脚本的变异自检（期限晚写、漏一次调用、晚一次调用消费、Xpon 晚一 tick 稳定）都被检出。

| 类别 | 原版合格样本（第 2 式） | 区分情形 | 新版（第 1 式） | 结论 |
|---|---|---|---|---|
| K-01 解释器（0x80，`0x5e4d0` 改写后的周期，全周期） | 193 个链接（e-02 59、e-04 134；每种两架，各自连续链至多 67） | δ ≥ 2 的链接 18，其后的调用也被读到 | 1,723 个，另 0x100 的 510 个、安装链接（记录周期，`0x5e4d0` 改写之前）14 个 | 一致 |
| K-01 僚机（记录 5 的周期） | 全周期 576、规避半周期 3（w-01、w2-01、wii-01、wii2-01） | δ ≥ 2 的链接 60 | 全周期 2,591、半周期 19 | 一致 |
| K-01 基地（b-09） | 30 个链接（全部 δ ≥ 2，29 个其后的调用也被读到） | 交战场景中出现 | 2,976 个 | 一致 |
| K-01 停放步（L4） | 12 个链接（e-04，8 个控制器，每个 1–2 个链接），r 均在支持集内 | δ ≥ 2 的链接 2 | 10,939 个 | 一致（数量不足，已知限制第 10 项） |
| K-02 实例化 → 安装（L3，n = 1） | 14 次安装（0x80 6、0x100 4、基地 4；停放与活动），选择的抽取次数 50/50 符合 | 14 个 L3 都有 st ≠ 2 的帧 | 105 次 | 一致 |
| K-03 射击间隔（L1 非严格，冷却） | 敌机 34（e-02），僚机 74（wii-01） | 间隔 δ ≥ 2 之后又射击：36 | 敌机 707（0x80 703、0x100 4）、僚机 241 | 间隔一致；按下 → 第一次尝试与窗口内的射击数为已知限制第 16 项 |
| K-03 松开（L1 严格，按住期限） | 敌机 1、僚机 3 | 松开帧 st ≥ 4：4 | 74 | 一致（敌机窗口数不足，第 10 项） |
| K-04 AI 锁定（L2） | 283 次锁定检查（w-01 中 1 个链接因两次调用之间的通道 1 尝试是否发射不可观测而排除），完整的 0 → 2 → 3 → 4 序列 5 个（w-01 2、wii-01 3，两次独立运行）；阶段常数在各运行中唯一，与新版相同 | 等级转换所依附的处理链接 δ ≥ 2：4 | 2,610 次 | 一致 |
| K-04 发射 | 1 次（wii-01）：按下之后的下一帧发射，发射时的锁定字节为 4 | — | 锁定字节 4 的 2 次与之配对；另 4 次锁定字节为 0，只在新版出现（编队中对玩家锁定到等级 4、就绪，自动交战或命令换目标时 `0x5c584` 清零等级而就绪仍在，攻击的第一次调用即按下通道 1，A13 的边缘路径；原版 wii-01 在同样的转换处 w-289 的出口读到通道 1 已按下，发射本身不在覆盖的位置） | 一致（已知限制第 1 项“已取得”）；发射的就绪、弹药与“恰一次尝试”为第 16 项 |
| K-05 基地挂点：装填与连发 | 8 个完整窗口（4 个挂点）、64 个链接；装填 11 次的连发数都等于静态值；读到的 440 个保持值都已到期（已批准差异 1 的前提成立） | δ ≥ 2 的尝试 57 | 186 个窗口、1,488 个链接；装填的 L2 判定 0 个不符 | 一致。操作数（冷却、连发数）取自静态数据，不是运行时读数（已知限制第 7 项的条件 1–3 均满足） |
| K-06 等待/保持恢复与重定目标计时（L2） | 等待 105（e-02、e-04），重定目标 57（e-02） | 计时转换所在的解释器链接 δ ≥ 2：2 | 2,728（另 6 个在同一调用中执行了规则 1 的规避，按调用记录排除） | 一致（状态的进入数与状态 4、6 见已知限制） |
| K-07 编队与跟随（类 (ii)，Φ_F） | wii-01：匀速窗口 1（wf0–w-231，72 次更新、71 个链接）、双方静止窗口 1（w-245–w-287，22 次更新、21 个链接），其间的减速过渡 7 个链接逐链接核对；每次更新的投递值（目标点、距离、局部向量、控制块 12 个字、视锥位、速度与转向）由读到的操作数重算逐位相等（没有 1 ulp 与边界样本），抽取次数相符；全部链接僚机与玩家都满足 R-04c 的步长预算（E_fit 至多为界的 0.098） | 含步长大于 2 的帧的链接 33 | 26 个窗口（满速 8、预设 5 匀速 9、静止 9），1,401 次更新与 Φ_F 逐位相等 | 一致；距离带 120 → 32 在越过阈值后的第一次更新改变，两边精确 |
| K-08 B+0x10、B+0x0C 的检查（L2） | B+0x10 24、B+0x0C 3（四次僚机运行）；另 1 次到期未写由攻击航线先返回解释 | 定时检查所在链接 δ ≥ 2：1 | 137 | 一致（自动交战比较只有 1 次，第 10 项） |
| K-09 命令存储 → 消费（L2）与回复线号 | 12 次（码 1–7 各 ≥ 1，活动路径；w-01、wii-01、wii2-01），都在存储帧之后僚机的第一次到期调用中消费，回复在同一调用 | 消费所在链接 δ ≥ 2：未出现（第 10 项） | 24 次，经 P3-10 的真实菜单命令 | 一致 |
| K-10 Xpon 与 `b` | wii2-01：创建 → 首次回调（翻滚）为下一帧，该帧步长 4；稳定在 F₀ + 0x80 之后的第一个状态 7 回调 | 首次回调帧 st ≠ 2 | 3 次 | 一致；F₀ 取自首次回调所在帧的暂停（块本身没有读到），F₀ 的写入为第 16 项；已批准差异 3（保持）未在原版样本中出现 |

- **K-07 的条件与说明：**
  - 26 的完成证据记为“双方静止窗口未取得”；按 Φ_F 的资格机械判定，w-245–w-287 是合格的静止窗口（停止分支自 w-243 起，每次更新恰一次抽取）。
  - 机型的加减速常数（+0xBC、+0xC0）与标志（+0xC4、+0xC8）没有运行时读数，取自不经导入转换器的 CRAFT.NOB（CINF 4037）独立读取，与读到的转向率、最高速度及导入内容一致（协调者 2026-10-16 按第 7 项的条件接受）；不依赖它们的链接单独也全部满足预算。停止分支的“目标速度”按玩家移动块的速度读，与全部 99 次判定一致。
  - **静止窗口：** 按 spec 2026-10-16 改写的跨版本比较判定（停止分支之后的每次更新两边各自满足 Φ_F），两边都成立。改写的原因：原措辞“相对位置保持不变（两边精确）”与规则矛盾——名单项 0 的油门噪声（A6）使停止分支的指令速度为一个小的正值（由该名单项的油门噪声参数决定），僚机缓慢移动；两边的这一移动都与 Φ_F 逐位（新版）或在预算内（原版）一致。玩家位置与僚机姿态两边都保持不变。
  - 发现：`0x5cd1c` 的视锥位只在分数分支中检验（executable A1、A4 已更正）；按原措辞，新版的 7 个窗口会不符，按代码规则两边都成立。
- **单次转移层（已核对的部分）：** 选择的抽取次数（0x80、0x100 各 1，基地 2，种类 0x4000 与玩家 0）全部符合 [ai §1](../formats/ai.md#1-loading-the-id-chain-and-the-group-0-closure-confirmed)；锁定、等待、计时、装填与命令的分支由读到的操作数推出并与读到的结果相同；回复线号与 [WB3](../formats/executable.md#wb3-active-consumer-0x614a8--confirmed-code) 一致；编队窗口的投递值与抽取次数见 K-07 一行；基地装填与保持值见 K-05 一行。
- **单次转移层（未逐次核对，已知限制第 16 项）：** 交战份额的分支（e-02 的 3 次，[A9](../formats/executable.md#a9-engagement-share-0x632a4c-difficulty-path-5--confirmed-code)）、对象集合的重建（3 个连续 tick）、规避入口的投递值、攻击航线的分离点与油门、Xpon 翻滚与稳定的投递值及 F₀ 的写入、K-02 选中的记录与抽取值、K-03 的按下 → 第一次尝试与窗口内的射击数、K-04 发射时的就绪、弹药与恰一次尝试、K-09 回复的抽取次数，以及解释器更新、僚机攻击窗口与停放步的逐次抽取次数，只计了数，没有以读到的操作数逐次重算（读数中没有同一调用入口与出口的生成器状态，或缺少所需操作数）。
- **已批准差异：** 差异 1（基地保持值恒已到期）的前提在 b-09 的全部读数上成立；差异 2（织动相位）没有比较相位（编队窗口内没有攻击航线）；差异 3（Xpon 首次回调走“保持”）未出现；差异 4 属表现层，不在本节。

#### 运行时覆盖的已知限制

spec [运行时覆盖的已知限制](../../plan/p3/08/spec.md#运行时覆盖的已知限制)第 1–16 项逐项（目标 / 实得；规则由所列代码事实核对、由所列 Node 独立期望测试覆盖；这些项不是“一致”“不适用”或“已运行对照”）：

| # | 项 | 目标 / 实得 | 代码证据 | Node 独立期望（文件：测试） |
|---|---|---|---|---|
| 1 | 僚机导弹发射与锁定字节 | ≥ 1 / 1，**已取得**（K-04 发射一行） | WA6、WA7、WA9、A13 | `src/core/rules/ai-firing.test.ts`：“steps 0 → 2 → 3 → 4 every 0x40 units …”“fires the pressed channels in order 0, 1, 2; channel 1 once …”；`src/core/systems/ai.test.ts`：“launches a guided missile at its target with lock byte 4 once the AI lock it turned on reaches level 4 (WA9, revision ⑦)” |
| 2 | 愤怒（b = 5）与因此阻塞的命令 | 可达时 1 / 0（wii2-01 中没有命中僚机） | WB6、WA5、WB3 | `src/core/rules/ai-wingman.test.ts`：“turns angry above the threshold and stays angry after the accumulator falls (sticky b 5)”；`src/core/rules/ai-commands.test.ts`：“keeps a blocked command: without a player, or above the friendly-fire threshold, with no reply and no fact”；`src/core/systems/ai-commands.test.ts`：“keeps a command while real player hits hold the accumulator above +0x28, …” |
| 3 | 状态 6 与选中记录 2 的敌机 | 状态 6 ≥ 1 / 0；e-02 的 6 架 0x80 都未选记录 2 | ai §10.1 的原像计数、§11.3 规则 7、10 | `src/core/rules/ai-interpreter.test.ts`：“rule 7: a stalled state 3 with the same target goes to state 6, …”“rule 10: an empty list of state 1, 2 or 6 goes to state 3; …”；`src/core/rules/ai-selection.test.ts`：“starts at rand mod count and takes the first full match in the order s … count − 1, 0 … s − 1”（合成表的原像计数） |
| 4 | 0x100 敌机的 K-01、交战与射击 | ≥ 40 / 0（e-02 中停放） | A12、ai §10.1、`0x5e4d0` | `src/core/rules/ai-selection.test.ts`：“is due only when the sample is strictly past the deadline”“selects through the load transforms: a stored kind mask 0 matches the kinds 0x80, 0x100 and 0x200”；`src/core/rules/ai-interpreter.test.ts`：“applies 0x5e4d0: …”；`src/core/systems/ai.test.ts`：“runs the interpreter in the AI step only when due, the period after each run” |
| 5 | 僚机类 (i)、(iii) | 各一次运行 / 0 | WA10、ai §10.1；未运行组合由 spec“僚机行为类与覆盖”的 (a)–(c) 覆盖 | `src/core/rules/ai-wingman.test.ts`：“element $element, period $period: fractions, noise, cadence and the lead constant”（七种参数元组）；`src/core/world/rule-data.test.ts`：“creates a world with each of the five roster entries and without a wingman, …”；选择抽取同第 3 项；P3-08/25 的真实内容运行（AC-12，非 Node 测试） |
| 6 | 基地布局 A；K-05 的第二次独立运行 | 两次运行、两种布局 / b-09 一次（布局 C） | A14、W9 | `src/core/rules/ai-firing.test.ts`：“installs: automatic mounts on, fractions 1, yaw set to 1.0, the kind mask, a draw per idle mount, then the update body”；`src/core/rules/firing.test.ts`：“acquires a resolving target in the arc: the aim, then the burst”；`src/core/systems/ai.test.ts`：“fires the loaded bursts through the stages from the AI step after the install, …” |
| 7 | 基地冷却（+0x14）与连发数（+0x2C）的运行时读数；等级 1 掷骰失败的尝试 | 读数 / 0（b-09 未读；条件 1–3 满足，K-05 窗口以静态值判定）；掷骰失败 / 0（等级 1 未出现） | A14、W9（含 P3-08/27 的写入者核对）、craft §3.8 | `src/core/rules/firing.test.ts`：“skips a mount with no burst, destroyed or cooling (equality fires), and every other mount”“needs no charge even for the player, and consumes a round on a failed damage draw” |
| 8 | K-09 未取得：码 6 有目的地的分支；停放路径的命令消费 | 各 1 / 0（wii2-01 的布局点击未选中；停放消费者被调用 3 次但无待消费命令）；码 1–7 的活动路径都已取得 | WB3、WB4、WB5 | `src/core/rules/ai-commands.test.ts`：“code 6 goes to the player's destination (b 4), reply 0x12; without one it falls back, reply 0x15”“code 6 with a player and a destination: mode 2, no target, the destination as the goal, reply 0x12; otherwise 0x15”“codes 3 and 4 alike take the player in mode 2, reply 0xE; …”；`src/core/systems/ai-commands.test.ts`：“code 6 with a destination outside the active area departs by Warp; the parked wingman then consumes with WB4” |
| 9 | K-07 类 (ii) 的独立重复与未出现的工作条件 | 匀速与静止窗口各 ≥ 2（两次独立运行）/ 各 1（同一次运行）；< 16 带与按距离进入的停止分支两边都未出现 | WA4、WA6、A3–A5、R-04c | `src/core/rules/ai-wingman.test.ts`：“holds the formation by the distance to the formation point: 16, 32 and 120, strictly, and stops next to a slow player”；`src/core/rules/ai-piloting.test.ts`：“matches with the generalised 0x21adc: …” |
| 10 | 数量与区分情形 | 停放步 K-01：同一控制器 ≥ 14 / 至多 2；敌机松开窗口每个按下位置 ≥ 3 / 1；僚机按下位置 0x80 的完整窗口 ≥ 3 / 未取得；状态 5 的进入 ≥ 3 / 1；自动交战比较 ≥ 3 / 1；交战份额 ≥ 5 / 3；K-09 消费链接 δ ≥ 2 未出现 | 各类在逐类表中的规则出处 | 各实现子任务的测试（上列与 15–22 的测试文件） |
| 11 | 解释器状态 4 的进入 | ≥ 3 / 0 | ai §11.3 规则 4、8、9 | `src/core/rules/ai-interpreter.test.ts`：“rule 4: a recent attacker of the other side is engaged and takes state 4 with its deadline (3 without a state-4 list)”“rules 8 and 9: state 4 holds while the sample is before its deadline with the same target, and ends past it” |
| 12 | 友伤累计 | ≥ 1 / 0 | WB6、P3-02 CR-27 | `src/core/systems/comm-reactions.test.ts`：“adds the player's raw damage to the friendly-fire total, restarting the window once its end has passed, without a message or a draw”；`src/core/rules/comm-reactions.test.ts`：“restarts the window at 0 once the sample is past its end, then adds the raw damage as i32” |
| 13 | K-02 的 300 秒增援与停放/恢复后的重装 | 各 ≥ 1 / 0 | ai §1 的选择、安装与重装 | `src/core/systems/spawn.test.ts`：“instantiates rows 1–7 at tick 1 and group 2 at the first tick past 19,200 units, …”；`src/core/systems/ai.test.ts`：“removes without a draw and installs again with its draws after parking and resuming, never reselecting”“never reselects: over parking, resuming and removal every object keeps the record instantiation selected” |
| 14 | 离开指令 `0x5e710` | ≥ 1 / 0 | executable D6 | `src/core/rules/ai-parked.test.ts`：“from $position.x, $position.y: mode 4, no AI target, the goal 1000 beyond the edge, then 0x5e6cc” |
| 15 | 规避的其余入口 | 每个可达入口 ≥ 1 / 规则 1 的入口 1 次（e-02）、僚机规避半周期 3 个链接 | executable A7、A15、WA3 第 5、7 步、WA7 尾部；操作码 108、109 不在切片可执行的操作码中（[ai §10.2](../formats/ai.md#102-dfpgs-scripts-and-keyword-tables)），记“不适用” | `src/core/rules/ai-interpreter.test.ts`：“rule 1: a close proximity record ahead makes the evasion and skips everything else”；`src/core/rules/ai-wingman.test.ts`：“evades a near proximity record ahead (only its radius against AICO +0x20) for half the period”“turns away from its recent friendly victim (AICO +0x24, strict), …”；`src/core/rules/ai-attack-pass.test.ts`：“evades a close proximity ahead (both radii against AICO +0x34) instead of steering, still due again after the period”；`src/core/rules/ai-piloting.test.ts`：“posts the break turn and then full throttle with S's throttle noise, …” |
| 16 | 27 未作运行时判定的子项（2026-10-16 决定）：K-03 按下 → 第一次尝试与窗口内的射击数；K-04 发射的就绪、弹药与恰一次尝试；K-10 的 F₀ 写入；单次转移层的交战份额分支、对象集合重建、规避/攻击航线/Xpon 的投递值、K-02 选中的记录与值、K-09 回复与 Xpon 的抽取、解释器/僚机攻击/停放步的逐次抽取次数 | 正式样本集的读数不含这些操作数或窗口条件 | ai §1、§11、§12；executable A7–A14、WA2–WA9、WB3–WB5、D1–D4、X2–X4 | `src/core/rules/ai-firing.test.ts`：“presses with deadline 0 for hold 0, clock + 0x7D00 for a negative hold, clock + hold otherwise”“fires the pressed channels in order 0, 1, 2; channel 1 once, clearing the missile-ready flag”；`src/core/rules/firing.test.ts`：“fires at equality of the cooldown and refuses one unit before it”“takes a round, restarts the cooldown and posts the lock level and the target it read; the cooldown passes at equality”；`src/core/systems/xpon.test.ts`：“tumbles at its first callback: row 3, then row 1, at 0.8 to 1 of the craft rates (two draws)”“settles at the first state-7 callback strictly past F₀ + 0x80, without a draw”；`src/core/rules/ai-targeting.test.ts`：“targets a recent attacker of the other side first, within C+0x148 strictly”“draws once when c ≤ T2 SAR 1, going while rand % 96 is below +0xE4”；`src/core/systems/object-sets.test.ts`：“rebuilds every tick in flight, where nothing is revealed: new craft join and removed ones leave”；`src/core/rules/ai-piloting.test.ts`：“posts the break turn and then full throttle with S's throttle noise, …”；`src/core/rules/ai-attack-pass.test.ts`：“breaks off past the deadline: an offset in world axes beside the target, one draw, throttle 0, phase 2”“weaves row 1 in phase 1 after a recent hit: …”；`src/core/rules/ai-selection.test.ts`：“starts at rand mod count and takes the first full match in the order s … count − 1, 0 … s − 1”；`src/core/systems/ai-commands.test.ts`：“replies through queueLine just before each fact: …”“a parked step replies before its drop, search and final draw: …”；`src/core/rules/ai-interpreter.test.ts`：“rule 2 then 13: a new target picks state 3, 2 or 1 by the distance, and the state's list with one draw, also for one script”；`src/core/rules/ai-wingman.test.ts`：“draws the throttle noise of an element that has it in the same call's posts”；`src/core/systems/ai.test.ts`：“steps only when due, in the object update; its draws precede every parked-update draw, …” |

- **不可达（“不适用”，代码证据）：** 操作码 108、109 与 1102 的路径（不在切片可执行的脚本中，ai §10.2）；敌机的通道 1 与通道 2（A12 的切片数据：敌机只有列表 0，没有射手有列表 2）；停放的离开指令请求 Warp（D6：`0x2fef8` 对停放对象总是失败）；DFPG 6031 的状态 6（规则 10 改为 3）与 6025 的状态 4、5。
- **跨任务的联合项：** 菜单 → 命令 → 回复的联合链在新版一侧经 P3-10 的真实菜单命令取得（K-09 的 24 次），原版一侧码 1–7 的活动路径都已取得；地图一侧（P3-09）的码 6 有目的地分支与停放僚机的揭示没有原版样本，属第 8 项与第 10 项，由所列 Node 测试与 P3-09/P3-08 的联合测试覆盖。
- **U-021：** 以上“一致”只适用于 fixed 40000；冻结值不同时须在冻结配置下重新满足各类的最少样本、独立性与区分情形。

### 验收容差

判据见上文[判据](#判据)（D-02，采集前批准）。全部时间类没有残余容差：L1/L4 的 δ 为偶数且 0 ≤ δ ≤ st − 2（st 为该链接生效帧的步长），L2 事件落在第一个满足比较的调用上，L3 的 δ = Σ(stⱼ − 2)；新版一侧的每个链接恰为 P₂、每个 L2 事件恰在新版自己的第一个满足比较的调用上。编队类按 Φ_F：新版整窗逐位（超越函数之后的第一个写回至多 1 个 f32 ulp，本次没有出现），原版逐链接注入、投递值逐位（同一 ulp 规则）、运动满足 P3-06 R-04c 的 E_fit ≤ min(E_cap(F, U), 0.25 × U/2 + 2)（κ = 1.25），F × 3 < U/2 的链接无效。

### 实现说明与证据

- 代码分析证据：ai 与 executable 的 P3-08 各节（选择与安装、解释器、驾驶、目标与开火、僚机、命令、停放、Xpon 与数值）。
- 与其他行为的关联：运动规则与步长预算见 [B-008](./B-008-flight-motion.md) 与 P3-06 R-04c；开火与弹丸见 [B-009](./B-009-combat-rules.md)；通讯菜单与回复见 [B-004](./B-004-base-communications.md)；地图与 Warp 见 [B-010](./B-010-map-warp.md)。
- 未解决问题：U-021（cycles 未冻结）；U-009（f32 写回的舍入）。
