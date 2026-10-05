---
type: plan
status: active
phase: P2
task: "04"
subtask: "12"
updated: 2026-10-05
---

# 12 — P2-04 最终对齐验证

**契约来源：** [spec](../spec.md) 的全部 S-01 至 S-12、AC-01 至 AC-13，重点为 AC-08 至 AC-13 与[风险与恢复](../spec.md#风险与恢复)。
**依赖：** 01, 02, 03, 04, 05, 06, 07, 08, 09, 10, 11。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **覆盖核对：** 对照 spec、实际导出、测试与 01–11 的完成证据，逐项形成 S/AC 覆盖表。确认消息表、错误层与 code、验证顺序、命令与快照的每一项都有正负测试。
- **不变量核对：**
  - 至多一个活动作业与一个存活的 Worker；终态后 Worker 已终止、监听已移除；
  - 旧作业的消息不影响新作业；
  - `failed`、`cancelled` 不暴露来源身份与组；`finished` 不表示资源可用；
  - payload 不进入快照，只能一次性移交；
  - 主线程不读取文件字节；
  - 诊断、快照与 console 不含文件名、字节、宿主错误文本或绝对路径；
  - 协议模块与 app、platform 不触及 `original-data`；Worker 只经产品入口取得原版字节。
- **工程检查与提交范围：**
  - 运行 `pnpm check`、完整的 `pnpm test:e2e`、`pnpm check:original`、文档链接与元数据检查，以及 `node tools/task-state.ts p2/04`；
  - 审阅 goal 的全部提交，确认没有原版内容、二进制样本或 `local/` 输出，依赖清单与锁文件没有变化；
  - 确认 P2-01 至 P2-03 的契约测试与 P1 的浏览器回归保持通过。
- **交接核对：** 确认 spec 的范围外说明仍然准确：生产预览、CSP 与 SWA 回退，以及真实 StrictMode 与 Fast Refresh 归 P2-11；网络审计归 P2-12。
- **只核对，不实现：** 本子任务不新增功能代码。发现缺口时按 execute-goal 的补救流程新增子任务。

## 不包含

- 新功能、P2-05 及以后的转换、页面接线（P2-11），以及 P2 阶段退出评审（P2-13）。

## 关键文件与契约

- [spec](../spec.md)、[goal](../goal.md) 及 01–11 的完成证据。
- `src/workers/`、`src/app/import/`、`src/platform/workers/`、[vite.config.ts](../../../../../vite.config.ts)、[eslint.config.js](../../../../../eslint.config.js)、[engineering-boundaries.test.ts](../../../../../tools/engineering-boundaries.test.ts)、`e2e/import-worker.spec.ts`、[browser-probes.ts](../../../../../e2e/support/browser-probes.ts)。
- [源码结构](../../../../engineering/source-structure.md)、[工程约定](../../../../engineering/README.md)、[阶段索引](../../tasks.md)。

## 验收标准

- [ ] S-01 至 S-12、AC-01 至 AC-13 逐项有实现与验证证据，没有未解释的缺口，也没有用代理证据替代要求；AC-08 至 AC-10 的证据来自真实 Chromium Worker，AC-12 的证据来自真实的本地基准运行。
- [ ] `pnpm check`、完整的 `pnpm test:e2e` 与 `pnpm check:original` 通过；依赖清单与锁文件没有变化；仓库没有新增二进制样本或 `local/` 文件。
- [ ] 文档、源码边界与测试发现一致，文档链接与元数据检查通过；`node tools/task-state.ts p2/04` 在标记完成后输出 `done`。

## 验证方法

- 运行上述命令，审阅 goal 范围内的 diff，并做文档链接与锚点检查。
- 浏览器与本地基准证据由 09、10、11 取得；本子任务核对其适用性，不以截图或模拟替代。

## 完成证据
