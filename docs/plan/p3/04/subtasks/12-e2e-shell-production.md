---
type: plan
status: active
phase: P3
task: "04"
subtask: "12"
updated: 2026-10-10
---

# 12 — E2E：外壳、合规、生产预览与其余迁移

**契约来源：** [spec](../spec.md) 的[合成演示退役](../spec.md#合成演示退役)的测试迁移与文字、[开发诊断](../spec.md#开发诊断)的生产边界；AC-15，AC-18 的迁移部分，AC-22 的生产部分。
**依赖：** 10。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- [app-shell.spec.ts](../../../../../e2e/app-shell.spec.ts)、[app-shell-resources.spec.ts](../../../../../e2e/app-shell-resources.spec.ts)、[bootstrap.spec.ts](../../../../../e2e/bootstrap.spec.ts)、[compliance-text.spec.ts](../../../../../e2e/compliance-text.spec.ts)：以开始任务入口与其资格说明取代演示入口；焦点规则；更新后的权利与隐私声明可读。
- [production-preview.spec.ts](../../../../../e2e/production-preview.spec.ts)：菜单、导入与任务流程（经生产缓存预置）在严格 CSP 与网络审计下没有违规或外发请求；产物与 source map 来源不含开发诊断面板、事件日志、命令编辑、下载入口与测试支持；生产 DOM 中没有诊断面板。
- [webgl-unavailable.spec.ts](../../../../../e2e/webgl-unavailable.spec.ts)：任务流程不创建 WebGL 表面，WebGL 不可用的降级改为在查看器上验证（查看器用例尚未覆盖的部分迁到此处）；确认菜单与任务流程在该浏览器中可用。
- [interaction-render.spec.ts](../../../../../e2e/interaction-render.spec.ts)：只验证合成键位与合成画面的部分删除；通用的原生控件与同所有者 resize 若仍有价值则迁到查看器或任务画面；删除整文件时同步 [playwright.config.ts](../../../../../playwright.config.ts) 与 [e2e-configuration.test.ts](../../../../../tools/e2e-configuration.test.ts)。
- [browser-replay.spec.ts](../../../../../e2e/browser-replay.spec.ts)：改为正式 Core：在浏览器中以合成内容执行 `replayRecord`，与 Node 的结果比较一致；版本与身份不符的记录被拒绝。
- [joint-pipeline.development.spec.ts](../../../../../e2e/joint-pipeline.development.spec.ts)：演示部分改为进入任务流程或删除，导入、缓存与查看器的验收不变。
- [viewer-page.spec.ts](../../../../../e2e/viewer-page.spec.ts)：`frameWindow` 改从 `mission-observations.ts` 导入；[image-observations.ts](../../../../../e2e/support/image-observations.ts)：去掉 `synthetic-view`，按查看器画面取证。
- 完成证据列出每个旧用例的去向。

## 不包含

- 生命周期、资源平衡与 Fast Refresh（11）；`demo-observations.ts` 与合成源码的删除（13）。

## 关键文件与契约

- 修改：上列 E2E 文件、[playwright.config.ts](../../../../../playwright.config.ts)、[e2e-configuration.test.ts](../../../../../tools/e2e-configuration.test.ts)。
- 消费：10 的 `mission-observations.ts` 与生产缓存预置；01 的合成内容。

## 写入范围

- `e2e/app-shell.spec.ts`：迁移。
- `e2e/app-shell-resources.spec.ts`：迁移。
- `e2e/bootstrap.spec.ts`：迁移。
- `e2e/compliance-text.spec.ts`：迁移。
- `e2e/compliance-assets.spec.ts`：声明文字变化时同步。
- `e2e/production-preview.spec.ts`：迁移与产物检查。
- `e2e/webgl-unavailable.spec.ts`：迁移。
- `e2e/interaction-render.spec.ts`：删除或迁移。
- `e2e/browser-replay.spec.ts`：改为正式 Core。
- `e2e/joint-pipeline.development.spec.ts`：演示部分迁移。
- `e2e/viewer-page.spec.ts`：helper 导入。
- `e2e/support/image-observations.ts`：取证对象。
- `playwright.config.ts`：用例增删时的项目归属。
- `tools/e2e-configuration.test.ts`：对应回归。
- `tools/compliance/notices.ts`：`ORIGINAL_RIGHTS_BOUNDARY` 不再提合成演示，其余声明不变。
- `tools/compliance/notices.test.ts`：对应断言。
- `e2e/support/app-entry.ts`：只改 `expectNoPlayClaim`（开始入口按资格启用、页面不声称原版玩法可玩）。
- `e2e/support/browser-test.ts`：测试后检查的意外失败 ID 改为正式应用的 ID。

## 验收标准

- [ ] AC-15：生产任务流程在 CSP 与网络审计下无违规；产物、source map 来源与生产 DOM 中没有开发诊断与测试支持。
- [ ] AC-22（生产）：生产中没有面板、日志、命令编辑器或测量接线。
- [ ] 迁移后的用例不再引用 `demo-observations.ts`、`synthetic-view`、`Start synthetic demo` 或 `src/core/synthetic`；每个旧用例的去向有记录。
- [ ] `pnpm test:e2e` 中本项涉及的文件在 development 与 production 项目通过；`pnpm check`（含 `tools/e2e-configuration.test.ts`）通过。

## 验证方法

- 按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md)；产物检查读取 `dist/` 与 source map 来源列表。
- 不适用原版对照。

## 完成证据
