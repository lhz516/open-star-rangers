---
type: plan
status: active
phase: P3
task: "04"
subtask: "16"
updated: 2026-10-10
---

# 16 — 历史文档的失效源码链接

**契约来源：** [spec](../spec.md) 的 S-10 与[合成演示退役](../spec.md#合成演示退役)的“文档与历史链接”；AC-18（文档部分）。
**依赖：** 15。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 在 `docs/plan/p1/`、`docs/plan/p2/`、`docs/plan/p3/02/` 与本任务 spec 中，把指向 13 删除的源码文件或目录的 Markdown 链接，改为指向 15 新增的退役记录中对应条目的锚点。只改链接目标与必要的 `updated:`，不改文字、批准记录、S/AC 或历史结论。
- 已批准 spec 的源码链接修订使旧的 `reviewed:` 摘要失效：按 [ADR-0015](../../../../decisions/ADR-0015-source-module-structure.md) 的先例删除过期标记，保留批准与契约，不伪造重新审阅。本任务 spec 同样只改链接目标。
- `docs/plan/p3/tasks.md` 中的同类链接归协调者：在完成证据中列出需改的行与建议目标，由协调者修改。
- 核对 `docs/reviews/` 与 `docs/decisions/` 中没有指向被删路径的链接；如发现，同样只改链接目标并列出。
- 本任务已完成子任务文档（`docs/plan/p3/04/subtasks/`）中指向被删源码的链接，同样只改链接目标（协调者于 2026-10-10 加入）。
- 15 改名的工程 README 小节使 6 个历史锚点失效（`#合成-runtime`、`#合成渲染`、`#页面流转与演示生命周期`，位置见 goal 执行记录“15 完成”）：同样只改链接目标，指向[退役记录 R10](../../../../engineering/source-structure.md#r10-菜单入口键位与工程文档)（协调者于 2026-10-10 加入）。

## 不包含

- 当前工程文档（15）；协调者拥有的 `goal.md`、阶段 `tasks.md` 与 `docs/STATUS.md`。

## 关键文件与契约

- 修改：起草时约 76 份历史任务文档（P1 约 69 份、P2 约 8 份、P3-02 约 5 份）与本任务 spec；以执行时的 `git grep` 结果为准。

## 写入范围

- `docs/plan/p1/**`：只改失效链接目标与过期标记。
- `docs/plan/p2/**`：同上。
- `docs/plan/p3/02/**`：同上。
- `docs/plan/p3/04/spec.md`：只改指向被删源码的链接目标。
- `docs/plan/p3/04/subtasks/**`：只改指向被删源码的链接目标，不改验收或证据文字。
- `docs/reviews/**`：如有同类链接，只改目标。
- `docs/decisions/**`：如有同类链接，只改目标。

## 验收标准

- [ ] AC-18（文档）：受跟踪文档中没有指向被删源码路径的 Markdown 链接（协调者拥有的 `tasks.md` 已列出建议）；改写处的文字、批准与结论未变（`git diff --word-diff` 审阅）。
- [ ] 改写的已批准 spec 删除了过期的 `reviewed:` 标记，批准记录保留；`node tools/task-state.ts` 对 P1、P2、P3-02 的路由与改写前相同。
- [ ] 全仓库 Markdown 本地链接与锚点检查的失败数不多于改写前的既有失效锚点。

## 验证方法

- `git grep` 查找被删路径；链接与锚点检查；`git diff --word-diff`；对受影响任务运行 `node tools/task-state.ts`。
- 不适用浏览器与原版对照。

## 完成证据
