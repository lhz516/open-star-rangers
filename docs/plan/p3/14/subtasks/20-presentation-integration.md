---
type: plan
status: active
phase: P3
task: "14"
subtask: "20"
updated: 2026-10-28
---

# 20 — 表现接口增补与真实模块联合验证

**契约来源：** [spec](../spec.md#需要-p3-12-提供的只读接口) 的 S-05、S-06、AC-05、AC-07、AC-14；[D-02 定稿](../spec.md#d-02-定稿已批准)的 DW-02、DW-03、DW-05、DW-07、DW-08、D2-05。
**依赖：** 16。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 在 P3-12 的表现模块实现 DW-02：`PresentationExplosion.forward`、`speed`（爆炸移动块的 R2 与 +0x08；Core 爆炸取同 tick Render State 的值，额外爆炸取构造时主爆炸来源项的值，碎片爆炸取其漂移 F(R2′ × s) 的 R2′ 与 s），`PresentationTick.explosions`（该 tick 结束时的当前爆炸，等于该 tick 后的 `explosions()`）。纯表现输出：不改变选择、相机、绘制、预算或抽取次序，不进入 Core、快照或 replay。
- 使 16 以结构类型声明的 `PresentationTick` 输入可直接接受实际类型。
- 以真实 `createFlightPresentation`（含真实表现效果与被毁相机）与 16 的消费者做联合测试：两个帧消费者两种调用次序结果相同；1×5、5、2+0+3 的 tick 分组结果相同；同次 EXPL 的原列表下标与声音一致、被阻止或抢占不重抽；表现层爆炸在离开 `explosions` 的 tick 停止；Warp 中听者为 `afterStep`（D2-04）；静止帧、晚接与重试不重放激活；驾驶舱与音效各自读同一 `TickOutput`、互不推进。
- 在 P3-02 FS-07 之后加一条指向 DW-02 的交接注记，附依用户 2026-10-28 授权的批准记录。

## 不包含

- 不复制相机或选择器，不改 P3-12 的任何选择、相机、绘制规则或验收；不实现音效消费者（16）或所有者接线（17、18）；生产者缺接口回负责项。

## 关键文件与契约

- 现有 [presentation-contract.ts](../../../../../src/render/flight/presentation/presentation-contract.ts)、[flight-presentation.ts](../../../../../src/render/flight/presentation/flight-presentation.ts)、[presentation-effects.ts](../../../../../src/render/flight/presentation/effects/presentation-effects.ts)、[flight-run.ts](../../../../../src/render/flight/renderer/flight-run.ts) 的 `wireFlightRun`，以及 16 的 `consumer.ts`。

## 写入范围

- `src/render/flight/presentation/presentation-contract.ts`：DW-02 的类型。
- `src/render/flight/presentation/flight-presentation.ts`、`flight-presentation.test.ts`、`presentation.test-support.ts`：`explosions` 与 Core 爆炸的 `forward`/`speed` 及测试。
- `src/render/flight/presentation/effects/presentation-effects.ts`、`effects/presentation-effects.test.ts`、`effects/effects.test-support.ts`：额外爆炸与碎片爆炸的 `forward`/`speed` 及测试。
- `src/app/flight-audio/consumer.test.ts`、`src/app/flight-audio/consumer.test-support.ts`：以真实表现模块与消费者的联合测试用例（不改 16 的生产代码）。
- `docs/plan/p3/02/spec.md`：仅 FS-07 之后指向 DW-02 的交接注记与批准记录。

## 验收标准

- [ ] DW-02 的字段在各爆炸来源取值正确、冻结、读取无副作用；P3-12 既有测试与抽取次序不变（`pnpm exec vitest run src/render/flight` 通过）。
- [ ] 联合测试中每个声音尝试与动画同次选择一致（list − 1 与原 item 下标），两种调用次序与不同 tick 分组结果相同，表现层爆炸的移除 tick 正确，失败不重抽。
- [ ] Warp 与被毁视角的听者、静止帧、晚接、重试与隐藏恢复边界通过；驾驶舱与音效互不推进；没有新增循环或 Core 回写。

## 验证方法

- `pnpm test -- src/render/flight/presentation src/app/flight-audio/consumer.test.ts tools/engineering-boundaries.test.ts`、`pnpm check`。
- 对本项调用 [simplify](../../../../../.agents/skills/simplify/SKILL.md)；浏览器中的实际接线证据归 22。

## 完成证据
