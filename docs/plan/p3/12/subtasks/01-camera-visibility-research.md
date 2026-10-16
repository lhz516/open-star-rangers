---
type: plan
status: active
phase: P3
task: "12"
subtask: "01"
updated: 2026-10-15
---

# 01 — 相机、视口与可见性研究

**契约来源：** [spec](../spec.md) 的 S-03、S-13、AC-05、AC-06、AC-18；[原版研究](../spec.md#原版研究) Q-01、Q-10、Q-13；[相机、投影与视口](../spec.md#相机投影与视口)、[被毁视角](../spec.md#被毁视角)。
**依赖：** 无。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **Q-01：** 视角 0xC、1 与 0x11/8 在 HI 下的视口矩形（`0x3d324`、`0x175200`）；三维设备的视场、投影中心与像素取整；近远裁剪；RENS +0x1C/+0x20/+0x24 经 `0x3d0b0`、`0x3df90`、`0x3e0cc` 写入 `0x175210` 的含义。结论须达到已确认（影响视野与可见性）。
- **Q-10：** `0x3d9f8` 对玩家模型的加入与移除；交接项 4 (2, 5) 是否隐藏玩家模型；构造、视角转换与首次回调在一个派发器 pass 内的相机与位姿取样时刻；非玩家 Warp-out、活动/停放切换、pending-removal、救援复位时的可见集合；跟随点失效与退化方向（叉积为零、相机与跟随点重合）的分支。
- **Q-13：** 坐标手性（X5 门禁投影的 x 右、y 上、z 前与三维设备帧是否一致）、正面绕序与背面剔除。
- **交 09 的摘要：** D-01 的“当前观察状态”“视角进入与源模型交接”“爆炸构造事实”“活动区域”各需要哪些字段、在 Core 的哪个写入点取样；不需要的字段附可推导性的证据。
- 结论写入 `local/research/p3-12/camera/findings.md`：英文，按目标文档与节写成可直接并入的草稿，每条带置信度与证据（函数地址、结构、计数），不含原版内容、反编译输出或读数原值；受影响的 U 项变化一并列出。由 08 统一写入 `docs/original/`，本项不改跟踪的原版文档，使 01 至 06 可以并行。
- Ghidra 以 `-noanalysis -readOnly` 在 `local/research/p3-12/camera/` 中的私有只读副本上运行，不 `-overwrite`；寄存器相关步骤按原生指令读取，调用者以相对调用与 32 位值的原始扫描核对。先复用已有记录与 `local/research/` 中的研究输出，不重做已确认的分析。
- 静态证据达不到 spec 所需结论的项，在完成证据中列出缺口、已尝试的途径与建议的最小补证，交 07 判断；不按猜测写结论。

## 不包含

- 实现（10、14、16）与 D-01 定稿（09）。
- 光照、绘制次序与精灵（02、03）。

## 关键文件与契约

- 起点：[自动视角](../../../../original/formats/executable.md#automatic-views-and-cameras-p3-0109)、[C1](../../../../original/formats/executable.md#c1-the-3d-camera-and-its-readers--confirmed-code)、[X5](../../../../original/formats/executable.md#x5-event-0x10-and-the-discriminator-12-fragments--confirmed-code)、[X7](../../../../original/formats/executable.md#x7-fragment-lifecycle--confirmed-code)、[X9](../../../../original/formats/executable.md#x9-timing-of-directly-created-objects--confirmed-code)。
- 计划新增：`local/research/p3-12/camera/`（被忽略）。

## 写入范围

- `local/research/p3-12/camera/**`：脚本、输出、私有项目副本与 findings 草稿。

## 验收标准

- [ ] Q-01 达到已确认：三种视角的视口、视场、投影中心、取整与近远裁剪，以及 `0x175210` 的含义。
- [ ] Q-10 的分支与取样时刻有原生指令依据；退化方向的处理已确认或明确列为缺口。
- [ ] Q-13 的手性与绕序已确认，或写明在可比证据中不可区分。
- [ ] 交 09 的 D-01 字段摘要已写入完成证据；findings 草稿标注目标文档、节、置信度与证据，没有改动跟踪的原版文档。

## 验证方法

- 对照 spec 的[原版研究](../spec.md#原版研究)逐项核对结论与所需置信度。
- `git status` 确认除本 subtask 文档外没有改动跟踪文件，仓库中没有原版内容、反编译输出或读数。

## 完成证据
