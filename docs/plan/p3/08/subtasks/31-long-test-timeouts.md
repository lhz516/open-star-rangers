---
type: plan
status: active
phase: P3
task: "08"
subtask: "31"
updated: 2026-10-15
---

# 31 — 长测试的时限

**契约来源：** [工程约定](../../../../engineering/README.md)的测试规则；本 goal 的[执行记录](../goal.md#执行记录)中 21 的集成记录。
**依赖：** —
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 随世界状态的增长，少数长测试（快照全字段变化、快照文本预算、640×480 图像 payload 往返、任务场景）在主机负载高时超过 Vitest 的 5 秒默认时限，使 `pnpm check` 偶发失败；单独运行时它们在 3–5 秒内通过。
- 只给这些测试显式的单项时限（例如 30 秒），不改测试内容、断言或全局配置；若某项测试的耗时在 P3-08 中显著增长，记录原因（例如快照尾部字段）而不是削减覆盖。
- 在高负载下重复运行（例如 `pnpm test` 两次）确认不再因时限失败。

## 不包含

- 改变被测行为或缩小测试覆盖；修改 `vitest.config` 的全局时限。

## 关键文件与契约

- 已有：[snapshot.test.ts](../../../../../src/core/replay/snapshot.test.ts)、[budget.test.ts](../../../../../src/core/replay/budget.test.ts)、[image-payload.test.ts](../../../../../src/content/graphics/image-payload.test.ts)、[mission-scenarios.test.ts](../../../../../src/workers/mission-scenarios.test.ts)。

## 写入范围

- `src/core/replay/snapshot.test.ts`：单项时限。
- `src/core/replay/budget.test.ts`：单项时限。
- `src/content/graphics/image-payload.test.ts`：单项时限。
- `src/workers/mission-scenarios.test.ts`：单项时限。

## 验收标准

- [ ] 上列长测试有显式时限，测试内容不变。
- [ ] `pnpm check` 通过；高负载下重复运行不再因 5 秒时限失败。

## 验证方法

- `pnpm check`；git 审阅确认只改时限参数。

## 完成证据
