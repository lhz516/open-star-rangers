---
type: plan
status: active
phase: P2
task: "12"
subtask: "01"
updated: 2026-10-07
---

# 01 — E2E 用例的项目归属约定

**契约来源：** [spec](../spec.md) 的 S-13、[技术决定](../spec.md#技术决定) 2（新用例的项目归属同步 Playwright 配置与 E2E 配置回归）；为 AC-24 的全量 E2E 提供前提。
**依赖：** 无。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 在 [playwright.config.ts](../../../../../playwright.config.ts) 中为本任务新增的用例建立按文件名归属的约定，使后续子任务新增用例时不再修改配置：
  - `*.development.spec.ts` 只在 `development` 项目运行：加入 `production` 项目的 `testIgnore`；
  - `*.production.spec.ts` 只在 `production` 项目运行：加入 `development` 项目的 `testIgnore`；
  - 普通 `*.spec.ts` 仍在两个项目运行；`development-headed` 的 `testMatch` 不变，新约定的文件不会进入它。
  - 既有用例的显式列表与归属保持不变。
- 在 [e2e-configuration.test.ts](../../../../../tools/e2e-configuration.test.ts) 中增加通用回归：`--list` 中来自 `*.development.spec.ts` 的测试只属于 `development`，来自 `*.production.spec.ts` 的只属于 `production`，且两类都不进入 `development-headed`。该断言在新文件尚不存在时也成立，之后自动约束新增文件。
- 文档影响：约定写入工程约定由 25 负责，本项在完成证据中注明。

## 不包含

- 任何新用例（02–10）；工程约定文档（25）。
- 改变既有用例的项目归属、超时、worker 数或 webServer 配置。

## 关键文件与契约

- [playwright.config.ts](../../../../../playwright.config.ts)：三个项目与 `testIgnore`、`testMatch`。
- [e2e-configuration.test.ts](../../../../../tools/e2e-configuration.test.ts)：已有的项目列表、单 worker、零重试与 `resource-cache`/`audio-playback` 只在开发项目的断言。

## 写入范围

- `playwright.config.ts`：新增两条按文件名的归属规则。
- `tools/e2e-configuration.test.ts`：新增通用归属回归。

## 验收标准

- [ ] 两条命名约定已生效；既有用例在三个项目中的归属与本项之前的 `--list` 结果逐项相同。
- [ ] 通用回归断言成立；临时放一个只含一条空测试的 `*.development.spec.ts` 与 `*.production.spec.ts`（验证后删除）时，二者分别只出现在对应项目。
- [ ] `pnpm test -- tools/e2e-configuration.test.ts`、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- 改动前后各运行一次 `pnpm exec playwright test --list --reporter=json`，比较既有用例的 `(file, project)` 集合相同。
- 用临时文件验证约定后删除，`git status` 不留文件。
- 不涉及浏览器验证或原版对照。

## 完成证据
