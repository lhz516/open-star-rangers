---
type: plan
status: active
phase: P2
task: "07"
subtask: "11"
updated: 2026-10-06
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

- [x] AC-18：hud 以 M2ID 机型槽位为键，为所选任务引用的每个机型记录图标序号、证据与置信度，或记为未确认并写明检查方法。
- [x] 源码搜索确认规范内容中没有机型到图标的查找表。
- [x] 文档中没有原版字节、像素、颜色值或反编译输出。

## 验证方法

- 本地研究脚本；证据只记命令、文件名、计数与判定。
- 文档审阅与 `src/` 的源码搜索。

## 完成证据

- **结论：** [hud 的 R8 一节](../../../../original/formats/hud.md#zoom-window-icons-by-craft-type-r8)。所选任务（SCCT group 0 / slot 1，SCEN 3019）引用 M2ID 槽位 0、7、8、14、17，加上僚机名单的槽位 1，与 P2-09 的机型绑定一致。每个槽位的放大窗口图标都是序号相同的 11401 记录，置信度为已确认（EXE 规则）。记录 7、14、17 在截图中精确匹配，0、1、8 未出现。
- **EXE（只读，指令层）：** 战略地图绘制函数 `0x49f8c` 为每个单位读取运行时类型（单个位）。它计算该位的序号，写入 10461 标记序号与 11401 图标序号，并用友方加玩家掩码判定阵营。单位循环中被调用的辅助函数只做 FPU 取整，不影响类型寄存器。地图状态引用的一个对象改用 10461 记录 28，其 11401 序号不变。类型位序号即 M2ID 槽位，已由 executable 与 scenario 记录为已确认（`0x65ca4`）。本地输出在 `local/research/p2-07/ghidra/`（`unit-loop.lst`、`unit-loop2.lst`、`chop.lst`）。
- **源码搜索：** `src/` 中搜索 `11401`、`zoom-icon`、`craft-icon`、`icon`（不区分大小写）都没有匹配，规范内容中没有机型到图标的查找表。
- **rubber-duck：** 没有阻塞问题。一项非阻塞问题已采纳：位序号等于 M2ID 槽位只适用于有模型的机型类型，运行时类型 22、24、25 不在 M2ID 表内，hud 与 U-030 已据此收窄措辞。
- **文档影响：** 原版事实写入 hud 与 U-030。spec、源码结构与指南不受影响：本子任务没有改代码，也没有改契约。STATUS 不变。
- **检查：** 链接与锚点检查通过；`node tools/task-state.ts p2/07` 通过；文档中没有原版字节、像素、颜色值、原版文字或反编译输出（地址与函数作用除外）。
