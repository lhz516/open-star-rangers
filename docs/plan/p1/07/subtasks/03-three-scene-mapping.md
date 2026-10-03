---
type: plan
status: active
phase: P1
task: "07"
subtask: "03"
updated: 2026-10-02
---

# 03 — Three.js 合成场景与实体映射

**契约来源：** [spec](../spec.md) 的 S-02–S-04、AC-02–AC-04、AC-13、AC-16。
**依赖：** 02。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 用实体 ID 与运行身份维护 Mesh 映射；按 mover/marker kind 共享几何与材质，使用自建纯色几何，实体集合以 current 为准。
- 把已验证的 RenderFrame 位置按 alpha 写入对象；接线、帧通知、空帧/运行结束和布局/恢复触发通过显式调用绘制，不自建调度循环。
- 提供只读渲染状态与诊断快照，绘制错误进入 failed 且不向 Session 抛出。

## 不包含

- 不创建真实 Canvas/ResizeObserver/DPR media query 或 React（04–06）。
- 不改变 Core 事件、projection、replay 或输入。

## 关键文件与契约

- 计划新增 `src/render/synthetic/` 下场景映射/纯色资源与 `.test.ts`。
- 复用 [SyntheticRunBinding](../../../../../src/ui/game/synthetic-session-bridge.ts) 的 `isCurrent`/`own`，以及 [Runtime RenderFrame](../../../../../src/app/runtime/synthetic-runtime.ts)。

## 验收标准

- [ ] AC-02 的对象集合、共享资源、add/remove、restart 身份隔离成立。
- [ ] AC-03/04 的帧绘制和不自调度成立。
- [ ] AC-11 的绘制异常隔离与 dispose 仍可完成成立。
- [ ] Node 下 renderer 状态只在状态转换通知，绘制不引起 React 状态更新。

## 验证方法

- 使用 ControlledHost、真实 Core/Session 和绘制端口替身记录对象实例、draw 次数、资源释放顺序与 Session request/cancel 序列。
- 运行目标 Vitest；不把 Canvas 存在或单纯 HTTP 200 当渲染证据。

## 完成证据
