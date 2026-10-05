---
type: plan
status: accepted
phase: P2
task: "02"
updated: 2026-10-04
---

# P2-02：CCD/IMG 与 ISO9660 按需读取 — Goal

## 目标与来源

实现 [P2-02 spec](./spec.md) 中的 S-01 至 S-13 与 AC-01 至 AC-13：
- **纯读取链：** 在 `original-data` 中，用一份纯代码完成只含类型的字节读取端口、CloneCD 文件组与描述解析、原始扇区校验、ISO9660 卷与目录的按需路径解析，以及文件范围读取。
- **两端适配：** 浏览器 Blob 适配与 Node 文件适配。
- **安全约束：** 读取限值、`sourceReadBytes` 预算与取消，以及稳定错误码与安全诊断。
- **核对与文档：** 基准盘本地核对、原版结构事实记录和文档对齐。

本文件不重新定义行为契约。

## 代码现状与前提

- **现有解析只接受内存字节：** [imfat.ts](../../../../src/original-data/imfat.ts) 与 [payloads.ts](../../../../src/original-data/payloads.ts) 只解析已在内存中的完整字节。仓库中没有光盘镜像读取代码；`src/original-data/io/`、`src/original-data/disc/`、`src/platform/files/` 与 `workers/` 都不存在。
- **合成构建器：** [synthetic.ts](../../../../src/original-data/synthetic.ts) 的 `ByteWriter` 只有小端写入，需要扩展大端或双端序写入，才能生成合成 ISO9660 结构。
- **路径规则：** 光盘路径语法目前是 [source-mapping.ts](../../../../src/original-data/source-mapping.ts) 中的私有常量（`DOS_NAME`/`DISC_PATH`），须抽出供两处共用，且不改变来源映射行为。
- **P2-01 已完成**（`node tools/task-state.ts p2/01` 输出 `done`），本任务可直接复用：
  - [budget.ts](../../../../src/content/budget.ts) 的 `readBudgetRecord`、`chargeBudget`、`EMPTY_BUDGET_USAGE`；
  - [ownership.ts](../../../../src/content/ownership.ts) 的 `isDetached`、`payloadTransferList`；
  - [contract-validation.ts](../../../../src/content/contract-validation.ts) 的 `ContentContractError`。
  - 依赖方向为 original-data → content，现有 lint 允许。
- **边界：**
  - [eslint.config.js](../../../../eslint.config.js) 禁止 `platform` 等层导入 `original-data`。
  - [engineering-boundaries.test.ts](../../../../tools/engineering-boundaries.test.ts) 的依赖图只允许 `original-data` 与 `workers` 到达它；测试数据守卫限制 `content`/`original-data` 测试的导入。
  - 安装的 typescript-eslint 8.71 提供可按类型导入放行的 `no-restricted-imports` 扩展规则。
- **manifest：** [manifest.ts](../../../../tools/compliance/manifest.ts) 会校验游戏文件的大小列，但结果只含路径与哈希；本地核对需要最小扩展以返回大小，`cli.ts` 与 `scan.ts` 的现有行为不变。
- **测试与程序：**
  - Vitest 发现 `src/**/*.test.ts` 与 `tools/**/*.test.ts`（[vite.config.ts](../../../../vite.config.ts)）。
  - Node 程序含 `@types/node`，其中的全局 `Blob` 让平台适配可在 Node 中测试。
  - 纯模块程序（[tsconfig.core.json](../../../../tsconfig.core.json)）不含 DOM 与 Node 类型。
- **前提一：** spec 与本 goal 已于 2026-10-04 由用户明确批准。
- **前提二：本地基准镜像（仅 09 需要）。** `local/StarRang/cd/` 下须有开发者的 CloneCD 文件组，`.img`/`.sub` 的大小与 SHA-256 须与 [manifest](../../../original/manifest.md#光盘镜像) 一致。在没有这些数据的机器上，09 保持 blocked，不能用合成数据代替。
- **原版证据：** 2026-10-04 的只读结构调查脚本与输出留在 `local/research/p2-02/`，这是 09 写入 `docs/original/` 的输入。没有 U 项涉及镜像或 ISO9660 结构。
- **验证分工：** 不需要 browser-testing，真实浏览器与 Worker 中的读取由 P2-04 用 E2E 证明。

## 验收覆盖

| Spec 范围项/验收项 | 实现子任务 | 验证子任务及方法 |
|---|---|---|
| S-01 | 02 | 02 文件组配对正负测试；10 覆盖复核 |
| S-02 | 02 | 02 描述语法、布局与镜像大小测试 |
| S-03 | 03 | 03 扇区头部/BCD/模式测试 |
| S-04 | 03 | 03 卷描述符序列、主卷与根目录测试 |
| S-05 | 04 | 04 路径解析与读取日志测试；来源映射回归 |
| S-06 | 05 | 05 范围读取、所有权与读取日志测试 |
| S-07 | 01、06 | 01 端口返回值校验测试；06 lint/依赖图正负 fixture |
| S-08 | 07 | 07 Node WHATWG Blob 适配测试 |
| S-09 | 08、09 | 08 Node 适配/CLI 测试；09 基准盘本地运行 |
| S-10 | 01、02、04、05 | 01 计量/取消测试；02/04/05 各层限值边界；10 复核 |
| S-11 | 01、02、03、04、05 | 01 错误 DTO 与隐私测试；各层报错优先级测试 |
| S-12 | 01、02、03、04、05 | 01、02、03、04、05 各层合成构建器与记录读取的内存端口；10 检查测试不读取文件 |
| S-13 | 06、07、08、09 | 09 `docs/original/` 事实；各子任务工程文档；10 链接/导出一致性检查 |
| AC-01 | 02 | 02 表驱动测试，宿主文件名中的标记不出现在诊断里 |
| AC-02 | 02 | 02 描述布局、语法与尺寸门禁表驱动测试 |
| AC-03 | 02、03 | 02 镜像大小/扇区数边界；03 `invalid-sector` 与未读坏扇区测试 |
| AC-04 | 03 | 03 卷描述符与双端序字段逐项变异测试 |
| AC-05 | 04 | 04 目录、名称版本、循环、限值与读取日志测试 |
| AC-06 | 05 | 05 范围、所有权、16 MiB 边界与端口读取分段测试 |
| AC-07 | 01、02、05 | 01 计量/重叠/取消；02 打开前取消；05 分段与最后一段取消 |
| AC-08 | 01、02、04、05 | 01 端口返回值失败；02/04 诊断隐私；05 句柄与结果隔离 |
| AC-09 | 06 | 06 engineering-boundaries 正负 fixture、`pnpm typecheck`、`pnpm lint` |
| AC-10 | 07 | 07 `src/platform/files/` 相邻测试 |
| AC-11 | 08 | 08 `tools/` 相邻测试与 manifest 回归 |
| AC-12 | 08、09 | 08 超过 16 MiB 的分段自动回归；09 基准盘本地 CLI 核对 |
| AC-13 | 06、07、08、09 | 10 文档链接/元数据、`pnpm check`、`pnpm check:original`、依赖与锁文件无变化 |

## 子任务跟踪

状态只在此维护：`pending` / `in-progress` / `blocked` / `completed`。依赖项全部 completed 后才能开始；验收结果和证据写在相应 subtask 文档，不在阶段索引重复状态。

| 子任务 | 依赖 | 状态 |
|---|---|---|
| [01-port-guarded-reader.md](./subtasks/01-port-guarded-reader.md) | — | completed |
| [02-clonecd-file-set.md](./subtasks/02-clonecd-file-set.md) | 01 | completed |
| [03-sector-volume.md](./subtasks/03-sector-volume.md) | 01, 02 | completed |
| [04-directory-path.md](./subtasks/04-directory-path.md) | 03 | completed |
| [05-file-range-read.md](./subtasks/05-file-range-read.md) | 01, 04 | completed |
| [06-port-boundary.md](./subtasks/06-port-boundary.md) | 01 | pending |
| [07-blob-adapter.md](./subtasks/07-blob-adapter.md) | 05, 06 | pending |
| [08-node-adapter-cli.md](./subtasks/08-node-adapter-cli.md) | 05 | pending |
| [09-local-base-check.md](./subtasks/09-local-base-check.md) | 08 | pending |
| [10-final-alignment.md](./subtasks/10-final-alignment.md) | 01, 02, 03, 04, 05, 06, 07, 08, 09 | pending |

最后一行始终为最终对齐验证，依赖所有其他子任务。ID 分配后保持不变；新增修复项使用新 ID，插入最终验证之前并加入其依赖，不要求最终验证拥有最大的数字。

## 执行记录

- **2026-10-04 — 本机负载导致完整 `pnpm check` 超时：** 子任务 04 完成时，其他桌面应用把 load average 推到 10–23，`tools/` 中启动子进程的用例反复超时。typecheck、lint、build 与 `src/original-data` 测试均通过；在 HEAD 基线上，同负载下同样超时。
  影响：04 记录了与本改动无关的环境失败。最终对齐（10）必须在负载正常时取得完整 `pnpm check` 的通过结果，不能以本记录代替。

## 审批

用户于 2026-10-04 明确批准本 goal，批准范围为上述 10 个子任务的拆分、依赖关系和验收覆盖。同日用户明确批准 spec。批准不代表实现完成。
