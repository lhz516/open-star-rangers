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

- [ ] S-01 至 S-13、AC-01 至 AC-18 都有对应的实现与验证证据；AC-13 至 AC-16 的本地证据只含命令、地址、计数与判定。
- [ ] 上列不变量全部成立，或已有补救子任务。
- [ ] `pnpm check`、聚焦 E2E、`pnpm check:original` 与文档检查通过；`node tools/task-state.ts p2/05` 的状态与 tracker 一致。
- [ ] 依赖清单与锁文件不变；提交中没有原版内容或 `local/` 输出。

## 验证方法

- 逐项审阅与命令输出；必要时请独立审阅者复核覆盖表。
- 浏览器部分按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md) 的规则复跑聚焦用例。
- 不适用新的原版对照；沿用 09–12 的本地证据。

## 完成证据
