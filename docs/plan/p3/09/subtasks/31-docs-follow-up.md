---
type: plan
status: active
phase: P3
task: "09"
subtask: "31"
updated: 2026-10-14
---

# 31 — 文档与注释的后续同步（修复）

**契约来源：** [spec](../spec.md) 的 S-12、AC-16；goal 执行记录中“26 已集成”的遗留项与“22 已集成”后 22 提出的文档建议。
**依赖：** 22, 26。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 22 引入的测试支持与观察途径：[源码结构指南](../../../../engineering/source-structure.md)（约第 486 行，任务画面证据也经 `e2e/support/map-warp.ts` 以 React fiber 只读读取任务 UI store）；[工程指南](../../../../engineering/README.md)的“观察”（约第 186 行，加入 `map-warp.ts`）与约第 177 行（`missionPackage()` 的合成玩家现在可以完成 Warp）；[original-data 模块分册](../../../../engineering/modules/original-data.md)（约第 152 行，`productionCraftInfo()` 玩家记录的能量与 Warp 字段）。逐条对照代码核实后再写。
- `src/core/systems/area.ts` 第 13 行附近的模块注释仍说玩家 Warp 期间的区域中心“在标记处接入”，实际已由 `rules/active-area.ts` 的 `activeAreaCentre` 实现：更正注释，不改行为。

## 不包含

- 新的规则或测试行为。

## 关键文件与契约

- 22、26 的完成证据；goal 执行记录。

## 写入范围

- `docs/engineering/source-structure.md`、`docs/engineering/README.md`、`docs/engineering/modules/original-data.md`
- `src/core/systems/area.ts`：只改模块注释。

## 验收标准

- [ ] 上述文档与代码一致，`updated:` 与链接有效；`pnpm check:compliance` 通过。
- [ ] `area.ts` 注释与实现一致，没有行为改动；`pnpm check` 通过。

## 验证方法

- 链接与锚点核对；`pnpm check`；git 审阅。

## 完成证据
