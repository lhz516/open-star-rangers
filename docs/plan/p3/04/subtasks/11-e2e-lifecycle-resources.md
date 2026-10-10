---
type: plan
status: active
phase: P3
task: "04"
subtask: "11"
updated: 2026-10-09
---

# 11 — E2E：原生生命周期、资源平衡与 Fast Refresh

**契约来源：** [spec](../spec.md) 的[合成演示退役](../spec.md#合成演示退役)的测试迁移；AC-09（浏览器）、AC-13、AC-14，AC-18 的迁移部分。
**依赖：** 10。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- [native-lifecycle.spec.ts](../../../../../e2e/native-lifecycle.spec.ts)：改为经测试入口导入合成任务包并进入飞行；沿用已验证的 CDP 标签页切换路线：原生 hidden 使运行自动暂停，返回可见后仍暂停、tick 不变；显式继续后 tick 前进且没有补跑后台时长；出发保持期间隐藏后返回可见，结束出发仍为暂停。
- [fast-refresh.spec.ts](../../../../../e2e/fast-refresh.spec.ts)：用任务 hook 与任务画面模块的 Fast Refresh 取代演示部分：旧所有者失效，holder 与已确认的僚机选择保留；外壳刷新回菜单；三次菜单 → 任务 → 菜单往返。
- [joint-resources.spec.ts](../../../../../e2e/joint-resources.spec.ts)、[resource-balance-controls.spec.ts](../../../../../e2e/resource-balance-controls.spec.ts)、[resource-balance.ts](../../../../../e2e/support/resource-balance.ts)：以任务流程取代演示；监听、观察器、rAF、Worker、`beforeunload` 与单次计时器回到基线；飞行中至多一个游戏 rAF，暂停、保持与任务菜单时为零。
- [browser-probes.ts](../../../../../e2e/support/browser-probes.ts)：去掉 `synthetic-view` 的分组判断，按任务画面重新归类；增量加入单次计时器（`setTimeout`/`clearTimeout`）的非干扰探针；[resource-balance-controls.spec.ts](../../../../../e2e/resource-balance-controls.spec.ts) 增加故意泄漏的计时器与 `beforeunload` 控制样本和干净样本。
- [probe-contract.spec.ts](../../../../../e2e/probe-contract.spec.ts)：读取像素与投影的用例改为任务画面的只读属性与诊断；探针契约保持。
- [native-lifecycle.ts](../../../../../e2e/support/native-lifecycle.ts)、[fast-refresh.ts](../../../../../e2e/support/fast-refresh.ts)：按需调整。

## 不包含

- 外壳、合规、生产预览、WebGL 不可用、交互渲染、browser-replay 与 joint-pipeline 的迁移（12）；`demo-observations.ts` 的删除（13）。

## 关键文件与契约

- 修改：上列 E2E 文件与支持模块。
- 消费：10 的 `e2e/support/mission-observations.ts`。
- 工具约束见[工程约定](../../../../engineering/README.md#本地浏览器-runner)（单 worker、development-headed 的原生隐藏、Fast Refresh 编辑真实源码）。

## 写入范围

- `e2e/native-lifecycle.spec.ts`：迁移。
- `e2e/support/native-lifecycle.ts`：按需调整。
- `e2e/fast-refresh.spec.ts`：迁移。
- `e2e/support/fast-refresh.ts`：按需调整。
- `e2e/joint-resources.spec.ts`：迁移。
- `e2e/resource-balance-controls.spec.ts`：迁移与新控制样本。
- `e2e/support/resource-balance.ts`：迁移与计时器统计。
- `e2e/support/browser-probes.ts`：分组与计时器探针。
- `e2e/probe-contract.spec.ts`：迁移。

## 验收标准

- [ ] AC-13：原生隐藏自动暂停、返回可见仍暂停、显式继续后不补跑；出发保持中的隐藏保护成立。
- [ ] AC-14：三次往返与 Fast Refresh 后资源回到基线，计时器与 `beforeunload` 计入；飞行中至多一个游戏 rAF，非 running 为零；控制样本能检出故意泄漏的计时器与 `beforeunload`。
- [ ] AC-09（浏览器）：Fast Refresh 与外壳刷新时旧所有者释放、holder 保留或按外壳刷新回菜单。
- [ ] 迁移后的用例不再引用 `demo-observations.ts`、`synthetic-view` 或合成模块；`pnpm test:e2e e2e/native-lifecycle.spec.ts --project=development-headed` 与本项其余文件在 development/production 项目中通过。

## 验证方法

- 按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md)；完成证据列出每个旧用例的去向（迁移、合并或删除）及原因。
- 不适用原版对照。

## 完成证据
