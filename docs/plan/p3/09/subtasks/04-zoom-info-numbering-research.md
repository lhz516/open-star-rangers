---
type: plan
status: active
phase: P3
task: "09"
subtask: "04"
updated: 2026-10-14
---

# 04 — 放大窗口、信息小窗与编号研究

**契约来源：** [spec](../spec.md) 的 S-11、AC-14；Q-05；[地图 projection](../spec.md#地图-projection)、[技术决定](../spec.md#技术决定) 3。
**依赖：** 无。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **Q-05：** `0x4c5ec` 的放大窗口成员判定；`0x4ba80` 信息小窗的单位、确定顺序、每行字段、容量与截断；选择点对多个图标的选中方框判定；`0x4b98c` 的编号来源。
- `0x18649c`（右键编号开关）与 `0x1864c4` 的全部读者：确认是否只用于绘制；若有规则读者，写明对命中或其他规则的影响，供 08 决定 Core 命令与状态。
- `0x4afc0`–`0x4b360` 的友方编组标签、玩家到所选目标的连线、所选目标周围范围所需的数据；目标不满足地图谓词时连线与标签的处理。
- 几何之外，地图规则与 projection 还需要从仪表记录（CCKD 10103 布局 6 的 10 型记录）读取的字段，交 08/11 定 payload 的最小字段。
- 事实写入 `local/research/p3-09/zoom-info/findings.md`：英文，按目标文档与节写成可直接并入的草稿，带置信度（Confirmed/Likely/Unconfirmed）与证据，只记地址、结构与行为，不含原版内容或反编译输出；受影响 U 项的状态变化一并列出。由 07 统一写入 `docs/original/`；本项不改跟踪的原版文档，使 01 至 06 可以并行。
- 完成证据给出交 07/08 的摘要：所需状态字段、原因码与结果候选、阶段位置，以及与 spec 已批准方向一致或冲突之处。

## 不包含

- 地图画面的绘制与右键输入（P3-13）。
- 实现（12 起）与修改任何 spec（08、10）。
- 把 findings 写入跟踪的原版文档（07）。

## 关键文件与契约

- [hud](../../../../original/formats/hud.md)、[cockpit 的仪表类型](../../../../original/formats/cockpit.md#instrument-types-per-slot-confirmed-p3-0730)、[HUD 与地图文字](../../../../original/formats/executable.md#hud-map-and-communications-text-from-the-exe-p3-0324)、[B-001 的交互](../../../../original/behavior/B-001-strategic-map.md#交互已确认)。
- 计划新增：`local/research/p3-09/zoom-info/**`（被忽略）。

## 写入范围

- `local/research/p3-09/zoom-info/**`：脚本、输出、私有项目副本与 findings 草稿（被忽略）。

## 验收标准

- [ ] Q-05 达到门槛（已确认，代码）：放大窗口成员、信息行顺序/字段/容量、多选框、编号来源、标签与连线都有依据。
- [ ] 编号开关的读者已穷举并判定是否只用于绘制。
- [ ] 仪表记录中规则所需的最小字段已列出，并标明单位与含末像素约定。
- [ ] findings 注明目标文档与节、置信度与证据；仓库中没有原版内容、反编译输出或读数。

## 验证方法

- Ghidra 以 `-noanalysis -readOnly` 在私有副本上运行；寄存器相关的步骤按原生指令读取；调用者与读写者以相对调用、32 位值与原始位移扫描核对。
- git 审阅确认除自己的 subtask 文档外没有改动跟踪文件，且无原版内容。

## 完成证据
