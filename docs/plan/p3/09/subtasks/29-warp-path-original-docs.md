---
type: plan
status: active
phase: P3
task: "09"
subtask: "29"
updated: 2026-10-14
---

# 29 — 把 R-A、R-B 写入原版文档

**契约来源：** [spec](../spec.md) 的 S-11、AC-14；MW-12 的前置研究 R-A、R-B（[P3-02 的 P3-09 契约修订](../../02/spec.md#p3-09-的契约修订d-01)）。
**依赖：** 28。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 把 28 的 findings 写入 [executable](../../../../original/formats/executable.md) 的 P3-09 Warp 节（英文），带置信度与证据；更新 [unknowns](../../../../original/unknowns.md) 中受影响的 U 项（负责阶段不改）。
- 一并写入 28 的更正：方向表的两个常数来自映像 `0x17210c`、`0x172114`（不是 `Math.PI` 与 1/180），更正 executable 中“每个分量非负”的表述；06 的“每点 z +2000”按 R-B 更正。
- 一并写入 17、18 在实现中读到的事实（goal 执行记录“18 已集成”一条）：`0x186b3c` = F(S × 0.5)；`0x3a61c` 乘 F(1/S) 的扇区边界；K = F(cos(f64 `0x171f14`)) 与 sin K；`0x50068` 的 f32 存储与 L = F(f × F(A8))；`steering.ts` 所用常数 `0x17232c`、`0x172334`（30 的观察）。
- R-A 判定为“播种之后”时，确认 MW-12 的差异 6 适用；判定为“播种之前”时，在完成证据中写明差异 6 不适用，交 26 在交接中注明（不改 spec 的已批准差异清单之外的内容）。

## 不包含

- 研究本身（28）与实现。

## 关键文件与契约

- 28 的完成证据与 `local/research/p3-09/warp-path/findings.md`。

## 写入范围

- `docs/original/formats/executable.md`：R-A、R-B 的事实。
- `docs/original/unknowns.md`：受影响 U 项。

## 验收标准

- [ ] R-A、R-B 的事实已写入 executable，带置信度与证据；受影响 U 项已更新，负责阶段未改。
- [ ] 改动的文档 `updated:` 与链接有效；`pnpm check:compliance` 通过；仓库中没有原版内容、反编译输出或读数。

## 验证方法

- 链接与锚点核对；`pnpm check:compliance`；git 审阅。

## 完成证据
