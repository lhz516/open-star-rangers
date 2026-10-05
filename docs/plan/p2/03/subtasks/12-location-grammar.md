---
type: plan
status: active
phase: P2
task: "03"
subtask: "12"
updated: 2026-10-05
---

# 12 — 补救：诊断位置的封闭语法

**契约来源：** [spec](../spec.md) 的 S-10、AC-10，以及[错误码](../spec.md#错误码)中“本任务产生的错误”的位置形式。来自 [10](./10-final-alignment.md) 首次最终对齐发现的缺口。
**依赖：** 02, 04。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **内存解析：** 辅助函数收到不属于这些字节的条目时，报告 `invalid-request`，位置改为 spec 已有的 `request.id`，不再使用 `request.entry`，也不回显调用者提供的值。
- **白名单读取器：** 文件列表缺失、不是数组或为空时，位置改为 `catalog`，不再使用文件列表根部的 `catalog.files`。逐项位置 `catalog.files[i]` 及其字段名不变；只有这些已批准的形式会被报告。
- **测试：** 同步调整对应断言。增加回归测试，断言所有 P2-03 错误位置都符合 spec 的位置语法（`archive[:/路径][…]`、`file:/路径`、`catalog…`、`request.path|id|type`、`sources.…`）。

## 不包含

- 修改 spec 的位置语法、错误码或其他错误的位置。

## 关键文件与契约

- **修改：** [imfat.ts](../../../../../src/original-data/imfat.ts)、[imfat.test.ts](../../../../../src/original-data/imfat.test.ts)、[source-catalog.ts](../../../../../src/original-data/source/source-catalog.ts)、[source-catalog.test.ts](../../../../../src/original-data/source/source-catalog.test.ts)，必要时更新[源码结构](../../../../engineering/source-structure.md)。

## 验收标准

- [ ] AC-10：不属于这些字节的条目在 `request.id` 报 `invalid-request`；白名单文件列表缺失、非数组或为空时在 `catalog` 报 `invalid-catalog`。
- [ ] 回归测试证明所有 P2-03 错误位置都符合 spec 的封闭语法，诊断仍不含调用者的值。
- [ ] `pnpm exec vitest run src/original-data`、`pnpm typecheck`、`pnpm lint` 与 `pnpm check` 通过。

## 验证方法

- 调整并扩展 Node 测试；对位置映射做变异检查。
- 不适用 browser-testing 或原版对照。

## 完成证据
