---
type: plan
status: active
phase: P3
task: "12"
subtask: "22"
updated: 2026-10-15
---

# 22 — Warp 隧道效果

**契约来源：** [spec](../spec.md) 的 S-11、AC-15；[Warp 隧道效果](../spec.md#warp-隧道效果)；Q-11。
**依赖：** 06, 16。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **前提：** 当前分支包含 P3-09 的 `RenderState.warp`（同 10 的前提）。
- 计划新增 `src/render/flight/warp/`：只在视角 1 且 `warp` 非空时绘制；由序号、进度、n、u、L 与 15 个控制点按 Q-11 推出几何、颜色与贴图；按 pass 推进的部分每 tick 一次；表现抽取用表现随机源；序号变化时重置，`warp` 变为 null 时停止；不读写 Core 的 Warp 状态。
- 导出供 23 接入的 pass；测试覆盖开始、推进、重置、停止与表现抽取。

## 不包含

- Warp 规则（P3-09）。
- 接入与浏览器读回（23、25）。

## 关键文件与契约

- 计划新增：`src/render/flight/warp/`。
- 输入：P3-09 的 `RenderWarp`。

## 写入范围

- `src/render/flight/warp/**`：隧道效果 pass 与测试。

## 验收标准

- [ ] AC-15（Node 部分）：绘制条件、推进、重置与停止符合 Q-11；不读写 Core 状态。
- [ ] `pnpm exec vitest run src/render/flight/warp` 通过。

## 验证方法

- Node 测试。

## 完成证据
