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

- [x] 受跟踪文件中不再有原版界面按钮标签；事实、地址、置信度与链接不变。
- [x] 改动文档的 `updated:`、链接与锚点有效；`pnpm check:compliance` 与 `pnpm check:original` 通过。

## 验证方法

- `git grep` 检查；文档链接与锚点检查；`git diff` 审阅。

## 完成证据

2026-10-09，worker 15（分支 `exec-p3-02-15`，基于认领提交 4180097）。

**改动（只改按钮称呼，四行）：**
- [executable](../../../../original/formats/executable.md#spawn-queue-p3-0203) 选择页一条：两个改序号的按钮改称“翻图按钮（键 `u`、`d`）”，确认按钮按功能称呼并保留键（`x`、Enter、空格）与回调 `0x367e4`。没有采用“上一张/下一张”：`u` 使序号 +1，称其为“上一张”会多出一条未追踪的显示次序断言。
- 同节运行时一条：改为实际所按的键，即僚机章节按一次 `d` 后按 Enter（与 10 的完成证据及 [B-007](../../../../original/behavior/B-007-mission-instantiation.md) 的操作记录一致）。
- B-007 僚机选择一条、[unknowns](../../../../original/unknowns.md) U-023 一行：改为“翻图按钮（`u`/`d`）”与“确认按钮（`x`、Enter、空格）”；U-023 的状态与负责阶段不变。
- 地址、置信度标签、序号与选择值的对应、链接均未改动（`git diff --word-diff` 逐处核对）。

**检查：**
- `git grep -n -w` 分别查三个标签：受跟踪文件中无匹配；向上标签的唯一词匹配是 `src/original-data/disc/iso9660-directory.test.ts` 中的合成 ISO 目录名，不是界面文字。
- 本 goal 新增或改动的其他文档（`git diff $(git merge-base main HEAD) HEAD -- docs` 的新增行）：扫描全大写词、首字母大写词与引号内文字，未发现其他原版界面文字或人物名称；`SRANGER.CFG` 的设置键早于本 goal 已在既有文档中，不是界面标签。无需另改。
- 三份文档的 `updated:` 已是 2026-10-09；GitHub 锚点规则的链接检查（三份文档与本文档）：382 个相对链接与锚点，0 个失效。
- `pnpm check:compliance` 与 `pnpm check:original`：退出码 0，`passed: true`。

**Rubber-duck：** 未发现问题；它核对了事实、地址、置信度与链接不变，运行时一条的 `d` + Enter 有记录支持，U-023 补写按键不构成新断言，goal 其余新增文档中无同类文字。

**Simplify：** 只改文档，不需要。

**文档影响：** 改动本身即文档；`docs/engineering/`、`docs/guides/`、STATUS 与阶段索引不受影响。U-023 只改称呼，状态不变。
