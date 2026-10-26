---
type: plan
status: active
phase: P3
task: "13"
subtask: "14"
updated: 2026-10-25
---

# 14 — 驾驶舱表现状态与生命周期基础

**契约来源：** [spec](../spec.md#驾驶舱表现层契约计划新增) 的 S-02，AC-03/04/08/18。
**依赖：** 10, 12。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 实现 D-01 的 owner/run 绑定、初始 tick、具名种子派生、只读查询、整体批次验证、失败锁存与幂等释放。
- 每逻辑 tick 一次调度，各仪表仍按到期/强制条件更新；首画不伪造 tick，重复绘制/0 tick 不打字或抽随机数。
- 提供各仪表独立子状态的最小组合契约和测试支持，Core blink 只消费不重算；CPU/队列预算按 D-01。

## 不包含

不实现仪表、共享音频模型、WebGL 或应用调度，不导入 app/ui/React/宿主时钟。

## 关键文件与契约

- 现有 [projection.ts](../../../../../src/core/projections/projection.ts)、10 的规范内容。
- 计划新增 `src/render/cockpit/presentation/` 的合同、调度、随机与测试支持；具体公共形状由 D-01 固定。

## 写入范围

- `src/render/cockpit/presentation/**`：计划新增纯表现基础及测试。
- `eslint.config.js`：仅驾驶舱纯模块边界。
- `tools/engineering-boundaries.test.ts`：真实程序及违规反例。

## 验收标准

- [ ] 相同逐 tick 输入的分帧状态/RNG 一致，空批次不推进。
- [ ] 乱序、跨运行与错误形状在抽取前拒绝，运行故障后不能继续。
- [ ] 释放幂等、预算先检查，不消耗 Core 或 P3-12 随机流。

## 验证方法

`pnpm test -- src/render/cockpit/presentation tools/engineering-boundaries.test.ts`、`pnpm check`；[simplify](../../../../../.agents/skills/simplify/SKILL.md) 限现有消费者需求，不做通用 UI 引擎。

## 完成证据
