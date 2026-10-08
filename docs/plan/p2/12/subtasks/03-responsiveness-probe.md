---
type: plan
status: active
phase: P2
task: "12"
subtask: "03"
updated: 2026-10-07
---

# 03 — 主页面响应探针与可控输入

**契约来源：** [spec](../spec.md) 的 S-05、AC-05 与[资源平衡与主页面响应](../spec.md#资源平衡与主页面响应)中的“主页面响应”；本项交付探针、控制样本与可控繁忙 Worker 的输入证明，实际窗口的测量由 06、07 完成，I-7 由 09 使用。
**依赖：** 01, 02。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **探针（计划新增 `e2e/support/responsiveness.ts`）：**
  - 在窗口开始前安装 `PerformanceObserver`（`longtask`）与帧间隔记录；窗口由用例显式开始、结束，结束后等待记录送达再收齐与窗口相交的全部记录，把包移交与校验的同步尾部计入，不在终态刚发布时停止。
  - 长任务以 Long Tasks API 的 50 ms 定义识别；API 不可用或记录尚未送达时报告错误，不报告 0。
  - 输出：操作类型、窗口起止与总耗时、长任务数与最长时长、最大帧间隔（ms），以及浏览器版本、可见性与探针开销说明。
- **控制样本（计划新增 `e2e/responsiveness-controls.spec.ts`，两个项目）：** 窗口内人为阻塞主线程超过 50 ms 时，探针至少报告 1 个长任务；空闲窗口报告 0；模拟 API 不可用时探针报错。
- **可控繁忙 Worker（计划新增 `e2e/responsiveness-busy-worker.development.spec.ts`）：** 经测试入口的 `busy` 场景（[import-worker.test-support.ts](../../../../../src/workers/import-worker.test-support.ts)，测试侧限时、可终止）：
  - 可信点击测试插入的探针控件，处理后至少交付一帧；
  - 再可信点击“Cancel import”，所有者同步进入 `cancelled`，Worker 被终止，之后没有迟到事件更新状态；
  - 记录事件顺序；用例启用 02 的审计并以零意外违规结束。
- 快速完成的正常作业不在此插入第二次点击；实际窗口的门槛由 06、07 断言。

## 不包含

- 开发与生产联合闭环中的实际窗口测量（06、07）；F-11/F-12 中的 I-7（09）。
- 目标设备性能（P5）；改变零长任务门槛（须重新批准 spec）。

## 关键文件与契约

- [import-worker.spec.ts](../../../../../e2e/import-worker.spec.ts) 的 “page stays responsive while the Worker computes” 用例：harness 级的帧与点击顺序参照。
- [app-entry.ts](../../../../../e2e/support/app-entry.ts) 的 `openTestEntry`；02 的 `audited-test.ts`。
- 计划新增的三个文件见上。

## 写入范围

- `e2e/support/responsiveness.ts`：探针。
- `e2e/responsiveness-controls.spec.ts`：控制样本。
- `e2e/responsiveness-busy-worker.development.spec.ts`：可控繁忙 Worker 的输入与取消证明。

## 验收标准

- [ ] 控制样本：人为长任务被检出（≥1），空闲窗口为 0，API 不可用时报错而不是 0；两个项目都通过。
- [ ] AC-05（可控部分）：繁忙 Worker 运行时，可信点击被处理且之后至少一帧；可信点击取消使所有者同步进入终态、Worker 终止、无迟到更新；事件顺序已记录。
- [ ] 该用例的网络审计零意外违规。
- [ ] `pnpm typecheck`、`pnpm lint` 与 `pnpm exec playwright test e2e/responsiveness --project=development`、`--project=production` 通过。

## 验证方法

- 按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md) 使用合成数据与隔离 context。
- 不涉及原版对照。

## 完成证据
