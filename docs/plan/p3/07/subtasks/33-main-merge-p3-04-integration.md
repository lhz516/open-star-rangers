---
type: plan
status: active
phase: P3
task: "07"
subtask: "33"
updated: 2026-10-10
---

# 33 — 合并 main 后接入 P3-04 的 Runtime、Session 与工具

**契约来源：** [spec](../spec.md) 的 S-01、S-02、AC-01、AC-02、AC-17；P3-02 spec 的 [CR-01](../../02/spec.md#cr-01-世界创建输入与静态规则数据d-01)（世界创建与录制的规则输入）、[CR-06](../../02/spec.md#cr-06-领域事件与次序d-01)（新领域事件）、[CR-12](../../02/spec.md#cr-12-projection-与-render-stated-01)。
**依赖：** 12, 16。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 背景

协调者在执行中新增本项（2026-10-10，依用户对新增解除阻塞子任务的预先授权，不需审阅）。P3-04（Runtime、Session 与 UI）已快进合入 `main`，并删除了 P1 的合成演示。P3-06 已把 `main` 合并到它的分支，并在其子任务 24 中让 P3-04 的调用者接入 P3-06 的契约（`craftInfo` 等）。本分支此后再合并 P3-06 分支时，P3-04 的 `createWorld`、录制与 replay 调用者会缺少 P3-07 新增的规则输入，事件与读模型的消费者也需要接上。本项完成这次合并与接入，使本分支与 `main` 的差距不再扩大。

## 工作范围

- **合并：** 在 worker 分支上把 `p3-07-weapons-damage-spec` 当前的 HEAD 与 `p3-06-flight-motion-spec` 合并（`git merge --no-ff`），在 worker worktree 中解决冲突，并保留双方的改动。合并前后都核对 P3-06 的已有决定（参照其子任务 24 的做法与提交 `fb6ea0b`）。
- **接入 P3-07 的契约：** 参照 P3-06 子任务 24 接入 `craftInfo` 的路径，使 P3-04 的任务输入、任务所有者、Runtime、Session、事件总线、开发工具 UI、`tools/replay-check.ts` 与浏览器 replay 端到端测试，从同一已验证的资源包读取并传入 CR-01 的规则输入（`debrisParameters`、`projectileVisuals`、`explosions`、`explosionAnimations`、`models` 按 CR-01 的实际字段）。P3-07 的新领域事件与读模型字段，在现有消费者中按已有约定显示或透传，不新增玩法 UI。
- **范围之外的发现：** Runtime 或 UI 中需要新行为（例如开火输入、HUD）的，不在本项实现，交 P3-05、P3-13 等的交接（记入完成证据，由 28 写入交接）。
- **测试：** 更新受影响的单元测试与测试辅助；`pnpm check` 通过。若浏览器 replay 端到端测试受影响，按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md) 运行 `pnpm` 中已有的 e2e 命令，并记录结果。
- **提交方式：** 合并提交与接入改动作为一个合并提交（解决冲突与接入同在其中），提交前把 worker 分支重新建立在 goal 分支的最新 HEAD 之上（以最新 HEAD 重做合并并应用接入改动），使协调者可以直接合并。协调者以 `git merge` 集成本项（不用 cherry-pick），并在执行记录中注明。

## 不包含

- 战斗玩法的 UI、输入绑定与画面（P3-05、P3-12、P3-13）。
- P3-07 规则本身的改动（13 至 22）。若合并暴露 Core 规则的冲突，报告协调者，不在本项改写规则。

## 关键文件与契约

- P3-06 的子任务 24（提交 `fb6ea0b`）：`src/app/resources/mission-input.ts`、`src/app/mission/mission-owner.ts`、`src/app/runtime/game-runtime.ts`、`src/app/runtime/game-event-bus.ts`、`src/app/session/game-session.ts`、`src/ui/dev/*`、`src/ui/game/game-session-bridge.ts`、`tools/replay-check.ts`、`e2e/browser-replay.spec.ts` 及相邻测试。
- 12 的 `src/core/world/rule-data.ts` 与 `createWorld` 的输入；CR-01 的字段清单。
- [源码结构](../../../../engineering/source-structure.md)中 P3-04 的合成演示退役记录。

## 写入范围

- `src/app/**`：任务输入、任务所有者、Runtime、Session 与事件总线的接入。
- `src/ui/**`：开发工具与游戏会话桥的接入。
- `src/workers/**`：任务场景测试的接入。
- `e2e/**`：浏览器 replay 的接入。
- `tools/replay-check.ts`、`tools/replay-check.test.ts`：replay 核对的接入。
- `src/core/projections/projection.ts`：P3-06 的 `motionPlayer` 经移动块联合收窄为受操纵的块（与 `craftMovement` 的处理相同）。
- `src/core/replay/budget.test.ts`：P3-06 的容量测试适配 CR-03 的联合与 CR-02 的战斗状态（P3-06 的断言只针对其自身的项）。
- `src/core/world/create-world.ts`、`src/core/world/create-world.test.ts`：导出 `instantiableModelIds`，由 Core 给出 CR-01 所需的可实例化模型集合，不改变 `initialWorldState`。
- `src/original-data/conversion/production-rule-data.test-support.ts`：生产结构的合成光盘夹具满足 CR-01 的检查（DEBRIS 记录数、挂点链、炮 +0x14），与 P3-06 子任务 24 的同类修改一致。
- `src/core/projections/combat.test.ts`：合并 P3-06 的运动组后 `flight.motion` 的断言。
- `docs/engineering/README.md`、`docs/engineering/modules/app.md`、`docs/engineering/modules/ui.md`、`docs/guides/tools.md`：P3-04 的接入点、事件与 replay 核对的文档同步（与 P3-06 子任务 24 更新的同一组文档）。

合并本身带入的 P3-06 与 `main` 的改动不计入写入范围；协调者拥有的 `docs/plan/p3/tasks.md` 若有合并冲突，按协调者给出的文本解决；在上列之外需要为解决冲突而修改的路径，先发 scope-request。

## 验收标准

- [x] 本分支已合并 `p3-06-flight-motion-spec` 的当前 HEAD（含 `main`），冲突的解决保留了双方的决定。
- [x] P3-04 的世界创建、录制与 replay 调用者都传入 CR-01 的规则输入，且与 Core 从同一资源包读取；没有用占位或空数据冒充规则输入。
- [x] `pnpm check` 通过；受影响的 e2e 已运行并记录结果，或写明未受影响的依据。
- [x] 需要新玩法行为的发现已记入完成证据，交给相应任务。

## 验证方法

- `pnpm check`；必要时按 browser-testing 运行已有的浏览器 replay 端到端测试。
- 协调者集成后在合并结果上再运行 `pnpm check`。

## 完成证据

- **2026-10-10，worker（应用会话分支 `p3-07-33-worker`），基于 goal HEAD `9a53315`（派发时为 `de4be26`，其间以新的 HEAD 重做合并）：**
  - **合并：** `git merge --no-ff p3-06-flight-motion-spec` 于协调者派发时指定的 `fb6ea0b`（含 `main` 的 P3-04 与合成演示的退役；未恢复 `src/core/synthetic` 或其 lint 规则）。P3-06 其后的 `42db4ec`（B-008 文档与 `tools/baseline`）未并入，留待协调者的下一次合并。文本冲突三处：[tasks.md](../../tasks.md) 的导航句取协调者批准的合并句（“P3-01 至 P3-04、P3-06 与 P3-07 … `05/`、`08/` …”）；[projection.ts](../../../../../src/core/projections/projection.ts) 与 [projection.test.ts](../../../../../src/core/projections/projection.test.ts) 保留 P3-06 的运动组与 23 的战斗组，`flight` 两组都就绪。合并带来的语义冲突（协调者批准的写入范围）：
    - `motionPlayer` 按 CR-03 的联合只读 steered 块（`craft`/`warp`），否则为 `projection.motion` 的 Core 故障（新增一个非 steered 块的故障用例）；与已有的 `craftMovement` 做法相同。
    - 运动组玩家的 `speedLimitStatus` 取 P3-07 的 `PLAYER_SPEED_LIMIT_STATUS`（`'live'`），去掉 P3-06 的 `'initial-only'` 常量（16 记录的合并检查；[P3-06 spec](../../06/spec.md) 也要求 P3-07 接入后改为 `'live'`、不回退到初值），P3-06 的断言改为 `'live'`。
    - [budget.test.ts](../../../../../src/core/replay/budget.test.ts)（P3-06 的 AC-08 容量核算）：最长实体的种类位 31 在 CR-02 下没有战斗类型，改为 19（同为两位）；移动块按 CR-03 收窄；P3-06 的“飞行状态 ≤ 1.5 KiB”与“每实体 ≤ 4 KiB”只量到 `combat` 之前，因为战斗状态按 CR-14 另有依据（每个机体约 8.5 KiB），由 24 核算。
    - [combat.test.ts](../../../../../src/core/projections/combat.test.ts)：无玩家时运动组为 `{ readiness: 'ready', player: null }`。
    - 已确立的决定在合并结果中保持：P3-06 的 `updatePlayer` 是唯一的命令循环并经 `PlayerUpdateOutput.judge` 交给 `judgeCommand`；`craftMovement` 读 steered 块；`Request` 联合含双方的变体；`leave()` 清除目标、控制与瞄准；`RequestQueue.defer`/`release` 仍在。
  - **Core 的模型集合（协调者批准）：** [create-world.ts](../../../../../src/core/world/create-world.ts) 导出 `instantiableModelIds(input)`：按 `loadMission`、身份、运行配置、`checkSetup`、`buildSpawnState` 与 `instantiableRecords` 求出运行可实例化机体所绑定的模型，去重后按 ID 升序冻结返回；对这些字段的错误与 `createWorld` 相同；`initialWorldState` 不变。[create-world.test.ts](../../../../../src/core/world/create-world.test.ts)：与 `worldInput()` 的 `models` 相同且被 `createWorld` 接受，选僚机时含僚机种类的模型、不选时不含；坏运行配置与 `createWorld` 同在 `input.run.wingman` 拒绝，多余字段在 `input` 拒绝。
  - **接入（CR-01）：**
    - [mission-input.ts](../../../../../src/app/resources/mission-input.ts)：`ruleDataInputs(groups)` 解码与运行无关的输入：`logic` 组的 `debris-parameters`（`decodeRuleDataPayload`）；`models` 组的 `explosion-table` 与其三张列表引用的动画（`decodeFlightDataPayload`，按 ID 升序且恰为所列集合）；唯一的 `projectile` 类 `data` Asset（`readEffectPayload` 加 `checkEffectBinding`，不唯一时留空）。`modelInputs(groups, ids)` 以 `readModelPayload` 加 `checkModelBinding` 解码；`runModelInputs(groups, input)` 按 `instantiableModelIds` 取一次运行的模型，Core 拒绝该运行时返回空列表，由世界创建以同一输入在其路径上拒绝。缺少的留空或略去，由 Core 拒绝；解码错误位于 `<组>[<Asset ID>].<路径>`。
    - [任务所有者](../../../../../src/app/mission/mission-owner.ts)：打开时从绑定包解码 craft-info 与规则数据输入一次，开始时从重读且核对过代际与身份的同一包解码本次选择的模型；任何一项解码失败都是 `rejected`，与世界创建的拒绝同路（留在开始配置页、会话 idle）。
    - Runtime 与会话的规格字段由 Core 的 `CONTENT_INPUT_FIELDS` 加 `run`、`recording`（会话另加 `initialTransition`）构成，原样交给 `createWorld`/`createRecordingSession`；Core 以后新增的内容输入（如 34 的 `aiPrograms`）无需改动这两处。
    - [replay-check.ts](../../../../../tools/replay-check.ts)：用同一 `ruleDataInputs` 与 `runModelInputs`（按记录中的运行配置）解码，失败位置为 `content.<组>[<Asset ID>]…`；`LONGEST_EVENTS` 加入 P3-07 的 13 种事件，各字段取比较器接受的最长形式（最长为 `hit`，720 字节），`RECORDING_MAX_BYTES` 由 225,969,791 变为 **427,820,671**（事件 524,288 × 721），仍低于 V8 的最长字符串；[replay-check.test.ts](../../../../../tools/replay-check.test.ts) 以独立解码录制，并以一个 Core 接受的结果核对全部 19 种事件样本的次序。
    - [mission-scenarios.test.ts](../../../../../src/workers/mission-scenarios.test.ts) 对 `mission-startable` 的六种僚机选择创建世界，`mission-create-rejected` 仍在原路径拒绝；[browser-replay.spec.ts](../../../../../e2e/browser-replay.spec.ts) 的 `ReplayContent` 取 `CONTENT_INPUT_FIELDS` 的全部字段。
    - 生产结构合成盘（[production-rule-data.test-support.ts](../../../../../src/original-data/conversion/production-rule-data.test-support.ts)，协调者批准，与 Core 的 `craftInfoContent()` 及 P3-06/24 的 +0x0C 同类）：可实例化种类的 DEBRIS 记录数改为与合成盘模型第 1 列表的部件数一致（CR-01 检查 2：种类位 0、1 为 0，7 为 1，8、17 为 0，其余不变）；玩家挂点 1 的 `at1C` 为 null（检查 4）；全部炮 +0x14 为 7（检查 5）。格式测试的 `defaultDebrisParameters()` 不变。改动前任务场景在 `input.debrisParameters.content.byCraftType[0]` 被拒绝。
  - **事件与读模型：** [game-event-bus.ts](../../../../../src/app/runtime/game-event-bus.ts) 的 `EVENT_TYPES` 列出 13 种 P3-07 事件；[event-log.ts](../../../../../src/ui/dev/event-log.ts) 按固定次序给出各事件的标量字段（攻击者与触发写成短文本，位置为 x、y、z）；会话桥原样按采样发布已就绪的战斗组，就绪状态的变化在帧末立即发布（[game-session-bridge.test.ts](../../../../../src/ui/game/game-session-bridge.test.ts)）。没有新增玩法界面。
  - **测试：** [mission-input.test.ts](../../../../../src/app/resources/mission-input.test.ts)（选择、升序、缺失与重复、错误位置）；[mission-owner.test.ts](../../../../../src/app/mission/mission-owner.test.ts)（DEBRIS 表、爆炸表与运行模型不能解码时在两种选择下都是 `rejected` 且路径如上；运行的 setupHash 与从同一包独立创建的世界一致，含僚机 0）；[game-runtime.test.ts](../../../../../src/app/runtime/game-runtime.test.ts)（缺 `explosions`、`models` 字段；多一个模型时 Core 在 `input.models[5].id` 拒绝）；[game-event-bus.test.ts](../../../../../src/app/runtime/game-event-bus.test.ts) 与 [event-log.test.ts](../../../../../src/ui/dev/event-log.test.ts)（经 [combat-events.test-support.ts](../../../../../src/app/runtime/combat-events.test-support.ts) 的 13 个事件）；[mission-diagnostics.test.ts](../../../../../src/ui/dev/mission-diagnostics.test.ts)（P3-07 现在判定的命令：`fire` 为 ignored/`insufficient-charge`，`target`、`cycle-main-weapon`、`select-missile`、`energy`、`damage-report` 为 accepted，`target-changed`、`weapon-selected`、`left-page-changed` 以命令序号进入日志）。
  - **检查：** `pnpm check` 通过（在 `79a3bbb` 上的合并：259 个测试文件、7,782 个测试、ESLint、构建；`9a53315` 只多一行 executable.md 文档）；`git diff --check` 通过；`node tools/compliance/cli.ts compliance` 与 `original` 均 passed、0 个发现；本地链接检查（`node local/research/p3-02/pipeline/check-links.ts` 对 app.md、ui.md、README、tools.md 与本文件：412 处，0 失败）。
  - **浏览器回归（browser-testing，Chromium，macOS，端口 5199/5200）：**

    | 项 | 设置/操作 | 期望 | 观察 | 结果 |
    |---|---|---|---|---|
    | 受影响的 e2e | `OSR_E2E_DEV_PORT=5199 OSR_E2E_PREVIEW_PORT=5200 npx playwright test e2e/browser-replay.spec.ts e2e/mission-flow.development.spec.ts e2e/mission-flow.production.spec.ts` | 全部通过 | 8 passed（1.2 min）：浏览器 replay 与 Node 一致；资格、开始到飞行（两种选择）、暂停/菜单/重开/返回、诊断与录制下载经 `runReplayCheck` 在 Node 重放一致；生产流程从缓存恢复 | passed |
    | 开发命令 | mission-flow.development 中诊断面板提交默认命令（主炮开火） | Core 的结果与提交 ID 进入面板与日志 | 改为 ignored/`insufficient-charge`（玩家炮起始无充能，P3-07），原断言为 not-implemented | passed |
    | 全部 e2e（development、production） | `pnpm build` 后 `OSR_E2E_DEV_PORT=5199 OSR_E2E_PREVIEW_PORT=5200 npx playwright test --project=development --project=production`，在 `064897d` 上的合并 | 全部通过 | 195 passed（13.9 min）；有头的 native-lifecycle 未运行（与本项无关，不打开有头窗口） | passed |
    | 重做合并后复跑 | 在 `79a3bbb` 上重做合并（含 17、19、32）后再跑上面三个文件 | 全部通过 | 8 passed（52 s） | passed |

    合成内容由测试入口生成，未读原版文件；服务器由 Playwright 启停，端口已释放。
  - **rubber-duck：** 未发现实现缺陷或合并中丢失的决定（核对了每次运行的模型集合、Core 拒绝的延后、最长事件与上限推导、投射与动画的选择、两处冲突的保留）；唯一的阻塞项是浏览器 e2e 未运行，已按上表运行。
  - **simplify：** 采纳：动画 ID 用 `compareText` 排序；删除未用的 `RuleDataFields`；`object-instantiated` 也用 `positionOf`；模型集合与“Core 拒绝即不给模型”的规则集中到 `runModelInputs`（任务所有者、replay-check 与场景测试共用）；`groupAssets` 以 Map 查 payload；所有者不再保留包的组，开始时取重读的同一包。未采纳：replay-check 的逻辑 Asset 解码改用 `missionInput`（会改变 P3-04 工具的错误位置与唯一性规则）；replay-check 测试与场景测试改用共享解码（有意独立）；`initialWorldState` 与 `instantiableModelIds` 合并流程（协调者要求 `initialWorldState` 不变）；`SLICE_MODEL_PARTS` 由模型夹具推导（在写入范围之外）；跨开始缓存模型（开始很少）。
  - **文档影响：** 已更新 [app 模块说明](../../../../engineering/modules/app.md)（Runtime 规格字段、事件类型、所有者的创建与开始、`mission-input` 的新函数）、[ui 模块说明](../../../../engineering/modules/ui.md)（会话桥的两组就绪、事件日志的字段）、[工程约定](../../../../engineering/README.md)（会话 `start` 的规格）与[工具指南](../../../../guides/tools.md)（replay-check 的解码与 `RECORDING_MAX_BYTES` 表）。Core 分册与源码结构（`instantiableModelIds`、`createWorld` 的输入）归 28；STATUS 与阶段索引不需改动；没有新的原版事实。
  - **交接（需要新行为，不在本项实现；由 28 写入交接）：**
    - P3-05：P3-07 现在判定的命令（`fire` 两个通道、`target`、`cycle-main-weapon`、`select-missile`、`energy`、`damage-report`）的键位与浏览器输入；Runtime 的 `primaryFire` 意图已经送达 Core。
    - P3-13：`flight.combat`（目标、雷达、资源与分配、武器、锁定、子系统、左页面）的 HUD 与驾驶舱显示；会话桥已按采样把它发布到 UI store。
    - P3-12、P3-14：`shot-fired`、`hit`、`explosion-started`（EXPL 项的选择，CR-11）、`missile-ended`、`fragment-expired` 等事件的画面与音效。
    - 34：新增的 `aiPrograms` 输入经 `CONTENT_INPUT_FIELDS` 自动进入 Runtime 与会话；App 的解码（`ruleDataInputs` 或相邻函数）、replay-check 与 browser replay 需随之加入该 Asset。
    - 开发诊断的实体检查只列已有字段，没有显示实体的战斗状态；需要时由 P3-13 或开发工具的后续任务决定。
