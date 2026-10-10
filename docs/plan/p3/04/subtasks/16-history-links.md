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

- [x] AC-18（文档）：受跟踪文档中没有指向被删源码路径的 Markdown 链接（协调者拥有的 `tasks.md` 已列出建议）；改写处的文字、批准与结论未变（`git diff --word-diff` 审阅）。
- [x] 改写的已批准 spec 删除了过期的 `reviewed:` 标记，批准记录保留；`node tools/task-state.ts` 对 P1、P2、P3-02 的路由与改写前相同。
- [x] 全仓库 Markdown 本地链接与锚点检查的失败数不多于改写前的既有失效锚点。

## 验证方法

- `git grep` 查找被删路径；链接与锚点检查；`git diff --word-diff`；对受影响任务运行 `node tools/task-state.ts`。
- 不适用浏览器与原版对照。

## 完成证据

- **改写范围：** 86 份文档的 420 个链接目标（P1 68 份 382 处，P2 8 份 15 处，P3-02 4 份 11 处，本任务 spec 与 5 份子任务文档 12 处）。414 处指向 13 删除的文件或目录（`git diff --name-only --diff-filter=D 84a3f454 HEAD` 的 57 个文件及 `src/core/synthetic/`、`src/render/synthetic/`、`src/ui/render/`），按路径改指[退役记录](../../../../engineering/source-structure.md#p3-04-合成演示退役记录)的 R1（123）、R2（24）、R3（41）、R4（53）、R5（68）、R6（58）、R7（42）、R8（5）；另 6 处被 15 改名的工程 README 锚点改指 R10。R9 的 lint 规则所在文件未被删除，没有需要改指的链接。`docs/plan/p1/08/spec.md` 的 `src/ui/render/` 目录链接在基线中不含 “synthetic” 字样，但该目录由 13 删除并记入 R7，一并改指。
- **只改目标：** 每份文件把链接目标、`updated:` 与 `reviewed:` 规范化后与改写前逐字相同，链接数与链接文字不变；`git diff --word-diff` 抽查与 rubber-duck 复核一致。代码块与行内代码中没有命中；范围外（含 `docs/reviews/`、`docs/decisions/`、阶段 `tasks.md`）没有需要改的链接，协调者拥有的文件未改。
- **审阅标记：** 按 [ADR-0015](../../../../decisions/ADR-0015-source-module-structure.md) 的先例（`b23683b0`）删除 9 份已批准 spec 的 `reviewed:`：P1-07、P1-08、P1-09、P1-10、P2-04、P2-09、P2-11、P3-02 与本任务 spec。改写前用 `specReviewHash` 核对，这 9 个标记都已因批准后的修订失效；批准记录与契约保留，没有重新审阅。
- **路由：** 改写前后对 P1、P2、P3 全部 29 个任务运行 `node tools/task-state.ts <task> --json`，除内容指纹外输出相同（P1、P2、P3-01 至 P3-03 为 `done`，P3-04 为 `execute-goal`）。
- **链接检查：** 全仓库受跟踪 Markdown 的本地链接与锚点检查由 12,382 个链接中 453 处失败降为 33 处，余下的与改写前的既有失效逐条相同：`STATUS.md` 的 `#工程骨架`/`#运行骨架` 锚点 7 处，`mesh.md`/`textures.md` 锚点 5 处，skill 模板占位 9 处，`p2/13/subtasks/07-exit-review-handoff.md` 12 处。`pnpm check:compliance` 通过。
- **审阅与文档影响：** rubber-duck 复核全部 420 个目标、相对路径深度、front matter 与协调者文件，没有发现问题。纯文档改写，不需要 simplify。退役记录已说明这些链接由本子任务改指，工程文档、`docs/STATUS.md` 与阶段 `tasks.md` 无需更新。
