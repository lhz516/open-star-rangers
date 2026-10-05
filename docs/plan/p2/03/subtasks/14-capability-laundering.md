---
type: plan
status: active
phase: P2
task: "03"
subtask: "14"
updated: 2026-10-05
---

# 14 — 补救：经允许模块转手的底层能力

**契约来源：** [spec](../spec.md) 的 S-07、S-13、AC-13、AC-14 与[风险与恢复](../spec.md#风险与恢复)中的“绕过把关”：底层能力只供来源模块自身、测试与 `tools/` 使用，产品代码只能经产品入口取得镜像、文件与封包。来自 [10](./10-final-alignment.md) 第二次最终对齐发现的缺口。
**依赖：** 11。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **缺口：** 边界只判定导入的直接目标。来源族模块、`*.test-support.ts` 与 `tools/` 模块本身被放行，因此 Worker 或转换模块可以经它们再导出或包装的 `openDiscImage`、`openImfatArchive`、`identifySource` 取得底层能力；真实 ESLint 配置对这三类探针都不报告。
- **共用分类：** [original-data-capabilities.ts](../../../../../tools/original-data-capabilities.ts) 改为默认拒绝：
  - 来源族只对外提供产品入口 `open-verified-source.ts`，以及两个公开模块 `verify-source-mappings.ts`（只接受已验证来源句柄）与 `source-catalog.ts`（白名单数据与读取，不携带打开能力）。其他来源族模块，包括 `identify-source.ts` 与今后新增的模块，都只供来源族自身使用。
  - 两个公开模块不属于来源族，按普通使用者检查，因此不能再导出或包装底层能力。
  - 产品入口自己使用底层能力，因此导出面受限：唯一的值导出是它声明的函数 `openVerifiedSource`，其他导出都必须是纯类型。
  - 测试、测试支持与 `src/` 之外的全部仓库文件（`tools/`、E2E 支持、配置等）对受检的生产模块（Worker 与 `original-data` 中来源族以外的模块）都是受限目标；依赖包不受此限。
- **执行：** lint 规则与依赖图共用上述分类，消息区分“经产品入口读取”与“生产代码不得依赖测试或工具”。lint 与依赖图都从语法核对产品入口的导出面。纯类型导入的既有放行不变。
- **测试：** lint 与依赖图 fixture 增加经来源族 barrel、测试支持、`tools/` 与 E2E 支持转手的拒绝项（再导出与包装函数），公开模块与产品入口泄露底层能力的拒绝项，以及导入公开来源模块、产品入口纯类型再导出的放行项；分类函数有逐类表格测试；当前仓库无违规。

## 不包含

- 修改 spec、产品入口的行为或其他层的既有消费者限制。其他层经 `src/` 内的中间模块到达 `original-data`，已由既有的传递检查拒绝。

## 关键文件与契约

- **修改：** [original-data-capabilities.ts](../../../../../tools/original-data-capabilities.ts)、[eslint.config.js](../../../../../eslint.config.js)、[engineering-boundaries.test.ts](../../../../../tools/engineering-boundaries.test.ts)、[工程约定](../../../../engineering/README.md)，必要时更新[源码结构](../../../../engineering/source-structure.md)。

## 验收标准

- [x] AC-14：Worker 与 `original-data` 中来源族以外的模块，经来源族非公开模块、公开模块、产品入口的导出、测试支持或 `src/` 之外的文件转手取得底层能力时，lint 与依赖图都拒绝（本地名称的再导出只由依赖图拦截）；导入产品入口、两个公开来源模块、错误类型、`DiscPath` 语法检查与来源映射读取，以及纯类型导入，仍然放行。
- [x] AC-13/S-13：工程约定对能力边界的描述与实际执行一致。
- [x] `pnpm exec vitest run tools/engineering-boundaries.test.ts`、`pnpm lint`、`pnpm typecheck` 与 `pnpm check` 通过。

## 验证方法

- 扩展边界 fixture；变异检查：把来源族全部公开、让测试支持或 `src/` 之外的文件不再受限、把公开模块并入来源族、放宽产品入口的导出面检查，对应测试都失败。
- 不适用 browser-testing 或原版对照。

## 完成证据

- **实现：**
  - [original-data-capabilities.ts](../../../../../tools/original-data-capabilities.ts) 改为默认拒绝：
    - 来源族中，产品入口与 `verify-source-mappings.ts`、`source-catalog.ts` 之外的模块都是受限的 `source`；
    - 两个公开模块不属于来源族，按普通使用者检查；
    - 测试、测试支持与 `src/` 之外的仓库文件都是受限的 `support`，依赖包不受此限；
    - 共用常量 `PRODUCT_ENTRY_EXPORT` 规定产品入口唯一的值导出。
  - [eslint.config.js](../../../../../eslint.config.js) 的规则对 `support` 目标使用单独的消息。对产品入口，规则核对导出面：值声明（`openVerifiedSource` 函数声明除外）、值再导出、值 `export *` 与默认导出都报错。规则不再对 `.tsx` 测试文件生效。
  - [engineering-boundaries.test.ts](../../../../../tools/engineering-boundaries.test.ts)：
    - 新增 `entryValueExports`，按同一规则从语法核对产品入口；
    - `capabilityViolations` 按分类豁免 `.ts`/`.tsx` 测试导入者，未解析的说明符与解析器标记的外部依赖包不算受限目标。
- **测试：**
  - **lint 拒绝：**
    - 经来源族 barrel 的值导入与 `export *`，以及嵌套来源模块的动态导入；
    - 产品入口的值再导出、`export *`、本地别名默认导出、改名导出与变量导出；
    - 公开模块的再导出与包装。
  - **lint 只报 `support`：** 经测试支持、`tools/`、E2E 支持与 `vite.config.ts` 的导入，以及同族测试支持。
  - **lint 放行：**
    - 公开来源模块、产品入口的值导入；
    - 产品入口的 `export type`/`export type *`/类型说明符与接口、类型别名；
    - 只纯类型导入归档读取器的 `verify-source-mappings.ts`、依赖包、`.tsx` 测试支持，以及同名的诱饵目录。
  - **依赖图：**
    - 主 fixture 新增经来源族 barrel 的再导出与包装、经测试支持与 `tools/`、E2E 支持的两跳，以及导入测试支持的同族模块；
    - 新增泄露测试：产品入口的 `export *`、`export * as`、本地值与别名默认导出、变量与类导出，`source-catalog.ts` 的再导出，`verify-source-mappings.ts` 的包装；
    - 纯类型的类再导出、`export type *` 与 `.tsx` 测试支持不被报告。
  - **分类表格：** 15 个路径的表格测试覆盖每一类与诱饵。
  - **当前仓库：** lint 与依赖图都无违规。
- **变异检查：** 以下改动都使对应测试失败：
  - 来源族全部公开；
  - 测试支持不受限；
  - `src/` 之外只限制 `tools/`；
  - 公开模块并入来源族；
  - 依赖图跳过产品入口，或忽略其默认导出、导出声明；
  - lint 跳过产品入口、忽略默认导出或放行任意声明；
  - 依赖图或 lint 只豁免 `.ts` 测试；
  - 消息全部映射为 `restricted`。

  解析器标记外部依赖包的分支需要链接到仓库外的依赖包，fixture 未覆盖；普通 pnpm 依赖位于 `node_modules/` 下，由分类表格覆盖。
- **检查：**
  - `pnpm exec vitest run tools/engineering-boundaries.test.ts`：75 个测试通过；
  - `pnpm lint`、`pnpm typecheck` 通过；
  - `pnpm check`：87 个测试文件 2,358 个测试与构建通过。
- **Rubber-duck：**
  - **首次审阅，采纳两项阻塞：**
    - 公开模块可凭文件名放行而转手能力：两个公开模块移出来源族，并核对产品入口的导出面；
    - E2E 支持等 `src/` 之外的文件可作中转：一律归为 `support`。
  - **修复核对，采纳两项阻塞：**
    - 产品入口经本地别名（`const leak = openDiscImage; export default leak`）泄露；
    - `export type *` 被误报。

    两项都改为从语法核对产品入口导出面来解决。
  - **修复核对，采纳两项非阻塞：** `.tsx` 测试导入者未豁免；链接到仓库外的依赖包被误判为 `support`。
- **Simplify（一个代理覆盖四个角度）：**
  - 采纳两项：拆分 `entryValueExports` 的名称提取；每个导入者只计算一次所属的族。
  - 未采纳三项：
    - 不把入口判定抽成与 AST 无关的共用谓词：两种 AST 的适配代码比判定本身更长，两条路径都有变异测试；
    - 保留 `isExternalLibraryImport`：链接的依赖包解析到 `node_modules/` 之外，路径判定不足；
    - 不精简第二遍导入扫描：该代码属于 11，本补救未改动。
- **文档影响：** [工程约定](../../../../engineering/README.md#lint-规则eslintconfigjs)改写受限模块、公开来源模块、产品入口的导出面与 `support` 类别，并把“其他层经中间模块到达”的表述限定为 `src/` 内的中间模块。[源码结构](../../../../engineering/source-structure.md)只链接工程约定，无需改动。
- **范围外观察：** 消费者层（core、content、render、ui、app）的传递检查只跟随 `src/` 内的边。这是 P2-01/P2-02 的既有消费者契约，P2-03 不改变；本补救只把工程约定的表述改为与之一致。
