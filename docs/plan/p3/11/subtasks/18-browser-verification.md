---
type: plan
status: active
phase: P3
task: "11"
subtask: "18"
updated: 2026-10-17
---

# 18 — 浏览器验证

**契约来源：** [spec](../spec.md) 的 AC-12；[验证策略](../spec.md#验证策略)的浏览器验证。
**依赖：** 17。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md) 在本机 Chrome 用现有独立 E2E runner 与合成包验证（计划新增 `e2e/mission-result.development.spec.ts`）：
  - 失败路径：两次被毁 → G-02/5 → 同关继续 → 第三次 → G-02/7 → 结果页（失败）→ 重试 → G-02/1 → 开始配置预选上次僚机 → 新 run 的 L-02 飞行。
  - 成功路径：全清 → 完成消息事件 → G-02/8（有/无 G-02/9）→ 结果页（成功，含总结）→ 重试至新 run 的飞行；另验证返回菜单。
  - 至少一次能量耗尽救援（G-02/6）。
  - 占位自然结束与跳过各至少一次；隐藏时的计时、焦点与 Tab、旧按键清除；新 run 状态重置；标注、错误、4:3 DOM；网络审计与资源平衡。
- 合成初始数据由测试构造（敌机与基地靠近玩家、可控能量），运行中只提交正式输入；只用测试侧诊断，不新增生产中修改状态的 API。缺测试能力时记入完成证据，交协调者新增修复子任务。

## 不包含

- 被毁视角与消息行的像素（P3-12、P3-13）；OS 快捷键实机验证（P3-15/P5）。

## 关键文件与契约

- [e2e/support/](../../../../../e2e/support/) 的 `base-interaction.ts`、`mission-observations.ts`、`network-audit.ts`、`resource-balance.ts`；先例 [base-interaction.development.spec.ts](../../../../../e2e/base-interaction.development.spec.ts)。

## 写入范围

- `e2e/mission-result.development.spec.ts`：计划新增的浏览器回归。
- `e2e/support/**`：合成任务包与观察辅助。

## 验收标准

- [ ] 成功与失败两条路径都重试至新 run 的飞行；返回菜单可用；救援同关继续。（AC-12）
- [ ] 覆盖 G-02/5、/6、/7、/8 及有/无 /9，自然结束与跳过、隐藏、焦点与旧按键清除。（AC-12）
- [ ] 网络审计与资源平衡通过；`pnpm test:e2e` 中本 spec 与既有任务流程 spec 通过。

## 验证方法

- `pnpm test:e2e`（按需限定本 spec 与受影响的既有 spec）；DOM、键盘、读模型与生命周期联合断言，不以 Canvas 存在代替。

## 完成证据
