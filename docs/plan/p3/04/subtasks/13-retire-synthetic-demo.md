---
type: plan
status: active
phase: P3
task: "04"
subtask: "13"
updated: 2026-10-10
---

# 13 — 合成演示退役：源码与 lint 规则

**契约来源：** [spec](../spec.md) 的 S-10 与[合成演示退役](../spec.md#合成演示退役)的删除边界；AC-18（源码部分）。
**依赖：** 09, 11, 12, 18。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 删除前用 `git grep` 核对每个待删模块的实际使用者；仍被正式 Core、内容、平台、工具或 E2E 使用的合成 fixture/helper 不删（例如 `src/content/synthetic-content.test-support.ts`、`src/original-data/synthetic.test-support.ts`、`src/workers/synthetic-import.test-support.ts` 属于导入与内容测试，保留）。
- 删除 P1 演示专用链：`src/core/synthetic/`；`src/app/runtime/synthetic-*`；`src/app/session/synthetic-session*`（含 `synthetic-session.test-support.ts`，`ControlledHost` 已由 03 迁入中性的 `session-host.test-support.ts`）；`src/app/composition/synthetic-demo-*` 与 `use-synthetic-demo-owner.ts`；`src/ui/game/synthetic-*` 与 `use-synthetic-game.ts`；`src/ui/dev/SyntheticDevPanel.tsx`；`src/ui/pages/SyntheticDemoPage.tsx`；`src/ui/render/SyntheticRenderView.tsx`；`src/render/synthetic/`；以及只为它们存在的测试。
- 删除 `e2e/support/demo-observations.ts`（10–12 已迁走全部使用者）。
- 删除 lint 规则 `osr/core-synthetic-boundary` 及其在 [engineering-boundaries.test.ts](../../../../../tools/engineering-boundaries.test.ts) 中的回归；Core 纯度与确定性、模块边界、生产禁入 test-support 等其余规则与回归保持并通过。
- 测试数据中作为字符串出现的合成名称（例如 `fnv1a64.test.ts` 的 `osr-synthetic-snapshot`、`replay.test.ts` 用于拒绝的 `osr-synthetic-replay`、[synthetic-content.test-support.ts](../../../../../src/content/synthetic-content.test-support.ts) 中 P3-03 的 Asset ID `data/synthetic-scene`）不是模块引用，保持不变。
- 在完成证据中记录删除前最后一个包含这些路径的提交，供 15 写入退役记录。

## 不包含

- 当前工程文档、退役记录与历史链接（15、16）；E2E 迁移（10–12）。

## 关键文件与契约

- 删除：上列源码、测试与 E2E 支持文件。
- 修改：[eslint.config.js](../../../../../eslint.config.js)、[engineering-boundaries.test.ts](../../../../../tools/engineering-boundaries.test.ts)。

## 写入范围

- `src/core/synthetic/**`：删除。
- `src/app/runtime/synthetic-*`：删除。
- `src/app/session/synthetic-session*`：删除。
- `src/app/composition/synthetic-demo-*`：删除。
- `src/app/composition/use-synthetic-demo-owner.ts`：删除。
- `src/ui/game/synthetic-*`：删除。
- `src/ui/game/use-synthetic-game.ts`：删除。
- `src/ui/dev/SyntheticDevPanel.tsx`：删除。
- `src/ui/pages/SyntheticDemoPage.tsx`：删除。
- `src/ui/render/SyntheticRenderView.tsx`：删除。
- `src/render/synthetic/**`：删除。
- `e2e/support/demo-observations.ts`：删除。
- `eslint.config.js`：删除规则。
- `tools/engineering-boundaries.test.ts`：删除对应回归。

## 验收标准

- [ ] AC-18（源码）：所列模块、菜单入口与 lint 规则已删除；`git grep` 在 `src`、`tools`、`e2e`、配置文件中没有对它们的模块路径或导入的引用（字符串形式的格式名除外，且已说明）。
- [ ] 其余工程边界规则与回归保持；`pnpm check` 通过。
- [ ] `pnpm test:e2e` 在 development 与 production 项目全部通过，`--project=development-headed` 通过。
- [ ] 完成证据记录删除前的提交与删除清单。

## 验证方法

- `git grep` 检查、`pnpm check`、`pnpm test:e2e`（三个项目）。
- 不适用原版对照。

## 完成证据
