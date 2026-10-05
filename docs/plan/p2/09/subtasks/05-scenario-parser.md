---
type: plan
status: active
phase: P2
task: "09"
subtask: "05"
updated: 2026-10-05
---

# 05 — SCCT/SCEN/M2ID 定向解析

**契约来源：** [spec](../spec.md) 的 S-03、S-11（转换层错误码与结构限值名）、AC-03（解析部分）、AC-04（解析负向与限值）、AC-13（解析诊断隐私）；[源字段处理](../spec.md#源字段处理)、[限值与预算](../spec.md#限值与预算)、[错误](../spec.md#错误)。
**依赖：** 02。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **指针安全的数据块读取：** 在 `original-data/formats/` 提供对一个条目读取结果（字节加重定位位置）的结构读取工具：
  - 指针字段只在重定位表登记的位置上有效，其余位置的非零值视为非指针；
  - 指针目标及其整个结构必须完整位于数据块内；
  - 整数按小端读取，f32 必须有限；
  - 越界或违反格式规则为 `invalid-payload`，位置为 `archive:/路径#ID` 后接结构路径。
- **SCCT：** 解析组表与僚机记录，按 `CLASSIC_P2_SLICE.candidate` 取槽位的 SCEN 条目 ID；group/slot 超出范围为 `subresource-mismatch`。`MUSC` ID 与组名不读取。
- **SCEN：** 解析头部与段表，按[源字段处理](../spec.md#源字段处理)逐行处理：
  - 段 1 记录与段 5 的模板、成员数组生成中间记录，别名记录只保留一份并合并来源标记；
  - 种类为单比特时取位序号，0 为 null，多比特为 `invalid-payload`；
  - 规则输入按源类型（u32 或 i32）保留，0 为 null；`spawnTime` 按 u32；AI 掩码转为升序位序号；
  - 候选名称为有序字符串列表，必须为 NUL 结尾的可打印 ASCII；
  - 头部 0x00 与 0x04 必须相等；“非默认即不支持”的位置出现非默认值为 `unsupported-payload`；
  - 段 6、段 5 布局与地图框架（结论 2 时）按 01、02 的结论与 spec 实现。
- **M2ID：** 严格解析 ID 列表，计数与长度受限；供 06 解析机型到 MODL 条目。
- **结构限值：** 按 spec 的限值表在分配与遍历之前判定，超限为 `limit-exceeded`，限值名为 `payloadEntryBytes`、`payloadItems` 或 `textBytes`。
- **错误：** 在 `SourceErrorCode` 追加 `invalid-payload`、`unsupported-payload` 与 `subresource-mismatch`，在 `SourceLimitName` 追加三个结构限值名；扩展 [source-error.test-support.ts](../../../../../src/original-data/source-error.test-support.ts) 的位置语法 oracle，使其接受 `archive:/路径#ID` 后接 `/名称[下标]…` 的结构路径。诊断不回显字节、名称或数值。
- **合成样本：** 计划新增 `original-data/formats/` 的 test-support，用 `ByteWriter` 生成带重定位表的合成 SCCT、SCEN 与 M2ID 数据块，并用 `buildImfat` 组成合成 `SCENARIO.NOB` 与 `SR.NOB`；名称包含 `MARKER`。08、09、10、12 复用。
- **文档：** 在[源码结构](../../../../engineering/source-structure.md)中新增 `original-data/formats/` 的说明。

## 不包含

- 转换为规范 payload、机型绑定与预算（06、09）；来源映射与子资源核验（08）；非封包参数（07）。
- 读取文件或封包：解析器只接收 `ArchiveEntryRead` 形状的输入，读取由 09 经 `VerifiedSource` 完成。

## 关键文件与契约

- **修改：** [source-error.ts](../../../../../src/original-data/source-error.ts)（追加错误码与限值名）；[source-error.test-support.ts](../../../../../src/original-data/source-error.test-support.ts)（位置语法）。
- **复用：** [archive-reader.ts](../../../../../src/original-data/archive/archive-reader.ts) 的 `ArchiveEntryRead`（类型导入）；[synthetic.ts](../../../../../src/original-data/synthetic.ts) 的 `ByteWriter`、`buildImfat`；[slice-definition.ts](../../../../../src/content/slice-definition.ts) 的候选。
- **计划新增：** `src/original-data/formats/` 下的数据块读取工具、SCCT/SCEN/M2ID 解析器、相邻测试与 test-support。

## 验收标准

- [ ] AC-03（解析部分）：合成样本覆盖多组 SCCT 中按候选选择 SCEN、非对齐指针、无序重定位、段 1 与成员数组别名（只生成一份并合并来源标记）、种类为 0 的模板、规则输入 0 为 null、有符号字段负值保留、无符号字段最高位为 1 时保留为正数、AI 掩码、多个候选名称与僚机记录，逐字段断言。
- [ ] AC-04（解析部分）：越界或未登记的指针、多比特种类、非有限坐标、非 ASCII 或无 NUL 的名称、头部 0x00 与 0x04 不等、M2ID 越界都为 `invalid-payload`；候选槽位超出范围为 `subresource-mismatch`；每个“非默认即不支持”的位置单独一例为 `unsupported-payload`；各结构限值恰好等于上限时通过，超出 1 个单位为 `limit-exceeded`，且不按声明规模分配。
- [ ] 每个错误位置都通过扩展后的位置语法 oracle，诊断不含 `MARKER`、名称或数值（AC-13）。
- [ ] `pnpm exec vitest run src/original-data tools/engineering-boundaries.test.ts`、`pnpm typecheck` 与 `pnpm lint` 通过；P2-03 的既有错误码与位置测试保持通过。

## 验证方法

- 表驱动 Node 测试，按 code、位置与限值断言；分配防护以超大声明计数不触发分配为断言依据。
- 完成前按 execute-goal 流程以本子任务 diff 为范围做 rubber-duck 审查与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。
- 不适用 browser-testing。

## 完成证据
