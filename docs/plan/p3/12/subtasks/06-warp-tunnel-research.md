---
type: plan
status: active
phase: P3
task: "12"
subtask: "06"
updated: 2026-10-15
---

# 06 — Warp 隧道效果研究

**契约来源：** [spec](../spec.md) 的 S-11、S-13、AC-15、AC-18；Q-11；[Warp 隧道效果](../spec.md#warp-隧道效果)。
**依赖：** 无。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **Q-11：** 效果例程 `0x505cc` 的几何、颜色或贴图、与路径求值 `0x513e0` 的关系、Warp 开始时与每帧的表现抽取、绘制次序；视角 1 中的世界绘制。
- 读 P3-09 在其分支（候选 `17e507c8`）上写入 executable 的 Warp 研究（隧道路径、进度、`RenderWarp` 字段）作为起点，用 `git show` 读取，不改该分支。用截图 066 与参考视频核对外观。
- 给 22 的输入：效果状态如何由 `RenderWarp` 的序号、进度、n、u、L 与 15 个控制点推出，以及哪些部分按 pass 推进。
- 结论写入 `local/research/p3-12/warp-tunnel/findings.md`：英文，按目标文档与节写成可直接并入的草稿，每条带置信度与证据（函数地址、结构、计数），不含原版内容、反编译输出或读数原值；受影响的 U 项变化一并列出。由 08 统一写入 `docs/original/`，本项不改跟踪的原版文档，使 01 至 06 可以并行。
- Ghidra 以 `-noanalysis -readOnly` 在 `local/research/p3-12/warp-tunnel/` 中的私有只读副本上运行，不 `-overwrite`；寄存器相关步骤按原生指令读取，调用者以相对调用与 32 位值的原始扫描核对。先复用已有记录与 `local/research/` 中的研究输出，不重做已确认的分析。
- 静态证据达不到 spec 所需结论的项，在完成证据中列出缺口、已尝试的途径与建议的最小补证，交 07 判断；不按猜测写结论。

## 不包含

- 实现（22）。
- Warp 规则与 Warp 中的玩家位姿（P3-09）。

## 关键文件与契约

- 起点：[B-001 Warp 时的视角](../../../../original/behavior/B-001-strategic-map.md#warp-时的视角p3-0109)；P3-09 分支的 executable “Start-up rotations and the Warp tunnel path”。
- 计划新增：`local/research/p3-12/warp-tunnel/`（被忽略）。

## 写入范围

- `local/research/p3-12/warp-tunnel/**`：脚本、输出、私有项目副本与 findings 草稿。

## 验收标准

- [ ] Q-11 达到已确认（代码），外观标注置信度与依据。
- [ ] 给 22 的推导与按 pass 推进的部分已写入完成证据；没有改动跟踪的原版文档或 P3-09 分支。

## 验证方法

- 对照 spec 的[原版研究](../spec.md#原版研究)逐项核对结论与所需置信度。
- `git status` 确认除本 subtask 文档外没有改动跟踪文件，仓库中没有原版内容、反编译输出或读数。

## 完成证据
