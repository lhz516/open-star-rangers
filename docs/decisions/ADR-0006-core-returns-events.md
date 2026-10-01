---
id: ADR-0006
type: adr
status: accepted
phase: P1
updated: 2026-09-30
related: []
---

# ADR-0006：Core 通过 step() 返回事件，Event Bus 归 Runtime

## 决定

- `GameCore.step(tickInput)` 返回 `DomainEvent[]`。Core 定义事件类型，但不知道 Event Bus 存在，也不接受 `emit` 回调。
- GameRuntime 持有命令队列与 Event Bus，在本帧模拟结束后统一发布事件。
- Core 内部用固定顺序的系统流水线传递本 tick 的事件，不使用发布/订阅。
- 持续性事实走状态投影，一次性反馈走事件。
- Core 使用可变世界与自带种子的随机数，禁止 `Math.random`、`Date.now`、`performance.now`。

细节见总计划 §4.2 与 §5。

## 后果

- 单元测试直接断言 `step()` 的返回值；replay 比对事件流与状态哈希。
