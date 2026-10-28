---
type: plan
status: active
phase: P3
task: "13"
subtask: "21"
updated: 2026-10-28
---

# 21 — F1 叠加、被毁标签与共享指示灯

**契约来源：** [spec](../spec.md#f1-叠加与被毁视角标签) 的 S-08/S-09，AC-14/15。
**依赖：** 09, 14, 15。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 实现04完整清点的十字、目标框/提前量、连线、数值缓存、武器弹药及速度辅助闪烁。
- 相机/目标插值匹配同ID/放置序号，不把逻辑数值插值；Warp无F1叠加，被毁子模式8只标签/框及独立消息层。
- 按[D-02定稿](../spec.md#d-02-定稿09)直接读同tick projection的锁定进度、目标有效性与两项警告标志画类型9与锁定提示（类型9在其记录调度中由本项绘制）；闪烁与相位用驾驶舱表现时钟，不重复采样，无玩家不填false。警告现读main的`communications.player.warnings`，P3-14合入后按DD-02切换（D-02修订，2026-10-28）。

## 不包含

不实现P3-14的声音状态或声音，不改相机或目标规则，不做F2–F10。

## 关键文件与契约

- [flight-layers.ts](../../../../../src/render/flight/composition/flight-layers.ts)、[view-labels-payload.ts](../../../../../src/content/hud/view-labels-payload.ts)。
- 计划新增 `src/render/cockpit/overlay/`；D-02定稿不建共享模型（09）。

## 写入范围

- `src/render/cockpit/overlay/**`：叠加与共享提示绘制消费者、测试。
- `docs/original/formats/hud.md`：仅 §4.6 的 `0x45420` 复位点与秒钟取整核对结论（08 增补）。

## 验收标准

- [ ] 所有确认的叠加几何/读数与门禁覆盖，Warp/被毁没有多余HUD。
- [ ] 重复读不推进；视觉隐藏只影响绘制，不产生任何驱动声音的状态（D-02 DD-03/DD-04）。
- [ ] 零tick、目标切换/传送、无玩家、暂停/恢复不产生重复提示。

## 验证方法

`pnpm test -- src/render/cockpit/overlay`、`pnpm check`；[simplify](../../../../../.agents/skills/simplify/SKILL.md) 限绘制消费者，26验证真实双消费链。

## 完成证据
