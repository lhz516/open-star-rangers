---
type: plan
status: active
phase: P2
task: "08"
subtask: "11"
updated: 2026-10-05
---

# 11 — 生产音效表与生产格式规则

**契约来源：** [spec](../spec.md) 的 S-01（生产规则）、S-03（生产行）、S-12（本子任务部分），AC-03、AC-13（生产表与研究记录一致）；[切片音效集合](../spec.md#切片音效集合)、[Asset ID 规则](../spec.md#asset-id-规则)、[采样格式规则](../spec.md#采样格式规则)、[音效描述符与生产音效表](../spec.md#音效描述符与生产音效表)、[包身份](../spec.md#包身份)。
**依赖：** 06、10。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **生产行：** 在 06 建立的 `src/original-data/conversion/production-sounds.ts` 中，依据 09、10 写入 `docs/original/` 的结论，填入切片音效集合的全部行：
  - **核心角色：** 四个核心角色的每个变体一行，ID 为 `sound/<角色词干>`；有多个变体时，用途已确认的按用途命名，否则用中性序号。`role` 为对应的切片角色。
  - **模型可达样本：** 其余模型可达的 SND 每个一行，ID 为 `sound/model-clip/<两位序号>`，`role` 为 `model-sound`。序号一次分配后冻结，不由条目编号或槽位推导。
  - **别名与共用：** 同一角色内，精确重复的条目作为同一部件的 `alternatives`，同一源样本只形成一个 Asset；既属于核心角色又被模型引用时，用核心角色的 ID。
  - **映射字段：** 每行的 `confidence`、`unknowns` 与 `evidence` 与 `docs/original/` 的记录一致；`evidence` 指向具体章节。
  - **跨角色共用样本：** 两个核心角色用到字节完全相同的不同条目时，按 spec 的“切片音效集合”各建一个 Asset。每个 Asset 只映射到原版为该角色播放的条目，不互列 `alternatives`。导弹与 Warp 开始即属此类。
  - **冲突处理：** 若两个核心角色用到同一个条目，按 spec 记为契约问题，本子任务 blocked，修订 spec 后再继续。
- **生产格式规则：** 写入研究确认的取值：切片中出现的每个 `flags` 值，及其声道数与循环方式；16 位按 `s16le` 接受。未研究的取值不写入。
- **版本：** 生产 `ConverterVersion` 保持 `osr-import.audio-1`。这是生产表首次填入；P2-11 接线缓存之前没有任何持久化的旧输出，因此不需要递增。之后对表或规则的任何改动，都按 spec 的规则递增组件。
- **测试：** 新增读取真实生产表的 Node 测试，并让边界回归覆盖 locator 不外泄。
  - **06 留下的空表测试须迁移：** 以下测试在空表下运行生产音频阶段，表填入后会因合成光盘缺少生产 SND 条目或空表断言而失败：[production-sounds.test.ts](../../../../../src/original-data/conversion/production-sounds.test.ts) 的空表与空规则断言，以及只含生产图形的合成光盘场景（[import-job.test.ts](../../../../../src/workers/import-job.test.ts) 与 [import-pipeline.test.ts](../../../../../src/app/import/import-pipeline.test.ts) 的图形用例、[import-worker.test-support.ts](../../../../../src/workers/import-worker.test-support.ts) 与 [import-worker.spec.ts](../../../../../e2e/import-worker.spec.ts) 的 `graphics` 场景）。
  - **迁移方式：** 推荐在合成生产光盘中加入与生产表对应的合成 SND 条目，并更新这些场景的预期；也可以让只关心图形的用例注入 `NO_AUDIO`，另保留一个经生产音频阶段的组合用例。
- **文档：** 在源码结构指南记录生产表的位置、行形状与“唯一绑定”规则。

## 不包含

- 研究结论本身（09、10）；本子任务只把已记录的结论写入代码。
- 基准镜像上的运行核对（12）。
- 模型到样本的依赖边（P2-06）。

## 关键文件与契约

- **修改：** `src/original-data/conversion/production-sounds.ts`（06 新增）与其测试（计划新增）。
- **复用：** 04 的行读取与投影；[source-mapping.ts](../../../../../src/original-data/source-mapping.ts) 的 `readSourceMappingTable`。
- **允许的内容：** 条目编号、类型标签与光盘路径属于来源定位，P2-01 的设计允许它们出现在 `original-data/` 的映射中；不得出现样本字节、名称或其他原版内容。

## 验收标准

- [ ] AC-03：只有一张生产音效表。
  - 四个核心角色各至少一行；
  - ID 唯一、升序，符合 Asset ID 规则，不含条目编号；
  - 每行的 locator 都是 `MAIN/SR.NOB` 的 `SND`，`subresource` 为 null；
  - 非 `confirmed` 的行都列有 U 项，证据指向 `docs/original/`；
  - 各行的 `mapping` 投影能通过 `readSourceMappingTable`。
- [ ] AC-03（边界）：locator 不出现在 `content/`、`platform/`、`app/`、`ui/` 的任何导出中，依赖图回归通过。
- [ ] AC-13（一致性）：四个核心角色都不是 `unconfirmed`；每行的置信度与 U 项与 `docs/original/` 的记录一致；生产规则只含研究确认的取值。
- [ ] 生产 `ConverterVersion` 仍为 `osr-import.audio-1`，06 的测试保持通过。
- [ ] `pnpm exec vitest run src/original-data src/workers tools/engineering-boundaries.test.ts`、`pnpm typecheck`、`pnpm lint`、`pnpm check:original` 通过。

## 验证方法

- Node 测试读取真实生产表与规则。人工审阅每行与 `docs/original/` 记录的对应关系，并在证据中列出：行数、各角色的行数、置信度分布，以及 `docs/original/` 的链接。
- 不适用浏览器检查；基准镜像在 12 中核对。
- 完成前按 execute-goal 流程，以本子任务 diff 为范围做 rubber-duck 审查与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据
