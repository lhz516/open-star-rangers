---
type: plan
status: active
phase: P1
task: "02"
subtask: "04"
updated: 2026-10-10
---

# 04 — 输入校验、整批原子性与数值守卫

**契约来源：** [spec](../spec.md) 的 S-02、S-06；AC-06（TickInput 部分）、AC-10；“非法契约与数值边界”与技术决定 7、8。
**依赖：** 03。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 在 `step()` 修改任何状态之前完成全部校验，失败时抛 `CoreInputError` 并带定位 `path`：
  - `tickInput` 必须是非 null、非数组对象，只允许 `input` 与 `commands` 两个键。
  - `input` 同样必须是对象，只允许 `moveX`。`moveX` 须为 number 类型、有限且在 `[-1, 1]`；不截断、不强制转换。
  - `commands` 须为数组；每个元素须为对象，只允许 `type` 一个键，`type` 须为 `add-marker` 或 `remove-marker`。
  - 额外键的 `path` 为该键的完整路径，例如 `tickInput.commands[1].position`。
- 同样在修改前完成的数值守卫：
  - **位置：** 预先计算新 X，非有限时抛错。
  - **tick：** `tick + 1` 须不超过 `Number.MAX_SAFE_INTEGER`。
  - **ID：** 只按标记是否存在为整批命令预先决定结果（不抽 RNG），统计会成功的添加次数；分配后的 `nextEntityId` 须仍是安全整数。
- 校验与守卫全部通过后才进入 03 的处理流程，因此异常不会留下半个 tick。异常后实例仍可继续使用，结果等同于没有发生那次非法调用。
- 新增 `src/core/synthetic-scene-input.test.ts`：
  - 每类非法输入抛 `CoreInputError`，`path` 正确：缺失/null/数组/额外键的 tickInput 与 input；NaN、Infinity、-Infinity、超出 ±1、字符串 `'1'` 的 moveX；非数组、含 null 或非对象元素的 commands；未知 type 与命令上的额外键。
  - **整批原子性：** 前面是合法 `add-marker`、后面有非法命令时，`inspect()` 与调用前完全相同（无新标记、`rngState` 与 `nextEntityId` 不变）；之后同样的合法调用，结果与从未经历非法调用的对照实例完全一致。
  - **位置溢出：** `tickRateHz = 1e-308`、moveX 为 1 时，第一个 tick 后 X 为 1e308，第二个 tick 抛错且状态不变；moveX 为 -1 时同理。
  - **合法边界：** moveX 为 -1、1、-0 时正常。
- **tick/ID 守卫按技术决定 7 以代码审阅为证据：** 在完成证据中写明守卫位置、与状态修改的先后关系，以及该上限在本任务中不可构造的原因。不为测试添加注入状态的接口。

## 不包含

- 改变 03 的业务行为或拒绝事件；新增命令或输入轴。
- 状态恢复或注入接口（不在任何任务的已批准范围内）；运行到安全整数上限的测试。
- 浏览器错误呈现与日志（由未来宿主负责）。

## 关键文件与契约

- 修改 `src/core/synthetic-scene.ts`：在 `step()` 前增加校验与守卫；复用 02 的 `CoreInputError`。
- 计划新增 `src/core/synthetic-scene-input.test.ts`（尚不存在）。

## 验收标准

- [x] AC-06：所列非法 TickInput 全部抛 `CoreInputError`，`path` 正确，不做强制转换，额外键被拒绝。
- [x] AC-06：整批原子性与对照实例一致性成立；非法调用后实例可继续使用。
- [x] AC-06：极小频率的位置溢出在修改前被拒绝，有自动测试。
- [x] 技术决定 7：tick/ID 守卫已实现且在修改前执行，审阅证据已写入完成证据。
- [x] `pnpm exec vitest run src/core` 与 `pnpm check` 通过；01–03 的测试仍然通过。

## 验证方法

- 运行上述命令；对照实例逐字段比较。
- 对实现 diff 按 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 清理后重跑检查。
- 无浏览器、实机或原版对照。

## 完成证据

- 2026-10-01：[synthetic-scene.ts](../../../../engineering/source-structure.md#r1-合成-core) 的 `step()` 依次执行：
  1. `readTickInput` 严格校验整批输入并返回 `moveX` 与命令类型的脱离副本，之后不再读取调用方对象。
  2. `planCommands` 只按标记是否存在为每条命令决定结果，不抽 RNG。
  3. 三个守卫。
  4. 状态修改：`#commit` 执行计划好的结果，然后写入 mover 位置与 tick。
  - 命令类型用类型守卫 `isCommandType` 判定。
- [synthetic-scene-input.test.ts](../../../../engineering/source-structure.md#r1-合成-core) 28 个测试：
  - 22 种非法输入各抛 `CoreInputError`，`path` 准确，调用前后 `inspect()` 相同：tickInput 与 input 为 undefined/null/数组/缺失或带额外键；moveX 为缺失、NaN、±Infinity、1.0000001、-1.5 或字符串 `'1'`；commands 缺失、非数组、含 null/字符串元素或稀疏空洞；命令缺 type、type 未知或带额外的 `position` 字段。
  - 整批原子性：add, add 之后跟非法命令，或 moveX=2 配合 add，均无标记、`rngState` 与 `nextEntityId` 不变。
  - 恢复：非法调用后三次合法调用的事件与 `inspect()` 与从未出错的对照实例逐次相等。
  - 边界：moveX 为 -1、1、-0 与全冻结输入可正常使用。
  - 位置溢出：`tickRateHz = 1e-308` 时 moveX=±1 第一个 tick 到达 ±1e308，第二个 tick（同时带 add）抛错，路径为 `tickInput.input.moveX`，状态完全不变。
- **技术决定 7 的代码审阅证据**（tick/ID 上限，正常运行不可达，不为测试添加状态注入接口）：
  - 校验与计划在 `step()` 开头（第 214–215 行）。
  - tick 守卫 `Number.isSafeInteger(tick)` 在第 217 行。
  - ID 守卫 `Number.isSafeInteger(this.#nextEntityId + adds)` 在第 219 行，adds 来自不抽 RNG 的 `planCommands`。
  - 位置守卫在第 224 行。
  - 第一处状态修改是第 228 行的 `#commit`，之后是第 230–231 行写入位置与 tick。
  - 三个守卫都在任何修改之前，抛错时场景不变。
  - 上限无法构造：60 Hz 下 tick 到达 `Number.MAX_SAFE_INTEGER` 约需 480 万年，ID 每次成功添加只加一，且 P1-02 没有恢复或注入状态的入口。
- `pnpm exec vitest run src/core`：4 文件/94 测试通过（含 03 的全部 step 行为测试，重构后行为不变）。`pnpm check` 退出码 0：类型检查、lint、7 文件/143 测试、build 全部通过。
- simplify 四视角：
  - altitude、reuse 与 efficiency 一致指出 `#countSuccessfulAdds` 重复了 `#apply` 的标记规则。已重构为单一的 `planCommands`（标记规则只存在于此）与只执行计划的 `#commit`，同时去掉每 tick 的 `map` 回调。
  - simplification 指出 `COMMAND_TYPES` 被拓宽为 `string[]` 并需要类型断言，已改为类型守卫；另删除一条冗余断言。
  - **跳过** reuse 建议把两行测试夹具（`add`、`tick`）抽成共享文件：新增文件的成本高于收益。
  - 修正后重跑上述检查通过。
- 未新增依赖、未接入消费者、未读取原版文件。
