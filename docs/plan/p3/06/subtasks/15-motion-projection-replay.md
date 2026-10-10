---
type: plan
status: active
phase: P3
task: "06"
subtask: "15"
updated: 2026-10-10
---

# 15 — 运动 projection 与 replay 集成

**契约来源：** [spec](../spec.md) 的 S-08；AC-08；[数据模型与契约](../spec.md#数据模型与契约)的运动 projection 行；D-05、D-07、D-08。
**依赖：** 13, 14。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **运动组就绪：** `flight.motion` 为 `{ readiness: 'ready', player }`；`player` 为 null（没有玩家实体），或按检查点 A 定稿的字段：实体 ID、位置、姿态、速度、指令速度、最高速度、`speedLimitStatus`（P3-06 中为 `'initial-only'`）与 `speedAssist: { enabled, engaged }`。没有“最新匹配时刻”。值来自世界、深度冻结且与世界脱离；读取不改哈希。玩家实体存在而缺少移动块或控制状态为 Core 故障。`combat` 保持 `not-implemented`（P3-07）。
- **replay 集成：** 带轴（含变化检测）、同 tick 多命令、目标失效（内部设置）、多次辅助匹配与失去目标的录制经 JSON 往返后 replay，事件与全部检查点相等；新事件通过比较；旧规则版本的记录被拒绝。
- **预算：** 按检查点 A 的核算测试每 tick 事件（≤ 3,201）与请求（≤ 3,138）的上界在 `eventsPerTick` 之内，以及实体上限下快照规范文本长度在 `canonicalTextLength` 之内；`CORE_LIMITS` 不变。
- **测试：** projection 的就绪、null 与故障分支、冻结与脱离；两组分区互不覆盖；持续辅助状态无需事件历史即可读取；replay 往返与拒绝；预算。

## 不包含

- 战斗组（P3-07）；HUD 绘制（P3-13）；Runtime 的录制下载（P3-04）。

## 关键文件与契约

- [projection.ts](../../../../../src/core/projections/projection.ts)、[recording.ts](../../../../../src/core/replay/recording.ts)、[replay.ts](../../../../../src/core/replay/replay.ts)、[compare.ts](../../../../../src/core/replay/compare.ts) 及其测试。
- 10–14 的状态与事件；检查点 A 定稿。

## 写入范围

- `src/core/projections/**`：运动组的就绪与测试。
- `src/core/replay/**`：replay 集成与预算测试。
- `src/core/world/world*.ts`：读取 projection 所需的最小改动。

## 验收标准

- [x] AC-08：运动组与战斗组各自表达就绪且不互相覆盖；无玩家为 null；初值速度上限有明确标识；辅助的开关与“已匹配”可从任一次 projection 读取；输出冻结、脱离世界，读取不改哈希。
- [x] 录制经 JSON 往返后 replay 的事件与检查点一致；旧规则版本被拒绝；事件、请求与文本长度的预算测试通过。
- [x] `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts` 与 `pnpm check` 通过。

## 验证方法

- Node 单元、消费者契约与 replay 测试。
- 按 execute-goal 的流程完成 rubber-duck 审查后，以本项写入范围调用 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。
- 不涉及浏览器（没有消费者的分区在 Node 中做契约测试）。

## 完成证据

- **2026-10-10（worker，基于认领提交 830c8645）：**
  - **运动 projection（D-05）：** [projection.ts](../../../../../src/core/projections/projection.ts) 的 `flight.motion` 改为 `{ readiness: 'ready', player }`，`combat` 仍为 `not-implemented`（P3-07）。`player` 在 `player.entityId` 为 null 时为 null（不伪造零速度）；否则为定稿字段：实体 ID、位置与姿态（冻结的新副本，不与实体共享对象）、移动块的 `speed`/`commandedSpeed`、实体的 `maximumSpeed`、`speedLimitStatus: 'initial-only'`（10 的交接：P3-07 接入实时重算前）与 `speedAssist: { enabled, engaged }`（取自控制状态，没有“最新匹配时刻”）。玩家 ID 不能解析、玩家实体没有移动块或没有控制状态时为 `CoreFaultError('invariant-violated', 'projection.motion')`，由世界锁存。`src/core/world/world*.ts` 不需改动。
  - **replay 集成：** [replay.ts](../../../../../src/core/replay/replay.ts) 新增内部函数 `startReplay`（与 `recordState`、`constructWorld` 同为不公开的内部入口，不接受处理器）：校验记录并按内容建立初始状态，`replayRecord` 改为调用它，行为不变。生产入口在 P3-07 之前不能设置目标、P3-08 之前不能设置 AI 目标点，测试以替身在每个 tick 前写入世界状态（录制与 replay 相同），记录本身仍经 replay 的校验与内容绑定。
  - **测试（合成数据，不读原版文件）：**
    - [projection.test.ts](../../../../../src/core/projections/projection.test.ts)（11 例）：完整 projection 的相等（运动组就绪且各字段取自世界、`initial-only`、组 1 辅助关；战斗组与其余规则分区 `not-implemented`，两组互不覆盖）；玩家实体出现前与被移除后 `player` 为 null；`zero` 命令与运动之后读到的指令速度、当前速度与位置；辅助：一次 `speed-matched` 之后连续 5 个没有事件的 tick 仍读到 `engaged`，关闭保留“已匹配”、开启清除，再次匹配后目标被移除时 `speed-assist-released` 且读到未匹配；深度冻结、每次新副本、位置与姿态不与实体共享、读取前后快照哈希不变、此后改动世界不改变已取出的 projection；三种故障（无移动块、无控制状态、ID 不能解析）锁存。
    - [motion-replay.test.ts](../../../../../src/core/replay/motion-replay.test.ts)（7 例）：合成任务（玩家、身旁辅助种类 7 的敌机、内缩矩形外停放的种类 14 友机；玩家机型改为正的减速率）160 tick、每 tick 一个检查点。输入含按住 8 tick 的偏航、加俯仰后松开、横滚，tick 20 的 7 条命令（两次减速、档位 4、手动匹配、两次开关、`fire`），`zero` 与无目标的确认键；替身：P3-07 在 tick 3、70 选敌机、tick 60 写入无实体的 ID、tick 90 使敌机待移除，P3-08 在 tick 100 使友机以自身位置为目标点。录制经 JSON 往返后 replay 的事件与 161 个检查点全部相等，`compareReplayResults` 接受全部新事件。运行中有 7 次辅助匹配（含速度差标志为真与假）、tick 20 的手动匹配（命令索引 3）与紧随其结果的两次开关事件、tick 21 开启后立即到期的匹配、tick 60 与 91 的两次释放（失效 ID 当 tick 清除；被毁目标下一 tick 清除）、tick 62 的 `no-target` 与一次 `object-left-world`。变化检测：按住的轴改为截断后偏转相同的值（0.507）时无差异，改为另一偏转（0.51）时在该 tick 报 checkpoint 差异；去掉同 tick 的两次开关在 tick 20 报 events 差异；不用替身的 `replayRecord` 在 tick 3 报 events 差异；规则版本 1 与当前 + 1 的记录在运行前于 `record.rulesVersion` 被拒绝（另有 `replay.test.ts` 的既有拒绝用例）。
    - [budget.test.ts](../../../../../src/core/replay/budget.test.ts)（3 例）：按 `CORE_LIMITS` 推导的上界为事件 3,201、请求 3,138，均不超过 `eventsPerTick`。实体上限（2,048）下的两个实际 tick（真实流水线，统计每次投递）：第一个 tick 64 条手动匹配、辅助匹配、单独的轴请求与 2,046 个停放机体同时离开世界——事件 64 个结果、65 个 `speed-matched`、2,046 个 `object-left-world`（P3-06 的项恰为 K + 1 + Lw），请求 64 个 `match-speed` 与 1 个 `control`；第二个 tick 目标失效、64 条加速命令——事件 64 个结果与 1 个释放，请求 65 个 `control` 与 2,046 个 `leave`，之后只剩 2 个实体；两个 tick 都不超过 P3-06 的项（事件 ≤ K + 1 + Lw，玩家请求 ≤ K + 2）与合计上界，没有预算故障。快照文本：每个字段取最长规范写法（25 字符的双精度与 f32、16 位安全整数与 ID、i32 最小值、128 字符的模型 Asset ID、最长的名称、来源与状态变体，移动块的全部可选部分），每个实体 2,651 字符（≤ 4 KiB），其中 P3-06 的飞行状态 1,505 字符（≤ 1.5 KiB），2,048 个实体的快照 5,428,862 字符，在 `canonicalTextLength`（16,777,216）之内且随实体数线性。`CORE_LIMITS` 未改。超出 `eventsPerTick` 的事件与请求为预算故障、规范文本超长被拒绝，分别由既有的 `pipeline.test.ts` 与 `canonical-text.test.ts` 覆盖。
  - **检查：** `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts`：50 个文件 1,591 项通过；`pnpm check`（typecheck、lint、221 个文件 6,974 项测试、生产构建）通过；`pnpm check:compliance` 通过。P3-04 尚未接入正式 Core，浏览器回归不适用。
  - **rubber-duck：** 无阻塞项。一条非阻塞意见已采纳：最坏情况的快照实体原先用 23–24 字符的数值，改为 25 字符的双精度与 f32（测试断言其长度），玩家实体 ID 也改为 16 位，重新测得上述长度。审查确认故障条件与生产状态一致（被毁或 Warp 中的玩家保留移动块，区域检查不遍历玩家种类），`startReplay` 沿用既有内部入口的模式并走完整的校验路径，预算断言不空洞。
  - **simplify：** 采纳：删去与完整相等重复的字段名单测试、恒真的 f32 断言、与精确计数重复的长度断言与重复的读取前后比较（只留哈希），快照副本改用 `structuredClone`。未采纳：与 render-state 共用位姿副本、与 `replay.test.ts` 共用 `recordWith`（各两行且类型不同）；在 `RequestQueue` 上加计数接口（`pipeline.ts` 不在写入范围，测试包装本 tick 的队列实例）；为测量在 `snapshot.ts` 加生产辅助函数；以只用公开输入的场景代替 `startReplay`（P3-07 之前无法设置目标）。
  - **文档影响：** 本项不改文档。[Core 模块说明](../../../../engineering/modules/core.md)第 211 行（`flight` 仍写为未就绪、`FlightReady`）与第 229–230 行（内部函数未列 `startReplay`）已过时，属 19 的同步范围：运动组就绪的字段、`initial-only`、`projection.motion` 故障，以及测试以替身代替未实现的写入者时用 `startReplay` 走 replay 校验。原版事实、ADR、工程约定与 U 项不受影响；STATUS 与阶段索引无需改动。
