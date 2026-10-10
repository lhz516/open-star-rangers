---
type: plan
status: active
phase: P3
task: "06"
subtask: "05"
updated: 2026-10-09
---

# 05 — 原版研究：起飞初始状态

**契约来源：** [spec](../spec.md) 的 S-01、S-07、AC-09；[原版研究](../spec.md#原版研究)的 M-09；[起飞初始状态](../spec.md#起飞初始状态)。
**依赖：** 03。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

用只读 Ghidra 回答 M-09，结论写入被忽略的 `local/research/p3-06/initial/findings.md`（英文，只记地址、类型、作用与置信度，供 21 写入 `docs/original/`），并在完成证据中摘要：

- 所选任务开局时玩家的放置路线、姿态、移动模式、油门、初速与各标志（沿用 03 关于 `0x2c3b0` 与油门表的结论）；
- 控制器构造时的初值，以及速度辅助与自动匹配的初值（沿用 03 的开关结论）；
- 实例化中的目标初始化 `0x68050` 是否写入玩家目标引用 +0x8C；区分玩家引用、AI 目标与手动选择；
- 区分三个时刻的状态：实例化完成且尚未运动、首次可操纵更新、首次运动之后；
- 原版取样从随机值起算（[时基](../../../../original/formats/executable.md#simulation-time-base-p3-0106)）：绝对取样时间如何换算为任务相对时间，供 17 与 18 对照。
- **为检查点 A 与 07 准备：** 在完成证据中列出初态的候选字段与初值，标明哪些依赖 P3-07 或 P3-08 的规则；给出 07 读取初态的暂停点建议。
- **记录：** findings 中标明每条结论应写入的原版文档与受影响的 U 项（负责阶段不改），由 21 入档；脚本与输出在 `local/research/p3-06/initial/`。
- **冲突处理：** 若玩家目标初值依赖 P3-08 的目标初始化，写明依赖，交检查点 A 解决任务边界。

## 不包含

- 离港与救援放置（P3-10、P3-11）。
- 实现（10）；运行时读数（07、17）。

## 关键文件与契约

- [executable](../../../../original/formats/executable.md) 的[实例化](../../../../original/formats/executable.md#instantiation-p3-0203)与[放置](../../../../original/formats/executable.md#placement-mappings-p3-0202)各节；03 的完成证据。
- [B-007](../../../../original/behavior/B-007-mission-instantiation.md)（未运行核对姿态与初速）。
- 计划新增：被忽略的 `local/research/p3-06/initial/findings.md`；入档由 21 完成。

## 写入范围

- `local/research/p3-06/initial/**`：Ghidra 脚本、输出、findings 与私有项目副本（被忽略）。

## 验收标准

- [ ] M-09 达到“已确认（代码）”；目标初值的来源与任务边界已写明，不预设为 null。
- [ ] 完成证据给出检查点 A 所需的初态候选字段与初值，以及 07 的暂停点建议。
- [ ] findings 标明每条结论应写入的原版文档与 U 项；仓库中没有新增的跟踪文件，也没有原版载荷、常量值、反编译输出或读数。

## 验证方法

- 逐条核对结论所依据的原生指令与调用者扫描；输出与脚本留在 `local/research/p3-06/initial/`。
- `git status` 确认没有跟踪的研究输出。不涉及浏览器。

## 完成证据
