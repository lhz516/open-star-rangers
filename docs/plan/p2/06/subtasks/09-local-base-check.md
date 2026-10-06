---
type: plan
status: active
phase: P2
task: "06"
subtask: "09"
updated: 2026-10-06
---

# 09 — 本地基准核对（生产路径）

**契约来源：** [spec](../spec.md) 的 S-12（本地基准路线）；AC-11。
**依赖：** 07。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 在开发者机器上用本地基准镜像 `local/StarRang/cd/STAR_RANGERS.{ccd,img,sub,cue}`，编写并运行被忽略的本地脚本 `local/research/p2-06/base-check.ts`，沿用 P2-05/10 与 P2-08/12 的做法：
  - **直接调用：** 经产品入口打开已验证来源，按生产输入直接调用模型步骤：
    - 得到全部生产模型，机型模型的 ID 与 P2-09 绑定一致；
    - 每个模型的几何、部件与音效引用，与用 02 读取函数独立做的参考读取逐项结构等价：顶点、三角形、着色槽逐项相同，浮点逐位相同；
    - 两次运行每个 payload 的 SHA-256 相同；
    - 用量不超过图形追加份额与模型份额。
  - **作业路径：** 用与 Worker 相同的作业、宿主与持有者模块（Node `MessageChannel`）处理同一镜像：
    - 作业以 `finished` 结束，`models` 组被接收方验证，结果为 `group-complete`；
    - 或为 `incomplete`，且每条诊断都对应 AC-13（弹丸、导弹、碎片的角色基数）或 AC-14（歧义贴图的 `source-not-ready`）中记录的阻塞；
    - `logic` 与 `audio` 组仍为 `group-complete`，三组身份相同。
  - 复跑 [logic-check.ts](../../../../../tools/logic-check.ts)，确认逻辑组核对不受新阶段影响。
- 脚本与输出留在被忽略的 `local/research/p2-06/`。证据只记录命令、计数、判定、诊断 code 与读取量，不含原版内容、哈希值、输入名或私人绝对路径。
- 若暴露实现缺陷，在相应子任务修复或新增修复子任务，不在本子任务改代码。

## 不包含

- 研究与生产常量的追加（11、12）；它们改变结果时，在各自的子任务中复跑本脚本。
- 视觉保真判定（P2-12）。

## 关键文件与契约

- 本地新增 `local/research/p2-06/base-check.ts`（被忽略）。
- 复用 [open-verified-source.ts](../../../../../src/original-data/source/open-verified-source.ts) 的产品入口、05/06 的模型步骤与生产输入、07 的作业、[import-host.ts](../../../../../src/workers/import-host.ts)、[import-job-owner.ts](../../../../../src/app/import/import-job-owner.ts)。
- 前提：本地基准镜像存在（2026-10-05 已确认）；缺少时本子任务为 blocked。

## 验收标准

- [x] AC-11：直接调用得到全部生产模型，ID 与 P2-09 绑定一致；逐项结构等价；两次运行 SHA-256 相同；用量不超过份额。
- [x] AC-11：作业路径以 `finished` 结束；`models` 组为 `group-complete`，或为 `incomplete` 且每条诊断都对应 AC-13、AC-14 记录的阻塞。
- [x] `logic` 与 `audio` 组仍为 `group-complete`，三组身份相同；logic-check 通过。
- [x] 证据只含命令、计数、判定与诊断 code。

## 验证方法

- 本地 Node 脚本；结果写入被忽略目录，完成证据摘录计数与判定。
- 不适用 browser-testing；不提交原版内容或脚本输出。

## 完成证据

- **命令（2026-10-06）：** `node local/research/p2-06/base-check.ts local/StarRang/cd/STAR_RANGERS.{ccd,img,sub,cue}`，退出码 0，`passed: true`。
  - 脚本与输出 `base-check.json` 都在被忽略的 `local/research/p2-06/`。
  - 脚本用 `fs.openAsBlob` 打开文件组，作业路径沿用 P2-08/12 的 `MessageChannel` 接线。
  - 输出只含计数、判定、诊断 code、用量与读取量，没有哈希值、原版字节、输入名或宿主路径；作业失败时只输出错误层与 code。
- **直接调用（AC-11 第一部分）：** 两次运行各自经产品入口 `openVerifiedSource` 打开新的已验证来源，依次运行图形步骤、P2-09 生产逻辑步骤（取得绑定）和模型步骤。模型步骤用 06 的生产声明、映射与引用表，限值与作业相同（输入字节加图形、逻辑、模型份额）。
  - **ID：** 绑定 5 个，模型 Asset 5 个，ID 与 P2-09 绑定逐一相同；每个映射的 MODL 条目等于绑定的 `modelEntryId`；描述符与 payload 的 ID 集合恰为绑定集合，各一个。
  - **结构等价：** 参考读取经产品入口的归档与 02 的 `readModel`、`readMesh` 独立进行。核对 3 个列表共 127、18、4 个部件，149 个几何（等于不同 MESH 数），3,287 个顶点，3,460 个三角形。
    - 逐项相同：部件标志、颜色、贴图引用（131 个带贴图部件）、音效槽（18 个非空），以及几何的首次使用顺序与共用关系。
    - 逐位相同：位置、UV、法线。逐项相同：索引、角着色槽与着色槽数。
    - 失败 0 项。另做一次变异核对：把一个参考浮点改变符号后报告 4 项几何不等，证明比较不是空成立。
  - **确定性：** `models` 分区的 35 个 payload（5 个模型、30 个贴图 Asset）两次运行的 SHA-256 逐一相同（只记录判定）。
  - **用量：** 每个差值都要求为非负整数后再与份额比较。
    - 模型步骤在逻辑用量之上的差值为 assets 5、dependencyEdges 40（贴图 22、音效 18）、vertices 3,287、triangles 3,460、payloadBytes 150,192，不超过 `PRODUCTION_MODEL_SHARE`。
    - 贴图的追加用量（完整图形步骤减去只含 P2-05 Asset 的图形步骤）为 assets 30、dependencyEdges 30、imagePixels 340,992、paletteEntries 212、payloadBytes 342,453，不超过 `PRODUCTION_MODEL_TEXTURE_SHARE`。
    - 图形步骤总用量不超过 `PRODUCTION_GRAPHICS_SHARE`。
- **作业路径（AC-11 第二部分）：** 生产作业、Worker 宿主、平台适配与持有者经 Node `MessageChannel` 处理同一文件组，端口事件外再记录收到的每条 `group` 消息与清单。
  - 作业以 `finished` 结束，依次发送 logic、models、audio。`logic` 为 `group-complete`（3 个 Asset），`audio` 为 `group-complete`（18 个），`takeGroups()` 恰为这两组；三组的身份相同。
  - `models` 组为 `incomplete`，共 36 个 Asset、11 条诊断，全部对应已记录的阻塞，未归类 0 条：
    - `role-cardinality` 3 条，恰为 `roles.projectile`、`roles.missile`、`roles.debris`（AC-13）；
    - `source-not-ready` 8 条，恰为 8 个歧义贴图图像，每条的 `assetId` 与路径下标一致，unknowns 只有 U-028（AC-14）。
  - 作业收到的 `models` 描述符与直接调用以 `modelsGroupDraft` 推导的完全相同。
  - 用量：assets 61、payloadBytes 941,985、vertices 3,287、triangles 3,460、imagePixels 340,992。`sourceReadBytes` 为 20,538,435，不超过 P2-02 的默认读取限值（`.ccd` 与 `.img` 共 174,530,931 字节）。
- **logic-check：** `node tools/logic-check.ts local/StarRang/cd/STAR_RANGERS.{ccd,img,sub,cue}`，退出码 0，`passed: true`。
  - `logic` 组为 `group-complete`，3 个 payload，11 项限值对照均不超限。
  - 各阶段读取：识别 17,255,043、图形 1,418,256、逻辑 61,152、音频 1,157,184、模型 646,800，合计 20,538,435，与作业路径的 `sourceReadBytes` 相同。
  - 输出留在被忽略的 `local/research/p2-06/logic-check.txt`。
- **Rubber-duck：** 对脚本与输出审查，无阻塞问题。四项非阻塞发现均已修复，重跑结果同上：
  1. 先核对描述符、payload 与绑定的 ID 集合，再按 ID 取 payload；
  2. 用量差值须为非负整数；
  3. AC-14 归类要求诊断自带的 `assetId` 是歧义贴图、与路径下标一致，且 unknowns 只有 U-028；
  4. 作业失败时只输出错误层与 code。
  审阅者确认：其余结构比较、带 ID 的哈希列表比较与作业判定完整。
- **代码与文档影响：** 本子任务没有仓库代码改动，按 execute-goal 不需要 simplify；脚本没有暴露缺陷。原版文档、工程约定与工具指南不需要更新：本地基准结果是验收证据，不是新的原版事实；结构统计归 [10](./10-local-structure-records.md)。11、12 改变结果时在各自子任务中复跑本脚本。
