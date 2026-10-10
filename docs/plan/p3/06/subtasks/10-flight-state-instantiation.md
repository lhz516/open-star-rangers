---
type: plan
status: active
phase: P3
task: "06"
subtask: "10"
updated: 2026-10-10
---

# 10 — 实体飞行状态、实例化与起飞初态

**契约来源：** [spec](../spec.md) 的 S-05（最高速度）、S-07、S-08；AC-04（最高速度与初速部分）、AC-06（状态保存与抽取部分）、AC-07（合成部分）、AC-08（快照部分）；[速度与油门](../spec.md#速度与油门)、[起飞初始状态](../spec.md#起飞初始状态)、[实例化扩展](../spec.md#实例化扩展)；D-02、D-03 与[检查点 A 定稿的状态与契约](../spec.md#检查点-a-定稿的状态与契约)。
**依赖：** 09。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **实体与玩家状态（D-02、D-03）：** 按检查点 A 的封闭形状在 `Entity`/`EntityInit` 加入 `maximumSpeed`、`lastParkedUpdateClock`、`warpClock`、`inWarp`、可空的 `movement` 与 `ai`，以及 P3-02 修订补入的可空 `formation`；在 `PlayerState` 加入 `target` 与可空的 `control`（每轴上次读数、速度辅助）。不保存油门，不加入未经定稿的字段。
- **编队（P3-02 修订）：** 段 5 请求中每个布局周期的后续成员记录领队实体 ID 与偏移 R(l − layout[0])；周期首个成员与其他实体为 null。
- **最高速度（`0x30e0c`）：** 纯函数，覆盖 M-04 的全部已确认分支（非玩家取基准；玩家的能量分支与两位字段 2 的系数）；在实例化扩展点的 `0x3060c` 位置以代码固定的初始等级与清零的两位字段写入，不抽取；`speedLimitStatus` 的依据为 `'initial-only'`。另交付上限降低后的规则函数 `0x21d88`。
- **移动块的建立：** 油门表（启动时计算的线性表，代码规则）；初始移动块（`0x2c3b0`：模式 `craft`、满油门，速度 = 指令速度 = 最高速度，到达，速度比，其余为零或空），实例化为活动时调用，恢复活动时由 14 调用；按旧速度比重建的规则函数（`0x218e8`，供 P3-11 的救援与 P3-08 的种类 `0x4000`）。
- **随机方向（`0x56b8c`）：** 启动时计算的方向表与 2 次抽取的随机方向，作为规则函数交付（12 的浮点路径与 14 的停放行进使用）。
- **AI 初态（`0x68050`）：** 按[初始飞行状态](../../../../original/formats/executable.md#initial-flight-state-p3-0605)的分支：固定种类只写模式；其他种类由来源记录取候选掩码、最近者搜索、至多 1 次随机选择，或世界随机点（2 次抽取）；目标偏移为零，对象目标为空。
- **计时字段：** `lastParkedUpdateClock` = 实例化时钟；`warpClock` 对玩家与僚机以外的种类抽取一次（[实例化](../../../../original/formats/executable.md#instantiation-p3-0203)第 12 步），否则为 0；`inWarp` = false。各步按[实例化扩展](../spec.md#实例化扩展)的次序，不提前或重复抽取。
- **起飞初态：** 玩家的移动块、目标（null）、控制状态（上次读数 0；辅助开关 = 战役组是否为 0，到期 0，未匹配）与 AI 初态按检查点 A。
- **快照：** 快照写入器覆盖全部新字段（映射类型强制）；逐字段的代表性改动改变规范文本。
- **测试：** 最高速度各分支与输入边界、`0x21d88`；初始移动块与重建；`0x68050` 各分支的结果与抽取次数；停放时刻与 Warp 计时的写入；P3-06 自己的抽取的相对位置与次数（玩家：放置 2 次之后 `0x68050` 2 次；`0x3060c` 的 1 次由 P3-07 补上，是集成缺口，不在本项断言完整序列）；编队领队与偏移；起飞初态在“实例化完成”时的值（首次运动由 11、首次可操纵更新由 12/13 覆盖）；快照覆盖。

## 不包含

- 运动阶段（11）；命令与操纵（12）；匹配与辅助（13）；停放切换与重建的调用（14）；projection（15）。
- 能量与子系统状态及其变化，包括 `0x3060c` 的能量字段与能量计时抽取（P3-07）；`0x20990` 的 AI 程序与此后 AI 状态的改变（P3-08）。

## 关键文件与契约

- [entity-table.ts](../../../../../src/core/world/entity-table.ts)、[player-state.ts](../../../../../src/core/world/player-state.ts)、[spawn.ts](../../../../../src/core/systems/spawn.ts) 的实例化扩展点、[snapshot.ts](../../../../../src/core/replay/snapshot.ts)。
- 计划新增：`src/core/rules/flight-state.ts`（最高速度、初始移动块等纯函数）及相邻测试。
- 03、05 的完成证据与检查点 A 定稿。

## 写入范围

- `src/core/world/**`：实体、玩家状态与相关测试。
- `src/core/systems/spawn*.ts`：实例化扩展点与测试。
- `src/core/rules/**`：飞行状态纯函数（新建）与测试。
- `src/core/replay/snapshot*.ts`：快照写入器与测试。

## 验收标准

- [x] 实体与玩家状态的字段与检查点 A 的形状一致，没有开放对象或未定稿字段；编队字段按 P3-02 的修订写入。
- [x] AC-04（部分）：最高速度对每个种类与玩家分支的输入正确，`0x21d88` 按 M-04；初始移动块为模式 `craft`、满油门、初速恰为最高速度。
- [x] AC-06（部分）：停放时刻与 Warp 计时的保存与抽取正确，P3-06 自己的抽取符合实例化扩展的相对顺序。
- [x] AC-07（合成部分）：起飞初态在实例化时符合 M-09；目标为 null 有代码依据；`0x68050` 的分支与抽取次数正确。
- [x] AC-08（部分）：快照覆盖全部新状态，代表性改动改变规范文本。
- [x] `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts` 与 `pnpm check` 通过。

## 验证方法

- Node 单元测试；期望由原版公式独立推导，原版参数不写进 fixture。
- 按 execute-goal 的流程完成 rubber-duck 审查后，以本项写入范围调用 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。
- 不涉及浏览器。

## 完成证据

- **2026-10-10（worker，基于认领提交 cad5f70b）：**
  - **状态形状（D-02、D-03）：** [entity-table.ts](../../../../../src/core/world/entity-table.ts) 的 `Entity`/`EntityInit` 加入 `maximumSpeed`、`lastParkedUpdateClock`、`warpClock`、`inWarp`、`movement`、`ai`、`formation`，形状按检查点 A：`MovementBlock` 是按 `mode` 区分的联合，目前只有 `SteeredMovementBlock`（`craft`/`warp`，原版模式 0、3 共用字段），P3-07、P3-09 在旁加入其他变体（协调者转交的 P3-07 请求）；`AiState`、`Formation`、`SteeringAxis`、`TimedRotation`、`Impulse`、`Disturbance` 均为封闭形状。分配时校验并复制：f32 字段与时钟、AI 模式、“停放时恰无移动块”（`entities.flight`、`entities.movement` 故障）；新增 `setActivity`（活动与移动块一起切换并重置状态，交 14 的停放切换复用）、`allocatorAiState`/`allocatorFlightState`（分配器缺省：AI 模式 5、无目标、零向量、无 Warp、无编队，供运行时种类的构造者复用）。[player-state.ts](../../../../../src/core/world/player-state.ts) 加入 `target` 与可空的 `control`（`lastAxes` 三轴、`speedAssist { enabled, dueClock, engaged }`），不保存油门；`initialPlayerControl(group)`。
  - **规则（新建 [flight-state.ts](../../../../../src/core/rules/flight-state.ts)）：** 油门表 `THROTTLE_TABLE`（由中点按 1/64 累加，129 项，中点 +0）、`throttleIndex`（算术右移，越界钳到表内，检查点 A 的项目规则）、`throttleSpeed`；`playerEnergyOperands`（`0x3060c` 的 E、T）、`playerMaximumSpeed`（`0x30e0c` 玩家分支与两位字段 2 的系数）、`initialMaximumSpeed`（玩家用代码固定的等级 1、2 与清零的字段，其他种类取 +0xB8，不抽取）；`applyRecomputedMaximum`（`0x21d88`，速度 ÷ 新上限严格大于 1 才改指令速度并清到达，零上限为故障）；`craftMovementBlock(throttle, …)`（`0x21794` 模式 0，导出供 P3-07 的导弹）、`initialMovementBlock`（`0x2c3b0`，满油门）、`rebuiltMovementBlock`（`0x218e8`：油门 = trunc(f32(旧速度 ÷ +0xB8) × 128)，无旧块时为 0，越出 i32 为故障）；`initialWarpClock`（第 12 步，玩家与僚机为 0，其他种类时钟 + rand % 0x2D00，越出安全整数为故障）。[random-direction.ts](../../../../../src/core/rules/random-direction.ts)：启动时的 19 × 19 方向表与 `randomDirection`（`0x56b8c`，2 次抽取）。[initial-ai.ts](../../../../../src/core/rules/initial-ai.ts)：`aiCandidates`（`0x68018`）与 `initialAiState`（`0x68050`：固定种类只写模式；最近者搜索计入自身，分数 f32(dy·f32(dy) + dz·f32(dz) + dx·f32(dx))，严格更小才替换；另一方且超过 f32(45000²) = 2,024,999,936 时 1 次抽取随机候选，种类 0x6000 退回最近者；无目标时世界随机目标点 2 次抽取、模式 4）。
  - **实例化（[spawn.ts](../../../../../src/core/systems/spawn.ts)）：** 以分配器状态分配（停放、无块），再按[实例化扩展](../spec.md#实例化扩展)的次序写：最高速度 → AI 初态（抽取）→ `lastParkedUpdateClock` = 时钟 → `warpClock`（抽取）→ 活动判定与移动块（玩家取单位矩阵）→ 玩家状态（目标 null、控制状态）；为 P3-07、P3-08、P3-10 留注释位置。段 5 编组在成员实例化之后为周期的后续成员写编队（领队为周期首个成员，偏移 f32(l − layout[0])）。按 09 的交接合并了“发帖记录”判定：`firingRecord`、`postsRequests` 与 `WINGMAN_KIND_BIT` 移到 [spawn-schedule.ts](../../../../../src/core/rules/spawn-schedule.ts)，`checkSpawnQueue` 与 [craft-info-input.ts](../../../../../src/core/world/craft-info-input.ts) 共用；能量常数 `ENERGY_SCALE` 与分配等级改由 flight-state 提供。[placement.ts](../../../../../src/core/rules/placement.ts) 导出 `worldDefaultPoint`（`0x68c98`）。
  - **快照：** [snapshot.ts](../../../../../src/core/replay/snapshot.ts) 的写入器覆盖全部新字段（映射类型强制；移动块按变体写，P3-07 加变体时须加分派）；版本不变（09 已递增）。
  - **测试（合成数据，期望独立推导）：** `flight-state.test.ts`（表项 = (i − 64) ÷ 64、索引与钳制、f32 舍入用精确有理数；E/T 与负数向零截断（不得 −0）、能量分支、等号走基准、2,000,001,000 ÷ 2 的 f32 舍入、字段 2 的 0–3 与次正规数平局；`0x21d88` 各侧与零上限故障；初始块、任意油门的块、重建的奇数油门、越表钳制、负速度、无旧块、i32 越界故障；Warp 计时的边界与安全整数故障）；`random-direction.test.ts`（表的大小、象限、下标布局、8 个象限的符号与 2 次抽取）；`initial-ai.test.ts`（固定种类、无候选与无掩码的目标点、同方/另一方、恰为 45000 不算更远而下一个 f32 抽取、自身计入、f32 分数的平局取先者、声明过滤、随机候选各下标与 0x6000 回退、溢出故障、`0x68018` 的四种情形）；`entity-table.test.ts`（复制与冻结、可变部分、移动块与活动的不变式、16 种非法值、`setActivity`）；`spawn.test.ts`（玩家起飞初态：基准上限 64、满油门块、单位矩阵、目标 null、组 0 辅助开、放置 2 次之后 AI 2 次，下一对象的放置、AI 与 Warp 抽取依次在其后；切片各种类的 AI 模式与 Warp 计时；能量受限的玩家上限 70 与比 f32(0.7)、非玩家取基准、停放无块、晚到的实例化写其 tick 的时钟；AI 目标记录已生成时按其对象、未生成时按 +0x5C 且近处不抽取；僚机同方目标模式 2 且无 Warp 抽取；编队领队与偏移含舍入；Warp 计时越界故障；既有放置与命名测试按新的抽取次序更新）；`snapshot.test.ts`（版本形状含 `target`/`control`；逐叶改动覆盖新字段，富状态含三轴定时旋转、冲量、二级扰动、编队与 AI 目标）；`player-state.test.ts`（组 0–2 的控制初值）。
  - **检查：** `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts`：40 个文件 1,212 项通过；`pnpm check`（类型、ESLint、211 个文件 6,595 项测试、生产构建）通过；`pnpm check:compliance` 通过。
  - **rubber-duck：** 无阻塞项。两条非阻塞意见均采纳：实例化写入原先在分配时一并写入活动与移动块，改为按扩展点次序分阶段写（编队也改在成员实例化之后）；`warpClock` 可越出安全整数，改为预算故障并补测试。
  - **simplify：** 采纳：AI 搜索按原版两次遍历，不再物化数组；`toInt32` 判定 i32；零向量与静止轴提到模块级；写入器不复制 biases；活动切换收拢到 `setActivity`；发帖判定、僚机种类位、AI 候选与 Warp 计时移入 `rules/`；删去只取 +0xB8 的 `craftMaximumSpeed` 与未使用的状态常数。未采纳：快照测试的可空字段名单改为跳过 null（会失去 null 标量的覆盖）；`applyRecomputedMaximum` 改为返回差量（规则就地写块已有先例，P3-07 直接调用）；`initialPlayerControl` 移入 `rules/`（与 `createPlayerState` 同为状态初值）；预先存放 +0x5C 掩码与就地初始化 AI（收益可忽略）。
  - **文档影响：** [Core 模块说明](../../../../engineering/modules/core.md)（实体飞行状态、玩家目标与控制、新规则模块、`setActivity`、发帖判定的位置）与[源码结构指南](../../../../engineering/source-structure.md)（`rules/flight-state.ts`、`initial-ai.ts`、`random-direction.ts`、`rand.test-support.ts`）需同步，按 goal 的分工由 19 更新（不在本项写入范围）。原版事实、ADR 与工程约定不需改；可补入 executable 的结构性细节已在 worker 报告中提出（方向表下标布局与象限次序、`0x68050` 的分数舍入与阈值、无旧块时 `0x218e8` 的油门 0）。
  - **集成缺口与交接：** 13：玩家实体移除时须随 `entityId` 清除 `target` 与 `control`（`pipeline.ts` 的 `leave`）；14：停放切换改用 `setActivity` 释放与重建移动块（目前 `leave` 只切换活动），`startsActive` 的共用判定；15：`speedLimitStatus` 在 P3-07 接入前报 `'initial-only'`；P3-07：在 `MovementBlock` 联合中加入其变体时同时扩展 `isValidMovement`、`copyMovement` 与快照写入器的分派，`0x3060c` 的能量字段与 1 次抽取加在最高速度之后。

