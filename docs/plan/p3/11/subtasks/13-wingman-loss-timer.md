---
type: plan
status: active
phase: P3
task: "11"
subtask: "13"
updated: 2026-10-17
---

# 13 — 僚机损失计时

**契约来源：** [spec](../spec.md) 的 S-07、AC-08；[僚机损失计时](../spec.md#僚机损失计时)；Q-07 的已归档结论。
**依赖：** 10。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 在 [damage.ts](../../../../../src/core/systems/damage.ts) 的 CR-13 位置（僚机停放判定与爆炸构造之前）接入 `0x32dec`：只在标志为 0 时设置标志与期限（取样 + 0x780）。
- 在 `mission-flow` 子状态 0、任务状态检查之后检查到期（上一取样，比较按 Q-11）；到期清标志，经 [radio.ts](../../../../../src/core/systems/radio.ts) 的 `queueRadio` 排入表 20983 第 6 项；全清先到时丢弃，其他子状态延后；救援不清，新世界重置。
- 测试：重复被毁不重设、到期与全清同 tick 的优先级、各子状态的延后、消息身份。

## 不包含

- 僚机 AI 与报告（P3-08、P3-10 已交付）。

## 关键文件与契约

- [comm-messages.ts](../../../../../src/content/rule-data/comm-messages.ts)、[radio.ts](../../../../../src/core/systems/radio.ts)、10 新增的 `mission-flow.ts`。

## 写入范围

- `src/core/systems/damage.ts`：`0x32dec` 接入。
- `src/core/systems/mission-flow.ts`：到期检查。
- `src/core/systems/wingman-loss.ts`：计划新增的计时规则。
- `src/core/systems/wingman-loss.test.ts`：计划新增的测试。
- `src/core/systems/*.test.ts`：受影响的既有测试。

## 验收标准

- [ ] 计时只在标志为 0 时设置；子状态 0 到期排入正确消息；其他子状态延后；全清优先。（AC-08）
- [ ] 救援不清计时，新世界重置。（AC-08）
- [ ] 受影响的 Vitest、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- Node 状态与时钟边界测试，期望独立推导。
- 按 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 清理本项范围。

## 完成证据
