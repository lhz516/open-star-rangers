---
type: plan
status: active
phase: P3
task: "03"
subtask: "17"
updated: 2026-10-09
---

# 17 — 飞行表现数据的转换步骤

**契约来源：** [spec](../spec.md) 的 S-09（场景设置）、S-10、S-11、S-14、AC-07（场景设置）、AC-08（引用与 ID 链）、AC-09（列表与 ID 链）、AC-13、AC-14、AC-18；[来源映射与核验](../spec.md#来源映射与核验)。
**依赖：** 16。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **步骤：** 计划新增的 `runFlightDataStep(source, mappings, declarations, limits, usage)` 在模型阶段运行，产出 models 组的 4 类 data Asset：
  - `data/scene-settings`：RENS 10751 的头部子资源，用 13 的解析器；
  - `data/explosions`：EXIC 10211 与 17 条 EXPL，用 14 的解析器；
  - `data/explosion-animation/<nn>`：按 spec 的编号规则；
  - `data/nebula-backgrounds`：NEBC 10661。

  步骤内读取，每个条目在本步骤内只物理读取一次。
- **ID 链：** 以下任一不一致都为 `subresource-mismatch`：
  - EXIC 的三张列表恰为映射的 17 个 EXPL；
  - 每个 EXPL 的 ANIM 等于对应动画 Asset 所映射的 ANIM；每个 EXPL 的 SND 等于音频表中已交付爆炸音效 Asset 的来源条目，查询 [production-sounds.ts](../../../../../src/original-data/conversion/production-sounds.ts)，只读；
  - 每个动画 Asset 的帧引用恰为 16 的生产声明中该 ANIM 的帧图像；
  - NEBC 的 15 个 ID 恰为 16 的星云图像映射的 BITM 部件，且顺序一致。
- **依赖：**
  - 爆炸表依赖全部动画 Asset 与 `sound/explosion/blast-v1`–`v4`（跨组外部要求）；
  - 动画依赖其帧图像；
  - 星云列表依赖 15 个星云图像。
- **生产表：** 在计划新增的 `production-flight-data.ts` 中定义映射与声明，置信度与 U 项按 Asset 表。份额常量 `PRODUCTION_FLIGHT_DATA_SHARE` 的数值由 19 推导后填入；本项不接入 `import-job.ts`。
- [effect-step.ts](../../../../../src/original-data/conversion/effect-step.ts) 不改，`data/projectile-visuals` 保持只含 RENS 记录。
- 用代码生成的合成 RENS、EXIC、EXPL、ANIM、NEBC 与合成光盘编写测试，覆盖：正向转换与依赖、四条 ID 链的不一致、预算、读取日志，以及 `data/projectile-visuals` 不变。

## 不包含

- 帧图像与星云图像本身：由 16 提供。
- 接入作业、models 组草稿的合并、份额数值与转换器组件：归 19。
- 爆炸选择与背景方向：归 P3-07、P3-12。
- 模块分册：由 22 同步。

## 关键文件与契约

- [effect-step.ts](../../../../../src/original-data/conversion/effect-step.ts)、[model-step.ts](../../../../../src/original-data/conversion/model-step.ts)（只读，作为步骤与分区的先例）。
- 16 的 `production-flight-graphics.ts`；13 的 `rens-header.ts`；14 的 `anim.ts`、`explosion.ts`；09 的 `src/content/flight/`。
- 计划新增：`src/original-data/conversion/flight-data-step.ts`、`production-flight-data.ts`、`flight-data.test-support.ts` 与测试。

## 写入范围

- `src/original-data/conversion/flight-data-step.ts`：步骤、ID 链与转换（新建）。
- `src/original-data/conversion/flight-data-step.test.ts`：测试（新建）。
- `src/original-data/conversion/production-flight-data.ts`：生产映射、声明与份额常量（新建）。
- `src/original-data/conversion/production-flight-data.test.ts`：测试（新建）。
- `src/original-data/conversion/flight-data.test-support.ts`：合成条目与合成光盘（新建）。
- `src/original-data/source-mapping.ts`：在 `SOURCE_ENTRY_TYPES.data` 中加入 ANIM，使 `data/explosion-animation/<nn>` 可映射整个 ANIM 条目（2026-10-09 由协调者扩展）。
- `src/original-data/source-mapping.test.ts`：对应测试（2026-10-09 由协调者扩展）。

## 验收标准

- [x] AC-07（场景设置）：RENS 头部转换为 `data/scene-settings`，`data/projectile-visuals` 不变。
- [x] AC-08（引用）：爆炸表与动画的引用和依赖正确；EXIC→EXPL→ANIM/SND 的不一致为 `subresource-mismatch`。
- [x] AC-09（列表）：NEBC 的 15 个引用按顺序指向星云图像；列表与映射不一致为 `subresource-mismatch`。
- [x] AC-13 与 AC-14：新映射能读取，带子资源的部件只在解析后为 `verified`；预算恰等于上限时通过，超出 1 时报 `budget-exceeded`，用量等于独立计算的值。
- [x] AC-18：只经 `VerifiedSource` 读取；诊断不回显值；测试不读取文件。
- [x] `pnpm exec vitest run src/original-data tools/engineering-boundaries.test.ts` 与 `pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- Node 测试，使用代码生成的合成条目与记录读取的合成光盘端口。不涉及浏览器或原版数据。

## 完成证据

2026-10-09，worker `exec-p3-03-17`，基于协调者提交 51354fa（认领 2500e8f 之后扩大写入范围）。

- **新增接口（交 19；交 22 写入 original-data 分册）：**
  - [flight-data-step.ts](../../../../../src/original-data/conversion/flight-data-step.ts)：`runFlightDataStep(source, mappings, declarations, limits, usage = EMPTY_BUDGET_USAGE)` 返回与 `GraphicsStepResult` 同形的 `FlightDataStepResult`（只有 models 组，按 Asset ID 升序，来源状态不含 locator），可直接交给 `modelsGroupDraft`。`declarations` 为 `FlightDataDeclarations { assets, references }`：`assets` 是 `FlightDataDeclaration`（按角色区分的联合类型，`group` 恒为 models）；`explosion-table` 带 `animations`（按动画编号）与 `sounds`，`explosion-animation` 带 `frames`（按帧序），`nebula-backgrounds` 带 `images`（按 NEBC 顺序，可重复）；`references` 是其他步骤转换的声音、帧与星云图像的来源映射表，只用于取它们的 locator，本步骤不读取这些条目。`readFlightDataDeclarations(value)` 严格读取声明，问题都为 `invalid-declaration`（位置在 `flightData.declarations…` 下，引用表的位置为 `flightData.declarations.references…`）；引用表绑定了其他来源的指纹时为 `fingerprint-mismatch`。`SCENE_SETTINGS_SUBRESOURCE`（`header`）；`NEBULA_LIST_LIMITS`（`entryBytes` 256、`images` 即 `FLIGHT_DATA_LIMITS.nebulaImages` 32）。NEBC 解析器是步骤内的私有函数（`formats/` 不在写入范围，可作为后续简化移入 `formats/`）。
  - [production-flight-data.ts](../../../../../src/original-data/conversion/production-flight-data.ts)：`PRODUCTION_FLIGHT_DATA_MAPPINGS`（20 条，按 Asset ID 排序、无指纹）、`PRODUCTION_FLIGHT_DATA_DECLARATIONS`（引用为 16 的 186 个帧与 15 个星云图像映射，以及音频表中 `sound/explosion/blast-v1`–`v4` 的映射）、`PRODUCTION_EXPLOSION_RECORDS`（按动画编号的 17 个 EXPL，即 textures §7 的列表顺序）、`explosionAnimationId(index)` 与 `PRODUCTION_FLIGHT_DATA_SHARE`（暂为空记录，交 19 推导填入；未接入 `import-job.ts`）。场景设置复用 `production-effects.ts` 的 `PRODUCTION_RENS_ENTRY`。
  - [source-mapping.ts](../../../../../src/original-data/source-mapping.ts)（协调者批准的扩大范围）：`SOURCE_ENTRY_TYPES.data` 加入 `ANIM`，否则映射整个 ANIM 的 `data/explosion-animation/<nn>` 为 `conflict`。交 22：original-data 分册中“P2-07 的 2026-10-08 修订为 image 加入 SNIP、为 data 加入 DIAG”一句补上 P3-03 为 data 加入 ANIM；spec“当前实现与依据”中白名单已覆盖全部来源的说法因此不完整（spec 未改）。
- **映射与 ID（AC-13）：** `data/scene-settings` 为 RENS 10751 的 `header` 子资源（likely，U-027、U-028，证据 executable 的 RENS 头部一节与数据闭包一节）；`data/explosions` 为 EXIC 10211 与 17 个整条目 EXPL（confirmed，hud §3、textures §7）；`data/explosion-animation/01`–`17` 各为整条目 ANIM（confirmed，U-001，textures §6、§7，与 16 的帧图像相同）；`data/nebula-backgrounds` 为 NEBC 10661（confirmed，hud §3、executable 数据闭包一节）。证据锚点已逐个核对存在。生产测试按 textures §6–§7 独立写出的表核对定位、置信度、U 项与证据，`diagnoseSourceMappings` 只报 `source-unverified`；与效果表、16 的飞行图形表合并后没有重复 ID。`verifySourceMappings` 之后只有 RENS 头部仍为 `declared`，步骤成功后全部为 `verified`；头部 +0x19 非零（`unsupported-payload`）或任一链不一致时整步无结果。
- **ID 链（AC-08、AC-09，`subresource-mismatch`，位置为结构路径）：** EXIC 列表含未映射的 EXPL（`#EXIC/lists[l]/ids[i]`）、映射的 EXPL 不在任何列表中或列表为空（`#EXIC/lists`）；动画按其 EXPL 在三张列表中首次出现的顺序与声明的 `animations` 配对，EXPL 的 ANIM 与对应动画 Asset 映射的 ANIM 不同（`#EXPL/animation`，含按另一顺序声明动画的情形）；EXPL 的 SND 不是声明的声音（`#EXPL/sound`），或有声明的声音没有任何记录引用（`#EXIC/lists`，使爆炸表恰依赖全部声明的声音，rubber-duck 采纳）；ANIM 的帧数多于或少于帧图像（`#ANIM/frames`）；NEBC 的 ID 与星云图像的 BITM 在某位置不同、顺序不同、数量不同或为空（`#NEBC/images[i]`、`#NEBC/images`）。表与表之间的静态不一致在任何读取之前为 `invalid-declaration`：帧图像不是该动画 ANIM 的 `frames/<i>`、星云图像或声音不在列表所在封包、两个声音映射同一 SND、动画未被或被多张表引用、表的动画数与 EXPL 部件数不同，以及映射形状不符（场景设置不是 RENS 的 `header`、爆炸表不是整条目 EXIC 加 EXPL、动画不是整条目 ANIM、星云列表不是 NEBC）。
- **转换与依赖（AC-07、AC-08、AC-09）：** 合成小集（条目 ID 30,1xx，首次出现顺序 R2、R1、R3 与 ID 顺序不同，R1、R3 在列表间重复，NEBC 含重复图像）与生产结构的合成光盘上，各 payload 经 `decodeFlightDataPayload` 等于由生成数据独立写出的内容；爆炸表依赖全部动画与记录引用的声音（生产为 17 个动画与 blast-v1–v4，跨组），动画依赖其帧，星云列表依赖 15 个图像，场景设置无依赖；payload 独占缓冲区。场景设置只来自头部：换用其他记录与头部后只按头部变化。`data/projectile-visuals` 不变：同一生产 RENS 换两种头部，效果步骤的 projectile payload 字节相同且等于 `encodeEffectPayload(syntheticProjectileSource())`，飞行数据结果不含该 Asset，`effect-step.ts` 未改。
- **读取日志：** 每个映射的条目在步骤内只物理读取一次（生产：RENS、EXIC、NEBC、17 个 EXPL、17 个 ANIM 各 1 次）；BITM、SND、TEX、TABL 与未映射的 EXIC/ANIM 不被读取；静态声明错误时读取次数为 0。
- **限值（AC-14）：** NEBC 条目上限 256（P3-01/10 条目列表中 NEBC 10661 为 68 字节，2 倍取 2 的幂）：恰 256 字节通过，257 在读取前为 `limit-exceeded`（`payloadEntryBytes`，位置为映射的 `sources.mappings[i]…`，该条目未被读取）；NEBC 32 项通过、33 项为 `payloadItems`（`#NEBC/images`）。RENS 2,048、EXIC 256 恰在上限时通过，RENS 2,049、EXIC 257、EXPL 9、ANIM 131,073 字节在读取前拒绝（沿用 13、14 的限值）。
- **预算（AC-14）：** 计入 `assets`、`dependencyEdges` 与 `payloadBytes`，在分配 payload 之前（`encodeFlightDataPayload` 的 `reserve`）计量；恰等于先前用量加本步骤用量时通过，任一维度少 1 为 `budget-exceeded`，`observed` 含先前用量；用量等于由预期 payload 独立计算的值（生产结构：20 个 Asset、222 条依赖边：21 + 186 + 15）。份额数值由 19 推导。
- **AC-18：** 只经 `VerifiedSource` 与步骤内读取器读取；诊断经 `flightDataFailure` 核对位置属于 `flightData…` 或 archive/映射位置语法，理由为可打印 ASCII 且不含文件、路径、偏移或条目号，不回显合成的标记 ID；合成数据全部由代码生成，测试不读取文件。
- **检查：** `pnpm exec vitest run src/original-data tools/engineering-boundaries.test.ts`（59 个文件 2,089 例，其中新文件 66 例、source-mapping 新增 1 例）、`pnpm typecheck`、`pnpm lint` 通过；`pnpm check` 通过（177 个文件 5,590 例与生产构建）；`pnpm check:original` 为 `passed: true`，`findings` 为空。
- **Rubber-duck：** 两项发现均采纳：(1) 有声明的声音未被任何 EXPL 引用时也报 `subresource-mismatch`，使依赖恰为声明的声音（合成集改为只声明被引用的两个声音，并补测试）；(2) 引用表若已绑定其他来源的指纹，在读取前报 `fingerprint-mismatch`。
- **Simplify：** 采纳：以 `archiveLocator` 代替类型断言；EXPL 部件只保留条目 ID 的集合；首次出现顺序用 `Set`；ID 与 payload 成对保存；测试支持复用 `kindOf`，只供内部使用的辅助改为私有；生产帧 ID 只生成一次。未采纳：用量核对复用 `flightDataDependencies`（会使“独立计算”失去独立性）；`verifySourceMappings` 的串行读取（共用设施）；把 NEBC 解析器移入 `formats/`、声明读取器拆为 `flight-data-declarations.ts`、给 `readSourceMappingTable` 加根路径参数以去掉路径改写（都超出写入范围或批准的扩大目的，留作后续）。
- **文档影响：** 格式事实、U 项、命令与工程约定都未改变；本行不改文档。交 22：original-data 分册新增飞行数据步骤一节（上述接口、四条 ID 链与错误位置、`NEBULA_LIST_LIMITS` 及其推导、读取前的条目限值 RENS 2,048 / EXIC 256 / EXPL 8 / ANIM 131,072 / NEBC 256）、`production-flight-data.ts` 的导出，以及 `SOURCE_ENTRY_TYPES.data` 的 ANIM。交 19：模型阶段在效果步骤之后以 `PRODUCTION_FLIGHT_DATA_MAPPINGS`、`PRODUCTION_FLIGHT_DATA_DECLARATIONS` 运行 `runFlightDataStep`，结果并入 `modelsGroupDraft`；填入 `PRODUCTION_FLIGHT_DATA_SHARE`。STATUS 与阶段索引无需改动。
