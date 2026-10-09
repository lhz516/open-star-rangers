---
type: plan
status: active
phase: P3
task: "03"
subtask: "10"
updated: 2026-10-09
---

# 10 — CRAFT 与 DEBRIS 解析器

**契约来源：** [spec](../spec.md) 的 S-03、S-04、S-15、AC-03、AC-04、AC-14（结构限值）、AC-18；[字段处理规则](../spec.md#字段处理规则) 1–7。
**依赖：** 08。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 在 `original-data/formats/` 中新增解析器，只接收 `ArchiveEntryRead` 形状的已读条目与封包 `DiscPath`，不自行打开文件或封包（沿用 [P2-09 的解析器边界](../../../../engineering/modules/original-data.md#任务数据的定向解析)）：
  - **TABL 4003：** 先检查 18 × 3 的格式规则，再按候选（槽、组）取出一对 {CINF 条目 ID, 倍率}；槽或组越界时为 `subresource-mismatch`。
  - **CINF：** 按 02 的结构，产出 08 的 `craft-info` 内容（`hitDamageScale` 由调用者从 TABL 4003 传入）。首字被改写为序号的规则由记录在数组中的位置表示；记录之间的块内指针转为序号；只在基准中为零的位置出现非零时为 `unsupported-payload`。
  - **DEBRIS TABL 4501：** 20 组 {指针, 数量}，每组为 96 字节记录的数组，嵌套浮点数组转为数组。+0x0C 的存储值不转换；对嵌套数组的载入调整按 02 的结论复现或不执行。
- 沿用 [payload-block.ts](../../../../../src/original-data/formats/payload-block.ts) 的读取规则：指针须在重定位表中登记；先查数量再查边界，不按声明规模分配；浮点须有限。结构超限用 06 的限值名，报 `limit-exceeded`。
- 用代码生成的合成 TABL 4003、CINF 与 DEBRIS 块编写表驱动测试：多行多列的选择、有符号负值、无符号最高位、`f32`、非对齐指针、无序重定位；越界、未登记指针、超限与只在基准中为零的位置非零，都按 code 拒绝。

## 不包含

- 来源映射、CINF ID 与映射的核对，以及转换：归 15。
- payload 类型与读取器：由 08 提供。
- 模块分册：由 22 同步。

## 关键文件与契约

- [payload-block.ts](../../../../../src/original-data/formats/payload-block.ts)、[source-error.ts](../../../../../src/original-data/source-error.ts)（只读）。
- 08 新增的 `src/content/rule-data/` 类型；02 的 `docs/original/formats/craft.md`。
- 计划新增：`src/original-data/formats/craft.ts`、`debris.ts` 与它们的测试和合成支持。

## 写入范围

- `src/original-data/formats/craft.ts`：TABL 4003 与 CINF 解析（新建）。
- `src/original-data/formats/craft.test.ts`：测试（新建）。
- `src/original-data/formats/craft.test-support.ts`：合成 TABL 4003 与 CINF（新建）。
- `src/original-data/formats/debris.ts`：DEBRIS TABL 4501 解析（新建）。
- `src/original-data/formats/debris.test.ts`：测试（新建）。
- `src/original-data/formats/debris.test-support.ts`：合成 DEBRIS 块（新建）。

## 验收标准

- [ ] AC-03（解析部分）：多行多列的 TABL 4003 按候选选出一对，槽或组越界时为 `subresource-mismatch`；CINF 的各记录数组按研究结构转换，种类位数组恰为 20 项；负值、无符号最高位与 `f32` 按来源保留；只在基准中为零的位置非零时为 `unsupported-payload`。
- [ ] AC-04（解析部分）：20 组记录与嵌套浮点数组转换正确，+0x0C 的存储值不转换；越界与超限按 code 拒绝。
- [ ] AC-14：每个结构限值恰等于上限时通过，超出 1 时为 `limit-exceeded`。
- [ ] AC-18：诊断只含结构路径，不回显数值；测试不读取文件。
- [ ] `pnpm exec vitest run src/original-data/formats tools/engineering-boundaries.test.ts` 与 `pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- Node 表驱动测试，使用代码生成的合成块。不涉及浏览器或原版数据。

## 完成证据
