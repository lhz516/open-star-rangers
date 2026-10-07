---
type: plan
status: active
phase: P2
task: "11"
subtask: "24"
updated: 2026-10-06
---

# 24 — 修正碎片面表的（顶点，法线）对解析

**契约来源：** [spec](../spec.md) 的 S-07 与 AC-13（效果的三角形数等于 `effectExpansionSize`，位置等于展开结果），以及 [15 的研究结论](../../../../original/formats/executable.md#effect-texture-mappings-p2-1115-research)：传入逐顶点法线的构建函数，其面表的每个角是（顶点序号，法线序号）一对。这是 P2-06 实现的缺陷，在 09 与 16 之前修正（见 goal 执行记录）。
**依赖：** 无。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- [effect-payload.ts](../../../../../src/content/effects/effect-payload.ts) 的 `faceTriangles` 与 `faceList` 增加法线数参数：
  - 为 0 时，每个角是一个顶点序号，行为不变（弹体与导弹）；
  - 为正数时，每个角是（顶点序号，法线序号）一对，两者分别小于顶点数与法线数；`faceList` 只返回顶点序号。
- 碎片的读取校验、[expand-effects.ts](../../../../../src/content/effects/expand-effects.ts) 的展开与 `effectExpansionSize`，以及 [effect-step.ts](../../../../../src/original-data/conversion/effect-step.ts) 的转换校验，都以 6 个法线（逐顶点列表的项数）解析碎片面表。
- payload 字节与 schema 不变：面表本就保存原始字，转换器的输出对同一来源不变，所以不递增模型转换器组件，也不改变生产 `ConverterVersion`。
- 测试数据：合成碎片（[effects.test-support.ts](../../../../../src/content/effects/effects.test-support.ts)、生产效果的合成可执行文件）改为对的格式；表驱动测试覆盖对的格式、越界的法线序号、单数字的截断。
- 本地基准：重跑 P2-06 的本地核对脚本，确认真实数据的碎片各为一个 6 角面，转换与展开都成功；证据只记计数。
- 更新 [源码结构](../../../../engineering/source-structure.md) 的效果 payload 与效果步骤描述。

## 不包含

- 贴图坐标（16）；查看器的效果显示（09）。

## 关键文件与契约

- 修改 `src/content/effects/`、`src/original-data/conversion/effect-step.ts` 及相邻测试与测试支持。

## 验收标准

- [x] 碎片面表按（顶点，法线）对解析；弹体与导弹不变；展开的三角形数等于 `effectExpansionSize`。
- [x] 对的格式中越界的顶点或法线序号、不完整的对，都报 `invalid-effect-payload`（转换中为 `invalid-payload`）。
- [x] 本地基准上碎片各为一个 6 角面，转换与展开成功；仓库中没有本地输出。
- [x] `pnpm check` 与 `pnpm check:original` 通过。

## 验证方法

- `pnpm exec vitest run src/content/effects src/original-data/conversion src/workers`，完成前 `pnpm check`。
- 本地基准脚本只在 `local/` 运行。按 execute-goal 做 rubber-duck 与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据

- **实现：**
  - [effect-payload.ts](../../../../../src/content/effects/effect-payload.ts)：
    - `faceTriangles(words, vertices, normals, path)` 与 `faceList(words, vertices, normals, path)` 增加法线数。为 0 时每个角是一个顶点序号；为正数时是（顶点序号，法线序号）一对，法线序号须小于法线数；`faceList` 只返回顶点序号。
    - 角数上限仍为顶点数：成对只改变每个角的字数，不改变角数。
    - 新增 `EFFECT_SHAPES.debrisNormals`（6），碎片读取校验传入它；`perVertex` 的注释改为顶点法线，模块开头的 schema 注释同步。
  - [expand-effects.ts](../../../../../src/content/effects/expand-effects.ts) 的 `expandDebris` 与 `effectExpansionSize`，以及 [effect-step.ts](../../../../../src/original-data/conversion/effect-step.ts) 的 `Regions.faces`，对碎片传 `debrisNormals`，弹丸与导弹显式传 0。
  - payload 字节与 schema 不变，不递增转换器组件，生产 `ConverterVersion` 不变。
- **测试数据：**
  - [effects.test-support.ts](../../../../../src/content/effects/effects.test-support.ts) 的合成碎片改为成对格式，面结构不变（三角形加四边形、五边形加三角形），法线序号与顶点序号不同。
  - [production-effects.test-support.ts](../../../../../src/original-data/conversion/production-effects.test-support.ts) 的生产区域为 14 个字，恰好容纳一个 6 对的六边形：两个模板的角顺序不同，法线序号与顶点序号不同，按纯顶点序号读取都不合规。
- **测试：** 新增 12 条。
  - [effect-payload.test.ts](../../../../../src/content/effects/effect-payload.test.ts)：
    - 成对面表只保留顶点序号；6 对的六边形为 4 个三角形，按纯序号读取不合规；
    - 表驱动拒绝 7 种成对面表：法线序号等于法线数、顶点序号等于顶点数、最后一对只剩一个字、没有结束标记、纯序号的面表、2 对的面、没有面；
    - 读取器另拒绝越界的碎片法线序号与在一对中间结束的面。
  - [effect-step.test.ts](../../../../../src/original-data/conversion/effect-step.test.ts)：转换拒绝越界的碎片法线序号与在一对中间结束的面（`invalid-payload`）。
  - 展开测试中碎片的面与 `effectExpansionSize`（30 个顶点、17 个三角形）不变，三角形数仍与展开结果一致。
  - **证伪：** 以下每种改动都使测试失败：
    - 转换、`expandDebris`、`effectExpansionSize` 或读取校验改回 0 个法线（分别为 24 条失败、测试文件载入失败、1 条失败、5 条失败）；
    - 去掉法线序号检查（3 条失败）。
- **本地基准：** 本机重跑 P2-06 的被忽略脚本，证据只记计数。
  - `effect-check.ts` 的独立面表解析改为碎片按对解析，并要求每个模板恰为一个 6 角面、法线序号等于顶点序号。退出码 0，`passed: true`。
    - 碎片 5 个形状，每个都是一个 6 角面，共 20 个三角形（修正前 35）；
    - 碎片规则 9/9，`sizeMatches` 为真；
    - payload 字节数、逐字段比较与两次运行的哈希都不变；
    - 效果用量的三角形由 448 降为 433，其余维度不变，仍在模型份额内。
  - `base-check.ts` 退出码 0，`passed: true`。与修正前的结果相比只有作业用量的三角形不同（4,148 → 4,133）。
  - 仓库中没有本地输出。
- **检查：**
  - `pnpm exec vitest run src/content/effects src/original-data/conversion src/workers`：871 条通过；
  - `pnpm check`：150 个文件 4,467 条测试，构建通过；
  - `pnpm check:original` 通过。
- **Rubber-duck：** 没有阻塞或非阻塞问题。审阅确认：
  - 角数上限应保持为顶点数；`src/` 中没有其他消费者依赖旧的解析；
  - 已缓存的资源包字节不变，修正后的三角形数只影响转换计费，所以不递增 `ConverterVersion` 成立；
  - 没有空真的测试。
- **Simplify：** 采纳一项：模块开头的 schema 注释仍把每个角写成顶点序号，已改正。

  未采纳：
  - 法线数改为默认参数或面格式描述对象：显式参数正是为了防止漏传碎片的法线（本缺陷的成因）；
  - 合并校验与构建为一次遍历、去掉每个面的临时数组：面表每次导入只解析几次，开销不明显。
- **文档影响：** [源码结构](../../../../engineering/source-structure.md)的效果 payload 一节：
  - 字节布局与校验规则加入成对的角与法线序号；
  - `EFFECT_SHAPES` 加入碎片的 6 个法线；
  - 面表函数改为新签名。

  executable 与 unknowns 的事实已由 15 更正，无需改动。
