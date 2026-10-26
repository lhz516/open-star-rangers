---
type: plan
status: active
phase: P3
task: "13"
subtask: "13"
updated: 2026-10-25
---

# 13 — Runtime 保留逐 tick projection

**契约来源：** [spec](../spec.md#共享契约修订d-01) 的 S-01，AC-01/03。
**依赖：** 08。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- `TickOutput` 保留现有 `#tick` 已提取的冻结 projection 引用，同 tick/clock/render 一致，不额外复制世界。
- 0 tick 空批次、至多 5 项、过场/完成截断、录制容量停止成功前缀、Core/读模型失败按现有规则交付。
- 保留先全部模拟、Event Bus、再帧消费者的顺序；同步现有批次夹具与消费者测试。

## 不包含

不改变固定步长、游戏命令顺序、两份 Render State 插值或 UI 采样，不实现驾驶舱消费者。

## 关键文件与契约

- [game-runtime.ts](../../../../../src/app/runtime/game-runtime.ts)、[game-session.ts](../../../../../src/app/session/game-session.ts)。
- [game-runtime-outputs.test.ts](../../../../../src/app/runtime/game-runtime-outputs.test.ts)、[game-session-presentation.test.ts](../../../../../src/app/session/game-session-presentation.test.ts)。

## 写入范围

- `src/app/runtime/*.ts`：TickOutput 与批次/故障测试。
- `src/app/session/*.ts`：原序转交与夹具测试。
- `src/render/flight/**/*.test.ts`：既有输出夹具同步。
- `src/render/flight/**/*.test-support.ts`：同 tick projection 夹具。
- `docs/engineering/modules/app.md`：新输出字段。

## 验收标准

- [ ] 各输出持有对应 tick projection，帧末不倒填旧 tick；对象引用可验证未重提取。
- [ ] cut/失败/容量前缀/0 tick 行为完整，事件不重复。
- [ ] P3-12 既有帧批次与回放测试保持通过。

## 验证方法

`pnpm test -- src/app/runtime src/app/session src/render/flight`、`pnpm check`；[simplify](../../../../../.agents/skills/simplify/SKILL.md) 只保留既有引用，不新增通用事件溯源框架。

## 完成证据
