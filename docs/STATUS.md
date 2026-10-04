---
type: status
status: active
phase: all
updated: 2026-10-04
---

# 项目进度

**当前阶段：P2 玩法所需资源管线**（P2-01 的候选资格证据已完成，回退候选待用户重新批准；P1 本地退出评审已通过，P0 其余项目并行收尾）

本文件是项目总进度入口，只记录当前阶段、阶段状态摘要、任务索引入口、下一步与项目级阻塞，不跟踪阶段退出条件或任务执行状态。阶段范围和退出条件由[总计划 §12](./plan/master-plan.md#12-开发阶段与验收条件)定义，任务状态见各 goal，验收证据见 subtask 文档，最终退出判定见[阶段评审](./reviews/)。

## 阶段总览

| 阶段 | 状态 | 任务 | 评审记录 |
|---|---|---|---|
| P0 基准与可行性 | 可行性评审已通过，其余项目并行收尾 | —（未设置任务索引） | [P0-feasibility](./reviews/P0-feasibility.md) |
| P1 工程与运行骨架 | 本地退出评审已通过 | [P1 tasks](./plan/p1/tasks.md) | [P1-exit](./reviews/P1-exit.md) |
| P2 玩法所需资源管线 | 进行中；P2-01 回退候选待批准 | [P2 tasks](./plan/p2/tasks.md) | — |
| P3 完整玩法切片 | 未开始（可与 P2 重叠） | [P3 tasks](./plan/p3/tasks.md) | — |
| P4 Classic 内容完成 | 未开始 | [P4 tasks](./plan/p4/tasks.md) | — |
| P5 Classic 1.0 发布 | 未开始 | [P5 tasks](./plan/p5/tasks.md) | — |
| P6 Enhanced 美化 | 未开始 | [P6 tasks](./plan/p6/tasks.md) | — |

## 下一步

1. P2：P2-01 的候选资格证据已完成。玩家相对敌我分类确认第一关恰有两种敌方模型；S-02 选出回退候选 group 0 / slot 1（SCEN 3019）。下一步修订 spec 选择记录，经另一模型审阅后请用户重新批准；批准前不开始 02–07。不以来源计数替代规范比较，不重复要求用户通关或测试已确认的玩法流程。
2. P0 收尾（用户）：试玩回答 U-011、U-013，反馈流畅度以校准 cycles（U-021）；确定目标测试设备。U-025、U-015 的剩余部分见 [unknowns](./original/unknowns.md)。
3. U-022 剩余字段（阵营、基地能力、结果和空间语义）在 P2 中继续，模型槽位选择已确认，见 [executable](./original/formats/executable.md) §4。
4. P3 行为研究新增 U-031：战役被毁可进入救援，真实失败/重试条件仍未确认，见 [B-005](./original/behavior/B-005-campaign-rescue.md)；不复用练习模式被毁即失败。

## 阻塞项

- P2-01 的回退候选 group 0 / slot 1 待用户重新批准；这是 S-02 规定的审批关卡，不是新的研究阻塞。已观察图像的等价来源集合、敌我分类与选择证据见 [subtask 01](./plan/p2/01/subtasks/01-candidate-qualification.md#当前资格证据覆盖)，审批状态见 [P2-01 goal](./plan/p2/01/goal.md#执行记录)。
