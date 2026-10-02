---
type: guide
status: active
phase: P1
updated: 2026-10-01
related: [ADR-0002, ADR-0006]
---

# 工程约定

本项目代码的结构、命令与检查规则。架构决定见[总计划](../plan/master-plan.md) §4–5；本文只记录落地方式。

按 spec、goal 与 subtasks 开发的路径、审批、进度维护和 skills 入口见[Agent 任务工作流](./agent-workflow.md)。

## 环境

- Node 22（`.nvmrc`；`package.json` 要求 ≥ 22.18，以便直接运行 `.ts`），pnpm 12（`packageManager` 字段，由 corepack 提供）。
- 依赖用 `pnpm-lock.yaml` 锁定，升级经测试后合入。

## 命令

| 命令 | 作用 |
|---|---|
| `pnpm dev` | 启动 Vite 开发服务器 |
| `pnpm build` | 生产构建，输出到 `dist/` |
| `pnpm typecheck` | 分别用三个 tsconfig 做类型检查（见下） |
| `pnpm lint` | ESLint，包含模块边界与确定性规则 |
| `pnpm test` | Vitest 单元测试 |
| `pnpm check` | 依次运行以上四项检查，提交前使用 |

`tools/` 中的研究脚本直接用 `node tools/<脚本>.ts` 运行，见 [tools](../guides/tools.md)。

## TypeScript 配置

| 文件 | 范围 | 作用 |
|---|---|---|
| `tsconfig.base.json` | — | 共同选项：`strict`、`verbatimModuleSyntax`、`erasableSyntaxOnly`、允许 `.ts` 扩展名导入 |
| `tsconfig.core.json` | `src/core`、`src/original-data`、`src/content` | **不含 DOM 与 Node 类型**：这些纯模块一旦使用浏览器或 Node API，编译即失败 |
| `tsconfig.app.json` | `src/` 全部 | 浏览器应用（DOM、JSX、Vite 客户端类型） |
| `tsconfig.node.json` | `tools/`、构建配置、测试 | Node 端代码 |

- `erasableSyntaxOnly` 禁止 `enum`、`namespace` 等需要转换的语法，使同一份代码既能被 Vite 打包，也能被 Node 直接运行。常量集合用 `as const` 对象代替 `enum`。
- 导入本项目模块时写出 `.ts`/`.tsx` 扩展名，Node 直接运行时需要。
- **TypeScript 固定为 6.0.x。** TypeScript 7 是原生实现，不再提供 typescript-eslint 依赖的 JavaScript API；typescript-eslint 支持 7 之后再升级。

## Lint 规则（`eslint.config.js`）

- **纯模块**（`src/core`、`src/original-data`、`src/content`）不得导入 React、Zustand、Three.js、IndexedDB 封装库，也不得导入 `app`、`render`、`ui`、`platform`、`workers`。
- **`src/core`** 不得使用 `Math.random`、`Date`、`performance.now`、定时器、`requestAnimationFrame` 与 `await`。随机数来自 Core 自己的带种子生成器，时间来自 tick 计数（总计划 §5）。
- 类型导入必须写成 `import type`。
- 规则已用故意违规的临时文件验证：类型检查与 lint 都能拦下。

## 测试

- 单元测试与源码放在同一目录，命名为 `*.test.ts`，用 Vitest 在 Node 环境运行。
- **测试不得读取原版文件。** 原版格式的测试数据由 `src/original-data/synthetic.ts` 在代码中生成；用原版文件做的完整性检查放在 `tools/nob-check.ts`，只在本地运行。
- 驾驶舱字体目录的读取属于 `src/original-data/payloads.ts`，CLI 只负责调度与报告；合成样本覆盖目录顺序与空目录。
- Ghidra 编译器规范补丁另有标准库 `unittest` 测试：`python3 -B -m unittest discover -s tools/ghidra -p 'test_*.py'`，验证 XML 结构变换、备份与幂等性。
