---
type: plan
status: active
phase: P3
task: "02"
subtask: "04"
updated: 2026-10-09
---

# 04 — 正式契约基础：错误、上限、时钟、动作输入与规范文本

**契约来源：** [spec](../spec.md) 的 S-01、S-02（时钟部分）、S-04、S-08（规范文本部分）；AC-01、AC-03（单位与溢出）、AC-04（输入校验）、AC-11（规范文本规则）；[时间模型](../spec.md#时间模型)、[输入与命令](../spec.md#输入与命令)、[快照、哈希与 replay](../spec.md#快照哈希与-replay)的规范文本与上限、技术决定 1、4。
**依赖：** 无。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **错误：** 在 `errors.ts` 增加与 `CoreInputError` 可区分的内部故障错误（例如 `CoreFaultError`），带稳定原因码；不改 `CoreInputError` 的现有契约。
- **上限：** 公开的有限常量 `CoreLimits`：每 tick 命令数、实体数、生成展开数、单 tick 事件数，录制的 tick、命令、事件、检查点数与规范文本长度。取值附依据（所选任务规模与内存预算），不是原版玩法上限，不开放调用者覆盖。
- **时钟：** 任务时钟为非负安全整数，单位 1/64 秒；`clockUnitsPerTick` 为正偶数安全整数，默认 2；步长秒数 = 单位 ÷ 64；到期判定为“时钟 > 到期时刻”；推进与秒 × 64 换算在改状态前做安全整数检查，超界为 `CoreInputError`。只提供纯函数与常量，世界中的推进归 05。
- **动作输入：** `TickInput = { axes, commands }`：
  - `axes` 为 `pitch`、`yaw`、`roll`，各在 [−1, 1] 内的有限数，正方向按 spec；
  - `commands` 为无稀疏项的有序数组，元素为 spec [命令形状表](../spec.md#输入与命令)中的封闭判别联合（`fire`、`speed`、`select-number`、`navigate-selection`、`confirm-selection`、`target`、`cycle-main-weapon`、`select-missile`、`toggle-map`、`map-point`、`request-warp`、`communications`、`launch`、`energy`、`damage-report`、`cockpit-front`），每个变体只允许自己的字段；
  - 读取函数一次读取、校验、复制并深度冻结整份输入：字段缺失或多余、NaN/Infinity、类型或范围错误、稀疏数组、未知变体、超出 `CoreLimits` 都抛出 `CoreInputError`（路径指向 `tickInput…`）；−0 规范化为 0；先检查长度再复制。
- **事件信封：** `DomainEvent` 联合的基础类型与以下变体的类型：
  - `command-result`：`{ type, tick, commandIndex, commandType, outcome, reason }`，outcome 为 `accepted`、`rejected`、`ignored`；accepted 时 reason 为 null，其余为封闭原因码（至少含 `not-implemented`）；
  - `object-instantiated`：`{ type, tick, entityId, kindBit, source, position }`；`source` 为带命名空间的声明引用 `{ collection: 'mission' | 'wingman', index }` 与可空的编组信息（编组索引、第几次请求、成员位置）；`position` 为运行时单位的向量。
  事件的产生归 05、07。
- **规范文本：** 显式字段次序的紧凑 JSON 写入器：不依赖对象插入次序；−0 写为 0；拒绝非有限值；非 ASCII 字符转义为 `\uXXXX`，使结果可交给 [fnv1a64.ts](../../../../../src/core/determinism/fnv1a64.ts)；超过长度上限时在生成过程中拒绝。哈希为 16 位小写十六进制。
- **校验 helper：** 正式模块需要的结构与数值读取 helper 放在中性的 Core 模块中。若从 [synthetic-scene.ts](../../../../../src/core/synthetic/synthetic-scene.ts) 移出既有 helper，合成模块只改导入路径，行为、格式与测试不变。
- **边界：** 增加规则与回归测试：正式模块不导入 `src/core/synthetic/`，合成模块不导入正式模块（测试与 test-support 文件按现有约定处理）。
- **测试：** 每个契约的正例与每类拒绝；冻结与脱离调用者对象；规范文本的字段次序、插入次序无关、−0、非有限值、非 ASCII 转义与长度上限；`CoreLimits` 的 limit 与 limit + 1。

## 不包含

- 世界、实体表、流水线与命令结果的产生（05）；放置与随机映射（06）；创建与实例化（07）；快照与 replay（08）。
- Core 模块说明的更新（11；本项在完成证据中列出需要记录的 API）。
- 若 01 的 Q-10 结论表明动作形状不足：先由协调者修订 spec，本项不自行更改契约。

## 关键文件与契约

- [errors.ts](../../../../../src/core/errors.ts)：增加内部故障错误。
- [fnv1a64.ts](../../../../../src/core/determinism/fnv1a64.ts)：复用，不改契约。
- [synthetic-scene.ts](../../../../../src/core/synthetic/synthetic-scene.ts)、[synthetic-replay.ts](../../../../../src/core/synthetic/synthetic-replay.ts)：只在移出通用 helper 时改导入路径。
- [eslint.config.js](../../../../../eslint.config.js)、[engineering-boundaries.test.ts](../../../../../tools/engineering-boundaries.test.ts)：正式与合成模块的边界。
- 计划新增：`src/core/contracts/limits.ts`、`time.ts`、`tick-input.ts`、`domain-events.ts`、`canonical-text.ts`、`validation.ts` 及相邻 `*.test.ts`（文件名可调整，职责不变）。

## 写入范围

- `src/core/contracts/**`：契约模块与测试（新建）。
- `src/core/errors.ts`、`src/core/errors.test.ts`（新建）：内部故障错误。
- `src/core/synthetic/synthetic-scene.ts`、`src/core/synthetic/synthetic-replay.ts`、`src/core/synthetic/synthetic-snapshot.ts`：只在移出通用 helper 时改导入。
- `eslint.config.js`、`tools/engineering-boundaries.test.ts`：正式/合成边界规则与回归。

## 验收标准

- [ ] AC-01：正式模块与合成模块互不导入的规则与回归测试通过；合成场景、快照与 replay 的测试未修改即通过（若移出 helper，只改导入路径）。
- [ ] AC-03（单位部分）：默认 2 与测试用 4 单位/tick 的换算、`>` 到期边界与溢出拒绝正确。
- [ ] AC-04（校验部分）：每个合法命令变体通过；每类不合法输入抛出 `CoreInputError`，调用者对象不被读取第二次；结果深度冻结；−0 规范化。
- [ ] AC-11（规范文本部分）：插入次序不影响文本；−0、非有限值、非 ASCII 转义与长度上限按契约；哈希为 16 位小写十六进制。
- [ ] `CoreLimits` 每项有 limit/limit + 1 测试，乘法与加法不溢出。
- [ ] `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts`、`pnpm typecheck`、`pnpm lint` 通过；完成前运行 `pnpm check`。

## 验证方法

- Vitest 单元测试（Node，合成数据），覆盖上述正例与拒绝。
- 边界测试按 [engineering-boundaries.test.ts](../../../../../tools/engineering-boundaries.test.ts) 的现有写法构造违例样本，断言 lint 报错。
- 不涉及浏览器或原版对照。

## 完成证据
