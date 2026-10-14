---
type: plan
status: active
phase: P3
task: "09"
subtask: "21"
updated: 2026-10-14
---

# 21 — UI 桥接与开发诊断接线

**契约来源：** [spec](../spec.md) 的 S-12、AC-06（桥接部分）、AC-12 的前提；[地图 projection](../spec.md#地图-projection) 的读取与消费者。
**依赖：** 19。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- [game-session-bridge.ts](../../../../../src/ui/game/game-session-bridge.ts) 的关键状态：地图开关、就绪/无玩家、目的地提交、可执行性原因与 Warp 生命周期变化在帧末立即发布；普通 hover 不作为关键变化；不新增计时器，普通采样仍为 100 ms。
- 开发诊断：事件日志的封闭字段表覆盖新增事件；[command-draft.ts](../../../../../src/ui/dev/command-draft.ts) 的 `map-point`、`request-warp` 表单可用；生产构建不含开发面板。
- 命令反馈对新原因码的显示；地图几何仍为 null 时保持 P3-05 的 not-ready 提示，不锁定、不隐藏系统指针、不提交鼠标命令，`m`/未锁 Esc 可退出地图。
- 测试：桥接的普通采样与关键变化立即发布分别有测试；日志与表单覆盖新字段。

## 不包含

- 生产地图几何与画面（P3-13）；浏览器验证（22）。

## 关键文件与契约

- [game-session-bridge.ts](../../../../../src/ui/game/game-session-bridge.ts)、[MissionDevPanel.tsx](../../../../../src/ui/dev/MissionDevPanel.tsx)、[command-draft.ts](../../../../../src/ui/dev/command-draft.ts)、[use-mission-owner.ts](../../../../../src/app/composition/use-mission-owner.ts)、[MissionScreen.tsx](../../../../../src/app/MissionScreen.tsx)。

## 写入范围

- `src/ui/game/**`：桥接关键状态、命令反馈与测试。
- `src/ui/dev/**`：事件日志字段与命令表单。
- `src/app/mission/**`、`src/app/composition/**`、`src/app/MissionScreen.tsx`：接线（如需）。

## 验收标准

- [ ] AC-06 的桥接部分：普通采样与关键变化立即发布分别有测试。
- [ ] 新增事件在开发日志中有完整字段；命令编辑器可提交 `map-point` 与 `request-warp`；生产构建不含开发面板。
- [ ] `pnpm exec vitest run src/ui src/app` 与 `pnpm check` 通过。

## 验证方法

- Node/Vitest 消费者测试；生产构建产物不含 `ui/dev`（沿用既有回归）。

## 完成证据
