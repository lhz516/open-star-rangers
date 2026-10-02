---
type: plan
status: active
phase: P1
task: "05"
subtask: "01"
updated: 2026-10-02
---

# 01 — 宿主端口与会话错误契约

**契约来源：** [spec](../spec.md) 的 S-01、S-07、S-08，AC-01、AC-10、AC-14（数据/类型部分）。
**依赖：** 无。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 定义 DOM-free `SessionHost`：requestFrame 的 number 毫秒回调/非负安全整数 handle（含 0）、cancelFrame、readVisibility、subscribeLifecycle 及三种宿主通知。
- 端口按浏览器异步语义：先返回请求句柄后回调；部分注册失败由宿主撤销未交出的资源。只定义契约，不装配浏览器或复制世界。
- 实现 `GameSessionError`：invalid-argument 的 path/reason/cause；invalid-state 的 operation/phase/runId/reason；operation-failed 的有序 `{phase,cause}`，phase 为 runtime/scheduler/consumer/cleanup/control。
- 错误列表和条目冻结、原 cause 保留，不冻结调用者异常。同步回调及 onError 返回 undefined，类型拒绝 Promise。不重定义 GameRuntimeError。

## 不包含

- 不写会话控制器占位或空实现；运行句柄/状态/帧数据归 04。
- 实际浏览器事件归 03，错误转移/出口调用归 04–06。

## 关键文件与契约

- 计划新增 `src/app/session-host.ts`、`src/app/session-errors.ts`、`src/app/session-errors.test.ts`，当前均不存在。
- [Runtime 错误](../../../../../src/app/runtime-errors.ts)（已有，只读）：cause/错误数组的先例。

## 验收标准

- [ ] S-07、AC-10：三种错误 shape 完整，五种 failure phase 类型明确；保留 Error/非 Error/undefined cause 及顺序，副本不随调用者数组修改。
- [ ] AC-01：SessionHost、事件联合和 onError 可在无 DOM 的 Node 类型程序编译，handle=0 合法。
- [ ] AC-14：负向类型断言拒绝缺失必需字段、非法宿主通知和 Promise 回调；目标测试、pnpm check 通过。

## 验证方法

- `pnpm exec vitest run src/app/session-errors.test.ts`，同文件的 `@ts-expect-error` 由 `pnpm typecheck` 验证；完整 `pnpm check`。
- 按 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 限定本项三个新增文件，先完成工作流规定的 rubber-duck。
- 文档检查：工程模块/类型约定有影响则更新 [engineering](../../../../engineering/README.md)，不写尚未存在的浏览器使用流程。无浏览器/实机/原版验收。

## 完成证据
