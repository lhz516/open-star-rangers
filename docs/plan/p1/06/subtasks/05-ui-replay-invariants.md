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

- [ ] AC-14：有/无桥接及两种采样时间表下，事件流、录制、replay 比对结果与状态哈希完全一致；比对结果为 `{match: true}`。
- [ ] AC-07（记录部分）：暂停取消的命令不出现在逐 tick 记录中；记录不含 runId、commandId、控制、采样时间或 UI 结果。
- [ ] 重启后的记录从 tick 0 独立开始，旧导出的 JSON 不变。
- [ ] 目标 Vitest 与 `pnpm check` 通过；仅声明同版本、同运行时一致。

## 验证方法

- `pnpm exec vitest run src/ui/game/synthetic-game-replay.test.ts src/app/session src/core/synthetic`；`pnpm check`。
- 事件流用 `onAny` 记录 `[type, tick, commandIndex, commandId]`；采样时间表只改变桥接时钟值，不改变宿主 nowMs。
- 若无生产代码改动，不运行 simplify，并在证据中说明；文档影响检查确认 replay 格式说明无需变化。

## 完成证据
