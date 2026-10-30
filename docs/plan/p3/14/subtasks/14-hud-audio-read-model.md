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

- [x] A-06 的 −1/0/正值变化与保持、目标失效、到期严格比较与 (值 >> 1) 间隔、进入 Warp 停止、视角冻结正确；A-07 的双标志优先级、替换、清除与失败重试正确。
- [x] 每个 tick 只推进一次、重复调用同一 tick 不推进；零 tick/静止帧不推进；不抽随机数；游戏内结束不重建、项目特有中断后只重建循环；新运行从初值开始。
- [x] 不导入 render/ui，不读驾驶舱状态；声音关闭或账本拒绝不改变 projection 读数；纯模块在 Node 程序中且边界检查通过。

## 验证方法

- 合成 projection 序列与假账本（含 `interrupted` 与各拒绝码）；`pnpm test -- src/app/flight-audio/hud-cues.test.ts tools/engineering-boundaries.test.ts`、`pnpm check`。
- 对本模块调用 [simplify](../../../../../.agents/skills/simplify/SKILL.md)；与驾驶舱各自读取的真实链核对归 20。

## 完成证据

- **实现：** [hud-cues.ts](../../../../../src/app/flight-audio/hud-cues.ts) 的 `createHudCues(ledger)` 每个运行一个实例（上一值 −1、到期 0、句柄为空）。`beforeDispatch(output)` 是 DW-04 第 1 步：本 tick 每个进入视角 1 的 `view-switched` 以 −1 调用锁定音。`afterDispatch(output)` 是第 4 步：先锁定音（视角 0xC，或 0x11 且子模式 8，并有战斗玩家；值为 `target?.activeState ? lock.progress : −1`），再 9 型（视角 1、6、8、0xC、0x11）。只读 `projection.clock.clock`、`player.viewMode/subMode`、`flight.combat.player`、`communications.warnings`；在读取处遇到 `not-implemented` 抛出契约错误。同一 tick 的重复调用是无操作；tick 倒退，或缺少同 tick 的第 1 步，抛出。声部经 `VoiceLedger` 的 `play`、`stop`、`query`，源为 `{ namespace: 'cue', cue }`，声音为 `sound/hud/overlay-loop`、`overlay-pulse`、`instrument-9-loop`。
  - 锁定音照 A-06 的四条：值不变时无操作；变为 −1 时停止并清除两个句柄；变为 0 时停止脉冲，覆盖循环句柄（不停止旧循环）；变为正值且到期 < 时钟（严格）时停止循环，覆盖脉冲句柄，到期 := 时钟 + (值 >> 1)，开始失败也设置。
  - 9 型照 A-07 的语句次序：导弹声部开始（先停止并清除机体声部，速率 22,000、音量 127）或清除；然后机体声部开始（两句柄都空，音量 50）或清除。开始失败或被拒绝时句柄留空，下一次调用重试。
  - 恢复照 D1-08 (c)：只有条件仍成立的循环句柄才查询；结束原因为 `interrupted` 时于本次调用重建。锁定循环的开始被 `audio-locked`、`audio-suspended`、`audio-unavailable` 或 `audio-paused` 拒绝时，在值保持 0 期间每次调用重试，直到成功或以其他码失败。脉冲不查询，也不补发。
  - 账本没有可用性探测，所以重试每次调用都发生。被拒绝的抢占请求只在第一次释放类别 4 的记录，此后类别低于上限，不再抢占。
- **验证：**
  - `pnpm vitest run src/app/flight-audio/hud-cues.test.ts tools/engineering-boundaries.test.ts`：2 个文件 134 个用例全部通过（hud-cues 28 个）。
  - 合成 projection（深冻结）与脚本化假账本覆盖下列行为：四条转移；严格到期与 (值 >> 1)；保持值不发声；`activeState` 为假读作 −1；未跟踪的第二个循环；失败的脉冲仍设置到期；Warp 切换的 −1 与视角 1、6、8、0x13 中的冻结；被毁视角只在子模式 8；双标志优先级与同次接替；失败与拒绝的重试；视角门禁；锁定音先于 9 型；同一 tick 重复调用无操作，乱序抛出；`not-implemented` 只在读取处报错；`Math.random`、`Date.now`、`performance.now` 都未被调用；新运行从初值开始；游戏内结束（`natural`、`preempted`、`stopped`、`failed` 与 `stopAll`）不重建；`interrupted` 只重建循环；四个拒绝码重试，其他码不重试。
  - 用真实账本与平台假控制器另验两点：隐藏与恢复后重建条件仍成立的 9 型循环，而 `stopAll` 已结束的锁定循环保持静默；控制器解锁后，锁定循环在下一个 tick 开始。
  - 第 3 项验收：模块只导入 content、core 类型与常量、platform 类型、runtime 类型和 `voices.ts`，不导入 render、ui 或驾驶舱。冻结输入未被写入，账本拒绝不抛出。测试文件经 `tsconfig.node.json` 把本模块纳入 Node 程序。`pnpm typecheck`、ESLint 与 `pnpm check` 都通过。
- **审阅：** rubber-duck 审阅完整的子任务 diff，没有发现阻塞、非阻塞或建议项。它指出零 tick 帧与分派位置的端到端覆盖属于 16 的接线。
- **simplify：** 视角常量改用 Core 的 `WARP_VIEW_MODE`、`BASE_VIEW_MODE`、`MAP_VIEW_MODE`、`COCKPIT_VIEW_MODE`。加入 `#release`（停止并清除）与 `cueRequest`，并改名为 `lockToneValue`。三项未做：
  - 被毁视角常量：只在 render 中导出，app 不能导入 render；
  - 测试的 `deepFreeze`：没有共享导出；
  - 把中断重建移入 `voices.ts`：超出写入范围。
- **文档影响：** `docs/engineering/` 与 `docs/guides/` 都不引用 `app/flight-audio`。原版事实没有新增，A-06、A-07 已入档，不需要更新。
