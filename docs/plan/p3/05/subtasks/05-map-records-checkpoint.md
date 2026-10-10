---
type: plan
status: active
phase: P3
task: "05"
subtask: "05"
updated: 2026-10-10
---

# 05 — 地图研究记录与检查点 K（地图项）定稿

**契约来源：** [spec](../spec.md) 的 S-01、S-11，[执行检查点](../spec.md#执行检查点)（放行粒度、规则 4、定稿与记录、授权的边界），[战略地图输入](../spec.md#战略地图输入)的“初始位置”与“命令顺序”；AC-01、AC-02（地图项）、AC-12 的具体输入。
**依赖：** 03。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **事实入库：** 把 03 的结论写入[键位表](../../../../original/input/key-map.md)的地图鼠标部分与 [executable](../../../../original/formats/executable.md#strategic-map-projection)（代码地标与结构），必要时修正 [B-001](../../../../original/behavior/B-001-strategic-map.md) 中被代码证据推翻或补足的观察，并更新 [unknowns](../../../../original/unknowns.md) 的相关项；每条带置信度与证据，不复制读数或反编译。
- **K 地图定稿：** 按规则 4，只依据 Q-03 的合格证据，在 spec 中定稿打开地图时的初始位置（是否沿用上次）、左键生效时机，以及其他由证据决定的地图输入细节；同步修订[战略地图输入](../spec.md#战略地图输入)与 AC-12 的具体输入，不降低通过条件。
- **定稿记录：** 在 spec 的审批节追加一条“检查点 K（地图）定稿”记录：日期、证据来源（文档锚点）、覆盖的 S/AC（S-11、AC-02、AC-12）、理由、尚未放行的项。不新增 S/AC 编号（否则 goal 覆盖失效），不改 front matter 的 status，不代批其他 spec。
- **证据不足：** 若 03 把某项记为阻塞，本项只定稿已有证据的部分并记录未放行项；初始位置或左键时机仍缺证据时，本项记为 blocked，恢复条件为取得 Q-03 的合格证据，不采用“中心、按下生效”。
- 更新改动文档的 `updated:`。

## 不包含

- 键盘项的 K 定稿（08）；地图输入的实现与接通（22、26）；P3-09、P3-13 的规则、几何与外观。
- 超出[授权的边界](../spec.md#执行检查点)的修订（总计划、ADR、放宽验收、扩大范围、其他 spec 的批准）：遇到时本项记为 blocked 并交用户决定。

## 关键文件与契约

- [spec](../spec.md)：执行检查点、战略地图输入、AC-12、审批。
- [key-map.md](../../../../original/input/key-map.md)、[executable.md](../../../../original/formats/executable.md)、[B-001](../../../../original/behavior/B-001-strategic-map.md)、[unknowns.md](../../../../original/unknowns.md)。

## 写入范围

- `docs/original/input/key-map.md`：地图鼠标事实。
- `docs/original/formats/executable.md`：地图鼠标代码地标。
- `docs/original/behavior/B-001-strategic-map.md`：被代码证据修正的观察。
- `docs/original/unknowns.md`：相关未知项。
- `docs/plan/p3/05/spec.md`：K 地图定稿与记录。

## 验收标准

- [ ] Q-03 的事实已入库，带置信度与证据；`pnpm check:compliance` 通过。
- [ ] spec 中的初始位置与左键时机只来自合格证据；定稿记录写明来源、覆盖 ID、理由与未放行项。
- [ ] 没有新增 S/AC 编号，`node tools/task-state.ts p3/05` 没有报告 goal 覆盖失效。
- [ ] 证据不足的项未被默认值定稿，阻塞与恢复条件已记录。

## 验证方法

- 定稿记录逐项对照 03 的摘要与入库事实；`pnpm check:compliance`；`node tools/task-state.ts p3/05`；改动文档的链接与锚点检查。
- 协调者在 22、26 使用这些值之前提交本项（AC-02 的提交顺序）。

## 完成证据
