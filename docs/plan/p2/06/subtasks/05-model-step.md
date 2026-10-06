---
type: plan
status: active
phase: P2
task: "06"
subtask: "05"
updated: 2026-10-05
---

# 05 — 模型转换步骤与 `models` 组草稿

**契约来源：** [spec](../spec.md) 的 S-06（模型身份来自输入的绑定）、S-08（失败边界）、S-09（步骤与组）；[步骤结果与 `models` 组](../spec.md#步骤结果与-models-组)、[错误码](../spec.md#错误码)的失败边界一览、[行为与边界](../spec.md#行为与边界)；AC-07 的共用读取部分，AC-08 的步骤与组部分。
**依赖：** 03。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **模型转换步骤（计划新增 `src/original-data/conversion/model-step.ts`）：** `runModelStep(source, mappings, declarations, references, limits, usage)` 依次执行：
  1. **配对：** 读取声明（03），检查声明与映射一一对应，否则为 `invalid-declaration`，位置为 `models.declarations[<i>]` 或 `models.declarations`。每个模型映射必须恰为 `MAIN/SR.NOB` 中一个 MODL 整条目（单一部件、不带子资源），否则为 `invalid-declaration`，位置为 `models[<Asset ID>].model`。
  2. **核验：** 用 [step-entry-reader.ts](../../../../../src/original-data/conversion/step-entry-reader.ts) 的步骤内读取，经 `verifySourceMappings` 核验映射。核验失败保持 P2-03 的 code 与 `sources.mappings[…]` 位置。
  3. **读取：** 由同一读取得到 MODL 块；收集部件引用的 MESH 条目号，在同一封包中按 MESH 类型逐个读取，每个条目在一步内只物理读取一次（跨部件、跨模型共用）。MESH 缺失或类型不符时，保持 P2-03 的 code 与限值，位置改写为该引用的 `models[<Asset ID>].parts[<l>][<p>].mesh`；光盘层失败原样传出。
  4. **转换：** 调用 03 的 `convertModels`。
  5. **来源状态：** 转换成功后，按核验后的映射由 `assetSourceStates` 得出不带定位的来源状态。
- **结果：** 冻结的纯数据，形状同 P2-05 的步骤结果：`models` 组的描述符、payload 与来源状态按 ID 升序一一对应；本步骤的转换用量，`sourceReadBytes` 恒为 0。不含定位、条目编号、原版字节或解析中间结构。任一模型失败时整步失败，不输出结果。
- **组草稿合并：** 提供把图形步骤的 `models` 分区与本步骤结果合并为一个 `models` 组草稿（`GroupDraft`）的函数，供 07 的作业使用。合并时不重新转换；描述符与来源状态按 ID 升序合并；重复 ID 以内容层读取错误拒绝。
- **测试（计划新增 `model-step.test.ts`）：** 在合成封包上用 [conversion.test-support.ts](../../../../../src/original-data/conversion/conversion.test-support.ts) 的计量来源，覆盖：
  - AC-07：MESH 被多个部件与模型共用时只读取一次；对照未共用读取时读取更多；
  - AC-08（步骤部分）：结果按 ID 排序，不含定位或条目编号；与图形 `models` 分区合并，并补入合成的弹丸、导弹、碎片 Asset 后，`validateGroup` 返回 `group-complete`，外部要求恰为模型引用的 sound ID；把一个贴图映射设为 unconfirmed 时返回 `incomplete` 与 `source-not-ready`；
  - 任一模型转换失败时整步失败、不输出结果；
  - 失败边界一览的每一行：映射核验失败、MESH 缺失与类型不符、光盘层失败、结构与声明错误。
- **文档：** [源码结构](../../../../engineering/source-structure.md)新增“模型转换步骤”：流程、读取共用、位置改写与组草稿合并。

## 不包含

- 生产声明、映射与查找表（04、06），以及从机型绑定生成声明（06）。
- 作业、协议与组的发送（07）。

## 关键文件与契约

- 计划新增 `src/original-data/conversion/model-step.ts` 及测试。
- 复用 [verify-source-mappings.ts](../../../../../src/original-data/source/verify-source-mappings.ts)、[source-mapping.ts](../../../../../src/original-data/source-mapping.ts)（`readSourceMappingTable`、`assetSourceStates`）、[graphics-step.ts](../../../../../src/original-data/conversion/graphics-step.ts) 的结果形状、[manifest-identity.ts](../../../../../src/content/manifest-identity.ts) 的 `GroupDraft`、[completeness.ts](../../../../../src/content/completeness.ts) 的 `validateGroup`。
- `original-data/conversion/` 只经产品入口取得封包，遵守[底层能力边界](../../../../engineering/README.md#lint-规则eslintconfigjs)。

## 验收标准

- [ ] AC-07（共用读取）：被多个部件或模型引用的 MESH 在一步内只物理读取一次，用计量端口断言读取次数。
- [ ] AC-08（步骤部分）：结果按 ID 升序且不含定位；与图形分区合并并补入合成效果 Asset 后 `validateGroup` 为 `group-complete`，外部要求恰为 sound 引用；必需角色来源未确认时为 `incomplete` 与 `source-not-ready`；任一模型失败时不输出结果。
- [ ] 失败边界一览逐行断言：
  - 映射核验保持 `sources.mappings[…]`；
  - MESH 缺失或类型不符时保持 P2-03 的 code，位置改写为 `….parts[<l>][<p>].mesh`；
  - 光盘层失败原样传出；
  - 其余位置符合位置语法。
- [ ] `pnpm exec vitest run src/original-data`、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- Node 测试，用计量端口与合成 IMFAT 封包；位置用 03 的位置语法检查。
- 不适用 browser-testing。
- 完成前按 execute-goal 流程，以本子任务 diff 为范围做 rubber-duck 审查与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据
