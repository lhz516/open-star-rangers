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
**依赖：** 01, 02, 03, 04, 05, 06, 07, 08, 09, 11, 12。
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

- [ ] S-01 至 S-13、AC-01 至 AC-14 逐项有实现与验证证据，没有未解释的缺口，也没有用代理证据替代要求；AC-12 的证据来自真实的本地基准运行。
- [ ] `pnpm check` 与 `pnpm check:original` 通过；依赖清单与锁文件没有变化；仓库没有新增二进制样本。
- [ ] 文档、源码边界、测试发现与事实归属一致，文档链接与元数据检查通过；`node tools/task-state.ts p2/03` 在标记完成后输出 `done`。

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

