---
type: plan
status: active
phase: P2
task: "06"
subtask: "11"
updated: 2026-10-06
---

# 11 — 弹丸、导弹与碎片的表现研究（U-027）

**契约来源：** [spec](../spec.md) 的 S-11（U-027 部分）、S-10 与 S-06（研究确认的 Asset）；[研究要求](../spec.md#研究要求)的第一行，[生产 Asset 与来源](../spec.md#生产-asset-与来源)的研究确认行与来源形式；AC-13。
**依赖：** 09。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。执行期修订把需要契约修订的部分拆入 [14](./14-procedural-effect-sources.md)，见 [goal 执行记录](../goal.md#执行记录)。

## 工作范围

- **研究：** 对弹丸、导弹与碎片三个角色，确定原版绘制它们所用的资源与路径。方法按总计划 §3.1：先结构与截图，再有界的只读 Ghidra 分析（`-noanalysis -readOnly`，不 `-overwrite`）。线索均为未经核实的入口：
  - 列表 1 与效果回调 `0x3e590`（[mesh 次级表现路径](../../../../original/formats/mesh.md#secondary-presentation-model-reuse-bounded)）；
  - 未被 MODL 引用的 MESH、只有列表 1 的 MODL、不在选定任务中的小型 M2ID 模型；
  - ANIM、EXPL 与 EXIC（[hud §3](../../../../original/formats/hud.md#3-id-lists-confirmed-structure)）；
  - 分配器调用点 `0x38780`、`0x3cb80`（[executable](../../../../original/formats/executable.md#bounded-slot-1-interaction-kind-evidence)）；
  - `local/StarRang/captures/` 中开火、导弹与击毁的画面。

  证据只记地址、结构、计数与判定，反编译输出与截图留在 `local/`。
- **结论分类：** 每个角色的结论至少高概率，并归入以下一种：
  1. **独立来源，本 spec 直接支持：** 整条目 MODL 或 P2-05 已支持的整条目图像记录。
     - 模型经 05、06 的步骤与生产输入转换，ID 为 `model/<角色>`（多个时为 `model/<角色>-<n>`），角色为 `projectile`、`missile` 或 `debris`，不进入机型绑定；
     - 图像经 P2-05 的声明契约转换，ID 为 `image/<角色>`（或加序号），并有调色板绑定；
     - 它们引用了生产音效表中没有的 SND 时，按 P2-08 的命名规则追加到 [production-sounds.ts](../../../../../src/original-data/conversion/production-sounds.ts)，由其转换器转换，并核对音频份额；超出 P2-08 已批准的份额时，先修订 P2-08 spec；
     - 研究追加的 Asset 若使用量超出 04、06 的份额，修订本 spec 的份额表，不在执行中放宽常量。
  2. **独立来源，但需要其他形式：** 如没有 MODL 的独立 MESH、容器内的子资源、ANIM、EXPL。先修订本 spec，批准其规范表示、默认字段与命名；ANIM 还须先修订 P2-05 spec（其技术决定 6）。
  3. **另一模型的内部元素**（如碎片即被摧毁模型的列表 1），或 **程序生成、没有原版资源：** 须提出 P2-01 切片定义修订（角色、kind 或基数变化须递增切片定义版本），经用户批准。
- **落实：**
  - 第 1 种：在生产常量中加入相应 Asset，更新 Node 测试；复跑 09 的本地脚本，确认 AC-08、AC-11 通过。
  - 第 2、3 种：按 spec 与 execute-goal 的阻塞规则记录 blocked。
- **文档：** [mesh](../../../../original/formats/mesh.md)，按需 [executable](../../../../original/formats/executable.md)、[textures](../../../../original/formats/textures.md)；[unknowns](../../../../original/unknowns.md) 的 U-027 状态与 `updated:`。

## 不包含

- 弹丸与导弹的飞行、命中、生命周期，碎片的运动与持续时间（P3）。
- 歧义贴图条目（12）。
- 未经批准就修改 P2-01 的切片定义，或修改 P2-05、P2-08 的 spec。

## 关键文件与契约

- 第 1 种结论时修改：06 的生产模型输入、[production-graphics.ts](../../../../../src/original-data/conversion/production-graphics.ts)、按需 [production-sounds.ts](../../../../../src/original-data/conversion/production-sounds.ts)，以及相应测试与合成光盘。
- 原版文档：mesh、executable、textures、unknowns。
- 本地新增 `local/research/p2-06/` 下的研究脚本与输出（被忽略）。
- 前提：本地 `SR.NOB`、截图与 `local/ghidra/srangers.gpr` 存在（2026-10-05 已确认）；缺少时本子任务为 blocked。

## 验收标准

- [x] AC-13：三个角色各有至少高概率的结论与证据类型，记入 mesh（必要时 textures、executable），U-027 状态已更新。
- [x] AC-13：第 1 种结论的 Asset 已加入生产声明与映射，ID 与角色符合规则，在 AC-08 的 Node 测试与 AC-11 的本地复跑中通过；额外 SND 已追加到 P2-08 的表与转换器，全包的音效外部要求都已解析。
- [x] AC-13：第 2、3 种结论（弹丸，以及导弹体与部分碎片的程序几何）按执行期修订拆入 [14](./14-procedural-effect-sources.md)，所需修订与恢复条件记录在那里；本子任务不再承担这一项。
- [x] **阻塞规则：** 任一角色达不到高概率，或所需修订未获批准时，本子任务为 blocked。记录原因、受影响的 AC-13，以及恢复条件：取得新证据，或相应修订获批准。不以空 Asset 或猜测的来源冒充完成。
- [x] 改了代码时，`pnpm check` 通过。

## 验证方法

- 本地只读研究；文档与生产常量逐项对照审阅；改了代码时运行 Node 测试并复跑 09 的本地脚本。
- 不适用 browser-testing。
- 改了代码时，完成前按 execute-goal 流程做 rubber-duck 审查与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)；只改文档时只做 rubber-duck。

## 完成证据

- **研究方法（2026-10-06）：** 结构、截图与有界的只读 Ghidra 分析（`-noanalysis -readOnly`，函数只在内存中创建，不保存项目）。脚本与输出都在被忽略的 `local/research/p2-06/effects/`：
  - 只读脚本 `DecompileEntry.java`、`FindPointerValues.java`，以及沿用 P2-01 的 `FindReferences.java` 与本地的 `DumpAt.java`；
  - 对 EXE 代码对象的相对调用目标与 32 位常量扫描；
  - 结构探查 `effect-resources.ts/.json`；
  - 92 张本地截图的缩略总览。

  文档只记地址、结构、计数与判定，不含反编译代码。
- **关键发现：** 效果资源的创建者此前没有找到，因为这些初始化函数从未被反汇编，且只经相对调用到达。扫描相对调用目标后找到：
  - 飞行设置 `0x3ed0d` → 3D 场景创建 `0x3cfbb` → 导弹视觉 `0x444ac`、弹丸视觉 `0x3fa30`、碎片效果 `0x3e430`；
  - 场景消息处理 `0x3d4e4` 按运行时种类创建视觉。

  P2-01 曾用多次运行期观察寻找 `0x187010`、`0x187014`、`0x1752ac`、`0x1752b0` 的写入者，现已在静态代码中找到。
- **结论（[executable 的效果表现来源](../../../../original/formats/executable.md#effect-presentation-sources)）：**

  | 角色 | 结论 | 证据类型与置信度 | 分类 |
  |---|---|---|---|
  | 弹丸 | 由 RENS 记录参数化的程序几何；构建函数只创建几何，不设贴图、不读条目 | 代码，已确认；截图中开火为细彩色线段，高概率 | 第 3 种（程序生成）→ 14 |
  | 导弹 | TEX 10377 作为导弹元素的贴图（按常量 ID 载入，32 种旋转映射随机选取），加上 EXE 数据表中的程序几何 | 代码，已确认；该元素的外观未确认（没有导弹飞行的截图） | 第 1 种：`image/missile`；程序几何为第 2 种 → 14 |
  | 碎片 | 被毁机体自身模型的第 1 列表（模式 3）、MODL 10383 第 1 列表部件（判别值 2）、以 TEX 10151 为贴图的程序几何（判别值 1）、无贴图程序几何（判别值 0） | 代码，已确认；判别值 1、2 何时产生未确认（事件 `0x10` 的发送者未找到）；外部视角截图有贴图碎片，高概率 | 第 1 种：`model/debris`；自身第 1 列表已在各模型 payload 中；程序几何为第 2 种 → 14 |

  其他文档：
  - **结构：** MODL 10383 只有列表 1，6 个部件，260 个顶点、240 个三角形，没有音效，全部部件引用 TEX 10151。TEX 10151 为 raw 256×256，没有用到歧义条目。TEX 10377 为 raw 64×64，用到歧义条目。没有被 MODL 引用的那个 MESH，在 EXE 中没有任何 32 位常量引用。
  - **mesh：** 第 1 列表与 MODL 10383 的描述改为代码已确认。
  - **textures：** 增加两张效果贴图的指引。
  - **U-027：** 状态改为“部分确认”，并记入效果表现来源；第 2 列表与标志值仍未确认。
- **实现（第 1 种）：**
  - [production-models.ts](../../../../../src/original-data/conversion/production-models.ts) 导出 `PRODUCTION_EFFECT_MODELS`，`model/debris` 总是与机型模型一起声明与映射：likely，U-027、U-028，证据为 executable 与 mesh §2。
  - [production-model-textures.ts](../../../../../src/original-data/conversion/production-model-textures.ts) 追加第 16 行，即 TEX 10151，不歧义。
  - [production-graphics.ts](../../../../../src/original-data/conversion/production-graphics.ts) 新增 `PRODUCTION_EFFECT_IMAGES`，声明 `image/missile` 与 `palette/missile`：图像 unconfirmed，U-027、U-028；调色板 confirmed。
  - 新来源中没有新的 SND，音频组不变。
  - 用量在份额之内，份额常量不变；spec 的生产 Asset 行与份额依据已按执行期修订更新。
- **测试：**
  - 生产贴图表、生产图形与生产模型测试按新增行更新。
  - 合成切片光盘加入只有列表 1 的碎片 MODL；`MODEL_TEXTURE_USAGE` 计入效果图像。
  - 生产模型步骤现在总是转换效果模型。只关心图形或音频的作业及 Worker 场景（`graphics`、`graphics-corrupt`、`audio`）同时传入 `NO_LOGIC` 与 `NO_MODELS`，断言意图不变。
  - 模型损坏的失败位置仍为 `models[model/base-1].parts[0][1].mesh`。
- **命令：**
  - `pnpm check`：132 个文件、3,842 项通过，构建通过。
  - `pnpm test:e2e e2e/import-worker.spec.ts --project=development`：15 项通过。
  - 复跑 [09](./09-local-base-check.md) 的本地脚本，`passed: true`：
    - **直接调用：** 6 个模型（5 个机型与 `model/debris`）与参考读取逐项结构等价，失败 0 项；共 155 个几何、3,547 个顶点、3,700 个三角形。两次运行 40 个 payload 的哈希相同。模型步骤用量为 assets 6、dependencyEdges 41、payloadBytes 161,539；贴图与效果图像的追加用量为 assets 34、imagePixels 410,624、paletteEntries 244，均在份额之内。
    - **作业路径：** `models` 组共 41 个 Asset，为 `incomplete`，10 条诊断全部对应已记录的阻塞：`role-cardinality@roles.projectile` 1 条（AC-13 → 14），`source-not-ready` 9 条（8 个歧义贴图与 `image/missile`，AC-14），未归类 0 条。`logic` 与 `audio` 完整，三组身份相同，读取 20,656,035 字节。
- **Rubber-duck：** 无阻塞问题。两项非阻塞发现已修复：
  1. 本地脚本的判定加入“缺失的效果角色恰为没有生产 Asset 的角色”与“未就绪恰为歧义图像集合”；
  2. 源码结构写明只有机型模型 ID 来自绑定，效果模型是固定的。

  审阅者确认：executable 的结论与置信度有反编译证据支持；同一 MODL 或 TEX 只有一个 Asset；追加行符合编号规则；`NO_MODELS` 的用法合理。
- **Simplify：** 四个角度各一个审阅代理。
  - **修复：**
    - 导出 `PRODUCTION_EFFECT_MODELS`，测试支持直接使用它，不再由映射表反推（三个代理都提到）；
    - 切片贴图与效果图像合并为一张 `TEX_IMAGES` 行表，共用一组声明与映射构建；
    - 模型映射测试按 ID 排序生成期望，不再依赖位置。
  - **跳过：**
    - 每次作业预计算固定的效果模型行：只有一行，成本可忽略；
    - 跨模块共用映射构建函数：两处只共享记录字面量；
    - 测试期望改用通用夹具或 ID 函数：期望刻意逐项写出生产值，作为独立对照。
  - **抽象层次：** 确认效果模型经 `inputs(bindings)`、效果图像放在生产图形中、图形与音频测试用 `NO_MODELS` 都是合适的层次。
- **文档影响：** 已更新：
  - executable、mesh、textures、unknowns（U-027）；
  - [源码结构](../../../../engineering/source-structure.md)的切片贴图、效果图像、生产模型、合成光盘与 Worker 场景；
  - spec 的生产 Asset 与份额依据；
  - goal 的执行记录、tracker，以及新子任务 14 与 13 的依赖。
