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

- [ ] 碎片面表按（顶点，法线）对解析；弹体与导弹不变；展开的三角形数等于 `effectExpansionSize`。
- [ ] 对的格式中越界的顶点或法线序号、不完整的对，都报 `invalid-effect-payload`（转换中为 `invalid-payload`）。
- [ ] 本地基准上碎片各为一个 6 角面，转换与展开成功；仓库中没有本地输出。
- [ ] `pnpm check` 与 `pnpm check:original` 通过。

## 验证方法

- `pnpm exec vitest run src/content/effects src/original-data/conversion src/workers`，完成前 `pnpm check`。
- 本地基准脚本只在 `local/` 运行。按 execute-goal 做 rubber-duck 与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据
