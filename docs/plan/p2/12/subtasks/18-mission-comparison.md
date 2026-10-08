---
type: plan
status: active
phase: P2
task: "12"
subtask: "18"
updated: 2026-10-07
---

# 18 — 任务字段、引用与 Core 载入（M-1、M-2、M-4）

**契约来源：** [spec](../spec.md) 的 S-10、[原版本地对照](../spec.md#原版本地对照)的 M-1、M-2、M-4；AC-19 的 agent 部分（用户的页面确认在 21）。
**依赖：** 12。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 被忽略的本地脚本（计划新增 `local/research/p2-12/mission/`）：
  - **独立读取：** 按 [scenario](../../../../original/formats/scenario.md) 与 [hud §3](../../../../original/formats/hud.md#3-id-lists-confirmed-structure) 自行读取所选 SCEN、SCCT 与 M2ID；可共用已验证的光盘与 NOB 字节读取（`openVerifiedSource`），不复用 `src/original-data` 的场景解析器或 `convert-logic`。
  - **字段来源表：** `MissionContent`、`CraftTypeTable`、`WingmanRoster` 的每个字段归为原样、去重/索引/单位变换、项目身份或研究派生。阵营、交互类别与地图轴向引用对应的 EXE 或行为依据（[executable](../../../../original/formats/executable.md)、[B-001](../../../../original/behavior/B-001-strategic-map.md)），不复制生产分类表生成期望；未知的规则输入保持未知。
  - **比较（M-1）：** 与经 `content/` 读取器解码的候选逻辑 payload 逐字段比较，不同字段数为 0；计数等于 [P2-09 AC-14](../../09/spec.md#验收标准) 的记录。
  - **引用（M-2）：** 用独立的 M2ID 读取核对机型到模型的绑定，全部解析为 `models` 组中的 Asset。
  - **Core（M-4）：** 在候选上调用纯 `loadMission`，完整 `MissionSetup`（玩家声明、编组与成员、生成区域、坐标与地图框架、机型/阵营/模型、僚机选项）等于独立预期；两次载入深度相同；不推进 tick、不随机生成世界。
- 证据只记计数、Asset ID 与判定，不记字段值、坐标或名称。

## 不包含

- 地图框架的运行时核实（19）；用户真实导入后的页面诊断（21）；P3 规则语义。

## 关键文件与契约

- [logic-content.ts](../../../../../src/content/logic/logic-content.ts)、[load-mission.ts](../../../../../src/core/mission/load-mission.ts)；[scenario 字段清单](../../../../original/formats/scenario.md#selected-mission-field-inventory-confirmed-structure)；`local/research/p2-09/` 的字段清单脚本做法。

## 写入范围

- `local/research/p2-12/mission/**`：独立读取与比较脚本及输出（被忽略）。

## 验收标准

- [x] AC-19（agent）：字段来源表完整；逐字段差异为 0；计数等于 P2-09 记录；模型绑定全部可解析。
- [x] 完整 `MissionSetup` 等于独立预期，两次载入相同。
- [x] 证据不含字段值、坐标或名称。

## 验证方法

- 在本机运行脚本，记录命令与计数；再临时改动一个独立读取的字段，确认脚本报告差异。
- 不涉及浏览器验证。

## 完成证据

- **脚本：** 被忽略的 `local/research/p2-12/mission/mission-check.ts`（同目录 `tsconfig.json`，`pnpm exec tsc -p local/research/p2-12/mission/tsconfig.json` 通过）。输出 `<label>.json` 与 `<label>.log` 只在同一目录。
  - **命令（在检出根目录）：** `node --preserve-symlinks --preserve-symlinks-main local/research/p2-12/mission/mission-check.ts [--label <name>] [--mutate <mutation>]`。不给文件时读取 `local/StarRang/cd/STAR_RANGERS.{ccd,cue,img,sub}`。退出码：0 通过，1 失败，2 用法错误（缺少这两个参数、不在检出根目录或未知变异时拒绝运行）。
  - **实际值：** 复用 [P2-11 `pipeline.ts`](../../11/subtasks/23-local-real-data-import.md#完成证据) 的 `jobOwner()` 运行生产作业，`takeGroups()` 后只用 `content/` 读取器解码：`decodeLogicPayload`（三个 logic Asset）、`readModelPayload`、`readImagePayload`、`readSoundPayload`。
  - **独立预期：** 经共用的已验证读取（`openVerifiedSource`、`openArchive`、`read`）取得 SCCT、所选 SCEN、M2ID、MODL、MESH、TEX 与 SND 的字节，由脚本自行按 [scenario §2–§4](../../../../original/formats/scenario.md)、[hud §3](../../../../original/formats/hud.md#3-id-lists-confirmed-structure)、[mesh §1–§2](../../../../original/formats/mesh.md)、[textures §2](../../../../original/formats/textures.md#2-image-record-36-bytes-confirmed) 与 [audio §1](../../../../original/formats/audio.md#1-snd-digital-sound-effects-confirmed-on-all-37-entries) 解析。脚本不导入 `src/original-data` 的格式解析器（scen、scct、m2id、object-record、mesh、modl）、转换器或机型绑定。
  - **规则依据（不复制生产分类表）：** 阵营取[玩家目标模式](../../../../original/formats/executable.md#player-target-modes-and-enemy-classification)的两个掩码与玩家自身的种类比特；基地交互取[交互种类判定](../../../../original/formats/executable.md#bounded-slot-1-interaction-kind-evidence)的掩码；地图轴向取 [B-001](../../../../original/behavior/B-001-strategic-map.md#地图框架与坐标轴高概率p2-09) 与[地图投影](../../../../original/formats/executable.md#strategic-map-projection)，中心与半边长取[世界扇区网格](../../../../original/formats/executable.md#mission-placement-scheduling-and-world-grid)；model Asset ID 按 [P2-09 机型与模型绑定](../../09/spec.md#机型与模型绑定)的命名规则。
- **候选绑定：** 本次运行于 worker 基点 `a7ff04e71bd94273ed05fc608051d98a4d08684e`。与 [12](./12-candidate-check.md#完成证据) 记录的候选提交 `97b70def6e7d3b35eb681391bdf1d023b6f14cf0` 相比，`src`、`package.json` 与 `pnpm-lock.yaml` 无改动，也无未提交改动。完整 `ContentIdentity`、三个 logic payload 指纹与 `MissionSetup` 摘要（`sha256:714f3bff…a6f0`）都等于 12 的记录。
- **源字段处理（逐项失败即关闭）：** 按 [P2-09 源字段处理](../../09/spec.md#源字段处理)，脚本在没有预期的情况下报错，而不是跳过：
  - 9 条 SCEN 记录与 5 条 SCCT 僚机记录中，契约不转换或只允许默认值的 199 个字全部为零；
  - 1 个 +0x54 事件触发指向段 2 的第一个元素，生成配对指针与数量为零；
  - 段 4 为空，头部 0x0C 为零，段 5 运行时字段为零，段 6 每项都被段 5 引用且表后计数不为正，成员回指与成员数组一致，段 5 的模板与成员都是段 1 记录。
- **M-1 字段来源表：** 73 行，原样 35、变换 18、项目身份 14、研究派生 6；明细（字段路径、类别、来源位置）在本地 JSON。三个 payload 的 72 种叶子路径，加上 1 种在所有项中均为空数组的路径（僚机的 `aiTargetCraftTypes`），都恰有一行；没有无行的叶子，也没有未出现的行。
  - **原样：** 参考比例、名称备用池、生成矩形、候选名称、位置、生成时刻、网格间距、8 个规则输入（源值 0 记为 null，不补默认值，语义未知）、编组 `spawnCount`。僚机的位置与网格间距须为 0。
  - **变换：** 种类比特到序号、AI 目标掩码到序号、声明去重与序号、来源标记合并、矩形/锚点/成员回指/AI 目标/模板/成员的指针到序号、编组布局（第 0 个元素交换 y/z）、`halfExtent`（扇区数 × 比例 ÷ 2）、机型集合。
  - **项目身份：** `campaign`、两个单位标签、Asset 引用、model Asset ID 与 kind，以及僚机按契约为 null 的放置、成员回指与 AI 目标。
  - **研究派生：** 地图两轴（高概率，U-032）与中心（已确认），阵营（已确认），基地交互（基地含义高概率，U-022）。
- **M-1 比较：** 任务 271、机型表 30、僚机名单 106 个叶子字段，差异都为 0。15 项计数与 3 个 payload 字节数都等于 [P2-09 AC-14 的记录](../../09/subtasks/12-local-base-check.md#完成证据)，独立读取的计数也与实际相等。
- **M-2 绑定：**
  - 6 个机型条目解析到 5 个 model Asset：`model/player-ship`（玩家与僚机两个种类共用）、`model/enemy-ship-1`、`model/enemy-ship-2`、`model/friendly-craft-1`、`model/base-1`。它们都是 `models` 组中的 `model`，角色符合命名规则；每个不同的 MODL 只有一个 Asset。
  - 每个 payload 的完整内容等于 SR.NOB 19 个 MODL 中恰好一个，即独立 M2ID 读取指定的那一个。比较的内容包括逐部件的标志字、颜色、是否带贴图、完整几何字节（位置、UV、法线、顶点与着色序号、着色槽数）以及声音槽是否为空；19 个 MODL 的内容两两不同。
  - 引用：15 个 TEX 与 15 个 image Asset 一一对应，尺寸与像素索引相同；13 个 SND 与 13 个 sound Asset 一一对应，采样率、单声道与帧数相同。`models` 组另有 1 个效果模型 `model/debris`，不属于机型绑定。
- **M-4 Core 载入：** 每次都从字节重新解码三个 logic Asset，调用纯 `loadMission` 两次。
  - 结果与独立预期逐字段比较 418 个叶子字段，差异为 0。覆盖玩家声明、编组与成员、生成区域、坐标与地图框架、机型/阵营/模型/基地交互和僚机选项。
  - 两次结果深度相等，是各自独立且深度冻结的对象。载入期间 `Math.random`、`Date.now`、`performance.now`、`crypto.getRandomValues` 都没有被调用；脚本只调用 `loadMission`，不推进 tick。
  - 摘要：9 个声明（玩家 1、友方 2、敌方 4、无 2）、3 个编组、5 个僚机选项、5 个模型。
- **可复现：** 连续两次运行均为 `PASS`，除日期外报告完全相同。
- **负向（临时改动一个独立读取的字段，均以退出码 1 报告）：**
  - 生成时刻改读 +0x20：任务 1 处差异，setup 1 处；
  - 规则输入 `percentA` 改读 +0x10：任务 3 处，setup 3 处；
  - M2ID 槽位加一：机型表 2 处，5 个绑定不一致，setup 6 处；
  - 交换敌友掩码：机型表 9 处，4 个绑定不一致，独立计数与实际不符，setup 17 处；
  - MESH 面交换第 1、2 个角：6 个绑定都找不到内容相同的 MODL。
- **隐私：** 输出只含计数、Asset ID、字段路径、结构条目 ID、哈希与判定。脚本自检读到的 28 个原版名称，均未出现在任何输出中。本证据不含字段值、坐标或名称。
- **Rubber-duck：** 2 个阻塞问题，均已修正并重跑上述全部命令。
  - M-2 原先只比较部件标志、颜色与几何计数：改为比较完整几何字节，并核对 TEX/SND 引用与 image/sound Asset 的对应。
  - 独立读取原先没有执行契约的“非默认即不支持”与 +0x54、段 6、僚机空间字段规则：改为逐项失败即关闭，并更新僚机位置与网格间距的来源说明。
- **未修改仓库代码：** 本地脚本不提交，不需要 simplify；脚本内只做了一处作用域内的命名清理。
- **文档影响：** 工程约定、指南与 `docs/original/` 都不需要更新。结果与 scenario、hud、mesh、executable 的既有记录一致，没有新的原版事实；U-022、U-023 状态不变。M-1、M-2 与 M-4 的 agent 部分判定为“一致”，供 24 回填。AC-19 的用户真实导入与刷新恢复确认在 21。
