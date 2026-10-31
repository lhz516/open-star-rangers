---
type: plan
status: active
phase: "P3"
task: "16"
subtask: "03"
updated: "2026-10-30"
---

# 03 — 联合故障的契约修订

**契约来源：** [spec](../spec.md) 的 S-05、AC-08（契约部分）、[技术决定](../spec.md#技术决定) 4。
**依赖：** 无。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **有界查证：** 按[原版证据获取](../../../../guides/original-evidence.md)读取已有的 [Warp 门禁](../../../../original/formats/executable.md#warp-cost-and-warp-start-p3-0905)、[DK1–DK4](../../../../original/formats/executable.md#docking-wait-docking-and-launch-p3-1004) 与[按键读取](../../../../original/formats/executable.md#input-polling-p3-0201)，必要时做只读 Ghidra 分析。确认原版在“本帧已投递 sub-command 0 或 4，之后玩家更新读到 `w`”时的代码路径，以及这条路径是否需要运行时证据。只记录事实与置信度。不运行 DOSBox-X，不增加原版启动。
- **契约修订：** 在 [P3-02 spec](../../02/spec.md) 中修订 [MW-04](../../02/spec.md#mw-04-命令原因码与内部请求) 与 [CB-07](../../02/spec.md#cb-07-命令判定)，内容按技术决定 4：
  - **冲突门禁：** 本 tick 已有玩家 `dock` 或 `depart` 待提交时，`request-warp` 为 `ignored`/`wrong-context`。玩家不可用的检查仍在它之前；它在目的地、冷却与能量门禁之前。
  - **不变量：** 被拒绝的命令不投递 `warp-start`，不改 Warp、目的地、有效视角或能量，不消耗 Warp 抽取；已有的 `dock`/`depart` 照常应用。
  - **相邻行为：** 没有待提交转换时，子状态 3–4 照常走原门禁；武器的内部 `launch` 请求不算冲突。
  - **更正旧前提：** “其前没有能改变判定输入的请求”与“有效视角”的旧前提按新门禁改写。
- **重复条文与审批记录：** 同步 P3-09、P3-10 spec 中实际重复该门禁的条文。在 P3-02 spec 的审批节写修订记录：依据、所选与被排除的方案、原版置信度、“依 P3-16 spec 的 2026-10-30 批准定稿”，以及这是不宣称与 DOS 同帧一致的项目差异。不伪造旧任务的批准。
- **超出边界时：** 查证若表明需要超出这两种交互、改变其他既定规则或持久化形状，停下并记为 blocked，交用户。

## 不包含

- Core 实现与测试（04）；Core 模块说明的更新（04）。

## 关键文件与契约

- [P3-02 spec](../../02/spec.md) 的 MW-04、CB-07 与审批节；[P3-09 spec](../../09/spec.md)、[P3-10 spec](../../10/spec.md) 中的重复条文；[executable](../../../../original/formats/executable.md)。

## 写入范围

- `docs/plan/p3/02/spec.md`：MW-04、CB-07 与审批节的修订记录。
- `docs/plan/p3/09/spec.md`：只同步重复的门禁条文。
- `docs/plan/p3/10/spec.md`：只同步重复的门禁条文。
- `docs/original/formats/executable.md`：只在查证得到新事实时补记，附置信度。
- `local/research/p3-16/joint-fault/**`：查证笔记与只读分析输出（被忽略）。

## 验收标准

- [x] AC-08（契约）：MW-04 与 CB-07 写明冲突门禁的条件、优先序、原因码与无副作用的不变量，以及相邻行为与旧前提的更正。
- [x] P3-09、P3-10 的重复条文与之一致；审批节的修订记录含依据、方案、置信度与批准出处，没有冒称旧任务批准。
- [x] 查证结论有置信度与来源；没有把“原版不可达”写成已证实，原版同帧竞争缺运行证据的部分已标明。
- [x] 改动的文档 `updated:` 已更新，链接与锚点可解析；没有原版字节或反编译输出。

## 验证方法

- 文档差异审阅、链接检查；对照 [warp.ts](../../../../../src/core/systems/warp.ts)、[docking.ts](../../../../../src/core/systems/docking.ts)、[commands.ts](../../../../../src/core/systems/commands.ts) 与 [pipeline.ts](../../../../../src/core/systems/pipeline.ts) 的现状，确认修订可以按纯 Core 实现。

## 完成证据

- **有界查证（2026-10-30，未运行 DOSBox-X、未新增 Ghidra 运行）：** 读 executable 的[按键读取](../../../../original/formats/executable.md#input-polling-p3-0201)、[帧流水线](../../../../original/formats/executable.md#frame-pipeline-p3-0201)的消息循环次序、[Warp 门禁](../../../../original/formats/executable.md#warp-cost-and-warp-start-p3-0905)与 DK1–DK4；另在 `local/` 的既有反编译输出中只读核对 `0x2be00` 唯一调用点的门禁（只有子命令、ps 与开始的结果），没有活动、子状态、主流程状态或视角的检查。结论写入 [DK4](../../../../original/formats/executable.md#dk4-systems-while-docked-activity-3--confirmed-code-unless-marked) 的新条目，并限定 Warp 开始一节“上一视角从不为 6”的说法：
  - 子命令 0（停靠）与同帧的 `w`：原版先停靠、再开始 Warp，上一视角为 6。各环节已确认（代码）；组合高概率可达（每帧一次按键轮询，到期只有一帧）；后续（`0x3f158(1, 6)`、下一帧子状态 5 的检查）未确认，没有运行观察。
  - 子命令 4（离港）与同帧的 `w`：不可达，已确认（代码）。按键离港与 `w` 要在一次轮询中读两键；自动离港那一帧的玩家更新仍读停靠后的视角（6、从基地打开的地图，或上一种竞争后的 1），都没有 `w`。
  - 所选处置是不宣称与 DOS 同帧一致的项目差异，不依赖原版后续的运行证据，所以不需要新增原版运行。笔记在 `local/research/p3-16/joint-fault/`（被忽略）。
- **契约修订：** [P3-02 spec](../../02/spec.md) 的 [MW-04](../../02/spec.md#mw-04-命令原因码与内部请求) 写入有效上下文的限定、门禁第 1a 步“转换冲突”（条件、次序、结果与不变量、相邻行为、读者、项目差异）和内部请求一段的更正；[CB-07](../../02/spec.md#cb-07-命令判定) 开头写入 `launch` 与停靠等待的衔接；[审批](../../02/spec.md#审批)新增“2026-10-30 修订”，含起因、范围与版本、所选与被排除的五种方案、原版置信度、“依 P3-16 spec 的 2026-10-30 批准定稿”与项目差异的声明，并写明这不是 P3-02/09/10 原任务的批准。新步记为 1a 而不重新编号，因为 `src/core/rules/warp-energy.ts` 的注释与 P3-08/30 的历史证据引用了现有步号。
- **重复条文：** [P3-09 spec](../../09/spec.md) 的行为表新增一行、“同 tick 门禁与请求”补一句；[P3-10 spec](../../10/spec.md) 的“停靠请求与等待”中“等待中”一条补一句。两处都注明依 P3-16 同步并链接 MW-04。
- **可按纯 Core 实现（对照现状）：** `checkDockingWait`（[docking.ts](../../../../../src/core/systems/docking.ts)）在 `mission-flow` 以 `post` 投递 `dock` 与自动 `depart`，`judgeBaseKey`（[commands.ts](../../../../../src/core/systems/commands.ts)）在命令判定中立即投递 `depart`；[pipeline.ts](../../../../../src/core/systems/pipeline.ts) 的阶段次序为 `mission-flow` → `object-update` → `request-handling`，判定时这些请求都在 `RequestQueue` 中尚未处理，已有的 `findLastPending` 可以查到。`judgeRequestWarp`（[warp.ts](../../../../../src/core/systems/warp.ts)）持有 `TickContext`，可在玩家可用检查之后加入冲突检查，拒绝路径已只发一条结果、不 `defer`；`judgeWarpRequest` 供 `projections/map.ts` 以已提交状态复用，tick 之外没有待提交请求。不需要新的持久化字段、原因码或事件；实现与 `RULES_VERSION` 的递增归 04。
- **检查：** `git diff` 审阅；对新增行的相对链接与锚点做脚本检查（按 GitHub 的标题锚点规则），18 处，0 处失效；front matter 的 `updated:` 已改为 2026-10-30（P3-02、P3-09、P3-10 spec 与 executable）。没有原版字节、文字或反编译输出。
- **rubber-duck：** 没有阻塞问题，确认可按纯 Core 实现、1a 编号合理、批准出处没有冒称旧任务。两项非阻塞意见都已采纳：内部请求一段删去“无冲突时等于原版消息处理时的结果”（与 MW-12 差异 1 冲突），改为指向差异 1、9；P3-09 的新行把不变量限定为“被拒绝的 `request-warp` 本身”不改变，并保留先前命令与停靠/离港的效果。
- **文档影响：** Core 模块说明的“已知差异”与“交接”中的联合故障条目、MW-12 的已批准差异列表随 04 的实现更新（不在本子任务的写入范围）；[unknowns](../../../../original/unknowns.md) 不需要新条目（原版后续未确认的部分不影响所选处置）。
