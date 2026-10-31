---
type: plan
status: active
phase: "P3"
task: "16"
subtask: "02"
updated: "2026-10-30"
---

# 02 — P3-03 覆盖映射

**契约来源：** [spec](../spec.md) 的 S-02、AC-02、[技术决定](../spec.md#技术决定) 8。
**依赖：** 无。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 核对 [P3-03 spec](../../03/spec.md) 的 S-18 与 AC-22（修订 2）在 [P3-10/29](../../10/subtasks/29-comm-messages-import.md#完成证据) 中的完成证据，以及 S-19 与 AC-23（修订 3）在 [P3-08/13](../../08/subtasks/13-ai-static-data-import.md#完成证据) 中的证据。核对时逐条对照 AC 的正向、拒绝、版本与缓存、真实镜像各部分。
- **证据完整时：** 在 [P3-03 goal](../../03/goal.md#验收覆盖) 的覆盖表补四行，实现与验证列指向交付任务的子任务；并在其执行记录加一条说明：修订由交付任务实现，P3-03 goal 不重新打开，本次只补映射。不改 P3-03 的子任务、依赖、状态或历史证据。
- **证据不完整时：** 不补对应行，在本文档写明缺口、原责任与恢复条件，交 16。

## 不包含

- 重做 AC-22、AC-23 的测试或本地核对；修改 P3-03 spec。

## 关键文件与契约

- [P3-03 goal](../../03/goal.md)；[tools/task-state.ts](../../../../../tools/task-state.ts) 的 `coveredIds` 只读覆盖表第一列的 S/AC 编号。

## 写入范围

- `docs/plan/p3/03/goal.md`：只加四行覆盖映射与一条执行记录，并更新 `updated:`。

## 验收标准

- [ ] AC-02：四项的交付证据已核对，结论逐项写明。
- [ ] AC-02：P3-03 goal 的差异只有四行映射、一条执行记录与日期；`node tools/task-state.ts p3/03` 为 `done`，或缺口已列为问题。
- [ ] 链接与锚点可解析。

## 验证方法

- `git --no-pager diff docs/plan/p3/03/goal.md`；`node tools/task-state.ts p3/03`；链接检查。

## 完成证据
