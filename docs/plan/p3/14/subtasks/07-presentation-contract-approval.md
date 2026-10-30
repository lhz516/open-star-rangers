---
type: plan
status: active
phase: P3
task: "14"
subtask: "07"
updated: 2026-10-28
---

# 07 — D-02 表现接口与模式矩阵定稿

**契约来源：** [spec](../spec.md#需要-p3-12-提供的只读接口) 的 S-05、S-06、S-07、S-08、AC-09、AC-10、AC-14，D-02。
**依赖：** 06。
**执行方式：** 需用户：批准涉及已批准合同的具体接线修订；由 agent 先完成接口对齐。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 与 P3-12 明确相机时间点、坐标单位/投影失败、模式中保留或停止、EXPL 原列表索引、激活事实/持续列表、效果键与预算。
- 与 P3-13 明确锁定音、警告音与相应绘制的输入（D-02 修订，2026-10-28：P3-13 DD-01 证明没有共同状态，不建共享 HUD 模型，双方各自读同 tick projection）；音频和绘制不互相导入或各取 RNG。
- 与 P3-09/10/11 明确地图/停靠组合、Warp、衔接保持、救援、结果页的门禁，以及事件时和帧末状态的读取边界。
- 记录实际文件、函数和构造参数的交接清单，供 13–20 使用。其他 spec 尚未由其负责项创建时，等待对应接口，不创建其他任务的新合同。

## 不包含

- 不实现 P3-12 的选择器/相机或 P3-13 绘制，不改变阶段 tasks 依赖，不授权省略基地音效。

## 关键文件与契约

- 现有 [P3-02 CR-11](../../02/spec.md#cr-11-表现层的归属与已批准的差异d-01)、[P3-04](../../04/spec.md)。
- P3-09 至 P3-13 的 spec/生产接口是外部前提，当前未存在；实际落点须先由负责项交付。

## 写入范围

- `docs/plan/p3/14/spec.md`：D-02 精确合同。
- `docs/plan/p3/04/spec.md`：必要控制边界同步。
- `docs/plan/p3/09/spec.md`：仅负责项已创建后的相关输出同步。
- `docs/plan/p3/10/spec.md`：仅负责项已创建后的相关输出同步。
- `docs/plan/p3/11/spec.md`：仅负责项已创建后的相关输出同步。
- `docs/plan/p3/12/spec.md`：仅负责项已创建后的相机/效果交接。
- `docs/plan/p3/13/spec.md`：仅负责项已创建后的 HUD 交接。

## 验收标准

- [x] 同次 EXPL、瞬时激活和持续状态、共享 HUD、模式矩阵、时间点与错误都有唯一合同。
- [x] 所需跨任务接口实际有已批准定义，未以目录规划假装存在；实质修订取得明确批准。
- [x] 生产文件落点与 13–20 的写入范围已由协调者核对，无第二循环或规则回写。

## 验证方法

- 合同与负责项实际类型/测试双向核对，检查相对链接和 metadata；只定稿接口，不替身验收真实集成。

## 完成证据

2026-10-28。只写合同与计划文档，没有改代码、没有提交，也没有运行 DOSBox-X 或原版游戏。P3-11、P3-12、P3-13 的已批准 spec 与实现都已随合并提交 `a8c9008b` 在本分支上，D-02 依实际代码定稿。

### 写入的章节

| 文件 | 内容 |
|---|---|
| [P3-14 spec](../spec.md#d-02-定稿已批准) | 新增“D-02 定稿（已批准）”：DW-01 至 DW-13 的接线合同、D2-01 至 D2-17 的决定表与“被本节修订的前文”；前文各处标“D-02 修订，2026-10-28”（涉及模块两行，S-05，S-06，触发表“9 型仪表提示”，发声类别三条，逐对象声音表一条，听者，“共享呈现”改为“各自读同一输入”，模式与生命周期表三行，需要 P3-12 提供的只读接口的引言，技术决定 3、4、8，实施关卡 D-02 一行，AC-05、AC-07、AC-14，验证策略目录，风险一条）；D-01 定稿末的“交 07”加指向；审批新增 D-02 记录；`updated` |
| [P3-04 spec](../../04/spec.md#任务音频接线p3-14-的修订) | “任务音频接线”末尾加“D-02 补充”：登记次序与 `presentation()`、只读 `outputs` 与 `PresentationTick` 并按 tick 配对、`completed` 的失效、运行中保持；审批新增同步批准记录 |
| [P3-12 spec](../../12/spec.md#表现层契约计划新增) | “表现层契约”加“P3-14 的增补”一条（DW-02）；审批新增交接记录；`updated` |
| [P3-13 spec](../../13/spec.md#与-p3-14-的关系) | “与 P3-14 的关系”加“P3-14 D-02 的对齐”一段；审批新增说明记录 |

P3-09、P3-10、P3-11 的 spec 没有修改：D-02 用到的它们的输出（`warp-destination-set`、`warp-started`、`warp-completed.arrival.hostileNear`、`left-page-changed.commandIndex`、`base-navigated`、`base-confirmed`、`docked`、`departed`、`transponder-deployed`、`player-rescued`、`result-latched.result.reason`、`teardown-started`、`object-retired`、`mission-completed`、会话的 `completed`）都已在已批准的 P3-02 修订与 P3-04 修订中定义。

### 决定与批准依据

决定的选项与理由见 [spec 的决定表](../spec.md#决定)，此处只列结论。批准依据是用户 2026-10-28 在执行本 goal 时的授权，原话：“在执行goal的过程中，如果需要修改spec或其他Decision，我都批准你修改。用任何方式来unblock任何问题，完成这个goal。”协调者据此批准，记录在各 spec 的审批节。

| ID | 选择 | 差异 |
|---|---|---|
| D2-01 | 飞行消费者暴露 `presentation()`，音效媒体消费者排在其后取得 | 否 |
| D2-02 | 按 tick 配对两条输入，不依赖帧消费者的调用次序 | 否 |
| D2-03 | 每个 tick 当作一个原版帧处理（D1-04 的差异随之不再出现） | 否 |
| D2-04 | 听者在所有视角都是 `afterStep`（05 (c) 8）；原版 Warp 中读上一遍相机的一帧滞后不复现（审阅后更正） | 是（小差异） |
| D2-05 | 增补表现接口：`PresentationExplosion.forward`、`speed` 与 `PresentationTick.explosions` | 否 |
| D2-06 | 爆炸存活期内照 A-02 重放（05 (c) 4） | 否 |
| D2-07 | 移除：Core 用 `object-retired`，表现层用离开 `explosions` | 否 |
| D2-08 | 53 个事件变体的完整分类（含 `explosion-created`、`view-switched`、`warp-wall-contact`） | 否 |
| D2-09 | 存活规则 (a)–(d) 的映射：tick 内先全部停止、再处理全部声音（05 (c) 5） | 否 |
| D2-10 | 分派次序：类型 2、4、8，事件项先于更新项，Core 爆炸先于表现层爆炸 | 是（沿用 FS-10 决定 8） |
| D2-11 | 声音侧提示状态在 `app/flight-audio/hud-cues.ts`，分派后先锁定音再 9 型 | 否（先后未确认） |
| D2-12 | HUD 状态每运行复位 | 是 |
| D2-13 | 运行中保持时截断 tick 的声音照常开始并在占位期间继续 | 是 |
| D2-14 | 会话 `completed` 时全部停止并失效 | 否 |
| D2-15 | 停靠门禁读同 tick 的 `docking.docked` | 否 |
| D2-16 | 被毁视角中玩家引擎照机制继续：经批准的暂定选择，相关验收在 R-13 证实或修订前不完成 | 暂定（待 R-13） |
| D2-17 | 项目特有中断对声音表等同原版的全部停止 | 否 |

### 接口核对（合同项与 main 上的实现）

| 合同项 | 实现位置 | 结论 |
|---|---|---|
| `PresentationTick { ownerId, runId, tick, clock, beforeStep, afterStep, activations }`，`PresentationCamera` 的行与视口（逻辑像素、含端点） | [presentation-contract.ts](../../../../../src/render/flight/presentation/presentation-contract.ts) 第 34、47、67–76 行 | 一致；`explosions`、`forward`、`speed` 尚无，由 DW-02 增补（20） |
| `subscribe` 只通知此后的 tick；`camera()`、`explosions()` 无副作用 | [flight-presentation.ts](../../../../../src/render/flight/presentation/flight-presentation.ts) 第 151–168 行；整批后通知（第 183 行） | 一致；晚接不重播 |
| Core 爆炸选择保留到离开 Render State；Core 激活先于表现层激活 | 同文件第 219–232 行（`#step`、`#settleCore`） | 一致（FS-10 决定 8） |
| 表现层爆炸在原版移除项的 tick 结束 | [presentation-effects.ts](../../../../../src/render/flight/presentation/effects/presentation-effects.ts) 第 407–409 行（`#leave` 调用 `end`）与区域检查第 437 行 | 一致，DW-07 以离开 `explosions` 为移除 |
| 每个 tick 推进一次并通知，静止帧不推进；返回 `presentation` | [flight-run.ts](../../../../../src/render/flight/renderer/flight-run.ts) 第 118、154–164、188 行 | 一致；`afterStep` 在 6、8、0x13 为座机位姿（P3-12 render 分册） |
| 飞行消费者丢弃 `presentation`，只保存 `cockpit` | [flight-consumer.ts](../../../../../src/app/mission/flight-consumer.ts) 第 91–118 行 | 需新增 `presentation()`（17） |
| `attachRun` 按连接列表次序调用；装配的消费者列表 | [mission-owner.ts](../../../../../src/app/mission/mission-owner.ts) 第 687 行；[use-mission-owner.ts](../../../../../src/app/composition/use-mission-owner.ts) 第 168、171 行 | 一致；音效消费者插在飞行消费者之后（18） |
| 会话帧带 `report.outputs`，在帧的领域派发之后 | [game-session.ts](../../../../../src/app/session/game-session.ts) 第 127–141、368、813 行；`MAX_TICKS_PER_FRAME` = 5（[game-runtime.ts](../../../../../src/app/runtime/game-runtime.ts) 第 164 行） | 一致 |
| Render State 的 `display`、`state`、`speed` | [render-state.ts](../../../../../src/core/projections/render-state.ts) 第 53–57 行 | 一致（FS-01、FA-04） |
| `lock.progress`、`target.activeState`、`recordMaximumSpeed`、`docking.docked`、`communications.warnings` | [projection.ts](../../../../../src/core/projections/projection.ts) 第 119、172、222、420、438 行 | 一致（FA-01 至 FA-03、FA-07） |
| `explosion-created`、`view-switched`、`warp-wall-contact`、`object-retired` | [domain-events.ts](../../../../../src/core/contracts/domain-events.ts) 第 704、722、732、746 行；联合共 53 个变体 | DW-06 逐一分类 |
| 内容绑定与账本 | [content.ts](../../../../../src/app/flight-audio/content.ts) 的 `craftSounds`（第 182 行）、`explosionSound`（第 191 行）；[voices.ts](../../../../../src/app/flight-audio/voices.ts) 的 `VoiceSource`（第 32 行）、`createVoiceLedger`（第 303 行）、`stopAll` | 一致；Core 爆炸用 `entity` 槽 0，表现层爆炸用 `effect` 键，HUD 用 `cue` |
| 控制器的暂停门禁 | [audio-controller.ts](../../../../../src/platform/audio/audio-controller.ts) 第 159–164 行；暂停中 `play` 以 `audio-paused` 拒绝 | 一致；运行中保持不能用暂停门禁推迟声音（D2-13 的理由） |
| 表现预算 | [presentation-budget.ts](../../../../../src/render/flight/presentation/presentation-budget.ts) 第 38–39 行 | 一致（DW-03） |

### 交接给 13–23

每项只列它要用的现有接口与 D-02 的落点；函数名是落点建议，签名以 DW 条目为准。

- **13 `parameters.ts`：** 输入为 DW-05：听者 `PresentationCamera`（`position`、`rows`），即 `PresentationTick.afterStep`（所有视角，D2-04）；听者速度 `motion.player.speed`；来源 `{ position, forward, speed }`（Render State 实体的 `orientation` 下标 6–8 与 `speed`，或 FA-05 快照，或 DW-02 的表现层爆炸）；玩家 `commandedSpeed`、`recordMaximumSpeed`。输出在 `start()` 前可用的 `{ volume, pan, rate }`，跳过速率时保留原值（D1-06）。可以 `import type` P3-12 的 `PresentationCamera`。
- **14 `hud-cues.ts`：** DW-10。每个 tick 的输入：`TickOutput.clock`、`projection.player.{viewMode, subMode}`、`flight.combat.player.{lock.progress, target, target.activeState}`、`communications.warnings.{missileIncoming, attackerOnTail}`，以及 DW-04 第 1 步的 `view-switched` 进入 1。声部经 `createVoiceLedger({ controller, ownerId, runId })` 所得账本的 `play`、`stop`、`query`，源为 `{ namespace: 'cue', cue }`。每运行一个实例，从初值开始。
- **15 `events.ts`：** DW-06 的全表（53 个变体，无默认分支）与 DW-09 的停止事件；`left-page-changed` 以 `commandIndex` 非 null 为条件，`warp-completed` 以 `arrival?.hostileNear` 为条件，`hit.cause === 'parked'` 不发声。声音由 `craftSounds(content, kindBit)` 的 `soundSlots` 与 `explosionSound(content, selection)` 解析。
- **16 `consumer.ts`：** DW-03 的配对与核对、DW-04 的次序、DW-07 的移除、DW-08 的爆炸、DW-11 的运行级部分。经 `run.onFrame` 读 `frame.report?.outputs`，经 `presentation.subscribe` 读 `PresentationTick`，撤销交给 `run.ownCleanup`。以结构类型声明所需的 `PresentationTick`（含 `explosions`、`forward`、`speed`），测试用合成值，20 之后传入实际类型。
- **17 `owner.ts`：** P3-04“任务音频接线”加“D-02 补充”。`media` 消费者的选项加 `presentation: () => FlightPresentation | null`；`attachRun(run, { runId })` 中取得并核对 owner、run 与 `camera().tick === run.renderFrame().current.tick`；`session.onStatus` 中 `completed` 与 `stopped`、`faulted` 一样立即失效。控制器仍由 `createAudioController({ audio, lifecycle, reportError })` 创建（`AppPorts.audio`）。在 `createFlightConsumer` 的返回值中新增 `presentation()`，在 `attachRun` 中保存 `wireFlightRun(...)` 返回的 `presentation`（含没有驾驶舱的分支），随 `run.ownCleanup` 撤回。
- **18 `use-mission-owner.ts`：** 两个 `consumers` 列表都把音效消费者放在飞行消费者 `consumer` 之后（`messagesConsumer` 之前或之后都可），传入 `presentation: () => flight?.consumer.presentation() ?? null`。
- **19：** 以正式规则核对 DW-06 的每个声音事件与 DW-09 的停止事件（DW-09 (a) 一行：生产路径与原版是否投递表现项一致），包括 `warp-destination-set` 与 A-10 按住重复读取的关系。
- **20：** 实现 DW-02（`presentation-contract.ts` 的两处类型、`flight-presentation.ts` 的 `#step` 在通知前附上 `explosions`、`presentation-effects.ts` 保存额外爆炸与碎片爆炸的 `forward`、`speed`）并测试；以真实 `wireFlightRun`、表现模块与音效消费者做联合测试（两个帧消费者两种调用次序结果相同、1×5/5/2+0+3 分组相同、Warp 中听者为 `afterStep`、表现层爆炸的移除 tick）；联合测试放在 `src/app/flight-audio/consumer.test.ts`。
- **21：** 边界检查加入 `src/app/flight-audio/hud-cues.ts`，确认 `src/render/` 不导入 `src/app/`，表现增补不进入 Core、快照或 replay。
- **22、23：** 合同没有新增浏览器面；23 的“结果页”用例以会话 `completed` 时停止为判据（DW-11）。

### 写入范围与依赖变更（已执行）

2026-10-28 审阅之后，经协调者授权由 07 代为写入 14、16、17、18、20、27 与 goal（同一用户授权）：14 改写为声音侧状态（`hud-cues.ts`）；20 改写为 DW-02 增补与真实模块联合测试，删去 `src/app/flight-audio/presentation.ts` 及其测试与装配文件，联合测试放在 `consumer.test.ts`；17 加 `presentation()` 接线；18 加登记次序；依赖改为 20 → 16、17 → 16, 20（18 → 17、21 → 19, 20、22 → 18, 19, 20 不变）；goal 的代码现状、AC-07/AC-14 覆盖与跟踪表同步。原提议如下：


- **14：** 写入范围由 `src/render/cockpit/audio-cues.ts`、`src/render/cockpit/audio-cues.test.ts` 改为 `src/app/flight-audio/hud-cues.ts`、`src/app/flight-audio/hud-cues.test.ts`；标题与验收中的“共享”“供音效与 P3-13 绘制共同消费”“同帧双消费者读取同一结果”“声音关闭不改变 HUD 输出”改为 DW-10 的“声音侧状态，与驾驶舱各自读同一 projection，没有共享状态”；“不让 render 反向导入 app”一条保留。
- **17：** 写入范围加 `src/app/mission/flight-consumer.ts`（新增 `presentation()`）与 `src/app/mission/flight-consumer.test.ts`。
- **20：** 删去 `src/render/cockpit/audio-cues.ts`、`src/render/cockpit/audio-cues.test.ts`、`src/app/flight-audio/presentation.ts`（听者选择与爆炸输入已归 13、16，不需要适配层）与 `src/app/composition/use-mission-owner.ts`（登记归 18，DW-02 不需要装配改动）；保留 `src/app/flight-audio/presentation.test.ts` 作联合测试；加 `src/render/flight/presentation/presentation-contract.ts`、`flight-presentation.ts`、`flight-presentation.test.ts`、`presentation.test-support.ts`、`effects/presentation-effects.ts`、`effects/presentation-effects.test.ts`、`effects/effects.test-support.ts`，以及 `docs/plan/p3/02/spec.md`（只在 FS-07 后加一条指向 DW-02 的交接注记，附批准记录）。标题与工作范围中的“共享 HUD”改为“P3-13 各自读取的核对”。
- **27：** `docs/engineering/modules/render.md` 的说明由“共享 HUD/相机接口”改为“DW-02 增补与 P3-14 交接（含 09 记录的接口差异已由 D-02 定稿）”。
- **goal：** “代码现状与前提”中 `src/render/cockpit/audio-cues.ts` 的落点、跨任务前提表中 P3-13 一行（“接受同一纯表现读模型”）随 D-02 更正。

### 验证

- 链接与锚点：`linkcheck.mjs` 检查本文、P3-14、P3-04、P3-12、P3-13 spec，全部通过。
- 元数据：变更的五个文件 `updated` 均为 2026-10-28；新增内容只有地址、常量与行为描述，没有原版字节、文字、音频或反汇编。
- 第三项验收：上节的变更已写入，`node tools/task-state.ts p3/14 --json` 无计划问题。
