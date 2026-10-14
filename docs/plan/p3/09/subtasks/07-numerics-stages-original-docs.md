---
type: plan
status: active
phase: P3
task: "09"
subtask: "07"
updated: 2026-10-14
---

# 07 — 数值与阶段汇总，写入原版文档

**契约来源：** [spec](../spec.md) 的 S-11、AC-14；Q-11、Q-12；[数值、随机数与阶段](../spec.md#数值随机数与阶段)。
**依赖：** 01, 02, 03, 04, 05, 06。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **Q-11：** 汇总 01 至 06 路径的存储类型、浮点转整数、舍入、i32 溢出的可达性与 rand 的使用；与 [x87 一节](../../../../original/formats/executable.md#x87-precision-rounding-and-trigonometry-p3-0202)的既有决定比较，新矛盾单列为 U-009 的发现。
- **Q-12：** 把地图与 Warp 消息、`0x2ede0`、`0x2bf08`、`0x50508`/`0x50a28`、`0x2b8ec` 的位置对照[帧流水线](../../../../original/formats/executable.md#frame-pipeline-p3-0201)映射到 Core 的 19 阶段，写明 completion 消费前一次 frame-end 进度的边界与选择读取的图标列表的帧。
- 把 01 至 06 的 findings 与上述汇总写入跟踪的原版文档：executable（新节，英文）、craft、cockpit、hud（英文），[B-001](../../../../original/behavior/B-001-strategic-map.md) 的事实性更新（中文），带置信度与证据；更新 [unknowns](../../../../original/unknowns.md) 的 U-007、U-009、U-010、U-025、U-026、U-029（负责阶段不改）。
- 完成证据给出交 08 的汇总：每项状态/事件/原因码/阶段的原版依据，以及与 spec 方向冲突之处（冲突须先修订 spec，不在实现中临时改变）。

## 不包含

- 运行时证据（09、24）与新 B 文档（10、25）。
- 实现与修改 spec。

## 关键文件与契约

- [executable](../../../../original/formats/executable.md)、[craft](../../../../original/formats/craft.md)、[cockpit](../../../../original/formats/cockpit.md)、[hud](../../../../original/formats/hud.md)、[B-001](../../../../original/behavior/B-001-strategic-map.md)、[unknowns](../../../../original/unknowns.md)。
- 01 至 06 的 `local/research/p3-09/*/findings.md`。

## 写入范围

- `docs/original/formats/executable.md`：新增地图与 Warp 的事实节。
- `docs/original/formats/craft.md`：Warp 用途的字段角色。
- `docs/original/formats/cockpit.md`：地图仪表记录的字段。
- `docs/original/formats/hud.md`：地图与 Warp 页读数的规则来源。
- `docs/original/behavior/B-001-strategic-map.md`：事实性更新。
- `docs/original/unknowns.md`：受影响 U 项。
- `docs/original/formats/scenario.md`：难度路径 7 的更正与记录 +0x7C 行（协调者 2026-10-14 批准的范围扩展）。
- `docs/original/input/key-map.md`：通讯物件列表菜单对 `m`、`w` 的占用（同上）。
- `docs/original/formats/audio.md`：Warp 到达音效与开始拒绝的说明（同上）。
- `local/research/p3-09/numerics/**`：汇总脚本与输出（被忽略）。

## 验收标准

- [ ] Q-11、Q-12 达到门槛（已确认，代码）；Core 阶段映射写明 completion 与 frame-end 的边界。
- [ ] 01 至 06 的事实已写入跟踪的原版文档，带置信度与证据；受影响 U 项已更新，负责阶段未改。
- [ ] 交 08 的汇总列出每项契约的依据与冲突。
- [ ] 改动的文档 `updated:` 与链接有效；`pnpm check:compliance` 通过；仓库中没有原版内容、反编译输出或读数。

## 验证方法

- 链接与锚点核对；`pnpm check:compliance`；git 审阅。

## 完成证据
