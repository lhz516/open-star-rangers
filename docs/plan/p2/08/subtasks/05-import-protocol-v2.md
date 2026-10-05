---
type: plan
status: active
phase: P2
task: "08"
subtask: "05"
updated: 2026-10-05
---

# 05 — 导入协议 v2：音频阶段、`conversion` 错误层与顺序规则

**契约来源：** [spec](../spec.md) 的 S-07（协议、宿主与持有者部分）、S-10（DTO 部分）、S-12（本子任务部分），AC-07；[导入协议变化](../spec.md#导入协议变化)、[持久化与兼容](../spec.md#持久化与兼容)中的协议兼容、[技术决定](../spec.md#技术决定) 7、8。
**依赖：** 03。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **开始前核对（goal 前提六）：** 核对 [import-protocol.ts](../../../../../src/workers/import-protocol.ts) 的 `IMPORT_PROTOCOL_VERSION` 仍为 1，且没有其他已批准的契约改动错误层或阶段集合。若已被并行任务改动，本子任务记为 blocked，按 spec 修订并重新批准后再继续。
- **协议（`src/workers/import-protocol.ts`）：**
  - `IMPORT_PROTOCOL_VERSION` 改为 2；
  - `IMPORT_STAGES` 改为 `identify-source`、`convert-audio`，按此顺序；
  - `IMPORT_ERROR_LAYERS` 增加 `conversion`，其 code 与 `disc`、`source` 一样只按 token 语法核对，`limit` 形状不变；
  - 消息形状不变。
- **宿主（`src/workers/import-host.ts`）：**
  - `toErrorData` 把 03 的 `ConversionError` 转为 `{ layer: 'conversion', ...toData() }`，其他层的转换不变；
  - 报告器拒绝作业的误用，以 `internal-error` 失败，与 P2-04 的做法一致：
    - `identified` 之前报告 `convert-audio` 进度；
    - 阶段回退；
    - 发送第一个组之后再报告进度。
- **持有者（`src/app/import/import-job-owner.ts`）：** 增加三条顺序检查，违反时以 `protocol-error` 失败，位置沿用 `message.stage` 或 `message.type`：
  - `identified` 之前的 `convert-audio` 进度；
  - 阶段相对于上一条进度回退；
  - 收到第一个 `group` 之后的任何进度。

  `readBytes` 不减少、不超过输入总字节的规则跨阶段继续适用。组结果的验证顺序与 `takeGroups()` 不变。
- **既有测试：** 按新契约更新 [import-protocol.test.ts](../../../../../src/workers/import-protocol.test.ts)、[import-host.test.ts](../../../../../src/workers/import-host.test.ts)、[import-job-owner.test.ts](../../../../../src/app/import/import-job-owner.test.ts) 与 [worker-port.test.ts](../../../../../src/platform/workers/worker-port.test.ts) 中涉及版本、阶段与错误层的断言。不放宽它们原有的拒绝用例。
- **文档：** 更新[源码结构指南](../../../../engineering/source-structure.md)的导入 Worker 一节：版本 2、阶段集合、`conversion` 层与新的顺序规则。P2-04 已批准的 spec 作为历史记录保留，不修改。

## 不包含

- 作业中的音频阶段、包身份与发送前预校验（06）。
- 浏览器 Worker E2E 的音频场景（06）。

## 关键文件与契约

- **修改：** [import-protocol.ts](../../../../../src/workers/import-protocol.ts)、[import-host.ts](../../../../../src/workers/import-host.ts)、[import-job-owner.ts](../../../../../src/app/import/import-job-owner.ts)，以及上列测试。
- **复用：** 03 的 `src/original-data/conversion/conversion-error.ts`。宿主已导入 `original-data` 的错误类，`workers` 到达 `original-data` 为允许的边。
- **边界：** 协议模块仍只依赖 `content/`；app 与 platform 不经协议触及 `original-data`。依赖图回归保持通过。

## 验收标准

- [ ] AC-07（协议）：版本为 2；阶段集合与错误层按 spec；`conversion` 层的合法 DTO 通过读取；层未知、code 不合语法的 DTO 被拒绝。03 定义的全部 `conversion` code 都合 DTO 语法。
- [ ] AC-07（顺序）：持有者以 `protocol-error` 拒绝三种违规：`identified` 之前的 `convert-audio` 进度、阶段回退、`group` 之后的进度。合法序列 `identify-source` → `identified` → `convert-audio` → `group` → `finished` 被接受。
- [ ] AC-07（版本）：版本 1 的 `ready` 被版本 2 的持有者以 `protocol-error` 拒绝，且不发送 `start`；版本 2 的宿主拒绝版本 1 的 `start`。
- [ ] AC-07（错误转换）：宿主把 `ConversionError` 转为对应 DTO，其余字段等于 `toData()`；`DiscReadError`、`SourceError`、`ContentContractError` 与未知异常的转换不变。宿主拒绝三种作业误用，报 `internal-error@job`。
- [ ] AC-07（回归）：P2-04 的既有测试按新契约更新后全部通过。
- [ ] `pnpm exec vitest run src/workers src/app/import src/platform/workers tools/engineering-boundaries.test.ts`、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- 表驱动 Node 测试；宿主测试用 [import-host.test-support.ts](../../../../../src/workers/import-host.test-support.ts) 的 `FakeEndpoint`；持有者测试用假端口。
- 不适用浏览器或原版对照；真实 Worker 在 06 中验证。
- 完成前按 execute-goal 流程，以本子任务 diff 为范围做 rubber-duck 审查与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据
