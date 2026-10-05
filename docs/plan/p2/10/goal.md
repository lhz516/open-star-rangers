---
type: plan
status: accepted
phase: P2
task: "10"
updated: 2026-10-05
---

# P2-10：IndexedDB 最小资源缓存 — Goal

## 目标与来源

实现 [P2-10 spec](./spec.md) 中的 S-01 至 S-12 与 AC-01 至 AC-16：

- **纯逻辑：** 缓存键、封闭错误码与失败结果、宿主错误分类、记录布局与读取、存储需求与空间判定，放在不依赖 DOM 的模块中，用 Node 测试。
- **浏览器适配：** 基于原生 IndexedDB 的提交、列出、恢复与空间检查，单事务原子提交、恢复时完整重新校验，以及取消、配额、中断、删除、更高版本、强制关闭与并发语义。
- **验证与文档：** 在已安装的 Chrome 中用合成包做 E2E，同步工程文档。

本文件不重新定义行为契约。

## 代码现状与前提

- **可复用的内容契约（P2-01 已完成，`node tools/task-state.ts p2/01` 输出 `done`）：**
  - [completeness.ts](../../../../src/content/completeness.ts) 的 `GroupInput`、`validatePackage`、`CompletenessDiagnostic`。`validatePackage` 只返回身份与组名，不返回规范化的清单，所以存储的清单须另经 [manifest.ts](../../../../src/content/manifest.ts) 的 `readGroupManifest` 与 [source-state.ts](../../../../src/content/source-state.ts) 的 `readSourceStateSet` 读取。
  - [budget.ts](../../../../src/content/budget.ts) 的 `readBudgetRecord`、`chargeManifestBudget`、`BudgetViolation`、`EMPTY_BUDGET_USAGE`；[payload.ts](../../../../src/content/payload.ts) 的 `readPayloadRecords`（拒绝已转移的缓冲）。
  - [ownership.ts](../../../../src/content/ownership.ts) 的 `exclusiveBytes`、`payloadTransferList`；[content-identity.ts](../../../../src/content/content-identity.ts) 的 `readContentIdentity`、`readSourceFingerprint`、`CONTENT_SCHEMA_VERSION`；[slice-definition.ts](../../../../src/content/slice-definition.ts) 的 `CLASSIC_P2_SLICE`。
  - [synthetic-content.test-support.ts](../../../../src/content/synthetic-content.test-support.ts) 的 `syntheticGroup`、`syntheticOriginalGroup`、`syntheticPackage` 只导入 content 模块，可在 Node 测试与浏览器页面中使用；`syntheticGroup` 接受自定义 payload 字节，可构造大 payload 与可区分的包。
- **来源指纹（P2-03 已完成，`node tools/task-state.ts p2/03` 输出 `done`）：** 格式 `source:sha256:<64 位十六进制>`；合成测试可用任意满足 `readSourceFingerprint` 的令牌。
- **平台与类型程序：**
  - [platform/](../../../../src/platform/) 只有 `browser/`、`files/`、`input/`，没有存储代码。
  - [tsconfig.node.json](../../../../tsconfig.node.json) 只有 ES2023 与 Node 类型，没有 DOM：被 `*.test.ts` 导入的模块不能引用 `IDBFactory`、`IDBDatabase`、`StorageManager` 等类型。因此纯逻辑放在 DOM-free 模块中；IndexedDB 适配按现有 `browser-*.ts` 命名（如 [browser-session-host.ts](../../../../src/platform/browser/browser-session-host.ts)），只由 [tsconfig.app.json](../../../../tsconfig.app.json) 检查，不被 Node 测试导入。
  - [eslint.config.js](../../../../eslint.config.js) 允许 platform 导入 content，禁止导入字节端口以外的 `original-data`；`src/**` 使用浏览器全局变量。
- **浏览器测试设施：**
  - [playwright.config.ts](../../../../playwright.config.ts)：development、production、development-headed 三个项目，单 worker、零 retry。production 的 `testIgnore` 已排除依赖 `/src` 模块的 browser-replay，新用例须同样排除。
  - [browser-replay.spec.ts](../../../../e2e/browser-replay.spec.ts) 在页面内动态导入 `/src` 模块；[browser-test.ts](../../../../e2e/support/browser-test.ts) 的 `collectBrowserErrors` 与自动 fixture 收集页面错误与失败请求；[webgl-unavailable.spec.ts](../../../../e2e/webgl-unavailable.spec.ts) 用 `installedBrowser()` 自行启动浏览器，可作为临时持久 profile 的先例。
  - [e2e-configuration.test.ts](../../../../tools/e2e-configuration.test.ts) 目前只核对项目列表与运行设置，不核对单个用例的项目归属。
- **计划新增：**
  - `src/platform/storage/resource-cache-contract.ts` 与 `.test.ts`（01）；
  - `src/platform/storage/resource-cache-records.ts` 与 `.test.ts`（02，04 补充空间判定）；
  - `src/platform/storage/browser-resource-cache.ts`（03 起）；
  - `e2e/resource-cache.spec.ts` 与 `e2e/support/resource-cache.ts`（03 起）。

  不新增依赖，不创建 `src/workers/`。
- **前提一：** spec 已于 2026-10-05 由用户明确批准。
- **前提二：浏览器（03–06 需要）。** 需要已安装的兼容 Chrome（`channel: 'chrome'` 或 `OSR_E2E_EXECUTABLE`），见[本地浏览器 runner](../../../engineering/README.md#本地浏览器-runner)。缺浏览器时相应子任务为 blocked，不能用 Node 模拟代替。
- **前提三：CDP 配额覆盖（04 的 AC-06 需要）。** 当前 Chrome 须支持 `Storage.overrideQuotaForOrigin` 并产生真实配额错误。若不支持，04 保持 blocked 并记录探测结果，由用户决定替代的真实验证方式，不以抛出的通用异常代替。
- **原版证据：** 不适用。本任务不读取原版数据，不涉及 U/B 项。

## 验收覆盖

| Spec 范围项/验收项 | 实现子任务 | 验证子任务及方法 |
|---|---|---|
| S-01 | 02、03 | 02 记录构建与读取的 Node 测试；03 浏览器中数据库与对象仓库的创建、读回 |
| S-02 | 01 | 01 键推导与读取的 Node 测试；03 浏览器中多键共存 |
| S-03 | 03 | 03 提交前校验与同键替换的 E2E |
| S-04 | 02、04 | 02 存储需求 Node 测试；04 空间判定 Node 测试与 CDP 配额 E2E |
| S-05 | 03 | 03 列出 E2E；06 元数据损坏与不兼容的列出状态 |
| S-06 | 02、03 | 02 记录读取 Node 测试；03 刷新恢复 E2E；06 损坏、不兼容与恢复预算 E2E |
| S-07 | 04、05、06 | 04 取消、配额、写失败、存储不可用；05 中断、强制关闭、删除与更高版本；06 损坏 |
| S-08 | 05 | 05 versionchange、blocked 与删除的 E2E |
| S-09 | 03 | 03 偏移视图、缓冲不被转移、独占恢复缓冲与结构化克隆的 E2E |
| S-10 | 01 | 01 封闭错误码、失败形状与分类的 Node 测试；07 复核所有产生路径 |
| S-11 | 01–06 | 各子任务的 Node 测试与 E2E；07 核对无新依赖、无模拟 IndexedDB |
| S-12 | 03、04、05 | 各子任务同步文档；07 链接、元数据与内容一致性 |
| AC-01 | 01 | 01 Node 键测试；03 多来源包共存与恢复（AC-03、AC-04） |
| AC-02 | 03 | 03 逐项拒绝的 E2E，前后只读枚举记录比较，探针确认没有写事务 |
| AC-03 | 03 | 03 临时持久 profile 中提交、刷新、列出与逐字节恢复 |
| AC-04 | 03 | 03 三键隔离、同键替换与幂等的 E2E |
| AC-05 | 04 | 04 三个取消时机的 E2E，探针记录写请求、`abort()` 与最终事件 |
| AC-06 | 04 | 04 CDP 配额覆盖下的空间检查与真实 `quota-exceeded` |
| AC-07 | 05 | 05 临时 profile 中写入期间关闭并重开 |
| AC-08 | 02、06 | 02 记录读取的 Node 测试；06 隔离 context 中改写记录后的恢复与列出 |
| AC-09 | 05 | 05 空闲与忙碌删除、CDP 清除与版本 2 数据库的 E2E |
| AC-10 | 01、04 | 01 宿主错误名分类 Node 测试；04 空间判定 Node 测试与注入工厂的 E2E |
| AC-11 | 03 | 06 已有旧包与首次导入两种并发 E2E |
| AC-12 | 03 | 03 所有权 E2E |
| AC-13 | 02 | 02 存储需求 Node 测试 |
| AC-14 | 01、03 | 01 失败结果字段 Node 测试；03 网络请求记录与源码检查；07 复核 |
| AC-15 | 01、02、03 | 03 生产 E2E 排除与配置回归；07 `pnpm check`、依赖与锁文件、源码边界检查 |
| AC-16 | 03、04、05 | 07 文档链接、元数据与内容核对 |

## 子任务跟踪

状态只在此维护：`pending` / `in-progress` / `blocked` / `completed`。依赖项全部 completed 后才能开始；验收结果和证据写在相应 subtask 文档，不在阶段索引重复状态。

| 子任务 | 依赖 | 状态 |
|---|---|---|
| [01-cache-key-results.md](./subtasks/01-cache-key-results.md) | — | pending |
| [02-cache-records.md](./subtasks/02-cache-records.md) | 01 | pending |
| [03-browser-commit-restore.md](./subtasks/03-browser-commit-restore.md) | 02 | pending |
| [04-capacity-quota-cancel.md](./subtasks/04-capacity-quota-cancel.md) | 03 | pending |
| [05-connection-lifecycle.md](./subtasks/05-connection-lifecycle.md) | 03 | pending |
| [06-integrity-concurrency.md](./subtasks/06-integrity-concurrency.md) | 03 | pending |
| [07-final-alignment.md](./subtasks/07-final-alignment.md) | 01, 02, 03, 04, 05, 06 | pending |

最后一行始终为最终对齐验证，依赖所有其他子任务。ID 分配后保持不变；新增修复项使用新 ID，插入最终验证之前并加入其依赖，不要求最终验证拥有最大的数字。

## 执行记录

## 审批

用户于 2026-10-05 明确批准本 goal，批准范围为上述 7 个子任务的拆分、依赖关系和验收覆盖。同日用户明确批准 spec。批准不代表实现完成。
