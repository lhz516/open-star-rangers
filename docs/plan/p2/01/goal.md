---
type: plan
status: accepted
phase: P2
task: "01"
updated: 2026-10-03
---

# P2-01：切片资源边界与内容契约 — Goal

## 目标与来源

实现已批准的 [P2-01 spec](./spec.md) 中的 S-01 至 S-12 与 AC-01 至 AC-13：取得选定任务候选的本地资格证据，建立纯 `content/` 规范内容契约、`original-data/` 来源映射边界、四组资源和依赖闭包验证、版本/来源身份、预算/所有权规则及合成测试。候选资格证据尚未取得；若首选和确定性回退均不合格，相关子任务必须保持 blocked，不能以临时资源完成。

## 代码现状与前提

- [imfat.ts](../../../../src/original-data/imfat.ts)、[payloads.ts](../../../../src/original-data/payloads.ts)和[synthetic.ts](../../../../src/original-data/synthetic.ts)已提供原版格式解析/合成字节基础，但没有 Asset ID、内容清单或来源映射契约。
- `src/content/`、正式来源选择模块和本任务测试文件尚不存在；它们是计划新增文件，必须保持在 `tsconfig.core.json` 的纯模块边界内。
- [P2 tasks](../tasks.md)、[P0 可行性评审](../../../reviews/P0-feasibility.md)及 [U-003/U-022/U-023](../../../original/unknowns.md)提供研究范围；本地合法原版数据只读研究留在 `local/`，公开文档仅记录安全结构结论。
- 外部前提：必须能访问开发者本地基准数据以取得候选资格证据；无数据或语义无法区分时，01 进入 blocked，不能用合成 fixture 代替。

## 验收覆盖

| Spec 范围项/验收项 | 实现子任务 | 验证子任务及方法 |
|---|---|---|
| S-01 | 01、02 | 07 核对本地资格证据与唯一生产切片定义一致 |
| S-02 | 01、02 | 07 核对回退选择链与重新批准记录 |
| S-03 | 01、02 | 06 角色基数正负测试 |
| S-04 | 02 | 06 Asset ID 语法、稳定性与引用测试 |
| S-05 | 02、03 | 06 版本、manifest 与来源判别测试 |
| S-06 | 03 | 07 来源隔离与文档事实归属检查 |
| S-07 | 04 | 06 依赖闭包与完整性推导测试 |
| S-08 | 04 | 06 组级/全包与混装拒绝测试 |
| S-09 | 05 | 06 十二维预算、溢出与缺失维度测试 |
| S-10 | 02、05 | 06 结构化克隆与 TypedArray 所有权测试 |
| S-11 | 01、03 | 07 U 项置信度与下游责任链接检查 |
| S-12 | 06 | 07 合成隔离、纯模块与工程检查 |
| AC-01 | 01、02 | 07 候选结论与生产定义一致性复核 |
| AC-02 | 02 | 06 角色与组基数断言 |
| AC-03 | 02 | 06 Asset ID 稳定性与跨资源引用断言 |
| AC-04 | 02、03 | 06 身份字段与合成/原版来源判别断言 |
| AC-05 | 03 | 06 locator 映射、冲突与缺失诊断断言 |
| AC-06 | 04 | 06 完整性推导与不可伪造布尔断言 |
| AC-07 | 04 | 06 四组独立、跨组要求与混装拒绝断言 |
| AC-08 | 05 | 06 预算维度、边界与溢出断言 |
| AC-09 | 05 | 06 所有权隔离与 transfer 失效断言 |
| AC-10 | 01、03 | 07 本地资格证据与 U 项状态复核 |
| AC-11 | 06 | 07 `pnpm check:original`与 diff 审阅 |
| AC-12 | 06 | 07 `pnpm check`与依赖/锁文件无变化检查 |
| AC-13 | 03 | 07 文档链接、元数据与导出一致性检查 |
| 风险恢复与阻塞门禁 | 07 | 07 `node tools/task-state.ts`与最终 diff 审阅 |

## 子任务跟踪

状态只在此维护：`pending` / `in-progress` / `blocked` / `completed`。依赖项全部 completed 后才能开始；验收结果和证据写在相应 subtask 文档，不在阶段索引重复状态。

| 子任务 | 依赖 | 状态 |
|---|---|---|
| [01-candidate-qualification.md](./subtasks/01-candidate-qualification.md) | — | pending |
| [02-slice-content-contract.md](./subtasks/02-slice-content-contract.md) | 01 | pending |
| [03-source-mapping-boundary.md](./subtasks/03-source-mapping-boundary.md) | 01, 02 | pending |
| [04-completeness-validation.md](./subtasks/04-completeness-validation.md) | 02, 03 | pending |
| [05-budget-ownership-contract.md](./subtasks/05-budget-ownership-contract.md) | 02 | pending |
| [06-synthetic-contract-tests.md](./subtasks/06-synthetic-contract-tests.md) | 02, 03, 04, 05 | pending |
| [07-final-alignment.md](./subtasks/07-final-alignment.md) | 01, 02, 03, 04, 05, 06 | pending |

最后一行始终为最终对齐验证，依赖所有其他子任务；ID 固定，不在执行中重排。

## 执行记录

## 审批

用户于 2026-10-03 明确批准关联 spec 与本 goal，批准范围为上述 7 个子任务的拆分、依赖关系和验收覆盖。批准不代表实现完成；执行仍须逐项取得证据，候选资格未满足时相关子任务保持 blocked。
