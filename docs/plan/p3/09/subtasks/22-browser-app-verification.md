---
type: plan
status: active
phase: P3
task: "09"
subtask: "22"
updated: 2026-10-14
---

# 22 — 实际应用的浏览器验证

**契约来源：** [spec](../spec.md) 的 S-12、AC-12；[验证策略](../spec.md#验证策略)的浏览器验证。
**依赖：** 20, 21。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md)，扩展 [mission-flow.development.spec.ts](../../../../../e2e/mission-flow.development.spec.ts) 等实际应用用例，用合成任务包进入正式 Session：
  - 游戏输入区按 `m` 后 Core 与桥接都报告 `map`；`p` 暂停与继续；未锁指针时 Esc 关闭地图；飞行键按上下文过滤；
  - 用开发 `MissionDevPanel` 命令编辑器提交 `map-point select`，等待 accepted 与目的地/标记事实，重新聚焦输入区，按 `w` 开始并等待完成；核对真实的能量、位置、阶段与事件，不改写世界或伪造 projection；
  - Warp 中打开任务菜单与页面隐藏后继续，无补跑、无重复扣费；退出与重开无遗留资源；
  - 生产几何仍为 null 时 not-ready 提示、可退出、无锁、无鼠标命令；生产包不含开发编辑器。
- 不以 P3-05 隔离入口的 `setContext` 证明 Core 地图；不以 Canvas 存在或 HTTP 成功证明规则。取不到的必要项记为 blocked。

## 不包含

- 地图鼠标的生产几何与像素（P3-13）、Warp 外观（P3-12）、全闭环（P3-15）。
- 跨系统实机矩阵（P5）。

## 关键文件与契约

- [mission-flow.development.spec.ts](../../../../../e2e/mission-flow.development.spec.ts)、[e2e/support/](../../../../../e2e/support/)、[browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md)。

## 写入范围

- `e2e/mission-flow.development.spec.ts`、`e2e/mission-flow.production.spec.ts`
- `e2e/support/**`：观察与合成包辅助。
- `src/original-data/conversion/production-rule-data.test-support.ts`（只改 `productionCraftInfo()` 的玩家记录，使合成包可完成 Warp）与 `src/ui/dev/mission-diagnostics.test.ts`（随之改变的期望）（协调者 2026-10-14 扩大范围）。

## 验收标准

- [ ] AC-12 的每项都在实际应用中通过，断言 DOM 中的命令结果、状态快照/事件与资源平衡。
- [ ] 生产几何为 null 时的退化行为与生产包不含开发编辑器都有断言。
- [ ] `pnpm test:e2e -- e2e/mission-flow.development.spec.ts e2e/mission-flow.production.spec.ts` 通过（含网络审计）。

## 验证方法

- browser-testing 的合成流程；记录 Chromium 版本与无法观察的项。

## 完成证据
