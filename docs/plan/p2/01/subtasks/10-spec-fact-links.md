---
type: plan
status: active
phase: P2
task: "01"
subtask: "10"
updated: 2026-10-04
---

# 10 — spec 候选记录的事实归属修订

**契约来源：** [spec](../spec.md) 的 S-12；AC-13；[AGENTS.md](../../../../../AGENTS.md) 的“一个事实只写一处”。缺口由 [07 第一次最终对齐](./07-final-alignment.md#完成证据)发现；用户已于 2026-10-04 选择修订 spec。
**依赖：** 01。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 修订 spec 的[候选选择记录](../spec.md#候选选择记录)，保留以下契约内容：
  - 结构选择 group 0 / slot 1；
  - 基准难度组、僚机配置与角色要求。
- SCEN 条目，以及 M2ID 槽位与角色的对应，改为链接 `docs/original/` 中的权威记录，不在 spec 中复述。
- 检查 spec 其余段落是否还有复述的原版事实，一并改为链接。
- 修订使 spec 回到 `draft`。修订稿须经另一模型按 review-spec 的清单审阅，写入 `reviewed` 标记；用户重新批准后，spec 恢复 `accepted`。

## 不包含

- 不改变候选、角色、配置、S/AC 或其他契约内容。
- 不修改 `docs/original/` 中的事实；只有链接锚点需要时才调整这些文档的标题或锚点。

## 关键文件与契约

- [spec](../spec.md)；权威记录为 [scenario §4](../../../../original/formats/scenario.md#4-scct-campaign-table-confirmed-structure-likely-meaning) 与 [executable](../../../../original/formats/executable.md#player-target-modes-and-enemy-classification)。

## 验收标准

- [ ] spec 只链接原版事实，不再复述 SCEN 条目与 M2ID 槽位；选择结论与契约不变。
- [ ] 修订稿经另一模型审阅并写入 `reviewed` 标记，用户重新批准后 spec 恢复 `accepted`。
- [ ] 文档链接与元数据检查通过。

## 验证方法

- 文档链接、锚点、front matter 与 `node tools/task-state.ts p2/01` 检查；不适用 browser-testing。

## 完成证据
