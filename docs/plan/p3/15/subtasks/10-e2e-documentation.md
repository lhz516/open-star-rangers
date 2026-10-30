---
type: plan
status: active
phase: "P3"
task: "15"
subtask: "10"
updated: "2026-10-29"
---

# 10 — 联合验证回归的工程文档

**契约来源：** [spec](../spec.md) 的 S-09、[验证策略](../spec.md#验证策略)；AC-10 的文档部分。
**依赖：** 01、02、03、04。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 在 [工程约定](../../../../../docs/engineering/README.md) 的 Playwright 回归说明中增加 P3-15 一条：四个新用例文件的项目归属、所用变体包与观察来源、真实隐藏对未锁屏桌面的要求、聚焦运行命令，以及“只声明同一运行时 replay 一致、警告用例不代替人耳判定”的限度；链接本任务 subtask 证据。
- 更新文档的 `updated` 日期。

## 不包含

- 修改用例或产品代码；状态与阶段摘要（只由协调者维护）。

## 关键文件与契约

- [docs/engineering/README.md](../../../../../docs/engineering/README.md)。

## 写入范围

- `docs/engineering/README.md`：P3-15 回归说明。

## 验收标准

- [ ] 说明与 01–04 的实际用例、命令和限制一致；相对链接与元数据检查通过。

## 验证方法

- 文档审阅；链接检查；命令与 `playwright.config.ts` 的项目匹配规则核对。

## 完成证据
