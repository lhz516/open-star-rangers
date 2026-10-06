---
type: plan
status: active
phase: P2
task: "06"
subtask: "13"
updated: 2026-10-06
---

# 13 — P2-06 最终对齐验证

**契约来源：** [spec](../spec.md) 的全部 S-01 至 S-13、AC-01 至 AC-17，重点为 AC-11 至 AC-17 与[风险与恢复](../spec.md#风险与恢复)。
**依赖：** 01, 02, 03, 04, 05, 06, 07, 08, 09, 10, 11, 12, 14。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **覆盖核对：** 对照 spec、实际导出、测试与 01–12 的完成证据，逐项形成 S/AC 覆盖表。确认[行为与边界](../spec.md#行为与边界)的每一行、[错误码](../spec.md#错误码)的每个 code 与失败边界一览的每一行，都有对应的正负测试或本地证据。
- **不变量核对：**
  - 只有一处调色板查找与最近色实现；[payloads.ts](../../../../../src/original-data/payloads.ts) 中没有 MESH 或 MODL 解析；
  - 机型模型 ID 只来自 P2-09 的绑定，样本 ID 只来自 P2-08 的生产音效表，贴图 ID 只来自生产贴图表；
  - 浮点、绕序、UV 与部件结构原样保留，转换不换算坐标；payload 不承载未确认的含义；
  - 超限与预算拒绝发生在分配之前；共用的 MESH 与 TEX 在一步内只物理读取一次；
  - 步骤失败时没有部分结果；作业失败与取消时没有部分组；全部已发送组共用一个身份；
  - 本任务产生的诊断不含原版字节、条目编号、偏移、文件名或宿主路径；继承的读取错误保持 P2-02/03 的形状；
  - `content/` 不导入 `original-data`；`original-data/conversion/` 只经产品入口取得封包；`workers/` 不使用网络 API；
  - 生产映射的置信度与 U 项与 10、11、12 的研究结论一致。
- **工程检查：**
  - 运行 `pnpm check`、`pnpm test:e2e`（全部项目，含 `e2e/import-worker.spec.ts`）、`pnpm check:original`、文档链接与元数据检查，以及 `node tools/task-state.ts p2/06`；
  - 确认 P2-01 至 P2-05、P2-08 至 P2-10 的测试与浏览器回归保持通过；
  - 依赖清单与锁文件没有变化。
- **提交范围：** 审阅 goal 的全部提交，确认没有原版内容、二进制样本、反编译输出、截图或 `local/` 输出。
- **文档核对：** 以下文档与实现和研究结论一致，`updated:` 已更新：
  - 源码结构、工程约定、工具指南；
  - 原版文档：mesh、textures、unknowns，按需 executable。

  `tasks.md` 只有导航；STATUS 只在阶段摘要或下一步变化时更新。
- **交接核对：** spec 的范围外说明仍然准确：
  - 渲染、坐标换算、纹理过滤与查看器归 P2-11；
  - 视觉保真判定归 P2-12；
  - 光照与玩法语义归 P3；
  - `cockpit-hud-map` 归 P2-07。
- **只核对，不实现：** 本子任务不新增功能代码。发现缺口时，按 execute-goal 的补救流程新增子任务。11、12、14 若为 blocked，本子任务不能完成，等待其恢复条件满足（14 由执行期修订加入，见 goal 执行记录）。

## 不包含

- 新功能、P2-07 的组装、P2-11 的页面接线与 P2 阶段退出评审（P2-13）。

## 关键文件与契约

- [spec](../spec.md)、[goal](../goal.md) 及 01–12 的完成证据。
- `src/content/models/`、`src/original-data/formats/` 的 MESH/MODL 读取、`src/original-data/conversion/` 的模型与贴图模块、[source-error.ts](../../../../../src/original-data/source-error.ts)、[payloads.ts](../../../../../src/original-data/payloads.ts)、`src/workers/`、[import-job-owner.ts](../../../../../src/app/import/import-job-owner.ts)、[nob-check.ts](../../../../../tools/nob-check.ts)、`e2e/import-worker.spec.ts`。
- [源码结构](../../../../engineering/source-structure.md)、[工程约定](../../../../engineering/README.md)、[工具指南](../../../../guides/tools.md)、[阶段索引](../../tasks.md)。

## 验收标准

- [ ] S-01 至 S-13、AC-01 至 AC-17 都有对应的实现与验证证据；AC-11 至 AC-14 的本地证据只含命令、地址、计数与判定。
- [ ] 上列不变量全部成立，或已有补救子任务。
- [ ] `pnpm check`、全部 E2E、`pnpm check:original` 与文档检查通过；`node tools/task-state.ts p2/06` 的状态与 tracker 一致。
- [ ] 依赖清单与锁文件不变；提交中没有原版内容或 `local/` 输出。

## 验证方法

- 逐项审阅与命令输出；必要时请独立审阅者复核覆盖表。
- 浏览器部分按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md) 的规则复跑。
- 不适用新的原版对照；沿用 09–12 的本地证据。

## 完成证据
