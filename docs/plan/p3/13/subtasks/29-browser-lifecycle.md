---
type: plan
status: active
phase: P3
task: "13"
subtask: "29"
updated: 2026-10-25
---

# 29 — 资源、深度、恢复与网络边界验证

**契约来源：** [spec](../spec.md#接线与生命周期) 的 AC-18/19/25。
**依赖：** 27, 28。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 实际合成场景反复重试/返回/卸载/StrictMode，暖态GPU计数相等、每运行结束归零；CPU/队列预算和部分创建失败反馈覆盖。
- 丢上下文/布局时地图取消ready、解锁/系统指针恢复；恢复先画后资格，不补播消息/声音。
- 目标屏独立深度不污染世界，地图/基地往返后Warp保留深度；改变视口只变尺度。
- 验证迟到旧run结果失效、资源清理失败锁存和网络审计。

## 不包含

不放宽资源阈值或失败政策，不实施发布级设备矩阵。

## 关键文件与契约

- [flight-gpu-cache.ts](../../../../../src/render/flight/renderer/flight-gpu-cache.ts)、[game-session.ts](../../../../../src/app/session/game-session.ts)。
- 计划新增 `e2e/cockpit-lifecycle.spec.ts`，复用27/28的夹具。

## 写入范围

- `e2e/cockpit-lifecycle.spec.ts`：计划新增生命周期回归。
- `e2e/support/cockpit-lifecycle.ts`：计划新增故障与计数辅助。
- `src/render/cockpit/composition/*.test.ts`：局部创建/清理失败回归。

## 验收标准

- [ ] 只有一个循环/画布/上下文，运行资源归零且重复暖态计数稳定。
- [ ] GPU故障与契约故障分类正确，输入资格/指针与恢复同步。
- [ ] Warp深度、游戏外黑边/控件及网络边界没有回归。

## 验证方法

使用 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md)；`pnpm test:e2e -- e2e/cockpit-lifecycle.spec.ts`、相关Node故障回归和`pnpm check`。发现功能缺口转新增修复项；[simplify](../../../../../.agents/skills/simplify/SKILL.md)仅整理本验证夹具。

## 完成证据
