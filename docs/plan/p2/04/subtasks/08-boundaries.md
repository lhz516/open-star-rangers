---
type: plan
status: active
phase: P2
task: "04"
subtask: "08"
updated: 2026-10-05
---

# 08 — 边界与网络 API 规则

**契约来源：** [spec](../spec.md) 的 S-09；技术决定 4、10、13；AC-11 的边界部分。
**依赖：** 03, 05, 06。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **网络 API：** 在 [eslint.config.js](../../../../../eslint.config.js) 中禁止 `src/workers/` 的非测试文件使用 `fetch`、`XMLHttpRequest`、`WebSocket`、`EventSource`、`importScripts` 与 `navigator.sendBeacon`。全局名称与经 `self`、`globalThis` 的属性访问都在禁止之列。
- **测试支持：** 生产模块不得取得测试或测试支持模块，包括测试 Worker 入口：
  - 把现有 `support` 类别的检查扩展到 `src/` 下的全部生产模块，lint 与依赖图都要覆盖。现有检查只覆盖 `src/workers` 与 `original-data` 的导入者；当前仓库没有违规。
  - 再用 lint 拒绝生产代码中指向 `*.test.ts`、`*.test-support.ts` 的 `new URL(…, import.meta.url)` 字面量。
- **原版数据隔离：**
  - 增加 fixture，证明 `src/app/import/`、`src/platform/workers/` 经协议模块不会触及 `original-data`；
  - 协议模块若导入 `original-data`，从 app 出发的传递检查会报错；
  - Worker 中的生产模块继续只经产品入口取得原版字节：已有能力规则，本子任务补充针对新目录的 fixture。
- **测试：** 扩展 [engineering-boundaries.test.ts](../../../../../tools/engineering-boundaries.test.ts) 的 lint 与依赖图正负 fixture，并确认当前仓库无违规。
- **文档：** 在[工程约定](../../../../engineering/README.md#lint-规则eslintconfigjs)中记录网络 API 禁用规则，以及生产模块不得依赖测试支持的扩展。

## 不包含

- 实际网络请求审计（P2-12）。
- 修改 P2-03 能力分类本身；本子任务只扩展适用的导入者范围。

## 关键文件与契约

- **修改：**
  - [eslint.config.js](../../../../../eslint.config.js)；
  - [engineering-boundaries.test.ts](../../../../../tools/engineering-boundaries.test.ts)；
  - [original-data-capabilities.ts](../../../../../tools/original-data-capabilities.ts)，若需共用判定；
  - [工程约定](../../../../engineering/README.md)。
- **被检查的新文件：** 01 至 06 新增的生产模块。

## 验收标准

- [x] AC-11 网络 API：每个被禁止的 API 都有拒绝 fixture（全局名称与 `self`、`globalThis` 属性形式），合法的 Worker 代码有放行 fixture；当前 `src/workers/` 无违规。
- [x] AC-11 测试支持：从 `src/app`、`src/platform`、`src/workers` 的生产模块导入、再导出、动态导入测试支持，以及用 `new URL` 指向测试入口，lint 与依赖图都拒绝，适用于 lint 无法追踪的形式时由依赖图拒绝；测试文件仍可导入测试支持。
- [x] AC-11 隔离：协议、`src/app/import/`、`src/platform/workers/` 到达 `original-data` 的 fixture 被拒绝，真实模块通过；Worker 只经产品入口取得原版字节。
- [x] `pnpm exec vitest run tools/engineering-boundaries.test.ts`、`pnpm lint`、`pnpm typecheck` 通过；依赖清单与锁文件不变。

## 验证方法

- 边界回归测试，在临时项目中使用真实配置；每条新规则都做变异检查（去掉规则后对应测试失败）。
- 不适用 browser-testing 或原版对照。

## 完成证据

- **实现：**
  - [eslint.config.js](../../../../../eslint.config.js)：
    - `osr/original-data-capabilities` 的适用范围扩大到 `src/` 下全部非测试文件。指向测试、测试支持或 `src/` 外文件的引用，任何导入者都报 `support`，包括来源族与产品入口。能力族的 `restricted` 仍只在 `src/workers/` 与 `original-data` 的非来源族中判定（`familyChecked`），与原语义一致。
    - 新增 `new URL('…', import.meta.url)` 的检查。
    - 新增 `src/workers/` 非测试文件的网络 API 禁用：`no-restricted-globals` 覆盖 5 个全局名称；`no-restricted-properties` 只按属性名限制，对任何对象都生效，覆盖这 5 个名称与 `sendBeacon`。
  - [original-data-capabilities.ts](../../../../../tools/original-data-capabilities.ts) 新增 `urlTarget`，lint 与依赖图共用，按 URL 语义解析：
    - 相对路径不论有无 `./`，都相对于模块目录；`/` 开头时相对于仓库根；
    - 反斜杠视为分隔符；去掉查询与片段；`.js` 视为 `.ts`；
    - 外部 URL（带协议或 `//`）忽略。
  - [engineering-boundaries.test.ts](../../../../../tools/engineering-boundaries.test.ts)：新增 `urlReferences`。`capabilityViolations` 不再豁免来源族与产品入口的 `support` 目标，并经 `urlTarget` 检查 URL 引用。URL 不计入 `originalDataReach`，因为 Worker 入口单独载入，不是导入。
- **测试：** 边界回归共 79 项，新增 4 项。
  - **网络 API：** 每个 API 以全局名称、`self.` 与 `globalThis.` 三种形式被拒绝。另有代表性样本覆盖：`.tsx` 中的 `new WebSocket`、计算属性 `self['fetch']`、解构、经局部别名的 `scope.EventSource`，以及 `navigator.sendBeacon`、`self.navigator.sendBeacon`、`globalThis.navigator['sendBeacon']`。Blob 读取、`postMessage` 与指向生产入口的 URL 放行；`.test.ts` 与 `.test-support.ts` 中的同类代码放行。
  - **测试支持（lint）：** 以下 21 个样本都只报 `support`：
    - `app`、`platform`、`workers`、`ui`、`render`、`core`、`content` 的导入、再导出、动态导入与 `import()` 类型；
    - `new Worker(new URL(...))`、模板字面量、无 `./`、带 `?worker`、带 `#entry`、`.js`、仓库根路径与反斜杠路径；
    - 来源族模块与产品入口导入测试支持。

    放行的样本：生产 Worker 入口的 URL、测试文件导入测试支持、纯类型私用（再导出由依赖图拦截）、资源 URL（含查询与根路径）、外部 URL（含反斜杠形式的 `//`）以及含表达式的模板。`workers` 中导入 `identifySource` 或以反斜杠 URL 指向 `disc-image.ts` 都报 `restricted`。`app` 导入 `disc-image.ts` 只报 `no-restricted-imports`，不重复报告。
  - **测试支持（依赖图）：** 以下 12 个夹具违规全部被报告：`app/import` 的值导入、`export *`、动态导入、`import()` 类型、纯类型导入后再导出；`platform/workers` 用字面量与模板 URL 指向测试 Worker 入口；`workers` 的无 `./` 与带查询加片段的 URL；`app` 的仓库根与反斜杠 URL；来源族导入测试支持。生产入口 URL、纯类型私用、外部 URL 与资源 URL 不报告。
  - **隔离：** 同一夹具含两条链。干净协议链上的 `app/import`、`platform/workers` 没有违规，平台工厂经 URL 指向会导入产品入口的 Worker 入口也不被计入；导入 `original-data` 的协议链上，`app` 的端口、持有者与平台工厂都报到达 `identify-source.ts`。真实仓库的 `capabilityViolations` 与 `originalDataReach` 都为空，`pnpm lint` 对 01 至 07 的新文件无违规。
- **变异检查：** 以下 16 项变异都至少使 1 项测试失败：
  - 去掉全局名称规则或 `sendBeacon`；去掉 URL 访问器，或改回模块说明符解析；
  - 文件范围改回 `workers` 与 `original-data`；去掉 `familyChecked`；来源族不报 `support`；产品入口不检查引用；
  - 依赖图去掉 URL 引用、来源族的 `support` 判定，或恢复来源族跳过；
  - `urlTarget` 去掉外部判断、查询与片段、`.js` 映射、根路径或反斜杠。
- **检查：** `pnpm check`（93 个文件、2669 项测试、构建）、`pnpm lint`、`pnpm typecheck`、`pnpm check:original`（passed）都通过；依赖清单与锁文件不变。
- **Rubber-duck：**
  - **第一轮阻塞问题：** URL 检查沿用模块说明符解析，无 `./`、带查询的路径与仓库根路径都能绕过。已改为共用的 `urlTarget`，并补 lint 与依赖图夹具。
  - **复核阻塞问题：** 反斜杠路径在浏览器 URL 中是分隔符，但未被规范化，仍可绕过。已先把反斜杠转为 `/`，并补夹具（含反斜杠形式的外部 URL）。
  - **复核确认：** `familyChecked` 保持了原 `restricted` 语义；排除 URL 不影响可达性检查；网络禁用覆盖了列出的形式。
- **Simplify：**
  - **已采纳：** 网络 API 测试只对每个 API 测 AC-11 要求的三种形式，其余语法形式各用一个代表；可达性的两条链合并到同一夹具，只编译一次。
  - **未采纳：**
    - 把限制策略提成共用函数：lint 与依赖图的适用范围有意不同，P2-03 只共享分类；
    - 合并两次 AST 遍历：开销可忽略；
    - 只单测 `urlTarget`：成对的 lint 与依赖图夹具同时证明两者一致。
- **文档影响：** [工程约定](../../../../engineering/README.md#lint-规则eslintconfigjs)的 Lint 一节新增“测试支持与工具”（含 URL 解析语义）与“导入 Worker 不用网络”两条。源码结构与 STATUS 不变。

