---
type: guide
status: active
phase: all
updated: 2026-10-08
related: [ADR-0013, ADR-0014, ADR-0015, ADR-0016, ADR-0017]
---

# Agent 任务工作流

本项目的阶段任务通过 spec → review → goal → execute 推进。路径与进度分工由 [ADR-0014](../decisions/ADR-0014-status-summary-only.md) 决定；产品、架构和阶段退出条件仍以[总计划](../plan/master-plan.md)为准。

当前 P1 只要求本地验证；CI 与云部署已由 [ADR-0012](../decisions/ADR-0012-local-p1-defer-ci-deployment.md) 归入 P5，不为 P1 goal 加入远端验收或凭据前提。

## 路径

所有路径从仓库根目录起算。阶段使用小写 `p1`–`p6`，任务号使用补零的数字（例如 `01`），已有编号不得复用。

```text
docs/plan/
  p1/
    tasks.md
    01/
      spec.md
      goal.md
      subtasks/
        01-core-contract.md
        02-replay-checks.md
        03-final-alignment.md
```

- `tasks.md` 合并承载阶段计划与任务索引，不另建阶段 README。
- `spec.md` 是该任务的行为、范围、数据契约与验收标准；不写实现顺序。
- `goal.md` 记录实现现状、验收覆盖、依赖图与唯一的 subtask 状态表。
- `subtasks/NN-<slug>.md` 记录单项工作范围、依赖、验收标准与证据。
- 不再创建阶段目录下的 `p1-01.md` 等平铺任务文件，也不增加前置需求文档或单独的测试报告阶段。
- 阶段任务按需规划；以上目录树是路径示例，不表示任务契约或执行记录已经创建。实际任务号与标题以所属阶段索引为准。

## 入口 skills

| Skill | 职责 | 示例 |
|---|---|---|
| [generate-spec](../../.agents/skills/generate-spec/SKILL.md) | 与用户澄清需求，创建或修订 spec | `/generate-spec p1/02 最小 Core` |
| [review-spec](../../.agents/skills/review-spec/SKILL.md) | 审阅并修正 spec，向用户确认影响契约的选择 | `/review-spec docs/plan/p1/02/spec.md` |
| [generate-goal](../../.agents/skills/generate-goal/SKILL.md) | 从已批准 spec 生成 goal 与 subtasks | `/generate-goal docs/plan/p1/02/spec.md` |
| [execute-goal](../../.agents/skills/execute-goal/SKILL.md) | 按依赖持续实现、rubber-duck 审查、文档对齐、验证并逐项本地提交；默认作为协调者[并行执行](#并行执行)，`--parallel N`、`--sequential`、`--worker NN` 切换方式 | `/execute-goal docs/plan/p1/02/goal.md` |
| [browser-testing](../../.agents/skills/browser-testing/SKILL.md) | 用合成内容验证浏览器交互、渲染、生命周期与本地存储 | `/browser-testing docs/plan/p1/02/subtasks/03-final-alignment.md` |
| [simplify](../../.agents/skills/simplify/SKILL.md) | 清理当前实现范围内的复用、复杂度与效率问题 | 由 execute-goal 在 rubber-duck 审查后调用 |
| [run-task](../../.agents/skills/run-task/SKILL.md) | 按[自动编排](#自动编排)串联前四个 skills，在人工关卡停下 | `/run-task p1/03`、`/run-task p1/04 --plan-only` |

生成、审阅、分解和执行是独立入口，不自动越过用户批准进入下一阶段；run-task 只负责把它们串起来，同样不越过批准。前四个 skills 与 run-task 仅显式调用；browser-testing 可在相关验证工作中调用。保留参考 skills 中已有的 `agents/openai.yaml`。

## 审批与状态

文档 front matter 使用[文档约定](../README.md#文档元数据)。`status` 表示文档生命周期或契约审批，不表示实现进度：

- spec 与 goal 初始为 `draft`，用户明确批准后才为 `accepted`；修订已批准的行为、范围或验收要求后，须重新批准。
- review 通过不等于用户批准；不得替用户填写批准记录。
- 明确调用 execute-goal 可视为批准所选 goal，但不能代替 spec 的批准，也不能解决未决的行为问题。
- subtask 文档使用 `active`；实现状态只写在 goal tracker，不在文件中另设一份任务状态。

goal tracker 的状态为 `pending` / `in-progress` / `blocked` / `completed`。生成 goal 时全部为 `pending`；执行才进入 `in-progress`；验收与必要提交均完成后才为 `completed`。`blocked` 必须记录原因、受影响验收项及准确的恢复条件。并行执行时，tracker 与执行记录只由协调者修改，见[并行执行](#并行执行)。

| 信息 | 唯一权威位置 |
|---|---|
| 项目阶段摘要、任务索引入口、项目级优先项与阻塞 | [STATUS.md](../STATUS.md) |
| 阶段计划、任务导航与退出条件责任覆盖 | 各阶段 `tasks.md`，不复制 subtask 状态 |
| 任务契约 | 该任务的 `spec.md` |
| subtask 依赖与执行状态 | 该任务的 `goal.md` |
| subtask 执行方式与写入范围 | 相应 subtask 文档 |
| 单项验收结果与证据 | 相应 subtask 文档 |
| 阶段退出判定 | [reviews/](../reviews/) 中相应阶段评审 |
| 原版事实与置信度 | [original/](../original/) |
| 冻结决定及其变更 | [decisions/](../decisions/) |

任务生成时可更新所属 `tasks.md` 的导航链接。只有阶段摘要、任务入口、优先项、下一步或项目级阻塞发生变化时才更新 STATUS；不要在其中维护退出条件、证据清单、任务实现过程或 subtask 状态。任务完成不自动等于阶段验收通过，阶段评审依据总计划和各任务证据作最终判定。

## 自动编排

[run-task](../../.agents/skills/run-task/SKILL.md) 把一个任务的流程当作状态图执行，决定见 [ADR-0013](../decisions/ADR-0013-task-graph-orchestration.md)：

- **状态：** 只有该任务的 spec、goal 与 subtasks 文档，不另设编排状态文件。中断后重新调用即从文档恢复。
- **路由：** [tools/task-state.ts](../../tools/task-state.ts) 只读这些文档，确定性地给出下一节点，不由模型判断。
- **节点：** 现有四个 skills，各自的边界不变。agent 节点尽量各用一个新的子 agent 运行，避免上下文累积。

```text
generate-spec → review-spec → ⏸ approve-spec → generate-goal → ⏸ approve-goal → execute-goal → done
                    ↑    修订 ↙                      ↑ 覆盖与 spec 不一致              ↓ 只剩 blocked
                    └── spec 修改使审阅标记失效         └── goal 过期                   ⏸ resolve-blocker
```

| 文档状态 | 路由结果 |
|---|---|
| 没有 spec | `generate-spec` |
| spec 为 draft，`reviewed` 标记缺失或与当前文本不符 | `review-spec` |
| spec 为 draft 且审阅标记有效 | ⏸ `approve-spec`；同时列出未决事项 |
| spec 为 accepted 但未决事项不为“无”或缺少批准记录 | ⏸ `repair-plan` |
| spec 已批准，没有 goal，或 goal 覆盖表的 S/AC 与 spec 不一致 | `generate-goal` |
| tracker 结构无效（ID、文件、依赖、环、最终对齐） | ⏸ `repair-plan` |
| goal 为 draft | ⏸ `approve-goal` |
| 有依赖已完成的 in-progress 行，否则有依赖已完成的 pending 行 | `execute-goal`，给出编号最小的子任务及并行调度 `schedule` |
| 只剩 blocked 行 | ⏸ `resolve-blocker` |
| 全部 completed | `done` |

⏸ 为人工关卡。spec 与 goal 的批准只能来自用户对关卡问题的明确回答，run-task 只在这时写入批准记录。其他文档修改都由节点 skill 完成，提交仍只由 execute-goal 进行。

审阅标记由 review-spec 完成审阅后调用 `node tools/task-state.ts <spec> --mark-reviewed` 写入。它是所审阅文本的哈希，之后对 spec 的任何修改都会让它失效，因此修订后必然重新审阅。

编排在以下情况停下：节点运行后图状态指纹不变；同一次调用中 review-spec 将运行第三次；节点数超过上限。`--plan-only` 在进入 `execute-goal` 前停止。`--parallel N` 与 `--sequential` 原样传给 execute-goal；并行模式的 execute-goal 在 run-task 自己的会话中运行，不放进 subagent。

## 并行执行

execute-goal 默认并行执行，决定见 [ADR-0017](../decisions/ADR-0017-coordinator-current-checkout.md)（取代 [ADR-0016](../decisions/ADR-0016-parallel-goal-execution.md)），操作细则见 [parallel.md](../../.agents/skills/execute-goal/references/parallel.md)。

| 方式 | 调用 | 行为 |
|---|---|---|
| 并行（默认） | `/execute-goal p2/11`、`--parallel N` | 协调者在当前 checkout（主 worktree 或用户创建的 worktree）中认领子任务，为每个 worker 新建 worktree，最多 3 个（或 N 个），逐个集成 |
| 顺序 | `--sequential` | 原单会话行为，在当前 checkout 中逐个执行，不接手已被 worker 认领的行 |
| worker | `--worker NN` | 在 `exec/<phase>-<task>-NN` worktree 中只执行已认领的子任务 NN |

- **工作区：** 协调者不为自己新建或切换 worktree，当前分支（可以是基础分支）即 goal 分支，认领与集成都是该分支上的本地提交。无关的用户修改须未暂存且不在本 goal 的路径中，作为基线保留；其他分支已在协调同一 goal 时先询问用户。
- **调度：** subtask 文档以 `**执行方式：**`（`自动`/`需用户`）和 `## 写入范围` 声明执行元数据。路由器的 `schedule` 列出可同时分派的 `wave`，规则如下：
  - 只选依赖已完成、写入范围与已选行、`in-progress` 行、`blocked` 行都不重叠的行，编号小的优先。
  - 缺少写入范围的行与所有行冲突。
  - 需用户的行和最终对齐由协调者执行，同样参与重叠检查。需用户的行若只需要原版证据，且已批准的 spec 不要求用户本人判断，协调者先自行取得证据，并把执行方式改为自动。
- **所有权：** 只有协调者修改 `goal.md`、阶段 `tasks.md`、STATUS，以及各 subtask 的执行方式和写入范围。每次认领、范围变更、完成和阻塞都形成协调者提交，其中认领单独提交。worker 只改写入范围内的文件和自己 subtask 文档的验收勾选与证据，其余修改以建议形式交给协调者。
- **集成：** worker 在自己的分支上产生一个提交。协调者逐个集成：
  1. `cherry-pick` 该提交，同时把该行标为 `completed`。
  2. 在集成后的代码上重跑检查；冲突或失败时退回 worker 修复。
  3. 附 `Worker-Commit` trailer 提交，保持一个子任务一个提交。
- **恢复：** 每次启动都把 tracker 与 `exec/` 分支、worktree、worker 会话对照，因此从头执行和执行到一半的 goal 走同一路径。旧 goal 没有写入范围时，由协调者补写并单独提交，不改变契约。
- **清理：** worker 的 worktree 与分支在集成后立即删除；阻塞中的保留到恢复或用户放弃。goal 完成时不留任何 `exec/` 分支或 worktree。当前分支的 push 或合并由用户决定。
- **环境：** 每个 worker 按子任务编号使用独立端口（`5100 + 3 × NN` 起），执行 `pnpm install --frozen-lockfile`，并链接主仓库的 `local/`。

## 数据模型的定位

没有统一的模型 schema 文件。按[总计划 §4–5](../plan/master-plan.md#4-总体架构)定位相关 TypeScript 类型与契约：

| 数据类别 | 权威模块 |
|---|---|
| 世界、实体、输入、命令、领域事件、projection、存档模型 | `src/core/` |
| 规范化内容、Asset ID、资源包版本 | `src/content/` |
| 原版封包与 payload 的结构、解析结果 | [src/original-data/](../../src/original-data/) |
| IndexedDB 与设置持久化适配器、浏览器输入和媒体 | `src/platform/` |
| 调度、命令队列、Event Bus 与会话生命周期 | [src/app/](../../src/app/) |
| Three.js 的渲染状态消费与 React/Zustand 桥接 | `src/render/`、`src/ui/` |

这些是职责位置，不是已实现文件清单。当前模块内目录、helper 归属和历史路径对应关系见[源码结构指南](./source-structure.md)。每次规划必须检查实际存在的文件，引用真实类型和路径；未落地的目录或类型明确标记为“计划新增”。不要为了替换 schema 路径而提前创建一个大而全的模型文件。

涉及持久化时，明确版本、内容指纹、读写边界、事务原子性、旧存档兼容、损坏或配额不足的反馈及恢复方式。设置可按总计划使用 localStorage；资源、缓存和存档使用 IndexedDB。测试在隔离的合成数据环境进行，不清空用户站点数据。

## 验证与安全边界

- Core 在 Node 中验证，事件和 replay 直接断言；相同运行时的一致性不能宣称为跨浏览器逐位一致。
- 公共自动测试、CI 和 agent 浏览器验证使用自建合成数据；原版对照是独立的本地研究，原始截图、资源字节和反编译输出不进入任务文档、提交或公开报告。agent 按[原版证据获取](../guides/original-evidence.md)自行取得原版证据：本地数据与逆向、参考视频，或用 Computer Use 操作本地基准环境。截图与视频帧只存放在 `local/`，文档只记文字结论与来源。
- 原版要求链接 `U-###`、`B-###` 或格式规范；未确认项必须显式处理，不用合成测试或近似规则冒充保真证据。
- 浏览器检查覆盖相关 DOM 交互和 Canvas/WebGL 结果；仅看到 Canvas 或 HTTP 200 不代表玩法、渲染或指令闭环通过。
- 合成按键不能证明浏览器/系统快捷键拦截有效；全屏、Pointer Lock、Keyboard Lock、音频解锁和真实性能按需要保留实机验证。
- 先跑针对性检查；TypeScript/app 变更按[工程约定](./README.md)运行 `pnpm check`。Python/Ghidra 的检查单独执行。文档修改检查链接、元数据与结构，不运行无关构建。
- 每个 subtask 在 simplify 或完成前，用 rubber-duck subagent 按当前项 diff、契约和验收标准做一次审查；处理适用问题并重跑受影响检查，不重复委派同一审查。
- 每个 subtask 完成前检查文档影响；接口、命令、检查规则或操作步骤变化时同步 `engineering/`、`guides/` 等直接相关文档，无需修改时在完成证据中说明原因。
- 明确调用 execute-goal 授权在当前分支（可以是基础分支）上逐项本地 commit，并授权创建、使用和删除该 goal 自己的 worker worktree、`exec/` 分支与 worker 会话；不授权 push、把当前分支合入其他分支、云资源修改、部署或破坏性操作。当前仅创建这些 skills，不等于调用 execute-goal。
- 已批准 spec 要求的实机、原版对照或部署结果若尚未验证，仍是未完成验收，不可用本地代理检查替代后宣称完成；任务范围之外的后续操作才可以作为残余事项记录。
- **先自行解阻，再问用户：** 向用户提问或请用户操作之前，先判断能否用浏览器、Computer Use、本地原版数据与逆向或参考视频自行解决。原版事实由 agent 查证，不请用户试玩原版。只有决定类问题（行为取舍、范围、批准），或这些途径都无法取得的证据，才交给用户，并说明已尝试的途径。worker 不操作基准环境，需要时交给协调者。
- 执行不为已决定的事项反复提问；出现新的行为歧义或契约冲突时先记录阻塞，必要时向用户澄清，不能为了长时间无人值守而猜测。

SKILL 指令使用英文，生成的计划与验收文档使用中文。SKILL front matter 遵循 Agent Skills 格式，模板与 `openai.yaml` 不套用 `docs/` 的文档元数据。
