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
- 消费P3-14真实共享提示输出画类型9与锁定提示；警告取FA-01，不重复采样，无玩家不填false。
- D-02规定的真实共享模型未交付到执行基线则blocked，不在本目录代建替身。

## 不包含

不实现P3-14模型/声音，不改相机或目标规则，不做F2–F10。

## 关键文件与契约

- [flight-layers.ts](../../../../../src/render/flight/composition/flight-layers.ts)、[view-labels-payload.ts](../../../../../src/content/hud/view-labels-payload.ts)。
- 计划新增 `src/render/cockpit/overlay/`；共享模型实际路径和API以09为准，仍由P3-14拥有。

## 写入范围

- `src/render/cockpit/overlay/**`：叠加与共享提示绘制消费者、测试。
- `docs/original/formats/hud.md`：仅 §4.6 的 `0x45420` 复位点与秒钟取整核对结论（08 增补）。

## 验收标准

- [ ] 所有确认的叠加几何/读数与门禁覆盖，Warp/被毁没有多余HUD。
- [ ] 真实共享结果重复读不推进；视觉隐藏不错误停止锁定声音。
- [ ] 零tick、目标切换/传送、无玩家、暂停/恢复不产生重复提示。

## 验证方法

`pnpm test -- src/render/cockpit/overlay`、`pnpm check`；[simplify](../../../../../.agents/skills/simplify/SKILL.md) 限绘制消费者，26验证真实双消费链。

## 完成证据
