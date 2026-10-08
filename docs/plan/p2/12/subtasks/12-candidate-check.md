---
type: plan
status: active
phase: P2
task: "12"
subtask: "12"
updated: 2026-10-07
---

# 12 — 候选身份与本地覆盖核对

**契约来源：** [spec](../spec.md) 的 S-01、[候选身份](../spec.md#候选身份)；AC-01。
**依赖：** 无。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 被忽略的本地脚本（计划新增 `local/research/p2-12/candidate/`），在开发者机器的 Node 中运行，不打开浏览器：
  - 复用 `local/research/p2-11/pipeline.ts` 的生产作业流程（生产目录、`openVerifiedSource` 与生产转换器），处理 `local/StarRang/cd/` 的基准 CloneCD 文件组。
  - 断言：四组都是 `group-complete`；`validatePackage(CLASSIC_P2_SLICE, …)` 为 `complete`；每个切片角色的 Asset 数满足 [`CLASSIC_P2_SLICE`](../../../../../src/content/slice-definition.ts) 的上下限与引用闭包；来源为 `original-import` 且等于 [`PRODUCTION_PACKAGE`](../../../../../src/workers/production-package.ts) 的指纹，没有合成来源或占位 Asset；`loadMission` 成功。
  - 两次运行：完整 `ContentIdentity`、按 Asset ID 排序的 payload 指纹与 `MissionSetup` 深度相同。
  - 记录候选 `{ commit, buildFingerprint, contentIdentity }`：构建指纹为 `pnpm build` 后实际分发文件的 SHA-256 清单摘要；另记 Node、OS 版本，各类 Asset 计数，作业与全包校验耗时。
- 脚本可重复运行：最终对齐（26）在最终候选上重跑；候选变化时受影响的 agent 对照随之重跑。
- 证据只记安全身份、哈希、计数与耗时，不含原版内容；输出只在 `local/`。

## 不包含

- 浏览器中的真实导入（21，由用户完成）；任务字段的独立对照（18）。

## 关键文件与契约

- [content-identity.ts](../../../../../src/content/content-identity.ts) 的 `ContentIdentity`；[completeness.ts](../../../../../src/content/completeness.ts)；[load-mission.ts](../../../../../src/core/mission/load-mission.ts)。
- 参照 [P2-11/23](../../11/subtasks/23-local-real-data-import.md) 与 [P2-11/17](../../11/subtasks/17-local-real-data-check.md) 的本地核对做法。

## 写入范围

- `local/research/p2-12/candidate/**`：候选核对脚本与输出（被忽略）。

## 验收标准

- [x] AC-01：四组完整、全包 `complete`、角色与引用闭包满足切片定义、无合成或占位来源、`loadMission` 成功。
- [x] 两次运行的完整内容身份、payload 指纹与 `MissionSetup` 相同。
- [x] 候选身份、环境、计数与耗时已记录；证据不含原版内容；仓库中没有本地输出。

## 验证方法

- 在本机运行脚本，记录命令、退出码与结果摘要；再临时破坏一项断言输入（例如去掉一个组），确认脚本以非零退出码报告。
- 不涉及浏览器验证。

## 完成证据

- **脚本：** 被忽略的 `local/research/p2-12/candidate/candidate-check.ts`（同目录 `tsconfig.json` 供类型检查，`pnpm exec tsc -p local/research/p2-12/candidate/tsconfig.json` 通过）。输出 `<label>.json`、`<label>.log` 与 `<label>-build-manifest.txt` 只在同一目录。
  - **命令（在检出根目录）：** `node --preserve-symlinks --preserve-symlinks-main local/research/p2-12/candidate/candidate-check.ts`。不给文件时读取 `local/StarRang/cd/STAR_RANGERS.{ccd,cue,img,sub}`。`local/` 是指向主检出的符号链接，这两个参数使导入解析到本检出的 `src/`；缺少参数或不在检出根目录时，脚本报错退出。
  - **候选来源：** 记录 `HEAD` 与分支，要求工作树没有未提交的改动（`git status --porcelain --untracked-files=all --no-renames`）。构建会读取文档（合规清单含 `docs/original/manifest.md` 的哈希），因此文档改动也不允许。`--allow-dirty` 只记录路径，并标为未绑定。
  - **构建指纹：** 运行 `pnpm build`，对 `dist/` 下全部普通文件（含 source map、声明与合规清单）按路径排序，列出 SHA-256 清单，再对清单取 SHA-256。构建前后工作树状态必须相同。
  - **两次运行：** fork 两个独立子进程，各自完成一次作业。每次复用 [P2-11 `pipeline.ts`](../../11/subtasks/23-local-real-data-import.md#完成证据) 的 `jobOwner()`：`createImportJob()` 默认的生产目录、`openVerifiedSource` 与生产转换器，经 `runImportHost`、`connectImportWorker` 与 `createImportJobOwner`，通过 MessageChannel 连接。之后 `takeGroups()`，按下列断言逐项检查。父进程以 `isDeepStrictEqual` 比较两次的完整 `ContentIdentity`、按 Asset ID 排序的 payload 指纹（由字节重新计算的 SHA-256）与 `MissionSetup`。`MissionSetup` 只在进程间内存中传递，记录中只有其规范 JSON 的 SHA-256。
  - **断言：**
    - 作业 `finished`；版本 ID 等于生产目录；来源指纹等于 `PRODUCTION_PACKAGE`，且等于生产目录的指纹；四组各出现一次，都是 `group-complete`。
    - `validatePackage(CLASSIC_P2_SLICE, …)` 为 `complete`；身份的 schema、切片 ID/版本、`ConverterVersion` 与来源都等于 `CLASSIC_P2_SLICE` 与 `PRODUCTION_PACKAGE`。
    - **逐组独立核对：** 不依赖全包结果，检查 manifest 组与身份；来源为 `original-import` 且来源状态属于生产来源；每个 Asset 恰有一个 payload 与一个来源状态，状态为 `verified`；payload 非空，字节长度、schema 与重新计算的 SHA-256 都等于声明。
    - **角色与引用闭包：** 15 个切片角色的数量在上下限内，所在组与种类符合定义；每条依赖都在包内解析到所声明的种类；任务的 craft type 表与僚机名册在 logic 组。从切片角色、任务引用与解析出的模型出发的依赖闭包覆盖全部 Asset。
    - **无占位：** 每个 Asset 都经应用自己的消费者解码：模型、效果与 2D Asset 经 `viewerCatalog` 与 `resolveEntry` 解析每个变体（图像用其调色板展开、布局合成、模型纹理展开），图像与布局的尺寸非零，模型至少有一个部件；声音经 `readSoundPayload`，schema 受支持且帧数大于 0；logic Asset 经 `decodeLogicPayload`。未解码的 Asset 数必须为 0。
    - **任务载入：** `loadMission` 成功，解析出至少一个模型，且都是 models 组的 `model` Asset；应用的 `diagnoseMission` 为 `loaded`，引用的模型全部存在。
- **结果（2026-10-07，最终脚本连续两次调用，退出码均为 0，`PASS`）：**
  - **候选：**
    - `commit` `97b70def6e7d3b35eb681391bdf1d023b6f14cf0`（本 worker 的基点，即认领提交；工作树干净）；
    - `buildFingerprint` `sha256:4d6c6bdcab2f3f334fdda1c1436f24b9e7493a204bc936c1ae780f0605b36fdd`（9 个文件，7,043,001 字节）；
    - `contentIdentity`：schema 1，`classic-p2-slice` 定义版本 2，`ConverterVersion` `osr-import.graphics-2.logic-1.audio-1.models-2`，manifest 身份 `manifest:sha256:8c0f2ece0c370ff2123cb9a1a0944e4167c201b081ec5bca7fa65afa1384fb45`，来源 `original-import` / `source:sha256:fd97bcea3c3aee835c9058419469786587a4580e96b431bb9ce9c127ff2181be`。
    - 本 worker 的提交只增加本文件的证据，不改变转换、呈现或构建输入；最终对齐（26）在最终候选上重跑本脚本。
  - **环境：** Node v22.22.0，pnpm 12.8.1，macOS 26.6（Darwin 25.6.0，arm64），Apple M2 8 核。
  - **计数：**
    - 组：logic 3、models 44、cockpit-hud-map 90、audio 18，共 155 个 Asset。
    - 种类：image 100、palette 20、sound 18、model 6、data 5、font 3、layout 2、mission 1。
    - 切片角色（全部在上下限内）：mission 1、player-ship 1、enemy-ship 2、base 1、projectile 1、missile 2、debris 2、front-cockpit 1、hud-mfd 17、font 3、strategic-map 59、fire-sound 4、missile-sound 1、explosion-sound 6、warp-sound 1。另有 10 个非切片角色共 53 个 Asset。
    - 引用：依赖边 176 条，全部解析；闭包覆盖 155/155。payload 共 1,493,013 字节。155 个来源状态均为 `verified`，其中 124 个仍列有 U 项。
    - 解码：viewer 134 个（image 100、palette 20、model 6、effect 3、font 3、layout 2），sound 18，logic 3，未解码 0。
    - 作业预算用量：读取来源 21,159,363 字节；顶点 3,939、三角形 4,133、图像像素 852,409、调色板项 1,012、字形 704、音频样本 271,173、任务对象 14、任务引用 40。
    - 任务：9 个声明、3 个编组、3 个出生区域、5 个僚机选项、19 个名字；阵营为玩家 1、友方 2、敌方 4、无 2；解析出 5 个模型，都在模型组中。
  - **一致性：**
    - 每次调用内，两个子进程的身份、payload 指纹与 `MissionSetup` 都深度相同：155 项 payload 摘要 `sha256:d38317f5a09baffceabedda753cff79dbd4dd9e3d574d657b3aeab4618677ac2`，setup 摘要 `sha256:714f3bfff713ddb910cd18ed7607a6c38538155fe86ba822f0bfeb563277a6f0`。
    - 两次调用的候选记录（commit、构建指纹、内容身份）、payload 列表与 setup 摘要也相同；构建可复现。
  - **耗时（2 次调用 × 2 个子进程）：**
    - 作业从 `start` 到结束 204–285 ms，不含读入文件与真实 Worker 启动；
    - 全包校验 `validatePackage`（每次 5 遍的中位数）9.4–9.9 ms，单遍 9.3–13.3 ms；
    - `loadMission` 中位数 0.1–0.2 ms；
    - `pnpm build` 1.1–1.3 s。
    - 修正前的首次运行（冷缓存）作业为 246–623 ms，全包校验中位数 11.9–27.7 ms。
- **负向（均以退出码 1 报告，不会挂起）：**
  - `--drop-group audio`：在取走组后删去 audio 组，全包 `incomplete`（`group-missing` at `groups.audio`）；
  - 缺少 `.img`：作业在 `identify-source` 失败（disc `unsupported-file-set`）；
  - 工作树有一个未跟踪文件：报告“worktree has no uncommitted change (1)”；
  - 不带 `--preserve-symlinks` 参数：脚本拒绝运行。
  - 只缺 `.sub` 时仍为 `PASS`，这是预期行为：[clone-cd.ts](../../../../../src/original-data/disc/clone-cd.ts) 中 `.sub` 与 `.cue` 可选且从不读取。因此该情况未作为负向样本。
- **证据范围：** 只记录身份、哈希、计数与耗时，不含 payload 字节、解码内容、名字或主机路径。`git status --porcelain` 只显示本文件，仓库中没有本地输出。
- **Rubber-duck：** 2 个阻塞问题与 2 个非阻塞问题，均已修正并重跑上述全部命令。
  - **阻塞：**
    - “无占位”原先只核对 payload 非空与身份一致：改为每个 Asset 都经应用消费者解码，并检查内容非空；
    - 原先允许 `docs/` 下的改动，但构建会读取 `docs/original/manifest.md`：改为要求整个工作树干净。
  - **非阻塞：**
    - 子进程卡在同步计算时，子进程内的计时器无法触发：父进程增加 300 s 看门狗；
    - porcelain `-z` 的改名记录解析有误：改用 `--no-renames`。
- **未修改 `src/` 与仓库代码：** 本地脚本不提交，不需要 simplify。
- **文档影响：** 工程约定、指南与原版事实都不受影响，无需更新。本地对照的用户步骤归 20，工程说明归 25。
