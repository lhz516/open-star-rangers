---
type: plan
status: active
phase: "P3"
task: "15"
subtask: "04"
updated: "2026-10-29"
---

# 04 — 类型 9 警告端到端复验

**契约来源：** [spec](../spec.md) 的 S-06、[行为与边界](../spec.md#行为与边界)“类型 9 警告产生与呈现”；AC-06。交接来源：[P3-13 spec](../../13/spec.md) 的 AC-14/AC-21、[P3-14 spec](../../14/spec.md) 的 AC-08/AC-14 与 DW-10。
**依赖：** 01。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 新建 `e2e/support/joint-warning.ts`：以 01 的变体构造方式生成合成包，使真实 Core 规则产生尾随攻击者（`attackerOnTail`）与来弹（`missileIncoming`）警告：敌机按其 AI 与武器锁定规则自然咬尾或发射导弹，不由测试写入警告标志、武器锁定等级或 Core 状态。
- 新建 `e2e/joint-warning.development.spec.ts`：在 P3-14 AC-08 所定的有效视角/子系统条件下：
  - 读开发事件日志/状态中同 tick 的 `communications.warnings` 值，确认由规则从 false 变为 true 并在条件解除后复位；
  - 以 [cockpit.ts](../../../../../e2e/support/cockpit.ts) 的 `instrument(fixture, 9)` 区域读回驾驶舱类型 9 指示条的实际像素，确认与警告值相符；
  - 以 [flight-audio.ts](../../../../../e2e/support/flight-audio.ts) 的 `captureOutput`/`soundView` 读音效消费者的声音决定（`sound/hud/instrument-9-loop` 的 `instrument-9-craft`/`instrument-9-missile` 请求或开发声音日志），确认与警告相符；
  - 确认声音启停或音频不可用不改变驾驶舱状态，二者互不推进。
- 本项只证明信号与状态链路；人耳试听属于 P3-14 的 V-06（其子任务 26），不在此替代。

## 不包含

- P3-14 V-06 的感知判定；类型 9 警告在原版所选任务中的可达性结论（由 P3-14/24 处理，08 汇总）。
- 修改 `src/`。若真实条件在合成场景中不可达或链路缺失，本项不通过，记录证据并交回 P3-13/P3-14。

## 关键文件与契约

- 现有：[communications.ts](../../../../../src/core/projections/communications.ts)、[indicator-strip.ts](../../../../../src/render/cockpit/overlay/indicator-strip.ts)、[hud-cues.ts](../../../../../src/app/flight-audio/hud-cues.ts)、[cockpit.ts](../../../../../e2e/support/cockpit.ts)、[flight-audio.ts](../../../../../e2e/support/flight-audio.ts)、[map-warp.ts](../../../../../e2e/support/map-warp.ts) 的 `readLog`。
- 01 交付：`e2e/support/joint-loop.ts`（只读复用）。
- 计划新增：`e2e/support/joint-warning.ts`、`e2e/joint-warning.development.spec.ts`。

## 写入范围

- `e2e/support/joint-warning.ts`：警告场景变体与观察。
- `e2e/joint-warning.development.spec.ts`：警告端到端用例。

## 验收标准

- [ ] AC-06：两种警告都由真实攻击者/来弹规则产生；同 tick 的 `communications.warnings`、类型 9 指示条像素与音效消费者决定一致，并覆盖解除；测试未直接设置警告或锁定字段。
- [ ] 音频启停或不可用不改变驾驶舱表现；明确记录本项不代替 P3-14 V-06 的人耳判定。
- [ ] 网络审计无违规；`pnpm typecheck`、`pnpm lint` 通过，已按 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 清理。

## 验证方法

- 按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md) 执行：`pnpm test:e2e e2e/joint-warning.development.spec.ts --project=development`，连续两次通过；附触发警告的 tick、视角与三方读数。

## 完成证据
