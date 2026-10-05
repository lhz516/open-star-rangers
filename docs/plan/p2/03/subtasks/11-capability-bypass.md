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

- [x] AC-14：依赖图拒绝不允许的使用者对受限类型或值的本地再导出（含 `export default`），以及对嵌套受限模块的任何非纯类型引用；lint 拒绝对嵌套受限模块的值导入、再导出与动态导入。
- [x] 豁免模块、纯类型导入后的私有使用、产品入口类型的再导出，以及其他层的诱饵路径，仍然放行；当前仓库生产文件无违规。
- [x] [工程约定](../../../../engineering/README.md#lint-规则eslintconfigjs)准确描述嵌套识别与 lint 的本地再导出限制。
- [x] `pnpm exec vitest run tools/engineering-boundaries.test.ts`、`pnpm lint`、`pnpm typecheck` 与 `pnpm check` 通过。

## 验证方法

- 扩展 engineering-boundaries 的 lint 与依赖图 fixture，并对修正做变异检查。
- 不适用 browser-testing 或原版对照。

## 完成证据

- **分类：** 新增 [original-data-capabilities.ts](../../../../../tools/original-data-capabilities.ts) 的 `capabilityOf`/`familyOf`，由 lint 与依赖图共用：
  - disc 与 archive 族覆盖任意深度的 `.ts`/`.tsx` 模块；
  - 只豁免顶层的 `disc/disc-error.ts`、`disc/disc-path.ts`。
- **lint：** 07 的正则方案改为 [eslint.config.js](../../../../../eslint.config.js) 中的本地规则 `osr/original-data-capabilities`。
  - 它把相对说明符相对于被检查文件解析为真实路径（识别不带扩展名与 `.js`），再按族判定。正则只能匹配说明符文本，无法区分导入者的深度，因此改用解析。
  - 它覆盖值导入、副作用导入、带模块说明符的再导出（含 `export type`/`export *`）、字面量或模板动态导入与 `import()` 类型；纯类型导入声明放行。
  - P2-02 平台规则仍使用 `restrictedModuleSyntax`。
- **依赖图：** [engineering-boundaries.test.ts](../../../../../tools/engineering-boundaries.test.ts) 的 `capabilityViolations` 同时检查：不允许的使用者把从受限模块导入的名称，用不带模块说明符的 `export { … }`/`export type { … }`（含别名）或 `export default` 再导出。
- **测试：**
  - **lint：** 新增拒绝项包括嵌套目录中的导入者经 `../../archive/`、`../../imfat.ts` 到达受限模块，以及对 `disc/internal/*`、`archive/formats/*` 的值导入、`export *` 与动态导入。新增放行项包括 `convert/nested/` 中同名的 `../archive/helper.ts`、`../disc/helper.ts`（解析为 `convert/archive`、`convert/disc`），以及同族嵌套导入。
  - **依赖图：** fixture 新增报告本地类型再导出、带别名的本地再导出、`export default`、嵌套的 disc/archive 模块与 `.tsx` 受限模块。纯类型导入后私用，以及从产品入口再导出它暴露的类型，都不报告。当前仓库无违规。
- **变异检查：** 以下改动都使对应测试失败：关闭本地再导出检测；disc 分类改回只识别一层；lint 规则忽略族豁免。
- **检查：**
  - `pnpm exec vitest run tools/engineering-boundaries.test.ts`：59 个测试通过；
  - `pnpm lint`、`pnpm typecheck` 通过；
  - `pnpm check`：86 个测试文件 2,312 个测试与构建通过。
- **Rubber-duck：** 采纳两项：
  - `.tsx` 受限模块被漏判：改为识别 `.tsx?`；
  - lint 正则误伤 `original-data` 内同名的嵌套目录：改为解析路径的本地规则，并增加诱饵 fixture。

  未采纳一项：基于受限类型声明新的类型别名并导出（如 `type PublicImage = DiscImage`）不视为再导出。类型不携带打开能力，spec 明确不限制纯类型使用，受限的值则在导入时已被拒绝；工程约定已写明这一界定。
- **Simplify（一个代理覆盖四个角度）：** 采纳一项：把分类逻辑抽到 lint 与依赖图共用的模块，消除两处已经出现的细微差异（`imfat.tsx`）。
- **文档影响：** [工程约定](../../../../engineering/README.md#lint-规则eslintconfigjs)改写受限模块（任意深度、`.tsx`）、共用分类、解析式 lint 规则、依赖图对本地再导出的检测，以及类型别名不算再导出的界定。

