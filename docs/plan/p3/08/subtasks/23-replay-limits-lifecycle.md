---
type: plan
status: active
phase: P3
task: "08"
subtask: "23"
updated: 2026-10-15
---

# 23 — 自主 AI 的 replay、容量与运行生命周期

**契约来源：** [spec](../spec.md) 的 AC-01（回归部分）、AC-11、AC-17；[数值、随机数与时间](../spec.md#数值随机数与时间)、[与其他任务的接口](../spec.md#与其他任务的接口)的暂停与运行生命周期。
**依赖：** 16, 18, 19, 20, 21, 22。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 计划新增 `src/core/replay/ai-replay.test.ts`：合成内容、记录的种子与正常 `TickInput`，录制经 JSON 往返后用未修改的 [replayRecord](../../../../../src/core/replay/replay.ts) 重放，事件与检查点一致；覆盖自主选敌、开火、脚本与缓存转换、停放与重装。不沿用 [motion-replay.test.ts](../../../../../src/core/replay/motion-replay.test.ts) 的双边回写替身；内部请求测试不计入。更新 P3-06、P3-07 的 replay 夹具中随 AI 改变的断言，不改写历史证据。
- 快照覆盖控制器、解析缓存、执行实例、待处理命令、友伤累计与集合历史；读取 projection 或改变呈现频率不改变结果。
- 容量：执行步、栈、缓存/实例、实体扇出与请求/事件预算的 limit 与 limit + 1，超出时故障锁存、不发布部分输出。
- 运行生命周期：[app/session](../../../../../src/app/session/) 中暂停/隐藏不调用 `step()`、恢复不补墙钟、停止/重试与两个并行世界之间不泄漏缓存、期限或扳机，清玩家输入不改变 AI 状态；故障经 Runtime 显示。
- 发现的规则缺陷回到相应子任务的范围修复（协调者按需加修复子任务）。

## 不包含

- 浏览器回归（24）；真实内容（25）。

## 关键文件与契约

- 已有：[replay.ts](../../../../../src/core/replay/replay.ts)、[replay.test-support.ts](../../../../../src/core/replay/replay.test-support.ts)、[limits.ts](../../../../../src/core/contracts/limits.ts)、[app/session/](../../../../../src/app/session/)。
- 计划新增：`src/core/replay/ai-replay.test.ts`、`src/core/systems/ai-limits.test.ts`。

## 写入范围

- `src/core/replay/**`：AI replay 测试、夹具与支持。
- `src/core/systems/ai-limits.test.ts`：容量测试（新建）。
- `src/core/contracts/limits.ts`：预算的必要修正。
- `src/app/session/**`：生命周期测试与必要修正。
- `src/core/contracts/limits.test.ts`：`canonicalTextLength` 提高后的断言。

## 验收标准

- [ ] AC-11：标准录制与 replay 一致，快照完整。
- [ ] AC-17 的 Node 部分：预算边界、故障锁存、暂停/恢复/重试/双世界隔离。
- [ ] AC-01 的回归：既有不变量与随已批准变化更新的断言通过；`pnpm check` 通过。

## 验证方法

- Node replay、快照、容量与 Session 生命周期测试。
- 按 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 清理本项范围。

## 完成证据
