---
type: plan
status: active
phase: P3
task: "13"
subtask: "19"
updated: 2026-10-25
---

# 19 — Warp 页与就绪灯

**契约来源：** [spec](../spec.md#左显示屏) 的 S-06/S-08，AC-10/14。
**依赖：** 14, 15。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 页6 消费 angle/error/completion/centring，按批准绘制规则画三条带、标题与有界轨迹。
- 轨迹依任务时钟/0x10刷新语义，Warp 序号改变重置；indicator 驱动类型12。
- 空 page/非Warp和暂停/0tick区分，禁止自造固定进度动画。

## 不包含

不修改 Warp 能量、位姿、路径、相机或音效。

## 关键文件与契约

- [projection.ts](../../../../../src/core/projections/projection.ts) 的 CombatWarpReading。
- [render-state.ts](../../../../../src/core/projections/render-state.ts) 的 Warp 序号。
- 计划新增 `src/render/cockpit/warp-display/`。

## 写入范围

- `src/render/cockpit/warp-display/**`：页6、灯与合成测试。

## 验收标准

- [ ] 三读数/轨迹来自同tick输入，刷新等号与边界无提前。
- [ ] 多次Warp和重试不继承旧轨迹，非Warp不画页6。
- [ ] 0tick只重画，所有输出均可由合成像素测试验证。

## 验证方法

`pnpm test -- src/render/cockpit/warp-display`、`pnpm check`；[simplify](../../../../../.agents/skills/simplify/SKILL.md) 限页6表现，31用截图066对照。

## 完成证据
