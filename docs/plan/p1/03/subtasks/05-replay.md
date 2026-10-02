---
type: plan
status: active
phase: P1
task: "03"
subtask: "05"
updated: 2026-10-02
---

# 05 — 从输入记录 replay

**契约来源：** [spec](../spec.md) 的 S-05（replay 部分）、S-06；AC-08（录制与 replay 结果一致）；AC-10（非法记录部分）；“Replay”一节，持久化与兼容，技术决定 5、7、8。
**依赖：** 04。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 在 `src/core/synthetic-replay.ts` 新增 replay 函数：参数为未知类型的输入记录，返回与 04 同形的 Replay 结果。
  - **校验：** 先校验整个记录的结构，再逐 tick 调用 step。校验内容为格式与版本、`config`（与创建配置规则相同，`tickRateHz` 必填）、`checkpointInterval`（正安全整数）、`ticks` 数组（稀疏数组的缺失项不是空 tick，须按该索引拒绝），以及没有额外字段。
  - **执行：** 在全新实例上依次执行；检查点位于 tick 0、间隔的倍数与最终 tick（`ticks.length`），规则与 04 一致。
  - **错误路径：**
    - 任何非法内容都抛 `CoreInputError`，`path` 以 `record` 开头：顶层或配置错误指向对应字段（如 `record.config.seed`）；某个 tick 内的错误含数组索引（如 `record.ticks[12].commands[0].type`）。
    - `ticks[0]` 对应模拟 tick 1。
    - Core 抛出的 `tickInput.*` 路径与数值守卫错误都改写为 `record.ticks[i]` 前缀。
    - 任何失败都不返回部分结果。
  - **隔离：** replay 不读取或修改原录制会话；同一记录 replay 两次，结果相等。
- 新增 `src/core/synthetic-replay.test.ts`：
  - **AC-08 一致性：**
    - 固定合成记录覆盖 `moveX` 为 -1/0/0.5/1、成功添加与移除、两种拒绝，以及同一 tick 内的 add/remove/add；至少跨两个完整检查点间隔。
    - 在 60 Hz 与 120 Hz、间隔 1 与一个更大间隔下，replay 结果与录制结果精确相等，replay 使用新实例。
    - 间隔大于 1 的用例以非间隔倍数的 tick 结束，验证最终检查点的补充；间隔 1 的用例断言最终 tick 不重复。
    - seed 覆盖 0 与 uint32 上界。
  - **其他 AC-08 条件：**
    - 空记录的结果只有 tick 0 检查点，没有事件。
    - 记录与结果经 JSON 往返后仍一致。
    - 原会话导出后继续运行，不影响已导出记录的 replay；两次 replay 结果相等。
  - **特征锁定（技术决定 7）：** 一段固定记录的检查点哈希在测试中写成字面量。注释说明它只是回归锁，不能证明正确性；有意修改时须在同一改动中更新并说明原因。
  - **AC-10（记录）：**
    - 逐项负向用例覆盖格式与版本、缺失与额外字段、非法 `config`、非法间隔、`ticks` 非数组或有缺失项、tick 内的非法输入，以及恢复不可达的数值守卫。
    - 数值守卫用例可用极小 `tickRateHz` 在第二个 tick 触发位置溢出。
    - 断言错误类型、`path`，以及没有返回部分结果。

## 不包含

- 结果结构校验与比对函数（06）；AC-08 中“比对函数返回一致”的断言由 06 补上。
- 从中途快照 replay、旧版本迁移、持久化。

## 关键文件与契约

- 修改 04 新增的 `src/core/synthetic-replay.ts`；计划新增 `src/core/synthetic-replay.test.ts`（尚不存在）。
- 复用 [synthetic-scene.ts](../../../../../src/core/synthetic-scene.ts) 的 `createSyntheticScene` 与输入校验、[errors.ts](../../../../../src/core/errors.ts)，以及 02 的状态哈希。

## 验收标准

- [ ] AC-08：两种频率、两种间隔、两个 seed 下，replay 结果与录制结果精确相等；最终检查点规则正确；空记录、JSON 往返、导出后继续录制与重复 replay 的条件都满足。
- [ ] AC-08：特征锁定的检查点哈希与测试字面量一致。
- [ ] AC-10（记录）：每类非法记录抛 `CoreInputError`，`path` 正确，没有部分结果。
- [ ] `pnpm exec vitest run src/core` 与 `pnpm check` 通过。

## 验证方法

- 运行上述命令；对实现 diff 按 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 清理后重跑。
- 无浏览器、实机或原版对照。

## 完成证据
