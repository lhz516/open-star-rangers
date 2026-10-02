---
type: plan
status: active
phase: P1
task: "04"
subtask: "01"
updated: 2026-10-02
---

# 01 — Runtime 错误数据契约

**契约来源：** [spec](../spec.md) 的 S-07、S-08、AC-09（异常数据）、AC-13，以及“数据模型与契约”中的 `GameRuntimeError`。
**依赖：** 无。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 新增 app 层 `GameRuntimeError extends Error`。只读 `kind` 为 `invalid-argument`、`reentrant-call`、`listener-failed` 或 `faulted`，不能与 Core 的 `command-rejected` 混同。
- 输入错误带 `path`/`reason`，来自 Core 时保留原始 `cause`；监听器错误带冻结的 `readonly unknown[]`，保持顺序和原异常身份，不冻结调用者的异常对象；故障错误保留最初原因。
- 用有判别字段的构造参数表达各类必要字段，不依赖 `any` 或允许缺少必需数据的无约束参数集合。命名 Error 与消息模式参考已有 Core 错误，不能改动 Core 类型。
- 本项只实现可被时钟、总线和 Runtime 共用的错误数据，不加入日志、通知、宿主能力或失败恢复策略。

## 不包含

- 时间校验属于 02，监听器分发属于 03；场景校验路径重定位和故障状态转换属于 04/05。
- 不创建 Runtime 占位实现、Core 错误替代品或通用诊断框架。

## 关键文件与契约

- 计划新增 `src/app/runtime-errors.ts`、`src/app/runtime-errors.test.ts`；目前均不存在。
- [CoreInputError](../../../../../src/core/errors.ts)（已有，只读参考）：`path`、`reason` 与命名 Error；Core 错误须可作为 `cause` 原样保留。

## 验收标准

- [x] S-07：四种错误的名称、kind、必需字段和可定位消息准确；输入错误/故障错误的 cause 不丢失。
- [x] AC-09（数据部分）：异常数组为独立冻结副本，调用者修改原数组不能改变它；原异常对象不被冻结或替换，字符串等非 Error 值保留。
- [x] AC-13：类型负向用例拒绝构造不完整的错误数据；不使用 DOM、时钟或新依赖。
- [x] 目标测试和 `pnpm check` 通过，完成限定范围清理后复验。

## 验证方法

- `pnpm exec vitest run src/app/runtime-errors.test.ts`：分别构造四种错误，检查 Error 身份、字段、cause、数组隔离和冻结边界。
- 同文件的 `@ts-expect-error` 用例由现有 `pnpm typecheck` 检查；完整命令为 `pnpm check`。
- 按 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 清理本项两个新增文件及其 diff，不检查整个分支。
- 仅 Node 契约，无浏览器、实机、原版或外部操作。

## 完成证据

- 2026-10-02：目标 Vitest 7 项通过；清理后 `pnpm check` 通过（15 文件、427 项，typecheck/lint/build 成功）。编辑器测试工具未发现用例，改用仓库现有 Vitest 命令，无新增 runner。
- [实现](../../../../../src/app/runtime-errors.ts)、[测试](../../../../../src/app/runtime-errors.test.ts)：四种错误、原 cause、非 Error 值、冻结数组/未冻结异常、构造负向类型均覆盖。
- 先完成 rubber-duck 审阅，再做限定两文件的本地 simplify 检查（按四个角度自行检查，并非四路独立审阅）：改为穷尽 switch，消除不适用字段的运行时空槽，并补充类身份与故障消息断言。四路独立复核后来在 [07](./07-scoped-cleanup-verification.md#完成证据)补齐。未新增实例判别辅助 API（契约只要求构造数据完整）；空错误集合由 03 的分发条件负责，不在数据容器重复校验。
- 文档检查：engineering/guides 没有新命令、环境或用户流程需要更改；新增 API 的职责由本证据及源码表达。
