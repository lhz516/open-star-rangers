# Goal 模板

输出到 spec 同目录的 `goal.md`，不复制执行 skill 的通用规则。替换全部占位符；“执行记录”初始为空。审批初始待确认，tracker 初始全为 `pending`。下面链接相对生成后的 goal。

```markdown
---
type: plan
status: draft
phase: "[PHASE]"
task: "[TASK]"
updated: "[YYYY-MM-DD]"
---

# [任务 ID]：[标题] — Goal

## 目标与来源

实现已批准的 [spec](./spec.md) 中的 [S/AC 编号与目标摘要]。本文件不重新定义行为契约。

## 代码现状与前提

- [真实类型/模块/测试文件的相对链接及当前行为。]
- [尚未存在、由本任务计划新增的具体文件。]
- [其他任务或环境的必要前提，以及如何证明前提已满足；无则写无。]
- [原版证据与所需的实机/本地对照前提；不适用时说明。]

## 验收覆盖

| Spec 范围项/验收项 | 实现子任务 | 验证子任务及方法 |
|---|---|---|
| [S-01] | [子任务 ID] | [子任务 ID 与方法] |
| [AC-01] | [子任务 ID] | [子任务 ID 与精确检查] |

## 子任务跟踪

状态只在此维护：`pending` / `in-progress` / `blocked` / `completed`。依赖项全部 completed 后才能开始；验收结果和证据写在相应 subtask 文档，不在阶段索引重复状态。并行执行时，本表与执行记录只由协调者修改。

| 子任务 | 依赖 | 状态 |
|---|---|---|
| [01-[slug].md](./subtasks/01-[slug].md) | — | pending |
| [02-[slug].md](./subtasks/02-[slug].md) | 01 | pending |
| [03-final-alignment.md](./subtasks/03-final-alignment.md) | 01, 02 | pending |

最后一行始终为最终对齐验证，依赖所有其他子任务。ID 分配后保持不变；新增修复项使用新 ID，插入最终验证之前并加入其依赖，不要求最终验证拥有最大的数字。

## 执行记录

## 审批

待用户确认。用户明确批准本 goal，或明确调用 execute-goal 后，记录批准日期与范围并将 front matter 的 status 改为 accepted。这不代表实现完成，也不替代 spec 批准。
```
