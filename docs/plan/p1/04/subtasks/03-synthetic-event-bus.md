---
type: plan
status: active
phase: P1
task: "04"
subtask: "03"
updated: 2026-10-02
---

# 03 — 会话级类型化同步 Event Bus

**契约来源：** [spec](../spec.md) 的 S-04、S-07、S-08、AC-07、AC-08（订阅部分）、AC-09（分发部分）、AC-13，以及技术决定 6、7、13。
**依赖：** 01。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 实现只针对现有 `DomainEvent` 的会话级总线及只读 `EventDelivery = {commandId}`；Core 类型仍归 Core，不扩展事件字段。
- `on(type, listener)` 按判别类型收窄事件，`onAny(listener)` 订阅全部；回调返回类型为 `undefined`，不接受 async/Promise 返回值。未知类型和非函数监听器的 path 分别为 `on.type`、`on.listener`、`onAny.listener`。
- 每次订阅独立登记，同一函数可重复订阅；两类订阅共享注册顺序。取消函数幂等，取消立即影响当前尚未投递项；批次内新增订阅只参与下一次批次。
- 内部分发入口接收 Runtime 已收集的事件及关联元数据，按原顺序分发；不排序重造事实，不缓存历史，不把 Event Bus 放入 Core。无事件或无订阅者时不保留待投递历史。
- 同步异常隔离，继续全部投递，结束后抛 `listener-failed`，有序 errors 保留原异常身份。异步适配器自身的 Promise 失败不由总线接管。
- 分发入口仅供 app 内部 Runtime 使用；04 对外只转交订阅能力，消费者不能任意发布事件或推进模拟。

## 不包含

- 不分配命令 ID、不运行 tick、不读取 projection；帧末时机、重入 frame 和监听器提交命令由 04 验证。
- 不提供持久事件日志、异步分发、通用事件引擎或 React/Zustand 桥接。

## 关键文件与契约

- 计划新增 `src/app/synthetic-event-bus.ts`、`src/app/synthetic-event-bus.test.ts`；目前均不存在。
- `src/app/runtime-errors.ts`（01 计划交付）：非法订阅及监听器错误。
- [DomainEvent](../../../../../src/core/synthetic-scene.ts)（已有）：`marker-added`、`marker-removed`、`command-rejected`；用真实场景的 step 返回值准备合成事件。

## 验收标准

- [ ] AC-07：类型过滤、全量订阅和交错注册顺序准确；同一函数两份订阅分别投递、取消；delivery 冻结，事件值和身份不被改写。
- [ ] AC-07：未知类型/非函数拒绝且 path 准确；类型负向测试拒绝错用事件字段与 async/Promise 回调，正常同步无返回值回调通过。
- [ ] AC-08：取消当前事件中尚未调用的监听器立即生效；批次内新增监听器从下一批才生效；重复取消无副作用。
- [ ] AC-09：A 连续抛错、B 正常时仍各收到三事件；帧末语义对应的批次结束才抛汇总错误，支持非 Error 值，不重发、不回滚订阅变更。
- [ ] AC-13：独立实例隔离，无新依赖；目标测试、`pnpm check` 及清理后复验通过。

## 验证方法

- `pnpm exec vitest run src/app/synthetic-event-bus.test.ts`：以真实合成场景的 add/add/remove 结果记录调用顺序，检查空批次、无人订阅和晚订阅无历史。
- 多 tick 原顺序可用真实场景的连续 step 结果拼成内部批次测试；这不替代 04 对 Runtime 收集顺序的代码审阅，因为现有场景的命令只进入帧内首 tick。
- 回调类型的 `@ts-expect-error` 由 `pnpm typecheck` 执行；完整 `pnpm check`。
- 按 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 只清理本项两个新增文件；无浏览器、实机或原版要求。

## 完成证据
