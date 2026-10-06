---
type: plan
status: active
phase: P2
task: "09"
subtask: "07"
updated: 2026-10-05
---

# 07 — 条件交付：非封包参数 locator（研究后不适用）

**契约来源：** [spec](../spec.md) 的 S-12、AC-12；[空间框架的研究结论](../spec.md#空间框架的研究结论)。
**依赖：** 02。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **记录不适用依据：** 修订后的 spec 记录 S-02 为结论 2，地图框架来自所选 SCEN，S-12 不适用。本子任务核对 02 写入 `docs/original/` 的结论与 spec 一致，在证据中记录结论、文档位置与不适用依据，不修改代码，然后完成。
- **若 02 的记录与结论 2 不符：** 本子任务改为 blocked，按研究门槛修订 spec。

## 不包含

- 非封包 locator 的实现；封包条目 locator 的任何行为变化；地图框架的规范化（09）。

## 关键文件与契约

- **只读核对：** 02 修改的 `docs/original/` 文档；[source-mapping.ts](../../../../../src/original-data/source-mapping.ts) 不修改。

## 验收标准

- [ ] AC-12：证据记录 02 的结论 2、文档位置与不适用依据；`OriginalAssetLocator` 的形状与校验没有改动（`git diff` 不含 source-mapping.ts）。

## 验证方法

- 文档核对与 diff 检查；完成前按 execute-goal 流程做 rubber-duck 审查。没有实现代码，不需要 simplify。
- 不适用 browser-testing。

## 完成证据
