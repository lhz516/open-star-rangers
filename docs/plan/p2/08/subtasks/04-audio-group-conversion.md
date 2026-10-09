---
type: plan
status: active
phase: P2
task: "08"
subtask: "04"
updated: 2026-10-08
---

# 04 — 音频组转换、目录预检与预算

**契约来源：** [spec](../spec.md) 的 S-03（行形状与投影）、S-05、S-10（转换部分）、S-12（本子任务部分），AC-04、AC-05、AC-11（转换只经产品入口与 `verifySourceMappings`）；[切片音效集合](../spec.md#切片音效集合)、[Asset ID 规则](../spec.md#asset-id-规则)、[研究要求](../spec.md#研究要求)中的两类门槛、[转换与导入作业](../spec.md#转换与导入作业)、[音效描述符与生产音效表](../spec.md#音效描述符与生产音效表)、[音频转换预算](../spec.md#音频转换预算)。
**依赖：** 01、03。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **音效表的行与读取：** 在计划新增的 `src/original-data/conversion/audio-conversion.ts` 中定义行 `{ role, mapping }` 及其严格读取：
  - `role` 为四个核心角色之一或 `model-sound`，并与 Asset ID 规则一致：核心角色 ID 以 `sound/<角色词干>` 开头，`model-sound` 的 ID 形如 `sound/model-clip/<两位序号>`；
  - `mapping.asset.kind` 为 `sound`；`mapping` 只有一个部件，各别名的 locator 都是 `MAIN/SR.NOB` 的 `SND`，`subresource` 为 null；
  - 行按 Asset ID 升序，ID 唯一。

  映射投影为 `{ sourceFingerprint: null, mappings }` 后交给既有的 `readSourceMappingTable`；不扩展 P2-01 读取器。
- **目录预检：** 读取任何 SND 块之前，经 `VerifiedSource.openArchive` 只读目录，并按 spec 的顺序检查：
  1. 每个 locator（含全部别名）存在且类型为 `SND`，否则保留 `SourceError` 的原 code；
  2. 每行第一个 locator 的块大小若小于 20，以 `invalid-sound` 失败；
  3. 按 `payloadBytes = 16 + 块大小 − 20`、`audioSamples = 块大小 − 20` 与 `assets` 核算上界。超限或溢出时以 `ConversionError('limit-exceeded')` 失败。预检不计入用量。
- **核验与转换：**
  - 预检通过后调用 `verifySourceMappings`，取得绑定指纹的表，再经 `assetSourceStates` 得到来源状态集；
  - 逐行经 `handle.read(id, 'SND')` 读取第一个 locator，用 03 的解析器与注入的格式规则转换；
  - 按实际 payload 字节数与采样点数核算并计入用量，每个维度只计一次，被拒绝的增量不部分计入。
- **预算常量：** 导出 spec 表中的音频预算限值：`assets` 37、`dependencyEdges` 0、`audioSamples` 4,194,304、`payloadBytes` 8,388,608，其余为 0。经 P2-01 的 `chargeBudget` 核算。
- **组草稿：** 输出不含 `ManifestIdentity` 的组草稿：
  - 描述符：`kind: 'sound'`、`group: 'audio'`、空依赖、payload schema 1；
  - payload 记录：每个 Asset 独占缓冲；
  - 来源状态集；
  - 转换用量。

  清单身份由 06 填入。
- **版本组件：** 导出本转换器的版本组件常量 `audio-1`，供 06 组成 `ConverterVersion`。
- **门槛行为：**
  - 格式在规则内、角色映射为 `unconfirmed` 时照常转换，组由 P2-01 判为 `incomplete`；
  - 缺少某个核心角色时同样照常输出；
  - 格式不在规则内时以 `unsupported-sound-format` 失败。
- **测试：**
  - 相邻的 `audio-conversion.test.ts`；
  - 合成光盘含 `MAIN/SR.NOB`，由 `buildImfat` 与 03 的合成 SND 构造；
  - 经 `syntheticFileDisc`、`catalogFor` 与 `identifySource` 得到合成的已验证来源；
  - 读取计量用计量的合成字节端口。
- **文档：** 在源码结构指南记录转换流程、预检、预算常量与组草稿形状。

## 不包含

- 生产音效表的行与生产规则（06 建立空模块，11 填入）。
- `ManifestIdentity` 的计算与填入、作业阶段与进度、发送（02、06）。
- 协议与宿主的错误转换（05）。

## 关键文件与契约

- **计划新增：** `src/original-data/conversion/audio-conversion.ts` 与 `.test.ts`。
- **复用：**
  - [verify-source-mappings.ts](../../../../../src/original-data/source/verify-source-mappings.ts)、[source-mapping.ts](../../../../../src/original-data/source-mapping.ts) 的 `readSourceMappingTable`、`assetSourceStates`；
  - [open-verified-source.ts](../../../../../src/original-data/source/open-verified-source.ts) 再导出的 `VerifiedSource` 类型，以及 [archive-reader.ts](../../../../../src/original-data/archive/archive-reader.ts) 的 `ImfatArchiveHandle` 类型（只作纯类型导入）；
  - [budget.ts](../../../../../src/content/budget.ts) 的 `chargeBudget`、`EMPTY_BUDGET_USAGE`；
  - [completeness.ts](../../../../../src/content/completeness.ts) 的 `validateGroup`（测试中验证草稿加合成身份后的结果）；
  - 01、03 的模块。
- **测试支持：** [disc.test-support.ts](../../../../../src/original-data/disc/disc.test-support.ts)、[source.test-support.ts](../../../../../src/original-data/source/source.test-support.ts)、[synthetic.ts](../../../../../src/original-data/synthetic.test-support.ts)。

## 验收标准

- [x] AC-04（完整）：合成表覆盖四个核心角色与一个 `model-sound`、一对精确别名。草稿加合成包身份后，经 `validateGroup(CLASSIC_P2_SLICE, …)` 为 `group-complete`，没有外部要求；payload 的版本、长度与指纹与描述符一致；每个 payload 独占缓冲；来源状态集绑定已识别的指纹。
- [x] AC-04（不完整）：格式在规则内时，一个核心角色的映射为 `unconfirmed`，结果为 `incomplete` 且诊断为 `source-not-ready`，并带对应 U 项；删去一个核心角色的全部行，结果为 `incomplete` 且诊断为 `role-cardinality`。
- [x] AC-04（失败）：`flags` 或位宽不在规则内，以 `conversion/unsupported-sound-format` 失败，不产生 payload；别名的两个条目内容不同，以 `source/alternatives-differ` 失败。
- [x] AC-03（读取部分）：行读取拒绝以下各项：未知 `role`；ID 与角色不一致；非 `sound` kind；多个部件；非 `MAIN/SR.NOB`/`SND` 的 locator；`subresource` 非 null；乱序与重复 ID。投影能通过 `readSourceMappingTable`；带 `role` 的整行不送入它。
- [x] AC-05（预算）：每个音频预算维度在等于上限时通过，超过 1 时以 `limit-exceeded` 失败，`limit` 的名称、上限与观测值正确；累加溢出时观测值为 null。
- [x] AC-05（预检）：预检超限时，读取计量证明没有任何 SND 块被读取，包括 `verifySourceMappings` 的核验读取；不分配 payload。块大小为 8 字节的条目在预检中以 `conversion/invalid-sound` 失败，同样零块读取、零分配。`payloadBytes` 计入含 16 字节头部的完整 payload。
- [x] AC-11（转换部分）：本模块只经 `VerifiedSource` 与 `verifySourceMappings` 取得字节，能力边界的 lint 与依赖图回归通过。
- [x] `pnpm exec vitest run src/original-data tools/engineering-boundaries.test.ts`、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- Node 测试，使用代码生成的合成光盘与注入的合成表、规则。读取计量记录每次读取的范围，用来断言“没有块被读取”。
- 不适用浏览器或原版对照；真实镜像在 12 中核对。
- 完成前按 execute-goal 流程，以本子任务 diff 为范围做 rubber-duck 审查与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据

- **实现：**
  - [audio-conversion.ts](../../../../../src/original-data/conversion/audio-conversion.ts)：
    - **读取与常量：** `readSoundTable` 先投影给 `readSourceMappingTable`，再核对角色、ID 规则、kind、单一部件、`MAIN/SR.NOB` 的 `SND` locator，以及 SND 条目不跨行复用。另导出 `AUDIO_BUDGET_LIMITS`、`AUDIO_CONVERTER_COMPONENT`（`audio-1`）与 `AUDIO_SOURCE_ARCHIVE`。
    - **流程：** `convertAudioGroup` 先做三遍目录预检（locator 存在且为 SND → 首个块不小于 20 字节 → 上界核算），再依次调用 `verifySourceMappings` 与 `assetSourceStates`，最后逐行读取、`convertSnd` 并按实际值计量。
    - **输出：** 不含清单身份的组草稿。`limits` 选项只供测试使用。
  - [conversion-budget.ts](../../../../../src/original-data/conversion/conversion-budget.ts)：`chargeConversionBudget` 把 P2-01 预算违规转为 `conversion/limit-exceeded`，供后续转换器共用。
- **测试：** [audio-conversion.test.ts](../../../../../src/original-data/conversion/audio-conversion.test.ts) 使用合成光盘：`MAIN/SR.NOB` 由 `buildImfat` 与 `syntheticSnd` 构造，经 `catalogFor` 与 `identifySource` 识别。块读取由包装后的 `VerifiedSource` 按条目 ID 记录。
  - **AC-04 完整：** 四个核心角色与一个带精确别名的 `model-sound`，经 `validateGroup` 为 `group-complete`，`externalRequirements` 为空。描述符为 sound/audio、无依赖、schema 1；payload 格式正确，且 `payloadTransferList` 接受全部 payload；来源状态集绑定识别指纹。读取顺序证明先核验全部别名，再转换首个 locator。
  - **AC-04 不完整：** `unconfirmed` 的 fire 为 `source-not-ready@sound/fire`，带 `U-004`；缺少 warp 为 `role-cardinality`。
  - **AC-04 失败：** 未列入的 `flags` 与 12 位为 `unsupported-sound-format`，位置为映射路径加字段；别名内容不同为 `source/alternatives-differ`。
  - **AC-05 预检：** 以下失败都是零块读取：缺失条目、超出 u32 的 ID 与类型不符（各为 `source` 层原 code）、8 字节块（`conversion/invalid-sound`，位置以 `.size` 结尾），以及封包不在白名单内（报在首个映射路径）。另断言 locator 检查先于块大小检查。
  - **AC-05 预算：** `assets`、`payloadBytes`、`audioSamples` 各自等于上限时通过；超过 1 时以 `limit-exceeded` 失败，`{ name, limit, observed }` 正确，且零块读取。生产 `assets` 上限 37 在真实常量下通过，38 时失败。`usage` 每个维度只计一次，`payloadBytes` 含 16 字节头部。
  - **溢出：** 实际计量的溢出语义（`observed: null`）在 [conversion-budget.test.ts](../../../../../src/original-data/conversion/conversion-budget.test.ts) 中直接测试。预检通过后，实际值总不超过上界（payload 字节相等，采样点数不多于样本字节数），所以经 `convertAudioGroup` 无法触发实际计量超限。
  - **AC-03 行读取：** 15 个拒绝用例：未知角色、ID 与角色不符、两位序号与变体段规则、非 sound kind、两个部件、其他封包、其他类型、子资源、乱序、重复 ID、多余字段、非法映射、两核心角色共用条目、核心条目被模型别名复用。合法的核心变体 `sound/fire/v1` 被接受。
- **命令：** `pnpm exec vitest run src/original-data tools/engineering-boundaries.test.ts` 通过，包括 AC-11 的能力边界与依赖图回归。`pnpm check` 通过（101 个测试文件、2,928 个测试，构建成功）。
- **rubber-duck：** 指出一项阻塞问题：同一 SND 条目可以绑定到多个 Asset，违反“同一源样本只形成一个 Asset”。已在 `readSoundTable` 中拒绝跨行复用（`duplicate-mapping`），并加入两个回归用例；生产资产上限测试改用 34 个不同的合成条目。
- **simplify：**
  - **采纳：** 预检首遍即缓存首个 locator 的块大小，不再重复查找；角色 ID 正则在模块级预编译；打开封包的失败也改写为映射路径，并补充测试。
  - **未采纳：** 把定位与错误改写抽成与 `verify-source-mappings.ts` 共用的辅助函数，因为要改动 P2-03 已批准的模块，超出本子任务范围；测试共用一个已识别来源，因为会牺牲用例间的计量隔离。
  - 复跑检查通过。
- **文档影响：** [源码结构指南](../../../../engineering/modules/original-data.md#原版格式转换)的目录加入 `conversion-budget.ts` 与 `audio-conversion.ts`，并新增“转换预算”“音频组”两条（音效表、常量、流程、输出与门槛）。工程约定无需修改：能力边界与命令不变。

- **后续修订：** 2026-10-05 按修订后的 spec，由 [14](./14-shared-mechanism-alignment.md) 改为与 P2-05、P2-09 共享的机制（见 [goal 执行记录](../goal.md#执行记录)）。预检与预算的错误改为 `SourceError`（`invalid-payload`、`limit-exceeded`）。合并 P2-05 后，预算超限再改为 `budget-exceeded`（执行期修订三）。本条以上的证据记录的是本子任务完成时的状态。
