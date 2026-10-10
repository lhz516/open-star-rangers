---
type: plan
status: active
phase: P3
task: "06"
subtask: "09"
updated: 2026-10-10
---

# 09 — 世界创建的机型输入与共享契约

**契约来源：** [spec](../spec.md) 的 S-02、S-08；AC-01、AC-08（事件校验、版本与预算部分）；[对 P3-02 契约的增量](../spec.md#对-p3-02-契约的增量)的 D-01、D-04、D-05（分区结构）、D-06、D-07、D-08（预算）；检查点 A 批准的定稿形状。
**依赖：** 06。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **D-01 世界创建输入：**
  - `CreateWorldInput`、`createRecordingSession` 的输入与 `ReplayContent` 增加必需的 `craftInfo`（`{ id, content }`）；外层字段由 `readExactRecord` 校验，内容经 `readCraftInfo` 严格读取并冻结、与输入脱离；
  - 校验 Asset ID 的 kind；`original-import` 只接受唯一切片的 `data/craft-info`，synthetic 可用合法的 data Asset ID；
  - 语义检查按检查点 A 的定稿清单（[spec 的 D-01](../spec.md#对-p3-02-契约的增量)）：可实例化的每个种类位（玩家、所选僚机、全部直接、延迟与编组实例）都有机型记录；P3-06 读取的机型 f32 字段有限，+0x0C 截断后为正，其余零值不拒绝；玩家机型 +0x88 不为 0，且全部分配等级组合下能量运算不溢出 i32、上限有限；停放 Warp 的计时运算不溢出。错误只带结构路径与稳定原因，不回显导入值；
  - setupHash 在 `MissionSetup` 之后按固定字段顺序覆盖完整 craft-info（含 ID）；`WorldState` 显式保存冻结的机型内容；
  - replay 拒绝同一声明身份下换了 craft-info 的内容。
- **D-04 原因码：** `COMMAND_RESULT_REASONS` 增加 `player-unavailable`、`wrong-context`、`no-target`；比较校验同步。
- **D-06 领域事件：** 按[检查点 A 定稿的形状](../spec.md#检查点-a-定稿的状态与契约)加入 `speed-assist-toggled`、`speed-matched`（`command`/`assist` 两个变体，后者带速度差标志）、`speed-assist-released`、`object-left-world`，以及 [compare.ts](../../../../../src/core/replay/compare.ts) 的事件字段表与校验。本项只定义类型，发出归 12–14。
- **D-05 分区结构：** `flight` 拆为 `{ motion, combat }`，两者各为 `not-implemented` 或各自的 ready 联合；本项两者都保持 `not-implemented`（运动组的就绪归 15，战斗组归 P3-07）。
- **D-07 版本：** `RULES_VERSION` 与 `GAME_SNAPSHOT_VERSION` 相对合入基线各递增一次；replay 格式版本不变（记录形状不变）。本 goal 后续子任务不再递增，20 相对主线复核。
- **D-08 预算：** 检查点 A 核算后 `CORE_LIMITS` 不变（事件界 3,201、请求界 3,138）；更新 `limits.ts` 的依据注释（`pipeline.ts` 中请求上界的注释由 12 更新）。
- **调用者与 test-support：** 更新 Core 测试与 test-support 中的世界创建输入（[create-world.test-support.ts](../../../../../src/core/world/create-world.test-support.ts)、[world.test-support.ts](../../../../../src/core/world/world.test-support.ts)、[replay.test-support.ts](../../../../../src/core/replay/replay.test-support.ts)），合成机型数据用 [rule-data.test-support.ts](../../../../../src/content/rule-data/rule-data.test-support.ts)。执行时若 P3-04 已接入正式 Core，同时更新其调用者，并按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md) 运行其既有合成会话回归。
- **测试：** 创建、各类拒绝（含每条语义检查的边界：+0x0C 为 0、为小于 1 的正数与为 1；其余字段的零值不拒绝）、setupHash 的覆盖与无关性（键序、种子、僚机）、replay 拒绝、原因码与新事件的比较校验、版本拒绝。

## 不包含

- 实体与玩家状态的新字段及实例化（10）；规则系统（11–14）；运动 projection 的数据（15）。
- 修改 `src/content/`（只读消费 `readCraftInfo`）。

## 关键文件与契约

- [create-world.ts](../../../../../src/core/world/create-world.ts)、[setup-check.ts](../../../../../src/core/world/setup-check.ts)、[setup-hash.ts](../../../../../src/core/world/setup-hash.ts)、[world-state.ts](../../../../../src/core/world/world-state.ts)。
- [domain-events.ts](../../../../../src/core/contracts/domain-events.ts)、[limits.ts](../../../../../src/core/contracts/limits.ts)、[projection.ts](../../../../../src/core/projections/projection.ts)。
- [replay.ts](../../../../../src/core/replay/replay.ts)、[recording.ts](../../../../../src/core/replay/recording.ts)、[compare.ts](../../../../../src/core/replay/compare.ts)、[snapshot.ts](../../../../../src/core/replay/snapshot.ts)、[rules-version.ts](../../../../../src/core/replay/rules-version.ts)。
- [craft-info.ts](../../../../../src/content/rule-data/craft-info.ts) 的 `readCraftInfo`、`CraftInfo`。

## 写入范围

- `src/core/contracts/**`：原因码、事件类型、上限。
- `src/core/world/**`：世界创建输入、语义检查、setupHash、世界状态及其测试与 test-support。
- `src/core/replay/**`：replay 内容、录制入口、比较校验、版本及其测试与 test-support。
- `src/core/projections/**`：`flight` 分区结构及其测试。
- `src/core/systems/*.test.ts`：随创建输入更新的测试。
- `src/app/**`、`e2e/**`：仅当 P3-04 已接入正式 Core 时更新调用者与回归。

## 验收标准

- [x] AC-01：合法 craft-info 被严格读取、冻结并保存；缺字段、内容错误、kind/生产 ID/绑定/定稿的数值域不符各在创建前按约定的错误类型拒绝，定稿列为合法的零值不被拒绝；setupHash 随内容变化，与键序、种子、僚机无关；同身份下换 craft-info 的 replay 被拒绝。
- [x] 三个原因码与四个事件类型（`speed-matched` 含两个变体）在类型与比较校验中就位；`flight` 分区拆为两组且都未就绪。
- [x] 快照格式版本与规则版本各递增一次、replay 格式版本不变；旧版本的 replay 记录被拒绝；`CORE_LIMITS` 的依据注释与定稿核算一致。
- [x] `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts` 与 `pnpm check` 通过；P3-04 已接入时其浏览器回归通过。

## 验证方法

- Node 单元测试，合成机型数据；期望不由被测 helper 生成。
- 按 execute-goal 的流程完成 rubber-duck 审查后，以本项写入范围调用 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。
- 浏览器验证仅在 P3-04 已接入时适用。

## 完成证据

- **2026-10-10（worker，基于认领提交 9150e61）：**
  - **D-01 世界创建输入：** 新模块 [craft-info-input.ts](../../../../../src/core/world/craft-info-input.ts)：`readCraftInfoInput` 以 `readExactRecord` 读外层 `{ id, content }`（`CoreInputError`），Asset ID 语法错误保留 `readAssetId` 的 `ContentContractError`，非 `data/` 为 `CoreInputError`，`original-import` 只接受 `data/craft-info`；内容经 `readCraftInfo` 读入冻结、与输入脱离的副本（非有限 f32 由读取器拒绝）。`checkCraftInfo` 在生成状态建成后核对：可实例化的种类取自会投递请求的队列项（请求数 > 0 且触发记录的概率为 100，与 `checkSpawnQueue` 的判定一致：记录项的种类、编组项的全部成员、僚机项的种类位 1），每个都要有机型记录；这些记录的 +0x0C 截断后为正，`+0xA8 × 64` 与 `(+0xA8 + +0xA4) × 64` 在 i32 内；玩家记录 +0x88 不为 0，阈值 chop(+0xB8) × +0x88 与 16 种分配等级组合下的分配和、能量与代码常数之积都在 i32 内（该常数按技术决定 11 作为代码规则在 Core 中实现）。其余零值不拒绝。`CreateWorldInput`（因而 `createRecordingSession` 的输入）与 `ReplayContent` 增加必需的 `craftInfo`；`WorldState.craftInfo` 保存冻结的 `{ id, content }`，不进入快照（由 setupHash 绑定，与 `setup` 相同）。[setup-hash.ts](../../../../../src/core/world/setup-hash.ts) 的规范文本为 `{ setup, craftInfo: { id, content } }`，机型内容的写出器按 `CraftInfo` 的成员类型逐项列出（成员变化即编译失败）；为此把快照的类型化写出器移到 [canonical-text.ts](../../../../../src/core/contracts/canonical-text.ts) 共用。
  - **D-04、D-06：** `COMMAND_RESULT_REASONS` 增加 `player-unavailable`、`wrong-context`、`no-target`；[domain-events.ts](../../../../../src/core/contracts/domain-events.ts) 按定稿形状加入 `speed-assist-toggled`、`speed-matched`（`command`/`assist`）、`speed-assist-released`、`object-left-world`（只定义类型）。[compare.ts](../../../../../src/core/replay/compare.ts) 的字段表按类型与 `speed-matched` 的 `origin` 逐项校验，并校验一个 tick 内的次序：辅助事件 → 命令结果（`speed-assist-toggled` 紧随其结果）→ 手动匹配 → 离开世界的阶段不倒退，辅助事件每 tick 至多一个，手动匹配须在其命令结果之后，每条命令至多一个附加事件；`object-instantiated` 不与它们排序（保持 P3-02 的既有比较行为）。
  - **D-05：** [projection.ts](../../../../../src/core/projections/projection.ts) 的 `flight` 改为 `{ motion, combat }`，两组都为 `not-implemented`；`MotionReady`（`player` 为 null 或定稿的玩家运动读数，含 `SpeedLimitStatus` 与 `speedAssist: { enabled, engaged }`）与 `CombatReady`（保留目标、资源与武器，形状由 P3-07 定稿）只是类型。原 `FlightReady` 删除。
  - **D-07、D-08：** `RULES_VERSION` 与 `GAME_SNAPSHOT_VERSION` 由 1 递增为 2，`GAME_REPLAY_VERSION` 仍为 1。`CORE_LIMITS` 不变，[limits.ts](../../../../../src/core/contracts/limits.ts) 的 `eventsPerTick` 依据注释改为定稿核算（事件 3,201、请求 3,138），`limits.test.ts` 断言两个合计。
  - **测试（合成数据，不读原版文件）：** `create-world.test.ts`（读入、冻结与脱离；外层字段、ID 语法、kind、生产 ID、内容错误与非有限 f32；无机型记录的种类（记录与编组成员）；不投递请求的记录、0 次编组与不触发的模板不被检查；+0x0C 为 0、0.5、−1、−0.5 拒绝，1 与 1.5 接受，未实例化种类与未选僚机的不检查；Warp 计时在 i32 上下界的接受与越界拒绝；能量：+0x88 为 0、阈值越界、非初始等级 3 与 0 上的越界拒绝，积恰在 i32 上界内的能量接受、多 1 拒绝；其余零值接受；setupHash 随 13 种内容改动与 ID 变化而变、与键序、种子、僚机无关）；`replay.test.ts`（同身份下换 craft-info 内容或 ID 被 `record.setupHash` 拒绝；`content.craftInfo` 缺失、语义与内容错误的路径；rulesVersion 1 的旧记录被拒绝）；`compare.test.ts`（新原因码、新事件的往返匹配、差异报告、24 种字段/次序违规）；`domain-events.test.ts`、`limits.test.ts`、`projection.test.ts`、`snapshot.test.ts`（版本 2/2，快照不含机型内容）。
  - **既有测试的调整：** `spawn.test.ts` 的名称池计数测试原用种类位 25 的记录；种类位 25 没有机型记录（D-01 的定稿检查），名称池分支在世界中只剩无候选名的僚机选项能到达，测试改为经僚机到达，循环与重置的覆盖仍在 `name-assignment.test.ts`。
  - **检查：** `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts`：37 个文件 1,112 项通过；`pnpm check`（类型、ESLint、208 个文件 6,495 项测试、生产构建）通过。`pnpm check:compliance` 通过。P3-04 尚未接入正式 Core（`src/app`、`src/ui`、`src/platform`、`e2e` 中没有 `createWorld`、录制或 replay 的调用者），浏览器回归不适用。
  - **rubber-duck：** 两条意见均已采纳：可实例化种类原先包括不投递请求的记录与编组，改为取自会投递请求的队列项并补测试；比较原先接受手动匹配之后的命令结果与先于命令结果的离开世界，改为按阶段校验并补测试。
  - **simplify：** 采纳：i32 判定复用 `toInt32`，删去被能量之积涵盖的多余检查；`TickOrder` 每个结果只建一个、逐 tick 复位，阶段用命名常量并并入同一分派；测试共用 `reversedKeys`、`craftInfoWith` 复用 `craftInfoWithContent`、比较的两张非法表共用断言函数。未采纳：与 `spawn.ts` 的 `firingRecord` 共用触发判定（`src/core/systems/spawn.ts` 不在写入范围，现以注释指向 `checkSpawnQueue`）；把比较的字段表改成通用的变体注册表（目前只有一个多变体事件）；去掉 `speedLimitStatus`（定稿形状要求）。
  - **文档影响：** [Core 模块说明](../../../../engineering/modules/core.md)中世界创建输入、setupHash 覆盖、`WorldState`、原因码、领域事件、`flight` 分区（`FlightReady`）、`RULES_VERSION`（“当前为 1”）与快照版本 1、`ReplayContent` 及“`createWorld` 仍只接收三份逻辑 Asset”等处已过时，[源码结构指南](../../../../engineering/source-structure.md)需加入 `world/craft-info-input.ts`；按 goal 的分工由 19 更新（不在本项写入范围）。原版事实、ADR 与工程约定不受影响。
