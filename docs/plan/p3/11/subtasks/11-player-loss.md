---
type: plan
status: active
phase: P3
task: "11"
subtask: "11"
updated: 2026-10-17
---

# 11 — 玩家损失：被毁与能量耗尽信标

**契约来源：** [spec](../spec.md) 的 S-04、AC-04、AC-05；[玩家损失](../spec.md#玩家损失被毁与能量耗尽)；Q-04、Q-06 的已归档结论。
**依赖：** 10。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **被毁 `0x32d74`：** 在 [damage.ts](../../../../../src/core/systems/damage.ts) 的 CR-13 位置（对象事件之后、爆炸构造之前）接入；主状态 3 且子状态不为 2 时：子状态 2、写视角 0x11/8 与上一视角并清玩家目标、调用 `switchView`、`flushRadio`（新原因）、停靠对象置 null；精确次序与停靠中活动字段按 Q-04。
- **逃生舱到期：** 损失处理入口由 12 实现，并由 12 在 [destruction.ts](../../../../../src/core/systems/destruction.ts) 的 `expireFragment` 中接入；本项不建空入口或待处理标志。
- **能量耗尽 `0x33464`：** 在 [energy.ts](../../../../../src/core/systems/energy.ts) 每次耗尽更新钳零之后接入（不订阅 `energy-depleted`）；主状态 3、子状态 0 时发信标消息事件、子状态 1、期限 = 取样 + 0x3C0。`mission-flow` 以上一取样到期时先置子状态 2 并 `flushRadio`；之后调用损失处理的接线由 12 完成。等待中被毁时旧期限失效；停靠请求覆盖与恢复后再耗尽按 Q-06。
- 测试：地图、Warp、停靠等待/已停靠、基地视角中被毁的联合用例（实际流水线）；F1 不绕过门禁，地图切换与 `p` 暂停的已批准例外；其他碎片不触发；信标的生效条件、重复耗尽、停靠覆盖、Warp 中耗尽不取消 Warp。

## 不包含

- 救援、失败与计数（12）；被毁视角相机（P3-12）。

## 关键文件与契约

- [view-switch.ts](../../../../../src/core/systems/view-switch.ts)、[radio.ts](../../../../../src/core/systems/radio.ts) 的 `flushRadio`、[flight-control.ts](../../../../../src/core/systems/flight-control.ts) 的玩家可用门禁、[docking.ts](../../../../../src/core/systems/docking.ts)。

## 写入范围

- `src/core/systems/damage.ts`：`0x32d74` 接入。
- `src/core/systems/energy.ts`：`0x33464` 接入。
- `src/core/systems/mission-flow.ts`：子状态 1 的到期。
- `src/core/systems/player-loss.ts`：计划新增的被毁与信标入口。
- `src/core/systems/player-loss.test.ts`：计划新增的测试。
- `src/core/systems/*.test.ts`：联合回归与受影响的既有测试。

## 验收标准

- [ ] 被毁效果与次序符合 Q-04；四种上下文中的被毁走实际流水线并符合 spec。（AC-04）
- [ ] 信标在每次耗尽更新经过入口，生效条件、到期、flush 次序与覆盖符合 Q-06。（AC-05）
- [ ] P3-07、P3-09、P3-10 的既有测试不回归；不建无人调用的空入口。
- [ ] 受影响的 Vitest、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- 合成任务的 Node 联合测试与时间边界；期望独立推导。
- 按 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 清理本项范围。

## 完成证据
