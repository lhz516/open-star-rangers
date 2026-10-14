---
type: plan
status: active
phase: P3
task: "10"
subtask: "21"
updated: 2026-10-14
---

# 21 — Runtime 与会话的运行中衔接保持

**契约来源：** [spec](../spec.md) 的 S-09、AC-13；[运行中衔接](../spec.md#运行中衔接)；D-01 定稿后的 [P3-04 spec](../../04/spec.md) 运行中衔接。
**依赖：** 11, 18。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- [game-runtime.ts](../../../../../src/app/runtime/game-runtime.ts)：一次成功 step 返回衔接事件时，该 tick 为本帧最后一个 tick，完整输出照常帧后派发；帧报告给出实际 tick 数与截断原因；先固定屏障再派发，订阅者不能重入 `clearIntent`/`resetClock`。
- [game-session.ts](../../../../../src/app/session/game-session.ts)：帧后在安全边界进入 `transition` 保持，折叠 Render State，清除按住与重复并以 `transition` 原因取消未执行命令（已执行的不报取消）；保持期间无 step、无游戏输入、无游戏 rAF；以 owner/run/transition 凭证结束一次，重锚时钟不补跑；同 tick 多衔接为有限序列；退出、换 run、异常、隐藏与暂停的竞态按 P3-04 定稿。
- [mission-owner.ts](../../../../../src/app/mission/mission-owner.ts) 的占位序列与 transitionId（单调，不进 Core 或 replay），旧计时器与重复 skip 不能结束下一次占位。

## 不包含

- 占位页面与 G-05 页面（22）；Core 规则（16、18）。

## 关键文件与契约

- [game-runtime.ts](../../../../../src/app/runtime/game-runtime.ts)、[game-session.ts](../../../../../src/app/session/game-session.ts)、[mission-owner.ts](../../../../../src/app/mission/mission-owner.ts)、[mission-flow.ts](../../../../../src/app/mission/mission-flow.ts)；既有的 [game-session-pause-timing.test.ts](../../../../../src/app/session/game-session-pause-timing.test.ts) 与 [mission-owner-placeholder.test.ts](../../../../../src/app/mission/mission-owner-placeholder.test.ts) 是测试先例。

## 写入范围

- `src/app/runtime/**`：帧屏障与帧报告。
- `src/app/session/**`：保持、取消、凭证与竞态。
- `src/app/mission/**`：占位序列与 transitionId。

## 验收标准

- [ ] AC-13：衔接 tick 后本帧不再 step，该 tick 输出完整派发，截断可观察；无订阅回调重入生命周期。
- [ ] 只取消未执行命令且通知一次；两帧折叠；结束重锚；同 run 第二次保持拒绝第一次凭证；同 tick 多衔接按有限序列。
- [ ] hidden/pagehide、用户暂停、退出与换 run、消费者/计时器/清理失败都不绕过锁存或恢复保护；StrictMode/卸载不产生第二条循环。
- [ ] 本项相邻测试、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- `pnpm exec vitest run` 跑本项相邻测试，再跑 `pnpm exec vitest run src/core src/app src/ui tools`；`pnpm typecheck` 与 `pnpm lint` 通过。
- Runtime/Session/owner 的故障与竞态矩阵；沿用既有资源平衡与消费者测试。
- 完成前按 execute-goal 做一次 rubber-duck 审查，并以本项写入范围调用 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据
