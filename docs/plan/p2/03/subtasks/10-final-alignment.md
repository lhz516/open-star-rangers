---
type: plan
status: active
phase: P2
task: "03"
subtask: "10"
updated: 2026-10-05
---

# 10 — P2-03 最终对齐验证

**契约来源：** [spec](../spec.md) 的全部 S-01 至 S-13、AC-01 至 AC-14，重点为 AC-10、AC-12、AC-13、AC-14 与[风险与恢复](../spec.md#风险与恢复)。
**依赖：** 01, 02, 03, 04, 05, 06, 07, 08, 09, 11, 12, 13, 14。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **覆盖核对：** 对照 spec、实际导出、测试与 01–09 的完成证据，逐项形成 S/AC 覆盖表。确认每个错误码都有正负测试，每个限值都有独立的边界用例，内存解析与按需读取共用样本表。
- **不变量核对：**
  - 无部分成功；读取日志按需；先核对大小再计算哈希；哈希分段不超过 4 MiB；
  - 光盘层错误以同一实例传递；映射核验的错误位置为结构路径；
  - 返回字节独占，身份与目录项冻结；
  - 指纹规范文本与固定常量一致；
  - 诊断不含字节、原始标签、宿主名、locator 值或绝对路径；
  - 产品入口固定使用生产白名单，底层能力只能被允许的使用者访问。
- **工程检查与提交范围：** 运行 `pnpm check`、`pnpm check:original`、文档链接与元数据检查，以及 `node tools/task-state.ts p2/03`。审阅 goal 的全部提交，确认：
  - 没有原版内容、二进制样本或研究输出；
  - 依赖清单与锁文件没有变化；
  - P2-01/P2-02 的契约测试、合规 manifest 与 P1 既有行为保持通过。
- **只核对，不实现：** 本子任务不新增功能代码。发现缺口时按 execute-goal 的补救流程新增子任务。

## 不包含

- 新功能、Worker 与真实浏览器验证（P2-04），以及 P2 阶段退出评审（P2-13）。

## 关键文件与契约

- [spec](../spec.md)、[goal](../goal.md) 及 01–09 的完成证据。
- `src/original-data/archive/`、`src/original-data/source/`、[imfat.ts](../../../../../src/original-data/imfat.ts)、[sha256.ts](../../../../../src/content/sha256.ts)、`tools/source-check.ts`、[eslint.config.js](../../../../../eslint.config.js)、[engineering-boundaries.test.ts](../../../../../tools/engineering-boundaries.test.ts)。
- [源码结构](../../../../engineering/source-structure.md)、[工程约定](../../../../engineering/README.md)、[工具指南](../../../../guides/tools.md)、[imfat](../../../../original/formats/imfat.md)。

## 验收标准

- [x] S-01 至 S-13、AC-01 至 AC-14 逐项有实现与验证证据，没有未解释的缺口，也没有用代理证据替代要求；AC-12 的证据来自真实的本地基准运行。
- [x] `pnpm check` 与 `pnpm check:original` 通过；依赖清单与锁文件没有变化；仓库没有新增二进制样本。
- [x] 文档、源码边界、测试发现与事实归属一致，文档链接与元数据检查通过；`node tools/task-state.ts p2/03` 在标记完成后输出 `done`。

## 验证方法

- 运行上述命令，审阅 goal 范围内的 diff，并做文档链接与锚点检查。
- 不适用 browser-testing；原版本地核对由 09 完成。

## 完成证据

### 首次最终对齐（2026-10-05，未通过）

- **检查：** 在 HEAD `853a848` 上：
  - `pnpm check`：86 个测试文件 2,312 个测试与构建通过；
  - `pnpm check:original` passed；
  - 文档链接检查通过；
  - `node tools/task-state.ts p2/03` 结构有效。

  自 `9719c39` 起，依赖清单与锁文件无变化，没有二进制或 `local/` 文件进入提交。
- **覆盖复核：** rubber-duck 逐项复核 S/AC：
  - S-01–S-06、S-08、S-09、S-11、S-12 通过；AC-01–AC-09、AC-11、AC-12 通过；
  - 错误码集合与 spec 的 11 个 code 完全一致，每个 code 都有产生路径与测试。
- **缺口（阻塞）：**
  - **AC-14/S-07/S-13/AC-13：** 本地类型再导出与嵌套受限模块可以绕过边界，工程约定的描述也强于实际执行。补救为 [11](./11-capability-bypass.md)。
  - **AC-10/S-10：** `request.entry` 与 `catalog.files` 超出封闭位置语法。补救为 [12](./12-location-grammar.md)。
- **处理：** 本行改回 `pending`，在 11、12 完成后重新对齐。

### 第二次最终对齐（2026-10-05，未通过）

- **检查：** 在 HEAD `1d67f23` 上：
  - `pnpm check`：87 个测试文件 2,342 个测试中 1 个失败（见下方偶发失败），构建通过；
  - `pnpm check:original` 通过。

  自 `9719c39` 起，依赖清单与锁文件仍无变化，没有二进制或 `local/` 文件进入提交。
- **覆盖复核：** rubber-duck 逐项复核 S/AC：
  - AC-10/S-10 经 12 补救后通过：全部 `SourceError` 构造与转发位置都在封闭语法内；
  - S-01–S-06、S-08–S-12 与 AC-01–AC-12 通过，包括按需读取、独占字节、同一实例传递光盘层错误、先核对大小再计算哈希、哈希分段不超过 4 MiB、结构化映射位置、冻结、固定指纹、诊断脱敏、错误码正负测试、限值边界与共用样本表。
- **缺口（阻塞）：**
  - **AC-12/S-13（自动化部分）：** `tools/source-check.test.ts` 的关闭断言依赖异步关闭的完成顺序，负载下偶发失败。补救为 [13](./13-close-order-flake.md)。
  - **AC-14/S-07/S-13/AC-13：** 底层能力可经来源族模块、测试支持或 `tools/` 转手到达 Worker 与转换模块。补救为 [14](./14-capability-laundering.md)。
- **处理：** 本行改回 `pending`，在 13、14 完成后再次对齐。

### 第三次最终对齐（2026-10-05，通过）

- **检查：** 在 HEAD `a8473e3` 上：
  - `pnpm check`：87 个测试文件 2,358 个测试与构建通过；
  - `pnpm check:original` 通过；
  - 自 `9719c39` 起改动的全部文档，以及 spec、P2 任务索引与 STATUS，都通过链接与锚点检查，改动文档的 `updated` 日期都已更新；
  - `node tools/task-state.ts p2/03` 结构有效。

  自 `9719c39` 起，依赖清单与锁文件无变化，没有二进制或 `local/` 文件进入提交。
- **补救核对：**
  - **13：** CLI 关闭断言与完成顺序无关，仍能发现漏关与重复关闭。
  - **14：** lint 与依赖图都拒绝以下转手途径：来源族 barrel、测试支持、`tools/`、E2E 支持、公开模块的再导出或包装，以及产品入口的再导出、别名、默认导出与值 `export *`。

  AC-14 的放行项全部通过：产品入口、错误类型、`DiscPath`、来源映射读取、纯类型导入、`tools/` 与测试使用底层能力，以及 platform 对字节端口的纯类型导入。
- **覆盖表：**

  | 要求 | 结论 | 主要证据 |
  |---|---|---|
  | S-01、S-02、AC-01、AC-03 | 通过 | [02](./02-archive-rules-memory.md#完成证据)、[03](./03-on-demand-archive.md#完成证据)：共用样本表，限值边界与 +1 |
  | S-03、AC-02 | 通过 | [03](./03-on-demand-archive.md#完成证据)：只读文件头与目录，按需读取，独占字节，预算与取消 |
  | S-04、AC-04 | 通过 | [04](./04-catalog-fingerprint.md#完成证据)：冻结白名单与 manifest 自动核对 |
  | S-05、S-06、AC-05、AC-06、AC-07 | 通过 | [04](./04-catalog-fingerprint.md#完成证据)、[05](./05-identify-verified-source.md#完成证据)：先核对大小再分段计算哈希，固定指纹，光盘层错误原样传递 |
  | S-07、AC-08、AC-14 | 通过 | [05](./05-identify-verified-source.md#完成证据)、[07](./07-capability-boundary.md#完成证据)、[11](./11-capability-bypass.md#完成证据)、[14](./14-capability-laundering.md#完成证据) |
  | S-08、AC-09 | 通过 | [06](./06-mapping-verification.md#完成证据)：结构化位置，精确比较备选项 |
  | S-09 | 通过 | [02](./02-archive-rules-memory.md#完成证据)、[03](./03-on-demand-archive.md#完成证据)：先检查结构限值再分配或读取 |
  | S-10、AC-10 | 通过 | [12](./12-location-grammar.md#完成证据)：封闭位置语法，诊断脱敏，无部分成功 |
  | S-11、AC-11 | 通过 | [01](./01-incremental-sha256.md#完成证据) |
  | S-12 | 通过 | 各层合成构建器；测试不读取原版文件 |
  | S-13、AC-12、AC-13 | 通过 | [08](./08-source-check-cli.md#完成证据)、[09](./09-local-base-check.md#完成证据)（真实本地基准运行）、[13](./13-close-order-flake.md#完成证据)；工程约定、工具指南与 imfat 文档与实现一致 |

- **Rubber-duck：** 第三次逐项复核 S/AC，全部通过，无阻塞与非阻塞问题。复核时独立运行：2 个聚焦测试文件 85 个测试通过，`pnpm lint`、`pnpm typecheck` 与 `pnpm check:original` 通过。
- **文档影响：** [STATUS](../../../../STATUS.md) 更新阶段摘要与下一步（P2-04 与 P2-10 并行）；[P2 任务索引](../../tasks.md)的导航仍然准确，无需改动。
- **范围外观察：** 消费者层的传递检查只跟随 `src/` 内的边，见 [14](./14-capability-laundering.md#完成证据)；不影响本任务的验收。
