---
type: status
status: active
phase: all
updated: 2026-10-05
---

# 项目进度

**当前阶段：P2 玩法所需资源管线**（P2-01 切片资源边界与内容契约、P2-02 CCD/IMG 与 ISO9660 按需读取、P2-03 NOB、基准版本识别与输入校验已完成；P1 本地退出评审已通过，P0 其余项目并行收尾）

本文件是项目总进度入口，只记录当前阶段、阶段状态摘要、任务索引入口、下一步与项目级阻塞，不跟踪阶段退出条件或任务执行状态。阶段范围和退出条件由[总计划 §12](./plan/master-plan.md#12-开发阶段与验收条件)定义，任务状态见各 goal，验收证据见 subtask 文档，最终退出判定见[阶段评审](./reviews/)。

## 阶段总览

| 阶段 | 状态 | 任务 | 评审记录 |
|---|---|---|---|
| P0 基准与可行性 | 可行性评审已通过，其余项目并行收尾 | —（未设置任务索引） | [P0-feasibility](./reviews/P0-feasibility.md) |
| P1 工程与运行骨架 | 本地退出评审已通过 | [P1 tasks](./plan/p1/tasks.md) | [P1-exit](./reviews/P1-exit.md) |
| P2 玩法所需资源管线 | 进行中；P2-01、P2-02、P2-03 已完成 | [P2 tasks](./plan/p2/tasks.md) | — |
| P3 完整玩法切片 | 未开始（可与 P2 重叠） | [P3 tasks](./plan/p3/tasks.md) | — |
| P4 Classic 内容完成 | 未开始 | [P4 tasks](./plan/p4/tasks.md) | — |
| P5 Classic 1.0 发布 | 未开始 | [P5 tasks](./plan/p5/tasks.md) | — |
| P6 Enhanced 美化 | 未开始 | [P6 tasks](./plan/p6/tasks.md) | — |

## 下一步

1. P2：P2-01、P2-02、P2-03 已完成。
   - [P2-01](./plan/p2/01/goal.md#子任务跟踪)：切片候选与唯一生产切片定义、来源映射边界、完整性/预算/所有权契约及合成契约测试。
   - [P2-02](./plan/p2/02/goal.md#子任务跟踪)：纯字节读取端口、CloneCD/原始扇区/ISO9660 按需读取、浏览器 Blob 与 Node 适配、本地核对 CLI。基准盘 50 个游戏文件经读取链核对一致，结构事实见 [disc-image](./original/formats/disc-image.md)。
   - [P2-03](./plan/p2/03/goal.md#子任务跟踪)：严格 IMFAT 规则与按需封包读取、生产版本白名单与来源指纹、已验证来源产品入口、来源映射核验、底层能力边界与本地核对 CLI。基准盘 9 个 NOB 共 1,857 个条目全部通过校验，结构事实见 [imfat](./original/formats/imfat.md)。

   下一步按[推荐执行顺序](./plan/p2/tasks.md#推荐执行顺序)并行进行 P2-04（Worker 导入协议与生命周期）与 P2-10（IndexedDB 最小资源缓存），各自先编写 spec 并取得批准。读取和转换任务须在消费不可信输入前批准各自的预算限值。
2. P0 收尾（用户）：试玩回答 U-011、U-013，反馈流畅度以校准 cycles（U-021）；确定目标测试设备。U-025、U-015 的剩余部分见 [unknowns](./original/unknowns.md)。
3. U-022 剩余字段（阵营、基地能力、结果和空间语义）在 P2 中继续，模型槽位选择已确认，见 [executable](./original/formats/executable.md) §4。
4. P3 行为研究新增 U-031：战役被毁可进入救援，真实失败/重试条件仍未确认，见 [B-005](./original/behavior/B-005-campaign-rescue.md)；不复用练习模式被毁即失败。

## 阻塞项

- 无项目级阻塞。
