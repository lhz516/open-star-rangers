---
type: plan
status: active
phase: P2
task: "08"
subtask: "03"
updated: 2026-10-08
---

# 03 — SND 解析、格式规则与 `conversion` 错误层

**契约来源：** [spec](../spec.md) 的 S-01、S-10（诊断部分）、S-12（本子任务部分），AC-01；[采样格式规则](../spec.md#采样格式规则)、[导入协议变化](../spec.md#导入协议变化)中的 `conversion` 层 code、[技术决定](../spec.md#技术决定) 4、7。
**依赖：** 01。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **`conversion` 层错误：** 计划新增 `src/original-data/conversion/conversion-error.ts`。
  - `ConversionError` 的形状与 `SourceError` 相同：`code`、`location`、`reason`、`limit`；`toData()` 返回冻结的纯数据。
  - code 为封闭集合 `invalid-sound`、`unsupported-sound-format`、`limit-exceeded`，后续转换任务可追加。
  - `limit` 为 null 或 `{ name, limit, observed }`：`name` 是 P2-01 预算维度名，`observed` 在超出安全整数范围时为 null。
  - `reason` 是固定文本；`location` 是结构位置，不含字节、宿主路径或宿主错误文本。
- **格式规则类型：** `SndFormatRules` 描述转换器接受的取值：
  - 接受的 `flags` 值，以及每个值对应的声道数（1 或 2）与循环方式；
  - 16 位样本是否按 `s16le` 接受。

  解析器只认规则里列出的值。生产规则的取值由 11 依据研究填入，本子任务不写生产值。
- **SND 解析与转换：** 计划新增 `src/original-data/formats/snd.ts`。输入为条目字节、重定位与规则，按 spec 表格的顺序核对：
  1. 块与重定位：至少 20 字节，恰有 1 个重定位，位置为 0，该处偏移值为 20；
  2. 样本字节数等于块大小减 20；
  3. 位宽为 8 或 16（`s16le` 须被规则接受）；
  4. 采样率为 8,000–44,100 的整数；
  5. `flags` 在规则内，由规则得到声道数与循环方式；
  6. 样本字节数是帧大小的正整数倍，帧数 ≥ 1。

  spec 表格把“帧大小的整数倍”列在样本字节数一行，但帧大小取决于位宽与 `flags` 给出的声道数，所以这部分在第 5 步之后核对。顺序只影响多处同时出错时报告哪个 code；AC-01 的单项拒绝用例不受影响。

  通过后用 01 的写入函数生成规范 payload，样本原样复制到新的独占缓冲，不修改源视图。头部按小端读取。

  失败时抛出 `ConversionError`：结构问题为 `invalid-sound`，取值不在接受范围为 `unsupported-sound-format`。位置由调用方给出的结构前缀加字段名组成。
- **合成构造：** 在 [synthetic.ts](../../../../../src/original-data/synthetic.test-support.ts) 中增加合成 SND 块的构造函数，返回块字节与重定位，供 `buildImfat` 使用。内容只由代码生成。
- **测试：** 相邻的 `snd.test.ts` 与 `conversion-error.test.ts`。
- **文档：** 在源码结构指南记录新目录、`ConversionError` 与解析规则。

## 不包含

- 生产规则与生产音效表（11）。
- 读取条目、预算与组装（04）。
- 宿主把 `ConversionError` 转为协议 DTO（05）。

## 关键文件与契约

- **计划新增：** `src/original-data/conversion/conversion-error.ts`、`src/original-data/formats/snd.ts`，以及各自的 `.test.ts`。
- **修改：** [synthetic.ts](../../../../../src/original-data/synthetic.test-support.ts)（追加合成 SND 构造，既有导出不变）。
- **复用：** 01 的 `src/content/sound-payload.ts`。
- **边界：** 新模块属于 [original-data-capabilities.ts](../../../../../tools/original-data-capabilities.ts) 中的“其他使用者”，不得值导入 `disc/`、`archive/`、`imfat.ts` 或来源族的受限模块。

## 验收标准

- [x] AC-01（转换）：合成 SND 的以下样本都转换为预期的规范 payload：8 位、16 位（规则接受时）、采样率 8,000 与 44,100、测试规则列出的每个 `flags` 取值（单声道与双声道、循环与不循环）。PCM 与源样本逐字节相同。
- [x] AC-01（拒绝）：以下每项都以预期的 code 与结构位置拒绝：
  - 块 19 字节；
  - 重定位数为 0 与 2；
  - 重定位位置为 4；
  - 偏移值为 24；
  - 样本字节数与块大小不符；
  - 样本字节数不是帧大小的整数倍（16 位或双声道时取奇数字节数）；
  - 帧数为 0；
  - 位宽为 12；
  - 规则不接受 16 位时出现 16 位；
  - 采样率 7,999 与 44,101；
  - 未列入规则的 `flags`。
- [x] 诊断不含样本字节；读取声明长度之前不按它分配缓冲；源视图在调用后不变。
- [x] `ConversionError.toData()` 冻结、可结构化克隆，code 合协议的 token 语法。
- [x] `pnpm exec vitest run src/original-data`、`pnpm typecheck`、`pnpm lint` 通过；能力边界回归保持通过。

## 验证方法

- 表驱动 Node 测试，使用代码生成的 SND 块与测试规则。
- 不适用浏览器或原版对照；生产规则在 11 与 12 中验证。
- 完成前按 execute-goal 流程，以本子任务 diff 为范围做 rubber-duck 审查与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据

- **实现：**
  - `conversion-error.ts`（已由 14 移除）：`ConversionError` 与 `SourceError` 同形，code 为 `invalid-sound`、`unsupported-sound-format`、`limit-exceeded`，`limit.name` 为 P2-01 预算维度。
  - [snd.ts](../../../../../src/original-data/formats/snd.ts)：`readSndHeader` 负责结构核对；`convertSnd` 依次核对位宽、采样率与 `flags`，最后核对整帧，然后用 `writeSoundPayload` 输出；`SndFormatRules` 为 `{ flags: [{ value, channels, loop }], s16le }`。
  - [synthetic.ts](../../../../../src/original-data/synthetic.test-support.ts)：新增 `syntheticSnd`，可直接展开为 `buildImfat` 的条目。
  - 生产规则不在本子任务中写入。
- **测试：**
  - [snd.test.ts](../../../../../src/original-data/formats/snd.test.ts)，使用合成 `flags` 取值 100–103，测试含义只在测试中：
    - **转换：** 5 个用例覆盖 8 位与 16 位、单声道与双声道、循环与不循环、8,000 与 44,100 Hz，PCM 与源样本逐字节相同，采样点数正确，payload 为独占 buffer；
    - **源块与 IMFAT：** 源块在调用后不变；经 `buildImfat` 与 `parseImfat` 读出的合成 SND 头部正确；
    - **拒绝：** 15 个表驱动用例，各断言 `toData()` 的 code 与位置：块 19 字节、重定位 0 个与 2 个、重定位位置为 4、指针为 24、样本字节数不符、声明长度 0xFFFFFFF0、16 位奇数字节、双声道奇数字节、帧数 0、12 位、7,999 与 44,101 Hz、未列入的 `flags`、高字节不同的 `flags`。声明长度为 0xFFFFFFF0 时以 `invalid-sound` 拒绝，不按声明分配；
    - **规则不接受 16 位：** 以 `unsupported-sound-format` 拒绝；
    - **诊断：** 不回显头部值或样本字节。
  - `conversion-error.test.ts`（已由 14 移除） 覆盖冻结、可结构化克隆、`limit` 冻结副本、`observed: null`，以及 code 符合协议 token 语法。
- **命令：** `pnpm exec vitest run src/original-data tools/engineering-boundaries.test.ts` 通过，其中包括能力边界与依赖图回归。`pnpm check` 通过（99 个测试文件、2,889 个测试，构建成功）。
- **rubber-duck：** 无阻塞、无非阻塞问题。
- **simplify：** 采纳效率一项：`syntheticSnd` 直接写入单个 `Uint8Array`，不再经 `ByteWriter` 的数组，以便后续预算测试构造大块。复用、简化与层次三个角度无发现。复跑检查通过。
- **文档影响：** [源码结构指南](../../../../engineering/modules/original-data.md#原版格式转换)的目录树加入 `conversion/` 与 `formats/`，并新增“原版格式转换”一节（`conversion` 错误层、SND 结构与规则、转换顺序、合成数据）。工程约定的边界规则已覆盖“其他使用者”，无需修改。

- **后续修订：** 2026-10-05 按修订后的 spec，由 [14](./14-shared-mechanism-alignment.md) 改为与 P2-05、P2-09 共享的机制（见 [goal 执行记录](../goal.md#执行记录)）。`ConversionError` 改为 `SourceError`，code 改为 `invalid-payload`/`unsupported-payload`。本条以上的证据记录的是本子任务完成时的状态。
