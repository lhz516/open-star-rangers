---
type: plan
status: active
phase: P3
task: "11"
subtask: "11"
updated: 2026-10-23
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

- [x] 被毁效果与次序符合 Q-04；四种上下文中的被毁走实际流水线并符合 spec。（AC-04）
- [x] 信标在每次耗尽更新经过入口，生效条件、到期、flush 次序与覆盖符合 Q-06。（AC-05）
- [x] P3-07、P3-09、P3-10 的既有测试不回归；不建无人调用的空入口。
- [x] 受影响的 Vitest、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- 合成任务的 Node 联合测试与时间边界；期望独立推导。
- 按 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 清理本项范围。

## 完成证据

- **实现：** 新增 [player-loss.ts](../../../../../src/core/systems/player-loss.ts)：`destroyPlayer`（`0x32d74`，ME-09 第 1–6 步：子状态 2 → `flushRadio('player-destroyed')` → 视角 0x11/子模式 8、上一视角 0x11、玩家目标置 null（不发 `target-changed`）→ `switchView(0x11, old)` → 停靠对象置 null → `player-loss-started`）与 `startBeaconWait`（`0x33464`：主状态 3、子状态 0 时 `flight-message`（`beacon`）→ 子状态 1、期限 = 取样 + 0x3C0 → `player-loss-started`）。[damage.ts](../../../../../src/core/systems/damage.ts) 的 `destroy` 在对象事件与击杀计数之后、`destroyEntity` 之前对玩家调用前者；[energy.ts](../../../../../src/core/systems/energy.ts) 在玩家**每次**耗尽更新的钳 0、锁定与 `energy-depleted` 之后调用后者；[mission-flow.ts](../../../../../src/core/systems/mission-flow.ts) 的子状态 1 在 c′ ≥ 期限时置子状态 2 并 `flushRadio('beacon-expired')`。损失处理 `resolvePlayerLoss` 未建空入口，由 12 在信标到期与逃生舱到期两处接入。
- **事件次序的处理：** Warp 中被毁时，清空先写页 0（其 `left-page-changed` 在 `radio-flushed` 之前），`switchView` 再恢复 `savedLeftPage`；这次页面改变在 `player-loss-started` **之后**发出（同 MW-05 中 `warp-completed` 先于其页面事件），因为 `compare.ts` 要求 `player-loss-started` 紧接在其清空之后。状态写入的次序仍按 ME-09。
- **测试：** [player-loss.test.ts](../../../../../src/core/systems/player-loss.test.ts)（13 项，正式 tick 中经真实伤害入口被毁，期望按合约独立推导，并以 `compareReplayResults` 检查 ME-13 次序）：飞行中的效果、事件与不变字段；子状态 2、主状态 4/5（被毁与耗尽都不进入损失，流程照常到完成消息或锁存）与 0x11/8 分支；地图打开时被毁（`toggle-map`/`map-point` 为 `player-unavailable`，`cockpit-front` 为 `not-implemented`，F1 不能离开 0x11）；Warp 中被毁（放弃 Warp，`inWarp` 与 `warpClock` 保持，700 tick 内无 `warp-completed`，页面恢复为能量页）；停靠等待中被毁（覆盖子状态 3，停靠对象释放，加载中的回复被清空，之后无停靠、取消或衔接）；信标等待中被毁（旧期限不再读取）；信标的事件次序与到期（生产步长下第 483 tick，c′ = 964；步长 0x140 时 c′ 等于期限即到期，非严格）；菜单在子状态 0 建立后耗尽，命令码 9 覆盖子状态 1，旧期限不读，超时回到 0 后下一次耗尽更新（时钟 1988）重新进入；Warp 中耗尽不改视角、Warp 照常完成；信标等待中地图可打开；已停靠的玩家没有能量更新。已停靠（基地视角）中被导弹起爆击毁的联合用例在 [docked-systems.test.ts](../../../../../src/core/systems/docked-systems.test.ts)（活动保持 `docked`、子状态 5→2、停靠对象 null、视角 0x11、状态显示重绘，`launch` 为 `player-unavailable` 且不自动离港）。
- **受影响的既有测试（按新契约更新，不放宽断言）：** base-interior、collision、combat-chains（玩家被毁后子状态 2；耗尽开始一次信标等待）、destruction、docked-systems（含为离港后不触发信标而给玩家能量）、energy（`beaconEvents` 期望）、mission-flow（子状态 1 的保持需要远期限）。
- **检查：** `pnpm exec vitest run src/core/systems`：39 个文件、1004 项通过；`pnpm check`：344 个文件、10176 项通过，TypeScript、ESLint 与生产构建通过（各一次，未遇超时）。
- **Rubber-duck：** 无阻断或非阻断问题；认为 Warp 页面事件放在 `player-loss-started` 之后合理。**Simplify：** 去掉两个未被引用的导出常量；未采纳共享 `dueAfter`（会让 player-loss 依赖 mission-flow，与 12 的接线方向相反）与把 0x11 常量移入 view-switch.ts（不在写入范围）。
- **文档影响：** `docs/original/` 无新事实（Q-04/Q-06 已由 04 归档）。[core.md](../../../../engineering/modules/core.md) 第 774 行（“P3-11 的固定调用点……尚未接入……停靠中被毁时……在此之前玩家保持停靠”）与交接段（约 1010–1027 行）已过时，不在本项写入范围，交 22 订正。

