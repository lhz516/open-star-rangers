---
type: plan
status: active
phase: P3
task: "11"
subtask: "15"
updated: 2026-10-17
---

# 15 — 读模型、录制与 replay

**契约来源：** [spec](../spec.md) 的 S-08、AC-09（Core 部分）、AC-10；[结果读模型、事件与门禁](../spec.md#结果读模型事件与门禁)、[运行中与终局衔接](../spec.md#运行中与终局衔接)的录制与 replay。
**依赖：** 14。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- [projection.ts](../../../../../src/core/projections/projection.ts)：`mission` 分区的流程阶段（正常、被毁序列、信标等待、停靠、结算等待、结果延时、退场、完成）；`result` 在退场完成前为进行中，完成后公开冻结的终态（原因、绑定任务 Asset ID 的总结引用或 null、`rescuesUsed`、终局 G-02 序列、击杀合计）；不公开救援计数、触发计数或期限。读取冻结、无副作用。
- 录制与 replay（[recording.ts](../../../../../src/core/replay/recording.ts)、[replay.ts](../../../../../src/core/replay/replay.ts)）：录制包含锁存与全部退场 tick，在完成提交处结束，最终检查点不丢失不重复；健康完成可导出；replay 拒绝完成后多余的 tick；容量停止与故障不冒充完成。
- [replay-check.ts](../../../../../tools/replay-check.ts) 支持以完成结束的录制，并有合成测试。
- 测试：分区的各阶段与终态、后挂消费者恢复持续状态；成功与两次救援后失败的录制 JSON 往返，事件与检查点哈希一致，与帧分组无关；版本、身份与 setupHash 错误。

## 不包含

- 会话与 UI 消费（16、17）；真实内容运行（19）。

## 关键文件与契约

- [snapshot.ts](../../../../../src/core/replay/snapshot.ts)、[compare.ts](../../../../../src/core/replay/compare.ts)、[replay.test-support.ts](../../../../../src/core/replay/replay.test-support.ts)、[limits.ts](../../../../../src/core/contracts/limits.ts)。

## 写入范围

- `src/core/projections/**`：分区实现与测试。
- `src/core/replay/**`：录制、replay 与测试。
- `tools/replay-check.ts`：完成结束的录制核对。
- `tools/replay-check.test.ts`：合成测试。

## 验收标准

- [ ] 分区区分各阶段，终态只在完成后公开；读取冻结无副作用；不公开内部计数。（AC-09）
- [ ] 两种终局的录制往返一致；完成后多余 tick 被拒绝；健康完成可导出。（AC-10）
- [ ] `node tools/replay-check.ts` 的合成测试通过；受影响的 Vitest、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- Node projection 与 replay 测试；`pnpm exec vitest run src/core tools/replay-check.test.ts`。
- 按 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 清理本项范围。

## 完成证据
