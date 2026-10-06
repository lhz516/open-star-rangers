---
type: plan
status: accepted
phase: P2
task: "05"
updated: 2026-10-05
---

# P2-05：调色板、索引图像与字体转换 — Goal

## 目标与来源

实现已批准的 [P2-05 spec](./spec.md) 中的 S-01 至 S-13 与 AC-01 至 AC-18：

- **content：** 调色板、索引图像与字体三类 payload schema 1，包括编码、严格读取、描述符一致性、RGBA 展开、最近色映射与字符查找。
- **original-data：** 源结构加固与 `SourceError` 扩展；图形转换声明与转换器；图形转换步骤，含步骤内共用读取与子资源核验；本任务的 5 个生产 Asset 与预算份额。
- **workers/app：** 新增 `convert-graphics` 阶段并递增协议版本，作业运行图形步骤并合并用量，持有者按阶段顺序校验进度。
- **证明：** Node 契约与集成测试、真实 Chromium Worker、本地全量结构校验、本地基准生产路径。
- **研究：** 最近色规则（U-028 颜色部分）与字符映射（U-030 字体部分），结论写入原版文档。

本文件不重新定义行为契约。

## 代码现状与前提

- **上游已完成：** `node tools/task-state.ts p2/01`、`p2/02`、`p2/03`、`p2/04` 都输出 `done`（2026-10-05 核对）。本任务直接复用以下模块：
  - **内容契约：** [asset-contract.ts](../../../../src/content/asset-contract.ts) 的 `AssetDescriptor`；[payload.ts](../../../../src/content/payload.ts) 的 `PayloadRecord`；[budget.ts](../../../../src/content/budget.ts) 的 `chargeBudget` 与 `EMPTY_BUDGET_USAGE`；[ownership.ts](../../../../src/content/ownership.ts) 的 `payloadTransferList`；[completeness.ts](../../../../src/content/completeness.ts) 的 `validateGroup`；[slice-definition.ts](../../../../src/content/slice-definition.ts) 的 `CLASSIC_P2_SLICE.groupKinds`；[sha256.ts](../../../../src/content/sha256.ts)；[contract-validation.ts](../../../../src/content/contract-validation.ts) 的严格读取与 `ContentContractErrorCode`。
  - **来源映射与核验：** [source-mapping.ts](../../../../src/original-data/source-mapping.ts) 的 `readSourceMappingTable` 与 `assetSourceStates`；[verify-source-mappings.ts](../../../../src/original-data/source/verify-source-mappings.ts)，当前逐个定位读取，含子资源的映射保留为 `declared`；[source-error.ts](../../../../src/original-data/source-error.ts)，code、限值名为封闭联合，`limit.observed` 不可为 null。
  - **已验证来源：** [open-verified-source.ts](../../../../src/original-data/source/open-verified-source.ts) 的产品入口；[archive-reader.ts](../../../../src/original-data/archive/archive-reader.ts) 的 `read` 返回独占的 `{ entry, bytes, relocations }`。
  - **现有解析器：** [payloads.ts](../../../../src/original-data/payloads.ts) 的 `parseVgaPalette`、`parseImage`、`decodeSpriteRle`、`parseMfdImages`、`parseBitmapFont`、`parseCockpitFonts` 都缺乏预算与部分校验，抛出无类型的 `PayloadError`（见 spec [当前实现与依据](./spec.md#当前实现与依据)）。MESH/MODL 解析归 P2-06，不在本任务修改。
  - **Worker：** [import-protocol.ts](../../../../src/workers/import-protocol.ts)（`IMPORT_STAGES` 只有 `identify-source`，协议版本 1）、[import-host.ts](../../../../src/workers/import-host.ts)、[import-job.ts](../../../../src/workers/import-job.ts)（以 `source.usage()` 结束）、[import-job-owner.ts](../../../../src/app/import/import-job-owner.ts)（`LATE_PROGRESS` 只拒绝识别之后的识别进度）。
  - **测试支持：** [synthetic.ts](../../../../src/original-data/synthetic.ts) 的 `buildImfat`（显式条目 ID）、`imageRecord`、`ByteWriter`；[disc.test-support.ts](../../../../src/original-data/disc/disc.test-support.ts) 的 `syntheticFileDisc`；[source.test-support.ts](../../../../src/original-data/source/source.test-support.ts) 的 `catalogFor`；[synthetic-import.test-support.ts](../../../../src/workers/synthetic-import.test-support.ts)；[import-worker.test-support.ts](../../../../src/workers/import-worker.test-support.ts)（按 Worker `name` 选场景）；[import-pipeline.test.ts](../../../../src/app/import/import-pipeline.test.ts)（`MessageChannel` 集成）；[synthetic-content.test-support.ts](../../../../src/content/synthetic-content.test-support.ts)；`e2e/import-worker.spec.ts`。
- **计划新增（均尚不存在）：**
  - `src/content/graphics/`：三类 payload 契约与纯展开、查找；
  - `src/original-data/conversion/`：源结构读取、转换声明与转换器、图形步骤、生产声明与映射、测试支持；
  - `local/research/p2-05/`：本地研究脚本与输出，被忽略、不提交。

  文件拆分可在执行时微调，但不得建立中央 schema 或第二套解析逻辑。
- **类型与边界：**
  - [tsconfig.core.json](../../../../tsconfig.core.json) 覆盖 `src/content` 与 `src/original-data`，没有 DOM 与 Node 类型；纯程序中没有 `TextEncoder`，ASCII 编码须手写（同 [synthetic-content.test-support.ts](../../../../src/content/synthetic-content.test-support.ts)）。
  - [eslint.config.js](../../../../eslint.config.js) 与 [original-data-capabilities.ts](../../../../tools/original-data-capabilities.ts)：`original-data/conversion/` 不属于任何能力族，只能经产品入口返回的 `VerifiedSource` 取得封包，可以纯类型导入 `archive-reader.ts` 的类型，不能值导入 `archive/` 或 `imfat.ts`。content 不得导入 `original-data`。
- **本地数据（2026-10-05 均已存在）：**
  - `local/StarRang/cd/` 的 CloneCD 文件组，06 的结构探查与 10 需要；
  - `local/StarRang/SRANGERS/MAIN/SR.NOB`，09 与 11 需要；
  - `local/StarRang/captures/` 的 DOSBox-X 截图，11 与 12 需要；
  - `local/ghidra/srangers.gpr`，11 与 12 只读分析需要。

  缺少时相应子任务为 blocked，不能用合成数据代替。
- **浏览器 runner：** 08 沿用 P2-04 的 Playwright development 项目与 `e2e/import-worker.spec.ts`。
- **并行协调：** P2-08/09 也会追加阶段并递增协议版本，按合入顺序同步 `IMPORT_STAGES`、持有者与 E2E；不建议多个 agent 同时修改 `src/workers/`、生产映射或本 goal。
- **spec 批准：** spec 已于 2026-10-05 由用户明确批准。
- **原版证据：** 事实与置信度见 [textures](../../../original/formats/textures.md)、[hud](../../../original/formats/hud.md)、[cockpit](../../../original/formats/cockpit.md)、[executable](../../../original/formats/executable.md) 与 [unknowns](../../../original/unknowns.md) 的 U-018、U-019、U-028、U-029、U-030。11 与 12 的研究只把地址、结构与结论写入 `docs/original/`，反编译输出、截图与原版字节留在 `local/`。

## 验收覆盖

| Spec 范围项/验收项 | 实现子任务 | 验证子任务及方法 |
|---|---|---|
| S-01 | 01、03、04 | 01 payload 往返；03 DATA 与 BGR 源读取测试；04 转换测试 |
| S-02 | 01、03、04 | 01 掩码与绑定不变量；03 解码测试；04 声明与行序、颜色键测试 |
| S-03 | 01、04、12 | 01 字体 payload；04 映射区间与单元断言；12 生产映射与 hud 对照 |
| S-04 | 01、02 | 01 读取器与一致性；02 展开、最近色与查找测试 |
| S-05 | 03、04 | 03 源结构拒绝；04 声明读取与转换 |
| S-06 | 05 | 05 子资源核验与来源状态测试 |
| S-07 | 01、03、04、05、06、07 | 01 限值常量；03 先于分配；04 预算扣除；05 共用读取；06 份额常量；07 用量合并 |
| S-08 | 01、02、03、04、07 | 各层错误码测试；07 三类失败分类；13 隐私复核 |
| S-09 | 05、07 | 05 步骤结果；07 阶段、协议与作业集成 |
| S-10 | 06 | 06 生产声明与映射测试；10 本地基准 |
| S-11 | 11、12 | 11 最近色研究；12 字符映射研究 |
| S-12 | 01–10 | 各子任务的 Node 测试；08 Chromium；09、10 本地 |
| S-13 | 01–12 | 各子任务的文档影响；13 链接、元数据与一致性 |
| AC-01 | 01、03、04 | 01 读取器拒绝；03 DATA、BGR、条目数与子资源；04 转换往返 |
| AC-02 | 01、03、04 | 03 非对称 raw/RLE 解码与所有权；04 `reversed`；01 掩码填充 |
| AC-03 | 03、04 | 03 源结构拒绝与 65535×65535 头部；04 预算拒绝 |
| AC-04 | 01、04 | 04 绑定与索引；01 读取器 `binding-mismatch` |
| AC-05 | 02 | 02 展开与最近色表驱动测试 |
| AC-06 | 04 | 04 颜色键测试 |
| AC-07 | 01、02、03、04 | 03 字体表与目录；04 单元断言与区间；01 payload；02 查找 |
| AC-08 | 01、04 | 01 确定性与读取器；04 转换确定性与 `validateGroup` |
| AC-09 | 05 | 05 合成光盘上的步骤测试 |
| AC-10 | 04、05、06、07 | 04 扣除；05 共用读取与迟到拒绝；06 份额常量；07 `finished.usage` |
| AC-11 | 07 | 07 Node `MessageChannel` 集成与持有者测试 |
| AC-12 | 08 | 08 `pnpm test:e2e e2e/import-worker.spec.ts --project=development` |
| AC-13 | 10 | 10 本地 Node 脚本，证据只记命令、计数与判定 |
| AC-14 | 09 | 09 本地运行加固后的 nob-check |
| AC-15 | 11 | 11 本地研究与 textures、U-028 文档审阅 |
| AC-16 | 12 | 12 本地研究、hud 与生产映射对照 |
| AC-17 | 01–08 | 各子任务 `pnpm typecheck`、`pnpm lint`；13 `pnpm check`、`pnpm check:original`、依赖与锁文件 diff |
| AC-18 | 01–12 | 09、11、12 原版文档；各子任务的源码结构与工程约定；13 链接与元数据检查 |

## 子任务跟踪

状态只在此维护：`pending` / `in-progress` / `blocked` / `completed`。依赖项全部 completed 后才能开始；验收结果和证据写在相应 subtask 文档，不在阶段索引重复状态。

| 子任务 | 依赖 | 状态 |
|---|---|---|
| [01-graphics-payloads.md](./subtasks/01-graphics-payloads.md) | — | completed |
| [02-expansion-lookup.md](./subtasks/02-expansion-lookup.md) | 01 | completed |
| [03-source-hardening.md](./subtasks/03-source-hardening.md) | 01 | completed |
| [04-graphics-conversion.md](./subtasks/04-graphics-conversion.md) | 01, 03 | completed |
| [05-graphics-step.md](./subtasks/05-graphics-step.md) | 04 | completed |
| [06-production-graphics.md](./subtasks/06-production-graphics.md) | 05 | completed |
| [07-worker-integration.md](./subtasks/07-worker-integration.md) | 05, 06 | completed |
| [08-browser-worker-graphics.md](./subtasks/08-browser-worker-graphics.md) | 07 | completed |
| [09-local-structure-check.md](./subtasks/09-local-structure-check.md) | 03 | completed |
| [10-local-base-check.md](./subtasks/10-local-base-check.md) | 07 | pending |
| [11-nearest-colour-research.md](./subtasks/11-nearest-colour-research.md) | 02, 04 | pending |
| [12-character-map-research.md](./subtasks/12-character-map-research.md) | 06 | pending |
| [13-final-alignment.md](./subtasks/13-final-alignment.md) | 01, 02, 03, 04, 05, 06, 07, 08, 09, 10, 11, 12 | pending |

最后一行始终为最终对齐验证，依赖所有其他子任务。ID 分配后保持不变；新增修复项使用新 ID，插入最终验证之前并加入其依赖，不要求最终验证拥有最大的数字。

## 执行记录

- **2026-10-05 — Spec 位置语法澄清（子任务 05）：** rubber-duck 指出 `graphics.declarations`（映射中有未声明的 Asset；声明组不是数组时 04 的读取器也报在这里）不在 spec 错误码的封闭位置语法内。按用户在调用 execute-goal 时给出的授权，spec 的[错误码](./spec.md#错误码)与[行为与边界](./spec.md#行为与边界)补充了这个声明组整体位置，并写明 `graphics.declarations[<i>]` 可带结构字段路径（04 已按此报告字段级位置）。行为、范围与验收标准不变；测试支持新增按 spec 编写的位置语法检查，覆盖 03–05 的转换错误位置。

## 审批

用户于 2026-10-05 明确批准本 goal，批准范围为上述 13 个子任务的拆分、依赖关系和验收覆盖。同日用户明确批准 spec。批准不代表实现完成。
