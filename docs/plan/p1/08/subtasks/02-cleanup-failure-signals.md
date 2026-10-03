---
type: plan
status: active
phase: P1
task: "08"
subtask: "02"
updated: 2026-10-02
---

# 02 — 清理失败信号与 owner 失败记录

**契约来源：** [spec](../spec.md) 的 S-05、AC-09、AC-14，“计划新增契约”中的 owner 清理失败记录与“owner 创建前与渲染器创建回滚”，技术决定 6，涉及模块中 `render/` 的窄扩展。
**依赖：** 无。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 为渲染层的初始化回滚提供结构化清理失败信号，使调用方无需按错误消息或 `AggregateError` 类型猜测：覆盖 `createSyntheticRenderer` 的 connect 失败后 disconnect/dispose 失败、`createBrowserWebGLSurface` 转交前的回滚失败，以及渲染器 `attach()` 的本地回滚失败。原始业务原因与回滚错误都保留；回滚成功时行为与 P1-07 完全相同（connect 失败仍降级为 unavailable，表面创建失败仍为无画面演示）。
- `SyntheticDemoOwner` 新增只读查询，返回 `Readonly<{cause:unknown}> | null`：以下任一情况保留首个包含清理原因的原始错误——初始化回滚失败（含渲染器创建回滚失败、运行消费者接线回滚失败）、该 owner 的会话状态曾报告 `cleanupFailed`、`dispose()` 失败。记录一旦设置不再清除、不被后续错误覆盖，`dispose()` 后仍可读取。
- 无清理失败的初始化失败、Core faulted、渲染 failed 或 unavailable 不设置记录；业务异常本身是 `AggregateError` 但回滚成功时不误锁存。
- 所有独立清理仍全部尝试；`dispose()` 失败照常写 `actionError` 并抛出，记录不吞错。
- 扩展 owner 与渲染器的 Node 测试覆盖 AC-09 (a)–(e) 及上述三条回滚路径。

## 不包含

- 把失败交付给页面流转、阻断新 owner 与一次性 start（03）。
- 浏览器表面工厂产生信号的浏览器端复现：生产代码无注入入口，以代码审阅为证（05 记录）。
- 渲染状态机、绘制、调度、释放顺序或 Session 契约的任何变化。

## 关键文件与契约

- [synthetic-demo-owner.ts](../../../../../src/app/composition/synthetic-demo-owner.ts)：新增失败记录查询；渲染器创建失败分支区分“回滚成功的不可用”与“回滚失败”；订阅会话状态中的 `cleanupFailed`。
- [synthetic-renderer.ts](../../../../../src/render/synthetic/synthetic-renderer.ts) 的 `createSyntheticRenderer` 与 `attach()`；[browser-webgl-surface.ts](../../../../../src/render/webgl/browser-webgl-surface.ts) 的创建回滚；必要时在 [cleanup.ts](../../../../../src/render/scene/cleanup.ts) 中放置共享的结构化失败类型（名称由实现决定，不建立全局 utils）。
- 测试：[synthetic-demo-owner.test.ts](../../../../../src/app/composition/synthetic-demo-owner.test.ts)、[synthetic-renderer.test.ts](../../../../../src/render/synthetic/synthetic-renderer.test.ts)，复用 `ControlledHost`、`FailingCancelHost`、`RecordingSurface` 与现有桥接 `vi.mock`。

## 验收标准

- [ ] AC-09 (a)：Core faulted、渲染 failed/unavailable（回滚成功）时记录为 null。
- [ ] AC-09 (b)：restart/故障收尾中资源清理或取消帧失败后记录保留清理原因，后续 store 错误不使其丢失。
- [ ] AC-09 (c)(e)：`dispose()` 失败留下记录且照常抛出，全部清理仍尝试；记录在 dispose 后可读，后续错误不覆盖首因。
- [ ] AC-09 (d)：初始化失败但回滚成功不锁存；回滚也失败则锁存。
- [ ] 渲染端口 connect 失败且 disconnect/dispose 失败、运行消费者接线回滚失败两条路径都产生记录，不只降级 unavailable；业务 `AggregateError` 回滚成功时不误锁存。
- [ ] 浏览器表面转交前回滚失败的信号在工厂中实际产生（代码审阅确认，供 03 接收）。
- [ ] P1-06/07 既有 owner 与渲染器测试保持通过；`pnpm exec vitest run src/app/composition src/render src/ui src/app/session` 通过。

## 验证方法

- Node：真实 Session 与 owner，用 `RecordingSurface.connectFailure`/`disposeFailure`、`FailingCancelHost.lifecycleCancelFailure`、`ControlledHost.cancelFailure` 及桥接 `vi.mock` 注入；断言记录、原始 cause 身份、`AggregateError` 内容与“全部清理已尝试”。
- 不适用浏览器测试；浏览器表面路径以审阅记录。

## 完成证据
