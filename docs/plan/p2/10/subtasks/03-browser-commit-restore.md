---
type: plan
status: active
phase: P2
task: "10"
subtask: "03"
updated: 2026-10-05
---

# 03 — 浏览器适配：提交、列出与恢复

**契约来源：** [spec](../spec.md) 的 S-01、S-03、S-05、S-06、S-09、S-11、S-12，AC-01（浏览器部分）、AC-02、AC-03、AC-04、AC-12、AC-14（网络部分）、AC-15、AC-16（模块与常量部分）；[行为与边界](../spec.md#行为与边界)、[操作与结果](../spec.md#操作与结果)、[技术决定](../spec.md#技术决定) 1–5、7–9。
**依赖：** 02。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **适配器创建与打开：**
  - 可选注入 `IDBFactory` 与 `StorageManager`，默认取全局；连接按需建立并复用。
  - 以 02 的常量打开数据库；只在 `upgradeneeded` 且旧版本为 0 时创建对象仓库。
  - 打开阶段的宿主错误经 01 的分类返回；`versionchange`、强制关闭与 `VersionError` 的完整语义由 05 实现。
- **提交：** 按以下顺序：
  1. 同步取得独占快照：用 `exclusiveBytes` 复制每个 payload，之后只使用这份快照，校验与写入针对同一份字节，调用方的缓冲不被转移、修改或保留。
  2. 读取预算限值（形状错误 → `invalid-request`，保留 P2-01 code）；按 `CLASSIC_P2_SLICE.groups` 顺序对四组清单用 `chargeManifestBudget` 从零累计（超限 → `over-budget`）。
  3. 用 `validatePackage(CLASSIC_P2_SLICE, …)` 校验快照（`incomplete` 或 P2-01 读取错误 → `package-incomplete`，附诊断）。
  4. 用 02 构建包记录，开启一个读写事务：删除该键的包记录与全部 payload 记录（按键范围），写入新包记录与逐 Asset 的 payload 记录。事务内不等待其他异步工作。
  5. 只有事务 `complete` 才返回 `committed`：`{ key, identity, payloadCount, payloadBytes }`。中止的分类在本子任务中按 01 的规则报告；取消与配额的完整验证由 04 完成。
- **列出：** 只读事务读取全部包记录，经 02 输出元数据状态，按 IndexedDB 键序排列；不读取 payload 记录。
- **恢复：**
  1. 读取键（非法 → `invalid-request`）与预算限值。
  2. 一个只读事务内：读取包记录（不存在 → `not-found`），在其成功回调中同步用 02 读取并按清单核算预算（超限 → `over-budget`，不发出 payload 读取），再读取该键的全部 payload 记录。
  3. 事务结束后：payload 记录缺失或多余、形状损坏 → `cache-corrupt`；组装四组 `GroupInput` 交给 `validatePackage`，不是 `complete` → `cache-corrupt`，附诊断。
  4. 返回 `restored`：`{ key, identity, groups }`，清单、来源状态与容器冻结；每个 payload 的 `bytes` 是覆盖读取所得完整 `ArrayBuffer` 的新视图。
- **E2E 设施：**
  - 计划新增 `e2e/resource-cache.spec.ts`：在 development 项目的页面内动态导入 `/src/platform/storage/browser-resource-cache.ts` 与 `/src/content/` 的合成内容 helper，沿用 [browser-test.ts](../../../../../e2e/support/browser-test.ts) 的错误收集。
  - 计划新增 `e2e/support/resource-cache.ts`：按导出常量以只读事务枚举记录；包装原生 IndexedDB 方法、只记录不改变行为的探针（事务模式、写请求、`abort()` 调用与最终事件）；测试自有临时持久 profile 的创建、重开与删除（`chromium.launchPersistentContext` 与 `installedBrowser()`，目录建于系统临时目录，结束时关闭并删除）；页面请求记录。
  - [playwright.config.ts](../../../../../playwright.config.ts) 的 production `testIgnore` 加入新用例；[e2e-configuration.test.ts](../../../../../tools/e2e-configuration.test.ts) 增加断言：`--list` 中新用例只属于 development 项目。
- **文档：** 在[源码结构](../../../../engineering/source-structure.md)增加 `platform/storage/` 的目录与说明（模块职责、DOM-free 与 `browser-*` 分工、导出常量位置），在[工程约定](../../../../engineering/README.md)的测试与本地浏览器 runner 部分加入针对性命令与新用例的项目归属。

## 不包含

- 空间检查、取消、真实配额与存储不可用的验证（04）。
- `versionchange`、强制关闭、删除、更高版本与中断（05）。
- 存储损坏、不兼容与并发的浏览器验证（06）。
- 导入页面、Worker 与 P2-11 装配。

## 关键文件与契约

- **计划新增：** `src/platform/storage/browser-resource-cache.ts`、`e2e/resource-cache.spec.ts`、`e2e/support/resource-cache.ts`。
- **修改：** [playwright.config.ts](../../../../../playwright.config.ts)、[e2e-configuration.test.ts](../../../../../tools/e2e-configuration.test.ts)、[source-structure.md](../../../../engineering/source-structure.md)、[engineering/README.md](../../../../engineering/README.md)。
- **依赖 01、02：** `resource-cache-contract.ts`、`resource-cache-records.ts`。
- **只读复用：** [completeness.ts](../../../../../src/content/completeness.ts)、[budget.ts](../../../../../src/content/budget.ts)、[ownership.ts](../../../../../src/content/ownership.ts)、[slice-definition.ts](../../../../../src/content/slice-definition.ts)、[synthetic-content.test-support.ts](../../../../../src/content/synthetic-content.test-support.ts)（仅 E2E）。

## 验收标准

- [ ] AC-02：缺一组、重复一组、payload 同长度改写、payload 长度不符、原版导入形状的包来源状态未验证或指纹不符、四组身份不一致，各返回 `package-incomplete` 并附对应 P2-01 诊断 code；分别超出 `assets`、`dependencyEdges`、`payloadBytes` 预算返回 `over-budget` 并附违规维度；限值形状错误返回 `invalid-request` 并保留 P2-01 code。每项前后只读枚举的记录相同，探针显示没有开启读写事务。
- [ ] AC-03：在临时持久 profile 中提交一个合成包与一个带合成指纹的原版导入形状包；刷新后列出两个 `compatible` 条目，两者恢复都为 `restored`，身份、清单、来源状态与提交时相等，payload 逐字节相同，恢复的 `groups` 交给 `validatePackage` 为 `complete`，合成包 origin 仍为 `synthetic`。
- [ ] AC-04 与 AC-01（浏览器部分）：`[F1, V1]`、`[F1, V2]`、`[F2, V1]` 三个 payload 可区分的包都能恢复；向 `[F1, V1]` 提交 Asset 集合不同的包后，该键只剩新包的记录，另两键的记录与恢复结果不变；再次提交相同包，记录与恢复结果不变。
- [ ] AC-12：payload 为大缓冲中带偏移视图时，存储的 `bytes` 长度等于 payload 长度；提交返回后修改调用方缓冲不影响恢复；调用方缓冲未被转移；恢复的每个 payload 被 `payloadTransferList` 接受，两次恢复不共享缓冲，结果冻结且 `structuredClone` 后相等。
- [ ] AC-14（网络部分）：缓存操作期间页面除开发服务器的模块请求外没有其他请求；`src/platform/storage/` 不出现 `fetch`、`XMLHttpRequest`、`WebSocket`、`sendBeacon`。
- [ ] AC-15：`src/platform/storage/` 不导入 `original-data`、React、Three.js，不使用 `window`、`document`；DOM-free 模块在 Node 程序中通过类型检查，`browser-resource-cache.ts` 不被 `*.test.ts` 导入；依赖清单与锁文件无变化；新用例不在 production 与 development-headed 项目中，配置回归通过。
- [ ] AC-16（本子任务部分）：源码结构与工程约定记录模块职责、数据库名与版本、记录格式版本、常量位置、聚焦命令与新用例的项目归属。
- [ ] `pnpm check`、`pnpm exec vitest run tools/e2e-configuration.test.ts` 与 `pnpm test:e2e resource-cache.spec.ts --project=development` 通过。

## 验证方法

- 按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md) 的合成数据与隔离规则：普通用例用 Playwright 隔离 context；AC-03 用测试自有临时持久 profile，结束时关闭并删除，不触碰用户 profile。
- 记录比较按实际导出常量以只读事务读取；不调用 `indexedDB.open` 探测猜测的数据库。
- 源码检查用 `grep` 与 `pnpm lint`；配置归属用 `playwright test --list --reporter=json`。
- 完成前按 execute-goal 流程以本子任务 diff 为范围做 rubber-duck 审查与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据
