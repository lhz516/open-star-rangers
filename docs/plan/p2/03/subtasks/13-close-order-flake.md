---
type: plan
status: active
phase: P2
task: "03"
subtask: "13"
updated: 2026-10-05
---

# 13 — 补救：CLI 关闭断言与完成顺序无关

**契约来源：** [spec](../spec.md) 的 S-13（CLI 部分）与 AC-12 的自动化部分：所有路径都关闭已取得的句柄。来自 [10](./10-final-alignment.md) 第二次最终对齐发现的缺口。
**依赖：** 08。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **测试：** [source-check.test.ts](../../../../../tools/source-check.test.ts) 的 `opener` 在 `await source.close()` 完成后才记录关闭。各句柄并发关闭，完成顺序不确定，因此 `expect(closed).toEqual(opened)` 在负载下偶发失败。这些断言改为与顺序无关的多重集比较（排序后比较），沿用 [disc-check.test.ts](../../../../../tools/disc-check.test.ts) 的做法，仍要求每个句柄恰好关闭一次。
- 契约只要求关闭每个已取得的句柄，不规定关闭顺序；CLI 的生产代码不变。

## 不包含

- 修改 CLI 的关闭逻辑、报告格式或 P2-02 工具。

## 关键文件与契约

- **修改：** [source-check.test.ts](../../../../../tools/source-check.test.ts)。

## 验收标准

- [x] 关闭断言与完成顺序无关，仍能发现漏关或重复关闭的句柄。
- [x] `pnpm exec vitest run tools/source-check.test.ts` 与 `pnpm check` 通过。

## 验证方法

- 变异检查：让 CLI 漏关一个句柄，或把同一句柄关闭两次，断言都失败。
- 模拟乱序完成（例如让第一个句柄延迟关闭），确认断言不再依赖顺序。
- 不适用 browser-testing 或原版对照。

## 完成证据

- **实现：** [source-check.test.ts](../../../../../tools/source-check.test.ts) 新增 `expectEveryInputClosed`，把关闭记录与打开记录排序后比较。6 处 `closed`/`opened` 逐项相等的断言都改用它。打开函数仍在关闭完成后才记录，所以 `runSourceCheck` 返回前未完成的关闭仍会被发现。
- **变异检查：**
  - 让第一个句柄延迟 30 ms 关闭：旧断言使 5 个测试失败，新断言全部通过；
  - CLI 漏关一个句柄：7 个测试失败；
  - CLI 把同一句柄关闭两次：7 个测试失败。
- **检查：**
  - `pnpm exec vitest run tools/source-check.test.ts`：10 个测试通过；
  - `pnpm check`：87 个测试文件 2,342 个测试与构建通过。
- **Rubber-duck：** 未发现问题。确认多重集比较能发现漏关、重复关闭与返回时未完成的关闭；自 `9719c39` 起新增的其他 P2-03 测试没有依赖负载或时序的断言。
- **Simplify：** 只改测试，没有实现代码变化，不需要清理。
- **文档影响：** 无需更新。[工程约定](../../../../engineering/README.md)与[工具指南](../../../../guides/tools.md)没有记录关闭顺序，CLI 行为不变。
