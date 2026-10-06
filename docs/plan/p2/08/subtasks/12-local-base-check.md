---
type: plan
status: active
phase: P2
task: "08"
subtask: "12"
updated: 2026-10-05
---

# 12 — 本地基准镜像核对

**契约来源：** [spec](../spec.md) 的 S-11（本地基准核对），AC-12；[音频转换预算](../spec.md#音频转换预算)中的基准核对、[验证策略](../spec.md#验证策略)中的实机与原版对照。
**依赖：** 11。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **本地脚本：** 在被忽略的 `local/research/p2-08/` 中编写 Node 脚本，不提交。
  - 用 `fs.openAsBlob` 打开 `local/StarRang/cd/` 的 CloneCD 文件组，组装为 `File`；
  - 按 [P2-04 的本地核对](../../04/subtasks/11-local-base-check.md)的方式，用 Node `MessageChannel` 连接以下各部分，从 `start` 运行到终态：
    - 生产作业 `createImportJob()`：不注入，即产品入口、生产音效表与生产规则；
    - 真实宿主、平台适配与持有者。
- **核对：**
  - 以 `finished` 结束，`audio` 组为 `group-complete`；
  - 清单身份的 `converterVersion` 为 `osr-import.audio-1`，`manifestIdentity` 符合格式；
  - 记录 Asset 数、各角色的 Asset 数、采样率、位宽与 `flags` 分布、payload 字节与采样点用量及其与各上限的比较、源读取量与耗时。
- **覆盖核对：** 脚本另读 P2-01 选定的 5 个 MODL 的音效槽（本地脚本可使用 `tools/` 级别的读取能力），确认每个非零 SND 都已映射到生产表；别名成员只要有一个在表中即算覆盖。
- **预算核对：** 任一用量超过上限时，按 spec 修订流程处理，不静默调高上限；本子任务记为 blocked。
- **输出：** 只含计数、分布、用量、读取量、耗时与结论，写入 `local/research/p2-08/`。

## 不包含

- 浏览器中的原版数据：阶段规定 agent 浏览器检查只用合成资源。
- 试听（10）与经查看器的联合对照（P2-12）。

## 关键文件与契约

- **只读使用：** 06 的作业与生产音效模块、05 的宿主与持有者、[worker-port.ts](../../../../../src/platform/workers/worker-port.ts)，以及 P2-03 生产指纹的测试常量（[source-catalog.test.ts](../../../../../src/original-data/source/source-catalog.test.ts)）。
- **本地新增（被忽略）：** `local/research/p2-08/` 下的脚本与输出。
- **前提：** `local/StarRang/cd/` 有开发者的 CloneCD 文件组（2026-10-05 已存在）。缺少时本子任务为 blocked，不能用合成数据代替。

## 验收标准

- [x] AC-12：本地运行以 `finished` 结束，`audio` 组为 `group-complete`；计数、分布、用量与上限的比较、读取量与耗时已记录。
- [x] AC-12（覆盖）：5 个模型音效槽中的每个非零 SND 都已映射到生产表。
- [x] 全部用量不超过 spec 的音频预算上限。
- [x] 输出与证据只含允许的字段；`git status` 显示 `local/` 下的文件未被跟踪；`pnpm check:original` 通过。

## 验证方法

- 本地 Node 运行：`node local/research/p2-08/<脚本>.ts <CloneCD 文件>`，文件名执行时确定，记录在证据中。
- 不适用 browser-testing；不做视觉或听觉对照。

## 完成证据

- **命令：** 在工作树根目录运行 `node local/research/p2-08/base-check.ts local/StarRang/cd/STAR_RANGERS.{ccd,img,sub,cue}`（2026-10-05，Node 22.22.0）。
  - **装配：** 脚本经 `process.cwd()` 动态导入本工作树的模块，因为 `local` 是指向主检出的符号链接。生产作业 `createImportJob()` 不注入任何参数，经真实宿主、Worker 平台适配与持有者，在 Node `MessageChannel` 上从 `start` 运行到终态，共运行两次。
  - **输出：** 只含计数、分布、用量、读取量、耗时与布尔值，写入被忽略的 `local/research/p2-08/base-check.json`。
- **AC-12（结果）：**
  - **终态：** 以 `finished` 结束；只有一个组，即 `audio`，为 `group-complete`：18 个 Asset，0 条诊断。
  - **身份：** `converterVersion` 为 `osr-import.audio-1`；`manifestIdentity` 符合 `manifest:sha256:<64 位十六进制>`；来源为 `original-import`；两次运行的身份相同。
  - **各角色 Asset 数：** `explosion-sound` 6、`fire-sound` 4、`missile-sound` 1、`warp-sound` 1、`model-sound` 6。
  - **分布：**
    - 采样率：9,000 Hz × 1、11,025 Hz × 13、17,000 Hz × 1、22,050 Hz × 3；
    - 编码：`s16le` × 10、`u8` × 8；
    - 声道：全部单声道；
    - 循环：整段循环 × 3（都是 `model-sound`，即槽 0 的 `flags` 0 样本），播放一次 × 15。

    以上与 [audio](../../../../original/formats/audio.md#playback-interpretation-p2-08) 记录的 18 个所研究样本一致。
  - **payload：** 每个 payload 的长度都等于描述符的 `byteLength`。
  - **耗时：** 两次作业分别为 141 ms 与 104 ms（含识别、图形与音频阶段）。
- **预算（音频阶段自身的用量对上限）：**

  | 维度 | 用量 | 上限 | 占比 |
  |---|---:|---:|---:|
  | `assets` | 18 | 37 | 49% |
  | `payloadBytes` | 434,636 | 8,388,608 | 5.2% |
  | `audioSamples` | 271,173 | 4,194,304 | 6.5% |

  全部在上限之内，无需修订。作业总用量另含 P2-05 的图形转换：`assets` 23，`payloadBytes` 441,820。
- **读取量：** 作业的 `sourceReadBytes` 为 19,404,771，P2-02 的默认读取上限（`.ccd` 与 `.img` 的字节数）为 174,530,931，在上限之内。对照：P2-04 只识别时为 17,255,043。
- **AC-12（覆盖）：** 经产品入口打开同一组文件，用 `parseModel` 读取 P2-01 选定的 5 个 MODL（10743、11063、10373、11399、10611）的音效槽。13 个非零 SND 全部映射到生产表，未映射 0 个。
- **证据边界：** 输出与本证据不含 payload 字节、指纹、身份散列值、输入文件名之外的宿主路径或原版内容。`local` 是被 git 忽略的符号链接，`git status` 中没有未跟踪的文件；`pnpm check:original` 通过。
- **rubber-duck：** 没有阻塞或非阻塞问题。审阅确认了以下几点：作业未注入，宿主、平台适配与持有者都是真实的；音频阶段的用量正确排除了图形用量，而 `audioSamples` 只由音频计入；覆盖核对的 MODL 编号与 P2-01 一致，并计入全部别名；输出只含允许的字段。
- **simplify：** 本子任务只做核对，仓库中只改了跟踪表与本证据，没有实现代码，因此不需要。
- **文档影响：** 不需修改：工程文档与指南不涉及本地核对的数值；原版事实（格式分布）在 10 中已有记录。

