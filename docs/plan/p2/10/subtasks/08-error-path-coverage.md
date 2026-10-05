---
type: plan
status: active
phase: P2
task: "10"
subtask: "08"
updated: 2026-10-05
---

# 08 — 读事务失败与连接已关闭的错误路径

**契约来源：** [spec](../spec.md) 的 S-07、S-10、S-11，[行为与边界](../spec.md#行为与边界)中“操作进行中连接被浏览器强制关闭”与“读事务出错”两行，以及[错误码](../spec.md#错误码)的 `read-failed`、`storage-closed`；[07](./07-final-alignment.md) 首次最终对齐的缺口。
**依赖：** 05。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **`read-failed`：** 在真实 Chrome 中让恢复与列出的只读事务以原生中止结束：探针保持该事务未完成，测试经 CDP 清除本 origin 的 IndexedDB。断言两种操作都返回 `read-failed`，不返回部分结果；之后的列出与恢复反映清除后的实际状态。
- **`storage-closed`：** 测试侧故障注入在适配器开始下一个事务前关闭其真实连接，使原生 `IDBDatabase.transaction()` 抛出 `InvalidStateError`。断言提交、恢复与列出都返回 `storage-closed`，提交不留下任何记录。
- **连接恢复：** 按 spec“之后的操作按实际状态报告”，适配器在报告 `storage-closed` 后丢弃该已关闭的连接，下一次操作重新打开数据库。断言注入之后的操作恢复正常，并返回实际状态。
- 探针增加只读事务的保持与“下一个事务前关闭连接”两个测试选项，默认关闭；文档说明哪些选项改变时序或注入故障。

## 不包含

- 改变错误码、结果形状或任何已批准的行为；`forcedClosed` 的分类逻辑保持不变（spec 允许中止先于关闭事件时报告 `write-failed`/`read-failed`）。
- 其他浏览器或真实设备验证（P5）。

## 关键文件与契约

- **修改：** [browser-resource-cache.ts](../../../../../src/platform/storage/browser-resource-cache.ts)（报告 `storage-closed` 后丢弃连接）、[resource-cache.spec.ts](../../../../../e2e/resource-cache.spec.ts)、[support/resource-cache.ts](../../../../../e2e/support/resource-cache.ts)、[工程约定](../../../../engineering/README.md)、[源码结构](../../../../engineering/source-structure.md)。

## 验收标准

- [x] 恢复与列出各有一次只读事务被保持时经 CDP 清除，返回 `read-failed`；探针记录到该只读事务的原生 `abort`；之后列出为空、恢复为 `not-found`。
- [x] 下一个事务前关闭真实连接时，提交、恢复、列出都返回 `storage-closed`；提交前后记录完全相同；每次注入之后的操作都按实际状态成功。
- [x] `pnpm check` 与 `pnpm test:e2e resource-cache.spec.ts --project=development` 通过。

## 验证方法

- 按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md) 在隔离 context 中运行；关闭连接是测试侧故障注入，代表“连接在使用前已被关闭”，证据中注明。
- 完成前按 execute-goal 流程以本子任务 diff 为范围做 rubber-duck 审查与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据

- **实现：** [browser-resource-cache.ts](../../../../../src/platform/storage/browser-resource-cache.ts) 的 `createResourceCache` 新增内部 `withDatabase`，提交、恢复与列出都经它取得连接。操作以 `storage-closed` 失败时丢弃该连接（只在缓存的仍是它时清除），下一次操作重新打开数据库。错误码、结果形状与 `forcedClosed` 分类不变。
- **测试支持：** [support/resource-cache.ts](../../../../../e2e/support/resource-cache.ts)：
  - 探针新增 `holdReads`，与 `holdWrites` 共用同一个链式只读 `count()` 保持逻辑，只延长事务生命周期，不增加写入。
  - 探针新增一次性 `closeNextTransaction`（默认关闭）：在下一次原生 `transaction()` 调用前关闭真实连接，使原生调用抛出 `InvalidStateError`。这是测试侧故障注入，代表“连接在使用前已被关闭”。
  - 新增 `armHold(page, kind, hold)`：设置保持选项，并在该类请求第一次发出时经控制台发信号；CDP 清除期间写保持、中断用例与读失败用例共用它。
- **浏览器证据**（本机 Chrome 154，[resource-cache.spec.ts](../../../../../e2e/resource-cache.spec.ts)，`pnpm test:e2e resource-cache.spec.ts --project=development` 18 个用例通过）：
  - **`read-failed`：** 恢复与列出各一次：先提交旧包，在只读事务第一个读请求发出、事务被保持时经 CDP `Storage.clearDataForOrigin` 清除。两次都返回 `read-failed`，结果只有失败形状的字段（无部分结果），探针记录到 `readonly` 事务的原生 `abort`；之后列出为空、恢复为 `not-found`。
  - **`storage-closed`：** 恢复与列出各注入一次，都返回 `storage-closed`，紧接着的同一操作分别恢复出旧包、列出 1 项；两者前后的存储记录完全相同。提交注入一次返回 `storage-closed`，记录与注入前完全相同、恢复仍为旧包；再次提交返回 `committed`，恢复为新包。
  - **重开依赖丢弃连接：** 变异检查中去掉 `storage-closed` 后的丢弃，注入后的重试仍失败，用例不通过；恢复代码后通过。
- **检查：** `pnpm check`：89 个测试文件 2,483 个测试、lint、类型检查与构建全部通过。
- **Rubber-duck：** 没有生产缺陷或阻塞问题。采纳其文档修正，使工程约定与源码结构准确说明各探针选项是延长事务还是注入故障，以及 `storage-closed` 与进行中强制关闭时连接如何被丢弃。
- **Simplify：** 采纳三项：保持逻辑改为按探针选项名取值；新增 `armHold` 合并三处重复的控制台信号与保持设置；提交的 `storage-closed` 用例去掉与前一步重复的注入与重试。保留 `withDatabase` 的位置（altitude 审查确认它属于适配器内部的连接管理）。
- **文档影响：** 更新 [工程约定](../../../../engineering/README.md)（探针选项、读失败与连接已关闭的测试方法）与 [源码结构](../../../../engineering/source-structure.md)（连接生命周期）。spec 行为未变，无需 ADR；无原版游戏事实或 unknowns 变化。
