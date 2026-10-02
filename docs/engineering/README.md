---
type: guide
status: active
phase: P1
updated: 2026-10-02
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
| `tsconfig.node.json` | `tools/**/*.ts`、Vite 配置、`src/**/*.test.ts` | Node 端 TypeScript；`eslint.config.js` 由 lint 覆盖，未启用 JS 类型检查 |

- `erasableSyntaxOnly` 禁止 `enum`、`namespace` 等需要转换的语法，使同一份代码既能被 Vite 打包，也能被 Node 直接运行。常量集合用 `as const` 对象代替 `enum`。
- 导入本项目模块时写出 `.ts`/`.tsx` 扩展名，Node 直接运行时需要。
- **TypeScript 固定为 6.0.x。** TypeScript 7 是原生实现，不再提供 typescript-eslint 依赖的 JavaScript API；typescript-eslint 支持 7 之后再升级。

## Lint 规则（`eslint.config.js`）

- **纯模块**（`src/core`、`src/original-data`、`src/content`）的非测试 `.ts`/`.tsx` 不得导入或 re-export React、React DOM、Zustand、Three.js、IndexedDB 封装库的包根/子路径，也不得导入 `app`、`render`、`ui`、`platform`、`workers` 的目录入口或子模块。
- **`src/core`** 不得使用 `Math.random`、`Date`、`performance.now`、定时器、`requestAnimationFrame`、`await` 或任何 `async` 函数形式。随机数来自 Core 自己的带种子生成器，时间来自 tick 计数（总计划 §5）。其他消费层仍允许宿主调度和异步。
- 类型导入必须写成 `import type`。
- 持久正/负回归在 [engineering-boundaries.test.ts](../../tools/engineering-boundaries.test.ts)，进入现有 `pnpm test`/`pnpm check`。TypeScript 样本在自有临时项目中使用仓库原配置和真实 include/exclude，ESLint 使用虚拟源与真实逻辑路径，不在生产目录留违规文件。负向必须命中目标诊断，正向须通过；空项目、ignored/parser 错误及误配预期均会失败。
- 覆盖限定为明确的静态导入、路径、宿主 API 和 async/await 语法；不承诺识别动态绕过、别名间接调用或不经 async/await 的 Promise 链。测试例外是 `.test.ts`，不扩展未来 `.test.tsx`/E2E 发现能力。

## 测试

- 单元测试与源码放在同一目录，命名为 `*.test.ts`，用 Vitest 在 Node 环境运行。
- **测试不得读取原版文件。** 原版格式的测试数据由 `src/original-data/synthetic.ts` 在代码中生成；用原版文件做的完整性检查放在 `tools/nob-check.ts`，只在本地运行。
- 驾驶舱字体目录的读取属于 `src/original-data/payloads.ts`，CLI 只负责调度与报告；合成样本覆盖目录顺序与空目录。
- Ghidra 编译器规范补丁另有标准库 `unittest` 测试：`python3 -B -m unittest discover -s tools/ghidra -p 'test_*.py'`，验证 XML 结构变换、备份与幂等性。
- 工程边界回归还启动隔离的预期失败 Vitest 进程，断言其命中真正的失败检查并非零退出；该失败是测试输入，正常测试命令仍须成功。临时项目复制实际配置、链接已安装依赖，结束由 finally 清理，不读取 `local/` 或真实 Ghidra。
- 快速只跑边界回归：`pnpm exec vitest run tools/engineering-boundaries.test.ts`。不要用测试数量代替覆盖证明；当前证据见 [P1-01 subtasks](../plan/p1/01/goal.md#子任务跟踪)。

## 合成 Runtime

- [synthetic-runtime.ts](../../src/app/synthetic-runtime.ts) 是 P1 合成运行入口，契约见 [P1-04 spec](../plan/p1/04/spec.md)。它不是原版玩法，也尚未接入页面或浏览器帧循环。
- 调用者向 `frame(nowMs)` 提供单调不减的毫秒时间戳；首帧只锚定。只在 Runtime 内推进 Core；时钟和 Event Bus 的内部发布入口不能交给消费者。
- `setInput` 保存连续轴，`submitCommand` 返回 Runtime commandId；它不同于 Core entityId。命令结果在整帧模拟结束后通知，持续事实从 `uiProjection`/`renderFrame` 读取。
- `on`/`onAny` 仅接收同步、返回 undefined 的回调。监听器抛错前的副作用不会回滚；帧末 `listener-failed` 不意味着 tick 未提交，不可重试已完成 tick。Core `faulted` 后禁止模拟和输入，读取与订阅清理仍可用；恢复会话属于 P1-05。
- 当前只支持未录制模式；录制接线由 P1-04 后续子任务完成。测试用真实合成 Core；故障测试在 Vitest 创建边界注入 step 前异常，不向生产接口加入测试后门。
- 针对性检查使用 `pnpm exec vitest run src/app`；完整检查仍为 `pnpm check`。没有新浏览器/原版操作流程，不需要额外 guides。
