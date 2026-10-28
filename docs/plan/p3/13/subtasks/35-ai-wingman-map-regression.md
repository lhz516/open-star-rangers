---
type: plan
status: active
phase: P3
task: "13"
subtask: "35"
updated: 2026-10-28
---

# 35 — 地图中开发面板提交的 E2E 回归修复

**契约来源：** [spec](../spec.md#地图输入几何与指针) 的 S-11，AC-17/18；[27 的完成证据](./27-browser-cockpit.md#完成证据)报告的回归。
**依赖：** 27, 28。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 定位 `e2e/ai-wingman.development.spec.ts` 的第 146 行起的测试在地图中提交开发面板命令时超时的原因（27 推测为地图输入就绪后取得 Pointer Lock）；在本项改动前后的 main 上复现。
- 若是测试仍按“地图输入未就绪”的旧契约操作，按 23/28 已交付的地图输入契约（首次点击锁定不选点、解锁回退、Esc）更新该测试，不削弱其对 `b`、错误上下文拒绝与暂停的断言。
- 若是产品缺陷（例如开发面板在地图打开时无法使用），不在本项暗改：报告精确复现与所需路径，由协调者扩大范围或另立修复项。

## 不包含

不改变地图输入契约、Pointer Lock 行为或 AI 规则；不处理其他已知的隐藏页/CDP 环境失败。

## 关键文件与契约

- [ai-wingman.development.spec.ts](../../../../../e2e/ai-wingman.development.spec.ts)、[keyboard-input.md](../../../../engineering/keyboard-input.md) 的地图输入说明、28 的地图回归。

## 写入范围

- `e2e/ai-wingman.development.spec.ts`：地图中的开发面板提交步骤。

## 验收标准

- [ ] 该测试在开发入口稳定通过（重复运行），失败原因有记录。
- [ ] 断言强度不低于原测试，地图输入契约未被绕过或改写。
- [ ] 若为产品缺陷，已报告复现且未在本项暗改。

## 验证方法

`pnpm build && pnpm exec playwright test e2e/ai-wingman.development.spec.ts`（不用 `pnpm test:e2e -- <files>`，那会运行全部用例）、`pnpm check`。

## 完成证据
