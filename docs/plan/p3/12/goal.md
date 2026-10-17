---
type: plan
status: accepted
phase: P3
task: "12"
updated: 2026-10-17
related: [ADR-0006, ADR-0009, ADR-0015, ADR-0017, B-001, B-005, B-006, B-009, U-018, U-021, U-027, U-028]
---

# P3-12：飞行场景渲染与效果 — Goal

## 目标与来源

实现用户于 2026-10-15 批准、2026-10-17 修订的 [spec](./spec.md) 中的 S-01 至 S-15 与 AC-01 至 AC-23：

- 原版研究 Q-01 至 Q-13，结论写入 `docs/original/`；证据缺口按最小补证处理（尽量不运行 DOSBox-X），并在看到新版画面之前冻结对照方案；
- D-01 共享契约关卡：Render State 的观察字段、构造与转换事实、Runtime 帧后逐 tick 批次，研究之后定稿并取得批准；
- GPU-free 的表现模块（相机、EXPL 选择者、激活流、额外爆炸、事件 0x10 与判别值 1/2 碎片、被毁视角相机）；
- 飞行渲染器：生命周期与失败分类、Render State 消费、相机与投影、画面合成与 P3-13 接口，以及光照、受击闪烁、星云、弹丸导弹碎片、爆炸精灵、屏幕闪光与 Warp 隧道；
- 规则独立的集成测试、浏览器回归、真实内容配对、表现对照判定与 P2 例外复核、文档与交接。

本文件不重新定义行为契约。共享字段的最终形状以 09 写入 [P3-02 spec](../02/spec.md) 的定稿为准；本 goal 只规定由哪个子任务实现。

## 代码现状与前提

- **已有代码（本 checkout `8376db3f`）：**
  - Core：[render-state.ts](../../../../src/core/projections/render-state.ts) 的 `RenderState` 没有 `subMode`、`followedEntityId`、`inWarp` 与 `warp`；[destruction.ts](../../../../src/core/systems/destruction.ts) 的 `constructExplosion` 在多个阶段运行但不发构造事件，`handOff` 对玩家只发 `source-released`；[player-state.ts](../../../../src/core/world/player-state.ts) 已有 `subMode` 与 `followedEntity`；[explosions.ts](../../../../src/core/rules/explosions.ts) 的 `explosionFrame`。
  - Runtime 与会话：[game-runtime.ts](../../../../src/app/runtime/game-runtime.ts) 只保留两份 Render State；[game-session.ts](../../../../src/app/session/game-session.ts) 的 `#notifyFrame` 每帧交付一份 `GameSessionFrame`，消费者异常使会话 `consumer` 故障；`MAX_TICKS_PER_FRAME` 为 5。
  - 任务所有者：[mission-owner.ts](../../../../src/app/mission/mission-owner.ts) 的 `input`/`ui`/`media` 消费者与 `attachRun`；[MissionShell.tsx](../../../../src/ui/mission/MissionShell.tsx) 的 `mission-view` 目前没有画布。
  - 渲染设施：[render-surface.ts](../../../../src/render/scene/render-surface.ts)（只有 `draw(scene, camera)`）、[viewport-layout.ts](../../../../src/render/viewport/viewport-layout.ts)、[browser-webgl-surface.ts](../../../../src/render/webgl/browser-webgl-surface.ts)；查看器 [render/viewer/](../../../../src/render/viewer/) 只作参考。
  - 内容：[model-payload.ts](../../../../src/content/models/model-payload.ts)（`sourceFlags` 保留）、[model-parts.ts](../../../../src/content/models/model-parts.ts)（不返回标志）、[expand-image.ts](../../../../src/content/graphics/expand-image.ts)（`nearestColourMap`，展开结果已量化）、[flight-data-content.ts](../../../../src/content/flight/flight-data-content.ts)、[effect-payload.ts](../../../../src/content/effects/effect-payload.ts)。
  - 测试：Node 的记录表面 [render-surface.test-support.ts](../../../../src/render/scene/render-surface.test-support.ts)、`ControlledHost`；E2E 的[本地 runner](../../../engineering/README.md#本地浏览器-runner) 与[资源平衡](../../../engineering/README.md#资源平衡)。
- **计划新增：** `src/render/flight/` 下的 `presentation/`（含 `effects/`、`destruction-camera/`）、`renderer/`、`scene/`、`composition/`、`lighting/`、`shimmer/`、`nebula/`、`objects/`、`sprites/`、`flash/`、`warp/` 及相邻测试（目录名可在实现时调整，职责不变）；`src/app/session/game-session-presentation.test.ts`；被忽略的 `local/research/p3-12/<主题>/`。
- **跨任务前提：**
  - P3-03、P3-04、P3-07 已完成并在 main 上。
  - **P3-09：** goal 已在分支 `p3-09-strategic-map-spec`（候选 `17e507c8`）完成，尚未合入 main。10 与 22 开始前，当前分支必须包含其交付（`RenderState.warp`、`map-marker` 表现、`view-switch.ts`）：由协调者在 P3-09 合入 main 后合并 main，或直接合并该分支，以普通合并提交完成并在协调者 checkout 中解决冲突。未满足时 10、22 按 execute-goal 记为 blocked。01 至 09 与 06 的研究可先行（06 用 `git show` 读该分支的研究）。
  - **P3-11：** 未实现被毁视角的进入。14、16 与 25 只用合成状态验证被毁视角，真实的死亡与救援转换交 P3-15，不宣称已走通。
  - **P3-13：** 未实现。本 goal 只交付合成层接口与在制提示。
  - **P3-14：** spec 在其工作分支起草中，“需要 P3-12 提供的只读接口”与本 spec 的表现层契约一致；09 逐项对齐并把差异交 P3-14 的 D-02，不修改其 spec。
- **环境（起草时核对）：** 本 worktree 没有 `node_modules`，执行前运行 `pnpm install --frozen-lockfile`。`local` 链接到主仓库的 `local/`；Ghidra 项目在 `local/ghidra/`，一律 `-noanalysis -readOnly` 并使用私有副本。DOSBox-X 基准环境同一时间只有一个会话操作。
- **原版证据：** 01 至 06 由 agent 用已有记录、本地截图、P3-07 的运行读数、参考视频与只读 Ghidra 取得，结论先写入各自的 `local/research/p3-12/<主题>/findings.md`，由 08 统一写入 `docs/original/`，使它们可以并行。07 只为静态证据达不到的必需项安排最小的、由 agent 独立完成的补证；无法取得的项按 spec 阻塞，不安排用户试玩。

## 验收覆盖

| Spec 范围项/验收项 | 实现子任务 | 验证子任务及方法 |
| --- | --- | --- |
| S-01 | 09、10、11、32 | 10、11、32：Node 契约测试；29：定稿与实现一致 |
| S-02 | 15、16、23 | 15、16：Node（记录表面）；25：浏览器 |
| S-03 | 14、16 | 14、16：Node；25：浏览器 |
| S-04 | 17 | 17：Node 独立期望；25：浏览器读回；26、27：原版配对与判定 |
| S-05 | 18 | 18：Node；25：浏览器；27：判定 |
| S-06 | 19 | 19：Node；25：浏览器；26、27：截图配对与判定 |
| S-07 | 20 | 20：Node；25：浏览器；27：判定 |
| S-08 | 12、13 | 12、13：Node（注入随机源）；24：集成 |
| S-09 | 21 | 21：Node；25：浏览器；26：截图配对 |
| S-10 | 21 | 21：Node；25：浏览器 |
| S-11 | 22 | 22：Node；25：实际 Warp 的浏览器读回 |
| S-12 | 16、23 | 16、23：Node；25：浏览器 |
| S-13 | 01–08、30、26、27 | 08、30：原版文档；27：V-01 至 V-03 判定 |
| S-14 | 28 | 28：文档审阅；29：链接与元数据 |
| S-15 | 30、31、32 | 31、32：Node 独立期望；25：浏览器读回；26、27：截图配对与判定 |
| AC-01 | 09、10、11 | 10、11：0/1/5 tick、折叠、故障前缀、版本拒绝的 Node 测试 |
| AC-02 | 15、23 | 15：Node；25：浏览器资源平衡与 GPU 计数 |
| AC-03 | 15 | 15：Node 故障注入；25：上下文丢失与 WebGL 不可用 |
| AC-04 | 16 | 16：Node 序列测试；25：浏览器 |
| AC-05 | 16 | 16：与 Q-01 的值比对；25：resize 与像素比 |
| AC-06 | 14、16 | 14：Node 逐 tick；25：合成浏览器场景 |
| AC-07 | 17 | 17：独立期望 DATA 索引；25：读回；26、27：原版配对 |
| AC-08 | 18 | 18：Node 分支断言；25：像素与掩码；27：受击画面判定 |
| AC-09 | 19 | 19：Node 不对称图案；25：读回；26、27：截图配对 |
| AC-10 | 20 | 20：Node；25：读回 |
| AC-11 | 12 | 12：Node 注入随机源与 P3-14 契约替身；24：分组不变 |
| AC-12 | 13 | 13：Node 逐项断言与 B-009 对照 |
| AC-13 | 21 | 21：Node；25：读回；26：截图 110、111 |
| AC-14 | 21 | 21：Node；25：读回 |
| AC-15 | 22 | 22：Node；25：实际 Warp |
| AC-16 | 16、23 | 16、23：Node；25：指定像素与 DOM |
| AC-17 | 24 | 24：Runtime/Session 集成与 replay |
| AC-18 | 01–08、30 | 08、30：文档审阅与 `pnpm check:compliance` |
| AC-19 | 08、27 | 27：证据覆盖矩阵 |
| AC-20 | 26 | 26：私有真实内容配对 |
| AC-21 | 07 | 07：运行记录；29：核对 |
| AC-22 | 25、28 | 25：浏览器回归与帧耗时；28：文档；29：`pnpm check` |
| AC-23 | 31、32 | 31、32：Node（注入随机源）；25：浏览器读回；26、27：截图配对与判定 |

## 子任务跟踪

状态只在此维护：`pending` / `in-progress` / `blocked` / `completed`。依赖项全部 completed 后才能开始；验收结果和证据写在相应 subtask 文档，不在阶段索引重复状态。并行执行时，本表与执行记录只由协调者修改。

| 子任务 | 依赖 | 状态 |
| --- | --- | --- |
| [01-camera-visibility-research.md](./subtasks/01-camera-visibility-research.md) | — | completed |
| [02-lighting-flags-research.md](./subtasks/02-lighting-flags-research.md) | — | completed |
| [03-draw-order-sprite-research.md](./subtasks/03-draw-order-sprite-research.md) | — | completed |
| [04-nebula-flash-research.md](./subtasks/04-nebula-flash-research.md) | — | completed |
| [05-shimmer-effect-geometry-research.md](./subtasks/05-shimmer-effect-geometry-research.md) | — | completed |
| [06-warp-tunnel-research.md](./subtasks/06-warp-tunnel-research.md) | — | completed |
| [07-evidence-gap-supplement.md](./subtasks/07-evidence-gap-supplement.md) | 01, 02, 03, 04, 05, 06 | completed |
| [08-original-records-comparison-plan.md](./subtasks/08-original-records-comparison-plan.md) | 01, 02, 03, 04, 05, 06, 07 | completed |
| [09-d01-contract-gate.md](./subtasks/09-d01-contract-gate.md) | 01, 05, 07 | completed |
| [10-core-presentation-facts.md](./subtasks/10-core-presentation-facts.md) | 09 | completed |
| [11-runtime-tick-batches.md](./subtasks/11-runtime-tick-batches.md) | 09 | completed |
| [12-presentation-foundation.md](./subtasks/12-presentation-foundation.md) | 10, 11 | completed |
| [13-presentation-effects.md](./subtasks/13-presentation-effects.md) | 01, 05, 12 | completed |
| [14-destruction-camera.md](./subtasks/14-destruction-camera.md) | 01, 12 | completed |
| [15-renderer-lifecycle.md](./subtasks/15-renderer-lifecycle.md) | 11, 12 | completed |
| [16-scene-camera-composition.md](./subtasks/16-scene-camera-composition.md) | 01, 03, 10, 14, 15 | completed |
| [17-model-lighting.md](./subtasks/17-model-lighting.md) | 02, 16 | completed |
| [18-hit-shimmer.md](./subtasks/18-hit-shimmer.md) | 05, 10, 17 | in-progress |
| [19-nebula-background.md](./subtasks/19-nebula-background.md) | 04, 16 | completed |
| [20-projectile-missile-fragment-render.md](./subtasks/20-projectile-missile-fragment-render.md) | 05, 13, 17 | pending |
| [21-sprites-screen-flash.md](./subtasks/21-sprites-screen-flash.md) | 03, 04, 13, 16 | completed |
| [22-warp-tunnel.md](./subtasks/22-warp-tunnel.md) | 06, 16 | completed |
| [23-pass-integration.md](./subtasks/23-pass-integration.md) | 17, 18, 19, 20, 21, 22, 31 | pending |
| [24-rule-independence-replay.md](./subtasks/24-rule-independence-replay.md) | 13, 14, 23 | pending |
| [25-browser-regression.md](./subtasks/25-browser-regression.md) | 23, 24 | pending |
| [26-real-content-comparison.md](./subtasks/26-real-content-comparison.md) | 08, 25 | pending |
| [27-presentation-verdicts.md](./subtasks/27-presentation-verdicts.md) | 26 | pending |
| [28-docs-handoff.md](./subtasks/28-docs-handoff.md) | 09, 23, 24, 25 | pending |
| [30-stars-speed-dust-research.md](./subtasks/30-stars-speed-dust-research.md) | 08 | completed |
| [31-stars-speed-dust.md](./subtasks/31-stars-speed-dust.md) | 10, 12, 16, 30, 32 | in-progress |
| [32-speed-share-fact.md](./subtasks/32-speed-share-fact.md) | 10, 30 | completed |
| [33-warp-test-timeout.md](./subtasks/33-warp-test-timeout.md) | 22 | completed |
| [29-final-alignment.md](./subtasks/29-final-alignment.md) | 01, 02, 03, 04, 05, 06, 07, 08, 09, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 30, 31, 32, 33 | pending |

最后一行始终为最终对齐验证，依赖所有其他子任务。ID 分配后保持不变；新增修复项使用新 ID，插入最终验证之前并加入其依赖，不要求最终验证拥有最大的数字。

## 执行记录

- **2026-10-16 — 主机适配：** 本主机不能在协调者指定的目录启动会话，worker 改在 app 从目标分支创建的 worktree 中运行，并把分支改名为 `exec-p3-12-NN` 作为认领标记（同 P3-08/09/10）。协调者只以 git 中实际存在的提交为准集成；曾收到声称已提交、但提交并不存在的 02、01、03 报告，均未采用。
- **2026-10-16 — 研究缺口交 07（计划修正）：** 01 的第一项验收要求 Q-01 达到已确认，但像素行取整（01 的 G-01）只能靠 07 的运行时补证取得，而 07 依赖 01，形成死锁。依 spec 的[最小补证](./spec.md#原版证据途径与-dosbox-x-的使用)（“优先处理 Q-01/Q-10 的剩余缺口”）与 Q 表允许的补证方式，按用户“其他问题采用最推荐回答”的授权作如下解释：01 至 06 中要求“达到已确认”的验收项，在静态途径可达的部分已确认、剩余部分作为精确缺口连同最小补证写入 findings 并交 07 时，视为该研究子任务完成，勾选时注明缺口编号。相应 Q 项的最终置信度不放宽：由 07 闭合或按 spec 记为 blocked，08 写入原版文档，AC-18 与 29 核对。07 增加对应验收项。
- **2026-10-16 — 研究交接（供 07、09、08）：** 06 发现 Warp 撞墙会触发第 1 类闪光（`0x50a28` → `0x48d64`），需要逐 tick 的 Core 事实“5–95% 窗口内的 Warp 撞墙”，而 P3-09 的 `RenderWarp` 不含撞墙或误差量，交 09 的 D-01 定稿考虑（`local/research/p3-12/warp-tunnel/findings.md`）。02 顺带观察到平面/Gouraud 光栅化的 16 位深度测试为“新值 ≤ 存储值时绘制”，可能闭合 03 的 G3，由 07 核对。03 与 06 发现星点层（`0x3fd60`/`0x3fbc0`）与速度尘埃层（`0x44f74`/`0x44f00`，Warp 中为条纹）出现在所有世界视角，但 spec 没有对应的 Q 项或范围项；这是范围问题，待用户决定。
- **2026-10-16 — 04 提出的 spec 层面事项（待用户决定）：** 第 0、1 类屏幕闪光还会经 CRTC 起始地址把画面上下平移（写入值已确认，代码；可见行数高概率，04 的 G-04-1），而 S-10/AC-14 与 21 只写了调色板；星云只在设置 BACKGROUND DETAIL 开启时绘制（原版缺省为开），spec 按总是绘制。04 建议按开处理。
- **2026-10-16 — P3-09 前提已满足：** 目标分支已变基到 main `31abeb71`，P3-09 经 `3b1bfcd8`（并入 P3-08）与 `61694e3b` 合入 main；本分支已含 `RenderState.warp`（`src/core/projections/render-state.ts`）、`map-marker` 表现与 `src/core/systems/view-switch.ts`。10 与 22 不再因 P3-09 阻塞；P3-08、P3-10 也已在 main 上。
- **2026-10-16 — 07 结果与协调者决定：** 舍入缺口（01 G-01、02 L-G6、04 G-04-3、06 W-G2）已静态闭合：基准 DOSBox-X（`4f19017`，arm64）的 FPU 运算与 f32 存储忽略 RC/PC 按就近偶数，只有 FIST/FRNDINT 遵循 RC，这就是 U-009 矛盾的原因（`local/research/p3-12/supplementary/findings.md` §B1）。真实 x87 硬件在首次渲染后会截断（例如顶点行为向下取整而非就近偶数）；按此前 P3 各任务的先例，协调者决定以基准环境的语义为准，由 08 在 U-009 记录与硬件的差异。按用户“尽量少用 DOSBox-X”的指示，协调者在 5 次运行（全部用于 G-05a，超出方案原定的一次纠正重跑，偏差见运行笔记）后停止补采：G-05a 点阵外观为高概率（满足 Q-05），其中后段覆盖与 G-05b 接缝外观（Q-07 外观所需的高概率尚未达到）作为残余外观缺口交 26/27，附恢复条件；26/27 若仍无法取得，按 spec 记为外观证据缺口，不判为一致。
- **2026-10-16 — Subtask 09 blocked:** D-01 定稿草稿已完成（未提交，保存在 worker worktree `jubilant-fortnight` 的分支 `exec-p3-12-09`），按本 goal 的审批记录须由用户批准；协调者已提交批准请求，用户当时无法回复。
  Evidence: 草稿改动 `docs/plan/p3/02/spec.md`（P3-12 的契约修订 FS-01–FS-11）、`docs/plan/p3/04/spec.md`（帧后逐 tick 输出）、`docs/engineering/modules/core.md`、`docs/engineering/modules/app.md`；要点与开放选择 A–F 的推荐见 09 worker 报告（Render State 增量、`PlayerState.modelShown`、`explosion-created`/`view-switched`/`warp-wall-contact` 三个事件、`FrameReport.outputs`、预算、RULES_VERSION 7→8 与快照格式 6→7、两项新差异）。
  Affected acceptance: AC-01 及 09 的全部验收；10 至 29 都直接或间接依赖 09。
  Resume when: 用户批准 D-01 定稿（或给出修改意见），或授权 agent 按推荐方案定稿；协调者把批准原话转给 09 worker，由其写入批准记录并提交。
- **2026-10-17 — Subtask 09 resumed:** 用户经协调者提问批准 D-01 定稿，选择“批准，全部按推荐方案”（含开放选择 A–F 的推荐：通用 `view-switched`、Warp 撞墙用事件、Core 持有 `modelShown`、`explosion-created` 不带行矩阵、GPU 预算按本地计数定值、接受两项新差异）。协调者把原话转给 09 worker 写入批准记录并提交。
- **2026-10-17 — spec 修订后的计划修订：** 用户以回答协调者提问的方式决定把星点与速度尘埃加入 P3-12、实现第 0、1 类闪光的画面平移、星云固定按开启绘制（[spec 审批](./spec.md#审批)的 2026-10-17 修订）。据此新增 30（Q-14 研究、原版文档、对照方案附录与 FS-12 推荐定稿）、31（星点与速度尘埃的实现）与 32（速度尘埃所需的 D-01 补充 FS-12：用户批准方向并授权协调者按推荐方案定稿，32 写入 P3-02 并在 Core 实现），23 依赖 31，29 依赖 30、31、32；19、21、25、26、27 的范围与验收按修订补充。已完成的 01–09 不受影响；08 冻结的对照方案不改，星点与速度尘埃由 30 另行冻结附录。
- **2026-10-17 — 30 的更正：** 30 的已确认结论更正了 spec 修订中协调者写的三处事实（速度份额决定整层跳过与近处亮度而非粒子数；被毁视角爆炸前的 30 是速度；跟随实体离表后份额为 0）。协调者据此更正 spec 的[星点与速度尘埃](./spec.md#星点与速度尘埃)与 AC-23，以及 31、32；FS-12 由当前状态推导，不进快照、不再递增版本。星点表用默认 `rand` 序列的第 1–1000 次抽取（不是 1001–1128）。对照方案附录 `addendum-q14.md` 已冻结（SHA-256 `34c4c430…23c3b6`），`plan.md` 不变。
- **2026-10-17 — FS-12 定稿：** 协调者按用户授权接受 30 的推荐定稿并由 32 写入 P3-02：`RenderState.speedShare` 按原版 i32/i16 存储建模（常规取值 0–100，极端输入可回绕超过 100，31 按原版夹取亮度与颜色）；MW-01 校验 4 收紧为玩家记录 trunc(+0xB8) ≥ 1，comm-replay 与 worker 停靠夹具相应调整，comm 摘要在 `3be64fe4` 重新取基线且不变。
- **2026-10-17 — 14 的原版文档补充（交 27）：** 14 实现时核实了被毁相机的 f32 细节（进入角为 f32 `0x3F0EFA35` = Math.fround(32° 弧度)；爆炸前每个分量为 F(P + F(R2 × s))；首次跟随距离的求和顺序为 (y² + z²) + x²；跟随位置为 F(F + F(R2 × −d))；两个缓动分支得到相同的 double），由 27（写入范围含 `docs/original/**`）并入 executable 的自动视角/PV8 段落。在 `clock` 之前阶段发生的进入 `view-switched` 使用上一 tick 的时钟（与 `0x18641c` 一致；按 FS-03 不可达）。
- **2026-10-17 — 13 的实现取舍：** `explosion-created` 带速度而不带速度标量 s；带标志的判别值 2 碎片再爆炸漂移所需的 s 由 Core 爆炸的行恢复为 F(R2·v / R2·R2)，在 f32 舍入内精确（若要求逐位一致，须另行修订 FS-03 加入 s；目前不改契约）。闪光检查按 X4 用激活 tick 移动之后的位置与 beforeStep(A+1)（PV7 表格行写作“激活时的 P”，由 27 核对文字）。其余取舍见 13 的完成证据。
- **2026-10-17 — 15 的交接：** 呈现种子改由独立的 `MissionPorts.presentationSeed` 提供（从 `seed` 抽取会移动 E2E 世界种子）；`wireFlightRun`（`src/render/flight/renderer/flight-run.ts`）是 16/23 提供表现层 `effects`、`destructionCamera` 与 GPU `plan` 的接入点。已知限制：暂停的会话无法在帧外进入故障，UI 立即提示，故障在恢复时发生（见 15 的完成证据）。工程文档的过时处（README、source-structure、render.md、app.md 与测试 ID）交 28。
- **2026-10-17 — 16 的接入约定：** 各 pass 实现 `FlightLayer {slot, passes(frame)}`，由 23 经 `FlightRunRender.addLayer` 接入，槽位按 FC2；世界层用 `frame.world.camera`；三维之前的二维层不写深度；21 用 `setScreen` 在整幅游戏图像纹理上实现闪光调色板与平移。运行开始拒绝不按 +0x1C < +0x20 < +0x24（且大于前平面）排列的设备值（spec 内容输入与校验，协调者批准），合成生产 RENS 改为 600/1200/4000。`RenderSurface.drawPasses` 为多遍绘制的增量端口，查看器不变。
- **2026-10-17 — 19 的接入说明（交 23）：** 运行开始时调用一次 `selectNebulaImages(content.nebula, random)`，解码六项图像后连同 DATA 调色板传给 `createNebulaLayer({cache, images, palettes})`，以 `addLayer` 接入并把 `NEBULA_GPU_PLAN` 加入运行的 GPU 计划。表现模块的随机源是私有的，23 须决定星云起点与 31 的速度尘埃重生用哪个表现随机流（应为同一流，不另建同种子的第二个流）。NB5 的清除由合成每帧的黑色清除覆盖。
- **2026-10-17 — 17 的接入说明与限制：** 23 在运行前调用 `prepareModelSurfaces(...)`（内容错误拒绝开始），把 `surfaces.plan` 加入 GPU 计划，再 `addLayer(new ModelLightingLayer(surfaces, run.resources))`；合成生产 RENS 的方向光须改为研究过的单光路径 0 < I_d ≤ 1 与非负环境光（由 23 修改 `flight-data.test-support.ts`）。模型须用 BackSide（相机空间相对 WebGL 是镜像的；16 的绕序说明由 28 更正）。未逐像素仿真的三项（按取整行剔除、定点跨度步进、16 位深度相等）按 ADR-0009 的设备像素三维记为显式限制，交 25、26。LS6 的逐位细节由 27 并入 `docs/original/`。18 用 `LitPartBuilder.part(model, 2, 0, …)`，20 用第 1 列表。
- **2026-10-17 — 22 的接入说明（交 23）：** 用运行的表现随机流（与星云、速度尘埃同一流）创建 `createWarpTunnelLayer({cache, random})`，`addLayer` 接入并加入 `WARP_TUNNEL_GPU_PLAN`；绘制前按次序对每个 `report.outputs` 项调用 `layer.step(o.render)`，静止帧不调用。新序号时游标归 0、投影暂存清空，按 pass 的运算改为按 tick（06 推荐的有意差异）。
- **2026-10-17 — 21 的遮挡取舍与接入说明：** AC-13 按协调者决定采用方案 B：游戏图像的深度改为 24 位 `DepthTexture`（精度不变），经 `CompositionFrame.depth` 暴露；精灵画入自己的渲染目标，在每个块的左上像素做深度测试（FC8），再复制进游戏图像（渲染目标 2/4）。23 的接线：运行前创建 `ExplosionSprites` 并 `addLayer`；每个 tick 输出以 `effects.flashRequests(tick)` 推进 `createScreenFlashes`；以 `setScreen` 安装 `FlashScreenStage`；把 `explosionSpritesGpuPlan` 与 `FLASH_SCREEN_GPU_PLAN` 加入计划；合成生产 RENS 的闪光级别须改到 0–63、持续时间有限且非零。FC8 库排序细节与视角切换后闪光表复位的推断交 27。已知风险：`warp-tunnel-layer.test.ts` 的一个用例在低负载下约 3 秒，机器高负载时会超过 5 秒超时；29 的 `pnpm check` 须在正常负载下确认，必要时由修复子任务处理。
- **2026-10-17 — 新增修复子任务 33：** 集成 31 时 `warp-tunnel-layer.test.ts` 的该用例再次超时（负载约 8–12），31 的集成暂缓。原因是 640×480 像素数组的深度比较；33 改为等价的高效比较，完成后再集成 31 与后续行。

## 审批

用户于 2026-10-15 明确批准本 goal（“approve goal and commit”）。批准范围：上述 29 个子任务及其依赖、写入范围与执行方式，以及“代码现状与前提”中的跨任务前提。这不代表实现完成，也不替代 spec 批准。

本次批准没有授权 agent 定稿 D-01，因此 09 的执行方式保持“需用户”：D-01 定稿后须由用户批准；用户以后若授权 agent 按推荐方案定稿，由协调者把 09 改为自动并记录授权出处。授权不涵盖冻结决定的变更或验收豁免。

2026-10-17：spec 按用户决定修订后（新增 S-15、Q-14、AC-23，修订 S-10、AC-14），协调者在用户明确调用的 `/execute-goal` 下增补 30、31、32，并按修订补充 19、21、23、25、26、27、29 的范围、依赖与验收；该调用按 execute-goal 的规则批准修订后的完整 goal。增补不改变已完成子任务的证据。
