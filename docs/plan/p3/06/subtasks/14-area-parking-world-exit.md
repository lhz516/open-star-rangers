---
type: plan
status: active
phase: P3
task: "06"
subtask: "14"
updated: 2026-10-09
---

# 14 — 活动区域、停放与离开世界

**契约来源：** [spec](../spec.md) 的 S-06；AC-06；[活动区域、停放与世界边界](../spec.md#活动区域停放与世界边界)；D-03（停放时清除目标）、D-06（`object-left-world`）、D-08。
**依赖：** 11。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **活动区域（`area-check`，第 17 阶段）：** 按 M-08 的筛选与判定，与实例化共用同一判定函数（重构 [spawn.ts](../../../../../src/core/systems/spawn.ts) 的 `startsActive`，结果不变）；覆盖离区停放、入区恢复与状态不变；标志要求直接退场的分支不误写为 `area-switch`。Warp 期间的中心归 P3-09。
- **停放切换：** 在 Q-08 的请求处理时机释放或重建移动块（重建用 10 的初始移动块函数），并清除指向停放对象的玩家目标。
- **停放更新（`parked-update`，第 13 阶段）：** 按 M-08 的节奏、随机阈值的抽取时机与次数、比较符号与经过时间实现；更新内容中的纯运动部分在此实现，读取 AI 目标或 Warp 的部分按检查点 A 的边界留给 P3-08、P3-09，测试以内部状态覆盖消费者，不给缺失输入填默认值。
- **离开世界（`0x2f314`）：** 按 M-07 区分真正退场、重新放置与继续保留；真正退场写入 `pending-removal` 并发出一次 `object-left-world`（带来源快照），下一适用的请求处理中移除；域外错误不是规则退场。
- **活动对象的世界边界：** 按 M-07 枚举的 `0x3a41c` 调用者实现；非连续的位置改变使放置序号加 1。
- **测试：** 区域内、等号、外与无玩家；离区停放与入区恢复；标志分支；移动块释放与重建；停放更新的节奏与抽取；离开世界的条件与一次事件；重新放置不误算退场；放置序号与 Render State 消费者。

## 不包含

- Warp 的过程与 Warp 期间的区域中心（P3-09）；停放对象的 AI（P3-08）；事件 2 的计数（P3-11）。

## 关键文件与契约

- [pipeline.ts](../../../../../src/core/systems/pipeline.ts) 的 `leave`、`PIPELINE`；[spawn.ts](../../../../../src/core/systems/spawn.ts)；[render-state.ts](../../../../../src/core/projections/render-state.ts)。
- 计划新增：`src/core/systems/area.ts`（区域、停放更新、离开世界）、`src/core/rules/active-area.ts` 等纯函数及相邻测试。
- 04 的完成证据与检查点 A 定稿。

## 写入范围

- `src/core/systems/pipeline*.ts`：`area-check`、`parked-update` 的接入与 `leave` 的扩展及测试。
- `src/core/systems/area*.ts`：区域与停放（新建）及测试。
- `src/core/systems/spawn*.ts`：共用区域判定。
- `src/core/rules/**`：区域、停放与世界边界纯函数（新建）及测试。
- `src/core/world/**`、`src/core/projections/render-state*.ts`：状态读写与放置序号测试所需的最小改动。

## 验收标准

- [ ] AC-06：区域判定的严格边界与共用；停放切换时机符合 Q-08；移动块释放与重建；停放更新节奏与抽取；真正退场一次事件并在下一适用阶段移除；重新放置不误算退场；非连续移动增加放置序号。
- [ ] 指向停放对象的玩家目标被清除；实例化时的活动判定结果不变（P3-02 测试仍通过）。
- [ ] `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts` 与 `pnpm check` 通过。

## 验证方法

- Node 边界、生命周期与 Render State 消费者测试；期望独立推导。
- 按 execute-goal 的流程完成 rubber-duck 审查后，以本项写入范围调用 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。
- 不涉及浏览器。

## 完成证据
