---
type: plan
status: active
phase: P3
task: "09"
subtask: "30"
updated: 2026-10-14
---

# 30 — 方向表改用原版映像常数（修复）

**契约来源：** [spec](../spec.md) 的 S-01、AC-01（共享规则数据与原版一致）；[P3-02 的 P3-09 契约修订](../../02/spec.md#p3-09-的契约修订d-01) MW-03、MW-08、MW-12（`startupRotations` 的前向行取自方向表，R-A 的代码规则分支）；goal 执行记录“28 发现既有方向表偏差，新增修复 30”。
**依赖：** 28。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 把 [random-direction.ts](../../../../../src/core/rules/random-direction.ts) 中方向表的两个常数改为原版映像中的值（28 的完成证据：`0x17210c` 是略大于 π 的十进制 π，`0x172114` 是 1/180 减一个 ulp），以 f64 位模式写出并注明来源地址；运算次序与精度保持原版（28 的 findings 与 [x87 一节](../../../../original/formats/executable.md#x87-precision-rounding-and-trigonometry-p3-0202)）。更正同一文件中“即原版常数”的注释。
- 新增独立期望：以位模式断言两个常数，并以 28 的独立复算（只用判定与散列，不提交表的数值）核对整张表的散列；更正依赖“每个分量非负”的断言（38 个分量为负）。
- 复核方向表的全部既有读者（[firing.ts](../../../../../src/core/rules/firing.ts)、[flight-control.ts](../../../../../src/core/rules/flight-control.ts)、[parked-travel.ts](../../../../../src/core/rules/parked-travel.ts) 及 area 系统）的测试与 replay 金样：只因表值变化而改变的期望按新表更新并在证据中逐项说明；行为分支变化须先查明原因，不用改期望掩盖。
- 不递增 `RULES_VERSION`：本 goal 的 12 已为 P3-09 递增规则版本，本修复与之同属一次未发布的规则变化；若 12 在本项之后才集成，由 12 覆盖；若 12 已集成，在证据中写明本项与 12 的递增同属一版。

## 不包含

- 原版文档的更正（29 一并写入 executable）。
- `startupRotations` 本身（14）。

## 关键文件与契约

- [random-direction.ts](../../../../../src/core/rules/random-direction.ts) 与其测试；28 的完成证据与 `local/research/p3-09/warp-path/findings.md`（含独立复算 `tools/verify.py`、`tools/verify-v8.mjs`）。

## 写入范围

- `src/core/rules/random-direction.ts`、`src/core/rules/random-direction.test.ts`
- `src/core/rules/firing.test.ts`、`src/core/rules/flight-control.test.ts`、`src/core/rules/parked-travel.test.ts`、`src/core/systems/area.test.ts`
- `src/core/replay/motion-replay.test.ts`、`src/core/replay/combat-replay.test.ts`、`src/core/replay/replay.test-support.ts`
- `local/research/p3-09/direction-table/**`：私有复算输出（被忽略）。

## 验收标准

- [ ] 方向表的两个常数等于原版映像的位模式，整张表的散列与 28 的独立复算一致；仓库中没有原版表的数值。
- [ ] 既有读者的测试与金样已复核：每项改变的期望都只因表值变化，并在证据中说明；没有掩盖的行为分支变化。
- [ ] `pnpm check` 通过。

## 验证方法

- 聚焦：`pnpm exec vitest run src/core/rules src/core/systems/area.test.ts src/core/replay`；然后 `pnpm check`。

## 完成证据
