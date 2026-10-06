---
type: plan
status: active
phase: P2
task: "06"
subtask: "04"
updated: 2026-10-05
---

# 04 — 切片贴图与调色板

**契约来源：** [spec](../spec.md) 的 S-05、S-07（图形份额）、S-10（贴图部分）；[生产 Asset 与来源](../spec.md#生产-asset-与来源)的贴图与调色板行、贴图编号、显示与透明；[限值与预算](../spec.md#限值与预算)的图形步骤追加份额；AC-06，AC-07 的图形份额与读取部分。
**依赖：** 02。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **本地探查（被忽略的 `local/research/p2-06/`）：** 在本地基准镜像上确定生产贴图表的初始内容。
  - 用 P2-09 的机型绑定（经产品入口运行逻辑转换，或在同样的 M2ID 与任务输入上调用 `bindCraftTypes`）得到 5 个机型模型的 MODL；
  - 以 02 的 `readModel` 按“模型 ID 升序、列表 0–2、部件顺序”收集首次引用的 TEX，编出序号 `01` 起的初始表；
  - 记录 TEX 数量、尺寸与编码，以及每个 TEX 的像素实际用到的[歧义条目](../../../../original/formats/textures.md#nearest-colour-metric-and-tie-rule-unconfirmed)。生成 spec 时的探查结果是 15 个 TEX、其中 8 个用到歧义条目，作为本次核对的参照。
- **生产贴图表（计划新增 `src/original-data/conversion/production-model-textures.ts`）：**
  - 冻结的有序表：每行为序号 `<nn>` 与 `MAIN/SR.NOB` 的 TEX 条目号，以及该 TEX 是否用到未解决的歧义条目；
  - 由序号得到 `image/model-texture/<nn>` 与 `palette/model-texture/<nn>`，并导出 TEX 条目号到 image ID 的查找表，供 03 的转换器使用；
  - 表只追加，不重排；ID 不表达源条目号或语义猜测。
- **生产图形声明与映射：** 在 [production-graphics.ts](../../../../../src/original-data/conversion/production-graphics.ts) 中为每行追加：
  - **调色板：** 声明 `palette/model-texture/<nn>`，角色 `texture-palette`，组 `models`；映射为同一 TEX 条目的 `palette` 子资源，置信度为已确认（嵌入调色板按 BGR 读取，textures §3）。
  - **图像：** 声明 `image/model-texture/<nn>`，角色 `model-texture`，组 `models`，调色板绑定为同序号的调色板，显示映射为 `{ nearest: 'palette/flight/models' }`，透明按编码，行序按存储；映射为 TEX 整条目，置信度为 likely 并带 U-028。用到未解决歧义条目的 TEX 置信度为 unconfirmed 并带 U-028，证据链接 textures §3。
  - **份额：** `PRODUCTION_GRAPHICS_SHARE` 加上 spec 批准的追加份额：`assets` 40、`dependencyEdges` 64、`paletteEntries` 1,024、`imagePixels` 524,288、`payloadBytes` 655,360。
- **合成光盘：** [production-graphics.test-support.ts](../../../../../src/original-data/conversion/production-graphics.test-support.ts) 在生产表的每个 TEX 条目号放置合成 raw 图像记录（带嵌入调色板），使生产图形步骤能在合成光盘上转换。
- **随之变化的测试期望：** 图形步骤的 `models` 分区与图形用量随之变化。同步以下期望，并保持 P2-05、P2-08、P2-09 的既有断言意图不变：
  - `GRAPHICS_PAYLOAD_BYTES`、`PRODUCTION_CONVERSION_USAGE`；
  - 作业、管道与 E2E 用例中的图形用量。
- **测试：**
  - [production-graphics.test.ts](../../../../../src/original-data/conversion/production-graphics.test.ts)：声明、映射、置信度与 U 项逐项断言；份额等于 spec；按结构上限与头部计算的贴图 payload 上界不超过追加的 `payloadBytes` 份额；
  - 在合成生产光盘上运行图形步骤：`models` 分区含飞行调色板与每个 TEX 的 image、palette，ID 序号相同、依赖恰为自身调色板与飞行调色板；
  - 用计量端口断言同一 TEX 被 image 与 palette 共用时只物理读取一次；
  - 在合成声明上断言：两个模型共用的 TEX 只有一个 image Asset，内容相同的两个 TEX 条目各有一个 Asset。
- **文档：** [源码结构](../../../../engineering/source-structure.md)的“生产图形”增加贴图表与份额；本地探查结果只记在完成证据中。

## 不包含

- 模型转换与模型到贴图的依赖边（03、05、06）。
- 解决歧义条目（12）；研究可能追加的效果图像（11）。

## 关键文件与契约

- 计划新增 `src/original-data/conversion/production-model-textures.ts` 及测试。
- 修改 [production-graphics.ts](../../../../../src/original-data/conversion/production-graphics.ts)、[production-graphics.test.ts](../../../../../src/original-data/conversion/production-graphics.test.ts)、[production-graphics.test-support.ts](../../../../../src/original-data/conversion/production-graphics.test-support.ts)、[synthetic-import.test-support.ts](../../../../../src/workers/synthetic-import.test-support.ts)，以及受图形用量影响的 Node 与 E2E 用例。
- 复用 P2-05 的[声明契约](../../05/spec.md#图形转换声明)、[graphics-step.ts](../../../../../src/original-data/conversion/graphics-step.ts) 与 [convert-graphics.ts](../../../../../src/original-data/conversion/convert-graphics.ts)，不另写图像、调色板或颜色逻辑。

## 验收标准

- [ ] AC-06：在合成光盘上，生产贴图表的每个 TEX 经 P2-05 图形步骤得到一个 image 与一个 palette Asset。二者 ID 序号相同，都在 `models` 组，角色分别为 `model-texture` 与 `texture-palette`；image 的显示映射为 `{ nearest: 'palette/flight/models' }`，依赖恰为自身调色板与飞行调色板。
- [ ] AC-06：两个模型共用的 TEX 只有一个 image Asset；内容相同的两个 TEX 条目各有一个 Asset；源码中没有图像、调色板或最近色的第二套实现。
- [ ] AC-07（图形份额与读取）：追加份额以常量导出且与 spec 一致，payload 上界不超过份额；同一 TEX 在一步内只物理读取一次。
- [ ] 生产贴图表的条目、序号与本地探查一致；用到歧义条目的 TEX 映射为 unconfirmed 并带 U-028，其余为 likely 并带 U-028。
- [ ] `pnpm check` 通过（图形用量变化波及作业、管道与 E2E 期望，以完整检查确认）。

## 验证方法

- Node 测试与计量端口；源码搜索确认没有第二套颜色实现。
- 本地探查只记命令、条目数、尺寸统计与歧义判定，不记原版字节或像素；TEX 条目号允许出现在生产常量中（P2-05 先例）。
- 不适用 browser-testing；E2E 期望的同步以 `pnpm test:e2e e2e/import-worker.spec.ts --project=development` 复跑确认。
- 完成前按 execute-goal 流程，以本子任务 diff 为范围做 rubber-duck 审查与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据
