---
id: ADR-0011
type: adr
status: accepted
phase: all
updated: 2026-10-01
related: [ADR-0001, ADR-0010]
---

# ADR-0011：Spec、Goal 与分层任务跟踪

## 背景

用户要求将其他项目的五个 skills 改编为本项目专用的 spec → review → goal → execute 工作流，并指定按阶段和任务号嵌套的输出路径。用户进一步确认采用分层进度管理，并保留 execute-goal 验证每个 subtask 后自动本地提交的行为。

本记录取代 [ADR-0010](./ADR-0010-phase-task-documents.md) 的任务文件布局与后续跟踪安排，并更新 [ADR-0001](./ADR-0001-document-structure.md) 中“进度只记录在 STATUS”的条款；长期知识按主题组织、使用仓库文档而不是 Issues 的决定不变。

## 决定

- 阶段 `tasks.md` 合并承载计划与导航，不另建阶段 README。
- 任务契约位于 `docs/plan/<phase>/<task>/spec.md`，执行计划位于同目录的 `goal.md`；具体工作单元位于 `subtasks/NN-<slug>.md`。例如 `docs/plan/p1/01/spec.md`。
- 不增加前置需求文档或单独的测试报告阶段，也不再使用 `p1-01.md` 等平铺任务文件。
- STATUS 管项目阶段和阶段退出验收；goal tracker 唯一维护 subtask 状态；subtask 文档记录验收与证据。阶段索引和 STATUS 不复制细粒度任务状态。
- spec 经用户明确批准后才能生成可执行 goal；goal 的批准与实现完成分开记录。审阅不能代替用户批准。
- 明确调用 execute-goal 授权按依赖持续实现、验证和逐项本地 commit，不授权 push、部署、云资源修改或破坏性操作。
- 模型契约定位到 Core、内容、解析器与平台适配器的 TypeScript 定义；存储只采用总计划规定的浏览器本地方案。
- 验证使用合成内容，不把原版数据或输出写入公开材料；实机和原版保真验收不能用自动化代理检查冒充。
- 新 skills 使用英文指令，输出的计划与验收文档使用中文；保留参考中已有的 `openai.yaml`。

## 考虑过的其他方案

- 所有 subtask 状态继续放在 STATUS：会让项目入口承载过多执行细节，无法直接沿 goal 的依赖图恢复工作。
- 同时在阶段索引、goal 和 subtask 中记录任务状态：会形成多份需要手工同步的状态。
- 直接复制原项目 skills：其中的服务端、账户和业务基础设施不适用于本项目，且缺少 Core 纯度、保真与原版数据隔离要求。

## 后果

- 人和 agent 可以沿同一任务契约规划、恢复执行和核对证据。
- 新任务使用嵌套布局；现有 P1–P6 索引仍是占位，不提前生成真实 spec、goal 或 subtasks。
- 阶段验收仍以总计划为准；未验证的实机或部署要求不会因实现已本地提交而自动通过。
- 具体流程与 skills 入口见[Agent 任务工作流](../engineering/agent-workflow.md)。
