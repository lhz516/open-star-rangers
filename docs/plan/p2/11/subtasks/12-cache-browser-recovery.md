---
type: plan
status: active
phase: P2
task: "11"
subtask: "12"
updated: 2026-10-06
---

# 12 — 缓存恢复的浏览器验证

**契约来源：** [spec](../spec.md) 的 S-04、AC-08（浏览器），以及[行为与边界](../spec.md#行为与边界)中的首次载入、打开缓存与缓存失败各行，[缓存编排](../spec.md#缓存编排)的重新导入提示。
**依赖：** 07, 11。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 开发项目 E2E（测试入口，测试拥有的隔离 context）：
  - **刷新恢复：** 合成完整包提交后，在同一 context 中刷新。菜单显示有缓存（尚未校验）；打开后恢复并校验，查看器的 manifest 身份与提交前相同，任务载入成功。
  - **改写：** 测试同长度改写一条 payload 记录后打开，显示 `cache-corrupt` 与重新导入提示，不显示任何资源。
  - **页面打开时删除：** 删除数据库后回到菜单，保存状态变为“仅在内存中”（`not-found`），资源仍可查看并可重新保存。
  - **刷新后删除：** 刷新后菜单显示没有原版数据。
  - **筛选：** `ConverterVersion` 或指纹与预期包配置不同的条目不提供恢复。
- 只在测试拥有的 context 中操作 IndexedDB；不清空用户站点数据。
- 若发现实现缺口，回到相应子任务（03、06、07、11）修正，并在本子任务记录。

## 不包含

- 缓存迁移、清理与管理界面（P5）；生产预览中的恢复（14）。

## 关键文件与契约

- 计划新增 E2E 用例，或扩展 07 的用例文件。
- 复用：[resource-cache.ts](../../../../../e2e/support/resource-cache.ts) 的 `installIdbProbe`、`readStoredRecords`、`clearOriginIndexedDb`、`withPersistentProfile`；[resource-cache.spec.ts](../../../../../e2e/resource-cache.spec.ts) 的改写与刷新方法。

## 验收标准

- [x] AC-08（浏览器）：刷新恢复、改写、页面打开时删除、刷新后删除与条目筛选的结果都如上。
- [x] 恢复后的内容身份与提交前相同，任务载入成功。
- [x] 测试只改动自己的 context；开发项目的相关 E2E 通过。

## 验证方法

- 按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md) 运行 `pnpm exec playwright test <新用例> --project=development`。
- 本子任务只新增测试时，不需要 simplify；若修改实现代码，按 execute-goal 做 rubber-duck 与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)，并运行 `pnpm check`。

## 完成证据

- **实现缺口（回到 11 修正）：** 查看器原先不显示资源包的内容身份，无法核对“查看器的内容身份与提交前相同”。[ViewerPage](../../../../../src/ui/viewer/ViewerPage.tsx) 现在为完整资源包显示 `Package identity: manifest <manifest 身份>, converter <转换器版本>`。
- **用例：** [cache-recovery.spec.ts](../../../../../e2e/cache-recovery.spec.ts) 共 3 条，只在开发项目运行，生产项目忽略。每条都在 Playwright 为该用例新建的隔离 context 中进行，只改动这个 context 的 IndexedDB。共享的辅助函数：[app-entry.ts](../../../../../e2e/support/app-entry.ts) 的 `importFiles`、`button`；[resource-cache.ts](../../../../../e2e/support/resource-cache.ts) 的 `deleteCacheDatabase`。

  浏览器为本机 Chrome（Playwright `channel: 'chrome'`，无头），开发服务器 `http://127.0.0.1:4173`，1280×800，DPR 1，只用合成数据：

  | 准则 | 设置与操作 | 期望 | 观察到的证据 | 结果 |
  |---|---|---|---|---|
  | 刷新恢复 | 导入 `models` 场景并等提交完成，记下查看器的身份与任务摘要；同一 context 中刷新，打开已保存的资源 | 菜单显示有缓存、尚未校验，没有 `View resources`；恢复并校验后状态为完整、已保存（恢复并校验）、任务载入；身份与摘要和刷新前相同 | 都如期望；身份与摘要逐字相同 | 通过 |
  | 改写 | 提交后以 readwrite 事务把一条 payload 的首字节翻转一位，等事务完成，再读回确认长度不变、只有首字节改变；刷新后打开 | `restore-failure` 显示损坏与“重新导入会替换”的提示，技术细节为 `cache-corrupt`；不持有资源包，没有资源状态与 `View resources` | 都如期望 | 通过 |
  | 页面打开时删除 | 提交后打开查看器，以 CDP 清除本源的 IndexedDB 并等数据库消失，再回到菜单 | 状态为完整、仅在内存中、任务载入，`save-failure` 为 `cache/not-found`；仍可查看，身份不变；`Save again` 后为已保存，数据库中有一个资源包 | 都如期望 | 通过 |
  | 刷新后删除 | 再次删除并等数据库消失后刷新 | 菜单显示没有原版数据，不提供打开 | 如期望 | 通过 |
  | 条目筛选 | 已由 [app-shell-resources.spec.ts](../../../../../e2e/app-shell-resources.spec.ts) 的第一条覆盖：转换器版本或指纹与预期包配置不同的合成条目都不提供恢复 | — | 本次整体运行通过 | 通过 |

- **删除的时机：** 回到菜单时外壳立即重新列出缓存。若删除恰好落在这次列出进行中，列出会在被浏览器强制关闭的连接上中止，按 P2-10 的约定报 `read-failed`。真实用户删除站点数据后再回到菜单不会这样交错。

  因此用例在查看器中删除（查看器不列出缓存），并等数据库从 `indexedDB.databases()` 中消失后再返回。这不是产品缺陷（rubber-duck 同意）：中止的读取报 `read-failed` 是 P2-10 已有的约定，下一次列出即为 `not-found`。
- **11 的不稳定用例（一并修正）：** 重复运行时，11 的试听用例约 2/3 失败。原因是合成声音只有 3–6 个样本，不足 1 毫秒，“仍在路由的节点数 > 0”几乎看不到。共享的音频探针（[audio-playback.ts](../../../../../e2e/support/audio-playback.ts)）新增 `started()`，统计各个声源节点的 `start()` 调用；`AudioBufferSourceNode` 有自己的 `start`，所以分别包装。11 的两条试听用例改为断言每次点击恰好启动一个发声。P2-08 的试听用例照常通过。
- **检查：**
  - `pnpm exec playwright test e2e/cache-recovery.spec.ts e2e/viewer-page.spec.ts --project=development --repeat-each=3`：42 条通过；
  - 试听相关用例（含 P2-08）以 `--repeat-each=3` 运行，18 条通过；
  - `pnpm exec playwright test --project=development`：78 条通过；
  - `pnpm check`：152 个文件 4,496 条测试，构建通过。
- **Rubber-duck：** 没有阻塞问题。采纳 1 个非阻塞问题：改写原先没有等待事务完成，刷新可能与提交竞争；现在等 `complete` 并读回核对。审阅另确认身份比对不空泛、在查看器中删除符合 AC-08、筛选已有覆盖、探针改动对 P2-08 安全。
- **Simplify：** 采纳：
  - 共享的 `button` 与 `importFiles`（`openViewer` 改用它）；
  - 数据库名称取自缓存模块的常量；
  - 删除并等待的 `deleteCacheDatabase` 放到 `clearOriginIndexedDb` 旁边。

  未采纳：
  - 损坏与删除两条改用预置的合成包、不再导入：整份用例约 10 秒，而刷新恢复需要真实提交的完整包；
  - 把身份移到菜单：AC-08 要求核对的是查看器中的身份。
- **文档影响：** [工程约定](../../../../engineering/README.md)的查看器页面说明补充身份一行。源码结构、STATUS 无需改动。
