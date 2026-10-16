---
type: plan
status: active
phase: P3
task: "14"
subtask: "12"
updated: 2026-10-15
---

# 12 — 发声分配与句柄账本

**契约来源：** [spec](../spec.md#发声类别) 的 S-04、AC-04、AC-05。
**依赖：** 10。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 实现 05/06 定稿的类别容量、回收、抢占和拒绝策略，不用猜测的原版配额。
- 句柄绑定 ownerId/runId、来源命名空间/ID、槽或提示类别；只在 started 后占用新配额。
- 区分自然结束、被抢占、主动 stop、隐藏失效和宿主失败；旧回调、查询和重复回收不污染新句柄。
- 输出封闭的决定/原因供 16 和开发诊断使用，不保存 PCM、原版文字或无限日志。

## 不包含

- 不解析 Core 事件或决定模式门禁，不建立另一音频平台；参数计算归 13。

## 关键文件与契约

- 10 的 AudioController/PlayResult；现有 [资源上限](../../../../../src/platform/audio/audio-controller.ts)只作工程预算。
- 计划新增 `src/app/flight-audio/voices.ts`、`voices.test.ts`，类型跟随分配者。

## 写入范围

- `src/app/flight-audio/voices.ts`：分配/回收账本。
- `src/app/flight-audio/voices.test.ts`：预算与回调顺序测试。

## 验收标准

- [ ] 类别竞争与总上限、预算 + 1、拒绝无虚假句柄均符合定稿策略。
- [ ] 同一声音自然结束/抢占/stop 多次到达只回收一次，旧 run 无法触及新 run。
- [ ] 混合来源与连续击杀序列的期望独立推导，不把所有拒绝当成平台故障。

## 验证方法

- 假控制器与可控结束通知覆盖交错序列；`pnpm test -- src/app/flight-audio/voices.test.ts`、`pnpm check`。
- 使用 [simplify](../../../../../.agents/skills/simplify/SKILL.md)检查本项账本复杂度；无浏览器/原版操作。

## 完成证据
