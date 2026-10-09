---
type: plan
status: active
phase: P3
task: "03"
subtask: "16"
updated: 2026-10-09
---

# 16 — 补充图像与视角标签的图形转换

**契约来源：** [spec](../spec.md) 的 S-08（视角标签）、S-09（受击闪烁）、S-10（帧图像）、S-11（星云图像）、S-12、AC-06（视角标签转换）、AC-07（两个 TEX）、AC-08（帧图像）、AC-09（星云图像）、AC-13、AC-14、AC-18；[字段处理规则](../spec.md#字段处理规则) 9、[Asset 与角色](../spec.md#asset-与角色)。
**依赖：** 13, 14。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **图形步骤：** 扩展 [graphics-step.ts](../../../../../src/original-data/conversion/graphics-step.ts) 与 [graphics-declarations.ts](../../../../../src/original-data/conversion/graphics-declarations.ts)，新增两种来源：
  - ANIM 帧的 image 来源，子资源为帧序号，可附帧调色板，解码用 14 的解析器；
  - TABL 10399 第 8 项的 data 来源，产出 09 的 `view-labels` payload，解析用 13 的解析器。

  只在解析出子资源后，才把该部件升为 `verified`。现有来源种类的行为不变。
- **生产声明：** 在计划新增的 `production-flight-graphics.ts` 中定义映射与图形声明，透明、行序、调色板绑定与显示方式按 05 的结论；若与 spec 表不同，以研究为准并记入证据：
  - `image/hit-shimmer`、`palette/hit-shimmer`（models）；
  - `image/hud/target-display/background`、`palette/hud/target-display/background`（cockpit-hud-map）；
  - `image/nebula/01`–`15`：绑定 `palette/flight/models`，按 05 的结论直接或最近色显示（models）；
  - `image/explosion/<nn>/<mm>` 与帧调色板（models）：帧调色板若为自带调色板，命名为 `palette/explosion/<nn>`，若使用 DATA 则复用 `palette/flight/models`；编号规则按 spec；
  - `data/hud/view-labels`（cockpit-hud-map）。

  本项不把它们并入 `PRODUCTION_GRAPHICS_*`，由 19 合并。份额计量用注入的限值；份额常量 `PRODUCTION_FLIGHT_GRAPHICS_SHARE` 的数值由 19 推导后填入。
- 用代码生成的合成 SR.NOB 条目（TEX、BITM、ANIM、TABL 10399）编写测试，合成图形条目的构建扩展 [conversion.test-support.ts](../../../../../src/original-data/conversion/conversion.test-support.ts)。测试覆盖：
  - 正向转换与图像绑定；
  - ANIM 帧图像与合成帧逐像素相等；
  - 子资源越界为 `subresource-not-found` 或 spec 规定的 code；
  - 预算计量与读取日志；
  - 现有图形步骤的测试不变地通过。

## 不包含

- 爆炸表、动画与星云列表等 data Asset，以及 NEBC 与 EXIC 的 ID 链：归 17。
- 合并入生产图形声明、份额数值与转换器组件：归 19。
- 模块分册：由 22 同步。

## 关键文件与契约

- [graphics-step.ts](../../../../../src/original-data/conversion/graphics-step.ts)、[graphics-declarations.ts](../../../../../src/original-data/conversion/graphics-declarations.ts)、[convert-graphics.ts](../../../../../src/original-data/conversion/convert-graphics.ts)、[production-graphics.ts](../../../../../src/original-data/conversion/production-graphics.ts)（只读，作为先例）。
- 13 的 `view-labels.ts`；14 的 `anim.ts` 与 `source-graphics.ts`；09 的 `view-labels-payload.ts`。
- 计划新增：`src/original-data/conversion/production-flight-graphics.ts` 与其测试和合成支持。

## 写入范围

- `src/original-data/conversion/graphics-step.ts`：ANIM 帧与视角标签两种来源。
- `src/original-data/conversion/graphics-step.test.ts`：测试。
- `src/original-data/conversion/graphics-declarations.ts`：声明的读取。
- `src/original-data/conversion/graphics-declarations.test.ts`：测试。
- `src/original-data/conversion/convert-graphics.ts`：图形转换中的新来源（不改组件）。
- `src/original-data/conversion/convert-graphics.test.ts`：测试。
- `src/original-data/conversion/conversion.test-support.ts`：合成图形条目。
- `src/original-data/conversion/production-flight-graphics.ts`：生产映射与声明（新建）。
- `src/original-data/conversion/production-flight-graphics.test.ts`：测试（新建）。
- `src/original-data/conversion/production-flight-graphics.test-support.ts`：合成生产条目（新建）。

## 验收标准

- [x] AC-06（视角标签转换）：`data/hud/view-labels` 只含第 8 项，读取器可解码。
- [x] AC-07（两个 TEX）：生成 image 与 palette，显示方式与依赖符合 Asset 表或研究结论。
- [x] AC-08（帧图像）：合成 ANIM 转换后的每帧图像与生成时的帧逐像素相等，调色板绑定正确。
- [x] AC-09（星云图像）：15 个 BITM 图像绑定 `palette/flight/models`。
- [x] AC-13：新映射能读取；带子资源的部件只在解析后为 `verified`。AC-14：预算恰等于上限时通过，超出 1 时报 `budget-exceeded`。
- [x] 现有图形步骤与生产图形的测试不改断言即可通过；AC-18 的诊断与读取边界保持。
- [x] `pnpm exec vitest run src/original-data src/content tools/engineering-boundaries.test.ts` 与 `pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- Node 测试，使用代码生成的合成图形条目与合成光盘。不涉及浏览器或原版数据。

## 完成证据

2026-10-09，worker `exec-p3-03-16`，基于认领提交 65fe393。

- **图形步骤的两种新来源（交 17、19；交 22 写入 original-data 分册）：**
  - [convert-graphics.ts](../../../../../src/original-data/conversion/convert-graphics.ts)：`GraphicsSource` 新增 `anim-frame`（`archive`、整条目读取 `read`、`index`）与 `view-labels`（`archive`、`read`），两者都交给 14、13 的读取器，因为它们需要重定位与条目 ID 才能给出 archive 位置。帧图像先由只核对结构的 `readAnimationFrames` 取宽高并计量（`imagePixels`、`dependencyEdges`、带掩码的 `payloadBytes`），再由 `decodeAnimationFrame` 解码；编码为 `byte-run`，掩码来自透明行段，颜色键为 `invalid-declaration`（`.alpha`）。帧序号越界（含负数、小数、NaN）为 `subresource-not-found`，位置与理由同 `decodeAnimationFrame`（`archive:/MAIN/SR.NOB#ID/frames`，测试逐字段核对两者相同）。视角标签由 `parseViewLabels` 解析，经 `encodeViewLabelsPayload` 在分配之前计量 `payloadBytes`，descriptor 为 data、schema `VIEW_LABELS_SCHEMA_VERSION`、无依赖。`data` Asset 的角色选择来源：角色与来源不符为 `invalid-declaration`（`.messages`）。图像来源的头部与解码改为 `imageHeader`/`decodeImage` 两个 switch，既有来源的行为不变。
  - [graphics-step.ts](../../../../../src/original-data/conversion/graphics-step.ts)：image 的 `frames/<i>` 在 ANIM 条目上为 `anim-frame`（与 SNIP 共用 `FRAME_SUBRESOURCE`）；data 的 `labels/8`（`VIEW_LABELS_FORMAT.subMode`）在 TABL 条目上为 `view-labels`，其他项、前导零、整条目或其他类型都为 `invalid-declaration`。步骤只解析映射表一次，按来源类型的 `ENTRY_LIMITS` 在读取字节之前按目录大小判定：`anim-frame` 的条目为 `ANIM_LIMITS.entryBytes`（131,072），`view-labels` 的条目为 `VIEW_LABEL_LIMITS.entryBytes`（512），超出为 `limit-exceeded`（`payloadEntryBytes`），且该条目不被读取；TABL 图像列表等其他条目不受影响。子资源部件仍只在整步转换成功后才升为 `verified`。
  - [graphics-declarations.ts](../../../../../src/original-data/conversion/graphics-declarations.ts)：导出 `GRAPHICS_DATA_SOURCES`（角色 → 来源类型：`status-messages` → DIAG，`view-labels` → TABL `labels/8`），读取声明与转换共用；`MessagesDeclaration` 改名为 `DataDeclaration`；其他 data 角色为 `invalid-declaration`（`.role`）。
- **生产映射与声明（交 17、19）：** [production-flight-graphics.ts](../../../../../src/original-data/conversion/production-flight-graphics.ts) 导出 `PRODUCTION_FLIGHT_GRAPHICS_DECLARATIONS`（205 条，已与两个飞行调色板一起核对，但不含它们，19 可直接追加到 `PRODUCTION_GRAPHICS_DECLARATIONS`）、`PRODUCTION_FLIGHT_GRAPHICS_MAPPINGS`（按 Asset ID 排序、无指纹）、`PRODUCTION_EXPLOSION_ANIMATIONS`（按编号顺序的 `{ entry, frames }`）、`PRODUCTION_NEBULA_IMAGES`（NEBC 顺序的 BITM 条目）、`explosionFrameImageId(animation, frame)` 与 `nebulaImageId(index)`（下标从 0，ID 两位、从 01）。按协调者决定：
  - `image/hit-shimmer`（models，TEX 11069 整条目）：绑定 `palette/flight/models`、direct，存储值逐值保留；没有 `palette/hit-shimmer`。`likely`，U-027。
  - `image/hud/target-display/background` 与 `palette/hud/target-display/background`（cockpit-hud-map，TEX 11089 与 `palette` 子资源）：自带调色板、最近色目标 `palette/flight/cockpit-hud-map`。`likely`，U-030。
  - `image/nebula/01`–`15`（models，NEBC 顺序的 15 个 BITM）：绑定 `palette/flight/models`、direct、不透明。按 Asset 表为 `likely`，U-018（研究已由代码确认显示方式，置信度保持 Asset 表的值，由 22 随 U-018 的更新处理）。
  - `image/explosion/<nn>/<mm>`（models，ANIM 的 `frames/<i>`）：绑定 `palette/flight/models`、direct，透明行段为掩码；没有 `palette/explosion/<nn>`。动画按其 EXPL 在 EXIC 三张列表中首次出现的顺序编号（textures §7：列表 1 的 7 个、列表 2 的 7 个、列表 3 的 3 个），帧按帧序，共 17 个动画、186 帧（12 × 14 + 6 × 3）。研究（05）由代码确认，故为 `confirmed`，U-001 仍列出。
  - `data/hud/view-labels`（cockpit-hud-map，TABL 10399 的 `labels/8`）：`confirmed`。
  - 证据锚点都指向 textures §3（TEX 11069、TEX 11089、最近色规则）、§4、§6、§7 与 hud §3、TABL 10399 一节，已逐个核对存在。NEBC 10661 的 15 个 BITM 条目 ID 与顺序由本行对 `local/` 中 SR.NOB 的一次只读读取取得（只记 ID，未写入任何文件）；ANIM 编号与帧数来自 textures §6–§7。
  - 未并入 `PRODUCTION_GRAPHICS_*`，未改 `GRAPHICS_CONVERTER_COMPONENT`，未定义 `PRODUCTION_FLIGHT_GRAPHICS_SHARE`（交 19 推导并加入本文件）。
- **合成数据：** [conversion.test-support.ts](../../../../../src/original-data/conversion/conversion.test-support.ts) 新增 `blockEntry`、`animEntry`（用 14 的编码器生成 ANIM 条目）、`viewLabelBlock`（13 个已登记指针与 NUL 结尾的字串）与 `viewLabelTable(label)`（第 8 项为 `label`，其余为不同的合成文字）。[production-flight-graphics.test-support.ts](../../../../../src/original-data/conversion/production-flight-graphics.test-support.ts) 提供生产结构的合成条目 `productionFlightGraphicsEntries(replace)`（不含 DATA，供 19 与 `productionGraphicsEntries` 合并）、`productionFlightGraphicsFiles`、各合成图像与标签，以及独立计算的 `FLIGHT_GRAPHICS_USAGE`。全部由代码生成，不含原版的值或字节。
- **AC-06（视角标签）：** [graphics-step.test.ts](../../../../../src/original-data/conversion/graphics-step.test.ts) 与生产测试中，标签经 `decodeViewLabelsPayload` 解码为恰一项 `{ subMode: 8, text }`，保留 1、0x7F 与 128–255 的字节；第 0–7、9–12 项（含超出文字上限的项）不影响结果，另一合成文字证明数据来自输入；指针未登记为 `invalid-payload`（`…#ID/labels[8]`）。
- **AC-07（两个 TEX）：** 受击闪烁图像的索引与存储值逐值相等、无掩码、依赖只有 `palette/flight/models`；目标显示屏背景依赖 `palette/flight/cockpit-hud-map` 与自带调色板，调色板 payload 为存储的 BGR 逐项反序。
- **AC-08（帧图像）：** 步骤测试的 4 帧（含全透明与不透明索引 0）与生产测试的全部 186 帧，与生成时的帧逐像素、逐掩码位相等，绑定 `palette/flight/models`、direct；截断的帧为 `invalid-payload`（`…/frames[1]/pixels`），编码 2 为 `unsupported-encoding`（`…/frames[1]/record`），帧数少于映射为 `subresource-not-found`。
- **AC-09（星云）：** 15 个 BITM 图像按 NEBC 顺序编号，索引逐值保留，绑定 `palette/flight/models`、direct、无掩码。
- **AC-13：** 新映射经 `readSourceMappingTable` 读取，投影后的定位、置信度、U 项与证据等于测试中按 Asset 表独立写出的预期；`diagnoseSourceMappings` 只报 `source-unverified`；`verifySourceMappings` 之后带子资源（`frames/<i>`、`labels/8`、`palette`）的部件为 `declared`、整条目的为 `verified`，转换成功后全部为 `verified` 且带各自的 U 项，任一子资源失败时整步无结果。与生产图形表合并后，声明与映射都能读取、没有重复 ID。
- **AC-14：** 结构限值：ANIM 131,073 字节与标签 TABL 513 字节在读取前为 `limit-exceeded`（读取计数为 0），恰为 131,072 与 512 时被读取并交给读取器；预算：恰等于用量（含先前步骤的用量）时通过，`assets`、`dependencyEdges`、`paletteEntries`、`imagePixels`、`payloadBytes` 各少 1 时为 `budget-exceeded`，`observed` 含先前用量；转换器计入的用量等于由合成图像与标签独立计算的值；帧在解码前计量（截断帧在像素预算不足时报 `budget-exceeded` 而不是 `invalid-payload`），标签在分配 payload 前计量。
- **读取日志：** 每个条目在步骤内只物理读取一次（17 个 ANIM 各 1 次，尽管映射到 186 个帧 Asset）。
- **AC-18：** 诊断只含 code、结构路径与限值；`graphics…` 位置经 `inGraphicsLocationGrammar` 核对，帧与标签的读取器错误为 archive 位置；结果中没有条目 ID、类型、`frames/`、`labels/` 或 locator。新模块只导入 `content/` 与 `original-data/`。
- **既有测试：** 既有图形步骤、转换、声明与生产图形的测试不改断言通过。
- **检查：** `pnpm exec vitest run src/original-data src/content tools/engineering-boundaries.test.ts`（87 个文件 3,134 例）、`pnpm typecheck`、`pnpm lint` 通过；`pnpm check` 通过（171 个文件 5,373 例与生产构建）；`pnpm check:original` 的 `findings` 为空。`src/original-data/conversion` 由 533 例增至 579 例。变异核对：去掉 ANIM 的目录大小限值或去掉 `byte-run` 的掩码计量后，新测试失败。
- **Rubber-duck：** 一项非阻塞发现：直接调用 `convertGraphics` 时，负数、小数或 NaN 的帧序号会越过越界检查。已采纳：与 `decodeAnimationFrame` 同样判定，并补测试。
- **Simplify：** 采纳：data 角色与来源类型合为 `GRAPHICS_DATA_SOURCES` 一处；映射表只解析一次，条目限值按 `sourceKindOf` 得到的来源类型取 `ENTRY_LIMITS`（不再另行识别 TABL 标签）；以直接判断取代 `ENTRY_READ_TYPES`；图像来源的嵌套三元式改为 `imageHeader`/`decodeImage`；未用的导出接口改为私有；测试复用 `imageDeclaration`，并逐字段核对帧越界错误与 `decodeAnimationFrame` 相同。未采纳：复用 `production-model-textures.ts` 的两位编号、`production-graphics.ts` 的 `mapping()`、`production-graphics.test-support.ts` 的 `entryOf` 与 `view-labels.test.ts` 的合成标签块（都在其他子任务的文件中，未导出，超出写入范围）；按条目缓存 `readAnimationFrames` 并绕过 `decodeAnimationFrame`（每帧多一次小条目的结构核对，开销可忽略，且应使用 14 的公开解码接口）；不再重述两个飞行调色板而改为导入生产声明（合并后会形成循环导入，合并后的有效性由测试核对）。
- **文档影响：** 格式事实、U 项、命令与工程约定都未改变，本行不改文档。交 22：original-data 分册的图形步骤一节加入 `anim-frame`（`frames/<i>`）与 `view-labels`（`labels/8`）两种来源、`GRAPHICS_DATA_SOURCES`、`DataDeclaration`、读取前的条目限值，以及 `production-flight-graphics.ts` 的上述导出；可选：hud §3 记录 NEBC 10661 列表顺序即 `PRODUCTION_NEBULA_IMAGES`（只含条目 ID）。STATUS 与阶段索引无需改动。
