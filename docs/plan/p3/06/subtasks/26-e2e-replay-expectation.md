---
type: plan
status: active
phase: P3
task: "06"
subtask: "26"
updated: 2026-10-11
---

# 26 — 合并 P3-07 后的浏览器重放用例期望

**契约来源：** [spec](../spec.md) 的 AC-08、AC-12；20 的最终对齐发现。
**依赖：** 18。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 背景

协调者在最终对齐（20）中新增本项（2026-10-11，依用户对新增子任务的预先授权，不需审阅）。合并 P3-07 后，完整 `pnpm test:e2e` 为 195 通过、1 失败：`e2e/browser-replay.spec.ts` 断言重放事件的类型集合恰为 `command-result`、`object-instantiated`、`speed-assist-toggled`，而 P3-07 的自动选择目标使事件中多出 `target-changed`。这是该用例对已合并规则的期望过时，不是 Core 或重放缺陷（Node 与浏览器的重放仍逐项相等：同一断言之前的 `compareReplayResults` 通过）。

## 工作范围

- 更新该用例的事件类型期望，使其包含 `target-changed`，并核对 `target-changed` 的出现确为 P3-07 自动选择目标所致（读 P3-07 的事件定义与该用例的脚本），不放宽比较或删去断言。
- 单独运行该用例，再运行 `pnpm check`；完整 e2e 在 20 中重跑。

## 不包含

- Core、重放与 P3-07 规则的任何改动；其他 e2e 用例。

## 写入范围

- `e2e/browser-replay.spec.ts`

## 验收标准

- [ ] `pnpm test:e2e e2e/browser-replay.spec.ts --project=development` 通过，且断言仍精确（事件类型集合相等，不是子集）。
- [ ] `pnpm check` 通过；改动只在写入范围内。

## 验证方法

- 上述命令；审阅 diff。

## 完成证据
