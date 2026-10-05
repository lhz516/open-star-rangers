---
type: plan
status: active
phase: P2
task: "05"
subtask: "06"
updated: 2026-10-05
---

# 06 — 生产图形 Asset、映射与预算份额

**契约来源：** [spec](../spec.md) 的 S-10，S-07 的生产份额；[生产 Asset 与来源](../spec.md#生产-asset-与来源)、[限值与预算](../spec.md#限值与预算)；技术决定 3、11；AC-10 的份额常量部分，并为 AC-12、AC-13 准备生产结构。
**依赖：** 05。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **本地结构探查：** 在被忽略的 `local/research/p2-05/` 中运行只读脚本，读取本地 `SR.NOB` 的目录与字体表头部，确定：
  - 唯一 DATA 条目的 ID；
  - CCKD 10103 字体目录中两个 8×8 表与 4×6 表的序号。

  只输出 ID、序号与单元尺寸。这些是结构信息，可以写进生产定位与 subtask 证据，但不写入原版字节。
- **计划新增生产模块（`src/original-data/conversion/`）：**
  - **声明：** 按 spec 表格的 5 个 Asset：
    - `palette/flight/models` 与 `palette/flight/cockpit-hud-map`，角色 `flight-palette`；
    - `font/hud/8x8-1`、`font/hud/8x8-2`、`font/hud/4x6`，角色 `font`，组 `cockpit-hud-map`，`cell` 分别为 8×8、8×8、4×6。

    三个字库的 `charMap` 初始为空，由 [12](./12-character-map-research.md) 按证据填入。
  - **映射：** 两个调色板共用 `MAIN/SR.NOB` 的 DATA 整条目定位，置信度 confirmed，证据为 textures §1。三个字库指向 CCKD 10103 的 `fonts/<i>`，置信度 likely；U 项为 U-029，4×6 另加 U-030；证据为 cockpit §1 与 hud §1。映射表的 `sourceFingerprint` 为 null，由作业在核验时绑定。
  - **份额常量：** `assets` 5、`dependencyEdges` 0、`paletteEntries` 512、`glyphs` 768、`imagePixels` 0、`payloadBytes` 16,384，其余维度为 0；`sourceReadBytes` 不另设。
- **计划新增测试支持（`src/original-data/conversion/` 下的 `*.test-support.ts`）：** 生成按生产结构放置合成内容的 `MAIN/SR.NOB`：在生产 ID 上放合成 DATA（768 字节）与合成 CCKD（字体目录的 3 项在生产序号上，单元与声明一致）。供本子任务与 07、08 使用。
- **测试：**
  - 生产声明与映射通过各自的严格读取；声明与映射一一对应；`diagnoseSourceMappings` 没有类型冲突；
  - 份额常量等于 spec；由 01 的结构上限与头部算出的 5 个 Asset 的 payload 字节上界不超过 16,384；
  - 在生产结构的合成光盘上运行 05 的步骤：得到 5 个 Asset，`models` 1 个、`cockpit-hud-map` 4 个，用量的 `assets`、`paletteEntries`、`glyphs` 分别为 5、512、768。
- **文档：** 在[源码结构](../../../../engineering/source-structure.md)记录生产 Asset、映射位置与份额，以及字符映射由 12 填入。

## 不包含

- 字符映射的内容：归 [12](./12-character-map-research.md)。
- 作业接入：归 [07](./07-worker-integration.md)；本地基准的转换结果核对：归 [10](./10-local-base-check.md)。
- 其他图像 Asset 的选型：归 P2-06/07。

## 关键文件与契约

- **计划新增：** `src/original-data/conversion/` 下的生产声明与映射模块、测试支持与相邻测试（尚不存在）。
- **复用：** 04 的声明读取；05 的步骤；[source-mapping.ts](../../../../../src/original-data/source-mapping.ts) 的 `readSourceMappingTable` 与 `diagnoseSourceMappings`；[budget.ts](../../../../../src/content/budget.ts) 的维度。
- **本地新增：** `local/research/p2-05/` 下的探查脚本与输出（被忽略，不提交）。

## 验收标准

- [ ] 生产声明、映射与 spec 表格逐项一致：ID、kind、角色、组、定位类别、置信度、U 项与证据链接。
- [ ] AC-10 份额部分：份额常量等于 spec，payload 字节上界不超过 16,384。
- [ ] 生产结构的合成光盘上步骤得到 5 个 Asset，分区与用量正确。
- [ ] 本地探查只输出 ID、序号与单元尺寸，脚本与输出都在被忽略的 `local/research/p2-05/`。
- [ ] `pnpm exec vitest run src/original-data`、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- Node 测试使用合成光盘；本地探查只读取结构。
- 不适用 browser-testing；转换结果的原版核对见 10。
- 完成前按 execute-goal 流程以本子任务 diff 为范围做 rubber-duck 审查与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据
