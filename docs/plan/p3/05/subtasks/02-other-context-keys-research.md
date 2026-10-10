---
type: plan
status: active
phase: P3
task: "05"
subtask: "02"
updated: 2026-10-10
---

# 02 — Warp、基地与地图上下文按键研究（Q-01、Q-02、Q-04 其余部分）

**契约来源：** [spec](../spec.md) 的 S-01，[原版研究](../spec.md#原版研究) Q-01（Warp `0x27360`、基地 `0x271e0`、地图 `0x27118`）、Q-02（这些上下文中的 `p` 与 Esc）、Q-04（基地按键）；[执行检查点](../spec.md#执行检查点)规则 1 的 Warp 部分；AC-01 的研究部分。
**依赖：** 无。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 只读 Ghidra（私有副本，`-noanalysis -readOnly`）读原生指令：Warp `0x27360`、基地 `0x271e0`、地图 `0x27118` 的按键处理，逐码给出动作族、作弊门禁与无作用的码；修饰组合与小键盘在这些上下文中到达的码（换算本身由 01 记录，本项只记录各上下文对其结果的处理）。
- **Q-02：** 各上下文是否处理 `p`；Esc 在 Warp、基地与地图中的作用，是否进入选项页；地图中 `p` 与 Esc 的处理与 [B-001](../../../../original/behavior/B-001-strategic-map.md) 的观察对照。
- **Q-04 基地部分：** 上、下、Enter、数字与 `l` 的处理及其与[自动视角](../../../../original/formats/executable.md#automatic-views-and-cameras-p3-0109)“基地的两个选择键为上、下”的关系。
- **项目操纵键冲突核查（Warp）：** 原版 Warp 中读取摇杆轴；核对 `KeyI`/`KeyJ`/`KeyK`/`KeyL` 及其 Shift、Ctrl、Ctrl+Shift 组合在 Warp 处理中有无非作弊作用（K 规则 1 的输入）。
- 每条结论标置信度与证据；与 P3-06 的记录不一致时单列并交 P3-06。
- 输出到 `local/research/p3-05/contexts/`：逐码表、地址清单与只写结构和结论的摘要，供 04 整理入库。

## 不包含

- 飞行处理、前置处理、修饰换算与小键盘码本身（01）；地图鼠标 `0x27800`（03）；运行样本（06）。
- 写入 `docs/original/`（04）；K 定稿（08）。

## 关键文件与契约

- 已有记录：[键位表](../../../../original/input/key-map.md)、[executable](../../../../original/formats/executable.md)、[B-001](../../../../original/behavior/B-001-strategic-map.md)、[B-004](../../../../original/behavior/B-004-base-communications.md)、[B-005](../../../../original/behavior/B-005-campaign-rescue.md)。
- 工具：`local/ghidra/srangers.gpr`（只读私有副本）。

## 写入范围

- `local/research/p3-05/contexts/**`：研究输出（不入库）。

## 验收标准

- [ ] Q-01 的 Warp、基地、地图三个处理的逐码动作族、作弊门禁码与无作用码达到门槛（已确认（代码）或写明为何未确认）。
- [ ] Q-02：各上下文对 `p` 与 Esc 的处理有结论与证据。
- [ ] Q-04：基地的上、下、Enter、数字与 `l` 有结论与证据。
- [ ] `I`/`J`/`K`/`L` 及其修饰组合在 Warp 中的作用逐码列出。
- [ ] 仓库没有新增或修改的文件（除本文档的完成证据）。

## 验证方法

- 每条结论附地址与角色；与 B-001、B-004 的观察逐项对照，不一致处写明哪一方是代码证据。
- `git status --short` 确认没有研究输出被跟踪。

## 完成证据
