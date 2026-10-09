---
type: plan
status: active
phase: P2
task: "13"
subtask: "09"
updated: 2026-10-08
---

# 09 — 用户在最终候选上的复核

**契约来源：** [spec](../spec.md) 的 S-03、AC-06 与 AC-12；技术决定 4。由 [01 的问题 P-1](./01-candidate-evidence-map.md#问题ac-12) 引出，按 goal 的[代码现状与前提](../goal.md#代码现状与前提)由协调者新增。
**依赖：** 无。
**执行方式：** 需用户：在真实机器上用本地生产预览与 Chrome 导入自己的光盘，确认导入、缓存恢复与模型、SNIP 帧的查看。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 由用户本人在真实机器上手工完成，agent 不代替：按[本地导入指南的用户实机核对](../../../../guides/local-import.md#用户实机核对)，用本地生产预览（`pnpm build` 后 `pnpm preview`，带拟定 CSP）与 Chrome，经真实界面导入自己的基准 CCD/IMG。
- 只重做 [P-1](./01-candidate-evidence-map.md#问题ac-12) 中受影响的部分：
  1. 识别出版本，依次出现 `Complete resources, viewable`、`Saved in this browser`、`Mission loads into Core`；
  2. 同源、同一 profile 刷新后经 `Open saved resources` 恢复成功，任务再次可载入；
  3. 在查看器中打开玩家、一种敌机与基地模型，以及至少一个 SNIP 帧，没有错误；
  4. 记录页面显示的作业、保存与恢复耗时，Chrome 完整版本与日期。
- 试听与其余查看类别沿用 [P2-11/19](../../11/subtasks/19-user-real-machine-check.md#完成证据)，不重做。
- agent 的工作：确认用户所用检出的构建输入与最终候选一致，准备命令与清单，记录用户给出的结论。用户未完成前本子任务保持 `in-progress` 或 `blocked`，执行记录写明等待用户。

## 不包含

- agent 浏览器验证或自动 E2E 中使用原版数据；原版保真判定。
- 修改代码、指南或其他任务的记录。

## 关键文件与契约

- [本地导入指南](../../../../guides/local-import.md#用户实机核对)；[P2-11 AC-21](../../11/spec.md#验收标准)。
- 最终候选以 [05](./05-real-data-candidate.md) 记录的提交、构建指纹（预期 `ec5af1f5…f690`）与 `ContentIdentity` 为准。用户所用的提交与 `f925d21` 之间不得有构建输入差异；若之后有修复改变了生产输出，须在新的候选上重做。

## 写入范围

- 无（只写本文档）。

## 验收标准

- [ ] 用户确认上述 4 项，记录日期、Chrome 完整版本、所用提交、各项结论与三项耗时。
- [ ] 所用提交的构建输入与最终候选一致（或其构建指纹等于 05 的记录）。
- [ ] 证据不含原版画面、文字或声音；截图（如有）只留在 `local/`。

## 验证方法

- 用户手工核对；agent 只记录结论，并以 `git diff` 核对构建输入。不涉及代码改动，不需要 simplify；按 execute-goal 做 rubber-duck 审阅证据是否覆盖 P-1 的每一项。

## 完成证据

