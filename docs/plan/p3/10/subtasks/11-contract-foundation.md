---
type: plan
status: active
phase: P3
task: "10"
subtask: "11"
updated: 2026-10-14
---

# 11 — 共享契约实现

**契约来源：** [spec](../spec.md) 的 S-01、AC-01；D-01 定稿后的 [P3-02 spec](../../02/spec.md) “P3-10 的契约修订”节。
**依赖：** 08。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 按 D-01 定稿实现共享类型与读写：任务内子状态、玩家/实体/世界的新字段及初值、新请求类型、领域事件与命令原因码、`communications` 分区的判别与就绪形状（就绪内容由 19 填）、`CORE_LIMITS` 的新上限。
- 快照写入器、比较器的逐字段读取与事件字段表、`RULES_VERSION` 与按实际兼容性决定的快照/replay 格式版本（相对实际集成基线各递增一次；本任务后续子任务不再递增，除非与其他任务合并时另行处理）；旧规则版本在任何 tick 之前拒绝。
- 更新因已批准变化而改变的既有断言（`not-implemented` 的分区与命令断言），保持纯度、原子拒绝、生命周期与冻结不变量；合成 Core 行为不变。

## 不包含

- 规则输入的接线（12）与各规则（13 起）；分区就绪内容（19）。

## 关键文件与契约

- [domain-events.ts](../../../../../src/core/contracts/domain-events.ts)、[limits.ts](../../../../../src/core/contracts/limits.ts)、[player-state.ts](../../../../../src/core/world/player-state.ts)、[world-state.ts](../../../../../src/core/world/world-state.ts)、[entity-table.ts](../../../../../src/core/world/entity-table.ts)、[projection.ts](../../../../../src/core/projections/projection.ts)、[snapshot.ts](../../../../../src/core/replay/snapshot.ts)、[compare.ts](../../../../../src/core/replay/compare.ts)、[rules-version.ts](../../../../../src/core/replay/rules-version.ts)。
- 请求联合在 [pipeline.ts](../../../../../src/core/systems/pipeline.ts) 的 `Request`；本项只加类型与校验，处理由 14、16、18 接入。

## 写入范围

- `src/core/contracts/**`：事件、原因码、上限与测试。
- `src/core/world/player-state.ts`、`src/core/world/world-state.ts`、`src/core/world/entity-table.ts` 及其测试：新字段与初值。
- `src/core/world/world.test-support.ts`、`src/core/world/world.test.ts`：辅助与已批准变化的断言。
- `src/core/projections/**`：分区判别与测试。
- `src/core/replay/**`：快照、比较器、版本与测试。
- `src/core/systems/pipeline.ts`、`src/core/systems/pipeline.test.ts`：请求类型的联合与校验。
- `src/core/systems/commands.test.ts`：已批准变化的断言。
- `src/app/runtime/game-event-bus.ts`、`src/ui/dev/event-log.ts`、`src/ui/dev/event-log.test.ts`：事件类型的穷举表。
- `tools/replay-check.ts`、`tools/replay-check.test.ts`：最长事件形式与录制上限的推导。
- `src/core/rules/initial-ai.test.ts`、`src/core/rules/combat-init.test.ts`、`src/core/systems/spawn.test.ts`：`AiState.pendingCommand` 的期望字面量。

## 验收标准

- [x] 类型、读取器、序列化与比较器与 P3-02 定稿一致；无开放字段或 `unknown` 载荷。
- [x] `RULES_VERSION` 与实际不兼容的格式版本已递增；旧规则 replay 在 step 前拒绝。
- [x] 既有不变量的测试保持通过，已批准变化的旧断言随之更新；合成 Core 行为不变。
- [x] 本项相邻测试、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- `pnpm exec vitest run` 跑本项相邻测试，再跑 `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts`；`pnpm typecheck` 与 `pnpm lint` 通过。
- 对照 P3-02 定稿逐字段核对快照与比较器；构造坏版本录制断言 step 前拒绝。
- 完成前按 execute-goal 做一次 rubber-duck 审查，并以本项写入范围调用 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据

- **实现（基线 `39739979`，提交前快进到目标分支 `0d99cfbd`，其中含 29 的 `comm-messages`）：**
  - CB-02、CB-05、CB-11：[world-state.ts](../../../../../src/core/world/world-state.ts) 的 `MissionSubState`（0、3、4、5）、`MissionFlow`（`mainState` 3、子状态 0、期限 0）、`MessageIdentity`、`SpeakerSnapshot`、`RadioCallback`、`RadioItem`、`IncomingChannel`、`WorldCommunications`（空队列、`idle`、3 + 5 个未占用头像、四个限频 0、`tailCheck` 0/false/false）、`WorldAi`（友伤 0、0）与 `BaseService`（初值 null），`createWorldState` 写入初值。
  - CB-02、CB-03：[player-state.ts](../../../../../src/core/world/player-state.ts) 的 `dockingObject`、`communications`（菜单联合 `CommunicationsMenu`、`MenuItem`、`CategoryValue`、`ObjectValue`、`CommandValue`、`MenuExit`、`MenuCommandTable`，伙伴、两个保存页、两个时戳、感谢计数）与 `docking.savedPose`（`Pose`）；[pipeline.ts](../../../../../src/core/systems/pipeline.ts) 的 `leave()` 在移除玩家实体时按生命周期表清空停靠对象、菜单、伙伴与菜单保存页，其余保留。
  - CB-04：[entity-table.ts](../../../../../src/core/world/entity-table.ts) 的 `AiState.pendingCommand`（`PendingCommand`）与 `Entity.communications`（`EntityCommunications`）；分配器与 `allocatorAiState()` 写 null，分配输入带待处理命令为 `entities.flight` 故障。
  - CB-07、CB-08、CB-13：[domain-events.ts](../../../../../src/core/contracts/domain-events.ts) 的原因码 `subsystem-disabled` 与 13 种事件（`DepartedEvent` 按 `origin` 判别）；`Request` 增加 `deliver-command`、`dock`、`depart`（两种来源）、`base-navigate`、`base-confirm`。这些请求在 14、16、18 之前没有投递者，到达请求处理即为 `requests.<type>` Core 故障。
  - CB-14：[projection.ts](../../../../../src/core/projections/projection.ts) 的 `CommunicationsProjection`、`CommunicationsPlayer`、`MenuContentReference`、`CommunicationsMenuView`、`CommunicationsOption`、`IncomingView`、`BaseServiceView`，取代占位的 `CommunicationsReady` 与 `OptionUnavailableReason`。分区值仍为 `not-implemented`，就绪内容归 19。
  - CB-16：[limits.ts](../../../../../src/core/contracts/limits.ts) 的 `radioQueueItems` = 4,096 与依据，事件与请求上界注释（640 / 8,900；131 / 3,654）。[snapshot.ts](../../../../../src/core/replay/snapshot.ts) 覆盖全部新状态（菜单值与通道按判别分派），快照格式版本 3 → 4，[`RULES_VERSION`](../../../../../src/core/replay/rules-version.ts) 4 → 5。replay 格式版本仍为 2（记录形状不变）。
  - 比较器 [compare.ts](../../../../../src/core/replay/compare.ts)：13 种事件的字段表与逐字段读取。消息身份按 29 的 `COMM_MESSAGES_LIMITS` 取头像与序号上界，帧时长至多 32 帧（协调者确认的方案 A，29 的读取器限 8 帧）；`radio-queued` 的 `head` 当且仅当回调为 `docking-reply`。每 tick 次序检查 CB-13 的以下各项：
    - 阶段：`mission-flow` 在速度辅助之前，`communications-reply` 在对象更新与请求处理之间，呈现子步在帧尾之后。
    - 停靠请求：`docking-requested` 紧随其命令的 `left-page-changed`。
    - 计数：每条命令至多一个请求阶段事件；`docked` 至多 1 个，`departed` 与 `transition` 各至多 2 个，`radio-flushed` 至多 2 个，取出至多 1 次；`mission-flow` 与停靠门禁的取消各至多 1 个。
    - 衔接：每个 `docked`、`departed` 后紧跟其 `transition`，tick 结束时也检查。
    - 来电：有取出的 tick 不开始也不结束来电；开始不晚于结束，同 tick 开始并结束的必须是同一条消息且各帧时长为 0。
    - 清空：`invalid-object` 取消紧随清空。
  - 范围扩大（协调者批准）：
    - [game-event-bus.ts](../../../../../src/app/runtime/game-event-bus.ts) 与 [event-log.ts](../../../../../src/ui/dev/event-log.ts) 的事件穷举表加入 13 种事件；事件日志的消息写作 `表/头像#序号`，说话者带名称引用。
    - [replay-check.ts](../../../../../tools/replay-check.ts) 的最长事件形式加入 13 种事件；`hit` 仍最长，`RECORDING_MAX_BYTES` 不变（427,820,671）。
    - 三个测试文件的 AiState 期望字面量加入 `pendingCommand: null`。
- **测试：** `pnpm check` 通过（282 个文件，8,539 项，生产构建成功）；`pnpm exec vitest run src/core tools/engineering-boundaries.test.ts` 通过（80 个文件，2,424 项）。新增或更新的测试：
  - **契约与状态：**
    - domain-events.test.ts：原因码、事件联合与 13 种事件的往返，以及判别字段的类型约束。
    - limits.test.ts：新上限名单、limit 与 limit + 1，CB-16 的上界算式。
    - player-state.test.ts、entity-table.test.ts：初值、分配写 null、带命令的分配被拒，以及原位写入互不影响。
  - **投影：** projection.test.ts 检查分区类型。
  - **快照：**
    - snapshot.test.ts：版本 4 与 5、状态成员次序与初值；覆盖测试中每个新叶值改变规范文本，另覆盖其他菜单与通道变体，以及空菜单、无位姿、无基地服务。
    - budget.test.ts：实体的通讯字段至多 72 字符，待处理命令不计入 P3-06 的 1.5 KiB；4,096 个最长队列项后的快照仍在 `canonicalTextLength` 之内。
  - **比较器：** compare.test.ts 覆盖 P3-10 事件的往返匹配、逐字段差异、各项非法值与上述次序约束，以及 `COMM_MESSAGES_LIMITS.frames` ≤ 32。
  - **replay 与流水线：**
    - replay.test.ts：规则版本 4 的记录在执行前被拒。
    - pipeline.test.ts：六种新请求均为 Core 故障；移除玩家时的清空与保留。
  - **范围扩大的消费者：**
    - event-log.test.ts：13 种事件的摘要。
    - replay-check.test.ts：最长事件按合法次序通过 Core 的读取器，`RECORDING_MAX_BYTES` 仍等于推导值。
- **改造前后对照：** 在 `39739979` 与本改动上各跑同一合成脚本：两个世界（僚机 0 每 tick 64 单位；无僚机每 tick 2 单位）各 400 tick，含全部命令类型。事件流逐项相同（1,887 与 1,919 个事件，各 1,669 个命令结果）；最终快照去掉 P3-10 的新成员后完全相同。
- **rubber-duck：**
  - **采纳：**
    - 次序与计数：`radio-flushed` 上限改为 2，`transition` 计数上限 2；有取出的 tick 不得有来电开始或结束；同 tick 开始并结束须同一消息、零时长。
    - 字段一致性：`head`/`docking-reply` 必须一致；消息身份按读取器上界校验，原测试夹具随之拆到三个 tick。
  - **未采纳：**
    - 按所选内容的子表大小（5×5、3×22、5×61、85）校验：比较器不知道内容，只按读取器的结构上界校验。
    - 非命令 `left-page-changed` ≤ 8：这是 CB-16 的预算估计，P3-07 与 P3-09 也写无命令的页，不是可校验的不变量。
- **simplify：**
  - **采纳：**
    - 比较器以 `switch` 分组分派 P3-10 事件，代替运行时类型列表，漏列时编译失败。
    - 计数键改为 `CountedEvent` 类型；空值行号读取合并为 `readNullableRow`。
    - 事件日志的说话者复用 `describeName`。
  - **未采纳：**
    - 把 `NameReference` 读取器移到 entity-table.ts：比较器的读取器都在本文件，沿用这一模式。
    - 合并 `departed` 的两种来源：CB-13 定稿为判别联合。
    - 快照的菜单值与通道改用逐变体的 `object<>`：与既有 `name`、`presentation` 写入器同一形式。
    - 把流水线的新请求并入 `switch`：其前的实体解析需要 `entityId`，`deliver-command` 没有。
- **文档影响：** [core.md](../../../../engineering/modules/core.md) 中的 `RULES_VERSION`、快照与 replay 版本、上限表、请求、事件、原因码与 `communications` 分区已不准确，按 goal 由 27 统一更新，本项不改。replay-check 的上限不变，[工具指南](../../../../guides/tools.md)不需更新。没有新的原版事实，`docs/original/` 与 U 项不变。
