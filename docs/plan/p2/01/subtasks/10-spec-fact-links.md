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

- [x] spec 只链接原版事实，不再复述 SCEN 条目与 M2ID 槽位；选择结论与契约不变。
- [x] 修订稿经另一模型审阅并写入 `reviewed` 标记，用户重新批准后 spec 恢复 `accepted`。
- [x] 文档链接与元数据检查通过。

## 验证方法

- 文档链接、锚点、front matter 与 `node tools/task-state.ts p2/01` 检查；不适用 browser-testing。

## 完成证据

- **修订内容：** [spec 候选选择记录](../spec.md#候选选择记录)
  - **保留：** 结构选择 group 0 / slot 1、基准难度组、僚机可选、逻辑角色，以及资源角色构成（1 个玩家模型、恰好 2 个敌机模型、1 个基地模型、1 个额外引用的友方模型）。
  - **改为链接：** SCEN 条目，以及 M2ID 槽位与角色的对应，改为链接 [scenario 候选来源概况](../../../../original/formats/scenario.md#campaign-candidate-source-profiles-confirmed-structure)、[executable 敌我分类](../../../../original/formats/executable.md#player-target-modes-and-enemy-classification) 与 [slot-1 交互种类证据](../../../../original/formats/executable.md#bounded-slot-1-interaction-kind-evidence)。
  - **审批记录：** 上一条审批记录中的 SCEN 条目同样删除，并在新的修订记录中说明。
  - **基础段落未改：** spec“当前实现与依据”中关于共用 slot 0 结构的陈述早于本任务，带置信度和链接，不属于 AC-13 所说的新研究事实，审阅者确认可以保留。
- **核对：**
  - 修订后 spec 中已没有 SCEN 条目号、M2ID 角色槽位、地址或同类数值；
  - 生产定义与 [01 资格证据](./01-candidate-qualification.md#当前资格证据覆盖)仍与 spec 一致；
  - S/AC、候选、配置、角色与数量范围都没有变化；
  - `docs/original/` 没有改动。
- **审阅与批准：**
  - 独立审阅者（rubber-duck）按 review-spec 清单只读审阅整份 spec 与修订差异，没有发现问题，确认每个链接的权威章节都包含所引用的事实；这次审阅即本子任务的 rubber-duck 审查。
  - 随后运行 `node tools/task-state.ts docs/plan/p2/01/spec.md --mark-reviewed` 写入标记，工具状态转为等待用户批准。
  - 用户于 2026-10-04 明确选择“批准修订”，spec 恢复 `accepted`，审批记录已同步到 spec 与 [goal](../goal.md#审批)。
  - simplify 不适用（仅文档）。
- **验证：**
  - 文档链接与锚点检查通过；
  - `node tools/task-state.ts p2/01` 在批准后回到 execute-goal；
  - `git diff --check` 通过；
  - 不适用 browser-testing。
- **文档影响：** 只修改了 spec 和本 goal 的审批记录。STATUS 的下一步将在 07 重跑后统一更新。
