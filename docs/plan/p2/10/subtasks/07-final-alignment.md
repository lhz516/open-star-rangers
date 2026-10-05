---
type: plan
status: active
phase: P2
task: "10"
subtask: "07"
updated: 2026-10-05
---

# 07 — P2-10 最终对齐验证

**契约来源：** [spec](../spec.md) 的全部 S-01 至 S-12、AC-01 至 AC-16，重点为 AC-14、AC-15、AC-16、[不变量](../spec.md#行为与边界)与[风险与恢复](../spec.md#风险与恢复)。
**依赖：** 01, 02, 03, 04, 05, 06, 08。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **覆盖核对：** 对照 spec、实际导出、测试与 01–06 的完成证据，逐项形成 S/AC 覆盖表。确认 13 个错误码每个都有产生路径与测试，[行为与边界](../spec.md#行为与边界)的每一行都有对应断言。
- **不变量核对：**
  - 只有读写事务 `complete` 才返回 `committed`；除 `storage-closed` 外，非成功提交不留下可恢复的新数据，任何情况都不留下部分包；
  - 包记录与其 payload 记录总在同一事务中写入或删除；校验与哈希在事务之前，事务内不等待其他异步工作；
  - 恢复只在重新校验为 `complete` 时返回 `restored`；列出不读取 payload；恢复失败不删除、不修改记录；
  - 没有内存回退；结果不含 payload 字节、宿主消息、宿主路径或原版定位；
  - 校验与写入针对同一份独占快照，调用方缓冲不被转移或保留；恢复的 payload 缓冲独占。
- **真实证据核对：** AC-06 来自真实配额错误，AC-07 至少有一次实际回滚观测，AC-05 至少有一次原生 `abort`；没有用通用异常、Node 模拟或注入代替要求的真实行为。
- **工程检查与提交范围：** 运行 `pnpm check`、`pnpm check:original`、`pnpm exec vitest run tools/e2e-configuration.test.ts`、`pnpm test:e2e resource-cache.spec.ts --project=development`，以及文档链接与元数据检查和 `node tools/task-state.ts p2/10`。审阅 goal 的全部提交，确认：
  - 依赖清单与锁文件没有变化；没有原版内容、二进制样本、`local/` 文件或测试产物；
  - P2-01、P2-03 的契约测试与 P1 既有 E2E 归属保持不变；
  - 测试只在隔离 context 或测试自有 profile 中读写，没有清空或删除用户 profile 数据的代码。
- **只核对，不实现：** 本子任务不新增功能代码。发现缺口时按 execute-goal 的补救流程新增子任务。
- **阶段文档：** 判断 [STATUS](../../../../STATUS.md) 的阶段摘要与下一步是否需要更新，[P2 任务索引](../../tasks.md)的导航是否准确。

## 不包含

- 新功能、P2-11 装配与 Worker 中的运行。
- Firefox/Safari 验证（P5）与 P2 阶段退出评审（P2-13）。

## 关键文件与契约

- [spec](../spec.md)、[goal](../goal.md) 及 01–06 的完成证据。
- `src/platform/storage/`、`e2e/resource-cache.spec.ts`、`e2e/support/resource-cache.ts`、[playwright.config.ts](../../../../../playwright.config.ts)、[e2e-configuration.test.ts](../../../../../tools/e2e-configuration.test.ts)。
- [源码结构](../../../../engineering/source-structure.md)、[工程约定](../../../../engineering/README.md)。

## 验收标准

- [x] S-01 至 S-12、AC-01 至 AC-16 逐项有实现与验证证据，没有未解释的缺口，也没有用代理证据替代要求的真实浏览器行为。
- [x] 上述工程检查全部通过；依赖清单与锁文件没有变化；没有原版内容或测试产物进入提交。
- [x] 文档、源码边界、测试发现与项目归属一致，文档链接与元数据检查通过；`node tools/task-state.ts p2/10` 在标记完成后输出 `done`。

## 验证方法

- 运行上述命令，审阅 goal 范围内的 diff，并做文档链接与锚点检查；由 rubber-duck 逐项复核 S/AC。
- 浏览器验证复用 03–06 的 E2E；不需要原版对照或实机测试。

## 完成证据

### 首次最终对齐（2026-10-05，未通过）

- **检查：** 在 HEAD `6147e51` 上：
  - `pnpm check`：89 个测试文件 2,483 个测试、lint、类型检查与构建通过；
  - `pnpm test:e2e resource-cache.spec.ts --project=development` 16 个用例通过；
  - `pnpm check:original` 通过（`local` 符号链接已由 `2e27f2d` 忽略）。

  自 `603cda7` 起 `package.json` 与锁文件无变化，提交中没有二进制、`local/` 文件或测试产物。`.gitignore` 与 `.vscode/settings.json` 的改动是用户另行要求的修复。
- **覆盖复核：** rubber-duck 逐项复核，S-01–S-06、S-08、S-09、S-12 与 AC-01–AC-16 均通过，第 07 项列出的全部不变量也通过。
- **缺口（阻塞）：**
  - **S-07/S-10/S-11：** `read-failed` 没有真实浏览器中的产生路径；`storage-closed` 从未被观测到。报告 `storage-closed` 后适配器也不丢弃已关闭的连接。补救为 [08](./08-error-path-coverage.md)。
  - **STATUS：** 下一步仍写着 P2-10 先编写 spec，在本子任务通过时更新。
- **处理：** 本行改回 `pending`，在 08 完成后重新对齐。

### 第二次最终对齐（2026-10-05，通过）

- **检查：** 在 HEAD `3b689e8`（08 完成后）上：
  - `pnpm check`：89 个测试文件 2,483 个测试、lint、类型检查与构建通过；
  - `pnpm check:original` 通过；`pnpm exec vitest run tools/e2e-configuration.test.ts` 8 个测试通过；
  - `pnpm test:e2e resource-cache.spec.ts --project=development` 18 个用例通过；完整 `pnpm test:e2e`（构建＋全部 3 个项目）39 个用例通过；
  - goal 改动的 14 个文档链接、锚点与 front matter 检查通过，`updated` 均为当天。
- **提交范围：** 自 `603cda7` 起 `package.json` 与 `pnpm-lock.yaml` 无变化；没有二进制、`local/` 文件或测试产物。P2-01 的 `src/content` 改动只抽出共享的身份比较与读取函数，契约测试只有新增断言；P1 E2E 不变，生产项目只新增排除 `resource-cache.spec.ts`。浏览器用例只用隔离 context 或测试自建的临时 profile。
- **覆盖表：**

  | 要求 | 实现与证据 | 结果 |
  |---|---|---|
  | S-01–S-06、S-08、S-09、S-12 | 01–06 的 Node 测试、E2E 与完成证据（见 [goal 覆盖表](../goal.md#验收覆盖)） | 通过（首次对齐已核对，08 未改动相关代码路径） |
  | S-07、S-10、S-11 | 01–06 加 [08](./08-error-path-coverage.md)：13 个错误码都有产生路径与测试；`read-failed` 来自 CDP 清除造成的原生只读中止，`storage-closed` 来自已关闭连接上原生 `transaction()` 抛出的 `InvalidStateError`，之后的操作重新打开并按实际状态报告 | 通过 |
  | AC-01–AC-16 | 各 AC 在 goal 覆盖表中的子任务证据；AC-05 有原生 `abort`，AC-06 来自 Chrome 的真实 `QuotaExceededError`，AC-07 有一次实际回滚观测 | 通过 |
  | 不变量 | 本子任务工作范围所列各项；08 只在 `storage-closed` 时丢弃连接，不改事务、校验或结果形状 | 通过 |
- **复核：** rubber-duck 重新复核 08 后的缺口、不变量与 STATUS：判定通过，无问题。
- **阶段文档：** [STATUS](../../../../STATUS.md) 更新为 P2-10 已完成，下一步为 P2-04；[P2 任务索引](../../tasks.md)的导航仍准确，无需修改。
- **剩余事项：** 浏览器证据只来自 Chrome；Firefox/Safari 验证归 P5。

