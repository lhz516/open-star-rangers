---
type: plan
status: active
phase: P3
task: "08"
subtask: "14"
updated: 2026-10-15
---

# 14 — AI 输入与支持范围

**契约来源：** [spec](../spec.md) 的 S-03、AC-02；[AI 输入与可达性](../spec.md#ai-输入与可达性)；08 定稿的支持范围与检查规则。
**依赖：** 12, 13。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 在 [rule-data.ts](../../../../../src/core/world/rule-data.ts) 扩展 `aiPrograms` 的静态规则数据：载入变换（+0x08 为 0 取 0x380、+0x2C 为 ±0 取 1.0）、DFPG 平方阈值、支持范围内脚本的结构，以及关键字表；内容结构检查仍由读取器完成。
- 计划新增 `src/core/rules/ai-support.ts`：按 D-01 定稿的规则，对选定配置（含五个名单项与无僚机）保守求出支持范围（记录、DFPG、内置处理器身份、脚本与操作码），覆盖选择 flag、直接安装、重装、晚到与动态创建；未映射的处理器身份或未支持的操作码以带路径的 `CoreInputError` 拒绝。
- 计划新增 `src/core/rules/ai-parameters.ts`：创建时不采样 RNG 地校验支持范围内参数的语法、关键字、随机区间支持集、除数与索引（例如 AICO 元素索引）。
- [create-world.ts](../../../../../src/core/world/create-world.ts) 调用上述检查；setupHash 覆盖完整内容（含新表）；调用者此后修改输入对象不影响世界。
- 测试：完全/部分匹配、内置回退、各名单项与无僚机、不可达项不要求语义、可达未支持项的拒绝路径、别名与 hash；期望独立推导。

## 不包含

- 程序选择的运行时抽取与安装（15）；解释器（16）。

## 关键文件与契约

- 已有：[rule-data.ts](../../../../../src/core/world/rule-data.ts)、[create-world.ts](../../../../../src/core/world/create-world.ts)、[create-world.test-support.ts](../../../../../src/core/world/create-world.test-support.ts)。
- 计划新增：`src/core/rules/ai-support.ts`、`src/core/rules/ai-parameters.ts` 及其测试。

## 写入范围

- `src/core/world/rule-data.ts`：静态 AI 数据。
- `src/core/world/rule-data.test.ts`：输入测试。
- `src/core/world/create-world.ts`：创建时检查。
- `src/core/world/create-world.test.ts`：创建测试。
- `src/core/world/create-world.test-support.ts`：合成 AI 输入。
- `src/core/rules/ai-support.ts`：支持范围（新建）。
- `src/core/rules/ai-support.test.ts`：测试（新建）。
- `src/core/rules/ai-parameters.ts`：参数检查（新建）。
- `src/core/rules/ai-parameters.test.ts`：测试（新建）。
- `src/original-data/conversion/production-rule-data.test-support.ts`：合成生产 AI 内容符合 CR-15 的支持范围。
- `src/core/systems/spawn.test.ts`：显式绑定种类 14 的测试任务。

## 验收标准

- [x] AC-02：完整内容的结构检查保持；支持范围的语义校验与拒绝路径、错误类型正确；AI 检查本身不采样 RNG；五个名单项与无僚机都可创建世界。
- [x] setupHash 覆盖完整 AI 内容；别名变更不影响世界。
- [x] `pnpm exec vitest run src/core` 通过。

## 验证方法

- 合成内容的可达性、拒绝与 hash 测试；按 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 清理本项范围。

## 完成证据

- **实现：**
  - [ai-support.ts](../../../../../src/core/rules/ai-support.ts)：`scanProgramTable`（`0x5de18` 一次起点的扫描，完全匹配即停、部分匹配按扫描次序记最后一个，+0x04 = 1 在 flag 为 0 时跳过，|+0xE0| 按 `NEG`）、`SELECTION_KINDS`（0xFBFDA）、`loadTableProgram`（+0x08 为 0 取 0x380、+0x2C 为 ±0 取 1.0）、处理器身份映射（LE 对象 2 的 0x410c8 → `wingman`、0x42c10 → `base`，即 Ghidra 0x610c8/0x62c10）与 `aiRuleData`：对 `instantiableRecords` 的每个来源以缺省后的 +0xDC/+0xE0 枚举全部起点取并集（组表无任何部分匹配时才用内置表），得到可达表记录、内置记录、DFPG 与脚本，依次检查 `zero-divisor`、`negative-period`、`unsupported-handler`、`unsupported-opcode` 与参数、`zero-rate`（1001–1003 的 +0xAC/+0xB4/+0xB0，攻击航线的 +0xB8/+0xB4；比例来源 1.0、`0x5e4d0` 的下限 0.65/0.5、+0x34 ≠ 0 的原值、僚机 AICO 元素）、`element-out-of-range`、`zero-craft-divisor`。僚机处理器的检查按到达该记录的来源执行，不按种类。结果为冻结的 `WorldRuleData.ai`：变换后的表记录、内置处理器、DFPG 的 F(+0x08²)、可达脚本逐条的解析计划与可达集合（只供诊断）。
  - [ai-parameters.ts](../../../../../src/core/rules/ai-parameters.ts)：25 个支持操作码的参数类别；创建时无抽取地校验并生成解析计划（定值、区间端点与符号许可、关键字值、度数缩放后的定值），拒绝原因 `missing-argument`、`invalid-boolean`、`unknown-keyword`、`unterminated-range`、`invalid-number`、`zero-range`，路径为条目的 `opcode`/`argument`，不回显文字。数值语法：整数为可选符号与十进制数字且在 i32 内；浮点至多 15 位有效数字、按小数位折算后的指数绝对值 ≤ 22；多值参数按 `0x60924` 的逗号/空格与括号深度切分（记号 ≤ 32 字符，区间记号 ≤ 0x30）。负的等待按协调者批准的 CR-24 决定 16 接受（运行时等同 0，由 16 实现）。
  - [rule-data.ts](../../../../../src/core/world/rule-data.ts)、[create-world.ts](../../../../../src/core/world/create-world.ts)：`buildRuleData` 在 CR-01 的检查之后计算 `ai`；`transponderModel(setup)` 从种类 14 的声明或僚机选项取模型（没有则 `missing-transponder` 于 `input.craftTypes.content.entries`），+0xB8 ≤ 0 或 `models` 缺该模型也是 `missing-transponder`；种类 14 恒计入模型集合与机型静态数据；`instantiableModelIds` 列出该模型。
  - 测试支持：`aiProgramsContent()` 改为支持范围内的合成内容（表记录 0 供 0x80/0x100、只部分匹配的记录 1、不可达的记录 2 含不支持的脚本；内置记录 3 僚机、4 基地；5 个 AICO 元素），`everyOpcodeScript`；`worldInput` 为只有段 1 记录且没有种类 14 的任务追加不请求的绑定记录 `transponderBinding`（+0x10 为 −1、+0x78 已设，不抽取）。合成光盘的 AI 内容（production-rule-data.test-support.ts）同样改为可达部分受支持、内置记录 4/5 为僚机、6 为基地、8 个 AICO 元素；其对象 2 的扩展写入只写到处理器目标末尾，不再覆盖同一对象中其他资产的区域。
- **测试：** ai-parameters（类别表、每类的接受与拒绝、区间与多值切分、记号长度与指数边界、冻结、负等待被接受）；ai-support（扫描的起点、回绕、有符号比较与 flag；载入变换；身份映射；切片形状的闭包；完全/部分匹配、内置回退、不选择的种类；每个起点；每个拒绝原因及路径、不可达项不检查、处理器换位时按处理器检查）；rule-data（五个名单项与无僚机均可创建、结构错误仍为 `ContentContractError`、拒绝不回显、CR-01 先于 CR-15、AI 内容不同时创建后的 RNG 状态相同、创建后改动输入不影响冻结的 `ai` 与 setupHash、`missing-transponder` 的三条路径）；create-world 的 setupHash 测试覆盖关键字表与不可达脚本的变化。期望由 ai §1、§5.3 与 CR-15 独立写出。
- **检查：** `pnpm exec vitest run src/core` 通过（3,248 项）；`pnpm check` 通过（typecheck、lint、全部 323 个测试文件 9,664 项、生产构建）。浏览器：`mission-flow`（开发与生产）、`browser-replay`、`map-input`、`base-interaction` 共 25 项中 24 项通过；`base-interaction.development` 的“docks and launches twice …”在 goal 分支 `d3313738`（不含本项改动）上以相同断言失败（`toggle-map` 期望被拒绝而被受理），为既有问题，不由本项引起。
- **真实内容（私有，`local/research/p3-08/14-support/`，只输出判定、路径与序号）：** 生产导入后的完整包，在无僚机与名单 0–4 下：闭包为表记录 {0, 1, 2}、内置 {6}（僚机另加 {5} 或 {4, 5}）、DFPG 两个、17 个脚本、25 种操作码，与 ai §10 一致；真实内置表的处理器 fixup 正是上述两个身份。唯一的拒绝是一个可达脚本中 1001 的负的定值（`negative-delay`），已由协调者按方案 A 定为 CR-24 决定 16 并从 CR-15 删去；删去后六种配置都创建成功。
- **rubber-duck：** 采纳 3 项：僚机处理器的元素、速率与摆动周期检查改为按到达记录的来源（原只按种类 1）；零尾数的指数也受 ≤ 22 限制；两个切分器的长度上限改为原版的 32 与 0x30。未采纳 1 项：`instantiableModelIds` 在缺少种类 14 绑定时不抛错——应用据此解码已知模型后，世界创建报告精确的 `missing-transponder`，抛错反而使其报告为模型缺失。simplify：采纳复用 `toInt32`、操作码检查只在 `planArgument` 做一次、来源列表就地追加、速度/转向比例共用构造；未采纳：度数常量与 steering.ts 共用（需导出范围外文件的常量）、把种类 14 并入 `instantiableRecords`（setup-check.ts 在范围外）、导出项收窄（`scanProgramTable` 等供 15 使用）。
- **文档影响（交协调者）：** `docs/original/formats/ai.md` §12 的数据核对只覆盖区间端点，应补记“切片可达脚本中有一个 1001 的负定值”（已确认，数据）；`docs/engineering/modules/core.md` 的规则数据表中 `aiPrograms` 一行与世界创建的模型集合说明（种类 14 恒需绑定与模型、`WorldRuleData.ai`）已过时，在 28 的范围内。工程约定与指南无需改动。
