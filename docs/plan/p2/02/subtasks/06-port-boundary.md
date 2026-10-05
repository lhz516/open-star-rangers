---
type: plan
status: active
phase: P2
task: "02"
subtask: "06"
updated: 2026-10-04
---

# 06 — 端口模块的边界放行

**契约来源：** [spec](../spec.md) 的 S-07（边界部分）、S-13（工程文档）；[技术决定](../spec.md#技术决定)第 6 项；AC-09。
**依赖：** 01。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **lint 放行：** 只允许 `src/platform/**` 的非测试文件以纯类型方式导入端口模块 `src/original-data/io/byte-source.ts`。
  - 值导入、动态 `import()`、再导出（含 `export type`），以及导入其他 `original-data` 模块，仍然拒绝。
  - core、content、render、ui、app 的既有原版消费者限制不扩大。
  - 可用 typescript-eslint 提供的 `no-restricted-imports` 扩展规则及其类型导入选项实现；纯模块与 content 规则合并在同一条选项中的约束继续保持。
- **依赖图放行：** [engineering-boundaries.test.ts](../../../../../tools/engineering-boundaries.test.ts) 的 `originalDataReach` 只允许平台文件到端口模块的那一条直接类型边。
  - app/ui 经平台适配间接使用端口时不误报。
  - app/ui 直接类型导入端口，或经平台再导出获取端口，仍然报错。
- **文档：** 在[工程约定](../../../../engineering/README.md#lint-规则eslintconfigjs)中，把“P2-02 须显式放行端口模块”的预留说明改为实际规则。

## 不包含

- 浏览器适配本身（07），以及 Worker 对 `original-data` 的使用（P2-04；`workers/` 已有放行）。

## 关键文件与契约

- **修改：** [eslint.config.js](../../../../../eslint.config.js)、[engineering-boundaries.test.ts](../../../../../tools/engineering-boundaries.test.ts)、[工程约定](../../../../engineering/README.md)。
- **前提：** 01 新增的 `src/original-data/io/byte-source.ts`。

## 验收标准

- [x] AC-09 lint：
  - `src/platform/probe.ts` 中 `import type { ByteSource } from '../original-data/io/byte-source.ts'` 通过；
  - 同一路径的值导入、动态 `import()`、`export type` 再导出，以及类型导入其他 `original-data` 模块，都被拒绝；
  - core、content、render、ui、app 对端口模块的导入（含类型导入）都被拒绝。
- [x] AC-09 依赖图：临时项目 fixture 证明以下各项：
  - 平台→端口的直接类型边被允许；
  - app/ui 经平台适配使用时不误报；
  - app/ui 直接导入端口，或经平台再导出获取端口，都报错；
  - 真实应用程序零违规。
- [x] 端口模块与光盘代码在纯模块程序中编译；`pnpm exec vitest run tools/engineering-boundaries.test.ts`、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- 扩展现有 engineering-boundaries 中虚拟源的 ESLint 正负用例与临时项目依赖图 fixture；负向用例必须命中目标规则。
- 不适用 browser-testing 或原版对照。

## 完成证据

- **实现：**
  - [eslint.config.js](../../../../../eslint.config.js)：`src/platform` 从通用消费者条目中移出，改由单独条目完整配置。
    - `@typescript-eslint/no-restricted-imports` 用两组规则：`original-data` 组排除端口（`!**/original-data/io/byte-source.ts`），端口组设 `allowTypeImports`；
    - `no-restricted-syntax` 拒绝三类语法：`export … from` 形式的 `original-data` 再导出（含 type），字符串或模板字面量参数的动态 `import()`，以及 `import('…')` 类型查询。
    - render、ui、app 与纯模块的规则不变。
    - 实测发现该扩展规则在 `allowTypeImports` 下会放过 `export type … from` 与动态 `import()`，所以加了语法规则。
  - [engineering-boundaries.test.ts](../../../../../tools/engineering-boundaries.test.ts) 的 `originalDataReach` 新增私有使用例外：平台文件对端口的每个引用都是纯类型导入声明，且不导出端口类型，也不导出在任何位置引用端口的类型别名或接口时，平台到端口的边不计入可达性。导出函数与类的签名可以使用端口。
- **测试：**
  - lint：
    - 平台的 `.ts`/`.tsx` 文件（含子目录）以 `import type` 或 `import { type … }` 导入端口时通过；
    - 值导入、副作用导入、`export type … from`、`export { type … } from`、`export *`、`export type *`、字符串与模板字面量的动态 `import()`、类型查询，以及纯类型导入其他 `original-data` 模块（imfat、disc-image、io/other），共 11 种写法全部命中目标规则；
    - core、content、render、ui、app 对端口的四种导入形式都被 `no-restricted-imports` 拒绝；平台对其他 `original-data` 模块的四种形式仍被拒绝。
  - 依赖图：
    - 临时项目 fixture 证明平台的 `import type`、内联 `type`、`implements` 适配，以及 app 经适配使用，都不报错；
    - 违规的平台文件 11 个：值（命名空间）导入、`export type … from`、本地 `export type`、类型别名、泛型约束或默认值、映射类型、接口继承、默认导出接口、命名空间限定、动态 import、类型查询；另有 1 个平台文件导入其他 `original-data` 模块；
    - 经它们取得端口的 app、ui、render 文件，以及 ui 直接导入端口，都报错；
    - 真实应用程序零违规。
  - 真实端口模块只含接口或类型别名声明，没有任何导入。
- **变异检查：** 依次删除私有使用跳过、删除导出泄漏检查、删除再导出语法规则，每处都有测试失败。检查后已恢复原代码。
- **检查：**
  - `pnpm exec vitest run tools/engineering-boundaries.test.ts` 56 项通过：高负载时以 `--testTimeout=180000` 验证功能，最后一次完整 `pnpm check` 中则按默认超时通过；
  - 完整 `pnpm check` 通过：typecheck、lint、77 个测试文件共 2041 项测试、build；
  - `pnpm check:original` 通过，0 findings。
- **Rubber-duck：**
  - 阻塞项已修复：导出的泛型默认别名、接口继承、映射别名会泄漏端口，而边被跳过 → 改为遍历导出类型别名与接口中的每个标识符，并补 6 个 fixture；
  - 非阻塞项已修复：lint 漏掉模板字面量的动态 import，已加入并补测试；
  - 未在 lint 层修复：先导入再本地导出或用别名转出。lint 无法追踪绑定来源，由依赖图拦截，工程约定已如实说明。
- **Simplify：**
  - 已应用：平台从通用消费者条目移出，不再依赖“后者覆盖前者”；两条动态 import 选择器合并；测试只判断一次是否为平台文件；端口文件从共享的应用程序中取得，不再另行解析。
  - 未采纳：
    - 不让配置与测试共用端口路径常量，测试要独立验证策略；
    - 违规清单保持显式列出，便于审阅；
    - 不合并 lint 用例，否则重复的导入绑定会让源码无法解析；
    - 不抽象通用的 `allowEdge` 策略，目前只有这一个例外。
- **文档影响：** [工程约定](../../../../engineering/README.md#lint-规则eslintconfigjs)中“P2-02 须显式放行端口模块”的预留说明，已改为实际的 lint 与依赖图规则；不涉及原版事实、命令或 U 项。
