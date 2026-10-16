---
type: plan
status: active
phase: P3
task: "14"
subtask: "15"
updated: 2026-10-15
---

# 15 — 类型化事件到声音意图

**契约来源：** [spec](../spec.md#触发表) 的 S-02、S-04、S-07、AC-02、AC-03、AC-09。
**依赖：** 07, 08, 09。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 对每个现有 DomainEvent 明确分类为声音触发、生命周期/效果输入或不发声；炮/导弹按 family，受击按盾前态，parked 无受击音。
- 用静态机型绑定与事件位置快照解析，支持同帧来源消失；changed=false 的武器选择和自动选目标按合同处理。
- 保留 tick/发出序号与来源，commandId=null 不作去重键；独立事件不按 Asset 合并。
- 依 D-01/D-02 为上游已存在的输出接线，尚未交付者只记录 19 的前提，不发明生产事件或成功型占位。

## 不包含

- 不播放、不管理句柄或投递新 Core 命令；连续状态与事件缓冲归 16。

## 关键文件与契约

- 现有 [domain-events.ts](../../../../../src/core/contracts/domain-events.ts)、[GameEventBus](../../../../../src/app/runtime/game-event-bus.ts)以及 09 内容绑定。
- 计划新增 `src/app/flight-audio/events.ts`、`events.test.ts`。

## 写入范围

- `src/app/flight-audio/events.ts`：纯事件解释。
- `src/app/flight-audio/events.test.ts`：完整分类与快照测试。

## 验收标准

- [ ] 每个变体有显式处理，失败命令不制造成功音，hit/gated/parked 和选择未改变都正确。
- [ ] 槽为空与坏引用有不同结果，来源消失不漏掉合法事件。
- [ ] 同 tick 多事件的顺序和重复独立性保留；未接上的上游事件没有伪造通过。

## 验证方法

- 合成内容与合法事件，辅以正式 Core 产生的战斗事件；`pnpm test -- src/app/flight-audio/events.test.ts`、`pnpm check`。
- 对本项调用 [simplify](../../../../../.agents/skills/simplify/SKILL.md)；真实上游闭环归 19。

## 完成证据
