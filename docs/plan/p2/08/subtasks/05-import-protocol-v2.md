---
type: plan
status: active
phase: P2
task: "08"
subtask: "05"
updated: 2026-10-05
---

# 05 — 导入协议：音频阶段与顺序规则

**契约来源：** [spec](../spec.md) 的 S-07（协议、宿主与持有者部分）、S-10（DTO 部分）、S-12（本子任务部分），AC-07；[导入协议变化](../spec.md#导入协议变化)、[持久化与兼容](../spec.md#持久化与兼容)中的协议兼容、[技术决定](../spec.md#技术决定) 7、8。
**依赖：** 03、14。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **开始前核对（goal 前提六）：** 2026-10-05 的核对发现 P2-05、P2-09 已批准不同的错误层与身份机制，spec 已据此修订（见 [goal 执行记录](../goal.md#执行记录)），由 14 实施。开始前再次核对 [import-protocol.ts](../../../../../src/workers/import-protocol.ts)：若并行任务已先合入并递增版本，本任务在其值上递增，阶段集合按合入顺序追加；若出现新的契约冲突，本子任务记为 blocked。
  - **再次核对的结果（2026-10-05）：** P2-05 已合入 `main`：协议为版本 2，阶段为 `identify-source`、`convert-graphics`，`canReportStage` 统一了阶段顺序规则。本分支已以合并提交并入 `main`，spec 按执行期修订三在其上递增（见 [goal 执行记录](../goal.md#执行记录)）。
- **协议（`src/workers/import-protocol.ts`）：**
  - `IMPORT_PROTOCOL_VERSION` 递增为 3；
  - `IMPORT_STAGES` 改为 `identify-source`、`convert-graphics`、`convert-audio`，按此顺序；
  - 错误层集合与消息形状不变。
- **宿主（`src/workers/import-host.ts`）：**
  - `toErrorData` 不变：14 之后，SND 转换与音频预算的失败都是 `SourceError`，按既有规则转为 `source` 层 DTO；
  - 报告器拒绝作业的误用，以 `internal-error` 失败，与 P2-04 的做法一致：
    - `identified` 之前报告 `convert-audio` 进度、阶段回退：沿用 `canReportStage`；
    - 新增：发送第一个组之后再报告进度。
- **持有者（`src/app/import/import-job-owner.ts`）：** 以下顺序违规以 `protocol-error` 失败，位置沿用 `message.stage` 或 `message.type`：
  - `identified` 之前的 `convert-audio` 进度、阶段相对于上一条进度回退：沿用 `canReportStage`；
  - 新增：收到第一个 `group` 之后的任何进度。

  `readBytes` 不减少、不超过输入总字节的规则跨阶段继续适用。组结果的验证顺序与 `takeGroups()` 不变。
- **既有测试：** 按新契约更新 [import-protocol.test.ts](../../../../../src/workers/import-protocol.test.ts)、[import-host.test.ts](../../../../../src/workers/import-host.test.ts)、[import-job-owner.test.ts](../../../../../src/app/import/import-job-owner.test.ts) 与 [worker-port.test.ts](../../../../../src/platform/workers/worker-port.test.ts) 中涉及版本、阶段与错误层的断言。不放宽它们原有的拒绝用例。
- **文档：** 更新[源码结构指南](../../../../engineering/source-structure.md)的导入 Worker 一节：协议版本、阶段集合与新的顺序规则，并说明转换错误经 `source` 层传递。P2-04 已批准的 spec 作为历史记录保留，不修改。

## 不包含

- 作业中的音频阶段、包身份与发送前预校验（06）。
- 浏览器 Worker E2E 的音频场景（06）。

## 关键文件与契约

- **修改：** [import-protocol.ts](../../../../../src/workers/import-protocol.ts)、[import-host.ts](../../../../../src/workers/import-host.ts)、[import-job-owner.ts](../../../../../src/app/import/import-job-owner.ts)，以及上列测试。
- **复用：** 14 扩展后的 [source-error.ts](../../../../../src/original-data/source-error.ts)。宿主已导入 `original-data` 的错误类，`workers` 到达 `original-data` 为允许的边。
- **边界：** 协议模块仍只依赖 `content/`；app 与 platform 不经协议触及 `original-data`。依赖图回归保持通过。

## 验收标准

- [ ] AC-07（协议）：版本为 3；阶段集合按 spec，错误层集合不变；`budget-exceeded`（预算维度限值名与 `observed: null`）、`invalid-payload` 与 `unsupported-payload` 的 `source` DTO 通过读取；层未知、code 不合语法的 DTO 仍被拒绝。
- [ ] AC-07（顺序）：持有者以 `protocol-error` 拒绝三种违规：`identified` 之前的 `convert-audio` 进度、阶段回退（含 `convert-audio` 之后的 `convert-graphics` 进度）、`group` 之后的进度。合法序列 `identify-source` → `identified` → `convert-graphics` → `convert-audio` → `group` → `finished` 被接受。
- [ ] AC-07（版本）：旧版本的 `ready` 被新持有者以 `protocol-error` 拒绝，且不发送 `start`；新宿主拒绝旧版本的 `start`。
- [ ] AC-07（错误转换）：宿主把 SND 转换与音频预算的 `SourceError` 转为 `source` 层 DTO，其余字段等于 `toData()`，`limit` 的预算维度名、上限与观测值（含 null）完整保留；`DiscReadError`、`ContentContractError` 与未知异常的转换不变。宿主拒绝三种作业误用，报 `internal-error@job`。
- [ ] AC-07（回归）：P2-04、P2-05 的既有测试按新契约更新后全部通过。
- [ ] `pnpm exec vitest run src/workers src/app/import src/platform/workers tools/engineering-boundaries.test.ts`、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- 表驱动 Node 测试；宿主测试用 [import-host.test-support.ts](../../../../../src/workers/import-host.test-support.ts) 的 `FakeEndpoint`；持有者测试用假端口。
- 不适用浏览器或原版对照；真实 Worker 在 06 中验证。
- 完成前按 execute-goal 流程，以本子任务 diff 为范围做 rubber-duck 审查与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据
