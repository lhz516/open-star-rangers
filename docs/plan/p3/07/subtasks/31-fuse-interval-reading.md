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

- [x] H5 记录线性地址 0x2C 处 f32 的运行时读数、它决定的分支、置信度、运行身份与适用范围。
- [x] 读数来自 `complete` 的合格运行，文件保护与进程回收通过；没有宿主层注入的输入。
- [x] 仓库中没有原版读数原文以外的运行输出、截图或反编译输出；改动文档的 `updated:` 与链接有效。

## 验证方法

- 工具报告的 `complete` 状态与保护证明；文档的链接与元数据检查；git 审阅。

## 完成证据

- **读数来源：** 采用 09 的 v-01、v-02（配方 `p3-07-pilot-v`），没有新的原版运行。逐项核对了两次运行的 `report.json`：`status` 为 `complete`，`reasons` 为空；42 个必需样本全部合格，3 个刺激全部施加；`integrity.passed` 为真，受保护文件没有改动、删除或新增；`cleanup.passed` 为真，进程与进程组都已回收。基准 `manifest-b9bfecb3bf772fbf`，EXE `c1e0f456…`，cycles 为 fixed 40000，core normal；游戏设置 `STARTUP_PRACTICE=FALSE`、`CURR_LEVEL=100 19`。每个暂停点的身份读数为主流程 3、战役、任务序号 0、难度 19、僚机 1、救援 0、作弊 0。输入只有配方中写入 BIOS 键盘缓冲区的三个进入按键，没有宿主层输入。
- **读数与分支：** 两次运行各有三处飞行中暂停（键盘轮询 `0x262c3` 两处、能量更新 `0x30742` 一处），六次读到的值相同，都是 u32 0xF000CE80，即 INT 0Bh 向量 F000:CE80。按 f32 约为 −1.5945 × 10²⁹，小于 150.0，因此选择取半的分支（`G+0x10 SAR 1`）。每个暂停点的 DS 基址都是 0，平坦模型，因此 [EBX + 0x2C] 在 EBX = 0 时就是线性地址 0x2C。佐证：`analysis/f-01.json` 中非制导导弹逐帧的 7 次引信重设都是取半；c-01、m-01 的情况见 09 的完成证据。读数在不同运行和不同暂停点之间没有变化。两次运行的启动时钟状态不同，但都走同一条进入路线，配置也相同，所以进入方式与配置的影响没有测到；H5 已写明这一适用范围。
- **记录：** 在 [executable 的 H5](../../../../original/formats/executable.md#h5-missiles--confirmed-code-unless-marked) 的阶段 2 中写入读数、所选分支、置信度（已确认，运行时；只适用于所测配置）、运行身份与适用范围。同时按 IEEE 编码写明哪些向量会给出完整间隔：0x4316:0000 至 0x7F80:0000。NaN 编码会让 `FCOMP` 引发无效操作异常，启动代码没有屏蔽该异常（见同一文档的 x87 一节），之后的结果没有追踪，标为未确认。其余向量都选择取半。我的核对笔记在被忽略的 `local/research/p3-07/fuse-interval/notes.md`；仓库中除读数本身外没有任何运行输出。
- **检查：** 对 `executable.md` 与本文档做相对链接与锚点检查，0 处失效；`node tools/compliance/cli.ts original` 的索引与工作树扫描（1334 个文件）没有发现问题，唯一失败是 build 范围的 ENOENT，原因是本 worktree 没有 `dist/`，与本项无关。`executable.md` 的 `updated:` 已是 2026-10-10。
- **rubber-duck：** 没有阻塞问题。两条非阻塞意见都已处理：（1）NaN 向量的分支原先写成“未核对”，与前文“≥ 150.0 否则取半”的写法不一致。现在根据已有的只读反汇编（`FCOMP`/`SAHF`/`JNC`）与 x87 一节的异常屏蔽事实，改写为“引发未屏蔽的无效操作异常，之后的结果未确认”。（2）原文只写了样本数，现明确写为“42 个必需样本全部合格”。
- **文档影响：** 只有 H5 需要改。`unknowns.md` 中没有对应条目，U-021 的描述仍然准确；P3-02 spec 的冲突 29 与 20、26 的计划文本由协调者决定是否更新（见报告）。
