---
type: plan
status: active
phase: P3
task: "04"
subtask: "18"
updated: 2026-10-10
---

# 18 — 修复：开发测试入口的就绪等待

**契约来源：** [spec](../spec.md) 的[合成演示退役](../spec.md#合成演示退役)的测试迁移（`pnpm test:e2e` 全部通过）与 AC-18；为 13 的 `pnpm test:e2e` 验收解除阻塞。
**依赖：** 无。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **问题：** 09 为在生产构建中剔除开发诊断，在 [browser-ports.ts](../../../../../src/app/browser-ports.ts) 与 [MissionScreen.tsx](../../../../../src/app/MissionScreen.tsx) 中使用 `import.meta.env.DEV` 之后的顶层 `await import()`。开发测试入口 [app-entry.test-support.tsx](../../../../../src/app/app-entry.test-support.tsx) 依赖前者，因此它的模块求值（设置 `window.osrTestEntry` 并渲染应用）晚于 `page.goto` 的 load 事件。在 `openTestEntry` 之后立即读取 `window.osrTestEntry` 的用例因此出现竞争：2026-10-10 在 goal 分支 `35b68ce6` 上的完整 `pnpm test:e2e` 中，[failure-worker-cancel.development.spec.ts](../../../../../e2e/failure-worker-cancel.development.spec.ts) 的 3 个 F-12 用例（late restore、late commit、late listing）以 `Cannot read properties of undefined (reading 'profile')` 失败。
- **修复：** 在 [app-entry.ts](../../../../../e2e/support/app-entry.ts) 的 `openTestEntry` 中，`page.goto` 之后等待测试入口完成首次渲染（入口先设置 `window.osrTestEntry` 再渲染，例如等待 `#root` 出现子元素）。等待须使用 Playwright 的定位器（工具世界），不在页面主世界注入轮询脚本，以免干扰资源平衡与探针用例的基线。不改变生产代码的剔除方式、测试入口的查询键或其他用例的断言。
- 若核对发现其他用例也在入口就绪前读取 `window.osrTestEntry`，同样由这一等待覆盖；不需要逐个修改用例。

## 不包含

- 合成源码与 `demo-observations.ts` 的删除（13）；开发诊断的载入方式（09 已定）。
- 与此无关、单独运行可通过的负载抖动（例如 `audio-playback.spec.ts` 在高负载下的一次失败，单独重跑 3/3 通过），由 17 的完整运行复核。

## 关键文件与契约

- 修改：[app-entry.ts](../../../../../e2e/support/app-entry.ts) 的 `openTestEntry`。
- 只读：[app-entry.test-support.tsx](../../../../../src/app/app-entry.test-support.tsx)（先设置 `window.osrTestEntry`，再 `createRoot(...).render`）、[browser-ports.ts](../../../../../src/app/browser-ports.ts)。

## 写入范围

- `e2e/support/app-entry.ts`：`openTestEntry` 的就绪等待。
- `e2e/failure-worker-cancel.development.spec.ts`：仅在共用等待不足以修复时做最小调整。

## 验收标准

- [ ] `pnpm test:e2e e2e/failure-worker-cancel.development.spec.ts --project=development` 全部通过，含 3 个 F-12 用例；连续运行 3 次稳定。
- [ ] 所有调用 `openTestEntry` 的开发用例（含资源平衡、探针契约与任务流程用例）通过，资源平衡基线不受等待影响。
- [ ] `pnpm check` 通过。

## 验证方法

- 修复前在本 worktree 复现 3 个 F-12 失败；修复后运行上述用例与 `pnpm test:e2e --project=development`（使用分配的端口）。
- 不适用原版对照。

## 完成证据
