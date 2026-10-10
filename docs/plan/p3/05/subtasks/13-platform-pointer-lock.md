---
type: plan
status: active
phase: P3
task: "05"
subtask: "13"
updated: 2026-10-10
---

# 13 — 平台 Pointer Lock 端口

**契约来源：** [spec](../spec.md) 的[战略地图输入](../spec.md#战略地图输入)（申请、退出、状态、相对移动、无锁回退）、[生命周期与资源](../spec.md#生命周期与资源)（异步申请、目标核对、清理）、[数据模型与契约](../spec.md#数据模型与契约)的“Pointer Lock 端口”与“能力申请状态与错误”行；S-11、S-14 的平台部分；AC-12、AC-16 的平台部分。
**依赖：** 无。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 计划新增 DOM-free 的 `src/platform/input/pointer-lock.ts`：经宿主接口申请锁定（元素）、退出、报告支持与否；以 `pointerlockchange`/`pointerlockerror` 与实际目标（锁定元素恰为申请的元素）确认结果——有 Promise 的实现也核对目标，没有 Promise 的实现只以事件与目标确认；锁定期间的相对移动（`movementX/Y`，按平台报告单位原样给出并标注单位来源）与按键（按下/松开、按钮号）；未锁定时元素内的绝对坐标（客户区坐标与元素矩形），供无锁回退使用。
- 失败以稳定原因类别报告（不支持、被拒绝/错误、目标不符），不回显未清洗的宿主异常；不请求 raw/unadjusted 输入。
- 注册原子、可撤销；撤销后旧回调不再投递；只退出本端口锁定的目标，不解除他人的锁定。
- 计划新增浏览器连接 `src/platform/input/browser-pointer-lock.ts`（遵循 `browser-*` 命名的边界规则）。
- Node 测试：受控宿主下的成功、失败、迟到事件、目标不符、无 Promise 路径、撤销后静默、监听平衡。

## 不包含

- 申请代次、owner/run 关联与关闭屏障（21）；地图位置换算、光标与命令（17、22）；游戏语义。

## 关键文件与契约

- 参照 [keyboard-source.ts](../../../../../src/platform/input/keyboard-source.ts) 的“DOM-free 核心 + 薄浏览器连接”拆分与 [rollback-error.ts](../../../../../src/app/session/rollback-error.ts) 的回滚错误。
- 计划新增：`pointer-lock.ts`、`pointer-lock.test.ts`、`browser-pointer-lock.ts`。

## 写入范围

- `src/platform/input/pointer-lock.ts`、`src/platform/input/pointer-lock.test.ts`
- `src/platform/input/browser-pointer-lock.ts`

## 验收标准

- [ ] 申请、确认、退出、失败与支持判定按契约工作，以实际目标确认；迟到与撤销后的事件不投递。
- [ ] 相对移动与绝对坐标都可取得，单位来源明确；不识别游戏动作。
- [ ] Node 测试覆盖成功/失败/迟到/目标不符/无 Promise/撤销；`pnpm exec vitest run src/platform/input` 通过；按 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 检查本项改动；`pnpm typecheck` 与 `pnpm lint` 通过。

## 验证方法

- Node 受控宿主测试；真实 Chrome 的锁定由 27 验证。

## 完成证据
