---
type: plan
status: accepted
phase: P2
task: "03"
updated: 2026-10-05
---

# P2-03：NOB、基准版本识别与输入校验 — Goal

## 目标与来源

实现 [P2-03 spec](./spec.md) 中的 S-01 至 S-13 与 AC-01 至 AC-14：
- **封包读取：** 在 `original-data` 中用一套共用规则校验 IMFAT 文件头、目录与重定位，提供内存解析与按需封包读取，并按 entry ID 与类型取条目。
- **版本与来源：** 版本白名单、两阶段版本识别、内容寻址的来源指纹、已验证来源句柄与产品入口，以及来源映射的条目级核验。
- **安全约束：** 结构限值、经镜像句柄的 `sourceReadBytes` 计量与取消、封闭错误码与安全诊断，以及由 lint 与依赖图强制的底层能力边界。
- **核对与文档：** 分段 SHA-256、本地来源核对 CLI、基准盘全量核对、原版结构事实记录与文档对齐。

本文件不重新定义行为契约。

## 代码现状与前提

- **现有封包解析：** [imfat.ts](../../../../src/original-data/imfat.ts) 的 `parseImfat`、`entryData`、`entryRelocations` 只作用于内存字节，校验缺口见 spec 的[问题与目标](./spec.md#问题与目标)；失败抛出只带消息的 `ImfatError`。
  - 调用者为 [nob-list](../../../../tools/nob-list.ts)、[nob-check](../../../../tools/nob-check.ts)、[imfat.test.ts](../../../../src/original-data/imfat.test.ts)；[source-mapping.ts](../../../../src/original-data/source-mapping.ts) 只纯类型导入 `ImfatEntry`。
  - [synthetic.ts](../../../../src/original-data/synthetic.ts) 的 `buildImfat` 只生成合法的连续布局，不能覆写文件头、保留字或偏移。
- **P2-02 已完成**（`node tools/task-state.ts p2/02` 输出 `done`），本任务直接复用：
  - [disc-image.ts](../../../../src/original-data/disc/disc-image.ts) 的 `openDiscImage`、`DiscImage.lookup`/`openFile`、`DiscFile.read`；
  - [disc-error.ts](../../../../src/original-data/disc/disc-error.ts) 的 `DiscReadError`；
  - [disc.test-support.ts](../../../../src/original-data/disc/disc.test-support.ts) 的合成镜像与读取日志 helper（目前按 LBA 放置扇区，需新增按路径放置多个文件的合成光盘）；
  - [node-byte-source.ts](../../../../tools/node-byte-source.ts) 与 [disc-check.ts](../../../../tools/disc-check.ts) 的 Node 端口、句柄关闭与报告模式。
- **P2-01 已完成**（`node tools/task-state.ts p2/01` 输出 `done`），本任务复用：
  - [sha256.ts](../../../../src/content/sha256.ts) 的一次性 `sha256Fingerprint`；
  - [content-identity.ts](../../../../src/content/content-identity.ts) 的 `readSourceFingerprint`；
  - [ownership.ts](../../../../src/content/ownership.ts) 的 `exclusiveBytes`、`payloadTransferList`；
  - [source-mapping.ts](../../../../src/original-data/source-mapping.ts) 的 `readSourceMappingTable`、`assetSourceStates`。
- **计划新增：** `src/original-data/archive/`、`src/original-data/source/` 及其测试，`tools/source-check.ts`；`src/workers/` 仍不存在，本任务不创建。
- **边界：** [eslint.config.js](../../../../eslint.config.js) 与 [engineering-boundaries.test.ts](../../../../tools/engineering-boundaries.test.ts) 目前允许 `src/workers/` 导入任何 `original-data` 模块；`tools/` 与测试可以导入 `original-data`。AC-14 须新增底层能力限制，且不放宽既有消费者规则。
- **测试与程序：**
  - Vitest 发现 `src/**/*.test.ts` 与 `tools/**/*.test.ts`；`content`/`original-data` 的测试只能导入 `vitest`、`node:crypto` 及这两层自身的模块，见[测试规则](../../../engineering/README.md#测试)。
  - 纯模块程序（[tsconfig.core.json](../../../../tsconfig.core.json)）不含 DOM 与 Node 类型。
  - [manifest 解析](../../../../tools/compliance/manifest.ts)的 `readManifest` 已返回路径、大小与哈希。
- **前提一：** spec 已于 2026-10-05 由用户明确批准。
- **前提二：本地基准数据（仅 09 需要）。** `local/StarRang/cd/` 下须有开发者的 CloneCD 文件组，`local/StarRang/SRANGERS/MAIN/` 下须有安装目录的 NOB。在没有这些数据的机器上，09 保持 blocked，不能用合成数据代替。
- **原版证据：** 2026-10-05 的只读结构调查脚本与输出留在 `local/research/p2-03/`，是 09 写入 [imfat](../../../original/formats/imfat.md) 的输入。相关未知项为 U-001、U-017、U-020，见[未知项登记表](../../../original/unknowns.md)。
- **验证分工：** 不需要 browser-testing；真实浏览器与 Worker 中的识别、取消与耗时由 P2-04 用 E2E 证明。

## 验收覆盖

| Spec 范围项/验收项 | 实现子任务 | 验证子任务及方法 |
|---|---|---|
| S-01 | 02、03 | 02 内存解析正负测试；03 按需读取与共用样本表；09 基准盘全量 |
| S-02 | 02、03 | 02 重定位规则测试；03 条目读取测试；09 逐条目核对 |
| S-03 | 03 | 03 读取日志、查找与独占字节测试 |
| S-04 | 04 | 04 生产白名单与 manifest 一致性测试 |
| S-05 | 05 | 05 两阶段识别、无关文件与读取日志测试 |
| S-06 | 04、05 | 04 规范文本与固定指纹测试；05 不同布局同指纹测试 |
| S-07 | 05、07 | 05 已验证来源与产品入口测试；07 lint/依赖图正负 fixture |
| S-08 | 06 | 06 映射核验正负测试 |
| S-09 | 02、03、05 | 02 限值边界；03 读取前限值、预算与取消；05 分段与取消 |
| S-10 | 02、03、04、05、06 | 各层 code/位置断言与隐私标记测试；10 复核 |
| S-11 | 01 | 01 测试向量与任意分段测试 |
| S-12 | 02、03、04、05、06 | 各层合成构建器与记录读取的端口；10 检查测试不读取文件 |
| S-13 | 08、09 | 08 CLI 与工具文档；09 基准盘运行与 `docs/original/` 事实；10 链接与导出一致性 |
| AC-01 | 02、03 | 02 内存解析表驱动测试；03 按需打开、条目数限值先于目录读取 |
| AC-02 | 02、03 | 02 重定位规则；03 条目读取、查找、读取日志、预算与取消 |
| AC-03 | 02、03 | 02 共用样本表；03 两条路径一致性；09 本地运行 `nob-list`/`nob-check` |
| AC-04 | 04 | 04 白名单读取器测试与 `tools/` 侧 manifest 一致性测试 |
| AC-05 | 05 | 05 合成光盘识别、独立计算指纹与读取日志测试 |
| AC-06 | 05 | 05 缺失/大小/哈希不符与光盘层错误传递测试 |
| AC-07 | 04、05 | 04 指纹对版本 ID、内容与覆盖集合的敏感性；05 不同布局同指纹 |
| AC-08 | 05 | 05 已验证来源句柄与生产白名单产品入口测试 |
| AC-09 | 06 | 06 映射核验正负与结构路径测试 |
| AC-10 | 02、03、05、06 | 各层 DTO 克隆、封闭 code 与标记测试；10 复核 |
| AC-11 | 01 | 01 `src/content` 测试，`pnpm typecheck`、`pnpm lint` |
| AC-12 | 08、09 | 08 CLI 合成临时文件测试；09 基准盘本地 CLI 核对 |
| AC-13 | 02、03、05、06、07、08、09 | 09 `docs/original/` 事实；10 文档链接/元数据、`pnpm check`、`pnpm check:original`、依赖与锁文件无变化 |
| AC-14 | 07 | 07 engineering-boundaries 正负 fixture 与 `pnpm lint` |

## 子任务跟踪

状态只在此维护：`pending` / `in-progress` / `blocked` / `completed`。依赖项全部 completed 后才能开始；验收结果和证据写在相应 subtask 文档，不在阶段索引重复状态。

| 子任务 | 依赖 | 状态 |
|---|---|---|
| [01-incremental-sha256.md](./subtasks/01-incremental-sha256.md) | — | completed |
| [02-archive-rules-memory.md](./subtasks/02-archive-rules-memory.md) | — | completed |
| [03-on-demand-archive.md](./subtasks/03-on-demand-archive.md) | 02 | completed |
| [04-catalog-fingerprint.md](./subtasks/04-catalog-fingerprint.md) | 02 | completed |
| [05-identify-verified-source.md](./subtasks/05-identify-verified-source.md) | 01, 03, 04 | completed |
| [06-mapping-verification.md](./subtasks/06-mapping-verification.md) | 05 | completed |
| [07-capability-boundary.md](./subtasks/07-capability-boundary.md) | 05 | completed |
| [08-source-check-cli.md](./subtasks/08-source-check-cli.md) | 05 | completed |
| [09-local-base-check.md](./subtasks/09-local-base-check.md) | 08 | completed |
| [10-final-alignment.md](./subtasks/10-final-alignment.md) | 01, 02, 03, 04, 05, 06, 07, 08, 09 | pending |

最后一行始终为最终对齐验证，依赖所有其他子任务。ID 分配后保持不变；新增修复项使用新 ID，插入最终验证之前并加入其依赖，不要求最终验证拥有最大的数字。

## 执行记录

## 审批

用户于 2026-10-05 明确批准本 goal，批准范围为上述 10 个子任务的拆分、依赖关系和验收覆盖。同日用户明确批准 spec。批准不代表实现完成。
