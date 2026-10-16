---
type: plan
status: active
phase: P3
task: "12"
subtask: "08"
updated: 2026-10-15
---

# 08 — 原版记录与对照方案冻结

**契约来源：** [spec](../spec.md) 的 S-13、AC-18、AC-19（判据部分）；[原版研究](../spec.md#原版研究)、[表现对照与判定](../spec.md#表现对照与判定)。
**依赖：** 01, 02, 03, 04, 05, 06, 07。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 把 01 至 07 的 findings 写入 [executable](../../../../original/formats/executable.md)、[textures](../../../../original/formats/textures.md)、[mesh](../../../../original/formats/mesh.md) 与相关行为文档（B-001、B-005、B-009），标注置信度与证据；更新 [unknowns](../../../../original/unknowns.md) 中 U-018、U-027、U-028 的状态，不改负责阶段。原版事实只写在 `docs/original/`。
- 核对影响视野与可见性的结论（Q-01、Q-03 的遮挡、Q-10）为已确认；不是的，交协调者把依赖它的子任务记为 blocked。
- **冻结对照方案：** 在看到任何新版画面之前，为 V-01 至 V-03 的每个必判项写定原版画面来源与身份、可比状态、控制样本、坐标与颜色空间、遮挡排除规则、有效样本要求、容差及其理由，写入 `local/research/p3-12/comparison-plan/plan.md`，并在完成证据中给出摘要与文件指纹。整数、索引、掩码与已确认的色值要求精确；浮点与投影的误差由已知的 f32 舍入、取整与捕获分辨率推导。
- 列出 P2 的 13 项范围例外与 9 项高概率项各自的复核途径。

## 不包含

- 新的原版研究（交回 01 至 07 或新增子任务）。
- 新版画面与判定（26、27）。

## 关键文件与契约

- 01 至 07 的 findings 草稿；[P2 退出评审](../../../../reviews/P2-exit.md#第一项资源与原版本地截图对照)。

## 写入范围

- `docs/original/**`：原版事实与 U 项。
- `local/research/p3-12/comparison-plan/**`：冻结的对照方案。

## 验收标准

- [ ] AC-18：Q-01 至 Q-13 的结论已写入原版文档，每条带置信度与来源；U-018、U-027、U-028 已更新；影响视野与可见性的结论为已确认或相应子任务已 blocked。
- [ ] 对照方案在任何新版画面之前冻结，摘要与指纹在完成证据中。
- [ ] 改动文档的 `updated:`、链接与锚点有效；仓库中没有原版内容、截图或反编译输出（`pnpm check:compliance`）。

## 验证方法

- 文档审阅与链接检查；`pnpm check:compliance`。
- 对照 01 至 07 的 findings 核对没有遗漏或改写置信度。

## 完成证据
