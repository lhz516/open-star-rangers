---
type: plan
status: accepted
phase: P2
task: "06"
updated: 2026-10-06
related: [ADR-0007, ADR-0008, ADR-0015, U-022, U-027, U-028]
---

# P2-06：切片模型与材质转换 — Goal

## 目标与来源

实现已批准的 [spec](./spec.md) 中 S-01 至 S-13 与 AC-01 至 AC-17：

- 规范模型 payload 与纯消费辅助；
- 加固的 MESH/MODL 源结构读取；
- 经 P2-05 管线转换的切片贴图与调色板；
- 模型转换步骤、`convert-models` 阶段，以及 `models` 组的装配与发送；
- 弹丸、导弹、碎片（U-027）与歧义贴图条目（U-028）的定向研究。

本文件不重新定义行为契约。

## 代码现状与前提

- **执行前提已满足：** spec“执行前提与协调”要求先合入 P2-08 与 P2-09。二者已于 2026-10-05 合入 `main`（合并提交 `b5f1b86`、`b359515`），`node tools/task-state.ts p2/08` 与 `p2/09` 都为 `done`。spec 中标为“合入后”的条款以合入后的代码为准：
  - **协议：** 版本 4；[import-protocol.ts](../../../../src/workers/import-protocol.ts) 的 `IMPORT_STAGES` 为 `identify-source`、`convert-graphics`、`convert-logic`、`convert-audio`。`canReportStage(latest, stage, identified, grouped)` 只要求阶段不倒退，目前允许跳过中间阶段。
  - **包身份：** [manifest-identity.ts](../../../../src/content/manifest-identity.ts) 的 `applyManifestIdentity` 与 [converter-version.ts](../../../../src/original-data/conversion/converter-version.ts) 的 `productionIdentityBasis`，对作业发送的全部组草稿推导一次身份。[import-job.ts](../../../../src/workers/import-job.ts) 的 `checkPackageTransfers` 在发送前检查转移列表。
  - **`ConverterVersion`：** `osr-import.` 后按阶段顺序接作业打包的各转换器组件，目前为 `osr-import.logic-1.audio-1`。
  - **预算：** 图形与逻辑共用一份作业限值（输入字节加两步份额），逻辑步骤在图形用量之上扣除；音频按 `AUDIO_BUDGET_LIMITS` 从零核算。
  - **作业入口：** `createImportJob(open, graphics, logic, audio)`；图形步骤的结果只留在作业内。

  据此，本任务的“合入后”条款落实为：
  - `convert-models` 追加为第五个阶段，协议版本为 5；
  - 模型步骤份额并入图形与逻辑共用的作业限值，在逻辑用量之上扣除；
  - 图形输出首次随 `models` 组打包，因此 `ConverterVersion` 增加图形与模型两个组件，为 `osr-import.graphics-1.logic-1.audio-1.models-1`；
  - 作业在全部阶段之后总是发送 `models` 组（与 `audio` 组一致，即使没有 Asset 也发送），全部已发送组共用一个身份。
- **现有实现：**
  - **MESH/MODL：** [payloads.ts](../../../../src/original-data/payloads.ts) 的 `parseMesh`、`parseModel` 是研究用解析器：抛出 `PayloadError`，不检查浮点有限性、颜色范围、部件保留字段与块长公式，没有数量上限。其合成样本只在 [payloads.test.ts](../../../../src/original-data/payloads.test.ts) 内部构造。[nob-check.ts](../../../../tools/nob-check.ts) 用这两个函数全量核对。
  - **内容契约：**
    - [asset-units.ts](../../../../src/content/asset-units.ts) 规定模型单位为 `model-with-internal-geometry`；
    - [slice-definition.ts](../../../../src/content/slice-definition.ts) 给出 `models` 组的角色与基数，弹丸、导弹、碎片可以是 `model` 或 `image`；
    - [completeness.ts](../../../../src/content/completeness.ts) 的 `validateGroup` 检查角色基数、组内依赖、payload 身份与来源状态；
    - [budget.ts](../../../../src/content/budget.ts) 已有 `vertices`、`triangles` 维度与 `addBudgets`；
    - [contract-validation.ts](../../../../src/content/contract-validation.ts) 的 content code 是封闭集合，[import-protocol.test.ts](../../../../src/workers/import-protocol.test.ts) 用类型完整的记录逐一列出 content code 与限值名；
    - [graphics-binding.ts](../../../../src/content/graphics/graphics-binding.ts) 与 [expand-image.ts](../../../../src/content/graphics/expand-image.ts) 是图形 payload 的绑定检查与唯一的颜色展开。
  - **来源与读取：**
    - [source-mapping.ts](../../../../src/original-data/source-mapping.ts) 允许 `model` 映射到 MESH 或 MODL；`assetSourceStates` 把 `unconfirmed` 置信度映射为 `unconfirmed` 状态；
    - [verify-source-mappings.ts](../../../../src/original-data/source/verify-source-mappings.ts) 接受注入的 `EntryReader`，[step-entry-reader.ts](../../../../src/original-data/conversion/step-entry-reader.ts) 保证同一条目在一步内只读取一次；
    - [conversion-budget.ts](../../../../src/original-data/conversion/conversion-budget.ts) 的 `chargeConversionBudget` 按 `SourceError('budget-exceeded')` 核算；[payload-block.ts](../../../../src/original-data/formats/payload-block.ts) 是 `formats/` 解析器共用的块读取。
  - **图形（P2-05）：** [production-graphics.ts](../../../../src/original-data/conversion/production-graphics.ts) 在 `models` 组只产生 `palette/flight/models`；[graphics-step.ts](../../../../src/original-data/conversion/graphics-step.ts) 按组分区返回结果；合成光盘见 [production-graphics.test-support.ts](../../../../src/original-data/conversion/production-graphics.test-support.ts)。
  - **逻辑（P2-09）：**
    - [craft-binding.ts](../../../../src/original-data/conversion/craft-binding.ts) 的 `bindCraftTypes` 返回 `models: ModelBinding[]`（`{ id, modelEntryId }`），但 [convert-logic.ts](../../../../src/original-data/conversion/convert-logic.ts) 只在内部使用，返回值只有 `{ draft, usage }`；
    - 机型表映射的置信度为 likely，带 U-022、U-028；
    - 合成切片光盘 `sliceCoveredFiles` 由 [formats.test-support.ts](../../../../src/original-data/formats/formats.test-support.ts) 的 `syntheticModelEntries` 提供 M2ID 与 8 字节的占位 MODL。
  - **音效（P2-08）：** [production-sounds.ts](../../../../src/original-data/conversion/production-sounds.ts) 的 `PRODUCTION_SOUND_TABLE` 是 SND 条目与 sound ID 的唯一绑定（18 行）；合成 SND 由 `productionSoundEntries()` 生成。
  - **Worker 与 app：** [import-job.ts](../../../../src/workers/import-job.ts)、[import-host.ts](../../../../src/workers/import-host.ts)、[import-job-owner.ts](../../../../src/app/import/import-job-owner.ts)；测试支持 [synthetic-import.test-support.ts](../../../../src/workers/synthetic-import.test-support.ts)（`NO_GRAPHICS`、`NO_LOGIC`、`NO_AUDIO` 与各合成光盘）与 [import-worker.test-support.ts](../../../../src/workers/import-worker.test-support.ts)；集成与浏览器用例 [import-pipeline.test.ts](../../../../src/app/import/import-pipeline.test.ts)、`e2e/import-worker.spec.ts`；[logic-check.ts](../../../../tools/logic-check.ts) 按阶段记录读取量。
- **计划新增：**
  - `src/content/models/`：模型 payload、消费辅助与测试支持；
  - `src/original-data/formats/` 的 MESH、MODL 源读取；
  - `src/original-data/conversion/` 的模型声明、转换器、模型步骤、生产贴图表与生产模型输入；
  - `local/research/p2-06/` 的本地脚本（被忽略）。生成 spec 时的结构探查脚本已在该目录。
- **并行协调：** P2-07 在另一工作树进行（分支 `agents/cockpit-hud-strategic-map-spec-review`，2026-10-05 只有 spec 提交）。它同样会追加阶段并装配 `cockpit-hud-map` 组。按合入顺序同步阶段集合、`ConverterVersion` 组件、持有者与 E2E；不要让多个 agent 同时修改 `src/workers/`、`production-graphics.ts`、`converter-version.ts` 或本 goal。
- **本地数据（2026-10-05 均已存在）：**
  - `local/StarRang/cd/` 的 CloneCD 文件组：04、09、11、12 需要；
  - `local/StarRang/SRANGERS/MAIN/SR.NOB`：04、10、11、12 需要；
  - `local/StarRang/captures/`：11、12 需要；
  - `local/ghidra/srangers.gpr`：11、12 只读分析需要。

  缺少时相应子任务为 blocked，不能用合成数据代替。
- **原版证据：** [mesh](../../../original/formats/mesh.md)、[textures §3](../../../original/formats/textures.md#nearest-colour-metric-and-tie-rule-unconfirmed)、[executable](../../../original/formats/executable.md)、[hud §3](../../../original/formats/hud.md#3-id-lists-confirmed-structure)、[候选来源概况](../../../original/formats/scenario.md#campaign-candidate-source-profiles-confirmed-structure)、[audio](../../../original/formats/audio.md#slice-sample-set-and-role-correspondences-p2-08)，以及 [U-022、U-027、U-028](../../../original/unknowns.md#数据与格式)。研究只把地址、结构、计数与结论写入 `docs/original/`。
- **可预见的研究阻塞：** 按 spec [风险与恢复](./spec.md#风险与恢复)：
  - 11 可能需要先经用户批准修订 P2-01 切片定义，或修订本 spec；
  - 12 需要 EXE 证据，而 P2-05 的有界检索没有找到，也可以先修订并批准 P2-05 spec。

  达不到门槛时相应子任务为 blocked，记录原因与恢复条件。P2-11 依赖整项 P2-06，是否调整索引依赖由用户决定。

## 验收覆盖

| Spec 范围项/验收项 | 实现子任务 | 验证子任务及方法 |
|---|---|---|
| S-01 | 01 | 01 编码与严格读取的往返测试 |
| S-02 | 01 | 01 消费辅助测试，与 `expandImage` 展开一致 |
| S-03 | 02 | 02 源读取测试；10 本地全量 nob-check |
| S-04 | 03、06 | 03 声明与转换测试；06 生产引用表 |
| S-05 | 04 | 04 生产图形声明与合成光盘上的图形步骤 |
| S-06 | 05、06、07、11 | 06 模型 ID 与 `bindCraftTypes` 一致；07 作业传递绑定；09 本地；11 研究 Asset 的命名 |
| S-07 | 01、02、03、04、06、07 | 01/02 限值常量与先于分配；03 扣除；04/06 份额常量与上界；07 作业限值组合 |
| S-08 | 01、02、03、05、07 | 各层错误码测试；05/07 按失败边界一览逐类断言；13 隐私复核 |
| S-09 | 05、07、08 | 05 步骤结果与组草稿；07 阶段、协议与组装；08 Chromium |
| S-10 | 04、06、11 | 04/06 生产测试；09 本地基准；11 研究 |
| S-11 | 10、11、12 | 10 部件结构；11 U-027；12 U-028 |
| S-12 | 01–10 | 各子任务的 Node 测试；08 Chromium；09、10 本地 |
| S-13 | 01–12 | 各子任务的文档影响；13 链接、元数据与一致性 |
| AC-01 | 01 | 01 表驱动 Node 测试 |
| AC-02 | 01 | 01 Node 测试 |
| AC-03 | 02 | 02 Node 测试 |
| AC-04 | 02 | 02 Node 测试与源码检查 |
| AC-05 | 03 | 03 Node 测试 |
| AC-06 | 04 | 04 Node 测试与源码检查 |
| AC-07 | 03、04、05、06 | 03 扣除与拒绝；04 图形份额；05 计量端口的读取次数；06 模型份额与 payload 上界 |
| AC-08 | 05、06 | 05 合成步骤与 `validateGroup`；06 生产结构的合成光盘 |
| AC-09 | 07 | 07 Node `MessageChannel` 集成与持有者测试 |
| AC-10 | 08 | 08 `pnpm test:e2e e2e/import-worker.spec.ts --project=development` |
| AC-11 | 09 | 09 本地 Node 脚本，证据只记命令、计数、判定与诊断 code |
| AC-12 | 02、10 | 10 本地运行加固后的 nob-check |
| AC-13 | 11, 14 | 11 本地研究与可直接支持的 Asset；14 为需修订的弹丸与程序生成来源。文档与生产常量对照 |
| AC-14 | 12 | 12 本地研究；文档与映射对照，逐条目展开断言 |
| AC-15 | 01、10 | 01 源码结构；10 mesh |
| AC-16 | 01–08 | 各子任务 `pnpm typecheck`、`pnpm lint`；13 `pnpm check`、`pnpm check:original`、聚焦 E2E、依赖与锁文件 diff |
| AC-17 | 01–12 | 13 链接与元数据检查、最终 diff 审阅 |

## 子任务跟踪

状态只在此维护：`pending` / `in-progress` / `blocked` / `completed`。依赖项全部 completed 后才能开始；验收结果和证据写在相应 subtask 文档，不在阶段索引重复状态。

| 子任务 | 依赖 | 状态 |
|---|---|---|
| [01-model-payload.md](./subtasks/01-model-payload.md) | — | completed |
| [02-source-mesh-modl.md](./subtasks/02-source-mesh-modl.md) | 01 | completed |
| [03-model-conversion.md](./subtasks/03-model-conversion.md) | 01, 02 | completed |
| [04-slice-textures.md](./subtasks/04-slice-textures.md) | 02 | completed |
| [05-model-step.md](./subtasks/05-model-step.md) | 03 | completed |
| [06-production-models.md](./subtasks/06-production-models.md) | 04, 05 | completed |
| [07-import-job-models.md](./subtasks/07-import-job-models.md) | 06 | completed |
| [08-browser-worker-models.md](./subtasks/08-browser-worker-models.md) | 07 | completed |
| [09-local-base-check.md](./subtasks/09-local-base-check.md) | 07 | completed |
| [10-local-structure-records.md](./subtasks/10-local-structure-records.md) | 02 | completed |
| [11-effects-research.md](./subtasks/11-effects-research.md) | 09 | completed |
| [12-ambiguous-texture-research.md](./subtasks/12-ambiguous-texture-research.md) | 09 | blocked |
| [14-procedural-effect-sources.md](./subtasks/14-procedural-effect-sources.md) | 11 | blocked |
| [13-final-alignment.md](./subtasks/13-final-alignment.md) | 01, 02, 03, 04, 05, 06, 07, 08, 09, 10, 11, 12, 14 | pending |

最后一行始终为最终对齐验证，依赖所有其他子任务。ID 分配后保持不变；新增修复项使用新 ID，插入最终验证之前并加入其依赖，不要求最终验证拥有最大的数字。

## 执行记录

- **2026-10-06，11 的研究结论与 spec 修订：** 研究结论见 [executable 的效果表现来源](../../../original/formats/executable.md#effect-presentation-sources)：
  - 碎片与导弹各有本 spec 直接支持的整条目来源：`model/debris`（MODL 10383），以及 `image/missile` 与 `palette/missile`（TEX 10377）；
  - 弹丸只有程序几何。

  据此修订 [spec 的生产 Asset 与来源](./spec.md#生产-asset-与来源)：
  - 加入上述 Asset 的具体行，以及效果图像调色板的命名（`palette/<角色>`，角色 `texture-palette`）；
  - 说明研究确认模型的新贴图追加在贴图表尾（碎片模型的贴图为第 16 行）；
  - 份额表的依据列改为实际计数：贴图与效果图像共 34 个 Asset、410,624 像素；6 个模型、41 条依赖边、3,547 个顶点、3,700 个三角形。

  份额常量不变，用量都在份额之内。
- **2026-10-06，从 11 拆出 14：** 弹丸属于第 3 种结论；导弹体与部分碎片的几何来自 EXE 常量表，属于第 2 种来源形式。二者需要 P2-01 切片定义修订与 P2-06 表示修订，按 spec 须经用户批准，因此拆入新子任务 [14](./subtasks/14-procedural-effect-sources.md)，状态为 blocked，恢复条件写在该文档中。
  - 11 的验收范围相应缩小为研究结论与可直接支持的 Asset；
  - 13 增加对 14 的依赖，AC-13 的覆盖改为 11 与 14。
- **2026-10-06，12 为 blocked；12 与 14 的后续安排留给用户决定：**
  - 12 扩大后的有界 EXE 检索仍没有找到最近色实现，按阻塞规则记为 blocked，恢复条件写在该子任务中。
  - 曾向用户询问 14 的后续安排，用户当时无法回答。[P2 任务索引](../tasks.md#7-后续规划入口)规定，研究无法闭合时由用户 review 决定后续安排；12、14 的解除又分别需要用户批准 P2-05 证据门槛与 P2-01 切片定义的修订。因此不改动其他任务的契约，也不另建后续任务，只保留两项 blocked 及其恢复条件。
  - 13 等待二者，STATUS 的阻塞项已据此更新。

## 审批

用户于 2026-10-05 明确批准本 goal，批准范围为上述 13 个子任务的拆分、依赖关系和验收覆盖，以及“代码现状与前提”中据合入后代码落实的协议版本、阶段、`ConverterVersion`、预算组合与 `models` 组发送规则。spec 已于同日获批准。批准不代表实现完成。
