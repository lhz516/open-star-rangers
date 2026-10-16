---
type: plan
status: active
phase: P3
task: "14"
subtask: "16"
updated: 2026-10-15
---

# 16 — 运行级有序音效消费者

**契约来源：** [spec](../spec.md#发声类别) 的 S-04、S-05、S-06、S-08、AC-03、AC-04、AC-05、AC-10。
**依赖：** 11, 12, 13, 14, 15。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 连接公开 onAny/onFrame，按 D-02 收集本帧事件、等待已准备的表现快照、按 tick/顺序消费，再更新持续声音。
- 使用分配账本、参数与 HUD 读模型，区分一次性激活标记和播放句柄；爆炸和纯表现来源有独立命名空间。
- 处理新建/活动/停放/待移除、限频边界、声音被抢占、零 tick/静止帧、锁定和隐藏后重建；旧脉冲/重复/爆炸不补发。
- 帧内缓存按已批准事件/效果预算限制；结束、故障、取消与 run 退役失效缓存/回调，绝不调用 step 或提交命令。

## 不包含

- 不自建 rAF/计时器，不实现相机或选择器；生产装配与跨任务验证归 17–20。

## 关键文件与契约

- 现有 [GameSessionRun](../../../../../src/app/session/game-session.ts)、[MAX_TICKS_PER_FRAME](../../../../../src/app/runtime/game-runtime.ts)和 CORE_LIMITS。
- 计划新增 `src/app/flight-audio/consumer.ts`、`consumer.test.ts`、`consumer.test-support.ts`。

## 写入范围

- `src/app/flight-audio/consumer.ts`：运行级消费与清理。
- `src/app/flight-audio/consumer.test.ts`：批次、持续状态与故障测试。
- `src/app/flight-audio/consumer.test-support.ts`：合成端口/帧与可控音频能力。

## 验收标准

- [ ] 0/1/多 tick 批次、独立同 Asset 事件、短命来源和本帧结束的效果不漏触发或重播。
- [ ] 持续状态、句柄和激活标记分离，锁定/隐藏/停止不积压一次性声音。
- [ ] 预算、失效回调与错误路径可断言，不改变 Core/RNG，不产生额外循环。

## 验证方法

- 使用真实 Session 加合成帧端口和假音频能力，独立核对播放意图/停止顺序；`pnpm test -- src/app/flight-audio/consumer.test.ts`、`pnpm check`。
- [simplify](../../../../../.agents/skills/simplify/SKILL.md)限定本项；替身覆盖不替代 19/20 的真实集成。

## 完成证据
