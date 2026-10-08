---
type: plan
status: active
phase: P2
task: "12"
subtask: "08"
updated: 2026-10-07
---

# 08 — 失败矩阵：输入、版本、内容与任务（F-01 至 F-10）

**契约来源：** [spec](../spec.md) 的 S-04、[失败矩阵](../spec.md#失败矩阵) F-01 至 F-10 与[失败不变量](../spec.md#失败不变量) I-1 至 I-6；AC-06、AC-07 的浏览器部分、AC-10。
**依赖：** 01, 02, 04, 05。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

计划新增 `e2e/failure-input-content.development.spec.ts`，经真实页面的文件选择控件触发 F-01 至 F-10：

- **I-1：** 页面的类别文字、layer、code、位置与限值等于 05 写定的预期表；任务失败显示为 `MissionLoadState` 的 Core/content 诊断，部分包显示完整性诊断，都不伪装成 import 层错误。
- **I-2：** 按失败所在层核对状态：作业异常不接受本次组、保留已有包（部分行先持有一个包再触发）；正常结束的部分包替换为其已完整的组但不保存；完整新包的任务失败照常保存，但不显示“任务可载入 Core”。每行证据写明前置状态与预期终态。
- **I-3、I-4：** 用 04 的辅助核对 Worker 与登记。
- **I-5：** disc、source、content 三类各至少一行：可查看按 I-2 应持有的包（原包须保留的行核对身份与像素不变），并能开始新作业。
- **I-6：** 页面诊断、控制台与快照不含私人文件名、原始异常或内容标记；文件输入控件自身显示的名称不算泄露；P2-11 允许显示的 Asset ID、包身份与结构摘要可以出现。
- **F-04：** 恰等于与超出 1 成对；**F-08：** 两种坏引用分别命中来源引用错误与全包 `incomplete` 诊断；**F-10：** 两种情况分别核对。
- 全部用例启用 02 的审计并以零意外违规结束。

## 不包含

- Worker 故障、取消与迟到结果（09）；存储与生命周期（10）；Node 预期（05）。

## 关键文件与契约

- 参照 [import-page.spec.ts](../../../../../e2e/import-page.spec.ts) 的失败场景用例与 [viewer-page.spec.ts](../../../../../e2e/viewer-page.spec.ts) 的任务不可载入用例；05 的预期表与 fixture；[resource-status.ts](../../../../../src/app/resources/resource-status.ts) 的状态成立条件。

## 写入范围

- `e2e/failure-input-content.development.spec.ts`：F-01 至 F-10 的浏览器用例。

## 验收标准

- [ ] AC-06：F-01 至 F-06 的每行满足适用的 I-1 至 I-4 与 I-6；F-04 覆盖 disc 限值与转换预算的边界与超限。
- [ ] AC-07：F-07 至 F-10 的每行满足适用的不变量；坏 payload/引用在通过来源识别后命中目标校验；部分包只供诊断、不保存；完整新包的任务失败如实显示。
- [ ] I-5 在 disc、source、content 三类各有一行断言。
- [ ] AC-10（本用例）：审计零意外违规。
- [ ] `pnpm typecheck`、`pnpm lint` 与 `pnpm exec playwright test e2e/failure-input-content --project=development` 通过。

## 验证方法

- 按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md)：合成数据、隔离 context；浏览器断言与 05 的 Node 断言使用同一预期表。
- 不涉及原版对照。

## 完成证据
