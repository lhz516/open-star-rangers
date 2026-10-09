---
type: plan
status: active
phase: P2
task: "13"
subtask: "05"
updated: 2026-10-08
---

# 05 — 真实数据候选核对

**契约来源：** [spec](../spec.md) 的 S-01、S-02、AC-01、AC-05、AC-08 与 AC-12；技术决定 3、4。
**依赖：** 无。
**执行方式：** 自动。agent 在本地 Node 中读取本机的原版光盘镜像，不需要用户。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **运行：** 在干净工作树的当前提交上，从检出根运行被忽略的候选核对脚本：

  ```sh
  node --preserve-symlinks --preserve-symlinks-main local/research/p2-12/candidate/candidate-check.ts --label p2-13
  ```

  脚本读取 `local/StarRang/cd/STAR_RANGERS.{ccd,cue,img,sub}`，自行运行 `pnpm build`，并计算构建指纹。
- **记录（只记身份、计数与结论）：**
  - 提交、构建指纹、完整 `ContentIdentity`、脚本文件的 SHA-256；
  - 作业完成、四组完整、全包判定 `complete`、各类计数满足切片定义、没有合成来源；
  - 两次运行的身份、payload 指纹与 `MissionSetup` 摘要相同，`loadMission` 成功；
  - 作业与全包校验的耗时。
- **与 P2-12 比较：** 与 `final-26b.json` 及其构建清单比较 `ContentIdentity`、按 Asset ID 排序的 payload 指纹、`MissionSetup` 摘要与构建指纹。
  - **相同：** 记录比较结果。
  - **不同：** 列出差异；生产受影响时按技术决定 4 记为问题，交协调者新增重做对照的子任务。
- **负向确认：** 以 `--label p2-13-neg --drop-group audio` 运行一次，确认脚本以非零退出码报告，证明它仍会失败。
- **不可用时：** 原版数据或脚本不可用时本项为 blocked（技术决定 3），不以合成数据代替。

## 不包含

- 修改脚本的断言或比较规则；新的原版对照（P2-12 的判定由 01 判断适用性）。
- 推进 tick 或随机生成世界。

## 关键文件与契约

- 被忽略的 `local/research/p2-12/candidate/candidate-check.ts` 与 `final-26b.json`、`final-26b-build-manifest.txt`；[P2-12/12](../../12/subtasks/12-candidate-check.md#完成证据)、[P2-12/31](../../12/subtasks/31-hud-resource-gap.md#完成证据)。
- [content-identity.ts](../../../../../src/content/content-identity.ts)、[slice-definition.ts](../../../../../src/content/slice-definition.ts)、[completeness.ts](../../../../../src/content/completeness.ts)、[load-mission.ts](../../../../../src/core/mission/load-mission.ts)。

## 写入范围

- 本 worker 工作树中被忽略的生产构建输出（dist 目录）：每个工作树各有一份，不与其他行共享，因此不列为共享路径。
- `local/research/p2-12/candidate/p2-13*`：本次运行的输出（被忽略；不覆盖 P2-12 的记录）。

## 验收标准

- [x] AC-05：核对脚本退出码 0，上述各项通过；与 `final-26b` 的身份比较已记录，相同或差异已按技术决定 4 处理；被跟踪的证据只含身份、计数、哈希与结论。
- [x] AC-01（候选部分）：构建指纹与完整 `ContentIdentity` 已记录并绑定提交。
- [x] AC-08（本轮部分）：`loadMission` 在当前候选上成功，两次载入深度一致。
- [x] 负向运行以非零退出码报告缺组。
- [x] AC-12：失败时写明受影响的退出条件、原责任任务与恢复条件；没有时写明“无”。被跟踪的文件没有改动，证据中没有原版内容或宿主绝对路径。

## 验证方法

- 运行上述两条命令，记录退出码与输出摘要；`shasum -a 256 local/research/p2-12/candidate/candidate-check.ts`；比较两份 JSON 记录的身份字段。
- 不涉及浏览器验证。原版证据：只读本机光盘镜像，输出留在 `local/`。

## 完成证据

- **运行条件（2026-10-08，本地时间）：**
  - **提交与工作树：** 在提交 `f6879f6d7437b02922752445200a994185bcc591` 上，从检出根运行。它是认领提交，也是本 worker 分支 `exec-p2-13-05` 的基点。两次运行前后，`git status --porcelain --untracked-files=all --no-renames` 都为空。
  - **准备：** 新建的工作树没有依赖与 `local/`。先运行 `pnpm install --frozen-lockfile`（退出码 0，锁文件未变），再把 `local` 链接到主检出的 `local/`（被忽略）。
  - **环境：** Node v22.22.0、pnpm 12.8.1、macOS 26.6（Darwin 25.6.0，arm64）、Apple M2 8 核。
- **脚本哈希（SHA-256）：** 本项没有修改下列文件，它们的修改时间都早于 `final-26b` 记录的生成时间。
  - `local/research/p2-12/candidate/candidate-check.ts`：`ff97b6f38a00a664bdae52d4df7d47ac8300f3c495ccd2954557994d1db68308`；
  - 它导入的被忽略模块 `local/research/p2-11/pipeline.ts`：`3d06547d990231e215ce813a543b32d5ca41a01f4931717385e53ca5e8e2f2a3`；
  - 同样被导入的 `local/research/p2-12/hud/source.ts`：`da81b669b69715dd33cd5fd2523998f4eeba10d640658028a4e0e24d49bf78d0`。
- **正向运行：** 命令为 `node --preserve-symlinks --preserve-symlinks-main local/research/p2-12/candidate/candidate-check.ts --label p2-13`。退出码 0，输出 `PASS`，`failures` 为空。`p2-13.json`、`p2-13.log` 与 `p2-13-build-manifest.txt` 只在被忽略的脚本目录。
  - **候选（AC-01 候选部分）：**
    - 提交为 `f6879f6…`，记录为 `source.clean: true`，未用 `--allow-dirty`。
    - `buildFingerprint` 为 `sha256:ec5af1f5d9d46fe3d9654d8715151682e2ca7d7f6c6c0b06e189b35bdac1f690`（9 个文件，7,096,735 字节）。
    - `contentIdentity`：
      - schema 1；
      - 切片为 `classic-p2-slice`，定义版本 3；
      - `ConverterVersion` 为 `osr-import.graphics-3.logic-1.audio-1.models-3`；
      - manifest 身份为 `manifest:sha256:6d91667b375fd2b7f1201ec76400fcdced5b735f48660f85161e0446ddacfad5`；
      - 来源为 `original-import` / `source:sha256:fd97bcea3c3aee835c9058419469786587a4580e96b431bb9ce9c127ff2181be`。
  - **作业与全包：**
    - 两个子进程的作业都是 `finished`，版本 ID 为 `star-rangers-1995-cd`。四组各出现一次，都是 `group-complete`。
    - `validatePackage(CLASSIC_P2_SLICE, …)` 为 `complete`。
    - 逐组核对、来源状态 `verified`，以及 payload 长度、schema 与 SHA-256 的断言都没有失败。
    - 来源都是 `original-import` 与生产来源指纹，没有合成来源。
  - **计数：**
    - **Asset：** 共 165 个，按组为 logic 3、models 44、cockpit-hud-map 100、audio 18。按种类为 image 109、palette 20、sound 18、data 6、model 6、font 3、layout 2、mission 1。
    - **角色：** 15 个切片角色的数量都在切片定义的上下限内，例如 `hud-mfd` 26、`strategic-map` 59、`explosion-sound` 6。另有 11 种非切片角色。
    - **引用：** 依赖边 185 条，闭包覆盖 165/165。闭包的根含 7 个任务引用，以及切片外角色 `status-messages` 的 1 个 Asset。
    - **payload 与来源：** payload 共 1,576,667 字节；134 个 Asset 的来源状态为 `verified`，但仍列有 U 项。
    - **解码：** viewer 143 个（image 109、palette 20、model 6、effect 3、font 3、layout 2），sound 18 个，logic 3 个，status-messages 1 个；未解码 0 个。DIAG 结构核对与 status-messages 比较都通过。
  - **任务（AC-08 本轮部分）：**
    - 两次 `loadMission` 都成功，`diagnoseMission` 为 `loaded`，解析出 5 个模型。
    - 任务有 9 个声明、3 个编组、3 个出生区域、5 个僚机选项，名字池 19 个。阵营为玩家 1、友方 2、敌方 4、无 2。
    - 不推进 tick。
  - **两次运行一致：**
    - `identityEqual`、`payloadsEqual` 与 `setupEqual` 都为 `true`。
    - 165 项 payload 的摘要为 `sha256:bac43751bc02a094094cc2b01c59cea7631098eb58ae1101d5344ab9bd45eb4b`。
    - `MissionSetup` 摘要为 `sha256:714f3bfff713ddb910cd18ed7607a6c38538155fe86ba822f0bfeb563277a6f0`。
  - **耗时：**
    - 作业分别为 200.7 ms 与 193.3 ms。
    - 全包校验中位数分别为 9.9 ms 与 9.6 ms，单遍 9.4–10.5 ms。
    - `loadMission` 中位数 0.1 ms。
    - `pnpm build` 2.7 s；负向运行为 1.2 s，`final-26b` 为 1.4 s。构建耗时不是判据。
- **与 `final-26b`（`f925d21`）比较：**
  - **构建：** `p2-13-build-manifest.txt` 与 `final-26b-build-manifest.txt` 逐字节相同（`cmp`），构建指纹相同。
  - **身份与 payload：**
    - `contentIdentity` 深度相同；
    - 165 项按 Asset ID 排序的 payload 指纹逐项相同，payload 与 `MissionSetup` 摘要也相同。
  - **运行记录：** 去掉耗时字段后，本次两次运行的记录与 `final-26b` 两次运行的记录两两比较，4 组都深度相同。
  - **其他差异：** 只有运行元数据不同：提交（`f925d21` → `f6879f6`）、分支、日期、耗时与输出标签（构建清单的文件名）。
  - **结论：相同。** 按技术决定 4，最终候选与 P2-12 候选之间没有生产影响差异，不需要新增重做对照的子任务。01 判定的“生产影响结论：无”成立。此后的提交若只改不进入构建的文件，由 08 核对本身份仍然适用。
- **负向运行：** 以 `--label p2-13-neg --drop-group audio` 运行，退出码 1，输出 `FAIL`。
  - 两次运行的作业都是 `finished`，四组都是 `group-complete`。取走组后删去 audio，全包为 `incomplete`（`group-missing` at `groups.audio`），因此没有内容身份。
  - 失败只有每次运行各一条“whole package complete”，以及“both runs produced a content identity”。
  - 构建指纹仍为 `ec5af1f5…f690`。
- **AC-12 与证据范围：**
  - **失败：** 无，因此不涉及受影响的退出条件、原责任任务或恢复条件。两条命令各运行一次，没有重跑，也没有修改脚本、断言或比较规则。
  - **被跟踪的文件：** 运行没有改动；本提交只更新本文档的勾选与完成证据。
  - **证据内容：** 本记录只含身份、哈希、计数、耗时与结论，没有 payload 字节、解码内容、名字、文字或宿主绝对路径。明细只在被忽略的 `local/research/p2-12/candidate/p2-13*`。
  - **P2-12 的记录：** 运行前后，`final-26b.json` 的 SHA-256 都是 `d642d640…5397`，`final-26b-build-manifest.txt` 的都是 `ec5af1f5…f690`。
- **Rubber-duck：** 审查本文档的差异与本地 JSON 输出，没有阻塞问题。唯一的非阻塞问题是差异清单漏列了输出标签（构建清单的文件名），已补上；逐字段比较确认，其余不同的字段只有日期、提交、分支与耗时。
- **文档影响：** 本项没有实现代码，因此不需要 simplify。工程约定、指南、原版事实与未知项都不受影响，无需更新。对 STATUS 与阶段索引没有改动建议。
