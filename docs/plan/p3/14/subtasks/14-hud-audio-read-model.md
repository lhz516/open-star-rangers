---
type: plan
status: active
phase: P3
task: "14"
subtask: "14"
updated: 2026-10-28
---

# 14 — 声音侧锁定音与 9 型警告音状态

**契约来源：** [spec](../spec.md#锁定提示音与-9-型仪表警告音) 的 S-06、AC-07、AC-08、AC-14；[D-02 定稿](../spec.md#d-02-定稿已批准)的 DW-04 第 1、4 步、DW-10、D2-11、D2-12。
**依赖：** 07, 08。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 在 `src/app/flight-audio/hud-cues.ts` 实现声音侧的锁定音（A-06）与 9 型警告音（A-07）状态，每个运行一个实例，从初值开始（上一值 −1、到期 0、句柄为空；D2-12）。
- 每个 tick 只推进一次，只读同 tick `TickOutput` 的 `clock` 与 `projection`：`player.viewMode`/`subMode`、`flight.combat.player` 的 `lock.progress`、`target` 与 `activeState`、`communications.warnings { missileIncoming, attackerOnTail }`；`view-switched` 进入视角 1 时以 −1 调用锁定音（DW-04 第 1 步）。不抽随机数，不读宿主时间，不另行采样或遍历攻击者。
- 视角门禁照 DW-10：锁定音只在 0xC 与 0x11/8 且有战斗玩家时调用；9 型在 1、6、8、0xC、0x11 调用，0x13 不调用。`not-implemented` 分区是契约错误，不当作“无威胁”。
- 声部经 12 的 `VoiceLedger`（`play`、`stop`、`query`，源 `{ namespace: 'cue', cue }`）开始与停止：锁定音类别 4 抢占；9 型类别 4 不抢占，导弹声部优先（速率 22,000 Hz、音量 127），机体声部音量 50；参数在开始前给定。
- 恢复照 D1-08 (c)：游戏内原因结束的句柄保留、条件不变不重建；项目特有中断（`interrupted`，或以 `audio-locked`/`audio-suspended`/`audio-unavailable`/`audio-paused` 拒绝后转为可用）后重建当前应持续的循环，脉冲不补发。

## 不包含

- 不绘制、不读取或推进 P3-13 驾驶舱的任何状态（P3-13 DD-01 至 DD-06：没有共享模型）；不在 `src/render/` 新增文件，render 不导入 app；不把计时或随机放进 Core；不决定分派次序（16）。

## 关键文件与契约

- 现有 [Projection](../../../../../src/core/projections/projection.ts)（`lock`、`CombatTarget.activeState`、`ThreatWarnings`、`docking`）、[voices.ts](../../../../../src/app/flight-audio/voices.ts) 的 `VoiceLedger` 与 `VoiceEndReason`。
- 新增 `src/app/flight-audio/hud-cues.ts`、`hud-cues.test.ts`；16 在每个 tick 的分派之后调用它（DW-04 第 4 步）。

## 写入范围

- `src/app/flight-audio/hud-cues.ts`：声音侧的锁定音与 9 型警告音状态。
- `src/app/flight-audio/hud-cues.test.ts`：状态、时钟、视角门禁、恢复与复位测试。

## 验收标准

- [ ] A-06 的 −1/0/正值变化与保持、目标失效、到期严格比较与 (值 >> 1) 间隔、进入 Warp 停止、视角冻结正确；A-07 的双标志优先级、替换、清除与失败重试正确。
- [ ] 每个 tick 只推进一次、重复调用同一 tick 不推进；零 tick/静止帧不推进；不抽随机数；游戏内结束不重建、项目特有中断后只重建循环；新运行从初值开始。
- [ ] 不导入 render/ui，不读驾驶舱状态；声音关闭或账本拒绝不改变 projection 读数；纯模块在 Node 程序中且边界检查通过。

## 验证方法

- 合成 projection 序列与假账本（含 `interrupted` 与各拒绝码）；`pnpm test -- src/app/flight-audio/hud-cues.test.ts tools/engineering-boundaries.test.ts`、`pnpm check`。
- 对本模块调用 [simplify](../../../../../.agents/skills/simplify/SKILL.md)；与驾驶舱各自读取的真实链核对归 20。

## 完成证据
