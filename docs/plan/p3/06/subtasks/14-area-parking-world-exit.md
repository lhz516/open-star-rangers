---
type: plan
status: active
phase: P3
task: "06"
subtask: "14"
updated: 2026-10-10
---

# 14 — 活动区域、停放与离开世界

**契约来源：** [spec](../spec.md) 的 S-06；AC-06；[活动区域、停放与世界边界](../spec.md#活动区域停放与世界边界)；D-02（停放切换、编队）、D-03（停放时清除目标）、D-06（`object-left-world`）、D-08；检查点 A 定稿的 `warpClock`/`inWarp`、AI 初态与停放中的 Warp 跳跃。
**依赖：** 11。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **活动区域（`area-check`，第 17 阶段）：** 遍历种类 `0x1fffffe`、状态为活动及以上；与实例化共用同一判定函数（重构 [spawn.ts](../../../../../src/core/systems/spawn.ts) 的 `startsActive`，结果不变；没有玩家实体时一律在区外）。区外且活动 → 区域切换（种类位 `0x1f00000` 改为待移除，不发事件）；区内、停放且不在 Warp 中 → 区域切换；其余不变。直接写状态，不释放任何东西。Warp 期间的中心归 P3-09。
- **停放切换（扩展 `leave`）：** 活动或停靠 → 停放：释放移动块，只在玩家目标恰为该实体时清除玩家目标；停放 → 活动：用 10 的初始移动块函数新建移动块。都不改计时字段。
- **Warp 过境（`0x2f298`）：** `inWarp` 且 `warpClock` 非零时，过境持续机型 +0xA8 秒（有效编队领队时取领队的机型）；未结束返回“过境中”，结束时清 `inWarp`。实体自身更新的通用部分（状态新建、表现就绪）在过境中不推进状态；停放更新在过境中跳过本实体的其余步骤。
- **停放更新（`parked-update`，第 13 阶段）：** 遍历种类 `0xfffff`，选停放、状态为活动及以上、未被毁的实体；每个每 tick 抽一次世界随机数得到随机阈值，时钟不早于 `lastParkedUpdateClock` + 阈值时到期；到期时先算经过时间并写 `lastParkedUpdateClock`，再做过境检查与停放行进。停放战斗归 P3-07/P3-08，不做。
- **停放行进（`0x2f314`）：** 已失效的编队领队清为 null 并结束本次；主体为有效领队或自身；按主体的 AI 模式取目标（模式 2 时有效的对象目标优先，否则取 AI 目标；对象目标由 P3-08 写入，本项经内部状态测试；模式 1、5 不运动；目标失效或在 Warp 中不运动）；目标点与零偏移的随机替换（用 10 的随机方向）。依次实现：到达（清偏移、模式 4 无领队时经来源记录的放置路线取新目标点、清 `inWarp`、离开世界测试）、停放中的 Warp 跳跃（条件、长度、6 次抖动、`warpClock`/`inWarp` 的写入；有领队时取领队的 `warpClock` 后编队跟随）、正常行进（姿态重建、步长按机型 +0xB8、6 次抖动）、编队跟随与姿态重建。每次写位置使放置序号加 1。基地相关的报告归 P3-10，不做。
- **离开世界：** 到达分支中，主体本次更新前的位置（忽略 z）在内缩 100 的世界矩形之外（严格比较）且种类不是僚机时，直接写待移除并发出一次 `object-left-world`（带来源快照）；下一 tick 由自身更新提出移除。重新放置与其他情形不发事件；域外错误不是规则退场。
- **活动对象的世界边界：** 不处理（M-07）；测试活动对象越出世界矩形时状态不变。
- **测试：** 区域内、等号、外与无玩家；离区停放（含停靠）与入区恢复，过境中不恢复；`0x1f00000` 分支（内部状态构造）；移动块释放与重建；只清除恰为该对象的玩家目标；停放更新的筛选、每实体每 tick 一次抽取、到期等号与经过时间；过境的持续、结束与生命周期门禁；停放行进各分支、编队跟随、领队失效、零偏移替换；离开世界的条件、僚机例外与一次事件；重新放置不误算退场；放置序号与 Render State 消费者。

## 不包含

- 玩家 Warp、Warp 完成与玩家 Warp 期间的区域中心（P3-09）；AI 程序对 AI 状态的改变、Warp 离场请求与停放战斗（P3-07、P3-08）；基地报告（P3-10）；事件 2 的计数（P3-11）。

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
- `src/core/systems/movement.test.ts`、`src/core/systems/flight-control.test.ts`：区域检查与停放切换接入后，修正假定它们不存在的既有测试（只改测试；2026-10-10 协调者按 scope-request 加入）。

## 验收标准

- [ ] AC-06：区域判定的严格边界与共用；区域切换各分支与 `0x1f00000` 分支；停放切换时机符合 Q-08；移动块释放与重建；停放更新的节奏、抽取与经过时间；Warp 过境与停放中的 Warp 跳跃；停放行进与编队跟随；真正退场一次事件并在下一适用阶段移除；重新放置不误算退场；停放中的位置写入增加放置序号；活动对象越出世界矩形状态不变。
- [ ] 只清除恰为停放对象的玩家目标；实例化时的活动判定结果不变（P3-02 测试仍通过）。
- [ ] `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts` 与 `pnpm check` 通过。

## 验证方法

- Node 边界、生命周期与 Render State 消费者测试；期望独立推导。
- 按 execute-goal 的流程完成 rubber-duck 审查后，以本项写入范围调用 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。
- 不涉及浏览器。

## 完成证据
