---
type: plan
status: active
phase: P1
task: "08"
subtask: "07"
updated: 2026-10-02
---

# 07 — 初始化/启动失败的恢复说明（修复）

**契约来源：** [spec](../spec.md) 行为表“选择 Start synthetic demo”行的失败反馈（owner 初始化失败或 start 同步失败时显示原始错误及返回菜单的处置方式，不重试），AC-10 的文案部分。
**依赖：** 04。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 来源

[05](./05-docs-isolation-checks.md) 审阅 AC-10 时发现：初始化失败或 start 同步失败时，开发面板只显示原始错误，没有说明“返回菜单”的处置方式。

## 工作范围

- 开发面板错误区在 `actionError` 为 `initialize` 或 `start` 时，追加一句恢复说明：返回菜单离开本次演示；再次启动会创建新会话，除非清理失败已阻断。不自动重试，不改变派发、订阅或其他行为。

## 不包含

- 任何生命周期、页面流转或会话行为变化。

## 关键文件与契约

- [SyntheticDevPanel.tsx](../../../../../src/ui/dev/SyntheticDevPanel.tsx) 的 `ErrorView`。

## 验收标准

- [x] initialize/start 的 actionError 旁显示返回菜单的恢复说明，原始错误仍显示；其他 actionError 不显示该说明。
- [x] `pnpm check` 通过。

## 验证方法

- 代码审阅（此类失败无生产注入入口）；`pnpm check`。

## 完成证据

- **实现：** [SyntheticDevPanel.tsx](../../../../../src/ui/dev/SyntheticDevPanel.tsx) 的 `ErrorView` 在 `actionError.operation` 为 `initialize` 或 `start` 时，于原始错误之后显示 `recovery-advice`。内容：演示不会重试；返回菜单离开本次演示；再次启动会创建新会话，除非清理失败已阻断。其他 operation 不显示该说明。锁存时该说明与外壳的刷新提示一致。
- **验证：** 代码审阅（无生产注入入口，属 spec 技术决定 11 的审阅证据）；`pnpm check`：43 个文件 1094 passed，构建成功。
- **Rubber-duck：** 未发现问题（只对 initialize/start 显示、保留原始错误、锁存时仍准确、`role=alert` 内无可访问性问题）。
- **Simplify：** 效率与简化无发现。未采纳与渲染 failed 文案共享文字（失败情形不同）；未采纳移到演示画面（画面需改为订阅 store，面板已把清理建议放在错误旁，与本处一致）。
- **文档影响：** 无需更新；工程约定不记录面板逐条文案。

