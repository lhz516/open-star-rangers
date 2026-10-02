---
id: ADR-0013
type: adr
status: accepted
phase: all
updated: 2026-10-02
related: [ADR-0011]
---

# ADR-0013：用确定性路由编排任务工作流图

## 背景

[ADR-0011](./ADR-0011-spec-goal-workflow.md) 建立了 spec → review → goal → execute 四个独立入口，每一步都由用户手动调用下一步。用户希望按 agent graph 的思路自动化这条流程。ADR-0011 的硬约束必须保留：spec 与 goal 只能由用户明确批准，审阅不等于批准，execute-goal 不授权 push 或部署。

## 决定

- 新增 [run-task](../../.agents/skills/run-task/SKILL.md) 编排 skill，只能显式调用。它把一个任务的四个 skills 当作图中的节点串联起来，节点各自的边界不变。
- **图状态只是任务文档本身。** 也就是 spec 的 `status`、未决事项和审批，goal 的覆盖表与 tracker。不另设编排状态文件，中断后从文档恢复。
- **下一节点由 [tools/task-state.ts](../../tools/task-state.ts) 确定性地计算。** 这个路由只读文档，不由模型判断。tracker 结构无效、批准记录矛盾，或 goal 覆盖与 spec 不一致时，路由会拒绝前进。
- **spec 批准与 goal 批准是人工关卡。** 只有用户在关卡上明确回答后，编排才写入批准记录。出现阻塞或计划结构问题时同样停下等人处理。
- **审阅状态持久化。** review-spec 完成一次审阅后，在 spec front matter 写入 `reviewed: sha256:…`，内容是所审阅文本的哈希。之后任何修改都会让它失效。它只表示“已审阅”，不表示批准。
- **防止空转。** 编排设有无进展检测（图状态指纹不变）、review 循环上限和节点总数上限。

## 考虑过的其他方案

- **外部编排框架**（LangGraph 或基于 SDK 的脚本）：会增加运行时和依赖，而且 headless 模式下节点中途向用户提问很难处理。对当前单人迭代来说偏重。
- **让各 skill 在结束时自动调用下一个 skill**：串联责任会分散到每个节点，也违反了它们“不自动进入下一阶段”的边界。
- **由模型阅读文档判断下一步**：无法测试，也可能因为误判跳过批准。
- **用日期或独立状态文件记录审阅**：同一天内的修改用日期区分不了；另设状态文件又会造成第二份需要同步的状态。

## 后果

- 一次 `/run-task <phase/task>` 可以从创建 spec 一直推进到执行完成，用户只需在关卡上回答问题。
- ADR-0011 中的批准、提交和授权边界不变；四个 skills 仍可单独调用。
- spec 多了一个由工具写入的 `reviewed` 元数据字段，见[文档约定](../README.md#文档元数据)。
- 路由依赖 spec、goal、subtask 模板的现有标题与表格格式。修改模板时须同步更新 `tools/task-state.ts` 及其测试。
