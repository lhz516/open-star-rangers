---
id: ADR-0001
type: adr
status: accepted
phase: all
updated: 2026-10-01
related: []
---

# ADR-0001：文档结构与进度跟踪

> “进度只记录在 STATUS”的条款已由 [ADR-0011](./ADR-0011-spec-goal-workflow.md) 更新为分层跟踪；长期知识组织等其余决定保留。以下正文保留原始决定。

## 背景

项目跨越 P0–P6 多个阶段，由人和 coding agent 共同推进。需要让读者快速找到上下文，避免同一事实在多处出现并逐渐不一致，并且能看清进度。

## 决定

- 按生命周期组织文档：总计划（稳定）、ADR 与评审记录（只追加）、STATUS 与待确认登记表（活文档）、原版知识与指南（参考类）。结构见 [docs/README.md](../README.md)。
- 进度只记录在 [STATUS.md](../STATUS.md)，不使用 GitHub Issues/Projects。
- 使用稳定 ID：`U-###`、`B-###`、`ADR-NNNN`。每篇文档带 YAML front matter。
- 根目录的 `AGENTS.md` 是 agent 入口。语言：`AGENTS.md`、格式文档和代码用英文，其余文档用中文。

## 考虑过的其他方案

- 按阶段建目录（`p0/`、`p1/`…）：阶段结束后，知识散落在旧阶段目录里，难以查找。
- 用 GitHub Issues 跟踪任务：单人阶段过重，agent 也不能离线直接读写。

## 后果

- agent 收工前须更新 STATUS、待确认登记表和文档日期（见 `AGENTS.md`）。
- 有协作者后，可另写 ADR 引入 Issues。
