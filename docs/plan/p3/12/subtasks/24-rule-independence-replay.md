---
type: plan
status: active
phase: P3
task: "12"
subtask: "24"
updated: 2026-10-15
---

# 24 — 规则独立与批次分组不变

**契约来源：** [spec](../spec.md) 的 AC-17；[验证策略](../spec.md#验证策略)。
**依赖：** 13, 14, 23。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 用 `ControlledHost` 驱动正式 Runtime 与 Session，保持逐 tick 输入相同而改变帧分组（1 tick/帧、5 tick/帧、插入 0 tick 帧），分别在无表现消费者、有表现模块与渲染逻辑（记录表面）、不绘制、模拟上下文丢失与已处理设备不可用下运行，断言相同 tick 的事件、检查点与状态哈希一致。
- 有表现的运行在同一注入表现种子下，选择与派生状态不因批次分组而改变。
- 契约异常另测故障前缀与停止，不宣称故障后继续完成。
- 代码边界审阅：表现代码不提交命令、不设置意图、不调用 Core。

## 不包含

- 新功能（交回相应子任务）。

## 关键文件与契约

- 现有：[game-session-replay.test.ts](../../../../../src/app/session/game-session-replay.test.ts)、[game-session.test-support.ts](../../../../../src/app/session/game-session.test-support.ts)。
- 计划新增：`src/app/session/game-session-presentation.test.ts`。

## 写入范围

- `src/app/session/game-session-presentation.test.ts`：集成测试。
- `src/app/session/game-session.test-support.ts`：必要的测试辅助。

## 验收标准

- [ ] AC-17：各组合下事件、检查点与哈希一致；表现派生状态不因分组改变；故障前缀另测。
- [ ] `pnpm exec vitest run src/app/session` 通过。

## 验证方法

- Node Runtime/Session 集成与 replay 测试；代码审阅结论写入完成证据。

## 完成证据
