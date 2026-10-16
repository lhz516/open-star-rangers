---
type: plan
status: active
phase: P3
task: "08"
subtask: "21"
updated: 2026-10-15
---

# 21 — 停放 AI、对象集合与离场

**契约来源：** [spec](../spec.md) 的 S-11、AC-09；[停放、对象集合与离场](../spec.md#停放对象集合与离场)；05 的研究与 08、09 定稿。
**依赖：** 16, 18。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 计划新增 `src/core/rules/ai-parked.ts`：停放处理器 `0x62250` 及子处理器，在对象更新的控制器路径中运行（15 的分派），结果由第 13 阶段的既有行进与交战消费；不在行进阶段重复决策，RNG 交接与 E4 次序按 08 定稿。
- 对象集合：按 09 定稿（[P3-02 CR-29](../../02/spec.md#cr-29-对象集合与地图可见标志的分工d-03)），复用 P3-09 已实现的 `object-sets` 阶段、集合、`mapVisible` 与揭示函数（[object-sets.ts](../../../../../src/core/systems/object-sets.ts)、[map-visibility.ts](../../../../../src/core/rules/map-visibility.ts)，MW-06），不另建；实现 `0x62250` 的目标搜索与 `0x62760` 的读取、僚机停放步对揭示函数的调用，并执行 CR-29 的联合测试 1–7。
- 离开指令 `0x5e710` 与 Warp 离场请求（消息 0x800000）在 01/05 确认可达时实现：投递与处理时分别复检，处理写入区域切换与 Warp 字段，后续由 P3-06 的停放 Warp 跳跃执行；[area.ts](../../../../../src/core/systems/area.ts) 需要时调整。不可达时由 14 的检查拒绝，不实现。
- 测试：首次与无玩家、上一采样的集合、失效 ID（不变式）、地图开/关/连续帧下读者所见的集合与 `mapVisible`（CR-29 的 1–7）；停放控制器的时序与 RNG；离场请求的复检与跨 tick 链。

## 不包含

- 地图可见性分支，以及 `object-sets` 阶段、集合与揭示函数的实现（P3-09，已交付）；基地报告（P3-10）。

## 关键文件与契约

- 已有：[area.ts](../../../../../src/core/systems/area.ts)、[pipeline.ts](../../../../../src/core/systems/pipeline.ts)；P3-09 的 [object-sets.ts](../../../../../src/core/systems/object-sets.ts) 与 [map-visibility.ts](../../../../../src/core/rules/map-visibility.ts)（只调用，不改）。
- 计划新增：`src/core/rules/ai-parked.ts` 及其测试。

## 写入范围

- `src/core/rules/ai-parked.ts`：停放处理器（新建）。
- `src/core/rules/ai-parked.test.ts`：测试（新建）。
- `src/core/systems/pipeline.ts`：停放 AI 的接入与离场请求处理。
- `src/core/systems/area.ts`：离场与停放的衔接。
- `src/core/systems/area.test.ts`：测试。
- `src/core/systems/ai.ts`：停放分派。
- `src/core/systems/ai.test.ts`：集成测试（含 CR-29 的联合测试）。
- `src/core/systems/pipeline.test.ts`：删除已接入的 `warp-departure` 拒绝用例。

## 验收标准

- [ ] AC-09 的各项由测试覆盖，含在 P3-09 的实现上执行的 CR-29 联合测试 1–7（地图开、关与连续帧）；不另建集合或揭示函数。
- [ ] P3-06、P3-07 的停放测试保持通过。
- [ ] `pnpm exec vitest run src/core` 通过。

## 验证方法

- Node 阶段与历史快照测试，期望由 05 的记录独立推导。
- 按 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 清理本项范围。

## 完成证据
