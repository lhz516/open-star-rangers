---
type: plan
status: active
phase: P2
task: "06"
subtask: "04"
updated: 2026-10-06
---

# 04 — 切片贴图与调色板

**契约来源：** [spec](../spec.md) 的 S-05、S-07（图形份额）、S-10（贴图部分）；[生产 Asset 与来源](../spec.md#生产-asset-与来源)的贴图与调色板行、贴图编号、显示与透明；[限值与预算](../spec.md#限值与预算)的图形步骤追加份额；AC-06，AC-07 的图形份额与读取部分。
**依赖：** 02。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **本地探查（被忽略的 `local/research/p2-06/`）：** 在本地基准镜像上确定生产贴图表的初始内容。
  - 用 P2-09 的机型绑定（经产品入口运行逻辑转换，或在同样的 M2ID 与任务输入上调用 `bindCraftTypes`）得到 5 个机型模型的 MODL；
  - 以 02 的 `readModel` 按“模型 ID 升序、列表 0–2、部件顺序”收集首次引用的 TEX，编出序号 `01` 起的初始表；
  - 记录 TEX 数量、尺寸与编码，以及每个 TEX 的像素实际用到的[歧义条目](../../../../original/formats/textures.md#nearest-colour-metric-and-tie-rule-confirmed)。生成 spec 时的探查结果是 15 个 TEX、其中 8 个用到歧义条目，作为本次核对的参照。
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

- [x] AC-06：在合成光盘上，生产贴图表的每个 TEX 经 P2-05 图形步骤得到一个 image 与一个 palette Asset。二者 ID 序号相同，都在 `models` 组，角色分别为 `model-texture` 与 `texture-palette`；image 的显示映射为 `{ nearest: 'palette/flight/models' }`，依赖恰为自身调色板与飞行调色板。
- [x] AC-06：两个模型共用的 TEX 只有一个 image Asset；内容相同的两个 TEX 条目各有一个 Asset；源码中没有图像、调色板或最近色的第二套实现。
- [x] AC-07（图形份额与读取）：追加份额以常量导出且与 spec 一致，payload 上界不超过份额；同一 TEX 在一步内只物理读取一次。
- [x] 生产贴图表的条目、序号与本地探查一致；用到歧义条目的 TEX 映射为 unconfirmed 并带 U-028，其余为 likely 并带 U-028。
- [x] `pnpm check` 通过（图形用量变化波及作业、管道与 E2E 期望，以完整检查确认）。

## 验证方法

- Node 测试与计量端口；源码搜索确认没有第二套颜色实现。
- 本地探查只记命令、条目数、尺寸统计与歧义判定，不记原版字节或像素；TEX 条目号允许出现在生产常量中（P2-05 先例）。
- 不适用 browser-testing；E2E 期望的同步以 `pnpm test:e2e e2e/import-worker.spec.ts --project=development` 复跑确认。
- 完成前按 execute-goal 流程，以本子任务 diff 为范围做 rubber-duck 审查与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据

- **本地探查：** `node local/research/p2-06/texture-table-probe.ts`（被忽略的脚本）经产品入口打开本地 CloneCD 文件组，运行生产逻辑步骤，从机型表得到机型到模型 ID 的绑定，再结合 M2ID 与本地 `SR.NOB`，用 02 的读取函数统计。结果只有条目号、计数与判定：
  - **模型：** 5 个，`model/base-1`（MODL 10611）、`model/enemy-ship-1`（11063）、`model/enemy-ship-2`（10373）、`model/friendly-craft-1`（11399）、`model/player-ship`（10743）；
  - **贴图：** 按“模型 ID 升序、列表 0–2、部件顺序”首次引用的 TEX 共 15 个，全部为 raw、带嵌入调色板（合计 212 项），合计 340,992 像素；
  - **歧义：** 其中 8 个的像素用到 [textures §3](../../../../original/formats/textures.md#nearest-colour-metric-and-tie-rule-confirmed) 的歧义条目，即序号 01、03、06、07、08、10、13、15；
  - **其余计数：** 模型到贴图的依赖边 22 条、模型到样本的依赖边 18 条、MESH 149 个、顶点 3,287 个、三角形 3,460 个。

  以上计数与生成 spec 时的探查一致。
- **实现：** [production-model-textures.ts](../../../../../src/original-data/conversion/production-model-textures.ts) 定义只追加的 `PRODUCTION_MODEL_TEXTURES`，以及 `modelTextureImageId`、`modelTexturePaletteId`、`PRODUCTION_TEXTURE_REFERENCES`（TEX 条目号到 image ID，供模型转换器使用）和 `PRODUCTION_MODEL_TEXTURE_SHARE`。[production-graphics.ts](../../../../../src/original-data/conversion/production-graphics.ts) 为每行追加：
  - 调色板声明（`texture-palette`）与图像声明（`model-texture`，nearest 到 `palette/flight/models`，透明按编码，行序按存储）；
  - 映射：调色板为 TEX 的 `palette` 子资源，confirmed；图像为 TEX 整条目，带 U-028，likely，用到歧义条目的为 unconfirmed；
  - `PRODUCTION_GRAPHICS_SHARE` 改为 P2-05 份额与贴图份额之和。

  图像与调色板的转换全部经 P2-05 的声明契约、`graphics-step` 与 `convert-graphics`，没有新的解码或颜色代码。
- **AC-06：**
  - [production-graphics.test.ts](../../../../../src/original-data/conversion/production-graphics.test.ts) 逐项断言 30 个贴图声明与全部 35 个映射（定位、置信度、U 项、证据）。测试中独立写出的 15 行条目号与歧义判定，与本地探查一致。
  - 在合成生产光盘上运行图形步骤，`models` 分区依次含 15 个 image、飞行调色板与 15 个 palette，序号对应。每个 image 的角色为 `model-texture`，依赖恰为飞行调色板与同序号调色板；payload 的显示映射为 nearest 到 `palette/flight/models`，无掩码。每个 palette 的角色为 `texture-palette`，没有依赖。来源状态中 8 个歧义图像为 `unconfirmed`，其余为 `verified`。
  - [production-model-textures.test.ts](../../../../../src/original-data/conversion/production-model-textures.test.ts) 断言两个模型共用 TEX 10613 时，两者都只依赖同一个 `image/model-texture/01`；全部 TEX 内容相同时仍各得一个 image 与一个 palette Asset，15 个 palette payload 逐字节相同。
  - 源码搜索：`nearestColourMap` 与 `expandImage` 只在 `content/graphics/expand-image.ts`，`decodeImageRecord` 与 `readEmbeddedPalette` 只在 `source-graphics.ts`，没有第二套实现。
- **AC-07（图形份额与读取）：** 贴图份额与 spec 相同：`assets` 40、`dependencyEdges` 64、`paletteEntries` 1,024、`imagePixels` 524,288、`payloadBytes` 655,360；合计份额为 45、64、1,536、`glyphs` 768、524,288、671,744。上界按最坏情形计算为 614,296 字节，不超过 655,360：份额内的 40 个 Asset 都按最长 ID 的图像计头部，掩码为每 8 像素 1 字节再加每行 1 字节（每张图最多 480 行），调色板为全部 1,024 项。用计量端口断言：每个 TEX 条目在一步内只读取一次，image 与它的 palette 子资源共用这次读取；DATA 与 CCKD 也各读取一次。
- **随之变化的期望：** [synthetic-import.test-support.ts](../../../../../src/workers/synthetic-import.test-support.ts) 的 `GRAPHICS_PAYLOAD_BYTES` 加入贴图 payload，新增 `GRAPHICS_CONVERSION_USAGE`，`PRODUCTION_CONVERSION_USAGE` 改为图形用量与音效用量之和。作业、管道与 E2E 用例改用这些常量，各自的断言意图不变：逻辑作业仍断言 3 个逻辑 Asset、8 条边与任务数据，音频作业仍断言 4 个音效 Asset 与采样数，图形 Asset 数与用量来自常量。
- **检查：** `pnpm check` 通过（129 个文件、3,805 项，生产构建成功）；`pnpm test:e2e e2e/import-worker.spec.ts --project=development` 通过（12 项）。
- **rubber-duck：** 没有发现问题。审查确认：表与本地证据一致；声明、映射与 U-028 的处理符合 P2-05 规则；份额与上界的推算成立；读取共用；下游期望没有被削弱；文档总数正确。
- **simplify：** 这次用两个代理，各覆盖两个角度，因为改动面小。采纳：
  - 合成条目先判重再生成内容；
  - `GRAPHICS_CONVERSION_USAGE` 与逻辑作业的期望用量改用 `addBudgets` 组合；
  - 内容相同的用例改用已有的 `textureBlock`，`syntheticTexture` 改为私有；
  - 删除测试支持中多余的注释起始符。

  未采纳：
  - 测试中的贴图 ID 改用生产函数生成：测试有意独立写出命名规则；
  - original-data 的测试改用 workers 的用量常量：会让下层测试依赖上层；
  - 删除重复出现的 15：已批准的表正好 15 行。
- **文档影响：** [源码结构](../../../../engineering/source-structure.md#图形转换)的“生产图形”一节新增贴图表、声明、映射与份额，更新 `PRODUCTION_GRAPHICS_SHARE` 的合计与合成封包说明，目录树新增 `production-model-textures.ts`。本地探查结果只记在本证据中。`docs/original/` 无需改动：本子任务只采用已有的歧义条目清单与结构事实，没有新的原版事实。
