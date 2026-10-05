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

- [x] AC-10：不属于这些字节的条目在 `request.id` 报 `invalid-request`；白名单文件列表缺失、非数组或为空时在 `catalog` 报 `invalid-catalog`。
- [x] 回归测试证明所有 P2-03 错误位置都符合 spec 的封闭语法，诊断仍不含调用者的值。
- [x] `pnpm exec vitest run src/original-data`、`pnpm typecheck`、`pnpm lint` 与 `pnpm check` 通过。

## 验证方法

- 调整并扩展 Node 测试；对位置映射做变异检查。
- 不适用 browser-testing 或原版对照。

## 完成证据

- **实现：**
  - [imfat.ts](../../../../../src/original-data/imfat.ts) 对不属于这些字节的条目报告 `invalid-request`，位置为 `request.id`，不回显调用者的值。
  - [source-catalog.ts](../../../../../src/original-data/source/source-catalog.ts) 的 `CATALOG_LOCATION` 不再接受根部的 `catalog.files`；文件列表缺失、非数组或为空时报告在 `catalog`。
- **语法回归：**
  - 新增 [source-error.test-support.ts](../../../../../src/original-data/source-error.test-support.ts) 的 `inLocationGrammar`：按 spec 独立写出封闭语法，光盘路径部分复用 P2-02 的 `isDiscPath`。
  - [source-error.test.ts](../../../../../src/original-data/source-error.test.ts) 列出接受与拒绝样例，包括 `request.entry`、根部 `catalog.files`、9 段路径与非法字符。
  - imfat、archive-reader、source-catalog（含不回显测试）、identify-source、verify-source-mappings（含上限测试）的失败辅助都断言位置属于该语法。
- **变异检查：** 恢复 `request.entry` 使 1 个测试失败；让 `CATALOG_LOCATION` 接受根部 `catalog.files` 使 3 个测试失败。两次都在 simplify 之后重跑确认。
- **检查：**
  - `pnpm exec vitest run src/original-data`：684 个测试通过；
  - `tsc -p tsconfig.core.json`、`tsc -p tsconfig.node.json`、`eslint src/original-data` 通过；
  - `pnpm check`：87 个测试文件 2,342 个测试与构建通过。
- **Rubber-duck：** 采纳三项：语法中的光盘路径限制为 1–8 段；不回显测试与映射上限测试也断言位置语法；文件列表非数组时同样报告在 `catalog`。
- **Simplify（一个代理覆盖四个角度）：** 采纳一项：光盘路径改用生产的 `isDiscPath` 校验，不再在测试中复写段规则。未采纳一项：测试中的 catalog 分支不复用生产的 `CATALOG_LOCATION`；该分支是从 spec 独立写出的判定依据，复用会让生产偏差无法被发现。
- **文档影响：** [源码结构](../../../../engineering/source-structure.md)写明位置语法及其测试判定依据；[02 的完成证据](./02-archive-rules-memory.md)注明 `request.entry` 已由本补救取代。其他工程约定与指南不受影响。
