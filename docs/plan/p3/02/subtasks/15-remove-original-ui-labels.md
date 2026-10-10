---
type: plan
status: active
phase: P3
task: "02"
subtask: "15"
updated: 2026-10-09
---

# 15 — 移除原版界面按钮文字

**契约来源：** [AGENTS.md](../../../../../AGENTS.md) 的硬规则（不提交原版文字）；[spec](../spec.md) 的 AC-14（仓库中没有原版内容）。
**依赖：** 10。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 背景

最终对齐（12）发现 10 新写入的三处文档逐字引用了原版出发前页面上的三个按钮标签（简报页右下角的三个按钮）。这些标签是原版界面文字，按硬规则不能进入受跟踪文件。既有文档的做法是只描述按钮（如 [B-001](../../../../original/behavior/B-001-strategic-map.md) 的“带三字母标签的按钮”），不引用标签。

## 工作范围

- 在下列三处把按钮标签改为按功能与按键描述（例如“上一张/下一张按钮（`u`/`d`）”“确认按钮（`x`、Enter、空格）”），事实、地址、置信度与链接保持不变：
  - `docs/original/formats/executable.md` 的选择页与运行时两条（P3-02/10）；
  - `docs/original/behavior/B-007-mission-instantiation.md` 的僚机选择一条；
  - `docs/original/unknowns.md` 的 U-023 一行。
- 用 `git grep` 确认受跟踪文件中不再有这三个标签；顺带检查本 goal 新增或改动的其他文档中有无同类界面文字，发现时一并改为描述，并在完成证据中列出。

## 不包含

- 其他事实或结论的修改；`local/` 中的私有文件（操作手册等不受跟踪）。

## 关键文件与契约

- [executable](../../../../original/formats/executable.md)、[B-007](../../../../original/behavior/B-007-mission-instantiation.md)、[unknowns](../../../../original/unknowns.md)。

## 写入范围

- `docs/original/formats/executable.md`：选择页与运行时两条的按钮描述。
- `docs/original/behavior/B-007-mission-instantiation.md`：僚机选择一条的按钮描述。
- `docs/original/unknowns.md`：U-023 一行的按钮描述（状态与负责阶段不改）。

## 验收标准

- [ ] 受跟踪文件中不再有原版界面按钮标签；事实、地址、置信度与链接不变。
- [ ] 改动文档的 `updated:`、链接与锚点有效；`pnpm check:compliance` 与 `pnpm check:original` 通过。

## 验证方法

- `git grep` 检查；文档链接与锚点检查；`git diff` 审阅。

## 完成证据
