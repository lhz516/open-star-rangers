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

- [ ] AC-09 lint：
  - `src/platform/probe.ts` 中 `import type { ByteSource } from '../original-data/io/byte-source.ts'` 通过；
  - 同一路径的值导入、动态 `import()`、`export type` 再导出，以及类型导入其他 `original-data` 模块，都被拒绝；
  - core、content、render、ui、app 对端口模块的导入（含类型导入）都被拒绝。
- [ ] AC-09 依赖图：临时项目 fixture 证明以下各项：
  - 平台→端口的直接类型边被允许；
  - app/ui 经平台适配使用时不误报；
  - app/ui 直接导入端口，或经平台再导出获取端口，都报错；
  - 真实应用程序零违规。
- [ ] 端口模块与光盘代码在纯模块程序中编译；`pnpm exec vitest run tools/engineering-boundaries.test.ts`、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- 扩展现有 engineering-boundaries 中虚拟源的 ESLint 正负用例与临时项目依赖图 fixture；负向用例必须命中目标规则。
- 不适用 browser-testing 或原版对照。

## 完成证据
