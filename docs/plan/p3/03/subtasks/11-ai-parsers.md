---
type: plan
status: active
phase: P3
task: "03"
subtask: "11"
updated: 2026-10-09
---

# 11 — AI 数据解析器

**契约来源：** [spec](../spec.md) 的 S-05、S-15、AC-05、AC-14（结构限值）、AC-18；[字段处理规则](../spec.md#字段处理规则) 1–7（尤其 4 的代码标识）。
**依赖：** 08。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 在 `original-data/formats/` 中新增 AISTUFF 解析器，只接收已读条目、EXE 区域字节与 `DiscPath`：
  - **AICO 6001：** 读取 {指针, 数量} 并只取组 0 的三元组；组越界时为 `subresource-mismatch`。
  - **TABL 6003：** 读取 0x54 字节的程序记录，直到首字为零。按 03 确定的位置收集 ID 链：+0x1C 所指的条目、该条目 +0x38 所指的条目与 6 个 ID 列表，得到所需条目 ID 的集合。
  - **条目解析：** 给定 ID 集合中每个条目的已读字节，按 03 的结构解析 TABL 与 DFPG，并把条目 ID 转为 `entries` 的序号。
  - **EXE 内置表：** 读取 10 条 0x54 字节的记录，把代码指针转为 LE 对象与对象内偏移的不透明标识。
  - 产出 08 的 `ai-programs` 内容。
- 返回所需条目 ID 的集合，供 15 与映射部件核对（多出或缺少为 `subresource-mismatch`）。解析器本身不打开封包。
- 沿用 payload-block 的指针、数量与边界规则；结构超限用 06 的限值名。
- 用代码生成的合成 AICO、程序表、引用条目与 EXE 区域编写表驱动测试，覆盖：首字为零的终止、ID 链与序号、代码标识、组 0 三元组的选择；越界、未登记指针、超限、只在基准中为零的位置非零、ID 集合与给定条目不一致的拒绝。

## 不包含

- 来源映射与转换：归 15。
- AI 程序的解释：归 P3-08。
- 模块分册：由 22 同步。

## 关键文件与契约

- [payload-block.ts](../../../../../src/original-data/formats/payload-block.ts)、[le-executable.ts](../../../../../src/original-data/formats/le-executable.ts)（只读）。
- 08 新增的 `src/content/rule-data/` 类型；03 的 `docs/original/formats/ai.md`。
- 计划新增：`src/original-data/formats/ai.ts` 与其测试和合成支持。

## 写入范围

- `src/original-data/formats/ai.ts`：AISTUFF 与内置表解析（新建）。
- `src/original-data/formats/ai.test.ts`：测试（新建）。
- `src/original-data/formats/ai.test-support.ts`：合成 AISTUFF 块与 EXE 区域（新建）。

## 验收标准

- [ ] AC-05（解析部分）：程序表到首字为零为止；+0x1C 所指条目、该条目 +0x38 所指条目与 6 个 ID 列表转为 `entries` 序号；代码指针为不透明标识；只取 AICO 组 0 的三元组。
- [ ] 返回的 ID 集合正确；给定的条目多出或缺少时为 `subresource-mismatch`；越界与超限按 code 拒绝。
- [ ] AC-14：每个结构限值恰等于上限时通过，超出 1 时为 `limit-exceeded`。
- [ ] AC-18：诊断不回显数值；测试不读取文件。
- [ ] `pnpm exec vitest run src/original-data/formats tools/engineering-boundaries.test.ts` 与 `pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- Node 表驱动测试，使用代码生成的合成数据。不涉及浏览器或原版数据。

## 完成证据
