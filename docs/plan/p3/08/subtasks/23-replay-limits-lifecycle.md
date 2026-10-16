---
type: plan
status: active
phase: P3
task: "08"
subtask: "23"
updated: 2026-10-15
---

# 23 — 自主 AI 的 replay、容量与运行生命周期

**契约来源：** [spec](../spec.md) 的 AC-01（回归部分）、AC-11、AC-17；[数值、随机数与时间](../spec.md#数值随机数与时间)、[与其他任务的接口](../spec.md#与其他任务的接口)的暂停与运行生命周期。
**依赖：** 16, 18, 19, 20, 21, 22。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 计划新增 `src/core/replay/ai-replay.test.ts`：合成内容、记录的种子与正常 `TickInput`，录制经 JSON 往返后用未修改的 [replayRecord](../../../../../src/core/replay/replay.ts) 重放，事件与检查点一致；覆盖自主选敌、开火、脚本与缓存转换、停放与重装。不沿用 [motion-replay.test.ts](../../../../../src/core/replay/motion-replay.test.ts) 的双边回写替身；内部请求测试不计入。更新 P3-06、P3-07 的 replay 夹具中随 AI 改变的断言，不改写历史证据。
- 快照覆盖控制器、解析缓存、执行实例、待处理命令、友伤累计与集合历史；读取 projection 或改变呈现频率不改变结果。
- 容量：执行步、栈、缓存/实例、实体扇出与请求/事件预算的 limit 与 limit + 1，超出时故障锁存、不发布部分输出。
- 运行生命周期：[app/session](../../../../../src/app/session/) 中暂停/隐藏不调用 `step()`、恢复不补墙钟、停止/重试与两个并行世界之间不泄漏缓存、期限或扳机，清玩家输入不改变 AI 状态；故障经 Runtime 显示。
- 发现的规则缺陷回到相应子任务的范围修复（协调者按需加修复子任务）。

## 不包含

- 浏览器回归（24）；真实内容（25）。

## 关键文件与契约

- 已有：[replay.ts](../../../../../src/core/replay/replay.ts)、[replay.test-support.ts](../../../../../src/core/replay/replay.test-support.ts)、[limits.ts](../../../../../src/core/contracts/limits.ts)、[app/session/](../../../../../src/app/session/)。
- 计划新增：`src/core/replay/ai-replay.test.ts`、`src/core/systems/ai-limits.test.ts`。

## 写入范围

- `src/core/replay/**`：AI replay 测试、夹具与支持。
- `src/core/systems/ai-limits.test.ts`：容量测试（新建）。
- `src/core/contracts/limits.ts`：预算的必要修正。
- `src/app/session/**`：生命周期测试与必要修正。
- `src/core/contracts/limits.test.ts`：`canonicalTextLength` 提高后的断言。
- `src/core/contracts/canonical-text.test.ts`：按上限推导的截断位置。

## 验收标准

- [x] AC-11：标准录制与 replay 一致，快照完整。
- [x] AC-17 的 Node 部分：预算边界、故障锁存、暂停/恢复/重试/双世界隔离。
- [x] AC-01 的回归：既有不变量与随已批准变化更新的断言通过；`pnpm check` 通过。

## 验证方法

- Node replay、快照、容量与 Session 生命周期测试。
- 按 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 清理本项范围。

## 完成证据

- **AC-11（[ai-replay.test.ts](../../../../../src/core/replay/ai-replay.test.ts)）：** 合成任务（玩家、两个 kind-7 敌机、kind-17 基地、远处停放的两个 kind-8 敌机、僚机；DFPG 0 的距离改为 800/400）以正常 `TickInput` 录制 420 tick、每 tick 一个检查点：记录的 ticks 恰为脚本输入（无内部请求）；tick 2 敌机在任何输入前自主选中玩家并装载脚本，敌机以 `ai` 扳机、基地以 `automatic` 扳机开火，玩家只有 30、50 两次命令开火；解析缓存的使用数每 tick 等于存活执行状态数，缓存序列 `[] → [[2,2]] → [] → [[2,1],[3,1]] → [[2,2]]`，远处敌机发生状态切换；Warp 使近处对象 interpreter/base → parked、远处敌机 parked → interpreter（重装）并选中玩家，僚机经菜单代码 6 Warp 离场 → parked；P3-10 菜单的代码 1（攻击玩家目标，僚机 mode 0、target 为该敌机）与 6 各投递、消费一次；`b` 产生一个 `creator: 'player'` 的 Xpon。JSON 往返后未修改的 `replayRecord` 结果相同、`compareReplayResults` 一致，每个检查点等于录制时读取的快照哈希；每 tick 读、隔若干 tick 读或不读 projection/Render State/快照，记录与结果不变；在投递、`b`、离场命令与 Warp 请求的 tick 改输入即在该 tick 以事件分叉。快照含 `pendingCommand`（投递到消费之间）、执行状态、解析缓存、友伤累计、对象集合与 `mapVisible`，不含静态 AI 数据。内部请求替身（ai-commands 的投递、motion-replay 的回写）不计入，motion-replay 的注释已注明。
- **AC-17 的 Node 部分（[ai-limits.test.ts](../../../../../src/core/systems/ai-limits.test.ts)，真实流水线）：** 1,021 个 kind-7（64+64 次分派）与 2 个 kind-8（96+96）在安装 tick 恰好 131,072 次分派通过（每个首次更新都运行到等待，缓存 `[[2,1021],[5,2]]`，安装脚本已释放）；kind-8 改为 97+96 时在第 131,073 次分派以 `ai.dispatches-per-tick` 故障、计数停在 131,072，世界锁存（step/snapshot/projection/renderState 都抛同一故障）；永不让出的脚本恰好分派 1,024 次（1,024 个 `steer`）后以 `ai.dispatches-per-run` 故障，tick 无事件，录制会话锁存且不能导出（单次运行的精确边界另见 16 的 ai-interpreter.test.ts）；129 个机体各 253 个 `steer` 共 32,637 ≤ `requestsPerTick`，130 个以 `pipeline.requests` 故障并锁存；64 个 `b` 在一个 tick 产生 64 个 `create-transponder`、64 个 `transponder-deployed` 与 64 个 Xpon；`b` 创建第 2,048 个实体通过，同批两个时以 `entities.count` 故障并锁存；128 项脚本整体缓存（128 个解析项）、129 项在创建时拒绝，压栈 9001 在创建时以 `unsupported-opcode` 拒绝（栈恒为 0 ≤ 8）；48 个敌机加僚机的 320 tick 运行中每 tick 断言栈 ≤ 8、执行状态 ≤ 表程序控制器、缓存项 ≤ 脚本数且按序、项数 ≤ 128、0 < uses ≤ 实体上限 + 1、uses 之和 = 执行状态数。
- **容量（12 的交接，CR-25）：** 按 budget 测试的方法实测，所有数值最长时快照无挂点约 13.3 MiB，每机体每挂点 396 字符，32 挂点约 25.7 MiB；协调者依用户授权把 `canonicalTextLength` 提高到 32 MiB（2²⁵，[limits.ts](../../../../../src/core/contracts/limits.ts) 的推导已改写）。[budget.test.ts](../../../../../src/core/replay/budget.test.ts) 在原有各部分之上给 1,025 个可带挂点的机体（玩家与 `spawnExpansion` 个实例）加最长的 P3-07 战斗状态与 32 个挂点，断言结果在 25.5–26 MiB 之间且不超上限；[limits.test.ts](../../../../../src/core/contracts/limits.test.ts) 断言 2²⁵，[canonical-text.test.ts](../../../../../src/core/contracts/canonical-text.test.ts) 的截断位置改为由上限推导。
- **运行生命周期（[game-session-ai.test.ts](../../../../../src/app/session/game-session-ai.test.ts)，真实 Session/Runtime/Core）：** 带僚机的切片世界逐 tick 与同输入的纯 Core 世界快照哈希相同（四种处理器都已安装）；用户暂停与页面隐藏一小时：AI 部分（程序槽、目标、解析缓存、RNG）不变，恢复的第一帧 0 tick，之后 5 tick 与参考 tick 15 相同；打开地图不是暂停，AI 随时钟继续；`clear-input`（两种原因）前后快照完全相同；退出后重新开始从 tick 0 起与新世界相同，换另一份 spec 亦然；两个 Session 交错推进各自等于自己的参考；永不让出的 AI 脚本在 tick 2 使运行故障：该 tick 无帧，`operation-failed` 的 runtime 失败为 `faulted` 的 `GameRuntimeError`，原因为 `ai.dispatches-per-run` 的 `CoreFaultError`，projection 停在 tick 1，退出后新运行正常。浏览器部分归 24。
- **AC-01 回归与检查：** `pnpm check` 通过（339 个文件、10,031 项测试，typecheck、lint、build）；P3-06、P3-07 的 replay 夹具已由 12–22 随 AI 更新，本项只更正 motion-replay 的过时注释。长测试有显式时限（31 的做法）：ai-replay 120 s（单项 1.6–6.5 s）、ai-limits 60 s（单项 < 0.2 s）、Session 30 s、budget 文本预算 120 s（约 5 s）。
- **rubber-duck：** 三项采纳：快照严格最坏情形的下界由 16 MiB 收紧到 25.5 MiB；结构上界补边界（128/129 项、9001 拒绝、缓存 uses 随实体数）；replay 断言玩家命令开火的 tick 与僚机攻击命令的目标（原断言可空过）。simplify：合并请求记录辅助、脚本构造辅助，去掉 budget 中重复的 25 MiB 文本，Session 参考缩到 80 tick；保留单独构造故障世界与 Frames 辅助（只此一处使用）。
- **文档影响：** CR-25 由协调者在 goal 分支更正；`docs/engineering/modules/core.md` 的上限表仍写 `canonicalTextLength` 16,777,216，交 28。工程约定、指南与 `docs/original` 无需改动（只有测试与一个上限值的变化，无新命令或原版事实）。

