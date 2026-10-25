---
type: plan
status: active
phase: P3
task: "11"
subtask: "13"
updated: 2026-10-23
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

- [x] 计时只在标志为 0 时设置；子状态 0 到期排入正确消息；其他子状态延后；全清优先。（AC-08）
- [x] 救援不清计时，新世界重置。（AC-08）
- [x] 受影响的 Vitest、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- Node 状态与时钟边界测试，期望独立推导。
- 按 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 清理本项范围。

## 完成证据

- **2026-10-23（worker 13）：**
  - **实现：** 新增 [wingman-loss.ts](../../../../../src/core/systems/wingman-loss.ts)：`startWingmanLossTimer`（`0x32dec`）在 [damage.ts](../../../../../src/core/systems/damage.ts) 的 `destroy` 中，僚机（种类位 1）的 `object-destroyed` 与 `reportObjectEvent` 之后、停放判定与爆炸之前调用；只在 `pending` 为 false 时置 true、`dueClock` := 本 tick 取样 + 0x780，发出 `wingman-loss-timer-started`；不看主状态与子状态。`checkWingmanLossTimer` 在 [mission-flow.ts](../../../../../src/core/systems/mission-flow.ts) 子状态 0 的 `missionStatus === 'ended'` 判断的 else 分支中：c′ ≥ `dueClock` 时清标志，`queueMessage(20983, 头像 0, 第 6 项, 'none', null)`，有消息时先 `radio-queued`，再发出 `wingman-loss-timer-expired { queued }`。救援、停靠、锁存不写计时；新世界初值为 `{ false, 0 }`（08 已有）。`RULES_VERSION` 与快照格式不变（08 已按 ME-16 递增，计时字段已在快照中）。
  - **测试：** [wingman-loss.test.ts](../../../../../src/core/systems/wingman-loss.test.ts) 13 项，期望由 0x780/2 + 1 = 961 tick 等独立推导：被毁时紧接 `object-destroyed` 发出、到期 = 本 tick 时钟 + 0x780；挂起时再次被毁不重设、不移动期限；停放的僚机（`removed`）与主状态 3/1、3/2、4、5、0 中都设置；敌机不设置；期限越出安全整数为 `budget-exhausted`。到期在被毁后第 961 tick（c′ = 期限），`radio-queued` 的消息身份为 `{20983, null, 6}`、无说话者，紧接 `wingman-loss-timer-expired { queued: true }`，整个链通过 `compareReplayResults` 的 ME-13 次序检查；c′ 等于期限即到期（非严格）；第 6 项不存在时 `queued: false` 且清标志；子状态 1–5 推迟，回到 0 的第一个 tick 到期；主状态 4、5 不检查；任务状态已 `ended` 时先 `settlement-started`，此后直到锁存都不到期、标志保持；到期与全清在同一 tick（全清在其后的伤害阶段）时先排入消息，下一 tick 结算；新世界重置。救援不清计时由既有 [rescue.test.ts](../../../../../src/core/systems/rescue.test.ts) 的救援字段断言（`wingmanLoss: { pending: true, dueClock: 5000 }` 保持）覆盖；其中“基地与僚机损失不锁存”的 3000 tick 运行现在经过一次僚机计时到期，仍通过。
  - **检查：** `pnpm exec vitest run` wingman-loss、rescue、mission-flow、damage 与 `src/core/replay`：14 文件 649 项通过；`pnpm typecheck`、`pnpm lint` 通过；`pnpm check`：347 文件 10209 项通过，构建成功。
  - **审阅：** rubber-duck 未发现问题。simplify：测试改用具名种类位与共享的结束状态辅助、合并比较器检查到 961 tick 运行、缩短推迟循环，去掉多余的 `Object.freeze` 并注明 c′；未采纳导出 `dueAfter`、共享测试辅助文件与按种类的被毁入口表（超出写入范围，且与 `player-loss.ts` 的既有写法一致）。
  - **文档影响：** `docs/original/` 的事实无变化；[core.md](../../../../engineering/modules/core.md) 第 408、1010、1023、1029 行把 `0x32dec` 与僚机损失消息写成待接入，已过时，交 22 订正（超出本项写入范围）。
