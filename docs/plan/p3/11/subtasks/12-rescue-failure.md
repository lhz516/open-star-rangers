---
type: plan
status: active
phase: P3
task: "11"
subtask: "12"
updated: 2026-10-17
---

# 12 — 救援与失败

**契约来源：** [spec](../spec.md) 的 S-05、S-06、AC-06、AC-07（损失与失败部分）；[救援](../spec.md#救援)、[失败](../spec.md#失败)；Q-05、Q-11 的已归档结论。
**依赖：** 11。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **损失处理 `0x32e14(p)`**（计划新增 `src/core/systems/rescue.ts`）：主状态不为 3 时无作用；计数 0/1 时救援，为 2 时置结束标志、锁存失败（第三次损失与损失类型、G-02/7 变体、`rescuesUsed`、击杀合计）并转入退场（14）。在 [destruction.ts](../../../../../src/core/systems/destruction.ts) 的 `expireFragment`（`p` = 1）与 11 的信标到期（`p` = 0）接通。
- **恢复 `0x67b98` 与外层写入**（纯规则计划新增 `src/core/rules/rescue.ts`）：清被毁标志，依次 `fullRepair` → `rebuildWeaponBlock` → `initialiseResources`，`fullRepair` 的调用位置标志按入口区分；限频清除、视角与上一视角 0xC、对象状态、移动块与最高速度、油门按 Q-05；玩家私有来源记录的位置与放置引用变化写入 [spawn-state.ts](../../../../../src/core/world/spawn-state.ts) 的状态，`placementSerial` 加 1；不改冻结的 `MissionSetup`。
- **放置：** 存活基地类对象（`0x68000`）按遍历次序计数，世界 RNG 取模选择；偏移、朝向、边界与无基地时的缺省放置按 Q-05，经 `placeWorldRecord`。
- 之后子状态 0、计数加 1，发出 `transition`（G-02/5 或 G-02/6）与救援事件。
- 测试：单次入口与完整 tick 两层；0/1/多个基地、取模原像数、RNG 次序；快照与别名；AI 与通讯状态不被重置（P3-08、P3-10 联合回归）；玩家 ID 复用后可再次被毁；被毁、耗尽与混合损失共享计数，第三次只锁存一次失败；基地/僚机损失、长时间运行、主状态 4/5 中的损失不是失败。

## 不包含

- 退场与完成（14）；救援占位与会话保持（16、17）。

## 关键文件与契约

- [base-interior.ts](../../../../../src/core/systems/base-interior.ts) 的 `fullRepair`、[combat-init.ts](../../../../../src/core/rules/combat-init.ts)、[comm-reactions.ts](../../../../../src/core/systems/comm-reactions.ts) 的 `clearCommunicationLimits`、[spawn.ts](../../../../../src/core/systems/spawn.ts) 的 `placeWorldRecord`、[flight-state.ts](../../../../../src/core/rules/flight-state.ts)、[entity-table.ts](../../../../../src/core/world/entity-table.ts)。

## 写入范围

- `src/core/systems/rescue.ts`：计划新增的损失处理。
- `src/core/systems/rescue.test.ts`：计划新增的测试。
- `src/core/rules/rescue.ts`：计划新增的恢复与放置规则。
- `src/core/rules/rescue.test.ts`：计划新增的测试。
- `src/core/systems/destruction.ts`：逃生舱到期的调用。
- `src/core/systems/player-loss.ts`：信标到期的调用。
- `src/core/systems/mission-flow.ts`：信标到期的分派。
- `src/core/systems/spawn.ts`：放置服务的复用接口。
- `src/core/world/spawn-state.ts`：来源记录的运行时字段（若 08 未覆盖）。
- `src/core/systems/*.test.ts`：联合回归与受影响的既有测试。

## 验收标准

- [ ] 恢复顺序、字段与外层写入符合 D7、Q4 与 Q-05；来源记录与 `placementSerial` 进快照，`MissionSetup`、payload 与 setupHash 不变。（AC-06）
- [ ] 基地选择与放置的支持集、取模映射与 RNG 次序有独立期望。（AC-06）
- [ ] 失败只在第三次损失锁存一次；非失败情形不锁存。（AC-07）
- [ ] P3-07 至 P3-10 的既有测试不回归；受影响的 Vitest、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- 合成任务的单次入口与完整 tick 测试；期望独立推导，不调用被测实现。
- 按 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 清理本项范围。

## 完成证据
