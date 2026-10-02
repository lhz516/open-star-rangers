---
type: guide
status: active
phase: all
updated: 2026-10-01
related: [ADR-0011]
---

# Agent 任务工作流

本项目的阶段任务通过 spec → review → goal → execute 推进。路径与进度分工由 [ADR-0011](../decisions/ADR-0011-spec-goal-workflow.md) 决定；产品、架构和阶段退出条件仍以[总计划](../plan/master-plan.md)为准。

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
- 当前只建立工作流与阶段索引占位；以上任务目录是路径示例，不表示任务已经创建。

## 入口 skills

| Skill | 职责 | 示例 |
|---|---|---|
| [generate-spec](../../.agents/skills/generate-spec/SKILL.md) | 与用户澄清需求，创建或修订 spec | `/generate-spec p1/01 最小 Core` |
| [review-spec](../../.agents/skills/review-spec/SKILL.md) | 审阅并修正 spec，向用户确认影响契约的选择 | `/review-spec docs/plan/p1/01/spec.md` |
| [generate-goal](../../.agents/skills/generate-goal/SKILL.md) | 从已批准 spec 生成 goal 与 subtasks | `/generate-goal docs/plan/p1/01/spec.md` |
| [execute-goal](../../.agents/skills/execute-goal/SKILL.md) | 按依赖持续实现、验证、更新记录并逐项本地提交 | `/execute-goal docs/plan/p1/01/goal.md` |
| [browser-testing](../../.agents/skills/browser-testing/SKILL.md) | 用合成内容验证浏览器交互、渲染、生命周期与本地存储 | `/browser-testing docs/plan/p1/01/subtasks/03-final-alignment.md` |
| [simplify](../../.agents/skills/simplify/SKILL.md) | 清理当前实现范围内的复用、复杂度与效率问题 | 由 execute-goal 在代码验证后调用 |

生成、审阅、分解和执行是独立入口，不自动越过用户批准进入下一阶段。前四个 skills 仅显式调用；browser-testing 可在相关验证工作中调用。保留参考 skills 中已有的 `agents/openai.yaml`。

## 审批与状态

文档 front matter 使用[文档约定](../README.md#文档元数据)。`status` 表示文档生命周期或契约审批，不表示实现进度：

- spec 与 goal 初始为 `draft`，用户明确批准后才为 `accepted`；修订已批准的行为、范围或验收要求后，须重新批准。
- review 通过不等于用户批准；不得替用户填写批准记录。
- 明确调用 execute-goal 可视为批准所选 goal，但不能代替 spec 的批准，也不能解决未决的行为问题。
- subtask 文档使用 `active`；实现状态只写在 goal tracker，不在文件中另设一份任务状态。

goal tracker 的状态为 `pending` / `in-progress` / `blocked` / `completed`。生成 goal 时全部为 `pending`；执行才进入 `in-progress`；验收与必要提交均完成后才为 `completed`。`blocked` 必须记录原因、受影响验收项及准确的恢复条件。

| 信息 | 唯一权威位置 |
|---|---|
| 项目阶段、阶段退出验收、项目级优先项与阻塞 | [STATUS.md](../STATUS.md) |
| 阶段计划与任务导航 | 各阶段 `tasks.md`，不复制 subtask 状态 |
| 任务契约 | 该任务的 `spec.md` |
| subtask 依赖与执行状态 | 该任务的 `goal.md` |
| 单项验收结果与证据 | 相应 subtask 文档 |
| 原版事实与置信度 | [original/](../original/) |
| 冻结决定及其变更 | [decisions/](../decisions/) |

任务生成时可更新所属 `tasks.md` 的导航链接。只有阶段级证据、优先项或阻塞发生变化时才更新 STATUS；不要把每个 subtask 的状态复制进去。任务完成不自动等于阶段验收通过。

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

这些是职责位置，不是已实现文件清单。每次规划必须检查实际存在的文件，引用真实类型和路径；未落地的目录或类型明确标记为“计划新增”。不要为了替换 schema 路径而提前创建一个大而全的模型文件。

涉及持久化时，明确版本、内容指纹、读写边界、事务原子性、旧存档兼容、损坏或配额不足的反馈及恢复方式。设置可按总计划使用 localStorage；资源、缓存和存档使用 IndexedDB。测试在隔离的合成数据环境进行，不清空用户站点数据。

## 验证与安全边界

- Core 在 Node 中验证，事件和 replay 直接断言；相同运行时的一致性不能宣称为跨浏览器逐位一致。
- 公共自动测试、CI 和 agent 浏览器验证使用自建合成数据；原版对照是独立的本地研究，原始截图、资源字节和反编译输出不进入任务文档、提交或公开报告。
- 原版要求链接 `U-###`、`B-###` 或格式规范；未确认项必须显式处理，不用合成测试或近似规则冒充保真证据。
- 浏览器检查覆盖相关 DOM 交互和 Canvas/WebGL 结果；仅看到 Canvas 或 HTTP 200 不代表玩法、渲染或指令闭环通过。
- 合成按键不能证明浏览器/系统快捷键拦截有效；全屏、Pointer Lock、Keyboard Lock、音频解锁和真实性能按需要保留实机验证。
- 先跑针对性检查；TypeScript/app 变更按[工程约定](./README.md)运行 `pnpm check`。Python/Ghidra 的检查单独执行。文档修改检查链接、元数据与结构，不运行无关构建。
- 明确调用 execute-goal 授权逐项本地 commit，不授权 push、云资源修改、部署或破坏性操作。当前仅创建这些 skills，不等于调用 execute-goal。
- 已批准 spec 要求的实机、原版对照或部署结果若尚未验证，仍是未完成验收，不可用本地代理检查替代后宣称完成；任务范围之外的后续操作才可以作为残余事项记录。
- 执行不为已决定的事项反复提问；出现新的行为歧义或契约冲突时先记录阻塞，必要时向用户澄清，不能为了长时间无人值守而猜测。

SKILL 指令使用英文，生成的计划与验收文档使用中文。SKILL front matter 遵循 Agent Skills 格式，模板与 `openai.yaml` 不套用 `docs/` 的文档元数据。
