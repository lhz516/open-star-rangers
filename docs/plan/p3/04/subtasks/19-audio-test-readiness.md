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

- [ ] 修复前在本 worktree 复现间歇失败；修复后 `pnpm test:e2e e2e/audio-playback.spec.ts --project=development --repeat-each 10` 连续 3 批全部通过；`--project=development-headed` 中该文件的用例通过。
- [ ] 其他使用 `withAudioTargets` 的用例通过；`pnpm check` 通过。

## 验证方法

- 使用分配的端口运行上述命令；记录 Chrome 版本与通过数。
- 不适用原版对照。

## 完成证据
