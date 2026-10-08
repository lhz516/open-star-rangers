---
type: plan
status: active
phase: P2
task: "12"
subtask: "24"
updated: 2026-10-07
---

# 24 — 判定回填原版文档

**契约来源：** [spec](../spec.md) 的 S-12、[判定分类](../spec.md#判定分类)；AC-22 的回填部分（判定汇总表在 26）。
**依赖：** 16, 17, 18, 19, 21, 22, 23。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 把 16–23 得到的新事实写入唯一的权威位置，带置信度与适用的候选，不复制原版内容，格式文档用英文：
  - [mesh](../../../../original/formats/mesh.md) §3：全部切片模型（含 M2ID 槽位 8 的敌机与碎片）的对照结论，以及绕序与手性的已知程度；
  - [cockpit](../../../../original/formats/cockpit.md)：最终候选上的布局与透明比较；
  - [hud](../../../../original/formats/hud.md)：二维覆盖结论，以及 U-030 未识别元素是否可能缺少切片必需图形的影响判断（不仅因未找到来源就归 P3）；
  - [audio](../../../../original/formats/audio.md)：查看器播放路径与原版的对照；
  - [scenario](../../../../original/formats/scenario.md)：独立字段对照与 Core 载入核对；
  - [textures](../../../../original/formats/textures.md)：切片 BITM 的朝向（U-019）等有新证据的项。
- 更新 [unknowns](../../../../original/unknowns.md) 中受影响 U 项（U-019、U-027、U-028、U-029、U-030 等）的状态、证据与负责阶段；U-032 已由 19 更新，本项只核对一致。
- 文档只记地址、结构、计数、文件名与判定；更新各文档的 `updated:`。

## 不包含

- 判定汇总表与阶段影响结论（26；阶段退出判定归 P2-13）；地图框架（19 已写）。

## 关键文件与契约

- 16、17、18、21、22、23 的完成证据；[AGENTS.md](../../../../../AGENTS.md) 的“一个事实一处”与置信度要求。

## 写入范围

- `docs/original/formats/mesh.md`：模型对照结论。
- `docs/original/formats/cockpit.md`：布局对照结论。
- `docs/original/formats/hud.md`：二维覆盖与 U-030 影响。
- `docs/original/formats/audio.md`：播放路径对照。
- `docs/original/formats/scenario.md`：字段与载入对照。
- `docs/original/formats/textures.md`：朝向等新证据。
- `docs/original/unknowns.md`：U 项状态。

## 验收标准

- [ ] AC-22（回填）：新事实与 U-030 影响判断写入唯一权威文档，带置信度与候选适用性；受影响 U 项状态已更新。
- [ ] 文档不含原版字节、像素值、颜色值、文字或反编译输出；`pnpm --silent check:original` 通过。
- [ ] `updated:`、相对链接与锚点有效。

## 验证方法

- 文档 diff 审阅、链接与元数据检查、`pnpm --silent check:original`。

## 完成证据
