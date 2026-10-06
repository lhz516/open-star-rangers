---
type: plan
status: active
phase: P2
task: "11"
subtask: "01"
updated: 2026-10-06
---

# 01 — 预期包配置的生产常量

**契约来源：** [spec](../spec.md) 的 S-05、AC-09（配置一致性与读取上限），以及[包预算与生产身份](../spec.md#包预算与生产身份)与技术决定 5、6。
**依赖：** 无。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 新增 `src/workers/production-package.ts`，导出主线程可用的生产包配置：`{ converterVersion, sourceFingerprint, limits }`。
  - 类型：`ConverterVersion`、`SourceFingerprint` 与完整的 P2-01 `BudgetRecord`；冻结。
  - 该模块不导入 `original-data`；值以常量写出。
- 同时导出“预期包配置”的类型，供 02、03、06 与测试入口使用。生产入口传这份常量，测试入口传与合成目录一致的配置（spec 生产身份）。
- 相邻 Node 测试（`src/workers/production-package.test.ts`）证明：
  - `converterVersion` 等于 `PRODUCTION_CONVERTER_VERSION`；
  - `sourceFingerprint` 等于 `sourceFingerprint(PRODUCTION_CATALOG)`；
  - `limits` 等于 `PRODUCTION_GRAPHICS_SHARE`、`PRODUCTION_LOGIC_SHARE`、`PRODUCTION_MODEL_SHARE` 与 `AUDIO_BUDGET_LIMITS` 经 `addBudgets` 的逐维之和。

  任一份额或转换器组件改变时，测试失败，提示同步常量。
- 读取上限不变：确认 [import-job.ts](../../../../../src/workers/import-job.ts) 的作业限值仍是“输入总字节加三步份额”，音频按自身限值（已有测试覆盖时引用之，没有则补一条断言）。

## 不包含

- 资源持有者如何使用配置（02、03）；应用入口的注入（06）。
- 改变任何已批准的份额或转换器组件。

## 关键文件与契约

- 计划新增 `src/workers/production-package.ts` 与相邻测试。
- 读取：[converter-version.ts](../../../../../src/original-data/conversion/converter-version.ts)、[source-catalog.ts](../../../../../src/original-data/source/source-catalog.ts)、[production-graphics.ts](../../../../../src/original-data/conversion/production-graphics.ts)、[convert-logic.ts](../../../../../src/original-data/conversion/convert-logic.ts)、[production-models.ts](../../../../../src/original-data/conversion/production-models.ts)、[audio-conversion.ts](../../../../../src/original-data/conversion/audio-conversion.ts)、[budget.ts](../../../../../src/content/budget.ts)。

## 验收标准

- [ ] AC-09（配置）：三个字段分别等于生产派生值，测试在任一份额改变时失败。
- [ ] AC-09（读取上限）：作业读取限值仍为输入总字节；音频限值不变。
- [ ] `production-package.ts` 不导入 `original-data`（lint 与边界测试通过）。
- [ ] `pnpm check` 通过。

## 验证方法

- `pnpm exec vitest run src/workers tools/engineering-boundaries.test.ts`，完成前 `pnpm check`。
- 不适用浏览器或原版对照。

## 完成证据
