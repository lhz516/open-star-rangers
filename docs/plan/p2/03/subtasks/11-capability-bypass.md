---
type: plan
status: active
phase: P2
task: "03"
subtask: "11"
updated: 2026-10-05
---

# 11 — 补救：底层能力边界的绕过

**契约来源：** [spec](../spec.md) 的 S-07、AC-14，以及 AC-13 中的工程约定文档；[产品入口与底层能力](../spec.md#产品入口与底层能力)。来自 [10](./10-final-alignment.md) 首次最终对齐发现的缺口。
**依赖：** 07。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **本地再导出：** 不允许的使用者先纯类型导入受限模块，再用不带模块说明符的 `export { … }`/`export type { … }` 或 `export default` 导出该本地名称，这属于再导出。依赖图须报告这种情况。
  - 纯类型导入后只在本模块使用，仍然放行。
  - 从产品入口再导出它有意暴露的类型，也不受影响。
  - lint 无法追踪本地名称的来源，这一限制写入工程约定，由依赖图拦截。
- **嵌套模块：** `original-data/disc/` 与 `original-data/archive/` 下任意深度的模块都按受限能力识别；豁免仍只限于 `disc/disc-error.ts` 与 `disc/disc-path.ts`。lint 正则与依赖图分类同时修正。
- **测试：** lint fixture 覆盖对嵌套受限模块的值导入、再导出与动态导入；依赖图 fixture 覆盖本地类型再导出、本地值再导出、`export default`，以及嵌套受限模块。当前仓库仍无违规。

## 不包含

- 放宽或改变其他边界规则；修改 P2-01/P2-02 的边界检查。

## 关键文件与契约

- **修改：** [eslint.config.js](../../../../../eslint.config.js)、[engineering-boundaries.test.ts](../../../../../tools/engineering-boundaries.test.ts)、[工程约定](../../../../engineering/README.md#lint-规则eslintconfigjs)。

## 验收标准

- [ ] AC-14：依赖图拒绝不允许的使用者对受限类型或值的本地再导出（含 `export default`），以及对嵌套受限模块的任何非纯类型引用；lint 拒绝对嵌套受限模块的值导入、再导出与动态导入。
- [ ] 豁免模块、纯类型导入后的私有使用、产品入口类型的再导出，以及其他层的诱饵路径，仍然放行；当前仓库生产文件无违规。
- [ ] [工程约定](../../../../engineering/README.md#lint-规则eslintconfigjs)准确描述嵌套识别与 lint 的本地再导出限制。
- [ ] `pnpm exec vitest run tools/engineering-boundaries.test.ts`、`pnpm lint`、`pnpm typecheck` 与 `pnpm check` 通过。

## 验证方法

- 扩展 engineering-boundaries 的 lint 与依赖图 fixture，并对修正做变异检查。
- 不适用 browser-testing 或原版对照。

## 完成证据
