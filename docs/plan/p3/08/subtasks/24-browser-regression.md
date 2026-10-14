---
type: plan
status: active
phase: P3
task: "08"
subtask: "24"
updated: 2026-10-14
---

# 24 — 浏览器回归

**契约来源：** [spec](../spec.md) 的 AC-10（`b` 的浏览器部分）、AC-14（导入与缓存的浏览器部分）、AC-17（浏览器生命周期）；[验证策略](../spec.md#验证策略)的浏览器验证。
**依赖：** 13, 22, 23。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md) 用合成内容验证：
  - 导入新 schema 的合成包、缓存恢复、旧 schema/旧转换器版本缓存不恢复与重新导入提示、坏包的错误反馈；网络审计保持有效；
  - 真实会话中 AI 推进（断言 Core 状态或事件变化，不只看 Canvas）、暂停/隐藏/恢复、AI 故障的显示、退出与重新进入后的清理；
  - 若纳入 `b`：在飞行中触发，断言实体与事件变化及失败反馈。
- 先选相关现有用例（[cache-recovery](../../../../../e2e/cache-recovery.spec.ts)、[mission-flow.development](../../../../../e2e/mission-flow.development.spec.ts)、[keyboard-input.development](../../../../../e2e/keyboard-input.development.spec.ts)、[joint-pipeline.development](../../../../../e2e/joint-pipeline.development.spec.ts)），再按需扩展；运行 `pnpm test:e2e`（不属于 `pnpm check`）。
- 合成按键不证明系统快捷键拦截；实机责任仍归 P3-05/P3-15。

## 不包含

- AI 画面与 HUD（P3-12、P3-13）；完整闭环（P3-15）。

## 关键文件与契约

- 已有：[e2e/](../../../../../e2e/) 的 runner 与支持、[mission.test-support.ts](../../../../../src/app/mission/mission.test-support.ts)。

## 写入范围

- `e2e/**`：回归用例与支持。
- `src/app/mission/mission.test-support.ts`：合成任务包的 AI 内容。

## 验收标准

- [ ] AC-14 的浏览器部分：导入、恢复、拒绝与反馈正确，网络审计通过。
- [ ] AC-17 的浏览器部分：暂停/恢复/退出/重新进入后 tick、状态与清理正确。
- [ ] AC-10 的浏览器部分（纳入 `b` 时）。
- [ ] `pnpm test:e2e` 的相关项目通过，`pnpm check` 通过。

## 验证方法

- browser-testing 的合成流程；断言实际状态、事件与资源平衡。
- 按 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 清理本项范围。

## 完成证据
