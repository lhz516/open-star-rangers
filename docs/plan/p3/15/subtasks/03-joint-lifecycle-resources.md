---
type: plan
status: active
phase: "P3"
task: "15"
subtask: "03"
updated: "2026-10-29"
---

# 03 — 联合生命周期与资源平衡

**契约来源：** [spec](../spec.md) 的 S-03、[行为与边界](../spec.md#行为与边界)“暂停、地图、隐藏/返回、重试、返回菜单与卸载”；AC-03、AC-04。
**依赖：** 01。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 新建 `e2e/joint-lifecycle.development.spec.ts` 与必要的 `e2e/support/joint-lifecycle.ts`，用 01 的变体包：
  - 暂停与继续：tick 停止，继续不追赶；地图打开时 tick 继续推进（地图不是暂停）。
  - 真实隐藏：以 [native-lifecycle.ts](../../../../../e2e/support/native-lifecycle.ts) 的 `nativeBrowser` 在真实标签页切换下隐藏飞行与地图中的运行，断言 `phase`、tick 不推进、按住的输入被清除；返回可见后须显式继续，且不追赶隐藏时间。不得以模拟 `visibilityState` 替代。
  - 成功与失败结果页的重试、返回主菜单与任务画面卸载：每个检查点以 [resource-balance.ts](../../../../../e2e/support/resource-balance.ts) 读取所有者级帧、计时器、监听器、离页保护、音频上下文/声源与渲染资源，断言回到对应基线；任一时刻至多一条游戏循环；旧运行的声源或回调不再活动；重试不复用旧运行。
- 失败读数保留基线/末值与失败项，不放宽阈值。

## 不包含

- 闭环步骤本身的断言（01、02）；生产构建（02 已覆盖用户流程，本项只在 development 取得可读资源探针）。
- 修改资源平衡设施或产品代码；发现泄漏作为差异交回责任任务。

## 关键文件与契约

- 现有：[joint-resources.spec.ts](../../../../../e2e/joint-resources.spec.ts)、[native-lifecycle.spec.ts](../../../../../e2e/native-lifecycle.spec.ts)、[mission-result.development.spec.ts](../../../../../e2e/mission-result.development.spec.ts) 中的真实隐藏用例、[resource-balance.ts](../../../../../e2e/support/resource-balance.ts)、[native-lifecycle.ts](../../../../../e2e/support/native-lifecycle.ts)。
- 01 交付：`e2e/support/joint-loop.ts`。
- 计划新增：`e2e/joint-lifecycle.development.spec.ts`、`e2e/support/joint-lifecycle.ts`。

## 写入范围

- `e2e/joint-lifecycle.development.spec.ts`：联合生命周期与资源平衡用例。
- `e2e/support/joint-lifecycle.ts`：本项专用的观察辅助。

## 验收标准

- [ ] AC-03：暂停/真实隐藏期间 tick 不推进、恢复须显式继续且不追赶；地图中 tick 继续；隐藏与恢复后输入已清除；重试不复用旧运行。真实隐藏由真实标签页切换产生。
- [ ] AC-04：成功与失败两条结果路径的重试、返回菜单与卸载后，各资源组回到基线，任一运行至多一条循环，无旧运行音源或回调活动；证据附每个检查点的基线/末值。
- [ ] 网络审计无违规；`pnpm typecheck`、`pnpm lint` 通过，已按 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 清理。

## 验证方法

- 按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md) 执行：`pnpm test:e2e e2e/joint-lifecycle.development.spec.ts --project=development`，连续两次通过。需要本机未锁屏的桌面会话；锁屏时有头窗口一开始即隐藏，此时 blocked，恢复条件为解锁后重跑，不以无头结果替代。

## 完成证据
