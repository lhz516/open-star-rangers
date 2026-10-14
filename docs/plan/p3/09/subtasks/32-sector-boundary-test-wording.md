---
type: plan
status: active
phase: P3
task: "09"
subtask: "32"
updated: 2026-10-14
---

# 32 — 扇区边界测试的说法更正（修复）

**契约来源：** [spec](../spec.md) 的 S-09、AC-09；P3-02 MW-08（扇区拉近，`0x3a61c` 乘 F(1/S)）；goal 执行记录“29 已集成”中对“18 已集成”一条的更正。
**依赖：** 29。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- [warp-arrival.test.ts](../../../../../src/core/rules/warp-arrival.test.ts) 约第 31–32 行的测试名与注释说 x = 15000、30000 因 F(1/15000) “少落一个扇区”（乘积 0.99999999747…）。实际 F(1/15000) 略大于 1/15000，乘积约 1.0000000111，落在从该点开始的扇区，与精确除法相同（29 在原生指令上复核）。更正测试名与注释；若能以 `sectorCorner` 的可观察结果区分两种映射，补一条区分断言，否则在注释中写明该边界两种映射给出同一角点、规则行为不受影响。
- 核对 [warp-arrival.ts](../../../../../src/core/rules/warp-arrival.ts) 中 `PER_SECTOR`、`sectorIndex` 附近的注释没有同样的错误说法，有则一并更正。不改行为。

## 不包含

- 规则行为的改动。

## 关键文件与契约

- 29 的完成证据；[executable](../../../../original/formats/executable.md) 中 29 写入的扇区说明。

## 写入范围

- `src/core/rules/warp-arrival.test.ts`
- `src/core/rules/warp-arrival.ts`：只改注释。

## 验收标准

- [x] 测试名与注释与原生事实一致，没有行为改动；`pnpm check` 通过。

## 验证方法

- `pnpm exec vitest run src/core/rules/warp-arrival.test.ts`；`pnpm check`；git 审阅。

## 完成证据

- [warp-arrival.test.ts](../../../../../src/core/rules/warp-arrival.test.ts) 的测试名改为“F(1 ÷ 15000) 仍把 15000、30000 放在从该点开始的扇区”，注释改为 15000 × F(1/15000) = 1.0000000111… → 扇区 1，30000 → 2.0000000222… → 扇区 2，与精确除法相同（Node 中复算 `Math.fround(1/15000) > 1/15000` 为真）。未补区分断言：边界点在两种映射下的角点都是该边界（x 用 ≥、y 用 >，扇区 1 的下角与扇区 0 的上角同为 15000，y = 30000 同理），`sectorCorner` 及只经它取角点的 `arrivalPoint` 都无法区分，注释写明了这一点。断言与行为未改。
- [warp-arrival.ts](../../../../../src/core/rules/warp-arrival.ts) 的 `PER_SECTOR`、`sectorIndex` 注释只写 trunc(x × (1 ÷ S)) 与 f32 倒数，没有“前一扇区”的说法，未改。
- `pnpm exec vitest run src/core/rules/warp-arrival.test.ts`：24 项通过；`pnpm check` 通过。
- rubber-duck：无问题（核对了算术与两种映射的角点相同）。纯注释改动，不需要 simplify。
- 文档影响：executable 中的扇区说明已由 29 更正，其他文档无需更新。
