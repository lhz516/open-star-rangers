---
type: plan
status: active
phase: P2
task: "10"
subtask: "05"
updated: 2026-10-05
---

# 05 — 连接生命周期、删除与中断

**契约来源：** [spec](../spec.md) 的 S-07（中断、强制关闭与更高版本部分）、S-08、S-12，AC-07、AC-09、AC-16（验证路线部分）；[行为与边界](../spec.md#行为与边界)、[持久化与兼容](../spec.md#持久化与兼容)。
**依赖：** 03。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **versionchange：** 适配器在连接上监听 `versionchange`，收到即调用 `close()` 并丢弃该连接，不再在其上创建事务；已开始的事务按其最终事件报告。之后的操作重新打开数据库，按实际状态报告（数据库被删除则重建空库，恢复为 `not-found`）。
- **更高版本：** 打开遇到 `VersionError` → `storage-newer-version`；不升级、不删除、不写入。
- **强制关闭：** 监听连接的 `close` 事件（浏览器强制关闭，如站点数据被清除）；之后在该连接上进行中或请求创建的操作返回 `storage-closed`，不报告成功；只有事务中止、没有 `close` 事件时按 01 的规则为 `write-failed` 或 `read-failed`。
- **中断：** 写入期间关闭页面或 context 不需要额外代码；本子任务验证重开后状态恰为完整旧包或完整新包之一。
- **文档：** 在工程约定中记录连接生命周期语义，以及临时持久 profile 与 CDP 清除的验证路线。

## 不包含

- 取消与配额（04）；存储损坏、不兼容与并发（06）。
- 删除接口、旧键清理与缓存管理（P5）。

## 关键文件与契约

- **修改：** `src/platform/storage/browser-resource-cache.ts`、`e2e/resource-cache.spec.ts`、`e2e/support/resource-cache.ts`（均由 03 新增）、[engineering/README.md](../../../../engineering/README.md)。
- **CDP：** 页面级 CDP session 的 `Storage.clearDataForOrigin`（`storageTypes` 为 `indexeddb`），origin 为开发服务器的 origin。

## 验收标准

- [ ] AC-09（删除）：适配器连接空闲时，另一连接 `deleteDatabase` 不触发 `blocked` 且成功；适配器有读写事务进行中时，删除可以暂时 `blocked`，在该事务结束后成功。两种情况之后列出为空、恢复返回 `not-found`。
- [ ] AC-09（清除）：经 CDP 清除本 origin 的 IndexedDB 后列出为空、恢复返回 `not-found`；清除时写请求已发出的提交返回 `committed`、`storage-closed` 或 `write-failed` 之一，之后同样列出为空、恢复返回 `not-found`。
- [ ] AC-09（更高版本）：测试以版本 2 打开同名数据库后，提交、列出、恢复都返回 `storage-newer-version`；该数据库仍为版本 2，对象仓库与内容不变。
- [ ] AC-07：在临时持久 profile 中，写请求已发出（探针确认）后、调用方得到结果前关闭页面或 context，用同一 profile 重开：状态恰为“完整旧包、没有新包记录”或“完整新包”，不出现混合或部分记录。证据至少有一次重开后为完整旧包且没有新包记录的观测。
- [ ] AC-16（本子任务部分）：工程约定记录连接生命周期语义、临时持久 profile 与 CDP 清除的验证路线。
- [ ] `pnpm check` 与 `pnpm test:e2e resource-cache.spec.ts --project=development` 通过。

## 验证方法

- 按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md) 运行。删除、清除与版本 2 只在隔离 context 或测试自有 profile 中进行，不触碰用户 profile。
- AC-09 证据记录 `blocked`、`versionchange` 事件，强制关闭时的 `close` 事件（适配器主动关闭不产生该事件），清除与事务事件的先后，以及数据库版本。
- AC-07 使用足以让写事务跨越可观察时间窗口的合成 payload（经 `syntheticGroup` 的自定义字节构造），证据记录每次运行的中断时机与重开后的状态；结果不确定时重复运行并如实记录。
- 完成前按 execute-goal 流程以本子任务 diff 为范围做 rubber-duck 审查与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据
