---
type: plan
status: active
phase: P3
task: "12"
subtask: "15"
updated: 2026-10-15
---

# 15 — 飞行渲染器的生命周期、接线与失败分类

**契约来源：** [spec](../spec.md) 的 S-02、AC-02、AC-03；[渲染器生命周期](../spec.md#渲染器生命周期)、[行为与边界](../spec.md#行为与边界)。
**依赖：** 11, 12。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 计划新增 `src/render/flight/renderer/`：飞行渲染器的创建与释放、状态（`ready`、`context-lost`、`failed`、`unavailable`、`disposed`）与诊断（已绘制帧数、最后绘制的 tick、GPU 计数）。
- 经任务所有者登记表现模块与渲染器（阶段按 P3-04 的规则），每个运行经 `attachRun` 连接、经 `run.ownCleanup` 释放；表现模块在 tick 0、首帧前接线。每个 owner 至多一个画布与 WebGL 上下文，挂在 `mission-view`。
- 运行内 GPU 缓存（几何、材质、纹理、渲染目标）按 owner、代际与完整 `ContentIdentity` 绑定；迟到的异步结果经检查后只释放；每个取得步骤都有对应释放，失败按 `RollbackError`/`AggregateError` 与清理锁存报告。
- 失败分类：上下文丢失停止 GPU 提交并提示，恢复时只重建 GPU 映射；已识别的 WebGL 2 不可用以图形状态通知 UI，会话继续；内容、契约、预算与释放错误阻断开始或使会话故障。
- 任务画面的飞行区域显示画面不可用、上下文丢失与“驾驶舱/HUD 待 P3-13”的在制提示；生产构建不暴露诊断元素。
- 需要多遍绘制或后处理时增量扩展 `RenderSurface`，查看器行为与测试不变。
- 测试：记录表面上的接线、释放、回滚、迟到结果、重试的暖态计数、各失败分类与 limit/limit+1。

## 不包含

- 场景、相机与各绘制模块（16 至 23）。
- 浏览器回归（25）。

## 关键文件与契约

- 现有：[render-surface.ts](../../../../../src/render/scene/render-surface.ts)、[cleanup.ts](../../../../../src/render/scene/cleanup.ts)、[viewport-layout.ts](../../../../../src/render/viewport/viewport-layout.ts)、[browser-webgl-surface.ts](../../../../../src/render/webgl/browser-webgl-surface.ts)、[mission-owner.ts](../../../../../src/app/mission/mission-owner.ts)、[mission-slot.ts](../../../../../src/app/composition/mission-slot.ts)、[MissionShell.tsx](../../../../../src/ui/mission/MissionShell.tsx)、[viewer-renderer.ts](../../../../../src/render/viewer/viewer-renderer.ts)（参考）。
- 计划新增：`src/render/flight/renderer/`。

## 写入范围

- `src/render/flight/renderer/**`：渲染器、状态、诊断、缓存与测试。
- `src/render/scene/**`：`RenderSurface` 的增量扩展。
- `src/render/webgl/**`：浏览器表面的增量扩展。
- `src/app/mission/**`：消费者登记。
- `src/app/composition/**`：应用槽位接线。
- `src/app/MissionScreen.tsx`：画面容器。
- `src/app/browser-ports.ts`、`src/app/ports.ts`：表面端口。
- `src/ui/mission/**`：飞行区域与提示。
- `src/ui/dev/**`：开发诊断。
- `src/app/app.css`：飞行区域样式。

## 验收标准

- [ ] AC-02：每个 owner 至多一个画布；退出后本运行资源为零；重试暖态计数相等；包代际变化、迟到结果、部分初始化失败与释放失败都有断言。
- [ ] AC-03：三类失败按行为表处理，没有生产静默降级；上下文恢复不重抽、不重播。
- [ ] 查看器测试不变地通过；`pnpm exec vitest run src/render src/app/mission src/ui` 通过。

## 验证方法

- Node 测试（记录表面）；浏览器部分由 25 验证。

## 完成证据
