---
type: plan
status: active
phase: P3
task: "10"
subtask: "19"
updated: 2026-10-14
---

# 19 — 通讯分区读模型

**契约来源：** [spec](../spec.md) 的 S-02、S-04、S-07、AC-05；[规则输入与读模型边界](../spec.md#规则输入与读模型边界)的“projection”“身份与快照”。
**依赖：** 13, 14, 17。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 把 `communications` 分区从 `not-implemented` 改为就绪：区分无玩家、菜单关闭、各菜单层级（菜单身份、项的源引用、显示位置与键、可用性）、来电（消息身份与说话者快照）与基地服务视图（Q-08 证明可显示的项、状态、选择、顺序与进度、资源与弹药）。
- 输出深度冻结、脱离世界；重复读取不抽取 RNG、不改变状态；后挂消费者从 projection 恢复当前菜单与来电，不需要事件历史；不泄露完整实体表或隐藏对象位置。

## 不包含

- G-05 页面与 G-03 文字（22）；驾驶舱绘制（P3-13）。

## 关键文件与契约

- [projection.ts](../../../../../src/core/projections/projection.ts)；[combat.ts](../../../../../src/core/projections/combat.ts) 是分区模块的先例。
- 计划新增：`src/core/projections/communications.ts` 及测试。

## 写入范围

- `src/core/projections/communications*.ts`：计划新增。
- `src/core/projections/projection*.ts`：分区接入与断言。

## 验收标准

- [ ] AC-05（读模型部分）：各判别正确；菜单、来电与基地视图完整、冻结、读取无副作用；后挂消费者可恢复持续状态；说话者移除后来电仍可解析。
- [ ] 本项相邻测试、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- `pnpm exec vitest run` 跑本项相邻测试，再跑 `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts`；`pnpm typecheck` 与 `pnpm lint` 通过。
- 完成前按 execute-goal 做一次 rubber-duck 审查，并以本项写入范围调用 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据
