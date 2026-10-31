---
type: plan
status: active
phase: "P3"
task: "16"
subtask: "20"
updated: "2026-10-30"
---

# 20 — 修复：map-picture 用例的标签记录器锚点（P3-13 AC-17）

**契约来源：** [spec](../spec.md) 的 S-05、AC-04、AC-15，以及[技术决定](../spec.md#技术决定) 9、10；被修复的验收为 [P3-13 spec](../../13/spec.md) 的 AC-17。
**依赖：** 无。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 来源

[11](./11-render-test-risks.md#完成证据) 确认 `e2e/map-picture.development.spec.ts:211` 的失败与负载无关（单独 7 过 3 败），产品符合 DC-09：`installLabelRecorder` 把 `projection` 初始化为 null，记录器第一帧总被当作发布帧与精确锚点，而 store 约每 100 ms 才发布一次，该锚点可能过时若干 tick，按键也可能早于第一帧；由此在 :231、:234、:235 误报。只把第一帧当作非发布帧重算后，18 次探针运行全部符合 16 tick 周期且不符合 20。原责任 P3-13/28。

## 工作范围

- **修复测试测量：** 记录器以装好时 store 已有的 projection 为初值，第一帧不算发布；按键前等到记录器已有一个发布帧与一个无标签帧。不放宽判据、不加重试、不删断言。
- **验证：** 修复后单独与满载下各 `--repeat-each 10` 全部通过；用同一私有诊断确认判据仍能拒绝 20 tick 周期（例如对记录数据断言 `fitsPeriod(held, 20)` 为 false 的路径仍在）。
- **前提记录：** 11 指出“关图与重开合计 ≤ 4 个图内 tick”的前提在严重节流下不满足，属执行速度前提；本项不改它，只在完成证据写明适用条件。

## 不包含

- 产品代码；其他用例。

## 关键文件与契约

- [map-picture.development.spec.ts](../../../../../e2e/map-picture.development.spec.ts)、`e2e/support/map-picture.ts`。

## 写入范围

- `e2e/support/map-picture.ts`：记录器初值与就绪等待。
- `e2e/map-picture.development.spec.ts`：只在按键前的就绪等待需要时修改。

## 验收标准

- [ ] 修复后 `:211` 单独与满载下各 `--repeat-each 10` 全部通过，没有放宽判据或加重试。
- [ ] 判据仍区分 16 与 20 tick 周期，首读与携带计数的断言不变。
- [ ] `pnpm typecheck`、`pnpm lint` 通过；没有产品代码改动。

## 验证方法

- `pnpm build` 后 `pnpm exec playwright test e2e/map-picture.development.spec.ts --project development --repeat-each 10`（单独与满载各一次）；`pnpm typecheck`、`pnpm lint`。

## 完成证据
