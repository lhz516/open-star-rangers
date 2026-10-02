---
type: plan
status: active
phase: P1
task: "03"
subtask: "06"
updated: 2026-10-02
---

# 06 — 结果校验与比对

**契约来源：** [spec](../spec.md) 的 S-05（比对部分）、S-06；AC-08（比对返回一致部分）、AC-09；AC-10（非法结果部分）；“结果比对”一节，数据模型中的“Replay 结果”“比对结果”，技术决定 6、9、10。
**依赖：** 05。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 在 `src/core/synthetic-replay.ts` 新增比对函数：参数为期望与实际两份未知类型的结果，返回 `{ match: true }` 或 `{ match: false, tick, kind: 'events' | 'checkpoint' }`。
- **结构校验：** 比较前对两份结果分别校验，规则逐条按 spec“结果比对”一节。任一项失败都抛 `CoreInputError`，`path` 以 `expected` 或 `actual` 开头并指向字段，此时不进入比较。
  - 顶层只含 `events`、`checkpoints`，两者都是没有缺失项的数组。
  - `checkpoints`：
    - 非空；每项只含 `tick`、`hash`。
    - 第一个 tick 为 0；tick 为非负安全整数，且严格递增。
    - `hash` 为 16 位小写十六进制字符串。
    - 最后一个检查点的 tick 即最终 tick。
  - `events`：
    - 每个事件符合 P1-02 的 `DomainEvent` 判别联合，没有缺失或额外字段。
    - `tick` 为安全整数，在 1 至最终 tick 之间；`commandIndex` 为非负安全整数。
    - 添加和移除事件的 `entityId` 为不小于 2 的安全整数；`position` 只含 `x/y/z`，三个坐标都在 `[-5,5)`。
    - 拒绝事件的 `commandType` 与 `reason` 只能是 `add-marker` 配 `marker-already-exists`，或 `remove-marker` 配 `marker-not-found`。
    - 事件按 tick 非递减排列；同一 tick 内 `commandIndex` 从 0 起连续递增。
  - 不推断或检查检查点间隔，也不重演事件历史。
- **比较：**
  - 对每个 tick，比较该 tick 的事件序列（数量、顺序和全部字段值，与对象身份和键顺序无关）以及该 tick 的检查点（是否存在、哈希值）。
  - 返回最早出现差异的 tick：该 tick 的事件不同时类别为 `events`，否则为 `checkpoint`。差异是返回数据，不抛异常。
- 新增 `src/core/synthetic-replay-compare.test.ts`：
  - **AC-08（比对）：** 05 的固定记录在两种频率、两种间隔下，录制结果与 replay 结果比对返回 `{ match: true }`；JSON 往返后也一致。
  - **AC-09：**
    - 以下用例都选择结构合法、且确实改变事件或检查点哈希的修改，与原结果比对，逐项断言 `{ match: false, tick, kind }`；对照的两份结果来自不同对象，证明不是同一对象自比。
    - 间隔 1 下：
      - 改变某 tick 的 `moveX`（报告 `checkpoint`）。
      - 插入、删除或调换命令，使事件改变（报告 `events`）。
      - 截短或延长记录。
      - 篡改期望结果中的事件字段或哈希。
    - 不同 seed 与不同 `tickRateHz` 都在 tick 0 报告 `checkpoint`。
    - 同一 tick 事件与哈希都不同时，优先报告 `events`。
    - 间隔大于 1 时，持续到下一个检查点、并产生不同哈希的状态偏差在该检查点报告。
    - **采样边界回归测试：** seed 0、60 Hz、无命令、间隔 2 时，输入 `[0,0]` 与 `[1,-1]` 比对一致；注释说明这是采样粒度，不是哈希碰撞。
    - `moveX` 为 `-0` 与 `0` 的两份记录比对一致。
  - **AC-10（结果）：** 逐项负向用例覆盖顶层字段额外或缺失、稀疏数组、空检查点、首个检查点非 0、检查点非递增、hash 格式非法、未知事件类型、事件字段缺失或额外、越界取值、`commandType` 与 `reason` 不匹配、事件 tick 为 0 或超过最终 tick、事件乱序、`commandIndex` 不连续。分别用 `expected` 与 `actual` 断言错误类型与 `path`。

## 不包含

- 逐 tick 输入记录比较或输入差异类别（技术决定 9 明确排除）；检查点周期完整性校验（技术决定 10 明确排除）。
- 持久化、UI 或 Runtime 接入。

## 关键文件与契约

- 修改 04/05 已建立的 `src/core/synthetic-replay.ts`；计划新增 `src/core/synthetic-replay-compare.test.ts`（尚不存在）。
- 复用 [synthetic-scene.ts](../../../../../src/core/synthetic-scene.ts) 的 `DomainEvent` 类型与常量，以及 [errors.ts](../../../../../src/core/errors.ts)。

## 验收标准

- [ ] AC-08（比对）：录制结果与 replay 结果比对一致，JSON 往返后仍一致。
- [ ] AC-09：每类合法偏差都报告正确的 tick 与类别；采样边界反例和 `-0`/`0` 两种情况比对一致；同 tick 两种差异时优先报告 `events`。
- [ ] AC-10（结果）：每类非法结果都抛 `CoreInputError`，`expected` 与 `actual` 的 `path` 均正确；只有结构合法时才进入比较。
- [ ] `pnpm exec vitest run src/core` 与 `pnpm check` 通过。

## 验证方法

- 运行上述命令；对实现 diff 按 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 清理后重跑。
- 无浏览器、实机或原版对照。

## 完成证据
