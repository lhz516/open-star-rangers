---
type: plan
status: active
phase: P1
task: "08"
subtask: "08"
updated: 2026-10-02
---

# 08 — 演示访问次数耗尽的应用反馈（修复）

**契约来源：** [spec](../spec.md)“计划新增契约”中“页面流转输入”行：`demoVisit` 已到 `Number.MAX_SAFE_INTEGER` 时再进入须抛 `RangeError`，应用显式显示错误且不创建 owner；AC-02。
**依赖：** 01, 04。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 来源

[06](./06-final-browser-alignment.md) 第一轮核对发现：[App](../../../../../src/app/App.tsx) 在函数式状态更新中调用 `nextAppFlow`，耗尽时 `RangeError` 会从 React 更新中逃逸，没有应用级错误显示。

## 工作范围

- 激活 `Start synthetic demo` 时，先用当前页面流转状态同步校验 `open-demo`。若抛错，以 alert 显示原始错误，不改变页面状态、不进入演示、不创建 owner；否则照常经函数式更新提交（保持双击时每次激活至多一次转换）。
- 不改变页面流转纯逻辑与其他画面行为。

## 不包含

- 页面流转转换规则（01）与生命周期（03）。

## 关键文件与契约

- [App.tsx](../../../../../src/app/App.tsx)。

## 验收标准

- [x] 耗尽时显示含原始 `RangeError` 的 alert，页面停留在主菜单，不创建 owner；正常情况与双击行为不变。
- [x] `pnpm check` 通过。

## 验证方法

- 代码审阅（生产代码无法在浏览器中把 `demoVisit` 推到上限，也不增加注入入口）；纯转换抛错由 [01](./01-app-flow-state.md) 的 Node 测试证明；`pnpm check`。

## 完成证据

- **实现：** [App.tsx](../../../../../src/app/App.tsx) 的 `openDemo` 先以当前渲染状态同步调用 `nextAppFlow` 校验 `open-demo`：
  - 抛错时记录 `openFailure`，并在主菜单以 `role=alert` 显示原始错误（`describeError`）。不调用 `setFlow`，不进入演示，因此不挂载演示画面，也不创建 owner。
  - 校验通过时仍经函数式更新提交，双击时第二次更新在 demo 画面上不适用，每次激活至多一次转换。
  - 两个外壳 alert 共用 `FailureAlert` 组件。
- **验证：** 代码审阅（生产代码无法在浏览器中把 `demoVisit` 推到上限，也不增加注入入口）；纯转换的 `RangeError` 由 [01](./01-app-flow-state.md) 的 Node 测试证明；`pnpm check`：43 个文件 1094 passed，构建成功。
- **Rubber-duck：** 未发现问题（预检阻止转换、函数式更新保持双击语义、StrictMode 重复调用更新函数无副作用、锁存时 Start 仍禁用、焦点规则不变）。
- **Simplify：**
  - 已采纳：两个外壳 alert 合并为 `FailureAlert`，CSS 类改为 `.failure-alert`。
  - 未采纳：只计算一次转换并非函数式提交（会破坏双击时的单次转换保证）。
  - 未采纳：把反馈并入页面流转状态（spec 固定了其形状，耗尽在实际中不可达）。
- **文档影响：** [工程约定](../../../../engineering/README.md)“页面流转与演示生命周期”一节补充了进入前的同步校验与耗尽反馈。

