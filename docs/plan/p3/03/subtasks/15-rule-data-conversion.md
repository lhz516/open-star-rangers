---
type: plan
status: active
phase: P3
task: "03"
subtask: "15"
updated: 2026-10-09
---

# 15 — 规则数据的来源映射与转换

**契约来源：** [spec](../spec.md) 的 S-03 至 S-08（logic 组）、S-14、AC-03 至 AC-06（转换部分）、AC-13、AC-14（份额计量）、AC-18；[来源映射与核验](../spec.md#来源映射与核验)、[限值与预算](../spec.md#限值与预算)。
**依赖：** 10, 11, 12。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **生产映射表：** 在计划新增的 `production-rule-data.ts` 中为 6 个 logic 组 Asset 定义映射，置信度、U 项与证据按 spec 的 [Asset 与角色](../spec.md#asset-与角色)表：
  - `data/craft-info`：TABL 4003，带所选槽与组的子资源；CINF 4037；
  - `data/debris-parameters`：`DEBRIS.NOB` TABL 4501；
  - `data/ai-programs`：AICO 6001，带组 0 子资源；TABL 6003；22 个 TABL 与 3 个 DFPG；EXE 区域 `0x1762f8`；
  - `data/comm-menus`：5 张 COMM TABL；
  - `data/base-repair-items`：TABL 10165，带选择字段子资源；
  - `data/flight-messages`：7 个 EXE 区域（由 [production-executable.ts](../../../../../src/original-data/conversion/production-executable.ts) 生成）。

  条目 ID 只出现在映射表与测试的合成数据中。
- **转换函数：** 计划新增的 `convertRuleData(source, limits, usage)` 依次完成：
  1. 用步骤内读取，以同一个已验证来源核验映射，每个条目只物理读取一次，读取前按目录项检查大小；
  2. 调用 10–12 的解析器；
  3. 核对 ID 链：TABL 4003 所选一对的 CINF ID 等于映射的 CINF 部件；AISTUFF 解析得到的 ID 集合恰为映射的 25 个部件；不一致为 `subresource-mismatch`；
  4. 只在解析出子资源之后，才把带子资源的部件升为 `verified`；
  5. 按 08 的编码产出 payload 与描述符。

  返回可并入 logic 组草稿的分区（描述符、payload 与来源状态）以及累计用量，由 19 与 `convertLogic` 的草稿合并。本项不接入生产作业，也不修改 `convert-logic.ts`。
- **预算：** 先计量后分配，按 P2-01 的十二个维度。计量函数与份额常量 `PRODUCTION_RULE_DATA_SHARE` 在本项定义；份额的数值由 19 依本地观测值按规则推导后填入，本项测试使用注入的限值。
- 用代码生成的合成封包与合成光盘（合成支持在 `rule-data.test-support.ts`）编写测试：
  - 正向转换与来源状态；
  - 四类子资源的核验；
  - TABL 4003→CINF 与 AISTUFF 集合的不一致；
  - 槽或组越界；
  - 预算恰等于上限时通过、超出 1 时报 `budget-exceeded`，观测值包含先前用量；
  - 转换器计入的用量等于独立计算的值；
  - 读取日志中每个条目只读一次。

## 不包含

- 接入 `import-job.ts`、合并 logic 组草稿、份额数值、转换器组件与生产包配置：归 19。
- 解析器与 payload 契约：由 08、10–12 提供。
- 模块分册：由 22 同步。

## 关键文件与契约

- [logic-sources.ts](../../../../../src/original-data/conversion/logic-sources.ts)、[step-entry-reader.ts](../../../../../src/original-data/conversion/step-entry-reader.ts)、[verify-source-mappings.ts](../../../../../src/original-data/source/verify-source-mappings.ts)、[conversion-budget.ts](../../../../../src/original-data/conversion/conversion-budget.ts)（只读）：P2-09 的映射核验、步骤内读取与预算计量。
- [production-executable.ts](../../../../../src/original-data/conversion/production-executable.ts)（只读）：区域 locator。
- 计划新增：`src/original-data/conversion/convert-rule-data.ts`、`production-rule-data.ts`、`rule-data.test-support.ts` 与测试。

## 写入范围

- `src/original-data/conversion/convert-rule-data.ts`：映射核验、ID 链与转换（新建）。
- `src/original-data/conversion/convert-rule-data.test.ts`：测试（新建）。
- `src/original-data/conversion/production-rule-data.ts`：生产映射表与份额常量（新建）。
- `src/original-data/conversion/production-rule-data.test.ts`：映射表的读取与形状测试（新建）。
- `src/original-data/conversion/rule-data.test-support.ts`：合成封包与合成光盘（新建）。
- `src/original-data/conversion/step-entry-reader.ts`：内置表区域改用 `readFixedUpRegion` 读取（派发时扩大，见 goal 执行记录中 11 的交接）。
- `src/original-data/conversion/step-entry-reader.test.ts`：对应测试（新建或扩展）。

## 验收标准

- [x] AC-03 至 AC-06（转换部分）：合成来源转换出 6 个 Asset，选择、ID 链与越界按 spec 处理；TABL 10165 与 COMM 中不属于本任务的条目和字段不出现在 payload 中。
- [x] AC-13：生产映射表能通过 `readSourceMappingTable` 读取；不带子资源的部件经核验为 `verified`，带子资源的部件只在解析后为 `verified`；来源状态绑定指纹；两条 ID 链的不一致都报 `subresource-mismatch`；置信度与 U 项符合 Asset 表。
- [x] AC-14（份额计量）：恰等于上限时通过，超出 1 时为 `budget-exceeded`，观测值包含先前用量；被拒绝的扣除不改变用量；转换器计入的用量等于独立计算的值。
- [x] AC-18：只经 `VerifiedSource` 读取；诊断不回显值；测试不读取文件。
- [x] `pnpm exec vitest run src/original-data tools/engineering-boundaries.test.ts` 与 `pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- Node 测试，使用代码生成的合成封包、合成 EXE 区域与记录读取的合成光盘端口。不涉及浏览器或原版数据。

## 完成证据

2026-10-09，worker `exec-p3-03-15`，基于认领提交 b4bb46c。

- **实现：**
  - [production-rule-data.ts](../../../../../src/original-data/conversion/production-rule-data.ts)（新建）：
    - `RuleDataSources`：6 个 Asset 的来源按转换中的角色给出（每个 Asset 一个封包路径与条目 ID，EXE 区域为 `ExecutableRegion`），另含切片候选 `candidate`。映射表由它生成，因此映射与转换读取的部件不会不一致；测试注入合成计划。
    - `ruleDataLocators(sources)`（类型 `RuleDataLocators`）与 `ruleDataMappings(sources)`：每个 Asset 一条 `declared` 映射，按 Asset ID 排序、部件按规范 locator 顺序；置信度、U 项与证据按 spec Asset 表（`flight-messages` 为 `confirmed`、无 U 项，其余 `likely`）。子资源：TABL 4003 为候选的一对 `group-0/slot-1`（沿用 SCCT 槽位的写法），AICO 为 `group-0`，TABL 10165 为 `records/subsystem-selector`。
    - `PRODUCTION_RULE_DATA_SOURCES` 与 `PRODUCTION_RULE_DATA_MAPPINGS`：`CRAFT.NOB` TABL 4003、CINF 4037；`DEBRIS.NOB` TABL 4501；`AISTUFF.NOB` AICO 6001、TABL 6003、组 0 闭包的 3 个 DFPG（6013、6025、6031）与 22 个脚本 TABL（6009–6045 与 6051–6061 的奇数 ID 中除 DFPG 外者）；EXE 内置表 `0x1762f8`（长 0x34C，含数量字）与 10 个名称区域（`0x1722b4` 起，各恰为名称加 NUL，长 10、12、11、17、8、13、5、8、8、5）；`COMM.NOB` TABL 2003/2005/2007/2009/2013 按 `comm-menus.ts` 的键；`SR.NOB` TABL 10165；7 条飞行消息按 executable 飞行消息表的地址与长度。地址经 `production-executable.ts` 的 `objectOffset` 换成对象与偏移。
    - `PRODUCTION_RULE_DATA_SHARE`：完整、全为 0 的预算记录，数值由 19 按本地观测值推导后填入；为 0 时任何规则数据 Asset 都无法计入，误接线会失败。
  - [convert-rule-data.ts](../../../../../src/original-data/conversion/convert-rule-data.ts)（新建）：`convertRuleData(source, limits, usage = EMPTY, sources = PRODUCTION_RULE_DATA_SOURCES): Promise<RuleDataConversion>`，结果为 `{ partition: GroupDraft, usage }`。`partition` 的 `group` 为 `logic`，`assets` 按 ID 升序（6 个 data Asset，无依赖，各 schema 1），`payloads` 一一对应，`sources` 为绑定来源指纹的 `SourceStateSet`；19 把它与 `convertLogic` 的草稿按 ID 合并。另导出计量函数 `ruleDataIncrement(payloadBytes)` = `{ assets: 1, dependencyEdges: 0, payloadBytes }`。流程：
    1. 映射核验与转换共用一个 `stepEntryReader`，其 `beforeRead` 按解析器的条目上限（`CRAFT_TABLE_FORMAT.entryBytes`、`CRAFT_INFO_ENTRY_BYTES`、`DEBRIS_ENTRY_BYTES`、`AI_SOURCE_LIMITS` 按 AICO/程序表/DFPG/脚本、`COMM_MENU_ENTRY_BYTES`、`BASE_REPAIR_ENTRY_BYTES`）调用 `requireEntryBytes`，超限在读取字节前报 `limit-exceeded`（`payloadEntryBytes`），位置为映射路径。
    2. 按 Asset ID 顺序逐个读取与解析（首个失败确定）：内置表经 `readFixedUp` 读取，名称经普通区域读取；读取前按区域长度判定内置表可容纳的记录数（`aiProgramRecords`，位置 `…/programs`）与名称的 `textBytes`，与解析器的判定相同但先于读取。
    3. ID 链：TABL 4003 所选一对的 CINF ID 不等于映射的 CINF 部件时，在 TABL 部件的映射路径报 `subresource-mismatch`；AISTUFF 的映射部件全部交给 `parseAiPrograms`，它要求给定条目恰为 ID 链所到达的条目，多出或缺少都为 `subresource-mismatch`（位置为多出的条目或引用缺失条目的字段）。槽或组越界由 `parseCraftTable` 报 `subresource-mismatch`，组超出 AICO 三元组由 `parseAiPrograms` 报同一 code。
    4. 计量：每个 Asset 在 `encodeRuleDataPayload` 的 `reserve` 中、分配字节之前以 `chargeConversionBudget` 计入，位置为该 Asset 映射首个部件的路径；被拒绝的扣除不改变用量。
    5. 全部成功后才把 6 条映射升为 `verified`（不带子资源与区域的 `comm-menus`、`debris-parameters` 已由 `verifySourceMappings` 核验；其余在解析后）。读取器与缓存只存活于解析阶段（`parseRuleData`）。
  - [step-entry-reader.ts](../../../../../src/original-data/conversion/step-entry-reader.ts)：新增 `stepRegionReaders(source)` → `{ read, readFixedUp }`（类型 `StepRegionReaders`、`FixedUpRegionReader`），共用一个可执行文件缓存，按读取方式各缓存区域；`readFixedUp` 经 `LeExecutable.readFixedUpRegion` 返回 `FixedUpRegion`。`stepRegionReader(source)` 仍返回普通读取器，`effect-step.ts`、`graphics-step.ts` 不变。
- **合成支持：** [rule-data.test-support.ts](../../../../../src/original-data/conversion/rule-data.test-support.ts)：`syntheticRuleData(contents?)` 返回合成计划（合成条目 ID 与区域，与生产值不同；COMM 沿用 comm 测试支持的 ID）、各封包的条目（测试可在构建前修改）与 LE 文件（对象 1 为飞行消息，对象 2 为处理程序目标，对象 3 为名称，对象 4 为内置表，一个 fixup 跨页）；`ruleDataFiles(…)` 生成光盘文件；`defaultRuleDataContents()`、`SYNTHETIC_RULE_DATA_IDS`。每个封包另含未映射的诱饵条目（另一 CINF、ID 链外的脚本与 DFPG、COMM TABL 2001 与 2011、SR 的另一 TABL）。
- **AC-03 至 AC-06（转换部分）：** [convert-rule-data.test.ts](../../../../../src/original-data/conversion/convert-rule-data.test.ts)（30 例）。6 个 payload 解码后与合成内容深度相等；倍率来自候选的一对；`base-repair-items` 只有 `subsystemSelectors`，`comm-menus` 只有 5 个键；读取日志中每个封包的文件头与目录各读 1 次、每个映射条目恰读 1 次，诱饵条目（含 COMM 2001、2011）不被读取。拒绝：CINF 部件不是所选一对指向的条目、候选槽 18、候选组 3（AICO 有 4 组时到达 TABL 4003 `/rows[1]/pairs[3]`；只有 3 组时为 AICO `/groupTriples[3]`）、AISTUFF 多出脚本或 DFPG、缺少 DFPG 或脚本，都为 `subresource-mismatch` 且位置精确；TABL 10165 的选择值超出值域时为解析器的 `unsupported-payload` 且不产生分区。
- **AC-13：** [production-rule-data.test.ts](../../../../../src/original-data/conversion/production-rule-data.test.ts)（6 例）：生产表经 `readSourceMappingTable` 读取不变、指纹为 null、全部 `declared`、`diagnoseSourceMappings` 无类型冲突；置信度与 U 项逐条符合 Asset 表；子资源为候选（组 0、槽 1）的写法；AI 部件为 2 + 25 + 1 + 10，DFPG 3 个、TABL 23 个（含 6003），内置表区域为对象 4 偏移 0x62F8、长 0x34C，名称在对象 4、`0x1722b4`–`0x17231f` 起、4–16 字节且不重叠；7 个飞行消息区域与 executable 表的 locator 一致且在 128 字节内；`PRODUCTION_RULE_DATA_SHARE` 为完整的空记录。转换测试另核对：合成表经 `verifySourceMappings` 后 `comm-menus`、`debris-parameters` 为 `verified`，其余 4 条仍为 `declared`；转换成功后 6 条都为 `verified`，`SourceStateSet` 绑定来源指纹，U 项符合 Asset 表。
- **AC-14（份额计量）：** 用量等于由描述符独立计算的值（6 个 Asset、0 条依赖边、payload 字节之和）；在先前用量（含其他维度）之上恰等于上限时通过，结果用量等于上限；payload 字节少 1 时在最后一个 Asset 报 `budget-exceeded`（`payloadBytes`，观测值 = 上限 + 1，含先前用量）；Asset 数少 1 时报 `assets`（上限 10、观测 11）；失败后调用者的用量不变，以足够的上限重跑得到同一用量；起始用量含 `sourceReadBytes` 时为 `invalid-budget-value`。结构限值：9 类条目各超出解析器上限 1 字节时在读取前报 `limit-exceeded`（读取日志中该条目为 0 次），TABL 10165 恰等于上限时通过；飞行消息区域超出 `textBytes`、名称区域超出 `textBytes`、内置表超出 `aiProgramRecords` 都在读取前拒绝；区域不恰为字串与 NUL 时为 `invalid-payload`。
- **AC-18：** 只经 `VerifiedSource` 读取（合成光盘与记录读取的端口）；失败经 `sourceFailure` 核对位置语法，诊断中不含 MARKER 与合成条目 ID；测试不读取任何文件。
- **步骤读取器：** [step-entry-reader.test.ts](../../../../../src/original-data/conversion/step-entry-reader.test.ts)（新建，6 例）：条目只读 1 次并共享结果；`beforeRead` 先看到目录项，可在读取字节前拒绝；超出 u32 的 ID 为 `entry-not-found`；可执行文件只打开 1 次，每个区域按读取方式各读 1 次；`readFixedUp` 返回 fixup，同一区域经普通读取为 `invalid-payload`；打开失败位于首次读取的 `openPath`。
- **检查：** `pnpm exec vitest run src/original-data tools/engineering-boundaries.test.ts`（59 个文件、2,018 例通过）；`pnpm typecheck`、`pnpm lint` 通过；`pnpm check` 通过（177 个文件、5,519 例，生产构建成功）。
- **本地核对：** 未运行。协调者在 P3-02 的基准测量期间要求暂缓读取原版数据的私有核对。名称区域的长度取自 03 的只读 Ghidra 输出（`local/research/p3-03/ai/out`，只取长度），与 ai §3.3 的范围与 4–16 字节一致；生产映射在基准上的完整运行（含名称长度）由 19 的本地作业完成，长度不符时会以 `invalid-payload` 失败而不是产生错误数据。
- **Rubber-duck：** 审阅了全部新增与修改文件对照 spec 与本项验收，未发现问题。
- **Simplify（4 个角度）：**
  - **采纳：** 区域读取器改为两个有类型的缓存，去掉 `Promise<unknown>` 与类型断言；`craftTableSubresource`、`aiGroupSubresource`、`BASE_REPAIR_SUBRESOURCE` 不再导出；`RuleDataLocators` 改为由 `ruleDataLocators` 推断；解析与编码拆分，读取器与缓存在编码前释放；测试中的单用途辅助内联，读取日志按封包缓存标签。
  - **未采纳：** 内置表与名称的读取前判定宜移入 `formats/ai.ts`（写入范围外，交 22 或后续简化）；`ai.test-support.ts` 私有的 `fixupRecord` 与 LE 构建、`source.test-support.ts` 的 `loggedReads`（对 EXE 不适用）宜推广后共用（写入范围外）；区域 locator 文本与 `executableRegionAt` 的重复（后者只接受地址）；改为从已绑定映射表解析子资源字符串（P2-09 的做法）——生成映射可保证一致，未改；`partPath` 的线性查找与读取缓存的逻辑重复读取，规模可忽略。
- **文档影响：** 写入范围内没有文档需要改。交 22：
  - original-data 分册：上述 API、条目上限对应、子资源写法与 `stepRegionReaders`；
  - [ai §1 与 §3.3](../../../../original/formats/ai.md)：记录组 0 闭包的 25 个条目 ID（DFPG 与 TABL 分列）与 10 个名称区域的地址与长度，使生产映射中的 ID 与区域有 `docs/original` 出处；
  - 源码结构目录树加入 `convert-rule-data.ts`、`production-rule-data.ts`。
