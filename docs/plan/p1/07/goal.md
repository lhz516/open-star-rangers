---
type: plan
status: accepted
phase: P1
task: "07"
updated: 2026-10-02
---

# P1-07：Three.js 合成渲染 — Goal

## 目标与来源

实现已批准的 [spec](./spec.md) 中的 S-01–S-09 与 AC-01–AC-17：建立由 Session 帧通知驱动的 Three.js 合成渲染消费者，完成 4:3 固定比例、插值、DPR/尺寸变化、错误隔离、上下文恢复、资源释放和 React 诊断，不改变 Core、Runtime、Session 契约。

## 代码现状与前提

- [SyntheticRenderState](../../../../src/core/synthetic/synthetic-scene.ts)、[RenderFrame](../../../../src/app/runtime/synthetic-runtime.ts) 和 [SyntheticSession](../../../../src/app/session/synthetic-session.ts) 已提供实体、双帧插值输入和唯一调度。
- [P1-06 bridge](../../../../src/ui/game/synthetic-session-bridge.ts) 与 [demo owner](../../../../src/app/composition/synthetic-demo-owner.ts) 已提供 consumer 接线和统一释放基础，需要扩展渲染资源所有权与初始化回滚。
- 本任务新增 `src/render/` DOM-free 合同、视口、Three.js 场景、浏览器表面，以及 `src/ui/render/` React 画面模块。
- 依赖前提是 P1-05、P1-06 已完成；实现时加入 `three`/`@types/three` 并同步 [package.json](../../../../package.json) 与 [pnpm-lock.yaml](../../../../pnpm-lock.yaml)。不新增 R3F、WebGPU、addons、Worker、OffscreenCanvas、jsdom 或 canvas 模拟。
- 不产生原版研究结论；合成几何、相机、颜色和 DPR 上限均遵循本 spec。

## 验收覆盖

| Spec 范围项/验收项 | 实现子任务 | 验证子任务及方法 |
|---|---|---|
| S-01 | 01 | 07、08：依赖与边界回归 |
| S-02 | 02、03 | 07：场景映射测试 |
| S-03 | 02、03 | 07：插值和原子验证测试 |
| S-04 | 03、04、05 | 07、08：调度计数和浏览器 draws |
| S-05 | 02、04 | 07、08：布局/相机与 Chromium 尺寸证据 |
| S-06 | 04、05 | 07、08：故障替身和 context-loss 证据 |
| S-07 | 04、05 | 07、08：GPU、释放和生命周期证据 |
| S-08 | 06 | 07、08：状态、无障碍和订阅证据 |
| S-09 | 01 | 07、08：模块边界、依赖和文档审阅 |
| AC-01 | 01 | 07：依赖、许可证和边界回归 |
| AC-02 | 03、05 | 07、08：实体映射和 restart identity |
| AC-03 | 02、03 | 07：插值和无效帧原子拒绝 |
| AC-04 | 03、04、05 | 07、08：唯一调度、暂停 draws 和源码检查 |
| AC-05 | 06 | 08：真实 Chromium 画面流程和像素采样 |
| AC-06 | 02 | 07：相机参数化测试 |
| AC-07 | 02 | 07：viewport 参数化测试 |
| AC-08 | 04、06 | 08：容器尺寸、黑边和截图采样 |
| AC-09 | 04 | 08：DPR 变化和 canvas buffer |
| AC-10 | 04、05、06 | 07、08：WebGL unavailable 与状态反馈 |
| AC-11 | 03、05 | 07：绘制错误隔离和 Session 继续运行 |
| AC-12 | 04、05、06 | 08：真实 WEBGL_lose_context 与 restore |
| AC-13 | 04、05 | 07、08：GPU 统计与资源释放 |
| AC-14 | 04、05、06 | 08：StrictMode/Fast Refresh 生命周期 |
| AC-15 | 06 | 07、08：可访问性、订阅和 React 提交计数 |
| AC-16 | 03、05 | 07：replay 不变性与状态哈希 |
| AC-17 | 01、02 | 07：DOM-free Node 类型检查 |

## 子任务跟踪

状态只在此维护：`pending` / `in-progress` / `blocked` / `completed`。依赖项全部 completed 后才能开始；验收结果和证据写在相应 subtask 文档。

| 子任务 | 依赖 | 状态 |
|---|---|---|
| [01-dependency-boundaries.md](./subtasks/01-dependency-boundaries.md) | — | pending |
| [02-pure-render-contracts.md](./subtasks/02-pure-render-contracts.md) | 01 | pending |
| [03-three-scene-mapping.md](./subtasks/03-three-scene-mapping.md) | 02 | pending |
| [04-browser-surface-lifecycle.md](./subtasks/04-browser-surface-lifecycle.md) | 02, 03 | pending |
| [05-owner-renderer-integration.md](./subtasks/05-owner-renderer-integration.md) | 03, 04 | pending |
| [06-react-render-diagnostics.md](./subtasks/06-react-render-diagnostics.md) | 05 | pending |
| [07-node-regression-evidence.md](./subtasks/07-node-regression-evidence.md) | 01, 02, 03, 04, 05, 06 | pending |
| [08-final-browser-alignment.md](./subtasks/08-final-browser-alignment.md) | 01, 02, 03, 04, 05, 06, 07 | pending |

最后一行始终为最终对齐验证，依赖所有其他子任务。浏览器能力受限时按 spec 记录 blocked，不以合成替代真实 WebGL 证据。

## 执行记录

## 审批

用户于 2026-10-02 明确批准本 goal，批准范围为当前 8 个子任务、依赖关系及 S-01–S-09、AC-01–AC-17 覆盖。此批准不代表实现完成。
