---
type: plan
status: accepted
phase: P2
task: "06"
updated: 2026-10-06
related: [ADR-0007, ADR-0008, ADR-0015, U-009, U-022, U-027, U-028]
reviewed: sha256:78d7582af903
---

# P2-06：切片模型与材质转换 — Spec

## 问题与目标

切片的 `models` 组目前没有任何生产来源：

- **只有研究用解析器：** [payloads.ts](../../../../src/original-data/payloads.ts) 的 `parseMesh` 与 `parseModel` 能读出 MESH 与 MODL，[nob-check](../../../../tools/nob-check.ts) 也在本地基准上逐条核对过。但它们抛出无类型的 `PayloadError`，不检查浮点是否有限、部件颜色是否越界、保留字段是否为 0，也没有结构限值或预算；输出仍是原版结构，没有规范 payload、Asset 身份或对贴图与音效的规范引用。
- **贴图没有选型：** [P2-05](../05/spec.md) 已提供唯一的图像与调色板转换器，但切片模型用到的 TEX 尚未声明。按 P2-05 的规则，用到[歧义条目](../../../original/formats/textures.md#nearest-colour-metric-and-tie-rule-unconfirmed)的贴图映射为未确认，会阻塞组的完整性；本地核对显示切片的 15 个 TEX 中有 8 个用到这样的条目，其中包括玩家座机的贴图。
- **三个表现角色的来源未知：** [P2-01](../01/spec.md#候选选择记录) 的切片定义要求弹丸、导弹与碎片各至少一个 Asset，暂时允许模型或图像两种 kind，等待本任务确认（U-027）。目前没有任何记录说明原版用什么绘制它们。
- **没有 `models` 组：** 导入作业只在作业内保留 P2-05 的图形步骤结果，没有任务装配并发送 `models` 组。

本任务在 P2-05 的图形管线之上完成切片模型与材质：

- 定义规范模型 payload，以及纯读取与消费辅助；
- 加固 MESH、MODL 的源结构读取；
- 经 P2-05 的转换器声明并转换切片贴图与其调色板；
- 增加模型转换阶段，装配并发送 `models` 组；
- 定向研究弹丸、导弹、碎片的原版表现，以及切片贴图用到的歧义颜色条目。

完成后，导入作业在合成光盘上发送经接收方验证的 `models` 组；在本地基准上得到全部切片模型及其贴图，并能逐项说明组是否完整、未完整时被哪项研究阻塞。规范数据保留原版的坐标、绕序、法线、着色槽、UV 与部件结构，供 P2-11 渲染、P2-12 本地对照。

阶段范围依据[总计划 §12](../../master-plan.md#12-开发阶段与验收条件)，任务导航见[阶段索引](../tasks.md#p2-06-切片模型与材质转换)。

## 范围

### 包含

- **S-01 规范模型 payload：** payload schema 1 表达一个模型及其内部几何（P2-01 的 [`model-with-internal-geometry`](../../../../src/content/asset-units.ts) 单位）：
  - 几何表：模型内不同的源网格各一份，含顶点位置、UV、顶点法线、三角形索引、每个角点的着色槽与着色槽数；32 位浮点逐位保留，绕序与索引按存储保留；
  - 三个部件列表，按源序号 0、1、2 保留，每个部件引用一个几何，并含原始标志字、基色与可选的贴图 Asset ID；
  - 五个音效槽，按源槽位保留，每槽为空或一个 sound Asset ID；
  - payload 不赋予列表、标志或音效槽玩法含义，含义以 `docs/original/` 的记录与置信度为准。
- **S-02 纯读取与消费辅助：** 在 `content/` 中提供模型 payload 的严格读取器、与描述符依赖的一致性校验，以及按部件列表取得几何与材质引用的消费辅助。贴图颜色只经 P2-05 的 `expandImage` 展开。模块不导入 Three.js、DOM 或 `original-data`。
- **S-03 源结构加固：** MESH 与 MODL 的读取有唯一实现，校验保留字段、指针与长度、三角形角数、索引范围、浮点有限性与颜色范围；在分配之前检查结构限值；输出不与源块共用缓冲。`payloads.ts` 不再保留 MESH、MODL 解析；nob-check 改用这套读取。
- **S-04 模型转换声明与转换器：** 在 `original-data/` 中定义[模型转换声明](#模型转换声明)，并把 MODL 及其引用的 MESH 转换为模型 payload。部件引用的 TEX 与 SND 只能通过生产贴图表与 P2-08 生产音效表解析为 Asset ID；表中没有的引用是声明错误，不默认、不跳过。
- **S-05 切片贴图与调色板：** 切片模型（全部三个部件列表）引用的每个 TEX，经 P2-05 的转换器、声明契约与图形步骤转换：
  - 生成一个 image Asset，以及其嵌入调色板的一个 palette Asset；
  - 显示映射为最近色，目标是 `palette/flight/models`；
  - 本任务不另写图像、调色板或颜色逻辑。
- **S-06 模型身份与跨组引用：**
  - 机型模型（经 M2ID 绑定到任务机型的 MODL）的 Asset ID 使用 P2-09 的机型绑定（`bindCraftTypes`），本任务不另建机型模型 ID 表，并核对绑定的 MODL 与本任务转换的 MODL 一致；
  - 弹丸、导弹与碎片 Asset 不经机型绑定，按[生产 Asset](#生产-asset-与来源)的角色命名规则命名；
  - 模型到样本的依赖边按 P2-08 的生产音效表建立。研究确认的 Asset 若引用表中没有的 SND，用 P2-08 的转换器向该表追加，不另写音效转换；
  - 贴图与调色板的 ID 按[生产 Asset](#生产-asset-与来源)的规则命名。
- **S-07 结构限值与预算：** 批准本任务的结构限值与生产份额，见[限值与预算](#限值与预算)。读取或分配声明的规模之前，先扣除 P2-01 的预算维度（含 `vertices`、`triangles`）。
- **S-08 错误与诊断隐私：** 转换失败以扩展后的 `SourceError`（`source` 层）报告，payload 读取与消费失败以 `content` 层错误报告，code 与位置见[错误码](#错误码)。本任务的诊断只含规范 Asset ID、结构字段路径与限值，不含原版字节、条目编号、偏移或宿主路径。
- **S-09 模型阶段、`models` 组与 Worker：**
  - 导入作业在已有的转换阶段之后运行模型转换步骤，新增阶段 `convert-models` 并递增协议版本；
  - 用图形步骤的 `models` 分区与模型步骤的结果装配 `models` 组，按合入后的组装机制计算包身份并发送；
  - 接收方用 P2-01 的 `validateGroup` 验证。
- **S-10 生产 Asset：** 切片的 5 个机型模型、它们引用的全部贴图与调色板，以及研究确认的弹丸、导弹与碎片 Asset，见[生产 Asset 与来源](#生产-asset-与来源)。
- **S-11 定向研究：**
  - **弹丸、导弹与碎片（U-027）：** 确定各自在原版中的表现来源与对应的规范 Asset，规则见[研究要求](#研究要求)；
  - **歧义贴图条目（U-028）：** 对切片贴图实际用到的每个歧义条目，确定原版的显示颜色；
  - **部件结构：** 记录切片实际用到的部件列表、标志与音效槽的含义与置信度，以及切片网格的绕序与法线一致性统计。

  结论按置信度写入 [mesh](../../../original/formats/mesh.md)、[textures](../../../original/formats/textures.md) 与 [unknowns](../../../original/unknowns.md)。
- **S-12 验证：** 覆盖三条路线，测试只用代码生成的数据，仓库不新增二进制样本：
  - Node 合成测试；
  - 真实 Chromium 的模块 Worker，处理合成光盘；
  - 本地基准核对，并用加固后的 nob-check 全量核对 MESH 与 MODL。
- **S-14 效果几何数据（2026-10-06 修订）：** 弹丸、导弹与碎片中由原版构建函数生成的几何，来自 RENS 记录与 EXE 内的静态数据（[executable 的效果几何数据](../../../original/formats/executable.md#effect-geometry-data-p2-0614-research)）。本任务：
  - 在 `original-data/` 中新增 LE 可执行文件的只读区域读取，并让来源映射能定位 `MAIN/SRANGERS.EXE` 的区域；
  - 把三类效果的源数据原样转换为三个 `data` Asset，各承担一个效果角色，规则见[效果几何数据](#效果几何数据)；
  - 在 `content/` 中提供这些 payload 的严格读取器，以及按构建函数规则展开为几何的纯函数，供 P2-11 渲染与 P2-12 对照使用。
- **S-13 文档：** 同步[源码结构](../../../engineering/source-structure.md)、[工程约定](../../../engineering/README.md)与[工具指南](../../../guides/tools.md)。payload 字节布局与消费辅助的约定写入源码结构，作为 P2-11 渲染与 P2-12 对照的入口说明。原版事实只写入 `docs/original/`。

### 不包含

- **渲染，归 P2-11：** Three.js 的几何与材质创建、GPU 资源的创建与释放、坐标轴与手性到 Three.js 的换算、背面剔除、纹理过滤，以及资源查看器。本任务只在契约中规定共享语义（见[消费者边界](#消费者边界)）。
- **保真判定，归 P2-12：** 轮廓、朝向、贴图与颜色和原版截图的最终对照。本任务提供规范数据与消费辅助，并做结构等价核对，不以截图对照宣称保真完成。
- **玩法语义，归 P3：** 光照与明暗（U-028 的光照部分）；部件列表 1、2 与标志的玩法用途，如碰撞体、护盾、伤害阶段；弹丸与导弹的飞行、命中和生命周期规则；碎片的运动与持续时间。研究确认的来源只用于选取资源，不改写为玩法规则。
- **其他资源：**
  - 切片以外的 14 个 MODL、其余 MESH 与 TEX；
  - 驾驶舱、HUD 与战略地图（P2-07）；
  - 音效转换的实现与生产音效表的既有内容（P2-08）；本任务只按 S-06 向该表追加研究确认的 Asset 所需的 SND；
  - 任务数据与机型阵营（P2-09）；
  - ANIM 的编码 1 与 EXPL 效果，除非研究证明切片角色依赖它们（见[风险与恢复](#风险与恢复)）。
- **导出与持久化：** glTF、OBJ 或 PNG 等文件导出；IndexedDB 缓存接线（P2-11）。
- **既有契约：** 不修改 P2-01 的 Asset ID 语法、预算维度与完整性规则，也不修改 P2-05 的 payload 布局与声明契约。研究若要求修改切片定义，走 P2-01 的修订流程，见[研究要求](#研究要求)。2026-10-06 修订按此流程，同时修订 P2-01 的切片定义与来源定位，见[效果几何数据](#效果几何数据)。不新增依赖。
- **执行 EXE：** 只读取 EXE 中的静态数据区域，不执行、不模拟其代码（总计划 §8 的导入安全规则）。

### 执行前提与协调

- **先合入 P2-08 与 P2-09：** 两者在未合入的分支上各自把协议递增到 3、各追加一个转换阶段，并各自定义了生产 `ConverterVersion` 与组装、预算组合的方式，二者互不相容。本任务依赖其中三项：
  - P2-09 的机型到模型 ID 绑定；
  - P2-08 的生产音效表；
  - 统一后的协议、身份与组装机制。

  因此本 spec 可先审阅与批准，goal 须在二者都合入 `main` 并完成统一之后，按合入后的实际代码生成。若合入后的机制与本 spec 的描述不符，先修订本 spec。
- **对照合入后的代码：** 本文以“合入后”标注依赖未合入代码的条款，包括协议版本、阶段序列、`ConverterVersion` 的递增规则、组装与预算组合方式。这些条款的具体值以合入后的 `main` 为准，本任务只追加，不另建第二套机制。
- **并行：** P2-07 同样追加阶段并接入组装。多个任务同时进行时，按合入顺序同步阶段集合、持有者与 E2E；不建议多个 agent 同时修改 `src/workers/`、生产映射或本任务的 goal。

### 涉及模块

| 模块 | 责任与影响 |
|---|---|
| `src/content/` 中计划新增的模型 payload 模块 | 模型 payload 的格式常量、编码与严格读取器、描述符一致性、按部件列表的消费辅助；纯 TypeScript，不导入 `original-data` |
| [src/content/graphics/](../../../../src/content/graphics/) | 复用 `expandImage`、`readImagePayload` 与 `readPalettePayload`，不修改其契约 |
| 计划新增的 `src/original-data/conversion/` 模型模块 | MESH 与 MODL 的源结构读取、模型转换声明、转换器、生产贴图表、模型生产声明与映射、模型转换步骤 |
| [production-graphics.ts](../../../../src/original-data/conversion/production-graphics.ts)、[graphics-step.ts](../../../../src/original-data/conversion/graphics-step.ts) | 追加切片贴图与调色板的声明、映射与份额；步骤机制不变 |
| [payloads.ts](../../../../src/original-data/payloads.ts) | 移除 `parseMesh`、`parseModel` 及其类型 |
| [source-error.ts](../../../../src/original-data/source-error.ts)、[contract-validation.ts](../../../../src/content/contract-validation.ts) | 追加本任务的限值名与 content code；已有 code 与限值的含义不变 |
| [import-job.ts](../../../../src/workers/import-job.ts)、[import-protocol.ts](../../../../src/workers/import-protocol.ts)、[import-job-owner.ts](../../../../src/app/import/import-job-owner.ts) | 合入后：追加模型阶段，递增协议版本，装配并发送 `models` 组；持有者按新的阶段集合校验顺序 |
| [nob-check.ts](../../../../tools/nob-check.ts) | 改用加固后的 MESH 与 MODL 读取，只输出计数与失败原因 |
| 相邻 `*.test.ts`、[synthetic.ts](../../../../src/original-data/synthetic.ts)、`src/workers/` 的测试支持、`e2e/import-worker.spec.ts` | 合成网格、模型、贴图与封包，Node 与真实 Worker 用例 |
| `docs/original/`、`docs/engineering/`、`docs/guides/` | 研究事实与置信度、模块与命令说明 |

## 当前实现与依据

- **现有解析器：** [payloads.ts](../../../../src/original-data/payloads.ts) 的 `parseMesh` 校验头部的结构指针与长度、三角形角数为 3、索引与着色槽范围、尾随字节，返回 `Float32Array`/`Uint32Array`；不检查浮点是否有限，也没有数量上限（以块长约束分配）。`parseModel` 读取三个部件列表与五个音效槽，不检查部件保留字段、颜色范围与块长公式。两者都抛出 `PayloadError`。[nob-check](../../../../tools/nob-check.ts) 用它们核对全部 MESH、MODL 以及 MESH、TEX、SND 引用的类型。
- **内容契约（P2-01）：**
  - [asset-id.ts](../../../../src/content/asset-id.ts) 的 kind 含 `model`；[asset-units.ts](../../../../src/content/asset-units.ts) 规定模型单位为 `model-with-internal-geometry`，网格几何是模型的内部元素，不是独立 Asset。
  - [slice-definition.ts](../../../../src/content/slice-definition.ts)：`models` 组拥有 `model`、`image`、`palette`；角色 `player-ship`（1）、`enemy-ship`（1–2）、`base`（1）只允许 `model`，`projectile`、`missile`、`debris`（各至少 1）暂时允许 `model` 或 `image`。
  - [completeness.ts](../../../../src/content/completeness.ts) 的 `validateGroup` 检查角色基数、组内依赖闭包、payload 身份与来源状态。依赖非本组 kind（如 `sound`）时，作为类型化外部要求返回；来源状态不是 `verified` 时组不完整（`source-not-ready`）。
  - [budget.ts](../../../../src/content/budget.ts) 已有 `vertices` 与 `triangles` 维度，以及 `addBudgets`。
- **图形管线（P2-05）：**
  - [图形 payload](../../../engineering/source-structure.md#图形-payload)：`expandImage` 是唯一的调色板查找与最近色实现，最近色规则暂定（U-028）。
  - [转换声明](../05/spec.md#图形转换声明)支持整条目 TEX 图像、`palette` 子资源与 `{ nearest: … }` 显示映射。
  - [生产图形](../../../../src/original-data/conversion/production-graphics.ts)已在 `models` 组产生 `palette/flight/models`。
  - [图形步骤](../../../../src/original-data/conversion/graphics-step.ts)按资源组分区返回描述符、payload 与来源状态，留待 P2-06/07 装配。
  - P2-05 规定：使用 `nearest` 的映射带 U-028、置信度不高于高概率；图像用到歧义条目时映射为未确认（[P2-05 图形转换声明](../05/spec.md#图形转换声明)）。
- **导入 Worker（P2-04/05，`main`）：** [import-protocol.ts](../../../../src/workers/import-protocol.ts) 的协议版本为 2，阶段为 `identify-source`、`convert-graphics`；[import-job.ts](../../../../src/workers/import-job.ts) 运行图形步骤但不发送组；`finished.usage` 为来源用量与图形用量之和。
- **未合入的相邻任务（2026-10-05 两个分支的状态）：**
  - **P2-09：** `src/original-data/conversion/craft-binding.ts` 的 `bindCraftTypes` 把任务引用的机型经 M2ID 解析到 MODL，并命名为 `model/player-ship`、`model/enemy-ship-<n>`、`model/base-<n>`、`model/friendly-craft-<n>`。每个 MODL 条目只有一个 ID，按种类序号升序编号，`logic` 组以这些 ID 为外部要求。P2-09 的 spec 要求 P2-06 用同一绑定命名。它还定义了生产 `ConverterVersion`（`osr-converter.1`，任一转换器输出变化时递增）与包身份的计算。
  - **P2-08：** 生产音效表是 SND 条目与 sound Asset ID 之间唯一的绑定，覆盖 5 个模型经 MODL 音效槽可达的全部样本。它的 spec 要求“模型到样本的依赖边由 P2-06 依据本任务的生产表建立，不自行命名 sound ID”；P2-06 确认的弹丸、导弹或碎片若引用额外 SND，用 P2-08 的转换器与生产表追加。它在未合入分支上把 MODL 音效槽 1、2、4 的含义记为开火、导弹发射与被摧毁，槽 0、3 未确认。它还用另一种格式定义了 `ConverterVersion`。

  两者合入时须统一，见[执行前提与协调](#执行前提与协调)。
- **原版事实：**
  - MESH 与 MODL 的结构、part 字段、UV 平铺、部件列表的已知线索（列表 0 渲染出可辨认的完整模型，列表 1 高概率为残骸碎片，列表 2 为单色凸包、用途未确认）与模型对照见 [mesh](../../../original/formats/mesh.md)。MESH 是 32 位浮点、只有三角形、顶点在模型空间，量级与米一致；“米”是推断，不是已确认事实。
  - 已确认：MODL 处理函数会读取全部三个部件列表的 MESH 与 TEX 字段以及五个 SND 字段；效果回调 `0x3e590` 读取列表 1。见 [mesh 次级表现路径](../../../original/formats/mesh.md#secondary-presentation-model-reuse-bounded)与 [executable](../../../original/formats/executable.md#model-completion-and-cached-handle-follow-up)。
  - 机型到 MODL 的对应来自 M2ID（[hud §3](../../../original/formats/hud.md#3-id-lists-confirmed-structure)）；选定任务引用的 M2ID 槽位、MODL/MESH/TEX/SND 计数见[候选来源概况](../../../original/formats/scenario.md#campaign-candidate-source-profiles-confirmed-structure)；基地交互种类见 [executable](../../../original/formats/executable.md#bounded-slot-1-interaction-kind-evidence)。
  - 最近色的度量与并列规则未确认，歧义条目清单与 EXE 有界检索的否定结果见 [textures §3](../../../original/formats/textures.md#nearest-colour-metric-and-tie-rule-unconfirmed)与 [executable](../../../original/formats/executable.md#native-tex-preparation-and-nearest-colour-search)。
  - 相关未知项：[U-027、U-028、U-009、U-022](../../../original/unknowns.md#数据与格式)。
- **生成本 spec 时的本地结构探查（2026-10-05，只记计数）：** 脚本在被忽略的 `local/research/p2-06/`。
  - 切片 5 个 MODL 共 149 个 MESH，三个列表合计 3,287 个顶点、3,460 个三角形；引用 15 个 TEX，全部为 raw、带嵌入调色板，其中 8 个用到歧义条目。
  - 全部 486 个 MESH 中：顶点数 3–284，三角形数 1–494，着色槽数不超过角点数，浮点全部有限；19 个 MODL 的部件合计最多 66 个（列表 0 最多 57，列表 1 最多 8，列表 2 最多 1），颜色分量最大 252，标志值为 1、2、3。
  - 有 1 个 MESH 没有被任何 MODL 引用；有 1 个 MODL 不在 M2ID 中，且只有列表 1。
  - 三角形绕序与顶点法线：336 个网格全部同向，150 个网格混合，没有全部反向的网格。

  这些是本 spec 的规划依据，不是研究结论；执行时由 S-11 与 AC-12 至 AC-15 正式核对并入档。

## 行为与边界

| 场景或状态转换 | 预期结果 | 拒绝或失败时的反馈 |
|---|---|---|
| 合法 MODL 及其引用的 MESH | 得到模型 payload：三个部件列表按源序号与源顺序保留；同一模型内多个部件引用同一 MESH 时，几何只存一份；浮点逐位保留，三角形索引与绕序不变 | 不适用 |
| MESH 头部的结构指针不为 12、结构长度不等于块长 − 12、保留字或尾字不为 0，三角形角数不为 3，顶点或着色槽索引越界，着色槽数大于角点数，截断或有尾随字节 | 拒绝，不输出部分模型 | `invalid-payload` |
| 位置、UV 或法线出现 NaN 或无穷 | 拒绝 | `invalid-payload` |
| 顶点数、三角形数或部件数超出结构限值（含 0） | 只读取计数字段即拒绝，不分配声明的规模 | `limit-exceeded`，带限值名与 `observed` |
| MODL 的列表指针或计数越出块、块长不等于 44 + 28 × 部件总数、部件保留字段不为 0、颜色分量大于 255 | 拒绝 | `invalid-payload` |
| 部件引用的 MESH 条目不存在或不是 MESH | 拒绝，不输出部分模型 | 保留 P2-03 的 code（如 `entry-not-found`、`entry-type-mismatch`），位置改写为 `models[<Asset ID>].parts[<l>][<p>].mesh` |
| 部件的 TEX 不在生产贴图表中，或音效槽的 SND 不在生产音效表中 | 不跳过、不默认 | `invalid-declaration` |
| 两个模型引用同一 MESH | 各自的 payload 都含该几何；模型之间不共享几何 | 不适用 |
| 两个模型引用同一 TEX | 只有一个 image Asset，两个模型都依赖它 | 不适用 |
| 不同 TEX 条目内容完全相同（如 textures 记录的精确来源别名） | 每个被引用的 TEX 条目各一个 Asset，不按内容合并 | 不适用 |
| 消费者按部件列表取几何与材质 | 无贴图的部件给出基色；有贴图的给出 image Asset ID，UV 在两个方向都按重复（平铺）寻址；不剔除、不重排三角形 | 列表序号不是 0–2：`invalid-model-payload`；提供的图像与引用不符：`binding-mismatch` |
| 消费者读取 payload | 严格读取；引用的贴图与 sound ID 去重后升序，恰等于描述符依赖 | 长度、字段或范围不符：`invalid-model-payload`；schema 不是 1：`unsupported-payload-schema`；引用不一致：`binding-mismatch` |
| 同一输入与声明再次转换 | 逐字节相同，SHA-256 相同 | 不适用 |
| 模型阶段中任一 Asset 转换失败 | 作业以 `failed` 结束，已转换的结果全部丢弃，不发送 `models` 组 | `source` 层 DTO，位置为 `models[<Asset ID>]…`、`models.declarations[<i>]…` 或 `models.declarations` |
| 模型阶段中读取失败（坏扇区、预算、条目缺失等） | 作业以 `failed` 结束 | 映射核验保持 P2-03 的位置；光盘层保持 P2-02 的 `disc` 层与位置 |
| 模型阶段中取消 | 持有者同步变为 `cancelled` 并终止 Worker，之后的消息不改变状态 | 不适用（沿用 P2-04） |
| 前序阶段之前出现 `convert-models` 进度、跳过中间阶段，或之后又出现前序阶段的进度 | 作业失败 | `protocol-error@message.stage` |
| `models` 组发送后，接收方验证 | `validateGroup` 的结果由组内容推导：角色、依赖、payload 身份与来源状态都满足时为 `group-complete`，`sound` 依赖作为外部要求返回 | 不完整时为 `incomplete`，诊断给出角色、Asset 或来源状态；不以部分组冒充完整 |
| 必需角色的来源仍为未确认（如用到未解决歧义条目的贴图、未确认的弹丸来源） | 照常转换并发送；来源状态为 `unconfirmed`，组不完整 | `source-not-ready`，带相应 U 项 |

## 数据模型与契约

### 模型 payload 契约

schema 版本为 1，由计划新增的 `content/` 模块定义。编码为小端定长头部加数据，总长恰为两者之和；Asset ID 以 ASCII 存储。具体字节布局由实现确定，写入[源码结构指南](../../../engineering/source-structure.md)。改变布局或解释属于不兼容变化，须递增 schema。

| 数据/字段 | 类型、单位与约束 | 权威所有者 | 输入/输出或序列化边界 |
|---|---|---|---|
| `geometries` | 1 个以上，不超过部件总数。每个几何含：<br>- 顶点数 1–`meshVertices`；位置 `f32 × 3`、UV `f32 × 2`、法线 `f32 × 3`，按顶点排列，全部有限，逐位保留；<br>- 三角形数 1–`meshTriangles`；每个三角形三个顶点索引，都小于顶点数，绕序按存储；<br>- 着色槽数 1 至 3 × 三角形数；每个角点一个着色槽，都小于着色槽数 | `content/` | 坐标是原版模型空间的数值，不换算单位、不改轴向或手性；轴向、手性、正面绕序与 UV 原点的含义见[消费者边界](#消费者边界) |
| `partLists` | 恰为 3 个，序号 0、1、2 与源列表一一对应，每个 0 个以上，部件总数 1–`modelParts`。部件含：<br>- `sourceFlags`：u32，原样保留，含义未确认；<br>- `colour`：(R, G, B)，各 0–255；<br>- `geometry`：几何表索引；<br>- `texture`：null 或 image Asset ID | `content/` | 部件顺序按存储；列表与标志的含义只在 `docs/original/` 记录 |
| `soundSlots` | 恰为 5 个，按源槽位 0–4，每个为 null 或 sound Asset ID | `content/` | 槽位含义只在 `docs/original/` 记录，payload 不命名槽位 |
| 依赖一致性 | 全部非空 `texture` 与 `soundSlots` 的 ID 去重后按升序，恰等于描述符依赖；`texture` 必须是 `image` kind，音效槽必须是 `sound` kind | `content/` | 模型不直接依赖调色板，贴图的调色板是贴图自己的依赖 |
| 消费结果 | 每个部件一项：几何的位置、UV、法线、索引与角点着色槽，以及材质：`{ colour }` 或 `{ colour, texture: image Asset ID, wrap: 'repeat' }` | `content/` 中的纯函数 | 数组为调用者独占的副本或不可写的视图；不含 Three.js 或 GPU 对象；纹理像素经 `expandImage` 取得 |

### 消费者边界

- **坐标与朝向：** payload 保留原版数值。轴向、手性、正面绕序与 UV 原点（v = 0 对应贴图的第一行还是最后一行）在本任务中只做结构统计，不作解释。P2-11 选择换算并在源码结构中记录；P2-12 用原版截图判定。消费辅助不剔除、不重排三角形，也不翻转 UV。
- **光照：** 法线与着色槽原样提供，原版光照算法归 P3（U-028）。查看器的中性光照不得称为原版效果。
- **贴图：** 贴图是独立的 image Asset，可被多个模型共用。渲染适配按 image Asset ID 共享一个 GPU 纹理，并在最后一个引用模型释放后释放；几何属于各自的模型，不跨模型共享。具体实现归 P2-11。
- **P2-12 对照入口：** 本地对照与渲染都从同一组入口取数据：模型 payload 读取器、消费辅助，以及 P2-05 的 `expandImage`。不另建研究用的第二条解码路径。

### 模型转换声明

模型转换声明是 `original-data/` 中的纯数据，由读取器严格校验，与来源映射一一对应，但不含定位。

| 字段 | 约束 | 说明 |
|---|---|---|
| `asset` | `{ id, kind: 'model' }`，同一步骤内 ID 唯一 | 必须在同一份来源映射表中有映射 |
| `role`、`group` | P2-01 的角色 token；组为 `models` | 机型模型的角色为 `player-ship`、`enemy-ship`、`base`；不属于必需角色的模型（如友方机型）用 `friendly-craft`；研究确认的模型用 `projectile`、`missile` 或 `debris` |
| 来源 | 不可声明：模型映射的定位是一个 MODL 整条目，部件引用的 MESH 由 MODL 字段得到，按 MESH 类型在同一封包中读取 | 避免声明与来源不一致 |
| 贴图与音效的解析 | 不可逐个声明：TEX 只经生产贴图表解析，SND 只经 P2-08 生产音效表解析 | 两张表是唯一的绑定 |

模型映射的置信度与 U 项随映射记录：机型与 MODL 的对应以 P2-09 绑定的证据为准，研究确认的模型以 AC-13 的证据为准，部件结构带 U-027。贴图映射遵循 P2-05 的规则：带 U-028，置信度不高于高概率；用到歧义条目时为未确认，只有满足 AC-14 证据门槛的条目才解除。

### 生产 Asset 与来源

| Asset | kind / role / group | 来源（`MAIN/SR.NOB`） | 置信度与 U 项 |
|---|---|---|---|
| P2-09 绑定的 5 个机型模型：`model/player-ship`、`model/enemy-ship-1`、`model/enemy-ship-2`、`model/base-1`、`model/friendly-craft-1` | `model` / 依次为 `player-ship`、`enemy-ship`、`enemy-ship`、`base`、`friendly-craft` / `models` | 绑定给出的 MODL 整条目；选定任务引用的 M2ID 槽位见[候选来源概况](../../../original/formats/scenario.md#campaign-candidate-source-profiles-confirmed-structure) | 按 P2-09 绑定的证据与 [mesh §3](../../../original/formats/mesh.md#3-comparison-with-the-original-partial) 的对照记录；部件结构带 U-027 |
| 切片贴图：`image/model-texture/<nn>` | `image` / `model-texture` / `models` | 生产模型（5 个机型模型与研究确认的模型）全部三个部件列表引用的每个 TEX 整条目 | 带 U-028；高概率，用到未解决歧义条目的为未确认 |
| 贴图调色板：`palette/model-texture/<nn>` | `palette` / `texture-palette` / `models` | 同一 TEX 的 `palette` 子资源 | 已确认（嵌入调色板按 BGR 读取，textures §3） |
| 弹丸、导弹与碎片：`<kind>/<角色>`，同一角色有多个 Asset 时为 `<kind>/<角色>-<n>` | `model` 或 `image` / `projectile`、`missile` 或 `debris` / `models` | 按 AC-13 的结论；本 spec 直接支持的来源形式见下 | 至少高概率，否则相应验收为 blocked |
| 碎片模型（P2-06/11 研究确认）：`model/debris` | `model` / `debris` / `models` | MODL 10383 整条目：飞行效果初始化按 ID 载入，碎片效果绘制它第 1 列表的部件，见 [executable 的效果表现来源](../../../original/formats/executable.md#effect-presentation-sources) | 高概率；带 U-027、U-028 |
| 导弹图像（P2-06/11 研究确认）：`image/missile` 与调色板 `palette/missile` | `image` / `missile` / `models`；`palette` / `texture-palette` / `models` | TEX 10377 整条目及其 `palette` 子资源：导弹视觉初始化按 ID 载入，作为导弹元素的贴图 | 图像带 U-027、U-028，用到歧义条目，在 AC-14 解除之前为未确认；调色板已确认 |
| 效果几何数据（2026-10-06 修订）：`data/projectile-visuals`、`data/missile-visuals`、`data/debris-visuals` | `data` / 依次为 `projectile`、`missile`、`debris` / `models` | executable 记录的 RENS 条目与 EXE 区域，见[效果几何数据](#效果几何数据) | 高概率；带 U-027 |

- **贴图编号：** `<nn>` 是两位序号，与同一 TEX 的 image 与 palette 共用。编号来自 `original-data` 中显式的生产贴图表：执行时按“模型 ID 升序、列表 0–2、部件顺序”的首次引用顺序编出初始表，之后只追加，不重排。ID 不表达源条目编号或语义猜测。研究确认的模型引用的新 TEX 追加在表尾（碎片模型的贴图为第 16 行）。
- **效果图像的调色板：** 研究确认的整条目图像绑定同一 TEX 的嵌入调色板，ID 为 `palette/<角色>`，角色为 `texture-palette`；显示、透明与行序同切片贴图。
- **显示与透明：** 贴图的显示映射为 `{ nearest: 'palette/flight/models' }`；透明按编码（raw 为全不透明）；行序按存储。若研究或对照证明需要别的选择，按 P2-05 的声明契约修订并附证据。
- **音效依赖：** 每个模型对其非零音效槽的 sound Asset 有依赖边，ID 取自 P2-08 生产音效表。按[候选来源概况](../../../original/formats/scenario.md#campaign-candidate-source-profiles-confirmed-structure)，5 个模型共有 18 个非零音效引用。
- **共用来源：** 同一 MODL 只有一个模型 Asset；同一 TEX 只有一个 image Asset。
- **研究确认的 Asset 的来源形式：** 本 spec 只直接支持两种：
  - 整条目 MODL：经本任务的模型转换器；
  - P2-05 已支持的整条目图像记录：经 P2-05 的图像转换器与声明契约。

  `<角色>` 取 `projectile`、`missile` 或 `debris`；同一角色有多个 Asset 时，`<n>` 按研究记录的列举顺序从 1 编号。其他来源形式须先修订本 spec，批准其规范表示、默认字段与命名后才能实现，例如没有 MODL 的独立 MESH、容器内的子资源、ANIM、EXPL。批准前 AC-13 为 blocked。
- **研究确认的 Asset 的音效：** 引用的 SND 若不在 P2-08 生产音效表中，按 P2-08 的命名规则追加到该表并由其转换器转换。相应的 `audio` 组输出、包身份与音效份额随之变化，超出 P2-08 已批准的份额时，先修订 P2-08 spec。

### 效果几何数据

2026-10-06 修订，须经用户批准后实施（见[审批](#审批)）。原版事实只记在 [executable 的效果几何数据](../../../original/formats/executable.md#effect-geometry-data-p2-0614-research)，本节只规定契约。三个 `data` Asset 覆盖三类效果中**由构建函数生成的部分**；导弹与碎片的完整表现还依赖已有的 `image/missile`、`model/debris` 与被毁模型自身的列表 1。角色完整性由这些 Asset 共同满足，不表示任一 `data` Asset 单独重现整个效果。

**来源。** 只读取以下两类来源：

- `MAIN/SR.NOB` 中 executable 记录的 RENS 整条目，只转换其中的弹丸记录表；
- `MAIN/SRANGERS.EXE` 中 executable 记录的模板、类型表、常量与立即数操作数区域，只读字节，不执行、不模拟代码（总计划 §8）。

**区域 locator（P2-01 修订）：** `OriginalAssetLocator` 变为判别形式，`entry` 为 null 时表示可执行文件区域：

- **适用范围：** `discPath` 只能是 `MAIN/SRANGERS.EXE`，其他文件报 `invalid-source-mapping`。只有 `data` kind 的 Asset 接受区域 locator，其他 kind 报 `invalid-source-mapping`；`data` 同时接受 RENS 条目 locator。
- **语法：** `subresource` 为 `le/<对象序号>/<偏移>/<字节数>`：
  - 对象序号为 LE 对象表的十进制序号，1–8；
  - 偏移为对象起点起的小写十六进制，形如 `0x1a0`，没有多余前导零；
  - 字节数为十进制，1–65,536。

  不规范的写法报 `invalid-source-mapping`。
- **排序与去重：** 一个映射内，条目 locator 排在区域 locator 之前；区域按对象序号、偏移、字节数的数值升序排列；同一区域重复报 `duplicate-mapping`。区域部件只允许一个备选，多个备选报 `invalid-source-mapping`。
- **映射核验（P2-03 S-08 扩展）：** 区域 locator 只核对文件在已验证白名单中，不读取字节；失败时 `path-not-covered` 按 P2-03 的规则改写到 `sources.mappings[i].parts[j].alternatives[k]`。含区域 locator 的映射保持 `declared`。效果步骤读取并校验全部区域与记录之后，与 P2-05 图形步骤一样把这些映射标为 `verified`，再由置信度给出来源状态。

**EXE 区域读取（`original-data/formats/`）：**

- 经产品入口 `openFile` 读取，按 P2-02 的读取预算计入 `sourceReadBytes`；
- 先校验 MZ 头中的 LE 偏移、LE 签名、字节序与字序、页大小、对象表、页映射与修正页表，都须在文件长度内；
- 再按对象序号、偏移与字节数取出区域，输出不与源缓冲共用；
- 区域越出对象、跨入不由文件页支持的部分，或与 LE 修正记录的目标位置重叠时，报 `invalid-payload`；
- 对象数、页数与区域长度超出限值时报 `limit-exceeded`，只读计数即拒绝。

**规范表示。** 三个 Asset 都是 `data` kind，在 `models` 组，payload schema 1。字节布局在实施时写入源码结构，须满足以下语义：

- 浮点字段按源的 32 位或 64 位原样、逐位保留；整数按源宽度保留；
- 记录、模板与常量按源顺序排列，记录序号即原版的选择索引；
- 构建函数的标记与常量都作为字段保存，源码与测试不写入原版值；
- payload 不含 locator、条目编号或对象偏移。

| Asset | 字段 | 依赖 |
|---|---|---|
| `data/projectile-visuals`（角色 `projectile`） | 两套模板，各含 4 个顶点（f32 × 3）、面表与长度常量（f64）；单位标记与尾部标记（f32）；弹丸记录（1–64 条），每条为构建选择（u32）、宽度、长度（f32）与 RGB（f32 × 3） | 无 |
| `data/missile-visuals`（角色 `missile`） | 导弹类型（1–32 个），每个含部件数（u32，1–4）、机身（r0、r1、长度 f32；段数 i32，3–64；打包颜色 u32，不超过 24 位）、尾翼参数（每片 f32 × 4 与打包颜色）、元素参数（f32 × 3）与标志（f32）；尾翼、元素（两套）与附加元素的面表模板；机身与元素的角度常量、附加元素的偏移与角度常量（f64）；机身与尾翼的颜色缩放（f64）；元素与附加元素的颜色与模式；32 个贴图映射旋转的参数 | `image/missile` |
| `data/debris-visuals`（角色 `debris`） | 两个模板，各含 6 个顶点（f32 × 3）、18 个字的每顶点表与面表；无贴图形状的 3 个缩放、有贴图形状的 2 个缩放（f32）；各自的颜色与模式；有贴图形状的平面映射参数 | `image/model-texture/16` |

**展开函数（`content/`）：** 纯函数按 executable 记录的构建规则展开每条弹丸记录、每个导弹类型与每种碎片形状。

- **输出：** 每个形状的顶点位置、面表（每个面的角数与顶点序号，按源顺序）、颜色、模式字，以及可选的贴图 Asset ID 与原样的映射参数。
- **计算：** 按 64 位浮点计算，结果分量舍入为 32 位；与原版 x87 运算的末位差异不视为错误。
- **不做的事：**
  - 不生成法线或明暗；碎片模板的每顶点表原样交出，含义未确认。
  - 不计算贴图坐标：映射函数 `0x82ae8` 的语义未追踪（U-027），由 P2-11 渲染之前另行研究。在此之前，消费者只能使用颜色与几何。
- **依赖：** 不导入 `original-data`、Three.js 或 DOM。

**测试数据。** 测试只用代码生成的任意模板、常量与记录。期望值在测试中按本节与 executable 的规则写成计算式。仓库中不得出现原版的模板、常量、类型表或展开结果，也不得出现由它们得到的快照。

**步骤、预算与组：**

- 效果步骤在 `convert-models` 阶段内、模型步骤之后运行，在模型步骤用量之上按 `PRODUCTION_MODEL_SHARE` 扣除。不新增阶段，协议版本不变。
- **扣除：** 每个 Asset 的 `assets`、`dependencyEdges` 与 payload 字节。另按展开后的规模扣除 `vertices` 与 `triangles`：每个面计角数 − 2 个三角形，因为消费者按此分配。所有扣除都在分配之前完成。
- **份额：** 按结构限值与生产区域的固定长度计算，三个 payload 合计不超过 16 KiB（上界以常量与测试断言，AC-20）。展开规模的上界为：
  - 弹丸 64 × 4 个顶点；
  - 导弹 32 × (2 × 64 + 3 × 9 + 6 + 3) 个顶点；
  - 碎片 5 × 6 个顶点；
  - 合计 5,534 个顶点。

  这超出模型步骤用后剩余的份额，因此极端输入由 `budget-exceeded` 拒绝。本地基准的实际用量须在份额之内（AC-21）。份额常量不变。
- 结果并入 `models` 组。

**结构限值：** `effectRecords`（1–64）、`missileTypes`（1–32）、`ringSegments`（3–64）、`executableObjects`（1–8）、`executablePages`（1–1,024）、`executableRegion`（1–65,536 字节）。

**格式规则**，违反时报 `invalid-payload`：

- 部件数为 1–4；
- 打包颜色不超过 24 位；
- 面表中每个面的角数为 3 或 4，顶点序号小于顶点数，以 0 结束，且恰好用尽该模板的区域；
- 浮点有限。

**完整性：** 切片定义修订（P2-01）之后，三个效果角色都允许 `data`。`role-cardinality@roles.projectile` 因此消失；`models` 组是否完整仍取决于 AC-14。

### 步骤结果与 `models` 组

- 模型转换步骤返回冻结的纯数据，形状与 P2-05 的[图形步骤结果](../05/spec.md#步骤结果)相同：
  - 按资源组分区的描述符、payload 与不带定位的来源状态；
  - 本步骤的转换用量，其中 `sourceReadBytes` 恒为 0。
- 每个 Asset 的 `assets`、`dependencyEdges` 与 `payloadBytes` 只在产生它的步骤中扣除一次。
- **`models` 组：** 由图形步骤的 `models` 分区与模型步骤的结果合并而成，按合入后的组装机制附上清单身份并发送。合并时不重新转换。
- 组内 Asset ID 唯一；描述符、payload 与来源状态按 ID 升序一一对应。
- 结果不含定位、条目编号、原版字节或解析中间结构。

### 限值与预算

**结构限值**对每次源结构读取与转换都生效，超出时报 `source` 层的 `limit-exceeded`；payload 读取器对同样的范围报 `content` 层的 `invalid-model-payload`（见[错误码](#错误码)）：

| 限值名 | 范围 | 类别与依据 |
|---|---|---|
| `meshVertices` | 1–4,096 | 安全上限：计数字段为 u32；全部 486 个 MESH 观察到 3–284 |
| `meshTriangles` | 1–4,096 | 安全上限：全部 MESH 观察到 1–494 |
| `modelParts` | 1–256（三个列表合计） | 安全上限：全部 MODL 观察到合计最多 66 |

效果几何数据（2026-10-06 修订）的结构限值与预算见[效果几何数据](#效果几何数据)。

**格式规则**以 `invalid-payload` 拒绝，不设限值名：

- 三角形角数恰为 3（mesh §1，已确认）；
- 着色槽数不超过角点数（3 × 三角形数）：全部 MESH 都满足（mesh §1 与本地探查）；
- 部件颜色分量为 0–255（mesh §2；全部观察值不超过 252）；
- 音效槽恰为 5 个（mesh §2，已确认）。

**生产份额**以常量导出，按本地探查的观察值留出余量，覆盖研究可能追加的弹丸、导弹与碎片 Asset。研究结论超出份额时，修订本 spec：

| 步骤 | 维度 | 份额 | 依据 |
|---|---|---|---|
| 图形步骤追加（切片贴图与效果图像） | `assets` | 40 | 16 个贴图与 1 个效果图像，各一个 image 与一个 palette，共 34 |
| | `dependencyEdges` | 64 | 每个 image 依赖自己的调色板与飞行调色板，共 34 |
| | `paletteEntries` | 1,024 | 17 个嵌入调色板，每个至多 16 项，合计 244 |
| | `imagePixels` | 524,288 | 17 个 TEX 合计 410,624 |
| | `payloadBytes` | 655,360 | 按以上份额与 payload 头部计算的上界不超过它 |
| 模型步骤 | `assets` | 16 | 5 个机型模型与 1 个碎片模型 |
| | `dependencyEdges` | 96 | 23 条模型到贴图、18 条模型到样本，共 41 |
| | `vertices` | 8,192 | 6 个模型三个列表合计 3,547（机型模型 3,287） |
| | `triangles` | 8,192 | 合计 3,700（机型模型 3,460） |
| | `payloadBytes` | 1,048,576 | 按以上份额与 payload 头部计算的上界不超过它 |
| 两个步骤 | `sourceReadBytes` | 不另设 | 沿用 P2-02 的默认读取上限 |
| 两个步骤 | 其余维度 | 0 | |

- 作业的预算限值按合入后的组合方式，并入以上份额。
- 扣除发生在读取或分配声明的规模之前；总量恰等于限值时通过。被拒绝的扣除不改变转换用量，已发出的读取仍计入 `sourceReadBytes`。
- 同一步骤内，同一 MESH 或 TEX 条目只物理读取一次。

### 错误码

**`source` 层（转换）：** 沿用 P2-03/05 的 `SourceError` 及其已有 code，限值名追加 `meshVertices`、`meshTriangles` 与 `modelParts`，2026-10-06 修订再追加 `effectRecords`、`missileTypes`、`ringSegments`、`executableObjects`、`executablePages` 与 `executableRegion`。已有 code 与限值的含义不变；`invalid-payload` 的条件扩展到 RENS、LE 结构、区域与效果记录。

| code | 本任务中的条件 | `limit` |
|---|---|---|
| `invalid-payload` | MESH 或 MODL 的源结构不符：头部、保留字、尾字、角数、索引、着色槽数、非有限浮点、列表指针、块长公式或颜色范围 | null |
| `limit-exceeded` | 超出上表的结构限值 | `{ name, limit, observed }` |
| `budget-exceeded` | 扣除后会超出作业预算 | `{ name, limit, observed }`；`observed` 超出安全整数时为 null |
| `invalid-declaration` | 声明不合法或与来源不符：组不是 `models`、映射不是 MODL 整条目、TEX 或 SND 不在生产表中、声明与映射不一一对应 | null |

位置为以下之一，不出现条目编号、偏移、字节或宿主路径：

- `models.declarations[<i>]` 加结构字段路径；
- `models.declarations`：声明组整体的问题；
- `models[<Asset ID>]` 后接 `.model`、`.parts[<l>][<p>]`、`.parts[<l>][<p>].mesh`、`.parts[<l>][<p>].texture` 或 `.sounds[<s>]` 之一；
- 效果几何数据（2026-10-06 修订）：`effects.declarations[<i>]`，或 `effects[<Asset ID>]` 后接 `.source`、`.regions[<k>]`、`.records[<i>]` 或 `.templates[<j>]`，不含对象偏移、条目编号或字节。

部件引用的 MESH 若读取失败，保留 P2-03 的 code 与限值，位置改写为 `models[<Asset ID>].parts[<l>][<p>].mesh`，方式与 P2-03 映射核验改写定位路径相同。

**失败边界一览：** 各类失败的层、code 与位置如下，测试按此逐项断言：

| 失败 | 层与 code | 位置 |
|---|---|---|
| 模型映射核验（MODL 条目缺失、类型不符、等价备选不同） | P2-03 的 `source` 层原 code | P2-03 的 `sources.mappings[…]`，不改写 |
| 由 MODL 字段得到的 MESH 读取失败（条目缺失、类型不符、封包限值） | P2-03 的 `source` 层原 code 与限值 | 改写为 `models[<Asset ID>].parts[<l>][<p>].mesh` |
| 任一读取中的光盘层失败（坏扇区、读取预算等） | P2-02 的 `disc` 层原 code | 原位置，不改写 |
| 源结构不符或超出结构限值 | `source` 层 `invalid-payload` 或 `limit-exceeded` | `models[<Asset ID>]…` |
| 转换预算 | `source` 层 `budget-exceeded` | `models[<Asset ID>]…` |
| 声明或生产表不符 | `source` 层 `invalid-declaration` | `models.declarations…` 或 `models[<Asset ID>]…` |
| 规范 payload 字节不合 schema（含计数范围） | `content` 层 `invalid-model-payload` 等 | 结构字段路径 |
| 区域 locator 语法、文件或 kind 不允许（2026-10-06 修订） | `content` 层 `invalid-source-mapping` 或 `duplicate-mapping` | 映射字段路径 |
| 区域 locator 指向未覆盖的文件 | `source` 层 `path-not-covered` | 改写为 `sources.mappings[i].parts[j].alternatives[k]` |
| LE 结构、区域越界或与修正重叠，RENS 或效果记录不符合格式规则 | `source` 层 `invalid-payload` | `effects[<Asset ID>].source`、`.regions[<k>]`、`.records[<i>]` 或 `.templates[<j>]` |
| 效果结构限值 | `source` 层 `limit-exceeded`，带限值名 | 同上 |
| 效果步骤预算 | `source` 层 `budget-exceeded` | `effects[<Asset ID>]` |

**`content` 层（读取与消费）：** 以下 code 以追加方式加入内容错误 code 枚举，位置为结构字段路径。`unsupported-payload-schema` 与 `binding-mismatch` 复用 P2-05 的 code，含义扩展到模型 payload。

| code | 条件 |
|---|---|
| `invalid-model-payload` | payload 字节不符合 schema 1：长度、字段范围、索引、非有限浮点、尾随字节；消费时的列表序号越界 |
| `unsupported-payload-schema` | payload 的 schema 版本不是 1 |
| `binding-mismatch` | payload 引用的贴图与 sound ID 与描述符依赖不一致，或提供给消费的图像与引用不符 |
| `invalid-effect-payload` | 效果几何数据 payload 不符合 schema 1：长度、计数范围、面表、非有限浮点、尾随字节（2026-10-06 修订） |

### 协议变化

以下变化在合入后的协议上追加：

- 阶段集合末尾追加 `convert-models`，协议版本在合入后的值上递增 1。版本不符时，按 P2-04 的握手规则在发送文件之前失败。
- **阶段不可跳过：** 作业每个阶段开始时都发送一次进度。持有者只接受与当前阶段相同或紧随其后的阶段的进度；跳过一个或多个阶段，或倒退到较早阶段，都报 `protocol-error@message.stage`。合入后若有“发送组之后不再有进度”等规则，照常保留。
- 进度与用量规则沿用 P2-05：`readBytes` 跨阶段累计、不减少。
- 作业发送 `models` 组，同一作业已发送的其他组不变。包身份按合入后的规则，由全部已发送组的草稿重新计算一次。
- 生产 `ConverterVersion` 按合入后的规则递增，因为本任务改变了转换输出：新增模型输出，图形输出追加切片贴图。
- 消息形状与 DTO 语法不变；新增的 code 与限值名只是新的 token。

### 持久化与兼容

- 本任务不读写 IndexedDB 或 localStorage。缓存接线归 P2-11，缓存键由来源指纹与 `ConverterVersion` 组成（P2-10）。本任务递增 `ConverterVersion`，旧缓存因此不会被当作新结果读取。
- schema 1 的模型 payload 尚无持久化消费者，实现前可以随本 spec 的修订调整；一旦缓存或消费者依赖它，不兼容变化必须递增 schema。
- 生产贴图表的编号只追加；改变已有编号会改变 Asset ID，须递增 `ConverterVersion`。

## 研究要求

研究只针对切片需要的事实，按[总计划 §3.1](../../master-plan.md#31-总体方法)：先结构与截图，再有界的只读 EXE 分析。证据只记命令、地址、计数与判定；反编译输出、截图与原版字节留在 `local/`。

| 主题 | 范围 | 通过门槛与阻塞 |
|---|---|---|
| 弹丸、导弹与碎片的表现（U-027） | 对每个角色，确定原版绘制它所用的资源与路径。线索与入口，均为未经核实的探查结果：<br>- 列表 1 与效果回调 `0x3e590`；<br>- 未被 MODL 引用的 MESH、只有列表 1 的 MODL、不在选定任务中的小型 M2ID 模型；<br>- ANIM、EXPL 与 EXIC；<br>- 分配器调用点 `0x38780`、`0x3cb80`；<br>- 原版截图中开火、导弹与击毁的画面。 | 每个角色结论至少高概率，并归入以下一种：<br>1. **独立来源：** 整条目 MODL 或 P2-05 已支持的整条目图像记录，按[生产 Asset](#生产-asset-与来源)的规则转换为承担该角色的 Asset；其他来源形式（独立 MESH、容器子资源、ANIM、EXPL 等）须先修订本 spec，批准其表示与命名，ANIM 还须先修订 P2-05 spec（其技术决定 6）；<br>2. **另一模型的内部元素：** 例如碎片就是被摧毁模型的列表 1；<br>3. **程序生成，没有原版资源。**<br>第 2、3 种无法满足 P2-01 的角色定义，须提出 P2-01 切片定义修订（角色、kind 或基数变化须递增切片定义版本，并经用户批准）。所需修订批准前，或任一角色达不到高概率时，AC-13 为 blocked，不以猜测的 Asset 冒充完成。<br>**结论（P2-06/11、14）：** 碎片与导弹另有整条目来源（已实现）；三类效果的几何都由 RENS 与 EXE 静态数据生成，按 2026-10-06 修订以 `data` Asset 导入，见[效果几何数据](#效果几何数据) |
| 歧义贴图条目（U-028） | 切片贴图实际被像素用到的每个歧义条目。P2-05 的已批准规则与 [textures §3](../../../original/formats/textures.md#nearest-colour-metric-and-tie-rule-unconfirmed) 要求用 EXE 证据解除歧义：找到原版的最近色实现，从未检索的回调分发与绘制路径入手。截图中能区分候选颜色的逐条目像素证据只能作为辅助；只有 P2-05 spec 先修订并经用户批准、允许这类证据解除歧义之后，才能代替 EXE 证据，且须说明如何排除光照明暗的干扰 | 每个条目的结论都满足上述门槛，并记录证据类型。生产展开路径对每个已有结论的条目，得到的显示颜色与结论一致。结论与暂定规则不同时，只修改 `nearestColourMap` 一处（P2-05 技术决定 2），并更新 textures 与 U-028；全局度量与并列规则只有在 EXE 证据下才标为已确认。任一条目未达门槛时，用到它的贴图映射保持未确认，`models` 组不完整，AC-14 为 blocked |
| 部件结构 | 切片实际用到的部件列表、标志值与音效槽：记录已知含义与置信度。音效槽含义以 P2-08 的记录为准。另记录切片网格的三角形绕序与顶点法线一致性统计 | 只记录，不以未确认的含义改写 payload 或玩法 |

## 技术决定

用户在请求本 spec 时说明，需要回答的问题直接采用最推荐的答案。以下决定按此记录；整个契约仍须用户明确批准（见[审批](#审批)）。

1. **模型 payload 保留全部三个部件列表，不赋予语义：** 列表 0 渲染出可辨认的完整模型，并与截图的几何对照一致（mesh §2、§3）；列表 1 高概率是碎片，且已确认效果回调读取它；列表 2 用途未知。P2-01 的闭包规则把三个列表的引用都计入切片。只转换列表 0 会让碎片研究与 P3 失去数据；按猜测的语义命名则会把高概率说成已确认。所以按源序号保留，含义只在 `docs/original/` 记录。
2. **几何是模型的内部元素：** 按 P2-01 的 `model-with-internal-geometry` 单位，MESH 不是独立 Asset。模型内重复引用的 MESH 只存一份，跨模型不共享；这符合 mesh 记录的“效果路径保留所请求 MODL 的来源族”。全部 MODL 中只有 1 处模型内复用；跨模型的重复几何体积很小，不值得为此设立独立的几何 Asset。
3. **原样保留浮点、绕序与 UV，不在转换时换算：** 轴向、手性、正面绕序与 UV 原点都没有确认的证据；本地统计显示绕序与法线并不总是一致。转换时换算会把未确认的选择固化进缓存。换算放到渲染适配，可在 P2-12 对照后修正，而不必重新导入。
4. **贴图经 P2-05 的管线，每个被引用的 TEX 一个 Asset：** 遵守“不开第二套解析器”；最近色只在 `expandImage` 中计算。textures 记录的精确来源别名“不自动成为共享的生产身份”，所以按条目一一对应，不按内容合并。
5. **机型模型 ID 用 P2-09 的绑定，样本 ID 用 P2-08 的生产表：** 两份 spec 都已规定 P2-06 不得另立映射。本任务只核对一致；需要不同的 ID 时，先修订相应 spec。P2-09 的绑定只覆盖任务引用的机型，因此弹丸、导弹与碎片按角色另行命名，不进入机型绑定。
6. **贴图 ID 用中性序号与显式生产表：** 贴图的语义用途（机身、面板等）没有记录，中性序号不冒充语义，与 P2-08 的 `sound/model-clip/<两位序号>` 一致。显式表保证新增贴图时已有 ID 不变。
7. **弹丸、导弹与碎片先研究，不预设表示：** 线索指向多种可能（独立网格、模型内部列表、动画或程序生成），每种对切片定义的影响不同。研究给出结论后按 P2-01 的规则处理：能对应到 Asset 的直接转换，不能对应的修订切片定义。这样不以空 Asset 或猜测的来源满足角色基数。
8. **歧义贴图须有符合 P2-05 门槛的结论才能让 `models` 组完整：** 这是 P2-05 已批准的规则，textures §3 也要求 EXE 证据。8 个切片贴图受影响，因此本任务把这项研究列为验收，而不是推迟到 P2-12。截图证据能否解除歧义属于 P2-05 的契约，本 spec 不放宽它，只保留经修订后使用的路径。
9. **新增 `convert-models` 阶段，由本任务装配并发送 `models` 组：** 模型转换与贴图转换的输入、读取与失败分类不同。单列阶段使进度与失败位置可区分。`models` 组的全部内容（飞行调色板、贴图、模型）此时首次齐备，因此由本任务发送。
10. **先合入 P2-08 与 P2-09：** 三个任务都修改协议版本、阶段、身份与组装，而前两者的机制尚未统一。在统一后的代码上追加一个阶段，比三方同时合并的风险小得多，返工也少。
11. **份额按观察值留余量：** P2-01 要求在消费不可信输入前批准具体限值。弹丸、导弹与碎片的 Asset 数尚未知，份额为它们预留余量；超出时修订本 spec，不在执行中静默放宽。
13. **效果几何以源数据导入，不在导入时生成网格（2026-10-06 修订）：** 按 [executable 的效果几何数据](../../../original/formats/executable.md#effect-geometry-data-p2-0614-research)，这些几何在运行时生成。导入时生成模型 payload 就得补出源数据没有的法线与着色槽。原样保存源数据，再由 `content/` 的纯函数展开，可以保持数值逐位不变；展开规则若经 P2-12 对照需要修正，也不必重新导入。贴图映射函数的语义尚未追踪，所以映射参数原样保存，贴图坐标不在本任务计算。
14. **数据从用户的 EXE 读取，不写进源码：** 模板、类型表与常量都是原版内容，仓库不得包含。EXE 已在白名单中，并经 SHA-256 核验，所以固定的对象偏移与条目 ID 一样只对已识别版本有效。区域 locator 只开放给 `MAIN/SRANGERS.EXE` 与 `data` kind，不成为通用的文件区域机制。只读静态数据区域，不执行代码，符合总计划 §3.2（“嵌入 EXE 的数据按必要范围研究”）与 §8，因此不需要 ADR。
15. **弹丸角色由 `data` 承担（P2-01 修订，用户 2026-10-06 选择方案 A）：** 按 [U-027](../../../original/unknowns.md#数据与格式)，弹丸没有模型或图像来源。允许 `data` 保留原版参数，P2-12 可以对照；不要求 Asset 会收窄总计划列出的资源，需要 ADR，并放弃保真。导弹与碎片同时允许 `data`，因为它们的几何来源相同。
16. **不新增阶段：** 效果数据与模型同属 `models` 组，读取与失败分类简单，在 `convert-models` 阶段内运行即可，协议版本与持有者规则不变。
12. **不新增依赖，不需要 ADR：** 以上决定细化总计划 §3.3、§8、§12，以及 [ADR-0007](../../../decisions/ADR-0007-narrow-p2-overlap-p3.md)、[ADR-0015](../../../decisions/ADR-0015-source-module-structure.md) 的范围与模块边界，不改变冻结决定，也不引入依赖（[ADR-0008](../../../decisions/ADR-0008-mit-and-dependency-licenses.md)）。glTF 等导出格式不在本任务范围内。

## 验收标准

| ID | 可观察的通过条件 | 验证方法与所需证据 |
|---|---|---|
| AC-01 | **模型 payload：** 合成模型含三个列表（其中一个为空）、两个部件共用一个几何、有贴图与无贴图的部件、颜色 0 与 255、标志字原值、五个音效槽中有空也有非空。编码再读取后逐项相等：浮点逐位相等（含负零与次正规数），索引、绕序与角点着色槽不变，容器冻结，数组为调用者独占的副本。读取器拒绝以下输入，报 `invalid-model-payload` 与字段路径：截断、尾随字节、几何或部件数为 0 或超限、三角形索引不小于顶点数、角点着色槽不小于槽数、槽数大于 3 × 三角形数、非有限浮点、颜色大于 255、部件的几何索引越界、列表数不为 3、音效槽不为 5。schema 2 报 `unsupported-payload-schema`。引用与描述符依赖不一致时报 `binding-mismatch` | Node 表驱动测试 |
| AC-02 | **消费辅助：** 按列表 0、1、2 取得的部件项与 payload 一一对应；无贴图的部件只有基色；有贴图的部件给出 image ID 与 `wrap: 'repeat'`；三角形顺序与 UV 未改变。修改返回值不影响后续调用。列表序号 3 报 `invalid-model-payload`。用合成 TEX 图像与飞行调色板，经 `expandImage` 得到的贴图 RGBA 与 P2-05 的展开逐字节相同；提供的图像与引用不符时报 `binding-mismatch` | Node |
| AC-03 | **MESH 源读取：** 合成网格（顶点数 3、三角形数 1，以及含有未用顶点的样本）读出的位置、UV、法线、索引与着色槽与输入逐位相等；输出不与源块共用缓冲。以下输入报 `invalid-payload`：结构指针不为 12、长度字段不符、保留字或尾字不为 0、角数为 4、顶点或着色槽索引越界、着色槽数大于角点数、截断、尾随字节、任一浮点为 NaN 或无穷。顶点数或三角形数为 0 或 4,097 报 `limit-exceeded`，限值名与 `observed` 正确。声明 0xFFFFFFFF 个顶点的网格只读取计数即被拒绝，不出现宿主 `RangeError` | Node |
| AC-04 | **MODL 源读取：** 合成 MODL 读出的三个列表、部件字段与五个音效槽与输入相等。列表指针或计数越出块、块长不等于 44 + 28 × 部件总数、部件保留字段不为 0、颜色分量为 256 报 `invalid-payload`；部件总数为 0 或 257 报 `limit-exceeded`（`modelParts`）。`payloads.ts` 不再导出 `parseMesh` 与 `parseModel` | Node；源码检查 |
| AC-05 | **转换：** 在合成封包上，按声明与映射转换的模型 payload 等于期望：部件引用的 MESH 按 MESH 类型读取；模型内重复的 MESH 只存一份；两个模型引用同一 MESH 时各自含有该几何；部件的 TEX 解析为生产贴图表中的 image ID，SND 解析为音效表中的 sound ID。TEX 或 SND 不在表中、组不是 `models`、映射不是 MODL 整条目、声明与映射不一一对应时报 `invalid-declaration`。部件引用到非 MESH 条目时，保留 P2-03 的 code，位置改写为 `models[<Asset ID>].parts[<l>][<p>].mesh`。同一输入两次转换，payload 与 SHA-256 相同。位置都符合[错误码](#错误码)的语法，不含条目编号 | Node |
| AC-06 | **贴图与调色板：** 在合成封包上，生产贴图表的每个 TEX 经 P2-05 图形步骤得到一个 image 与一个 palette Asset，二者 ID 序号相同，都在 `models` 组，角色分别为 `model-texture` 与 `texture-palette`。image 的显示映射为 `{ nearest: 'palette/flight/models' }`，依赖恰为自身调色板与飞行调色板。两个模型共用的 TEX 只有一个 image Asset；内容相同的两个 TEX 条目各有一个 Asset。源码中没有图像、调色板或最近色的第二套实现 | Node；源码检查 |
| AC-07 | **限值、预算与读取：** 结构限值与两份生产份额以常量导出，并与[限值与预算](#限值与预算)一致。在份额（`assets`、`vertices`、`triangles`）、每个模型的结构上限（`modelParts`）与实际字节布局（含部件、ID 表与头部）共同约束下计算的 payload 上界，不超过 `payloadBytes` 份额。结构上合法但超出份额的输入（例如顶点总数超过 `vertices` 份额）以 `budget-exceeded` 拒绝。总量恰等于限值时通过；任一维度超出时报 `budget-exceeded`，带维度、`limit` 与 `observed`，不改变转换用量，不产生部分结果。读取已发生后才被拒绝时，读取仍计入 `sourceReadBytes`。被多个部件或模型引用的 MESH、被多个模型引用的 TEX，在一步之内都只物理读取一次（用计量端口断言读取次数） | Node，使用计量端口 |
| AC-08 | **步骤结果与 `models` 组：** 在按生产结构放置合成条目的合成光盘上：<br>- 模型步骤得到[生产 Asset](#生产-asset-与来源)中的全部模型；机型模型的 ID 与对同一合成输入运行 P2-09 绑定得到的 ID 逐一相同，且 `logic` 组对模型的外部要求都由 `models` 组满足；<br>- `models` 组含飞行调色板、全部贴图与调色板以及全部模型；描述符、payload 与来源状态按 ID 升序一一对应，不含定位或条目编号；<br>- 当合成映射全部可核验时，`validateGroup` 返回 `group-complete`，外部要求恰为模型引用的 sound ID；把一个必需角色的来源设为未确认时返回 `incomplete` 与 `source-not-ready`；<br>- 任一模型转换失败时，步骤失败，不输出结果 | Node |
| AC-09 | **协议与作业：** 阶段集合在合入后的序列末尾加上 `convert-models`，协议版本比合入后的值大 1，版本不符时在发送 `start` 之前失败。成功作业的消息顺序为：前序阶段 → 至少一条 `convert-models` 进度 → 发送 `models` 组 → `finished`；`readBytes` 不减少；接收方验证后的 `models` 组与 Node 期望一致。包身份覆盖全部已发送组，`ConverterVersion` 已按合入后的规则递增。持有者测试分别覆盖：阶段倒退；在一个或多个前序转换阶段尚未报告进度时直接出现 `convert-models`（跳过阶段）。两者都报 `protocol-error@message.stage`。失败按[失败边界一览](#错误码)逐类验证：前序阶段的失败保持原结果；模型映射核验失败保持 P2-03 的位置；MODL 字段引用的 MESH 缺失或类型不符时，保持 P2-03 的 code，位置改写为 `.parts[<l>][<p>].mesh`；光盘层失败保持 `disc` 层与原位置；转换失败的 code 与位置符合[错误码](#错误码)。失败与取消的快照都不含部分组 | Node `MessageChannel` 集成与持有者测试 |
| AC-10 | **真实 Worker：** 在 development 项目中，真实 Chromium 模块 Worker 经测试专用入口运行生产作业，输入为合成光盘。成功时持有者收到并验证 `models` 组，Asset 数与用量（`assets`、`vertices`、`triangles`、`imagePixels`、`payloadBytes`）等于 Node 侧的期望。损坏的合成 MESH 使作业以 `source` 层 `invalid-payload` 失败，且没有组被移交。在收到首条 `convert-models` 进度时取消：状态为 `cancelled`，Worker 终止，之后状态不再改变 | `pnpm test:e2e <用例> --project=development` |
| AC-11 | **本地基准（生产路径）：** 在开发者机器上用本地基准镜像：<br>- 直接调用生产模型步骤：得到全部生产模型，机型模型的 ID 与 P2-09 绑定一致；每个模型的几何、部件与音效引用与参考读取逐项结构等价（顶点、三角形、着色槽与浮点逐位相同）；两次运行每个 payload 的 SHA-256 相同；用量不超过份额；<br>- 经作业、宿主与持有者模块处理同一镜像：以 `finished` 结束，`models` 组被验证，结果为 `group-complete`；或为 `incomplete`，且每条诊断都对应 AC-13、AC-14 中记录的阻塞 | 本地 Node 脚本，留在被忽略的 `local/research/p2-06/`；证据只记录命令、计数、判定与诊断 code |
| AC-12 | **本地全量结构核对：** 加固后的 `tools/nob-check.ts` 用同一套读取处理本地基准 `SR.NOB`，全部 486 个 MESH 与 19 个 MODL 都通过；输出只有计数与失败原因。观察最大值与上表的限值一起写入 mesh。任何实例被拒绝时，本项不通过，须按证据修订本 spec，不放宽为静默接受 | 本地运行该工具，记录命令与计数 |
| AC-13 | **弹丸、导弹与碎片（U-027）：** 按[研究要求](#研究要求)，三个角色各有至少高概率的结论与证据类型，记入 mesh（必要时 textures、executable），U-027 状态已更新。<br>- 结论为本 spec 直接支持的来源形式时，生产声明与映射已加入相应 Asset，ID 与角色符合[生产 Asset](#生产-asset-与来源)的规则，并在 AC-08、AC-11 中通过；<br>- 这些 Asset 引用了 P2-08 生产音效表中没有的 SND 时，已追加到该表并由其转换器转换，`audio` 组与包身份随之通过 Node 测试，全包的音效外部要求都已解析；<br>- 结论需要其他来源形式，或要求修订切片定义时，相应的本 spec、P2-05 或 P2-01 修订已获用户批准，且实现已与之一致；<br>- 任一角色达不到门槛，或所需修订未获批准时，本项为 blocked，记录原因与恢复条件。<br>2026-10-06 修订：程序生成的几何按[效果几何数据](#效果几何数据)以 `data` Asset 满足，由 AC-18 至 AC-21 验证 | 本地研究；文档与生产常量对照审阅；Node |
| AC-18 | **区域 locator 与 EXE 读取（2026-10-06 修订）：**<br>- 区域 locator：合法与规范写法通过；不规范写法、其他文件、非 `data` kind、多个备选报 `invalid-source-mapping`，重复报 `duplicate-mapping`，排序规则逐项断言。映射核验不读取区域字节，含区域 locator 的映射为 `declared`；文件未覆盖时报 `path-not-covered`，位置改写为结构路径。<br>- EXE 读取：合成 LE 文件（代码生成，含多个对象、页映射与修正记录）上读出的区域与输入逐字节相等，输出不共享缓冲。签名、字序、页大小、对象表、页映射或修正页表越界，区域越出对象、跨入非文件页、与修正重叠，都报 `invalid-payload`。对象数、页数或区域长度超限报 `limit-exceeded`，限值名正确，只读计数即拒绝 | Node |
| AC-19 | **效果 payload 与展开：** 三种 payload 编码再读取逐项相等，浮点逐位相等。以下输入报 `invalid-effect-payload`：截断、尾随字节、计数越界、面表角数不为 3 或 4、序号越界、缺少结束标记、非有限浮点。schema 2 报 `unsupported-payload-schema`，依赖不符报 `binding-mismatch`。展开函数用代码生成的任意模板、标记、常量与记录：每个形状的顶点、面表、颜色与模式，等于测试中按[效果几何数据](#效果几何数据)与 executable 的规则写成的计算式；同一输入两次结果相同。仓库中没有原版值或由其得到的快照 | Node 表驱动测试；源码检查 |
| AC-20 | **效果步骤与组：** 合成光盘（含合成 RENS 与合成 EXE）上，效果步骤得到三个 `data` Asset，`models` 组不再有任何效果角色的 `role-cardinality`。<br>- 用量恰等于按 payload 布局与展开规模计算的期望，并计入模型份额；上界计算以常量与测试断言。<br>- 失败按[失败边界一览](#错误码)逐行验证：区域或记录损坏时步骤失败，位置正确，没有部分结果。<br>- 作业的阶段与协议版本不变；真实 Worker 的 `models` 场景同步更新 | Node、`MessageChannel` 集成与 E2E |
| AC-21 | **本地基准：** 在本地基准镜像上：<br>- 三个 payload 与用 executable 记录的结构独立读取的数据逐项相等，两次运行 SHA-256 相同；<br>- 展开函数对每条弹丸记录、每个导弹类型与每种碎片形状都成功，顶点与面数符合构建规则；<br>- 用量在 `PRODUCTION_MODEL_SHARE` 之内；<br>- 作业的 `models` 组只剩 AC-14 的诊断 | 本地 Node 脚本，证据只记命令、计数与判定 |
| AC-14 | **歧义贴图条目（U-028）：** 列出切片贴图实际用到的全部歧义条目。每个条目的结论都满足[研究要求](#研究要求)的证据门槛：EXE 证据，或 P2-05 spec 修订并获批准后允许的逐条目截图证据。证据类型记入 textures 与 U-028。生产展开路径对每个条目得到的显示颜色与结论一致；生产贴图映射的置信度与之一致，不再有因歧义而未确认的贴图。结论与暂定规则不同时，只改了 `nearestColourMap` 一处，P2-05 的相关测试已同步。任一条目未达门槛时，本项为 blocked，相应贴图保持未确认 | 本地研究；文档与映射对照审阅；对每个条目断言展开结果 |
| AC-15 | **部件结构记录：** mesh 记录切片用到的部件列表、标志值与音效槽的已知含义与置信度，以及切片网格的绕序与法线一致性统计；源码结构写明 payload 不承载这些含义，并写明[消费者边界](#消费者边界)中的坐标与朝向约定 | 文档审阅 |
| AC-16 | **边界、隐私与工程：**<br>- `content/` 的新模块不导入 `original-data`、DOM、Node 或 Three.js；<br>- 本任务产生的诊断不含原版字节、条目编号、偏移、文件名或宿主路径；<br>- nob-check 只输出结构计数与失败原因；<br>- `workers/` 仍不使用网络 API；<br>- 没有新依赖，锁文件不变；<br>- `pnpm check`、`pnpm check:original` 与聚焦 E2E 通过 | 命令输出；依赖与锁文件 diff；源码与边界检查 |
| AC-17 | **文档：**<br>- mesh、textures 与 unknowns 更新 AC-13 至 AC-15 的事实与置信度，以及 AC-12 的观察最大值；<br>- 源码结构、工程约定与工具指南记录新模块、payload 布局、消费者边界、阶段与协议版本、限值、错误码与命令；<br>- `tasks.md` 只更新导航；<br>- 文档中没有原版内容 | 文档链接与元数据检查、最终 diff 审阅 |

## 验证策略

- **单元/契约测试：** 在新模块旁新增 Node 环境的 `*.test.ts`：
  - 模型 payload 的编码、读取与消费辅助：AC-01、AC-02；
  - MESH、MODL 源读取：AC-03、AC-04；
  - 声明、转换、贴图与预算：AC-05 至 AC-07；
  - 步骤与 `models` 组：AC-08；
  - 作业、协议与持有者：AC-09。

  合成样本由 [synthetic.ts](../../../../src/original-data/synthetic.ts) 的构造器生成，测试不读取 `local/`。
- **Replay/一致性：** 不适用。本任务不改变 Core、Runtime 或 replay；确定性只要求同一输入与声明的 payload 字节与 SHA-256 相同。
- **浏览器验证：** AC-10 在 Playwright 的 development 项目中用合成光盘运行真实模块 Worker；按 [browser-testing](../../../../.agents/skills/browser-testing/SKILL.md) 使用合成数据与隔离上下文。本任务没有画面，不做 WebGL 断言；模型渲染的浏览器验证归 P2-11。
- **实机/原版对照：**
  - AC-11 至 AC-14 在开发者机器上使用本地基准镜像、`SR.NOB`、已有的本地截图与只读 Ghidra 项目；
  - 证据只记命令、地址、计数与判定；
  - 视觉保真的最终判定归 P2-12，本任务的本地核对是结构等价，不代替截图对照。
- **工程检查：**
  - 迭代时：`pnpm exec vitest run src/content src/original-data src/workers src/app/import`；
  - 完成前：`pnpm check`、`pnpm check:original`、`pnpm test:e2e e2e/import-worker.spec.ts --project=development`；
  - 文档：链接与元数据检查；
  - 依赖清单与锁文件不变。

## 风险与恢复

风险等级：**中**。

- 本任务修改共享的源结构读取、协议、作业与组装，并递增 `ConverterVersion`；但 payload 尚无持久化消费者，回退只需撤销提交。
- 研究结论决定组能否完整，阻塞可能持续较久。

具体风险与缓解：

- **合并冲突：** P2-08、P2-09 未合入，且机制互不相容。缓解：执行前提要求先合入并统一；goal 按合入后的代码生成；合入后的机制若与本 spec 不符，先修订本 spec。
- **研究阻塞：** 弹丸、导弹、碎片或歧义贴图的研究达不到高概率时，相应 AC 保持 blocked，其余 AC 仍可完成。P2-11 依赖整项 P2-06，因此阻塞须在 goal 中显式记录，由用户决定是否调整索引依赖，不以猜测的 Asset 或颜色推进。
- **切片定义修订：** 研究可能要求改动 P2-01 的角色、kind 或基数。这会递增切片定义版本，所有组的身份都随之改变。缓解：走 P2-01 的修订与重新批准；合成测试与生产常量随新版本同步。
- **依赖 ANIM 或 EXPL：** 若某角色只能由编码 1 的动画或 EXPL 表现，按 P2-05 技术决定 6 先修订 P2-05 spec（新增 S/AC），图像解码仍只有一处；EXPL 的结构研究在相应修订中补充。
- **份额不足：** 研究追加的 Asset 若使用量超出份额，修订本 spec 的份额表，不在执行中放宽常量。
- **坐标约定误判：** 本任务不换算坐标与 UV；P2-12 发现朝向或贴图方向错误时，只修改 P2-11 的渲染适配，不必重新导入或递增 schema。

## 未决事项

无。用户要求需要回答的问题直接采用最推荐的答案，相关选择已记录在[技术决定](#技术决定)。AC-13 与 AC-14 的研究结论是执行期的验收条件，不是待定的契约选择；结论不足时按各自条款保持 blocked。执行前提（先合入 P2-08、P2-09）是 goal 生成的条件，不阻止本 spec 的审阅与批准。

## 审批

用户于 2026-10-05 明确批准本 spec。批准范围包括：

- S-01 至 S-13、AC-01 至 AC-17；
- 执行前提与协调、模型 payload 契约、消费者边界、模型转换声明、生产 Asset 与来源、步骤结果与 `models` 组、限值与预算、错误码（含失败边界一览）、协议变化、持久化与兼容、研究要求；
- 技术决定 1 至 12。

生成时按“采用推荐答案”授权作出的选择，以及 review-spec（rubber-duck，GPT-6.1 Sol）采纳的六项修正，随本次批准一并生效。批准不改变执行前提：goal 须在 P2-08 与 P2-09 合入 `main` 并统一协议、身份与组装机制之后生成。

**2026-10-06 修订（待批准）：** 用户选择方案 A（弹丸角色由 `data` 承担），并要求研究 EXE 中的效果几何。据研究结论新增或修改：
- S-14、[效果几何数据](#效果几何数据)；
- 生产 Asset、限值、错误码与研究要求中的相应条款；
- 技术决定 13 至 16；
- AC-13 的修订说明与 AC-18 至 AC-21。

同时修订 P2-01 的切片定义与来源定位。修订稿经另一模型两轮审阅，发现的问题均已修正；用户于 2026-10-06 明确批准两份修订，本 spec 恢复为 accepted。
