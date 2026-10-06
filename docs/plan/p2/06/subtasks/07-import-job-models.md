---
type: plan
status: active
phase: P2
task: "06"
subtask: "07"
updated: 2026-10-05
---

# 07 — 导入作业、协议与 `models` 组

**契约来源：** [spec](../spec.md) 的 S-08（作业边界的失败分类）、S-09；[协议变化](../spec.md#协议变化)、[步骤结果与 `models` 组](../spec.md#步骤结果与-models-组)、[持久化与兼容](../spec.md#持久化与兼容)、[错误码](../spec.md#错误码)的失败边界一览；AC-09，AC-16 的 Worker 部分。
**依赖：** 06。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。合入后的具体值见 [goal 前提](../goal.md#代码现状与前提)。

## 工作范围

- **绑定传递：** [convert-logic.ts](../../../../../src/original-data/conversion/convert-logic.ts) 的结果追加机型模型绑定（`bindCraftTypes` 的 `models`）。[import-job.ts](../../../../../src/workers/import-job.ts) 的 `LogicStepInput.convert` 随之返回 `{ drafts, usage, models }`，测试的 `NO_LOGIC` 返回空绑定。模型步骤只用这份绑定，不重读任务或 M2ID。
- **作业：** `createImportJob(open, graphics, logic, audio, models)` 的模型步骤输入默认为 06 的生产输入，只有测试替换。
  1. **阶段：** `convert-audio` 之后进入 `convert-models`，阶段开始时报告一次进度，之后每次端口读取报告一次。
  2. **预算：** 作业限值为输入字节加上图形、逻辑与模型三个步骤的份额；模型步骤在逻辑用量之上扣除，音频仍按自己的限值从零核算。
  3. **组装：** 保留图形步骤的 `models` 分区，与模型步骤结果合并为 `models` 组草稿（05）；`cockpit-hud-map` 分区仍留在作业内，归 P2-07。
  4. **身份与检查：** 以 `applyManifestIdentity` 对逻辑草稿、`audio` 组与 `models` 组一次推导同一 `ManifestIdentity`，再由 `checkPackageTransfers` 检查转移列表，并算出最终用量（来源读取用量、逻辑链累计转换用量与音频用量逐维之和）。
  5. **发送：** 以上全部通过后才逐组发送。`models` 组总是发送，即使没有 Asset。任何转换、预算、身份或用量失败都不会发出组。
- **协议：** [import-protocol.ts](../../../../../src/workers/import-protocol.ts)：
  - `IMPORT_STAGES` 末尾追加 `convert-models`，`IMPORT_PROTOCOL_VERSION` 由 4 递增为 5；
  - `canReportStage` 改为只接受与当前阶段相同或紧随其后的阶段。跳过一个或多个阶段、倒退，或在第一个组之后出现任何进度，都不被接受；识别规则不变；
  - [import-host.ts](../../../../../src/workers/import-host.ts) 与 [import-job-owner.ts](../../../../../src/app/import/import-job-owner.ts) 共用这条规则，持有者报 `protocol-error@message.stage`。
- **`ConverterVersion`：** [converter-version.ts](../../../../../src/original-data/conversion/converter-version.ts) 按“作业打包的各转换器组件，按阶段顺序”加入图形组件（`graphics-1`，定义于图形转换模块）与 03 的 `models-1`，生产值为 `osr-import.graphics-1.logic-1.audio-1.models-1`。
- **测试支持：**
  - [synthetic-import.test-support.ts](../../../../../src/workers/synthetic-import.test-support.ts) 新增 `NO_MODELS` 与期望用量；
  - [import-worker.test-support.ts](../../../../../src/workers/import-worker.test-support.ts) 新增 `models` 与 `models-corrupt` 场景，后者的合成 MESH 损坏；`syntheticGroupsJob` 丢弃作业自己的组；
  - [logic-check.ts](../../../../../tools/logic-check.ts) 的分阶段读取量加入 `convert-models`。
- **测试：**
  - [import-protocol.test.ts](../../../../../src/workers/import-protocol.test.ts)、[import-host.test.ts](../../../../../src/workers/import-host.test.ts)：阶段集合与版本 5、相邻规则；
  - [import-job-owner.test.ts](../../../../../src/app/import/import-job-owner.test.ts)：倒退，以及在前序转换阶段尚未报告时直接出现 `convert-models`；
  - [import-job.test.ts](../../../../../src/workers/import-job.test.ts) 与 [import-pipeline.test.ts](../../../../../src/app/import/import-pipeline.test.ts)：
    - 成功顺序；
    - `models` 组经接收方验证且与 Node 期望一致；
    - 三组共用同一身份，且身份由全部已发送组重新推导；
    - 生产 `ConverterVersion`；
    - 失败边界一览的各类失败，失败与取消时没有部分组；
  - [logic-check.test.ts](../../../../../tools/logic-check.test.ts)。
- **文档：** [源码结构](../../../../engineering/source-structure.md)的导入 Worker 一节（作业、协议版本、阶段规则、组装、`ConverterVersion`、测试支持与场景）；[工程约定](../../../../engineering/README.md#本地浏览器-runner)的导入 Worker 测试说明；[工具指南](../../../../guides/tools.md)中 logic-check 的读取量字段。

## 不包含

- 真实 Chromium Worker 的浏览器用例（08）；本地基准核对（09）。
- `cockpit-hud-map` 组的装配与发送（P2-07）；缓存接线（P2-11）。

## 关键文件与契约

- 修改 [convert-logic.ts](../../../../../src/original-data/conversion/convert-logic.ts)、[import-job.ts](../../../../../src/workers/import-job.ts)、[import-protocol.ts](../../../../../src/workers/import-protocol.ts)、[converter-version.ts](../../../../../src/original-data/conversion/converter-version.ts) 与图形转换模块（图形组件常量），以及上列测试与测试支持、[logic-check.ts](../../../../../tools/logic-check.ts)。
- 复用 05 的组草稿合并、[manifest-identity.ts](../../../../../src/content/manifest-identity.ts)、`checkPackageTransfers`、[budget.ts](../../../../../src/content/budget.ts) 的 `addBudgets`。

## 验收标准

- [x] AC-09：阶段集合为 `identify-source`、`convert-graphics`、`convert-logic`、`convert-audio`、`convert-models`，协议版本为 5，版本不符时在发送 `start` 之前失败。
- [x] AC-09：成功作业依次为前序阶段、至少一条 `convert-models` 进度、发送各组、`finished`；`readBytes` 不减少；接收方验证后的 `models` 组与 Node 期望一致；全部已发送组共用一个身份；`ConverterVersion` 为 `osr-import.graphics-1.logic-1.audio-1.models-1`。
- [x] AC-09：持有者对阶段倒退与跳过阶段都报 `protocol-error@message.stage`。
- [x] AC-09：失败按失败边界一览逐类验证，失败与取消的快照都不含部分组：
  - 前序阶段的失败保持原结果；
  - 模型映射核验失败保持 P2-03 的位置；
  - MESH 缺失或类型不符时，位置改写为 `….parts[<l>][<p>].mesh`；
  - 光盘层失败保持 `disc` 层与原位置；
  - 转换失败的 code 与位置符合位置语法。
- [x] AC-16（Worker 部分）：`workers/` 仍不使用网络 API；`pnpm check` 通过。

## 验证方法

- Node `MessageChannel` 集成测试、宿主与持有者的单元测试、作业测试；所有输入由合成光盘生成。
- 浏览器用例归 08；本子任务完成后，以 `pnpm test:e2e e2e/import-worker.spec.ts --project=development` 确认现有用例只需更新阶段序列与期望。
- 完成前按 execute-goal 流程，以本子任务 diff 为范围做 rubber-duck 审查与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据
- **实现：**
  - [convert-logic.ts](../../../../../src/original-data/conversion/convert-logic.ts) 的结果追加 `models`，即 `bindCraftTypes` 的模型绑定。
  - [import-job.ts](../../../../../src/workers/import-job.ts)：
    - **输入：** `LogicStepGroups` 携带绑定；新增 `ModelStepInput`（`inputs(绑定)` 一并生成映射与声明，另含查找表与份额），生产默认值来自 06。`createImportJob(open, graphics, logic, audio, models)` 的作业限值为输入字节加图形、逻辑、模型三份份额；
    - **模型阶段：** 在 `convert-audio` 之后进入 `convert-models`，在逻辑用量之上扣除；
    - **组装：** 图形 `models` 分区与模型结果经 `modelsGroupDraft` 合并为 `models` 组草稿，总是发送；`applyManifestIdentity` 对逻辑草稿、`audio` 组与 `models` 组一次推导身份，`checkPackageTransfers` 之后才逐组发送；
    - **最终用量：** 读取用量、模型步骤的累计用量与音频用量之和。
  - [import-protocol.ts](../../../../../src/workers/import-protocol.ts)：版本为 5，`IMPORT_STAGES` 追加 `convert-models`；`canReportStage` 只接受重复当前阶段或进入下一阶段，宿主与持有者共用。
  - [converter-version.ts](../../../../../src/original-data/conversion/converter-version.ts) 加入 `GRAPHICS_CONVERTER_COMPONENT`（`graphics-1`，定义于 convert-graphics.ts）与 `MODEL_CONVERTER_COMPONENT`。
  - [logic-check.ts](../../../../../tools/logic-check.ts) 的读取量加入 `convert-models`。
- **测试支持：** [synthetic-import.test-support.ts](../../../../../src/workers/synthetic-import.test-support.ts) 有以下变化：
  - `NO_LOGIC` 返回空绑定，新增 `NO_MODELS`；
  - `syntheticGroupsJob` 丢弃作业自己的 `models` 与 `audio` 组；
  - 新增 `syntheticSource`，在 Node 中打开同一光盘，指纹相同；
  - `sliceCoveredFiles({ scenario?, corruptMesh? })`。

  [production-models.test-support.ts](../../../../../src/original-data/conversion/production-models.test-support.ts) 新增 `PRODUCTION_MODEL_USAGE`（按 payload 布局公式计算）与损坏网格选项。[import-worker.test-support.ts](../../../../../src/workers/import-worker.test-support.ts) 新增 `models` 与 `models-corrupt` 场景，供 08 使用。[conversion.test-support.ts](../../../../../src/original-data/conversion/conversion.test-support.ts) 新增 `UNLIMITED_BUDGET` 与 `withMeshReads`。
- **AC-09（阶段与版本）：**
  - [import-protocol.test.ts](../../../../../src/workers/import-protocol.test.ts) 断言版本 5 与 5 个有序阶段，并用 25 行表覆盖相邻规则：重复、前进一步、跳过一个或多个阶段、倒退、`null` 之后只能是识别进度，以及第一个组之后的进度。
  - 版本不符的 `ready` 与 `start` 在发送文件之前被拒绝（既有用例，改用 `IMPORT_PROTOCOL_VERSION - 1`）。
  - [import-host.test.ts](../../../../../src/workers/import-host.test.ts) 按顺序经过 5 个阶段后发送两个组，顺序号连续；跳过音频阶段直接报模型进度、未报识别进度就报转换进度、倒退以及组之后的进度，都以 `internal-error` 失败。
- **AC-09（成功作业）：** [import-job.test.ts](../../../../../src/workers/import-job.test.ts) 在合成切片光盘上运行完整生产作业，覆盖以下各点：
  - **消息顺序：** 识别、`identified`、图形、逻辑、音频、至少两条 `convert-models` 进度、`group`、`finished`，`readBytes` 不减少；
  - **发送的组：** `logic`、`models`、`audio` 三组；`logic` 与 `audio` 为 `group-complete`；
  - **身份：** 三组的身份相同，且等于由逻辑草稿与另两组已发送草稿重新推导的值；`ConverterVersion` 为 `osr-import.graphics-1.logic-1.audio-1.models-1`；
  - **用量：** 等于图形、音效、逻辑与 `PRODUCTION_MODEL_USAGE` 之和加读取量；
  - **`models` 组：** 发送的组草稿（描述符与来源状态）与 Node 由同一来源及捕获的绑定独立运行图形步骤、模型步骤并合并得到的草稿完全相同。贴图未确认、效果角色缺失，所以为 `incomplete`。
- **AC-09（持有者）：** [import-job-owner.test.ts](../../../../../src/app/import/import-job-owner.test.ts) 的每个用例都先按顺序报告到相应阶段，确保命中预期条件。
  - **倒退：** 识别、逻辑与音频各有一例。
  - **跳过：** 识别后直接报 `convert-models`、在图形与逻辑之后跳过音频直接报 `convert-models`、跳过逻辑直接报音频，以及未报识别进度就报转换进度。

  这些情形都报 `protocol-error@message.stage`。按顺序经过 5 个阶段的作业照常结束。
- **AC-09（失败边界）：** import-job.test.ts 的“model conversion”用例逐类断言，都以 `convert-models` 进度后失败结束且没有组：
  - 删除一个绑定的 MODL：`source` 层 `entry-not-found@sources.mappings[0].parts[0].alternatives[0]`；
  - MESH 缺失或类型不符：`entry-not-found` 或 `entry-type-mismatch@models[model/base-1].parts[0][0].mesh`；
  - MESH 读取的光盘层失败：`disc` 层 `read-failed`，位置不变；
  - 网格损坏：`source` 层 `invalid-payload@models[model/base-1].parts[0][1].mesh`，符合位置语法。

  前序阶段的失败（字库损坏、逻辑份额不足等）保持原结果。[import-pipeline.test.ts](../../../../../src/app/import/import-pipeline.test.ts) 经真实 `MessageChannel`：网格损坏时快照停在 `convert-models`，错误与宿主转换的 DTO 相等，没有组；作业在发送组之后失败时，持有者丢弃已收的组。取消的浏览器验证归 08。
- **AC-09（接收方）：** 管道测试中持有者把 `models` 组判为 `incomplete`，诊断与 Node 对收到的同一组消息的验证结果相同，codes 只有 `role-cardinality` 与 `source-not-ready`；`takeGroups()` 只移交完整的 `logic` 与 `audio` 组。
- **AC-16（Worker 部分）：** `pnpm check` 中的边界测试通过，`workers/` 仍不使用网络 API。
- **检查：**
  - `pnpm check` 通过（131 个文件、3,840 项，生产构建成功）；
  - `pnpm test:e2e e2e/import-worker.spec.ts --project=development` 通过（12 项）。既有浏览器用例只更新了阶段序列与组列表；音频用例的身份改为由 Node 对同一光盘推导的 `models` 草稿与 `audio` 清单共同推导，仍与 Worker 内的值相同。
- **rubber-duck：** 没有阻塞问题。采纳一项：[工具指南](../../../../guides/tools.md#逻辑组核对)中 logic-check 的核对内容改为列出全部转换阶段。审查确认以下各点均成立：相邻规则、预算组合不重复计数、`models` 组总是发送且身份覆盖全部组、失败边界的覆盖、持有者用例命中预期条件，以及 E2E 在 Node 侧推导身份的方法。
- **simplify：** 采纳：
  - `ModelStepInput` 改用单个 `inputs` 函数，映射与声明不会来自不同的绑定；
  - `sliceCoveredFiles` 改为选项对象；
  - 新增共用的 `withMeshReads` 与 `UNLIMITED_BUDGET`；
  - 作业测试改为捕获整个逻辑结果；
  - 管道测试改用记录下的组消息验证，不再重跑作业，并改用 `stepsOf` 与显式的类型收窄。

  未采纳：
  - 用 `IMPORT_STAGES` 组成期望序列：测试中的序列兼作可读的观察记录，常量本身由协议测试固定；
  - 作业与 E2E 测试中在 Node 侧重新推导期望：这正是 AC-09 与身份的证据；
  - 失败用例经宿主与通道各运行一次：与其他阶段的失败用例一致；
  - 预算求和的微优化：开销可忽略；
  - 删除 `models-corrupt` 场景：08 会使用它；
  - `syntheticSource` 改用 `syntheticVerifiedSource`：后者没有版本 ID 参数，填充文件也不同，得不到相同的指纹。
- **文档影响：** 已更新：
  - [源码结构](../../../../engineering/source-structure.md#导入-worker)：协议版本 5 与相邻规则、宿主规则、作业的五个阶段、预算组合、`models` 组装配、`ConverterVersion`、注入点、测试支持与集成测试；
  - [工程约定](../../../../engineering/README.md#本地浏览器-runner)：导入 Worker 浏览器测试的阶段与身份推导；
  - [工具指南](../../../../guides/tools.md#逻辑组核对)：logic-check 的核对内容与读取量字段。

  STATUS 中“P2-08 与 P2-09 合入后”的阶段描述记录的是合入时的状态，P2-06 完成时由 13 统一更新阶段摘要。
