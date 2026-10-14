---
type: plan
status: active
phase: P3
task: "08"
subtask: "21"
updated: 2026-10-14
---

# 21 — 停放 AI、对象集合与离场

**契约来源：** [spec](../spec.md) 的 S-11、AC-09；[停放、对象集合与离场](../spec.md#停放对象集合与离场)；05 的研究与 08、09 定稿。
**依赖：** 16, 18。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 计划新增 `src/core/rules/ai-parked.ts`：停放处理器 `0x62250` 及子处理器，在对象更新的控制器路径中运行（15 的分派），结果由第 13 阶段的既有行进与交战消费；不在行进阶段重复决策，RNG 交接与 E4 次序按 08 定稿。
- 计划新增 `src/core/systems/object-sets.ts`：`object-sets` 阶段按原版门禁（有无玩家、记忆视角、地图连续帧）重建友方与敌方集合，维护可见性历史；在原版位置留出 P3-09 地图分支的调用点说明，不预先实现；[pipeline.ts](../../../../../src/core/systems/pipeline.ts) 接入该阶段。
- 离开指令 `0x5e710` 与 Warp 离场请求（消息 0x800000）在 01/05 确认可达时实现：投递与处理时分别复检，处理写入区域切换与 Warp 字段，后续由 P3-06 的停放 Warp 跳跃执行；[area.ts](../../../../../src/core/systems/area.ts) 需要时调整。不可达时由 14 的检查拒绝，不实现。
- 测试：首次与无玩家、上一采样的集合、失效 ID、地图重建门禁与可见性历史的快照；停放控制器的时序与 RNG；离场请求的复检与跨 tick 链。

## 不包含

- 地图可见性分支（P3-09）；基地报告（P3-10）。

## 关键文件与契约

- 已有：[area.ts](../../../../../src/core/systems/area.ts)、[pipeline.ts](../../../../../src/core/systems/pipeline.ts)。
- 计划新增：`src/core/rules/ai-parked.ts`、`src/core/systems/object-sets.ts` 及其测试。

## 写入范围

- `src/core/rules/ai-parked.ts`：停放处理器（新建）。
- `src/core/rules/ai-parked.test.ts`：测试（新建）。
- `src/core/systems/object-sets.ts`：集合阶段（新建）。
- `src/core/systems/object-sets.test.ts`：测试（新建）。
- `src/core/systems/pipeline.ts`：阶段接入与离场请求处理。
- `src/core/systems/area.ts`：离场与停放的衔接。
- `src/core/systems/area.test.ts`：测试。
- `src/core/systems/ai.ts`：停放分派。
- `src/core/systems/ai.test.ts`：集成测试。

## 验收标准

- [ ] AC-09 的各项由测试覆盖；P3-09 未接入的地图分支在完成证据中明确交接，不声称通过。
- [ ] P3-06、P3-07 的停放测试保持通过。
- [ ] `pnpm exec vitest run src/core` 通过。

## 验证方法

- Node 阶段与历史快照测试，期望由 05 的记录独立推导。
- 按 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 清理本项范围。

## 完成证据
