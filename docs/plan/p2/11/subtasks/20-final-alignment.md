---
type: plan
status: active
phase: P2
task: "11"
subtask: "20"
updated: 2026-10-06
---

# 20 — P2-11 最终对齐验证

**契约来源：** [spec](../spec.md) 的全部 S-01 至 S-13、AC-01 至 AC-24，以及[风险与恢复](../spec.md#风险与恢复)。
**依赖：** 01, 02, 03, 04, 05, 06, 07, 08, 09, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 23, 24。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **覆盖核对：** 对照 spec 与各子任务的完成证据，逐项形成 S/AC 覆盖表。确认[行为与边界](../spec.md#行为与边界)的每一行、[状态阶梯](../spec.md#状态阶梯)的每个状态、[失败反馈](../spec.md#失败反馈)的每个类别，都有对应的测试或证据。
- **不变量核对：**
  - `app/`、`render/`、`ui/` 不导入 `original-data`；从 `src/main.tsx` 出发的生产模块图不含 `original-data` 与测试支持；
  - 只经 `content/` 的读取与消费函数取数据，没有第二套解码、调色板展开或布局合成；
  - 页面只显示经实际验证的状态；全站没有禁用词，也不显示原版文字；
  - 缓存只经 P2-10 的适配器；只提交完整的导入包；恢复只按预期包配置筛选；
  - 呈现约定集中在一处，源码结构记录各项置信度；
  - 新增主线程模块不使用网络 API；没有 Blob URL、`HTMLImageElement` 或 2D Canvas 显示原版图像；
  - 合成演示独立可用。
- **工程检查：**
  - `pnpm check`、`pnpm test:e2e`（全部项目）、`pnpm check:original`；
  - 文档链接与元数据检查；
  - `node tools/task-state.ts p2/11` 与 tracker 一致；
  - `package.json`、`pnpm-lock.yaml` 与 `.nvmrc` 没有变化。
- **提交范围：** 审阅 goal 的全部提交，确认没有原版内容、二进制样本、反编译输出、截图或 `local/` 输出。
- **人工与研究证据：**
  - 19 的用户核对对应最终的生产 `ConverterVersion`；若 16 在 19 之后改变了它，19 须按其说明重新确认；
  - 15、16 若为 blocked，本子任务不能完成，等待用户决定。
- **文档：** 更新 STATUS 的阶段摘要与下一步；核对源码结构、工程约定、本地导入指南、README、executable 与 unknowns。
- **只核对，不实现：** 发现缺口时，按 execute-goal 的补救流程新增子任务。

## 不包含

- 新功能、网络审计与原版保真对照（P2-12）、P2 退出评审（P2-13）。

## 关键文件与契约

- [spec](../spec.md)、[goal](../goal.md) 与各子任务的完成证据；[STATUS](../../../../STATUS.md)。

## 验收标准

- [ ] S-01 至 S-13、AC-01 至 AC-24 都有对应的实现与验证证据。
- [ ] 上列不变量全部成立，或已有补救子任务。
- [ ] AC-23：`pnpm check`、全部 E2E、`pnpm check:original` 与文档检查通过；依赖清单与锁文件没有变化；`node tools/task-state.ts p2/11` 与 tracker 一致。
- [ ] 提交中没有原版内容或 `local/` 输出；19 的证据对应最终构建。

## 验证方法

- 逐项审阅与命令输出；浏览器部分按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md) 复跑全部 E2E。
- 不适用新的原版对照。

## 完成证据
