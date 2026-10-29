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
- `src/render/flight/sprites/explosion-sprites.test.ts`、`src/render/flight/sprites/sprite-rules.test.ts`：仅为 DW-02 的必需字段补夹具（协调者 2026-10-28 扩展）。
- `src/app/flight-audio/rule-integration.test-support.ts`：仅改用真实表现模块（`sessionPresentation` 移除后的导入，集成 19 后协调者 2026-10-28 扩展）。

## 验收标准

- [x] DW-02 的字段在各爆炸来源取值正确、冻结、读取无副作用；P3-12 既有测试与抽取次序不变（`pnpm exec vitest run src/render/flight` 通过）。
- [x] 联合测试中每个声音尝试与动画同次选择一致（list − 1 与原 item 下标），两种调用次序与不同 tick 分组结果相同，表现层爆炸的移除 tick 正确，失败不重抽。
- [x] Warp 与被毁视角的听者、静止帧、晚接、重试与隐藏恢复边界通过；驾驶舱与音效互不推进；没有新增循环或 Core 回写。

## 验证方法

- `pnpm test -- src/render/flight/presentation src/app/flight-audio/consumer.test.ts tools/engineering-boundaries.test.ts`、`pnpm check`。
- 对本项调用 [simplify](../../../../../.agents/skills/simplify/SKILL.md)；浏览器中的实际接线证据归 22。

## 完成证据

- **实现（DW-02）：** [presentation-contract.ts](../../../../../src/render/flight/presentation/presentation-contract.ts) 新增 `ExplosionMotion`；`PresentationExplosion` 扩展它（`forward`、`speed`），`PresentationTick` 增加 `explosions`，效果接缝的 `PresentationActivationRequest` 增加 `motion`。[flight-presentation.ts](../../../../../src/render/flight/presentation/flight-presentation.ts) 在每个 tick 末由 `#settleCore` 以同 tick Render State 的 `orientation` 6–8 与 `speed` 给出 Core 爆炸的块，并把该 tick 结束时的冻结列表同时作为 `PresentationTick.explosions` 与之后 `explosions()` 的返回值（同一对象）。[presentation-effects.ts](../../../../../src/render/flight/presentation/effects/presentation-effects.ts) 中额外爆炸取构造 tick Render State 中 Core 爆炸的第 3 行与速度（与 X3 按主爆炸同法建立的块相同），碎片爆炸取 `linearItem` 补全后的 R2′ 与块速度 s（其漂移 F(R2′ × s) 的同一来源）。没有改变选择、相机、绘制、预算或任何随机抽取。
- **类型：** 实际 `FlightPresentation` 直接赋给 16 的结构类型 `AudioPresentation`（[consumer.test.ts](../../../../../src/app/flight-audio/consumer.test.ts) 的正式运行与 `realHarness` 均如此接线，`pnpm typecheck` 通过）；`consumer.ts` 生产代码未改。
- **P3-12 测试：** `pnpm exec vitest run src/render/flight` 通过（39 个文件）。既有断言只为必需字段补值：`flight-presentation.test.ts` 中一处 `toEqual` 加 `forward`/`speed`，各 `activate` 请求加 `motion`；两个 sprites 测试只补夹具（协调者扩展的范围）。新增：每 tick 的 `explosions` 与 Core/表现层块的取值、冻结、与 `explosions()` 同一、读取不抽取；1 tick 一帧与 3 tick 一帧结果相同；非有限的块被拒绝；额外爆炸保持构造时的块且漂移与 F(R2 × s) 一致，Core 爆炸跟随当 tick 的 Render State；碎片爆炸的 s 等于主爆炸速度、R2′ 为单位向量且每 tick 漂移等于 R2′ × s / 32。
- **联合测试（真实 `createFlightPresentation` + 真实效果 + 被毁相机 + 16 的消费者）：**
  - 正式 Session（`combatRunSpec`，120 tick）：1×5、5、2+0+3、0–5 混合四种分组 × 两种帧消费者次序的决定完全相同，Core 事件、帧请求数与表现模块的全部 `PresentationTick` 与无音效运行相同；每个键只激活一次（Core 与额外爆炸都出现）；每个列出的爆炸在其存活期内保持激活时的选择；每个爆炸声音尝试都是 `explosionSound(CONTENT, selection)`（list − 1 与原 item 下标），首次决定在激活 tick；表现层爆炸离表后无任何决定，移除停止只在离表的 tick；锁定控制器下全部失败而表现 tick 不变（不重抽）；接入 P3-13 真实驾驶舱（`cockpitFor`，同一帧逐 tick 推进后交驾驶舱）时音效决定与无驾驶舱相同、驾驶舱每 5 tick 的状态与无音效相同；在 tick 50 晚接的消费者只有 tick > 50 的决定、不触及已结束的爆炸、表现 tick 不变。
  - 手动驱动的运行（`realHarness`）：同一机体爆炸场景在两种次序 × 1×5、5、2+0+3 下决定与表现 tick 相同，未被切断的表现层爆炸声部在离表 tick 以 `removal` 停止（`expectRemovals` 计数大于 0）；静止帧与 0 tick 帧不推进表现、无决定；Warp（视角 1）中敌机按 `afterStep`（隧道位姿）得到 `AHEAD_1000` 参数，而 `beforeStep` 在原点；被毁视角（0x11/8，跟随实体）中参数等于以 `afterStep` 为听者的计算且不同于 `beforeStep`；页面隐藏后恢复不产生新激活，存活爆炸以其选择的声音重试且从不抢占；重试的新运行、新表现模块与新消费者在同一控制器上得到与首个运行相同的决定与表现 tick（除 runId）。
  - 没有新增循环、计时器或 Core 回写：音效只读 `TickOutput` 与 `PresentationTick`（Core 事件与帧请求数对照相同）。
- **19 的规则链：** 19 先集成后，其 [rule-integration.test-support.ts](../../../../../src/app/flight-audio/rule-integration.test-support.ts) 改用真实表现模块（`realPresentation`，协调者 2026-10-28 扩展范围），断言不变，`rule-integration.test.ts` 通过。
- **命令：** `pnpm exec vitest run src/app/flight-audio/consumer.test.ts src/render/flight tools/engineering-boundaries.test.ts`（41 个文件、604 项通过）；`pnpm check` 通过。
- **审阅：** rubber-duck 未发现问题。simplify：去掉 Core 块的占位常量与比较辅助函数（改为 tick 末一律赋值，未定时为 null）、合并激活请求两分支的公共字段、简化 `realHarness` 的控制器选项；未采纳：与 `cockpit-integration.test-support.ts` 的接线重复（该文件在范围外）、跳过未列出 Core 爆炸的额外爆炸（会改变抽取次序）。
- **文档影响：** [P3-02 spec](../../02/spec.md) FS-07 之后加交接注记（已完成）。[render 模块说明](../../../../engineering/modules/render.md)的“查询与订阅”与交接中的 `PresentationTick` 字段列表未含 DW-02 的增补，在本项写入范围外，已作为提议交协调者。
