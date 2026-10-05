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

- [x] AC-09（删除）：适配器连接空闲时，另一连接 `deleteDatabase` 不触发 `blocked` 且成功；适配器有读写事务进行中时，删除可以暂时 `blocked`，在该事务结束后成功。两种情况之后列出为空、恢复返回 `not-found`。
- [x] AC-09（清除）：经 CDP 清除本 origin 的 IndexedDB 后列出为空、恢复返回 `not-found`；清除时写请求已发出的提交返回 `committed`、`storage-closed` 或 `write-failed` 之一，之后同样列出为空、恢复返回 `not-found`。
- [x] AC-09（更高版本）：测试以版本 2 打开同名数据库后，提交、列出、恢复都返回 `storage-newer-version`；该数据库仍为版本 2，对象仓库与内容不变。
- [x] AC-07：在临时持久 profile 中，写请求已发出（探针确认）后、调用方得到结果前关闭页面或 context，用同一 profile 重开：状态恰为“完整旧包、没有新包记录”或“完整新包”，不出现混合或部分记录。证据至少有一次重开后为完整旧包且没有新包记录的观测。
- [x] AC-16（本子任务部分）：工程约定记录连接生命周期语义、临时持久 profile 与 CDP 清除的验证路线。
- [x] `pnpm check` 与 `pnpm test:e2e resource-cache.spec.ts --project=development` 通过。

## 验证方法

- 按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md) 运行。删除、清除与版本 2 只在隔离 context 或测试自有 profile 中进行，不触碰用户 profile。
- AC-09 证据记录 `blocked`、`versionchange` 事件，强制关闭时的 `close` 事件（适配器主动关闭不产生该事件），清除与事务事件的先后，以及数据库版本。
- AC-07（按 2026-10-05 修订后的 spec）：先以大体量合成 payload（经 `syntheticGroup` 的自定义字节构造）按自然时序记录一次结果；另做一次确定的尝试：首个写请求发出后，由探针在同一事务上链式发出只读 `count()` 请求（`holdWrites`），使事务保持未提交，再关闭 context。证据记录每次运行的中断时机、是否启用保持以及重开后的状态。
- 完成前按 execute-goal 流程以本子任务 diff 为范围做 rubber-duck 审查与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据

- **实现：** [browser-resource-cache.ts](../../../../../src/platform/storage/browser-resource-cache.ts)：
  - **versionchange：** 收到即 `close()` 并丢弃该连接，已开始的事务照常结束，之后的操作重新打开数据库。
  - **强制关闭：** 浏览器发出 `close` 事件时，把该连接记入模块级 `WeakSet` 并丢弃；在其上中止的事务报 `storage-closed`。按 IndexedDB 规范，事务中止先于 `close` 事件，所以进行中的事务通常报 `write-failed`/`read-failed`，这是 spec 允许的。
  - **连接缓存：** 关闭或打开失败只在缓存的仍是该连接时才清除，不会清掉更新的连接。
  - **更高版本：** 打开时的 `VersionError` 经 01 的分类报 `storage-newer-version`。
- **测试支持：** [support/resource-cache.ts](../../../../../e2e/support/resource-cache.ts)：
  - 探针记录每个连接的 `versionchange` 与 `close`。
  - 新增 `holdWrites`：在下一个写事务上链式发出只读 `count()` 请求，使事务保持未提交而主线程空闲。这是唯一改变时序的选项，不增加写入。
  - 页面内新增 `statusOf`、`cacheState` 与 `deleteDatabase`，Node 侧新增 `clearOriginIndexedDb`。
- **浏览器证据**（本机 Chrome 154，`pnpm test:e2e resource-cache.spec.ts --project=development` 13 个用例通过，整套另连续运行 4 次均通过；临时 profile 无残留）：
  - **AC-09 删除：**
    - 适配器空闲：另一连接删除数据库只有 `success`、没有 `blocked`，适配器收到 `versionchange`。
    - 写入期间（在第一个写请求时发起删除）：提交返回 `committed`，删除在提交完成后成功（`blocked` 允许出现，实际是否出现不影响判定）。
    - 两种情况之后都列出为空、恢复为 `not-found`。
  - **AC-09 清除：**
    - 空闲时经 CDP `Storage.clearDataForOrigin` 清除：适配器连接收到 `close`，之后列出为空、恢复为 `not-found`。
    - 写事务被保持时清除：事务以 `UnknownError` 中止，随后收到 `close`，提交返回 `write-failed`（spec 允许 `storage-closed` 或 `write-failed`），之后同样为空与 `not-found`。
  - **AC-09 更高版本：** 测试先以版本 2 创建同名数据库（仓库 `future` 中有一条记录）。提交、列出、恢复都返回 `storage-newer-version`；之后数据库仍为版本 2，只有 `future` 仓库，记录不变。
  - **AC-07：** 在临时持久 profile 中：
    - 自然时序一次：调用方在关闭前没有收到结果；重开后为完整新包（恢复重新验证为 `complete`）。
    - `holdWrites` 一次：第一个写请求发出后、事务未提交时关闭 context；重开后为完整旧包，记录与关闭前完全相同。

    两次重开都没有混合或部分记录。
- **检查：** `pnpm check`：89 个测试文件 2,483 个测试、lint、类型检查与构建全部通过。
- **Rubber-duck：** 没有生产缺陷。采纳两项：
  - 中断用例原可能只靠自然尝试满足断言，且是在关闭之后才判断结果是否先到。改为必有一次保持尝试、在关闭前取快照，并要求保持尝试必须回滚。
  - 补充生命周期文档，并说明 `holdWrites` 是唯一改变时序的探针选项。
- **Simplify：**
  - 采纳：
    - 连接重置收敛为一个 `drop` helper；
    - 页面内的 `statusOf`、`cacheState`、`deleteDatabase` 与 Node 侧的 `clearOriginIndexedDb` 取代重复片段；
    - 空闲与忙碌删除拆成两段；
    - 中断用例改为一次自然尝试加一次确定的保持尝试，并移除控制台监听；
    - 写入期间的清除改用 `holdWrites` 与控制台握手，不再轮询。
  - 未采纳：
    - 只读记录读取不再哈希全部字节（“记录不变”需要字节级摘要）；
    - 把 `holdWrites` 移出探针（会二次包装原生写方法）；
    - 给 `count()` 链加节流（它是顺序请求，不是突发）。
- **文档影响：** [源码结构](../../../../engineering/source-structure.md)补充 `versionchange`、强制关闭与更高版本的语义；[工程约定](../../../../engineering/README.md)的资源缓存 E2E 说明补充：探针默认只观察，删除、CDP 清除与版本 2 的验证方式，中断用例的做法与 `holdWrites`。
