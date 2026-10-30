---
type: plan
status: active
phase: P3
task: "14"
subtask: "08"
updated: 2026-10-17
---

# 08 — Core 音效所需只读输出

**契约来源：** [spec](../spec.md#共享契约修订p3-02) 的 S-04、S-06、AC-03、AC-05、AC-08、AC-13。
**依赖：** 06。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 实现获批 ThreatWarnings：not-implemented/ready、missileAimed/craftAttacking，读取武器锁定而非 AI 模式；位序号与掩码显式转换。
- 只补 06 批准的活动、状态、真实运动量或事件快照，覆盖无玩家、未就绪、停放/待移除、同帧来源消失和非连续放置。
- 必要的事件/录制结构变更同步校验、比较器、版本/预算与测试替身；纯投影变更不无故升级规则。

## 不包含

- 不实现 AI、地图/停靠规则，不增加播放状态、相机、RNG 抽取或采样内容；不读 DOM。

## 关键文件与契约

- 现有 [combat.ts](../../../../../src/core/projections/combat.ts)、[projection.ts](../../../../../src/core/projections/projection.ts)、[render-state.ts](../../../../../src/core/projections/render-state.ts)及 [domain-events.ts](../../../../../src/core/contracts/domain-events.ts)。
- 现有 core/replay 校验与快照；新增辅助文件如确需由 06 的精确交接清单限定，不建立统一 schema。

## 写入范围

- `src/core/**/*.ts`：保守覆盖只读输出、必要生产点/版本及其受影响测试；不授权其他规则功能。
- `src/app/runtime/*.test*.ts`：必要事件 fixture 同步。
- `src/app/session/*.test*.ts`：必要读模型 fixture 同步。
- `docs/engineering/modules/core.md`：新增 API 与版本说明。
- `src/app/runtime/game-event-bus.ts`：穷举事件表加入 `object-retired`（协调者 2026-10-17 扩展）。
- `src/ui/dev/event-log.ts`、`src/ui/dev/event-log.test.ts`：开发事件日志的穷举字段与夹具（同上）。
- `tools/replay-check.ts`、`tools/replay-check.test.ts`：最长事件表与预算推导中的新事件和 FA-05 字段（同上）。
- `docs/plan/p3/02/spec.md`：仅 CR-06 中 `weapon-selected` 的 `commandIndex: null` 措辞，按 FA-06 更正（同上）。

## 验收标准

- [x] warnings 的目标/武器锁定条件、未就绪/无玩家均正确，输出冻结且脱离内部对象。
- [x] 重复读取不改变世界、RNG、事件与哈希；新增事件带足够快照，不靠当前实体查找。
- [x] 版本、读取器、比较器和旧记录拒绝与获批变化一致；相关测试及 pnpm check 通过。

## 验证方法

- 合成世界的正反边界、连续读取、旧版本与 JSON 往返；先 `pnpm test -- src/core/projections src/core/contracts src/core/replay`，再 `pnpm check`。
- 对本项实现调用 [simplify](../../../../../.agents/skills/simplify/SKILL.md)，范围仅限本项输出与回归；不作浏览器或原版运行验收。

## 完成证据

- **2026-10-17（worker，分支 `exec-p3-14-08`，基线 4ecf47ea）：** 按获批的 [P3-02 FA-01 至 FA-09](../../02/spec.md#p3-14-的契约修订d-01) 实现。工作范围中 S-06 原计划的 `ThreatWarnings`（not-implemented/ready、由表现层采样）已由 D1-02 取代为分区级标志，不另实现。
  - **FA-01：** `communications.warnings`（`ThreatWarnings`）移到分区级，没有玩家实体时照常给出 `tailCheck` 的两项，`player.warnings` 删去。CR-16 的 `isClosingMissileLock` 在 [ai-firing.ts](../../../../../src/core/rules/ai-firing.ts)。`checkTail`（[comm-reactions.ts](../../../../../src/core/systems/comm-reactions.ts)）先做种类位 7–10 的攻击者遍历，与雷达无关地调用 `warnTail`，再按 s = 0/1/≥2 置两项，任一为真时到期 +0x40。视角集合 `TAIL_CHECK_VIEW_MODES`（1、6、8、0xC–0x12，[rules/displays.ts](../../../../../src/core/rules/displays.ts)）从驾驶舱显示步分出，帧尾位置不变。
    - 测试：comm-reactions.test.ts 覆盖种类位 6/7/10/11、停放与停靠、状态 6/7/8、目标、等级 2/3/4、无死亡标志检查、升序取第一个（以对齐门控观察所选者）、s = 0/1/2/3 与 `0x38c30` 的副作用、到期的等号与无玩家时的保持。displays.test.ts 覆盖视角 1、6、8、0xC–0x12 检查，0、2、3、0xB、0x13 不检查。communications.test.ts 覆盖“标志为真 → 玩家实体消失 → 再出现”时读数不变，以及冻结与脱离。
    - 正式 replay：[tail-warning-replay.test.ts](../../../../../src/core/replay/tail-warning-replay.test.ts) 的录制只含正常 `TickInput`。CR-16 的 AI 锁定更新把合成敌机的等级推进 0 → 2 → 3 → 4；首个见到等级 3 的检查点亮 `attackerOnTail`（projection 同值）；僚机在同一 tick 以 20985 线 0xA 警告，`limits.tailWarning` 盖戳。JSON 往返后 `replayRecord` 与比较器一致。
  - **FA-02/03/04：** `CombatTarget.activeState` 逐个 `ObjectState` 测试，冻结且与世界脱离。`MotionPlayer.recordMaximumSpeed` 等于机型 +0xB8，能量降低 +0x78 时不变。`RenderEntity.state/speed` 覆盖各状态与 `craft`/`warp`/`linear`/`spinning`/`marker` 各块模式；停放的实体不列出，缺块为 `render-state.movement` 故障，输出冻结并脱离。这些是纯投影，不递增版本。
  - **FA-05：** `shot-fired` 的 `shooterForward`/`shooterSpeed`、`hit` 的 `victimForward`/`victimSpeed` 在发出时取第 3 行与块速度，停放交战的受害者为 null。compare.ts 的字段表与读取器按 `F32` 校验，速度可为 null。compare.test.ts 覆盖差异检出，以及非 f32、非有限、缺失与错类型的拒绝。launch、damage、projectiles、parked-engagement、combat-chains 的逐字段期望与 combat-replay.test.ts 的正式录制都含新字段。
  - **FA-06：** 按协调者批准的范围更正 `commandIndex: null` 的语义：domain-events.ts 注释、Core 模块说明与 P3-02 spec CR-06 一行。行为与版本不变。
  - **FA-07：** 新增 `object-retired` 与共享写入函数 `retire`（[object-state.ts](../../../../../src/core/systems/object-state.ts)）。它取代以下直接赋值：区域检查、AI 的 Warp 离场、爆炸结束、动画结束放开所持来源、`release-held`、交出来源、碎片到期、导弹熄火、弹丸移除、伤害直接移除与停放离开世界，以及写入这两态的 `set-state`。
    - 逐处核对 [audio A-01](../../../../original/formats/audio.md#presentation-item-dispatch-a-01) 与 executable 的投递者，以下写入处都对应：区域检查（`0x3a4b0`）、Warp 离场（`0x214cb`）、爆炸结束与所持来源（`0x2409c` → `0x21650`）、消息 0x40（`0x24424` → `0x21650`）、交出来源（`0x2574c` → `0x21650`）、导弹熄火（`0x2b590`/`0x21650`）与弹丸移除（`0x25f48` → `0x21650`）。伤害直接移除与离开世界只作用于停放对象；原版 `0x21650` 只为活动 1 投递，Core 也不发。没有发现须修订 FA-07 的不对应。
    - 测试：object-state.test.ts 覆盖区域切换后待移除发两个、重写不发、停放与停靠不发、所有种类都发。各路径所在的测试断言恰一个及其次序：area，destruction（结束、放开、交出、碎片），missiles，projectiles，pipeline 的 `set-state`，combat-chains。budget.test.ts 在实体上限下得到 2,047 个。compare.test.ts 覆盖读取、差异，以及“每实体每状态至多一个、区域切换不在待移除之后”的拒绝；combat-replay.test.ts 覆盖正式录制。
  - **FA-08：** `RULES_VERSION` 7 → 8。replay.test.ts 拒绝规则版本 7 的记录，snapshot.test.ts 与 map-warp-replay.test.ts 的版本断言已更新。快照格式 6、replay 格式 3 与 `CORE_LIMITS` 不变；limits.ts 的 `eventsPerTick`（合计 13,160）与 `recordedEvents` 注释已更新。经批准扩展的范围：game-event-bus.ts 的事件类型表、event-log.ts 的摘要与 tools/replay-check.ts 的最长事件。
  - **读取不改变世界：** 各投影测试断言冻结与脱离。comm-reactions.test.ts 与 combat-replay.test.ts 既有的同类断言通过：读与不读 projection、Render State、快照时，事件、RNG 与状态都相同。
  - **检查：** 目标测试 `vitest run src/core` 通过。`pnpm check`（typecheck、lint、341 个文件 10,085 个测试、生产构建）通过；simplify 之后重跑 typecheck、lint 与 `src/core` 测试也通过。
  - **rubber-duck：** 没有阻塞问题或遗漏的写入处。唯一的非阻塞项是 core.md 中一处旧的规则版本 7，已改为“当时为 7，P3-14 之后为 8”。
  - **simplify：** 已采纳三项：
    - 共享的 `isRetiredState` 守卫供 `set-state` 使用；
    - 尾随警告的两个遍历复用 `isReady`；
    - 尾随警告视角集合移到 `COCKPIT_DISPLAY_VIEW_MODES` 旁。

    未采纳：
    - 为两处位姿快照加辅助函数，收益小；
    - 测试辅助函数去重，涉及他人的测试文件；
    - 无玩家时复用冻结的单例，分配可忽略；
    - 把 `isClosingMissileLock` 移出 ai-firing.ts，它是 CR-16 定义的 P3-08 查询；
    - 改动 `emit` 的导入环，它是既有模式。
  - **文档影响：** [Core 模块说明](../../../../engineering/modules/core.md)已更新以下各节：事件、`frame-end`、通讯反应、Warp 离场、projection 与 Render State、版本、上限、已知差异（撤销 CB-17 决定 11 中的差异部分），以及交接（攻击者遍历已接入；P3-14 读模型及给 P3-11、P3-13 的交接）。没有新增原版事实，unknowns 不变；STATUS 与阶段 `tasks.md` 无需改动。

