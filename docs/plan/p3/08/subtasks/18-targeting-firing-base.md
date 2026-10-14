---
type: plan
status: active
phase: P3
task: "08"
subtask: "18"
updated: 2026-10-14
---

# 18 — 目标、开火、规避与基地

**契约来源：** [spec](../spec.md) 的 S-07、S-08、AC-06；[目标、开火与规避](../spec.md#目标开火与规避)；03 的研究与 08 定稿。
**依赖：** 15, 17。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 计划新增 `src/core/rules/ai-targeting.ts`：AI 目标 +0x90 与对象目标 +0x8C 的原版写入点、`0x632a4` 交战份额（AICO 组 0 三元组）、`0x5e444` 候选与 `0x2daa0` 保持值；读取命中与接近记录。
- 计划新增 `src/core/rules/ai-firing.ts`：按下 `0x5df20`（按住期限）、松开 `0x5df84`、射程判定 `0x5dfa4`；`src/core/systems/ai.ts`（15 新建）中 `0x5dcd4` 的三个通道次序与自动挂点调用，经 [weapons.ts](../../../../../src/core/systems/weapons.ts) 的现有入口开火（`shot-fired` 的 `trigger` 为 `ai` 或 `automatic`，不产生命令结果）。
- 基地的内置处理器（`0x62c10` 及其自动挂点行为）按 03 的结论实现，接入 15 的分派。
- 规避与其他机动的支持范围内分支（按 03 的结论）作为原语供 16 的操作码与内置处理器调用。
- 测试：目标写入点、份额、候选与保持；控制器决策与扳机/自动开火的先后与期限边界；通道 1 不丢弹或重复；发射者或目标失效、耗弹、受损、活动切换；基地连发节奏；僚机导弹的制导共用。

## 不包含

- 僚机处理器（19）；解释器（16）。

## 关键文件与契约

- 已有：[weapons.ts](../../../../../src/core/systems/weapons.ts)、[firing.ts](../../../../../src/core/rules/firing.ts)。
- 计划新增：`src/core/rules/ai-targeting.ts`、`src/core/rules/ai-firing.ts` 及其测试。

## 写入范围

- `src/core/rules/ai-targeting.ts`：目标（新建）。
- `src/core/rules/ai-targeting.test.ts`：测试（新建）。
- `src/core/rules/ai-firing.ts`：扳机与基地行为（新建）。
- `src/core/rules/ai-firing.test.ts`：测试（新建）。
- `src/core/systems/weapons.ts`：入口复用的必要调整。
- `src/core/systems/weapons.test.ts`：测试。
- `src/core/systems/ai.ts`：通道次序与基地处理器接入。
- `src/core/systems/ai.test.ts`：集成测试。

## 验收标准

- [ ] AC-06 的各项由规则与完整阶段集成测试覆盖。
- [ ] P3-07 的战斗测试保持通过。
- [ ] `pnpm exec vitest run src/core` 通过。

## 验证方法

- Node 测试，期望由 03 与 W9/W10、CR-05/CR-07 独立推导。
- 按 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 清理本项范围。

## 完成证据
