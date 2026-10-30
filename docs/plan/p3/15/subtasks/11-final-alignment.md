---
type: plan
status: active
phase: "P3"
task: "15"
subtask: "11"
updated: "2026-10-29"
---

# 11 — 最终对齐

**契约来源：** [spec](../spec.md) 全部 S-01 至 S-09、AC-01 至 AC-10，重点 S-09、AC-10 与[风险与恢复](../spec.md#风险与恢复)。
**依赖：** 01、02、03、04、05、06、07、08、09、10、12。
**跨任务前提：** `node tools/task-state.ts p3/14` 为 `done`。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 只做验证，不交付新功能代码：逐项核对 goal 验收覆盖表的每个 S/AC 都有完成证据，且证据针对同一集成基线（记录提交；基线变化时列出需重跑的项）。
- 运行 `pnpm check`、`pnpm test:e2e`（含网络审计）与 `pnpm check:compliance`；失败须修复（经新增修复项）并重跑，或对应验收明确 blocked 并有恢复条件。
- 核对所有交回责任任务的差异都有记录与处置状态；P3-14 的前置证据已完成；08 汇总中 01、04、07 的闭环级结论引用正确。
- 审阅 `git status`、diff 与已跟踪文件：无原版字节、截图、音频、录制、反编译输出或本机研究文件被追踪。
- 缺口作为新的修复子任务插入本项之前，不在本项实现。

## 不包含

- 新功能、P3 退出判定（P3-16）、推送或部署。

## 关键文件与契约

- [goal](../goal.md)、01–10 的完成证据、`docs/plan/p3/15/comparison-summary.md`。

## 写入范围

无。

## 验收标准

- [ ] 每个 S-01 至 S-09、AC-01 至 AC-10 都有对应完成证据或明确的 blocked 记录与恢复条件；没有以代理检查冒充实机、原版或人工证据。
- [ ] `pnpm check`、`pnpm test:e2e`、`pnpm check:compliance` 在最终基线上通过。
- [ ] P3-14 为 `done`；git 审阅确认无原版或私有研究材料被追踪；文档链接与元数据通过。

## 验证方法

- 运行上列命令并保存摘要；`node tools/task-state.ts p3/14`；逐项核对证据链接；`git status --short` 与 `git ls-files` 审阅。

## 完成证据
