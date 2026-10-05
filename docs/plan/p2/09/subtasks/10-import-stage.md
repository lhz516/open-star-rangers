---
type: plan
status: active
phase: P2
task: "09"
subtask: "10"
updated: 2026-10-05
---

# 10 — 导入作业的 `convert-logic` 阶段

**契约来源：** [spec](../spec.md) 的 S-07（作业中统一写入身份）、S-09、S-11（错误经宿主与持有者到达）、AC-08（作业部分）、AC-10、AC-13（快照与诊断隐私）；技术决定 12。
**依赖：** 03, 09。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **开始前核对：** 确认 P2-05、P2-08 没有已落地的协议版本或阶段变化；若有，在其之上递增，并在证据中说明。
- **协议：** [import-protocol.ts](../../../../../src/workers/import-protocol.ts) 的 `IMPORT_STAGES` 追加 `convert-logic`，`IMPORT_PROTOCOL_VERSION` 递增；其余消息形状与规则不变。
- **阶段顺序：** 按 S-09，`convert-logic` 只在 `identified` 之后出现：
  - [import-host.ts](../../../../../src/workers/import-host.ts) 在识别之前收到 `convert-logic` 进度时报 `internal-error`（与既有的 `identify-source` 迟到规则对称）；
  - [import-job-owner.ts](../../../../../src/app/import/import-job-owner.ts) 在 `identified` 之前收到 `convert-logic` 进度时报 `protocol-error`；`readBytes` 的单调与上限规则不变。
- **生产作业：** [import-job.ts](../../../../../src/workers/import-job.ts) 在 `identified` 之后：
  - 发送 `convert-logic` 进度（阶段开始一次，之后每次端口读取完成一次），计量继续累计；
  - 调用 09 的 `convertLogic`，以 03 的函数对作业的全部组草稿推导同一 `ManifestIdentity` 并写入每个组清单，再逐组 `report.group`；
  - 返回值 `usage` 的语义沿用 P2-04（光盘句柄的计量），转换用量由 09 的测试断言。
- **测试注入点：** 与 `open` 一样，转换步骤只由测试替换（默认是生产转换）。更新受影响的测试支持与用例：
  - `syntheticGroupsJob` 改为只识别、不运行生产转换，保持 [import-worker.test-support.ts](../../../../../src/workers/import-worker.test-support.ts) 的 `synthetic` 场景只发送四个合成组；
  - [import-job.test.ts](../../../../../src/workers/import-job.test.ts) 与 [import-pipeline.test.ts](../../../../../src/app/import/import-pipeline.test.ts) 中“识别后无组结束”的用例，改为使用含合成 `SCENARIO.NOB`/`SR.NOB` 的白名单得到 `logic` 组，或注入空转换并说明理由；
  - 生产白名单拒绝合成光盘的用例保持不变。
- **文档：** 在[源码结构](../../../../engineering/source-structure.md#导入-worker)中更新协议版本、阶段集合、阶段顺序与转换注入点；在[工程约定](../../../../engineering/README.md)中更新相关测试说明。

## 不包含

- 页面、查看器与缓存接线（P2-11）；新的浏览器用例（技术决定 12）。
- 改变宿主的错误层映射、持有者的状态机或 `finished.usage` 的语义。

## 关键文件与契约

- **修改：** [import-protocol.ts](../../../../../src/workers/import-protocol.ts)、[import-host.ts](../../../../../src/workers/import-host.ts)、[import-job.ts](../../../../../src/workers/import-job.ts)、[import-job-owner.ts](../../../../../src/app/import/import-job-owner.ts) 及其测试；[synthetic-import.test-support.ts](../../../../../src/workers/synthetic-import.test-support.ts)；[import-pipeline.test.ts](../../../../../src/app/import/import-pipeline.test.ts)。
- **复用：** 03 的身份推导与写入；09 的 `convertLogic`；05 的合成封包 test-support；[import-host.test-support.ts](../../../../../src/workers/import-host.test-support.ts)。
- **浏览器回归：** [e2e/import-worker.spec.ts](../../../../../e2e/import-worker.spec.ts) 不新增用例，只重跑。

## 验收标准

- [ ] AC-10：以注入的合成白名单运行生产作业，消息依次为 `identify-source` 进度、`identified`、`convert-logic` 进度、`group logic`、`finished`（`groups` 为 `['logic']`）；递增后的协议版本两端一致，旧版本的 `ready` 被拒绝；app 持有者接受该组，`takeGroups()` 一次性移交。
- [ ] AC-10（失败）：转换失败时报 `failed`（`source` 或 `content` 层）且不发送组；预算超限到达持有者时为 `source` 层的 `limit-exceeded`，`limit` 的维度名、上限与观测值完整；识别之前的 `convert-logic` 进度在宿主与持有者都被拒绝。
- [ ] AC-08（作业部分）：作业中每个组的清单携带同一 `ManifestIdentity`。
- [ ] AC-13：快照、错误 DTO 与 console 不含文件名 `MARKER`、名称或坐标。
- [ ] P2-04 的既有 Node 测试通过；`pnpm test:e2e import-worker.spec.ts --project=development` 通过；`pnpm check` 通过。

## 验证方法

- Node 集成测试：真实宿主、`MessageChannel` 结构化克隆端口与 app 持有者，合成光盘与合成白名单。
- 浏览器回归按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md) 的合成数据规则重跑既有 Worker 用例，不新增浏览器验收。
- 完成前按 execute-goal 流程以本子任务 diff 为范围做 rubber-duck 审查与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据
