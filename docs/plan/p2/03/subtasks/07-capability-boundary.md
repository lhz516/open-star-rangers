---
type: plan
status: active
phase: P2
task: "03"
subtask: "07"
updated: 2026-10-08
---

# 07 — 底层能力边界

**契约来源：** [spec](../spec.md) 的 S-07（边界部分）；[产品入口与底层能力](../spec.md#产品入口与底层能力)、[技术决定](../spec.md#技术决定) 8；AC-14，以及 AC-13 的工程约定文档部分。
**依赖：** 05。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **受限能力：** 下列模块的值导出构成受限能力：
  - P2-02 的 `disc/disc-image.ts` 与内部读取模块；
  - 03 的封包打开函数与 02 的规则模块；
  - 内存封包解析（[imfat.ts](../../../../../src/original-data/imfat.ts)）；
  - 05 的底层识别模块。

  `disc-error.ts`、`disc-path.ts`、P2-03 错误模块、白名单与指纹模块、产品入口、映射核验与 `source-mapping.ts` 不受限。
- **允许的使用者：** 只有同族模块（disc 族；archive 族含 `imfat.ts`；source 族）、来源模块、测试（`*.test.ts`、`*.test-support.ts`）与 `tools/`。
- **lint：** 在 [eslint.config.js](../../../../../eslint.config.js) 中，对 `src/workers/**` 与 `original-data` 内其他模块，拒绝对受限模块的值导入、再导出（含 `export type`）、字符串或模板 `import()`，以及 `TSImportType` 引用；允许纯类型导入声明。沿用 P2-02 对 `platform` 的做法，补足 typescript-eslint `allowTypeImports` 放过的语法。
- **依赖图：** 在 [engineering-boundaries.test.ts](../../../../../tools/engineering-boundaries.test.ts) 中增加直接边规则：除允许的使用者外，任何生产模块对受限模块的值边都失败。既有的 `mayReachOriginalData`、平台端口例外与消费者规则不变。
- **fixture：**
  - 正向：Worker 导入产品入口、错误类型与来源映射，纯类型导入受限模块；`tools/` 与测试使用底层能力；当前仓库全部生产文件通过。
  - 负向：Worker 或计划中的转换模块值导入 `openDiscImage`、封包打开函数或 `parseImfat`，或经再导出、动态加载、`import()` 类型绕过。
- **文档：** 在[工程约定](../../../../engineering/README.md#lint-规则eslintconfigjs)中补写这条边界规则及其理由。

## 不包含

- 创建 `src/workers/` 或任何 Worker 代码（P2-04）；消费者既有限制的任何放宽。

## 关键文件与契约

- **修改：**
  - [eslint.config.js](../../../../../eslint.config.js)；
  - [engineering-boundaries.test.ts](../../../../../tools/engineering-boundaries.test.ts)；
  - [工程约定](../../../../engineering/README.md)；
  - 必要时修改[源码结构](../../../../engineering/source-structure.md)中的模块职责描述。

## 验收标准

- [x] AC-14：lint 与依赖图正负 fixture 全部按预期通过或拒绝；当前仓库生产文件无违规。
- [x] P2-01 的原版消费者限制、P2-02 的平台端口例外，以及既有边界测试保持通过。
- [x] AC-13（工程约定部分）：[工程约定](../../../../engineering/README.md#lint-规则eslintconfigjs)准确描述新规则、放行范围与验证位置。
- [x] `pnpm exec vitest run tools/engineering-boundaries.test.ts`、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- 用 engineering-boundaries 的 lint 与 TypeScript 程序 fixture 验证；对每条负向 fixture 断言具体的规则名。
- 不适用 browser-testing 或原版对照。

## 完成证据

- **lint：** [eslint.config.js](../../../../../eslint.config.js) 中，`capabilityRules(prefix, tails)` 为四类导入者生成 `@typescript-eslint/no-restricted-imports`（正则模式，`allowTypeImports`）与 `no-restricted-syntax`：
  - `src/workers/`：受限 disc、archive 与 identify 能力；
  - `original-data` 中能力族与来源族之外的模块：同上；
  - disc 族：受限 archive 与 identify；
  - archive 族与 `imfat.ts`：受限 disc 与 identify。

  正则锚定 `original-data` 的布局，带或不带 `.ts`/`.js` 都识别；`disc-error.ts`、`disc-path.ts` 豁免。三种语法选择器与 P2-02 平台规则共用 `restrictedModuleSyntax`。
- **依赖图：** [engineering-boundaries.test.ts](../../../../../tools/engineering-boundaries.test.ts) 新增 `capabilityViolations`：用 `moduleReferences`（与 `moduleSpecifiers` 共用同一个遍历）解析每个生产模块的真实引用，按目标模块所属的族判定；只有纯类型导入声明豁免。`original-data`/`workers` 中参数无法核实的动态导入一律报错。
- **测试：**
  - **lint 拒绝**（26 项）：Worker、转换模块与 original-data 根目录对 `openDiscImage`、`readFileRange`、`openImfatArchive`、`readImfatDirectory`、`parseImfat`、`identifySource` 的值导入、再导出（含 `export type`、`export *`）、字符串或模板动态导入、`import()` 类型；不带扩展名和 `.js` 的写法；嵌套目录；disc 族与 archive 族之间的值导入。
  - **lint 放行**（19 项）：产品入口、映射核验、`DiscReadError`、`SourceError`、来源映射、纯类型导入；`disc-error`/`disc-path` 的再导出与动态导入；来源族、测试与 `tools/`；以及其他层同名的 `disc/`、`archive/`、`discovery.ts`、`imfat.ts`、`identify-source.ts` 等诱饵路径。
  - **依赖图：** fixture 精确报告 8 条违规（Worker 的值导入、类型再导出、动态导入与 `import()` 类型；转换模块的 `parseImfat`/`identifySource`；计算型动态导入；disc 族到 archive 族）。纯类型导入、错误类型、`DiscPath`、来源族的再导出与 test-support 均不报告。当前仓库生产文件无违规。
  - P2-01/P2-02 既有边界测试保持通过。
- **变异检查：** 以下改动都使对应测试失败：依赖图漏掉 identify 族；lint 漏掉 identify 能力；去掉 disc 豁免的前瞻。
- **检查：**
  - `pnpm exec vitest run tools/engineering-boundaries.test.ts`：59 个测试通过；
  - `pnpm lint`、`pnpm typecheck` 通过；
  - `pnpm check`：85 个测试文件 2,302 个测试与构建通过。
- **Rubber-duck：** 采纳两项阻塞意见：
  - 通配模式误伤豁免模块与其他层的同名路径：改为锚定正则，并增加诱饵与豁免模块的全部语法形式；
  - 不带扩展名或 `.js` 的写法绕过 lint：正则改为可选扩展名，并补充 fixture。
- **Simplify（一个代理覆盖四个角度，改动只涉及配置与测试）：**
  - 采纳：合并引用遍历；语法选择器 helper 与平台规则共用。
  - 未采纳：与 P2-01/P2-02 依赖图共享带缓存的解析 helper（需要重构既有检查，收益小）。
- **说明：** `TSImportType.argument` 的弃用警告在原有平台规则中已经存在，这里沿用同一写法。`import('…')` 类型本身也被既有的 `consistent-type-imports` 拒绝。
- **文档影响：** [工程约定](../../../../engineering/README.md#lint-规则eslintconfigjs)新增“原版数据的底层能力”规则，说明受限模块、放行范围、族间限制、lint 匹配方式与依赖图；[源码结构](../../../../engineering/modules/original-data.md#封包读取)链接该规则。

