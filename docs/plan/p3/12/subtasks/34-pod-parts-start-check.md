---
type: plan
status: active
phase: P3
task: "12"
subtask: "34"
updated: 2026-10-17
---

# 34 — 修复：逃生舱碎片的部件数在运行开始时校验

**契约来源：** [spec](../spec.md) 的 AC-03（内容错误阻断开始，不在飞行中故障）、AC-10（逃生舱绘制部件 0–2）、[内容输入与校验](../spec.md#内容输入与校验)。
**依赖：** 20, 23, 24。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 24 发现：在真实 Session 中用合成生产包 `mission-startable` 运行，玩家被毁约 98 tick 后的逃生舱碎片（`parts-0-2`）使渲染器在飞行中抛出 `ContentContractError` 并使消费者故障，因为 Core 的 `checkDebris` 接受第 1 列表部件数 ≥ 1 的本方模型，而 20 的 `fragmentLook` 需要 ≥ 3。原版对种类 1、2 的碎片按第 1 列表序号减 3 取 DEBRIS 记录，逃生舱绘制部件 0–2；原版数据中玩家模型有 7 个部件，少于 3 个时原版行为未定义（[executable](../../../../original/formats/executable.md) 的 DEBRIS 映射）。
- 在 `prepareFlightContent`（运行开始、分配之前）拒绝可能成为 `parts-0-2` 来源（种类 1、2 的本方模型）而第 1 列表部件少于 3 的内容，以内容错误阻断开始；不改 Core 的校验。
- 延长后的集成测试暴露 21 的精灵层从上一个绘制帧取前一位置，使多 tick 帧与单 tick 帧在爆炸移动时画面不同（AC-17）；改为在逐 tick 的表现订阅中记录位置。
- 把合成生产包的玩家机体改为至少 3 个第 1 列表部件；用真实 Session 跑过玩家被毁与逃生舱碎片的绘制（例如延长 24 的集成测试到逃生舱出现之后），确认不再故障。

## 不包含

- 修改 Core 的内容校验或 DEBRIS 规则。

## 写入范围

- `src/render/flight/objects/**`、`src/render/flight/renderer/**`：运行开始时的校验与测试。
- `src/original-data/conversion/production-models.test-support.ts`：合成玩家机体的第 1 列表部件数。
- `src/app/session/game-session-presentation.test.ts`：延长到逃生舱出现之后的集成断言。
- `src/app/mission/flight-content.ts`、`src/app/mission/flight-consumer.test.ts`：从任务的机体类型表得出逃生舱来源模型并测试开始被拒。
- `src/original-data/conversion/production-rule-data.test-support.ts`：`SLICE_MODEL_PARTS` 与玩家机体部件数一致。
- `src/render/flight/sprites/explosion-sprites.ts`、`src/render/flight/sprites/explosion-sprites.test.ts`：精灵的上一位置改为按 tick 记录（与世界相同的插值来源），修复延长测试暴露的分组差异（AC-17）。

## 验收标准

- [x] 部件少于 3 的种类 1、2 本方模型在运行开始时以内容错误被拒绝，有测试；飞行中不再因此故障。
- [x] 合成生产包在真实 Session 中跑过玩家被毁与逃生舱绘制，事件、检查点与哈希的分组一致性仍成立。
- [x] `pnpm check` 通过。

## 验证方法

- Node 测试。

## 完成证据

- **运行开始时的拒绝：** `flightContentOf` 从包内任务引用的机体类型表取机体类型 0、1（种类 1、2）的模型作为 `passes.podModels`；`prepareObjectSurfaces`（由 `prepareFlightContent` 在任何分配之前调用）对缺失或第 1 列表部件少于 3 的此类模型抛出 `binding-mismatch`（路径 `objects.podModels[<Asset ID>]`）。Core 的校验未改。测试：`object-surfaces.test.ts`（缺失、1 个部件被拒；3 个部件与非逃生舱模型接受）、`flight-passes.test.ts`（`prepareFlightContent` 拒绝）、`flight-consumer.test.ts`（把 `mission-startable` 的玩家模型裁到 1 个第 1 列表部件：Core 接受，消费者使开始以回滚的 `ContentContractError` 失败，渲染器未绑定运行；去掉校验时该用例失败）。
- **合成玩家机体：** `production-models.test-support.ts` 的玩家机体（玩家与僚机共用）改为 3 个第 1 列表部件，DEBRIS 记录数不变（max(3 − 3, 0) = 0），`SLICE_MODEL_PARTS` 同步。全量 Vitest（含 conversion、tools、worker）通过。
- **真实 Session 跑过逃生舱：** `game-session-presentation.test.ts` 由 60 tick 延长到 120 tick；逃生舱于 tick 99 出现、玩家爆炸于 tick 100 开始；断言 `podModels` 恰为玩家模型，块末 100–120 的帧绘制逃生舱外观的部件 0–2，之前不绘制；Core 事件 8/8/8、20 次激活（8 个 Core、12 个额外）。三种分组下全部图像与无表现运行的事件、检查点、状态哈希及绘制摘要一致（22 个用例通过）。
- **延长暴露的 AC-17 缺陷与修复：** 原 `ExplosionSprites` 以最后一次绘制的帧作为上一 tick 位置，多 tick 帧在 tick 105 绘制出单 tick 运行没有的精灵（玩家爆炸在移动）。现改为在表现模块逐 tick 通知时记录位置，上一位置恒为 tick − 1 之后的位置，与世界的插值来源一致；若通知的 tick 不是模块当前 tick（批量推进后才通知）则以 `invalid-state` 拒绝，而不是用错误的位置。`explosion-sprites.test.ts` 覆盖多 tick 帧的混合与该拒绝；旧实现下混合用例失败。
- **检查：** 聚焦测试（`src/render/flight`、`game-session-presentation`、`flight-consumer`）通过；`pnpm check` 通过（382 个文件、10601 个测试，构建成功）；Playwright `mission-flow` 开发与生产（端口 5202/5203）11 个用例通过。
- **Rubber-duck：** 指出真实表现模块的 `advance` 在批量输出时先全部推进再通知，逐 tick 记录会取到最后一 tick 的位置。线上接线逐 tick 调用 `advance`，故不受影响；采纳为加上上述 `camera().tick` 校验与测试，而不改表现模块（不在写入范围）。其余无问题。
- **Simplify：** 改用 Core 的 `PLAYER_KIND_BIT`/`WINGMAN_KIND_BIT`，合并逃生舱模型的两条错误分支。未采纳：把测试里改写包的辅助函数与玩家模型查找移到 `mission.test-support.ts`（不在写入范围）；让表现通知携带爆炸位置（表现模块不在写入范围）。
- **文档影响：** 无需更新。没有新的原版事实（DEBRIS 映射与逃生舱部件 0–2 已在 `executable.md`），工程约定与命令不变；spec 的内容校验原则已涵盖开始前拒绝。
