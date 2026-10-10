---
type: plan
status: active
phase: P1
task: "03"
subtask: "05"
updated: 2026-10-10
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
- 复用 [synthetic-scene.ts](../../../../engineering/source-structure.md#r1-合成-core) 的 `createSyntheticScene` 与输入校验、[errors.ts](../../../../../src/core/errors.ts)，以及 02 的状态哈希。

## 验收标准

- [x] AC-08：两种频率、两种间隔、两个 seed 下，replay 结果与录制结果精确相等；最终检查点规则正确；空记录、JSON 往返、导出后继续录制与重复 replay 的条件都满足。
- [x] AC-08：特征锁定的检查点哈希与测试字面量一致。
- [x] AC-10（记录）：每类非法记录抛 `CoreInputError`，`path` 正确，没有部分结果。
- [x] `pnpm exec vitest run src/core` 与 `pnpm check` 通过。

## 验证方法

- 运行上述命令；对实现 diff 按 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 清理后重跑。
- 无浏览器、实机或原版对照。

## 完成证据

- **实现：** [synthetic-replay.ts](../../../../engineering/source-structure.md#r1-合成-core) 新增 `replaySyntheticRecord(record: unknown): SyntheticReplayResult`。
  - 依次校验顶层字段（`requireExactRecord`，要求自有属性、拒绝额外字段）、格式与版本、`config`（`tickRateHz` 必填）、`checkpointInterval`（经 `createSyntheticRecordingSession`）、`ticks` 数组和缺失项。
  - 然后把每个 tick 规范化为深冻结副本（`canonicalTickInput`，与录制会话的 step 共用），全部结构校验通过后，才在新建的录制会话上逐 tick step，导出其结果。检查点规则因此与录制完全相同。
  - 错误改写为 `record` 前缀：配置与间隔为 `record.config.*` 与 `record.checkpointInterval`；tick 内的错误和数值守卫错误由 `tickPath` 统一移到 `record.ticks[i]` 下（`ticks[0]` 即模拟 tick 1）。
  - 为改写路径，[errors.ts](../../../../../src/core/errors.ts) 的 `CoreInputError` 新增只读字段 `reason`（`message` 不变）；[synthetic-scene.ts](../../../../engineering/source-structure.md#r1-合成-core) 把 `requireExactRecord` 改为 Core 内部导出。
- **测试：** [synthetic-replay.test.ts](../../../../engineering/source-structure.md#r1-合成-core)，共 37 项。
  - **AC-08：**
    - 固定 11 tick 记录覆盖 `moveX` -1/0/0.5/1、成功的添加与移除、两种拒绝和同 tick add/remove/add。在 60/120 Hz × seed 0/4294967295 × 间隔 1/4 下，replay 结果与录制结果严格相等。
    - 间隔 1 的检查点为 0–11，不重复；间隔 4 的为 `[0, 4, 8, 11]`，跨两个完整间隔并补上最终 tick；同时断言事件类型序列。
    - 空记录只有 tick 0 检查点（等于新场景的哈希），没有事件。
    - 记录与结果 JSON 往返后一致。
    - 原会话导出后继续运行不影响 replay；两次 replay 结果相等，且不是同一对象。
    - `-0` 的 seed 与 `moveX` 等同于 `0`。
  - **特征锁定：** seed 0、60 Hz、间隔 4 的检查点哈希固定为测试字面量。注释写明它只是回归锁，有意修改时须在同一改动中更新并说明原因。
  - **AC-10（记录）：**
    - 22 个负向用例逐项断言 `CoreInputError` 与 `path`，覆盖非对象、格式、版本、缺失与额外字段、`config` 非对象、缺少或为 `undefined` 的 `tickRateHz`、额外配置字段、非法 seed 与频率、非法间隔、`ticks` 非数组、稀疏数组（`record.ticks[1]`）、null tick、tick 额外字段、缺少 `commands`、越界 `moveX`，以及 `record.ticks[12].commands[0].type`。
    - `tickRateHz = 1e-308` 时第二个 tick 位置溢出，报告 `record.ticks[1].input.moveX` 和原始原因。
    - 先出现溢出、后出现结构错误时，报告的是后一个 tick 的结构错误，证明全部结构在 step 之前已校验。
- **检查：** `pnpm exec vitest run src/core` 通过；最终 `pnpm check` 通过（typecheck、lint、13 个测试文件共 339 项、build）。
- **审阅：**
  - rubber-duck 指出 tick 结构原本在 step 过程中才校验，不满足“先校验整个记录”。已改为先完成全部规范化，并补了顺序回归测试。
  - simplify：
    - 已采纳：用 try/catch 循环和 `repathed`/`tickPath` 取代每个 tick 的闭包与正则；`tickPath` 保证 `record.ticks[i]` 前缀，不会静默失效。
    - 未采纳：取消 replay 中的二次规范化（需要会话提供不复制的录制入口，会削弱记录的不可变性，而本任务不设性能阈值）；在 P1-03 测试文件之间共享 helper；把完整组合矩阵改为两两组合（完整矩阵与验收描述一一对应）。
