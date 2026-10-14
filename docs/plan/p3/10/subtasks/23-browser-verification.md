---
type: plan
status: active
phase: P3
task: "10"
subtask: "23"
updated: 2026-10-14
---

# 23 — 浏览器回归

**契约来源：** [spec](../spec.md) 的 AC-14；[验证策略](../spec.md#验证策略)的“浏览器验证”。
**依赖：** 20, 22。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md) 在本机 Chrome 用合成任务包与独立 E2E runner 验证：输入区 `c`/数字 → 停靠 → G-02/3（自然结束与跳过各一次）→ G-05 → 服务实际变化 → `L` → G-02/4（自然结束与跳过各一次）→ 飞行。
- 断言：上下/Enter 每次只提交一次，服务选择/状态/读数与 projection 一致；保持、暂停与隐藏期间无 tick，恢复无旧按键；Tab 离区不执行命令；焦点与 4:3 布局；故障可见；标注可见；网络审计与资源平衡通过。
- 只用测试侧可读诊断，不新增生产状态修改 API；正式 MFD 未接入时只验菜单协议，不宣称生产通讯画面通过；合成键不作为系统快捷键拦截证据。

## 不包含

- 驾驶舱画面（P3-13）；P3-05 的实机绑定（不重复宣称已重验）。

## 关键文件与契约

- 现有 [e2e/](../../../../../e2e/) runner 与合成包支持（`e2e/support/`）；[browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md)。
- 计划新增：`e2e/base-interaction.spec.ts`。

## 写入范围

- `e2e/**`：新增用例与支持代码。
- `local/research/p3-10/browser/**`：截图与日志（被忽略）。

## 验收标准

- [ ] AC-14 的完整浏览器流程与各项断言通过，含 DOM、键盘、Core 读模型与生命周期的联合断言。
- [ ] 网络审计与资源平衡通过；页面不含原版内容。
- [ ] `pnpm test:e2e`（或其针对本用例的运行）通过。

## 验证方法

- `pnpm test:e2e`；失败时保留 trace 于 `local/research/p3-10/browser/`。

## 完成证据
