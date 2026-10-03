---
type: plan
status: active
phase: P1
task: "06"
subtask: "05"
updated: 2026-10-02
---

# 05 — UI 接入的 replay 与确定性不变量

**契约来源：** [spec](../spec.md) 的 S-08，AC-07（取消不入记录）、AC-14，以及“持久化与兼容”。
**依赖：** 04。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 新增 Node replay 对照测试，用相同场景配置、宿主帧时间、逐 tick 输入和实际执行的命令，比较三种运行：
  - 不接桥接的会话；
  - 接入桥接并使用采样时间表 A；
  - 接入桥接并使用不同的采样时间表 B。
- 覆盖同 tick add→remove、暂停取消，以及重启后的独立记录。checkpointInterval 使用 1 与 4，复用 P1-03 记录格式。
- 断言三者的 Core 事件流、`exportRecording()`、JSON 往返后的 `replaySyntheticRecord` 比对结果及状态哈希一致。
- 断言读取投影与写入反馈不改变 tick/RNG；控制、runId、commandId、采样时间、UI 错误、取消与未确认结果均不出现在记录中。重启后的新记录从 tick 0 开始，旧导出不变。
- 预期不需要生产代码修改。若对照失败，只能修复 `src/ui/game/` 的读取副作用；不得修改 Core/Runtime/Session 或放宽断言。

## 不包含

- 跨浏览器或跨版本的逐位一致承诺；浏览器验证（08）。
- 新录制字段、格式版本或 replay 导入导出 UI。

## 关键文件与契约

- [synthetic-replay.ts](../../../../../src/core/synthetic/synthetic-replay.ts) 的 `replaySyntheticRecord`、`compareSyntheticReplayResults`（已有，只读）。
- [会话录制测试](../../../../../src/app/session/synthetic-session-replay.test.ts)（已有对照先例）。
- 计划新增：`src/ui/game/synthetic-game-replay.test.ts`。

## 验收标准

- [x] AC-14：有/无桥接及两种采样时间表下，事件流、录制、replay 比对结果与状态哈希完全一致；比对结果为 `{match: true}`。
- [x] AC-07（记录部分）：暂停取消的命令不出现在逐 tick 记录中；记录不含 runId、commandId、控制、采样时间或 UI 结果。
- [x] 重启后的记录从 tick 0 独立开始，旧导出的 JSON 不变。
- [x] 目标 Vitest 与 `pnpm check` 通过；仅声明同版本、同运行时一致。

## 验证方法

- `pnpm exec vitest run src/ui/game/synthetic-game-replay.test.ts src/app/session src/core/synthetic`；`pnpm check`。
- 事件流用 `onAny` 记录 `[type, tick, commandIndex, commandId]`；采样时间表只改变桥接时钟值，不改变宿主 nowMs。
- 若无生产代码改动，不运行 simplify，并在证据中说明；文档影响检查确认 replay 格式说明无需变化。

## 完成证据

- 2026-10-02：新增 [synthetic-game-replay.test.ts](../../../../../src/ui/game/synthetic-game-replay.test.ts)，5 项通过；没有生产代码改动。三种模式驱动相同的宿主帧、逐 tick 输入与实际执行命令（种子 7、50 Hz）：不接桥接、接桥接且采样时钟为 1 倍宿主时间、接桥接且为 10 倍宿主时间。脚本覆盖同 tick add→remove、暂停取消、显式恢复、补跑上限与重启。
- AC-14：
  - 检查点间隔 1 和 4 下，三种模式的事件流与两次运行的导出记录（含逐个检查点状态哈希，哈希包含 rngState）完全相等。
  - 事件流精确为 `[1,marker-added,1,0,1]`、`[1,marker-removed,1,1,2]`、`[1,marker-added,3,0,3]`、`[1,marker-removed,6,0,5]`、`[2,marker-added,1,0,1]`，并与各自记录的 `result.events` 对应。
  - JSON 往返后的 `replaySyntheticRecord` 经 `compareSyntheticReplayResults` 比对为 `{match:true}`。
  - 两种采样表读到的时钟值不同，投影发布序列也不同（10 倍时更多），Core 结果仍完全一致。
  - 每帧额外读取投影与 RenderFrame 不改变 tick 或 RNG。
- 桥接与 feedback 确实参与（防止空集或绕过）：
  - 不接桥接时 store 始终为初始值，也不读时钟。
  - 两种桥接模式的 recentResults 都精确为 accepted 1、2、3，被暂停取消的 4（user-pause），以及 accepted 5；重启后只有新运行的 accepted 1。
- AC-07（记录部分）：
  - 记录只含执行过的三组命令；被取消的 commandId 4 既不出现在 Event Bus，也不进入记录。
  - 记录只有 checkpointInterval/config/format/ticks/version 五个键，不含 runId、commandId、cancel、pause、resume、session-failed、unconfirmed、actionError、nowMs。
  - 重启后的记录从 tick 0 开始；旧导出 JSON 不变。
- 故障路径：用 `vi.mock` 包装真实 Core，在暂停期间产生 actionError，并让恢复后同一帧第二个 tick 失败，store 显示 unconfirmed/session-failed。此时接桥接与不接桥接的导出记录相等，仍不含上述 UI 字段，且 JSON 往返 replay 一致。只声明同版本、同运行时一致。
- rubber-duck 四个问题全部采纳：
  - 事件比较可能空集通过：改为精确事件元组并与记录对应。
  - 采样表除时钟外还有差异，且时钟是否被读取不可观察：两种桥接模式改为只差时钟值，并断言不同的读取值与发布序列。
  - feedback 的结算与取消没有断言：断言两种桥接模式的结果序列，以及不接桥接时 store 未被触及。
  - UI 错误与 unconfirmed 场景缺少激励：新增故障与暂停提交场景。
- 本项只有测试，没有实现代码，因此不执行 simplify。`pnpm check` 通过（33 个文件 / 659 项测试、三个类型程序、ESLint、构建）。
- 文档影响：P1-03 记录格式与版本未变；[工程约定](../../../../engineering/README.md)的 replay 说明仍准确，无需修改。
