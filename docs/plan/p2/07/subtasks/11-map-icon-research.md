---
type: plan
status: active
phase: P2
task: "07"
subtask: "11"
updated: 2026-10-05
---

# 11 — 地图图标对应研究（R8）

**契约来源：** [spec](../spec.md) 的 S-05 中 R8；[研究与入选门槛](../spec.md#研究与入选门槛)中 R8 一行；技术决定 7；AC-18。
**依赖：** 06。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **对象：** 所选任务（SCCT group 0 / slot 1）引用的各机型，以 M2ID 机型槽位为键；机型集合取自 P2-09 已落地的 [craft-binding.ts](../../../../../src/original-data/conversion/craft-binding.ts) 与 [scenario](../../../../original/formats/scenario.md) 的记录，不另建机型身份。
- **对应：** 在放大窗口的截图中定位机型图标（11401 的机型图标区间，经 06 的 `records/<i>` 读取与 `expandImage` 展开），按 spec 的像素比较与置信度规则，为每个机型记录图标序号（完整列表内序号）、证据与置信度；没有截图证据的记为未确认，并写明检查方法（例如需要哪种单位进入放大窗口的截图）。可辅以只读 EXE 分析，只记地址与作用。
- **记录：** 写入 [hud](../../../../original/formats/hud.md)；规范内容中不新增机型到图标的查找表。
- **方法：** 脚本与输出在 `local/research/p2-07/`。

## 不包含

- 图标族是否入选与其转换选择：归 [09](./09-hud-family-research.md)。
- 规范的图标查找表与地图绘制规则：归 P3（技术决定 7）。

## 关键文件与契约

- **修改：** [hud.md](../../../../original/formats/hud.md)；必要时 [unknowns.md](../../../../original/unknowns.md)。
- **计划新增（不提交）：** `local/research/p2-07/` 下的研究脚本与输出。
- **本地数据：** `SR.NOB`、`local/StarRang/captures/`；只读 EXE 分析时用 `local/ghidra/srangers.gpr`。

## 验收标准

- [ ] AC-18：hud 以 M2ID 机型槽位为键，为所选任务引用的每个机型记录图标序号、证据与置信度，或记为未确认并写明检查方法。
- [ ] 源码搜索确认规范内容中没有机型到图标的查找表。
- [ ] 文档中没有原版字节、像素、颜色值或反编译输出。

## 验证方法

- 本地研究脚本；证据只记命令、文件名、计数与判定。
- 文档审阅与 `src/` 的源码搜索。

## 完成证据
