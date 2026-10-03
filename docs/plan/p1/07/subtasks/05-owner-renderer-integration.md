---
type: plan
status: active
phase: P1
task: "07"
subtask: "05"
updated: 2026-10-02
---

# 05 — Owner 与渲染消费者接线

**契约来源：** [spec](../spec.md) 的 S-04、S-06、S-07、AC-02、AC-04、AC-10–AC-14、AC-16。
**依赖：** 03, 04。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 扩展 app composition，使渲染端口及幂等 disposer 在 Session 创建前转交 owner；初始化失败和正常释放都尝试渲染清理。
- 把 renderer 作为逐运行 consumer 接入 P1-06 binding；attach 局部失败时本地逆序回滚并聚合错误，已转交 bridge 的 handle 变成 no-op。
- 保持渲染失败与 Session 错误隔离，重启/退出/旧 run 回调不污染新 run。

## 不包含

- 不实现 React 画面组件、菜单或恢复入口（06/P1-08）。
- 不修改 P1-06 bridge 的既有命令反馈语义，不创建全局 owner。

## 关键文件与契约

- [synthetic-demo-owner.ts](../../../../../src/app/composition/synthetic-demo-owner.ts)、[use-synthetic-demo-owner.ts](../../../../../src/app/composition/use-synthetic-demo-owner.ts)。
- [synthetic-session-bridge.ts](../../../../../src/ui/game/synthetic-session-bridge.ts) 的公开 consumer binding。
- 计划新增渲染 owner adapter 与相关 `.test.ts`。

## 验收标准

- [ ] AC-02/04 的运行接线、唯一调度和 run 身份隔离成立。
- [ ] AC-10/11/14 的初始化/attach/清理失败显式反馈且资源继续释放成立。
- [ ] AC-16 的接入不改变 replay、事件流或状态哈希成立。

## 验证方法

- Node 使用真实 Session、ControlledHost 和注入失败的表面/consumer 替身，断言 AggregateError 内容、释放顺序、幂等 dispose 与迟到回调。
- 对 owner 组合测试运行 `pnpm exec vitest run src/app/composition src/app/session src/app/runtime src/core/synthetic`。

## 完成证据
