---
type: plan
status: active
phase: P1
task: "08"
subtask: "02"
updated: 2026-10-10
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

- [synthetic-demo-owner.ts](../../../../engineering/source-structure.md#r5-演示所有者与槽位)：新增失败记录查询；渲染器创建失败分支区分“回滚成功的不可用”与“回滚失败”；订阅会话状态中的 `cleanupFailed`。
- [synthetic-renderer.ts](../../../../engineering/source-structure.md#r2-合成渲染) 的 `createSyntheticRenderer` 与 `attach()`；[browser-webgl-surface.ts](../../../../../src/render/webgl/browser-webgl-surface.ts) 的创建回滚；必要时在 [cleanup.ts](../../../../../src/render/scene/cleanup.ts) 中放置共享的结构化失败类型（名称由实现决定，不建立全局 utils）。
- 测试：[synthetic-demo-owner.test.ts](../../../../engineering/source-structure.md#r5-演示所有者与槽位)、[synthetic-renderer.test.ts](../../../../engineering/source-structure.md#r2-合成渲染)，复用 `ControlledHost`、`FailingCancelHost`、`RecordingSurface` 与现有桥接 `vi.mock`。

## 验收标准

- [x] AC-09 (a)：Core faulted、渲染 failed/unavailable（回滚成功）时记录为 null。
- [x] AC-09 (b)：restart/故障收尾中资源清理或取消帧失败后记录保留清理原因，后续 store 错误不使其丢失。
- [x] AC-09 (c)(e)：`dispose()` 失败留下记录且照常抛出，全部清理仍尝试；记录在 dispose 后可读，后续错误不覆盖首因。
- [x] AC-09 (d)：初始化失败但回滚成功不锁存；回滚也失败则锁存。
- [x] 渲染端口 connect 失败且 disconnect/dispose 失败、运行消费者接线回滚失败两条路径都产生记录，不只降级 unavailable；业务 `AggregateError` 回滚成功时不误锁存。
- [x] 浏览器表面转交前回滚失败的信号在工厂中实际产生（代码审阅确认，供 03 接收）。
- [x] P1-06/07 既有 owner 与渲染器测试保持通过；`pnpm exec vitest run src/app/composition src/render src/ui src/app/session` 通过。

## 验证方法

- Node：真实 Session 与 owner，用 `RecordingSurface.connectFailure`/`disposeFailure`、`FailingCancelHost.lifecycleCancelFailure`、`ControlledHost.cancelFailure` 及桥接 `vi.mock` 注入；断言记录、原始 cause 身份、`AggregateError` 内容与“全部清理已尝试”。
- 不适用浏览器测试；浏览器表面路径以审阅记录。

## 完成证据

- **结构化信号：** 新增 [rollback-error.ts](../../../../../src/app/session/rollback-error.ts) 的 `RollbackError`（继承 `AggregateError`，`cause` 为原始失败，`errors` 依次为原始失败与各回滚失败）。放在 `app/session/` 是因为资源所有权与清理归 Session（[源码结构指南](../../../../engineering/source-structure.md#职责与依赖)），且 `render/` 与 `ui/game/` 都已依赖 `app/session/`；放进 `render/scene/cleanup.ts` 会让桥接反向依赖渲染层。抛出点：[createSyntheticRenderer](../../../../engineering/source-structure.md#r2-合成渲染) 的 connect 失败后释放失败、渲染器 `attach()` 的本地回滚失败、[createBrowserWebGLSurface](../../../../../src/render/webgl/browser-webgl-surface.ts) 转交前回滚失败（代码审阅确认：catch 中 `attemptAll` 有失败时抛 `RollbackError`，无失败时原样抛出原因），以及[会话桥接](../../../../engineering/source-structure.md#r6-合成-ui-层)的 bind 回滚失败与运行消费者接线回滚失败。桥接此前会丢弃消费者接线回滚的错误；现在把它们与原因一起抛出，使会话错误包含清理原因。回滚成功时各处仍原样抛出原始原因，P1-07 行为不变。
- **owner 记录：** [SyntheticDemoOwner](../../../../engineering/source-structure.md#r5-演示所有者与槽位) 新增 `cleanupFailure(): Readonly<{cause}> | null`（首因锁存、冻结外壳、dispose 后可读）。以下情况会设置记录：
  - 初始化回滚失败（`RollbackError`）。
  - 渲染器创建回滚失败，或表面工厂交来的 `unavailable` 为 `RollbackError`。此时初始化直接失败，不创建会话。
  - 会话状态首次报告 `cleanupFailed`，或会话错误的失败项中出现 `RollbackError`（覆盖消费者自身登记的非会话清理）。
  - `dispose()` 失败：先停止状态订阅，因此记录的就是 `dispose()` 抛出的错误；仍写 `actionError{cleanup}` 并抛出。
- **Node 测试：** [synthetic-demo-owner.test.ts](../../../../engineering/source-structure.md#r5-演示所有者与槽位) 的 “cleanup failure record” 组：
  - (a) Core/调度 faulted、渲染 failed、unavailable，以及业务 `AggregateError` 的 connect 失败在回滚成功时都为 null，演示照常运行。
  - (b) restart 时取消帧失败与运行资源清理失败都保留会话错误；之后的 restart actionError 与 dispose 不改变记录。
  - (c)(e) dispose 失败时记录等于抛出的错误，全部清理已尝试；早先已锁存的首因不被后续 dispose 失败覆盖。
  - (d) bind 失败但回滚成功不锁存；回滚也失败时锁存 `RollbackError`。
  - 表面无法释放（连接后释放失败，或工厂交来 `RollbackError`）时不创建会话，host 无监听与帧请求。
  - 运行消费者接线回滚失败：经会话清理失败，和消费者自有清理失败而 `cleanupFailed` 仍为 false 两条路径，记录都含清理原因。

  渲染器与桥接测试断言 `RollbackError` 的形状；业务 `AggregateError` 回滚成功时原样抛出。负向核对：只回退桥接改动后，两个消费者接线回滚测试失败。
- **工程检查：** `pnpm exec vitest run src/app src/render src/ui`：653 passed；`pnpm typecheck`、`pnpm lint` 通过；`pnpm check`：1077 passed，构建成功（仅既有块体积警告）。
- **Rubber-duck：** 发现两处阻断问题，均已修复并补测试：
  1. 消费者自有清理失败时 `cleanupFailed` 不置位，owner 漏记。owner 现在也识别会话错误中的 `RollbackError`。
  2. 表面工厂的 `RollbackError` 被降级为 unavailable 后仍创建会话。owner 现在把它视为初始化失败。
- **Simplify：**
  - 已采纳：去掉重复存储的 `rollbackErrors`；记录锁存后状态监听短路；`RollbackError` 移到独立的 `rollback-error.ts`，不混入 Session 专用错误文件。
  - 未采纳：把 `{cause}` 外壳改为裸值（spec 规定该形状，且 cause 可为 null）。
  - 未采纳：精简测试 mock 开关（每个都对应 AC-09 的不同路径）。
  - 未采纳：让 Session 因消费者 `RollbackError` 置位 `cleanupFailed`（spec 规定 Session 契约不变）。
- **文档影响：** owner 清理失败事实与 `RollbackError` 的工程文档同步按计划归 [05](./05-docs-isolation-checks.md)；hook 的接收与交付由 [03](./03-demo-lifecycle-wiring.md) 完成。

