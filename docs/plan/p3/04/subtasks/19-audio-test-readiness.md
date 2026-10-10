---
type: plan
status: active
phase: P3
task: "04"
subtask: "19"
updated: 2026-10-10
---

# 19 — 修复：音频回放用例的应用就绪等待

**契约来源：** [spec](../spec.md) 的[验证策略](../spec.md#验证策略)（既有浏览器回归保持通过）与 AC-18 的 `pnpm test:e2e` 全部通过；17 第一次最终对齐中 `pnpm test:e2e` 未通过的修复。
**依赖：** 无。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **问题：** [audio-playback.spec.ts](../../../../../e2e/audio-playback.spec.ts) 的“blocks audio without activation…releases everything”在本 goal 的分支上间歇失败：释放后探针仍报告一个活动的 `ended` 监听。协调者于 2026-10-10 在同一机器上交替对照（每批 `--repeat-each 10`，3 个用例）：基线 `bb639ef` 90/90 通过，goal 分支 `eaa3b061` 83/90 通过；在分支上去掉 11 的计时器探针仍失败（3/60），去掉 09 的开发期顶层 `await import()` 后 60/60 通过。原因与 18 相同：顶层 `await` 推迟应用模块的求值，而 [audio-playback.ts](../../../../../e2e/support/audio-playback.ts) 的 `withAudioTargets` 只等待 `document.readyState === 'complete'` 与音频探针，用例在应用仍在启动时开始驱动页面。
- **修复：** `withAudioTargets` 的载入等待同时要求应用完成首次渲染（`#root` 出现子元素），与 18 的 `openTestEntry` 一致；不改产品代码、音频控制器或断言。协调者在临时 worktree 中验证该改动：90/90 通过。
- 核对没有其他用例以同样方式只等待 `readyState` 就驱动应用（2026-10-10 的 `grep` 只有这一处）。

## 不包含

- 开发诊断的载入方式（09 已定，生产剔除依赖它）；音频控制器的行为。

## 关键文件与契约

- 修改：[audio-playback.ts](../../../../../e2e/support/audio-playback.ts) 的 `withAudioTargets`。

## 写入范围

- `e2e/support/audio-playback.ts`：载入等待。

## 验收标准

- [x] 修复前在本 worktree 复现间歇失败；修复后 `pnpm test:e2e e2e/audio-playback.spec.ts --project=development --repeat-each 10` 连续 3 批全部通过；`--project=development-headed` 中该文件的用例通过。
- [x] 其他使用 `withAudioTargets` 的用例通过；`pnpm check` 通过。

## 验证方法

- 使用分配的端口运行上述命令；记录 Chrome 版本与通过数。
- 不适用原版对照。

## 完成证据

- **环境：** Chrome 155.0.8059.39（channel chrome），端口 `OSR_E2E_DEV_PORT=5157`、`OSR_E2E_PREVIEW_PORT=5158`，机制核对的开发服务器 5159；基于认领提交 `a84ce33b`，先 `pnpm build`。
- **修复前复现：** 未改动时 `pnpm exec playwright test e2e/audio-playback.spec.ts --project=development --repeat-each 10` 连续 3 批为 27/30、28/30、29/30（共 84/90）。失败出现在第 1 个用例（`released` 断言中 `activeListeners: ['ended']`）与 headed 的页面隐藏用例（`Released timed out`，最后观察同样是 `activeListeners: ['ended']`，且只播放 2 个声音却记有 3 个 `ended`）。
- **根因（已确认）：** 残留的不是控制器的监听，而是 React DOM 在 `#root` 上注册的 `ended` 捕获监听（媒体事件不委托，`createRoot` 时在根容器上以捕获阶段注册，之后一直存在）。探针把它归入 `react` 组，`audioState` 只排除 `test` 组，并按 `addedAt > listenersFrom` 计数。09 的开发期顶层 `await import()` 使应用模块（含 `createRoot`）可能晚于 `document.readyState === 'complete'` 求值；若晚于 `setUpAudioPage` 记下的 `listenersFrom`，这个监听就被算作控制器释放后仍活动的监听。修复后用一次性脚本（已删除）核对：该监听为 `{ group: 'react', active: true, capture: true, addedAt: 95 }`，基线 `listenersFrom` 为 309，即先于基线。
- **修复：** [audio-playback.ts](../../../../../e2e/support/audio-playback.ts) 的 `withAudioTargets` 载入等待在原条件上加 `document.querySelector('#root > *') !== null`，并在注释中说明原因。`main.tsx` 只在静态依赖（含两处顶层 `await`）求值完成后执行，`#root` 出现子元素说明首次提交已发生。轮询仍是原有的 CDP `Runtime.evaluate`，`querySelector` 不注册监听、计时器或动画帧，探针不受影响。产品代码、音频控制器与断言未改。
- **修复后：** 同一命令连续 3 批 30/30、30/30、30/30（共 90/90）；headed 用例单独运行 `-g "really hidden" --repeat-each 5` 为 5/5。`--project=development-headed` 运行该文件报告 “No tests found”：该项目的 `testMatch` 只有 `native-lifecycle.spec.ts`。该文件的 headed 用例属于 development 项目，经 `nativeBrowser` 自行启动 headed Chrome，即上面单独运行与 3 批中的页面隐藏用例，以此满足第一条验收的 headed 部分。
- **其他调用者：** `withAudioTargets` 只被 [audio-playback.spec.ts](../../../../../e2e/audio-playback.spec.ts) 的 3 个用例使用（包括 `withoutAudioContext` 用例，删除 `AudioContext` 后应用仍完成首次渲染），均在上述批次中通过。`grep -rn readyState e2e` 只有这一处等待。
- **`pnpm check`：** 通过（typecheck、lint、Vitest 213 个文件 6268 项、生产构建）；唯一的提示是既有的 typescript-eslint `TSImportType` 弃用警告，与本改动无关。
- **Rubber-duck：** 无阻塞或非阻塞问题。确认首次渲染足以作为就绪信号（只需模块求值与 React 根监听先于 `listenersFrom`）、`withoutAudioContext` 用例仍能渲染、主世界 `querySelector` 不影响探针、5 s 的 `until` 超时为低残余风险（3 批均通过），并指出残留监听来自 React 根的 `ended` 监听而非产品泄漏，随后已按上文实测确认。
- **Simplify：** 直接检查，单行条件加注释，没有可复用的既有就绪等待（18 的 `openTestEntry` 用 Playwright 页面定位器，此处是原始 CDP 目标，沿用同一 `until` 轮询更一致），无需清理。
- **文档影响：** [工程约定](../../../../engineering/README.md)的音频播放一节不描述载入等待，现有内容仍准确，无需更新；原因已写入 `withAudioTargets` 的注释。