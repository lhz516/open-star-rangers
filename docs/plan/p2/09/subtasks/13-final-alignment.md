---
type: plan
status: active
phase: P2
task: "09"
subtask: "13"
updated: 2026-10-05
---

# 13 — P2-09 最终对齐验证

**契约来源：** [spec](../spec.md) 的全部 S-01 至 S-14、AC-01 至 AC-15，重点为 AC-13、AC-15 与[风险与恢复](../spec.md#风险与恢复)。
**依赖：** 01, 02, 03, 04, 05, 06, 07, 08, 09, 10, 11, 12。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **覆盖核对：** 对照 spec、实际导出、测试与 01–12 的完成证据，逐项形成 S/AC 覆盖表；确认源字段处理表的每一行、每个错误码与限值名都有正负测试。
- **不变量核对：**
  - Core 与 `content/` 不导入 `original-data`；转换器只经 `VerifiedSource` 取字节；Worker 仍禁用网络 API；
  - 生产代码中没有地图框架、比例或其他研究数值（AC-02、AC-13），研究事实只在 `docs/original/` 维护；
  - `ConverterVersion` 与机型到模型的绑定在生产代码中各只有一份；
  - 诊断、快照、console 与 CLI 输出不含名称、坐标、原版字节或私人绝对路径；
  - 研究门槛若曾触发，spec 修订与重新批准记录完整，goal 覆盖与修订后的 S/AC 一致。
- **工程检查与提交范围：**
  - 运行 `pnpm check`、完整的 `pnpm test:e2e`（Worker 生产入口已改变）、`pnpm --silent check:original`、文档链接与元数据检查，以及 `node tools/task-state.ts p2/09`；
  - 审阅 goal 的全部提交：没有原版内容、二进制样本或 `local/` 输出，依赖清单与锁文件没有变化；
  - P2-01 至 P2-04、P2-10 的契约测试与既有浏览器回归保持通过。
- **交接核对：** P2-06 使用 06 的绑定（S-05）；P2-11 消费 `logic` 组与 `loadMission`；P2-12 负责独立原版对照；P3 接手规则输入、生成与地图/Warp 规则。确认 spec 的范围外说明仍然准确。
- **只核对，不实现：** 本子任务不新增功能代码。发现缺口时按 execute-goal 的补救流程新增子任务。

## 不包含

- 新功能、P2-05 至 P2-08 与 P2-11 的工作、P2 阶段退出评审（P2-13）。

## 关键文件与契约

- [spec](../spec.md)、[goal](../goal.md) 及 01–12 的完成证据。
- `src/original-data/formats/`、`src/original-data/conversion/`、`src/content/logic/`、`src/content/manifest-identity.ts`、`src/core/mission/`、`src/workers/`、`src/app/import/`、`tools/logic-check.ts`。
- [源码结构](../../../../engineering/source-structure.md)、[工程约定](../../../../engineering/README.md)、[工具指南](../../../../guides/tools.md)、[scenario](../../../../original/formats/scenario.md)、[unknowns](../../../../original/unknowns.md)、[阶段索引](../../tasks.md)。

## 验收标准

- [ ] S-01 至 S-14、AC-01 至 AC-15 逐项有实现与验证证据，没有未解释的缺口，也没有用代理证据替代要求；AC-01、AC-02 的证据来自本地研究，AC-14 的证据来自真实的本地基准运行。
- [ ] `pnpm check`、完整的 `pnpm test:e2e` 与 `pnpm --silent check:original` 通过；依赖清单与锁文件没有变化；仓库没有新增二进制样本或 `local/` 文件。
- [ ] AC-15：文档、源码边界与测试发现一致，改动文档的 `updated:` 正确，链接、锚点与元数据检查通过；`node tools/task-state.ts p2/09` 在标记完成后输出 `done`。

## 验证方法

- 运行上述命令，审阅 goal 范围内的 diff，并做文档链接与锚点检查；覆盖审计交由独立的 rubber-duck 复核。
- 浏览器证据只来自既有 Worker 回归的重跑（技术决定 12），本地基准证据来自 12；本子任务核对其适用性，不以模拟替代。

## 完成证据
