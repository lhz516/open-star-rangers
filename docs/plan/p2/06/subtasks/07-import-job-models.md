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

- [ ] AC-09：阶段集合为 `identify-source`、`convert-graphics`、`convert-logic`、`convert-audio`、`convert-models`，协议版本为 5，版本不符时在发送 `start` 之前失败。
- [ ] AC-09：成功作业依次为前序阶段、至少一条 `convert-models` 进度、发送各组、`finished`；`readBytes` 不减少；接收方验证后的 `models` 组与 Node 期望一致；全部已发送组共用一个身份；`ConverterVersion` 为 `osr-import.graphics-1.logic-1.audio-1.models-1`。
- [ ] AC-09：持有者对阶段倒退与跳过阶段都报 `protocol-error@message.stage`。
- [ ] AC-09：失败按失败边界一览逐类验证，失败与取消的快照都不含部分组：
  - 前序阶段的失败保持原结果；
  - 模型映射核验失败保持 P2-03 的位置；
  - MESH 缺失或类型不符时，位置改写为 `….parts[<l>][<p>].mesh`；
  - 光盘层失败保持 `disc` 层与原位置；
  - 转换失败的 code 与位置符合位置语法。
- [ ] AC-16（Worker 部分）：`workers/` 仍不使用网络 API；`pnpm check` 通过。

## 验证方法

- Node `MessageChannel` 集成测试、宿主与持有者的单元测试、作业测试；所有输入由合成光盘生成。
- 浏览器用例归 08；本子任务完成后，以 `pnpm test:e2e e2e/import-worker.spec.ts --project=development` 确认现有用例只需更新阶段序列与期望。
- 完成前按 execute-goal 流程，以本子任务 diff 为范围做 rubber-duck 审查与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据
