---
type: plan
status: active
phase: "P3"
task: "16"
subtask: "18"
updated: "2026-10-30"
---

# 18 — 修复：关键字表 fixup 目标偏移宽度的拒绝（P3-03 AC-23）

**契约来源：** [spec](../spec.md) 的 S-02、S-05（不改变契约的缺陷）、AC-02、AC-15，以及[技术决定](../spec.md#技术决定) 7、8、10；被修复的契约为 [P3-03 spec](../../03/spec.md) 修订 3 的核验 2 与 AC-23。
**依赖：** 无。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 来源

[02](./02-p3-03-coverage.md#完成证据) 核对发现：P3-03 修订 3 的核验 2 要求表区域内的 fixup 全部为“源类型 7、内部引用、目标对象 4、16 位目标偏移”，“类型不同为 `unsupported-payload`”。[P3-08/13](../../08/subtasks/13-ai-static-data-import.md#完成证据)把“不区分目标偏移宽度”记为偏差：[le-executable.ts](../../../../../src/original-data/formats/le-executable.ts) 按 flags 的 0x10 位读取 16 或 32 位目标偏移，但 `RegionFixup` 不带宽度，32 位目标偏移被接受且没有拒绝测试。真实镜像的 17 个 fixup 都是 16 位（独立解码）。按技术决定 7，授权定稿不能豁免必需证据；这是已复现、不改变契约的缺陷，按 S-05 作为独立修复，原责任为 P3-08/13。

## 工作范围

- **先复现：** 用合成 LE 构造一个关键字表 fixup 为 32 位目标偏移（flags 0x10）、其余与合法样本相同的输入，确认当前被接受。
- **修复：** `RegionFixup`（或读取 fixup 区域的等价接口）暴露目标偏移宽度；关键字表核验对非 16 位目标偏移以 `unsupported-payload` 拒绝。读取 [P3-03 spec](../../03/spec.md) 中内置表 `0x1762f8` 的核验条文：只有其契约同样要求 16 位目标偏移时才对内置表做同样的拒绝；否则不改内置表行为。
- **测试：** 合成拒绝测试（解析器与转换器路径各一，与 P3-08/13 的拒绝组同风格），合法样本与真实格式的正向结果不变。
- **转换器版本：** 合法输入的转换输出逐字节不变，按 P3-03 的规则核对是否需要递增 `ConverterVersion`。若规则要求递增（会改变内容身份并使已导入缓存失效），先停下报告协调者，不自行递增。
- **覆盖映射：** 修复与测试通过后，在 [P3-03 goal](../../03/goal.md#验收覆盖) 的覆盖表补 AC-23 一行（实现与验证指向 P3-08/13 与本子任务），并修改 02 写入的那一条执行记录，改为四行都已补、AC-23 的拒绝证据由 P3-16/18 补齐；不新增第二条记录，不改 P3-03 的子任务、依赖、状态或其他历史证据。`node tools/task-state.ts p3/03` 应为 `done`。
- **文档：** 只在 [ai 格式文档](../../../../original/formats/ai.md)、[original-data 模块说明](../../../../engineering/modules/original-data.md) 或 `docs/engineering/` 中描述该偏差的地方更正为已拒绝（若有）。

## 不包含

- 改变 P3-03 契约、合法输入的转换结果或内容身份；其他格式的 fixup 宽度。

## 关键文件与契约

- [le-executable.ts](../../../../../src/original-data/formats/le-executable.ts)、[ai.ts](../../../../../src/original-data/formats/ai.ts) 及其测试；转换器调用处（`src/original-data/conversion/`）；[P3-03 goal](../../03/goal.md)。

## 写入范围

- `src/original-data/**`：读取器、关键字表核验与测试。
- `docs/plan/p3/03/goal.md`：只加 AC-23 一行，并改 P3-16/02 写入的那一条执行记录与 updated 日期。
- `docs/original/formats/ai.md`、`docs/engineering/modules/original-data.md`：只更正描述该偏差的文字。

## 验收标准

- [x] 修复前已复现 32 位目标偏移被接受；修复后关键字表对其报 `unsupported-payload`，合成拒绝测试在去掉修复后失败。
- [x] 合法输入的转换输出与内容身份不变；`ConverterVersion` 的处理符合 P3-03 规则（不需要递增，或已停下报告）。
- [x] 内置表的处理与其契约条文一致，并写明依据。
- [x] P3-03 goal 只多 AC-23 一行与那一条执行记录的修改；`node tools/task-state.ts p3/03` 为 `done`。
- [x] 受影响的 Vitest 文件与 `pnpm check` 通过；没有新依赖或原版内容。

## 验证方法

- `pnpm test -- src/original-data`，再运行 `pnpm check`；`node tools/task-state.ts p3/03`；`git --no-pager diff docs/plan/p3/03/goal.md`。

## 完成证据

- **复现：** 修复前，`ai.test.ts` 新增的“rejects name fixups with a 32-bit target offset, which the LE reader accepts”（合成 LE，关键字表名称 fixup 的目标标志置 0x10，其余与合法样本相同，经 `readFixedUpRegion` 读取后解析）失败于“expected a SourceError”，即 32 位目标偏移被接受。
- **修复：** [le-executable.ts](../../../../../src/original-data/formats/le-executable.ts) 新增 `FixupTarget { object, offset, targetBits }`，`RegionFixup` 继承它；`targetBits` 按目标标志 0x10 取 32 或 16，跨页两条记录的宽度不同也报“the records of a fixup disagree”（`invalid-payload`）。[ai.ts](../../../../../src/original-data/formats/ai.ts) 的 `parseKeywordTables` 对 `targetBits !== 16` 报 `unsupported-payload`，位置为 `<表>/entries[i]/name`。
- **测试：** 解析器路径两项（经 LE 读取器的全宽样本 → `keywordTables[0]/entries[0]/name`；`it.each` 拒绝组中改一个 fixup 为 32 位 → `keywordTables[2]/entries[1]/name`），转换器路径一项（`convert-rule-data.test.ts`，`syntheticRuleData` 新增的 `changeKeywords` 改表 1 第 3 项 → `…parts[9]…/entries[2]/name`）；去掉 ai.ts 的那一行检查后这 3 项失败（3 failed / 164 passed），恢复后通过。`le-executable.test.ts` 断言读取器报告的宽度并拒绝跨页宽度不一致。合成编码统一为 `synthetic.test-support.ts` 的 `internalOffsetFixupRecord`，按 fixup 的 `targetBits` 写记录，替换原有三份按目标值大小选宽度的副本（ai、rule-data、production-graphics 支持文件）。
- **内置表：** P3-03 spec 对 `0x1762f8` 只要求区域、名称与 ID 链（导入项表、Asset 表与“来源映射与核验”），核验 2 中“与内置表 `0x1762f8` 的核对相同”只指存储字等于目标偏移，不要求宽度；原版名称 fixup 为 16 位、处理函数 fixup 为 32 位（[ai §3.3](../../../../original/formats/ai.md#33-built-in-program-table-0x1762f8)）。因此内置表行为不变：合成内置表现按原版混合宽度编码（名称 16、处理函数 32），“reads the built-in table … through the LE fixed-up region reader”仍通过。
- **输出与版本：** 修复只增加拒绝，合法输入的解析结果与编码路径不变。本机真实镜像 `node tools/package-check.ts local/StarRang/cd/STAR_RANGERS.{ccd,img,sub,cue}` 为 `complete`，`osr-import.graphics-6.logic-4.audio-2.models-4`，manifest `manifest:sha256:b0ea7efdd14a5d30b465a7d3d4cb2eb2c1e49537128dd86e63a4ad37800aabac` 与 [P3-13/30](../../13/subtasks/30-real-content-import.md) 记录相同，`ai-programs` 的关键字计数 3/6/5/3、14、111 与 `digests.keywordTables` `sha256:6981ee39…adf60` 与 P3-08/13 相同（真实的 17 个 fixup 都是 16 位，被接受）。P3-03 规则是“输出发生变化的转换器，各自递增其组件”（spec“包身份与转换器版本”），输出不变，因此不递增 `ConverterVersion`。
- **P3-03 goal：** 只加 AC-23 覆盖行（实现指向 P3-08/13 与本子任务）并改写 2026-10-30（P3-16/02）那一条执行记录（四行都已补，AC-23 的拒绝证据由本子任务补齐），未新增记录；`node tools/task-state.ts p3/03` → `done (terminal)`。
- **检查：** `pnpm exec vitest run src/original-data src/workers`（71 个文件、2,621 个测试）通过；`pnpm typecheck`、`eslint src/original-data` 通过；`pnpm check` 通过（447 个文件、11,933 个测试与构建）。没有新依赖，测试只用合成数据。
- **rubber-duck：** 无发现（确认宽度来自目标标志 0x10、跨页宽度一致、内置表不受影响、生产测试支持的关键字目标偏移 < 0x10000 仍编码为 16 位）。**simplify：** 采纳：合并三份 fixup 记录编码器到 `synthetic.test-support.ts`，去掉一条冗余断言；保留解析器与转换器两条路径的测试（本子任务要求）与 `changeKeywords` 钩子（转换器测试所需的最小入口）。
- **文档影响：** [original-data 模块说明](../../../../engineering/modules/original-data.md)的关键字表与 `readFixedUpRegion` 两处改为已按宽度拒绝、`RegionFixup` 携带 `targetBits`。[ai 格式文档](../../../../original/formats/ai.md)只记原版事实（17 个 16 位 fixup），不描述该偏差，无需改动。`docs/original/formats/executable.md` 的 `readFixedUpRegion` 一句仍准确（未提宽度），且不在写入范围内，未改。
