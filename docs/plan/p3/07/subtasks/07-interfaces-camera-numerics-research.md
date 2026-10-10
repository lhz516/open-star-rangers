---
type: plan
status: active
phase: P3
task: "07"
subtask: "07"
updated: 2026-10-09
---

# 07 — 接口、相机与数值研究；原版文档落地

**契约来源：** [spec](../spec.md) 的 S-11、AC-15；[原版研究](../spec.md#原版研究) Q-11、Q-12；[与其他任务的接口](../spec.md#与其他任务的接口)、[数值、随机数与逻辑视点](../spec.md#数值随机数与逻辑视点)。
**依赖：** 01, 02, 03, 04, 05, 06。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **Q-11 相机：** 相机位置 `0x1b075c` 的写入者；视角模式 0xC、被毁视角（0x11，子模式 8）与 Warp 时的值；更新所在的阶段（例如 `0x21584` 在派发器之后，规则读到的是否是上一帧的值）；`0x2443c` 与 `0x2409c` 的相机读取在所选任务中是否影响 Core 状态（结合 06）。
- **Q-11 接口：** `0x3c208`、`0x3c0f4`、`0x69e5c` 的作用与归属（P3-10、P3-11 或 P3-13）；玩家损失、能量耗尽与逃生舱到期在本帧与下一次 `0x3266c` 中的消费次序（据此定具名待处理状态）；结合 01 的结论，判定目标与雷达是否需要 `0x2ede0` 的两个对象集合，需要时分析其成员规则。
- **Q-12 汇总：** 汇总 01 至 06 与本项各路径的存储类型、i32/u32 语义、整数除法、带偏置的带符号右移、溢出的可达性、开方与三角/反三角函数的来源（FSIN/FCOS、库例程 `0x7558a`）以及 rand 低字节的使用；更新 executable 的 x87 一节与 U-009。
- **文档落地：** 把 01 至 06 的 `findings.md` 与本项结论写入 `docs/original/`，事实只写一处，其他文档链接过去：
  - executable：各 Q 的新节与 x87 一节；
  - craft：字段用途、碰撞形状与 DEBRIS；
  - scenario：难度路径 1 与 6；
  - hud：左显示屏页面与满刻度；
  - textures：EXPL/ANIM 的生命周期；
  - mesh：第 1 列表的部件元数据。
  更新 U-008、U-009、U-022、U-027；在 U-011、U-031 中记录交 P3-05、P3-11 的发现（负责阶段不改）。合并时核对各 findings 之间是否一致；有冲突的事实回到相应的私有研究副本核实，不择一写入。
- **交 08 的汇总：** 把 01 至 07 的结论整理为 D-01、D-03 的输入：每个共享字段的名称、类型、单位、范围、所有者、初始化、更新与重置、序列化；事件与待处理状态；阶段责任与直接创建的例外；逻辑视点的来源与时序；与 spec 已批准方向一致或冲突之处。只写在完成证据中（中文，不含原版内容）。

## 不包含

- 共享契约的定稿与批准（08）；实现（11 起）。
- 相机与视角的绘制（P3-12）；任务流程（P3-11）。
- 01 至 06 的研究本身。合并时只核实冲突，不重做研究。

## 关键文件与契约

- 起点：[x87 精度、舍入与三角函数](../../../../original/formats/executable.md#x87-precision-rounding-and-trigonometry-p3-0202)、[自动视角](../../../../original/formats/executable.md#automatic-views-and-cameras-p3-0109)、[帧流水线](../../../../original/formats/executable.md#frame-pipeline-p3-0201)、[unknowns](../../../../original/unknowns.md)（U-009）。
- 01 至 06 的 `local/research/p3-07/<主题>/findings.md`。
- 计划新增：`local/research/p3-07/interfaces/` 下的 Ghidra 脚本、输出与私有只读项目副本（被忽略）。

## 写入范围

- `docs/original/formats/executable.md`：Q-01 至 Q-12 的代码事实（新节与 x87 一节）。
- `docs/original/formats/craft.md`：机型记录、碰撞形状与 DEBRIS 的字段用途。
- `docs/original/formats/scenario.md`：难度路径 1 与 6 的核实。
- `docs/original/formats/hud.md`：左显示屏页面与资源满刻度。
- `docs/original/formats/textures.md`：EXPL/ANIM 的生命周期规则。
- `docs/original/formats/mesh.md`：第 1 列表部件的元数据用途。
- `docs/original/formats/audio.md`：02、04 发现的呈现项更正（11381 的投递条件、slot 2 的作弊例外、slot 3/4 的受击标志含义）。
- `docs/original/unknowns.md`：U-008、U-009、U-022、U-027 与 U-011、U-031 的交接记录（负责阶段不改）。
- `local/research/p3-07/interfaces/**`：Ghidra 脚本、输出与私有项目副本（被忽略）。

## 验收标准

- [ ] Q-11 达到门槛（已确认，代码）：相机的写入者、各视角模式的值与更新阶段；相机读取对 Core 状态的影响；三个调用的作用与归属；跨帧消费次序；`object-sets` 的依赖（需要时含成员规则）。
- [ ] Q-12 达到门槛（已确认，代码）：各路径的数值语义已汇总；U-009 已更新，舍入方向仍沿用 P3-02 的决定。
- [ ] 完成证据给出 D-01、D-03 的完整输入汇总，并列出与 spec 方向冲突、需要 08 修订 P3-07 spec 的事项。
- [ ] 01 至 07 的事实已写入上列 `docs/original/` 文档，每个事实只写一处，带置信度与证据；各 findings 之间没有未解决的冲突。
- [ ] U-008、U-009、U-022、U-027 已更新，U-011、U-031 的发现已交接；仓库中没有原版内容、反编译输出或读数。

## 验证方法

- Ghidra 以 `-noanalysis -readOnly` 在私有副本上运行；相机写入者以 32 位值与相对调用的原始扫描核对。
- 文档的链接与元数据检查；git 审阅。
- 达不到门槛时按 spec 记为阻塞。

## 完成证据
