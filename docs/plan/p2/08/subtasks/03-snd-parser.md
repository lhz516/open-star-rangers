---
type: plan
status: active
phase: P2
task: "08"
subtask: "03"
updated: 2026-10-05
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
- **合成构造：** 在 [synthetic.ts](../../../../../src/original-data/synthetic.ts) 中增加合成 SND 块的构造函数，返回块字节与重定位，供 `buildImfat` 使用。内容只由代码生成。
- **测试：** 相邻的 `snd.test.ts` 与 `conversion-error.test.ts`。
- **文档：** 在源码结构指南记录新目录、`ConversionError` 与解析规则。

## 不包含

- 生产规则与生产音效表（11）。
- 读取条目、预算与组装（04）。
- 宿主把 `ConversionError` 转为协议 DTO（05）。

## 关键文件与契约

- **计划新增：** `src/original-data/conversion/conversion-error.ts`、`src/original-data/formats/snd.ts`，以及各自的 `.test.ts`。
- **修改：** [synthetic.ts](../../../../../src/original-data/synthetic.ts)（追加合成 SND 构造，既有导出不变）。
- **复用：** 01 的 `src/content/sound-payload.ts`。
- **边界：** 新模块属于 [original-data-capabilities.ts](../../../../../tools/original-data-capabilities.ts) 中的“其他使用者”，不得值导入 `disc/`、`archive/`、`imfat.ts` 或来源族的受限模块。

## 验收标准

- [ ] AC-01（转换）：合成 SND 的以下样本都转换为预期的规范 payload：8 位、16 位（规则接受时）、采样率 8,000 与 44,100、测试规则列出的每个 `flags` 取值（单声道与双声道、循环与不循环）。PCM 与源样本逐字节相同。
- [ ] AC-01（拒绝）：以下每项都以预期的 code 与结构位置拒绝：
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
- [ ] 诊断不含样本字节；读取声明长度之前不按它分配缓冲；源视图在调用后不变。
- [ ] `ConversionError.toData()` 冻结、可结构化克隆，code 合协议的 token 语法。
- [ ] `pnpm exec vitest run src/original-data`、`pnpm typecheck`、`pnpm lint` 通过；能力边界回归保持通过。

## 验证方法

- 表驱动 Node 测试，使用代码生成的 SND 块与测试规则。
- 不适用浏览器或原版对照；生产规则在 11 与 12 中验证。
- 完成前按 execute-goal 流程，以本子任务 diff 为范围做 rubber-duck 审查与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据
