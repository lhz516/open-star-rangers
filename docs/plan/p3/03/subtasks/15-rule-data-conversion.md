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

## 验收标准

- [ ] AC-03 至 AC-06（转换部分）：合成来源转换出 6 个 Asset，选择、ID 链与越界按 spec 处理；TABL 10165 与 COMM 中不属于本任务的条目和字段不出现在 payload 中。
- [ ] AC-13：生产映射表能通过 `readSourceMappingTable` 读取；不带子资源的部件经核验为 `verified`，带子资源的部件只在解析后为 `verified`；来源状态绑定指纹；两条 ID 链的不一致都报 `subresource-mismatch`；置信度与 U 项符合 Asset 表。
- [ ] AC-14（份额计量）：恰等于上限时通过，超出 1 时为 `budget-exceeded`，观测值包含先前用量；被拒绝的扣除不改变用量；转换器计入的用量等于独立计算的值。
- [ ] AC-18：只经 `VerifiedSource` 读取；诊断不回显值；测试不读取文件。
- [ ] `pnpm exec vitest run src/original-data tools/engineering-boundaries.test.ts` 与 `pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- Node 测试，使用代码生成的合成封包、合成 EXE 区域与记录读取的合成光盘端口。不涉及浏览器或原版数据。

## 完成证据
