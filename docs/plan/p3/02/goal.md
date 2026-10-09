---
type: plan
status: accepted
phase: P3
task: "02"
updated: 2026-10-09
related: [ADR-0004, ADR-0006, ADR-0015, ADR-0017, B-006, U-009, U-021, U-022, U-023]
---

# P3-02：Core 正式契约与任务实例化 — Goal

## 目标与来源

实现用户于 2026-10-09 批准的 [spec](./spec.md) 中的 S-01 至 S-10 与 AC-01 至 AC-16：

- 原版研究 Q-01 至 Q-11，事实写入 `docs/original/`；
- 正式 Core 契约：错误与上限、时钟、设备无关的动作输入与命令结果、领域事件、规范文本；
- 世界、实体表、固定流水线、projection 与 Render State；
- 放置服务与坐标换算；由 `MissionSetup` 创建世界，任务实例化与僚机门禁；
- 带版本的快照、哈希、录制、replay 与比较；
- 真实内容本地核对与原版运行时对照（B-007），R-01 至 R-03 的结论与文档交接。

本文件不重新定义行为契约。规则系统（P3-06 至 P3-11）、Runtime 接入（P3-04）与浏览器输入（P3-05）不在本 goal 中实现。

## 代码现状与前提

- **已有代码（本 goal 复用、不改契约）：**
  - [load-mission.ts](../../../../src/core/mission/load-mission.ts) 的 `loadMission` 产出冻结的 `MissionSetup`；[logic-content.ts](../../../../src/content/logic/logic-content.ts) 定义 `MissionDeclaration`（含 `origins`）、`RuleInputs`（来源 0 记为 null）、`MissionGroup` 与 `StrategicMapFrame`。[logic-readers.ts](../../../../src/content/logic/logic-readers.ts) 的读取器也接受显式数值 0，正式创建须按 spec 拒绝。
  - [content-identity.ts](../../../../src/content/content-identity.ts) 的 `readContentIdentity` 与 `contentIdentityKey`。
  - [rng.ts](../../../../src/core/determinism/rng.ts)（Mulberry32，`value` 为 uint32 ÷ 2³²，可还原 uint32）与 [fnv1a64.ts](../../../../src/core/determinism/fnv1a64.ts)（只接受 ASCII，规范文本须转义非 ASCII）。
  - [errors.ts](../../../../src/core/errors.ts) 只有 `CoreInputError`。
  - [core/synthetic/](../../../../src/core/synthetic/) 的合成场景与 replay；通用校验 helper（`requireExactRecord`、`readNumber` 等）目前从 [synthetic-scene.ts](../../../../src/core/synthetic/synthetic-scene.ts) 导出。
  - [eslint.config.js](../../../../eslint.config.js) 对 `src/core/**` 的纯度与确定性规则；[engineering-boundaries.test.ts](../../../../tools/engineering-boundaries.test.ts) 的边界回归；目前没有正式模块与合成模块互不依赖的规则。
  - [logic-content.test-support.ts](../../../../src/content/logic/logic-content.test-support.ts) 的合成任务、机型表与僚机名单。
  - [tools/logic-check.ts](../../../../tools/logic-check.ts) 用生产导入作业在本地 CloneCD 上载入任务，是真实内容核对的先例。
  - [tools/baseline/](../../../../tools/baseline/) 的运行时测量工具：断点与 VRT 暂停、LE 对象定位与指针链、`gameSettings` 覆盖；用法见[运行时测量指南](../../../guides/runtime-measurement.md)。
- **计划新增：** `src/core/contracts/`、`world/`、`systems/`、`rules/`、`projections/`、`replay/` 下的正式模块及相邻测试（文件名见各 subtask，可在实现时调整，职责不变）；`docs/original/behavior/B-007-mission-instantiation.md`；被忽略的 `local/research/p3-02/<主题>/`。
- **跨任务前提：** P3-01 已完成（[P3-01 goal](../01/goal.md#子任务跟踪) 全部 completed），时基、终态、衔接、数据闭包与测量工具可用。P3-02 不依赖其他 P3 任务；P3-03 可并行，但本 goal 不使用其导入内容。
- **环境（起草时核对）：**
  - 本 worktree 没有 `node_modules`：执行前运行 `pnpm install --frozen-lockfile`。
  - 本 worktree 没有 `local/`：需要原版数据或研究输出的 01–03、09、10 执行前，按[并行执行](../../../engineering/agent-workflow.md#并行执行)的环境约定链接主仓库的 `local/`（git 忽略）。
  - Ghidra 12.0.1 与项目 `local/ghidra/srangers`：一律 `-noanalysis -readOnly`，在 `local/research/p3-02/<主题>/` 中使用项目的私有只读副本，不 `-overwrite`。
  - DOSBox-X 基准环境：同一时间只有一个会话操作（工具在 `local/research/` 上加锁）。
- **原版证据：** 01–03 由 agent 用只读 Ghidra 与本地数据取得；09 用本地导入的真实内容；10 需要进入所选任务的原版运行。P3-01 实测本机 Computer Use 无法向 DOSBox-X 送达按键或移动游戏内光标，因此 10 标为需用户：用户只做键盘操作，agent 负责方案、配方、运行、读数、判定与记录。执行时若该限制已解除，协调者改为自动。达不到 spec 门槛的研究项按 spec 阻塞，不按猜测实现。

## 验收覆盖

| Spec 范围项/验收项 | 实现子任务 | 验证子任务及方法 |
|---|---|---|
| S-01 | 04、05 | 04/05：契约类型与校验的 Node 测试；11：扩展规则写入 Core 模块说明；12：契约与 spec 一致 |
| S-02 | 04、05、06 | 04：时钟单位与边界测试；06：数值与随机映射的独立推导测试；12：无外部补时接口、无全局双精度预设 |
| S-03 | 07 | 07：创建、配置、语义校验与拒绝的 Node 测试；12：复核 |
| S-04 | 04、05 | 04：动作输入校验；05：每命令一个结果、无 Core 持久队列；12：复核 |
| S-05 | 05 | 05：实体表、阶段表、生命周期与故障锁存的 Node 测试；12：复核 |
| S-06 | 06、07 | 06：放置与换算测试；07：排程、到期、编组、缺省与名称测试；09：真实内容核对 |
| S-07 | 07 | 07：僚机 null 与各索引的测试；09、10：真实内容与原版运行 |
| S-08 | 04、08 | 04：规范文本；08：快照、录制、replay 与比较测试 |
| S-09 | 01、02、03、10 | 01–03：Q-01 至 Q-11 写入 `docs/original/`；10：B-007 与原版运行；11：R-01 至 R-03 结论 |
| S-10 | 11 | 11：Core 模块说明、源码结构指南、工程约定；10：测量工具扩展时的指南；12：链接与元数据 |
| AC-01 | 04 | 04：正式/合成互不导入的边界测试，合成测试不改；12：`pnpm check` |
| AC-02 | 07 | 07：创建与每类拒绝的 Node 测试、诊断不含名称/坐标、limit/limit+1 |
| AC-03 | 04、05、07 | 04：单位、换算、溢出；05：每次 step 恰好推进一次；07：2 与 4 单位/tick 下的生成到期边界 |
| AC-04 | 04、05 | 04：每类不合法输入拒绝且状态不变；05：每命令一个 `command-result`、`not-implemented`、无持久队列 |
| AC-05 | 07 | 07：合成任务覆盖每条“实现”路径的独立期望测试 |
| AC-06 | 06、07 | 06：放置例程、端点、原像计数、关联、舍入边界；07：别名记录只换算一次的集成测试 |
| AC-07 | 07 | 07：Q-04 逐字段与 Q-05 逐分支的测试 |
| AC-08 | 07 | 07：僚机 null、各索引与越界拒绝 |
| AC-09 | 05 | 05：阶段表与 Q-09 一致、遍历与清理、故障锁存的测试 |
| AC-10 | 05、07 | 05：冻结、脱离、未就绪分区、两帧消费者契约；07：来源命名空间与放置序号 |
| AC-11 | 04、08 | 04：规范文本规则；08：快照覆盖全部状态的逐字段测试 |
| AC-12 | 08 | 08：JSON 往返 replay、分歧定位、各类拒绝、种子集覆盖 |
| AC-13 | 09 | 09：本地真实内容两种僚机配置的计数、来源与时刻核对 |
| AC-14 | 01、02、03、10 | 各项写入 `docs/original/` 与 U 项；12：负责阶段未改、`pnpm check:compliance`、git 审阅 |
| AC-15 | 10、11 | 10：B-007 方案与 ≥2 次合格运行；11：R-01 至 R-03 的新版对照结论 |
| AC-16 | 11 | 11：模块说明、交接与同步；12：`pnpm check`、链接与 `updated:` |

## 子任务跟踪

状态只在此维护：`pending` / `in-progress` / `blocked` / `completed`。依赖项全部 completed 后才能开始；验收结果和证据写在相应 subtask 文档，不在阶段索引重复状态。并行执行时，本表与执行记录只由协调者修改。

| 子任务 | 依赖 | 状态 |
|---|---|---|
| [01-pipeline-entity-input-research.md](./subtasks/01-pipeline-entity-input-research.md) | — | completed |
| [02-placement-numeric-research.md](./subtasks/02-placement-numeric-research.md) | — | completed |
| [03-spawn-defaults-names-research.md](./subtasks/03-spawn-defaults-names-research.md) | — | completed |
| [04-core-contract-foundation.md](./subtasks/04-core-contract-foundation.md) | — | completed |
| [05-world-pipeline-read-models.md](./subtasks/05-world-pipeline-read-models.md) | 01, 04 | completed |
| [06-placement-coordinates.md](./subtasks/06-placement-coordinates.md) | 02, 04 | completed |
| [07-world-creation-instantiation.md](./subtasks/07-world-creation-instantiation.md) | 03, 05, 06 | completed |
| [08-snapshot-replay.md](./subtasks/08-snapshot-replay.md) | 07 | in-progress |
| [09-real-content-check.md](./subtasks/09-real-content-check.md) | 07 | completed |
| [10-original-runtime-evidence.md](./subtasks/10-original-runtime-evidence.md) | 02, 03 | in-progress |
| [11-comparison-docs-handoff.md](./subtasks/11-comparison-docs-handoff.md) | 08, 09, 10 | pending |
| [13-heavy-test-timeouts.md](./subtasks/13-heavy-test-timeouts.md) | 04 | completed |
| [12-final-alignment.md](./subtasks/12-final-alignment.md) | 01, 02, 03, 04, 05, 06, 07, 08, 09, 10, 11, 13 | pending |

最后一行始终为最终对齐验证，依赖所有其他子任务。ID 分配后保持不变；新增修复项使用新 ID，插入最终验证之前并加入其依赖，不要求最终验证拥有最大的数字。

## 执行记录

- **2026-10-09 — 并行执行安排：** 协调者在 `p3-02-core-contract-spec` 分支上执行（本 worktree，`local` 以符号链接接入主仓库的 `local/`），同时运行的 worker 不超过 3 个。与 P3-01 相同，宿主由应用为每个 worker 管理 worktree（以认领提交为基），worker 把分支改名为 `exec-p3-02-NN` 作为认领标记。P3-03 同时在其他 worktree 中执行；基准环境的单会话锁与两个分支对 `docs/original/` 的并行修改（合并时可能冲突）由协调者留意。
- **2026-10-09 — Subtask 05 blocked:** 01 的 Q-08/Q-09 结论与 spec 的系统流水线及实体生命周期冲突，spec 规定冲突时先修订 spec，再实现流水线。冲突共三处：
  - 原版对象更新是按种类位升序的实时遍历，本帧在更高种类位新分配的对象会在同一遍中更新（spec 写的是遍历 tick 开始时的实体）。
  - 生成队列只发出生成请求，实例化发生在其后的消息处理中，次序在任务流程与对象更新阶段的请求之后（spec 写的是“先生成”）。
  - 移除不在统一的帧尾边界：对象在下一次自身更新时发出移除请求，在该帧的消息处理中移除，因此同帧或延后一帧，期间仍在种类表中。另需采用原版的对象状态与停放（activity）模型。
  Evidence: [executable 的对象表、帧流水线与输入轮询一节](../../../original/formats/executable.md#object-table-frame-pipeline-and-input-polling-p3-0201)；01 的完成证据。
  Affected acceptance: AC-09、AC-10（Render State 的可呈现实体）；05 与依赖它的 07、08。
  Resume when: 用户批准按上述结论修订 spec 的系统流水线、实体与生命周期、Render State 与 AC-09，修订已提交。
- **2026-10-09 — 05 解除阻塞：** 用户批准了 spec 修订（系统流水线、实体与生命周期、Render State、AC-09/AC-10），修订与子任务 05、07 的同步已提交；05 回到 `pending`。
- **2026-10-09 — Q-11 舍入方向（协调者决定）：** 02 已确认（代码）：启动时为双精度、就近舍入；渲染器把舍入改为向零后不再恢复；位置与姿态以 f32 存储；浮点转整数向零截断。原版单次放置的舍入方向因此取决于运行历史：重试、后续任务以及任务首个渲染帧之后的放置为向零（高概率）；启动后第一个任务的开局放置可能为就近（未确认）。Core 不建模渲染与会话历史，06 对所有 f32 写回一律向零舍入（与重试、后续任务和延迟生成一致）；双精度中间运算仍按 JS 的就近舍入，原版在向零模式下逐步舍入，结果至多相差一个 f32 ulp。这是对已确认的原版行为二选一，不改变 spec 的数值策略（f32 写回与 i32 截断照常在对应边界实现），因此不修订 spec。差异由 11 写入 Core 文档的已知差异；10 的支持集按 02 对两种舍入的推导核对。
- **2026-10-09 — 新增修复子任务 13：** 集成 05 时 `pnpm check` 中 04 的规范文本上限测试与渲染边界测试在负载约 12 时超过 Vitest 默认的 5 秒（单独运行分别约 0.7 秒与 0.5 秒），重跑通过；06 的 worker 也遇到前者超时。后续每次集成都依赖 `pnpm check`，因此新增 13（依赖 04），插在最终对齐之前并加入其依赖。
- **2026-10-09 — spec 第 5 行补充（用户批准）：** 05 指出系统流水线表第 5 行漏列 01 已确认的 `0x2cd60`（到期通讯回复，P3-10）与 `0x2ede0`（重建对象集合，未分析）；05 已为两者保留空阶段。用户批准补入，见 spec 审批节的“修订（二）”；代码与验收不变。05 的另一建议（为规则请求单独设上限）暂不采纳：请求数沿用 `CORE_LIMITS.eventsPerTick`，07 接入生成请求时若发现一个 tick 的请求可能超过该上限，在报告中提出。

## 审批

用户于 2026-10-09 明确批准本 goal（“approve the goal and commit all”）。批准范围为当前的 12 个子任务、依赖、执行方式、写入范围与验收覆盖。这不代表实现完成，不替代 spec 批准，也不授权执行之外的 push、部署或阶段切换。
