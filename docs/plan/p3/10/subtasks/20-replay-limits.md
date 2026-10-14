---
type: plan
status: active
phase: P3
task: "10"
subtask: "20"
updated: 2026-10-14
---

# 20 — 快照、replay 与容量

**契约来源：** [spec](../spec.md) 的 S-01、AC-12；[持久化与兼容](../spec.md#持久化与兼容)。
**依赖：** 15, 18, 19。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 核对快照包含全部未来相关的新状态（菜单、子状态与到期、保存位姿、服务队列与进度、队列与通道、限频与计数、命令码）。
- 同一运行连续两次停靠与离港的 JSON 往返录制在 Node replay 中事件与检查点一致；与占位保持时长、帧分组无关；坏规则/格式版本、内容身份、setupHash 与输入在执行前拒绝。
- 菜单、消息、事件与请求预算的 limit/limit+1 与故障锁存回归；纯读不改变给定 tick 输入的规则结果。

## 不包含

- Runtime 保持（21）；真实内容核对（24）。

## 关键文件与契约

- [snapshot.ts](../../../../../src/core/replay/snapshot.ts)、[replay.ts](../../../../../src/core/replay/replay.ts)、[recording.ts](../../../../../src/core/replay/recording.ts)、[compare.ts](../../../../../src/core/replay/compare.ts)、[limits.ts](../../../../../src/core/contracts/limits.ts)。
- 计划新增：`src/core/replay/comm-replay.test.ts`。

## 写入范围

- `src/core/replay/**`：快照遗漏的修补与测试。
- `src/core/contracts/limits*.ts`：上限与测试。

## 验收标准

- [ ] AC-12：快照完整；两次停靠/离港的录制 replay 一致，与保持时长和帧分组无关；坏版本、身份、setupHash 与输入提前拒绝；预算 limit/limit+1 与锁存有回归。
- [ ] 本项相邻测试、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- `pnpm exec vitest run` 跑本项相邻测试，再跑 `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts`；`pnpm typecheck` 与 `pnpm lint` 通过。
- 完成前按 execute-goal 做一次 rubber-duck 审查，并以本项写入范围调用 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据
