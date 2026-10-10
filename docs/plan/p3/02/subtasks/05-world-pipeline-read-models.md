---
type: plan
status: active
phase: P3
task: "02"
subtask: "05"
updated: 2026-10-09
---

# 05 — 世界、实体表、流水线与读模型

**契约来源：** [spec](../spec.md) 的 S-01、S-04、S-05；AC-03（每 tick 推进）、AC-04（命令结果）、AC-09、AC-10；[行为与边界](../spec.md#行为与边界)、[实体与生命周期](../spec.md#实体与生命周期)、[系统流水线](../spec.md#系统流水线)、[Projection 与 Render State](../spec.md#projection-与-render-state)、技术决定 5、6。
**依赖：** 01, 04。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **世界与 step：** 世界对象提供 `step(tickInput)`（返回深度冻结的 `DomainEvent[]`）、`projection()` 与 `renderState()`；快照归 08。世界的内部构造只供 07 的创建与本项测试使用，不导出可注入处理器或任意修改世界的生产入口。
- **每 tick：** 先用 04 的读取函数校验整份输入（失败时世界不变）；tick 加 1；任务流程阶段读取上一采样时间，时钟阶段按 04 的时钟推进；本 tick 输入只在本 tick 内有效，不形成跨 tick 队列。
- **命令结果：** 每个结构合法的命令恰好产生一个 `command-result`，`commandIndex` 正确；本任务没有规则处理器，所有命令为 `rejected` / `not-implemented`，不改状态。
- **实体表（按 01 的 Q-08 与修订后的[实体与生命周期](../spec.md#实体与生命周期)）：** 实体 ID 从 1 起分配、在同一世界内不复用；每个种类位一张按分配次序的表，按掩码遍历时种类位升序；遍历是实时的，遍历中追加到当前或更高种类位的实体在同一遍被访问。实体有原版的对象状态与活动字段；表现在实例化时视为就绪，实体在下一次自身更新进入活动。被毁不等于移除（救援会复用玩家对象）。移除：待移除或区域切换的实体在下一次自身更新时提出移除请求，在该 tick 的请求处理中移除或切换停放，期间仍在种类表中；移除时摘除种类表、清除玩家实体引用，其他引用按 ID 失效，生成计数不减少。实体与生成预算按 `CoreLimits` 检查，超出为内部故障。
- **阶段表（按 01 的 Q-09 与修订后的[系统流水线](../spec.md#系统流水线)）：** 代码中只有一张有序阶段表：输入登记、任务流程、时钟、对象更新与动作意图（实时种类遍历）、派发器规则阶段（生成队列检查只产生请求；请求处理按投递次序处理任务流程、对象更新与生成的请求及处理中新产生的请求，实例化与移除都在此；之后各系统按 Q-09 的固定次序）、帧尾规则推进、提交输出（丢弃请求处理之后提出的请求）。本 tick 的请求列表与事件列表都不跨 tick 保留，不建发布/订阅、持久消息总线或回调注册。请求处理中实例化的实体本 tick 不更新、不参与之后的运动与碰撞。生成请求的内容由 07 填入，这里实现请求处理与移除。尚无规则的阶段不写假系统。
- **故障锁存：** 内部不变量被破坏或执行中耗尽预算时抛出内部故障错误，不返回部分事件；之后的 `step`、`projection`、`renderState`（及 08 的快照）都抛出同一故障。
- **玩家状态：** 玩家实体 ID（未生成时为 null）、视角模式（创建时 0xC）、上一视角模式与子模式；交互上下文由视角模式推出（Warp：0–3；基地：6；地图：8；飞行：其他）。
- **projection：** 深度冻结、与内部状态脱离：
  - `clock`、`mission`、`player` 三个就绪分区；
  - `flight`、`map`、`communications`、`result` 四个分区的类型按 spec 的 ready 形状定义，本任务一律返回 `not-implemented`，不构造空列表、0 值、全图可见或胜利默认值；
  - 不提供全体实体列表。
- **Render State：** tick、视角模式、观察实体 ID（可空），以及按 ID 升序的可呈现实体：ID、`kindBit`、表现判别或模型 Asset ID、位置、姿态、放置序号。被毁未退场与已移除分开。
- **测试：** 阶段次序与事件可见时机；实时遍历（遍历中新分配的高位实体同遍更新）；请求处理次序与之后提出的请求被丢弃；移除时机（更新前标记同 tick、请求处理中或之后标记下一 tick）与引用失效；被毁不移除；停放实体不在 Render State 中；故障锁存且无部分输出；每命令一个结果；读取不改状态哈希、旧输出不随后续 tick 改变；用合成的两帧消费者覆盖新生实体、移除与放置序号变化（不连续移动不插值）。

## 不包含

- 动作的规则效果（P3-06 至 P3-10）；地图开启时屏蔽飞行命令的门禁（P3-09 在接入地图模式时实现）。
- 世界创建、实例化与生成阶段内容（07）；快照、录制与 replay（08）。
- Runtime 的两帧保留与跨运行折叠（P3-04）；Core 模块说明（11）。

## 关键文件与契约

- 04 的 `contracts/`：时钟、输入、事件信封、上限与内部故障错误。
- [rng.ts](../../../../../src/core/determinism/rng.ts)：世界状态持有 RNG 状态。
- 计划新增：`src/core/world/world.ts`、`entity-table.ts`、`player-state.ts`；`src/core/systems/pipeline.ts`；`src/core/projections/projection.ts`、`render-state.ts` 及相邻测试（文件名可调整，职责不变）。

## 写入范围

- `src/core/world/**`：世界、实体表与玩家状态（新建）。
- `src/core/systems/**`：阶段表（新建）。
- `src/core/projections/**`：projection 与 Render State（新建）。

## 验收标准

- [x] AC-03（推进部分）：每次成功的 `step()` 使 tick 加 1、时钟加每 tick 单位数；没有其他推进时钟的公开接口。
- [x] AC-04（结果部分）：每个合法命令恰有一个 `command-result`，均为 `not-implemented`，状态不变；Core 没有跨 tick 的命令或按键队列。
- [x] AC-09：阶段表与请求处理次序符合修订后的 spec 与 Q-09，并有测试固定；请求处理中实例化的实体本 tick 不更新、不参与之后的运动与碰撞；实时遍历、移除时机、引用失效、计数不减与查询筛选符合 Q-08；被毁与移除分开；故障锁存且无部分输出；没有可注入处理器的生产入口。
- [x] AC-10（本项部分）：projection 与 Render State 深度冻结、脱离、读取不改哈希；四个规则分区为 `not-implemented`；停放实体不在 Render State 中；两帧消费者契约测试通过。
- [x] `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts`、`pnpm typecheck`、`pnpm lint` 通过；完成前运行 `pnpm check`。

## 验证方法

- Vitest 单元测试（Node，合成世界状态）；状态哈希用 04 的规范文本临时计算，08 交付正式快照后由 08 复核。
- 不涉及浏览器或原版对照。

## 完成证据

2026-10-09，worker 分支 `exec-p3-02-05`（基于认领提交 `721ffe5`）。

- **实现（全部为新文件）：**
  - [entity-table.ts](../../../../../src/core/world/entity-table.ts)：`Entity`（ID、`kindBit`、带命名空间的 `source`、`NameReference` 封闭联合 none/candidate/pool/craft-type、`EntityPresentation`（当前只有 `{ type: 'model', model }`）、位置、`Matrix3` 按行姿态、`placementSerial`、原版对象状态 `ObjectState` 八值与活动 `Activity` 三值、被毁标志 `destroyed`）、`EntityInit`、`initialState`、`isActiveState`（原版状态 ≥ 7）、`isLive`（排除被毁与待移除，同 `0x69a70`）与 `EntityTable`。`allocate` 按 Q-08 追加到种类表尾、ID 从 1 起不复用，复制并冻结来源/名称/表现/位姿；种类位越界或位姿非有限为 `invariant-violated`，超出 `CORE_LIMITS.entities`（按存活数）或 ID 越过安全整数为 `budget-exhausted`。`walk(mask)` 按种类位升序、表内按分配次序且为实时遍历；`remove` 只在请求处理中调用，遍历进行中移除为故障；`byId()` 按 ID 升序。
  - [player-state.ts](../../../../../src/core/world/player-state.ts)：`PlayerState`（实体 ID、视角模式、上一视角模式、子模式），创建值 `{ null, 0xC, 0xC, 0 }`（上一视角模式与子模式的创建值在注释中说明对规则不可观察）；`interactionContext` 按 `0x26284` 推出 warp（0–3）、base（6）、map（8）、flight。
  - [world-state.ts](../../../../../src/core/world/world-state.ts)：`WorldConfig`（任务、组、槽位、原始难度、僚机、种子、每 tick 单位）、`MissionStatus`（当前只有 `built`，对应状态字节 1）、`WorldState` 与 `createWorldState(config)`（tick 0、时钟 0、RNG 状态 = 种子、无实体、视角 0xC）。
  - [pipeline.ts](../../../../../src/core/systems/pipeline.ts)：唯一的冻结阶段表 `PIPELINE`，19 个阶段依次为 input-registration、mission-flow、clock、object-update、communications-reply、spawn-queue-check、request-handling、movement、collision、delayed-player-explosion、energy、object-sets、parked-update、warp-completion、base-interior、mission-teardown、area-check、frame-end、commit；只有 input-registration、clock、object-update、request-handling、commit 有实现，其余 `run: null` 并在注释中写明原版地址与负责任务。`registerTick` 在第一次改动前完成可拒绝的检查（`advanceTime` 越界、`nextId + CORE_LIMITS.entities` 越过安全整数）；任务流程读上一时钟，时钟阶段写新时钟。对象更新先在玩家更新位置按数组顺序为每个命令发出 `rejected`/`not-implemented` 结果，再做实时种类遍历的通用转换（新建且停放或表现就绪 → 请求 active；area-switch/pending-removal → 请求离开；destroyed-source 不更新；非停放的 new 为故障）。`RequestQueue` 按投递次序处理并在同一遍处理处理中新投递的请求，处理后投递的请求不处理即丢弃；离开请求对 area-switch 切换停放并重置状态，否则移除并清除指向该实体的玩家引用；主体已移除的请求丢弃。`emit` 存入深度冻结的脱离副本；事件与请求都受 `CORE_LIMITS.eventsPerTick` 约束，超出为 `budget-exhausted`。
  - [world.ts](../../../../../src/core/world/world.ts)：`World { step, projection, renderState }` 与内部构造 `constructWorld(state)`（不接受处理器，供 07 与测试）。输入错误与 `registerTick` 的 `CoreInputError` 不改世界、不锁存；其他任何错误在 step 或读取中锁存为故障（非 `CoreFaultError` 包装为 `invariant-violated`，`site` 为 `world.<方法>`，`cause` 保留原错误），之后三个方法都抛出同一个错误实例。
  - [projection.ts](../../../../../src/core/projections/projection.ts)：`projectWorld` 返回深度冻结的 clock、mission（含僚机选择与任务状态）、player（含交互上下文）三个就绪分区，以及 flight/map/communications/result 四个 `{ readiness: 'not-implemented' }` 分区；四个分区的 ready 形状按 spec 表定义类型，spec 留给负责任务研究的部分（资源名、武器记录引用、地图标记分类与可见性、菜单内容引用、选项不可用原因、结果原因与消息引用）为 `never`，须由负责任务修订 spec 后才能就绪。不提供实体列表。
  - [render-state.ts](../../../../../src/core/projections/render-state.ts)：`renderWorld` 返回 tick、视角模式、观察实体（玩家实体 ID）与按 ID 升序的实体（ID、`kindBit`、表现、位置、姿态、放置序号），排除停放实体；被毁（标志或 destroyed-source）实体在移除前保留，移除后消失。
  - [world.test-support.ts](../../../../../src/core/world/world.test-support.ts)：合成配置与实体、`stateText`（以 04 的规范文本临时序列化全部世界状态，正式快照由 08 交付后复核）与故障断言 helper。
- **检查（全部通过）：**
  - `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts`：24 个文件、687 个测试；新增 88 个：[entity-table.test.ts](../../../../../src/core/world/entity-table.test.ts) 16、[player-state.test.ts](../../../../../src/core/world/player-state.test.ts) 15、[world.test.ts](../../../../../src/core/world/world.test.ts) 23、[pipeline.test.ts](../../../../../src/core/systems/pipeline.test.ts) 26、[projection.test.ts](../../../../../src/core/projections/projection.test.ts) 4、[render-state.test.ts](../../../../../src/core/projections/render-state.test.ts) 4。
  - `pnpm typecheck`、`pnpm lint` 通过（正式/合成边界规则覆盖新模块）；`pnpm check` 通过（168 个测试文件、4914 个测试，生产构建成功；构建的大 chunk 提示与 typescript-eslint 弃用警告为既有输出）。
  - AC-03：2 与 4 单位/tick 下每次 step 后 projection 的 tick/时钟为 n 与 n × 单位；世界原型只有 `step`、`projection`、`renderState`；tick 在 `MAX_SAFE_INTEGER`、时钟在 `MAX − 1`、`nextId` 在 `MAX − 2047`（以种类表子类模拟）时以 `CoreInputError` 拒绝且状态文本不变，`MAX − 2048` 时可推进。
  - AC-04：16 种命令各一个（与 `COMMAND_TYPES` 相等）加重复命令，各得一个 `commandIndex`、`commandType` 正确的 rejected/not-implemented 结果，事件深度冻结；与不带命令的同一世界状态文本相同；下一 tick 没有上一 tick 的结果；缺字段、NaN、未知命令、稀疏数组、65 个命令都以 `CoreInputError` 拒绝且状态不变，之后照常推进。
  - AC-09：阶段表次序与“只实现 P3-02 所有阶段”有测试固定，`runTick` 与逐阶段执行结果相同；任务流程看到上一时钟；命令结果在对象更新中发出、之后阶段可见；请求次序为任务流程、对象更新、生成队列检查（以最终状态区分），处理中投递的请求同遍处理，处理后投递的被丢弃且不进入下一 tick；实时遍历（遍历中追加到更低、当前、更高种类位）、嵌套遍历中移除为故障；更新前标记的同 tick 移除，请求处理中或之后标记的下一 tick 移除，期间仍在种类表中；移除后 ID 查不到、不复用、`nextId` 不减，玩家引用只在移除该实体时清除（另一个种类位 0 的实体被移除时不清除）；area-switch 在 active/docked/parked 间切换并从 new/presentation-ready 重新开始；被毁与 destroyed-source 不被移除，destroyed-source 不更新；请求处理结束时（以 movement 前的替身）实例化的实体本 tick 为 presentation-ready、不算活动，下一 tick 才变为 active；非停放的 new、预检中时钟或步长不合契约、遍历中的 TypeError、读取中的异常都锁存且之后抛出同一实例；容量上限（实体 2048、事件与请求 4096）的 limit/limit + 1。生成请求经请求处理实例化的端到端测试由 07 补上。
  - AC-10（本项部分）：事件、projection、Render State 深度冻结；读取前后状态文本不变；后续 tick 改动位置、序号、视角与移除后旧输出的 JSON 不变；每次读取返回新副本；四个规则分区为 `not-implemented` 且 projection 不含实体信息；停放实体不在 Render State 中，切换为活动后出现；合成两帧消费者覆盖连续移动插值、移除不再绘制、新 ID 与放置序号变化只用当前位置。
- **rubber-duck：** 六项中采纳五项。① `emit` 原只冻结数组：改为存入深度冻结的脱离副本，并加嵌套 `object-instantiated` 事件的回归；② `step` 预检中的内部故障原不锁存：预检改由 `registerTick` 完成，`CoreInputError` 直接抛出、其他错误锁存，并加时钟与步长不合契约的测试；③ Q-09 已确认的 `0x2ede0` 原只写在注释：在 energy 与 parked-update 之间加入 `object-sets` 空位（未分析，暂无负责任务）；④ 玩家引用原按种类位清除：改为只在移除被引用的实体时清除，加回归；⑤ 实例化时机测试原在 spawn-queue-check 阶段分配：改在请求处理结束后分配，并注明真实的生成请求路径由 07 测试。未采纳：为请求单独设上限（`contracts/` 不在本项写入范围），改为在注释中写明以 `eventsPerTick` 兜底的依据与扩展条件，见下方交接。
- **simplify：** 采纳：请求上限改用 `fitsLimit`；`RequestQueue` 处理后的投递直接丢弃，去掉 `discard` 与已处理计数；预检集中到流水线的 `registerTick`，世界只负责锁存；Render State 直接共享分配时已冻结的表现对象；事件副本改用直接循环；删去未使用的 `PLAYER_KIND_BIT` 并缩短流水线模块注释。未采纳：删去四个分区的 ready 类型或 player 分区的交互上下文（本项与 spec 要求）；用单一 ID 表按种类过滤代替种类表（spec 要求每个种类位一张有序表，且遍历成本更高）；缓存 projection/Render State、批量移除的 O(n²)、生成器遍历的开销（规模有界，清晰优先）；把命令判定移入遍历中的玩家实体（目前无行为差别，由接入命令规则的任务决定）；按实际分配量预检 ID（无法预知，保守上界不可达）。
- **文档影响：** 本项写入范围不含文档；未改原版事实、U 项、STATUS 或阶段索引。
  - 需由 11 写入 [Core 模块说明](../../../../engineering/modules/core.md)：`World`、`constructWorld`（内部）、`WorldConfig`/`WorldState`/`createWorldState`/`MissionStatus`；`EntityTable`（`allocate`、`get`、`remove`、`walk`、`byId`、`nextId`、`size`）、`Entity`/`EntityInit`/`ObjectState`/`Activity`/`NameReference`/`EntityPresentation`/`Matrix3`、`initialState`/`isActiveState`/`isLive`、`ALL_KINDS`；`PlayerState`/`createPlayerState`/`interactionContext`/`COCKPIT_VIEW_MODE`；`PIPELINE` 阶段表及各空位的负责任务、`registerTick`/`runTick`/`TickContext`/`emit`/`Request`/`RequestQueue`；`Projection` 各分区与 ready 类型中的 `never` 占位；`RenderState`/`RenderEntity`；故障锁存（同一实例重抛；`world-faulted` 原因码未被 05 使用）；请求上限借用 `eventsPerTick` 的依据。
  - [源码结构指南](../../../../engineering/source-structure.md)：`core/world/`、`core/systems/`、`core/projections/` 已交付。
  - 提请协调者决定是否同步 spec：系统流水线第 5 行的列举未含 Q-09 已确认的 `0x2cd60`（到期的通讯回复，P3-10）与 `0x2ede0`（未分析），阶段表按 Q-09 为两者保留了空位；若规则任务的请求会扇出，宜在 `CoreLimits` 中增设请求上限。

