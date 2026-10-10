---
type: plan
status: active
phase: P1
task: "07"
subtask: "10"
updated: 2026-10-10
---

# 10 — 画面容器重挂载时重建 owner

**契约来源：** [spec](../spec.md) 技术决定 8、“行为与边界”中 React 卸载/StrictMode/HMR 的行，以及 AC-14（同一容器只有一个已连接画布，重建前先释放旧渲染器）、AC-15。
**依赖：** 05, 06。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 让 owner hook 依赖实际的画面容器元素（hook 自己的回调 ref 写入的元素状态），而不是稳定的 ref 对象：容器元素更换时先释放旧 owner（含渲染器与画布），再用新元素创建表面与新 owner；元素为空时不创建 owner。
- hook 返回 `{owner, containerRef}`，App 把 `containerRef` 交给画面组件；P1-06 的面板行为不变（owner 出现后显示）。

## 不包含

- 不改变 owner、渲染器或表面契约；不新增正式页面流转（P1-08）。

## 关键文件与契约

- [use-synthetic-demo-owner.ts](../../../../engineering/source-structure.md#r5-演示所有者与槽位)、[App.tsx](../../../../../src/app/App.tsx)。

## 验收标准

- [x] 容器元素更换（如 Fast Refresh 重挂载画面子树）后，新容器内恰好 1 个已连接画布，旧画布已断开，渲染器状态与诊断来自新 owner。
- [x] StrictMode 首次挂载仍只有 1 个已连接画布；元素为空时不创建 owner。
- [x] `pnpm check` 通过；浏览器复现原缺陷场景（结构性 Fast Refresh 编辑）后通过。

## 验证方法

- 真实 Chrome 自有 Vite：执行回合临时编辑 App 的子树结构并还原，用页面作用域探针记录画布；按 browser-testing 只观察。

## 完成证据

- **缺陷复现：** 修复前，执行回合临时给 App 的画面加 `Profiler` 包裹（结构性 Fast Refresh）后，React 重挂载画面子树并生成新容器，owner effect 只依赖稳定 ref 对象而未重跑：页面 0 个已连接画布，探针记录的 2 个画布均脱离文档，状态仍显示 ready。
- **修复：** [use-synthetic-demo-owner.ts](../../../../engineering/source-structure.md#r5-演示所有者与槽位) 以容器元素 state 为 effect 依赖并返回 `{owner, containerRef}`，元素为空时不创建 owner，清理时置空 owner 再 dispose；[App.tsx](../../../../../src/app/App.tsx) 只把 `containerRef` 交给画面。
- **浏览器（修复后最终代码，本机 Chrome 154 / macOS，自有 Vite，页面作用域探针）：** StrictMode 首次挂载只创建 1 个画布（首轮 effect 时容器尚未写入 state）；同一结构性 `Profiler` 编辑后旧画布断开且 `isContextLost()=true`，新容器内 1 个已连接画布，监听净值为一组（1 个 resolution 查询、1 个 ResizeObserver、4 个上下文监听）；Profiler 记录画面子树挂载阶段 mount + 2 次 nested-update，运行 2.2 s（265 次绘制）期间 0 次提交。回归子集（idle/start/add/暂停 draws 不变/布局公式/DPR 2/上下文丢失恢复/restart/exit 像素）与修复前结果一致，无错误。临时编辑全部还原，`cmp` 确认 App 与修复版本一致。
- **检查：** `pnpm check` 通过（41 个测试文件/1030 个测试、构建）。React 组件与 hook 无 Node 测试入口（`.tsx`/DOM 不进 Node 程序），以浏览器证据为准。
- **审阅：** rubber-duck 无发现；simplify 采纳“hook 自持容器回调 ref 并返回句柄”“清理直接置空 owner”，未采纳在回调 ref 中直接建 owner（会绕开 effect 清理顺序）。
- **文档影响：** [工程约定](../../../../engineering/README.md#ui-投影与指令反馈) 的 React 接线条目已改为 `{owner, containerRef}` 与容器重挂载语义。
