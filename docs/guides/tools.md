---
type: guide
status: active
phase: all
updated: 2026-10-08
---

# 工具用法

`tools/` 下包含本地研究、任务路由与合规工具，直接用 Node 22 运行。研究脚本只输出结构信息，不输出原版文件内容；原版解析逻辑放在 `src/original-data/`，浏览器端和工具共用同一份代码。合规工具不读取原版来源，聚合命令会构建当前网站。

| 脚本 | 用途 | 用法 |
|---|---|---|
| `tools/nob-list.ts` | 列出 IMFAT（`.NOB`）封包目录：条目数、各类型数量与大小 | `node tools/nob-list.ts local/StarRang/SRANGERS/MAIN/*.NOB [--entries]` |
| `tools/nob-check.ts` | 用导入共用的源结构读取核对封包中全部 DATA、TEX、BITM、MFDD 记录、CCKD 字体表与分组元素、hud 记录的 TABL 图像列表、SNIP 帧与 DIAG 结构，并解析 M2ID、NEBC、MESH、MODL 与交叉引用；只输出计数、失败 code、图形、MESH、MODL 的观察最大值与容器计数（见[封包结构核对](#封包结构核对)） | `node tools/nob-check.ts local/StarRang/SRANGERS/MAIN/SR.NOB` |
| `tools/disc-check.ts` | 用 P2-02 的读取链按需读取本地 CloneCD 文件组，按 manifest 游戏文件表逐个解析路径，核对大小与分段流式计算的 SHA-256，并核对读取计量；只输出规范光盘路径、计数与结论 | `node tools/disc-check.ts local/StarRang/cd/STAR_RANGERS.{ccd,img,sub,cue} [--manifest docs/original/manifest.md]` |
| `tools/source-check.ts` | 用 P2-03 的读取链识别本地 CloneCD 文件组的版本（默认生产白名单），再打开每个覆盖范围内的 NOB 与两个通讯头像研究封包，逐条目读取校验；只输出规范光盘路径、版本 ID、指纹、计数与结论 | `node tools/source-check.ts local/StarRang/cd/STAR_RANGERS.{ccd,img,sub,cue}` |
| `tools/logic-check.ts` | 用与 Worker 相同的生产导入作业转换本地 CloneCD 文件组的 `logic` 组，再验证组、解码 payload 并在 Core 中载入任务；只输出结论、计数、限值对照、各阶段读取量与哈希（见[逻辑组核对](#逻辑组核对)） | `node tools/logic-check.ts local/StarRang/cd/STAR_RANGERS.{ccd,img,sub,cue}` |
| `tools/task-state.ts` | 只读任务的 spec/goal/subtasks，确定性地给出工作流图的下一节点（见 [Agent 任务工作流](../engineering/agent-workflow.md#自动编排)）；在 `execute-goal` 节点同时给出按依赖与写入范围计算的并行调度 `schedule`（见[并行执行](../engineering/agent-workflow.md#并行执行)）；`--mark-reviewed` 写入审阅标记 | `node tools/task-state.ts p1/03 [--json] [--mark-reviewed]` |
| `tools/compliance/cli.ts` | 本地完整文件hash/实际分发许可/声明指纹检查，严格非零失败与机读JSON | `pnpm check:original` / `pnpm check:licenses` / `pnpm check:compliance` |
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
  - SNIP 条目经导入共用的 `readSnipFrames` 校验结构与重定位，每帧都经 `decodeSnipFrame` 解码（颜色表在 EXE 中，这里用恒等表代替）；DIAG 条目经导入共用的 `readStatusMessages` 校验结构与重定位（下行格式在 EXE 中，这里用空格式代替）（P2-07 的 2026-10-08 修订）。
- **模型：** MESH 与 MODL 经导入共用的读取校验（MESH 失败位置为 `mesh`，MODL 为 `model`），再核对 MODL 部件的网格与贴图引用、音效槽引用都指向相应类型的条目。
- **其余：** M2ID、NEBC 的 ID 引用。
- **输出：** 每类条目的通过数与失败数，解码的图像记录数与核对过索引范围的记录数，MESH 顶点与三角形总数，按条目类型的观察最大值（图像宽高、调色板条目数、最大字体单元与见到的全部单元；通过的 MESH 的顶点数、三角形数与着色槽数；通过的 MODL 的部件合计、各列表部件数、颜色分量与见到的全部标志值），观察到的容器计数（CCKD 目录项与每 slot 元素的最大数、解码的元素数、读取的分组调色板数、两个元素标志取 0 与 1 的次数、MFDD 每列表与 TABL 每图像列表的最大记录数、其他 TABL 条目数及其中能按图像列表解析的数量；有 SNIP 时为每条目最大帧数与解码帧数，有 DIAG 时为最大启动消息数、读取的文字段数与最长文字的字节数），以及失败列表。失败只写条目 ID、类型与稳定 `code@结构位置`；ID 列表解析与交叉引用失败为固定文本（可含条目 ID），其他异常只写 `internal-error`。文件无法读取时只报告这一事实，封包不合法时报告 `code@位置`，都不输出宿主错误文本或路径。不输出像素、调色板值、字形、坐标、文字或其他条目内容。
- **退出码：** 没有失败时为 0；有任何失败、文件无法读取或封包不合法时为 1；缺少参数时为 1 并打印用法。
- 结果对照的观察最大值记录在 [textures §5](../original/formats/textures.md#5-observed-maxima-against-the-p2-05-limits-confirmed)、[hud §1](../original/formats/hud.md#1-bitmap-fonts-confirmed)、[mesh](../original/formats/mesh.md#observed-maxima-against-the-readers-limits-confirmed)、[cockpit §3](../original/formats/cockpit.md#3-observed-counts-against-the-p2-07-limits-confirmed)、[hud §2](../original/formats/hud.md#tabl-image-lists-confirmed-structure) 及其 [SNIP 10487](../original/formats/hud.md#snip-10487-confirmed-structure-p2-1227) 与 [DIAG 10489](../original/formats/hud.md#diag-10489-confirmed-structure-p2-07-revision) 两节。

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
  - 用 `decodeLogicPayload` 按描述符解码三个 payload，再用 Core 的 `loadMission` 载入；
  - 把规范数据的结构观测值与 P2-09 的限值对照。

  任何作业、验证、解码、载入或限值失败都结束核对。
- **输出：** stdout 为一份 `osr-logic-check`/1 JSON，包含：
  - `passed`；`error`（结束核对的首个失败，只含 code 与结构位置；Core 前提失败的 code 为 `core-input`）；
  - `identity`（版本 ID 与指纹）；
  - `group`：组状态、`ManifestIdentity`，以及每个 payload 的 Asset ID、角色、字节数与指纹；
  - `counts`：声明、名称备用池、生成矩形、编组、成员位置、布局元素、非 null 的放置矩形、锚点、成员回指与 AI 目标、僚机选项、机型条目与各阵营；
  - `limits`：各项观测值与限值；
  - `reads`：识别、图形、逻辑、音频与模型各阶段的读取增量（阶段最后一次进度减去该阶段开始时的读取量）与总读取量；失败时保留已发生的读取。

  不输出名称、坐标、字段值、宿主路径或宿主错误文本。测试可注入合成白名单（`runLogicCheck(paths, { catalog })`）。
- **退出码：** 通过时为 0，核对失败为 1，用法错误为 2。

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
