---
type: plan
status: accepted
phase: P3
task: "06"
updated: 2026-10-10
related: [ADR-0004, ADR-0006, ADR-0015, ADR-0017, B-006, B-007, U-001, U-008, U-009, U-011, U-021]
---

# P3-06：飞行运动与速度控制 — Goal

## 目标与来源

实现用户于 2026-10-09 批准的 [spec](./spec.md) 中的 S-01 至 S-10 与 AC-01 至 AC-12：

- 原版研究 M-01 至 M-10，事实写入 `docs/original/`；
- [执行检查点](./spec.md#执行检查点) A、B、C：研究完成后以 spec 修订定稿状态形状与共享契约、数值判据与缺省项，按用户的预先授权直接定稿并记录；
- Core 中的世界创建机型输入、实体飞行状态与起飞初态、运动阶段与积分、操纵与速度命令、匹配速度与速度辅助、活动区域与停放、运动 projection、快照与 replay；
- 本地真实内容核对、原版正式采集与 R-04、R-05 的对照判定；
- Core 文档与对下游任务的交接。

本文件不重新定义行为契约。目标选择、能量、AI、地图与 Warp、浏览器输入与画面不在本 goal 中实现。

## 代码现状与前提

- **已有代码（本 goal 扩展）：**
  - 世界创建 [create-world.ts](../../../../src/core/world/create-world.ts) 的 `CreateWorldInput` 只有三份逻辑 Asset、`identity` 与 `run`；[setup-hash.ts](../../../../src/core/world/setup-hash.ts) 只覆盖 `MissionSetup`；[replay.ts](../../../../src/core/replay/replay.ts) 的 `ReplayContent` 是 `CreateWorldInput` 去掉 `run`。调用者目前只有 Core 自己的测试与 test-support（[create-world.test-support.ts](../../../../src/core/world/create-world.test-support.ts)、[world.test-support.ts](../../../../src/core/world/world.test-support.ts)、[replay.test-support.ts](../../../../src/core/replay/replay.test-support.ts)），`src/app/`、`tools/` 尚未调用。
  - [pipeline.ts](../../../../src/core/systems/pipeline.ts)：`movement`、`parked-update`、`area-check` 三个阶段的 `run` 为 null；`judgeCommands` 对每个命令发 `rejected`/`not-implemented`；`leave` 切换停放但不涉及目标。
  - [spawn.ts](../../../../src/core/systems/spawn.ts)：实例化写入位置、姿态（玩家为单位矩阵）与活动；`startsActive` 只在实例化时判定；初始化扩展点尚无飞行字段。
  - [entity-table.ts](../../../../src/core/world/entity-table.ts) 的 `Entity`/`EntityInit` 没有速度、移动块或计时字段；[player-state.ts](../../../../src/core/world/player-state.ts) 的 `PlayerState` 没有控制状态或目标引用。
  - [domain-events.ts](../../../../src/core/contracts/domain-events.ts) 只有 `command-result` 与 `object-instantiated`，原因码只有 `not-implemented`；[compare.ts](../../../../src/core/replay/compare.ts) 按事件联合逐字段校验。
  - [projection.ts](../../../../src/core/projections/projection.ts) 的 `flight` 为 `NotImplementedPartition | FlightReady`，尚未拆分。
  - [snapshot.ts](../../../../src/core/replay/snapshot.ts) 的写入器映射类型要求每个状态字段恰好写一次；`GAME_SNAPSHOT_VERSION` 与 [rules-version.ts](../../../../src/core/replay/rules-version.ts) 的 `RULES_VERSION` 都是 1。
  - [limits.ts](../../../../src/core/contracts/limits.ts) 的 `CORE_LIMITS`；[float32.ts](../../../../src/core/rules/float32.ts) 的就近 f32 写回。
  - 机型数据：[craft-info.ts](../../../../src/content/rule-data/craft-info.ts) 的 `readCraftInfo`/`CraftInfo`，合成数据 [rule-data.test-support.ts](../../../../src/content/rule-data/rule-data.test-support.ts) 的 `syntheticCraftInfo`/`syntheticRuleDataAsset`；[rule-data-payload.ts](../../../../src/content/rule-data/rule-data-payload.ts) 的 `decodeRuleDataPayload`。
  - 测量工具 [tools/baseline/](../../../../tools/baseline/)；真实内容核对的先例为 [P3-02/09](../02/subtasks/09-real-content-check.md)。
- **计划新增：** `src/core/rules/` 与 `src/core/systems/` 下的飞行状态、运动、操纵、区域模块及相邻测试（文件名见各子任务，可在实现时调整，职责不变）；`docs/original/behavior/B-008-flight-motion.md`；被忽略的 `local/research/p3-06/<主题>/`。
- **跨任务前提：**
  - P3-02、P3-03 已完成（各自 goal 全部 completed），正式 Core 与 `data/craft-info` 可用。
  - **P3-07（18 的前提）：** AC-11 要求带目标选择与实时能量/子系统状态的集成对照（动态最高速度、匹配目标）。18 开始时若 P3-07 尚未交付这些规则，18 记为 blocked，恢复条件为 P3-07 交付并合入。其余子任务不依赖 P3-07。
  - **P3-08：** 若检查点 A 确认起飞目标初值或停放更新依赖 P3-08 的规则，A 必须在修订中解决任务边界（P3-08 依赖本任务，不能互相等待）；不在本 goal 中实现 AI。
  - **P3-04：** 尚未接入正式 Core。09 执行时若已接入，09 同时更新其调用者，并按 [browser-testing](../../../../.agents/skills/browser-testing/SKILL.md) 运行既有合成会话回归。
- **环境（起草时核对）：**
  - 本 worktree 没有 `node_modules`：执行前运行 `pnpm install --frozen-lockfile`。
  - `local` 已链接到主仓库的 `local/`（git 忽略）。Ghidra 项目 `local/ghidra/srangers`：一律 `-noanalysis -readOnly`，在 `local/research/p3-06/<主题>/` 中使用私有只读副本，不 `-overwrite`。
  - DOSBox-X 基准环境：同一时间只有一个会话操作（工具在 `local/research/` 上加锁）。
- **原版证据：** 01–05 由 agent 用只读 Ghidra 与本地数据取得，结论先写入被忽略的 findings 以便并行，再由 21 统一写入 `docs/original/`；16 用本地导入的真实内容；07 与 17 需要在所选任务中飞行的原版运行。本机 Computer Use 无法向 DOSBox-X 送达按键（[运行时测量指南](../../../guides/runtime-measurement.md#角色单一会话与本机限制)），因此 07、17 标为需用户：用户只做键盘操作，agent 负责方案、配方、运行、读数、判定与记录；执行时若该限制已解除，协调者改为自动（2026-10-10 起已改为自动，见执行记录中的 22）。达不到 spec 门槛的研究项按 spec 阻塞，不按猜测实现。

## 验收覆盖

| Spec 范围项/验收项 | 实现子任务 | 验证子任务及方法 |
| --- | --- | --- |
| S-01 | 01、02、03、04、05、21、23；07、17（运行部分） | 01–05：M-01 至 M-10 的结论（local findings）；21：写入 `docs/original/` 与 U 项；17：舍入方向的运行结论；20：门槛与 U 项核对 |
| S-02 | 09、24 | 09：craft-info 输入、拒绝与 setupHash 的 Node 测试；16：真实内容创建 |
| S-03 | 11 | 11：movement 阶段与积分各分支的独立期望测试 |
| S-04 | 12 | 12：逐 tick 轴、中立输入、地图门禁与映射的 Node 测试 |
| S-05 | 10、12、13 | 10：最高速度与初始移动块测试；12：速度命令测试；13：匹配与辅助的条件矩阵 |
| S-06 | 14 | 14：活动区域、停放、离开世界与世界边界测试 |
| S-07 | 10 | 10：合成起飞初态测试；16：真实内容核对；18：R-05a |
| S-08 | 09、10、15、24 | 09：契约类型、事件、版本；10：实体与玩家状态的快照；15：运动 projection 与 replay |
| S-09 | 22、07、08、17、18 | 22：模拟器内输入能力与烟测；07：B-008 方案与预实验；08：检查点 B；17：正式采集；18：R-04、R-05 判定 |
| S-10 | 06、19 | 06：P3-02 与 P3-01 的修订及批准；19：Core 模块说明与源码结构指南；20：链接与元数据 |
| AC-01 | 09、24 | 09：创建、拒绝、setupHash 与 replay 拒绝的 Node 测试 |
| AC-02 | 11 | 11：阶段筛选、模式、公式、步长 0/2/4/6 与故障锁存测试 |
| AC-03 | 12 | 12：轴消费、非零→零、地图中非零、退出后中立输入、扰动抽取测试 |
| AC-04 | 10、12、13 | 10：最高速度各分支与初速；12：四种速度操作与数字 1–9、同 tick 多命令、各原因码；13：`match-target`、`toggle-auto-match` 与确认键别名的结果 |
| AC-05 | 13 | 13：初值、目标各状态、距离与计时边界、事件次序 |
| AC-06 | 10、14 | 10：停放时刻与 Warp 计时的保存与抽取；14：区域边界、停放切换、退场事件、放置序号 |
| AC-07 | 10、11、16 | 10：实例化与首次活动的合成初态；11：首次运动后的初态；16：本地真实内容核对 |
| AC-08 | 09、10、15、24 | 09：分区类型、事件校验、版本；10：快照覆盖新状态；15：projection 就绪、JSON 往返 replay、预算 |
| AC-09 | 01、02、03、04、05、21、23、06 | 01–05：研究门槛；21：入档与 U 项；06：G-09/G-10 的依据；20：原版隔离审阅、`pnpm check:compliance` |
| AC-10 | 22、07、08、17 | 22：无需宿主输入的原版运行能力；07：方案与预实验；08：批准的判据；17：合格运行报告 |
| AC-11 | 18 | 18：全部 R 项按批准判据的判定（含 P3-07 集成） |
| AC-12 | 06、19 | 06：检查点 A、C 的批准记录早于依赖代码；19：文档与交接；20：`pnpm check` |

## 子任务跟踪

状态只在此维护：`pending` / `in-progress` / `blocked` / `completed`。依赖项全部 completed 后才能开始；验收结果和证据写在相应 subtask 文档，不在阶段索引重复状态。并行执行时，本表与执行记录只由协调者修改。

| 子任务 | 依赖 | 状态 |
| --- | --- | --- |
| [01-motion-integration-research.md](./subtasks/01-motion-integration-research.md) | — | completed |
| [02-controls-keys-research.md](./subtasks/02-controls-keys-research.md) | — | completed |
| [03-speed-assist-research.md](./subtasks/03-speed-assist-research.md) | — | completed |
| [04-area-boundary-autopilot-research.md](./subtasks/04-area-boundary-autopilot-research.md) | — | completed |
| [05-takeoff-state-research.md](./subtasks/05-takeoff-state-research.md) | 03 | completed |
| [21-research-records.md](./subtasks/21-research-records.md) | 01, 02, 03, 04, 05 | completed |
| [06-checkpoint-a-c-contract.md](./subtasks/06-checkpoint-a-c-contract.md) | 21 | completed |
| [07-measurement-prep-pilot.md](./subtasks/07-measurement-prep-pilot.md) | 21, 22 | completed |
| [08-checkpoint-b-criteria.md](./subtasks/08-checkpoint-b-criteria.md) | 07 | completed |
| [09-world-input-contract.md](./subtasks/09-world-input-contract.md) | 06 | completed |
| [10-flight-state-instantiation.md](./subtasks/10-flight-state-instantiation.md) | 09 | completed |
| [11-movement-stage.md](./subtasks/11-movement-stage.md) | 10 | completed |
| [12-controls-speed-commands.md](./subtasks/12-controls-speed-commands.md) | 11 | completed |
| [13-speed-match-assist.md](./subtasks/13-speed-match-assist.md) | 12 | completed |
| [14-area-parking-world-exit.md](./subtasks/14-area-parking-world-exit.md) | 11 | completed |
| [15-motion-projection-replay.md](./subtasks/15-motion-projection-replay.md) | 13, 14 | completed |
| [16-real-content-check.md](./subtasks/16-real-content-check.md) | 11 | completed |
| [17-original-runs.md](./subtasks/17-original-runs.md) | 08 | in-progress |
| [18-comparison-verdicts.md](./subtasks/18-comparison-verdicts.md) | 15, 16, 17 | pending |
| [19-docs-handoff.md](./subtasks/19-docs-handoff.md) | 14, 15, 16 | completed |
| [22-agent-driven-input.md](./subtasks/22-agent-driven-input.md) | 02, 03 | completed |
| [23-implementation-facts.md](./subtasks/23-implementation-facts.md) | 10, 12, 14, 16 | completed |
| [24-p3-04-integration.md](./subtasks/24-p3-04-integration.md) | 09, 12, 13, 14, 15 | completed |
| [25-docs-wrap-up.md](./subtasks/25-docs-wrap-up.md) | 19, 24 | completed |
| [20-final-alignment.md](./subtasks/20-final-alignment.md) | 01, 02, 03, 04, 05, 06, 07, 08, 09, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 23, 24, 25 | pending |

最后一行始终为最终对齐验证，依赖所有其他子任务。ID 分配后保持不变；新增修复项使用新 ID，插入最终验证之前并加入其依赖，不要求最终验证拥有最大的数字。

## 执行记录

- **2026-10-10 — 并行执行安排：** 协调者在 `p3-06-flight-motion-spec` 分支（本 worktree）上执行，同时运行的 worker 不超过 3 个（默认）。沿用 P3-01、P3-03 的宿主做法：宿主不能在指定文件夹启动会话，worker 在应用管理的 worktree 中运行（以认领提交为基），分支改名为 `exec-p3-06-NN` 作为认领标记，`local` 以符号链接接入主仓库。原版运行（07、17）与 Computer Use 只由协调者进行。用户在接下来数小时内不能回答问题，并授权：问题按推荐答案处理；需要时修改 spec 与 goal；为解除阻塞新增子任务（2026-10-10，`/orchestrate` 调用）。授权不涵盖总计划与 ADR 中的冻结决定。
- **2026-10-10 — 03 完成（交 05、06、21）：** 油门不是持久状态（每帧的待发送值，持久的是移动块的指令速度）；速度档位在 Shift+数字的码上，未按 Shift 的数字在飞行中无作用，与键位表“速度 1–9”和 AC-04 的措辞冲突；辅助失去目标时恢复最大油门，spec 未列对应事件；上限降低后 `−` 可越出油门表，须定项目规则；最高速度只在实例化、救援与能量分配变化时重算。这些由 06 在检查点 A 定稿，入档由 21 完成（见 03 的完成证据）。
- **2026-10-10 — 01 完成（交 05、06、07、08、21）：** 积分从不读实体最高速度：上限降低后当前速度可暂时高于上限，按减速率下降；移动筛选包括停靠与被毁（状态 4）对象，被毁源按最后的角速率与速度继续运动；模式 3 只由玩家 Warp 开始写入，P3-06 可交付其积分、触发留给 P3-09；驾驶舱读取的第三行角速率不在计划的运动 projection 中（交 P3-12/P3-13）；玩家建块姿态为单位矩阵，运动方向为 +z，与放置一节把 z 记为高度的关系交 05。检查点 B 的运算次序与误差来源见 01 的完成证据。
- **2026-10-10 — 02 完成（交 06、07、17、21）与操纵前提的冲突：** 原版没有键盘操纵：俯仰、偏航、横滚只来自游戏端口摇杆，方向键与小键盘是视角键，鼠标飞行已由 U-012 排除；基准配置不模拟摇杆，手动转向不可能（已确认，代码）。spec 的操纵一节与 M-03、R-04 覆盖以原版键盘能操纵为前提。协调者的处理：总计划首版输入一段的冻结决定（首版只支持键鼠、键盘负责飞行、横滚须能用键盘完成、Core 预留模拟轴）不变，其风险行已预见原版依赖摇杆的情形；P3-06 只定 Core 的轴语义，物理操纵键由 P3-05 选取。因此不改总计划，由 06 在检查点 A 依预先授权修订 spec：项目轴按原版整数路径上的数字摇杆处理（±1 对应满偏，Flight 模式，Medium 灵敏度表，偏航与横滚分轴），R-04 的转向对照改用私有配置中按键绑定的模拟摇杆驱动原版（07 准备）。总计划“原版的键盘或鼠标”一语的措辞是否以 ADR 更正，留待用户决定（不阻塞本 goal）。02 另交检查点 A：原版只在轴值变化时应用（扰动时每条消息抽 3 次随机数），地图与基地中保持原有转向（spec 的地图归零为有意差异），浮点操纵路径不只服务于自动驾驶（交 P3-08）。
- **2026-10-10 — 新增 22，07 改为依赖 22：** 依用户对新增解除阻塞子任务的预先授权（不需审阅）。用户在执行期间不可用，而 07、17 需要游戏操作。02 确认原版只经 INT 21h 字符输入读键，转向只来自摇杆；本机 DOSBox-X 自带 `AUTOTYPE` 与调试器内存写入。22 为工具增加经配方声明并记录的模拟器内输入（进入路线、定时按键、摇杆偏转），按 spec“agent 先核对可用方法”的要求先行。22 的烟测通过后，协调者把 07、17 改为自动；不可行时两者保持需用户，按恢复条件记为 blocked。最终对齐加入对 22 的依赖。
- **2026-10-10 — 04 完成（交 05、06、21）：** G-09 成立（自动驾驶只能由 `a` 键在有目标时开启，碰撞、救援与程序自身只关闭）；活动对象（含玩家）没有世界边界处理，spec 中“活动对象到达世界边界 → 按 M-07 的原版处理”应改为不处理；真正退场只在停放更新的到达分支；“+6 标志位 0x1F0”实为种类位 0x1f00000；消息 0x800000 是 AI 的 Warp 离场请求。停放运动依赖 `0x68050` 在实例化时写入的 AI 状态，与 P3-08 形成任务级循环，须在检查点 A 解决：推荐把实例化时的 `0x68050` 步骤（初始模式、目标、目的地及其随机数抽取）移入 P3-06 的实例化扩展，之后的 AI 程序变化仍归 P3-08；停放中的 Warp 跳跃在切片中可达，推荐归 P3-06；编队领队与偏移若未由 P3-02 的生成保存，须在检查点 A 补入（见 04 的完成证据）。
- **2026-10-10 — 05 完成（交 06、07、10、17、18、21）：** 实例化不写玩家目标 +0x8C（`0x68050` 写 AI 目标 +0x90），初值为空有代码证据；首次状态 7 回调末尾的自动选择（P3-07）把目标设为最近的活动敌方（更正 03 的“前方敌方”），因此首次可操纵更新后的目标依赖 P3-07，不依赖 P3-08；玩家开局为单位矩阵，前方为 +z（垂直于扇区平面），首次输入前只沿 z 运动；`0x68050` 对玩家恒为 2 次抽取，须留在随机序列中，实例化各步的抽取次序见 05 的完成证据；R-05a 用实例化相对时间。
- **2026-10-10 — 22 的证据保护范围（协调者决定，依预先授权）：** 测量工具在运行后核对 `local/research/` 中所有既有文件未被改动或删除（P3-01 的工具契约），而其他任务的会话（P3-04、P3-07）正持续改写其中的文件，约 10 分钟的运行几乎必然报 `original-changed`，按指南须停止所有运行等待用户。协调者不采用“请其他会话暂停”或“等待其空闲”，而让 22 增加可选的证据范围：运行可声明 `local/research/` 内、包含运行目录的一个目录，只在其中保护既有文件；`local/StarRang`、基准快照与私有副本的核对不变；不声明时仍为整个研究根目录；报告记录实际的证据根。指南写明其保证较窄及适用情形。
- **2026-10-10 — 22 完成，07、17 改为自动：** 工具新增经配方声明、逐次回读并记入报告的模拟器内输入：在调试器暂停点把按键写入 BIOS 键盘缓冲（缓冲须为空，每键只被读一次）、改写换档标志位，或写入声明的输入设备字段；`AUTOTYPE` 因在宿主线程中计时、调试器暂停时仍运行且不能驱动摇杆而不用。可选的 `--evidence` 证据范围按上一条的决定实现。私有烟测（无宿主输入）进入了所选任务，`-` 一次后的指令速度与 Backspace 恢复都符合 03 的预测，摇杆偏航刺激的速率、标志与“只在变化时应用”都符合 02 的预测（运行 smoke-03、smoke-04 均为 complete）。交 07、17：私有副本中没有摇杆页，进入路线为标题 Enter → 战役选项 Enter → 简报 Esc；group 0 开局速度辅助为开并自动选取目标，油门样本前须用 Ctrl+Enter 关闭或计入；持续偏转须在每次设备读取时写入，或写入上次读数的副本；过场不可跳过（40000 cycles 下约 1.5 分钟）。按 07、17 的“执行时若该限制已解除…改为自动”，协调者把两者改为自动。
- **2026-10-10 — 21 完成（交 06、07、P3-03）：** 01–05 的结论已写入 `docs/original/`：executable 新节“Flight motion, controls, speed, parking and take-off (P3-06)”及旧文更正、craft、scenario、键位表（原版无键盘操纵、速度档位在 Shift+数字）与 U-001、U-008、U-009、U-011、U-021、U-022、U-024–U-026（状态与负责阶段未改）。craft +0xA4 按有符号比较改为 i32，`src/content/rule-data/craft-info.ts` 仍按 int32 读取并拒绝第 31 位，交 P3-03 对齐（基准数据不受影响）。B-008 所需的支持域、误差项、试键与暂停点仍在 local findings，交 07、08。
- **2026-10-10 — 06 完成，检查点 A、C 定稿（交 07、09–15、P3-05、P3-07、P3-08、P3-09）：** 本 spec、P3-02 spec（新节“P3-06 的契约修订（检查点 A）”，D-01 至 D-08）与 P3-01 缺省清单（G-09、G-10）按协调者的十条裁定与推荐答案修订并记录，09–15 的工作范围与验收标准已同步。要点：项目轴为原版整数路径上的数字摇杆（±1 满偏，非整数向零截断，Medium 固定，只在变化时应用）；`select-number` 对应 Shift+n 档位；油门不持久；新增 `speed-assist-released`；`0x68050` 初态与停放中的 Warp 跳跃归 P3-06；活动对象无边界处理；编队领队与偏移补入 P3-02；`CORE_LIMITS` 不变。总计划“原版的键盘或鼠标”一语是否以 ADR 更正留待用户，不阻塞。阶段索引的 P3-05、P3-06、P3-08、P3-09 段与 U-011 行已按 06 的提议更新。
- **2026-10-10 — 09 完成（交 10、14、16、19）：** 世界创建输入、录制与 `ReplayContent` 增加 `craftInfo`，语义检查只针对实际发帖的生成项；setupHash 覆盖严格读取后的 craft-info；新增原因码与四个事件，比较按 tick 内的阶段顺序校验；`flight` 拆为 `{ motion, combat }`；`RULES_VERSION` 与快照格式版本各递增到 2。交 14：停放中 Warp 计时只校验 i32 范围，负的持续时间在原版无符号比较下的行为由 14 定（本地 480 条记录都非负）。交 16：种类位 25 没有机型记录，D-01 拒绝任何发帖的种类 25 实例，真实内容核对须确认所选任务不受影响。交 19：core 分册与源码结构指南需同步（输入、事件、分区、版本与新模块 `world/craft-info-input.ts`）。可选整理：`spawn.ts` 与 `craft-info-input.ts` 的发帖记录判定可合并（拥有 `spawn.ts` 的行处理）。
- **2026-10-10 — 10 完成（交 11–15、19、P3-07）：** 实体飞行状态、玩家控制状态与实例化扩展按检查点 A 的次序写入（分配器初态 → 最高速度 → `0x68050` 初始 AI → 停放时刻 → `warpClock` → 活动与移动块 → 玩家状态，编队在成员实例化后写入）；快照覆盖新状态。为 P3-07 导出纯函数 `craftMovementBlock`、`playerMaximumSpeed`、`initialMaximumSpeed`、`applyRecomputedMaximum` 等，`MovementBlock` 为可扩展的联合别名（P3-07 增加变体时须同时扩展 entity-table 的校验与复制及快照写入器）；`firingRecord` 等合并到 `rules/spawn-schedule.ts`。交 13：玩家移除时 `leave` 须同时清除 `player.target` 与 `player.control`。交 14：停放切换改用 `setActivity`（停放时释放移动块，恢复时用 `initialMovementBlock`），在此之前被切换实体的移动块是旧的。交 15：P3-07 接入前 `speedLimitStatus` 报 `'initial-only'`。交 19：core 分册与源码结构；executable 中 `0x56b8c` 方向表布局、`0x68050` 搜索评分与阈值比较、`0x218e8` 无旧块时的油门（仅结构，见 10 的完成证据）。
- **2026-10-10 — 11 完成（交 12–16、18、19、P3-07）：** 运动阶段接入第 8 阶段；模式 0/3 积分为 `rules/flight-motion.ts` 的纯函数（`rotateRows`、`motionStep`、`integrateCraft`、`integrateWarp`），按块的 mode 穷尽分派，P3-07 在 `movement.ts` 的分派与 `motionRecord` 处加入模式 1/2 与弹体记录；期望值来自精确有理数参照（与 01 的本地独立评估器逐位一致）；每个 f32 写回点非有限即故障；活动实体现在每 tick 运动，测试中需固定位置时用 `stillEntityInit`；步长须可表示为 f32（超大步长的合成配置在运动阶段故障，未改 P3-02 的运行配置契约）。交 18：`motionStep` 与积分函数可作为有界的私有校准入口。交 19：core 分册的阶段表第 8 行与源码结构。
- **2026-10-10 — 16 完成（交 18、19、P3-07、P3-09）：** 真实内容经同包验证与解码进入 Core，30 次运行（僚机无与 0–4，各 5 个种子）的玩家起飞初态、相对时刻与其他对象的初始块与首次运动均符合独立期望；种类位 25 不影响所选任务（52 个 SCEN 与 SCCT 中都没有种类位 ≥ 20 的记录）；首次可操纵更新后的目标与 `0x3060c` 的抽取留给 P3-07 与 18 重跑本地脚本。交 P3-09/P3-13：运行时的种类 25 地图标记若以带块的活动对象出现，需要不依赖机型记录的模式 4 块变体，否则运动阶段故障。交 19：executable 最高速度一节“Local data”中所选任务 CINF 受能量限制的组合数应为 6/16（03 的本地输出与 16 的独立计算一致），不是 7。
- **2026-10-10 — 12 完成（交 13、15、19、P3-05、P3-07、P3-08）：** 玩家更新在对象更新开头判定命令并消费轴；可用 = 存在、未被毁、状态 7，可用玩家缺控制状态为故障；判定次序为 not-implemented（本上下文不归 P3-06）→ player-unavailable → wrong-context；读回按批次开始时的指令速度与前序请求的推算（锁定时不变）；请求在玩家更新末尾按次序投递，轴并入最后一个 `control` 请求或单独投递；`control` 请求在请求处理中按 `0x21dd0` 应用（扰动时 3 次抽取）。交 P3-07/P3-08：浮点路径为 `rules/flight-control.ts` 的 `applyFloatControl`，`0x21d88` 即 10 交付的 `applyRecomputedMaximum`；导弹锁定与自动选择目标的插入点已在代码注释中标出。交 13：在 `judgeCommands` 之前加入失效目标清除与辅助；`match-target`、`toggle-auto-match`、`confirm-selection` 目前为 not-implemented，读回推算须计入 `match-speed` 请求。交 19：core 分册的原因码、请求类型与命令判定、扩展规则段已过时；executable 可补入新确认的数值细节（见 12 的完成证据）。
- **2026-10-10 — 13 完成（交 14、15、19、P3-07、P3-08）：** 手动匹配（`match-speed` 请求）、自动辅助与开关按检查点 A 实现；失效目标清除只在玩家可用时运行（与原版状态 7 的分支一致），不可用期间保留的过期 ID 在下一次可用更新或玩家移除时清除；玩家移除时 `leave` 已同时清除 `player.target` 与 `player.control`（10 的交接已完成），停放时的目标清除仍归 14。为 P3-08 导出 `matchedSpeed`、`speedMatch`、`applySpeedMatch`（`0x21adc`）与辅助判定。P3-07 的插入点注释保留。P3-07 已把本分支（至 12）合并到其分支（`510a230`），并在其一侧解决了 `pipeline.ts` 的冲突（命令委托 `judge`、`craftMovement`），本分支不需改动。交 19：core 分册补 `match-speed` 请求、辅助与匹配事件的发出位置及玩家移除时的清除。
- **2026-10-10 — 14 完成（交 15、18、19、P3-07–P3-10）：** 区域检查、停放切换（`setActivity` 释放或重建移动块，只清恰为该实体的玩家目标）、过境门禁（玩家种类除外）、停放更新与行进、停放中的 Warp 跳跃、编队跟随、唯一退场与 `object-left-world`；停放时写位置使放置序号加 1。项目规则：负的 +0xA8 或 +0xA8 + +0xA4 按精确整数（不回绕）计算，过境首次检查即结束、不推迟 Warp。没有玩家实体时区域检查把所有非玩家实体判为区外并停放（与原版一致），之后的测试若以无玩家的世界推进替身实体，须注意这一点。插入点注释：P3-07/P3-08 的停放战斗、P3-10 的基地报告、P3-09 玩家 Warp 期间的区域中心。交 19：core 分册阶段表、`leave`、过境门禁、新模块与上述项目规则；executable 可补数值细节（见 14 的完成证据）。
- **2026-10-10 — 15 完成（交 18、19、P3-07、P3-13）：** `flight.motion` 就绪（无玩家实体时为 null；`speedLimitStatus` 恒为 `'initial-only'`，P3-07 接入实时最高速度重算时改为 `'live'`；玩家实体缺移动块或控制状态、或 ID 不能解析时为 `projection.motion` 故障），`combat` 仍未就绪。`replay.ts` 新增内部入口 `startReplay`；运动 replay 测试以替身代替尚未实现的目标与 AI 写入者（录制与 replay 相同），160 tick 的录制经 JSON 往返后事件与检查点全部相等。`budget.test.ts` 在实体上限下以真实流水线核对 P3-06 的事件与请求项及快照文本长度；P3-07 增加预算项时须同步其中的上界。交 19：core 分册的 `flight` 就绪说明与内部函数列表。
- **2026-10-10 — 新增 23（依预先授权，不需审阅）：** 10、12、14 在实现中对照原生指令确认了若干结构细节，16 发现 executable 最高速度一节的计数有误（应为 6/16）。19 只写工程文档、17 只写运行结论，这些原版事实没有归属，由 23 写入 executable 的 P3-06 一节。最终对齐加入对 23 的依赖。
- **2026-10-10 — 23 完成：** 10、12、14 实现中确认的结构、运算次序与舍入点经原生指令复核后写入 executable 的 P3-06 一节；16 的计数更正为 6/16。U 项不变。未记录、留待需要时补入：`0x568b0` 在启动时还循环调用 `0x56b8c` 生成另一张随机表（启动时消耗随机数）。Core 的随机目标距离平方阈值与原版的舍入写法不同，但在比例由代码固定时结果相同，比例变为输入时须复核。
- **2026-10-10 — 合并 main（P3-04），在最终对齐之前（协调者决定，依预先授权）：** P3-04 已快进进入 main，其正式 Runtime/Session 与 e2e 调用 `createWorld` 与 `ReplayContent`。不合并则本分支与 P3-04 的调用者在合入时冲突，最终对齐无法证明可合并。合并提交 `854cfdb2`：文字冲突只有阶段索引的导航句（合并两侧）；main 删除了 P1 合成演示并重组了工程文档。已知的语义冲突（合并后 `pnpm check` 的类型检查失败）：任务所有者未传 `craftInfo`、事件总线与事件日志未列出 P3-06 的四个事件、会话桥读取旧的 `flight.readiness`。由新增的修复子任务 24 处理并做浏览器回归；在 24 集成前，本分支的类型检查为红。另：P3-07 指出 `judgeCommands` 在 tick 开头读取一次指令速度，P3-07 的能量键在同 tick 内改写上限后读回会过期；P3-06 自身不改变 tick 内的上限，P3-07 在其分支修正并在合并时处理，本分支不改。
- **2026-10-10 — 新增 24 并认领（依预先授权，不需审阅）：** 合并 main 后 P3-04 的调用者与 P3-06 契约不符（见上一条），由 24 修复：任务开始从同一资源包读取 `craftInfo`，事件总线与开发事件日志列出四个新事件，会话桥改用拆分后的 `flight` 分区，更新受影响的测试与 e2e 夹具，并按 browser-testing 做浏览器回归。这是 goal 前提中“09 执行时若 P3-04 已接入，同时更新其调用者”的延后执行。最终对齐加入对 24 的依赖。
- **2026-10-10 — 19 完成：** core 分册与源码结构按 09–16 的集成代码同步（输入、阶段、请求、事件、版本、新模块、项目规则、已知差异），并写明对 P3-03、P3-04、P3-05、P3-07–P3-14 的交接；在合并 main 后的文档上写入，P3-04 的条目保留，24 将改变的 app/ui 行为未写入。交 20（可选）：spec 实例化扩展第 3 步与 P3-02 修订 D-08 写 `0x68050` 抽取“0–3 次”，Core 只能抽 0–2 次（原版 +0x4C 路径在 Core 中不可达），core 分册已说明，spec 可补一句澄清，行为不变。
- **2026-10-10 — 24 完成，合并后的分支恢复为绿：** 任务开始从同一资源包解码唯一的 craft-info 作为 `craftInfo`（解码失败按 `rejected` 报告，缺 craft-info 的包为 `package-incomplete`，任务资格与诊断不读 craft-info）；事件总线与开发事件日志列出四个新事件；会话桥改用拆分后的 `flight` 分区；`replay-check` 从同包读取 craft-info。共用的生产结构合成 craft-info 的 +0x0C 改为满足 Core 语义检查的值（原值被所有任务场景拒绝）；replay-check 的“其他规则版本”用例改用 `RULES_VERSION + 1`。`pnpm check` 与完整 `pnpm test:e2e`（196 项）通过。待办：`docs/guides/tools.md` 录制重放核对一节的两处说明（解码顺序加入 craft-info；`content-failed` 含 craft-info）与 07 的写入范围重叠，07 集成后由协调者补入（见 24 的完成证据）。
- **2026-10-10 — 总计划措辞一项已有用户决定（待文档集成）：** P3-05 会话转告，用户在 P3-05 中明确决定“先做键盘，不做游戏手柄或其他输入”。P3-05 据此在其工作树起草 ADR-0018（keyboard-flight-controls），并同步总计划 §1.2/§13；尚未提交或集成。范围只允许明确标注的项目键盘操纵，不批准具体绑定，也不放宽运动对照。本 spec 未决事项中“总计划措辞是否以 ADR 更正，留待用户”一项改为“已有用户决定，由 P3-05 的 ADR-0018 集成”；本 goal 不另写 ADR，也不合并该工作树，由 20 在最终对齐中按此记录核对。
- **2026-10-10 — 07 完成（交 08、17）：** B-008 写定测量方案（数值判据留给 08）；预实验 6 次完整运行与 3 次有缺口的运行（登记在被忽略的 `local/research/p3-06/runtime/analysis/runs.md`），全部只用模拟器内输入。91 对同帧运动前后都由独立求值器按就近舍入逐位再现（37 个可区分对无一与向零一致，仅作诊断，U-009 留给 17）；1 秒窗口按固定 2 单位步长推进时，只含 0/2 单位帧的窗口逐位一致，含 4 单位帧时位置差与行方向差有界（数值见 B-008 预实验）；首次运动的步长很长，速度辅助须在首次可操纵更新的那一次轮询关闭；试键结论写入键位表与 U-011；工具新增寄存器寻址的字段（R-05b 读取停放行进与停放切换中被处理的对象）。交 08：误差预算输入在 `analysis/summary.md`。交 17：方案、操作程序与配方生成脚本在同一目录；只在预实验中观察到的原版事实留在 B-008 的预实验一节，待 17 的正式运行后再写入 executable 与 U-009。
- **2026-10-10 — 新增 25（依预先授权，不需审阅）：** 收尾三项无归属的文档改动：24 提议的工具用法“录制重放核对”两处（07 集成前与其写入范围重叠）、19 提议的 `0x68050` 抽取次数澄清（spec 与 P3-02 D-08 写 0–3，Core 可达 0–2），以及把 spec 未决事项中的总计划措辞一项改为“已有用户决定，由 P3-05 的 ADR-0018 集成”。25 与 08 都写 spec，由路由器串行。最终对齐加入对 25 的依赖。
- **2026-10-10 — 08 完成，检查点 B 定稿（交 17、18、25）：** spec 新增“检查点 B 定稿的判据”，依用户 2026-10-09 的预先授权定稿（审批节“2026-10-10 修订（检查点 B）”），B-008 的验收容差与判据批准同步。给定原版操作数时，不经正余弦的连续量误差界为 0 ulp，三行只在临界正余弦处放宽；R-04c 要求候选与固定 2 单位/tick 的独立求值逐位相等，并对该求值与原版之差设每个边界的步长超额上界，同一外部时刻的输入延迟差以延迟界报告；所需数量见 spec“样本、窗口与运行数”（约 11 次运行、7–9 小时），每个下限都必需，追加两次同配方运行后仍不足则 17 记为 blocked。交 17：第一次正式运行前把 `criteria/counts.md` 抄入 `runtime/plan.md` 的“Counts (08)”列，并报告最大的设备与键盘到期间隔（延迟界要用）。
- **2026-10-10 — 25 完成：** 工具用法的录制重放核对一节按集成后的 `replay-check` 更新（解码同组唯一的 craft-info；`content-failed` 含 craft-info）；spec 实例化扩展与 P3-02 D-08 写明原版 0–3 次、Core 可达 0–2 次；spec 未决事项改为“已有用户决定，由 P3-05 的 ADR-0018 集成”，审批节补“2026-10-10 说明（文档收尾）”。交 20：ADR-0018 集成后，未决事项中的文字提及可改为链接。
- **2026-10-10 — 执行暂停（用户要求，重启电脑）：** 17 仍为 `in-progress`。其 worker 的 worktree 与 `exec-p3-06-17` 分支保留，未提交。正式运行目录与运行笔记在被忽略的 `local/research/p3-06/runtime/`（`runs/`、`run-notes.md`、`plan.md`）。有效运行：`f-1-02`（F1）、`f-2-02`（F2）、`f-5b-01`（F5b）。不计数的运行：`f-1-01`（v1 配方缺陷）、`f-2-01`（为停用 v1 而取消）、`f-5-01`（运行中玩家被救援，F5 改为 v3 配方）、`f-3-01`（为暂停而中止，清理通过）。余下：F1 ×1、F2 ×1、F3 ×2、F4 ×3、F5-v3 ×2、F5b ×1（数量与下限见 `run-notes.md` 与 `plan.md` 的“Counts (08)”列）。暂停时 17 没有任何模拟器、`measure.py` 或队列进程在运行。恢复：重新运行 `/execute-goal docs/plan/p3/06/goal.md`，协调者在同一 worktree 中为 17 启动新的 worker 会话，沿用运行笔记、配方与指纹，判据不变，并继续与 P3-05、P3-07 轮流使用基准环境（各自的运行开始前，等对方的下一次运行先开始）。其余状态：除 17、18、20 外各行均已完成；17 完成后 18 记为 blocked，等待 P3-07 合并；之后才进行最终对齐 20。

- **2026-10-10 — 恢复执行（用户重新调用 execute-goal）：** 路由仍为 `execute-goal`，唯一可执行项为已认领的 17；协调者工作树干净。保留的 17 会话与 `exec-p3-06-17` 工作树仍在，基线为 `988f8071`，没有完成提交或已跟踪的未提交改动，仅有未跟踪的 Python 缓存。沿用该会话恢复，先核对运行笔记、配方指纹与基准锁，再继续上一条列出的剩余运行；有效与排除的运行不变，检查点 B 的判据不变。协调者通知 P3-05、P3-07 恢复轮流使用基准环境，17 不改动其他会话的进程或锁。完成采集后才核对 18 的实际集成前提，不以 P3-07 分支存在作为已交付。

## 审批

用户于 2026-10-09 修改并明确批准本 goal（“i made some change. approve and commit”）。批准范围为当前的 21 个子任务、依赖、执行方式、写入范围与验收覆盖，以及下述用户指示。这不代表实现完成，也不授权 push、部署或阶段切换。

**用户指示（2026-10-09）：** 执行中按需新增的子任务不需要用户审阅，协调者新增后直接设为可执行。检查点 A、B、C 的 spec 修订，以及改变已定方向的 spec 修订，也不需要用户审阅，直接按照推荐答案来。为与此一致，spec 的执行检查点与相关表述已同步修订（见 spec 审批节的“2026-10-09 修订”），06、08 的执行方式改为自动。授权不涵盖总计划与 ADR 中的冻结决定：需要改变它们时，相应子任务记为 blocked，先写 ADR 交用户决定。07、17 仍需用户在 DOSBox-X 中按键，原因见上文“原版证据”。
