---
type: plan
status: active
phase: P3
task: "14"
subtask: "19"
updated: 2026-10-28
---

# 19 — 正式规则事件到声音的集成

**契约来源：** [spec](../spec.md#触发表) 的 S-02、S-07、AC-02、AC-03、AC-09、AC-10。
**依赖：** 16。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 外部前提：P3-08/09/10/11 已交付 07 列出的正式输出和测试证据。只集成这些输出，不替上游实现规则。
- 从正式 Core 推进取得地图设置、Warp 开始/到达、通讯、基地键、可达 Xpon、救援/结果事实，补齐事件映射和停止边界。
- 覆盖请求拒绝、目的地重复、武器选择未变、无服务执行、同帧模式改变及来源退场；关联按事实契约，不按最终 UI 页面猜测。
- 不可达必须有原版结论；缺接口保持受阻，不能用手造事件完成本项。

## 不包含

- 不更改 P3-08 至 P3-11 游戏规则；发现上游缺陷回责任任务或新增修复项，不能悄悄扩展本项。

## 关键文件与契约

- 现有 Core 公开 world/step、[GameSessionRun](../../../../../src/app/session/game-session.ts)和正式合成任务支持。
- 本 goal 的 events/consumer 模块；计划新增 `rule-integration.test.ts` 和专用合成支持。

## 写入范围

- `src/app/flight-audio/events.ts`：已交付事件接线。
- `src/app/flight-audio/events.test.ts`：相关事件分类同步。
- `src/app/flight-audio/consumer.ts`：正式模式/结果接线。
- `src/app/flight-audio/rule-integration.test.ts`：正式规则链测试。
- `src/app/flight-audio/rule-integration.test-support.ts`：合成配置与合法动作序列。

## 验收标准

- [x] AC-09 所有生产可达事实由真实规则产生并消费，基地音效未随 G-05 省略。
- [x] 拒绝与正常无声区分，重复合法操作按合同提示；结果页和结束后无飞行声音。
- [x] 外部交付引用与实际测试绑定，缺失路径没有被 fixture 冒充。

## 验证方法

- `pnpm test -- src/app/flight-audio/rule-integration.test.ts src/app/flight-audio/events.test.ts`、`pnpm check`。
- 用正式 API 和合成包，不在测试中替换规则为成功回调；调用 [simplify](../../../../../.agents/skills/simplify/SKILL.md)限定适配代码。

## 完成证据

- **实现：** 生产代码无需改动：15 的 DW-06 分类与 16 的 DW-04/DW-07/DW-09/DW-11 接线在正式规则链上全部按合同工作；[events.ts](../../../../../src/app/flight-audio/events.ts) 只在 `warp-destination-set` 的注释补记核对结论（见下）。新增 [rule-integration.test.ts](../../../../../src/app/flight-audio/rule-integration.test.ts) 与 [rule-integration.test-support.ts](../../../../../src/app/flight-audio/rule-integration.test-support.ts)：`playRules` 以正式 GameSession（真实 Core、Runtime、Session）逐 tick 运行上游任务自己的合成世界，按脚本在每个 tick 之前提交命令，照任务页面的做法完成每个运行中保持（`complete-transition`），在 tick 0 按 DW-01 接上 `attachRunAudio`（真实控制器 + 平台假能力），会话进入 `completed` 时调用 `invalidate()`（D2-14，所有者接线归 17）。声音绑定由该运行自己的机型表生成（`soundContentFor`），与 Core 同包。表现模块沿用 16 的替身（`sessionPresentation`），规则事件不读它；DW-02 的真实表现接口归 20。没有手造事件，没有替换任何规则。
- **规则链与外部交付的绑定：**
  - P3-07 战斗：`combatRunSpec`（16 的合成战斗世界）中炮、导弹与受击。
  - P3-08 Xpon：Warp 链中玩家未激活时的 `b`（`player-unavailable`，无声）与到达后同 tick 两次 `b`（两个 10055）；对接世界的飞行中 `b`。僚机投放不发 `transponder-deployed`（DW-09 (a)、CR-20）在正式合成世界中难以到达（僚机须在停放的模式 1 步骤中），以 P3-08 的 Core 测试为证：[ai.test.ts](../../../../../src/core/systems/ai.test.ts) “the wingman's drop creates a parked Xpon in the walk …”断言无 `transponder-deployed`；`constructTransponder` 不发事件，只有玩家请求的 `createTransponder` 发出。无事件即无声音，由本测试的逐 tick 合同核对覆盖。
  - P3-09 地图/Warp：[map-warp.test-support.ts](../../../../../src/core/replay/map-warp.test-support.ts) 的链，加上 tick 2 与 Warp 中被拒绝的 `request-warp`（`player-unavailable`、`wrong-context`，没有 10401）、同一像素同 tick 两次 select（两个 10463）、到达后的武器键与能量键。到达 `hostileNear` 为真时 10181 一次；Warp 页面的无命令写页（tick 10 与到达 tick）无声；Warp 开始 tick 的视角切换不停止同 tick 的受击声。
  - P3-10 通讯/停靠/基地/离港：照 [comm-replay.test.ts](../../../../../src/core/replay/comm-replay.test.ts) 的对接世界（玩家导弹表改为两个挂点，使基地的导弹巡检可见）。通讯命令的三个 `left-page-changed` 各 10485，`command-delivered` 无声；来电页占用时的能量键 `wrong-context` 无声。`docked` 与 `departed` 各一次全部停止且排在该 tick 一切声音之前；停靠期间（含从基地打开的地图，视角 8）没有任何对象项，只有按 ID：列表顶端与越过末端的 Up/Down（含 `moved` 为假）共 8 个 10167、两个 10169、地图中的 10463。停靠期间玩家的当前导弹挂点在 1、2 之间变化（BS9 的巡检）而没有 `weapon-selected`（FA-06、A-10 的“基地补弹永不播放”）。离港 tick：全部停止后，玩家引擎在同 tick 的更新项中重新开始（A-08）。保持 G-02/3、G-02/4 照常完成。
  - P3-11 救援/结果/拆除：[mission-end.test-support.ts](../../../../../src/app/runtime/mission-end.test-support.ts) 的 `successSpec`（全部清除）与 `thirdLossSpec`（两次能量救援 G-02/6 后第三次失利，约 9,400 tick）。`player-loss-started` 不停止；每个 `player-rescued` tick：先全部停止，再按事件次序播放三个 `commandIndex` 为 null 的 11381，第三个抢占类别 4 的一个按 ID 声部（A-03、A-08）。`result-latched`（`all-clear`、`third-loss`）与同 tick 的 `teardown-started` 合并为一次全部停止。完成 tick 没有玩家实体也没有可听对象，无决定；完成后无决定、无发声，消费者的表现订阅由 1 变为 0。
- **逐 tick 合同（五个运行的每个 tick）：** 按 ID 的决定恰等于独立写出的 DW-06 表（字面 Asset ID，不读 events.ts）在该 tick 事件上的结果，触发序号即事件序号，结果均为 `started`；每个射击与未停放受击恰一个对应来源槽位的决定（停靠时没有）；带触发序号的其他对象决定只能是 `object-retired` 的移除停止；含停止事件的 tick 恰一次全部停止且为第一个决定，其他 tick 没有；停靠 tick 没有对象决定（含移除）；没有玩家实体的 tick 没有更新项。DW-06 的全部发声事实与 DW-09 的全部停止事件都至少由一条真实规则链产生。
- **核对结论：**
  - DW-06 “`warp-destination-set` 与 A-10 按住重复读取”：P3-09 每次 select 发一个事件（S-04、MW-05），按住时由 P3-05 输入层每 8 个时钟单位重复 select；A-10 的原版读取间隔 ≥ 8 单位、自身限频 4 单位，因此每次读取都有事件、都发声，音效无需补发（已确认：代码与上游合同）。本测试以同 tick 两次 select 验证每个事件一个 10463；输入层的节奏由 P3-05 自己的测试负责。
  - DW-04 的玩家门禁：在已交付的规则中，没有玩家实体的 tick 只有拆除后的完成 tick，此时没有带位姿项的实体（测试断言此事实），所以门禁在正式链上没有可拦的项；门禁本身由 16 的 consumer.test.ts 以合成输入覆盖。地图标记（种类位 25，表现 `map-marker`）在 Render State 中有位姿项而没有任何声音决定。
- **命令：** `pnpm exec vitest run src/app/flight-audio/rule-integration.test.ts` 15 项通过；`pnpm test -- src/app/flight-audio/rule-integration.test.ts src/app/flight-audio/events.test.ts` 通过；`pnpm check` 通过（typecheck、ESLint、Vitest、build）。变异核对：去掉 `base-navigated` 的声音、`player-rescued` 的停止、停靠门禁、炮/导弹槽位互换、`invalidate` 不撤销订阅，各自使测试失败；去掉玩家门禁不失败（原因见上）。
- **Rubber-duck：** 三项全部处理：(1) 完成时的失效原先只间接观察，改为追踪消费者的表现订阅（完成前 1、完成后 0），并以变异核对；(2) 基地补弹原先没有可观察的补弹，改为两挂点导弹表，断言停靠期间挂点在巡检中变化而无 `weapon-selected`；僚机投放以 P3-08 的 Core 测试为证（理由见上）；(3) 对象事件原先未逐项核对，加入射击/受击/移除的逐事件断言，并新增有导弹发射的战斗运行。
- **simplify：** 成功与失败运行改用 `runSpecOf`；去掉未用的 `voices`、`content` 选项与 `run` 字段；`decisionsByTick` 在 `playRules` 中一次建好并供各断言共用；保持的完成改用 `isRunningTransition`，不再强制转换 `transitionId`；`soundContentFor` 只做一次类型断言。未做：把订阅计数移入 `sessionPresentation`、把保持完成的循环移入会话测试支持（都在本子任务写入范围外，前者属 20 正在修改的文件）；`posed` 的逐 tick 保留（测试规模可接受）。
- **文档影响：** 无需更新。`docs/engineering/` 与 `docs/guides/` 不引用 `app/flight-audio`；原版事实没有新增（A-01、A-08、A-10 已入档），unknowns 不变。建议协调者在 spec DW-06 `warp-destination-set` 一行把“由 19 核对”改为指向本证据的结论；app 分册的 flight-audio 一节仍归 27。
