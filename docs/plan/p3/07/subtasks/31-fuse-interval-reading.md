---
type: plan
status: active
phase: P3
task: "07"
subtask: "31"
updated: 2026-10-10
---

# 31 — 无制导导弹引信检查间隔的运行时读数

**契约来源：** [spec](../spec.md) 的 S-11、AC-15；P3-02 spec 的 [CR-11](../../02/spec.md#cr-11-表现层的归属与已批准的差异d-01)（冲突 29：生产取值须按原版运行时读数设定）；[executable 的 H5](../../../../original/formats/executable.md#h5-missiles--confirmed-code-unless-marked)。
**依赖：** 09。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 背景

协调者在执行中新增本项（2026-10-10，依用户对新增解除阻塞子任务的预先授权，不需审阅）。无制导导弹的引信检查间隔取决于线性地址 0x2C 处的 f32（DOS/4GW 下为 INT 0Bh 中断向量表的字）。20 须按该读数设定生产取值。09 的写入范围不含 `executable.md`；若等 26 记录，20 要排在 09 → 10 → 26 之后。本项只把读数记入 H5，使 20 不必等待正式运行。

## 工作范围

- **取得读数：** 若 09 的预实验已在飞行中读取线性地址 0x2C 处的 f32，采用该读数：核对运行为 `complete`，并核对其 cycles、游戏设置与基准哈希。否则用 `tools/baseline/` 做一次有界的私有运行取得读数：可以用模拟器内输入进入飞行，以 `--evidence local/research/p3-07/fuse-interval` 只保护本项目录，并遵守 DOSBox-X 的会话锁。
- **判定：** 记录读数决定的分支（间隔是否减半），以及该值是否随进入方式、运行或配置变化。若不同运行读数不同，写明各自的条件，不择一。
- **记录：** 写入 executable 的 H5，带置信度（运行时读数为已确认，运行时）、运行身份（配方指纹、cycles、设置）与适用范围。U-021 尚未冻结，注明结果只适用于所测配置。
- 读数、运行目录与笔记只存放在 `local/research/p3-07/fuse-interval/`（若采用 09 的读数，只引用其运行目录）。

## 不包含

- 20 的实现与参数化（20）；B 文档的样本与判据（10、26）。
- 修改 `tools/baseline/`。所需能力不足时，报告协调者，不在本项扩展工具。

## 关键文件与契约

- [executable 的 H5](../../../../original/formats/executable.md#h5-missiles--confirmed-code-unless-marked)；[运行时测量指南](../../../../guides/runtime-measurement.md)，包括[模拟器内输入](../../../../guides/runtime-measurement.md#模拟器内输入)。
- 09 的完成证据与 `local/research/p3-07/pilot/` 的运行目录。

## 写入范围

- `docs/original/formats/executable.md`：H5 的运行时读数与适用范围。
- `local/research/p3-07/fuse-interval/**`：配方、运行目录与笔记（被忽略）。

## 验收标准

- [ ] H5 记录线性地址 0x2C 处 f32 的运行时读数、它决定的分支、置信度、运行身份与适用范围。
- [ ] 读数来自 `complete` 的合格运行，文件保护与进程回收通过；没有宿主层注入的输入。
- [ ] 仓库中没有原版读数原文以外的运行输出、截图或反编译输出；改动文档的 `updated:` 与链接有效。

## 验证方法

- 工具报告的 `complete` 状态与保护证明；文档的链接与元数据检查；git 审阅。

## 完成证据
