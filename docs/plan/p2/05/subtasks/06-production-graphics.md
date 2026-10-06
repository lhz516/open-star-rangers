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

- [x] 生产声明、映射与 spec 表格逐项一致：ID、kind、角色、组、定位类别、置信度、U 项与证据链接。
- [x] AC-10 份额部分：份额常量等于 spec，payload 字节上界不超过 16,384。
- [x] 生产结构的合成光盘上步骤得到 5 个 Asset，分区与用量正确。
- [x] 本地探查只输出 ID、序号与单元尺寸，脚本与输出都在被忽略的 `local/research/p2-05/`。
- [x] `pnpm exec vitest run src/original-data`、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- Node 测试使用合成光盘；本地探查只读取结构。
- 不适用 browser-testing；转换结果的原版核对见 10。
- 完成前按 execute-goal 流程以本子任务 diff 为范围做 rubber-duck 审查与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据

- **本地结构探查（2026-10-05）：** 被忽略的 `local/research/p2-05/probe-structure.ts` 经内存 IMFAT 解析与 03 的 `readCockpitFonts` 读取本地 `SR.NOB`，只输出 ID、序号与单元尺寸（输出同目录 `probe-structure.txt`）。结果：
  - 唯一 DATA 条目为 11075（768 字节）；
  - CCKD 10097、10101、10103 的字体目录都是 `fonts/0` 8×8、`fonts/1` 8×8、`fonts/2` 4×6。

  因此生产字库取 10103 的 `fonts/0`、`fonts/1`、`fonts/2`。
- **实现：** [production-graphics.ts](../../../../../src/original-data/conversion/production-graphics.ts) 导出：
  - `PRODUCTION_GRAPHICS_DECLARATIONS`：5 个声明，字符映射为空；
  - `PRODUCTION_GRAPHICS_MAPPINGS`：DATA 11075 整条目两次，confirmed、textures §1；CCKD 10103 的 `fonts/0..2`，likely、U-029（4×6 另加 U-030）、cockpit §1 与 hud §1；表的来源指纹为 null；
  - `PRODUCTION_GRAPHICS_SHARE`。

  声明与映射在模块载入时经严格读取，内容错误会立即失败。[production-graphics.test-support.ts](../../../../../src/original-data/conversion/production-graphics.test-support.ts) 按生产映射的定位生成合成 `MAIN/SR.NOB`（DATA 与带 3 个字库的 CCKD，可按类型替换）。`countedVerifiedSource` 移入 [conversion.test-support.ts](../../../../../src/original-data/conversion/conversion.test-support.ts)，供 05–08 共用。
- **测试：** [production-graphics.test.ts](../../../../../src/original-data/conversion/production-graphics.test.ts) 4 项通过：
  - 声明逐项等于 spec 表（ID、kind、角色、组、单元、空映射）；
  - 映射逐项断言定位、置信度、U 项、证据与 `declared`，并与声明一一对应；`diagnoseSourceMappings` 只报 5 个 `source-unverified`，没有类型冲突或未确认；
  - 份额等于 spec；两个最大调色板加三个最高 8、映射 256 条的字库，payload 上界为 9,232 字节，不超过 16,384；
  - 在生产结构的合成光盘上以份额为限值运行 05 的步骤：`models` 1 个、`cockpit-hud-map` 4 个，状态都为 `verified` 且带各自的 U 项，用量为 assets 5、paletteEntries 512、glyphs 768，payloadBytes 等于字节之和，CCKD 与 DATA 各只读取一次。
- **工程：** `pnpm exec vitest run src/original-data tools/engineering-boundaries.test.ts`、`pnpm typecheck`、`pnpm lint` 与 `pnpm check` 通过。
- **Rubber-duck：** 无发现。审阅者核对了锚点存在；份额中的 `sourceReadBytes` 为 0 表示加性份额，07 须保留 P2-02 的读取限值。它还在 Chrome 页面与模块 Worker 中试载过生产结构的测试支持。
- **Simplify：** 采纳份额断言改为字面量、测试支持只导出 `productionGraphicsFiles` 并去掉类型断言、同一条目只建一次。未采纳：
  - 生产模块与测试支持共用声明和映射构造：生产代码不能导入测试支持，提升为公开构造会扩大生产 API；
  - 删除份额中显式的 0：它们逐项对应 spec 批准的份额表。
- **文档影响：** [源码结构](../../../../engineering/source-structure.md#图形转换)补充“生产图形”（Asset、映射位置、份额、字符映射由 12 填入、合成封包），目录树加入 `production-graphics.ts`。原版事实（DATA 与 CCKD 结构）已在 imfat、cockpit 与 hud 中，探查结果与之一致，无需更新；工程约定与工具指南无需更新。

- **执行期修订（2026-10-05，[12](./12-character-map-research.md)）：** 12 填入有证据的字符映射（94、95、56 条），三个字库声明 `glyphRows` 8，映射都带 U-029 与 U-030，证据增加 hud §1.1。4×6 字库因此为 192 个字形：步骤用量的 glyphs 由 768 变为 704（份额仍为 768），payload 上界按 7 字节字体头计算为 9,241 字节。见 [goal 执行记录](../goal.md#执行记录)。以上为修订前的记录。
