---
type: plan
status: active
phase: P2
task: "05"
subtask: "13"
updated: 2026-10-05
---

# 13 — P2-05 最终对齐验证

**契约来源：** [spec](../spec.md) 的全部 S-01 至 S-13、AC-01 至 AC-18，重点为 AC-12 至 AC-18 与[风险与恢复](../spec.md#风险与恢复)。
**依赖：** 01, 02, 03, 04, 05, 06, 07, 08, 09, 10, 11, 12。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **覆盖核对：** 对照 spec、实际导出、测试与 01–12 的完成证据，逐项形成 S/AC 覆盖表。确认[行为与边界](../spec.md#行为与边界)的每一行、[错误码](../spec.md#错误码)的每个 code，都有对应的正负测试或本地证据。
- **不变量核对：**
  - 项目中只有一处调色板查找与最近色实现，[payloads.ts](../../../../../src/original-data/payloads.ts) 中没有第二套图像、调色板或字体解码；
  - 没有声明绑定的图像不会默认使用 DATA；未映射的码位不会回退；
  - 超限与预算拒绝都发生在分配之前；共用条目在一步内只物理读取一次；
  - 步骤失败时没有部分结果，也没有 `verified` 状态；本任务的作业不发送组，`finished.groups` 为空；
  - 本任务产生的诊断不含原版字节、条目编号、偏移、文件名或宿主路径；继承的读取错误保持 P2-02/03 的形状；
  - content 不导入 `original-data`；`original-data/conversion/` 只经产品入口取得封包；`workers/` 不使用网络 API；
  - 使用 `nearest` 的映射约束、生产字库的映射置信度与 U 项，都与 11、12 的研究结论一致。
- **工程检查：**
  - 运行 `pnpm check`、`pnpm test:e2e e2e/import-worker.spec.ts --project=development`、`pnpm check:original`、文档链接与元数据检查，以及 `node tools/task-state.ts p2/05`；
  - 确认 P2-01 至 P2-04 与 P2-10 的测试和浏览器回归保持通过；
  - 依赖清单与锁文件没有变化。
- **提交范围：** 审阅 goal 的全部提交，确认没有原版内容、二进制样本、反编译输出、截图或 `local/` 输出。
- **文档核对：** 源码结构、工程约定、工具指南与原版文档（textures、hud、unknowns，按需 executable）都与实现和研究结论一致，`updated:` 已更新。`tasks.md` 只有导航，STATUS 只在阶段摘要或下一步变化时更新。
- **交接核对：** spec 的范围外说明仍然准确：容器子资源与地图调色板归 P2-07；贴图选型与歧义贴图的处理归 P2-06；组装、`ConverterVersion` 与页面接线归 P2-06/07/11；最终保真判定归 P2-12。
- **只核对，不实现：** 本子任务不新增功能代码。发现缺口时，按 execute-goal 的补救流程新增子任务。

## 不包含

- 新功能、P2-06 及以后的转换、页面接线（P2-11）与 P2 阶段退出评审（P2-13）。

## 关键文件与契约

- [spec](../spec.md)、[goal](../goal.md) 及 01–12 的完成证据。
- `src/content/graphics/`、`src/original-data/conversion/`、[source-error.ts](../../../../../src/original-data/source-error.ts)、[verify-source-mappings.ts](../../../../../src/original-data/source/verify-source-mappings.ts)、[payloads.ts](../../../../../src/original-data/payloads.ts)、`src/workers/`、[import-job-owner.ts](../../../../../src/app/import/import-job-owner.ts)、[nob-check.ts](../../../../../tools/nob-check.ts)、`e2e/import-worker.spec.ts`。
- [源码结构](../../../../engineering/source-structure.md)、[工程约定](../../../../engineering/README.md)、[工具指南](../../../../guides/tools.md)、[阶段索引](../../tasks.md)。

## 验收标准

- [x] S-01 至 S-13、AC-01 至 AC-18 都有对应的实现与验证证据；AC-13 至 AC-16 的本地证据只含命令、地址、计数与判定。
- [x] 上列不变量全部成立，或已有补救子任务。
- [x] `pnpm check`、聚焦 E2E、`pnpm check:original` 与文档检查通过；`node tools/task-state.ts p2/05` 的状态与 tracker 一致。
- [x] 依赖清单与锁文件不变；提交中没有原版内容或 `local/` 输出。

## 验证方法

- 逐项审阅与命令输出；必要时请独立审阅者复核覆盖表。
- 浏览器部分按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md) 的规则复跑聚焦用例。
- 不适用新的原版对照；沿用 09–12 的本地证据。

## 完成证据

2026-10-05 完成。核对范围是 goal 的 12 个提交（`bc671e2`…`0eb3731`，基于 `7cb6266`），本子任务只有文档改动。

**覆盖表：** 测试文件位于 `src/content/graphics/`（简写 cg）、`src/original-data/conversion/`（简写 conv）、`src/workers/`、`src/app/import/` 与 `e2e/`。

| 项 | 实现 | 验证证据 |
|---|---|---|
| S-01 | cg `palette-payload.ts`；conv `source-graphics.ts` 的 `readDataPalette`、`readEmbeddedPalette` | cg `palette-payload.test.ts`；conv `source-graphics.test.ts`（DATA、嵌入 BGR）、`convert-graphics.test.ts`（01、03、04） |
| S-02 | cg `image-payload.ts`；conv `decodeImageRecord`、`convert-graphics.ts` | cg `image-payload.test.ts`；conv `source-graphics.test.ts`（非对称 raw/RLE）、`convert-graphics.test.ts`（行序、颜色键） |
| S-03 | cg `font-payload.ts`（12 修订的每字形行数）；conv `graphics-declarations.ts`、`production-graphics.ts` | cg `font-payload.test.ts`、`glyph-lookup.test.ts`；conv `graphics-declarations.test.ts`、`convert-graphics.test.ts`、`production-graphics.test.ts`；12 的 hud 对照 |
| S-04 | cg `expand-image.ts`、`glyph-lookup.ts`、`graphics-binding.ts` | cg `expand-image.test.ts`、`glyph-lookup.test.ts`、`graphics-binding.test.ts`（02） |
| S-05 | conv `graphics-declarations.ts`、`convert-graphics.ts`、`source-graphics.ts`；`payloads.ts` 只剩 ID 列表与 MESH/MODL | conv 声明、转换与源读取测试（03、04） |
| S-06 | conv `graphics-step.ts`；`verify-source-mappings.ts` 可选 `readEntry` | conv `graphics-step.test.ts`（子资源只在转换成功后 `verified`）；`verify-source-mappings.test.ts`（05） |
| S-07 | `GRAPHICS_LIMITS`、`PRODUCTION_GRAPHICS_SHARE`、`addBudgets`，转换器先扣除再分配 | conv `convert-graphics.test.ts` 的 budget 用例、`graphics-step.test.ts`、`production-graphics.test.ts`；`src/content/budget.test.ts` |
| S-08 | `source-error.ts` 新增 code 与限值名，content 新增 5 个 code | 各层拒绝测试；`expectSourceError` 校验位置语法与可打印 ASCII 原因；`import-pipeline.test.ts` 的三类失败 |
| S-09 | conv `graphics-step.ts`；`import-job.ts`、`import-protocol.ts`（版本 2）、`import-job-owner.ts` | conv `graphics-step.test.ts`；`import-job.test.ts`、`import-protocol.test.ts`、`import-job-owner.test.ts`、`import-pipeline.test.ts`（05、07） |
| S-10 | conv `production-graphics.ts` | conv `production-graphics.test.ts`；10 的本地基准 |
| S-11 | 11：textures §3、U-028；12：hud §1.1、U-030 | 11、12 的完成证据 |
| S-12 | Node 合成测试；`import-worker.spec.ts`；加固的 `tools/nob-check.ts` | 下列命令；09、10 的本地证据 |
| S-13 | 源码结构、工程约定、工具指南、AGENTS；原版事实只在 `docs/original/` | 下文的文档核对 |
| AC-01 | 同 S-01 | cg `palette-payload.test.ts`；conv `source-graphics.test.ts`（767/769 字节、分量大于 63、257 项、缺少嵌入调色板） |
| AC-02 | 同 S-02 | conv `source-graphics.test.ts`（非对称 raw/RLE、长度为 0 的首段、全透明行、独占缓冲）；`convert-graphics.test.ts`（`reversed`） |
| AC-03 | `readImageRecordHeader` 先于解码检查 | conv `source-graphics.test.ts`（位深、保留字段、指针、编码 1/3、宽高 0/641/481、65535×65535 只读头部）；`convert-graphics.test.ts`（预算拒绝后用量不变） |
| AC-04 | 声明绑定与 `checkPaletteIndices` | conv `graphics-declarations.test.ts`、`convert-graphics.test.ts`；cg `graphics-binding.test.ts`（`binding-mismatch`） |
| AC-05 | `expandImage`、`nearestColourMap` | cg `expand-image.test.ts` |
| AC-06 | `colourKeyMask` | conv `convert-graphics.test.ts` |
| AC-07 | 字体表、目录与声明 | conv `source-graphics.test.ts`（4×6/8×8、宽高 0/9、表长、目录项数、`fonts/3`）；`convert-graphics.test.ts`（单元、按声明行数切分）；`graphics-declarations.test.ts`（`glyphRows` 与区间）；cg `font-payload.test.ts`、`glyph-lookup.test.ts` |
| AC-08 | 三类编码器与读取器 | cg 三个 payload 测试与 `graphics-binding.test.ts`（`validateGroup` 无 `payload-mismatch`）；conv `convert-graphics.test.ts`（确定性） |
| AC-09 | `runGraphicsStep` | conv `graphics-step.test.ts`（分区、升序、无定位、两个调色板字节相同、`group-complete`） |
| AC-10 | 扣除、共用读取、用量合并 | conv `convert-graphics.test.ts`、`graphics-step.test.ts`（恰等于限值、每维超出、迟到拒绝、共用条目只读一次）；`production-graphics.test.ts`；`verify-source-mappings.test.ts`；`import-job.test.ts`（`finished.usage`） |
| AC-11 | 协议、作业与持有者 | `import-protocol.test.ts`、`import-job-owner.test.ts`（阶段顺序 `protocol-error@message.stage`）、`import-job.test.ts`、`import-pipeline.test.ts`（三类失败） |
| AC-12 | `graphics`/`graphics-corrupt` 场景 | `pnpm test:e2e import-worker.spec.ts --project=development`（08；本子任务复跑通过，glyphs 704） |
| AC-13 | — | 10 的本地基准；12 用修订后的声明复跑，`passed: true` |
| AC-14 | `tools/nob-check.ts` | 09 的本地全量结构校验 |
| AC-15 | — | 11：textures §3、U-028 |
| AC-16 | conv `production-graphics.ts` | 12：hud §1.1、U-030、`production-graphics.test.ts` |
| AC-17 | 边界与隐私 | 下文的不变量与命令 |
| AC-18 | 文档 | 下文的文档核对；09、11、12 的原版文档 |

[行为与边界](../spec.md#行为与边界)的每一行和[错误码](../spec.md#错误码)的每个 code，都落在上表所列测试的正负用例中，各子任务完成证据中有逐项记录。

**不变量：**

- **唯一实现：** 只有 `src/content/graphics/expand-image.ts` 实现调色板查找与最近色；`payloads.ts` 中没有图像、调色板或字体解码函数。
- **不回退：** 没有声明绑定的图像不使用 DATA（AC-04 测试）；未映射码位报 `unmapped-character`，不回退（`glyph-lookup.test.ts`、`production-graphics.test.ts`）。
- **先于分配：** 超限与预算拒绝都在分配之前（AC-03 的 65535×65535、转换器的“先扣除”测试）；共用条目在一步内只读一次（`graphics-step.test.ts` 的读取计数）。
- **失败无残留：** 步骤失败没有部分结果或 `verified`；本任务的作业 `finished.groups` 为空。
- **诊断隐私：** 本任务的诊断位置符合位置语法，原因是可打印 ASCII 的固定文字或结构限值，不含原版字节、条目编号、偏移或路径。继承的读取错误保持原形状（`import-pipeline.test.ts` 的 `entry-not-found` 与 `image:lba 18` 用例）。
- **导入边界：**
  - `src/content` 的生产模块不导入 `original-data`（唯一命中是既有的 content 测试导入 `original-data/synthetic.ts`，测试分层允许）；
  - `original-data/conversion/` 只值导入 content、本层模块与 `verify-source-mappings.ts`，`archive-reader.ts`、`open-verified-source.ts` 只作纯类型导入；
  - `src/workers` 没有 `fetch`、`XMLHttpRequest`、`WebSocket` 等网络 API。
- **与研究一致：** 生产映射没有 `nearest` 图像（最近色由 P2-06 按 11 的约束使用）；三个字库的映射为 likely，带 U-029 与 U-030，区间与 hud §1.1 一致。

**命令（2026-10-05，在 `0eb3731` 上）：**

- `pnpm check`：106 个文件，3,083 项通过，构建成功；
- `pnpm test:e2e`：全部项目 54 项通过，包括 P2-01 至 P2-04 与 P2-10 的浏览器回归；
- `pnpm test:e2e import-worker.spec.ts --project=development`：11 项通过；
- `pnpm check:original` 通过；
- 文档链接检查无问题；
- `node tools/task-state.ts p2/05`：本子任务提交前为 `subtask 13 is in progress`，与 tracker 一致；
- `git diff 7cb6266..HEAD -- package.json pnpm-lock.yaml .nvmrc` 为空。

**提交范围：** 12 个提交只触及 `src/`、`e2e/`、`tools/nob-check.ts` 与文档，没有二进制文件，也没有 `local/` 路径。新增行中没有长十六进制或 base64 串，也没有反编译输出的标识符（例如 `FUN_`/`DAT_` 地址名、`undefined4`）。

**文档核对：** 源码结构、工程约定、工具指南、AGENTS、textures、hud、unknowns 与 executable 都与实现和研究结论一致，全部 `updated:` 为 2026-10-05。[tasks](../../tasks.md)已有 P2-05 的 spec/goal 导航，无需改动。P2-05 完成改变了阶段摘要与下一步，因此更新 [STATUS](../../../../STATUS.md)。

**交接核对：** spec 的范围外说明仍然准确：
- 容器子资源与地图调色板归 P2-07；
- 贴图选型、歧义贴图（textures §3 的 29 个 TEX）与 `nearest` 映射归 P2-06；
- 组装、`ConverterVersion` 与页面接线归 P2-06/07/11；
- 单元外像素的绘制语义（U-030）在 P2-07 的 HUD 布局中使用；
- 最终保真判定归 P2-12。

**审查：** 本子任务只改文档，不做 simplify。rubber-duck 独立抽查了覆盖表中的全部 AC（重点为 AC-01、03、07、09、10、11）、每个新错误码的测试、上列不变量与各项数字，结论都成立。唯一的 High 是审查时 tracker 仍为 in-progress、而 STATUS 已写 P2-05 完成；已在提交前把 tracker 标为 completed，`node tools/task-state.ts p2/05` 随之报告完成。
