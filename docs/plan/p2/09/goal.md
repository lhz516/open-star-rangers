---
type: plan
status: accepted
phase: P2
task: "09"
updated: 2026-10-05
---

# P2-09：单任务与战略地图/Warp 数据 — Goal

## 目标与来源

实现已批准的 [P2-09 spec](./spec.md) 中的 S-01 至 S-14 与 AC-01 至 AC-15：

- **研究先行：** 所选任务的字段清单与地图/Warp 空间框架（S-01、S-02），结论写入 `docs/original/`，按[研究门槛](./spec.md#研究门槛与阻塞)处理超出预设形状的结果。
- **original-data：** SCCT/SCEN/M2ID 定向解析、机型与模型绑定、生产来源映射与子资源核验、转换为 `logic` 组；非封包 locator 经研究不适用（S-12，07 只记录依据）。
- **content：** 规范逻辑数据的类型、确定性编码与严格读取器，以及 `ManifestIdentity` 推导。
- **workers 与 app：** 生产导入作业追加 `convert-logic` 阶段并发送 `logic` 组，协议版本递增。
- **core：** 纯载入 `loadMission` 与 `MissionSetup`。
- **证明：** Node 合成测试、既有 Worker 浏览器回归、本地基准 CLI 与文档。

本文件不重新定义行为契约。

## 代码现状与前提

- **上游已完成：** `node tools/task-state.ts p2/01`、`p2/02`、`p2/03`、`p2/04` 都输出 `done`（2026-10-05 核对）。本任务复用以下模块：
  - **切片与内容契约：** [slice-definition.ts](../../../../src/content/slice-definition.ts) 的 `CLASSIC_P2_SLICE`；[completeness.ts](../../../../src/content/completeness.ts) 的 `validateGroup`、`GroupInput`；[content-identity.ts](../../../../src/content/content-identity.ts) 的 `ContentIdentity`、`contentIdentityKey`、`readConverterVersion`；[budget.ts](../../../../src/content/budget.ts) 的 `chargeBudget`、`BudgetRecord`；[asset-contract.ts](../../../../src/content/asset-contract.ts) 的 `AssetDescriptor`；[ownership.ts](../../../../src/content/ownership.ts)；[sha256.ts](../../../../src/content/sha256.ts) 的 `Sha256` 与 `sha256Fingerprint`；[contract-validation.ts](../../../../src/content/contract-validation.ts) 的严格读取原语与 `ContentContractError`。
  - **来源与读取：** [identify-source.ts](../../../../src/original-data/source/identify-source.ts) 的 `VerifiedSource`；[archive-reader.ts](../../../../src/original-data/archive/archive-reader.ts) 的 `ImfatArchiveHandle.read`；[source-mapping.ts](../../../../src/original-data/source-mapping.ts) 的 `readSourceMappingTable`、`assetSourceStates`；[verify-source-mappings.ts](../../../../src/original-data/source/verify-source-mappings.ts)；[source-error.ts](../../../../src/original-data/source-error.ts) 的 `SourceError`。
  - **导入作业：** [import-job.ts](../../../../src/workers/import-job.ts)、[import-host.ts](../../../../src/workers/import-host.ts)、[import-protocol.ts](../../../../src/workers/import-protocol.ts)（`IMPORT_PROTOCOL_VERSION` 为 1，`IMPORT_STAGES` 只有 `identify-source`）、[import-job-owner.ts](../../../../src/app/import/import-job-owner.ts)。
  - **Core：** [errors.ts](../../../../src/core/errors.ts) 的 `CoreInputError`；当前只有 [synthetic/](../../../../src/core/synthetic/)。
  - **测试支持：** [synthetic.ts](../../../../src/original-data/synthetic.ts) 的 `ByteWriter`、`buildImfat`；[disc.test-support.ts](../../../../src/original-data/disc/disc.test-support.ts) 的 `syntheticFileDisc` 与 `MARKER`；[source.test-support.ts](../../../../src/original-data/source/source.test-support.ts) 的 `catalogFor`；[source-error.test-support.ts](../../../../src/original-data/source-error.test-support.ts) 的位置语法 oracle `inLocationGrammar`；[synthetic-import.test-support.ts](../../../../src/workers/synthetic-import.test-support.ts) 的 `syntheticImport`、`syntheticOpen`、`syntheticGroupsJob`；[import-host.test-support.ts](../../../../src/workers/import-host.test-support.ts)。
- **计划新增（均尚不存在）：**
  - `src/original-data/formats/`：指针安全的数据块读取与 SCCT/SCEN/M2ID 解析，以及合成样本 test-support；
  - `src/original-data/conversion/`：生产 `ConverterVersion`、机型与模型绑定、生产来源映射表与子资源核验、`logic` 转换编排；
  - `src/content/manifest-identity.ts` 与 `src/content/logic/`；
  - `src/core/mission/`；
  - `tools/logic-check.ts` 与其测试。

  目录名依据[源码结构指南](../../../engineering/source-structure.md#后续扩展方向)对 P2 的推荐；各子任务可在同一目录内调整文件拆分，并在证据中写明。
- **既有测试受影响：** 生产作业追加转换后，[import-job.test.ts](../../../../src/workers/import-job.test.ts)、[import-pipeline.test.ts](../../../../src/app/import/import-pipeline.test.ts) 中“识别后无组结束”的用例，以及 `syntheticGroupsJob`（[import-worker.test-support.ts](../../../../src/workers/import-worker.test-support.ts) 与 [e2e/import-worker.spec.ts](../../../../e2e/import-worker.spec.ts) 使用）都会进入转换。10 负责把转换步骤做成与 `open` 相同的测试注入点，并更新这些用例。
- **能力边界：** [eslint.config.js](../../../../eslint.config.js) 的 `osr/original-data-capabilities` 规则对 `original-data` 中不属于 disc/archive/source 家族的目录生效，新目录只能以类型导入使用封包与光盘能力，经 `VerifiedSource` 取字节。Core 与 `content/` 禁止导入 `original-data`。这些规则已存在，本任务只需保持通过。
- **并行任务：** P2-05、P2-06、P2-08 尚无 spec（2026-10-05 `task-state` 输出 `generate-spec`）。03 与 10 开始前，再次确认它们没有先行落地等价的 `ConverterVersion`、`ManifestIdentity`、错误码或协议版本；若已落地，按 spec S-07 对齐为一份，并在执行记录中说明。
- **本地研究环境（01、02、12 需要）：**
  - `local/StarRang/cd/` 有开发者的 CloneCD 文件组（2026-10-05 已存在）；
  - Ghidra 项目 `local/ghidra/srangers` 与[基准环境指南](../../../guides/baseline-environment.md#静态分析)中的 `~/Tools/bin/ghidra-headless` 只读分析（`-noanalysis -readOnly`）；
  - `local/StarRang/captures/` 的既有截图（只在本地对照）。

  缺少时相应子任务为 blocked，不能用合成数据代替。
- **研究门槛：** 01、02 若触发 spec 的[研究门槛](./spec.md#研究门槛与阻塞)，该子任务标为 blocked，恢复条件为 spec 修订经 review-spec 审阅并由用户重新批准；若 S/AC 改变，重新运行 generate-goal 对齐本 goal。
- **原版证据：** [scenario](../../../original/formats/scenario.md)、[executable](../../../original/formats/executable.md)、[hud §3](../../../original/formats/hud.md#3-id-lists-confirmed-structure)、[B-001](../../../original/behavior/B-001-strategic-map.md)、[U-022/U-023](../../../original/unknowns.md#数据与格式)。所选任务字段与 Core 载入的独立原版对照归 P2-12；本任务只取得 AC-14 的本地结构核对。
- **前提：** spec 已于 2026-10-05 由用户明确批准。

## 验收覆盖

| Spec 范围项/验收项 | 实现子任务 | 验证子任务及方法 |
|---|---|---|
| S-01 | 01 | 01 本地只读研究与文档核对；13 复核 |
| S-02 | 02 | 02 本地静态分析或截图对照与文档核对；13 复核 |
| S-03 | 05 | 05 合成解析测试；09 读取范围日志；12 本地基准 |
| S-04 | 04、09 | 04 编码与读取器测试；09 端到端规范数据断言 |
| S-05 | 06 | 06 绑定测试与源码搜索；13 核对 P2-06 交接 |
| S-06 | 08 | 08 映射表与子资源核验测试 |
| S-07 | 03、10 | 03 身份推导测试；10 作业中每组携带同一身份 |
| S-08 | 09 | 09 `validateGroup` 与预算测试 |
| S-09 | 10 | 10 Node 集成测试；`pnpm test:e2e import-worker.spec.ts --project=development` |
| S-10 | 11 | 11 Node 测试 |
| S-11 | 04、05、09、10、11 | 各自的负向测试；10 错误 DTO 经宿主与持有者到达 |
| S-12 | 07 | 07 条件测试，或记录不适用依据 |
| S-13 | 03、04、05、06、07、08、09、10、11、12 | 各子任务的合成测试；13 核对测试不读取 `local/`、无新增二进制 |
| S-14 | 01、02、03 至 12（文档）、12（CLI） | 12 本地运行；13 文档链接与元数据 |
| AC-01 | 01 | 01 文档 diff、`pnpm --silent check:original` |
| AC-02 | 02 | 02 文档 diff 与置信度；09、13 源码搜索无框架数值 |
| AC-03 | 05、06、09 | 05 解析正向；06 绑定正向；09 规范数据逐字段断言 |
| AC-04 | 05、08、09 | 05 解析负向与限值；08 `subresource-mismatch`；09 识别之后的读取日志 |
| AC-05 | 04 | 04 `pnpm exec vitest run src/content` |
| AC-06 | 06 | 06 绑定测试与源码搜索 |
| AC-07 | 08 | 08 合成映射表与合成光盘测试 |
| AC-08 | 03、10 | 03 推导测试与源码搜索；10 作业集成 |
| AC-09 | 09 | 09 Node 测试 |
| AC-10 | 10 | 10 Node 集成测试；既有 Node 与浏览器回归 |
| AC-11 | 11 | 11 `pnpm exec vitest run src/core`；ESLint 与边界回归 |
| AC-12 | 07 | 07 Node 测试，或不适用依据 |
| AC-13 | 05、09、10、11、12 | 各自的隐私标记测试；13 边界回归、`pnpm lint` 与代码审阅 |
| AC-14 | 12 | 12 本地运行，证据只记命令、计数与哈希 |
| AC-15 | 01 至 12 | 13 文档链接、锚点与元数据检查 |

## 子任务跟踪

状态只在此维护：`pending` / `in-progress` / `blocked` / `completed`。依赖项全部 completed 后才能开始；验收结果和证据写在相应 subtask 文档，不在阶段索引重复状态。

| 子任务 | 依赖 | 状态 |
|---|---|---|
| [01-field-inventory.md](./subtasks/01-field-inventory.md) | — | completed |
| [02-spatial-frame.md](./subtasks/02-spatial-frame.md) | 01 | completed |
| [03-package-identity.md](./subtasks/03-package-identity.md) | — | completed |
| [04-logic-content.md](./subtasks/04-logic-content.md) | 02 | completed |
| [05-scenario-parser.md](./subtasks/05-scenario-parser.md) | 02 | completed |
| [06-craft-binding.md](./subtasks/06-craft-binding.md) | 04, 05 | completed |
| [07-file-range-locator.md](./subtasks/07-file-range-locator.md) | 02 | completed |
| [08-logic-sources.md](./subtasks/08-logic-sources.md) | 05, 07 | completed |
| [09-logic-conversion.md](./subtasks/09-logic-conversion.md) | 03, 04, 06, 08 | completed |
| [10-import-stage.md](./subtasks/10-import-stage.md) | 03, 09 | pending |
| [11-core-load-mission.md](./subtasks/11-core-load-mission.md) | 04 | pending |
| [12-local-base-check.md](./subtasks/12-local-base-check.md) | 10, 11 | pending |
| [13-final-alignment.md](./subtasks/13-final-alignment.md) | 01, 02, 03, 04, 05, 06, 07, 08, 09, 10, 11, 12 | pending |

最后一行始终为最终对齐验证，依赖所有其他子任务。ID 分配后保持不变；新增修复项使用新 ID，插入最终验证之前并加入其依赖，不要求最终验证拥有最大的数字。

## 执行记录

- **2026-10-05 — 子任务 01 触发研究门槛，spec、goal 与子任务已修订：** 所选任务用到了原定为不支持的位置：
  - 段 3、段 5 布局与段 6；
  - 记录 +0x3C、+0x44、+0x48、+0x54 与 +0x58。

  所有记录的位置与 +0x40 都为零，放置完全依赖矩形、锚点与布局；头部 0x00/0x04 决定世界范围。
  证据：[切片字段清单](../../../original/formats/scenario.md#selected-mission-field-inventory-confirmed-structure)与 [executable 放置与世界网格](../../../original/formats/executable.md#mission-placement-scheduling-and-world-grid)。
  受影响验收：AC-01（门槛项）、AC-02、AC-03、AC-04、AC-05、AC-11、AC-12、AC-14；子任务 02、04、05、07、08、09、11、12 的范围。
  处理：用户在本次 execute-goal 调用中授权：子任务因需修订 spec 而阻塞时，可直接修订 spec、goal 与 subtasks，并在本节说明。据此按技术决定 3，合并 01 与 02 的研究结果修订 spec 一次：
  - S-02 为结论 2，S-12 不适用；
  - 修订经 rubber-duck 审阅后按该授权视为重新批准。

  S/AC 编号、子任务 ID 与依赖不变，只调整相关子任务的范围与验收。
- **2026-10-05 — 子任务 09 更正 AC-09 的可触发预算维度：** 原文要求经转换器触发 `missionObjects` 与 `missionReferences` 的超限。子任务 01 的修订规定编组模板与成员必须是段 1 记录的别名，因此结构限值下：
  - 任务声明至多 64 个，僚机至多 16 个，`missionObjects` 至多 80，低于上限 256，不可达；
  - 64 个编组、每组 64 个成员位置即超过 `missionReferences` 上限 4,096；
  - 64 个编组各写入 256 个布局元素即超过 `payloadBytes` 上限 1,048,576。

  处理：按上述授权，把 spec 与子任务 09 中 AC-09 的可触发维度更正为 `missionReferences` 与 `payloadBytes`；其余维度的不可达依据记在 09 的完成证据中。S/AC 编号与子任务依赖不变。

## 审批

用户于 2026-10-05 明确批准本 goal，批准范围为上述 13 个子任务的拆分、依赖关系和验收覆盖。同日用户明确批准 spec。

同日 spec 因研究门槛修订后，相关子任务的范围与验收随之调整，ID、依赖与验收覆盖不变。这些调整依据用户在 execute-goal 调用中的授权生效，见[执行记录](#执行记录)。批准不代表实现完成。
