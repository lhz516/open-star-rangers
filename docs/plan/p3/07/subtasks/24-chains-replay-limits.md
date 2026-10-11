---
type: plan
status: active
phase: P3
task: "07"
subtask: "24"
updated: 2026-10-10
---

# 24 — 连锁、replay 与容量

**契约来源：** [spec](../spec.md) 的 S-01（快照与 replay）、S-07（归因）、S-10、AC-13；[与其他任务的接口](../spec.md#与其他任务的接口)、技术决定 8、10；[验证策略](../spec.md#验证策略)中的 Replay/一致性；P3-02 spec 的 [CR-06](../../02/spec.md#cr-06-领域事件与次序d-01)（事件与次序）、[CR-13](../../02/spec.md#cr-13-其他任务在-p3-07-规则中的调用点d-03-之外的接口)（其他任务的调用点）、[CR-14](../../02/spec.md#cr-14-容量快照与版本d-01)（容量、快照与版本）。
**依赖：** 22, 23。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **连锁：**
  - 同 tick 多次命中只产生一次 `object-destroyed`，且在对应的 `hit` 之后；
  - 发射者在命中前已移除时，归因退为 `lost-shooter`、不计击杀；玩家对象不会被移除，玩家的击杀不受影响（H4）；
  - 损失、耗尽与逃生舱到期在 CR-13 的固定调用点交给 P3-11。P3-11 未接入时这些位置没有代码（不建空函数或待处理标志），也不伪造任务计数、救援或失败；
  - 一个 tick 内的事件次序符合 CR-06（玩家更新、请求处理中的导弹起爆、移动、碰撞、能量、停放交战与帧尾）；
  - 多 tick 后才消费事件，即使对象已移除，事件仍有足够的快照。
- **快照：** 快照覆盖 CR-14 列出的全部新状态：实体的 `combat`（含制导、冷却、寿命与计时）、移动块的新变体、表现选择器、玩家状态的新字段（含 `depleted` 锁存与驾驶舱显示步的闪烁状态）；静态规则数据不进快照。快照写入器由类型检查强制覆盖每个成员（11）。P3-02 没有快照恢复 API，本项不新增；以 replay 在每个检查点的快照文本一致来核对。
- **replay：** JSON 往返后的 replay，其事件与检查点一致；坏版本、内容不符（任一规则输入改变 setupHash）与坏输入被拒绝；与渲染有无和读取频率无关。
- **容量：**
  - `eventsPerTick` = 32,768 与 `requestsPerTick` = 16,384（11 按 CR-14 设定）的 limit 与 limit + 1，以及故障锁存；
  - 效果创建（弹丸、导弹、爆炸、碎片）的预算与二次项（起爆、碰撞、停放多目标）的超限故障；
  - 不静默丢弃弹丸、请求或事件；
  - 依据注释与 CR-14 不一致时修正注释并报告协调者；数值的改变须回到 08 的关卡。
- **修复：** 发现缺陷时，修复只针对连锁或 replay 暴露的问题；超出本项的行为缺陷，由协调者新增修复子任务。

- **导弹计时字段的语义检查（20、22 的建议）：** 在 CR-01 的世界创建检查中，拒绝 32 的 `initialGuidance` 会在首次回调时故障的可实例化导弹记录：+0x44、+0x48、+0x54（寿命与计时）不是非负整数，或 +0x58 不在 i32 内。检查与 `initialGuidance` 的记录守卫共用一个判定，使可到达的导弹不在首次回调时故障。内容层把 +0x54 读作 u32，+0x44、+0x48 读作 i32，实际可能为负的是后两者。原版按 u32 回绕（负寿命立即熄火），项目不复现。在 P3-02 spec 的 CR-01 中补一句并加拒绝测试。
  - 合成夹具：`rule-data.test-support.ts` 的 `missile()` 默认 +0x44 为 −11，约 30 个测试文件经它创建世界。把默认值改为有效值（内容解码测试需要的负值或边界值改为显式覆盖），或在世界层夹具中覆盖，二者由执行者选；改动只针对因此失败的测试。拒绝生效后去掉 22 在 `game-session-replay.test.ts` 中把寿命设为 320 的局部覆盖。

## 不包含

- P3-11 的任务计数、救援与失败；完整闭环的 replay（P3-15）。
- 新的规则行为；快照恢复 API。

## 关键文件与契约

- [limits.ts](../../../../../src/core/contracts/limits.ts)、[snapshot.ts](../../../../../src/core/replay/snapshot.ts)、[compare.ts](../../../../../src/core/replay/compare.ts)、[replay.ts](../../../../../src/core/replay/replay.ts)、[replay.test-support.ts](../../../../../src/core/replay/replay.test-support.ts)。
- 计划新增：`src/core/systems/combat-chains.test.ts`、`src/core/replay/combat-replay.test.ts`。

## 写入范围

- `src/core/contracts/limits.ts`：上界依据注释的修正（数值由 11 按 CR-14 设定）。
- `src/core/contracts/limits.test.ts`：上限测试。
- `src/core/replay/snapshot.ts`：快照遗漏状态的修复。
- `src/core/replay/compare.ts`：比较器遗漏字段的修复。
- `src/core/replay/combat-replay.test.ts`：战斗 replay 测试（新建）。
- `src/core/replay/replay.test-support.ts`：测试辅助。
- `src/core/systems/**`：连锁测试（`combat-chains.test.ts`，新建）与连锁缺陷的修复。
- `src/core/rules/**`：连锁缺陷的修复。
- `src/core/world/rule-data.ts`、`src/core/world/rule-data.test.ts`：导弹计时字段的拒绝。
- `docs/plan/p3/02/spec.md`：CR-01 中的对应一句。
- `src/content/rule-data/rule-data.test-support.ts`、`src/content/rule-data/*.test.ts`：合成导弹记录的默认计时字段，与依赖旧默认值的内容解码测试。
- `src/core/world/*.test-support.ts`、`src/core/**/*.test.ts`、`src/app/**/*.test.ts`、`src/app/**/*.test-support.ts`：只用于适配导弹计时字段拒绝后失败的测试与夹具（含去掉 `game-session-replay.test.ts` 的局部覆盖）。

## 验收标准

- [x] AC-13：多次命中只有一次死亡事实；发射者失效时归因退为 `lost-shooter`、不计击杀，玩家的击杀不受影响；损失、耗尽与到期经事件与 CR-13 的固定调用点交给消费任务，没有空函数，未接入 P3-11 时不伪造成功。
- [x] AC-13：快照覆盖 CR-14 列出的全部新状态，静态规则数据不进快照；JSON 往返 replay 的事件与检查点一致；坏版本、内容与输入被拒绝。
- [x] AC-13：新上限与效果创建预算的 limit 与 limit + 1 及故障锁存有回归测试；一个 tick 内的事件次序符合 CR-06；延迟消费的事件仍有足够快照。
- [x] `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts`、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- Node 测试：经正式 `step`、replay 与模拟的帧后消费者（把事件留到多个 tick 后才读）断言；不把 Runtime 订阅者当作规则入口。

## 完成证据

- **基线：** 认领提交 `672dbeb`（20、22、35 已集成）。
- **导弹计时字段的拒绝（CR-01 检查 5）：** [guidance.ts](../../../../../src/core/rules/guidance.ts) 新增导出的 `invalidGuidanceField`，返回 +0x44、+0x48、+0x54 中第一个不是时钟（非负安全整数）的字段，或不在 i32 内的 +0x58，否则 null；`initialGuidance` 的记录守卫改用它（再加原有的引信半径平方有限 f32 检查）。[rule-data.ts](../../../../../src/core/world/rule-data.ts) 的 `buildRuleData` 对可达导弹记录调用同一判定，以 `CoreInputError` 拒绝在 `input.craftInfo.content.missiles[i].<字段>`，原因为固定文本；不可达记录不读。所以世界创建接受的导弹不会在首次回调时以 `guidance.record` 故障。[P3-02 spec 的 CR-01](../../02/spec.md#cr-01-世界创建输入与静态规则数据d-01) 检查 5 补入对应一句，并在其审批节加了一条修订记录（同 34 对炮 +0x24 的记法）。
  - **契约文字的更正（按推荐方案处理，不需改契约）：** 本项工作范围写“+0x44、+0x48 读作 i32，实际可能为负的是后两者”。实际上内容读取器把 +0x48 读作 `readInt32`（0 至 2³¹−1），所以负的 +0x48 在内容层就以 `ContentContractError` 拒绝；+0x54 为 u32、+0x58 为 i32 同样由读取器保证。经内容到达 CR-01 检查的只有负的 +0x44。共享判定仍覆盖四个字段，P3-02 的那句按实际读取写明；测试分别核对 +0x44 的 `CoreInputError` 与另三个字段的 `ContentContractError`。
  - **合成夹具（执行者选择）：** 改共享夹具 `missile()` 的默认 +0x44 为 320（5 秒），而不在世界层覆盖。理由：App 的任务场景经 original-data 的转换夹具（`production-rule-data.test-support.ts` → `defaultCraftInfo` → `syntheticCraftInfo` → `missile()`）取得导弹记录，世界层夹具 `craftInfoContent()` 覆盖不到它们，而那些文件不在写入范围内。没有内容解码测试依赖 −11（i32 的负值仍由 +0x34 = −8、+0x58 = −13 覆盖），所以不需要显式覆盖。只因此失败的是 [rule-data.test.ts](../../../../../src/core/world/rule-data.test.ts) 的静态规则数据期望（导弹 1 的射程改为 320 × 1/64 × 64 = 320，平方 102,400）。去掉了 22 在 [game-session-replay.test.ts](../../../../../src/app/session/game-session-replay.test.ts) 中的 `flyable` 局部覆盖，测试期望不变。
  - **测试：** rule-data.test.ts 新增一项：+0x44/+0x48/+0x54 为 0 与 i32/u32 边界被接受；+0x44 = −1、−2³¹ 以 `CoreInputError` 拒绝；负的 +0x48、+0x54 与越界的 +0x58 由读取器拒绝；未挂载的导弹 0 的负 +0x44 不读。[guidance.test.ts](../../../../../src/core/rules/guidance.test.ts) 核对判定与 `initialGuidance` 对同样的记录（含负的 +0x54、非整数寿命）故障，判定接受的边界记录不故障。[combat-replay.test.ts](../../../../../src/core/replay/combat-replay.test.ts) 核对负寿命的内容在 replay 中拒绝于 `content.craftInfo.content.missiles[1].at44`。
- **连锁**（新增 [combat-chains.test.ts](../../../../../src/core/systems/combat-chains.test.ts)，全部经正式 `step`；期望由测试设置的记录、位置与计时手算）：
  - **一次死亡：** 玩家（护盾 0、船体 701）在同一 tick 中先受导弹起爆 700（剩 1），再被第一发弹丸 30 击毁；第二发弹丸的遍历停在已被毁的玩家而不造成任何事，继续飞行（H4）；碰撞阶段的伤害只到接触方。事件为 `missile-ended`、`hit`(玩家)、`hit`(接触方)、`hit`(玩家)、`object-destroyed`(玩家，`delayed`，攻击者为发射者，类别 1)、`hit`(接触方碰撞)；之后 10 tick 再无死亡与对玩家的 `hit`。另一项：被击毁的机体成为被毁源，同 tick 的第二发弹丸不再命中它，击杀计数 1。
  - **归因：** 发射者在同 tick 的请求处理中离开后，其导弹（`missile-ended` 的发射者为 null）与弹丸的命中和击毁都为 `lost-shooter`、类别 1，击杀计数不变。
  - **CR-13 交接（P3-11 未接入）：** 玩家第 1 tick 被毁；第 98 tick（时钟 196 > 2 + 0xC0）构造爆炸与逃生舱并跟随；第 99 tick `explosion-started`，第 100 tick `source-released`（`removed: false`）；之后玩家此前射出的弹丸击毁敌机，仍计玩家的击杀（类别 0）；第 259 tick（时钟 518 = 198 + 0x140）`fragment-expired`（`escape-pod`），跟随清除、舱离开；此后到第 400 tick 没有任何事件，玩家实体仍在（被毁源、船体 ≤ 0），任务状态仍为 `built`，没有伪造的救援、计数或失败。玩家能量耗尽只在转换时发一次 `energy-depleted`，下一次耗尽更新不再发，未伪造信标或失败。代码中 CR-13 的位置只有注释，没有空函数或待处理标志（damage.ts、destruction.ts、energy.ts 的模块注释）。
  - **一个 tick 的次序（CR-06）：** 一个 tick 内同时有：命令结果与 `left-page-changed`；请求处理中的 `shot-fired`、导弹起爆（`missile-ended`、`hit`、`object-destroyed`）、`explosion-started`、`source-released`、`fragment-expired`；移动阶段的弹丸 `hit`；碰撞的两个 `hit`；能量的 `energy-depleted`；停放更新的 `object-left-world` 与停放交战 `hit`；帧尾的 `target-cleared`。顺序与 CR-06 一致，且比较器的 `TickOrder` 接受。
  - **延迟消费：** 消费者保留 60 tick 的事件列表，最后才读：受击者、弹丸与爆炸都已移除，事件仍与发出时的 JSON 相同、深冻结，并自带种类、位置、来源、攻击者种类与护盾/船体前后值，不需按 ID 查实体。
- **快照：** 审阅 [snapshot.ts](../../../../../src/core/replay/snapshot.ts)，未发现遗漏，不改：对象写入器由 `canonicalMembers` 的类型强制覆盖每个成员；联合写入器（表现选择器 5 种、名称 4 种、扰动、碎片到期、内容来源）逐一核对；静态规则数据不在其中。既有 snapshot.test.ts 的“任一值改变都改变文本”覆盖每种运行时种类的全部可选部分。新的 combat-replay.test.ts 核对每个检查点的哈希等于该 tick 会话快照的哈希，且这些检查点含弹丸（计时、线性块）、导弹（G、机体块）、爆炸（激活）、碎片（到期、旋转块、表现）与玩家的新字段（击杀、射击统计、左显示屏页、档位、挂点冷却与弹药）。
- **replay：** combat-replay.test.ts 以创建的世界录制 120 tick 的无替身战斗：玩家炮击毁正前方的机体（第 5 tick 命中，可由 62.5/tick 推出），爆炸激活、第 0 部件交接，导弹起爆，碎片撞击玩家，目标的选择与清除，武器、页面与档位命令。JSON 往返后的 replay 与录制的事件和每个检查点一致，比较器一致；每 tick 读取 projection、Render State 与快照与不读取（`recordScript`）的录制完全相同；去掉第 3 tick 的开火在第 3 tick 报事件差异；坏版本、前一与后一规则版本、未知开火通道拒绝；炮伤害、导弹寿命、DEBRIS（同时改变模型部件数）与爆炸帧数任一改变都以 `record.setupHash` 拒绝。
- **比较器的修复：** [compare.ts](../../../../../src/core/replay/compare.ts) 的 `TickOrder` 原来不检查 CR-06 的“每个对象只被毁一次”：同一 tick 中同一实体的第二个 `object-destroyed`，或其被毁之后对它的 `hit`，现在都拒绝。只在 tick 内检查，因为 P3-11 的救援以后可能复用玩家的 ID。[compare.test.ts](../../../../../src/core/replay/compare.test.ts) 加两项拒绝用例。其他字段的读取已由类型强制，未发现遗漏。
- **容量：**
  - [limits.ts](../../../../../src/core/contracts/limits.ts) 的依据注释与 CR-14 一致，并按代码路径核对：`hit` 的各项（每发弹丸至多一次、起爆对范围内每个机体一次、玩家碰撞每个接触 2 次、碎片接触各一次、A 组对 2 次、停放多目标每个候选一次），每个存活对象的自身更新至多 2 个请求（爆炸待移除时的释放与离开、第 0 部件碎片的交接与到期），导弹的 `steer` 单列。注释与数值都未改，未通知协调者。既有 [limits.test.ts](../../../../../src/core/contracts/limits.test.ts) 已覆盖每个上限的 limit/limit + 1 与 CR-14 的算术，本项不改它。
  - 事件 32,768：32 个导弹在同一点起爆，每个命中 1,023 个机体，加 32 个 `missile-ended`，恰为 32,768 并通过；再加一个熄火的导弹即在第 32,769 个事件处以 `budget-exhausted`/`pipeline.events` 故障，不返回任何事件，此后 `step`、快照、projection 与 Render State 都抛出同一故障对象（锁存）。
  - 二次项：A 组 181 个机体互相接触 32,580 次 `hit` 通过，182 个（32,942）故障并锁存；停放多目标 181 × 181 = 32,761 通过，182 × 182 = 33,124 故障并锁存；起爆见上。
  - 效果创建：弹丸、导弹、爆炸、爆炸加两片碎片各在实体表恰好填满时创建成功，多一个实体即以 `entities.count` 故障并锁存，不静默丢弃。
  - 请求 16,384：当前规则的结构上界远小于它（实体自身更新各至多 2 个，加生成与命令），正式 `step` 无法到达。测试经正式的 `registerTick`/`runTick`：先在队列中放入 16,384 − 6 个无效 ID 的离开请求，该 tick 的规则恰好再投递 6 个（发射的延迟计数、离开、导弹到期、爆炸激活、交接、碎片到期，数目与次序独立写出），事件与不预填时相同；多预填一个即在规则投递处以 `pipeline.requests` 故障。确切的边界另由 pipeline.test.ts 覆盖。
- **修复：** 连锁、replay 与容量没有暴露规则缺陷，没有改规则代码。
- **其他：** 两处过时的测试注释按协调者的批准更新：[combat.test.ts](../../../../../src/core/projections/combat.test.ts)（开火为何没有射出：现在是为了只比较读取）与 [snapshot.test.ts](../../../../../src/core/replay/snapshot.test.ts)（运行时种类离开，是因为 `busyCombat` 的状态不足以运行其回调；已确认不离开会以 `hit-tests.debris` 故障）。
- **检查：** `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts` 80 个文件 2,305 项通过；`pnpm typecheck`、`pnpm lint` 通过；`pnpm check`（Vitest 264 个文件 7,878 项、build）通过，build 的大块警告为既有；`pnpm check:compliance` 通过（`passed: true`）。新增测试单独运行约 1 秒，最重的一项约 0.2 秒。
- **rubber-duck：** 无阻塞问题；确认比较器的新检查与当前规则兼容（各伤害入口都挡下已被毁的受击者，ID 单调，按 tick 复位保留 P3-11 复用玩家 ID 的余地）。采纳：+0x48 的契约文字与实现不符，按上文更正记录并在 rule-data.ts 注明只有 +0x44 可经内容到达；请求测试的数目改为独立写出的序列与常数；“多次命中”用例改为玩家先受两次 `hit` 再被毁；去掉一项在 `hit` 检查处就失败、与另一项重复的比较器用例。
- **simplify：** 采纳：测试的内容只读一次；机体用 `stillEntityInit`/`entityInit` 构造，大批量机体从一个初始化数据分配（分配会复制），容量测试由约 100 毫秒降到约 20 毫秒；交接碎片与爆炸的构造提为辅助；次序检查不再 JSON 复制；不读取的录制用 `recordScript`；伪造的爆炸动画从 `animationsContent` 改。未采纳：世界创建只检查 +0x44 而不共用判定（违反本项“共用一个判定”的要求）；按整次结果跟踪被毁（与 P3-11 复用玩家 ID 冲突）；为上限测试注入较小的预算（`CORE_LIMITS` 冻结，本项要求真实上限的回归，耗时可接受）；把比较器的两个集合合为一个 Map（收益很小）。
- **文档影响：** `docs/original/` 无新事实，U 项不变。[core.md](../../../../engineering/modules/core.md) 第 322 行对 `TickOrder` 的描述仍是 P3-06 时的内容，没有 P3-07 的阶段、导弹命中在起爆之后与本项的被毁检查；在写入范围外，交 28。工程指南的命令与检查规则不变。STATUS、tasks.md 无变化。

