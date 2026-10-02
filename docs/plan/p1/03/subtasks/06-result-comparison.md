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
- 复用 [synthetic-scene.ts](../../../../../src/core/synthetic/synthetic-scene.ts) 的 `DomainEvent` 类型与常量，以及 [errors.ts](../../../../../src/core/errors.ts)。

## 验收标准

- [x] AC-08（比对）：录制结果与 replay 结果比对一致，JSON 往返后仍一致。
- [x] AC-09：每类合法偏差都报告正确的 tick 与类别；采样边界反例和 `-0`/`0` 两种情况比对一致；同 tick 两种差异时优先报告 `events`。
- [x] AC-10（结果）：每类非法结果都抛 `CoreInputError`，`expected` 与 `actual` 的 `path` 均正确；只有结构合法时才进入比较。
- [x] `pnpm exec vitest run src/core` 与 `pnpm check` 通过。

## 验证方法

- 运行上述命令；对实现 diff 按 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 清理后重跑。
- 无浏览器、实机或原版对照。

## 完成证据

- **实现：** [synthetic-replay.ts](../../../../../src/core/synthetic/synthetic-replay.ts) 新增类型 `SyntheticReplayComparison` 与 `compareSyntheticReplayResults(expected, actual)`。
  - **结构校验：** 先对两份结果分别执行 `readResult`，路径前缀为 `expected` 或 `actual`。
    - 要求自有属性并拒绝额外字段；数组无缺失项。
    - 检查点非空，首个 tick 为 0，严格递增，hash 为 16 位小写十六进制；最后一个检查点即最终 tick。
    - 事件按 `EVENT_FIELDS` 校验精确字段，该表以 `satisfies` 绑定 `DomainEvent` 联合，新增事件类型时会编译失败；tick 在 1 至最终 tick 之间，`commandIndex` 非负，`entityId ≥ 2`，坐标在 `[-5,5)`，`commandType`/`reason` 只允许两种配对。
    - 事件按 tick 非递减；同 tick 内 `commandIndex` 从 0 连续递增。
    - 每个不受信字段只读取一次，返回规范化（`-0` 为 `0`）的分离副本。
  - **比较：** 用四个游标顺序遍历两份已按 tick 排序的事件与检查点，逐字段比较事件，与对象身份和键序无关；同一 tick 先比较事件再比较检查点。差异作为冻结的数据返回。
  - [synthetic-scene.ts](../../../../../src/core/synthetic/synthetic-scene.ts) 把 `NumberRule`、`readNumber`、`readVec`、`MARKER_COORDINATE`、`NON_NEGATIVE_SAFE_INTEGER`、`ENTITY_ID` 改为 Core 内部导出（后两者由原私有规则改名而来），恢复行为不变。replay 的 `ticks` 缺失项检查改用同一个 `requireDenseArray`。
- **测试：** [synthetic-replay-compare.test.ts](../../../../../src/core/synthetic/synthetic-replay-compare.test.ts)，共 81 项。
  - **AC-08（比对）：** 60/120 Hz × 间隔 1/4 下，录制结果与 replay 结果比对为 `{ match: true }`，记录与结果都经 JSON 往返后仍一致。
  - **AC-09：** 全部用分别生成的结果比对。
    - 间隔 1：
      - 改变 `moveX` → `{2, checkpoint}`；插入命令 → `{2, events}`；删除命令 → `{1, events}`（同 tick 哈希也不同，仍报告 `events`）；调换命令 → `{6, events}`。
      - 截短到有事件的 tick 之前 → `{10, events}`；截短到无事件的 tick 之前 → `{8, checkpoint}`；延长 → `{12, checkpoint}`。
      - 篡改期望结果的事件坐标 → `{1, events}`；篡改其哈希 → `{3, checkpoint}`。
    - 不同 seed 或不同 `tickRateHz` → `{0, checkpoint}`。
    - 间隔 4：持续的状态偏差在检查点报告 `{4, checkpoint}`；没有检查点的 tick 3 上出现的事件差异报告 `{3, events}`。
    - 键序整体反转的结果比对一致；检查点 hash 的 getter 只被读取一次。
    - 采样边界回归：间隔 2 下 `[0,0]` 与 `[1,-1]` 一致，间隔 1 下在 tick 1 报告 `checkpoint`；注释说明这是采样粒度，不是哈希碰撞。
    - `moveX` 为 `-0` 与 `0` 的记录比对一致。
  - **AC-10（结果）：**
    - 29 个负向用例分别作为 `expected` 与 `actual` 运行（共 58 次），断言 `CoreInputError` 与带前缀的 `path`。覆盖非对象、顶层额外或缺失字段、非数组、稀疏的事件与检查点、空检查点、首个检查点非 0、非递增、小数 tick、检查点额外字段、大写/过短/数字 hash、未知事件类型、非对象事件、事件字段缺失或额外、`entityId = 1`、坐标等于 5、position 额外字段、负 `commandIndex`、未知 `commandType`、`reason` 不配对、事件 tick 为 0 或超过最终 tick、事件乱序、`commandIndex` 跳号或不从 0 开始。
    - 另有两项：两份结果本身不同但 `actual` 非法时，先抛出结构错误；结构合法但不可能由 replay 产生的结果被接受（不重演历史）。
- **检查：** `pnpm exec vitest run src/core` 通过；最终 `pnpm check` 通过（typecheck、lint、14 个测试文件共 420 项、build）。
- **审阅：**
  - rubber-duck 发现检查点 hash 被读取三次，getter 可以让未经校验的值进入比较，已改为只读一次并补测。另补测了无检查点 tick 上的事件差异和键序无关。
  - simplify：
    - 已采纳：用逐字段的类型化比较器和游标合并，取代按 tick 生成 JSON 加排序；tick 规则只构造一次；`readEvent` 先按判别字段选出字段表，共同字段只读取一次；`EVENT_FIELDS` 绑定事件联合；与恢复共用整数规则和 `requireDenseArray`；测试中的嵌套三元式改为 `if`。
    - 未采纳：另建独立校验模块（goal 已固定文件布局，导出已注明为 Core 内部）；与 `planCommands` 共享拒绝原因映射（需要改动 P1-02 规则代码）；共享 hash 格式谓词（价值低）。
