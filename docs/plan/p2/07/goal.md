---
type: plan
status: accepted
phase: P2
task: "07"
updated: 2026-10-05
---

# P2-07：驾驶舱、HUD 与战略地图资源 — Goal

## 目标与来源

实现已批准的 [P2-07 spec](./spec.md) 中的 S-01 至 S-11 与 AC-01 至 AC-18：

- **content：** 布局 payload schema 1（编码、严格读取、与描述符依赖的一致性）与唯一的纯布局合成函数。
- **original-data：** CCKD 分组与元素、MFDD 列表、TABL 图像列表的容器解析与子资源；布局声明与转换；图形步骤接受容器来源；本任务的生产声明、映射与份额。
- **workers：** 装配并发送 `cockpit-hud-map` 组，写入共用包身份；`PRODUCTION_CONVERTER_VERSION` 加入 `graphics` 组件。
- **研究：** R1–R8（前视来源、地图调色板、TABL 结构与切片画面覆盖表、状态 MFD 与透明、重叠顺序、10165、字体引用、地图图标对应），结论写入 `docs/original/`。
- **证明：** Node 契约与集成测试、真实 Chromium Worker、加固后的 nob-check、本地基准生产路径与本地截图比较。

本文件不重新定义行为契约。

## 代码现状与前提

- **上游已完成：** `node tools/task-state.ts` 对 `p2/04`、`p2/05`、`p2/08`、`p2/09`、`p2/10` 都输出 `done`（2026-10-05 核对）。本任务直接复用：
  - **图形 payload（P2-05）：** [graphics-format.ts](../../../../src/content/graphics/graphics-format.ts) 的 `GRAPHICS_SCHEMA_VERSION`、`GRAPHICS_LIMITS` 与读取 helper；[image-payload.ts](../../../../src/content/graphics/image-payload.ts)、[palette-payload.ts](../../../../src/content/graphics/palette-payload.ts)、[font-payload.ts](../../../../src/content/graphics/font-payload.ts)；[graphics-binding.ts](../../../../src/content/graphics/graphics-binding.ts) 的 `checkGraphicsBinding` 与 `GraphicsPayload` 联合（目前只有三类）；[expand-image.ts](../../../../src/content/graphics/expand-image.ts) 的 `expandImage`；[glyph-lookup.ts](../../../../src/content/graphics/glyph-lookup.ts)。
  - **图形转换（P2-05）：** [source-graphics.ts](../../../../src/original-data/conversion/source-graphics.ts) 的 `readImageRecordHeader`、`decodeImageRecord`、`readEmbeddedPalette`（都接受块内偏移）、`readMfdRecordOffsets`、`readCockpitFonts`；[graphics-declarations.ts](../../../../src/original-data/conversion/graphics-declarations.ts)（`GraphicsKind` 只有 `palette`、`image`、`font`）；[convert-graphics.ts](../../../../src/original-data/conversion/convert-graphics.ts)；[graphics-step.ts](../../../../src/original-data/conversion/graphics-step.ts)（`sourceKindOf` 只接受 DATA、整条目 TEX/BITM 及其 `palette`、CCKD 的 `fonts/<i>`）；[step-entry-reader.ts](../../../../src/original-data/conversion/step-entry-reader.ts)；[conversion-budget.ts](../../../../src/original-data/conversion/conversion-budget.ts)；[production-graphics.ts](../../../../src/original-data/conversion/production-graphics.ts)（5 个 Asset 与 `PRODUCTION_GRAPHICS_SHARE`）。
  - **错误：** [source-error.ts](../../../../src/original-data/source-error.ts) 的 `SourceErrorCode` 与 `SourceLimitName` 封闭联合；[contract-validation.ts](../../../../src/content/contract-validation.ts) 的 `ContentContractErrorCode`。
  - **包身份与作业（P2-08/09）：** [converter-version.ts](../../../../src/original-data/conversion/converter-version.ts) 的 `PRODUCTION_CONVERTER_VERSION`（`osr-import.logic-1.audio-1`）与 `productionIdentityBasis`；[manifest-identity.ts](../../../../src/content/manifest-identity.ts) 的 `GroupDraft` 与 `applyManifestIdentity`；[import-job.ts](../../../../src/workers/import-job.ts)（图形步骤只保留用量；`checkPackageTransfers` 与结束用量在发送前校验）；[import-protocol.ts](../../../../src/workers/import-protocol.ts)（协议版本 4）；[import-job-owner.ts](../../../../src/app/import/import-job-owner.ts)。
  - **测试支持：** [conversion.test-support.ts](../../../../src/original-data/conversion/conversion.test-support.ts)（`recordBlock`、`rawImageBlock`、`spriteImageBlock`、`cockpitBlock`、`graphicsArchive`、`graphicsMapping`、`countedVerifiedSource`、`expectSourceError`）；[production-graphics.test-support.ts](../../../../src/original-data/conversion/production-graphics.test-support.ts)；[synthetic.ts](../../../../src/original-data/synthetic.ts)；[synthetic-import.test-support.ts](../../../../src/workers/synthetic-import.test-support.ts)（`graphicsCoveredFiles`、`productionCoveredFiles`、`PRODUCTION_CONVERSION_USAGE`）；[import-worker.test-support.ts](../../../../src/workers/import-worker.test-support.ts)（按 Worker `name` 选场景）；[import-pipeline.test.ts](../../../../src/app/import/import-pipeline.test.ts)；[import-worker.spec.ts](../../../../e2e/import-worker.spec.ts)。
  - **工具：** [nob-check.ts](../../../../tools/nob-check.ts) 已校验 MFDD 记录与 CCKD 字体，尚不解析 CCKD 分组与 TABL。
- **计划新增（均尚不存在）：**
  - `src/content/graphics/` 中的布局 payload 与合成模块及相邻测试；
  - `src/original-data/conversion/` 中的 TABL 图像列表解析（或并入 `source-graphics.ts`），以及布局转换相关代码；
  - `local/research/p2-07/`：本地研究脚本与输出，被忽略、不提交。

  文件拆分可在执行时微调，但不得建立中央 schema 或第二套图像、颜色或合成逻辑。
- **类型与边界：** [tsconfig.core.json](../../../../tsconfig.core.json) 覆盖 `src/content` 与 `src/original-data`，没有 DOM 与 Node 类型；`content/` 不导入 `original-data`；`original-data/conversion/` 只经 `VerifiedSource` 取得封包，见 [eslint.config.js](../../../../eslint.config.js) 与 [original-data-capabilities.ts](../../../../tools/original-data-capabilities.ts)。
- **本地数据（2026-10-05 均已存在）：** `local/StarRang/cd/` 的 CloneCD 文件组（16）；`local/StarRang/SRANGERS/MAIN/SR.NOB`（05、07–11、15）；`local/StarRang/captures/` 的 92 张截图（08–11、15）；`local/ghidra/srangers.gpr`（研究子任务的只读 EXE 分析）。缺少时相应子任务为 blocked，不能用合成数据代替。
- **并行任务：** [P2-06](../06/spec.md) 的 spec 已批准、尚未执行。它同样修改图形步骤、生产映射、作业与 `ConverterVersion`，并新增 `convert-models` 阶段。涉及共享文件的子任务开始前先并入 `main`；若 P2-06 已加入 `graphics` 组件，13 只递增它（spec [组结果与包身份](./spec.md#组结果与包身份)）。不建议两个 agent 同时修改 `src/workers/`、`production-graphics.ts` 或图形步骤。
- **`graphics` 组件的取值：** 13 首次打包图形输出时加入（或递增）该组件。本任务后续子任务（10、12）再改变图形输出时不再逐次递增，因为任务完成前没有缓存消费者（P2-11 尚未接线），与 P2-08 在任务内保持 `audio-1` 的做法一致；17 核对最终取值。
- **研究证据规则：** 证据要求、置信度与入选规则见 spec [研究与入选门槛](./spec.md#研究与入选门槛)。研究子任务只把文件名、计数、判定、地址与结构写入 `docs/original/`；截图、像素、颜色值、原版文字与反编译输出留在 `local/`。入选族未达交付条件时，相应子任务为 blocked 并记录恢复条件。
- **spec 批准：** spec 已于 2026-10-05 由用户明确批准，rebase 后的前提更新也已确认。
- **原版证据：** [cockpit](../../../original/formats/cockpit.md)、[hud](../../../original/formats/hud.md)、[textures](../../../original/formats/textures.md)、[B-001](../../../original/behavior/B-001-strategic-map.md) 与 [unknowns](../../../original/unknowns.md) 的 U-006、U-029、U-030。

## 验收覆盖

| Spec 范围项/验收项 | 实现子任务 | 验证子任务及方法 |
|---|---|---|
| S-01 | 01 | 01 编码往返与读取器拒绝 |
| S-02 | 02 | 02 逐像素合成测试 |
| S-03 | 03、04、06 | 03 CCKD 与 MFDD 容器测试；06 TABL 测试；04 经步骤的等价转换 |
| S-04 | 04 | 04 布局声明与转换测试 |
| S-05 | 05、08、09、10、11、15 | 各研究子任务的文档与生产常量对照审阅 |
| S-06 | 12 | 12 生产声明、映射与份额测试；16 本地基准 |
| S-07 | 13 | 13 Node 作业与持有者集成测试 |
| S-08 | 03、06、12、13 | 03、06 结构限值常量；12 份额常量；13 作业限值组合 |
| S-09 | 02、03、04、06 | 各层错误码与位置测试；17 隐私复核 |
| S-10 | 01–16 | 各子任务的 Node 测试；07、15、16 本地；14 Chromium |
| S-11 | 01–16 | 各子任务的文档影响；17 链接、元数据与一致性 |
| AC-01 | 01 | 01 读取器往返、拒绝与 `validateGroup` |
| AC-02 | 02 | 02 非对称样本逐像素断言 |
| AC-03 | 03、04 | 03 CCKD 解析正负路径与先于分配；04 经步骤的偏移 0 等价与 `fonts/<i>` 回归 |
| AC-04 | 03、06 | 03 MFDD；06 TABL |
| AC-05 | 04 | 04 布局转换、声明拒绝与 `verified` 时机 |
| AC-06 | 12、13 | 13 合成作业的组装、身份与角色负例；12 生产声明含已知使用的各族 |
| AC-07 | 04、12、13 | 04 同一 CCKD 一步只读一次；12 份额常量；13 作业限值、预算拒绝与 `finished.usage` |
| AC-08 | 13 | 13 消息顺序、发送前失败与发送后失败 |
| AC-09 | 14 | 14 `pnpm test:e2e e2e/import-worker.spec.ts --project=development` |
| AC-10 | 08 | 08 本地研究；cockpit、U-029 与生产映射审阅 |
| AC-11 | 05、09 | 05 TABL 结构；09 覆盖表、图像族、R4 透明与 R6 |
| AC-12 | 15 | 15 本地重叠计数与截图逐像素比较 |
| AC-13 | 16 | 16 本地 Node 脚本，证据只记命令、计数与判定 |
| AC-14 | 07 | 07 本地运行加固后的 nob-check |
| AC-15 | 01–16 | 各子任务 `pnpm typecheck`、`pnpm lint`；17 `pnpm check`、`pnpm check:original`、依赖与锁文件 diff |
| AC-16 | 01–16 | 研究子任务的原版文档；各子任务的源码结构与工具指南；17 链接与元数据检查 |
| AC-17 | 10 | 10 本地字形比较；hud 与生产字符映射对照 |
| AC-18 | 11 | 11 本地研究；hud 审阅与源码搜索 |

## 子任务跟踪

状态只在此维护：`pending` / `in-progress` / `blocked` / `completed`。依赖项全部 completed 后才能开始；验收结果和证据写在相应 subtask 文档，不在阶段索引重复状态。

| 子任务 | 依赖 | 状态 |
|---|---|---|
| [01-layout-payload.md](./subtasks/01-layout-payload.md) | — | pending |
| [02-layout-composition.md](./subtasks/02-layout-composition.md) | 01 | pending |
| [03-container-records.md](./subtasks/03-container-records.md) | — | pending |
| [04-layout-conversion.md](./subtasks/04-layout-conversion.md) | 01, 03 | pending |
| [05-table-structure-research.md](./subtasks/05-table-structure-research.md) | — | pending |
| [06-table-records.md](./subtasks/06-table-records.md) | 03, 04, 05 | pending |
| [07-local-structure-check.md](./subtasks/07-local-structure-check.md) | 03, 06 | pending |
| [08-cockpit-palette-research.md](./subtasks/08-cockpit-palette-research.md) | 02, 03 | pending |
| [09-hud-family-research.md](./subtasks/09-hud-family-research.md) | 03, 06, 10 | pending |
| [10-font-text-research.md](./subtasks/10-font-text-research.md) | — | pending |
| [11-map-icon-research.md](./subtasks/11-map-icon-research.md) | 06 | pending |
| [12-production-cockpit-hud.md](./subtasks/12-production-cockpit-hud.md) | 04, 06, 08, 09 | pending |
| [13-group-assembly.md](./subtasks/13-group-assembly.md) | 04 | pending |
| [14-browser-worker-group.md](./subtasks/14-browser-worker-group.md) | 12, 13 | pending |
| [15-local-composite-check.md](./subtasks/15-local-composite-check.md) | 12 | pending |
| [16-local-base-check.md](./subtasks/16-local-base-check.md) | 12, 13 | pending |
| [17-final-alignment.md](./subtasks/17-final-alignment.md) | 01, 02, 03, 04, 05, 06, 07, 08, 09, 10, 11, 12, 13, 14, 15, 16 | pending |

最后一行始终为最终对齐验证，依赖所有其他子任务。ID 分配后保持不变；新增修复项使用新 ID，插入最终验证之前并加入其依赖，不要求最终验证拥有最大的数字。

## 执行记录

## 审批

用户于 2026-10-05 明确批准本 goal，批准范围为上述 17 个子任务的拆分、依赖关系和验收覆盖。spec 已于同日获批。批准不代表实现完成。
