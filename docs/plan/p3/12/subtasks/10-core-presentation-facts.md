---
type: plan
status: active
phase: P3
task: "12"
subtask: "10"
updated: 2026-10-17
---

# 10 — Core 表现事实与版本

**契约来源：** [spec](../spec.md) 的 S-01、AC-01、AC-17（Core 部分）；D-01 定稿（09）。
**依赖：** 09。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **前提：** 开始前确认当前分支已包含 P3-09 的交付（`RenderState.warp`、`map-marker` 表现、`view-switch.ts`）；未包含时由协调者记为 blocked，恢复条件为 P3-09 集成进本分支。
- 按 09 定稿实现：Render State 的观察状态字段（`subMode`、`followedEntityId`、`inWarp`、Q-10 确认的显示阶段）；`explosion-created`（或 09 定稿的名称）领域事件在 `constructExplosion` 的实际构造点发出，带构造时的位姿、速度与首次回调判别；视角转换事实与源模型释放的持久状态；活动区域的只读投影。
- 同步写入与复位（新运行、新销毁序列、救援）、校验器、快照写入器、事件比较器、Event Bus 的事件类型表与合成生产者；按 09 递增 `RULES_VERSION` 与格式版本，不支持的旧版本明确拒绝。
- 测试：新字段的冻结、取样时刻（对象更新阶段与较晚阶段的构造、玩家延迟爆炸、碎片到期再爆炸、来源已移除）、复位、limit/limit+1；玩法字段与 RNG 抽取不变的回归。

## 不包含

- Runtime 的帧后批次（11）。
- 被毁视角的进入与结束（P3-11）；本项只在已有的视角写入点输出事实。

## 关键文件与契约

- 现有：[render-state.ts](../../../../../src/core/projections/render-state.ts)、[domain-events.ts](../../../../../src/core/contracts/domain-events.ts)、[destruction.ts](../../../../../src/core/systems/destruction.ts)、[player-state.ts](../../../../../src/core/world/player-state.ts)、[entity-table.ts](../../../../../src/core/world/entity-table.ts)、[snapshot.ts](../../../../../src/core/replay/snapshot.ts)、[compare.ts](../../../../../src/core/replay/compare.ts)、[rules-version.ts](../../../../../src/core/replay/rules-version.ts)、[game-event-bus.ts](../../../../../src/app/runtime/game-event-bus.ts)。

## 写入范围

- `src/core/**`：表现事实、事件、复位、快照、比较与版本。
- `src/app/runtime/game-event-bus.ts`：新事件类型进入 `EVENT_TYPES`。
- `src/app/runtime/game-event-bus.test.ts`：新事件类型的过滤测试。
- `src/ui/dev/event-log.ts`、`src/ui/dev/event-log.test.ts`：开发事件日志对三个新事件的摘要（P3-02 FS-09）。
- `tools/replay-check.ts`、`tools/replay-check.test.ts`：`LONGEST_EVENTS` 与事件键列表加入三个新事件（P3-02 FS-09）。
- `docs/engineering/modules/core.md`：版本号、`ExplosionConstructionStage`、`TickContext.stage` 与共享视角切换 API 的说明。
- `docs/plan/p3/02/spec.md`：只限 FS-03 的勘误（`ExplosionConstructionStage` 补 `parked-update`），附勘误记录。

## 验收标准

- [x] AC-01（Core 部分）：构造、激活与视角进入的事实快照正确；持久观察字段正确复位；新字段深度冻结。
- [x] 版本、校验、快照与比较器同步，不支持的旧版本被拒绝；玩法字段与 RNG 抽取的回归通过。
- [x] `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts` 通过。

## 验证方法

- 上列 Node 测试；对照 09 的定稿逐字段核对。

## 完成证据

- **实现（FS-01 至 FS-05、FS-08、FS-09 的 Core 部分）：**
  - 契约：[domain-events.ts](../../../../../src/core/contracts/domain-events.ts) 加入 `PIPELINE_STAGE_NAMES`/`PipelineStageName`、`EXPLOSION_CONSTRUCTION_STAGES` 与 `explosion-created`、`view-switched`、`warp-wall-contact`；`PIPELINE` 的阶段 ID 以 `PipelineStageName` 为类型，`runTick` 把正在运行的阶段写入 `TickContext.stage`（[pipeline.ts](../../../../../src/core/systems/pipeline.ts)）。
  - `explosion-created`：[destruction.ts](../../../../../src/core/systems/destruction.ts) 的 `constructExplosion` 在来源成为被毁源之后、产生碎片之前发出（位置为来源位置，速度为爆炸 `linear` 块的 F(R2 × 速度)）。
  - `view-switched` 与 `modelShown`：[view-switch.ts](../../../../../src/core/systems/view-switch.ts) 的共同切换 `commitViewSwitch`（地图开关、Warp 开始与完成）与其上的 `0x216d4` 版本 `switchPlayerView`（停靠与离港，写 `modelShown`）；实例化（[spawn.ts](../../../../../src/core/systems/spawn.ts)）与玩家的交接（`handOff`）把 `modelShown` 写为假；[player-state.ts](../../../../../src/core/world/player-state.ts) 新增该字段，创建值为假。
  - `warp-wall-contact`：[warp-path.ts](../../../../../src/core/rules/warp-path.ts) 的 `steerInTunnel` 给出 `wallContact`（d² > 2500 且在窗口内，即加 0.01 的分支），[warp.ts](../../../../../src/core/systems/warp.ts) 的 Warp 步据此发出，在显示步之前。
  - Render State：[render-state.ts](../../../../../src/core/projections/render-state.ts) 加入 `subMode`、`followedEntityId`、`activeAreaCentre`（复用 `activeAreaCentre(world)`，Warp 无目的地时同为 `invariant-violated`）与每个实体的 `inWarp`、`sourceKindBit`、`display`（FS-01 的先后次序）。
  - 同步（FS-08、FS-09）：`RULES_VERSION` 7 → 8、快照格式 6 → 7（`modelShown` 进入快照写入器），replay 格式仍为 3；比较器的字段表、读取器（位姿与速度按 f32）与 `TickOrder`（按事件报告的阶段排序，`warp-wall-contact` 每 tick 至多一个、在帧尾）；Event Bus 的 `EVENT_TYPES`；`CORE_LIMITS.eventsPerTick` 的注释（9,487）；开发事件日志的摘要（[event-log.ts](../../../../../src/ui/dev/event-log.ts)）；[replay-check.ts](../../../../../tools/replay-check.ts) 的 `LONGEST_EVENTS`（`RECORDING_MAX_BYTES` 不变：最长事件仍是 `warp-completed`）。
- **与 FS-03 的偏差（已由协调者记为勘误，P3-02 spec 审批节 2026-10-17 勘误）：** `ExplosionConstructionStage` 加入 `parked-update`。[parked-engagement.ts](../../../../../src/core/systems/parked-engagement.ts) 的目标可以是活动或停靠的机体，停放交战在 `parked-update` 中经 damage.ts → `destroyEntity` → `constructExplosion` 摧毁它；不在列表中的阶段构造爆炸是 `destruction.construction-stage` 不变式故障。
- **测试与结果：**
  - 取样与事实：[destruction.test.ts](../../../../../src/core/systems/destruction.test.ts)（碰撞阶段构造的完整事件、对象更新中构造并同 tick 激活、玩家延迟爆炸在 `delayed-player-explosion`、碎片到期再爆炸在请求处理、来源已移除不发、玩家交接清 `modelShown`），[combat-wiring.test.ts](../../../../../src/core/systems/combat-wiring.test.ts)（移动阶段的位置与漂移速度），[missiles.test.ts](../../../../../src/core/systems/missiles.test.ts)、[projectiles.test.ts](../../../../../src/core/systems/projectiles.test.ts)、[collision.test.ts](../../../../../src/core/systems/collision.test.ts)、[combat-chains.test.ts](../../../../../src/core/systems/combat-chains.test.ts)（次序经比较器的 `TickOrder` 校验；每 tick 事件预算 32,768 满额与 +1 故障，含 `explosion-created`）。
  - 视角：[view-switch.test.ts](../../../../../src/core/systems/view-switch.test.ts)（写入时位姿、脱离、阶段、无玩家实体为 null、子模式、只有 `switchPlayerView` 写 `modelShown`），[map.test.ts](../../../../../src/core/systems/map.test.ts)、[warp.test.ts](../../../../../src/core/systems/warp.test.ts)、[docking.test.ts](../../../../../src/core/systems/docking.test.ts) 等整份序列中出现 `view-switched`（Warp 开始的位姿是设立之前的、离港的是放置之前的），[spawn.test.ts](../../../../../src/core/systems/spawn.test.ts)（实例化把 `modelShown` 写为假且不是切换），[pipeline.test.ts](../../../../../src/core/systems/pipeline.test.ts)（`PIPELINE` 的 ID 等于 `PIPELINE_STAGE_NAMES`，`runTick` 报告阶段）。
  - Warp 撞壁：warp.test.ts 的新组（窗口内撞壁恰一个事件与序号；管内或窗口外没有），[warp-path.test.ts](../../../../../src/core/rules/warp-path.test.ts)（`wallContact` 与加 0.01 的分支一致）。
  - Render State：[render-state.test.ts](../../../../../src/core/projections/render-state.test.ts) 的新组（八种状态的 `display`、玩家 `hidden`/`released`/`pending` 的次序、`inWarp` 与 `sourceKindBit` 按种类、跟随实体离表照样给出、Warp 中心为目的地且脱离、故障、深度冻结、读取不改世界）。
  - 版本与比较：[snapshot.test.ts](../../../../../src/core/replay/snapshot.test.ts)（版本 7/8，`modelShown` 进入规范文本，叶子变化改变文本），[compare.test.ts](../../../../../src/core/replay/compare.test.ts) 的 P3-12 组（接受、差异、非法阶段/字段/非 f32、阶段倒序、第二个撞壁），[map-warp-replay.test.ts](../../../../../src/core/replay/map-warp-replay.test.ts)（规则版本 7 的录制被拒绝），[budget.test.ts](../../../../../src/core/replay/budget.test.ts)（每命令一次 `view-switched`）。
  - 玩法与 RNG 回归：四个合成录制运行（地图/Warp、战斗、AI、停靠）新增 `keeps the gameplay of the run from before P3-12's presentation facts`，以 `gameplayDigest`（[replay.test-support.ts](../../../../../src/core/replay/replay.test-support.ts)：去掉三个新事件与 `modelShown` 后每 tick 的事件与快照状态，含 RNG 状态）对照在基线 `8b6113b6` 的临时 worktree 中对同一运行算出的摘要，四个摘要完全相同（`8231182cf57bf5fc`、`fba1bd8161cf249f`、`2e249be7a5836a1d`、`adb682ae070f7653`）；临时 worktree 已删除。
  - 命令：`pnpm exec vitest run src/core tools/engineering-boundaries.test.ts tools/replay-check.test.ts src/ui/dev src/app/runtime/game-event-bus.test.ts` 3,879 项通过；`pnpm typecheck`、`pnpm lint` 通过；`pnpm check`（TypeScript、ESLint、Vitest 10,078 项、生产构建）在基于 `4f762db1` 的最终树上通过（此前一次运行中 `tools/logic-check.test.ts` 在满负载下超时一次，单独重跑 6/6 通过，最终运行无失败）。
- **Rubber-duck：** 三项采纳——`modelShown` 原先由每次切换写入，改为只由 `0x216d4` 路径（`switchPlayerView`）写入，地图与 Warp 不写（FS-02）；共同切换接受子模式并报告旧子模式；比较器的新位姿与速度改按 f32 读取。确认 `parked-update` 的理由成立；`tools/replay-check.ts` 经范围扩展同步。
- **Simplify：** 采纳——比较器与实体表共用导出的 `EXPLOSION_VARIANTS`；Render State 每 tick 只解析一次被隐藏的玩家 ID。未采纳——测试中手写的 `context.stage` 与 `STAGE_OF` 映射（沿用既有测试自行驱动 `PIPELINE` 与 `TickOrder` 分段的做法）、`modelShown` 改为推导（FS-10 决定 3 明确要求持久字段）、`subMode` 参数（rubber-duck 要求的 P3-11 接口）。
- **文档影响：** 更新 [core.md](../../../../engineering/modules/core.md)（事件阶段含 `parked-update`、`TickContext.stage`、`commitViewSwitch`/`switchPlayerView`、版本 8/7）；P3-02 spec 的 FS-03 勘误；`docs/original/` 无新事实。待协调者处理：`docs/STATUS.md` 中“`RULES_VERSION` 为 7、快照格式 6”。

