---
type: plan
status: accepted
phase: P1
task: "03"
updated: 2026-10-02
---

# P1-03：快照、状态哈希与输入 replay — Goal

## 目标与来源

落实已批准的 [spec](./spec.md) 中 S-01 至 S-06、AC-01 至 AC-11，在 `src/core/` 中建立以下能力：

- 合成场景的版本化快照、规范文本与 FNV-1a 64 状态哈希；
- 严格校验的恢复；
- 从创建配置开始的输入录制、在新实例上 replay，以及结果比对。

本文件不重新定义行为契约。

## 代码现状与前提

- **现有 Core：**
  - [synthetic-scene.ts](../../../../src/core/synthetic-scene.ts) 导出 `createSyntheticScene(config)` 和 `SyntheticScene` 接口（`step`/`inspect`/`uiProjection`/`renderState`），以及 `SyntheticSceneState`、`TickInput`、`DomainEvent`、`SyntheticSceneConfig` 和常量（默认 60 Hz、mover ID 1、标记坐标 `[-5,5)`）。
  - 文件内的私有 helper 有：`requireRecord`（拒绝额外字段并给出 `path`）、`readTickInput`（严格校验，返回分离副本）、`planCommands`，以及 tick 频率校验逻辑；私有类 `Scene` 只能从创建配置构造。
  - `inspect()` 返回完整权威状态，深冻结且与内部状态分离。
- **RNG 与错误类型：** [rng.ts](../../../../src/core/rng.ts) 的 Mulberry32 状态是单个 uint32。[errors.ts](../../../../src/core/errors.ts) 的 `CoreInputError` 带只读 `path`。
- **现有测试：** [synthetic-scene.test.ts](../../../../src/core/synthetic-scene.test.ts)、[synthetic-scene-step.test.ts](../../../../src/core/synthetic-scene-step.test.ts)、[synthetic-scene-input.test.ts](../../../../src/core/synthetic-scene-input.test.ts) 与 [rng.test.ts](../../../../src/core/rng.test.ts) 是 P1-02 的验收证据，不得放宽或删除断言。
- **约束：** Core 只有 ES2023 lib，没有 DOM/Node 声明（[core 类型配置](../../../../tsconfig.core.json)），不能用 `TextEncoder`、`crypto` 或 `Buffer`。[ESLint](../../../../eslint.config.js) 禁止 async/await、宿主时间与随机数。[Vitest](../../../../vite.config.ts) 已在 Node 环境中发现 `src/**/*.test.ts`，无需新依赖或新 runner。
- **计划新增文件**（均尚不存在）：
  - `src/core/fnv1a64.ts`、`src/core/fnv1a64.test.ts`：纯 TS 的 FNV-1a 64。
  - `src/core/synthetic-snapshot.ts`、`src/core/synthetic-snapshot.test.ts`：快照格式常量与类型、从场景取快照、规范文本、状态哈希。
  - `src/core/synthetic-scene-restore.test.ts`：恢复、往返、逐字段哈希敏感性与数值上限边界。
  - `src/core/synthetic-replay.ts`：录制会话、输入记录与结果类型、replay、结果校验与比对。
  - `src/core/synthetic-replay-record.test.ts`、`src/core/synthetic-replay.test.ts`、`src/core/synthetic-replay-compare.test.ts`：按子任务划分的测试。
- **已有文件的改动：** 恢复入口 `restoreSyntheticScene(snapshot: unknown): SyntheticScene` 加在 [synthetic-scene.ts](../../../../src/core/synthetic-scene.ts) 中，以复用其中的私有校验 helper 与 `Scene`。录制如需复用 `readTickInput`，可以在该文件增加一个内部导出。两者都不改变 `SyntheticScene` 接口和 P1-02 的现有行为。
- **模块依赖方向：** `synthetic-snapshot.ts` 只从 `synthetic-scene.ts` 导入类型（`import type`）；`synthetic-scene.ts` 在运行时导入快照格式常量；`synthetic-replay.ts` 依赖前两者。这样避免运行时循环导入。
- **spec 授权 goal 决定的实现选择：**
  - 快照与哈希使用自由函数，不在 `SyntheticScene` 接口上新增方法（spec 要求 P1-02 的公开类型不变）。
  - 文件与导出名按上述清单。函数名由执行时确定，但须在 subtask 证据中写明。
  - FNV-1a 64 可以用 BigInt，也可以用两个 32 位半字配合 `Math.imul` 实现；都属于 ES2023，不依赖宿主 API。
- **跨任务前提：** P1-02 已完成，证据见其[最终对齐](../02/subtasks/05-final-alignment.md#完成证据)。[spec](./spec.md) 已于 2026-10-02 批准。
- **下游：** P1-04 决定是否默认录制以及检查点间隔，P1-10 在浏览器中复用记录。本任务不接入 Runtime、UI 或应用。
- **原版证据：** 不适用。全部为自建合成行为与数据，不新增 U/B 结论。
- **验证命令：**
  - 迭代时运行 `pnpm exec vitest run src/core`；每个代码子任务完成前运行 `pnpm check`。不改 Python 工具。
  - 代码清理按 [simplify](../../../../.agents/skills/simplify/SKILL.md) 进行，范围限于当前子任务的 diff。
  - 本任务没有浏览器、实机或原版对照验收。

## 验收覆盖

| Spec 范围项/验收项 | 实现子任务 | 验证子任务及方法 |
|---|---|---|
| S-01 | 02 | 02 快照字段、冻结、隔离与无副作用测试；07 |
| S-02 | 01、02 | 01 公开测试向量；02 手写规范文本与哈希格式；07 |
| S-03 | 03 | 03 恢复往返、严格拒绝与上限边界测试；07 |
| S-04 | 04 | 04 录制会话测试；07 |
| S-05 | 05、06 | 05 replay 与记录校验；06 结果校验与比对；07 |
| S-06 | 01–06 | 各子任务的同目录测试；07 运行 `pnpm check` 并做范围审查 |
| AC-01 | 02 | seed 0 初始状态与有标记两种场景的完整快照断言；写入尝试；读取前后状态一致；JSON 往返 |
| AC-02 | 01、02 | 01 用公开 FNV-1a 64 向量验证；02 断言手写规范文本字面量、16 位小写十六进制格式、键序无关、`-0` 写作 `0`；03 补测恢复后键序无关 |
| AC-03 | 03 | 初始、有标记、移除后与 JSON 往返四种来源，与恢复实例并行逐 tick 比较事件与哈希 |
| AC-04 | 03 | 逐条恢复规则的负向用例，断言 `CoreInputError` 与 `path`；`-0` 被规范化 |
| AC-05 | 03 | 逐字段构造合法快照对，比较规范文本与哈希；重复读取哈希不变 |
| AC-06 | 03 | 恢复到 tick 与 ID 上限前一步，断言成功、拒绝与原子性 |
| AC-07 | 04 | 与普通场景对照；插入非法调用；修改调用者对象；多次导出对比 |
| AC-08 | 05、06 | 05 在 60/120 Hz、间隔 1 与更大间隔下精确断言 replay 与录制结果相同，空记录，JSON 往返，特征锁定；06 断言比对返回一致 |
| AC-09 | 06 | 修改记录或结果后逐项断言 `{match, tick, kind}`，含间隔 2 的采样反例与 `-0`/`0` |
| AC-10 | 05、06 | 05 非法记录的 `record.*` 路径；06 非法结果的 `expected.*`/`actual.*` 路径 |
| AC-11 | 01–06 | 07：`pnpm check`、无新依赖、P1-02 测试未放宽、无宿主 API 与接线、未读取原版文件 |

## 子任务跟踪

状态只在此维护：`pending` / `in-progress` / `blocked` / `completed`。依赖项全部 completed 后才能开始；验收结果和证据写在相应 subtask 文档，不在阶段索引重复状态。

| 子任务 | 依赖 | 状态 |
|---|---|---|
| [01-fnv1a64.md](./subtasks/01-fnv1a64.md) | — | pending |
| [02-snapshot-and-hash.md](./subtasks/02-snapshot-and-hash.md) | 01 | pending |
| [03-strict-restore.md](./subtasks/03-strict-restore.md) | 02 | pending |
| [04-recording-session.md](./subtasks/04-recording-session.md) | 02 | pending |
| [05-replay.md](./subtasks/05-replay.md) | 04 | pending |
| [06-result-comparison.md](./subtasks/06-result-comparison.md) | 05 | pending |
| [07-final-alignment.md](./subtasks/07-final-alignment.md) | 01, 02, 03, 04, 05, 06 | pending |

依赖都是真实前提：

- 02 的状态哈希用到 01 的 FNV-1a 64。
- 03 的恢复要校验 02 定义的快照格式，验收也要比较哈希。
- 04 的检查点哈希来自 02。
- 05 必须产生与 04 同形的结果，并复用其记录类型。
- 06 校验并比对 05 产生的结果。

03 与 04 互不依赖，但都可能修改 `synthetic-scene.ts`，因此仍按编号顺序执行。最后一行始终为最终对齐验证，依赖所有其他子任务。ID 分配后保持不变；新增修复项使用新 ID，插在 07 之前并加入其依赖。

## 执行记录

## 审批

**2026-10-02 用户批准本 Goal 并开始执行。** 用户调用 execute-goal 指定 `docs/plan/p1/03/goal.md`，回应上一轮的批准请求。批准范围为本文件的覆盖表、七项子任务及其依赖与实现选择，包括 01 对非 ASCII 输入显式报错。`accepted` 仅表示计划获批，执行状态以 tracker 与各子任务证据为准。
