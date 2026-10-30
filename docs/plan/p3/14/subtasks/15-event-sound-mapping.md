---
type: plan
status: active
phase: P3
task: "14"
subtask: "15"
updated: 2026-10-28
---

# 15 — 类型化事件到声音意图

**契约来源：** [spec](../spec.md#触发表) 的 S-02、S-04、S-07、AC-02、AC-03、AC-09。
**依赖：** 07, 08, 09。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 对每个现有 DomainEvent 明确分类为声音触发、生命周期/效果输入或不发声；炮/导弹按 family，受击按盾前态，parked 无受击音。
- 用静态机型绑定与事件位置快照解析，支持同帧来源消失；changed=false 的武器选择和自动选目标按合同处理。
- 保留 tick/发出序号与来源，commandId=null 不作去重键；独立事件不按 Asset 合并。
- 依 D-01/D-02 为上游已存在的输出接线，尚未交付者只记录 19 的前提，不发明生产事件或成功型占位。

## 不包含

- 不播放、不管理句柄或投递新 Core 命令；连续状态与事件缓冲归 16。

## 关键文件与契约

- 现有 [domain-events.ts](../../../../../src/core/contracts/domain-events.ts)、[GameEventBus](../../../../../src/app/runtime/game-event-bus.ts)以及 09 内容绑定。
- 计划新增 `src/app/flight-audio/events.ts`、`events.test.ts`。

## 写入范围

- `src/app/flight-audio/events.ts`：纯事件解释。
- `src/app/flight-audio/events.test.ts`：完整分类与快照测试。

## 验收标准

- [x] 每个变体有显式处理，失败命令不制造成功音，hit/gated/parked 和选择未改变都正确。
- [x] 槽为空与坏引用有不同结果，来源消失不漏掉合法事件。
- [x] 同 tick 多事件的顺序和重复独立性保留；未接上的上游事件没有伪造通过。

## 验证方法

- 合成内容与合法事件，辅以正式 Core 产生的战斗事件；`pnpm test -- src/app/flight-audio/events.test.ts`、`pnpm check`。
- 对本项调用 [simplify](../../../../../.agents/skills/simplify/SKILL.md)；真实上游闭环归 19。

## 完成证据

- **实现：** [events.ts](../../../../../src/app/flight-audio/events.ts) 的 `readEventSound(content, event, index)` 与 `readTickEventSounds(content, { tick, events })`。分类表 `READINGS` 以 `{ [Type in DomainEventType]: … }` 声明，53 个变体逐一列出，没有默认分支；新增变体在补上分类前不能编译。每项是冻结的 `{ action, tick, index, event, … }`，保留原事件对象、tick 与发出序号，不读 `commandId`；相同的两个事件得到两项。
  - `by-id`（类型 2，类别 4，抢占）：`target-changed`（两种 `origin`）、`weapon-selected`（`changed` 为假、`commandIndex` 为 null 都播）、`energy-allocation-changed`、`left-page-changed`（仅 `commandIndex` 非 null）、`warp-destination-set`、`warp-started`、`warp-completed`（仅 `arrival?.hostileNear`）、`base-navigated`、`base-confirmed`、`transponder-deployed`。声音为 `EVENT_SOUNDS` 中 P3-03 的九个 Asset ID。
  - `shot`：`family` 为 gun 时发射者槽 1、类型 8，missile 时槽 2、类型 4，类别 1，抢占。`hit`：受害者槽 4（`shieldWasEmpty`）或槽 3，类型 4，类别 2，抢占；`gated` 照常，`cause: 'parked'` 为 `silent`/`parked`。声音按事件的 kind bit 经 `craftSounds` 静态解析，与 Render State 无关，来源已离开也能解析；位置等读数留在 `event` 中，供 16 经 `shotReading`/`hitReading` 按 DW-05 选择。
  - 空槽是 `sound: null`（合法无声，A-02 的状态 2）；机型表未绑定的 kind 抛 `FlightSoundEventError`（`unbound-kind`），不当作无声。
  - `retire`（`object-retired`）：`dispatchTypeOfKind` 按 A-01 的 `0x21fffff` 给类型 4、`0x1600000` 给类型 8；`stopsVoices` 在 kind 属 `0x3300000` 时为假（DW-07）；两个掩码以外的 kind 没有移除项（`dispatch: null`，只丢弃声音表项）。`leave`（`object-left-world`）只丢弃表项。
  - `stop-all`：`docked`、`departed`、`player-rescued`、`result-latched`、`teardown-started`；`readTickEventSounds` 的 `stopAll` 表示本 tick 在任何声音之前全部停止一次（DW-09），停止事件排在声音之后发出时也如此。`presentation`：`explosion-started`、`explosion-created`。`hud-input`：进入视角 1 的 `view-switched`（其他切换为 `silent`/`condition`）。`incoming-started` 为 `silent`/`out-of-slice`（D1-09）。其余为 `silent`/`no-sound`，包括 `command-result`（失败命令不制造成功音）与 `object-destroyed`。
  - 事件 tick 与输出 tick 不符时抛 `tick-mismatch`。DW-04 的排序、停靠门禁、更新项、账本与参数归 16；本模块不播放、不保存状态。P3-08 至 P3-11 的事件都已在 Core 中，没有为未交付的上游发明事件；其生产路径与原版的一致性由 19 核对。
- **验证：**
  - `pnpm exec vitest run src/app/flight-audio/events.test.ts tools/engineering-boundaries.test.ts`：2 个文件 127 个用例全部通过（events 21 个）。
  - 合成内容（`content.test-support.ts`）与合成事件：DW-06 全表（编译期覆盖全部变体）；九个 Asset ID 的字面值；by-ID 的类别与抢占；条件分支（页面无命令、无敌到达、非 Warp 切换、失败命令）；炮/导弹的槽与类型；受击按盾前态、`gated`、四种原因与 parked；空槽与未绑定 kind 的区别；32 个 kind 的派发类型与 `RangeError`；移除的停止与不停止；同 tick 次序、重复独立、`commandId` 不影响结果、救援 tick 先停止后播放、tick 不符报错、结果深冻结且持有原事件。
  - 正式 Core：以合成战斗任务（同 `combat-replay.test.ts`，种子 12）`createWorld().step()` 120 个 tick，每 tick 的事件全部读出且数量相等；玩家的炮（类型 8 槽 1）与导弹（类型 4 槽 2）；对 kind 0、7 的受击按盾前态取槽；同一批 Core 受击换用空受击槽的包时为 `sound: null`；爆炸（kind 22）的移除为类型 8 且停止，炮弹（kind 21）的移除不停止；第 10、50、52 tick 的选目标、按键与选武器 by-ID 项。
  - `pnpm check`（typecheck、ESLint、Vitest、build）通过。
- **审阅：** rubber-duck 指出两项，均已处理：两个掩码以外的 kind 的 `object-retired` 原先抛出契约错误，改为没有移除项、只丢弃表项；测试原先用实现的 `EVENT_SOUNDS` 生成期望，补了字面 Asset ID 的断言。
- **simplify：** 统一为一个 `silent(reason)` 构造；测试改用 Core 的 kind bit 常量。未做：掩码改由 kind 常量拼出或复用 `RADAR_KINDS`（掩码是 A-01 记录的原版值，雷达掩码含义不同）；复用 `core/rules/radio.ts` 的 `hasKind`（为一行位测试引入规则模块依赖）；共享错误基类与 `EventOf` 别名（超出写入范围）；每事件的对象分配（量级小）。
- **文档影响：** `docs/engineering/` 与 `docs/guides/` 都不引用 `app/flight-audio`；flight-audio 的 app 分册一节已按 goal 执行记录交 27，建议加入 `events.ts` 的 `readTickEventSounds`、`dispatchTypeOfKind` 与 `EVENT_SOUNDS`。原版事实没有新增（A-01、A-02、A-10 已入档），不需要更新 audio 或 unknowns。
