---
type: plan
status: active
phase: P2
task: "12"
subtask: "14"
updated: 2026-10-07
---

# 14 — 试听基准与候选采样的等价核验

**契约来源：** [spec](../spec.md) 的 S-09、[原版本地对照](../spec.md#原版本地对照)中 A-1 与“用户会话”段对旧 WAV 的要求；AC-18 的等价部分。
**依赖：** 12。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 被忽略的本地脚本（计划新增 `local/research/p2-12/audio/`）：
  - 对 12 个核心 Asset（开火 4、导弹 1、Warp 1、爆炸 6，见 [audio](../../../../original/formats/audio.md#slice-sample-set-and-role-correspondences-p2-08)），找到 `local/research/p2-08/` 中 P2-08/10 试听用的对应 WAV；
  - 逐项比较候选的规范采样（经 `content/` 的读取器解码）与 WAV：采样值（按 P2-08 记录的浮点映射）、采样率、声道数与长度；
  - 缺失、对应不明或不等价的 WAV 列出，供 21 改为直接对照原版。
- 输出给 21 的试听清单：Asset ID、角色、对应 WAV、等价结论；只在 `local/`。

## 不包含

- 试听本身（21，由用户完成）；非核心的 6 个音效。

## 关键文件与契约

- [sound-payload.ts](../../../../../src/content/sound-payload.ts) 的读取器；P2-08/10 的[试听记录](../../../../original/formats/audio.md#listening-comparison-p2-0810)与 `local/research/p2-08/listening-checklist.md`。

## 写入范围

- `local/research/p2-12/audio/**`：等价核验脚本与试听清单（被忽略）。

## 验收标准

- [x] 12 个核心 Asset 各有等价结论：与对应 WAV 的采样、采样率、声道与长度逐项相同，或列为须直接对照原版的项。
- [x] 证据只记 Asset ID、计数与判定，不含采样或声音。

## 验证方法

- 在本机运行脚本，记录命令与逐项结论；再临时改动一个采样值确认脚本报告不等价。
- 不涉及浏览器验证。

## 完成证据

- **脚本：** 被忽略的 `local/research/p2-12/audio/sound-equivalence.ts`（同目录 `tsconfig.json`，`pnpm exec tsc -p local/research/p2-12/audio/tsconfig.json` 通过）。输出 `<label>.json`、`<label>-build-manifest.txt` 与试听清单只在同一目录。
  - **命令（在检出根目录）：** `node --preserve-symlinks --preserve-symlinks-main local/research/p2-12/audio/sound-equivalence.ts`。参数要求与 [12](./12-candidate-check.md#完成证据) 相同；可选 `--label`、`--wav-dir`、`--candidate-record`。退出码：0 为 12 项全部等价，2 为已写出结论但有须直接对照原版的项，1 为核对失败（不写试听清单）。`--allow-dirty` 只用于试跑，也不写试听清单。
  - **绑定候选：** 要求工作树干净，按 12 的算法 `pnpm build` 并计算构建指纹，必须等于 12 的候选记录（`local/research/p2-12/candidate/candidate.json`）。再经 P2-11 `pipeline.ts` 的 `jobOwner()` 用生产作业导入 `local/StarRang/cd/` 的 CloneCD 文件组，全包 `complete`，完整 `ContentIdentity` 与 12 个核心声音的 payload 指纹都必须等于候选记录。
  - **对应关系：** 脚本内按 [audio 角色对应表](../../../../original/formats/audio.md#slice-sample-set-and-role-correspondences-p2-08)独立列出 12 个 Asset ID 各自的 SND 条目与 P2-08 研究角色，不从生产声音表推导。核心 Asset 集合必须恰为这 12 个；生产声音表必须绑定同一条目，否则核对失败。WAV 由 P2-08 的 `sound-research.json` 按条目与研究角色查得。
  - **身份适用：** WAV 须与 P2-08 写入它时同时记录的格式一致（采样率、帧数；16 位采样另比较当时记录的均值与相邻差统计量），且最后写入时间不晚于 P2-08/10 试听日（2026-10-05，本机时区）。不满足时列为须直接对照原版。
  - **等价比较：** 用 `createViewerAudio` 走查看器的音频路径，以只记录不播放的能力替代 Web Audio。逐个 `audition` 后 `stop`，取得查看器交给 `createBuffer` 的声道数据、采样率，以及声音的循环标志。该缓冲须与 `content/` 读取器（`readSoundPayload` + `soundChannelData`）的解码逐个相同。然后与 WAV 逐项比较：声道数、采样率、帧数，以及每个采样在 P2-08 浮点映射下的值（WAV int16 v ↦ v / 32768，与缓冲的 Float32 完全相等）。查看器须只播一次（不循环），与 P2-08/10 播放 WAV 的方式相同。
- **结果（2026-10-07，退出码 0，`PASS`）：**
  - **候选：** 在本 worker 的基点 `dae4681`（干净）上运行。构建指纹 `sha256:4d6c6bdcab2f3f334fdda1c1436f24b9e7493a204bc936c1ae780f0605b36fdd`（9 个文件）等于 12 的候选记录（候选提交 `97b70de`，两者之间只有文档改动）。manifest 身份 `manifest:sha256:8c0f2ece…84fb45`，转换器版本 `osr-import.graphics-2.logic-1.audio-1.models-2`；内容身份与 12 个 payload 指纹都与候选记录相同。
  - **逐项结论：12/12 等价，0 项须直接对照原版。** 每项声道 1，采样率与帧数相同，比较的采样数等于帧数，不同采样 0；只播一次；查看器缓冲与读取器解码相同；P2-08 记录一致（7 个 16 位项含统计量）；WAV 写入时间在试听日。

    | 角色 | Asset ID（SND 条目） | 结论 |
    |---|---|---|
    | 开火 | `sound/fire/player`（10669）、`sound/fire/enemy-v1`（10179）、`sound/fire/enemy-v2`（10037）、`sound/fire/base`（10155） | 等价 |
    | 导弹 | `sound/missile`（10647） | 等价 |
    | Warp | `sound/warp`（10401） | 等价 |
    | 爆炸 | `sound/explosion/player`（10175）、`sound/explosion/other`（10177）、`sound/explosion/blast-v1` 至 `v4`（10213、10215、10217、10219） | 等价 |

  - **计数：** 比较采样合计 115,821 个（5 个 u8 源与 7 个 s16le 源），不同 0；查看器载入 audio 组 18 个声音，创建 18 个缓冲，无错误报告，音频上下文已关闭。
- **试听清单（给 21）：** `local/research/p2-12/audio/listening-list.md`，与[本地导入指南的试听（A-1）](../../../../guides/local-import.md#试听a-1)一致。内容：
  - 候选提交、构建指纹、manifest 身份与转换器版本，以及会话前的核对方法；任一不同即不适用，需在新候选上重跑 12 与本脚本。
  - 12 项的角色、Asset ID（查看器 `Sounds` 列表中的行）、第一关中的用途、对应 WAV、采样率与时长、等价结论。
  - 每个角色建议一个直接对照原版的 Asset 及其在 DOSBox-X 中的单独触发方式：开火 `sound/fire/player`、导弹 `sound/missile`、Warp `sound/warp`、爆炸 `sound/explosion/other`。另列 12 项各自的触发方式，blast 变体说明需多次触发。
  - 可直接复制到安全记录模板的 12 行 A-1 记录行。
- **负向（输入均为 `local/` 中的临时副本，用后已删除；输出保留在同一目录）：**
  - **改一个采样值：** WAV 副本中 `fire-10669.wav` 第 100 帧的一个采样被改动，并恢复文件时间。`--label negative-sample` 退出码 2，只有 `sound/fire/player` 列为须直接对照原版（不同采样 1，首个在第 100 帧；16 位统计量也与 P2-08 记录不符），其余 11 项等价。
  - **其他 WAV 故障：** `--label negative-other` 退出码 2。缺失 → `wav-missing`；采样率改动 → `sample-rate`；声道改为 2 → `channels`、`frames`、`samples`；截去一帧 → `frames`；RIFF 标记损坏 → `wav-unreadable`；内容不变只更新时间 → `wav-rewritten-after-listening`。采样率、声道与截帧三类改动另有 `wav-not-p2-08-record`。
  - **候选不符：** 候选记录副本中某个核心声音的 payload 指纹被改动，或构建指纹被改动，脚本退出码均为 1，报告相应的不等，不写试听清单。
  - **对应错误：** 脚本副本中把 `sound/fire/player` 与 `sound/fire/enemy-v1` 的预期条目互换，退出码 1。两项报告生产声音表与预期不符，并标为 `correspondence-unclear`。
- **证据范围：** 记录只有 Asset ID、SND 条目号、哈希、计数、时长与判定，不含采样值或声音；没有录音。`git status --porcelain` 只显示本文件。
- **Rubber-duck：** 2 个阻塞问题与 1 个非阻塞问题，均已修正，并重跑上述全部命令。
  - **阻塞：**
    - 原先由生产声音表推导对应条目，同角色互换可能通过：改为脚本内独立的预期表，并要求核心 Asset 集合恰为预期，生产表须一致；
    - 原先只核对内容身份与 payload 指纹，执行提交与候选提交不同时，没有证明查看器代码相同：改为要求构建指纹等于候选记录，`--allow-dirty` 不写清单。
  - **非阻塞：** 只凭文件时间判断 WAV 是否为当时试听的文件并不可靠。P2-08 没有记录 WAV 摘要，因此增加 P2-08 写入时的格式与 16 位统计量作为历史锚点，文件时间保留为保守条件，并记录所用时区。每个 WAV 的 SHA-256 也记入本地 JSON，供以后对照。
- **未修改 `src/` 与仓库代码：** 本地脚本不提交，不需要 simplify。
- **文档影响：** [本地导入指南](../../../../guides/local-import.md#试听a-1)已说明试听清单的字段和用法，与本清单一致，无需修改。等价核验是 P2-12 的证据，不是新的原版事实，不改 `docs/original/`；回填归 24。
