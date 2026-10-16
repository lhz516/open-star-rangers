---
type: plan
status: active
phase: P3
task: "08"
subtask: "31"
updated: 2026-10-15
---

# 31 — 长测试的时限

**契约来源：** [工程约定](../../../../engineering/README.md)的测试规则；本 goal 的[执行记录](../goal.md#执行记录)中 21 的集成记录。
**依赖：** —
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 随世界状态的增长，少数长测试（快照全字段变化、快照文本预算、640×480 图像 payload 往返、任务场景）在主机负载高时超过 Vitest 的 5 秒默认时限，使 `pnpm check` 偶发失败；单独运行时它们在 3–5 秒内通过。
- 只给这些测试显式的单项时限（例如 30 秒），不改测试内容、断言或全局配置；若某项测试的耗时在 P3-08 中显著增长，记录原因（例如快照尾部字段）而不是削减覆盖。
- 在高负载下重复运行（例如 `pnpm test` 两次）确认不再因时限失败。

## 不包含

- 改变被测行为或缩小测试覆盖；修改 `vitest.config` 的全局时限。

## 关键文件与契约

- 已有：[snapshot.test.ts](../../../../../src/core/replay/snapshot.test.ts)、[budget.test.ts](../../../../../src/core/replay/budget.test.ts)、[image-payload.test.ts](../../../../../src/content/graphics/image-payload.test.ts)、[mission-scenarios.test.ts](../../../../../src/workers/mission-scenarios.test.ts)。

## 写入范围

- `src/core/replay/snapshot.test.ts`：单项时限。
- `src/core/replay/budget.test.ts`：单项时限。
- `src/content/graphics/image-payload.test.ts`：单项时限。
- `src/workers/mission-scenarios.test.ts`：单项时限。
- `docs/engineering/README.md`：测试规则中显式时限的清单。
- `src/core/replay/map-warp-replay.test.ts`：单项时限。
- `src/workers/import-job.test.ts`：单项时限。
- `tools/engineering-boundaries.test.ts`：单项时限（仅当该文件对时限覆盖的守卫允许）。

## 验收标准

- [x] 上列长测试有显式时限，测试内容不变。
- [x] `pnpm check` 通过；高负载下重复运行不再因 5 秒时限失败。

## 验证方法

- `pnpm check`；git 审阅确认只改时限参数。

## 完成证据

- **识别（JSON reporter 计时，单独 / load≈13 的一次全量 / 五次全量中最长，其中两次是两个全量并行、load≈52）：** snapshot 全字段变化 1.9 s / 2.7 s / 22.3 s，P3-08 控制器变体 1.1 / 1.8 / 15.5 s；budget 文本预算 2.2 / 3.3 / 23.0 s；640×480 masked 0.5 / 2.9 / 7.1 s；任务场景 0.1–0.3 s，mission-docking 最长 6.6 s（超时）；map-warp-replay 0.5–1.7 / 1.6–3.2 / 6.8 s（两项在 4 次全量中都超时）；import-job 的场景配置 1.8 / 4.4 / 15.2 s 与 0.7 / 1.2 / 5.9 s；engineering-boundaries 遍历真实应用程序的三项 0.3–0.5 / 1.2–2.1 / 5.1–7.5 s。这些文件中其余用例未超时；budget 的上限地图组已有 30 s（实测 6.5 s）。
- **改动（只加时限参数与实测依据注释，测试内容不变）：** 60 s：[snapshot.test.ts](../../../../../src/core/replay/snapshot.test.ts) 两项、[budget.test.ts](../../../../../src/core/replay/budget.test.ts) 的文本预算、[import-job.test.ts](../../../../../src/workers/import-job.test.ts) 的 `app test entry profiles` 组。30 s：[image-payload.test.ts](../../../../../src/content/graphics/image-payload.test.ts) 的 `round-trips %s` 表、[mission-scenarios.test.ts](../../../../../src/workers/mission-scenarios.test.ts) 的用例组、[map-warp-replay.test.ts](../../../../../src/core/replay/map-warp-replay.test.ts) 的顶层组、[engineering-boundaries.test.ts](../../../../../tools/engineering-boundaries.test.ts) 的 SliceDefinition 构造、低层能力边界与原版数据消费者三项。该文件的守卫只检查配置的 `testTimeout`/`hookTimeout`，允许单项时限。全字段变化用例在 P3-08 中变长：12 与 15 给富状态加了带忙碌解释器控制器的表程序与一个解析脚本，每个叶子各写一次快照文本；按要求保留覆盖。
- **检查：** 改动文件聚焦运行通过；最终版本的 `pnpm check` 连续两次通过（9,967 项，load 10–20，有其他会话并行检查）；收窄 engineering-boundaries 之前的版本也连续两次通过（load 6–32）。仅含前四个文件的早先版本在 load 13–25 下的两次 `pnpm check` 都因 map-warp-replay、import-job、engineering-boundaries 超时失败，扩大写入范围后不再出现。
- **Rubber-duck：** 两轮均无阻塞问题；确认 Vitest 5.0.3 的参数位置（含 `it.each(...)(name, options, fn)`）与余量。据其意见改正了 snapshot 注释中 P3-08 增长原因的表述，并把 engineering-boundaries 从组级与未超时用例收窄为三个实测超时的单项。
- **文档影响：** [工程约定](../../../../engineering/README.md)的测试规则补了这批 deadline 及其依据，“其余用例沿用默认值”仍成立。
