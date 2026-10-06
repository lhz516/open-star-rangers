---
type: plan
status: active
phase: P2
task: "08"
subtask: "14"
updated: 2026-10-05
---

# 14 — 与并行任务的共享机制对齐：`source` 层转换错误与包身份

**契约来源：** [spec](../spec.md) 中修订后的以下部分：
- S-06、S-07（错误层部分）、S-10；
- AC-01、AC-04、AC-05（code 与层），AC-06（生产常量，以及身份对 `ConverterVersion` 与来源的敏感性）；
- [采样格式规则](../spec.md#采样格式规则)、[音频转换预算](../spec.md#音频转换预算)、[包身份](../spec.md#包身份)、[导入协议变化](../spec.md#导入协议变化)中的 `source` 层追加 code；
- [技术决定](../spec.md#技术决定) 6、7；
- 修订原因见 [goal 执行记录](../goal.md#执行记录)。

**依赖：** 02、03、04。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

修复子任务：把 02、03、04 已提交的实现改为 P2-05、P2-09 已批准的共享机制，不新增行为。

- **`source` 层错误：**
  - **扩展 `SourceError`：** 在 [source-error.ts](../../../../../src/original-data/source-error.ts) 中：
    - code 联合追加 `invalid-payload` 与 `unsupported-payload`；
    - 限值名追加 P2-01 的全部预算维度；
    - `SourceLimit.observed` 改为 `number | null`，null 只用于预算超出安全整数的情形。
    - P2-03 已有 code 与限值的含义不变。
  - **替换调用方：**
    - SND 解析（`formats/snd.ts`）把 `invalid-sound` 改为 `invalid-payload`，把 `unsupported-sound-format` 改为 `unsupported-payload`；
    - 音频预检（`conversion/audio-conversion.ts`）同样改用这两个 code；
    - 预算计量（`conversion/conversion-budget.ts`）改为抛出 `SourceError('limit-exceeded')`，`limit.name` 为预算维度。
  - **移除：** `conversion/conversion-error.ts` 及其测试。
  - **不变：** 位置、固定 reason、检查顺序与零读取保证。
- **生产 `ConverterVersion`：** 新增 `src/original-data/conversion/converter-version.ts`，导出唯一的生产常量 `PRODUCTION_CONVERTER_VERSION = 'osr-import.audio-1'`。
  - 值由 `osr-import.` 与各转换器组件按固定顺序组成，本任务只有 04 的 `AUDIO_CONVERTER_COMPONENT`。
  - 生产代码中没有第二个定义。
- **`ManifestIdentity`：** [manifest-identity.ts](../../../../../src/content/manifest-identity.ts) 改为 P2-09 的定义：
  - **输入：** 增加 `converterVersion` 与 `origin`，分别用 `readConverterVersion` 与 `readContentOrigin` 读取。
  - **编码顺序：** `schemaVersion`、`sliceId`、`sliceDefinitionVersion`、`ConverterVersion`、来源，然后是各组。
  - **编码：** 对确定的 ASCII 文本计算 SHA-256。各字段都由只允许 ASCII 的读取器保证。
  - **测试：** 重新固定已钉住的值，并增加对 `ConverterVersion` 与来源的敏感性用例。
- **测试：** 更新受影响测试，包括 `snd.test.ts`、`audio-conversion.test.ts`、`conversion-budget.test.ts`、`manifest-identity.test.ts`，以及协议测试中 `SourceErrorCode`/限值名的穷举记录。新增 `converter-version.test.ts`。
- **文档：** 同步[源码结构指南](../../../../engineering/source-structure.md)中的以下内容：
  - 原版格式转换一节：`source` 层 code，以及去掉 `conversion` 错误层；
  - 版本识别一节中 `SourceError` 的说明；
  - `manifest-identity.ts` 一条；
  - 新的 `converter-version.ts`。

## 不包含

- 协议版本、阶段与持有者规则（05）；作业装配（06）。
- P2-05、P2-09 自己的 code（`unsupported-encoding`、`budget-exceeded`、`subresource-mismatch` 等），由它们各自追加。

## 关键文件与契约

- **修改：**
  - `src/original-data/` 下：[source-error.ts](../../../../../src/original-data/source-error.ts)、`formats/snd.ts`、`conversion/audio-conversion.ts`、`conversion/conversion-budget.ts`，以及它们的测试；
  - `src/content/manifest-identity.ts` 及其测试；
  - [import-protocol.test.ts](../../../../../src/workers/import-protocol.test.ts)。
- **计划新增：** `src/original-data/conversion/converter-version.ts` 与其测试。
- **移除：** `src/original-data/conversion/conversion-error.ts` 与其测试。

## 验收标准

- [x] 生产代码中没有 `conversion` 错误层或 `ConversionError`；SND 转换与音频预算的失败都是 `SourceError`，code 为 `invalid-payload`、`unsupported-payload` 或 `limit-exceeded`，位置与 03、04 相同。
- [x] AC-01、AC-04、AC-05 的全部用例以新的 code 通过：
  - 预检失败仍为零块读取；
  - 预算超限的 `limit` 为 `{ name: <预算维度>, limit, observed }`，溢出时 `observed` 为 null；
  - `toData()` 冻结且可结构化克隆。
- [x] P2-03 既有的 `SourceError` 测试与协议穷举记录通过；新增 code 与限值名都合协议 DTO 语法。
- [x] AC-06：
  - `PRODUCTION_CONVERTER_VERSION` 为 `osr-import.audio-1`，能通过 `readConverterVersion`，含 `AUDIO_CONVERTER_COMPONENT`；
  - `ManifestIdentity` 对 `ConverterVersion` 与来源（类别与令牌）各自敏感；
  - 原有的确定性、无歧义与敏感性用例仍通过；
  - 新的固定值经 `node:crypto` 对同一 ASCII 文本独立核对。
- [x] `pnpm exec vitest run src/content src/original-data src/workers tools/engineering-boundaries.test.ts`、`pnpm check` 通过。

## 验证方法

- Node 测试；只用代码生成的合成数据。
- 不适用浏览器或原版对照。
- 完成前按 execute-goal 流程，以本子任务 diff 为范围做 rubber-duck 审查与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据

- **`source` 层错误：**
  - **扩展：** [source-error.ts](../../../../../src/original-data/source-error.ts) 追加 `invalid-payload`、`unsupported-payload`；`SourceLimitName` 追加全部预算维度；`observed` 改为 `number | null`。P2-03 既有 code、限值与其测试不变。
  - **替换：** SND 解析、音频预检与预算计量改为抛出 `SourceError`。删除 `conversion-error.ts` 及其测试。
  - **预算位置：** 改为该行首个 locator 的路径：预检时加 `.size`，实际计量时为该 locator 本身。原因是裸 `sources.mappings[i]` 在 P2-03 语法中明确被拒绝。
  - **语法与回归：** [source-error.test-support.ts](../../../../../src/original-data/source-error.test-support.ts) 的语法预言只追加“映射路径 + SND 头部字段”，P2-03 原有的接受与拒绝用例不变。音频转换测试对每个 `SourceError` 断言 `inLocationGrammar`。协议测试的穷举记录随之同步。
- **`ConverterVersion`：** 新增 [converter-version.ts](../../../../../src/original-data/conversion/converter-version.ts)，唯一的生产常量 `PRODUCTION_CONVERTER_VERSION` 为 `osr-import.audio-1`，由 `AUDIO_CONVERTER_COMPONENT` 组成并经 `readConverterVersion` 校验。测试断言其值、组件，以及能经 `readContentIdentity` 读取。
- **`ManifestIdentity`：** [manifest-identity.ts](../../../../../src/content/manifest-identity.ts) 改为 P2-09 的定义：
  - **输入：** 增加 `converterVersion` 与 `origin`。
  - **编码：** 依次为 `schemaVersion`、`sliceId`、切片定义版本、`converterVersion`、来源 `[类别, 令牌]`、各组；采用 ASCII 编码，去掉了原序列化标签。
  - **固定值：** 已用 `node:crypto` 对同一 ASCII 文本独立核对后更新。
  - **用例：** 原有的确定性、无歧义与 16 项敏感性用例全部保留，另加 `converterVersion`、来源令牌、来源类别 3 项敏感性用例，以及非法 `converterVersion`、非法来源 2 项拒绝用例。
- **命令：** `pnpm exec vitest run src/content src/original-data src/workers src/app/import tools/engineering-boundaries.test.ts`（1,545 通过）；`pnpm check` 通过（102 个测试文件、2,981 个测试，构建成功）。
- **rubber-duck：** 无阻塞、无非阻塞问题。审阅确认三点：P2-03 契约是纯追加；语法预言仍是封闭的；身份覆盖了 P2-09 要求的全部字段与顺序。
- **simplify：**
  - **采纳：** 复用 `ManifestIdentityInput`，去掉重复的内部接口；ASCII 编码改为简单循环；在 content-identity 中导出 `originToken`，供 `contentIdentityKey` 与身份序列化共用。
  - **未采纳：** 跨层共享 ASCII 辅助函数，以及改动 storage 的缓存键实现，都超出本子任务范围。
- **文档影响：** [源码结构指南](../../../../engineering/source-structure.md)作了以下更新，工程约定无需修改：
  - 目录树去掉 `conversion-error.ts`，加入 `converter-version.ts`；
  - `manifest-identity.ts` 一条改为新的输入与编码；
  - “原版格式转换”一节改为 `source` 层追加 code，并新增生产 `ConverterVersion` 一条；
  - SND、预检与门槛中的 code 名同步；
  - P2-03 错误一条指向追加的 code。
- **后续修订（执行期修订三）：** 2026-10-05 合并 `main` 时，P2-05 已以 `budget-exceeded` 落地预算超限 code。合并提交中，`conversion-budget.ts` 与 03、04、14 的相关测试已改为 `budget-exceeded`；`limit-exceeded` 只保留给结构限值（见 [goal 执行记录](../goal.md#执行记录)）。本条以上的证据记录的是本子任务完成时的状态。
