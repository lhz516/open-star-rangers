---
type: plan
status: active
phase: P2
task: "02"
subtask: "13"
updated: 2026-10-05
---

# 13 — CLI 关闭失败的显式报告补救

**契约来源：** [spec](../spec.md) 的 S-09；[读取、所有权与生命周期](../spec.md#读取所有权与生命周期)中“CLI 在成功、读取失败、打开失败及取消时都关闭已取得的句柄，关闭失败也必须显式报告”；AC-11。缺口由 [10 第二次最终对齐](./10-final-alignment.md#完成证据)发现。
**依赖：** 08。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- [disc-check.ts](../../../../../tools/disc-check.ts) 目前用 `error ??=` 记录关闭失败：若之前已有打开、读取或取消错误，关闭失败就不会出现在报告里。
- 报告新增关闭失败的计数，作为独立字段，不被首个错误覆盖；计数不为 0 时 `passed` 为 false。无其他错误时，`error` 仍为 `read-failed@input`。
- 补充回归测试：先取消、后关闭失败时，报告同时给出 `cancelled` 与关闭失败计数；工具指南同步说明该字段。

## 不包含

- 其他报告字段或退出码的变化。

## 关键文件与契约

- **修改：** [disc-check.ts](../../../../../tools/disc-check.ts)、[disc-check.test.ts](../../../../../tools/disc-check.test.ts)、[工具指南](../../../../guides/tools.md)。

## 验收标准

- [x] 取消后又有句柄关闭失败时，报告的 `error` 为 `cancelled`，关闭失败计数等于失败的句柄数，`passed` 为 false。
- [x] 只有关闭失败时，`error` 为 `read-failed@input`，计数正确；全部成功时计数为 0。
- [x] `pnpm exec vitest run tools/disc-check.test.ts`、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- 用可注入的打开函数制造关闭失败与取消，进程内断言报告。
- 不适用 browser-testing 或原版对照。

## 完成证据

- **实现：** [disc-check.ts](../../../../../tools/disc-check.ts) 的报告新增 `closeFailures`，即在 finally 中统计关闭被拒绝的句柄数，不受此前 `error` 影响。
  - 计数大于 0 而之前没有错误时，`error` 为 `read-failed@input`；任何关闭失败都会让 `error` 非空，因此 `passed` 为 false，退出码为 1。
  - [工具指南](../../../../guides/tools.md#光盘镜像核对)已说明这个字段。
- **测试：** [disc-check.test.ts](../../../../../tools/disc-check.test.ts)
  - 第 6 次读取时取消、且 4 个句柄关闭都失败：`error` 为 `cancelled`，`closeFailures` 为 4，4 个句柄都尝试关闭；
  - 只有关闭失败：`read-failed@input`，`closeFailures` 为 4；
  - 首个关闭同步抛错：`closeFailures` 为 1；
  - 成功时为 0。
- **变异检查：** 去掉计数后，3 个用例失败。
- **检查：**
  - `pnpm exec vitest run tools/disc-check.test.ts` 15 项通过；typecheck 与 lint 通过；
  - 完整 `pnpm check` 通过：80 个测试文件共 2087 项测试、build。
- **Rubber-duck：** 未发现问题。确认 `main()` 的退出码映射不变；usage 与 internal-error 的简短输出不是核对报告，不含计数并不违反契约。
- **Simplify：**
  - 已应用：去掉 `passed` 中冗余的 `closeFailures === 0` 条件，因为关闭失败已使 `error` 非空。
  - 未采纳：`filter().length` 的分配，最多 4 个句柄。
- **文档影响：** 工具指南的输出说明已更新。
