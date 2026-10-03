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

- 新增 [render-surface.ts](../../../../../src/render/scene/render-surface.ts)（DOM-free 绘制端口）、[synthetic-renderer.ts](../../../../../src/render/synthetic/synthetic-renderer.ts) 及 [synthetic-renderer.test.ts](../../../../../src/render/synthetic/synthetic-renderer.test.ts)；测试替身 [render-surface.test-support.ts](../../../../../src/render/scene/render-surface.test-support.ts) 不进入生产导入链。纯色资源已在 02 交付。
- 复用 [SyntheticRunBinding](../../../../../src/ui/game/synthetic-session-bridge.ts) 的 `isCurrent`/`own`，以及 [Runtime RenderFrame](../../../../../src/app/runtime/synthetic-runtime.ts)。

## 验收标准

- [x] AC-02 的对象集合、共享资源、add/remove、restart 身份隔离成立。
- [x] AC-03/04 的帧绘制和不自调度成立。
- [x] AC-11 的绘制异常隔离与 dispose 仍可完成成立。
- [x] Node 下 renderer 状态只在状态转换通知，绘制不引起 React 状态更新。

## 验证方法

- 使用 ControlledHost、真实 Core/Session 和绘制端口替身记录对象实例、draw 次数、资源释放顺序与 Session request/cancel 序列。
- 运行目标 Vitest；不把 Canvas 存在或单纯 HTTP 200 当渲染证据。

## 完成证据

- **接口：** `createSyntheticRenderer({surface, reportError})` 接管表面（连接失败时断开并释放表面后抛出），`{unavailable}` 产生仅报告原因的 unavailable 渲染器。`SyntheticRenderBinding` 只含 `run.{runId, renderFrame, onFrame, ownCleanup}`、`isCurrent`、`own`，P1-06 的 `SyntheticRunBinding` 在结构上满足它，渲染模块不导入 `ui/`。只读句柄提供 `getSnapshot`/`subscribe`/`diagnostics`。
- **AC-02：** 真实 Session（50 Hz）+ P1-06 bridge + 记录表面：50 轮 add/重复 add（拒绝）/remove/重复 remove（拒绝）中，每次绘制的对象 ID 与该帧 `current.entities` 一致；marker 在首次含有它的绘制中出现，位置等于 `marker-added` 事件；拒绝不改变集合；全部绘制只使用每 kind 同一份几何与材质，共享资源无释放事件，诊断 `entities=1`、GPU 统计 geometries 2/programs 2。restart 恰好新增 2 次绘制（空帧、tick 0），新 mover 对象与旧对象不是同一实例；重放旧运行帧监听不绘制；新运行可再次使用旧运行的 marker ID（校验历史按运行清空）。
- **AC-03（场景层）：** 10 种伪造帧（alpha、tick 跳变/倒退、ID 0、重复/降序、未知 kind、NaN 坐标、两份状态 kind 冲突、已移除 ID 重用）经渲染器自身帧监听交付：监听不抛错，状态 failed 且错误为 `SyntheticRenderFrameError`，最近绘制记录与对象身份、位置、父节点不变，Session 状态与错误出口不变，后续真实帧不再绘制。另测表面绘制失败时回滚到上一份成功场景（对象、位置、诊断不变）；移除回滚后该测试失败（反证）。
- **AC-04（Node）：** 首次布局 1、接线 1、帧通知（含 0 tick 与暂停静止帧）各 1、退出 1、布局变化 1（相同布局不重绘）、上下文恢复 1，暂停期间状态与可见性变化不绘制；接入与不接入渲染器时 `ControlledHost` 的请求数、取消序列与待处理句柄完全相同；以暂停开始的运行在接线时即绘制且无帧请求。源码调度检索由边界回归覆盖。
- **AC-11：** 第 N 次绘制抛错后状态 failed 并保留原错误、仅通知 1 次；之后帧、restart 与布局变化均不绘制；Session 仍 running、错误出口无记录、命令照常被 Core 接受；dispose 依次 disconnect/dispose。状态监听与错误出口同时抛错时 Session 仍健康（exit 后 idle、无 cleanupFailed）。
- **AC-12/13/14/15（Node 部分）：** context-lost 期间不绘制、tick 继续，恢复后用最近帧（含暂停时与布局变化后）绘制 1 次；释放顺序为 disconnect → 两种 kind 的几何与材质各一次 → surface dispose，重复 dispose 无作用，失败汇总为 AggregateError；释放后迟到的上下文/尺寸事件与运行收尾不绘制、不通知。状态句柄只在转换时通知（30+ 次绘制 0 次通知）。接线中途失败时逆序回滚、保留接线与回滚错误，已交给 `own` 的句柄成为 no-op。相机投影在极端布局/DPR 变化下保持同一矩阵。
- **检查：** `pnpm exec vitest run src/render tools/engineering-boundaries.test.ts` 370/370；`pnpm check` 通过（38 个测试文件/1010 个测试、构建）。
- **审阅：** rubber-duck 指出表面失败时场景已被改写、错误出口抛错可能逃入 Session、restart 绘制计数与释放测试覆盖不足，均已修复并补测；simplify 采纳拆出 unavailable 渲染器、运行持有帧、统一清理辅助、端口回调改为 void、测试收集简化；未采纳跨层共享清理栈（会改动 P1-06 基础设施）、合并 `directSetup`（需要渲染器自己的帧监听）与绘制快照对象池（每帧仅数个对象）。
- **文档影响：** [源码结构指南](../../../../engineering/source-structure.md#当前目录) 列入 `render/scene/` 与渲染器；工程约定中的渲染章节随 07 同步。
