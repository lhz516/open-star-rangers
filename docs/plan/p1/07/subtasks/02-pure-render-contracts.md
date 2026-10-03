---
type: plan
status: active
phase: P1
task: "07"
subtask: "02"
updated: 2026-10-02
---

# 02 — 纯渲染契约、插值与视口布局

**契约来源：** [spec](../spec.md) 的 S-02、S-03、S-05、AC-03、AC-06、AC-07。
**依赖：** 01。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 在 `src/render/` 新增 DOM-free 的 RenderFrame 校验、实体位置插值、固定相机契约和 4:3 viewport 纯计算。
- 原子验证 alpha、tick、正安全整数 ID、严格排序/重复、kind、有限坐标、previous/current 冲突与 run 内 kind 历史；失败不改变已接受场景。
- 实现 `M`、DPR、零/无效尺寸和黑边矩形的明确约束，保留不持有 Core 权威事实的边界。

## 不包含

- 不创建 WebGLRenderer、DOM 观察器、React 或 owner 接线（03–06）。
- 不改变 Core Render State 或 Runtime/Session 类型。

## 关键文件与契约

- 计划新增 `src/render/synthetic/render-frame.ts`、`src/render/viewport/viewport-layout.ts` 及邻接测试（实际拆分可遵循同一职责）。
- 复用 [SyntheticRenderState](../../../../../src/core/synthetic/synthetic-scene.ts) 和 [RenderFrame](../../../../../src/app/runtime/synthetic-runtime.ts)。

## 验收标准

- [ ] AC-03 的插值、出现/移除语义和全部违约输入原子失败成立。
- [ ] AC-06 的相机固定、投影范围和最小画面包围框成立。
- [ ] AC-07 的参数表、非法 M `RangeError`、布局不等式和居中黑边成立。
- [ ] 相关 DOM-free `.test.ts` 传递进入无 DOM lib 的 Node 类型检查。

## 验证方法

- Vitest 参数化测试使用合成 seed 0、真实 Three.js Scene/Camera/Geometry；测试 alpha 0/0.25/0.5/0.75、ID/kind/tick/坐标违约及 320×240 最小画面。
- 不需要 browser-testing；浏览器布局接线由 04/08 验证。

## 完成证据
