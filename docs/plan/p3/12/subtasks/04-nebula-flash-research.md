---
type: plan
status: active
phase: P3
task: "12"
subtask: "04"
updated: 2026-10-15
---

# 04 — 星云背景与屏幕闪光研究

**契约来源：** [spec](../spec.md) 的 S-06、S-10、S-13、AC-09、AC-14、AC-18；Q-04、Q-06；[星云背景](../spec.md#星云背景)、[爆炸精灵与屏幕闪光](../spec.md#爆炸精灵与屏幕闪光)。
**依赖：** 无。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **Q-04：** `0x484f0` 的六个方向；`0x489d0` 的屏幕位置、旋转角与可见判定；`0x5b54c` 旋转表 `0x1b2b20` 的镜像与转置读法；`0x488b4` 的清除。用已有截图做逐色匹配（方法同 P3-03/21），并据此核对 U-018 中“在 DATA 下颜色不对”的目视判断。
- **Q-06：** `0x48d64`、`0x48dbc`、`0x48e14` 各自的调用者与门禁（玩家受击、`0x24314` 的表现项 4 (2, 6)、第三种）；`0x48e6c` 的节奏、并发与覆盖规则；`0x48f14` 的调色板写入公式与作用范围；RENS 三组字段的时间单位换算（`drawIntervalTicks` 加到哪个时钟）。用截图 044、120 核对。
- 结论写入 `local/research/p3-12/nebula-flash/findings.md`：英文，按目标文档与节写成可直接并入的草稿，每条带置信度与证据（函数地址、结构、计数），不含原版内容、反编译输出或读数原值；受影响的 U 项变化一并列出。由 08 统一写入 `docs/original/`，本项不改跟踪的原版文档，使 01 至 06 可以并行。
- Ghidra 以 `-noanalysis -readOnly` 在 `local/research/p3-12/nebula-flash/` 中的私有只读副本上运行，不 `-overwrite`；寄存器相关步骤按原生指令读取，调用者以相对调用与 32 位值的原始扫描核对。先复用已有记录与 `local/research/` 中的研究输出，不重做已确认的分析。
- 静态证据达不到 spec 所需结论的项，在完成证据中列出缺口、已尝试的途径与建议的最小补证，交 07 判断；不按猜测写结论。

## 不包含

- 实现（19、21）。

## 关键文件与契约

- 起点：[textures §4](../../../../original/formats/textures.md#4-bitm-bitmaps-confirmed-structure)、[数据闭包](../../../../original/formats/executable.md#data-loaded-by-the-loop-p3-0110)、[RENS 头部](../../../../original/formats/executable.md#flight-message-strings-and-the-rens-header-p3-0304)；本地截图 `local/StarRang/captures/`。
- 计划新增：`local/research/p3-12/nebula-flash/`（被忽略）。

## 写入范围

- `local/research/p3-12/nebula-flash/**`：脚本、截图匹配输出、私有项目副本与 findings 草稿。

## 验收标准

- [ ] Q-04 的方向、位置、读法、可见判定与清除达到已确认（代码），截图匹配结果与 U-018 的判断如实记录。
- [ ] Q-06 的三种闪光的触发者、节奏、覆盖与调色板公式达到已确认，字段的时间单位已换算。
- [ ] findings 草稿完整，没有改动跟踪的原版文档。

## 验证方法

- 对照 spec 的[原版研究](../spec.md#原版研究)逐项核对结论与所需置信度。
- `git status` 确认除本 subtask 文档外没有改动跟踪文件，仓库中没有原版内容、反编译输出或读数。

## 完成证据
