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

- [ ] 取消后又有句柄关闭失败时，报告的 `error` 为 `cancelled`，关闭失败计数等于失败的句柄数，`passed` 为 false。
- [ ] 只有关闭失败时，`error` 为 `read-failed@input`，计数正确；全部成功时计数为 0。
- [ ] `pnpm exec vitest run tools/disc-check.test.ts`、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- 用可注入的打开函数制造关闭失败与取消，进程内断言报告。
- 不适用 browser-testing 或原版对照。

## 完成证据
