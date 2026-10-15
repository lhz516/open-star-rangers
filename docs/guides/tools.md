---
type: guide
status: active
phase: all
updated: 2026-10-15
---

# 工具用法

`tools/` 下包含本地研究、任务路由与合规工具，直接用 Node 22 运行；`tools/ghidra/` 的补丁脚本与 `tools/baseline/` 的运行时测量工具用 Python 3 标准库运行。研究脚本只输出结构信息，不输出原版文件内容；运行时测量的报告含读数，只写在被忽略的 `local/research/` 中，终端不显示。原版解析逻辑放在 `src/original-data/`，浏览器端和工具共用同一份代码。合规工具不读取原版来源，聚合命令会构建当前网站。

| 脚本 | 用途 | 用法 |
|---|---|---|
| `tools/nob-list.ts` | 列出 IMFAT（`.NOB`）封包目录：条目数、各类型数量与大小 | `node tools/nob-list.ts local/StarRang/SRANGERS/MAIN/*.NOB [--entries]` |
| `tools/nob-check.ts` | 用导入共用的源结构读取核对封包中全部 DATA、TEX、BITM、MFDD 记录、CCKD 字体表与分组元素、hud 记录的 TABL 图像列表、SNIP 帧与 DIAG 结构，解码全部 ANIM 帧，并解析 M2ID、NEBC、EXIC、EXPL、`CRAFT.NOB` 的 TABL 4003、MESH、MODL 与交叉引用；只输出计数、失败 code、图形、MESH、MODL 的观察最大值与容器计数（见[封包结构核对](#封包结构核对)） | `node tools/nob-check.ts local/StarRang/SRANGERS/MAIN/SR.NOB` |
| `tools/disc-check.ts` | 用 P2-02 的读取链按需读取本地 CloneCD 文件组，按 manifest 游戏文件表逐个解析路径，核对大小与分段流式计算的 SHA-256，并核对读取计量；只输出规范光盘路径、计数与结论 | `node tools/disc-check.ts local/StarRang/cd/STAR_RANGERS.{ccd,img,sub,cue} [--manifest docs/original/manifest.md]` |
| `tools/source-check.ts` | 用 P2-03 的读取链识别本地 CloneCD 文件组的版本（默认生产白名单），再打开每个覆盖范围内的 NOB 与两个通讯头像研究封包，逐条目读取校验；只输出规范光盘路径、版本 ID、指纹、计数与结论 | `node tools/source-check.ts local/StarRang/cd/STAR_RANGERS.{ccd,img,sub,cue}` |
| `tools/logic-check.ts` | 用与 Worker 相同的生产导入作业转换本地 CloneCD 文件组的 `logic` 组，再验证组、解码 payload 并在 Core 中载入任务；只输出结论、计数、限值对照、各阶段读取量与哈希（见[逻辑组核对](#逻辑组核对)） | `node tools/logic-check.ts local/StarRang/cd/STAR_RANGERS.{ccd,img,sub,cue}` |
| `tools/package-check.ts` | 用与 Worker 相同的生产导入作业转换本地 CloneCD 文件组，按切片定义验证整个包，用各角色的读取器解码 P3-03 新增与扩展角色的全部 Asset，并在 Core 中载入任务；只输出结论、Asset ID、计数、限值对照、各阶段读取量与哈希（见[包核对](#包核对)） | `node tools/package-check.ts local/StarRang/cd/STAR_RANGERS.{ccd,img,sub,cue}` |
| `tools/replay-check.ts` | 用与 Worker 相同的生产导入作业转换本地 CloneCD 文件组并验证整包，在 Node 中重放开发构建导出的录制并与其结果比较；只输出固定形状的报告（错误码与结构位置、内容身份键、任务 Asset ID、setupHash、计数与 Core 的比较）（见[录制重放核对](#录制重放核对)） | `node tools/replay-check.ts <录制.json> local/StarRang/cd/STAR_RANGERS.{ccd,img,sub,cue}` |
| `tools/task-state.ts` | 只读任务的 spec/goal/subtasks，确定性地给出工作流图的下一节点（见 [Agent 任务工作流](../engineering/agent-workflow.md#自动编排)）；在 `execute-goal` 节点同时给出按依赖与写入范围计算的并行调度 `schedule`（见[并行执行](../engineering/agent-workflow.md#并行执行)）；`--mark-reviewed` 写入审阅标记 | `node tools/task-state.ts p1/03 [--json] [--mark-reviewed]` |
| `tools/compliance/cli.ts` | 本地完整文件hash/实际分发许可/声明指纹检查，严格非零失败与机读JSON | `pnpm check:original` / `pnpm check:licenses` / `pnpm check:compliance` |
| `tools/baseline/measure.py` | 在私有副本中运行原版，在 DOSBox-X 调试器暂停点读取配方声明的字段、施加配方声明的模拟器内输入，写出带合格性、刺激记录、文件保护与回收结果的报告（见[运行时测量](#运行时测量)） | `python3 -B tools/baseline/measure.py baseline-version`；`python3 -B tools/baseline/measure.py run --recipe <配方> --out local/research/<任务>/<主题> --run-id <id> [--smoke] [--evidence local/research/<任务>/<主题>]` |
| `tools/ghidra/patch-watcom-cspec.py` | 给 Ghidra 加入 Watcom 调用约定 | 见 [baseline-environment](./baseline-environment.md#静态分析) |
| `tools/ghidra/DecompileAll.java` | 反编译全部函数到一个文件 | `-postScript DecompileAll.java <输出文件>` |
| `tools/ghidra/DumpCallers.java` | 反编译某个函数的全部调用者 | `-postScript DumpCallers.java <输出文件> <函数地址>` |
| `tools/ghidra/DumpAt.java` | 在指定地址补建函数，并反编译它及其调用的函数 | `-postScript DumpAt.java <输出文件> <深度> <地址>...` |
| `tools/ghidra/DumpFromStrings.java` | 从字符串出发找到引用它的函数并反编译 | `-postScript DumpFromStrings.java <输出文件> <深度> <字符串>...` |
| `tools/ghidra/ReadTable.java` | 按固定步长打印内存中的表格及其指向的字符串 | `-postScript ReadTable.java <起始地址> <数量或数量所在地址> <步长>` |

Ghidra 脚本通过 `ghidra-headless ... -scriptPath tools/ghidra -postScript <脚本> <参数>` 运行；输出文件必须放在 `local/` 下。

## 封包结构核对

`tools/nob-check.ts` 在内存中解析一个 IMFAT 封包，用与导入相同的代码核对其结构（[P2-05](../plan/p2/05/spec.md) 的图形源结构读取见[源码结构](../engineering/modules/original-data.md#图形转换)，[P2-06](../plan/p2/06/spec.md) 的 MESH 与 MODL 读取见[原版格式转换](../engineering/modules/original-data.md#原版格式转换)）。

- **图形：**
  - DATA 须为 768 字节且分量不大于 63；
  - TEX 与 BITM 的整条目图像记录、MFDD 两个列表中的全部记录（每个列表至多 16 个）都经头部校验并解码；有嵌入调色板时，再核对每个不透明像素的索引都小于条目数；
  - CCKD 的字体目录须恰为 3 项，每个字体表都经读取校验；分组目录（[P2-07](../plan/p2/07/spec.md)）须为 1–8 项，每个 slot 0–16 个元素、元素的两个标志只取 0 或 1，全部元素的图像记录同样解码；目录项 +0x04 非零的分组调色板都经导入共用的读取校验（+0x08 须为 768、768 字节按 DATA 规则）；
  - [hud §2](../original/formats/hud.md#tabl-image-lists-confirmed-structure) 记录为图像列表的 TABL 条目（按条目 ID 列出，只属于 `SR.NOB`）须符合该结构，全部记录解码。封包只要含其中任一 ID，就必须以 TABL 类型含全部这些条目，否则为失败；判断与文件名无关。其他 TABL 条目不检查，只统计其中有多少能按图像列表解析，预期为 0；
  - SNIP 条目经导入共用的 `readSnipFrames` 校验结构与重定位，每帧都经 `decodeSnipFrame` 解码（颜色表在 EXE 中，这里用恒等表代替）；DIAG 条目经导入共用的 `readStatusMessages` 校验结构与重定位（下行格式在 EXE 中，这里用空格式代替）（P2-07 的 2026-10-08 修订）；
  - ANIM 条目经导入共用的 `readAnimationFrames` 校验整个结构，每帧再经生产解码 `decodeAnimationFrame` 解码；解码要求每帧恰好用尽其数据（[textures §6](../original/formats/textures.md#6-anim-explosion-animations-confirmed)，[P3-03](../plan/p3/03/spec.md)）。
- **模型：** MESH 与 MODL 经导入共用的读取校验（MESH 失败位置为 `mesh`，MODL 为 `model`），再核对 MODL 部件的网格与贴图引用、音效槽引用都指向相应类型的条目。
- **爆炸与机型表（P3-03）：** EXIC 经导入共用的 `parseExplosionLists` 解析，三张列表的每个 ID 都须是 EXPL 条目；EXPL 经 `parseExplosionRecord` 解析，+0 须是 SND 条目、+4 须是 ANIM 条目（[textures §7](../original/formats/textures.md#7-expl-explosion-records-confirmed)）。TABL 4003 的 ID 只属于 `CRAFT.NOB`：封包含该 ID 时必须是 TABL 条目，否则为失败；其 18 × 3 个单元都经导入共用的 `parseCraftTable` 解析，每个单元的条目 ID 都须是 CINF 条目（[craft §2](../original/formats/craft.md#2-tabl-4003-confirmed)）。其余新增解析器（CINF、DEBRIS、AISTUFF、COMM、TABL 10165 与 10399、RENS 头部、EXE 区域）带有切片专用的失败关闭规则，只经[包核对](#包核对)在切片条目上运行，不在这里逐条目运行。
- **其余：** M2ID、NEBC 的 ID 引用。
- **输出：** 每类条目的通过数与失败数，解码的图像记录数与核对过索引范围的记录数，MESH 顶点与三角形总数，按条目类型的观察最大值（图像宽高、调色板条目数、最大字体单元与见到的全部单元；通过的 MESH 的顶点数、三角形数与着色槽数；通过的 MODL 的部件合计、各列表部件数、颜色分量与见到的全部标志值），观察到的容器计数（CCKD 目录项与每 slot 元素的最大数、解码的元素数、读取的分组调色板数、两个元素标志取 0 与 1 的次数、MFDD 每列表与 TABL 每图像列表的最大记录数、其他 TABL 条目数及其中能按图像列表解析的数量；有 SNIP 时为每条目最大帧数与解码帧数，有 DIAG 时为最大启动消息数、读取的文字段数与最长文字的字节数；有 ANIM 时为每条目最大帧数、解码帧数、最大帧数据字节数、像素数及其中不透明的像素数，有 EXIC 时为列表数、EXPL 引用数及其不同 ID 数，有 EXPL 时为引用的不同 ANIM 与 SND 数，有 TABL 4003 时为核对的单元数与引用的不同 CINF 数），以及失败列表。ANIM 的帧计数与图像宽高只取自全部帧都通过的条目。失败只写条目 ID、类型与稳定 `code@结构位置`；ID 列表解析与交叉引用失败为固定文本（可含条目 ID），其他异常只写 `internal-error`。文件无法读取时只报告这一事实，封包不合法时报告 `code@位置`，都不输出宿主错误文本或路径。不输出像素、调色板值、字形、坐标、文字或其他条目内容。
- **退出码：** 没有失败时为 0；有任何失败、文件无法读取或封包不合法时为 1；缺少参数时为 1 并打印用法。
- 结果对照的观察最大值记录在 [textures §5](../original/formats/textures.md#5-observed-maxima-against-the-p2-05-limits-confirmed)、[textures §6](../original/formats/textures.md#6-anim-explosion-animations-confirmed)、[hud §1](../original/formats/hud.md#1-bitmap-fonts-confirmed)、[mesh](../original/formats/mesh.md#observed-maxima-against-the-readers-limits-confirmed)、[cockpit §3](../original/formats/cockpit.md#3-observed-counts-against-the-p2-07-limits-confirmed)、[hud §2](../original/formats/hud.md#tabl-image-lists-confirmed-structure) 及其 [SNIP 10487](../original/formats/hud.md#snip-10487-confirmed-structure-p2-1227) 与 [DIAG 10489](../original/formats/hud.md#diag-10489-confirmed-structure-p2-07-revision) 两节。

## 光盘镜像核对

`tools/disc-check.ts` 读取开发者本地的基准镜像，验证整条光盘读取链（[P2-02](../plan/p2/02/spec.md)）。

- **输入：** 输入是 CloneCD 文件组的各个文件，`.ccd` 与 `.img` 必需，同主名的 `.sub`/`.cue` 可以给出，但从不读取。manifest 默认为 [docs/original/manifest.md](../original/manifest.md)。文件经 [node-byte-source.ts](../../tools/node-byte-source.ts) 以只读句柄定位读取：短读会续读，提前 EOF 或 I/O 失败即拒绝。
- **核对内容：**
  - 对 manifest 游戏文件表的每一行，按光盘路径打开文件，比较大小，并以不超过 16 MiB 的分段读取计算 SHA-256；
  - 读取方计量的 `sourceReadBytes` 必须等于端口实际收到的请求之和；
  - `.sub`/`.cue` 读取须为 0 字节。
- **输出：** stdout 为一份 `osr-disc-check`/1 JSON：`passed`、`error`（结束核对的首个失败）、`closeFailures`（关闭失败的句柄数，不会被先前错误掩盖）、卷信息、文件计数与不一致项（只含规范光盘路径与稳定 code），以及读取计量。不输出宿主路径、文件内容或宿主错误文本。
- **退出码：** 全部一致时为 0；核对失败或输入错误时为 1，例如文件组不受支持、文件无法打开或关闭（`read-failed`）、取消（Ctrl-C 中止读取）、manifest 不可读或含非规范路径；用法错误时为 2。
- **句柄：** 任何情况下都会关闭已打开的句柄；关闭失败同样判为失败。
- **原版内容：** 命令只读取 `local/`，不写出任何文件。若需要保存结果，只能放在 `local/` 下。

## 来源核对

`tools/source-check.ts` 在开发者本地的基准镜像上，验证版本识别与封包读取（[P2-03](../plan/p2/03/spec.md)）。它只用于本地原版数据，输出与结果只能留在 `local/` 下。

- **输入：** 与光盘镜像核对相同，是 CloneCD 文件组的各个文件，经 [node-byte-source.ts](../../tools/node-byte-source.ts) 只读打开。
- **核对内容：**
  - 经产品入口 `openVerifiedSource` 打开镜像并用生产白名单识别版本；
  - 经已验证来源打开每个覆盖范围内的 `.NOB`，读取并校验全部条目；
  - 再用同一组输入另开一个底层镜像句柄，以同样方式检查不在白名单中的研究封包 `MAIN/COMMFACE.NOB` 与 `MAIN/COMMFAC2.NOB`；`reads.sourceReadBytes` 是各句柄用量之和，失败时只计入已取得句柄的用量；
  - 任何识别、封包或条目失败都结束核对。
- **输出：** stdout 为一份 `osr-source-check`/1 JSON，包含：
  - `passed`；`error`（结束核对的首个失败，只含 code 与位置）；`closeFailures`；
  - `identity`（版本 ID、指纹、覆盖文件数）；
  - 每个封包的规范路径、`coverage`（`verified` 或 `research`）、条目数、按类型的计数、已读取并通过的条目数、最大数据块与最大重定位个数；
  - `reads.sourceReadBytes`。

  不输出宿主路径、文件内容或宿主错误文本。
- **退出码：** 通过时为 0；识别、封包、输入或关闭失败以及取消（Ctrl-C）时为 1；用法错误为 2。
- **句柄：** 任何情况下都会关闭已打开的句柄；关闭失败单独计数，并使核对失败。

## 逻辑组核对

`tools/logic-check.ts` 在开发者本地的基准镜像上，验证所选任务的 `logic` 组转换与 Core 载入（[P2-09](../plan/p2/09/spec.md) 的 S-14、AC-14）。它只用于本地原版数据，输出与结果只能留在 `local/` 下（例如 `local/research/p2-09/`）。

- **输入：** CloneCD 文件组的各个文件，经 Node 的 `fs.openAsBlob` 打开为 `Blob`。`Blob` 没有关闭方法，文件描述符随其回收或进程退出释放，因此核对按一次性进程运行。
- **核对内容：**
  - 用 [import-job.ts](../../src/workers/import-job.ts) 的 `createImportJob()` 运行与 Worker 相同的生产作业：产品入口识别（默认生产白名单）与图形、逻辑、音频、模型各转换阶段（任一阶段失败都结束核对），并记录进度、身份与发送的组；
  - 对 `logic` 组运行 `validateGroup`，不完整时报告首个诊断，不读取未经验证的清单字段；
  - 用 `decodeLogicPayload` 按描述符解码任务、机型表与僚机名册三个 payload，再用 Core 的 `loadMission` 载入；P3-03 的 6 个规则数据 payload 用 `decodeRuleDataPayload` 按描述符核对，不交给 Core；
  - 把规范数据的结构观测值与 P2-09 的限值对照。

  任何作业、验证、解码、载入或限值失败都结束核对。
- **输出：** stdout 为一份 `osr-logic-check`/1 JSON，包含：
  - `passed`；`error`（结束核对的首个失败，只含 code 与结构位置；Core 前提失败的 code 为 `core-input`）；
  - `identity`（版本 ID 与指纹）；
  - `group`：组状态、`ManifestIdentity`，以及每个 payload 的 Asset ID、角色、字节数与指纹；
  - `counts`：声明、名称备用池、生成矩形、编组、成员位置、布局元素、非 null 的放置矩形、锚点、成员回指与 AI 目标、非 null 的事件触发引用、事件触发、区间、消息与消息字节总数（P3-03 的段 2），僚机选项、机型条目与各阵营；
  - `limits`：各项观测值与限值，含事件触发数、每触发的区间数、每区间的消息数与每条消息的字节数；`payloadBytes` 只计量任务、机型表与僚机名册三个 payload；
  - `reads`：识别、图形、逻辑、音频与模型各阶段的读取增量（阶段最后一次进度减去该阶段开始时的读取量）与总读取量；失败时保留已发生的读取。

  不输出名称、坐标、字段值、宿主路径或宿主错误文本。测试可注入合成白名单（`runLogicCheck(paths, { catalog })`）。
- **退出码：** 通过时为 0，核对失败为 1，用法错误为 2。

## 包核对

`tools/package-check.ts` 在开发者本地的基准镜像上，验证 P3-03 完整生产包的转换、完整性与解码（[P3-03](../plan/p3/03/spec.md) 的 S-16、AC-19）。它只用于本地原版数据，输出与结果只能留在 `local/` 下（例如 `local/research/p3-03/local-check/`）。

- **输入：** 与[逻辑组核对](#逻辑组核对)相同，CloneCD 文件组的各个文件经 `fs.openAsBlob` 打开，核对按一次性进程运行。
- **核对内容：**
  - 用 [import-job.ts](../../src/workers/import-job.ts) 的 `createImportJob()` 运行与 Worker 相同的生产作业（默认生产白名单），收集发送的四个组；
  - 对四组运行 `validatePackage`，不是 `complete` 时报告首个诊断；
  - 用 `decodeLogicPayload` 解码任务、机型表与僚机名册，并用 Core 的 `loadMission` 载入任务；
  - 用各角色的读取器解码 P3-03 新增角色的每个 Asset：规则数据（`decodeRuleDataPayload`）、飞行数据（`decodeFlightDataPayload`）、视角标签、HUD 文字、图像（受击闪烁、爆炸帧、星云、目标显示屏背景及其调色板）与 sound payload（只接受 schema 2）；
  - 把结构观测值与各读取器的限值对照，并把包的用量（除来源读取外的十一个预算维度）与 `PRODUCTION_PACKAGE.limits` 对照。

  任何作业、验证、解码、载入或限值失败都结束核对。
- **输出：** stdout 为一份 `osr-package-check`/1 JSON，包含：
  - `passed`；`error`（结束核对的首个失败，只含 code 与结构位置；Core 前提失败的 code 为 `core-input`）；
  - `identity`（版本 ID 与指纹）；
  - `package`：状态、切片定义版本、转换器版本、`ManifestIdentity`，以及每组的 Asset 数、依赖边数、payload 字节与摘要；
  - `roles`：扩展的 `mission` 与 P3-03 新增的各角色（含依赖闭包中的 `explosion-animation`、`explosion-frame` 与 `nebula-background`），各自的组、Asset 数、payload 字节、摘要，以及记录、帧、文字、声音与像素的计数；
  - `limits`：各项观测值与限值，名称为 `<角色>.<结构>` 或 `package.<预算维度>`；
  - `reads`：与逻辑组核对相同的各阶段读取增量与总读取量；失败时保留已发生的读取。

  摘要为 `sha256:`，按 Asset ID 顺序覆盖每个 Asset 的 `<Asset ID> <payload 指纹>` 行。不输出名称、文字、字段值、像素、采样、宿主路径或宿主错误文本。测试可注入合成白名单（`runPackageCheck(paths, { catalog })`）。
- **退出码：** 通过时为 0，核对失败为 1，用法错误为 2。

## 录制重放核对

`tools/replay-check.ts` 在 Node 中核对开发构建导出的录制（[P3-04](../plan/p3/04/spec.md#replay-核对工具) 的 S-08、AC-16）：用同一 CloneCD 文件组得到内容，以 Core 的 `replayRecord` 在新世界中重放录制，再用 `compareReplayResults` 与录制中的结果逐项比较。录制来自开发服务器任务画面的诊断面板（[本地导入指南](./local-import.md#开始任务)、[工程约定](../engineering/README.md#开发诊断与录制导出)），文件名为 `osr-recording-<setupHash>-<种子>-<finalTick>.json`。用真实内容导出的录制含有派生的运行状态，录制与报告只放在 `local/` 下（例如 `local/research/p3-04/`）。

- **用法：** `node tools/replay-check.ts <录制.json> <file.ccd> <file.img> [<file.sub>] [<file.cue>]`。参数少于两个或以 `-` 开头（如 `--help`）时为用法错误，在 stderr 打印用法与上限推导。CLI 始终使用生产导入作业与生产来源白名单，不接受合成光盘，也没有切换白名单的参数；Node 测试与 E2E 调用可导出的 `runReplayCheck(录制路径, 光盘路径, { catalog } 或 { job })` 注入合成白名单或导入作业，从不按录制选择白名单。`exitCode(report)` 给出与 CLI 相同的退出码。
- **读取录制：** 先以同一个只读句柄 fstat，非普通文件不读（FIFO 以非阻塞方式打开，不等待写入者），大小超过上限为 `file-too-large`，不读取任何字节；之后至多读入“大小 + 1”字节，读取前后的大小、修改时间或状态变更时间（纳秒）任一不同即拒绝（`recording.changed`）。不会先无界读取或解析，也从不改写录制文件。
- **文件上限：** `RECORDING_MAX_BYTES` 为 427,820,671 字节，是任何 Core 接受、内容身份为生产导入作业形状的录制经 `JSON.stringify` 后 UTF-8 字节数的上界（`recordingSizeBound()` 给出推导，测试把常量钉在推导上，Core 容量或格式变化时须同时更新本节）：

  | 部分 | 计数 | 每项字节 | 小计 |
  |---|---|---|---|
  | 信封：记录头、空列表与结果的 finalTick | 1 | 1,621 | 1,621 |
  | tick 输入 | 131,072（`recordedTicks`） | 124 | 16,252,928 |
  | 命令 | 262,144（`recordedCommands`） | 107 | 28,049,408 |
  | 事件 | 524,288（`recordedEvents`） | 721 | 378,011,648 |
  | 检查点 | 131,073（`recordedCheckpoints`） | 42 | 5,505,066 |
  | 合计 | | | 427,820,671 |

  每项取最长的条目加一个分隔符，计数即 `CORE_LIMITS` 的录制容量。最长取值：有限数字 25 个字符（符号、`0.`、5 个零与 17 位有效数字），安全整数 16 位，tick 6 位，`producer` 的每个 UTF-16 码元 6 字节（`\u` 转义），任务为最长的 Asset ID，内容身份为生产转换器版本与 SHA-256 的 manifest、来源指纹；命令与事件取全部变体中最长的（新增变体不加样本就不能编译）；最长的事件是 P3-07 的 `hit`（[CR-06](../plan/p3/02/spec.md#cr-06-领域事件与次序d-01)），各字段取 Core 比较器接受的最长形式（i32 取 −2³¹，可空的索引取安全整数或 null 中较长者）。注入其他导入作业时，作业须与生产作业同样转换，否则这一身份假设不成立。上限低于 V8 的最长字符串。
- **核对顺序：** 读取 → UTF-8 与 JSON 解析，顶层恰为 `{ record, result }` → 以 Core 的公开入口先验证整份记录，再验证期望结果 → 用 [import-job.ts](../../src/workers/import-job.ts) 的生产作业转换整个文件组（与[包核对](#包核对)共用 `importPackage`），保留全部组并 `validatePackage` → 内容身份取自整包验证结果，不从录制构造；解码逻辑组中唯一的任务，按任务引用的 Asset ID 解码机型表与僚机名单，并以 `decodeRuleDataPayload` 解码同组唯一的 craft-info（[P3-06](../plan/p3/06/spec.md#对-p3-02-契约的增量) D-01），再以任务所有者的 [mission-input.ts](../../src/app/resources/mission-input.ts)（`ruleDataInputs`、`runModelInputs`）解码规则数据输入，并按 Core 的 `instantiableModelIds` 为记录中的运行配置解码可实例化机体的模型（[P3-07 CR-01](../plan/p3/02/spec.md#cr-01-世界创建输入与静态规则数据d-01)）；Core 拒绝该运行配置时不解码模型，由重放在记录或内容路径上报告 → `replayRecord` → `compareReplayResults`。版本、规则版本、内容身份、任务或 setupHash 不符都拒绝，不改写记录、忽略差异或选择兼容规则。录制中的运行配置（难度、僚机、种子、步长）只在世界创建时结合内容校验，所以这类错误在导入之后才报告。
- **输出：** stdout 为一份报告 `{ format: 'osr-replay-check', version: 1, passed, error, identity, mission, setupHash, finalTick, events, checkpoints, comparison }`，每次都有全部字段：
  - `error` 为 `{ code, location }` 或 null；`passed` 只在 `comparison.match` 为 true 时为 true；
  - `mission` 与 `setupHash` 在记录通过验证后填入，`finalTick`、`events`、`checkpoints` 在期望结果通过验证后填入，`identity`（`contentIdentityKey`）在整包验证后填入，`comparison` 为 Core 的 `ReplayComparison`（不一致时含首个差异的 tick 与类别）；提前失败而尚未取得的字段为 null，不以 0 或虚构身份代替。

  报告不含名称、坐标、原始事件、宿主路径或异常原文。
- **错误码与位置：** 封闭集合，`location` 为固定阶段或经约束的结构路径：

  | 错误码 | 位置 | 含义 |
  |---|---|---|
  | `usage` | `argv` | 参数不对 |
  | `read-failed` | `recording`、`recording.changed`、`disc[i]`、`disc` | 录制无法读取、不是普通文件或读取中变化；第 i 个光盘文件无法打开；光盘读取失败 |
  | `file-too-large` | `recording` | 录制超过上限 |
  | `invalid-recording` | `recording.json`、`recording`、`record…`、`result…` | 不是 UTF-8 JSON、顶层形状不对，记录或期望结果不合 Core 的格式与上限；也包括世界创建结合内容才拒绝的 `record.run…` |
  | `content-failed` | 导入阶段名（如 `identify-source`）、首个整包诊断路径（如 `groups[3].roles.warp-sound`）、`content…` | 文件组无法识别或转换（包括合成光盘遇到生产白名单）、包不完整、逻辑 Asset 或 craft-info 不能解码（规则数据输入与模型的解码错误位于 `content.<组>[<Asset ID>]…`） |
  | `replay-failed` | `record.content`、`record.mission`、`record.setupHash`、`record.ticks[k]` 等记录路径，或 `replay` | 记录与内容不符（身份、任务或 setupHash），或重放中 Core 故障 |
  | `replay-mismatch` | `comparison` | 重放结果与录制中的结果不一致 |
  | `internal-error` | 所在阶段（`recording`、`record`、`result`、`import`、`content`、`replay`、`comparison`） | 意外异常；不输出其原文 |
- **退出码：** 核对通过为 0，核对失败为 1，用法错误为 2。
- **证据：** Node 测试（[replay-check.test.ts](../../tools/replay-check.test.ts)）用合成任务场景覆盖通过、limit 与 limit+1、读取中变化、各类坏输入、不符与分歧，以及 CLI 的用法、I/O 与未知来源；开发构建下载的合成录制在 E2E 中经 `runReplayCheck` 核对（[P3-04/10](../plan/p3/04/subtasks/10-e2e-mission-flow.md#完成证据)）。CLI 用真实内容的成功路径见 [P3-04/14](../plan/p3/04/subtasks/14-real-content-comparison.md#ac-17私有真实内容实验) 的 AC-17：本地导入的真实内容带与不带僚机各导出一份录制，两份都以生产 CLI 与同一 CloneCD 文件组核对通过（退出码 0）。

## 运行时测量

`tools/baseline/measure.py` 在开发者本地的基准环境中运行原版并读取运行时字段（[P3-01](../plan/p3/01/spec.md#运行时测量) 的 S-05）。配方、操作者协议、读数的合格条件、计时、原版文件保护与证据存放见[运行时测量指南](./runtime-measurement.md)，这里只列要点。

- **输入：** `baseline-version` 读取 [manifest](../original/manifest.md) 与基准 EXE，打印配方 `source` 所需的基准版本记号与 EXE 指纹。`run` 读取 `local/` 中的 JSON 配方（`schemaVersion: 1`），在 `--out` 下的新运行目录中建立私有副本与私有配置，启动自有的 DOSBox-X 调试器会话，在暂停点读取配方声明的字段（LE 对象位置，或断点处寄存器值加偏移，均可带指针链；或线性页 0 中的 `low` 地址，不带指针；或较早暂停点的整数读数加偏移，即 `bound` 绑定读数）；断点暂停点可给出 2–4 个备选位置（`offsets`，`stop.json` 记录命中的 `hitOffset`），并可带寄存器停止条件（`when`，值为常数、较早暂停点的读数或较早断点暂停点的寄存器值，可用 `at` 只限定部分备选位置；`bound` 同样可以基于后者）：不满足条件的命中不是暂停点，工具不等确认、直接继续，并记为 `skippedHits`（见[备选位置、停止条件与绑定读数](./runtime-measurement.md#备选位置停止条件与绑定读数)）；暂停点之间由操作者游玩，或由配方的刺激在模拟器内提供游戏输入（BIOS 键盘缓冲中的一个键、BIOS 换档标志位、声明的输入设备字段，每次写入都回读并记录；刺激可带条件 `if`，只在本次运行同一暂停点或较早暂停点的整数读数等于给定值时施加，否则记为 `not-selected`，用于按启动布局选择分支（见[条件刺激](./runtime-measurement.md#条件刺激)）；见[模拟器内输入](./runtime-measurement.md#模拟器内输入)），读字段的暂停点以运行目录中的应答文件确认。不经宿主注入输入。`--smoke` 自动确认各暂停点、不需要操作者，须配合停止点无需操作者即可到达的专门烟测配方；它的报告不是测量证据。
- **输出：** 报告、调试器日志与证明文件都写在 `local/research/` 下的新运行目录中，不覆盖已有文件。运行期间 `local/research/` 的既有文件不得改变；其他会话同时在别处写入时，`--evidence` 把这一检查缩小到包含运行目录的主题目录（保证随之变窄，`local/StarRang/` 的保护不变）。终端只有阶段、原因码、计数与相对路径，不输出读数、原版内容或私人绝对路径。
- **退出码：** `complete` 为 0；失败为 1；运行前拒绝为 2（什么也不写）；取消为 3。
- **测试：** `python3 -B -m unittest discover -s tools/baseline -p 'test_*.py'`，不属于 `pnpm check`；测试只用合成数据与临时目录，不读取 `local/` 或原版文件。

## 本地合规

运行方法、声明文件与JSON字段/counts在[工程约定](../engineering/README.md#构建许可声明)维护。聚合先build再两个检查；独立命令只查当前状态，不自动安装、更新锁或重建。stdout为`osr-local-compliance`/1，失败passed=false且非零；未知/缺输入不能当空集合通过。机读调用可加pnpm的`--silent`，持久报告只放ignored的`test-results/compliance/`，不要把报告当网站资源。

- **完整文件扫描：** Git NUL枚举tracked worktree、实际暂存blob与未忽略untracked，dist递归全部普通文件（含map/声明/inventory）。暂存与工作树分别检测；不扫描Git历史、不读取ignored未跟踪或local路径，tracked local、symlink、越界、缺文件与空dist拒绝。命中与改名/扩展名无关。
- **黑名单边界：** 唯一事实源为[manifest](../original/manifest.md)。其镜像/游戏表之外未记录hash的文件仍不覆盖；完整SHA256也不识别片段、修改、压缩/解码/转换内容或截图。禁止自动到local补hash；必须人工审阅源文件/来源/完整产物，不能当版权或法律检测器。
- **许可证：** 精确锁/安装/peer实例及当前platform optional范围由pnpm核对；未安装optional只明确排除，不冒称许可已扫描。实际module/generated helper、map附带source和复制资产决定分发，dev标签不豁免；public文件需声明来源，未知或义务不明确失败。
- **义务与更新：** Root MIT只授予自有代码/文档/合成资源；第三方完整LICENSE/COPYRIGHT/NOTICE另行保留。OR记录允许分支、AND满足全部；网站GPL/AGPL不允许，LGPL无具体独立加载/替换/源码/声明证明不能通过，MPL等本地已知包不自动获得网站许可。依赖/lock/原文/源输入/产物变化或新增资产后需fresh build，不使用旧inventory冒称通过。
- **公开与后续：** 本地检查不证明严格clean-room，不代替名称/来源、片段审阅、法律审核或负责人首次公开确认。[许可政策](../decisions/ADR-0008-mit-and-dependency-licenses.md)不变；后续P5才接CI/发布门禁与部署，这些命令不上传、发布或执行云操作。

`DumpAt` 与 `DumpFromStrings` 共用同目录下的 `FunctionTraversal.java`（按深度遍历被调用函数），复制脚本时也需带上它。反编译脚本只请求 C 文本，不生成未使用的语法树；结束后释放反编译器与输出文件。

编译器规范补丁按 XML 结构修改，不依赖原文件的缩进和换行；验证命令：`python3 -B -m unittest discover -s tools/ghidra -p 'test_*.py'`。

新增脚本时，在本表补充一行。
