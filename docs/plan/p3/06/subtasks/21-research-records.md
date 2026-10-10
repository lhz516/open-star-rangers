---
type: plan
status: active
phase: P3
task: "06"
subtask: "21"
updated: 2026-10-09
---

# 21 — 研究结论入档

**契约来源：** [spec](../spec.md) 的 S-01、AC-09；[原版研究](../spec.md#原版研究)的 M-01 至 M-10（静态部分）与“U 项”规则。
**依赖：** 01, 02, 03, 04, 05。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

01–05 把结论写在各自被忽略的 `findings.md` 与完成证据中，以便并行；本项是这些原版文档的唯一写入者，把结论一次写入 `docs/original/`：

- **executable（英文）：** 新增飞行运动一节（或按主题分几节），覆盖运动阶段与积分、操纵应用与旋转、键盘操纵、油门与最高速度、匹配与速度辅助、自动驾驶的调用者、世界边界与离开世界、活动区域与停放更新、起飞初态与数值；逐条标注置信度与证据路径，只记地址、类型与作用。
- **craft（英文）：** 运动与速度所用机型字段（+0x88、+0xAC–+0xC8 等）的已确认用途；更新开放问题。
- **scenario（英文）：** 难度读取路径 8 的补充（如 03 有）。
- **键位表（中文）：** 02 确认的飞行键（高概率或已确认），注明证据。
- **unknowns（中文）：** U-001、U-008、U-009、U-011 及受影响 U 项的状态与线索，负责阶段不改；U-021 只补充依赖说明。
- **一致性：** 与现有记录冲突时，写明新旧结论与证据，不静默覆盖；5 份 findings 之间矛盾时，交协调者，由相应研究项复核。
- 不新增 01–05 之外的研究结论。

## 不包含

- 新的原版研究（01–05）；运行时结论（07、17）。
- spec 修订（06、08）。

## 关键文件与契约

- 01–05 的完成证据与 `local/research/p3-06/<主题>/findings.md`。
- [executable](../../../../original/formats/executable.md)、[craft](../../../../original/formats/craft.md)、[scenario](../../../../original/formats/scenario.md)、[键位表](../../../../original/input/key-map.md)、[unknowns](../../../../original/unknowns.md)。

## 写入范围

- `docs/original/formats/executable.md`：飞行运动相关的新节。
- `docs/original/formats/craft.md`：机型字段用途与开放问题。
- `docs/original/formats/scenario.md`：难度读取路径 8 的补充（需要时）。
- `docs/original/input/key-map.md`：确认的飞行键。
- `docs/original/unknowns.md`：受影响 U 项（负责阶段不改）。

## 验收标准

- [ ] AC-09（入档部分）：01–05 的每条结论都写入对应原版文档，带置信度与证据路径；没有遗漏或改写结论的置信度。
- [ ] U-001、U-008、U-009、U-011 及受影响 U 项已更新，负责阶段未改。
- [ ] 仓库中没有原版载荷、常量值、文字、反编译输出或读数；改动文档的 `updated:`、链接与锚点有效。

## 验证方法

- 逐条对照 01–05 的 findings 与入档文本；文档链接与 front matter 检查；`git status` 确认没有跟踪的研究输出。不涉及浏览器。

## 完成证据
