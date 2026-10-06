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

- [x] AC-09（配置）：三个字段分别等于生产派生值，测试在任一份额改变时失败。
- [x] AC-09（读取上限）：作业读取限值仍为输入总字节；音频限值不变。
- [x] `production-package.ts` 不导入 `original-data`（lint 与边界测试通过）。
- [x] `pnpm check` 通过。

## 验证方法

- `pnpm exec vitest run src/workers tools/engineering-boundaries.test.ts`，完成前 `pnpm check`。
- 不适用浏览器或原版对照。

## 完成证据

- **实现：** 新增 [production-package.ts](../../../../../src/workers/production-package.ts)，导出 `ExpectedPackageProfile` 类型与冻结的 `PRODUCTION_PACKAGE`：
  - `converterVersion` 为 `osr-import.graphics-2.logic-1.audio-1.models-1`；
  - `sourceFingerprint` 为生产白名单的内容寻址指纹；
  - `limits` 为 202 个 Asset、384 条依赖边、11,943,936 字节 payload，`sourceReadBytes` 为 0，其余维度依次相加。

  模块只导入 `content/budget.ts` 与 `content/content-identity.ts`，以各自的读取函数得到带品牌的类型。
- **一致性测试：** [production-package.test.ts](../../../../../src/workers/production-package.test.ts) 从 `original-data` 派生三个值并逐一比较：`PRODUCTION_CONVERTER_VERSION`、`sourceFingerprint(PRODUCTION_CATALOG)`、四份额经 `addBudgets` 之和。另断言配置与 `limits` 都已冻结。
  - 证伪：把常量改为 `assets: 201` 与 `models-2` 后，两条测试失败；还原后通过。
- **读取上限：** [import-job.test.ts](../../../../../src/workers/import-job.test.ts) 新增一条测试，以生产三份额注入作业，记录逻辑步骤收到的限值：等于 `{ sourceReadBytes: 输入总字节 }` 加三份额，`sourceReadBytes` 恰为文件总字节。
  - 音频限值不变，由已有测试“charges the audio stage from zero under its own limits”覆盖，`import-job.ts` 未修改。
- **边界：**
  - [eslint.config.js](../../../../../eslint.config.js) 把该文件并入 render/ui/app 的 `original-data` 禁止规则；
  - [engineering-boundaries.test.ts](../../../../../tools/engineering-boundaries.test.ts) 把它加入 lint 探针列表；依赖图检查也把它视为消费者，不再按 `workers/` 放行。
  - 证伪：在该文件追加 `original-data` 导入后，ESLint 报 `no-restricted-imports`；追加再导出后，依赖图测试列出 `src/workers/production-package.ts -> src/original-data/source/source-catalog.ts`。
- **检查：**
  - `pnpm exec vitest run src/workers tools/engineering-boundaries.test.ts`：5 个文件，421 条测试通过；
  - `pnpm check`：类型检查、lint，141 个文件 4,249 条测试，构建，全部通过。
- **Rubber-duck：** 没有阻塞或非阻塞问题。
- **Simplify：** 采纳两项：ESLint 条目并入已有的消费者规则；删去与精确相等重复的部分数值断言。未采纳三项：
  - 导出类型由计划要求，供 02、03、06 与测试入口使用；
  - 模块载入时的读取校验开销可忽略，且免去类型断言；
  - 读取上限测试走真实作业路径，与相邻测试相同。
- **文档影响：**
  - [工程约定](../../../../engineering/README.md)的 `original-data` 依赖规则注明该文件按消费者对待；
  - [源码结构](../../../../engineering/source-structure.md)的导入 Worker 一节新增“生产包配置”；
  - [STATUS](../../../../STATUS.md) 的下一步改为 P2-11 正在执行。
