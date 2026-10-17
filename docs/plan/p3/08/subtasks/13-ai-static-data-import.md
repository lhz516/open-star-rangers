---
type: plan
status: active
phase: P3
task: "08"
subtask: "13"
updated: 2026-10-15
---

# 13 — AI 解析数据导入

**契约来源：** [spec](../spec.md) 的 S-02、AC-14；[跨任务修订](../spec.md#跨任务修订d-03)、[持久化与兼容](../spec.md#持久化与兼容)；09 定稿的 [P3-03 修订](../../03/spec.md)。
**依赖：** 09。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 按 P3-03 修订，把关键字表等解析用静态数据作为 EXE 区域导入 `data/ai-programs`：
  - 原版数据：[ai.ts](../../../../../src/original-data/formats/ai.ts) 读取新区域（LE fixup 与字符串目标校验、表项与预算）；转换器 [convert-rule-data.ts](../../../../../src/original-data/conversion/convert-rule-data.ts)、映射 [production-rule-data.ts](../../../../../src/original-data/conversion/production-rule-data.ts)；
  - 内容契约：[ai-programs.ts](../../../../../src/content/rule-data/ai-programs.ts) 加入表的类型与读取，[rule-data-payload.ts](../../../../../src/content/rule-data/rule-data-payload.ts) 的 `ai-programs` schema 由 1 递增；合成辅助 [rule-data.test-support.ts](../../../../../src/content/rule-data/rule-data.test-support.ts) 与 [production-rule-data.test-support.ts](../../../../../src/original-data/conversion/production-rule-data.test-support.ts) 同步；
  - 生产 `ConverterVersion`（[converter-version.ts](../../../../../src/original-data/conversion/converter-version.ts)）递增，旧缓存不恢复；
  - 会话载入：[mission-input.ts](../../../../../src/app/resources/mission-input.ts) 仍把完整内容交给 Core，不提取局部参数；
  - [package-check.ts](../../../../../tools/package-check.ts) 报告新表的计数与哈希。
- 测试：结构、字符串、fixup、重复键与预算坏值的拒绝（limit 与 limit + 1）；旧 schema 与旧转换器版本的缓存不恢复；合成生产者与消费者一致。
- 文档：[ai](../../../../original/formats/ai.md) §6 的导入处置；[content](../../../../engineering/modules/content.md) 与 [original-data](../../../../engineering/modules/original-data.md) 分册；[本地导入指南](../../../../guides/local-import.md)中须重新导入的说明。
- 本机真实镜像运行 `node tools/package-check.ts local/StarRang/cd/STAR_RANGERS.{ccd,img,sub,cue}`，与独立读取的结构核对；报告只留在 `local/research/p3-08/import/`，公开只记计数与哈希。

## 不包含

- Core 对新表的消费（14、16）；浏览器导入与恢复回归（24）。

## 关键文件与契约

- 见工作范围；全部为已有文件。计划新增的只有被忽略的 `local/research/p3-08/import/`。

## 写入范围

- `src/original-data/formats/ai.ts`：新区域读取。
- `src/original-data/formats/ai.test.ts`：读取测试。
- `src/original-data/formats/ai.test-support.ts`：合成 AI 来源中的关键字表区域、fixup 与名称区域。
- `src/core/world/setup-hash.ts`：setupHash 覆盖新表。
- `src/core/world/create-world.test.ts`：setupHash 覆盖测试。
- `src/app/import/import-pipeline.test.ts`：转换器版本断言。
- `src/workers/import-job.test.ts`：转换器版本断言。
- `e2e/import-worker.spec.ts`：转换器版本断言。
- `src/workers/production-package.test.ts`：规则数据份额的基线观测。
- `src/app/resources/resource-holder-cache.test.ts`：被取代的旧版本不恢复。
- `src/original-data/source-error.ts`：关键字表的上限名称。
- `src/workers/import-protocol.test.ts`：上限名称的穷举清单。
- `src/workers/synthetic-import.test-support.ts`：合成光盘的读取余量。
- `tools/package-check.test.ts`：合成光盘余量与新表的报告断言。
- `tools/logic-check.test.ts`：合成光盘余量。
- `src/original-data/conversion/**`：转换、映射、版本与合成辅助及其测试。
- `src/original-data/synthetic.test-support.ts`：合成 LE 区域（需要时）。
- `src/content/rule-data/**`：内容契约、payload schema、合成辅助与测试。
- `src/app/resources/mission-input.ts`：完整内容的传递。
- `src/app/resources/mission-input.test.ts`：传递测试。
- `src/workers/production-package.ts`：生产包配置随版本变化时。
- `tools/package-check.ts`：报告新表。
- `docs/original/formats/ai.md`：导入处置。
- `docs/engineering/modules/content.md`：内容契约说明。
- `docs/engineering/modules/original-data.md`：原版数据说明。
- `docs/guides/local-import.md`：重新导入说明。
- `local/research/p3-08/import/**`：真实镜像核对输出（被忽略）。

## 验收标准

- [x] AC-14 的 Node 部分：schema、转换器版本、映射、读取器与合成生产者/消费者同步；坏值安全拒绝；旧 schema/旧缓存不恢复。
- [x] 真实镜像经 `tools/package-check.ts` 转换通过，新表与独立读取一致；公开记录只含计数与哈希。
- [x] 完整 AI 内容经会话交给 Core；`pnpm check` 通过。

## 验证方法

- 受影响测试文件先跑，再 `pnpm check`；本机运行 package-check；按 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 清理本项范围。

## 完成证据

- **契约（P3-03 修订 3，S-19、AC-23）：** `AiPrograms.keywordTables` 为 4 张 `KeywordEntry { name, value }` 表（地址次序），`ai-programs` payload schema 由 1 递增为 2，`LOGIC_CONVERTER_COMPONENT` 由 `logic-3` 递增为 `logic-4`，`PRODUCTION_CONVERTER_VERSION`/`PRODUCTION_PACKAGE.converterVersion` 为 `osr-import.graphics-5.logic-4.audio-2.models-4`；内容 schema、切片定义版本 6、角色、白名单与导入协议不变。操作码到表的对应 `AI_KEYWORD_TABLE_BY_OPCODE` 与折叠函数 `foldKeywordName` 为 schema 常量，供 Core（14、16）使用。
- **限值：** `AI_PROGRAMS_LIMITS.keywordEntries` 16（观测 6）、`keywordNameBytes` 64（观测 11 推导为 32，按 spec 不低于 `programNameBytes`）；`AI_SOURCE_LIMITS.keywordNames` 32（观测 14）、`keywordNameBytes` 256（观测 111）；新限值名 `aiKeywordEntries`、`aiKeywordNames`、`aiKeywordNameBytes`（`source-error.ts`），单个名称沿用 `textBytes`。转换器读取前按区域长度判定这四项，解析器同样核对。
- **AC-23 测试矩阵（全部为合成数据，名称带 `MARKER`，诊断不含名称与值）：**
  - 正向：[ai.test.ts](../../../../../src/original-data/formats/ai.test.ts)“keyword tables (AC-23)”——4 张表 3/6/2/3 项、第一与第四张相同并共享名称目标、表间共享名称、9 个名称区域部分起于奇数偏移、值含 0、负值、`0x7fffffff` 与 `-0x80000000`，解析结果与内容相同并冻结，payload 往返逐字节相同；经 `openLeExecutable` 的 `readFixedUpRegion`/`readRegion` 读取的合成 LE 文件同样通过；[convert-rule-data.test.ts](../../../../../src/original-data/conversion/convert-rule-data.test.ts) 端到端转换得到同样的表，映射部件为 4 个表区域与名称区域。
  - 拒绝（code 与位置逐项断言）：值字、终止项与跨字的 fixup，缺少 fixup，目标对象不符，存储字不等于目标偏移，终止项前的空项（含 fixup 指向偏移 0 名称区域的情形，rubber-duck 发现后补），缺少终止项，终止项值非零，区域不是整项或只有终止项，表区域不相接或不在同一对象 → `unsupported-payload`/`invalid-payload`；名称目标不在区域起点、映射的名称区域未被引用、重复给出 → `subresource-mismatch`；名称区域缺 NUL、含多余字节、空名称 → `invalid-payload`；表内 A–Z 折叠后重复 → `unsupported-payload`（表间重复与只在 A–Z 之外不同的名称通过）；加法与 16 位源类型的 fixup 在 LE 读取器即为 `invalid-payload`。
  - 限值：每表 16 项通过、17 项 `aiKeywordEntries`；32 个名称区域通过、33 个 `aiKeywordNames`；名称共 256 字节通过、257 字节 `aiKeywordNameBytes`；名称 64 字节通过、65 字节 `textBytes`——解析器测试与转换器“读取前按长度判定”测试各一组。内容读取器：[rule-data-limits.test.ts](../../../../../src/content/rule-data/rule-data-limits.test.ts) 的 `keywordEntries` 与 `keywordNameBytes` limit / limit + 1、表数恰为 4；[rule-data-payload.test.ts](../../../../../src/content/rule-data/rule-data-payload.test.ts) 的空表、空名称、NUL、i32 越界、表内折叠重复与表间重复。
  - 版本与缓存：`ai-programs` schema 1 的描述符为 `unsupported-payload-schema`（rule-data-payload.test.ts）；[converter-version.test.ts](../../../../../src/original-data/conversion/converter-version.test.ts) 断言新版本；[resource-holder-cache.test.ts](../../../../../src/app/resources/resource-holder-cache.test.ts) 断言 `…graphics-5.logic-3…` 的旧包不提供恢复、当前版本的包可恢复；import-job、import-pipeline 与 e2e `import-worker.spec.ts` 的版本字面量同步。
  - setupHash 覆盖关键字表：[create-world.test.ts](../../../../../src/core/world/create-world.test.ts) 改变值、名称与项序都改变哈希（[setup-hash.ts](../../../../../src/core/world/setup-hash.ts) 写入 `keywordTables`）。
  - 完整内容交给 Core：[mission-input.test.ts](../../../../../src/app/resources/mission-input.test.ts) 断言 `ruleDataInputs` 的 `aiPrograms.content` 等于生产形状合成内容（含 4 张表）；`mission-input.ts` 无需改动。
- **合成数据：** [ai.test-support.ts](../../../../../src/original-data/formats/ai.test-support.ts) `syntheticKeywordTables`、`syntheticKeywordExecutable`；[rule-data.test-support.ts](../../../../../src/original-data/conversion/rule-data.test-support.ts) 把表放在对象 2、名称放在对象 4；[production-rule-data.test-support.ts](../../../../../src/original-data/conversion/production-rule-data.test-support.ts) 在生产地址上生成 3/6/5/3 项与 14 个名称区域。18 个新的小区域读取各至少计一个原始扇区，合成光盘的读取预算余量（旧为约 23 KB）不足，不读取的填充 `PADDING` 由 2 MiB 提高为 4 MiB，两份工具测试改为共用它。
- **本机真实镜像（输出在被忽略的 `local/research/p3-08/import/`）：** `node tools/package-check.ts local/StarRang/cd/STAR_RANGERS.{ccd,img,sub,cue}` 为 `passed`，转换器 `osr-import.graphics-5.logic-4.audio-2.models-4`；`ai-programs` 计数 `keywordPairs0–3` 为 3/6/5/3、`keywordNames` 14、`keywordNameBytes` 111，`digests.keywordTables` 为 `sha256:6981ee397444636ae48554814c950d51c3d442179dbc3745ef63530cca3adf60`；`ai-programs` payload 13,934 字节，规则数据合计 7 个 Asset、98,757 字节（份额 16/262,144 不变，`production-package.test.ts` 记录新观测）；整包 410 个 Asset、3,804,727 字节；读取共 109,829,763 字节。不共用产品代码的本地 LE fixup 解码（`keyword-digest.ts`）得到同样的项数、名称数、字节数与摘要，并确认 17 个 fixup 都是源类型 7、内部、16 位目标偏移、目标对象 4。公开只记计数与哈希。
- **与 spec 的一处差别：** “16 位目标偏移”的编码没有在转换器中区分：`RegionFixup` 不携带目标偏移宽度（`le-executable.ts` 不在写入范围内），两种编码装入结果相同；源类型 7、内部、非加法由 `readFixedUpRegion` 保证，真实镜像的编码由上面的独立读取确认。
- **检查：** 受影响测试先跑；`pnpm check` 通过（typecheck、lint、321 个文件 9,621 个测试、build）；`playwright test e2e/import-worker.spec.ts` 16 项通过（端口 5139/5140）。
- **rubber-duck：** 无阻塞问题；一处非阻塞：终止项之前名称字为 0、但 fixup 指向偏移 0 的名称区域的项会被接受——已改为先拒绝零名称字并加回归测试。
- **simplify：** 去掉可直接断言的 `as unknown as` 元组转换（`ai.ts`、`convert-rule-data.ts`、`rule-data.test-support.ts`），名称总字节检查改为先求总数，两份工具测试共用 `PADDING`。未采纳：把 `syntheticKeywordExecutable` 改用 `conversion/` 的 `regionExecutable`（会造成 formats → conversion 的测试依赖，且不支持自定义 fixup 记录）；统一既有的三份 `fixupRecord`（在本项之前已存在）；并行读取区域（顺序读取保证首个失败确定）；去掉解析器内与转换器重复的限值检查（解析器 API 独立使用时仍须核对，与内置表的做法一致）。
- **文档：** [ai](../../../../original/formats/ai.md) §5.3 记 14 个名称区域的地址与长度和独立核对，§6 加关键字表的导入处置，§8 加观测值；[content](../../../../engineering/modules/content.md) 与 [original-data](../../../../engineering/modules/original-data.md) 分册更新契约、限值、映射、转换流程、份额与测试数据；[本地导入指南](../../../../guides/local-import.md#缓存与重新导入)补须重新导入的说明。

