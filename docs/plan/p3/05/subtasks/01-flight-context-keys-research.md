---
type: plan
status: active
phase: P3
task: "05"
subtask: "01"
updated: 2026-10-10
---

# 01 — 飞行上下文按键研究（Q-01 飞行部分、Q-02 飞行部分、Q-04 通讯与能量页）

**契约来源：** [spec](../spec.md) 的 S-01，[原版研究](../spec.md#原版研究) Q-01（飞行与前置处理、修饰组合、小键盘）、Q-02（飞行中的 `p` 与 Esc）、Q-04（通讯前置处理与能量页）；[执行检查点](../spec.md#执行检查点)规则 1、3、5 所需的输入；AC-01 的研究部分。
**依赖：** 无。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 按[原版证据指南](../../../../guides/original-evidence.md)只读 Ghidra（私有副本，`-noanalysis -readOnly`）读原生指令，反编译输出只用于导航：飞行按键处理 `0x264a0` 及其前置处理 `0x27b44`、`0x27ab4`。逐码给出动作族、作弊门禁 `0x3cb78` 下的码与无作用的码。
- **修饰组合：** 经 `0x75048` 与 CapsLock 换算后到达飞行处理的码：Shift、Ctrl、Alt（Alt+字母、Alt+空格、Alt+F1–F10）、Ctrl+Enter、Shift+数字、大写字母；DOS Alt 扩展码在飞行中的结果。
- **小键盘：** 各键在 NumLock 开/关与 Shift 下到达的码及其在飞行中的动作（前视别名、视角、速度或无作用），作为 K 规则 3 的输入。
- **目标与武器方向：** `r`/`y` 的方向与 `u` 的原生比较，`/` 与 `?` 的分支，能量 `s`/`g` 及其 Shift 形式；与 P3-07 分支 `p3-07-weapons-damage-spec`（读取时记录提交）中 executable 的 T3、W3、D10 与 P3-02 spec CR-05 对照，不一致时单列并交 P3-07。
- **Q-02 飞行部分：** `p` 在飞行处理中的阻塞循环——哪些键结束它、期间轮询什么；Esc 在飞行中的作用、是否进入选项页。
- **Q-04 飞行部分：** 通讯前置处理中数字、`x`、`0` 与 Shift+数字是否被菜单占用；能量页 `s`/Shift+`s`、`g`/Shift+`g` 与四个能量操作的对应。
- **项目操纵键冲突核查（K 规则 1 的输入）：** `KeyI`/`KeyJ`/`KeyK`/`KeyL` 的码及其 Shift、Ctrl、Ctrl+Shift 组合，在飞行处理与通讯前置处理中有无非作弊的原版作用。逐码核对，不以浏览一条处理链代替全部菜单；Warp 中的核查由 02 完成。
- 每条结论标置信度（已确认（代码）/高概率/未确认）与证据（函数与指令地址、角色）；与 P3-06 分支的记录（“飞行操纵”“速度键”、executable 的 P3-06 各节）不一致时单列并交 P3-06。
- 输出到 `local/research/p3-05/flight/`：逐码表、修饰换算表、地址清单与一份只写结构和结论的摘要，供 04 整理入库。

## 不包含

- Warp、基地、地图的按键处理（02）；地图鼠标（03）；运行样本与自动重复（06、07）。
- 写入 `docs/original/`（04）；检查点 K 的定稿（08）。
- 修改 Ghidra 主项目或以 `-overwrite` 重新导入；任何原版内容、码表原文或反编译进入仓库。

## 关键文件与契约

- 已有记录：[键位表](../../../../original/input/key-map.md)、[executable](../../../../original/formats/executable.md) 的[输入轮询](../../../../original/formats/executable.md#input-polling-p3-0201)与[自动视角](../../../../original/formats/executable.md#automatic-views-and-cameras-p3-0109)、[unknowns](../../../../original/unknowns.md) 的 U-011；P3-06 与 P3-07 分支上的相应记录（见 goal 的[跨任务前提](../goal.md#代码现状与前提)）。
- 工具与环境：`local/ghidra/srangers.gpr`（只读私有副本）；[基准环境](../../../../guides/baseline-environment.md)与[工具](../../../../guides/tools.md)指南。

## 写入范围

- `local/research/p3-05/flight/**`：研究输出（不入库）。

## 验收标准

- [ ] Q-01 飞行部分达到门槛：飞行处理与两个前置处理的逐码动作族、作弊门禁码与无作用码，均为已确认（代码）或写明为何未确认。
- [ ] 修饰组合与 CapsLock 换算、小键盘在 NumLock/Shift 下的码与动作都有结论与证据。
- [ ] `r`/`y`/`u`、`/`/`?`、`s`/`g` 与 P3-07 的结论逐项对照，冲突已单列并注明交接对象。
- [ ] Q-02 与 Q-04 的飞行部分有结论与证据。
- [ ] `I`/`J`/`K`/`L` 及其修饰组合在飞行与通讯前置处理中的作用逐码列出。
- [ ] 仓库没有新增或修改的文件（除本文档的完成证据）；输出只在 `local/research/p3-05/flight/`。

## 验证方法

- 每条结论附函数/指令地址与角色；抽查与已确认记录（输入轮询、自动视角）一致。
- 以 `git status --short` 确认没有研究输出被跟踪；完成证据只写地址、结构、结论与置信度。

## 完成证据
