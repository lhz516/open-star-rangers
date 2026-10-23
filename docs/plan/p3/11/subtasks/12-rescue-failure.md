---
type: plan
status: active
phase: P3
task: "11"
subtask: "12"
updated: 2026-10-23
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
- `src/app/runtime/game-runtime-recording.test.ts`：容量停止测试改用减速为正的玩家机型记录，使耗尽后的能量救援不落入油门越界的 Core 故障（合成数据的伪影，ME-17 决定 7 不变）。

## 验收标准

- [x] 恢复顺序、字段与外层写入符合 D7、Q4 与 Q-05；来源记录与 `placementSerial` 进快照，`MissionSetup`、payload 与 setupHash 不变。（AC-06）
- [x] 基地选择与放置的支持集、取模映射与 RNG 次序有独立期望。（AC-06）
- [x] 失败只在第三次损失锁存一次；非失败情形不锁存。（AC-07）
- [x] P3-07 至 P3-10 的既有测试不回归；受影响的 Vitest、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- 合成任务的单次入口与完整 tick 测试；期望独立推导，不调用被测实现。
- 按 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 清理本项范围。

## 完成证据

- **实现：** 新增 [rescue.ts](../../../../../src/core/systems/rescue.ts) 的 `resolvePlayerLoss(context, loss)`（`0x32e14`/`0x67b98`，ME-10 第 1–12 步）：主状态 ≠ 3 时返回；计数为 2 时任务状态 `ended`、`disableSpawning`，再调用 10 的 `latch(context, { type: 'third-loss', loss })`（锁存捕获后计数清 0）；否则依次清被毁标志 → `fullRepair(…, true)` → `rebuildWeaponBlock` → `initialiseResources`（`world.clock`：能量救援为 c′，被毁救援为本 tick 取样，各 1 次抽取）→ 视角与上一视角 0xC（子模式不变）→ 选基地（1 次抽取或无）→ 就地改写玩家运行时记录 → `placeWorldRecord`（存储位置 0 次抽取，或全世界缺省 2 次）→ `placementSerial` 加 1 → `switchView(0xC, old)`（离开 Warp 时其 `left-page-changed` 在 `player-rescued` 之前）→ 状态 `active`、子状态 0 → 模式 0 移动块 → `clearCommunicationLimits` → 计数加 1 → `player-rescued`、`transition`（G-02/5 / G-02/6）。纯规则在 [rules/rescue.ts](../../../../../src/core/rules/rescue.ts)：`selectRescueBase`（`0x68000` 链表的全部实体，不看状态、活动、被毁与待移除；r % count）、`rescuePoint`（z := F(z + 2000)）、`replaceRescueRecord`（ME-06）、`rescueMovementBlock`（chop(F(速度 ÷ +0xB8) × 128)，表外为故障 `rescue.throttle`，ME-17 决定 7）。接线：[destruction.ts](../../../../../src/core/systems/destruction.ts) 的 `expireFragment` 在清除 `followedEntity` 之后、逃生舱待移除之前调用 `'destroyed'`；[mission-flow.ts](../../../../../src/core/systems/mission-flow.ts) 子状态 1 到期在 `flushRadio('beacon-expired')` 之后调用 `'energy'`。[spawn.ts](../../../../../src/core/systems/spawn.ts) 导出 `matrixOf`；`spawn-state.ts` 无需改动（08 已使字段可写）。
- **测试：** [rules/rescue.test.ts](../../../../../src/core/rules/rescue.test.ts)（7 项）：0 个候选不抽取；位 15/17/18 的遍历次序与不过滤状态（停放、待移除、被毁且停靠、新建），非基地种类不计；1–4 个候选的取模原像数（32768；16384×2；10923、10923、10922；8192×4，与 executable.md 记录一致，逐个枚举 0..32767）；z + 2000 的 f32 舍入与 −0 保留；记录只改位置、矩形与锚点；油门的截断、奇数归偶、反向、表两端可用与越出一格即故障。[systems/rescue.test.ts](../../../../../src/core/systems/rescue.test.ts)（13 项）：单次入口的完整字段期望（资源按记录 50 %/40 % 证明完全修理在前、初始化在后；下一次能量时刻与 RNG 终态由独立的 `RandStream` 推导；基地 = 候选[r % 2]；四元姿态逐位；玩家状态除视角与两个限频外不变；其他实体、`ai`、`communications`、段 2 计数、生成状态与 `MissionSetup` 深相等且 setup 冻结；记录进快照且 `snapshotText` 通过）；无基地走全世界缺省（按 `0x68c98` 公式独立推导 x、y 与 3 次抽取）；单基地与 z = −2000 回退；停靠中被毁保持 `docked`；Warp 视角的能量救援恢复保存页，页事件在 `player-rescued` 之前；Warp 中油门越界故障（正式 step）；无玩家实体或无记录故障；slice 形任务（真实 AI 控制器、4 个基地、玩家记录有矩形）中救援不改其他实体、`ai`、通讯与队列，之后照常 20 tick；完整 tick 混合链：被毁（第 1+258 tick 救援 G-02/5，舱下一 tick 移除，子模式 8 保留）→ 耗尽（信标 481 tick 后救援 G-02/6）→ 同一实体再被毁 → 第三次损失在 `fragment-expired` 之后立即锁存（`rescuesUsed` 2、G-02/7 destroyed、计数清 0、状态 ended、生成关闭），之后入口不再生效；`compareReplayResults` 检查锁存前的 ME-13 次序；信标第三次损失紧接 `beacon-expired` 清空、G-02/7 energy、击杀合计；被毁序列中全清：救援后下一 tick `settlement-started`，第三次则失败且无结算；主状态 4/5/0/1 中入口不写任何状态（快照文本相等）；主状态 4 中逃生舱到期无救援无失败；基地与僚机被毁及 3000 tick 长跑不锁存。救援事件的 `weapon-selected` 序列按 BS9 的完全修理遍历逐项期望（两种调用者都发出，ME-18）。
- **受影响的既有测试（按新契约更新）：** [player-loss.test.ts](../../../../../src/core/systems/player-loss.test.ts)（玩家带来源；Warp、停靠等待、信标覆盖与信标到期在跑过到期之后以一次救援结束）、[destruction.test.ts](../../../../../src/core/systems/destruction.test.ts)（舱到期之后救援，玩家 `active`）、[combat-chains.test.ts](../../../../../src/core/systems/combat-chains.test.ts)（“到 P3-11 的交接”改为舱到期救援）、[game-runtime-recording.test.ts](../../../../../src/app/runtime/game-runtime-recording.test.ts)（经批准扩大的范围：共享合成机型记录的 +0xC0 = −2 使耗尽后的玩家加速到 94 > +0xB8 = 64，第 32512 tick 的能量救援落入 ME-17 决定 7 的故障；该测试改用本地 +0xC0 = 2 的玩家记录，循环按 tick 推进并在救援衔接处释放屏障，容量停止断言不变；本次运行出现一次 G-02/6）。
- **检查：** `pnpm exec vitest run src/core/systems src/core/rules`：全部通过；`pnpm check`：346 个文件、10196 项通过，TypeScript、ESLint 与生产构建通过（各一次，未遇超时）。
- **Rubber-duck：** 无阻断问题。采纳：救援事件中 `weapon-selected` 的精确序列（防止 ME-18 的标志回归）；无基地情形的期望改为按公式独立推导，不再调用 `placeRecord`。未采纳：把 `latch` 移出 mission-flow 以打破 mission-flow ↔ rescue 的导入环（两者只在调用时引用，与 pipeline 的既有环同类；移动会改变 10 交接的入口）。**Simplify：** `rescueSubject` 改为具名对象并内含移动块检查；测试改用 `RUNTIME_SCALE`、`RAND_SCALE`；`RescueBase` 不导出。未采纳（越出写入范围或沿用仓库惯例）：油门换算与表中点在 `flight-state.ts` 中的统一（`rebuiltMovementBlock` 夹紧而救援须报故障）、`0x68000` 掩码的共享常量、`ai-parked.ts` 的 `sourceRecord`、共享的测试支撑。
- **文档影响：** `docs/original/` 无新事实（Q-05/Q-11 已由 04 归档；+0xC0 为负只是合成测试数据）。[core.md](../../../../engineering/modules/core.md) 第 770 行（“P3-11 的救援尚未接入”）、第 774 行与约 1010–1027 行的交接段已过时，不在本项写入范围，交 22：救援已接入（`rescue.ts`、`rules/rescue.ts`）、媒体零时长、扇区预算不建模（ME-17 决定 8）与 Warp 中油门越界故障（缺口 G-2）应写入已知差异。
