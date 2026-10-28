---
type: plan
status: active
phase: P3
task: "13"
subtask: "27"
updated: 2026-10-28
---

# 27 — 合成浏览器驾驶舱验证

**契约来源：** [spec](../spec.md#验证策略) 的 AC-05/06/08/09/10/11/12/13/14/15/19/20。
**依赖：** 25。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 在本机Chrome/既有Playwright runner使用合成包，验证F1/Warp/被毁正确区域及页0–6、菜单、来电/基地摘要、消息滚动、SNIP、目标和雷达。
- 读取实际像素，而非只验证Canvas/命令调用；闪光作用完整游戏图像，黑边和React控件不受影响。
- 开发/生产入口都走实际装配，隔离状态夹具须明确为合成且不进入生产；被毁视角不得要求驾驶舱框架非黑。

## 不包含

不使用原版文件作为E2E夹具，不以合成事件证明系统快捷键拦截，不修改功能代码。

## 关键文件与契约

- [flight-pictures.ts](../../../../../e2e/support/flight-pictures.ts)、[flight-render.production.spec.ts](../../../../../e2e/flight-render.production.spec.ts)。
- 计划新增 `e2e/cockpit.development.spec.ts`、`cockpit.production.spec.ts`、`support/cockpit.ts`。

## 写入范围

- `e2e/cockpit.development.spec.ts`：计划新增开发回归。
- `e2e/cockpit.production.spec.ts`：计划新增生产回归。
- `e2e/support/cockpit.ts`：计划新增独立测试辅助。
- `e2e/support/flight-pictures.ts`：必要像素读取扩展。
- `e2e/flight-render.development.spec.ts`：旧“HUD待实现”断言更新。
- `e2e/flight-render.production.spec.ts`：相同生产断言同步。
- `e2e/flight-scenes.development.spec.ts`：保留世界和共享深度回归。
- `e2e/support/flight-flow.ts`、`e2e/support/mission-observations.ts`：F1 背景与单画布断言随驾驶舱更新（协调者增补，24/25 交接）。
- `e2e/base-interaction.development.spec.ts`：在制提示移到状态栏后的断言（协调者增补，25 交接）。

## 验收标准

- [ ] 每种状态有实际逻辑像素或DOM断言，错误夹具可使断言失败。
- [ ] DIAG/来电/滚动的时间边界与真实管线一致，不仅检查初始静态图。
- [ ] G-03/G-05可见、无原版字节、网络审计不变。

## 验证方法

必须使用 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md)；文件落地后 `pnpm test:e2e -- e2e/cockpit.development.spec.ts e2e/cockpit.production.spec.ts e2e/flight-render.development.spec.ts e2e/flight-render.production.spec.ts`。测试维护按 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 限本组。

## 完成证据
