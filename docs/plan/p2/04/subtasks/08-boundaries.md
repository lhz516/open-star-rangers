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

- [ ] AC-11 网络 API：每个被禁止的 API 都有拒绝 fixture（全局名称与 `self`、`globalThis` 属性形式），合法的 Worker 代码有放行 fixture；当前 `src/workers/` 无违规。
- [ ] AC-11 测试支持：从 `src/app`、`src/platform`、`src/workers` 的生产模块导入、再导出、动态导入测试支持，以及用 `new URL` 指向测试入口，lint 与依赖图都拒绝，适用于 lint 无法追踪的形式时由依赖图拒绝；测试文件仍可导入测试支持。
- [ ] AC-11 隔离：协议、`src/app/import/`、`src/platform/workers/` 到达 `original-data` 的 fixture 被拒绝，真实模块通过；Worker 只经产品入口取得原版字节。
- [ ] `pnpm exec vitest run tools/engineering-boundaries.test.ts`、`pnpm lint`、`pnpm typecheck` 通过；依赖清单与锁文件不变。

## 验证方法

- 边界回归测试，在临时项目中使用真实配置；每条新规则都做变异检查（去掉规则后对应测试失败）。
- 不适用 browser-testing 或原版对照。

## 完成证据
