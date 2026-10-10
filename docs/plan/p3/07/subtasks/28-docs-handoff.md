---
type: plan
status: active
phase: P3
task: "07"
subtask: "28"
updated: 2026-10-09
---

# 28 — 文档与交接

**契约来源：** [spec](../spec.md) 的 S-12、AC-17；[与其他任务的接口](../spec.md#与其他任务的接口)。
**依赖：** 25, 27。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **Core 模块说明（[core.md](../../../../engineering/modules/core.md)）：** 记录以下内容：
  - 新 API（`createWorld` 的 `ruleData`、`ReplayContent`）；
  - 阶段责任与直接创建的例外；
  - 实体的战斗状态、领域事件、`combat` 分区与原因码的对应关系；
  - 上限及其依据；
  - 高概率结论的标注，以及 27 与研究得出的已知差异。
- **交接：** 在 core.md 的交接节分别写明给以下任务的内容：
  - P3-04：规则数据的传入与碰撞可视化；
  - P3-05：开火采样与 `u` 的键位；
  - P3-06：积分器、`flight` 分区、最高速度读取的子系统状态与能量字段；
  - P3-08：AI 开火与选目标的入口；
  - P3-09：Warp 能量与 +0xCC；
  - P3-10：修理与补给的资源读写；
  - P3-11：被毁、耗尽、到期的事件与具名状态，救援的初始化重用；
  - P3-12：爆炸、碎片与受击效果；
  - P3-13：雷达与 HUD 读数；
  - P3-14：音效请求。
  同时替换 P3-02 写给 P3-07 的交接内容。
- **工程文档：**
  - [source-structure.md](../../../../engineering/source-structure.md) 列出新模块；
  - [content.md](../../../../engineering/modules/content.md) 记录 Core 消费的规则数据读取器；
  - [engineering README](../../../../engineering/README.md) 只在约定变化时修改。
- 所改文档的 `updated:` 与链接正确。

## 不包含

- 原版事实（`docs/original/`，已由 01 至 07 与 26 写入）。
- `docs/STATUS.md`、阶段索引与 goal（协调者维护）。
- 修改其他任务的 spec 或 goal。

## 关键文件与契约

- 现有：[core.md](../../../../engineering/modules/core.md)、[source-structure.md](../../../../engineering/source-structure.md)、[content.md](../../../../engineering/modules/content.md)、[engineering README](../../../../engineering/README.md)。
- 11 至 27 的完成证据。

## 写入范围

- `docs/engineering/modules/core.md`：API、阶段、状态、事件、分区、上限、差异与交接。
- `docs/engineering/source-structure.md`：新模块。
- `docs/engineering/modules/content.md`：Core 消费的规则数据。
- `docs/engineering/README.md`：仅在约定变化时修改。

## 验收标准

- [ ] AC-17：Core 模块说明记录新的 API、阶段责任、实体战斗状态、事件、分区、原因码的对应关系、上限依据与已知差异。
- [ ] AC-17：向 P3-04、P3-05、P3-06、P3-08、P3-09、P3-10、P3-11、P3-12、P3-13、P3-14 的交接分别写明。
- [ ] AC-17：工程文档同步，`updated:` 与链接正确；`pnpm check` 通过。

## 验证方法

- 文档审阅，对照 08 的 P3-02 修订与实际代码；链接与元数据检查；`pnpm check`。

## 完成证据
