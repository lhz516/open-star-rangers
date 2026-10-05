---
type: plan
status: active
phase: P2
task: "02"
subtask: "10"
updated: 2026-10-04
---

# 10 — P2-02 最终对齐验证

**契约来源：** [spec](../spec.md) 的全部 S-01 至 S-13、AC-01 至 AC-13，重点为 AC-09、AC-12、AC-13 与[风险与恢复](../spec.md#风险与恢复)。
**依赖：** 01, 02, 03, 04, 05, 06, 07, 08, 09。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **覆盖核对：** 对照 spec、实际导出、测试与 01–09 的完成证据，逐项形成 S/AC 覆盖表。确认每个错误码都有正负测试，每个限值都有独立的边界用例。
- **不变量核对：**
  - 无部分成功；
  - 读取日志按需；
  - `sourceReadBytes` 计量与取消语义；
  - 结果独占；
  - 诊断不含字节、宿主名、记录原名或绝对路径；
  - 端口边界只有一条放行。
- **工程检查与提交范围：** 运行 `pnpm check`、`pnpm check:original`、文档链接与元数据检查，以及 `node tools/task-state.ts p2/02`。审阅 goal 的全部提交，确认：
  - 没有原版内容、镜像类文件或研究输出；
  - 依赖清单与锁文件没有变化；
  - 来源映射、合规 manifest 与 P1 既有行为保持通过。
- **只核对，不实现：** 本子任务不新增功能代码。发现缺口时按 execute-goal 的补救流程新增子任务。

## 不包含

- 新功能、真实浏览器或 Worker 验证（P2-04），以及 P2 阶段退出评审（P2-13）。

## 关键文件与契约

- [spec](../spec.md)、[goal](../goal.md) 及 01–09 的完成证据。
- `src/original-data/io/`、`src/original-data/disc/`、`src/platform/files/`、`tools/` 中新增的文件，[eslint.config.js](../../../../../eslint.config.js)、[engineering-boundaries.test.ts](../../../../../tools/engineering-boundaries.test.ts)。
- [源码结构](../../../../engineering/source-structure.md)、[工程约定](../../../../engineering/README.md)、[工具指南](../../../../guides/tools.md)、`docs/original/`。

## 验收标准

- [ ] S-01 至 S-13、AC-01 至 AC-13 逐项有实现与验证证据，没有未解释的缺口，也没有用代理证据替代要求；AC-12 的证据来自真实的本地基准运行。
- [ ] `pnpm check` 与 `pnpm check:original` 通过；依赖清单与锁文件没有变化；仓库没有新增镜像类二进制。
- [ ] 文档、源码边界、测试发现与事实归属一致，文档链接与元数据检查通过；`node tools/task-state.ts p2/02` 在标记完成后输出 `done`。

## 验证方法

- 运行上述命令，审阅 goal 范围内的 diff，并做文档链接与锚点检查。
- 不适用 browser-testing；原版本地对照由 09 完成。

## 完成证据
