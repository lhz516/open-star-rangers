---
type: plan
status: active
phase: P2
task: "08"
subtask: "01"
updated: 2026-10-05
---

# 01 — 规范采样 payload 与浮点映射

**契约来源：** [spec](../spec.md) 的 S-02、S-12（本子任务部分），AC-02；[规范采样 payload](../spec.md#规范采样-payload)、[技术决定](../spec.md#技术决定) 2、3。
**依赖：** 无。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **常量与类型：** 在计划新增的 `src/content/sound-payload.ts` 中导出：
  - payload schema 版本 1、头部长度 16、各字段偏移；
  - 格式标签 `OSRS`；
  - 采样率范围 8,000–96,000；
  - 编码（1 = `u8`，2 = `s16le`）、声道数（1、2）与循环方式（0 = 不循环，1 = 整段循环）的封闭取值。
- **写入：** 由 `{ sampleRate, channels, encoding, loop, pcm }` 写出一个新的、独占的 payload 字节视图，先按读取器的同一规则核对输入。PCM 已按规范编码交错，写入只复制，不修改输入视图。
- **读取：** 读取器按以下顺序核对，失败时以稳定的 code 与路径抛出 `ContentContractError`，不回显值：
  1. 长度至少 16；
  2. 标签；
  3. 采样率、声道数、编码、循环方式的取值；
  4. 保留字节为 0；
  5. 帧数 ≥ 1；
  6. PCM 长度恰为帧数 × 声道数 × 每样本字节数，没有尾随字节。

  读取器不按声明的帧数分配缓冲，结果为冻结的头部字段，加上指向原视图的 PCM 子视图（只读用途）。
- **浮点映射：** 唯一的纯函数，把 payload 映射为每个声道一个新的 `Float32Array`：
  - `u8` 的值 v 映射为 (v − 128) / 128；
  - `s16le` 的值 v 映射为 v / 32768，按小端读取，不依赖宿主字节序；
  - 双声道按帧交错拆分。

  结果不与 payload 共享缓冲。
- **测试：** 相邻的 `src/content/sound-payload.test.ts`。
- **文档：** 在[源码结构指南](../../../../engineering/source-structure.md)的内容基础契约一节记录本模块、常量与映射公式。

## 不包含

- SND 解析与 `flags` 解释（03）。
- 音频缓冲的创建与播放（07、08）。
- 采样率的重采样或其他编码（spec 不包含）。

## 关键文件与契约

- **计划新增：** `src/content/sound-payload.ts` 与 `src/content/sound-payload.test.ts`。
- **复用：** [contract-validation.ts](../../../../../src/content/contract-validation.ts) 的 `ContentContractError` 与 `fail`。若需要新的错误 code，按该文件的封闭 code 集合方式添加；既有 code 不变。
- **边界：** `src/content` 属纯模块程序（[tsconfig.core.json](../../../../../tsconfig.core.json)），不得使用 DOM、Node 或 Web Audio 类型。

## 验收标准

- [x] AC-02（往返）：`u8` 单声道、`u8` 双声道、`s16le` 单声道与双声道，以及采样率 8,000 与 96,000 的样本，写入后读取得到相同字段与 PCM；头部偏移等于导出常量。
- [x] AC-02（拒绝）：以下每项都以稳定的 code 与路径拒绝，诊断不含值，且不按声明长度分配：错误标签、未知编码、声道数 0 与 3、循环方式 2、采样率 7,999 与 96,001、保留字节非零、帧数 0、PCM 少 1 字节、尾随 1 字节、总长 15。
- [x] AC-02（浮点映射）：`u8` 的 0、128、255 分别映射为 −1、0、127/128；`s16le` 的 −32768、0、32767 分别映射为 −1、0、32767/32768。双声道拆分正确，结果的缓冲与 payload 不同。
- [x] 写入不修改输入 PCM 视图，输出独占自己的缓冲（`exclusiveBytes` 接受它）。
- [x] `pnpm exec vitest run src/content`、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- 表驱动 Node 测试，使用代码生成的 PCM。拒绝用例断言 `ContentContractError` 的 code 与 path，并断言 message 不含被测值。
- 不适用浏览器或原版对照。
- 完成前按 execute-goal 流程，以本子任务 diff 为范围做 rubber-duck 审查与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据

- **实现：** [sound-payload.ts](../../../../../src/content/sound-payload.ts) 导出 schema 版本、头部长度与偏移、标签、采样率范围、编码/声道/循环方式的封闭取值，`writeSoundPayload`、`readSoundPayload` 与唯一浮点映射 `soundChannelData`。[contract-validation.ts](../../../../../src/content/contract-validation.ts) 的封闭 code 集合新增 `invalid-sound-payload`，[import-protocol.test.ts](../../../../../src/workers/import-protocol.test.ts) 的穷举 code 记录随之同步（content 层 code 在协议中只按 token 语法核对，行为不变）。
- **测试：** [sound-payload.test.ts](../../../../../src/content/sound-payload.test.ts) 覆盖布局与偏移常量（含小端字节核对）、四种编码/声道组合与 8,000、96,000 Hz 的往返、位于大 buffer 偏移处的读取、写入的独占输出（`payloadTransferList` 接受）与输入不变；读取拒绝的 11 个表驱动用例与总长 15，断言 `invalid-sound-payload` 与字段路径且 message 不含被测值；声明帧数 2^32−1 的超大声明以 PCM 长度拒绝而不分配；已转移字节为 `payload-detached`；写入的 9 项拒绝；`u8`、`s16le` 精确映射、双声道拆分与结果不共享内存。
- **命令：** `pnpm exec vitest run src/content src/workers/import-protocol.test.ts`（549 通过）；`pnpm check` 通过（96 个测试文件、2,831 个测试，构建成功），其中包含 `pnpm typecheck` 与 `pnpm lint`。
- **rubber-duck：** 审查范围为本子任务的全部文件，结论为无阻塞、无非阻塞问题。
- **simplify：** 按建议把浮点映射的编码分支提到循环外并改为递增偏移，测试辅助复用单个 `DataView`；未采纳“用 `SOUND_ENCODINGS` 的编码值代替 `SOUND_ENCODING_BYTES`”，因为编码值与字节宽度只是数值巧合。复跑上述检查通过。
- **文档影响：** [源码结构指南](../../../../engineering/source-structure.md#内容基础契约与切片定义)新增目录项与 `sound-payload.ts` 一条（布局、写入、读取与映射公式）。工程约定的命令、边界与测试规则不变，无需修改。
