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

- [ ] 恢复与列出各有一次只读事务被保持时经 CDP 清除，返回 `read-failed`；探针记录到该只读事务的原生 `abort`；之后列出为空、恢复为 `not-found`。
- [ ] 下一个事务前关闭真实连接时，提交、恢复、列出都返回 `storage-closed`；提交前后记录完全相同；每次注入之后的操作都按实际状态成功。
- [ ] `pnpm check` 与 `pnpm test:e2e resource-cache.spec.ts --project=development` 通过。

## 验证方法

- 按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md) 在隔离 context 中运行；关闭连接是测试侧故障注入，代表“连接在使用前已被关闭”，证据中注明。
- 完成前按 execute-goal 流程以本子任务 diff 为范围做 rubber-duck 审查与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据
