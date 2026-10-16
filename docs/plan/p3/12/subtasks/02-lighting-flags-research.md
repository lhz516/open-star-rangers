---
type: plan
status: active
phase: P3
task: "12"
subtask: "02"
updated: 2026-10-15
---

# 02 — 光照、明暗级与部件标志研究

**契约来源：** [spec](../spec.md) 的 S-04、S-13、AC-07、AC-18；Q-02、Q-12；[模型、光照与第 2 列表](../spec.md#模型光照与第-2-列表)。
**依赖：** 无。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **Q-02（U-028）：** 两盏灯（`0x7b074` 的类型 3 与 0）的方向、所属的帧与颜色所乘的常量；材质与颜色梯度的级数、端点、镜面项与梯度表满时的回退；平面或逐顶点着色，是否抖动；设备字节 RENS +0x18 经 vtable +0x34 的含义；贴图的放大、缩小、mip 与环绕。结论：算法结构达到已确认，外观高概率。
- **Q-12（U-027）：** 部件标志 1、2、3 在 `0x3d904`、`0x3e590`、`0x6a7b4` 等模型视觉的创建与绘制中是否改变绘制；没有读取者时以有界搜索确认。
- 给 17 的实现输入：从源调色板索引与源色到 DATA 索引的完整计算步骤（含 `nearestColourMap` 在哪一步复用），以及可用于 Node 测试的独立期望构造方法。
- 结论写入 `local/research/p3-12/lighting/findings.md`：英文，按目标文档与节写成可直接并入的草稿，每条带置信度与证据（函数地址、结构、计数），不含原版内容、反编译输出或读数原值；受影响的 U 项变化一并列出。由 08 统一写入 `docs/original/`，本项不改跟踪的原版文档，使 01 至 06 可以并行。
- Ghidra 以 `-noanalysis -readOnly` 在 `local/research/p3-12/lighting/` 中的私有只读副本上运行，不 `-overwrite`；寄存器相关步骤按原生指令读取，调用者以相对调用与 32 位值的原始扫描核对。先复用已有记录与 `local/research/` 中的研究输出，不重做已确认的分析。
- 静态证据达不到 spec 所需结论的项，在完成证据中列出缺口、已尝试的途径与建议的最小补证，交 07 判断；不按猜测写结论。

## 不包含

- 实现（17）。
- 屏幕闪光的调色板变换（04）。

## 关键文件与契约

- 起点：[最近色](../../../../original/formats/executable.md#native-tex-preparation-and-nearest-colour-search)、[textures §3](../../../../original/formats/textures.md#nearest-colour-metric-and-tie-rule-confirmed)、[RENS 头部](../../../../original/formats/executable.md#flight-message-strings-and-the-rens-header-p3-0304)、[mesh §2](../../../../original/formats/mesh.md#2-modl-structure-confirmed-on-all-19-entries)。
- 项目实现：[expand-image.ts](../../../../../src/content/graphics/expand-image.ts) 的 `nearestColourMap`。
- 计划新增：`local/research/p3-12/lighting/`（被忽略）。

## 写入范围

- `local/research/p3-12/lighting/**`：脚本、输出、私有项目副本与 findings 草稿。

## 验收标准

- [ ] Q-02 的灯光、梯度、着色、设备字节与贴图采样的算法结构达到已确认；外观项标注依据与置信度。
- [ ] Q-12 已确认各标志值是否改变绘制，或确认没有读取者。
- [ ] 给 17 的计算步骤与独立期望构造方法已写入完成证据；没有改动跟踪的原版文档。

## 验证方法

- 对照 spec 的[原版研究](../spec.md#原版研究)逐项核对结论与所需置信度。
- `git status` 确认除本 subtask 文档外没有改动跟踪文件，仓库中没有原版内容、反编译输出或读数。

## 完成证据
