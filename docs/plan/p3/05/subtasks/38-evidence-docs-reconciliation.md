---
type: plan
status: active
phase: P3
task: "05"
subtask: "38"
updated: 2026-10-12
---

# 38 — 证据文档与共享批准记录收尾

**契约来源：** [spec](../spec.md) S-15、AC-01、AC-02、AC-19；[共享契约前提](../spec.md#执行前提)。
**依赖：** 11、31、32、34。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 在 P3-01 spec 追加本次用户对现有 G-08 修订的明确批准；保留此前历史记录，不追溯宣称当时已明确批准。
- 核对并收尾 31 的现有未提交证据（不豁免 AC-18），补文档检查与审阅记录。
- 键位指南的 Q-05 基地缺口链接至 34 成功证据；核对 32 的逐项验收并同步勾选。
- 原版事实仍只在 original；不改行为、范围或冻结决定。

## 写入范围

- `docs/plan/p3/01/spec.md`：批准追加记录。
- `docs/plan/p3/05/subtasks/11-p3-01-g08-sync.md`
- `docs/plan/p3/05/subtasks/31-real-device-physical.md`
- `docs/plan/p3/05/subtasks/32-comparison-docs.md`
- `docs/engineering/keyboard-input.md`
- `docs/README.md`：文档影响核对发现的键位指南索引旧描述，限当前实现范围说明，不改契约。

## 验收标准

- [x] G-08 共享修订有本次明确批准记录，未伪造历史授权。
- [x] 31 的合格证据与未通过 AC-18 的限定一致，32 的勾选逐项有证据。
- [x] Q-05 基地状态与 34 一致，链接、元数据与合规检查通过。

## 验证方法

- 文档/实现/私有证据对照，router、链接与元数据检查，`pnpm check:compliance`，一次 scoped rubber-duck。

## 完成证据

- P3-01 审批追加本次用户“明确批准该 G-08 修订（推荐）”，11 追加更正；保留 2026-10-10 自主采用的历史记录，不追溯授权，也未改绑定/范围。
- 审阅并收录 31 保留的六份 replay 结论与两个验收；31 的未满足项仍标为当时未满足，链接 37 的后续原生/物理补证。32 的四个勾选以现有工程检查和本次文档/源码核对满足，不把历史测试改写为新运行。指南 Q-05 基地状态指向 34 的成功证据，保留 BIOS 码到动作与物理路径的区别。
- 对照 `bindings.ts` 的修饰、上下文、动作与重复规则；Node 导入生产表核对指南覆盖全部 74 个 code / 120 条绑定，修正遗漏的 `NumpadDivide`、能量 Shift 说明、Alt+`KeyP` 和 `Numpad2` 上下文的文档措辞，无实现变化。P3-07 的 `589d780b` 仍非本分支祖先，交叉引用保留。
- `pnpm check:compliance` 本次通过（`passed: true`）；15 份相关文档相对链接/锚点 0 问题，8 份改动文档 `updated: 2026-10-12`，`git diff --check` 通过。p3/01 router 为 `done`、`details: []`，p3/05 正确路由到本项、`details: []`。
- 一次 scoped rubber-duck 无阻断或非阻断发现。文档影响额外核对并更新 docs 索引中的键位指南旧描述（已补写入范围）；goal 的顺序恢复记录移回执行记录。没有新原版事实、冻结决定或项目级优先级变化，不改 STATUS；无实现代码，不需 simplify。完整工程与 e2e 复验留给 33。
