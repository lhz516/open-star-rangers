---
type: plan
status: active
phase: P3
task: "02"
subtask: "04"
updated: 2026-10-10
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
- **校验 helper：** 正式模块需要的结构与数值读取 helper 放在中性的 Core 模块中。若从 [synthetic-scene.ts](../../../../engineering/source-structure.md#r1-合成-core) 移出既有 helper，合成模块只改导入路径，行为、格式与测试不变。
- **边界：** 增加规则与回归测试：正式模块不导入 `src/core/synthetic/`，合成模块不导入正式模块（测试与 test-support 文件按现有约定处理）。
- **测试：** 每个契约的正例与每类拒绝；冻结与脱离调用者对象；规范文本的字段次序、插入次序无关、−0、非有限值、非 ASCII 转义与长度上限；`CoreLimits` 的 limit 与 limit + 1。

## 不包含

- 世界、实体表、流水线与命令结果的产生（05）；放置与随机映射（06）；创建与实例化（07）；快照与 replay（08）。
- Core 模块说明的更新（11；本项在完成证据中列出需要记录的 API）。
- 若 01 的 Q-10 结论表明动作形状不足：先由协调者修订 spec，本项不自行更改契约。

## 关键文件与契约

- [errors.ts](../../../../../src/core/errors.ts)：增加内部故障错误。
- [fnv1a64.ts](../../../../../src/core/determinism/fnv1a64.ts)：复用，不改契约。
- [synthetic-scene.ts](../../../../engineering/source-structure.md#r1-合成-core)、[synthetic-replay.ts](../../../../engineering/source-structure.md#r1-合成-core)：只在移出通用 helper 时改导入路径。
- [eslint.config.js](../../../../../eslint.config.js)、[engineering-boundaries.test.ts](../../../../../tools/engineering-boundaries.test.ts)：正式与合成模块的边界。
- 计划新增：`src/core/contracts/limits.ts`、`time.ts`、`tick-input.ts`、`domain-events.ts`、`canonical-text.ts`、`validation.ts` 及相邻 `*.test.ts`（文件名可调整，职责不变）。

## 写入范围

- `src/core/contracts/**`：契约模块与测试（新建）。
- `src/core/errors.ts`、`src/core/errors.test.ts`（新建）：内部故障错误。
- `src/core/synthetic/synthetic-scene.ts`、`src/core/synthetic/synthetic-replay.ts`、`src/core/synthetic/synthetic-snapshot.ts`：只在移出通用 helper 时改导入。
- `eslint.config.js`、`tools/engineering-boundaries.test.ts`：正式/合成边界规则与回归。

## 验收标准

- [x] AC-01：正式模块与合成模块互不导入的规则与回归测试通过；合成场景、快照与 replay 的测试未修改即通过（若移出 helper，只改导入路径）。
- [x] AC-03（单位部分）：默认 2 与测试用 4 单位/tick 的换算、`>` 到期边界与溢出拒绝正确。
- [x] AC-04（校验部分）：每个合法命令变体通过；每类不合法输入抛出 `CoreInputError`，调用者对象不被读取第二次；结果深度冻结；−0 规范化。
- [x] AC-11（规范文本部分）：插入次序不影响文本；−0、非有限值、非 ASCII 转义与长度上限按契约；哈希为 16 位小写十六进制。
- [x] `CoreLimits` 每项有 limit/limit + 1 测试，乘法与加法不溢出。
- [x] `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts`、`pnpm typecheck`、`pnpm lint` 通过；完成前运行 `pnpm check`。

## 验证方法

- Vitest 单元测试（Node，合成数据），覆盖上述正例与拒绝。
- 边界测试按 [engineering-boundaries.test.ts](../../../../../tools/engineering-boundaries.test.ts) 的现有写法构造违例样本，断言 lint 报错。
- 不涉及浏览器或原版对照。

## 完成证据

2026-10-09，worker 分支 `exec-p3-02-04`（基于认领提交 `44472e4`）。

- **实现：**
  - [errors.ts](../../../../../src/core/errors.ts)：新增 `CoreFaultError(code, site)`，原因码为封闭联合 `CoreFaultCode` = `invariant-violated`、`budget-exhausted`、`world-faulted`；`site` 是固定的检测位置标识，不含内容、名称或坐标。与 `CoreInputError` 互不为子类；`CoreInputError` 未改。
  - [contracts/limits.ts](../../../../../src/core/contracts/limits.ts)：冻结常量 `CORE_LIMITS`（spec 中的 `CoreLimits`），每项在注释中附依据（所选任务约数十个实例、默认 32 tick/s 与内存预算），不开放覆盖：`commandsPerTick` 64（命令联合共 42 个不同命令，map-point 按操作计）、`entities` 2048、`spawnExpansion` 1024、`eventsPerTick` 4096（≥ 64 + 1024 + 2048）、`recordedTicks` 131072（默认速率 68 分钟）、`recordedCommands` 262144、`recordedEvents` 524288、`recordedCheckpoints` 131073（tick 0 加每 tick 一个）、`canonicalTextLength` 16777216。`fitsLimit(name, used, added)` 与 `productFitsLimit(name, count, each)` 不形成和或积，对非安全整数一律返回 false。
  - [contracts/time.ts](../../../../../src/core/contracts/time.ts)：`CLOCK_UNITS_PER_SECOND` 64、`DEFAULT_CLOCK_UNITS_PER_TICK` 2、冻结的 `CLOCK_UNITS_PER_TICK` 数值规则（正偶数安全整数）、`stepSeconds`、`advanceTime`（tick/时钟越过安全整数时在产生结果前抛 `CoreInputError`，默认路径 `tickInput`；当前时间或步长不合契约时为 `CoreFaultError('invariant-violated')`）、`secondsToClockUnits`（非负安全整数秒 × 64，越界为 `CoreInputError`）、`isDue(clock, due)` = `clock > due`。世界中的推进归 05。
  - [contracts/tick-input.ts](../../../../../src/core/contracts/tick-input.ts)：`TickInput = { axes: { pitch, yaw, roll }, commands }`；`Command` 由 `COMMAND_FIELDS` 读取表派生，16 个变体与字段、取值范围逐项按 spec 命令形状表，每个变体只接受自己的字段；导出 `COMMAND_TYPES` 与 `readTickInput`。读取一次性经属性描述符读取每个值（不运行访问器），要求普通对象与无空位、无额外字段的普通数组，先查命令数再读元素，输出按规范字段次序新建并深度冻结，−0 变为 0；错误路径以 `tickInput` 开头，不回显未知键或值。
  - [contracts/domain-events.ts](../../../../../src/core/contracts/domain-events.ts)：`DomainEventBase<Type>`、`Vec3`、`CommandResultEvent`（accepted 时 reason 为 null，rejected/ignored 时为封闭原因码，当前只有 `not-implemented`）、`EntitySource { collection: 'mission' | 'wingman', index, group }` 与 `GroupMembership { index, request, member }`、`ObjectInstantiatedEvent`、`DomainEvent`；运行时列表 `COMMAND_OUTCOMES`、`COMMAND_RESULT_REASONS` 供 08 校验 replay 事件。
  - [contracts/canonical-text.ts](../../../../../src/core/contracts/canonical-text.ts)：`canonicalObject(members)` 以显式次序列出成员（复制并冻结成员表与每个成员），`canonicalText(value, path)` 写紧凑 JSON，`canonicalHash` 为 `fnv1a64` 的 16 位小写十六进制。不接受普通对象（插入次序无从进入文本），−0 写为 0，非有限值、非规范值、重复成员与超长都抛 `CoreInputError`（由调用者决定是否转为故障）；字符串在编码前精确计算转义后长度，超长时不分配。
  - [contracts/validation.ts](../../../../../src/core/contracts/validation.ts)：正式模块用的 `readDataRecord`、`requireExactFields`、`readExactRecord`、`readList`、`readNumber`、`readChoice`、`numberIn`、`integerIn`。
  - **合成 helper 未移出：** 本项写入范围内唯一的“中性”位置在正式的 `contracts/` 中，移入后合成模块就要导入正式模块。因此正式模块使用自己的读取器（比合成版更严格：只读描述符、不回显未知键），`core/synthetic/` 三个文件均未改动。
  - **边界：** [eslint.config.js](../../../../../eslint.config.js) 新增本地规则 `osr/core-synthetic-boundary`，只配置在 `src/core/` 的非测试、非 test-support 文件上：`core/synthetic/` 为合成，`errors.ts` 与 `determinism/` 为中性，其余 `core/` 模块（含 `mission/`、`contracts/`）为正式；正式与合成互不导入，中性模块两侧都不导入。说明符按解析后的路径分类，覆盖值/类型导入、副作用导入、再导出（含 `export type`、`export *`）、字面量动态导入与 `import('…')` 类型。原有 `osr/original-data-capabilities` 与新规则共用提取出的 `relativeTarget` 与 `moduleReferenceVisitors`，行为不变。
- **检查（全部通过）：**
  - `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts`：18 个文件、599 个测试。新测试：[errors.test.ts](../../../../../src/core/errors.test.ts) 3、[limits.test.ts](../../../../../src/core/contracts/limits.test.ts) 18、[time.test.ts](../../../../../src/core/contracts/time.test.ts) 15、[tick-input.test.ts](../../../../../src/core/contracts/tick-input.test.ts) 71、[domain-events.test.ts](../../../../../src/core/contracts/domain-events.test.ts) 3、[canonical-text.test.ts](../../../../../src/core/contracts/canonical-text.test.ts) 22；合成测试 8 个文件 333 个，未修改。
  - AC-01：[engineering-boundaries.test.ts](../../../../../tools/engineering-boundaries.test.ts) 的 “keeps formal Core and core/synthetic/ from importing each other” 对 16 组违例（正式→合成、合成→正式、中性→任一侧，含无扩展名、`.js`、目录形式）的 9 种引用形式断言规则命中，对 15 组合法情形（中性模块、同侧、`content/`、测试与 test-support、`app/`）断言不命中；“formal and synthetic Core dependency boundary” 在临时项目中经 `content/` 中转、`import()` 类型与中性模块再导出构造跨界，并拒绝计算型动态导入，再确认真实应用程序中三类模块都存在且无跨界。
  - AC-03：2 与 4 单位/tick 下 1 s、3 s、0 s 到期的首个 tick（33/17、97/49、1/1）为手算期望；`isDue(64, 64)` 为 false；tick/时钟在 `MAX_SAFE_INTEGER` 处、秒在 ⌊MAX/64⌋ + 1 处被拒绝；0、−2、奇数、小数、NaN、超安全整数的单位/tick 被拒绝。
  - AC-04：独立列出的 42 个命令全部通过且覆盖 16 个类型；Proxy 记录显示除数组 `length` 外每个值只经描述符读取一次、访问器从不运行；65 个命令只读 `length` 即拒绝，长度 2³¹ 的数组不枚举键；缺字段、多字段、其他变体的字段、符号键、不可枚举键、类实例、继承字段、Array 子类、空位、额外数组字段、未知类型（含 `__proto__`、`toString`）、NaN/±Infinity、越界与错类型数值均为 `CoreInputError` 且路径正确；结果深度冻结、与调用者脱离、字段次序固定，不同键序与 −0/0 的等价输入得到相同 JSON。
  - AC-11：成员次序即文本次序，键序不同的来源得到相同文本与哈希，普通对象被拒绝；−0 写为 0；NaN/±Infinity 带路径拒绝；é、CJK、代理对、孤立代理、U+2028、控制字符的转义与 `JSON.parse` 往返，结果可交给 `fnv1a64`；长度恰为上限可写、多 1 拒绝（含转义计数），转义后超长的字符串在调用 `JSON.stringify` 前拒绝，超长数组在越界的元素处停止读取；哈希匹配 `/^[0-9a-f]{16}$/` 且等于 `fnv1a64` 的结果。
  - `CORE_LIMITS`：9 项都是冻结的正安全整数；每项在 limit 与 limit + 1 处检查 `fitsLimit`/`productFitsLimit`，以及 `MAX_SAFE_INTEGER` 级因子不溢出；最大上限的和与平方仍是安全整数，因而任意两项的和与积都不溢出；依据中的关系（如事件上限 ≥ 命令 + 生成 + 实体）有断言。
  - `pnpm typecheck`、`pnpm lint` 通过；`pnpm check` 通过（162 个测试文件、4826 个测试，生产构建成功）。运行中的两条 typescript-eslint `TSImportType.argument` 弃用警告来自既有平台规则，未改动前同样出现。
- **rubber-duck：** 三项全部采纳。① 转义后长度原在分配完整转义串之后才检查：改为编码前精确计算写出长度，并加 `JSON.stringify` 未被调用的回归；② 时间 helper 原接受契约外的步长或当前时间：改为 `CoreFaultError('invariant-violated')` 并加测试；③ `canonicalObject` 原与调用者共享成员元组：改为复制并冻结每个成员，并加修改元组的回归。
- **simplify：** 采纳：删除只供测试的 `CORE_FAULT_CODES` 列表与 `CoreLimits` 类型别名；上限溢出测试改为最大值的和与平方；命令变体的字段表预先计算；测试改用既有的 `deepFrozen`；两条 ESLint 规则共用说明符解析与引用访问器，新规则单独配置在 `src/core/`；边界样本按文件合并为一次 lint。未采纳：用内容层的 `Vector3` 代替 `Vec3`（内容为参考单位、Core 为运行时单位，类型归各自 owner）；测试从 `eslint.config.js` 导入分类器（类型检查不覆盖 JS 配置，提取到 `tools/` 超出写入范围）；增量 FNV 哈希（需改 `determinism/`，留给 08 按需评估）；合并既有的三种依赖图遍历（改动既有无关代码）；保留 `COMMAND_TYPES`、`COMMAND_OUTCOMES`、`COMMAND_RESULT_REASONS`，因为 08 只能写 `src/core/replay/**`，需要这些运行时列表校验 replay 事件。
- **文档影响：** 本项写入范围不含文档。需由 11 记录：
  - [Core 模块说明](../../../../engineering/modules/core.md)：`contracts/` 下上述 API；`CORE_LIMITS` 各值及依据；`CoreFaultError` 的原因码与 `site`；正式模块与合成模块互不导入、`errors.ts` 与 `determinism/` 为中性模块；合成读取器未移出的原因。
  - [工程约定](../../../../engineering/README.md#lint-规则eslintconfigjs)：`osr/core-synthetic-boundary` 规则及其依赖图回归。
  - [源码结构指南](../../../../engineering/source-structure.md#文件与-helper-归属)：“本轮不提取校验”一句已不准确，正式 Core 的校验读取器在 `core/contracts/validation.ts`；`core/contracts/` 已交付。
  - 无原版事实、U 项、STATUS 或阶段索引变化。