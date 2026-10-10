---
type: plan
status: active
phase: P3
task: "02"
subtask: "08"
updated: 2026-10-10
---

# 08 — 正式快照、哈希、录制、replay 与比较

**契约来源：** [spec](../spec.md) 的 S-08；AC-11、AC-12；[快照、哈希与 replay](../spec.md#快照哈希与-replay)、[持久化与兼容](../spec.md#持久化与兼容)、技术决定 9、10。
**依赖：** 07。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **快照：** `snapshot()` 返回深度冻结的 `{ format: 'osr-game-snapshot', version: 1, rulesVersion: 1, state }`。`state` 包含：完整内容身份、任务 Asset、`setupHash`、原始难度、组、槽位、僚机、种子、每 tick 单位数；tick、时钟、RNG 状态、下一个实体 ID；实体与各种类表的次序；生成队列与开关、缺省后的运行记录及别名关系、声明与编组的计数和当前对象关联、名称占用；任务状态与玩家状态。静态 `MissionSetup` 不复制。故障锁存后拒绝快照。不提供从快照恢复世界。
- **规范文本与状态哈希：** 用 04 的写入器按规范字段次序序列化；实体按 ID 排序，有语义的列表保留次序；状态哈希为 16 位小写十六进制。
- **录制：** 录制会话的行为与世界相同，另记录每个成功 tick 实际交给 `step` 的规范输入、全部事件与检查点：tick 0、`checkpointInterval` 的每个正整数倍与最后一个 tick（去重）；零 tick 录制也有 tick 0 检查点。导出深度冻结且脱离世界。预计超出录制容量时在执行下一 tick 前拒绝，世界与录制不变；故障后导出报告失败，不输出貌似完整的前缀。
- **replay 记录：** `{ format: 'osr-game-replay', version: 1, rulesVersion: 1, producer, content, mission, setupHash, run, checkpointInterval, ticks }`；`content` 为完整 `ContentIdentity`，用 `contentIdentityKey` 比较；`producer` 为非空、有长度上限的应用版本标识，只作诊断；`run` 为含默认值的有效配置；`ticks` 为稠密数组。
- **replay：** 先校验整份记录与输入边界，再在独立世界中执行；未知格式或版本、`rulesVersion` 不符、内容身份或 `setupHash` 不同、任务或配置不同、字段不合法或超限都抛出 `CoreInputError`，不返回部分结果。结果为 `{ events, checkpoints, finalTick }`。
- **比较：** 校验 expected 与 actual 后返回 `{ match: true }` 或 `{ match: false, tick, kind }`，`kind` 为 `events`、`checkpoint` 或 `length`；规则按 spec：共有 tick 内先比事件再比检查点；较短运行末帧单独附加的尾检查点不误判；共有部分一致而长度不同时在较短运行的首个缺失 tick 报告 `length`。只报告最早可观测分歧。
- **版本：** `rulesVersion` 由代码持有；在 Core 模块说明（11）中写明何时必须递增。
- **测试：** 快照逐字段代表性变更改变规范文本（不宣称哈希无碰撞）；字段插入次序无关；JSON 往返后 replay 的事件与全部检查点相同；零 tick、末 tick 去重、间隔大于 1、超限前原子拒绝与故障导出；篡改输入后的分歧定位，以及无可观测影响时不强求分歧；未知版本、坏 expected/actual、同一内容身份但改了 setup、错任务或配置、超限记录均被拒绝；固定的一组种子证明随机分支被使用。

## 不包含

- replay 文件的下载、保存与浏览器录制（P3-04）；存档与恢复（P4）。
- 合成快照与 replay 格式（保持不变）。

## 关键文件与契约

- [synthetic-replay.ts](../../../../engineering/source-structure.md#r1-合成-core)：比较算法可借鉴，但不复用为正式格式，也不从正式模块导入。
- [content-identity.ts](../../../../../src/content/content-identity.ts)：`contentIdentityKey`。
- 04 的规范文本与上限；05、07 的世界状态。
- 计划新增：`src/core/replay/snapshot.ts`、`recording.ts`、`replay.ts`、`compare.ts` 及相邻测试（文件名可调整，职责不变）。

## 写入范围

- `src/core/replay/**`：快照、录制、replay 与比较及测试（新建）。
- `src/core/world/**`：为快照暴露内部状态的只读访问（如需要）。

## 验收标准

- [x] AC-11：快照规范文本包含全部可影响未来结果的状态；逐字段变更的测试通过；插入次序无关；语义列表次序保留；转义与哈希格式符合契约。
- [x] AC-12：JSON 往返后 replay 一致；录制边界与原子拒绝；比较报告最早可观测的 events/checkpoint/length 分歧；各类无效记录与伪造 setup 被拒绝且不输出成功前缀；种子集覆盖随机分支。
- [x] 故障锁存后快照与录制导出按契约拒绝。
- [x] `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts`、`pnpm typecheck`、`pnpm lint` 通过；完成前运行 `pnpm check`。

## 验证方法

- Vitest 单元测试（Node，合成逻辑内容与固定种子集）；内容身份与 setup 的绑定用伪造的同身份不同 setup 测试。
- 不涉及浏览器或原版对照。

## 完成证据

2026-10-09，worker 分支 `exec-p3-02-08`（基于认领提交 `00da5e9`）。

**实现**（`src/core/replay/`，另改 `src/core/world/world.ts`）：

- [rules-version.ts](../../../../../src/core/replay/rules-version.ts)：`RULES_VERSION = 1`，注释写明何时递增：流水线阶段或次序、数值语义、RNG 抽取或次序、动作解释、规则发出的事件或保存的状态，凡同一配置、内容与输入可能得到不同结果的修改；快照或 replay 记录的结构变化递增各自的 format version。
- [snapshot.ts](../../../../../src/core/replay/snapshot.ts)：`takeSnapshot`（内部，供 `World.snapshot()`）返回深度冻结、脱离世界的 `{ format: 'osr-game-snapshot', version: 1, rulesVersion, state }`。`state` 是 `WorldState` 除静态 `setup` 外的全部：`config`（完整内容身份、任务、setupHash、原始难度、组、槽位、僚机、种子、每 tick 单位数）、tick、clock、rngState、nextEntityId、`entities`（按 ID）、`kindOrder`（全种类遍历次序的 ID）、`spawn`（frame、缺省后的记录及其声明引用即别名关系、所选僚机记录、编组布局/计数/首成员、队列、开关、名称池计数）、missionStatus、player。名称占用由持有名称的实体表示。`snapshotText`/`snapshotHash` 为每个类型写一个显式成员写入器，映射类型在编译期要求每个成员恰好写一次（临时删去或多加一个成员时 `tsc` 报错，已核实）；实体按 ID 排序写出，其余列表保持次序；状态哈希是整个快照（含版本）规范文本的 fnv1a64。
- [world.ts](../../../../../src/core/world/world.ts)：`World.snapshot()`，与 projection/renderState 一样受故障锁存。
- [recording.ts](../../../../../src/core/replay/recording.ts)：`createRecordingSession(input, { producer, checkpointInterval })` 返回同时是 World 的录制会话，`exportRecording()` 返回深度冻结的 `{ record, result }`。record 字段依次为 `format, version, rulesVersion, producer, content, mission, setupHash, run, checkpointInterval, ticks`，run 含默认步长，ticks 是实际交给 step 的规范副本（字段按契约次序，−0 记为 0）。检查点为 tick 0、间隔的每个正整数倍与最后一个 tick（导出时补，去重）。容量由 `requireRecordingCapacity` 在执行前检查 tick、命令与事件：事件数在执行前未知，按 `eventsPerTick` 上界预计，因此事件容量最后的 4,096 个不会用到；检查点不单独检查（recordedCheckpoints = recordedTicks + 1，间隔 1 也装得下）。超限以 `CoreInputError`（path `recording`）拒绝，世界与录制不变。会话锁存世界在 step 或读取中抛出的 `CoreFaultError`；检查点状态无法写成规范文本时锁存为 `invariant-violated`/`recording.checkpoint`；此后包括导出在内的每次调用都抛出该故障。producer 为 1–128 个 UTF-16 码元的字符串。`recordState`（内部）供 replay 与测试。
- [replay.ts](../../../../../src/core/replay/replay.ts)：`replayRecord(record, content)`，content 为 `Omit<CreateWorldInput, 'run'>`。先校验整份记录：先 format、version、rulesVersion（另一版本即使字段不同也报版本），再精确字段、producer、content（`readContentIdentity`，其 `ContentContractError` 转为 `CoreInputError`）、mission、setupHash 格式、run 字段齐全（含默认步长，取值由世界创建校验）、interval 与 ticks（长度在读取元素前检查，逐 tick 校验，累计命令不超过 recordedCommands）。随后在创建前比对 `contentIdentityKey`；创建世界（`input.run…` 的错误改记为 `record.run…`，其余 `input…` 改为 `content…`，内容 Asset 与身份的 `ContentContractError` 保留类型）；比对 mission 与 setupHash；最后按记录的间隔录制执行，tick 的 `CoreInputError` 记在 `record.ticks[k]`。任何失败都抛出，不返回部分结果。
- [compare.ts](../../../../../src/core/replay/compare.ts)：`compareReplayResults(expected, actual)` 先校验两侧：字段、finalTick ≤ recordedTicks、检查点 ≤ recordedCheckpoints 且从 0 严格递增到 finalTick、哈希格式、事件按 `DomainEvent` 联合逐字段、tick 在 1–finalTick 且不减、每 tick ≤ eventsPerTick、每 tick 命令结果的 commandIndex 从 0 连续、命令结果共 ≤ recordedCommands、事件 ≤ recordedEvents。然后在共有 tick 内逐 tick 先比事件再比检查点；较短运行末帧单独附加的尾检查点在较长一侧没有采样时不算差异；共有部分一致而长度不同时在较短运行的 finalTick + 1 报 `length`。返回冻结的 `{ match: true }` 或 `{ match: false, tick, kind }`。

**检查：**

- 新增 127 项：[snapshot.test.ts](../../../../../src/core/replay/snapshot.test.ts) 13、[recording.test.ts](../../../../../src/core/replay/recording.test.ts) 28、[replay.test.ts](../../../../../src/core/replay/replay.test.ts) 32、[compare.test.ts](../../../../../src/core/replay/compare.test.ts) 54，合成内容来自 [replay.test-support.ts](../../../../../src/core/replay/replay.test-support.ts)。[world.test.ts](../../../../../src/core/world/world.test.ts) 的方法列表、三处锁存与两处读取断言加入 snapshot；[world.test-support.ts](../../../../../src/core/world/world.test-support.ts) 的 `stateText` 由临时的通用写入改为正式快照的规范文本，05/07 的状态比较因此改用正式快照，全部通过。
- `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts`：37 个文件、1,046 项通过。`pnpm typecheck`、`pnpm lint` 通过。`pnpm check` 通过：181 个文件、5,273 项，生产构建成功（大 chunk 提示为既有输出），load 约 4–5。
- **AC-11：** 形状、字段次序、配置与无 setup（规范文本不含 `MARKER` 名称）；深度冻结、每次新副本、读取不改世界、后续 tick 不改旧快照。逐字段：对带僚机、两个编组首 tick 后的世界加上池名称与无名的运行时实体，把 `WorldState` 除 setup 外每个标量与空列表（6 种形状的代表实体的每个字段，以及全部记录、编组、队列项、计数与配置）各改一处，规范文本都改变（439 处；联合判别字段不改，可空对象字段由同字段的非空实例覆盖）；顶层字段集合固定，新增字段会使测试失败。nextEntityId 在分配后移除时仍改变文本。实体按 ID、kindOrder 等于独立推出的“种类升序、同种类按 ID”的遍历次序且不同于 ID 次序，移除后两者都去掉该 ID。插入次序无关：键序全部反转、JSON 往返、实体集合倒序得到同一文本，键序反转的创建输入得到同一快照。语义列表：队列、kindOrder、名称池计数、记录、编组布局倒序都改变文本。转义与哈希：文本为可打印 ASCII，非 ASCII 写为 `\uXXXX`，−0 与 0 同文，非有限值以 `CoreInputError` 报告其路径，哈希等于文本的 fnv1a64 且为 16 位小写十六进制。不宣称无碰撞。
- **AC-12：** 带僚机切片形任务在 64 单位/tick 下录制 305 tick（含 301 tick 编组 2 的 6 个实例、100 余个命令结果、间隔 7、尾检查点 305），JSON 往返后 replay 的结果与录制 `toEqual`，比较为 match；零 tick、间隔整除长度、间隔 1，以及 original-import 身份、默认步长的录制同样往返一致。录制会话与同输入的世界逐 tick 事件、projection、Render State、快照相同；检查点哈希等于并行世界在 tick 0、3、6、7（导出时）与 9 的快照哈希，先前导出不变；间隔 1、4、1000 的检查点集合。会话拒绝坏输入后导出与快照不变且可继续。容量：`requireRecordingCapacity` 的 tick、命令、事件各在 limit 与 limit + 1；会话实测录满 131,072 tick 与 262,144 个命令后，下一 tick 以 `recording` 拒绝，快照与导出不变，空命令 tick 仍可录。分歧：改动第 40 tick 的命令报 `{ tick: 40, kind: 'events' }`；只改轴（尚无效果）为 match；改种子报 tick 0 的 checkpoint；截短到 100 tick 双向报 `{ tick: 101, kind: 'length' }`，不把 100 的尾检查点算作差异。比较的手写结果覆盖：多/少/改字段/改次序/移到后一 tick 的事件、同 tick 事件优先、更早检查点优先、哈希不同、单侧检查点、较短尾检查点豁免与非豁免、长度在先前差异之后、−0 与 0 相同。拒绝（全部为 `CoreInputError`，无结果）：未知 format/version（含另一版本带其他字段）、rulesVersion、多/缺字段、producer、身份结构、mission、setupHash 格式、run 缺默认步长/奇数步长/负僚机/小数种子、间隔 0、tick 空洞、坏轴、未知命令、非对象记录；另一身份（`record.content`）、另一任务（`record.mission`）、同一身份下改了一个坐标的伪造内容（`record.setupHash`）；内容不接受的 run（难度组、僚机越界、original-import 的非默认步长，都在 `record.run…`）；内容参数多字段、错 Asset（`content…`）与身份结构错误（保留 `ContentContractError`，`content.identity…`）；超过 131,072 个 tick（稀疏数组，读取元素前）与 262,145 个命令（在 `record.ticks[4096].commands`）。比较的 expected/actual 两侧各 35 类坏结果，以及每 tick 4,096/4,097 个事件、262,144/262,145 个命令结果。种子集 1–8：各自 replay 一致；矩形放置的首个记录 8 实例位置与创建时抽取的 +0x78 缺省都不止一种取值，不宣称任意两种子不同。
- **故障：** 世界锁存后 `snapshot()` 抛出同一错误，读取快照时失败锁存为 `world.snapshot`。录制会话在 step 故障后，导出、step、projection、renderState、snapshot 都抛出同一故障；读取故障发生在检查点对齐的 tick 后，导出仍失败；检查点状态含非有限值时锁存为 `recording.checkpoint` 且原因为 `CoreInputError`；故障从不是 `CoreInputError`。
- **重型用例：** 按 13 的做法放进 30 s deadline 的用例组并旁注实测依据：录制满 tick 与满命令（各 0.3–0.4 s，load 4–5），比较 26 万余事件的结果（各约 0.33 s）。事件容量没有端到端录满：实测需要 52 万余事件、约 250 MB 堆，改为直接测 `requireRecordingCapacity` 的边界，会话的 tick 与命令容量用同一函数并已端到端验证。

**Rubber-duck：** 两项均采纳：① 比较的结果校验未限制每 tick 事件数与命令结果总数，已加入并补 limit/limit + 1 测试；② producer 的可打印 ASCII 限制超出 spec 的“非空、有长度上限”，改为 1–128 个码元的任意字符串。

**Simplify：** 采纳：正整数规则改用 `integerIn`；run 的取值只由世界创建校验，记录只要求字段齐全；`ReplayContent` 改为 `Omit<CreateWorldInput, 'run'>`；比较内部的校验副本不再冻结；删去一处重复的比较断言；比较的满命令用例只读取一个大结果。未采纳：复用 `systems/pipeline.ts` 的 `frozenCopy` 与在 `contracts/` 旁提供 `readDomainEvent`（在写入范围外，建议 12 或后续任务合并）；为录制与 replay 增加跳过重复校验的内部 step 入口、流式哈希与尾检查点缓存（增加入口与状态，收益只在长录制的输入复制与检查点）；让读取器接受根路径以免字符串改写路径（需改 `contracts/` 与世界创建）；把快照移到 `world/`（与 projection 在 `projections/` 的布局一致，没有运行时循环依赖）；删去端到端容量用例（它们是会话原子拒绝的唯一端到端证据）。

**文档影响：** 写入范围只有 `src/core/**`；`docs/original/` 无新事实，U 项不变。建议 11：[Core 模块说明](../../../../engineering/modules/core.md) 写入 `World.snapshot()`、`GameSnapshot`/`takeSnapshot`（内部）/`snapshotText`/`snapshotHash`、`RULES_VERSION` 的递增规则、`createRecordingSession`/`RecordingSession`/`exportRecording`/`recordState`（内部）/`requireRecordingCapacity`、`ReplayRecord`/`ReplayResult`、`replayRecord`、`compareReplayResults`、producer 上限 128、事件容量按 `eventsPerTick` 预计的策略；[源码结构指南](../../../../engineering/source-structure.md) 加入 `core/replay/` 的职责。[工程约定](../../../../engineering/README.md)测试一节写着只有 13 的两处声明 30 s deadline、“其余用例沿用默认值”，现在另有录制与比较的两个 limit-sized 用例组，需同步。STATUS 与阶段索引无需修改。
