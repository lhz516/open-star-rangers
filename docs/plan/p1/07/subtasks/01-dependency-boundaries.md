---
type: plan
status: active
phase: P1
task: "07"
subtask: "01"
updated: 2026-10-02
---

# 01 — Three.js 依赖与模块边界

**契约来源：** [spec](../spec.md) 的 S-01、S-09、AC-01、AC-17。
**依赖：** 无。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 加入 `three` 与 `@types/three`，保持约定的 0.186 次版本、许可证与 lockfile 一致；只允许包根导入。
- 建立 `src/render/` 的目录边界和测试入口，使 DOM-free 渲染模块由 Node 测试传递导入，并保持 `src/core` 等纯模块禁用 Three.js。
- 记录真实依赖与当前工程限制，不引入 R3F、WebGPU、addons、jsdom、canvas 模拟或 Playwright。

## 不包含

- 不实现场景、浏览器表面或 React 组件（02–06）。
- 不运行部署、修改 CI 或生成第三方许可声明（P1-12/P5）。

## 关键文件与契约

- [package.json](../../../../../package.json)、[pnpm-lock.yaml](../../../../../pnpm-lock.yaml)。
- [eslint.config.js](../../../../../eslint.config.js)、[tsconfig.node.json](../../../../../tsconfig.node.json)。
- [engineering-boundaries.test.ts](../../../../../tools/engineering-boundaries.test.ts) 的 render layer 回归（实施时由计划中的 `src/render/` 首个测试改到此处，以复用真实 TypeScript 程序）；`src/render/` 生产模块由 02 起新增。

## 验收标准

- [x] AC-01 的依赖、包根导入、许可证与纯模块边界成立。
- [x] AC-17 的测试发现和 DOM-free 传递导入成立，未新增禁止工具。
- [x] 运行 `pnpm exec vitest run tools/engineering-boundaries.test.ts` 与 `pnpm lint`。

## 验证方法

- 用 lockfile/package metadata 和源码检索核对版本、许可证与导入；使用真实边界回归，不读取 `local/`。
- 依赖安装只在 manifest 变更后执行；不进行浏览器或原版对照。

## 完成证据

- **依赖：** `three` `~0.186.1` 在 dependencies，`@types/three` `~0.186.0` 在 devDependencies（同为 0.186 次版本），通过 `pnpm add` 同步锁文件。包元数据许可：three 0.186.1 MIT、@types/three 0.186.0 MIT；其仅类型的传递开发依赖为 MIT（@tweenjs/tween.js、@types/stats.js、@types/webxr、fflate、meshoptimizer）与 Apache-2.0（@dimforge/rapier3d-compat），不进入网站产物，完整许可复核仍归 P1-12。
- **边界回归：** [engineering-boundaries.test.ts](../../../../../tools/engineering-boundaries.test.ts) 新增 `render layer boundaries`：用 TypeScript AST 读取应用程序生产源码的真实导入与标识符（注释/普通字符串不计），断言 Three.js 只从包根导入且只在 `render/`、无 R3F/WebGPURenderer、`render/` 无 rAF/`setAnimationLoop`/定时器/微任务调度、DOM-free 渲染模块全部位于真实 `tsconfig.node.json` 程序且该程序不含 `browser-*`/`.tsx`。纯模块禁止 `three` 的既有 lint 负向用例保持不变。
- **反证：** 临时 `src/render/zz-probe.ts`（注释内含 `setTimeout`、带注释的 `three/addons` 导入、`window.setTimeout`、无测试导入）使包根导入、调度和 Node 程序三项恰好失败；随后删除，工作树无残留。
- **检查：** `pnpm exec vitest run tools/engineering-boundaries.test.ts` 32/32 通过；`pnpm check` 通过（3 个 TypeScript 程序、ESLint、34 个测试文件/672 个测试、生产构建）。未新增 Playwright、jsdom、canvas 模拟或二进制资源。
- **审阅：** rubber-duck 指出正则把注释视为导入、漏掉含注释的导入、文本扫描误报及路径分隔符依赖，均已改为 AST 与 `relative`/`basename` 处理；simplify 采纳“单次解析、复用真实程序、并入既有边界回归”，未采纳显式模块分类清单（保留 `browser-*` 命名约定并写入工程约定）。
- **文档影响：** [工程约定](../../../../engineering/README.md#lint-规则eslintconfigjs) 增加该回归与 `browser-*` 约定；源码结构目录待 `src/render/` 实际出现时在 07 同步。
