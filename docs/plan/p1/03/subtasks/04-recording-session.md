---
type: plan
status: active
phase: P1
task: "03"
subtask: "04"
updated: 2026-10-02
---

# 04 — 录制会话

**契约来源：** [spec](../spec.md) 的 S-04、S-06；AC-07；“录制”一节，数据模型中的“输入记录”“Replay 结果”“录制会话”，技术决定 4、5。
**依赖：** 02。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 新增 `src/core/synthetic-replay.ts`，定义以下类型与常量：
  - **输入记录：** `{ format: 'osr-synthetic-replay', version: 1, config: { seed, tickRateHz }, checkpointInterval, ticks }`。`tickRateHz` 必填，为生效值；`ticks` 为 `TickInput` 数组。
  - **Replay 结果：** `{ events, checkpoints }`。`checkpoints` 为 `{ tick, hash }` 数组。
  - 录制会话类型：实现 `SyntheticScene` 的全部方法，另提供导出当前记录与结果的方法。
- **录制会话创建入口：**
  - 参数为与 `createSyntheticScene` 规则相同的配置，以及一个检查点间隔（正安全整数）。间隔非法时抛 `CoreInputError`；配置错误沿用 `createSyntheticScene` 的 `config.*` 路径。
  - 会话在内部创建并独占一个新场景，不接受外部已有的或恢复得到的场景。
- **step：**
  - step 正常返回时，按顺序追加记录与事件。包含 `command-rejected` 的合法 tick 同样记录。
  - 记录的必须是场景实际执行的那份规范副本：只含契约字段，`moveX` 的 `-0` 记为 `0`。调用者对象只读取一次，避免 getter 等使记录与执行不一致。如需复用 `readTickInput`，可以从 [synthetic-scene.ts](../../../../../src/core/synthetic/synthetic-scene.ts) 增加一个内部导出，不改变 `SyntheticScene` 接口。
  - 抛 `CoreInputError` 的调用不进入记录，之后可继续录制。
  - 录制不修改、不冻结调用者的对象；调用者之后修改配置、输入轴、命令对象或数组，都不影响场景和已录制的数据。
- **检查点：**
  - 位于 tick 0 与间隔的每个正整数倍，在该 tick 完成后用 02 的状态哈希记录。
  - 导出时，若当前 tick 还不是检查点，则在导出结果中追加当前 tick 的检查点；同一 tick 只出现一次。
- **导出：** 返回当时记录与结果的深冻结纯数据。导出不改变场景，之后可以继续录制，较早导出的数据不随后续录制改变。配置省略频率时，记录写入 60。
- 新增 `src/core/synthetic-replay-record.test.ts`：
  - 与同配置、同输入的普通场景并行运行，会话的 step 返回值与读取结果完全相同。
  - 在合法 tick 之间插入非法调用：调用抛错、不进入记录，之后的录制与对照场景一致。
  - 检查点：间隔 1 与间隔大于 1 两种情况；最终 tick 为间隔倍数和非倍数两种情况；同一 tick 不重复。
  - 记录中的 `tickRateHz` 为生效值（省略时为 60）；`moveX` 为 `-0` 时记为 `0`；有业务拒绝的 tick 也被记录。
  - 修改调用者的配置、轴、命令对象和数组后，场景与记录不受影响。
  - 在不同 tick 多次导出：导出结果深冻结；较早的导出不变；导出不改变场景。
  - 非法检查点间隔（0、负数、小数、非数值、超出安全整数）抛 `CoreInputError`。

## 不包含

- 从记录 replay 及记录校验（05）；结果比对（06）。
- 决定是否默认录制、Runtime 接入或持久化（P1-04/05/10）。

## 关键文件与契约

- 计划新增 `src/core/synthetic-replay.ts`、`src/core/synthetic-replay-record.test.ts`（尚不存在）。
- 复用 [synthetic-scene.ts](../../../../../src/core/synthetic/synthetic-scene.ts) 的 `createSyntheticScene` 与类型；可能新增 `readTickInput` 的内部导出。复用 02 的状态哈希。

## 验收标准

- [x] AC-07：只记录正常返回的 step（含业务拒绝），非法调用不进入记录且之后可继续录制。
- [x] AC-07：检查点位于 0、间隔倍数与最终 tick，不重复；`tickRateHz` 为生效值；`-0` 记为 `0`。
- [x] AC-07：记录与调用者对象隔离；导出深冻结且不影响继续录制；会话行为与普通场景完全相同。
- [x] P1-02 现有测试原样通过；`pnpm exec vitest run src/core` 与 `pnpm check` 通过。

## 验证方法

- 运行上述命令；对实现 diff 按 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 清理后重跑。
- 无浏览器、实机或原版对照。

## 完成证据

- **实现：** [synthetic-replay.ts](../../../../../src/core/synthetic/synthetic-replay.ts)
  - 导出常量 `SYNTHETIC_REPLAY_FORMAT`、`SYNTHETIC_REPLAY_VERSION`，类型 `SyntheticReplayConfig`、`SyntheticReplayRecord`、`SyntheticReplayCheckpoint`、`SyntheticReplayResult`、`SyntheticRecording`、`SyntheticRecordingSession`（扩展 `SyntheticScene`，另有 `exportRecording()`），以及入口 `createSyntheticRecordingSession(config, checkpointInterval)`。
  - 会话用私有类 `RecordingSession` 独占 `createSyntheticScene` 新建的场景。
    - step 用 `readTickInput` 只读取一次调用者对象，生成深冻结的规范副本（`moveX + 0`），执行的就是这份副本。场景正常返回后才追加副本与事件，并在间隔倍数的 tick 记录检查点哈希。
    - 导出时若最终 tick 不是检查点，只在本次导出中补一个，不写回会话。
  - 配置错误沿用 `config.*` 路径；非法间隔抛 `CoreInputError`（`checkpointInterval`）。
  - [synthetic-scene.ts](../../../../../src/core/synthetic/synthetic-scene.ts) 只把 `readTickInput` 改为内部导出，`SyntheticScene` 接口不变。
- **测试：** [synthetic-replay-record.test.ts](../../../../../src/core/synthetic/synthetic-replay-record.test.ts)，共 30 项。
  - 与普通场景并行运行 7 个 tick，60 Hz（省略配置）与 120 Hz 下，step 返回值与三种读取逐 tick 严格相同；记录含两个业务拒绝的 tick 及完整事件流。
  - 每个合法 tick 之前插入一次非法调用（`moveX` 越界、未知命令、缺少 `commands`），错误路径与普通场景相同，且不进入记录。`tickRateHz = 1e-308` 下位置溢出被守卫拒绝的 tick 也不进入记录。
  - 检查点：间隔 1、间隔 3 以非倍数或倍数结束、间隔大于运行长度、无 tick 五种情况，与对照场景在 `0`、倍数与最终 tick 的哈希相同且不重复。在非倍数 tick 导出后继续录制，后续检查点不含当时补的那一个。
  - 记录写入生效 `tickRateHz`（省略时为 60），seed `-0` 记为 `0`；`moveX = -0` 记为 `+0`，只含契约字段。getter 只被读取一次，记录的是实际执行的值。
  - 录制不冻结调用者对象；之后修改配置、轴、命令对象和数组，记录与场景都不变。
  - 每个 tick 后导出：结果深冻结，较早的导出在之后的录制中不变；导出不改变场景，之后的录制与从未导出的对照相同。
  - 间隔 `0`、`-1`、`1.5`、`NaN`、`Infinity`、`2^53`、`'2'`、`undefined`、`null` 被拒绝，`MAX_SAFE_INTEGER` 被接受；非法配置的路径与 `createSyntheticScene` 相同。
- **检查：** `pnpm exec vitest run src/core` 通过；P1-02 测试文件未改动；最终 `pnpm check` 通过（typecheck、lint、12 个测试文件共 302 项、build）。
- **审阅：** rubber-duck 未发现问题。
  - simplify 已采纳：事件追加不再用参数展开；简化了导出无副作用的测试。
  - 未采纳：取消输入的二次校验（需要新增受信任的内部 step 接口，而输入很小）；导出的 O(n) 复制（导出不频繁）；删除“间隔大于运行长度”用例（它单独覆盖只有 `[0, 最终 tick]` 的情况）。
