---
type: plan
status: active
phase: P3
task: "09"
subtask: "18"
updated: 2026-10-14
---

# 18 — Warp 过程、完成与中断

**契约来源：** [spec](../spec.md) 的 S-09、AC-09，AC-07 的进行与完成部分；[Warp 过程与到达](../spec.md#warp-过程与到达)。
**依赖：** 17, 28。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 在 [pipeline.ts](../../../../../src/core/systems/pipeline.ts) 的 `frame-end` 中、P3-07 显示步之前，按 06 推进进度并重现 `0x50188`/`0x50a28` 的规则位姿写入，与渲染无关。
- `warp-completion` 阶段在下一次检查消费已达终点的进度：恢复视角（8 改为 0xC）与页面、写回模式、速度、计时与能量（按 06），到达点加 ±(组 + 1) × 常数的偏移再按最近对象调整（抽取次序、支持集与调整按 06，世界 RNG），放置序号递增，`warp-completed` 只发一次。
- [area.ts](../../../../../src/core/systems/area.ts)/[active-area.ts](../../../../../src/core/rules/active-area.ts) 在玩家 Warp 期间的中心。
- 派发器子命令 2 在切片可达时一并实现；不可达时记录证据，不建无人调用的入口。
- Q-10 的每个可达中断：状态与一次性事实，取消不伪造完成；交 P3-11 的内部静态调用边界用合成前态验证。暂停只停住 Runtime，继续后接着同一 Warp。
- CR-11 差异 1（最近对象搜索看不到表现层效果）在测试与 Core 模块说明中注明。

## 不包含

- 结算推迟（P3-11）与 Warp 画面（P3-12、P3-13）。

## 关键文件与契约

- [pipeline.ts](../../../../../src/core/systems/pipeline.ts)、[displays.ts](../../../../../src/core/systems/displays.ts)、[area.ts](../../../../../src/core/systems/area.ts)、[active-area.ts](../../../../../src/core/rules/active-area.ts)、[movement.ts](../../../../../src/core/systems/movement.ts)。
- 计划新增：`src/core/rules/warp-arrival.ts`。

## 写入范围

- `src/core/systems/warp.ts`、`src/core/systems/warp.test.ts`
- `src/core/rules/warp-arrival.ts`、`src/core/rules/warp-arrival.test.ts`
- `src/core/systems/pipeline.ts`、`src/core/systems/pipeline.test.ts`
- `src/core/systems/area.ts`、`src/core/systems/area.test.ts`
- `src/core/rules/active-area.ts`、`src/core/rules/active-area.test.ts`
- `src/core/systems/displays.ts`、`src/core/systems/displays.test.ts`：frame-end 中的次序。
- `src/core/rules/warp-path.ts`、`src/core/rules/warp-path.test.ts`：计划新增，MW-02/MW-04/MW-07 的隧道路径（按 28/29 的 R-B）。
- `src/core/systems/view-switch.ts`、`src/core/systems/view-switch.test.ts`：进入/离开视角 1 的部分。（以上为协调者 2026-10-14 扩大范围）
- `src/core/systems/movement.ts`、`src/core/systems/movement.test.ts`、`src/core/world/world.test.ts`、`src/ui/dev/mission-diagnostics.test.ts`：Warp 期间的运动分派与既有整体期望（协调者 2026-10-14 扩大范围）。

## 验收标准

- [ ] AC-09：进度与规则位姿在指定阶段推进；frame-end 首次到终点与下一次 completion 检查的 tick 边界明确，无提前或重复完成；复原与放置序号正确。
- [ ] 到达随机的支持集、条件概率、次序与最近对象调整独立核对；CR-11 差异 1 已注明。
- [ ] Q-10 的每个可达中断有用例；未接入的 P3-11 流程不宣称联合通过；AC-07 的进行与完成部分不双扣。
- [ ] `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts` 与 `pnpm check` 通过。

## 验证方法

- Node 规则、固定阶段、随机映射（可枚举域枚举）与内部接口集成测试。

## 完成证据
