---
type: plan
status: active
phase: P3
task: "08"
subtask: "12"
updated: 2026-10-15
---

# 12 — 契约基础

**契约来源：** [spec](../spec.md) 的 S-01、AC-01、AC-11；[共享契约修订](../spec.md#共享契约修订p3-02)；08 定稿的 [P3-02 修订](../../02/spec.md)。
**依赖：** 08。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 按 D-01 的定稿实现共享形状，不实现规则：
  - [entity-table.ts](../../../../../src/core/world/entity-table.ts)：`AiMode` 扩展、AI 控制器的封闭联合、待处理命令单槽，实体校验与复制；
  - [world-state.ts](../../../../../src/core/world/world-state.ts)：脚本解析缓存、执行实例、友伤累计、对象集合与可见性历史的状态及新世界初值；
  - [domain-events.ts](../../../../../src/core/contracts/domain-events.ts)：D-01 定稿的新事件与原因；
  - [pipeline.ts](../../../../../src/core/systems/pipeline.ts)：`Request` 联合加入新请求的形状（处理器由各规则子任务接入，未接入的请求类型不能被投递）；
  - [limits.ts](../../../../../src/core/contracts/limits.ts)：定稿的预算及推导注释；
  - [snapshot.ts](../../../../../src/core/replay/snapshot.ts)、[compare.ts](../../../../../src/core/replay/compare.ts)：新状态的写入与新事件的字段表；
  - [rules-version.ts](../../../../../src/core/replay/rules-version.ts)：`RULES_VERSION` 相对实现时的当前值递增一次，快照格式按状态形状递增；此后本 goal 内的规则变化沿用这一版本；
  - [game-event-bus.ts](../../../../../src/app/runtime/game-event-bus.ts)：`EVENT_TYPES` 同步新事件。
- 测试：形状校验、快照写入与冻结、比较器字段、旧规则版本 replay 拒绝；更新随已批准变化而改变的旧断言，保留纯度、原子拒绝与冻结不变量。

## 不包含

- 任何 AI 规则（14 起）；内容导入（13）。

## 关键文件与契约

- 见工作范围中的现有文件；全部为已有文件，测试与源码相邻。

## 写入范围

- `src/core/world/entity-table.ts`：控制器与模式。
- `src/core/world/entity-table.test.ts`：形状与复制测试。
- `src/core/world/world-state.ts`：世界级 AI 状态。
- `src/core/contracts/domain-events.ts`：新事件。
- `src/core/contracts/domain-events.test.ts`：事件测试。
- `src/core/contracts/limits.ts`：预算。
- `src/core/contracts/limits.test.ts`：预算测试。
- `src/core/systems/pipeline.ts`：请求联合。
- `src/core/replay/snapshot.ts`：快照写入。
- `src/core/replay/snapshot.test.ts`：快照测试。
- `src/core/replay/compare.ts`：事件字段表。
- `src/core/replay/compare.test.ts`：比较测试。
- `src/core/replay/rules-version.ts`：版本递增。
- `src/core/replay/replay.test.ts`：旧版本拒绝。
- `src/app/runtime/game-event-bus.ts`：事件类型清单。
- `src/app/runtime/game-event-bus.test.ts`：清单测试。
- `src/ui/dev/event-log.ts`：新事件的诊断字段。
- `src/ui/dev/event-log.test.ts`：诊断字段测试。
- `src/core/rules/initial-ai.test.ts`：`program` 初值随 CR-16 改变的断言。
- `src/core/systems/spawn.test.ts`：同上。
- `src/core/rules/combat-init.test.ts`：同上。
- `src/core/replay/budget.test.ts`：快照尾部字段与 CR-25 的大小核对。
- `src/core/replay/map-warp-replay.test.ts`：规则版本断言。
- `src/core/systems/pipeline.test.ts`：未接入请求类型的拒绝。
- `tools/replay-check.ts`：录制大小上界中新事件的最长形式。
- `tools/replay-check.test.ts`：同上的测试。

## 验收标准

- [x] AC-01 的类型、校验、序列化、比较器一致；版本按实际变化递增；旧规则的 replay 拒绝且不执行。
- [x] 新状态都进入快照，无开放字段；既有不变量的测试通过。
- [x] `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts` 与 `pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- 受影响测试文件先跑，再跑上列命令；按 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 清理本项范围。

## 完成证据

- **基线与复用（2026-10-15）：** 以合入 P3-09、P3-10 后的分支为基（`73575b2d`、`c586d699` 只改本文件的写入范围）。按协调者的 D-03 决定（09 已定稿为 CR-27–CR-29）复用而不重建：友伤累计只用 CB-05 的 `WorldState.ai.friendlyFire`（P3-10 写，P3-08 只读）；对象集合与 `mapVisible` 只用 MW-06 的 `WorldState.objectSets`、`Entity.mapVisible`，不加 CR-19 原文的副本；命令单槽用 CB-04 的 `ai.pendingCommand`，投递用 CB-08 的 `deliver-command`，回复用 CB-06 的 `queueLine`，均不另建。
- **实现（只有形状，没有规则）：**
  - [entity-table.ts](../../../../../src/core/world/entity-table.ts)：`AiState.program`（CR-16 的封闭联合 `none`/`table`/`built-in`，控制器为 null 表示未安装）、`AiControllerCommon`（周期、限值、三通道扳机、AI 锁定、自动挂点、交战计时、攻击航线、转向块 S 含持久的 CB）、`TableController`（`interpreter`/`parked`）与 `BuiltInController`（`wingman`/`base`/`parked`），CR-17 的 `InterpreterState`、`ExecutionState`（返回栈 ≤ `RETURN_STACK_DEPTH` 8）、`WingmanState`、`BaseState`；`isValidAiProgram(kindBit, slot)` 供写入槽的规则校验（玩家、种类 `0x4000` 与运行时种类只能为 `none`，处理器须为槽类型允许的，各字段在其范围内）；`clearedControllerCommon()` 为 `0x5dc0c` 清零后的初值。`AiMode` 按 CR-18 不变。分配器与实例化写 `program: none`，分配时非 `none` 为 `entities.flight` 故障。种类 `0x4000` 的 `transponder`（CR-20）：声明的为 `declaration`/`none`；构造的须无来源、为分配器的其他字段，`player` 的 `b` 随来源活动（活动时 `first-update`，否则停放、`none`），`wingman` 的投放只在停放时、`none`；违反为 `entities.transponder` 故障。`ruleInputs` 改为可整体替换（CR-16：`0x5e4d0` 改写负的 +0xE0），`lastParkedUpdateClock` 与锁定字段的注释按 CR-21、CR-16 更新。
  - [world-state.ts](../../../../../src/core/world/world-state.ts)：`WorldAi.parseCache`（CR-19：按脚本序号的 `ParsedScript { script, uses, items }` 与封闭的 `ParsedArgument`），新世界为空。
  - [domain-events.ts](../../../../../src/core/contracts/domain-events.ts)：`wingman-command-consumed`、`transponder-deployed`（CR-22）、`WINGMAN_COMMAND_OUTCOMES` 与 `isWingmanCommandReply`（CR-22 结果映射表，比较器与 20 共用）。
  - [pipeline.ts](../../../../../src/core/systems/pipeline.ts)：`Request` 加入 `ai-match-speed`、`warp-departure`、`create-transponder`（CR-21），`steer` 的注释放宽到机体；处理器未接入的类型在 `post`/`defer` 时即为 `pipeline.request-unwired` 故障（`UNWIRED_REQUESTS`，接入的子任务移除其类型）。
  - [limits.ts](../../../../../src/core/contracts/limits.ts)：`requestsPerTick` 16,384 → 32,768，新增 `aiDispatchesPerRun` 1,024、`aiDispatchesPerTick` 131,072，事件、请求与快照长度的推导注释按 CR-25 并入合并后的数值（请求 7,559、事件 9,064）。
  - [snapshot.ts](../../../../../src/core/replay/snapshot.ts)：写入 `program`（每种处理器一个成员表）、`transponder`、`parseCache`；快照格式 5 → 6。[rules-version.ts](../../../../../src/core/replay/rules-version.ts)：`RULES_VERSION` 6 → 7。replay 格式（2）不在此递增：`drop-transponder` 命令由 22 加入 `tick-input.ts`，届时按 CR-25 递增为 3。
  - [compare.ts](../../../../../src/core/replay/compare.ts)：两个事件的字段表与读取（码、路径、结果与回复线须符合映射表；`issuedTick` 在 [1, tick − 1]；部署的位姿为 f32），一个 tick 内每个僚机至多消费一次且在对象更新阶段，部署在请求处理阶段且不多于此前的命令结果数。
  - [game-event-bus.ts](../../../../../src/app/runtime/game-event-bus.ts)、[event-log.ts](../../../../../src/ui/dev/event-log.ts)、[replay-check.ts](../../../../../tools/replay-check.ts)：事件清单、诊断字段与最长形式（录制大小上界不变）。
- **测试：** entity-table（槽与控制器的接受与 27 种拒绝、清零初值、种类 `0x4000` 的状态与 12 种拒绝、`ruleInputs` 的替换）；snapshot（版本 6/7，控制器、私有状态、Xpon 与解析缓存的每个叶子都改变文本，各变体与空值各有文本）；compare（字段比较、映射表 28 个合法组合与 21 种拒绝）；domain-events、game-event-bus、event-log；limits（新预算与推导）；replay（规则版本 6 的记录在执行前拒绝）；pipeline（三种未接入请求在 `post`/`defer` 时故障且不入队）；budget（实体上限下最长控制器每个 2,908 字符，`spawnExpansion` 个机体加内容上限的解析缓存仍在 `canonicalTextLength` 内）；initial-ai、spawn、combat-init、map-warp-replay 中随 `program` 与版本改变的断言。
- **检查：** `pnpm check` 通过（typecheck、lint、321 个测试文件 9,577 项、生产构建），含 `src/core` 与 `tools/engineering-boundaries.test.ts`。
- **rubber-duck：** 两项均采纳——构造 Xpon 的创建路径与活动、回调的组合改为精确校验；部署事件的位姿按 f32 校验。simplify：采纳共享的 `ScriptDeadline`、`isUpTo` 复用、回调复制简化、映射表移入 domain-events、删去请求处理中重复的未接入分支；未采纳：合并两个控制器联合（D-01 的形状）、去掉运行时长度守卫、把 `ControlBlock` 移出 pipeline（需改范围外的 steering/guidance/missiles）。
- **与 D-01 的差异（交协调者记录）：** CR-20 要求“无来源的机体只能是构造的 Xpon”，表未强制：共享测试实体 `entityInit`（world.test-support.ts）对各种类都建无来源机体，强制会使约 60 个范围外测试文件失效；只强制种类 `0x4000` 的状态。CR-19 的 `mapVisible` 写为源记录 +0x7C ≠ 0 与 MW-06 的 false 不同，已由 CR-29 以 MW-06 为准。
- **容量风险（交 23）：** 全部数取最长文本时，P3-07 的 18 挂点战斗状态、`spawnExpansion` 个最长控制器（2.8 MiB）与内容上限的解析缓存（约 2 MiB）合计约 16.6 MiB，略超 `canonicalTextLength`（16 MiB）；按 CR-25 的典型值约 14.3 MiB。budget.test 只覆盖不含挂点的组合。
- **文档影响：** [Core 模块说明](../../../../engineering/modules/core.md) 中的 `RULES_VERSION` 6、快照格式 5、`requestsPerTick` 16,384 与请求清单已过时，不在本项写入范围，交 28（其范围含 core.md）或协调者；STATUS 的版本数字见交接。

