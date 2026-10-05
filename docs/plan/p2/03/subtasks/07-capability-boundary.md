---
type: plan
status: active
phase: P2
task: "03"
subtask: "07"
updated: 2026-10-05
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

- [ ] AC-14：lint 与依赖图正负 fixture 全部按预期通过或拒绝；当前仓库生产文件无违规。
- [ ] P2-01 的原版消费者限制、P2-02 的平台端口例外，以及既有边界测试保持通过。
- [ ] AC-13（工程约定部分）：[工程约定](../../../../engineering/README.md#lint-规则eslintconfigjs)准确描述新规则、放行范围与验证位置。
- [ ] `pnpm exec vitest run tools/engineering-boundaries.test.ts`、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- 用 engineering-boundaries 的 lint 与 TypeScript 程序 fixture 验证；对每条负向 fixture 断言具体的规则名。
- 不适用 browser-testing 或原版对照。

## 完成证据
