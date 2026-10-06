---
type: plan
status: active
phase: P2
task: "09"
subtask: "14"
updated: 2026-10-05
---

# 14 — 补齐记录数值字段的负向用例

**契约来源：** [spec](../spec.md) 的[源字段处理](../spec.md#源字段处理)中记录 +0x1C、+0x40、+0x5C 三行，以及 AC-04；13 的[第一次核对](./13-final-alignment.md#完成证据)。
**依赖：** 05。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **补救项：** 13 的独立覆盖审计发现，记录 +0x1C（`spawnTime`）、+0x40（`gridSpacing`）与 +0x5C（AI 目标机型掩码）只有正向测试。这三个字段的任意取值都合法，唯一的拒绝条件是格式规则：数值字段上不得有登记的重定位（spec 源字段处理表前的指针规则，以及 05 的 `PayloadBlock` 约定）。
- **测试：** 在 [formats.test.ts](../../../../../src/original-data/formats/formats.test.ts) 的 SCEN 负向表中，为这三个偏移各加一例，断言 `invalid-payload` 与记录的结构位置；不改生产代码。
- **文档：** 无需更新工程文档。

## 不包含

- 新行为或契约变化；其他行的测试。

## 关键文件与契约

- **修改：** [formats.test.ts](../../../../../src/original-data/formats/formats.test.ts)。
- **复用：** 05 的 `rawScenario` 与 `expectSourceError`；[object-record.ts](../../../../../src/original-data/formats/object-record.ts) 已有的重定位核对。

## 验收标准

- [x] +0x1C、+0x40、+0x5C 各有一例负向测试：该字段上登记重定位时为 `invalid-payload`，位置为所在记录。
- [x] `pnpm exec vitest run src/original-data/formats`、`pnpm typecheck` 与 `pnpm lint` 通过。

## 验证方法

- Node 表驱动测试。
- 改动只有测试，按 execute-goal 流程做 rubber-duck 审查与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。
- 不适用 browser-testing。

## 完成证据

- **测试：** [formats.test.ts](../../../../../src/original-data/formats/formats.test.ts) 的 SCEN `invalid-payload` 表新增 3 例，都使用默认合成任务：
  - 记录 1 的 +0x1C（`spawnTime` 为 90）、记录 0 的 +0x40（`gridSpacing` 为 0）、记录 3 的 +0x5C（掩码含第 0 与第 17 位）上登记重定位；
  - 分别报 `invalid-payload@archive:/MAIN/SCENARIO.NOB#3019/records[1]`、`/records[0]` 与 `/records[3]`。

  `readObjectRecord` 先核对记录内的重定位，再读取各字段。若把这三个偏移误加入指针字段，位置或结果会改变，用例随之失败。生产代码未改。
- **工程检查：** `pnpm exec vitest run src/original-data/formats` 通过（118 个测试，原为 115 个）；`pnpm typecheck` 与 `pnpm lint` 通过。
- **rubber-duck：** 无问题。审阅确认三例分别命中目标偏移，位置正确，能发现误接受；源字段处理表的其余各行都有本行的负向用例（规则输入一行由 +0x0C 用例覆盖）。
- **simplify：** 三例已直接复用 `rawScenario` 与 `block.offsets.records`，无可简化项。
- **文档影响：** 无需更新工程文档。
