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
- `src/render/` 及其首个 `.test.ts` 为计划新增。

## 验收标准

- [ ] AC-01 的依赖、包根导入、许可证与纯模块边界成立。
- [ ] AC-17 的测试发现和 DOM-free 传递导入成立，未新增禁止工具。
- [ ] 运行 `pnpm exec vitest run tools/engineering-boundaries.test.ts` 与 `pnpm lint`。

## 验证方法

- 用 lockfile/package metadata 和源码检索核对版本、许可证与导入；使用真实边界回归，不读取 `local/`。
- 依赖安装只在 manifest 变更后执行；不进行浏览器或原版对照。

## 完成证据
