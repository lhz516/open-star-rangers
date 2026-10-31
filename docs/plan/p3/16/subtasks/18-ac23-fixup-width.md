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

- [ ] 修复前已复现 32 位目标偏移被接受；修复后关键字表对其报 `unsupported-payload`，合成拒绝测试在去掉修复后失败。
- [ ] 合法输入的转换输出与内容身份不变；`ConverterVersion` 的处理符合 P3-03 规则（不需要递增，或已停下报告）。
- [ ] 内置表的处理与其契约条文一致，并写明依据。
- [ ] P3-03 goal 只多 AC-23 一行与那一条执行记录的修改；`node tools/task-state.ts p3/03` 为 `done`。
- [ ] 受影响的 Vitest 文件与 `pnpm check` 通过；没有新依赖或原版内容。

## 验证方法

- `pnpm test -- src/original-data`，再运行 `pnpm check`；`node tools/task-state.ts p3/03`；`git --no-pager diff docs/plan/p3/03/goal.md`。

## 完成证据
