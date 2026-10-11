---
type: plan
status: active
phase: P3
task: "07"
subtask: "28"
updated: 2026-10-10
---

# 28 — 文档与交接

**契约来源：** [spec](../spec.md) 的 S-12、AC-17；[与其他任务的接口](../spec.md#与其他任务的接口)；P3-02 spec 的 [P3-07 的契约修订](../../02/spec.md#p3-07-的契约修订d-01d-03)，尤其是 [CR-09](../../02/spec.md#cr-09-与-p3-06-的接口d-03)、[CR-11](../../02/spec.md#cr-11-表现层的归属与已批准的差异d-01)、[CR-13](../../02/spec.md#cr-13-其他任务在-p3-07-规则中的调用点d-03-之外的接口)、[CR-14](../../02/spec.md#cr-14-容量快照与版本d-01)。
**依赖：** 24, 33。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **Core 模块说明（[core.md](../../../../engineering/modules/core.md)）：** 记录以下内容：
  - 新 API：`createWorld`、录制入口与 `ReplayContent` 的六项顶层规则输入（与 P3-06 的 `craftInfo` 并列，含 34 的 `aiPrograms`）、静态规则数据中的 `homingPrograms`，以及 setupHash 的覆盖字段；
  - 阶段责任、玩家更新中的接入点与直接创建的例外（CR-07、CR-08）；
  - 实体的战斗状态、移动块的新变体、表现选择器、领域事件、`flight.combat` 与原因码的对应关系；
  - 上限及其依据（CR-14）；
  - CR-11 的已批准差异、高概率结论的标注，以及研究与实现中已得出的已知差异；25 与 27 的结论由 [36](./36-comparison-differences-docs.md) 补入。
- **交接：** 在 core.md 的交接节分别写明给以下任务的内容（CR-09、CR-11、CR-13）：
  - P3-04：规则输入的传入与碰撞可视化；
  - P3-05：开火采样、`u` 的键位，以及非飞行上下文中的开火屏蔽（CR-11 的差异 8）；
  - P3-06：`MovementBlock` 联合与 `linear`、`spinning` 的分派；P3-07 调用的模式 0 构造（按油门）、`0x21fd8`、`0x21d88` 与 `0x30e0c`；玩家更新中的两处接入点；`ai.objectTarget` 的收窄与运行时种类的缺省；`speedLimitStatus` 为 `'live'`；
  - P3-08：AI 的开火入口（CR-05）、共享转向模块 `steering.ts` 的扩展、`ai.objectTarget`、`proximity`、`lastVictim`、`lastAttacker`，以及 AI 范围伤害 `0x6313c` 调用的爆炸构造与 `0x2a5fc`；
  - P3-09：Warp 能量与 `inWarp`；Warp 开始时的目标清除；左页面 2–6；Warp 出口的最近对象搜索看不到表现层效果的差异（CR-11 的差异 1）；
  - P3-10：修理与补给的资源读写与挂点函数；`0x3c208`、`0x3c0f4` 的调用点；进入基地视角时的目标清除；左页面 2–6；
  - P3-11：CR-13 的调用点（`0x6977c`、`0x32d74`、`0x32dec`、`0x33464`、`0x32e14(1)`、`0x339cc`，以及救援 `0x67b98` 复用的 `0x2d400` 与 `0x3060c`）；进入被毁视角时的目标清除；击杀、射击统计与重伤记录的读取；
  - P3-12：会话级表现选择者（EXIC 子集与每个爆炸在 `explosion-started` 上的单次选择）、额外爆炸、判别值 1、2 碎片、闪光、受击闪烁（`hitShimmerStart`）、导弹相机（`missile-ended`），以及 R-10 中归表现层部分的原版对照（B 文档中的观察）；
  - P3-13：雷达的屏幕投影与噪点、左右显示屏与 HUD 的读数、`target-cleared` 的提示；
  - P3-14：从 P3-12 的同一选择取爆炸音效；`weapon-selected`、`shot-fired`、`hit`（`shieldWasEmpty`）、`energy-allocation-changed`、`left-page-changed` 的音效。
  同时替换 P3-02 写给 P3-07 的交接内容。
- **工程文档：**
  - [source-structure.md](../../../../engineering/source-structure.md) 列出新模块；
  - [content.md](../../../../engineering/modules/content.md) 记录 Core 消费的规则输入读取器；
  - [engineering README](../../../../engineering/README.md) 只在约定变化时修改。
- 所改文档的 `updated:` 与链接正确。

## 不包含

- 25 与 27 的核对结论（36）。
- 原版事实（`docs/original/`，已由 01 至 07、26 与 30 写入）。
- `docs/STATUS.md`、阶段索引与 goal（协调者维护）。
- 修改其他任务的 spec 或 goal。

## 关键文件与契约

- 现有：[core.md](../../../../engineering/modules/core.md)、[source-structure.md](../../../../engineering/source-structure.md)、[content.md](../../../../engineering/modules/content.md)、[engineering README](../../../../engineering/README.md)。
- 11 至 24 与 30 至 35 的完成证据。

## 写入范围

- `docs/engineering/modules/core.md`：API、阶段、状态、事件、`flight.combat`、上限、差异与交接。
- `docs/engineering/source-structure.md`：新模块。
- `docs/engineering/modules/content.md`：Core 消费的规则输入。
- `docs/engineering/README.md`：仅在约定变化时修改。

## 验收标准

- [x] AC-17：Core 模块说明记录新的 API、阶段责任、实体战斗状态、事件、`flight.combat`、原因码的对应关系、上限依据与已知差异（含 CR-11 的已批准差异；25、27 的结论归 36）。
- [x] AC-17：向 P3-04、P3-05、P3-06、P3-08、P3-09、P3-10、P3-11、P3-12、P3-13、P3-14 的交接分别写明，覆盖 CR-11 与 CR-13 的分工与调用点。
- [x] AC-17：工程文档同步，`updated:` 与链接正确；`pnpm check` 通过。

## 验证方法

- 文档审阅，对照 P3-02 的 CR-01 至 CR-14 与实际代码；链接与元数据检查；`pnpm check`。

## 完成证据

- **基线：** 认领提交 `383cbc2`（22、24、33、34、35 已集成；25、26、27、36 未完成）。依用户的预先授权，执行中的问题都按推荐方案自行决定，记录如下。
- **改动（只在写入范围内）：**
  - [core.md](../../../../engineering/modules/core.md)：
    - API：入口表加 `CONTENT_INPUT_FIELDS` 与 `instantiableModelIds`；世界创建写明十二个输入字段、读取规则数据输入与 `buildRuleData` 的位置、setupHash 的 `{ setup, craftInfo, ruleData }`；新增“规则数据输入与静态规则数据”一节（六项输入与 Core 读取的部分、生产 ID、`RULE_DATA_LIMITS`、CR-01 检查 1–6 与集合完整、`WorldRuleData` 与 `homingPrograms`、setupHash 的覆盖表）。录制与 `ReplayContent` 的字段随之更新。
    - 状态：`WorldState.ruleData`；实体表新的故障点位；`MovementBlock` 的三个变体与不变式；`ai.objectTarget` 的收窄与 `runtimeKindDefaults`；新增“战斗状态”条（`EntityCombat` 五个变体、`combatTypeOf`、表现选择器、运行时种类的 P3-06 字段）；生命周期的写入者；玩家状态的 CR-04 字段与目标的写入者。
    - 阶段：流水线表第 4、7、8、9、10、11、12、13、18 行；`ruleStage`；P3-07 的请求、`requestsPerTick`、`defer`/`release`、`findLastPending`；命令经 `judgeCommand` 的分派；CR-08 的直接创建；实例化扩展点的 CR-07 次序与抽取次序。P3-06 的“飞行控制、运动与停放”中只改被 P3-07 弄旧的句子：玩家更新的两处接入点（35 的协调者笔记）、命令交给 `judge`、16 的逐条读回折算、移动阶段的 `linear`/`spinning` 分派与弹体记录（22 的笔记）、停放交战的接入（35 的笔记）。
    - 新增“战斗规则（P3-07）”一节：玩家更新中的接入点与请求次序（CR-07、14 的定稿）、命令与原因码的对应表（含 `next`=`r` 更近、`previous`=`y` 更远，P3-07 spec 的“目标与传感”要求写入本文件）、参照目标、目标与雷达、发射与弹丸、导弹、伤害与子系统、被毁/爆炸/碎片、碰撞、能量与驾驶舱显示、停放交战、CR-13 调用点的位置。“原版规则辅助”加入 P3-07 的 20 个规则模块；`initialMaximumSpeed` 注明已无生产调用者（12 的交接）。
    - 读模型：`flight` 两组都就绪；`speedLimitStatus` 为 `'live'`；`flight.combat` 的 `CombatPlayer` 各项与故障点位（23）；`FlightResourceName`、`WeaponRecordReference` 不再是 `never`；Render State 的 `clock`、`hitShimmerStart`、`explosionStart` 与表现选择器。
    - 快照与 replay：快照格式版本与 `RULES_VERSION` 为 3；快照覆盖战斗状态；比较器的 `TickOrder` 改为 P3-07 的阶段、导弹命中在其起爆之后与每 tick 一次的被毁检查（24 的笔记）。
    - 上限：`eventsPerTick` 32,768 与 `requestsPerTick` 16,384 的依据（CR-14 的规模与算式）、录制可用事件 491,520、快照约 10.5 MiB、`combat-chains.test.ts` 的上限回归。
    - 扩展规则：命令的落点改为 `judgeCommand`；新运行时种类的落点；`steer` 已是浮点操纵请求；CR-13 调用点的规则。
    - 已知差异：P3-07 的 R-06 至 R-10 待 27、25 与 36；输入一条的地图门禁；P3-06 项目规则中“指令速度读者”的复核结果；“分阶段接入”按现状重写；新增 CR-11 的十条已批准差异、P3-07 的项目规则（负计时值在创建时拒绝、运行中越界为故障、列表中的自动炮与列表 1 的炮、同 tick 档位键与油门、参照目标、发射者失效、`0x27edc(0)`）、P3-07 的步长差异与 P3-07 依据的高概率结论；随机数、未实现分支与数值三条更新。25 与 27 的结论未写，归 36。
    - 交接：导语加入 P3-07；P3-03 一条写明 P3-07 已接入的数据与 `WeaponRecordReference` 的定义；给 P3-04、P3-05、P3-06、P3-08、P3-09、P3-10、P3-11、P3-12、P3-13、P3-14 各加“来自 P3-07”的条目（P3-12、P3-13 在同一任务条下分为两个条目），覆盖工作范围列出的每一项；P3-02 写给 P3-07 的条目改为“P3-07（已交付）”的摘要；Q-11 的数值交接更新；P3-04 的 P3-06 条目中关于战斗组与 `'initial-only'` 的过时句子改为指向 P3-07 的条目。
    - 针对性检查：P3-07 的规则、系统、接线、连锁与 replay 测试与新的测试支持。
  - [source-structure.md](../../../../engineering/source-structure.md)：目录树加入 P3-07 的 34 个生产文件（以脚本核对目录树与 `src/` 的非测试文件完全一致）；模块说明表与 Core 内部目录表的 `world/`、`systems/`、`rules/`、`projections/` 行。
  - [content.md](../../../../engineering/modules/content.md)：新增“Core 消费的规则输入”一节（七项规则输入的 Asset、调用者的解码、Core 的读取器或字段校验、错误、上限来源、setupHash 写出器与内容类型的耦合）；爆炸表一条的“选择规则归 P3-07”改为 CR-11 的表现层归属。
  - [engineering README](../../../../engineering/README.md) 不改：P3-07 没有改变工程约定（会话 `start` 的规格已由 33 更新）。
- **核对方式：** 每条陈述对照实际代码（`src/core/**`、`src/app/resources/mission-input.ts`）与 CR-01 至 CR-14，并读了 11–24、30–35 的完成证据与 goal 执行记录；协调者转来的交接笔记（35、22、24、11/33/34、14 与 P3-06 的接口事实）都已处理。
- **自行决定的事项（推荐方案）：**
  - `next`/`previous` 与 `r`/`y` 的对应按 T2/T3 与代码写入命令表（P3-07 spec 要求写入本文件）。
  - 左显示屏页 2–6 的交接按 D15 拆分：页 2–5 交 P3-10（通讯菜单与来电消息），页 6 交 P3-09（Warp）；两者都写明以 `commandIndex: null` 发出 `left-page-changed` 与视角切换置 `statusDisplay.redraw`。
  - 碰撞可视化（AC-17 给 P3-04 的一项）：Core 的静态规则数据不进快照、没有生产读取入口，写为 P3-04 可用同一内容与 `load-transforms.ts` 的纯函数独立计算，或按扩展规则提出只读入口；不在本项新增 API。
  - P3-14 一条另加 `target-changed`（T1 的消息 2 表现项，高概率为音效），工作范围未列但 CR-06 已写明其对应关系。
  - P3-12、P3-13 沿用 core.md 既有的合并任务条，分为“给 P3-12”“给 P3-13”两个条目，满足“分别写明”。
- **检查：**
  - `pnpm check` 通过（264 个测试文件、7,878 项测试，ESLint、类型检查与生产构建成功；构建的大块警告为既有）。
  - 相对链接与锚点：`node local/research/p3-02/pipeline/check-links.ts docs/engineering/modules/core.md docs/engineering/source-structure.md docs/engineering/modules/content.md docs/plan/p3/07/subtasks/28-docs-handoff.md`，0 处失败。
  - 目录树：脚本比较 source-structure.md 的目录树与 `src/` 下的生产文件（不含测试与测试支持），两侧完全一致。
  - `git diff --check` 通过；三份工程文档与本文件的 `updated:` 为 2026-10-10。
- **rubber-duck：** 对照 CR-01 至 CR-14 与代码审阅整个改动，无阻断问题；四项非阻断全部采纳：(1) 被毁时的次序改为“被毁标志 → `object-destroyed` → 击杀计数”（damage.ts 的 `destroy`）；(2) 目标候选不看被毁标志，但被毁的机体随即离开候选状态，只是已选中的目标在移除前仍可解析；(3) `flight.combat.radar.status` 把子系统 12 的值 3 归一为 0；(4) source-structure 的 `rules/` 行加入“战斗状态”为可修改的显式参数。
- **交给协调者（写入范围外，未改）：**
  - [app.md](../../../../engineering/modules/app.md) 的 Runtime 规格一条列出的规则数据输入少了 34 的 `aiPrograms`（运行时由 `CONTENT_INPUT_FIELDS` 自动包含，只是文字过时）。
  - [键位表](../../../../original/input/key-map.md#目标模式代码确认)仍把 `u` 写为高概率，executable 的 T3 已有原生比较的确认，可由协调者或 P3-05 对齐。
  - 13 提议写入 T6 的“子系统 12 的值 3 按 0 构建”若尚未写入 executable.md，仍待协调者处理（core.md 已按代码描述）。
- **给 36、29：** 36 在 core.md“已知差异”一节开头的 P3-07 句子与新增的 P3-07 条目之后补入 25、27 的结论与新差异；若 27 判定某条差异为不一致，需同步“项目规则（P3-07）”或“P3-07 的步长”。29 的最终对齐可直接复用本项的链接与目录树核对脚本。STATUS 与 tasks.md 不受影响。
