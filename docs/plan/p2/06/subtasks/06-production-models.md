---
type: plan
status: active
phase: P2
task: "06"
subtask: "06"
updated: 2026-10-05
---

# 06 — 生产模型输入与合成生产光盘

**契约来源：** [spec](../spec.md) 的 S-04（生产查找表）、S-06、S-07（模型份额）、S-10（机型模型）；[生产 Asset 与来源](../spec.md#生产-asset-与来源)的机型模型行、音效依赖与共用来源，[限值与预算](../spec.md#限值与预算)的模型步骤份额；AC-07 的模型份额部分，AC-08 的生产结构部分。
**依赖：** 04, 05。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **由机型绑定生成模型输入：** 模型 ID 只来自 P2-09 的 [`bindCraftTypes`](../../../../../src/original-data/conversion/craft-binding.ts)，不另建模型 ID 表。
  - 计划新增 `src/original-data/conversion/production-models.ts`，由绑定生成模型声明与映射：
    - **声明：** 角色由绑定的类别得出，玩家、敌方、基地交互、其他友方分别为 `player-ship`、`enemy-ship`、`base`、`friendly-craft`，组为 `models`。绑定若尚未给出类别，就在 `ModelBinding` 中追加，不另建类别表。
    - **映射：** `MAIN/SR.NOB` 中绑定给出的 MODL 整条目，置信度为 likely，U 项为 U-022、U-027、U-028。证据链接 [hud §3](../../../../original/formats/hud.md#3-id-lists-confirmed-structure)、[mesh §2](../../../../original/formats/mesh.md#2-modl-structure-confirmed-on-all-19-entries) 与 [mesh §3](../../../../original/formats/mesh.md#3-comparison-with-the-original-partial)、[玩家目标模式](../../../../original/formats/executable.md#player-target-modes-and-enemy-classification)。
  - 需要修改 [craft-binding.ts](../../../../../src/original-data/conversion/craft-binding.ts) 时，只追加字段，不改变现有命名规则与 P2-09 的测试意图。
- **生产查找表：** 03 使用的两张查找表：
  - 贴图表来自 04 的生产贴图表；
  - 音效表来自 P2-08 的 [`PRODUCTION_SOUND_TABLE`](../../../../../src/original-data/conversion/production-sounds.ts)，由 SND 条目号查得 sound ID，不自行命名 sound ID。
- **份额：** `PRODUCTION_MODEL_SHARE` 为 `assets` 16、`dependencyEdges` 96、`vertices` 8,192、`triangles` 8,192、`payloadBytes` 1,048,576，其余维度为 0。在份额、每个模型的 `modelParts` 上限与实际字节布局共同约束下计算的 payload 上界不超过 `payloadBytes` 份额。
- **合成生产光盘：** 被绑定的 5 个合成 MODL 改为合法内容（计划新增 `production-models.test-support.ts`）。目前 [formats.test-support.ts](../../../../../src/original-data/formats/formats.test-support.ts) 的 `syntheticModelEntries` 给出 8 字节的占位块。合法内容为：
  - 三个列表，部件引用合成 MESH 条目；
  - 贴图引用生产贴图表的 TEX 条目号（04 的合成 TEX）；
  - 音效槽引用生产音效表的 SND 条目号（`productionSoundEntries()`）；
  - 至少一个 MESH 被两个模型共用。

  M2ID 列表与 P2-09 的合成任务不变，P2-09 的测试继续通过；[synthetic-import.test-support.ts](../../../../../src/workers/synthetic-import.test-support.ts) 的 `sliceCoveredFiles` 随之包含合法模型、MESH 与贴图。
- **测试（计划新增 `production-models.test.ts`）：**
  - 份额等于 spec；payload 上界不超过份额；
  - 在合成生产光盘上对同一输入运行 `bindCraftTypes` 与模型步骤：5 个模型 ID 与绑定逐一相同，MODL 一致，角色正确；
  - 每个模型对非零音效槽的 sound ID 有依赖边，ID 与生产音效表一致；
  - 与图形 `models` 分区合并后的组草稿，满足同一光盘上逻辑转换对模型的全部外部要求。
- **文档：** [源码结构](../../../../engineering/source-structure.md)新增“生产模型”：绑定来源、角色、映射证据、查找表与份额。

## 不包含

- 把绑定从逻辑步骤传给模型步骤、作业阶段与组发送（07）。
- 研究确认的弹丸、导弹与碎片 Asset（11）。

## 关键文件与契约

- 计划新增 `src/original-data/conversion/production-models.ts`、`production-models.test-support.ts` 及测试。
- 修改 [craft-binding.ts](../../../../../src/original-data/conversion/craft-binding.ts)（仅在需要时追加类别）、[formats.test-support.ts](../../../../../src/original-data/formats/formats.test-support.ts) 或其调用处、[synthetic-import.test-support.ts](../../../../../src/workers/synthetic-import.test-support.ts)。
- 复用 04 的生产贴图表、P2-08 的 [production-sounds.ts](../../../../../src/original-data/conversion/production-sounds.ts) 与 [production-sounds.test-support.ts](../../../../../src/original-data/conversion/production-sounds.test-support.ts)、05 的步骤。

## 验收标准

- [ ] AC-08（生产结构部分）：模型步骤得到全部生产模型，机型模型的 ID 与对同一合成输入运行 P2-09 绑定得到的 ID 逐一相同；`logic` 组对模型的外部要求都由合并后的 `models` 组草稿满足。
- [ ] AC-07（模型份额）：`PRODUCTION_MODEL_SHARE` 以常量导出且与 spec 一致；在份额、`modelParts` 与实际字节布局约束下的 payload 上界不超过 `payloadBytes` 份额；结构上合法但超出份额的输入以 `budget-exceeded` 拒绝。
- [ ] 模型到样本的依赖边全部取自生产音效表，没有自行命名的 sound ID；映射的置信度、U 项与证据逐项断言。
- [ ] P2-09 与 P2-08 的既有测试在合法合成模型下继续通过；`pnpm check` 通过。

## 验证方法

- Node 测试；对照 `bindCraftTypes` 在同一合成输入上的输出。
- 不适用 browser-testing。
- 完成前按 execute-goal 流程，以本子任务 diff 为范围做 rubber-duck 审查与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据
